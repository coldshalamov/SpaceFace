#!/usr/bin/env python3
"""Create an integration candidate for the opening-route Massline jump gate.

This is a non-promoting authoring step. It preserves the current root, sockets, scale,
forward axis and recognizable ring silhouette while replacing the shared station-bank
surface language and adding screen-readable construction detail. The controller owns
copying any accepted output into the canonical asset and running the release build.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector


ROOT = Path(__file__).resolve().parents[2]
ROLE_BY_MATERIAL = {
    "Material_Hull": "gate_painted_armor",
    "Material_Mechanical": "gate_exposed_alloy",
    "Material_Warm": "gate_thermal_ceramic",
    "Material_Accent": "gate_power_bus",
    "Material_Glass": "gate_sensor_glass",
    "Material_Radiator": "gate_radiator",
    "Material_Safety": "gate_safety_surface",
    "Material_Decal": "gate_identity_decal",
}
EMISSIVE_STRENGTH = {"Material_Accent": 2.15, "Material_Glass": 0.38}
NORMAL_STRENGTH = {
    "gate_painted_armor": 0.16,
    "gate_exposed_alloy": 0.18,
    "gate_thermal_ceramic": 0.14,
    "gate_power_bus": 0.11,
    "gate_sensor_glass": 0.07,
    "gate_radiator": 0.16,
    "gate_safety_surface": 0.11,
    "gate_identity_decal": 0.06,
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
    old = bpy.data.materials.get(name)
    if old is not None:
        old.name = f"{name}_SOURCE_ARCHIVE"
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
        principled.inputs["Emission Strength"].default_value = EMISSIVE_STRENGTH.get(name, 0.55)

    if name == "Material_Glass":
        principled.inputs["Coat Weight"].default_value = 0.36
        principled.inputs["Coat Roughness"].default_value = 0.16
        principled.inputs["IOR"].default_value = 1.48
    elif name == "Material_Hull":
        principled.inputs["Coat Weight"].default_value = 0.12
        principled.inputs["Coat Roughness"].default_value = 0.31

    links.new(principled.outputs["BSDF"], output.inputs["Surface"])
    value["spaceface.semantic"] = name
    value["spaceface.textureRole"] = role
    value["spaceface.ormChannels"] = "R=AO,G=Roughness,B=Metallic"
    value["spaceface.normalConvention"] = "OpenGL tangent space"
    return value


def assign_existing_materials(materials) -> None:
    for obj in bpy.data.objects:
        if obj.type != "MESH":
            continue
        if obj.name == "COLLISION_HULL":
            obj.data.materials.clear()
            continue
        role_name = str(obj.get("spaceface.materialRole", ""))
        if role_name not in materials:
            for slot in obj.material_slots:
                current = slot.material.name.replace("_SOURCE_ARCHIVE", "") if slot.material else ""
                if current in materials:
                    role_name = current
                    break
        if role_name not in materials:
            role_name = "Material_Hull"
        obj.data.materials.clear()
        obj.data.materials.append(materials[role_name])
        obj["spaceface.materialRole"] = role_name


def tag(obj, lod: int, material_name: str, structure_role: str, root) -> None:
    obj.parent = root
    obj["spaceface.lodLevel"] = lod
    obj["spaceface.materialRole"] = material_name
    obj["spaceface.structureRole"] = structure_role
    obj["spaceface.chamfered"] = True


def add_box(name, dimensions, location, rotation, mat, lod, structure_role, root, bevel=0.18):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = f"LOD{lod}_GateRemaster_{name}"
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    obj.data.materials.append(mat)
    modifier = obj.modifiers.new("SF_PhysicalEdge", "BEVEL")
    modifier.width = max(0.025, bevel * (1.0 if lod == 0 else 0.68 if lod == 1 else 0.46))
    modifier.segments = 3 if lod == 0 else 2 if lod == 1 else 1
    modifier.limit_method = "ANGLE"
    tag(obj, lod, mat.name, structure_role, root)
    return obj


def add_cylinder(name, radius, depth, location, rotation, mat, lod, structure_role, root, vertices=24):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=max(10, vertices if lod == 0 else vertices // 2),
        radius=radius,
        depth=depth,
        end_fill_type="NGON",
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = f"LOD{lod}_GateRemaster_{name}"
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    obj.data.materials.append(mat)
    modifier = obj.modifiers.new("SF_PhysicalEdge", "BEVEL")
    modifier.width = min(radius, depth) * (0.09 if lod == 0 else 0.055)
    modifier.segments = 3 if lod == 0 else 2 if lod == 1 else 1
    tag(obj, lod, mat.name, structure_role, root)
    return obj


def ring_point(radius: float, angle: float, x: float = 0.0) -> Vector:
    return Vector((x, math.cos(angle) * radius, math.sin(angle) * radius))


def ring_box(name, radius, angle, dimensions, mat, lod, structure_role, root, x=0.0, bevel=0.18):
    return add_box(
        name,
        dimensions,
        ring_point(radius, angle, x),
        (angle - math.pi * 0.5, 0.0, 0.0),
        mat,
        lod,
        structure_role,
        root,
        bevel,
    )


def bolt_at(name, radius, angle, tangent_offset, radial_offset, mat, lod, root):
    tangent = Vector((0.0, -math.sin(angle), math.cos(angle)))
    radial = Vector((0.0, math.cos(angle), math.sin(angle)))
    location = ring_point(radius, angle, 4.15) + tangent * tangent_offset + radial * radial_offset
    return add_cylinder(name, 0.23, 0.34, location, (0.0, math.pi * 0.5, 0.0), mat, lod, "service_fastener", root, 16)


def build_lod(lod: int, mats, root) -> None:
    armor_count = (12, 8, 6)[lod]
    emitter_count = (18, 12, 8)[lod]
    for index in range(armor_count):
        angle = math.tau * index / armor_count + math.radians(7.5)
        ring_box(f"ArmorSector_{index:02d}", 41.0, angle, (7.0, 8.0, 3.5), mats["Material_Hull"], lod,
                 "layered_ring_armor", root, bevel=0.34)
        if lod < 2:
            ring_box(f"ArmorInset_{index:02d}", 41.55, angle, (0.48, 5.3, 1.65), mats["Material_Mechanical"], lod,
                     "service_access_inset", root, x=3.68, bevel=0.10)
        if lod == 0:
            for bolt_index, (tangent, radial) in enumerate(((-2.15, -0.62), (2.15, -0.62), (-2.15, 0.62), (2.15, 0.62))):
                bolt_at(f"ArmorBolt_{index:02d}_{bolt_index}", 41.55, angle, tangent, radial,
                        mats["Material_Exposed"] if "Material_Exposed" in mats else mats["Material_Mechanical"], lod, root)

    for index in range(emitter_count):
        angle = math.tau * index / emitter_count
        ring_box(f"EmitterHousing_{index:02d}", 34.05, angle, (4.9, 3.4, 2.45), mats["Material_Warm"], lod,
                 "thermal_emitter_housing", root, bevel=0.20)
        ring_box(f"EmitterFace_{index:02d}", 33.25, angle, (0.42, 1.72, 0.92), mats["Material_Accent"], lod,
                 "segmented_power_emitter", root, x=2.62, bevel=0.07)

    coupler_angles = (math.radians(42), math.radians(138), math.radians(222), math.radians(318))
    for index, angle in enumerate(coupler_angles[: 4 if lod < 2 else 2]):
        point = ring_point(43.0, angle)
        add_cylinder(f"PowerCoupler_{index}", 2.25, 8.2, point, (0.0, math.pi * 0.5, 0.0),
                     mats["Material_Mechanical"], lod, "power_coupler", root, 30)
        add_cylinder(f"PowerCouplerCeramic_{index}", 1.62, 8.7, point, (0.0, math.pi * 0.5, 0.0),
                     mats["Material_Warm"], lod, "coupler_insulator", root, 26)
        add_cylinder(f"PowerCouplerBus_{index}", 0.88, 9.0, point, (0.0, math.pi * 0.5, 0.0),
                     mats["Material_Accent"], lod, "coupler_power_core", root, 22)

    if lod < 2:
        radiator_angles = (math.radians(64), math.radians(116), math.radians(244), math.radians(296))
        for bank, angle in enumerate(radiator_angles):
            # Cold plates extend radially and are layered along X, making thickness
            # and heat-management intent legible from both default and oblique cameras.
            for plate in range(3 if lod == 0 else 2):
                ring_box(f"Radiator_{bank}_{plate}", 44.7, angle, (0.34, 4.6, 5.5), mats["Material_Radiator"], lod,
                         "radiator_cold_plate", root, x=(plate - 1) * 2.0, bevel=0.075)
            ring_box(f"RadiatorRoot_{bank}", 42.0, angle, (5.5, 2.3, 3.7), mats["Material_Mechanical"], lod,
                     "radiator_root", root, bevel=0.16)

    # The existing control deck remains the macro mass. These overlays make it read
    # as an operated transit facility rather than a plain clamp.
    add_box("ControlAccessLeft", (0.34, 5.7, 5.4), (9.18, -36.9, -5.15), (0, 0, 0),
            mats["Material_Mechanical"], lod, "maintenance_access", root, 0.14)
    add_box("ControlAccessRight", (0.34, 5.7, 5.4), (9.18, -36.9, 5.15), (0, 0, 0),
            mats["Material_Mechanical"], lod, "maintenance_access", root, 0.14)
    for index, z in enumerate((-7.35, 7.35)):
        add_box(f"ControlSafety_{index}", (0.38, 7.1, 1.15), (9.24, -36.9, z), (0, 0, 0),
                mats["Material_Safety"], lod, "maintenance_exclusion", root, 0.07)
    if lod == 0:
        for index, y in enumerate((-39.0, -36.9, -34.8)):
            add_box(f"ControlSensor_{index}", (0.40, 1.2, 2.0), (9.28, y, 0.0), (0, 0, 0),
                    mats["Material_Glass"], lod, "transit_status_sensor", root, 0.055)


def add_identity_text(mats, root) -> None:
    # Local text X maps to world Y, local Y to world Z, and the face normal to +X.
    orientation = Matrix(((0.0, 0.0, 1.0), (1.0, 0.0, 0.0), (0.0, 1.0, 0.0))).to_euler()
    specs = (("GateID", "H-01", 2.55, (9.39, -36.9, 2.15)), ("Maker", "MERIDIAN", 0.92, (9.40, -36.9, -2.1)))
    for name, body, size, location in specs:
        bpy.ops.object.select_all(action="DESELECT")
        curve = bpy.data.curves.new(f"LOD0_{name}_Curve", "FONT")
        curve.body = body
        curve.align_x = "CENTER"
        curve.align_y = "CENTER"
        curve.size = size
        curve.extrude = 0.045
        curve.bevel_depth = 0.018
        curve.bevel_resolution = 2
        obj = bpy.data.objects.new(f"LOD0_GateRemaster_{name}", curve)
        bpy.context.scene.collection.objects.link(obj)
        obj.location = location
        obj.rotation_euler = orientation
        obj.data.materials.append(mats["Material_Decal"])
        tag(obj, 0, "Material_Decal", "manufacturer_identity", root)
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        bpy.ops.object.convert(target="MESH")
        obj = bpy.context.object
        obj.name = f"LOD0_GateRemaster_{name}"
        obj["spaceface.materialRole"] = "Material_Decal"
        obj.select_set(False)


def apply_modifiers_and_uv() -> list[str]:
    failures = []
    for obj in [item for item in bpy.data.objects if item.type == "MESH" and item.name != "COLLISION_HULL"]:
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
            bpy.ops.uv.smart_project(angle_limit=math.radians(55.0), island_margin=0.012)
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
                if obj.type == "MESH" and obj.name != "COLLISION_HULL"
                and (obj.name.startswith(f"LOD{lod}_") or int(obj.get("spaceface.lodLevel", -1)) == lod)
                if obj.data.materials and obj.data.materials[0] == material_value
            ]
            if not matches:
                continue
            if len(matches) == 1:
                joined = matches[0]
            else:
                bpy.ops.object.select_all(action="DESELECT")
                for obj in matches:
                    obj.select_set(True)
                bpy.context.view_layer.objects.active = matches[0]
                bpy.ops.object.join()
                joined = bpy.context.object
            joined.name = f"LOD{lod}_Gate_{material_name}"
            joined.parent = root
            joined["spaceface.lodLevel"] = lod
            joined["spaceface.materialRole"] = material_name
            joined["spaceface.structureRole"] = "merged_functional_draw_group"
            joined["spaceface.chamfered"] = True
            bpy.context.view_layer.objects.active = joined
            joined.select_set(True)
            triangulate = joined.modifiers.new("SF_ExportTriangulate", "TRIANGULATE")
            triangulate.keep_custom_normals = True
            bpy.ops.object.modifier_apply(modifier=triangulate.name)
            joined.select_set(False)


def validate_tangents() -> list[dict]:
    results = []
    for obj in sorted((item for item in bpy.data.objects if item.type == "MESH" and item.name != "COLLISION_HULL"), key=lambda item: item.name):
        mesh = obj.data
        mesh.calc_loop_triangles()
        error = None
        valid = False
        if mesh.uv_layers:
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


def triangle_count(obj) -> int:
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


def family_kit(report_path: Path, maps_manifest: Path) -> Path:
    output = report_path.with_name("opening-infrastructure-family-kit.json")
    value = {
        "schema": "spaceface.openingInfrastructureFamilyKit.v1",
        "status": "candidate-not-promoted",
        "surfaceManifest": str(maps_manifest.resolve()),
        "sharedConstructionLanguage": {
            "manufacturer": "Meridian Transit Works",
            "loadPath": "dark exposed-alloy spine with coated removable armor",
            "poweredSystem": "segmented blue-white bus behind thermal-ceramic housings",
            "maintenance": "amber exclusion surfaces only at physical access/contact zones",
            "identity": "bone-white condensed gate ID plus MERIDIAN maker mark",
            "fasteners": "four-point captive bolt logic on major removable armor",
            "heatManagement": "layered cold plates attached to explicit coupler roots",
        },
        "assetRecipes": {
            "place_gate_jump_ring": {
                "candidateState": "implemented",
                "macro": "preserve traversable 76 m aperture and three-anchor control silhouette",
                "meso": ["armored service sectors", "segmented emitter housings", "power couplers", "radiator banks", "operated control deck"],
                "micro": ["material-scale orange peel", "brushed alloy", "thermal banding", "captive fasteners", "manufacturer lettering"],
            },
            "place_lane_beacon": {
                "candidateState": "recipe-only",
                "macro": "retain tall lane-readable mast; add a bifurcated structural foot and replaceable top signal cartridge",
                "meso": ["inspection hatch ladder", "paired power trunk", "cold plate under signal head", "range-number placard"],
                "materialPriority": ["gate_painted_armor", "gate_exposed_alloy", "gate_power_bus", "gate_safety_surface"],
            },
            "place_nav_buoy": {
                "candidateState": "recipe-only",
                "macro": "retain compact barrel/collar silhouette; add armored float body and offset service/sensor crown",
                "meso": ["replaceable battery cassette", "three directional sensor facets", "micrometeoroid bumper", "tow/contact clevis"],
                "materialPriority": ["gate_painted_armor", "gate_sensor_glass", "gate_exposed_alloy", "gate_identity_decal"],
            },
            "place_station_billboard": {
                "candidateState": "recipe-only",
                "macro": "retain lane-facing sign silhouette; replace luminous slab read with framed serviceable modules",
                "meso": ["rear cable raceway", "thermal backing plate", "maintenance hinge", "physical sign segments"],
                "materialPriority": ["gate_exposed_alloy", "gate_radiator", "gate_power_bus", "gate_identity_decal"],
            },
        },
        "nonGoals": ["uniform recolors", "screen-space bloom", "procedural grime as construction detail", "transparent fullscreen elements"],
    }
    output.write_text(json.dumps(value, indent=2), encoding="utf-8")
    return output


def main() -> None:
    args = cli()
    args.output_blend = args.output_blend.resolve()
    args.output_glb = args.output_glb.resolve()
    args.report = args.report.resolve()
    args.maps_root = args.maps_root.resolve()
    maps_manifest = args.maps_root / "surface-map-build.json"
    source_path = Path(bpy.data.filepath).resolve()
    root = bpy.data.objects.get("SF_PLACE_GATE_JUMP_RING_ROOT")
    if root is None:
        raise RuntimeError("Expected SF_PLACE_GATE_JUMP_RING_ROOT")

    mats = {name: material(name, role, args.maps_root) for name, role in ROLE_BY_MATERIAL.items()}
    # Alias used only by the bolt helper, without adding another draw group.
    mats["Material_Exposed"] = mats["Material_Mechanical"]
    assign_existing_materials(mats)
    for lod in range(3):
        build_lod(lod, mats, root)
    add_identity_text(mats, root)
    modifier_failures = apply_modifiers_and_uv()
    mats.pop("Material_Exposed", None)
    join_draw_groups(mats, root)

    # Remove unused archived data before packing the candidate.
    for old in list(bpy.data.materials):
        if old.users == 0:
            bpy.data.materials.remove(old)
    for image in list(bpy.data.images):
        if image.users == 0:
            bpy.data.images.remove(image)

    tangent_results = validate_tangents()
    tangent_failures = [item for item in tangent_results if not item["valid"]]
    if tangent_failures:
        raise RuntimeError(f"Tangent validation failed: {tangent_failures[:4]}")
    scale_failures = [obj.name for obj in bpy.data.objects if obj.type == "MESH" and any(abs(float(v) - 1.0) > 1e-5 for v in obj.scale)]
    if scale_failures:
        raise RuntimeError(f"Unapplied scale: {scale_failures[:8]}")

    lod_meshes = {
        lod: sorted([obj for obj in bpy.data.objects if obj.type == "MESH" and obj.name.startswith(f"LOD{lod}_Gate_")], key=lambda item: item.name)
        for lod in range(3)
    }
    lod_stats = {
        f"lod{lod}": {"triangles": sum(triangle_count(obj) for obj in meshes), "drawGroups": len(meshes), "objects": [obj.name for obj in meshes]}
        for lod, meshes in lod_meshes.items()
    }
    root["spaceface.family"] = "meridian_opening_infrastructure_v1"
    root["spaceface.surfaceRevision"] = "opening_gate_v1"
    root["spaceface.manufacturer"] = "Meridian Transit Works"
    root["spacefaceAssetJson"] = json.dumps({
        "contractVersion": 1,
        "assetId": "SF_PLACE_GATE_JUMP_RING",
        "partId": "place_gate_jump_ring",
        "liveId": "place_gate_jump_ring",
        "slot": "place",
        "forward": "+X",
        "up": "+Y",
        "starboard": "+Z",
        "unit": "metre",
        "normalConvention": "OpenGL",
        "ormChannels": "R=AO,G=Roughness,B=Metallic",
        "textureCompression": "PNG-source/KTX2-release-candidate",
        "textureSize": 1024,
        "family": "meridian_opening_infrastructure_v1",
        "manufacturer": "Meridian Transit Works",
        "role": "jump_gate_landmark",
        "title": "Helios Massline Gate H-01",
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
    kit_path = family_kit(args.report, maps_manifest)

    report = {
        "schema": "spaceface.openingGateRemaster.v1",
        "status": "candidate-not-promoted",
        "source": {"path": str(source_path), "sha256": sha256(source_path)},
        "surfaceManifest": {"path": str(maps_manifest), "sha256": sha256(maps_manifest)},
        "outputs": {
            "blend": {"path": str(args.output_blend), "sha256": sha256(args.output_blend)},
            "glb": {"path": str(args.output_glb), "sha256": sha256(args.output_glb)},
            "familyKit": {"path": str(kit_path), "sha256": sha256(kit_path)},
        },
        "materials": [{"name": name, "textureRole": role} for name, role in ROLE_BY_MATERIAL.items()],
        "lod": lod_stats,
        "bounds": bounds(lod_meshes[0]),
        "sockets": [name for name in ("SOCKET_Structure_Core", "SOCKET_Emissive", "SOCKET_Gate_Aperture") if bpy.data.objects.get(name)],
        "modifierOrUvFailures": modifier_failures,
        "tangents": tangent_results,
        "knownDefects": [
            "Candidate has not been promoted or inspected on the live player route.",
            "KTX2 loader binding and release meshopt optimization remain controller-owned integration work.",
            "Lane beacon, nav buoy and billboard currently have recipes only; their geometry has not been remastered in this candidate.",
            "Runtime LOD transition behavior must be checked after promotion because this candidate intentionally increases LOD0/LOD1 construction density.",
        ],
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({"ok": True, "blend": str(args.output_blend), "glb": str(args.output_glb), "report": str(args.report), "lod": lod_stats}))


if __name__ == "__main__":
    main()
