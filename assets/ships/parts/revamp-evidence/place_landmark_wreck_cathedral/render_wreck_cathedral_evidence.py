#!/usr/bin/env python3
"""Render reproducible review evidence for the PQ-018 Wreck Cathedral SOURCE_GLB.

The rig and pass materials exist only in the render process; the editable source remains clean.
"""
from __future__ import annotations

import json
import math
import gc
import subprocess
import sys
import time
from hashlib import sha256
from pathlib import Path
from typing import Any

import bpy
from mathutils import Vector


ASSET_ID = "place_landmark_wreck_cathedral"
ROOT = Path(__file__).resolve().parents[5]
EVIDENCE = ROOT / "assets" / "ships" / "parts" / "revamp-evidence" / ASSET_ID
BLEND = ROOT / "assets" / "ships" / "parts" / "blender" / f"{ASSET_ID}.blend"
TEXTURES = EVIDENCE / "textures"
CAPTURES = EVIDENCE / "captures"
REPORTS = EVIDENCE / "reports"
TURNTABLE = EVIDENCE / "turntable"
RESUME = "--resume" in sys.argv


CAMERAS: dict[str, dict[str, Any]] = {
    "close_3q": {"location": (360, -1050, 620), "target": (0, 0, 12), "lens": 58},
    "gameplay_distance": {"location": (780, -1860, 1020), "target": (0, 0, 15), "lens": 65},
    "side": {"location": (0, -1120, 220), "target": (0, 0, 8), "lens": 58},
    "upper_side": {"location": (-210, -1110, 590), "target": (0, 0, 15), "lens": 60},
    "flythrough": {"location": (-500, 70, 30), "target": (155, 20, 15), "lens": 48},
    "propulsion": {"location": (-535, -260, 160), "target": (-220, 22, 4), "lens": 54},
}


def sha256_file(path: Path) -> str:
    digest = sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def point_at(obj: bpy.types.Object, target) -> None:
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def ensure_source_open() -> None:
    if Path(bpy.data.filepath).resolve() != BLEND.resolve():
        bpy.ops.wm.open_mainfile(filepath=str(BLEND))


def reset_review_datablocks() -> bpy.types.Collection:
    old = bpy.data.collections.get("PQ018_REVIEW_ONLY")
    if old:
        for obj in list(old.objects):
            bpy.data.objects.remove(obj, do_unlink=True)
        bpy.data.collections.remove(old)
    for material in list(bpy.data.materials):
        if material.name.startswith("PQ018_PASS_"):
            bpy.data.materials.remove(material)
    collection = bpy.data.collections.new("PQ018_REVIEW_ONLY")
    bpy.context.scene.collection.children.link(collection)
    return collection


def add_light(collection, name, kind, *, location=(0, 0, 0), rotation=(0, 0, 0),
              energy=1.0, color=(1, 1, 1), size=1.0, target=(0, 0, 10)):
    data = bpy.data.lights.new(name, kind)
    data.energy = energy
    data.color = color
    if kind == "AREA":
        data.shape = "DISK"
        data.size = size
    elif kind == "SUN":
        data.angle = size
    obj = bpy.data.objects.new(name, data)
    collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler = rotation
    if kind == "AREA":
        point_at(obj, target)
    return obj


