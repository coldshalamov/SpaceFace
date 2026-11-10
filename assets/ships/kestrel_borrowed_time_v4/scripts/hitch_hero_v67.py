"""Hitch hero V67 / cycle 58: overlapping cambered access lids.

Cycle 57 wrapped the strip into the openings, but the crowns are still
flat hats sitting on the hull. Hide those crowns. Keep the wrap lips.
Lay cambered course beds and overlapping raised access lids so the
strip reads as plate armor, not a lid. Leave the mid hatch clear.
No hull boolean. No pack hats.
"""
from __future__ import annotations

import bpy

from hitch_hero_v24 import _stamp
from hitch_hero_v66 import apply_hitch_hero_v66
from hitch_polish_v8 import _folded_plate
from material_truth_v6 import _materials, _profile_prism, _root, _source

PASS_ID = "kestrel-hitch-hero-v67"
COLLECTION_NAME = "KESTREL_V67_ROLLED_LIDS"
PREFIX = "V67_"
HIDE_PREFIXES = (
    "V66_Crown_",
)

# Cambered beds follow the leftover strip. Mid hatch lives near x=-1.55.
BEDS = (
    ("Aft", -3.90, -2.35),
    ("Mid", -2.45, -0.35),
    ("Fore", -0.45, 1.05),
)

# Raised lids. Gap around the V61 hatch so that hardware stays visible.
LIDS = (
    ("AftIn", -3.82, -3.18),
    ("AftOut", -3.32, -2.48),
    ("MidAft", -2.38, -1.96),
    ("MidFore", -1.14, -0.46),
    ("ForeIn", -0.38, 0.28),
    ("ForeOut", 0.18, 0.98),
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


def _hide_flat_crowns():
    hidden = []
    for obj in bpy.data.objects:
        name = obj.name or ""
        if any(name.startswith(prefix) for prefix in HIDE_PREFIXES):
            obj.hide_render = True
            obj.hide_set(True)
            hidden.append(name)
    return hidden


def _cambered_plate(collection, name, x0, x1, y_in, y_out, z_in, z_out, thickness, material, bill, function):
    """Single brake-formed course with a gentle roll toward the well."""
    return _folded_plate(
        collection, name,
        (x0, y_in, z_in), (x1, y_in, z_in),
        (x1, y_out, z_out), (x0, y_out, z_out),
        thickness, material, bill, function,
    )


def _side_lids(collection, materials, sign, side):
    """Overlapping access lids on a cambered pressure-hull course.

    Fiction: field-replaced armor lids lapped onto a rolled dorsal shell.
    Forbidden: a flat hat, a rounded soap box, a lid over the trench.
    """
    armor = materials["armor"]
    steel = materials["service_steel"]
    hazard = materials["hazard"]
    objects = []
    y_in = 0.43 * sign
    y_out = 0.85 * sign
    y_lid0 = 0.50 * sign
    y_lid1 = 0.78 * sign
    y_mid = 0.64 * sign
    z_in = 2.136
    z_out = 2.104
    z_lid_in = 2.168
    z_lid_out = 2.140

    for station, x0, x1 in BEDS:
        objects.append(_cambered_plate(
            collection, f"{PREFIX}Bed_{side}_{station}",
            x0, x1, y_in, y_out, z_in, z_out,
            0.016, armor, "armor_plate",
            f"{side.lower()} {station.lower()} cambered dorsal course",
        ))

    for name, x0, x1 in LIDS:
        objects.append(_cambered_plate(
            collection, f"{PREFIX}Lid_{side}_{name}",
            x0, x1, y_lid0, y_lid1, z_lid_in, z_lid_out,
            0.022, armor, "armor_plate",
            f"{side.lower()} {name.lower()} overlapping access lid",
        ))
        objects.append(_folded_plate(
            collection, f"{PREFIX}LidSeam_{side}_{name}",
            (x0 + 0.04, y_lid0, z_lid_in + 0.006),
            (x0 + 0.058, y_lid0, z_lid_in + 0.006),
            (x0 + 0.058, y_lid1, z_lid_out + 0.006),
            (x0 + 0.04, y_lid1, z_lid_out + 0.006),
            0.010, steel, "structural_metal",
            f"{side.lower()} {name.lower()} lid hoop strap",
        ))

    for i, x in enumerate((-2.40, -0.40)):
        objects.append(_folded_plate(
            collection, f"{PREFIX}Lap_{side}_{i}",
            (x - 0.045, y_in, z_in + 0.004),
            (x + 0.045, y_in, z_in + 0.004),
            (x + 0.045, y_out, z_out + 0.004),
            (x - 0.045, y_out, z_out + 0.004),
            0.020, steel, "structural_metal",
            f"{side.lower()} dorsal course lap",
        ))

    # Recessed service slots between lids so the overlaps read as gaps, not one slab.
    for i, (x0, x1) in enumerate(((-3.18, -3.08), (-1.96, -1.90), (0.28, 0.36))):
        objects.append(_cambered_plate(
            collection, f"{PREFIX}Slot_{side}_{i}",
            x0, x1, y_lid0, y_lid1, z_in - 0.012, z_out - 0.012,
            0.010, steel, "structural_metal",
            f"{side.lower()} dorsal service slot",
        ))

    objects.append(_stamp(_profile_prism(
        collection, f"{PREFIX}Mark_{side}",
        (-3.50, y_mid, 2.176),
        0.05, 0.16, 0.16, 0.012, 0.012,
        hazard, "marking",
        f"{side.lower()} dorsal lid service mark",
        detail=2, bevel=0.002,
    )))
    return objects


def apply_hitch_hero_v67() -> dict:
    prior = apply_hitch_hero_v66()
    collection = _collection()
    materials = _materials()
    hidden = _hide_flat_crowns()
    objects = []
    objects.extend(_side_lids(collection, materials, -1.0, "Port"))
    objects.extend(_side_lids(collection, materials, 1.0, "Starboard"))
    report = {
        "schema": "spaceface.hitchHero.v67",
        "passId": PASS_ID,
        "method": "cambered beds with overlapping raised access lids; hatch left clear",
        "priorPass": "v66",
        "hiddenDonors": hidden,
        "objectsAdded": len(objects),
        "objectNames": [obj.name for obj in objects],
        "componentReference": "kestrel_midship_material_truth_reference_v1.png",
    }
    _root()["hitchHeroPassV67"] = {
        "passId": PASS_ID,
        "objectsAdded": int(len(objects)),
        "hiddenDonors": hidden,
    }
    return report
