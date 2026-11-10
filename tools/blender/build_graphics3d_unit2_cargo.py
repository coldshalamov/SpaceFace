"""Chase-planform remaster for GRAPHICS_3D unit 2 (cargo pod).

Surgical pass on the live hauler can. Do not replace the ribbed shell with a
primitive stack. Chase looks down the long side, so this pass only:

- caps the roof above the side ribs so planform is a closed lid
- cuts four dark twist-lock pockets
- adds ISO corner castings and a door-end bar
- turns the cyan ID plate into paint (emission off)

Empties, MOUNT_Child, material names, and mapped hull stay.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import bpy
from mathutils import Vector

ROOT_NAME = "pod_cargo_container"
REVISION = "chase_surgical_v4"


def parse_args(argv):
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    return parser.parse_args(argv)


def find_object(name: str):
    exact = bpy.data.objects.get(name)
    if exact is not None:
        return exact
    matches = [obj for obj in bpy.data.objects if obj.name == name or obj.name.startswith(name + ".")]
    if len(matches) == 1:
        return matches[0]
    raise RuntimeError(f"missing object {name}")


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
        raise RuntimeError(f"empty contract changed: before={before} after={after}")


def apply_object(obj):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    obj.select_set(False)


def parent_keep_world(obj, root):
    world = obj.matrix_world.copy()
    obj.parent = root
    obj.matrix_world = world


def join_into(target, extras):
    bpy.ops.object.select_all(action="DESELECT")
    target.select_set(True)
    for extra in extras:
        extra.select_set(True)
    bpy.context.view_layer.objects.active = target
    bpy.ops.object.join()
    target.select_set(False)


def add_cyl(name, radius, depth, location, material, cap="NGON", vertices=12):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices, radius=radius, depth=depth, end_fill_type=cap, location=location,
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
        target.modifiers.remove(modifier)
        ok = False
    target.select_set(False)
    bpy.data.objects.remove(cutter, do_unlink=True)
    return ok


def kill_accent_lamp():
    mat = bpy.data.materials.get("Material_Accent")
    if mat is None or not mat.node_tree:
        raise RuntimeError("missing Material_Accent")
    bsdf = next((node for node in mat.node_tree.nodes if node.type == "BSDF_PRINCIPLED"), None)
    if bsdf is None:
        raise RuntimeError("Material_Accent has no principled BSDF")
    if "Emission Strength" in bsdf.inputs:
        bsdf.inputs["Emission Strength"].default_value = 0.0
    if "Emission Color" in bsdf.inputs:
        bsdf.inputs["Emission Color"].default_value = (0.0, 0.0, 0.0, 1.0)
    bsdf.inputs["Metallic"].default_value = 0.04
    bsdf.inputs["Roughness"].default_value = 0.42


def smart_uv(obj):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=66.0, island_margin=0.02)
    bpy.ops.object.mode_set(mode="OBJECT")
    obj.select_set(False)


def remaster(root):
    hull = find_object("Cargo_Shell")
    mech = find_object("pod_cargo_container_Material_Mechanical_Merged")
    plate = find_object("Cargo_ID_Plate")
    plate.location = Vector((3.55, 0.95, 2.26))
    hull_mat = hull.data.materials[0]
    mech_mat = mech.data.materials[0]
    accent_mat = plate.data.materials[0]
    report = {"boolean": [], "joined": {}}

    lid = add_box("Cargo_RoofLid", (5.05, 2.72, 0.11), (2.10, 0.0, 2.18), hull_mat)
    parent_keep_world(lid, root)
    smart_uv(lid)

    hatches = [
        (1.55, 0.0, 2.20),
    ]
    floors = []
    for index, location in enumerate(hatches):
        cutter = add_box(f"Cargo_HatchCut_{index}", (1.85, 0.92, 0.28), location, mech_mat)
        parent_keep_world(cutter, root)
        ok = boolean_difference(lid, cutter, solver="FLOAT")
        if not ok:
            cutter = add_box(f"Cargo_HatchCutB_{index}", (1.85, 0.92, 0.28), location, mech_mat)
            parent_keep_world(cutter, root)
            ok = boolean_difference(lid, cutter, solver="EXACT")
        report["boolean"].append({"hatch": index, "ok": ok})
        floor = add_box(f"Cargo_HatchFloor_{index}", (1.72, 0.82, 0.06), (location[0], location[1], 2.08), mech_mat)
        parent_keep_world(floor, root)
        floors.append(floor)

    corners = []
    for x in (-0.38, 4.58):
        for y in (-1.38, 1.38):
            for z in (0.08, 2.02):
                name = f"Cargo_ISO_{'A' if x < 1 else 'F'}{'P' if y > 0 else 'S'}{'U' if z > 1 else 'L'}"
                corner = add_box(name, (0.24, 0.24, 0.24), (x, y, z), mech_mat)
                parent_keep_world(corner, root)
                corners.append(corner)

    door_bar = add_box("Cargo_DoorBar", (0.10, 2.20, 0.14), (-0.46, 0.0, 1.55), mech_mat)
    latch_p = add_box("Cargo_DoorLatchP", (0.08, 0.10, 1.55), (-0.46, 0.62, 1.00), mech_mat)
    latch_s = add_box("Cargo_DoorLatchS", (0.08, 0.10, 1.55), (-0.46, -0.62, 1.00), mech_mat)
    stripe_p = add_box("Cargo_DaymarkP", (4.85, 0.05, 0.48), (2.10, 1.43, 1.08), accent_mat)
    stripe_s = add_box("Cargo_DaymarkS", (4.85, 0.05, 0.48), (2.10, -1.43, 1.08), accent_mat)
    for obj in (door_bar, latch_p, latch_s, stripe_p, stripe_s):
        parent_keep_world(obj, root)

    join_into(hull, [lid])
    mech_bits = floors + corners + [door_bar, latch_p, latch_s]
    mech_names = [obj.name for obj in mech_bits]
    join_into(mech, mech_bits)
    join_into(plate, [stripe_p, stripe_s])
    report["joined"] = {
        "hull": ["Cargo_RoofLid"],
        "mechanical": mech_names,
        "accent": ["Cargo_DaymarkP", "Cargo_DaymarkS"],
    }
    return report


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


def triangulate_meshes():
    for obj in list(bpy.data.objects):
        if obj.type != "MESH":
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


def main():
    args = parse_args(sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else [])
    source = args.source.resolve()
    output = args.output.resolve()
    if not source.is_file():
        raise SystemExit(f"missing source {source}")

    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(source))
    root = find_object(ROOT_NAME)
    empties = snapshot_empties()
    kill_accent_lamp()
    surgery = remaster(root)
    assert_empties(empties)
    triangulate_meshes()
    export_glb(output, root)

    meshes = [obj for obj in bpy.data.objects if obj.type == "MESH"]
    tris = 0
    for obj in meshes:
        obj.data.calc_loop_triangles()
        tris += len(obj.data.loop_triangles)
    report = {
        "ok": True,
        "asset": ROOT_NAME,
        "revision": REVISION,
        "source": str(source),
        "output": str(output),
        "surgery": surgery,
        "triangles": tris,
        "objects": [obj.name for obj in meshes],
        "bytes": output.stat().st_size,
    }
    output.with_suffix(".report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report))


if __name__ == "__main__":
    main()
