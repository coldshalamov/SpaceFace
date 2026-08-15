"""Hitch hero V92 / cycle 83: a step the store-shot can count.

Cycle 82's 18 mm step was too subtle. Hide those plates. Rebuild with
a 40 mm step so the overlap is a real ledge. Keep well holes. No hull
boolean. No pack hats.
"""
from __future__ import annotations

import bpy

from hitch_hero_v91 import apply_hitch_hero_v91
from hitch_hero_v90 import _lapped
from hitch_hero_v88 import ROWS
from hitch_hero_v80 import _rolled_band
from hitch_hero_v79 import _cone_point
from hitch_polish_v8 import _folded_plate
from material_truth_v6 import _materials, _root, _source

PASS_ID = "kestrel-hitch-hero-v92"
COLLECTION_NAME = "KESTREL_V92_TALL_STEP"
PREFIX = "V92_"
HIDE_PREFIXES = (
    "V91_Plate_",
    "V91_Bolt_",
)
STEP = 0.040


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


def _hide_flush():
    hidden = []
    for obj in bpy.data.objects:
        name = obj.name or ""
        if any(name.startswith(prefix) for prefix in HIDE_PREFIXES):
            obj.hide_render = True
            obj.hide_set(True)
            hidden.append(name)
    return hidden


def _lifted(x, t, lift, sign):
    y, z, ny, nz = _cone_point(x, t, sign)
    return (x, y + ny * lift, z + nz * lift)


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
        "stepped cone plate fastener",
    )


def _side(collection, materials, sign, side):
    armor = materials["armor"]
    objects = []
    for row_name, t0, t1, thickness, plates in ROWS:
        lapped = _lapped(plates)
        for index, (plate_name, x0, x1) in enumerate(lapped):
            plate_thickness = thickness + (STEP if index % 2 == 1 else 0.0)
            objects.append(_rolled_band(
                collection, f"{PREFIX}Plate_{side}_{row_name}_{plate_name}",
                x0, x1, t0, t1, sign, plate_thickness, armor, "armor_plate",
                f"{side.lower()} {row_name.lower()} {plate_name.lower()} tall-step cone shingle",
            ))
            lift = plate_thickness * 0.5 + 0.012
            span = x1 - x0
            for slot, frac in (("Aft", 0.28), ("Fore", 0.72)):
                objects.append(_bolt(
                    collection, f"{PREFIX}Bolt_{side}_{row_name}_{plate_name}_{slot}",
                    x0 + span * frac, t1 - 0.05, lift, sign, materials,
                ))
    return objects


def apply_hitch_hero_v92() -> dict:
    prior = apply_hitch_hero_v91()
    collection = _collection()
    materials = _materials()
    hidden = _hide_flush()
    objects = []
    objects.extend(_side(collection, materials, -1.0, "Port"))
    objects.extend(_side(collection, materials, 1.0, "Starboard"))
    report = {
        "schema": "spaceface.hitchHero.v92",
        "passId": PASS_ID,
        "method": "every other shingled tile is 40 mm thicker so the store-shot can count the step",
        "priorPass": "v91",
        "hiddenDonors": hidden,
        "objectsAdded": len(objects),
        "objectNames": [obj.name for obj in objects],
        "componentReference": "kestrel_midship_material_truth_reference_v1.png",
    }
    _root()["hitchHeroPassV92"] = {
        "passId": PASS_ID,
        "objectsAdded": int(len(objects)),
        "hiddenDonors": hidden,
    }
    return report
