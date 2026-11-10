"""Hitch hero V101 / cycle 91: real casemate inspection wells.

Cycle 90 stamped lids inside the shingle volume. They do not read.
Hide those stamps and the solid courses. Rebuild each course with a
hatch hole and a four-wall well, lid, hinge, latch, and corner bolts.
No hull boolean. No pack hats. No cone-frame bolts.
"""
from __future__ import annotations

import bpy

from hitch_hero_v100 import apply_hitch_hero_v100
from hitch_hero_v99 import PLATES, _cheek
from hitch_polish_v8 import _folded_plate
from material_truth_v6 import _materials, _root, _source

PASS_ID = "kestrel-hitch-hero-v101"
COLLECTION_NAME = "KESTREL_V101_CASEMATE_WELLS"
PREFIX = "V101_"
HIDE_PREFIXES = (
    "V99_Plate_",
    "V100_Frame_",
    "V100_Lid_",
)

HATCHES = (
    ("Aft", 0.16, 0.42),
    ("AftMid", 0.40, 0.42),
    ("MidFore", 0.64, 0.42),
    ("Fore", 0.86, 0.40),
)
HU = 0.058
HV = 0.095
OVERLAP = 0.008
FLOOR = 0.018
FACE = 0.094
RIM = 0.102
LID = 0.072
HARDWARE = 0.118
PLATE_THICK = 0.062


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


def _hide_stamps():
    hidden = []
    for obj in bpy.data.objects:
        name = obj.name or ""
        if any(name.startswith(prefix) for prefix in HIDE_PREFIXES):
            obj.hide_render = True
            obj.hide_set(True)
            hidden.append(name)
    return hidden


def _quad(collection, name, u0, v0, u1, v1, sign, lift, thick, material, bill, function):
    if u1 - u0 < 0.012 or v1 - v0 < 0.012:
        return None
    return _folded_plate(
        collection, name,
        _cheek(u0, v0, sign, lift),
        _cheek(u1, v0, sign, lift),
        _cheek(u1, v1, sign, lift),
        _cheek(u0, v1, sign, lift),
        thick, material, bill, function,
    )


def _wall(collection, name, a, b, c, d, thick, material, bill, function):
    return _folded_plate(collection, name, a, b, c, d, thick, material, bill, function)


def _course(collection, materials, sign, side, name, u0, u1, v0, v1, uh, vh):
    armor = materials["armor"]
    objects = []
    hole_u0 = uh - HU
    hole_u1 = uh + HU
    hole_v0 = vh - HV
    hole_v1 = vh + HV
    tiles = (
        ("AftRail", u0, v0, hole_u0 + OVERLAP, v1),
        ("ForeRail", hole_u1 - OVERLAP, v0, u1, v1),
        ("OutRail", hole_u0, v0, hole_u1, hole_v0 + OVERLAP),
        ("InRail", hole_u0, hole_v1 - OVERLAP, hole_u1, v1),
    )
    for tile_name, tu0, tv0, tu1, tv1 in tiles:
        obj = _quad(
            collection, f"{PREFIX}Plate_{side}_{name}_{tile_name}",
            tu0, tv0, tu1, tv1, sign, 0.052, PLATE_THICK,
            armor, "armor_plate",
            f"{side.lower()} {name.lower()} holed casemate course",
        )
        if obj is not None:
            objects.append(obj)
    return objects, hole_u0, hole_v0, hole_u1, hole_v1


