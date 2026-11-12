"""Render live starter, Dart, and Hornet from the real default camera."""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

FAMILY = Path(__file__).resolve().parents[1]
ROOT = FAMILY.parents[2]
OUT = FAMILY / "evidence" / "hitch" / "cycles" / "compare_gameplay"
GAMEPLAY_ZOOM = 144.0
TILT = math.radians(60.0)
FOV = math.radians(50.0)

SHIPS = (
    ("kestrel_live_v9.png", ROOT / "assets" / "ships" / "parts" / "wholeships" / "kestrel.glb"),
    ("dart_production.png", ROOT / "assets" / "ships" / "fleet_player_bodies_v1" / "ashline_dart" / "source" / "wholeships" / "ashline_dart_production_v1_lod0.glb"),
    ("hornet_production.png", ROOT / "assets" / "ships" / "fleet_player_bodies_v1" / "hornet" / "source" / "wholeships" / "hornet_production_v1_lod0.glb"),
)


def look_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def visible_center():
    mins = Vector((1e9, 1e9, 1e9))
    maxs = Vector((-1e9, -1e9, -1e9))
    count = 0
    for obj in bpy.data.objects:
        if obj.type != "MESH" or obj.hide_render:
            continue
        name = (obj.name or "").upper()
        if "COLLISION" in name:
            continue
        for corner in obj.bound_box:
            world = obj.matrix_world @ Vector(corner)
            mins.x = min(mins.x, world.x)
            mins.y = min(mins.y, world.y)
            mins.z = min(mins.z, world.z)
            maxs.x = max(maxs.x, world.x)
            maxs.y = max(maxs.y, world.y)
            maxs.z = max(maxs.z, world.z)
            count += 1
    if count == 0:
        return Vector((0, 0, 0.8)), 16.0
    return (mins + maxs) * 0.5, max(maxs.x - mins.x, maxs.y - mins.y, maxs.z - mins.z, 8.0)


def clear_meshes():
    keep = {"CompareCam", "CompareKey"}
    for obj in list(bpy.data.objects):
        if obj.name in keep:
            continue
        bpy.data.objects.remove(obj, do_unlink=True)
    for mesh in list(bpy.data.meshes):
        if mesh.users == 0:
            bpy.data.meshes.remove(mesh)


def render_one(path: Path, dest: Path):
    bpy.ops.import_scene.gltf(filepath=str(path))
    for obj in bpy.data.objects:
        name = (obj.name or "").upper()
        data_name = (obj.data.name if obj.data else "") or ""
        if "COLLISION" in name or "COLLISION" in data_name.upper():
            obj.hide_render = True
            obj.hide_set(True)
    scene = bpy.context.scene
    center, span = visible_center()
    d = GAMEPLAY_ZOOM
    loc = center + Vector((-d * math.cos(TILT), 0.10 * span, d * math.sin(TILT)))
    cam = scene.camera
    cam.location = loc
    cam.data.lens_unit = "FOV"
    cam.data.angle = FOV
    look_at(cam, tuple(center))
    scene.render.filepath = str(dest)
    bpy.ops.render.render(write_still=True)
    clear_meshes()


def main() -> int:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    try:
        scene.render.engine = "BLENDER_EEVEE"
    except TypeError:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 900
    scene.render.image_settings.file_format = "PNG"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = 1.05
    world = bpy.data.worlds.new("CompareWorld")
    world.color = (0.004, 0.005, 0.007)
    scene.world = world
    cam_data = bpy.data.cameras.new("CompareCam")
    camera = bpy.data.objects.new("CompareCam", cam_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    key = bpy.data.lights.new("CompareKey", "AREA")
    key.energy = 8200
    key.color = (0.88, 0.92, 1)
    key.size = 10
    key_obj = bpy.data.objects.new("CompareKey", key)
    scene.collection.objects.link(key_obj)
    key_obj.location = (20, -24, 18)
    OUT.mkdir(parents=True, exist_ok=True)
    written = []
    for name, src in SHIPS:
        if not src.exists():
            raise SystemExit(f"missing {src}")
        dest = OUT / name
        render_one(src, dest)
        written.append(str(dest))
    print(json.dumps({"ok": True, "zoom": GAMEPLAY_ZOOM, "written": written}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
