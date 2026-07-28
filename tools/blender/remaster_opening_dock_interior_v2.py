#!/usr/bin/env python3
"""Build the neutral H-04 Shipworks dock-interior method-reset candidate.

This is an output-only authoring tool.  It never copies into the repository's
source/release asset paths and never updates manifests.  The editable blend
retains authored LOD0/LOD1/LOD2 representations, while the GLB intentionally
exports LOD0 only because ``shipPreviewMount.groupFromBlueprint()`` currently
instantiates every primitive and does not perform place-asset LOD selection.

Blender axes are X=bay width, Y=bay depth, Z=up.  Blender's glTF exporter maps
that scene to the SpaceFace +X forward / +Y up / +Z starboard contract.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import struct
import sys

import bpy
from mathutils import Vector


ASSET_ID = "place_dock_interior"
ROOT_NAME = ASSET_ID
SURFACE_REVISION = "opening_dock_interior_h04_v3"
FAMILY = "opening_route_neutral_shipworks_v1"
# Shipworks is a turntable backdrop, not a sealed flight interior. Keep the one
# load-bearing portal at the rear so the fixed three-quarter preview camera never
# looks through foreground or mid-bay headers.
PORTAL_DEPTHS_M = (16.0,)
BLENDER_BOUNDS_M = {
    "min": (-26.0, -18.0, -4.425),
    "max": (26.0, 18.0, 13.0),
    "size": (52.0, 36.0, 17.425),
}
CLEAR_APERTURE_M = {
    "width": 28.0,
    "depth": 28.0,
    "heightAboveFloor": 13.0,
}
CLEAR_APERTURE_FLOOR_Z_M = -3.40
PREVIEW_MOUNT_POLICY = {
    "floorLocalY": -3.44,
    "referenceShipSpan": 24.08,
    "minimumScale": 0.8,
    "maximumScale": 12.5,
    "minimumFloorClearance": 0.45,
    "maximumFloorClearance": 2.0,
    "floorClearanceHeightRatio": 0.12,
}
CRANE_RUNWAY_X_M = 18.0
CRANE_PARK_DEPTH_M = 15.5
CRANE_APERTURE_GROUP = "rear_parked_crane_stack"
CRANE_STACK_COMPONENTS_BY_LOD = {
    0: ("CraneBridge", "CraneTrolley", "CraneHoist", "CraneCable", "CraneHook"),
    1: ("CraneBridge", "CraneTrolley", "CraneHoist"),
    2: ("CraneBridge", "CraneTrolley", "CraneHoist"),
}
AABB_EPSILON_M = 1e-4

MATERIAL_ROLES = {
    "Material_Hull": "dock_painted_armor",
    "Material_Structure": "dock_structural_alloy",
    "Material_Floor": "dock_floor_plate",
    "Material_Mechanical": "dock_machinery",
    "Material_Radiator": "dock_radiator",
    "Material_Safety": "dock_safety_surface",
    "Material_Glass": "dock_optic",
    "Material_Accent": "dock_worklight",
    "Material_Decal": "dock_identity_decal",
    "Material_Rubber": "dock_rubber",
}

NORMAL_STRENGTH = {
    "dock_painted_armor": 0.18,
    "dock_structural_alloy": 0.15,
    "dock_floor_plate": 0.22,
    "dock_machinery": 0.19,
    "dock_radiator": 0.16,
    "dock_safety_surface": 0.14,
    "dock_optic": 0.07,
    "dock_worklight": 0.06,
    "dock_identity_decal": 0.08,
    "dock_rubber": 0.20,
}


def cli() -> argparse.Namespace:
    values = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(
        description="Build an isolated H-04 Shipworks dock candidate.",
    )
    parser.add_argument("--maps-root", type=Path, required=True)
    parser.add_argument("--output-blend", type=Path, required=True)
    parser.add_argument("--output-glb", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    return parser.parse_args(values)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def validate_output_only_paths(args: argparse.Namespace) -> None:
    """Reject accidental publication targets.

    Promotion is controller-owned and requires the asset-manifest mutex.  This
    builder may write only caller-selected candidate paths.
    """
    repository = Path(__file__).resolve().parents[2]
    protected = (
        repository / "assets" / "ships" / "parts" / "places",
        repository / "assets" / "ships" / "parts" / "blender",
        repository / "assets" / "ships" / "release",
    )
    for label, target in (
        ("output-blend", args.output_blend),
        ("output-glb", args.output_glb),
        ("report", args.report),
    ):
        resolved = target.resolve()
        if any(resolved == root or root in resolved.parents for root in protected):
            raise RuntimeError(
                f"{label} must be a scratch/candidate path, not protected publication path: "
                f"{resolved}"
            )


def required_surface_inputs(maps_root: Path) -> list[Path]:
    required = [maps_root / "surface-map-build.json"]
    for role in MATERIAL_ROLES.values():
        required.extend(
            maps_root / f"{role}_{channel}.png"
            for channel in ("basecolor", "normal", "orm")
        )
    required.append(maps_root / "dock_worklight_emissive.png")
    return required


def validate_surface_inputs(maps_root: Path) -> Path:
    manifest = maps_root / "surface-map-build.json"
    required = required_surface_inputs(maps_root)
    missing = [str(path) for path in required if not path.is_file()]
    if missing:
        raise RuntimeError(f"Missing deterministic H-04 surface inputs: {missing[:8]}")
    payload = json.loads(manifest.read_text(encoding="utf-8"))
    if payload.get("schema") != "spaceface.dockInteriorSurfaceBuild.v1":
        raise RuntimeError(f"Unexpected dock surface manifest schema: {payload.get('schema')}")
    if payload.get("variant") != "industrial":
        raise RuntimeError(
            "H-04 neutral Shipworks candidate requires the industrial surface set; "
            f"got {payload.get('variant')}"
        )
    expected = {path.name: path for path in required if path != manifest}
    artifacts = payload.get("artifacts")
    if not isinstance(artifacts, list):
        raise RuntimeError("H-04 surface manifest has no artifact ledger")
    by_path = {}
    for artifact in artifacts:
        artifact_path = artifact.get("path") if isinstance(artifact, dict) else None
        if not artifact_path or artifact_path in by_path:
            raise RuntimeError(f"H-04 surface manifest has duplicate/invalid artifact: {artifact_path}")
        by_path[artifact_path] = artifact
    if set(by_path) != set(expected):
        raise RuntimeError(
            "H-04 surface manifest artifact set drifted: "
            f"missing={sorted(set(expected) - set(by_path))[:8]} "
            f"extra={sorted(set(by_path) - set(expected))[:8]}"
        )
    for filename, path in expected.items():
        recorded = str(by_path[filename].get("sha256", "")).upper()
        actual = sha256(path)
        if recorded != actual:
            raise RuntimeError(
                f"H-04 surface artifact hash mismatch for {filename}: {recorded} != {actual}"
            )
    return manifest


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

    gltf_group = bpy.data.node_groups.get("glTF Material Output")
    if gltf_group is None:
        gltf_group = bpy.data.node_groups.new("glTF Material Output", "ShaderNodeTree")
        gltf_group.interface.new_socket(
            name="Occlusion",
            in_out="INPUT",
            socket_type="NodeSocketFloat",
        )
    gltf_output = nodes.new("ShaderNodeGroup")
    gltf_output.name = "SF_glTF_Occlusion"
    gltf_output.node_tree = gltf_group
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
    if emissive_path.is_file():
        emissive = nodes.new("ShaderNodeTexImage")
        emissive.name = f"SF_{role}_Emissive"
        emissive.image = load_image(emissive_path, "sRGB")
        emissive.interpolation = "Linear"
        links.new(emissive.outputs["Color"], principled.inputs["Emission Color"])
        principled.inputs["Emission Strength"].default_value = 1.7

    if role == "dock_painted_armor":
        principled.inputs["Coat Weight"].default_value = 0.10
        principled.inputs["Coat Roughness"].default_value = 0.37
    elif role == "dock_optic":
        principled.inputs["Coat Weight"].default_value = 0.42
        principled.inputs["Coat Roughness"].default_value = 0.15
        principled.inputs["IOR"].default_value = 1.48

    links.new(principled.outputs["BSDF"], output.inputs["Surface"])
    material["spaceface.semantic"] = name
    material["spaceface.textureRole"] = role
    material["spaceface.ormChannels"] = "R=AO,G=Roughness,B=Metallic"
    material["spaceface.normalConvention"] = "OpenGL tangent space"
    return material


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (
        bpy.data.meshes,
        bpy.data.curves,
        bpy.data.materials,
        bpy.data.images,
        bpy.data.cameras,
        bpy.data.lights,
    ):
        for item in list(datablocks):
            datablocks.remove(item)


def add_empty(name: str, parent, location=(0.0, 0.0, 0.0), **extras):
    obj = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(obj)
    obj.parent = parent
    obj.location = location
    for key, value in extras.items():
        obj[key] = value
    return obj


def tag(obj, lod: int, material_name: str, role: str, lod_root) -> None:
    obj.parent = lod_root
    obj["spaceface.lod"] = f"lod{lod}"
    obj["spaceface.lodLevel"] = lod
    obj["spaceface.materialRole"] = material_name
    obj["spaceface.structureRole"] = role
    obj["spaceface.authoredConstruction"] = True


def tag_crane_stack(obj) -> None:
    obj["spaceface.apertureGroup"] = CRANE_APERTURE_GROUP
    obj["spaceface.parkDepthM"] = CRANE_PARK_DEPTH_M


def add_bevel(obj, width: float, lod: int) -> None:
    modifier = obj.modifiers.new("SF_PhysicalEdge", "BEVEL")
    modifier.width = max(0.012, width * (1.0 if lod == 0 else 0.70 if lod == 1 else 0.48))
    modifier.segments = 3 if lod == 0 else 2 if lod == 1 else 1
    modifier.limit_method = "ANGLE"


def box(
    name: str,
    dimensions,
    location,
    material,
    lod: int,
    role: str,
    lod_root,
    rotation=(0.0, 0.0, 0.0),
    bevel=0.08,
):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = f"LOD{lod}_Dock_{name}"
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    obj.data.materials.append(material)
    add_bevel(obj, bevel, lod)
    tag(obj, lod, material.name, role, lod_root)
    return obj


def cylinder(
    name: str,
    radius: float,
    depth: float,
    location,
    material,
    lod: int,
    role: str,
    lod_root,
    rotation=(0.0, 0.0, 0.0),
    vertices=20,
    bevel=0.06,
):
    count = max(8, vertices if lod == 0 else vertices // 2 if lod == 1 else vertices // 3)
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=count,
        radius=radius,
        depth=depth,
        end_fill_type="NGON",
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = f"LOD{lod}_Dock_{name}"
    obj.data.materials.append(material)
    add_bevel(obj, min(radius, depth) * bevel, lod)
    tag(obj, lod, material.name, role, lod_root)
    return obj


def beam(
    name: str,
    start,
    end,
    width: float,
    material,
    lod: int,
    role: str,
    lod_root,
    bevel=0.06,
):
    a, b = Vector(start), Vector(end)
    delta = b - a
    obj = box(
        name,
        (width, width, delta.length),
        (a + b) * 0.5,
        material,
        lod,
        role,
        lod_root,
        bevel=bevel,
    )
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = delta.to_track_quat("Z", "Y")
    obj.rotation_mode = "XYZ"
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    obj.select_set(False)
    return obj


def build_floor(lod: int, materials, lod_root) -> None:
    box(
        "Foundation",
        (52.0, 36.0, 0.50),
        (0.0, 0.0, -4.175),
        materials["Material_Structure"],
        lod,
        "continuous_load_bearing_foundation",
        lod_root,
        bevel=0.09,
    )
    if lod == 0:
        for x_index, x in enumerate((-21.0, -14.0, -7.0, 0.0, 7.0, 14.0, 21.0)):
            for y_index, y in enumerate((-13.5, -6.75, 0.0, 6.75, 13.5)):
                role = "replaceable_traffic_floor_panel"
                material = materials["Material_Floor"]
                box(
                    f"FloorPanel_{x_index}_{y_index}",
                    (6.72, 6.45, 0.14),
                    (x, y, -3.83),
                    material,
                    lod,
                    role,
                    lod_root,
                    bevel=0.055,
                )
    else:
        box(
            "FloorMacroPlate",
            (50.8, 34.8, 0.16),
            (0.0, 0.0, -3.83),
            materials["Material_Floor"],
            lod,
            "macro_traffic_floor",
            lod_root,
            bevel=0.055,
        )

    # The pad remains shallow so the ship silhouette owns the central aperture.
    box(
        "ServicePad",
        (20.0, 20.0, 0.18),
        (0.0, 0.0, -3.64),
        materials["Material_Mechanical"],
        lod,
        "flush_ship_service_pad",
        lod_root,
        bevel=0.08,
    )
    for x in (-10.35, 10.35):
        box(
            f"PadSafety_{x:+.0f}",
            (0.55, 20.8, 0.10),
            (x, 0.0, -3.49),
            materials["Material_Safety"],
            lod,
            "service_pad_exclusion_edge",
            lod_root,
            bevel=0.03,
        )


def build_portal_bent(lod: int, depth: float, materials, lod_root) -> None:
    """Build one deep, floor-rooted transverse portal in the X/Z plane."""
    suffix = str(depth).replace("-", "M").replace(".", "P")
    for side in (-1, 1):
        x = side * 23.6
        box(
            f"Portal_{suffix}_Foot_{side:+d}",
            (3.4, 2.55, 0.55),
            (x, depth, -3.55),
            materials["Material_Structure"],
            lod,
            "portal_spread_footing",
            lod_root,
            bevel=0.10,
        )
        box(
            f"Portal_{suffix}_Jamb_{side:+d}",
            (1.75, 2.35, 14.8),
            (x, depth, 3.85),
            materials["Material_Structure"],
            lod,
            "deep_floor_rooted_portal_jamb",
            lod_root,
            bevel=0.16,
        )
        box(
            f"Portal_{suffix}_JambArmor_{side:+d}",
            (0.46, 2.48, 9.8),
            (side * 22.63, depth, 2.2),
            materials["Material_Hull"],
            lod,
            "replaceable_portal_jamb_guard",
            lod_root,
            bevel=0.08,
        )
        beam(
            f"Portal_{suffix}_Haunch_{side:+d}",
            (side * 22.8, depth, 7.7),
            (side * 17.6, depth, 11.55),
            0.82 if lod < 2 else 0.94,
            materials["Material_Structure"],
            lod,
            "sparse_portal_knee_haunch",
            lod_root,
            bevel=0.08,
        )

    box(
        f"Portal_{suffix}_Header",
        (48.0, 2.35, 1.72),
        (0.0, depth, 11.75),
        materials["Material_Structure"],
        lod,
        "deep_transverse_portal_header",
        lod_root,
        bevel=0.18,
    )
    if lod == 0:
        box(
            f"Portal_{suffix}_HeaderFace",
            (33.0, 2.48, 0.34),
            (0.0, depth, 10.77),
            materials["Material_Hull"],
            lod,
            "header_inspection_skin",
            lod_root,
            bevel=0.06,
        )


def build_roof_and_crane(lod: int, materials, lod_root) -> None:
    # Full-depth longitudinal load path: these are stringers, not floating trim.
    for side in (-1, 1):
        box(
            f"RoofEdgeStringer_{side:+d}",
            (1.35, 35.0, 1.25),
            (side * 23.6, 0.0, 12.15),
            materials["Material_Structure"],
            lod,
            "full_depth_roof_edge_stringer",
            lod_root,
            bevel=0.15,
        )

    # Correct crane topology: two runways travel along bay depth (Blender Y).
    # Keep them outside the declared preview aperture so scaling the bay around a
    # larger ship cannot project the rails across its silhouette.
    for side in (-1, 1):
        box(
            f"CraneRunway_{side:+d}",
            (1.05, 32.5, 0.88),
            (side * CRANE_RUNWAY_X_M, 0.0, 9.68),
            materials["Material_Structure"],
            lod,
            "depth_axis_overhead_crane_runway",
            lod_root,
            bevel=0.13,
        )
        if lod < 2:
            for depth in PORTAL_DEPTHS_M:
                beam(
                    f"RunwayBracket_{side:+d}_{depth:+.0f}",
                    (side * CRANE_RUNWAY_X_M, depth, 9.25),
                    (side * 21.0, depth, 10.95),
                    0.34,
                    materials["Material_Structure"],
                    lod,
                    "runway_to_portal_load_bracket",
                    lod_root,
                    bevel=0.045,
                )

    # Park the complete traveling stack behind the declared +/-14 m clear bay.
    # The depth-axis runways remain fixed structural rails outside x +/-14 m.
    bridge_y = CRANE_PARK_DEPTH_M
    crane_stack = [
        box(
        "CraneBridge",
        (22.5, 1.35, 1.05),
        (0.0, bridge_y, 9.15),
        materials["Material_Structure"],
        lod,
        "transverse_traveling_crane_bridge",
        lod_root,
        bevel=0.14,
        ),
        box(
        "CraneTrolley",
        (3.5, 2.25, 1.20),
        (2.4, bridge_y, 8.32),
        materials["Material_Mechanical"],
        lod,
        "service_crane_trolley",
        lod_root,
        bevel=0.14,
        ),
        cylinder(
        "CraneHoist",
        0.46,
        2.10,
        (2.4, bridge_y, 6.85),
        materials["Material_Mechanical"],
        lod,
        "service_crane_hoist",
        lod_root,
        vertices=20,
        bevel=0.07,
        ),
    ]
    if lod == 0:
        crane_stack.extend(
            (
                cylinder(
                    "CraneCable",
                    0.07,
                    3.0,
                    (2.4, bridge_y, 4.30),
                    materials["Material_Rubber"],
                    lod,
                    "load_rated_crane_cable",
                    lod_root,
                    vertices=12,
                    bevel=0.02,
                ),
                box(
                    "CraneHook",
                    (0.72, 0.52, 0.88),
                    (2.4, bridge_y, 2.55),
                    materials["Material_Safety"],
                    lod,
                    "bounded_service_crane_hook",
                    lod_root,
                    rotation=(0.0, 0.20, 0.0),
                    bevel=0.08,
                ),
            )
        )
    for component in crane_stack:
        tag_crane_stack(component)


def build_rear_bulkhead(lod: int, materials, lod_root) -> None:
    rear_y = 17.45
    box(
        "RearBulkheadFrame",
        (51.4, 1.10, 16.4),
        (0.0, rear_y, 4.25),
        materials["Material_Structure"],
        lod,
        "rear_pressure_bulkhead_frame",
        lod_root,
        bevel=0.14,
    )
    panel_x = (-21.0, -14.0, -7.0, 0.0, 7.0, 14.0, 21.0)
    for index, x in enumerate(panel_x):
        box(
            f"RearPanelLower_{index}",
            (6.45, 0.30, 6.6),
            (x, 16.83, -0.05),
            materials["Material_Hull"],
            lod,
            "replaceable_rear_bulkhead_panel",
            lod_root,
            bevel=0.09,
        )
        box(
            f"RearPanelUpper_{index}",
            (6.45, 0.30, 5.0),
            (x, 16.83, 7.65),
            materials["Material_Hull"],
            lod,
            "overhead_rear_service_panel",
            lod_root,
            bevel=0.09,
        )

    # One protected observation strip establishes human scale without branding.
    box(
        "ObservationBrow",
        (12.2, 0.90, 3.7),
        (12.2, 16.18, 6.7),
        materials["Material_Structure"],
        lod,
        "armored_observation_brow",
        lod_root,
        bevel=0.13,
    )
    box(
        "ObservationGlass",
        (11.2, 0.22, 2.7),
        (12.2, 15.68, 6.55),
        materials["Material_Glass"],
        lod,
        "protected_observation_glazing",
        lod_root,
        bevel=0.07,
    )

    # Rooted service cabinets stay at the rear, outside the ship aperture.
    for index, x in enumerate((-20.5, -15.5, -10.5)):
        box(
            f"RearPowerCabinet_{index}",
            (4.1, 1.35, 4.8),
            (x, 15.72, -0.65),
            materials["Material_Mechanical"],
            lod,
            "rear_rooted_power_cabinet",
            lod_root,
            bevel=0.12,
        )
        if lod == 0:
            box(
                f"RearPowerDoor_{index}",
                (3.55, 0.18, 4.05),
                (x, 14.96, -0.65),
                materials["Material_Hull"],
                lod,
                "power_cabinet_access_door",
                lod_root,
                bevel=0.07,
            )


def build_cutaway_service_plinth(lod: int, materials, lod_root) -> None:
    """Low camera-side service mass; never a sealed foreground wall."""
    # Root the plinth against the canonical -26 m bay wall while keeping its
    # access steps outside the +/-14 m preview aperture.
    x = -20.25
    y = -12.5
    box(
        "CutawayPlinthBase",
        (11.5, 7.0, 1.55),
        (x, y, -2.93),
        materials["Material_Mechanical"],
        lod,
        "low_cutaway_service_plinth",
        lod_root,
        bevel=0.13,
    )
    box(
        "CutawayPlinthDeck",
        (10.8, 6.3, 0.18),
        (x, y, -2.05),
        materials["Material_Floor"],
        lod,
        "service_plinth_work_deck",
        lod_root,
        bevel=0.05,
    )
    if lod < 2:
        for index, y_offset in enumerate((-2.1, 0.0, 2.1)):
            box(
                f"PlinthToolCassette_{index}",
                (2.3, 1.6, 1.3),
                (x - 1.9 + index * 1.9, y + y_offset * 0.24, -1.30),
                materials["Material_Hull"],
                lod,
                "indexed_service_consumable_cassette",
                lod_root,
                bevel=0.10,
            )
    if lod == 0:
        for step in range(3):
            box(
                f"PlinthStep_{step}",
                (2.8 - step * 0.48, 2.0, 0.24),
                (x + 4.5 - step * 0.45, y - 1.65, -3.42 + step * 0.42),
                materials["Material_Structure"],
                lod,
                "plinth_access_step",
                lod_root,
                bevel=0.045,
            )


def build_side_services(lod: int, materials, lod_root) -> None:
    # Sparse rooted services communicate function without sealing either side.
    for side in (-1, 1):
        x = side * 24.45
        for index, y in enumerate((-8.0, 6.8)):
            box(
                f"SideRadiator_{side:+d}_{index}",
                (0.62, 5.2, 3.4),
                (x, y, 5.1),
                materials["Material_Radiator"],
                lod,
                "portal_rooted_heat_rejection_bank",
                lod_root,
                bevel=0.08,
            )
        if lod == 0:
            cylinder(
                f"SideUtilityPipe_{side:+d}",
                0.16,
                29.0,
                (side * 24.55, 0.0, 8.25),
                materials["Material_Structure"],
                lod,
                "full_depth_rooted_utility_line",
                lod_root,
                rotation=(math.pi / 2.0, 0.0, 0.0),
                vertices=14,
                bevel=0.04,
            )


def build_worklights(lod: int, materials, lod_root) -> None:
    for portal_index, depth in enumerate(PORTAL_DEPTHS_M):
        for side in (-1, 1):
            x = side * 15.2
            box(
                f"WorklightHousing_{portal_index}_{side:+d}",
                (3.3, 0.48, 0.56),
                (x, depth - 1.30, 10.55),
                materials["Material_Mechanical"],
                lod,
                "portal_rooted_worklight_housing",
                lod_root,
                bevel=0.06,
            )
            box(
                f"WorklightLens_{portal_index}_{side:+d}",
                (2.92, 0.12, 0.27),
                (x, depth - 1.58, 10.52),
                materials["Material_Accent"],
                lod,
                "bounded_worklight_lens",
                lod_root,
                bevel=0.035,
            )


def build_h04_marking(lod: int, materials, lod_root) -> None:
    if lod != 0:
        return
    # Low-cost authored strokes: exact registration comes from metadata, not AI-generated text.
    material = materials["Material_Decal"]
    y = 16.60
    z = 9.50
    x0 = -7.4
    strokes = (
        ("H_L", (0.20, 0.10, 1.55), (x0 - 0.55, y, z)),
        ("H_R", (0.20, 0.10, 1.55), (x0 + 0.55, y, z)),
        ("H_M", (1.25, 0.10, 0.20), (x0, y, z)),
        ("Dash", (0.85, 0.10, 0.18), (x0 + 1.75, y, z)),
        ("ZeroTop", (1.05, 0.10, 0.18), (x0 + 3.30, y, z + 0.68)),
        ("ZeroBottom", (1.05, 0.10, 0.18), (x0 + 3.30, y, z - 0.68)),
        ("ZeroLeft", (0.18, 0.10, 1.35), (x0 + 2.85, y, z)),
        ("ZeroRight", (0.18, 0.10, 1.35), (x0 + 3.75, y, z)),
        ("FourStem", (0.18, 0.10, 1.55), (x0 + 5.35, y, z)),
        ("FourBar", (1.05, 0.10, 0.18), (x0 + 5.00, y, z + 0.05)),
        ("FourDiag", (0.18, 0.10, 0.90), (x0 + 4.65, y, z + 0.40)),
    )
    for name, dimensions, location in strokes:
        box(
            f"Identity_{name}",
            dimensions,
            location,
            material,
            lod,
            "neutral_h04_shipworks_registration",
            lod_root,
            bevel=0.02,
        )


def build_lod(lod: int, materials, lod_root) -> None:
    build_floor(lod, materials, lod_root)
    for depth in PORTAL_DEPTHS_M:
        build_portal_bent(lod, depth, materials, lod_root)
    build_roof_and_crane(lod, materials, lod_root)
    build_rear_bulkhead(lod, materials, lod_root)
    build_cutaway_service_plinth(lod, materials, lod_root)
    build_side_services(lod, materials, lod_root)
    build_worklights(lod, materials, lod_root)
    build_h04_marking(lod, materials, lod_root)


def apply_modifiers() -> list[str]:
    failures = []
    meshes = sorted(
        (obj for obj in bpy.data.objects if obj.type == "MESH"),
        key=lambda obj: obj.name,
    )
    for obj in meshes:
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        for modifier in list(obj.modifiers):
            try:
                bpy.ops.object.modifier_apply(modifier=modifier.name)
            except Exception as exc:
                failures.append(f"{obj.name}/{modifier.name}: {exc}")
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        obj.data.validate(clean_customdata=False)
        obj.select_set(False)
    return failures


def world_aabb(obj) -> dict:
    corners = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    axes = tuple(zip(*(tuple(float(value) for value in corner) for corner in corners)))
    minimum = tuple(min(axis) for axis in axes)
    maximum = tuple(max(axis) for axis in axes)
    if not all(math.isfinite(value) for value in (*minimum, *maximum)):
        raise RuntimeError(f"Non-finite world AABB for {obj.name}: min={minimum} max={maximum}")
    return {"min": minimum, "max": maximum}


def aabb_intersects_open_volume(aabb: dict, minimum, maximum) -> bool:
    return all(
        aabb["max"][axis] > minimum[axis] + AABB_EPSILON_M
        and aabb["min"][axis] < maximum[axis] - AABB_EPSILON_M
        for axis in range(3)
    )


def assert_clear_aperture() -> dict:
    """Fail closed when authored geometry obstructs the ship-service aperture."""
    half_width = CLEAR_APERTURE_M["width"] * 0.5
    half_depth = CLEAR_APERTURE_M["depth"] * 0.5
    aperture_min = (-half_width, -half_depth, CLEAR_APERTURE_FLOOR_Z_M)
    aperture_max = (
        half_width,
        half_depth,
        CLEAR_APERTURE_FLOOR_Z_M + CLEAR_APERTURE_M["heightAboveFloor"],
    )
    meshes = sorted(
        (obj for obj in bpy.data.objects if obj.type == "MESH"),
        key=lambda obj: obj.name,
    )
    if not meshes:
        raise RuntimeError("Clear-aperture preflight found no authored mesh objects")

    aabbs = {obj.name: world_aabb(obj) for obj in meshes}
    obstructions = [
        name
        for name, aabb in aabbs.items()
        if aabb_intersects_open_volume(aabb, aperture_min, aperture_max)
    ]

    expected_stack_names = [
        f"LOD{lod}_Dock_{component}"
        for lod, components in CRANE_STACK_COMPONENTS_BY_LOD.items()
        for component in components
    ]
    stack_meshes = {
        obj.name: obj
        for obj in meshes
        if obj.get("spaceface.apertureGroup") == CRANE_APERTURE_GROUP
    }
    missing_stack = [
        name for name in expected_stack_names if name not in stack_meshes
    ]
    unexpected_stack = sorted(set(stack_meshes) - set(expected_stack_names))
    stack_not_rear_parked = [
        name
        for name, obj in stack_meshes.items()
        if aabbs[name]["min"][1] < half_depth + AABB_EPSILON_M
        or abs(float(obj.get("spaceface.parkDepthM", math.nan)) - CRANE_PARK_DEPTH_M)
        > AABB_EPSILON_M
    ]
    if obstructions or missing_stack or unexpected_stack or stack_not_rear_parked:
        raise RuntimeError(
            "Dock clear-aperture preflight failed: "
            f"bounds={aperture_min}->{aperture_max} "
            f"obstructions={obstructions[:12]} "
            f"missingCrane={missing_stack} unexpectedCrane={unexpected_stack} "
            f"craneNotRearParked={stack_not_rear_parked}"
        )

    return {
        "status": "pass",
        "bounds": {
            "min": list(aperture_min),
            "max": list(aperture_max),
        },
        "testedMeshCount": len(meshes),
        "rearParkDepthM": CRANE_PARK_DEPTH_M,
        "craneComponents": expected_stack_names,
    }


def join_draw_groups(materials, lod_roots) -> None:
    for lod in range(3):
        for material_name, material in materials.items():
            matches = [
                obj
                for obj in bpy.data.objects
                if obj.type == "MESH"
                and obj.name.startswith(f"LOD{lod}_Dock_")
                and obj.data.materials
                and obj.data.materials[0] == material
            ]
            if not matches:
                continue
            matches.sort(key=lambda obj: obj.name)
            bpy.ops.object.select_all(action="DESELECT")
            for obj in matches:
                obj.select_set(True)
            bpy.context.view_layer.objects.active = matches[0]
            if len(matches) > 1:
                bpy.ops.object.join()
            joined = bpy.context.object
            joined.name = f"LOD{lod}_Dock_{material_name}"
            joined.parent = lod_roots[lod]
            joined["spaceface.lod"] = f"lod{lod}"
            joined["spaceface.lodLevel"] = lod
            joined["spaceface.materialRole"] = material_name
            joined["spaceface.structureRole"] = "merged_functional_draw_group"
            joined.select_set(False)


def unwrap_and_triangulate() -> list[str]:
    failures = []
    meshes = sorted(
        (obj for obj in bpy.data.objects if obj.type == "MESH"),
        key=lambda obj: obj.name,
    )
    for obj in meshes:
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        if not obj.data.uv_layers:
            obj.data.uv_layers.new(name="UVMap")
        try:
            bpy.ops.object.mode_set(mode="EDIT")
            bpy.ops.mesh.select_all(action="SELECT")
            bpy.ops.uv.smart_project(
                angle_limit=math.radians(58.0),
                island_margin=0.012,
            )
            bpy.ops.object.mode_set(mode="OBJECT")
        except Exception as exc:
            failures.append(f"{obj.name}/UV: {exc}")
            if obj.mode != "OBJECT":
                bpy.ops.object.mode_set(mode="OBJECT")
        triangulate = obj.modifiers.new("SF_ExportTriangulate", "TRIANGULATE")
        triangulate.keep_custom_normals = True
        try:
            bpy.ops.object.modifier_apply(modifier=triangulate.name)
        except Exception as exc:
            failures.append(f"{obj.name}/triangulate: {exc}")
        obj.select_set(False)
    return failures


def tangent_results() -> list[dict]:
    results = []
    for obj in sorted(
        (item for item in bpy.data.objects if item.type == "MESH"),
        key=lambda item: item.name,
    ):
        error = None
        valid = False
        try:
            obj.data.calc_tangents(uvmap=obj.data.uv_layers[0].name)
            lengths = [loop.tangent.length for loop in obj.data.loops]
            valid = bool(lengths) and min(lengths) > 0.985 and max(lengths) < 1.015
        except Exception as exc:
            error = str(exc)
        finally:
            try:
                obj.data.free_tangents()
            except Exception:
                pass
        results.append(
            {
                "object": obj.name,
                "valid": valid,
                "error": error,
                "loops": len(obj.data.loops),
            }
        )
    return results


def triangle_count(obj) -> int:
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


def bounds(objects) -> dict:
    points = [
        obj.matrix_world @ Vector(corner)
        for obj in objects
        for corner in obj.bound_box
    ]
    low = [min(point[axis] for point in points) for axis in range(3)]
    high = [max(point[axis] for point in points) for axis in range(3)]
    return {
        "min": low,
        "max": high,
        "size": [high[index] - low[index] for index in range(3)],
    }


def validate_bounds(candidate_bounds: dict) -> None:
    expected = BLENDER_BOUNDS_M
    size_drift = [
        abs(candidate_bounds["size"][index] - expected["size"][index])
        for index in range(3)
    ]
    min_drift = [
        abs(candidate_bounds["min"][index] - expected["min"][index])
        for index in range(3)
    ]
    max_drift = [
        abs(candidate_bounds["max"][index] - expected["max"][index])
        for index in range(3)
    ]
    # Foundation must preserve exact width/depth/floor; upper geometry may stop
    # below the historical ceiling but must remain within the canonical envelope.
    if size_drift[0] > 0.08 or size_drift[1] > 0.08 or min_drift[2] > 0.08:
        raise RuntimeError(
            f"Dock scale/pivot drift: size={size_drift} min={min_drift} max={max_drift}"
        )
    if any(
        candidate_bounds["min"][axis] < expected["min"][axis] - 0.08
        or candidate_bounds["max"][axis] > expected["max"][axis] + 0.08
        for axis in range(3)
    ):
        raise RuntimeError(f"Dock candidate exceeds canonical envelope: {candidate_bounds}")


def is_descendant(obj, ancestor) -> bool:
    cursor = obj
    while cursor is not None:
        if cursor == ancestor:
            return True
        cursor = cursor.parent
    return False


def export_lod0_glb(target: Path, root, lod0_root, semantic_nodes: list) -> None:
    """Export only LOD0 until the ship-preview route owns place LOD selection."""
    bpy.ops.object.select_all(action="DESELECT")
    for obj in (root, lod0_root, *semantic_nodes):
        obj.select_set(True)
    for obj in bpy.data.objects:
        if obj.type != "MESH" or not is_descendant(obj, lod0_root):
            continue
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


def stamp_and_validate_glb_contract(target: Path, contract: dict) -> None:
    data = target.read_bytes()
    magic, version, _total = struct.unpack_from("<III", data, 0)
    if magic != 0x46546C67 or version != 2:
        raise RuntimeError(f"Not a GLB2 export: {target}")

    chunks = []
    cursor = 12
    gltf = None
    json_chunk_index = None
    while cursor < len(data):
        length, chunk_type = struct.unpack_from("<II", data, cursor)
        payload = data[cursor + 8 : cursor + 8 + length]
        if chunk_type == 0x4E4F534A:
            gltf = json.loads(payload.rstrip(b" \0").decode("utf-8"))
            json_chunk_index = len(chunks)
        chunks.append((chunk_type, payload))
        cursor += 8 + length
    if gltf is None or json_chunk_index is None:
        raise RuntimeError(f"Missing GLB JSON chunk: {target}")

    asset_extras = gltf.setdefault("asset", {}).setdefault("extras", {})
    asset_extras.update(
        {
            "assetId": contract["assetId"],
            "partId": contract["partId"],
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
        {
            "assetId": contract["assetId"],
            "partId": contract["partId"],
            "spacefaceAsset": contract,
        }
    )

    nodes = gltf.get("nodes", [])
    root_node = next((node for node in nodes if node.get("name") == ROOT_NAME), None)
    socket_node = next(
        (node for node in nodes if node.get("name") == "SOCKET_Structure_Core"),
        None,
    )
    if root_node is None or socket_node is None:
        raise RuntimeError("Export lost dock root or SOCKET_Structure_Core")
    root_extras = root_node.setdefault("extras", {})
    root_extras.pop("spacefaceAssetJson", None)
    root_extras.update(
        {
            "assetId": contract["assetId"],
            "partId": contract["partId"],
            "spacefaceAsset": contract,
        }
    )
    if any(node.get("name") == "HOOK_Emissive" for node in nodes):
        raise RuntimeError("Preview GLB retained unsupported historical HOOK_Emissive")
    if socket_node.get("extras", {}).get("role") != "structure":
        raise RuntimeError("SOCKET_Structure_Core lost semantic role")
    if any(node.get("name", "").startswith(("LOD1_", "LOD2_")) for node in nodes):
        raise RuntimeError("Preview GLB accidentally contains non-selected LOD primitives")

    json_payload = json.dumps(
        gltf,
        separators=(",", ":"),
        ensure_ascii=False,
    ).encode("utf-8")
    json_payload += b" " * ((4 - len(json_payload) % 4) % 4)
    chunks[json_chunk_index] = (0x4E4F534A, json_payload)
    body = b"".join(
        struct.pack("<II", len(payload), chunk_type) + payload
        for chunk_type, payload in chunks
    )
    target.write_bytes(struct.pack("<III", magic, version, 12 + len(body)) + body)


def main() -> None:
    args = cli()
    args.maps_root = args.maps_root.resolve()
    args.output_blend = args.output_blend.resolve()
    args.output_glb = args.output_glb.resolve()
    args.report = args.report.resolve()
    validate_output_only_paths(args)
    surface_manifest = validate_surface_inputs(args.maps_root)

    clear_scene()
    root = add_empty(ROOT_NAME, None)
    lod_roots = {
        lod: add_empty(
            f"LOD{lod}_Dock_ROOT",
            root,
            **{
                "spaceface.lod": f"lod{lod}",
                "spaceface.lodLevel": lod,
                "spaceface.semanticRole": "authored_lod_root",
            },
        )
        for lod in range(3)
    }
    socket = add_empty(
        "SOCKET_Structure_Core",
        root,
        location=(0.0, 0.0, 0.0),
        role="structure",
        forward=[1.0, 0.0, 0.0],
        **{"spaceface.semanticRole": "dock_structure_core"},
    )

    materials = {
        name: make_material(name, role, args.maps_root)
        for name, role in MATERIAL_ROLES.items()
    }
    for lod in range(3):
        build_lod(lod, materials, lod_roots[lod])

    failures = apply_modifiers()
    aperture_validation = assert_clear_aperture()
    join_draw_groups(materials, lod_roots)
    failures.extend(unwrap_and_triangulate())
    tangents = tangent_results()
    invalid_tangents = [entry for entry in tangents if not entry["valid"]]
    scale_failures = [
        obj.name
        for obj in bpy.data.objects
        if obj.type == "MESH"
        and any(abs(float(value) - 1.0) > 1e-5 for value in obj.scale)
    ]
    if failures or invalid_tangents or scale_failures:
        raise RuntimeError(
            "Dock surface validation failed: "
            f"operations={failures[:4]} tangents={invalid_tangents[:4]} "
            f"scale={scale_failures[:8]}"
        )

    lod_meshes = {
        lod: sorted(
            [
                obj
                for obj in bpy.data.objects
                if obj.type == "MESH" and is_descendant(obj, lod_roots[lod])
            ],
            key=lambda obj: obj.name,
        )
        for lod in range(3)
    }
    lod_stats = {
        f"lod{lod}": {
            "triangles": sum(triangle_count(obj) for obj in meshes),
            "drawGroups": len(meshes),
            "objects": [obj.name for obj in meshes],
        }
        for lod, meshes in lod_meshes.items()
    }
    if not (
        lod_stats["lod0"]["triangles"]
        > lod_stats["lod1"]["triangles"]
        > lod_stats["lod2"]["triangles"]
        > 0
    ):
        raise RuntimeError(f"Authored LOD triangle order is not monotonic: {lod_stats}")

    candidate_bounds = bounds(lod_meshes[0])
    validate_bounds(candidate_bounds)
    export_reason = (
        "LOD0-only GLB: shipPreviewMount.groupFromBlueprint instantiates every primitive "
        "and has no place-asset LOD selection; LOD1/LOD2 remain editable in the blend."
    )
    asset_contract = {
        "contractVersion": 1,
        "assetId": ASSET_ID,
        "partId": ASSET_ID,
        "liveId": ASSET_ID,
        "slot": "place",
        "category": "places",
        "priority": "P0",
        "sourceRole": "shipworks_preview_backdrop",
        "forward": "+X",
        "up": "+Y",
        "starboard": "+Z",
        "unit": "metre",
        "normalConvention": "OpenGL",
        "ormChannels": "R=AO,G=Roughness,B=Metallic",
        "textureCompression": "PNG-source",
        "textureSize": 1024,
        "triangleCount": lod_stats["lod0"]["triangles"],
        "boundsDimensionsM": [
            candidate_bounds["size"][0],
            candidate_bounds["size"][2],
            candidate_bounds["size"][1],
        ],
        "sourceProvenance": {
            "textureRoleContractVersion": 1,
            "textureRoleMode": "bound-base-normal-orm",
            "sourceBlend": "assets/ships/parts/blender/place_dock_interior_authored.blend",
            "geometryPipeline": "tools/blender/remaster_opening_dock_interior_v2.py",
            "texturePipeline": "tools/art/build_dock_interior_maps.py",
            "packedEditableTextures": True,
        },
        "family": FAMILY,
        "role": "neutral_reusable_shipworks_backdrop",
        "registration": "H-04 SHIPWORKS",
        "authoringBoundsMetres": list(BLENDER_BOUNDS_M["size"]),
        "clearApertureMetres": CLEAR_APERTURE_M,
        "clearAperturePreflight": aperture_validation,
        "previewMount": PREVIEW_MOUNT_POLICY,
        "authoringLods": ["lod0", "lod1", "lod2"],
        "exportedLods": ["lod0"],
        "lodTriangles": {
            key: value["triangles"] for key, value in lod_stats.items()
        },
        "drawGroupsPerLod": {
            key: value["drawGroups"] for key, value in lod_stats.items()
        },
        "exportSelectionReason": export_reason,
        "deliverableRole": "production_single_lod_preview",
        "wiringStatus": "source_checkpoint_release_pending",
        "mountAtOrigin": True,
        "sourceRevision": SURFACE_REVISION,
    }
    root["spaceface.family"] = FAMILY
    root["spaceface.surfaceRevision"] = SURFACE_REVISION
    root["spaceface.registration"] = "H-04 SHIPWORKS"
    root["spacefaceAssetJson"] = json.dumps(asset_contract, separators=(",", ":"))
    bpy.context.scene["spacefaceAssetJson"] = root["spacefaceAssetJson"]

    args.output_blend.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(
        filepath=str(args.output_blend),
        check_existing=False,
    )
    export_lod0_glb(args.output_glb, root, lod_roots[0], [socket])
    stamp_and_validate_glb_contract(args.output_glb, asset_contract)

    report = {
        "schema": "spaceface.openingDockInteriorRemaster.v2",
        "status": "candidate-not-promoted",
        "design": {
            "identity": "H-04 Shipworks",
            "family": FAMILY,
            "role": "neutral reusable shipyard preview backdrop",
            "portalDepthsM": list(PORTAL_DEPTHS_M),
            "craneTopology": "dual depth-axis runways with one transverse bridge and hoist",
            "craneParkDepthM": CRANE_PARK_DEPTH_M,
            "clearApertureM": CLEAR_APERTURE_M,
            "clearAperturePreflight": aperture_validation,
            "excludedIdentity": [
                "Meridian Yards",
                "station-specific corporate ownership",
            ],
        },
        "surfaceManifest": {
            "path": str(surface_manifest),
            "sha256": sha256(surface_manifest),
        },
        "outputs": {
            "blend": {
                "path": str(args.output_blend),
                "sha256": sha256(args.output_blend),
            },
            "glb": {
                "path": str(args.output_glb),
                "sha256": sha256(args.output_glb),
            },
        },
        "canonicalContract": {
            "root": ROOT_NAME,
            "hooks": [],
            "socket": "SOCKET_Structure_Core",
            "bounds": BLENDER_BOUNDS_M,
            "candidateBounds": candidate_bounds,
            "forward": "+X",
            "mount": "origin",
        },
        "lods": lod_stats,
        "exportedLods": ["lod0"],
        "exportSelectionReason": export_reason,
        "materials": [
            {"name": name, "textureRole": role}
            for name, role in MATERIAL_ROLES.items()
        ],
        "tangentResults": tangents,
        "knownRisks": [
            "Candidate is not wired to the live Shipworks route.",
            "Real ship-preview framing, exposure, fog and ship occlusion require current runtime evidence.",
            "LOD1/LOD2 cannot enter the preview GLB until the runtime owns place-asset LOD selection.",
            "KTX2/Meshopt release generation and manifest publication are controller-owned integration work.",
            "Independent G7 visual acceptance remains open.",
        ],
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(
        json.dumps(
            {
                "ok": True,
                "blend": str(args.output_blend),
                "glb": str(args.output_glb),
                "report": str(args.report),
                "lods": lod_stats,
                "bounds": candidate_bounds,
                "exportedLods": ["lod0"],
            }
        )
    )


if __name__ == "__main__":
    main()
