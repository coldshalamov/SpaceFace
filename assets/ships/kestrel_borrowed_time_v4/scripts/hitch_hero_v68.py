"""Hitch hero V68 / cycle 59: thick overlapping access plates.

Cycle 58 broke the strip into lids, but those lids are still thin cards.
Hide the thin lids and beds. Keep the wrap lips and the mid hatch.
Stand thick chamfered plates with deep service slots so the close camera
sees plate edges, not decals. No hull boolean. No pack hats.
"""
from __future__ import annotations

import bpy

from hitch_hero_v24 import _stamp
from hitch_hero_v67 import apply_hitch_hero_v67
from hitch_polish_v8 import _folded_plate
from material_truth_v6 import _chamfered_pressure_case, _materials, _profile_prism, _root, _source

PASS_ID = "kestrel-hitch-hero-v68"
COLLECTION_NAME = "KESTREL_V68_THICK_LIDS"
PREFIX = "V68_"
HIDE_PREFIXES = (
    "V67_Bed_",
    "V67_Lid_",
    "V67_LidSeam_",
    "V67_Slot_",
    "V67_Lap_",
    "V67_Mark_",
)

# Center Z sits the 70 mm plate on the hull, not floating above it.
PLATES = (
    ("AftIn", -3.84, -3.16, 2.142),
    ("AftOut", -3.30, -2.46, 2.138),
    ("MidAft", -2.40, -1.94, 2.142),
    ("MidFore", -1.16, -0.44, 2.138),
    ("ForeIn", -0.40, 0.26, 2.142),
    ("ForeOut", 0.16, 0.98, 2.136),
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


def _hide_thin_cards():
    hidden = []
    for obj in bpy.data.objects:
        name = obj.name or ""
        if any(name.startswith(prefix) for prefix in HIDE_PREFIXES):
            obj.hide_render = True
            obj.hide_set(True)
            hidden.append(name)
    return hidden


def _side_plates(collection, materials, sign, side):
    """Thick overlapping dorsal access plates with real edge height.

    Fiction: field-replaced armor lids, 70 mm plate, chamfered and lapped.
    Forbidden: a thin card, a soap cube, a lid over the trench or hatch.
    """
    armor = materials["armor"]
    steel = materials["service_steel"]
    hazard = materials["hazard"]
    objects = []
    y_mid = 0.64 * sign
    y0 = 0.50 * sign
    y1 = 0.78 * sign

    for name, x0, x1, z in PLATES:
        length = x1 - x0
        cx = (x0 + x1) * 0.5
        objects.append(_stamp(_chamfered_pressure_case(
            collection, f"{PREFIX}Plate_{side}_{name}",
            (cx, y_mid, z),
            length, 0.30, 0.070, 0.022, armor,
            "armor_plate",
            f"{side.lower()} {name.lower()} thick dorsal access plate",
            detail=1,
        )))
        objects.append(_folded_plate(
            collection, f"{PREFIX}Strap_{side}_{name}",
            (x0 + 0.05, y0, z + 0.040),
            (x0 + 0.075, y0, z + 0.040),
            (x0 + 0.075, y1, z + 0.040),
            (x0 + 0.05, y1, z + 0.040),
            0.012, steel, "structural_metal",
            f"{side.lower()} {name.lower()} plate hoop strap",
        ))

    for i, (x0, x1) in enumerate(((-3.16, -3.04), (-1.94, -1.86), (0.26, 0.36))):
        objects.append(_folded_plate(
            collection, f"{PREFIX}Slot_{side}_{i}",
            (x0, y0, 2.112), (x1, y0, 2.112),
            (x1, y1, 2.100), (x0, y1, 2.100),
            0.012, steel, "structural_metal",
            f"{side.lower()} dorsal plate service slot",
        ))

    objects.append(_stamp(_profile_prism(
        collection, f"{PREFIX}Mark_{side}",
        (-3.50, y_mid, 2.186),
        0.05, 0.16, 0.16, 0.012, 0.012,
        hazard, "marking",
        f"{side.lower()} dorsal plate service mark",
        detail=2, bevel=0.002,
    )))
    return objects


def apply_hitch_hero_v68() -> dict:
    prior = apply_hitch_hero_v67()
    collection = _collection()
    materials = _materials()
    hidden = _hide_thin_cards()
    objects = []
    objects.extend(_side_plates(collection, materials, -1.0, "Port"))
    objects.extend(_side_plates(collection, materials, 1.0, "Starboard"))
    report = {
        "schema": "spaceface.hitchHero.v68",
        "passId": PASS_ID,
        "method": "thick chamfered overlapping access plates; hatch left clear",
        "priorPass": "v67",
        "hiddenDonors": hidden,
        "objectsAdded": len(objects),
        "objectNames": [obj.name for obj in objects],
        "componentReference": "kestrel_midship_material_truth_reference_v1.png",
    }
    _root()["hitchHeroPassV68"] = {
        "passId": PASS_ID,
        "objectsAdded": int(len(objects)),
        "hiddenDonors": hidden,
    }
    return report
