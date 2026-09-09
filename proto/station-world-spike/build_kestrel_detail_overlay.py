"""Build an isolated Kestrel detail study without mutating the promoted ship asset.

The overlay tests meso-scale form language that the station camera exposes:
layered shoulder armor, recessed service plates, fasteners, cooling grilles,
cockpit sills, routed coolant lines, and restrained emissive maintenance rails.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import bpy


def material(name, color, metallic, roughness, emission=None, emission_strength=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if "Coat Weight" in bsdf.inputs:
        bsdf.inputs["Coat Weight"].default_value = 0.12
        bsdf.inputs["Coat Roughness"].default_value = 0.28
    if emission:
        bsdf.inputs["Emission Color"].default_value = (*emission, 1.0)
        bsdf.inputs["Emission Strength"].default_value = emission_strength
    return mat


def finish_mesh(obj, mat, bevel=0.04, segments=2):
    obj.data.materials.append(mat)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel > 0:
        modifier = obj.modifiers.new("Manufactured edge", "BEVEL")
        modifier.width = bevel
        modifier.segments = segments
        modifier.limit_method = "ANGLE"
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    for polygon in obj.data.polygons:
        polygon.use_smooth = False
    obj["sf_detail_level"] = 2
    obj["sf_station_detail_candidate"] = True
    obj.select_set(False)
    return obj


def box(name, location, dimensions, mat, rotation=(0.0, 0.0, 0.0), bevel=0.04):
    bpy.ops.mesh.primitive_cube_add(location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    return finish_mesh(obj, mat, bevel)


def trapezoid(name, location, dimensions, mat, taper=0.12, bevel=0.04):
    length, width, height = dimensions
    half_l, half_w, half_h = length / 2, width / 2, height / 2
    fore = half_w * (1.0 - taper)
    aft = half_w * (1.0 + taper)
    verts = [
        (-half_l, -aft, -half_h), (-half_l, aft, -half_h),
        (half_l, -fore, -half_h), (half_l, fore, -half_h),
        (-half_l, -aft, half_h), (-half_l, aft, half_h),
        (half_l, -fore, half_h), (half_l, fore, half_h),
    ]
    faces = [
        (0, 2, 3, 1), (4, 5, 7, 6), (0, 1, 5, 4),
        (2, 6, 7, 3), (0, 4, 6, 2), (1, 3, 7, 5),
    ]
    mesh = bpy.data.meshes.new(f"{name}_mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = location
    return finish_mesh(obj, mat, bevel)


def bolt(name, location, mat, radius=0.065, depth=0.045):
    bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=radius, depth=depth, location=location)
    obj = bpy.context.object
    obj.name = name
    return finish_mesh(obj, mat, 0.012, 1)


def pipe(name, points, mat, radius=0.07):
    curve = bpy.data.curves.new(f"{name}_curve", "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 2
    curve.bevel_depth = radius
    curve.bevel_resolution = 2
    spline = curve.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for point, coordinates in zip(spline.bezier_points, points):
        point.co = coordinates
        point.handle_left_type = "AUTO"
        point.handle_right_type = "AUTO"
    obj = bpy.data.objects.new(name, curve)
    bpy.context.scene.collection.objects.link(obj)
    obj.data.materials.append(mat)
    obj["sf_detail_level"] = 2
    obj["sf_station_detail_candidate"] = True
    return obj


def add_panel_cluster(index, x, side, y, z, length, width, plate_mat, armor, metal):
    sign = 1 if side > 0 else -1
    box(f"ServiceRecess_{sign}_{index}", (x, side * y, z - 0.035),
        (length + 0.16, width + 0.14, 0.09), armor, bevel=0.06)
    trapezoid(f"ArmorCassette_{sign}_{index}", (x, side * y, z + 0.04),
              (length, width, 0.12), plate_mat, taper=0.1 * sign, bevel=0.055)
    for xi in (-1, 1):
        for yi in (-1, 1):
            bolt(f"CassetteFastener_{sign}_{index}_{xi}_{yi}",
                 (x + xi * (length * 0.38), side * y + yi * (width * 0.36), z + 0.125), metal)


def build(output):
    bpy.ops.wm.read_factory_settings(use_empty=True)

    armor = material("SF_Detail_Armor", (0.035, 0.052, 0.065), 0.66, 0.31)
    armor_warm = material("SF_Detail_WarmArmor", (0.24, 0.22, 0.18), 0.48, 0.44)
    metal = material("SF_Detail_BrushedMetal", (0.22, 0.25, 0.27), 0.9, 0.23)
    repair = material("SF_Detail_RepairGreen", (0.09, 0.25, 0.22), 0.35, 0.39)
    cyan = material("SF_Detail_CyanSignal", (0.025, 0.15, 0.18), 0.24, 0.28,
                    emission=(0.12, 0.88, 1.0), emission_strength=4.2)
    amber = material("SF_Detail_AmberSignal", (0.22, 0.10, 0.025), 0.24, 0.31,
                     emission=(1.0, 0.31, 0.06), emission_strength=3.3)

    # Shoulder cassettes create three readable construction layers: dark recess,
    # removable armor skin, and explicit hardware. Their asymmetry keeps the ship
    # repaired and personal rather than mass-produced or toy-perfect.
    panels = [
        (-6.55, 3.62, 0.90, 1.85, 1.20),
        (-1.30, 4.02, 1.04, 2.45, 1.22),
        (3.20, 3.08, 0.85, 2.05, 1.04),
    ]
    for side in (-1, 1):
        for index, (x, y, z, length, width) in enumerate(panels):
            mat = repair if side < 0 and index == 1 else (armor_warm if index in (0, 2) else armor)
            add_panel_cluster(index, x, side, y, z, length, width, mat, armor, metal)

    # Cooling grilles sit on the wide radiator shoulders. The repeated functional
    # rhythm adds scale without turning the hull into undirected greeble noise.
    for side in (-1, 1):
        y = side * 5.55
        box(f"CoolingGrilleBed_{side}", (-5.25, y, 1.01), (3.15, 1.04, 0.10), armor, bevel=0.05)
        for index in range(7):
            x = -6.45 + index * 0.4
            box(f"CoolingLouver_{side}_{index}", (x, y, 1.12), (0.15, 0.89, 0.12), metal,
                rotation=(0.0, math.radians(-8 * side), 0.0), bevel=0.025)
        box(f"CoolingStatusRail_{side}", (-5.25, y - side * 0.48, 1.17),
            (2.45, 0.055, 0.055), cyan, bevel=0.02)

    # A compact dorsal service spine creates an intermediate scale between the
    # pressure hull and individual screws.
    box("DorsalServiceBed", (-2.0, 0.0, 2.58), (4.35, 1.18, 0.12), armor, bevel=0.06)
    for index in range(4):
        x = -3.35 + index * 0.90
        box(f"DorsalHeatSink_{index}", (x, 0.0, 2.70), (0.52, 0.98, 0.17),
            metal if index % 2 else armor_warm, bevel=0.045)
    box("DorsalSignalBus", (-2.0, -0.49, 2.81), (3.60, 0.055, 0.055), cyan, bevel=0.018)

    # The canopy now meets the hull through a physical sill instead of appearing
    # as one smooth translucent lump laid over another.
    for side in (-1, 1):
        box(f"CanopyLowerSill_{side}", (4.35, side * 1.24, 1.74), (5.45, 0.14, 0.16), metal,
            rotation=(0.0, math.radians(-4), 0.0), bevel=0.04)
        for index, x in enumerate((2.15, 3.55, 4.95, 6.25)):
            box(f"CanopyLatch_{side}_{index}", (x, side * 1.30, 1.88 + (x - 2.15) * 0.04),
                (0.20, 0.18, 0.30), armor, rotation=(0.0, math.radians(-8), 0.0), bevel=0.035)

    # Nose inspection plates and sensors break the broad brow while preserving
    # the Kestrel's long wedge silhouette.
    for side in (-1, 1):
        for index, (x, y, z) in enumerate(((8.45, 0.82, 2.02), (10.55, 0.52, 1.38))):
            trapezoid(f"NoseScale_{side}_{index}", (x, side * y, z),
                      (1.18, 0.60, 0.09), armor if index != 1 else armor_warm, taper=0.18, bevel=0.035)
        box(f"NoseSensorRail_{side}", (9.35, side * 1.03, 1.58), (2.8, 0.06, 0.07), cyan, bevel=0.02)

    # Routed lines and clamps make the aft end read as maintained machinery.
    for side in (-1, 1):
        pipe(f"AftCoolantFeed_{side}", [
            (-7.2, side * 1.78, 1.82), (-8.9, side * 2.02, 2.02),
            (-10.7, side * 1.90, 2.12), (-12.0, side * 1.43, 1.76),
        ], metal, radius=0.075)
        for index, x in enumerate((-8.1, -9.7, -11.1)):
            box(f"AftPipeClamp_{side}_{index}", (x, side * (1.87 + index * -0.03), 2.03),
                (0.18, 0.28, 0.22), amber if index == 1 else armor, bevel=0.035)

    # A few deliberate service lights provide holographic life at the same
    # physical seams the player will eventually select in Shipworks.
    for side in (-1, 1):
        for index, x in enumerate((-4.0, -0.8, 2.2, 5.0)):
            bolt(f"ServiceBeacon_{side}_{index}", (x, side * 2.68, 1.42 - abs(x) * 0.035),
                 amber if index == 0 else cyan, radius=0.085, depth=0.055)

    # Convert curves so the exported candidate is deterministic and inspector-friendly.
    for obj in list(bpy.context.scene.objects):
        if obj.type == "CURVE":
            bpy.context.view_layer.objects.active = obj
            obj.select_set(True)
            bpy.ops.object.convert(target="MESH")
            obj.select_set(False)

    # The study is spatially authored as many pieces, but ships as one draw group
    # per semantic material. All pieces are still unparented here, so joining
    # cannot repeat the parent-space transform bug found in the whole-ship test.
    material_groups = {}
    for obj in list(bpy.context.scene.objects):
        if obj.type != "MESH":
            continue
        key = obj.data.materials[0].name if obj.data.materials else "Unassigned"
        material_groups.setdefault(key, []).append(obj)
    detail_meshes = []
    for material_name, objects in sorted(material_groups.items()):
        bpy.ops.object.select_all(action="DESELECT")
        for obj in objects:
            obj.select_set(True)
        active = objects[0]
        bpy.context.view_layer.objects.active = active
        bpy.ops.object.join()
        active.name = f"StationDetail_{material_name.replace('SF_Detail_', '')}"
        active["sf_detail_level"] = 2
        active["sf_station_detail_candidate"] = True
        active.select_set(False)
        detail_meshes.append(active)

    root = bpy.data.objects.new("KESTREL_STATION_DETAIL_OVERLAY", None)
    bpy.context.scene.collection.objects.link(root)
    root["spacefacePrototype"] = {
        "purpose": "station fidelity study",
        "baseAsset": "wholeships/kestrel.glb",
        "promoted": False,
    }
    for obj in detail_meshes:
        obj.parent = root

    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(
        filepath=str(output), export_format="GLB", use_selection=True,
        export_apply=True, export_yup=True, export_extras=True,
        export_animations=False, export_materials="EXPORT",
        export_texcoords=True, export_normals=True, export_tangents=True,
        export_attributes=True, export_image_format="AUTO",
    )
    triangles = sum(len(obj.data.polygons) for obj in bpy.context.scene.objects if obj.type == "MESH")
    print(f"SF_DETAIL_OVERLAY path={output} objects={len(bpy.context.scene.objects)} polygons={triangles} bytes={output.stat().st_size}")


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    if len(args) != 1:
        raise SystemExit("usage: blender --background --python build_kestrel_detail_overlay.py -- OUTPUT.glb")
    build(Path(args[0]).resolve())
