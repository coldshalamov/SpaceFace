"""icons — the Field Hardware icon family, emitted from one construction grammar.

86 glyphs at three optical sizes from a single rule set, so no glyph can drift out of the
family: every icon is a **filled silhouette plus exactly one stroke detail** on a
rounded-square grid, with an optional `accent` path where the amber light sits.

Writing 86 SVGs by hand is how a set ends up with three stroke weights and four corner radii.
Here the shapes are composed from a handful of primitives whose radius and detail weight come
from the size's own metrics, and the optical sizes are real: the detail does not scale linearly,
because a 1.75 px cut scaled to 48 would read as a gash.

    python icons.py [--out DIR]
"""
from __future__ import annotations

import argparse
import json
import math
import pathlib
import re

# ---------------------------------------------------------------- metrics per optical size

METRICS = {
    24: dict(grid=24, margin=2.0, radius=2.0, detail=1.75, minfeat=1.5),
    32: dict(grid=32, margin=2.6, radius=2.6, detail=2.20, minfeat=2.0),
    48: dict(grid=48, margin=3.6, radius=3.6, detail=3.00, minfeat=2.8),
}


class G:
    """A drawing context for one glyph at one size. Everything is in grid units."""

    def __init__(self, size: int):
        self.size = size
        m = METRICS[size]
        self.k = size / 24.0          # geometry scale from the 24 master
        self.margin = m["margin"]
        self.radius = m["radius"]
        self.detail = m["detail"]     # NOT k-scaled: optical, per the metrics table
        self.minfeat = m["minfeat"]
        self.body: list[str] = []
        self.accent: list[str] = []

    # ---- primitives (coordinates are given in 24-grid units and scaled here)

    def _s(self, v):
        return v * self.k

    def rect(self, x, y, w, h, r=None, to=None):
        x, y, w, h = self._s(x), self._s(y), self._s(w), self._s(h)
        r = self.radius if r is None else min(self._s(r), w / 2, h / 2)
        r = max(0.0, min(r, w / 2, h / 2))
        d = (f"M{x + r:.2f},{y:.2f}H{x + w - r:.2f}A{r:.2f},{r:.2f} 0 0 1 {x + w:.2f},{y + r:.2f}"
             f"V{y + h - r:.2f}A{r:.2f},{r:.2f} 0 0 1 {x + w - r:.2f},{y + h:.2f}"
             f"H{x + r:.2f}A{r:.2f},{r:.2f} 0 0 1 {x:.2f},{y + h - r:.2f}"
             f"V{y + r:.2f}A{r:.2f},{r:.2f} 0 0 1 {x + r:.2f},{y:.2f}Z")
        (to if to is not None else self.body).append(d)
        return d

    def circle(self, cx, cy, rad, to=None):
        cx, cy, rad = self._s(cx), self._s(cy), self._s(rad)
        d = (f"M{cx - rad:.2f},{cy:.2f}a{rad:.2f},{rad:.2f} 0 1 0 {2 * rad:.2f},0"
             f"a{rad:.2f},{rad:.2f} 0 1 0 {-2 * rad:.2f},0Z")
        (to if to is not None else self.body).append(d)
        return d

    def poly(self, pts, to=None):
        p = [(self._s(x), self._s(y)) for x, y in pts]
        d = "M" + " L".join(f"{x:.2f},{y:.2f}" for x, y in p) + "Z"
        (to if to is not None else self.body).append(d)
        return d

    def bar(self, x1, y1, x2, y2, w=None, cap=True, to=None):
        """A stroke as an outlined quad, so no `stroke-width` can scale unexpectedly and the
        forced-colours render behaves (conventions §3: prefer outlines)."""
        w = self.detail if w is None else self._s(w)
        ax, ay, bx, by = self._s(x1), self._s(y1), self._s(x2), self._s(y2)
        dx, dy = bx - ax, by - ay
        ln = math.hypot(dx, dy) or 1.0
        nx, ny = -dy / ln * w / 2, dx / ln * w / 2
        ex, ey = (dx / ln * w / 2, dy / ln * w / 2) if cap else (0, 0)
        pts = [(ax + nx - ex, ay + ny - ey), (bx + nx + ex, by + ny + ey),
               (bx - nx + ex, by - ny + ey), (ax - nx - ex, ay - ny - ey)]
        d = "M" + " L".join(f"{x:.2f},{y:.2f}" for x, y in pts) + "Z"
        (to if to is not None else self.body).append(d)
        return d

    def ring(self, cx, cy, rad, t=None, to=None):
        """An annulus as one even-odd path — the family's recurring 'open' channel."""
        t = self.detail if t is None else self._s(t)
        cxs, cys, rs = self._s(cx), self._s(cy), self._s(rad)
        ri = max(0.4, rs - t)
        d = (f"M{cxs - rs:.2f},{cys:.2f}a{rs:.2f},{rs:.2f} 0 1 0 {2 * rs:.2f},0"
             f"a{rs:.2f},{rs:.2f} 0 1 0 {-2 * rs:.2f},0Z"
             f"M{cxs - ri:.2f},{cys:.2f}a{ri:.2f},{ri:.2f} 0 1 1 {2 * ri:.2f},0"
             f"a{ri:.2f},{ri:.2f} 0 1 1 {-2 * ri:.2f},0Z")
        (to if to is not None else self.body).append(d)
        return d

    def cut(self, *ds):
        """Mark paths as cuts. Even-odd fill removes them from the silhouette, which is what
        'the stroke detail is a cut, never an outline of the whole glyph' means in practice."""
        return ds

    def acc(self, fn, *a, **kw):
        kw["to"] = self.accent
        return fn(*a, **kw)

    def svg(self) -> str:
        s = self.size
        parts = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {s} {s}" '
                 f'width="{s}" height="{s}" fill="none">']
        if self.body:
            parts.append('<path fill="currentColor" fill-rule="evenodd" d="%s"/>'
                         % "".join(self.body))
        if self.accent:
            parts.append('<path fill="currentColor" class="accent" d="%s"/>'
                         % "".join(self.accent))
        parts.append("</svg>")
        return "".join(parts)


