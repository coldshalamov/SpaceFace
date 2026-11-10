"""Hitch hero V33 / cycle 24: narrow armor-colored gun trench.

Cycle 23's teal bed read as a sticker. Skip that deck. Build a narrow
centerline trench from armor walls and a thin dark slot so the table
sees a cut, not a painted rectangle. Still no hull boolean.
"""
from __future__ import annotations

import bpy

from hitch_hero_v24 import _stamp
from hitch_hero_v31 import apply_hitch_hero_v31
from hitch_polish_v8 import _folded_plate
from material_truth_v6 import _materials, _profile_prism, _root, _source

PASS_ID = "kestrel-hitch-hero-v33"
COLLECTION_NAME = "KESTREL_V33_GUN_TRENCH"
PREFIX = "V33_"


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


def apply_hitch_hero_v33() -> dict:
    prior = apply_hitch_hero_v31()
    collection = _collection()
    materials = _materials()
    armor = materials["armor"]
    steel = materials["service_steel"]
    dark = materials["dark_aperture"]
    objects = []
    slot_z = 1.88
    wall_z = 2.10
    objects.append(_stamp(_profile_prism(
        collection, f"{PREFIX}Slot",
        (8.90, 0.0, slot_z), 3.40, 0.42, 0.36, 0.035, 0.030,
        dark, "active_aperture", "narrow gun-trench slot the table looks into",
        detail=1, bevel=0.002,
    )))
    for sign, side in ((-1.0, "Port"), (1.0, "Starboard")):
        objects.append(_folded_plate(
            collection, f"{PREFIX}Wall_{side}",
            (7.20, 0.24 * sign, slot_z),
            (10.60, 0.18 * sign, slot_z - 0.02),
            (10.60, 0.18 * sign, wall_z - 0.02),
            (7.20, 0.24 * sign, wall_z),
            0.040, armor, "armor_plate",
            f"{side.lower()} gun-trench wall",
        ))
        objects.append(_stamp(_profile_prism(
            collection, f"{PREFIX}Clamp_{side}",
            (8.70, 0.30 * sign, wall_z - 0.02),
            0.22, 0.16, 0.14, 0.07, 0.06,
            steel, "structural_metal",
            f"{side.lower()} trench cable clamp",
            detail=2, bevel=0.003,
        )))
    objects.append(_stamp(_profile_prism(
        collection, f"{PREFIX}Breech",
        (7.55, 0.0, slot_z + 0.08),
        0.55, 0.28, 0.22, 0.14, 0.12,
        steel, "structural_metal",
        "breech block at the aft of the gun trench",
        detail=2, bevel=0.005,
    )))
    report = {
        "schema": "spaceface.hitchHero.v33",
        "passId": PASS_ID,
        "method": "narrow armor gun trench; skip the teal deck",
        "priorPass": "v31",
        "skippedPass": "v32",
        "objectsAdded": len(objects),
        "objectNames": [obj.name for obj in objects],
    }
    _root()["hitchHeroPassV33"] = {
        "passId": PASS_ID,
        "objectsAdded": int(len(objects)),
        "skipped": "v32",
    }
    return report
