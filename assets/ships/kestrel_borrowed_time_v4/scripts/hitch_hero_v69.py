"""Hitch hero V69 / cycle 60: plated course under the thick lids.

Cycle 59 gave the lids real thickness, but the blank hull still shows
between them. Keep those lids. Fill the leftover gray strip with a
cambered course bed so the plates sit in plate, not on a smooth hull.
No hull boolean. No pack hats.
"""
from __future__ import annotations

import bpy

from hitch_hero_v68 import apply_hitch_hero_v68
from hitch_polish_v8 import _folded_plate
from material_truth_v6 import _materials, _root, _source

PASS_ID = "kestrel-hitch-hero-v69"
COLLECTION_NAME = "KESTREL_V69_COURSE_BED"
PREFIX = "V69_"

BEDS = (
    ("Aft", -3.92, -2.32),
    ("Mid", -2.48, -0.32),
    ("Fore", -0.48, 1.08),
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


def _side_beds(collection, materials, sign, side):
    """Cambered course under the thick lids.

    Fiction: the dorsal pressure course the access plates bolt to.
    Forbidden: a second lid, a hat, covering the trench or hatch opening.
    """
    armor = materials["armor"]
    objects = []
    y_in = 0.42 * sign
    y_out = 0.86 * sign
    z_in = 2.118
    z_out = 2.092
    for station, x0, x1 in BEDS:
        objects.append(_folded_plate(
            collection, f"{PREFIX}Bed_{side}_{station}",
            (x0, y_in, z_in), (x1, y_in, z_in),
            (x1, y_out, z_out), (x0, y_out, z_out),
            0.016, armor, "armor_plate",
            f"{side.lower()} {station.lower()} plated course under the lids",
        ))
    return objects


def apply_hitch_hero_v69() -> dict:
    prior = apply_hitch_hero_v68()
    collection = _collection()
    materials = _materials()
    objects = []
    objects.extend(_side_beds(collection, materials, -1.0, "Port"))
    objects.extend(_side_beds(collection, materials, 1.0, "Starboard"))
    report = {
        "schema": "spaceface.hitchHero.v69",
        "passId": PASS_ID,
        "method": "cambered plated course under the thick access lids",
        "priorPass": "v68",
        "hiddenDonors": [],
        "objectsAdded": len(objects),
        "objectNames": [obj.name for obj in objects],
        "componentReference": "kestrel_midship_material_truth_reference_v1.png",
    }
    _root()["hitchHeroPassV69"] = {
        "passId": PASS_ID,
        "objectsAdded": int(len(objects)),
    }
    return report
