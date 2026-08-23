"""Surgical chase remaster of the live Hornet body.

Import the live C85 wholeship. Do not loft a replacement. Keep sockets,
collision, root, and the interceptor envelope. Then:

- scale the whole graph so the longest axis matches the live collision
  diameter (Hornet is a 10.8 m toy inside a 32-unit physics bubble; Hitch
  already matches its bubble)
- unmap factory textures that photograph as chalk / chrome at chase
- cut one dorsal canopy tub and two Y-separated drive wells the 60° camera
  can see as dark holes

No seat. No mill cycle. No studio camera.
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import bpy

REVISION = "chase_surgical_v4"
AUTHORED_LENGTH_M = 10.8
COLLISION_DIAMETER_M = 32.0  # 2 * ships.js ship_hornet.collisionRadius
SCALE = COLLISION_DIAMETER_M / AUTHORED_LENGTH_M

HONEST = {
    "Material_Hull": {"color": (0.44, 0.45, 0.47), "metallic": 0.08, "roughness": 0.52},
    "Material_Armor": {"color": (0.09, 0.095, 0.11), "metallic": 0.22, "roughness": 0.48},
    "Material_Canopy": {"color": (0.018, 0.022, 0.028), "metallic": 0.0, "roughness": 0.08},
    "Material_Ceramic": {"color": (0.20, 0.16, 0.13), "metallic": 0.0, "roughness": 0.58},
    "Material_Mechanical": {"color": (0.22, 0.23, 0.25), "metallic": 0.28, "roughness": 0.46},
    "Material_Radiator": {"color": (0.10, 0.08, 0.07), "metallic": 0.18, "roughness": 0.52},
    "Material_Thruster": {"color": (0.05, 0.05, 0.055), "metallic": 0.42, "roughness": 0.46},
    "Material_Accent": {"color": (0.44, 0.45, 0.47), "metallic": 0.08, "roughness": 0.52},
    "Material_Warning": {"color": (0.07, 0.075, 0.08), "metallic": 0.20, "roughness": 0.50},
}


def parse_args(argv):
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    return parser.parse_args(argv)


def find_root():
    matches = [
        obj for obj in bpy.data.objects
        if obj.type == "EMPTY" and "HORNET" in obj.name.upper() and "ROOT" in obj.name.upper()
    ]
    if len(matches) == 1:
        return matches[0]
    named = bpy.data.objects.get("HORNET_LOD0_ROOT")
    if named:
        return named
    raise RuntimeError(f"missing Hornet root, found {[obj.name for obj in matches]}")


def snapshot_empties():
    return {
        obj.name: {
            "location": [round(v, 6) for v in obj.location],
            "rotation": [round(v, 6) for v in obj.rotation_euler],
            "scale": [round(v, 6) for v in obj.scale],
            "parent": obj.parent.name if obj.parent else None,
        }
        for obj in bpy.data.objects if obj.type == "EMPTY"
    }


def assert_empties(before):
    after = snapshot_empties()
    if after != before:
        raise RuntimeError("empty contract changed after surgery")


def parent_keep_world(obj, root):
    world = obj.matrix_world.copy()
    obj.parent = root
    obj.matrix_world = world


def apply_object(obj):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    obj.select_set(False)


def mesh_named(suffix):
    matches = [obj for obj in bpy.data.objects if obj.type == "MESH" and obj.name.endswith(suffix)]
    if not matches:
        matches = [obj for obj in bpy.data.objects if obj.type == "MESH" and suffix in obj.name]
    if not matches:
        raise RuntimeError(f"missing mesh {suffix}")
    return matches[0]


def is_collision(obj):
    name = obj.name.upper()
    return "COLLISION" in name or bool(obj.get("collision")) or bool(obj.get("nonRender"))


def join_into(target, extras):
    extras = [obj for obj in extras if obj and obj.name in bpy.data.objects]
    if not extras:
        return
    bpy.ops.object.select_all(action="DESELECT")
    target.select_set(True)
    for extra in extras:
        extra.select_set(True)
    bpy.context.view_layer.objects.active = target
    bpy.ops.object.join()
    target.select_set(False)


def add_cyl(name, radius, depth, location, material, rotation=(0.0, 0.0, 0.0), cap="NGON", vertices=16):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices, radius=radius, depth=depth, end_fill_type=cap,
        location=location, rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.clear()
    obj.data.materials.append(material)
    apply_object(obj)
    return obj


def add_box(name, dimensions, location, material):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    obj.data.materials.clear()
    obj.data.materials.append(material)
    apply_object(obj)
    return obj


def boolean_difference(target, cutter, solver="FLOAT"):
    modifier = target.modifiers.new("SF_ChaseCut", "BOOLEAN")
    modifier.operation = "DIFFERENCE"
    modifier.solver = solver
    modifier.object = cutter
    bpy.context.view_layer.objects.active = target
    target.select_set(True)
    try:
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        ok = True
    except Exception:
        if modifier.name in target.modifiers:
            target.modifiers.remove(modifier)
        ok = False
    target.select_set(False)
    if cutter.name in bpy.data.objects:
        bpy.data.objects.remove(cutter, do_unlink=True)
    return ok


def cut(target, maker):
    cutter = maker()
    parent_keep_world(cutter, target.parent or target)
    ok = boolean_difference(target, cutter, solver="FLOAT")
    if ok:
        return True
    cutter = maker()
    parent_keep_world(cutter, target.parent or target)
    return boolean_difference(target, cutter, solver="EXACT")


def strip_maps(material):
    if not material or not material.use_nodes or not material.node_tree:
        return
    nodes = material.node_tree
    bsdf = next((node for node in nodes.nodes if node.type == "BSDF_PRINCIPLED"), None)
    if bsdf is None:
        return
    for socket in bsdf.inputs:
        for link in list(socket.links):
            nodes.links.remove(link)
    output = next((node for node in nodes.nodes if node.type == "OUTPUT_MATERIAL"), None)
    if output and not bsdf.outputs["BSDF"].links:
        nodes.links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])


def honest_material(material, spec):
    strip_maps(material)
    material.use_nodes = True
    bsdf = next((node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED"), None)
    if bsdf is None:
        return
    bsdf.inputs["Base Color"].default_value = (*spec["color"], 1.0)
    bsdf.inputs["Metallic"].default_value = spec["metallic"]
    bsdf.inputs["Roughness"].default_value = spec["roughness"]
    if "Emission Strength" in bsdf.inputs:
        bsdf.inputs["Emission Strength"].default_value = 0.0
    if "Emission Color" in bsdf.inputs:
        bsdf.inputs["Emission Color"].default_value = (0.0, 0.0, 0.0, 1.0)
    if "Transmission Weight" in bsdf.inputs:
        bsdf.inputs["Transmission Weight"].default_value = 0.0
    elif "Transmission" in bsdf.inputs:
        bsdf.inputs["Transmission"].default_value = 0.0
    material.blend_method = "OPAQUE"


def honest_all():
    applied = {}
    for material in bpy.data.materials:
        base = material.name.split(".")[0]
        spec = HONEST.get(base)
        if spec is None:
            continue
        honest_material(material, spec)
        applied[material.name] = spec
    return applied


def remaster(root):
    hull = mesh_named("Hull")
    armor = mesh_named("Armor")
    hull_mat = hull.data.materials[0]
    report = {"boolean": [], "joined": []}

    canopy = mesh_named("Canopy")
    canopy.location.z -= 0.06
    frame_mat = armor.data.materials[0]
    cavity_mat = canopy.data.materials[0]

    def canopy_cutter():
        return add_box("CanopyTubCut", (1.20, 0.82, 0.38), (3.52, 0.0, 0.72), hull_mat)

    report["boolean"].append({"name": "canopyTubHull", "ok": cut(hull, canopy_cutter)})
    report["boolean"].append({"name": "canopyTubArmor", "ok": cut(armor, canopy_cutter)})

    cavity = add_box("CanopyCavity", (1.08, 0.70, 0.10), (3.52, 0.0, 0.42), cavity_mat)
    frame = add_box("CanopyFrame", (1.28, 0.90, 0.05), (3.52, 0.0, 0.78), frame_mat)
    parent_keep_world(cavity, root)
    parent_keep_world(frame, root)
    join_into(canopy, [cavity])
    join_into(armor, [frame])

    for side, y in (("Port", -2.15), ("Stbd", 2.15)):
        def drive_dorsal(name=f"DriveDorsalCut_{side}", loc=(-4.70, y, 0.62)):
            return add_cyl(name, 0.78, 1.05, loc, hull_mat, vertices=16)

        report["boolean"].append({"name": f"driveDorsalHull{side}", "ok": cut(hull, drive_dorsal)})
        report["boolean"].append({"name": f"driveDorsalArmor{side}", "ok": cut(armor, drive_dorsal)})

    report["joined"] = ["CanopyCavity", "CanopyFrame"]
    return report


def triangulate_meshes():
    for obj in list(bpy.data.objects):
        if obj.type != "MESH" or is_collision(obj):
            continue
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        modifier = obj.modifiers.new("SF_ExportTriangulate", "TRIANGULATE")
        modifier.keep_custom_normals = True
        try:
            bpy.ops.object.modifier_apply(modifier=modifier.name)
        except Exception:
            if modifier.name in obj.modifiers:
                obj.modifiers.remove(modifier)
        obj.select_set(False)


def export_glb(path: Path, root):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in bpy.data.objects:
        if obj.type in {"LIGHT", "CAMERA"}:
            continue
        obj.select_set(True)
    bpy.context.view_layer.objects.active = root
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(path), export_format="GLB", use_selection=True,
        export_yup=True, export_apply=True, export_extras=True,
        export_texcoords=True, export_normals=True, export_tangents=True,
        export_materials="EXPORT",
    )


def main():
    args = parse_args(sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else [])
    source = args.source.resolve()
    output = args.output.resolve()
    if not source.is_file():
        raise SystemExit(f"missing source {source}")

    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(source))
    root = find_root()
    for obj in list(bpy.data.objects):
        if obj == root or obj.parent is not None:
            continue
        if obj.type in {"LIGHT", "CAMERA"}:
            continue
        parent_keep_world(obj, root)

    empties = snapshot_empties()
    materials = honest_all()
    surgery = remaster(root)
    assert_empties(empties)
    root.scale = (SCALE, SCALE, SCALE)
    triangulate_meshes()
    export_glb(output, root)

    meshes = [obj for obj in bpy.data.objects if obj.type == "MESH"]
    tris = 0
    for obj in meshes:
        obj.data.calc_loop_triangles()
        tris += len(obj.data.loop_triangles)
    report = {
        "ok": True,
        "asset": "ship_hornet",
        "revision": REVISION,
        "source": str(source),
        "output": str(output),
        "scale": SCALE,
        "collisionDiameter": COLLISION_DIAMETER_M,
        "authoredLength": AUTHORED_LENGTH_M,
        "surgery": surgery,
        "materials": materials,
        "triangles": tris,
        "objects": [obj.name for obj in meshes],
        "bytes": output.stat().st_size,
    }
    output.with_suffix(".report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report))


if __name__ == "__main__":
    main()
