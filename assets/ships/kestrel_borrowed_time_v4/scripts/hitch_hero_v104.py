"""Hitch hero V104 / cycle 94: standing seams between casemate courses.

Cycle 93 flushed the doors. The cheek between hatches is still one
blank plate. Keep the wells. Put a thick standing seam on each course
lap the 3Q sees. No hull boolean. No pack hats. No cone-frame bolts.
"""
from __future__ import annotations

import bpy

from hitch_hero_v103 import apply_hitch_hero_v103
from hitch_hero_v101 import _quad
from material_truth_v6 import _materials, _root, _source

PASS_ID = "kestrel-hitch-hero-v104"
COLLECTION_NAME = "KESTREL_V104_CASEMATE_SEAMS"
PREFIX = "V104_"
SEAMS = (
    ("AftLap", 0.28),
    ("MidLap", 0.52),
    ("ForeLap", 0.76),
)
HALF = 0.012
V0 = 0.08
V1 = 0.82
LIFT = 0.118


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


def _side(collection, materials, sign, side):
    steel = materials["service_steel"]
    objects = []
    for name, u in SEAMS:
        obj = _quad(
            collection, f"{PREFIX}Seam_{side}_{name}",
            u - HALF, V0, u + HALF, V1,
            sign, LIFT, 0.036, steel, "structural_metal",
            "casemate course standing seam",
        )
        if obj is not None:
            objects.append(obj)
    return objects


def apply_hitch_hero_v104() -> dict:
    prior = apply_hitch_hero_v103()
    collection = _collection()
    materials = _materials()
    objects = []
    objects.extend(_side(collection, materials, -1.0, "Port"))
    objects.extend(_side(collection, materials, 1.0, "Starboard"))
    report = {
        "schema": "spaceface.hitchHero.v104",
        "passId": PASS_ID,
        "method": "standing seams on the three casemate course laps",
        "priorPass": "v103",
        "objectsAdded": len(objects),
        "objectNames": [obj.name for obj in objects],
        "componentReference": "kestrel_bow_weapon_spine_reference_v1.png",
    }
    _root()["hitchHeroPassV104"] = {
        "passId": PASS_ID,
        "objectsAdded": int(len(objects)),
    }
    return report
