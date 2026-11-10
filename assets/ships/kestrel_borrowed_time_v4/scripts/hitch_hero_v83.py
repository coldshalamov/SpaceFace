"""Hitch hero V83 / cycle 74: real well walls, not stacked cards.

Cycle 73 inset three plates and they still read as cards. Hide those
wells. Keep the conduit. Build a four-wall box with a floor and an
inset lid so the camera sees a cavity. No hull boolean. No pack hats.
"""
from __future__ import annotations

import bpy

from hitch_hero_v82 import apply_hitch_hero_v82
from hitch_hero_v79 import _cone_point
from hitch_polish_v8 import _folded_plate
from material_truth_v6 import _materials, _root, _source

PASS_ID = "kestrel-hitch-hero-v83"
COLLECTION_NAME = "KESTREL_V83_WELL_WALLS"
PREFIX = "V83_"
HIDE_PREFIXES = (
    "V82_Well_",
)

WELLS = (
    ("InAft", 2.72, 0.24, 0.040),
    ("InMid", 4.90, 0.26, 0.040),
    ("InFore", 7.06, 0.22, 0.040),
    ("InNose", 9.22, 0.20, 0.040),
    ("OutAftMid", 3.82, 0.72, 0.032),
    ("OutMidFore", 6.00, 0.70, 0.032),
    ("OutForeOut", 8.18, 0.68, 0.032),
)

HX = 0.22
HT = 0.080
DEPTH = 0.048


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


def _hide_card_wells():
    hidden = []
    for obj in bpy.data.objects:
        name = obj.name or ""
        if any(name.startswith(prefix) for prefix in HIDE_PREFIXES):
            obj.hide_render = True
            obj.hide_set(True)
            hidden.append(name)
    return hidden


def _lifted(x, t, lift, sign):
    y, z, ny, nz = _cone_point(x, t, sign)
    return (x, y + ny * lift, z + nz * lift)


def _box(collection, name, x, t, face, sign, materials):
    armor = materials["armor"]
    steel = materials["service_steel"]
    floor = face - DEPTH
    rim = face + 0.006
    xa, xb = x - HX, x + HX
    ta, tb = t - HT, t + HT
    objects = [
        _folded_plate(
            collection, f"{name}_Floor",
            _lifted(xa, ta, floor, sign),
            _lifted(xb, ta, floor, sign),
            _lifted(xb, tb, floor, sign),
            _lifted(xa, tb, floor, sign),
            0.028, steel, "structural_metal",
            "cone inspection well floor",
        ),
        _folded_plate(
            collection, f"{name}_WallAft",
            _lifted(xa, ta, floor, sign),
            _lifted(xa, tb, floor, sign),
            _lifted(xa, tb, rim, sign),
            _lifted(xa, ta, rim, sign),
            0.026, steel, "structural_metal",
            "cone inspection well aft wall",
        ),
        _folded_plate(
            collection, f"{name}_WallFore",
            _lifted(xb, ta, floor, sign),
            _lifted(xb, tb, floor, sign),
            _lifted(xb, tb, rim, sign),
            _lifted(xb, ta, rim, sign),
            0.026, steel, "structural_metal",
            "cone inspection well fore wall",
        ),
        _folded_plate(
            collection, f"{name}_WallIn",
            _lifted(xa, ta, floor, sign),
            _lifted(xb, ta, floor, sign),
            _lifted(xb, ta, rim, sign),
            _lifted(xa, ta, rim, sign),
            0.026, steel, "structural_metal",
            "cone inspection well inboard wall",
        ),
        _folded_plate(
            collection, f"{name}_WallOut",
            _lifted(xa, tb, floor, sign),
            _lifted(xb, tb, floor, sign),
            _lifted(xb, tb, rim, sign),
            _lifted(xa, tb, rim, sign),
            0.026, steel, "structural_metal",
            "cone inspection well outboard wall",
        ),
        _folded_plate(
            collection, f"{name}_Lid",
            _lifted(x - HX * 0.62, t - HT * 0.58, face - 0.016, sign),
            _lifted(x + HX * 0.62, t - HT * 0.58, face - 0.016, sign),
            _lifted(x + HX * 0.62, t + HT * 0.58, face - 0.016, sign),
            _lifted(x - HX * 0.62, t + HT * 0.58, face - 0.016, sign),
            0.034, armor, "armor_plate",
            "cone inspection well lid",
        ),
    ]
    return objects


def _side(collection, materials, sign, side):
    objects = []
    for name, x, t, face in WELLS:
        objects.extend(_box(
            collection, f"{PREFIX}Box_{side}_{name}",
            x, t, face, sign, materials,
        ))
    return objects


def apply_hitch_hero_v83() -> dict:
    prior = apply_hitch_hero_v82()
    collection = _collection()
    materials = _materials()
    hidden = _hide_card_wells()
    objects = []
    objects.extend(_side(collection, materials, -1.0, "Port"))
    objects.extend(_side(collection, materials, 1.0, "Starboard"))
    report = {
        "schema": "spaceface.hitchHero.v83",
        "passId": PASS_ID,
        "method": "four-wall inspection boxes with floor and inset lid",
        "priorPass": "v82",
        "hiddenDonors": hidden,
        "objectsAdded": len(objects),
        "objectNames": [obj.name for obj in objects],
        "componentReference": "kestrel_midship_material_truth_reference_v1.png",
    }
    _root()["hitchHeroPassV83"] = {
        "passId": PASS_ID,
        "objectsAdded": int(len(objects)),
        "hiddenDonors": hidden,
    }
    return report
