"""Hitch hero V53 / cycle 44: hide the leftover dorsal spine rib.

Cycle 43 close stills still show Dorsal_Spine_Rib_02 as a weathered
vertical brick on the crown. That rib is older jewelry, not load path.
Hide the Dorsal_Spine_Rib family so the formed crown and open wells
read. Keep the locker, hatch, and cable. No hull boolean.
"""
from __future__ import annotations

import bpy

from hitch_hero_v52 import apply_hitch_hero_v52
from material_truth_v6 import _root, _source

PASS_ID = "kestrel-hitch-hero-v53"
COLLECTION_NAME = "KESTREL_V53_SPINE_RIBS"
HIDE_PREFIXES = ("Dorsal_Spine_Rib_",)


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


def apply_hitch_hero_v53() -> dict:
    prior = apply_hitch_hero_v52()
    _collection()
    hidden = []
    for obj in bpy.data.objects:
        name = obj.name or ""
        if any(name.startswith(prefix) for prefix in HIDE_PREFIXES):
            obj.hide_render = True
            obj.hide_set(True)
            hidden.append(name)
    report = {
        "schema": "spaceface.hitchHero.v53",
        "passId": PASS_ID,
        "method": "hide Dorsal_Spine_Rib_* leftover bricks on the crown",
        "priorPass": "v52",
        "hiddenDonors": hidden,
        "objectsAdded": 0,
        "objectNames": [],
    }
    _root()["hitchHeroPassV53"] = {
        "passId": PASS_ID,
        "hiddenDonors": hidden,
    }
    return report
