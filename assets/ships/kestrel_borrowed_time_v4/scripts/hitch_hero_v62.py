"""Hitch hero V62 / cycle 53: the gray strip becomes a replaceable course.

Cycle 52 sat a hatch on the leftover hull card. That is still jewelry.
Hide those parts. Stand one long chamfered armor course on each gray
strip, with the hatch cut as a lip on that course. The strip itself is
the manufactured plate. No hull boolean. No pack hats. No extra stickers.
"""
from __future__ import annotations

import bpy

from hitch_hero_v24 import _stamp
from hitch_hero_v61 import apply_hitch_hero_v61
from material_truth_v6 import (
    _axial_cylinder,
    _chamfered_pressure_case,
    _materials,
    _profile_prism,
    _root,
    _source,
)

PASS_ID = "kestrel-hitch-hero-v62"
COLLECTION_NAME = "KESTREL_V62_STRIP_COURSE"
PREFIX = "V62_"
HIDE_PREFIXES = (
    "V61_",
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


def _hide_strip_jewelry():
    hidden = []
    for obj in bpy.data.objects:
        name = obj.name or ""
        if any(name.startswith(prefix) for prefix in HIDE_PREFIXES):
            obj.hide_render = True
            obj.hide_set(True)
            hidden.append(name)
    return hidden


def _course(collection, materials, sign, side):
    """One replaceable dorsal armor course on the gray strip."""
    armor = materials["armor"]
    steel = materials["service_steel"]
    hazard = materials["hazard"]
    objects = []
    y = 0.64 * sign
    objects.append(_stamp(_chamfered_pressure_case(
        collection, f"{PREFIX}Course_{side}",
        (-1.40, y, 2.13),
        4.20, 0.34, 0.08, 0.04, armor,
        "armor_plate",
        f"{side.lower()} replaceable dorsal armor course",
        detail=1,
    )))
    objects.append(_stamp(_chamfered_pressure_case(
        collection, f"{PREFIX}Hatch_{side}",
        (-1.40, y, 2.18),
        0.70, 0.22, 0.05, 0.03, steel,
        "structural_metal",
        f"{side.lower()} access hatch seated in the dorsal course",
        detail=1,
    )))
    objects.append(_stamp(_profile_prism(
        collection, f"{PREFIX}HatchLip_{side}",
        (-1.40, y, 2.205),
        0.32, 0.12, 0.10, 0.018, 0.016,
        steel, "structural_metal",
        f"{side.lower()} dorsal-course hatch lip",
        detail=2, bevel=0.003,
    )))
    objects.append(_stamp(_axial_cylinder(
        collection, f"{PREFIX}HatchLatch_{side}",
        (-1.16, y, 2.215),
        0.015, 0.020, steel, "structural_metal",
        f"{side.lower()} dorsal-course hatch latch",
        segments=8, detail=2, axis="Z",
    )))
    objects.append(_stamp(_profile_prism(
        collection, f"{PREFIX}Mark_{side}",
        (-1.62, y, 2.21),
        0.05, 0.16, 0.16, 0.012, 0.012,
        hazard, "marking",
        f"{side.lower()} dorsal-course service mark",
        detail=2, bevel=0.002,
    )))
    return objects


def apply_hitch_hero_v62() -> dict:
    prior = apply_hitch_hero_v61()
    collection = _collection()
    materials = _materials()
    hidden = _hide_strip_jewelry()
    objects = []
    objects.extend(_course(collection, materials, -1.0, "Port"))
    objects.extend(_course(collection, materials, 1.0, "Starboard"))
    report = {
        "schema": "spaceface.hitchHero.v62",
        "passId": PASS_ID,
        "method": "replace strip jewelry with one chamfered armor course per side",
        "priorPass": "v61",
        "hiddenDonors": hidden,
        "objectsAdded": len(objects),
        "objectNames": [obj.name for obj in objects],
        "componentReference": "kestrel_midship_material_truth_reference_v1.png",
    }
    _root()["hitchHeroPassV62"] = {
        "passId": PASS_ID,
        "objectsAdded": int(len(objects)),
        "hiddenDonors": hidden,
    }
    return report
