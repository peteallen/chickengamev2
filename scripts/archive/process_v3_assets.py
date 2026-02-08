#!/usr/bin/env python3
from pathlib import Path
from PIL import Image
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / 'art/public-assets/generated-v3/raw'
OUT = ROOT / 'art/public-assets/sprites/fresh'
OUT.mkdir(parents=True, exist_ok=True)

PREFERRED = {
    'chicken': 'chicken-v3d',
    'chick': 'chick-v3c',
    'egg': 'egg-v3d',
    'potty': 'potty-v3d',
    'jetpack': 'jetpack-v3c',
    'disco-ball': 'disco-ball-v3c',
    'tractor': 'tractor-v3c',
    'hay': 'hay-v3c',
    'butterfly': 'butterfly-v3c',
    'rain-cloud': 'rain-cloud-v3c',
    'rainbow': 'rainbow-v3c',
    'coop': 'coop-v3d',
    'barn': 'barn-v3d',
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


def alpha_from_chroma(arr: np.ndarray) -> np.ndarray:
    r = arr[:, :, 0].astype(np.int16)
    g = arr[:, :, 1].astype(np.int16)
    b = arr[:, :, 2].astype(np.int16)
    # key out vivid green background and fringe
    green = (g > 150) & (g > r + 28) & (g > b + 28)
    return np.where(green, 0, 255).astype(np.uint8)


def alpha_from_checker(arr: np.ndarray) -> np.ndarray:
    r = arr[:, :, 0].astype(np.int16)
    g = arr[:, :, 1].astype(np.int16)
    b = arr[:, :, 2].astype(np.int16)
    maxc = np.maximum(np.maximum(r, g), b)
    minc = np.minimum(np.minimum(r, g), b)
    sat = maxc - minc
    lum = (r + g + b) // 3
    bg = sat < 24
    near = np.zeros_like(bg)
    for c in (88, 102, 116, 130, 144, 158, 172, 186, 200, 214, 228):
        near |= np.abs(lum - c) <= 10
    bg &= near
    return np.where(bg, 0, 255).astype(np.uint8)


def process_one(key: str, stem: str) -> None:
    src = find_src(stem)
    arr = np.array(Image.open(src).convert('RGB'))

    green_mask = (arr[:, :, 1] > 150) & (arr[:, :, 1] > arr[:, :, 0] + 28) & (arr[:, :, 1] > arr[:, :, 2] + 28)
    if green_mask.sum() > arr.shape[0] * arr.shape[1] * 0.08:
        alpha = alpha_from_chroma(arr)
    else:
        alpha = alpha_from_checker(arr)

    if (alpha > 0).sum() < 1500:
        alpha[:] = 255

    ys, xs = np.where(alpha > 8)
    if len(xs) == 0:
        alpha[:] = 255
        ys, xs = np.where(alpha > 8)

    x0, x1 = xs.min(), xs.max() + 1
    y0, y1 = ys.min(), ys.max() + 1

    crop = arr[y0:y1, x0:x1]
    crop_a = alpha[y0:y1, x0:x1]

    rgba = np.dstack([crop, crop_a])
    sprite = Image.fromarray(rgba, 'RGBA')

    tw, th = SIZES[key]
    scale = min((tw * 0.84) / sprite.width, (th * 0.84) / sprite.height)
    sprite = sprite.resize(
        (max(1, int(sprite.width * scale)), max(1, int(sprite.height * scale))),
        Image.LANCZOS,
    )

    canvas = Image.new('RGBA', (tw, th), (0, 0, 0, 0))
    px = (tw - sprite.width) // 2
    py = (th - sprite.height) // 2
    canvas.alpha_composite(sprite, (px, py))

    out = OUT / f'{key}.png'
    canvas.save(out)
    print(out)


def main() -> None:
    for key, stem in PREFERRED.items():
        process_one(key, stem)


if __name__ == '__main__':
    main()
