#!/usr/bin/env python3
"""Three-view stills of the exact wired everyday-yard place GLBs."""
from __future__ import annotations

import math
import sys
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[2]
PLACE_DIR = ROOT / 'assets' / 'ships' / 'parts' / 'places'
OUT_DIR = ROOT / 'assets' / 'ships' / 'npc_work_fleet' / 'evidence' / 'occupational_places'

PLACE_IDS = (
    'place_cargo_pod_standard',
    'place_container_rack',
    'place_conveyor_truss',
    'place_drill_platform',
    'place_extraction_mast',
    'place_freight_platform',
    'place_improvised_dock',
    'place_interdiction_buoy',
    'place_maintenance_gantry',
    'place_radiator_bank',
    'place_scrap_cage',
    'place_sensor_mast',
    'place_slurry_tank',
    'place_transfer_arm',
    'place_transponder_gate',
    'place_worklight_tower',
)


def parse_only():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    if '--only' in argv:
        return argv[argv.index('--only') + 1].strip()
    return None


def clear_scene() -> None:
    try:
        if bpy.context.object and bpy.context.object.mode != 'OBJECT':
            bpy.ops.object.mode_set(mode='OBJECT')
    except Exception:
        pass
    bpy.ops.wm.read_factory_settings(use_empty=True)


def point_at(obj, target) -> None:
    from mathutils import Vector
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat('-Z', 'Y').to_euler()


def add_area(name, location, target, energy, size, color):
    data = bpy.data.lights.new(name, 'AREA')
    data.energy = energy
    data.shape = 'DISK'
    data.size = size
    data.color = color
    light = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(light)
    light.location = location
    point_at(light, target)
    return light


def configure_scene():
    scene = bpy.context.scene
    try:
        scene.render.engine = 'BLENDER_EEVEE_NEXT'
    except Exception:
        scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGB'
    scene.render.film_transparent = False
    try:
        scene.view_settings.look = 'AgX - Medium High Contrast'
    except Exception:
        pass
    world = scene.world or bpy.data.worlds.new('PlaceWorld')
    scene.world = world
    world.use_nodes = True
    background = world.node_tree.nodes.get('Background')
    background.inputs['Color'].default_value = (0.008, 0.012, 0.018, 1.0)
    background.inputs['Strength'].default_value = 0.32
    camera_data = bpy.data.cameras.new('PLACE_CAMERA')
    camera = bpy.data.objects.new('PLACE_CAMERA', camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    add_area('KEY', (3, -9, 13), (0, 0, 0), 2400, 7, (1.0, 0.86, 0.72))
    add_area('FILL', (-7, 10, 6), (-2, 0, 0), 1600, 6, (0.46, 0.64, 1.0))
    add_area('RIM', (-11, -5, -3), (-5, 0, 0), 1900, 5, (1.0, 0.3, 0.14))
    return camera


def bounds(visible):
    from mathutils import Vector
    pts = []
    for obj in visible:
        for corner in obj.bound_box:
            pts.append(obj.matrix_world @ Vector(corner))
    if not pts:
        return 0.0, 0.0, 0.0, 8.0
    cx = (min(v.x for v in pts) + max(v.x for v in pts)) * 0.5
    cy = (min(v.y for v in pts) + max(v.y for v in pts)) * 0.5
    cz = (min(v.z for v in pts) + max(v.z for v in pts)) * 0.5
    span = max(
        max(v.x for v in pts) - min(v.x for v in pts),
        max(v.y for v in pts) - min(v.y for v in pts),
        max(v.z for v in pts) - min(v.z for v in pts),
        2.0,
    )
    return cx, cy, cz, span


def render_place(place_id: str) -> None:
    source = PLACE_DIR / f'{place_id}.glb'
    out_dir = OUT_DIR / place_id
    out_dir.mkdir(parents=True, exist_ok=True)
    clear_scene()
    bpy.ops.import_scene.gltf(filepath=str(source))
    visible = [obj for obj in bpy.data.objects if obj.type == 'MESH' and not obj.get('sf_collision')]
    if not visible:
        raise RuntimeError(f'{source} imported no meshes')
    camera = configure_scene()
    cx, cy, cz, span = bounds(visible)
    target = (cx, cy, cz)
    d = 2.6 * span
    views = {
        'three_quarter': (cx + 0.78 * d, cy - 0.64 * d, cz + 0.42 * d),
        'starboard': (cx + 0.08 * d, cy + 1.05 * d, cz + 0.18 * d),
        'rear': (cx - 1.05 * d, cy - 0.18 * d, cz + 0.28 * d),
    }
    scene = bpy.context.scene
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 720
    camera.data.type = 'PERSP'
    camera.data.lens = 50
    for name, location in views.items():
        camera.location = location
        point_at(camera, target)
        output = out_dir / f'{name}.png'
        scene.render.filepath = str(output)
        bpy.ops.render.render(write_still=True)
        print(f'[place-stills] {output}', flush=True)


def main() -> int:
    only = parse_only()
    ids = [only] if only else list(PLACE_IDS)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for place_id in ids:
        render_place(place_id)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
