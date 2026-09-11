"""fontkit — real type for the frames.

The frames are composed in Pillow, which needs a static TTF at a fixed axis position.
The kit's fonts ship as variable woff2. This converts woff2 -> ttf once, then instances
the variable axes to the exact positions the art direction names, caching each instance.

Archivo   : wght 100-900, wdth 62-125  (Expanded 800-900 for names/titles, Condensed 500-600
                                        for legends)
Instrument: wght 400-700

Usage:
    from fontkit import face
    f = face('archivo', wght=900, wdth=125, size=200)   # -> PIL.ImageFont
"""
from __future__ import annotations

import os
import pathlib

from fontTools import ttLib
from fontTools.varLib import instancer
from PIL import ImageFont

ROOT = pathlib.Path(__file__).resolve().parents[4]
SRC = {
    "archivo": ROOT / "styles" / "fonts" / "archivo-var-latin-standard-normal.woff2",
    "instrument": ROOT / "styles" / "fonts" / "instrument-sans-var.woff2",
}
CACHE = ROOT / ".devshots" / "delegate-20260910" / "scratch" / "pq-194" / "build" / "fonts"

# The axis positions the art direction (S6 type table) names, by role.
ROLES = {
    # display / stencil: names, titles, hero numbers, arena and mode names
    "display": dict(family="archivo", wght=900, wdth=125),
    "display-800": dict(family="archivo", wght=800, wdth=125),
    # condensed legends: key legends, section names, engraved labels
    "legend": dict(family="archivo", wght=600, wdth=62),
    "legend-500": dict(family="archivo", wght=500, wdth=62),
    # hero numerals: the one number a screen is about
    "hero-num": dict(family="archivo", wght=800, wdth=125),
    # data numerals + body text
    "body": dict(family="instrument", wght=400),
    "emphasis": dict(family="instrument", wght=500),
    "data": dict(family="instrument", wght=500),
}


def _ttf(family: str) -> pathlib.Path:
    """woff2 -> ttf, once."""
    CACHE.mkdir(parents=True, exist_ok=True)
    out = CACHE / f"{family}-var.ttf"
    if out.exists():
        return out
    f = ttLib.TTFont(str(SRC[family]))
    f.flavor = None
    f.save(str(out))
    return out


def instance(family: str, **axes) -> pathlib.Path:
    """Pin the variable axes and cache the static instance."""
    key = "-".join(f"{k}{int(v)}" for k, v in sorted(axes.items()))
    out = CACHE / f"{family}-{key or 'default'}.ttf"
    if out.exists():
        return out
    f = ttLib.TTFont(str(_ttf(family)))
    if axes:
        f = instancer.instantiateVariableFont(f, {k: float(v) for k, v in axes.items()})
    f.save(str(out))
    return out


def face(family: str, size: int, **axes) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(instance(family, **axes)), size)


def role(name: str, size: int, **override) -> ImageFont.FreeTypeFont:
    """A face by art-direction role, e.g. role('display', 200)."""
    spec = dict(ROLES[name])
    spec.update(override)
    family = spec.pop("family")
    return face(family, size, **spec)


def woff2_out(dest: pathlib.Path) -> list[str]:
    """Copy the variable woff2 sources + their licences into the kit."""
    import shutil

    dest.mkdir(parents=True, exist_ok=True)
    written = []
    for name, src in SRC.items():
        shutil.copy2(src, dest / src.name)
        written.append(src.name)
    for lic in ("OFL-Archivo.txt",):
        shutil.copy2(ROOT / "styles" / "fonts" / lic, dest / lic)
        written.append(lic)
    return written


if __name__ == "__main__":
    for r in ROLES:
        p = instance(ROLES[r]["family"], **{k: v for k, v in ROLES[r].items() if k != "family"})
        print(f"{r:12s} -> {p.name} ({os.path.getsize(p) // 1024} KB)")
