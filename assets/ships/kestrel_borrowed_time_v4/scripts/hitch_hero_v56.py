"""Hitch hero V56 / cycle 47: hide the original spine slab.

Cycle 46 left one thick gray plate in the close camera. That plate is
Hull_Dorsal_Spine sitting over the eight-sided V50 crown. Hide the slab
so the formed crown is the visible skin. Keep the trench, wells, locker,
and repair hatch. No hull boolean.
"""
from __future__ import annotations

import bpy

from hitch_hero_v55 import apply_hitch_hero_v55
from material_truth_v6 import _root, _source

PASS_ID = "kestrel-hitch-hero-v56"
COLLECTION_NAME = "KESTREL_V56_SPINE_SLAB"
HIDE_EXACT = {
    "Hull_Dorsal_Spine",
}


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


def apply_hitch_hero_v56() -> dict:
    prior = apply_hitch_hero_v55()
    _collection()
    hidden = []
    for obj in bpy.data.objects:
        name = obj.name or ""
        base = name.split(".")[0]
        if name in HIDE_EXACT or base in HIDE_EXACT:
            obj.hide_render = True
            obj.hide_set(True)
            hidden.append(name)
    report = {
        "schema": "spaceface.hitchHero.v56",
        "passId": PASS_ID,
        "method": "hide Hull_Dorsal_Spine so the formed V50 crown is the visible skin",
        "priorPass": "v55",
        "hiddenDonors": hidden,
        "objectsAdded": 0,
        "objectNames": [],
    }
    _root()["hitchHeroPassV56"] = {
        "passId": PASS_ID,
        "hiddenDonors": hidden,
    }
    return report