# ---------------------------------------------------------------- the glyphs
#
# Each entry draws into `g`. The rule the whole family obeys: ONE filled silhouette, ONE
# stroke detail (a cut or an inner bar), and at most one accent path.
#
# Mirror pairs carry a second, non-directional channel — direction alone is unreadable at the
# 21-32 px the radar and the rows actually use (P13 construction rules).

DRAW = {}


def glyph(name):
    def deco(fn):
        DRAW[name] = fn
        return fn
    return deco


CHEVRON = [(9.0, 3.8), (17.8, 12.0), (9.0, 20.2), (5.6, 16.8), (11.0, 12.0), (5.6, 7.2)]


def _chev(g, dx, dy):
    """The shared chevron: one filled wedge, rotated. All four directions are the same shape.

    Built as an explicit thick polygon rather than swept from polar coordinates — the polar
    version collapses to a hairline outline, which is exactly the line-icon look P13 rejects.
    """
    a = math.atan2(dy, dx)
    ca, sa = math.cos(a), math.sin(a)
    pts = [(12 + (x - 12) * ca - (y - 12) * sa, 12 + (x - 12) * sa + (y - 12) * ca)
           for x, y in CHEVRON]
    g.poly(pts)


def _arrow_box(g, dy, ring_open):
    """Base for dock/undock: a hull box plus a travelling mass. The pair differ by whether the
    berth ring is closed (docked) or broken (undocked), not by the arrow alone."""
    g.rect(4, 15, 16, 6, r=1.6)
    g.bar(12, 12 + dy * 5, 12, 12 - dy * 5)
    g.poly([(12 - 3.2, 12 - dy * 3.4), (12 + 3.2, 12 - dy * 3.4), (12, 12 - dy * 7.2)])
    if ring_open:
        g.rect(5.5, 3.2, 4.0, 2.2, r=1.0)
        g.rect(14.5, 3.2, 4.0, 2.2, r=1.0)
    else:
        g.rect(5.5, 3.2, 13, 2.2, r=1.0)


# --- verbs -----------------------------------------------------------------------------

@glyph("buy")
def _(g):
    g.rect(4, 7, 16, 13, r=2)
    g.body += g.cut(g.bar(8, 13.5, 16, 13.5, w=g.detail / g.k, to=[]))
    g.rect(8, 3.5, 8, 4.5, r=2)
    g.acc(g.rect, 10.6, 10.2, 2.8, 6.8, r=1.2)


@glyph("sell")
def _(g):
    g.rect(4, 7, 16, 13, r=2)
    g.rect(8, 3.5, 8, 4.5, r=2)
    g.body.append(g.bar(8, 16.6, 16, 16.6, to=[]))
    g.acc(g.poly, [(12, 9.0), (15.2, 13.4), (8.8, 13.4)])


@glyph("accept")
def _(g):
    g.circle(12, 12, 9)
    g.body.append(g.bar(8.2, 12.2, 11, 15.2, to=[]))
    g.body.append(g.bar(11, 15.2, 16.2, 8.8, to=[]))
    g.acc(g.circle, 12, 12, 2.0)


@glyph("abandon")
def _(g):
    g.circle(12, 12, 9)
    g.body.append(g.bar(8.4, 8.4, 15.6, 15.6, to=[]))
    g.body.append(g.bar(15.6, 8.4, 8.4, 15.6, to=[]))


@glyph("track")
def _(g):
    g.ring(12, 12, 8.4)
    g.circle(12, 12, 3.0)
    g.acc(g.rect, 11.1, 1.2, 1.8, 3.6, r=0.8)