def build_studio() -> bpy.types.Object:
    scene = bpy.context.scene
    collection = reset_review_datablocks()
    camera_data = bpy.data.cameras.new("PQ018_REVIEW_CAMERA")
    camera_data.sensor_width = 36
    camera_data.clip_start = 0.5
    camera_data.clip_end = 5000
    camera = bpy.data.objects.new("PQ018_REVIEW_CAMERA", camera_data)
    collection.objects.link(camera)
    scene.camera = camera

    # Sun keys provide scale-independent form; area sources supply broad reflected color.
    add_light(collection, "PQ018_SUN_KEY", "SUN", rotation=(0.55, -0.48, -0.72),
              energy=3.2, color=(0.72, 0.83, 1.0), size=0.075)
    add_light(collection, "PQ018_SUN_FILL", "SUN", rotation=(2.15, 0.22, 2.48),
              energy=0.95, color=(0.18, 0.31, 0.60), size=0.18)
    add_light(collection, "PQ018_AREA_KEY", "AREA", location=(280, -430, 510),
              energy=28_000_000, color=(0.66, 0.79, 1.0), size=260)
    add_light(collection, "PQ018_AREA_RIM", "AREA", location=(20, 460, 360),
              energy=32_000_000, color=(0.40, 0.62, 1.0), size=250)
    add_light(collection, "PQ018_SUN_FRONT", "SUN", rotation=(1.0697, 0.0, 0.3303),
              energy=1.65, color=(0.72, 0.78, 0.88), size=0.12)
    add_light(collection, "PQ018_AMBER_KICK", "AREA", location=(150, -20, 220),
              energy=3_800_000, color=(1.0, 0.24, 0.035), size=95)

    world = bpy.data.worlds.get("PQ018_REVIEW_WORLD") or bpy.data.worlds.new("PQ018_REVIEW_WORLD")
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (0.0015, 0.003, 0.008, 1)
    background.inputs["Strength"].default_value = 0.16
    scene.world = world

    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1920
    scene.render.resolution_y = 1080
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.film_transparent = False
    scene.view_settings.look = "AgX - Medium High Contrast"
    if hasattr(scene, "eevee"):
        for setting, value in (("taa_samples", 128), ("taa_render_samples", 128)):
            if hasattr(scene.eevee, setting):
                setattr(scene.eevee, setting, value)
    return camera


def set_camera(camera: bpy.types.Object, name: str) -> None:
    spec = CAMERAS[name]
    camera.location = spec["location"]
    camera.data.lens = spec["lens"]
    point_at(camera, spec["target"])


def set_lod(lod: int) -> None:
    for obj in bpy.data.objects:
        if obj.type != "MESH" or not obj.name.startswith("LOD"):
            continue
        active = obj.name.startswith(f"LOD{lod}_")
        obj.hide_render = not active
        obj.hide_viewport = not active
    for level in range(3):
        root = bpy.data.objects.get(f"LOD{level}_ROOT")
        if root:
            root.hide_render = level != lod
            root.hide_viewport = level != lod


def emission_material(name: str, color=(0.5, 0.5, 0.5, 1), strength=1.0) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    emission = nodes.new("ShaderNodeEmission")
    emission.inputs["Color"].default_value = color
    emission.inputs["Strength"].default_value = strength
    links.new(emission.outputs["Emission"], output.inputs["Surface"])
    return material


def wireframe_material() -> bpy.types.Material:
    material = bpy.data.materials.new("PQ018_PASS_Wireframe")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    emission = nodes.new("ShaderNodeEmission")
    wire = nodes.new("ShaderNodeWireframe")
    wire.use_pixel_size = True
    wire.inputs["Size"].default_value = 0.72
    mix = nodes.new("ShaderNodeMixRGB")
    mix.blend_type = "MIX"
    mix.inputs[1].default_value = (0.006, 0.010, 0.016, 1)
    mix.inputs[2].default_value = (0.32, 0.80, 1.0, 1)
    links.new(wire.outputs["Fac"], mix.inputs[0])
    links.new(mix.outputs["Color"], emission.inputs["Color"])
    links.new(emission.outputs["Emission"], output.inputs["Surface"])
    return material


def pass_material(source_name: str, pass_name: str) -> bpy.types.Material:
    material = bpy.data.materials.new(f"PQ018_PASS_{pass_name}_{source_name}")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    emission = nodes.new("ShaderNodeEmission")
    emission.inputs["Strength"].default_value = 1.0
    links.new(emission.outputs["Emission"], output.inputs["Surface"])

    channel = pass_name
    if pass_name in {"ao", "roughness", "metallic"}:
        channel = "orm"
    texture = TEXTURES / f"{source_name}_{channel}.png"
    if not texture.exists():
        emission.inputs["Color"].default_value = (0, 0, 0, 1)
        return material
    image = bpy.data.images.load(str(texture), check_existing=False)
    image.colorspace_settings.name = "sRGB" if pass_name in {"basecolor", "emissive"} else "Non-Color"
    tex_node = nodes.new("ShaderNodeTexImage")
    tex_node.image = image
    tex_node.interpolation = "Linear"
    if pass_name in {"ao", "roughness", "metallic"}:
        separate = nodes.new("ShaderNodeSeparateColor")
        links.new(tex_node.outputs["Color"], separate.inputs["Color"])
        socket = {"ao": "Red", "roughness": "Green", "metallic": "Blue"}[pass_name]
        links.new(separate.outputs[socket], emission.inputs["Color"])
    else:
        links.new(tex_node.outputs["Color"], emission.inputs["Color"])
    return material


