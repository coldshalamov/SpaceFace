"""marks — the SPACEFACE logotype, the fourteen faction crests, mode/arena marks, insignia.

The logotype follows P14's own method: explore in raster, choose, **vectorise to outlined
paths**. Archivo Expanded 900's outlines are the armature; the bridges that make it a stencil
are cut in raster (a real stencil bridges the counters, it does not slice every stem), and the
result is traced back to polygons with OpenCV. What ships is paths — never a `<text>` element
with a font-family, which is the fake P14 names.

The crests keep each faction's existing subject from `src/ui/station/icons.js` and are redrawn
to one construction: three plate silhouettes, one interior emblem, one accent slot.

    python marks.py [--out DIR]
"""
from __future__ import annotations

import argparse
import math
import pathlib
import re

import cv2
import numpy as np
from PIL import Image, ImageDraw

import fontkit

VB = 240  # marks are drawn on a 240 grid (conventions §3)


# ---------------------------------------------------------------- raster -> paths


def trace(mask: np.ndarray, scale: float, epsilon: float = 0.9,
          min_area: float = 12.0) -> list[str]:
    """Vectorise a binary mask to SVG subpaths, outer contours and their holes.

    RETR_CCOMP gives a two-level hierarchy — outer boundaries and the holes inside them — which
    is exactly what an even-odd fill needs, so counters stay open instead of filling in.
    """
    contours, hierarchy = cv2.findContours(mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
    out = []
    for c in contours:
        if cv2.contourArea(c) < min_area:
            continue
        approx = cv2.approxPolyDP(c, epsilon, True)
        pts = [(p[0][0] / scale, p[0][1] / scale) for p in approx]
        if len(pts) < 3:
            continue
        out.append("M" + " L".join("%.2f,%.2f" % p for p in pts) + "Z")
    return out


def wordmark_mask(text: str, cap_px: int, tracking: float, bridge: float,
                  weight: int = 900, width: int = 125) -> Image.Image:
    """The wordmark as a raster stencil: set the face, then bridge the closed counters."""
    font = fontkit.face("archivo", cap_px, wght=weight, wdth=width)
    pad = cap_px // 3
    advances = [font.getlength(ch) for ch in text]
    total = sum(advances) + tracking * cap_px * (len(text) - 1)
    asc, desc = font.getmetrics()
    img = Image.new("L", (int(total) + pad * 2, asc + desc + pad * 2), 0)
    d = ImageDraw.Draw(img)
    x = float(pad)
    for ch, adv in zip(text, advances):
        d.text((x, pad), ch, font=font, fill=255)
        x += adv + tracking * cap_px
    img = img.crop(img.getbbox())

    a = np.asarray(img).copy()
    binary = (a > 127).astype(np.uint8)
    # find the counters: holes inside the letterforms
    contours, hierarchy = cv2.findContours(binary, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
    if hierarchy is None:
        return Image.fromarray((binary * 255).astype(np.uint8), "L")
    bar = max(2, int(cap_px * bridge))
    cut = Image.fromarray((binary * 255).astype(np.uint8), "L")
    dd = ImageDraw.Draw(cut)
    for c, h in zip(contours, hierarchy[0]):
        if h[3] < 0:            # an outer boundary, not a counter
            continue
        if cv2.contourArea(c) < (cap_px * 0.05) ** 2:
            continue
        x0, y0, w, h0 = cv2.boundingRect(c)
        # break the ink above and below the counter: the island is held by the plate there,
        # which is what a stencil bridge looks like once it is printed
        cx = x0 + w // 2
        dd.rectangle([cx - bar // 2, y0 - cap_px, cx + bar // 2, y0 + 2], fill=0)
        dd.rectangle([cx - bar // 2, y0 + h0 - 2, cx + bar // 2, y0 + h0 + cap_px], fill=0)
    return cut


def logotype_paths(text="SPACEFACE", cap_px=512, tracking=0.02, bridge=0.045,
                   weight=900, width=125) -> tuple[list[str], tuple[float, float]]:
    mask = wordmark_mask(text, cap_px, tracking, bridge, weight, width)
    a = (np.asarray(mask) > 127).astype(np.uint8)
    h, w = a.shape
    scale = h / 60.0                      # normalise to a 60-unit cap height
    return trace(a, scale, epsilon=1.1), (w / scale, h / scale)


# ---------------------------------------------------------------- mark drawing grammar


class M:
    """A 240-grid drawing context for marks. Same primitives as the icon family, wider."""

    def __init__(self):
        self.body: list[str] = []
        self.accent: list[str] = []

    def path(self, d, to=None):
        (to if to is not None else self.body).append(d)
        return d

    def poly(self, pts, to=None):
        return self.path("M" + " L".join("%.2f,%.2f" % p for p in pts) + "Z", to)

    def rect(self, x, y, w, h, r=8, to=None):
        r = max(0.0, min(r, w / 2, h / 2))
        return self.path(
            f"M{x + r:.2f},{y:.2f}H{x + w - r:.2f}A{r:.2f},{r:.2f} 0 0 1 {x + w:.2f},{y + r:.2f}"
            f"V{y + h - r:.2f}A{r:.2f},{r:.2f} 0 0 1 {x + w - r:.2f},{y + h:.2f}"
            f"H{x + r:.2f}A{r:.2f},{r:.2f} 0 0 1 {x:.2f},{y + h - r:.2f}"
            f"V{y + r:.2f}A{r:.2f},{r:.2f} 0 0 1 {x + r:.2f},{y:.2f}Z", to)

    def circle(self, cx, cy, rad, to=None):
        return self.path(
            f"M{cx - rad:.2f},{cy:.2f}a{rad:.2f},{rad:.2f} 0 1 0 {2 * rad:.2f},0"
            f"a{rad:.2f},{rad:.2f} 0 1 0 {-2 * rad:.2f},0Z", to)

    def ring(self, cx, cy, rad, t, to=None):
        ri = max(1.0, rad - t)
        return self.path(
            f"M{cx - rad:.2f},{cy:.2f}a{rad:.2f},{rad:.2f} 0 1 0 {2 * rad:.2f},0"
            f"a{rad:.2f},{rad:.2f} 0 1 0 {-2 * rad:.2f},0Z"
            f"M{cx - ri:.2f},{cy:.2f}a{ri:.2f},{ri:.2f} 0 1 1 {2 * ri:.2f},0"
            f"a{ri:.2f},{ri:.2f} 0 1 1 {-2 * ri:.2f},0Z", to)

    def bar(self, x1, y1, x2, y2, w=14, to=None):
        dx, dy = x2 - x1, y2 - y1
        ln = math.hypot(dx, dy) or 1.0
        nx, ny = -dy / ln * w / 2, dx / ln * w / 2
        return self.poly([(x1 + nx, y1 + ny), (x2 + nx, y2 + ny),
                          (x2 - nx, y2 - ny), (x1 - nx, y1 - ny)], to)

    def acc(self, fn, *a, **kw):
        kw["to"] = self.accent
        return fn(*a, **kw)

    def svg(self, vb=VB) -> str:
        parts = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {vb} {vb}" '
                 f'width="{vb}" height="{vb}" fill="none">']
        if self.body:
            parts.append('<path fill="currentColor" fill-rule="evenodd" d="%s"/>'
                         % "".join(self.body))
        if self.accent:
            parts.append('<path fill="currentColor" class="accent" d="%s"/>'
                         % "".join(self.accent))
        return "".join(parts) + "</svg>"


# ---- the three crest plate silhouettes (one construction, three shapes) -----------------

def plate_shield(m: M):
    m.poly([(120, 16), (212, 54), (212, 132), (120, 226), (28, 132), (28, 54)])


def plate_hex(m: M):
    m.poly([(120, 14), (208, 63), (208, 177), (120, 226), (32, 177), (32, 63)])


def plate_disc(m: M):
    """A disc with a flat top and one machined cut — the same signature angle as the plates."""
    m.poly([(60, 22), (180, 22), (206, 48), (214, 116), (120, 226), (26, 116), (34, 48)])


_COORD = re.compile(r"(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)")


def _scale_path(d: str, k: float, cx=120.0, cy=124.0) -> str:
    """Scale a path about the crest centre, coordinate pair by coordinate pair."""
    def repl(mo):
        x, y = float(mo.group(1)), float(mo.group(2))
        return "%.2f,%.2f" % (cx + (x - cx) * k, cy + (y - cy) * k)
    return _COORD.sub(repl, d)


def crest_field(m: M, shape):
    """A SOLID plate with one machined groove near its edge, and the emblem cut into it.

    Even-odd alternates, so plate + one inset copy leaves a hollow outline — which is what
    turns a crest into a wireframe. Three nested copies (solid, cut, fill) give a solid plate
    carrying a thin groove, and the emblem then reads as cut metal, like the logotype.
    """
    shape(m)
    inner = M()
    shape(inner)
    base = inner.body[0]
    m.body.append(_scale_path(base, 0.88))
    m.body.append(_scale_path(base, 0.82))


CRESTS = {
    # key: (plate silhouette, emblem fn, the subject kept from src/ui/station/icons.js)
    "scn": (plate_shield, "concord star over a doubled rank chevron"),
    "mts": (plate_hex, "eight-tooth industrial cog bored by the trade meridian"),
    "dmc": (plate_disc, "cut crystal prism, faulted on one vertical and one horizontal seam"),
    "reach": (plate_shield, "salvage cross under a recovery arc"),
    "quiet": (plate_disc, "concentric resonance rings, silent at the core"),
    "vael": (plate_shield, "faceted stealth dart, radar-deflecting creases"),
    "free": (plate_disc, "a ring broken open, and the line that broke it"),
    "choir": (plate_hex, "radiant burst fanning from one held note"),
    "helix": (plate_hex, "two crossing strands, three rungs"),
    "understory": (plate_shield, "root system reaching up out of the dark"),
    "fulfillment": (plate_hex, "sealed hexagonal shipment, check struck through it"),
    "archive": (plate_disc, "a closed record, three sealed lines"),
    "pitborn": (plate_shield, "jagged forge-flame off a broken rim"),
    "verge_layers": (plate_hex, "stacked strata, each thinner than the one below"),
}


def emblem(key: str, m: M):
    """The interior emblem. Each keeps its faction's existing subject, redrawn filled."""
    if key == "scn":
        pts = []
        for i in range(10):
            a = math.radians(-90 + i * 36)
            r = 40 if i % 2 == 0 else 17
            pts.append((120 + math.cos(a) * r, 100 + math.sin(a) * r))
        m.poly(pts)
        m.poly([(120, 138), (176, 172), (176, 190), (120, 156), (64, 190), (64, 172)])
        m.acc(m.poly, [(120, 160), (160, 184), (160, 194), (120, 172), (80, 194), (80, 184)])
    elif key == "mts":
        m.ring(120, 124, 52, 20)
        for i in range(8):
            a = math.radians(i * 45)
            m.rect(120 + math.cos(a) * 58 - 11, 124 + math.sin(a) * 58 - 11, 22, 22, r=5)
        m.bar(120, 58, 120, 190, w=12)
        m.acc(m.circle, 120, 124, 16)
    elif key == "dmc":
        m.poly([(120, 62), (172, 104), (152, 186), (88, 186), (68, 104)])
        m.body.append(M().poly([(120, 88), (150, 112), (136, 166), (104, 166), (90, 112)],
                               to=[])[0] if False else
                      "M120.00,88.00 L150.00,112.00 L136.00,166.00 L104.00,166.00 L90.00,112.00Z")
        m.body.append("M118.00,62.00 L122.00,62.00 L122.00,186.00 L118.00,186.00Z")
        m.acc(m.bar, 68, 124, 172, 124, 9)
    elif key == "reach":
        m.bar(120, 96, 120, 192, w=24)
        m.bar(74, 138, 166, 138, w=24)
        m.ring(120, 96, 54, 16)
        m.body.append("M60.00,96.00 L180.00,96.00 L180.00,160.00 L60.00,160.00Z")
        m.acc(m.circle, 120, 138, 13)
    elif key == "quiet":
        for r, t in ((66, 13), (46, 11), (28, 9)):
            m.ring(120, 124, r, t)
        m.acc(m.circle, 120, 124, 11)
    elif key == "vael":
        m.poly([(120, 56), (174, 154), (146, 196), (120, 176), (94, 196), (66, 154)])
        m.body.append("M120.00,86.00 L152.00,148.00 L120.00,132.00 L88.00,148.00Z")
        m.acc(m.poly, [(120, 96), (142, 140), (120, 128), (98, 140)])
    elif key == "free":
        m.ring(120, 124, 60, 19)
        m.body.append("M132.00,52.00 L200.00,52.00 L200.00,104.00 L132.00,104.00Z")
        m.bar(72, 178, 176, 68, w=17)
        m.acc(m.circle, 176, 68, 13)
    elif key == "choir":
        m.circle(120, 186, 19)
        for i in range(7):
            a = math.radians(-90 + (i - 3) * 22)
            m.bar(120, 172, 120 + math.cos(a) * 116, 172 + math.sin(a) * 116,
                  w=13 if i % 2 == 0 else 9)
        m.acc(m.circle, 120, 186, 10)
    elif key == "helix":
        for s in (1, -1):
            pts = []
            for i in range(15):
                t = i / 14.0
                y = 62 + t * 124
                x = 120 + s * math.sin(t * math.pi * 1.6) * 44
                pts.append((x, y))
            for i in range(14, -1, -1):
                t = i / 14.0
                y = 62 + t * 124
                x = 120 + s * math.sin(t * math.pi * 1.6) * 44
                pts.append((x + 11, y))
            m.poly(pts)
        for y in (90, 124, 158):
            m.bar(84, y, 156, y, w=11)
        m.acc(m.bar, 84, 124, 156, 124, 11)
    elif key == "understory":
        m.bar(120, 56, 120, 130, w=17)
        for s in (1, -1):
            m.poly([(120, 126), (120 + s * 58, 194), (120 + s * 42, 198), (120, 142)])
            m.poly([(120, 96), (120 + s * 46, 148), (120 + s * 32, 154), (120, 116)])
        m.acc(m.circle, 120, 62, 14)
    elif key == "fulfillment":
        m.poly([(120, 58), (180, 92), (180, 160), (120, 194), (60, 160), (60, 92)])
        m.body.append("M120.00,82.00 L160.00,104.00 L160.00,148.00 L120.00,170.00 "
                      "L80.00,148.00 L80.00,104.00Z")
        m.bar(92, 128, 112, 150, w=14)
        m.bar(112, 150, 154, 98, w=14)
        m.acc(m.bar, 112, 150, 154, 98, 14)
    elif key == "archive":
        m.rect(62, 58, 116, 132, r=8)
        m.body.append("M86.00,58.00 L92.00,58.00 L92.00,190.00 L86.00,190.00Z")
        for y in (96, 124, 152):
            m.bar(106, y, 160, y, w=11)
        m.acc(m.bar, 106, 152, 134, 152, 11)
    elif key == "pitborn":
        m.poly([(58, 190), (78, 56), (110, 122), (142, 46), (182, 118), (164, 190)])
        m.body.append("M90.00,178.00 L120.00,120.00 L142.00,150.00 L160.00,130.00 "
                      "L152.00,178.00Z")
        m.acc(m.poly, [(112, 136), (132, 108), (146, 140), (128, 162)])
    elif key == "verge_layers":
        for i, (y, t) in enumerate(((186, 22), (150, 17), (116, 13), (86, 9))):
            span = 78 - i * 13
            pts = []
            for j in range(13):
                u = j / 12.0
                pts.append((120 - span + 2 * span * u, y - math.sin(u * math.pi) * 30))
            for j in range(12, -1, -1):
                u = j / 12.0
                pts.append((120 - span + 2 * span * u, y - math.sin(u * math.pi) * 30 + t))
            m.poly(pts)
        m.acc(m.bar, 62, 186, 178, 186, 12)


def crest(key: str) -> str:
    m = M()
    shape, _subject = CRESTS[key]
    crest_field(m, shape)
    emblem(key, m)
    return m.svg()


# ---- mode, arena, insignia and system marks --------------------------------------------

def _emblem_plate(m: M):
    """Modes and arenas are emblems: a circle-plate with an interior symbol, never
    illustrations, and never the icon family with a circle drawn round it."""
    m.ring(120, 120, 104, 13)
    m.ring(120, 120, 86, 5)


MODES = {
    "swarm": "many small masses converging on one",
    "gauntlet": "a narrowing run between two walls",
    "daily": "one filled segment of a ring",
    "weekly": "seven segments, one struck",
    "ghost": "an outline of the swarm mark, open at the base",
}
ARENAS = {
    "ricochet-foundry": "hard banks and a bounced line",
    "lagrange-crucible": "two wells and the point between them",
    "cinder-sluice": "a channel with falling mass",
    "cryo-drift": "a shattered lattice",
    "storm-lattice": "a charged grid",
}


def mode_mark(key: str) -> str:
    m = M()
    _emblem_plate(m)
    if key == "swarm":
        m.circle(120, 120, 22)
        for i in range(8):
            a = math.radians(i * 45 + 12)
            m.circle(120 + math.cos(a) * 56, 120 + math.sin(a) * 56, 10)
        m.acc(m.circle, 120, 120, 12)
    elif key == "gauntlet":
        m.poly([(46, 48), (86, 48), (110, 120), (86, 192), (46, 192), (74, 120)])
        m.poly([(194, 48), (154, 48), (130, 120), (154, 192), (194, 192), (166, 120)])
        m.acc(m.circle, 120, 120, 13)
    elif key == "daily":
        pts = [(120, 120)]
        for i in range(19):
            a = math.radians(-90 + i * 5)
            pts.append((120 + math.cos(a) * 72, 120 + math.sin(a) * 72))
        m.poly(pts)
        m.acc(m.bar, 120, 48, 120, 78, 13)
    elif key == "weekly":
        for i in range(7):
            a = math.radians(-90 + i * 51.4)
            x, y = 120 + math.cos(a) * 58, 120 + math.sin(a) * 58
            if i == 3:
                m.ring(x, y, 17, 6)
            else:
                m.circle(x, y, 13)
        m.acc(m.circle, 120 + math.cos(math.radians(64.2)) * 58,
              120 + math.sin(math.radians(64.2)) * 58, 11)
    elif key == "ghost":
        m.ring(120, 120, 24, 8)
        for i in range(8):
            a = math.radians(i * 45 + 12)
            if 100 < (i * 45 + 12) < 260:
                continue
            m.ring(120 + math.cos(a) * 56, 120 + math.sin(a) * 56, 11, 5)
    return m.svg()


def arena_mark(key: str) -> str:
    m = M()
    _emblem_plate(m)
    if key == "ricochet-foundry":
        m.poly([(44, 56), (70, 56), (70, 184), (44, 184)])
        m.poly([(170, 56), (196, 56), (196, 184), (170, 184)])
        m.bar(70, 78, 170, 128, w=12)
        m.bar(170, 128, 70, 176, w=12)
        m.acc(m.circle, 170, 128, 14)
    elif key == "lagrange-crucible":
        m.ring(76, 120, 34, 12)
        m.ring(164, 120, 34, 12)
        m.acc(m.circle, 120, 120, 15)
    elif key == "cinder-sluice":
        m.poly([(62, 48), (94, 48), (126, 192), (94, 192)])
        m.poly([(146, 48), (178, 48), (146, 192), (114, 192)])
        for cy in (86, 128, 170):
            m.circle(120, cy, 9)
        m.acc(m.circle, 120, 170, 9)
    elif key == "cryo-drift":
        for i in range(6):
            a = math.radians(i * 60)
            m.bar(120, 120, 120 + math.cos(a) * 74, 120 + math.sin(a) * 74, w=11)
        m.poly([(120, 120), (172, 90), (166, 132)])
        m.acc(m.circle, 120, 120, 14)
    elif key == "storm-lattice":
        for v in (76, 120, 164):
            m.bar(v, 52, v, 188, w=9)
            m.bar(52, v, 188, v, w=9)
        m.acc(m.poly, [(128, 60), (100, 124), (122, 124), (106, 184), (146, 112), (122, 112)])
    return m.svg()


def insignia(step: int) -> str:
    """Four difficulty steps in one system: a bar-stack that gains a chevron per step."""
    m = M()
    for i in range(4):
        y = 186 - i * 38
        filled = i < step
        if filled:
            m.poly([(120, y - 30), (188, y), (120, y + 14), (52, y)])
        else:
            m.poly([(120, y - 30), (188, y), (120, y + 14), (52, y)])
            m.poly([(120, y - 16), (166, y), (120, y + 2), (74, y)])
    m.acc(m.poly, [(120, 186 - (step - 1) * 38 - 30), (188, 186 - (step - 1) * 38),
                   (120, 186 - (step - 1) * 38 + 14), (52, 186 - (step - 1) * 38)])
    return m.svg()


SYSTEM = ["crucible", "map", "codex", "save", "load", "photo", "ship", "footprint", "range"]


def system_mark(key: str) -> str:
    m = M()
    if key == "crucible":
        m.poly([(56, 46), (184, 46), (160, 130), (160, 194), (80, 194), (80, 130)])
        m.body.append("M86.00,70.00 L154.00,70.00 L140.00,126.00 L100.00,126.00Z")
        m.acc(m.bar, 80, 168, 160, 168, 18)
    elif key == "map":
        m.poly([(34, 66), (94, 44), (146, 68), (206, 46), (206, 176), (146, 198),
                (94, 174), (34, 196)])
        m.body.append("M94.00,44.00 L100.00,44.00 L100.00,174.00 L94.00,174.00Z")
        m.body.append("M146.00,68.00 L152.00,68.00 L152.00,198.00 L146.00,198.00Z")
        m.acc(m.circle, 146, 118, 16)
    elif key == "codex":
        m.rect(48, 44, 144, 152, r=10)
        m.body.append("M78.00,44.00 L88.00,44.00 L88.00,196.00 L78.00,196.00Z")
        for y in (88, 120, 152):
            m.bar(106, y, 168, y, w=12)
        m.acc(m.bar, 106, 152, 140, 152, 12)
    elif key == "save":
        m.rect(44, 44, 152, 152, r=10)
        m.body.append("M84.00,44.00 L156.00,44.00 L156.00,96.00 L84.00,96.00Z")
        m.body.append("M76.00,124.00 L164.00,124.00 L164.00,196.00 L76.00,196.00Z")
        m.acc(m.rect, 128, 52, 20, 36, r=4)
    elif key == "load":
        m.rect(44, 76, 152, 120, r=10)
        m.bar(120, 30, 120, 106, w=20)
        m.poly([(84, 84), (156, 84), (120, 132)])
        m.acc(m.poly, [(94, 90), (146, 90), (120, 124)])
    elif key == "photo":
        m.rect(36, 68, 168, 124, r=12)
        m.poly([(88, 46), (152, 46), (162, 70), (78, 70)])
        m.ring(120, 130, 40, 15)
        m.acc(m.circle, 120, 130, 18)
    elif key == "ship":
        m.poly([(30, 120), (92, 92), (196, 104), (196, 136), (92, 148)])
        m.poly([(96, 60), (128, 96), (96, 96)])
        m.poly([(96, 180), (128, 144), (96, 144)])
        m.acc(m.circle, 46, 120, 15)
    elif key == "footprint":
        m.circle(58, 72, 20)
        m.circle(182, 72, 20)
        m.circle(120, 178, 20)
        m.bar(58, 72, 120, 178, w=11)
        m.bar(182, 72, 120, 178, w=11)
        m.bar(58, 72, 182, 72, w=11)
        m.acc(m.circle, 120, 178, 15)
    elif key == "range":
        m.rect(30, 158, 180, 38, r=8)
        m.bar(62, 154, 62, 58, w=13)
        m.bar(178, 154, 178, 58, w=13)
        m.ring(120, 92, 40, 14)
        m.acc(m.circle, 120, 92, 15)
    return m.svg()


# ---------------------------------------------------------------- output


def explorations(out: pathlib.Path):
    """The raster explorations P14 asks to document, with the chosen one annotated."""
    variants = [
        ("A  Expanded 900 · tracking .02 · bridge .045   ← CHOSEN", 900, 125, 0.02, 0.045),
        ("B  Expanded 900 · tracking .06 · bridge .045", 900, 125, 0.06, 0.045),
        ("C  Expanded 800 · tracking .02 · bridge .030", 800, 125, 0.02, 0.030),
        ("D  Semi-expanded 900 · tracking .02 · no bridge", 900, 108, 0.02, 0.0),
    ]
    label = fontkit.role("legend", 18)
    rows = []
    for text, wght, wdth, trk, br in variants:
        mask = wordmark_mask("SPACEFACE", 120, trk, br, wght, wdth)
        rows.append((text, mask))
    W = max(m.width for _t, m in rows) + 80
    H = sum(m.height + 58 for _t, m in rows) + 40
    sheet = Image.new("RGB", (W, H), (0x0C, 0x0A, 0x08))
    d = ImageDraw.Draw(sheet)
    y = 24
    for text, mask in rows:
        d.text((40, y), text, font=label, fill=(0x8A, 0x82, 0x78))
        y += 30
        tint = Image.new("RGB", mask.size, (0xEA, 0xE6, 0xDF))
        sheet.paste(tint, (40, y), mask)
        y += mask.height + 28
    out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(pathlib.Path(__file__).resolve().parents[1] / "marks"))
    a = ap.parse_args()
    out = pathlib.Path(a.out)
    sym = []

    # ---- logotype
    d = out / "logotype"
    d.mkdir(parents=True, exist_ok=True)
    paths, (w, h) = logotype_paths()
    body = '<path fill="currentColor" fill-rule="evenodd" d="%s"/>' % "".join(paths)
    (d / "spaceface-logotype.svg").write_text(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %.1f %.1f" fill="none">%s</svg>'
        % (w, h, body), encoding="utf-8")
    sym.append('<symbol id="mark-logotype" viewBox="0 0 %.1f %.1f">%s</symbol>' % (w, h, body))

    top, (tw, th) = logotype_paths("SPACE", cap_px=512)
    bot, (bw, bh) = logotype_paths("FACE", cap_px=512)
    shift = "".join(bot)
    stacked = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %.1f %.1f" fill="none">'
               '<path fill="currentColor" fill-rule="evenodd" d="%s"/>'
               '<g transform="translate(%.1f,%.1f)"><path fill="currentColor" '
               'fill-rule="evenodd" d="%s"/></g></svg>'
               % (max(tw, bw), th + bh + 6, "".join(top), (tw - bw) / 2, th + 6, shift))
    (d / "spaceface-logotype-stacked.svg").write_text(stacked, encoding="utf-8")

    mono, (mw, mh) = logotype_paths("SF", cap_px=512, tracking=0.0)
    k = 200.0 / max(mw, mh)
    (d / "spaceface-monogram.svg").write_text(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" width="240" '
        'height="240" fill="none"><g transform="translate(%.1f,%.1f) scale(%.4f)">'
        '<path fill="currentColor" fill-rule="evenodd" d="%s"/></g></svg>'
        % (120 - mw * k / 2, 120 - mh * k / 2, k, "".join(mono)), encoding="utf-8")
    explorations(d / "_explorations.png")

    # ---- crests, modes, arenas, insignia, system
    groups = [("crests", {k: crest(k) for k in CRESTS}, "crest"),
              ("modes", {k: mode_mark(k) for k in MODES}, "mark"),
              ("arenas", {k: arena_mark(k) for k in ARENAS}, "mark"),
              ("insignia", {"difficulty-%d" % i: insignia(i) for i in (1, 2, 3, 4)}, "insignia"),
              ("system", {k: system_mark(k) for k in SYSTEM}, "mark")]
    n = 0
    for folder, items, prefix in groups:
        dd = out / folder
        dd.mkdir(parents=True, exist_ok=True)
        for key, svg in items.items():
            (dd / ("%s-%s.svg" % (prefix, key))).write_text(svg, encoding="utf-8")
            inner = svg[svg.index(">") + 1:-len("</svg>")]
            sym.append('<symbol id="%s-%s" viewBox="0 0 240 240">%s</symbol>'
                       % (prefix, key, inner))
            n += 1

    (out / "_sprite.svg").write_text(
        '<svg xmlns="http://www.w3.org/2000/svg" style="display:none">%s</svg>' % "".join(sym),
        encoding="utf-8")
    print("logotype (3 lockups + explorations) and %d marks -> %s" % (n, out))


if __name__ == "__main__":
    main()
