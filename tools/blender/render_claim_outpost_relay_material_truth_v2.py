#!/usr/bin/env python3
"""Render the fixed six-view relay material-truth review set.

The camera target, distances, lighting, lens, resolution, and color management match the retained
baseline rig.  This script renders one bounded evidence set and does not save review objects into
the candidate Blend.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUTPUT = (
    ROOT
    / "assets"
    / "ships"
    / "m5_claim_outposts"
    / "evidence"
    / "place_claim_outpost_relay_material_truth_v2"
    / "candidate"
)
REVIEW_COLLECTION = "SF_REVIEW_RIG"
TARGET = Vector((3.3318, 9.9902, 0.0))
VIEWS = {
    "front": TARGET + Vector((0.0, 20.0, 220.0)),
    "rear": TARGET + Vector((0.0, 20.0, -220.0)),
    "side": TARGET + Vector((220.0, 20.0, 0.0)),
    "top": TARGET + Vector((0.1, 230.0, 0.0)),
    "front_three_quarter": TARGET + Vector((150.829557, 98.039234, 150.829559)),
    "rear_three_quarter": TARGET + Vector((-150.829557, 98.039234, -150.829559)),
}


def point_at(obj, target, up="Y"):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", up).to_euler()


def clear_review_rig():
    old = bpy.data.collections.get(REVIEW_COLLECTION)
    if old is None:
        return
    for obj in list(old.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.collections.remove(old)


def link_only(obj, collection):
    for current in list(obj.users_collection):
        current.objects.unlink(obj)
    collection.objects.link(obj)


def configure_scene(output_dir: Path):
    clear_review_rig()
    rig = bpy.data.collections.new(REVIEW_COLLECTION)
    bpy.context.scene.collection.children.link(rig)

    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        visible = obj.name.startswith("LOD0_") and obj.name != "COLLISION_HULL"
        obj.hide_render = not visible

    world = bpy.context.scene.world or bpy.data.worlds.new("SF_REVIEW_WORLD")
    bpy.context.scene.world = world
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (0.003, 0.008, 0.018, 1.0)
    # Neutral review fill keeps non-emissive load paths judgeable from every fixed angle.  The
    # background remains black; this is evidence lighting, not an in-game exposure claim.
    background.inputs["Strength"].default_value = 0.48

    bpy.ops.object.camera_add(location=VIEWS["front"])
    camera = bpy.context.object
    camera.name = "SF_REVIEW_CAMERA"
    camera.data.lens = 58.0
    camera.data.sensor_width = 36.0
    camera.data.dof.use_dof = False
    link_only(camera, rig)
    bpy.context.scene.camera = camera

    lights = (
        ("SF_KEY", (120.0, 150.0, 110.0), 85000.0, (1.0, 0.88, 0.72), 55.0),
        ("SF_FILL", (-100.0, 80.0, 130.0), 42000.0, (0.50, 0.68, 1.0), 65.0),
        ("SF_RIM", (-130.0, 20.0, -100.0), 62000.0, (0.30, 0.55, 1.0), 45.0),
    )
    for name, location, energy, color, size in lights:
        bpy.ops.object.light_add(type="AREA", location=location)
        light = bpy.context.object
        light.name = name
        light.data.energy = energy
        light.data.color = color
        light.data.shape = "DISK"
        light.data.size = size
        point_at(light, TARGET)
        link_only(light, rig)

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 720
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.film_transparent = False
    scene.render.use_file_extension = True
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = 0.85
    output_dir.mkdir(parents=True, exist_ok=True)
    return camera


def render(output_dir: Path):
    camera = configure_scene(output_dir)
    written = []
    for name, location in VIEWS.items():
        camera.location = location
        point_at(camera, TARGET, "X" if name == "top" else "Y")
        path = output_dir / f"{name}.png"
        bpy.context.scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        written.append(str(path))
    return written


def main():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT))
    args = parser.parse_args(argv)
    return {"written": render(Path(args.output_dir).resolve())}


if __name__ == "__main__":
    result = main()
    print(result)
