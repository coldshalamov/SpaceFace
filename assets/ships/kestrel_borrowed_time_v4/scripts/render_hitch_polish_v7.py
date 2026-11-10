"""Render Hitch V7 polish evidence cameras from the production blend."""
from __future__ import annotations

from pathlib import Path

import bpy
from mathutils import Vector


FAMILY = Path(__file__).resolve().parents[1]
OUTPUT_DIR = FAMILY / "evidence" / "hitch_polish_v7"
PROOF_COLLECTION = "V7_HITCH_PROOF_TEMP"


def _look_at(obj: bpy.types.Object, target: Vector) -> None:
    obj.rotation_euler = (target - obj.location).to_track_quat("-Z", "Y").to_euler()


def render_hitch_polish_evidence() -> dict:
    scene = bpy.context.scene
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    previous = {
        "camera": scene.camera,
        "engine": scene.render.engine,
        "resolution_x": scene.render.resolution_x,
        "resolution_y": scene.render.resolution_y,
        "filepath": scene.render.filepath,
        "material_override": scene.view_layers[0].material_override,
    }
    proof = bpy.data.collections.get(PROOF_COLLECTION)
    if proof is not None:
        for obj in list(proof.objects):
            bpy.data.objects.remove(obj, do_unlink=True)
        bpy.data.collections.remove(proof)
    proof = bpy.data.collections.new(PROOF_COLLECTION)
    scene.collection.children.link(proof)
    hidden = []

    def add_area(name, location, energy, color, size, target):
        data = bpy.data.lights.new(name, "AREA")
        data.energy = energy
        data.color = color
        data.shape = "DISK"
        data.size = size
        obj = bpy.data.objects.new(name, data)
        proof.objects.link(obj)
        obj.location = location
        _look_at(obj, Vector(target))
        return obj

    def add_camera(name, location, target, lens=58, ortho=None):
        data = bpy.data.cameras.new(name)
        data.lens = lens
        if ortho is not None:
            data.type = "ORTHO"
            data.ortho_scale = ortho
        obj = bpy.data.objects.new(name, data)
        proof.objects.link(obj)
        obj.location = location
        _look_at(obj, Vector(target))
        scene.camera = obj
        return obj

    outputs = []
    try:
        for obj in bpy.data.objects:
            if "COLLISION" in obj.name.upper() or obj.get("nonRender") is True:
                hidden.append((obj, obj.hide_render))
                obj.hide_render = True
        engines = {item.identifier for item in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items}
        scene.render.engine = "BLENDER_EEVEE" if "BLENDER_EEVEE" in engines else "BLENDER_EEVEE_NEXT"
        scene.render.resolution_x = 1600
        scene.render.resolution_y = 900
        scene.render.resolution_percentage = 100
        scene.render.image_settings.file_format = "PNG"
        scene.render.film_transparent = False
        if scene.world:
            scene.world.color = (0.002, 0.003, 0.005)
        scene.view_settings.look = "AgX - Medium High Contrast"

        target = Vector((0.5, 0.0, 0.2))
        add_area("V7_Key", (13, -17, 28), 5200, (1.0, 0.79, 0.62), 9, target)
        add_area("V7_Fill", (2, 24, 15), 3000, (0.48, 0.67, 1.0), 10, target)
        add_area("V7_Rim", (-24, -5, 14), 4300, (0.42, 0.68, 1.0), 8, target)

        shots = (
            ("pass_threequarter.png", (24, -29, 18), target, 60, None, None),
            ("pass_drive_grazing.png", (-20.5, -13.5, 6.2), Vector((-12.5, 0.0, 0.2)), 72, None, None),
            ("pass_midship.png", (4, -18, 10), Vector((-1.0, 0.0, 0.8)), 55, None, None),
        )
        for name, location, look, lens, ortho, override in shots:
            add_camera(name, location, look, lens=lens, ortho=ortho)
            scene.view_layers[0].material_override = override
            path = OUTPUT_DIR / name
            scene.render.filepath = str(path)
            bpy.ops.render.render(write_still=True)
            outputs.append(str(path))

        clay = bpy.data.materials.new("V7_ClayOverride")
        clay.use_nodes = True
        shader = clay.node_tree.nodes.get("Principled BSDF")
        if shader:
            shader.inputs["Base Color"].default_value = (0.62, 0.62, 0.60, 1.0)
            shader.inputs["Roughness"].default_value = 0.72
            shader.inputs["Metallic"].default_value = 0.0
        add_camera("clay", (24, -29, 18), target, lens=60)
        scene.view_layers[0].material_override = clay
        path = OUTPUT_DIR / "pass_threequarter_clay.png"
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        outputs.append(str(path))
        scene.view_layers[0].material_override = None

        hero = bpy.data.objects.get("V7_HeroMark_DieLaughing") or bpy.data.objects.get("V6_HeroMark_DieLaughing")
        if hero is not None:
            points = [hero.matrix_world @ Vector(corner) for corner in hero.bound_box]
            center = sum(points, Vector()) / 8
            add_camera("stencil", (center.x - 1.2, center.y - 2.4, center.z + 1.6), center, lens=85)
            path = OUTPUT_DIR / "pass_stencil_grazing.png"
            scene.render.filepath = str(path)
            bpy.ops.render.render(write_still=True)
            outputs.append(str(path))
            add_camera("stencil_ortho", (center.x, center.y, center.z + 2.4), center, ortho=1.8)
            path = OUTPUT_DIR / "pass_stencil_ortho.png"
            scene.render.filepath = str(path)
            bpy.ops.render.render(write_still=True)
            outputs.append(str(path))
    finally:
        for obj, hide in hidden:
            if obj:
                obj.hide_render = hide
        scene.camera = previous["camera"]
        scene.render.engine = previous["engine"]
        scene.render.resolution_x = previous["resolution_x"]
        scene.render.resolution_y = previous["resolution_y"]
        scene.render.filepath = previous["filepath"]
        scene.view_layers[0].material_override = previous["material_override"]
        if proof is not None:
            for obj in list(proof.objects):
                bpy.data.objects.remove(obj, do_unlink=True)
    return {"outputs": outputs}


if __name__ == "__main__":
    print("HITCH_POLISH_V7_RENDER=" + str(render_hitch_polish_evidence()))
