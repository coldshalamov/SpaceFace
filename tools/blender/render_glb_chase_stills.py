"""Legal chase stills from an existing GLB.

GRAPHICS_3D / place remaster proof uses the live chase camera only:
play_chase, play_chase_abeam, play_chase_close. No studio three-quarter.

Usage:
  blender --background --python tools/blender/render_glb_chase_stills.py -- \\
    --glb <file.glb> --out <dir>
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import bpy
from mathutils import Vector

TOOLS = Path(__file__).resolve().parent
if str(TOOLS) not in sys.path:
    sys.path.insert(0, str(TOOLS))
from spaceface_chase_camera import (  # noqa: E402
    DISTANCE_CLOSE,
    DISTANCE_DEFAULT,
    render_chase_still,
    render_cycle_chase_stills,
)

HORNET_AUTHORED_LENGTH_M = 10.8
CLAY_SKIP_TOKENS = ("optic", "accent", "glass", "canopy", "lens", "emissive", "lamp")


def parse_args(argv):
    parser = argparse.ArgumentParser()
    parser.add_argument("--glb", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--clay", action="store_true")
    return parser.parse_args(argv)


def look_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


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
    meshes = [obj for obj in bpy.context.scene.objects if is_render_mesh(obj)]
    has_lod0 = any(obj.name.upper().startswith("LOD0_") for obj in meshes)
    if not has_lod0:
        return meshes
    return [obj for obj in meshes if obj.name.upper().startswith("LOD0_")]


def hide_non_lod0():
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        show = is_render_mesh(obj)
        if show and any(item.name.upper().startswith("LOD0_") for item in bpy.context.scene.objects if item.type == "MESH"):
            show = obj.name.upper().startswith("LOD0_")
        obj.hide_render = not show
        obj.hide_viewport = not show


def mesh_bounds(meshes):
    low = Vector((1e12, 1e12, 1e12))
    high = Vector((-1e12, -1e12, -1e12))
    for obj in meshes:
        for corner in obj.bound_box:
            point = obj.matrix_world @ Vector(corner)
            for axis in range(3):
                low[axis] = min(low[axis], point[axis])
                high[axis] = max(high[axis], point[axis])
    return low, high, (low + high) * 0.5, high - low


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
        scene.view_settings.look = "AgX - Medium Contrast"
    except TypeError:
        scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = 0.85
    eevee = getattr(scene, "eevee", None)
    if eevee:
        for attr, val in (
            ("use_ssr", True),
            ("use_ssr_refraction", True),
            ("use_raytracing", True),
            ("use_shadows", True),
        ):
            if hasattr(eevee, attr):
                try:
                    setattr(eevee, attr, val)
                except Exception:
                    pass
    world = scene.world or bpy.data.worlds.new("ChaseWorld")
    scene.world = world
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (0.036, 0.040, 0.046, 1)
    background.inputs["Strength"].default_value = 1.85
    for obj in list(scene.objects):
        if obj.type in {"CAMERA", "LIGHT"}:
            bpy.data.objects.remove(obj, do_unlink=True)
    cam_data = bpy.data.cameras.new("CycleCam")
    camera = bpy.data.objects.new("CycleCam", cam_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    for name, loc, energy, color, size in (
        ("Key", (16, -18, 12), 560, (0.94, 0.96, 1), 22),
        ("Fill", (4, 16, 8), 980, (0.76, 0.80, 0.84), 20),
        ("Top", (2, 2, 16), 640, (0.88, 0.90, 0.94), 18),
        ("Rim", (-14, -5, 7), 620, (0.78, 0.84, 0.92), 14),
        ("Kick", (-6, 10, -4), 260, (0.74, 0.78, 0.84), 12),
        ("AftFill", (-10, -12, 8), 420, (0.80, 0.84, 0.90), 16),
        ("StbdFill", (0.9, 12.0, 3.8), 520, (0.88, 0.90, 0.94), 18),
    ):
        data = bpy.data.lights.new(name, "AREA")
        data.energy = energy * light_scale * light_scale
        data.color = color
        data.size = size * light_scale
        lamp = bpy.data.objects.new(name, data)
        scene.collection.objects.link(lamp)
        lamp.location = Vector(focus) + Vector(tuple(component * light_scale for component in loc))
        look_at(lamp, focus)
    return camera


def clay_meshes(meshes):
    out = []
    for obj in meshes:
        blob = obj.name.lower()
        if any(token in blob for token in CLAY_SKIP_TOKENS):
            continue
        out.append(obj)
    return out or list(meshes)


def apply_clay(meshes):
    backups = {}
    for obj in meshes:
        backups[obj.name] = [slot.material for slot in obj.material_slots]
        material = bpy.data.materials.new(f"CLAY_{obj.name}")
        material.use_nodes = True
        material.node_tree.nodes.clear()
        output = material.node_tree.nodes.new("ShaderNodeOutputMaterial")
        bsdf = material.node_tree.nodes.new("ShaderNodeBsdfPrincipled")
        bsdf.inputs["Base Color"].default_value = (0.46, 0.46, 0.47, 1)
        bsdf.inputs["Metallic"].default_value = 0.0
        bsdf.inputs["Roughness"].default_value = 0.58
        material.node_tree.links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])
        if obj.material_slots:
            obj.material_slots[0].material = material
        else:
            obj.data.materials.append(material)
    return backups


def restore_mats(meshes, backups):
    for obj in meshes:
        mats = backups.get(obj.name, [])
        for index, material in enumerate(mats):
            if index < len(obj.material_slots):
                obj.material_slots[index].material = material


def main():
    args = parse_args(sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else [])
    glb = args.glb.resolve()
    out = args.out.resolve()
    if not glb.is_file():
        raise SystemExit(f"missing glb: {glb}")
    out.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(glb))
    hide_non_lod0()
    meshes = visible_meshes()
    if not meshes:
        raise SystemExit("no visible meshes after LOD/collision filter")
    low, high, center, size = mesh_bounds(meshes)
    light_scale = max(float(max(size)), 0.5) / HORNET_AUTHORED_LENGTH_M
    camera = setup_studio(tuple(center), light_scale)
    written = render_cycle_chase_stills(camera, out, focus=tuple(center))
    clay_path = None
    if args.clay:
        backups = apply_clay(clay_meshes(meshes))
        clay_path = render_chase_still(
            camera, out / "clay_play_chase.png", distance=DISTANCE_DEFAULT, heading_deg=0.0, focus=tuple(center)
        )
        restore_mats(meshes, backups)
    report = {
        "ok": True,
        "glb": str(glb),
        "out": str(out),
        "focus": [round(float(value), 4) for value in center],
        "boundsMin": [round(float(value), 4) for value in low],
        "boundsMax": [round(float(value), 4) for value in high],
        "size": [round(float(value), 4) for value in size],
        "lightScale": round(light_scale, 4),
        "cameras": {"play_chase": DISTANCE_DEFAULT, "play_chase_close": DISTANCE_CLOSE},
        "meshes": [
            {
                "name": obj.name,
                "triangles": len(obj.data.polygons),
                "materials": [slot.material.name if slot.material else None for slot in obj.material_slots],
            }
            for obj in meshes
        ],
        "triangles": sum(len(obj.data.polygons) for obj in meshes),
        "stills": {name: str(path) for name, path in written.items()},
        "clay": str(clay_path) if clay_path else None,
    }
    (out / "chase_report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report))


if __name__ == "__main__":
    main()
