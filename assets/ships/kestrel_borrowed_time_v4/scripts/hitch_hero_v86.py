"""Hitch hero V86 / cycle 77: short lap clips, not long thin tape.

Cycle 76's full-length strips were tape. A first hat-section pass
shredded tangents. Hide the tape. Clip each course station with a
short thick bar on the In/Mid and Mid/Out laps. Keep the three bands.
No hull boolean. No pack hats.
"""
from __future__ import annotations

import bpy

from hitch_hero_v85 import apply_hitch_hero_v85
from hitch_hero_v79 import COURSES, _cone_point
from hitch_polish_v8 import _folded_plate
from material_truth_v6 import _materials, _root, _source

PASS_ID = "kestrel-hitch-hero-v86"
COLLECTION_NAME = "KESTREL_V86_HAT_SEAMS"
PREFIX = "V86_"
HIDE_PREFIXES = (
    "V85_Seam_",
)

LAPS = (
    ("InMid", 0.36, 0.058),
    ("MidOut", 0.66, 0.050),
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


def _hide_strips():
    hidden = []
    for obj in bpy.data.objects:
        name = obj.name or ""
        if any(name.startswith(prefix) for prefix in HIDE_PREFIXES):
            obj.hide_render = True
            obj.hide_set(True)
            hidden.append(name)
    return hidden


def _lifted(x, t, lift, sign):
    y, z, ny, nz = _cone_point(x, t, sign)
    return (x, y + ny * lift, z + nz * lift)


def _clip(collection, name, x, t, lift, sign, materials):
    steel = materials["service_steel"]
    hx, ht = 0.11, 0.028
    return _folded_plate(
        collection, name,
        _lifted(x - hx, t - ht, lift + 0.018, sign),
        _lifted(x + hx, t - ht, lift + 0.018, sign),
        _lifted(x + hx, t + ht, lift + 0.018, sign),
        _lifted(x - hx, t + ht, lift + 0.018, sign),
        0.040, steel, "structural_metal",
        "cone lap joint clip",
    )


def _side(collection, materials, sign, side):
    objects = []
    for lap_name, t, lift in LAPS:
        for course_name, x0, x1 in COURSES:
            if course_name == "Nose":
                continue
            objects.append(_clip(
                collection, f"{PREFIX}Clip_{side}_{lap_name}_{course_name}",
                x1 - 0.04, t, lift, sign, materials,
            ))
    return objects


def apply_hitch_hero_v86() -> dict:
    prior = apply_hitch_hero_v85()
    collection = _collection()
    materials = _materials()
    hidden = _hide_strips()
    objects = []
    objects.extend(_side(collection, materials, -1.0, "Port"))
    objects.extend(_side(collection, materials, 1.0, "Starboard"))
    report = {
        "schema": "spaceface.hitchHero.v86",
        "passId": PASS_ID,
        "method": "short thick clips at the three-band course stations",
        "priorPass": "v85",
        "hiddenDonors": hidden,
        "objectsAdded": len(objects),
        "objectNames": [obj.name for obj in objects],
        "componentReference": "kestrel_midship_material_truth_reference_v1.png",
    }
    _root()["hitchHeroPassV86"] = {
        "passId": PASS_ID,
        "objectsAdded": int(len(objects)),
        "hiddenDonors": hidden,
    }
    return report
