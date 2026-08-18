"""Hitch hero V24 / cycle 15: tabletop-readable dorsal cassette windows.

Cycles 07-14 hid or equator-cut the sponson. The table camera is 60 degrees
from the horizon and looks at the DORSAL face. The actual lids are
V6_ShoulderArmor_* sitting on Hull_Radiator_Pod_Pair. DIE LAUGHING is a
3.6 x 0.86 mm card on the port-aft inboard — keep it. Start from live V9,
hide only the obsolete 14 m slab and the iris, punch +Z windows through the
shoulder plates and underframes, and seat radiator cassettes in those wells.
"""
from __future__ import annotations

import math

import bpy
from mathutils import Vector

from hitch_hero_v16 import _boolean_difference, _cut_box, _cut_cylinder, _open_pipe
from hitch_polish_v8 import _folded_plate
from hitch_polish_v9 import apply_hitch_polish_v9
from material_truth_v6 import (
    _axial_cylinder,
    _finish,
    _materials,
    _profile_prism,
    _root,
    _source,
    _strut_between,
)

PASS_ID = "kestrel-hitch-hero-v24"
COLLECTION_NAME = "KESTREL_V24_TABLE_CASSETTES"
PREFIX = "V24_"

# Obsolete 14 m slab plus the toy iris / hook core. Do not hide formed V6
# armor, underframes, radiator packs, or the DIE LAUGHING nameplate.
HIDE_EXACT = {
    "Hull_Radiator_Pod_Pair",
    "HOOK_DRIVE_CORE",
    "HOOK_DRIVE_CORE_Mesh",
    "HOOK_DRIVE_CORE_Mesh.001",
}
HIDE_PREFIXES = (
    "V7_NozzleVane",
    "V7_NozzleHeatCollar",
    "V6_DriveHotCore",
    "HOOK_DRIVE_CORE",
    "V10_",
    "V11_",
    "V12_",
    "V13_",
    "V14_",
    "V15_",
    "V16_",
    "V17_",
    "V18_",
    "V19_",
    "V20_",
    "V21_",
    "V22_",
    "V23_",
)

# World AABB of the DIE LAUGHING stencil. Windows must not eat this plate.
DIE_LAUGHING_BOX = (-7.05, -3.25, -4.90, -3.92, 0.90, 1.08)


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


def _stamp(obj):
    obj["sf_polish_pass"] = PASS_ID
    obj["sf_material_truth_pass"] = PASS_ID
    return obj


def _hide_donors():
    hidden = []
    for obj in bpy.data.objects:
        name = obj.name or ""
        base = name.split(".")[0]
        if name in HIDE_EXACT or base in HIDE_EXACT:
            obj.hide_render = True
            obj.hide_set(True)
            hidden.append(name)
            continue
        if any(name.startswith(prefix) or base.startswith(prefix) for prefix in HIDE_PREFIXES):
            obj.hide_render = True
            obj.hide_set(True)
            hidden.append(name)
    return hidden


def _world_bbox(obj):
    corners = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    xs = [c.x for c in corners]
    ys = [c.y for c in corners]
    zs = [c.z for c in corners]
    return min(xs), max(xs), min(ys), max(ys), min(zs), max(zs)


def _overlaps_die_laughing(minx, maxx, miny, maxy, minz, maxz):
    dx0, dx1, dy0, dy1, dz0, dz1 = DIE_LAUGHING_BOX
    return not (maxx < dx0 or minx > dx1 or maxy < dy0 or miny > dy1 or maxz < dz0 or minz > dz1)


def _window_for_armor(obj):
    """One outboard-biased +Z window that the 60-degree table camera looks into."""
    minx, maxx, miny, maxy, minz, maxz = _world_bbox(obj)
    span_x = maxx - minx
    span_y = maxy - miny
    if span_x < 1.2 or span_y < 0.9:
        return None
    outboard = 1.0 if (miny + maxy) * 0.5 > 0.0 else -1.0
    # Keep a formed rim so the plate still reads as armor, not a missing face.
    cx = (minx + maxx) * 0.5
    # Shift the hole toward the outboard lip — that is what the table sees.
    cy = (miny + maxy) * 0.5 + outboard * span_y * 0.12
    hx = span_x * 0.34
    hy = span_y * 0.28
    minx_w, maxx_w = cx - hx, cx + hx
    miny_w, maxy_w = cy - hy, cy + hy
    if _overlaps_die_laughing(minx_w, maxx_w, miny_w, maxy_w, 0.7, 1.2):
        # Slide fully outboard of the nameplate and shrink X so the stencil stays.
        cy = -5.18
        hy = 0.22
        miny_w, maxy_w = cy - hy, cy + hy
        if _overlaps_die_laughing(minx_w, maxx_w, miny_w, maxy_w, 0.7, 1.2):
            return None
    return {
        "cx": (minx_w + maxx_w) * 0.5,
        "cy": (miny_w + maxy_w) * 0.5,
        "hx": (maxx_w - minx_w) * 0.5,
        "hy": (maxy_w - miny_w) * 0.5,
        "z0": minz - 0.12,
        "z1": maxz + 0.28,
        "floor_z": minz - 0.06,
        "lip_z": maxz + 0.01,
    }


