"""Render neutral, reproducible Blender proof for the golden Kestrel asset."""
from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


PROOF_PREFIX = "V5_PROOF_"
VIEWS = {
    "front_threequarter": ((34.0, -31.0, 23.0), (0.0, 0.0, 0.25), 54.0),
    "rear_threequarter": ((-36.0, 29.0, 19.0), (-1.0, 0.0, 0.15), 56.0),
    "top_game": ((18.0, -20.0, 43.0), (0.0, 0.0, 0.25), 58.0),
    "default_footprint": ((37.0, -35.0, 28.0), (0.0, 0.0, 0.20), 62.0),
}


def _remove_prior_proof() -> None:
    for obj in list(bpy.data.objects):
        if not obj.name.startswith(PROOF_PREFIX):
            continue
        data = obj.data
        bpy.data.objects.remove(obj, do_unlink=True)
        if data and getattr(data, "users", 1) == 0:
            bucket = bpy.data.cameras if isinstance(data, bpy.types.Camera) else bpy.data.lights if isinstance(data, bpy.types.Light) else None
            if bucket is not None:
                bucket.remove(data)


def _look_at(obj: bpy.types.Object, target: tuple[float, float, float]) -> None:
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def _area(name: str, location: tuple[float, float, float], energy: float,
          size: float, color: tuple[float, float, float], target=(0.0, 0.0, 0.0)) -> bpy.types.Object:
    data = bpy.data.lights.new(PROOF_PREFIX + name, "AREA")
    data.energy = energy
    data.shape = "DISK"
    data.size = size
    data.color = color
    obj = bpy.data.objects.new(PROOF_PREFIX + name, data)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = location
    _look_at(obj, target)
    return obj


def _setup_scene() -> bpy.types.Object:
    _remove_prior_proof()
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 960
    scene.render.resolution_y = 720
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.image_settings.compression = 15
    if scene.world is None:
        scene.world = bpy.data.worlds.new(PROOF_PREFIX + "World")
    world = scene.world
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (0.0028, 0.0042, 0.0065, 1.0)
    background.inputs["Strength"].default_value = 0.42
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = 0.8
    camera_data = bpy.data.cameras.new(PROOF_PREFIX + "Camera")
    camera_data.lens = 54.0
    camera_data.sensor_width = 36.0
    camera = bpy.data.objects.new(PROOF_PREFIX + "Camera", camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    _area("Key", (11.0, -20.0, 27.0), 7600.0, 14.0, (1.0, 0.82, 0.66), (0.0, 0.0, 0.2))
    _area("Fill", (3.0, 22.0, 16.0), 4300.0, 17.0, (0.56, 0.72, 1.0), (0.0, 0.0, 0.0))
    _area("Rim", (-25.0, -8.0, 18.0), 5600.0, 11.0, (0.46, 0.72, 1.0), (-5.0, 0.0, 0.2))
    _area("TopSoft", (-1.0, 0.0, 31.0), 3300.0, 20.0, (0.92, 0.96, 1.0), (0.0, 0.0, 0.0))
    return camera


def render_proof(output_dir: Path, view_names: list[str] | None = None) -> dict:
    output_dir = output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    camera = _setup_scene()
    rendered = []
    selected = view_names or list(VIEWS)
    missing = [name for name in selected if name not in VIEWS]
    if missing:
        raise ValueError(f"unknown proof views: {', '.join(missing)}")
    for name in selected:
        location, target, lens = VIEWS[name]
        camera.location = location
        camera.data.lens = lens
        _look_at(camera, target)
        path = output_dir / f"kestrel_v5_{name}.png"
        bpy.context.scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        rendered.append(str(path))
    report = {
        "schema": "spaceface.kestrelGoldenProof.v1",
        "source": bpy.data.filepath,
        "engine": bpy.context.scene.render.engine,
        "resolution": [960, 720],
        "lighting": "four-area neutral reflection rig; asset evidence only",
        "views": rendered,
    }
    (output_dir / "render-report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return report


def main() -> int:
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--views", help="comma-separated subset for defect-driven iteration")
    args = parser.parse_args(argv)
    view_names = [name.strip() for name in args.views.split(",") if name.strip()] if args.views else None
    report = render_proof(args.output, view_names)
    print("KESTREL_GOLDEN_RENDER=" + json.dumps(report))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
