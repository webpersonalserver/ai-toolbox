"""Idiom typo levels: an idiom is shown with one character swapped for a common look/sound-alike;
pick the correct character from an 8-character board of homophones.

- Stages reuse the idiom tiers (idioms.txt) mapped to school stages; primary-school levels also
  show the masked explanation as an extra clue.
- scripts/data/typo_common.txt lists well-known real-world mistakes, placed first in each stage.
- A swap is rejected whenever the "wrong" form is itself listed in the idiom dictionary
  (variant spellings such as 莫明其妙 must never be marked wrong).
- Hints eliminate wrong board characters in a fixed, pre-shuffled order (eliminationOrder).
"""
import json
import random
import sys
import unicodedata
from collections import defaultdict
from pathlib import Path

from . import idiom as idiom_builder
from .common import DATA_DIR, Candidate, read_stage_blocks, text_difficulty

GAME_TYPE = "typo"
BOARD_SIZE = 8
WRONG_CHAR_RANK_LIMIT = 2500
DISTRACTOR_RANK_LIMIT = 2000
STAGE_BY_IDIOM_TIER = ["小学", "初中", "高中", "进阶", "进阶"]
STAGE_ORDER = ["小学", "初中", "高中", "进阶"]
CLUE_HINT_STAGES = {"小学"}
CURATED_FIRST, AUTO_GENERATED = 0, 1


def normalize_pinyin(syllable):
    return syllable.replace("ɡ", "g").strip().lower()


def toneless(syllable):
    return "".join(char for char in unicodedata.normalize("NFD", syllable) if unicodedata.category(char) != "Mn")


def load_char_index(data_dir, char_rarity):
    words = json.loads((Path(data_dir) / "xinhua" / "word.json").read_text(encoding="utf-8"))
    by_syllable, by_toneless = defaultdict(list), defaultdict(list)
    chars = []
    for item in words:
        char = item["word"]
        if len(char) != 1 or not item.get("pinyin"):
            continue
        syllable = normalize_pinyin(item["pinyin"].split()[0])
        by_syllable[syllable].append(char)
        by_toneless[toneless(syllable)].append(char)
        chars.append(char)
    rank = {char: index for index, char in enumerate(sorted(set(chars), key=char_rarity))}
    return by_syllable, by_toneless, rank


def read_curated():
    curated = {}
    for stage in read_stage_blocks(DATA_DIR / "typo_common.txt"):
        for entry in stage["entries"]:
            word, change = entry.split("|")
            right, wrong = change.split(">")
            curated[word] = {"stage": stage["name"], "right": right, "wrong": wrong}
    return curated


INITIALS = ("zh", "ch", "sh", "b", "p", "m", "f", "d", "t", "n", "l", "g", "k", "h", "j", "q", "x", "r", "z", "c", "s", "y", "w")


def initial_of(syllable):
    plain = toneless(syllable)
    return next((initial for initial in INITIALS if plain.startswith(initial)), "")


def build_board(word, right, wrong, syllable, wrong_syllable, by_toneless, rank, idiom_words, rng):
    """Distractors: homophones of the right char → homophones of the wrong char → same-initial common chars."""
    position = word.index(right)

    def is_usable(char):
        forms_dictionary_variant = word[:position] + char + word[position + 1:] in idiom_words
        return (char not in word and char != wrong and not forms_dictionary_variant
                and rank.get(char, 10 ** 9) < DISTRACTOR_RANK_LIMIT)

    def by_rank(chars):
        return sorted((char for char in chars if is_usable(char)), key=lambda char: rank[char])

    same_initial = [char for key, chars in by_toneless.items() if initial_of(key) == initial_of(syllable) for char in chars]
    pools = [by_toneless[toneless(syllable)], by_toneless[toneless(wrong_syllable)], same_initial]
    distractors = list(dict.fromkeys(char for pool in pools for char in by_rank(pool)))[: BOARD_SIZE - 1]
    if len(distractors) < BOARD_SIZE - 1:
        return None
    board = [right] + distractors
    rng.shuffle(board)
    wrong_indices = [index for index, char in enumerate(board) if char != right]
    rng.shuffle(wrong_indices)
    return board, wrong_indices


