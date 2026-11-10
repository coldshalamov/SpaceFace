"""Hitch hero V16 / cycle 07: stop stacking primitives. Cut openings.

Cycles 01-06 added hardware on top of V9 and every review came back revise:
the sponson stayed a sealed board and the drive stayed a toy iris. This pass
starts from live V9 only, hides the donor slab and the shutter, punches a real
throat through the engine house, and builds hat-section sponson wells you can
look into from the tabletop camera.
"""
from __future__ import annotations

import math

import bmesh
import bpy
from mathutils import Matrix, Vector

from hitch_polish_v8 import _folded_plate
from hitch_polish_v9 import apply_hitch_polish_v9
from material_truth_v6 import (
    _axial_cylinder,
    _finish,
    _materials,
    _mesh_object,
    _profile_prism,
    _root,
    _source,
    _strut_between,
)

PASS_ID = "kestrel-hitch-hero-v16"
COLLECTION_NAME = "KESTREL_V16_OPENINGS"
PREFIX = "V16_"

# Donor reads that made clay look like stacked toys. Do not hide the V6
# underframes, shoulder armor, or radiator fins — those are the formed parts
# the 14 m slab was covering.
HIDE_PREFIXES = (
    "V7_NozzleVane",
    "V7_NozzleHeatCollar",
    "Landing_Strut",
    "Landing_Damper",
    "Landing_Skid",
    "V6_DriveHotCore",
    "V10_",
    "V11_",
    "V12_",
    "V13_",
    "V14_",
    "V15_",
)
HIDE_EXACT = {
    "Hull_Radiator_Pod_Pair",
}


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


def _ensure_view_layer(obj):
    try:
        bpy.context.scene.collection.objects.link(obj)
    except RuntimeError:
        pass
    obj.hide_set(False)
    obj.hide_viewport = False
    obj.hide_select = False


def _boolean_difference(host, cutter, name):
    if host is None or cutter is None:
        return False
    _ensure_view_layer(host)
    bpy.context.view_layer.objects.active = host
    host.select_set(True)
    for modifier in list(host.modifiers):
        stored = str(getattr(modifier, "name", "") or "mod")
        try:
            bpy.ops.object.modifier_apply(modifier=stored)
        except Exception:
            leftover = host.modifiers.get(stored)
            if leftover is not None:
                try:
                    host.modifiers.remove(leftover)
                except Exception:
                    pass
    modifier_name = "SFCut"
    modifier = host.modifiers.new(modifier_name, "BOOLEAN")
    modifier.operation = "DIFFERENCE"
    modifier.object = cutter
    try:
        modifier.solver = "EXACT"
    except Exception:
        pass
    ok = False
    try:
        result = bpy.ops.object.modifier_apply(modifier=modifier_name)
        ok = result == {"FINISHED"}
    except Exception:
        leftover = host.modifiers.get(modifier_name)
        if leftover is not None:
            try:
                host.modifiers.remove(leftover)
            except Exception:
                pass
    host.select_set(False)
    try:
        bpy.data.objects.remove(cutter, do_unlink=True)
    except Exception:
        pass
    return ok


def _cut_cylinder(host, name, loc, radius, depth, vertices=20):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices,
        radius=radius,
        depth=depth,
        location=loc,
        rotation=(0.0, math.pi / 2.0, 0.0),
    )
    cutter = bpy.context.object
    cutter.name = name
    return _boolean_difference(host, cutter, name)


def _cut_box(host, name, loc, scale):
    bpy.ops.mesh.primitive_cube_add(location=loc)
    cutter = bpy.context.object
    cutter.name = name
    cutter.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return _boolean_difference(host, cutter, name)


def _open_pipe(collection, name, center, r1, r2, depth, material, bill, function, segments=22):
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    bm = bmesh.new()
    bmesh.ops.create_cone(
        bm, cap_ends=False, cap_tris=False, segments=segments,
        radius1=r1, radius2=r2, depth=depth,
    )
    bmesh.ops.transform(bm, matrix=Matrix.Rotation(math.radians(90.0), 4, "Y"), verts=bm.verts)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj.location = center
    return _stamp(_finish(obj, material, bill, function, bevel=0.010, detail=1))


