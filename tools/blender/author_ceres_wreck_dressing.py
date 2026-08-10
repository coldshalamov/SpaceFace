#!/usr/bin/env python3
"""Author-down seven selected wreck_aftermath_pack assets and compose two Ceres places.

PQ-045.wreck-dressing. Imports the ledger-selected incubator GLBs, merges meshes by
material role, authors LOD0/1/2 with strictly reducing triangle counts, applies real
PBR maps at consistent world-space texel density, instances repeated debris, and
exports:

  - per-asset authored_down GLBs under the incubator pack
  - place_ceres_bait_wreck / place_ceres_grave_shard under assets/ships/parts/places/

Run:

  blender --background --factory-startup --python tools/blender/author_ceres_wreck_dressing.py -- \\
    --maps-root assets/incubator/wreck_aftermath_pack/maps \\
    --source-root assets/incubator/wreck_aftermath_pack/source \\
    --authored-root assets/incubator/wreck_aftermath_pack/authored_down \\
    --places-root assets/ships/parts/places \\
    --blend-root assets/ships/parts/blender \\
    --report assets/incubator/wreck_aftermath_pack/evidence/author-down-report.json
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from collections import defaultdict
from pathlib import Path

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector


SELECTED = (
    "wreck_ore_freighter_hopper",
    "deb_ore_freighter_hopper_lid",
    "wreck_liner_bow",
    "wreck_liner_boatbay",
    "deb_liner_hull_panel",
    "aft_armor_slab",
    "frag_grating_sheet",
)

BAIT_PIECES = (
    "wreck_liner_bow",
    "wreck_liner_boatbay",
    "wreck_ore_freighter_hopper",
    "aft_armor_slab",
)
GRAVE_PIECES = (
    "deb_ore_freighter_hopper_lid",
    "deb_liner_hull_panel",
    "frag_grating_sheet",
)

# Compact staging of the pack's large drift offsets into a camera-readable field.
BAIT_STAGING = {
    "wreck_liner_bow": {"location": (0.0, 0.0, 0.0), "rotation": (0.0, 0.12, 0.08)},
    "wreck_liner_boatbay": {"location": (-20.0, 9.0, -5.0), "rotation": (0.35, -0.20, 0.55)},
    "wreck_ore_freighter_hopper": {"location": (22.0, -11.0, 3.5), "rotation": (-0.25, 0.40, -0.30)},
    "aft_armor_slab": {"location": (7.0, 13.0, 7.0), "rotation": (0.55, 0.10, 0.90)},
}
GRAVE_STAGING = {
    "deb_ore_freighter_hopper_lid": {"location": (0.0, 0.0, 0.0), "rotation": (0.20, -0.15, 0.40)},
    "deb_liner_hull_panel": {"location": (12.0, -5.5, 2.5), "rotation": (-0.40, 0.55, 1.10)},
}
# Instantiated grating debris around the grave shard (same mesh, distinct transforms).
GRAVE_GRATING_INSTANCES = (
    {"location": (-7.5, 5.0, -2.0), "rotation": (0.80, 0.20, 0.30)},
    {"location": (5.5, 7.5, -3.5), "rotation": (-0.30, 0.90, 1.40)},
    {"location": (-3.0, -6.5, 4.0), "rotation": (1.10, -0.40, 0.60)},
)

WRK_TO_MATERIAL = {
    "wrk_paint_freight_ochre": "Material_Hull",
    "wrk_paint_liner_bone": "Material_Hull",
    "wrk_hull_bare": "Material_Hull",
    "wrk_armor": "Material_Armor",
    "wrk_frame_steel": "Material_Structural",
    "wrk_deck_grate": "Material_Structural",
    "wrk_torn_edge": "Material_Insulation",
    "wrk_dust_matte": "Material_Insulation",
    "wrk_ore_raw": "Material_Insulation",
    "wrk_cable": "Material_Service",
    "wrk_scorch": "Material_Heat",
    "wrk_scorch_edge": "Material_Heat",
    "wrk_hot_deep_red": "Material_Heat",
    "wrk_emerg_amber": "Material_Heat",
    "wrk_glass_shattered": "Material_Glass",
}

ROLE_BY_MATERIAL = {
    "Material_Hull": "wreck_painted_hull",
    "Material_Armor": "wreck_armor_dark",
    "Material_Structural": "wreck_structural_alloy",
    "Material_Insulation": "wreck_rupture_insulation",
    "Material_Service": "wreck_service_trunks",
    "Material_Glass": "wreck_dead_glass",
    "Material_Heat": "wreck_heat_affected",
}

NORMAL_STRENGTH = {
    "wreck_painted_hull": 0.14,
    "wreck_armor_dark": 0.12,
    "wreck_structural_alloy": 0.14,
    "wreck_rupture_insulation": 0.18,
    "wreck_service_trunks": 0.11,
    "wreck_dead_glass": 0.05,
    "wreck_heat_affected": 0.15,
}

# World metres per UV unit. At 512 texels this is ~64 texels/m for hull roles.
CUBE_UV_METRES = 8.0
LOD_RATIOS = (1.0, 0.48, 0.20)
LOD2_DROP_MATERIALS = {"Material_Glass", "Material_Service"}

SOCKET_BY_ASSET = {
    "wreck_ore_freighter_hopper": ("SOCKET_Salvage_Ore",),
    "wreck_liner_bow": ("SOCKET_BlackBox", "SOCKET_Salvage_Bridge"),
    "wreck_liner_boatbay": ("SOCKET_Evidence_Manifest", "SOCKET_Salvage_Bay"),
}


def cli() -> argparse.Namespace:
    values = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description="Author-down Ceres wreck dressing.")
    parser.add_argument("--maps-root", type=Path, required=True)
    parser.add_argument("--source-root", type=Path, required=True)
    parser.add_argument("--authored-root", type=Path, required=True)
    parser.add_argument("--places-root", type=Path, required=True)
    parser.add_argument("--blend-root", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    return parser.parse_args(values)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def clear_scene() -> None:
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for block in (
        bpy.data.meshes,
        bpy.data.materials,
        bpy.data.images,
        bpy.data.cameras,
        bpy.data.lights,
        bpy.data.collections,
    ):
        for value in list(block):
            if value.users == 0:
                block.remove(value)


def load_image(path: Path, colorspace: str):
    if not path.is_file():
        raise FileNotFoundError(f"missing map: {path}")
    image = bpy.data.images.load(str(path.resolve()), check_existing=True)
    image.name = path.name
    image.colorspace_settings.name = colorspace
    image.pack()
    return image


def make_material(name: str, role: str, maps_root: Path):
    existing = bpy.data.materials.get(name)
    if existing:
        return existing
    value = bpy.data.materials.new(name)
    value.use_nodes = True
    value["spaceface.semantic"] = name
    value["spaceface.textureRole"] = role
    value["spaceface.ormChannels"] = "R=AO,G=Roughness,B=Metallic"
    value["spaceface.normalConvention"] = "OpenGL tangent space"

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
        group.interface.new_socket(
            name="Occlusion", in_out="INPUT", socket_type="NodeSocketFloat"
        )
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
        if "Coat Weight" in principled.inputs:
            principled.inputs["Coat Weight"].default_value = 0.04
            principled.inputs["Coat Roughness"].default_value = 0.55
    if name == "Material_Glass":
        principled.inputs["Roughness"].default_value = 0.62

    links.new(principled.outputs["BSDF"], output.inputs["Surface"])
    return value


def ensure_materials(maps_root: Path) -> dict[str, bpy.types.Material]:
    return {
        name: make_material(name, role, maps_root)
        for name, role in ROLE_BY_MATERIAL.items()
    }


def mesh_objects(roots=None):
    if roots is None:
        return [o for o in bpy.context.scene.objects if o.type == "MESH"]
    out = []
    for root in roots:
        out.append(root) if root.type == "MESH" else None
        for child in root.children_recursive:
            if child.type == "MESH":
                out.append(child)
    return out


def triangle_count(obj) -> int:
    mesh = obj.data
    if mesh.loop_triangles:
        return len(mesh.loop_triangles)
    mesh.calc_loop_triangles()
    return len(mesh.loop_triangles)


def total_tris(objs) -> int:
    return sum(triangle_count(o) for o in objs if o.type == "MESH")


def resolve_material_name(mat) -> str:
    if mat is None:
        return "Material_Structural"
    name = (mat.name or "").split(".")[0]
    if name in ROLE_BY_MATERIAL:
        return name
    if name in WRK_TO_MATERIAL:
        return WRK_TO_MATERIAL[name]
    lower = name.lower()
    for key, target in WRK_TO_MATERIAL.items():
        if key in lower or key.replace("wrk_", "") in lower:
            return target
    if "glass" in lower:
        return "Material_Glass"
    if "armor" in lower:
        return "Material_Armor"
    if "heat" in lower or "scorch" in lower or "hot" in lower:
        return "Material_Heat"
    if "cable" in lower or "service" in lower:
        return "Material_Service"
    if "torn" in lower or "insul" in lower or "dust" in lower or "ore" in lower:
        return "Material_Insulation"
    if "frame" in lower or "steel" in lower or "grate" in lower or "struct" in lower:
        return "Material_Structural"
    return "Material_Hull"


def import_glb(path: Path) -> list[bpy.types.Object]:
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(path.resolve()))
    imported = [o for o in bpy.data.objects if o not in before]
    return imported


def apply_object_transforms(objs) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objs:
        if obj.type != "MESH":
            continue
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        obj.select_set(False)


def world_box_uv(obj, metres_per_uv: float = CUBE_UV_METRES) -> None:
    """Consistent world-space box UVs — large plates get proportional texels to small struts."""
    mesh = obj.data
    if not mesh.uv_layers:
        mesh.uv_layers.new(name="UVMap")
    uv_layer = mesh.uv_layers.active
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.faces.ensure_lookup_table()
    uv = bm.loops.layers.uv.active or bm.loops.layers.uv.new("UVMap")
    matrix = obj.matrix_world
    inv = 1.0 / max(0.001, metres_per_uv)
    for face in bm.faces:
        n = (matrix.to_3x3() @ face.normal).normalized()
        ax = abs(n.x)
        ay = abs(n.y)
        az = abs(n.z)
        for loop in face.loops:
            co = matrix @ loop.vert.co
            if az >= ax and az >= ay:
                loop[uv].uv = (co.x * inv, co.y * inv)
            elif ay >= ax:
                loop[uv].uv = (co.x * inv, co.z * inv)
            else:
                loop[uv].uv = (co.y * inv, co.z * inv)
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()


def reassign_materials(objs, materials: dict[str, bpy.types.Material]) -> None:
    for obj in objs:
        if obj.type != "MESH":
            continue
        mesh = obj.data
        slot_map = []
        for slot in obj.material_slots:
            target_name = resolve_material_name(slot.material)
            slot_map.append(target_name)
        if not slot_map:
            mesh.materials.clear()
            mesh.materials.append(materials["Material_Structural"])
            continue
        # Rebuild material slots as unique canonical materials.
        unique = []
        remap = []
        for name in slot_map:
            if name not in unique:
                unique.append(name)
            remap.append(unique.index(name))
        mesh.materials.clear()
        for name in unique:
            mesh.materials.append(materials[name])
        for poly in mesh.polygons:
            poly.material_index = remap[min(poly.material_index, len(remap) - 1)]


def join_by_material(objs, materials, prefix: str) -> list[bpy.types.Object]:
    """Merge all mesh objects that share a material into one object per material."""
    buckets: dict[str, list[bpy.types.Object]] = defaultdict(list)
    working = []
    for obj in list(objs):
        if obj.type != "MESH":
            continue
        # Split multi-material objects into mono-material copies first.
        mesh = obj.data
        used = sorted({p.material_index for p in mesh.polygons})
        if len(used) <= 1:
            mat_name = resolve_material_name(obj.material_slots[0].material if obj.material_slots else None)
            if not obj.material_slots:
                mesh.materials.append(materials[mat_name])
            elif obj.material_slots[0].material != materials[mat_name]:
                obj.material_slots[0].material = materials[mat_name]
            buckets[mat_name].append(obj)
            working.append(obj)
            continue
        for mat_index in used:
            mat = mesh.materials[mat_index] if mat_index < len(mesh.materials) else None
            mat_name = resolve_material_name(mat)
            new_mesh = bpy.data.meshes.new(f"{obj.name}_{mat_name}_split")
            bm = bmesh.new()
            bm.from_mesh(mesh)
            bm.faces.ensure_lookup_table()
            for face in list(bm.faces):
                if face.material_index != mat_index:
                    bm.faces.remove(face)
            for face in bm.faces:
                face.material_index = 0
            bm.to_mesh(new_mesh)
            bm.free()
            new_obj = bpy.data.objects.new(f"{obj.name}_{mat_name}", new_mesh)
            new_obj.matrix_world = obj.matrix_world.copy()
            bpy.context.scene.collection.objects.link(new_obj)
            new_mesh.materials.append(materials[mat_name])
            buckets[mat_name].append(new_obj)
            working.append(new_obj)
        # Remove original multi-material object.
        bpy.data.objects.remove(obj, do_unlink=True)

    joined = []
    for mat_name, group in buckets.items():
        if not group:
            continue
        if len(group) == 1:
            obj = group[0]
            obj.name = f"{prefix}_{mat_name}"
            obj.data.name = f"{prefix}_{mat_name}_mesh"
            if not obj.data.materials:
                obj.data.materials.append(materials[mat_name])
            else:
                obj.data.materials[0] = materials[mat_name]
            joined.append(obj)
            continue
        bpy.ops.object.select_all(action="DESELECT")
        for obj in group:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = group[0]
        bpy.ops.object.join()
        active = bpy.context.view_layer.objects.active
        active.name = f"{prefix}_{mat_name}"
        active.data.name = f"{prefix}_{mat_name}_mesh"
        active.data.materials.clear()
        active.data.materials.append(materials[mat_name])
        joined.append(active)
    return joined


def decimate_object(obj, ratio: float) -> None:
    if ratio >= 0.999:
        return
    tris = triangle_count(obj)
    if tris < 12:
        return
    mod = obj.modifiers.new("SF_LOD_Decimate", "DECIMATE")
    mod.ratio = max(0.05, ratio)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.modifier_apply(modifier=mod.name)
    obj.select_set(False)


def shade_hard_surface(obj) -> None:
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    try:
        bpy.ops.object.shade_smooth_by_angle(angle=math.radians(28.0))
    except Exception:
        bpy.ops.object.shade_flat()
    obj.select_set(False)


def make_empty(name: str, parent=None, location=(0.0, 0.0, 0.0)):
    obj = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(obj)
    obj.empty_display_type = "PLAIN_AXES"
    obj.empty_display_size = 0.8
    obj.location = location
    if parent is not None:
        obj.parent = parent
    return obj


def center_objects(objs) -> Vector:
    mins = Vector((math.inf, math.inf, math.inf))
    maxs = Vector((-math.inf, -math.inf, -math.inf))
    for obj in objs:
        if obj.type != "MESH":
            continue
        for corner in obj.bound_box:
            world = obj.matrix_world @ Vector(corner)
            mins = Vector((min(mins.x, world.x), min(mins.y, world.y), min(mins.z, world.z)))
            maxs = Vector((max(maxs.x, world.x), max(maxs.y, world.y), max(maxs.z, world.z)))
    center = (mins + maxs) * 0.5
    for obj in objs:
        if obj.parent is None:
            obj.location -= center
    bpy.context.view_layer.update()
    return center


def bounds_of(objs):
    mins = Vector((math.inf, math.inf, math.inf))
    maxs = Vector((-math.inf, -math.inf, -math.inf))
    count = 0
    for obj in objs:
        if obj.type != "MESH":
            continue
        count += 1
        for corner in obj.bound_box:
            world = obj.matrix_world @ Vector(corner)
            mins = Vector((min(mins.x, world.x), min(mins.y, world.y), min(mins.z, world.z)))
            maxs = Vector((max(maxs.x, world.x), max(maxs.y, world.y), max(maxs.z, world.z)))
    if count == 0:
        return {"min": [0, 0, 0], "max": [0, 0, 0], "size": [0, 0, 0]}
    size = maxs - mins
    return {
        "min": [round(mins.x, 4), round(mins.y, 4), round(mins.z, 4)],
        "max": [round(maxs.x, 4), round(maxs.y, 4), round(maxs.z, 4)],
        "size": [round(size.x, 4), round(size.y, 4), round(size.z, 4)],
    }


def collision_proxy(objs, kind: str = "box"):
    b = bounds_of(objs)
    return {
        "kind": kind,
        "aabbM": b["size"],
        "min": b["min"],
        "max": b["max"],
    }


def build_lod_set(merged_objs, asset_id: str, materials, ratios=LOD_RATIOS):
    """Return dict lod -> list of mesh objects with strictly reducing total tris."""
    root = make_empty(asset_id)
    root["spaceface.assetId"] = asset_id
    lod_groups = {}
    lod_meshes = {}
    previous_tris = None
    for level, ratio in enumerate(ratios):
        group = make_empty(f"LOD{level}_{asset_id}", root)
        group["spaceface.lod"] = f"lod{level}"
        group["spaceface.lodLevel"] = level
        group["spaceface.assetId"] = asset_id
        lod_groups[level] = group
        meshes = []
        for src in merged_objs:
            mat_name = src.data.materials[0].name if src.data.materials else "Material_Structural"
            mat_name = mat_name.split(".")[0]
            if level == 2 and mat_name in LOD2_DROP_MATERIALS:
                continue
            dup = src.copy()
            dup.data = src.data.copy()
            dup.name = f"LOD{level}_{asset_id}_{mat_name}"
            dup.data.name = f"{dup.name}_mesh"
            bpy.context.scene.collection.objects.link(dup)
            # Apply relative decimate from LOD0 density.
            if level > 0:
                decimate_object(dup, ratio)
            # Ensure single canonical material.
            if mat_name in materials:
                dup.data.materials.clear()
                dup.data.materials.append(materials[mat_name])
            world_box_uv(dup)
            shade_hard_surface(dup)
            dup.parent = group
            dup["spaceface.lod"] = f"lod{level}"
            dup["spaceface.lodLevel"] = level
            dup["spaceface.materialRole"] = mat_name
            meshes.append(dup)
        # Force strictly reducing triangle counts if decimate was a no-op on tiny meshes.
        tris = total_tris(meshes)
        if previous_tris is not None and tris >= previous_tris and meshes:
            target = max(4, int(previous_tris * (0.55 if level == 1 else 0.35)))
            # Progressive decimate until under target or floors out.
            for _ in range(4):
                tris = total_tris(meshes)
                if tris < previous_tris and tris <= target:
                    break
                factor = max(0.12, target / max(1, tris))
                for mesh_obj in list(meshes):
                    before = triangle_count(mesh_obj)
                    if before <= 4:
                        continue
                    decimate_object(mesh_obj, factor)
            tris = total_tris(meshes)
        while previous_tris is not None and tris >= previous_tris and len(meshes) > 1:
            # Drop the smallest mesh to guarantee reduction.
            meshes.sort(key=triangle_count)
            victim = meshes.pop(0)
            bpy.data.objects.remove(victim, do_unlink=True)
            tris = total_tris(meshes)
        if previous_tris is not None and tris >= previous_tris and meshes:
            # Absolute last resort: collapse the largest mesh hard.
            meshes.sort(key=triangle_count, reverse=True)
            decimate_object(meshes[0], 0.15)
            tris = total_tris(meshes)
        if previous_tris is not None and tris >= previous_tris:
            raise RuntimeError(
                f"unable to reduce LOD{level} below LOD{level-1}: {tris} >= {previous_tris}"
            )
        lod_meshes[level] = meshes
        previous_tris = tris if tris > 0 else previous_tris
    # Remove the working merged sources (LOD sources were duplicated).
    for src in merged_objs:
        bpy.data.objects.remove(src, do_unlink=True)
    return root, lod_groups, lod_meshes


def attach_sockets(asset_id: str, root, lod_meshes) -> list[str]:
    names = list(SOCKET_BY_ASSET.get(asset_id, ()))
    if not names:
        # Default salvage/hazard pair for composed places.
        return []
    # Place sockets near the bounds center of LOD0 structural/hull mass.
    b = bounds_of(lod_meshes.get(0, []))
    cx = (b["min"][0] + b["max"][0]) * 0.5
    cy = (b["min"][1] + b["max"][1]) * 0.5
    cz = (b["min"][2] + b["max"][2]) * 0.5
    for i, name in enumerate(names):
        loc = (cx + (i - 0.5) * 2.5, cy, cz + 1.0)
        empty = make_empty(name, root, loc)
        empty["spaceface.socket"] = name
    return names


def export_glb(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(path.resolve()),
        export_format="GLB",
        use_selection=False,
        export_apply=True,
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_image_format="AUTO",
        export_yup=True,
    )


def save_blend(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(path.resolve()))


def author_single_asset(asset_id: str, source_path: Path, materials, maps_root: Path):
    imported = import_glb(source_path)
    mesh_src = [o for o in imported if o.type == "MESH"]
    source_mesh_count = len(mesh_src)
    source_tris = total_tris(mesh_src)
    # Preserve empties that look like sockets before cleanup.
    socket_names = [
        o.name for o in imported
        if o.type == "EMPTY" and o.name.startswith(("SOCKET_", "INTERACTION_"))
    ]
    apply_object_transforms(mesh_src)
    reassign_materials(mesh_src, materials)
    for obj in mesh_src:
        world_box_uv(obj)
    merged = join_by_material(mesh_src, materials, prefix=f"{asset_id}_merged")
    merged_names = {o.name for o in merged}
    # Delete leftover import meshes that were not kept as merged outputs.
    for obj in list(bpy.context.scene.objects):
        if obj.type == "MESH" and obj.name not in merged_names:
            bpy.data.objects.remove(obj, do_unlink=True)
    # Refresh live references after possible renames during join.
    merged = [bpy.data.objects[name] for name in merged_names if name in bpy.data.objects]
    root, lod_groups, lod_meshes = build_lod_set(merged, asset_id, materials)
    # Re-parent preserved sockets.
    sockets = []
    for name in socket_names:
        empty = bpy.data.objects.get(name)
        if empty is None:
            continue
        empty.parent = root
        sockets.append(empty.name)
    if not sockets:
        sockets = attach_sockets(asset_id, root, lod_meshes)
    # Parent any remaining free empties under root.
    for obj in list(bpy.context.scene.objects):
        if obj.type == "EMPTY" and obj != root and obj.parent is None and not obj.name.startswith("LOD"):
            if obj.name.startswith(("SOCKET_", "INTERACTION_")):
                obj.parent = root
                if obj.name not in sockets:
                    sockets.append(obj.name)
    center_objects([root] + [o for o in bpy.context.scene.objects if o.type == "MESH"])
    lod_stats = {}
    for level, meshes in lod_meshes.items():
        lod_stats[f"lod{level}"] = {
            "objects": len(meshes),
            "tris": total_tris(meshes),
            "materials": sorted({(m.data.materials[0].name if m.data.materials else "") for m in meshes}),
        }
    # Validate strictly reducing tris.
    tris_seq = [lod_stats[f"lod{i}"]["tris"] for i in range(3)]
    if not (tris_seq[0] > tris_seq[1] > tris_seq[2] >= 0):
        # Last-resort: rebuild LOD2 from a heavy decimate of LOD0 if still non-decreasing.
        raise RuntimeError(f"{asset_id}: LOD tris not strictly reducing: {tris_seq}")
    return {
        "id": asset_id,
        "sourceMeshes": source_mesh_count,
        "sourceTris": source_tris,
        "mergedObjectsLod0": lod_stats["lod0"]["objects"],
        "lod": lod_stats,
        "sockets": sockets,
        "bounds": bounds_of([o for o in bpy.context.scene.objects if o.type == "MESH" and o.get("spaceface.lod") == "lod0"]),
        "collisionProxy": collision_proxy(
            [o for o in bpy.context.scene.objects if o.type == "MESH" and o.get("spaceface.lod") == "lod0"],
            kind="compound-box" if asset_id.startswith("wreck_") else "box",
        ),
        "materials": sorted(ROLE_BY_MATERIAL),
        "root": root.name,
    }


def isolate_for_export(keep_names: set[str]) -> None:
    for obj in list(bpy.context.scene.objects):
        if obj.name not in keep_names and obj.type in {"MESH", "EMPTY"}:
            # Keep if descendant of a keep root.
            parent = obj.parent
            keep = False
            while parent is not None:
                if parent.name in keep_names:
                    keep = True
                    break
                parent = parent.parent
            if not keep:
                bpy.data.objects.remove(obj, do_unlink=True)


def descendant_names(root_name: str) -> set[str]:
    root = bpy.data.objects.get(root_name)
    if not root:
        return set()
    names = {root_name}
    for child in root.children_recursive:
        names.add(child.name)
    return names


def stage_piece(piece_root_name: str, location, rotation) -> None:
    root = bpy.data.objects.get(piece_root_name)
    if root is None:
        raise RuntimeError(f"missing piece root {piece_root_name}")
    root.location = Vector(location)
    root.rotation_mode = "XYZ"
    root.rotation_euler = Euler(rotation, "XYZ")


def instance_grating(template_root_name: str, instances) -> list[str]:
    template = bpy.data.objects.get(template_root_name)
    if template is None:
        raise RuntimeError("frag_grating_sheet root missing for instancing")
    created = []
    for i, spec in enumerate(instances):
        # Deep-copy the LOD hierarchy.
        new_root = template.copy()
        new_root.name = f"frag_grating_sheet_inst{i}"
        bpy.context.scene.collection.objects.link(new_root)
        for child in template.children_recursive:
            dup = child.copy()
            if child.type == "MESH":
                dup.data = child.data  # share mesh data = true instancing of geometry
            dup.name = f"{child.name}_inst{i}"
            bpy.context.scene.collection.objects.link(dup)
            # Re-parent relative to new hierarchy by matching parent name pattern.
            if child.parent == template:
                dup.parent = new_root
            else:
                # Find corresponding parent clone.
                parent_name = f"{child.parent.name}_inst{i}" if child.parent else None
                dup.parent = bpy.data.objects.get(parent_name) or new_root
        new_root.location = Vector(spec["location"])
        new_root.rotation_mode = "XYZ"
        new_root.rotation_euler = Euler(spec["rotation"], "XYZ")
        created.append(new_root.name)
    return created


def _mesh_lod_level(obj) -> int | None:
    """Resolve LOD level from custom prop or name prefix after glTF re-import."""
    prop = obj.get("spaceface.lodLevel")
    if prop is not None:
        try:
            return int(prop)
        except (TypeError, ValueError):
            pass
    prop = obj.get("spaceface.lod")
    if isinstance(prop, str) and prop.startswith("lod"):
        try:
            return int(prop[3:])
        except ValueError:
            pass
    name = obj.name or ""
    for level in (0, 1, 2):
        token = f"LOD{level}_"
        if token in name or name.startswith(token):
            return level
    return None


def compose_place(place_id: str, piece_roots: list[str], materials, sockets_extra=None):
    """Compose currently-imported piece hierarchies into one place with merged LODs.

    Piece roots may be empties or mesh parents; after glTF re-import, LOD membership is
    recovered from object names (`LOD0_...`) because custom props do not always survive.
    """
    root = make_empty(place_id)
    root["spaceface.assetId"] = place_id

    # Collect every mesh currently in the scene that belongs to a piece hierarchy.
    piece_name_set = set(piece_roots)
    lod_collect = {0: [], 1: [], 2: []}
    socket_candidates = []
    for obj in list(bpy.context.scene.objects):
        if obj.type == "EMPTY" and obj.name.startswith(("SOCKET_", "INTERACTION_")):
            socket_candidates.append(obj)
            continue
        if obj.type != "MESH":
            continue
        # Keep meshes that are under a piece root or whose name still carries LOD tokens.
        level = _mesh_lod_level(obj)
        if level is None:
            continue
        # Bake world transform (including staged parent offsets) into mesh data.
        world = obj.matrix_world.copy()
        obj.parent = None
        obj.matrix_world = world
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        obj.select_set(False)
        lod_collect[level].append(obj)

    if not any(lod_collect[level] for level in (0, 1, 2)):
        # Fallback: treat all meshes as LOD0 and synthesize reduced LODs.
        all_meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
        lod_collect[0] = all_meshes

    # Drop original piece empty parents; meshes are now free and pose-baked.
    for obj in list(bpy.context.scene.objects):
        if obj.type == "EMPTY" and obj != root and not obj.name.startswith(("SOCKET_", "INTERACTION_")):
            bpy.data.objects.remove(obj, do_unlink=True)

    final_lod_meshes = {0: [], 1: [], 2: []}
    for level in (0, 1, 2):
        group = make_empty(f"LOD{level}_{place_id}", root)
        group["spaceface.lod"] = f"lod{level}"
        group["spaceface.lodLevel"] = level
        group["spaceface.assetId"] = place_id

        source_meshes = list(lod_collect[level])
        if level > 0 and not source_meshes and final_lod_meshes[0]:
            # Synthesize missing higher LODs from LOD0 when import dropped them.
            source_meshes = []
            for src in final_lod_meshes[0]:
                dup = src.copy()
                dup.data = src.data.copy()
                bpy.context.scene.collection.objects.link(dup)
                decimate_object(dup, LOD_RATIOS[level])
                source_meshes.append(dup)

        by_mat = defaultdict(list)
        for mesh in source_meshes:
            mat = "Material_Structural"
            if mesh.data.materials:
                mat = resolve_material_name(mesh.data.materials[0])
            if level == 2 and mat in LOD2_DROP_MATERIALS:
                bpy.data.objects.remove(mesh, do_unlink=True)
                continue
            if mat in materials:
                mesh.data.materials.clear()
                mesh.data.materials.append(materials[mat])
            by_mat[mat].append(mesh)

        for mat_name, group_meshes in by_mat.items():
            if not group_meshes:
                continue
            if len(group_meshes) == 1:
                active = group_meshes[0]
            else:
                bpy.ops.object.select_all(action="DESELECT")
                for obj in group_meshes:
                    obj.select_set(True)
                bpy.context.view_layer.objects.active = group_meshes[0]
                bpy.ops.object.join()
                active = bpy.context.view_layer.objects.active
            active.name = f"LOD{level}_{place_id}_{mat_name}"
            active.data.name = f"{active.name}_mesh"
            active.parent = group
            active["spaceface.lod"] = f"lod{level}"
            active["spaceface.lodLevel"] = level
            active["spaceface.materialRole"] = mat_name
            world_box_uv(active)
            shade_hard_surface(active)
            final_lod_meshes[level].append(active)

    # Ensure strictly reducing triangle counts across composed LODs.
    prev = None
    for level in (0, 1, 2):
        meshes = final_lod_meshes[level]
        tris = total_tris(meshes)
        if prev is not None and tris >= prev:
            target = max(4, int(prev * (0.55 if level == 1 else 0.35)))
            for _ in range(5):
                tris = total_tris(meshes)
                if tris < prev:
                    break
                factor = max(0.12, target / max(1, tris))
                for mesh_obj in meshes:
                    if triangle_count(mesh_obj) > 4:
                        decimate_object(mesh_obj, factor)
            tris = total_tris(meshes)
            while tris >= prev and len(meshes) > 1:
                meshes.sort(key=triangle_count)
                victim = meshes.pop(0)
                bpy.data.objects.remove(victim, do_unlink=True)
                tris = total_tris(meshes)
            if tris >= prev and meshes:
                decimate_object(meshes[0], 0.12)
                tris = total_tris(meshes)
            if tris >= prev:
                raise RuntimeError(f"{place_id}: composed LOD{level} tris not reducing ({tris} >= {prev})")
        final_lod_meshes[level] = meshes
        prev = tris

    # Standard sockets for the two Ceres place slots.
    if place_id == "place_ceres_bait_wreck":
        default_sockets = ["SOCKET_Hazard_Core", "SOCKET_Salvage_Core", "SOCKET_BlackBox"]
    elif place_id == "place_ceres_grave_shard":
        default_sockets = ["SOCKET_Tether_Massline", "SOCKET_Salvage_Core"]
    else:
        default_sockets = list(sockets_extra or [])

    b = bounds_of(final_lod_meshes[0])
    cx = (b["min"][0] + b["max"][0]) * 0.5
    cy = (b["min"][1] + b["max"][1]) * 0.5
    cz = (b["min"][2] + b["max"][2]) * 0.5
    # Clear imported sockets; place owns the slot sockets.
    for empty in socket_candidates:
        if empty.name in bpy.data.objects:
            bpy.data.objects.remove(empty, do_unlink=True)
    for i, name in enumerate(default_sockets):
        make_empty(name, root, (cx + (i - 1) * 3.0, cy, cz + 1.5))

    center_objects([root] + final_lod_meshes[0] + final_lod_meshes[1] + final_lod_meshes[2])

    lod_stats = {}
    for level in (0, 1, 2):
        meshes = final_lod_meshes[level]
        lod_stats[f"lod{level}"] = {
            "objects": len(meshes),
            "tris": total_tris(meshes),
            "materials": sorted({
                (m.data.materials[0].name.split(".")[0] if m.data.materials else "")
                for m in meshes
            }),
        }
    tris_seq = [lod_stats[f"lod{i}"]["tris"] for i in range(3)]
    if not (tris_seq[0] > tris_seq[1] > tris_seq[2] >= 0):
        raise RuntimeError(f"{place_id}: composed LOD tris not strictly reducing: {tris_seq}")

    return {
        "id": place_id,
        "mergedObjectsLod0": lod_stats["lod0"]["objects"],
        "lod": lod_stats,
        "sockets": default_sockets,
        "bounds": bounds_of(final_lod_meshes[0]),
        "collisionProxy": collision_proxy(final_lod_meshes[0], kind="compound-box"),
        "materials": sorted(ROLE_BY_MATERIAL),
        "root": root.name,
        "drawCallsLod0": lod_stats["lod0"]["objects"],
    }


def texture_megabytes(maps_root: Path) -> float:
    total = 0
    for path in maps_root.glob("wreck_*.png"):
        total += path.stat().st_size
    return round(total / (1024 * 1024), 3)


def main() -> None:
    args = cli()
    args.authored_root.mkdir(parents=True, exist_ok=True)
    args.places_root.mkdir(parents=True, exist_ok=True)
    args.blend_root.mkdir(parents=True, exist_ok=True)
    args.report.parent.mkdir(parents=True, exist_ok=True)

    clear_scene()
    materials = ensure_materials(args.maps_root)

    asset_reports = []
    piece_roots = {}

    # Author each selected asset into the same scene, then export individually.
    for asset_id in SELECTED:
        # Clear only non-material datablocks between assets by isolating exports.
        # Keep materials; remove objects.
        for obj in list(bpy.context.scene.objects):
            bpy.data.objects.remove(obj, do_unlink=True)
        for mesh in list(bpy.data.meshes):
            if mesh.users == 0:
                bpy.data.meshes.remove(mesh)

        source = args.source_root / f"{asset_id}.glb"
        if not source.is_file():
            raise FileNotFoundError(source)
        report = author_single_asset(asset_id, source, materials, args.maps_root)
        out_glb = args.authored_root / f"{asset_id}.glb"
        export_glb(out_glb)
        report["authoredGlb"] = str(out_glb.as_posix())
        report["authoredSha256"] = sha256(out_glb)
        report["authoredBytes"] = out_glb.stat().st_size
        asset_reports.append(report)
        piece_roots[asset_id] = report["root"]
        print(
            f"[author] {asset_id}: meshes {report['sourceMeshes']} -> "
            f"{report['mergedObjectsLod0']} | tris LOD "
            f"{report['lod']['lod0']['tris']}/{report['lod']['lod1']['tris']}/{report['lod']['lod2']['tris']}"
        )

    # Rebuild all pieces into one scene for composition by re-importing authored_down.
    for obj in list(bpy.context.scene.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for mesh in list(bpy.data.meshes):
        if mesh.users == 0:
            bpy.data.meshes.remove(mesh)

    imported_roots = {}
    for asset_id in SELECTED:
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=str((args.authored_root / f"{asset_id}.glb").resolve()))
        new_objs = [o for o in bpy.data.objects if o not in before]
        # Find root empty named as asset_id or the top-most parent.
        root = None
        for obj in new_objs:
            if obj.name == asset_id or obj.name.startswith(asset_id):
                if obj.type == "EMPTY" or obj.parent is None:
                    root = obj
                    break
        if root is None:
            # Pick parentless object.
            parents = [o for o in new_objs if o.parent is None]
            root = parents[0] if parents else new_objs[0]
            root.name = asset_id
        imported_roots[asset_id] = root.name

    # Stage bait pieces.
    for asset_id, staging in BAIT_STAGING.items():
        stage_piece(imported_roots[asset_id], staging["location"], staging["rotation"])

    for asset_id, staging in GRAVE_STAGING.items():
        stage_piece(imported_roots[asset_id], staging["location"], staging["rotation"])

    grating_instances = instance_grating(imported_roots["frag_grating_sheet"], GRAVE_GRATING_INSTANCES)
    # Hide / park the original grating template under first instance offset already staged? Keep template as first debris.
    stage_piece(imported_roots["frag_grating_sheet"], (-2.0, 2.0, 1.0), (0.3, 0.2, 0.5))

    # Compose bait place: temporarily hide grave pieces by moving far, or build in isolation.
    # Approach: duplicate hierarchy approach is messy; instead build each place in a clean scene.

    def build_place_from_authored(place_id: str, piece_ids: list[str], extra_roots=None):
        for obj in list(bpy.context.scene.objects):
            bpy.data.objects.remove(obj, do_unlink=True)
        for mesh in list(bpy.data.meshes):
            if mesh.users == 0:
                bpy.data.meshes.remove(mesh)
        roots = []
        for asset_id in piece_ids:
            before = set(bpy.data.objects)
            bpy.ops.import_scene.gltf(filepath=str((args.authored_root / f"{asset_id}.glb").resolve()))
            new_objs = [o for o in bpy.data.objects if o not in before]
            parents = [o for o in new_objs if o.parent is None]
            root = parents[0] if parents else new_objs[0]
            root.name = asset_id
            staging = BAIT_STAGING.get(asset_id) or GRAVE_STAGING.get(asset_id) or {
                "location": (0, 0, 0),
                "rotation": (0, 0, 0),
            }
            if asset_id == "frag_grating_sheet":
                staging = {"location": (-2.0, 2.0, 1.0), "rotation": (0.3, 0.2, 0.5)}
            stage_piece(root.name, staging["location"], staging["rotation"])
            roots.append(root.name)
        if place_id == "place_ceres_grave_shard":
            # Re-instance grating from the imported template root.
            roots.extend(instance_grating("frag_grating_sheet", GRAVE_GRATING_INSTANCES))
        report = compose_place(place_id, roots, materials)
        out_glb = args.places_root / f"{place_id}.glb"
        out_blend = args.blend_root / f"{place_id}_authored.blend"
        export_glb(out_glb)
        save_blend(out_blend)
        report["glb"] = str(out_glb.as_posix())
        report["blend"] = str(out_blend.as_posix())
        report["sha256"] = sha256(out_glb)
        report["bytes"] = out_glb.stat().st_size
        report["pieces"] = piece_ids
        print(
            f"[compose] {place_id}: objects LOD0={report['mergedObjectsLod0']} "
            f"tris {report['lod']['lod0']['tris']}/{report['lod']['lod1']['tris']}/{report['lod']['lod2']['tris']}"
        )
        return report

    bait_report = build_place_from_authored("place_ceres_bait_wreck", list(BAIT_PIECES))
    grave_report = build_place_from_authored("place_ceres_grave_shard", list(GRAVE_PIECES))

    raw_mesh_total = sum(a["sourceMeshes"] for a in asset_reports)
    raw_tris_total = sum(a["sourceTris"] for a in asset_reports)
    authored_mesh_total = sum(a["mergedObjectsLod0"] for a in asset_reports)

    final_report = {
        "schema": "spaceface.wreckAftermathAuthorDown.v1",
        "packet": "PQ-045.wreck-dressing",
        "generator": "tools/blender/author_ceres_wreck_dressing.py",
        "blender": bpy.app.version_string,
        "selectedAssets": list(SELECTED),
        "mapsRoot": str(args.maps_root.as_posix()),
        "textureMegabytesShared": texture_megabytes(args.maps_root),
        "cubeUvMetres": CUBE_UV_METRES,
        "rawPack": {
            "selectedMeshes": raw_mesh_total,
            "selectedTris": raw_tris_total,
            "textures": 0,
            "lods": 0,
            "note": "Untextured incubator sources; no LODs; one draw per authoring primitive",
        },
        "authoredDown": {
            "selectedMeshesLod0": authored_mesh_total,
            "meshReduction": raw_mesh_total - authored_mesh_total,
            "assets": asset_reports,
        },
        "places": {
            "place_ceres_bait_wreck": bait_report,
            "place_ceres_grave_shard": grave_report,
        },
        "costModel": {
            "place_ceres_bait_wreck": {
                "drawCallsLod0": bait_report["drawCallsLod0"],
                "materials": len(bait_report["materials"]),
                "textureMBSharedPool": texture_megabytes(args.maps_root),
                "trisLod0": bait_report["lod"]["lod0"]["tris"],
                "trisLod1": bait_report["lod"]["lod1"]["tris"],
                "trisLod2": bait_report["lod"]["lod2"]["tris"],
            },
            "place_ceres_grave_shard": {
                "drawCallsLod0": grave_report["drawCallsLod0"],
                "materials": len(grave_report["materials"]),
                "textureMBSharedPool": texture_megabytes(args.maps_root),
                "trisLod0": grave_report["lod"]["lod0"]["tris"],
                "trisLod1": grave_report["lod"]["lod1"]["tris"],
                "trisLod2": grave_report["lod"]["lod2"]["tris"],
            },
            "comparisonToRawSelected": {
                "rawMeshes": raw_mesh_total,
                "authoredMeshesLod0AcrossSeven": authored_mesh_total,
                "composedDrawCallsLod0BothPlaces": bait_report["drawCallsLod0"] + grave_report["drawCallsLod0"],
                "rawTexturesMB": 0,
                "authoredTexturesMB": texture_megabytes(args.maps_root),
            },
        },
    }
    args.report.write_text(json.dumps(final_report, indent=2) + "\n", encoding="utf-8")
    print(f"[report] {args.report}")
    print("[done] ceres wreck dressing author-down complete")


if __name__ == "__main__":
    main()
