#!/usr/bin/env python3
"""Build a non-promoting, production-oriented navigation buoy candidate.

The canonical authored blend is opened read-only by the caller and never overwritten.
This candidate preserves its runtime root, socket, emissive hook, gameplay scale, and
asymmetric tow envelope while rebuilding the visible asset as a compact self-righting
navigation body.  It shares Meridian's accepted material language with the lane beacon,
but its construction, proportions, service access, telemetry, and optics are authored
for a buoy rather than derived by scaling the beacon.
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
SOURCE_BOUNDS = {
    "min": [-1.10000002, -1.10000002, 0.05388606],
    "max": [1.96197379, 1.10000002, 5.42971325],
    "size": [3.06197381, 2.20000005, 5.37582719],
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
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
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
        principled.inputs["Emission Strength"].default_value = 1.35

    if name == "Material_Hull":
        principled.inputs["Coat Weight"].default_value = 0.10
        principled.inputs["Coat Roughness"].default_value = 0.34
    elif name == "Material_Accent":
        principled.inputs["Coat Weight"].default_value = 0.42
        principled.inputs["Coat Roughness"].default_value = 0.14
        principled.inputs["IOR"].default_value = 1.46
    links.new(principled.outputs["BSDF"], output.inputs["Surface"])

    material["spaceface.semantic"] = name
    material["spaceface.textureRole"] = role
    material["spaceface.ormChannels"] = "R=AO,G=Roughness,B=Metallic"
    material["spaceface.normalConvention"] = "OpenGL tangent space"
    material["spaceface.manufacturer"] = "Meridian Transit Works"
    return material


def tag(obj, lod: int, material_name: str, structure_role: str, root) -> None:
    obj.parent = root
    obj["spaceface.lod"] = f"lod{lod}"
    obj["spaceface.lodLevel"] = lod
    obj["spaceface.materialRole"] = material_name
    obj["spaceface.structureRole"] = structure_role
    obj["spaceface.authoredConstruction"] = True


def add_bevel(obj, width: float, lod: int) -> None:
    modifier = obj.modifiers.new("SF_PhysicalEdge", "BEVEL")
    modifier.width = max(0.009, width * (1.0 if lod == 0 else 0.70 if lod == 1 else 0.46))
    modifier.segments = 3 if lod == 0 else 2 if lod == 1 else 1
    modifier.limit_method = "ANGLE"
    modifier.harden_normals = True


def box(name, dimensions, location, rotation, mat, lod, role, root, bevel=0.04):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = f"LOD{lod}_Buoy_{name}"
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    obj.data.materials.append(mat)
    add_bevel(obj, bevel, lod)
    tag(obj, lod, mat.name, role, root)
    return obj


def cylinder(name, radius, depth, location, rotation, mat, lod, role, root, vertices=24, bevel=0.05):
    count = max(8, vertices if lod == 0 else vertices // 2 if lod == 1 else vertices // 3)
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=count, radius=radius, depth=depth, end_fill_type="NGON",
        location=location, rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = f"LOD{lod}_Buoy_{name}"
    obj.data.materials.append(mat)
    add_bevel(obj, min(radius, depth) * bevel, lod)
    tag(obj, lod, mat.name, role, root)
    return obj


def cone(name, radius1, radius2, depth, location, mat, lod, role, root, vertices=24, bevel=0.05):
    count = max(8, vertices if lod == 0 else vertices // 2 if lod == 1 else vertices // 3)
    bpy.ops.mesh.primitive_cone_add(
        vertices=count, radius1=radius1, radius2=radius2, depth=depth,
        end_fill_type="NGON", location=location,
    )
    obj = bpy.context.object
    obj.name = f"LOD{lod}_Buoy_{name}"
    obj.data.materials.append(mat)
    add_bevel(obj, min(radius1, radius2, depth) * bevel, lod)
    tag(obj, lod, mat.name, role, root)
    return obj


def beam(name, start, end, width, mat, lod, role, root, bevel=0.025):
    a, b = Vector(start), Vector(end)
    delta = b - a
    obj = box(name, (width, width, delta.length), (a + b) * 0.5, (0, 0, 0), mat, lod, role, root, bevel)
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = delta.to_track_quat("Z", "Y")
    obj.rotation_mode = "XYZ"
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    obj.select_set(False)
    return obj


def radial_box(name, radius, angle, dimensions, z, mat, lod, role, root, bevel=0.035):
    return box(
        name, dimensions,
        (math.cos(angle) * radius, math.sin(angle) * radius, z),
        (0, 0, angle), mat, lod, role, root, bevel,
    )


def build_lod(lod: int, mats, root) -> None:
    # Dense lower mass and broad impact ring visually explain self-righting behavior.
    cone("BallastKeel", 0.78, 1.02, 0.76, (0, 0, 0.44), mats["Material_Mechanical"], lod, "dense_self_righting_ballast", root, 28, 0.08)
    cylinder("ImpactRing", 1.075, 0.24, (0, 0, 0.18), (0, 0, 0), mats["Material_Mechanical"], lod, "replaceable_micrometeoroid_impact_ring", root, 28, 0.07)
    cone("LowerArmor", 1.02, 0.88, 0.78, (0, 0, 0.98), mats["Material_Hull"], lod, "ballast_access_armor", root, 24, 0.07)
    cylinder("ServiceDrum", 0.88, 1.18, (0, 0, 1.67), (0, 0, 0), mats["Material_Hull"], lod, "faceted_battery_and_controller_drum", root, 20, 0.07)
    cylinder("DrumLowerCollar", 0.98, 0.22, (0, 0, 1.12), (0, 0, 0), mats["Material_Mechanical"], lod, "captive_service_drum_collar", root, 24, 0.07)
    cylinder("DrumUpperCollar", 0.96, 0.24, (0, 0, 2.24), (0, 0, 0), mats["Material_Mechanical"], lod, "telemetry_load_transfer_collar", root, 24, 0.07)

    # A visibly replaceable battery cassette and a different controller access zone.
    box("BatteryCassette", (0.52, 1.42, 0.74), (-0.74, 0, 1.68), (0, 0, 0), mats["Material_Hull"], lod, "replaceable_power_cassette", root, 0.07)
    box("BatteryInsulator", (0.12, 1.08, 0.48), (-1.015, 0, 1.68), (0, 0, 0), mats["Material_Ceramic"], lod, "battery_cassette_insulator", root, 0.025)
    box("TelemetryHatch", (0.84, 0.12, 0.56), (0, -0.91, 1.74), (0, 0, 0), mats["Material_Safety"], lod, "telemetry_service_release", root, 0.032)

    # An asymmetric towing clevis preserves the source footprint and reads as function.
    for side in (-1, 1):
        beam(f"TowArm_{side}", (0.58, side * 0.58, 1.12), (1.68, side * 0.46, 1.12), 0.20, mats["Material_Mechanical"], lod, "tow_load_clevis_arm", root, 0.03)
        beam(f"TowBrace_{side}", (0.48, side * 0.62, 1.55), (1.68, side * 0.46, 1.12), 0.16, mats["Material_Mechanical"], lod, "triangulated_tow_reaction_brace", root, 0.025)
    cylinder("TowPin", 0.15, 1.02, (1.78, 0, 1.12), (math.pi / 2, 0, 0), mats["Material_Safety"], lod, "captured_tow_and_service_pin", root, 18, 0.05)
    cylinder("TowEye", 0.31, 0.22, (1.80, 0, 1.12), (math.pi / 2, 0, 0), mats["Material_Mechanical"], lod, "towing_eye_load_spreader", root, 20, 0.06)

    # Thermal root and separated cold plates provide a plausible heat path.
    cylinder("ThermalRoot", 0.76, 0.18, (0, 0, 2.49), (0, 0, 0), mats["Material_Mechanical"], lod, "battery_thermal_interface", root, 22, 0.06)
    fin_count = 4 if lod == 0 else 3 if lod == 1 else 2
    for index in range(fin_count):
        angle = (index - (fin_count - 1) * 0.5) * math.radians(18)
        radial_box(f"ColdPlate_{index}", 0.80, math.pi / 2 + angle, (0.72, 0.12, 0.70), 2.52, mats["Material_Radiator"], lod, "directional_battery_cold_plate", root, 0.024)

    # Compact, shielded telemetry crown with finite directional apertures.
    cylinder("TelemetryCoupler", 0.64, 0.36, (0, 0, 2.72), (0, 0, 0), mats["Material_Mechanical"], lod, "replaceable_telemetry_coupler", root, 22, 0.07)
    cylinder("TelemetryCeramic", 0.72, 1.22, (0, 0, 3.42), (0, 0, 0), mats["Material_Ceramic"], lod, "insulated_navigation_transceiver", root, 16, 0.07)
    cylinder("TelemetryCap", 0.84, 0.24, (0, 0, 4.08), (0, 0, 0), mats["Material_Hull"], lod, "transceiver_armor_cap", root, 20, 0.07)
    lens_count = 3 if lod < 2 else 2
    for index in range(lens_count):
        angle = math.tau * index / lens_count + math.radians(30)
        # The powered face is a small inset inside a replaceable alloy cassette;
        # it is not a glowing tile pasted onto the pressure/telemetry vessel.
        radial_box(f"OpticCassette_{index}", 0.75, angle, (0.22, 0.72, 0.78), 3.48, mats["Material_Mechanical"], lod, "replaceable_navigation_optic_cassette", root, 0.030)
        radial_box(f"SignalAperture_{index}", 0.87, angle, (0.075, 0.40, 0.34), 3.48, mats["Material_Accent"], lod, "recessed_bounded_navigation_aperture", root, 0.018)
        radial_box(f"OpticBrow_{index}", 0.83, angle, (0.20, 0.76, 0.11), 3.88, mats["Material_Mechanical"], lod, "aperture_micrometeoroid_brow", root, 0.022)
        radial_box(f"OpticSill_{index}", 0.82, angle, (0.19, 0.70, 0.09), 3.08, mats["Material_Mechanical"], lod, "aperture_service_sill", root, 0.020)

    # The top plate is supported as a solar/coldplate assembly, not a floating slab.
    for side in (-1, 1):
        beam(f"PlateStrut_{side}", (side * 0.42, 0, 4.04), (side * 0.72, 0, 4.72), 0.14, mats["Material_Mechanical"], lod, "solar_plate_load_strut", root, 0.025)
        box(f"SolarPanel_{side}", (1.00, 2.08, 0.12), (side * 0.52, 0, 4.86), (0, 0, 0), mats["Material_Radiator"], lod, "replaceable_power_and_cold_plate", root, 0.032)
    box("SolarSpine", (0.16, 2.14, 0.20), (0, 0, 4.84), (0, 0, 0), mats["Material_Mechanical"], lod, "solar_plate_structural_spine", root, 0.028)
    if lod < 2:
        for index, y in enumerate((-0.68, 0.0, 0.68)):
            box(f"SolarBus_{index}", (2.06, 0.055, 0.025), (0, y, 4.925), (0, 0, 0), mats["Material_Decal"], lod, "solar_cell_busbar", root, 0.012)

    cylinder("AntennaBase", 0.26, 0.25, (0, 0, 5.02), (0, 0, 0), mats["Material_Mechanical"], lod, "antenna_load_base", root, 18, 0.05)
    cylinder("Antenna", 0.07 if lod < 2 else 0.10, 0.74, (0, 0, 5.06), (0, 0, 0), mats["Material_Mechanical"], lod, "low_gain_telemetry_antenna", root, 12, 0.04)

    # Captive fasteners are restricted to maintenance boundaries at LOD0.
    if lod == 0:
        for index, (x, y, z, rotation) in enumerate((
            (-1.08, -0.42, 1.46, (0, math.pi / 2, 0)),
            (-1.08, 0.42, 1.46, (0, math.pi / 2, 0)),
            (-1.08, -0.42, 1.90, (0, math.pi / 2, 0)),
            (-1.08, 0.42, 1.90, (0, math.pi / 2, 0)),
            (-0.29, -0.98, 1.58, (math.pi / 2, 0, 0)),
            (0.29, -0.98, 1.58, (math.pi / 2, 0, 0)),
        )):
            cylinder(f"ServiceFastener_{index}", 0.045, 0.10, (x, y, z), rotation, mats["Material_Mechanical"], lod, "captive_service_fastener", root, 10, 0.03)

    # Non-emissive identity stripe remains readable if the signal is disabled.
    box("IdentityBand", (0.62, 0.08, 0.30), (0, -0.955, 2.02), (0, 0, 0), mats["Material_Decal"], lod, "non_emissive_buoy_identity_field", root, 0.018)


def add_identity_text(mats, root) -> None:
    for index, (body, size, location, extrude) in enumerate((
        ("NB-12", 0.21, (0, -1.005, 2.08), 0.012),
        ("MTW", 0.11, (0, -1.006, 1.89), 0.008),
    )):
        curve = bpy.data.curves.new(f"BuoyIdentity_{index}", "FONT")
        curve.body = body
        curve.align_x = "CENTER"
        curve.align_y = "CENTER"
        curve.size = size
        curve.extrude = extrude
        curve.bevel_depth = 0.003
        curve.bevel_resolution = 1
        obj = bpy.data.objects.new(f"LOD0_Buoy_Identity_{index}", curve)
        bpy.context.scene.collection.objects.link(obj)
        obj.location = location
        obj.rotation_euler = (math.pi / 2, 0, 0)
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


def join_draw_groups(materials, root, hook) -> None:
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
            joined.name = f"LOD{lod}_Buoy_{material_name}"
            parent = hook if material_name == "Material_Accent" else root
            world = joined.matrix_world.copy()
            joined.parent = parent
            joined.matrix_world = world
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
    return {"min": low, "max": high, "size": [high[i] - low[i] for i in range(3)]}


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
    target = report_path.with_name("opening-infrastructure-nav-buoy-family-update.json")
    value = {
        "schema": "spaceface.openingInfrastructureFamilyUpdate.v1",
        "status": "candidate-not-promoted",
        "surfaceManifest": str(maps_manifest.resolve()),
        "manufacturer": "Meridian Transit Works",
        "sharedWithLaneBeacon": [
            "coated armor over exposed alloy load paths",
            "ceramic-insulated transceiver zones",
            "finite cyan-white signal apertures",
            "amber restricted to release and tow-contact hardware",
            "non-emissive bone-white service identity",
            "directional cold plates attached to explicit thermal roots",
        ],
        "place_nav_buoy": {
            "candidateState": "implemented-not-promoted",
            "macro": ["self-righting ballast keel", "compact service drum", "asymmetric tow clevis", "supported solar/coldplate crown"],
            "meso": ["replaceable battery cassette", "telemetry release hatch", "thermal interface and cold plates", "three shielded signal facets"],
            "micro": ["physical edge catches", "controlled PBR variation", "captive maintenance fasteners", "NB-12 manufacturer identity"],
            "structuralDifferentiation": "short weighted service body with towing and telemetry logic, not a scaled lane mast",
        },
        "nonGoals": ["full-body glow", "color-swap differentiation", "uniform grunge", "floating solar slab", "screen-space bloom as construction"],
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
    root = bpy.data.objects.get("place_nav_buoy")
    socket = bpy.data.objects.get("SOCKET_Buoy_Top")
    hook = bpy.data.objects.get("HOOK_Emissive")
    if root is None or socket is None or hook is None:
        raise RuntimeError("Expected place_nav_buoy, SOCKET_Buoy_Top and HOOK_Emissive")
    marker_snapshot = {
        obj.name: {
            "location": list(obj.location),
            "rotation": list(obj.rotation_euler),
            "scale": list(obj.scale),
            "parent": obj.parent.name if obj.parent else None,
        }
        for obj in (root, socket, hook)
    }

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
    join_draw_groups(materials, root, hook)

    tangents = tangent_results()
    failed_tangents = [entry for entry in tangents if not entry["valid"]]
    if failed_tangents:
        raise RuntimeError(f"Tangent validation failed: {failed_tangents[:5]}")
    scale_failures = [
        obj.name for obj in bpy.data.objects if obj.type == "MESH"
        and any(abs(float(value) - 1.0) > 1e-5 for value in obj.scale)
    ]
    if scale_failures:
        raise RuntimeError(f"Unapplied transforms: {scale_failures[:8]}")

    lod_meshes = {
        lod: sorted([
            obj for obj in bpy.data.objects
            if obj.type == "MESH" and obj.name.startswith(f"LOD{lod}_Buoy_")
        ], key=lambda item: item.name)
        for lod in range(3)
    }
    lod_stats = {
        f"lod{lod}": {
            "triangles": sum(triangles(obj) for obj in meshes),
            "drawGroups": len(meshes),
            "objects": [obj.name for obj in meshes],
        }
        for lod, meshes in lod_meshes.items()
    }
    candidate_bounds = bounds(lod_meshes[0])
    size_drift = [
        abs(candidate_bounds["size"][axis] - SOURCE_BOUNDS["size"][axis]) / SOURCE_BOUNDS["size"][axis]
        for axis in range(3)
    ]
    corner_drift = {
        "min": [abs(candidate_bounds["min"][axis] - SOURCE_BOUNDS["min"][axis]) for axis in range(3)],
        "max": [abs(candidate_bounds["max"][axis] - SOURCE_BOUNDS["max"][axis]) for axis in range(3)],
    }
    if any(value > 0.08 for value in size_drift):
        raise RuntimeError(f"Canonical scale drift exceeds 8%: {size_drift}, bounds={candidate_bounds}")

    marker_now = {
        obj.name: {
            "location": list(obj.location),
            "rotation": list(obj.rotation_euler),
            "scale": list(obj.scale),
            "parent": obj.parent.name if obj.parent else None,
        }
        for obj in (root, socket, hook)
    }
    if marker_now != marker_snapshot:
        raise RuntimeError(f"Runtime marker contract changed: before={marker_snapshot}, after={marker_now}")
    hierarchy = {
        obj.name: obj.parent.name if obj.parent else None
        for obj in bpy.data.objects if obj.type == "MESH"
    }
    if not all(hierarchy.get(f"LOD{lod}_Buoy_Material_Accent") == hook.name for lod in range(3)):
        raise RuntimeError(f"Optic hierarchy lost: {hierarchy}")

    root["spaceface.family"] = "meridian_opening_infrastructure_v1"
    root["spaceface.surfaceRevision"] = "opening_nav_buoy_v1"
    root["spaceface.manufacturer"] = "Meridian Transit Works"
    root["spacefaceAssetJson"] = json.dumps({
        "contractVersion": 1,
        "assetId": "place_nav_buoy",
        "partId": "place_nav_buoy",
        "liveId": "place_nav_buoy",
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
        "role": "self_righting_navigation_buoy",
        "title": "Meridian Navigation Buoy NB-12",
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
        "schema": "spaceface.openingNavBuoyRemaster.v1",
        "status": "candidate-not-promoted",
        "source": {"path": str(source_path), "sha256": sha256(source_path)},
        "surfaceManifest": {"path": str(maps_manifest), "sha256": sha256(maps_manifest)},
        "outputs": {
            "blend": {"path": str(args.output_blend), "sha256": sha256(args.output_blend)},
            "glb": {"path": str(args.output_glb), "sha256": sha256(args.output_glb)},
            "familyUpdate": {"path": str(family_path), "sha256": sha256(family_path)},
        },
        "preservedContract": {
            "sourceBounds": SOURCE_BOUNDS,
            "candidateBounds": candidate_bounds,
            "relativeSizeDrift": size_drift,
            "minimumCornerDriftM": corner_drift,
            "markers": marker_now,
            "meshHierarchy": hierarchy,
        },
        "materials": [{"name": name, "textureRole": role} for name, role in ROLE_BY_MATERIAL.items()],
        "lod": lod_stats,
        "modifierOrUvFailures": failures,
        "tangents": tangents,
        "knownDefects": [
            "Candidate has not been promoted or inspected on the live player route.",
            "KTX2 loader binding and release meshopt optimization remain controller-owned integration work.",
            "Runtime LOD thresholds, signal intensity and tow-clevis silhouette require live checks after promotion.",
            "The candidate intentionally reuses accepted beacon material maps; future atlasing must preserve role-specific UV scale.",
        ],
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({
        "ok": True,
        "blend": str(args.output_blend),
        "glb": str(args.output_glb),
        "report": str(args.report),
        "lod": lod_stats,
        "bounds": candidate_bounds,
        "hierarchy": hierarchy,
    }))


if __name__ == "__main__":
    main()
