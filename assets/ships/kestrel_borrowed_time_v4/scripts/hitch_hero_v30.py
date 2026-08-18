"""Hitch hero V30 / cycle 21: look-down wells in the sealed fore hull.

Cycle 20 keeps the mid/aft hull bays. A first bow-gun boolean ate the
spine-hatch rubber gasket. The leftover sealed read is the hull between
the canopy brow (x=6.85) and the mid bays (x=-1.70). Cut two +Z service
wells there so the table looks into feed/service hardware, not a tube.
"""
from __future__ import annotations

import bpy

from hitch_hero_v16 import _cut_box
from hitch_hero_v24 import _stamp
from hitch_hero_v29 import apply_hitch_hero_v29
from hitch_polish_v8 import _folded_plate
from material_truth_v6 import _materials, _profile_prism, _root, _source

PASS_ID = "kestrel-hitch-hero-v30"
COLLECTION_NAME = "KESTREL_V30_BOW_MAGAZINES"
PREFIX = "V30_"

# Between mid-bay lip (~x=0.15) and canopy brow (x=6.85). Stay off the
# bow rubber gasket around x=9.2.
MAGAZINES = (
    ("Port", 3.55, -1.55, 1.35, 0.62, 0.28),
    ("Starboard", 3.55, 1.55, 1.35, 0.62, 0.28),
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


def _cut_wells():
    hull = bpy.data.objects.get("LOD0_HULL_Kestrel_PressureHull")
    cuts = []
    if hull is None:
        return cuts
    for name, cx, cy, hx, hy, hz in MAGAZINES:
        ok = _cut_box(
            hull, f"{PREFIX}BowCut_{name}",
            (cx, cy, 1.90), (hx, hy, hz),
        )
        cuts.append(f"{name}={ok}")
    return cuts


def _build_magazine(collection, materials, side, cx, cy, hx, hy, hz):
    objects = []
    steel = materials["service_steel"]
    armor = materials["armor"]
    dark = materials["dark_aperture"]
    cable = materials["cable"]
    name = f"{PREFIX}Mag_{side}"
    floor_z = 1.58
    lip_z = 2.04
    objects.append(_stamp(_profile_prism(
        collection, f"{name}_Floor",
        (cx, cy, floor_z), hx * 2.0 - 0.08, hy * 2.0 - 0.08, hy * 2.0 - 0.08, 0.04, 0.04,
        dark, "active_aperture", "fore-hull service well floor the table looks into",
        detail=1, bevel=0.003,
    )))
    objects.append(_folded_plate(
        collection, f"{name}_Outboard",
        (cx - hx, cy + (hy if cy > 0 else -hy), floor_z),
        (cx + hx, cy + (hy if cy > 0 else -hy), floor_z),
        (cx + hx, cy + (hy if cy > 0 else -hy), lip_z),
        (cx - hx, cy + (hy if cy > 0 else -hy), lip_z),
        0.038, armor, "armor_plate", "magazine outboard coaming",
    ))
    objects.append(_folded_plate(
        collection, f"{name}_Inboard",
        (cx - hx, cy + (-hy if cy > 0 else hy) * 0.15, floor_z),
        (cx + hx, cy + (-hy if cy > 0 else hy) * 0.15, floor_z),
        (cx + hx, cy + (-hy if cy > 0 else hy) * 0.15, lip_z),
        (cx - hx, cy + (-hy if cy > 0 else hy) * 0.15, lip_z),
        0.034, steel, "structural_metal", "magazine inboard coaming",
    ))
    for i, t in enumerate((0.22, 0.55, 0.82)):
        objects.append(_stamp(_profile_prism(
            collection, f"{name}_Cassette_{i}",
            (cx - hx + hx * 2.0 * t, cy, floor_z + 0.11),
            0.34, hy * 1.15, hy * 1.05, 0.18, 0.16,
            steel, "structural_metal", "linked ammunition cassette in the magazine well",
            detail=2, bevel=0.005,
        )))
    objects.append(_folded_plate(
        collection, f"{name}_Feed",
        (cx + hx * 0.55, cy * 0.35, floor_z + 0.16),
        (cx + hx * 0.95, cy * 0.08, floor_z + 0.20),
        (cx + hx * 0.95, cy * 0.08, floor_z + 0.26),
        (cx + hx * 0.55, cy * 0.35, floor_z + 0.22),
        0.016, cable, "cable_elastomer",
        "feed belt climbing toward the gun cheek",
    ))
    objects.append(_stamp(_profile_prism(
        collection, f"{name}_LipFore",
        (cx + hx, cy, lip_z), 0.08, hy * 2.02, hy * 2.02, 0.045, 0.045,
        steel, "structural_metal", "magazine fore lip",
        detail=2, bevel=0.003,
    )))
    objects.append(_stamp(_profile_prism(
        collection, f"{name}_LipAft",
        (cx - hx, cy, lip_z), 0.08, hy * 2.02, hy * 2.02, 0.045, 0.045,
        steel, "structural_metal", "magazine aft lip",
        detail=2, bevel=0.003,
    )))
    return objects


def apply_hitch_hero_v30() -> dict:
    prior = apply_hitch_hero_v29()
    collection = _collection()
    materials = _materials()
    cuts = _cut_wells()
    objects = []
    for side, cx, cy, hx, hy, hz in MAGAZINES:
        objects.extend(_build_magazine(collection, materials, side, cx, cy, hx, hy, hz))
    report = {
        "schema": "spaceface.hitchHero.v30",
        "passId": PASS_ID,
        "method": "fore-hull service wells the table looks into",
        "priorPass": "v29",
        "booleanCuts": cuts,
        "objectsAdded": len(objects),
        "objectNames": [obj.name for obj in objects],
    }
    _root()["hitchHeroPassV30"] = {
        "passId": PASS_ID,
        "objectsAdded": int(len(objects)),
        "cuts": int(len(cuts)),
    }
    return report
