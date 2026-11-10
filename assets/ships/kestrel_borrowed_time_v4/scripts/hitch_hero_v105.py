"""Hitch hero V105 / cycle 95: bolts on the casemate standing seams.

Cycle 94 seams read at 3Q but sit like tape. Keep the seams. Put four
fasteners on each lap. No hull boolean. No pack hats. No cone-frame bolts.
"""
from __future__ import annotations

import bpy

from hitch_hero_v104 import apply_hitch_hero_v104, SEAMS
from hitch_hero_v101 import _quad
from material_truth_v6 import _materials, _root, _source

PASS_ID = "kestrel-hitch-hero-v105"
COLLECTION_NAME = "KESTREL_V105_SEAM_BOLTS"
PREFIX = "V105_"
SLOTS = (0.20, 0.38, 0.56, 0.74)
HALF = 0.010
LIFT = 0.136


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
        for index, v in enumerate(SLOTS):
            obj = _quad(
                collection, f"{PREFIX}Bolt_{side}_{name}_{index}",
                u - HALF, v - 0.012, u + HALF, v + 0.012,
                sign, LIFT, 0.034, steel, "structural_metal",
                "casemate seam fastener",
            )
            if obj is not None:
                objects.append(obj)
    return objects


def apply_hitch_hero_v105() -> dict:
    prior = apply_hitch_hero_v104()
    collection = _collection()
    materials = _materials()
    objects = []
    objects.extend(_side(collection, materials, -1.0, "Port"))
    objects.extend(_side(collection, materials, 1.0, "Starboard"))
    report = {
        "schema": "spaceface.hitchHero.v105",
        "passId": PASS_ID,
        "method": "four fasteners on each casemate standing seam",
        "priorPass": "v104",
        "objectsAdded": len(objects),
        "objectNames": [obj.name for obj in objects],
        "componentReference": "kestrel_bow_weapon_spine_reference_v1.png",
    }
    _root()["hitchHeroPassV105"] = {
        "passId": PASS_ID,
        "objectsAdded": int(len(objects)),
    }
    return report
