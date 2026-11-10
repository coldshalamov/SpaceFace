#!/usr/bin/env python3
"""Emit a deterministic material/UV/mesh audit for the currently opened Blender file.

Usage:
  blender asset.blend --background --python tools/blender/inspect_surface_roles.py -- output.json
  blender candidate.blend --background --python tools/blender/inspect_surface_roles.py -- output.json --strict
"""
from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from tools.blender.surface_export_contract import measure_tangent_vectors  # noqa: E402


def _args() -> list[str]:
    return sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []


def _file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def _socket(value):
    if value is None:
        return None
    linked = value.links[0].from_node.name if value.is_linked and value.links else None
    default = value.default_value
    if hasattr(default, "__len__") and not isinstance(default, str):
        default = [float(item) for item in default]
    elif isinstance(default, (int, float)):
        default = float(default)
    else:
        default = str(default)
    return {"linkedFrom": linked, "default": default}


def _upstream_image_node(socket, visited=None):
    if socket is None or not socket.is_linked or not socket.links:
        return None
    visited = set() if visited is None else visited
    links = sorted(socket.links, key=lambda link: (link.from_node.name, link.from_socket.name))
    for link in links:
        node = link.from_node
        pointer = node.as_pointer()
        if pointer in visited:
            continue
        visited.add(pointer)
        if node.type == "TEX_IMAGE":
            return node
        for input_socket in node.inputs:
            image = _upstream_image_node(input_socket, visited)
            if image is not None:
                return image
    return None


def _texture_source(socket):
    direct_link = socket.links[0] if socket is not None and socket.is_linked and socket.links else None
    image_node = _upstream_image_node(socket)
    return {
        "directNode": direct_link.from_node.name if direct_link else None,
        "channel": direct_link.from_socket.name if direct_link else None,
        "imageNode": image_node.name if image_node else None,
        "image": image_node.image.name if image_node and image_node.image else None,
    }


def _orm_binding(nodes, principled):
    if principled is None:
        return None
    metallic = _texture_source(principled.inputs.get("Metallic"))
    roughness = _texture_source(principled.inputs.get("Roughness"))
    group_nodes = sorted((
        node for node in nodes
        if node.type == "GROUP"
        and node.node_tree is not None
        and node.node_tree.name == "glTF Material Output"
    ), key=lambda node: node.name)
    occlusion = _texture_source(group_nodes[0].inputs.get("Occlusion")) if len(group_nodes) == 1 else {
        "directNode": None, "channel": None, "imageNode": None, "image": None,
    }
    image_nodes = {metallic["imageNode"], roughness["imageNode"], occlusion["imageNode"]}
    images = {metallic["image"], roughness["image"], occlusion["image"]}
    orm_image = roughness["image"] or metallic["image"]
    complete = (
        len(group_nodes) == 1
        and None not in image_nodes
        and len(image_nodes) == 1
        and None not in images
        and len(images) == 1
        and occlusion["channel"] == "Red"
        and roughness["channel"] == "Green"
        and metallic["channel"] == "Blue"
        and orm_image is not None
        and "orm" in Path(orm_image).stem.lower()
    )
    return {
        "ormImage": orm_image,
        "occlusion": occlusion,
        "roughness": roughness,
        "metallic": metallic,
        "gltfOutputNodes": [node.name for node in group_nodes],
        "sharedImageNode": len(image_nodes) == 1 and None not in image_nodes,
        "complete": complete,
    }


def _material(material):
    nodes = material.node_tree.nodes if material.use_nodes and material.node_tree else []
    principled = next((node for node in nodes if node.type == "BSDF_PRINCIPLED"), None)
    image_nodes = []
    for node in nodes:
        if node.type != "TEX_IMAGE":
            continue
        image = node.image
        image_nodes.append({
            "node": node.name,
            "image": image.name if image else None,
            "source": image.source if image else None,
            "size": [int(image.size[0]), int(image.size[1])] if image else None,
            "packed": bool(image and image.packed_file),
            "colorspace": image.colorspace_settings.name if image else None,
            "interpolation": node.interpolation,
            "projection": node.projection,
        })
    inputs = {}
    if principled:
        for name in ("Base Color", "Metallic", "Roughness", "Alpha", "Emission Color", "Emission Strength", "Normal"):
            inputs[name] = _socket(principled.inputs.get(name))
    return {
        "name": material.name,
        "users": int(material.users),
        "blendMethod": getattr(material, "surface_render_method", None),
        "principled": inputs,
        "images": image_nodes,
        "nodeTypes": sorted(node.type for node in nodes),
        "ormBinding": _orm_binding(nodes, principled),
    }


