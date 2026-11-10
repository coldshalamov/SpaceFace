#!/usr/bin/env python3
"""Author the SpaceFace station/gate visual family in Blender.

The script intentionally creates the seven non-hub archetypes as a coherent family while
giving every function a silhouette that reads without a label.  It writes canonical authoring
.blend files and source GLBs; release publication remains the transactional SG04 build's job.

Run:
  blender --background --python tools/blender/build_station_visual_family.py
  blender --background --python tools/blender/build_station_visual_family.py -- --only place_station_refinery
"""
from __future__ import annotations

import argparse
import json
import math
import os
import sys
import time
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
PARTS = ROOT / "assets" / "ships" / "parts"
OUT = PARTS / "places"
BLENDS = PARTS / "blender"
TEXTURES = ROOT / "assets" / "ships" / "m4_helios_hub" / "textures"
EVIDENCE = ROOT / "assets" / "ships" / "m4_station_family" / "evidence"
PACKET = "M4-STATION-VISUAL-FAMILY-001"
FAMILY = "helios_industrial_station_family"

IDS = (
    "place_gate_jump_ring",
    "place_station_refinery",
    "place_station_military",
    "place_station_blackmarket",
    "place_station_fab",
    "place_station_mining",
    "place_station_research",
)

ROLE = {
    "place_gate_jump_ring": ("jump_gate_landmark", "Helios Massline Gate"),
    "place_station_refinery": ("industrial_refinery", "Refinery Crown"),
    "place_station_military": ("armored_bastion", "Coalition Bastion"),
    "place_station_blackmarket": ("contraband_warren", "Black-Market Warren"),
    "place_station_fab": ("fabrication_drydock", "Orbital Fabrication Yard"),
    "place_station_mining": ("ore_processing_rig", "Belt Mining Rig"),
    "place_station_research": ("research_observatory", "Deep-Space Research Array"),
}


def log(msg: str) -> None:
    print(f"[station-family] {msg}", flush=True)


def reset_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.images):
        # Materials/images are rebuilt per file to keep the .blend self-contained.
        for item in list(datablocks):
            try:
                datablocks.remove(item)
            except Exception:
                pass


def collection(name: str):
    col = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(col)
    return col


def move_to(obj, col) -> None:
    for old in list(obj.users_collection):
        old.objects.unlink(obj)
    col.objects.link(obj)


def load_image(name: str, colorspace: str):
    path = TEXTURES / name
    image = bpy.data.images.load(str(path), check_existing=True)
    image.colorspace_settings.name = colorspace
    image.pack()
    return image


def textured_material(name: str, texture_role: str, tint, metal: float, rough: float, emission=None):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = (*tint, 1.0)
    bsdf.inputs["Metallic"].default_value = metal
    bsdf.inputs["Roughness"].default_value = rough
    if emission:
        bsdf.inputs["Emission Color"].default_value = (*emission[0], 1.0)
        bsdf.inputs["Emission Strength"].default_value = emission[1]
    base = nodes.new("ShaderNodeTexImage")
    base.image = load_image(f"{texture_role}_basecolor.png", "sRGB")
    base.name = f"{name}_BaseColor"
    links.new(base.outputs["Color"], bsdf.inputs["Base Color"])
    orm = nodes.new("ShaderNodeTexImage")
    orm.image = load_image(f"{texture_role}_orm.png", "Non-Color")
    orm.name = f"{name}_ORM"
    sep = nodes.new("ShaderNodeSeparateColor")
    links.new(orm.outputs["Color"], sep.inputs["Color"])
    links.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
    links.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])
    # Blender's glTF exporter recognizes this exact group as the packed AO binding.  Keeping
    # the red channel on the same image as roughness/metallic produces one true ORM texture.
    group = bpy.data.node_groups.get("glTF Material Output")
    if group is None:
        group = bpy.data.node_groups.new("glTF Material Output", "ShaderNodeTree")
        group.interface.new_socket(name="Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")
    gltf_output = nodes.new("ShaderNodeGroup")
    gltf_output.node_tree = group
    links.new(sep.outputs["Red"], gltf_output.inputs["Occlusion"])
    normal = nodes.new("ShaderNodeTexImage")
    normal.image = load_image(f"{texture_role}_normal.png", "Non-Color")
    normal.name = f"{name}_Normal"
    nmap = nodes.new("ShaderNodeNormalMap")
    nmap.inputs["Strength"].default_value = 0.55
    links.new(normal.outputs["Color"], nmap.inputs["Color"])
    links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    mat["spaceface.semantic"] = name
    mat["spaceface.textureRole"] = texture_role
    return mat