def choose_auto_swap(word, syllables, by_syllable, rank, idiom_words):
    best = None
    for position, char in enumerate(word):
        options = sorted(
            (option for option in by_syllable[syllables[position]]
             if option != char and option not in word and rank.get(option, 10 ** 9) < WRONG_CHAR_RANK_LIMIT),
            key=lambda option: rank[option],
        )
        for option in options:
            if word[:position] + option + word[position + 1:] in idiom_words:
                continue
            if best is None or rank[option] < rank[best[1]]:
                best = (position, option)
            break
    return best


def build_candidates(data_dir, char_rarity, is_common_char):
    dataset = json.loads((Path(data_dir) / "xinhua" / "idiom.json").read_text(encoding="utf-8"))
    idiom_words = {item["word"] for item in dataset}
    idioms_by_word = {item["word"]: item for item in dataset}
    by_syllable, by_toneless, rank = load_char_index(data_dir, char_rarity)
    syllable_of_char = {char: syllable for syllable, chars in by_syllable.items() for char in chars}
    curated = read_curated()
    idiom_candidates = {candidate.answer: candidate for candidate in idiom_builder.build_candidates(data_dir, char_rarity, is_common_char)}

    problems, candidates = [], []
    words = list(dict.fromkeys(list(curated) + list(idiom_candidates)))
    for word in words:
        item = idioms_by_word.get(word)
        if not item:
            problems.append(f"{word}: not in idiom dataset")
            continue
        syllables = [normalize_pinyin(part) for part in item["pinyin"].split()]
        if len(syllables) != len(word):
            continue
        entry = curated.get(word)
        if entry:
            if entry["right"] not in word:
                problems.append(f"{word}: {entry['right']} not in idiom")
                continue
            position, wrong = word.index(entry["right"]), entry["wrong"]
            stage, origin = entry["stage"], CURATED_FIRST
        else:
            swap = choose_auto_swap(word, syllables, by_syllable, rank, idiom_words)
            if not swap:
                continue
            position, wrong = swap
            stage, origin = STAGE_BY_IDIOM_TIER[idiom_candidates[word].tier], AUTO_GENERATED
        wrong_form = word[:position] + wrong + word[position + 1:]
        if wrong_form in idiom_words:
            problems.append(f"{word}: wrong form {wrong_form} is a dictionary variant")
            continue
        right = word[position]
        wrong_syllable = syllable_of_char.get(wrong, syllables[position])
        board_result = build_board(
            word, right, wrong, syllables[position], wrong_syllable, by_toneless, rank, idiom_words, random.Random(word)
        )
        if not board_result:
            if entry:
                problems.append(f"{word}: not enough common homophones of {right} for an {BOARD_SIZE}-char board")
            continue
        board, elimination_order = board_result
        explanation = idiom_builder.explanation_of(word)
        fields = {
            "answer": right,
            "clue": wrong_form,
            "idiom": word,
            "wrongChar": wrong,
            "wrongPosition": position,
            "pinyin": item["pinyin"],
            "explanation": explanation,
            "stage": stage,
            "board": board,
            "eliminationOrder": elimination_order,
        }
        if stage in CLUE_HINT_STAGES:
            fields["clueHint"] = idiom_builder.mask_answer(explanation, word, is_common_char)
        candidates.append(Candidate(
            key=word,
            tier=STAGE_ORDER.index(stage),
            score=(origin, round(text_difficulty(word, char_rarity), 6)),
            answer=right,
            dedupe_key=word,
            fields=fields,
        ))
    if problems:
        sys.exit("[typo] invalid curated entries:\n  " + "\n  ".join(problems))
    return candidates


def level_key_of(level):
    return level["sourceKey"]


def level_dedupe_of(level):
    return level["idiom"]
