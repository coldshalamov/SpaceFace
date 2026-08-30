"""Build the Hornet C185 full-job reset on the frozen live identity contract.

The source GLB donates only its root, sockets, collision hull, and display scale.
All visible meshes are rebuilt as one connected three-house interceptor with
faired wings, a recessed canopy tub, and twin throats in one shared transom.
Outputs are review candidates only; this script never writes live or release paths.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

REVISION = "cycle_185_full_job_reset"
AUTHORED_LENGTH_M = 10.8
COLLISION_DIAMETER_M = 32.0
SCALE = COLLISION_DIAMETER_M / AUTHORED_LENGTH_M

HONEST = {
    "Material_Hull": {
        "color": (0.68, 0.71, 0.75),
        "metallic": 0.0,
        "roughness": 0.46,
        "coat": 0.25,
        "role": "hull",
    },
    "Material_Hunt": {
        "color": (0.62, 0.67, 0.72),
        "metallic": 0.0,
        "roughness": 0.44,
        "coat": 0.24,
        "role": "hull",
    },
    "Material_Transom": {
        "color": (0.46, 0.50, 0.56),
        "metallic": 0.02,
        "roughness": 0.52,
        "coat": 0.12,
        "role": "hull",
    },
    "Material_HullPanel": {
        "color": (0.56, 0.60, 0.66),
        "metallic": 0.0,
        "roughness": 0.50,
        "coat": 0.18,
        "role": "hull",
    },
    "Material_Wing": {
        "color": (0.52, 0.56, 0.62),
        "metallic": 0.0,
        "roughness": 0.46,
        "coat": 0.15,
        "role": "wing",
    },
    "Material_Armor": {
        "color": (0.14, 0.15, 0.17),
        "metallic": 0.02,
        "roughness": 0.50,
        "role": "armor",
    },
    "Material_Canopy": {
        "color": (0.12, 0.18, 0.22),
        "metallic": 0.0,
        "roughness": 0.18,
        "coat": 0.12,
        "role": "glass",
    },
    "Material_Frame": {
        "color": (0.44, 0.48, 0.53),
        "metallic": 0.92,
        "roughness": 0.32,
        "role": "mechanical",
    },
    "Material_Ceramic": {
        "color": (0.44, 0.34, 0.24),
        "metallic": 0.0,
        "roughness": 0.70,
        "role": "ceramic",
    },
    "Material_Mechanical": {
        "color": (0.22, 0.21, 0.19),
        "metallic": 0.92,
        "roughness": 0.30,
        "role": "mechanical",
    },
    "Material_Radiator": {
        "color": (0.14, 0.11, 0.09),
        "metallic": 0.80,
        "roughness": 0.48,
        "role": "radiator",
    },
    "Material_Soot": {
        "color": (0.022, 0.020, 0.018),
        "metallic": 0.0,
        "roughness": 0.82,
        "role": "soot",
    },
    "Material_Gap": {
        "color": (0.08, 0.08, 0.09),
        "metallic": 0.0,
        "roughness": 0.70,
        "role": "gap",
    },
    "Material_Warning": {
        "color": (0.90, 0.16, 0.03),
        "metallic": 0.0,
        "roughness": 0.38,
        "role": "warning",
    },
    "Material_Repair": {
        "color": (0.40, 0.36, 0.28),
        "metallic": 0.0,
        "roughness": 0.50,
        "role": "repair",
    },
}


def parse_args(argv):
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--lod", type=int, choices=(0, 1, 2), default=0)
    return parser.parse_args(argv)


def find_root(lod):
    named = bpy.data.objects.get(f"HORNET_LOD{lod}_ROOT")
    if named:
        return named
    matches = [
        obj
        for obj in bpy.data.objects
        if obj.type == "EMPTY"
        and "HORNET" in obj.name.upper()
        and "ROOT" in obj.name.upper()
    ]
    if len(matches) == 1:
        return matches[0]
    raise RuntimeError(f"missing Hornet LOD{lod} root")


def snapshot_empties():
    return {
        obj.name: {
            "location": [round(v, 6) for v in obj.location],
            "rotation": [round(v, 6) for v in obj.rotation_euler],
            "scale": [round(v, 6) for v in obj.scale],
            "parent": obj.parent.name if obj.parent else None,
        }
        for obj in bpy.data.objects
        if obj.type == "EMPTY"
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
    return (
        "COLLISION" in name or bool(obj.get("collision")) or bool(obj.get("nonRender"))
    )


def apply_object(obj):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    obj.select_set(False)


def join_into(target, extras):
    extras = [
        obj for obj in extras if obj and obj.name in bpy.data.objects and obj != target
    ]
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
        mod.angle_limit = math.radians(28)
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


def loft_rings(name, rings, material, bevel=0.010, cap=True, closed=True):
    sides = len(rings[0])
    verts = [vert for ring in rings for vert in ring]
    faces = []
    if cap:
        faces.append(tuple(range(sides - 1, -1, -1)))
        faces.append(tuple(range((len(rings) - 1) * sides, len(rings) * sides)))
    for station in range(len(rings) - 1):
        a = station * sides
        b = (station + 1) * sides
        for i in range(sides if closed else sides - 1):
            j = (i + 1) % sides
            faces.append((a + i, a + j, b + j, b + i))
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return finish_mesh(obj, material, bevel)


def assign_lower_material(obj, material, z_threshold=0.0):
    """Expose real airfoil thickness with a darker underside, not a texture line."""
    obj.data.materials.append(material)
    for polygon in obj.data.polygons:
        mean_z = sum(obj.data.vertices[index].co.z for index in polygon.vertices) / len(
            polygon.vertices
        )
        if mean_z < z_threshold:
            polygon.material_index = len(obj.data.materials) - 1
    return obj


def assign_longitudinal_materials(obj, hunt, transom):
    """Keep one connected shell while letting each house retain its substance."""
    obj.data.materials.append(hunt)
    hunt_index = len(obj.data.materials) - 1
    obj.data.materials.append(transom)
    transom_index = len(obj.data.materials) - 1
    for polygon in obj.data.polygons:
        mean_x = sum(obj.data.vertices[index].co.x for index in polygon.vertices) / len(
            polygon.vertices
        )
        if mean_x > 2.62:
            polygon.material_index = hunt_index
        elif mean_x < -1.72:
            polygon.material_index = transom_index
    return obj


def chine_ring(x, hw, hh, zc=0.12, keel=0.10, yc=0.0):
    """Twelve-point chined fuselage station. Mid must not equal bow."""
    return [
        (x, yc + 0.0, zc + hh),
        (x, yc + hw * 0.45, zc + hh * 0.92),
        (x, yc + hw * 0.92, zc + hh * 0.42),
        (x, yc + hw, zc + hh * 0.08),
        (x, yc + hw * 0.92, zc - hh * 0.35),
        (x, yc + hw * 0.40, zc - hh * 0.82 - keel),
        (x, yc + 0.0, zc - hh - keel),
        (x, yc - hw * 0.40, zc - hh * 0.82 - keel),
        (x, yc - hw * 0.92, zc - hh * 0.35),
        (x, yc - hw, zc + hh * 0.08),
        (x, yc - hw * 0.92, zc + hh * 0.42),
        (x, yc - hw * 0.45, zc + hh * 0.92),
    ]


def airfoil(x_le, y, z, chord, thick):
    return [
        (x_le, y, z),
        (x_le - chord * 0.10, y, z + thick * 0.48),
        (x_le - chord * 0.28, y, z + thick),
        (x_le - chord * 0.55, y, z + thick * 0.70),
        (x_le - chord * 0.82, y, z + thick * 0.22),
        (x_le - chord, y, z),
        (x_le - chord * 0.82, y, z - thick * 0.18),
        (x_le - chord * 0.55, y, z - thick * 0.42),
        (x_le - chord * 0.28, y, z - thick * 0.72),
        (x_le - chord * 0.10, y, z - thick * 0.32),
    ]


def add_box(
    name, dimensions, location, material, bevel=0.006, rotation=(0.0, 0.0, 0.0)
):
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


def add_cyl(
    name,
    radius,
    depth,
    location,
    material,
    rotation=(0.0, 0.0, 0.0),
    vertices=16,
    cap="NGON",
):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices,
        radius=radius,
        depth=depth,
        end_fill_type=cap,
        location=(0.0, 0.0, 0.0),
        rotation=(0.0, 0.0, 0.0),
    )
    obj = bpy.context.object
    obj.name = name
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.rotation_euler = rotation
    obj.location = location
    apply_object(obj)
    obj.select_set(False)
    return finish_mesh(obj, material, 0.004)


def add_annulus(
    name,
    outer_radius,
    inner_radius,
    depth,
    location,
    material,
    vertices=24,
    rotation_y=0.0,
):
    """Open X-axis ring with real inner walls; never a painted or solid drive disc."""
    verts = []
    for x in (-depth * 0.5, depth * 0.5):
        for radius in (outer_radius, inner_radius):
            for index in range(vertices):
                angle = math.tau * index / vertices
                verts.append((x, radius * math.cos(angle), radius * math.sin(angle)))
    outer_a, inner_a = 0, vertices
    outer_b, inner_b = vertices * 2, vertices * 3
    faces = []
    for index in range(vertices):
        nxt = (index + 1) % vertices
        faces.extend(
            [
                (outer_a + index, outer_a + nxt, outer_b + nxt, outer_b + index),
                (inner_a + nxt, inner_a + index, inner_b + index, inner_b + nxt),
                (outer_a + index, inner_a + index, inner_a + nxt, outer_a + nxt),
                (outer_b + nxt, inner_b + nxt, inner_b + index, outer_b + index),
            ]
        )
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler.y = rotation_y
    apply_object(obj)
    return finish_mesh(obj, material, 0.004)


def add_prism_panel(name, outline, z, thickness, material):
    """One brake-formed trapezoid following a house, never a generic cube."""
    verts = [(x, y, z) for x, y in outline] + [
        (x, y, z + thickness) for x, y in outline
    ]
    count = len(outline)
    faces = [tuple(range(count - 1, -1, -1)), tuple(range(count, count * 2))]
    for index in range(count):
        nxt = (index + 1) % count
        faces.append((index, nxt, count + nxt, count + index))
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return finish_mesh(obj, material, min(thickness * 0.35, 0.008))


def add_decal_plane(name, outline, z, material):
    """Albedo-only zero-thickness paint/repair island."""
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata([(x, y, z) for x, y in outline], [], [tuple(range(len(outline)))])
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return finish_mesh(obj, material, 0.0)


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
        bsdf = next(
            (
                node
                for node in material.node_tree.nodes
                if node.type == "BSDF_PRINCIPLED"
            ),
            None,
        )
        if bsdf is None:
            continue
        for socket in bsdf.inputs:
            for link in list(socket.links):
                material.node_tree.links.remove(link)
        output = next(
            (
                node
                for node in material.node_tree.nodes
                if node.type == "OUTPUT_MATERIAL"
            ),
            None,
        )
        if output and not bsdf.outputs["BSDF"].links:
            material.node_tree.links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])
        bsdf.inputs["Base Color"].default_value = (*spec["color"], 1.0)
        bsdf.inputs["Metallic"].default_value = spec["metallic"]
        bsdf.inputs["Roughness"].default_value = spec["roughness"]
        if "Coat Weight" in bsdf.inputs:
            bsdf.inputs["Coat Weight"].default_value = spec.get("coat", 0.0)
        if "Coat Roughness" in bsdf.inputs:
            bsdf.inputs["Coat Roughness"].default_value = 0.12
        if "Emission Strength" in bsdf.inputs:
            bsdf.inputs["Emission Strength"].default_value = 0.0
        if "Transmission Weight" in bsdf.inputs:
            bsdf.inputs["Transmission Weight"].default_value = 0.0
        material.blend_method = "OPAQUE"
        material.diffuse_color = (*spec["color"], 1.0)
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


def build_hull(mats, lod):
    hull_mat = mats["Material_Hull"]
    hunt_mat = mats["Material_Hunt"]
    transom_mat = mats["Material_Transom"]
    armor = mats["Material_Armor"]
    stations = [
        (5.48, 0.18, 0.16, 0.08),
        (4.80, 0.42, 0.48, 0.24),
        (3.80, 0.62, 0.56, 0.24),
        (2.80, 0.68, 0.50, 0.18),
        (2.62, 1.72, 0.36, 0.10),
        (1.20, 2.10, 0.34, 0.08),
        (-0.50, 2.00, 0.36, 0.10),
        (-1.58, 1.70, 0.38, 0.12),
        (-1.76, 0.95, 0.64, 0.18),
        (-3.00, 1.05, 0.66, 0.18),
        (-4.20, 1.10, 0.63, 0.16),
        (-4.80, 1.08, 0.60, 0.14),
        (-5.06, 1.02, 0.58, 0.12),
    ]
    if not (
        stations[5][1] > stations[3][1] + 0.60
        and stations[5][1] > stations[9][1] + 0.30
    ):
        raise RuntimeError("three-house width contract failed")
    if lod == 2:
        stations = [stations[index] for index in (0, 2, 3, 4, 6, 8, 10, 12)]
    hull = loft_rings(
        f"LOD{lod}_Hull",
        [
            chine_ring(
                x, hw, hh, zc, keel=0.08 if x > 2.0 else (0.10 if x > -2.0 else 0.06)
            )
            for x, hw, hh, zc in stations
        ],
        hull_mat,
        0.012 if lod == 0 else 0.008,
    )
    hull["spacefaceConstruction"] = "connected_three_house_chine_loft"
    assign_longitudinal_materials(hull, hunt_mat, transom_mat)
    courses = []
    if lod < 2:
        courses.extend(
            [
                loft_rings(
                    f"LOD{lod}_HuntSaddleBand",
                    [
                        chine_ring(2.72, 0.72, 0.51, 0.18),
                        chine_ring(2.58, 1.74, 0.38, 0.10),
                    ],
                    armor,
                    0.006,
                ),
                loft_rings(
                    f"LOD{lod}_SaddleTransomBand",
                    [
                        chine_ring(-1.66, 1.72, 0.40, 0.12),
                        chine_ring(-1.82, 0.97, 0.66, 0.18),
                    ],
                    armor,
                    0.006,
                ),
            ]
        )
    return hull, courses


def build_wings(mats, lod):
    wing_mat = mats["Material_Wing"]
    armor = mats["Material_Armor"]
    hull_mat = mats["Material_Hull"]
    gap = mats["Material_Gap"]
    wings = []
    for sign, tag in ((1.0, "Stbd"), (-1.0, "Port")):
        specs = [
            (0.70, 1.72 * sign, 0.10, 3.00, 0.55),
            (0.48, 2.18 * sign, 0.14, 2.62, 0.45),
            (-0.05, 2.72 * sign, 0.20, 1.90, 0.30),
            (-0.82, 3.40 * sign, 0.28, 0.78, 0.14),
        ]
        if lod == 2:
            specs = [specs[index] for index in (0, 2, 3)]
        wing = loft_rings(
            f"LOD{lod}_Wing_{tag}",
            [airfoil(x_le, y, z, chord, thick) for x_le, y, z, chord, thick in specs],
            wing_mat,
            0.012 if lod == 0 else 0.007,
        )
        assign_lower_material(wing, armor, z_threshold=0.02)
        strake = loft_rings(
            f"LOD{lod}_WingRootFairing_{tag}",
            [
                airfoil(0.88, 1.30 * sign, 0.08, 3.28, 0.68),
                airfoil(0.70, 1.72 * sign, 0.10, 3.00, 0.55),
                airfoil(0.48, 2.18 * sign, 0.14, 2.62, 0.45),
            ],
            hull_mat,
            0.012,
        )
        wings.extend([wing, strake])
        if lod < 2:

            def slot_cut(name=f"FlapSlotCut_{tag}", loc=(-1.82, 2.62 * sign, 0.18)):
                return add_box(name, (0.18, 1.25, 0.28), loc, gap, 0.0)

            flap = loft_rings(
                f"LOD{lod}_Flap_{tag}",
                [
                    airfoil(-1.78, 2.20 * sign, 0.08, 0.58, 0.10),
                    airfoil(-2.04, 3.05 * sign, 0.14, 0.30, 0.06),
                ],
                armor,
                0.005,
            )
            wings.append(flap)
    if lod < 2:
        for sign, tag in ((1.0, "Stbd"), (-1.0, "Port")):
            wings.append(
                loft_rings(
                    f"LOD{lod}_Canard_{tag}",
                    [
                        airfoil(4.55, 0.32 * sign, 0.06, 0.80, 0.12),
                        airfoil(4.20, 0.92 * sign, 0.08, 0.38, 0.06),
                    ],
                    armor,
                    0.005,
                )
            )
            wings.append(
                add_box(
                    f"LOD{lod}_GunCheek_{tag}",
                    (0.55, 0.16, 0.20),
                    (4.55, 0.43 * sign, 0.02),
                    armor,
                    0.008,
                )
            )
    return wings


def canopy_arch_ring(x, hw, hh, zc):
    """Open-bottom greenhouse station so the recessed tub remains visible."""
    return [
        (x, -hw, zc),
        (x, -hw * 0.88, zc + hh * 0.38),
        (x, -hw * 0.55, zc + hh * 0.78),
        (x, -hw * 0.25, zc + hh * 0.96),
        (x, 0.0, zc + hh),
        (x, hw * 0.25, zc + hh * 0.96),
        (x, hw * 0.55, zc + hh * 0.78),
        (x, hw * 0.88, zc + hh * 0.38),
        (x, hw, zc),
    ]


def build_canopy(hull, mats, lod):
    hull_mat = mats["Material_Hull"]
    glass = mats["Material_Canopy"]
    frame = mats["Material_Frame"]
    soot = mats["Material_Soot"]
    report = {}

    def tub():
        return add_box(
            "CanopyTubCut", (1.72, 1.00, 0.56), (3.75, 0.0, 0.70), hull_mat, 0.0
        )

    report["tub"] = cut(hull, tub) if lod < 2 else False
    bits = []
    if lod < 2:
        bits.append(
            add_box(
                f"LOD{lod}_CanopyTubFloor",
                (1.48, 0.76, 0.06),
                (3.75, 0.0, 0.38),
                soot,
                0.001,
            )
        )
        bits.extend(
            [
                add_box(
                    f"LOD{lod}_CanopyTubWallPort",
                    (1.50, 0.035, 0.24),
                    (3.75, -0.40, 0.48),
                    soot,
                    0.001,
                ),
                add_box(
                    f"LOD{lod}_CanopyTubWallStbd",
                    (1.50, 0.035, 0.24),
                    (3.75, 0.40, 0.48),
                    soot,
                    0.001,
                ),
                add_box(
                    f"LOD{lod}_CanopyTubWallFore",
                    (0.035, 0.80, 0.24),
                    (4.50, 0.0, 0.48),
                    soot,
                    0.001,
                ),
                add_box(
                    f"LOD{lod}_CanopyTubWallAft",
                    (0.035, 0.80, 0.24),
                    (3.00, 0.0, 0.48),
                    soot,
                    0.001,
                ),
            ]
        )
    pane = loft_rings(
        f"LOD{lod}_Canopy",
        [
            canopy_arch_ring(4.60, 0.025, 0.025, 0.52),
            canopy_arch_ring(4.42, 0.25, 0.24, 0.52),
            canopy_arch_ring(4.02, 0.44, 0.42, 0.52),
            canopy_arch_ring(3.48, 0.44, 0.40, 0.50),
            canopy_arch_ring(3.08, 0.25, 0.22, 0.50),
            canopy_arch_ring(2.92, 0.025, 0.025, 0.50),
        ],
        glass,
        0.003,
        cap=False,
        closed=False,
    )
    bits.append(pane)
    if lod < 2:
        bits.extend(
            [
                add_box(
                    f"LOD{lod}_CanopyFramePort",
                    (1.64, 0.035, 0.050),
                    (3.75, -0.44, 0.52),
                    frame,
                    0.002,
                ),
                add_box(
                    f"LOD{lod}_CanopyFrameStbd",
                    (1.64, 0.035, 0.050),
                    (3.75, 0.44, 0.52),
                    frame,
                    0.002,
                ),
            ]
        )
    return bits, report


def build_drives(hull, mats, lod):
    hull_mat = mats["Material_Hull"]
    ceramic = mats["Material_Ceramic"]
    frame = mats["Material_Frame"]
    soot = mats["Material_Soot"]
    mech = mats["Material_Mechanical"]
    bits = []
    report = []
    for sign, tag in ((-1.0, "Port"), (1.0, "Stbd")):
        y = 0.50 * sign

        def aft():
            return add_cyl(
                f"DriveAftCut_{tag}",
                0.40,
                1.10,
                (-4.94, y, 0.14),
                hull_mat,
                rotation=(0.0, math.radians(65.0), 0.0),
                vertices=16,
            )

        opened = cut(hull, aft)
        rim = add_annulus(
            f"LOD{lod}_DriveRim_{tag}",
            0.50,
            0.39,
            0.12,
            (-5.00, y, 0.14),
            frame,
            vertices=24 if lod == 0 else 16,
            rotation_y=math.radians(-25.0),
        )
        liner = add_annulus(
            f"LOD{lod}_DriveCeramic_{tag}",
            0.39,
            0.30,
            0.16,
            (-4.94, y, 0.14),
            ceramic,
            vertices=20 if lod == 0 else 14,
            rotation_y=math.radians(-25.0),
        )
        bore = add_cyl(
            f"LOD{lod}_DriveBore_{tag}",
            0.29,
            0.06,
            (-4.86, y, 0.14),
            soot,
            rotation=(0.0, math.radians(65.0), 0.0),
            vertices=18 if lod < 2 else 12,
        )
        bits.extend([rim, liner, bore])
        vane_count = 8 if lod == 0 else (4 if lod == 1 else 0)
        if vane_count:
            hub = add_cyl(
                f"LOD{lod}_DriveHub_{tag}",
                0.07,
                0.06,
                (-5.02, y, 0.14),
                ceramic,
                rotation=(0.0, math.radians(65.0), 0.0),
                vertices=10,
            )
            bits.append(hub)
            for index in range(vane_count):
                angle = math.tau * index / vane_count
                bits.append(
                    add_box(
                        f"LOD{lod}_DriveVane_{tag}_{index}",
                        (0.055, 0.035, 0.22),
                        (
                            -5.01,
                            y + math.cos(angle) * 0.13,
                            0.14 + math.sin(angle) * 0.13,
                        ),
                        mech,
                        0.001,
                        rotation=(angle, 0.0, 0.0),
                    )
                )
        report.append(
            {
                "tag": tag,
                "aft": opened,
                "center": [-5.05, y, 0.14],
                "mouthOuterRadius": 0.50,
            }
        )
    return bits, report


def build_radiator(hull, mats, lod):
    """One offset starboard saddle well; never a paired dorsal face."""
    hull_mat = mats["Material_Hull"]
    rad = mats["Material_Radiator"]
    gap = mats["Material_Gap"]

    def well():
        return add_box(
            "RadiatorCut", (0.92, 0.46, 0.18), (-0.85, 0.48, 0.54), hull_mat, 0.0
        )

    ok = cut(hull, well) if lod < 2 else False
    fin_count = 6 if lod == 0 else (3 if lod == 1 else 0)
    fins = [
        add_box(
            f"LOD{lod}_RadiatorBack",
            (0.88, 0.42, 0.025),
            (-0.85, 0.48, 0.49),
            gap,
            0.001,
        )
    ]
    for index in range(fin_count):
        x = -1.20 + index * (0.14 if lod == 0 else 0.28)
        fin = add_box(
            f"LOD{lod}_RadiatorFin_{index}",
            (0.055, 0.38, 0.045),
            (x, 0.48, 0.54),
            rad,
            0.001,
        )
        fins.append(fin)
    return fins, ok


def build_dorsal_construction(mats, lod):
    if lod == 2:
        return []
    panel = mats["Material_HullPanel"]
    armor = mats["Material_Armor"]
    warning = mats["Material_Warning"]
    repair = mats["Material_Repair"]
    bits = []
    for sign, tag in ((1.0, "Stbd"), (-1.0, "Port")):
        bits.append(
            add_prism_panel(
                f"LOD{lod}_SaddlePlate_{tag}",
                [
                    (2.30, 0.18 * sign),
                    (1.80, 0.92 * sign),
                    (-1.15, 0.86 * sign),
                    (-1.42, 0.22 * sign),
                ],
                0.50,
                0.035,
                panel,
            )
        )
        bits.append(
            add_prism_panel(
                f"LOD{lod}_TransomShoulder_{tag}",
                [
                    (-1.92, 0.22 * sign),
                    (-2.08, 0.78 * sign),
                    (-4.28, 0.84 * sign),
                    (-4.48, 0.26 * sign),
                ],
                0.78,
                0.030,
                panel,
            )
        )
    if lod == 0:
        bits.extend(
            [
                add_decal_plane(
                    "LOD0_WarningSpray",
                    [(0.92, 0.44), (0.50, 0.70), (0.18, 0.68), (0.58, 0.42)],
                    0.541,
                    warning,
                ),
                add_decal_plane(
                    "LOD0_RepairPatch",
                    [(-0.42, -0.34), (-0.82, -0.62), (-1.16, -0.58), (-0.78, -0.30)],
                    0.542,
                    repair,
                ),
            ]
        )
    return bits


def shade_objects(objs):
    for obj in objs:
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        try:
            bpy.ops.object.shade_smooth_by_angle(angle=math.radians(28))
        except (TypeError, RuntimeError):
            # Flat facets preserve the three-house construction better than a
            # whole-object smooth fallback on Blender versions without this op.
            for polygon in obj.data.polygons:
                polygon.use_smooth = False
        obj.select_set(False)


def purge_stray_meshes(lod):
    for obj in list(bpy.data.objects):
        if obj.type != "MESH":
            continue
        if is_collision(obj):
            continue
        if obj.name.startswith(f"LOD{lod}_"):
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
        filepath=str(path),
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_extras=True,
        export_texcoords=True,
        export_normals=True,
        export_tangents=True,
        export_materials="EXPORT",
    )


def sha256(path: Path):
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main():
    args = parse_args(sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else [])
    source = args.source.resolve()
    output = args.output.resolve()
    if not source.is_file():
        raise SystemExit(f"missing source {source}")

    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(source))
    root = find_root(args.lod)
    for obj in list(bpy.data.objects):
        if obj == root or obj.parent is not None:
            continue
        if obj.type in {"LIGHT", "CAMERA"}:
            continue
        parent_keep_world(obj, root)
    empties = snapshot_empties()
    delete_render_meshes()
    mats = make_materials()
    hull, courses = build_hull(mats, args.lod)
    wings = build_wings(mats, args.lod)
    canopy_bits, canopy_report = build_canopy(hull, mats, args.lod)
    drive_bits, drive_report = build_drives(hull, mats, args.lod)
    rad_bits, rad_ok = build_radiator(hull, mats, args.lod)
    surface_bits = build_dorsal_construction(mats, args.lod)

    built = [
        hull,
        *courses,
        *wings,
        *canopy_bits,
        *drive_bits,
        *rad_bits,
        *surface_bits,
    ]
    for obj in built:
        if obj and obj.name in bpy.data.objects:
            parent_keep_world(obj, root)
    purge_stray_meshes(args.lod)

    assert_empties(empties)
    shade_objects(
        [
            obj
            for obj in bpy.data.objects
            if obj.type == "MESH" and not is_collision(obj)
        ]
    )
    root["assetId"] = "SF_HORNET_PRODUCTION_V1"
    root["partId"] = "hornet_production_v1"
    root["slot"] = "hull"
    root["category"] = "wholeships"
    root["lod"] = f"lod{args.lod}"
    root["forward"] = "+X"
    root["embeddedPlume"] = False
    root["spacefaceConstruction"] = "cycle_185_three_house_reset"
    root.scale = (SCALE, SCALE, SCALE)
    bpy.context.view_layer.update()
    size = mesh_world_size()
    if size.z > 12.0 or size.x < 20.0:
        raise RuntimeError(
            f"form envelope broken: size=({size.x:.2f},{size.y:.2f},{size.z:.2f})"
        )
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
        "lod": args.lod,
        "source": str(source),
        "output": str(output),
        "scale": SCALE,
        "canopy": canopy_report,
        "drives": drive_report,
        "radiator": rad_ok,
        "size": [
            round(float(size.x), 3),
            round(float(size.y), 3),
            round(float(size.z), 3),
        ],
        "triangles": tris,
        "objects": [obj.name for obj in meshes],
        "bytes": output.stat().st_size,
        "sha256": sha256(output),
        "root": root.name,
        "assetId": root.get("assetId"),
        "socketNames": sorted(name for name in empties if name.startswith("SOCKET_")),
        "collisionObjects": sorted(obj.name for obj in meshes if is_collision(obj)),
        "emission": 0,
        "authorVerdict": "REVIEW_REQUIRED",
    }
    output.with_suffix(".report.json").write_text(
        json.dumps(report, indent=2) + "\n", encoding="utf-8", newline="\n"
    )
    print(json.dumps(report))


if __name__ == "__main__":
    main()
