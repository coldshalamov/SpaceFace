"""Hitch hero V10: manufactured hardware the live V8/V9 still lack.

Identity stays SF-K0 Hitch / ship_kestrel. This pass does not redesign the
silhouette. It replaces the stacked-slab / floating-bar read with oleo landing
gear, hollow drive throats, RCS quads, a service bay you can see into, radiator
cassettes, canopy glass, and connected service runs.

Applies V9 (which applies V8) first so earlier extras remain.
"""
from __future__ import annotations

import math

import bpy
from mathutils import Vector

from hitch_polish_v8 import _folded_plate
from hitch_polish_v9 import apply_hitch_polish_v9
from material_truth_v6 import (
    _axial_cylinder,
    _finish,
    _materials,
    _profile_prism,
    _root,
    _source,
    _strut_between,
)


PASS_ID = "kestrel-hitch-hero-v10"
COLLECTION_NAME = "KESTREL_V10_HITCH_HERO"
PREFIX = "V10_"


def _collection() -> bpy.types.Collection:
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


def _stamp(obj: bpy.types.Object) -> bpy.types.Object:
    obj["sf_polish_pass"] = PASS_ID
    obj["sf_material_truth_pass"] = PASS_ID
    return obj


def _hollow_bell(collection, name, loc, outer_r, inner_r, length, material, bill, function):
    """Refractory bell with a real throat, not a solid cone."""
    outer = _stamp(_axial_cylinder(
        collection, f"{name}_Outer", loc, outer_r, length, material,
        bill, function, segments=16, detail=1, axis="X",
    ))
    inner_loc = (loc[0] + 0.04, loc[1], loc[2])
    inner = _stamp(_axial_cylinder(
        collection, f"{name}_Throat", inner_loc, inner_r, length * 0.82, material,
        bill, f"{function} inner throat", segments=14, detail=2, axis="X",
    ))
    return [outer, inner]


def _build_landing_gear(collection, materials):
    """Oleo legs, scissors, and pads so the skids stop reading as a slab on poles."""
    objects = []
    steel = materials["service_steel"]
    armor = materials["armor"]
    hull = materials.get("hull") or armor
    for sign, side in ((-1.0, "Port"), (1.0, "Starboard")):
        for i, x in enumerate((4.20, -1.10)):
            objects.append(_stamp(_axial_cylinder(
                collection, f"{PREFIX}Oleo_{side}_{i}",
                (x, 1.85 * sign, -2.05), 0.055, 0.85, steel,
                "structural_metal", "oleo strut barrel",
                segments=10, detail=1, axis="Z",
            )))
            objects.append(_stamp(_axial_cylinder(
                collection, f"{PREFIX}OleoRod_{side}_{i}",
                (x, 1.85 * sign, -2.58), 0.032, 0.38, steel,
                "structural_metal", "chrome oleo rod",
                segments=10, detail=2, axis="Z",
            )))
            objects.append(_stamp(_profile_prism(
                collection, f"{PREFIX}Scissor_{side}_{i}",
                (x + 0.12, 1.62 * sign, -2.28), 0.22, 0.08, 0.06, 0.18, 0.14,
                steel, "structural_metal",
                "torque-link scissor",
                detail=2, bevel=0.004,
            )))
            objects.append(_stamp(_profile_prism(
                collection, f"{PREFIX}Pad_{side}_{i}",
                (x, 1.85 * sign, -2.82), 0.42, 0.28, 0.22, 0.06, 0.05,
                hull, "armor_plate",
                "landing pad with wear face",
                detail=1, bevel=0.006,
            )))
            objects.append(_stamp(_strut_between(
                collection, f"{PREFIX}DragLink_{side}_{i}",
                (x, 1.35 * sign, -1.55), (x, 1.85 * sign, -2.15),
                0.022, steel, "structural_metal",
                "drag link into the keel hardpoint",
            )))
        objects.append(_stamp(_profile_prism(
            collection, f"{PREFIX}GearDoor_{side}",
            (1.55, 2.35 * sign, -1.72), 3.40, 0.18, 0.14, 0.05, 0.04,
            armor, "armor_plate",
            "gear-bay door leaf",
            detail=1, bevel=0.005,
        )))
    return objects


