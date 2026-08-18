"""Hitch hero V60 / cycle 51: form the well rims, not more trench jewelry.

Cycle 50 formed the trench lips. Close still shows the leftover V39 well
rims as tall blank rails. Hide those cards and stand segmented hat-section
lips on the same well homes. Stay at the old rim height. No hull boolean.
No pack hats. Keep the open wells.
"""
from __future__ import annotations

import bpy

from hitch_hero_v24 import _stamp
from hitch_hero_v34 import WELLS
from hitch_hero_v59 import apply_hitch_hero_v59
from hitch_polish_v8 import _folded_plate
from material_truth_v6 import (
    _axial_cylinder,
    _materials,
    _profile_prism,
    _root,
    _source,
)

PASS_ID = "kestrel-hitch-hero-v60"
COLLECTION_NAME = "KESTREL_V60_WELL_LIPS"
PREFIX = "V60_"
HIDE_PREFIXES = (
    "V39_Rim_",
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


def _hide_blank_rims():
    hidden = []
    for obj in bpy.data.objects:
        name = obj.name or ""
        if any(name.startswith(prefix) for prefix in HIDE_PREFIXES):
            obj.hide_render = True
            obj.hide_set(True)
            hidden.append(name)
    return hidden


def _well_lip(collection, materials, station, side, cx, cy, hx, hy):
    """Hat-section lip on one well wall.

    Fiction: brake-formed steel coaming around an open radiator well.
    Forbidden: a lid, a taller brick, a hat frame around a pack.
    """
    steel = materials["service_steel"]
    armor = materials["armor"]
    objects = []
    out_y = cy + (hy if cy > 0 else -hy)
    in_y = cy + (-0.58 if cy > 0 else 0.58)
    z0, z1 = 2.04, 2.28
    sign = 1.0 if cy > 0 else -1.0
    x0, x1 = cx - hx * 0.92, cx + hx * 0.92

    for wall, y_web, y_flange in (
        ("Out", out_y, out_y - 0.08 * sign),
        ("In", in_y, in_y + 0.08 * sign),
    ):
        objects.append(_folded_plate(
            collection, f"{PREFIX}Web_{station}_{side}_{wall}",
            (x0, y_web, z0), (x1, y_web, z0),
            (x1, y_web, z1), (x0, y_web, z1),
            0.030, steel, "structural_metal",
            f"{side.lower()} {station.lower()} well {wall.lower()} coaming web",
        ))
        spans = (
            (x0 + 0.08, cx - hx * 0.18),
            (cx - hx * 0.08, x1 - 0.08),
        )
        for i, (xa, xb) in enumerate(spans):
            if xb <= xa + 0.16:
                continue
            objects.append(_folded_plate(
                collection, f"{PREFIX}Flange_{station}_{side}_{wall}_{i}",
                (xa, y_web, z1), (xb, y_web, z1),
                (xb, y_flange, z1), (xa, y_flange, z1),
                0.016, armor, "armor_plate",
                f"{side.lower()} {station.lower()} well {wall.lower()} flange",
            ))
            objects.append(_stamp(_profile_prism(
                collection, f"{PREFIX}Tie_{station}_{side}_{wall}_{i}",
                ((xa + xb) * 0.5, (y_web + y_flange) * 0.5, 2.14),
                0.07, 0.08, 0.08, 0.16, 0.14,
                steel, "structural_metal",
                f"{side.lower()} {station.lower()} well {wall.lower()} tie",
                detail=2, bevel=0.003,
            )))
            objects.append(_stamp(_axial_cylinder(
                collection, f"{PREFIX}Bolt_{station}_{side}_{wall}_{i}",
                ((xa + xb) * 0.5, y_flange, 2.29),
                0.014, 0.024, steel, "structural_metal",
                f"{side.lower()} {station.lower()} well {wall.lower()} flange bolt",
                segments=8, detail=2, axis="Z",
            )))
    return objects


def apply_hitch_hero_v60() -> dict:
    prior = apply_hitch_hero_v59()
    collection = _collection()
    materials = _materials()
    hidden = _hide_blank_rims()
    objects = []
    for station, side, cx, cy, hx, hy in WELLS:
        objects.extend(_well_lip(collection, materials, station, side, cx, cy, hx, hy))
    report = {
        "schema": "spaceface.hitchHero.v60",
        "passId": PASS_ID,
        "method": "replace leftover well-rim cards with segmented hat-section lips",
        "priorPass": "v59",
        "hiddenDonors": hidden,
        "objectsAdded": len(objects),
        "objectNames": [obj.name for obj in objects],
        "componentReference": "kestrel_midship_material_truth_reference_v1.png",
    }
    _root()["hitchHeroPassV60"] = {
        "passId": PASS_ID,
        "objectsAdded": int(len(objects)),
        "hiddenDonors": hidden,
    }
    return report
