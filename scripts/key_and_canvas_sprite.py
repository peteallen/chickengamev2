#!/usr/bin/env python3
"""
Key out a generated sprite background and place it onto a fixed-size transparent canvas.

This is a lightweight version of the repo's older asset build scripts, intended for one-off
sprite generation where the model output may have an opaque background.
"""

from __future__ import annotations

import argparse
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Key sprite background and normalize canvas size.")
    parser.add_argument("--in", dest="in_path", required=True, help="Input image path.")
    parser.add_argument("--out", dest="out_path", required=True, help="Output PNG path.")
    parser.add_argument("--canvas", default="760x620", help="Target canvas size, e.g. 760x620.")
    parser.add_argument("--fill", type=float, default=0.84, help="How much of the canvas the sprite should fill (0..1).")
    return parser.parse_args()


def alpha_from_edge_seed_flood(rgb: np.ndarray, *, border: int = 24, seed_count: int = 6, tol_l1: int = 78) -> np.ndarray:
    """Background finder that samples border colors then flood-fills through similar pixels."""
    h, w, _ = rgb.shape
    b = min(border, h // 2, w // 2)

    border_mask = np.zeros((h, w), dtype=bool)
    border_mask[:b, :] = True
    border_mask[-b:, :] = True
    border_mask[:, :b] = True
    border_mask[:, -b:] = True

    border_px = rgb[border_mask]
    q = (border_px // 8) * 8  # quantize to reduce compression noise
    colors, counts = np.unique(q, axis=0, return_counts=True)
    order = np.argsort(-counts)
    seeds = colors[order[:seed_count]].astype(np.int16)

    rgb16 = rgb.astype(np.int16)
    passable = np.zeros((h, w), dtype=bool)
    for seed in seeds:
        d = np.abs(rgb16 - seed).sum(axis=2)
        passable |= d <= tol_l1

    visited = np.zeros((h, w), dtype=bool)
    qd: deque[tuple[int, int]] = deque()
    for x in range(w):
        qd.append((x, 0))
        qd.append((x, h - 1))
    for y in range(h):
        qd.append((0, y))
        qd.append((w - 1, y))

    while qd:
        x, y = qd.popleft()
        if x < 0 or y < 0 or x >= w or y >= h:
            continue
        if visited[y, x] or not passable[y, x]:
            continue
        visited[y, x] = True
        qd.append((x + 1, y))
        qd.append((x - 1, y))
        qd.append((x, y + 1))
        qd.append((x, y - 1))

    alpha = np.where(visited, 0, 255).astype(np.uint8)
    # If we accidentally keyed almost everything, keep original opaque.
    if (alpha > 0).sum() < 1200:
        alpha[:] = 255
    return alpha


def crop_bbox_from_alpha(alpha: np.ndarray, threshold: int = 8) -> tuple[int, int, int, int]:
    ys, xs = np.where(alpha > threshold)
    if len(xs) == 0:
        return (0, 0, alpha.shape[1], alpha.shape[0])
    x0, x1 = int(xs.min()), int(xs.max() + 1)
    y0, y1 = int(ys.min()), int(ys.max() + 1)
    return (x0, y0, x1, y1)


def main() -> int:
    args = parse_args()
    in_path = Path(args.in_path).expanduser().resolve()
    out_path = Path(args.out_path).expanduser().resolve()
    out_path.parent.mkdir(parents=True, exist_ok=True)

    canvas_w, canvas_h = (int(part) for part in args.canvas.lower().split("x", 1))
    fill = max(0.1, min(0.98, float(args.fill)))

    img = Image.open(in_path)
    rgba = img.convert("RGBA")
    arr = np.array(rgba)

    alpha = arr[:, :, 3].astype(np.uint8)
    has_transparency = (alpha < 250).sum() > 50
    if has_transparency:
        key_alpha = alpha
    else:
        rgb = arr[:, :, :3]
        key_alpha = alpha_from_edge_seed_flood(rgb)

    x0, y0, x1, y1 = crop_bbox_from_alpha(key_alpha)
    crop = arr[y0:y1, x0:x1, :].copy()
    crop[:, :, 3] = key_alpha[y0:y1, x0:x1]
    sprite = Image.fromarray(crop, "RGBA")

    # Resize to fit
    tw, th = canvas_w, canvas_h
    scale = min((tw * fill) / max(1, sprite.width), (th * fill) / max(1, sprite.height))
    w = max(1, int(round(sprite.width * scale)))
    h = max(1, int(round(sprite.height * scale)))
    sprite = sprite.resize((w, h), Image.LANCZOS)

    canvas = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
    px = (tw - w) // 2
    py = (th - h) // 2
    canvas.alpha_composite(sprite, (px, py))

    canvas.save(out_path)
    print(out_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