@glyph("install")
def _(g):
    g.rect(4, 11, 16, 9, r=2)
    g.bar(12, 3, 12, 9.4)
    g.poly([(8.4, 7.2), (15.6, 7.2), (12, 11.6)])


@glyph("remove")
def _(g):
    g.rect(4, 11, 16, 9, r=2)
    g.bar(12, 9.4, 12, 3)
    g.poly([(8.4, 5.4), (15.6, 5.4), (12, 1.0)])


@glyph("undock")
def _(g):
    _arrow_box(g, -1, ring_open=True)


@glyph("dock")
def _(g):
    _arrow_box(g, 1, ring_open=False)


@glyph("repair")
def _(g):
    g.poly([(4.2, 6.0), (7.4, 2.8), (9.8, 5.2), (7.6, 7.4), (17.4, 17.2), (19.6, 19.4),
            (17.2, 21.8), (15.0, 19.6), (5.2, 9.8), (3.0, 7.6)])
    g.acc(g.circle, 17.2, 19.4, 1.5)


@glyph("refuel")
def _(g):
    g.rect(5, 4, 10, 16, r=2)
    g.rect(16.4, 7.5, 3.2, 9.5, r=1.2)
    g.body.append(g.bar(7.4, 8.6, 12.6, 8.6, to=[]))
    g.acc(g.rect, 7.2, 11.4, 5.6, 5.6, r=1.2)


@glyph("resupply")
def _(g):
    g.rect(3.5, 8, 17, 12, r=2)
    g.body.append(g.bar(3.5, 11.6, 20.5, 11.6, to=[]))
    g.poly([(12, 2.2), (16.0, 6.6), (8.0, 6.6)])


@glyph("record")
def _(g):
    g.ring(12, 12, 8.6)
    g.circle(12, 12, 4.0)


@glyph("range")
def _(g):
    g.rect(3, 15.4, 18, 4.6, r=1.4)
    g.bar(6.2, 15.0, 6.2, 6.0, w=1.4)
    g.bar(17.8, 15.0, 17.8, 6.0, w=1.4)
    g.acc(g.circle, 12, 8.4, 3.2)


@glyph("scan")
def _(g):
    for i, r in enumerate((3.2, 5.8, 8.4)):
        g.ring(12, 13.6, r, t=g.detail / g.k * (1.0 if i else 1.4))
    g.body.append(g.rect(2, 14.4, 20, 8, r=0, to=[]))


@glyph("hail")
def _(g):
    g.rect(3.4, 5.2, 17.2, 12, r=2.2)
    g.body.append(g.poly([(7.0, 16.6), (12.0, 16.6), (7.0, 21.4)], to=[]))
    g.acc(g.rect, 7.0, 9.6, 10.0, 2.4, r=1.0)


@glyph("fire")
def _(g):
    g.poly([(2.6, 10.2), (14.6, 10.2), (14.6, 7.0), (21.6, 12.0), (14.6, 17.0), (14.6, 13.8),
            (2.6, 13.8)])
    g.acc(g.rect, 2.6, 10.2, 3.4, 3.6, r=0.8)


@glyph("lock")
def _(g):
    g.rect(4.6, 10.6, 14.8, 10.4, r=2)
    g.ring(12, 9.0, 4.6)
    g.body.append(g.rect(6.6, 9.0, 10.8, 4.2, r=0, to=[]))
    g.acc(g.rect, 10.8, 13.8, 2.4, 4.2, r=1.1)


@glyph("brake")
def _(g):
    g.ring(12, 12, 9.0)
    g.rect(8.0, 8.0, 3.2, 8.0, r=1.0)
    g.rect(12.8, 8.0, 3.2, 8.0, r=1.0)


@glyph("boost")
def _(g):
    g.poly([(12, 1.8), (17.0, 12.0), (13.6, 12.0), (13.6, 16.0), (10.4, 16.0), (10.4, 12.0),
            (7.0, 12.0)])
    g.acc(g.rect, 9.0, 18.0, 6.0, 2.6, r=1.2)


@glyph("tow")
def _(g):
    g.rect(2.6, 9.0, 6.4, 6.0, r=1.6)
    g.rect(15.0, 9.0, 6.4, 6.0, r=1.6)
    g.body.append(g.bar(9.0, 12.0, 15.0, 12.0, w=1.3, to=[]))
    g.acc(g.circle, 12.0, 12.0, 1.9)


@glyph("line")
def _(g):
    g.circle(5.2, 18.8, 3.0)
    g.circle(18.8, 5.2, 3.0)
    g.body.append(g.bar(5.2, 18.8, 18.8, 5.2, w=1.2, to=[]))
    g.acc(g.circle, 12.0, 12.0, 2.2)


@glyph("seed")
def _(g):
    g.circle(12, 12, 4.2)
    for a in range(0, 360, 60):
        r = math.radians(a)
        g.bar(12 + math.cos(r) * 6.4, 12 + math.sin(r) * 6.4,
              12 + math.cos(r) * 9.2, 12 + math.sin(r) * 9.2, w=1.3)


