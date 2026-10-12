"""Xiehouyu levels: given the first half, fill in the second half.

Every entry is hand-picked in scripts/data/xiehouyu_stages.txt (the raw dataset has many crude or
awkward entries, so nothing is auto-included). The chosen answer must be one of the dataset's own
answers; homophone/explanation brackets are stripped from the answer and kept as a note.
"""
import json
import re
import sys
from pathlib import Path

from .common import DATA_DIR, Candidate, CJK_ONLY, read_stage_blocks

GAME_TYPE = "xiehouyu"
MIN_ANSWER_LENGTH = 2
MAX_ANSWER_LENGTH = 7
BRACKETED = re.compile(r"[（(][^）)]*[）)]")


def split_options(raw_answer):
    for option in re.split(r"[；;]", raw_answer):
        option = option.strip()
        if option:
            yield BRACKETED.sub("", option).strip(), option


def load_options(data_dir):
    dataset = json.loads((Path(data_dir) / "xinhua" / "xiehouyu.json").read_text(encoding="utf-8"))
    options = {}
    for item in dataset:
        riddle = item["riddle"].strip()
        for answer, original in split_options(item["answer"]):
            options.setdefault(riddle, {}).setdefault(answer, original)
    return options


def build_candidates(data_dir, char_rarity, is_common_char):
    options = load_options(data_dir)
    candidates, problems = [], []
    for stage_index, stage in enumerate(read_stage_blocks(DATA_DIR / "xiehouyu_stages.txt")):
        for entry_index, entry in enumerate(stage["entries"]):
            riddle, answer = (part.strip() for part in entry.split("|", 1))
            original = options.get(riddle, {}).get(answer)
            if original is None:
                problems.append(f"{entry} (answer not in dataset)")
                continue
            if not CJK_ONLY.match(answer) or not MIN_ANSWER_LENGTH <= len(answer) <= MAX_ANSWER_LENGTH:
                problems.append(f"{entry} (answer must be {MIN_ANSWER_LENGTH}-{MAX_ANSWER_LENGTH} Chinese characters)")
                continue
            candidates.append(Candidate(
                key=riddle,
                tier=stage_index,
                score=(entry_index,),
                answer=answer,
                fields={
                    "answer": answer,
                    "clue": f"{riddle}——",
                    "riddle": riddle,
                    "note": original if original != answer else "",
                    "stage": stage["name"],
                },
            ))
    if problems:
        sys.exit("[xiehouyu] invalid entries:\n  " + "\n  ".join(problems))
    return candidates


def level_key_of(level):
    return level["sourceKey"]


def level_dedupe_of(level):
    return level["sourceKey"]
