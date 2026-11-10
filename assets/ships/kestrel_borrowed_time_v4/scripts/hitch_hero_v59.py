"""Hitch hero V59 / cycle 50: form the trench lips, not more floor jewelry.

Cycle 49 put a manifold in the slot. Close still shows the leftover V25
walls as blank rails. Hide those cards and stand a hat-section coaming
with an inward flange, segmented ties, and bolt bosses. Stay inside the
old wall height so this is a lip, not a lid. No hull boolean. No pack hats.
"""
from __future__ import annotations

import bpy

from hitch_hero_v24 import _stamp
from hitch_hero_v58 import apply_hitch_hero_v58
from hitch_polish_v8 import _folded_plate
from material_truth_v6 import (
    _axial_cylinder,
    _materials,
    _profile_prism,
    _root,
    _source,
)

PASS_ID = "kestrel-hitch-hero-v59"
COLLECTION_NAME = "KESTREL_V59_TRENCH_LIPS"
PREFIX = "V59_"
HIDE_EXACT = (
    "V25_TrenchWall_Port",
    "V25_TrenchWall_Starboard",
    "V28_TrenchShadow",
)

# Old wall: x=(-7.20, 3.80), y=±0.30, z=(1.98, 2.22)
# New lip stays at that height and steps inward, never over the channel.


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


def _hide_blank_walls():
    hidden = []
    wanted = set(HIDE_EXACT)
    for obj in bpy.data.objects:
        name = obj.name or ""
        if name in wanted or name.split(".")[0] in wanted:
            obj.hide_render = True
            obj.hide_set(True)
            hidden.append(name)
    return hidden


def _side_lip(collection, materials, sign, side):
    """Hat-section trench coaming on one wall.

    Vertical web at y=±0.31, inward flange to y=±0.22, z top 2.20.
    Fiction: brake-formed steel coaming bolted to the dorsal trench.
    Forbidden: a lid, a hat frame around a pack, a new card stacked outside.
    """
    steel = materials["service_steel"]
    armor = materials["armor"]
    objects = []
    y_web = 0.31 * sign
    y_flange = 0.22 * sign
    y_mid = 0.265 * sign
    x0, x1 = -6.80, 3.40
    z0, z1 = 1.98, 2.20

    objects.append(_folded_plate(
        collection, f"{PREFIX}Web_{side}",
        (x0, y_web, z0), (x1, y_web, z0),
        (x1, y_web, z1), (x0, y_web, z1),
        0.028, steel, "structural_metal",
        f"{side.lower()} dorsal trench coaming web",
    ))
    # Segmented inward flange with drain gaps so it is not one card.
    spans = (
        (-6.70, -4.90),
        (-4.55, -2.75),
        (-2.40, -0.60),
        (-0.25, 1.35),
        (1.50, 3.20),
    )
    for i, (xa, xb) in enumerate(spans):
        objects.append(_folded_plate(
            collection, f"{PREFIX}Flange_{side}_{i}",
            (xa, y_web, z1), (xb, y_web, z1),
            (xb, y_flange, z1), (xa, y_flange, z1),
            0.018, armor, "armor_plate",
            f"{side.lower()} trench coaming flange segment",
        ))
        objects.append(_stamp(_profile_prism(
            collection, f"{PREFIX}Tie_{side}_{i}",
            ((xa + xb) * 0.5, y_mid, 2.08),
            0.08, 0.10, 0.10, 0.18, 0.16,
            steel, "structural_metal",
            f"{side.lower()} trench coaming tie",
            detail=2, bevel=0.004,
        )))
        objects.append(_stamp(_axial_cylinder(
            collection, f"{PREFIX}Bolt_{side}_{i}",
            ((xa + xb) * 0.5, y_flange + 0.012 * sign, 2.21),
            0.016, 0.028, steel, "structural_metal",
            f"{side.lower()} trench coaming flange bolt",
            segments=8, detail=2, axis="Z",
        )))
    return objects


def apply_hitch_hero_v59() -> dict:
    prior = apply_hitch_hero_v58()
    collection = _collection()
    materials = _materials()
    hidden = _hide_blank_walls()
    objects = []
    objects.extend(_side_lip(collection, materials, -1.0, "Port"))
    objects.extend(_side_lip(collection, materials, 1.0, "Starboard"))
    report = {
        "schema": "spaceface.hitchHero.v59",
        "passId": PASS_ID,
        "method": "replace leftover trench wall cards with segmented hat-section lips",
        "priorPass": "v58",
        "hiddenDonors": hidden,
        "objectsAdded": len(objects),
        "objectNames": [obj.name for obj in objects],
        "componentReference": "kestrel_midship_material_truth_reference_v1.png",
    }
    _root()["hitchHeroPassV59"] = {
        "passId": PASS_ID,
        "objectsAdded": int(len(objects)),
        "hiddenDonors": hidden,
    }
    return report
