"""Hitch hero V32 / cycle 23: constructed bow gun deck the table looks into.

Cycle 22 keeps the fore wells. The leftover sealed read is the pointed
bow: two guns on a closed cone. A hull boolean there shredded the hatch
gasket. Build a gun deck from hat-section walls and a dark bed sitting
on the cone so the 60-degree table looks into feed hardware without
cutting the pressure hull.
"""
from __future__ import annotations

import bpy

from hitch_hero_v24 import _stamp
from hitch_hero_v31 import apply_hitch_hero_v31
from hitch_polish_v8 import _folded_plate
from material_truth_v6 import _materials, _profile_prism, _root, _source

PASS_ID = "kestrel-hitch-hero-v32"
COLLECTION_NAME = "KESTREL_V32_GUN_DECK"
PREFIX = "V32_"


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


def apply_hitch_hero_v32() -> dict:
    prior = apply_hitch_hero_v31()
    collection = _collection()
    materials = _materials()
    armor = materials["armor"]
    steel = materials["service_steel"]
    dark = materials["dark_aperture"]
    cable = materials["cable"]
    objects = []
    # Deck sits on the dorsal cone, forward of the canopy brow (x=6.85).
    bed_z = 1.92
    wall_z = 2.12
    objects.append(_stamp(_profile_prism(
        collection, f"{PREFIX}Bed",
        (8.85, 0.0, bed_z), 3.60, 1.55, 1.20, 0.045, 0.040,
        dark, "active_aperture", "gun-deck bed the table looks down onto",
        detail=1, bevel=0.004,
    )))
    for sign, side in ((-1.0, "Port"), (1.0, "Starboard")):
        objects.append(_folded_plate(
            collection, f"{PREFIX}Cheek_{side}",
            (7.10, 0.78 * sign, bed_z),
            (10.60, 0.52 * sign, bed_z - 0.04),
            (10.60, 0.52 * sign, wall_z - 0.02),
            (7.10, 0.78 * sign, wall_z),
            0.045, armor, "armor_plate",
            f"{side.lower()} brake-formed gun-deck cheek",
        ))
        objects.append(_stamp(_profile_prism(
            collection, f"{PREFIX}Saddle_{side}",
            (9.35, 0.42 * sign, bed_z + 0.10),
            0.95, 0.38, 0.30, 0.18, 0.14,
            steel, "structural_metal",
            f"{side.lower()} recoil saddle in the gun deck",
            detail=2, bevel=0.006,
        )))
        objects.append(_stamp(_profile_prism(
            collection, f"{PREFIX}Cassette_{side}",
            (8.15, 0.38 * sign, bed_z + 0.09),
            0.48, 0.28, 0.22, 0.16, 0.13,
            steel, "structural_metal",
            f"{side.lower()} ready-use cassette on the gun deck",
            detail=2, bevel=0.004,
        )))
    objects.append(_folded_plate(
        collection, f"{PREFIX}ForeCoaming",
        (10.60, -0.52, bed_z - 0.04),
        (10.60, 0.52, bed_z - 0.04),
        (10.60, 0.48, wall_z - 0.04),
        (10.60, -0.48, wall_z - 0.04),
        0.038, steel, "structural_metal",
        "fore gun-deck coaming",
    ))
    objects.append(_folded_plate(
        collection, f"{PREFIX}AftCoaming",
        (7.10, -0.78, bed_z),
        (7.10, 0.78, bed_z),
        (7.10, 0.72, wall_z),
        (7.10, -0.72, wall_z),
        0.038, steel, "structural_metal",
        "aft gun-deck coaming at the canopy brow",
    ))
    objects.append(_folded_plate(
        collection, f"{PREFIX}Feed",
        (8.40, -0.18, bed_z + 0.12),
        (9.10, 0.16, bed_z + 0.14),
        (9.12, 0.16, bed_z + 0.20),
        (8.42, -0.18, bed_z + 0.16),
        0.016, cable, "cable_elastomer",
        "feed belt crossing the gun deck",
    ))
    report = {
        "schema": "spaceface.hitchHero.v32",
        "passId": PASS_ID,
        "method": "constructed bow gun deck; no hull boolean",
        "priorPass": "v31",
        "objectsAdded": len(objects),
        "objectNames": [obj.name for obj in objects],
    }
    _root()["hitchHeroPassV32"] = {
        "passId": PASS_ID,
        "objectsAdded": int(len(objects)),
    }
    return report