def _modifier(modifier):
    item = {
        "name": modifier.name,
        "type": modifier.type,
        "showRender": bool(modifier.show_render),
    }
    for attribute in (
        "width",
        "segments",
        "limit_method",
        "angle_limit",
        "harden_normals",
        "thickness",
        "offset",
        "ratio",
        "decimate_type",
        "use_axis",
        "use_clip",
        "use_mirror_merge",
    ):
        if not hasattr(modifier, attribute):
            continue
        value = getattr(modifier, attribute)
        if isinstance(value, (bool, int, float, str)):
            item[attribute] = value
        elif hasattr(value, "__iter__"):
            item[attribute] = list(value)
    return item


def _world_bounds(obj):
    if obj.type != "MESH" or not obj.bound_box:
        return None
    corners = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    lower = [min(corner[axis] for corner in corners) for axis in range(3)]
    upper = [max(corner[axis] for corner in corners) for axis in range(3)]
    return {"min": lower, "max": upper}


def _object(obj):
    data = obj.data if obj.type == "MESH" else None
    triangles = 0
    polygons = 0
    vertices = 0
    uv_layers = []
    topology = {"triangles": 0, "quads": 0, "ngons": 0}
    tangent_ready = None
    tangent_error = None
    tangent_stats = None
    if data:
        data.calc_loop_triangles()
        triangles = len(data.loop_triangles)
        polygons = len(data.polygons)
        vertices = len(data.vertices)
        uv_layers = [layer.name for layer in data.uv_layers]
        for polygon in data.polygons:
            vertex_count = len(polygon.vertices)
            if vertex_count == 3:
                topology["triangles"] += 1
            elif vertex_count == 4:
                topology["quads"] += 1
            elif vertex_count > 4:
                topology["ngons"] += 1
        if uv_layers:
            try:
                data.calc_tangents(uvmap=uv_layers[0])
                tangent_stats = measure_tangent_vectors(loop.tangent for loop in data.loops)
                tangent_ready = bool(tangent_stats["valid"])
            except Exception as error:
                tangent_ready = False
                tangent_error = str(error)
                tangent_stats = {
                    "total": len(data.loops),
                    "zero": 0,
                    "nonFinite": 0,
                    "nonUnit": 0,
                    "invalid": max(1, len(data.loops)),
                    "minLength": None,
                    "maxLength": None,
                    "valid": False,
                    "error": tangent_error,
                }
            finally:
                try:
                    data.free_tangents()
                except Exception:
                    pass
    scale = [float(value) for value in obj.scale]
    determinant = float(obj.matrix_world.to_3x3().determinant())
    return {
        "name": obj.name,
        "type": obj.type,
        "meshDataName": data.name if data else None,
        "vertices": vertices,
        "polygons": polygons,
        "triangles": triangles,
        "uvLayers": uv_layers,
        "topology": topology,
        "tangentReady": tangent_ready,
        "tangentError": tangent_error,
        "tangentStats": tangent_stats,
        "transform": {
            "location": [float(value) for value in obj.location],
            "rotationEuler": [float(value) for value in obj.rotation_euler],
            "scale": scale,
            "scaleApplied": all(abs(value - 1.0) <= 1e-5 for value in scale),
            "negativeDeterminant": determinant < 0.0,
            "dimensions": [float(value) for value in obj.dimensions],
        },
        "materialSlots": [slot.material.name if slot.material else None for slot in obj.material_slots],
        "modifiers": [_modifier(mod) for mod in obj.modifiers],
        "collections": sorted(collection.name for collection in obj.users_collection),
        "parent": obj.parent.name if obj.parent else None,
        "worldBounds": _world_bounds(obj),
        "customProperties": {
            key: obj[key]
            for key in sorted(obj.keys())
            if key != "_RNA_UI" and isinstance(obj[key], (bool, int, float, str))
        },
        "hiddenRender": bool(obj.hide_render),
    }


