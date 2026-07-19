#!/usr/bin/env python3
"""Build a non-promoting manufactured-wreck candidate for place_debris_chunk.

The source markers, pivot, scale and tether socket are preserved.  The candidate is
rebuilt as a recognizable pressure-module fragment with a continuous structural
spine, torn armor/insulation layers, shorn load members, cable trays and salvage ID.
It deliberately contains no emissive or asteroid-like visual language.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


ROLE_BY_MATERIAL = {
    "Material_Hull": "debris_painted_skin",
    "Material_Mechanical": "debris_structural_alloy",
    "Material_Insulation": "debris_insulation",
    "Material_Accent": "debris_heat_affected",
    "Material_Cable": "debris_cable_polymer",
    "Material_Radiator": "debris_radiator",
    "Material_Decal": "debris_identity_decal",
}
NORMAL_STRENGTH = {
    "debris_painted_skin": 0.14,
    "debris_structural_alloy": 0.13,
    "debris_insulation": 0.17,
    "debris_heat_affected": 0.14,
    "debris_cable_polymer": 0.10,
    "debris_radiator": 0.12,
    "debris_identity_decal": 0.055,
}
SOURCE_BOUNDS = {
    "min": (0.0, -5.58455038, -3.21168280),
    "max": (24.21117401, 4.86955547, 4.11932945),
    "size": (24.21117401, 10.45410585, 7.33101225),
}


def cli() -> argparse.Namespace:
    values = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
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


def load_image(path: Path, colorspace: str):
    image = bpy.data.images.load(str(path.resolve()), check_existing=True)
    image.name = path.name
    image.colorspace_settings.name = colorspace
    image.pack()
    return image


def material(name: str, role: str, maps_root: Path):
    value = bpy.data.materials.new(name)
    value.use_nodes = True
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
        group.interface.new_socket(name="Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")
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
        principled.inputs["Coat Weight"].default_value = 0.07
        principled.inputs["Coat Roughness"].default_value = 0.40
    links.new(principled.outputs["BSDF"], output.inputs["Surface"])
    value["spaceface.semantic"] = name
    value["spaceface.textureRole"] = role
    value["spaceface.ormChannels"] = "R=AO,G=Roughness,B=Metallic"
    value["spaceface.normalConvention"] = "OpenGL tangent space"
    return value


def tag(obj, lod: int, mat, role: str, root) -> None:
    obj.parent = root
    obj["spaceface.lod"] = f"lod{lod}"
    obj["spaceface.lodLevel"] = lod
    obj["spaceface.materialRole"] = mat.name
    obj["spaceface.structureRole"] = role
    obj["spaceface.wreckDonor"] = "Meridian pressure/utility module"


def bevel(obj, width: float, lod: int) -> None:
    modifier = obj.modifiers.new("SF_PhysicalEdge", "BEVEL")
    modifier.width = max(0.015, width * (1.0 if lod == 0 else 0.68 if lod == 1 else 0.44))
    modifier.segments = 3 if lod == 0 else 2 if lod == 1 else 1
    modifier.limit_method = "ANGLE"


def box(name, dimensions, location, rotation, mat, lod, role, root, edge=0.07):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = f"LOD{lod}_Debris_{name}"
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    obj.data.materials.append(mat)
    bevel(obj, edge, lod)
    tag(obj, lod, mat, role, root)
    return obj


def cylinder(name, radius, depth, location, rotation, mat, lod, role, root, vertices=24, edge=0.06):
    count = max(8, vertices if lod == 0 else vertices // 2 if lod == 1 else vertices // 3)
    bpy.ops.mesh.primitive_cylinder_add(vertices=count, radius=radius, depth=depth, end_fill_type="NGON", location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = f"LOD{lod}_Debris_{name}"
    obj.data.materials.append(mat)
    bevel(obj, min(radius, depth) * edge, lod)
    tag(obj, lod, mat, role, root)
    return obj


def beam(name, start, end, width, mat, lod, role, root, edge=0.04):
    a, b = Vector(start), Vector(end)
    delta = b - a
    obj = box(name, (width, width, delta.length), (a+b)*0.5, (0, 0, 0), mat, lod, role, root, edge)
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = delta.to_track_quat("Z", "Y")
    obj.rotation_mode = "XYZ"
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    obj.select_set(False)
    return obj


def prism(name, points, depth, axis, location, mat, lod, role, root, edge=0.05):
    """Extrude an authored 2D outline along X/Y/Z to make a torn solid plate."""
    count = len(points)
    vertices = []
    for side in (-depth*0.5, depth*0.5):
        for u, v in points:
            if axis == "X":
                vertices.append((side, u, v))
            elif axis == "Y":
                vertices.append((u, side, v))
            else:
                vertices.append((u, v, side))
    faces = [tuple(range(count-1, -1, -1)), tuple(range(count, count*2))]
    for index in range(count):
        nxt = (index+1) % count
        faces.append((index, nxt, count+nxt, count+index))
    mesh = bpy.data.meshes.new(f"LOD{lod}_Debris_{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.validate(clean_customdata=False)
    mesh.update()
    obj = bpy.data.objects.new(f"LOD{lod}_Debris_{name}", mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = location
    obj.data.materials.append(mat)
    bevel(obj, edge, lod)
    tag(obj, lod, mat, role, root)
    return obj


def frame(name: str, x: float, y_half: float, z_half: float, mat, lod: int, root, broken=False) -> None:
    width = 0.42 if lod == 0 else 0.52
    box(f"{name}_Top", (0.62, y_half*2, width), (x, 0, z_half), (0, 0, 0), mat, lod, "pressure_frame_crossmember", root, 0.07)
    box(f"{name}_Bottom", (0.62, y_half*2, width), (x, 0, -z_half), (0, 0, 0), mat, lod, "pressure_frame_crossmember", root, 0.07)
    box(f"{name}_Port", (0.62, width, z_half*2), (x, -y_half, 0), (0, 0, 0), mat, lod, "pressure_frame_upright", root, 0.07)
    if not broken:
        box(f"{name}_Starboard", (0.62, width, z_half*2), (x, y_half, 0), (0, 0, 0), mat, lod, "pressure_frame_upright", root, 0.07)


def build_lod(lod: int, mats, root) -> None:
    # Continuous skeleton and surviving pressure frames establish a manufactured donor.
    box("CentralSpine", (23.45, 0.82, 0.82), (11.92, 0, 0), (0, 0, 0), mats["Material_Mechanical"], lod, "continuous_primary_spine", root, 0.11)
    box("LowerLongeron", (19.6, 0.58, 0.58), (9.95, -2.75, -2.15), (0, 0, 0), mats["Material_Mechanical"], lod, "surviving_lower_longeron", root, 0.08)
    box("UpperLongeron", (16.8, 0.54, 0.54), (8.55, 2.55, 2.55), (0, 0, 0), mats["Material_Mechanical"], lod, "surviving_upper_longeron", root, 0.08)
    frame("ForwardBulkhead", 1.20, 3.55, 2.70, mats["Material_Mechanical"], lod, root)
    frame("MidBulkhead", 9.25, 4.05, 3.05, mats["Material_Mechanical"], lod, root, broken=lod < 2)
    frame("AftBulkhead", 17.65, 3.40, 2.55, mats["Material_Accent"], lod, root, broken=True)

    # Tether hardpoint is physically built around the preserved socket at (2,0,1).
    cylinder("TetherClevis", 0.72, 1.15, (2.0, 0, 1.0), (0, math.pi/2, 0), mats["Material_Mechanical"], lod, "massline_tether_clevis", root, 24, 0.08)
    cylinder("TetherPin", 0.28, 1.65, (2.0, 0, 1.0), (math.pi/2, 0, 0), mats["Material_Decal"], lod, "tether_release_pin", root, 18, 0.06)

    # Surviving exterior is asymmetric and every sheet is rooted in a frame/longeron.
    prism("PortArmorForward", [(0.0,-2.35),(7.7,-2.60),(10.8,-1.7),(9.3,2.45),(1.1,2.8)], 0.34, "Y", (0.45,-4.25,0.15), mats["Material_Hull"], lod, "torn_coated_pressure_skin", root, 0.08)
    prism("CrownArmor", [(0.0,-3.2),(9.0,-3.45),(13.3,-2.1),(16.2,-0.3),(13.8,2.3),(4.0,3.0)], 0.34, "Z", (0.35,0,3.35), mats["Material_Hull"], lod, "surviving_crown_armor", root, 0.08)
    prism("BellyArmor", [(0.0,-2.5),(6.8,-3.2),(12.4,-2.6),(18.0,-0.8),(16.2,2.2),(3.0,2.9)], 0.30, "Z", (0.25,-0.3,-2.95), mats["Material_Hull"], lod, "torn_belly_armor", root, 0.07)
    if lod < 2:
        prism("StarboardArmorShard", [(0.0,-1.7),(5.8,-2.0),(8.8,-0.7),(7.0,1.4),(2.1,2.0)], 0.28, "Y", (5.6,3.72,0.35), mats["Material_Hull"], lod, "remaining_starboard_skin", root, 0.07)

    # Insulation is visible only beneath missing armor and never floats independently.
    if lod < 2:
        prism("PortInsulation", [(0,-2.0),(6.1,-2.1),(8.4,-1.2),(7.0,1.7),(0.8,2.25)], 0.20, "Y", (7.1,-4.02,0.10), mats["Material_Insulation"], lod, "exposed_pressure_insulation", root, 0.045)
        prism("BellyInsulation", [(0,-1.8),(5.4,-2.0),(8.0,-0.5),(6.0,1.6),(1.2,2.0)], 0.18, "Z", (9.4,-0.25,-2.78), mats["Material_Insulation"], lod, "exposed_thermal_blanket", root, 0.04)

    # Heat exchanger fragment gives a legible functional subsystem.
    panel_count = 4 if lod == 0 else 3 if lod == 1 else 2
    box("RadiatorRoot", (4.9, 0.58, 0.62), (14.55,-3.45,1.25), (0,0,0), mats["Material_Mechanical"], lod, "heat_exchanger_root", root, 0.07)
    for index in range(panel_count):
        box(f"RadiatorFin_{index}", (4.55,0.14,1.70), (14.55,-3.65-index*0.52,1.35), (0,0,0), mats["Material_Radiator"], lod, "surviving_radiator_fin", root, 0.04)

    # A shorn aft end uses structural/thermal layers, not random radial debris.
    for index, (start,end) in enumerate((
        ((17.75,-3.1,-2.4),(23.75,-4.2,-2.15)),
        ((17.75,3.0,2.35),(23.65,4.15,3.05)),
        ((17.85,-2.8,2.3),(23.55,-3.9,3.75)),
        ((17.8,2.6,-2.3),(23.7,3.8,-3.0)),
    )):
        beam(f"ShornMember_{index}", start, end, 0.48 if lod < 2 else 0.62, mats["Material_Accent"], lod, "directional_shorn_frame", root, 0.055)
    box("AftBreakCap", (0.48,2.15,2.45), (23.96,0.15,0.20), (0,0,0), mats["Material_Accent"], lod, "heat_affected_break_interface", root, 0.06)

    # Bounded, tray-routed harnesses reinforce scale and engineering logic.
    if lod < 2:
        cable_count = 4 if lod == 0 else 2
        for cable in range(cable_count):
            y = -1.10-cable*0.31
            z = 0.75+cable*0.18
            beam(f"CableA_{cable}", (3.2,y,z),(10.5,y-0.20,z+0.25),0.16,mats["Material_Cable"],lod,"routed_service_harness",root,0.025)
            beam(f"CableB_{cable}", (10.5,y-0.20,z+0.25),(17.1,y+0.35,z-0.20),0.16,mats["Material_Cable"],lod,"severed_service_harness",root,0.025)
        box("CableTray", (13.9,1.65,0.22),(10.1,-1.50,0.42),(0,0,0),mats["Material_Mechanical"],lod,"service_harness_tray",root,0.04)

    if lod == 0:
        # Captive fasteners follow surviving frame stations rather than every edge.
        for station, x in enumerate((1.2,9.25,17.65)):
            for index, (y,z) in enumerate(((-3.45,2.65),(3.45,2.65),(-3.45,-2.65),(3.45,-2.65))):
                cylinder(f"FrameBolt_{station}_{index}",0.11,0.18,(x-0.40,y,z),(0,math.pi/2,0),mats["Material_Decal"],lod,"captive_frame_fastener",root,12,0.04)
        # Fracture brackets connect armor to the actual donor frame.
        for index, (start,end) in enumerate((
            ((5.0,-3.9,2.8),(5.0,-2.6,1.9)),
            ((12.2,-4.0,-2.5),(12.2,-2.7,-1.4)),
            ((15.8,3.6,1.8),(15.8,2.5,0.9)),
        )):
            beam(f"ArmorBracket_{index}",start,end,0.25,mats["Material_Mechanical"],lod,"surviving_armor_bracket",root,0.035)


def add_identity(mats, root) -> None:
    for index, (body,size,location) in enumerate((
        ("MTR-7",0.66,(6.8,-4.45,1.65)),
        ("SALVAGE 04",0.28,(6.8,-4.46,0.82)),
    )):
        curve = bpy.data.curves.new(f"DebrisIdentity_{index}","FONT")
        curve.body = body
        curve.align_x = "CENTER"
        curve.align_y = "CENTER"
        curve.size = size
        curve.extrude = 0.018
        curve.bevel_depth = 0.005
        curve.bevel_resolution = 1
        obj = bpy.data.objects.new(f"LOD0_Debris_Identity_{index}",curve)
        bpy.context.scene.collection.objects.link(obj)
        obj.location = location
        obj.rotation_euler = (math.pi/2,0,0)
        obj.data.materials.append(mats["Material_Decal"])
        tag(obj,0,mats["Material_Decal"],"non_emissive_donor_registration",root)
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        bpy.ops.object.convert(target="MESH")
        obj.select_set(False)


def apply_modifiers_and_uv() -> list[str]:
    failures=[]
    for obj in sorted((item for item in bpy.data.objects if item.type=="MESH"),key=lambda item:item.name):
        bpy.context.view_layer.objects.active=obj
        obj.select_set(True)
        for modifier in list(obj.modifiers):
            try:
                bpy.ops.object.modifier_apply(modifier=modifier.name)
            except Exception as exc:
                failures.append(f"{obj.name}/{modifier.name}: {exc}")
        bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
        obj.data.validate(clean_customdata=False)
        for polygon in obj.data.polygons:
            polygon.use_smooth=True
        if not obj.data.uv_layers:
            obj.data.uv_layers.new(name="UVMap")
        try:
            bpy.ops.object.mode_set(mode="EDIT")
            bpy.ops.mesh.select_all(action="SELECT")
            bpy.ops.uv.smart_project(angle_limit=math.radians(57),island_margin=0.012)
            bpy.ops.object.mode_set(mode="OBJECT")
        except Exception as exc:
            failures.append(f"{obj.name}/UV: {exc}")
            if obj.mode!="OBJECT":
                bpy.ops.object.mode_set(mode="OBJECT")
        obj.select_set(False)
    return failures


def join_groups(materials,root) -> None:
    for lod in range(3):
        for material_name,material_value in materials.items():
            matches=[obj for obj in bpy.data.objects if obj.type=="MESH" and obj.name.startswith(f"LOD{lod}_") and obj.data.materials and obj.data.materials[0]==material_value]
            if not matches:
                continue
            bpy.ops.object.select_all(action="DESELECT")
            for obj in matches:
                obj.select_set(True)
            bpy.context.view_layer.objects.active=matches[0]
            if len(matches)>1:
                bpy.ops.object.join()
            joined=bpy.context.object
            joined.name=f"LOD{lod}_Debris_{material_name}"
            joined.parent=root
            joined["spaceface.lod"]=f"lod{lod}"
            joined["spaceface.lodLevel"]=lod
            joined["spaceface.materialRole"]=material_name
            joined["spaceface.structureRole"]="merged_functional_draw_group"
            modifier=joined.modifiers.new("SF_ExportTriangulate","TRIANGULATE")
            modifier.keep_custom_normals=True
            bpy.ops.object.modifier_apply(modifier=modifier.name)
            joined.select_set(False)


def tangent_results() -> list[dict]:
    results=[]
    for obj in sorted((item for item in bpy.data.objects if item.type=="MESH"),key=lambda item:item.name):
        mesh=obj.data
        mesh.calc_loop_triangles()
        valid=False
        error=None
        try:
            mesh.calc_tangents(uvmap=mesh.uv_layers[0].name)
            lengths=[loop.tangent.length for loop in mesh.loops]
            valid=bool(lengths) and min(lengths)>0.985 and max(lengths)<1.015
        except Exception as exc:
            error=str(exc)
        finally:
            try: mesh.free_tangents()
            except Exception: pass
        results.append({"object":obj.name,"valid":valid,"error":error,"loops":len(mesh.loops)})
    return results


def triangles(obj) -> int:
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


def bounds(objects):
    points=[obj.matrix_world@Vector(corner) for obj in objects for corner in obj.bound_box]
    low=[min(point[axis] for point in points) for axis in range(3)]
    high=[max(point[axis] for point in points) for axis in range(3)]
    return {"min":low,"max":high,"size":[high[i]-low[i] for i in range(3)]}


def export_glb(target:Path,root) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    for obj in bpy.data.objects:
        if obj.type not in {"LIGHT","CAMERA"}:
            obj.select_set(True)
    bpy.context.view_layer.objects.active=root
    target.parent.mkdir(parents=True,exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(target),export_format="GLB",use_selection=True,export_yup=True,export_apply=True,export_extras=True,export_texcoords=True,export_normals=True,export_tangents=True,export_materials="EXPORT")
    bpy.ops.object.select_all(action="DESELECT")


def family_update(report_path:Path,maps_manifest:Path) -> Path:
    target=report_path.with_name("opening-route-wreckage-family-update.json")
    value={
        "schema":"spaceface.openingRouteWreckageFamily.v1",
        "status":"candidate-not-promoted",
        "surfaceManifest":str(maps_manifest.resolve()),
        "identity":"manufactured donors remain identifiable after silhouette-breaking damage",
        "sharedConstructionLanguage":{
            "loadPath":"continuous alloy spine and frame stations",
            "damage":"directional torn armor exposing insulation, harnesses and heat-affected members",
            "salvage":"physical tether clevis and non-emissive donor/classification markings",
            "heatManagement":"radiator fragments remain attached to explicit exchanger roots",
            "separationFromRocks":"orthogonal frames, captive hardware, layered manufactured materials and readable subsystems",
        },
        "place_debris_chunk":{"candidateState":"implemented-not-promoted","donor":"Meridian pressure/utility module","lods":["lod0","lod1","lod2"]},
        "nextRecipes":{
            "place_dead_hulk":"preserve recognizable bow/engine donor; use the same damage layers at larger scale",
            "place_mining_drone":"industrial articulated donor with tool hardpoints; do not reuse wreck damage as normal wear",
        },
        "nonGoals":["random shards","asteroid silhouettes","uniform rust noise","active emissive identity","color-swap differentiation"],
    }
    target.write_text(json.dumps(value,indent=2),encoding="utf-8")
    return target


def main() -> None:
    args=cli()
    args.maps_root=args.maps_root.resolve()
    args.output_blend=args.output_blend.resolve()
    args.output_glb=args.output_glb.resolve()
    args.report=args.report.resolve()
    source_path=Path(bpy.data.filepath).resolve()
    maps_manifest=args.maps_root/"surface-map-build.json"
    root=bpy.data.objects.get("place_debris_chunk")
    socket=bpy.data.objects.get("SOCKET_Tether_Massline")
    marker_names=("Chunk_Break_A","Chunk_Break_B","Chunk_Shred","Chunk_Spine")
    if root is None or socket is None or any(bpy.data.objects.get(name) is None for name in marker_names):
        raise RuntimeError("Expected debris root, tether socket and break markers")

    preserved={name:{"location":list(bpy.data.objects[name].location),"rotation":list(bpy.data.objects[name].rotation_euler),"scale":list(bpy.data.objects[name].scale),"parent":bpy.data.objects[name].parent.name if bpy.data.objects[name].parent else None} for name in (root.name,socket.name,*marker_names)}
    for obj in list(bpy.data.objects):
        if obj.type=="MESH":
            bpy.data.objects.remove(obj,do_unlink=True)
    for item in list(bpy.data.materials):
        bpy.data.materials.remove(item,do_unlink=True)
    for item in list(bpy.data.images):
        bpy.data.images.remove(item,do_unlink=True)

    materials={name:material(name,role,args.maps_root) for name,role in ROLE_BY_MATERIAL.items()}
    for lod in range(3):
        build_lod(lod,materials,root)
    add_identity(materials,root)
    failures=apply_modifiers_and_uv()
    join_groups(materials,root)
    tangents=tangent_results()
    invalid=[entry for entry in tangents if not entry["valid"]]
    if invalid:
        raise RuntimeError(f"Tangent validation failed: {invalid[:5]}")
    scale_failures=[obj.name for obj in bpy.data.objects if obj.type=="MESH" and any(abs(float(v)-1)>1e-5 for v in obj.scale)]
    if scale_failures:
        raise RuntimeError(f"Unapplied scale: {scale_failures[:8]}")

    lod_meshes={lod:sorted([obj for obj in bpy.data.objects if obj.type=="MESH" and obj.name.startswith(f"LOD{lod}_Debris_")],key=lambda item:item.name) for lod in range(3)}
    lod_stats={f"lod{lod}":{"triangles":sum(triangles(obj) for obj in meshes),"drawGroups":len(meshes),"objects":[obj.name for obj in meshes]} for lod,meshes in lod_meshes.items()}
    candidate_bounds=bounds(lod_meshes[0])
    size_drift=[abs(candidate_bounds["size"][axis]-SOURCE_BOUNDS["size"][axis])/SOURCE_BOUNDS["size"][axis] for axis in range(3)]
    pivot_drift=[abs(candidate_bounds["min"][axis]-SOURCE_BOUNDS["min"][axis]) for axis in range(3)]
    if any(value>0.08 for value in size_drift) or pivot_drift[0]>0.40:
        raise RuntimeError(f"Source scale/pivot drift outside guard: size={size_drift}, min={pivot_drift}, bounds={candidate_bounds}")

    root["spaceface.family"]="opening_route_manufactured_wreckage_v1"
    root["spaceface.surfaceRevision"]="opening_debris_chunk_v1"
    root["spaceface.donorClass"]="Meridian pressure/utility module"
    root["spacefaceAssetJson"]=json.dumps({
        "contractVersion":1,"assetId":"place_debris_chunk","partId":"place_debris_chunk","liveId":"place_debris_chunk","slot":"place",
        "forward":"+X","up":"+Y","starboard":"+Z","unit":"metre","normalConvention":"OpenGL","ormChannels":"R=AO,G=Roughness,B=Metallic",
        "textureCompression":"PNG-source/KTX2-release-candidate","textureSize":512,"family":"opening_route_manufactured_wreckage_v1",
        "role":"salvageable_manufactured_wreck","donorClass":"Meridian pressure/utility module","deliverableRole":"production_multi_lod_candidate",
        "lods":["lod0","lod1","lod2"],"lodTriangles":{key:value["triangles"] for key,value in lod_stats.items()},
        "drawGroupsPerLod":{key:value["drawGroups"] for key,value in lod_stats.items()},"wiringStatus":"candidate_not_promoted",
    },separators=(",",":"))
    bpy.context.scene["spacefaceAssetJson"]=root["spacefaceAssetJson"]

    args.output_blend.parent.mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(args.output_blend),check_existing=False)
    export_glb(args.output_glb,root)
    family_path=family_update(args.report,maps_manifest)
    report={
        "schema":"spaceface.openingDebrisChunkRemaster.v1","status":"candidate-not-promoted",
        "source":{"path":str(source_path),"sha256":sha256(source_path)},
        "surfaceManifest":{"path":str(maps_manifest),"sha256":sha256(maps_manifest)},
        "outputs":{"blend":{"path":str(args.output_blend),"sha256":sha256(args.output_blend)},"glb":{"path":str(args.output_glb),"sha256":sha256(args.output_glb)},"familyUpdate":{"path":str(family_path),"sha256":sha256(family_path)}},
        "preservedContract":{"sourceBounds":SOURCE_BOUNDS,"candidateBounds":candidate_bounds,"relativeSizeDrift":size_drift,"minimumCornerDriftM":pivot_drift,"markers":preserved},
        "materials":[{"name":name,"textureRole":role} for name,role in ROLE_BY_MATERIAL.items()],"lod":lod_stats,
        "modifierOrUvFailures":failures,"tangents":tangents,
        "knownDefects":[
            "Candidate has not been promoted or inspected on the live player route.",
            "Runtime salvage/tether interaction must be checked against the preserved socket after promotion.",
            "KTX2 binding, release optimization and gameplay collision remain controller-owned integration work.",
            "The candidate is intentionally inert and contains no active emissive material; gameplay markers must provide any interactive highlight.",
        ],
    }
    args.report.parent.mkdir(parents=True,exist_ok=True)
    args.report.write_text(json.dumps(report,indent=2),encoding="utf-8")
    print(json.dumps({"ok":True,"blend":str(args.output_blend),"glb":str(args.output_glb),"report":str(args.report),"lod":lod_stats,"bounds":candidate_bounds}))


if __name__=="__main__":
    main()
