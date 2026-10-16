"""Poetry levels: complete a line of a classical poem.

Stages go from easy to hard (scripts/data/poetry_stages.txt): 入门 → 初级 → 中级 → 高级 → 大师. Later stages blank out more characters. Texts come from
scripts/data/poetry_supplement.json (school editions, hand-entered) first, then the
chinese-poetry dataset, preferring the anthologies whose wording matches textbooks.

Requires OpenCC (traditional → simplified): run with .cache/venv/bin/python.
"""
import glob
import json
import re
import sys
from pathlib import Path

from .common import DATA_DIR, Candidate, CJK_ONLY, read_stage_blocks, text_difficulty

GAME_TYPE = "poetry"
CLAUSE_SPLIT = re.compile(r"[，。！？；：、]")
BLANK_MARK = "□"
FULL_BLANK = "full"
MIN_FULL_CLAUSE = 4
MIN_LEAD_CLAUSE = 4
TITLE_SEPARATORS = re.compile(r"[·・]")
MAX_ANSWER_LENGTH = 7
ANTHOLOGY_SOURCES = ("mx_tang300", "qianjiashi", "tang300", "song300")
AUTHOR_ALIASES = {"李煜": ("李煜", "后主煜")}
SPEC = re.compile(r"^(?P<title>.+?)@(?P<author>[^#]+)(?:#(?P<prefix>.+))?$")


def load_converter():
    try:
        from opencc import OpenCC
    except ImportError:
        sys.exit("poetry builder needs OpenCC: run with .cache/venv/bin/python (pip install opencc-python-reimplemented)")
    return OpenCC("t2s").convert


def split_author(raw_author, to_simplified):
    author = to_simplified(raw_author or "").strip()
    match = re.match(r"^[（(](.+?)[)）](.+)$", author)
    return (match.group(2), match.group(1)) if match else (author, "")


def flatten_paragraphs(paragraphs):
    if paragraphs and isinstance(paragraphs[0], dict):
        return None
    return "".join(paragraphs)


def load_corpus(data_dir, to_simplified, replacements):
    poetry_dir = Path(data_dir) / "poetry"
    poems = []

    def add(title, author, dynasty, text, source):
        if text is None:
            return
        text = to_simplified(text)
        for old, new in replacements:
            text = text.replace(old, new)
        poems.append({
            "title": to_simplified(title).strip(), "author": author, "dynasty": dynasty,
            "text": text, "source": source, "anthology": source in ANTHOLOGY_SOURCES,
        })

    for group in json.loads((poetry_dir / "mx_tang300.json").read_text(encoding="utf-8"))["content"]:
        for poem in group["content"]:
            add(poem["chapter"], to_simplified(poem["author"]), "唐", flatten_paragraphs(poem["paragraphs"]), "mx_tang300")
    for group in json.loads((poetry_dir / "qianjiashi.json").read_text(encoding="utf-8"))["content"]:
        for poem in group["content"]:
            author, dynasty = split_author(poem["author"], to_simplified)
            parts = poem["paragraphs"]
            if parts and isinstance(parts[0], dict):
                for part in parts:
                    add(poem["chapter"], author, dynasty, flatten_paragraphs(part["paragraphs"]), "qianjiashi")
            else:
                add(poem["chapter"], author, dynasty, flatten_paragraphs(parts), "qianjiashi")
    for poem in json.loads((poetry_dir / "tang300.json").read_text(encoding="utf-8")):
        add(poem["title"], to_simplified(poem["author"]), "唐", flatten_paragraphs(poem["paragraphs"]), "tang300")
    for poem in json.loads((poetry_dir / "song300.json").read_text(encoding="utf-8")):
        add(poem["rhythmic"], poem["author"], "宋", flatten_paragraphs(poem["paragraphs"]), "song300")
    for path in sorted(glob.glob(str(poetry_dir / "tang" / "poet.tang.*.json"))):
        for poem in json.loads(Path(path).read_text(encoding="utf-8")):
            add(poem["title"], to_simplified(poem["author"]), "唐", flatten_paragraphs(poem["paragraphs"]), "quantangshi")
    for path in sorted(glob.glob(str(poetry_dir / "ci" / "ci.song.*.json"))):
        for poem in json.loads(Path(path).read_text(encoding="utf-8")):
            add(poem["rhythmic"], poem["author"], "宋", flatten_paragraphs(poem["paragraphs"]), "quansongci")
    return poems


def matches_title(poem, title):
    return poem["title"] == title or TITLE_SEPARATORS.split(poem["title"])[0] == title or poem["title"].startswith(title)


