"""Hitch hero V73 / cycle 64: tighter rolled courses so the curve reads.

Cycle 63 used a real cylindrical shell, but the radius was so large the
look-down camera still saw a flat strip. Hide that gentle shell. Rebuild
the same courses on a tighter roll toward the well. Mid hatch stays clear.
No hull boolean. No pack hats.
"""
from __future__ import annotations

import math

import bpy

from hitch_hero_v24 import _stamp
from hitch_hero_v72 import apply_hitch_hero_v72
from hitch_polish_v8 import _folded_plate
from material_truth_v6 import _finish, _materials, _mesh_object, _root, _source

PASS_ID = "kestrel-hitch-hero-v73"
COLLECTION_NAME = "KESTREL_V73_TIGHT_ROLL"
PREFIX = "V73_"
HIDE_PREFIXES = (
    "V72_Course_",
    "V72_Lap_",
)

COURSES = (
    ("Aft", -3.92, -2.52),
    ("MidAft", -2.62, -1.92),
    ("MidFore", -1.18, -0.40),
    ("ForeIn", -0.50, 0.34),
    ("ForeOut", 0.24, 1.08),
)

# Tighter than C63 so the look-down camera sees the drop toward the well.
ROLL_RADIUS = 3.55
ROLL_AXIS_Z = -1.320
Y_IN = 0.44
Y_OUT = 0.84
SEGMENTS = 6
THICKNESS = 0.040


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


def _hide_gentle_shell():
    hidden = []
    for obj in bpy.data.objects:
        name = obj.name or ""
        if any(name.startswith(prefix) for prefix in HIDE_PREFIXES):
            obj.hide_render = True
            obj.hide_set(True)
            hidden.append(name)
    return hidden


def _roll_point(y):
    span = max(ROLL_RADIUS * ROLL_RADIUS - y * y, 0.01)
    z = ROLL_AXIS_Z + math.sqrt(span)
    ny = y
    nz = z - ROLL_AXIS_Z
    length = math.hypot(ny, nz) or 1.0
    return y, z, ny / length, nz / length


def _rolled_course(collection, name, x0, x1, sign, thickness, material, bill, function):
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
    armor = materials["armor"]
    steel = materials["service_steel"]
    objects = []
    for name, x0, x1 in COURSES:
        objects.append(_rolled_course(
            collection, f"{PREFIX}Course_{side}_{name}",
            x0, x1, sign, THICKNESS, armor, "armor_plate",
            f"{side.lower()} {name.lower()} tight-rolled dorsal armor",
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
            f"{side.lower()} {name.lower()} tight-roll lap",
        ))
    return objects


def apply_hitch_hero_v73() -> dict:
    prior = apply_hitch_hero_v72()
    collection = _collection()
    materials = _materials()
    hidden = _hide_gentle_shell()
    objects = []
    objects.extend(_side_shell(collection, materials, -1.0, "Port"))
    objects.extend(_side_shell(collection, materials, 1.0, "Starboard"))
    report = {
        "schema": "spaceface.hitchHero.v73",
        "passId": PASS_ID,
        "method": "tighter rolled cylindrical shell so the look-down camera sees the curve",
        "priorPass": "v72",
        "hiddenDonors": hidden,
        "objectsAdded": len(objects),
        "objectNames": [obj.name for obj in objects],
        "componentReference": "kestrel_midship_material_truth_reference_v1.png",
    }
    _root()["hitchHeroPassV73"] = {
        "passId": PASS_ID,
        "objectsAdded": int(len(objects)),
        "hiddenDonors": hidden,
    }
    return report