def _build_rcs_quads(collection, materials):
    objects = []
    steel = materials["service_steel"]
    ceramic = materials.get("ceramic") or steel
    clusters = (
        ("BowP", 10.40, -2.05, 0.85),
        ("BowS", 10.40, 2.05, 0.85),
        ("AftP", -9.80, -2.15, 0.72),
        ("AftS", -9.80, 2.15, 0.72),
        ("Dorsal", 1.10, 0.00, 2.85),
        ("Keel", 1.10, 0.00, -1.95),
    )
    for name, x, y, z in clusters:
        objects.append(_stamp(_profile_prism(
            collection, f"{PREFIX}RcsBlock_{name}",
            (x, y, z), 0.28, 0.32, 0.28, 0.16, 0.14,
            steel, "structural_metal",
            "RCS manifold block",
            detail=1, bevel=0.006,
        )))
        for j, (ox, oy, oz, axis) in enumerate((
            (0.18, 0.00, 0.00, "X"),
            (0.00, 0.16 if y >= 0 else -0.16, 0.00, "Y"),
            (0.00, 0.00, 0.14, "Z"),
        )):
            objects.append(_stamp(_axial_cylinder(
                collection, f"{PREFIX}RcsNoz_{name}_{j}",
                (x + ox, y + oy, z + oz), 0.028, 0.11, ceramic,
                "ceramic_isolator", "RCS nozzle",
                segments=8, detail=2, axis=axis,
            )))
    return objects


def _build_drive_throats(collection, materials):
    objects = []
    ceramic = materials.get("ceramic") or materials["armor"]
    alloy = materials.get("drive") or materials["service_steel"]
    steel = materials["service_steel"]
    for sign, side in ((-1.0, "Port"), (1.0, "Starboard")):
        objects.extend(_hollow_bell(
            collection, f"{PREFIX}DriveBell_{side}",
            (-12.55, 0.72 * sign, 0.18), 0.42, 0.22, 0.95,
            ceramic, "ceramic_isolator", "main drive bell",
        ))
        objects.append(_stamp(_axial_cylinder(
            collection, f"{PREFIX}DriveCollar_{side}",
            (-11.85, 0.72 * sign, 0.18), 0.48, 0.12, alloy,
            "drive_alloy", "bell-to-casing clamp collar",
            segments=14, detail=1, axis="X",
        )))
        for k in range(6):
            ang = (k / 6.0) * math.pi * 2
            objects.append(_stamp(_profile_prism(
                collection, f"{PREFIX}DriveClamp_{side}_{k}",
                (-11.85, 0.72 * sign + math.sin(ang) * 0.46, 0.18 + math.cos(ang) * 0.46),
                0.10, 0.08, 0.07, 0.05, 0.04,
                steel, "structural_metal",
                "drive clamp segment",
                detail=2, bevel=0.003,
            )))
    objects.append(_folded_plate(
        collection, f"{PREFIX}AftHeatBaffle",
        (-11.05, -1.55, -0.55), (-12.35, -1.15, -0.35),
        (-12.35, 1.15, -0.35), (-11.05, 1.55, -0.55),
        0.032, ceramic, "ceramic_isolator",
        "aft heat baffle between bells",
    ))
    return objects


