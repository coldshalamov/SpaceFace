"""Station information display — readable V3 source candidate (billboard only).

Why this generator exists
-------------------------
``place_station_billboard`` was re-authored in PQ-022 *inside a frozen dock-arm envelope*
(``SF_PLACE_HELIOS_SUPPORT_DOCK_ARM``, 14.80 x 3.05 x 3.00 m). That pass corrected materials but
never re-proportioned the form, so the live asset presents a 12.51 x 1.70 m upright letterbox strip
with a non-emissive near-black screen. At the shipping camera (fixed 60 deg tilt, no yaw term in
``src/render/camera.js`` ``computeOffset``) an upright face is additionally halved by foreshortening,
so the prop can only ever read as a dark narrow bar.

This builder produces a *candidate only* replacement form for that one asset:

* two canted display faces, back-to-back, 35 deg from vertical, under a shared ridge/visor spine;
* ~13.0 m active face width and 5.80 m face height (was 12.51 x 1.70);
* the station-services mark authored as physical segmented emitter hardware, not a texture and not a
  luminous card;
* true emission confined to the designed display segments and the status optics.

Geometry rationale for the cant
-------------------------------
Camera offset is ``(0, D*sin60, -D*cos60)`` with a fixed azimuth, while billboard yaw is
station-bearing driven, so relative azimuth ``dAz`` is arbitrary per station. For a face canted
``phi`` from vertical the facing strength is::

    face(phi, dAz) = sin(60) * sin(phi) + cos(60) * cos(phi) * cos(dAz)
                   = 0.866 * sin(phi) + 0.5 * cos(phi) * cos(dAz)

* ``phi = 0`` (the live upright strip): ``0.5 * cos(dAz)`` -> best 0.50, worst 0.00.
* ``phi = 35`` single face: 0.09 .. 0.91 — still azimuth dependent.
* ``phi = 35`` back-to-back: one face always has ``cos(dAz) >= 0`` -> guaranteed **0.497**, best
  **0.907**, and each face still presents up to ``cos(35) = 0.82`` to horizontal station approaches.

The pair therefore forms a shallow A-frame: both faces tip their normals up and outward, meeting at
a ridge spine that doubles as the glare visor and the power/service run. That is why the object is
canted in fiction, not merely in service of the camera.

Scope and safety
----------------
* Owns exactly one asset. It never writes ``assets/`` and never touches the multi-asset V2
  generator; V2 is imported read-only for proven primitive, join, export and stamp helpers.
* All output lands under ``.devshots/next10-billboard-candidate`` (git-ignored).
* Geometry + export only by default. ``--render`` is provided for the reviewing owner and is OFF
  unless explicitly passed; this build session must not touch the GPU.

Usage
-----
    blender --background --python tools/blender/build_station_billboard_readable_v3.py
    blender --background --python tools/blender/build_station_billboard_readable_v3.py -- --render
"""

from __future__ import annotations

import importlib.util
import json
import math
import struct
import sys
import time
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]

# ---------------------------------------------------------------------------------------------
# V2 is imported read-only for its proven helpers. Its module-level code is side-effect free and
# its build()/render entry points are guarded by __main__, so importing it builds nothing.
# ---------------------------------------------------------------------------------------------
V2_PATH = ROOT / "tools" / "blender" / "build_navigation_infrastructure_material_truth_v2.py"
_V2_SPEC = importlib.util.spec_from_file_location("sf_navigation_infrastructure_v2_readonly", V2_PATH)
v2 = importlib.util.module_from_spec(_V2_SPEC)
_V2_SPEC.loader.exec_module(v2)

OUT_ROOT = ROOT / ".devshots" / "next10-billboard-candidate"
BASELINE_BACKUP_ROOT = OUT_ROOT / "before-runtime"
GLB_PATH = OUT_ROOT / "glb" / "place_station_billboard_readable_v3.glb"
BLEND_PATH = OUT_ROOT / "blender" / "place_station_billboard_readable_v3.blend"
TEXTURE_ROOT = OUT_ROOT / "textures"
RECORD_ROOT = OUT_ROOT / "records"
RENDER_ROOT = OUT_ROOT / "renders"
BUILD_REPORT = RECORD_ROOT / "build_report.json"

PART_ID = "place_station_billboard"
# Retained identity contract — the brief authorises the envelope change but not an identity change.
ASSET_ID = "SF_PLACE_HELIOS_SUPPORT_DOCK_ARM"
ROOT_NODE = "SF_M4_HELIOS_DOCK_ARM_ROOT"
SOCKET_NAME = "SOCKET_Structure_Core"
CANDIDATE_ID = "next10-station-billboard-readable-v3"
SOURCE_GENERATOR = "tools/blender/build_station_billboard_readable_v3.py"
PACKET = "PQ-022"
DISPATCH_UNIT = "next10.station-billboard-readable-v3"

# Retained semantic material names so the contract's materials/materialRoles lists stay stable.
MATERIALS = [
    "Display_Frame_Coat",
    "Display_Screen_Glass",
    "Display_Service_Alloy",
    "Display_Backplate",
    "Display_Safety_Marking",
]
MATERIAL_ROLES = {
    "Display_Frame_Coat": "satin_painted_formed_frame",
    "Display_Screen_Glass": "segmented_information_emitter",
    "Display_Service_Alloy": "machined_service_alloy",
    "Display_Backplate": "folded_dark_backplate",
    "Display_Safety_Marking": "finite_amber_status_marking",
}