def _open_well(collection, name, center, sx, sy, sz, wall, material, bill, function):
    """Five thin plates: floor + four walls. No roof, so the table camera looks in."""
    objects = []
    cx, cy, cz = center
    hx, hy, hz = sx * 0.5, sy * 0.5, sz * 0.5
    plates = (
        (f"{name}_Floor", (cx, cy, cz - hz + wall * 0.5), (sx, sy, wall)),
        (f"{name}_Inboard", (cx, cy - hy + wall * 0.5, cz + wall * 0.2), (sx - wall * 2, wall, sz - wall)),
        (f"{name}_Outboard", (cx, cy + hy - wall * 0.5, cz + wall * 0.2), (sx - wall * 2, wall, sz - wall)),
        (f"{name}_Fore", (cx + hx - wall * 0.5, cy, cz + wall * 0.2), (wall, sy - wall * 2, sz - wall)),
        (f"{name}_Aft", (cx - hx + wall * 0.5, cy, cz + wall * 0.2), (wall, sy - wall * 2, sz - wall)),
    )
    for plate_name, loc, dims in plates:
        objects.append(_stamp(_profile_prism(
            collection, plate_name, loc,
            dims[0], dims[1], dims[1], dims[2], dims[2],
            material, bill, function, detail=1, bevel=0.008,
        )))
    return objects


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
    dark = materials["dark_aperture"]
    ceramic = materials["ceramic"]
    alloy = materials["drive"]
    steel = materials["service_steel"]
    if housing is None or not housing_cut:
        objects.append(_open_pipe(
            collection, f"{PREFIX}HouseShell",
            (-10.55, 0.0, 0.05), 2.18, 1.92, 5.10, alloy,
            "drive_alloy", "open drive house replacing a sealed housing",
            segments=24,
        ))
    # Nested uncapped barrels. Center stays empty so the rear camera looks down the house.
    objects.append(_open_pipe(
        collection, f"{PREFIX}BarrelOuter",
        (-13.35, 0.0, 0.05), 1.72, 1.38, 2.85, alloy,
        "drive_alloy", "outer drive barrel you can look down",
    ))
    objects.append(_open_pipe(
        collection, f"{PREFIX}BarrelLiner",
        (-13.50, 0.0, 0.05), 1.34, 0.82, 2.55, ceramic,
        "ceramic_isolator", "ceramic liner receding into the house",
    ))
    objects.append(_open_pipe(
        collection, f"{PREFIX}BarrelThroat",
        (-13.70, 0.0, 0.05), 0.78, 0.32, 2.20, dark,
        "active_aperture", "deep throat cavity",
    ))
    objects.append(_open_pipe(
        collection, f"{PREFIX}MouthRing",
        (-12.05, 0.0, 0.05), 1.88, 1.70, 0.16, ceramic,
        "ceramic_isolator", "ceramic mouth ring around the cut",
        segments=24,
    ))
    objects.append(_stamp(_axial_cylinder(
        collection, f"{PREFIX}BoltRing",
        (-12.12, 0.0, 0.05), 1.96, 0.05, steel,
        "structural_metal", "mouth flange bolt ring",
        segments=20, detail=2, axis="X",
    )))
    # Thin rim stator blades only — they must not close the aperture.
    for i in range(8):
        angle = (i / 8.0) * math.tau
        radius = 1.52
        loc = (-12.35, math.sin(angle) * radius, 0.05 + math.cos(angle) * radius)
        objects.append(_stamp(_profile_prism(
            collection, f"{PREFIX}Stator_{i}",
            loc, 0.55, 0.22, 0.16, 0.06, 0.045,
            ceramic, "ceramic_isolator",
            "open rim stator, aperture left empty",
            detail=2, bevel=0.004,
        )))
    # Recessed core far inside, not a sticker on the face.
    objects.append(_stamp(_axial_cylinder(
        collection, f"{PREFIX}DeepCore",
        (-14.55, 0.0, 0.05), 0.22, 0.18, materials["hotcore"],
        "active_aperture", "hot core at the back of the barrel",
        segments=12, detail=2, axis="X",
    )))
    return objects, cuts


