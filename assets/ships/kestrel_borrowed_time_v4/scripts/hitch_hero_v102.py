"""Hitch hero V102 / cycle 92: real doors in the casemate wells.

Cycle 91 hatches read at 3Q, then look like cassette slots up close.
Hide the spanning bars. Keep the holed courses and well boxes.
Put a door in each well, with a short hinge and latch. No hull
boolean. No pack hats. No cone-frame bolts.
"""
from __future__ import annotations

import bpy

from hitch_hero_v101 import (
    apply_hitch_hero_v101,
    HATCHES,
    HARDWARE,
    HU,
    HV,
    _cheek,
    _quad,
)
from material_truth_v6 import _materials, _root, _source

PASS_ID = "kestrel-hitch-hero-v102"
COLLECTION_NAME = "KESTREL_V102_CASEMATE_DOORS"
PREFIX = "V102_"
HIDE_PREFIXES = (
    "V101_Lid_",
    "V101_Hinge_",
    "V101_Latch_",
)
DOOR = 0.080


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


def _hide_cassette_bars():
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
        hole_u0 = uh - HU
        hole_u1 = uh + HU
        latch_mat = hazard if name in ("Aft", "MidFore") else steel
        objects.append(_quad(
            collection, f"{PREFIX}Door_{side}_{name}",
            uh - HU * 0.78, vh - HV * 0.70, uh + HU * 0.78, vh + HV * 0.70,
            sign, DOOR, 0.040, armor, "armor_plate",
            "casemate inspection door",
        ))
        objects.append(_quad(
            collection, f"{PREFIX}Hinge_{side}_{name}",
            hole_u0 - 0.010, vh - 0.022, hole_u0 + 0.024, vh + 0.022,
            sign, HARDWARE, 0.038, steel, "structural_metal",
            "casemate door hinge knuckle",
        ))
        objects.append(_quad(
            collection, f"{PREFIX}Latch_{side}_{name}",
            hole_u1 - 0.024, vh - 0.016, hole_u1 + 0.012, vh + 0.016,
            sign, HARDWARE, 0.038, latch_mat,
            "marking" if latch_mat == hazard else "structural_metal",
            "casemate door latch",
        ))
    return [obj for obj in objects if obj is not None]


def apply_hitch_hero_v102() -> dict:
    prior = apply_hitch_hero_v101()
    collection = _collection()
    materials = _materials()
    hidden = _hide_cassette_bars()
    objects = []
    objects.extend(_side(collection, materials, -1.0, "Port"))
    objects.extend(_side(collection, materials, 1.0, "Starboard"))
    report = {
        "schema": "spaceface.hitchHero.v102",
        "passId": PASS_ID,
        "method": "real doors in the casemate wells, not cassette bars",
        "priorPass": "v101",
        "hiddenDonors": hidden,
        "objectsAdded": len(objects),
        "objectNames": [obj.name for obj in objects],
        "componentReference": "kestrel_bow_weapon_spine_reference_v1.png",
    }
    _root()["hitchHeroPassV102"] = {
        "passId": PASS_ID,
        "objectsAdded": int(len(objects)),
        "hiddenDonors": hidden,
    }
    return report
