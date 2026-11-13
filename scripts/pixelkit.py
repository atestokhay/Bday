"""Helpers for turning the AI-generated JPEG sprite sheets into clean pixel art.

The source files under public/assets are JPEGs (despite the .png extension)
with a checkerboard baked in instead of real transparency, rendered at roughly
10-16 screen pixels per art pixel. These helpers:

  1. classify the checkerboard background and flood-fill it from the border,
  2. find the real pixel grid (cell size + offset) of a sprite,
  3. sample each grid cell back down to a single native pixel,
  4. clean JPEG noise with a small palette quantisation.
"""
from __future__ import annotations

import numpy as np
from PIL import Image
from scipy import ndimage


def load_rgb(path: str) -> np.ndarray:
    return np.asarray(Image.open(path).convert("RGB")).astype(np.int16)


def bg_candidates(a: np.ndarray, sat_max: int, lum_min: int, lum_max: int) -> np.ndarray:
    mx = a.max(2)
    mn = a.min(2)
    lum = a.mean(2)
    return ((mx - mn) <= sat_max) & (lum >= lum_min) & (lum <= lum_max)


def background_mask(a: np.ndarray, sat_max: int, lum_min: int, lum_max: int,
                    big_hole_area: int = 0) -> np.ndarray:
    """True where the pixel is checkerboard background.

    Background = candidate regions connected to the image border, plus (optionally)
    enclosed candidate regions larger than big_hole_area (gaps between limbs etc.).
    """
    cand = bg_candidates(a, sat_max, lum_min, lum_max)
    # close tiny JPEG specks inside the checkerboard
    cand = np.pad(cand, 4, constant_values=True)
    cand = ndimage.binary_closing(cand, iterations=2)[4:-4, 4:-4]
    lab, n = ndimage.label(cand)
    border = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    keep = np.zeros(n + 1, bool)
    keep[border] = True
    if big_hole_area > 0:
        # Enclosed holes (between limbs, under vines...) are background only if they
        # are made of the same neutral checker tones found along the image border.
        lum = a.mean(2)
        sat = a.max(2) - a.min(2)
        ring = np.zeros(cand.shape, bool)
        ring[:12] = ring[-12:] = True
        ring[:, :12] = ring[:, -12:] = True
        bl = lum[ring & cand]
        tones = [np.percentile(bl, 20), np.percentile(bl, 80)]
        near_tone = ((np.abs(lum - tones[0]) < 10) | (np.abs(lum - tones[1]) < 10)) & (sat <= 12)
        areas = ndimage.sum(np.ones_like(lab), lab, index=np.arange(n + 1))
        tone_frac = ndimage.mean(near_tone, lab, index=np.arange(n + 1))
        keep |= (areas >= big_hole_area) & (tone_frac > 0.8)
    keep[0] = False
    return keep[lab]


def find_grid(a: np.ndarray, fg: np.ndarray, box: tuple[int, int, int, int],
              f_range: tuple[float, float], f_step: float = 0.25) -> tuple[float, float, float]:
    """Search cell size f and offsets (ox, oy) minimising reconstruction error inside box."""
    x0, y0, x1, y1 = box
    crop = a[y0:y1, x0:x1].astype(np.float32)
    m = fg[y0:y1, x0:x1]
    h, w = m.shape
    ys_full = np.arange(h)
    xs_full = np.arange(w)

    def err(f: float, ox: float, oy: float) -> float:
        cx = np.floor((xs_full - ox) / f)
        centre_x = np.clip((ox + (cx + 0.5) * f).astype(int), 0, w - 1)
        cy = np.floor((ys_full - oy) / f)
        centre_y = np.clip((oy + (cy + 0.5) * f).astype(int), 0, h - 1)
        rec = crop[centre_y][:, centre_x]
        return float(np.abs(rec - crop).sum(2)[m].mean())

    best = (1e18, 0.0, 0.0, 0.0)
    for f in np.arange(f_range[0], f_range[1] + 1e-6, 0.5):
        for ox in np.arange(0, f, 2.0):
            for oy in np.arange(0, f, 2.0):
                e = err(f, ox, oy)
                if e < best[0]:
                    best = (e, f, ox, oy)
    _, bf, box_, boy = best
    lo_f, hi_f = max(bf - 0.5, f_range[0]), min(bf + 0.5, f_range[1])
    for f in np.arange(lo_f, hi_f + 1e-6, f_step):
        for ox in np.arange(box_ - 2, box_ + 2.01, 1.0):
            for oy in np.arange(boy - 2, boy + 2.01, 1.0):
                e = err(f, ox % f, oy % f)
                if e < best[0]:
                    best = (e, f, ox % f, oy % f)
    return best[1], best[2] + x0, best[3] + y0


