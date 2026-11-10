#!/usr/bin/env python3
"""Scaled chase stills for the seven textured wreck pieces (one play_chase each)."""
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
    DISTANCE_DEFAULT,
    apply_chase_camera,
)

SELECTED = (
    "wreck_ore_freighter_hopper",
    "deb_ore_freighter_hopper_lid",
    "wreck_liner_bow",
    "wreck_liner_boatbay",
    "deb_liner_hull_panel",
    "aft_armor_slab",
    "frag_grating_sheet",
)
REF_LENGTH_M = 16.0


def parse_args(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", type=Path, required=True, help="Job folder with <id>.glb")
    ap.add_argument("--out", type=Path, required=True, help="stills output dir")
    return ap.parse_args(argv)


def is_lod0_mesh(obj):
    if obj.type != "MESH":
        return False
    name = obj.name.upper()
    if "COLLISION" in name:
        return False
    if name.startswith("LOD1_") or name.startswith("LOD2_"):
        return False
    return True


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


def setup_studio(focus, light_scale):
    scene = bpy.context.scene
    try:
        scene.render.engine = "BLENDER_EEVEE"
    except TypeError:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 900
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    try:
        scene.view_settings.look = "AgX - Medium Contrast"
    except TypeError:
        pass
    scene.view_settings.exposure = 1.05
    world = scene.world or bpy.data.worlds.new("ChaseWorld")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    bg.inputs["Color"].default_value = (0.045, 0.050, 0.058, 1)
    bg.inputs["Strength"].default_value = 2.2
    for obj in list(scene.objects):
        if obj.type in {"CAMERA", "LIGHT"}:
            bpy.data.objects.remove(obj, do_unlink=True)
    cam_data = bpy.data.cameras.new("CycleCam")
    camera = bpy.data.objects.new("CycleCam", cam_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    for name, loc, energy, color, size in (
        ("Key", (16, -18, 12), 900, (0.94, 0.96, 1), 22),
        ("Fill", (4, 16, 8), 1400, (0.76, 0.80, 0.84), 20),
        ("Top", (2, 2, 16), 1000, (0.88, 0.90, 0.94), 18),
        ("Rim", (-14, -5, 7), 900, (0.78, 0.84, 0.92), 14),
        ("Kick", (-6, 10, -4), 400, (0.74, 0.78, 0.84), 12),
    ):
        data = bpy.data.lights.new(name, "AREA")
        data.energy = energy * light_scale
        data.color = color
        data.size = size * light_scale
        lamp = bpy.data.objects.new(name, data)
        scene.collection.objects.link(lamp)
        lamp.location = Vector(focus) + Vector(tuple(c * light_scale for c in loc))
        direction = Vector(focus) - lamp.location
        lamp.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    return camera


def clear_all():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for mesh in list(bpy.data.meshes):
        bpy.data.meshes.remove(mesh)
    for img in list(bpy.data.images):
        if img.users == 0:
            bpy.data.images.remove(img)


def main():
    args = parse_args(sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else [])
    root = args.root.resolve()
    out = args.out.resolve()
    out.mkdir(parents=True, exist_ok=True)
    reports = []
    for asset_id in SELECTED:
        glb = root / f"{asset_id}.glb"
        if not glb.is_file():
            raise SystemExit(f"missing {glb}")
        clear_all()
        bpy.ops.import_scene.gltf(filepath=str(glb))
        meshes = [o for o in bpy.context.scene.objects if is_lod0_mesh(o)]
        # Prefer LOD0_ prefixed if present
        lod0 = [o for o in meshes if o.name.upper().startswith("LOD0_")]
        if lod0:
            meshes = lod0
            for o in bpy.context.scene.objects:
                if o.type == "MESH" and o not in meshes:
                    o.hide_render = True
                    o.hide_viewport = True
        if not meshes:
            raise SystemExit(f"no meshes for {asset_id}")
        lo, hi, center, size = mesh_bounds(meshes)
        size_max = float(max(size))
        scale = max(size_max / REF_LENGTH_M, 1.0)
        d_play = DISTANCE_DEFAULT * scale
        light_scale = size_max / REF_LENGTH_M
        camera = setup_studio(tuple(center), light_scale)
        camera.data.clip_start = 0.5
        camera.data.clip_end = max(d_play * 4.0, 5000.0)
        path = out / f"{asset_id}_play_chase.png"
        apply_chase_camera(camera, distance=d_play, heading_deg=0.0, focus=tuple(center))
        bpy.context.scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        entry = {
            "id": asset_id,
            "glb": str(glb),
            "still": str(path),
            "sizeM": [round(float(v), 4) for v in size],
            "distance": round(d_play, 2),
            "trianglesLod0": sum(len(o.data.polygons) for o in meshes),
        }
        reports.append(entry)
        print(f"[still] {asset_id} -> {path.name} D={d_play:.1f}", flush=True)
    report_path = out / "stills_report.json"
    report_path.write_text(json.dumps({"ok": True, "stills": reports}, indent=2) + "\n", encoding="utf-8")
    print(f"[report] {report_path}", flush=True)


if __name__ == "__main__":
    main()
