"""Chase stills of an existing Hornet/Hitch GLB at live play size."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[5]
TOOLS = ROOT / "tools" / "blender"
if str(TOOLS) not in sys.path:
    sys.path.insert(0, str(TOOLS))

from render_glb_chase_stills import (  # noqa: E402
    apply_clay,
    clay_meshes,
    hide_non_lod0,
    mesh_bounds,
    restore_mats,
    setup_studio,
    visible_meshes,
)
from spaceface_chase_camera import (  # noqa: E402
    DISTANCE_CLOSE,
    DISTANCE_DEFAULT,
    render_chase_still,
    render_cycle_chase_stills,
)

ASSEMBLY_HULL_UNITS = 1.72
RADIUS = {"hornet": 16.0, "kestrel": 14.0, "hitch": 14.0, "wasp": 14.0}


def parse_args(argv):
    glb = Path(argv[argv.index("--glb") + 1]).resolve()
    out = Path(argv[argv.index("--out") + 1]).resolve()
    ship = "hornet"
    if "--ship" in argv:
        ship = argv[argv.index("--ship") + 1]
    return glb, out, ship


def apply_runtime_scale(meshes, radius):
    mins = Vector((1e9, 1e9, 1e9))
    maxs = Vector((-1e9, -1e9, -1e9))
    for obj in meshes:
        for corner in obj.bound_box:
            world = obj.matrix_world @ Vector(corner)
            for axis in range(3):
                mins[axis] = min(mins[axis], world[axis])
                maxs[axis] = max(maxs[axis], world[axis])
    extent = maxs.x - mins.x
    target = ASSEMBLY_HULL_UNITS * radius
    scale = target / max(extent, 1e-6)
    pivot = bpy.data.objects.new("RuntimeDisplayScale", None)
    bpy.context.scene.collection.objects.link(pivot)
    for obj in list(bpy.data.objects):
        if obj == pivot or obj.parent is not None or obj.type in {"LIGHT", "CAMERA"}:
            continue
        matrix = obj.matrix_world.copy()
        obj.parent = pivot
        obj.matrix_world = matrix
    pivot.scale = (scale, scale, scale)
    bpy.context.view_layer.update()
    return scale, extent, target


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    glb, out, ship = parse_args(argv)
    out.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(glb))
    hide_non_lod0()
    meshes = visible_meshes()
    if not meshes:
        raise SystemExit("no visible meshes")
    scale, authored, target = apply_runtime_scale(meshes, RADIUS.get(ship, 16.0))
    meshes = visible_meshes()
    low, high, center, size = mesh_bounds(meshes)
    camera = setup_studio(tuple(center), max(float(max(size)), 0.5) / 10.8)
    written = render_cycle_chase_stills(camera, out, focus=tuple(center))
    backups = apply_clay(clay_meshes(meshes))
    clay = render_chase_still(camera, out / "clay_play_chase.png", distance=DISTANCE_DEFAULT, heading_deg=0.0, focus=tuple(center))
    restore_mats(meshes, backups)
    report = {
        "ok": True,
        "glb": str(glb),
        "ship": ship,
        "runtimeScale": scale,
        "authoredX": authored,
        "targetWU": target,
        "size": [round(float(v), 4) for v in size],
        "stills": {name: str(path) for name, path in written.items()},
        "clay": str(clay),
    }
    (out / "chase_report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report))


if __name__ == "__main__":
    main()
