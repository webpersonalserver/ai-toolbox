"""Draw item icons (stamina = lightning, hint = light bulb) and the default avatar into assets/icons/.

Usage: .cache/venv/bin/python scripts/draw_item_icons.py   (needs Pillow)
Colors follow the 奶油糖果 palette in app.wxss.
"""
from pathlib import Path

import math

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR = ROOT / "assets" / "icons"
SUPERSAMPLE = 4

LEMON = (255, 201, 60, 255)
LEMON_DEEP = (217, 150, 20, 255)
ORANGE = (255, 138, 61, 255)
ORANGE_DEEP = (217, 106, 34, 255)
CREAM = (255, 230, 211, 255)
CORAL = (255, 107, 107, 255)
CORAL_DEEP = (217, 76, 76, 255)
HEART_EMPTY = (241, 227, 204, 255)
HEART_EMPTY_DEEP = (226, 208, 180, 255)
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


HEART_CURVE_STEPS = 240
HEART_ROUNDING = 9


def heart_mask(size, offset_y=0):
    """Classic parametric heart, then a morphological opening to round off the bottom tip."""
    scale = size * SUPERSAMPLE / 36
    centre_x, centre_y = size * SUPERSAMPLE / 2, size * SUPERSAMPLE * 0.46 + offset_y * SUPERSAMPLE
    points = []
    for step in range(HEART_CURVE_STEPS):
        t = 2 * math.pi * step / HEART_CURVE_STEPS
        x = 16 * math.sin(t) ** 3
        y = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        points.append((centre_x + x * scale, centre_y - y * scale))
    mask = Image.new("L", (size * SUPERSAMPLE, size * SUPERSAMPLE), 0)
    ImageDraw.Draw(mask).polygon(points, fill=255)
    kernel = HEART_ROUNDING * SUPERSAMPLE + 1
    return mask.filter(ImageFilter.MinFilter(kernel)).filter(ImageFilter.MaxFilter(kernel))


def draw_heart(name, fill, shadow, size=96, highlight=True):
    image, _ = new_canvas(size)
    for color, offset in ((shadow, 4), (fill, 0)):
        layer = Image.new("RGBA", image.size, color)
        image.paste(layer, (0, 0), heart_mask(size, offset))
    if highlight:
        s = SUPERSAMPLE
        ImageDraw.Draw(image).ellipse([24 * s, 26 * s, 36 * s, 38 * s], fill=WHITE)
    finish(image, size, name)


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
    draw_heart("heart-full.png", CORAL, CORAL_DEEP)
    draw_heart("heart-empty.png", HEART_EMPTY, HEART_EMPTY_DEEP, highlight=False)


if __name__ == "__main__":
    main()
