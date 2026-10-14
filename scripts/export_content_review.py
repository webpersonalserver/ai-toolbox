"""Write docs/content-review.md: the level content that needs a human proofread (poetry, xiehouyu, typo, idiom wording, hanzi).

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
    lines = ["## 二、歇后语", "", "全部人工挑选，答案取自数据源。「原文」列是数据源里带谐音/释义括号的原始写法。",
             "「意思」是自己写的大白话，答题前就显示（`scripts/data/xiehouyu_meanings.json`），请看准不准、孩子懂不懂。", ""]
    by_stage = OrderedDict()
    for level in levels:
        by_stage.setdefault(level["stage"], []).append(level)
    for stage, stage_levels in by_stage.items():
        lines += [f"### {stage}（{len(stage_levels)} 关）", "", "| 关 | 谜面 | 答案 | 意思 | 原文 |", "|---|---|---|---|---|"]
        for level in stage_levels:
            lines.append(f"| {level['levelNo']} | {level['riddle']} | {level['answer']} | {level.get('meaning', '')} | {level.get('note', '')} |")
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


HANZI_KIND_NAMES = {"picture": "看图识字", "pinyin": "拼音选字", "radical": "认偏旁", "word": "选字组词"}


def hanzi_section(levels):
    lines = ["## 五、汉字闯关", "",
             "字池来自教育部 2022 课标常用字表的字表一，按常用程度和笔画选出，不是按课本逐课排列。",
             "四个选项里只有一个对：组词题的干扰字已排除「填进去也能组成词」的情况。请看：题目孩子看不看得懂、",
             "看图识字的图是否只对应这一个字、例词是否常用。看图用 `scripts/data/hanzi_pictures.txt`，组词用 `hanzi_words.txt`。", "",
             "| 关 | 题型 | 题目 | 选项 | 答案 | 例词 |", "|---|---|---|---|---|---|"]
    for level in levels:
        lines.append(f"| {level['levelNo']} | {HANZI_KIND_NAMES[level['kind']]} | {level['clue']} | {' '.join(level['board'])} | {level['answer']} | {level.get('word', '')} |")
    return lines + [""]


def pinyin_section():
    overrides = json.loads((ROOT / "scripts" / "data" / "answer_pinyin_overrides.json").read_text(encoding="utf-8"))
    by_key = {(level["gameType"], level.get("sourceKey")): level for game in ("poetry", "xiehouyu") for level in read_levels(game)}
    lines = ["## 六、拼音辅助的人工读音", "",
             "答案格上方的拼音由脚本按整句自动注音，下面这些多音字自动读错了，已人工改正（`scripts/data/answer_pinyin_overrides.json`）。",
             "请看读音是否和课本一致；其余关卡的拼音也可以抽查。", "",
             "| 玩法 | 关 | 句子 | 答案 | 拼音 |", "|---|---|---|---|---|"]
    names = {"poetry": "诗词", "xiehouyu": "歇后语"}
    for game in ("poetry", "xiehouyu"):
        for key, syllables in overrides[game].items():
            level = by_key[(game, key)]
            sentence = level.get("verse") or f"{level['riddle']}——{level['answer']}"
            lines.append(f"| {names[game]} | {level['levelNo']} | {sentence} | {level['answer']} | {syllables} |")
    return lines + [""]


def idiom_section(explanations):
    lines = ["## 四、成语释义（自己改写的表述）", "",
             "为避免使用词典原文，1015 个成语的释义都改写成了自己的表述（`scripts/data/idiom_explanations.json`），",
             "猜成语和找错字共用。请重点看：意思是否准确、孩子能不能看懂、有没有歧义。",
             "改动后运行 `python3 scripts/apply_idiom_explanations.py` 写回题库，再重新导入 `idiom.json` 和 `typo.json`。", "",
             "| 成语 | 释义 |", "|---|---|"]
    lines += [f"| {idiom} | {text} |" for idiom, text in explanations.items()]
    lines.append("")
    return lines


def main():
    supplement = json.loads((ROOT / "scripts" / "data" / "poetry_supplement.json").read_text(encoding="utf-8"))
    lines = [
        "# 题库内容校对清单",
        "",
        "> 由 `python3 scripts/export_content_review.py` 生成，改动题库后重新生成。",
        "> 发现问题时修改 `scripts/data/` 下对应的清单或补录文件，再删除 `database/levels/<玩法>.json` 重新生成（**仅限上线前**；上线后只能追加）。",
        "> 成语释义例外：改 `scripts/data/idiom_explanations.json` 后用 `scripts/apply_idiom_explanations.py` 原地替换，上线后也可以改。",
        "",
    ]
    lines += poetry_section(read_levels("poetry"), supplement)
    lines += xiehouyu_section(read_levels("xiehouyu"))
    lines += typo_section(read_levels("typo"))
    explanations = json.loads((ROOT / "scripts" / "data" / "idiom_explanations.json").read_text(encoding="utf-8"))
    lines += idiom_section(explanations)
    lines += hanzi_section(read_levels("hanzi"))
    lines += pinyin_section()
    OUTPUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"wrote {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
