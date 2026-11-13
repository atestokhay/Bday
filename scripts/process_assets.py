"""Build game-ready pixel art from the source sheets in public/assets.

Usage (needs numpy, scipy, pillow):
    python scripts/process_assets.py [--preview DIR]

Reads the original files (never modifies them) and writes:
    public/assets/processed/**.png   clean, native-resolution, real alpha
    src/config/generatedAssets.ts    frame sizes, anchors and piece lists

Also generates the small pieces of pixel art the project did not contain
(star collectible, sign, fence, sky/hills, UI buttons, candle flame, glow...).
"""
from __future__ import annotations

import colorsys
import json
import math
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, os.path.dirname(__file__))
from pixelkit import (background_mask, components, downsample, find_grid, load_rgb,  # noqa: E402
                      peel_halo, preview, quantize, remove_specks, save, trim)

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SRC = os.path.join(ROOT, "public", "assets")
OUT = os.path.join(SRC, "processed")
PREVIEW = None
if "--preview" in sys.argv:
    PREVIEW = sys.argv[sys.argv.index("--preview") + 1]
    os.makedirs(PREVIEW, exist_ok=True)

manifest: dict = {}

# Shared palette for generated art --------------------------------------------
OUTLINE = (58, 36, 48)
CREAM = (247, 236, 210)
CREAM_D = (226, 206, 176)
PINK = (240, 168, 178)
PINK_D = (204, 120, 140)
LAV = (176, 156, 214)
LAV_D = (128, 108, 168)
GOLD_L = (255, 242, 176)
GOLD = (255, 208, 92)
GOLD_D = (222, 148, 56)
GOLD_DD = (156, 92, 44)
WOOD_L = (196, 138, 92)
WOOD = (156, 100, 66)
WOOD_D = (110, 68, 50)


def out_path(*parts: str) -> str:
    p = os.path.join(OUT, *parts)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    return p


def emit(name: str, rgba: np.ndarray, pv_scale: int = 4) -> None:
    save(rgba, out_path(name))
    if PREVIEW:
        preview(rgba, os.path.join(PREVIEW, name.replace("/", "_")), pv_scale)


def lum(rgb: np.ndarray) -> np.ndarray:
    return rgb.astype(np.float32).mean(-1)


def sat(rgb: np.ndarray) -> np.ndarray:
    return (rgb.max(-1) - rgb.min(-1)).astype(np.int16)


def native_sheet(path: str, sat_max: int, lo: int, hi: int, f_range, hole_area=1500,
                 grid=None):
    """Background-free, grid-sampled version of a whole source sheet."""
    a = load_rgb(path)
    fg = ~background_mask(a, sat_max, lo, hi, big_hole_area=hole_area)
    if grid is None:
        boxes = components(fg, 8, 3000)
        b = max(boxes, key=lambda b: (b[2] - b[0]) * (b[3] - b[1]))
        cx, cy = (b[0] + b[2]) // 2, (b[1] + b[3]) // 2
        sub = (max(b[0], cx - 120), max(b[1], cy - 120), min(b[2], cx + 120), min(b[3], cy + 120))
        grid = find_grid(a, fg, sub, f_range, 0.1)
    f, ox, oy = grid
    d = downsample(a, fg, (0, 0, a.shape[1], a.shape[0]), f, ox, oy)
    print(f"  {os.path.basename(path)}: grid {f:.2f} -> {d.shape[1]}x{d.shape[0]}")
    return d


def split_frames(d: np.ndarray, expected: int, merge: int, min_area: int):
    """Return [(rgba_crop, x0, y0)] for each frame blob, left to right."""
    alpha = d[..., 3] > 0
    grown = ndimage.binary_dilation(alpha, iterations=merge) if merge else alpha
    lab, n = ndimage.label(grown)
    frames = []
    for k, sl in enumerate(ndimage.find_objects(lab), start=1):
        ys, xs = sl
        mask = (lab[ys, xs] == k) & alpha[ys, xs]
        if mask.sum() < min_area:
            continue
        crop = d[ys, xs].copy()
        crop[~mask] = 0
        rows = np.where(mask.any(1))[0]
        cols = np.where(mask.any(0))[0]
        crop = crop[rows[0]:rows[-1] + 1, cols[0]:cols[-1] + 1]
        frames.append((crop, xs.start + cols[0], ys.start + rows[0]))
    frames.sort(key=lambda t: t[1])
    assert len(frames) == expected, f"expected {expected} frames, got {len(frames)}"
    return frames


def pack(groups: list[list[tuple[np.ndarray, int, int]]], anchor_fn):
    """Pack frame groups into one horizontal strip with a shared frame size.

    Within a group, frames keep their relative vertical offsets from the source
    (the lowest frame sits on the baseline). Horizontally each frame is centred on
    anchor_fn(img)."""
    items = []
    for g in groups:
        base = max(y0 + img.shape[0] for img, _, y0 in g)
        for img, _, y0 in g:
            items.append((img, anchor_fn(img), base - (y0 + img.shape[0])))
    half = max(max(ax, img.shape[1] - ax) for img, ax, _ in items)
    W = int(math.ceil(half)) * 2 + 2
    H = max(img.shape[0] + up for img, _, up in items) + 1
    sheet = np.zeros((H, W * len(items), 4), np.uint8)
    for i, (img, ax, up) in enumerate(items):
        x = int(round(W / 2 - ax)) + i * W
        y = H - 1 - up - img.shape[0]
        region = sheet[y:y + img.shape[0], x:x + img.shape[1]]
        m = img[..., 3] > 0
        region[m] = img[m]
    return sheet, W, H


