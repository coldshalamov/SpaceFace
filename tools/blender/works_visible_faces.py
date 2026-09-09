"""Report faces the live Asteroid Works camera never hits.

Do not use this as a quality close. Do not delete faces unless --delete is
passed after a dry-run you have looked at.

Rays come from the same pose as tools/blender/spaceface_works_camera.py:
straight down, 31° vertical FOV, works_top dead centre, works_edge at eight
in-plane object offsets (the mine is read from above and slightly from the
side near the screen edges), plus works_site.

Each LOD is evaluated alone. LOD0, LOD1 and LOD2 are coincident; if they
were raycast together, LOD0 would occlude the others and --delete would
erase the lower LODs. LOD0 is tested against works_top and works_edge;
LOD1 and LOD2 against works_site.

Usage:
  blender --background --python tools/blender/works_visible_faces.py -- --glb <file.glb>
  blender --background --python tools/blender/works_visible_faces.py -- --glb <file.glb> --delete
  blender --background --python tools/blender/works_visible_faces.py -- --self-test
"""
from __future__ import annotations

import argparse
import json
import math
import re
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector

TOOLS = Path(__file__).resolve().parent
if str(TOOLS) not in sys.path:
    sys.path.insert(0, str(TOOLS))
from spaceface_works_camera import (  # noqa: E402
    FOV_V_DEG,
    apply_works_camera,
    works_edge_offset,
    works_pose,
)

EDGE_DIRS = (
    (1.0, 0.0),
    (-1.0, 0.0),
    (0.0, 1.0),
    (0.0, -1.0),
    (1.0, 1.0),
    (1.0, -1.0),
    (-1.0, 1.0),
    (-1.0, -1.0),
)
GRID_W = 80
GRID_H = 45
LOD_PARK = 10000.0
LOD_NAME_RE = re.compile(r"^LOD([012])(?:_|$)", re.IGNORECASE)
FRAMINGS_FOR_LOD = {
    0: ("works_top", "works_edge"),
    1: ("works_site",),
    2: ("works_site",),
}


def parse_args(argv):
    parser = argparse.ArgumentParser()
    parser.add_argument("--glb", default="")
    parser.add_argument("--delete", action="store_true")
    parser.add_argument("--json-out", default="")
    parser.add_argument("--self-test", action="store_true")
    return parser.parse_args(argv)


def lod_index(name):
    match = LOD_NAME_RE.match(str(name or "").replace("-", "_"))
    return int(match.group(1)) if match else None


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
    axis = (rot @ Vector((0.0, 0.0, -1.0))).normalized()
    rays.append((origin, axis))
    return rays


def shift_meshes(meshes, delta):
    dx, dy, dz = delta
    for obj in meshes:
        obj.location.x += dx
        obj.location.y += dy
        obj.location.z += dz


def collect_hits(scene, camera, names, visible, deps):
    for origin, direction in camera_rays(camera, GRID_W, GRID_H):
        hit, _loc, _n, index, obj, _mat = scene.ray_cast(deps, origin, direction)
        if hit and obj is not None and obj.name in names and index >= 0:
            visible[obj.name].add(int(index))


def isolate_lod(meshes, active_lod):
    """Take every other LOD out of the scene so it cannot occlude this pass.

    hide_set is not enough: Blender's BVH for scene.ray_cast can still hit a
    hidden coincident mesh. Unlink from collections so the ray never sees it.
    """
    stashed = []
    for obj in meshes:
        idx = lod_index(obj.name)
        if idx is None or idx == active_lod:
            obj.hide_set(False)
            obj.hide_render = False
            continue
        collections = list(obj.users_collection)
        stashed.append((obj, collections, obj.location.copy()))
        for coll in collections:
            coll.objects.unlink(obj)
        obj.location.x += LOD_PARK
    bpy.context.view_layer.update()
    return stashed


def restore_isolated(stashed):
    for obj, collections, location in stashed:
        obj.location = location
        for coll in collections:
            if obj.name not in coll.objects:
                coll.objects.link(obj)
        obj.hide_set(False)
        obj.hide_render = False
    bpy.context.view_layer.update()


def run_framings(scene, camera, meshes, names, visible, framings):
    for framing in framings:
        if framing == "works_edge":
            apply_works_camera(camera, framing="works_top")
            for direction in EDGE_DIRS:
                offset = works_edge_offset(direction)
                shift_meshes(meshes, offset)
                bpy.context.view_layer.update()
                deps = bpy.context.evaluated_depsgraph_get()
                collect_hits(scene, camera, names, visible, deps)
                shift_meshes(meshes, (-offset[0], -offset[1], -offset[2]))
            continue
        apply_works_camera(camera, framing=framing)
        bpy.context.view_layer.update()
        deps = bpy.context.evaluated_depsgraph_get()
        collect_hits(scene, camera, names, visible, deps)


