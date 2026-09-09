"""Hitch hero V81 / cycle 72: inspection lids on the shingled cone bands.

Cycle 71 replaced stamp lids with two overlapping courses. Store-shot
lost the access hardware. Keep the shingles. Seat thick frames and lids
on each band, not on a single ribbon. Inboard lids stay outboard of the
canopy. No hull boolean. No pack hats.
"""
from __future__ import annotations

import bpy

from hitch_hero_v80 import apply_hitch_hero_v80
from hitch_hero_v79 import _cone_point
from hitch_polish_v8 import _folded_plate
from material_truth_v6 import _materials, _root, _source

PASS_ID = "kestrel-hitch-hero-v81"
COLLECTION_NAME = "KESTREL_V81_SHINGLE_LIDS"
PREFIX = "V81_"

# Sit on the In band (t 0-0.58) or Out band (t 0.40-1.00), not on the overlap seam.
HATCHES = (
    ("InAft", 2.72, 0.24, 0.058),
    ("InMid", 4.90, 0.26, 0.058),
    ("InFore", 7.06, 0.22, 0.058),
    ("InNose", 9.22, 0.20, 0.058),
    ("OutAftMid", 3.82, 0.72, 0.052),
    ("OutMidFore", 6.00, 0.70, 0.052),
    ("OutForeOut", 8.18, 0.68, 0.052),
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


def _hatch(collection, name, x, t, lift, sign, materials):
    hx, ht = 0.22, 0.08
    armor = materials["armor"]
    steel = materials["service_steel"]
    xs = (x - hx, x + hx, x + hx, x - hx)
    ts = (t - ht, t - ht, t + ht, t + ht)
    frame_pts = []
    for xi, ti in zip(xs, ts):
        y, z, ny, nz = _cone_point(xi, ti, sign)
        frame_pts.append((xi, y + ny * lift, z + nz * lift))
    objects = [
        _folded_plate(
            collection, f"{name}_Frame",
            frame_pts[0], frame_pts[1], frame_pts[2], frame_pts[3],
            0.034, steel, "structural_metal",
            "shingle-band inspection frame",
        ),
    ]
    inner = []
    inner_xs = (x - hx * 0.62, x + hx * 0.62, x + hx * 0.62, x - hx * 0.62)
    inner_ts = (t - ht * 0.58, t - ht * 0.58, t + ht * 0.58, t + ht * 0.58)
    for xi, ti in zip(inner_xs, inner_ts):
        y, z, ny, nz = _cone_point(xi, ti, sign)
        inner.append((xi, y + ny * (lift - 0.010), z + nz * (lift - 0.010)))
    objects.append(_folded_plate(
        collection, f"{name}_Lid",
        inner[0], inner[1], inner[2], inner[3],
        0.042, armor, "armor_plate",
        "shingle-band inspection lid",
    ))
    strap = []
    strap_xs = (x - 0.04, x + 0.04, x + 0.04, x - 0.04)
    strap_ts = (t - ht * 0.70, t - ht * 0.70, t + ht * 0.70, t + ht * 0.70)
    for xi, ti in zip(strap_xs, strap_ts):
        y, z, ny, nz = _cone_point(xi, ti, sign)
        strap.append((xi, y + ny * (lift + 0.016), z + nz * (lift + 0.016)))
    objects.append(_folded_plate(
        collection, f"{name}_Strap",
        strap[0], strap[1], strap[2], strap[3],
        0.034, steel, "structural_metal",
        "shingle-band lid hoop strap",
    ))
    return objects


def _side_lids(collection, materials, sign, side):
    objects = []
    for name, x, t, lift in HATCHES:
        objects.extend(_hatch(
            collection, f"{PREFIX}Hatch_{side}_{name}",
            x, t, lift, sign, materials,
        ))
    return objects


def apply_hitch_hero_v81() -> dict:
    prior = apply_hitch_hero_v80()
    collection = _collection()
    materials = _materials()
    objects = []
    objects.extend(_side_lids(collection, materials, -1.0, "Port"))
    objects.extend(_side_lids(collection, materials, 1.0, "Starboard"))
    report = {
        "schema": "spaceface.hitchHero.v81",
        "passId": PASS_ID,
        "method": "thick inspection lids seated on the two shingled cone bands",
        "priorPass": "v80",
        "objectsAdded": len(objects),
        "objectNames": [obj.name for obj in objects],
        "componentReference": "kestrel_midship_material_truth_reference_v1.png",
    }
    _root()["hitchHeroPassV81"] = {
        "passId": PASS_ID,
        "objectsAdded": int(len(objects)),
    }
    return report
