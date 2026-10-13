"""Idiom levels: guess the idiom from its masked explanation.

Difficulty: scripts/data/idioms.txt groups idioms into '# tier N' blocks (human judgement of
familiarity); inside a tier, rarer characters sort later.
"""
import json
import re
import sys
from pathlib import Path

from .common import DATA_DIR, Candidate, CJK_ONLY

GAME_TYPE = "idiom"
ANSWER_LENGTH = 4
MASK_CHAR = "□"
TIER_HEADER = re.compile(r"^#\s*tier\s*(\d+)", re.IGNORECASE)


def load_text_fixes():
    return json.loads((DATA_DIR / "idiom_text_fixes.json").read_text(encoding="utf-8"))


TEXT_FIXES = load_text_fixes()

OWN_EXPLANATIONS_FILE = DATA_DIR / "idiom_explanations.json"


def load_own_explanations():
    return json.loads(OWN_EXPLANATIONS_FILE.read_text(encoding="utf-8")) if OWN_EXPLANATIONS_FILE.exists() else {}


OWN_EXPLANATIONS = load_own_explanations()


# Modern authors who died less than 50 years ago (2026): quotes from their works are still under copyright,
# so a derivation citing them is left out. Classical sources and authors in the public domain are kept.
PROTECTED_AUTHORS = ("毛泽东", "郭沫若", "冰心", "茅盾", "孙犁", "姚雪垠", "叶圣陶", "曹禺", "巴金", "夏衍", "丁玲",
                     "沈从文", "钱钟书", "周立波", "柳青", "魏巍", "刘绍棠", "沙汀", "艾芜", "马烽", "欧阳山", "曲波",
                     "杨沫", "知侠", "峻青", "浩然", "陈登科", "王愿坚", "周恩来", "朱德", "邓小平", "秦牧")


def derivation_of(raw_derivation, word):
    text = clean_text(raw_derivation, word)
    return "" if text.startswith(PROTECTED_AUTHORS) else text


def explanation_of(word):
    """Our own wording of an idiom's meaning. Dictionary explanations may only be read to look up the meaning;
    their text is never shipped (copyright), so a new idiom needs an entry in idiom_explanations.json first."""
    text = OWN_EXPLANATIONS.get(word)
    if not text:
        sys.exit(f"[idiom] {word} has no explanation in {OWN_EXPLANATIONS_FILE.name}; write one in our own words first")
    return text


def clean_text(text, word=None):
    text = re.sub(r"[“”\"]", "", text or "")
    for old, new in TEXT_FIXES["global"] + TEXT_FIXES["byIdiom"].get(word, []):
        text = text.replace(old, new)
    return re.sub(r"\s+", "", text).strip("。；， ") + "。"


def mask_answer(text, answer, is_common_char):
    """Two-character fragments are always hidden; single characters only when uncommon.

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
    for line in (DATA_DIR / "idioms.txt").read_text(encoding="utf-8").splitlines():
        if TIER_HEADER.match(line.strip()):
            tiers.append([])
        elif line.strip():
            if not tiers:
                tiers.append([])
            tiers[-1].extend(line.split())
    return tiers


def load_clue_overrides():
    overrides = json.loads((DATA_DIR / "idiom_clue_overrides.json").read_text(encoding="utf-8"))
    leaking = [word for word, clue in overrides.items() if any(char in clue for char in word)]
    if leaking:
        sys.exit(f"clue overrides reveal answer characters: {' '.join(leaking)}")
    return overrides


def build_candidates(data_dir, char_rarity, is_common_char):
    dataset = json.loads((Path(data_dir) / "xinhua" / "idiom.json").read_text(encoding="utf-8"))
    idioms_by_word = {item["word"]: item for item in dataset}
    overrides = load_clue_overrides()
    candidates, missing = [], []
    for tier_index, tier in enumerate(read_tiers()):
        for word in tier:
            item = idioms_by_word.get(word)
            if not item or len(word) != ANSWER_LENGTH or not CJK_ONLY.match(word):
                missing.append(word)
                continue
            explanation = explanation_of(word)
            candidates.append(Candidate(
                key=word,
                tier=tier_index,
                score=(sum(char_rarity(char) for char in word),),
                answer=word,
                dedupe_key=explanation,
                fields={
                    "answer": word,
                    "pinyin": item["pinyin"],
                    "clue": overrides.get(word) or mask_answer(explanation, word, is_common_char),
                    "explanation": explanation,
                    "derivation": derivation_of(item["derivation"], word),
                },
            ))
    if missing:
        print(f"[idiom] skipped {len(missing)} (not in dataset or not 4 chars):", " ".join(missing))
    return candidates


def level_key_of(level):
    return level["answer"]


def level_dedupe_of(level):
    return level["explanation"]
