"""Hitch hero V25 / cycle 16: bigger table wells + a broken dorsal tube.

Cycle 15 proved +Z cassettes read from the gameplay camera. The leftover
fail is the pressure hull: from above it is still one gray cylinder.
Enlarge the wells and lay formed dorsal courses so the table sees plate
breaks, not a tube.
"""
from __future__ import annotations

import bpy
from mathutils import Vector

from hitch_hero_v16 import _cut_box
from hitch_hero_v24 import (
    DIE_LAUGHING_BOX,
    _overlaps_die_laughing,
    _stamp,
    _window_for_armor,
    _world_bbox,
    apply_hitch_hero_v24,
)
from hitch_polish_v8 import _folded_plate
from material_truth_v6 import _materials, _profile_prism, _root, _source

PASS_ID = "kestrel-hitch-hero-v25"
COLLECTION_NAME = "KESTREL_V25_DORSAL_COURSES"
PREFIX = "V25_"


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


def _bigger_window(obj):
    window = _window_for_armor(obj)
    if window is None:
        return None
    minx, maxx, miny, maxy, minz, maxz = _world_bbox(obj)
    span_x = maxx - minx
    span_y = maxy - miny
    outboard = 1.0 if (miny + maxy) * 0.5 > 0.0 else -1.0
    cx = (minx + maxx) * 0.5
    cy = (miny + maxy) * 0.5 + outboard * span_y * 0.08
    hx = span_x * 0.40
    hy = span_y * 0.34
    minx_w, maxx_w = cx - hx, cx + hx
    miny_w, maxy_w = cy - hy, cy + hy
    if _overlaps_die_laughing(minx_w, maxx_w, miny_w, maxy_w, 0.7, 1.2):
        cy = -5.16
        hy = 0.26
        miny_w, maxy_w = cy - hy, cy + hy
        if _overlaps_die_laughing(minx_w, maxx_w, miny_w, maxy_w, 0.7, 1.2):
            return None
    window["cx"] = (minx_w + maxx_w) * 0.5
    window["cy"] = (miny_w + maxy_w) * 0.5
    window["hx"] = (maxx_w - minx_w) * 0.5
    window["hy"] = (maxy_w - miny_w) * 0.5
    window["z0"] = minz - 0.16
    window["z1"] = maxz + 0.34
    return window


def _widen_cassettes():
    cuts = []
    armors = [
        obj for obj in bpy.data.objects
        if (obj.name or "").startswith("V6_ShoulderArmor_") and not obj.hide_render
    ]
    for armor in armors:
        window = _bigger_window(armor)
        if window is None:
            continue
        loc = (window["cx"], window["cy"], (window["z0"] + window["z1"]) * 0.5)
        scale = (window["hx"], window["hy"], (window["z1"] - window["z0"]) * 0.5)
        ok = _cut_box(armor, f"{PREFIX}Widen_{armor.name}", loc, scale)
        cuts.append(f"{armor.name}={ok}")
    return cuts


def _build_dorsal_courses(collection, materials):
    """Overlapping formed plates so the table does not see a bare cylinder."""
    objects = []
    armor = materials["armor"]
    steel = materials["service_steel"]
    repair = materials["repair"]
    dark = materials["dark_aperture"]
    courses = (
        (-6.40, 4.20, 1.72, 0.95, 0.06, armor, "aft dorsal armor course"),
        (-3.10, 3.60, 1.68, 1.05, 0.055, steel, "mid-aft dorsal service course"),
        (0.20, 3.80, 1.55, 0.88, 0.05, armor, "mid dorsal armor course"),
        (3.10, 2.40, 1.28, 0.72, 0.05, repair, "fore repair dorsal patch"),
    )
    for index, (x, length, width, height, thick, material, function) in enumerate(courses):
        objects.append(_stamp(_profile_prism(
            collection, f"{PREFIX}Course_{index}",
            (x, 0.0, 2.08 + thick),
            length, width, width * 0.86, thick * 2.0, thick * 2.0,
            material, "armor_plate" if material is armor else "structural_metal",
            function,
            detail=1, bevel=0.008,
        )))
        objects.append(_folded_plate(
            collection, f"{PREFIX}CourseSeam_{index}",
            (x - length * 0.48, -width * 0.42, 2.10),
            (x - length * 0.48, width * 0.42, 2.10),
            (x - length * 0.48, width * 0.38, 2.22),
            (x - length * 0.48, -width * 0.38, 2.22),
            0.028, steel, "structural_metal",
            "dorsal course seam standing off the tube",
        ))
    # A real look-down trench, not a hairline.
    spine = bpy.data.objects.get("Hull_Dorsal_Spine")
    if spine is not None:
        _cut_box(spine, f"{PREFIX}SpineChannel", (-1.60, 0.0, 2.26), (5.80, 0.38, 0.22))
    objects.append(_stamp(_profile_prism(
        collection, f"{PREFIX}TrenchFloor",
        (-1.70, 0.0, 1.98), 11.2, 0.62, 0.62, 0.045, 0.045,
        dark, "active_aperture", "wide dorsal trench floor the table looks into",
        detail=1, bevel=0.003,
    )))
    for sign, side in ((-1.0, "Port"), (1.0, "Starboard")):
        objects.append(_folded_plate(
            collection, f"{PREFIX}TrenchWall_{side}",
            (-7.20, 0.30 * sign, 1.98), (3.80, 0.30 * sign, 1.98),
            (3.80, 0.30 * sign, 2.22), (-7.20, 0.30 * sign, 2.22),
            0.032, steel, "structural_metal",
            f"{side.lower()} dorsal trench wall",
        ))
    return objects


def apply_hitch_hero_v25() -> dict:
    prior = apply_hitch_hero_v24()
    collection = _collection()
    materials = _materials()
    cuts = _widen_cassettes()
    objects = _build_dorsal_courses(collection, materials)
    report = {
        "schema": "spaceface.hitchHero.v25",
        "passId": PASS_ID,
        "method": "enlarge table wells; break the dorsal tube with courses and a wide trench",
        "priorPass": "v24",
        "booleanCuts": cuts,
        "objectsAdded": len(objects),
        "objectNames": [obj.name for obj in objects],
    }
    _root()["hitchHeroPassV25"] = {
        "passId": PASS_ID,
        "objectsAdded": int(len(objects)),
        "cuts": int(len(cuts)),
    }
    return report
