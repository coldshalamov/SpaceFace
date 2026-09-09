"""Hitch hero V94 / cycle 85: folded lips on the 3Q plate edges.

Cycle 84 put four bolts on the outboard edge. The leftover is a
card with studs, not a brake-formed plate. Keep the stepped tiles
and the bolt rows. Add one thick folded lip along the outboard
edge the store-shot sees. Short plates, not a full-length hat-section.
No hull boolean. No pack hats.
"""
from __future__ import annotations

import bpy

from hitch_hero_v93 import apply_hitch_hero_v93
from hitch_hero_v90 import _lapped
from hitch_hero_v88 import ROWS
from hitch_hero_v79 import _cone_point
from hitch_polish_v8 import _folded_plate
from material_truth_v6 import _materials, _root, _source

PASS_ID = "kestrel-hitch-hero-v94"
COLLECTION_NAME = "KESTREL_V94_PLATE_LIPS"
PREFIX = "V94_"
STEP = 0.040
LIP_HALF = 0.020


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


def _lip(collection, name, x0, x1, t, lift, sign, materials):
    steel = materials["service_steel"]
    return _folded_plate(
        collection, name,
        _lifted(x0 + 0.05, t - LIP_HALF, lift, sign),
        _lifted(x1 - 0.05, t - LIP_HALF, lift, sign),
        _lifted(x1 - 0.05, t + LIP_HALF, lift, sign),
        _lifted(x0 + 0.05, t + LIP_HALF, lift, sign),
        0.042, steel, "structural_metal",
        "brake-formed cone plate outboard lip",
    )


def _side(collection, materials, sign, side):
    objects = []
    for row_name, t0, t1, thickness, plates in ROWS:
        lapped = _lapped(plates)
        for index, (plate_name, x0, x1) in enumerate(lapped):
            plate_thickness = thickness + (STEP if index % 2 == 1 else 0.0)
            lift = plate_thickness * 0.5 + 0.022
            objects.append(_lip(
                collection, f"{PREFIX}Lip_{side}_{row_name}_{plate_name}",
                x0, x1, t1 - 0.02, lift, sign, materials,
            ))
    return objects


def apply_hitch_hero_v94() -> dict:
    prior = apply_hitch_hero_v93()
    collection = _collection()
    materials = _materials()
    objects = []
    objects.extend(_side(collection, materials, -1.0, "Port"))
    objects.extend(_side(collection, materials, 1.0, "Starboard"))
    report = {
        "schema": "spaceface.hitchHero.v94",
        "passId": PASS_ID,
        "method": "brake-formed outboard lip on each stepped cone plate",
        "priorPass": "v93",
        "objectsAdded": len(objects),
        "objectNames": [obj.name for obj in objects],
        "componentReference": "kestrel_midship_material_truth_reference_v1.png",
    }
    _root()["hitchHeroPassV94"] = {
        "passId": PASS_ID,
        "objectsAdded": int(len(objects)),
    }
    return report
