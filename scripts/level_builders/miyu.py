"""猜谜语 levels: read the riddle and its category (打一水果…), spell the answer from the board.

Every riddle, category and clue-by-clue explanation is our own writing (scripts/data/miyu.txt); folk riddles are
reworded. Four stages, easy to hard: 入门 (animals, fruit, food) → 进阶 (things, nature) → 高手 (字谜) →
大师 (成语 and word riddles).
"""
import re
import sys

from .common import DATA_DIR, Candidate, CJK_ONLY, read_stage_blocks

GAME_TYPE = "miyu"
MIN_ANSWER_LENGTH = 1
MAX_ANSWER_LENGTH = 4
CATEGORY = re.compile(r"^打一[一-鿿]{1,4}$")
SOURCE_FILE = DATA_DIR / "miyu.txt"


def build_candidates(data_dir, char_rarity, is_common_char):
    candidates, problems = [], []
    for stage_index, stage in enumerate(read_stage_blocks(SOURCE_FILE)):
        for entry_index, entry in enumerate(stage["entries"]):
            parts = [part.strip() for part in entry.split("|")]
            if len(parts) != 4 or not all(parts):
                problems.append(f"{entry} (needs 谜面|谜目|答案|为什么)")
                continue
            riddle, category, answer, why = parts
            if not CATEGORY.match(category):
                problems.append(f"{entry} (谜目 must read 打一…)")
                continue
            if not CJK_ONLY.match(answer) or not MIN_ANSWER_LENGTH <= len(answer) <= MAX_ANSWER_LENGTH:
                problems.append(f"{entry} (answer must be {MIN_ANSWER_LENGTH}-{MAX_ANSWER_LENGTH} Chinese characters)")
                continue
            # A riddle that names its own answer gives it away (字谜 are the exception: their parts are the clue).
            if category != "打一字" and any(char in riddle for char in answer):
                problems.append(f"{entry} (the riddle uses a character of the answer)")
                continue
            candidates.append(Candidate(
                key=riddle,
                tier=stage_index,
                score=(entry_index,),
                answer=answer,
                dedupe_key=answer,
                fields={"answer": answer, "clue": riddle, "category": category, "why": why, "stage": stage["name"]},
            ))
    if problems:
        sys.exit("[miyu] invalid entries:\n  " + "\n  ".join(problems))
    return candidates


def level_key_of(level):
    return level["sourceKey"]


def level_dedupe_of(level):
    return level["answer"]