def mesh_objects() -> list[bpy.types.Object]:
    return [obj for obj in bpy.data.objects if obj.type == "MESH" and obj.name.startswith("LOD")]


def swap_to_pass(pass_name: str) -> dict[str, bpy.types.Material]:
    replacements: dict[str, bpy.types.Material] = {}
    originals: dict[str, bpy.types.Material] = {}
    for obj in mesh_objects():
        if not obj.data.materials:
            continue
        source = obj.data.materials[0]
        originals[obj.name] = source
        replacement = replacements.get(source.name)
        if replacement is None:
            replacement = pass_material(source.name, pass_name)
            replacements[source.name] = replacement
        obj.data.materials[0] = replacement
    return originals


def restore_materials(originals: dict[str, bpy.types.Material]) -> None:
    for name, material in originals.items():
        obj = bpy.data.objects.get(name)
        if obj and obj.data.materials:
            obj.data.materials[0] = material


def discard_pass_datablocks(pass_name: str) -> None:
    """Release temporary pass graphs/images before compiling the next inspection pass."""
    prefix = f"PQ018_PASS_{pass_name}_"
    for material in list(bpy.data.materials):
        if material.name.startswith(prefix):
            bpy.data.materials.remove(material)
    for image in list(bpy.data.images):
        if image.users == 0:
            bpy.data.images.remove(image)
    gc.collect()


def render_still(camera, filename: str, camera_name: str, *, width=1920, height=1080) -> Path:
    scene = bpy.context.scene
    set_camera(camera, camera_name)
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    output = CAPTURES / filename
    if RESUME and output.exists() and output.stat().st_size > 0:
        print(f"[wreck-cathedral-evidence] resume: keeping {output.name}")
        return output
    scene.render.filepath = str(output)
    bpy.ops.render.render(write_still=True)
    return output


def render_turntable(camera) -> Path:
    scene = bpy.context.scene
    scene.view_layers[0].material_override = None
    set_lod(0)
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 720
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.fps = 30
    scene.frame_start = 1
    scene.frame_end = 60
    target = Vector((0, 0, 12))
    radius = 1220.0
    for frame in range(scene.frame_start, scene.frame_end + 1):
        phase = math.tau * (frame - scene.frame_start) / (scene.frame_end - scene.frame_start + 1)
        camera.location = (math.cos(phase) * radius, math.sin(phase) * radius, 320 + math.sin(phase * 2) * 95)
        point_at(camera, target)
        camera.keyframe_insert(data_path="location", frame=frame)
        camera.keyframe_insert(data_path="rotation_euler", frame=frame)
    action = camera.animation_data.action if camera.animation_data else None
    if action and hasattr(action, "fcurves"):
        for curve in action.fcurves:
            for keyframe in curve.keyframe_points:
                keyframe.interpolation = "LINEAR"
    output = TURNTABLE / "place_landmark_wreck_cathedral_turntable.mp4"
    if RESUME and output.exists() and output.stat().st_size > 0:
        print(f"[wreck-cathedral-evidence] resume: keeping {output.name}")
        return output
    frames = TURNTABLE / "frames"
    frames.mkdir(parents=True, exist_ok=True)
    scene.render.filepath = str(frames / "frame_")
    expected_frames = [frames / f"frame_{frame:04d}.png" for frame in range(1, 61)]
    if not (RESUME and all(path.exists() and path.stat().st_size > 0 for path in expected_frames)):
        bpy.ops.render.render(animation=True)
    subprocess.run([
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
        "-framerate", "30", "-i", str(frames / "frame_%04d.png"),
        "-c:v", "libx264", "-preset", "slow", "-crf", "15",
        "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(output),
    ], check=True)
    for frame in expected_frames:
        frame.unlink(missing_ok=True)
    frames.rmdir()
    return output


