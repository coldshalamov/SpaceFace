#!/usr/bin/env python3
"""Chase stills for mining-barge wreck via spaceface_chase_camera.py.

Hero wrecks (~60–200 m) overfill D=144. Distances are scaled so frame occupancy
stays near the play band, while pose math is still the live chase camera.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import bpy
from mathutils import Vector

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))
from spaceface_chase_camera import (  # noqa: E402
    DISTANCE_CLOSE,
    DISTANCE_DEFAULT,
    PLAY_CHASE_CLOSE_WIDTH_FRAC,
    PLAY_CHASE_WIDTH_FRAC,
    apply_chase_camera,
    render_chase_still,
)

# Reference ship length used by fleet chase stills for occupancy.
REF_LENGTH_M = 16.0


def parse_args(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument('--glb', type=Path, required=True)
    ap.add_argument('--out', type=Path, required=True)
    ap.add_argument('--samples', type=int, default=24)
    return ap.parse_args(argv)


def mesh_bounds(meshes):
    lo = Vector((1e12, 1e12, 1e12))
    hi = Vector((-1e12, -1e12, -1e12))
    for obj in meshes:
        for corner in obj.bound_box:
            p = obj.matrix_world @ Vector(corner)
            for i in range(3):
                lo[i] = min(lo[i], p[i])
                hi[i] = max(hi[i], p[i])
    return lo, hi, (lo + hi) * 0.5, hi - lo


def setup_studio(focus, light_scale, samples):
    scene = bpy.context.scene
    try:
        scene.render.engine = 'BLENDER_EEVEE'
    except TypeError:
        scene.render.engine = 'BLENDER_EEVEE_NEXT'
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 900
    scene.render.image_settings.file_format = 'PNG'
    scene.render.film_transparent = False
    try:
        scene.view_settings.look = 'AgX - Medium Contrast'
    except TypeError:
        pass
    scene.view_settings.exposure = 1.15
    eevee = getattr(scene, 'eevee', None)
    if eevee:
        for attr, val in (
            ('use_ssr', True),
            ('use_ssr_refraction', True),
            ('use_raytracing', True),
            ('use_shadows', True),
        ):
            if hasattr(eevee, attr):
                try:
                    setattr(eevee, attr, val)
                except Exception:
                    pass
    world = scene.world or bpy.data.worlds.new('ChaseWorld')
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get('Background')
    bg.inputs['Color'].default_value = (0.045, 0.050, 0.058, 1)
    bg.inputs['Strength'].default_value = 2.4
    for obj in list(scene.objects):
        if obj.type in {'CAMERA', 'LIGHT'}:
            bpy.data.objects.remove(obj, do_unlink=True)
    cam_data = bpy.data.cameras.new('CycleCam')
    camera = bpy.data.objects.new('CycleCam', cam_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    for name, loc, energy, color, size in (
        ('Key', (16, -18, 12), 900, (0.94, 0.96, 1), 22),
        ('Fill', (4, 16, 8), 1400, (0.76, 0.80, 0.84), 20),
        ('Top', (2, 2, 16), 1000, (0.88, 0.90, 0.94), 18),
        ('Rim', (-14, -5, 7), 900, (0.78, 0.84, 0.92), 14),
        ('Kick', (-6, 10, -4), 400, (0.74, 0.78, 0.84), 12),
        ('AftFill', (-10, -12, 8), 600, (0.80, 0.84, 0.90), 16),
        ('StbdFill', (0.9, 12.0, 3.8), 700, (0.88, 0.90, 0.94), 18),
    ):
        data = bpy.data.lights.new(name, 'AREA')
        data.energy = energy * light_scale
        data.color = color
        data.size = size * light_scale
        lamp = bpy.data.objects.new(name, data)
        scene.collection.objects.link(lamp)
        lamp.location = Vector(focus) + Vector(tuple(c * light_scale for c in loc))
        direction = Vector(focus) - lamp.location
        lamp.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    return camera


def main():
    args = parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    glb = args.glb.resolve()
    out = args.out.resolve()
    out.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(glb))
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    if not meshes:
        raise SystemExit('no meshes')
    lo, hi, center, size = mesh_bounds(meshes)
    size_max = float(max(size))
    # Scale chase D so wreck occupancy ≈ fleet play band (~0.12–0.18 of frame width).
    scale = max(size_max / REF_LENGTH_M, 1.0)
    d_play = DISTANCE_DEFAULT * scale
    d_close = DISTANCE_CLOSE * scale
    light_scale = size_max / REF_LENGTH_M
    camera = setup_studio(tuple(center), light_scale, args.samples)
    # Default clip_end=1000 clips hero-wreck chase distances (D can exceed 1000).
    camera.data.clip_start = 0.5
    camera.data.clip_end = max(d_play * 4.0, 5000.0)
    stills = {
        'play_chase.png': {'distance': d_play, 'heading_deg': 0.0},
        'play_chase_abeam.png': {'distance': d_play, 'heading_deg': 90.0},
        'play_chase_close.png': {'distance': d_close, 'heading_deg': 0.0},
    }
    written = {}
    for name, pose in stills.items():
        apply_chase_camera(camera, distance=pose['distance'], heading_deg=pose['heading_deg'],
                           focus=tuple(center))
        path = out / name
        bpy.context.scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        written[name] = str(path)
        print(f'[mining-barge-chase] wrote {path}', flush=True)
    report = {
        'ok': True,
        'glb': str(glb),
        'out': str(out),
        'focus': [round(float(v), 4) for v in center],
        'sizeM': [round(float(v), 4) for v in size],
        'sizeMaxM': round(size_max, 4),
        'distanceScale': round(scale, 4),
        'cameras': {
            'play_chase': round(d_play, 2),
            'play_chase_abeam': round(d_play, 2),
            'play_chase_close': round(d_close, 2),
            'baseDefault': DISTANCE_DEFAULT,
            'baseClose': DISTANCE_CLOSE,
            'playWidthFracTarget': list(PLAY_CHASE_WIDTH_FRAC),
            'closeWidthFracTarget': list(PLAY_CHASE_CLOSE_WIDTH_FRAC),
        },
        'stills': written,
        'triangles': sum(len(o.data.polygons) for o in meshes),
        'note': 'Distances scaled for hero-wreck occupancy; pose from spaceface_chase_camera.',
    }
    (out / 'chase_report.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report), flush=True)


if __name__ == '__main__':
    main()
