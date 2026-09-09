"""Hitch hero V63 / cycle 54: overlapping dorsal courses, not one long slab.

Cycle 53 covered the gray strip with one chamfered plate. Close still
reads that plate as a slab. Hide it. Lay three overlapping eight-sided
courses with a slight crown, hatch on the mid course. Same strip home.
No hull boolean. No pack hats. No extra stickers beside the courses.
"""
from __future__ import annotations

import bpy

from hitch_hero_v24 import _stamp
from hitch_hero_v62 import apply_hitch_hero_v62
from material_truth_v6 import (
    _axial_cylinder,
    _chamfered_pressure_case,
    _materials,
    _profile_prism,
    _root,
    _source,
)

PASS_ID = "kestrel-hitch-hero-v63"
COLLECTION_NAME = "KESTREL_V63_STRIP_COURSES"
PREFIX = "V63_"
HIDE_PREFIXES = (
    "V62_",
)

# Three overlapping courses per strip. Mid sits proud so the row has a crown.
SECTIONS = (
    ("Aft", -3.15, 1.55, 2.112),
    ("Mid", -1.40, 1.72, 2.148),
    ("Fore", 0.28, 1.48, 2.112),
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


def _hide_long_slab():
    hidden = []
    for obj in bpy.data.objects:
        name = obj.name or ""
        if any(name.startswith(prefix) for prefix in HIDE_PREFIXES):
            obj.hide_render = True
            obj.hide_set(True)
            hidden.append(name)
    return hidden


def _side_courses(collection, materials, sign, side):
    armor = materials["armor"]
    steel = materials["service_steel"]
    hazard = materials["hazard"]
    objects = []
    y = 0.64 * sign
    for station, x, length, z in SECTIONS:
        objects.append(_stamp(_chamfered_pressure_case(
            collection, f"{PREFIX}Course_{side}_{station}",
            (x, y, z),
            length, 0.34, 0.07, 0.035, armor,
            "armor_plate",
            f"{side.lower()} {station.lower()} dorsal armor course",
            detail=1,
        )))
    objects.append(_stamp(_chamfered_pressure_case(
        collection, f"{PREFIX}Hatch_{side}",
        (-1.40, y, 2.195),
        0.62, 0.20, 0.045, 0.028, steel,
        "structural_metal",
        f"{side.lower()} hatch seated in the mid dorsal course",
        detail=1,
    )))
    objects.append(_stamp(_profile_prism(
        collection, f"{PREFIX}HatchLip_{side}",
        (-1.40, y, 2.218),
        0.28, 0.10, 0.09, 0.016, 0.014,
        steel, "structural_metal",
        f"{side.lower()} mid-course hatch lip",
        detail=2, bevel=0.003,
    )))
    objects.append(_stamp(_axial_cylinder(
        collection, f"{PREFIX}HatchLatch_{side}",
        (-1.18, y, 2.228),
        0.014, 0.018, steel, "structural_metal",
        f"{side.lower()} mid-course hatch latch",
        segments=8, detail=2, axis="Z",
    )))
    objects.append(_stamp(_profile_prism(
        collection, f"{PREFIX}Mark_{side}",
        (-1.58, y, 2.222),
        0.045, 0.14, 0.14, 0.012, 0.012,
        hazard, "marking",
        f"{side.lower()} mid-course service mark",
        detail=2, bevel=0.002,
    )))
    return objects


def apply_hitch_hero_v63() -> dict:
    prior = apply_hitch_hero_v62()
    collection = _collection()
    materials = _materials()
    hidden = _hide_long_slab()
    objects = []
    objects.extend(_side_courses(collection, materials, -1.0, "Port"))
    objects.extend(_side_courses(collection, materials, 1.0, "Starboard"))
    report = {
        "schema": "spaceface.hitchHero.v63",
        "passId": PASS_ID,
        "method": "three overlapping chamfered courses with a crown on each gray strip",
        "priorPass": "v62",
        "hiddenDonors": hidden,
        "objectsAdded": len(objects),
        "objectNames": [obj.name for obj in objects],
        "componentReference": "kestrel_midship_material_truth_reference_v1.png",
    }
    _root()["hitchHeroPassV63"] = {
        "passId": PASS_ID,
        "objectsAdded": int(len(objects)),
        "hiddenDonors": hidden,
    }
    return report
