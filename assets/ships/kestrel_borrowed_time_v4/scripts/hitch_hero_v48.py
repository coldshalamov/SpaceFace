"""Hitch hero V48 / cycle 39: a fitted hatch, not a slab on the case.

Cycle 38 killed the port green wall and put a steel lid on the V6 case.
The close still shows that lid as a blank board with two bolts. Translate
the existing repair-pod reference: chamfered hatch, hoop straps that wrap
the case, orange restraint band, lip around the inset. Keep the cycle-38
locker and inboard cladding. No hat frames. No hull boolean.
"""
from __future__ import annotations

import bpy

from hitch_hero_v24 import _stamp
from hitch_hero_v47 import apply_hitch_hero_v47
from hitch_polish_v8 import _folded_plate
from material_truth_v6 import (
    _axial_cylinder,
    _chamfered_pressure_case,
    _materials,
    _profile_prism,
    _root,
    _source,
)

PASS_ID = "kestrel-hitch-hero-v48"
COLLECTION_NAME = "KESTREL_V48_FITTED_HATCH"
PREFIX = "V48_"
HIDE_V47 = (
    "V47_StbdLid",
    "V47_StbdLidInset",
    "V47_StbdHazard",
    "V47_StbdLidLatch_0",
    "V47_StbdLidLatch_1",
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


def _hide_blank_lid():
    hidden = []
    for obj in bpy.data.objects:
        name = obj.name or ""
        if name in HIDE_V47:
            obj.hide_render = True
            obj.hide_set(True)
            hidden.append(name)
    return hidden


def apply_hitch_hero_v48() -> dict:
    prior = apply_hitch_hero_v47()
    collection = _collection()
    materials = _materials()
    hidden = _hide_blank_lid()
    armor = materials["armor"]
    steel = materials["service_steel"]
    hazard = materials["hazard"]
    objects = []
    cx, cy, cz = -1.45, 3.80, 1.34
    # Chamfered hatch sits on the case crown. Eight-sided, not a software cube.
    objects.append(_stamp(_chamfered_pressure_case(
        collection, f"{PREFIX}Hatch", (cx, cy, 1.93),
        2.55, 1.18, 0.16, 0.10, armor,
        "armor_plate",
        "chamfered loading hatch fitted to the starboard pressure case",
        detail=1,
    )))
    objects.append(_stamp(_profile_prism(
        collection, f"{PREFIX}HatchLip",
        (cx, cy, 2.03),
        1.10, 0.62, 0.58, 0.04, 0.035,
        steel, "structural_metal",
        "raised lip around the hatch hand-access field",
        detail=2, bevel=0.006,
    )))
    objects.append(_stamp(_profile_prism(
        collection, f"{PREFIX}HatchInset",
        (cx, cy, 2.06),
        0.78, 0.42, 0.38, 0.022, 0.018,
        steel, "structural_metal",
        "recessed hand-access field in the fitted hatch",
        detail=2, bevel=0.006,
    )))
    for i, t in enumerate((-0.62, 0.62)):
        objects.append(_stamp(_axial_cylinder(
            collection, f"{PREFIX}HatchLatch_{i}",
            (cx + 0.95 * t, cy - 0.18, 2.05),
            0.050, 0.055, steel, "structural_metal",
            "quarter-turn latch on the fitted hatch",
            segments=12, detail=2, axis="Z",
        )))
    # Hoop straps wrap the case in YZ so 3Q sees bands, not a green block.
    for clamp, x in enumerate((-2.45, -1.45, -0.45)):
        objects.append(_stamp(_profile_prism(
            collection, f"{PREFIX}BandTop_{clamp:02d}",
            (x, cy, 2.02),
            0.11, 1.42, 1.42, 0.07, 0.07,
            steel, "structural_metal",
            "restraint band over the fitted hatch",
            detail=1, bevel=0.008,
        )))
        objects.append(_folded_plate(
            collection, f"{PREFIX}BandIn_{clamp:02d}",
            (x - 0.06, 3.02, 0.90),
            (x + 0.06, 3.02, 0.90),
            (x + 0.06, 3.02, 2.00),
            (x - 0.06, 3.02, 2.00),
            0.032, steel, "structural_metal",
            "restraint band down the starboard inboard face",
        ))
        objects.append(_folded_plate(
            collection, f"{PREFIX}BandOut_{clamp:02d}",
            (x - 0.06, 4.56, 0.90),
            (x + 0.06, 4.56, 0.90),
            (x + 0.06, 4.56, 2.00),
            (x - 0.06, 4.56, 2.00),
            0.032, steel, "structural_metal",
            "restraint band down the starboard outboard face",
        ))
    objects.append(_stamp(_profile_prism(
        collection, f"{PREFIX}HazardTop",
        (cx + 0.55, cy, 2.04),
        0.14, 1.20, 1.20, 0.06, 0.06,
        hazard, "marking",
        "orange restraint strap over the fitted hatch",
        detail=2, bevel=0.004,
    )))
    objects.append(_folded_plate(
        collection, f"{PREFIX}HazardIn",
        (cx + 0.48, 3.01, 0.92),
        (cx + 0.62, 3.01, 0.92),
        (cx + 0.62, 3.01, 2.02),
        (cx + 0.48, 3.01, 2.02),
        0.026, hazard, "marking",
        "orange strap leg on the starboard inboard face",
    ))
    report = {
        "schema": "spaceface.hitchHero.v48",
        "passId": PASS_ID,
        "method": "chamfered hatch + wrapping hoop straps on the V6 case; keep cycle 38 locker",
        "priorPass": "v47",
        "hiddenDonors": hidden,
        "objectsAdded": len(objects),
        "objectNames": [obj.name for obj in objects],
        "componentReference": "kestrel_repair_pod_material_truth_reference_v1.png",
    }
    _root()["hitchHeroPassV48"] = {
        "passId": PASS_ID,
        "objectsAdded": int(len(objects)),
        "hiddenDonors": hidden,
    }
    return report