def classify(meshes):
    scene = bpy.context.scene
    cam_data = bpy.data.cameras.new("WorksProbe")
    camera = bpy.data.objects.new("WorksProbe", cam_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    camera.data.clip_start = 0.1
    camera.data.clip_end = 10000.0
    visible = {obj.name: set() for obj in meshes}
    totals = {obj.name: len(obj.data.polygons) for obj in meshes}
    groups = {}
    untagged = []
    for obj in meshes:
        idx = lod_index(obj.name)
        if idx is None:
            untagged.append(obj)
        else:
            groups.setdefault(idx, []).append(obj)

    lods = sorted(groups)
    if not lods:
        run_framings(
            scene, camera, meshes, {obj.name for obj in meshes}, visible,
            ("works_top", "works_edge", "works_site"),
        )
    else:
        for lod in lods:
            members = groups[lod]
            parked = isolate_lod(meshes, lod)
            try:
                names = {obj.name for obj in members} | {obj.name for obj in untagged}
                framings = FRAMINGS_FOR_LOD.get(lod, ("works_site",))
                run_framings(scene, camera, meshes, names, visible, framings)
            finally:
                restore_isolated(parked)

    bpy.data.objects.remove(camera, do_unlink=True)
    bpy.data.cameras.remove(cam_data)

    rows = []
    for obj in meshes:
        total = totals[obj.name]
        seen = visible[obj.name]
        hidden = [i for i in range(total) if i not in seen]
        rows.append({
            "object": obj.name,
            "lod": lod_index(obj.name),
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
        mesh = obj.data
        bm = bmesh.new()
        bm.from_mesh(mesh)
        bm.faces.ensure_lookup_table()
        doomed = [bm.faces[i] for i in indices if 0 <= i < len(bm.faces)]
        if doomed:
            bmesh.ops.delete(bm, geom=doomed, context="FACES")
        bm.to_mesh(mesh)
        bm.free()
        mesh.update()


def report_for(meshes, rows, *, glb="", deleted=False):
    top = works_pose("works_top")
    site = works_pose("works_site")
    report = {
        "glb": str(glb),
        "fovV": FOV_V_DEG,
        "framings": ["works_top", "works_edge x8", "works_site"],
        "lodFramings": {str(lod): list(names) for lod, names in FRAMINGS_FOR_LOD.items()},
        "distances": [top["distance"], site["distance"]],
        "edgeDirs": [list(d) for d in EDGE_DIRS],
        "grid": [GRID_W, GRID_H],
        "deleted": bool(deleted),
        "objects": [{k: v for k, v in row.items() if k != "hiddenIndices"} for row in rows],
        "hiddenFaces": sum(row["hidden"] for row in rows),
        "faces": sum(row["faces"] for row in rows),
    }
    report["hiddenFrac"] = round(report["hiddenFaces"] / max(1, report["faces"]), 4)
    return report


def wipe_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)


def build_self_test_lods():
    wipe_scene()
    roots = []
    for lod in (0, 1, 2):
        bpy.ops.mesh.primitive_cube_add(size=16.0, location=(0.0, 0.0, 0.0))
        obj = bpy.context.active_object
        obj.name = f"LOD{lod}_SelfTest"
        if obj.name != f"LOD{lod}_SelfTest":
            obj.name = f"LOD{lod}_SelfTest"
        obj.data = obj.data.copy()
        obj.data.name = f"LOD{lod}_SelfTestMesh"
        roots.append(obj)
    bpy.context.view_layer.update()
    return roots


def run_self_test():
    print("works_visible_faces --self-test")
    build_self_test_lods()
    meshes = render_meshes()
    print(f"  built {len(meshes)} coincident LOD meshes")
    rows = classify(meshes)
    for row in rows:
        print(
            f"  classify {row['object']}: faces={row['faces']} "
            f"visible={row['visible']} hidden={row['hidden']}"
        )
    delete_hidden(meshes, rows)
    missing = []
    for lod in (0, 1, 2):
        name = f"LOD{lod}_SelfTest"
        obj = bpy.data.objects.get(name)
        faces = len(obj.data.polygons) if obj is not None and obj.type == "MESH" else 0
        exists = obj is not None
        print(f"  after --delete: {name} exists={exists} faces={faces}")
        if not exists or faces < 1:
            missing.append(name)
    if missing:
        raise SystemExit(
            "SELF-TEST FAIL: LOD roots lost or empty after --delete: " + ", ".join(missing)
        )
    print("SELF-TEST OK: all three LOD roots survived --delete with at least one face each")


def main(argv):
    args = parse_args(argv)
    if args.self_test:
        run_self_test()
        return
    if not args.glb:
        raise SystemExit("missing --glb (or pass --self-test)")
    glb = Path(args.glb)
    if not glb.is_file():
        raise SystemExit(f"missing glb: {glb}")
    import_glb(glb)
    meshes = render_meshes()
    rows = classify(meshes)
    report = report_for(meshes, rows, glb=glb, deleted=bool(args.delete))
    if args.delete:
        # SAFETY GATE (independent review, 2026-08-21). Classification is an 80x45 ray grid: at
        # 1920x1080 the rays are ~24px apart while a site-register cell is ~19px, so a visible rail,
        # fin or bevel narrower than the ray spacing is classified "hidden" and would be erased.
        # "Not hit by a coarse grid" is not "not visible". Deleting on that basis is how a previous
        # lane lost 77% of a hull. --delete stays closed until classification is conservative
        # (full-resolution or object-ID visibility); the report is still useful as a hint.
        raise SystemExit(
            "--delete is disabled: the 80x45 ray grid (~24px spacing at 1920x1080, vs ~19px site "
            "cells) cannot prove a thin face is invisible, and this path erases geometry. "
            "Use the dry-run report as a hint only. Re-enable only with conservative "
            "full-resolution/object-ID visibility and a test that a thin visible face survives."
        )
    else:
        report["note"] = (
            "dry-run; pass --delete only after inspecting hiddenFrac. "
            "Do not use this as a quality close. LODs were evaluated one at a time."
        )
    text = json.dumps(report, indent=2)
    print(text)
    if args.json_out:
        out = Path(args.json_out)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(text, encoding="utf-8")


if __name__ == "__main__":
    argv = sys.argv
    if "--" in argv:
        argv = argv[argv.index("--") + 1:]
    else:
        argv = argv[1:]
    main(argv)
