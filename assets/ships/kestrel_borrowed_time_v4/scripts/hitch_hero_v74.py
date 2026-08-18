"""Hitch hero V74 / cycle 65: overlapping courses on the cone flanks.

The dorsal strip is now a rolled shell. Store-shot 3Q still shows the
forward cone as a sealed gray wedge. Keep the casemate trench and
canopy. Lap hard-edged plates on the cone flanks only.
No hull boolean. No pack hats. No soap boxes.
"""
from __future__ import annotations

import bpy

from hitch_hero_v73 import apply_hitch_hero_v73
from hitch_polish_v8 import _folded_plate
from material_truth_v6 import _materials, _root, _source

PASS_ID = "kestrel-hitch-hero-v74"
COLLECTION_NAME = "KESTREL_V74_CONE_FLANKS"
PREFIX = "V74_"

# Four-corner plates on the pressure-hull cone, outboard of the canopy
# and below the casemate. Overlap 12 cm at the station joints.
# (x0,y0,z0) inboard-aft -> (x1,y1,z1) inboard-fore -> (x1,y2,z2) outboard-fore
# -> (x0,y3,z3) outboard-aft.
PLATES = (
    ("Aft",
     (2.15, 1.32, 1.78), (4.55, 1.38, 1.62),
     (4.55, 2.08, 1.18), (2.15, 2.02, 1.34)),
    ("Mid",
     (4.42, 1.36, 1.64), (6.85, 1.22, 1.42),
     (6.85, 1.92, 0.98), (4.42, 2.06, 1.20)),
    ("Fore",
     (6.72, 1.20, 1.44), (9.35, 0.88, 1.08),
     (9.35, 1.48, 0.70), (6.72, 1.90, 1.00)),
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


def _mirror(point, sign):
    return (point[0], point[1] * sign, point[2])


def _side_flanks(collection, materials, sign, side):
    """Overlapping cone-flank armor.

    Fiction: brake-formed courses on the pressure-hull cone.
    Forbidden: a lid over the casemate, glass, or trench. No soap box.
    """
    armor = materials["armor"]
    steel = materials["service_steel"]
    objects = []
    for name, a, b, c, d in PLATES:
        pa, pb, pc, pd = (_mirror(a, sign), _mirror(b, sign), _mirror(c, sign), _mirror(d, sign))
        objects.append(_folded_plate(
            collection, f"{PREFIX}Plate_{side}_{name}",
            pa, pb, pc, pd,
            0.034, armor, "armor_plate",
            f"{side.lower()} {name.lower()} cone-flank armor course",
        ))
        objects.append(_folded_plate(
            collection, f"{PREFIX}Lap_{side}_{name}",
            (pb[0] - 0.040, pb[1], pb[2] + 0.010),
            (pb[0] + 0.014, pb[1], pb[2] + 0.010),
            (pc[0] + 0.014, pc[1], pc[2] + 0.010),
            (pc[0] - 0.040, pc[1], pc[2] + 0.010),
            0.016, steel, "structural_metal",
            f"{side.lower()} {name.lower()} cone-flank lap",
        ))
    return objects


def apply_hitch_hero_v74() -> dict:
    prior = apply_hitch_hero_v73()
    collection = _collection()
    materials = _materials()
    objects = []
    objects.extend(_side_flanks(collection, materials, -1.0, "Port"))
    objects.extend(_side_flanks(collection, materials, 1.0, "Starboard"))
    report = {
        "schema": "spaceface.hitchHero.v74",
        "passId": PASS_ID,
        "method": "overlapping brake-formed courses on the cone flanks",
        "priorPass": "v73",
        "hiddenDonors": [],
        "objectsAdded": len(objects),
        "objectNames": [obj.name for obj in objects],
        "componentReference": "kestrel_midship_material_truth_reference_v1.png",
    }
    _root()["hitchHeroPassV74"] = {
        "passId": PASS_ID,
        "objectsAdded": int(len(objects)),
    }
    return report