def head_anchor(img: np.ndarray) -> float:
    a = img[..., 3] > 0
    top = a[: int(a.shape[0] * 0.45)]
    return float(np.where(top)[1].mean())


def mass_anchor(img: np.ndarray) -> float:
    a = img[..., 3] > 0
    lab, n = ndimage.label(a)
    if n > 1:  # ignore stray sparks: use the biggest blob
        sizes = ndimage.sum(a, lab, index=np.arange(1, n + 1))
        a = lab == (int(np.argmax(sizes)) + 1)
    return float(np.where(a)[1].mean())


# 1. Girl ------------------------------------------------------------------------
def build_girl():
    print("girl")
    groups = []
    for name, n in (("girl_idle", 4), ("girl_walk", 6), ("girl_jump", 2)):
        # all three sheets share one drawing scale; only the grid offset differs
        d = native_sheet(os.path.join(SRC, "characters", f"{name}.png"), 26, 170, 255, (13.6, 13.6))
        d = remove_specks(d, 6)
        d = quantize(d, 40)
        groups.append(split_frames(d, n, 0, 300))
    sheet, w, h = pack(groups, head_anchor)
    emit("girl.png", sheet)
    manifest["girl"] = {"frameWidth": w, "frameHeight": h,
                        "idle": [0, 3], "walk": [4, 9], "jumpUp": 10, "jumpDown": 11}


# 2. FireSpirit ----------------------------------------------------------------
def build_fire():
    print("fire spirit")
    groups = []
    for name in ("fire_idle", "fire_flame"):
        d = native_sheet(os.path.join(SRC, "characters", f"{name}.png"), 34, 170, 255, (9, 14))
        d = quantize(d, 24)
        groups.append(split_frames(d, 4, 5, 60))
    sheet, w, h = pack(groups, mass_anchor)
    emit("fire_spirit.png", sheet)
    manifest["fireSpirit"] = {"frameWidth": w, "frameHeight": h, "idle": [0, 3], "flame": [4, 7]}


