"""Hitch hero V71 / cycle 62: hard access lids on the shingles.

Cycle 61 killed the soap boxes. The strip is shingled plate, but it still
lacks the raised access lids the midship reference uses. Keep the shingles.
Stand smaller hard-edged lids with hoop straps. Leave the mid hatch clear.
No hull boolean. No pack hats. No rounded cases.
"""
from __future__ import annotations

import bpy

from hitch_hero_v70 import apply_hitch_hero_v70
from hitch_polish_v8 import _folded_plate
from material_truth_v6 import _materials, _profile_prism, _root, _source
from hitch_hero_v24 import _stamp

PASS_ID = "kestrel-hitch-hero-v71"
COLLECTION_NAME = "KESTREL_V71_SHINGLE_LIDS"
PREFIX = "V71_"

# Smaller lids than C59. Gap around the V61 hatch at x=-1.55.
LIDS = (
    ("Aft", -3.72, -3.05),
    ("MidAft", -2.48, -2.02),
    ("MidFore", -1.08, -0.52),
    ("Fore", 0.38, 0.92),
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


def _side_lids(collection, materials, sign, side):
    """Hard-edged access lids bolted onto the shingled course.

    Fiction: field-replaced inspection lids on dorsal armor.
    Forbidden: a soap box, a hat, covering the trench or hatch.
    """
    armor = materials["armor"]
    steel = materials["service_steel"]
    hazard = materials["hazard"]
    objects = []
    y0 = 0.50 * sign
    y1 = 0.76 * sign
    y_mid = 0.63 * sign
    z_in = 2.176
    z_out = 2.148
    for name, x0, x1 in LIDS:
        objects.append(_folded_plate(
            collection, f"{PREFIX}Lid_{side}_{name}",
            (x0, y0, z_in), (x1, y0, z_in),
            (x1, y1, z_out), (x0, y1, z_out),
            0.028, armor, "armor_plate",
            f"{side.lower()} {name.lower()} dorsal inspection lid",
        ))
        objects.append(_folded_plate(
            collection, f"{PREFIX}Strap_{side}_{name}",
            (x0 + 0.04, y0, z_in + 0.010),
            (x0 + 0.06, y0, z_in + 0.010),
            (x0 + 0.06, y1, z_out + 0.010),
            (x0 + 0.04, y1, z_out + 0.010),
            0.010, steel, "structural_metal",
            f"{side.lower()} {name.lower()} lid hoop strap",
        ))
    objects.append(_stamp(_profile_prism(
        collection, f"{PREFIX}Mark_{side}",
        (-3.38, y_mid, 2.188),
        0.04, 0.14, 0.14, 0.010, 0.010,
        hazard, "marking",
        f"{side.lower()} dorsal lid service mark",
        detail=2, bevel=0.002,
    )))
    return objects


def apply_hitch_hero_v71() -> dict:
    prior = apply_hitch_hero_v70()
    collection = _collection()
    materials = _materials()
    objects = []
    objects.extend(_side_lids(collection, materials, -1.0, "Port"))
    objects.extend(_side_lids(collection, materials, 1.0, "Starboard"))
    report = {
        "schema": "spaceface.hitchHero.v71",
        "passId": PASS_ID,
        "method": "hard-edged inspection lids on the shingled course",
        "priorPass": "v70",
        "hiddenDonors": [],
        "objectsAdded": len(objects),
        "objectNames": [obj.name for obj in objects],
        "componentReference": "kestrel_midship_material_truth_reference_v1.png",
    }
    _root()["hitchHeroPassV71"] = {
        "passId": PASS_ID,
        "objectsAdded": int(len(objects)),
    }
    return report
