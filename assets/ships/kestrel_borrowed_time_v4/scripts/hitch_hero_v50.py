"""Hitch hero V50 / cycle 41: one formed dorsal crown, not overlapping cards.

Cycle 40 hid the three top-panel cards and laid overlapping plates. Close
stills still read as cards. The midship reference is a continuous eight-sided
pressure skin with inset access lids. Hide the cycle-40 plates. Stand two
chamfered crown sections on the real spine with a sensor saddle between
them, inset lids, and a service cable. Keep wells, locker, hatch. No hull
boolean. Do not touch DIE LAUGHING.
"""
from __future__ import annotations

import bpy

from hitch_hero_v24 import _stamp
from hitch_hero_v49 import apply_hitch_hero_v49
from hitch_polish_v8 import _folded_plate
from material_truth_v6 import (
    _axial_cylinder,
    _chamfered_pressure_case,
    _materials,
    _profile_prism,
    _root,
    _source,
)

PASS_ID = "kestrel-hitch-hero-v50"
COLLECTION_NAME = "KESTREL_V50_DORSAL_CROWN"
PREFIX = "V50_"
HIDE_PREFIXES = ("V49_Course_", "V49_Seam_", "V49_Joint_")


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


def _hide_card_courses():
    hidden = []
    for obj in bpy.data.objects:
        name = obj.name or ""
        if any(name.startswith(prefix) for prefix in HIDE_PREFIXES):
            obj.hide_render = True
            obj.hide_set(True)
            hidden.append(name)
    return hidden


def apply_hitch_hero_v50() -> dict:
    prior = apply_hitch_hero_v49()
    collection = _collection()
    materials = _materials()
    hidden = _hide_card_courses()
    armor = materials["armor"]
    steel = materials["service_steel"]
    cable = materials["cable"]
    objects = []
    # Two eight-sided crowns on Hull_Dorsal_Spine. Gap around the sensor stalk.
    objects.append(_stamp(_chamfered_pressure_case(
        collection, f"{PREFIX}CrownAft", (-3.55, 0.0, 2.16),
        5.80, 1.18, 0.22, 0.08, armor,
        "armor_plate",
        "formed eight-sided aft dorsal pressure crown",
        detail=0,
    )))
    objects.append(_stamp(_chamfered_pressure_case(
        collection, f"{PREFIX}CrownFore", (3.55, 0.0, 2.14),
        2.70, 1.08, 0.20, 0.07, armor,
        "armor_plate",
        "formed eight-sided fore dorsal pressure crown",
        detail=0,
    )))
    objects.append(_stamp(_profile_prism(
        collection, f"{PREFIX}SensorSaddle",
        (0.85, 0.0, 2.10),
        1.35, 0.92, 0.84, 0.10, 0.08,
        steel, "structural_metal",
        "machined saddle under the dorsal sensor stalk",
        detail=1, bevel=0.012,
    )))
    for name, cx, length in (("Aft", -4.85, 1.15), ("Mid", -2.05, 1.05)):
        objects.append(_stamp(_profile_prism(
            collection, f"{PREFIX}Inset_{name}",
            (cx, 0.0, 2.28),
            length, 0.62, 0.58, 0.04, 0.035,
            steel, "structural_metal",
            "recessed access lid in the dorsal crown",
            detail=1, bevel=0.008,
        )))
        objects.append(_folded_plate(
            collection, f"{PREFIX}InsetLip_{name}",
            (cx - length * 0.52, -0.34, 2.27),
            (cx + length * 0.52, -0.34, 2.27),
            (cx + length * 0.52, 0.34, 2.27),
            (cx - length * 0.52, 0.34, 2.27),
            0.018, steel, "structural_metal",
            "brake-formed lip around a dorsal access lid",
        ))
    objects.append(_stamp(_profile_prism(
        collection, f"{PREFIX}CableRun",
        (-2.40, 0.48, 2.22),
        6.20, 0.055, 0.050, 0.045, 0.040,
        cable, "cable_elastomer",
        "service cable along the starboard crown edge",
        detail=2, bevel=0.004,
    )))
    for i, x in enumerate((-4.80, -2.10, 0.40)):
        objects.append(_stamp(_axial_cylinder(
            collection, f"{PREFIX}CableClamp_{i}",
            (x, 0.48, 2.24),
            0.035, 0.06, steel, "structural_metal",
            "cable clamp on the dorsal crown",
            segments=10, detail=2, axis="Y",
        )))
    report = {
        "schema": "spaceface.hitchHero.v50",
        "passId": PASS_ID,
        "method": "hide cycle-40 cards; two chamfered crowns + sensor saddle + inset lids",
        "priorPass": "v49",
        "hiddenDonors": hidden,
        "objectsAdded": len(objects),
        "objectNames": [obj.name for obj in objects],
        "componentReference": "kestrel_midship_material_truth_reference_v1.png",
    }
    _root()["hitchHeroPassV50"] = {
        "passId": PASS_ID,
        "objectsAdded": int(len(objects)),
        "hiddenDonors": hidden,
    }
    return report
