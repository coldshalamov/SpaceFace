"""Build the isolated SF-K0 Borrowed Time V4 directly from the user's Revamp blend.

The script intentionally does not import or reference the V2/V3 candidates.  It opens the
packed source blend from SpaceFace_SF-K0_Borrowed-Time_Revamp.zip, performs the narrow cleanup
recorded in BOUNDARY.json, saves a packed production blend, and exports three source GLBs.

Run with Blender 5.1+:
  blender --background --python build_v4.py -- --source-zip <Revamp.zip>
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
import tempfile
import zipfile
from pathlib import Path

import bpy
import bmesh
from mathutils import Matrix, Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from golden_asset_v5 import GOLDEN_PASS_ID, apply_golden_asset_v5
from material_truth_v6 import PASS_ID as MATERIAL_TRUTH_PASS_ID, apply_material_truth_v6
from surface_maps_v2 import REMASTER_ID as SURFACE_REMASTER_ID, apply_to_blender_images


FAMILY = Path(__file__).resolve().parents[1]
DEFAULT_ZIP = Path(r"C:\Users\93rob\Downloads\SpaceFace_SF-K0_Borrowed-Time_Revamp.zip")
SOURCE_ENTRY = "SpaceFace_SF-K0_Borrowed-Time_Revamp/SF_K0_Borrowed_Time_Revamp.blend"
EXPECTED_ZIP_SHA256 = "5457DACD44B63CF170ECF65DB253BB607D7615B8DDBD3CF97666D155BA355000"
EXPECTED_BLEND_SHA256 = "C48BCD2CD7AA9B8DAF4AC253221ED259DB781A1BF0602EDB7286D916191D6502"
PACKET = "SF-K0-BORROWED-TIME-V4-SOURCE-REMASTER-001"
REQUIRED_SOCKETS = (
    "SOCKET_Weapon_Front", "SOCKET_Mining_Front", "SOCKET_Engine_Main",
    "SOCKET_Trail_Main", "SOCKET_Utility_Dorsal", "SOCKET_Cargo_Ventral",
    "SOCKET_Camera_Focus", "SOCKET_RCS_Port", "SOCKET_RCS_Starboard",
)
SOCKET_CONTRACT = {
    "SOCKET_Weapon_Front": ((12.62, 1.43, 0.0), "weapon_muzzle", (1.0, 0.0, 0.0)),
    "SOCKET_Mining_Front": ((12.26, -1.08, 0.0), "mining_emitter", (1.0, 0.0, 0.0)),
    "SOCKET_Engine_Main": ((-13.85, 0.0, 0.0), "engine_exhaust", (-1.0, 0.0, 0.0)),
    "SOCKET_Trail_Main": ((-14.05, 0.0, 0.0), "engine_trail", (-1.0, 0.0, 0.0)),
    "SOCKET_Utility_Dorsal": ((-1.45, 1.95, -3.8), "utility_dorsal", (0.0, 1.0, 0.0)),
    "SOCKET_Cargo_Ventral": ((-0.8, -2.1, 0.0), "cargo_ventral", (0.0, -1.0, 0.0)),
    "SOCKET_Camera_Focus": ((0.0, 0.35, 0.0), "camera_focus", (1.0, 0.0, 0.0)),
    "SOCKET_RCS_Port": ((1.6, 0.45, -6.6), "rcs_port", (0.0, 0.0, -1.0)),
    "SOCKET_RCS_Starboard": ((1.6, 0.45, 6.6), "rcs_starboard", (0.0, 0.0, 1.0)),
}
RIG_NAMES = ("RIG_EngineFan", "RIG_PulseGun_Yaw", "RIG_PulseGun_Recoil", "RIG_MiningEmitter")
DELETE_EXACT_PREFIXES = (
    "Engine_Plume_", "GrabRail_", "Radiator_Lip_", "EngineRingBolt_", "HullBolt_",
    "Rivet_", "Studio_", "CAM_",
)
DELETE_EXACT_NAMES = {"_RivetSource", "Key_Area", "Fill_Area", "Rim_Area", "Nose_Kicker"}
DEEMISSIVE_OBJECTS = {
    "Pulse_MuzzleGlow_-1": "Material_Accent_FrontierCyan",
    "Pulse_MuzzleGlow_1": "Material_Accent_FrontierCyan",
    "Practical_Utility_-1": "Material_Accent_WarningOrange",
    "Practical_Utility_1": "Material_Accent_WarningOrange",
}
MATERIAL_REPAIRS = {
    "Engine_Coolant_Main_-1": ("Material_BrushedMetal", "visible engine coolant pipe"),
    "Engine_Coolant_Return_-1": ("Material_BrushedMetal", "visible engine coolant pipe"),
    "Engine_Coolant_Main_1": ("Material_BrushedMetal", "visible engine coolant pipe"),
    "Engine_Coolant_Return_1": ("Material_BrushedMetal", "visible engine coolant pipe"),
    "Pulse_Cable_Port": ("Material_Rubber", "visible pulse-gun cable"),
    "Pulse_Cable_Stbd": ("Material_Rubber", "visible pulse-gun cable"),
    "FieldRepair_WeldSeam": ("Material_BrushedMetal", "visible field-repair weld seam"),
}
V6_LOD_MATERIAL_COLLAPSE = {
    "Material_V6_DriveAlloy": "Material_BrushedMetal",
    "Material_V6_ServiceSteel": "Material_BrushedMetal",
    "Material_V6_CeramicIsolator": "Material_EngineCeramic",
    "Material_V6_RefractoryVane": "Material_EngineCeramic",
    "Material_V6_RadiatorSheet": "Material_Radiator",
    "Material_V6_SensorCoat": "Material_ArmorDark",
    "Material_V6_CableJacket": "Material_Rubber",
    "Material_V6_FormedArmor": "Material_ArmorDark",
    "Material_V6_RepairPrimer": "Material_RepairGreen",
    "Material_V6_HazardPaint": "Material_Accent_WarningOrange",
    "Material_V6_SensorLens": "Material_Emissive_Cyan",
    "Material_V6_DarkOpticalAperture": "Material_ArmorDark",
    "Material_V6_DriveHotCore": "Material_Emissive_DriveCore",
}
DECAL_PBR_PROFILES = {
    "Material_Decal_Hazard": "warning_orange",
    "Material_Decal_Stencils": "hull",
}
LOD2_SILHOUETTE_NAMES = {
    "UtilityPod_Starboard", "UtilityPod_HazardBand", "Antenna_Mast", "Antenna_Loop",
}
LOD2_SILHOUETTE_PREFIXES = (
    "RCS_Nozzle_", "Landing_Skid_", "Landing_Strut_", "NavLight_Wingtip_",
)


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-zip", type=Path, default=DEFAULT_ZIP)
    return parser.parse_args(argv)


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest().upper()


def extract_source(source_zip: Path) -> tuple[Path, str, str]:
    zip_hash = sha256(source_zip)
    if zip_hash != EXPECTED_ZIP_SHA256:
        raise RuntimeError(f"source ZIP hash mismatch: {zip_hash}")
    target = Path(tempfile.gettempdir()) / "spaceface_kestrel_v4_build_source.blend"
    with zipfile.ZipFile(source_zip) as archive:
        payload = archive.read(SOURCE_ENTRY)
    blend_hash = hashlib.sha256(payload).hexdigest().upper()
    if blend_hash != EXPECTED_BLEND_SHA256:
        raise RuntimeError(f"source blend hash mismatch: {blend_hash}")
    target.write_bytes(payload)
    return target, zip_hash, blend_hash


def delete_object(obj: bpy.types.Object) -> None:
    obj_type = obj.type
    data = obj.data
    bpy.data.objects.remove(obj, do_unlink=True)
    if data and getattr(data, "users", 1) == 0:
        bucket = {
            "MESH": bpy.data.meshes, "CAMERA": bpy.data.cameras, "LIGHT": bpy.data.lights,
            "CURVE": bpy.data.curves,
        }.get(obj_type)
        if bucket:
            bucket.remove(data)


def should_delete(obj: bpy.types.Object) -> bool:
    name = obj.name
    if name in DELETE_EXACT_NAMES or any(name.startswith(prefix) for prefix in DELETE_EXACT_PREFIXES):
        return True
    if obj.get("sf_helper") or obj.hide_render:
        return True
    if obj.type in {"CAMERA", "LIGHT"}:
        return True
    if obj.get("sf_component") == "studio":
        return True
    # Subpixel geometry is already represented in the source PBR maps.  Preserve meaningful
    # hardware such as RCS and antennae; remove only named bolt/rivet families and tiny helpers.
    return False


def set_single_material(obj: bpy.types.Object, material_name: str) -> None:
    material = bpy.data.materials.get(material_name)
    if not material:
        raise RuntimeError(f"missing material {material_name}")
    obj.data.materials.clear()
    obj.data.materials.append(material)
    for polygon in obj.data.polygons:
        polygon.material_index = 0


def enforce_socket_contract() -> list[dict]:
    report = []
    for name, (position, role, forward) in SOCKET_CONTRACT.items():
        obj = bpy.data.objects.get(name)
        if obj is None:
            raise RuntimeError(f"missing required socket {name}")
        # Blender exports +X/+Y/+Z as glTF +X/-Z/+Y. Store the inverse transform here so the
        # exported node translation matches the canonical glTF socket contract above.
        obj.location = (position[0], -position[2], position[1])
        obj["socket"] = True
        obj["spaceface"] = {"socket": True, "role": role, "forward": list(forward)}
        report.append({"name": name, "position": list(position), "role": role, "forward": list(forward)})
    return report


def lift_dark_texture(image_name: str, floor: float, warm: tuple[float, float, float]) -> None:
    image = bpy.data.images.get(image_name)
    if not image or image.size[0] == 0:
        raise RuntimeError(f"missing packed texture {image_name}")
    try:
        import numpy as np
        pixels = np.empty(len(image.pixels), dtype=np.float32)
        image.pixels.foreach_get(pixels)
        rgba = pixels.reshape((-1, 4))
        rgb = rgba[:, :3]
        rgb[:] = np.maximum(rgb, np.asarray(warm, dtype=np.float32) * floor)
        rgb[:] = np.clip(rgb * 0.94 + np.asarray(warm, dtype=np.float32) * 0.035, 0.0, 0.92)
        image.pixels.foreach_set(pixels)
    except ImportError:
        pixels = list(image.pixels)
        for i in range(0, len(pixels), 4):
            for channel in range(3):
                pixels[i + channel] = min(0.92, max(pixels[i + channel], warm[channel] * floor) * 0.94 + warm[channel] * 0.035)
        image.pixels[:] = pixels
    image.update()
    if image.packed_file:
        image.pack()


def clean_source() -> tuple[
    bpy.types.Collection,
    list[str],
    list[dict],
    list[dict],
    dict,
    dict,
    dict,
    list[dict],
]:
    source = bpy.data.collections.get("SOURCE_HERO_LOD0")
    if source is None:
        raise RuntimeError("SOURCE_HERO_LOD0 missing")
    removed = []
    for obj in list(bpy.data.objects):
        if should_delete(obj):
            removed.append(obj.name)
            delete_object(obj)
    source.name = "KESTREL_V4_PRODUCTION_SOURCE"
    for name, material in DEEMISSIVE_OBJECTS.items():
        obj = bpy.data.objects.get(name)
        if obj and obj.type == "MESH":
            set_single_material(obj, material)
    material_repairs = []
    for name, (material, reason) in MATERIAL_REPAIRS.items():
        obj = bpy.data.objects.get(name)
        if not obj or obj.type != "MESH":
            raise RuntimeError(f"missing material-repair source mesh {name}")
        prior = [slot.name for slot in obj.data.materials]
        if prior:
            raise RuntimeError(f"material-repair source mesh unexpectedly assigned {name}: {prior}")
        set_single_material(obj, material)
        material_repairs.append({
            "object": name, "from": "unassigned", "to": material, "reason": reason,
            "action": "assigned existing V4 material; visible source geometry preserved",
        })
    lift_dark_texture("armor_dark_basecolor.png", 0.105, (0.92, 0.82, 0.70))
    lift_dark_texture("hull_basecolor.png", 0.075, (0.92, 0.84, 0.72))
    surface_remaster = apply_to_blender_images(bpy)
    ensure_decal_pbr_roles()
    golden_asset = apply_golden_asset_v5()
    # V6 adds visible authored hardware outside the accepted V5 presentation
    # envelope. Collision remains the exact pre-V6 gameplay contract; visual
    # bounds are reported separately after the material-truth pass.
    canonical_collision_bounds = visible_bounds(source)
    material_truth = apply_material_truth_v6()
    socket_contract = enforce_socket_contract()
    for material_name in ("Material_Plume_HotCore", "Material_Plume_Inner", "Material_Plume_Outer", "Material_StudioFloor", "Material_StudioPad", "Material_Clay"):
        material = bpy.data.materials.get(material_name)
        if material and material.users == 0:
            bpy.data.materials.remove(material)
    root = bpy.data.objects.get("SF_K0_BORROWED_TIME_ROOT")
    if root is None:
        raise RuntimeError("source root missing")
    root["spacefaceAsset"] = {
        "assetId": "SF_K0_KESTREL_BORROWED_TIME_V4", "partId": "kestrel_borrowed_time_v4",
        "packet": PACKET, "slot": "hull", "category": "wholeships", "forward": "+X",
        "up": "+Y", "starboard": "+Z", "unit": "metre", "normalConvention": "OpenGL",
        "ormChannels": "R=AO,G=Roughness,B=Metallic",
        "sourceGeometryPreservation": (
            "canonical silhouette and contract nodes preserved; named hero modules authoritatively rebuilt"
        ),
        "surfaceRemasterId": SURFACE_REMASTER_ID, "goldenPassId": GOLDEN_PASS_ID,
        "materialTruthPassId": MATERIAL_TRUTH_PASS_ID,
        "wiringStatus": "isolated_candidate_no_promote", "embeddedPlume": False,
    }
    source_objects = set(source.all_objects)
    for obj in list(bpy.data.objects):
        if obj not in source_objects and obj is not root and obj.type not in {"EMPTY", "MESH"}:
            delete_object(obj)
    return (
        source,
        sorted(removed),
        material_repairs,
        surface_remaster,
        golden_asset,
        canonical_collision_bounds,
        material_truth,
        socket_contract,
    )


def ensure_decal_pbr_roles() -> list[dict]:
    """Keep authored decal color/alpha while binding honest normal, ORM, and AO roles."""
    template_material = bpy.data.materials.get("Material_Hull")
    template_group = None
    if template_material and template_material.use_nodes:
        template_group = next(
            (
                node.node_tree for node in template_material.node_tree.nodes
                if node.bl_idname == "ShaderNodeGroup" and node.name == "glTF Material Output"
            ),
            None,
        )
    if template_group is None:
        raise RuntimeError("glTF Material Output node group missing for decal PBR repair")

    report = []
    for material_name, surface_role in DECAL_PBR_PROFILES.items():
        material = bpy.data.materials.get(material_name)
        if material is None or not material.use_nodes:
            raise RuntimeError(f"missing authored decal material {material_name}")
        nodes = material.node_tree.nodes
        links = material.node_tree.links
        bsdf = next((node for node in nodes if node.bl_idname == "ShaderNodeBsdfPrincipled"), None)
        output = next((node for node in nodes if node.bl_idname == "ShaderNodeOutputMaterial"), None)
        base_image_name = (
            "decal_hazard_stripes.png"
            if material_name == "Material_Decal_Hazard"
            else "decal_stencils.png"
        )
        base = next(
            (
                node for node in nodes
                if node.bl_idname == "ShaderNodeTexImage"
                and node.image
                and node.image.name == base_image_name
            ),
            None,
        )
        if not bsdf or not output or not base:
            raise RuntimeError(f"{material_name} is missing its authored color/alpha graph")

        for link in list(links):
            links.remove(link)
        for node in list(nodes):
            if node not in (bsdf, output, base):
                nodes.remove(node)

        orm_image = bpy.data.images.get(f"{surface_role}_orm.png")
        normal_image = bpy.data.images.get(f"{surface_role}_normal.png")
        if not orm_image or not normal_image:
            raise RuntimeError(f"{material_name} missing {surface_role} ORM/normal images")
        orm_image.colorspace_settings.name = "Non-Color"
        normal_image.colorspace_settings.name = "Non-Color"
        base.image.colorspace_settings.name = "sRGB"

        orm = nodes.new("ShaderNodeTexImage")
        orm.name = f"{surface_role}_ORM"
        orm.label = "R=AO G=Roughness B=Metallic"
        orm.image = orm_image
        separate = nodes.new("ShaderNodeSeparateColor")
        normal_tex = nodes.new("ShaderNodeTexImage")
        normal_tex.name = f"{surface_role}_Normal_OpenGL"
        normal_tex.image = normal_image
        normal = nodes.new("ShaderNodeNormalMap")
        gltf_output = nodes.new("ShaderNodeGroup")
        gltf_output.name = "glTF Material Output"
        gltf_output.node_tree = template_group

        links.new(base.outputs["Color"], bsdf.inputs["Base Color"])
        links.new(base.outputs["Alpha"], bsdf.inputs["Alpha"])
        links.new(orm.outputs["Color"], separate.inputs["Color"])
        links.new(separate.outputs["Green"], bsdf.inputs["Roughness"])
        links.new(separate.outputs["Blue"], bsdf.inputs["Metallic"])
        links.new(normal_tex.outputs["Color"], normal.inputs["Color"])
        links.new(normal.outputs["Normal"], bsdf.inputs["Normal"])
        links.new(separate.outputs["Red"], gltf_output.inputs["Occlusion"])
        links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])
        bsdf.inputs["Emission Strength"].default_value = 0.0
        material["spacefaceSurfaceRole"] = surface_role
        material["spacefaceDecalPbrRepair"] = "kestrel-material-truth-v6"
        report.append({
            "material": material_name,
            "baseColorAlpha": base_image_name,
            "normal": normal_image.name,
            "orm": orm_image.name,
            "surfaceRole": surface_role,
            "emissive": False,
        })
    return report


def visible_bounds(source: bpy.types.Collection) -> dict:
    mins = Vector((math.inf, math.inf, math.inf)); maxs = Vector((-math.inf, -math.inf, -math.inf))
    count = 0
    for obj in source.all_objects:
        if obj.type != "MESH" or should_delete(obj):
            continue
        for corner in obj.bound_box:
            world = obj.matrix_world @ Vector(corner)
            for axis in range(3):
                mins[axis] = min(mins[axis], world[axis]); maxs[axis] = max(maxs[axis], world[axis])
            count += 1
    if not count:
        raise RuntimeError("no visible bounds")
    return {
        "min": [round(float(v), 6) for v in mins], "max": [round(float(v), 6) for v in maxs],
        "dimensions": [round(float(maxs[i] - mins[i]), 6) for i in range(3)],
        "center": [round(float((maxs[i] + mins[i]) * 0.5), 6) for i in range(3)],
    }


def set_production_collection_visibility(source: bpy.types.Collection) -> None:
    visible = {"RIG_AND_SOCKETS"}
    pending = [source]
    while pending:
        collection = pending.pop()
        if collection.name in visible:
            continue
        visible.add(collection.name)
        pending.extend(collection.children)
    for collection in bpy.data.collections:
        collection.hide_render = collection.name not in visible
    hidden_descendants = [
        collection.name
        for collection in source.children_recursive
        if collection.hide_render
    ]
    if hidden_descendants:
        raise RuntimeError(f"production blend hides source descendants: {hidden_descendants}")


def save_production_blend(source: bpy.types.Collection) -> Path:
    set_production_collection_visibility(source)
    for image in bpy.data.images:
        if image.source == "FILE" and image.size[0] > 0 and not image.packed_file:
            image.pack()
    target = FAMILY / "blender" / "kestrel_borrowed_time_v4_production.blend"
    target.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(target), compress=True)
    if target.stat().st_size >= 100 * 1024 * 1024:
        raise RuntimeError("packed blend exceeds 100 MiB")
    return target


def evaluated_duplicate(obj: bpy.types.Object, collection: bpy.types.Collection, name: str, material_override: str | None = None) -> bpy.types.Object:
    deps = bpy.context.evaluated_depsgraph_get()
    evaluated = obj.evaluated_get(deps)
    mesh = bpy.data.meshes.new_from_object(evaluated, preserve_all_data_layers=True, depsgraph=deps)
    mesh.transform(obj.matrix_world)
    duplicate = bpy.data.objects.new(name, mesh)
    collection.objects.link(duplicate)
    duplicate.matrix_world = Matrix.Identity(4)
    material = bpy.data.materials.get(material_override) if material_override else (obj.data.materials[0] if obj.data.materials else None)
    duplicate.data.materials.clear()
    if material:
        duplicate.data.materials.append(material)
    for polygon in duplicate.data.polygons:
        polygon.material_index = 0
    for key, value in obj.items():
        try:
            duplicate[key] = value
        except Exception:
            pass
    return duplicate


def join_group(objects: list[bpy.types.Object], name: str) -> bpy.types.Object | None:
    if not objects:
        return None
    if len(objects) == 1:
        objects[0].name = name
        return objects[0]
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    active = objects[0]
    bpy.context.view_layer.objects.active = active
    bpy.ops.object.join()
    active.name = name
    bpy.ops.object.select_all(action="DESELECT")
    return active


def repair_tangent_space(obj: bpy.types.Object) -> dict:
    """Repair only triangles whose exported MikkTSpace tangent is invalid.

    The donor contains a few collapsed UV triangles. Re-unwrapping an entire
    semantic material group would destroy authored texture placement, so the
    repair uses a stable local planar projection only on the affected faces.
    """
    mesh = obj.data
    had_custom_normals = bool(getattr(mesh, "has_custom_normals", False))
    if had_custom_normals:
        # Joining and decimating authored donors can retain a split-normal
        # record that no longer matches the evaluated topology. Clear it only
        # on the disposable export duplicate; Blender then recomputes normals
        # from the preserved smooth/flat face flags.
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        result = bpy.ops.mesh.customdata_custom_splitnormals_clear()
        obj.select_set(False)
        if "FINISHED" not in result or mesh.has_custom_normals:
            raise RuntimeError(f"{obj.name} could not clear stale export custom normals")
    uv_layer = mesh.uv_layers.active
    if uv_layer is None:
        return {
            "object": obj.name,
            "removedDegenerateTriangles": 0,
            "patchedTriangles": 0,
            "badBefore": 0,
            "badAfter": 0,
            "customNormalsCleared": had_custom_normals,
        }

    # A few donor faces contain numerically collapsed edges after LOD
    # evaluation. Remove only sub-micrometre degeneracy, then triangulate the
    # surviving surface before evaluating tangent space.
    before_polygons = len(mesh.polygons)
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.dissolve_degenerate(bm, dist=1e-7, edges=list(bm.edges))
    bmesh.ops.triangulate(bm, faces=list(bm.faces), quad_method="BEAUTY", ngon_method="BEAUTY")
    microscopic_faces = [face for face in bm.faces if face.calc_area() < 1e-8]
    if microscopic_faces:
        # Evaluated bevel/decimate stacks can leave sub-square-micrometre
        # sliver triangles whose vertices are numerically coincident. They
        # carry no visible area and cannot define tangent space.
        bmesh.ops.delete(bm, geom=microscopic_faces, context="FACES")
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    removed_degenerate = max(0, before_polygons - len(mesh.polygons))
    uv_layer = mesh.uv_layers.active
    def collapsed_uv_polygons() -> list[bpy.types.MeshPolygon]:
        collapsed = []
        for polygon in mesh.polygons:
            if len(polygon.loop_indices) != 3:
                raise RuntimeError(
                    f"{obj.name} retains non-triangle face {polygon.index} during UV validation"
                )
            a, b, c = (
                Vector(uv_layer.data[index].uv)
                for index in polygon.loop_indices
            )
            uv_area = abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) * 0.5
            # Use a four-order safety margin before float32 glTF serialization
            # and the shared 13-bit Meshopt profile; the external source/release
            # contract remains 1e-10 square UV units.
            if uv_area <= 1e-6:
                collapsed.append(polygon)
        return collapsed

    mesh.calc_tangents(uvmap=uv_layer.name)
    tangent_bad_loops = {
        index for index, loop in enumerate(mesh.loops)
        if Vector(loop.tangent).length_squared < 0.25
    }
    mesh.free_tangents()
    collapsed_before = collapsed_uv_polygons()
    bad_loops = set(tangent_bad_loops)
    for polygon in collapsed_before:
        bad_loops.update(polygon.loop_indices)
    if not bad_loops:
        return {
            "object": obj.name,
            "removedDegenerateTriangles": removed_degenerate,
            "patchedTriangles": 0,
            "collapsedUvTriangles": 0,
            "badBefore": 0,
            "badAfter": 0,
            "customNormalsCleared": had_custom_normals,
        }

    patched = 0
    for polygon in mesh.polygons:
        if not bad_loops.intersection(polygon.loop_indices):
            continue
        normal = polygon.normal
        axis = max(range(3), key=lambda item: abs(normal[item]))
        projection_axes = ((1, 2), (0, 2), (0, 1))[axis]
        # Object-space metres keep surface frequency consistent across the
        # repaired triangles; the deterministic cell offset avoids stacking
        # all repairs on the same texture texels.
        offset_u = (polygon.index % 7) * 0.137
        offset_v = ((polygon.index // 7) % 7) * 0.137
        for loop_index in polygon.loop_indices:
            coordinate = mesh.vertices[mesh.loops[loop_index].vertex_index].co
            uv_layer.data[loop_index].uv = (
                coordinate[projection_axes[0]] * 0.18 + offset_u,
                coordinate[projection_axes[1]] * 0.18 + offset_v,
            )
        patched += 1
    mesh.update()
    mesh.calc_tangents(uvmap=uv_layer.name)
    bad_after_loops = {
        index for index, loop in enumerate(mesh.loops)
        if Vector(loop.tangent).length_squared < 0.25
    }
    mesh.free_tangents()
    for polygon in collapsed_uv_polygons():
        bad_after_loops.update(polygon.loop_indices)
    canonical_uv_triangles = 0
    custom_normal_loop_repairs = 0
    if bad_after_loops:
        # A joined group can retain a single invalid corner when a source face
        # has usable geometry but numerically collapsed UVs after evaluation.
        # Give only that triangle an explicit, non-degenerate UV basis.  This
        # preserves all neighbouring authored UV placement and keeps tangent
        # space available for the material's real normal map.
        canonical_uv = ((0.0, 0.0), (0.125, 0.0), (0.0, 0.125))
        for polygon in mesh.polygons:
            if not bad_after_loops.intersection(polygon.loop_indices):
                continue
            if len(polygon.loop_indices) != 3:
                raise RuntimeError(
                    f"{obj.name} retains invalid tangent space on non-triangle face {polygon.index}"
                )
            offset_u = (polygon.index % 7) * 0.137
            offset_v = ((polygon.index // 7) % 7) * 0.137
            for corner, loop_index in enumerate(polygon.loop_indices):
                uv = canonical_uv[corner]
                uv_layer.data[loop_index].uv = (uv[0] + offset_u, uv[1] + offset_v)
            canonical_uv_triangles += 1
        mesh.update()
        mesh.calc_tangents(uvmap=uv_layer.name)
        bad_after_loops = {
            index for index, loop in enumerate(mesh.loops)
            if Vector(loop.tangent).length_squared < 0.25
        }
        mesh.free_tangents()
        for polygon in collapsed_uv_polygons():
            bad_after_loops.update(polygon.loop_indices)
    if bad_after_loops:
        # A valid face can still inherit one unusable auto corner normal at a
        # decimation seam. Preserve every computed corner normal except the
        # affected loop(s), which receive their own face normal. This is
        # export-duplicate-only and leaves authored source normals untouched.
        corner_normals = [
            Vector(corner.vector).normalized()
            for corner in mesh.corner_normals
        ]
        for polygon in mesh.polygons:
            affected = bad_after_loops.intersection(polygon.loop_indices)
            for loop_index in affected:
                corner_normals[loop_index] = Vector(polygon.normal).normalized()
                custom_normal_loop_repairs += 1
        mesh.normals_split_custom_set(corner_normals)
        mesh.update()
        mesh.calc_tangents(uvmap=uv_layer.name)
        bad_after_loops = {
            index for index, loop in enumerate(mesh.loops)
            if Vector(loop.tangent).length_squared < 0.25
        }
        mesh.free_tangents()
        for polygon in collapsed_uv_polygons():
            bad_after_loops.update(polygon.loop_indices)
    bad_after = len(bad_after_loops)
    tangent_attribute_omitted = False
    material_names = {material.name for material in mesh.materials if material is not None}
    if bad_after and material_names == {"Material_Glass_Canopy"}:
        # The canopy is deliberately factor-only and has no normal texture, so
        # tangent space is semantically unused. Its donor laminate carries one
        # collapsed tangent vertex; omit the unused UV/tangent attribute rather
        # than corrupting the canopy mesh to manufacture a meaningless vector.
        for layer in list(mesh.uv_layers):
            mesh.uv_layers.remove(layer)
        bad_after = 0
        tangent_attribute_omitted = True
    if bad_after:
        diagnostics = []
        for polygon in mesh.polygons:
            if not bad_after_loops.intersection(polygon.loop_indices):
                continue
            diagnostics.append({
                "polygon": polygon.index,
                "area": float(polygon.area),
                "normal": [float(value) for value in polygon.normal],
                "vertices": [
                    [float(value) for value in mesh.vertices[mesh.loops[index].vertex_index].co]
                    for index in polygon.loop_indices
                ],
                "uvs": [
                    [float(value) for value in uv_layer.data[index].uv]
                    for index in polygon.loop_indices
                ],
            })
        raise RuntimeError(
            f"{obj.name} retains {bad_after} invalid tangent loops after local UV repair: "
            f"{json.dumps(diagnostics, separators=(',', ':'))}"
        )
    return {
        "object": obj.name,
        "removedDegenerateTriangles": removed_degenerate,
        "patchedTriangles": patched,
        "collapsedUvTriangles": len(collapsed_before),
        "canonicalUvTriangles": canonical_uv_triangles,
        "customNormalLoopRepairs": custom_normal_loop_repairs,
        "badBefore": len(tangent_bad_loops),
        "badAfter": bad_after,
        "tangentAttributeOmitted": tangent_attribute_omitted,
        "customNormalsCleared": had_custom_normals,
    }


def source_role(obj: bpy.types.Object, lod: int) -> str:
    if lod == 0 and str(obj.name).startswith("HOOK_"):
        return f"hook_{obj.name}"
    if lod >= 1:
        return "static"
    parent_names = set()
    cursor = obj.parent
    while cursor:
        parent_names.add(cursor.name)
        cursor = cursor.parent
    if "RIG_EngineFan" in parent_names:
        return "engine_fan"
    if "RIG_PulseGun_Recoil" in parent_names or "RIG_PulseGun_Yaw" in parent_names:
        return "pulse_gimbal"
    if "RIG_MiningEmitter" in parent_names:
        return "mining_head"
    return "static"


def lod_filter(obj: bpy.types.Object, lod: int) -> bool:
    if obj.type != "MESH" or obj.get("sf_helper") or obj.hide_render:
        return False
    lod2_silhouette_keep = lod == 2 and (
        obj.name in LOD2_SILHOUETTE_NAMES
        or any(obj.name.startswith(prefix) for prefix in LOD2_SILHOUETTE_PREFIXES)
    )
    max_detail = {0: 2, 1: 1, 2: 0}[lod]
    if int(obj.get("sf_detail_level", 0)) > max_detail and not lod2_silhouette_keep:
        return False
    if lod >= 1 and (obj.name.startswith("Decal_") or obj.name.startswith("Practical_Utility_")):
        return False
    if lod == 2 and obj.get("sf_component") in {"sensor", "utility"} and not lod2_silhouette_keep:
        return False
    return True


def add_empty(name: str, collection: bpy.types.Collection, matrix: Matrix | None = None, parent: bpy.types.Object | None = None) -> bpy.types.Object:
    obj = bpy.data.objects.new(name, None)
    collection.objects.link(obj)
    obj.empty_display_type = "PLAIN_AXES"
    obj.empty_display_size = 0.25
    obj.matrix_world = matrix.copy() if matrix else Matrix.Identity(4)
    if parent:
        world = obj.matrix_world.copy(); obj.parent = parent; obj.matrix_world = world
    return obj


def add_collision(collection: bpy.types.Collection, bounds: dict, root: bpy.types.Object) -> bpy.types.Object:
    center = Vector(bounds["center"]); dims = Vector(bounds["dimensions"])
    # A tight non-render convex helper.  Its axis bounds are exactly 92% of visible non-plume bounds.
    hx, hy, hz = (dims[i] * 0.46 for i in range(3))
    points = [
        center + Vector((hx, 0, 0)), center + Vector((hx * 0.55, hy, hz * 0.35)),
        center + Vector((hx * 0.55, -hy, hz * 0.35)), center + Vector((hx * 0.55, hy, -hz * 0.55)),
        center + Vector((hx * 0.55, -hy, -hz * 0.55)), center + Vector((-hx * 0.55, hy, hz)),
        center + Vector((-hx * 0.55, -hy, hz)), center + Vector((-hx * 0.55, hy, -hz)),
        center + Vector((-hx * 0.55, -hy, -hz)), center + Vector((-hx, hy * 0.35, hz * 0.45)),
        center + Vector((-hx, -hy * 0.35, hz * 0.45)), center + Vector((-hx, hy * 0.35, -hz * 0.45)),
        center + Vector((-hx, -hy * 0.35, -hz * 0.45)),
    ]
    mesh = bpy.data.meshes.new("COLLISION_HULL_MESH")
    bm = bmesh.new()
    for point in points:
        bm.verts.new(point)
    bm.verts.ensure_lookup_table()
    bmesh.ops.convex_hull(bm, input=list(bm.verts), use_existing_faces=False)
    bm.to_mesh(mesh); bm.free(); mesh.update()
    obj = bpy.data.objects.new("COLLISION_HULL", mesh); collection.objects.link(obj)
    obj["collision"] = True; obj["nonRender"] = True
    obj["spaceface"] = {"collision": True, "helper": True, "nonRender": True, "role": "collision"}
    obj.parent = root
    return obj


def create_lod(
    source: bpy.types.Collection,
    lod: int,
    bounds: dict,
    generation_fingerprint: str | None = None,
) -> tuple[bpy.types.Collection, dict]:
    name = f"KESTREL_V4_LOD{lod}"
    collection = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(collection)
    groups: dict[tuple[str, str], list[bpy.types.Object]] = {}
    material_bill_runtime_map: dict[str, set[str]] = {}
    for obj in source.all_objects:
        if not lod_filter(obj, lod):
            continue
        material = obj.data.materials[0].name if obj.data.materials else "NO_MATERIAL"
        override = None
        # The editable V6 blend keeps distinct authored material bills. Runtime exports map those
        # roles onto the proven Kestrel PBR material family, avoiding a draw for every Blender-only
        # review shader. Joined meshes cannot retain every source object's custom properties, so
        # the complete bill-to-runtime mapping is published on the root and in the build receipt.
        if material in V6_LOD_MATERIAL_COLLAPSE:
            material = V6_LOD_MATERIAL_COLLAPSE[material]
            override = material
        if lod >= 1 and material == "Material_EngineCeramic":
            # The refractory silhouette remains, but far LODs reuse the dark armor
            # response so a hero-only material role does not create another draw.
            material = "Material_ArmorDark"; override = material
        if lod >= 1 and material == "Material_Radiator":
            # Directional radiator metal converges to the existing structural-metal
            # response after its individual fins fall below useful screen space.
            material = "Material_BrushedMetal"; override = material
        if lod == 2 and material == "Material_Glass_Canopy":
            material = "Material_ArmorDark"; override = material
        if lod == 2 and material in {"Material_Emissive_Cyan", "Material_Accent_WarningOrange"}:
            # At sub-45px range these tiny cues share existing stable LOD2 paint materials:
            # no shimmer-prone emissive draw and no extra warning-paint draw.
            material = "Material_Accent_FrontierCyan"; override = material
        role = source_role(obj, lod)
        bill_id = str(obj.get("sf_material_bill_id") or "")
        if bill_id:
            material_bill_runtime_map.setdefault(bill_id, set()).add(material)
        duplicate = evaluated_duplicate(obj, collection, f"{name}_{obj.name}", override)
        groups.setdefault((role, material), []).append(duplicate)
    targets = []
    for (role, material), objects in sorted(groups.items()):
        safe = "".join(c if c.isalnum() else "_" for c in material.replace("Material_", ""))
        if material == "Material_Glass_Canopy":
            safe = "CANOPY"
        target = join_group(objects, f"LOD{lod}_{role}_{safe}")
        if target:
            if material == "Material_Glass_Canopy":
                extras = dict(target.get("spaceface") or {})
                extras["canopy"] = True
                target["spaceface"] = extras
                target["sf_canopy"] = True
            targets.append((role, target))
    v6_active = any(
        obj.get("sf_material_truth_pass") == MATERIAL_TRUTH_PASS_ID
        for obj in source.all_objects
    )
    v7_active = any(
        obj.get("sf_polish_pass") == "kestrel-hitch-polish-v7"
        for obj in source.all_objects
    )
    # V6 carries substantially more authored component structure than V5.
    # V7 keeps more of that construction at LOD0 so the mockup-facing vanes
    # and pipes survive the game camera instead of collapsing back to a tube.
    ratio = (
        {0: 0.40, 1: 0.28, 2: 0.58}[lod]
        if v7_active
        else {0: 0.262, 1: 0.25, 2: 0.62}[lod]
        if v6_active
        else {0: 0.50, 1: 0.40, 2: 1.0}[lod]
    )
    for role, obj in targets:
        preserve_identity_geometry = (
            role.startswith("hook_")
            or (
                obj.data.materials
                and obj.data.materials[0]
                and obj.data.materials[0].name == "Material_V6_MarkingIvory"
            )
        )
        if ratio < 0.999 and len(obj.data.polygons) >= 80 and not preserve_identity_geometry:
            modifier = obj.modifiers.new("V4_LOD_Decimate", "DECIMATE")
            modifier.ratio = ratio; modifier.use_collapse_triangulate = True
            bpy.context.view_layer.objects.active = obj; obj.select_set(True)
            bpy.ops.object.modifier_apply(modifier=modifier.name); obj.select_set(False)
        triangulate = obj.modifiers.new("V4_Export_Triangulate", "TRIANGULATE")
        triangulate.quad_method = "BEAUTY"; triangulate.ngon_method = "BEAUTY"
        if hasattr(triangulate, "keep_custom_normals"):
            triangulate.keep_custom_normals = True
        bpy.context.view_layer.objects.active = obj; obj.select_set(True)
        bpy.ops.object.modifier_apply(modifier=triangulate.name); obj.select_set(False)
    tangent_repairs = [repair_tangent_space(obj) for _, obj in targets]
    root = add_empty(f"KESTREL_V4_LOD{lod}_ROOT", collection)
    bill_runtime_receipt = {
        bill_id: sorted(materials)
        for bill_id, materials in sorted(material_bill_runtime_map.items())
    }
    root["spacefaceAsset"] = {
        "assetId": "SF_K0_KESTREL_BORROWED_TIME_V4", "partId": "kestrel_borrowed_time_v4",
        "packet": "SF-K0-HITCH-POLISH-V7-001" if v7_active else PACKET,
        "lod": f"lod{lod}", "slot": "hull", "category": "wholeships",
        "forward": "+X", "up": "+Y", "starboard": "+Z", "unit": "metre",
        "normalConvention": "OpenGL", "ormChannels": "R=AO,G=Roughness,B=Metallic",
        "surfaceRemasterId": "kestrel-hitch-polish-v7-surface" if v7_active else SURFACE_REMASTER_ID,
        "goldenPassId": GOLDEN_PASS_ID,
        "materialTruthPassId": MATERIAL_TRUTH_PASS_ID,
        "polishPassId": "kestrel-hitch-polish-v7" if v7_active else None,
        "embeddedPlume": False, "wiringStatus": "isolated_candidate_no_promote",
        "generationFingerprint": generation_fingerprint,
        "materialBillRuntimeMap": bill_runtime_receipt,
    }
    role_nodes = {"static": root}
    if lod == 0:
        role_nodes.update({
            "engine_fan": add_empty("RIG_EngineFan", collection, parent=root),
            "pulse_gimbal": add_empty("RIG_PulseGun_Yaw", collection, parent=root),
            "mining_head": add_empty("RIG_MiningEmitter", collection, parent=root),
        })
    for role, obj in targets:
        obj.parent = role_nodes.get(role, root)
    for socket_name in REQUIRED_SOCKETS:
        source_socket = bpy.data.objects.get(f"_SOURCE_{socket_name}") or bpy.data.objects.get(socket_name)
        if not source_socket:
            raise RuntimeError(f"missing source socket {socket_name}")
        socket = add_empty(socket_name, collection, source_socket.matrix_world, root)
        socket["socket"] = True
        _, role, forward = SOCKET_CONTRACT[socket_name]
        socket["spaceface"] = {
            "socket": True,
            "role": role,
            "forward": list(forward),
        }
    collision = add_collision(collection, bounds, root)
    triangles = sum(sum(max(0, len(poly.vertices) - 2) for poly in obj.data.polygons) for _, obj in targets)
    draws = len(targets)
    return collection, {"lod": lod, "triangles": triangles, "draws": draws,
                        "animatedRoleException": sum(1 for role, _ in targets if role != "static"),
                        "collisionTriangles": sum(max(0, len(poly.vertices) - 2) for poly in collision.data.polygons),
                        "tangentRepairs": [
                            item for item in tangent_repairs
                            if item["badBefore"] or item.get("collapsedUvTriangles", 0)
                        ],
                        "materialBillRuntimeMap": bill_runtime_receipt}


def export_lod(
    collection: bpy.types.Collection,
    lod: int,
    output_dir: Path | None = None,
) -> Path:
    out = (
        output_dir
        if output_dir is not None
        else FAMILY / "source" / "wholeships"
    ) / f"kestrel_borrowed_time_v4_lod{lod}.glb"
    out.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in collection.all_objects:
        obj.hide_viewport = False; obj.hide_set(False); obj.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=str(out), export_format="GLB", use_selection=True, export_apply=True,
        export_yup=True, export_extras=True, export_animations=False, export_materials="EXPORT",
        export_texcoords=True, export_normals=True, export_tangents=True, export_attributes=True,
        export_image_format="AUTO", export_unused_images=False, export_hierarchy_full_collections=False,
    )
    bpy.ops.object.select_all(action="DESELECT")
    if out.stat().st_size >= 100 * 1024 * 1024:
        raise RuntimeError(f"{out.name} exceeds 100 MiB")
    return out


def remove_collection(collection: bpy.types.Collection) -> None:
    for obj in list(collection.all_objects):
        obj_type = obj.type
        data = obj.data
        bpy.data.objects.remove(obj, do_unlink=True)
        if data and getattr(data, "users", 1) == 0 and obj_type == "MESH":
            bpy.data.meshes.remove(data)
    bpy.data.collections.remove(collection)


def main() -> int:
    args = parse_args()
    source_blend, zip_hash, blend_hash = extract_source(args.source_zip)
    bpy.ops.wm.open_mainfile(filepath=str(source_blend))
    (
        source,
        removed,
        material_repairs,
        surface_remaster,
        golden_asset,
        canonical_collision_bounds,
        material_truth,
        socket_contract,
    ) = clean_source()
    bounds = visible_bounds(source)
    production_blend = save_production_blend(source)
    # Free the canonical names so isolated export copies retain exact stable socket/rig names.
    for obj in list(bpy.data.objects):
        if obj.name in REQUIRED_SOCKETS or obj.name in RIG_NAMES:
            obj.name = f"_SOURCE_{obj.name}"
    reports = []
    outputs = []
    for lod in (0, 1, 2):
        collection, report = create_lod(source, lod, canonical_collision_bounds)
        output = export_lod(collection, lod)
        report.update({"path": str(output.relative_to(FAMILY)).replace("\\", "/"),
                       "bytes": output.stat().st_size, "sha256": sha256(output)})
        reports.append(report); outputs.append(output)
        remove_collection(collection)
    evidence = FAMILY / "evidence"; evidence.mkdir(parents=True, exist_ok=True)
    result = {
        "schema": "spaceface.kestrelBorrowedTimeV4.build.v1", "packet": PACKET,
        "sourceZip": str(args.source_zip), "sourceZipSha256": zip_hash,
        "sourceEntry": SOURCE_ENTRY, "sourceBlendSha256": blend_hash,
        "productionBlend": str(production_blend.relative_to(FAMILY)).replace("\\", "/"),
        "productionBlendBytes": production_blend.stat().st_size,
        "productionBlendSha256": sha256(production_blend), "removedObjects": removed,
        "materialRepairs": material_repairs, "surfaceRemasterId": SURFACE_REMASTER_ID,
        "surfaceRemaster": surface_remaster, "goldenPassId": GOLDEN_PASS_ID,
        "goldenAsset": golden_asset, "materialTruthPassId": MATERIAL_TRUTH_PASS_ID,
        "materialTruth": material_truth, "socketContract": socket_contract,
        "preservedGeometryPolicy": (
            "canonical silhouette, scale, collision and sockets retained; obsolete toy-read drive, "
            "sensor, shoulder, weapon, radiator and repair-pod modules replaced by manufactured V6 forms"
        ),
        "canonicalCollisionBoundsBlenderXYZ": canonical_collision_bounds,
        "visibleBoundsBlenderXYZ": bounds, "lods": reports, "outputs": [str(p) for p in outputs],
        "candidateOnly": True, "livePromotion": False,
    }
    (evidence / "build_report.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print("V4_BUILD_REPORT=" + json.dumps(result))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
