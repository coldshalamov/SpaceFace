"""Hitch hero V54 / cycle 45: hide the leftover crown stud and conduit cards.

Cycle 44 killed the weathered rib. Close stills still show a thin plate
and a cube stud on the spine — V7_SpineClamp_* and V7_SpineConduit_*.
Hide that leftover jewelry. Keep the formed crown, open wells, locker,
and hatch. No hull boolean.
"""
from __future__ import annotations

import bpy

from hitch_hero_v53 import apply_hitch_hero_v53
from material_truth_v6 import _root, _source

PASS_ID = "kestrel-hitch-hero-v54"
COLLECTION_NAME = "KESTREL_V54_SPINE_STUDS"
HIDE_PREFIXES = (
    "V7_SpineClamp_",
    "V7_SpineConduit_",
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


def apply_hitch_hero_v54() -> dict:
    prior = apply_hitch_hero_v53()
    _collection()
    hidden = []
    for obj in bpy.data.objects:
        name = obj.name or ""
        if any(name.startswith(prefix) for prefix in HIDE_PREFIXES):
            obj.hide_render = True
            obj.hide_set(True)
            hidden.append(name)
    report = {
        "schema": "spaceface.hitchHero.v54",
        "passId": PASS_ID,
        "method": "hide V7 spine clamps and conduit cards on the crown",
        "priorPass": "v53",
        "hiddenDonors": hidden,
        "objectsAdded": 0,
        "objectNames": [],
    }
    _root()["hitchHeroPassV54"] = {
        "passId": PASS_ID,
        "hiddenDonors": hidden,
    }
    return report
