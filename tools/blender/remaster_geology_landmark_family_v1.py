#!/usr/bin/env python3
"""Build non-promoting geological landmark candidates.

The source empties, pivot, landmark references and sockets are preserved exactly.  Only authored
mesh content is replaced.  The two supported places intentionally use different
geological and human-intervention languages:

* place_asteroid_seamed: bedded, mineral-altered claim/anomaly landmark.
* place_asteroid_graffiti: blocky natural rock carrying non-emissive prospector marks.
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


SPECS = {
    "place_asteroid_seamed": {
        "prefix": "Seamed",
        "bounds": {"min": (-14.0, -12.0, -11.0), "max": (14.0, 12.0, 11.0), "size": (28.0, 24.0, 22.0)},
        "markers": ("LANDMARK_MineralSeam", "SOCKET_Scan_Target", "Seam_Vein_A", "Seam_Vein_B", "Asteroid_Core", "Asteroid_Lump_0", "Asteroid_Lump_1", "Asteroid_Lump_2"),
        "roles": {
            "Material_Regolith": "seamed_regolith_matrix",
            "Material_Strata": "seamed_strata_exposure",
            "Material_Mineral": "seamed_mineral_vein",
            "Material_Fracture": "seamed_fracture_dust",
            "Material_SurveyAlloy": "seamed_survey_alloy",
            "Material_SurveyMarking": "seamed_survey_marking",
        },
    },
    "place_asteroid_graffiti": {
        "prefix": "Graffiti",
        "bounds": {"min": (-12.0, -9.8480778, -9.0), "max": (12.0, 9.8480778, 9.0), "size": (24.0, 19.6961556, 18.0)},
        "markers": ("LANDMARK_ProspectorTags", "SOCKET_Camera_Focus", "Graffiti_Tag_0", "Graffiti_Tag_1", "Graffiti_Tag_2", "Rock_Core", "Rock_Lump_0", "Rock_Lump_1"),
        "roles": {
            "Material_Regolith": "graffiti_regolith_matrix",
            "Material_FreshBreak": "graffiti_fresh_break",
            "Material_Recess": "graffiti_recess_dust",
            "Material_PaintRed": "graffiti_paint_red",
            "Material_PaintBone": "graffiti_paint_bone",
            "Material_Hardware": "graffiti_hardware_alloy",
        },
    },
}

RUNTIME_MATERIAL_ROLE = {
    "seamed_regolith_matrix": "geology",
    "seamed_strata_exposure": "geology",
    "seamed_mineral_vein": "geology",
    "seamed_fracture_dust": "geology",
    "seamed_survey_alloy": "mechanical",
    "seamed_survey_marking": "warning",
    "graffiti_regolith_matrix": "geology",
    "graffiti_fresh_break": "geology",
    "graffiti_recess_dust": "geology",
    "graffiti_paint_red": "warning",
    "graffiti_paint_bone": "warning",
    "graffiti_hardware_alloy": "mechanical",
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


def snapshot_object(obj) -> dict:
    return {
        "location": [float(v) for v in obj.location],
        "rotationMode": obj.rotation_mode,
        "rotationEuler": [float(v) for v in obj.rotation_euler],
        "rotationQuaternion": [float(v) for v in obj.rotation_quaternion],
        "scale": [float(v) for v in obj.scale],
        "parent": obj.parent.name if obj.parent else None,
        "matrixLocal": [[float(value) for value in row] for row in obj.matrix_local],
    }


def load_image(path: Path, colorspace: str):
    image = bpy.data.images.load(str(path.resolve()), check_existing=True)
    image.name = path.name
    image.colorspace_settings.name = colorspace
    image.pack()
    return image


def make_material(name: str, role: str, maps_root: Path):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    material.diffuse_color = (0.25, 0.25, 0.25, 1.0)
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
    # The deterministic map generator already authors a physical, role-specific
    # normal amplitude. Attenuating it here a second time erased the meso read at
    # the gameplay camera.
    normal_map.inputs["Strength"].default_value = 1.0
    links.new(normal.outputs["Color"], normal_map.inputs["Color"])
    links.new(normal_map.outputs["Normal"], principled.inputs["Normal"])

    if "alloy" in role or "hardware" in role:
        principled.inputs["Coat Weight"].default_value = 0.04
        principled.inputs["Coat Roughness"].default_value = 0.30
    if role.endswith("regolith_matrix"):
        principled.inputs["Specular IOR Level"].default_value = 0.10
    elif "dust" in role:
        principled.inputs["Specular IOR Level"].default_value = 0.08
    links.new(principled.outputs["BSDF"], output.inputs["Surface"])
    material["spaceface.semantic"] = name
    material["spaceface.textureRole"] = role
    material["spacefaceMaterialRole"] = RUNTIME_MATERIAL_ROLE[role]
    material["spacefacePaletteTint"] = "none"
    material["spaceface.ormChannels"] = "R=AO,G=Roughness,B=Metallic"
    material["spaceface.normalConvention"] = "OpenGL tangent space"
    material["spaceface.emissive"] = False
    return material


def tag(obj, lod: int, material, structure: str, root) -> None:
    obj.parent = root
    obj["spaceface.lod"] = f"lod{lod}"
    obj["spaceface.lodLevel"] = lod
    obj["spaceface.materialRole"] = material.name
    obj["spaceface.structureRole"] = structure
    obj["spaceface.candidate"] = "geology-landmark-family-v3"


def rock_radius_y(x: float, z: float, sx: float, sy: float, sz: float) -> float:
    radial = max(0.025, 1.0 - (x / sx) ** 2 - (z / sz) ** 2)
    return -sy * math.sqrt(radial)


def make_rock(name: str, lod: int, half_axes, material, root, style: str):
    subdivisions = (5, 4, 3)[lod]
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdivisions, radius=1.0)
    obj = bpy.context.object
    obj.name = f"LOD{lod}_{name}_HostRock"
    sx, sy, sz = half_axes
    crater_dirs = (
        ((0.56, -0.72, 0.28), 0.12, 0.24),
        ((-0.70, -0.54, -0.18), 0.09, 0.18),
        ((0.18, 0.72, 0.61), 0.075, 0.15),
    ) if style == "seamed" else (
        ((-0.54, -0.73, 0.18), 0.17, 0.24),
        ((0.66, 0.52, -0.20), 0.105, 0.18),
        ((0.05, -0.58, -0.76), 0.09, 0.16),
    )
    for vertex in obj.data.vertices:
        direction = vertex.co.normalized()
        x, y, z = direction
        if style == "seamed":
            macro = 0.070 * math.sin(3.3*x + 2.1*z) + 0.050 * math.sin(5.7*y - 1.9*x)
            meso = 0.031 * math.sin(11.0*x + 7.0*y + 2.0*z) + 0.021 * math.cos(17.0*z - 4.0*y)
            bedding = 0.028 * math.sin(21.0*z + 2.0*x)
            taper = 1.0 + 0.045*x - 0.025*z
        else:
            macro = 0.092 * math.sin(2.7*x - 3.2*z) + 0.055 * math.cos(4.4*y + 1.7*z)
            meso = 0.038 * math.sin(9.0*x - 5.0*y + 6.0*z) + 0.025 * math.cos(14.0*x + 3.0*z)
            bedding = 0.020 * math.sin(13.0*z - 6.0*x)
            # Quantized term gives the graffiti rock broader fracture planes.
            planar = round((0.65*x + 0.27*z) * 5.0) / 5.0 - (0.65*x + 0.27*z)
            macro += planar * 0.18
            taper = 1.0 - 0.045*x + 0.035*z
        radius = (1.0 + macro + meso + bedding) * taper
        for raw_dir, depth, sigma in crater_dirs:
            crater_dir = Vector(raw_dir).normalized()
            angle = math.acos(max(-1.0, min(1.0, direction.dot(crater_dir))))
            radius -= depth * math.exp(-((angle / sigma) ** 2))
            radius += depth * 0.18 * math.exp(-(((angle - sigma * 1.15) / (sigma * 0.20)) ** 2))
        vertex.co = Vector((x * sx * radius, y * sy * radius, z * sz * radius))
    obj.data.update()
    obj.data.materials.append(material)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    tag(obj, lod, material, "authored_geological_host_mass", root)
    return obj


def make_curve(name, points, radius, material, lod, structure, root, resolution=2):
    curve = bpy.data.curves.new(f"{name}_Curve", "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 1
    curve.bevel_depth = radius
    curve.bevel_resolution = max(0, resolution if lod == 0 else resolution - 1)
    curve.resolution_u = 1
    spline = curve.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for point, coordinate in zip(spline.points, points):
        point.co = (*coordinate, 1.0)
    obj = bpy.data.objects.new(f"LOD{lod}_{name}", curve)
    bpy.context.scene.collection.objects.link(obj)
    obj.data.materials.append(material)
    tag(obj, lod, material, structure, root)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target="MESH")
    obj.select_set(False)
    return obj


def box(name, dimensions, location, rotation, material, lod, structure, root, edge=0.05):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = f"LOD{lod}_{name}"
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    obj.data.materials.append(material)
    if edge > 0:
        modifier = obj.modifiers.new("SF_PhysicalEdge", "BEVEL")
        modifier.width = edge * (1.0 if lod == 0 else 0.72 if lod == 1 else 0.45)
        modifier.segments = 3 if lod == 0 else 2 if lod == 1 else 1
        modifier.limit_method = "ANGLE"
    tag(obj, lod, material, structure, root)
    return obj


def cylinder(name, radius, depth, location, rotation, material, lod, structure, root, vertices=20, edge=0.04):
    count = max(8, vertices if lod == 0 else vertices // 2 if lod == 1 else vertices // 3)
    bpy.ops.mesh.primitive_cylinder_add(vertices=count, radius=radius, depth=depth, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = f"LOD{lod}_{name}"
    obj.data.materials.append(material)
    if edge > 0:
        modifier = obj.modifiers.new("SF_PhysicalEdge", "BEVEL")
        modifier.width = edge * (1.0 if lod == 0 else 0.7)
        modifier.segments = 2 if lod == 0 else 1
    tag(obj, lod, material, structure, root)
    return obj


def prism(name, points, depth, axis, location, rotation, material, lod, structure, root, edge=0.03):
    count = len(points)
    vertices = []
    for side in (-depth * 0.5, depth * 0.5):
        for u, v in points:
            if axis == "X": vertices.append((side, u, v))
            elif axis == "Y": vertices.append((u, side, v))
            else: vertices.append((u, v, side))
    faces = [tuple(range(count - 1, -1, -1)), tuple(range(count, count * 2))]
    for index in range(count):
        nxt = (index + 1) % count
        faces.append((index, nxt, count + nxt, count + index))
    mesh = bpy.data.meshes.new(f"LOD{lod}_{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.validate(clean_customdata=False)
    mesh.update()
    obj = bpy.data.objects.new(f"LOD{lod}_{name}", mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler = rotation
    obj.data.materials.append(material)
    if edge > 0:
        modifier = obj.modifiers.new("SF_PhysicalEdge", "BEVEL")
        modifier.width = edge * (1.0 if lod == 0 else 0.65)
        modifier.segments = 2 if lod == 0 else 1
    tag(obj, lod, material, structure, root)
    return obj


def seam_points(raw_points, half_axes, lift=0.0):
    sx, sy, sz = half_axes
    return [(x, rock_radius_y(x, z, sx, sy, sz) - lift, z) for x, z in raw_points]


def surface_y(host, x: float, z: float, fallback_axes) -> float:
    hit, location, _normal, _face = host.ray_cast(Vector((x, -40.0, z)), Vector((0.0, 1.0, 0.0)), distance=80.0)
    return float(location.y) if hit else rock_radius_y(x, z, *fallback_axes)


def surface_points(host, raw_points, fallback_axes, outward=0.0):
    return [(x, surface_y(host, x, z, fallback_axes) - outward, z) for x, z in raw_points]


def distance_to_polyline_2d(x: float, z: float, raw_points) -> float:
    point = Vector((x, z))
    nearest = float("inf")
    for index in range(len(raw_points) - 1):
        start = Vector(raw_points[index])
        end = Vector(raw_points[index + 1])
        segment = end - start
        length_squared = segment.length_squared
        factor = 0.0 if length_squared <= 1e-9 else max(0.0, min(1.0, (point - start).dot(segment) / length_squared))
        nearest = min(nearest, (point - start.lerp(end, factor)).length)
    return nearest


def carve_surface_trench(host, raw_points, radius: float, depth: float) -> None:
    """Recess the near-side host mesh so a fracture has shoulders, not a pasted strip."""
    for vertex in host.data.vertices:
        if vertex.co.y >= 0.0:
            continue
        distance = distance_to_polyline_2d(float(vertex.co.x), float(vertex.co.z), raw_points)
        if distance >= radius:
            continue
        falloff = 1.0 - distance / radius
        falloff = falloff * falloff * (3.0 - 2.0 * falloff)
        vertex.co.y += depth * falloff
    host.data.update()


def carve_surface_patch(host, center, radii, depth: float) -> None:
    """Create a shallow angular-break seat below the weathered host surface."""
    cx, cz = center
    rx, rz = radii
    for vertex in host.data.vertices:
        if vertex.co.y >= 0.0:
            continue
        normalized = math.sqrt(((vertex.co.x - cx) / rx) ** 2 + ((vertex.co.z - cz) / rz) ** 2)
        if normalized >= 1.0:
            continue
        falloff = 1.0 - normalized
        falloff = falloff * falloff * (3.0 - 2.0 * falloff)
        vertex.co.y += depth * falloff
    host.data.update()


def make_surface_ribbon(name, raw_points, host, fallback_axes, width, outward, material, lod, structure, root):
    """Create an irregular, surface-following geological ribbon rather than a tube."""
    dense_points = []
    steps = 5 if lod == 0 else 4 if lod == 1 else 3
    for segment in range(len(raw_points) - 1):
        start = Vector(raw_points[segment])
        end = Vector(raw_points[segment + 1])
        for step in range(steps):
            factor = step / steps
            point = start.lerp(end, factor)
            dense_points.append((float(point.x), float(point.y)))
    dense_points.append(tuple(raw_points[-1]))
    raw_points = dense_points
    vertices = []
    pairs = []
    count = len(raw_points)
    for index, (x, z) in enumerate(raw_points):
        previous = Vector(raw_points[max(0, index - 1)])
        following = Vector(raw_points[min(count - 1, index + 1)])
        tangent = (following - previous).normalized()
        perpendicular = Vector((-tangent.y, tangent.x))
        local_width = width * (0.82 + 0.18 * math.sin(index * 2.37 + lod * 0.41))
        pair = []
        for sign in (1.0, -1.0):
            px = x + perpendicular.x * local_width * 0.5 * sign
            pz = z + perpendicular.y * local_width * 0.5 * sign
            py = surface_y(host, px, pz, fallback_axes) - outward
            pair.append(len(vertices))
            vertices.append((px, py, pz))
        pairs.append(pair)
    faces = [(pairs[index][0], pairs[index][1], pairs[index + 1][1], pairs[index + 1][0]) for index in range(count - 1)]
    mesh = bpy.data.meshes.new(f"LOD{lod}_{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.validate(clean_customdata=False)
    mesh.update()
    obj = bpy.data.objects.new(f"LOD{lod}_{name}", mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.data.materials.append(material)
    solidify = obj.modifiers.new("SF_GeologicalRibbonDepth", "SOLIDIFY")
    solidify.thickness = 0.045 if lod == 0 else 0.06
    solidify.offset = 0.0
    tag(obj, lod, material, structure, root)
    return obj


def build_seamed_lod(lod: int, mats, root) -> None:
    half_axes = ((13.35, 11.55, 10.45), (13.30, 11.50, 10.40), (13.20, 11.40, 10.30))[lod]
    host = make_rock("Seamed", lod, half_axes, mats["Material_Regolith"], root, "seamed")
    primary_raw = [(-10.4, 2.8), (-8.0, 1.35), (-5.1, 2.0), (-2.2, 0.65), (0.3, -0.35), (3.4, 0.45), (5.9, -0.80), (8.4, 0.15), (10.5, -1.0)]
    branch_raw = [(-2.0, 0.75), (-1.0, 2.45), (0.6, 4.2), (2.4, 6.1)]
    upper_raw = [(-8.0, 5.7), (-5.0, 5.2), (-2.1, 5.9), (1.0, 5.3), (4.0, 5.8)]
    # Cut the major fracture into the host before laying in dust and mineral.
    # Its recessed bed stays readable without relying on emission or bloom.
    carve_surface_trench(host, primary_raw, (1.62, 1.50, 1.34)[lod], (0.52, 0.44, 0.34)[lod])
    carve_surface_trench(host, branch_raw, (0.98, 0.88, 0.76)[lod], (0.36, 0.30, 0.24)[lod])
    make_surface_ribbon("Seamed_PrimaryAlterationHalo", primary_raw, host, half_axes, (2.30, 2.10, 1.88)[lod], 0.13, mats["Material_Strata"], lod, "bleached_strata_alteration_halo", root)
    make_surface_ribbon("Seamed_PrimaryFracture", primary_raw, host, half_axes, (1.48, 1.38, 1.28)[lod], 0.10, mats["Material_Fracture"], lod, "deep_primary_claim_seam", root)
    make_surface_ribbon("Seamed_BranchAlterationHalo", branch_raw, host, half_axes, (1.30, 1.18, 1.05)[lod], 0.12, mats["Material_Strata"], lod, "secondary_bleached_alteration_halo", root)
    make_surface_ribbon("Seamed_BranchFracture", branch_raw, host, half_axes, (0.84, 0.77, 0.70)[lod], 0.20, mats["Material_Fracture"], lod, "secondary_branch_fracture", root)
    mineral_segments = [
        [(-8.3, 1.45), (-7.1, 1.55)],
        [(-2.0, 0.57), (-0.75, 0.05)],
        [(3.6, 0.34), (4.65, -0.18)],
        [(8.15, 0.05), (9.20, -0.42)],
    ]
    for index, segment in enumerate(mineral_segments[: 4 if lod < 2 else 3]):
        make_surface_ribbon(f"Seamed_MineralPocket_{index}", segment, host, half_axes, (0.46, 0.42, 0.38)[lod], 0.31, mats["Material_Mineral"], lod, "bounded_mineral_inclusion_inside_fracture", root)
    make_surface_ribbon("Seamed_BranchMineralPocket", [(-0.9, 2.55), (0.05, 3.55)], host, half_axes, (0.30, 0.27, 0.24)[lod], 0.29, mats["Material_Mineral"], lod, "secondary_mineral_inclusion", root)
    make_surface_ribbon("Seamed_UpperStrata", upper_raw, host, half_axes, (0.48, 0.44, 0.40)[lod], 0.18, mats["Material_Strata"], lod, "exposed_bedding_plane", root)
    # Parallel strata are deliberately quieter than the claim seam.
    for index, offset in enumerate((-0.66, 0.70)):
        raw = [(x, z + offset) for x, z in upper_raw]
        make_surface_ribbon(f"Seamed_Strata_{index}", raw, host, half_axes, (0.22, 0.20, 0.18)[lod], 0.17, mats["Material_Strata"], lod, "parallel_strata_expression", root)

    # Alteration lenses make the mineral zone broader than a neon line.
    lens_points = [(-5.4, 2.15), (0.7, -0.32), (6.1, -0.78)]
    for index, (x, z) in enumerate(lens_points[: 3 if lod < 2 else 2]):
        y = surface_y(host, x, z, half_axes) - 0.12
        prism(f"Seamed_AlterationLens_{index}", [(-0.82, -0.26), (-0.42, -0.40), (0.72, -0.34), (0.92, -0.03), (0.44, 0.30), (-0.58, 0.27)], 0.12, "Y", (x, y, z), (0.0, 0.0, -0.18), mats["Material_Mineral"], lod, "mineral_alteration_lens", root, 0.015)

    # Restrained survey evidence: actual anchors and a non-emissive registration plate.
    if lod < 2:
        for index, (x, z) in enumerate(((-0.9, -0.2), (0.7, -1.9), (2.0, -0.7))):
            y = surface_y(host, x, z, half_axes) - 0.25
            cylinder(f"Seamed_SurveyPin_{index}", 0.19, 0.58, (x, y, z), (math.pi / 2, 0, 0), mats["Material_SurveyAlloy"], lod, "survey_anchor_drilled_into_seam", root, 16, 0.025)
        make_surface_ribbon("Seamed_SurveyCable", [(-0.9, -0.2), (0.7, -1.9), (2.0, -0.7)], host, half_axes, 0.14 if lod == 0 else 0.18, 0.24, mats["Material_SurveyAlloy"], lod, "bounded_surface_routed_survey_cable", root)
    plate_y = surface_y(host, 2.8, 0.4, half_axes) - 0.18
    box("Seamed_SurveyPlate", (1.85, 0.13, 0.86), (2.8, plate_y, 0.4), (0, 0, -0.10), mats["Material_SurveyAlloy"], lod, "non_emissive_claim_survey_plate", root, 0.025)
    if lod < 2:
        add_text("Seamed_SurveyText", "M-17", 0.42 if lod == 0 else 0.50, (2.8, plate_y - 0.09, 0.4), (math.pi / 2, 0, -0.10), mats["Material_SurveyMarking"], lod, "survey_registration_not_hazard_light", root)
    host["spaceface.primaryLandmark"] = "LANDMARK_MineralSeam"


def add_text(name, body, size, location, rotation, material, lod, structure, root):
    curve = bpy.data.curves.new(f"{name}_Font", "FONT")
    curve.body = body
    curve.align_x = "CENTER"
    curve.align_y = "CENTER"
    curve.size = size
    curve.extrude = 0.020 if lod == 0 else 0.016
    curve.bevel_depth = 0.006 if lod == 0 else 0.003
    curve.bevel_resolution = 1
    obj = bpy.data.objects.new(f"LOD{lod}_{name}", curve)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler = rotation
    obj.data.materials.append(material)
    tag(obj, lod, material, structure, root)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target="MESH")
    obj.select_set(False)
    return obj


def add_block_p9(face_y, lod, material, root):
    """Low-poly P-9 glyph retaining the landmark read in far LODs."""
    depth = 0.085
    thick = 0.30 if lod == 1 else 0.38
    # P: stem, cap, bowl side, middle.  9: top/bottom/mid + two uprights.
    bars = [
        ("PStem", (thick, depth, 2.75), (0.0, face_y, 0.45)),
        ("PTop", (1.35, depth, thick), (0.55, face_y, 1.67)),
        ("PRight", (thick, depth, 1.25), (1.08, face_y, 1.10)),
        ("PMid", (1.20, depth, thick), (0.50, face_y, 0.52)),
        ("Dash", (0.75, depth, thick), (2.05, face_y, 0.45)),
        ("NineTop", (1.35, depth, thick), (3.35, face_y, 1.67)),
        ("NineMid", (1.35, depth, thick), (3.35, face_y, 0.47)),
        ("NineBottom", (1.35, depth, thick), (3.35, face_y, -0.76)),
        ("NineLeft", (thick, depth, 1.25), (2.82, face_y, 1.10)),
        ("NineRight", (thick, depth, 2.75), (3.88, face_y, 0.45)),
    ]
    for name, dimensions, location in bars:
        box(f"Graffiti_BlockTag_{name}", dimensions, location, (0, -0.10, 0), material, lod, "low_poly_hand_painted_prospector_site_mark", root, 0.015)


def build_graffiti_lod(lod: int, mats, root) -> None:
    half_axes = ((11.35, 9.32, 8.48), (11.30, 9.26, 8.43), (11.20, 9.18, 8.34))[lod]
    host = make_rock("Graffiti", lod, half_axes, mats["Material_Regolith"], root, "graffiti")
    # Fresh angular break plane and dark contact seam establish a different geology.
    carve_surface_patch(host, (-4.8, 1.4), (4.35, 3.55), (0.46, 0.38, 0.30)[lod])
    break_y = surface_y(host, -4.8, 1.5, half_axes) - 0.17
    break_shape = [(-3.0, -2.3), (-1.0, -3.0), (2.2, -2.2), (3.0, 0.1), (1.7, 2.7), (-1.4, 2.5), (-3.2, 0.5)]
    prism("Graffiti_FreshBreak", break_shape, 0.19, "Y", (-4.8, break_y, 1.4), (0.0, 0.0, 0.10), mats["Material_FreshBreak"], lod, "fresh_angular_spall_surface", root, 0.025)
    make_surface_ribbon("Graffiti_BreakContact", [(-8.6, -0.6), (-7.2, 1.0), (-6.0, 3.4), (-3.7, 4.5), (-1.8, 3.8)], host, half_axes, (0.58, 0.52, 0.46)[lod], 0.08, mats["Material_Recess"], lod, "recessed_dust_filled_break_contact", root)
    # Every painted stroke follows the actual rock surface; no planar decal card is
    # allowed to float away from the host. P-9 remains legible in all three LODs.
    glyph_strokes = [
        [(0.0, -1.25), (0.0, 1.60)],
        [(0.0, 1.60), (1.25, 1.60), (1.25, 0.42), (0.0, 0.42)],
        [(1.75, 0.25), (2.45, 0.25)],
        [(3.0, 1.58), (4.22, 1.58), (4.22, 0.38), (3.0, 0.38), (3.0, 1.58)],
        [(4.22, 0.38), (4.22, -1.22), (3.05, -1.22)],
    ]
    for index, stroke in enumerate(glyph_strokes):
        make_surface_ribbon(f"Graffiti_P9Stroke_{index}", stroke, host, half_axes, (0.38, 0.42, 0.47)[lod], 0.15, mats["Material_PaintBone"], lod, "surface_bound_hand_painted_prospector_site_mark", root)
    red_strokes = [
        [(-2.55, -2.05), (-2.15, 2.25)],
        [(5.20, 1.25), (6.15, 0.28), (5.20, -0.62)],
        [(6.20, 1.25), (7.15, 0.28), (6.20, -0.62)],
    ]
    for index, stroke in enumerate(red_strokes[: 3 if lod < 2 else 2]):
        make_surface_ribbon(f"Graffiti_RedMark_{index}", stroke, host, half_axes, (0.38, 0.42, 0.48)[lod], 0.18, mats["Material_PaintRed"], lod, "surface_bound_hand_painted_directional_mark", root)
    if lod == 0:
        for index, x in enumerate((-2.05, 0.55, 4.35)):
            z0 = -1.25 - 0.18 * (index % 2)
            make_surface_ribbon(f"Graffiti_Drip_{index}", [(x, z0), (x + 0.07, z0 - 0.55 - index * 0.10)], host, half_axes, 0.11, 0.19, mats["Material_PaintRed"], lod, "directional_paint_run", root)

    # Drilled occupation hardware is sparse, attached, and visibly manufactured.
    for index, (x, z) in enumerate(((5.9, 2.9), (6.5, 1.7), (5.2, 0.8)) if lod < 2 else ((5.9, 2.4), (5.5, 1.0))):
        y = surface_y(host, x, z, half_axes) - 0.24
        cylinder(f"Graffiti_Anchor_{index}", 0.23 if lod == 0 else 0.28, 0.62, (x, y, z), (math.pi / 2, 0, 0), mats["Material_Hardware"], lod, "prospector_anchor_bolt", root, 18, 0.03)
    cable_raw = [(5.9, 2.9), (6.6, 2.1), (5.2, 0.8)]
    make_curve("Graffiti_AnchorStrap", surface_points(host, cable_raw, half_axes, 0.30), 0.095 if lod < 2 else 0.13, mats["Material_Hardware"], lod, "surface_following_prospector_strap", root, 1)
    plate_y = surface_y(host, 6.6, -0.5, half_axes) - 0.18
    box("Graffiti_LedgerPlate", (1.65, 0.16, 0.72), (6.6, plate_y, -0.5), (0, 0, 0.04), mats["Material_Hardware"], lod, "drilled_claim_ledger_plate", root, 0.07)
    if lod == 0:
        add_text("Graffiti_LedgerText", "09", 0.36, (6.6, plate_y - 0.10, -0.5), (math.pi / 2, 0, 0.04), mats["Material_PaintRed"], lod, "painted_ledger_number", root)
    host["spaceface.primaryLandmark"] = "LANDMARK_ProspectorTags"
    host["spaceface.emissiveIntent"] = "none-hook-preserved-for-contract"


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
        triangulate = obj.modifiers.new("SF_PreUVTriangulate", "TRIANGULATE")
        triangulate.keep_custom_normals = True
        try:
            bpy.ops.object.modifier_apply(modifier=triangulate.name)
        except Exception as exc:
            failures.append(f"{obj.name}/{triangulate.name}: {exc}")
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        obj.data.validate(clean_customdata=False)
        if not obj.data.uv_layers:
            obj.data.uv_layers.new(name="UVMap")
        try:
            if obj.get("spaceface.structureRole") == "authored_geological_host_mass":
                # A per-triangle smart projection visibly breaks low-frequency PBR
                # fields into triangular islands.  Continuous normalized spherical
                # UVs keep geological structure coherent; the unavoidable wrap seam
                # is moved to the rear and corrected per polygon.
                mesh = obj.data
                uv_data = mesh.uv_layers.active.data
                extents = [max(abs(vertex.co[axis]) for vertex in mesh.vertices) or 1.0 for axis in range(3)]
                for polygon in mesh.polygons:
                    values = []
                    for loop_index in polygon.loop_indices:
                        co = mesh.vertices[mesh.loops[loop_index].vertex_index].co
                        direction = Vector((co.x / extents[0], co.y / extents[1], co.z / extents[2])).normalized()
                        u = 0.5 + math.atan2(direction.y, direction.x) / (2.0 * math.pi)
                        v = 0.5 + math.asin(max(-1.0, min(1.0, direction.z))) / math.pi
                        values.append([loop_index, u, v])
                    if max(value[1] for value in values) - min(value[1] for value in values) > 0.5:
                        for value in values:
                            if value[1] < 0.5:
                                value[1] += 1.0
                    for loop_index, u, v in values:
                        uv_data[loop_index].uv = (u, v)
                obj["spaceface.uvContract"] = "continuous_normalized_spherical_rear_wrap"
            else:
                bpy.ops.object.mode_set(mode="EDIT")
                bpy.ops.mesh.select_all(action="SELECT")
                bpy.ops.uv.smart_project(angle_limit=math.radians(56.0), island_margin=0.012)
                bpy.ops.object.mode_set(mode="OBJECT")
                obj["spaceface.uvContract"] = "bounded_smart_project_for_attached_detail"
        except Exception as exc:
            failures.append(f"{obj.name}/UV: {exc}")
            if obj.mode != "OBJECT":
                bpy.ops.object.mode_set(mode="OBJECT")
        obj.select_set(False)
    return failures


def join_groups(materials, root, prefix: str) -> None:
    for lod in range(3):
        for material_name, material_value in materials.items():
            matches = [obj for obj in bpy.data.objects if obj.type == "MESH" and int(obj.get("spaceface.lodLevel", -1)) == lod and obj.data.materials and obj.data.materials[0] == material_value]
            if not matches:
                continue
            if material_name == "Material_SurveyAlloy":
                # These few disconnected survey fittings are individually tangent-
                # clean. Joining their unrelated UV islands causes Blender 5.1 to
                # synthesize zero tangents on eleven cap loops. Preserve them as
                # bounded semantic sub-draws instead of corrupting normal mapping.
                for index, obj in enumerate(matches):
                    obj.name = f"LOD{lod}_{prefix}_{material_name}_{index:02d}"
                    obj.parent = root
                    obj["spaceface.lod"] = f"lod{lod}"
                    obj["spaceface.lodLevel"] = lod
                    obj["spaceface.materialRole"] = material_name
                    obj["spaceface.structureRole"] = "tangent_clean_survey_fitting_subdraw"
                    obj.select_set(False)
                continue
            bpy.ops.object.select_all(action="DESELECT")
            for obj in matches:
                obj.select_set(True)
            bpy.context.view_layer.objects.active = matches[0]
            if len(matches) > 1:
                bpy.ops.object.join()
            joined = bpy.context.object
            joined.name = f"LOD{lod}_{prefix}_{material_name}"
            joined.parent = root
            joined["spaceface.lod"] = f"lod{lod}"
            joined["spaceface.lodLevel"] = lod
            joined["spaceface.materialRole"] = material_name
            joined["spaceface.structureRole"] = "merged_geological_or_intervention_draw_group"
            # glTF export triangulates primitives. Keep the small survey-alloy
            # draw group in its clean pre-export topology: applying Blender's
            # triangulate modifier to its disconnected caps creates zero tangent
            # loops even though every pre-join source mesh is tangent-clean.
            joined.select_set(False)


def tangent_results() -> list[dict]:
    results = []
    for obj in sorted((item for item in bpy.data.objects if item.type == "MESH"), key=lambda item: item.name):
        mesh = obj.data
        mesh.calc_loop_triangles()
        valid = False
        error = None
        lengths = []
        valid_count = 0
        try:
            mesh.calc_tangents(uvmap=mesh.uv_layers[0].name)
            lengths = [loop.tangent.length for loop in mesh.loops]
            valid_count = sum(1 for length in lengths if 0.985 < length < 1.015)
            # Curves/text converted to meshes can leave a bounded number of seam-cap
            # loops without a useful tangent.  The textured surface loops must still
            # be overwhelmingly normalized.
            valid = bool(lengths) and valid_count / len(lengths) >= 0.995
        except Exception as exc:
            error = str(exc)
        finally:
            try: mesh.free_tangents()
            except Exception: pass
        results.append({"object": obj.name, "valid": valid, "error": error, "loops": len(mesh.loops), "normalizedFraction": (valid_count / len(lengths)) if error is None and lengths else 0.0})
    return results


def triangles(obj) -> int:
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


def bounds(objects):
    points = [obj.matrix_world @ Vector(corner) for obj in objects for corner in obj.bound_box]
    low = [min(point[axis] for point in points) for axis in range(3)]
    high = [max(point[axis] for point in points) for axis in range(3)]
    return {"min": low, "max": high, "size": [high[index] - low[index] for index in range(3)]}


def export_glb(target: Path, root) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    for obj in bpy.data.objects:
        if obj.type not in {"LIGHT", "CAMERA"}:
            obj.select_set(True)
    bpy.context.view_layer.objects.active = root
    target.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(target), export_format="GLB", use_selection=True, export_yup=True, export_apply=True, export_extras=True, export_texcoords=True, export_normals=True, export_tangents=True, export_materials="EXPORT")
    bpy.ops.object.select_all(action="DESELECT")


def main() -> None:
    args = cli()
    args.maps_root = args.maps_root.resolve()
    args.output_blend = args.output_blend.resolve()
    args.output_glb = args.output_glb.resolve()
    args.report = args.report.resolve()
    source_path = Path(bpy.data.filepath).resolve()
    asset_id = source_path.stem.removesuffix("_authored")
    if asset_id not in SPECS:
        raise RuntimeError(f"Unsupported source asset {asset_id}")
    spec = SPECS[asset_id]
    root = bpy.data.objects.get(asset_id)
    if root is None:
        raise RuntimeError(f"Missing canonical root {asset_id}")
    for marker in spec["markers"]:
        if bpy.data.objects.get(marker) is None:
            raise RuntimeError(f"Missing required marker {marker}")
    preserved = {name: snapshot_object(bpy.data.objects[name]) for name in (asset_id, *spec["markers"])}

    for obj in list(bpy.data.objects):
        if obj.type in {"MESH", "CURVE", "FONT"}:
            bpy.data.objects.remove(obj, do_unlink=True)
    for material in list(bpy.data.materials):
        bpy.data.materials.remove(material, do_unlink=True)
    for image in list(bpy.data.images):
        bpy.data.images.remove(image, do_unlink=True)

    materials = {name: make_material(name, role, args.maps_root) for name, role in spec["roles"].items()}
    for lod in range(3):
        if asset_id == "place_asteroid_seamed":
            build_seamed_lod(lod, materials, root)
        else:
            build_graffiti_lod(lod, materials, root)
    failures = apply_modifiers_and_uv()
    prejoin_tangents = tangent_results()
    print(json.dumps({"preJoinTangentFailures": [entry for entry in prejoin_tangents if entry["normalizedFraction"] < 1.0]}))
    join_groups(materials, root, spec["prefix"])

    tangents = tangent_results()
    invalid_tangents = [entry for entry in tangents if not entry["valid"]]
    scale_failures = [obj.name for obj in bpy.data.objects if obj.type == "MESH" and any(abs(float(value) - 1.0) > 1e-5 for value in obj.scale)]
    marker_after = {name: snapshot_object(bpy.data.objects[name]) for name in preserved}
    marker_failures = [name for name in preserved if preserved[name] != marker_after[name]]
    if failures or invalid_tangents or scale_failures or marker_failures:
        raise RuntimeError(json.dumps({"modifierOrUv": failures, "tangents": invalid_tangents[:6], "scale": scale_failures, "markers": marker_failures}, indent=2))

    lod_meshes = {lod: sorted([obj for obj in bpy.data.objects if obj.type == "MESH" and int(obj.get("spaceface.lodLevel", -1)) == lod], key=lambda item: item.name) for lod in range(3)}
    lod_stats = {f"lod{lod}": {"triangles": sum(triangles(obj) for obj in meshes), "drawGroups": len(meshes), "objects": [obj.name for obj in meshes]} for lod, meshes in lod_meshes.items()}
    candidate_bounds = bounds(lod_meshes[0])
    source_size = spec["bounds"]["size"]
    size_drift = [abs(candidate_bounds["size"][axis] - source_size[axis]) / source_size[axis] for axis in range(3)]
    center = [(candidate_bounds["min"][axis] + candidate_bounds["max"][axis]) * 0.5 for axis in range(3)]
    if any(value > 0.08 for value in size_drift) or any(abs(value) > 0.75 for value in center):
        raise RuntimeError(f"Source bounds/pivot drift outside guard: drift={size_drift}, center={center}, bounds={candidate_bounds}")

    root["spaceface.family"] = "geology_landmark_family_v3"
    root["spaceface.surfaceRevision"] = f"{asset_id}_geology_v3"
    root["spaceface.status"] = "candidate-not-promoted"
    root["spaceface.emissiveIntent"] = "none"
    args.output_blend.parent.mkdir(parents=True, exist_ok=True)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(args.output_blend))
    export_glb(args.output_glb, root)

    report = {
        "schema": "spaceface.geologyLandmarkCandidate.v1",
        "status": "candidate-not-promoted",
        "assetId": asset_id,
        "source": {"path": str(source_path), "sha256": sha256(source_path)},
        "outputs": {"blend": str(args.output_blend), "blendSha256": sha256(args.output_blend), "glb": str(args.output_glb), "glbSha256": sha256(args.output_glb)},
        "mapsManifest": str((args.maps_root / "surface-map-build.json").resolve()),
        "mapsManifestSha256": sha256(args.maps_root / "surface-map-build.json"),
        "materials": [{"semantic": name, "role": role, "emissive": False} for name, role in spec["roles"].items()],
        "markerContract": {"before": preserved, "after": marker_after, "failures": marker_failures, "pass": not marker_failures},
        "boundsContract": {"source": spec["bounds"], "candidate": candidate_bounds, "sizeDriftFraction": size_drift, "center": center, "pass": True},
        "lods": lod_stats,
        "tangents": tangents,
        "preJoinTangents": prejoin_tangents,
        "scaleFailures": scale_failures,
        "uvOrModifierFailures": failures,
        "visualLanguage": "mineral-altered bedded claim/anomaly geology" if asset_id.endswith("seamed") else "blocky fractured natural rock with non-emissive prospector occupation history",
        "promotion": {"performed": False, "manifestsModified": False, "releaseAssetsModified": False, "runtimeMapsModified": False},
    }
    args.report.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({"ok": True, "assetId": asset_id, "blend": str(args.output_blend), "glb": str(args.output_glb), "report": str(args.report), "lods": lod_stats}))


if __name__ == "__main__":
    main()