# 3. Cake ------------------------------------------------------------------------
def build_cake():
    print("cake")
    d = native_sheet(os.path.join(SRC, "objects", "birthday_cake.png"), 22, 70, 175, (8, 13))
    rgb = d[..., :3].astype(np.int16)

    def halo(c):
        L = lum(c)
        return (sat(c) < 90) & (L > 60) & (L < 215) & (c[..., 2] <= c[..., 1] + 6)

    d = peel_halo(d, halo)
    d = remove_specks(d, 12)
    d = trim(d)
    if PREVIEW:
        preview(d, os.path.join(PREVIEW, "cake_lit_debug.png"), 6)
        np.save(os.path.join(PREVIEW, "cake_lit.npy"), d)
    # The source cake has seven tiny candles that are already lit and soaked in a
    # baked glow. For the ending we need an UNLIT cake, so the top-tier surface is
    # repainted as clean frosting and one tall striped candle is drawn in the middle.
    pad = 14
    unlit = np.zeros((d.shape[0] + pad, d.shape[1], 4), np.uint8)
    unlit[pad:] = d
    cx, cy, rx, ry = 51.5, 15.0 + pad, 19.0, 6.2
    rim_col = (112, 56, 68)
    surf_hi, surf, surf_lo = (255, 244, 224), (250, 232, 208), (238, 212, 190)
    for y in range(0, 20 + pad):
        for x in range(30, 74):
            inside = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2
            keep_side = x < 34 or x > 69
            if inside <= 1.0:
                if keep_side and y >= 12 + pad:
                    continue
                if y >= 18 + pad and 46 <= x <= 57:
                    continue  # front strawberry
                t = (y - (cy - ry)) / (2 * ry)
                col = surf_hi if t < 0.3 else surf if t < 0.75 else surf_lo
                unlit[y, x] = (*col, 255)
            elif y < cy and not keep_side:
                unlit[y, x] = 0
    # paint over leftover stubs of the original candles on the front edge
    for y in range(16 + pad, 23 + pad):
        for x in range(34, 70):
            px = unlit[y, x].astype(int)
            if px[3] and px[2] > px[1] + 4:
                unlit[y, x] = (*surf_lo, 255)
    # back rim outline + highlight
    for x in range(31, 73):
        ys = [y for y in range(0, int(cy) + 1) if unlit[y, x, 3] > 0 and unlit[y, x, :3].tolist() in (list(surf_hi),)]
        if ys:
            top = min(ys)
            unlit[top - 1, x] = (*rim_col, 255)
    # the candle: 4px wide, pink/cream diagonal stripes
    c_x0, c_w, c_top, c_bot = 50, 4, 3 + pad, 14 + pad
    stripe_a, stripe_b, shade = (246, 170, 186), (255, 240, 226), (214, 130, 156)
    for y in range(c_top, c_bot + 1):
        for i in range(c_w):
            x = c_x0 + i
            col = stripe_a if ((y + i) // 3) % 2 == 0 else stripe_b
            if i == c_w - 1:
                col = shade if col == stripe_a else (236, 210, 206)
            unlit[y, x] = (*col, 255)
        unlit[y, c_x0 - 1] = (*rim_col, 255)
        unlit[y, c_x0 + c_w] = (*rim_col, 255)
    for i in range(-1, c_w + 1):
        unlit[c_top - 1, c_x0 + i] = (*rim_col, 255)
    # little drip of wax and the wick
    unlit[c_top, c_x0] = (255, 250, 240, 255)
    unlit[c_top + 1, c_x0] = (255, 250, 240, 255)
    unlit[c_top - 2, c_x0 + 1] = (*rim_col, 255)
    unlit[c_top - 3, c_x0 + 2] = (*rim_col, 255)
    wicks = [{"x": c_x0 + 2, "y": c_top - 3}]
    unlit = trim_top(unlit)
    wicks[0]["y"] -= unlit[1]
    unlit = unlit[0]
    emit("cake.png", unlit)
    manifest["cake"] = {"width": int(unlit.shape[1]), "height": int(unlit.shape[0]), "wick": wicks[0]}


def trim_top(rgba: np.ndarray):
    rows = np.where((rgba[..., 3] > 0).any(1))[0]
    return rgba[rows[0]:], int(rows[0])


# 4. Pipe ------------------------------------------------------------------------
def build_pipe():
    print("pipe")
    d = native_sheet(os.path.join(SRC, "objects", "magic_pipe.png"), 22, 70, 175, (9, 14))

    def halo(c):
        L = lum(c)
        return (sat(c) < 50) & (L > 70) & (L < 205)

    d = peel_halo(d, halo)
    d = remove_specks(d, 2)
    d = trim(d)
    d = quantize(d, 48)
    rgb = d[..., :3].astype(np.int16)
    a = d[..., 3] > 0
    orange = a & (rgb[..., 0] > 200) & (rgb[..., 1] > 110) & (rgb[..., 1] < 215) & (rgb[..., 2] < 140)
    lab, n = ndimage.label(orange)
    sizes = ndimage.sum(orange, lab, index=np.arange(1, n + 1))
    mouth = lab == (int(np.argmax(sizes)) + 1)
    ys, xs = np.where(mouth)
    # grass surface: first row (from the bottom) where the island is widest
    widths = a.sum(1)
    grass_y = int(np.argmax(widths[: int(len(widths) * 0.9)] >= widths.max() * 0.85))
    emit("pipe.png", d)
    manifest["pipe"] = {"width": int(d.shape[1]), "height": int(d.shape[0]),
                        "mouth": {"x": float(xs.mean()), "y": float(ys.mean()),
                                  "w": int(xs.max() - xs.min() + 1), "h": int(ys.max() - ys.min() + 1)},
                        "groundY": grass_y}


# 5. Hearts ----------------------------------------------------------------------
def build_hearts():
    print("hearts")
    a = load_rgb(os.path.join(SRC, "objects", "heart_blue.png"))
    fg = ~background_mask(a, 18, 215, 255)
    f, ox, oy = find_grid(a, fg, (100, 30, 720, 600), (30, 44), 0.25)
    d = trim(downsample(a, fg, (0, 0, a.shape[1], a.shape[0]), f, ox, oy))
    print(f"  heart grid {f:.2f} -> {d.shape[1]}x{d.shape[0]}")
    emit("heart_blue.png", d, 8)
    # pink recolour of the same shape for the decorative life indicator
    pink = d.copy()
    for y in range(d.shape[0]):
        for x in range(d.shape[1]):
            if d[y, x, 3] == 0:
                continue
            r, g, b = (d[y, x, :3] / 255.0)
            h, l, s = colorsys.rgb_to_hls(r, g, b)
            if l < 0.12:
                pink[y, x, :3] = OUTLINE
                continue
            nr, ng, nb = colorsys.hls_to_rgb(0.96, min(0.93, l * 0.55 + 0.4), min(s, 0.75))
            pink[y, x, :3] = (int(nr * 255), int(ng * 255), int(nb * 255))
    emit("heart_pink.png", pink, 8)
    manifest["heart"] = {"width": int(d.shape[1]), "height": int(d.shape[0])}


# 6. Tileset pieces --------------------------------------------------------------
TILE_PIECES = {
    # name: native rect (x0, y0, x1, y1) in the 8.4px-grid sampled tileset
    "bridge": (5, 2, 121, 33),
    "island_med": (128, 7, 163, 32),
    "island_small": (129, 41, 153, 64),
    "island_tiny": (179, 8, 199, 26),
    "rock_tilt": (128, 71, 174, 108),
    "rock_long": (129, 103, 199, 146),
    "rock_low": (131, 149, 184, 178),
    "rock_vines": (165, 37, 200, 75),
    "tree_big": (208, 4, 274, 76),
    "trunk_tall": (208, 80, 234, 121),
    "stump_roots": (237, 85, 275, 121),
    "trunk_broken": (248, 51, 263, 76),
    "vines_a": (264, 42, 278, 70),
    "vines_b": (270, 83, 297, 106),
    "tree_pink": (277, 4, 323, 42),
    "tree_round": (279, 45, 323, 83),
    "bush_fruit": (286, 97, 315, 118),
    "fol_left": (207, 158, 261, 178),
    "fol_right": (271, 155, 321, 178),
}
# small decorations: two rows of little props, cut by column ranges (native px)
DECO_ROWS = [((125, 137), [("mush_red", 209, 218), ("mush_orange", 221, 228), ("mush_pair", 231, 241),
                          ("plant_a", 243, 254), ("plant_b", 257, 268), ("rocks", 270, 283),
                          ("flower_bush", 285, 299), ("slab", 301, 320)]),
             ((138, 153), [("bush_small", 209, 227), ("sprout", 231, 239), ("lavender", 243, 253),
                          ("pink_flowers", 257, 271), ("stump_small", 274, 294), ("log", 296, 320)])]


def surface_of(img: np.ndarray) -> list[int]:
    """Walkable top of a platform piece: [surface row, solid left col, solid right col]."""
    a = img[..., 3] > 0
    h, w = a.shape
    for y in range(h):
        cols = np.where(a[y])[0]
        if len(cols) and a[y].sum() >= w * 0.6:
            row = a[y + 1] if y + 1 < h else a[y]
            cols = np.where(row)[0]
            return [y, int(cols.min()), int(cols.max()) + 1]
    return [0, 0, w]


def build_tiles():
    print("tileset")
    d = native_sheet(os.path.join(SRC, "tilesets", "forest_tileset.png"), 22, 130, 235, (8, 13),
                     grid=(8.4, 410.0, 822.0))

    def halo(c):
        return (sat(c) <= 14) & (lum(c) > 140) & (lum(c) < 230)

    d = peel_halo(d, halo)
    d = quantize(d, 96)
    pieces = {}
    for name, (x0, y0, x1, y1) in TILE_PIECES.items():
        crop = d[y0:y1, x0:x1].copy()
        # keep only the blobs that mostly live inside this rect
        a = crop[..., 3] > 0
        lab, n = ndimage.label(a)
        sizes = ndimage.sum(a, lab, index=np.arange(1, n + 1))
        big = int(np.argmax(sizes)) + 1
        keep = (lab == big) | np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s >= 6])
        crop[~keep] = 0
        crop = trim(crop)
        emit(f"tiles/{name}.png", crop)
        pieces[name] = [int(crop.shape[1]), int(crop.shape[0]), *surface_of(crop)]
    for (y0, y1), items in DECO_ROWS:
        for name, x0, x1 in items:
            crop = trim(d[y0:y1, x0:x1].copy())
            emit(f"tiles/{name}.png", crop)
            pieces[name] = [int(crop.shape[1]), int(crop.shape[0])]
    manifest["tiles"] = pieces

    # Ground textures from the flat bottom-left chunk ------------------------
    chunk = d[118:178, 4:72]
    a = chunk[..., 3] > 0
    # measured on the sampled sheet: grass surface row, last soil row, left border column
    grass_top, bottom = 11, 57
    # top band: grass + orange dirt; fill band: purple soil
    top_h = 36
    tile_src = chunk[grass_top - 2: grass_top - 2 + top_h, 10:50].copy()
    # The dirt band has dark root squiggles; mirrored they form an obvious repeating
    # pattern, so paint them out with the dirt colour of their own row.
    for y in range(8, top_h):
        row = tile_src[y]
        L = row[..., :3].astype(np.int16).mean(-1)
        dark = (L < 105) & (row[..., 3] > 0)
        if dark.any() and (~dark).any():
            fillc = np.median(row[~dark][..., :3], axis=0).astype(np.uint8)
            row[dark, :3] = fillc
    top_tile = np.concatenate([tile_src, tile_src[:, ::-1]], axis=1)
    emit("ground/top.png", top_tile)
    # Soil below: procedurally speckled with the sampled purple so it tiles seamlessly.
    last = top_tile[-3:, :, :3].reshape(-1, 3).astype(int)
    purple = last[last[:, 2] >= last[:, 1]]
    base = np.median(purple if len(purple) else last, axis=0).astype(int)
    fw, fh = 96, 48
    fill_tile = np.zeros((fh, fw, 4), np.uint8)
    fill_tile[..., :3] = base
    fill_tile[..., 3] = 255
    rng = np.random.default_rng(42)
    light = np.clip(base * 1.16 + 6, 0, 255).astype(np.uint8)
    dark = np.clip(base * 0.84, 0, 255).astype(np.uint8)
    for _ in range(16):
        x, y = int(rng.integers(0, fw)), int(rng.integers(0, fh))
        w = int(rng.integers(2, 4))
        for dx in range(w):
            fill_tile[y % fh, (x + dx) % fw, :3] = light
            fill_tile[(y + 1) % fh, (x + dx) % fw, :3] = dark
    for _ in range(14):
        x, y = int(rng.integers(0, fw)), int(rng.integers(0, fh))
        fill_tile[y, x, :3] = dark
    emit("ground/fill.png", fill_tile)
    # left edge cap: the chunk's own left border
    left_cols = 2
    cap_w = 7
    cap_top = chunk[grass_top - 2: grass_top - 2 + top_h, left_cols: left_cols + cap_w].copy()
    emit("ground/cap_top.png", cap_top)
    cap_fill = np.zeros((4, cap_w, 4), np.uint8)
    cap_fill[...] = (*base, 255)
    cap_fill[:, :2] = cap_top[-1, :2]  # keep the dark border column(s) of the cliff edge
    emit("ground/cap_fill.png", cap_fill)
    manifest["ground"] = {"topHeight": top_h, "tileWidth": int(top_tile.shape[1]),
                          "fillHeight": int(fill_tile.shape[0]), "capWidth": cap_w,
                          "surfaceOffset": 2}


