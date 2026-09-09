"""Hitch hero V65 / cycle 56: the plates ARE the strip, not jewelry on it.

Cycle 55 laid hard plates, but they sat in the middle of the gray hull
band. Hide those narrow skins. Span each plate from the trench lip to
the well rim so the leftover hull cannot show. Keep standing seams and
the mid hatch. No hull boolean. No pack hats.
"""
from __future__ import annotations

import bpy

from hitch_hero_v24 import _stamp
from hitch_hero_v64 import apply_hitch_hero_v64
from hitch_polish_v8 import _folded_plate
from material_truth_v6 import _materials, _profile_prism, _root, _source

PASS_ID = "kestrel-hitch-hero-v65"
COLLECTION_NAME = "KESTREL_V65_STRIP_SKIN"
PREFIX = "V65_"
HIDE_PREFIXES = (
    "V64_Plate_",
    "V64_Seam_",
    "V64_SeamCap_",
)

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


def _hide_narrow_skins():
    hidden = []
    for obj in bpy.data.objects:
        name = obj.name or ""
        if any(name.startswith(prefix) for prefix in HIDE_PREFIXES):
            obj.hide_render = True
            obj.hide_set(True)
            hidden.append(name)
    return hidden


def _side_skin(collection, materials, sign, side):
    armor = materials["armor"]
    steel = materials["service_steel"]
    objects = []
    y0 = 0.33 * sign
    y1 = 0.95 * sign
    for station, x0, x1, z in PLATES:
        objects.append(_folded_plate(
            collection, f"{PREFIX}Plate_{side}_{station}",
            (x0, y0, z), (x1, y0, z),
            (x1, y1, z), (x0, y1, z),
            0.018, armor, "armor_plate",
            f"{side.lower()} {station.lower()} dorsal strip skin",
        ))
    for i, x in enumerate((-2.40, -0.40)):
        objects.append(_folded_plate(
            collection, f"{PREFIX}Seam_{side}_{i}",
            (x - 0.012, y0, 2.118), (x + 0.012, y0, 2.118),
            (x + 0.012, y1, 2.118), (x - 0.012, y1, 2.118),
            0.028, steel, "structural_metal",
            f"{side.lower()} standing seam on the dorsal strip skin",
        ))
        objects.append(_stamp(_profile_prism(
            collection, f"{PREFIX}SeamCap_{side}_{i}",
            (x, (y0 + y1) * 0.5, 2.155),
            0.04, 0.58, 0.58, 0.016, 0.016,
            steel, "structural_metal",
            f"{side.lower()} standing-seam cap on the strip skin",
            detail=2, bevel=0.002,
        )))
    return objects


def apply_hitch_hero_v65() -> dict:
    prior = apply_hitch_hero_v64()
    collection = _collection()
    materials = _materials()
    hidden = _hide_narrow_skins()
    objects = []
    objects.extend(_side_skin(collection, materials, -1.0, "Port"))
    objects.extend(_side_skin(collection, materials, 1.0, "Starboard"))
    report = {
        "schema": "spaceface.hitchHero.v65",
        "passId": PASS_ID,
        "method": "widen brake-formed plates to cover the whole gray strip",
        "priorPass": "v64",
        "hiddenDonors": hidden,
        "objectsAdded": len(objects),
        "objectNames": [obj.name for obj in objects],
        "componentReference": "kestrel_midship_material_truth_reference_v1.png",
    }
    _root()["hitchHeroPassV65"] = {
        "passId": PASS_ID,
        "objectsAdded": int(len(objects)),
        "hiddenDonors": hidden,
    }
    return report
