#!/usr/bin/env python3
"""Render matched, no-bloom navigation-infrastructure review evidence.

The harness uses the same cameras and neutral large-area lights for source and
candidate files.  It renders gameplay-distance views, emission-disabled identity,
PBR channel proofs, topology, and deterministic turntable frames without saving
any changes back into the opened BLEND.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
import traceback
from pathlib import Path

import bpy
from mathutils import Vector


def cli() -> argparse.Namespace:
    values = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--label", required=True)
    parser.add_argument("--resolution", type=int, default=960)
    parser.add_argument("--turntable-frames", type=int, default=24)
    parser.add_argument("--turntable-fps", type=int, default=24)
    parser.add_argument("--import-glb", type=Path)
    parser.add_argument("--only", nargs="*")
    return parser.parse_args(values)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def visible_meshes() -> list:
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH" and not obj.name.startswith("COLLISION")]
    has_lod0 = any(obj.name.startswith("LOD0_") for obj in meshes)
    result = []
    for obj in meshes:
        visible = obj.name.startswith("LOD0_") if has_lod0 else not (obj.name.startswith("LOD1_") or obj.name.startswith("LOD2_"))
        obj.hide_render = not visible
        obj.hide_viewport = not visible
        if visible:
            result.append(obj)
    return result


def bounds(objects) -> tuple[Vector, Vector, Vector, float]:
    points = [obj.matrix_world @ Vector(corner) for obj in objects for corner in obj.bound_box]
    low = Vector(tuple(min(point[axis] for point in points) for axis in range(3)))
    high = Vector(tuple(max(point[axis] for point in points) for axis in range(3)))
    center = (low + high) * 0.5
    radius = max(high - low) * 0.52
    return low, high, center, radius


def track(obj, target: Vector) -> None:
    obj.rotation_euler = (target - obj.location).to_track_quat("-Z", "Y").to_euler()


def add_area(name: str, location: Vector, target: Vector, energy: float, size: float, color) -> None:
    data = bpy.data.lights.new(name, "AREA")
    data.energy = energy
    data.shape = "DISK"
    data.size = size
    data.color = color
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = location
    track(obj, target)


def material_images(materials) -> dict:
    cache = {}
    for material in materials:
        found = {}
        if material.use_nodes and material.node_tree:
            for node in material.node_tree.nodes:
                if node.type != "TEX_IMAGE" or not node.image:
                    continue
                text = f"{node.name} {node.image.name} {node.image.filepath}".lower()
                if "basecolor" in text or "base_color" in text:
                    found["basecolor"] = node.image
                elif "normal" in text:
                    found["normal"] = node.image
                elif "orm" in text:
                    found["orm"] = node.image
        cache[material.name] = found
    return cache


def set_emission_strength(materials, strength: float) -> dict:
    saved = {}
    for material in materials:
        if not material.use_nodes or not material.node_tree:
            continue
        for node in material.node_tree.nodes:
            if node.type != "BSDF_PRINCIPLED":
                continue
            socket = node.inputs.get("Emission Strength")
            if socket is not None:
                saved[(material.name, node.name)] = float(socket.default_value)
                socket.default_value = strength
    return saved


def restore_emission(materials, saved: dict) -> None:
    for material in materials:
        if not material.use_nodes or not material.node_tree:
            continue
        for node in material.node_tree.nodes:
            key = (material.name, node.name)
            if key in saved:
                node.inputs["Emission Strength"].default_value = saved[key]


def proof_material(material, image, fallback) -> None:
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    emission = nodes.new("ShaderNodeEmission")
    emission.inputs["Strength"].default_value = 1.0
    if image is not None:
        texture = nodes.new("ShaderNodeTexImage")
        texture.image = image
        texture.interpolation = "Linear"
        links.new(texture.outputs["Color"], emission.inputs["Color"])
    else:
        emission.inputs["Color"].default_value = (*fallback, 1.0)
    links.new(emission.outputs["Emission"], output.inputs["Surface"])


def configure_proof(materials, cache, role: str) -> None:
    fallback = {"basecolor": (0.34, 0.34, 0.34), "normal": (0.5, 0.5, 1.0), "orm": (1.0, 0.58, 0.0)}[role]
    for material in materials:
        proof_material(material, cache.get(material.name, {}).get(role), fallback)


def configure_wire(meshes) -> None:
    material = bpy.data.materials.new("SF_Navigation_Wire_Proof")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    emission = nodes.new("ShaderNodeEmission")
    wire = nodes.new("ShaderNodeWireframe")
    wire.use_pixel_size = True
    wire.inputs["Size"].default_value = 0.75
    mix = nodes.new("ShaderNodeMixRGB")
    mix.inputs[1].default_value = (0.012, 0.016, 0.020, 1.0)
    mix.inputs[2].default_value = (0.68, 0.84, 0.91, 1.0)
    links.new(wire.outputs["Fac"], mix.inputs["Fac"])
    links.new(mix.outputs["Color"], emission.inputs["Color"])
    links.new(emission.outputs["Emission"], output.inputs["Surface"])
    for obj in meshes:
        obj.data.materials.clear()
        obj.data.materials.append(material)


def render(scene, camera, target: Path, center: Vector, radius: float, direction, distance: float, width: int, height: int) -> None:
    camera.location = center + Vector(direction).normalized() * radius * distance
    camera.data.lens = 58
    track(camera, center)
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.filepath = str(target)
    bpy.ops.render.render(write_still=True)


def main() -> None:
    args = cli()
    args.output_dir = args.output_dir.resolve()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    if args.import_glb:
        source_path = args.import_glb.resolve()
        bpy.ops.import_scene.gltf(filepath=str(source_path))
    else:
        source_path = Path(bpy.data.filepath)
    only = set(args.only) if args.only else None
    meshes = visible_meshes()
    if not meshes:
        raise RuntimeError("No visible meshes")
    low, high, center, radius = bounds(meshes)
    materials = sorted({slot.material for obj in meshes for slot in obj.material_slots if slot.material}, key=lambda value: value.name)
    image_cache = material_images(materials)

    for obj in list(bpy.context.scene.objects):
        if obj.type in {"CAMERA", "LIGHT"}:
            bpy.data.objects.remove(obj, do_unlink=True)

    world = bpy.context.scene.world or bpy.data.worlds.new("NavigationReviewWorld")
    bpy.context.scene.world = world
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (0.0025, 0.0032, 0.0040, 1.0)
    background.inputs["Strength"].default_value = 0.022

    add_area("SF_Key", center + Vector((-1.9, -2.4, 2.2)) * radius, center, 1280 * radius, 1.30 * radius, (1.0, 0.83, 0.66))
    add_area("SF_CoolFill", center + Vector((2.0, -0.6, 0.5)) * radius, center, 460 * radius, 1.70 * radius, (0.46, 0.65, 0.86))
    add_area("SF_Rim", center + Vector((1.5, 2.0, 1.5)) * radius, center, 720 * radius, 1.15 * radius, (0.38, 0.57, 0.78))
    add_area("SF_LowReveal", center + Vector((-0.3, 1.1, -1.4)) * radius, center, 250 * radius, 1.55 * radius, (0.55, 0.50, 0.44))

    bpy.ops.object.camera_add()
    camera = bpy.context.object
    camera.name = "SF_NavigationReviewCamera"
    camera.data.sensor_width = 36
    bpy.context.scene.camera = camera

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.film_transparent = False
    scene.use_nodes = False
    # Blender 5 can expose either the legacy prefixed look names or the compact
    # names depending on the OCIO configuration stored by the opened file.
    look_items = {item.identifier for item in scene.view_settings.bl_rna.properties["look"].enum_items}
    for preferred in ("Medium High Contrast", "AgX - Medium High Contrast", "High Contrast", "AgX - High Contrast"):
        if preferred in look_items:
            scene.view_settings.look = preferred
            break
    scene.view_settings.exposure = 0.0

    r = args.resolution
    actual_views = [
        ("close", (0.72, -1.0, 0.40), 2.70, r, r),
        ("default", (0.55, -1.0, 0.52), 5.30, r * 16 // 9, r),
        ("far", (0.55, -1.0, 0.52), 8.80, r * 16 // 9, r),
        ("grazing", (1.15, -1.0, 0.10), 2.85, r, r),
    ]
    outputs = []
    for name, direction, distance, width, height in actual_views:
        if only is not None and name not in only:
            continue
        target = args.output_dir / f"{args.label}-{name}.png"
        render(scene, camera, target, center, radius, direction, distance, width, height)
        outputs.append(target)

    if only is None or "emissive-disabled" in only:
        saved = set_emission_strength(materials, 0.0)
        target = args.output_dir / f"{args.label}-emissive-disabled.png"
        render(scene, camera, target, center, radius, (0.72, -1.0, 0.40), 2.70, r, r)
        outputs.append(target)
        restore_emission(materials, saved)

    if only is None or "turntable" in only:
        frames = args.output_dir / "turntable-frames"
        frames.mkdir(parents=True, exist_ok=True)
        for frame in range(args.turntable_frames):
            angle = math.tau * frame / args.turntable_frames
            direction = (math.cos(angle), math.sin(angle), 0.34)
            target = frames / f"{args.label}-turntable-{frame:03d}.png"
            render(scene, camera, target, center, radius, direction, 2.95, r, r)
            outputs.append(target)

    for role in ("basecolor", "normal", "orm"):
        if only is not None and role not in only:
            continue
        configure_proof(materials, image_cache, role)
        target = args.output_dir / f"{args.label}-{role}.png"
        render(scene, camera, target, center, radius, (0.72, -1.0, 0.40), 2.70, r, r)
        outputs.append(target)

    if only is None or "wireframe" in only:
        configure_wire(meshes)
        target = args.output_dir / f"{args.label}-wireframe.png"
        render(scene, camera, target, center, radius, (0.72, -1.0, 0.40), 2.70, r, r)
        outputs.append(target)

    manifest = args.output_dir / f"{args.label}-render-manifest.json"
    manifest.write_text(json.dumps({
        "schema": "spaceface.navigationInfrastructureReview.v1",
        "status": "candidate-evidence",
        "source": str(source_path),
        "sourceSha256": sha256(source_path),
        "label": args.label,
        "blender": bpy.app.version_string,
        "engine": scene.render.engine,
        "look": scene.view_settings.look,
        "bloom": False,
        "compositor": False,
        "world": list(background.inputs["Color"].default_value),
        "bounds": {"min": list(low), "max": list(high)},
        "visibleMeshes": [obj.name for obj in meshes],
        "turntable": {"frames": args.turntable_frames, "fps": args.turntable_fps},
        "outputs": [{"path": str(path), "sha256": sha256(path), "bytes": path.stat().st_size} for path in outputs],
    }, indent=2), encoding="utf-8")
    print(json.dumps({"ok": True, "label": args.label, "outputs": len(outputs), "manifest": str(manifest)}))


if __name__ == "__main__":
    try:
        main()
    except Exception:
        traceback.print_exc()
        sys.exit(2)
