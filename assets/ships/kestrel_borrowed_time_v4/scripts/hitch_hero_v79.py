"""Hitch hero V79 / cycle 70: rolled overlapping cone armor with hatches.

Cycle 69 put four planar cards on the upper cone. Store-shot still reads
a sealed gray wedge because those cards are flush and do not follow the
cone. Hide them. Rebuild as rolled overlapping courses on the same upper
face, with hat-section seams and inspection lids. Stay outboard of the
canopy and casemate. No hull boolean. No pack hats.
"""
from __future__ import annotations

import math

import bpy

from hitch_hero_v24 import _stamp
from hitch_hero_v78 import apply_hitch_hero_v78
from hitch_polish_v8 import _folded_plate
from material_truth_v6 import _finish, _materials, _mesh_object, _root, _source

PASS_ID = "kestrel-hitch-hero-v79"
COLLECTION_NAME = "KESTREL_V79_ROLLED_CONE"
PREFIX = "V79_"
HIDE_PREFIXES = (
    "V78_Plate_",
    "V78_Seam_",
)

X_AFT = 2.18
X_NOSE = 10.12
SEGMENTS_Y = 5
THICKNESS = 0.070

# Overlapping stations along the upper cone. 0.32 m lap so edges cast.
COURSES = (
    ("Aft", 2.18, 3.58),
    ("AftMid", 3.26, 4.66),
    ("Mid", 4.34, 5.74),
    ("MidFore", 5.42, 6.82),
    ("Fore", 6.50, 7.90),
    ("ForeOut", 7.58, 8.98),
    ("Nose", 8.66, 10.12),
)

# Inspection lids sit on the course, not on the casemate or glass.
HATCHES = (
    ("Aft", 2.78, 0.40),
    ("AftMid", 3.86, 0.48),
    ("Mid", 4.94, 0.38),
    ("MidFore", 6.02, 0.46),
    ("Fore", 7.10, 0.36),
    ("ForeOut", 8.18, 0.44),
    ("Nose", 9.26, 0.38),
)


def _collection():
    source = _source()
    prior = bpy.data.collections.get(COLLECTION_NAME)
    if prior is not None:
        for obj in list(prior.all_objects):
            data = obj.data
            obj_type = obj.type
            bpy.data.objects.remove(obj, do_unlink=True)
            if data is not None and getattr(data, "users", 1) == 0 and obj_type == "MESH":
                bpy.data.meshes.remove(data)
        for parent in bpy.data.collections:
            if prior.name in parent.children:
                parent.children.unlink(prior)
        if prior.name in bpy.context.scene.collection.children:
            bpy.context.scene.collection.children.unlink(prior)
        bpy.data.collections.remove(prior)
    collection = bpy.data.collections.new(COLLECTION_NAME)
    source.children.link(collection)
    return collection


def _hide_planar_cards():
    hidden = []
    for obj in bpy.data.objects:
        name = obj.name or ""
        if any(name.startswith(prefix) for prefix in HIDE_PREFIXES):
            obj.hide_render = True
            obj.hide_set(True)
            hidden.append(name)
    return hidden


def _section(u):
    """Upper-cone section at 0=aft, 1=nose. y stays outboard of canopy/casemate."""
    u = max(0.0, min(1.0, u))
    y_in = 1.34 - 0.18 * u
    if u < 0.64:
        y_in = max(y_in, 1.30)
    y_out = 1.80 - 0.34 * u
    z_in = 2.04 - 0.52 * u
    z_out = 1.58 - 0.48 * u
    return y_in, y_out, z_in, z_out


def _cone_point(x, t, sign):
    """t=0 inboard/high, t=1 outboard/lower. Returns y, z, ny, nz."""
    u = (x - X_AFT) / (X_NOSE - X_AFT)
    y_in, y_out, z_in, z_out = _section(u)
    y = y_in + (y_out - y_in) * t
    z = z_in + (z_out - z_in) * t + 0.040 * math.sin(math.pi * t)
    dy = y_out - y_in
    dz = z_out - z_in
    ny, nz = -dz, dy
    length = math.hypot(ny, nz) or 1.0
    return y * sign, z, (ny / length) * sign, nz / length


