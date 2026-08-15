"""Hitch hero V72 / cycle 63: rolled shell courses, not bilinear cards.

Cycles 58-62 kept stacking flat four-corner plates. Hide those flats.
Build each course as a thick cylindrical shell segment so the strip
actually rolls toward the well. Leave the mid hatch clear.
No hull boolean. No pack hats. No soap boxes.
"""
from __future__ import annotations

import math

import bpy

from hitch_hero_v24 import _stamp
from hitch_hero_v71 import apply_hitch_hero_v71
from hitch_polish_v8 import _folded_plate
from material_truth_v6 import _finish, _materials, _mesh_object, _root, _source

PASS_ID = "kestrel-hitch-hero-v72"
COLLECTION_NAME = "KESTREL_V72_ROLLED_SHELL"
PREFIX = "V72_"
HIDE_PREFIXES = (
    "V69_Bed_",
    "V70_Shingle_",
    "V70_Lap_",
    "V71_Lid_",
    "V71_Strap_",
    "V71_Mark_",
)

# Same stations as the shingles. Gap around the V61 hatch at x=-1.55.
COURSES = (
    ("Aft", -3.92, -2.52),
    ("MidAft", -2.62, -1.92),
    ("MidFore", -1.18, -0.40),
    ("ForeIn", -0.50, 0.34),
    ("ForeOut", 0.24, 1.08),
)

# Large-radius cylinder in YZ so the strip rolls without dropping into the well.
ROLL_RADIUS = 6.44
ROLL_AXIS_Z = -4.265
Y_IN = 0.44
Y_OUT = 0.84
SEGMENTS = 6
THICKNESS = 0.038


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


def _hide_flat_cards():
    hidden = []
    for obj in bpy.data.objects:
        name = obj.name or ""
        if any(name.startswith(prefix) for prefix in HIDE_PREFIXES):
            obj.hide_render = True
            obj.hide_set(True)
            hidden.append(name)
    return hidden


def _roll_point(y):
    """World YZ on the rolled pressure course."""
    span = max(ROLL_RADIUS * ROLL_RADIUS - y * y, 0.01)
    z = ROLL_AXIS_Z + math.sqrt(span)
    ny = y
    nz = z - ROLL_AXIS_Z
    length = math.hypot(ny, nz) or 1.0
    return y, z, ny / length, nz / length


def _rolled_course(collection, name, x0, x1, sign, thickness, material, bill, function):
    """Thick cylindrical shell segment. Not a four-corner card."""
    half = float(thickness) * 0.5
    y0 = Y_IN * sign
    y1 = Y_OUT * sign
    verts = []
    for x in (x0, x1):
        for step in range(SEGMENTS + 1):
            t = step / SEGMENTS
            y = y0 + (y1 - y0) * t
            _, z, ny, nz = _roll_point(y)
            verts.append((x, y + ny * half, z + nz * half))
        for step in range(SEGMENTS + 1):
            t = step / SEGMENTS
            y = y0 + (y1 - y0) * t
            _, z, ny, nz = _roll_point(y)
            verts.append((x, y - ny * half, z - nz * half))
    # x0 outer, x0 inner, x1 outer, x1 inner — each a ring of SEGMENTS+1 verts.
    ring = SEGMENTS + 1
    faces = []
    for i in range(SEGMENTS):
        faces.append((i, i + 1, 2 * ring + i + 1, 2 * ring + i))
        faces.append((ring + i + 1, ring + i, 3 * ring + i, 3 * ring + i + 1))
        faces.append((i, ring + i, ring + i + 1, i + 1))
        faces.append((2 * ring + i + 1, 3 * ring + i + 1, 3 * ring + i, 2 * ring + i))
    faces.append((0, ring, 3 * ring, 2 * ring))
    faces.append((SEGMENTS, 2 * ring + SEGMENTS, 3 * ring + SEGMENTS, ring + SEGMENTS))
    obj = _mesh_object(collection, name, verts, faces)
    return _stamp(_finish(obj, material, bill, function, bevel=0.004, detail=1))


def _side_shell(collection, materials, sign, side):
    """Rolled dorsal armor courses with steel laps.

    Fiction: brake-formed plate rolled onto the pressure hull radius.
    Forbidden: a bilinear card, a soap box, a lid over the trench or hatch.
    """
    armor = materials["armor"]
    steel = materials["service_steel"]
    objects = []
    for name, x0, x1 in COURSES:
        objects.append(_rolled_course(
            collection, f"{PREFIX}Course_{side}_{name}",
            x0, x1, sign, THICKNESS, armor, "armor_plate",
            f"{side.lower()} {name.lower()} rolled dorsal armor course",
        ))
        _, z_in, _, _ = _roll_point(Y_IN * sign)
        _, z_out, _, _ = _roll_point(Y_OUT * sign)
        objects.append(_folded_plate(
            collection, f"{PREFIX}Lap_{side}_{name}",
            (x1 - 0.050, Y_IN * sign, z_in + 0.012),
            (x1 + 0.012, Y_IN * sign, z_in + 0.012),
            (x1 + 0.012, Y_OUT * sign, z_out + 0.012),
            (x1 - 0.050, Y_OUT * sign, z_out + 0.012),
            0.016, steel, "structural_metal",
            f"{side.lower()} {name.lower()} rolled-course lap",
        ))
    return objects


def apply_hitch_hero_v72() -> dict:
    prior = apply_hitch_hero_v71()
    collection = _collection()
    materials = _materials()
    hidden = _hide_flat_cards()
    objects = []
    objects.extend(_side_shell(collection, materials, -1.0, "Port"))
    objects.extend(_side_shell(collection, materials, 1.0, "Starboard"))
    report = {
        "schema": "spaceface.hitchHero.v72",
        "passId": PASS_ID,
        "method": "multi-segment rolled cylindrical shell courses; hide bilinear cards",
        "priorPass": "v71",
        "hiddenDonors": hidden,
        "objectsAdded": len(objects),
        "objectNames": [obj.name for obj in objects],
        "componentReference": "kestrel_midship_material_truth_reference_v1.png",
    }
    _root()["hitchHeroPassV72"] = {
        "passId": PASS_ID,
        "objectsAdded": int(len(objects)),
        "hiddenDonors": hidden,
    }
    return report
