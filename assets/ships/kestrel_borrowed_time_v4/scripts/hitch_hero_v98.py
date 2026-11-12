"""Hitch hero V98 / cycle 88: seams on the casemate plate laps.

Cycle 87 put three plates on each cheek. They still sit as cards.
Keep them. Run a short thick steel seam on each lap so the 3Q can
count the joint. No hull boolean. No pack hats. No cone-frame bolts.
"""
from __future__ import annotations

import bpy

from hitch_hero_v97 import apply_hitch_hero_v97, _cheek
from hitch_polish_v8 import _folded_plate
from material_truth_v6 import _materials, _root, _source

PASS_ID = "kestrel-hitch-hero-v98"
COLLECTION_NAME = "KESTREL_V98_CASEMATE_SEAMS"
PREFIX = "V98_"

SEAMS = (
    ("AftMid", 0.36),
    ("MidFore", 0.64),
)
HALF_U = 0.012
V0 = 0.14
V1 = 0.68


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
        objects.append(_folded_plate(
            collection, f"{PREFIX}Seam_{side}_{name}",
            _cheek(u - HALF_U, V0, sign),
            _cheek(u + HALF_U, V0, sign),
            _cheek(u + HALF_U, V1, sign),
            _cheek(u - HALF_U, V1, sign),
            0.040, steel, "structural_metal",
            f"{side.lower()} {name.lower()} casemate plate seam",
        ))
    return objects


def apply_hitch_hero_v98() -> dict:
    prior = apply_hitch_hero_v97()
    collection = _collection()
    materials = _materials()
    objects = []
    objects.extend(_side(collection, materials, -1.0, "Port"))
    objects.extend(_side(collection, materials, 1.0, "Starboard"))
    report = {
        "schema": "spaceface.hitchHero.v98",
        "passId": PASS_ID,
        "method": "short thick seams on the three-plate casemate laps",
        "priorPass": "v97",
        "objectsAdded": len(objects),
        "objectNames": [obj.name for obj in objects],
        "componentReference": "kestrel_bow_weapon_spine_reference_v1.png",
    }
    _root()["hitchHeroPassV98"] = {
        "passId": PASS_ID,
        "objectsAdded": int(len(objects)),
    }
    return report
