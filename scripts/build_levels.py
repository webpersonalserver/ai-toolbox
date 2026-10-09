"""Build idiom levels for cloud database import.

Usage:
    python3 scripts/build_levels.py <path/to/idiom.json> <target_total_levels>

idiom.json comes from https://github.com/pwxcoo/chinese-xinhua (data/idiom.json).
Output: database/levels.jsonl (JSON Lines, importable from the cloud console).

Append-only:
  Levels already in database/levels.jsonl are kept byte-for-byte. Player progress is stored by
  level number, so renumbering or changing an existing level would corrupt everyone's progress.
  New idioms are appended after the last level and must be harder than what is already there:
  add them as a new "# tier N" block at the end of idioms.txt. The script refuses to append an
  idiom that would sit below the existing difficulty (see find_out_of_order_words).
  To rebuild from scratch (only before launch), delete database/levels.jsonl first.

Difficulty ordering:
  1. scripts/idioms.txt groups idioms into tiers ("# tier N" headers), easiest first.
     Tiers carry human judgement of how familiar an idiom is, which no field in the dataset captures.
  2. Inside a tier, idioms are sorted by character rarity (rarer characters = harder),
     using character frequencies counted over every explanation and example in the dataset.
"""
import json
import math
import random
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PICKED_FILE = ROOT / "scripts" / "idioms.txt"
CLUE_OVERRIDES_FILE = ROOT / "scripts" / "clue_overrides.json"
OUTPUT_FILE = ROOT / "database" / "levels.jsonl"

GAME_TYPE = "idiom"
ANSWER_LENGTH = 4
BOARD_SIZE = 24
MASK_CHAR = "□"
COMMON_CHAR_COUNT = 300
TIER_HEADER = re.compile(r"^#\s*tier\s*(\d+)", re.IGNORECASE)


def clean_text(text):
    text = re.sub(r"[“”\"]", "", text or "")
    return re.sub(r"\s+", "", text).strip("。；， ") + "。"


def mask_answer(text, answer, is_common_char):
    """Hide answer words in the clue without wrecking readability.

    Two-character fragments of the answer are always hidden. Single answer characters are hidden
    only when uncommon; common ones (一、不、人…) stay, otherwise the clue becomes mostly □.
    If three or more answer characters would still show, everything is hidden as a fallback.
    """
    for start in range(len(answer) - 1):
        text = text.replace(answer[start:start + 2], MASK_CHAR * 2)
    for char in set(answer):
        if not is_common_char(char):
            text = text.replace(char, MASK_CHAR)
    if sum(char in text for char in set(answer)) >= 3:
        for char in set(answer):
            text = text.replace(char, MASK_CHAR)
    return text


def read_tiers():
    tiers = []
    for line in PICKED_FILE.read_text(encoding="utf-8").splitlines():
        header = TIER_HEADER.match(line.strip())
        if header:
            tiers.append([])
        elif line.strip():
            if not tiers:
                tiers.append([])
            tiers[-1].extend(line.split())
    return tiers


def build_char_stats(dataset):
    counts = Counter()
    for item in dataset:
        counts.update(item.get("explanation", "") + item.get("example", ""))
    total = sum(counts.values())
    common_chars = {char for char, _ in counts.most_common(COMMON_CHAR_COUNT)}
    char_rarity = lambda char: -math.log((counts[char] + 1) / total)
    return char_rarity, common_chars.__contains__


def load_clue_overrides():
    overrides = json.loads(CLUE_OVERRIDES_FILE.read_text(encoding="utf-8"))
    leaking = [word for word, clue in overrides.items() if any(char in clue for char in word)]
    if leaking:
        sys.exit(f"clue overrides reveal answer characters: {' '.join(leaking)}")
    return overrides


def build_board(answer, char_pool, rng):
    candidates = sorted(char_pool - set(answer))
    distractors = rng.sample(candidates, BOARD_SIZE - len(answer))
    board = list(answer) + distractors
    rng.shuffle(board)
    return board


def word_difficulty(word, char_rarity):
    return sum(char_rarity(char) for char in word)


def load_frozen_levels():
    if not OUTPUT_FILE.exists():
        return []
    lines = [line for line in OUTPUT_FILE.read_text(encoding="utf-8").splitlines() if line.strip()]
    levels = [json.loads(line) for line in lines]
    expected = list(range(1, len(levels) + 1))
    if [level["levelNo"] for level in levels] != expected:
        sys.exit(f"{OUTPUT_FILE.name} is not numbered 1..{len(levels)} in order; refusing to append")
    return list(zip(lines, levels))