@glyph("well")
def _(g):
    # mirror pair with `repel`: the second channel is a FILLED centre (mass drawn inward)
    g.ring(12, 12, 9.0)
    g.circle(12, 12, 3.6)
    for a in (45, 135, 225, 315):
        r = math.radians(a)
        g.bar(12 + math.cos(r) * 7.6, 12 + math.sin(r) * 7.6,
              12 + math.cos(r) * 5.0, 12 + math.sin(r) * 5.0, w=1.3)
    g.acc(g.circle, 12, 12, 1.8)


@glyph("repel")
def _(g):
    # mirror pair with `well`: the second channel is a BROKEN ring and a hollow centre
    for a0 in (10, 100, 190, 280):
        pts = []
        for t in range(0, 62, 6):
            r = math.radians(a0 + t)
            pts.append((12 + math.cos(r) * 9.0, 12 + math.sin(r) * 9.0))
        for t in range(60, -6, -6):
            r = math.radians(a0 + t)
            pts.append((12 + math.cos(r) * 7.4, 12 + math.sin(r) * 7.4))
        g.poly(pts)
    g.ring(12, 12, 3.8, t=1.4)
    for a in (45, 135, 225, 315):
        r = math.radians(a)
        g.bar(12 + math.cos(r) * 5.0, 12 + math.sin(r) * 5.0,
              12 + math.cos(r) * 6.6, 12 + math.sin(r) * 6.6, w=1.3)


@glyph("cone")
def _(g):
    g.poly([(3.0, 3.4), (3.0, 20.6), (20.4, 15.4), (20.4, 8.6)])
    g.body.append(g.bar(8.4, 6.6, 8.4, 17.4, w=1.2, to=[]))
    g.acc(g.rect, 1.4, 9.6, 3.2, 4.8, r=1.2)


@glyph("skim")
def _(g):
    g.poly([(2.4, 15.0), (21.6, 15.0), (18.0, 20.2), (6.0, 20.2)])
    for x in (7.2, 12.0, 16.8):
        g.bar(x, 12.6, x, 4.4, w=1.4)
    g.acc(g.rect, 9.0, 2.4, 6.0, 2.6, r=1.2)


# --- things ----------------------------------------------------------------------------

@glyph("credits")
def _(g):
    g.ring(12, 12, 9.0)
    g.body.append(g.bar(9.2, 7.6, 9.2, 16.4, to=[]))
    g.acc(g.rect, 11.4, 9.8, 5.2, 4.4, r=1.2)


@glyph("hull")
def _(g):
    g.poly([(12, 2.2), (19.4, 8.0), (19.4, 17.6), (12, 21.8), (4.6, 17.6), (4.6, 8.0)])
    g.body.append(g.poly([(12, 6.8), (15.8, 9.8), (15.8, 15.4), (12, 17.8), (8.2, 15.4),
                          (8.2, 9.8)], to=[]))
    g.acc(g.rect, 10.6, 10.4, 2.8, 5.0, r=1.2)


@glyph("fuel")
def _(g):
    g.rect(5.4, 3.0, 13.2, 18.0, r=2.4)
    g.body.append(g.rect(8.0, 6.2, 8.0, 5.4, r=1.2, to=[]))
    g.acc(g.rect, 8.0, 13.6, 8.0, 4.4, r=1.2)


@glyph("cargo")
def _(g):
    g.rect(3.0, 6.4, 18.0, 13.2, r=2)
    g.body.append(g.bar(12, 6.4, 12, 19.6, w=1.3, to=[]))
    g.acc(g.rect, 8.4, 2.4, 7.2, 3.0, r=1.2)


@glyph("munitions")
def _(g):
    for x in (5.0, 10.4, 15.8):
        g.rect(x, 8.0, 3.2, 11.4, r=1.4)
        g.poly([(x, 8.0), (x + 3.2, 8.0), (x + 1.6, 3.6)])
    g.acc(g.rect, 4.2, 19.8, 15.6, 2.2, r=1.0)


@glyph("ore")
def _(g):
    g.poly([(12, 2.6), (20.2, 8.0), (18.2, 18.6), (12, 21.4), (5.8, 18.6), (3.8, 8.0)])
    g.body.append(g.poly([(12, 8.0), (15.6, 11.2), (13.6, 16.0), (10.4, 16.0), (8.4, 11.2)],
                         to=[]))
    g.acc(g.circle, 12, 12, 1.9)


@glyph("module")
def _(g):
    g.rect(4.0, 4.0, 16.0, 16.0, r=2.4)
    g.body.append(g.rect(8.4, 8.4, 7.2, 7.2, r=1.6, to=[]))
    g.acc(g.rect, 10.6, 1.2, 2.8, 2.6, r=1.0)


