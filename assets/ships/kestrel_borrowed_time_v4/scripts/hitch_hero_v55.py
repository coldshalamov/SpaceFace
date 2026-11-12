"""Hitch hero V55 / cycle 46: hide the cycle-16 course cards.

A post-V54 inspect of the close camera found the leftover plates:
V25_Course_1 and V25_Course_2. Those are older dorsal cards from the
well-keep pass. Hide the V25 course family and the tiny V8 hatch card.
Keep the trench, wells, formed crown, locker, and repair hatch.
No hull boolean.
"""
from __future__ import annotations

import bpy

from hitch_hero_v54 import apply_hitch_hero_v54
from material_truth_v6 import _root, _source

PASS_ID = "kestrel-hitch-hero-v55"
COLLECTION_NAME = "KESTREL_V55_V25_COURSES"
HIDE_PREFIXES = (
    "V25_Course_",
    "V25_CourseSeam_",
)
HIDE_EXACT = {
    "V8_DorsalHatch",
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


def apply_hitch_hero_v55() -> dict:
    prior = apply_hitch_hero_v54()
    _collection()
    hidden = []
    for obj in bpy.data.objects:
        name = obj.name or ""
        base = name.split(".")[0]
        if name in HIDE_EXACT or base in HIDE_EXACT:
            obj.hide_render = True
            obj.hide_set(True)
            hidden.append(name)
            continue
        if any(name.startswith(prefix) for prefix in HIDE_PREFIXES):
            obj.hide_render = True
            obj.hide_set(True)
            hidden.append(name)
    report = {
        "schema": "spaceface.hitchHero.v55",
        "passId": PASS_ID,
        "method": "hide V25_Course_* cards and V8_DorsalHatch; keep trench and wells",
        "priorPass": "v54",
        "hiddenDonors": hidden,
        "objectsAdded": 0,
        "objectNames": [],
    }
    _root()["hitchHeroPassV55"] = {
        "passId": PASS_ID,
        "hiddenDonors": hidden,
    }
    return report
