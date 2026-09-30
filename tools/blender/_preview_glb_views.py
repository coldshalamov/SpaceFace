"""Ad-hoc multi-view GLB preview renders for design critique.

Usage:
  blender --background --python tools/blender/_preview_glb_views.py -- \
    --glb <file.glb> --out <dir> [--views hero,side,top,rear]
"""
from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

p = argparse.ArgumentParser()
p.add_argument("--glb", required=True, type=Path)
p.add_argument("--out", required=True, type=Path)
p.add_argument("--views", default="hero,side,top,rear")
p.add_argument("--engine", default="BLENDER_WORKBENCH")
args = p.parse_args(sys.argv[sys.argv.index("--") + 1 :])

args.out = args.out.resolve()
args.glb = args.glb.resolve()
args.out.mkdir(parents=True, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(args.glb))
bpy.context.view_layer.update()

meshes = [o for o in bpy.context.scene.objects if o.type == "MESH" and "COLLISION" not in o.name.upper() and "HOOK" not in o.name.upper()]

# Materials ship as KTX2 textures Blender cannot read — restate base colors + emission by name.
MAT_STYLE = [
    ("LIGHTS_CYAN", (0.02, 0.75, 0.95, 1), 6.0),
    ("LIGHTS_WARM", (1.0, 0.42, 0.08, 1), 4.0),
    ("LIGHTS_GLOW", (0.55, 0.95, 1.0, 1), 7.0),
    ("BEACON", (1.0, 0.5, 0.05, 1), 5.0),
    ("CANOPY", (0.005, 0.02, 0.03, 1), 0.0),
    ("MECHANICALDARK", (0.035, 0.04, 0.05, 1), 0.0),
    ("MECHANICAL", (0.13, 0.15, 0.17, 1), 0.0),
    ("ARMOR", (0.09, 0.105, 0.125, 1), 0.0),
    ("LIVERY", (0.28, 0.07, 0.05, 1), 0.0),
    ("HULL", (0.16, 0.18, 0.21, 1), 0.0),
    ("SECONDARY_VANE", (0.12, 0.14, 0.16, 1), 0.0),
]
for mat in bpy.data.materials:
    key = mat.name.upper()
    for token, color, emit in MAT_STYLE:
        if token in key:
            mat.use_nodes = True
            bsdf = mat.node_tree.nodes.get("Principled BSDF")
            if bsdf:
                bsdf.inputs["Base Color"].default_value = color
                bsdf.inputs["Metallic"].default_value = 0.85 if emit == 0.0 else 0.2
                bsdf.inputs["Roughness"].default_value = 0.45
                if emit > 0 and "Emission Strength" in bsdf.inputs:
                    bsdf.inputs["Emission Color"].default_value = color
                    bsdf.inputs["Emission Strength"].default_value = emit
            mat.diffuse_color = color
            break

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
scene.render.engine = args.engine
if args.engine == "BLENDER_WORKBENCH":
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "MATERIAL"
    scene.display.shading.show_shadows = True
    scene.display.shading.show_cavity = True
elif args.engine == "CYCLES":
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
}

dist = radius * 2.35
for name in args.views.split(","):
    d = VIEWS[name.strip()].normalized()
    cam.location = Vector(ctr) + d * dist
    cam.rotation_euler = (Vector(ctr) - cam.location).to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = str(args.out / f"{name}.png")
    bpy.ops.render.render(write_still=True)
    print("wrote", scene.render.filepath)
