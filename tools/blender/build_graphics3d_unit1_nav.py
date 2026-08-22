"""Chase-planform remaster for GRAPHICS_3D unit 1 (nav buoy + lane beacon).

Surgical pass on the live Helios meshes. Do not replace PQ-022 / gantry construction
with a primitive stack. Chase looks down, so this pass only:

- opens a shallow dark roof well in the buoy head and wraps a daymark band
- removes the solid beacon boom and puts two Y-separated rails plus a pod well

Empties, sockets, collision helpers, material names, and mapped materials stay.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector

ASSETS = {
    "place_nav_buoy": {"root": "SF_M4_HELIOS_NAV_SPIRE_ROOT"},
    "place_lane_beacon": {"root": "SF_M4_HELIOS_GANTRY_ROOT"},
}


def parse_args(argv):
    parser = argparse.ArgumentParser()
    parser.add_argument("--asset", required=True, choices=sorted(ASSETS))
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
            "location": list(obj.location),
            "rotation": list(obj.rotation_euler),
            "scale": list(obj.scale),
            "parent": obj.parent.name if obj.parent else None,
        }
        for obj in bpy.data.objects if obj.type == "EMPTY"
    }


def assert_empties(before):
    after = snapshot_empties()
    if after != before:
        raise RuntimeError(f"empty contract changed: before={before} after={after}")


def mesh_named(prefix: str):
    matches = [obj for obj in bpy.data.objects if obj.type == "MESH" and obj.name.startswith(prefix)]
    if not matches:
        raise RuntimeError(f"missing mesh {prefix}")
    return matches[0]


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


def open_upward_caps(obj, z_min, up_dot=0.45):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.faces.ensure_lookup_table()
    delete = []
    for face in bm.faces:
        center = obj.matrix_world @ face.calc_center_median()
        normal = obj.matrix_world.to_3x3() @ face.normal
        if normal.length < 1e-8:
            continue
        normal.normalize()
        if center.z >= z_min and normal.z >= up_dot:
            delete.append(face)
    count = len(delete)
    if delete:
        bmesh.ops.delete(bm, geom=delete, context="FACES")
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    return count


def add_cyl(name, radius, depth, location, material, cap="NGON", vertices=16):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices, radius=radius, depth=depth, end_fill_type=cap, location=location,
    )
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.clear()
    obj.data.materials.append(material)
    apply_object(obj)
    return obj


def add_box(name, dimensions, location, material, rotation=(0.0, 0.0, 0.0)):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location, rotation=rotation)
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


def remaster_buoy(root):
    report = {"deletedCaps": {}, "boolean": []}
    frame_mat = mesh_named("LOD0_Buoy_Stabilizer_Frame").data.materials[0]
    mark_mat = mesh_named("LOD0_Buoy_Service_Marking").data.materials[0]

    for lod in range(3):
        shell = mesh_named(f"LOD{lod}_Buoy_Pressure_Shell")
        frame = mesh_named(f"LOD{lod}_Buoy_Stabilizer_Frame")
        marking = mesh_named(f"LOD{lod}_Buoy_Service_Marking")
        report["deletedCaps"][shell.name] = open_upward_caps(shell, z_min=8.42, up_dot=0.42)

        verts = 12 if lod == 0 else 10 if lod == 1 else 8
        floor = add_cyl(f"LOD{lod}_HeadFloor", 0.74, 0.10, (0.0, 0.0, 8.08), frame_mat, vertices=verts)
        rim = add_cyl(
            f"LOD{lod}_HeadRim", 0.86, 0.18, (0.0, 0.0, 8.58), frame_mat, cap="NOTHING", vertices=verts,
        )
        band = add_cyl(f"LOD{lod}_DaymarkBand", 0.66, 0.95, (0.0, 0.0, 3.90), mark_mat, vertices=verts)
        for obj in (floor, rim, band):
            parent_keep_world(obj, root)
        join_into(frame, [floor, rim])
        join_into(marking, [band])
    return report


def remaster_beacon(root):
    report = {"deletedCaps": {}, "boolean": []}
    hull_mat = mesh_named("LOD0_Merged_Material_Hull").data.materials[0]
    mech_mat = mesh_named("LOD0_Merged_Material_Mechanical").data.materials[0]

    for lod in range(3):
        hull = mesh_named(f"LOD{lod}_Merged_Material_Hull")
        mech = mesh_named(f"LOD{lod}_Merged_Material_Mechanical")

        boom = add_box(f"LOD{lod}_BoomCutter", (4.8, 1.7, 2.0), (4.35, 0.0, 5.0), hull_mat)
        parent_keep_world(boom, root)
        ok = boolean_difference(hull, boom, solver="FLOAT")
        if not ok:
            boom = add_box(f"LOD{lod}_BoomCutterB", (4.8, 1.7, 2.0), (4.35, 0.0, 5.0), hull_mat)
            parent_keep_world(boom, root)
            ok = boolean_difference(hull, boom, solver="EXACT")
        report["boolean"].append({"lod": lod, "boomRemoved": ok})

        pod_cut = add_cyl(f"LOD{lod}_PodCutter", 0.82, 1.05, (8.05, 0.0, 5.45), hull_mat, vertices=12)
        parent_keep_world(pod_cut, root)
        pod_ok = boolean_difference(hull, pod_cut, solver="FLOAT")
        if not pod_ok:
            pod_cut = add_cyl(f"LOD{lod}_PodCutterB", 0.82, 1.05, (8.05, 0.0, 5.45), hull_mat, vertices=12)
            parent_keep_world(pod_cut, root)
            pod_ok = boolean_difference(hull, pod_cut, solver="EXACT")
        report["boolean"].append({"lod": lod, "podWell": pod_ok})

        rail_p = add_box(f"LOD{lod}_ArmRailPort", (5.4, 0.22, 0.34), (4.45, 1.05, 5.05), mech_mat)
        rail_s = add_box(f"LOD{lod}_ArmRailStbd", (5.4, 0.22, 0.34), (4.45, -1.05, 5.05), mech_mat)
        floor = add_cyl(f"LOD{lod}_PodFloor", 0.78, 0.08, (8.05, 0.0, 4.55), mech_mat, vertices=12 if lod == 0 else 8)
        cup = add_cyl(
            f"LOD{lod}_MastCup", 0.42, 0.28, (0.0, 0.0, 8.92), mech_mat, cap="NOTHING", vertices=12 if lod == 0 else 8,
        )
        extras = [rail_p, rail_s, floor, cup]
        for obj in extras:
            parent_keep_world(obj, root)
        join_into(mech, extras)
    return report


def export_glb(path: Path, root):
    bpy.ops.object.select_all(action="DESELECT")
    root.select_set(True)
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
    spec = ASSETS[args.asset]
    source = args.source.resolve()
    output = args.output.resolve()
    if not source.is_file():
        raise SystemExit(f"missing source {source}")

    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(source))
    root = find_object(spec["root"])
    empties = snapshot_empties()

    if args.asset == "place_nav_buoy":
        surgery = remaster_buoy(root)
    else:
        surgery = remaster_beacon(root)

    assert_empties(empties)
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
    export_glb(output, root)
    lod_stats = {}
    for lod in range(3):
        meshes = [obj for obj in bpy.data.objects if obj.type == "MESH" and obj.name.startswith(f"LOD{lod}_")]
        tris = 0
        for obj in meshes:
            obj.data.calc_loop_triangles()
            tris += len(obj.data.loop_triangles)
        lod_stats[f"lod{lod}"] = {"triangles": tris, "objects": [obj.name for obj in meshes]}
    report = {
        "ok": True,
        "asset": args.asset,
        "revision": "chase_surgical_v5",
        "source": str(source),
        "output": str(output),
        "surgery": surgery,
        "lod": lod_stats,
        "bytes": output.stat().st_size,
    }
    output.with_suffix(".report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report))


if __name__ == "__main__":
    main()
