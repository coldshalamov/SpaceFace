"""Hitch hero V35 / cycle 26: proud well hardware that reads at play size.

Cycle 25 steel floors keep from the close table. At default zoom the
wells still collapse to quiet slots. Stand the service gear above the
rim so the 60-degree play camera sees manufactured lumps, not hairlines.
Skip the failed bow-deck passes. No new teal.
"""
from __future__ import annotations

import bpy

from hitch_hero_v16 import _cut_box
from hitch_hero_v24 import _stamp
from hitch_hero_v34 import WELLS, apply_hitch_hero_v34
from hitch_polish_v8 import _folded_plate
from material_truth_v6 import _materials, _profile_prism, _root, _source

PASS_ID = "kestrel-hitch-hero-v35"
COLLECTION_NAME = "KESTREL_V35_PROUD_WELLS"
PREFIX = "V35_"


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


def apply_hitch_hero_v35() -> dict:
    prior = apply_hitch_hero_v34()
    collection = _collection()
    materials = _materials()
    steel = materials["service_steel"]
    armor = materials["armor"]
    objects = []
    hull = bpy.data.objects.get("LOD0_HULL_Kestrel_PressureHull")
    cuts = []
    if hull is not None:
        for station, side, cx, cy, hx, hy in WELLS:
            ok = _cut_box(
                hull, f"{PREFIX}Widen_{station}_{side}",
                (cx, cy, 1.92), (hx + 0.12, hy + 0.08, 0.38),
            )
            cuts.append(f"{station}_{side}={ok}")
    for station, side, cx, cy, hx, hy in WELLS:
        name = f"{PREFIX}Proud_{station}_{side}"
        rim_z = 2.08
        top_z = 2.28
        objects.append(_stamp(_profile_prism(
            collection, f"{name}_Block",
            (cx + hx * 0.15, cy, (rim_z + top_z) * 0.5),
            hx * 1.15, hy * 1.05, hy * 0.92, 0.22, 0.18,
            steel, "structural_metal",
            "proud service block the play camera can count",
            detail=2, bevel=0.006,
        )))
        objects.append(_folded_plate(
            collection, f"{name}_Hood",
            (cx - hx * 0.55, cy - hy * 0.35, rim_z),
            (cx - hx * 0.10, cy + hy * 0.35, rim_z),
            (cx - hx * 0.10, cy + hy * 0.30, top_z),
            (cx - hx * 0.55, cy - hy * 0.30, top_z),
            0.040, armor, "armor_plate",
            "hat-section hood over the proud well block",
        ))
    report = {
        "schema": "spaceface.hitchHero.v35",
        "passId": PASS_ID,
        "method": "proud well hardware above the rim so play-size reads",
        "priorPass": "v34",
        "booleanCuts": cuts,
        "objectsAdded": len(objects),
        "objectNames": [obj.name for obj in objects],
    }
    _root()["hitchHeroPassV35"] = {
        "passId": PASS_ID,
        "objectsAdded": int(len(objects)),
        "cuts": int(len(cuts)),
    }
    return report
