"""Turn photos of bags, candy bars and wrapped snacks into 3D-ready files.

For each product:
  - cut it out of its background (or use the photo's own transparency),
  - turn it level if it was photographed at an angle (e.g. a tilted candy bar),
  - write <slug>.webp (the cut-out, with transparency) and <slug>-depth.png:
    how far each spot bulges out, highest in the middle and falling off at
    the edges. The website pushes a flat sheet out by that amount (front and
    back), which makes a puffy bag or a wrapped bar.

usage: build_packs.py out_dir specs.json
specs: [{slug, src, crop?: [l,t,r,b] (fractions), puff: 0..1 (how round), ...}]
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

OUT = Path(sys.argv[1])
SPECS = json.loads(Path(sys.argv[2]).read_text())
OUT.mkdir(parents=True, exist_ok=True)
MAX = 768  # cut-out size (longest side)
DEPTH_MAX = 96  # depth map size (longest side)


def cutout_mask(rgba):
    alpha = rgba[..., 3]
    if (alpha < 128).mean() > 0.02:  # already transparent around the product
        return alpha > 128
    rgb = rgba[..., :3]
    border = np.concatenate([rgb[:3].reshape(-1, 3), rgb[-3:].reshape(-1, 3), rgb[:, :3].reshape(-1, 3), rgb[:, -3:].reshape(-1, 3)])
    bg = np.median(border, 0)
    near = np.sqrt(((rgb - bg) ** 2).sum(-1)) < 24
    # Background = the near-background colour that touches the picture's edge
    # (white printing inside the package stays).
    lab, _ = ndimage.label(near)
    edge_labels = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    bgmask = np.isin(lab, edge_labels[edge_labels > 0])
    mask = ~bgmask
    mask = ndimage.binary_opening(mask, iterations=2)
    lab, n = ndimage.label(mask)
    sizes = ndimage.sum(mask, lab, range(1, n + 1))
    return lab == (np.argmax(sizes) + 1)


def level_angle(mask):
    """Degrees to turn the product so its long side is level (0 if already close)."""
    ys, xs = np.nonzero(mask)
    xs = xs - xs.mean()
    ys = ys - ys.mean()
    cov = np.cov(np.stack([xs, ys]))
    vals, vecs = np.linalg.eigh(cov)
    major = vecs[:, np.argmax(vals)]
    angle = np.degrees(np.arctan2(major[1], major[0]))
    if angle > 90:
        angle -= 180
    if angle < -90:
        angle += 180
    elongated = vals.max() / max(vals.min(), 1) > 3
    return angle if elongated and 4 < abs(angle) < 60 else 0.0


meta = {}
for spec in SPECS:
    slug = spec["slug"]
    im = Image.open(spec["src"]).convert("RGBA")
    if "crop" in spec:
        l, t, r, b = spec["crop"]
        im = im.crop((int(l * im.width), int(t * im.height), int(r * im.width), int(b * im.height)))
    rgba = np.asarray(im).astype(np.uint8)
    mask = cutout_mask(rgba.astype(float))

    angle = level_angle(mask)
    if angle:
        im = Image.fromarray(rgba).rotate(angle, resample=Image.BICUBIC, expand=True)
        m = Image.fromarray((mask * 255).astype(np.uint8)).rotate(angle, resample=Image.BILINEAR, expand=True)
        rgba = np.asarray(im)
        mask = np.asarray(m) > 128

    mask = ndimage.binary_fill_holes(mask)
    mask = ndimage.binary_erosion(mask, iterations=1)  # drop the light fringe from the old background
    ys, xs = np.nonzero(mask)
    t, b, l, r = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    rgba = rgba[t:b, l:r].copy()
    mask = mask[t:b, l:r]
    soft = ndimage.gaussian_filter(mask.astype(float), 0.7)
    rgba[..., 3] = (np.minimum(rgba[..., 3] / 255, soft) * 255).astype(np.uint8)

    h, w = mask.shape
    scale = MAX / max(h, w)
    out = Image.fromarray(rgba, "RGBA")
    if scale < 1:
        out = out.resize((round(w * scale), round(h * scale)), Image.LANCZOS)
    out.save(OUT / f"{slug}.webp", quality=86, method=6)

    # Depth: distance to the edge -> a rounded bulge.
    dscale = DEPTH_MAX / max(h, w)
    small = np.asarray(Image.fromarray((mask * 255).astype(np.uint8)).resize((max(2, round(w * dscale)), max(2, round(h * dscale))), Image.BILINEAR)) > 127
    dist = ndimage.distance_transform_edt(small)
    ramp = max(1.0, spec.get("puff", 0.5) * 0.5 * min(small.shape))
    t_ = np.clip(dist / ramp, 0, 1)
    depth = np.sqrt(1 - (1 - t_) ** 2)  # quarter circle: round at the edges, flat on top
    depth = ndimage.gaussian_filter(depth, 0.6) * small
    Image.fromarray((depth * 255).astype(np.uint8), "L").save(OUT / f"{slug}-depth.png", optimize=True)

    meta[slug] = {"aspect": round(h / w, 4), "angle": round(float(angle), 1)}
    print(f"{slug:28s} {w}x{h} aspect={h / w:.2f} turned={angle:.1f}")

Path(OUT / "_meta.json").write_text(json.dumps(meta))
