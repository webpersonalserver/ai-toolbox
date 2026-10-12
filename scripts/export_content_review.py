"""Write docs/content-review.md: the poetry/xiehouyu content that needs a human proofread.

Usage: python3 scripts/export_content_review.py
"""
import json
from collections import OrderedDict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "docs" / "content-review.md"


def read_levels(game_type):
    path = ROOT / "database" / "levels" / f"{game_type}.json"
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def poetry_section(levels, supplement):
    supplemented = {(poem["author"], poem["title"]): poem for poem in supplement["poems"]}
    lines = ["## 一、诗词填空", ""]
    lines += [
        "### 1. 人工补录的课本版本（重点校对）",
        "",
        "数据源缺失、或数据源版本与课本不一致时，按部编版教材手工录入。⚠️ 表示版本存疑。",
        "",
        "| 标题 | 作者 | 正文 |",
        "|---|---|---|",
    ]
    for poem in supplement["poems"]:
        flag = "⚠️ " if poem.get("needsReview") else ""
        lines.append(f"| {flag}{poem['title']} | {poem['author']} | {poem['text']} |")
    lines += ["", f"数据源统一替换的异体字：{'、'.join(f'{old}→{new}' for old, new in supplement['variantReplacements'])}", ""]
    lines += ["### 2. 各学段关卡（课本学段，逐关核对答案是否与课本一致）", ""]
    by_stage = OrderedDict()
    for level in levels:
        by_stage.setdefault(level["stage"], []).append(level)
    for stage, stage_levels in by_stage.items():
        if stage == "进阶":
            lines += [f"#### {stage}（{len(stage_levels)} 关，第 {stage_levels[0]['levelNo']}–{stage_levels[-1]['levelNo']} 关，来自唐诗/宋词三百首，抽查即可）", ""]
            continue
        lines += [f"#### {stage}（{len(stage_levels)} 关，第 {stage_levels[0]['levelNo']}–{stage_levels[-1]['levelNo']} 关）", "",
                  "| 关 | 题面 | 答案 | 出处 |", "|---|---|---|---|"]
        for level in stage_levels:
            source = "补录" if (level["author"], level["poemTitle"]) in supplemented else ""
            lines.append(f"| {level['levelNo']} | {level['clue']} | {level['answer']} | {level['author']}《{level['poemTitle']}》{(' · ' + source) if source else ''} |")
        lines.append("")
    return lines


def xiehouyu_section(levels):
    lines = ["## 二、歇后语", "", "全部人工挑选，答案取自数据源。「原文」列是数据源里带谐音/释义括号的原始写法。", ""]
    by_stage = OrderedDict()
    for level in levels:
        by_stage.setdefault(level["stage"], []).append(level)
    for stage, stage_levels in by_stage.items():
        lines += [f"### {stage}（{len(stage_levels)} 关）", "", "| 关 | 谜面 | 答案 | 原文 |", "|---|---|---|---|"]
        for level in stage_levels:
            lines.append(f"| {level['levelNo']} | {level['riddle']} | {level['answer']} | {level.get('note', '')} |")
        lines.append("")
    return lines


def typo_section(levels):
    lines = ["## 三、成语找错字", "",
             "前面是人工整理的常见易错成语，其余由脚本按「同音常用字」自动替换生成。",
             "已自动排除：错误写法被词典收录为异形词的（如「莫明其妙」）、字盘里出现第二个正确写法的。",
             "请重点看自动生成的题：错字是否像真实会犯的笔误、有没有容易引起争议的写法。", "",
             "| 关 | 学段 | 题面 | 正确 | 字盘 |", "|---|---|---|---|---|"]
    for level in levels:
        lines.append(f"| {level['levelNo']} | {level['stage']} | {level['clue']} | {level['idiom']} | {''.join(level['board'])} |")
    lines.append("")
    return lines


def main():
    supplement = json.loads((ROOT / "scripts" / "data" / "poetry_supplement.json").read_text(encoding="utf-8"))
    lines = [
        "# 题库内容校对清单",
        "",
        "> 由 `python3 scripts/export_content_review.py` 生成，改动题库后重新生成。",
        "> 发现问题时修改 `scripts/data/` 下对应的清单或补录文件，再删除 `database/levels/<玩法>.json` 重新生成（**仅限上线前**；上线后只能追加）。",
        "",
    ]
    lines += poetry_section(read_levels("poetry"), supplement)
    lines += xiehouyu_section(read_levels("xiehouyu"))
    lines += typo_section(read_levels("typo"))
    OUTPUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"wrote {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
