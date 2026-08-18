"""Hitch hero V61 / cycle 52: plate seams and a hatch on the gray hull strip.

Cycles 50-51 formed the trench and well lips. Close still shows the gray
band between them as a blank hull card. Do not hide the hull. Stand
course seams and one chamfered access hatch on that exact strip so the
look-down camera sees plate work, not a lid. No hull boolean. No pack hats.
"""
from __future__ import annotations

import bpy

from hitch_hero_v24 import _stamp
from hitch_hero_v60 import apply_hitch_hero_v60
from hitch_polish_v8 import _folded_plate
from material_truth_v6 import (
    _axial_cylinder,
    _chamfered_pressure_case,
    _materials,
    _profile_prism,
    _root,
    _source,
)

PASS_ID = "kestrel-hitch-hero-v61"
COLLECTION_NAME = "KESTREL_V61_HULL_SEAMS"
PREFIX = "V61_"

# Gray strip between trench lip y=±0.31 and well in-rim y=±0.97.
# Keep new parts in |y| = 0.42..0.86, z = 2.08..2.20, x around the close look-at.


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


def _strip_work(collection, materials, sign, side):
    """Seams and one hatch on the gray dorsal strip.

    Fiction: welded pressure-hull courses with a field access hatch.
    Forbidden: overlapping course cards, a lid over the trench, buried parts.
    """
    steel = materials["service_steel"]
    armor = materials["armor"]
    hazard = materials["hazard"]
    objects = []
    y0 = 0.48 * sign
    y1 = 0.82 * sign
    y_mid = 0.65 * sign
    z_top = 2.105

    for i, x in enumerate((-3.40, -2.20, -0.90, 0.40)):
        objects.append(_folded_plate(
            collection, f"{PREFIX}Seam_{side}_{i}",
            (x, y0, z_top), (x, y1, z_top),
            (x, y1, 2.18), (x, y0, 2.18),
            0.016, steel, "structural_metal",
            f"{side.lower()} dorsal hull-course seam",
        ))

    hx = -1.55
    objects.append(_stamp(_chamfered_pressure_case(
        collection, f"{PREFIX}Hatch_{side}",
        (hx, y_mid, 2.14),
        0.62, 0.28, 0.08, 0.03, armor,
        "armor_plate",
        f"{side.lower()} dorsal field-access hatch",
        detail=1,
    )))
    objects.append(_stamp(_profile_prism(
        collection, f"{PREFIX}HatchLip_{side}",
        (hx, y_mid, 2.175),
        0.28, 0.14, 0.12, 0.022, 0.018,
        steel, "structural_metal",
        f"{side.lower()} dorsal hatch lip",
        detail=2, bevel=0.003,
    )))
    objects.append(_stamp(_axial_cylinder(
        collection, f"{PREFIX}HatchLatch_{side}",
        (hx + 0.22, y_mid, 2.185),
        0.016, 0.022, steel, "structural_metal",
        f"{side.lower()} dorsal hatch latch",
        segments=8, detail=2, axis="Z",
    )))
    objects.append(_stamp(_profile_prism(
        collection, f"{PREFIX}HatchMark_{side}",
        (hx - 0.18, y_mid, 2.18),
        0.05, 0.18, 0.18, 0.014, 0.014,
        hazard, "marking",
        f"{side.lower()} dorsal hatch service mark",
        detail=2, bevel=0.002,
    )))
    return objects


def apply_hitch_hero_v61() -> dict:
    prior = apply_hitch_hero_v60()
    collection = _collection()
    materials = _materials()
    objects = []
    objects.extend(_strip_work(collection, materials, -1.0, "Port"))
    objects.extend(_strip_work(collection, materials, 1.0, "Starboard"))
    report = {
        "schema": "spaceface.hitchHero.v61",
        "passId": PASS_ID,
        "method": "course seams and a chamfered hatch on the gray dorsal strip",
        "priorPass": "v60",
        "hiddenDonors": [],
        "objectsAdded": len(objects),
        "objectNames": [obj.name for obj in objects],
        "componentReference": "kestrel_midship_material_truth_reference_v1.png",
    }
    _root()["hitchHeroPassV61"] = {
        "passId": PASS_ID,
        "objectsAdded": int(len(objects)),
    }
    return report
