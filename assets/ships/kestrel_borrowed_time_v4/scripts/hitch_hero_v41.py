"""Hitch hero V41 / cycle 32: play-scale sponson hats.

At DEFAULT_ZOOM=144 the hull is a chip. Wells and the bow trench
vanish. The only readable mass is the side radiator boxes. Fold a
hat-section outboard course onto those boxes so the live table sees
a wider manufactured wing, not a thicker tube. No hull boolean.
"""
from __future__ import annotations

import bpy

from hitch_hero_v24 import _stamp
from hitch_hero_v40 import apply_hitch_hero_v40
from hitch_polish_v8 import _folded_plate
from material_truth_v6 import _materials, _profile_prism, _root, _source

PASS_ID = "kestrel-hitch-hero-v41"
COLLECTION_NAME = "KESTREL_V41_SPONSON_HATS"
PREFIX = "V41_"


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


def apply_hitch_hero_v41() -> dict:
    prior = apply_hitch_hero_v40()
    collection = _collection()
    materials = _materials()
    armor = materials["armor"]
    steel = materials["service_steel"]
    radiator = materials.get("radiator", steel)
    objects = []
    for sign, side in ((-1.0, "Port"), (1.0, "Starboard")):
        objects.append(_folded_plate(
            collection, f"{PREFIX}Hat_{side}",
            (-7.35, 5.55 * sign, 1.22),
            (2.55, 5.55 * sign, 1.22),
            (2.15, 6.95 * sign, 1.62),
            (-6.95, 6.95 * sign, 1.62),
            0.048, armor, "armor_plate",
            f"{side.lower()} hat-section outboard radiator course the play camera can count",
        ))
        objects.append(_folded_plate(
            collection, f"{PREFIX}Lip_{side}",
            (-7.10, 6.95 * sign, 1.62),
            (2.15, 6.95 * sign, 1.62),
            (1.95, 6.95 * sign, 1.88),
            (-6.80, 6.95 * sign, 1.88),
            0.036, steel, "structural_metal",
            f"{side.lower()} steel lip on the outboard hat",
        ))
        for i, x in enumerate((-5.4, -2.1, 0.8)):
            objects.append(_stamp(_profile_prism(
                collection, f"{PREFIX}Stay_{side}_{i}",
                (x, 6.15 * sign, 1.38),
                0.42, 0.55, 0.48, 0.16, 0.12,
                radiator, "radiator",
                f"{side.lower()} radiator stay under the outboard hat",
                detail=1, bevel=0.004,
            )))
    report = {
        "schema": "spaceface.hitchHero.v41",
        "passId": PASS_ID,
        "method": "formed outboard sponson hats for gameplay-zoom silhouette",
        "priorPass": "v40",
        "objectsAdded": len(objects),
        "objectNames": [obj.name for obj in objects],
    }
    _root()["hitchHeroPassV41"] = {
        "passId": PASS_ID,
        "objectsAdded": int(len(objects)),
    }
    return report
