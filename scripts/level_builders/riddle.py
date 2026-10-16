"""Brain-teaser (脑筋急转弯) levels: read the question, spell the answer from the board.

Every question, answer and「为什么」is our own writing (scripts/data/riddles.txt), ordered from easy to hard in four
stages (入门 → 进阶 → 高手 → 大师). The answer may appear in the question on purpose — that is part of the trick.
"""
import sys

from .common import DATA_DIR, Candidate, CJK_ONLY, read_stage_blocks

GAME_TYPE = "riddle"
MIN_ANSWER_LENGTH = 1
MAX_ANSWER_LENGTH = 5
SOURCE_FILE = DATA_DIR / "riddles.txt"


def build_candidates(data_dir, char_rarity, is_common_char):
    candidates, problems = [], []
    for stage_index, stage in enumerate(read_stage_blocks(SOURCE_FILE)):
        for entry_index, entry in enumerate(stage["entries"]):
            parts = [part.strip() for part in entry.split("|")]
            if len(parts) != 3 or not all(parts):
                problems.append(f"{entry} (needs 问题|答案|为什么)")
                continue
            question, answer, why = parts
            if not CJK_ONLY.match(answer) or not MIN_ANSWER_LENGTH <= len(answer) <= MAX_ANSWER_LENGTH:
                problems.append(f"{entry} (answer must be {MIN_ANSWER_LENGTH}-{MAX_ANSWER_LENGTH} Chinese characters)")
                continue
            candidates.append(Candidate(
                key=question,
                tier=stage_index,
                score=(entry_index,),
                answer=answer,
                dedupe_key=answer,
                fields={"answer": answer, "clue": question, "why": why, "stage": stage["name"]},
            ))
    if problems:
        sys.exit("[riddle] invalid entries:\n  " + "\n  ".join(problems))
    return candidates


def level_key_of(level):
    return level["sourceKey"]


def level_dedupe_of(level):
    return level["answer"]
