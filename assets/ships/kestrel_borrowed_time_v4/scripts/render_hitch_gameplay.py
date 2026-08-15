"""Render a Hitch candidate from the real default gameplay camera.

DEFAULT_ZOOM is 144, tilt 60, fov 50. Cycle stills used span*1.55 (~45)
and called that tabletop. That is a close-up, not the live table.
"""
from __future__ import annotations

import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

FAMILY = Path(__file__).resolve().parents[1]
GLB = FAMILY / "source_candidates" / "hitch_hero_v39" / "wholeships" / "kestrel_borrowed_time_v4_lod0.glb"
EVIDENCE = FAMILY / "evidence" / "hitch" / "cycles" / "cycle_30"
GAMEPLAY_ZOOM = 144.0
TILT = math.radians(60.0)
FOV = math.radians(50.0)


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
    center = (mins + maxs) * 0.5
    span = max(maxs.x - mins.x, maxs.y - mins.y, maxs.z - mins.z, 8.0)
    return center, span


def main() -> int:
    if not GLB.exists():
        raise SystemExit(f"missing candidate {GLB}")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(GLB))
    for obj in bpy.data.objects:
        name = (obj.name or "").upper()
        data_name = (obj.data.name if obj.data else "") or ""
        if "COLLISION" in name or "COLLISION" in data_name.upper():
            obj.hide_render = True
            obj.hide_set(True)
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
    world = bpy.data.worlds.new("GameplayWorld")
    world.color = (0.004, 0.005, 0.007)
    scene.world = world
    center, span = visible_center()
    d = GAMEPLAY_ZOOM
    loc = center + Vector((-d * math.cos(TILT), 0.10 * span, d * math.sin(TILT)))
    cam_data = bpy.data.cameras.new("GameplayCam")
    cam_data.lens_unit = "FOV"
    cam_data.angle = FOV
    camera = bpy.data.objects.new("GameplayCam", cam_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    camera.location = loc
    look_at(camera, tuple(center))
    for name, light_loc, energy, color, size in (
        ("GKey", tuple(center + Vector((span * 0.9, -span * 1.1, span * 0.7))), 8200, (0.88, 0.92, 1), 10),
        ("GFill", tuple(center + Vector((span * 0.2, span * 0.9, span * 0.45))), 3200, (0.55, 0.62, 0.72), 8),
        ("GDown", tuple(center + Vector((0.0, 0.0, span * 1.6))), 4200, (0.80, 0.84, 0.90), 14),
    ):
        data = bpy.data.lights.new(name, "AREA")
        data.energy = energy
        data.color = color
        data.size = size
        obj = bpy.data.objects.new(name, data)
        scene.collection.objects.link(obj)
        obj.location = light_loc
        look_at(obj, tuple(center))
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    path = EVIDENCE / "gameplay.png"
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    print(json_dumps := __import__("json").dumps({
        "ok": True,
        "path": str(path),
        "zoom": GAMEPLAY_ZOOM,
        "span": span,
    }))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
