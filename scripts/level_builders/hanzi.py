"""Hanzi levels (汉字闯关) for grades 1-2: one question per level, pick the right one of four big choices.

Character pool: 字表一 (2500 characters) of 义务教育语文课程常用字表 (Ministry of Education, 2022). The 1600 most
common and simplest are kept and split into four bands of 400, labelled 初级 (bands 1-2) and 中级 (bands 3-4).
This follows how common and how simple a character is, not any textbook's lesson order. Frequency comes from
dictionary text, which undercounts children's everyday words (猫, 跑, 糖), so every character in our own picture and
word lists counts as most common.

Each character gets one question, the kind rotating so a run of levels mixes them:
- picture  看图识字   🐟 → 鱼            the other choices are characters from other pictures
- pinyin   拼音选字   shuǐ → 水          look-alike characters first (sharing a component), then same syllable
- radical  认偏旁     「河」的偏旁 → 氵  other radicals of the same position that are nowhere inside the character
- word     选字组词   □朗 → 晴           words from our children's word list only; look-alikes / homophones as choices,
                                           and a choice that also makes a word (dictionary or our list) is never used

Sources (downloaded into --data-dir/hanzi, not committed):
    table1.tsv          https://gist.github.com/diaowinner/d78e9e9656619234298af5bc17302e44 (字表一, checked against the
                        Ministry's 2022 curriculum standard appendix)
    ci.json             https://github.com/pwxcoo/chinese-xinhua (MIT): words, and modern text for character frequency
    mmah-dictionary.txt https://github.com/skishore/makemeahanzi (LGPL-3.0): component breakdown, used only here to
                        choose and check distractors; nothing from it is shipped
Our own data: scripts/data/hanzi_pictures.txt, hanzi_words.txt, hanzi_radicals.json.
"""
import json
import random
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

from .common import DATA_DIR, Candidate

GAME_TYPE = "hanzi"
POOL_SIZE = 1600
BAND_SIZE = 400
BAND_STAGES = ["初级", "初级", "中级", "中级"]
CHOICES = 4
# Only the most frequent part of 字表一 is considered at all, so a very simple but rare character never slips in.
FREQUENT_LIMIT = 2000
# Distractors come from the pool up to this many bands ahead, so they are characters children meet soon anyway.
DISTRACTOR_BANDS_AHEAD = 1
KIND_ROTATION = ["pinyin", "radical", "word"]
PINYIN_PATTERN = re.compile(r"^[a-zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜüɡ]+$")
IDS_OPERATORS = set("⿰⿱⿲⿳⿴⿵⿶⿷⿸⿹⿺⿻？")


def normalize_pinyin(syllable):
    return syllable.replace("ɡ", "g").strip().lower()


def toneless(syllable):
    return "".join(char for char in unicodedata.normalize("NFD", syllable) if unicodedata.category(char) != "Mn")


def read_pictures():
    pictures = []
    for line in (DATA_DIR / "hanzi_pictures.txt").read_text(encoding="utf-8").splitlines():
        if line.strip() and not line.startswith("#"):
            emoji, char = line.split("|")
            pictures.append((emoji.strip(), char.strip()))
    return pictures


def read_kid_words():
    words = []
    for line in (DATA_DIR / "hanzi_words.txt").read_text(encoding="utf-8").splitlines():
        if line.strip() and not line.startswith("#"):
            words.extend(word for word in line.split() if len(word) == 2)
    return list(dict.fromkeys(words))


def read_radicals():
    return json.loads((DATA_DIR / "hanzi_radicals.json").read_text(encoding="utf-8"))


def load_sources(data_dir):
    hanzi_dir = Path(data_dir) / "hanzi"
    table = [line.split("\t")[1] for line in (hanzi_dir / "table1.tsv").read_text(encoding="utf-8").splitlines()[1:] if line.strip()]
    xinhua = {item["word"]: item for item in json.loads((Path(data_dir) / "xinhua" / "word.json").read_text(encoding="utf-8"))}
    words = json.loads((hanzi_dir / "ci.json").read_text(encoding="utf-8"))
    breakdown = {}
    for line in (hanzi_dir / "mmah-dictionary.txt").read_text(encoding="utf-8").splitlines():
        item = json.loads(line)
        breakdown[item["character"]] = item
    return table, xinhua, words, breakdown


def readings_of(item):
    """Every reading of a character: the main one plus those listed in the dictionary entry (多音字)."""
    readings = {normalize_pinyin(item["pinyin"].split()[0])}
    for line in item.get("more", "").splitlines():
        line = line.strip()
        if PINYIN_PATTERN.match(line):
            readings.add(normalize_pinyin(line))
    return readings


