# Birthday Adventure

A tiny pixel-art platformer made as a birthday gift. Phaser 3 + TypeScript + Vite.
Mobile-first (landscape, touch buttons), also playable with a keyboard.

## Run it

```bash
npm install
npm run dev        # then open the printed URL (also reachable from a phone on the same network)
```

Production build: `npm run build` (output in `dist/`), preview it with `npm run preview`.

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Move | ← → or A D | bottom-left arrow buttons (hold) |
| Jump | Space, ↑ or W (hold for a higher jump) | bottom-right button |
| Fullscreen | button in the top-right corner | same |

## Project layout

```
src/
  main.ts                 game config (pixelArt, Scale.EXPAND, arcade physics)
  config/                 constants, asset registry, generatedAssets.ts (auto-generated)
  scenes/                 Boot, Menu, Game, UI (HUD + touch), Ending
  entities/               Player, FireSpirit
  systems/Controls.ts     keyboard + multi-touch input
  world/                  level data, ground builder, parallax background
  ui/widgets.ts           pixel text, buttons, fullscreen toggle
scripts/
  process_assets.py       turns the source art into game-ready sprites
  pixelkit.py             helpers used by the script
public/assets/            original art (untouched)
public/assets/processed/  generated sprites the game actually loads
```

## About the art pipeline

The original files in `public/assets` are high-resolution JPEGs (saved with a `.png`
extension) with a checkerboard painted in where transparency should be. The game
cannot use them directly, so `scripts/process_assets.py`:

1. removes the checkerboard (flood fill from the border, plus enclosed checker holes),
2. detects each sheet's real pixel grid and samples it back to native pixel art,
3. splits sprite sheets into aligned animation frames,
4. writes clean PNGs to `public/assets/processed/` and frame data to
   `src/config/generatedAssets.ts`.

It also draws the few extra pieces that did not exist (star collectible, sign, fence,
sky/hills, UI buttons, candle flame, glow). The originals are never modified.

To regenerate (only needed if the source art changes):

```bash
python3 -m venv .venv && .venv/bin/pip install numpy scipy pillow
.venv/bin/python scripts/process_assets.py
```
