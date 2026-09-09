"""Hitch hero V45 / cycle 36: housings on the real repair meshes.

Cycle 35 guessed pack homes and missed. The green reads are
FieldRepair_Port_Plate at (-0.75, -2.88, 0.20) and
V6_RepairPodPressureCase at (-1.45, 3.80, 1.34). Stand hat-section
cheeks and steel dogs on those exact objects. Do not hide the green.
No hull boolean. Skip lids, combs, and the failed housing boolean.
"""
from __future__ import annotations

import bpy

from hitch_hero_v24 import _stamp
from hitch_hero_v40 import apply_hitch_hero_v40
from hitch_polish_v8 import _folded_plate
from material_truth_v6 import _materials, _profile_prism, _root, _source

PASS_ID = "kestrel-hitch-hero-v45"
COLLECTION_NAME = "KESTREL_V45_REAL_PACKS"
PREFIX = "V45_"


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


def _housing(collection, materials, name, cx, cy, cz, hx, hy, top_z):
    armor = materials["armor"]
    steel = materials["service_steel"]
    objects = []
    sign = 1.0 if cy >= 0 else -1.0
    objects.append(_folded_plate(
        collection, f"{name}_OutCheek",
        (cx - hx, cy + hy * sign, cz),
        (cx + hx, cy + hy * sign, cz),
        (cx + hx * 0.90, cy + hy * sign, top_z),
        (cx - hx * 0.90, cy + hy * sign, top_z),
        0.048, armor, "armor_plate",
        "hat-section cheek on the real repair pack",
    ))
    objects.append(_folded_plate(
        collection, f"{name}_Fore",
        (cx + hx, cy - hy, cz),
        (cx + hx, cy + hy, cz),
        (cx + hx * 0.92, cy + hy * 0.80, top_z),
        (cx + hx * 0.92, cy - hy * 0.80, top_z),
        0.040, steel, "structural_metal",
        "fore coaming on the real repair pack",
    ))
    objects.append(_folded_plate(
        collection, f"{name}_Aft",
        (cx - hx, cy - hy, cz),
        (cx - hx, cy + hy, cz),
        (cx - hx * 0.92, cy + hy * 0.80, top_z),
        (cx - hx * 0.92, cy - hy * 0.80, top_z),
        0.040, steel, "structural_metal",
        "aft coaming on the real repair pack",
    ))
    objects.append(_folded_plate(
        collection, f"{name}_LidGap",
        (cx - hx * 0.35, cy - hy * 0.40, top_z - 0.02),
        (cx + hx * 0.35, cy - hy * 0.40, top_z - 0.02),
        (cx + hx * 0.32, cy + hy * 0.40, top_z),
        (cx - hx * 0.32, cy + hy * 0.40, top_z),
        0.020, steel, "structural_metal",
        "service slit so the pack is not a sealed brick",
    ))
    for i, t in enumerate((-0.55, 0.55)):
        objects.append(_stamp(_profile_prism(
            collection, f"{name}_Dog_{i}",
            (cx + hx * t, cy, top_z + 0.06),
            0.24, 0.30, 0.26, 0.10, 0.08,
            steel, "structural_metal",
            "latch dog on the real repair pack",
            detail=2, bevel=0.004,
        )))
    return objects


def apply_hitch_hero_v45() -> dict:
    prior = apply_hitch_hero_v40()
    collection = _collection()
    materials = _materials()
    objects = []
    # Thin port plate: give it a standing pack the table can count.
    objects.extend(_housing(
        collection, materials, f"{PREFIX}PortPlate",
        -0.75, -2.88, 0.90, 2.05, 0.42, 1.72,
    ))
    # Existing starboard pressure case: raise a readable hat over the V6 brick.
    objects.extend(_housing(
        collection, materials, f"{PREFIX}StbdCase",
        -1.45, 3.80, 1.34, 1.55, 0.72, 2.08,
    ))
    report = {
        "schema": "spaceface.hitchHero.v45",
        "passId": PASS_ID,
        "method": "housings on FieldRepair_Port_Plate and V6_RepairPodPressureCase",
        "priorPass": "v40",
        "skippedPasses": ["v41", "v42", "v43", "v44"],
        "objectsAdded": len(objects),
        "objectNames": [obj.name for obj in objects],
    }
    _root()["hitchHeroPassV45"] = {
        "passId": PASS_ID,
        "objectsAdded": int(len(objects)),
        "portPlate": (-0.75, -2.88, 0.20),
        "stbdCase": (-1.45, 3.80, 1.34),
    }
    return report
