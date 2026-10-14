"""Turn the white-background illustrations in scripts/art-source/ into small transparent PNGs for the app.

Usage: python scripts/prepare_art.py   (needs Pillow)
- 喵算算 expressions -> assets/mascot/<mood>.png (main package: every practice page shows the cat)
- island pictures    -> packageMath/assets/islands/<island id>.png (only the 数理乐园 map uses them)
The white background is removed by flooding inward from the image border, so white inside the outlines
(eyes, foam, clouds) stays. Sources stay in scripts/ (not uploaded); rerun after replacing one.
"""
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SOURCE_DIR = ROOT / "scripts" / "art-source"

# source file -> (output path, longest side in px). Sizes are about 3x the largest rpx size shown on a phone.
TARGETS = {
    "miaosuansuan_normal.jpg": ("assets/mascot/normal.png", 320),
    "miaosuansuan_happy.jpg": ("assets/mascot/happy.png", 320),
    "miaosuansuan_cheer.jpg": ("assets/mascot/cheer.png", 320),
    "miaosuansuan_confused.jpg": ("assets/mascot/wink.png", 320),
    "counting.jpg": ("packageMath/assets/islands/counting.png", 400),
    "make-ten.jpg": ("packageMath/assets/islands/make-ten.png", 400),
    "hundred.jpg": ("packageMath/assets/islands/hundred.png", 400),
    "times-table.jpg": ("packageMath/assets/islands/times-table.png", 400),
    "ten-thousand.jpg": ("packageMath/assets/islands/ten-thousand.png", 400),
}

# Working size for the flood fill: big enough for clean edges, small enough to be quick.
WORK_SIZE = 800
# Summed RGB distance from the seed still counted as background (JPEG noise on white is ~20).
BACKGROUND_THRESHOLD = 30
# A border pixel is a background seed only if every channel is at least this bright.
SEED_MIN_BRIGHTNESS = 235
SEED_STEP = 8
MARKER = (255, 0, 255)
PADDING_RATIO = 0.02
PALETTE_COLORS = 256


def background_mask(image):
    """L mask: 255 where the pixel is background connected to the image border."""
    flooded = image.copy()
    width, height = flooded.size
    border = [(x, y) for x in range(0, width, SEED_STEP) for y in (0, height - 1)]
    border += [(x, y) for y in range(0, height, SEED_STEP) for x in (0, width - 1)]
    for point in border:
        pixel = flooded.getpixel(point)
        if pixel != MARKER and min(pixel) >= SEED_MIN_BRIGHTNESS:
            ImageDraw.floodfill(flooded, point, MARKER, thresh=BACKGROUND_THRESHOLD)
    marker_layer = Image.new("RGB", flooded.size, MARKER)
    difference = ImageChops.difference(flooded, marker_layer).convert("L")
    return difference.point(lambda value: 255 if value == 0 else 0)


def cut_out(source_path):
    image = Image.open(source_path).convert("RGB")
    image.thumbnail((WORK_SIZE, WORK_SIZE), Image.LANCZOS)
    # Grow the background by a pixel and blur it, so the white JPEG fringe around the outline fades out.
    background = background_mask(image).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(1))
    alpha = ImageChops.invert(background)
    cutout = image.convert("RGBA")
    cutout.putalpha(alpha)
    return cutout.crop(alpha.point(lambda value: 255 if value > 16 else 0).getbbox())


def pad_square(image):
    side = int(max(image.size) * (1 + PADDING_RATIO * 2))
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(image, ((side - image.width) // 2, (side - image.height) // 2))
    return canvas


def main():
    for source_name, (output_name, longest_side) in TARGETS.items():
        cutout = pad_square(cut_out(SOURCE_DIR / source_name))
        cutout.thumbnail((longest_side, longest_side), Image.LANCZOS)
        output_path = ROOT / output_name
        output_path.parent.mkdir(parents=True, exist_ok=True)
        cutout.quantize(colors=PALETTE_COLORS, method=Image.Quantize.FASTOCTREE).save(output_path, optimize=True)
        print(f"{output_name}: {cutout.size[0]}x{cutout.size[1]}, {output_path.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
