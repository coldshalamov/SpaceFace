"""Hitch hero V46 / cycle 37: taller inboard frame on the starboard pack.

Cycle 36 framed the port plate from the table. The 3Q still sees the
starboard V6 case as two green bricks because the hat sat too low and
had no inboard cheek. Raise that hat and put a steel inboard wall on
the exact pressure-case home. Keep the port frame. No hull boolean.
"""
from __future__ import annotations

import bpy

from hitch_hero_v24 import _stamp
from hitch_hero_v45 import apply_hitch_hero_v45
from hitch_polish_v8 import _folded_plate
from material_truth_v6 import _materials, _profile_prism, _root, _source

PASS_ID = "kestrel-hitch-hero-v46"
COLLECTION_NAME = "KESTREL_V46_STBD_INBOARD"
PREFIX = "V46_"


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


def apply_hitch_hero_v46() -> dict:
    prior = apply_hitch_hero_v45()
    collection = _collection()
    materials = _materials()
    armor = materials["armor"]
    steel = materials["service_steel"]
    objects = []
    # Exact V6_RepairPodPressureCase home. Inboard is -Y from cy=3.80.
    cx, cy, cz = -1.45, 3.80, 1.34
    hx, hy = 1.60, 0.78
    top_z = 2.42
    objects.append(_folded_plate(
        collection, f"{PREFIX}InCheek",
        (cx - hx, cy - hy, cz),
        (cx + hx, cy - hy, cz),
        (cx + hx * 0.88, cy - hy, top_z),
        (cx - hx * 0.88, cy - hy, top_z),
        0.050, armor, "armor_plate",
        "inboard hat-section cheek the 3Q camera can count",
    ))
    objects.append(_folded_plate(
        collection, f"{PREFIX}OutCheek",
        (cx - hx, cy + hy, cz),
        (cx + hx, cy + hy, cz),
        (cx + hx * 0.88, cy + hy, top_z),
        (cx - hx * 0.88, cy + hy, top_z),
        0.050, armor, "armor_plate",
        "outboard hat-section cheek on the starboard pack",
    ))
    objects.append(_folded_plate(
        collection, f"{PREFIX}Ridge",
        (cx - hx * 0.70, cy - hy * 0.55, top_z - 0.04),
        (cx + hx * 0.70, cy - hy * 0.55, top_z - 0.04),
        (cx + hx * 0.55, cy + hy * 0.20, top_z + 0.10),
        (cx - hx * 0.55, cy + hy * 0.20, top_z + 0.10),
        0.036, steel, "structural_metal",
        "open steel ridge so the green case stays visible",
    ))
    for i, t in enumerate((-0.50, 0.50)):
        objects.append(_stamp(_profile_prism(
            collection, f"{PREFIX}Dog_{i}",
            (cx + hx * t, cy - 0.10, top_z + 0.08),
            0.28, 0.32, 0.26, 0.12, 0.10,
            steel, "structural_metal",
            "tall latch dog on the starboard pack",
            detail=2, bevel=0.004,
        )))
    report = {
        "schema": "spaceface.hitchHero.v46",
        "passId": PASS_ID,
        "method": "taller inboard frame on V6_RepairPodPressureCase; keep port frame",
        "priorPass": "v45",
        "objectsAdded": len(objects),
        "objectNames": [obj.name for obj in objects],
    }
    _root()["hitchHeroPassV46"] = {
        "passId": PASS_ID,
        "objectsAdded": int(len(objects)),
    }
    return report
