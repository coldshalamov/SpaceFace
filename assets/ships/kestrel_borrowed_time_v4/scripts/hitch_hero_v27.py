"""Hitch hero V27 / cycle 18: look-down hull bays in the pressure vessel.

Cycle 16 wells keep. Cycle 17 chines did not read. The table still sees a
long oval hull. Cut four +Z service bays into the pressure hull beside the
spine — the same construction as the sponson cassettes, now on the body
the play camera stares at.
"""
from __future__ import annotations

import bpy

from hitch_hero_v16 import _cut_box
from hitch_hero_v24 import _stamp
from hitch_hero_v25 import apply_hitch_hero_v25
from hitch_polish_v8 import _folded_plate
from material_truth_v6 import _materials, _profile_prism, _root, _source

PASS_ID = "kestrel-hitch-hero-v27"
COLLECTION_NAME = "KESTREL_V27_HULL_BAYS"
PREFIX = "V27_"

# Four dorsal bays: aft/mid × port/starboard. Stay off the canopy (x>1.2)
# and off the 0.84-wide spine.
HULL_BAYS = (
    ("Aft", "Port", -6.10, -1.55, 1.55, 0.62, 0.28),
    ("Aft", "Starboard", -6.10, 1.55, 1.55, 0.62, 0.28),
    ("Mid", "Port", -1.80, -1.55, 1.70, 0.62, 0.28),
    ("Mid", "Starboard", -1.80, 1.55, 1.70, 0.62, 0.28),
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


def _cut_hull_bays():
    hull = bpy.data.objects.get("LOD0_HULL_Kestrel_PressureHull")
    cuts = []
    if hull is None:
        return cuts
    for station, side, cx, cy, hx, hy, hz in HULL_BAYS:
        ok = _cut_box(
            hull, f"{PREFIX}HullCut_{station}_{side}",
            (cx, cy, 1.92), (hx, hy, hz),
        )
        cuts.append(f"{station}_{side}={ok}")
    spine = bpy.data.objects.get("Hull_Dorsal_Spine")
    if spine is not None:
        ok = _cut_box(spine, f"{PREFIX}SpineWiden", (-3.80, 0.0, 2.22), (6.40, 0.42, 0.24))
        cuts.append(f"spine={ok}")
    return cuts


def _build_bay_interiors(collection, materials):
    objects = []
    steel = materials["service_steel"]
    armor = materials["armor"]
    dark = materials["dark_aperture"]
    radiator = materials["radiator"]
    for station, side, cx, cy, hx, hy, hz in HULL_BAYS:
        name = f"{PREFIX}Bay_{station}_{side}"
        floor_z = 1.62
        lip_z = 2.02
        objects.append(_stamp(_profile_prism(
            collection, f"{name}_Floor",
            (cx, cy, floor_z), hx * 2.0 - 0.08, hy * 2.0 - 0.08, hy * 2.0 - 0.08, 0.04, 0.04,
            dark, "active_aperture", "hull service bay floor the table looks into",
            detail=1, bevel=0.003,
        )))
        objects.append(_folded_plate(
            collection, f"{name}_Inboard",
            (cx - hx, 0.78 if cy > 0 else -0.78, floor_z),
            (cx + hx, 0.78 if cy > 0 else -0.78, floor_z),
            (cx + hx, 0.78 if cy > 0 else -0.78, lip_z),
            (cx - hx, 0.78 if cy > 0 else -0.78, lip_z),
            0.040, armor, "armor_plate", "hull bay inboard coaming",
        ))
        objects.append(_folded_plate(
            collection, f"{name}_Outboard",
            (cx - hx, cy + (hy if cy > 0 else -hy), floor_z),
            (cx + hx, cy + (hy if cy > 0 else -hy), floor_z),
            (cx + hx, cy + (hy if cy > 0 else -hy), lip_z),
            (cx - hx, cy + (hy if cy > 0 else -hy), lip_z),
            0.040, armor, "armor_plate", "hull bay outboard coaming",
        ))
        fin_count = 5
        span = hx * 1.6
        for fin_i in range(fin_count):
            t = 0 if fin_count == 1 else fin_i / (fin_count - 1)
            fx = cx - span * 0.5 + span * t
            objects.append(_stamp(_profile_prism(
                collection, f"{name}_Fin_{fin_i}",
                (fx, cy, floor_z + 0.16),
                0.030, hy * 1.35, hy * 1.35, 0.28, 0.24,
                radiator, "radiator", "hull-bay radiator leaf facing the table",
                detail=2, bevel=0.002,
            )))
        objects.append(_stamp(_profile_prism(
            collection, f"{name}_Pack",
            (cx + hx * 0.35, cy, floor_z + 0.10),
            0.42, 0.28, 0.22, 0.16, 0.14,
            steel, "structural_metal", "service pack in the hull bay",
            detail=2, bevel=0.006,
        )))
    return objects


def apply_hitch_hero_v27() -> dict:
    prior = apply_hitch_hero_v25()
    collection = _collection()
    materials = _materials()
    cuts = _cut_hull_bays()
    objects = _build_bay_interiors(collection, materials)
    report = {
        "schema": "spaceface.hitchHero.v27",
        "passId": PASS_ID,
        "method": "cut +Z service bays into the pressure hull beside the spine",
        "priorPass": "v25",
        "booleanCuts": cuts,
        "objectsAdded": len(objects),
        "objectNames": [obj.name for obj in objects],
    }
    _root()["hitchHeroPassV27"] = {
        "passId": PASS_ID,
        "objectsAdded": int(len(objects)),
        "cuts": int(len(cuts)),
    }
    return report
