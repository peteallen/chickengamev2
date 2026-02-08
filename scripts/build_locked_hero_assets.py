#!/usr/bin/env python3
from pathlib import Path

from PIL import Image

ROOT = Path("/Users/peteallen/work/chickengame/v4")
OUT = ROOT / "public/assets/sprites/locked"
OUT.mkdir(parents=True, exist_ok=True)

BASE_CHICKEN = OUT / "chicken.png"
CANVAS_SIZE = (640, 640)
FILL = 0.84


def extract_sprite(img: Image.Image) -> Image.Image:
    rgba = img.convert("RGBA")
    bbox = rgba.getbbox()
    if not bbox:
        raise RuntimeError(f"Could not find foreground bounds in {BASE_CHICKEN}")
    return rgba.crop(bbox)


def make_variant(sprite: Image.Image, sx: float, sy: float, shift_x: int, shift_y: int) -> Image.Image:
    tw, th = CANVAS_SIZE
    base_scale = min((tw * FILL) / sprite.width, (th * FILL) / sprite.height)
    w = max(1, int(round(sprite.width * base_scale * sx)))
    h = max(1, int(round(sprite.height * base_scale * sy)))
    transformed = sprite.resize((w, h), Image.LANCZOS)

    canvas = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
    x = (tw - w) // 2 + shift_x
    y = (th - h) // 2 + shift_y
    canvas.alpha_composite(transformed, (x, y))
    return canvas


def main() -> None:
    base = extract_sprite(Image.open(BASE_CHICKEN))

    # Keep the exact same line work/style by deriving both hero frames from the approved base sprite.
    lay_squat = make_variant(base, sx=1.04, sy=0.87, shift_x=-6, shift_y=22)
    lay_release = make_variant(base, sx=1.06, sy=0.92, shift_x=3, shift_y=14)

    squat_path = OUT / "chicken-lay-squat.png"
    release_path = OUT / "chicken-lay-release.png"
    lay_squat.save(squat_path)
    lay_release.save(release_path)
    print(squat_path)
    print(release_path)


if __name__ == "__main__":
    main()
