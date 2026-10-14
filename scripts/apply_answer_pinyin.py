"""Add answerPinyin (拼音辅助) to the 猜成语, 诗词填空 and 歇后语 levels already published.

Usage: .cache/venv/bin/python scripts/apply_answer_pinyin.py

Level files are append-only (levelNo, answer and board never change), so the field is added in place.
Re-import idiom.json, poetry.json and xiehouyu.json into the cloud database (Upsert) afterwards.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from level_builders.answer_pinyin import GAMES, answer_pinyin, load_overrides  # noqa: E402
from level_builders.common import ROOT  # noqa: E402

LEVELS_DIR = ROOT / "database" / "levels"


def main():
    overrides = load_overrides()
    for game in GAMES:
        path = LEVELS_DIR / f"{game}.json"
        levels = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
        for level in levels:
            level["answerPinyin"] = answer_pinyin(level, overrides)
        path.write_text("".join(json.dumps(level, ensure_ascii=False) + "\n" for level in levels), encoding="utf-8")
        print(f"added answerPinyin to {len(levels)} levels in {path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