def _cut_window(obj, name, window):
    loc = (window["cx"], window["cy"], (window["z0"] + window["z1"]) * 0.5)
    scale = (window["hx"], window["hy"], (window["z1"] - window["z0"]) * 0.5)
    return _cut_box(obj, name, loc, scale)


def _build_cassette(collection, materials, side, index, window):
    objects = []
    armor = materials["armor"]
    steel = materials["service_steel"]
    radiator = materials["radiator"]
    dark = materials["dark_aperture"]
    cable = materials["cable"]
    cx, cy = window["cx"], window["cy"]
    hx, hy = window["hx"], window["hy"]
    floor_z = window["floor_z"]
    lip_z = window["lip_z"]
    well_h = max(0.22, lip_z - floor_z)
    name = f"{PREFIX}Cassette_{side}_{index}"
    objects.append(_stamp(_profile_prism(
        collection, f"{name}_Floor",
        (cx, cy, floor_z), hx * 2.0 - 0.04, hy * 2.0 - 0.04, hy * 2.0 - 0.04, 0.045, 0.045,
        dark, "active_aperture", "cassette well floor the table looks down onto",
        detail=1, bevel=0.003,
    )))
    wall = 0.045
    objects.append(_folded_plate(
        collection, f"{name}_Inboard",
        (cx - hx, cy - hy * (1 if cy > 0 else -1) * 0.0 + (-hy if cy > 0 else hy), floor_z),
        (cx + hx, cy + (-hy if cy > 0 else hy), floor_z),
        (cx + hx, cy + (-hy if cy > 0 else hy), lip_z),
        (cx - hx, cy + (-hy if cy > 0 else hy), lip_z),
        wall, armor, "armor_plate", "cassette inboard coaming",
    ))
    objects.append(_folded_plate(
        collection, f"{name}_Outboard",
        (cx - hx, cy + (hy if cy > 0 else -hy), floor_z),
        (cx + hx, cy + (hy if cy > 0 else -hy), floor_z),
        (cx + hx, cy + (hy if cy > 0 else -hy), lip_z),
        (cx - hx, cy + (hy if cy > 0 else -hy), lip_z),
        wall, armor, "armor_plate", "cassette outboard coaming",
    ))
    objects.append(_folded_plate(
        collection, f"{name}_Fore",
        (cx + hx, cy - hy, floor_z),
        (cx + hx, cy + hy, floor_z),
        (cx + hx, cy + hy, lip_z),
        (cx + hx, cy - hy, lip_z),
        wall, steel, "structural_metal", "cassette fore coaming",
    ))
    objects.append(_folded_plate(
        collection, f"{name}_Aft",
        (cx - hx, cy - hy, floor_z),
        (cx - hx, cy + hy, floor_z),
        (cx - hx, cy + hy, lip_z),
        (cx - hx, cy - hy, lip_z),
        wall, steel, "structural_metal", "cassette aft coaming",
    ))
    # Vertical radiator leaves. From the table they read as a dark grate, not a lid.
    fin_count = max(5, int((hx * 2.0) / 0.22))
    span = hx * 1.70
    for fin_i in range(fin_count):
        t = 0 if fin_count == 1 else fin_i / (fin_count - 1)
        fx = cx - span * 0.5 + span * t
        objects.append(_stamp(_profile_prism(
            collection, f"{name}_Fin_{fin_i}",
            (fx, cy, floor_z + well_h * 0.38),
            0.028, hy * 1.55, hy * 1.55, well_h * 0.72, well_h * 0.68,
            radiator, "radiator", "folded radiator leaf facing the table",
            detail=2, bevel=0.002,
        )))
    objects.append(_stamp(_axial_cylinder(
        collection, f"{name}_Pump",
        (cx + hx * 0.35, cy, floor_z + 0.09), 0.07, 0.16, steel,
        "structural_metal", "cassette coolant pump",
        segments=10, detail=2, axis="X",
    )))
    objects.append(_stamp(_strut_between(
        collection, f"{name}_Hose",
        (cx + hx * 0.35, cy, floor_z + 0.12),
        (cx + hx * 0.05, cy - (0.18 if cy > 0 else -0.18), lip_z + 0.04),
        0.016, cable, "cable_elastomer",
        "hose climbing out of the cassette",
    )))
    return objects


