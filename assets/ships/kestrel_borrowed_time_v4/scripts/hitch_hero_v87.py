"""Hitch hero V87 / cycle 78: thick long lap joints, keep the clips.

Cycle 77 hid the tape and the store-shot lost the lap. Cycle 76's
single plate exported. Hat-sections shredded. Keep the clips. Lay one
thicker, wider course along each lap so the 3Q can count the joint
again. No hull boolean. No pack hats.
"""
from __future__ import annotations

import bpy

from hitch_hero_v86 import apply_hitch_hero_v86
from hitch_hero_v79 import COURSES, _cone_point
from hitch_polish_v8 import _folded_plate
from material_truth_v6 import _materials, _root, _source

PASS_ID = "kestrel-hitch-hero-v87"
COLLECTION_NAME = "KESTREL_V87_THICK_LAPS"
PREFIX = "V87_"

LAPS = (
    ("InMid", 0.36, 0.062),
    ("MidOut", 0.66, 0.054),
)
SEAM_HALF = 0.026


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


def _lap(collection, name, x0, x1, t, lift, sign, materials):
    steel = materials["service_steel"]
    return _folded_plate(
        collection, name,
        _lifted(x0, t - SEAM_HALF, lift, sign),
        _lifted(x1, t - SEAM_HALF, lift, sign),
        _lifted(x1, t + SEAM_HALF, lift, sign),
        _lifted(x0, t + SEAM_HALF, lift, sign),
        0.044, steel, "structural_metal",
        "thick three-band cone lap joint",
    )


def _side(collection, materials, sign, side):
    objects = []
    for lap_name, t, lift in LAPS:
        for course_name, x0, x1 in COURSES:
            objects.append(_lap(
                collection, f"{PREFIX}Lap_{side}_{lap_name}_{course_name}",
                x0, x1, t, lift, sign, materials,
            ))
    return objects


def apply_hitch_hero_v87() -> dict:
    prior = apply_hitch_hero_v86()
    collection = _collection()
    materials = _materials()
    objects = []
    objects.extend(_side(collection, materials, -1.0, "Port"))
    objects.extend(_side(collection, materials, 1.0, "Starboard"))
    report = {
        "schema": "spaceface.hitchHero.v87",
        "passId": PASS_ID,
        "method": "thicker wider single-plate laps plus the C77 clips",
        "priorPass": "v86",
        "objectsAdded": len(objects),
        "objectNames": [obj.name for obj in objects],
        "componentReference": "kestrel_midship_material_truth_reference_v1.png",
    }
    _root()["hitchHeroPassV87"] = {
        "passId": PASS_ID,
        "objectsAdded": int(len(objects)),
    }
    return report
