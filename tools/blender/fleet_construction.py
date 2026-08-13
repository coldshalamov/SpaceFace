"""Manufactured assemblies shared by fleet remasters.

These helpers exist so every non-Hitch flyable body can reuse Hitch-floor
construction: tapered vanes with roots, recessed radiator cassettes, hatches
with rims, service pipes, RCS bays, and a dish/gimbal sensor. They do not
copy Hitch geometry or identity.
"""
from __future__ import annotations

import math

import bpy
from mathutils import Vector


def finish_mesh(obj, material, bevel=0.04, angle=28.0):
    obj.data.materials.clear()
    obj.data.materials.append(material)
    if bevel > 0:
        mod = obj.modifiers.new("ProductionBevel", "BEVEL")
        mod.width = bevel
        mod.segments = 2
        mod.limit_method = "ANGLE"
        mod.angle_limit = math.radians(40)
    obj["spacefaceRole"] = material.get("spacefaceRole", "static")
    return obj


def link_object(obj, collection):
    for current in list(obj.users_collection):
        current.objects.unlink(obj)
    collection.objects.link(obj)
    return obj


def add_box(name, loc, scale, material, collection, bevel=0.04, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(location=loc, rotation=rot)
    obj = link_object(bpy.context.object, collection)
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish_mesh(obj, material, bevel)


def add_cylinder(name, loc, radius, depth, material, collection, vertices=20, bevel=0.025, rot=(0, math.pi / 2, 0)):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices, radius=radius, depth=depth, location=loc, rotation=rot,
    )
    obj = link_object(bpy.context.object, collection)
    obj.name = name
    return finish_mesh(obj, material, bevel)


def add_mesh(name, verts, faces, material, collection, bevel=0.012):
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    return finish_mesh(obj, material, bevel)


def add_tapered_vane(name, origin, material, collection, angle, scale=1.0):
    """Folded refractory vane with a root and a thinner hot tip, Hitch-floor logic."""
    cx, cy, cz = origin
    sections = (
        (0.00, 0.20 * scale, 0.34 * scale),
        (-0.07 * scale, 0.15 * scale, 0.27 * scale),
        (-0.16 * scale, 0.08 * scale, 0.17 * scale),
    )
    half = math.radians(7.4)
    a0, a1 = angle - half, angle + half
    verts = []
    for xo, inner, outer in sections:
        for radius in (inner, outer):
            for ang in (a0, a1):
                verts.append((
                    cx + xo,
                    cy + math.cos(ang) * radius,
                    cz + math.sin(ang) * radius,
                ))
    faces = [
        (0, 1, 3, 2), (4, 6, 7, 5), (8, 9, 11, 10),
        (0, 4, 5, 1), (4, 8, 9, 5),
        (2, 3, 7, 6), (6, 7, 11, 10),
        (0, 2, 6, 4), (4, 6, 10, 8),
        (1, 5, 7, 3), (5, 9, 11, 7),
    ]
    return add_mesh(name, verts, faces, material, collection, bevel=0.004)


