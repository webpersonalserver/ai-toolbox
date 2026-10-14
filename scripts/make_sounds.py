"""Synthesize the practice sound effects into assets/sounds/ (standard library only).

Usage: python3 scripts/make_sounds.py
Short, soft tones so no third-party audio (and no licensing) is needed.
"""
import math
import random
import struct
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR = ROOT / "assets" / "sounds"
SAMPLE_RATE = 22050
PEAK = 0.6
CLAP_SEED = 7
CHEST_SEED = 11


def tone(frequency, seconds, decay=6.0):
    samples = []
    count = int(SAMPLE_RATE * seconds)
    for index in range(count):
        t = index / SAMPLE_RATE
        envelope = math.exp(-decay * t) * min(1.0, t * 200)
        value = math.sin(2 * math.pi * frequency * t) + 0.3 * math.sin(4 * math.pi * frequency * t)
        samples.append(value * envelope / 1.3)
    return samples


def clap(rng, seconds=0.09):
    """A handclap: a short burst of noise, roughened by a fast decay."""
    count = int(SAMPLE_RATE * seconds)
    previous = 0.0
    samples = []
    for index in range(count):
        noise = rng.uniform(-1, 1)
        high_passed = noise - previous
        previous = noise
        samples.append(high_passed * math.exp(-40 * index / SAMPLE_RATE) * 0.5)
    return samples


def applause(start, seconds, claps_per_second, rng):
    """Many claps at random moments, like a small crowd cheering."""
    return [(start + rng.uniform(0, seconds), clap(rng)) for _ in range(int(seconds * claps_per_second))]


GONG_PARTIALS = ((1.0, 1.0), (2.76, 0.5), (5.4, 0.25), (8.93, 0.12))


def gong(base_frequency=110.0, seconds=2.4):
    """A struck gong: inharmonic partials with a slow swell and long decay."""
    samples = []
    for index in range(int(SAMPLE_RATE * seconds)):
        t = index / SAMPLE_RATE
        swell = min(1.0, t * 40) * math.exp(-1.6 * t)
        value = sum(weight * math.sin(2 * math.pi * base_frequency * ratio * t) for ratio, weight in GONG_PARTIALS)
        samples.append(value * swell)
    return samples


def mix_sequence(notes, extras=()):
    """notes: list of (start_seconds, frequency, length_seconds); extras: list of (start_seconds, samples)."""
    layers = [(start, tone(frequency, length)) for start, frequency, length in notes] + list(extras)
    total = max(start + len(samples) / SAMPLE_RATE for start, samples in layers)
    buffer = [0.0] * int(SAMPLE_RATE * total + 1)
    for start, samples in layers:
        offset = int(SAMPLE_RATE * start)
        for index, value in enumerate(samples):
            if offset + index < len(buffer):
                buffer[offset + index] += value
    loudest = max(abs(value) for value in buffer) or 1
    return [value / loudest * PEAK for value in buffer]


def write(name, samples):
    path = OUTPUT_DIR / name
    with wave.open(str(path), "w") as file:
        file.setnchannels(1)
        file.setsampwidth(2)
        file.setframerate(SAMPLE_RATE)
        file.writeframes(b"".join(struct.pack("<h", int(value * 32767)) for value in samples))
    print(f"wrote {path.relative_to(ROOT)} ({path.stat().st_size} bytes)")


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    rng = random.Random(CLAP_SEED)
    sparkle = [(0.32 + index * 0.05, frequency, 0.2) for index, frequency in enumerate((2093.0, 2637.0, 3136.0, 4186.0))]
    write("correct.wav", mix_sequence(
        [(0, 1046.5, 0.2), (0.07, 1318.5, 0.2), (0.14, 1568.0, 0.25), (0.21, 2093.0, 0.45)] + sparkle,
        applause(0.25, 0.5, 24, rng),
    ))
    fanfare = [(0, 523.3, 0.25), (0.12, 659.3, 0.25), (0.24, 784.0, 0.25), (0.36, 1046.5, 0.9), (0.36, 1318.5, 0.9), (0.36, 1568.0, 0.9)]
    twinkles = [(0.6 + index * 0.06, frequency, 0.25) for index, frequency in enumerate((2093.0, 2637.0, 3136.0, 4186.0, 3136.0, 4186.0))]
    write("milestone.wav", mix_sequence(fanfare + twinkles, applause(0.4, 1.4, 40, rng)))
    write("gong.wav", mix_sequence([(0.05, 523.3, 0.6), (0.05, 784.0, 0.6)], [(0, gong())]))
    write("wrong.wav", mix_sequence([(0, 392.0, 0.16), (0.12, 330.0, 0.22)]))
    # Chest opening: the lid pops, coins run up a fast scale, a big chord lands, then sparkles and cheering.
    chest_rng = random.Random(CHEST_SEED)
    lid_pop = [(0, clap(chest_rng, 0.12)), (0.02, tone(196.0, 0.25, decay=14.0))]
    coin_run = [(0.1 + index * 0.045, frequency, 0.18) for index, frequency in enumerate((523.3, 659.3, 784.0, 1046.5, 1318.5, 1568.0, 2093.0))]
    big_chord = [(0.44, frequency, 1.1) for frequency in (523.3, 659.3, 784.0, 1046.5, 1568.0)]
    shimmer = [(0.62 + index * 0.07, frequency, 0.22) for index, frequency in enumerate((3136.0, 4186.0, 3520.0, 4699.0, 3136.0, 4186.0, 5274.0))]
    write("chest.wav", mix_sequence(coin_run + big_chord + shimmer, lid_pop + applause(0.5, 1.3, 46, chest_rng)))


if __name__ == "__main__":
    main()