def find_poem(spec, supplement, corpus_by_author):
    match = SPEC.match(spec)
    if not match:
        sys.exit(f"[poetry] bad spec: {spec}")
    title, author, prefix = match.group("title"), match.group("author"), match.group("prefix")
    for poem in supplement:
        if poem["author"] == author and poem["title"] == title and (not prefix or poem["text"].startswith(prefix)):
            return {**poem, "source": "supplement"}
    pool = [poem for alias in AUTHOR_ALIASES.get(author, (author,)) for poem in corpus_by_author.get(alias, [])]
    hits = [poem for poem in pool if (poem["text"].startswith(prefix) if prefix else matches_title(poem, title))]
    hits.sort(key=lambda poem: (not poem["anthology"], ANTHOLOGY_SOURCES.index(poem["source"]) if poem["anthology"] else 0))
    return {**hits[0], "title": title, "author": author} if hits else None


def clauses_of(text):
    return [clause for clause in CLAUSE_SPLIT.split(text) if clause]


def build_poem_candidates(poem, stage_index, stage, poem_score):
    blank_option = stage["options"].get("blank", FULL_BLANK)
    max_couplets = int(stage["options"].get("couplets", 1))
    clauses = clauses_of(poem["text"])
    candidates = []
    for pair_index in range(0, len(clauses) - 1, 2):
        if len(candidates) >= max_couplets:
            break
        lead, target = clauses[pair_index], clauses[pair_index + 1]
        if not (CJK_ONLY.match(lead) and CJK_ONLY.match(target)) or len(lead) < MIN_LEAD_CLAUSE:
            continue
        if blank_option == FULL_BLANK:
            if not MIN_FULL_CLAUSE <= len(target) <= MAX_ANSWER_LENGTH:
                continue
            blank_length = len(target)
        else:
            blank_length = int(blank_option)
            if len(target) <= blank_length:
                continue
        answer = target[-blank_length:]
        couplet_round = len(candidates)
        candidates.append(Candidate(
            key=f"{poem['author']}|{poem['title']}|{pair_index // 2}",
            tier=stage_index,
            score=(couplet_round, poem_score),
            answer=answer,
            dedupe_key=f"{lead}，{target}。",
            fields={
                "answer": answer,
                "clue": f"{lead}，{target[:-blank_length]}{BLANK_MARK * blank_length}",
                "verse": f"{lead}，{target}。",
                "poemTitle": poem["title"],
                "author": poem["author"],
                "dynasty": poem.get("dynasty", ""),
                "stage": stage["name"],
            },
        ))
    return candidates


def first_clause(text):
    clauses = clauses_of(text)
    return clauses[0] if clauses else ""


def is_same_poem(left, right):
    """Identical opening clause (any author), or same author with at most one differing character (edition variants)."""
    left_opening, right_opening = first_clause(left["text"]), first_clause(right["text"])
    if left_opening == right_opening:
        return True
    if left["author"] != right["author"]:
        return False
    if len(left_opening) != len(right_opening):
        return False
    return sum(a != b for a, b in zip(left_opening, right_opening)) <= 1


CATEGORY_PREFIX = re.compile(r"^(杂曲歌辞|鼓吹曲辞|横吹曲辞|相和歌辞|清商曲辞|琴曲歌辞|舞曲歌辞|近代曲辞|郊庙歌辞|燕射歌辞)\s*")
TRAILING_SEQUENCE = re.compile(r"\s*(其)?[一二三四五六七八九十]*\s*$")


def display_title(raw_title):
    title = CATEGORY_PREFIX.sub("", TITLE_SEPARATORS.split(raw_title)[0])
    title = re.sub(r"[一二三四五六七八九十百]+首$", "", TRAILING_SEQUENCE.sub("", title))
    return title.strip()


def build_candidates(data_dir, char_rarity, is_common_char):
    supplement_doc = json.loads((DATA_DIR / "poetry_supplement.json").read_text(encoding="utf-8"))
    to_simplified = load_converter()
    corpus = load_corpus(data_dir, to_simplified, supplement_doc["variantReplacements"])
    corpus_by_author = {}
    for poem in corpus:
        corpus_by_author.setdefault(poem["author"], []).append(poem)

    candidates, missing, used_poems = [], [], []
    for stage_index, stage in enumerate(read_stage_blocks(DATA_DIR / "poetry_stages.txt")):
        poems = []
        for spec in stage["entries"]:
            poem = find_poem(spec, supplement_doc["poems"], corpus_by_author)
            if poem is None:
                missing.append(f"{stage['name']}:{spec}")
            else:
                poems.append(poem)
        if stage["options"].get("auto"):
            poems += [{**poem, "title": display_title(poem["title"])} for poem in corpus if poem["anthology"]]
        for poem in poems:
            if any(is_same_poem(poem, used) for used in used_poems):
                continue
            used_poems.append(poem)
            poem_score = text_difficulty(poem["text"], char_rarity) / max(len(poem["text"]), 1)
            candidates += build_poem_candidates(poem, stage_index, stage, round(poem_score, 6))
    if missing:
        sys.exit("[poetry] not found in supplement or dataset (add a #first-line hint or a supplement entry):\n  "
                 + "\n  ".join(missing))
    return candidates


def level_key_of(level):
    return level["sourceKey"]


def level_dedupe_of(level):
    return level["verse"]
