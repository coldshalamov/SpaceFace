"""Render exact-candidate Kestrel stencil evidence without saving proof helpers."""

from __future__ import annotations

import os
from pathlib import Path

import bpy
from mathutils import Vector


FAMILY = Path(__file__).resolve().parents[1]
OUTPUT_DIR = FAMILY / "evidence" / "material_truth_v6_stencil_v2"
PROOF_COLLECTION = "V6_STENCIL_PROOF_TEMP"


def _look_at(obj: bpy.types.Object, target: Vector) -> None:
    obj.rotation_euler = (target - obj.location).to_track_quat("-Z", "Y").to_euler()


def render_stencil_evidence() -> dict:
    scene = bpy.context.scene
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    previous = {
        "camera": scene.camera,
        "engine": scene.render.engine,
        "resolution_x": scene.render.resolution_x,
        "resolution_y": scene.render.resolution_y,
        "resolution_percentage": scene.render.resolution_percentage,
        "film_transparent": scene.render.film_transparent,
        "filepath": scene.render.filepath,
        "look": scene.view_settings.look,
        "world_color": tuple(scene.world.color) if scene.world else None,
        "material_override": scene.view_layers[0].material_override,
    }
    hidden = []
    proof = bpy.data.collections.get(PROOF_COLLECTION)
    if proof is not None:
        for obj in list(proof.objects):
            bpy.data.objects.remove(obj, do_unlink=True)
        bpy.data.collections.remove(proof)
    proof = bpy.data.collections.new(PROOF_COLLECTION)
    scene.collection.children.link(proof)

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

        scene.render.engine = "BLENDER_EEVEE"
        scene.render.resolution_x = 1100
        scene.render.resolution_y = 760
        scene.render.resolution_percentage = 100
        scene.render.image_settings.file_format = "PNG"
        scene.render.film_transparent = False
        scene.world.color = (0.002, 0.003, 0.005)
        scene.view_settings.look = "AgX - Medium High Contrast"

        target = Vector((0.5, 0.0, 0.2))
        add_camera("V6_Proof_Normal_Camera", (24, -29, 18), target, lens=60)
        add_area("V6_Proof_Key", (13, -17, 28), 5200, (1.0, 0.79, 0.62), 9, target)
        add_area("V6_Proof_Fill", (2, 24, 15), 3000, (0.48, 0.67, 1.0), 10, target)
        add_area("V6_Proof_Rim", (-24, -5, 14), 4300, (0.42, 0.68, 1.0), 8, target)
        path = OUTPUT_DIR / "kestrel_stencil_normal_threequarter.png"
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        outputs.append(path)

        hero = bpy.data.objects["V6_HeroMark_DieLaughing"]
        points = [hero.matrix_world @ Vector(corner) for corner in hero.bound_box]
        center = sum(points, Vector()) / 8
        normal = (hero.parent.matrix_world.to_3x3() @ Vector((0, 0, 1))).normalized()
        up = (hero.parent.matrix_world.to_3x3() @ Vector((0, 1, 0))).normalized()
        right = (hero.parent.matrix_world.to_3x3() @ Vector((1, 0, 0))).normalized()

        for obj in list(proof.objects):
            bpy.data.objects.remove(obj, do_unlink=True)
        add_camera("V6_Proof_Close_Camera", center + normal * 5.5, center, ortho=4.7)
        add_area(
            "V6_Proof_Close_Key",
            center + normal * 3 + up * 4 - right * 2,
            2500,
            (1.0, 0.86, 0.70),
            4,
            center,
        )
        add_area(
            "V6_Proof_Close_Fill",
            center + normal * 2 - up * 2 + right * 4,
            1000,
            (0.50, 0.68, 1.0),
            3,
            center,
        )
        scene.render.resolution_y = 650
        path = OUTPUT_DIR / "kestrel_stencil_orthographic_close.png"
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        outputs.append(path)

        for obj in [candidate for candidate in list(proof.objects) if candidate.type == "LIGHT"]:
            bpy.data.objects.remove(obj, do_unlink=True)
        add_area(
            "V6_Proof_Graze",
            center + up * 4 + normal * 0.55 - right * 2,
            1800,
            (1.0, 0.76, 0.52),
            1.1,
            center,
        )
        add_area(
            "V6_Proof_GrazeFill",
            center + normal * 4 - right,
            180,
            (0.42, 0.58, 0.85),
            2.0,
            center,
        )
        path = OUTPUT_DIR / "kestrel_stencil_grazing_close.png"
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        outputs.append(path)

        clay = bpy.data.materials.get("V6_Proof_Clay") or bpy.data.materials.new("V6_Proof_Clay")
        clay.use_nodes = True
        bsdf = clay.node_tree.nodes.get("Principled BSDF")
        bsdf.inputs["Base Color"].default_value = (0.26, 0.29, 0.33, 1)
        bsdf.inputs["Metallic"].default_value = 0.15
        bsdf.inputs["Roughness"].default_value = 0.68
        scene.view_layers[0].material_override = clay
        path = OUTPUT_DIR / "kestrel_stencil_clay_close.png"
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        outputs.append(path)
    finally:
        scene.view_layers[0].material_override = previous["material_override"]
        for obj in list(proof.objects):
            bpy.data.objects.remove(obj, do_unlink=True)
        bpy.data.collections.remove(proof)
        for obj, hide_render in hidden:
            obj.hide_render = hide_render
        scene.camera = previous["camera"] if previous["camera"] in bpy.data.objects.values() else None
        scene.render.engine = previous["engine"]
        scene.render.resolution_x = previous["resolution_x"]
        scene.render.resolution_y = previous["resolution_y"]
        scene.render.resolution_percentage = previous["resolution_percentage"]
        scene.render.film_transparent = previous["film_transparent"]
        scene.render.filepath = previous["filepath"]
        scene.view_settings.look = previous["look"]
        if previous["world_color"] is not None:
            scene.world.color = previous["world_color"]

    return {
        "outputDir": os.fspath(OUTPUT_DIR),
        "files": [path.name for path in outputs],
    }


if __name__ == "__main__":
    print(render_stencil_evidence())
