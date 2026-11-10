"""Hitch hero V52 / cycle 43: recesses in the crown, not proud cards.

Cycle 42 opened the V5 hatch lids. Close stills still show the cycle-41
inset lids sitting on the crown as cards. Hide those lids. Cut the access
as dark recesses into the eight-sided crown so the table sees holes, not
plates. Keep the crown, cable, locker, and open wells. No hull boolean.
"""
from __future__ import annotations

import bpy

from hitch_hero_v24 import _stamp
from hitch_hero_v51 import apply_hitch_hero_v51
from material_truth_v6 import _materials, _profile_prism, _root, _source

PASS_ID = "kestrel-hitch-hero-v52"
COLLECTION_NAME = "KESTREL_V52_CROWN_RECESS"
PREFIX = "V52_"
HIDE_PREFIXES = ("V50_Inset_", "V50_InsetLip_")


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


def apply_hitch_hero_v52() -> dict:
    prior = apply_hitch_hero_v51()
    collection = _collection()
    materials = _materials()
    hidden = []
    for obj in bpy.data.objects:
        name = obj.name or ""
        if any(name.startswith(prefix) for prefix in HIDE_PREFIXES):
            obj.hide_render = True
            obj.hide_set(True)
            hidden.append(name)
    dark = materials["dark_aperture"]
    steel = materials["service_steel"]
    objects = []
    for name, cx, length in (("Aft", -4.85, 1.05), ("Mid", -2.05, 0.95)):
        objects.append(_stamp(_profile_prism(
            collection, f"{PREFIX}Recess_{name}",
            (cx, 0.0, 2.12),
            length, 0.52, 0.48, 0.06, 0.055,
            dark, "active_aperture",
            "dark access recess cut into the dorsal crown",
            detail=1, bevel=0.004,
        )))
        objects.append(_stamp(_profile_prism(
            collection, f"{PREFIX}RecessLip_{name}",
            (cx, 0.0, 2.18),
            length + 0.16, 0.64, 0.60, 0.018, 0.016,
            steel, "structural_metal",
            "thin steel lip around the crown recess",
            detail=2, bevel=0.003,
        )))
    report = {
        "schema": "spaceface.hitchHero.v52",
        "passId": PASS_ID,
        "method": "hide proud V50 inset lids; dark recesses in the formed crown",
        "priorPass": "v51",
        "hiddenDonors": hidden,
        "objectsAdded": len(objects),
        "objectNames": [obj.name for obj in objects],
    }
    _root()["hitchHeroPassV52"] = {
        "passId": PASS_ID,
        "objectsAdded": int(len(objects)),
        "hiddenDonors": hidden,
    }
    return report
