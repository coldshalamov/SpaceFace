"""Hitch hero V106 / cycle 96: service run on the casemate cheek.

Cycle 94-95 break the cheek with seams. Store-shot leftover is still
a blank plate with cassette slots. Keep the wells and seams. Run a
steel service line along the inboard edge the 3Q sees, with a clamp
at each hatch station. No hull boolean. No pack hats. No cone-frame
bolts.
"""
from __future__ import annotations

import bpy

from hitch_hero_v105 import apply_hitch_hero_v105
from hitch_hero_v101 import HATCHES, _cheek
from material_truth_v6 import _materials, _root, _source, _strut_between

PASS_ID = "kestrel-hitch-hero-v106"
COLLECTION_NAME = "KESTREL_V106_CASEMATE_RUN"
PREFIX = "V106_"
V_RUN = 0.78
LIFT = 0.112


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
    objects.append(_strut_between(
        collection, f"{PREFIX}Run_{side}",
        _cheek(0.06, V_RUN, sign, LIFT),
        _cheek(0.96, V_RUN, sign, LIFT),
        0.026, steel, "structural_metal",
        f"{side.lower()} casemate inboard service run",
        segments=10, detail=1,
    ))
    for name, uh, _vh in HATCHES:
        objects.append(_strut_between(
            collection, f"{PREFIX}Clamp_{side}_{name}",
            _cheek(uh - 0.018, V_RUN - 0.04, sign, LIFT - 0.010),
            _cheek(uh + 0.018, V_RUN + 0.03, sign, LIFT + 0.016),
            0.022, steel, "structural_metal",
            f"{side.lower()} casemate run clamp",
            segments=8, detail=1,
        ))
    return objects


def apply_hitch_hero_v106() -> dict:
    prior = apply_hitch_hero_v105()
    collection = _collection()
    materials = _materials()
    objects = []
    objects.extend(_side(collection, materials, -1.0, "Port"))
    objects.extend(_side(collection, materials, 1.0, "Starboard"))
    report = {
        "schema": "spaceface.hitchHero.v106",
        "passId": PASS_ID,
        "method": "inboard casemate service run with a clamp at each hatch",
        "priorPass": "v105",
        "objectsAdded": len(objects),
        "objectNames": [obj.name for obj in objects],
        "componentReference": "kestrel_bow_weapon_spine_reference_v1.png",
    }
    _root()["hitchHeroPassV106"] = {
        "passId": PASS_ID,
        "objectsAdded": int(len(objects)),
    }
    return report
