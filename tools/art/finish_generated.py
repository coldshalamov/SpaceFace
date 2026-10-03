"""Finishing steps for generated art: turn a chosen Codex variant into the exact file the game loads.

  python tools/art/finish_generated.py medals  --sheet v1/out.png --ids a,b,c,d,e,f [--cols 3 --rows 2]
  python tools/art/finish_generated.py planet  --src v3/out.png --out assets/background/x.png [--cell 640]
  python tools/art/finish_generated.py atlas   --cells a.png b.png c.png d.png --out atlas.png [--cell 640 --fill 0.86]
  python tools/art/finish_generated.py tile    --src v1/out.png --out dir/name [--size 512] [--normal-strength 2.0]

Every step is deterministic, so a chosen variant always finishes to the same pixels.
"""
import argparse, os, sys
import numpy as np
from PIL import Image, ImageFilter


def alpha_bbox(im, thresh=10):
    a = np.asarray(im.getchannel('A'))
    ys, xs = np.where(a > thresh)
    if len(xs) == 0:
        return None
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1


def square_fit(im, size, margin=0.03):
    """Crop to alpha bounds, centre on a transparent square, resize."""
    box = alpha_bbox(im)
    if not box:
        raise SystemExit('empty cell')
    im = im.crop(box)
    side = int(max(im.size) * (1 + 2 * margin))
    canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    canvas.alpha_composite(im, ((side - im.width) // 2, (side - im.height) // 2))
    return canvas.resize((size, size), Image.LANCZOS)


def cmd_medals(a):
    sheet = Image.open(a.sheet).convert('RGBA')
    ids = a.ids.split(',')
    cw, ch = sheet.width // a.cols, sheet.height // a.rows
    os.makedirs(a.out, exist_ok=True)
    k = 0
    for r in range(a.rows):
        for c in range(a.cols):
            if k >= len(ids):
                break
            cell = sheet.crop((c * cw, r * ch, (c + 1) * cw, (r + 1) * ch))
            medal = square_fit(cell, a.size)
            if a.tone:  # gain the opaque pixels' mean colour onto the existing set's (a generated sheet runs creamier)
                arr = np.asarray(medal).astype(np.float32)
                solid = arr[..., 3] > 200
                gain = np.array([float(v) for v in a.tone.split(',')]) / arr[solid][:, :3].mean(0)
                arr[..., :3] = np.clip(arr[..., :3] * gain, 0, 255)
                medal = Image.fromarray(arr.astype(np.uint8))
            name = 'medal-' + ids[k].replace('_', '-') + '.webp'
            medal.save(os.path.join(a.out, name), 'WEBP', quality=90, method=6)
            print(name)
            k += 1


def circle_cleanup(im, fill, cell):
    """A planet is a sphere: refit a clean circular alpha, kill colour fringe, place at `fill` of the cell."""
    box = alpha_bbox(im, 40)
    im = im.crop(box)
    side = max(im.size)
    sq = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    sq.alpha_composite(im, ((side - im.width) // 2, (side - im.height) // 2))
    ss = 4
    yy, xx = np.mgrid[0:side * ss, 0:side * ss]
    r = side * ss / 2.0
    dist = np.hypot(xx - r + 0.5, yy - r + 0.5)
    mask = np.clip((r - 1.5 * ss - dist) / (1.5 * ss) + 0.5, 0, 1)
    mask = Image.fromarray((mask * 255).astype(np.uint8)).resize((side, side), Image.LANCZOS)
    arr = np.asarray(sq).copy()
    arr[..., 3] = np.minimum(arr[..., 3], np.asarray(mask))
    out = Image.fromarray(arr)
    d = int(cell * fill)
    out = out.resize((d, d), Image.LANCZOS)
    canvas = Image.new('RGBA', (cell, cell), (0, 0, 0, 0))
    canvas.alpha_composite(out, ((cell - d) // 2, (cell - d) // 2))
    return canvas


def cmd_atlas(a):
    cells = [circle_cleanup(Image.open(p).convert('RGBA'), a.fill, a.cell) for p in a.cells]
    atlas = Image.new('RGBA', (a.cell * 2, a.cell * 2), (0, 0, 0, 0))
    # same layout as quiet-planets.png: views offset (i%2)*0.5, i<2 ? 0.5 : 0 in texture space (v up),
    # so cells 0,1 are the TOP row and 2,3 the bottom row of the image.
    for i, c in enumerate(cells):
        atlas.alpha_composite(c, ((i % 2) * a.cell, (i // 2) * a.cell))
    atlas.save(a.out, optimize=True)
    print(a.out, atlas.size)


def make_seamless(arr):
    """Offset-and-blend: the rolled copy is seamless at its borders, the original is clean in the middle."""
    h, w = arr.shape[:2]
    rolled = np.roll(np.roll(arr, h // 2, axis=0), w // 2, axis=1)
    y = np.abs(np.linspace(-1, 1, h))[:, None]
    x = np.abs(np.linspace(-1, 1, w))[None, :]
    m = np.clip(1.0 - np.maximum(x, y) ** 3, 0, 1)[..., None]  # 1 in the middle, 0 at the borders
    return arr * m + rolled * (1 - m)


def height_to_normal(height, strength):
    gx = np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)
    gy = np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)
    nx, ny, nz = -gx * strength, gy * strength, np.ones_like(height)
    n = np.sqrt(nx * nx + ny * ny + nz * nz)
    return np.stack([nx / n, ny / n, nz / n], -1) * 0.5 + 0.5


def cmd_tile(a):
    im = Image.open(a.src).convert('RGB')
    if a.crop:  # a generator that returns a vignetted patch instead of a full-bleed tile: keep only the clean centre
        left, top = (im.width - a.crop) // 2, (im.height - a.crop) // 2
        im = im.crop((left, top, left + a.crop, top + a.crop))
    im = im.resize((a.size, a.size), Image.LANCZOS)
    arr = np.asarray(im).astype(np.float32) / 255.0
    arr = make_seamless(arr)
    base = Image.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8))
    base.save(a.out + '_basecolor.jpg', quality=90, optimize=True)
    lum = arr @ np.array([0.299, 0.587, 0.114], dtype=np.float32)
    # high-pass the luminance so broad tone shifts do not tilt the normals, then smooth lightly
    blur = np.asarray(Image.fromarray((lum * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(a.size / 24))).astype(np.float32) / 255.0
    h = lum - blur
    h = np.asarray(Image.fromarray(((h - h.min()) / (np.ptp(h) + 1e-6) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))).astype(np.float32) / 255.0
    nrm = height_to_normal(h, a.normal_strength * 4.0)
    Image.fromarray((nrm * 255).astype(np.uint8)).save(a.out + '_normal.png', optimize=True)
    if a.emissive:
        # Only the luminous mineral should glow, not the whole rock: key it out of the albedo by colour.
        r, g, b = arr[..., 0], arr[..., 1], arr[..., 2]
        score = (np.minimum(r, b) - g) if a.emissive == 'magenta' else (b - g)
        lo, hi = (0.10, 0.34) if a.emissive == 'magenta' else (0.02, 0.10)
        if a.emissive_range:
            lo, hi = (float(v) for v in a.emissive_range.split(','))
        t = np.clip((score - lo) / (hi - lo), 0, 1)
        floor = 0.25 if a.emissive == 'magenta' else 0.10
        mask = t * t * (3 - 2 * t) * np.clip((np.maximum.reduce([r, g, b]) - floor) / 0.30, 0, 1)
        if a.emissive_grow:  # thicken thin veins so they still read at gameplay scale (~6 px per world unit)
            m8 = Image.fromarray((mask * 255).astype(np.uint8))
            for _ in range(a.emissive_grow):
                m8 = m8.filter(ImageFilter.MaxFilter(3))
            mask = np.asarray(m8.filter(ImageFilter.GaussianBlur(1.0))).astype(np.float32) / 255.0
        em = np.clip(arr * mask[..., None] * a.emissive_gain, 0, 1)
        Image.fromarray((em * 255).astype(np.uint8)).save(a.out + '_emissive.jpg', quality=90, optimize=True)
        print(a.out, 'emissive coverage %.1f%%' % (100 * float((mask > 0.2).mean())))
    # a seam check the reviewer can read: edge-to-edge difference vs typical neighbour difference
    e = np.abs(arr[:, 0] - arr[:, -1]).mean() + np.abs(arr[0] - arr[-1]).mean()
    n = np.abs(arr[:, 1] - arr[:, 0]).mean() + np.abs(arr[1] - arr[0]).mean()
    print(a.out, 'seam/neighbour ratio %.2f' % (e / max(n, 1e-6)))


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest='cmd', required=True)
    m = sub.add_parser('medals'); m.add_argument('--sheet', required=True); m.add_argument('--ids', required=True)
    m.add_argument('--out', default='assets/ui/generated/achievements'); m.add_argument('--cols', type=int, default=3)
    m.add_argument('--rows', type=int, default=2); m.add_argument('--size', type=int, default=256)
    m.add_argument('--tone', default='', help='target mean R,G,B of the opaque pixels, e.g. 252,249,242'); m.set_defaults(fn=cmd_medals)
    p = sub.add_parser('atlas'); p.add_argument('--cells', nargs='+', required=True); p.add_argument('--out', required=True)
    p.add_argument('--cell', type=int, default=627); p.add_argument('--fill', type=float, default=0.86); p.set_defaults(fn=cmd_atlas)
    t = sub.add_parser('tile'); t.add_argument('--src', required=True); t.add_argument('--out', required=True)
    t.add_argument('--size', type=int, default=512); t.add_argument('--normal-strength', type=float, default=2.0)
    t.add_argument('--crop', type=int, default=0, help='centre-crop this many source pixels before resizing')
    t.add_argument('--emissive', choices=['magenta', 'violet'], default=None, help='also key a glow map out of the albedo')
    t.add_argument('--emissive-gain', type=float, default=1.6)
    t.add_argument('--emissive-range', default='', help='lo,hi colour-score ramp for the glow key')
    t.add_argument('--emissive-grow', type=int, default=0, help='dilate the glow key this many 3x3 steps'); t.set_defaults(fn=cmd_tile)
    a = ap.parse_args(); a.fn(a)