def add_manufactured_drive(tag, x, y, lod, mats, collection, scale=1.0, z=0.08):
    """Casing + ceramic collar + recessed throat + rooted vanes + coolant."""
    mech = mats["Material_Mechanical"]
    armor = mats["Material_Armor"]
    ceramic = mats.get("Material_Ceramic") or mech
    thruster = mats.get("Material_Thruster") or mech
    radiator = mats.get("Material_Radiator") or armor
    s = scale
    origin = (x, y, z)
    add_cylinder(f"Drive_Bulkhead_{tag}", (x + 0.62 * s, y, z), 0.50 * s, 0.10 * s, armor, collection, vertices=16, bevel=0.01)
    add_cylinder(f"Drive_Casing_{tag}", (x + 0.28 * s, y, z), 0.46 * s, 0.92 * s, mech, collection, vertices=20, bevel=0.016)
    add_cylinder(f"Drive_HoopFore_{tag}", (x + 0.52 * s, y, z), 0.49 * s, 0.07 * s, armor, collection, vertices=18, bevel=0.008)
    add_cylinder(f"Drive_HoopAft_{tag}", (x + 0.08 * s, y, z), 0.50 * s, 0.06 * s, armor, collection, vertices=18, bevel=0.008)
    add_cylinder(f"Drive_Collar_{tag}", (x - 0.16 * s, y, z), 0.38 * s, 0.14 * s, ceramic, collection, vertices=16, bevel=0.01)
    add_cylinder(f"Drive_ThroatRing_{tag}", (x - 0.28 * s, y, z), 0.24 * s, 0.07 * s, mech, collection, vertices=16, bevel=0.006)
    add_cylinder(f"Drive_Throat_{tag}", (x - 0.34 * s, y, z), 0.15 * s, 0.06 * s, thruster, collection, vertices=14, bevel=0.004)
    add_cylinder(f"Drive_HeatSkirt_{tag}", (x - 0.02 * s, y, z), 0.54 * s, 0.05 * s, radiator, collection, vertices=16, bevel=0.006)
    if lod <= 1:
        for index in range(8):
            ang = math.tau * index / 8
            add_box(
                f"Drive_Clamp_{tag}_{index}",
                (x - 0.16 * s, y + math.cos(ang) * 0.41 * s, z + math.sin(ang) * 0.41 * s),
                (0.06 * s, 0.045 * s, 0.035 * s),
                mech, collection, 0.004, (ang, 0, 0),
            )
    if lod == 0:
        count = 12
        for index in range(count):
            ang = math.tau * index / count
            add_tapered_vane(f"Drive_Vane_{tag}_{index}", (x - 0.30 * s, y, z), armor, collection, ang, scale=s)
            add_box(
                f"Drive_Hinge_{tag}_{index}",
                (x - 0.20 * s, y + math.cos(ang) * 0.30 * s, z + math.sin(ang) * 0.30 * s),
                (0.045 * s, 0.028 * s, 0.022 * s),
                mech, collection, 0.003, (ang, 0, 0),
            )
        for ring, xo in enumerate((-0.02 * s, 0.22 * s, 0.44 * s)):
            for index in range(6):
                a0 = math.tau * index / 6 + 0.12
                a1 = a0 + 0.72
                mid = (a0 + a1) * 0.5
                add_cylinder(
                    f"Drive_Coolant_{tag}_{ring}_{index}",
                    (x + xo, y + math.cos(mid) * 0.48 * s, z + math.sin(mid) * 0.48 * s),
                    0.018 * s, 0.16 * s, mech, collection, vertices=8, bevel=0.002,
                    rot=(0, 0, mid),
                )


def add_radiator_cassette(tag, loc, lod, mats, collection, length=1.15, height=0.30, yaw=0.0):
    """Recessed well, frame, fins, and header pipes — Hitch radiator logic at fleet scale."""
    mech = mats["Material_Mechanical"]
    radiator = mats.get("Material_Radiator") or mats["Material_Armor"]
    x, y, z = loc
    add_box(f"Radiator_Well_{tag}", loc, (length * 0.48, 0.045, height * 0.42), radiator, collection, 0.008, (0, 0, yaw))
    add_box(f"Radiator_Frame_{tag}", (x, y + 0.02, z), (length * 0.52, 0.02, height * 0.48), mech, collection, 0.006, (0, 0, yaw))
    add_cylinder(f"Radiator_HeaderTop_{tag}", (x, y + 0.03, z + height * 0.38), 0.018, length * 0.9, mech, collection, vertices=8, bevel=0.003)
    add_cylinder(f"Radiator_HeaderBot_{tag}", (x, y + 0.03, z - height * 0.38), 0.018, length * 0.9, mech, collection, vertices=8, bevel=0.003)
    add_cylinder(f"Radiator_ElbowA_{tag}", (x - length * 0.46, y + 0.03, z), 0.016, height * 0.7, mech, collection, vertices=8, bevel=0.002, rot=(0, 0, 0))
    add_cylinder(f"Radiator_ElbowB_{tag}", (x + length * 0.46, y + 0.03, z), 0.016, height * 0.7, mech, collection, vertices=8, bevel=0.002, rot=(0, 0, 0))
    if lod == 0:
        fins = 8
        span = length * 0.78
        for index in range(fins):
            fx = x - span * 0.5 + (span * index / (fins - 1))
            add_box(f"Radiator_Fin_{tag}_{index}", (fx, y + 0.01, z), (0.012, 0.055, height * 0.36), radiator, collection, 0.002)
        add_box(f"Radiator_Hinge_{tag}", (x, y - 0.04, z - height * 0.42), (length * 0.42, 0.012, 0.016), mech, collection, 0.003)


