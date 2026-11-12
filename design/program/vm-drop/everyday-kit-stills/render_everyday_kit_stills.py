#!/usr/bin/env python3
"""Chase/berth stills for every everyday_space_kit source GLB (read-only on kit).

One scaled play_chase + play_chase_abeam per piece so a person can see which
yard props read as objects at the live chase pose. Distance scales with
envelope so small berth-scale pods and large platforms share a similar
occupancy band (see INTEGRATION.md size-class bands / CAMERA_VISIBLE_BUBBLE).

Writes only under design/program/vm-drop/everyday-kit-stills/.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import bpy
from mathutils import Vector

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[3]
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))
from spaceface_chase_camera import (  # noqa: E402
    DISTANCE_DEFAULT,
    apply_chase_camera,
)

SOURCE_ROOT = REPO / "assets/incubator/everyday_space_kit/source"
REPORT_SRC = REPO / "assets/incubator/everyday_space_kit/evidence/build-report.json"
# Hornet-ish reference length that looks right at D=144; scale D with size_max.
REF_LENGTH_M = 16.0
MIN_DISTANCE = 22.0
MAX_DISTANCE = 420.0


def parse_args(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument("--source-root", type=Path, default=SOURCE_ROOT)
    ap.add_argument("--out", type=Path, default=HERE / "stills")
    ap.add_argument("--report", type=Path, default=HERE / "build-report.json")
    ap.add_argument("--only", type=str, default="", help="comma ids; empty=all")
    return ap.parse_args(argv)


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def is_render_mesh(obj):
    if obj.type != "MESH":
        return False
    name = obj.name.upper()
    if "COLLISION" in name:
        return False
    if obj.get("collision") or obj.get("nonRender"):
        return False
    if name.startswith("LOD1_") or name.startswith("LOD2_"):
        return False
    return True


def visible_meshes():
    meshes = [o for o in bpy.context.scene.objects if is_render_mesh(o)]
    lod0 = [o for o in meshes if o.name.upper().startswith("LOD0_")]
    return lod0 or meshes


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


def clear_all():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for mesh in list(bpy.data.meshes):
        bpy.data.meshes.remove(mesh)
    for mat in list(bpy.data.materials):
        bpy.data.materials.remove(mat)
    for img in list(bpy.data.images):
        if img.users == 0:
            bpy.data.images.remove(img)


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
        scene.eevee.taa_render_samples = 16
    except Exception:
        pass
    try:
        scene.view_settings.look = "AgX - Medium Contrast"
    except TypeError:
        pass
    scene.view_settings.exposure = 1.05
    world = scene.world or bpy.data.worlds.new("ChaseWorld")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs["Color"].default_value = (0.045, 0.050, 0.058, 1)
        bg.inputs["Strength"].default_value = 2.2
    for obj in list(scene.objects):
        if obj.type in {"CAMERA", "LIGHT"}:
            bpy.data.objects.remove(obj, do_unlink=True)
    cam_data = bpy.data.cameras.new("CycleCam")
    camera = bpy.data.objects.new("CycleCam", cam_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    ls = max(light_scale, 0.35)
    for name, loc, energy, color, size in (
        ("Key", (16, -18, 12), 900, (0.94, 0.96, 1), 22),
        ("Fill", (4, 16, 8), 1400, (0.76, 0.80, 0.84), 20),
        ("Top", (2, 2, 16), 1000, (0.88, 0.90, 0.94), 18),
        ("Rim", (-14, -5, 7), 900, (0.78, 0.84, 0.92), 14),
        ("Kick", (-6, 10, -4), 400, (0.74, 0.78, 0.84), 12),
    ):
        data = bpy.data.lights.new(name, "AREA")
        data.energy = energy * ls
        data.color = color
        data.size = size * ls
        lamp = bpy.data.objects.new(name, data)
        scene.collection.objects.link(lamp)
        lamp.location = Vector(focus) + Vector(tuple(c * ls for c in loc))
        direction = Vector(focus) - lamp.location
        lamp.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    return camera


def chase_distance(size_max: float) -> float:
    raw = DISTANCE_DEFAULT * (size_max / REF_LENGTH_M)
    return float(min(MAX_DISTANCE, max(MIN_DISTANCE, raw)))


def load_catalog():
    if REPORT_SRC.is_file():
        data = json.loads(REPORT_SRC.read_text(encoding="utf-8"))
        return {a["id"]: a for a in data.get("assets", [])}
    return {}


def list_ids(source_root: Path, only: str, catalog: dict) -> list[str]:
    if only.strip():
        return [s.strip() for s in only.split(",") if s.strip()]
    glbs = sorted(p.stem for p in source_root.glob("*.glb"))
    # Prefer catalog order when present
    if catalog:
        ordered = [a for a in catalog if a in set(glbs)]
        extras = [g for g in glbs if g not in catalog]
        return ordered + extras
    return glbs


def render_piece(asset_id: str, glb: Path, out_dir: Path, catalog_row: dict | None) -> dict:
    clear_all()
    bpy.ops.import_scene.gltf(filepath=str(glb))
    meshes = visible_meshes()
    for o in bpy.context.scene.objects:
        if o.type == "MESH" and o not in meshes:
            o.hide_render = True
            o.hide_viewport = True
    if not meshes:
        return {
            "id": asset_id,
            "ok": False,
            "error": "no_render_meshes",
            "glb": str(glb.relative_to(REPO)),
        }
    lo, hi, center, size = mesh_bounds(meshes)
    size_max = float(max(size.x, size.y, size.z))
    d_play = chase_distance(size_max)
    light_scale = max(size_max / REF_LENGTH_M, 0.35)
    camera = setup_studio(tuple(center), light_scale)
    camera.data.clip_start = 0.2
    camera.data.clip_end = max(d_play * 4.0, 2000.0)

    piece_dir = out_dir / asset_id
    piece_dir.mkdir(parents=True, exist_ok=True)
    stills = {}
    for name, heading in (("play_chase.png", 0.0), ("play_chase_abeam.png", 90.0)):
        path = piece_dir / name
        apply_chase_camera(camera, distance=d_play, heading_deg=heading, focus=tuple(center))
        bpy.context.scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        stills[name] = {
            "path": str(path.relative_to(REPO)),
            "sha256": sha256_file(path),
            "bytes": path.stat().st_size,
        }

    entry = {
        "id": asset_id,
        "ok": True,
        "error": None,
        "glb": str(glb.relative_to(REPO)),
        "glbSha256": sha256_file(glb),
        "family": (catalog_row or {}).get("family"),
        "role": (catalog_row or {}).get("role"),
        "catalogSizeM": (catalog_row or {}).get("sizeM"),
        "catalogTriangles": (catalog_row or {}).get("triangles"),
        "measuredSizeM": [round(float(v), 4) for v in size],
        "measuredCenterM": [round(float(v), 4) for v in center],
        "sizeMaxM": round(size_max, 4),
        "distance": round(d_play, 2),
        "triangles": sum(len(o.data.polygons) for o in meshes),
        "stills": stills,
        "outDir": str(piece_dir.relative_to(REPO)),
    }
    print(
        f"[still] {asset_id} D={d_play:.1f} sizeMax={size_max:.2f} -> {piece_dir.name}",
        flush=True,
    )
    return entry


def main():
    args = parse_args(sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else [])
    source_root = args.source_root.resolve()
    out = args.out.resolve()
    out.mkdir(parents=True, exist_ok=True)
    catalog = load_catalog()
    ids = list_ids(source_root, args.only, catalog)
    rows = []
    failures = []
    for asset_id in ids:
        glb = source_root / f"{asset_id}.glb"
        if not glb.is_file():
            row = {"id": asset_id, "ok": False, "error": "missing_glb", "glb": str(glb)}
            rows.append(row)
            failures.append(asset_id)
            print(f"[miss] {asset_id}", flush=True)
            continue
        try:
            row = render_piece(asset_id, glb, out, catalog.get(asset_id))
        except Exception as exc:  # noqa: BLE001 — record and continue batch
            row = {
                "id": asset_id,
                "ok": False,
                "error": f"{type(exc).__name__}: {exc}",
                "glb": str(glb.relative_to(REPO)),
            }
            print(f"[fail] {asset_id}: {row['error']}", flush=True)
        rows.append(row)
        if not row.get("ok"):
            failures.append(asset_id)

    blender_ver = bpy.app.version_string
    report = {
        "schema": "spaceface.vmDrop.everydayKitStills.v1",
        "job": "everyday-kit-stills",
        "ok": len(failures) == 0,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "blender": blender_ver,
        "sourceRoot": str(source_root.relative_to(REPO)),
        "camera": "spaceface_chase_camera (tilt 60, FOV 50, heading 0/90)",
        "distanceRule": f"clamp({DISTANCE_DEFAULT} * sizeMax/{REF_LENGTH_M}, {MIN_DISTANCE}, {MAX_DISTANCE})",
        "pieceCount": len(rows),
        "okCount": sum(1 for r in rows if r.get("ok")),
        "failCount": len(failures),
        "failures": failures,
        "pieces": rows,
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(
        f"[report] pieces={report['pieceCount']} ok={report['okCount']} fail={report['failCount']} -> {args.report}",
        flush=True,
    )
    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