def main() -> None:
    args = _args()
    strict = "--strict" in args
    paths = [item for item in args if item != "--strict"]
    if len(paths) != 1:
        raise SystemExit("expected output JSON path and optional --strict after --")
    source = Path(bpy.data.filepath).resolve()
    output = Path(paths[0]).resolve()
    objects = [_object(obj) for obj in bpy.data.objects]
    meshes = [item for item in objects if item["type"] == "MESH"]
    materials = [_material(material) for material in sorted(bpy.data.materials, key=lambda item: item.name)]
    tangent_failures = sorted(
        item["name"] for item in meshes
        if item["tangentStats"] is not None and not item["tangentStats"]["valid"]
    )
    ao_failures = sorted(
        item["name"] for item in materials
        if item["users"] > 0
        and item["ormBinding"] is not None
        and item["ormBinding"]["ormImage"] is not None
        and not item["ormBinding"]["complete"]
    )
    mirror_failures = sorted(
        item["name"] for item in meshes
        if any(modifier["type"] == "MIRROR" and modifier["showRender"] for modifier in item["modifiers"])
    )
    transient_mesh_names = sorted(
        item["name"] for item in meshes if str(item["meshDataName"] or "").startswith(".temp")
    )
    validation = {
        "ok": not tangent_failures and not ao_failures and not mirror_failures and not transient_mesh_names,
        "strict": strict,
        "tangentFailureObjects": tangent_failures,
        "aoBindingFailureMaterials": ao_failures,
        "renderMirrorObjects": mirror_failures,
        "transientMeshDataObjects": transient_mesh_names,
    }
    report = {
        "schema": "spaceface.blenderSurfaceAudit.v2",
        "source": str(source),
        "sourceSha256": _file_sha256(source),
        "blenderVersion": bpy.app.version_string,
        "scene": bpy.context.scene.name if bpy.context.scene else None,
        "units": {
            "system": bpy.context.scene.unit_settings.system,
            "scaleLength": float(bpy.context.scene.unit_settings.scale_length),
            "lengthUnit": bpy.context.scene.unit_settings.length_unit,
        },
        "collections": [{
            "name": collection.name,
            "objects": sorted(obj.name for obj in collection.objects),
            "children": sorted(child.name for child in collection.children),
        } for collection in sorted(bpy.data.collections, key=lambda item: item.name)],
        "counts": {
            "objects": len(objects),
            "meshes": len(meshes),
            "triangles": sum(item["triangles"] for item in meshes if not item["hiddenRender"]),
            "materials": len(bpy.data.materials),
            "images": len(bpy.data.images),
            "unappliedScaleMeshes": sum(
                1 for item in meshes if not item["hiddenRender"] and not item["transform"]["scaleApplied"]
            ),
            "tangentFailureMeshes": sum(
                1 for item in meshes if item["tangentStats"] is not None and not item["tangentStats"]["valid"]
            ),
            "zeroTangents": sum(
                item["tangentStats"]["zero"] for item in meshes if item["tangentStats"] is not None
            ),
            "nonFiniteTangents": sum(
                item["tangentStats"]["nonFinite"] for item in meshes if item["tangentStats"] is not None
            ),
            "nonUnitTangents": sum(
                item["tangentStats"]["nonUnit"] for item in meshes if item["tangentStats"] is not None
            ),
            "aoBindingFailureMaterials": len(ao_failures),
            "renderMirrorMeshes": len(mirror_failures),
            "transientMeshDataNames": len(transient_mesh_names),
        },
        "materials": materials,
        "images": [{
            "name": image.name,
            "size": [int(image.size[0]), int(image.size[1])],
            "packed": bool(image.packed_file),
            "filepath": image.filepath,
            "colorspace": image.colorspace_settings.name,
        } for image in sorted(bpy.data.images, key=lambda item: item.name)],
        "objects": objects,
        "validation": validation,
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({
        "ok": validation["ok"], "output": str(output), "counts": report["counts"],
        "validation": validation,
    }))
    if strict and not validation["ok"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
