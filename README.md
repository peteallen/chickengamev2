# Chicken Farm Tap Game

A tablet-friendly, no-text toddler game built with HTML5 Canvas and modular JavaScript architecture.

## Run

```bash
cd /Users/peteallen/work/chickengame/v4
python3 -m http.server 4173
# then open http://127.0.0.1:4173
```

## Gameplay

- Tap the chicken to trigger a random fun action.
- The chicken struts around and clucks by itself.
- The world has animated ambience (clouds, sun, insects, sparkles, grass).

## Built-in actions

- Fireworks burst
- Jetpack flight
- Potty drop + poop/pee + flush swirl
- Disco party (dance floor + disco ball + lights)
- Egg laying + hatching + follower chick
- Rain cloud + rainbow
- Butterfly parade
- Tractor zoom-by
- Hay bale bounce storm
- Bubble party
- Corn confetti rain
- Sun dance glow

## Architecture

- `src/game/Game.js`: main engine loop, rendering order, action scheduling.
- `src/game/actions/ActionRegistry.js`: weighted random action selection.
- `src/game/actions/DefaultActions.js`: each effect as an isolated action class.
- `src/game/entities/`: reusable world entities (`Chicken`, `CompanionChick`, `Ambience`).
- `src/game/core/`: shared systems (`AssetLoader`, `SoundEngine`, `math`).

To add a new action, create a class in `DefaultActions.js` (or split to a new file) and register it in `registerDefaultActions()`.

## Assets

Generated using skills:
- Primary attempt: `imagegen` (OpenAI) -> unavailable because `OPENAI_API_KEY` was not set.
- Fallback used: `openrouter-imagegen` with `OPENROUTER_API_KEY`.

Runtime assets (shipped) live in:
- `public/assets/sprites/locked/`
- `public/assets/sfx/`

Development/source assets (not shipped) live in:
- `art/`