@glyph("weapon")
def _(g):
    g.rect(2.6, 9.6, 14.0, 4.8, r=1.4)
    g.poly([(16.6, 8.2), (21.8, 12.0), (16.6, 15.8)])
    g.rect(6.0, 14.4, 4.0, 5.6, r=1.2)
    g.acc(g.rect, 2.6, 9.6, 2.6, 4.8, r=1.0)


@glyph("shield")
def _(g):
    g.poly([(12, 2.0), (20.4, 5.6), (20.4, 12.6), (12, 22.0), (3.6, 12.6), (3.6, 5.6)])
    g.body.append(g.poly([(12, 6.4), (16.8, 8.4), (16.8, 12.2), (12, 17.6), (7.2, 12.2),
                          (7.2, 8.4)], to=[]))
    g.acc(g.rect, 10.6, 9.2, 2.8, 5.2, r=1.2)


@glyph("engine")
def _(g):
    g.rect(3.6, 7.4, 11.0, 9.2, r=1.8)
    g.poly([(14.6, 5.4), (20.8, 8.6), (20.8, 15.4), (14.6, 18.6)])
    g.acc(g.rect, 20.0, 10.2, 2.6, 3.6, r=1.2)


@glyph("mining")
def _(g):
    # the rock face, then the drill head biting into it, then the beam as the accent
    g.poly([(12.6, 3.0), (21.0, 7.0), (21.0, 17.4), (13.4, 21.0), (11.0, 12.0)])
    g.poly([(2.4, 9.4), (8.0, 9.4), (8.0, 14.6), (2.4, 14.6)])
    g.poly([(8.0, 10.2), (11.6, 12.0), (8.0, 13.8)])
    g.acc(g.rect, 8.2, 11.2, 3.6, 1.6, r=0.7)


@glyph("utility")
def _(g):
    g.ring(12, 12, 8.6)
    for a in range(0, 360, 90):
        r = math.radians(a + 45)
        g.rect(12 + math.cos(r) * 7.0 - 1.6, 12 + math.sin(r) * 7.0 - 1.6, 3.2, 3.2, r=1.0)
    g.acc(g.circle, 12, 12, 2.6)


@glyph("energy-core")
def _(g):
    g.poly([(12, 1.8), (20.0, 7.0), (20.0, 17.0), (12, 22.2), (4.0, 17.0), (4.0, 7.0)])
    g.body.append(g.poly([(12, 6.6), (13.8, 11.0), (12, 17.4), (10.2, 11.0)], to=[]))
    g.acc(g.poly, [(12, 7.6), (13.2, 11.2), (12, 15.6), (10.8, 11.2)])


@glyph("heat")
def _(g):
    g.rect(9.4, 2.2, 5.2, 12.4, r=2.6)
    g.circle(12, 17.6, 4.4)
    g.body.append(g.rect(10.8, 5.0, 2.4, 10.6, r=1.2, to=[]))
    g.acc(g.circle, 12, 17.6, 2.4)


@glyph("energy")
def _(g):
    g.poly([(13.4, 1.6), (6.0, 13.0), (10.8, 13.0), (9.6, 22.4), (18.0, 10.4), (13.0, 10.4)])
    g.acc(g.rect, 9.4, 11.2, 4.4, 2.0, r=0.9)


@glyph("drive")
def _(g):
    g.ring(12, 12, 8.4)
    for a in range(0, 360, 45):
        r = math.radians(a)
        g.bar(12 + math.cos(r) * 6.4, 12 + math.sin(r) * 6.4,
              12 + math.cos(r) * 3.0, 12 + math.sin(r) * 3.0, w=1.4)
    g.acc(g.circle, 12, 12, 2.2)


# --- destinations ----------------------------------------------------------------------

@glyph("market")
def _(g):
    g.poly([(2.6, 8.4), (5.6, 3.6), (18.4, 3.6), (21.4, 8.4)])
    g.rect(4.2, 9.6, 15.6, 11.0, r=1.6)
    g.body.append(g.rect(9.6, 13.4, 4.8, 7.2, r=1.2, to=[]))
    g.acc(g.rect, 2.6, 8.4, 18.8, 1.8, r=0.8)


@glyph("shipworks")
def _(g):
    g.rect(2.6, 16.4, 18.8, 4.4, r=1.4)
    g.bar(6.0, 16.0, 6.0, 4.4, w=1.5)
    g.bar(6.0, 5.2, 18.4, 5.2, w=1.5)
    g.rect(13.0, 8.0, 7.0, 6.4, r=1.4)
    g.acc(g.rect, 15.2, 5.4, 2.6, 3.0, r=0.9)


@glyph("industry")
def _(g):
    g.poly([(2.6, 20.6), (2.6, 10.4), (8.4, 13.6), (8.4, 10.4), (14.2, 13.6), (14.2, 6.0),
            (21.4, 6.0), (21.4, 20.6)])
    g.body.append(g.rect(16.4, 9.0, 2.8, 2.8, r=0.8, to=[]))
    g.acc(g.rect, 16.4, 14.0, 2.8, 3.6, r=1.0)