def _open_shoulder_cassettes(collection, materials):
    objects = []
    cuts = []
    windows = []
    armors = [
        obj for obj in bpy.data.objects
        if (obj.name or "").startswith("V6_ShoulderArmor_") and not obj.hide_render
    ]
    armors.sort(key=lambda obj: obj.name)
    for index, armor in enumerate(armors):
        window = _window_for_armor(armor)
        if window is None:
            continue
        side = "Starboard" if "Starboard" in armor.name else "Port"
        ok = _cut_window(armor, f"{PREFIX}ArmorCut_{armor.name}", window)
        cuts.append(f"{armor.name}={ok}")
        windows.append((side, index, window))
    underframes = [
        obj for obj in bpy.data.objects
        if (obj.name or "").startswith("V6_SponsonUnderframe_") and not obj.hide_render
    ]
    for side, index, window in windows:
        for under in underframes:
            minx, maxx, miny, maxy, minz, maxz = _world_bbox(under)
            if window["cx"] < minx or window["cx"] > maxx:
                continue
            if window["cy"] < miny or window["cy"] > maxy:
                continue
            ok = _cut_window(under, f"{PREFIX}DeckCut_{under.name}_{index}", window)
            cuts.append(f"{under.name}:{index}={ok}")
        objects.extend(_build_cassette(collection, materials, side, index, window))
    return objects, cuts, windows


def _build_drive(collection, materials):
    objects = []
    cuts = []
    housing = bpy.data.objects.get("Engine_Main_Housing")
    housing_cut = False
    if housing is not None:
        housing_cut = _cut_cylinder(
            housing, f"{PREFIX}HousingThroatCut",
            (-13.05, 0.0, 0.05), 1.62, 3.40,
        )
        cuts.append(("Engine_Main_Housing", housing_cut))
        if not housing_cut:
            housing.hide_render = True
            housing.hide_set(True)
            cuts.append(("Engine_Main_Housing_hidden_fallback", True))
    ceramic = materials["ceramic"]
    steel = materials["service_steel"]
    objects.append(_open_pipe(
        collection, f"{PREFIX}Tunnel",
        (-13.60, 0.0, 0.05), 1.35, 1.08, 3.20, ceramic,
        "ceramic_isolator", "non-emissive ceramic tunnel",
        segments=24,
    ))
    objects.append(_open_pipe(
        collection, f"{PREFIX}TunnelDeep",
        (-14.00, 0.0, 0.05), 0.88, 0.42, 2.50, steel,
        "structural_metal", "deep unlit tunnel",
        segments=20,
    ))
    for i, (x, r) in enumerate(((-12.55, 1.55), (-13.25, 1.22), (-13.95, 0.90))):
        objects.append(_open_pipe(
            collection, f"{PREFIX}Ring_{i}",
            (x, 0.0, 0.05), r, r - 0.07, 0.055, steel,
            "structural_metal", "unlit receding ring",
            segments=22,
        ))
    return objects, cuts


def apply_hitch_hero_v24() -> dict:
    prior = apply_hitch_polish_v9()
    hidden = _hide_donors()
    collection = _collection()
    materials = _materials()
    objects = []
    drive, drive_cuts = _build_drive(collection, materials)
    objects.extend(drive)
    cassettes, cassette_cuts, windows = _open_shoulder_cassettes(collection, materials)
    objects.extend(cassettes)
    report = {
        "schema": "spaceface.hitchHero.v24",
        "passId": PASS_ID,
        "method": "V9 identity + ceramic tunnel + dorsal cassette windows",
        "prior": prior,
        "hidden": hidden,
        "booleanCuts": [f"{a}={b}" for a, b in drive_cuts] + cassette_cuts,
        "windows": [
            {
                "side": side,
                "index": index,
                "cx": round(window["cx"], 3),
                "cy": round(window["cy"], 3),
                "hx": round(window["hx"], 3),
                "hy": round(window["hy"], 3),
            }
            for side, index, window in windows
        ],
        "objectsAdded": len(objects),
        "objectNames": [obj.name for obj in objects],
        "intent": [
            "hide the 14 m radiator slab so formed V6 shoulders read",
            "keep DIE LAUGHING on the port-aft inboard",
            "cut +Z windows through shoulder armor and underframes",
            "seat radiator cassettes the 60-degree table camera looks into",
            "keep the ceramic drive tunnel from cycle 10",
        ],
    }
    _root()["hitchHeroPassV24"] = {
        "passId": PASS_ID,
        "objectsAdded": int(len(objects)),
        "hiddenCount": int(len(hidden)),
        "windows": int(len(windows)),
        "method": "dorsal-cassette",
    }
    return report
