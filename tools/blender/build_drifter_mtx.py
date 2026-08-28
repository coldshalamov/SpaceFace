"""PQ-050.02 Drifter MTX builder. Hitch untouched. --mtx-cycle N writes cycle stills.

Cycle 28 is the accepted Cycle 27 geometry plus one causal refractory-map
correction from rear review. It is not a redesign.

Cycle 26 KEEP identity is frozen: long industrial hull, deep cargo/well read,
nacelle/aft mass, orange accent hierarchy, play-scale silhouette. Three close
and rear defects had construction causes, not lighting:

* ceramic collars and throat liners shared a cartesian plate generator and a
  post-join smart-UV, so hoop islands went polar and read as tan wood;
* the transom face-delete ran on the forward hull after the UV-budget split,
  so the capped loft stayed shut and a rectangular box was tacked onto it,
  while high aft ``box`` morph plus linear ring densify left lower hull and
  nacelle curvature as raw facets;
* hull/nacelle plate UVs were one smart-projection over the shoulder, and the
  cargo well was a dark box tub with no overhang or second depth step.

Cycle 27 repairs those causes: axial hoop UVs and a heat-stressed ceramic
generator; rounded aft stations, ring softening, a formed recessed transom
cut on the aft shell; shell-projected deck/flank UVs, AO on the aft paint,
and a lipped well with a grating over a dark floor.

Usage::

  blender --background --python tools/blender/build_drifter_mtx.py -- --mtx-cycle 27
  blender --background --python tools/blender/build_drifter_mtx.py -- --form-only

``--form-only`` skips the bake and the LOD ladder and renders clay +
play_chase from a scratch export, for fast form iteration. It never writes the
shipped GLBs.
"""
from __future__ import annotations

import hashlib
import json
import math
import shutil
import sys
from pathlib import Path

import bpy
import bmesh
import numpy as np
from mathutils import Vector

TOOLS = Path(__file__).resolve().parent
ROOT = TOOLS.parents[1]
if str(TOOLS) not in sys.path:
    sys.path.insert(0, str(TOOLS))
from fleet_construction import (  # noqa: E402
    add_folded_sheet,
    add_rcs_cluster,
    add_sensor_dish,
    add_tapered_vane,
    apply_modifiers,
    densify_ring,
    station_ring,
)
from spaceface_chase_camera import (  # noqa: E402
    DISTANCE_CLOSE,
    DISTANCE_DEFAULT,
    apply_chase_camera,
    render_chase_still,
    render_cycle_chase_stills,
)

FAMILY = ROOT / "assets" / "ships" / "fleet_player_bodies_v1" / "drifter"
TEX_DIR = FAMILY / "source" / "textures"

# MTX-17. Map size is not chosen by fashion: it is the smallest power of two
# whose *measured* density clears the floor for that LOD, so a 3 m^2 warning
# strip and a 90 m^2 hull end up at the same physical texel scale.
TEXEL_FLOOR_PX_PER_M = {0: 256.0, 1: 120.0, 2: 60.0}
TEXEL_MIN_SIZE = {0: 512, 1: 256, 2: 128}
TEXEL_MAX_SIZE = {0: 4096, 1: 2048, 2: 512}
# ORM and normal ride at half the albedo edge; the albedo carries the
# measured hero density that MTX-17 is written about.
SUPPORT_MAP_DIVISOR = 2
PAINT_VARIANT = {"Material_Hull": 0, "Material_Hull_Aft": 1, "Material_Nacelle": 2}

# Where the LOD ladder actually comes from. LOD1 and LOD2 are built lighter,
# not decimated copies of LOD0.
RING_DENSITY = {0: 2, 1: 2, 2: 1}
HULL_SUBDIV = {0: 1, 1: 0, 2: 0}
STATION_EXTRA = {0: 1, 1: 0, 2: 0}
BEVEL_SEGMENTS = {0: 2, 1: 1, 2: 1}

# PQ-050 anti-regression floor: hullTriangles may not fall from the prior cycle.
PRIOR_HULL_TRIANGLES = 49710

DECK_Z = 1.00
NAC_Y_AFT = 1.855

CYCLE = 1
FORM_ONLY = False
for _i, _tok in enumerate(sys.argv):
    if _tok.startswith("--mtx-cycle="):
        CYCLE = int(_tok.split("=", 1)[1])
    elif _tok == "--mtx-cycle" and _i + 1 < len(sys.argv):
        CYCLE = int(sys.argv[_i + 1])
    elif _tok == "--form-only":
        FORM_ONLY = True


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def reset_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for bucket in (
        bpy.data.meshes, bpy.data.curves, bpy.data.materials,
        bpy.data.cameras, bpy.data.lights, bpy.data.images,
    ):
        for item in list(bucket):
            bucket.remove(item)
    for collection in list(bpy.data.collections):
        bpy.data.collections.remove(collection)


# --------------------------------------------------------------------------
# Station tables and the profile queries that keep hardware on the skin
# --------------------------------------------------------------------------

# x, yc, hw, hh, zc, flat, box, keel. hh is tuned so the crown holds a flat
# working deck at z = 1.00 from the bow shoulder aft to the machinery.
HULL_STATIONS = (
    (7.95, 0.0, 0.44, 0.56, 0.10, 0.30, 0.30, 0.80),
    (7.40, 0.0, 0.86, 0.80, 0.13, 0.42, 0.34, 0.68),
    (6.50, 0.0, 1.26, 0.95, 0.16, 0.56, 0.42, 0.54),
    (5.40, 0.0, 1.56, 0.97, 0.18, 0.72, 0.50, 0.42),
    (3.90, 0.0, 1.80, 1.00, 0.18, 0.82, 0.58, 0.34),
    (2.30, 0.0, 1.96, 1.04, 0.16, 0.88, 0.66, 0.26),
    (0.60, 0.0, 2.04, 1.07, 0.14, 0.90, 0.72, 0.22),
    (-1.10, 0.0, 1.96, 1.09, 0.12, 0.88, 0.76, 0.20),
    (-2.80, 0.0, 1.76, 1.06, 0.12, 0.76, 0.82, 0.16),
    (-4.60, 0.0, 1.52, 1.02, 0.14, 0.58, 0.86, 0.13),
    (-6.40, 0.0, 1.30, 1.00, 0.16, 0.42, 0.88, 0.12),
    (-7.85, 0.0, 1.15, 0.95, 0.16, 0.32, 0.90, 0.12),
)

# The first three stations sit inside the hull: the root is a swept fairing
# growing out of the flank, not a crate parked beside it.
NACELLE_STATIONS = (
    (-0.70, 0.74, 0.28, 0.48, 0.26, 0.34, 0.60, 0.36),
    (-1.90, 1.06, 0.40, 0.62, 0.26, 0.28, 0.68, 0.30),
    (-3.10, 1.42, 0.54, 0.76, 0.27, 0.20, 0.78, 0.22),
    (-4.40, 1.70, 0.68, 0.86, 0.28, 0.13, 0.86, 0.15),
    (-5.80, 1.84, 0.76, 0.90, 0.28, 0.08, 0.88, 0.12),
    (-7.20, 1.86, 0.76, 0.90, 0.28, 0.06, 0.90, 0.10),
    (-8.05, 1.84, 0.64, 0.76, 0.28, 0.06, 0.90, 0.10),
)

# Overhanging cowl above each intake. Thin section, real forward overhang.
BILL_STATIONS = (
    (-3.05, 1.44, 0.54, 0.30, 0.84, 0.58, 0.80, 0.32),
    (-3.75, 1.62, 0.66, 0.35, 0.88, 0.52, 0.84, 0.26),
    (-4.55, 1.82, 0.78, 0.37, 0.92, 0.46, 0.87, 0.22),
    (-5.15, 1.86, 0.80, 0.35, 0.94, 0.42, 0.90, 0.20),
)


def densify_stations(specs, extra):
    """Interpolate intermediate stations. More stations means a finer cut edge
    and a smoother sheer without subdividing the whole shell."""
    if extra <= 0:
        return tuple(specs)
    out = []
    for a, b in zip(specs, specs[1:]):
        out.append(tuple(a))
        for k in range(1, extra + 1):
            t = k / float(extra + 1)
            out.append(tuple(av + (bv - av) * t for av, bv in zip(a, b)))
    out.append(tuple(specs[-1]))
    return tuple(out)


def _halfwidth_at(spec, z):
    """Half-width of one station's skin at height z."""
    x, _yc, hw, hh, zc, flat, box, keel = spec
    ring = station_ring(x, 0.0, zc, hw, hh, flat=flat, box=box, keel=keel)
    pts = [(p[1], p[2]) for p in ring[:7]]
    best = 0.0
    for (y0, z0), (y1, z1) in zip(pts, pts[1:]):
        lo, hi = (z1, z0) if z0 > z1 else (z0, z1)
        if lo - 1e-6 <= z <= hi + 1e-6:
            t = 0.0 if abs(z1 - z0) < 1e-9 else (z - z0) / (z1 - z0)
            best = max(best, y0 + (y1 - y0) * t)
    return best


def profile_at(specs, x, z):
    """(ring centre y, half-width) of a lofted volume at (x, z)."""
    if x >= specs[0][0]:
        return specs[0][1], _halfwidth_at(specs[0], z)
    if x <= specs[-1][0]:
        return specs[-1][1], _halfwidth_at(specs[-1], z)
    for a, b in zip(specs, specs[1:]):
        if b[0] <= x <= a[0]:
            t = (a[0] - x) / (a[0] - b[0])
            return (
                a[1] * (1 - t) + b[1] * t,
                _halfwidth_at(a, z) * (1 - t) + _halfwidth_at(b, z) * t,
            )
    return 0.0, 0.0


def _crown_of(spec):
    return spec[4] + spec[3] * (1.0 - 0.22 * spec[5])


def _keel_of(spec):
    return spec[4] - spec[3]


def _interp(specs, x, fn):
    if x >= specs[0][0]:
        return fn(specs[0])
    if x <= specs[-1][0]:
        return fn(specs[-1])
    for a, b in zip(specs, specs[1:]):
        if b[0] <= x <= a[0]:
            t = (a[0] - x) / (a[0] - b[0])
            return fn(a) * (1 - t) + fn(b) * t
    return 0.0


def hull_flank(x, z, inset=0.02):
    """Starboard y of the hull skin at (x, z), pulled in so a part bites."""
    _yc, hw = profile_at(HULL_STATIONS, x, z)
    return max(0.0, hw - inset)


def nacelle_flank(x, z, inset=0.02):
    yc, hw = profile_at(NACELLE_STATIONS, x, z)
    return yc + max(0.0, hw - inset)


def hull_crown(x):
    return _interp(HULL_STATIONS, x, _crown_of)


def hull_keel(x):
    return _interp(HULL_STATIONS, x, _keel_of)


# --------------------------------------------------------------------------
# Surface generators. Vectorised: a 4096 map is 16.8 M texels and a per-pixel
# Python loop cannot reach MTX-17 at any price.
# --------------------------------------------------------------------------

# Plate / machining periods in METRES, converted to pixels with the measured
# texel density so every material shares one physical surface scale.
PLATE_PERIOD_M = {
    "hull": (1.15, 0.78),
    "armor": (0.58, 0.40),
    "mechanical": (0.26, 0.17),
    # Refractory is mottled across a hoop, never tiled into plate seams. The
    # old cartesian grid became radial faux wood after smart projection.
    "ceramic": (0.0, 0.0),
    "radiator": (0.22, 0.11),
    "accent": (0.58, 0.40),
    "warning": (0.58, 0.40),
    "glass": (0.0, 0.0),
    "thruster": (0.0, 0.0),
}


def _hash01(x, y, salt):
    u64 = np.uint64
    v = (x.astype(u64) * u64(374761393) + y.astype(u64) * u64(668265263)
         + u64((salt * 362437) & 0xFFFFFFFF)) & u64(0xFFFFFFFF)
    v = ((v ^ (v >> u64(13))) * u64(1274126177)) & u64(0xFFFFFFFF)
    return ((v ^ (v >> u64(16))) & u64(255)).astype(np.float32) / np.float32(255.0)


def _quantise(arr, levels):
    """Drop texel entropy no supported camera can resolve. Keeps the source
    GLB from tripling in bytes when the map size goes up."""
    return np.round(np.clip(arr, 0.0, 1.0) * levels) / levels


def _stencil_mask(size):
    """Broken spray stencil. Opacity on the paint, no thickness (MTX-42)."""
    mask = np.zeros((size, size), np.float32)
    u0, v0 = int(size * 0.06), int(size * 0.19)
    w, h = max(10, int(size * 0.11)), max(8, int(size * 0.058))
    bars = (
        (0.04, 0.18, 0.08, 0.94), (0.18, 0.34, 0.08, 0.24),
        (0.18, 0.34, 0.78, 0.94), (0.30, 0.40, 0.20, 0.82),
        (0.52, 0.64, 0.08, 0.94), (0.64, 0.84, 0.08, 0.24),
        (0.64, 0.78, 0.44, 0.60),
    )
    for cu0, cu1, cv0, cv1 in bars:
        mask[v0 + int(h * cv0):v0 + int(h * cv1), u0 + int(w * cu0):u0 + int(w * cu1)] = 0.85
    return mask


