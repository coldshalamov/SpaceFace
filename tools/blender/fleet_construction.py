"""Manufactured assemblies shared by fleet remasters.

These helpers exist so every non-Hitch flyable body can reuse Hitch-floor
construction: tapered vanes with roots, recessed radiator cassettes, hatches
with rims, service pipes, RCS bays, and a dish/gimbal sensor. They do not
copy Hitch geometry or identity.
"""
from __future__ import annotations

import math

import bpy
from mathutils import Matrix, Vector


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


def station_ring(x, yc, zc, hw, hh, flat=0.0, box=0.0, keel=1.0):
    """12-point manufactured station. Same vertex count so rings can loft.

    flat: 0 = pointed crown, 1 = wide flat deck (greenhouse / walkway)
    box:  0 = diamond sides, 1 = vertical walls (glove / drive house)
    keel: 1 = sharp V, 0 = flat keel
    Mid station must not be a scaled copy of the bow — change these three,
    not just hw/hh.
    """
    flat = max(0.0, min(1.0, float(flat)))
    box = max(0.0, min(1.0, float(box)))
    keel = max(0.0, min(1.0, float(keel)))
    deck_half = hw * (0.06 + 0.70 * flat)
    crown_z = zc + hh * (1.0 - 0.22 * flat)
    shoulder_y = hw * (0.42 + 0.38 * box)
    shoulder_z = zc + hh * (0.55 - 0.20 * box)
    beam_y = hw
    beam_z = zc + hh * (0.08 - 0.28 * box)
    lower_y = hw * (0.78 - 0.08 * box)
    lower_z = zc - hh * (0.38 + 0.08 * box)
    keel_half = hw * (0.08 + 0.42 * (1.0 - keel))
    keel_z = zc - hh * (0.92 + 0.08 * keel)
    keel_c_z = zc - hh
    return [
        (x, yc + 0.0, crown_z),
        (x, yc + deck_half, crown_z),
        (x, yc + shoulder_y, shoulder_z),
        (x, yc + beam_y, beam_z),
        (x, yc + lower_y, lower_z),
        (x, yc + keel_half, keel_z),
        (x, yc + 0.0, keel_c_z),
        (x, yc - keel_half, keel_z),
        (x, yc - lower_y, lower_z),
        (x, yc - beam_y, beam_z),
        (x, yc - shoulder_y, shoulder_z),
        (x, yc - deck_half, crown_z),
    ]


def add_overlap_plate(name, loc, scale, material, collection, bevel=0.008):
    """Thick overlapping armor with a real gap, not a decal-thick slab."""
    return add_box(name, loc, scale, material, collection, bevel)


