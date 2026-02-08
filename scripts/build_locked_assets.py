#!/usr/bin/env python3
from pathlib import Path
from collections import deque
import sys
from PIL import Image
import numpy as np

ROOT = Path('/Users/peteallen/work/chickengame/v4')
RAW = ROOT / 'public/assets/generated-v3/raw'
OUT = ROOT / 'public/assets/sprites/locked'
OUT.mkdir(parents=True, exist_ok=True)

SRC = {
    'chicken': 'chicken-v3',
    'chick': 'chick-v3',
    'egg': 'egg-v3',
    # Needs an open bowl so contents make sense; v3b has an open bowl and no cast shadow.
    'potty': 'potty-v3b',
    'jetpack': 'jetpack-v3',
    'disco-ball': 'disco-ball-v7',
    'tractor': 'tractor-v3b',
    'hay': 'hay-v3',
    'butterfly': 'butterfly-v3',
    'rain-cloud': 'rain-cloud-v3',
    'rainbow': 'rainbow-v3',
    'coop': 'coop-v5',
    'barn': 'barn-v5',
}

SIZES = {
    'chicken': (640, 640),
    'chick': (420, 420),
    'egg': (360, 460),
    'potty': (540, 460),
    'jetpack': (560, 420),
    'disco-ball': (500, 500),
    'tractor': (620, 420),
    'hay': (620, 360),
    'butterfly': (520, 380),
    'rain-cloud': (560, 360),
    'rainbow': (620, 360),
    'coop': (760, 620),
    'barn': (640, 640),
}


def find_src(stem: str) -> Path:
    for ext in ('.png', '.jpg', '.jpeg', '.webp'):
        p = RAW / f'{stem}{ext}'
        if p.exists():
            return p
    raise FileNotFoundError(stem)


def make_candidate_bg(rgb: np.ndarray) -> np.ndarray:
    r = rgb[:, :, 0].astype(np.int16)
    g = rgb[:, :, 1].astype(np.int16)
    b = rgb[:, :, 2].astype(np.int16)
    maxc = np.maximum(np.maximum(r, g), b)
    minc = np.minimum(np.minimum(r, g), b)
    sat = maxc - minc
    lum = (r + g + b) // 3

    neutral = sat < 24
    near = np.zeros_like(neutral)
    for c in (76, 90, 104, 118, 132, 146, 160, 174, 188, 202, 216, 230, 242):
        near |= np.abs(lum - c) <= 10

    bright_neutral = (lum > 242) & (sat < 16)
    green_bg = (g > 140) & (g > r + 24) & (g > b + 24)

    return (neutral & near) | bright_neutral | green_bg


def alpha_from_edge_flood(rgb: np.ndarray) -> np.ndarray:
    cand = make_candidate_bg(rgb)
    h, w = cand.shape
    visited = np.zeros((h, w), dtype=bool)
    q = deque()

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
        if visited[y, x] or not cand[y, x]:
            continue
        visited[y, x] = True
        q.append((x + 1, y))
        q.append((x - 1, y))
        q.append((x, y + 1))
        q.append((x, y - 1))

    alpha = np.where(visited, 0, 255).astype(np.uint8)
    if (alpha > 0).sum() < 1200:
        alpha[:] = 255
    return alpha


def alpha_from_edge_seed_flood(
    rgb: np.ndarray,
    *,
    border: int = 24,
    seed_count: int = 6,
    tol_l1: int = 78,
) -> np.ndarray:
    """
    Robust background finder for cases like checkerboard/jpg compression:
    1) sample the most common border colors (quantized)
    2) flood-fill from edges through pixels close to those colors
    """
    h, w, _ = rgb.shape

    b = min(border, h // 2, w // 2)
    border_mask = np.zeros((h, w), dtype=bool)
    border_mask[:b, :] = True
    border_mask[-b:, :] = True
    border_mask[:, :b] = True
    border_mask[:, -b:] = True

    border_px = rgb[border_mask]
    # Quantize to collapse jpeg noise / checker variants.
    q = (border_px // 8) * 8
    colors, counts = np.unique(q, axis=0, return_counts=True)
    order = np.argsort(-counts)
    seeds = colors[order[:seed_count]].astype(np.int16)

    rgb16 = rgb.astype(np.int16)
    passable = np.zeros((h, w), dtype=bool)
    for seed in seeds:
        d = np.abs(rgb16 - seed).sum(axis=2)
        passable |= d <= tol_l1

    visited = np.zeros((h, w), dtype=bool)
    q = deque()
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
        if visited[y, x] or not passable[y, x]:
            continue
        visited[y, x] = True
        q.append((x + 1, y))
        q.append((x - 1, y))
        q.append((x, y + 1))
        q.append((x, y - 1))

    alpha = np.where(visited, 0, 255).astype(np.uint8)
    if (alpha > 0).sum() < 1200:
        alpha[:] = 255
    return alpha


def process_one(name: str, stem: str) -> None:
    src = find_src(stem)
    rgb = np.array(Image.open(src).convert('RGB'))

    alpha = alpha_from_edge_seed_flood(rgb) if name == 'potty' else alpha_from_edge_flood(rgb)

    ys, xs = np.where(alpha > 8)
    if len(xs) == 0:
        alpha[:] = 255
        ys, xs = np.where(alpha > 8)

    x0, x1 = xs.min(), xs.max() + 1
    y0, y1 = ys.min(), ys.max() + 1

    crop_rgb = rgb[y0:y1, x0:x1]
    crop_a = alpha[y0:y1, x0:x1]

    rgba = np.dstack([crop_rgb, crop_a])
    sprite = Image.fromarray(rgba, 'RGBA')

    tw, th = SIZES[name]
    scale = min((tw * 0.84) / sprite.width, (th * 0.84) / sprite.height)
    sprite = sprite.resize((max(1, int(sprite.width * scale)), max(1, int(sprite.height * scale))), Image.LANCZOS)

    canvas = Image.new('RGBA', (tw, th), (0, 0, 0, 0))
    px = (tw - sprite.width) // 2
    # Most sprites look best centered; barn needs a grounded baseline.
    if name == 'barn':
        py = th - sprite.height
    else:
        py = (th - sprite.height) // 2
    canvas.alpha_composite(sprite, (px, py))

    out = OUT / f'{name}.png'
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


if __name__ == '__main__':
    main()
