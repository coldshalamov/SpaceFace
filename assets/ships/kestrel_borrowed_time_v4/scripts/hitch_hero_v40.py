"""Hitch hero V40 / cycle 31: gameplay-zoom holes, not close-up jewelry.

Cycle 30 keeps from a close table still. A true DEFAULT_ZOOM=144 render
shows a 29 m hull as a small chip: hats, rims, and the bow trench vanish.
Only large dark openings and the green pod survive. A wider hull cut
shredded tangents. Recoat the existing wells with almost-black floors
so the live table sees holes, not hairlines. Keep the sloped casemate.
"""
from __future__ import annotations

import bpy

from hitch_hero_v24 import _stamp
from hitch_hero_v34 import WELLS
from hitch_hero_v39 import apply_hitch_hero_v39
from hitch_polish_v8 import _folded_plate
from material_truth_v6 import _materials, _profile_prism, _root, _source

PASS_ID = "kestrel-hitch-hero-v40"
COLLECTION_NAME = "KESTREL_V40_GAMEPLAY_HOLES"
PREFIX = "V40_"


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


def apply_hitch_hero_v40() -> dict:
    prior = apply_hitch_hero_v39()
    collection = _collection()
    materials = _materials()
    dark = materials["dark_aperture"]
    steel = materials["service_steel"]
    objects = []
    # Do not recut the pressure hull. Cycle 31's first widen shredded
    # LOD0_static_Hull tangents the same way the bow boolean shredded the gasket.
    for station, side, cx, cy, hx, hy in WELLS:
        name = f"{PREFIX}Hole_{station}_{side}"
        objects.append(_stamp(_profile_prism(
            collection, f"{name}_Floor",
            (cx, cy, 1.52), hx * 2.0 - 0.08, hy * 2.0 - 0.08, hy * 2.0 - 0.08, 0.05, 0.045,
            dark, "active_aperture",
            "gameplay-zoom well floor: a hole, not a teal sticker on the cone",
            detail=1, bevel=0.003,
        )))
        out_y = cy + (hy if cy > 0 else -hy)
        objects.append(_folded_plate(
            collection, f"{name}_Lip",
            (cx - hx, out_y, 2.02),
            (cx + hx, out_y, 2.02),
            (cx + hx, out_y, 2.28),
            (cx - hx, out_y, 2.28),
            0.044, steel, "structural_metal",
            "steel lip that lets the dark hole punch at 144 zoom",
        ))
    report = {
        "schema": "spaceface.hitchHero.v40",
        "passId": PASS_ID,
        "method": "gameplay-zoom well holes; dark floors; keep sloped casemate",
        "priorPass": "v39",
        "booleanCuts": [],
        "objectsAdded": len(objects),
        "objectNames": [obj.name for obj in objects],
    }
    _root()["hitchHeroPassV40"] = {
        "passId": PASS_ID,
        "objectsAdded": int(len(objects)),
        "cuts": 0,
    }
    return report
