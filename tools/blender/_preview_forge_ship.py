"""Render a forge ship's unmerged scene for design critique.

Usage:
  blender --background --python tools/blender/_preview_forge_ship.py -- \
    --ship saucer --out <dir> [--views hero,side,top,rear,belly] [--dump]
"""
from __future__ import annotations

import argparse
import importlib.util
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

HERE = Path(__file__).resolve().parent
p = argparse.ArgumentParser()
p.add_argument("--ship", required=True)
p.add_argument("--out", required=True, type=Path)
p.add_argument("--views", default="hero,side,top,rear,belly")
p.add_argument("--dump", action="store_true")
args = p.parse_args(sys.argv[sys.argv.index("--") + 1 :])
args.out = args.out.resolve()
args.out.mkdir(parents=True, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)

spec = importlib.util.spec_from_file_location("forge_ship", HERE / "forge" / "ships" / f"{args.ship}.py")
mod = importlib.util.module_from_spec(spec)
sys.path.insert(0, str(HERE / "forge"))
spec.loader.exec_module(mod)
ship = mod.build().finish()
bpy.context.view_layer.update()

if args.dump:
    for o in ship.objects:
        if o.type != "MESH":
            continue
        mn = Vector((1e9,) * 3)
        mx = Vector((-1e9,) * 3)
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            mn = Vector(map(min, mn, w))
            mx = Vector(map(max, mx, w))
        mats = {s.material.name if s.material else "?" for s in o.material_slots}
        print(f"PART {o.name} bbox=({mn.x:.2f},{mn.y:.2f},{mn.z:.2f})..({mx.x:.2f},{mx.y:.2f},{mx.z:.2f}) mats={sorted(mats)} faces={len(o.data.polygons)}")

FORGE_MATS = {
    "hull": (0.16, 0.18, 0.21, 1, 0.85, 0.45),
    "armor": (0.09, 0.105, 0.125, 1, 0.9, 0.45),
    "paint2": (0.05, 0.06, 0.075, 1, 0.9, 0.4),
    "dark": (0.028, 0.032, 0.04, 1, 0.85, 0.5),
    "gunmetal": (0.10, 0.115, 0.13, 1, 0.9, 0.35),
    "plate": (0.13, 0.15, 0.17, 1, 0.85, 0.5),
    "stripe": (0.5, 0.52, 0.55, 1, 0.7, 0.35),
    "glass": (0.01, 0.05, 0.08, 1, 0.15, 0.08),
    "canopy": (0.01, 0.05, 0.08, 1, 0.15, 0.08),
    "livery": (0.30, 0.07, 0.05, 1, 0.8, 0.5),
    "glow_cyan": (0.02, 0.75, 0.95, 1, 0.2, 0.4),
    "glow_warm": (1.0, 0.42, 0.08, 1, 0.2, 0.4),
    "glow_amber": (1.0, 0.55, 0.1, 1, 0.2, 0.4),
    "glow_red": (1.0, 0.08, 0.05, 1, 0.2, 0.4),
    "glow_green": (0.1, 0.9, 0.3, 1, 0.2, 0.4),
    "glow": (0.8, 0.95, 1.0, 1, 0.2, 0.4),
    "beacon": (1.0, 0.5, 0.05, 1, 0.2, 0.4),
}
EMIT = {"glow", "beacon"}

def style_material(mat):
    name = mat.name.lower()
    for key, (r, g, b, a, met, rough) in FORGE_MATS.items():
        if key in name:
            mat.use_nodes = True
            bsdf = next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
            if not bsdf:
                return
            bsdf.inputs["Base Color"].default_value = (r, g, b, a)
            bsdf.inputs["Metallic"].default_value = met
            bsdf.inputs["Roughness"].default_value = rough
            if key in EMIT and "Emission Strength" in bsdf.inputs:
                bsdf.inputs["Emission Color"].default_value = (r, g, b, a)
                bsdf.inputs["Emission Strength"].default_value = 7.0
            if key in {"glass", "canopy"}:
                bsdf.inputs["Metallic"].default_value = 0.9
            mat.diffuse_color = (r, g, b, a)
            return
    mat.diffuse_color = (0.4, 0.1, 0.4, 1)

for mat in bpy.data.materials:
    style_material(mat)

meshes = [o for o in ship.objects if o.type == "MESH"]
for o in meshes:
    for poly in o.data.polygons:
        poly.use_smooth = True

mn = Vector((1e9,) * 3)
mx = Vector((-1e9,) * 3)
for o in meshes:
    for c in o.bound_box:
        w = o.matrix_world @ Vector(c)
        mn = Vector(map(min, mn, w))
        mx = Vector(map(max, mx, w))
ctr = (mn + mx) / 2
radius = max((mx - mn).length / 2, 0.1)

scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.samples = 48
scene.cycles.use_denoising = True
scene.cycles.device = "CPU"
scene.render.resolution_x = scene.render.resolution_y = 900
scene.render.film_transparent = False

world = bpy.data.worlds.new("W")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.008, 0.01, 0.016, 1)
world.node_tree.nodes["Background"].inputs[1].default_value = 0.35
scene.world = world

cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam"))
scene.collection.objects.link(cam)
cam.data.lens = 70
scene.camera = cam

def add_light(name, loc, energy, size=6.0):
    d = bpy.data.lights.new(name, "AREA")
    d.energy = energy
    d.shape = "DISK"
    d.size = size
    o = bpy.data.objects.new(name, d)
    scene.collection.objects.link(o)
    o.location = Vector(ctr) + Vector(loc) * radius
    o.rotation_euler = (Vector(ctr) - o.location).to_track_quat("-Z", "Y").to_euler()

add_light("Key", (0.9, -0.7, 1.3), 1400)
add_light("Rim", (-1.1, 0.9, 0.9), 1100)
add_light("Fill", (0.2, 1.4, -0.9), 700)
add_light("Up", (0.0, 0.0, 1.8), 500)

VIEWS = {
    "hero": Vector((1.15, -1.0, 0.62)),
    "side": Vector((0.0, -1.6, 0.10)),
    "top": Vector((0.02, -0.02, 1.7)),
    "rear": Vector((-1.05, 1.05, 0.55)),
    "front": Vector((1.0, 0.0, 0.25)),
    "belly": Vector((0.35, -0.6, -1.5)),
    "closeup": Vector((1.35, -0.55, 0.30)),
}
DIST = {"closeup": 1.35}
dist = radius * 2.35
for name in args.views.split(","):
    name = name.strip()
    d = VIEWS[name].normalized()
    cam.location = Vector(ctr) + d * (radius * DIST.get(name, 2.35))
    cam.rotation_euler = (Vector(ctr) - cam.location).to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = str(args.out / f"{name}.png")
    bpy.ops.render.render(write_still=True)
    print("wrote", scene.render.filepath)
