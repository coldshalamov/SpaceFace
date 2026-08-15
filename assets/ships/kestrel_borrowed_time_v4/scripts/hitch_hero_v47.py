"""Hitch hero V47 / cycle 38: lids and straps, not hat frames.

Cycles 36-37 framed the green packs with hat-section boxes. Tabletop kept
the port frame; 3Q still saw bricks. The real brick is FieldRepair_Port_Plate,
a 4.3 x 2.2 m green wall facing the profile camera. The starboard V6 case
already has hatch/bands, but the inboard face is still a green rectangle.

Change the method. Start from the cycle-31 keep. Hide the flat port plate.
Stand a chamfered field locker on that exact home with a steel hatch, hoop
straps, and end connectors (the existing repair-pod reference). Clad the
starboard inboard face and enlarge the steel lid so 3Q sees hardware, not
primer. Rim the aft dorsal green patch. No hull boolean. No hat frames.
"""
from __future__ import annotations

import bpy

from hitch_hero_v24 import _stamp
from hitch_hero_v40 import apply_hitch_hero_v40
from hitch_polish_v8 import _folded_plate
from material_truth_v6 import (
    _axial_cylinder,
    _chamfered_pressure_case,
    _materials,
    _profile_prism,
    _root,
    _source,
)

PASS_ID = "kestrel-hitch-hero-v47"
COLLECTION_NAME = "KESTREL_V47_PACK_LIDS"
PREFIX = "V47_"
HIDE_EXACT = {
    "FieldRepair_Port_Plate",
}


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


def _hide_flat_port_plate():
    hidden = []
    for obj in bpy.data.objects:
        name = obj.name or ""
        base = name.split(".")[0]
        if name in HIDE_EXACT or base in HIDE_EXACT:
            obj.hide_render = True
            obj.hide_set(True)
            hidden.append(name)
    return hidden


def _port_locker(collection, materials):
    """Side-mounted field locker on the exact FieldRepair_Port_Plate home.

    Plate AABB: x=(-2.92, 1.42) y=(-2.96, -2.80) z=(-0.88, 1.28).
    Fiction: salvaged locker bolted to the port pressure-hull course.
    Substrate: chamfered primer case, brake-formed steel hatch, hoop straps.
    Forbidden: flat green wall, hat-section box stacked on the plate.
    """
    armor = materials["armor"]
    steel = materials["service_steel"]
    repair = materials["repair"]
    hazard = materials["hazard"]
    ceramic = materials["ceramic"]
    objects = []
    cx, cy, cz = -0.75, -3.24, 0.22
    objects.append(_stamp(_chamfered_pressure_case(
        collection, f"{PREFIX}PortLockerBody", (cx, cy, cz),
        3.85, 0.70, 1.72, 0.16, repair,
        "repair_panel",
        "salvaged port field-repair locker bolted to the pressure-hull course",
        detail=0,
    )))
    for end_id, x in (("Aft", -2.72), ("Fore", 1.22)):
        objects.append(_stamp(_chamfered_pressure_case(
            collection, f"{PREFIX}PortLockerEnd_{end_id}", (x, cy, cz),
            0.18, 0.76, 1.80, 0.14, repair,
            "repair_panel",
            "replaceable port-locker pressure end cap",
            detail=1,
        )))
    # Steel hatch covers the camera-facing -Y wall so 3Q cannot count a green brick.
    objects.append(_folded_plate(
        collection, f"{PREFIX}PortLockerHatch",
        (cx - 1.55, cy - 0.38, cz - 0.58),
        (cx + 1.55, cy - 0.38, cz - 0.58),
        (cx + 1.55, cy - 0.38, cz + 0.62),
        (cx - 1.55, cy - 0.38, cz + 0.62),
        0.042, armor, "armor_plate",
        "brake-formed steel hatch on the port locker outboard face",
    ))
    objects.append(_stamp(_profile_prism(
        collection, f"{PREFIX}PortLockerHatchInset",
        (cx, cy - 0.42, cz + 0.06),
        0.92, 0.08, 0.08, 0.42, 0.38,
        steel, "structural_metal",
        "recessed hand-access field in the port locker hatch",
        detail=2, bevel=0.008,
    )))
    for i, t in enumerate((-0.72, 0.72)):
        objects.append(_stamp(_axial_cylinder(
            collection, f"{PREFIX}PortLockerLatch_{i}",
            (cx + 1.15 * t, cy - 0.44, cz + 0.48),
            0.055, 0.07, steel, "structural_metal",
            "quarter-turn locker hatch latch",
            segments=12, detail=2, axis="Y",
        )))
    for clamp, x in enumerate((-2.18, -0.75, 0.68)):
        objects.append(_stamp(_profile_prism(
            collection, f"{PREFIX}PortLockerBandOut_{clamp:02d}",
            (x, cy - 0.38, cz),
            0.12, 0.08, 0.08, 1.62, 1.62,
            steel, "structural_metal",
            "port-locker restraint band on the outboard face",
            detail=1, bevel=0.010,
        )))
        objects.append(_stamp(_profile_prism(
            collection, f"{PREFIX}PortLockerBandTop_{clamp:02d}",
            (x, cy, cz + 0.88),
            0.12, 0.78, 0.78, 0.08, 0.08,
            steel, "structural_metal",
            "port-locker restraint band over the case crown",
            detail=1, bevel=0.010,
        )))
        objects.append(_stamp(_profile_prism(
            collection, f"{PREFIX}PortLockerBandBot_{clamp:02d}",
            (x, cy, cz - 0.88),
            0.12, 0.78, 0.78, 0.08, 0.08,
            steel, "structural_metal",
            "port-locker restraint band under the case keel",
            detail=1, bevel=0.010,
        )))
    objects.append(_stamp(_profile_prism(
        collection, f"{PREFIX}PortLockerHazard",
        (cx + 0.55, cy - 0.40, cz),
        0.16, 0.06, 0.06, 1.28, 1.28,
        hazard, "marking",
        "orange restraint strap on the port locker",
        detail=2, bevel=0.004,
    )))
    objects.append(_stamp(_profile_prism(
        collection, f"{PREFIX}PortLockerConnectorPanel",
        (1.38, cy, cz),
        0.10, 0.48, 0.48, 0.52, 0.48,
        steel, "structural_metal",
        "port-locker electrical and consumables connector panel",
        detail=1, bevel=0.012,
    )))
    for socket, (z, radius) in enumerate(((0.42, 0.09), (0.08, 0.075), (-0.22, 0.09))):
        objects.append(_stamp(_axial_cylinder(
            collection, f"{PREFIX}PortLockerShell_{socket:02d}",
            (1.46, cy, z), radius, 0.10, steel, "structural_metal",
            "machined port-locker connector shell",
            segments=14, detail=1, axis="X",
        )))
        objects.append(_stamp(_axial_cylinder(
            collection, f"{PREFIX}PortLockerInsert_{socket:02d}",
            (1.52, cy, z), radius * 0.66, 0.08, ceramic, "ceramic_isolator",
            "ceramic connector insert in the port locker",
            segments=14, detail=2, axis="X",
        )))
    for mount, (x, z) in enumerate((
        (-2.35, -0.48), (0.85, -0.48), (-2.35, 0.88), (0.85, 0.88),
    )):
        objects.append(_stamp(_profile_prism(
            collection, f"{PREFIX}PortLockerSaddle_{mount:02d}",
            (x, -2.90, z),
            0.32, 0.16, 0.14, 0.18, 0.16,
            steel, "structural_metal",
            "port-locker saddle bolted to the hull course",
            detail=1, bevel=0.010,
        )))
    return objects


