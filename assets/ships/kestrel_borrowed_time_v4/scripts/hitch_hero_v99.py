"""Hitch hero V99 / cycle 89: shingle the casemate cheek.

Cycles 87-88 sat three cards on the C30 cheek. Hide those plates
and seams. Rebuild as four overlapping courses that cover the cheek
face so the 3Q reads shingled armor, not stickers. No hull boolean.
No pack hats. No cone-frame bolts.
"""
from __future__ import annotations

import bpy

from hitch_hero_v98 import apply_hitch_hero_v98
from hitch_hero_v97 import A, B, C, D
from hitch_polish_v8 import _folded_plate
from material_truth_v6 import _materials, _root, _source

PASS_ID = "kestrel-hitch-hero-v99"
COLLECTION_NAME = "KESTREL_V99_CASEMATE_SHINGLE"
PREFIX = "V99_"
HIDE_PREFIXES = (
    "V97_Plate_",
    "V98_Seam_",
)

PLATES = (
    ("Aft", 0.00, 0.32, 0.02, 0.88),
    ("AftMid", 0.24, 0.56, 0.02, 0.88),
    ("MidFore", 0.48, 0.80, 0.02, 0.88),
    ("Fore", 0.72, 1.00, 0.02, 0.88),
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


def _hide_cards():
    hidden = []
    for obj in bpy.data.objects:
        name = obj.name or ""
        if any(name.startswith(prefix) for prefix in HIDE_PREFIXES):
            obj.hide_render = True
            obj.hide_set(True)
            hidden.append(name)
    return hidden


def _cheek(u, v, sign, lift=0.052):
    ax, ay, az = A
    bx, by, bz = B
    cx, cy, cz = C
    dx, dy, dz = D
    x = (1 - u) * (1 - v) * ax + u * (1 - v) * bx + u * v * cx + (1 - u) * v * dx
    y = (1 - u) * (1 - v) * ay + u * (1 - v) * by + u * v * cy + (1 - u) * v * dy
    z = (1 - u) * (1 - v) * az + u * (1 - v) * bz + u * v * cz + (1 - u) * v * dz
    return (x, y * sign, z + lift)


def _side(collection, materials, sign, side):
    armor = materials["armor"]
    objects = []
    for name, u0, u1, v0, v1 in PLATES:
        objects.append(_folded_plate(
            collection, f"{PREFIX}Plate_{side}_{name}",
            _cheek(u0, v0, sign),
            _cheek(u1, v0, sign),
            _cheek(u1, v1, sign),
            _cheek(u0, v1, sign),
            0.062, armor, "armor_plate",
            f"{side.lower()} {name.lower()} shingled casemate course",
        ))
    return objects


def apply_hitch_hero_v99() -> dict:
    prior = apply_hitch_hero_v98()
    collection = _collection()
    materials = _materials()
    hidden = _hide_cards()
    objects = []
    objects.extend(_side(collection, materials, -1.0, "Port"))
    objects.extend(_side(collection, materials, 1.0, "Starboard"))
    report = {
        "schema": "spaceface.hitchHero.v99",
        "passId": PASS_ID,
        "method": "four overlapping courses covering the casemate cheek",
        "priorPass": "v98",
        "hiddenDonors": hidden,
        "objectsAdded": len(objects),
        "objectNames": [obj.name for obj in objects],
        "componentReference": "kestrel_bow_weapon_spine_reference_v1.png",
    }
    _root()["hitchHeroPassV99"] = {
        "passId": PASS_ID,
        "objectsAdded": int(len(objects)),
        "hiddenDonors": hidden,
    }
    return report
