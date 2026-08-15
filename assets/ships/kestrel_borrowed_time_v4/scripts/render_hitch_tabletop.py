"""Re-render Hitch V24 from the real tabletop camera.

Blender is Z-up. Gameplay is Y-up with the glass on XZ. The 60-degree
chase camera sits above and aft: Blender (+Z up, +X forward) that is
(-d cos tilt, 0, d sin tilt).
"""
from __future__ import annotations

import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

FAMILY = Path(__file__).resolve().parents[1]
GLB = FAMILY / "source_candidates" / "hitch_hero_v24" / "wholeships" / "kestrel_borrowed_time_v4_lod0.glb"
EVIDENCE = FAMILY / "evidence" / "hitch" / "cycles" / "cycle_15"


def look_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def visible_center():
    mins = Vector((1e9, 1e9, 1e9))
    maxs = Vector((-1e9, -1e9, -1e9))
    count = 0
    for obj in bpy.data.objects:
        if obj.type != "MESH" or obj.hide_render:
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
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = 1.05
    world = bpy.data.worlds.new("V24TableWorld")
    world.color = (0.004, 0.005, 0.007)
    scene.world = world
    center, span = visible_center()
    tilt = math.radians(60.0)
    table_d = max(span * 1.45, 28.0)
    play_d = max(span * 2.45, 46.0)
    # Blender Z-up equivalent of gameplay (0, d sin tilt, -d cos tilt) Y-up.
    table_loc = center + Vector((-table_d * math.cos(tilt), 0.15 * span, table_d * math.sin(tilt)))
    play_loc = center + Vector((-play_d * math.cos(tilt), 0.12 * span, play_d * math.sin(tilt)))
    high_3q = center + Vector((span * 0.85, -span * 0.95, span * 0.95))
    cam_data = bpy.data.cameras.new("V24TableCam")
    camera = bpy.data.objects.new("V24TableCam", cam_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    for name, loc, energy, color, size in (
        ("Key", tuple(center + Vector((span * 0.7, -span * 1.0, span * 1.1))), 9000, (0.88, 0.92, 1), 11),
        ("Fill", tuple(center + Vector((span * 0.2, span * 0.9, span * 0.7))), 3400, (0.55, 0.62, 0.72), 9),
        ("Down", tuple(center + Vector((0.0, 0.0, span * 1.6))), 4200, (0.82, 0.86, 0.92), 14),
        ("Rim", tuple(center + Vector((-span * 1.0, -span * 0.2, span * 0.4))), 3000, (0.70, 0.78, 0.90), 7),
    ):
        data = bpy.data.lights.new(name, "AREA")
        data.energy = energy
        data.color = color
        data.size = size
        obj = bpy.data.objects.new(name, data)
        scene.collection.objects.link(obj)
        obj.location = loc
        look_at(obj, tuple(center))
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    shots = {
        "tabletop.png": (table_loc, center, math.radians(50.0)),
        "play_size.png": (play_loc, center, math.radians(50.0)),
        "tabletop_high3q.png": (high_3q, center + Vector((0, 0, 0.2)), math.radians(48.0)),
    }
    for name, (loc, target, angle) in shots.items():
        camera.location = loc
        camera.data.lens_unit = "FOV"
        camera.data.angle = angle
        look_at(camera, tuple(target))
        path = EVIDENCE / name
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        print(f"wrote {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
