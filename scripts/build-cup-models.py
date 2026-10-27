"""Ramen cups: wrap the front of the photo round a tapered cup (the back repeats the front)."""
import json, sys
import numpy as np
from PIL import Image
from scipy import ndimage
OUT = sys.argv[1]
CUPS = {"ramen-cup-beef": ("snackphotos/ramen-cup-beef.webp", (0.13, 0.0, 0.99, 0.97)),
        "ramen-cup-chicken": ("snackphotos/ramen-cup-chicken.webp", (0.215, 0.08, 1.0, 0.98))}
TEX_W, TEX_H, USE, FADE = 1536, 768, np.radians(66), np.radians(16)
for slug, (src, (l, t, r, b)) in CUPS.items():
    im = Image.open(src).convert("RGB")
    im = im.crop((int(l * im.width), int(t * im.height), int(r * im.width), int(b * im.height)))
    a = np.asarray(im).astype(float)
    H, W, _ = a.shape
    cx, R = W / 2, W / 2
    u = (np.arange(TEX_W) + 0.5) / TEX_W
    phi = (u - 0.5) * 2 * np.pi
    local = np.where(np.abs(phi) <= np.pi / 2, phi, phi - np.sign(phi) * np.pi)
    sq = USE / (np.pi / 2)
    ys = np.linspace(0, H - 1, TEX_H)
    def sample(ang):
        x = cx + R * np.sin(ang * sq)
        X, Y = np.meshgrid(x, ys)
        return np.stack([ndimage.map_coordinates(a[..., c], [Y, X], order=1, mode="nearest") for c in range(3)], -1)
    w = (np.clip((np.abs(local) - (np.pi / 2 - FADE)) / FADE, 0, 1) * 0.5)[None, :, None]
    tex = sample(local) * (1 - w) + sample(-local) * w
    Image.fromarray(tex.astype(np.uint8)).save(f"{OUT}/{slug}.webp", quality=84, method=6)
    Image.fromarray(tex.astype(np.uint8)).resize((512, 256), Image.LANCZOS).save(f"{OUT}/{slug}-sm.webp", quality=80, method=6)
    print(slug, W, H)
