"""Pinyin over each answer cell (拼音辅助) for 猜成语, 诗词填空 and 歇后语: answerPinyin = one syllable per answer character.

- 猜成语: the idiom dictionary's own pinyin.
- 诗词 / 歇后语: pypinyin reads the whole line, so words are read in context, then the answer's part is taken.
  Classical and colloquial polyphones it gets wrong (照我还 huán, 何处 chù, 万重山 chóng …) are fixed by hand in
  scripts/data/answer_pinyin_overrides.json, keyed by the level's sourceKey.
- 一 and 不 keep their dictionary tones (yī, bù), as in the idiom data.
Needs pypinyin (.cache/venv).
"""
import json
import re
from pathlib import Path

# Not imported from .common: common imports this module first, so that would be a circular import.
DATA_DIR = Path(__file__).resolve().parent.parent / "data"

GAMES = ("idiom", "poetry", "xiehouyu")
SYLLABLE = re.compile(r"^[a-zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü]+$")
DICTIONARY_TONES = {"一": "yī", "不": "bù"}


def load_overrides():
    return json.loads((DATA_DIR / "answer_pinyin_overrides.json").read_text(encoding="utf-8"))


def _read_in_context(context, start, length):
    from pypinyin import Style, pinyin

    syllables = [item[0] for item in pinyin(context, style=Style.TONE, errors=lambda text: list(text))]
    return syllables[start:start + length]


def answer_pinyin(level, overrides):
    answer = level["answer"]
    game = level["gameType"]
    if game == "idiom":
        syllables = level["pinyin"].replace("ɡ", "g").split()
    elif level.get("sourceKey") in overrides.get(game, {}):
        syllables = overrides[game][level["sourceKey"]].split()
    elif game == "poetry":
        syllables = _read_in_context(level["verse"], level["verse"].index(answer), len(answer))
    else:
        context = f"{level['riddle']}，{answer}"
        syllables = _read_in_context(context, len(context) - len(answer), len(answer))
    syllables = [DICTIONARY_TONES.get(char, syllable) for char, syllable in zip(answer, syllables)]
    if len(syllables) != len(answer) or not all(SYLLABLE.match(syllable) for syllable in syllables):
        raise ValueError(f"{game} {level.get('levelNo')} {answer}: bad pinyin {syllables}")
    return syllables
