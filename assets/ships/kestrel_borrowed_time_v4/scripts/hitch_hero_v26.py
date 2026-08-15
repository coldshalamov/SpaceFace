"""Hitch hero V26 / cycle 17: chines so the table does not see a tube.

Cycle 16 wells and dorsal courses keep. The leftover read from above is
still a long oval hull. Lay brake-formed chine plates along the
hull-sponson join so the play camera sees a stepped section, not a
sausage with radiators glued on.
"""
from __future__ import annotations

import bpy

from hitch_hero_v24 import _stamp
from hitch_hero_v25 import apply_hitch_hero_v25
from hitch_polish_v8 import _folded_plate
from material_truth_v6 import _materials, _profile_prism, _root, _source

PASS_ID = "kestrel-hitch-hero-v26"
COLLECTION_NAME = "KESTREL_V26_CHINES"
PREFIX = "V26_"


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


def _build_chines(collection, materials):
    objects = []
    armor = materials["armor"]
    steel = materials["service_steel"]
    for sign, side in ((-1.0, "Port"), (1.0, "Starboard")):
        y0 = 1.72 * sign
        y1 = 2.55 * sign
        objects.append(_folded_plate(
            collection, f"{PREFIX}ChineUpper_{side}",
            (-7.40, y0, 1.92), (5.20, y0, 1.78),
            (5.20, y1, 1.42), (-7.40, y1, 1.52),
            0.040, armor, "armor_plate",
            f"{side.lower()} brake-formed upper chine",
        ))
        objects.append(_folded_plate(
            collection, f"{PREFIX}ChineLower_{side}",
            (-7.40, y1, 1.52), (5.20, y1, 1.42),
            (5.20, y1, 1.05), (-7.40, y1, 1.12),
            0.036, steel, "structural_metal",
            f"{side.lower()} chine drop to the sponson",
        ))
        for i, x in enumerate((-5.80, -2.40, 1.10, 4.20)):
            objects.append(_stamp(_profile_prism(
                collection, f"{PREFIX}ChineRib_{side}_{i}",
                (x, 2.12 * sign, 1.48),
                0.12, 0.72, 0.62, 0.42, 0.36,
                steel, "structural_metal",
                f"{side.lower()} chine rib",
                detail=2, bevel=0.006,
            )))
    return objects


def apply_hitch_hero_v26() -> dict:
    prior = apply_hitch_hero_v25()
    collection = _collection()
    materials = _materials()
    objects = _build_chines(collection, materials)
    report = {
        "schema": "spaceface.hitchHero.v26",
        "passId": PASS_ID,
        "method": "brake-formed chines so the table sees a stepped hull, not a tube",
        "priorPass": "v25",
        "objectsAdded": len(objects),
        "objectNames": [obj.name for obj in objects],
    }
    _root()["hitchHeroPassV26"] = {
        "passId": PASS_ID,
        "objectsAdded": int(len(objects)),
    }
    return report
