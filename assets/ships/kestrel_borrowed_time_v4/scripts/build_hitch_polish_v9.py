"""Build Hitch V9 extra-polish candidate from the V7 production blend."""
from __future__ import annotations

import hashlib
import json
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
from hitch_polish_v9 import PASS_ID, apply_hitch_polish_v9  # noqa: E402


FAMILY = Path(__file__).resolve().parents[1]
BASELINE = FAMILY / "blender" / "kestrel_hitch_polish_v7_production.blend"
PACKET = "SF-K0-HITCH-POLISH-V9-001"
OUT_DIR = FAMILY / "source_candidates" / "hitch_polish_v9" / "wholeships"
EVIDENCE = FAMILY / "evidence" / "hitch_polish_v9"


def look_at(obj, target=(0, 0, 0.4)):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def render_stills():
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
    cam_data = bpy.data.cameras.new("V9Cam")
    camera = bpy.data.objects.new("V9Cam", cam_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    for name, loc, energy, color, size in (
        ("V9Key", (18, -20, 12), 8200, (0.88, 0.92, 1), 10),
        ("V9Fill", (4, 16, 8), 3200, (0.55, 0.62, 0.72), 8),
        ("V9Rim", (-16, -6, 8), 3800, (0.72, 0.80, 0.92), 7),
    ):
        data = bpy.data.lights.new(name, "AREA")
        data.energy = energy
        data.color = color
        data.size = size
        obj = bpy.data.objects.new(name, data)
        scene.collection.objects.link(obj)
        obj.location = loc
        look_at(obj)
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    shots = {
        "three_quarter.png": ((16.5, -14.5, 7.2), (0.4, 0.0, 0.5), 50),
        "starboard.png": ((1.5, -22.0, 3.2), (0.2, 0.0, 0.4), 55),
        "rear.png": ((-18.5, -6.5, 5.5), (-2.0, 0.0, 0.4), 48),
        "clay_three_quarter.png": ((16.5, -14.5, 7.2), (0.4, 0.0, 0.5), 50),
    }
    clay = None
    for name, (loc, target, lens) in shots.items():
        if name.startswith("clay") and clay is None:
            clay = bpy.data.materials.new("V9_Clay")
            clay.use_nodes = True
            bsdf = next(n for n in clay.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
            bsdf.inputs["Base Color"].default_value = (0.62, 0.62, 0.64, 1)
            bsdf.inputs["Roughness"].default_value = 0.55
            if "Metallic" in bsdf.inputs:
                bsdf.inputs["Metallic"].default_value = 0.04
            scene.view_layers[0].material_override = clay
        camera.location = loc
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
    polish = apply_hitch_polish_v9()
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
    render_stills()
    result = {
        "schema": "spaceface.hitchPolishV9.build.v1",
        "status": "complete",
        "packet": PACKET,
        "polishPassId": PASS_ID,
        "generationFingerprint": fingerprint,
        "polish": polish,
        "socketContract": sockets,
        "visibleBoundsBlenderXYZ": bounds,
        "lods": reports,
        "candidateOnly": False,
        "livePromotion": False,
    }
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    (EVIDENCE / "build_report.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "ok": True,
        "fingerprint": fingerprint,
        "objects": polish["objectsAdded"],
        "lods": [{"lod": row.get("lod"), "triangles": row.get("triangles")} for row in reports],
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