# V3 tuning. Screen_Glass is lifted off near-black (V2: 0.012, 0.045, 0.065) because the base colour
# *texture* overrides the constant in the shared node graph — raising the tuple alone would not have
# changed the exported look. Frame_Coat is lifted so the paint reads as satin paint, not shadow.
MATERIAL_TUNING_V3 = {
    "Display_Frame_Coat": ((0.300, 0.345, 0.365), 0.04, 0.42, "coat"),
    "Display_Screen_Glass": ((0.055, 0.075, 0.090), 0.02, 0.16, "glass"),
    "Display_Service_Alloy": ((0.440, 0.475, 0.490), 0.88, 0.33, "machined"),
    "Display_Backplate": ((0.055, 0.065, 0.072), 0.24, 0.70, "folded"),
    "Display_Safety_Marking": ((0.800, 0.330, 0.030), 0.01, 0.46, "marking"),
}
# True emission only in the designed display regions and the status optics.
EMISSION_V3 = {
    "Display_Screen_Glass": ((0.62, 0.80, 1.00), 2.80),
    "Display_Safety_Marking": ((0.85, 0.30, 0.03), 2.40),
}

# V2's ceilings sized a 14.8 x 3.05 x 3.0 beam. This form carries two 13 x 5.8 m faces, an A-frame
# and a segment matrix, so the ceilings are re-budgeted rather than met by removing authored detail.
LOD_CEILINGS = {0: 9000, 1: 3200, 2: 800}


def preserved_baseline_path(relative: Path) -> Path | None:
    """Return only a preserved pre-runtime copy; never infer V2 from the live workspace path."""
    backup = BASELINE_BACKUP_ROOT / relative
    return backup if backup.exists() else None


def baseline_record(relative: Path) -> dict:
    """Describe the comparison input without presenting a live V3 path as historical V2."""
    path = preserved_baseline_path(relative)
    if path is None:
        return {
            "available": False,
            "path": None,
            "reason": (
                "preserved before-runtime baseline is unavailable; live workspace path is not "
                "treated as V2"
            ),
        }
    return {
        "available": True,
        "path": v2.identity(path),
        "origin": "before-runtime preserved copy",
    }

# --- form constants -------------------------------------------------------------------------
CANT_DEG = 35.0                      # face cant from vertical
ROT_X = math.radians(90.0 - CANT_DEG)  # 55 deg about Blender X puts the plate 35 deg off vertical
SIN_C = math.sin(math.radians(CANT_DEG))   # 0.573576
COS_C = math.cos(math.radians(CANT_DEG))   # 0.819152

FACE_HALF_U = 6.50          # active display half-width -> 13.00 m face
FACE_HALF_S = 2.90          # in-plane half-height       -> 5.80 m face
RIDGE_Z = 2.42
TOP_INSET_Y = 0.10
TOP_Z = RIDGE_Z - 0.20

CENTER_BAY_HALF = 2.60      # glyph bay
MULLION_U = 2.72
BAND_BAY_CENTER = 4.575
END_RIB_U = 6.80

GLYPH_COLUMNS = 9
GLYPH_PITCH = 0.55
GLYPH_WIDTH_TARGET = 4.87   # the mark keeps one footprint across every LOD
GLYPH_HEIGHT_CAP = 4.30     # ... without pushing past the mark field into the visor rail
GLYPH_ROWS = 7              # 5 chevron rows, 1 quiet row, 1 base bar row


def face_basis(side: int):
    """Return (up_dir, normal) in Blender axes for the face occupying the ``side`` half in Y.

    ``side = -1`` occupies Y < 0 and faces -Y; ``side = +1`` occupies Y > 0 and faces +Y. Both
    normals carry the same +Z component, which is what aims them at the fixed-azimuth camera.
    """
    up_dir = Vector((0.0, -side * SIN_C, COS_C))
    normal = Vector((0.0, side * COS_C, SIN_C))
    return up_dir, normal


def face_center(side: int) -> Vector:
    up_dir, _ = face_basis(side)
    top = Vector((0.0, side * TOP_INSET_Y, TOP_Z))
    return top - up_dir * FACE_HALF_S


def face_point(side: int, u: float, s: float, d: float) -> Vector:
    """Plate-local (along-width, in-plane-up, along-normal) -> Blender world position."""
    up_dir, normal = face_basis(side)
    return face_center(side) + Vector((u, 0.0, 0.0)) + up_dir * s + normal * d


def face_rot(side: int) -> float:
    """Euler X that maps a box's local Y onto the plate's in-plane axis and local Z onto its normal."""
    return -side * ROT_X


# ---------------------------------------------------------------------------------------------
# materials / textures
# ---------------------------------------------------------------------------------------------
def write_textures() -> dict:
    """Reuse V2's procedural material families with V3 tuning, into the ignored candidate root.

    V2's ``create_texture_files`` is hardwired to a tracked report directory, so only its per-pixel
    family logic is reused. ``MATERIAL_TUNING`` is injected in memory; the V2 file is not modified.
    """
    v2.MATERIAL_TUNING.update(MATERIAL_TUNING_V3)
    result = {}
    for name in MATERIALS:
        result[name] = {}
        role = MATERIAL_ROLES[name]
        for kind in ("basecolor", "orm", "normal"):
            path = TEXTURE_ROOT / f"{role}_{kind}.png"
            v2.write_png(
                path, 256, 256,
                lambda x, y, w, h, m=name, k=kind: v2.texture_pixel(m, k, x, y, w, h),
            )
            result[name][kind] = path
    return result


def create_materials_v3(texture_files: dict) -> dict:
    """V2's node graph plus explicit emission on the two designed emitting zones.

    V2's ``create_materials`` grants emission only to the ``optic_*`` families, so importing it
    unchanged would reproduce the exact defect this candidate exists to repair.
    """
    config = {"materials": MATERIALS, "material_roles": MATERIAL_ROLES}
    materials = v2.create_materials(config, texture_files)
    for name, (colour, strength) in EMISSION_V3.items():
        shader = materials[name].node_tree.nodes.get("Principled BSDF")
        shader.inputs["Emission Color"].default_value = (*colour, 1.0)
        shader.inputs["Emission Strength"].default_value = strength
    for name in MATERIALS:
        if name in EMISSION_V3:
            continue
        shader = materials[name].node_tree.nodes.get("Principled BSDF")
        shader.inputs["Emission Strength"].default_value = 0.0
    for name in MATERIALS:
        materials[name]["spaceface.materialTruth"] = CANDIDATE_ID
        materials[name]["spaceface.textureRole"] = MATERIAL_ROLES[name]
    return materials