def downsample(a: np.ndarray, fg: np.ndarray, box: tuple[int, int, int, int],
               f: float, ox: float, oy: float, alpha_thresh: float = 0.5) -> np.ndarray:
    """Sample the region inside box on the grid (f, ox, oy) -> RGBA uint8 array."""
    x0, y0, x1, y1 = box
    # snap box to grid
    gx0 = int(np.floor((x0 - ox) / f))
    gy0 = int(np.floor((y0 - oy) / f))
    gx1 = int(np.ceil((x1 - ox) / f))
    gy1 = int(np.ceil((y1 - oy) / f))
    H, W = fg.shape
    out = np.zeros((gy1 - gy0, gx1 - gx0, 4), np.uint8)
    inner = 0.28  # sample the inner part of each cell to dodge JPEG ringing at edges
    for j in range(gy1 - gy0):
        cy0 = oy + (gy0 + j) * f
        ya, yb = int(round(cy0 + f * inner)), int(round(cy0 + f * (1 - inner)))
        ya2, yb2 = int(round(cy0)), int(round(cy0 + f))
        if yb2 <= 0 or ya2 >= H:
            continue
        for i in range(gx1 - gx0):
            cx0 = ox + (gx0 + i) * f
            xa, xb = int(round(cx0 + f * inner)), int(round(cx0 + f * (1 - inner)))
            xa2, xb2 = int(round(cx0)), int(round(cx0 + f))
            if xb2 <= 0 or xa2 >= W:
                continue
            cell_fg = fg[max(ya2, 0):min(yb2, H), max(xa2, 0):min(xb2, W)]
            if cell_fg.size == 0 or cell_fg.mean() < alpha_thresh:
                continue
            core = a[max(ya, 0):min(yb, H), max(xa, 0):min(xb, W)]
            core_fg = fg[max(ya, 0):min(yb, H), max(xa, 0):min(xb, W)]
            px = core[core_fg] if core_fg.any() else core.reshape(-1, 3)
            out[j, i, :3] = np.median(px, axis=0)
            out[j, i, 3] = 255
    return out


def quantize(rgba: np.ndarray, colors: int) -> np.ndarray:
    """Reduce JPEG colour noise: palette-quantise opaque pixels, keep hard alpha."""
    alpha = rgba[..., 3]
    rgb = Image.fromarray(np.ascontiguousarray(rgba[..., :3]))
    q = rgb.quantize(colors=colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    out = np.asarray(q.convert("RGB")).copy()
    res = np.zeros_like(rgba)
    res[..., :3] = out
    res[..., 3] = np.where(alpha > 0, 255, 0)
    res[alpha == 0, :3] = 0
    return res


def components(mask: np.ndarray, merge_px: int, min_area: int) -> list[tuple[int, int, int, int]]:
    """Bounding boxes (x0,y0,x1,y1) of foreground blobs, merging blobs within merge_px."""
    grown = ndimage.binary_dilation(mask, iterations=merge_px) if merge_px else mask
    lab, n = ndimage.label(grown)
    boxes = []
    for sl in ndimage.find_objects(lab):
        if sl is None:
            continue
        ys, xs = sl
        sub = mask[ys, xs]
        if sub.sum() < min_area:
            continue
        rows = np.where(sub.any(1))[0]
        cols = np.where(sub.any(0))[0]
        boxes.append((xs.start + cols[0], ys.start + rows[0], xs.start + cols[-1] + 1, ys.start + rows[-1] + 1))
    return boxes


def trim(rgba: np.ndarray) -> np.ndarray:
    a = rgba[..., 3] > 0
    if not a.any():
        return rgba
    rows = np.where(a.any(1))[0]
    cols = np.where(a.any(0))[0]
    return rgba[rows[0]:rows[-1] + 1, cols[0]:cols[-1] + 1]


def remove_specks(rgba: np.ndarray, min_size: int) -> np.ndarray:
    a = rgba[..., 3] > 0
    lab, n = ndimage.label(a)
    if n == 0:
        return rgba
    sizes = ndimage.sum(a, lab, index=np.arange(1, n + 1))
    out = rgba.copy()
    for k, s in enumerate(sizes, start=1):
        if s < min_size:
            out[lab == k] = 0
    return out


def peel_halo(rgba: np.ndarray, is_halo, max_iter: int = 60) -> np.ndarray:
    """Repeatedly clear opaque pixels touching transparency that satisfy is_halo(rgb)."""
    out = rgba.copy()
    rgb = out[..., :3].astype(np.int16)
    halo_like = is_halo(rgb)
    for _ in range(max_iter):
        clear = out[..., 3] == 0
        clear_p = np.pad(clear, 1, constant_values=True)
        touching = ndimage.binary_dilation(clear_p)[1:-1, 1:-1]
        hit = touching & ~clear & halo_like
        if not hit.any():
            break
        out[hit] = 0
    return out


def save(rgba: np.ndarray, path: str) -> None:
    Image.fromarray(rgba.astype(np.uint8), "RGBA").save(path)


def preview(rgba: np.ndarray, path: str, scale: int = 6, bg=(40, 36, 52)) -> None:
    h, w = rgba.shape[:2]
    canvas = np.zeros((h, w, 3), np.uint8)
    canvas[:] = bg
    m = rgba[..., 3] > 0
    canvas[m] = rgba[..., :3][m]
    Image.fromarray(canvas).resize((w * scale, h * scale), Image.NEAREST).save(path)
