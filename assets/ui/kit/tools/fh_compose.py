"""fh_compose — the frame compositor.

A style frame is composed here, in an explicit art-direction script, rather than by the same
CSS that builds the prototype. That keeps the frame an **independent target**: the prototype
has to reproduce it from the same assets, and `screens/_compare.html` shows the delta. A frame
drawn by the prototype's own stylesheet would always match itself and prove nothing.

Everything it places is real: the world plate is a Cycles render of the game's own GLBs, the
hardware is a Cycles render of modelled geometry, and the type is the actual OFL variable font
instanced to the axis the art direction names.
"""
from __future__ import annotations

import os
import pathlib

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter

import fontkit

REPO = pathlib.Path(__file__).resolve().parents[4]
KIT = REPO / "assets" / "ui" / "kit"
ASSETS = KIT / "assets"
BUILD = REPO / ".devshots" / "delegate-20260910" / "scratch" / "pq-194" / "build"

W, H = 1920, 1080

HEX = {
    "ground": "#0C0A08", "plate": "#1A1714", "plate-raised": "#26211B",
    "plate-sunk": "#100E0C", "edge-light": "#F2B950", "bone": "#EAE6DF",
    "legend": "#FFB347", "signal": "#F2B950", "hazard": "#FF6A2B", "wanted": "#FF4D3D",
    "cold": "#DDE6FF", "good": "#9BD8A0", "bad": "#FF7A6B", "glass": "#05070A",
}


def rgba(colour, alpha=1.0):
    if isinstance(colour, str):
        s = colour.lstrip("#")
        c = tuple(int(s[i:i + 2], 16) for i in (0, 2, 4))
    else:
        c = tuple(colour[:3])
    return c + (int(round(255 * alpha)),)


# ---------------------------------------------------------------- type


