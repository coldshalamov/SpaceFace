"""Hitch hero V82 / cycle 73: recess the lids into the shingles.

Cycle 72 bolted proud stamps on the two bands. Store-shot still reads
lids sitting on the cone. Hide those stamps. Cut a pocket, rim, and
inset lid into each band, then run a service line along the inboard
course. No hull boolean. No pack hats.
"""
from __future__ import annotations

import bpy

from hitch_hero_v81 import apply_hitch_hero_v81
from hitch_hero_v79 import _cone_point
from hitch_polish_v8 import _folded_plate
from material_truth_v6 import _materials, _root, _source, _strut_between

PASS_ID = "kestrel-hitch-hero-v82"
COLLECTION_NAME = "KESTREL_V82_RECESS_LIDS"
PREFIX = "V82_"
HIDE_PREFIXES = (
    "V81_Hatch_",
)

# Same stations as C72. lift is the course outer face, not the proud stamp height.
WELLS = (
    ("InAft", 2.72, 0.24, 0.040),
    ("InMid", 4.90, 0.26, 0.040),
    ("InFore", 7.06, 0.22, 0.040),
    ("InNose", 9.22, 0.20, 0.040),
    ("OutAftMid", 3.82, 0.72, 0.032),
    ("OutMidFore", 6.00, 0.70, 0.032),
    ("OutForeOut", 8.18, 0.68, 0.032),
)

CONDUIT = (
    (2.40, 4.20, 0.14),
    (4.10, 6.40, 0.13),
    (6.30, 8.50, 0.12),
    (8.40, 9.90, 0.11),
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


def _hide_proud_stamps():
    hidden = []
    for obj in bpy.data.objects:
        name = obj.name or ""
        if any(name.startswith(prefix) for prefix in HIDE_PREFIXES):
            obj.hide_render = True
            obj.hide_set(True)
            hidden.append(name)
    return hidden


def _quad(x, t, hx, ht, lift, sign):
    pts = []
    for xi, ti in (
        (x - hx, t - ht),
        (x + hx, t - ht),
        (x + hx, t + ht),
        (x - hx, t + ht),
    ):
        y, z, ny, nz = _cone_point(xi, ti, sign)
        pts.append((xi, y + ny * lift, z + nz * lift))
    return pts


def _well(collection, name, x, t, face, sign, materials):
    armor = materials["armor"]
    steel = materials["service_steel"]
    objects = [
        _folded_plate(
            collection, f"{name}_Pocket",
            *_quad(x, t, 0.24, 0.090, face - 0.018, sign),
            0.040, steel, "structural_metal",
            "recessed cone inspection pocket",
        ),
        _folded_plate(
            collection, f"{name}_Rim",
            *_quad(x, t, 0.23, 0.086, face + 0.004, sign),
            0.034, steel, "structural_metal",
            "recessed cone inspection rim",
        ),
        _folded_plate(
            collection, f"{name}_Lid",
            *_quad(x, t, 0.155, 0.052, face - 0.010, sign),
            0.040, armor, "armor_plate",
            "recessed cone inspection lid",
        ),
    ]
    return objects


def _lifted(x, t, lift, sign):
    y, z, ny, nz = _cone_point(x, t, sign)
    return (x, y + ny * lift, z + nz * lift)


def _side(collection, materials, sign, side):
    steel = materials["service_steel"]
    objects = []
    for name, x, t, face in WELLS:
        objects.extend(_well(
            collection, f"{PREFIX}Well_{side}_{name}",
            x, t, face, sign, materials,
        ))
    for index, (x0, x1, t) in enumerate(CONDUIT):
        start = _lifted(x0, t, 0.050, sign)
        end = _lifted(x1, t, 0.050, sign)
        objects.append(_strut_between(
            collection, f"{PREFIX}Conduit_{side}_{index}",
            start, end, 0.022, steel, "structural_metal",
            f"{side.lower()} inboard cone service run",
            segments=8, detail=1,
        ))
        objects.append(_strut_between(
            collection, f"{PREFIX}Clamp_{side}_{index}",
            _lifted(x0 + 0.04, t, 0.038, sign),
            _lifted(x0 + 0.10, t, 0.062, sign),
            0.016, steel, "structural_metal",
            f"{side.lower()} cone conduit clamp",
            segments=6, detail=1,
        ))
    return objects


def apply_hitch_hero_v82() -> dict:
    prior = apply_hitch_hero_v81()
    collection = _collection()
    materials = _materials()
    hidden = _hide_proud_stamps()
    objects = []
    objects.extend(_side(collection, materials, -1.0, "Port"))
    objects.extend(_side(collection, materials, 1.0, "Starboard"))
    report = {
        "schema": "spaceface.hitchHero.v82",
        "passId": PASS_ID,
        "method": "recessed pockets and a service run on the shingled cone",
        "priorPass": "v81",
        "hiddenDonors": hidden,
        "objectsAdded": len(objects),
        "objectNames": [obj.name for obj in objects],
        "componentReference": "kestrel_midship_material_truth_reference_v1.png",
    }
    _root()["hitchHeroPassV82"] = {
        "passId": PASS_ID,
        "objectsAdded": int(len(objects)),
        "hiddenDonors": hidden,
    }
    return report