def components_of(char, breakdown, depth=0):
    """All parts a character is built from, all the way down (河 → 氵 可 口 丁 …)."""
    item = breakdown.get(char)
    if not item or depth > 6:
        return set()
    parts = {part for part in item.get("decomposition", "") if part not in IDS_OPERATORS and part != char}
    found = set(parts)
    for part in parts:
        found |= components_of(part, breakdown, depth + 1)
    return found


def build_pool(table, xinhua, words, breakdown, everyday):
    corpus = Counter()
    for item in words:
        corpus.update(item.get("explanation", ""))
    usable = [char for char in table if char in xinhua and xinhua[char].get("pinyin") and char in breakdown]
    by_frequency = sorted(usable, key=lambda char: (char not in everyday, -corpus[char]))
    by_strokes = sorted(usable, key=lambda char: int(xinhua[char].get("strokes") or 99))
    frequency_rank = {char: index for index, char in enumerate(by_frequency)}
    stroke_rank = {char: index for index, char in enumerate(by_strokes)}
    # Common and simple count equally: children meet frequent characters first, and simple ones are easier to tell apart.
    common = sorted(by_frequency[:FREQUENT_LIMIT], key=lambda char: (frequency_rank[char] + stroke_rank[char], char))
    return common[:POOL_SIZE]


def pick_distractors(rng, answer, ranked_options, avoid):
    chosen = []
    for option in ranked_options:
        if option != answer and option not in avoid and option not in chosen:
            chosen.append(option)
        if len(chosen) == CHOICES - 1:
            return chosen
    return None


def board_of(answer, distractors, rng):
    board = [answer] + distractors
    rng.shuffle(board)
    wrong = [index for index, char in enumerate(board) if char != answer]
    rng.shuffle(wrong)
    return board, wrong


