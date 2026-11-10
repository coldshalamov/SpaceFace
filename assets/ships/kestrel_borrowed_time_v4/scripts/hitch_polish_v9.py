"""Hitch V9 extra polish: stay ~20% above the plate-skinned remaster fleet.

Applies V8 (weapon spine, occupied greenhouse, midship courses) then adds
hardware the remasters still do not have: antenna farm, cable trays, airlock
collar, transom heat skirts, and extra overlapping tiles.
"""
from __future__ import annotations

import math

import bpy
from mathutils import Vector

from hitch_polish_v8 import apply_hitch_polish_v8, _folded_plate
from material_truth_v6 import (
    _axial_cylinder,
    _finish,
    _materials,
    _profile_prism,
    _root,
    _source,
    _strut_between,
)


PASS_ID = "kestrel-hitch-polish-v9"
COLLECTION_NAME = "KESTREL_V9_HITCH_POLISH"
PREFIX = "V9_"


def _collection() -> bpy.types.Collection:
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


def _stamp(obj: bpy.types.Object) -> bpy.types.Object:
    obj["sf_polish_pass"] = PASS_ID
    obj["sf_material_truth_pass"] = PASS_ID
    return obj


def _build_antenna_farm(collection, materials):
    objects = []
    steel = materials["service_steel"]
    armor = materials["armor"]
    objects.append(_stamp(_axial_cylinder(
        collection, f"{PREFIX}Mast",
        (-1.85, 0.62, 2.92), 0.038, 0.72, steel,
        "structural_metal", "dorsal comm mast",
        segments=10, detail=1, axis="Z",
    )))
    objects.append(_stamp(_axial_cylinder(
        collection, f"{PREFIX}DishA",
        (-1.72, 0.62, 3.28), 0.16, 0.04, armor,
        "armor_plate", "primary comm dish",
        segments=14, detail=1, axis="X",
    )))
    objects.append(_stamp(_axial_cylinder(
        collection, f"{PREFIX}DishB",
        (-2.15, 0.88, 2.78), 0.10, 0.03, armor,
        "armor_plate", "backup nav dish",
        segments=12, detail=2, axis="Y",
    )))
    objects.append(_stamp(_profile_prism(
        collection, f"{PREFIX}MastYoke",
        (-1.85, 0.62, 2.58), 0.18, 0.16, 0.14, 0.08, 0.06,
        steel, "structural_metal",
        "mast yoke and rotary joint",
        detail=1, bevel=0.006,
    )))
    objects.append(_stamp(_axial_cylinder(
        collection, f"{PREFIX}BladeAntenna",
        (0.85, -0.55, 2.72), 0.012, 0.55, steel,
        "structural_metal", "blade antenna",
        segments=6, detail=2, axis="Z",
    )))
    return objects


def _build_cable_trays(collection, materials):
    objects = []
    steel = materials["service_steel"]
    objects.append(_folded_plate(
        collection, f"{PREFIX}TrayPort",
        (3.40, -2.55, 1.42), (-2.10, -2.72, 1.36),
        (-2.10, -2.62, 1.52), (3.40, -2.45, 1.56),
        0.022, steel, "structural_metal",
        "port service cable tray",
    ))
    objects.append(_folded_plate(
        collection, f"{PREFIX}TrayStarboard",
        (3.40, 2.55, 1.42), (3.40, 2.45, 1.56),
        (-2.10, 2.62, 1.52), (-2.10, 2.72, 1.36),
        0.022, steel, "structural_metal",
        "starboard service cable tray",
    ))
    for i, x in enumerate((2.40, 0.60, -1.20)):
        objects.append(_stamp(_axial_cylinder(
            collection, f"{PREFIX}TrayClamp_{i}",
            (x, -2.58, 1.48), 0.018, 0.08, steel,
            "structural_metal", "cable tray clamp",
            segments=8, detail=2, axis="Y",
        )))
        objects.append(_stamp(_strut_between(
            collection, f"{PREFIX}Hose_{i}",
            (x + 0.15, -2.50, 1.52), (x - 0.35, -2.15, 1.85),
            0.016, steel, "structural_metal",
            "service hose into the dorsal run",
        )))
    return objects


