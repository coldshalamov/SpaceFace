#!/usr/bin/env python3
"""Build the source candidate for the opening-region dead hulk.

This is a method reset, not another mutation of the abandoned iteration stack.  The
builder creates one centered, continuous commercial carrier/drill-tender donor with a
single causal starboard/dorsal rupture.  It owns no repository publication step: every
output path is explicit, and the caller decides whether a reviewed candidate is
promoted.

Run with Blender:

    blender --background --factory-startup --python \
      tools/blender/remaster_opening_dead_hulk_v1.py -- \
      --maps-root <directory> \
      --output-blend <candidate.blend> \
      --output-glb <candidate.glb> \
      --report <candidate-report.json>

Coordinate contract: +X forward, +Y starboard/beam, +Z dorsal.  The root remains at the
world origin.  Geometry is generated from fixed numeric recipes; there is no ambient
randomness, noise field, hash-derived placement, or prior-iteration import.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import struct
import sys
from pathlib import Path
from typing import Iterable

import bmesh
import bpy
from mathutils import Vector


ASSET_ID = "place_dead_hulk"
ROOT_NAME = ASSET_ID
SOURCE_REVISION = "opening_dead_hulk_v1"
FORWARD_AXIS = "+X"
UP_AXIS = "+Z"
BEAM_AXIS = "+Y"

# The macro envelope is deliberately centered and close to the handoff target.  The
# final measured bounds are written to the report; this target is the fail-closed
# authoring contract used before publication.
TARGET_ENVELOPE = (54.5, 12.6, 12.2)
ENVELOPE_TOLERANCE = (0.75, 0.75, 0.85)
RUPTURE_X = (-4.1, 7.3)

MARKERS = {
    "SOCKET_Hazard_Core": {
        "kind": "socket",
        "role": "hazard_core",
        "location": (1.4, 2.35, 2.15),
    },
    "SOCKET_Salvage_Core": {
        "kind": "socket",
        "role": "salvage_core",
        "location": (-7.2, -2.55, 1.05),
    },
}

ROLE_BY_MATERIAL = {
    "Material_Hull": "hulk_painted_hull",
    "Material_Armor": "hulk_armor_dark",
    "Material_Structural": "hulk_structural_alloy",
    "Material_Insulation": "hulk_rupture_insulation",
    "Material_Service": "hulk_service_trunks",
    "Material_Glass": "hulk_dead_glass",
    "Material_Heat": "hulk_heat_affected",
}

NORMAL_STRENGTH = {
    "hulk_painted_hull": 0.16,
    "hulk_armor_dark": 0.13,
    "hulk_structural_alloy": 0.15,
    "hulk_rupture_insulation": 0.20,
    "hulk_service_trunks": 0.12,
    "hulk_dead_glass": 0.04,
    "hulk_heat_affected": 0.15,
}

# Fixed section recipe: x, half beam, ventral depth, dorsal height, vertical offset.
# A broad aft drive shoulder, central hold, and tapered forward shoulder remain
# visually distinct while sharing one continuous shell and keel.
HULL_STATIONS = (
    (-27.25, 3.45, 2.80, 2.70, -0.05),
    (-25.60, 5.00, 4.10, 4.20, -0.10),
    (-22.50, 5.25, 4.30, 4.40, -0.05),
    (-19.00, 4.75, 4.05, 4.15, 0.00),
    (-15.00, 4.80, 4.20, 4.40, 0.05),
    (-11.00, 5.00, 4.35, 4.55, 0.05),
    (-7.00, 5.00, 4.35, 4.55, 0.05),
    (-4.10, 4.85, 4.25, 4.45, 0.00),
    (-1.20, 4.65, 4.10, 4.25, -0.10),
    (2.10, 4.45, 3.95, 4.10, -0.18),
    (5.00, 4.30, 3.80, 3.95, -0.12),
    (7.30, 4.25, 3.70, 3.90, -0.05),
    (10.50, 4.50, 3.85, 4.10, 0.05),
    (14.50, 4.35, 3.70, 4.20, 0.12),
    (18.50, 3.90, 3.35, 3.90, 0.20),
    (22.00, 3.20, 2.85, 3.30, 0.18),
    (25.00, 2.30, 2.15, 2.55, 0.10),
    (27.25, 0.90, 1.00, 1.10, 0.00),
)


def cli() -> argparse.Namespace:
    values = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(
        description="Build a non-promoting place_dead_hulk Blender/GLB source candidate."
    )
    parser.add_argument("--maps-root", type=Path, required=True)
    parser.add_argument("--output-blend", type=Path, required=True)
    parser.add_argument("--output-glb", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    return parser.parse_args(values)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def clear_scene() -> None:
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for block in (
        bpy.data.meshes,
        bpy.data.curves,
        bpy.data.materials,
        bpy.data.images,
        bpy.data.cameras,
        bpy.data.lights,
    ):
        for value in list(block):
            if value.users == 0:
                block.remove(value)


def load_image(path: Path, colorspace: str):
    if not path.is_file():
        raise FileNotFoundError(f"missing authored hulk map: {path}")
    image = bpy.data.images.load(str(path.resolve()), check_existing=True)
    image.name = path.name
    image.colorspace_settings.name = colorspace
    image.pack()
    return image


def material(name: str, role: str, maps_root: Path):
    value = bpy.data.materials.new(name)
    value.use_nodes = True
    value["spaceface.semantic"] = name
    value["spaceface.textureRole"] = role
    value["spaceface.ormChannels"] = "R=AO,G=Roughness,B=Metallic"
    value["spaceface.normalConvention"] = "OpenGL tangent space"

    nodes = value.node_tree.nodes
    links = value.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    output.name = "SF_Surface_Output"
    principled = nodes.new("ShaderNodeBsdfPrincipled")
    principled.name = "SF_Principled"

    base = nodes.new("ShaderNodeTexImage")
    base.name = f"SF_{role}_BaseColor"
    base.image = load_image(maps_root / f"{role}_basecolor.png", "sRGB")
    base.interpolation = "Linear"
    links.new(base.outputs["Color"], principled.inputs["Base Color"])

    orm = nodes.new("ShaderNodeTexImage")
    orm.name = f"SF_{role}_ORM"
    orm.image = load_image(maps_root / f"{role}_orm.png", "Non-Color")
    orm.interpolation = "Linear"
    separate = nodes.new("ShaderNodeSeparateColor")
    separate.name = "SF_ORM_Channels"
    links.new(orm.outputs["Color"], separate.inputs["Color"])
    links.new(separate.outputs["Green"], principled.inputs["Roughness"])
    links.new(separate.outputs["Blue"], principled.inputs["Metallic"])

    group = bpy.data.node_groups.get("glTF Material Output")
    if group is None:
        group = bpy.data.node_groups.new("glTF Material Output", "ShaderNodeTree")
        group.interface.new_socket(
            name="Occlusion", in_out="INPUT", socket_type="NodeSocketFloat"
        )
    gltf_output = nodes.new("ShaderNodeGroup")
    gltf_output.name = "SF_glTF_Occlusion"
    gltf_output.node_tree = group
    links.new(separate.outputs["Red"], gltf_output.inputs["Occlusion"])

    normal = nodes.new("ShaderNodeTexImage")
    normal.name = f"SF_{role}_Normal"
    normal.image = load_image(maps_root / f"{role}_normal.png", "Non-Color")
    normal.interpolation = "Linear"
    normal_map = nodes.new("ShaderNodeNormalMap")
    normal_map.name = "SF_Tangent_Normal"
    normal_map.inputs["Strength"].default_value = NORMAL_STRENGTH[role]
    links.new(normal.outputs["Color"], normal_map.inputs["Color"])
    links.new(normal_map.outputs["Normal"], principled.inputs["Normal"])

    if name == "Material_Hull":
        principled.inputs["Coat Weight"].default_value = 0.05
        principled.inputs["Coat Roughness"].default_value = 0.48
    if name == "Material_Glass":
        principled.inputs["Metallic"].default_value = 0.15
        principled.inputs["Roughness"].default_value = 0.52
    links.new(principled.outputs["BSDF"], output.inputs["Surface"])
    return value


def make_empty(name: str, parent=None, location=(0.0, 0.0, 0.0)):
    obj = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(obj)
    obj.empty_display_type = "PLAIN_AXES"
    obj.empty_display_size = 0.65
    obj.location = location
    obj.parent = parent
    return obj


def lod_group(level: int, root):
    group = make_empty(f"LOD{level}_{ASSET_ID}", root)
    group["spaceface.lod"] = f"lod{level}"
    group["spaceface.lodLevel"] = level
    group["spaceface.assetId"] = ASSET_ID
    return group


def tag(obj, lod: int, mat, role: str, parent) -> None:
    obj.parent = parent
    obj["spaceface.lod"] = f"lod{lod}"
    obj["spaceface.lodLevel"] = lod
    obj["spaceface.materialRole"] = mat.name
    obj["spaceface.structureRole"] = role
    obj["spaceface.wreckDonor"] = "commercial carrier/drill-tender"
    obj["spaceface.damageEvent"] = "starboard-dorsal hold rupture"


def bevel(obj, width: float, lod: int) -> None:
    modifier = obj.modifiers.new("SF_PhysicalEdge", "BEVEL")
    modifier.width = max(0.018, width * (1.0 if lod == 0 else 0.70 if lod == 1 else 0.48))
    modifier.segments = 3 if lod == 0 else 2 if lod == 1 else 1
    modifier.limit_method = "ANGLE"


def box(
    name: str,
    dimensions,
    location,
    rotation,
    mat,
    lod: int,
    role: str,
    parent,
    edge: float = 0.08,
):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = f"LOD{lod}_Hulk_{name}"
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    obj.data.materials.append(mat)
    bevel(obj, edge, lod)
    tag(obj, lod, mat, role, parent)
    return obj


def cylinder_x(
    name: str,
    depth: float,
    radius_y: float,
    radius_z: float,
    location,
    mat,
    lod: int,
    role: str,
    parent,
    vertices: int = 28,
    edge: float = 0.06,
):
    count = max(10, vertices if lod == 0 else vertices // 2 if lod == 1 else vertices // 3)
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=count,
        radius=1.0,
        depth=1.0,
        end_fill_type="NGON",
        location=location,
        rotation=(0.0, math.pi / 2.0, 0.0),
    )
    obj = bpy.context.object
    obj.name = f"LOD{lod}_Hulk_{name}"
    # Cylinder local Z becomes world X, local Y remains world Y, and local X becomes
    # world -Z after the rotation.
    obj.scale = (radius_z, radius_y, depth)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    obj.data.materials.append(mat)
    bevel(obj, edge, lod)
    tag(obj, lod, mat, role, parent)
    return obj


def torus_x(
    name: str,
    major_radius: float,
    minor_radius: float,
    location,
    mat,
    lod: int,
    role: str,
    parent,
    beam_scale: float = 1.0,
    dorsal_scale: float = 0.88,
):
    major_segments = 36 if lod == 0 else 24 if lod == 1 else 14
    minor_segments = 10 if lod == 0 else 7 if lod == 1 else 5
    bpy.ops.mesh.primitive_torus_add(
        major_segments=major_segments,
        minor_segments=minor_segments,
        location=location,
        rotation=(0.0, math.pi / 2.0, 0.0),
        major_radius=major_radius,
        minor_radius=minor_radius,
    )
    obj = bpy.context.object
    obj.name = f"LOD{lod}_Hulk_{name}"
    obj.scale = (dorsal_scale, beam_scale, 1.0)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    obj.data.materials.append(mat)
    tag(obj, lod, mat, role, parent)
    return obj


def beam(
    name: str,
    start,
    end,
    width: float,
    mat,
    lod: int,
    role: str,
    parent,
    edge: float = 0.04,
):
    a = Vector(start)
    b = Vector(end)
    delta = b - a
    obj = box(
        name,
        (width, width, delta.length),
        (a + b) * 0.5,
        (0.0, 0.0, 0.0),
        mat,
        lod,
        role,
        parent,
        edge,
    )
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = delta.to_track_quat("Z", "Y")
    obj.rotation_mode = "XYZ"
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    obj.select_set(False)
    tag(obj, lod, mat, role, parent)
    return obj


def hard_chine_profile(half_beam: float, ventral: float, dorsal: float, z_offset: float):
    """Twelve-point commercial hard-chine section in the YZ plane."""
    return (
        (0.00, z_offset - ventral),
        (0.62 * half_beam, z_offset - ventral),
        (half_beam, z_offset - 0.46 * ventral),
        (half_beam, z_offset + 0.22 * dorsal),
        (0.78 * half_beam, z_offset + 0.82 * dorsal),
        (0.38 * half_beam, z_offset + dorsal),
        (0.00, z_offset + 1.04 * dorsal),
        (-0.38 * half_beam, z_offset + dorsal),
        (-0.78 * half_beam, z_offset + 0.82 * dorsal),
        (-half_beam, z_offset + 0.22 * dorsal),
        (-half_beam, z_offset - 0.46 * ventral),
        (-0.62 * half_beam, z_offset - ventral),
    )


def station_subset(lod: int):
    if lod == 0:
        return HULL_STATIONS
    required = {-27.25, -22.50, -15.00, -7.00, -4.10, 2.10, 7.30, 14.50, 22.00, 27.25}
    if lod == 2:
        required = {-27.25, -22.50, -11.00, -4.10, 2.10, 7.30, 18.50, 27.25}
    return tuple(row for row in HULL_STATIONS if row[0] in required)


def segment_is_ruptured(x_mid: float, a, b) -> bool:
    if not (RUPTURE_X[0] < x_mid < RUPTURE_X[1]):
        return False
    y_mid = (a[0] + b[0]) * 0.5
    z_mid = (a[1] + b[1]) * 0.5
    # Vary the removed shell sectors along X so the wound has a diagonal, stepped
    # boundary instead of reading as a factory-cut service hatch.  The opening stays
    # connected while the port side, belly, keel, and end load paths remain intact.
    if x_mid < -1.45:
        return (y_mid > 1.65 and z_mid > -0.15) or (y_mid > 0.10 and z_mid > 3.35)
    if x_mid < 3.15:
        return (y_mid > 0.15 and z_mid > -1.30) or (y_mid > -0.45 and z_mid > 2.75)
    if x_mid < 5.55:
        return (y_mid > 0.85 and z_mid > -0.45) or (y_mid > -0.10 and z_mid > 3.00)
    return (y_mid > 1.85 and z_mid > 0.35) or (y_mid > 0.35 and z_mid > 3.40)


def build_shell(lod: int, mat, parent):
    stations = station_subset(lod)
    bm = bmesh.new()
    rings = []
    profiles = []
    for x, beam_half, ventral, dorsal, z_offset in stations:
        profile = hard_chine_profile(beam_half, ventral, dorsal, z_offset)
        profiles.append(profile)
        rings.append([bm.verts.new((x, y, z)) for y, z in profile])

    section_count = len(rings[0])
    for station_index in range(len(rings) - 1):
        x_mid = (stations[station_index][0] + stations[station_index + 1][0]) * 0.5
        for section_index in range(section_count):
            next_index = (section_index + 1) % section_count
            a = profiles[station_index][section_index]
            b = profiles[station_index][next_index]
            if segment_is_ruptured(x_mid, a, b):
                continue
            bm.faces.new(
                (
                    rings[station_index][section_index],
                    rings[station_index][next_index],
                    rings[station_index + 1][next_index],
                    rings[station_index + 1][section_index],
                )
            )

    for ring_index, reverse in ((0, True), (len(rings) - 1, False)):
        center = sum((vertex.co for vertex in rings[ring_index]), Vector()) / section_count
        center_vertex = bm.verts.new(center)
        for section_index in range(section_count):
            next_index = (section_index + 1) % section_count
            vertices = (
                (center_vertex, rings[ring_index][next_index], rings[ring_index][section_index])
                if reverse
                else (center_vertex, rings[ring_index][section_index], rings[ring_index][next_index])
            )
            bm.faces.new(vertices)

    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    mesh = bpy.data.meshes.new(f"LOD{lod}_Hulk_ContinuousShellMesh")
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(f"LOD{lod}_Hulk_ContinuousShell", mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.data.materials.append(mat)
    bevel(obj, 0.10, lod)
    tag(obj, lod, mat, "continuous_commercial_carrier_shell", parent)
    return obj


def build_bulkhead(
    name: str,
    x: float,
    beam_half: float,
    height_half: float,
    mat,
    lod: int,
    parent,
    broken_starboard: bool = False,
):
    thickness = 0.34 if lod == 0 else 0.48 if lod == 1 else 0.62
    box(
        f"{name}_Dorsal",
        (thickness, beam_half * 2.0, thickness),
        (x, 0.0, height_half),
        (0.0, 0.0, 0.0),
        mat,
        lod,
        "rooted_bulkhead_crossmember",
        parent,
        0.05,
    )
    box(
        f"{name}_Ventral",
        (thickness, beam_half * 2.0, thickness),
        (x, 0.0, -height_half),
        (0.0, 0.0, 0.0),
        mat,
        lod,
        "rooted_bulkhead_crossmember",
        parent,
        0.05,
    )
    box(
        f"{name}_Port",
        (thickness, thickness, height_half * 2.0),
        (x, -beam_half, 0.0),
        (0.0, 0.0, 0.0),
        mat,
        lod,
        "rooted_bulkhead_upright",
        parent,
        0.05,
    )
    if not broken_starboard:
        box(
            f"{name}_Starboard",
            (thickness, thickness, height_half * 2.0),
            (x, beam_half, 0.0),
            (0.0, 0.0, 0.0),
            mat,
            lod,
            "rooted_bulkhead_upright",
            parent,
            0.05,
        )


def peel_sheet(
    name: str,
    x0: float,
    x1: float,
    y_root: float,
    z_root: float,
    y_free: float,
    z_free: float,
    thickness: float,
    mat,
    lod: int,
    role: str,
    parent,
):
    """Create one thick rooted rupture layer with a bounded deterministic curl."""
    u_segments = 8 if lod == 0 else 5
    v_segments = 4 if lod == 0 else 3
    bm = bmesh.new()
    outer = []
    inner = []
    for v_index in range(v_segments + 1):
        v = v_index / v_segments
        outer_row = []
        inner_row = []
        for u_index in range(u_segments + 1):
            u = u_index / u_segments
            x = x0 + (x1 - x0) * u
            longitudinal = math.sin(u * math.pi) * 0.22 * v
            y = y_root + (y_free - y_root) * v + longitudinal
            z = z_root + (z_free - z_root) * v + math.sin(u * math.pi * 2.0) * 0.10 * v
            outer_row.append(bm.verts.new((x, y, z)))
            inner_row.append(bm.verts.new((x, y - thickness, z - thickness * 0.35)))
        outer.append(outer_row)
        inner.append(inner_row)

    for v_index in range(v_segments):
        for u_index in range(u_segments):
            bm.faces.new(
                (
                    outer[v_index][u_index],
                    outer[v_index][u_index + 1],
                    outer[v_index + 1][u_index + 1],
                    outer[v_index + 1][u_index],
                )
            )
            bm.faces.new(
                (
                    inner[v_index][u_index],
                    inner[v_index + 1][u_index],
                    inner[v_index + 1][u_index + 1],
                    inner[v_index][u_index + 1],
                )
            )

    for u_index in range(u_segments):
        for v_index in (0, v_segments):
            bm.faces.new(
                (
                    outer[v_index][u_index],
                    inner[v_index][u_index],
                    inner[v_index][u_index + 1],
                    outer[v_index][u_index + 1],
                )
            )
    for v_index in range(v_segments):
        for u_index in (0, u_segments):
            bm.faces.new(
                (
                    outer[v_index][u_index],
                    outer[v_index + 1][u_index],
                    inner[v_index + 1][u_index],
                    inner[v_index][u_index],
                )
            )

    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    mesh = bpy.data.meshes.new(f"LOD{lod}_Hulk_{name}Mesh")
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(f"LOD{lod}_Hulk_{name}", mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.data.materials.append(mat)
    bevel(obj, 0.035, lod)
    tag(obj, lod, mat, role, parent)
    return obj


def build_drive_mass(lod: int, mats, parent) -> None:
    # One broad commercial drive ring, not a cluster of disconnected fighter bells.
    torus_x(
        "AftDriveRing",
        5.30,
        0.70,
        (-24.20, 0.0, -0.10),
        mats["Material_Armor"],
        lod,
        "broad_aft_engine_ring",
        parent,
        beam_scale=1.06,
        dorsal_scale=0.90,
    )
    cylinder_x(
        "AftDriveShoulder",
        3.60,
        5.10,
        4.55,
        (-22.15, 0.0, -0.10),
        mats["Material_Hull"],
        lod,
        "continuous_drive_shouldering",
        parent,
        30,
        0.065,
    )
    cylinder_x(
        "DeadDriveMouth",
        0.65,
        4.25,
        3.70,
        (-26.85, 0.0, -0.10),
        mats["Material_Heat"],
        lod,
        "cold_ruptured_drive_mouth",
        parent,
        30,
        0.045,
    )
    if lod < 2:
        for index, y in enumerate((-2.45, 0.0, 2.45)):
            cylinder_x(
                f"DeadInjector_{index}",
                1.05,
                0.58 if index != 1 else 0.74,
                0.50 if index != 1 else 0.64,
                (-26.92, y, -0.12),
                mats["Material_Structural"],
                lod,
                "dead_drive_injector",
                parent,
                18,
                0.04,
            )


def build_command_house(lod: int, mats, parent) -> None:
    # The house grows out of the forward shoulder and is offset to port, making the
    # industrial donor readable without turning it into a separate cockpit pod.
    box(
        "CommandHouseBase",
        (11.40, 5.10, 1.18),
        (15.45, -1.48, 3.72),
        (0.0, -0.035, 0.0),
        mats["Material_Hull"],
        lod,
        "command_house_shoulder_interface",
        parent,
        0.11,
    )
    box(
        "CommandHouseCrown",
        (8.75, 4.20, 2.72),
        (16.90, -1.92, 4.78),
        (0.0, -0.045, 0.0),
        mats["Material_Armor"],
        lod,
        "offset_command_house",
        parent,
        0.10,
    )
    box(
        "CommandHouseBrow",
        (5.85, 3.70, 0.68),
        (20.15, -2.00, 5.86),
        (0.0, -0.08, 0.0),
        mats["Material_Hull"],
        lod,
        "forward_command_brow",
        parent,
        0.07,
    )
    if lod < 2:
        box(
            "DeadWindowBank",
            (6.45, 0.16, 0.78),
            (18.40, -4.00, 5.02),
            (0.0, 0.0, 0.0),
            mats["Material_Glass"],
            lod,
            "cold_continuous_window_bank",
            parent,
            0.03,
        )
        mullions = 5 if lod == 0 else 3
        for index in range(mullions):
            x = 15.80 + index * (5.15 / max(1, mullions - 1))
            box(
                f"WindowMullion_{index}",
                (0.12, 0.22, 0.82),
                (x, -4.04, 5.02),
                (0.0, 0.0, 0.0),
                mats["Material_Structural"],
                lod,
                "command_window_mullion",
                parent,
                0.025,
            )


def build_hold_mass(lod: int, mats, parent) -> None:
    """Give the donor a broad, load-bearing commercial hold silhouette.

    The continuous pressure shell remains the primary body, but it cannot carry the
    whole silhouette by itself: at gameplay distance that read as a torpedo.  These
    overlapping shoulders and collars are rooted through the shell into the keel and
    bulkheads.  They describe one rectangular freight volume, not detachable pods or
    decorative greeble.
    """
    box(
        "FreightHoldShoulder",
        (17.40, 11.30, 4.55),
        (-11.80, 0.0, -0.10),
        (0.0, 0.0, 0.0),
        mats["Material_Hull"],
        lod,
        "integrated_commercial_hold_volume",
        parent,
        0.16,
    )
    box(
        "FreightHoldDorsalDeck",
        (16.20, 8.85, 0.78),
        (-11.55, 0.0, 4.46),
        (0.0, 0.0, 0.0),
        mats["Material_Hull"],
        lod,
        "load_bearing_hold_dorsal_deck",
        parent,
        0.10,
    )
    for suffix, x in (("Aft", -19.35), ("Forward", 8.15)):
        box(
            f"FreightHoldCollar{suffix}",
            (0.72, 11.75, 8.35),
            (x, 0.0, 0.02),
            (0.0, 0.0, 0.0),
            mats["Material_Structural"],
            lod,
            "rooted_hold_boundary_collar",
            parent,
            0.09,
        )

    # The forward part of the freight volume survives on the port side only.  Its
    # starboard counterpart is exactly the missing mass exposed by the rupture.
    box(
        "FreightHoldForwardPortShoulder",
        (11.20, 2.45, 4.40),
        (2.25, -4.38, -0.08),
        (0.0, 0.0, 0.0),
        mats["Material_Hull"],
        lod,
        "rupture_surviving_forward_hold_shoulder",
        parent,
        0.13,
    )

    if lod < 2:
        # The port service face survives intact.  The starboard door stops well aft
        # of the shared rupture, so the damage remains one coherent event.
        box(
            "FreightDoorPort",
            (13.80, 0.44, 3.20),
            (-11.65, -5.76, 0.42),
            (0.0, 0.0, 0.0),
            mats["Material_Armor"],
            lod,
            "surviving_freight_access_face",
            parent,
            0.055,
        )
        box(
            "FreightDoorStarboardAft",
            (8.40, 0.44, 3.20),
            (-14.10, 5.76, 0.42),
            (0.0, 0.0, 0.0),
            mats["Material_Armor"],
            lod,
            "rupture_truncated_freight_access_face",
            parent,
            0.055,
        )

    # One rooted drill-service gantry establishes the tender role at silhouette
    # scale.  Its feet overlap the hold shoulder/collar and its crossbeam is a single
    # structural load path rather than a floating decorative frame.
    beam(
        "DrillServiceGantryPort",
        (-15.90, -5.15, 1.65),
        (-12.55, -5.15, 5.62),
        0.48 if lod < 2 else 0.64,
        mats["Material_Structural"],
        lod,
        "rooted_drill_service_gantry",
        parent,
        0.055,
    )
    beam(
        "DrillServiceGantryStarboard",
        (-15.90, 5.15, 1.65),
        (-12.55, 5.15, 5.62),
        0.48 if lod < 2 else 0.64,
        mats["Material_Structural"],
        lod,
        "rooted_drill_service_gantry",
        parent,
        0.055,
    )
    beam(
        "DrillServiceGantryCrossbeam",
        (-12.55, -5.15, 5.62),
        (-12.55, 5.15, 5.62),
        0.52 if lod < 2 else 0.70,
        mats["Material_Armor"],
        lod,
        "drill_service_crossbeam",
        parent,
        0.06,
    )


def build_load_path(lod: int, mats, parent) -> None:
    box(
        "CentralKeelAft",
        (20.00, 1.30, 1.30),
        (-13.20, 0.0, -3.35),
        (0.0, 0.0, 0.0),
        mats["Material_Structural"],
        lod,
        "continuous_primary_keel",
        parent,
        0.12,
    )
    box(
        "CentralKeelMid",
        (11.50, 1.24, 1.22),
        (2.55, 0.0, -3.14),
        (0.0, 0.0, 0.0),
        mats["Material_Structural"],
        lod,
        "continuous_primary_keel",
        parent,
        0.11,
    )
    box(
        "CentralKeelForward",
        (12.80, 1.12, 1.10),
        (14.70, 0.0, -2.82),
        (0.0, 0.0, 0.0),
        mats["Material_Structural"],
        lod,
        "tapered_forward_primary_keel",
        parent,
        0.10,
    )
    box(
        "PortLongeronAft",
        (24.00, 0.72, 0.72),
        (-11.00, -3.65, -1.35),
        (0.0, 0.0, 0.0),
        mats["Material_Structural"],
        lod,
        "continuous_port_longeron",
        parent,
        0.08,
    )
    box(
        "PortLongeronForward",
        (18.00, 0.66, 0.66),
        (10.00, -3.20, -1.10),
        (0.0, 0.0, 0.0),
        mats["Material_Structural"],
        lod,
        "tapered_port_longeron",
        parent,
        0.075,
    )
    box(
        "DorsalSpine",
        (38.00, 0.70, 0.70),
        (-1.00, -0.65, 3.25),
        (0.0, 0.0, 0.0),
        mats["Material_Structural"],
        lod,
        "surviving_dorsal_spine",
        parent,
        0.08,
    )
    # Starboard longeron is visibly severed by the same event as the shell opening.
    box(
        "StarboardLongeronAft",
        (19.50, 0.72, 0.72),
        (-14.10, 3.65, -1.35),
        (0.0, 0.0, 0.0),
        mats["Material_Structural"],
        lod,
        "severed_starboard_longeron",
        parent,
        0.08,
    )
    box(
        "StarboardLongeronForward",
        (12.00, 0.66, 0.66),
        (14.00, 3.05, -1.05),
        (0.0, 0.0, 0.0),
        mats["Material_Structural"],
        lod,
        "severed_starboard_longeron",
        parent,
        0.08,
    )

    intact_frames = (-19.0, -11.0, 10.5, 18.5)
    for index, x in enumerate(intact_frames):
        build_bulkhead(
            f"IntactBulkhead_{index}",
            x,
            4.05 if x < 15 else 3.20,
            3.55 if x < 15 else 3.10,
            mats["Material_Structural"],
            lod,
            parent,
            False,
        )


def build_rupture(lod: int, mats, parent) -> None:
    frame_positions = (-3.65, -1.15, 1.35, 3.85, 6.65)
    if lod == 1:
        frame_positions = (-3.65, 1.35, 6.65)
    elif lod == 2:
        frame_positions = (-3.65, 6.65)
    for index, x in enumerate(frame_positions):
        if index == len(frame_positions) // 2:
            # The blast folded this frame toward the opening; retain only two rooted
            # fragments so the wound cannot read as a pristine service bay.
            beam(
                f"RuptureBulkheadBrokenPort_{index}",
                (x - 0.25, -3.80, -3.15),
                (x + 0.55, -3.65, 2.15),
                0.40 if lod < 2 else 0.58,
                mats["Material_Structural"],
                lod,
                "blast_folded_bulkhead_fragment",
                parent,
                0.045,
            )
            beam(
                f"RuptureBulkheadBrokenDorsal_{index}",
                (x + 0.55, -3.65, 2.15),
                (x + 1.10, 0.65, 4.15),
                0.38 if lod < 2 else 0.56,
                mats["Material_Structural"],
                lod,
                "blast_folded_bulkhead_fragment",
                parent,
                0.045,
            )
            continue
        build_bulkhead(
            f"RuptureBulkhead_{index}",
            x,
            3.80,
            3.30,
            mats["Material_Structural"],
            lod,
            parent,
            True,
        )

    # Two nested, rooted layers make the 11.4 m wound causal and readable.  The
    # free edges curl in one shared starboard/dorsal direction.
    peel_sheet(
        "RuptureOuterSkin",
        RUPTURE_X[0] + 0.20,
        RUPTURE_X[1] - 0.15,
        3.78,
        1.25,
        6.20,
        5.45,
        0.16,
        mats["Material_Hull"],
        lod,
        "rooted_starboard_rupture_skin",
        parent,
    )
    if lod < 2:
        peel_sheet(
            "RuptureInsulation",
            RUPTURE_X[0] + 0.55,
            RUPTURE_X[1] - 0.50,
            3.55,
            0.95,
            5.15,
            4.20,
            0.22,
            mats["Material_Insulation"],
            lod,
            "rooted_rupture_insulation",
            parent,
        )
        peel_sheet(
            "RuptureInnerLiner",
            RUPTURE_X[0] + 0.85,
            RUPTURE_X[1] - 0.80,
            3.32,
            0.70,
            4.72,
            3.78,
            0.13,
            mats["Material_Armor"],
            lod,
            "rooted_rupture_inner_liner",
            parent,
        )

    beam(
        "RuptureLipDorsal",
        (RUPTURE_X[0], 3.55, 3.25),
        (RUPTURE_X[1], 4.80, 4.15),
        0.42 if lod < 2 else 0.60,
        mats["Material_Heat"],
        lod,
        "heat_affected_rupture_lip",
        parent,
        0.05,
    )
    beam(
        "RuptureLipVentral",
        (RUPTURE_X[0], 4.00, -1.30),
        (RUPTURE_X[1], 4.75, 0.15),
        0.40 if lod < 2 else 0.58,
        mats["Material_Heat"],
        lod,
        "heat_affected_rupture_lip",
        parent,
        0.05,
    )
    beam(
        "RuptureDiagonal",
        (-3.20, 3.15, -2.30),
        (6.90, 4.55, 3.55),
        0.38 if lod < 2 else 0.54,
        mats["Material_Structural"],
        lod,
        "exposed_rooted_hold_brace",
        parent,
        0.05,
    )

    if lod < 2:
        beam(
            "ServiceTrunkRoot",
            (-10.50, 2.72, 1.42),
            (-2.70, 2.88, 1.55),
            0.28,
            mats["Material_Service"],
            lod,
            "rooted_service_trunk",
            parent,
            0.032,
        )
        beam(
            "ServiceTrunkSevered",
            (-2.70, 2.88, 1.55),
            (3.35, 5.70, 3.05),
            0.26,
            mats["Material_Service"],
            lod,
            "severed_service_trunk",
            parent,
            0.030,
        )
        if lod == 0:
            beam(
                "ServiceTrunkLooseEnd",
                (4.80, 3.10, 0.15),
                (6.45, 5.45, -0.75),
                0.23,
                mats["Material_Service"],
                lod,
                "severed_service_trunk_end",
                parent,
                0.028,
            )


def build_lod(lod: int, mats, root) -> None:
    parent = lod_group(lod, root)
    build_shell(lod, mats["Material_Hull"], parent)
    build_hold_mass(lod, mats, parent)
    build_load_path(lod, mats, parent)
    build_drive_mass(lod, mats, parent)
    build_command_house(lod, mats, parent)
    build_rupture(lod, mats, parent)

    if lod < 2:
        # Hold coamings overlap shell, bulkheads and keel: they describe a real load
        # volume rather than free cargo boxes.
        for index, x in enumerate((-14.0, -9.0)):
            box(
                f"HoldCoaming_{index}",
                (4.30, 6.60, 0.42),
                (x, 0.0, 3.60),
                (0.0, 0.0, 0.0),
                mats["Material_Hull"],
                lod,
                "integrated_hold_coaming",
                parent,
                0.07,
            )
        box(
            "DrillTenderRailPort",
            (19.0, 0.38, 0.48),
            (-9.0, -4.15, 2.35),
            (0.0, 0.0, 0.0),
            mats["Material_Armor"],
            lod,
            "commercial_drill_tender_service_rail",
            parent,
            0.05,
        )
        box(
            "DrillTenderRailStarboard",
            (12.5, 0.38, 0.48),
            (-13.0, 4.15, 2.35),
            (0.0, 0.0, 0.0),
            mats["Material_Armor"],
            lod,
            "severed_drill_tender_service_rail",
            parent,
            0.05,
        )


def add_markers(root) -> None:
    for name, row in MARKERS.items():
        marker = make_empty(name, root, row["location"])
        marker.empty_display_type = "CUBE" if row["kind"] == "socket" else "SPHERE"
        marker.empty_display_size = 0.78 if row["kind"] == "socket" else 0.55
        marker["spaceface.kind"] = row["kind"]
        marker["role"] = row["role"]
        marker["forward"] = [1.0, 0.0, 0.0]
        marker["up"] = [0.0, 0.0, 1.0]


def apply_modifiers() -> list[str]:
    failures = []
    for obj in sorted(
        (candidate for candidate in bpy.data.objects if candidate.type == "MESH"),
        key=lambda candidate: candidate.name,
    ):
        bpy.ops.object.select_all(action="DESELECT")
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        for modifier in list(obj.modifiers):
            try:
                bpy.ops.object.modifier_apply(modifier=modifier.name)
            except Exception as exc:  # Blender context failures belong in the report.
                failures.append(f"{obj.name}/{modifier.name}: {exc}")
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        obj.data.validate(clean_customdata=False)
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
        obj.select_set(False)
    return failures


def join_draw_groups(materials, root) -> None:
    for lod in range(3):
        lod_parent = bpy.data.objects.get(f"LOD{lod}_{ASSET_ID}")
        for material_name, material_value in materials.items():
            matches = sorted(
                (
                    obj
                    for obj in bpy.data.objects
                    if obj.type == "MESH"
                    and obj.parent == lod_parent
                    and obj.data.materials
                    and obj.data.materials[0] == material_value
                ),
                key=lambda obj: obj.name,
            )
            if not matches:
                continue
            component_roles = sorted(
                {
                    str(obj.get("spaceface.structureRole", "unspecified"))
                    for obj in matches
                }
            )
            bpy.ops.object.select_all(action="DESELECT")
            for obj in matches:
                obj.select_set(True)
            bpy.context.view_layer.objects.active = matches[0]
            if len(matches) > 1:
                bpy.ops.object.join()
            joined = bpy.context.object
            joined.name = f"LOD{lod}_Hulk_{material_name}"
            joined.parent = lod_parent
            joined["spaceface.lod"] = f"lod{lod}"
            joined["spaceface.lodLevel"] = lod
            joined["spaceface.materialRole"] = material_name
            joined["spaceface.structureRole"] = "merged_functional_draw_group"
            joined["spaceface.componentRolesJson"] = json.dumps(component_roles)
            modifier = joined.modifiers.new("SF_ExportTriangulate", "TRIANGULATE")
            modifier.keep_custom_normals = True
            bpy.ops.object.modifier_apply(modifier=modifier.name)
            joined.select_set(False)


def unwrap_draw_groups() -> list[str]:
    failures = []
    for obj in sorted(
        (candidate for candidate in bpy.data.objects if candidate.type == "MESH"),
        key=lambda candidate: candidate.name,
    ):
        bpy.ops.object.select_all(action="DESELECT")
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        if not obj.data.uv_layers:
            obj.data.uv_layers.new(name="UVMap")
        try:
            bpy.ops.object.mode_set(mode="EDIT")
            bpy.ops.mesh.select_all(action="SELECT")
            bpy.ops.uv.smart_project(
                angle_limit=math.radians(57.0),
                island_margin=0.018,
            )
            bpy.ops.object.mode_set(mode="OBJECT")
        except Exception as exc:
            failures.append(f"{obj.name}/UV: {exc}")
            if obj.mode != "OBJECT":
                bpy.ops.object.mode_set(mode="OBJECT")
        obj.select_set(False)
    return failures


def tangent_results() -> list[dict]:
    rows = []
    for obj in sorted(
        (candidate for candidate in bpy.data.objects if candidate.type == "MESH"),
        key=lambda candidate: candidate.name,
    ):
        mesh = obj.data
        mesh.calc_loop_triangles()
        valid = False
        error = None
        try:
            mesh.calc_tangents(uvmap=mesh.uv_layers[0].name)
            lengths = [loop.tangent.length for loop in mesh.loops]
            valid = bool(lengths) and min(lengths) > 0.985 and max(lengths) < 1.015
        except Exception as exc:
            error = str(exc)
        finally:
            try:
                mesh.free_tangents()
            except Exception:
                pass
        rows.append(
            {
                "object": obj.name,
                "lod": obj.get("spaceface.lod"),
                "valid": valid,
                "error": error,
                "loops": len(mesh.loops),
            }
        )
    return rows


def mesh_triangles(obj) -> int:
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


def scene_bounds(objects: Iterable) -> dict:
    points = [
        obj.matrix_world @ Vector(corner)
        for obj in objects
        for corner in obj.bound_box
    ]
    low = [min(point[axis] for point in points) for axis in range(3)]
    high = [max(point[axis] for point in points) for axis in range(3)]
    size = [high[index] - low[index] for index in range(3)]
    return {
        "min": [round(value, 6) for value in low],
        "max": [round(value, 6) for value in high],
        "size": [round(value, 6) for value in size],
    }


def envelope_failures(bounds: dict) -> list[str]:
    failures = []
    for axis, measured, expected, tolerance in zip(
        ("X", "Y", "Z"),
        bounds["size"],
        TARGET_ENVELOPE,
        ENVELOPE_TOLERANCE,
    ):
        if abs(measured - expected) > tolerance:
            failures.append(
                f"{axis} envelope {measured:.4f} outside {expected:.4f} +/- {tolerance:.4f}"
            )
    center = [
        (bounds["min"][index] + bounds["max"][index]) * 0.5 for index in range(3)
    ]
    if abs(center[0]) > 0.40 or abs(center[1]) > 0.40 or abs(center[2]) > 0.75:
        failures.append(f"mesh envelope not centered around root: {center}")
    return failures


def descendants(root):
    values = []
    for obj in bpy.data.objects:
        cursor = obj
        while cursor is not None:
            if cursor == root:
                values.append(obj)
                break
            cursor = cursor.parent
    return values


def export_glb(target: Path, root) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    owned = descendants(root)
    for obj in owned:
        if obj.type not in {"LIGHT", "CAMERA"}:
            obj.select_set(True)
    bpy.context.view_layer.objects.active = root
    target.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(target),
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_extras=True,
        export_texcoords=True,
        export_normals=True,
        export_tangents=True,
        export_materials="EXPORT",
    )
    bpy.ops.object.select_all(action="DESELECT")


def blender_to_gltf_translation(value) -> list[float]:
    x, y, z = value
    return [x, z, -y]


def stamp_and_validate_glb_contract(target: Path, contract: dict) -> None:
    data = target.read_bytes()
    magic, version, _total = struct.unpack_from("<III", data, 0)
    if magic != 0x46546C67 or version != 2:
        raise RuntimeError(f"not a GLB2 export: {target}")

    chunks = []
    json_chunk_index = None
    gltf = None
    cursor = 12
    while cursor < len(data):
        length, chunk_type = struct.unpack_from("<II", data, cursor)
        payload = data[cursor + 8 : cursor + 8 + length]
        if chunk_type == 0x4E4F534A:
            gltf = json.loads(payload.rstrip(b" \0").decode("utf-8"))
            json_chunk_index = len(chunks)
        chunks.append((chunk_type, payload))
        cursor += 8 + length
    if gltf is None or json_chunk_index is None:
        raise RuntimeError(f"missing GLB JSON chunk: {target}")

    nodes = gltf.get("nodes", [])
    root_node = next((node for node in nodes if node.get("name") == ROOT_NAME), None)
    if root_node is None:
        raise RuntimeError(f"export lost root node {ROOT_NAME}")
    for marker_name, marker in MARKERS.items():
        node = next((candidate for candidate in nodes if candidate.get("name") == marker_name), None)
        if node is None:
            raise RuntimeError(f"export lost marker {marker_name}")
        expected = blender_to_gltf_translation(marker["location"])
        actual = node.get("translation", [0.0, 0.0, 0.0])
        if any(abs(float(actual[index]) - expected[index]) > 1e-5 for index in range(3)):
            raise RuntimeError(f"{marker_name} translation drifted: {actual} != {expected}")
        if node.get("extras", {}).get("role") != marker["role"]:
            raise RuntimeError(f"{marker_name} lost role {marker['role']}")

    asset_extras = gltf.setdefault("asset", {}).setdefault("extras", {})
    asset_extras.update(
        {
            "assetId": ASSET_ID,
            "partId": ASSET_ID,
            "category": contract["category"],
            "priority": contract["priority"],
            "triangleCount": contract["triangleCount"],
            "textureSize": contract["textureSize"],
            "forwardAxis": contract["forward"],
            "upAxis": contract["up"],
            "starboardAxis": contract["starboard"],
            "unit": contract["unit"],
            "boundsDimensionsM": contract["boundsDimensionsM"],
            "sourceProvenance": contract["sourceProvenance"],
            "spacefaceAsset": contract,
        }
    )
    scene = gltf["scenes"][gltf.get("scene", 0)]
    scene_extras = scene.setdefault("extras", {})
    scene_extras.pop("spacefaceAssetJson", None)
    scene_extras.update(
        {"assetId": ASSET_ID, "partId": ASSET_ID, "spacefaceAsset": contract}
    )
    root_extras = root_node.setdefault("extras", {})
    root_extras.pop("spacefaceAssetJson", None)
    root_extras.update(
        {"assetId": ASSET_ID, "partId": ASSET_ID, "spacefaceAsset": contract}
    )

    json_payload = json.dumps(
        gltf, separators=(",", ":"), ensure_ascii=False
    ).encode("utf-8")
    json_payload += b" " * ((4 - len(json_payload) % 4) % 4)
    chunks[json_chunk_index] = (0x4E4F534A, json_payload)
    body = b"".join(
        struct.pack("<II", len(payload), chunk_type) + payload
        for chunk_type, payload in chunks
    )
    target.write_bytes(
        struct.pack("<III", 0x46546C67, 2, 12 + len(body)) + body
    )


def setup_scene() -> None:
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    scene.render.engine = "BLENDER_EEVEE"
    scene["spaceface.assetId"] = ASSET_ID
    scene["spaceface.sourceRevision"] = SOURCE_REVISION
    scene["spaceface.forwardAxis"] = FORWARD_AXIS
    scene["spaceface.upAxis"] = UP_AXIS
    scene["spaceface.beamAxis"] = BEAM_AXIS


def main() -> None:
    args = cli()
    args.output_blend.parent.mkdir(parents=True, exist_ok=True)
    args.output_glb.parent.mkdir(parents=True, exist_ok=True)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    clear_scene()
    setup_scene()

    root = make_empty(ROOT_NAME)
    root["spaceface.assetId"] = ASSET_ID
    root["spaceface.partId"] = ASSET_ID
    root["spaceface.sourceRevision"] = SOURCE_REVISION
    root["spaceface.forwardAxis"] = FORWARD_AXIS
    root["spaceface.upAxis"] = UP_AXIS
    root["spaceface.beamAxis"] = BEAM_AXIS
    root["spaceface.pivotContract"] = "centered identity root"
    root["spaceface.damageContract"] = (
        "single 11.4m starboard-dorsal rupture with rooted internal structure"
    )

    materials = {
        name: material(name, role, args.maps_root)
        for name, role in ROLE_BY_MATERIAL.items()
    }
    for lod in range(3):
        build_lod(lod, materials, root)
    add_markers(root)

    modifier_failures = apply_modifiers()
    join_draw_groups(materials, root)
    uv_failures = unwrap_draw_groups()
    tangents = tangent_results()
    tangent_failures = [
        row["object"] for row in tangents if row["valid"] is not True
    ]

    mesh_objects = sorted(
        (obj for obj in descendants(root) if obj.type == "MESH"),
        key=lambda obj: obj.name,
    )
    lod_rows = {}
    for lod in range(3):
        members = [
            obj for obj in mesh_objects if obj.get("spaceface.lodLevel") == lod
        ]
        lod_rows[f"lod{lod}"] = {
            "objects": len(members),
            "triangles": sum(mesh_triangles(obj) for obj in members),
            "materials": sorted(
                {
                    slot.material.name
                    for obj in members
                    for slot in obj.material_slots
                    if slot.material is not None
                }
            ),
        }
    if not (
        lod_rows["lod0"]["triangles"]
        > lod_rows["lod1"]["triangles"]
        > lod_rows["lod2"]["triangles"]
        > 0
    ):
        raise RuntimeError(f"LOD triangle ordering failed: {lod_rows}")

    lod0_members = [
        obj for obj in mesh_objects if obj.get("spaceface.lodLevel") == 0
    ]
    measured_bounds = scene_bounds(lod0_members)
    all_lod_bounds = scene_bounds(mesh_objects)
    bounds_failures = envelope_failures(measured_bounds)
    failures = modifier_failures + uv_failures + tangent_failures + bounds_failures
    if failures:
        raise RuntimeError("hulk source contract failed: " + " | ".join(failures))

    contract = {
        "contractVersion": 1,
        "schemaVersion": 1,
        "assetId": ASSET_ID,
        "partId": ASSET_ID,
        "liveId": ASSET_ID,
        "slot": "place",
        "category": "places",
        "priority": "P0",
        "sourceRevision": SOURCE_REVISION,
        "sourceFormat": "BLEND",
        # Blender exports +Z-up to glTF +Y-up. Keep the embedded production
        # contract in glTF/runtime axes; the Blender authoring axes remain below.
        "forward": "+X",
        "up": "+Y",
        "starboard": "+Z",
        "unit": "metre",
        "normalConvention": "OpenGL",
        "ormChannels": "R=AO,G=Roughness,B=Metallic",
        "textureCompression": "PNG-source",
        "textureSize": 512,
        "triangleCount": sum(row["triangles"] for row in lod_rows.values()),
        "boundsDimensionsM": [
            all_lod_bounds["size"][0],
            all_lod_bounds["size"][2],
            all_lod_bounds["size"][1],
        ],
        "sourceProvenance": {
            "textureRoleContractVersion": 1,
            "textureRoleMode": "bound-base-normal-orm",
            "sourceBlend": "assets/ships/parts/blender/place_dead_hulk_authored.blend",
            "geometryPipeline": "tools/blender/remaster_opening_dead_hulk_v1.py",
            "texturePipeline": "tools/art/build_opening_infrastructure_maps.py",
            "packedEditableTextures": True,
        },
        "coordinateSystem": {
            "forward": FORWARD_AXIS,
            "up": UP_AXIS,
            "beam": BEAM_AXIS,
        },
        "pivot": {"mode": "centered", "translation": [0.0, 0.0, 0.0]},
        "boundsBlender": measured_bounds,
        "targetEnvelope": list(TARGET_ENVELOPE),
        "damage": {
            "kind": "starboard-dorsal rupture",
            "xRangeM": list(RUPTURE_X),
            "spanM": round(RUPTURE_X[1] - RUPTURE_X[0], 3),
            "rootedLayers": [
                "outer skin",
                "insulation",
                "inner liner",
                "bulkheads",
                "service trunks",
            ],
        },
        "lods": lod_rows,
        # The historical generic wreck exposed HOOK_Emissive, but the production
        # asset contract does not define that as a valid place hook. The authored
        # heat surfaces are ordinary materials, not a fake drive/damage marker.
        "hooks": [],
        "sockets": ["SOCKET_Hazard_Core", "SOCKET_Salvage_Core"],
        "materialRoles": ROLE_BY_MATERIAL,
        "deliverableRole": "production_source_checkpoint",
        "wiringStatus": "source_checkpoint_release_pending",
    }
    root["spacefaceAssetJson"] = json.dumps(contract, separators=(",", ":"))
    bpy.context.scene["spacefaceAssetJson"] = root["spacefaceAssetJson"]

    bpy.ops.wm.save_as_mainfile(filepath=str(args.output_blend.resolve()))
    export_glb(args.output_glb.resolve(), root)
    stamp_and_validate_glb_contract(args.output_glb.resolve(), contract)

    report = {
        "schema": "spaceface.opening-dead-hulk-source-report.v1",
        "assetId": ASSET_ID,
        "sourceRevision": SOURCE_REVISION,
        "pass": True,
        "outputs": {
            "blend": {
                "path": str(args.output_blend.resolve()),
                "bytes": args.output_blend.stat().st_size,
                "sha256": sha256(args.output_blend),
            },
            "glb": {
                "path": str(args.output_glb.resolve()),
                "bytes": args.output_glb.stat().st_size,
                "sha256": sha256(args.output_glb),
            },
        },
        "mapsRoot": str(args.maps_root.resolve()),
        "bounds": measured_bounds,
        "allLodBounds": all_lod_bounds,
        "targetEnvelope": list(TARGET_ENVELOPE),
        "ruptureSpanM": round(RUPTURE_X[1] - RUPTURE_X[0], 3),
        "lods": lod_rows,
        "markers": MARKERS,
        "materialRoles": ROLE_BY_MATERIAL,
        "tangents": tangents,
        "failures": [],
        "acceptance": {
            "offlineVisualReview": "required",
            "sourceGlbValidation": "required",
            "releaseBuild": "not performed by this builder",
            "browserElectron": "not performed by this builder",
        },
    }
    args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
