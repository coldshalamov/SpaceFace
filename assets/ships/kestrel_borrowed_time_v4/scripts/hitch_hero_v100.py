"""Hitch hero V100 / cycle 90: hatches on the casemate shingles.

Cycle 89 covered the cheek with four courses. Store-shot still
reads blank plate. Keep the courses. Put one inspection hatch on
each course. No hull boolean. No pack hats. No cone-frame bolts.
"""
from __future__ import annotations

import bpy

from hitch_hero_v99 import apply_hitch_hero_v99, _cheek
from hitch_polish_v8 import _folded_plate
from material_truth_v6 import _materials, _root, _source

PASS_ID = "kestrel-hitch-hero-v100"
COLLECTION_NAME = "KESTREL_V100_CASEMATE_HATCH"
PREFIX = "V100_"

HATCHES = (
    ("Aft", 0.16, 0.42),
    ("AftMid", 0.40, 0.42),
    ("MidFore", 0.64, 0.42),
    ("Fore", 0.86, 0.40),
)
HU = 0.055
HV = 0.09


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
    armor = materials["armor"]
    steel = materials["service_steel"]
    objects = []
    for name, u, v in HATCHES:
        objects.append(_folded_plate(
            collection, f"{PREFIX}Frame_{side}_{name}",
            _cheek(u - HU, v - HV, sign, 0.058),
            _cheek(u + HU, v - HV, sign, 0.058),
            _cheek(u + HU, v + HV, sign, 0.058),
            _cheek(u - HU, v + HV, sign, 0.058),
            0.036, steel, "structural_metal",
            "casemate inspection frame",
        ))
        objects.append(_folded_plate(
            collection, f"{PREFIX}Lid_{side}_{name}",
            _cheek(u - HU * 0.62, v - HV * 0.58, sign, 0.050),
            _cheek(u + HU * 0.62, v - HV * 0.58, sign, 0.050),
            _cheek(u + HU * 0.62, v + HV * 0.58, sign, 0.050),
            _cheek(u - HU * 0.62, v + HV * 0.58, sign, 0.050),
            0.040, armor, "armor_plate",
            "casemate inspection lid",
        ))
    return objects


def apply_hitch_hero_v100() -> dict:
    prior = apply_hitch_hero_v99()
    collection = _collection()
    materials = _materials()
    objects = []
    objects.extend(_side(collection, materials, -1.0, "Port"))
    objects.extend(_side(collection, materials, 1.0, "Starboard"))
    report = {
        "schema": "spaceface.hitchHero.v100",
        "passId": PASS_ID,
        "method": "one inspection hatch on each shingled casemate course",
        "priorPass": "v99",
        "objectsAdded": len(objects),
        "objectNames": [obj.name for obj in objects],
        "componentReference": "kestrel_bow_weapon_spine_reference_v1.png",
    }
    _root()["hitchHeroPassV100"] = {
        "passId": PASS_ID,
        "objectsAdded": int(len(objects)),
    }
    return report
