"""Observe faces hit by the supported Asteroid Works camera.

Do not use this as a quality close or culling proof. ``--delete`` is retained
only to reject old invocations explicitly; this tool never deletes geometry.

Rays come from the same pose as tools/blender/spaceface_works_camera.py:
straight down, 31° vertical FOV, works_top dead centre, works_edge at eight
in-plane object offsets (the mine is read from above and slightly from the
side near the screen edges), plus works_site.

Sampling is one ray per 1920x1080 render pixel centre inside the projected
bounds of the active LOD. The old 80x45 whole-frame grid put fewer than one
ray across a one-cell machine at works_site distance and falsely reported
known-visible LOD1/LOD2 meshes as zero-visible.

Each LOD is evaluated alone. LOD0, LOD1 and LOD2 are coincident; if they
were raycast together, LOD0 would occlude the others and --delete would
erase the lower LODs. LOD0 is tested against works_top and works_edge;
LOD1 and LOD2 against works_site.

Usage:
  blender --background --python tools/blender/works_visible_faces.py -- --glb <file.glb>
  blender --background --python tools/blender/works_visible_faces.py -- --glb <file.glb> --delete  # rejected
  blender --background --python tools/blender/works_visible_faces.py -- --self-test
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import sys
from pathlib import Path

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

TOOLS = Path(__file__).resolve().parent
if str(TOOLS) not in sys.path:
    sys.path.insert(0, str(TOOLS))
from spaceface_works_camera import (  # noqa: E402
    DEFAULT_RES,
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
SAMPLE_W, SAMPLE_H = DEFAULT_RES
SAMPLE_PAD_PX = 1
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


def camera_rays(camera, width, height, pixel_bounds):
    """Origins/directions through render-pixel centres in ``pixel_bounds``."""
    origin = camera.matrix_world.translation.copy()
    rot = camera.matrix_world.to_3x3()
    fov = float(camera.data.angle)
    tan_v = math.tan(fov * 0.5)
    tan_h = tan_v * (width / max(1, height))
    rays = []
    x0, y0, x1, y1 = pixel_bounds
    for y in range(y0, y1):
        ndc_y = 1.0 - 2.0 * ((y + 0.5) / height)
        for x in range(x0, x1):
            ndc_x = 2.0 * ((x + 0.5) / width) - 1.0
            local = Vector((ndc_x * tan_h, ndc_y * tan_v, -1.0))
            direction = (rot @ local).normalized()
            rays.append((origin, direction))
    return rays


def projected_pixel_bounds(scene, camera, objects, width, height):
    """Return a padded, clamped render-pixel rectangle around ``objects``."""
    projected = []
    for obj in objects:
        for corner in obj.bound_box:
            ndc = world_to_camera_view(scene, camera, obj.matrix_world @ Vector(corner))
            if ndc.z >= 0.0:
                projected.append((float(ndc.x), float(ndc.y)))
    if not projected:
        return None
    min_x = min(point[0] for point in projected)
    max_x = max(point[0] for point in projected)
    min_y = min(point[1] for point in projected)
    max_y = max(point[1] for point in projected)
    x0 = max(0, math.floor(min_x * width) - SAMPLE_PAD_PX)
    x1 = min(width, math.ceil(max_x * width) + SAMPLE_PAD_PX)
    # world_to_camera_view uses bottom-up Y; camera_rays uses top-down pixel Y.
    y0 = max(0, math.floor((1.0 - max_y) * height) - SAMPLE_PAD_PX)
    y1 = min(height, math.ceil((1.0 - min_y) * height) + SAMPLE_PAD_PX)
    if x1 <= x0 or y1 <= y0:
        return None
    return (x0, y0, x1, y1)


def shift_meshes(meshes, delta):
    dx, dy, dz = delta
    for obj in meshes:
        obj.location.x += dx
        obj.location.y += dy
        obj.location.z += dz


def collect_hits(scene, camera, names, visible, deps, meshes):
    targets = [obj for obj in meshes if obj.name in names]
    pixel_bounds = projected_pixel_bounds(scene, camera, targets, SAMPLE_W, SAMPLE_H)
    if pixel_bounds is None:
        return {
            "pixelBounds": None,
            "sampleCount": 0,
            "hitCount": 0,
            "objectHitCount": {},
        }
    hit_count = 0
    object_hits = {}
    rays = camera_rays(camera, SAMPLE_W, SAMPLE_H, pixel_bounds)
    for origin, direction in rays:
        hit, _loc, _n, index, obj, _mat = scene.ray_cast(deps, origin, direction)
        if hit and obj is not None and obj.name in names and index >= 0:
            visible[obj.name].add(int(index))
            hit_count += 1
            object_hits[obj.name] = object_hits.get(obj.name, 0) + 1
    return {
        "pixelBounds": list(pixel_bounds),
        "sampleCount": len(rays),
        "hitCount": hit_count,
        "objectHitCount": object_hits,
    }


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


def run_framings(scene, camera, meshes, names, visible, framings, sampling, lod):
    for framing in framings:
        if framing == "works_edge":
            apply_works_camera(camera, framing="works_top")
            for direction in EDGE_DIRS:
                offset = works_edge_offset(direction)
                shift_meshes(meshes, offset)
                bpy.context.view_layer.update()
                deps = bpy.context.evaluated_depsgraph_get()
                record = collect_hits(scene, camera, names, visible, deps, meshes)
                record.update({"lod": lod, "framing": framing, "edgeDir": list(direction)})
                sampling.append(record)
                shift_meshes(meshes, (-offset[0], -offset[1], -offset[2]))
            continue
        apply_works_camera(camera, framing=framing)
        bpy.context.view_layer.update()
        deps = bpy.context.evaluated_depsgraph_get()
        record = collect_hits(scene, camera, names, visible, deps, meshes)
        record.update({"lod": lod, "framing": framing})
        sampling.append(record)


def classify(meshes):
    scene = bpy.context.scene
    scene.render.resolution_x = SAMPLE_W
    scene.render.resolution_y = SAMPLE_H
    scene.render.resolution_percentage = 100
    cam_data = bpy.data.cameras.new("WorksProbe")
    camera = bpy.data.objects.new("WorksProbe", cam_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    camera.data.clip_start = 0.1
    camera.data.clip_end = 10000.0
    visible = {obj.name: set() for obj in meshes}
    sampling = []
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
            ("works_top", "works_edge", "works_site"), sampling, None,
        )
    else:
        for lod in lods:
            members = groups[lod]
            parked = isolate_lod(meshes, lod)
            try:
                names = {obj.name for obj in members} | {obj.name for obj in untagged}
                framings = FRAMINGS_FOR_LOD.get(lod, ("works_site",))
                run_framings(
                    scene, camera, meshes, names, visible, framings, sampling, lod,
                )
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
            "observedVisible": len(seen),
            "unobserved": len(hidden),
            "unobservedFrac": round(len(hidden) / max(1, total), 4),
        })
    return rows, sampling


def report_for(meshes, rows, sampling, *, glb="", deleted=False):
    top = works_pose("works_top")
    site = works_pose("works_site")
    report = {
        "schema": "spaceface.worksVisibleFacesDiagnostic.v2",
        "glb": str(glb),
        "glbSha256": hashlib.sha256(Path(glb).read_bytes()).hexdigest().upper(),
        "generator": {
            "path": "tools/blender/works_visible_faces.py",
            "sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest().upper(),
            "blenderVersion": bpy.app.version_string,
        },
        "authority": {
            "role": "diagnostic_only",
            "supportsVisibleFaceObservation": True,
            "supportsHiddenFaceProof": False,
            "supportsGeometryDeletion": False,
        },
        "fovV": FOV_V_DEG,
        "framings": ["works_top", "works_edge x8", "works_site"],
        "lodFramings": {str(lod): list(names) for lod, names in FRAMINGS_FOR_LOD.items()},
        "distances": [top["distance"], site["distance"]],
        "edgeDirs": [list(d) for d in EDGE_DIRS],
        "resolution": [SAMPLE_W, SAMPLE_H],
        "sampling": {
            "method": "one ray per render-pixel centre inside projected active-LOD bounds",
            "pixelPad": SAMPLE_PAD_PX,
            "records": sampling,
        },
        "deleted": bool(deleted),
        "objects": rows,
        "observedVisibleFaces": sum(row["observedVisible"] for row in rows),
        "unobservedFaces": sum(row["unobserved"] for row in rows),
        "faces": sum(row["faces"] for row in rows),
    }
    report["unobservedFrac"] = round(
        report["unobservedFaces"] / max(1, report["faces"]), 4
    )
    return report


def wipe_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)


def build_self_test_lods():
    wipe_scene()
    roots = []
    for lod in (0, 1, 2):
        bpy.ops.mesh.primitive_cube_add(size=1.6, location=(0.0, 0.0, 0.0))
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
    rows, sampling = classify(meshes)
    for row in rows:
        print(
            f"  classify {row['object']}: faces={row['faces']} "
            f"observedVisible={row['observedVisible']} unobserved={row['unobserved']}"
        )
    missing = []
    for lod in (0, 1, 2):
        name = f"LOD{lod}_SelfTest"
        row = next((item for item in rows if item["object"] == name), None)
        observed = row["observedVisible"] if row else 0
        print(f"  supported-camera observation: {name} observedVisible={observed}")
        if observed < 1:
            missing.append(name)
    if missing:
        raise SystemExit(
            "SELF-TEST FAIL: site-scale LOD meshes had no visible-face observation: "
            + ", ".join(missing)
        )
    if not sampling:
        raise SystemExit("SELF-TEST FAIL: no sampling records")
    print("SELF-TEST OK: all three site-scale LOD meshes have visible-face observations")


def main(argv):
    args = parse_args(argv)
    if args.self_test:
        run_self_test()
        return
    if not args.glb:
        raise SystemExit("missing --glb (or pass --self-test)")
    if args.delete:
        raise SystemExit(
            "--delete is disabled: visible pixel-centre observations cannot prove that an "
            "unobserved face is hidden. This diagnostic never deletes geometry."
        )
    glb = Path(args.glb)
    if not glb.is_file():
        raise SystemExit(f"missing glb: {glb}")
    import_glb(glb)
    meshes = render_meshes()
    rows, sampling = classify(meshes)
    report = report_for(meshes, rows, sampling, glb=glb, deleted=bool(args.delete))
    report["note"] = (
        "Observation-only dry run. Unobserved does not mean hidden: pixel-centre rays "
        "can miss subpixel or antialiased coverage. This record cannot authorize culling "
        "or geometry deletion. LODs were evaluated one at a time."
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