def select_new_words(tiers, idioms_by_word, char_rarity, frozen_levels):
    seen_words = {level["answer"] for level in frozen_levels}
    seen_explanations = {level["explanation"] for level in frozen_levels}
    candidates, missing = [], []
    for tier_index, tier in enumerate(tiers):
        usable = []
        for word in tier:
            item = idioms_by_word.get(word)
            if not item or len(word) != ANSWER_LENGTH:
                missing.append(word)
                continue
            explanation = clean_text(item["explanation"])
            if word in seen_words or explanation in seen_explanations:
                continue
            seen_words.add(word)
            seen_explanations.add(explanation)
            usable.append(word)
        usable.sort(key=lambda word: word_difficulty(word, char_rarity))
        candidates.extend((word, tier_index) for word in usable)
    return candidates, missing


def find_out_of_order_words(new_words, tiers, frozen_levels, char_rarity):
    """New levels go after every existing one, so each must be at least as hard as the hardest frozen level.

    Harder means a later tier; within the same tier, a rarer character score than every frozen idiom of that tier.
    """
    tier_of_word = {word: index for index, tier in enumerate(tiers) for word in tier}
    frozen_tiers = [tier_of_word[level["answer"]] for level in frozen_levels if level["answer"] in tier_of_word]
    if not frozen_tiers:
        return []
    last_frozen_tier = max(frozen_tiers)
    hardest_in_last_tier = max(
        word_difficulty(level["answer"], char_rarity)
        for level in frozen_levels
        if tier_of_word.get(level["answer"]) == last_frozen_tier
    )
    return [
        word for word, tier_index in new_words
        if tier_index < last_frozen_tier
        or (tier_index == last_frozen_tier and word_difficulty(word, char_rarity) < hardest_in_last_tier)
    ]


def build_level_line(word, level_no, item, char_pool, clue_overrides, is_common_char):
    return json.dumps({
        "_id": f"{GAME_TYPE}_{level_no}",
        "gameType": GAME_TYPE,
        "levelNo": level_no,
        "answer": word,
        "pinyin": item["pinyin"],
        "clue": clue_overrides.get(word) or mask_answer(clean_text(item["explanation"]), word, is_common_char),
        "explanation": clean_text(item["explanation"]),
        "derivation": clean_text(item["derivation"]),
        "board": build_board(word, char_pool, random.Random(word)),
    }, ensure_ascii=False)


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    dataset = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    target_total = int(sys.argv[2])
    idioms_by_word = {item["word"]: item for item in dataset}

    frozen = load_frozen_levels()
    frozen_levels = [level for _, level in frozen]
    if target_total <= len(frozen):
        print(f"already have {len(frozen)} levels, nothing to add (existing levels are never removed)")
        return

    tiers = read_tiers()
    char_rarity, is_common_char = build_char_stats(dataset)
    candidates, missing = select_new_words(tiers, idioms_by_word, char_rarity, frozen_levels)
    if missing:
        print(f"skipped {len(missing)} (not in dataset or not 4 chars):", " ".join(missing))
    needed = target_total - len(frozen)
    if len(candidates) < needed:
        sys.exit(f"only {len(candidates)} new usable idioms, need {needed}; add more to idioms.txt")

    new_words = candidates[:needed]
    out_of_order = find_out_of_order_words(new_words, tiers, frozen_levels, char_rarity)
    if out_of_order:
        sys.exit(
            "these idioms would be appended after harder levels, breaking the difficulty curve; "
            "move them to a new tier at the end of idioms.txt (or remove them): " + " ".join(out_of_order)
        )

    clue_overrides = load_clue_overrides()
    char_pool = {char for level in frozen_levels for char in level["answer"]}
    char_pool |= {char for word, _ in new_words for char in word}
    new_lines = [
        build_level_line(word, len(frozen) + offset + 1, idioms_by_word[word], char_pool, clue_overrides, is_common_char)
        for offset, (word, _) in enumerate(new_words)
    ]

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_FILE.write_text("\n".join([line for line, _ in frozen] + new_lines) + "\n", encoding="utf-8")
    print(
        f"kept {len(frozen)} existing levels, appended {len(new_lines)} "
        f"(levels {len(frozen) + 1}-{target_total}) to {OUTPUT_FILE.relative_to(ROOT)}"
    )


if __name__ == "__main__":
    main()
