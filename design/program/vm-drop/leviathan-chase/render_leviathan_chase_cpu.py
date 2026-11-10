"""Legal Leviathan chase stills on a CPU/llvmpipe VM.

Uses the live chase helper, runtime display scale, and Cycles CPU so EEVEE-on-
llvmpipe does not dominate iteration time.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import bpy
from mathutils import Vector

TOOLS = Path(__file__).resolve().parent
if str(TOOLS) not in sys.path:
    sys.path.insert(0, str(TOOLS))

from render_glb_chase_stills import (  # noqa: E402
    apply_clay,
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
# Leviathan collisionRadius from src/data/ships.js
RADIUS = {
    "hornet": 16.0, "kestrel": 14.0, "hitch": 14.0, "drifter": 18.0,
    "ranger": 18.0, "ironback": 17.0, "bastion": 22.0, "atlas": 30.0,
    "warden": 26.0, "colossus": 32.0, "leviathan": 45.0,
}


def parse_args(argv):
    glb = Path(argv[argv.index("--glb") + 1]).resolve()
    out = Path(argv[argv.index("--out") + 1]).resolve()
    ship = "leviathan"
    if "--ship" in argv:
        ship = argv[argv.index("--ship") + 1]
    samples = 24
    if "--samples" in argv:
        samples = int(argv[argv.index("--samples") + 1])
    return glb, out, ship, samples


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


def force_cycles_cpu(samples):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = samples
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.adaptive_min_samples = max(4, samples // 4)
    scene.cycles.use_denoising = False
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 900
    scene.view_settings.exposure = 0.70


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    glb, out, ship, samples = parse_args(argv)
    out.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(glb))
    hide_non_lod0()
    meshes = visible_meshes()
    if not meshes:
        raise SystemExit("no visible meshes")
    scale, authored, target = apply_runtime_scale(meshes, RADIUS.get(ship, 22.0))
    meshes = visible_meshes()
    low, high, center, size = mesh_bounds(meshes)
    camera = setup_studio(tuple(center), max(float(max(size)), 0.5) / 10.8)
    force_cycles_cpu(samples)
    written = render_cycle_chase_stills(camera, out, focus=tuple(center))
    clay_targets = [
        obj for obj in meshes
        if not any(token in obj.name.lower() for token in ("glass", "canopy", "optic", "lens"))
    ]
    backups = apply_clay(clay_targets or meshes)
    clay = render_chase_still(
        camera, out / "clay_play_chase.png", distance=DISTANCE_DEFAULT, heading_deg=0.0, focus=tuple(center),
    )
    clay_abeam = render_chase_still(
        camera, out / "clay_play_chase_abeam.png", distance=DISTANCE_DEFAULT, heading_deg=90.0, focus=tuple(center),
    )
    clay_close = render_chase_still(
        camera, out / "clay_play_chase_close.png", distance=DISTANCE_CLOSE, heading_deg=0.0, focus=tuple(center),
    )
    restore_mats(meshes, backups)
    report = {
        "ok": True,
        "glb": str(glb),
        "ship": ship,
        "engine": "CYCLES_CPU",
        "samples": samples,
        "runtimeScale": scale,
        "authoredX": authored,
        "targetWU": target,
        "size": [round(float(v), 4) for v in size],
        "stills": {name: str(path) for name, path in written.items()},
        "clay": str(clay),
        "clayAbeam": str(clay_abeam),
        "clayClose": str(clay_close),
    }
    (out / "chase_report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report))


if __name__ == "__main__":
    main()
