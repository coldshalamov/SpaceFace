"""Hitch hero V70 / cycle 61: shingled rolled courses, not soap boxes.

Cycle 60 covered the blank hull, but the lids are still discrete rounded
boxes sitting on that course. Hide those boxes. Lap hard-edged cambered
plates so the strip is shingled armor. Leave the mid hatch clear.
No hull boolean. No pack hats.
"""
from __future__ import annotations

import bpy

from hitch_hero_v69 import apply_hitch_hero_v69
from hitch_polish_v8 import _folded_plate
from material_truth_v6 import _materials, _root, _source

PASS_ID = "kestrel-hitch-hero-v70"
COLLECTION_NAME = "KESTREL_V70_SHINGLES"
PREFIX = "V70_"
HIDE_PREFIXES = (
    "V68_Plate_",
    "V68_Strap_",
    "V68_Slot_",
    "V68_Mark_",
)

# Overlapping shingles. Gap around the V61 hatch at x=-1.55.
SHINGLES = (
    ("Aft", -3.92, -2.52),
    ("MidAft", -2.62, -1.92),
    ("MidFore", -1.18, -0.40),
    ("ForeIn", -0.50, 0.34),
    ("ForeOut", 0.24, 1.08),
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


def _hide_soap_boxes():
    hidden = []
    for obj in bpy.data.objects:
        name = obj.name or ""
        if any(name.startswith(prefix) for prefix in HIDE_PREFIXES):
            obj.hide_render = True
            obj.hide_set(True)
            hidden.append(name)
    return hidden


def _side_shingles(collection, materials, sign, side):
    """Shingled cambered armor courses with visible lap joints.

    Fiction: brake-formed dorsal plates lapped onto the pressure course.
    Forbidden: a rounded soap box, a hat, a lid over the trench or hatch.
    """
    armor = materials["armor"]
    steel = materials["service_steel"]
    objects = []
    y_in = 0.44 * sign
    y_out = 0.84 * sign
    z_in = 2.150
    z_out = 2.118
    for name, x0, x1 in SHINGLES:
        objects.append(_folded_plate(
            collection, f"{PREFIX}Shingle_{side}_{name}",
            (x0, y_in, z_in), (x1, y_in, z_in),
            (x1, y_out, z_out), (x0, y_out, z_out),
            0.040, armor, "armor_plate",
            f"{side.lower()} {name.lower()} shingled dorsal armor",
        ))
        objects.append(_folded_plate(
            collection, f"{PREFIX}Lap_{side}_{name}",
            (x1 - 0.055, y_in, z_in + 0.010),
            (x1 + 0.012, y_in, z_in + 0.010),
            (x1 + 0.012, y_out, z_out + 0.010),
            (x1 - 0.055, y_out, z_out + 0.010),
            0.018, steel, "structural_metal",
            f"{side.lower()} {name.lower()} dorsal plate lap",
        ))
    return objects


def apply_hitch_hero_v70() -> dict:
    prior = apply_hitch_hero_v69()
    collection = _collection()
    materials = _materials()
    hidden = _hide_soap_boxes()
    objects = []
    objects.extend(_side_shingles(collection, materials, -1.0, "Port"))
    objects.extend(_side_shingles(collection, materials, 1.0, "Starboard"))
    report = {
        "schema": "spaceface.hitchHero.v70",
        "passId": PASS_ID,
        "method": "shingled cambered armor courses; hide soap-box lids",
        "priorPass": "v69",
        "hiddenDonors": hidden,
        "objectsAdded": len(objects),
        "objectNames": [obj.name for obj in objects],
        "componentReference": "kestrel_midship_material_truth_reference_v1.png",
    }
    _root()["hitchHeroPassV70"] = {
        "passId": PASS_ID,
        "objectsAdded": int(len(objects)),
        "hiddenDonors": hidden,
    }
    return report
