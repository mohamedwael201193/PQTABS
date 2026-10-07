#!/usr/bin/env python3
"""PQTABS 3D icon cutout: gold-on-black renders -> true transparent WebP assets.

Technique: estimate the solid black background level from the image border,
then map (pixel - background) luminance to alpha so the object keeps its
glow/gradient falloff and the black box vanishes entirely.
"""
from PIL import Image, ImageFilter
import numpy as np
import os, sys

RAW = "/home/z/my-project/public/icons3d/raw"
DST = "/home/z/my-project/public/icons3d"
ICONS = {
    "key": 512, "card": 512, "robot": 512, "coin": 512,
    "lock": 512, "vault": 640, "hourglass": 512, "hex": 512,
    "shield": 512, "check": 512, "gauge": 512, "quantum": 512,
}

def cutout(name: str, size: int) -> dict:
    src = os.path.join(RAW, f"{name}.png")
    img = Image.open(src).convert("RGB")
    a = np.asarray(img).astype(np.float32)

    # Background level = median of the 10px border ring.
    b = 10
    border = np.concatenate([
        a[:b].reshape(-1, 3), a[-b:].reshape(-1, 3),
        a[:, :b].reshape(-1, 3), a[:, -b:].reshape(-1, 3),
    ])
    base = np.median(border, axis=0)

    diff = np.clip(a - base, 0, None)              # lift off the black floor
    lum = diff.max(axis=2)                          # brightest channel diff
    # alpha ramp: anything <= floor disappears, glow keeps a soft tail
    floor = 14.0
    alpha = np.clip((lum - floor) * (255.0 / (235.0 - floor)), 0, 255)
    alpha = np.sqrt(alpha / 255.0) * 255.0          # sqrt curve: keep mid glow
    alpha = np.clip(alpha, 0, 255)

    out = np.dstack([a, alpha]).astype(np.uint8)
    im = Image.fromarray(out, "RGBA")

    # Trim to content bbox with margin, then center on square canvas.
    mask = im.getchannel("A")
    bbox = mask.getbbox()
    if bbox:
        pad = 24
        l, t, r, bt = bbox
        l, t = max(0, l - pad), max(0, t - pad)
        r, bt = min(im.width, r + pad), min(im.height, bt + pad)
        im = im.crop((l, t, r, bt))
    side = max(im.width, im.height)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(im, ((side - im.width) // 2, (side - im.height) // 2), im)

    canvas = canvas.resize((size, size), Image.LANCZOS)
    canvas = canvas.filter(ImageFilter.GaussianBlur(0.3))  # soften alpha edges

    webp_path = os.path.join(DST, f"{name}.webp")
    canvas.save(webp_path, "WEBP", quality=88, method=6)
    png_path = os.path.join(DST, f"{name}.png")
    canvas.save(png_path, "PNG", optimize=True)
    return {"name": name, "webp_kb": round(os.path.getsize(webp_path) / 1024, 1),
            "png_kb": round(os.path.getsize(png_path) / 1024, 1)}

results = [cutout(n, s) for n, s in ICONS.items()]
print(f"{'icon':<10} {'webp KB':>8} {'png KB':>8}")
for r in results:
    print(f"{r['name']:<10} {r['webp_kb']:>8} {r['png_kb']:>8}")
