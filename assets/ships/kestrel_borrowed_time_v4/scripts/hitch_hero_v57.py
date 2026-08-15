"""Hitch hero V57 / cycle 48: open the spine as a trench, not a lid.

Cycle 47 hid Hull_Dorsal_Spine and the close camera did not change. The
blank plate is the V50 crown itself — an eight-sided case looks like a
slab from above. Hide the crown, its buried recesses, and the cable so
the older trench floor and walls are the spine. Keep wells, locker, and
repair hatch. No hull boolean.
"""
from __future__ import annotations

import bpy

from hitch_hero_v56 import apply_hitch_hero_v56
from material_truth_v6 import _root, _source

PASS_ID = "kestrel-hitch-hero-v57"
COLLECTION_NAME = "KESTREL_V57_OPEN_TRENCH"
HIDE_PREFIXES = (
    "V50_Crown",
    "V50_SensorSaddle",
    "V50_Cable",
    "V52_Recess",
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


def apply_hitch_hero_v57() -> dict:
    prior = apply_hitch_hero_v56()
    _collection()
    hidden = []
    for obj in bpy.data.objects:
        name = obj.name or ""
        if any(name.startswith(prefix) for prefix in HIDE_PREFIXES):
            obj.hide_render = True
            obj.hide_set(True)
            hidden.append(name)
    report = {
        "schema": "spaceface.hitchHero.v57",
        "passId": PASS_ID,
        "method": "hide V50 crown slab so the trench is the spine",
        "priorPass": "v56",
        "hiddenDonors": hidden,
        "objectsAdded": 0,
        "objectNames": [],
    }
    _root()["hitchHeroPassV57"] = {
        "passId": PASS_ID,
        "hiddenDonors": hidden,
    }
    return report
