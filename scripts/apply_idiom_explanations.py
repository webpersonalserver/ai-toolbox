"""Rewrite the explanation text of levels already published, using our own wording.

Usage: python3 scripts/apply_idiom_explanations.py [--data-dir .cache]

Level files are append-only (levelNo, answer and board never change), so new wording is applied in place:
idiom levels get a new explanation and clue (and lose derivations quoting authors still under copyright),
typo levels a new explanation and clueHint. Re-import both files
into the cloud database (Upsert) afterwards.
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from level_builders import idiom  # noqa: E402
from level_builders.common import ROOT, build_char_stats  # noqa: E402

LEVELS_DIR = ROOT / "database" / "levels"


def rewrite(file_name, update):
    path = LEVELS_DIR / file_name
    levels = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
    for level in levels:
        update(level)
    path.write_text("".join(json.dumps(level, ensure_ascii=False) + "\n" for level in levels), encoding="utf-8")
    print(f"rewrote {len(levels)} levels in {path.relative_to(ROOT)}")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--data-dir", default=str(ROOT / ".cache"))
    args = parser.parse_args()
    _, is_common_char = build_char_stats(Path(args.data_dir) / "xinhua" / "idiom.json")
    overrides = idiom.load_clue_overrides()

    def update_idiom(level):
        explanation = idiom.explanation_of(level["answer"])
        level["explanation"] = explanation
        level["clue"] = overrides.get(level["answer"]) or idiom.mask_answer(explanation, level["answer"], is_common_char)
        if level.get("derivation", "").startswith(idiom.PROTECTED_AUTHORS):
            level["derivation"] = ""

    def update_typo(level):
        explanation = idiom.explanation_of(level["idiom"])
        level["explanation"] = explanation
        if "clueHint" in level:
            level["clueHint"] = idiom.mask_answer(explanation, level["idiom"], is_common_char)

    rewrite("idiom.json", update_idiom)
    rewrite("typo.json", update_typo)


if __name__ == "__main__":
    main()
