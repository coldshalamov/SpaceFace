"""Render the retail Kestrel V5 starter portrait from the promoted source GLB.

Blender cannot import the KTX2/meshopt retail payload directly, so this script
loads the byte-corresponding PNG source GLB named by release_manifest.json. The
report records both hashes, making the runtime image reproducible and auditable.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


PORTRAIT_WIDTH = 760
PORTRAIT_HEIGHT = 300
PORTRAIT_LENS_MM = 58.0
VIEW_DIRECTION = Vector((0.10, -0.84, 0.54)).normalized()
TARGET_LIFT = 0.10
FRAME_FILL_X = 0.94
FRAME_FILL_Y = 0.95
RIG_PREFIX = "SF_STARTER_PORTRAIT_"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (
        bpy.data.meshes,
        bpy.data.curves,
        bpy.data.materials,
        bpy.data.cameras,
        bpy.data.lights,
    ):
        for datablock in list(datablocks):
            if datablock.users == 0:
                datablocks.remove(datablock)


def look_at(obj: bpy.types.Object, target: Vector) -> None:
    obj.rotation_euler = (target - obj.location).to_track_quat("-Z", "Y").to_euler()


def area_light(
    name: str,
    location: tuple[float, float, float],
    energy: float,
    size: float,
    color: tuple[float, float, float],
    target: Vector,
) -> bpy.types.Object:
    data = bpy.data.lights.new(RIG_PREFIX + name, "AREA")
    data.energy = energy
    data.shape = "DISK"
    data.size = size
    data.color = color
    obj = bpy.data.objects.new(RIG_PREFIX + name, data)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = location
    look_at(obj, target)
    return obj


def visible_meshes() -> list[bpy.types.Object]:
    meshes = []
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH" or obj.hide_render:
            continue
        upper = obj.name.upper()
        if upper.startswith(("COLLISION", "SOCKET_", "MOUNT_")):
            obj.hide_render = True
            continue
        meshes.append(obj)
    if not meshes:
        raise RuntimeError("promoted Kestrel source GLB imported no renderable meshes")
    return meshes


def world_corners(meshes: list[bpy.types.Object]) -> list[Vector]:
    bpy.context.view_layer.update()
    return [obj.matrix_world @ Vector(corner) for obj in meshes for corner in obj.bound_box]


def frame_camera(camera: bpy.types.Object, corners: list[Vector]) -> dict:
    low = Vector((min(v.x for v in corners), min(v.y for v in corners), min(v.z for v in corners)))
    high = Vector((max(v.x for v in corners), max(v.y for v in corners), max(v.z for v in corners)))
    center = (low + high) * 0.5
    target = center + Vector((0.0, 0.0, TARGET_LIFT))

    # Establish the final orientation at the target, then solve the distance needed to fit every
    # bound corner inside the asymmetric wide portrait with deliberate breathing room.
    camera.location = target + VIEW_DIRECTION
    look_at(camera, target)
    bpy.context.view_layer.update()
    rotation_inverse = camera.matrix_world.to_quaternion().inverted()
    local = [rotation_inverse @ (corner - target) for corner in corners]
    aspect = PORTRAIT_WIDTH / PORTRAIT_HEIGHT
    tan_half_x = math.tan(camera.data.angle_x * 0.5) * FRAME_FILL_X
    tan_half_y = math.tan(camera.data.angle_y * 0.5) * FRAME_FILL_Y
    # angle_y can lag sensor-fit changes on some Blender builds; the horizontal relation is exact.
    tan_half_y = min(tan_half_y, tan_half_x / aspect * FRAME_FILL_Y / FRAME_FILL_X)
    distance = max(
        max(abs(point.x) / max(1e-6, tan_half_x) + point.z for point in local),
        max(abs(point.y) / max(1e-6, tan_half_y) + point.z for point in local),
    )
    distance = max(distance, (high - low).length * 0.55)
    camera.location = target + VIEW_DIRECTION * distance
    look_at(camera, target)
    return {
        "boundsMin": [round(value, 6) for value in low],
        "boundsMax": [round(value, 6) for value in high],
        "target": [round(value, 6) for value in target],
        "location": [round(value, 6) for value in camera.location],
        "distance": round(distance, 6),
        "lensMm": PORTRAIT_LENS_MM,
    }


def configure_scene(output: Path) -> bpy.types.Object:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = PORTRAIT_WIDTH
    scene.render.resolution_y = PORTRAIT_HEIGHT
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.image_settings.compression = 15
    scene.render.film_transparent = True
    scene.render.filepath = str(output)
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = 0.65

    if scene.world is None:
        scene.world = bpy.data.worlds.new(RIG_PREFIX + "World")
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (0.003, 0.005, 0.008, 1.0)
    background.inputs["Strength"].default_value = 0.34

    data = bpy.data.cameras.new(RIG_PREFIX + "Camera")
    data.lens = PORTRAIT_LENS_MM
    data.sensor_width = 36.0
    data.sensor_fit = "HORIZONTAL"
    camera = bpy.data.objects.new(RIG_PREFIX + "Camera", data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    return camera


def render(source: Path, release: Path, output: Path, report_path: Path) -> dict:
    source = source.resolve()
    release = release.resolve()
    output = output.resolve()
    report_path = report_path.resolve()
    if not source.is_file() or not release.is_file():
        raise FileNotFoundError("promoted Kestrel source/release GLB is missing")
    output.parent.mkdir(parents=True, exist_ok=True)
    report_path.parent.mkdir(parents=True, exist_ok=True)

    clear_scene()
    bpy.ops.import_scene.gltf(filepath=str(source), import_shading="NORMALS")
    meshes = visible_meshes()
    corners = world_corners(meshes)
    camera = configure_scene(output)
    camera_receipt = frame_camera(camera, corners)
    target = Vector(camera_receipt["target"])

    area_light("Key", (8.0, -18.0, 25.0), 6200.0, 12.0, (1.0, 0.82, 0.67), target)
    area_light("Fill", (-2.0, 17.0, 13.0), 3200.0, 16.0, (0.52, 0.70, 1.0), target)
    area_light("Rim", (-18.0, -8.0, 17.0), 4700.0, 10.0, (0.40, 0.72, 1.0), target)
    area_light("Top", (0.0, 0.0, 29.0), 2800.0, 18.0, (0.94, 0.97, 1.0), target)

    bpy.context.view_layer.update()
    bpy.ops.render.render(write_still=True)
    report = {
        "schema": "spaceface.kestrelStarterPortrait.v1",
        "sourceGlb": "assets/ships/parts/wholeships/kestrel.glb",
        "sourceSha256": sha256(source),
        "releaseGlb": "assets/ships/release/parts/wholeships/kestrel.glb",
        "releaseSha256": sha256(release),
        "output": "assets/ships/release/ui/kestrel_v5_starter_portrait.png",
        "outputSha256": sha256(output),
        "resolution": [PORTRAIT_WIDTH, PORTRAIT_HEIGHT],
        "engine": bpy.context.scene.render.engine,
        "blenderVersion": bpy.app.version_string,
        "view": camera_receipt,
        "lighting": "four large neutral area lights; transparent film; no bloom or post glow",
        "meshObjects": len(meshes),
    }
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print("KESTREL_STARTER_PORTRAIT=" + json.dumps(report, sort_keys=True))
    return report


def main() -> int:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--release", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args(argv)
    render(args.source, args.release, args.output, args.report)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
