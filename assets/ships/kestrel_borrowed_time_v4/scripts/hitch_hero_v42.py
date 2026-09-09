"""Hitch hero V42 / cycle 33: slatted outboard fins, not lids.

Cycle 32 put blank hats on the radiators. They hid the slats and
read as boards. The gameplay camera still only counts large dark
gaps and the side boxes. Stand a course of separate radiator fins
outboard of the existing slats so the 144-zoom chip gets a wider
silhouette without a lid. Apply the cycle 31 keep. Skip the lids.
No hull boolean.
"""
from __future__ import annotations

import bpy

from hitch_hero_v24 import _stamp
from hitch_hero_v40 import apply_hitch_hero_v40
from hitch_polish_v8 import _folded_plate
from material_truth_v6 import _materials, _profile_prism, _root, _source

PASS_ID = "kestrel-hitch-hero-v42"
COLLECTION_NAME = "KESTREL_V42_SLATTED_FINS"
PREFIX = "V42_"

# Eight fins along each outboard radiator. Gaps are the dark that reads at 144.
FIN_X = (-6.85, -5.45, -4.05, -2.65, -1.25, 0.15, 1.55, 2.85)


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


def apply_hitch_hero_v42() -> dict:
    prior = apply_hitch_hero_v40()
    collection = _collection()
    materials = _materials()
    radiator = materials.get("radiator", materials["service_steel"])
    steel = materials["service_steel"]
    objects = []
    for sign, side in ((-1.0, "Port"), (1.0, "Starboard")):
        objects.append(_folded_plate(
            collection, f"{PREFIX}Rail_{side}",
            (-7.20, 6.05 * sign, 1.18),
            (3.10, 6.05 * sign, 1.18),
            (3.10, 6.05 * sign, 1.36),
            (-7.20, 6.05 * sign, 1.36),
            0.040, steel, "structural_metal",
            f"{side.lower()} outboard fin rail",
        ))
        for i, x in enumerate(FIN_X):
            objects.append(_folded_plate(
                collection, f"{PREFIX}Fin_{side}_{i}",
                (x - 0.18, 5.55 * sign, 1.20),
                (x + 0.18, 5.55 * sign, 1.20),
                (x + 0.16, 6.85 * sign, 1.72),
                (x - 0.16, 6.85 * sign, 1.72),
                0.034, radiator, "radiator",
                f"{side.lower()} radiator fin the play camera can count as a dark gap",
            ))
        objects.append(_stamp(_profile_prism(
            collection, f"{PREFIX}Tip_{side}",
            (3.35, 6.20 * sign, 1.40),
            0.42, 0.55, 0.40, 0.22, 0.16,
            steel, "structural_metal",
            f"{side.lower()} formed tip on the fin rail",
            detail=2, bevel=0.005,
        )))
    report = {
        "schema": "spaceface.hitchHero.v42",
        "passId": PASS_ID,
        "method": "slatted outboard fins; skip blank lids; keep cycle 31 wells and casemate",
        "priorPass": "v40",
        "skippedPasses": ["v41"],
        "objectsAdded": len(objects),
        "objectNames": [obj.name for obj in objects],
    }
    _root()["hitchHeroPassV42"] = {
        "passId": PASS_ID,
        "objectsAdded": int(len(objects)),
    }
    return report