# 7. Effects -------------------------------------------------------------------
FX_CELLS = {  # name: (col, row) in the 4x4 effects grid
    "fx_gold_burst": (1, 0),
    "fx_sparks": (2, 0),
    "fx_lav_stars": (0, 1),
    "fx_pink_stars": (1, 1),
    "fx_pink_ring": (2, 1),
    "fx_gold_ring": (3, 1),
    "fx_pink_rays": (1, 2),
    "fx_warm_dots": (2, 3),
    "fx_confetti": (3, 3),
}


def build_fx():
    print("effects")
    d = native_sheet(os.path.join(SRC, "effects", "effects_spritesheet.png"), 24, 70, 175, (6, 9),
                     grid=(6.5, 151.5, 1506.0))

    def halo(c):
        return (sat(c) < 60) & (lum(c) < 175)

    d = peel_halo(d, halo)
    cell = d.shape[0] / 4
    out = {}
    for name, (cx, cy) in FX_CELLS.items():
        crop = d[int(cy * cell): int((cy + 1) * cell), int(cx * cell): int((cx + 1) * cell)].copy()
        crop = trim(remove_specks(crop, 1))
        emit(f"fx/{name}.png", crop)
        out[name] = [int(crop.shape[1]), int(crop.shape[0])]
    manifest["fx"] = out