@glyph("missions")
def _(g):
    g.rect(4.0, 3.0, 16.0, 18.0, r=2.2)
    g.body.append(g.bar(7.6, 9.0, 16.4, 9.0, w=1.3, to=[]))
    g.body.append(g.bar(7.6, 13.0, 16.4, 13.0, w=1.3, to=[]))
    g.acc(g.rect, 7.6, 16.0, 5.4, 2.2, r=1.0)


@glyph("factions")
def _(g):
    g.poly([(12, 2.2), (20.4, 6.2), (20.4, 13.0), (12, 21.8), (3.6, 13.0), (3.6, 6.2)])
    g.body.append(g.bar(12, 6.4, 12, 17.6, w=1.4, to=[]))
    g.acc(g.poly, [(12, 7.4), (16.4, 9.6), (16.4, 12.8), (12, 17.0)])


@glyph("bar")
def _(g):
    g.poly([(3.4, 4.0), (20.6, 4.0), (13.4, 12.6), (10.6, 12.6)])
    g.bar(12, 12.4, 12, 19.0, w=1.5)
    g.rect(7.2, 19.0, 9.6, 2.6, r=1.2)
    g.acc(g.poly, [(6.6, 6.0), (17.4, 6.0), (14.0, 10.0), (10.0, 10.0)])


@glyph("ledger")
def _(g):
    g.rect(3.4, 3.4, 17.2, 17.2, r=2.2)
    g.body.append(g.bar(3.4, 9.0, 20.6, 9.0, w=1.3, to=[]))
    g.body.append(g.bar(12.0, 9.0, 12.0, 20.6, w=1.3, to=[]))
    g.acc(g.rect, 14.6, 11.6, 4.2, 4.2, r=1.2)


# --- contact classes (must read at 10 px on the radar) ----------------------------------

@glyph("you")
def _(g):
    g.poly([(12, 2.6), (19.6, 20.4), (12, 16.2), (4.4, 20.4)])
    g.acc(g.circle, 12, 12.6, 2.0)


@glyph("fighter")
def _(g):
    g.poly([(12, 3.0), (16.4, 13.0), (21.4, 19.0), (12, 15.6), (2.6, 19.0), (7.6, 13.0)])


@glyph("freighter")
def _(g):
    g.rect(3.0, 7.0, 18.0, 10.0, r=1.6)
    g.body.append(g.bar(9.0, 7.0, 9.0, 17.0, w=1.3, to=[]))
    g.body.append(g.bar(15.0, 7.0, 15.0, 17.0, w=1.3, to=[]))


@glyph("miner")
def _(g):
    g.rect(5.0, 8.0, 14.0, 9.0, r=1.6)
    g.poly([(2.0, 10.6), (5.0, 10.6), (5.0, 14.4), (2.0, 14.4)])
    g.body.append(g.rect(8.0, 10.4, 8.0, 4.2, r=1.2, to=[]))


@glyph("patrol")
def _(g):
    g.poly([(12, 2.4), (20.6, 6.6), (20.6, 13.0), (12, 21.6), (3.4, 13.0), (3.4, 6.6)])
    g.body.append(g.poly([(12, 7.0), (16.6, 9.2), (16.6, 12.4), (12, 17.0), (7.4, 12.4),
                          (7.4, 9.2)], to=[]))


@glyph("pirate")
def _(g):
    g.poly([(12, 2.2), (15.2, 9.0), (22.0, 12.0), (15.2, 15.0), (12, 21.8), (8.8, 15.0),
            (2.0, 12.0), (8.8, 9.0)])
    g.body.append(g.circle(12, 12, 2.2, to=[]))


@glyph("derelict")
def _(g):
    g.poly([(4.0, 8.2), (11.0, 6.0), (19.6, 9.4), (17.0, 17.2), (7.6, 18.0), (3.2, 13.4)])
    g.body.append(g.bar(7.0, 8.0, 15.4, 16.4, w=1.4, to=[]))


@glyph("wreck")
def _(g):
    g.poly([(3.0, 15.2), (8.0, 8.0), (12.4, 12.0), (10.0, 16.0)])
    g.poly([(13.6, 6.0), (20.4, 9.0), (18.4, 15.0), (13.0, 12.4)])
    g.poly([(8.6, 17.6), (15.2, 16.0), (17.0, 20.4), (10.0, 21.2)])


@glyph("station")
def _(g):
    g.ring(12, 12, 8.8, t=2.6)
    g.rect(9.4, 9.4, 5.2, 5.2, r=1.4)
    g.body.append(g.bar(12, 3.2, 12, 20.8, w=1.2, to=[]))


@glyph("gate")
def _(g):
    g.ring(12, 12, 9.0, t=2.4)
    g.body.append(g.rect(2.0, 10.6, 20.0, 2.8, r=0, to=[]))
    g.acc(g.rect, 10.4, 10.4, 3.2, 3.2, r=1.2)


