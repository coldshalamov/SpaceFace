"""Hitch hero V89 / cycle 80: steel joints and face fasteners.

Cycle 79 broke the sausage into tiles. The 3Q can count plates, but
the gaps show hull and the tiles have no hardware. Cover the 70 mm
joints with a recessed steel strap. Put two fasteners on the outboard
edge the store-shot sees. Leave well holes open. No hull boolean.
No pack hats.
"""
from __future__ import annotations

import bpy

from hitch_hero_v88 import ROWS, apply_hitch_hero_v88
from hitch_hero_v80 import _rolled_band
from hitch_hero_v79 import _cone_point
from hitch_polish_v8 import _folded_plate
from material_truth_v6 import _materials, _root, _source

PASS_ID = "kestrel-hitch-hero-v89"
COLLECTION_NAME = "KESTREL_V89_PLATE_JOINTS"
PREFIX = "V89_"


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


def _gaps(plates):
    ordered = sorted(plates, key=lambda row: row[1])
    gaps = []
    for index in range(len(ordered) - 1):
        _name, _x0, x1 = ordered[index]
        next_name, next_x0, _x1 = ordered[index + 1]
        width = next_x0 - x1
        if 0.04 < width < 0.16:
            gaps.append((f"{_name}_{next_name}", x1, next_x0))
    return gaps


def _strap(collection, name, x0, x1, t0, t1, sign, materials):
    steel = materials["service_steel"]
    return _rolled_band(
        collection, name,
        x0, x1, t0 + 0.04, t1 - 0.04, sign, 0.030, steel, "structural_metal",
        "cone plate butt-joint strap",
    )


def _bolt(collection, name, x, t, lift, sign, materials):
    steel = materials["service_steel"]
    hx, ht = 0.020, 0.014
    return _folded_plate(
        collection, name,
        _lifted(x - hx, t - ht, lift, sign),
        _lifted(x + hx, t - ht, lift, sign),
        _lifted(x + hx, t + ht, lift, sign),
        _lifted(x - hx, t + ht, lift, sign),
        0.032, steel, "structural_metal",
        "cone plate face fastener",
    )


def _side(collection, materials, sign, side):
    objects = []
    for row_name, t0, t1, thickness, plates in ROWS:
        for gap_name, x0, x1 in _gaps(plates):
            objects.append(_strap(
                collection, f"{PREFIX}Strap_{side}_{row_name}_{gap_name}",
                x0, x1, t0, t1, sign, materials,
            ))
        lift = thickness * 0.5 + 0.012
        for plate_name, x0, x1 in plates:
            span = x1 - x0
            for slot, frac in (("Aft", 0.28), ("Fore", 0.72)):
                objects.append(_bolt(
                    collection, f"{PREFIX}Bolt_{side}_{row_name}_{plate_name}_{slot}",
                    x0 + span * frac, t1 - 0.05, lift, sign, materials,
                ))
    return objects


def apply_hitch_hero_v89() -> dict:
    prior = apply_hitch_hero_v88()
    collection = _collection()
    materials = _materials()
    objects = []
    objects.extend(_side(collection, materials, -1.0, "Port"))
    objects.extend(_side(collection, materials, 1.0, "Starboard"))
    report = {
        "schema": "spaceface.hitchHero.v89",
        "passId": PASS_ID,
        "method": "recessed steel joint straps plus two outboard face fasteners per plate",
        "priorPass": "v88",
        "objectsAdded": len(objects),
        "objectNames": [obj.name for obj in objects],
        "componentReference": "kestrel_midship_material_truth_reference_v1.png",
    }
    _root()["hitchHeroPassV89"] = {
        "passId": PASS_ID,
        "objectsAdded": int(len(objects)),
    }
    return report