def text_mask(text, font, tracking=0.0) -> Image.Image:
    """Render text to an 8-bit mask, applying letter tracking the art direction specifies.

    Pillow has no tracking, so glyphs are stepped manually. Measuring each glyph's own advance
    (rather than assuming a fixed cell) is what keeps an Expanded 900 wordmark from crawling.
    """
    pad = max(8, font.size // 4)
    widths = [font.getlength(ch) for ch in text]
    total = sum(widths) + tracking * font.size * max(0, len(text) - 1)
    asc, desc = font.getmetrics()
    img = Image.new("L", (int(total) + pad * 2, asc + desc + pad * 2), 0)
    d = ImageDraw.Draw(img)
    x = float(pad)
    for ch, adv in zip(text, widths):
        d.text((x, pad), ch, font=font, fill=255)
        x += adv + tracking * font.size
    return img.crop(img.getbbox() or (0, 0, 1, 1))


def stencilise(mask: Image.Image, bridges=3, width_frac=0.055, seed=4242) -> Image.Image:
    """Cut bridges across the mask so the marking reads as a **stencil** (bridged counters).

    §6 wants the display face "applied as painted marking"; P14 is explicit that the logotype
    is a stencil and not a font set in a text element. Until P14's drawn logotype exists, a
    frame may approximate it as long as the intended face is named in kit-notes (conventions
    §4), and a bridged mask is that approximation.
    """
    if bridges <= 0:
        return mask
    w, h = mask.size
    out = mask.copy()
    d = ImageDraw.Draw(out)
    rng = np.random.default_rng(seed)
    bar = max(2, int(h * width_frac))
    for i in range(bridges):
        y = int(h * (0.24 + 0.26 * i) + rng.integers(-2, 3))
        d.rectangle([0, y, w, y + bar], fill=0)
    return out


def weather(mask: Image.Image, roughness=0.55, ink=0.18, seed=4242) -> Image.Image:
    """Slightly rough edge, slightly uneven ink (§4, stencil marking).

    A pristine vector wordmark laid over a weathered, lit world is exactly what "words pasted
    on the picture" looks like, so the marking is broken up at the edge and varied in density.
    """
    a = np.asarray(mask).astype(np.float32) / 255.0
    rng = np.random.default_rng(seed)
    h, w = a.shape

    # Edge roughness at a MEDIUM frequency: per-pixel noise reads as dirt or JPEG, and a
    # very low frequency reads as mould. A rough paint edge varies over a few millimetres.
    edge = np.asarray(mask.filter(ImageFilter.FIND_EDGES)).astype(np.float32) / 255.0
    small = rng.random((max(2, h // 9), max(2, w // 9))).astype(np.float32)
    noise = np.asarray(Image.fromarray((small * 255).astype(np.uint8)).resize(
        (w, h), Image.BICUBIC)).astype(np.float32) / 255.0
    a = np.clip(a - edge * (noise - 0.42) * roughness, 0.0, 1.0)

    # uneven ink: a low-frequency density variation across the whole marking
    coarse = rng.random((max(2, h // 3), max(2, w // 24))).astype(np.float32)
    dens = np.asarray(Image.fromarray((coarse * 255).astype(np.uint8)).resize(
        (w, h), Image.BICUBIC)).astype(np.float32) / 255.0
    a = np.clip(a * (1.0 - ink * (dens - 0.5) * 2.0), 0.0, 1.0)
    return Image.fromarray((a * 255).astype(np.uint8), "L")


def paint_mask(base: Image.Image, mask: Image.Image, xy, colour, alpha=1.0,
               glow=None, glow_radius=14, glow_alpha=0.30):
    """Lay a coloured mask onto the frame, optionally with a real backlight halo under it."""
    x, y = int(xy[0]), int(xy[1])
    if glow:
        halo = mask.filter(ImageFilter.GaussianBlur(glow_radius))
        layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
        tint = Image.new("RGBA", mask.size, rgba(glow, glow_alpha))
        layer.paste(tint, (x, y), halo)
        base.alpha_composite(layer)
    layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    tint = Image.new("RGBA", mask.size, rgba(colour, alpha))
    layer.paste(tint, (x, y), mask)
    base.alpha_composite(layer)
    return base


def tint_to_scene(mask_colour, scene_colour, amount=0.22):
    """Pull a marking's colour a little toward the light in the shot.

    Paint on a hull at dusk is not the same white as paint in a hangar; a marking that ignores
    the scene's light is the giveaway that it was composited.
    """
    a = np.array([int(mask_colour.lstrip("#")[i:i + 2], 16) for i in (0, 2, 4)], float)
    b = np.array([int(scene_colour.lstrip("#")[i:i + 2], 16) for i in (0, 2, 4)], float)
    c = a * (1 - amount) + b * amount
    return "#" + "".join("%02X" % int(round(v)) for v in c)


# ---------------------------------------------------------------- assets


_cache: dict[str, Image.Image] = {}


def asset(ident: str, at2x=False) -> Image.Image:
    """Load a produced kit asset by its dotted id."""
    key = ident + ("@2x" if at2x else "")
    if key in _cache:
        return _cache[key]
    for folder in ASSETS.iterdir() if ASSETS.exists() else []:
        p = folder / (ident + ("@2x" if at2x else "") + ".png")
        if p.exists():
            _cache[key] = Image.open(p).convert("RGBA")
            return _cache[key]
    raise FileNotFoundError("kit asset %r not found under %s" % (ident, ASSETS))


def nine(ident: str, w: int, h: int, slice_=None) -> Image.Image:
    """Stretch a produced nine-slice plate to an arbitrary size, exactly as CSS border-image
    would, so a frame and its prototype agree on what the plate looks like at that size."""
    import json
    im = asset(ident)
    if slice_ is None:
        man = json.loads((KIT / "kit-manifest.json").read_text(encoding="utf-8"))
        entry = next((a for a in man["assets"] if a["id"] == ident), None)
        s = (entry or {}).get("slice") or {"top": 16, "right": 16, "bottom": 16, "left": 16}
        slice_ = (s["top"], s["right"], s["bottom"], s["left"])
    import nine_slice_test
    return nine_slice_test.nine_slice(im, slice_, w, h)


def place(base: Image.Image, im: Image.Image, xy, anchor="nw"):
    x, y = xy
    w, h = im.size
    if "e" in anchor:
        x -= w
    if "s" in anchor:
        y -= h
    if anchor in ("n", "s", "c"):
        x -= w // 2
    if anchor in ("w", "e", "c"):
        y -= h // 2
    base.alpha_composite(im, (int(x), int(y)))
    return base


# ---------------------------------------------------------------- plate handling


def plate(name: str, allow_upscale: bool = False) -> Image.Image:
    """The rendered world shot a frame sits on.

    Refuses to upscale by default. A draft plate rendered at 1100 wide, silently LANCZOSed to
    1920 under a crisply-composed native interface layer, is invisible in a thumbnail and
    fatal in the 100 % picture comparison the whole programme turns on — so it has to be an
    error rather than a judgement call.
    """
    for cand in (BUILD / "plates" / ("plate-%s.png" % name),
                 BUILD / "plates" / ("draft-%s.png" % name)):
        if not cand.exists():
            continue
        im = Image.open(cand).convert("RGBA")
        if im.size == (W, H):
            return im
        if im.width < W and not allow_upscale:
            raise ValueError(
                "world plate %s is %dx%d — upscaling it to %dx%d would put a draft-resolution "
                "world under a native-resolution interface. Re-render it at %d wide (drop the "
                "`width=` override from bl_scenes.py), or pass allow_upscale=True and say so "
                "in NOTES.md." % (cand.name, im.width, im.height, W, H, W))
        return im.resize((W, H), Image.LANCZOS)
    raise FileNotFoundError("no world plate for %r" % name)


def stars(im: Image.Image, count=260, seed=4242, band=(0.0, 0.46), colour="#DDE6FF"):
    """Script the starfield into the plate.

    §5 carves out distant background stars as the one allowed camera-facing soft point, while
    tiny, bright and at sky depth. They are drawn here rather than rendered because the
    denoiser eats 1 px emissive geometry at any sample count a five-plate batch can afford.
    """
    rng = np.random.default_rng(seed)
    layer = Image.new("RGBA", im.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    y0, y1 = int(im.height * band[0]), int(im.height * band[1])
    for _ in range(count):
        x = int(rng.integers(0, im.width))
        y = int(rng.integers(y0, y1))
        # brighter near the top of the band, where the sky is darkest
        depth = 1.0 - (y - y0) / max(1, y1 - y0)
        a = float(rng.random()) ** 2.2 * depth
        r = 0.6 + float(rng.random()) * 1.1
        d.ellipse([x - r, y - r, x + r, y + r], fill=rgba(colour, min(0.92, a * 1.1)))
    layer = layer.filter(ImageFilter.GaussianBlur(0.4))
    return Image.alpha_composite(im, layer)


def vignette(im: Image.Image, amount=0.26, softness=0.62):
    """A lens vignette, so the frame reads as a photograph of a set rather than a flat render."""
    w, h = im.size
    yy, xx = np.mgrid[0:h, 0:w]
    cx, cy = w / 2.0, h / 2.0
    r = np.sqrt(((xx - cx) / cx) ** 2 + ((yy - cy) / cy) ** 2) / 1.414
    v = np.clip(1.0 - amount * np.clip((r - softness) / (1 - softness), 0, 1) ** 1.6, 0, 1)
    a = np.asarray(im).astype(np.float32)
    a[..., :3] *= v[..., None]
    return Image.fromarray(a.astype(np.uint8), "RGBA")


def save(im: Image.Image, path: pathlib.Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    im.convert("RGB").save(path) if path.suffix == ".jpg" else im.save(path)
    print("  %s  %dx%d" % (path, *im.size))
    return path


def mark_png(svg_rel: str, width: int, colour="#EAE6DF", accent="#FFB347") -> Image.Image:
    """Rasterise a produced mark (logotype, crest, arena) for compositing into a frame.

    The frame uses the SAME vector the kit ships. Setting the wordmark in a font here instead
    would give the build a target it can never match, because the build will use the mark.
    Cached on disk: a Chromium launch per call would dominate the compose time.
    """
    import subprocess
    src = KIT / "marks" / svg_rel
    out = BUILD / "marks-png" / ("%s-%d-%s.png" % (pathlib.Path(svg_rel).stem, width,
                                                   colour.lstrip("#")))
    if not out.exists():
        out.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(["node", str(KIT / "tools" / "svg_png.mjs"), str(src), str(out),
                        str(width), colour, accent], check=True,
                       cwd=str(REPO), capture_output=True)
    return Image.open(out).convert("RGBA")


def save_layer(im: Image.Image, path: pathlib.Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path)
    print("  %s  %dx%d (transparent)" % (path, *im.size))
    return path
