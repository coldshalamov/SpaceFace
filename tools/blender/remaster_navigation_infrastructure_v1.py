#!/usr/bin/env python3
"""Dispatch a contract-strict navigation-infrastructure candidate build.

This script reuses the already-authored opening-infrastructure construction geometry
without editing its owner scripts.  It replaces the earlier shared/plastic surface
language with asset-specific PBR roles, fits every LOD to the exact source envelope,
and verifies every original EMPTY transform after the candidate build.
"""
from __future__ import annotations

import hashlib
import importlib
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


ASSETS = {
    "place_lane_beacon": {
        "module": "tools.blender.remaster_opening_lane_beacon_v1",
        "root": "PLACE_LANE_BEACON_ROOT",
        "prefix": "Beacon",
        "bounds": {"min": (-3.02947855, -3.03775215, 0.25), "max": (3.02947855, 3.03775215, 30.79999924)},
        "roles": {
            "Material_Hull": "lane_beacon_painted_shell",
            "Material_Mechanical": "lane_beacon_service_alloy",
            "Material_Ceramic": "lane_beacon_signal_ceramic",
            "Material_Accent": "lane_beacon_longrange_optic",
            "Material_Radiator": "lane_beacon_coldplate",
            "Material_Safety": "lane_beacon_contact_marking",
            "Material_Decal": "lane_beacon_authority_decal",
            "Material_Cable": "lane_beacon_cable_jacket",
            "Material_Retro": "lane_beacon_lane_retroreflector",
        },
        "normal": {
            "lane_beacon_painted_shell": 0.12,
            "lane_beacon_service_alloy": 0.10,
            "lane_beacon_signal_ceramic": 0.09,
            "lane_beacon_longrange_optic": 0.045,
            "lane_beacon_coldplate": 0.10,
            "lane_beacon_contact_marking": 0.075,
            "lane_beacon_authority_decal": 0.045,
            "lane_beacon_cable_jacket": 0.055,
            "lane_beacon_lane_retroreflector": 0.035,
        },
        "title": "Meridian Lane Authority Beacon L-47",
        "identity": "maintained long-range route authority",
    },
    "place_nav_buoy": {
        "module": "tools.blender.remaster_opening_nav_buoy_v1",
        "root": "place_nav_buoy",
        "prefix": "Buoy",
        "bounds": {"min": (-1.10000002, -1.10000002, 0.05388606), "max": (1.96197379, 1.10000002, 5.42971325)},
        "roles": {
            "Material_Hull": "nav_buoy_coated_pressure_shell",
            "Material_Mechanical": "nav_buoy_field_alloy",
            "Material_Ceramic": "nav_buoy_sensor_ceramic",
            "Material_Accent": "nav_buoy_local_optic",
            "Material_Radiator": "nav_buoy_battery_coldplate",
            "Material_Safety": "nav_buoy_tow_marking",
            "Material_Decal": "nav_buoy_service_decal",
            "Material_Cast": "nav_buoy_cast_collar",
            "Material_Boom": "nav_buoy_exposed_boom_alloy",
            "Material_Cable": "nav_buoy_cable_jacket",
            "Material_SensorHousing": "nav_buoy_sensor_housing",
            "Material_SolarCell": "nav_buoy_solar_cell",
        },
        "normal": {
            "nav_buoy_coated_pressure_shell": 0.14,
            "nav_buoy_field_alloy": 0.12,
            "nav_buoy_sensor_ceramic": 0.10,
            "nav_buoy_local_optic": 0.050,
            "nav_buoy_battery_coldplate": 0.11,
            "nav_buoy_tow_marking": 0.09,
            "nav_buoy_service_decal": 0.050,
            "nav_buoy_cast_collar": 0.075,
            "nav_buoy_exposed_boom_alloy": 0.065,
            "nav_buoy_cable_jacket": 0.048,
            "nav_buoy_sensor_housing": 0.060,
            "nav_buoy_solar_cell": 0.025,
        },
        "title": "Meridian Field Navigation Buoy NB-12",
        "identity": "compact field-serviceable local navigation equipment",
    },
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def matrix_rows(matrix) -> list[list[float]]:
    return [[float(value) for value in row] for row in matrix]


def marker_snapshot() -> dict:
    return {
        obj.name: {
            "type": obj.type,
            "parent": obj.parent.name if obj.parent else None,
            "matrixLocal": matrix_rows(obj.matrix_local),
            "matrixWorld": matrix_rows(obj.matrix_world),
        }
        for obj in sorted((value for value in bpy.data.objects if value.type == "EMPTY"), key=lambda value: value.name)
    }


def mesh_world_bounds(meshes) -> tuple[Vector, Vector]:
    low = Vector((1e12, 1e12, 1e12))
    high = Vector((-1e12, -1e12, -1e12))
    for obj in meshes:
        for vertex in obj.data.vertices:
            point = obj.matrix_world @ vertex.co
            for axis in range(3):
                low[axis] = min(low[axis], point[axis])
                high[axis] = max(high[axis], point[axis])
    return low, high


def fit_meshes_to_bounds(meshes, target_min, target_max) -> dict:
    low, high = mesh_world_bounds(meshes)
    current_size = high - low
    target_min = Vector(target_min)
    target_max = Vector(target_max)
    target_size = target_max - target_min
    if any(abs(current_size[axis]) < 1e-8 for axis in range(3)):
        raise RuntimeError(f"Cannot fit degenerate bounds: low={list(low)} high={list(high)}")
    scale = Vector(tuple(target_size[axis] / current_size[axis] for axis in range(3)))
    for obj in meshes:
        inverse = obj.matrix_world.inverted()
        for vertex in obj.data.vertices:
            world = obj.matrix_world @ vertex.co
            fitted = Vector(tuple(target_min[axis] + (world[axis] - low[axis]) * scale[axis] for axis in range(3)))
            vertex.co = inverse @ fitted
        obj.data.update()
    # Blender's Object.bound_box cache is what the upstream contract report reads.
    # Refresh the dependency graph so that report and export observe the fitted
    # vertex envelope rather than the pre-fit cache.
    bpy.context.view_layer.update()
    final_low, final_high = mesh_world_bounds(meshes)
    error = max(abs(final_low[axis] - target_min[axis]) for axis in range(3))
    error = max(error, max(abs(final_high[axis] - target_max[axis]) for axis in range(3)))
    if error > 1e-4:
        raise RuntimeError(f"Exact envelope fit failed: error={error} low={list(final_low)} high={list(final_high)}")
    return {
        "before": {"min": list(low), "max": list(high), "size": list(current_size)},
        "after": {"min": list(final_low), "max": list(final_high), "size": list(final_high - final_low)},
        "target": {"min": list(target_min), "max": list(target_max), "size": list(target_size)},
        "fitScale": list(scale),
        "maximumCornerErrorM": float(error),
    }


def make_material_factory(module, spec):
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
        base.image = module.load_image(maps_root / f"{role}_basecolor.png", "sRGB")
        base.interpolation = "Linear"
        links.new(base.outputs["Color"], principled.inputs["Base Color"])

        orm = nodes.new("ShaderNodeTexImage")
        orm.name = f"SF_{role}_ORM"
        orm.image = module.load_image(maps_root / f"{role}_orm.png", "Non-Color")
        orm.interpolation = "Linear"
        separate = nodes.new("ShaderNodeSeparateColor")
        separate.name = "SF_ORM_Channels"
        links.new(orm.outputs["Color"], separate.inputs["Color"])
        links.new(separate.outputs["Green"], principled.inputs["Roughness"])
        links.new(separate.outputs["Blue"], principled.inputs["Metallic"])

        gltf_group = bpy.data.node_groups.get("glTF Material Output")
        if gltf_group is None:
            gltf_group = bpy.data.node_groups.new("glTF Material Output", "ShaderNodeTree")
            gltf_group.interface.new_socket(name="Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")
        gltf_output = nodes.new("ShaderNodeGroup")
        gltf_output.name = "SF_glTF_Occlusion"
        gltf_output.node_tree = gltf_group
        links.new(separate.outputs["Red"], gltf_output.inputs["Occlusion"])

        normal = nodes.new("ShaderNodeTexImage")
        normal.name = f"SF_{role}_Normal"
        normal.image = module.load_image(maps_root / f"{role}_normal.png", "Non-Color")
        normal.interpolation = "Linear"
        normal_map = nodes.new("ShaderNodeNormalMap")
        normal_map.name = "SF_Tangent_Normal"
        normal_map.inputs["Strength"].default_value = spec["normal"][role]
        links.new(normal.outputs["Color"], normal_map.inputs["Color"])
        links.new(normal_map.outputs["Normal"], principled.inputs["Normal"])

        emissive_path = maps_root / f"{role}_emissive.png"
        if emissive_path.exists():
            emissive = nodes.new("ShaderNodeTexImage")
            emissive.name = f"SF_{role}_Emissive"
            emissive.image = module.load_image(emissive_path, "sRGB")
            emissive.interpolation = "Linear"
            links.new(emissive.outputs["Color"], principled.inputs["Emission Color"])
            if name == "Material_Retro":
                principled.inputs["Emission Strength"].default_value = 0.28
            else:
                principled.inputs["Emission Strength"].default_value = 0.62 if spec["root"] == "PLACE_LANE_BEACON_ROOT" else 0.34

        if principled.inputs.get("Specular IOR Level"):
            principled.inputs["Specular IOR Level"].default_value = 0.24
        if name in {"Material_Hull", "Material_SensorHousing"}:
            principled.inputs["Coat Weight"].default_value = 0.025
            principled.inputs["Coat Roughness"].default_value = 0.56
        elif name == "Material_Accent":
            principled.inputs["Coat Weight"].default_value = 0.16
            principled.inputs["Coat Roughness"].default_value = 0.22
            principled.inputs["IOR"].default_value = 1.45
        elif name == "Material_SolarCell":
            principled.inputs["Coat Weight"].default_value = 0.08
            principled.inputs["Coat Roughness"].default_value = 0.30
        else:
            principled.inputs["Coat Weight"].default_value = 0.0

        links.new(principled.outputs["BSDF"], output.inputs["Surface"])
        material["spaceface.semantic"] = name
        material["spaceface.textureRole"] = role
        material["spaceface.materialUse"] = spec["identity"]
        material["spaceface.ormChannels"] = "R=AO,G=Roughness,B=Metallic"
        material["spaceface.normalConvention"] = "OpenGL tangent space"
        material["spaceface.manufacturer"] = "Meridian Transit Works"
        material["spaceface.status"] = "candidate-not-promoted"
        return material

    return make_material


def family_update_factory(spec):
    def family_update(report_path: Path, maps_manifest: Path) -> Path:
        target = report_path.with_name("navigation-infrastructure-family-update.json")
        value = {
            "schema": "spaceface.navigationInfrastructureFamilyUpdate.v1",
            "status": "candidate-not-promoted",
            "asset": Path(bpy.data.filepath).stem.removesuffix("_authored"),
            "surfaceManifest": str(maps_manifest.resolve()),
            "manufacturer": "Meridian Transit Works",
            "functionalIdentity": spec["identity"],
            "title": spec["title"],
            "surfacePolicy": "asset-specific material roles; shared manufacturer logic without shared roughness/noise ranges",
            "nonGoals": ["smooth toy surfaces", "tint-only family variation", "full-body emission", "floating cards", "random greeble", "runtime promotion"],
        }
        target.write_text(json.dumps(value, indent=2), encoding="utf-8")
        return target

    return family_update


def _set_material(obj, material, role: str) -> None:
    obj.data.materials.clear()
    obj.data.materials.append(material)
    obj["spaceface.materialRole"] = material.name
    obj["spaceface.structureRole"] = role


def _objects_for(lod: int, prefix: str, token: str) -> list:
    stem = f"LOD{lod}_{prefix}_"
    return [obj for obj in bpy.data.objects if obj.type == "MESH" and obj.name.startswith(stem) and token in obj.name]


def _remove_for(lod: int, prefix: str, token: str) -> None:
    for obj in list(_objects_for(lod, prefix, token)):
        bpy.data.objects.remove(obj, do_unlink=True)


def construction_patch_factory(module, spec):
    """Repair functional silhouette and material ownership before join/export."""
    original_build = module.build_lod

    def patched(lod: int, mats, root) -> None:
        original_build(lod, mats, root)
        if spec["prefix"] == "Beacon":
            _remove_for(lod, "Beacon", "Cassette_")
            _remove_for(lod, "Beacon", "CassetteBolt_")
            for obj in _objects_for(lod, "Beacon", "PowerTrunk"):
                _set_material(obj, mats["Material_Cable"], "shielded_vertical_power_and_telemetry_raceway")

            # Staggered, mechanically connected telemetry modules replace the
            # previous repeated paired boxes. Their alternating service side is
            # readable even when small details filter at gameplay distance.
            service_modules = ((-1, 6.2), (1, 11.4), (-1, 16.6)) if lod < 2 else ((-1, 7.2), (1, 15.3))
            for index, (side, z) in enumerate(service_modules):
                module.box(f"TelemetryModule_{index}", (0.62, 1.18, 1.62), (side * 1.05, 0, z), (0, 0, 0), mats["Material_Hull"], lod, "replaceable_staggered_telemetry_module", root, 0.10)
                module.beam(f"TelemetryBracketLower_{index}", (side * 0.58, -0.36, z - 0.48), (side * 0.93, -0.36, z - 0.48), 0.18, mats["Material_Mechanical"], lod, "telemetry_load_bracket", root, 0.04)
                module.beam(f"TelemetryBracketUpper_{index}", (side * 0.58, 0.36, z + 0.48), (side * 0.93, 0.36, z + 0.48), 0.18, mats["Material_Mechanical"], lod, "telemetry_load_bracket", root, 0.04)
                module.beam(f"TelemetryCableTap_{index}", (-0.64, -0.44, z), (side * 0.78, -0.44, z), 0.11, mats["Material_Cable"], lod, "service_loop_to_telemetry_module", root, 0.025)
                if lod == 0:
                    for dz in (-0.48, 0.48):
                        module.cylinder(f"TelemetryFastener_{index}_{dz}", 0.075, 0.14, (side * 1.38, -0.30, z + dz), (0, math.pi / 2, 0), mats["Material_Decal"], lod, "captive_module_fastener", root, 12, 0.035)

            # A supported bifurcated lane head produces an unmistakable route-
            # authority silhouette without exceeding the inherited envelope.
            module.beam("DirectionalHeadTruss", (-2.78, 0, 26.15), (2.78, 0, 26.15), 0.30, mats["Material_Mechanical"], lod, "paired_lane_head_load_truss", root, 0.04)
            module.box("DirectionalHeadFaceBeam", (5.52, 0.18, 0.34), (0, -0.63, 26.15), (0, 0, 0), mats["Material_Hull"], lod, "lane_facing_signal_head_crossbrace", root, 0.045)
            for index, x in enumerate((-1.55, 1.55)):
                module.box(f"HeadRouteMarker_{index}", (1.05, 0.08, 0.13), (x, -0.755, 26.15), (0, 0, 0), mats["Material_Retro"], lod, "bounded_lane_head_route_marker", root, 0.018)
            for side in (-1, 1):
                module.beam(f"HeadDiagonal_{side}", (side * 0.58, 0, 24.35), (side * 2.35, 0, 26.15), 0.22, mats["Material_Mechanical"], lod, "triangulated_signal_head_support", root, 0.035)
                module.box(f"LaneHeadPod_{side}", (0.72, 1.44, 1.68), (side * 2.58, 0, 26.35), (0, 0, 0), mats["Material_Hull"], lod, "replaceable_lane_facing_signal_pod", root, 0.10)
                module.box(f"LaneHeadOptic_{side}", (0.10, 0.94, 0.82), (side * 2.98, 0, 26.35), (0, 0, 0), mats["Material_Accent"], lod, "finite_bidirectional_lane_optic", root, 0.035)
                module.box(f"LaneHeadRetro_{side}", (0.54, 0.09, 0.30), (side * 2.58, -0.765, 26.38), (0, 0, 0), mats["Material_Retro"], lod, "bounded_lane_direction_retroreflector", root, 0.025)
                module.beam(f"HeadCable_{side}", (side * 0.55, -0.28, 25.55), (side * 2.30, -0.28, 26.02), 0.095, mats["Material_Cable"], lod, "shielded_signal_head_feed", root, 0.02)
                if lod == 0:
                    for z in (25.87, 26.83):
                        module.cylinder(f"HeadFastener_{side}_{z}", 0.07, 0.13, (side * 2.84, -0.77, z), (math.pi / 2, 0, 0), mats["Material_Decal"], lod, "captive_signal_head_fastener", root, 10, 0.03)

            cue_count = 3 if lod < 2 else 2
            for index, z in enumerate((9.0, 14.0, 19.0)[:cue_count]):
                module.beam(f"LaneChevronLeft_{index}", (-0.38, -0.73, z - 0.24), (0, -0.73, z), 0.105, mats["Material_Retro"], lod, "bounded_route_direction_chevron", root, 0.02)
                module.beam(f"LaneChevronRight_{index}", (0, -0.73, z), (-0.38, -0.73, z + 0.24), 0.105, mats["Material_Retro"], lod, "bounded_route_direction_chevron", root, 0.02)

            if lod == 0:
                for x in (-1.35, 1.35):
                    for y in (-1.35, 1.35):
                        module.cylinder(f"FoundationFastener_{x}_{y}", 0.12, 0.18, (x, y, 1.60), (0, 0, 0), mats["Material_Mechanical"], lod, "foundation_armor_captive_fastener", root, 14, 0.04)

        else:
            assignments = {
                "ImpactRing": ("Material_Cast", "cast_replaceable_impact_ring"),
                "DrumLowerCollar": ("Material_Cast", "cast_lower_load_transfer_collar"),
                "DrumUpperCollar": ("Material_Cast", "cast_upper_load_transfer_collar"),
                "ThermalRoot": ("Material_Cast", "cast_battery_thermal_interface"),
                "TelemetryCoupler": ("Material_Cast", "cast_transceiver_coupler"),
                "TowArm_": ("Material_Boom", "directionally_finished_tow_boom"),
                "TowBrace_": ("Material_Boom", "triangulated_exposed_boom_alloy"),
                "TowEye": ("Material_Cast", "cast_tow_eye_load_spreader"),
                "PlateStrut_": ("Material_Boom", "solar_frame_load_strut"),
                "SolarSpine": ("Material_Boom", "solar_array_structural_spine"),
                "SolarPanel_": ("Material_SolarCell", "segmented_photovoltaic_laminate"),
                "TelemetryCeramic": ("Material_SensorHousing", "coated_telemetry_pressure_head"),
                "OpticCassette_": ("Material_SensorHousing", "coated_replaceable_sensor_housing"),
                "OpticBrow_": ("Material_Boom", "sensor_micrometeoroid_brow"),
                "OpticSill_": ("Material_Boom", "sensor_service_sill"),
                "TelemetryHatch": ("Material_SensorHousing", "integrated_maintenance_panel"),
                "IdentityBand": ("Material_SensorHousing", "integrated_identity_recess"),
            }
            for token, (material_name, role) in assignments.items():
                for obj in _objects_for(lod, "Buoy", token):
                    _set_material(obj, mats[material_name], role)

            # Tow hinges and routed flexible service lines make the radial booms
            # visibly attached rather than embedded into the drum.
            for side in (-1, 1):
                module.cylinder(f"TowHingeSocket_{side}", 0.28, 0.30, (0.58, side * 0.60, 1.14), (math.pi / 2, 0, 0), mats["Material_Cast"], lod, "cast_tow_boom_hinge_socket", root, 28, 0.05)
                module.cylinder(f"TowHingePin_{side}", 0.12, 0.38, (0.58, side * 0.60, 1.14), (math.pi / 2, 0, 0), mats["Material_Safety"], lod, "field_service_hinge_pin", root, 20, 0.04)
                module.beam(f"TowCable_{side}", (0.48, side * 0.72, 1.38), (1.54, side * 0.50, 1.30), 0.075, mats["Material_Cable"], lod, "flexible_tow_load_sensor_cable", root, 0.018)

            # Real panel frame, cell segmentation, bus structure and underside
            # junction detail replace the previous dark slab plus white bars.
            for x in (-1.02, -0.02, 0.02, 1.02):
                module.box(f"SolarEdgeLong_{x}", (0.045, 2.08, 0.07), (x, 0, 4.935), (0, 0, 0), mats["Material_Boom"], lod, "photovoltaic_edge_frame", root, 0.012)
            for side in (-1, 1):
                for y in (-1.02, 1.02):
                    module.box(f"SolarEdgeShort_{side}_{y}", (0.98, 0.045, 0.07), (side * 0.52, y, 4.935), (0, 0, 0), mats["Material_Boom"], lod, "photovoltaic_edge_frame", root, 0.012)
                if lod < 2:
                    for x in (side * 0.27, side * 0.77):
                        module.box(f"SolarCellDivider_{x}", (0.022, 1.96, 0.026), (x, 0, 4.976), (0, 0, 0), mats["Material_Boom"], lod, "solar_cell_column_bus", root, 0.006)
            if lod == 0:
                for x in (-0.96, -0.08, 0.08, 0.96):
                    for y in (-0.96, 0.96):
                        module.cylinder(f"SolarFrameFastener_{x}_{y}", 0.035, 0.06, (x, y, 4.99), (0, 0, 0), mats["Material_Decal"], lod, "solar_frame_captive_fastener", root, 10, 0.02)
            module.box("SolarJunctionBox", (0.42, 0.56, 0.22), (0, 0.46, 4.70), (0, 0, 0), mats["Material_SensorHousing"], lod, "underside_solar_junction_box", root, 0.025)
            module.beam("SolarHarnessLeft", (0, 0.28, 4.67), (-0.70, 0.18, 4.80), 0.055, mats["Material_Cable"], lod, "solar_array_cable_harness", root, 0.015)
            module.beam("SolarHarnessRight", (0, 0.28, 4.67), (0.70, 0.18, 4.80), 0.055, mats["Material_Cable"], lod, "solar_array_cable_harness", root, 0.015)

            lens_count = 3 if lod < 2 else 2
            for index in range(lens_count):
                angle = math.tau * index / lens_count + math.radians(30)
                for offset in (-0.25, 0.25):
                    tangent = (-math.sin(angle) * offset, math.cos(angle) * offset)
                    module.box(
                        f"SensorRetainerSide_{index}_{offset}", (0.055, 0.055, 0.46),
                        (math.cos(angle) * 0.90 + tangent[0], math.sin(angle) * 0.90 + tangent[1], 3.48),
                        (0, 0, angle), mats["Material_Boom"], lod, "recessed_sensor_glass_retainer", root, 0.012,
                    )
                for z in (3.25, 3.71):
                    module.radial_box(f"SensorRetainerCap_{index}_{z}", 0.90, angle, (0.055, 0.56, 0.055), z, mats["Material_Boom"], lod, "recessed_sensor_glass_retainer", root, 0.012)

            # Identity stays a decal on the maintenance recess; the orange
            # service cue is bounded below it rather than becoming the plate.
            module.box("MaintenanceHazardCue", (0.64, 0.055, 0.16), (0, -0.995, 1.62), (0, 0, 0), mats["Material_Safety"], lod, "bounded_maintenance_release_marking", root, 0.016)
            if lod == 0:
                for x in (-0.27, 0.27):
                    for z in (1.90, 2.13):
                        module.cylinder(f"IdentityPanelFastener_{x}_{z}", 0.035, 0.06, (x, -1.01, z), (math.pi / 2, 0, 0), mats["Material_Boom"], lod, "identity_recess_captive_fastener", root, 10, 0.018)

    return patched


def main() -> None:
    source_path = Path(bpy.data.filepath).resolve()
    asset_id = source_path.stem.removesuffix("_authored")
    if asset_id not in ASSETS:
        raise RuntimeError(f"Unsupported navigation infrastructure source: {asset_id}")
    spec = ASSETS[asset_id]
    upstream_path = ROOT / Path(spec["module"].replace(".", "/") + ".py")
    upstream_hash = sha256(upstream_path)
    before_markers = marker_snapshot()
    if spec["root"] not in before_markers:
        raise RuntimeError(f"Missing canonical root {spec['root']}")

    module = importlib.import_module(spec["module"])
    module.ROLE_BY_MATERIAL = dict(spec["roles"])
    module.NORMAL_STRENGTH = dict(spec["normal"])
    module.make_material = make_material_factory(module, spec)
    module.family_update = family_update_factory(spec)
    if asset_id == "place_nav_buoy":
        original_cylinder = module.cylinder
        original_cone = module.cone

        def high_fidelity_cylinder(name, radius, depth, location, rotation, mat, lod, role, root, vertices=24, bevel=0.05):
            minimum = 48 if lod == 0 else 32 if lod == 1 else 16
            return original_cylinder(name, radius, depth, location, rotation, mat, lod, role, root, max(vertices, minimum), bevel)

        def high_fidelity_cone(name, radius1, radius2, depth, location, mat, lod, role, root, vertices=24, bevel=0.05):
            minimum = 48 if lod == 0 else 32 if lod == 1 else 16
            return original_cone(name, radius1, radius2, depth, location, mat, lod, role, root, max(vertices, minimum), bevel)

        module.cylinder = high_fidelity_cylinder
        module.cone = high_fidelity_cone
    module.build_lod = construction_patch_factory(module, spec)

    exact_fit = {}
    original_join = module.join_draw_groups

    def joined_and_fit(*args, **kwargs):
        original_join(*args, **kwargs)
        for lod in range(3):
            meshes = sorted((obj for obj in bpy.data.objects if obj.type == "MESH" and obj.name.startswith(f"LOD{lod}_{spec['prefix']}_")), key=lambda obj: obj.name)
            if not meshes:
                raise RuntimeError(f"No LOD{lod} meshes found after construction")
            exact_fit[f"lod{lod}"] = fit_meshes_to_bounds(meshes, spec["bounds"]["min"], spec["bounds"]["max"])

    module.join_draw_groups = joined_and_fit
    module.main()

    after_markers = marker_snapshot()
    if before_markers != after_markers:
        raise RuntimeError(json.dumps({"markerContract": "changed", "before": before_markers, "after": after_markers}, indent=2))

    args = module.cli()
    report_path = args.report.resolve()
    report = json.loads(report_path.read_text(encoding="utf-8"))
    root = bpy.data.objects[spec["root"]]
    asset_contract = json.loads(root.get("spacefaceAssetJson", "{}"))
    expected_axes = {"forward": "+X", "up": "+Y", "starboard": "+Z"}
    axis_contract = {key: asset_contract.get(key) for key in expected_axes}
    if axis_contract != expected_axes:
        raise RuntimeError(f"Axis contract mismatch: expected={expected_axes} actual={axis_contract}")
    root_identity = {
        "location": [float(value) for value in root.location],
        "rotation": [float(value) for value in root.rotation_euler],
        "scale": [float(value) for value in root.scale],
    }
    if any(abs(value) > 1e-6 for value in (*root_identity["location"], *root_identity["rotation"])) or any(abs(value - 1.0) > 1e-6 for value in root_identity["scale"]):
        raise RuntimeError(f"Root identity changed: {root_identity}")

    report["schema"] = "spaceface.navigationInfrastructureCandidate.v1"
    report["status"] = "candidate-not-promoted"
    report["navigationInfrastructureContract"] = {
        "asset": asset_id,
        "title": spec["title"],
        "functionalIdentity": spec["identity"],
        "sourceSnapshot": str(source_path),
        "sourceSnapshotSha256": sha256(source_path),
        "upstreamConstructionTool": str(upstream_path),
        "upstreamConstructionToolSha256": upstream_hash,
        "pipelineTool": str(Path(__file__).resolve()),
        "pipelineToolSha256": sha256(Path(__file__)),
        "rootIdentity": root_identity,
        "axes": axis_contract,
        "originalEmptyCount": len(before_markers),
        "emptyTransformsPreservedExactly": True,
        "emptyNames": sorted(before_markers),
        "exactBoundsFit": exact_fit,
        "sourceEnvelopePreservedExactly": all(value["maximumCornerErrorM"] <= 1e-4 for value in exact_fit.values()),
        "trueSocketsHooksOnly": True,
        "materials": [{"semantic": semantic, "role": role} for semantic, role in spec["roles"].items()],
        "emissionPolicy": "Only finite optical apertures and bounded lane retroreflectors receive emissive textures; structural identity does not depend on emission or bloom.",
    }
    report["knownDefects"] = [
        "Candidate has not been promoted, wired, or inspected in browser/Electron gameplay.",
        "Matched close/default/far/grazing, PBR-channel, topology and turntable captures must be regenerated after each repair build.",
        "Runtime LOD switching, mip behavior, signal intensity, and collision/interaction envelopes remain integration checks.",
        "KTX2 files are candidate encodings; loader binding and release optimization were not performed.",
    ]
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({
        "ok": True,
        "asset": asset_id,
        "report": str(report_path),
        "sourceEnvelopePreservedExactly": report["navigationInfrastructureContract"]["sourceEnvelopePreservedExactly"],
        "markers": len(before_markers),
        "upstreamToolSha256": upstream_hash,
    }))


if __name__ == "__main__":
    main()
