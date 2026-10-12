"""Draw the tabBar icons (simple rounded geometric shapes) into assets/tabbar/.

Usage: .cache/venv/bin/python scripts/draw_tab_icons.py   (needs Pillow)
WeChat tabBar icons must be local PNG files (no SVG), 81×81 recommended, under 40KB each.
Colors follow the 奶油糖果 palette in app.wxss: --color-ink-faint (normal) and --color-primary (active).
"""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR = ROOT / "assets" / "tabbar"
SIZE = 81
SUPERSAMPLE = 4
STROKE = 7 * SUPERSAMPLE
CUTOUT = (255, 255, 255, 255)
COLORS = {"normal": (188, 169, 147, 255), "active": (255, 138, 61, 255)}


def scaled(*values):
    return [value * SUPERSAMPLE for value in values]


def draw_hall(draw, color, filled):
    draw.line([tuple(scaled(10, 38)), tuple(scaled(40.5, 12)), tuple(scaled(71, 38))], fill=color, width=STROKE, joint="curve")
    draw.rounded_rectangle(scaled(18, 36, 63, 70), radius=8 * SUPERSAMPLE, outline=color, width=STROKE, fill=color if filled else None)
    draw.rounded_rectangle(scaled(34, 50, 47, 70), radius=4 * SUPERSAMPLE, fill=CUTOUT if filled else color)


def draw_leaderboard(draw, color, filled):
    for bar in (scaled(9, 40, 29, 70), scaled(30.5, 22, 50.5, 70), scaled(52, 48, 72, 70)):
        draw.rounded_rectangle(bar, radius=5 * SUPERSAMPLE, outline=color, width=STROKE, fill=color if filled else None)
    if filled:
        draw.ellipse(scaled(36, 32, 45, 41), fill=CUTOUT)


def draw_mine(draw, color, filled):
    draw.ellipse(scaled(26, 10, 55, 39), outline=color, width=STROKE, fill=color if filled else None)
    draw.rounded_rectangle(scaled(12, 46, 69, 72), radius=13 * SUPERSAMPLE, outline=color, width=STROKE, fill=color if filled else None)


ICONS = {"hall": draw_hall, "leaderboard": draw_leaderboard, "mine": draw_mine}


def render(draw_icon, color, filled):
    image = Image.new("RGBA", (SIZE * SUPERSAMPLE, SIZE * SUPERSAMPLE), (0, 0, 0, 0))
    draw_icon(ImageDraw.Draw(image), color, filled)
    return image.resize((SIZE, SIZE), Image.LANCZOS)


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for name, draw_icon in ICONS.items():
        for state, color in COLORS.items():
            path = OUTPUT_DIR / f"{name}-{state}.png"
            render(draw_icon, color, filled=state == "active").save(path, optimize=True)
            print(f"wrote {path.relative_to(ROOT)} ({path.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