def _starboard_case_lids(collection, materials):
    """Cover the V6 case's 3Q green wall. Keep the eight-sided case visible.

    V6_RepairPodPressureCase AABB: x=(-3.05, 0.15) y=(3.06, 4.54) z=(0.88, 1.80).
    Inboard is -Y. Existing hatch/bands stay; these parts sit proud of them.
    """
    armor = materials["armor"]
    steel = materials["service_steel"]
    hazard = materials["hazard"]
    objects = []
    cx, cy, cz = -1.45, 3.80, 1.34
    objects.append(_folded_plate(
        collection, f"{PREFIX}StbdInboardClad",
        (cx - 1.52, 3.04, cz - 0.42),
        (cx + 1.52, 3.04, cz - 0.42),
        (cx + 1.52, 3.04, cz + 0.44),
        (cx - 1.52, 3.04, cz + 0.44),
        0.040, armor, "armor_plate",
        "steel inboard cladding so the 3Q camera cannot count a green wall",
    ))
    objects.append(_stamp(_profile_prism(
        collection, f"{PREFIX}StbdLid",
        (cx, cy, 1.94),
        2.72, 1.30, 1.24, 0.11, 0.095,
        armor, "armor_plate",
        "enlarged replaceable loading hatch covering the case crown",
        detail=1, bevel=0.022,
    )))
    objects.append(_stamp(_profile_prism(
        collection, f"{PREFIX}StbdLidInset",
        (cx, cy, 2.02),
        0.88, 0.52, 0.48, 0.028, 0.022,
        steel, "structural_metal",
        "recessed hand-access field in the enlarged hatch",
        detail=2, bevel=0.008,
    )))
    objects.append(_stamp(_profile_prism(
        collection, f"{PREFIX}StbdHazard",
        (cx + 0.62, cy, 1.94),
        0.16, 1.18, 1.18, 0.08, 0.08,
        hazard, "marking",
        "orange restraint strap on the starboard case crown",
        detail=2, bevel=0.004,
    )))
    objects.append(_folded_plate(
        collection, f"{PREFIX}StbdHazardInboard",
        (cx + 0.54, 3.02, cz - 0.36),
        (cx + 0.70, 3.02, cz - 0.36),
        (cx + 0.70, 3.02, cz + 0.40),
        (cx + 0.54, 3.02, cz + 0.40),
        0.028, hazard, "marking",
        "orange strap leg on the starboard inboard face",
    ))
    for i, t in enumerate((-0.70, 0.70)):
        objects.append(_stamp(_axial_cylinder(
            collection, f"{PREFIX}StbdLidLatch_{i}",
            (cx + 1.05 * t, cy - 0.28, 2.04),
            0.055, 0.06, steel, "structural_metal",
            "quarter-turn latch on the enlarged starboard hatch",
            segments=12, detail=2, axis="Z",
        )))
    objects.append(_stamp(_profile_prism(
        collection, f"{PREFIX}StbdForePanel",
        (0.22, cy, cz),
        0.10, 1.10, 1.10, 0.70, 0.64,
        steel, "structural_metal",
        "proud fore connector panel on the starboard case",
        detail=1, bevel=0.014,
    )))
    return objects