# ---------------------------------------------------------------------------------------------
# rotation-safe primitive
# ---------------------------------------------------------------------------------------------
def add_box(collection, materials, lod: int, name: str, size, location, material: str,
            bevel: float = 0.04, rot_x: float = 0.0):
    """Box authored unrotated, scale applied, then oriented — so ``size`` is always plate-local.

    V2's ``add_box`` assigns ``obj.dimensions`` after a rotated primitive add, a path its own assets
    never exercise. The whole cant rides on these dimensions, so it is authored explicitly here.
    """
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.0, 0.0, 0.0))
    obj = bpy.context.object
    obj.name = f"LOD{lod}_{name}"
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.rotation_euler = (rot_x, 0.0, 0.0)
    obj.location = location
    obj.data.materials.append(materials[material])
    if bevel > 0 and lod < 2:
        modifier = obj.modifiers.new("SF_ManufacturedEdge", "BEVEL")
        modifier.width = max(0.008, bevel * (1.0 if lod == 0 else 0.62))
        modifier.segments = 2 if lod == 0 else 1
        modifier.limit_method = "ANGLE"
    v2.tag(obj, lod, material, name)
    v2.move_to(obj, collection)
    return obj


# ---------------------------------------------------------------------------------------------
# the station-services mark, authored as segmented emitter hardware
# ---------------------------------------------------------------------------------------------
def glyph_cells(columns: int) -> list[tuple[int, int]]:
    """Berth-services mark: a broad descending chevron over a solid base bar.

    Rendered as discrete emitter tiles because that is what a station signboard is — a segment
    matrix. It also survives the merged cube-projected UVs and every LOD reduction, which a painted
    wordmark would not.
    """
    mid = (columns - 1) // 2
    apex_row = mid                      # chevron descends to its apex at the centre column
    cells = []
    for column in range(columns):
        offset = abs(column - mid)
        for row in (apex_row - offset, apex_row - offset - 1):
            if 0 <= row:
                cells.append((column, row))
    base_row = apex_row + 2             # one quiet row, then the solid services bar
    cells.extend((column, base_row) for column in range(columns))
    return sorted(set(cells))