def add_service_hatch(tag, loc, mats, collection, sx=0.42, sy=0.32):
    mech = mats["Material_Mechanical"]
    armor = mats["Material_Armor"]
    x, y, z = loc
    add_box(f"Hatch_Well_{tag}", (x, y, z - 0.02), (sx, sy, 0.03), mech, collection, 0.008)
    add_box(f"Hatch_Rim_{tag}", loc, (sx + 0.06, sy + 0.06, 0.018), mech, collection, 0.006)
    add_box(f"Hatch_Lid_{tag}", (x, y, z + 0.02), (sx - 0.04, sy - 0.04, 0.016), armor, collection, 0.006)
    add_box(f"Hatch_Hinge_{tag}", (x - sx * 0.7, y, z + 0.02), (0.03, sy * 0.7, 0.02), mech, collection, 0.003)
    for i, (ox, oy) in enumerate(((-1, -1), (-1, 1), (1, -1), (1, 1))):
        add_cylinder(
            f"Hatch_Bolt_{tag}_{i}",
            (x + ox * sx * 0.72, y + oy * sy * 0.72, z + 0.03),
            0.012, 0.02, mech, collection, vertices=8, bevel=0.002, rot=(0, 0, 0),
        )


def add_service_pipe(tag, a, b, material, collection, radius=0.022):
    ax, ay, az = a
    bx, by, bz = b
    mid = ((ax + bx) * 0.5, (ay + by) * 0.5, (az + bz) * 0.5)
    dx, dy, dz = bx - ax, by - ay, bz - az
    length = math.sqrt(dx * dx + dy * dy + dz * dz) or 0.01
    obj = add_cylinder(tag, mid, radius, length, material, collection, vertices=8, bevel=0.002, rot=(0, 0, 0))
    direction = Vector((dx, dy, dz)).normalized()
    obj.rotation_euler = direction.to_track_quat("Z", "Y").to_euler()
    return obj


def add_rcs_cluster(tag, loc, mats, collection, sign=1):
    mech = mats["Material_Mechanical"]
    thruster = mats.get("Material_Thruster") or mech
    x, y, z = loc
    add_box(f"RCS_Bay_{tag}", loc, (0.16, 0.12, 0.12), mech, collection, 0.01)
    for i, oz in enumerate((-0.05, 0.0, 0.05)):
        add_cylinder(
            f"RCS_Nozzle_{tag}_{i}",
            (x, y + 0.10 * sign, z + oz),
            0.028, 0.08, thruster, collection, vertices=8, bevel=0.003,
            rot=(math.pi / 2, 0, 0),
        )


def add_sensor_dish(tag, loc, mats, collection):
    """Dish + gimbal. Never a glowing torus."""
    mech = mats["Material_Mechanical"]
    armor = mats["Material_Armor"]
    x, y, z = loc
    add_cylinder(f"Sensor_Pedestal_{tag}", (x, y, z - 0.12), 0.03, 0.22, mech, collection, vertices=10, bevel=0.004, rot=(0, 0, 0))
    add_box(f"Sensor_Yoke_{tag}", (x, y, z + 0.04), (0.04, 0.16, 0.04), mech, collection, 0.006)
    add_cylinder(f"Sensor_Dish_{tag}", (x + 0.04, y, z + 0.08), 0.11, 0.03, armor, collection, vertices=16, bevel=0.004, rot=(0, math.pi / 2.6, 0))
    add_cylinder(f"Sensor_Hub_{tag}", (x + 0.02, y, z + 0.08), 0.03, 0.04, mech, collection, vertices=10, bevel=0.002, rot=(0, math.pi / 2.6, 0))


def add_armor_tile(tag, loc, scale, material, collection, bevel=0.012):
    return add_box(tag, loc, scale, material, collection, bevel)


def add_panel_seams(prefix, xs, y_span, z, material, collection):
    for index, x in enumerate(xs):
        add_box(f"{prefix}_Seam_{index}", (x, 0, z), (0.018, y_span, 0.018), material, collection, 0.004)
