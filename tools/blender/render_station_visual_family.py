#!/usr/bin/env python3
"""Render one station-family .blend as a reproducible production evidence frame."""
from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]


def bounds(objects):
    mn = Vector((1e9, 1e9, 1e9)); mx = Vector((-1e9, -1e9, -1e9))
    for obj in objects:
        if obj.type != 'MESH':
            continue
        for corner in obj.bound_box:
            p = obj.matrix_world @ Vector(corner)
            mn.x = min(mn.x, p.x); mn.y = min(mn.y, p.y); mn.z = min(mn.z, p.z)
            mx.x = max(mx.x, p.x); mx.y = max(mx.y, p.y); mx.z = max(mx.z, p.z)
    return mn, mx


def track(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat('-Z', 'Y').to_euler()


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', required=True)
    args = parser.parse_args(argv)
    lod0 = []
    for obj in bpy.context.scene.objects:
        if obj.type == 'MESH':
            is_lod0 = obj.name.startswith('LOD0_') and obj.name != 'COLLISION_HULL'
            obj.hide_render = not is_lod0
            if is_lod0:
                lod0.append(obj)
    mn, mx = bounds(lod0)
    center = (mn + mx) * 0.5
    size = mx - mn
    radius = max(size) * 0.62
    world = bpy.context.scene.world or bpy.data.worlds.new('StationEvidenceWorld')
    bpy.context.scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get('Background')
    bg.inputs['Color'].default_value = (0.018, 0.032, 0.065, 1)
    bg.inputs['Strength'].default_value = 0.32
    bpy.ops.object.camera_add(location=center + Vector((radius * 1.65, radius * 0.95, radius * 1.45)))
    camera = bpy.context.object
    track(camera, center)
    camera.data.lens = 58
    camera.data.sensor_width = 36
    bpy.context.scene.camera = camera
    for name, offset, energy, color, size_m in [
        ('Key', (1.1, 1.5, 0.8), 18000, (0.62, 0.80, 1.0), radius * 0.9),
        ('Rim', (-1.3, 0.8, -0.9), 12000, (0.18, 0.48, 1.0), radius * 0.8),
        ('WarmFill', (0.2, -0.8, 1.4), 7000, (1.0, 0.34, 0.08), radius * 0.6),
    ]:
        bpy.ops.object.light_add(type='AREA', location=center + Vector(offset) * radius)
        light = bpy.context.object
        light.name = name
        light.data.energy = energy
        light.data.color = color
        light.data.shape = 'DISK'
        light.data.size = size_m
        track(light, center)
    for name, rotation, energy, color in [
        ('KeySun', (0.45, -0.72, -0.35), 4.0, (0.66, 0.82, 1.0)),
        ('WarmSun', (-0.55, 0.48, 2.25), 2.2, (1.0, 0.40, 0.12)),
    ]:
        bpy.ops.object.light_add(type='SUN', rotation=rotation)
        sun = bpy.context.object
        sun.name = name
        sun.data.energy = energy
        sun.data.color = color
        sun.data.angle = math.radians(8)
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x = 1200
    scene.render.resolution_y = 780
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.film_transparent = False
    scene.render.filepath = str(Path(args.output).resolve())
    scene.render.image_settings.color_depth = '8'
    scene.view_settings.look = 'AgX - Medium High Contrast'
    scene.render.use_file_extension = True
    bpy.ops.render.render(write_still=True)


if __name__ == '__main__':
    main()