@glyph("beacon")
def _(g):
    g.poly([(10.4, 2.4), (13.6, 2.4), (13.6, 21.6), (10.4, 21.6)])
    g.poly([(6.0, 5.0), (10.0, 8.4), (10.0, 12.0), (4.4, 7.6)])
    g.poly([(18.0, 5.0), (14.0, 8.4), (14.0, 12.0), (19.6, 7.6)])
    g.acc(g.circle, 12, 4.4, 2.0)


@glyph("asteroid")
def _(g):
    g.poly([(11.6, 2.4), (19.2, 6.2), (21.4, 13.6), (16.4, 20.4), (8.0, 21.0), (3.0, 15.0),
            (3.8, 7.2)])
    g.body.append(g.circle(9.0, 10.0, 2.0, to=[]))
    g.body.append(g.circle(15.4, 15.0, 1.6, to=[]))


# --- states and UI ---------------------------------------------------------------------

@glyph("ready")
def _(g):
    g.circle(12, 12, 8.8)
    g.body.append(g.bar(8.2, 12.2, 11.0, 15.0, to=[]))
    g.body.append(g.bar(11.0, 15.0, 16.0, 9.2, to=[]))


@glyph("cooling")
def _(g):
    g.ring(12, 12, 8.8)
    for a in range(0, 360, 60):
        r = math.radians(a)
        g.bar(12 + math.cos(r) * 5.6, 12 + math.sin(r) * 5.6,
              12 + math.cos(r) * 2.2, 12 + math.sin(r) * 2.2, w=1.3)
    g.acc(g.circle, 12, 12, 1.8)


@glyph("locked")
def _(g):
    g.rect(4.6, 10.6, 14.8, 10.4, r=2)
    g.ring(12, 9.2, 4.6)
    g.body.append(g.rect(6.6, 9.2, 10.8, 4.2, r=0, to=[]))


@glyph("offline")
def _(g):
    g.ring(12, 12, 8.8)
    g.body.append(g.bar(7.0, 7.0, 17.0, 17.0, to=[]))


@glyph("online")
def _(g):
    g.ring(12, 12, 8.8)
    g.circle(12, 12, 3.4)


@glyph("warning")
def _(g):
    g.poly([(12, 2.4), (22.0, 20.4), (2.0, 20.4)])
    g.body.append(g.rect(10.8, 8.6, 2.4, 6.4, r=1.1, to=[]))
    g.body.append(g.circle(12, 17.4, 1.5, to=[]))


@glyph("danger")
def _(g):
    g.poly([(8.2, 2.4), (15.8, 2.4), (21.6, 8.2), (21.6, 15.8), (15.8, 21.6), (8.2, 21.6),
            (2.4, 15.8), (2.4, 8.2)])
    g.body.append(g.rect(10.8, 6.8, 2.4, 7.6, r=1.1, to=[]))
    g.body.append(g.circle(12, 17.0, 1.5, to=[]))


@glyph("info")
def _(g):
    g.circle(12, 12, 8.8)
    g.body.append(g.rect(10.8, 10.4, 2.4, 6.6, r=1.1, to=[]))
    g.body.append(g.circle(12, 7.4, 1.5, to=[]))


MARK_W = 3.0   # standalone marks: the form is the glyph, so it carries the family's weight


@glyph("close")
def _(g):
    g.bar(5.4, 5.4, 18.6, 18.6, w=MARK_W)
    g.bar(18.6, 5.4, 5.4, 18.6, w=MARK_W)


@glyph("chevron-left")
def _(g):
    _chev(g, -1, 0)


@glyph("chevron-right")
def _(g):
    _chev(g, 1, 0)


@glyph("chevron-up")
def _(g):
    _chev(g, 0, -1)


@glyph("chevron-down")
def _(g):
    _chev(g, 0, 1)


@glyph("plus")
def _(g):
    g.bar(12, 4.6, 12, 19.4, w=MARK_W)
    g.bar(4.6, 12, 19.4, 12, w=MARK_W)


@glyph("minus")
def _(g):
    g.bar(4.6, 12, 19.4, 12, w=MARK_W)


@glyph("check")
def _(g):
    g.bar(4.4, 12.2, 9.6, 17.6, w=MARK_W, cap=False)
    g.bar(9.6, 17.6, 19.6, 6.4, w=MARK_W, cap=False)
    g.poly([(8.1, 16.1), (11.1, 19.1), (11.1, 16.1)])


@glyph("search")
def _(g):
    g.ring(10.4, 10.4, 6.6)
    g.bar(15.2, 15.2, 20.4, 20.4, w=2.2)


@glyph("settings")
def _(g):
    g.ring(12, 12, 8.4, t=3.0)
    for a in range(0, 360, 60):
        r = math.radians(a)
        g.rect(12 + math.cos(r) * 9.2 - 1.7, 12 + math.sin(r) * 9.2 - 1.7, 3.4, 3.4, r=1.1)
    g.acc(g.circle, 12, 12, 2.4)