def _build_service_bay(collection, materials):
    """Open machinery bay with rim, inner walls, and visible lines."""
    objects = []
    armor = materials["armor"]
    steel = materials["service_steel"]
    hull = materials.get("hull") or armor
    objects.append(_stamp(_profile_prism(
        collection, f"{PREFIX}BayRim",
        (0.85, -2.95, 0.55), 1.85, 0.12, 0.10, 0.72, 0.58,
        armor, "armor_plate",
        "port service-bay rim",
        detail=1, bevel=0.008,
    )))
    objects.append(_stamp(_profile_prism(
        collection, f"{PREFIX}BayInterior",
        (0.85, -2.72, 0.55), 1.55, 0.22, 0.18, 0.52, 0.42,
        hull, "armor_plate",
        "service-bay inner volume",
        detail=1, bevel=0.004,
    )))
    objects.append(_stamp(_axial_cylinder(
        collection, f"{PREFIX}BayPump",
        (0.35, -2.68, 0.42), 0.09, 0.28, steel,
        "structural_metal", "hydraulic pump in the bay",
        segments=10, detail=1, axis="Y",
    )))
    objects.append(_stamp(_axial_cylinder(
        collection, f"{PREFIX}BayFilter",
        (1.25, -2.68, 0.62), 0.07, 0.22, steel,
        "structural_metal", "filter bottle",
        segments=10, detail=2, axis="Z",
    )))
    objects.append(_stamp(_strut_between(
        collection, f"{PREFIX}BayLineA",
        (0.35, -2.55, 0.55), (1.25, -2.55, 0.62),
        0.014, steel, "structural_metal",
        "hardline across the bay",
    )))
    objects.append(_stamp(_strut_between(
        collection, f"{PREFIX}BayLineB",
        (1.25, -2.55, 0.72), (1.55, -2.15, 1.35),
        0.014, steel, "structural_metal",
        "hardline up to the dorsal tray",
    )))
    objects.append(_stamp(_profile_prism(
        collection, f"{PREFIX}BayDoorStowed",
        (0.85, -3.18, 0.95), 1.65, 0.06, 0.05, 0.08, 0.06,
        armor, "armor_plate",
        "stowed bay door on the hinge",
        detail=1, bevel=0.004,
    )))
    return objects


def _build_radiator_cassettes(collection, materials):
    objects = []
    steel = materials["service_steel"]
    ceramic = materials.get("ceramic") or steel
    for sign, side in ((-1.0, "Port"), (1.0, "Starboard")):
        objects.append(_stamp(_profile_prism(
            collection, f"{PREFIX}RadHeader_{side}",
            (-5.40, 3.05 * sign, 1.55), 2.40, 0.18, 0.14, 0.10, 0.08,
            steel, "structural_metal",
            "radiator header manifold",
            detail=1, bevel=0.005,
        )))
        for i in range(5):
            x = -4.40 - i * 0.38
            objects.append(_folded_plate(
                collection, f"{PREFIX}RadFin_{side}_{i}",
                (x, 2.55 * sign, 0.85), (x - 0.06, 3.35 * sign, 0.85),
                (x - 0.06, 3.35 * sign, 2.15), (x, 2.55 * sign, 2.15),
                0.018, ceramic, "ceramic_isolator",
                "radiator cassette fin",
            ))
        objects.append(_stamp(_strut_between(
            collection, f"{PREFIX}RadReturn_{side}",
            (-5.40, 2.85 * sign, 1.55), (-8.80, 1.15 * sign, 0.55),
            0.018, steel, "structural_metal",
            "radiator return into the drive house",
        )))
    return objects


def _build_canopy_glass(collection, materials):
    objects = []
    glass = materials.get("lens") or materials["armor"]
    steel = materials["service_steel"]
    objects.append(_folded_plate(
        collection, f"{PREFIX}CanopyPanePort",
        (6.45, -0.72, 1.78), (3.95, -0.82, 1.74),
        (3.95, -0.22, 2.28), (6.45, -0.18, 2.32),
        0.016, glass, "armor_plate",
        "port greenhouse pane with thickness",
    ))
    objects.append(_folded_plate(
        collection, f"{PREFIX}CanopyPaneStarboard",
        (6.45, 0.72, 1.78), (6.45, 0.18, 2.32),
        (3.95, 0.22, 2.28), (3.95, 0.82, 1.74),
        0.016, glass, "armor_plate",
        "starboard greenhouse pane with thickness",
    ))
    objects.append(_stamp(_profile_prism(
        collection, f"{PREFIX}WiperPark",
        (6.55, -0.35, 2.12), 0.12, 0.06, 0.05, 0.18, 0.14,
        steel, "structural_metal",
        "wiper park and hinge",
        detail=2, bevel=0.003,
    )))
    return objects


