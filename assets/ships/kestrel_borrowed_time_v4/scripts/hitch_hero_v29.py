"""Hitch hero V29 / cycle 20: steel lips on the hull bays.

Cycle 19 bays keep but the floors can read as teal stickers. Add a
catch-light coaming around each hull well so the table sees a manufactured
rim, not a painted rectangle.
"""
from __future__ import annotations

import bpy

from hitch_hero_v24 import _stamp
from hitch_hero_v28 import apply_hitch_hero_v28
from hitch_polish_v8 import _folded_plate
from material_truth_v6 import _materials, _profile_prism, _root, _source

PASS_ID = "kestrel-hitch-hero-v29"
COLLECTION_NAME = "KESTREL_V29_BAY_LIPS"
PREFIX = "V29_"

BAYS = (
    ("Aft", "Port", -6.10, -1.55, 1.72, 0.72),
    ("Aft", "Starboard", -6.10, 1.55, 1.72, 0.72),
    ("Mid", "Port", -1.70, -1.55, 1.85, 0.72),
    ("Mid", "Starboard", -1.70, 1.55, 1.85, 0.72),
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


def apply_hitch_hero_v29() -> dict:
    prior = apply_hitch_hero_v28()
    collection = _collection()
    materials = _materials()
    steel = materials["service_steel"]
    objects = []
    for station, side, cx, cy, hx, hy in BAYS:
        name = f"{PREFIX}Lip_{station}_{side}"
        z = 2.06
        objects.append(_stamp(_profile_prism(
            collection, f"{name}_Fore",
            (cx + hx, cy, z), 0.10, hy * 2.05, hy * 2.05, 0.055, 0.055,
            steel, "structural_metal", "hull-bay fore lip",
            detail=2, bevel=0.004,
        )))
        objects.append(_stamp(_profile_prism(
            collection, f"{name}_Aft",
            (cx - hx, cy, z), 0.10, hy * 2.05, hy * 2.05, 0.055, 0.055,
            steel, "structural_metal", "hull-bay aft lip",
            detail=2, bevel=0.004,
        )))
        objects.append(_folded_plate(
            collection, f"{name}_Out",
            (cx - hx, cy + (hy if cy > 0 else -hy), z - 0.02),
            (cx + hx, cy + (hy if cy > 0 else -hy), z - 0.02),
            (cx + hx, cy + (hy if cy > 0 else -hy), z + 0.03),
            (cx - hx, cy + (hy if cy > 0 else -hy), z + 0.03),
            0.045, steel, "structural_metal", "hull-bay outboard lip",
        ))
    report = {
        "schema": "spaceface.hitchHero.v29",
        "passId": PASS_ID,
        "method": "steel lips around hull bays so openings catch table light",
        "priorPass": "v28",
        "objectsAdded": len(objects),
        "objectNames": [obj.name for obj in objects],
    }
    _root()["hitchHeroPassV29"] = {
        "passId": PASS_ID,
        "objectsAdded": int(len(objects)),
    }
    return report