def _aft_green_patch(collection, materials):
    """Steel rim on Hull_TopPanel_03. Thin aft dorsal green patch, not a box.

    AABB: x=(-8.50, -6.90) y=(-0.62, 0.62) z=(1.89, 1.99).
    """
    steel = materials["service_steel"]
    armor = materials["armor"]
    objects = []
    cx, cy, cz = -7.70, 0.0, 2.02
    objects.append(_folded_plate(
        collection, f"{PREFIX}AftPatchFore",
        (cx + 0.82, cy - 0.64, cz),
        (cx + 0.82, cy + 0.64, cz),
        (cx + 0.82, cy + 0.64, cz + 0.04),
        (cx + 0.82, cy - 0.64, cz + 0.04),
        0.030, steel, "structural_metal",
        "fore coaming on the aft salvage patch",
    ))
    objects.append(_folded_plate(
        collection, f"{PREFIX}AftPatchAft",
        (cx - 0.82, cy - 0.64, cz),
        (cx - 0.82, cy + 0.64, cz),
        (cx - 0.82, cy + 0.64, cz + 0.04),
        (cx - 0.82, cy - 0.64, cz + 0.04),
        0.030, steel, "structural_metal",
        "aft coaming on the aft salvage patch",
    ))
    objects.append(_folded_plate(
        collection, f"{PREFIX}AftPatchPort",
        (cx - 0.82, cy - 0.64, cz),
        (cx + 0.82, cy - 0.64, cz),
        (cx + 0.82, cy - 0.64, cz + 0.04),
        (cx - 0.82, cy - 0.64, cz + 0.04),
        0.030, steel, "structural_metal",
        "port coaming on the aft salvage patch",
    ))
    objects.append(_folded_plate(
        collection, f"{PREFIX}AftPatchStbd",
        (cx - 0.82, cy + 0.64, cz),
        (cx + 0.82, cy + 0.64, cz),
        (cx + 0.82, cy + 0.64, cz + 0.04),
        (cx - 0.82, cy + 0.64, cz + 0.04),
        0.030, steel, "structural_metal",
        "starboard coaming on the aft salvage patch",
    ))
    objects.append(_stamp(_profile_prism(
        collection, f"{PREFIX}AftPatchHatch",
        (cx, cy, cz + 0.05),
        0.72, 0.52, 0.48, 0.04, 0.035,
        armor, "armor_plate",
        "small steel access hatch on the aft salvage patch",
        detail=2, bevel=0.006,
    )))
    return objects


def apply_hitch_hero_v47() -> dict:
    prior = apply_hitch_hero_v40()
    collection = _collection()
    materials = _materials()
    hidden = _hide_flat_port_plate()
    objects = []
    objects.extend(_port_locker(collection, materials))
    objects.extend(_starboard_case_lids(collection, materials))
    objects.extend(_aft_green_patch(collection, materials))
    report = {
        "schema": "spaceface.hitchHero.v47",
        "passId": PASS_ID,
        "method": "hide FieldRepair_Port_Plate; chamfered port locker + steel lids; skip hat frames",
        "priorPass": "v40",
        "skippedPasses": ["v41", "v42", "v43", "v44", "v45", "v46"],
        "hiddenDonors": hidden,
        "objectsAdded": len(objects),
        "objectNames": [obj.name for obj in objects],
        "componentReference": "kestrel_repair_pod_material_truth_reference_v1.png",
        "materialBills": {
            "portLocker": {
                "function": "salvaged field-repair locker on the port hull course",
                "substrate": "chamfered primer case, brake-formed steel hatch, hoop straps",
                "forbidden": "flat green wall, hat-section box on the plate",
            },
            "starboardCase": {
                "function": "existing V6 eight-sided pressure case",
                "substrate": "proud steel inboard cladding and enlarged loading hatch",
                "forbidden": "another hat-section frame around the case",
            },
            "aftPatch": {
                "function": "Hull_TopPanel_03 salvage patch",
                "substrate": "steel coaming and small hatch, keep the green as history",
                "forbidden": "standing box on the thin dorsal panel",
            },
        },
    }
    _root()["hitchHeroPassV47"] = {
        "passId": PASS_ID,
        "objectsAdded": int(len(objects)),
        "hiddenDonors": hidden,
    }
    return report
