"""Hitch hero V44 / cycle 35: formed housings around the green repair pods.

Cycle 31 keep is the sloped casemate and dark wells. The leftover toy
read in the close 3Q is the two green repair bricks. Do not hide them.
Stand hat-section cheeks, steel dogs, and a service slit around each
pod so they read as replaceable field packs. No hull boolean. Skip
lids, combs, and the failed slotted-housing boolean.
"""
from __future__ import annotations

import bpy

from hitch_hero_v24 import _stamp
from hitch_hero_v40 import apply_hitch_hero_v40
from hitch_polish_v8 import _folded_plate
from material_truth_v6 import _materials, _profile_prism, _root, _source

PASS_ID = "kestrel-hitch-hero-v44"
COLLECTION_NAME = "KESTREL_V44_REPAIR_HOUSINGS"
PREFIX = "V44_"

# Approximate world homes of the two green field-repair packs on the mid hull.
PODS = (
    ("Port", -1.85, -2.72, 1.52, 1.15, 0.72),
    ("Starboard", -1.85, 2.72, 1.52, 1.15, 0.72),
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


def apply_hitch_hero_v44() -> dict:
    prior = apply_hitch_hero_v40()
    collection = _collection()
    materials = _materials()
    armor = materials["armor"]
    steel = materials["service_steel"]
    repair = materials.get("repair", armor)
    objects = []
    for side, cx, cy, cz, hx, hy in PODS:
        sign = 1.0 if cy > 0 else -1.0
        name = f"{PREFIX}Pack_{side}"
        objects.append(_folded_plate(
            collection, f"{name}_OutCheek",
            (cx - hx, cy + hy * sign, cz - 0.18),
            (cx + hx, cy + hy * sign, cz - 0.18),
            (cx + hx * 0.88, cy + hy * sign, cz + 0.42),
            (cx - hx * 0.88, cy + hy * sign, cz + 0.42),
            0.046, armor, "armor_plate",
            f"{side.lower()} hat-section cheek on the field-repair pack",
        ))
        objects.append(_folded_plate(
            collection, f"{name}_Fore",
            (cx + hx, cy - hy, cz - 0.12),
            (cx + hx, cy + hy, cz - 0.12),
            (cx + hx * 0.92, cy + hy * 0.82, cz + 0.38),
            (cx + hx * 0.92, cy - hy * 0.82, cz + 0.38),
            0.040, steel, "structural_metal",
            f"{side.lower()} fore coaming on the repair pack",
        ))
        objects.append(_folded_plate(
            collection, f"{name}_Aft",
            (cx - hx, cy - hy, cz - 0.12),
            (cx - hx, cy + hy, cz - 0.12),
            (cx - hx * 0.92, cy + hy * 0.82, cz + 0.38),
            (cx - hx * 0.92, cy - hy * 0.82, cz + 0.38),
            0.040, steel, "structural_metal",
            f"{side.lower()} aft coaming on the repair pack",
        ))
        objects.append(_folded_plate(
            collection, f"{name}_Slit",
            (cx - 0.18, cy - hy * 0.35, cz + 0.28),
            (cx + 0.18, cy - hy * 0.35, cz + 0.28),
            (cx + 0.16, cy + hy * 0.35, cz + 0.30),
            (cx - 0.16, cy + hy * 0.35, cz + 0.30),
            0.018, steel, "structural_metal",
            f"{side.lower()} service slit so the pack is not a sealed brick",
        ))
        for i, t in enumerate((-0.55, 0.55)):
            objects.append(_stamp(_profile_prism(
                collection, f"{name}_Dog_{i}",
                (cx + hx * t, cy, cz + 0.36),
                0.22, 0.28, 0.24, 0.10, 0.08,
                steel, "structural_metal",
                f"{side.lower()} latch dog on the repair pack",
                detail=2, bevel=0.004,
            )))
        objects.append(_stamp(_profile_prism(
            collection, f"{name}_Saddle",
            (cx, cy - 0.08 * sign, cz - 0.22),
            hx * 1.7, hy * 1.15, hy * 1.05, 0.12, 0.10,
            repair, "repair_panel",
            f"{side.lower()} saddle under the field-repair pack",
            detail=1, bevel=0.006,
        )))
    report = {
        "schema": "spaceface.hitchHero.v44",
        "passId": PASS_ID,
        "method": "formed housings around green repair packs; no hull boolean",
        "priorPass": "v40",
        "skippedPasses": ["v41", "v42", "v43"],
        "objectsAdded": len(objects),
        "objectNames": [obj.name for obj in objects],
    }
    _root()["hitchHeroPassV44"] = {
        "passId": PASS_ID,
        "objectsAdded": int(len(objects)),
    }
    return report
