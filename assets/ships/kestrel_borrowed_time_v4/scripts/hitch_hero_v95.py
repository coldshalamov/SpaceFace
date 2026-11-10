"""Hitch hero V95 / cycle 86: frame all four edges of each tile.

Cycle 85 put one outboard lip on each plate. The leftover is still
a card with one edge. Keep that lip. Add inboard, aft, and fore
lips so each tile is a framed panel. Short plates only. No hull
boolean. No pack hats.
"""
from __future__ import annotations

import bpy

from hitch_hero_v94 import apply_hitch_hero_v94
from hitch_hero_v90 import _lapped
from hitch_hero_v88 import ROWS
from hitch_hero_v79 import _cone_point
from hitch_polish_v8 import _folded_plate
from material_truth_v6 import _materials, _root, _source

PASS_ID = "kestrel-hitch-hero-v95"
COLLECTION_NAME = "KESTREL_V95_PLATE_FRAMES"
PREFIX = "V95_"
STEP = 0.040
EDGE = 0.018


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


def _lifted(x, t, lift, sign):
    y, z, ny, nz = _cone_point(x, t, sign)
    return (x, y + ny * lift, z + nz * lift)


def _lip(collection, name, xa, xb, ta, tb, lift, sign, materials):
    steel = materials["service_steel"]
    return _folded_plate(
        collection, name,
        _lifted(xa, ta, lift, sign),
        _lifted(xb, ta, lift, sign),
        _lifted(xb, tb, lift, sign),
        _lifted(xa, tb, lift, sign),
        0.040, steel, "structural_metal",
        "brake-formed cone plate frame lip",
    )


def _side(collection, materials, sign, side):
    objects = []
    for row_name, t0, t1, thickness, plates in ROWS:
        lapped = _lapped(plates)
        for index, (plate_name, x0, x1) in enumerate(lapped):
            plate_thickness = thickness + (STEP if index % 2 == 1 else 0.0)
            lift = plate_thickness * 0.5 + 0.022
            xa, xb = x0 + 0.05, x1 - 0.05
            ta, tb = t0 + 0.04, t1 - 0.04
            objects.append(_lip(
                collection, f"{PREFIX}In_{side}_{row_name}_{plate_name}",
                xa, xb, ta - EDGE, ta + EDGE, lift, sign, materials,
            ))
            objects.append(_lip(
                collection, f"{PREFIX}Aft_{side}_{row_name}_{plate_name}",
                xa - EDGE, xa + EDGE, ta, tb, lift, sign, materials,
            ))
            objects.append(_lip(
                collection, f"{PREFIX}Fore_{side}_{row_name}_{plate_name}",
                xb - EDGE, xb + EDGE, ta, tb, lift, sign, materials,
            ))
    return objects


def apply_hitch_hero_v95() -> dict:
    prior = apply_hitch_hero_v94()
    collection = _collection()
    materials = _materials()
    objects = []
    objects.extend(_side(collection, materials, -1.0, "Port"))
    objects.extend(_side(collection, materials, 1.0, "Starboard"))
    report = {
        "schema": "spaceface.hitchHero.v95",
        "passId": PASS_ID,
        "method": "inboard, aft, and fore lips so each cone tile is a framed panel",
        "priorPass": "v94",
        "objectsAdded": len(objects),
        "objectNames": [obj.name for obj in objects],
        "componentReference": "kestrel_midship_material_truth_reference_v1.png",
    }
    _root()["hitchHeroPassV95"] = {
        "passId": PASS_ID,
        "objectsAdded": int(len(objects)),
    }
    return report