def create_materials(asset_id: str):
    # Shared PBR atlases and semantic slots are the family language. Accent hue is the only
    # per-role shift; world palette tinting can still override it at runtime.
    accent = {
        "place_gate_jump_ring": ((0.34, 0.18, 0.92), (0.18, 0.08, 0.65), 2.3),
        "place_station_refinery": ((0.95, 0.36, 0.06), (0.85, 0.16, 0.02), 1.6),
        "place_station_military": ((0.18, 0.55, 0.82), (0.04, 0.34, 0.72), 1.4),
        "place_station_blackmarket": ((0.50, 0.16, 0.78), (0.36, 0.05, 0.64), 1.7),
        "place_station_fab": ((0.98, 0.48, 0.08), (0.86, 0.23, 0.02), 1.8),
        "place_station_mining": ((0.94, 0.46, 0.08), (0.75, 0.21, 0.02), 1.4),
        "place_station_research": ((0.22, 0.78, 1.00), (0.05, 0.48, 0.88), 1.8),
    }[asset_id]
    return {
        "Material_Hull": textured_material("Material_Hull", "hull", (0.31, 0.36, 0.43), 0.63, 0.42),
        "Material_Mechanical": textured_material("Material_Mechanical", "mechanical", (0.16, 0.19, 0.23), 0.78, 0.48),
        "Material_Warm": textured_material("Material_Warm", "warm", (0.62, 0.29, 0.09), 0.55, 0.48),
        "Material_Accent": textured_material("Material_Accent", "accent", accent[0], 0.36, 0.28, (accent[1], accent[2])),
        "Material_Glass": textured_material("Material_Glass", "glass", (0.12, 0.42, 0.61), 0.18, 0.16, ((0.02, 0.18, 0.32), 0.7)),
    }


def tag(obj, lod: int, mat: str, role: str) -> None:
    obj["spaceface.lodLevel"] = lod
    obj["spaceface.chamfered"] = True
    obj["spaceface.materialRole"] = mat
    obj["spaceface.structureRole"] = role


def box(col, mats, lod, name, size, loc, mat="Material_Hull", bevel=0.28, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    obj = bpy.context.object
    obj.name = f"LOD{lod}_{name}"
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mats[mat])
    mod = obj.modifiers.new("SF_Chamfer", "BEVEL")
    mod.width = max(0.035, bevel * (1.0 if lod == 0 else 0.7 if lod == 1 else 0.45))
    mod.segments = 3 if lod == 0 else 2 if lod == 1 else 1
    mod.limit_method = "ANGLE"
    tag(obj, lod, mat, name)
    move_to(obj, col)
    return obj


def cyl(col, mats, lod, name, radius, depth, loc, mat="Material_Mechanical", vertices=None, rot=(0, 0, 0)):
    if vertices is None:
        vertices = 48 if lod == 0 else 28 if lod == 1 else 14
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, end_fill_type="NGON", location=loc, rotation=rot)
    obj = bpy.context.object
    obj.name = f"LOD{lod}_{name}"
    obj.data.materials.append(mats[mat])
    bevel = obj.modifiers.new("SF_Chamfer", "BEVEL")
    bevel.width = max(0.03, min(radius, depth) * (0.035 if lod == 0 else 0.02))
    bevel.segments = 3 if lod == 0 else 2 if lod == 1 else 1
    tag(obj, lod, mat, name)
    move_to(obj, col)
    return obj


def torus(col, mats, lod, name, major, minor, loc, mat="Material_Accent", rot=(0, 0, 0), segments=None):
    major_seg = segments or (96 if lod == 0 else 56 if lod == 1 else 28)
    minor_seg = 24 if lod == 0 else 14 if lod == 1 else 8
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor,
        major_segments=major_seg, minor_segments=minor_seg, location=loc, rotation=rot)
    obj = bpy.context.object
    obj.name = f"LOD{lod}_{name}"
    obj.data.materials.append(mats[mat])
    tag(obj, lod, mat, name)
    move_to(obj, col)
    return obj


def sphere(col, mats, lod, name, radius, loc, mat="Material_Hull", scale=(1, 1, 1)):
    seg = 64 if lod == 0 else 36 if lod == 1 else 20
    rings = 32 if lod == 0 else 18 if lod == 1 else 10
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=rings, radius=radius, location=loc)
    obj = bpy.context.object
    obj.name = f"LOD{lod}_{name}"
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mats[mat])
    tag(obj, lod, mat, name)
    move_to(obj, col)
    return obj


