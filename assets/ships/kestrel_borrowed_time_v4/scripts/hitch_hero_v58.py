"""Hitch hero V58 / cycle 49: formed service furniture in the open trench.

Cycle 48 hid the crown so the trench is the spine. Close still shows a
blank floor, a hairline hose, and stacked plates. Sit manufactured
hardware IN the trench volume — above the floor, below the wall lips —
so the look-down camera sees a service run, not a lid or a buried box.

Hide the leftover thin hose. No hull boolean. No new cards over the
channel. No hat frames.
"""
from __future__ import annotations

import bpy

from hitch_hero_v24 import _stamp
from hitch_hero_v57 import apply_hitch_hero_v57
from hitch_polish_v8 import _folded_plate
from material_truth_v6 import (
    _axial_cylinder,
    _chamfered_pressure_case,
    _materials,
    _profile_prism,
    _root,
    _source,
)

PASS_ID = "kestrel-hitch-hero-v58"
COLLECTION_NAME = "KESTREL_V58_TRENCH_FURNITURE"
PREFIX = "V58_"
HIDE_EXACT = (
    "V28_Hose",
)

# Trench interior from V25: floor (-1.70, 0, 1.98), walls y=±0.30, lip z=2.22.
# Keep every new part inside x=(-4.6, 1.1), y=(-0.22, 0.22), z=(2.01, 2.18).


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


def _hide_thin_hose():
    hidden = []
    for obj in bpy.data.objects:
        name = obj.name or ""
        if name in HIDE_EXACT or name.split(".")[0] in HIDE_EXACT:
            obj.hide_render = True
            obj.hide_set(True)
            hidden.append(name)
    return hidden