def _build_sponson_channels(collection, materials):
    objects = []
    armor = materials["armor"]
    steel = materials["service_steel"]
    radiator = materials["radiator"]
    dark = materials["dark_aperture"]
    repair = materials["repair"]
    for sign, side in ((-1.0, "Port"), (1.0, "Starboard")):
        y_web = 4.48 * sign
        y_out = 5.95 * sign
        objects.append(_folded_plate(
            collection, f"{PREFIX}HatWeb_{side}",
            (-8.90, y_web, 0.18), (5.60, y_web, 0.18),
            (5.60, y_web, 1.08), (-8.90, y_web, 1.08),
            0.045, armor, "armor_plate",
            f"{side.lower()} sponson hat-section web",
        ))
        objects.append(_folded_plate(
            collection, f"{PREFIX}HatTop_{side}",
            (-8.90, y_web, 1.04), (5.60, y_web, 1.04),
            (5.60, y_out, 1.10), (-8.90, y_out, 1.10),
            0.038, armor, "armor_plate",
            f"{side.lower()} sponson top flange",
        ))
        objects.append(_folded_plate(
            collection, f"{PREFIX}HatBottom_{side}",
            (-8.90, y_web, 0.16), (-8.90, y_out, 0.22),
            (5.60, y_out, 0.22), (5.60, y_web, 0.16),
            0.038, steel, "structural_metal",
            f"{side.lower()} sponson bottom flange",
        ))
        well_xs = (3.55, 0.35, -2.85, -6.35)
        for index, x in enumerate(well_xs):
            well_name = f"{PREFIX}Well_{side}_{index}"
            y = 5.22 * sign
            objects.extend(_open_well(
                collection, well_name, (x, y, 0.62),
                2.05, 1.28, 0.78, 0.055,
                radiator, "radiator",
                f"{side.lower()} open radiator well",
            ))
            objects.append(_stamp(_axial_cylinder(
                collection, f"{well_name}_Pump",
                (x - 0.15, y, 0.42), 0.16, 0.42, steel,
                "structural_metal", "well coolant pump",
                segments=10, detail=2, axis="X",
            )))
            objects.append(_stamp(_profile_prism(
                collection, f"{well_name}_Manifold",
                (x + 0.35, y, 0.38), 0.55, 0.28, 0.22, 0.12, 0.10,
                steel, "structural_metal",
                "well manifold block",
                detail=2, bevel=0.006,
            )))
            objects.append(_stamp(_strut_between(
                collection, f"{well_name}_Hose",
                (x + 0.55, y, 0.48), (x + 0.15, y - 0.35 * sign, 0.92),
                0.022, materials["cable"], "cable_elastomer",
                "hose climbing out of the well",
            )))
            objects.append(_stamp(_profile_prism(
                collection, f"{well_name}_Shadow",
                (x, y, 0.28), 1.70, 0.95, 0.95, 0.04, 0.04,
                dark, "active_aperture",
                "well floor shadow so the hole reads as depth",
                detail=2, bevel=0.0,
            )))
        for rib_i, x in enumerate((-7.40, -4.60, -1.20, 1.90, 4.70)):
            objects.append(_folded_plate(
                collection, f"{PREFIX}HatRib_{side}_{rib_i}",
                (x, y_web, 0.20), (x + 0.08, y_web, 0.20),
                (x + 0.08, y_out, 1.06), (x, y_out, 1.06),
                0.040, steel, "structural_metal",
                f"{side.lower()} hat-section rib",
            ))
        objects.append(_stamp(_profile_prism(
            collection, f"{PREFIX}FairingFore_{side}",
            (6.15, 5.05 * sign, 0.58), 1.15, 1.35, 0.72, 0.55, 0.28,
            armor, "armor_plate",
            f"{side.lower()} formed sponson nose fairing",
            detail=1, bevel=0.014,
        )))
        objects.append(_stamp(_profile_prism(
            collection, f"{PREFIX}FairingAft_{side}",
            (-9.55, 4.85 * sign, 0.58), 1.05, 0.85, 1.25, 0.42, 0.55,
            repair if side == "Port" else armor, "armor_plate",
            f"{side.lower()} formed sponson transom fairing",
            detail=1, bevel=0.014,
        )))
    return objects