def wedge(col, mats, lod, name, length, height, width, loc, mat="Material_Hull", bevel=0.35, rot=(0, 0, 0)):
    """Triangular prism pointing along +X; useful for authored armored silhouettes."""
    lx = length * 0.5; hy = height * 0.5; wz = width * 0.5
    verts = [
        (-lx, -hy, -wz), (-lx, -hy, wz), (-lx, hy, -wz), (-lx, hy, wz),
        (lx, -hy, 0), (lx, hy, 0),
    ]
    faces = [
        (0, 4, 1), (2, 3, 5), (0, 2, 5, 4), (1, 4, 5, 3), (0, 1, 3, 2),
    ]
    mesh = bpy.data.meshes.new(f"{name}_mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(f"LOD{lod}_{name}", mesh)
    obj.location = loc
    obj.rotation_euler = rot
    obj.data.materials.append(mats[mat])
    col.objects.link(obj)
    mod = obj.modifiers.new("SF_Chamfer", "BEVEL")
    mod.width = max(0.04, bevel * (1.0 if lod == 0 else 0.7 if lod == 1 else 0.45))
    mod.segments = 3 if lod == 0 else 2 if lod == 1 else 1
    tag(obj, lod, mat, name)
    return obj


def ico(col, mats, lod, name, radius, loc, mat="Material_Hull", scale=(1, 1, 1), seed=0):
    subdivisions = 4 if lod == 0 else 3 if lod == 1 else 2
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdivisions, radius=radius, location=loc)
    obj = bpy.context.object
    obj.name = f"LOD{lod}_{name}"
    # Deterministic faceted distortion turns a generic sphere into welded rock/scrap mass.
    for i, v in enumerate(obj.data.vertices):
        phase = (i * 1.618 + seed * 0.713)
        f = 0.84 + 0.16 * math.sin(phase) * math.cos(phase * 0.37)
        v.co *= f
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mats[mat])
    tag(obj, lod, mat, name)
    move_to(obj, col)
    return obj


def beam_between(col, mats, lod, name, a, b, width, mat="Material_Mechanical"):
    a = Vector(a); b = Vector(b); delta = b - a
    mid = (a + b) * 0.5
    obj = box(col, mats, lod, name, (width, width, delta.length), mid, mat, width * 0.22)
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(delta.normalized())
    obj.rotation_mode = "XYZ"
    return obj


def radial_boxes(col, mats, lod, prefix, count, radius, size, y, mat, tangential=False):
    for i in range(count):
        a = math.tau * i / count
        rot_y = -a if tangential else 0
        box(col, mats, lod, f"{prefix}_{i:02d}", size,
            (radius * math.cos(a), y, radius * math.sin(a)), mat, min(size) * 0.12,
            (0, rot_y, 0))


