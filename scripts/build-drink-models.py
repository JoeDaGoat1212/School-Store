"""Build a 3D drink (shape + wrap-around label) from each product photo.

For every photo of a single drink on a plain background:
  1. Find the drink's outline (silhouette) row by row.
  2. Its half-width on each row is the radius of the 3D shape at that height
     -> a "lathe" profile (like turning wood on a lathe).
  3. Unwrap the photo onto that shape: each column of the texture is an angle
     round the drink, read back off the photo with x = center + radius * sin(angle).
     The back repeats the front, crossfaded at the sides.
  4. Even out the photo's own side-shading (the 3D scene lights it again).

usage: build_models.py photos_dir out_dir manifest.json [slug ...]
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

SRC, OUT, MANIFEST = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
ONLY = set(sys.argv[4:])
OUT.mkdir(parents=True, exist_ok=True)

HEIGHT_3D = 1.9  # every drink is this tall in the scene (centered on 0)
TEX_W, TEX_H = 2048, 1024
POINTS = 120  # profile points (bottom -> top)
USE = np.radians(70)  # how far round the side the photo is trusted
FADE = np.radians(14)
CLEAR = {"bottled-water"}  # see-through plastic


def silhouette(rgb, alpha):
    h, w, _ = rgb.shape
    if alpha is not None and (alpha < 128).mean() > 0.05:
        mask = alpha > 128
        bg = None
    else:
        border = np.concatenate([rgb[:4].reshape(-1, 3), rgb[-4:].reshape(-1, 3), rgb[:, :4].reshape(-1, 3), rgb[:, -4:].reshape(-1, 3)])
        bg = np.median(border, 0)
        dist = np.sqrt(((rgb - bg) ** 2).sum(-1))
        mask = dist > 22
    mask = ndimage.binary_closing(mask, iterations=3)
    mask = ndimage.binary_fill_holes(mask)
    mask = ndimage.binary_opening(mask, iterations=2)
    lab, n = ndimage.label(mask)
    sizes = ndimage.sum(mask, lab, range(1, n + 1))
    mask = lab == (np.argmax(sizes) + 1)
    return mask, bg


def build(slug):
    im = Image.open(SRC / f"{slug}.webp")
    rgba = np.asarray(im.convert("RGBA")).astype(float)
    rgb, alpha = rgba[..., :3], rgba[..., 3]
    mask, bg = silhouette(rgb, alpha)
    H, W = mask.shape
    rows = np.where(mask.any(1))[0]
    top, bottom = rows[0], rows[-1]
    left = np.array([np.argmax(mask[y]) if mask[y].any() else 0 for y in range(H)])
    right = np.array([W - 1 - np.argmax(mask[y][::-1]) if mask[y].any() else 0 for y in range(H)])
    body = slice(top + int((bottom - top) * 0.25), bottom - int((bottom - top) * 0.25))
    cx = float(np.median((left[body] + right[body]) / 2))
    touches = ((left[top:bottom] <= 1) | (right[top:bottom] >= W - 2)).mean()
    half = np.zeros(H)
    half[top:bottom + 1] = (right[top:bottom + 1] - left[top:bottom + 1] + 1) / 2
    half = ndimage.median_filter(half, size=7)
    half[top:bottom + 1] = ndimage.gaussian_filter1d(half[top:bottom + 1], 2.5)

    # ---- texture --------------------------------------------------------------
    # Fill the background with the nearest drink colour so edge sampling never picks up white.
    filled = rgb.copy()
    idx = ndimage.distance_transform_edt(~mask, return_distances=False, return_indices=True)
    filled = filled[idx[0], idx[1]]

    v = np.linspace(0, 1, TEX_H)  # 0 = top row of the texture
    ys = top + v * (bottom - top)
    u = (np.arange(TEX_W) + 0.5) / TEX_W
    phi = (u - 0.5) * 2 * np.pi
    local = np.where(np.abs(phi) <= np.pi / 2, phi, phi - np.sign(phi) * np.pi)
    squeeze = USE / (np.pi / 2)

    def sample(angles):
        r = np.interp(ys, np.arange(H), half)[:, None]
        x = cx + r * np.sin(angles * squeeze)[None, :]
        y = np.broadcast_to(ys[:, None], x.shape)
        return np.stack([ndimage.map_coordinates(filled[..., c], [y, x], order=1, mode="nearest") for c in range(3)], -1)

    front = sample(local)
    other = sample(-local)
    w = (np.clip((np.abs(local) - (np.pi / 2 - FADE)) / FADE, 0, 1) * 0.5)[None, :, None]
    tex = front * (1 - w) + other * w

    # Even out side-shading: fit brightness ~ a * (1 - b * angle^2) across the front, undo it.
    lum = tex.max(-1)
    mid_rows = slice(int(TEX_H * 0.2), int(TEX_H * 0.8))
    front_cols = np.abs(local) < np.pi / 2
    ang = (local * squeeze)[front_cols]
    med = np.median(lum[mid_rows][:, front_cols], 0)
    ok = med > 25
    if ok.sum() > 50:
        A = np.stack([np.ones(ok.sum()), -(ang[ok] ** 2)], 1)
        coef, *_ = np.linalg.lstsq(A, np.log(med[ok]), rcond=None)
        b = max(0.0, coef[1])
        gain = np.exp(b * (local * squeeze) ** 2)
        gain = np.clip(gain, 1, 1.45)
        tex = np.clip(tex * gain[None, :, None], 0, 255)
    else:
        b = 0.0

    out_alpha = None
    if slug in CLEAR:
        # Near-white, colourless parts are clear plastic: mostly see-through.
        sat = tex.max(-1) - tex.min(-1)
        whiteness = np.clip((tex.min(-1) - 175) / 60, 0, 1) * np.clip(1 - sat / 40, 0, 1)
        out_alpha = (255 * (1 - 0.78 * whiteness)).astype(np.uint8)

    img = tex.astype(np.uint8)
    if out_alpha is not None:
        Image.fromarray(np.dstack([img, out_alpha]), "RGBA").save(OUT / f"{slug}.webp", quality=88, method=6)
    else:
        Image.fromarray(img).save(OUT / f"{slug}.webp", quality=88, method=6)

    # ---- profile (bottom -> top) -----------------------------------------------
    span = bottom - top
    scale = HEIGHT_3D / span
    py = np.linspace(bottom, top, POINTS)
    pr = np.interp(py, np.arange(H), half) * scale
    pr[0] = pr[-1] = 0.0  # close the ends
    profile = [[round(float(r), 4), round(float(HEIGHT_3D / 2 - (y - top) * scale), 4)] for r, y in zip(pr, py)]
    return {
        "profile": profile,
        "clear": slug in CLEAR,
        "maxRadius": round(float(pr.max()), 3),
        "_touches_edge": round(float(touches), 3),
        "_shade_b": round(float(b), 3),
        "_px": [int(W), int(H), int(span)],
    }


slugs = sorted(p.stem for p in SRC.glob("*.webp"))
manifest = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {}
for slug in slugs:
    if ONLY and slug not in ONLY:
        continue
    manifest[slug] = build(slug)
    m = manifest[slug]
    print(f"{slug:32s} maxR={m['maxRadius']:.3f} edge={m['_touches_edge']:.2f} shadeB={m['_shade_b']:.2f} px={m['_px']}")
MANIFEST.write_text(json.dumps(manifest))
