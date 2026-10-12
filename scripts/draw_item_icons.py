"""Draw item icons (stamina = lightning, hint = light bulb) and the default avatar into assets/icons/.

Usage: .cache/venv/bin/python scripts/draw_item_icons.py   (needs Pillow)
Colors follow the 奶油糖果 palette in app.wxss.
"""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR = ROOT / "assets" / "icons"
SUPERSAMPLE = 4

LEMON = (255, 201, 60, 255)
LEMON_DEEP = (217, 150, 20, 255)
ORANGE = (255, 138, 61, 255)
ORANGE_DEEP = (217, 106, 34, 255)
CREAM = (255, 230, 211, 255)
INK = (61, 44, 30, 255)
WHITE = (255, 255, 255, 255)


def new_canvas(size):
    image = Image.new("RGBA", (size * SUPERSAMPLE, size * SUPERSAMPLE), (0, 0, 0, 0))
    return image, ImageDraw.Draw(image)


def finish(image, size, name):
    path = OUTPUT_DIR / name
    image.resize((size, size), Image.LANCZOS).save(path, optimize=True)
    print(f"wrote {path.relative_to(ROOT)} ({path.stat().st_size} bytes)")


def scaled(points):
    return [(x * SUPERSAMPLE, y * SUPERSAMPLE) for x, y in points]


def draw_stamina(size=96):
    image, draw = new_canvas(size)
    bolt = [(56, 6), (20, 54), (44, 54), (36, 90), (76, 38), (52, 38), (60, 6)]
    draw.polygon(scaled([(x, y + 3) for x, y in bolt]), fill=ORANGE_DEEP)
    draw.polygon(scaled(bolt), fill=ORANGE)
    draw.line(scaled(bolt + [bolt[0]]), fill=ORANGE_DEEP, width=3 * SUPERSAMPLE, joint="curve")
    finish(image, size, "stamina.png")


def draw_hint(size=96):
    image, draw = new_canvas(size)
    s = SUPERSAMPLE
    draw.ellipse([18 * s, 9 * s, 78 * s, 69 * s], fill=LEMON_DEEP)
    draw.ellipse([18 * s, 6 * s, 78 * s, 66 * s], fill=LEMON)
    draw.rounded_rectangle([34 * s, 58 * s, 62 * s, 78 * s], radius=4 * s, fill=LEMON)
    draw.rounded_rectangle([34 * s, 68 * s, 62 * s, 74 * s], radius=3 * s, fill=LEMON_DEEP)
    draw.rounded_rectangle([38 * s, 80 * s, 58 * s, 90 * s], radius=5 * s, fill=INK)
    draw.ellipse([30 * s, 18 * s, 44 * s, 32 * s], fill=WHITE)
    finish(image, size, "hint.png")


def draw_default_avatar(size=240):
    image, draw = new_canvas(size)
    s = SUPERSAMPLE
    draw.ellipse([0, 0, size * s, size * s], fill=CREAM)
    draw.ellipse([70 * s, 50 * s, 170 * s, 150 * s], fill=ORANGE)
    draw.ellipse([30 * s, 150 * s, 210 * s, 300 * s], fill=ORANGE)
    draw.ellipse([96 * s, 88 * s, 108 * s, 100 * s], fill=WHITE)
    draw.ellipse([132 * s, 88 * s, 144 * s, 100 * s], fill=WHITE)
    draw.arc([100 * s, 100 * s, 140 * s, 128 * s], start=20, end=160, fill=WHITE, width=5 * s)
    mask = Image.new("L", image.size, 0)
    ImageDraw.Draw(mask).ellipse([0, 0, size * s, size * s], fill=255)
    rounded = Image.new("RGBA", image.size, (0, 0, 0, 0))
    rounded.paste(image, (0, 0), mask)
    finish(rounded, size, "default-avatar.png")


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    draw_stamina()
    draw_hint()
    draw_default_avatar()


if __name__ == "__main__":
    main()
