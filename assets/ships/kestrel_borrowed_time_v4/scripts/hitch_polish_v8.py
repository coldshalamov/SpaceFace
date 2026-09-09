"""Hitch V8 extra polish: 20% beyond the remastered fleet and beyond live V4.

Starts from the V7 production blend. Does not redesign Hitch. Adds the three extras
the remasters never reached: a rooted bow weapon spine, a occupied greenhouse, and
overlapping midship/keel plate courses.
"""
from __future__ import annotations

import math

import bpy
from mathutils import Vector

from material_truth_v6 import (
    _axial_cylinder,
    _finish,
    _materials,
    _mesh_object,
    _profile_prism,
    _root,
    _source,
    _strut_between,
)


PASS_ID = "kestrel-hitch-polish-v8"
COLLECTION_NAME = "KESTREL_V8_HITCH_POLISH"
PREFIX = "V8_"


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


def _folded_plate(collection, name, a, b, c, d, thickness, material, bill, function):
    va, vb, vc, vd = Vector(a), Vector(b), Vector(c), Vector(d)
    normal = (vb - va).cross(vd - va)
    if normal.length < 1e-8:
        normal = Vector((0.0, 0.0, 1.0))
    else:
        normal.normalize()
    half = normal * (float(thickness) * 0.5)
    outer = (va + half, vb + half, vc + half, vd + half)
    inner = (va - half, vb - half, vc - half, vd - half)
    verts = [tuple(point) for point in (*outer, *inner)]
    faces = [
        (0, 1, 2, 3),
        (4, 7, 6, 5),
        (0, 3, 7, 4),
        (1, 0, 4, 5),
        (2, 1, 5, 6),
        (3, 2, 6, 7),
    ]
    obj = _mesh_object(collection, name, verts, faces)
    return _stamp(_finish(obj, material, bill, function, bevel=0.008, detail=1))


def _build_weapon_spine(collection, materials):
    """Root the twin guns into a brake-formed armor spine. Not cylinders on a box."""
    objects = []
    armor = materials["armor"]
    steel = materials["service_steel"]
    ceramic = materials["ceramic"]
    objects.append(_stamp(_profile_prism(
        collection, f"{PREFIX}WeaponSpineBed",
        (9.85, 0.0, 0.72), 5.40, 2.05, 1.35, 0.62, 0.38,
        armor, "armor_plate",
        "brake-formed twin-weapon spine bed",
        detail=1, bevel=0.016,
    )))
    for sign, side in ((-1.0, "Port"), (1.0, "Starboard")):
        objects.append(_folded_plate(
            collection, f"{PREFIX}GunCheek_{side}",
            (11.80, 0.55 * sign, 0.22), (8.40, 1.15 * sign, 0.18),
            (8.40, 1.15 * sign, 1.05), (11.80, 0.55 * sign, 1.12),
            0.055, armor, "armor_plate",
            "split armor course over the gun receiver",
        ))
        objects.append(_stamp(_profile_prism(
            collection, f"{PREFIX}GunTrunnion_{side}",
            (10.55, 1.05 * sign, 0.58), 0.85, 0.42, 0.36, 0.32, 0.28,
            steel, "structural_metal",
            "machined trunnion and recoil saddle",
            detail=1, bevel=0.010,
        )))
        objects.append(_stamp(_axial_cylinder(
            collection, f"{PREFIX}BarrelJacket_{side}",
            (12.05, 1.18 * sign, 0.42), 0.16, 1.55, ceramic,
            "ceramic_isolator", "refractory barrel jacket",
            segments=12, detail=1, axis="X",
        )))
        objects.append(_stamp(_axial_cylinder(
            collection, f"{PREFIX}BarrelIsolator_{side}",
            (12.85, 1.18 * sign, 0.42), 0.11, 0.22, steel,
            "drive_alloy", "barrel isolator collar",
            segments=10, detail=2, axis="X",
        )))
        objects.append(_folded_plate(
            collection, f"{PREFIX}RecoilRail_{side}",
            (11.20, 0.72 * sign, 0.18), (9.10, 0.88 * sign, 0.16),
            (9.10, 0.88 * sign, 0.32), (11.20, 0.72 * sign, 0.34),
            0.028, steel, "structural_metal",
            "recoil rail under the receiver",
        ))
    objects.append(_stamp(_profile_prism(
        collection, f"{PREFIX}SpineHatch",
        (9.20, 0.0, 1.08), 0.72, 0.55, 0.48, 0.08, 0.06,
        steel, "structural_metal",
        "recessed maintenance hatch on the weapon spine",
        detail=1, bevel=0.006,
    )))
    return objects


