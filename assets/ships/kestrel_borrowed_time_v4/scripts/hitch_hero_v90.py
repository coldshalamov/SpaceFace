"""Hitch hero V90 / cycle 81: shingle the gapped tiles.

Cycle 80 put hardware on butt-jointed plates. The leftover is hull
showing in the gaps. Hide those plates, straps, and bolts. Rebuild
as the same brickwork with 90 mm laps so each tile covers the next.
Keep the well holes. No hull boolean. No pack hats.
"""
from __future__ import annotations

import bpy

from hitch_hero_v89 import apply_hitch_hero_v89
from hitch_hero_v88 import ROWS
from hitch_hero_v80 import _rolled_band
from hitch_hero_v79 import _cone_point
from hitch_polish_v8 import _folded_plate
from material_truth_v6 import _materials, _root, _source

PASS_ID = "kestrel-hitch-hero-v90"
COLLECTION_NAME = "KESTREL_V90_SHINGLE_TILES"
PREFIX = "V90_"
HIDE_PREFIXES = (
    "V88_Plate_",
    "V89_Strap_",
    "V89_Bolt_",
)
LAP = 0.08


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


def _hide_butt_tiles():
    hidden = []
    for obj in bpy.data.objects:
        name = obj.name or ""
        if any(name.startswith(prefix) for prefix in HIDE_PREFIXES):
            obj.hide_render = True
            obj.hide_set(True)
            hidden.append(name)
    return hidden


def _lapped(plates):
    ordered = [list(row) for row in sorted(plates, key=lambda row: row[1])]
    for index in range(len(ordered) - 1):
        width = ordered[index + 1][1] - ordered[index][2]
        if 0.04 < width < 0.16:
            ordered[index][2] = ordered[index][2] + LAP
            ordered[index + 1][1] = ordered[index + 1][1] - LAP
    return [(name, x0, x1) for name, x0, x1 in ordered]


def _lifted(x, t, lift, sign):
    y, z, ny, nz = _cone_point(x, t, sign)
    return (x, y + ny * lift, z + nz * lift)


def _bolt(collection, name, x, t, lift, sign, materials):
    steel = materials["service_steel"]
    hx, ht = 0.020, 0.014
    return _folded_plate(
        collection, name,
        _lifted(x - hx, t - ht, lift, sign),
        _lifted(x + hx, t - ht, lift, sign),
        _lifted(x + hx, t + ht, lift, sign),
        _lifted(x - hx, t + ht, lift, sign),
        0.032, steel, "structural_metal",
        "shingled cone plate fastener",
    )


def _side(collection, materials, sign, side):
    armor = materials["armor"]
    objects = []
    for row_name, t0, t1, thickness, plates in ROWS:
        lapped = _lapped(plates)
        for plate_name, x0, x1 in lapped:
            objects.append(_rolled_band(
                collection, f"{PREFIX}Plate_{side}_{row_name}_{plate_name}",
                x0, x1, t0, t1, sign, thickness, armor, "armor_plate",
                f"{side.lower()} {row_name.lower()} {plate_name.lower()} shingled cone plate",
            ))
            lift = thickness * 0.5 + 0.012
            span = x1 - x0
            for slot, frac in (("Aft", 0.28), ("Fore", 0.72)):
                objects.append(_bolt(
                    collection, f"{PREFIX}Bolt_{side}_{row_name}_{plate_name}_{slot}",
                    x0 + span * frac, t1 - 0.05, lift, sign, materials,
                ))
    return objects


def apply_hitch_hero_v90() -> dict:
    prior = apply_hitch_hero_v89()
    collection = _collection()
    materials = _materials()
    hidden = _hide_butt_tiles()
    objects = []
    objects.extend(_side(collection, materials, -1.0, "Port"))
    objects.extend(_side(collection, materials, 1.0, "Starboard"))
    report = {
        "schema": "spaceface.hitchHero.v90",
        "passId": PASS_ID,
        "method": "brickwork plates with 90 mm laps instead of hull-showing gaps",
        "priorPass": "v89",
        "hiddenDonors": hidden,
        "objectsAdded": len(objects),
        "objectNames": [obj.name for obj in objects],
        "componentReference": "kestrel_midship_material_truth_reference_v1.png",
    }
    _root()["hitchHeroPassV90"] = {
        "passId": PASS_ID,
        "objectsAdded": int(len(objects)),
        "hiddenDonors": hidden,
    }
    return report