# 8. Generated pixel art ---------------------------------------------------------
def canvas(w: int, h: int) -> np.ndarray:
    return np.zeros((h, w, 4), np.uint8)


def put(c: np.ndarray, x: int, y: int, col) -> None:
    if 0 <= y < c.shape[0] and 0 <= x < c.shape[1]:
        c[y, x] = (*col, 255) if len(col) == 3 else col


def rect(c, x, y, w, h, col):
    for yy in range(y, y + h):
        for xx in range(x, x + w):
            put(c, xx, yy, col)


def outline(c: np.ndarray, col=OUTLINE, diagonal=False) -> np.ndarray:
    a = c[..., 3] > 0
    st = np.ones((3, 3), bool) if diagonal else ndimage.generate_binary_structure(2, 1)
    ring = ndimage.binary_dilation(np.pad(a, 1), structure=st)[1:-1, 1:-1] & ~a
    out = c.copy()
    out[ring] = (*col, 255)
    return out


def from_ascii(rows: list[str], pal: dict) -> np.ndarray:
    h, w = len(rows), max(len(r) for r in rows)
    c = canvas(w, h)
    for y, r in enumerate(rows):
        for x, ch in enumerate(r):
            if ch in pal:
                put(c, x, y, pal[ch])
    return c


def star_shape(size: int, r_out: float, r_in: float, rot=-math.pi / 2):
    pts = []
    for i in range(10):
        r = r_out if i % 2 == 0 else r_in
        ang = rot + i * math.pi / 5
        pts.append((size / 2 + r * math.cos(ang), size / 2 + r * math.sin(ang) + 0.6))

    def inside(px, py):
        n = len(pts)
        ins = False
        j = n - 1
        for i in range(n):
            xi, yi = pts[i]
            xj, yj = pts[j]
            if (yi > py) != (yj > py) and px < (xj - xi) * (py - yi) / (yj - yi) + xi:
                ins = not ins
            j = i
        return ins
    m = np.zeros((size, size), bool)
    for y in range(size):
        for x in range(size):
            hits = sum(inside(x + (i + 0.5) / 4, y + (j + 0.5) / 4) for i in range(4) for j in range(4))
            m[y, x] = hits >= 7
    return m


def build_star():
    size = 17
    m = star_shape(size, 7.6, 3.4)
    c = canvas(size, size)
    yy, xx = np.mgrid[0:size, 0:size]
    shade = (xx - size / 2) * 0.5 + (yy - size / 2) * 0.8
    for y, x in zip(*np.where(m)):
        s = shade[y, x]
        col = GOLD_L if s < -3.5 else GOLD if s < 2.5 else GOLD_D
        put(c, x, y, col)
    # inner bottom-right rim
    a = c[..., 3] > 0
    er = ndimage.binary_erosion(a)
    rim = a & ~er
    for y, x in zip(*np.where(rim)):
        if shade[y, x] > 0:
            put(c, x, y, GOLD_D)
    put(c, 7, 6, (255, 255, 240))
    put(c, 6, 7, (255, 255, 240))
    c = outline(c, GOLD_DD)
    c = trim(c)
    emit("star.png", c, 8)
    manifest["star"] = {"width": int(c.shape[1]), "height": int(c.shape[0])}


def build_flames():
    pal = {"o": (246, 142, 64), "y": (255, 206, 96), "w": (255, 248, 222), "r": (214, 96, 52)}
    frames = [
        ["..o..",
         "..o..",
         ".oyo.",
         ".oyo.",
         "oywyo",
         "oywyo",
         "oywyo",
         ".oyo."],
        ["...o.",
         "..oo.",
         ".oyo.",
         ".oyyo",
         "oywyo",
         "oywyo",
         "oywyo",
         ".oyo."],
        [".o...",
         ".oo..",
         ".oyo.",
         "oyyo.",
         "oywyo",
         "oywyo",
         "oywyo",
         ".oyo."],
    ]
    sheet = np.concatenate([from_ascii(f, pal) for f in frames], axis=1)
    emit("flame.png", sheet, 10)
    manifest["flame"] = {"frameWidth": 5, "frameHeight": 8, "frames": 3}


def build_glow():
    s = 96
    c = canvas(s, s)
    yy, xx = np.mgrid[0:s, 0:s]
    d = np.hypot(xx - s / 2 + 0.5, yy - s / 2 + 0.5) / (s / 2)
    bands = [(0.12, 255), (0.22, 196), (0.33, 148), (0.45, 108), (0.57, 76), (0.69, 50),
             (0.8, 30), (0.9, 16), (1.0, 7)]
    alpha = np.zeros((s, s), np.uint8)
    for i, (r, al) in enumerate(bands):
        lo = bands[i - 1][0] if i else 0
        m = (d >= lo) & (d < r)
        alpha[m] = al
        # 1px checker dither on the outer edge of each band
        edge = (d >= r - 0.035) & (d < r) & ((xx + yy) % 2 == 0)
        if i + 1 < len(bands):
            alpha[edge] = bands[i + 1][1]
    c[..., :3] = 255
    c[..., 3] = alpha
    emit("glow.png", c, 3)


def build_particles():
    dot = canvas(2, 2)
    rect(dot, 0, 0, 2, 2, (255, 255, 255))
    emit("px_dot.png", dot, 10)
    sp = from_ascii(["..w..", "..w..", "wwWww", "..w..", "..w.."],
                    {"w": (255, 244, 200), "W": (255, 255, 255)})
    emit("px_sparkle.png", sp, 10)
    sm = from_ascii([".w.", "wWw", ".w."], {"w": (255, 236, 170), "W": (255, 255, 255)})
    emit("px_twinkle.png", sm, 10)


