"""Hitch hero V84 / cycle 75: three overlapping cone bands.

Cycle 74 gave the hatches walls, but the leftover cone is still two
wide ribbons. Hide those two bands. Rebuild as three lapped courses so
the store-shot face is shingled plate, not a gray wedge. Keep wells and
the conduit. No hull boolean. No pack hats.
"""
from __future__ import annotations

import bpy

from hitch_hero_v83 import apply_hitch_hero_v83
from hitch_hero_v80 import _rolled_band, _seam
from hitch_hero_v79 import COURSES
from material_truth_v6 import _materials, _root, _source

PASS_ID = "kestrel-hitch-hero-v84"
COLLECTION_NAME = "KESTREL_V84_THREE_BAND"
PREFIX = "V84_"
HIDE_PREFIXES = (
    "V80_Course_",
    "V80_Seam_",
)

BANDS = (
    ("In", 0.00, 0.42, 0.078),
    ("Mid", 0.30, 0.72, 0.066),
    ("Out", 0.60, 1.00, 0.054),
)


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


def _hide_two_bands():
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
    for band_name, t0, t1, thickness in BANDS:
        for name, x0, x1 in COURSES:
            objects.append(_rolled_band(
                collection, f"{PREFIX}Course_{side}_{band_name}_{name}",
                x0, x1, t0, t1, sign, thickness, armor, "armor_plate",
                f"{side.lower()} {band_name.lower()} {name.lower()} triple-shingle course",
            ))
            if name != "Nose":
                objects.append(_seam(
                    collection, f"{PREFIX}Seam_{side}_{band_name}_{name}",
                    x1 - 0.04, t0, t1, sign, materials,
                ))
    return objects


def apply_hitch_hero_v84() -> dict:
    prior = apply_hitch_hero_v83()
    collection = _collection()
    materials = _materials()
    hidden = _hide_two_bands()
    objects = []
    objects.extend(_side(collection, materials, -1.0, "Port"))
    objects.extend(_side(collection, materials, 1.0, "Starboard"))
    report = {
        "schema": "spaceface.hitchHero.v84",
        "passId": PASS_ID,
        "method": "three overlapping rolled cone bands instead of two wide ribbons",
        "priorPass": "v83",
        "hiddenDonors": hidden,
        "objectsAdded": len(objects),
        "objectNames": [obj.name for obj in objects],
        "componentReference": "kestrel_midship_material_truth_reference_v1.png",
    }
    _root()["hitchHeroPassV84"] = {
        "passId": PASS_ID,
        "objectsAdded": int(len(objects)),
        "hiddenDonors": hidden,
    }
    return report
