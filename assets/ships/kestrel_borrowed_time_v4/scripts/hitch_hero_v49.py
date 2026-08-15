"""Hitch hero V49 / cycle 40: overlapping dorsal courses, not stacked cards.

The pack bricks are gone. The remaining 3Q toy-read is Hull_TopPanel_00/01/02
sitting as three separate cards on Hull_Dorsal_Spine. Hide those cards and
lay three overlapping brake-formed courses with a slight crown, matching the
midship reference's continuous skin. Keep the wells, casemate, locker, and
hatch. No hull boolean. Do not touch DIE LAUGHING.
"""
from __future__ import annotations

import bpy

from hitch_hero_v24 import _stamp
from hitch_hero_v48 import apply_hitch_hero_v48
from hitch_polish_v8 import _folded_plate
from material_truth_v6 import _materials, _profile_prism, _root, _source

PASS_ID = "kestrel-hitch-hero-v49"
COLLECTION_NAME = "KESTREL_V49_DORSAL_COURSES"
PREFIX = "V49_"
HIDE_EXACT = {
    "Hull_TopPanel_00",
    "Hull_TopPanel_01",
    "Hull_TopPanel_02",
}


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


def _hide_card_stack():
    hidden = []
    for obj in bpy.data.objects:
        name = obj.name or ""
        base = name.split(".")[0]
        if name in HIDE_EXACT or base in HIDE_EXACT:
            obj.hide_render = True
            obj.hide_set(True)
            hidden.append(name)
    return hidden


def apply_hitch_hero_v49() -> dict:
    prior = apply_hitch_hero_v48()
    collection = _collection()
    materials = _materials()
    hidden = _hide_card_stack()
    armor = materials["armor"]
    steel = materials["service_steel"]
    objects = []
    # Exact donor homes. Courses overlap 0.20 so the spine reads as one skin.
    courses = (
        ("Aft", -6.50, -3.30, 2.20),
        ("Mid", -3.50, -0.20, 2.26),
        ("Fore", -0.40, 2.55, 2.20),
    )
    for name, x0, x1, z in courses:
        objects.append(_folded_plate(
            collection, f"{PREFIX}Course_{name}_Port",
            (x0, 0.00, z + 0.05),
            (x1, 0.00, z + 0.05),
            (x1, -0.58, z - 0.04),
            (x0, -0.58, z - 0.04),
            0.042, armor, "armor_plate",
            "brake-formed port dorsal armor course on the pressure spine",
        ))
        objects.append(_folded_plate(
            collection, f"{PREFIX}Course_{name}_Stbd",
            (x0, 0.00, z + 0.05),
            (x1, 0.00, z + 0.05),
            (x1, 0.58, z - 0.04),
            (x0, 0.58, z - 0.04),
            0.042, armor, "armor_plate",
            "brake-formed starboard dorsal armor course on the pressure spine",
        ))
        objects.append(_stamp(_profile_prism(
            collection, f"{PREFIX}Seam_{name}",
            ((x0 + x1) * 0.5, 0.0, z + 0.07),
            max(0.22, (x1 - x0) * 0.08), 0.16, 0.14, 0.03, 0.026,
            steel, "structural_metal",
            "overlap seam on the crowned dorsal course",
            detail=2, bevel=0.004,
        )))
    for i, x in enumerate((-3.40, -0.30)):
        objects.append(_folded_plate(
            collection, f"{PREFIX}Joint_{i}",
            (x - 0.10, -0.50, 2.16),
            (x + 0.10, -0.50, 2.16),
            (x + 0.10, 0.50, 2.16),
            (x - 0.10, 0.50, 2.16),
            0.028, steel, "structural_metal",
            "lap joint between overlapping dorsal courses",
        ))
    report = {
        "schema": "spaceface.hitchHero.v49",
        "passId": PASS_ID,
        "method": "hide Hull_TopPanel_00/01/02; overlapping crowned dorsal courses",
        "priorPass": "v48",
        "hiddenDonors": hidden,
        "objectsAdded": len(objects),
        "objectNames": [obj.name for obj in objects],
        "componentReference": "kestrel_midship_material_truth_reference_v1.png",
    }
    _root()["hitchHeroPassV49"] = {
        "passId": PASS_ID,
        "objectsAdded": int(len(objects)),
        "hiddenDonors": hidden,
    }
    return report
