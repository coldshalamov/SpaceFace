#!/usr/bin/env python3
"""Render matched, no-bloom geological landmark review evidence."""
from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def cli():
    values = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--label", required=True)
    parser.add_argument("--resolution", type=int, default=1100)
    parser.add_argument("--only", nargs="*", default=None)
    return parser.parse_args(values)


def bounds(objects):
    low = Vector((1e9, 1e9, 1e9))
    high = Vector((-1e9, -1e9, -1e9))
    for obj in objects:
        for corner in obj.bound_box:
            point = obj.matrix_world @ Vector(corner)
            for axis in range(3):
                low[axis] = min(low[axis], point[axis])
                high[axis] = max(high[axis], point[axis])
    return low, high


def track(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def visible_meshes():
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    has_lods = any(obj.name.startswith("LOD0_") for obj in meshes)
    visible = []
    for obj in meshes:
        show = obj.name.startswith("LOD0_") if has_lods else True
        obj.hide_render = not show
        obj.hide_viewport = not show
        if show:
            visible.append(obj)
    return visible


def capture_images(materials):
    result = {}
    for material in materials:
        if not material.use_nodes or material.node_tree is None:
            continue
        images = [node.image for node in material.node_tree.nodes if node.type == "TEX_IMAGE" and node.image]
        found = {}
        for image in images:
            value = f"{image.name} {image.filepath}".lower()
            if "normal" in value:
                found["normal"] = image
            elif "orm" in value:
                found["orm"] = image
            elif "basecolor" in value or "base_color" in value or "base color" in value:
                found["basecolor"] = image
        result[material.name] = found
    return result


def emission_material(material, image, fallback):
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


def configure_proof(materials, cache, role):
    fallback = {"basecolor": (0.34, 0.34, 0.34), "normal": (0.5, 0.5, 1.0), "orm": (1.0, 0.58, 0.0)}[role]
    for material in materials:
        emission_material(material, cache.get(material.name, {}).get(role), fallback)


def configure_wire(meshes):
    material = bpy.data.materials.new("SF_WireProof")
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
    mix.blend_type = "MIX"
    mix.inputs[1].default_value = (0.015, 0.018, 0.020, 1.0)
    mix.inputs[2].default_value = (0.72, 0.86, 0.94, 1.0)
    links.new(wire.outputs["Fac"], mix.inputs["Fac"])
    links.new(mix.outputs["Color"], emission.inputs["Color"])
    links.new(emission.outputs["Emission"], output.inputs["Surface"])
    for obj in meshes:
        obj.data.materials.clear()
        obj.data.materials.append(material)


def add_area(name, position, target, energy, color, size):
    bpy.ops.object.light_add(type="AREA", location=position)
    light = bpy.context.object
    light.name = name
    light.data.energy = energy
    light.data.color = color
    light.data.shape = "DISK"
    light.data.size = size
    track(light, target)


def render(scene, camera, output, center, radius, direction, distance_factor, width, height, lens=58):
    direction = Vector(direction).normalized()
    camera.location = center + direction * radius * distance_factor
    camera.data.lens = lens
    track(camera, center)
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.filepath = str(output)
    bpy.ops.render.render(write_still=True)


def main():
    args = cli()
    args.output_dir = args.output_dir.resolve()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    meshes = visible_meshes()
    low, high = bounds(meshes)
    center = (low + high) * 0.5
    radius = max(high - low) * 0.52
    materials = sorted({material for obj in meshes for material in obj.data.materials if material}, key=lambda item: item.name)
    cache = capture_images(materials)

    for obj in list(bpy.context.scene.objects):
        if obj.type in {"CAMERA", "LIGHT"}:
            bpy.data.objects.remove(obj, do_unlink=True)
    world = bpy.context.scene.world or bpy.data.worlds.new("GeologyReviewWorld")
    bpy.context.scene.world = world
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (0.003, 0.004, 0.005, 1.0)
    background.inputs["Strength"].default_value = 0.025

    bpy.ops.object.camera_add(location=center + Vector((0, -radius * 4, radius)))
    camera = bpy.context.object
    camera.name = "SF_GeologyReviewCamera"
    camera.data.sensor_width = 36
    bpy.context.scene.camera = camera
    add_area("SF_Key", center + Vector((-1.8, -2.3, 2.1)) * radius, center, 1250 * radius, (1.0, 0.88, 0.72), radius * 1.2)
    add_area("SF_CoolRim", center + Vector((2.2, 1.2, 0.8)) * radius, center, 740 * radius, (0.50, 0.68, 0.92), radius * 1.0)
    add_area("SF_LowFill", center + Vector((0.2, -1.5, -1.7)) * radius, center, 260 * radius, (0.45, 0.48, 0.52), radius * 1.5)
    add_area("SF_BackReveal", center + Vector((-0.2, 2.4, 1.35)) * radius, center, 540 * radius, (0.60, 0.62, 0.66), radius * 1.55)

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.film_transparent = False
    scene.render.resolution_percentage = 100
    scene.render.use_file_extension = True
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = 0.0

    r = args.resolution
    views = [
        ("close-front3q", (0.55, -1.0, 0.38), 2.55, r, r),
        ("rear3q", (-0.65, 1.0, 0.34), 2.75, r, r),
        ("grazing", (1.10, -1.0, 0.10), 2.45, r, r),
        ("game-max", (0.45, -1.0, 0.48), 3.05, r * 16 // 9, r),
        ("game-default", (0.45, -1.0, 0.48), 5.15, r * 16 // 9, r),
        ("game-far", (0.45, -1.0, 0.48), 8.5, r * 16 // 9, r),
    ]
    outputs = []
    only = set(args.only) if args.only else None
    for name, direction, factor, width, height in views:
        if only is not None and name not in only:
            continue
        target = args.output_dir / f"{args.label}-{name}.png"
        render(scene, camera, target, center, radius, direction, factor, width, height)
        outputs.append(str(target))

    for role in ("basecolor", "normal", "orm"):
        if only is not None and role not in only:
            continue
        configure_proof(materials, cache, role)
        target = args.output_dir / f"{args.label}-{role}.png"
        render(scene, camera, target, center, radius, (0.55, -1.0, 0.38), 2.55, r, r)
        outputs.append(str(target))
    if only is None or "wireframe" in only:
        configure_wire(meshes)
        target = args.output_dir / f"{args.label}-wireframe.png"
        render(scene, camera, target, center, radius, (0.55, -1.0, 0.38), 2.55, r, r)
        outputs.append(str(target))
    manifest = args.output_dir / f"{args.label}-render-manifest.json"
    manifest.write_text(json.dumps({"schema": "spaceface.geologyLandmarkReview.v1", "source": bpy.data.filepath, "label": args.label, "engine": scene.render.engine, "look": scene.view_settings.look, "bloom": False, "world": list(background.inputs["Color"].default_value), "visibleMeshes": [obj.name for obj in meshes], "bounds": {"min": list(low), "max": list(high)}, "outputs": outputs}, indent=2), encoding="utf-8")
    print(json.dumps({"ok": True, "label": args.label, "outputs": len(outputs), "manifest": str(manifest)}))


if __name__ == "__main__":
    main()