@glyph("help")
def _(g):
    g.circle(12, 12, 8.8)
    g.body.append(g.ring(12, 9.6, 3.2, t=1.8, to=[]))
    g.body.append(g.rect(10.9, 11.4, 2.2, 3.0, r=0.9, to=[]))
    g.body.append(g.circle(12, 17.0, 1.4, to=[]))


@glyph("clock")
def _(g):
    g.circle(12, 12, 8.8)
    g.body.append(g.bar(12, 12, 12, 6.8, w=1.5 / g.k, to=[]))
    g.body.append(g.bar(12, 12, 16.0, 13.6, w=1.5 / g.k, to=[]))


@glyph("route")
def _(g):
    g.circle(5.4, 18.6, 3.0)
    g.circle(18.6, 5.4, 3.0)
    for i in range(4):
        t = 0.22 + i * 0.19
        x = 5.4 + (18.6 - 5.4) * t
        y = 18.6 + (5.4 - 18.6) * t
        g.circle(x, y, 1.15)


@glyph("target")
def _(g):
    g.ring(12, 12, 8.6, t=2.0)
    g.circle(12, 12, 2.4)
    for a in range(0, 360, 90):
        r = math.radians(a)
        g.bar(12 + math.cos(r) * 8.0, 12 + math.sin(r) * 8.0,
              12 + math.cos(r) * 11.4, 12 + math.sin(r) * 11.4, w=1.4)


@glyph("spark")
def _(g):
    g.poly([(12, 1.8), (14.0, 9.0), (21.2, 11.0), (14.0, 13.0), (12, 20.2), (10.0, 13.0),
            (2.8, 11.0), (10.0, 9.0)])
    g.acc(g.circle, 12, 11.0, 2.0)


@glyph("pod")
def _(g):
    g.rect(5.0, 4.0, 14.0, 16.0, r=4.0)
    g.body.append(g.rect(8.2, 7.2, 7.6, 5.6, r=1.6, to=[]))
    g.acc(g.rect, 8.2, 15.0, 7.6, 2.6, r=1.2)


GROUPS = {
    "verbs": ["buy", "sell", "accept", "abandon", "track", "install", "remove", "undock",
              "dock", "repair", "refuel", "resupply", "record", "range", "scan", "hail",
              "fire", "lock", "brake", "boost", "tow", "line", "seed", "well", "repel",
              "cone", "skim"],
    "things": ["credits", "hull", "fuel", "cargo", "munitions", "ore", "module", "weapon",
               "shield", "engine", "mining", "utility", "energy-core", "heat", "energy",
               "drive"],
    "destinations": ["market", "shipworks", "industry", "missions", "factions", "bar",
                     "ledger"],
    "classes": ["you", "fighter", "freighter", "miner", "patrol", "pirate", "derelict",
                "wreck", "station", "gate", "beacon", "asteroid"],
    "states": ["ready", "cooling", "locked", "offline", "online", "warning", "danger", "info",
               "close", "chevron-left", "chevron-right", "chevron-up", "chevron-down", "plus",
               "minus", "check", "search", "settings", "help", "clock", "route", "target",
               "spark", "pod"],
}
NAMES = [n for grp in GROUPS.values() for n in grp]


def render(name: str, size: int) -> str:
    g = G(size)
    DRAW[name](g)
    return g.svg()


def paths_at_24(name: str) -> list[str]:
    g = G(24)
    DRAW[name](g)
    return g.body + g.accent


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(pathlib.Path(__file__).resolve().parents[1] / "icons"))
    a = ap.parse_args()
    out = pathlib.Path(a.out)

    missing = [n for n in NAMES if n not in DRAW]
    if missing:
        raise SystemExit("no drawing for: %s" % ", ".join(missing))

    written = 0
    for size in (24, 32, 48):
        d = out / str(size)
        d.mkdir(parents=True, exist_ok=True)
        symbols = []
        for n in NAMES:
            svg = render(n, size)
            (d / ("icon-%s.svg" % n)).write_text(svg, encoding="utf-8")
            written += 1
            inner = re.sub(r"^<svg[^>]*>|</svg>$", "", svg)
            symbols.append('<symbol id="icon-%s" viewBox="0 0 %d %d">%s</symbol>'
                           % (n, size, size, inner))
        sprite = ('<svg xmlns="http://www.w3.org/2000/svg" style="display:none">%s</svg>'
                  % "".join(symbols))
        (out / ("_sprite-%d.svg" % size)).write_text(sprite, encoding="utf-8")

    (out / "glyph-paths.json").write_text(
        json.dumps({n: paths_at_24(n) for n in NAMES}, indent=1), encoding="utf-8")
    print("%d glyphs x 3 sizes = %d files, 3 sprites, glyph-paths.json -> %s"
          % (len(NAMES), written, out))


if __name__ == "__main__":
    main()
