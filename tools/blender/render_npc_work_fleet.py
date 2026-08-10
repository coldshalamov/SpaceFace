#!/usr/bin/env python3
"""PQ-045 npc-identity — NPC work fleet evidence renderer (EEVEE, deterministic).

Renders each re-authored whole-ship from the exact uncompressed source GLB
(never the authoring scene), per the material-truth evidence separation rule:

  - surfaced front/rear three-quarter + service side + top load path
  - neutral clay front three-quarter (construction diagnostic only)
  - hard grazing-light view (normal/edge response diagnostic)
  - 95/125/165 WU band diagnostics (the R1 camera bands the fleet works in)

Usage:
  blender --background --python tools/blender/render_npc_work_fleet.py --
  blender --background --python tools/blender/render_npc_work_fleet.py -- --only ore_barge
"""
from __future__ import annotations

import math
import sys
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[2]
FAMILY = ROOT / 'assets' / 'ships' / 'npc_work_fleet'
SOURCE_DIR = FAMILY / 'source' / 'wholeships'
EVIDENCE_DIR = FAMILY / 'evidence'

SHIP_IDS = {
    'ore_barge': 'ore_barge',
    'repair_tender': 'repair_tender',
    'salvage_cutter': 'salvage_cutter',
    'survey_pin': 'survey_pin',
}


