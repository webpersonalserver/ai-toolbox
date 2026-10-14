"""Draw 喵算算, the 数理乐园 mascot: a round orange cat face, into assets/mascot/.

Usage: .cache/venv/bin/python scripts/draw_mascot.py   (needs Pillow)
Two moods: normal (round shiny eyes) and happy (closed smiling eyes). Colors follow the 奶油糖果 palette in app.wxss.
To use an illustrated version instead, overwrite the PNGs with the same names; no code change is needed.
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR = ROOT / "assets" / "mascot"
SIZE = 240
SUPERSAMPLE = 4

ORANGE = (255, 159, 74, 255)
ORANGE_DEEP = (229, 118, 42, 255)
CREAM = (255, 240, 220, 255)
INK = (61, 44, 30, 255)
BLUSH = (255, 143, 143, 200)
EAR_INNER = (255, 196, 186, 255)
WHITE = (255, 255, 255, 255)
OUTLINE = 6


def s(*values):
    return [value * SUPERSAMPLE for value in values]


def rounded_ear(draw, points, fill):
    """A triangle with soft corners: draw it, then round it with a blur-threshold pass on its own layer."""
    layer = Image.new("L", (SIZE * SUPERSAMPLE, SIZE * SUPERSAMPLE), 0)
    ImageDraw.Draw(layer).polygon([(x * SUPERSAMPLE, y * SUPERSAMPLE) for x, y in points], fill=255)
    softened = layer.filter(ImageFilter.GaussianBlur(9 * SUPERSAMPLE)).point(lambda value: 255 if value > 110 else 0)
    color = Image.new("RGBA", layer.size, fill)
    return color, softened


def draw_face(happy):
    image = Image.new("RGBA", (SIZE * SUPERSAMPLE, SIZE * SUPERSAMPLE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    # Ears: outline, orange, inner pink.
    for left_side in (True, False):
        mirror = (lambda x: x) if left_side else (lambda x: SIZE - x)
        outer = [(mirror(30), 108), (mirror(52), 18), (mirror(108), 66)]
        inner = [(mirror(48), 92), (mirror(58), 44), (mirror(90), 70)]
        for points, fill, grow in ((outer, INK, OUTLINE), (outer, ORANGE, 0), (inner, EAR_INNER, 0)):
            grown = points if not grow else [(x + (-grow if x < SIZE / 2 else grow), y - grow) for x, y in points]
            color, mask = rounded_ear(draw, grown, fill)
            image.paste(color, (0, 0), mask)
    draw = ImageDraw.Draw(image)

    # Head: a wide squishy circle with a cream muzzle.
    head = (18, 52, SIZE - 18, SIZE - 12)
    draw.ellipse(s(head[0] - OUTLINE, head[1] - OUTLINE, head[2] + OUTLINE, head[3] + OUTLINE), fill=INK)
    draw.ellipse(s(*head), fill=ORANGE)
    draw.ellipse(s(26, 150, SIZE - 26, SIZE - 18), fill=ORANGE_DEEP)
    draw.ellipse(s(24, 140, SIZE - 24, SIZE - 22), fill=ORANGE)
    draw.ellipse(s(72, 138, SIZE - 72, SIZE - 30), fill=CREAM)
    # Forehead stripes.
    for x in (102, 120, 138):
        draw.rounded_rectangle(s(x - 4, 60, x + 4, 84), radius=4 * SUPERSAMPLE, fill=ORANGE_DEEP)

    # Eyes.
    if happy:
        for cx in (78, SIZE - 78):
            draw.arc(s(cx - 20, 104, cx + 20, 140), start=200, end=340, fill=INK, width=7 * SUPERSAMPLE)
    else:
        for cx in (80, SIZE - 80):
            draw.ellipse(s(cx - 18, 102, cx + 18, 142), fill=INK)
            draw.ellipse(s(cx - 9, 108, cx + 3, 120), fill=WHITE)
            draw.ellipse(s(cx + 4, 126, cx + 10, 132), fill=WHITE)

    # Blush.
    blush = Image.new("RGBA", image.size, (0, 0, 0, 0))
    blush_draw = ImageDraw.Draw(blush)
    for cx in (52, SIZE - 52):
        blush_draw.ellipse(s(cx - 18, 146, cx + 18, 166), fill=BLUSH)
    image = Image.alpha_composite(image, blush.filter(ImageFilter.GaussianBlur(2 * SUPERSAMPLE)))
    draw = ImageDraw.Draw(image)

    # Nose and the ω mouth.
    draw.polygon(s(112, 150, 128, 150, 120, 160), fill=INK)
    draw.arc(s(100, 154, 120, 174), start=20, end=160, fill=INK, width=5 * SUPERSAMPLE)
    draw.arc(s(120, 154, 140, 174), start=20, end=160, fill=INK, width=5 * SUPERSAMPLE)
    if happy:
        draw.ellipse(s(110, 168, 130, 186), fill=(232, 86, 86, 255))

    # Whiskers.
    for y, tilt in ((150, -6), (164, 2)):
        draw.line(s(30, y + tilt, 66, y), fill=INK, width=3 * SUPERSAMPLE)
        draw.line(s(SIZE - 30, y + tilt, SIZE - 66, y), fill=INK, width=3 * SUPERSAMPLE)
    return image


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for name, happy in (("normal", False), ("happy", True)):
        path = OUTPUT_DIR / f"{name}.png"
        draw_face(happy).resize((SIZE, SIZE), Image.LANCZOS).save(path, optimize=True)
        print(f"wrote {path.relative_to(ROOT)} ({path.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
