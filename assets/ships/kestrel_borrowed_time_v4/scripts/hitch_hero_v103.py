"""Hitch hero V103 / cycle 93: flush casemate hatch doors.

Cycle 92 doors still leave a cassette slot. Hide those doors.
Fill almost the whole well so the 3Q reads closed hatches with a
thin seam. Keep the short hinge and latch. No hull boolean.
No pack hats. No cone-frame bolts.
"""
from __future__ import annotations

import bpy

from hitch_hero_v102 import apply_hitch_hero_v102
from hitch_hero_v101 import HATCHES, HU, HV, _quad
from material_truth_v6 import _materials, _root, _source

PASS_ID = "kestrel-hitch-hero-v103"
COLLECTION_NAME = "KESTREL_V103_FLUSH_DOORS"
PREFIX = "V103_"
HIDE_PREFIXES = (
    "V102_Door_",
)
DOOR = 0.082


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


def _hide_slot_doors():
    hidden = []
    for obj in bpy.data.objects:
        name = obj.name or ""
        if any(name.startswith(prefix) for prefix in HIDE_PREFIXES):
            obj.hide_render = True
            obj.hide_set(True)
            hidden.append(name)
    return hidden


def _side(collection, materials, sign, side):
    armor = materials["armor"]
    objects = []
    for name, uh, vh in HATCHES:
        obj = _quad(
            collection, f"{PREFIX}Door_{side}_{name}",
            uh - HU * 0.92, vh - HV * 0.88, uh + HU * 0.92, vh + HV * 0.88,
            sign, DOOR, 0.042, armor, "armor_plate",
            "casemate flush inspection door",
        )
        if obj is not None:
            objects.append(obj)
    return objects


def apply_hitch_hero_v103() -> dict:
    prior = apply_hitch_hero_v102()
    collection = _collection()
    materials = _materials()
    hidden = _hide_slot_doors()
    objects = []
    objects.extend(_side(collection, materials, -1.0, "Port"))
    objects.extend(_side(collection, materials, 1.0, "Starboard"))
    report = {
        "schema": "spaceface.hitchHero.v103",
        "passId": PASS_ID,
        "method": "flush doors filling the casemate wells",
        "priorPass": "v102",
        "hiddenDonors": hidden,
        "objectsAdded": len(objects),
        "objectNames": [obj.name for obj in objects],
        "componentReference": "kestrel_bow_weapon_spine_reference_v1.png",
    }
    _root()["hitchHeroPassV103"] = {
        "passId": PASS_ID,
        "objectsAdded": int(len(objects)),
        "hiddenDonors": hidden,
    }
    return report