def parse_args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    only = None
    i = 0
    while i < len(argv):
        if argv[i] == '--only' and i + 1 < len(argv):
            only = argv[i + 1].strip().lower()
            i += 2
        else:
            i += 1
    return only


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
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.film_transparent = False
    try:
        scene.view_settings.look = 'AgX - Medium High Contrast'
    except Exception:
        pass
    world = scene.world or bpy.data.worlds.new('NpcWorkFleet_World')
    scene.world = world
    world.use_nodes = True
    background = world.node_tree.nodes.get('Background')
    background.inputs['Color'].default_value = (0.008, 0.012, 0.018, 1.0)
    background.inputs['Strength'].default_value = 0.32

    camera_data = bpy.data.cameras.new('NPCWORK_CAMERA')
    camera = bpy.data.objects.new('NPCWORK_CAMERA', camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera

    add_area('NPCWORK_KEY', (3, -9, 13), (0, 0, 0), 2400, 7, (1.0, 0.86, 0.72))
    add_area('NPCWORK_FILL', (-7, 10, 6), (-2, 0, 0), 1600, 6, (0.46, 0.64, 1.0))
    add_area('NPCWORK_RIM', (-11, -5, -3), (-5, 0, 0), 1900, 5, (1.0, 0.3, 0.14))
    return camera


def render_view(camera, output: Path, *, location, target, lens, size, ortho_scale=None) -> None:
    scene = bpy.context.scene
    camera.location = location
    point_at(camera, target)
    if ortho_scale is None:
        camera.data.type = 'PERSP'
        camera.data.lens = lens
    else:
        camera.data.type = 'ORTHO'
        camera.data.ortho_scale = ortho_scale
    scene.render.resolution_x, scene.render.resolution_y = size
    scene.render.filepath = str(output)
    bpy.ops.render.render(write_still=True)


def import_lod0(source: Path):
    bpy.ops.import_scene.gltf(filepath=str(source))
    visible = []
    for obj in bpy.data.objects:
        if obj.type != 'MESH':
            continue
        is_lod0 = obj.name.startswith('LOD0_')
        obj.hide_render = not is_lod0
        obj.hide_viewport = not is_lod0
        if is_lod0:
            visible.append(obj)
    if not visible:
        raise RuntimeError(f'{source} imported no LOD0 render meshes')
    return visible


def apply_clay(visible) -> list:
    """Neutral clay override for construction diagnostics; returns slot backups."""
    clay = bpy.data.materials.get('NPCWORK_CLAY')
    if clay is None:
        clay = bpy.data.materials.new('NPCWORK_CLAY')
        clay.use_nodes = True
        bsdf = clay.node_tree.nodes.get('Principled BSDF')
        bsdf.inputs['Base Color'].default_value = (0.62, 0.60, 0.57, 1.0)
        bsdf.inputs['Roughness'].default_value = 0.62
        bsdf.inputs['Metallic'].default_value = 0.0
    backups = []
    for obj in visible:
        for slot in obj.material_slots:
            backups.append((slot, slot.material))
            slot.material = clay
    return backups


def restore_clay(backups) -> None:
    for slot, mat in backups:
        slot.material = mat


def ship_half_length(visible) -> float:
    from mathutils import Vector
    pts = []
    for obj in visible:
        for corner in obj.bound_box:
            pts.append(obj.matrix_world @ Vector(corner))
    if not pts:
        return 10.0
    min_x = min(v.x for v in pts)
    max_x = max(v.x for v in pts)
    return max(1.0, (max_x - min_x) / 2.0)


def render_ship(ship_key: str) -> None:
    ship_id = SHIP_IDS[ship_key]
    source = SOURCE_DIR / f'{ship_id}.glb'
    out_dir = EVIDENCE_DIR / ship_key
    out_dir.mkdir(parents=True, exist_ok=True)

    clear_scene()
    visible = import_lod0(source)
    camera = configure_scene()
    half = ship_half_length(visible)
    # Frame the full length with margin at a 50 mm normal-ish lens.
    d = 3.1 * half

    views = [
        ('surface_front_three_quarter.png', (0.78 * d, -0.64 * d, 0.34 * d), (0, 0, 0.5), 50, (1280, 720), None),
        ('surface_rear_three_quarter.png', (-0.78 * d, -0.6 * d, 0.3 * d), (-0.5, 0, 0.5), 50, (1280, 720), None),
        ('surface_service_side.png', (0.06 * d, 1.05 * d, 0.14 * d), (0, 0, 0.5), 50, (1280, 720), None),
        ('surface_top_load_path.png', (0, 0, 1.45 * d), (0, 0, 0), 50, (1280, 720), 2.35 * half),
    ]
    written = []
    for name, location, target, lens, size, ortho in views:
        output = out_dir / name
        render_view(camera, output, location=location, target=target, lens=lens, size=size,
                    ortho_scale=ortho)
        written.append(output)

    # Hard grazing light: rim-heavy, key dimmed — exposes normal/edge response.
    key = bpy.data.objects.get('NPCWORK_KEY')
    rim = bpy.data.objects.get('NPCWORK_RIM')
    if key:
        key.data.energy = 380
    if rim:
        rim.data.energy = 3200
    output = out_dir / 'hard_grazing.png'
    render_view(camera, output, location=(0.2 * d, -0.9 * d, 0.2 * d), target=(0, 0, 0.5),
                lens=50, size=(1280, 720))
    written.append(output)
    if key:
        key.data.energy = 2400
    if rim:
        rim.data.energy = 1900

    # Neutral clay — construction read only; cannot grant acceptance.
    backups = apply_clay(visible)
    output = out_dir / 'clay_front_three_quarter.png'
    render_view(camera, output, location=(0.78 * d, -0.64 * d, 0.34 * d), target=(0, 0, 0.5),
                lens=50, size=(1280, 720))
    written.append(output)
    restore_clay(backups)

    # R1 band diagnostics at 95/125/165 WU (long lens, ship at anchor origin).
    for band in (95, 125, 165):
        output = out_dir / f'band_{band}wu.png'
        render_view(camera, output, location=(0.72 * band, -0.62 * band, 0.30 * band),
                    target=(0, 0, 0.5), lens=68, size=(1280, 720))
        written.append(output)

    print(f'[npc-work-fleet-render] {ship_key}: wrote {len(written)} views to {out_dir}', flush=True)


def main() -> int:
    only = parse_args()
    keys = [only] if only else list(SHIP_IDS.keys())
    for key in keys:
        if key not in SHIP_IDS:
            print(f'unknown ship "{key}"; expected {list(SHIP_IDS)}')
            return 2
        render_ship(key)
    return 0


if __name__ == '__main__':
    sys.exit(main())
