# Scripts

This folder contains small utilities used during development.

## Active / current workflows

- `action_sweep.mjs`: Headless runtime check for core actions. Captures screenshots and validates invariants.
- `build_locked_assets.py`: Build the runtime sprite pack in `public/assets/sprites/locked/` from curated source renders.
- `openrouter_image_edit.py`: Generate consistent image variants using OpenRouter (image-capable chat models).
- `key_and_canvas_sprite.py`: One-off helper to key a sprite background and normalize to a fixed transparent canvas.

## Archived (reference only)

These scripts were used during earlier asset pipeline iterations. They are kept for reference, but the repo no longer
depends on them directly.

- `archive/process_v3_assets.py`: Older sprite processing pipeline that outputs a non-runtime "fresh" set.
- `archive/process_final_assets.py`: Older sprite processing pipeline that outputs a non-runtime "final" set.
- `archive/build_locked_hero_assets.py`: Generated extra chicken-lay frames from the base chicken sprite.
