"""Shared append-only level pipeline used by every game.

Levels already written to database/levels/<game>.json are kept byte-for-byte: player progress is
stored by level number, so renumbering or editing an existing level would corrupt it. New candidates
are appended after the last level and must not be easier than what already exists.
"""
import json
import math
import random
import re
import sys
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
DATA_DIR = ROOT / "scripts" / "data"
LEVELS_DIR = ROOT / "database" / "levels"

BOARD_SIZE = 24
COMMON_CHAR_COUNT = 300
CJK_ONLY = re.compile(r"^[一-鿿]+$")


@dataclass
class Candidate:
    key: str
    tier: int
    score: tuple
    answer: str
    fields: dict
    dedupe_key: str = ""
    extra: dict = field(default_factory=dict)


def build_char_stats(idiom_dataset_path):
    """Character frequency over modern explanations/examples; rarer characters mean harder content."""
    dataset = json.loads(Path(idiom_dataset_path).read_text(encoding="utf-8"))
    counts = Counter()
    for item in dataset:
        counts.update(item.get("explanation", "") + item.get("example", ""))
    total = sum(counts.values())
    common_chars = {char for char, _ in counts.most_common(COMMON_CHAR_COUNT)}
    char_rarity = lambda char: -math.log((counts[char] + 1) / total)
    return char_rarity, common_chars.__contains__


def text_difficulty(text, char_rarity):
    return sum(char_rarity(char) for char in text)


def load_frozen_levels(output_file):
    if not output_file.exists():
        return []
    lines = [line for line in output_file.read_text(encoding="utf-8").splitlines() if line.strip()]
    levels = [json.loads(line) for line in lines]
    if [level["levelNo"] for level in levels] != list(range(1, len(levels) + 1)):
        sys.exit(f"{output_file.name} is not numbered 1..{len(levels)} in order; refusing to append")
    return list(zip(lines, levels))


def build_board(answer, char_pool, rng):
    candidates = sorted(char_pool - set(answer))
    distractors = rng.sample(candidates, BOARD_SIZE - len(answer))
    board = list(answer) + distractors
    rng.shuffle(board)
    return board


def find_out_of_order(new_candidates, frozen_keys, candidates_by_key):
    frozen = [candidates_by_key[key] for key in frozen_keys if key in candidates_by_key]
    if not frozen:
        return []
    last_tier = max(candidate.tier for candidate in frozen)
    hardest_score = max(candidate.score for candidate in frozen if candidate.tier == last_tier)
    return [
        candidate.key for candidate in new_candidates
        if candidate.tier < last_tier or (candidate.tier == last_tier and candidate.score < hardest_score)
    ]


def append_levels(game_type, candidates, target_total, level_key_of, level_dedupe_of, include_source_key=True):
    output_file = LEVELS_DIR / f"{game_type}.json"
    frozen = load_frozen_levels(output_file)
    frozen_levels = [level for _, level in frozen]
    if target_total <= len(frozen):
        print(f"[{game_type}] already have {len(frozen)} levels, nothing to add (existing levels are never removed)")
        return

    frozen_keys = [level_key_of(level) for level in frozen_levels]
    seen_keys = set(frozen_keys)
    seen_dedupe = {level_dedupe_of(level) for level in frozen_levels}
    ordered = sorted(candidates, key=lambda candidate: (candidate.tier, candidate.score))
    remaining = []
    for candidate in ordered:
        if candidate.key in seen_keys or (candidate.dedupe_key and candidate.dedupe_key in seen_dedupe):
            continue
        seen_keys.add(candidate.key)
        if candidate.dedupe_key:
            seen_dedupe.add(candidate.dedupe_key)
        remaining.append(candidate)

    needed = target_total - len(frozen)
    if len(remaining) < needed:
        sys.exit(f"[{game_type}] only {len(remaining)} new usable candidates, need {needed}; add more source content")
    new_candidates = remaining[:needed]
    out_of_order = find_out_of_order(new_candidates, frozen_keys, {c.key: c for c in candidates})
    if out_of_order:
        sys.exit(
            f"[{game_type}] these would be appended after harder levels, breaking the difficulty curve; "
            "move them to a later stage/tier (or remove them): " + " ".join(out_of_order)
        )

    char_pool = {char for level in frozen_levels for char in level["answer"]}
    char_pool |= {char for candidate in new_candidates for char in candidate.answer}
    new_lines = []
    for offset, candidate in enumerate(new_candidates):
        level_no = len(frozen) + offset + 1
        level = {"_id": f"{game_type}_{level_no}", "gameType": game_type, "levelNo": level_no}
        level.update(candidate.fields)
        if "board" not in level:
            level["board"] = build_board(candidate.answer, char_pool, random.Random(candidate.key))
        if include_source_key:
            level["sourceKey"] = candidate.key
        new_lines.append(json.dumps(level, ensure_ascii=False))

    output_file.parent.mkdir(parents=True, exist_ok=True)
    output_file.write_text("\n".join([line for line, _ in frozen] + new_lines) + "\n", encoding="utf-8")
    print(
        f"[{game_type}] kept {len(frozen)} existing levels, appended {len(new_lines)} "
        f"(levels {len(frozen) + 1}-{target_total}) to {output_file.relative_to(ROOT)}"
    )


def read_stage_blocks(path):
    """Parse '# stage <name> key=value ...' headers followed by entry lines."""
    stages = []
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if line.startswith("# stage"):
            parts = line.split()[2:]
            options = dict(part.split("=", 1) if "=" in part else (part, True) for part in parts[1:])
            stages.append({"name": parts[0], "options": options, "entries": []})
        elif line and not line.startswith("#"):
            if not stages:
                sys.exit(f"{path.name}: entry before any '# stage' header: {line}")
            stages[-1]["entries"].append(line)
    return stages
