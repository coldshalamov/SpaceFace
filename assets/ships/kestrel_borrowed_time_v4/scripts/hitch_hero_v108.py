"""Hitch hero V108 / cycle 98: closed covers over the casemate wells.

Authored, not applied, not exported, not wired. Blender never finished
this pass. Keep the script so the next attempt does not start from a
blank page.

Cycles 91-93 left cassette slots — bars across a dark hole. Hide those
bars and inset doors. Keep the wells. Put a proud armor cover over each
hole, with a short hinge and latch on the edges, not through the opening.
No hull boolean. No pack hats. No cone-frame bolts.
"""
from __future__ import annotations

import bpy

from hitch_hero_v107 import apply_hitch_hero_v107
from hitch_hero_v101 import HATCHES, HU, HV, _quad
from material_truth_v6 import _materials, _root, _source

PASS_ID = "kestrel-hitch-hero-v108"
COLLECTION_NAME = "KESTREL_V108_CASEMATE_COVERS"
PREFIX = "V108_"
HIDE_PREFIXES = (
    "V102_Hinge_",
    "V102_Latch_",
    "V103_Door_",
)
COVER = 0.124


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


def _hide_cassettes():
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
    steel = materials["service_steel"]
    hazard = materials["hazard"]
    objects = []
    for name, uh, vh in HATCHES:
        latch_mat = hazard if name in ("Aft", "MidFore") else steel
        objects.append(_quad(
            collection, f"{PREFIX}Cover_{side}_{name}",
            uh - HU * 1.10, vh - HV * 1.04, uh + HU * 1.10, vh + HV * 1.04,
            sign, COVER, 0.044, armor, "armor_plate",
            "casemate closed inspection cover",
        ))
        objects.append(_quad(
            collection, f"{PREFIX}Hinge_{side}_{name}",
            uh - HU * 1.14, vh - 0.018, uh - HU * 0.86, vh + 0.018,
            sign, COVER + 0.020, 0.036, steel, "structural_metal",
            "casemate cover hinge knuckle",
        ))
        objects.append(_quad(
            collection, f"{PREFIX}Latch_{side}_{name}",
            uh + HU * 0.88, vh - 0.014, uh + HU * 1.14, vh + 0.014,
            sign, COVER + 0.020, 0.036, latch_mat,
            "marking" if latch_mat == hazard else "structural_metal",
            "casemate cover latch",
        ))
    return [obj for obj in objects if obj is not None]


def apply_hitch_hero_v108() -> dict:
    prior = apply_hitch_hero_v107()
    collection = _collection()
    materials = _materials()
    hidden = _hide_cassettes()
    objects = []
    objects.extend(_side(collection, materials, -1.0, "Port"))
    objects.extend(_side(collection, materials, 1.0, "Starboard"))
    report = {
        "schema": "spaceface.hitchHero.v108",
        "passId": PASS_ID,
        "method": "proud closed covers over the casemate wells",
        "priorPass": "v107",
        "hiddenDonors": hidden,
        "objectsAdded": len(objects),
        "objectNames": [obj.name for obj in objects],
        "componentReference": "kestrel_bow_weapon_spine_reference_v1.png",
    }
    _root()["hitchHeroPassV108"] = {
        "passId": PASS_ID,
        "objectsAdded": int(len(objects)),
        "hiddenDonors": hidden,
    }
    return report
