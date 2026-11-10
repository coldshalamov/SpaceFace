"""Hitch hero V28 / cycle 19: deeper hull bays + a readable dorsal trench.

Cycle 18 bays keep. Make them larger from the table, and fill the widened
spine trench with service runs so the centerline is not a hairline.
"""
from __future__ import annotations

import bpy

from hitch_hero_v16 import _cut_box
from hitch_hero_v24 import _stamp
from hitch_hero_v27 import apply_hitch_hero_v27
from hitch_polish_v8 import _folded_plate
from material_truth_v6 import _axial_cylinder, _materials, _profile_prism, _root, _source

PASS_ID = "kestrel-hitch-hero-v28"
COLLECTION_NAME = "KESTREL_V28_DEEP_BAYS"
PREFIX = "V28_"

DEEPER_BAYS = (
    ("Aft", "Port", -6.10, -1.55, 1.72, 0.72, 0.34),
    ("Aft", "Starboard", -6.10, 1.55, 1.72, 0.72, 0.34),
    ("Mid", "Port", -1.70, -1.55, 1.85, 0.72, 0.34),
    ("Mid", "Starboard", -1.70, 1.55, 1.85, 0.72, 0.34),
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


def _recut():
    hull = bpy.data.objects.get("LOD0_HULL_Kestrel_PressureHull")
    cuts = []
    if hull is None:
        return cuts
    for station, side, cx, cy, hx, hy, hz in DEEPER_BAYS:
        ok = _cut_box(
            hull, f"{PREFIX}DeepCut_{station}_{side}",
            (cx, cy, 1.88), (hx, hy, hz),
        )
        cuts.append(f"{station}_{side}={ok}")
    return cuts


def _trench_gear(collection, materials):
    objects = []
    steel = materials["service_steel"]
    cable = materials["cable"]
    dark = materials["dark_aperture"]
    objects.append(_stamp(_profile_prism(
        collection, f"{PREFIX}TrenchShadow",
        (-2.20, 0.0, 1.94), 10.4, 0.70, 0.70, 0.035, 0.035,
        dark, "active_aperture", "wider trench shadow the table reads as depth",
        detail=1, bevel=0.002,
    )))
    for i, x in enumerate((-6.20, -3.80, -1.40, 0.80)):
        objects.append(_stamp(_axial_cylinder(
            collection, f"{PREFIX}Run_{i}",
            (x, 0.0, 2.04), 0.030, 2.10, steel,
            "structural_metal", "service run lying in the dorsal trench",
            segments=8, detail=2, axis="X",
        )))
        objects.append(_stamp(_profile_prism(
            collection, f"{PREFIX}Clamp_{i}",
            (x + 0.85, 0.0, 2.08), 0.16, 0.42, 0.36, 0.08, 0.07,
            steel, "structural_metal", "trench cable clamp",
            detail=2, bevel=0.004,
        )))
    objects.append(_folded_plate(
        collection, f"{PREFIX}Hose",
        (-4.10, 0.12, 2.02), (-2.40, -0.10, 2.06),
        (-2.38, -0.10, 2.10), (-4.08, 0.12, 2.06),
        0.018, cable, "cable_elastomer",
        "hose crossing the trench",
    ))
    return objects


def apply_hitch_hero_v28() -> dict:
    prior = apply_hitch_hero_v27()
    collection = _collection()
    materials = _materials()
    cuts = _recut()
    objects = _trench_gear(collection, materials)
    report = {
        "schema": "spaceface.hitchHero.v28",
        "passId": PASS_ID,
        "method": "deeper hull bays; filled dorsal trench",
        "priorPass": "v27",
        "booleanCuts": cuts,
        "objectsAdded": len(objects),
        "objectNames": [obj.name for obj in objects],
    }
    _root()["hitchHeroPassV28"] = {
        "passId": PASS_ID,
        "objectsAdded": int(len(objects)),
        "cuts": int(len(cuts)),
    }
    return report
