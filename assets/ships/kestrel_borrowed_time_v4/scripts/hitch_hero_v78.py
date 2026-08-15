"""Hitch hero V78 / cycle 69: plate the upper cone face the 3Q sees.

Cycles 65-68 put courses on the lower flank. Store-shot still sees a
sealed gray wedge because that camera looks at the upper cone, not the
side. Hide the low plates. Lap courses on the upper face, outboard of
the casemate and canopy. No hull boolean. No pack hats.
"""
from __future__ import annotations

import bpy

from hitch_hero_v77 import apply_hitch_hero_v77
from hitch_polish_v8 import _folded_plate
from material_truth_v6 import _materials, _root, _source

PASS_ID = "kestrel-hitch-hero-v78"
COLLECTION_NAME = "KESTREL_V78_UPPER_CONE"
PREFIX = "V78_"
HIDE_PREFIXES = (
    "V77_Plate_",
    "V77_Seam_",
)

# Upper cone face: inboard just outboard of casemate/canopy, high Z.
# (x0,y0,z0) inboard-aft high -> (x1,y1,z1) inboard-fore high
# -> (x1,y2,z2) outboard-fore lower -> (x0,y3,z3) outboard-aft lower.
PLATES = (
    ("Aft",
     (2.20, 1.18, 2.02), (4.30, 1.22, 1.92),
     (4.30, 1.68, 1.52), (2.20, 1.64, 1.62)),
    ("Mid",
     (4.10, 1.20, 1.94), (6.40, 1.16, 1.78),
     (6.40, 1.62, 1.38), (4.10, 1.66, 1.54)),
    ("Fore",
     (6.20, 1.14, 1.80), (8.20, 0.98, 1.58),
     (8.20, 1.42, 1.18), (6.20, 1.58, 1.40)),
    ("Nose",
     (8.00, 0.96, 1.60), (10.10, 0.72, 1.36),
     (10.10, 1.18, 0.98), (8.00, 1.40, 1.20)),
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


def _hide_low_flanks():
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


def _side_upper(collection, materials, sign, side):
    """Upper-cone armor the store-shot camera actually sees.

    Fiction: brake-formed courses on the visible cone shoulder.
    Forbidden: covering casemate, canopy glass, or the gun trench.
    """
    armor = materials["armor"]
    steel = materials["service_steel"]
    objects = []
    for name, a, b, c, d in PLATES:
        pa, pb, pc, pd = (_mirror(a, sign), _mirror(b, sign), _mirror(c, sign), _mirror(d, sign))
        objects.append(_folded_plate(
            collection, f"{PREFIX}Plate_{side}_{name}",
            pa, pb, pc, pd,
            0.052, armor, "armor_plate",
            f"{side.lower()} {name.lower()} upper-cone course",
        ))
        objects.append(_folded_plate(
            collection, f"{PREFIX}Seam_{side}_{name}",
            (pb[0] - 0.016, pb[1], pb[2] + 0.018),
            (pb[0] + 0.016, pb[1], pb[2] + 0.018),
            (pc[0] + 0.016, pc[1], pc[2] + 0.018),
            (pc[0] - 0.016, pc[1], pc[2] + 0.018),
            0.024, steel, "structural_metal",
            f"{side.lower()} {name.lower()} upper-cone standing seam",
        ))
    return objects


def apply_hitch_hero_v78() -> dict:
    prior = apply_hitch_hero_v77()
    collection = _collection()
    materials = _materials()
    hidden = _hide_low_flanks()
    objects = []
    objects.extend(_side_upper(collection, materials, -1.0, "Port"))
    objects.extend(_side_upper(collection, materials, 1.0, "Starboard"))
    report = {
        "schema": "spaceface.hitchHero.v78",
        "passId": PASS_ID,
        "method": "upper-cone face courses the 3Q camera actually sees",
        "priorPass": "v77",
        "hiddenDonors": hidden,
        "objectsAdded": len(objects),
        "objectNames": [obj.name for obj in objects],
        "componentReference": "kestrel_midship_material_truth_reference_v1.png",
    }
    _root()["hitchHeroPassV78"] = {
        "passId": PASS_ID,
        "objectsAdded": int(len(objects)),
        "hiddenDonors": hidden,
    }
    return report
