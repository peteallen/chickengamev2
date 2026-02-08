#!/usr/bin/env python3
from pathlib import Path
from PIL import Image
import numpy as np

ROOT = Path('/Users/peteallen/work/chickengame/v4')
RAW = ROOT / 'public/assets/generated-v3/raw'
OUT = ROOT / 'public/assets/sprites/final'
OUT.mkdir(parents=True, exist_ok=True)

PREFERRED = {
    'chicken': 'chicken-v6',
    'chick': 'chick-v6',
    'egg': 'egg-v6',
    'potty': 'potty-v6',
    'jetpack': 'jetpack-v3c',
    'disco-ball': 'disco-ball-v3c',
    'tractor': 'tractor-v3c',
    'hay': 'hay-v3c',
    'butterfly': 'butterfly-v3c',
    'rain-cloud': 'rain-cloud-v3c',
    'rainbow': 'rainbow-v3c',
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


def key_checker(arr: np.ndarray) -> np.ndarray:
    r = arr[:, :, 0].astype(np.int16)
    g = arr[:, :, 1].astype(np.int16)
    b = arr[:, :, 2].astype(np.int16)
    maxc = np.maximum(np.maximum(r, g), b)
    minc = np.minimum(np.minimum(r, g), b)
    sat = maxc - minc
    lum = (r + g + b) // 3
    bg = sat < 24
    near = np.zeros_like(bg)
    for c in (80, 94, 108, 122, 136, 150, 164, 178, 192, 206, 220, 234):
        near |= np.abs(lum - c) <= 10
    bg &= near
    return np.where(bg, 0, 255).astype(np.uint8)


def process_asset(key: str, stem: str) -> None:
    src = find_src(stem)
    rgb = np.array(Image.open(src).convert('RGB'))

    alpha = key_checker(rgb)
    if (alpha > 0).sum() < 2500:
        alpha[:] = 255

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

    tw, th = SIZES[key]
    scale = min((tw * 0.84) / sprite.width, (th * 0.84) / sprite.height)
    sprite = sprite.resize((max(1, int(sprite.width * scale)), max(1, int(sprite.height * scale))), Image.LANCZOS)

    canvas = Image.new('RGBA', (tw, th), (0, 0, 0, 0))
    px = (tw - sprite.width) // 2
    py = (th - sprite.height) // 2
    canvas.alpha_composite(sprite, (px, py))

    out = OUT / f'{key}.png'
    canvas.save(out)
    print(out)


def main() -> None:
    for key, stem in PREFERRED.items():
        process_asset(key, stem)


if __name__ == '__main__':
    main()
