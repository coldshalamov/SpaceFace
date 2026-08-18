"""Hitch hero V75 / cycle 66: thick proud cone courses, not thin cards.

Cycle 65 put plates on the cone, but they read as decals. Hide those
thin cards. Rebuild the same stations 60 mm thick and 30 mm proud so
the 3Q camera sees plate edges. Casemate and canopy stay clear.
No hull boolean. No pack hats. No soap boxes.
"""
from __future__ import annotations

import bpy

from hitch_hero_v74 import apply_hitch_hero_v74
from hitch_polish_v8 import _folded_plate
from material_truth_v6 import _materials, _root, _source

PASS_ID = "kestrel-hitch-hero-v75"
COLLECTION_NAME = "KESTREL_V75_THICK_CONE"
PREFIX = "V75_"
HIDE_PREFIXES = (
    "V74_Plate_",
    "V74_Lap_",
)

# Same stations as C65, pushed 30 mm outboard/down so the edge is proud.
PLATES = (
    ("Aft",
     (2.15, 1.35, 1.76), (4.55, 1.41, 1.60),
     (4.55, 2.12, 1.14), (2.15, 2.06, 1.30)),
    ("Mid",
     (4.42, 1.39, 1.62), (6.85, 1.25, 1.40),
     (6.85, 1.96, 0.94), (4.42, 2.10, 1.16)),
    ("Fore",
     (6.72, 1.23, 1.42), (9.35, 0.91, 1.06),
     (9.35, 1.52, 0.66), (6.72, 1.94, 0.96)),
)

PADS = (
    ("Aft",
     (2.55, 1.52, 1.70), (3.85, 1.56, 1.58),
     (3.85, 1.98, 1.28), (2.55, 1.94, 1.40)),
    ("Mid",
     (4.85, 1.50, 1.54), (6.15, 1.40, 1.38),
     (6.15, 1.82, 1.08), (4.85, 1.92, 1.24)),
    ("Fore",
     (7.15, 1.32, 1.32), (8.55, 1.08, 1.08),
     (8.55, 1.42, 0.82), (7.15, 1.66, 1.06)),
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


def _mirror(point, sign):
    return (point[0], point[1] * sign, point[2])


def _side_flanks(collection, materials, sign, side):
    """Thick proud cone courses with smaller inspection pads.

    Fiction: 60 mm brake-formed armor bolted proud of the cone.
    Forbidden: a thin card, a soap box, covering the casemate or glass.
    """
    armor = materials["armor"]
    steel = materials["service_steel"]
    objects = []
    for name, a, b, c, d in PLATES:
        pa, pb, pc, pd = (_mirror(a, sign), _mirror(b, sign), _mirror(c, sign), _mirror(d, sign))
        objects.append(_folded_plate(
            collection, f"{PREFIX}Plate_{side}_{name}",
            pa, pb, pc, pd,
            0.062, armor, "armor_plate",
            f"{side.lower()} {name.lower()} thick cone-flank course",
        ))
        objects.append(_folded_plate(
            collection, f"{PREFIX}Lap_{side}_{name}",
            (pb[0] - 0.045, pb[1], pb[2] + 0.018),
            (pb[0] + 0.016, pb[1], pb[2] + 0.018),
            (pc[0] + 0.016, pc[1], pc[2] + 0.018),
            (pc[0] - 0.045, pc[1], pc[2] + 0.018),
            0.022, steel, "structural_metal",
            f"{side.lower()} {name.lower()} thick cone-flank lap",
        ))
    for name, a, b, c, d in PADS:
        pa, pb, pc, pd = (_mirror(a, sign), _mirror(b, sign), _mirror(c, sign), _mirror(d, sign))
        objects.append(_folded_plate(
            collection, f"{PREFIX}Pad_{side}_{name}",
            pa, pb, pc, pd,
            0.028, armor, "armor_plate",
            f"{side.lower()} {name.lower()} cone inspection pad",
        ))
    return objects


def apply_hitch_hero_v75() -> dict:
    prior = apply_hitch_hero_v74()
    collection = _collection()
    materials = _materials()
    hidden = _hide_thin_cards()
    objects = []
    objects.extend(_side_flanks(collection, materials, -1.0, "Port"))
    objects.extend(_side_flanks(collection, materials, 1.0, "Starboard"))
    report = {
        "schema": "spaceface.hitchHero.v75",
        "passId": PASS_ID,
        "method": "thick proud cone courses with inspection pads; hide thin cards",
        "priorPass": "v74",
        "hiddenDonors": hidden,
        "objectsAdded": len(objects),
        "objectNames": [obj.name for obj in objects],
        "componentReference": "kestrel_midship_material_truth_reference_v1.png",
    }
    _root()["hitchHeroPassV75"] = {
        "passId": PASS_ID,
        "objectsAdded": int(len(objects)),
        "hiddenDonors": hidden,
    }
    return report
