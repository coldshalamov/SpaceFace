#!/usr/bin/env python3
"""Render versioned exact-source Ashline material-truth evidence.

The renderer imports the finalized, uncompressed source GLB rather than the authoring scene so the
images are tied to the same geometry and authored texture payload later encoded into the isolated
release candidate. It never writes live Ashline paths or manifests.
"""
from __future__ import annotations

import hashlib
import json
import math
import sys
from pathlib import Path
from typing import Any

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
FAMILY = ROOT / "assets" / "ships" / "m4_ashline_v2"
TOOL_RELATIVE = "tools/blender/render_m4_ashline_material_truth.py"
SCHEMA = "spaceface.ashlineMaterialTruthArtifacts.v1"
SHIP_IDS = {"dart": "ashline_v2_dart"}
LAST_RESULT: dict[str, Any] = {}


def sha256(path: Path) -> str:
    value = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            value.update(chunk)
    return value.hexdigest().upper()


def relative(path: Path) -> str:
    return str(path.relative_to(ROOT)).replace("\\", "/")


def parse_args() -> str:
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ship_key = "dart"
    for index, token in enumerate(argv):
        if token == "--ship" and index + 1 < len(argv):
            ship_key = argv[index + 1].strip().lower()
    if ship_key not in SHIP_IDS:
        raise ValueError(f"unsupported ship {ship_key}; expected {sorted(SHIP_IDS)}")
    return ship_key


def clear_scene() -> None:
    try:
        if bpy.context.object and bpy.context.object.mode != "OBJECT":
            bpy.ops.object.mode_set(mode="OBJECT")
    except Exception:
        pass
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for collection in list(bpy.data.collections):
        bpy.data.collections.remove(collection)
    for datablocks in (
        bpy.data.meshes,
        bpy.data.curves,
        bpy.data.cameras,
        bpy.data.lights,
        bpy.data.materials,
        bpy.data.images,
    ):
        for datablock in list(datablocks):
            if datablock.users == 0:
                datablocks.remove(datablock)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0


def point_at(obj: bpy.types.Object, target: tuple[float, float, float]) -> None:
    obj.rotation_euler = (
        Vector(target) - obj.location
    ).to_track_quat("-Z", "Y").to_euler()


def add_area(
    name: str,
    location: tuple[float, float, float],
    target: tuple[float, float, float],
    energy: float,
    size: float,
    color: tuple[float, float, float],
) -> None:
    data = bpy.data.lights.new(name, "AREA")
    data.energy = energy
    data.shape = "DISK"
    data.size = size
    data.color = color
    light = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(light)
    light.location = location
    point_at(light, target)