def _build_greenhouse(collection, materials):
    """Occupied greenhouse: seat, console, framed mullions. Not a teal brick."""
    objects = []
    armor = materials["armor"]
    steel = materials["service_steel"]
    glass = materials.get("canopy") or materials.get("glass") or armor
    objects.append(_stamp(_profile_prism(
        collection, f"{PREFIX}CanopyBrow",
        (6.85, 0.0, 2.18), 0.55, 1.55, 1.22, 0.28, 0.18,
        armor, "armor_plate",
        "forward brow over the greenhouse cut",
        detail=1, bevel=0.010,
    )))
    objects.append(_stamp(_profile_prism(
        collection, f"{PREFIX}CanopyAftBulk",
        (3.55, 0.0, 2.05), 0.22, 1.72, 1.55, 0.42, 0.36,
        armor, "armor_plate",
        "aft greenhouse bulkhead",
        detail=1, bevel=0.008,
    )))
    for sign, side in ((-1.0, "Port"), (1.0, "Starboard")):
        objects.append(_folded_plate(
            collection, f"{PREFIX}CanopyRail_{side}",
            (6.55, 0.78 * sign, 1.72), (3.85, 0.88 * sign, 1.68),
            (3.85, 0.88 * sign, 2.18), (6.55, 0.78 * sign, 2.22),
            0.032, steel, "structural_metal",
            "greenhouse cage rail",
        ))
    objects.append(_stamp(_profile_prism(
        collection, f"{PREFIX}CanopyMullion",
        (5.20, 0.0, 2.22), 0.08, 1.35, 1.28, 0.22, 0.20,
        steel, "structural_metal",
        "center greenhouse mullion",
        detail=1, bevel=0.004,
    )))
    objects.append(_stamp(_profile_prism(
        collection, f"{PREFIX}CockpitSeat",
        (4.85, 0.0, 1.42), 0.62, 0.48, 0.42, 0.22, 0.18,
        steel, "structural_metal",
        "pilot seat in the cut tub",
        detail=1, bevel=0.008,
    )))
    objects.append(_stamp(_profile_prism(
        collection, f"{PREFIX}CockpitBack",
        (4.48, 0.0, 1.68), 0.12, 0.44, 0.40, 0.32, 0.28,
        armor, "armor_plate",
        "seat back and harness plate",
        detail=1, bevel=0.006,
    )))
    objects.append(_stamp(_profile_prism(
        collection, f"{PREFIX}CockpitConsole",
        (5.85, 0.0, 1.52), 0.48, 0.62, 0.52, 0.10, 0.08,
        steel, "structural_metal",
        "forward console in the greenhouse",
        detail=1, bevel=0.005,
    )))
    objects.append(_stamp(_axial_cylinder(
        collection, f"{PREFIX}Stick",
        (5.55, 0.12, 1.72), 0.028, 0.28, steel,
        "structural_metal", "control stick",
        segments=8, detail=2, axis="Z",
    )))
    return objects


def _build_midship_plates(collection, materials):
    """Overlapping hull courses and keel wear plates the remasters never got."""
    objects = []
    armor = materials["armor"]
    steel = materials["service_steel"]
    hull = materials.get("hull") or armor
    objects.append(_folded_plate(
        collection, f"{PREFIX}KeelWear",
        (4.80, -0.42, -1.85), (-3.20, -0.42, -1.72),
        (-3.20, 0.42, -1.72), (4.80, 0.42, -1.85),
        0.045, steel, "structural_metal",
        "keel wear plate with real thickness",
    ))
    for sign, side in ((-1.0, "Port"), (1.0, "Starboard")):
        objects.append(_folded_plate(
            collection, f"{PREFIX}MidCourse_{side}",
            (3.80, 2.85 * sign, 0.55), (-2.40, 3.15 * sign, 0.48),
            (-2.40, 3.15 * sign, 1.28), (3.80, 2.85 * sign, 1.35),
            0.042, hull, "armor_plate",
            "overlapping midship pressure course",
        ))
        objects.append(_folded_plate(
            collection, f"{PREFIX}ShoulderCap_{side}",
            (1.60, 3.55 * sign, 1.22), (-2.80, 3.85 * sign, 1.15),
            (-2.80, 3.55 * sign, 1.62), (1.60, 3.25 * sign, 1.68),
            0.038, armor, "armor_plate",
            "replaceable shoulder armor cap",
        ))
    objects.append(_folded_plate(
        collection, f"{PREFIX}DorsalHatch",
        (-0.20, -0.32, 2.55), (-1.15, -0.32, 2.52),
        (-1.15, 0.32, 2.52), (-0.20, 0.32, 2.55),
        0.028, armor, "armor_plate",
        "dorsal service hatch lid",
    ))
    objects.append(_stamp(_strut_between(
        collection, f"{PREFIX}KeelStayP",
        (2.40, -0.55, -1.55), (-1.20, -0.62, -1.48),
        0.028, steel, "structural_metal",
        "keel stay under the pressure hull",
    )))
    objects.append(_stamp(_strut_between(
        collection, f"{PREFIX}KeelStayS",
        (2.40, 0.55, -1.55), (-1.20, 0.62, -1.48),
        0.028, steel, "structural_metal",
        "keel stay under the pressure hull",
    )))
    return objects


def apply_hitch_polish_v8() -> dict:
    collection = _collection()
    materials = _materials()
    objects = []
    objects.extend(_build_weapon_spine(collection, materials))
    objects.extend(_build_greenhouse(collection, materials))
    objects.extend(_build_midship_plates(collection, materials))
    root = _root()
    report = {
        "schema": "spaceface.hitchPolish.v8",
        "passId": PASS_ID,
        "objectsAdded": len(objects),
        "objectNames": [obj.name for obj in objects],
        "extras": [
            "rooted bow weapon spine from unused component reference",
            "occupied greenhouse with seat, console, and cage",
            "overlapping midship courses and keel wear plate",
        ],
        "brainstorm": [
            "weapon spine fairings so guns are not cylinders on a wedge",
            "cockpit occupancy so the canopy is a greenhouse not a brick",
            "keel/midship plate courses the remastered fleet never reached",
        ],
    }
    root["hitchPolishPassV8"] = report
    return report