def windows_strip(col, mats, lod, prefix, center, count, step, size, axis="x"):
    if lod == 2:
        count = max(2, count // 3)
        step *= 3
    for i in range(count):
        off = (i - (count - 1) * 0.5) * step
        loc = list(center)
        loc[0 if axis == "x" else 2] += off
        box(col, mats, lod, f"{prefix}_{i:02d}", size, loc, "Material_Glass", 0.04)


def build_gate(col, mats, lod):
    # Upright massline aperture in the YZ plane, with a clearly traversable center.
    detail = (1.0, 0.66, 0.38)[lod]
    for x, major, minor, mat in [(-1.8, 38, 2.2, "Material_Hull"), (1.8, 38, 2.2, "Material_Hull"), (0, 33.8, 0.75, "Material_Accent")]:
        torus(col, mats, lod, f"GateRing_{x:+.0f}", major, minor, (x, 0, 0), mat, (0, math.pi/2, 0))
    n = 24 if lod == 0 else 14 if lod == 1 else 8
    for i in range(n):
        a = math.tau * i / n
        y = 38 * math.cos(a); z = 38 * math.sin(a)
        box(col, mats, lod, f"GateArmor_{i:02d}", (6.2, 5.8, 2.6), (0, y, z),
            "Material_Mechanical" if i % 3 else "Material_Warm", 0.28, (a, 0, 0))
        if lod < 2:
            cyl(col, mats, lod, f"GateEmitter_{i:02d}", 0.7, 2.6, (-3.3, y, z), "Material_Accent", rot=(0, math.pi/2, 0))
    for side in (-1, 1):
        z = side * 32
        box(col, mats, lod, f"GatePylon_{side}", (14, 30, 10), (0, -16, z), "Material_Hull", 0.65)
        box(col, mats, lod, f"GateFoot_{side}", (20, 7, 15), (0, -31, z), "Material_Mechanical", 0.45)
        for j in range(4 if lod < 2 else 2):
            box(col, mats, lod, f"GatePylonBand_{side}_{j}", (14.8, 1.0, 10.8), (0, -26 + j * 7, z), "Material_Warm", 0.12)
    # Control deck anchors the silhouette without filling the aperture.
    box(col, mats, lod, "GateControlDeck", (18, 8, 17), (0, -37, 0), "Material_Hull", 0.6)
    windows_strip(col, mats, lod, "GateControlWindow", (9.2, -35, 0), 7, 2.0, (0.28, 1.1, 1.3), "z")
    for side in (-1, 1):
        beam_between(col, mats, lod, f"GateBrace_{side}", (0, -30, side * 7), (0, -20, side * 27), 1.0 * detail, "Material_Mechanical")


def build_refinery(col, mats, lod):
    # Long process spine, stacked cracking towers and tank farm.
    box(col, mats, lod, "RefinerySpine", (78, 7, 15), (0, 0, 0), "Material_Hull", 0.8)
    box(col, mats, lod, "RefineryTruss", (70, 3.5, 25), (0, -4, 0), "Material_Mechanical", 0.38)
    stack_count = 5 if lod == 0 else 4 if lod == 1 else 3
    for i in range(stack_count):
        x = -28 + i * (56 / max(1, stack_count - 1))
        h = 28 + (i % 3) * 7
        cyl(col, mats, lod, f"Cracker_{i}", 4.5, h, (x, 12 + h/2, -4), "Material_Mechanical")
        torus(col, mats, lod, f"CrackerBand_{i}", 4.7, 0.42, (x, 14 + h*0.28, -4), "Material_Warm")
        torus(col, mats, lod, f"CrackerBandTop_{i}", 4.7, 0.42, (x, 9 + h*0.68, -4), "Material_Warm")
        cyl(col, mats, lod, f"Flare_{i}", 1.1, 7, (x, 15 + h, -4), "Material_Accent")
    tanks = 8 if lod == 0 else 5 if lod == 1 else 3
    for i in range(tanks):
        x = -30 + (i % 4) * 20
        z = 13 + (i // 4) * 11
        cyl(col, mats, lod, f"Tank_{i}", 5.2, 13, (x, 7, z), "Material_Hull", rot=(0, 0, math.pi/2))
        torus(col, mats, lod, f"TankBand_{i}", 5.35, 0.35, (x-4, 7, z), "Material_Mechanical", rot=(0, math.pi/2, 0))
        if lod < 2:
            torus(col, mats, lod, f"TankBandB_{i}", 5.35, 0.35, (x+4, 7, z), "Material_Mechanical", rot=(0, math.pi/2, 0))
    pipes = 8 if lod == 0 else 4 if lod == 1 else 2
    for i in range(pipes):
        z = -12 + i * 3.4
        cyl(col, mats, lod, f"PipeRun_{i}", 0.55 + (i % 2)*0.18, 73, (0, 4 + i%3, z), "Material_Warm", rot=(0, math.pi/2, 0))
    box(col, mats, lod, "RefineryDock", (22, 5, 22), (48, -1, 0), "Material_Hull", 0.55)
    windows_strip(col, mats, lod, "RefineryControl", (48, 2, 11.2), 8, 2.1, (1.2, 0.7, 0.28), "x")


def build_military(col, mats, lod):
    # Compact armored arrowhead with a readable central hangar mouth.
    wedge(col, mats, lod, "BastionCore", 76, 20, 46, (-4, 0, 0), "Material_Hull", 1.1)
    wedge(col, mats, lod, "BastionTopArmor", 60, 6, 37, (-9, 12.5, 0), "Material_Mechanical", 0.7)
    for side in (-1, 1):
        wedge(col, mats, lod, f"ArmorWing_{side}", 52, 9, 18, (-17, -4, side*27), "Material_Hull", 0.8,
            (0, side*0.10, 0))
        box(col, mats, lod, f"Bastion_{side}", (16, 30, 16), (-20, 5, side*20), "Material_Mechanical", 0.65)
        box(col, mats, lod, f"HangarJaw_{side}", (25, 5, 8), (18, -2, side*10), "Material_Warm", 0.35)
    box(col, mats, lod, "HangarVoid", (1.2, 9, 17), (30.8, -2, 0), "Material_Glass", 0.18)
    turret_count = 10 if lod == 0 else 6 if lod == 1 else 3
    for i in range(turret_count):
        side = -1 if i % 2 else 1
        x = -17 + (i % 3)*14
        z = side * (9 + (i % 3)*7)
        cyl(col, mats, lod, f"TurretBase_{i}", 2.0, 2.2, (x, 12, z), "Material_Mechanical")
        cyl(col, mats, lod, f"TurretBarrel_{i}", 0.48, 8, (x, 15.7, z), "Material_Accent", rot=(math.pi/2, 0, 0))
    torus(col, mats, lod, "SensorCrown", 8, 0.65, (0, 16, -3), "Material_Accent", rot=(math.pi/2, 0, 0))
    cyl(col, mats, lod, "SensorMast", 1.6, 18, (0, 22, -3), "Material_Mechanical")
    panel_rows = 5 if lod == 0 else 3 if lod == 1 else 2
    for row in range(panel_rows):
        x = -30 + row * 12
        half = max(2, 5 - row)
        for side in (-1, 1):
            box(col, mats, lod, f"ArmorPanel_{row}_{side}", (8.5, 0.8, 5.0),
                (x, 16.0, side * (half * 3.1)), "Material_Mechanical", 0.16, (0, 0, side * 0.06))
    windows_strip(col, mats, lod, "CommandWindows", (12, 8, 0), 9, 1.7, (0.28, 0.7, 1.1), "z")


def build_blackmarket(col, mats, lod):
    # Asymmetric welded warren grown through a captured asteroid/scrap mass.
    lumps = [(-18, 0, 2, 19, (1.2,.8,1.0)), (6, 5, -8, 16, (1,.9,1.3)), (25,-2,9,12,(1.4,.75,1.0)), (-2,-5,15,11,(1,.7,1.1))]
    for i, (x,y,z,r,s) in enumerate(lumps[:4 if lod < 2 else 3]):
        ico(col, mats, lod, f"RockHull_{i}", r, (x,y,z), "Material_Hull", s, i+11)
    module_count = 18 if lod == 0 else 11 if lod == 1 else 6
    for i in range(module_count):
        a = i * 2.399
        rad = 15 + (i % 4)*5
        x = math.cos(a)*rad + (6 if i%3==0 else -4)
        y = -5 + (i%5)*4
        z = math.sin(a)*rad
        box(col, mats, lod, f"SalvageModule_{i}", (7+(i%3)*2, 4+(i%2)*2, 5+(i%4)), (x,y,z),
            "Material_Mechanical" if i%4 else "Material_Warm", 0.32, (0,a*0.27,(i%3-1)*0.12))
    # Crooked docking tongue with its own route lighting.
    beam_between(col, mats, lod, "DockSpine", (-8,-3,-2), (-53,-4,-26), 4.2, "Material_Hull")
    box(col, mats, lod, "DockHead", (18, 7, 14), (-55,-4,-28), "Material_Mechanical", 0.45, (0,.35,0))
    windows_strip(col, mats, lod, "DockNeon", (-54,0,-21), 7, 2.0, (1.1,0.45,0.25), "x")
    ring_count = 5 if lod == 0 else 3 if lod == 1 else 2
    for i in range(ring_count):
        torus(col, mats, lod, f"HabRing_{i}", 5+i*1.8, .35, (-5+i*6, 11+i%2*4, -10+i*5),
            "Material_Accent", rot=(math.pi/2,0,0))
    container_count = 20 if lod == 0 else 10 if lod == 1 else 5
    for i in range(container_count):
        row=i//5; col_i=i%5
        box(col, mats, lod, f"Container_{i}", (6,3,3), (10+col_i*6.5,-11+row*3.5,-20+row*5),
            "Material_Warm" if i%4==0 else "Material_Mechanical", .15, (0,0,(i%3-1)*.08))


def build_fab(col, mats, lod):
    # Open drydock jaws and gantry bridge make the fabrication role unmistakable.
    box(col, mats, lod, "FabSpine", (86, 9, 13), (0, 0, 0), "Material_Hull", 0.85)
    for side in (-1,1):
        box(col, mats, lod, f"DrydockRail_{side}", (72, 6, 8), (4, -2, side*25), "Material_Mechanical", 0.5)
        for i in range(7 if lod == 0 else 4 if lod == 1 else 3):
            x=-29+i*(58/(6 if lod==0 else 3 if lod==1 else 2))
            beam_between(col,mats,lod,f"GantryUpright_{side}_{i}",(x,-4,side*20),(x,18,side*20),1.1,"Material_Hull")
            beam_between(col,mats,lod,f"GantryRoof_{side}_{i}",(x,18,side*20),(x,18,0),1.1,"Material_Hull")
    # Mobile forge cradle centered between the rails.
    torus(col, mats, lod, "ForgeCradle", 12, 1.3, (10,3,0), "Material_Warm", rot=(0,math.pi/2,0))
    torus(col, mats, lod, "ForgeGlow", 9.5, .55, (10,3,0), "Material_Accent", rot=(0,math.pi/2,0))
    box(col, mats, lod, "ForgeHall", (29, 18, 18), (-34,4,0), "Material_Hull", 0.75)
    for i in range(4 if lod<2 else 2):
        cyl(col,mats,lod,f"CraneDrum_{i}",2.3,7,(-20+i*12,19,(-1 if i%2 else 1)*16),"Material_Mechanical",rot=(math.pi/2,0,0))
        beam_between(col,mats,lod,f"CraneCable_{i}",(-20+i*12,19,(-1 if i%2 else 1)*16),(-20+i*12,3,(-1 if i%2 else 1)*10),.45,"Material_Accent")
    windows_strip(col,mats,lod,"FabControl",(-48,9,9.2),9,2.2,(1.2,.6,.25),"x")


def build_mining(col, mats, lod):
    # Crusher mouth, counter-rotating ore rings and three grabbing/drill arms.
    ico(col,mats,lod,"OreAnchor",22,(0,-5,0),"Material_Hull",(1.35,.7,1.05),33)
    torus(col,mats,lod,"CrusherOuter",19,2.1,(0,7,0),"Material_Mechanical",rot=(math.pi/2,0,0))
    torus(col,mats,lod,"CrusherInner",13,1.0,(0,7,0),"Material_Warm",rot=(math.pi/2,0,0))
    torus(col,mats,lod,"CrusherGlow",8.5,.7,(0,7,0),"Material_Accent",rot=(math.pi/2,0,0))
    arm_count=4 if lod==0 else 3
    for i in range(arm_count):
        a=math.tau*i/arm_count + .35
        start=(math.cos(a)*15,3,math.sin(a)*15)
        elbow=(math.cos(a)*30,9+(i%2)*7,math.sin(a)*30)
        end=(math.cos(a)*50,1+(i%2)*5,math.sin(a)*50)
        beam_between(col,mats,lod,f"MiningArmA_{i}",start,elbow,4.8,"Material_Hull")
        beam_between(col,mats,lod,f"MiningArmB_{i}",elbow,end,3.5,"Material_Mechanical")
        cyl(col,mats,lod,f"ArmJoint_{i}",4.2,5.5,elbow,"Material_Warm",rot=(math.pi/2,0,0))
        if i % 2 == 0:
            cyl(col,mats,lod,f"Drill_{i}",3.6,15,end,"Material_Accent",vertices=24 if lod==0 else 14,rot=(0,math.pi/2-a,0))
        else:
            box(col,mats,lod,f"OreBucket_{i}",(12,8,10),end,"Material_Mechanical",.5,(0,-a,0))
    box(col,mats,lod,"MiningHab",(25,12,19),(0,21,-24),"Material_Hull",.7)
    windows_strip(col,mats,lod,"MiningHabWindows",(0,22,-14.4),9,2.2,(1.1,.65,.25),"x")
    # Conveyor spine gives the rig a strong lateral read.
    box(col,mats,lod,"Conveyor",(70,4,7),(12,-15,0),"Material_Warm",.3,(0,.18,0))
    for i in range(12 if lod==0 else 7 if lod==1 else 4):
        x=-18+i*6
        cyl(col,mats,lod,f"ConveyorRoller_{i}",1.2,7,(x,-13,0),"Material_Mechanical",vertices=20,rot=(math.pi/2,0,0))


def build_research(col, mats, lod):
    # Three radial laboratory petals around an open sensor core.
    sphere(col,mats,lod,"SensorCore",9,(0,7,0),"Material_Glass")
    torus(col,mats,lod,"CoreHalo",13,1.0,(0,7,0),"Material_Accent",rot=(math.pi/2,0,0))
    petal_count=3
    for i in range(petal_count):
        a=math.tau*i/petal_count
        c=(math.cos(a)*29,2,math.sin(a)*29)
        beam_between(col,mats,lod,f"LabSpine_{i}",(math.cos(a)*9,2,math.sin(a)*9),c,3.2,"Material_Mechanical")
        sphere(col,mats,lod,f"LabPod_{i}",9,c,"Material_Hull",(1.55,.7,1.0))
        torus(col,mats,lod,f"LabRing_{i}",10.5,.55,c,"Material_Accent",rot=(math.pi/2,0,0))
        if lod<2:
            for j in range(5):
                off=(j-2)*3.1
                w=(c[0]-math.sin(a)*off, c[1]+2.0, c[2]+math.cos(a)*off)
                box(col,mats,lod,f"LabWindow_{i}_{j}",(1.2,.55,.32),w,"Material_Glass",.05,(0,-a,0))
    cyl(col,mats,lod,"ResearchMast",2.1,32,(0,24,0),"Material_Mechanical")
    dish_count=5 if lod==0 else 3 if lod==1 else 2
    for i in range(dish_count):
        y=17+i*6
        torus(col,mats,lod,f"SensorDish_{i}",4.5-i*.35,.35,(0,y,0),"Material_Accent",rot=(math.pi/2+i*.18,0,i*.7))
    panels=9 if lod==0 else 6 if lod==1 else 3
    radial_boxes(col,mats,lod,"Radiator",panels,48,(12,.7,5),0,"Material_Mechanical",True)
    for i in range(panels):
        a=math.tau*i/panels
        beam_between(col,mats,lod,f"RadiatorBoom_{i}",(math.cos(a)*34,0,math.sin(a)*34),(math.cos(a)*48,0,math.sin(a)*48),.65,"Material_Hull")


BUILDERS = {
    "place_gate_jump_ring": build_gate,
    "place_station_refinery": build_refinery,
    "place_station_military": build_military,
    "place_station_blackmarket": build_blackmarket,
    "place_station_fab": build_fab,
    "place_station_mining": build_mining,
    "place_station_research": build_research,
}


def apply_modifiers(objects):
    for obj in list(objects):
        if obj.type != "MESH":
            continue
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        for mod in list(obj.modifiers):
            try:
                bpy.ops.object.modifier_apply(modifier=mod.name)
            except Exception as exc:
                log(f"modifier warning {obj.name}/{mod.name}: {exc}")
        obj.select_set(False)


def join_draw_groups(col, lod: int):
    meshes = [o for o in col.objects if o.type == "MESH" and o.name.startswith(f"LOD{lod}_")]
    apply_modifiers(meshes)
    groups = {}
    for obj in meshes:
        mat_name = obj.data.materials[0].name if obj.data.materials else "Material_Hull"
        groups.setdefault(mat_name, []).append(obj)
    joined = []
    for mat_name, objs in groups.items():
        bpy.ops.object.select_all(action="DESELECT")
        for obj in objs:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = objs[0]
        bpy.ops.object.join()
        obj = bpy.context.object
        obj.name = f"LOD{lod}_Station_{mat_name}"
        tag(obj, lod, mat_name, "merged_draw_group")
        joined.append(obj)
    return joined


def triangles(obj) -> int:
    if obj.type != "MESH":
        return 0
    return sum(max(0, len(p.vertices)-2) for p in obj.data.polygons)


def bounds(objects):
    mins=Vector((1e9,1e9,1e9)); maxs=Vector((-1e9,-1e9,-1e9))
    for obj in objects:
        if obj.type!="MESH": continue
        for corner in obj.bound_box:
            p=obj.matrix_world @ Vector(corner)
            mins.x=min(mins.x,p.x); mins.y=min(mins.y,p.y); mins.z=min(mins.z,p.z)
            maxs.x=max(maxs.x,p.x); maxs.y=max(maxs.y,p.y); maxs.z=max(maxs.z,p.z)
    return mins,maxs,maxs-mins


def add_empty(col, name, loc, role, root):
    obj=bpy.data.objects.new(name,None)
    obj.empty_display_type="PLAIN_AXES"
    obj.location=loc
    obj["spaceface.socketRole"]=role
    obj.parent=root
    col.objects.link(obj)
    return obj


def add_collision(col, mats, root, dims):
    obj=box(col,mats,2,"COLLISION_HULL",tuple(v*.90 for v in dims),(0,0,0),"Material_Mechanical",.1)
    obj.name="COLLISION_HULL"
    obj.display_type="WIRE"
    obj.hide_render=True
    obj["spaceface.collision"]="broadphase_only"
    obj.parent=root
    return obj


def build_one(asset_id: str):
    reset_scene()
    mats=create_materials(asset_id)
    col=collection(asset_id.upper())
    for lod in range(3):
        BUILDERS[asset_id](col,mats,lod)
    draw_groups=[]
    lod_stats={}
    for lod in range(3):
        joined=join_draw_groups(col,lod)
        draw_groups.extend(joined)
        lod_stats[f"lod{lod}"]={"triangles":sum(triangles(o) for o in joined),"drawGroups":len(joined)}
    root=bpy.data.objects.new(f"SF_{asset_id.upper()}_ROOT",None)
    root.empty_display_type="CUBE"
    col.objects.link(root)
    role,title=ROLE[asset_id]
    root["spaceface.assetId"]=f"SF_{asset_id.upper()}"
    root["spaceface.partId"]=asset_id
    root["spaceface.family"]=FAMILY
    root["spaceface.packet"]=PACKET
    root["spaceface.role"]=role
    for obj in draw_groups:
        obj.parent=root
    lod0=[o for o in draw_groups if o.name.startswith("LOD0_")]
    mn,mx,dims=bounds(lod0)
    add_collision(col,mats,root,dims)
    add_empty(col,"SOCKET_Structure_Core",(0,0,0),"structure_core",root)
    add_empty(col,"SOCKET_Emissive",(0,max(4.0,mx.y*.55),0),"emissive",root)
    if asset_id=="place_gate_jump_ring":
        add_empty(col,"SOCKET_Gate_Aperture",(0,0,0),"gate_aperture",root)
    else:
        add_empty(col,"SOCKET_Dock_Approach",(mx.x*.72,0,0),"dock_approach",root)
    metadata={
        "contractVersion":1,"assetId":f"SF_{asset_id.upper()}","partId":asset_id,"liveId":asset_id,
        "slot":"place","forward":"+X","up":"+Y","starboard":"+Z","unit":"metre",
        "normalConvention":"OpenGL","ormChannels":"R=AO,G=Roughness,B=Metallic",
        "textureCompression":"PNG-source","textureSize":1024,"chamfered":True,"bevelRadiusM":.05,
        "family":FAMILY,"packet":PACKET,"role":role,"title":title,"kind":"station_landmark",
        "deliverableRole":"production_multi_lod","lods":["lod0","lod1","lod2"],
        "triangleCount":lod_stats["lod0"]["triangles"],"lodTriangles":{k:v["triangles"] for k,v in lod_stats.items()},
        "drawGroupsPerLod":{k:v["drawGroups"] for k,v in lod_stats.items()},
        "lod0AabbSize":[round(v,4) for v in dims],"wiringStatus":"production_source",
    }
    bpy.context.scene["spacefaceAssetJson"]=json.dumps(metadata,separators=(",",":"))
    root["spacefaceAssetJson"]=json.dumps(metadata,separators=(",",":"))
    OUT.mkdir(parents=True,exist_ok=True); BLENDS.mkdir(parents=True,exist_ok=True); EVIDENCE.mkdir(parents=True,exist_ok=True)
    blend_path=BLENDS/f"{asset_id}_authored.blend"
    glb_path=OUT/f"{asset_id}.glb"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
    bpy.ops.object.select_all(action="DESELECT")
    for obj in col.objects:
        obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(glb_path),export_format="GLB",use_selection=True,
        export_yup=True,export_apply=True,export_extras=True,export_texcoords=True,
        export_normals=True,export_tangents=True,export_materials="EXPORT")
    report={"schema":"spaceface.stationFamilyBuild.v1","packet":PACKET,"family":FAMILY,
        "assetId":asset_id,"role":role,"title":title,"source":str(glb_path.relative_to(ROOT)).replace("\\","/"),
        "blend":str(blend_path.relative_to(ROOT)).replace("\\","/"),"bytes":glb_path.stat().st_size,
        "lod":lod_stats,"aabb":{"min":[round(v,4) for v in mn],"max":[round(v,4) for v in mx],"size":[round(v,4) for v in dims]},
        "materials":sorted(mats.keys()),"metadata":metadata,"builtAt":time.strftime("%Y-%m-%dT%H:%M:%SZ",time.gmtime())}
    (EVIDENCE/f"{asset_id}.json").write_text(json.dumps(report,indent=2),encoding="utf-8")
    log(f"built {asset_id}: {glb_path.stat().st_size:,} bytes lod={lod_stats} aabb={[round(v,1) for v in dims]}")
    return report


def main():
    argv=sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else []
    parser=argparse.ArgumentParser()
    parser.add_argument("--only",choices=IDS)
    args=parser.parse_args(argv)
    targets=[args.only] if args.only else list(IDS)
    t0=time.time(); reports=[]
    for asset_id in targets:
        reports.append(build_one(asset_id))
    summary={"schema":"spaceface.stationFamilySummary.v1","packet":PACKET,"family":FAMILY,
        "assets":[{"id":r["assetId"],"bytes":r["bytes"],"lod":r["lod"],"aabb":r["aabb"]} for r in reports],
        "elapsedSeconds":round(time.time()-t0,2),"builtAt":time.strftime("%Y-%m-%dT%H:%M:%SZ",time.gmtime())}
    EVIDENCE.mkdir(parents=True,exist_ok=True)
    (EVIDENCE/"family_summary.json").write_text(json.dumps(summary,indent=2),encoding="utf-8")
    log(f"completed {len(reports)} assets in {summary['elapsedSeconds']}s")


if __name__=="__main__":
    main()