def _build_airlock(collection, materials):
    objects = []
    armor = materials["armor"]
    steel = materials["service_steel"]
    objects.append(_stamp(_profile_prism(
        collection, f"{PREFIX}AirlockCollar",
        (-4.85, 0.0, 2.42), 0.55, 0.72, 0.62, 0.18, 0.14,
        armor, "armor_plate",
        "boarding airlock collar",
        detail=1, bevel=0.010,
    )))
    objects.append(_stamp(_profile_prism(
        collection, f"{PREFIX}AirlockDoor",
        (-4.85, 0.0, 2.58), 0.08, 0.42, 0.38, 0.04, 0.03,
        steel, "structural_metal",
        "airlock hatch leaf",
        detail=1, bevel=0.004,
    )))
    for i, (ox, oy) in enumerate(((-0.18, -0.22), (-0.18, 0.22), (0.18, -0.22), (0.18, 0.22))):
        objects.append(_stamp(_axial_cylinder(
            collection, f"{PREFIX}AirlockDog_{i}",
            (-4.85 + ox, oy, 2.62), 0.016, 0.04, steel,
            "structural_metal", "airlock hatch dog",
            segments=8, detail=2, axis="Z",
        )))
    return objects


def _build_heat_skirts(collection, materials):
    objects = []
    armor = materials["armor"]
    ceramic = materials.get("ceramic") or armor
    for sign, side in ((-1.0, "Port"), (1.0, "Starboard")):
        objects.append(_folded_plate(
            collection, f"{PREFIX}HeatSkirt_{side}",
            (-11.20, 1.15 * sign, -0.35), (-12.85, 0.85 * sign, -0.22),
            (-12.85, 0.85 * sign, 0.55), (-11.20, 1.15 * sign, 0.48),
            0.036, ceramic, "ceramic_isolator",
            "transom heat skirt plate",
        ))
    objects.append(_folded_plate(
        collection, f"{PREFIX}HeatSkirt_Keel",
        (-11.40, -0.55, -1.15), (-12.70, -0.42, -0.95),
        (-12.70, 0.42, -0.95), (-11.40, 0.55, -1.15),
        0.038, ceramic, "ceramic_isolator",
        "keel heat skirt under the transom",
    ))
    return objects


def _build_extra_tiles(collection, materials):
    objects = []
    armor = materials["armor"]
    hull = materials.get("hull") or armor
    tiles = (
        ((5.40, -1.85, 1.05), (0.55, 0.22, 0.028)),
        ((4.10, 1.65, 1.12), (0.48, 0.20, 0.026)),
        ((1.20, -2.15, 0.72), (0.62, 0.24, 0.030)),
        ((-0.40, 2.05, 0.68), (0.52, 0.22, 0.028)),
        ((-2.80, -1.55, 1.35), (0.44, 0.18, 0.024)),
        ((-3.60, 1.35, 1.42), (0.40, 0.16, 0.022)),
        ((2.20, 0.00, 2.48), (0.58, 0.32, 0.026)),
        ((-6.20, 0.00, -1.55), (0.72, 0.28, 0.030)),
    )
    for index, (loc, scale) in enumerate(tiles):
        objects.append(_stamp(_profile_prism(
            collection, f"{PREFIX}Tile_{index}",
            loc, scale[0] * 2, scale[1] * 2, scale[1] * 1.6, scale[2], scale[2] * 0.8,
            armor if index % 2 == 0 else hull, "armor_plate",
            "extra overlapping hull tile",
            detail=1, bevel=0.006,
        )))
    return objects


def apply_hitch_polish_v9() -> dict:
    v8 = apply_hitch_polish_v8()
    collection = _collection()
    materials = _materials()
    objects = []
    objects.extend(_build_antenna_farm(collection, materials))
    objects.extend(_build_cable_trays(collection, materials))
    objects.extend(_build_airlock(collection, materials))
    objects.extend(_build_heat_skirts(collection, materials))
    objects.extend(_build_extra_tiles(collection, materials))
    root = _root()
    report = {
        "schema": "spaceface.hitchPolish.v9",
        "passId": PASS_ID,
        "v8": v8,
        "objectsAdded": len(objects),
        "objectNames": [obj.name for obj in objects],
        "extras": [
            "dorsal antenna farm the remasters do not have",
            "port/starboard cable trays with hose drops",
            "boarding airlock collar with hatch dogs",
            "ceramic transom heat skirts",
            "eight extra overlapping hull tiles",
        ],
        "brainstorm": [
            "keep Hitch denser than the new plate-skin remasters",
            "add service hardware, not another plate wrap copy",
            "heat skirts and airlock so the aft and dorsal read occupied",
        ],
    }
    root["hitchPolishPassV9"] = report
    return report
