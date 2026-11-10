"""Hitch hero V37 / cycle 28: tall hat housings that still leave the well open.

Cycle 26 play-size keep was box lids. Cycle 27 keep opened the wells
again but lost the play-size lumps. One formed hat at the aft of each
well, tall enough for default zoom, short enough that the table still
looks into steel gear. Skip the box lids.
"""
from __future__ import annotations

import bpy

from hitch_hero_v24 import _stamp
from hitch_hero_v34 import WELLS, apply_hitch_hero_v34
from hitch_polish_v8 import _folded_plate
from material_truth_v6 import _materials, _profile_prism, _root, _source

PASS_ID = "kestrel-hitch-hero-v37"
COLLECTION_NAME = "KESTREL_V37_TALL_HATS"
PREFIX = "V37_"


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


def apply_hitch_hero_v37() -> dict:
    prior = apply_hitch_hero_v34()
    collection = _collection()
    materials = _materials()
    steel = materials["service_steel"]
    armor = materials["armor"]
    objects = []
    for station, side, cx, cy, hx, hy in WELLS:
        name = f"{PREFIX}Hat_{station}_{side}"
        aft = cx - hx * 0.62
        objects.append(_folded_plate(
            collection, f"{name}_PortLeaf",
            (aft - 0.28, cy - hy * 0.38, 1.58),
            (aft + 0.38, cy - hy * 0.38, 1.58),
            (aft + 0.22, cy - hy * 0.16, 2.32),
            (aft - 0.12, cy - hy * 0.16, 2.26),
            0.042, armor, "armor_plate",
            "tall hat leaf the play camera can count",
        ))
        objects.append(_folded_plate(
            collection, f"{name}_StbdLeaf",
            (aft - 0.28, cy + hy * 0.38, 1.58),
            (aft + 0.38, cy + hy * 0.38, 1.58),
            (aft + 0.22, cy + hy * 0.16, 2.32),
            (aft - 0.12, cy + hy * 0.16, 2.26),
            0.042, armor, "armor_plate",
            "tall hat leaf outboard",
        ))
        objects.append(_stamp(_profile_prism(
            collection, f"{name}_Cap",
            (aft + 0.04, cy, 2.24),
            0.46, hy * 0.38, hy * 0.30, 0.08, 0.06,
            steel, "structural_metal",
            "steel cap on the tall hat housing",
            detail=2, bevel=0.004,
        )))
    report = {
        "schema": "spaceface.hitchHero.v37",
        "passId": PASS_ID,
        "method": "tall hat housings; well stays open; skip box lids",
        "priorPass": "v34",
        "skippedPasses": ["v35", "v36"],
        "objectsAdded": len(objects),
        "objectNames": [obj.name for obj in objects],
    }
    _root()["hitchHeroPassV37"] = {
        "passId": PASS_ID,
        "objectsAdded": int(len(objects)),
    }
    return report