def _well(collection, materials, sign, side, name, uh, vh, hole_u0, hole_v0, hole_u1, hole_v1):
    armor = materials["armor"]
    steel = materials["service_steel"]
    hazard = materials["hazard"]
    latch_mat = hazard if name in ("Aft", "MidFore") else steel
    objects = []
    objects.append(_quad(
        collection, f"{PREFIX}Floor_{side}_{name}",
        hole_u0, hole_v0, hole_u1, hole_v1, sign, FLOOR, 0.032,
        steel, "structural_metal", "casemate inspection well floor",
    ))
    objects.append(_wall(
        collection, f"{PREFIX}WallAft_{side}_{name}",
        _cheek(hole_u0, hole_v0, sign, FLOOR),
        _cheek(hole_u0, hole_v1, sign, FLOOR),
        _cheek(hole_u0, hole_v1, sign, FACE),
        _cheek(hole_u0, hole_v0, sign, FACE),
        0.034, steel, "structural_metal", "casemate well aft wall",
    ))
    objects.append(_wall(
        collection, f"{PREFIX}WallFore_{side}_{name}",
        _cheek(hole_u1, hole_v0, sign, FLOOR),
        _cheek(hole_u1, hole_v1, sign, FLOOR),
        _cheek(hole_u1, hole_v1, sign, FACE),
        _cheek(hole_u1, hole_v0, sign, FACE),
        0.034, steel, "structural_metal", "casemate well fore wall",
    ))
    objects.append(_wall(
        collection, f"{PREFIX}WallOut_{side}_{name}",
        _cheek(hole_u0, hole_v0, sign, FLOOR),
        _cheek(hole_u1, hole_v0, sign, FLOOR),
        _cheek(hole_u1, hole_v0, sign, FACE),
        _cheek(hole_u0, hole_v0, sign, FACE),
        0.034, steel, "structural_metal", "casemate well outboard wall",
    ))
    objects.append(_wall(
        collection, f"{PREFIX}WallIn_{side}_{name}",
        _cheek(hole_u0, hole_v1, sign, FLOOR),
        _cheek(hole_u1, hole_v1, sign, FLOOR),
        _cheek(hole_u1, hole_v1, sign, FACE),
        _cheek(hole_u0, hole_v1, sign, FACE),
        0.034, steel, "structural_metal", "casemate well inboard wall",
    ))
    rim_in = 0.016
    rim_out = 0.028
    rims = (
        ("RimAft", hole_u0 - rim_out, hole_v0 - rim_out, hole_u0 + rim_in, hole_v1 + rim_out),
        ("RimFore", hole_u1 - rim_in, hole_v0 - rim_out, hole_u1 + rim_out, hole_v1 + rim_out),
        ("RimOut", hole_u0 + rim_in, hole_v0 - rim_out, hole_u1 - rim_in, hole_v0 + rim_in),
        ("RimIn", hole_u0 + rim_in, hole_v1 - rim_in, hole_u1 - rim_in, hole_v1 + rim_out),
    )
    for rim_name, ru0, rv0, ru1, rv1 in rims:
        objects.append(_quad(
            collection, f"{PREFIX}{rim_name}_{side}_{name}",
            ru0, rv0, ru1, rv1, sign, RIM, 0.034,
            steel, "structural_metal", "casemate well rim",
        ))
    objects.append(_quad(
        collection, f"{PREFIX}Lid_{side}_{name}",
        uh - HU * 0.58, vh - HV * 0.54, uh + HU * 0.58, vh + HV * 0.54,
        sign, LID, 0.036, armor, "armor_plate", "casemate well lid",
    ))
    objects.append(_quad(
        collection, f"{PREFIX}Hinge_{side}_{name}",
        hole_u0 - 0.010, vh - HV * 0.32, hole_u0 + 0.028, vh + HV * 0.32,
        sign, HARDWARE, 0.038, steel, "structural_metal", "casemate well hinge knuckle",
    ))
    objects.append(_quad(
        collection, f"{PREFIX}Latch_{side}_{name}",
        hole_u1 - 0.028, vh - HV * 0.22, hole_u1 + 0.012, vh + HV * 0.22,
        sign, HARDWARE, 0.038, latch_mat,
        "marking" if latch_mat == hazard else "structural_metal",
        "casemate well latch bar",
    ))
    for slot, du, dv in (
        ("AftOut", -0.78, -0.78),
        ("AftIn", -0.78, 0.78),
        ("ForeOut", 0.78, -0.78),
        ("ForeIn", 0.78, 0.78),
    ):
        objects.append(_quad(
            collection, f"{PREFIX}Bolt_{side}_{name}_{slot}",
            uh + HU * du - 0.014, vh + HV * dv - 0.012,
            uh + HU * du + 0.014, vh + HV * dv + 0.012,
            sign, HARDWARE + 0.008, 0.034, steel, "structural_metal",
            "casemate well corner bolt",
        ))
    return [obj for obj in objects if obj is not None]


def _side(collection, materials, sign, side):
    objects = []
    hatches = {name: (u, v) for name, u, v in HATCHES}
    for name, u0, u1, v0, v1 in PLATES:
        uh, vh = hatches[name]
        plates, hole_u0, hole_v0, hole_u1, hole_v1 = _course(
            collection, materials, sign, side, name, u0, u1, v0, v1, uh, vh,
        )
        objects.extend(plates)
        objects.extend(_well(
            collection, materials, sign, side, name, uh, vh,
            hole_u0, hole_v0, hole_u1, hole_v1,
        ))
    return objects


def apply_hitch_hero_v101() -> dict:
    prior = apply_hitch_hero_v100()
    collection = _collection()
    materials = _materials()
    hidden = _hide_stamps()
    objects = []
    objects.extend(_side(collection, materials, -1.0, "Port"))
    objects.extend(_side(collection, materials, 1.0, "Starboard"))
    report = {
        "schema": "spaceface.hitchHero.v101",
        "passId": PASS_ID,
        "method": "holed casemate courses with four-wall inspection wells",
        "priorPass": "v100",
        "hiddenDonors": hidden,
        "objectsAdded": len(objects),
        "objectNames": [obj.name for obj in objects],
        "componentReference": "kestrel_bow_weapon_spine_reference_v1.png",
    }
    _root()["hitchHeroPassV101"] = {
        "passId": PASS_ID,
        "objectsAdded": int(len(objects)),
        "hiddenDonors": hidden,
    }
    return report
