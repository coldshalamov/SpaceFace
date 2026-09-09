"""Hitch hero V107 / cycle 97: saddles under the casemate service run.

Cycle 96 laid a pipe on the cheek. It sits like tape. Keep the run.
Put a saddle block under the pipe at each standing seam so the line
is clamped to the course, not floating. No hull boolean. No pack hats.
No cone-frame bolts.
"""
from __future__ import annotations

import bpy

from hitch_hero_v106 import apply_hitch_hero_v106, V_RUN, LIFT
from hitch_hero_v104 import SEAMS
from hitch_hero_v101 import _quad
from material_truth_v6 import _materials, _root, _source

PASS_ID = "kestrel-hitch-hero-v107"
COLLECTION_NAME = "KESTREL_V107_RUN_SADDLES"
PREFIX = "V107_"


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
            collection, f"{PREFIX}Saddle_{side}_{name}",
            u - 0.018, V_RUN - 0.034, u + 0.018, V_RUN + 0.034,
            sign, LIFT - 0.016, 0.036, steel, "structural_metal",
            "casemate run saddle",
        )
        if obj is not None:
            objects.append(obj)
    return objects


def apply_hitch_hero_v107() -> dict:
    prior = apply_hitch_hero_v106()
    collection = _collection()
    materials = _materials()
    objects = []
    objects.extend(_side(collection, materials, -1.0, "Port"))
    objects.extend(_side(collection, materials, 1.0, "Starboard"))
    report = {
        "schema": "spaceface.hitchHero.v107",
        "passId": PASS_ID,
        "method": "saddle blocks under the casemate service run at each seam",
        "priorPass": "v106",
        "objectsAdded": len(objects),
        "objectNames": [obj.name for obj in objects],
        "componentReference": "kestrel_bow_weapon_spine_reference_v1.png",
    }
    _root()["hitchHeroPassV107"] = {
        "passId": PASS_ID,
        "objectsAdded": int(len(objects)),
    }
    return report
