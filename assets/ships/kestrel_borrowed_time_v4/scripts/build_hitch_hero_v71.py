"""Build Hitch hero V71 (cycle 62): hard access lids on the shingles."""
from __future__ import annotations

import hashlib
import json
import math
import os
import shutil
import sys
import time
from pathlib import Path

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_v4 import (  # noqa: E402
    create_lod,
    enforce_socket_contract,
    export_lod,
    remove_collection,
    sha256,
    visible_bounds,
)
from hitch_hero_v71 import PASS_ID, apply_hitch_hero_v71  # noqa: E402


FAMILY = Path(__file__).resolve().parents[1]
BASELINE = FAMILY / "blender" / "kestrel_hitch_polish_v7_production.blend"
PACKET = "SF-K0-HITCH-HERO-V71-062"
OUT_DIR = FAMILY / "source_candidates" / "hitch_hero_v71" / "wholeships"
EVIDENCE = FAMILY / "evidence" / "hitch" / "cycles" / "cycle_62"


def publish_file(src: Path, dst: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    tmp = dst.with_name(f".{dst.name}.publishing")
    shutil.copy2(src, tmp)
    for _ in range(8):
        try:
            if dst.exists():
                dst.unlink()
            os.replace(tmp, dst)
            return
        except PermissionError:
            time.sleep(0.4)
    shutil.copy2(tmp, dst)
    tmp.unlink(missing_ok=True)


def look_at(obj, target=(0, 0, 0.4)):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def cameras_from_bounds(bounds):
    center = Vector(bounds["center"])
    dims = Vector(bounds["dimensions"])
    span = max(dims.x, dims.y, dims.z, 8.0)
    tilt = math.radians(60.0)
    table_d = max(span * 1.55, 30.0)
    play_d = max(span * 2.6, 48.0)
    gameplay_d = 144.0
    table_offset = Vector((-table_d * math.cos(tilt), 0.12 * span, table_d * math.sin(tilt)))
    play_offset = Vector((-play_d * math.cos(tilt), 0.10 * span, play_d * math.sin(tilt)))
    gameplay_offset = Vector((-gameplay_d * math.cos(tilt), 0.10 * span, gameplay_d * math.sin(tilt)))
    port_locker = Vector((-0.75, -3.24, 0.22))
    stbd_case = Vector((-1.45, 3.80, 1.34))
    return {
        "three_quarter.png": (
            center + Vector((span * 0.85, -span * 0.95, span * 0.95)),
            center + Vector((0.0, 0.0, dims.z * 0.05)),
            48,
            None,
        ),
        "starboard.png": (
            center + Vector((0.0, -span * 1.85, span * 0.12)),
            center,
            50,
            None,
        ),
        "rear.png": (
            center + Vector((-span * 1.35, -span * 0.35, span * 0.32)),
            center + Vector((-dims.x * 0.15, 0.0, 0.0)),
            48,
            None,
        ),
        "drive_rear.png": (
            center + Vector((-span * 0.95, -span * 0.08, span * 0.12)),
            center + Vector((-dims.x * 0.42, 0.0, 0.05)),
            42,
            None,
        ),
        "tabletop.png": (
            center + table_offset,
            center,
            None,
            math.radians(50.0),
        ),
        "play_size.png": (
            center + play_offset,
            center,
            None,
            math.radians(50.0),
        ),
        "gameplay.png": (
            center + gameplay_offset,
            center,
            None,
            math.radians(50.0),
        ),
        "port_locker_close.png": (
            port_locker + Vector((2.4, -3.6, 1.8)),
            port_locker,
            42,
            None,
        ),
        "stbd_case_close.png": (
            stbd_case + Vector((2.6, -3.2, 2.0)),
            stbd_case,
            42,
            None,
        ),
        "dorsal_close.png": (
            Vector((-1.6, -3.4, 4.6)),
            Vector((-1.6, 0.0, 2.2)),
            40,
            None,
        ),
        "clay_three_quarter.png": (
            center + Vector((span * 0.85, -span * 0.95, span * 0.95)),
            center + Vector((0.0, 0.0, dims.z * 0.05)),
            48,
            None,
        ),
        "clay_tabletop.png": (
            center + table_offset,
            center,
            None,
            math.radians(50.0),
        ),
        "clay_port_locker.png": (
            port_locker + Vector((2.4, -3.6, 1.8)),
            port_locker,
            42,
            None,
        ),
    }


def hide_collision_helpers():
    for obj in bpy.data.objects:
        name = obj.name.upper()
        if "COLLISION" in name or name.startswith("COL_"):
            obj.hide_render = True
            obj.hide_viewport = True


def render_stills(bounds):
    hide_collision_helpers()
    scene = bpy.context.scene
    try:
        scene.render.engine = "BLENDER_EEVEE"
    except TypeError:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 900
    scene.render.image_settings.file_format = "PNG"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = 1.0
    if scene.world:
        scene.world.color = (0.004, 0.005, 0.007)
    cam_data = bpy.data.cameras.new("V50Cam")
    camera = bpy.data.objects.new("V50Cam", cam_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    center = Vector(bounds["center"])
    span = max(bounds["dimensions"])
    for name, loc, energy, color, size in (
        ("V50Key", tuple(center + Vector((span * 0.9, -span * 1.1, span * 0.7))), 8200, (0.88, 0.92, 1), 10),
        ("V50Fill", tuple(center + Vector((span * 0.2, span * 0.9, span * 0.45))), 3200, (0.55, 0.62, 0.72), 8),
        ("V50Rim", tuple(center + Vector((-span * 0.9, -span * 0.3, span * 0.5))), 3800, (0.72, 0.80, 0.92), 7),
        ("V50Down", tuple(center + Vector((0.0, 0.0, span * 1.6))), 4200, (0.80, 0.84, 0.90), 14),
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
    shots = cameras_from_bounds(bounds)
    clay = None
    for name, (loc, target, lens, angle) in shots.items():
        if name.startswith("clay") and clay is None:
            clay = bpy.data.materials.new("V50_Clay")
            clay.use_nodes = True
            bsdf = next(n for n in clay.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
            bsdf.inputs["Base Color"].default_value = (0.62, 0.62, 0.64, 1)
            bsdf.inputs["Roughness"].default_value = 0.55
            if "Metallic" in bsdf.inputs:
                bsdf.inputs["Metallic"].default_value = 0.04
            scene.view_layers[0].material_override = clay
        if not name.startswith("clay"):
            scene.view_layers[0].material_override = None
        camera.location = loc
        if angle is not None:
            camera.data.lens_unit = "FOV"
            camera.data.angle = angle
        elif lens is not None:
            camera.data.lens_unit = "MILLIMETERS"
            camera.data.lens = lens
        look_at(camera, target)
        path = EVIDENCE / name
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
    scene.view_layers[0].material_override = None


def main() -> int:
    if not BASELINE.exists():
        raise RuntimeError(f"missing V7 production blend: {BASELINE}")
    bpy.ops.wm.open_mainfile(filepath=str(BASELINE))
    source = bpy.data.collections.get("KESTREL_V4_PRODUCTION_SOURCE")
    if source is None:
        raise RuntimeError("KESTREL_V4_PRODUCTION_SOURCE missing")
    polish = apply_hitch_hero_v71()
    sockets = enforce_socket_contract()
    bounds = visible_bounds(source)
    fingerprint = hashlib.sha256(
        json.dumps({"pass": PASS_ID, "packet": PACKET}, sort_keys=True).encode("utf-8")
    ).hexdigest().upper()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    reports = []
    for lod in (0, 1, 2):
        collection, report = create_lod(source, lod, bounds, fingerprint)
        staged = export_lod(collection, lod, OUT_DIR)
        report.update({
            "path": str(staged.relative_to(FAMILY)).replace("\\", "/"),
            "bytes": staged.stat().st_size,
            "sha256": sha256(staged),
        })
        reports.append(report)
        remove_collection(collection)
    render_stills(bounds)
    result = {
        "schema": "spaceface.hitchHeroV71.build.v1",
        "status": "complete",
        "packet": PACKET,
        "polishPassId": PASS_ID,
        "generationFingerprint": fingerprint,
        "polish": polish,
        "socketContract": sockets,
        "visibleBoundsBlenderXYZ": bounds,
        "lods": reports,
        "candidateOnly": True,
        "livePromotion": False,
        "cycle": 62,
    }
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    (EVIDENCE / "build_report.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "ok": True,
        "fingerprint": fingerprint,
        "objects": polish["objectsAdded"],
        "hidden": polish.get("hiddenDonors"),
        "lods": [{"lod": row.get("lod"), "triangles": row.get("triangles")} for row in reports],
        "bounds": bounds,
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