def add_flared_bell(tag, x, y, z, scale, mats, collection, sides=36):
    """Rocket bell: narrow throat at the transom, flare OPEN toward aft (-X)."""
    s = float(scale)
    ceramic = mats.get("Material_Ceramic") or mats["Material_Mechanical"]
    thruster = mats.get("Material_Thruster") or mats["Material_Mechanical"]
    mech = mats["Material_Mechanical"]
    armor = mats["Material_Armor"]
    verts = []
    rings = (
        (0.00, 0.20),
        (0.18, 0.26),
        (0.42, 0.40),
        (0.70, 0.58),
        (1.00, 0.74),
    )
    for t, r in rings:
        xi = x - 0.06 * s - t * 1.20 * s
        for i in range(sides):
            ang = math.tau * i / sides
            verts.append((xi, y + math.cos(ang) * r * s, z + math.sin(ang) * r * s))
    faces = []
    for station in range(len(rings) - 1):
        a = station * sides
        b = (station + 1) * sides
        for i in range(sides):
            j = (i + 1) % sides
            faces.append((a + i, a + j, b + j, b + i))
    mesh = bpy.data.meshes.new(f"Bell_{tag}_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    outer = bpy.data.objects.new(f"Bell_{tag}", mesh)
    collection.objects.link(outer)
    finish_mesh(outer, mech, 0.004)
    apply_modifiers(outer)
    bpy.ops.mesh.primitive_cone_add(
        vertices=24, radius1=0.10 * s, radius2=0.64 * s, depth=1.28 * s,
        location=(x - 0.70 * s, y, z), rotation=(0, math.pi / 2, 0),
    )
    inner = bpy.context.object
    inner.name = f"BellCutter_{tag}"
    bpy.context.view_layer.objects.active = outer
    outer.select_set(True)
    mod = outer.modifiers.new("BellCut", "BOOLEAN")
    mod.operation = "DIFFERENCE"
    mod.object = inner
    try:
        mod.solver = "EXACT"
    except Exception:
        pass
    bpy.ops.object.modifier_apply(modifier=mod.name)
    outer.select_set(False)
    bpy.data.objects.remove(inner, do_unlink=True)
    add_cylinder(f"BellCollar_{tag}", (x - 0.06 * s, y, z), 0.24 * s, 0.10 * s, ceramic, collection, 20, 0.003)
    add_cylinder(f"BellFlange_{tag}", (x + 0.12 * s, y, z), 0.36 * s, 0.07 * s, armor, collection, 20, 0.003)
    add_cylinder(f"BellClamp_{tag}", (x + 0.22 * s, y, z), 0.40 * s, 0.05 * s, mech, collection, 18, 0.003)
    add_cylinder(f"BellHub_{tag}", (x - 0.58 * s, y, z), 0.055 * s, 0.26 * s, mech, collection, 10, 0.002)
    add_cylinder(f"BellThroat_{tag}", (x - 0.22 * s, y, z), 0.10 * s, 0.06 * s, thruster, collection, 14, 0.002)
    for index in range(10):
        ang = math.tau * index / 10
        add_tapered_vane(f"BellVane_{tag}_{index}", (x - 0.62 * s, y, z), armor, collection, ang, scale=s * 0.85)
    return outer


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


def add_midship_kit(half, hw, hh, lod, mats, collection):
    """Overlapping plates, rails, clamps, and a repair patch — Hitch midship logic, not Hitch identity."""
    hull = mats["Material_Hull"]
    armor = mats["Material_Armor"]
    mech = mats["Material_Mechanical"]
    accent = mats.get("Material_Accent") or armor
    warning = mats.get("Material_Warning") or armor
    add_box("Spine_Rail_Port", (0.15, -hw * 0.22, hh + 0.12), (half * 0.42, 0.03, 0.035), mech, collection, 0.006)
    add_box("Spine_Rail_Starboard", (0.15, hw * 0.22, hh + 0.12), (half * 0.42, 0.03, 0.035), mech, collection, 0.006)
    add_box("Plate_Dorsal_Fore", (half * 0.22, 0.0, hh + 0.10), (half * 0.18, hw * 0.48, 0.045), armor, collection, 0.01)
    add_box("Plate_Dorsal_Mid", (-half * 0.02, hw * 0.08, hh + 0.16), (half * 0.16, hw * 0.36, 0.038), hull, collection, 0.01)
    add_box("Plate_Dorsal_Aft", (-half * 0.28, -hw * 0.06, hh + 0.13), (half * 0.14, hw * 0.32, 0.034), armor, collection, 0.01)
    add_box("Plate_Repair_Patch", (half * 0.06, -hw * 0.18, hh + 0.20), (0.28, 0.18, 0.016), warning, collection, 0.004)
    add_box("Plate_Accent_Inset", (-half * 0.08, hw * 0.16, hh + 0.20), (0.22, 0.12, 0.014), accent, collection, 0.003)
    add_box("Cheek_Port", (half * 0.28, -hw * 1.02, hh * 0.18), (half * 0.14, 0.045, hh * 0.38), armor, collection, 0.012)
    add_box("Cheek_Starboard", (half * 0.28, hw * 1.02, hh * 0.18), (half * 0.14, 0.045, hh * 0.38), armor, collection, 0.012)
    add_box("Shoulder_Port", (half * 0.22, -hw * 0.96, hh * 0.55), (half * 0.14, 0.05, hh * 0.22), armor, collection, 0.01)
    add_box("Shoulder_Starboard", (half * 0.22, hw * 0.96, hh * 0.55), (half * 0.14, 0.05, hh * 0.22), armor, collection, 0.01)
    if lod == 0:
        for i, x in enumerate((half * 0.28, 0.0, -half * 0.24)):
            add_box(f"Clamp_{i}", (x, 0.0, hh + 0.11), (0.045, hw * 0.30, 0.02), mech, collection, 0.003)
        for i, (x, y) in enumerate((
            (half * 0.30, -hw * 0.30), (half * 0.30, hw * 0.30),
            (-half * 0.18, -hw * 0.22), (-half * 0.18, hw * 0.22),
        )):
            add_cylinder(f"Bolt_{i}", (x, y, hh + 0.10), 0.014, 0.03, mech, collection, vertices=8, bevel=0.002, rot=(0, 0, 0))
        add_box("Cable_Tray", (half * 0.04, -hw * 0.38, hh + 0.04), (half * 0.30, 0.025, 0.02), mech, collection, 0.003)


def apply_modifiers(obj):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    try:
        for mod in list(obj.modifiers):
            mod_name = mod.name
            try:
                result = bpy.ops.object.modifier_apply(modifier=mod_name)
            except Exception as error:
                raise RuntimeError(f"failed to apply {mod_name!r} on {obj.name!r} before cutting a bay") from error
            if result != {"FINISHED"} or obj.modifiers.get(mod_name) is not None:
                raise RuntimeError(
                    f"modifier {mod_name!r} did not finish cleanly on {obj.name!r} before cutting a bay"
                )
    finally:
        obj.select_set(False)


def _bay_basis(outward):
    n = Vector(outward)
    if n.length < 1e-6:
        n = Vector((0.0, 0.0, 1.0))
    n.normalize()
    long_axis = Vector((1.0, 0.0, 0.0))
    if abs(n.dot(long_axis)) > 0.72:
        long_axis = Vector((0.0, 0.0, 1.0))
    wide_axis = n.cross(long_axis)
    if wide_axis.length < 1e-6:
        wide_axis = Vector((0.0, 1.0, 0.0))
    wide_axis.normalize()
    long_axis = wide_axis.cross(n).normalized()
    return n, long_axis, wide_axis


def _basis_matrix(origin, long_axis, wide_axis, normal):
    return Matrix((
        (long_axis.x, wide_axis.x, normal.x, origin.x),
        (long_axis.y, wide_axis.y, normal.y, origin.y),
        (long_axis.z, wide_axis.z, normal.z, origin.z),
        (0.0, 0.0, 0.0, 1.0),
    ))


def _oriented_box(name, center, length, width, thick, long_axis, wide_axis, normal, material, collection, bevel=0.004):
    bpy.ops.mesh.primitive_cube_add(location=(0.0, 0.0, 0.0))
    obj = link_object(bpy.context.object, collection)
    obj.name = name
    obj.scale = (length, width, thick)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.matrix_world = _basis_matrix(Vector(center), long_axis, wide_axis, normal)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    obj.select_set(False)
    return finish_mesh(obj, material, bevel)


def cut_open_bay(hull_obj, tag, surface, length, width, depth, outward, mats, collection, kit="rack", liner=True):
    """Cut a hole that actually breaks the skin, then line it. Mouth stays empty."""
    if (
        not isinstance(hull_obj, bpy.types.Object)
        or hull_obj.type != "MESH"
        or not isinstance(hull_obj.data, bpy.types.Mesh)
    ):
        raise TypeError(f"bay {tag!r} requires a Blender mesh hull target")
    n, long_axis, wide_axis = _bay_basis(outward)
    surface = Vector(surface)
    apply_modifiers(hull_obj)
    protrusion = 0.18
    center = surface + n * ((protrusion - depth) * 0.5)
    half_through = (protrusion + depth) * 0.5
    cutter = None
    mod_name = None
    try:
        bpy.ops.mesh.primitive_cube_add(location=(0.0, 0.0, 0.0))
        cutter = bpy.context.object
        cutter = link_object(cutter, collection)
        cutter.name = f"Cutter_{tag}"
        cutter.scale = (length, width, half_through)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        cutter.matrix_world = _basis_matrix(center, long_axis, wide_axis, n)
        bpy.context.view_layer.objects.active = cutter
        cutter.select_set(True)
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        cutter.select_set(False)
        bpy.context.view_layer.objects.active = hull_obj
        hull_obj.select_set(True)
        mod = hull_obj.modifiers.new(f"Cut_{tag}", "BOOLEAN")
        mod_name = mod.name
        mod.operation = "DIFFERENCE"
        mod.object = cutter
        try:
            mod.solver = "EXACT"
        except Exception as error:
            raise RuntimeError(f"EXACT Boolean solver is unavailable for bay {tag!r}") from error
        if mod.solver != "EXACT":
            raise RuntimeError(f"EXACT Boolean solver was not retained for bay {tag!r}")
        try:
            result = bpy.ops.object.modifier_apply(modifier=mod_name)
        except Exception as error:
            raise RuntimeError(f"failed to cut bay {tag!r} into {hull_obj.name!r}") from error
        if result != {"FINISHED"} or hull_obj.modifiers.get(mod_name) is not None:
            raise RuntimeError(f"bay {tag!r} Boolean did not finish cleanly on {hull_obj.name!r}")
    except Exception:
        if mod_name is not None:
            remaining = hull_obj.modifiers.get(mod_name)
            if remaining is not None:
                hull_obj.modifiers.remove(remaining)
        raise
    finally:
        hull_obj.select_set(False)
        if cutter is not None:
            bpy.data.objects.remove(cutter, do_unlink=True)

    mech = mats["Material_Mechanical"]
    armor = mats["Material_Armor"]
    warning = mats.get("Material_Warning") or armor
    accent = mats.get("Material_Accent") or armor
    if not liner:
        if kit == "cockpit":
            gear = surface - n * (depth * 0.62)
            _oriented_box(f"Bay_Seat_{tag}", gear - long_axis * (length * 0.15), 0.16, 0.14, 0.08, long_axis, wide_axis, n, armor, collection)
            _oriented_box(f"Bay_Console_{tag}", gear + long_axis * (length * 0.35), 0.12, 0.20, 0.06, long_axis, wide_axis, n, mech, collection)
        return True
    floor = surface - n * (depth - 0.03)
    _oriented_box(f"Bay_Floor_{tag}", floor, length * 0.92, width * 0.92, 0.025, long_axis, wide_axis, n, mech, collection)
    _oriented_box(
        f"Bay_Back_{tag}", surface - n * (depth - 0.04),
        length * 0.88, width * 0.88, 0.02, long_axis, wide_axis, n, armor, collection,
    )
    _oriented_box(
        f"Bay_WallFore_{tag}", surface - n * (depth * 0.48) + long_axis * (length - 0.03),
        0.03, width * 0.88, depth * 0.46, long_axis, wide_axis, n, mech, collection,
    )
    _oriented_box(
        f"Bay_WallAft_{tag}", surface - n * (depth * 0.48) - long_axis * (length - 0.03),
        0.03, width * 0.88, depth * 0.46, long_axis, wide_axis, n, mech, collection,
    )
    _oriented_box(
        f"Bay_WallPos_{tag}", surface - n * (depth * 0.48) + wide_axis * (width - 0.03),
        length * 0.86, 0.03, depth * 0.46, long_axis, wide_axis, n, mech, collection,
    )
    _oriented_box(
        f"Bay_WallNeg_{tag}", surface - n * (depth * 0.48) - wide_axis * (width - 0.03),
        length * 0.86, 0.03, depth * 0.46, long_axis, wide_axis, n, mech, collection,
    )
    for i, offset in enumerate((
        long_axis * length, -long_axis * length, wide_axis * width, -wide_axis * width,
    )):
        rim_length, rim_width = (0.035, width * 1.08) if i < 2 else (length * 1.08, 0.035)
        _oriented_box(
            f"Bay_Rim_{tag}_{i}", surface + n * 0.012 + offset,
            rim_length, rim_width, 0.016,
            long_axis, wide_axis, n, armor, collection, 0.003,
        )
    gear = surface - n * (depth * 0.62)
    if kit == "radiator":
        _oriented_box(f"Bay_RadCore_{tag}", gear, length * 0.55, width * 0.22, 0.05, long_axis, wide_axis, n, mats.get("Material_Radiator") or armor, collection)
        for i in range(5):
            fx = -length * 0.4 + (length * 0.8 * i / 4)
            _oriented_box(
                f"Bay_RadFin_{tag}_{i}", gear + long_axis * fx + n * 0.04,
                0.012, width * 0.28, 0.07, long_axis, wide_axis, n, mats.get("Material_Radiator") or armor, collection, 0.002,
            )
    elif kit == "cockpit":
        _oriented_box(f"Bay_Seat_{tag}", gear - long_axis * (length * 0.15), 0.16, 0.14, 0.08, long_axis, wide_axis, n, armor, collection)
        _oriented_box(f"Bay_Console_{tag}", gear + long_axis * (length * 0.35), 0.12, 0.20, 0.06, long_axis, wide_axis, n, mech, collection)
        _oriented_box(f"Bay_Screen_{tag}", gear + long_axis * (length * 0.38) + n * 0.08, 0.04, 0.12, 0.05, long_axis, wide_axis, n, accent, collection, 0.002)
    elif kit == "empty":
        pass
    else:
        _oriented_box(f"Bay_Rack_{tag}", gear, length * 0.42, width * 0.18, 0.08, long_axis, wide_axis, n, armor, collection)
        _oriented_box(f"Bay_Crate_{tag}", gear + long_axis * (length * 0.28) + wide_axis * (width * 0.18), 0.10, 0.08, 0.07, long_axis, wide_axis, n, warning, collection, 0.003)
        _oriented_box(f"Bay_Bottle_{tag}", gear - long_axis * (length * 0.22), 0.04, 0.04, 0.10, long_axis, wide_axis, n, mech, collection, 0.002)
    return True


def cut_hull_recess(hull_obj, tag, loc, sx, sy, sz, mats, collection, outward=None, kit="rack"):
    """Compat wrapper: treat loc as a surface point and break the skin."""
    if outward is None:
        if abs(loc[1]) > abs(loc[2]) * 1.15:
            outward = (0.0, 1.0 if loc[1] > 0 else -1.0, 0.0)
            length, width, depth = sx, sz, max(sy * 2.4, 0.38)
            surface = (loc[0], loc[1], loc[2])
        else:
            outward = (0.0, 0.0, 1.0)
            length, width, depth = sx, sy, max(sz * 2.2, 0.30)
            surface = loc
    else:
        length, width, depth = sx, sy, max(sz * 2.0, 0.30)
        surface = loc
    return cut_open_bay(hull_obj, tag, surface, length, width, depth, outward, mats, collection, kit=kit)


def add_cockpit_glazing(tag, surface, length, width, hh, mats, collection, raised=0.0):
    """Raised greenhouse: sloped brow, mullions, thin dark panes over the tub."""
    canopy = mats["Material_Canopy"]
    armor = mats["Material_Armor"]
    x, y, z = surface
    z0 = z + 0.02 + raised
    add_box(f"{tag}_Sill", (x, y, z0), (length * 1.08, width * 1.12, 0.03), armor, collection, 0.006)
    add_box(f"{tag}_Brow", (x + length * 0.55, y, z0 + 0.22), (length * 0.38, width * 0.72, 0.04), armor, collection, 0.006)
    add_box(f"{tag}_AftBulk", (x - length * 0.85, y, z0 + 0.16), (0.05, width * 0.90, 0.16), armor, collection, 0.005)
    add_box(f"{tag}_RailPort", (x, y - width * 0.95, z0 + 0.16), (length * 0.95, 0.03, 0.14), armor, collection, 0.004)
    add_box(f"{tag}_RailStbd", (x, y + width * 0.95, z0 + 0.16), (length * 0.95, 0.03, 0.14), armor, collection, 0.004)
    add_box(f"{tag}_Mullion", (x + length * 0.05, y, z0 + 0.20), (0.025, width * 0.88, 0.16), armor, collection, 0.003)
    add_box(f"{tag}_Spine", (x, y, z0 + 0.28), (length * 0.72, 0.025, 0.03), armor, collection, 0.003)
    add_box(f"{tag}_Pane_Port", (x, y - width * 0.78, z0 + 0.18), (length * 0.78, 0.016, 0.12), canopy, collection, 0.003)
    add_box(f"{tag}_Pane_Stbd", (x, y + width * 0.78, z0 + 0.18), (length * 0.78, 0.016, 0.12), canopy, collection, 0.003)
    add_box(f"{tag}_Pane_Fore", (x + length * 0.72, y, z0 + 0.16), (0.016, width * 0.62, 0.11), canopy, collection, 0.003)
    add_box(f"{tag}_Pane_TopA", (x + length * 0.22, y, z0 + 0.30), (length * 0.32, width * 0.58, 0.014), canopy, collection, 0.003)
    add_box(f"{tag}_Pane_TopB", (x - length * 0.22, y, z0 + 0.30), (length * 0.32, width * 0.58, 0.014), canopy, collection, 0.003)


def add_recess_bay(tag, loc, sx, sy, sz, mats, collection):
    """Fallback stacked well when no hull object is available to cut."""
    mech = mats["Material_Mechanical"]
    armor = mats["Material_Armor"]
    x, y, z = loc
    add_box(f"Recess_Interior_{tag}", (x, y, z - sz * 0.35), (sx * 0.82, sy * 0.82, sz * 0.55), mech, collection, 0.008)
    add_box(f"Recess_Rim_{tag}", loc, (sx, sy, sz * 0.18), armor, collection, 0.006)
    add_box(f"Recess_LipFore_{tag}", (x + sx * 0.92, y, z), (0.03, sy * 0.9, sz * 0.28), mech, collection, 0.004)
    add_box(f"Recess_LipAft_{tag}", (x - sx * 0.92, y, z), (0.03, sy * 0.9, sz * 0.28), mech, collection, 0.004)


def add_framed_canopy(prefix, half, hh, mats, collection, bridge=False):
    canopy = mats["Material_Canopy"]
    armor = mats["Material_Armor"]
    # Three framed panes instead of one plastic wedge.
    add_box(f"{prefix}_Pane_Fore", (half * 0.38, 0.0, hh + 0.42), (0.22, 0.28, 0.10), canopy, collection, 0.008)
    add_box(f"{prefix}_Pane_Mid", (half * 0.22, 0.0, hh + 0.52), (0.28, 0.36, 0.12), canopy, collection, 0.008)
    add_box(f"{prefix}_Pane_Aft", (half * 0.08, 0.0, hh + 0.40), (0.18, 0.30, 0.10), canopy, collection, 0.008)
    add_box(f"{prefix}_Mullion_A", (half * 0.30, 0.0, hh + 0.50), (0.025, 0.38, 0.14), armor, collection, 0.004)
    add_box(f"{prefix}_Mullion_B", (half * 0.14, 0.0, hh + 0.48), (0.025, 0.36, 0.13), armor, collection, 0.004)
    add_box(f"{prefix}_Sill", (half * 0.24, 0.0, hh + 0.28), (0.42, 0.40, 0.03), armor, collection, 0.005)
    add_box(f"{prefix}_Brow", (half * 0.30, 0.0, hh + 0.66), (0.38, 0.34, 0.03), armor, collection, 0.005)


def densify_ring(points, mul=2):
    """Insert midpoints on each station edge. Keeps vertex correspondence across rings."""
    if mul <= 1:
        return [tuple(p) for p in points]
    out = []
    count = len(points)
    for i in range(count):
        ax, ay, az = points[i]
        bx, by, bz = points[(i + 1) % count]
        out.append((ax, ay, az))
        for k in range(1, mul):
            t = k / float(mul)
            out.append((ax + (bx - ax) * t, ay + (by - ay) * t, az + (bz - az) * t))
    return out


def boolean_union(host, donor):
    """Merge donor into host and delete donor. Host stays the cut target."""
    apply_modifiers(host)
    apply_modifiers(donor)
    bpy.context.view_layer.objects.active = host
    host.select_set(True)
    mod = host.modifiers.new("Union", "BOOLEAN")
    mod.operation = "UNION"
    mod.object = donor
    try:
        mod.solver = "EXACT"
    except Exception:
        pass
    try:
        result = bpy.ops.object.modifier_apply(modifier=mod.name)
        if result != {"FINISHED"} or host.modifiers.get(mod.name) is not None:
            raise RuntimeError("union apply did not finish")
    except Exception as exc:
        print(f"boolean_union keep-separate {host.name}+{donor.name}: {exc}")
        remaining = host.modifiers.get(mod.name)
        if remaining is not None:
            host.modifiers.remove(remaining)
        host.select_set(False)
        return host
    host.select_set(False)
    bpy.data.objects.remove(donor, do_unlink=True)
    return host


def boolean_cut_box(host, name, loc, scale, rot=(0, 0, 0)):
    """Difference a box from host. Skip rather than crash if the cut fails."""
    apply_modifiers(host)
    bpy.ops.mesh.primitive_cube_add(location=loc, rotation=rot)
    cutter = bpy.context.object
    cutter.name = name
    cutter.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bpy.context.view_layer.objects.active = host
    host.select_set(True)
    mod = host.modifiers.new(name, "BOOLEAN")
    mod.operation = "DIFFERENCE"
    mod.object = cutter
    try:
        mod.solver = "EXACT"
    except Exception:
        pass
    try:
        result = bpy.ops.object.modifier_apply(modifier=mod.name)
        if result != {"FINISHED"} or host.modifiers.get(mod.name) is not None:
            raise RuntimeError("cut apply did not finish")
    except Exception as exc:
        print(f"boolean_cut_box skip {name}: {exc}")
        remaining = host.modifiers.get(mod.name)
        if remaining is not None:
            host.modifiers.remove(remaining)
    host.select_set(False)
    bpy.data.objects.remove(cutter, do_unlink=True)
    return host


def boolean_cut_cylinder(host, name, loc, radius, depth, rot=(0, math.pi / 2, 0), vertices=18):
    apply_modifiers(host)
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices, radius=radius, depth=depth, location=loc, rotation=rot,
    )
    cutter = bpy.context.object
    cutter.name = name
    bpy.context.view_layer.objects.active = host
    host.select_set(True)
    mod = host.modifiers.new(name, "BOOLEAN")
    mod.operation = "DIFFERENCE"
    mod.object = cutter
    try:
        mod.solver = "EXACT"
    except Exception:
        pass
    try:
        result = bpy.ops.object.modifier_apply(modifier=mod.name)
        if result != {"FINISHED"} or host.modifiers.get(mod.name) is not None:
            raise RuntimeError("cut apply did not finish")
    except Exception as exc:
        print(f"boolean_cut_cylinder skip {name}: {exc}")
        remaining = host.modifiers.get(mod.name)
        if remaining is not None:
            host.modifiers.remove(remaining)
    host.select_set(False)
    bpy.data.objects.remove(cutter, do_unlink=True)
    return host


def cut_slot_bank(host, tag, origin, count, slot, spacing, axis=(-1.0, 0.0, 0.0)):
    """Hitch-floor radiator language: a row of rectangular holes that break the skin."""
    ox, oy, oz = origin
    dx, dy, dz = axis
    for index in range(count):
        loc = (ox + dx * spacing * index, oy + dy * spacing * index, oz + dz * spacing * index)
        boolean_cut_box(host, f"Slot_{tag}_{index}", loc, slot)
    return host


def add_corner_fasteners(tag, loc, scale, material, collection):
    """Four bolts at plate corners. Hitch-floor fastener scale, not studs-as-texture."""
    x, y, z = loc
    sx, sy, sz = scale
    for index, (ox, oy) in enumerate(((-1, -1), (-1, 1), (1, -1), (1, 1))):
        add_cylinder(
            f"{tag}_Bolt_{index}",
            (x + ox * sx * 0.78, y + oy * sy * 0.78, z + sz + 0.010),
            0.011, 0.016, material, collection, vertices=6, bevel=0.001, rot=(0, 0, 0),
        )
