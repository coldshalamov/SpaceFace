"""Hitch hero V36 / cycle 27: formed well housings, not box lids.

Cycle 26 proud blocks read at play size but clay called them boxes in
holes. Skip those lids. Seat one hat-section housing at the aft of each
well so the table still looks into the opening, and the play camera
still sees a manufactured lump.
"""
from __future__ import annotations

import bpy

from hitch_hero_v24 import _stamp
from hitch_hero_v34 import WELLS, apply_hitch_hero_v34
from hitch_polish_v8 import _folded_plate
from material_truth_v6 import _materials, _profile_prism, _root, _source

PASS_ID = "kestrel-hitch-hero-v36"
COLLECTION_NAME = "KESTREL_V36_WELL_HOUSINGS"
PREFIX = "V36_"


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


def apply_hitch_hero_v36() -> dict:
    prior = apply_hitch_hero_v34()
    collection = _collection()
    materials = _materials()
    steel = materials["service_steel"]
    armor = materials["armor"]
    objects = []
    for station, side, cx, cy, hx, hy in WELLS:
        name = f"{PREFIX}House_{station}_{side}"
        hx_aft = cx - hx * 0.55
        objects.append(_folded_plate(
            collection, f"{name}_Hat",
            (hx_aft - 0.35, cy - hy * 0.42, 1.62),
            (hx_aft + 0.55, cy - hy * 0.42, 1.62),
            (hx_aft + 0.45, cy - hy * 0.28, 2.22),
            (hx_aft - 0.25, cy - hy * 0.28, 2.18),
            0.045, armor, "armor_plate",
            "hat-section well housing the table still looks past",
        ))
        objects.append(_folded_plate(
            collection, f"{name}_HatOut",
            (hx_aft - 0.35, cy + hy * 0.42, 1.62),
            (hx_aft + 0.55, cy + hy * 0.42, 1.62),
            (hx_aft + 0.45, cy + hy * 0.28, 2.22),
            (hx_aft - 0.25, cy + hy * 0.28, 2.18),
            0.045, armor, "armor_plate",
            "hat-section well housing outboard leaf",
        ))
        objects.append(_stamp(_profile_prism(
            collection, f"{name}_Breech",
            (hx_aft, cy, 1.78),
            0.42, hy * 0.55, hy * 0.45, 0.28, 0.22,
            steel, "structural_metal",
            "breech block under the hat housing",
            detail=2, bevel=0.006,
        )))
    report = {
        "schema": "spaceface.hitchHero.v36",
        "passId": PASS_ID,
        "method": "hat-section well housings; skip box lids; keep the well open",
        "priorPass": "v34",
        "skippedPass": "v35",
        "objectsAdded": len(objects),
        "objectNames": [obj.name for obj in objects],
    }
    _root()["hitchHeroPassV36"] = {
        "passId": PASS_ID,
        "objectsAdded": int(len(objects)),
        "skipped": "v35",
    }
    return report