def _rolled_course(collection, name, x0, x1, sign, thickness, material, bill, function):
    half = float(thickness) * 0.5
    verts = []
    for x in (x0, x1):
        for step in range(SEGMENTS_Y + 1):
            t = step / SEGMENTS_Y
            y, z, ny, nz = _cone_point(x, t, sign)
            verts.append((x, y + ny * half, z + nz * half))
        for step in range(SEGMENTS_Y + 1):
            t = step / SEGMENTS_Y
            y, z, ny, nz = _cone_point(x, t, sign)
            verts.append((x, y - ny * half, z - nz * half))
    ring = SEGMENTS_Y + 1
    faces = []
    for i in range(SEGMENTS_Y):
        faces.append((i, i + 1, 2 * ring + i + 1, 2 * ring + i))
        faces.append((ring + i + 1, ring + i, 3 * ring + i, 3 * ring + i + 1))
        faces.append((i, ring + i, ring + i + 1, i + 1))
        faces.append((2 * ring + i + 1, 3 * ring + i + 1, 3 * ring + i, 2 * ring + i))
    faces.append((0, ring, 3 * ring, 2 * ring))
    faces.append((SEGMENTS_Y, 2 * ring + SEGMENTS_Y, 3 * ring + SEGMENTS_Y, ring + SEGMENTS_Y))
    obj = _mesh_object(collection, name, verts, faces)
    return _stamp(_finish(obj, material, bill, function, bevel=0.005, detail=1))


def _hatch(collection, name, x, t, sign, materials):
    hx, ht = 0.28, 0.11
    armor = materials["armor"]
    steel = materials["service_steel"]
    lift = 0.038
    xs = (x - hx, x + hx, x + hx, x - hx)
    ts = (t - ht, t - ht, t + ht, t + ht)
    frame_pts = []
    for xi, ti in zip(xs, ts):
        y, z, ny, nz = _cone_point(xi, ti, sign)
        frame_pts.append((xi, y + ny * lift, z + nz * lift))
    objects = [
        _folded_plate(
            collection, f"{name}_Frame",
            frame_pts[0], frame_pts[1], frame_pts[2], frame_pts[3],
            0.034, steel, "structural_metal",
            "upper-cone inspection frame",
        ),
    ]
    inner = []
    inner_xs = (x - hx * 0.62, x + hx * 0.62, x + hx * 0.62, x - hx * 0.62)
    inner_ts = (t - ht * 0.58, t - ht * 0.58, t + ht * 0.58, t + ht * 0.58)
    for xi, ti in zip(inner_xs, inner_ts):
        y, z, ny, nz = _cone_point(xi, ti, sign)
        inner.append((xi, y + ny * (lift - 0.010), z + nz * (lift - 0.010)))
    objects.append(_folded_plate(
        collection, f"{name}_Lid",
        inner[0], inner[1], inner[2], inner[3],
        0.040, armor, "armor_plate",
        "upper-cone inspection lid",
    ))
    return objects


def _seam(collection, name, x, sign, materials):
    steel = materials["service_steel"]
    t0, t1 = 0.06, 0.94
    a = _cone_point(x - 0.018, t0, sign)
    b = _cone_point(x + 0.018, t0, sign)
    c = _cone_point(x + 0.018, t1, sign)
    d = _cone_point(x - 0.018, t1, sign)
    lift = 0.042
    pts = []
    for point, xi in ((a, x - 0.018), (b, x + 0.018), (c, x + 0.018), (d, x - 0.018)):
        y, z, ny, nz = point
        pts.append((xi, y + ny * lift, z + nz * lift))
    return _folded_plate(
        collection, name,
        pts[0], pts[1], pts[2], pts[3],
        0.032, steel, "structural_metal",
        "upper-cone standing seam",
    )


def _side_armor(collection, materials, sign, side):
    armor = materials["armor"]
    objects = []
    for name, x0, x1 in COURSES:
        objects.append(_rolled_course(
            collection, f"{PREFIX}Course_{side}_{name}",
            x0, x1, sign, THICKNESS, armor, "armor_plate",
            f"{side.lower()} {name.lower()} rolled upper-cone course",
        ))
        if name != "Nose":
            objects.append(_seam(
                collection, f"{PREFIX}Seam_{side}_{name}",
                x1 - 0.04, sign, materials,
            ))
    for name, x, t in HATCHES:
        objects.extend(_hatch(
            collection, f"{PREFIX}Hatch_{side}_{name}",
            x, t, sign, materials,
        ))
    return objects


def apply_hitch_hero_v79() -> dict:
    prior = apply_hitch_hero_v78()
    collection = _collection()
    materials = _materials()
    hidden = _hide_planar_cards()
    objects = []
    objects.extend(_side_armor(collection, materials, -1.0, "Port"))
    objects.extend(_side_armor(collection, materials, 1.0, "Starboard"))
    report = {
        "schema": "spaceface.hitchHero.v79",
        "passId": PASS_ID,
        "method": "rolled overlapping upper-cone courses with hatches and standing seams",
        "priorPass": "v78",
        "hiddenDonors": hidden,
        "objectsAdded": len(objects),
        "objectNames": [obj.name for obj in objects],
        "componentReference": "kestrel_midship_material_truth_reference_v1.png",
    }
    _root()["hitchHeroPassV79"] = {
        "passId": PASS_ID,
        "objectsAdded": int(len(objects)),
        "hiddenDonors": hidden,
    }
    return report
