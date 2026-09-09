"""Hitch hero V51 / cycle 42: open the V5 hatch lids on the wells.

Cycle 41 put a formed crown on the spine, but the close camera still
sees V5_DorsalHatch_Port/Starboard — the real remaining cards, sitting
on the well lips. Hide those lids and their recesses so the table looks
into the wells and the crown is the only spine skin. Keep the crown,
locker, and hatch. No hull boolean.
"""
from __future__ import annotations

import bpy

from hitch_hero_v50 import apply_hitch_hero_v50
from material_truth_v6 import _root, _source

PASS_ID = "kestrel-hitch-hero-v51"
COLLECTION_NAME = "KESTREL_V51_OPEN_HATCHES"
HIDE_EXACT = {
    "V5_DorsalHatch_Port",
    "V5_DorsalHatch_Starboard",
    "V5_DorsalHatchRecess_Port",
    "V5_DorsalHatchRecess_Starboard",
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


def apply_hitch_hero_v51() -> dict:
    prior = apply_hitch_hero_v50()
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
        "schema": "spaceface.hitchHero.v51",
        "passId": PASS_ID,
        "method": "hide V5 dorsal hatch lids so wells stay open under the formed crown",
        "priorPass": "v50",
        "hiddenDonors": hidden,
        "objectsAdded": 0,
        "objectNames": [],
    }
    _root()["hitchHeroPassV51"] = {
        "passId": PASS_ID,
        "hiddenDonors": hidden,
    }
    return report
