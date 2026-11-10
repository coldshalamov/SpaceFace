"""Hitch hero V76 / cycle 67: inspection lids on the tight-rolled shell.

The cone now has thick courses. The rolled dorsal strip lost its lids
when the bilinear cards were hidden. Keep the shell. Stand hard-edged
lids on the roll, leaving the mid hatch clear.
No hull boolean. No pack hats. No soap boxes.
"""
from __future__ import annotations

import bpy

from hitch_hero_v24 import _stamp
from hitch_hero_v73 import Y_IN, Y_OUT, _roll_point
from hitch_hero_v75 import apply_hitch_hero_v75
from hitch_polish_v8 import _folded_plate
from material_truth_v6 import _materials, _profile_prism, _root, _source

PASS_ID = "kestrel-hitch-hero-v76"
COLLECTION_NAME = "KESTREL_V76_ROLL_LIDS"
PREFIX = "V76_"

# Inset on the rolled courses. Gap around the V61 hatch at x=-1.55.
LIDS = (
    ("Aft", -3.72, -2.70),
    ("MidAft", -2.50, -2.00),
    ("MidFore", -1.10, -0.52),
    ("ForeIn", -0.38, 0.22),
    ("ForeOut", 0.38, 0.96),
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
    """Hard-edged lids bolted onto the rolled dorsal shell.

    Fiction: field inspection lids on the rolled pressure course.
    Forbidden: a soap box, a hat, covering the trench or hatch.
    """
    armor = materials["armor"]
    steel = materials["service_steel"]
    hazard = materials["hazard"]
    objects = []
    y0 = 0.50 * sign
    y1 = 0.76 * sign
    _, z0, ny0, nz0 = _roll_point(y0)
    _, z1, ny1, nz1 = _roll_point(y1)
    proud = 0.028
    z0 += nz0 * proud
    z1 += nz1 * proud
    y0 += ny0 * proud
    y1 += ny1 * proud
    for name, x0, x1 in LIDS:
        objects.append(_folded_plate(
            collection, f"{PREFIX}Lid_{side}_{name}",
            (x0, y0, z0), (x1, y0, z0),
            (x1, y1, z1), (x0, y1, z1),
            0.026, armor, "armor_plate",
            f"{side.lower()} {name.lower()} rolled-course inspection lid",
        ))
        objects.append(_folded_plate(
            collection, f"{PREFIX}Strap_{side}_{name}",
            (x0 + 0.04, y0, z0 + 0.010),
            (x0 + 0.06, y0, z0 + 0.010),
            (x0 + 0.06, y1, z1 + 0.010),
            (x0 + 0.04, y1, z1 + 0.010),
            0.010, steel, "structural_metal",
            f"{side.lower()} {name.lower()} rolled-lid hoop strap",
        ))
    _, z_mark, ny_mark, nz_mark = _roll_point(0.63 * sign)
    objects.append(_stamp(_profile_prism(
        collection, f"{PREFIX}Mark_{side}",
        (-3.40, 0.63 * sign + ny_mark * proud, z_mark + nz_mark * proud + 0.016),
        0.04, 0.14, 0.14, 0.010, 0.010,
        hazard, "marking",
        f"{side.lower()} rolled-lid service mark",
        detail=2, bevel=0.002,
    )))
    return objects


def apply_hitch_hero_v76() -> dict:
    prior = apply_hitch_hero_v75()
    collection = _collection()
    materials = _materials()
    objects = []
    objects.extend(_side_lids(collection, materials, -1.0, "Port"))
    objects.extend(_side_lids(collection, materials, 1.0, "Starboard"))
    report = {
        "schema": "spaceface.hitchHero.v76",
        "passId": PASS_ID,
        "method": "hard-edged inspection lids on the tight-rolled dorsal shell",
        "priorPass": "v75",
        "hiddenDonors": [],
        "objectsAdded": len(objects),
        "objectNames": [obj.name for obj in objects],
        "componentReference": "kestrel_midship_material_truth_reference_v1.png",
    }
    _root()["hitchHeroPassV76"] = {
        "passId": PASS_ID,
        "objectsAdded": int(len(objects)),
    }
    return report
