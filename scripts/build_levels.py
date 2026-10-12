"""Build (append-only) level files for cloud database import.

Usage:
    python3 scripts/build_levels.py <game> <target_total_levels> [--data-dir .cache]

Games: idiom | poetry | xiehouyu | typo. Output: database/levels/<game>.jsonl.
poetry needs OpenCC, so run it with .cache/venv/bin/python.

Source data (downloaded into --data-dir, not committed):
    xinhua/idiom.json, xinhua/xiehouyu.json, xinhua/word.json   https://github.com/pwxcoo/chinese-xinhua (MIT)
    poetry/...                                https://github.com/chinese-poetry/chinese-poetry (MIT)
"""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from level_builders import idiom, poetry, typo, xiehouyu  # noqa: E402
from level_builders.common import ROOT, append_levels, build_char_stats  # noqa: E402

BUILDERS = {
    "idiom": (idiom, False),
    "poetry": (poetry, True),
    "xiehouyu": (xiehouyu, True),
    "typo": (typo, True),
}


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("game", choices=sorted(BUILDERS))
    parser.add_argument("target_total", type=int)
    parser.add_argument("--data-dir", default=str(ROOT / ".cache"))
    args = parser.parse_args()

    module, include_source_key = BUILDERS[args.game]
    char_rarity, is_common_char = build_char_stats(Path(args.data_dir) / "xinhua" / "idiom.json")
    candidates = module.build_candidates(args.data_dir, char_rarity, is_common_char)
    print(f"[{args.game}] {len(candidates)} candidates")
    append_levels(
        module.GAME_TYPE,
        candidates,
        args.target_total,
        module.level_key_of,
        module.level_dedupe_of,
        include_source_key=include_source_key,
    )


if __name__ == "__main__":
    main()
