"""Report faces the live chase camera never hits.

Do not use this as a quality close. Do not delete faces unless --delete is
passed after a dry-run you have looked at.

Rays come from the same pose as tools/blender/spaceface_chase_camera.py:
60° tilt, 50° vertical FOV, D=144 and D=58, eight headings.

Usage:
  blender --background --python tools/blender/chase_visible_faces.py -- --glb <file.glb>
  blender --background --python tools/blender/chase_visible_faces.py -- --glb <file.glb> --delete
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

TOOLS = Path(__file__).resolve().parent
if str(TOOLS) not in sys.path:
    sys.path.insert(0, str(TOOLS))
from spaceface_chase_camera import (  # noqa: E402
    DISTANCE_CLOSE,
    DISTANCE_DEFAULT,
    FOV_V_DEG,
    apply_chase_camera,
)

HEADINGS = (0, 45, 90, 135, 180, 225, 270, 315)
DISTANCES = (DISTANCE_DEFAULT, DISTANCE_CLOSE)
GRID_W = 80
GRID_H = 45


def parse_args(argv):
    parser = argparse.ArgumentParser()
    parser.add_argument("--glb", required=True)
    parser.add_argument("--delete", action="store_true")
    parser.add_argument("--json-out", default="")
    return parser.parse_args(argv)


def import_glb(path):
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(path))


def render_meshes():
    out = []
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        if obj.get("collision") or obj.get("nonRender"):
            continue
        if "COLLISION" in obj.name.upper():
            continue
        if not obj.visible_get():
            continue
        out.append(obj)
    return out


def camera_rays(camera, width, height):
    """Origins/directions in world space through a coarse pixel grid."""
    origin = camera.matrix_world.translation.copy()
    rot = camera.matrix_world.to_3x3()
    fov = float(camera.data.angle)
    tan_v = math.tan(fov * 0.5)
    tan_h = tan_v * (width / max(1, height))
    rays = []
    for y in range(height):
        ndc_y = 1.0 - 2.0 * ((y + 0.5) / height)
        for x in range(width):
            ndc_x = 2.0 * ((x + 0.5) / width) - 1.0
            local = Vector((ndc_x * tan_h, ndc_y * tan_v, -1.0))
            direction = (rot @ local).normalized()
            rays.append((origin, direction))
    return rays


def classify(meshes):
    scene = bpy.context.scene
    cam_data = bpy.data.cameras.new("ChaseProbe")
    camera = bpy.data.objects.new("ChaseProbe", cam_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    visible = {obj.name: set() for obj in meshes}
    totals = {obj.name: len(obj.data.polygons) for obj in meshes}

    deps = bpy.context.evaluated_depsgraph_get()
    for distance in DISTANCES:
        for heading in HEADINGS:
            apply_chase_camera(camera, distance=distance, heading_deg=heading)
            bpy.context.view_layer.update()
            deps = bpy.context.evaluated_depsgraph_get()
            for origin, direction in camera_rays(camera, GRID_W, GRID_H):
                hit, _loc, _n, index, obj, _mat = scene.ray_cast(deps, origin, direction)
                if hit and obj is not None and obj.name in visible and index >= 0:
                    visible[obj.name].add(int(index))

    bpy.data.objects.remove(camera, do_unlink=True)
    bpy.data.cameras.remove(cam_data)

    rows = []
    for obj in meshes:
        total = totals[obj.name]
        seen = visible[obj.name]
        hidden = [i for i in range(total) if i not in seen]
        rows.append({
            "object": obj.name,
            "faces": total,
            "visible": len(seen),
            "hidden": len(hidden),
            "hiddenFrac": round(len(hidden) / max(1, total), 4),
            "hiddenIndices": hidden,
        })
    return rows


def delete_hidden(meshes, rows):
    lookup = {row["object"]: row["hiddenIndices"] for row in rows}
    for obj in meshes:
        indices = lookup.get(obj.name) or []
        if not indices:
            continue
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="DESELECT")
        bpy.ops.object.mode_set(mode="OBJECT")
        for i in indices:
            if i < len(obj.data.polygons):
                obj.data.polygons[i].select = True
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.delete(type="FACE")
        bpy.ops.object.mode_set(mode="OBJECT")


def main(argv):
    args = parse_args(argv)
    glb = Path(args.glb)
    if not glb.is_file():
        raise SystemExit(f"missing glb: {glb}")
    import_glb(glb)
    meshes = render_meshes()
    rows = classify(meshes)
    report = {
        "glb": str(glb),
        "fovV": FOV_V_DEG,
        "distances": list(DISTANCES),
        "headings": list(HEADINGS),
        "grid": [GRID_W, GRID_H],
        "deleted": bool(args.delete),
        "objects": [{k: v for k, v in row.items() if k != "hiddenIndices"} for row in rows],
        "hiddenFaces": sum(row["hidden"] for row in rows),
        "faces": sum(row["faces"] for row in rows),
    }
    report["hiddenFrac"] = round(report["hiddenFaces"] / max(1, report["faces"]), 4)
    if args.delete:
        delete_hidden(meshes, rows)
        report["note"] = "hidden faces deleted in this Blender session; save/export yourself"
    else:
        report["note"] = "dry-run; pass --delete only after inspecting hiddenFrac"
    text = json.dumps(report, indent=2)
    print(text)
    if args.json_out:
        Path(args.json_out).write_text(text, encoding="utf-8")


if __name__ == "__main__":
    argv = sys.argv
    if "--" in argv:
        argv = argv[argv.index("--") + 1:]
    else:
        argv = argv[1:]
    main(argv)