def _build_dorsal_trench(collection, materials):
    objects = []
    cuts = []
    spine = bpy.data.objects.get("Hull_Dorsal_Spine")
    if spine is not None:
        cuts.append(("Hull_Dorsal_Spine", _cut_box(
            spine, f"{PREFIX}SpineTrenchCut",
            (-1.80, 0.0, 2.28), (5.40, 0.22, 0.20),
        )))
    steel = materials["service_steel"]
    dark = materials["dark_aperture"]
    objects.append(_stamp(_profile_prism(
        collection, f"{PREFIX}TrenchFloor",
        (-1.80, 0.0, 2.02), 10.40, 0.42, 0.42, 0.05, 0.05,
        dark, "active_aperture",
        "dorsal service trench floor",
        detail=1, bevel=0.004,
    )))
    for sign, side in ((-1.0, "Port"), (1.0, "Starboard")):
        objects.append(_folded_plate(
            collection, f"{PREFIX}TrenchWall_{side}",
            (-7.00, 0.22 * sign, 2.00), (3.40, 0.22 * sign, 2.00),
            (3.40, 0.22 * sign, 2.28), (-7.00, 0.22 * sign, 2.28),
            0.030, steel, "structural_metal",
            f"{side.lower()} dorsal trench wall",
        ))
    for i, x in enumerate((-5.40, -2.80, -0.20, 2.20)):
        objects.append(_stamp(_axial_cylinder(
            collection, f"{PREFIX}TrenchRun_{i}",
            (x, 0.0, 2.10), 0.028, 2.20, steel,
            "structural_metal", "service run in the dorsal trench",
            segments=8, detail=2, axis="X",
        )))
    return objects, cuts


def _build_canopy_frame(collection, materials):
    """Frame the existing recessed laminate. Do not hide the greenhouse."""
    objects = []
    steel = materials["service_steel"]
    armor = materials["armor"]
    objects.append(_folded_plate(
        collection, f"{PREFIX}CanopySillPort",
        (1.15, -1.05, 1.72), (6.05, -1.05, 1.55),
        (6.05, -0.92, 1.68), (1.15, -0.92, 1.85),
        0.040, steel, "structural_metal",
        "port canopy sill",
    ))
    objects.append(_folded_plate(
        collection, f"{PREFIX}CanopySillStbd",
        (1.15, 1.05, 1.72), (1.15, 0.92, 1.85),
        (6.05, 0.92, 1.68), (6.05, 1.05, 1.55),
        0.040, steel, "structural_metal",
        "starboard canopy sill",
    ))
    objects.append(_folded_plate(
        collection, f"{PREFIX}CanopyBrow",
        (6.05, -1.08, 1.52), (6.35, -0.72, 1.78),
        (6.35, 0.72, 1.78), (6.05, 1.08, 1.52),
        0.045, armor, "armor_plate",
        "canopy brow frame",
    ))
    objects.append(_folded_plate(
        collection, f"{PREFIX}CanopyAftFrame",
        (1.05, -1.00, 1.70), (1.05, 1.00, 1.70),
        (1.22, 0.85, 2.02), (1.22, -0.85, 2.02),
        0.040, steel, "structural_metal",
        "aft canopy frame",
    ))
    return objects


def apply_hitch_hero_v16() -> dict:
    prior = apply_hitch_polish_v9()
    hidden = _hide_donors()
    collection = _collection()
    materials = _materials()
    objects = []
    drive, drive_cuts = _build_drive(collection, materials)
    objects.extend(drive)
    objects.extend(_build_sponson_channels(collection, materials))
    trench, trench_cuts = _build_dorsal_trench(collection, materials)
    objects.extend(trench)
    objects.extend(_build_canopy_frame(collection, materials))
    report = {
        "schema": "spaceface.hitchHero.v16",
        "passId": PASS_ID,
        "method": "cut-and-form from live V9, no V10-V15 primitive stack",
        "prior": prior,
        "hidden": hidden,
        "booleanCuts": drive_cuts + trench_cuts,
        "objectsAdded": len(objects),
        "objectNames": [obj.name for obj in objects],
        "intent": [
            "hide Hull_Radiator_Pod_Pair so V6 formed sponson underframes read",
            "hide V7 iris shutter and punch a barrel through Engine_Main_Housing",
            "hat-section sponson with open-top wells and interior pumps",
            "dorsal service trench cut into the spine",
            "frame the existing greenhouse, do not replace it",
        ],
    }
    _root()["hitchHeroPassV16"] = {
        "passId": PASS_ID,
        "objectsAdded": int(len(objects)),
        "hiddenCount": int(len(hidden)),
        "method": "cut-and-form",
    }
    return report
