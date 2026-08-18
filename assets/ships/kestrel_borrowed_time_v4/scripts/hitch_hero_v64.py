"""Hitch hero V64 / cycle 55: brake-formed plates, not rounded course boxes.

Cycle 54 broke the strip into three overlapping cases. Close still reads
those cases as soapy rounded boxes. Hide the boxes. Lay thin folded
plates with standing seams at the overlaps so the strip is sheet armor.
Keep the mid hatch. No hull boolean. No pack hats.
"""
from __future__ import annotations

import bpy

from hitch_hero_v24 import _stamp
from hitch_hero_v63 import apply_hitch_hero_v63
from hitch_polish_v8 import _folded_plate
from material_truth_v6 import _materials, _profile_prism, _root, _source

PASS_ID = "kestrel-hitch-hero-v64"
COLLECTION_NAME = "KESTREL_V64_PLATE_COURSES"
PREFIX = "V64_"
HIDE_PREFIXES = (
    "V63_Course_",
)

# Thin plate skins. Mid sits 6 mm proud so the crown stays.
PLATES = (
    ("Aft", -3.90, -2.35, 2.118),
    ("Mid", -2.45, -0.35, 2.142),
    ("Fore", -0.45, 1.05, 2.118),
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


def _hide_rounded_boxes():
    hidden = []
    for obj in bpy.data.objects:
        name = obj.name or ""
        if any(name.startswith(prefix) for prefix in HIDE_PREFIXES):
            obj.hide_render = True
            obj.hide_set(True)
            hidden.append(name)
    return hidden


def _side_plates(collection, materials, sign, side):
    armor = materials["armor"]
    steel = materials["service_steel"]
    objects = []
    y0 = 0.48 * sign
    y1 = 0.80 * sign
    for station, x0, x1, z in PLATES:
        objects.append(_folded_plate(
            collection, f"{PREFIX}Plate_{side}_{station}",
            (x0, y0, z), (x1, y0, z),
            (x1, y1, z), (x0, y1, z),
            0.018, armor, "armor_plate",
            f"{side.lower()} {station.lower()} brake-formed dorsal plate",
        ))
    for i, x in enumerate((-2.40, -0.40)):
        objects.append(_folded_plate(
            collection, f"{PREFIX}Seam_{side}_{i}",
            (x - 0.012, y0, 2.118), (x + 0.012, y0, 2.118),
            (x + 0.012, y1, 2.118), (x - 0.012, y1, 2.118),
            0.028, steel, "structural_metal",
            f"{side.lower()} standing seam between dorsal plates",
        ))
        objects.append(_stamp(_profile_prism(
            collection, f"{PREFIX}SeamCap_{side}_{i}",
            (x, (y0 + y1) * 0.5, 2.155),
            0.04, 0.30, 0.30, 0.016, 0.016,
            steel, "structural_metal",
            f"{side.lower()} standing-seam cap",
            detail=2, bevel=0.002,
        )))
    return objects


def apply_hitch_hero_v64() -> dict:
    prior = apply_hitch_hero_v63()
    collection = _collection()
    materials = _materials()
    hidden = _hide_rounded_boxes()
    objects = []
    objects.extend(_side_plates(collection, materials, -1.0, "Port"))
    objects.extend(_side_plates(collection, materials, 1.0, "Starboard"))
    report = {
        "schema": "spaceface.hitchHero.v64",
        "passId": PASS_ID,
        "method": "brake-formed plate skins and standing seams; keep the mid hatch",
        "priorPass": "v63",
        "hiddenDonors": hidden,
        "objectsAdded": len(objects),
        "objectNames": [obj.name for obj in objects],
        "componentReference": "kestrel_midship_material_truth_reference_v1.png",
    }
    _root()["hitchHeroPassV64"] = {
        "passId": PASS_ID,
        "objectsAdded": int(len(objects)),
        "hiddenDonors": hidden,
    }
    return report
