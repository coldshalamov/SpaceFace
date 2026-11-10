"""Hitch hero V85 / cycle 76: standing seams on the three-band laps.

Cycle 75 added three bands, but the 3Q still sees a gray wedge because
the laps have no manufactured joint. Keep the bands. Run hat-section
seams along the In/Mid and Mid/Out overlaps so the store-shot can
count them. No hull boolean. No pack hats.
"""
from __future__ import annotations

import bpy

from hitch_hero_v84 import apply_hitch_hero_v84
from hitch_hero_v79 import COURSES, _cone_point
from hitch_polish_v8 import _folded_plate
from material_truth_v6 import _materials, _root, _source

PASS_ID = "kestrel-hitch-hero-v85"
COLLECTION_NAME = "KESTREL_V85_LAP_SEAMS"
PREFIX = "V85_"

# Long seams sit in the overlap, proud of the thicker band.
LAPS = (
    ("InMid", 0.36, 0.058),
    ("MidOut", 0.66, 0.050),
)
SEAM_HALF = 0.018


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


def _lifted(x, t, lift, sign):
    y, z, ny, nz = _cone_point(x, t, sign)
    return (x, y + ny * lift, z + nz * lift)


def _lap_seam(collection, name, x0, x1, t, lift, sign, materials):
    steel = materials["service_steel"]
    return _folded_plate(
        collection, name,
        _lifted(x0, t - SEAM_HALF, lift, sign),
        _lifted(x1, t - SEAM_HALF, lift, sign),
        _lifted(x1, t + SEAM_HALF, lift, sign),
        _lifted(x0, t + SEAM_HALF, lift, sign),
        0.034, steel, "structural_metal",
        "three-band cone standing seam",
    )


def _side(collection, materials, sign, side):
    objects = []
    for lap_name, t, lift in LAPS:
        for course_name, x0, x1 in COURSES:
            objects.append(_lap_seam(
                collection, f"{PREFIX}Seam_{side}_{lap_name}_{course_name}",
                x0, x1, t, lift, sign, materials,
            ))
    return objects


def apply_hitch_hero_v85() -> dict:
    prior = apply_hitch_hero_v84()
    collection = _collection()
    materials = _materials()
    objects = []
    objects.extend(_side(collection, materials, -1.0, "Port"))
    objects.extend(_side(collection, materials, 1.0, "Starboard"))
    report = {
        "schema": "spaceface.hitchHero.v85",
        "passId": PASS_ID,
        "method": "hat-section standing seams on the three-band laps",
        "priorPass": "v84",
        "objectsAdded": len(objects),
        "objectNames": [obj.name for obj in objects],
        "componentReference": "kestrel_midship_material_truth_reference_v1.png",
    }
    _root()["hitchHeroPassV85"] = {
        "passId": PASS_ID,
        "objectsAdded": int(len(objects)),
    }
    return report
