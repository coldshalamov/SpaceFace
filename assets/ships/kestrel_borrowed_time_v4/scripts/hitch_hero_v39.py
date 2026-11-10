"""Hitch hero V39 / cycle 30: sloped casemate instead of box walls.

Cycle 29 kept the open bow trench from the table. Starboard and clay
showed vertical plates standing on the cone. Keep the trench, rims, and
mast. Fold the cheeks into a hat section that follows the cone and
drops toward the guns. No teal. No bow boolean. No well lids.
"""
from __future__ import annotations

import bpy

from hitch_hero_v24 import _stamp
from hitch_hero_v34 import WELLS, apply_hitch_hero_v34
from hitch_polish_v8 import _folded_plate
from material_truth_v6 import (
    _materials,
    _profile_prism,
    _root,
    _source,
    _vertical_frustum,
)

PASS_ID = "kestrel-hitch-hero-v39"
COLLECTION_NAME = "KESTREL_V39_SLOPED_CASEMATE"
PREFIX = "V39_"


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


def apply_hitch_hero_v39() -> dict:
    prior = apply_hitch_hero_v34()
    collection = _collection()
    materials = _materials()
    steel = materials["service_steel"]
    armor = materials["armor"]
    objects = []

    # Hat-section cheeks: wide at the canopy brow, pinched and lower at the guns.
    for sign, side in ((-1.0, "Port"), (1.0, "Starboard")):
        objects.append(_folded_plate(
            collection, f"{PREFIX}Cheek_{side}",
            (7.08, 0.96 * sign, 1.76),
            (10.70, 0.50 * sign, 1.62),
            (10.55, 0.30 * sign, 2.18),
            (7.20, 0.58 * sign, 2.46),
            0.048, armor, "armor_plate",
            f"{side.lower()} sloped casemate cheek that follows the cone",
        ))
        objects.append(_folded_plate(
            collection, f"{PREFIX}Trench_{side}",
            (7.22, 0.52 * sign, 1.80),
            (10.40, 0.26 * sign, 1.68),
            (10.28, 0.18 * sign, 2.02),
            (7.28, 0.34 * sign, 2.18),
            0.032, steel, "structural_metal",
            f"{side.lower()} steel liner inside the sloped trench",
        ))
        objects.append(_folded_plate(
            collection, f"{PREFIX}ConeStrake_{side}",
            (7.15, 1.16 * sign, 1.08),
            (11.00, 0.56 * sign, 0.76),
            (11.00, 0.56 * sign, 1.28),
            (7.15, 1.16 * sign, 1.72),
            0.044, armor, "armor_plate",
            f"{side.lower()} shoulder strake along the cone",
        ))
        objects.append(_stamp(_profile_prism(
            collection, f"{PREFIX}Saddle_{side}",
            (9.45, 0.32 * sign, 1.92),
            0.88, 0.30, 0.22, 0.20, 0.16,
            steel, "structural_metal",
            f"{side.lower()} recoil saddle in the sloped trench",
            detail=2, bevel=0.005,
        )))

    objects.append(_folded_plate(
        collection, f"{PREFIX}AftCoaming",
        (7.08, -0.88, 1.76),
        (7.08, 0.88, 1.76),
        (7.20, 0.56, 2.46),
        (7.20, -0.56, 2.46),
        0.040, steel, "structural_metal",
        "aft hat-section coaming at the canopy brow",
    ))
    objects.append(_folded_plate(
        collection, f"{PREFIX}ForeCoaming",
        (10.70, -0.50, 1.62),
        (10.70, 0.50, 1.62),
        (10.55, 0.28, 2.16),
        (10.55, -0.28, 2.16),
        0.036, steel, "structural_metal",
        "fore hat-section coaming at the guns",
    ))
    objects.append(_folded_plate(
        collection, f"{PREFIX}SensorBrow",
        (6.70, -0.68, 2.02),
        (6.70, 0.68, 2.02),
        (7.22, 0.52, 2.42),
        (7.22, -0.52, 2.42),
        0.042, armor, "armor_plate",
        "folded sensor brow between canopy and trench",
    ))

    for station, side, cx, cy, hx, hy in WELLS:
        name = f"{PREFIX}Rim_{station}_{side}"
        rim_z0 = 2.04
        rim_z1 = 2.30
        out_y = cy + (hy if cy > 0 else -hy)
        in_y = cy + (-0.58 if cy > 0 else 0.58)
        objects.append(_folded_plate(
            collection, f"{name}_Out",
            (cx - hx, out_y, rim_z0),
            (cx + hx, out_y, rim_z0),
            (cx + hx, out_y, rim_z1),
            (cx - hx, out_y, rim_z1),
            0.040, steel, "structural_metal",
            "short steel outboard well rim",
        ))
        objects.append(_folded_plate(
            collection, f"{name}_In",
            (cx - hx, in_y, rim_z0),
            (cx + hx, in_y, rim_z0),
            (cx + hx, in_y, rim_z1),
            (cx - hx, in_y, rim_z1),
            0.036, steel, "structural_metal",
            "short steel inboard well rim",
        ))

    mast_x, mast_y = 0.85, 0.0
    objects.append(_stamp(_vertical_frustum(
        collection, f"{PREFIX}MastTrunk",
        (mast_x, mast_y, 3.15),
        2.10, 0.36, 0.30, 0.16, 0.14,
        steel, "structural_metal",
        "taller dorsal sensor mast the play camera can count",
        bevel=0.008, detail=2,
    )))
    objects.append(_folded_plate(
        collection, f"{PREFIX}MastBlade",
        (mast_x - 0.05, mast_y - 0.04, 3.55),
        (mast_x - 0.05, mast_y + 0.04, 3.55),
        (mast_x - 0.05, mast_y + 0.03, 4.35),
        (mast_x - 0.05, mast_y - 0.03, 4.35),
        0.026, armor, "armor_plate",
        "sensor blade on the taller mast",
    ))
    objects.append(_stamp(_profile_prism(
        collection, f"{PREFIX}MastHead",
        (mast_x + 0.04, mast_y, 4.12),
        0.40, 0.26, 0.20, 0.14, 0.11,
        steel, "structural_metal",
        "mast head housing",
        detail=2, bevel=0.005,
    )))
    objects.append(_folded_plate(
        collection, f"{PREFIX}MastSaddle",
        (mast_x - 0.30, mast_y - 0.22, 2.08),
        (mast_x + 0.30, mast_y - 0.22, 2.08),
        (mast_x + 0.18, mast_y - 0.14, 2.30),
        (mast_x - 0.18, mast_y - 0.14, 2.30),
        0.032, armor, "armor_plate",
        "mast saddle on the pressure hull",
    ))

    report = {
        "schema": "spaceface.hitchHero.v39",
        "passId": PASS_ID,
        "method": "sloped hat-section casemate; short rims; taller mast; skip box walls",
        "priorPass": "v34",
        "skippedPasses": ["v32", "v33", "v35", "v36", "v37", "v38"],
        "objectsAdded": len(objects),
        "objectNames": [obj.name for obj in objects],
    }
    _root()["hitchHeroPassV39"] = {
        "passId": PASS_ID,
        "objectsAdded": int(len(objects)),
    }
    return report