def _trench_furniture(collection, materials):
    """Service hardware that lives in the open dorsal trench.

    Fiction: field-service coolant/power manifold, U-channel cable tray,
    and a hand valve the table can look down into.
    Substrate: chamfered steel case, brake-formed tray, machined valve.
    Forbidden: a new lid over the trench, a cube on the floor, buried parts.
    """
    steel = materials["service_steel"]
    armor = materials["armor"]
    hazard = materials["hazard"]
    cable = materials["cable"]
    ceramic = materials["ceramic"]
    objects = []

    # Mid-trench manifold under the close look-at (-1.6, 0, 2.2).
    objects.append(_stamp(_chamfered_pressure_case(
        collection, f"{PREFIX}Manifold",
        (-1.60, 0.0, 2.08),
        0.72, 0.34, 0.14, 0.04, steel,
        "structural_metal",
        "dorsal trench coolant and power manifold",
        detail=1,
    )))
    objects.append(_stamp(_profile_prism(
        collection, f"{PREFIX}ManifoldLip",
        (-1.60, 0.0, 2.145),
        0.38, 0.18, 0.16, 0.028, 0.024,
        armor, "armor_plate",
        "raised service lip on the trench manifold",
        detail=2, bevel=0.004,
    )))
    objects.append(_stamp(_profile_prism(
        collection, f"{PREFIX}ManifoldInset",
        (-1.60, 0.0, 2.16),
        0.22, 0.10, 0.09, 0.016, 0.014,
        steel, "structural_metal",
        "recessed hand-access field in the trench manifold",
        detail=2, bevel=0.003,
    )))
    objects.append(_stamp(_profile_prism(
        collection, f"{PREFIX}ManifoldHazard",
        (-1.38, 0.0, 2.155),
        0.06, 0.22, 0.22, 0.018, 0.018,
        hazard, "marking",
        "orange service mark on the trench manifold",
        detail=2, bevel=0.002,
    )))
    for i, x in enumerate((-1.88, -1.32)):
        objects.append(_stamp(_axial_cylinder(
            collection, f"{PREFIX}ManifoldPort_{i}",
            (x, 0.0, 2.08),
            0.028, 0.08, ceramic, "ceramic_isolator",
            "ceramic isolator at a trench manifold port",
            segments=10, detail=2, axis="X",
        )))

    # U-channel tray along the port wall so the close camera sees a trough, not a wire.
    objects.append(_folded_plate(
        collection, f"{PREFIX}TrayFloor",
        (-4.40, 0.10, 2.02), (-0.40, 0.10, 2.02),
        (-0.40, 0.18, 2.02), (-4.40, 0.18, 2.02),
        0.016, steel, "structural_metal",
        "U-channel cable-tray floor in the dorsal trench",
    ))
    objects.append(_folded_plate(
        collection, f"{PREFIX}TrayWallIn",
        (-4.40, 0.10, 2.02), (-0.40, 0.10, 2.02),
        (-0.40, 0.10, 2.12), (-4.40, 0.10, 2.12),
        0.012, steel, "structural_metal",
        "inboard cable-tray wall",
    ))
    objects.append(_folded_plate(
        collection, f"{PREFIX}TrayWallOut",
        (-4.40, 0.18, 2.02), (-0.40, 0.18, 2.02),
        (-0.40, 0.18, 2.12), (-4.40, 0.18, 2.12),
        0.012, steel, "structural_metal",
        "outboard cable-tray wall",
    ))
    for i, x in enumerate((-3.80, -2.60, -1.20)):
        objects.append(_stamp(_profile_prism(
            collection, f"{PREFIX}TrayTie_{i}",
            (x, 0.14, 2.06),
            0.05, 0.10, 0.10, 0.06, 0.06,
            steel, "structural_metal",
            "cable-tray tie-down in the dorsal trench",
            detail=2, bevel=0.003,
        )))
    objects.append(_stamp(_axial_cylinder(
        collection, f"{PREFIX}TrayCable",
        (-2.40, 0.14, 2.055),
        0.016, 3.70, cable, "cable_elastomer",
        "service cable seated in the U-channel tray",
        segments=8, detail=2, axis="X",
    )))

    # Hand valve at the aft trench so the table sees a wheel, not a stud.
    objects.append(_stamp(_chamfered_pressure_case(
        collection, f"{PREFIX}ValveBody",
        (-3.55, -0.02, 2.09),
        0.28, 0.22, 0.12, 0.03, steel,
        "structural_metal",
        "trench isolation-valve body",
        detail=1,
    )))
    objects.append(_stamp(_axial_cylinder(
        collection, f"{PREFIX}ValveStem",
        (-3.55, -0.02, 2.14),
        0.018, 0.07, steel, "structural_metal",
        "isolation-valve stem",
        segments=10, detail=2, axis="Z",
    )))
    objects.append(_stamp(_axial_cylinder(
        collection, f"{PREFIX}ValveWheel",
        (-3.55, -0.02, 2.175),
        0.055, 0.016, steel, "structural_metal",
        "isolation-valve handwheel",
        segments=12, detail=2, axis="Z",
    )))

    # Fore junction so the channel is not empty toward the bow.
    objects.append(_stamp(_chamfered_pressure_case(
        collection, f"{PREFIX}Junction",
        (-0.15, 0.0, 2.09),
        0.42, 0.28, 0.12, 0.03, steel,
        "structural_metal",
        "fore trench junction box",
        detail=1,
    )))
    objects.append(_stamp(_profile_prism(
        collection, f"{PREFIX}JunctionInset",
        (-0.15, 0.0, 2.15),
        0.18, 0.12, 0.10, 0.018, 0.016,
        steel, "structural_metal",
        "recessed cover field on the trench junction",
        detail=2, bevel=0.003,
    )))
    return objects


def apply_hitch_hero_v58() -> dict:
    prior = apply_hitch_hero_v57()
    collection = _collection()
    materials = _materials()
    hidden = _hide_thin_hose()
    objects = _trench_furniture(collection, materials)
    report = {
        "schema": "spaceface.hitchHero.v58",
        "passId": PASS_ID,
        "method": "formed trench manifold, U-channel tray, and valve in the open spine",
        "priorPass": "v57",
        "hiddenDonors": hidden,
        "objectsAdded": len(objects),
        "objectNames": [obj.name for obj in objects],
        "componentReference": "kestrel_midship_material_truth_reference_v1.png",
    }
    _root()["hitchHeroPassV58"] = {
        "passId": PASS_ID,
        "objectsAdded": int(len(objects)),
        "hiddenDonors": hidden,
    }
    return report