def build_sign():
    c = canvas(26, 26)
    # post
    rect(c, 11, 12, 4, 14, WOOD)
    rect(c, 11, 12, 1, 14, WOOD_L)
    rect(c, 14, 12, 1, 14, WOOD_D)
    # board
    rect(c, 1, 2, 24, 12, WOOD_L)
    rect(c, 1, 7, 24, 1, WOOD)
    rect(c, 1, 12, 24, 2, WOOD)
    rect(c, 1, 2, 24, 1, (220, 168, 116))
    # arrow (cream) pointing right
    for i, (x0, w) in enumerate([(13, 2), (13, 4), (6, 9), (6, 11), (6, 9), (13, 4), (13, 2)]):
        pass
    arrow = ["......c....",
             "......cc...",
             "cccccccccc.",
             "ccccccccccc",
             "cccccccccc.",
             "......cc...",
             "......c...."]
    for y, row in enumerate(arrow):
        for x, ch in enumerate(row):
            if ch == "c":
                put(c, 7 + x, 4 + y, CREAM)
    c = outline(c)
    # nails
    put(c, 3, 4, WOOD_D)
    put(c, 22, 4, WOOD_D)
    emit("sign.png", trim(c), 8)


def build_fence():
    c = canvas(24, 16)
    for px in (2, 14):
        rect(c, px, 1, 4, 15, WOOD_L)
        rect(c, px + 3, 1, 1, 15, WOOD)
        put(c, px, 0, WOOD_L)
        put(c, px + 1, 0, WOOD_L)
        put(c, px + 2, 0, WOOD_L)
    for ry in (4, 10):
        rect(c, 0, ry, 24, 3, WOOD)
        rect(c, 0, ry, 24, 1, WOOD_L)
    c = outline(c)
    # make it tile: wipe outline on left/right edges where rails continue
    for ry in (4, 10):
        for y in range(ry, ry + 3):
            for x in (0, 23):
                c[y, x] = (*WOOD, 255) if y > ry else (*WOOD_L, 255)
    emit("fence.png", c, 8)


def build_lantern_flower():
    # tall flower used as a foreground accent
    pal = {"p": PINK, "P": PINK_D, "c": CREAM, "g": (128, 170, 96), "G": (92, 132, 82), "y": GOLD}
    tulip = from_ascii([
        ".p.p.",
        "ppppp",
        "pPyPp",
        ".PPP.",
        "..g..",
        ".gg..",
        "..gG.",
        "..g..",
    ], pal)
    emit("flower_tulip.png", outline(tulip), 10)
    daisy = from_ascii([
        ".c.c.",
        "cc.cc",
        ".cyc.",
        "cc.cc",
        ".cGc.",
        "..G..",
        ".gG..",
        "..G..",
    ], pal)
    emit("flower_daisy.png", outline(daisy), 10)


def periodic_profile(w: int, base: float, terms, seed: int) -> np.ndarray:
    rng = np.random.default_rng(seed)
    x = np.arange(w)
    h = np.full(w, base, np.float32)
    for k, amp in terms:
        h += amp * np.sin(2 * np.pi * k * x / w + rng.uniform(0, 2 * np.pi))
    return h


