"""Hitch hero V31 / cycle 22: deeper, larger fore-hull wells.

Cycle 21 wells keep in clay but stay subtle at play size. Recut them
larger and fill with more cassette/feed hardware so the table reads
openings, not hairlines.
"""
from __future__ import annotations

import bpy

from hitch_hero_v16 import _cut_box
from hitch_hero_v24 import _stamp
from hitch_hero_v30 import apply_hitch_hero_v30
from hitch_polish_v8 import _folded_plate
from material_truth_v6 import _materials, _profile_prism, _root, _source

PASS_ID = "kestrel-hitch-hero-v31"
COLLECTION_NAME = "KESTREL_V31_FORE_DEEP"
PREFIX = "V31_"

FORE = (
    ("Port", 3.55, -1.55, 1.55, 0.72, 0.34),
    ("Starboard", 3.55, 1.55, 1.55, 0.72, 0.34),
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


def apply_hitch_hero_v31() -> dict:
    prior = apply_hitch_hero_v30()
    collection = _collection()
    materials = _materials()
    hull = bpy.data.objects.get("LOD0_HULL_Kestrel_PressureHull")
    cuts = []
    objects = []
    steel = materials["service_steel"]
    dark = materials["dark_aperture"]
    armor = materials["armor"]
    if hull is not None:
        for side, cx, cy, hx, hy, hz in FORE:
            ok = _cut_box(hull, f"{PREFIX}DeepCut_{side}", (cx, cy, 1.88), (hx, hy, hz))
            cuts.append(f"{side}={ok}")
    for side, cx, cy, hx, hy, hz in FORE:
        name = f"{PREFIX}Fore_{side}"
        floor_z = 1.54
        lip_z = 2.04
        objects.append(_stamp(_profile_prism(
            collection, f"{name}_Floor",
            (cx, cy, floor_z), hx * 2.0 - 0.10, hy * 2.0 - 0.10, hy * 2.0 - 0.10, 0.04, 0.04,
            dark, "active_aperture", "deeper fore well floor",
            detail=1, bevel=0.003,
        )))
        objects.append(_folded_plate(
            collection, f"{name}_Out",
            (cx - hx, cy + (hy if cy > 0 else -hy), floor_z),
            (cx + hx, cy + (hy if cy > 0 else -hy), floor_z),
            (cx + hx, cy + (hy if cy > 0 else -hy), lip_z),
            (cx - hx, cy + (hy if cy > 0 else -hy), lip_z),
            0.040, armor, "armor_plate", "fore well outboard wall",
        ))
        for i, t in enumerate((0.18, 0.42, 0.66, 0.88)):
            objects.append(_stamp(_profile_prism(
                collection, f"{name}_Cassette_{i}",
                (cx - hx + hx * 2.0 * t, cy, floor_z + 0.13),
                0.38, hy * 1.20, hy * 1.10, 0.22, 0.18,
                steel, "structural_metal", "fore-well cassette the table can count",
                detail=2, bevel=0.005,
            )))
        objects.append(_stamp(_profile_prism(
            collection, f"{name}_LipFore",
            (cx + hx, cy, lip_z), 0.08, hy * 2.02, hy * 2.02, 0.045, 0.045,
            steel, "structural_metal", "fore well fore rim",
            detail=2, bevel=0.003,
        )))
        objects.append(_stamp(_profile_prism(
            collection, f"{name}_LipAft",
            (cx - hx, cy, lip_z), 0.08, hy * 2.02, hy * 2.02, 0.045, 0.045,
            steel, "structural_metal", "fore well aft rim",
            detail=2, bevel=0.003,
        )))
    report = {
        "schema": "spaceface.hitchHero.v31",
        "passId": PASS_ID,
        "method": "deeper larger fore wells so play-size still reads openings",
        "priorPass": "v30",
        "booleanCuts": cuts,
        "objectsAdded": len(objects),
        "objectNames": [obj.name for obj in objects],
    }
    _root()["hitchHeroPassV31"] = {
        "passId": PASS_ID,
        "objectsAdded": int(len(objects)),
        "cuts": int(len(cuts)),
    }
    return report