def _build_life_support_and_tanks(collection, materials):
    objects = []
    steel = materials["service_steel"]
    armor = materials["armor"]
    objects.append(_stamp(_axial_cylinder(
        collection, f"{PREFIX}O2Tank",
        (-3.15, 0.72, 2.05), 0.18, 0.85, steel,
        "structural_metal", "oxygen bottle",
        segments=12, detail=1, axis="X",
    )))
    objects.append(_stamp(_axial_cylinder(
        collection, f"{PREFIX}N2Tank",
        (-3.15, -0.72, 2.05), 0.16, 0.78, steel,
        "structural_metal", "nitrogen bottle",
        segments=12, detail=1, axis="X",
    )))
    objects.append(_stamp(_profile_prism(
        collection, f"{PREFIX}TankCradle",
        (-3.15, 0.0, 1.78), 0.95, 1.85, 1.55, 0.10, 0.08,
        armor, "armor_plate",
        "bottle cradle and straps",
        detail=1, bevel=0.006,
    )))
    objects.append(_stamp(_strut_between(
        collection, f"{PREFIX}TankLine",
        (-2.70, 0.72, 2.05), (0.85, -2.55, 0.62),
        0.016, steel, "structural_metal",
        "life-support line into the service bay",
    )))
    return objects


def _build_sensor_and_dock(collection, materials):
    objects = []
    steel = materials["service_steel"]
    armor = materials["armor"]
    objects.append(_stamp(_profile_prism(
        collection, f"{PREFIX}DockRing",
        (-4.85, 0.0, 2.85), 0.55, 0.62, 0.55, 0.08, 0.06,
        armor, "armor_plate",
        "dorsal docking ring",
        detail=1, bevel=0.006,
    )))
    objects.append(_stamp(_axial_cylinder(
        collection, f"{PREFIX}DockTunnel",
        (-4.85, 0.0, 2.62), 0.22, 0.28, steel,
        "structural_metal", "docking tunnel",
        segments=12, detail=1, axis="Z",
    )))
    objects.append(_stamp(_profile_prism(
        collection, f"{PREFIX}LidarHouse",
        (8.85, 0.0, 1.85), 0.42, 0.38, 0.32, 0.22, 0.18,
        armor, "armor_plate",
        "forward lidar house",
        detail=1, bevel=0.006,
    )))
    objects.append(_stamp(_axial_cylinder(
        collection, f"{PREFIX}LidarLens",
        (9.12, 0.0, 1.85), 0.09, 0.08, steel,
        "structural_metal", "lidar aperture",
        segments=12, detail=2, axis="X",
    )))
    return objects


def _build_fastener_courses(collection, materials):
    objects = []
    steel = materials["service_steel"]
    for i, x in enumerate((6.80, 4.40, 1.60, -1.20, -3.80, -6.40)):
        for sign, side in ((-1.0, "P"), (1.0, "S")):
            objects.append(_stamp(_axial_cylinder(
                collection, f"{PREFIX}Cleat_{side}_{i}",
                (x, 2.95 * sign, 1.22), 0.022, 0.05, steel,
                "structural_metal", "course cleat",
                segments=8, detail=2, axis="Y",
            )))
    return objects


def apply_hitch_hero_v10() -> dict:
    prior = apply_hitch_polish_v9()
    collection = _collection()
    materials = _materials()
    objects = []
    objects.extend(_build_landing_gear(collection, materials))
    objects.extend(_build_rcs_quads(collection, materials))
    objects.extend(_build_drive_throats(collection, materials))
    objects.extend(_build_service_bay(collection, materials))
    objects.extend(_build_radiator_cassettes(collection, materials))
    objects.extend(_build_canopy_glass(collection, materials))
    objects.extend(_build_life_support_and_tanks(collection, materials))
    objects.extend(_build_sensor_and_dock(collection, materials))
    objects.extend(_build_fastener_courses(collection, materials))
    root = _root()
    report = {
        "schema": "spaceface.hitchHero.v10",
        "passId": PASS_ID,
        "prior": prior,
        "objectsAdded": len(objects),
        "objectNames": [obj.name for obj in objects],
        "assemblies": [
            "oleo landing gear with scissors and pads",
            "six RCS quads with ceramic nozzles",
            "hollow drive bells and clamp collars",
            "open port service bay with pump and lines",
            "radiator cassette stacks and return lines",
            "greenhouse glass panes with thickness",
            "O2/N2 bottles and cradle",
            "dorsal dock ring and forward lidar house",
            "course cleats at plate joints",
        ],
    }
    root["hitchHeroPassV10"] = report
    return report
