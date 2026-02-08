#!/usr/bin/env python3
"""
Build runtime sprite assets in public/assets/sprites/locked/.

This script intentionally avoids non-stdlib dependencies (beyond Pillow) so it can run in a clean
environment. Source renders live under art/ and are not shipped.
"""

from __future__ import annotations

from collections import deque
from pathlib import Path
import sys

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "art/public-assets/generated-v3/raw"
OUT = ROOT / "public/assets/sprites/locked"
OUT.mkdir(parents=True, exist_ok=True)

SRC = {
    "chicken": "chicken-v3",
    "chick": "chick-v3",
    "egg": "egg-v3",
    # Needs an open bowl so contents make sense; v3b has an open bowl and no cast shadow.
    "potty": "potty-v3b",
    "jetpack": "jetpack-v3",
    "disco-ball": "disco-ball-v7",
    "tractor": "tractor-v3b",
    "hay": "hay-v3",
    "butterfly": "butterfly-v3",
    "rain-cloud": "rain-cloud-v3",
    "rainbow": "rainbow-v3",
    "coop": "coop-v5",
    "barn": "barn-v5",
}

SIZES = {
    "chicken": (640, 640),
    "chick": (420, 420),
    "egg": (360, 460),
    "potty": (540, 460),
    "jetpack": (560, 420),
    "disco-ball": (500, 500),
    "tractor": (620, 420),
    "hay": (620, 360),
    "butterfly": (520, 380),
    "rain-cloud": (560, 360),
    "rainbow": (620, 360),
    "coop": (760, 620),
    "barn": (640, 640),
}


def find_src(stem: str) -> Path:
    for ext in (".png", ".jpg", ".jpeg", ".webp"):
        p = RAW / f"{stem}{ext}"
        if p.exists():
            return p
    raise FileNotFoundError(stem)


def alpha_from_edge_flood(rgb: Image.Image) -> Image.Image:
    """Key out candidate background pixels by flood-filling from the edges."""
    w, h = rgb.size
    px = rgb.load()

    # Candidate background heuristic: neutral-ish checker/gray or vivid green screen.
    lum_near = (76, 90, 104, 118, 132, 146, 160, 174, 188, 202, 216, 230, 242)
    cand = bytearray(w * h)
    for y in range(h):
        row = y * w
        for x in range(w):
            r, g, b = px[x, y]
            maxc = max(r, g, b)
            minc = min(r, g, b)
            sat = maxc - minc
            lum = (r + g + b) // 3

            neutral = sat < 24
            near = False
            if neutral:
                for c in lum_near:
                    if abs(lum - c) <= 10:
                        near = True
                        break
            bright_neutral = lum > 242 and sat < 16
            green_bg = g > 140 and g > r + 24 and g > b + 24
            cand[row + x] = 1 if ((neutral and near) or bright_neutral or green_bg) else 0

    visited = bytearray(w * h)
    q: deque[tuple[int, int]] = deque()

    for x in range(w):
        q.append((x, 0))
        q.append((x, h - 1))
    for y in range(h):
        q.append((0, y))
        q.append((w - 1, y))

    while q:
        x, y = q.popleft()
        if x < 0 or y < 0 or x >= w or y >= h:
            continue
        idx = y * w + x
        if visited[idx] or not cand[idx]:
            continue
        visited[idx] = 1
        q.append((x + 1, y))
        q.append((x - 1, y))
        q.append((x, y + 1))
        q.append((x, y - 1))

    alpha = bytearray(w * h)
    fg = 0
    for i in range(w * h):
        if visited[i]:
            alpha[i] = 0
        else:
            alpha[i] = 255
            fg += 1

    # If we accidentally keyed almost everything, keep opaque.
    if fg < 1200:
        for i in range(w * h):
            alpha[i] = 255

    return Image.frombytes("L", (w, h), bytes(alpha))