class Builder:
    def __init__(self, data_dir):
        table, self.xinhua, words, self.breakdown = load_sources(data_dir)
        table_set = set(table)
        kid_words = read_kid_words()
        self.outside_table = [word for word in kid_words if not all(char in table_set for char in word)]
        kid_words = [word for word in kid_words if word not in self.outside_table]
        everyday = {char for word in kid_words for char in word} | {char for _, char in read_pictures()}
        self.pool = build_pool(table, self.xinhua, words, self.breakdown, everyday)
        self.band_of = {char: index // BAND_SIZE for index, char in enumerate(self.pool)}
        self.pool_index = {char: index for index, char in enumerate(self.pool)}
        pool_set = set(self.pool)
        self.readings = {char: readings_of(self.xinhua[char]) for char in self.pool}
        self.components = {char: components_of(char, self.breakdown) for char in self.pool}
        self.all_words = {item["ci"] for item in words} | set(kid_words)
        self.words_of = defaultdict(list)
        for word in kid_words:
            if all(char in pool_set for char in word):
                for char in set(word):
                    self.words_of[char].append(word)
        self.pictures = [(emoji, char) for emoji, char in read_pictures() if char in pool_set]
        self.picture_of = {char: emoji for emoji, char in self.pictures}
        self.radicals = read_radicals()

    def nearby(self, char):
        """Pool characters a child meets by the same time or soon after."""
        limit = self.band_of[char] + DISTRACTOR_BANDS_AHEAD
        return [other for other in self.pool if self.band_of[other] <= limit]

    def look_alikes(self, char):
        """Characters sharing a meaningful part (晴 睛 清 请 share 青), most shared parts first."""
        mine = {part for part in self.components[char] if part not in self.radicals}
        scored = [(len(mine & self.components[other]), other) for other in self.nearby(char) if other != char]
        return [other for score, other in sorted(scored, key=lambda pair: (-pair[0], self.pool_index[pair[1]])) if score > 0]

    def main_reading(self, char):
        return normalize_pinyin(self.xinhua[char]["pinyin"].split()[0])

    def example_word(self, char):
        return self.words_of[char][0] if self.words_of[char] else ""

    def radical_of(self, char):
        radical = self.xinhua[char].get("radicals", "")
        item = self.breakdown.get(char, {})
        is_visible_part = radical in item.get("decomposition", "")
        return radical if radical in self.radicals and is_visible_part and radical != char else ""

    # ----- the four kinds -----

    def picture_question(self, char, rng):
        others = [other for _, other in self.pictures if other != char and self.band_of[other] <= self.band_of[char] + DISTRACTOR_BANDS_AHEAD]
        rng.shuffle(others)
        distractors = pick_distractors(rng, char, others, set())
        if not distractors:
            return None
        return {"kind": "picture", "clue": self.picture_of[char], "prompt": "看图，这是哪个字？", "answer": char, "distractors": distractors}

    def pinyin_question(self, char, rng):
        reading = self.main_reading(char)
        same_syllable = [other for other in self.nearby(char) if toneless(reading) in {toneless(item) for item in self.readings[other]}]
        ranked = self.look_alikes(char) + same_syllable + sorted(self.nearby(char), key=lambda other: abs(self.pool_index[other] - self.pool_index[char]))
        avoid = {other for other in self.pool if reading in self.readings[other]}
        distractors = pick_distractors(rng, char, ranked, avoid)
        if not distractors:
            return None
        return {"kind": "pinyin", "clue": reading, "prompt": "读一读拼音，选出对的字", "answer": char, "distractors": distractors}

    def radical_question(self, char, rng):
        radical = self.radical_of(char)
        if not radical:
            return None
        position = self.radicals[radical]["position"]
        inside = self.components[char] | {char}
        options = [other for other, info in self.radicals.items() if info["position"] == position and other not in inside]
        rng.shuffle(options)
        distractors = pick_distractors(rng, radical, options, set())
        if not distractors:
            return None
        return {"kind": "radical", "clue": char, "prompt": f"「{char}」的偏旁是哪个？", "answer": radical, "distractors": distractors}

    def word_question(self, char, rng):
        for word in self.words_of[char]:
            position = word.index(char)
            partner = word[1 - position]
            reading = self.main_reading(char)
            homophones = [other for other in self.nearby(char) if toneless(reading) in {toneless(item) for item in self.readings[other]}]
            ranked = self.look_alikes(char) + homophones
            avoid = {other for other in self.pool if (word[:position] + other + word[position + 1:]) in self.all_words} | {partner}
            distractors = pick_distractors(rng, char, ranked, avoid)
            if distractors:
                clue = word[:position] + "□" + word[position + 1:]
                return {"kind": "word", "clue": clue, "prompt": "选一个字，组成词语", "answer": char, "distractors": distractors, "word": word}
        return None

    def question_for(self, char, index):
        rng = random.Random(f"hanzi:{char}")
        if char in self.picture_of:
            question = self.picture_question(char, rng)
            if question:
                return question
        rotation = KIND_ROTATION[index % len(KIND_ROTATION):] + KIND_ROTATION[: index % len(KIND_ROTATION)]
        makers = {"pinyin": self.pinyin_question, "radical": self.radical_question, "word": self.word_question}
        for kind in rotation:
            question = makers[kind](char, rng)
            if question:
                return question
        return None


def build_candidates(data_dir, char_rarity, is_common_char):
    builder = Builder(data_dir)
    if builder.outside_table:
        print(f"[hanzi] words using characters outside 字表一 (skipped): {' '.join(builder.outside_table)}")
    missing_pictures = [char for _, char in read_pictures() if char not in builder.band_of]
    if missing_pictures:
        print(f"[hanzi] pictures whose character is outside the pool (skipped): {''.join(missing_pictures)}")
    candidates, problems = [], []
    for index, char in enumerate(builder.pool):
        question = builder.question_for(char, index)
        if not question:
            problems.append(char)
            continue
        board, elimination_order = board_of(question["answer"], question["distractors"], random.Random(f"board:{char}"))
        radical = builder.radical_of(char)
        fields = {
            "answer": question["answer"],
            "clue": question["clue"],
            "kind": question["kind"],
            "prompt": question["prompt"],
            "char": char,
            "pinyin": builder.main_reading(char),
            "radical": radical,
            "radicalName": builder.radicals[radical]["name"] if radical else "",
            "word": question.get("word") or builder.example_word(char),
            "stage": BAND_STAGES[builder.band_of[char]],
            "board": board,
            "eliminationOrder": elimination_order,
        }
        candidates.append(Candidate(
            key=char,
            tier=builder.band_of[char],
            score=(index,),
            answer=question["answer"],
            fields=fields,
            dedupe_key=char,
        ))
    if problems:
        print(f"[hanzi] {len(problems)} characters without a usable question (skipped): {''.join(problems)}")
    return candidates


def level_key_of(level):
    return level["sourceKey"]


def level_dedupe_of(level):
    return level["sourceKey"]