def glyph_metrics(lod: int) -> tuple[int, int, float, float]:
    """Column/row count and tile pitch that hold the mark's footprint steady across the LOD ladder."""
    columns = {0: GLYPH_COLUMNS, 1: 7, 2: 5}[lod]
    rows = ((columns - 1) // 2) + 3
    span = (columns - 1) + 0.86
    pitch = min(GLYPH_WIDTH_TARGET / span, GLYPH_HEIGHT_CAP / ((rows - 1) + 0.86))
    return columns, rows, pitch, pitch * 0.86


def glyph_geometry(collection, materials, side: int, lod: int) -> None:
    columns, rows, pitch, tile = glyph_metrics(lod)
    depth = {0: 0.13, 1: 0.13, 2: 0.12}[lod]
    mid = (columns - 1) // 2
    row_mid = (rows - 1) / 2.0
    for column, row in glyph_cells(columns):
        u = (column - mid) * pitch
        s = (row_mid - row) * pitch
        add_box(
            collection, materials, lod, f"Face{'P' if side < 0 else 'S'}_MarkSegment_C{column}R{row}",
            (tile, tile, depth), face_point(side, u, s, 0.055), "Display_Screen_Glass",
            bevel=0.0, rot_x=face_rot(side),
        )


# ---------------------------------------------------------------------------------------------
# one display face
# ---------------------------------------------------------------------------------------------
def display_face(collection, materials, side: int, lod: int) -> None:
    prefix = f"Face{'P' if side < 0 else 'S'}"
    rot = face_rot(side)
    here = lambda u, s, d: face_point(side, u, s, d)

    # Folded dark backplate — the field the mark reads against, and the pressure skin of the bay.
    add_box(collection, materials, lod, f"{prefix}_Backplate",
            (13.00, 5.80, 0.16), here(0.0, 0.0, -0.12), "Display_Backplate", bevel=0.05, rot_x=rot)
    add_box(collection, materials, lod, f"{prefix}_MarkField",
            (5.10, 4.60, 0.10), here(0.0, 0.0, -0.02), "Display_Backplate", bevel=0.03, rot_x=rot)

    # Satin painted formed frame: visor lip, sill, stiles, mullions, transoms.
    # The visor overhang stays under 0.30 m so it does not shade the face at the shipping camera.
    add_box(collection, materials, lod, f"{prefix}_VisorRail",
            (13.50, 0.34, 0.44), here(0.0, FACE_HALF_S + 0.02, 0.14), "Display_Frame_Coat",
            bevel=0.05, rot_x=rot)
    add_box(collection, materials, lod, f"{prefix}_SillRail",
            (13.50, 0.40, 0.40), here(0.0, -FACE_HALF_S - 0.04, 0.10), "Display_Frame_Coat",
            bevel=0.05, rot_x=rot)
    for sign in (-1, 1):
        add_box(collection, materials, lod, f"{prefix}_Stile{'L' if sign < 0 else 'R'}",
                (0.30, 5.80, 0.38), here(sign * 6.55, 0.0, 0.06), "Display_Frame_Coat",
                bevel=0.045, rot_x=rot)
        add_box(collection, materials, lod, f"{prefix}_Mullion{'L' if sign < 0 else 'R'}",
                (0.24, 5.30, 0.32), here(sign * MULLION_U, 0.0, 0.06), "Display_Frame_Coat",
                bevel=0.04, rot_x=rot)
    if lod < 2:
        for sign in (-1, 1):
            add_box(collection, materials, lod, f"{prefix}_BandTransom{'L' if sign < 0 else 'R'}",
                    (3.45, 0.16, 0.26), here(sign * BAND_BAY_CENTER, 0.0, 0.06),
                    "Display_Frame_Coat", bevel=0.035, rot_x=rot)

    # Segmented readout strokes flank the main mark. Full luminous panes washed out into two
    # white blocks at the shipping camera; separated narrow strokes retain dark breathing room.
    if lod == 0:
        for sign in (-1, 1):
            for column in range(5):
                u = sign * BAND_BAY_CENTER + (column - 2) * 0.66
                for row in (-1, 1):
                    add_box(collection, materials, lod,
                            f"{prefix}_ReadoutCassette_{'L' if sign < 0 else 'R'}{column}{'A' if row < 0 else 'B'}",
                            (0.58, 0.22, 0.13), here(u, row * 1.05, 0.055),
                            "Display_Screen_Glass", bevel=0.0, rot_x=rot)
    elif lod == 1:
        for sign in (-1, 1):
            for column in range(3):
                u = sign * BAND_BAY_CENTER
                add_box(collection, materials, lod,
                        f"{prefix}_ReadoutCassette_{'L' if sign < 0 else 'R'}{column}",
                        ((3.20, 2.20, 2.65)[column], 0.22, 0.13),
                        here(u, (column - 1) * 1.10, 0.055),
                        "Display_Screen_Glass", bevel=0.0, rot_x=rot)
    else:
        for sign in (-1, 1):
            for row in (-1, 1):
                add_box(collection, materials, lod,
                        f"{prefix}_ReadoutBand{'L' if sign < 0 else 'R'}{row}",
                        (3.20 if row > 0 else 2.20, 0.26, 0.12),
                        here(sign * BAND_BAY_CENTER, row * 0.90, 0.055),
                        "Display_Screen_Glass", bevel=0.0, rot_x=rot)

    glyph_geometry(collection, materials, side, lod)

    # Finite amber status optics along the sill, plus hazard plates at the service ends.
    optic_count = {0: 6, 1: 4, 2: 0}[lod]
    _, normal = face_basis(side)
    for index in range(optic_count):
        u = -5.20 + index * (10.40 / max(1, optic_count - 1))
        v2.add_cylinder(collection, materials, lod, f"{prefix}_StatusOptic{index + 1:02d}",
                        0.115, 0.17, here(u, -FACE_HALF_S + 0.20, 0.22),
                        "Display_Safety_Marking", rotation=(-side * ROT_X, 0.0, 0.0),
                        vertices=10 if lod == 0 else 8, bevel=0.0)
    for sign in (-1, 1):
        add_box(collection, materials, lod, f"{prefix}_HazardPlate{'L' if sign < 0 else 'R'}",
                (1.10, 0.26, 0.10), here(sign * 5.95, -FACE_HALF_S + 0.20, 0.24),
                "Display_Safety_Marking", bevel=0.0 if lod == 2 else 0.03, rot_x=rot)


# ---------------------------------------------------------------------------------------------
# shared A-frame structure, ridge spine and station tether
# ---------------------------------------------------------------------------------------------
def display_core(collection, materials, lod: int) -> None:
    # Ridge spine: the structural apex, the glare visor the two faces hang from, and the power run.
    add_box(collection, materials, lod, "RidgeSpine",
            (13.90, 0.62, 0.52), (0.0, 0.0, RIDGE_Z), "Display_Service_Alloy", bevel=0.05)
    if lod < 2:
        for sign in (-1, 1):
            v2.add_beam(collection, materials, lod, f"RidgeCableTrunk{'L' if sign < 0 else 'R'}",
                        (-6.20, sign * 0.36, RIDGE_Z - 0.30), (6.20, sign * 0.36, RIDGE_Z - 0.30),
                        0.115, "Display_Service_Alloy", vertices=8 if lod == 0 else 6)

    # End A-frame ribs: the members that physically set the cant, one leg per face.
    for end in (-1, 1):
        for side in (-1, 1):
            add_box(collection, materials, lod, f"RibLeg_{'P' if end < 0 else 'S'}{'a' if side < 0 else 'b'}",
                    (0.34, 6.10, 0.46),
                    face_point(side, end * END_RIB_U, -0.10, -0.34),
                    "Display_Service_Alloy", bevel=0.045, rot_x=face_rot(side))
        add_box(collection, materials, lod, f"RibTie_{'P' if end < 0 else 'S'}",
                (0.34, 6.60, 0.34), (end * END_RIB_U, 0.0, -2.42),
                "Display_Service_Alloy", bevel=0.04)

    # Machined mounting shoes at the four splayed feet.
    for end in (-1, 1):
        for side in (-1, 1):
            add_box(collection, materials, lod, f"FootShoe_{'P' if end < 0 else 'S'}{'a' if side < 0 else 'b'}",
                    (0.62, 0.52, 0.62), (end * END_RIB_U, side * 3.24, -2.56),
                    "Display_Service_Alloy", bevel=0.05)

    if lod < 2:
        # Rear power bridges tie the two bays together inside the A-frame.
        for index, x in enumerate((-3.6, 3.6)):
            v2.add_beam(collection, materials, lod, f"RearPowerBridge{index + 1:02d}",
                        (x, -1.30, -0.30), (x, 1.30, -0.30), 0.10,
                        "Display_Service_Alloy", vertices=8 if lod == 0 else 6)
        # Offset replacement cassette — the serviceable module a crew swaps from the spine walkway.
        add_box(collection, materials, lod, "ReplacementCassette",
                (1.05, 0.72, 0.56), (4.35, 0.0, 1.24), "Display_Service_Alloy", bevel=0.04)
        # Station tether stubs: this is fixed infrastructure hung off a station spar, not a float.
        for sign in (-1, 1):
            v2.add_cylinder(collection, materials, lod, f"TetherStub{'L' if sign < 0 else 'R'}",
                            0.20, 0.90, (sign * 2.10, 0.0, -2.62), "Display_Service_Alloy",
                            rotation=(0.0, 0.0, 0.0), vertices=10 if lod == 0 else 8, bevel=0.03)


def build_geometry(collection, materials, lod: int) -> None:
    display_core(collection, materials, lod)
    for side in (-1, 1):
        display_face(collection, materials, side, lod)


# ---------------------------------------------------------------------------------------------
# stamp / collision contract, reproduced against the NEW envelope
# ---------------------------------------------------------------------------------------------
def envelope_records(minimum: Vector, maximum: Vector) -> dict:
    """Blender (X, Y starboard, Z up) -> glTF (X, Y up, Z starboard) = (X, Z, -Y)."""
    blender_size = [maximum[i] - minimum[i] for i in range(3)]
    blender_center = [(maximum[i] + minimum[i]) / 2.0 for i in range(3)]
    gltf_min = [minimum[0], minimum[2], -maximum[1]]
    gltf_max = [maximum[0], maximum[2], -minimum[1]]
    gltf_size = [gltf_max[i] - gltf_min[i] for i in range(3)]
    gltf_center = [(gltf_max[i] + gltf_min[i]) / 2.0 for i in range(3)]
    coverage = 0.92
    half_blender = [value * coverage / 2.0 for value in blender_size]
    half_gltf = [value * coverage / 2.0 for value in gltf_size]
    node_bounds = {
        "min": [blender_center[i] - half_blender[i] for i in range(3)],
        "max": [blender_center[i] + half_blender[i] for i in range(3)],
        "size": [value * coverage for value in blender_size],
    }
    runtime_bounds = {
        "min": [-half_gltf[i] for i in range(3)],
        "max": [half_gltf[i] for i in range(3)],
        "size": [value * coverage for value in gltf_size],
        "center": [0.0, 0.0, 0.0],
    }
    return {
        "blender_min": list(minimum), "blender_max": list(maximum), "blender_size": blender_size,
        "gltf_min": gltf_min, "gltf_max": gltf_max, "gltf_size": gltf_size,
        "collision_translation_gltf": gltf_center,
        "collision_node_bounds": node_bounds,
        "collision_runtime_bounds": runtime_bounds,
        "collision_coverage": {"perAxis": [coverage] * 3, "min": coverage, "mean": coverage},
        # Worst-case distance from the placement origin to any authored corner, against the
        # 28 WU dressing radius world.js already declares for this prop.
        "corner_radius_m": max(
            math.dist((0.0, 0.0, 0.0), (x, y, z))
            for x in (minimum[0], maximum[0])
            for y in (minimum[1], maximum[1])
            for z in (minimum[2], maximum[2])
        ),
    }


def exported_lod_bounds(path: Path) -> dict:
    """Read the exported accessor bounds so direct metadata matches the shipped glTF envelope."""
    document, _binary, _chunks = v2.read_glb(path)
    per_lod = {}
    all_minimum = [math.inf, math.inf, math.inf]
    all_maximum = [-math.inf, -math.inf, -math.inf]

    for lod in range(3):
        minimum = [math.inf, math.inf, math.inf]
        maximum = [-math.inf, -math.inf, -math.inf]
        prefix = f"LOD{lod}_"
        for node in document.get("nodes", []):
            if not str(node.get("name", "")).startswith(prefix) or "mesh" not in node:
                continue
            mesh = document.get("meshes", [])[node["mesh"]]
            for primitive in mesh.get("primitives", []):
                position_index = (primitive.get("attributes") or {}).get("POSITION")
                if position_index is None:
                    continue
                accessor = document.get("accessors", [])[position_index]
                if not isinstance(accessor.get("min"), list) or not isinstance(accessor.get("max"), list):
                    continue
                for axis in range(3):
                    minimum[axis] = min(minimum[axis], float(accessor["min"][axis]))
                    maximum[axis] = max(maximum[axis], float(accessor["max"][axis]))

        if not all(math.isfinite(value) for value in (*minimum, *maximum)):
            raise RuntimeError(f"{path}: missing finite POSITION bounds for LOD{lod}")
        for axis in range(3):
            all_minimum[axis] = min(all_minimum[axis], minimum[axis])
            all_maximum[axis] = max(all_maximum[axis], maximum[axis])
        per_lod[f"lod{lod}"] = {
            "min": minimum,
            "max": maximum,
            "size": [maximum[axis] - minimum[axis] for axis in range(3)],
        }

    return {
        "min": all_minimum,
        "max": all_maximum,
        "size": [all_maximum[axis] - all_minimum[axis] for axis in range(3)],
        "perLod": per_lod,
    }


def rewrite_direct_asset_metadata(path: Path, stamp: dict, bounds_dimensions: list[float]) -> None:
    """Add the direct asset extras consumed by manifest checks and generic loaders."""
    document, _binary, chunks = v2.read_glb(path)
    extras = document.setdefault("asset", {}).setdefault("extras", {})
    extras.update({
        "assetId": ASSET_ID,
        "partId": PART_ID,
        "category": "places",
        "priority": "P1",
        "unit": "metre",
        "upAxis": "+Y",
        "forwardAxis": "+X",
        "starboardAxis": "+Z",
        "triangleCount": stamp["triangleCount"],
        "textureSize": stamp["textureSize"],
        "boundsDimensionsM": list(bounds_dimensions),
    })

    json_payload = json.dumps(document, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    json_payload += b" " * ((4 - len(json_payload) % 4) % 4)
    rebuilt = [(0x4E4F534A, json_payload)] + [item for item in chunks if item[0] != 0x4E4F534A]
    body = bytearray()
    for kind, data in rebuilt:
        body.extend(struct.pack("<II", len(data), kind))
        body.extend(data)
    path.write_bytes(b"glTF" + struct.pack("<II", 2, 12 + len(body)) + bytes(body))


# ---------------------------------------------------------------------------------------------
# export verification without a GPU
# ---------------------------------------------------------------------------------------------
def verify_export(path: Path, lod_report: dict) -> dict:
    """Prove the cant, the LOD ladder and the emission confinement from the exported bytes alone.

    The decisive check is the normal cluster: every emitter face must carry glTF normal
    ``(0, sin35, +-cos35)``. That is a quantitative proof the 35 deg cant physically landed, and it
    needs no render.
    """
    import struct

    document, binary, _chunks = v2.read_glb(path)
    failures: list[str] = []
    nodes = {node.get("name"): node for node in document.get("nodes", [])}
    for required in (ROOT_NODE, SOCKET_NAME, "COLLISION_HULL"):
        if required not in nodes:
            failures.append(f"missing node {required}")
    for lod in range(3):
        for material in MATERIALS:
            if f"LOD{lod}_{material}" not in nodes:
                failures.append(f"missing draw group LOD{lod}_{material}")

    triangles = {}
    for lod in range(3):
        total = 0
        for material in MATERIALS:
            node = nodes.get(f"LOD{lod}_{material}")
            if node is None or "mesh" not in node:
                continue
            for primitive in document["meshes"][node["mesh"]]["primitives"]:
                total += v2.primitive_triangles(document, primitive)
        triangles[f"lod{lod}"] = total
        if total > LOD_CEILINGS[lod]:
            failures.append(f"lod{lod} ceiling exceeded {total} > {LOD_CEILINGS[lod]}")
    if not (triangles["lod0"] > triangles["lod1"] > triangles["lod2"]):
        failures.append(f"LOD reduction is not strict: {triangles}")

    emissive = {}
    for material in document.get("materials", []):
        factor = material.get("emissiveFactor") or [0.0, 0.0, 0.0]
        strength = ((material.get("extensions") or {})
                    .get("KHR_materials_emissive_strength") or {}).get("emissiveStrength", 1.0)
        emissive[material["name"]] = {
            "emissiveFactor": factor,
            "emissiveStrength": strength,
            "emits": max(factor) > 0.0,
        }
    for name, record in emissive.items():
        if record["emits"] != (name in EMISSION_V3):
            failures.append(f"emission confinement violated on {name}: {record}")

    # normal-cluster proof of the cant
    def read_vec3(accessor_index: int):
        accessor = document["accessors"][accessor_index]
        view = document["bufferViews"][accessor["bufferView"]]
        base = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
        stride = view.get("byteStride") or 12
        for index in range(accessor["count"]):
            offset = base + index * stride
            yield struct.unpack_from("<fff", binary, offset)

    cant = {"expectedY": round(SIN_C, 5), "expectedAbsZ": round(COS_C, 5),
            "plusZ": 0, "minusZ": 0, "other": 0}
    glass = nodes.get("LOD0_Display_Screen_Glass")
    if glass is not None and "mesh" in glass:
        for primitive in document["meshes"][glass["mesh"]]["primitives"]:
            for nx, ny, nz in read_vec3(primitive["attributes"]["NORMAL"]):
                if abs(nx) < 0.02 and abs(ny - SIN_C) < 0.03 and abs(abs(nz) - COS_C) < 0.03:
                    cant["plusZ" if nz > 0 else "minusZ"] += 1
                else:
                    cant["other"] += 1
    if cant["plusZ"] == 0 or cant["minusZ"] == 0:
        failures.append(f"canted emitter normals absent in one or both faces: {cant}")

    return {
        "nodesPresent": True,
        "lodTriangles": triangles,
        "blenderLodTriangles": {key: value["triangles"] for key, value in lod_report.items()},
        "emissive": emissive,
        "cantNormalClusters": cant,
        "failures": failures,
        "pass": not failures,
    }


# ---------------------------------------------------------------------------------------------
# build
# ---------------------------------------------------------------------------------------------
def build(render: bool = False) -> dict:
    started = time.time()
    baseline_source_relative = Path("assets/ships/parts/places/place_station_billboard.glb")
    baseline_release_relative = Path("assets/ships/release/parts/places/place_station_billboard.glb")
    baseline_source = preserved_baseline_path(baseline_source_relative)
    baseline_release = preserved_baseline_path(baseline_release_relative)
    baseline_comparison_available = baseline_source is not None and baseline_release is not None
    baseline = {
        "source": baseline_record(baseline_source_relative),
        "release": baseline_record(baseline_release_relative),
        "comparisonAvailable": baseline_comparison_available,
        "comparisonNote": (
            "compared against preserved before-runtime copies"
            if baseline_comparison_available
            else "no preserved before-runtime copies; no V2 comparison claimed"
        ),
        "lod0AabbSize": [14.800000190734863, 3.0500000715255737, 3.0]
        if baseline_comparison_available else None,
        "displayFaceM": [12.51, 1.70] if baseline_comparison_available else None,
        "displayFaceEmissive": False if baseline_comparison_available else None,
    }

    texture_files = write_textures()
    v2.reset_scene()
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    scene["spaceface.authoringAxes"] = "Blender X forward / Y starboard / Z up"
    scene["spaceface.exportAxes"] = "glTF X forward / Y up / Z starboard"

    collection = v2.ensure_collection("NEXT10_station_billboard_readable_v3")
    review_collection = v2.ensure_collection("NEXT10_station_billboard_REVIEW_RIG")
    materials = create_materials_v3(texture_files)

    root = bpy.data.objects.new(ROOT_NODE, None)
    root.empty_display_type = "CUBE"
    root.empty_display_size = 0.8
    collection.objects.link(root)
    root["spaceface.assetId"] = ASSET_ID
    root["spaceface.partId"] = PART_ID
    root["spaceface.role"] = "core_station_information_display"
    root["spaceface.candidateId"] = CANDIDATE_ID
    root["spaceface.wiringStatus"] = "isolated_candidate"
    root["spaceface.builder"] = SOURCE_GENERATOR

    for lod in range(3):
        build_geometry(collection, materials, lod)

    draw_groups: list = []
    lod_report: dict = {}
    topology_report: dict = {}
    for lod in range(3):
        groups, group_topology = v2.join_draw_groups(collection, materials, lod, root, MATERIALS)
        triangles = sum(len(obj.data.polygons) for obj in groups)
        if triangles > LOD_CEILINGS[lod]:
            raise RuntimeError(f"LOD{lod} ceiling exceeded before export: {triangles} > {LOD_CEILINGS[lod]}")
        draw_groups.extend(groups)
        topology_report.update(group_topology)
        lod_report[f"lod{lod}"] = {
            "triangles": triangles,
            "ceiling": LOD_CEILINGS[lod],
            "drawGroups": len(groups),
            "materials": [obj.data.materials[0].name for obj in groups],
        }
    if not (lod_report["lod0"]["triangles"] > lod_report["lod1"]["triangles"] > lod_report["lod2"]["triangles"]):
        raise RuntimeError(f"LOD reduction is not strict: {lod_report}")

    bpy.context.view_layer.update()
    lod0 = [obj for obj in draw_groups if obj.name.startswith("LOD0_")]
    minimum, maximum, _dimensions = v2.object_bounds(lod0)
    envelope = envelope_records(minimum, maximum)
    if envelope["corner_radius_m"] > 28.0:
        raise RuntimeError(f"authored envelope leaves the 28 WU dressing radius: {envelope['corner_radius_m']}")

    config = {
        "asset_id": ASSET_ID,
        "root": ROOT_NODE,
        "materials": MATERIALS,
        "material_roles": MATERIAL_ROLES,
        "collision_translation_gltf": envelope["collision_translation_gltf"],
        "collision_node_bounds": envelope["collision_node_bounds"],
        "collision_runtime_bounds": envelope["collision_runtime_bounds"],
        "collision_coverage": envelope["collision_coverage"],
        "tier": "B",
    }
    collision = v2.make_collision_helper(collection, root, config)
    socket = v2.make_socket(collection, root)
    bpy.context.view_layer.update()

    stamp = {
        "contractVersion": 1,
        "assetId": ASSET_ID,
        "partId": PART_ID,
        "liveId": PART_ID,
        "slot": "place",
        "category": "places",
        "priority": "P1",
        "triangleMetric": "lod0",
        "forward": "+X",
        "up": "+Y",
        "starboard": "+Z",
        "unit": "metre",
        "normalConvention": "OpenGL",
        "ormChannels": "R=AO,G=Roughness,B=Metallic",
        "textureCompression": "PNG-source",
        "textureSize": 256,
        "triBudget": LOD_CEILINGS[0],
        "chamfered": True,
        "bevelRadiusM": 0.05,
        "packet": PACKET,
        "dispatchUnit": DISPATCH_UNIT,
        "state": "candidate_only",
        "claims": {
            "candidateOnly": True,
            "promoted": False,
            "routeEvidence": False,
            "performanceEvidence": False,
            "visualReview": False,
        },
        "role": "core_station_information_display",
        "title": "Core Station Information Display",
        "kind": "station_infrastructure",
        "tier": "B",
        "deliverableRole": "production_multi_lod",
        "lods": ["lod0", "lod1", "lod2"],
        "triangleCount": lod_report["lod0"]["triangles"],
        "collisionTriangleCount": 0,
        "lodTriangles": {key: value["triangles"] for key, value in lod_report.items()},
        "drawGroupsPerLod": {key: value["drawGroups"] for key, value in lod_report.items()},
        "wiringStatus": "isolated_candidate",
        "candidateId": CANDIDATE_ID,
        "revisionPass": "station_billboard_readable_v3",
        "sourceGenerator": SOURCE_GENERATOR,
        "sourceBlenderVersion": bpy.app.version_string,
        "authoringAxes": "X forward / Y starboard / Z up",
        "processChain": ["blender-5.1-python", "glb-source-candidate", "headless-export-verification"],
        "wiring": {"partId": PART_ID, "slot": "place", "rootNode": ROOT_NODE, "sockets": [SOCKET_NAME]},
        "materials": MATERIALS,
        "materialRoles": MATERIAL_ROLES,
        "displayGeometry": {
            "faces": 2,
            "arrangement": "back_to_back_a_frame_under_shared_ridge_visor",
            "cantDegreesFromVertical": CANT_DEG,
            "faceWidthM": FACE_HALF_U * 2,
            "faceHeightM": FACE_HALF_S * 2,
            "previousFaceM": [12.51, 1.70],
            "facingStrengthWorstCase": round(0.866 * SIN_C, 4),
            "facingStrengthBestCase": round(0.866 * SIN_C + 0.5 * COS_C, 4),
            "horizontalApproachStrength": round(COS_C, 4),
            "markCoverageOfFaceHeight": {
                f"lod{lod}": round(
                    ((glyph_metrics(lod)[1] - 1) * glyph_metrics(lod)[2] + glyph_metrics(lod)[3])
                    / (FACE_HALF_S * 2), 3)
                for lod in range(3)
            },
        },
        "lod0AabbSize": envelope["gltf_size"],
        "collisionBounds": envelope["collision_runtime_bounds"],
        "collisionCoverageRatio": envelope["collision_coverage"],
        "collision": {
            "representation": "non_mesh_helper",
            "triangles": 0,
            "translation": envelope["collision_translation_gltf"],
            "nodeBounds": envelope["collision_node_bounds"],
            "runtimeBounds": envelope["collision_runtime_bounds"],
            "coverageRatio": envelope["collision_coverage"],
        },
    }
    metadata_text = json.dumps(stamp, separators=(",", ":"))
    root["spacefaceAssetJson"] = metadata_text
    scene["spacefaceAssetJson"] = metadata_text

    for obj in draw_groups:
        is_lod0 = obj.name.startswith("LOD0_")
        obj.hide_viewport = not is_lod0
        obj.hide_render = not is_lod0
        obj.hide_set(not is_lod0)
    collision.hide_viewport = True
    collision.hide_render = True
    collision.hide_set(True)

    BLEND_PATH.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))

    export_spec = {
        "kind": "prop",
        "id": PART_ID,
        "assetId": ASSET_ID,
        "slot": "place",
        "tri_budget": None,
        "min_hull_tris": 0,
        "required_maps": ["ao", "roughness"],
        "textureCompression": "PNG-source",
    }
    GLB_PATH.parent.mkdir(parents=True, exist_ok=True)
    diagnostics = v2.spaceface_export.export_gltf(
        str(GLB_PATH), export_spec, [root, collision, socket, *draw_groups])
    exported_bounds = exported_lod_bounds(GLB_PATH)
    stamp["boundsDimensionsM"] = exported_bounds["size"]
    v2.rewrite_glb_metadata(GLB_PATH, config, stamp)
    rewrite_direct_asset_metadata(GLB_PATH, stamp, exported_bounds["size"])
    verification = verify_export(GLB_PATH, lod_report)

    report = {
        "schema": "spaceface.stationBillboardReadableV3CandidateReport.v1",
        "packet": PACKET,
        "dispatchUnit": DISPATCH_UNIT,
        "partId": PART_ID,
        "assetId": ASSET_ID,
        "rootNode": ROOT_NODE,
        "candidateId": CANDIDATE_ID,
        "state": "surfaced_candidate",
        "claims": stamp["claims"],
        "generator": v2.identity(Path(__file__).resolve()),
        "importedHelpersFrom": v2.identity(V2_PATH),
        "candidateGlb": v2.identity(GLB_PATH),
        "blender": v2.identity(BLEND_PATH),
        "baseline": baseline,
        "envelopeBeforeAfter": {
            "before": {"gltfSize": [14.8, 3.05, 3.0], "faceM": [12.51, 1.70], "cantDeg": 0.0},
            "after": {
                "gltfSize": envelope["gltf_size"],
                "faceM": [FACE_HALF_U * 2, FACE_HALF_S * 2],
                "cantDeg": CANT_DEG,
                "faces": 2,
                "cornerRadiusM": envelope["corner_radius_m"],
                "dressingRadiusWU": 28,
            },
        },
        "envelope": envelope,
        "exportedBounds": exported_bounds,
        "lod": lod_report,
        "topology": topology_report,
        "materialZones": {
            name: {
                "role": MATERIAL_ROLES[name],
                "baseColorLinear": list(MATERIAL_TUNING_V3[name][0]),
                "metallic": MATERIAL_TUNING_V3[name][1],
                "roughness": MATERIAL_TUNING_V3[name][2],
                "family": MATERIAL_TUNING_V3[name][3],
                "emission": (list(EMISSION_V3[name][0]) + [EMISSION_V3[name][1]])
                if name in EMISSION_V3 else None,
            }
            for name in MATERIALS
        },
        "stamp": stamp,
        "exportDiagnostics": diagnostics,
        "verification": verification,
        "textures": {name: {kind: v2.rel(path) for kind, path in kinds.items()}
                     for name, kinds in texture_files.items()},
        "renderPerformed": False,
        "elapsedSeconds": round(time.time() - started, 2),
    }

    if render:
        report["render"] = render_review(scene, review_collection, draw_groups, minimum, maximum)
        report["renderPerformed"] = True

    v2.json_dump(BUILD_REPORT, report)
    if not verification["pass"]:
        raise RuntimeError(f"export verification failed: {verification['failures']}")
    return report