def role_surface(role, rgb, size, px_per_m, variant=0):
    """(albedo, orm, normal) as flat float32 RGBA arrays.

    Each role has its own generator. Deliberately not one recipe with a MixRGB
    tint: paint carries plate seams and edge wear, machined alloy carries
    directional tooling, refractory carries dry grain, glass carries neither.
    """
    idx = np.arange(size, dtype=np.int64)
    ys, xs = np.meshgrid(idx, idx, indexing="ij")
    br, bg, bb = (np.float32(c) for c in rgb)

    pw_m, ph_m = PLATE_PERIOD_M.get(role, (0.58, 0.40))
    pw = max(8, int(round(pw_m * px_per_m))) if pw_m > 0 else 0
    ph = max(8, int(round(ph_m * px_per_m))) if ph_m > 0 else 0

    zero = np.zeros((size, size), np.float32)
    if pw:
        mx = xs % pw
        my = ys % ph
        dx = np.minimum(mx, pw - mx).astype(np.float32)
        dy = np.minimum(my, ph - my).astype(np.float32)
        near = np.minimum(dx, dy)
        seam_px = max(1.0, px_per_m * 0.014)
        soft_px = max(3.0, px_per_m * 0.075)
        seam = np.clip(1.0 - near / seam_px, 0.0, 1.0)
        soft = np.clip(1.0 - near / soft_px, 0.0, 1.0)
        plate = _hash01(xs // pw, ys // ph, 71 + variant * 17)
    else:
        seam = zero
        soft = zero
        plate = np.full((size, size), 0.5, np.float32)

    fine = max(2, int(px_per_m * 0.010))
    grain = _hash01(xs // fine, ys // fine, 11)
    speck = _hash01(xs // max(3, int(px_per_m * 0.020)), ys // max(3, int(px_per_m * 0.020)), 29)
    blot = max(1, int(px_per_m * 0.09))
    blotch = _hash01(xs // blot, ys // blot, 47)
    strk = max(2, int(px_per_m * 0.035))
    streak = _hash01(np.zeros_like(xs), ys // strk, 53)
    crs = max(3, int(px_per_m * 0.040))
    coarse = _hash01(xs // crs, ys // crs, 67)
    # Orange peel for the coated roles: real coat texture, one step above the
    # plate seams and well above texel noise (MTX-34).
    peel_px = max(3, int(px_per_m * 0.032))
    peel = _hash01(xs // peel_px, ys // peel_px, 97)

    cavity = np.clip(seam * 0.85 + soft * 0.35, 0.0, 1.0)
    dirt = np.clip(cavity * 0.45 + blotch * 0.22 + speck * 0.08, 0.0, 1.0)
    edge = np.clip((seam > 0.45).astype(np.float32) * (0.55 + 0.45 * grain), 0.0, 1.0)
    height = -seam * 0.65 - soft * 0.05 + (plate - 0.5) * 0.06

    if role == "hull":
        tone = 1.0 + (plate - 0.5) * 0.13
        r = br * tone * (1.0 - dirt * 0.24) + blotch * 0.012
        g = bg * tone * (1.0 - dirt * 0.20) + blotch * 0.012
        b = bb * tone * (1.0 - dirt * 0.16) + blotch * 0.010
        wear = edge * 0.55
        r = r * (1 - wear) + 0.30 * wear
        g = g * (1 - wear) + 0.31 * wear
        b = b * (1 - wear) + 0.32 * wear
        stencil = (_stencil_mask(size) if variant == 0 else zero) * (1.0 - (grain > 0.84) * 0.6)
        r = r * (1 - stencil) + 0.05 * stencil
        g = g * (1 - stencil) + 0.34 * stencil
        b = b * (1 - stencil) + 0.40 * stencil
        rough = 0.36 + dirt * 0.24 - edge * 0.10 + (peel - 0.5) * 0.05
        metal = edge * 0.62
        height = height + (peel - 0.5) * 0.045
    elif role == "armor":
        tone = 1.0 + (plate - 0.5) * 0.20
        r = br * tone * (1.0 - dirt * 0.30)
        g = bg * tone * (1.0 - dirt * 0.26)
        b = bb * tone * (1.0 - dirt * 0.22)
        wear = edge * 0.70
        r = r * (1 - wear) + 0.26 * wear
        g = g * (1 - wear) + 0.27 * wear
        b = b * (1 - wear) + 0.28 * wear
        rough = 0.32 + dirt * 0.24 - edge * 0.08
        metal = 0.45 + edge * 0.50
        height = height - soft * 0.10
    elif role == "mechanical":
        tool = 0.5 + 0.5 * np.sin((xs.astype(np.float32) / max(3.0, px_per_m * 0.030)) + streak * 4.0)
        tone = 0.92 + tool * 0.16
        r = np.clip(br * tone - dirt * 0.10, 0.0, 1.0)
        g = np.clip(bg * tone - dirt * 0.10, 0.0, 1.0)
        b = np.clip(bb * tone * 0.99 - dirt * 0.09, 0.0, 1.0)
        rough = 0.18 + tool * 0.14 + dirt * 0.20
        metal = np.full((size, size), 0.96, np.float32) - seam * 0.10
        height = height + (tool - 0.5) * 0.03
    elif role == "ceramic":
        # Isotropic fired refractory. Keep this deliberately fine and nearly
        # flat: even low-amplitude coarse variation becomes directional wood
        # grain when a narrow annular island is packed by smart projection.
        heat = np.clip((speck - 0.91) * 8.0, 0.0, 1.0)
        tone = 0.995 + (grain - 0.5) * 0.012
        r = np.clip(br * tone - heat * 0.025, 0.0, 1.0)
        g = np.clip(bg * tone - heat * 0.032, 0.0, 1.0)
        b = np.clip(bb * tone - heat * 0.036, 0.0, 1.0)
        rough = 0.66 + grain * 0.018 + heat * 0.018
        metal = zero
        height = (grain - 0.5) * 0.006 + heat * 0.004
    elif role == "radiator":
        pitch = max(3, int(px_per_m * 0.055))
        fin = (ys % pitch < max(1, int(px_per_m * 0.022))).astype(np.float32)
        r = np.clip(br * (0.7 + fin * 0.5) - dirt * 0.08, 0.0, 1.0)
        g = np.clip(bg * (0.7 + fin * 0.5) - dirt * 0.08, 0.0, 1.0)
        b = np.clip(bb * (0.7 + fin * 0.5) - dirt * 0.07, 0.0, 1.0)
        rough = 0.52 + (1.0 - fin) * 0.20
        metal = 0.25 + fin * 0.35
        height = height + (fin - 0.5) * 0.55
    elif role == "accent":
        tone = 1.0 + (plate - 0.5) * 0.10
        r = np.clip(br * tone * (1 - dirt * 0.22), 0.0, 1.0)
        g = np.clip(bg * tone * (1 - dirt * 0.18), 0.0, 1.0)
        b = np.clip(bb * tone * (1 - dirt * 0.16), 0.0, 1.0)
        rough = 0.30 + dirt * 0.22 + (peel - 0.5) * 0.04
        metal = edge * 0.35
        height = height + (peel - 0.5) * 0.035
    elif role == "warning":
        period = max(6, int(px_per_m * 0.16))
        band = (((xs + ys) % period) < period * 0.5).astype(np.float32)
        band = band * (1.0 - (grain > 0.90) * 0.7)
        r = np.clip(br * (1 - band * 0.72) * (1 - dirt * 0.24), 0.0, 1.0)
        g = np.clip(bg * (1 - band * 0.55) * (1 - dirt * 0.20), 0.0, 1.0)
        b = np.clip(bb * (1 - band * 0.30) + band * 0.03, 0.0, 1.0)
        rough = 0.42 + dirt * 0.20 + (peel - 0.5) * 0.04
        metal = edge * 0.25
        height = height + (peel - 0.5) * 0.035
    elif role == "glass":
        smear = np.clip(streak * 0.16 + speck * 0.05, 0.0, 1.0)
        r = np.clip(br + smear * 0.05, 0.0, 1.0)
        g = np.clip(bg + smear * 0.05, 0.0, 1.0)
        b = np.clip(bb + smear * 0.05, 0.0, 1.0)
        rough = 0.045 + smear * 0.06
        metal = zero
        height = smear * 0.02
    else:  # thruster: sooted liner deep inside the bell
        heat = np.clip(1.0 - ys.astype(np.float32) / max(1.0, size), 0.0, 1.0)
        r = np.clip(br + heat * 0.10 + speck * 0.02, 0.0, 1.0)
        g = np.clip(bg + heat * 0.035 + speck * 0.02, 0.0, 1.0)
        b = np.clip(bb + heat * 0.012 + speck * 0.02, 0.0, 1.0)
        rough = 0.24 + speck * 0.22
        metal = np.full((size, size), 0.18, np.float32)
        height = (speck - 0.5) * 0.06

    ao = np.clip(1.0 - cavity * 0.62 - dirt * 0.22, 0.10, 1.0)
    gx = np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)
    gy = np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)
    nx = np.clip(0.5 - gx * 1.6, 0.0, 1.0)
    ny = np.clip(0.5 - gy * 1.6, 0.0, 1.0)
    one = np.ones((size, size), np.float32)

    albedo = np.stack((_quantise(r, 96), _quantise(g, 96), _quantise(b, 96), one), axis=-1)
    orm = np.stack((_quantise(ao, 32), _quantise(np.clip(rough, 0.04, 0.95), 32),
                    _quantise(np.clip(metal, 0.0, 1.0), 24), one), axis=-1)
    normal = np.stack((_quantise(nx, 32), _quantise(ny, 32), one, one), axis=-1)
    return (
        np.ascontiguousarray(albedo.reshape(-1), dtype=np.float32),
        np.ascontiguousarray(orm.reshape(-1), dtype=np.float32),
        np.ascontiguousarray(normal.reshape(-1), dtype=np.float32),
    )


def write_image(name, flat_rgba, size, colorspace, out_path):
    if name in bpy.data.images:
        bpy.data.images.remove(bpy.data.images[name])
    img = bpy.data.images.new(name, width=size, height=size, alpha=True)
    img.colorspace_settings.name = colorspace
    img.pixels.foreach_set(flat_rgba)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    img.filepath_raw = str(out_path)
    img.file_format = "PNG"
    img.save()
    img.pack()
    return img


def role_maps(role, rgb, size, prefix, px_per_m, lod, variant=0):
    suffix = "" if lod == 0 else f"_lod{lod}"
    albedo, _unused_orm, _unused_nrm = role_surface(role, rgb, size, px_per_m, variant)
    base = write_image(f"drifter_{prefix}_basecolor{suffix}", albedo, size, "sRGB",
                       TEX_DIR / f"drifter_{prefix}_basecolor{suffix}.png")
    del albedo
    support = max(64, size // SUPPORT_MAP_DIVISOR)
    _unused_alb, orm, normal = role_surface(role, rgb, support,
                                            px_per_m / SUPPORT_MAP_DIVISOR, variant)
    orm_img = write_image(f"drifter_{prefix}_orm{suffix}", orm, support, "Non-Color",
                          TEX_DIR / f"drifter_{prefix}_orm{suffix}.png")
    nrm_img = write_image(f"drifter_{prefix}_normal{suffix}", normal, support, "Non-Color",
                          TEX_DIR / f"drifter_{prefix}_normal{suffix}.png")
    return base, orm_img, nrm_img, support


# --------------------------------------------------------------------------
# Materials. The value hierarchy is authored here (MTX-56): dark mechanical
# wells / mid teal-grey paint / light brushed alloy and cream refractory /
# one minority warning beat.
# --------------------------------------------------------------------------

MATERIAL_SPECS = {
    "Material_Hull":       ((0.355, 0.415, 0.425), 0.00, 0.42, "hull", 0.34, None),
    "Material_Hull_Aft":   ((0.352, 0.412, 0.422), 0.00, 0.42, "hull", 0.34, None),
    "Material_Nacelle":    ((0.349, 0.409, 0.419), 0.00, 0.42, "hull", 0.34, None),
    "Material_Armor":      ((0.105, 0.128, 0.136), 0.55, 0.36, "armor", 0.10, None),
    "Material_Mechanical": ((0.470, 0.478, 0.488), 0.96, 0.24, "mechanical", 0.0, None),
    "Material_Ceramic":    ((0.565, 0.560, 0.535), 0.00, 0.66, "ceramic", 0.0, None),
    "Material_Accent":     ((0.075, 0.330, 0.352), 0.00, 0.34, "accent", 0.30, None),
    "Material_Warning":    ((0.780, 0.372, 0.055), 0.00, 0.44, "warning", 0.22, None),
    "Material_Radiator":   ((0.140, 0.112, 0.092), 0.35, 0.56, "radiator", 0.0, None),
    "Material_Canopy":     ((0.055, 0.088, 0.098), 0.00, 0.06, "glass", 0.60, ((0.05, 0.10, 0.12), 0.10)),
    "Material_Thruster":   ((0.020, 0.019, 0.020), 0.18, 0.28, "thruster", 0.0, ((0.85, 0.32, 0.10), 0.55)),
}


def principled(material):
    material.use_nodes = True
    material.node_tree.nodes.clear()
    output = material.node_tree.nodes.new("ShaderNodeOutputMaterial")
    bsdf = material.node_tree.nodes.new("ShaderNodeBsdfPrincipled")
    material.node_tree.links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])
    return bsdf


def create_materials():
    """Materials first, maps later: the map size cannot be chosen until the
    joined mesh area and UV scale have been measured."""
    mats = {}
    for name, (rgb, metal, rough, role, coat, emit) in MATERIAL_SPECS.items():
        material = bpy.data.materials.new(name)
        bsdf = principled(material)
        bsdf.inputs["Base Color"].default_value = (*rgb, 1)
        bsdf.inputs["Metallic"].default_value = metal
        bsdf.inputs["Roughness"].default_value = rough
        if "Coat Weight" in bsdf.inputs and coat > 0:
            bsdf.inputs["Coat Weight"].default_value = coat
            bsdf.inputs["Coat Roughness"].default_value = 0.07
        if emit:
            bsdf.inputs["Emission Color"].default_value = (*emit[0], 1)
            bsdf.inputs["Emission Strength"].default_value = emit[1]
        if name == "Material_Canopy":
            # Opaque dark dielectric. Transmission through a solid loft reads
            # as a teal brick or a hole to the backdrop; the frames and the
            # cut tub carry the cockpit.
            for slot in ("Transmission Weight", "Transmission"):
                if slot in bsdf.inputs:
                    bsdf.inputs[slot].default_value = 0.0
                    break
            if "IOR" in bsdf.inputs:
                bsdf.inputs["IOR"].default_value = 1.48
            bsdf.inputs["Alpha"].default_value = 1.0
        material["spacefaceRole"] = role
        mats[name] = material
    return mats


def wire_maps(material, maps):
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    bsdf = next(n for n in nodes if n.type == "BSDF_PRINCIPLED")
    uv0 = nodes.new("ShaderNodeUVMap")
    uv0.uv_map = "UVMap"
    tex_a = nodes.new("ShaderNodeTexImage")
    tex_a.image = maps[0]
    tex_o = nodes.new("ShaderNodeTexImage")
    tex_o.image = maps[1]
    tex_n = nodes.new("ShaderNodeTexImage")
    tex_n.image = maps[2]
    for tex in (tex_a, tex_o, tex_n):
        links.new(uv0.outputs["UV"], tex.inputs["Vector"])
    sep = nodes.new("ShaderNodeSeparateColor")
    links.new(tex_o.outputs["Color"], sep.inputs["Color"])
    links.new(tex_a.outputs["Color"], bsdf.inputs["Base Color"])
    links.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
    links.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])
    nmap = nodes.new("ShaderNodeNormalMap")
    nmap.space = "TANGENT"
    nmap.inputs["Strength"].default_value = 0.9
    links.new(tex_n.outputs["Color"], nmap.inputs["Color"])
    links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    return tex_a


# --------------------------------------------------------------------------
# Mesh helpers
# --------------------------------------------------------------------------

def link_object(obj, collection):
    for current in list(obj.users_collection):
        current.objects.unlink(obj)
    collection.objects.link(obj)
    return obj


def finish_mesh(obj, material, bevel=0.03, segments=2):
    obj.data.materials.clear()
    obj.data.materials.append(material)
    if bevel > 0 and segments > 0:
        mod = obj.modifiers.new("ProductionBevel", "BEVEL")
        mod.width = bevel
        mod.segments = segments
        mod.limit_method = "ANGLE"
        mod.angle_limit = math.radians(40)
    wn = obj.modifiers.new("WeightedNormal", "WEIGHTED_NORMAL")
    wn.keep_sharp = True
    obj["spacefaceRole"] = material.get("spacefaceRole", "static")
    return obj


def add_box(name, loc, scale, material, collection, bevel=0.03, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(location=loc, rotation=rot)
    obj = link_object(bpy.context.object, collection)
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish_mesh(obj, material, bevel)


def add_cylinder(name, loc, radius, depth, material, collection, vertices=18, bevel=0.02, rot=(0, math.pi / 2, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc, rotation=rot)
    obj = link_object(bpy.context.object, collection)
    obj.name = name
    return finish_mesh(obj, material, bevel)


def superellipse_ring(x, y, z, ry, rz, sides=32, exponent=4.0):
    """Rounded manufactured rectangle in the YZ plane."""
    power = 2.0 / float(exponent)
    points = []
    for index in range(sides):
        angle = math.tau * index / sides
        cy, sz = math.cos(angle), math.sin(angle)
        points.append((
            x,
            y + math.copysign(abs(cy) ** power, cy) * ry,
            z + math.copysign(abs(sz) ** power, sz) * rz,
        ))
    return points


def add_axial_annulus(name, x, y, z, outer_ry, outer_rz, inner_ry, inner_rz,
                      depth, material, collection, sides=28, bevel=0.006,
                      ring_fn=None):
    """True open hoop with front/back walls; never a cylinder cap posing as a bore."""
    ring_fn = ring_fn or ellipse_ring
    xa, xb = x - depth * 0.5, x + depth * 0.5
    rings = (
        ring_fn(xa, y, z, outer_ry, outer_rz, sides),
        ring_fn(xb, y, z, outer_ry, outer_rz, sides),
        ring_fn(xa, y, z, inner_ry, inner_rz, sides),
        ring_fn(xb, y, z, inner_ry, inner_rz, sides),
    )
    verts = [point for ring in rings for point in ring]
    faces = []
    outer_a, outer_b, inner_a, inner_b = 0, sides, sides * 2, sides * 3
    for index in range(sides):
        nxt = (index + 1) % sides
        faces.extend((
            (outer_a + index, outer_a + nxt, outer_b + nxt, outer_b + index),
            (inner_a + nxt, inner_a + index, inner_b + index, inner_b + nxt),
            (outer_a + index, inner_a + index, inner_a + nxt, outer_a + nxt),
            (outer_b + nxt, inner_b + nxt, inner_b + index, outer_b + index),
        ))
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    return finish_mesh(obj, material, bevel)


def loft_from_rings(name, rings, material, collection, bevel, cap=True):
    sides = len(rings[0])
    verts = [vert for ring in rings for vert in ring]
    faces = []
    if cap:
        faces.append(tuple(range(sides - 1, -1, -1)))
        faces.append(tuple(range((len(rings) - 1) * sides, len(rings) * sides)))
    for station in range(len(rings) - 1):
        a = station * sides
        b = (station + 1) * sides
        for i in range(sides):
            j = (i + 1) % sides
            faces.append((a + i, a + j, b + j, b + i))
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    return finish_mesh(obj, material, bevel)


def ellipse_ring(x, y, z, rx, rz, sides=16):
    return [
        (x, y + math.cos(math.tau * i / sides) * rx, z + math.sin(math.tau * i / sides) * rz)
        for i in range(sides)
    ]


def recalc_mesh(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    try:
        bpy.ops.mesh.remove_doubles(threshold=0.0005)
    except TypeError:
        bpy.ops.mesh.merge_by_distance(distance=0.0005)
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    obj.data.update()
    return obj


def subdivide_mesh(obj, cuts=1):
    apply_modifiers(obj)
    if cuts <= 0:
        return obj
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.subdivide(number_cuts=int(cuts))
    bpy.ops.object.mode_set(mode="OBJECT")
    obj.data.update()
    return obj


def thicken_shell(obj, thickness=0.10):
    """Give a paper loft a wall so later cuts are openings with a rim."""
    apply_modifiers(obj)
    solid = obj.modifiers.new("HullSkin", "SOLIDIFY")
    solid.thickness = float(thickness)
    solid.offset = -1.0
    try:
        solid.use_even_offset = True
    except Exception:
        pass
    apply_modifiers(obj)
    return recalc_mesh(obj)


def report_shells(obj, tag):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    boundary = sum(1 for edge in bm.edges if edge.is_boundary)
    faces = len(bm.faces)
    bm.free()
    print(f"{tag}: {faces} faces, {boundary} boundary edges")
    return boundary


def delete_faces_in_box(obj, x0, x1, y0, y1, z0, z1, normal=None, normal_min=0.35):
    """Open a well by deleting faces. normal=None removes BOTH skins, which is
    what turns an 11 cm pocket into a hole the chase camera can see into."""
    apply_modifiers(obj)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.faces.ensure_lookup_table()
    bm.normal_update()
    victims = []
    for face in bm.faces:
        centre = face.calc_center_median()
        if not (x0 <= centre.x <= x1 and y0 <= centre.y <= y1 and z0 <= centre.z <= z1):
            continue
        if normal == "z" and face.normal.z < normal_min:
            continue
        if normal == "z-" and face.normal.z > -normal_min:
            continue
        if normal == "y+" and face.normal.y < normal_min:
            continue
        if normal == "y-" and face.normal.y > -normal_min:
            continue
        if normal == "x-" and face.normal.x > -normal_min:
            continue
        if normal == "x+" and face.normal.x < normal_min:
            continue
        victims.append(face)
    if victims:
        bmesh.ops.delete(bm, geom=victims, context="FACES")
        bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=0.0005)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    return len(victims)


def strip_inner_skin(obj, axis=(0.0, 0.15), keep=0.70):
    """Delete the inward-facing solidify sheet except within `keep` metres of
    an opening, where it is the visible wall thickness (MTX-57).

    This is texel budget, not a quality cut: nothing deleted here is on a
    supported camera, and every opening keeps its rim.
    """
    apply_modifiers(obj)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.faces.ensure_lookup_table()
    bm.normal_update()
    axis_y, axis_z = axis
    border = [tuple(vert.co) for edge in bm.edges if edge.is_boundary for vert in edge.verts]
    if not border:
        bm.free()
        return 0
    points = np.array(border, dtype=np.float64)
    keep_sq = float(keep) * float(keep)
    victims = []
    for face in bm.faces:
        centre = face.calc_center_median()
        radial = Vector((0.0, centre.y - axis_y, centre.z - axis_z))
        if radial.length < 1e-6:
            continue
        if face.normal.dot(radial.normalized()) > -0.15:
            continue
        delta = points - np.array((centre.x, centre.y, centre.z))
        if float(np.einsum("ij,ij->i", delta, delta).min()) < keep_sq:
            continue
        victims.append(face)
    if victims:
        bmesh.ops.delete(bm, geom=victims, context="FACES")
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    print(f"strip_inner_skin {obj.name}: removed {len(victims)} hidden faces")
    return len(victims)


def soften_lower_ring(points, zc, strength):
    """Round lower station corners without softening the working deck."""
    if strength <= 0:
        return points
    src = [Vector(point) for point in points]
    out = []
    for index, current in enumerate(src):
        if current.z >= zc + 0.02:
            out.append(tuple(current))
            continue
        previous = src[(index - 1) % len(src)]
        following = src[(index + 1) % len(src)]
        target = (previous + current * 2.0 + following) * 0.25
        out.append(tuple(current.lerp(target, strength)))
    return out


def loft_volume(name, specs, material, collection, thick=0.12, dens=3, bevel=0.010,
                lower_softness=0.0):
    """One manufactured volume. specs are (x, yc, hw, hh, zc, flat, box, keel)."""
    rings = []
    for x, yc, hw, hh, zc, flat, box, keel in specs:
        ring = densify_ring(
            station_ring(x, yc, zc, hw, hh, flat=flat, box=box, keel=keel), dens)
        rings.append(soften_lower_ring(ring, zc, lower_softness))
    obj = loft_from_rings(name, rings, material, collection, bevel, cap=True)
    thicken_shell(obj, thick)
    return obj


def inset_large_faces(obj, thickness=0.05, depth=0.022, min_area=0.24, bevel=0.012,
                      z_min=-0.35, axis=(0.0, 0.15), band=1.95):
    """MTX-05: plates with a stepped edge and a seam channel cut into the skin,
    rather than boxes parked on it.

    Only the outer skin above the keel line is panelised: the inner solidify
    surface and the belly are never on a supported camera, and spending plate
    geometry there is what turns a panel pass into a triangle bill.
    Returns (panels, dorsal panels).
    """
    apply_modifiers(obj)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.faces.ensure_lookup_table()
    bm.normal_update()
    axis_y, axis_z = axis
    faces = []
    for face in bm.faces:
        if face.calc_area() < min_area:
            continue
        centre = face.calc_center_median()
        if centre.z < z_min:
            continue
        radial = Vector((0.0, centre.y - axis_y, centre.z - axis_z))
        if radial.length < 1e-6:
            continue
        if face.normal.dot(radial.normalized()) < 0.12:
            continue
        # Checker the plates along the length AND around the girth. A run of
        # inset faces at one station corrugates the shell into ribs; a checker
        # reads as plating with quiet plate between (MTX-05 / MTX-64).
        column = int(math.floor((centre.x + 24.0) / band))
        sector = int((math.atan2(centre.z - axis_z, centre.y - axis_y) + math.pi)
                     / (2.0 * math.pi) * 10.0)
        if (column + sector) % 2:
            continue
        faces.append(face)
    panels = len(faces)
    dorsal = sum(1 for f in faces if f.calc_center_median().z > 0.55 and f.normal.z > 0.30)
    if faces:
        bmesh.ops.inset_individual(bm, faces=faces, thickness=thickness, depth=depth)
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=0.0004)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    finish_mesh(obj, obj.data.materials[0], bevel=bevel)
    return panels, dorsal


def add_curve_hose(name, points, material, collection, radius=0.018):
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth = radius
    curve.bevel_resolution = 2
    spline = curve.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for index, point in enumerate(points):
        bp = spline.bezier_points[index]
        bp.co = point
        bp.handle_left_type = "AUTO"
        bp.handle_right_type = "AUTO"
    obj = bpy.data.objects.new(name, curve)
    collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target="MESH")
    obj = bpy.context.object
    obj.name = name
    obj.select_set(False)
    return finish_mesh(obj, material, bevel=0.003)


# --------------------------------------------------------------------------
# Assemblies
# --------------------------------------------------------------------------

def cut_deck_well(hull, tag, x0, x1, half_y, deck_z, depth, mats, collection,
                  rim_material=None, wall=0.055, ribs=4):
    """A real opening: both skins removed, a lined tub hung inside the hull, a
    rim that shows shell thickness (MTX-03/04/57), ribbed walls."""
    armor = mats["Material_Armor"]
    mech = mats["Material_Mechanical"]
    rim_material = rim_material or mech
    removed = delete_faces_in_box(
        hull, x0, x1, -half_y, half_y, deck_z - 0.58, deck_z + 0.62, normal=None,
    )
    print(f"{tag}: removed {removed} skin faces")
    cx = (x0 + x1) * 0.5
    hx = (x1 - x0) * 0.5
    hz = depth * 0.5
    cz = deck_z - hz
    floor_z = cz - hz
    add_box(f"{tag}_Floor", (cx, 0.0, floor_z + wall * 0.5), (hx, half_y, wall * 0.5), armor, collection, 0.004)
    add_box(f"{tag}_Fore", (cx + hx - wall * 0.5, 0.0, cz), (wall * 0.5, half_y, hz), armor, collection, 0.004)
    add_box(f"{tag}_Aft", (cx - hx + wall * 0.5, 0.0, cz), (wall * 0.5, half_y, hz), armor, collection, 0.004)
    add_box(f"{tag}_Port", (cx, -half_y + wall * 0.5, cz), (hx - wall, wall * 0.5, hz), armor, collection, 0.004)
    add_box(f"{tag}_Stbd", (cx, half_y - wall * 0.5, cz), (hx - wall, wall * 0.5, hz), armor, collection, 0.004)
    for i in range(ribs):
        rx = x0 + (x1 - x0) * (i + 0.5) / ribs
        for sign in (-1, 1):
            add_box(
                f"{tag}_Rib_{i}_{'S' if sign > 0 else 'P'}",
                (rx, sign * (half_y - wall - 0.030), cz + 0.03),
                (0.038, 0.030, hz - 0.06), mech, collection, 0.003,
            )
    rw = 0.19
    rh = 0.085
    add_box(f"{tag}_RimFore", (x1 + rw * 0.5 - 0.03, 0.0, deck_z + rh * 0.30),
            (rw * 0.5, half_y + rw, rh), rim_material, collection, 0.006)
    add_box(f"{tag}_RimAft", (x0 - rw * 0.5 + 0.03, 0.0, deck_z + rh * 0.30),
            (rw * 0.5, half_y + rw, rh), rim_material, collection, 0.006)
    add_box(f"{tag}_RimPort", (cx, -half_y - rw * 0.5 + 0.03, deck_z + rh * 0.30),
            (hx + rw * 0.4, rw * 0.5, rh), rim_material, collection, 0.006)
    add_box(f"{tag}_RimStbd", (cx, half_y + rw * 0.5 - 0.03, deck_z + rh * 0.30),
            (hx + rw * 0.4, rw * 0.5, rh), rim_material, collection, 0.006)
    return cx, hx, floor_z


def add_deck_radiator(tag, x0, x1, y0, y1, deck_z, mats, collection, fins):
    """Radiator cassette in a deck well: fin edges up, header pipes across the
    frame. The chase camera reads a dark slot with a comb in it (MTX-09)."""
    mech = mats["Material_Mechanical"]
    rad = mats["Material_Radiator"]
    cx = (x0 + x1) * 0.5
    cy = (y0 + y1) * 0.5
    hx = abs(x1 - x0) * 0.5
    hy = abs(y1 - y0) * 0.5
    depth = 0.30
    add_box(f"Rad_{tag}_Back", (cx, cy, deck_z - depth), (hx, hy, 0.030), rad, collection, 0.004)
    add_box(f"Rad_{tag}_WallP", (cx, cy - hy, deck_z - depth * 0.5), (hx, 0.028, depth * 0.5), rad, collection, 0.003)
    add_box(f"Rad_{tag}_WallS", (cx, cy + hy, deck_z - depth * 0.5), (hx, 0.028, depth * 0.5), rad, collection, 0.003)
    add_box(f"Rad_{tag}_WallF", (cx + hx, cy, deck_z - depth * 0.5), (0.028, hy, depth * 0.5), rad, collection, 0.003)
    add_box(f"Rad_{tag}_WallA", (cx - hx, cy, deck_z - depth * 0.5), (0.028, hy, depth * 0.5), rad, collection, 0.003)
    for i in range(fins):
        fx = x0 + (x1 - x0) * (i + 0.5) / max(1, fins)
        add_box(f"Rad_{tag}_Fin_{i}", (fx, cy, deck_z - depth * 0.55),
                (0.016, hy - 0.05, depth * 0.42), rad, collection, 0.002)
    add_cylinder(f"Rad_{tag}_HeaderF", (cx + hx - 0.05, cy, deck_z - 0.05), 0.026, hy * 1.7, mech, collection,
                 vertices=8, bevel=0.003, rot=(math.pi / 2, 0, 0))
    add_cylinder(f"Rad_{tag}_HeaderA", (cx - hx + 0.05, cy, deck_z - 0.05), 0.026, hy * 1.7, mech, collection,
                 vertices=8, bevel=0.003, rot=(math.pi / 2, 0, 0))
    for lx, ly, name in ((cx, cy - hy - 0.035, "P"), (cx, cy + hy + 0.035, "S")):
        add_box(f"Rad_{tag}_Rim{name}", (lx, ly, deck_z + 0.025), (hx + 0.06, 0.05, 0.045), mech, collection, 0.004)
    add_box(f"Rad_{tag}_RimF", (cx + hx + 0.035, cy, deck_z + 0.025), (0.05, hy + 0.08, 0.045), mech, collection, 0.004)
    add_box(f"Rad_{tag}_RimA", (cx - hx - 0.035, cy, deck_z + 0.025), (0.05, hy + 0.08, 0.045), mech, collection, 0.004)


def add_greenhouse(tag, x0, x1, deck_z, half_aft, half_fore, height, mats, collection, detail):
    """Raised framed greenhouse over a cut tub. From above it has to read as a
    framed dark rectangle: dark panes, light alloy frame lattice (MTX-07)."""
    glass = mats["Material_Canopy"]
    mech = mats["Material_Mechanical"]
    armor = mats["Material_Armor"]
    cx = (x0 + x1) * 0.5
    length = x1 - x0
    zt = deck_z + height
    z0 = deck_z + 0.04
    # roof plan is inset from the sill so the glass slopes inboard
    ra, rf = half_aft * 0.74, half_fore * 0.72
    xa, xf = x0 + 0.26, x1 - 0.34

    add_folded_sheet(f"{tag}_Windscreen",
                     (x1, -half_fore, z0), (x1, half_fore, z0),
                     (xf, rf, zt), (xf, -rf, zt), 0.024, glass, collection, 0.003)
    add_folded_sheet(f"{tag}_Roof",
                     (xf, -rf, zt), (xf, rf, zt),
                     (xa, ra, zt), (xa, -ra, zt), 0.024, glass, collection, 0.003)
    add_folded_sheet(f"{tag}_AftPane",
                     (xa, -ra, zt), (xa, ra, zt),
                     (x0, half_aft, z0), (x0, -half_aft, z0), 0.024, glass, collection, 0.003)
    for sign, side in ((-1, "P"), (1, "S")):
        add_folded_sheet(f"{tag}_Pane{side}",
                         (x1, sign * half_fore, z0), (xf, sign * rf, zt),
                         (xa, sign * ra, zt), (x0, sign * half_aft, z0),
                         0.024, glass, collection, 0.003)
        add_folded_sheet(f"{tag}_Arch{side}",
                         (x1 + 0.01, sign * (half_fore + 0.012), z0),
                         (xf, sign * (rf + 0.012), zt + 0.012),
                         (xa, sign * (ra + 0.012), zt + 0.012),
                         (x0 - 0.01, sign * (half_aft + 0.012), z0),
                         0.072, mech, collection, 0.004)
        add_folded_sheet(f"{tag}_Sill{side}",
                         (x1 + 0.05, sign * (half_fore + 0.03), deck_z - 0.01),
                         (x0 - 0.05, sign * (half_aft + 0.03), deck_z - 0.01),
                         (x0 - 0.05, sign * (half_aft + 0.03), deck_z + 0.075),
                         (x1 + 0.05, sign * (half_fore + 0.03), deck_z + 0.075),
                         0.075, mech, collection, 0.004)
    add_box(f"{tag}_SillFore", (x1 + 0.055, 0.0, deck_z + 0.045), (0.070, half_fore + 0.08, 0.070), mech, collection, 0.005)
    add_box(f"{tag}_SillAft", (x0 - 0.055, 0.0, deck_z + 0.045), (0.070, half_aft + 0.08, 0.070), mech, collection, 0.005)
    add_box(f"{tag}_Header", (xf, 0.0, zt + 0.016), (0.062, rf + 0.03, 0.058), mech, collection, 0.004)
    add_box(f"{tag}_Coaming", (xa, 0.0, zt + 0.016), (0.055, ra + 0.03, 0.052), mech, collection, 0.004)
    add_box(f"{tag}_Spine", (cx - 0.04, 0.0, zt + 0.024), (length * 0.34, 0.042, 0.036), mech, collection, 0.004)
    if detail <= 1:
        for i, t in enumerate((0.34, 0.62)):
            xm = x0 + length * t
            wm = half_aft + (half_fore - half_aft) * t
            add_box(f"{tag}_Mullion_{i}", (xm, 0.0, zt + 0.008), (0.030, wm * 0.72, 0.038), mech, collection, 0.003)
    # Cut tub interior. Not furniture: a dark cabin volume and an instrument
    # mass, which is all the bird's-eye camera can resolve through the glass.
    add_box(f"{tag}_TubFloor", (cx, 0.0, deck_z - 0.42), (length * 0.42, half_aft * 0.80, 0.032), armor, collection, 0.004)
    add_box(f"{tag}_TubAft", (x0 + 0.18, 0.0, deck_z - 0.20), (0.038, half_aft * 0.72, 0.24), armor, collection, 0.004)
    add_box(f"{tag}_Console", (x1 - 0.30, 0.0, deck_z - 0.14), (0.15, half_fore * 0.78, 0.060), mech, collection, 0.004)


def add_throat_collar(tag, x, y, z, s, mats, collection, detail):
    """Manufactured mouth: hoop, refractory liner, rooted vanes. Also covers
    the face-delete edge so the throat is a ring, not a tear."""
    armor = mats["Material_Armor"]
    ceramic = mats["Material_Ceramic"]
    mech = mats["Material_Mechanical"]
    outer = loft_from_rings(f"ThroatOuter_{tag}", [
        ellipse_ring(x + 0.12, y, z, 0.80 * s, 0.80 * s, 32),
        ellipse_ring(x - 0.12, y, z, 0.76 * s, 0.76 * s, 32),
    ], mech, collection, 0.005, cap=False)
    thicken_shell(outer, 0.045 * s)
    liner = loft_from_rings(f"ThroatLiner_{tag}", [
        ellipse_ring(x + 0.08, y, z, 0.60 * s, 0.60 * s, 28),
        ellipse_ring(x - 0.36, y, z, 0.52 * s, 0.52 * s, 28),
    ], ceramic, collection, 0.004, cap=False)
    thicken_shell(liner, 0.026 * s)
    add_axial_annulus(
        f"ThroatHoop_{tag}", x + 0.08, y, z,
        0.86 * s, 0.86 * s, 0.66 * s, 0.66 * s,
        0.075 * s, armor, collection, sides=28, bevel=0.004)
    vanes = {0: 9, 1: 6, 2: 0}[detail]
    for index in range(vanes):
        ang = math.tau * index / max(1, vanes)
        add_tapered_vane(f"ThroatVane_{tag}_{index}", (x - 0.16, y, z), armor, collection, ang, scale=s * 0.44)
    if detail == 0:
        for index in range(10):
            ang = math.tau * index / 10
            add_box(f"ThroatBolt_{tag}_{index}",
                    (x + 0.09, y + math.cos(ang) * 0.82 * s, z + math.sin(ang) * 0.82 * s),
                    (0.020, 0.018, 0.018), mech, collection, 0.002)
    return outer


def add_hollow_bell(tag, x, y, z, scale, mats, collection, detail):
    """Open spun bottle with wall thickness behind the throat, so the bore is
    a dark lined volume rather than a painted circle."""
    s = scale
    ceramic = mats["Material_Ceramic"]
    thruster = mats["Material_Thruster"]
    mech = mats["Material_Mechanical"]
    armor = mats["Material_Armor"]
    rings = []
    for t, r in ((0.00, 0.26), (0.22, 0.36), (0.48, 0.52), (0.75, 0.68), (1.00, 0.84)):
        rings.append(ellipse_ring(x - 0.08 * s - t * 1.55 * s, y, z, r * s, r * s, 32))
    outer = loft_from_rings(f"Bell_{tag}", rings, mech, collection, 0.008, cap=False)
    thicken_shell(outer, 0.11 * s)
    liner_rings = []
    for t, r in ((0.10, 0.15), (0.45, 0.30), (0.85, 0.48)):
        liner_rings.append(ellipse_ring(x - 0.24 * s - t * 1.25 * s, y, z, r * s, r * s, 24))
    liner = loft_from_rings(f"BellLiner_{tag}", liner_rings, thruster, collection, 0.004, cap=False)
    thicken_shell(liner, 0.035 * s)
    add_axial_annulus(
        f"BellCollar_{tag}", x - 0.02 * s, y, z,
        0.36 * s, 0.36 * s, 0.25 * s, 0.25 * s,
        0.14 * s, ceramic, collection, sides=24, bevel=0.005)
    add_axial_annulus(
        f"BellClamp_{tag}", x + 0.12 * s, y, z,
        0.42 * s, 0.42 * s, 0.33 * s, 0.33 * s,
        0.07 * s, armor, collection, sides=24, bevel=0.004)
    if detail == 0:
        for index in range(8):
            ang = math.tau * index / 8
            add_cylinder(f"BellBolt_{tag}_{index}",
                         (x + 0.12 * s, y + math.cos(ang) * 0.38 * s, z + math.sin(ang) * 0.38 * s),
                         0.015 * s, 0.045 * s, mech, collection, 8, 0.002)
    return outer


def diamond_airfoil(x_le, y, z, chord, thick):
    """Twelve-point airfoil: round leading edge, sharp trailing edge, camber."""
    return [
        (x_le, y, z),
        (x_le - chord * 0.06, y, z + thick * 0.42),
        (x_le - chord * 0.16, y, z + thick * 0.82),
        (x_le - chord * 0.32, y, z + thick),
        (x_le - chord * 0.52, y, z + thick * 0.78),
        (x_le - chord * 0.74, y, z + thick * 0.38),
        (x_le - chord * 0.92, y, z + thick * 0.10),
        (x_le - chord, y, z),
        (x_le - chord * 0.78, y, z - thick * 0.42),
        (x_le - chord * 0.50, y, z - thick * 0.62),
        (x_le - chord * 0.22, y, z - thick * 0.48),
        (x_le - chord * 0.06, y, z - thick * 0.22),
    ]


# y, leading-edge x, chord, thickness, z. The root is buried in the nacelle
# flank and is 9x the tip thickness: a rooted winglet, not a card.
WING_SECTIONS = (
    (1.55, -2.85, 1.74, 0.48, 0.22),
    (2.10, -3.00, 1.62, 0.40, 0.21),
    (2.62, -3.22, 1.42, 0.28, 0.18),
    (3.05, -3.48, 1.20, 0.16, 0.13),
    (3.40, -3.74, 0.98, 0.09, 0.08),
    (3.62, -3.96, 0.76, 0.05, 0.04),
)


def add_winglet(name, sign, mats, collection, detail, dens):
    hull = mats["Material_Nacelle"]
    armor = mats["Material_Armor"]
    warning = mats["Material_Warning"]
    mech = mats["Material_Mechanical"]
    rings = [
        densify_ring(diamond_airfoil(le, y * sign, z, chord, thick), dens)
        for y, le, chord, thick, z in WING_SECTIONS
    ]
    wing = loft_from_rings(name, rings, hull, collection, 0.008, cap=True)
    # Root fillet: a short flare that melts the root into the nacelle flank.
    fillet = [
        densify_ring(diamond_airfoil(-2.80, 1.18 * sign, 0.23, 1.82, 0.62), dens),
        densify_ring(diamond_airfoil(-2.82, 1.40 * sign, 0.225, 1.78, 0.56), dens),
        densify_ring(diamond_airfoil(-2.84, 1.64 * sign, 0.22, 1.76, 0.51), dens),
    ]
    loft_from_rings(f"{name}_Fillet", fillet, hull, collection, 0.008, cap=True)
    if detail <= 1:
        flap = [
            densify_ring(diamond_airfoil(-4.70, 2.24 * sign, 0.195, 0.58, 0.110), dens),
            densify_ring(diamond_airfoil(-4.78, 2.86 * sign, 0.165, 0.48, 0.080), dens),
            densify_ring(diamond_airfoil(-4.86, 3.34 * sign, 0.125, 0.36, 0.048), dens),
        ]
        loft_from_rings(f"{name}_Flap", flap, armor, collection, 0.005, cap=True)
    add_box(f"{name}_Tip", (-4.34, 3.68 * sign, 0.038), (0.38, 0.055, 0.030), warning, collection, 0.004)
    if detail == 0:
        for i, yb in enumerate((2.35, 2.80, 3.20)):
            add_box(f"{name}_Rib_{i}", (-3.62 - i * 0.16, yb * sign, 0.078),
                    (0.32, 0.022, 0.030), mech, collection, 0.003)
    return wing


def add_empty(name, loc, collection, parent=None):
    obj = bpy.data.objects.new(name, None)
    collection.objects.link(obj)
    obj.empty_display_type = "PLAIN_AXES"
    obj.empty_display_size = 0.2
    obj.location = loc
    if parent:
        obj.parent = parent
    obj["socket"] = True
    return obj


def sockets():
    """The same eleven contract names. Positions follow the new hull."""
    return {
        "SOCKET_Weapon_Front": (6.85, 0.0, 0.34),
        "SOCKET_Mining_Front": (7.35, 0.0, -0.08),
        "SOCKET_Engine_Main": (-7.40, 0.0, 0.24),
        "SOCKET_Trail_Main": (-7.95, 0.0, 0.24),
        "SOCKET_Trail_Port": (-8.15, -1.70, 0.24),
        "SOCKET_Trail_Starboard": (-8.15, 1.70, 0.24),
        "SOCKET_Utility_Dorsal": (0.60, 0.0, 1.42),
        "SOCKET_Cargo_Ventral": (-0.30, 0.0, -1.00),
        "SOCKET_Camera_Focus": (0.60, 0.0, 0.30),
        "SOCKET_RCS_Port": (-1.20, -2.14, 0.10),
        "SOCKET_RCS_Starboard": (-1.20, 2.14, 0.10),
    }


# --------------------------------------------------------------------------
# UV / texel density
# --------------------------------------------------------------------------

def normalise_uv(obj):
    uv = obj.data.uv_layers[0].data
    us = [loop.uv[0] for loop in uv]
    vs = [loop.uv[1] for loop in uv]
    if not us:
        return
    lo_u, hi_u = min(us), max(us)
    lo_v, hi_v = min(vs), max(vs)
    span = max(hi_u - lo_u, hi_v - lo_v, 1e-6)
    scale = 0.996 / span
    for loop in uv:
        loop.uv[0] = 0.002 + (loop.uv[0] - lo_u) * scale
        loop.uv[1] = 0.002 + (loop.uv[1] - lo_v) * scale


def unwrap_object(obj, margin=0.0012):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    apply_modifiers(obj)
    try:
        bpy.ops.object.shade_smooth_by_angle(angle=math.radians(26))
    except Exception:
        for poly in obj.data.polygons:
            poly.use_smooth = True
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=66.0, island_margin=margin,
                             scale_to_bounds=False, correct_aspect=True)
    packed = False
    try:
        bpy.ops.uv.average_islands_scale()
        try:
            bpy.ops.uv.pack_islands(margin=margin, rotate=True, shape_method="CONCAVE")
        except TypeError:
            bpy.ops.uv.pack_islands(margin=margin, rotate=True)
        packed = True
    except Exception as exc:
        print(f"pack_islands unavailable, uniform normalise: {exc}")
    bpy.ops.object.mode_set(mode="OBJECT")
    if not packed:
        normalise_uv(obj)
    if "UV1" in obj.data.uv_layers:
        obj.data.uv_layers.remove(obj.data.uv_layers["UV1"])
    uv1 = obj.data.uv_layers.new(name="UV1")
    uv0 = obj.data.uv_layers[0]
    for loop in obj.data.loops:
        uv1.data[loop.index].uv = uv0.data[loop.index].uv * 6.0
    obj.select_set(False)


def export_uv_layout(obj, path, size=1024):
    """MTX-16 proof artefact: the unique UV0 layout of a bake target.

    Rasterised here rather than through `uv.export_layout`, whose PNG path
    needs a GPU offscreen buffer that does not exist in background mode.
    """
    mesh = obj.data
    if not mesh.uv_layers:
        return None
    loops = len(mesh.loops)
    flat = np.empty(loops * 2, dtype=np.float32)
    mesh.uv_layers[0].data.foreach_get("uv", flat)
    coords = flat.reshape(loops, 2)
    starts = np.empty(len(mesh.polygons), dtype=np.int32)
    totals = np.empty(len(mesh.polygons), dtype=np.int32)
    mesh.polygons.foreach_get("loop_start", starts)
    mesh.polygons.foreach_get("loop_total", totals)
    head = []
    tail = []
    for start, total in zip(starts, totals):
        idx = np.arange(start, start + total)
        head.append(idx)
        tail.append(np.roll(idx, -1))
    if not head:
        return None
    head = np.concatenate(head)
    tail = np.concatenate(tail)
    steps = np.linspace(0.0, 1.0, 24, dtype=np.float32)[None, :, None]
    a = coords[head][:, None, :]
    b = coords[tail][:, None, :]
    points = (a + (b - a) * steps).reshape(-1, 2)
    px = np.clip((points[:, 0] * (size - 1)).astype(np.int32), 0, size - 1)
    py = np.clip((points[:, 1] * (size - 1)).astype(np.int32), 0, size - 1)
    canvas = np.zeros((size, size), dtype=np.float32)
    canvas[py, px] = 1.0
    rgba = np.stack((canvas * 0.92, canvas * 0.96, canvas, np.ones_like(canvas)), axis=-1)
    path.parent.mkdir(parents=True, exist_ok=True)
    write_image(f"UV0_{obj.name}", np.ascontiguousarray(rgba.reshape(-1), dtype=np.float32),
                size, "Non-Color", path)
    coverage = float(canvas.mean())
    print(f"uv0 layout {obj.name}: {path.name} edge coverage {coverage:.4f}")
    return path


def measure_uv_scale(obj):
    """k = sqrt(A_uv / A_mesh). Texel density on a square map is size * k."""
    mesh = obj.data
    if not mesh.uv_layers:
        return 0.0, 0.0, 0.0
    uv = mesh.uv_layers[0].data
    mesh.calc_loop_triangles()
    area_3d = 0.0
    area_uv = 0.0
    for tri in mesh.loop_triangles:
        area_3d += tri.area
        a, b, c = (uv[i].uv for i in tri.loops)
        area_uv += abs((b - a).cross(c - a)) * 0.5
    if area_3d <= 0.0:
        return 0.0, 0.0, 0.0
    return math.sqrt(area_uv / area_3d), area_3d, area_uv


def choose_map_size(uv_scale, lod):
    size = TEXEL_MIN_SIZE[lod]
    if uv_scale <= 0:
        return size
    while size < TEXEL_MAX_SIZE[lod] and size * uv_scale < TEXEL_FLOOR_PX_PER_M[lod]:
        size *= 2
    return size


def pin_cycles_determinism(scene, samples):
    scene.render.engine = "CYCLES"
    scene.render.threads_mode = "FIXED"
    scene.render.threads = 1
    scene.cycles.samples = samples
    scene.cycles.device = "CPU"
    scene.cycles.use_denoising = False
    for attr, value in (
        ("seed", 0), ("use_animated_seed", False), ("use_adaptive_sampling", False),
        ("sampling_pattern", "TABULATED_SOBOL"), ("use_light_tree", False),
    ):
        try:
            setattr(scene.cycles, attr, value)
        except Exception:
            pass


def bake_ao_array(obj, size=1024, samples=8):
    """Mesh-derived AO (MTX-23/MTX-30), baked once at a fixed low resolution.
    AO is low frequency, so pinning the bake size keeps cost and hash stable no
    matter how large the albedo map is."""
    if obj.type != "MESH" or not obj.data.polygons or not obj.data.uv_layers:
        return None
    material = obj.data.materials[0] if obj.data.materials else None
    if material is None or not material.node_tree:
        return None
    scene = bpy.context.scene
    pin_cycles_determinism(scene, samples)
    scene.render.bake.use_selected_to_active = False
    scene.render.bake.margin = 8
    name = f"AO_{obj.name}"
    if name in bpy.data.images:
        bpy.data.images.remove(bpy.data.images[name])
    ao_img = bpy.data.images.new(name, width=size, height=size, alpha=False, float_buffer=False)
    ao_img.colorspace_settings.name = "Non-Color"
    node = material.node_tree.nodes.new("ShaderNodeTexImage")
    node.image = ao_img
    node.name = "SF_AO_TARGET"
    material.node_tree.nodes.active = node
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    try:
        bpy.ops.object.bake(type="AO", use_clear=True, margin=8)
    except Exception as exc:
        print(f"AO bake skip {obj.name}: {exc}")
        material.node_tree.nodes.remove(node)
        return None
    material.node_tree.nodes.remove(node)
    buf = np.empty(size * size * 4, dtype=np.float32)
    ao_img.pixels.foreach_get(buf)
    ao = buf.reshape(size, size, 4)[:, :, 0].copy()
    bpy.data.images.remove(ao_img)
    return np.round(np.clip(ao, 0.0, 1.0) * 32.0) / 32.0


def multiply_ao_into_albedo(albedo_img, ao, strength=0.42):
    """Write the AO term into the albedo, then re-save AND re-pack. The old
    builder mutated pixels and packed without saving, which is why the same
    build produced two different LOD0 hashes."""
    if ao is None:
        return
    size = albedo_img.size[0]
    src = ao.shape[0]
    if src > size:
        step = src // size
        ao = ao[::step, ::step][:size, :size]
    elif src < size:
        rep = size // src
        ao = np.repeat(np.repeat(ao, rep, axis=0), rep, axis=1)[:size, :size]
    buf = np.empty(size * size * 4, dtype=np.float32)
    albedo_img.pixels.foreach_get(buf)
    px = buf.reshape(size, size, 4)
    factor = (1.0 - strength) + strength * ao
    px[:, :, 0] *= factor
    px[:, :, 1] *= factor
    px[:, :, 2] *= factor
    albedo_img.pixels.foreach_set(np.ascontiguousarray(px.reshape(-1), dtype=np.float32))
    if albedo_img.filepath_raw:
        albedo_img.save()
    albedo_img.pack()


# --------------------------------------------------------------------------
# Build
# --------------------------------------------------------------------------

def split_by_x(obj, x_split, new_name, material, collection):
    """Separate the aft part of the shell into its own object so the painted
    skin can carry two texture sets. Same paint spec on both sides: this is a
    UV budget split, not a second material."""
    apply_modifiers(obj)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    for poly in obj.data.polygons:
        poly.select = poly.center.x < x_split
    if not any(poly.select for poly in obj.data.polygons):
        return None
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.separate(type="SELECTED")
    bpy.ops.object.mode_set(mode="OBJECT")
    fresh = [item for item in bpy.context.selected_objects if item is not obj]
    if not fresh:
        return None
    new = fresh[0]
    link_object(new, collection)
    new.name = new_name
    new.data.materials.clear()
    new.data.materials.append(material)
    new["spacefaceRole"] = material.get("spacefaceRole", "hull")
    obj.select_set(False)
    new.select_set(False)
    return new


def build_lod(lod, mats, quick=False):
    collection = bpy.data.collections.new(f"DRIFTER_LOD{lod}")
    bpy.context.scene.collection.children.link(collection)
    hull = mats["Material_Hull"]
    hull_aft = mats["Material_Hull_Aft"]
    nacelle_paint = mats["Material_Nacelle"]
    armor = mats["Material_Armor"]
    mech = mats["Material_Mechanical"]
    warning = mats["Material_Warning"]
    accent = mats["Material_Accent"]
    ceramic = mats["Material_Ceramic"]
    detail = lod
    dens = RING_DENSITY[lod]
    segments = BEVEL_SEGMENTS[lod]

    root = add_empty(f"DRIFTER_LOD{lod}_ROOT", (0, 0, 0), collection)
    root["spacefaceAsset"] = {
        "contractVersion": 2,
        "assetId": "SF_DRIFTER_PRODUCTION_V1",
        "partId": "drifter_production_v1",
        "lod": f"lod{lod}",
        "slot": "hull",
        "category": "wholeships",
        "forward": "+X",
        "up": "+Y",
        "starboard": "+Z",
        "unit": "metre",
        "normalConvention": "OpenGL",
        "ormChannels": "R=AO,G=Roughness,B=Metallic",
        "textureCompression": "PNG-source",
        "embeddedPlume": False,
    }

    stations = HULL_STATIONS if lod < 2 else tuple(HULL_STATIONS[i] for i in (0, 2, 4, 6, 8, 9, 10, 11))
    stations = densify_stations(stations, STATION_EXTRA[lod])
    body = loft_volume(
        "Hull_Body", stations, hull, collection, thick=0.115, dens=dens,
        lower_softness={0: 0.30, 1: 0.24, 2: 0.18}[lod])
    panels = dorsal_panels = 0
    if lod == 0:
        panels, dorsal_panels = inset_large_faces(
            body, thickness=0.075, depth=0.022, min_area=0.24, axis=(0.0, 0.15), band=1.35)
    subdivide_mesh(body, HULL_SUBDIV[lod])

    nacelles = []
    for sign, side in ((-1, "Port"), (1, "Starboard")):
        specs = densify_stations(tuple(
            (x, yc * sign, hw, hh, zc, flat, box, keel)
            for x, yc, hw, hh, zc, flat, box, keel in NACELLE_STATIONS), STATION_EXTRA[lod])
        nac = loft_volume(
            f"Nacelle_{side}", specs, nacelle_paint, collection, thick=0.105, dens=dens,
            lower_softness={0: 0.38, 1: 0.28, 2: 0.20}[lod])
        if lod == 0:
            p, d = inset_large_faces(nac, thickness=0.060, depth=0.020, min_area=0.18,
                                     z_min=-0.30, axis=(NAC_Y_AFT * sign, 0.28), band=1.15)
            panels += p
            dorsal_panels += d
        subdivide_mesh(nac, HULL_SUBDIV[lod])
        nacelles.append((sign, side, nac))

    # ---- openings the 60 degree chase camera actually sees ---------------
    cargo = cut_deck_well(body, "CargoWell", -1.95, 1.95, 0.78, DECK_Z, 0.92,
                          mats, collection, rim_material=mech, ribs=5 if detail == 0 else 3)
    # Canopy tub: cut through the forward deck so the greenhouse sits on a hole.
    delete_faces_in_box(body, 4.40, 6.05, -0.52, 0.52, DECK_Z - 0.58, DECK_Z + 0.62, normal=None)
    # Aft radiator wells, port and starboard of the spine beam.
    for sign, side in ((-1, "Port"), (1, "Starboard")):
        ylo, yhi = sorted((0.26 * sign, 0.64 * sign))
        delete_faces_in_box(body, -5.45, -3.45, ylo, yhi, DECK_Z - 0.20, DECK_Z + 0.62, normal=None)
    strip_inner_skin(body, axis=(0.0, 0.15))
    report_shells(body, "hull after wells")

    for sign, side, nac in nacelles:
        y = NAC_Y_AFT * sign
        # Throat: both skins, central window only, so the outer cap keeps a
        # clean annulus that the collar hoop then covers.
        delete_faces_in_box(nac, -8.30, -7.88, y - 0.54, y + 0.54, -0.26, 0.82, normal=None)
        outer = "y+" if sign > 0 else "y-"
        lo, hi = sorted((y + sign * 0.40, y + sign * 1.00))
        delete_faces_in_box(nac, -5.20, -3.90, lo, hi, 0.12, 0.64, normal=outer, normal_min=0.15)
        strip_inner_skin(nac, axis=(NAC_Y_AFT * sign, 0.28))
        report_shells(nac, f"nacelle {side}")

    body_aft = split_by_x(body, 0.90, "Hull_Body_Aft", hull_aft, collection)
    for obj in [body, body_aft] + [n for _s, _n, n in nacelles]:
        if obj is None:
            continue
        bevel = obj.modifiers.new("HullBevel", "BEVEL")
        bevel.width = 0.016
        bevel.segments = segments
        bevel.limit_method = "ANGLE"
        bevel.angle_limit = math.radians(32)
        wn = obj.modifiers.new("HullWN", "WEIGHTED_NORMAL")
        wn.keep_sharp = True
        apply_modifiers(obj)

    # ---- greenhouse ------------------------------------------------------
    add_greenhouse("Canopy", 4.30, 6.15, DECK_Z, 0.76, 0.58, 0.74, mats, collection, detail)

    # ---- cargo well furniture -------------------------------------------
    cx, hx, floor_z = cargo
    add_box("CargoRail_P", (cx, -0.50, floor_z + 0.13), (hx - 0.10, 0.036, 0.028), mech, collection, 0.003)
    add_box("CargoRail_S", (cx, 0.50, floor_z + 0.13), (hx - 0.10, 0.036, 0.028), mech, collection, 0.003)
    add_box("CargoCrate_A", (cx - 0.95, -0.28, floor_z + 0.30), (0.50, 0.32, 0.20), armor, collection, 0.006)
    add_box("CargoCrate_B", (cx + 0.45, 0.26, floor_z + 0.26), (0.60, 0.34, 0.16), mech, collection, 0.006)
    add_box("CargoCrate_C", (cx + 1.28, -0.32, floor_z + 0.22), (0.32, 0.26, 0.12), warning, collection, 0.005)
    # A black lower floor plus a raised partial grating makes the well read as
    # two real depth planes. The open forward half still exposes the hold.
    add_box("CargoWell_ShadowFloor", (cx, 0.0, floor_z + 0.045),
            (hx - 0.10, 0.66, 0.020), mats["Material_Thruster"], collection, 0.003)
    grate_z = floor_z + 0.40
    for index in range(7 if detail == 0 else 4):
        gx = cx - hx + 0.28 + index * (1.20 / max(1, (6 if detail == 0 else 3)))
        add_box(f"CargoGrating_{index}", (gx, 0.0, grate_z),
                (0.030, 0.66, 0.018), mech, collection, 0.002)
    add_box("CargoGrating_RailP", (cx - hx + 0.88, -0.69, grate_z),
            (0.76, 0.028, 0.030), mech, collection, 0.003)
    add_box("CargoGrating_RailS", (cx - hx + 0.88, 0.69, grate_z),
            (0.76, 0.028, 0.030), mech, collection, 0.003)
    add_box("CargoWell_LipP", (cx, -0.86, DECK_Z + 0.075),
            (hx - 0.04, 0.060, 0.045), armor, collection, 0.005)
    add_box("CargoWell_LipS", (cx, 0.86, DECK_Z + 0.075),
            (hx - 0.04, 0.060, 0.045), armor, collection, 0.005)
    add_box("CargoGantry", (cx + 0.10, 0.0, DECK_Z - 0.10), (0.075, 0.80, 0.055), mech, collection, 0.005)
    for i, off in enumerate((-1.30, 1.30)):
        add_box(f"CargoHoist_{i}", (cx + off, 0.0, DECK_Z - 0.08), (0.055, 0.82, 0.042), mech, collection, 0.004)
    # Minority warning zone with real area: the well rim band and deck chevrons.
    add_box("WellBand_Port", (cx, -1.005, DECK_Z + 0.055), (hx + 0.14, 0.055, 0.032), warning, collection, 0.004)
    add_box("WellBand_Stbd", (cx, 1.005, DECK_Z + 0.055), (hx + 0.14, 0.055, 0.032), warning, collection, 0.004)
    for i, xm in enumerate((-2.55, 2.60)):
        add_box(f"DeckChevron_{i}", (xm, 0.0, DECK_Z + 0.030), (0.20, 0.72, 0.020), warning, collection, 0.004)

    # ---- dorsal load path -------------------------------------------------
    for sign, side in ((-1, "Port"), (1, "Starboard")):
        add_folded_sheet(
            f"Longeron_{side}",
            (4.20, sign * 0.74, DECK_Z + 0.005), (-3.20, sign * 0.70, DECK_Z + 0.015),
            (-3.20, sign * 0.92, DECK_Z + 0.020), (4.20, sign * 0.96, DECK_Z + 0.010),
            0.085, hull_aft, collection, 0.006,
        )
        add_folded_sheet(
            f"LongeronCap_{side}",
            (4.10, sign * 0.78, DECK_Z + 0.052), (-3.10, sign * 0.74, DECK_Z + 0.062),
            (-3.10, sign * 0.88, DECK_Z + 0.066), (4.10, sign * 0.92, DECK_Z + 0.056),
            0.030, mech, collection, 0.004,
        )
    add_box("SpineBeam", (-4.90, 0.0, DECK_Z + 0.075), (1.55, 0.155, 0.070), mech, collection, 0.005)
    for i, (xf, halfy) in enumerate(((3.55, 1.05), (-2.62, 1.12), (-6.20, 0.58))):
        add_box(f"Frame_{i}", (xf, 0.0, hull_crown(xf) + 0.035), (0.072, halfy, 0.075), mech, collection, 0.005)
    # Quiet, explicitly formed aft deck covers replace the single stretched
    # hull projection visible from the close/rear camera.
    for sign, side in ((-1, "Port"), (1, "Starboard")):
        add_folded_sheet(
            f"AftDeckCover_{side}",
            (-3.20, sign * 0.20, hull_crown(-3.20) + 0.025),
            (-6.70, sign * 0.18, hull_crown(-6.70) + 0.025),
            (-6.70, sign * 0.68, hull_crown(-6.70) + 0.018),
            (-3.20, sign * 0.72, hull_crown(-3.20) + 0.018),
            0.050, armor, collection, 0.006,
        )

    # ---- nacelle hardware -------------------------------------------------
    for sign, side, _nac in nacelles:
        y = NAC_Y_AFT * sign
        bill_specs = tuple((x, yc * sign, hw, hh, zc, flat, box, keel)
                           for x, yc, hw, hh, zc, flat, box, keel in BILL_STATIONS)
        loft_volume(f"Bill_{side}", bill_specs, nacelle_paint, collection, thick=0.070, dens=dens)
        add_box(f"BillLip_{side}", (-3.02, 1.44 * sign, 0.92), (0.085, 0.30, 0.115), warning, collection, 0.006)
        add_box(f"BillEdge_{side}", (-3.16, 1.44 * sign, 0.92), (0.075, 0.36, 0.150), mech, collection, 0.005)
        band = loft_volume(f"Collar_{side}", (
            (-6.86, y, 0.800, 0.945, 0.28, 0.06, 0.93, 0.09),
            (-7.44, y, 0.800, 0.945, 0.28, 0.06, 0.94, 0.08),
        ), armor, collection, thick=0.055, dens=dens)
        band.name = f"Collar_{side}"
        delete_faces_in_box(_nac, -6.85, -5.35, y - 0.30, y + 0.30, 0.60, 1.30, normal=None)
        add_box(f"PodSlotBack_{side}", (-6.10, y, 0.66), (0.75, 0.30, 0.030), armor, collection, 0.004)
        pod_fins = 5 if detail == 0 else 3
        for i in range(pod_fins):
            step = 1.30 / pod_fins
            add_box(f"PodFin_{side}_{i}", (-6.75 + (i + 0.5) * step, y, 0.80),
                    (0.024, 0.26, 0.13), ceramic, collection, 0.003)
        add_box(f"PodSlotRimF_{side}", (-5.32, y, 1.10), (0.055, 0.36, 0.055), mech, collection, 0.004)
        add_box(f"PodSlotRimA_{side}", (-6.88, y, 1.10), (0.055, 0.36, 0.055), mech, collection, 0.004)
        for rim_sign in (-1, 1):
            add_box(f"PodSlotRim_{side}_{rim_sign}", (-6.10, y + rim_sign * 0.33, 1.10),
                    (0.82, 0.055, 0.055), mech, collection, 0.004)
        add_throat_collar(side, -7.98, y, 0.28, 0.82, mats, collection, detail)
        add_hollow_bell(side, -6.50, y, 0.28, 0.62, mats, collection, detail)

        # Intake grille inside the cut in the outboard flank.
        gy = nacelle_flank(-4.55, 0.38, inset=0.04) * sign
        add_box(f"IntakeBack_{side}", (-4.55, gy - sign * 0.20, 0.38), (0.64, 0.030, 0.22), armor, collection, 0.004)
        blades = 5 if detail == 0 else (3 if detail == 1 else 0)
        for i in range(blades):
            add_box(f"IntakeBlade_{side}_{i}", (-4.55 + (i - (blades - 1) / 2) * 0.26, gy - sign * 0.05, 0.38),
                    (0.034, 0.055, 0.20), mech, collection, 0.003)
        add_box(f"IntakeRim_{side}", (-4.55, gy - sign * 0.02, 0.625), (0.70, 0.055, 0.038), mech, collection, 0.004)
        add_box(f"IntakeSill_{side}", (-4.55, gy - sign * 0.02, 0.135), (0.70, 0.055, 0.038), mech, collection, 0.004)

        add_winglet(f"Winglet_{side}", sign, mats, collection, detail, dens)

        # Bow cheek fairing carrying a recessed gun house.
        y_fore = hull_flank(6.95, 0.22, inset=-0.02)
        y_aft = hull_flank(5.30, 0.30, inset=-0.02)
        add_folded_sheet(
            f"BowCheek_{side}",
            (6.95, y_fore * sign, 0.02), (5.30, y_aft * sign, 0.08),
            (5.30, y_aft * sign, 0.46), (6.95, y_fore * sign, 0.36),
            0.070, hull, collection, 0.005,
        )
        gun_y = hull_flank(6.20, 0.10, inset=0.16)
        add_cylinder(f"GunHouse_{side}", (6.20, gun_y * sign, 0.10), 0.115, 1.20, mech, collection, 12, 0.006)
        add_cylinder(f"GunBarrel_{side}", (7.15, gun_y * sign, 0.10), 0.042, 0.86, armor, collection, 8, 0.004)

        # Painted beats, sunk into the skin so they cannot float.
        add_box(f"AccentFlank_{side}", (-5.60, nacelle_flank(-5.60, 0.12, inset=0.03) * sign, 0.12),
                (0.95, 0.030, 0.115), accent, collection, 0.004)
        add_box(f"AccentBow_{side}", (6.05, hull_flank(6.05, 0.26, inset=0.03) * sign, 0.26),
                (0.70, 0.030, 0.085), accent, collection, 0.004)

        if detail <= 1:
            add_deck_radiator(f"{side}", -5.45, -3.45, 0.26 * sign, 0.64 * sign, DECK_Z, mats, collection,
                              fins=9 if detail == 0 else 5)
            add_cylinder(f"RearGun_{side}", (-5.55, 0.95 * sign, hull_crown(-5.55) + 0.20), 0.055, 0.70,
                         mech, collection, 8, 0.004)
            add_box(f"RearGunMount_{side}", (-5.90, 0.95 * sign, hull_crown(-5.90) + 0.09),
                    (0.14, 0.14, 0.095), armor, collection, 0.004)
            add_rcs_cluster(side, (-1.20, hull_flank(-1.20, 0.10, inset=0.10) * sign, 0.10),
                            mats, collection, sign=sign)
        if detail == 0:
            add_curve_hose(f"Hose_{side}", [
                (1.30, hull_flank(1.30, 0.70, 0.10) * sign, 0.70),
                (-1.60, hull_flank(-1.60, 0.70, 0.10) * sign, 0.70),
                (-3.60, nacelle_flank(-3.60, 0.62, 0.10) * sign, 0.62),
                (-6.30, nacelle_flank(-6.30, 0.52, 0.10) * sign, 0.52),
            ], mech, collection, 0.020)
            add_box(f"HoseFit_{side}_0", (1.30, hull_flank(1.30, 0.70, 0.06) * sign, 0.70),
                    (0.045, 0.045, 0.045), mech, collection, 0.003)
            add_box(f"HoseFit_{side}_1", (-6.30, nacelle_flank(-6.30, 0.52, 0.06) * sign, 0.52),
                    (0.045, 0.045, 0.045), mech, collection, 0.003)

    # ---- transom: open the actual aft split, then fit one rounded formed rim
    # and a recessed rounded backplate. The previous delete targeted `body`,
    # leaving the aft cap closed beneath a rectangular box frame.
    transom_shell = body_aft if body_aft is not None else body
    removed = delete_faces_in_box(
        transom_shell, -7.98, -7.68, -0.72, 0.72, -0.28, 0.84, normal=None)
    print(f"transom: removed {removed} aft-shell faces")
    back = loft_from_rings("TransomBack", [
        superellipse_ring(-7.55, 0.0, 0.28, 0.66, 0.45, 32),
        superellipse_ring(-7.48, 0.0, 0.28, 0.66, 0.45, 32),
    ], armor, collection, 0.005, cap=True)
    back["spacefaceRole"] = "machinery_backplate"
    add_axial_annulus(
        "TransomFormedRim", -7.84, 0.0, 0.28,
        0.80, 0.58, 0.66, 0.44, 0.18,
        mech, collection, sides=32, bevel=0.006, ring_fn=superellipse_ring)
    fins = 9 if detail == 0 else (5 if detail == 1 else 0)
    for i in range(fins):
        add_box(f"TransomFin_{i}", (-7.72, -0.58 + i * (1.16 / max(1, fins - 1)), 0.28),
                (0.024, 0.044, 0.48), ceramic, collection, 0.003)
    if detail <= 1:
        add_box("TransomHeaderT", (-7.66, 0.0, 0.70), (0.032, 0.62, 0.032), mech, collection, 0.003)
        add_box("TransomHeaderB", (-7.66, 0.0, -0.14), (0.032, 0.62, 0.032), mech, collection, 0.003)

    # ---- keel, ventral, service ------------------------------------------
    add_folded_sheet(
        "Keel_Strake",
        (3.10, -0.26, hull_keel(3.10) + 0.02), (-5.40, -0.26, hull_keel(-5.40) + 0.02),
        (-5.40, 0.26, hull_keel(-5.40) + 0.02), (3.10, 0.26, hull_keel(3.10) + 0.02),
        0.085, hull_aft, collection, 0.006,
    )
    add_box("VentralHatch", (-0.30, 0.0, hull_keel(-0.30) + 0.03), (0.86, 0.56, 0.045), armor, collection, 0.005)
    add_box("VentralHatchRim", (-0.30, 0.0, hull_keel(-0.30) + 0.06), (0.94, 0.64, 0.022), mech, collection, 0.004)
    if detail <= 1:
        add_sensor_dish("Dorsal", (2.85, 0.42, DECK_Z + 0.16), mats, collection)
        add_cylinder("Comm_Mast", (-3.05, -0.88, DECK_Z + 0.34), 0.042, 0.62, mech, collection, 8, 0.004, rot=(0, 0, 0))
        add_box("Comm_Head", (-3.05, -0.88, DECK_Z + 0.67), (0.075, 0.075, 0.045), armor, collection, 0.004)
    # Foredeck: raised working plate, capstan, and a service hatch between the
    # greenhouse and the well so the forward third is not bare paint.
    add_folded_sheet(
        "Foredeck_Plate",
        (7.05, -0.42, hull_crown(7.05) + 0.010), (6.40, -0.66, hull_crown(6.40) + 0.012),
        (6.40, 0.66, hull_crown(6.40) + 0.012), (7.05, 0.42, hull_crown(7.05) + 0.010),
        0.055, hull, collection, 0.005,
    )
    add_box("Foredeck_Bitt", (6.72, 0.0, hull_crown(6.72) + 0.075), (0.10, 0.30, 0.070), mech, collection, 0.005)
    add_box("MiningHead", (7.42, 0.0, -0.06), (0.30, 0.20, 0.16), mech, collection, 0.006)
    add_cylinder("MiningLance", (7.86, 0.0, -0.06), 0.055, 0.60, armor, collection, 10, 0.004)
    add_box("Hatch_Fore_Well", (3.20, 0.0, DECK_Z - 0.02), (0.34, 0.42, 0.030), armor, collection, 0.004)
    add_box("Hatch_Fore_Rim", (3.20, 0.0, DECK_Z + 0.020), (0.40, 0.48, 0.026), mech, collection, 0.004)
    add_box("Hatch_Fore_Hinge", (2.84, 0.0, DECK_Z + 0.030), (0.036, 0.34, 0.026), mech, collection, 0.003)

    # MTX-14 / MTX-60: one authored off-centre repair, not random cubes.
    add_box("Repair_Patch", (2.20, -0.76, DECK_Z + 0.030), (0.42, 0.26, 0.022), warning, collection, 0.004)
    add_box("Repair_Strap", (2.20, -0.76, DECK_Z + 0.056), (0.44, 0.28, 0.012), mech, collection, 0.003)

    # ---- join, unwrap, size the maps from what was actually built ---------
    mesh_objects = [obj for obj in collection.objects if obj.type == "MESH"]
    for obj in mesh_objects:
        obj.parent = root
    groups = {}
    for obj in mesh_objects:
        name = obj.data.materials[0].name if obj.data.materials else "Material_Hull"
        groups.setdefault(name, []).append(obj)

    merged = []
    texel_report = []
    for material_name, objects in sorted(groups.items()):
        objects = [obj for obj in objects if obj.data and len(obj.data.vertices) > 0]
        if not objects:
            continue
        try:
            bpy.ops.object.mode_set(mode="OBJECT")
        except Exception:
            pass
        bpy.ops.object.select_all(action="DESELECT")
        for obj in objects:
            apply_modifiers(obj)
            obj.select_set(True)
        active = objects[0]
        bpy.context.view_layer.objects.active = active
        if len(objects) > 1:
            bpy.ops.object.join()
        base_name = material_name.split(".")[0]
        active.name = f"LOD{lod}_{base_name.replace('Material_', '')}"
        active.parent = root
        unwrap_object(active)
        tri = active.modifiers.new("ExportTriangulate", "TRIANGULATE")
        tri.quad_method = "BEAUTY"
        bpy.context.view_layer.objects.active = active
        active.select_set(True)
        bpy.ops.object.modifier_apply(modifier=tri.name)

        material = active.data.materials[0]
        role = material.get("spacefaceRole", "hull")
        rgb = MATERIAL_SPECS[base_name][0]
        uv_scale, area_3d, area_uv = measure_uv_scale(active)
        size = TEXEL_MIN_SIZE[lod] if quick else choose_map_size(uv_scale, lod)
        px_per_m = size * uv_scale
        prefix = base_name.replace("Material_", "").lower()
        variant = PAINT_VARIANT.get(base_name, 0)
        maps = role_maps(role, rgb, size, prefix, max(px_per_m, 16.0), lod, variant)
        wire_maps(material, maps[:3])
        texel_report.append({
            "material": base_name,
            "areaM2": round(area_3d, 3),
            "uvCoverage": round(area_uv, 4),
            "uvUtilisation": round(area_uv, 4),
            "baseColorSize": size,
            "ormNormalSize": maps[3],
            "texelDensityPxPerM": round(px_per_m, 1),
        })
        if lod == 0 and not quick and base_name in PAINT_VARIANT:
            export_uv_layout(active, FAMILY / "evidence" / "drifter" / "cycles"
                             / f"cycle_{CYCLE:02d}" / f"uv0_layout_{prefix}.png")
        if lod == 0 and not quick and base_name in {
            "Material_Hull", "Material_Armor", "Material_Mechanical", "Material_Ceramic",
        }:
            multiply_ao_into_albedo(maps[0], bake_ao_array(active))
        merged.append(active)

    for name, loc in sockets().items():
        add_empty(name, loc, collection, root)

    bm = bmesh.new()
    for point in [
        (7.95, 0, 0.05), (0.2, -2.10, 0.55), (0.2, 2.10, 0.55),
        (-8.10, -2.66, 0.28), (-8.10, 2.66, 0.28),
        (-3.9, -3.95, 0.05), (-3.9, 3.95, 0.05),
        (2.4, -1.5, -1.00), (2.4, 1.5, -1.00),
        (-5.5, 0, 1.28), (5.4, 0, 1.58),
    ]:
        bm.verts.new(point)
    bm.verts.ensure_lookup_table()
    bmesh.ops.convex_hull(bm, input=list(bm.verts), use_existing_faces=False)
    collision_mesh = bpy.data.meshes.new("COLLISION_HULL_MESH")
    bm.to_mesh(collision_mesh)
    bm.free()
    collision = bpy.data.objects.new("COLLISION_HULL", collision_mesh)
    collection.objects.link(collision)
    collision.parent = root
    collision.hide_render = True
    collision["collision"] = True
    collision["nonRender"] = True

    def tris(obj):
        return sum(max(0, len(poly.vertices) - 2) for poly in obj.data.polygons)

    painted = ("_Hull", "_Hull_Aft", "_Nacelle")
    hull_tris = sum(tris(obj) for obj in merged if obj.name.endswith(painted))
    return collection, {
        "lod": lod,
        "triangles": sum(tris(obj) for obj in merged),
        "hullTriangles": hull_tris,
        "draws": len(merged),
        "materials": sorted({name.split(".")[0] for name in groups}),
        "panelInsets": panels,
        "dorsalPanelSeams": dorsal_panels,
        "texelDensity": texel_report,
    }


def export_lod(collection, lod, out=None):
    out = out or FAMILY / "source" / "wholeships" / f"drifter_production_v1_lod{lod}.glb"
    out.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in collection.all_objects:
        obj.hide_viewport = False
        obj.hide_set(False)
        obj.select_set(True)
    tmp = out.with_suffix(".tmp.glb")
    bpy.ops.export_scene.gltf(
        filepath=str(tmp), export_format="GLB", use_selection=True, export_apply=True,
        export_yup=True, export_extras=True, export_animations=False,
        export_materials="EXPORT", export_texcoords=True, export_normals=True,
        export_tangents=True, export_image_format="AUTO",
    )
    for attempt in range(6):
        try:
            if out.exists():
                out.unlink()
            shutil.move(str(tmp), str(out))
            break
        except OSError:
            if attempt == 5:
                raise
            import time
            time.sleep(0.35 * (attempt + 1))
    return out


# --------------------------------------------------------------------------
# Evidence. Every still comes from the exported GLB, never the working scene.
# --------------------------------------------------------------------------

def look_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def projected_bounds(scene, camera, meshes):
    from bpy_extras.object_utils import world_to_camera_view
    bpy.context.view_layer.update()
    xs, ys = [], []
    for obj in meshes:
        for corner in obj.bound_box:
            ndc = world_to_camera_view(scene, camera, obj.matrix_world @ Vector(corner))
            xs.append(ndc.x)
            ys.append(ndc.y)
    if not xs:
        return (0.0, 0.0, 0.0, 0.0)
    return (min(xs), max(xs), min(ys), max(ys))


def frame_width_fraction(scene, camera, meshes):
    box = projected_bounds(scene, camera, meshes)
    return round(box[1] - box[0], 4)


def write_crop(src, dst, ndc_box, pad=0.04):
    """Diagnostic only. Same chase render, cropped so the authoring agent can
    inspect at original resolution. It cannot stand in for one of the three."""
    img = bpy.data.images.load(str(src))
    img.colorspace_settings.name = "Non-Color"
    width, height = img.size
    buf = np.empty(width * height * 4, dtype=np.float32)
    img.pixels.foreach_get(buf)
    px = buf.reshape(height, width, 4)
    x0 = max(0, int((ndc_box[0] - pad) * width))
    x1 = min(width, int((ndc_box[1] + pad) * width))
    y0 = max(0, int((ndc_box[2] - pad) * height))
    y1 = min(height, int((ndc_box[3] + pad) * height))
    if x1 - x0 < 8 or y1 - y0 < 8:
        bpy.data.images.remove(img)
        return None
    crop = px[y0:y1, x0:x1]
    out = bpy.data.images.new("SF_CROP", width=crop.shape[1], height=crop.shape[0], alpha=True)
    out.colorspace_settings.name = "Non-Color"
    out.pixels.foreach_set(np.ascontiguousarray(crop.reshape(-1), dtype=np.float32))
    out.filepath_raw = str(dst)
    out.file_format = "PNG"
    out.save()
    bpy.data.images.remove(out)
    bpy.data.images.remove(img)
    return dst


def override_material(meshes, factory):
    backups = {}
    for obj in meshes:
        backups[obj.name] = [slot.material for slot in obj.material_slots]
        material = factory(obj)
        if obj.material_slots:
            obj.material_slots[0].material = material
        else:
            obj.data.materials.append(material)
    return backups


def restore_materials(meshes, backups):
    for obj in meshes:
        for index, material in enumerate(backups.get(obj.name, [])):
            if index < len(obj.material_slots):
                obj.material_slots[index].material = material


def clay_factory(obj):
    material = bpy.data.materials.new(f"CLAY_{obj.name}")
    material.use_nodes = True
    tree = material.node_tree
    tree.nodes.clear()
    out = tree.nodes.new("ShaderNodeOutputMaterial")
    bsdf = tree.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = (0.46, 0.46, 0.47, 1)
    bsdf.inputs["Metallic"].default_value = 0.0
    bsdf.inputs["Roughness"].default_value = 0.58
    tree.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return material


ID_COLOURS = {
    "hullaft": (0.55, 0.63, 0.66),
    "nacelle": (0.48, 0.58, 0.62),
    "hull": (0.62, 0.70, 0.72), "armor": (0.08, 0.13, 0.15), "mechanical": (0.85, 0.85, 0.88),
    "canopy": (0.03, 0.10, 0.14), "accent": (0.05, 0.70, 0.85), "warning": (0.95, 0.42, 0.05),
    "ceramic": (0.80, 0.70, 0.48), "thruster": (0.20, 0.06, 0.02), "radiator": (0.35, 0.22, 0.12),
}


def id_factory(obj):
    material = bpy.data.materials.new(f"ID_{obj.name}")
    material.use_nodes = True
    tree = material.node_tree
    tree.nodes.clear()
    out = tree.nodes.new("ShaderNodeOutputMaterial")
    emit = tree.nodes.new("ShaderNodeEmission")
    colour = (0.4, 0.4, 0.4)
    lowered = obj.name.lower()
    for key, value in ID_COLOURS.items():
        if lowered.endswith(key):
            colour = value
            break
    emit.inputs["Color"].default_value = (*colour, 1)
    tree.links.new(emit.outputs["Emission"], out.inputs["Surface"])
    return material


def map_isolation_factory(needle):
    def factory(obj):
        source = obj.data.materials[0] if obj.data.materials else None
        image = None
        if source and source.node_tree:
            image = next((n.image for n in source.node_tree.nodes
                          if n.type == "TEX_IMAGE" and n.image and needle in n.image.name), None)
        material = bpy.data.materials.new(f"ISO_{needle}_{obj.name}")
        material.use_nodes = True
        tree = material.node_tree
        tree.nodes.clear()
        out = tree.nodes.new("ShaderNodeOutputMaterial")
        emit = tree.nodes.new("ShaderNodeEmission")
        tree.links.new(emit.outputs["Emission"], out.inputs["Surface"])
        if image is not None:
            tex = tree.nodes.new("ShaderNodeTexImage")
            tex.image = image
            uv = tree.nodes.new("ShaderNodeUVMap")
            uv.uv_map = obj.data.uv_layers[0].name if obj.data.uv_layers else "UVMap"
            tree.links.new(uv.outputs["UV"], tex.inputs["Vector"])
            tree.links.new(tex.outputs["Color"], emit.inputs["Color"])
        else:
            emit.inputs["Color"].default_value = (0.15, 0.15, 0.15, 1)
        return material
    return factory


def render_cycle_from_glb(glb_path, out_dir, quick=False):
    import render_glb_chase_stills as RG

    reset_scene()
    bpy.ops.import_scene.gltf(filepath=str(glb_path))
    RG.hide_non_lod0()
    meshes = RG.visible_meshes()
    if not meshes:
        raise RuntimeError("no visible meshes imported from the exported GLB")
    low, high, centre, size = RG.mesh_bounds(meshes)
    focus = tuple(centre)
    light_scale = max(float(max(size)), 0.5) / RG.HORNET_AUTHORED_LENGTH_M
    camera = RG.setup_studio(focus, light_scale)
    scene = bpy.context.scene
    out_dir.mkdir(parents=True, exist_ok=True)

    poses = {
        "play_chase": (DISTANCE_DEFAULT, 0.0),
        "play_chase_abeam": (DISTANCE_DEFAULT, 90.0),
        "play_chase_close": (DISTANCE_CLOSE, 0.0),
    }

    # Primary set at 4:3. sensor_fit is VERTICAL, so the camera law - 50 deg
    # vertical FOV, 60 deg tilt, D=144/58 - is unchanged and only the
    # horizontal extent differs. 4:3 is what puts a 16 m hull inside the
    # 8-22% band the review workflow requires.
    scene.render.resolution_x = 2400
    scene.render.resolution_y = 1800
    render_cycle_chase_stills(camera, out_dir, focus=focus)
    fractions = {}
    boxes = {}
    for name, (distance, heading) in poses.items():
        apply_chase_camera(camera, distance=distance, heading_deg=heading, focus=focus)
        boxes[name] = projected_bounds(scene, camera, meshes)
        fractions[f"{name}@2400x1800"] = round(boxes[name][1] - boxes[name][0], 4)
    for name in ("play_chase", "play_chase_close"):
        write_crop(out_dir / f"{name}.png", out_dir / f"diagnostic_{name}_crop.png", boxes[name])
    # MTX-55: the ship itself downscaled to 40 px and 120 px wide.
    tight = out_dir / "_silhouette_source.png"
    if write_crop(out_dir / "play_chase.png", tight, boxes["play_chase"], pad=0.0):
        for stamp in (40, 120):
            img = bpy.data.images.load(str(tight))
            img.colorspace_settings.name = "Non-Color"
            width, height = img.size
            img.scale(stamp, max(1, int(round(height * stamp / float(width)))))
            img.filepath_raw = str(out_dir / f"silhouette_{stamp}px.png")
            img.file_format = "PNG"
            img.save()
            bpy.data.images.remove(img)
        tight.unlink()

    clay_targets = RG.clay_meshes(meshes)
    backups = override_material(clay_targets, clay_factory)
    render_chase_still(camera, out_dir / "clay_play_chase.png", distance=DISTANCE_DEFAULT, heading_deg=0.0, focus=focus)
    render_chase_still(camera, out_dir / "clay_play_chase_close.png", distance=DISTANCE_CLOSE, heading_deg=0.0, focus=focus)
    write_crop(out_dir / "clay_play_chase_close.png", out_dir / "diagnostic_clay_close_crop.png", boxes["play_chase_close"])
    write_crop(out_dir / "clay_play_chase.png", out_dir / "diagnostic_clay_chase_crop.png", boxes["play_chase"])
    restore_materials(clay_targets, backups)

    result = {"stills": str(out_dir), "frameWidthFraction": fractions,
              "bounds": [round(float(v), 3) for v in size]}
    if quick:
        return result

    # Live 16:9 aspect, matching the sanctioned render_glb_chase_stills framing.
    live = out_dir / "live_aspect_1600x900"
    live.mkdir(parents=True, exist_ok=True)
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 900
    render_cycle_chase_stills(camera, live, focus=focus)
    for name, (distance, heading) in poses.items():
        apply_chase_camera(camera, distance=distance, heading_deg=heading, focus=focus)
        fractions[f"{name}@1600x900"] = frame_width_fraction(scene, camera, meshes)
    scene.render.resolution_x = 2400
    scene.render.resolution_y = 1800

    # Diagnostics. None of these closes a row; they sit beside the three.
    for needle, path in (("orm", "orm_isolation.png"), ("normal", "normal_isolation.png")):
        backups = override_material(meshes, map_isolation_factory(needle))
        render_chase_still(camera, out_dir / path, distance=DISTANCE_CLOSE, heading_deg=0.0, focus=focus)
        restore_materials(meshes, backups)
    backups = override_material(meshes, id_factory)
    render_chase_still(camera, out_dir / "id_or_material_id.png", distance=DISTANCE_CLOSE, heading_deg=0.0, focus=focus)
    restore_materials(meshes, backups)

    # Grazing light on the close chase camera: one low key, hard shadow.
    for obj in list(scene.objects):
        if obj.type == "LIGHT":
            bpy.data.objects.remove(obj, do_unlink=True)
    graze_data = bpy.data.lights.new("Graze", "AREA")
    graze_data.energy = 1100 * light_scale
    graze_data.size = 3.0 * light_scale
    graze = bpy.data.objects.new("Graze", graze_data)
    scene.collection.objects.link(graze)
    graze.location = Vector(focus) + Vector((9.5 * light_scale, -7.0 * light_scale, 1.4 * light_scale))
    look_at(graze, focus)
    render_chase_still(camera, out_dir / "grazing_close.png", distance=DISTANCE_CLOSE, heading_deg=0.0, focus=focus)

    # Drive-rear diagnostic: MTX-08 proof that the throats are dark wells.
    camera = RG.setup_studio(focus, light_scale)
    scene.render.resolution_x = 2000
    scene.render.resolution_y = 1500
    camera.data.lens_unit = "FOV"
    camera.data.sensor_fit = "VERTICAL"
    camera.data.angle = math.radians(40)
    camera.location = Vector((low.x - 8.0, -3.2, 1.8))
    look_at(camera, (low.x + 1.4, 0.0, 0.25))
    scene.render.filepath = str(out_dir / "drive_rear.png")
    bpy.ops.render.render(write_still=True)
    return result


def main():
    FAMILY.mkdir(parents=True, exist_ok=True)
    reset_scene()
    if FORM_ONLY:
        print("drifter form-only: LOD0 clay + chase, no bake, scratch export")
        mats = create_materials()
        collection, report = build_lod(0, mats, quick=True)
        out = FAMILY / "evidence" / "drifter" / "formcheck" / "formcheck_lod0.glb"
        export_lod(collection, 0, out=out)
        stills = render_cycle_from_glb(out, out.parent, quick=True)
        print(json.dumps({
            "ok": True, "formOnly": True,
            "triangles": report["triangles"], "hullTriangles": report["hullTriangles"],
            "draws": report["draws"], "panelInsets": report["panelInsets"],
            "dorsalPanelSeams": report["dorsalPanelSeams"], **stills,
        }, indent=2))
        return 0

    print(f"drifter cycle {CYCLE}: per-material map sizing, floor {TEXEL_FLOOR_PX_PER_M}")
    reports = []
    lod_paths = {}
    for lod in (0, 1, 2):
        reset_scene()
        mats = create_materials()
        collection, report = build_lod(lod, mats)
        output = export_lod(collection, lod)
        report.update({
            "path": str(output.relative_to(FAMILY)).replace("\\", "/"),
            "bytes": output.stat().st_size,
            "sha256": sha256(output),
        })
        if report["hullTriangles"] < 800:
            raise RuntimeError(f"drifter lod{lod} hull {report['hullTriangles']} < 800")
        if lod == 0 and report["hullTriangles"] < PRIOR_HULL_TRIANGLES:
            raise RuntimeError(
                f"drifter lod0 hull {report['hullTriangles']} < prior cycle {PRIOR_HULL_TRIANGLES}")
        lod_paths[lod] = output
        reports.append(report)

    stills = render_cycle_from_glb(
        lod_paths[0], FAMILY / "evidence" / "drifter" / "cycles" / f"cycle_{CYCLE:02d}")
    # LOD1/LOD2 maps are packed in their GLBs; the source texture folder keeps
    # the LOD0 authored set only.
    for stale in TEX_DIR.glob("*_lod*.png"):
        stale.unlink()

    report = {
        "schema": "spaceface.drifterMtx.cycle.v1",
        "shipId": "drifter",
        "cycle": CYCLE,
        "lods": reports,
        "lodTriangleRatio": {
            "lod1/lod0": round(reports[1]["triangles"] / max(1, reports[0]["triangles"]), 3),
            "lod2/lod0": round(reports[2]["triangles"] / max(1, reports[0]["triangles"]), 3),
        },
        "boundsMetres": stills["bounds"],
        "stills": str(Path(stills["stills"]).relative_to(FAMILY)).replace("\\", "/"),
        "frameWidthFraction": stills["frameWidthFraction"],
    }
    (FAMILY / "evidence" / "drifter").mkdir(parents=True, exist_ok=True)
    (FAMILY / "evidence" / "drifter" / f"cycle_{CYCLE:02d}.json").write_text(
        json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "ok": True,
        "cycle": CYCLE,
        "tris": [r["triangles"] for r in reports],
        "hull": [r["hullTriangles"] for r in reports],
        "bytes": [r["bytes"] for r in reports],
        "frameWidthFraction": stills["frameWidthFraction"],
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
