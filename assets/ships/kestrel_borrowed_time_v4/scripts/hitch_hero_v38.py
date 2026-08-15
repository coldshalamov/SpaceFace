"""Hitch hero V38 / cycle 29: play-scale bow casemate, rims, and mast.

Cycle 23 painted a teal deck on the cone and it read as a sticker.
Cycle 26 stood boxes in the wells: play-size keep, clay revise.
Cycles 27-28 put formed hats in the wells: tabletop keep, invisible
at default zoom. The leftover A-list hole is the sealed bow cone and
the play-size tube. Do not boolean the bow (Rubber gasket). Do not
use dark_aperture. Do not lid the wells. Stand hat-section armor
cheeks on the existing cone, raise steel rims the 144-zoom camera
can count, and raise a dorsal sensor mast that breaks the sausage.
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

PASS_ID = "kestrel-hitch-hero-v38"
COLLECTION_NAME = "KESTREL_V38_PLAY_CASEMATE"
PREFIX = "V38_"


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


def apply_hitch_hero_v38() -> dict:
    prior = apply_hitch_hero_v34()
    collection = _collection()
    materials = _materials()
    steel = materials["service_steel"]
    armor = materials["armor"]
    objects = []

    # Play-scale hat-section casemate on the dorsal cone. Open center so
    # the table still sees the existing hull, not a painted bed.
    floor_z = 1.78
    wall_z = 2.88
    for sign, side in ((-1.0, "Port"), (1.0, "Starboard")):
        objects.append(_folded_plate(
            collection, f"{PREFIX}Cheek_{side}",
            (7.05, 0.92 * sign, floor_z),
            (10.85, 0.46 * sign, floor_z - 0.06),
            (10.85, 0.46 * sign, wall_z - 0.18),
            (7.05, 0.88 * sign, wall_z),
            0.050, armor, "armor_plate",
            f"{side.lower()} brake-formed casemate cheek the play camera can count",
        ))
        objects.append(_folded_plate(
            collection, f"{PREFIX}Trench_{side}",
            (7.18, 0.58 * sign, floor_z + 0.02),
            (10.55, 0.28 * sign, floor_z - 0.02),
            (10.55, 0.28 * sign, wall_z - 0.42),
            (7.18, 0.54 * sign, wall_z - 0.28),
            0.036, steel, "structural_metal",
            f"{side.lower()} steel trench wall inside the casemate",
        ))
        objects.append(_folded_plate(
            collection, f"{PREFIX}ConeStrake_{side}",
            (7.20, 1.18 * sign, 1.12),
            (11.05, 0.58 * sign, 0.78),
            (11.05, 0.58 * sign, 1.42),
            (7.20, 1.18 * sign, 1.88),
            0.048, armor, "armor_plate",
            f"{side.lower()} shoulder strake that breaks the sealed cone",
        ))
        objects.append(_folded_plate(
            collection, f"{PREFIX}GunHood_{side}",
            (9.05, 0.18 * sign, wall_z - 0.55),
            (10.35, 0.18 * sign, wall_z - 0.62),
            (10.20, 0.42 * sign, wall_z - 0.08),
            (9.20, 0.42 * sign, wall_z - 0.04),
            0.040, armor, "armor_plate",
            f"{side.lower()} hat-section hood over the gun receiver",
        ))
        objects.append(_stamp(_profile_prism(
            collection, f"{PREFIX}Saddle_{side}",
            (9.55, 0.36 * sign, floor_z + 0.22),
            0.95, 0.36, 0.28, 0.28, 0.22,
            steel, "structural_metal",
            f"{side.lower()} recoil saddle standing in the casemate",
            detail=2, bevel=0.006,
        )))

    objects.append(_folded_plate(
        collection, f"{PREFIX}AftCoaming",
        (7.05, -0.90, floor_z),
        (7.05, 0.90, floor_z),
        (7.05, 0.84, wall_z - 0.06),
        (7.05, -0.84, wall_z - 0.06),
        0.042, steel, "structural_metal",
        "aft casemate coaming at the canopy brow",
    ))
    objects.append(_folded_plate(
        collection, f"{PREFIX}ForeCoaming",
        (10.85, -0.46, floor_z - 0.06),
        (10.85, 0.46, floor_z - 0.06),
        (10.85, 0.40, wall_z - 0.22),
        (10.85, -0.40, wall_z - 0.22),
        0.038, steel, "structural_metal",
        "fore casemate coaming",
    ))
    objects.append(_folded_plate(
        collection, f"{PREFIX}SensorBrow",
        (6.72, -0.72, 2.05),
        (6.72, 0.72, 2.05),
        (7.18, 0.62, 2.62),
        (7.18, -0.62, 2.62),
        0.046, armor, "armor_plate",
        "folded sensor brow between canopy and casemate",
    ))

    # Steel rims above every well so the 144-zoom camera sees a dark hole
    # punched through a bright lip, not a hairline.
    for station, side, cx, cy, hx, hy in WELLS:
        name = f"{PREFIX}Rim_{station}_{side}"
        rim_z0 = 2.04
        rim_z1 = 2.52
        out_y = cy + (hy if cy > 0 else -hy)
        in_y = cy + (-0.58 if cy > 0 else 0.58)
        objects.append(_folded_plate(
            collection, f"{name}_Out",
            (cx - hx, out_y, rim_z0),
            (cx + hx, out_y, rim_z0),
            (cx + hx, out_y, rim_z1),
            (cx - hx, out_y, rim_z1),
            0.046, steel, "structural_metal",
            "play-scale outboard well rim",
        ))
        objects.append(_folded_plate(
            collection, f"{name}_In",
            (cx - hx, in_y, rim_z0),
            (cx + hx, in_y, rim_z0),
            (cx + hx, in_y, rim_z1),
            (cx - hx, in_y, rim_z1),
            0.040, steel, "structural_metal",
            "play-scale inboard well rim",
        ))
        objects.append(_folded_plate(
            collection, f"{name}_Fore",
            (cx + hx, cy - hy, rim_z0),
            (cx + hx, cy + hy, rim_z0),
            (cx + hx, cy + hy * 0.88, rim_z1),
            (cx + hx, cy - hy * 0.88, rim_z1),
            0.040, steel, "structural_metal",
            "play-scale fore well rim",
        ))
        objects.append(_folded_plate(
            collection, f"{name}_Aft",
            (cx - hx, cy - hy, rim_z0),
            (cx - hx, cy + hy, rim_z0),
            (cx - hx, cy + hy * 0.88, rim_z1),
            (cx - hx, cy - hy * 0.88, rim_z1),
            0.040, steel, "structural_metal",
            "play-scale aft well rim",
        ))

    # One dorsal mast the default zoom can count. Not a glowing torus.
    mast_x, mast_y = 0.85, 0.0
    objects.append(_stamp(_vertical_frustum(
        collection, f"{PREFIX}MastTrunk",
        (mast_x, mast_y, 2.95),
        1.70, 0.38, 0.32, 0.18, 0.16,
        steel, "structural_metal",
        "dorsal sensor mast trunk the play camera can count",
        bevel=0.008, detail=2,
    )))
    objects.append(_folded_plate(
        collection, f"{PREFIX}MastBlade",
        (mast_x - 0.06, mast_y - 0.04, 3.35),
        (mast_x - 0.06, mast_y + 0.04, 3.35),
        (mast_x - 0.06, mast_y + 0.03, 4.05),
        (mast_x - 0.06, mast_y - 0.03, 4.05),
        0.028, armor, "armor_plate",
        "sensor blade on the dorsal mast",
    ))
    objects.append(_stamp(_profile_prism(
        collection, f"{PREFIX}MastHead",
        (mast_x + 0.04, mast_y, 3.82),
        0.42, 0.28, 0.22, 0.16, 0.12,
        steel, "structural_metal",
        "mast head housing",
        detail=2, bevel=0.005,
    )))
    objects.append(_folded_plate(
        collection, f"{PREFIX}MastSaddle",
        (mast_x - 0.28, mast_y - 0.22, 2.08),
        (mast_x + 0.28, mast_y - 0.22, 2.08),
        (mast_x + 0.18, mast_y - 0.16, 2.28),
        (mast_x - 0.18, mast_y - 0.16, 2.28),
        0.034, armor, "armor_plate",
        "mast saddle on the pressure hull",
    ))

    report = {
        "schema": "spaceface.hitchHero.v38",
        "passId": PASS_ID,
        "method": "play-scale bow casemate, steel well rims, dorsal mast; no teal, no bow boolean, no well lids",
        "priorPass": "v34",
        "skippedPasses": ["v32", "v33", "v35", "v36", "v37"],
        "objectsAdded": len(objects),
        "objectNames": [obj.name for obj in objects],
    }
    _root()["hitchHeroPassV38"] = {
        "passId": PASS_ID,
        "objectsAdded": int(len(objects)),
    }
    return report