def render_review(scene, collection, draw_groups, minimum: Vector, maximum: Vector) -> dict:
    """Owner review pass. OFF unless --render is passed; the parent owns every GPU capture."""
    target = (minimum + maximum) * 0.5
    camera, lights = v2.create_review_rig(scene, collection, PART_ID, target)
    # The live shipping camera: 60 deg tilt, 50 mm / 36 mm sensor, default chase distance 144 WU.
    tilt = math.radians(60.0)
    shipping = (0.0, -math.cos(tilt), math.sin(tilt))
    images = [
        v2.render_view(scene, camera, RENDER_ROOT / "01-shipping-camera-lod0.png",
                       "shipping_camera_lod0", shipping, 144.0, target, 0,
                       "ordinary shipping camera, live 60 deg tilt and default chase distance"),
        v2.render_view(scene, camera, RENDER_ROOT / "02-shipping-camera-close.png",
                       "shipping_camera_close", shipping, 58.0, target, 0,
                       "close chase distance, same tilt"),
        v2.render_view(scene, camera, RENDER_ROOT / "03-station-approach.png",
                       "station_approach", (0.30, -1.0, 0.14), 34.0, target, 0,
                       "horizontal station approach — both canted faces must read"),
    ]
    zeroed = v2.emission_strengths_zeroed()
    images.append(v2.render_view(scene, camera, RENDER_ROOT / "04-shipping-camera-emission-off.png",
                                 "shipping_camera_emission_off", shipping, 144.0, target, 0,
                                 "emission off — form and paint must carry the read alone"))
    v2.restore_emission(zeroed)
    for lod in (1, 2):
        images.append(v2.render_view(scene, camera, RENDER_ROOT / f"0{4 + lod}-shipping-camera-lod{lod}.png",
                                     f"shipping_camera_lod{lod}", shipping, 144.0, target, lod,
                                     f"LOD{lod} must retain the cant, both faces and the mark"))
    for obj in draw_groups:
        is_lod0 = obj.name.startswith("LOD0_")
        obj.hide_render = not is_lod0
        obj.hide_viewport = not is_lod0
        obj.hide_set(not is_lod0)
    return {"images": images, "lights": sorted(lights) if isinstance(lights, dict) else None}


BUILD_RESULT = None
if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    BUILD_RESULT = build(render="--render" in argv)
    print("SF_V3_BUILD_OK " + json.dumps({
        "candidate": BUILD_RESULT["candidateGlb"],
        "blend": BUILD_RESULT["blender"],
        "lodTriangles": BUILD_RESULT["verification"]["lodTriangles"],
        "gltfSize": BUILD_RESULT["envelope"]["gltf_size"],
        "cant": BUILD_RESULT["verification"]["cantNormalClusters"],
        "pass": BUILD_RESULT["verification"]["pass"],
    }, indent=2))