def main() -> None:
    started = time.time()
    for directory in (CAPTURES, REPORTS, TURNTABLE):
        directory.mkdir(parents=True, exist_ok=True)
    ensure_source_open()
    camera = build_studio()
    scene = bpy.context.scene
    set_lod(0)
    outputs: list[dict[str, Any]] = []

    # Neutral PBR views.
    scene.view_layers[0].material_override = None
    for filename, camera_name in (
        ("neutral_close_3q.png", "close_3q"),
        ("neutral_gameplay_distance.png", "gameplay_distance"),
        ("neutral_flythrough_cavity.png", "flythrough"),
        ("neutral_propulsion_zone.png", "propulsion"),
    ):
        path = render_still(camera, filename, camera_name)
        outputs.append({"kind": "neutral", "path": str(path.relative_to(ROOT)).replace("\\", "/"),
                        "camera": camera_name})

    # Wireframe views expose construction and density distribution.
    scene.view_layers[0].material_override = wireframe_material()
    for filename, camera_name in (
        ("wireframe_side.png", "side"),
        ("wireframe_3q.png", "close_3q"),
        ("wireframe_flythrough.png", "flythrough"),
    ):
        path = render_still(camera, filename, camera_name)
        outputs.append({"kind": "wireframe", "path": str(path.relative_to(ROOT)).replace("\\", "/"),
                        "camera": camera_name})
    scene.view_layers[0].material_override = None

    # Base color and scalar/detail PBR inspection passes are emission-only and therefore bloom-free.
    for pass_name, camera_name in (
        ("basecolor", "upper_side"),
        ("normal", "close_3q"),
        ("roughness", "upper_side"),
        ("metallic", "upper_side"),
        ("ao", "upper_side"),
        ("emissive", "side"),
    ):
        output_path = CAPTURES / f"pbr_{pass_name}_no_bloom.png"
        if RESUME and output_path.exists() and output_path.stat().st_size > 0:
            outputs.append({"kind": f"pbr_{pass_name}",
                            "path": str(output_path.relative_to(ROOT)).replace("\\", "/"),
                            "camera": camera_name, "bloom": False})
            print(f"[wreck-cathedral-evidence] resume: keeping {output_path.name}")
            continue
        originals = swap_to_pass(pass_name)
        path = render_still(camera, f"pbr_{pass_name}_no_bloom.png", camera_name)
        restore_materials(originals)
        discard_pass_datablocks(pass_name)
        outputs.append({"kind": f"pbr_{pass_name}",
                        "path": str(path.relative_to(ROOT)).replace("\\", "/"),
                        "camera": camera_name, "bloom": False})

    # Fixed side-camera silhouettes make LOD comparison unambiguous.
    silhouette = emission_material("PQ018_PASS_Silhouette", (0.82, 0.88, 0.94, 1), 1.0)
    scene.view_layers[0].material_override = silhouette
    for lod in range(3):
        set_lod(lod)
        path = render_still(camera, f"silhouette_lod{lod}.png", "side")
        outputs.append({"kind": "lod_silhouette", "lod": lod,
                        "path": str(path.relative_to(ROOT)).replace("\\", "/"), "camera": "side"})
    scene.view_layers[0].material_override = None
    set_lod(0)

    turntable = render_turntable(camera)
    outputs.append({"kind": "turntable", "path": str(turntable.relative_to(ROOT)).replace("\\", "/"),
                    "frames": 60, "fps": 30, "resolution": [1280, 720]})

    for output in outputs:
        path = ROOT / output["path"]
        output["bytes"] = path.stat().st_size
        output["sha256"] = sha256_file(path)
    manifest = {
        "schema": "spaceface.wreckCathedralRenderEvidence.v1",
        "assetId": ASSET_ID,
        "sourceBlend": str(BLEND.relative_to(ROOT)).replace("\\", "/"),
        "renderEngine": scene.render.engine,
        "colorManagement": {"viewTransform": scene.view_settings.view_transform,
                            "look": scene.view_settings.look},
        "neutralLighting": "three sun keys plus three broad area sources; dark neutral world",
        "inspectionPasses": "emission-only source maps; no bloom or compositor glare",
        "cameras": CAMERAS,
        "outputs": outputs,
        "elapsedSeconds": round(time.time() - started, 3),
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    (REPORTS / "render_evidence_manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"[wreck-cathedral-evidence] rendered {len(outputs)} outputs in {manifest['elapsedSeconds']}s")


if __name__ == "__main__":
    main()
