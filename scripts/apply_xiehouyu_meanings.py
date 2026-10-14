"""Add the plain-words meaning (scripts/data/xiehouyu_meanings.json) to xiehouyu levels already published.

Usage: python3 scripts/apply_xiehouyu_meanings.py

Level files are append-only (levelNo, answer and board never change), so the meaning is added in place.
Re-import database/levels/xiehouyu.json into the cloud database (Upsert) afterwards.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from level_builders import xiehouyu  # noqa: E402
from level_builders.common import ROOT  # noqa: E402

LEVELS_FILE = ROOT / "database" / "levels" / "xiehouyu.json"


def main():
    meanings = xiehouyu.load_meanings()
    levels = [json.loads(line) for line in LEVELS_FILE.read_text(encoding="utf-8").splitlines() if line.strip()]
    problems = []
    for level in levels:
        meaning = meanings.get(level["riddle"], "")
        problem = xiehouyu.meaning_problem(level["answer"], meaning)
        if problem:
            problems.append(f"{level['levelNo']} {level['riddle']}——{level['answer']}: {problem}")
        level["meaning"] = meaning
    if problems:
        sys.exit("meanings to fix first:\n  " + "\n  ".join(problems))
    LEVELS_FILE.write_text("".join(json.dumps(level, ensure_ascii=False) + "\n" for level in levels), encoding="utf-8")
    print(f"added meanings to {len(levels)} levels in {LEVELS_FILE.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
