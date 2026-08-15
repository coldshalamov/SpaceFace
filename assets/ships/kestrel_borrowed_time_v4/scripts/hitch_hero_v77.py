"""Hitch hero V77 / cycle 68: five overlapping cone courses.

Cycle 66 thickened three plates and they still read as a sealed wedge
in 3Q. Hide those three. Break the flank into five lapped courses with
proud standing seams the store-shot camera can count.
Casemate and canopy stay clear. No hull boolean. No pack hats.
"""
from __future__ import annotations

import bpy

from hitch_hero_v76 import apply_hitch_hero_v76
from hitch_polish_v8 import _folded_plate
from material_truth_v6 import _materials, _root, _source

PASS_ID = "kestrel-hitch-hero-v77"
COLLECTION_NAME = "KESTREL_V77_CONE_COURSES"
PREFIX = "V77_"
HIDE_PREFIXES = (
    "V75_Plate_",
    "V75_Lap_",
    "V75_Pad_",
)

# Five overlapping stations. Inboard y stays outboard of the casemate.
PLATES = (
    ("Aft",
     (1.95, 1.38, 1.80), (3.55, 1.42, 1.68),
     (3.55, 2.16, 1.22), (1.95, 2.10, 1.36)),
    ("AftMid",
     (3.35, 1.40, 1.70), (5.05, 1.36, 1.54),
     (5.05, 2.10, 1.08), (3.35, 2.14, 1.24)),
    ("Mid",
     (4.85, 1.34, 1.56), (6.55, 1.26, 1.38),
     (6.55, 2.00, 0.94), (4.85, 2.08, 1.12)),
    ("MidFore",
     (6.35, 1.24, 1.40), (8.05, 1.06, 1.16),
     (8.05, 1.72, 0.76), (6.35, 1.96, 0.98)),
    ("Fore",
     (7.85, 1.04, 1.18), (9.50, 0.88, 0.98),
     (9.50, 1.46, 0.62), (7.85, 1.70, 0.80)),
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


def _hide_three_plates():
    hidden = []
    for obj in bpy.data.objects:
        name = obj.name or ""
        if any(name.startswith(prefix) for prefix in HIDE_PREFIXES):
            obj.hide_render = True
            obj.hide_set(True)
            hidden.append(name)
    return hidden


def _mirror(point, sign):
    return (point[0], point[1] * sign, point[2])


def _side_flanks(collection, materials, sign, side):
    """Five lapped cone courses with proud standing seams.

    Fiction: brake-formed armor courses on the pressure-hull cone.
    Forbidden: a sealed wedge, a soap box, covering the casemate or glass.
    """
    armor = materials["armor"]
    steel = materials["service_steel"]
    objects = []
    for name, a, b, c, d in PLATES:
        pa, pb, pc, pd = (_mirror(a, sign), _mirror(b, sign), _mirror(c, sign), _mirror(d, sign))
        objects.append(_folded_plate(
            collection, f"{PREFIX}Plate_{side}_{name}",
            pa, pb, pc, pd,
            0.058, armor, "armor_plate",
            f"{side.lower()} {name.lower()} cone-flank course",
        ))
        objects.append(_folded_plate(
            collection, f"{PREFIX}Seam_{side}_{name}",
            (pb[0] - 0.018, pb[1], pb[2] + 0.022),
            (pb[0] + 0.018, pb[1], pb[2] + 0.022),
            (pc[0] + 0.018, pc[1], pc[2] + 0.022),
            (pc[0] - 0.018, pc[1], pc[2] + 0.022),
            0.028, steel, "structural_metal",
            f"{side.lower()} {name.lower()} cone-flank standing seam",
        ))
    return objects


def apply_hitch_hero_v77() -> dict:
    prior = apply_hitch_hero_v76()
    collection = _collection()
    materials = _materials()
    hidden = _hide_three_plates()
    objects = []
    objects.extend(_side_flanks(collection, materials, -1.0, "Port"))
    objects.extend(_side_flanks(collection, materials, 1.0, "Starboard"))
    report = {
        "schema": "spaceface.hitchHero.v77",
        "passId": PASS_ID,
        "method": "five overlapping cone courses with proud standing seams",
        "priorPass": "v76",
        "hiddenDonors": hidden,
        "objectsAdded": len(objects),
        "objectNames": [obj.name for obj in objects],
        "componentReference": "kestrel_midship_material_truth_reference_v1.png",
    }
    _root()["hitchHeroPassV77"] = {
        "passId": PASS_ID,
        "objectsAdded": int(len(objects)),
        "hiddenDonors": hidden,
    }
    return report