def build_backgrounds():
    W = 640
    # sky: soft bands with 2px checker dithering between them
    sky_cols = [(150, 172, 214), (170, 182, 222), (192, 192, 228), (214, 200, 226),
                (234, 208, 220), (246, 220, 210), (250, 232, 206)]
    H = 360
    sky = canvas(8, H)
    band_h = H / len(sky_cols)
    for y in range(H):
        i = min(int(y / band_h), len(sky_cols) - 1)
        frac = (y - i * band_h) / band_h
        for x in range(8):
            col = sky_cols[i]
            if i + 1 < len(sky_cols) and frac > 0.82 and (x + y) % 2 == 0:
                col = sky_cols[i + 1]
            put(sky, x, y, col)
    emit("bg/sky.png", sky, 1)

    def layer(h, base, terms, seed, col, col_hi, col_lo, bumps=0, bump_r=(6, 14), detail=None):
        prof = periodic_profile(W, base, terms, seed)
        rng = np.random.default_rng(seed + 7)
        c = canvas(W, h)
        top = prof.copy()
        if bumps:
            for _ in range(bumps):
                bx = rng.uniform(0, W)
                br = rng.uniform(*bump_r)
                for dx in range(-int(br) - 1, int(br) + 2):
                    xx = int(bx + dx) % W
                    if abs(dx) <= br:
                        top[xx] = min(top[xx], prof[xx] - math.sqrt(br * br - dx * dx) * 0.9)
        top = np.round(top).astype(int)
        for x in range(W):
            t = max(top[x], 0)
            c[t:, x] = (*col, 255)
            c[t:t + 1, x] = (*col_hi, 255)
            if x > 0 and top[x - 1] > top[x] + 1:
                pass
        # darker lower band with dither boundary
        lo_start = (np.round(prof).astype(int) + (h - prof.astype(int)) // 2)
        for x in range(W):
            for y in range(max(lo_start[x], 0), h):
                if y > lo_start[x] + 1 or (x + y) % 2 == 0:
                    c[y, x, :3] = col_lo
        if detail:
            detail(c, top, rng)
        return c

    far = layer(150, 70, [(1, 14), (2, 9), (3, 6), (5, 3)], 3, (184, 168, 210), (206, 192, 226), (170, 154, 200))
    emit("bg/hills_far.png", far, 1)

    mid = layer(150, 72, [(1, 10), (2, 8), (4, 4)], 11, (148, 170, 150), (174, 196, 166), (128, 152, 136),
                bumps=70, bump_r=(5, 13))
    emit("bg/hills_mid.png", mid, 1)

    def canopy_detail(trunk_col, leaf_col, deep_col):
        def detail(c, top, rng):
            h = c.shape[0]
            # little leaf highlights near the top of the canopy
            for _ in range(900):
                x = int(rng.integers(0, W))
                y = int(top[x] + rng.integers(2, 16))
                if 0 <= y < h and c[y, x, 3] and (x + y) % 2 == 0:
                    c[y, x, :3] = leaf_col
                    c[y, (x + 1) % W, :3] = leaf_col
            # trunks peeking out under the canopy
            for _ in range(26):
                x = int(rng.integers(0, W - 2))
                y0 = int(top[x] + rng.integers(26, 40))
                c[y0:h, x:x + 2, :3] = trunk_col
            # deep shade towards the bottom (visible in pits)
            for y in range(h - 70, h):
                for x in range(W):
                    if y > h - 66 or (x + y) % 2 == 0:
                        c[y, x, :3] = deep_col
        return detail

    near = layer(240, 74, [(2, 8), (3, 6), (5, 4)], 23, (112, 146, 116), (138, 172, 132), (96, 128, 104),
                 bumps=90, bump_r=(6, 16), detail=canopy_detail((84, 104, 92), (130, 164, 124), (72, 92, 84)))
    emit("bg/forest_near.png", near, 1)

    # clouds
    rng = np.random.default_rng(5)
    for idx, (w, h, n) in enumerate([(56, 20, 6), (40, 16, 5), (72, 24, 8)]):
        c = canvas(w, h)
        yy, xx = np.mgrid[0:h, 0:w]
        m = np.zeros((h, w), bool)
        for i in range(n):
            cx = 8 + (w - 16) * i / max(n - 1, 1) + rng.uniform(-2, 2)
            r = rng.uniform(h * 0.32, h * 0.5) * (1.0 if 0 < i < n - 1 else 0.7)
            cy = h - r - 1
            m |= (xx - cx) ** 2 + (yy - cy) ** 2 <= r * r
        m[h - 1] = False
        c[m] = (*CREAM, 255)
        shade = m & (yy >= h - 5)
        c[shade] = (*(228, 214, 228), 255)
        dither = m & (yy == h - 6) & ((xx % 2) == 0)
        c[dither] = (*(228, 214, 228), 255)
        emit(f"bg/cloud_{idx}.png", trim(c), 4)


def build_ui():
    def button(size, fill, fill_d, icon_rows, pressed=False, round_shape=False, icon_scale=1):
        if icon_scale > 1:
            icon_rows = ["".join(ch * icon_scale for ch in r) for r in icon_rows for _ in range(icon_scale)]
        s = size
        c = canvas(s, s + 3)
        yy, xx = np.mgrid[0:s, 0:s]
        if round_shape:
            m = (xx - s / 2 + 0.5) ** 2 + (yy - s / 2 + 0.5) ** 2 <= (s / 2 - 1) ** 2
        else:
            r = 6
            m = np.ones((s, s), bool)
            for cy, cx in ((r, r), (r, s - 1 - r), (s - 1 - r, r), (s - 1 - r, s - 1 - r)):
                corner = ((yy < r) if cy == r else (yy > s - 1 - r)) & ((xx < r) if cx == r else (xx > s - 1 - r))
                m &= ~(corner & ((xx - cx) ** 2 + (yy - cy) ** 2 > r * r))
            m[0, :] &= False
            m[:, 0] &= False
            m[-1, :] &= False
            m[:, -1] &= False
        off = 2 if pressed else 0
        # drop shadow
        if not pressed:
            sh = np.zeros((s + 3, s), bool)
            sh[3:3 + s] = m
            c[sh] = (*LAV_D, 255)
        body = np.zeros((s + 3, s), bool)
        body[off:off + s] = m
        c[body] = (*fill, 255)
        # lower shading band
        lower = np.zeros((s + 3, s), bool)
        lower[off + s // 2 + 4: off + s] = m[s // 2 + 4:]
        c[lower & body] = (*fill_d, 255)
        # highlight
        hl = np.zeros((s + 3, s), bool)
        hl[off + 3: off + 5] = m[3:5] & (xx[3:5] > 6) & (xx[3:5] < s // 2)
        c[hl] = (255, 252, 240, 255)
        c = outline(c)
        ih, iw = len(icon_rows), len(icon_rows[0])
        ix, iy = (s - iw) // 2, (s - ih) // 2 + off
        for y, row in enumerate(icon_rows):
            for x, ch in enumerate(row):
                if ch == "#":
                    put(c, ix + x, iy + y, OUTLINE)
        return c

    arrow_r = ["##......",
               "####....",
               "######..",
               "########",
               "########",
               "######..",
               "####....",
               "##......"]
    arrow_r = [r for r in arrow_r]
    arrow_l = [r[::-1] for r in arrow_r]
    arrow_u = ["....##....",
               "...####...",
               "..######..",
               ".########.",
               "##########",
               "...####...",
               "...####...",
               "...####..."]
    for name, rows, fill, fill_d, rnd in (("btn_left", arrow_l, CREAM, CREAM_D, False),
                                          ("btn_right", arrow_r, CREAM, CREAM_D, False),
                                          ("btn_jump", arrow_u, PINK, PINK_D, True)):
        size = 44 if not rnd else 52
        emit(f"ui/{name}.png", button(size, fill, fill_d, rows, round_shape=rnd, icon_scale=2), 4)
        emit(f"ui/{name}_down.png", button(size, (236, 220, 196) if not rnd else (226, 150, 166),
                                           CREAM_D if not rnd else PINK_D, rows, pressed=True,
                                           round_shape=rnd, icon_scale=2), 4)
    # fullscreen icon button
    fs = ["###..###",
          "#......#",
          "#......#",
          "........",
          "........",
          "#......#",
          "#......#",
          "###..###"]
    emit("ui/btn_fullscreen.png", button(22, CREAM, CREAM_D, fs), 6)
    # nine-slice panel 12x12, corner 4
    p = canvas(12, 12)
    rect(p, 1, 1, 10, 10, CREAM)
    rect(p, 1, 8, 10, 3, CREAM_D)
    for (x, y) in ((1, 1), (10, 1), (1, 10), (10, 10)):
        p[y, x] = 0
    p = outline(p)
    emit("ui/panel.png", p, 10)
    # pill panel for buttons (nine-slice, pink)
    q = canvas(16, 16)
    rect(q, 1, 1, 14, 14, PINK)
    rect(q, 1, 10, 14, 5, PINK_D)
    rect(q, 3, 3, 4, 1, (255, 222, 226))
    for (x, y) in ((1, 1), (14, 1), (1, 14), (14, 14), (2, 1), (1, 2), (13, 1), (14, 2), (1, 13), (2, 14), (13, 14), (14, 13)):
        q[y, x] = 0
    q = outline(q)
    emit("ui/button_pink.png", q, 10)


def main():
    os.makedirs(OUT, exist_ok=True)
    if "--only" in sys.argv:
        for name in sys.argv[sys.argv.index("--only") + 1].split(","):
            globals()[f"build_{name}"]()
        write_manifest()
        return
    build_girl()
    build_fire()
    build_cake()
    build_pipe()
    build_hearts()
    build_tiles()
    build_fx()
    build_generated()
    write_manifest()


def build_phone():
    """Little pixel phone used by the 'turn your phone sideways' welcome screen."""
    W, H = 30, 50
    c = canvas(W, H)
    # rounded body
    rect(c, 1, 0, W - 2, H, LAV)
    rect(c, 0, 1, W, H - 2, LAV)
    rect(c, W - 3, 2, 2, H - 4, LAV_D)  # right-side shade
    rect(c, 2, 1, W - 6, 1, (204, 190, 232))  # top highlight
    # screen: a tiny landscape version of the game world, drawn rotated so it
    # only looks right once the phone is turned sideways (CSS turns it -90deg)
    sx, sy, sw, sh = 3, 6, W - 6, H - 13
    lw, lh = sh, sw  # landscape scene size
    scene = np.zeros((lh, lw, 4), np.uint8)
    sky = [(150, 172, 214), (192, 192, 228), (234, 208, 220)]
    for y in range(lh):
        scene[y, :] = (*sky[min(y * len(sky) // lh, len(sky) - 1)], 255)
    for x in range(lw):
        h = int(4 + 2.5 * math.sin(x / 3.4))
        scene[lh - 6 - h: lh - 6, x] = (148, 170, 150, 255)
    scene[lh - 6: lh - 4, :] = (156, 190, 110, 255)
    scene[lh - 4:, :] = (176, 120, 86, 255)
    # tiny girl (hair, face, coat, boots)
    gx, gy = 8, lh - 12
    scene[gy: gy + 2, gx: gx + 3] = (40, 44, 120, 255)
    scene[gy + 2, gx: gx + 3] = (246, 200, 170, 255)
    scene[gy + 3: gy + 5, gx: gx + 3] = (238, 232, 200, 255)
    scene[gy + 5, gx] = scene[gy + 5, gx + 2] = (128, 92, 120, 255)
    # star + heart to collect
    for dx, dy in ((0, -1), (-1, 0), (0, 0), (1, 0), (0, 1)):
        scene[6 + dy, 22 + dx] = (255, 208, 92, 255)
    scene[lh - 11, 30] = scene[lh - 11, 32] = (60, 90, 230, 255)
    scene[lh - 10, 30:33] = (60, 90, 230, 255)
    scene[lh - 9, 31] = (60, 90, 230, 255)
    c[sy: sy + sh, sx: sx + sw] = np.rot90(scene, k=-1)
    # speaker slot + home button
    rect(c, W // 2 - 3, 3, 6, 1, LAV_D)
    rect(c, W // 2 - 2, H - 5, 4, 3, (204, 190, 232))
    rect(c, W // 2 - 1, H - 4, 2, 1, LAV_D)
    c = outline(np.pad(c, ((1, 1), (1, 1), (0, 0))))
    emit("ui/phone.png", c, 6)


def build_generated():
    print("generated art")
    build_star()
    build_flames()
    build_glow()
    build_particles()
    build_sign()
    build_fence()
    build_lantern_flower()
    build_backgrounds()
    build_ui()
    build_phone()


def write_manifest():
    mf = os.path.join(OUT, "manifest.json")
    merged = {}
    if os.path.exists(mf):
        with open(mf) as fh:
            merged = json.load(fh)
    merged.update(manifest)
    with open(mf, "w") as fh:
        json.dump(merged, fh, indent=2, default=int)
    ts = os.path.join(ROOT, "src", "config", "generatedAssets.ts")
    os.makedirs(os.path.dirname(ts), exist_ok=True)
    with open(ts, "w") as fh:
        fh.write("// AUTO-GENERATED by scripts/process_assets.py - do not edit by hand.\n")
        fh.write("export const GEN = " + json.dumps(merged, indent=2, default=int) + " as const;\n")
    print("wrote", os.path.relpath(ts, ROOT))


if __name__ == "__main__":
    main()
