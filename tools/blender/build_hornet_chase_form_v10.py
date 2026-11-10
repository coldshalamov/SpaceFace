"""One chase-camera interceptor form on the live Hornet sockets.

v10: white wings (not void cards), hull coaming around an open tub (not a black
picture-frame), and two open-topped transom throats (not roof-eye cylinders).
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

REVISION = "chase_form_v10"
AUTHORED_LENGTH_M = 10.8
COLLISION_DIAMETER_M = 32.0
SCALE = COLLISION_DIAMETER_M / AUTHORED_LENGTH_M

KEEP_SEPARATE = (
    "LOD0_Wing_",
    "LOD0_Flap_",
    "LOD0_Canard_",
    "LOD0_Drive",
    "LOD0_Tub",
    "LOD0_Radiator",
)

HONEST = {
    "Material_Hull": {"color": (1.0, 1.0, 1.0), "metallic": 0.0, "roughness": 0.28, "role": "hull"},
    "Material_Armor": {"color": (0.78, 0.80, 0.82), "metallic": 0.08, "roughness": 0.36, "role": "armor"},
    "Material_Canopy": {"color": (0.012, 0.016, 0.022), "metallic": 0.0, "roughness": 0.07, "role": "glass"},
    "Material_Ceramic": {"color": (0.22, 0.17, 0.13), "metallic": 0.0, "roughness": 0.58, "role": "ceramic"},
    "Material_Mechanical": {"color": (0.07, 0.075, 0.08), "metallic": 0.48, "roughness": 0.40, "role": "mechanical"},
    "Material_Radiator": {"color": (0.08, 0.07, 0.06), "metallic": 0.16, "roughness": 0.55, "role": "radiator"},
    "Material_Thruster": {"color": (0.04, 0.04, 0.045), "metallic": 0.38, "roughness": 0.48, "role": "thruster"},
    "Material_Accent": {"color": (0.46, 0.14, 0.06), "metallic": 0.04, "roughness": 0.42, "role": "accent"},
    "Material_Warning": {"color": (0.08, 0.085, 0.09), "metallic": 0.18, "roughness": 0.50, "role": "warning"},
}


def parse_args(argv):
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    return parser.parse_args(argv)


def find_root():
    named = bpy.data.objects.get("HORNET_LOD0_ROOT")
    if named:
        return named
    matches = [
        obj for obj in bpy.data.objects
        if obj.type == "EMPTY" and "HORNET" in obj.name.upper() and "ROOT" in obj.name.upper()
    ]
    if len(matches) == 1:
        return matches[0]
    raise RuntimeError("missing Hornet root")


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
        raise RuntimeError("empty contract changed")


def parent_keep_world(obj, root):
    world = obj.matrix_world.copy()
    obj.parent = root
    obj.matrix_world = world


def is_collision(obj):
    name = obj.name.upper()
    return "COLLISION" in name or bool(obj.get("collision")) or bool(obj.get("nonRender"))


def apply_object(obj):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    obj.select_set(False)


def join_into(target, extras):
    extras = [obj for obj in extras if obj and obj.name in bpy.data.objects and obj != target]
    if not extras:
        return
    bpy.ops.object.select_all(action="DESELECT")
    target.select_set(True)
    for extra in extras:
        extra.select_set(True)
    bpy.context.view_layer.objects.active = target
    bpy.ops.object.join()
    target.select_set(False)


def finish_mesh(obj, material, bevel=0.010):
    obj.data.materials.clear()
    obj.data.materials.append(material)
    if bevel > 0:
        mod = obj.modifiers.new("FormBevel", "BEVEL")
        mod.width = bevel
        mod.segments = 2
        mod.limit_method = "ANGLE"
        mod.angle_limit = math.radians(32)
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        bpy.ops.object.modifier_apply(modifier=mod.name)
        obj.select_set(False)
    wn = obj.modifiers.new("WeightedNormal", "WEIGHTED_NORMAL")
    wn.keep_sharp = True
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    try:
        bpy.ops.object.modifier_apply(modifier=wn.name)
    except Exception:
        if wn.name in obj.modifiers:
            obj.modifiers.remove(wn)
    obj.select_set(False)
    try:
        obj.data.use_auto_smooth = True
        obj.data.auto_smooth_angle = math.radians(28)
    except Exception:
        pass
    return obj


def loft_rings(name, rings, material, bevel=0.010, cap=True):
    sides = len(rings[0])
    verts = [vert for ring in rings for vert in ring]
    faces = []
    if cap:
        faces.append(tuple(range(sides - 1, -1, -1)))
        faces.append(tuple(range((len(rings) - 1) * sides, len(rings) * sides)))
    for station in range(len(rings) - 1):
        a = station * sides
        b = (station + 1) * sides
        for i in range(sides):
            j = (i + 1) % sides
            faces.append((a + i, a + j, b + j, b + i))
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return finish_mesh(obj, material, bevel)


def chine_ring(x, hw, hh, zc=0.12, keel=0.10, yc=0.0):
    """Eight-point chined station. Facets must catch chase light like Hitch."""
    return [
        (x, yc + 0.0, zc + hh),
        (x, yc + hw * 0.82, zc + hh * 0.48),
        (x, yc + hw, zc - hh * 0.12),
        (x, yc + hw * 0.42, zc - hh - keel),
        (x, yc + 0.0, zc - hh - keel),
        (x, yc - hw * 0.42, zc - hh - keel),
        (x, yc - hw, zc - hh * 0.12),
        (x, yc - hw * 0.82, zc + hh * 0.48),
    ]


def airfoil(x_le, y, z, chord, thick):
    return [
        (x_le, y, z),
        (x_le - chord * 0.08, y, z + thick * 0.45),
        (x_le - chord * 0.20, y, z + thick * 0.88),
        (x_le - chord * 0.38, y, z + thick),
        (x_le - chord * 0.58, y, z + thick * 0.72),
        (x_le - chord * 0.78, y, z + thick * 0.32),
        (x_le - chord, y, z),
        (x_le - chord * 0.80, y, z - thick * 0.38),
        (x_le - chord * 0.52, y, z - thick * 0.58),
        (x_le - chord * 0.24, y, z - thick * 0.42),
        (x_le - chord * 0.08, y, z - thick * 0.18),
    ]


def add_box(name, dimensions, location, material, bevel=0.006, rotation=(0.0, 0.0, 0.0)):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.0, 0.0, 0.0))
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.rotation_euler = rotation
    obj.location = location
    apply_object(obj)
    obj.select_set(False)
    return finish_mesh(obj, material, bevel)


def boolean_difference(target, cutter, solver="FLOAT"):
    modifier = target.modifiers.new("SF_FormCut", "BOOLEAN")
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
    ok = boolean_difference(target, cutter, solver="FLOAT")
    if ok:
        return True
    cutter = maker()
    return boolean_difference(target, cutter, solver="EXACT")


def make_materials():
    mats = {}
    for name, spec in HONEST.items():
        material = bpy.data.materials.get(name) or bpy.data.materials.new(name)
        material.use_nodes = True
        bsdf = next((node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED"), None)
        if bsdf is None:
            continue
        for socket in bsdf.inputs:
            for link in list(socket.links):
                material.node_tree.links.remove(link)
        output = next((node for node in material.node_tree.nodes if node.type == "OUTPUT_MATERIAL"), None)
        if output and not bsdf.outputs["BSDF"].links:
            material.node_tree.links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])
        bsdf.inputs["Base Color"].default_value = (*spec["color"], 1.0)
        bsdf.inputs["Metallic"].default_value = spec["metallic"]
        bsdf.inputs["Roughness"].default_value = spec["roughness"]
        if "Emission Strength" in bsdf.inputs:
            bsdf.inputs["Emission Strength"].default_value = 0.0
        if "Transmission Weight" in bsdf.inputs:
            bsdf.inputs["Transmission Weight"].default_value = 0.0
        material.blend_method = "OPAQUE"
        material["spacefaceRole"] = spec["role"]
        mats[name] = material
    return mats


def delete_render_meshes():
    for obj in list(bpy.data.objects):
        if obj.type != "MESH":
            continue
        if is_collision(obj):
            continue
        bpy.data.objects.remove(obj, do_unlink=True)


def build_hull(mats):
    hull_mat = mats["Material_Hull"]
    stations = [
        (5.42, 0.11, 0.10, 0.08),
        (4.40, 0.32, 0.26, 0.20),
        (3.35, 0.50, 0.74, 0.38),
        (1.40, 0.96, 0.44, 0.18),
        (-0.35, 0.74, 0.38, 0.16),
        (-2.15, 0.90, 0.54, 0.22),
        (-3.70, 1.20, 0.88, 0.32),
        (-5.28, 1.24, 0.92, 0.34),
    ]
    hull = loft_rings("LOD0_Hull", [chine_ring(x, hw, hh, zc) for x, hw, hh, zc in stations], hull_mat, 0.012)
    return hull, []


def build_wings(mats):
    hull_mat = mats["Material_Hull"]
    armor = mats["Material_Armor"]
    mech = mats["Material_Mechanical"]
    wings = []
    for sign, tag in ((1.0, "Stbd"), (-1.0, "Port")):
        rings = [
            airfoil(1.40, 0.90 * sign, 0.16, 2.90, 0.92),
            airfoil(0.70, 1.28 * sign, 0.18, 2.20, 0.56),
            airfoil(0.10, 1.68 * sign, 0.20, 1.55, 0.36),
            airfoil(-0.38, 2.02 * sign, 0.22, 0.95, 0.18),
            airfoil(-0.68, 2.30 * sign, 0.22, 0.48, 0.09),
        ]
        wing = loft_rings(f"LOD0_Wing_{tag}", rings, hull_mat, 0.014)

        def slot_cut(name=f"FlapSlotCut_{tag}", loc=(-0.62, 1.62 * sign, 0.16)):
            return add_box(name, (0.34, 1.45, 0.38), loc, mech, 0.0)

        cut(wing, slot_cut)
        strake = loft_rings(
            f"LOD0_WingStrake_{tag}",
            [
                airfoil(1.48, 0.74 * sign, 0.10, 2.40, 0.62),
                airfoil(1.40, 0.90 * sign, 0.16, 2.90, 0.92),
            ],
            hull_mat, 0.012,
        )
        flap = loft_rings(
            f"LOD0_Flap_{tag}",
            [
                airfoil(-0.58, 1.78 * sign, 0.10, 0.52, 0.08),
                airfoil(-0.92, 2.02 * sign, 0.14, 0.30, 0.05),
            ],
            armor, 0.006,
        )
        wings.extend([wing, strake, flap])
    canard_p = loft_rings(
        "LOD0_Canard_Port",
        [
            airfoil(4.62, -0.32, 0.05, 0.82, 0.12),
            airfoil(4.28, -0.88, 0.07, 0.40, 0.05),
        ],
        hull_mat, 0.006,
    )
    canard_s = loft_rings(
        "LOD0_Canard_Stbd",
        [
            airfoil(4.62, 0.32, 0.05, 0.82, 0.12),
            airfoil(4.28, 0.88, 0.07, 0.40, 0.05),
        ],
        hull_mat, 0.006,
    )
    wings.extend([canard_p, canard_s])
    return wings


def build_canopy(hull, mats):
    hull_mat = mats["Material_Hull"]
    mech = mats["Material_Mechanical"]
    report = {}

    def tub():
        return add_box("VisorTubCut", (1.70, 0.92, 0.78), (3.38, 0.0, 0.70), hull_mat, 0.0)

    report["tub"] = cut(hull, tub)
    floor = add_box("LOD0_TubFloor", (1.48, 0.74, 0.06), (3.38, 0.0, 0.16), mech, 0.001)
    coaming = add_box("LOD0_Coaming", (1.88, 1.04, 0.05), (3.38, 0.0, 1.08), hull_mat, 0.002)

    def coaming_hole():
        return add_box("CoamingCut", (1.56, 0.78, 0.16), (3.38, 0.0, 1.08), hull_mat, 0.0)

    cut(coaming, coaming_hole)
    report["coaming"] = True
    return [floor, coaming], report


def build_drives(hull, mats):
    """Open-topped transom bays: break the house roof AND the aft wall."""
    hull_mat = mats["Material_Hull"]
    mech = mats["Material_Mechanical"]
    bits = []
    report = []
    for sign, tag in ((-1.0, "Port"), (1.0, "Stbd")):
        y = 0.58 * sign

        def well(name=f"DriveWell_{tag}", loc=(-4.92, y, 0.48)):
            return add_box(name, (1.55, 0.82, 1.55), loc, hull_mat, 0.0)

        ok = cut(hull, well)
        liner = add_box(
            f"LOD0_DriveLiner_{tag}",
            (1.28, 0.64, 0.07),
            (-4.78, y, -0.22),
            mech, 0.001,
        )
        splitter = add_box(
            f"LOD0_DriveWall_{tag}",
            (1.18, 0.05, 0.52),
            (-4.78, y - 0.26 * sign, 0.12),
            mech, 0.0,
        )
        report.append({"tag": tag, "dorsal": ok, "aft": True})
        bits.extend([liner, splitter])
    return bits, report


def build_radiator(hull, mats):
    """Cassette in the port wing, not a second spine eye."""
    rad = mats["Material_Radiator"]
    wing = next((obj for obj in bpy.data.objects if obj.name.startswith("LOD0_Wing_Port")), None)
    if wing is None:
        return [], False

    def well():
        return add_box("RadiatorCut", (0.78, 0.48, 0.24), (0.20, -1.42, 0.20), rad, 0.0)

    ok = cut(wing, well)
    fins = []
    for index in range(6):
        fin = add_box(
            f"LOD0_RadiatorFin_{index}",
            (0.10, 0.36, 0.14),
            (-0.10 + index * 0.11, -1.42, 0.12),
            rad, 0.001,
        )
        fins.append(fin)
    return fins, ok


def shade_objects(objs):
    for obj in objs:
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        try:
            if any(token in obj.name for token in ("Hull", "Wing", "Canard", "Coaming", "Flap")):
                bpy.ops.object.shade_flat()
            else:
                bpy.ops.object.shade_smooth_by_angle(angle=math.radians(22))
        except TypeError:
            bpy.ops.object.shade_flat()
        obj.select_set(False)


def purge_stray_meshes():
    for obj in list(bpy.data.objects):
        if obj.type != "MESH":
            continue
        if is_collision(obj):
            continue
        if obj.name.startswith("LOD0_"):
            continue
        bpy.data.objects.remove(obj, do_unlink=True)


def mesh_world_size():
    low = Vector((1e12, 1e12, 1e12))
    high = Vector((-1e12, -1e12, -1e12))
    for obj in bpy.data.objects:
        if obj.type != "MESH" or is_collision(obj):
            continue
        for corner in obj.bound_box:
            point = obj.matrix_world @ Vector(corner)
            for axis in range(3):
                low[axis] = min(low[axis], point[axis])
                high[axis] = max(high[axis], point[axis])
    return high - low


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


def keep_separate(obj):
    return obj.name.startswith(KEEP_SEPARATE)


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
    delete_render_meshes()
    mats = make_materials()
    hull, courses = build_hull(mats)
    wings = build_wings(mats)
    canopy_bits, canopy_report = build_canopy(hull, mats)
    drive_bits, drive_report = build_drives(hull, mats)
    rad_bits, rad_ok = build_radiator(hull, mats)

    built = [hull, *courses, *wings, *canopy_bits, *drive_bits, *rad_bits]
    for obj in built:
        if obj and obj.name in bpy.data.objects:
            parent_keep_world(obj, root)
    join_into(hull, courses)
    hull_bits = [
        obj for obj in bpy.data.objects
        if obj.type == "MESH" and obj.data.materials and obj.data.materials[0] == mats["Material_Hull"]
        and obj != hull and not is_collision(obj) and not keep_separate(obj)
    ]
    join_into(hull, hull_bits)
    ceramic_bits = [obj for obj in bpy.data.objects if obj.type == "MESH" and obj.data.materials and obj.data.materials[0] == mats["Material_Ceramic"]]
    if ceramic_bits:
        join_into(ceramic_bits[0], ceramic_bits[1:])
    rad_join = [obj for obj in bpy.data.objects if obj.type == "MESH" and obj.data.materials and obj.data.materials[0] == mats["Material_Radiator"]]
    if rad_join:
        join_into(rad_join[0], rad_join[1:])
    thrust_bits = [obj for obj in bpy.data.objects if obj.type == "MESH" and obj.data.materials and obj.data.materials[0] == mats["Material_Thruster"]]
    if thrust_bits:
        join_into(thrust_bits[0], thrust_bits[1:])
    purge_stray_meshes()

    assert_empties(empties)
    shade_objects([obj for obj in bpy.data.objects if obj.type == "MESH" and not is_collision(obj)])
    root.scale = (SCALE, SCALE, SCALE)
    bpy.context.view_layer.update()
    size = mesh_world_size()
    if size.z > 12.0 or size.x < 20.0:
        raise RuntimeError(f"form envelope broken: size=({size.x:.2f},{size.y:.2f},{size.z:.2f})")
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
        "canopy": canopy_report,
        "drives": drive_report,
        "radiator": rad_ok,
        "size": [round(float(size.x), 3), round(float(size.y), 3), round(float(size.z), 3)],
        "triangles": tris,
        "objects": [obj.name for obj in meshes],
        "bytes": output.stat().st_size,
    }
    output.with_suffix(".report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report))


if __name__ == "__main__":
    main()