def alpha_from_edge_seed_flood(
    rgb: Image.Image,
    *,
    border: int = 24,
    seed_count: int = 6,
    tol_l1: int = 78,
) -> Image.Image:
    """
    Background finder for cases like checkerboard/jpg compression:
    1) sample the most common border colors (quantized)
    2) flood-fill from edges through pixels close to those colors
    """
    w, h = rgb.size
    px = rgb.load()

    b = min(border, h // 2, w // 2)

    counts: dict[tuple[int, int, int], int] = {}

    def add_quant(x: int, y: int) -> None:
        r, g, bl = px[x, y]
        q = ((r // 8) * 8, (g // 8) * 8, (bl // 8) * 8)
        counts[q] = counts.get(q, 0) + 1

    for y in range(h):
        row_border = y < b or y >= h - b
        for x in range(w):
            if row_border or x < b or x >= w - b:
                add_quant(x, y)

    seeds = [c for (c, _n) in sorted(counts.items(), key=lambda kv: -kv[1])[:seed_count]]
    if not seeds:
        return Image.new("L", (w, h), 255)

    passable = bytearray(w * h)
    for y in range(h):
        row = y * w
        for x in range(w):
            r, g, bl = px[x, y]
            ok = False
            for sr, sg, sb in seeds:
                if abs(r - sr) + abs(g - sg) + abs(bl - sb) <= tol_l1:
                    ok = True
                    break
            passable[row + x] = 1 if ok else 0

    visited = bytearray(w * h)
    q: deque[tuple[int, int]] = deque()
    for x in range(w):
        q.append((x, 0))
        q.append((x, h - 1))
    for y in range(h):
        q.append((0, y))
        q.append((w - 1, y))

    while q:
        x, y = q.popleft()
        if x < 0 or y < 0 or x >= w or y >= h:
            continue
        idx = y * w + x
        if visited[idx] or not passable[idx]:
            continue
        visited[idx] = 1
        q.append((x + 1, y))
        q.append((x - 1, y))
        q.append((x, y + 1))
        q.append((x, y - 1))

    alpha = bytearray(w * h)
    fg = 0
    for i in range(w * h):
        if visited[i]:
            alpha[i] = 0
        else:
            alpha[i] = 255
            fg += 1

    if fg < 1200:
        for i in range(w * h):
            alpha[i] = 255

    return Image.frombytes("L", (w, h), bytes(alpha))


def process_one(name: str, stem: str) -> None:
    src = find_src(stem)
    rgb = Image.open(src).convert("RGB")

    alpha = alpha_from_edge_seed_flood(rgb) if name == "potty" else alpha_from_edge_flood(rgb)
    mask = alpha.point(lambda p: 255 if p > 8 else 0)
    bbox = mask.getbbox()
    if not bbox:
        bbox = (0, 0, rgb.width, rgb.height)
        alpha = Image.new("L", rgb.size, 255)

    rgba = rgb.convert("RGBA")
    rgba.putalpha(alpha)
    sprite = rgba.crop(bbox)

    tw, th = SIZES[name]
    scale = min((tw * 0.84) / max(1, sprite.width), (th * 0.84) / max(1, sprite.height))
    sprite = sprite.resize(
        (max(1, int(sprite.width * scale)), max(1, int(sprite.height * scale))),
        Image.LANCZOS,
    )

    canvas = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
    px = (tw - sprite.width) // 2
    # Most sprites look best centered; barn needs a grounded baseline.
    if name == "barn":
        py = th - sprite.height
    else:
        py = (th - sprite.height) // 2
    canvas.alpha_composite(sprite, (px, py))

    out = OUT / f"{name}.png"
    canvas.save(out)
    print(out)


def main() -> None:
    only = [a.strip() for a in sys.argv[1:] if a.strip()]
    if only:
        missing = [a for a in only if a not in SRC]
        if missing:
            raise SystemExit(f"Unknown asset(s): {', '.join(missing)}")
        names = only
    else:
        names = list(SRC.keys())

    for name in names:
        process_one(name, SRC[name])


if __name__ == "__main__":
    main()
