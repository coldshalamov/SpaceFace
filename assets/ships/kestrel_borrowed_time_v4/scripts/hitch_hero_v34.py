"""Hitch hero V34 / cycle 25: steel well interiors that catch table light.

Cycles 18-22 keep the openings. Play-size still sees teal floors as
painted rectangles. Skip the failed bow-deck passes. Recoat every hull
well floor in service steel, raise the walls, and add a second steel
course so the 60-degree table reads machinery, not a sticker.
"""
from __future__ import annotations

import bpy

from hitch_hero_v16 import _cut_box
from hitch_hero_v24 import _stamp
from hitch_hero_v31 import apply_hitch_hero_v31
from hitch_polish_v8 import _folded_plate
from material_truth_v6 import _materials, _profile_prism, _root, _source

PASS_ID = "kestrel-hitch-hero-v34"
COLLECTION_NAME = "KESTREL_V34_STEEL_WELLS"
PREFIX = "V34_"

WELLS = (
    ("Aft", "Port", -6.10, -1.55, 1.72, 0.72),
    ("Aft", "Starboard", -6.10, 1.55, 1.72, 0.72),
    ("Mid", "Port", -1.70, -1.55, 1.85, 0.72),
    ("Mid", "Starboard", -1.70, 1.55, 1.85, 0.72),
    ("Fore", "Port", 3.55, -1.55, 1.55, 0.72),
    ("Fore", "Starboard", 3.55, 1.55, 1.55, 0.72),
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


def apply_hitch_hero_v34() -> dict:
    prior = apply_hitch_hero_v31()
    collection = _collection()
    materials = _materials()
    steel = materials["service_steel"]
    armor = materials["armor"]
    objects = []
    hull = bpy.data.objects.get("LOD0_HULL_Kestrel_PressureHull")
    cuts = []
    if hull is not None:
        for station, side, cx, cy, hx, hy in WELLS:
            ok = _cut_box(hull, f"{PREFIX}Open_{station}_{side}", (cx, cy, 1.90), (hx, hy, 0.36))
            cuts.append(f"{station}_{side}={ok}")
    for station, side, cx, cy, hx, hy in WELLS:
        name = f"{PREFIX}Well_{station}_{side}"
        floor_z = 1.56
        lip_z = 2.06
        objects.append(_stamp(_profile_prism(
            collection, f"{name}_Floor",
            (cx, cy, floor_z), hx * 2.0 - 0.10, hy * 2.0 - 0.10, hy * 2.0 - 0.10, 0.045, 0.040,
            steel, "structural_metal", "steel well floor that catches table light",
            detail=1, bevel=0.003,
        )))
        objects.append(_folded_plate(
            collection, f"{name}_Out",
            (cx - hx, cy + (hy if cy > 0 else -hy), floor_z),
            (cx + hx, cy + (hy if cy > 0 else -hy), floor_z),
            (cx + hx, cy + (hy if cy > 0 else -hy), lip_z),
            (cx - hx, cy + (hy if cy > 0 else -hy), lip_z),
            0.042, armor, "armor_plate", "well outboard wall",
        ))
        objects.append(_folded_plate(
            collection, f"{name}_In",
            (cx - hx, cy + (-0.55 if cy > 0 else 0.55), floor_z),
            (cx + hx, cy + (-0.55 if cy > 0 else 0.55), floor_z),
            (cx + hx, cy + (-0.55 if cy > 0 else 0.55), lip_z),
            (cx - hx, cy + (-0.55 if cy > 0 else 0.55), lip_z),
            0.038, steel, "structural_metal", "well inboard steel course",
        ))
        for i, t in enumerate((0.20, 0.50, 0.80)):
            objects.append(_stamp(_profile_prism(
                collection, f"{name}_Gear_{i}",
                (cx - hx + hx * 2.0 * t, cy, floor_z + 0.12),
                0.40, hy * 1.05, hy * 0.95, 0.20, 0.16,
                steel, "structural_metal", "service gear standing in the well",
                detail=2, bevel=0.005,
            )))
    report = {
        "schema": "spaceface.hitchHero.v34",
        "passId": PASS_ID,
        "method": "steel well interiors so openings catch table light",
        "priorPass": "v31",
        "skippedPasses": ["v32", "v33"],
        "booleanCuts": cuts,
        "objectsAdded": len(objects),
        "objectNames": [obj.name for obj in objects],
    }
    _root()["hitchHeroPassV34"] = {
        "passId": PASS_ID,
        "objectsAdded": int(len(objects)),
        "cuts": int(len(cuts)),
    }
    return report
