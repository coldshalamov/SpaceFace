"""Hitch hero V66 / cycle 57: wrap the strip skin into the openings.

Cycle 56 covered the gray band, but the plates are still cards on the
hull. Hide those flats. Fold each course down into the trench and the
well so the strip is a hat-section skin, not a lid. Keep seams and the
mid hatch. No hull boolean. No pack hats.
"""
from __future__ import annotations

import bpy

from hitch_hero_v24 import _stamp
from hitch_hero_v65 import apply_hitch_hero_v65
from hitch_polish_v8 import _folded_plate
from material_truth_v6 import _materials, _profile_prism, _root, _source

PASS_ID = "kestrel-hitch-hero-v66"
COLLECTION_NAME = "KESTREL_V66_STRIP_WRAP"
PREFIX = "V66_"
HIDE_PREFIXES = (
    "V65_Plate_",
)

PLATES = (
    ("Aft", -3.90, -2.35, 2.118),
    ("Mid", -2.45, -0.35, 2.142),
    ("Fore", -0.45, 1.05, 2.118),
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


def _hide_flat_skins():
    hidden = []
    for obj in bpy.data.objects:
        name = obj.name or ""
        if any(name.startswith(prefix) for prefix in HIDE_PREFIXES):
            obj.hide_render = True
            obj.hide_set(True)
            hidden.append(name)
    return hidden


def _side_wrap(collection, materials, sign, side):
    """Hat-section strip: crown plus lips into the trench and well.

    Fiction: brake-formed dorsal armor wrapping the service openings.
    Forbidden: a flat card, a lid over the trench, a pack hat.
    """
    armor = materials["armor"]
    objects = []
    y_trench = 0.32 * sign
    y_well = 0.96 * sign
    y_in = 0.42 * sign
    y_out = 0.86 * sign
    z_lip = 2.00
    for station, x0, x1, z in PLATES:
        objects.append(_folded_plate(
            collection, f"{PREFIX}Crown_{side}_{station}",
            (x0, y_in, z), (x1, y_in, z),
            (x1, y_out, z), (x0, y_out, z),
            0.022, armor, "armor_plate",
            f"{side.lower()} {station.lower()} dorsal armor crown",
        ))
        objects.append(_folded_plate(
            collection, f"{PREFIX}LipTrench_{side}_{station}",
            (x0, y_in, z), (x1, y_in, z),
            (x1, y_trench, z_lip), (x0, y_trench, z_lip),
            0.018, armor, "armor_plate",
            f"{side.lower()} {station.lower()} trench wrap",
        ))
        objects.append(_folded_plate(
            collection, f"{PREFIX}LipWell_{side}_{station}",
            (x0, y_out, z), (x1, y_out, z),
            (x1, y_well, z_lip), (x0, y_well, z_lip),
            0.018, armor, "armor_plate",
            f"{side.lower()} {station.lower()} well wrap",
        ))
    return objects


def apply_hitch_hero_v66() -> dict:
    prior = apply_hitch_hero_v65()
    collection = _collection()
    materials = _materials()
    hidden = _hide_flat_skins()
    objects = []
    objects.extend(_side_wrap(collection, materials, -1.0, "Port"))
    objects.extend(_side_wrap(collection, materials, 1.0, "Starboard"))
    report = {
        "schema": "spaceface.hitchHero.v66",
        "passId": PASS_ID,
        "method": "hat-section strip skin wrapping into trench and well",
        "priorPass": "v65",
        "hiddenDonors": hidden,
        "objectsAdded": len(objects),
        "objectNames": [obj.name for obj in objects],
        "componentReference": "kestrel_midship_material_truth_reference_v1.png",
    }
    _root()["hitchHeroPassV66"] = {
        "passId": PASS_ID,
        "objectsAdded": int(len(objects)),
        "hiddenDonors": hidden,
    }
    return report
