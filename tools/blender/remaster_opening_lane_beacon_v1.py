#!/usr/bin/env python3
"""Build a non-promoting, production-oriented lane beacon candidate.

The canonical authored file is opened by Blender and never overwritten.  This tool
rebuilds the beacon inside a candidate file, preserving the established 30.55 m
vertical silhouette, origin, gameplay socket and emissive hook.  The result uses
explicit construction roles and bounded signal optics rather than an emissive ball.
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
    "Material_Hull": "beacon_painted_shell",
    "Material_Mechanical": "beacon_structural_alloy",
    "Material_Ceramic": "beacon_signal_ceramic",
    "Material_Accent": "beacon_signal_lens",
    "Material_Radiator": "beacon_solar_coldplate",
    "Material_Safety": "beacon_safety_surface",
    "Material_Decal": "beacon_identity_decal",
}
NORMAL_STRENGTH = {
    "beacon_painted_shell": 0.14,
    "beacon_structural_alloy": 0.12,
    "beacon_signal_ceramic": 0.10,
    "beacon_signal_lens": 0.055,
    "beacon_solar_coldplate": 0.11,
    "beacon_safety_surface": 0.075,
    "beacon_identity_decal": 0.045,
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


def make_material(name: str, role: str, maps_root: Path):
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

    emissive_path = maps_root / f"{role}_emissive.png"
    if emissive_path.exists():
        emissive = nodes.new("ShaderNodeTexImage")
        emissive.name = f"SF_{role}_Emissive"
        emissive.image = load_image(emissive_path, "sRGB")
        emissive.interpolation = "Linear"
        links.new(emissive.outputs["Color"], principled.inputs["Emission Color"])
        principled.inputs["Emission Strength"].default_value = 1.45

    if name == "Material_Hull":
        principled.inputs["Coat Weight"].default_value = 0.10
        principled.inputs["Coat Roughness"].default_value = 0.32
    elif name == "Material_Accent":
        principled.inputs["Coat Weight"].default_value = 0.42
        principled.inputs["Coat Roughness"].default_value = 0.14
        principled.inputs["IOR"].default_value = 1.46
    links.new(principled.outputs["BSDF"], output.inputs["Surface"])
    value["spaceface.semantic"] = name
    value["spaceface.textureRole"] = role
    value["spaceface.ormChannels"] = "R=AO,G=Roughness,B=Metallic"
    value["spaceface.normalConvention"] = "OpenGL tangent space"
    return value


def tag(obj, lod: int, material_name: str, structure_role: str, root) -> None:
    obj.parent = root
    obj["spaceface.lod"] = f"lod{lod}"
    obj["spaceface.lodLevel"] = lod
    obj["spaceface.materialRole"] = material_name
    obj["spaceface.structureRole"] = structure_role
    obj["spaceface.authoredConstruction"] = True


def add_bevel(obj, width: float, lod: int) -> None:
    modifier = obj.modifiers.new("SF_PhysicalEdge", "BEVEL")
    modifier.width = max(0.018, width * (1.0 if lod == 0 else 0.70 if lod == 1 else 0.48))
    modifier.segments = 3 if lod == 0 else 2 if lod == 1 else 1
    modifier.limit_method = "ANGLE"


def box(name, dimensions, location, rotation, mat, lod, role, root, bevel=0.08):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = f"LOD{lod}_Beacon_{name}"
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    obj.data.materials.append(mat)
    add_bevel(obj, bevel, lod)
    tag(obj, lod, mat.name, role, root)
    return obj


def cylinder(name, radius, depth, location, rotation, mat, lod, role, root, vertices=24, bevel=0.06):
    count = max(8, vertices if lod == 0 else vertices // 2 if lod == 1 else vertices // 3)
    bpy.ops.mesh.primitive_cylinder_add(vertices=count, radius=radius, depth=depth, end_fill_type="NGON", location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = f"LOD{lod}_Beacon_{name}"
    obj.data.materials.append(mat)
    add_bevel(obj, min(radius, depth) * bevel, lod)
    tag(obj, lod, mat.name, role, root)
    return obj


def beam(name, start, end, width, mat, lod, role, root, bevel=0.05):
    a, b = Vector(start), Vector(end)
    delta = b - a
    midpoint = (a + b) * 0.5
    obj = box(name, (width, width, delta.length), midpoint, (0.0, 0.0, 0.0), mat, lod, role, root, bevel)
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = delta.to_track_quat("Z", "Y")
    obj.rotation_mode = "XYZ"
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    obj.select_set(False)
    return obj


def radial_box(name, radius, angle, dimensions, z, mat, lod, role, root, bevel=0.07):
    return box(
        name,
        dimensions,
        (math.cos(angle) * radius, math.sin(angle) * radius, z),
        (0.0, 0.0, angle),
        mat, lod, role, root, bevel,
    )


def build_lod(lod: int, mats, root) -> None:
    # Four-point base and visible load path; not a floating stack of primitives.
    box("Foundation", (5.75, 5.75, 0.72), (0, 0, 0.72), (0, 0, 0), mats["Material_Mechanical"], lod, "load_spreading_foundation", root, 0.20)
    box("FoundationArmor", (3.45, 3.45, 0.55), (0, 0, 1.27), (0, 0, 0), mats["Material_Hull"], lod, "replaceable_base_armor", root, 0.14)
    for index, angle in enumerate((math.radians(45), math.radians(135), math.radians(225), math.radians(315))):
        radial_box(f"Foot_{index}", 2.48, angle, (1.00, 0.90, 0.62), 0.58, mats["Material_Mechanical"], lod, "anchoring_foot_clevis", root, 0.15)
        if lod < 2:
            beam(f"BaseBrace_{index}", (math.cos(angle)*2.30, math.sin(angle)*2.30, 0.92), (math.cos(angle)*1.00, math.sin(angle)*1.00, 3.45), 0.32, mats["Material_Mechanical"], lod, "triangulated_base_brace", root, 0.04)
        if lod == 0:
            cylinder(f"FootPin_{index}", 0.16, 0.94, (math.cos(angle)*2.48, math.sin(angle)*2.48, 0.60), (math.pi/2, angle, 0), mats["Material_Safety"], lod, "service_release_pin", root, 16, 0.05)

    cylinder("LowerSpine", 0.68, 14.7, (0, 0, 8.15), (0, 0, 0), mats["Material_Mechanical"], lod, "load_bearing_mast", root, 28, 0.07)
    cylinder("UpperSpine", 0.54, 8.0, (0, 0, 18.95), (0, 0, 0), mats["Material_Mechanical"], lod, "serviceable_upper_mast", root, 24, 0.07)
    for index, z in enumerate((4.0, 8.3, 12.6, 16.9)):
        cylinder(f"Collar_{index}", 0.93, 0.42, (0, 0, z), (0, 0, 0), mats["Material_Mechanical"], lod, "captive_mast_collar", root, 24, 0.08)
        if lod < 2:
            for side in (-1, 1):
                box(f"Cassette_{index}_{side}", (0.54, 1.08, 2.85), (side*0.92, 0, z+0.25), (0, 0, 0), mats["Material_Hull"], lod, "removable_service_cassette", root, 0.11)
        if lod == 0:
            for side in (-1, 1):
                for dz in (-0.92, 0.92):
                    cylinder(f"CassetteBolt_{index}_{side}_{dz}", 0.085, 0.14, (side*1.205, 0, z+0.25+dz), (0, math.pi/2, 0), mats["Material_Decal"], lod, "captive_fastener", root, 12, 0.04)

    # A continuous power/service trunk and ladder communicate maintenance access.
    box("PowerTrunk", (0.42, 0.50, 15.9), (-0.88, -0.64, 12.2), (0, 0, 0), mats["Material_Ceramic"], lod, "insulated_power_trunk", root, 0.07)
    if lod == 0:
        for rung, z in enumerate([5.0 + i*1.05 for i in range(13)]):
            box(f"LadderRung_{rung}", (1.32, 0.14, 0.14), (0, 0.86, z), (0, 0, 0), mats["Material_Mechanical"], lod, "maintenance_ladder", root, 0.035)
        box("InspectionHatch", (1.55, 0.30, 2.05), (0, 0.91, 11.4), (0, 0, 0), mats["Material_Hull"], lod, "inspection_hatch", root, 0.08)

    # Cold plates are broad enough to survive the game camera and are physically rooted.
    cylinder("ThermalRoot", 1.06, 0.52, (0, 0, 21.75), (0, 0, 0), mats["Material_Mechanical"], lod, "thermal_interface", root, 24, 0.07)
    plate_count = 3 if lod == 0 else 2 if lod == 1 else 1
    for side in (-1, 1):
        box(f"ColdPlateRoot_{side}", (1.4, 0.48, 0.62), (side*1.15, 0, 21.75), (0, 0, 0), mats["Material_Mechanical"], lod, "cold_plate_root", root, 0.08)
        for plate in range(plate_count):
            y = (plate-(plate_count-1)/2)*0.48
            box(f"ColdPlate_{side}_{plate}", (1.80, 0.16, 2.65), (side*2.10, y, 22.05), (0, 0, 0), mats["Material_Radiator"], lod, "directional_cold_plate", root, 0.055)

    # Dark ceramic signal cartridge with four finite directional apertures.
    cylinder("SignalLowerCoupler", 1.05, 0.66, (0, 0, 23.55), (0, 0, 0), mats["Material_Mechanical"], lod, "replaceable_signal_coupler", root, 24, 0.08)
    cylinder("SignalHousing", 1.48, 3.85, (0, 0, 25.75), (0, 0, 0), mats["Material_Ceramic"], lod, "signal_ceramic_cartridge", root, 16, 0.08)
    cylinder("SignalTopArmor", 1.72, 0.54, (0, 0, 27.92), (0, 0, 0), mats["Material_Hull"], lod, "signal_head_armor_cap", root, 20, 0.08)
    lens_count = 4 if lod < 2 else 2
    for index in range(lens_count):
        angle = math.tau*index/lens_count
        radial_box(f"SignalLens_{index}", 1.50, angle, (0.22, 1.02, 1.72), 25.85, mats["Material_Accent"], lod, "bounded_lane_status_optic", root, 0.045)
        if lod == 0:
            radial_box(f"LensBrow_{index}", 1.66, angle, (0.32, 1.34, 0.22), 26.87, mats["Material_Mechanical"], lod, "optic_micrometeoroid_brow", root, 0.045)

    # Offset rangefinder prevents a generic symmetrical glowing-totem read.
    box("RangefinderBoom", (2.0, 0.34, 0.34), (1.45, 0, 28.35), (0, 0, 0), mats["Material_Mechanical"], lod, "rangefinder_boom", root, 0.06)
    cylinder("RangefinderBody", 0.62, 0.72, (2.45, 0, 28.35), (0, math.pi/2, 0), mats["Material_Ceramic"], lod, "directional_rangefinder", root, 18, 0.07)
    cylinder("RangefinderLens", 0.34, 0.12, (2.84, 0, 28.35), (0, math.pi/2, 0), mats["Material_Accent"], lod, "bounded_rangefinder_optic", root, 16, 0.05)
    cylinder("AntennaBase", 0.54, 0.35, (0, 0, 28.60), (0, 0, 0), mats["Material_Mechanical"], lod, "antenna_mount", root, 18, 0.06)
    cylinder("Antenna", 0.13 if lod < 2 else 0.18, 2.0, (0, 0, 29.78), (0, 0, 0), mats["Material_Mechanical"], lod, "lane_telemetry_antenna", root, 14, 0.04)

    # Non-emissive safety bars remain readable if the signal is disabled.
    for side in (-1, 1):
        box(f"SafetyContact_{side}", (0.28, 1.54, 2.35), (side*1.32, -0.60, 3.45), (0, 0, 0), mats["Material_Safety"], lod, "service_contact_exclusion", root, 0.055)


def add_identity_text(mats, root) -> None:
    for index, (body, size, location, extrude) in enumerate((
        ("L-47", 0.55, (0, -1.13, 16.3), 0.024),
        ("MERIDIAN", 0.23, (0, -1.14, 15.5), 0.016),
    )):
        curve = bpy.data.curves.new(f"BeaconIdentity_{index}", "FONT")
        curve.body = body
        curve.align_x = "CENTER"
        curve.align_y = "CENTER"
        curve.size = size
        curve.extrude = extrude
        curve.bevel_depth = 0.006
        curve.bevel_resolution = 1
        obj = bpy.data.objects.new(f"LOD0_Beacon_Identity_{index}", curve)
        bpy.context.scene.collection.objects.link(obj)
        obj.location = location
        obj.rotation_euler = (math.pi/2, 0, 0)
        obj.data.materials.append(mats["Material_Decal"])
        tag(obj, 0, "Material_Decal", "non_emissive_manufacturer_identity", root)
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        bpy.ops.object.convert(target="MESH")
        obj.select_set(False)


def apply_modifiers_and_uv() -> list[str]:
    failures = []
    for obj in sorted((item for item in bpy.data.objects if item.type == "MESH"), key=lambda item: item.name):
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        for modifier in list(obj.modifiers):
            try:
                bpy.ops.object.modifier_apply(modifier=modifier.name)
            except Exception as exc:
                failures.append(f"{obj.name}/{modifier.name}: {exc}")
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        obj.data.validate(clean_customdata=False)
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
        if not obj.data.uv_layers:
            obj.data.uv_layers.new(name="UVMap")
        try:
            bpy.ops.object.mode_set(mode="EDIT")
            bpy.ops.mesh.select_all(action="SELECT")
            bpy.ops.uv.smart_project(angle_limit=math.radians(58.0), island_margin=0.012)
            bpy.ops.object.mode_set(mode="OBJECT")
        except Exception as exc:
            failures.append(f"{obj.name}/UV: {exc}")
            if obj.mode != "OBJECT":
                bpy.ops.object.mode_set(mode="OBJECT")
        obj.select_set(False)
    return failures


def join_draw_groups(materials, root) -> None:
    for lod in range(3):
        for material_name, material_value in materials.items():
            matches = [
                obj for obj in bpy.data.objects
                if obj.type == "MESH" and obj.name.startswith(f"LOD{lod}_")
                and obj.data.materials and obj.data.materials[0] == material_value
            ]
            if not matches:
                continue
            bpy.ops.object.select_all(action="DESELECT")
            for obj in matches:
                obj.select_set(True)
            bpy.context.view_layer.objects.active = matches[0]
            if len(matches) > 1:
                bpy.ops.object.join()
            joined = bpy.context.object
            joined.name = f"LOD{lod}_Beacon_{material_name}"
            joined.parent = root
            joined["spaceface.lod"] = f"lod{lod}"
            joined["spaceface.lodLevel"] = lod
            joined["spaceface.materialRole"] = material_name
            joined["spaceface.structureRole"] = "merged_functional_draw_group"
            triangulate = joined.modifiers.new("SF_ExportTriangulate", "TRIANGULATE")
            triangulate.keep_custom_normals = True
            bpy.ops.object.modifier_apply(modifier=triangulate.name)
            joined.select_set(False)


def tangent_results() -> list[dict]:
    results = []
    for obj in sorted((item for item in bpy.data.objects if item.type == "MESH"), key=lambda item: item.name):
        mesh = obj.data
        mesh.calc_loop_triangles()
        error = None
        valid = False
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
        results.append({"object": obj.name, "valid": valid, "error": error, "loops": len(mesh.loops)})
    return results


def triangles(obj) -> int:
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


def bounds(objects):
    points = [obj.matrix_world @ Vector(corner) for obj in objects for corner in obj.bound_box]
    low = [min(point[axis] for point in points) for axis in range(3)]
    high = [max(point[axis] for point in points) for axis in range(3)]
    return {"min": low, "max": high, "size": [high[i]-low[i] for i in range(3)]}


def export_glb(target: Path, root) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    for obj in bpy.data.objects:
        if obj.type not in {"LIGHT", "CAMERA"}:
            obj.select_set(True)
    bpy.context.view_layer.objects.active = root
    target.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(target), export_format="GLB", use_selection=True,
        export_yup=True, export_apply=True, export_extras=True,
        export_texcoords=True, export_normals=True, export_tangents=True,
        export_materials="EXPORT",
    )
    bpy.ops.object.select_all(action="DESELECT")


def family_update(report_path: Path, maps_manifest: Path) -> Path:
    target = report_path.with_name("opening-infrastructure-beacon-family-update.json")
    value = {
        "schema": "spaceface.openingInfrastructureFamilyUpdate.v1",
        "status": "candidate-not-promoted",
        "surfaceManifest": str(maps_manifest.resolve()),
        "manufacturer": "Meridian Transit Works",
        "sharedLanguage": {
            "loadPath": "dark exposed-alloy frame with coated replaceable service armor",
            "poweredSystem": "ceramic-insulated cartridges with finite cyan-white apertures",
            "maintenance": "amber only on service-release and contact-exclusion surfaces",
            "identity": "non-emissive bone-white lane number and maker marking",
            "heatManagement": "directional cold plates attached to explicit thermal roots",
        },
        "place_lane_beacon": {
            "candidateState": "implemented-not-promoted",
            "macro": ["four-point anchored foundation", "continuous mast", "offset rangefinder", "bounded signal cartridge"],
            "meso": ["removable service cassettes", "ladder and inspection hatch", "power trunk", "cold plates", "captive collars"],
            "micro": ["physical edge catches", "controlled PBR variation", "captive fasteners", "manufacturer lettering"],
        },
        "nextFamilyRecipe": {
            "place_nav_buoy": "shorter self-righting body; reuse signal cartridge and material roles, but use battery cassette, tow clevis and three sensor facets",
        },
        "nonGoals": ["full-body glow", "color-swap differentiation", "uniform grunge", "screen-space bloom as construction"],
    }
    target.write_text(json.dumps(value, indent=2), encoding="utf-8")
    return target


def main() -> None:
    args = cli()
    args.maps_root = args.maps_root.resolve()
    args.output_blend = args.output_blend.resolve()
    args.output_glb = args.output_glb.resolve()
    args.report = args.report.resolve()
    source_path = Path(bpy.data.filepath).resolve()
    maps_manifest = args.maps_root / "surface-map-build.json"
    root = bpy.data.objects.get("PLACE_LANE_BEACON_ROOT")
    socket = bpy.data.objects.get("SOCKET_Beacon_Core")
    hook = bpy.data.objects.get("HOOK_Emissive")
    if root is None or socket is None or hook is None:
        raise RuntimeError("Expected beacon root, SOCKET_Beacon_Core and HOOK_Emissive")

    # Candidate-local rebuild: preserve semantic empties, remove only loaded source meshes.
    for obj in list(bpy.data.objects):
        if obj.type == "MESH":
            bpy.data.objects.remove(obj, do_unlink=True)
    for material in list(bpy.data.materials):
        bpy.data.materials.remove(material, do_unlink=True)
    for image in list(bpy.data.images):
        bpy.data.images.remove(image, do_unlink=True)

    materials = {name: make_material(name, role, args.maps_root) for name, role in ROLE_BY_MATERIAL.items()}
    for lod in range(3):
        build_lod(lod, materials, root)
    add_identity_text(materials, root)
    failures = apply_modifiers_and_uv()
    join_draw_groups(materials, root)

    tangents = tangent_results()
    failed_tangents = [entry for entry in tangents if not entry["valid"]]
    if failed_tangents:
        raise RuntimeError(f"Tangent validation failed: {failed_tangents[:5]}")
    scale_failures = [obj.name for obj in bpy.data.objects if obj.type == "MESH" and any(abs(float(v)-1.0) > 1e-5 for v in obj.scale)]
    if scale_failures:
        raise RuntimeError(f"Unapplied transforms: {scale_failures[:8]}")

    lod_meshes = {
        lod: sorted([obj for obj in bpy.data.objects if obj.type == "MESH" and obj.name.startswith(f"LOD{lod}_Beacon_")], key=lambda item: item.name)
        for lod in range(3)
    }
    lod_stats = {
        f"lod{lod}": {"triangles": sum(triangles(obj) for obj in meshes), "drawGroups": len(meshes), "objects": [obj.name for obj in meshes]}
        for lod, meshes in lod_meshes.items()
    }
    candidate_bounds = bounds(lod_meshes[0])
    canonical_size = (6.05895710, 6.07550430, 30.54999924)
    scale_drift = [abs(candidate_bounds["size"][axis] - canonical_size[axis]) / canonical_size[axis] for axis in range(3)]
    if any(value > 0.08 for value in scale_drift):
        raise RuntimeError(f"Canonical scale drift exceeds 8%: {scale_drift}, bounds={candidate_bounds}")
    root["spaceface.family"] = "meridian_opening_infrastructure_v1"
    root["spaceface.surfaceRevision"] = "opening_lane_beacon_v1"
    root["spaceface.manufacturer"] = "Meridian Transit Works"
    root["spacefaceAssetJson"] = json.dumps({
        "contractVersion": 1,
        "assetId": "PLACE_LANE_BEACON_ROOT",
        "partId": "place_lane_beacon",
        "liveId": "place_lane_beacon",
        "slot": "place",
        "forward": "+X",
        "up": "+Y",
        "starboard": "+Z",
        "unit": "metre",
        "normalConvention": "OpenGL",
        "ormChannels": "R=AO,G=Roughness,B=Metallic",
        "textureCompression": "PNG-source/KTX2-release-candidate",
        "textureSize": 512,
        "family": "meridian_opening_infrastructure_v1",
        "manufacturer": "Meridian Transit Works",
        "role": "tutorial_lane_beacon",
        "title": "Meridian Lane Beacon L-47",
        "deliverableRole": "production_multi_lod_candidate",
        "lods": ["lod0", "lod1", "lod2"],
        "lodTriangles": {key: value["triangles"] for key, value in lod_stats.items()},
        "drawGroupsPerLod": {key: value["drawGroups"] for key, value in lod_stats.items()},
        "wiringStatus": "candidate_not_promoted",
    }, separators=(",", ":"))
    bpy.context.scene["spacefaceAssetJson"] = root["spacefaceAssetJson"]

    args.output_blend.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(args.output_blend), check_existing=False)
    export_glb(args.output_glb, root)
    family_path = family_update(args.report, maps_manifest)

    report = {
        "schema": "spaceface.openingLaneBeaconRemaster.v1",
        "status": "candidate-not-promoted",
        "source": {"path": str(source_path), "sha256": sha256(source_path)},
        "surfaceManifest": {"path": str(maps_manifest), "sha256": sha256(maps_manifest)},
        "outputs": {
            "blend": {"path": str(args.output_blend), "sha256": sha256(args.output_blend)},
            "glb": {"path": str(args.output_glb), "sha256": sha256(args.output_glb)},
            "familyUpdate": {"path": str(family_path), "sha256": sha256(family_path)},
        },
        "preservedContract": {
            "sourceBounds": {"min": [-3.02947855, -3.03775215, 0.25], "max": [3.02947855, 3.03775215, 30.79999924], "size": [6.05895710, 6.07550430, 30.54999924]},
            "candidateBounds": candidate_bounds,
            "relativeSizeDrift": scale_drift,
            "root": {"name": root.name, "location": list(root.location), "rotation": list(root.rotation_euler), "scale": list(root.scale)},
            "socket": {"name": socket.name, "location": list(socket.location)},
            "hook": {"name": hook.name, "location": list(hook.location)},
        },
        "materials": [{"name": name, "textureRole": role} for name, role in ROLE_BY_MATERIAL.items()],
        "lod": lod_stats,
        "modifierOrUvFailures": failures,
        "tangents": tangents,
        "knownDefects": [
            "Candidate has not been promoted or inspected on the live player route.",
            "KTX2 loader binding and release meshopt optimization remain controller-owned integration work.",
            "Runtime LOD thresholds must be checked after promotion at default tutorial-route camera distance.",
            "Navigation buoy remains a family recipe; it is not remastered in this candidate.",
        ],
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({"ok": True, "blend": str(args.output_blend), "glb": str(args.output_glb), "report": str(args.report), "lod": lod_stats}))


if __name__ == "__main__":
    main()