def configure_scene() -> bpy.types.Object:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = False
    scene.view_settings.look = "AgX - Medium High Contrast"

    world = scene.world or bpy.data.worlds.new("Ashline_MaterialTruth_World")
    scene.world = world
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (0.008, 0.012, 0.018, 1.0)
    background.inputs["Strength"].default_value = 0.18

    camera_data = bpy.data.cameras.new("ASHLINE_MATERIAL_TRUTH_CAMERA")
    camera = bpy.data.objects.new("ASHLINE_MATERIAL_TRUTH_CAMERA", camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera

    add_area("ASHLINE_KEY", (3, -9, 13), (0, 0, 0), 1500, 7, (1.0, 0.84, 0.70))
    add_area("ASHLINE_FILL", (-7, 10, 6), (-2, 0, 0), 1000, 6, (0.42, 0.62, 1.0))
    add_area("ASHLINE_RIM", (-11, -5, -3), (-5, 0, 0), 1250, 5, (1.0, 0.25, 0.10))
    add_area("ASHLINE_DETAIL", (9, -4, 4), (6.2, 0.1, 0.25), 0, 3, (1.0, 0.95, 0.88))
    return camera


def render_view(
    camera: bpy.types.Object,
    output: Path,
    *,
    location: tuple[float, float, float],
    target: tuple[float, float, float],
    lens: float,
    size: tuple[int, int],
    ortho_scale: float | None = None,
    neutral_detail_light: bool = False,
) -> None:
    scene = bpy.context.scene
    key = bpy.data.objects.get("ASHLINE_KEY")
    fill = bpy.data.objects.get("ASHLINE_FILL")
    rim = bpy.data.objects.get("ASHLINE_RIM")
    detail = bpy.data.objects.get("ASHLINE_DETAIL")
    if neutral_detail_light:
        key.data.energy = 1850
        key.data.color = (1.0, 0.96, 0.90)
        fill.data.energy = 1500
        fill.data.color = (0.78, 0.86, 1.0)
        rim.data.energy = 620
        rim.data.color = (0.72, 0.80, 1.0)
        detail.data.energy = 1350
    else:
        key.data.energy = 1500
        key.data.color = (1.0, 0.84, 0.70)
        fill.data.energy = 1000
        fill.data.color = (0.42, 0.62, 1.0)
        rim.data.energy = 1250
        rim.data.color = (1.0, 0.25, 0.10)
        detail.data.energy = 0
    camera.location = location
    point_at(camera, target)
    if ortho_scale is None:
        camera.data.type = "PERSP"
        camera.data.lens = lens
    else:
        camera.data.type = "ORTHO"
        camera.data.ortho_scale = ortho_scale
    scene.render.resolution_x, scene.render.resolution_y = size
    scene.render.filepath = str(output)
    bpy.ops.render.render(write_still=True)


def import_exact_lod0(source: Path) -> list[bpy.types.Object]:
    bpy.ops.import_scene.gltf(filepath=str(source))
    visible = []
    for obj in bpy.data.objects:
        if obj.type != "MESH":
            continue
        is_lod0 = obj.name.startswith("LOD0_")
        obj.hide_render = not is_lod0
        obj.hide_viewport = not is_lod0
        if is_lod0:
            visible.append(obj)
    if not visible:
        raise RuntimeError(f"{source} imported no LOD0 render meshes")
    return visible


def render_dart(source: Path, output_dir: Path) -> list[Path]:
    clear_scene()
    import_exact_lod0(source)
    camera = configure_scene()
    output_dir.mkdir(parents=True, exist_ok=True)
    views = [
        ("neutral_front34.png", (22, -18, 10), (0, 0, 0), 62, (1280, 720), None, False),
        ("neutral_rear34.png", (-22, -16, 8), (-1, 0, 0), 62, (1280, 720), None, False),
        ("drive_close.png", (-11.7, -7.2, 3.4), (-7.25, 0, 0), 72, (1280, 720), None, True),
        ("projector_close.png", (11.4, -6.2, 3.0), (6.45, 0, 0), 78, (1280, 720), None, True),
        ("projector_grazing.png", (10.2, -2.8, 2.1), (6.35, 0.10, 0.25), 84, (1280, 720), None, True),
        ("top_ortho.png", (0, 0, 24), (0, 0, 0), 50, (1280, 720), 20.0, False),
        ("game_120px.png", (22, -18, 10), (0, 0, 0), 62, (120, 120), None, False),
        ("game_45px.png", (22, -18, 10), (0, 0, 0), 62, (45, 45), None, False),
    ]
    written = []
    for name, location, target, lens, size, ortho_scale, neutral_detail_light in views:
        output = output_dir / name
        render_view(
            camera,
            output,
            location=location,
            target=target,
            lens=lens,
            size=size,
            ortho_scale=ortho_scale,
            neutral_detail_light=neutral_detail_light,
        )
        written.append(output)
    return written


def main() -> int:
    global LAST_RESULT
    ship_key = parse_args()
    ship_id = SHIP_IDS[ship_key]
    source = FAMILY / "source" / "wholeships" / f"{ship_id}.glb"
    output_dir = FAMILY / "evidence" / "material_truth_v2" / ship_key
    if not source.exists():
        raise FileNotFoundError(source)
    written = render_dart(source, output_dir)

    source_hash = sha256(source)
    producer = {"path": TOOL_RELATIVE, "sha256": sha256(ROOT / TOOL_RELATIVE)}
    artifacts = [
        {
            "path": relative(path),
            "inputBindings": [{"shipKey": ship_key, "sourceSha256": source_hash}],
            "producer": producer,
        }
        for path in written
    ]
    receipt = {
        "schema": SCHEMA,
        "shipKey": ship_key,
        "source": relative(source),
        "sourceSha256": source_hash,
        "producer": producer,
        "artifacts": artifacts,
    }
    receipt_path = FAMILY / "evidence" / "material_truth_v2" / "eligible_artifacts.json"
    receipt_path.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    LAST_RESULT = {
        "status": "complete",
        "shipKey": ship_key,
        "sourceSha256": source_hash,
        "producerSha256": producer["sha256"],
        "artifacts": [relative(path) for path in written],
        "receipt": relative(receipt_path),
    }
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
