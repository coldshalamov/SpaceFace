"""Hitch hero V97 / cycle 87: casemate cheek plates.

Cone corner bolts shredded tangents twice and did not count. The
3Q leftover is now the sloped gun casemate — one cheek per side.
Keep the cone frames. Lay three overlapping plates on each cheek.
No hull boolean. No pack hats. Do not apply the failed bolt pass.
"""
from __future__ import annotations

import bpy

from hitch_hero_v95 import apply_hitch_hero_v95
from hitch_polish_v8 import _folded_plate
from material_truth_v6 import _materials, _root, _source

PASS_ID = "kestrel-hitch-hero-v97"
COLLECTION_NAME = "KESTREL_V97_CASEMATE_PLATES"
PREFIX = "V97_"

# Cheek corners from C30. u=0 canopy brow, u=1 guns. v=0 outboard, v=1 inboard.
A = (7.08, 0.96, 1.76)
B = (10.70, 0.50, 1.62)
C = (10.55, 0.30, 2.18)
D = (7.20, 0.58, 2.46)

PLATES = (
    ("Aft", 0.04, 0.40, 0.12, 0.72),
    ("Mid", 0.32, 0.68, 0.10, 0.70),
    ("Fore", 0.60, 0.96, 0.08, 0.66),
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


def _cheek(u, v, sign):
    ax, ay, az = A
    bx, by, bz = B
    cx, cy, cz = C
    dx, dy, dz = D
    x = (1 - u) * (1 - v) * ax + u * (1 - v) * bx + u * v * cx + (1 - u) * v * dx
    y = (1 - u) * (1 - v) * ay + u * (1 - v) * by + u * v * cy + (1 - u) * v * dy
    z = (1 - u) * (1 - v) * az + u * (1 - v) * bz + u * v * cz + (1 - u) * v * dz
    return (x, y * sign, z + 0.028)


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
            0.044, armor, "armor_plate",
            f"{side.lower()} {name.lower()} casemate cheek plate",
        ))
    return objects


def apply_hitch_hero_v97() -> dict:
    prior = apply_hitch_hero_v95()
    collection = _collection()
    materials = _materials()
    objects = []
    objects.extend(_side(collection, materials, -1.0, "Port"))
    objects.extend(_side(collection, materials, 1.0, "Starboard"))
    report = {
        "schema": "spaceface.hitchHero.v97",
        "passId": PASS_ID,
        "method": "three overlapping plates on each C30 casemate cheek",
        "priorPass": "v95",
        "objectsAdded": len(objects),
        "objectNames": [obj.name for obj in objects],
        "componentReference": "kestrel_bow_weapon_spine_reference_v1.png",
    }
    _root()["hitchHeroPassV97"] = {
        "passId": PASS_ID,
        "objectsAdded": int(len(objects)),
    }
    return report
