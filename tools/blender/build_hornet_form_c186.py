"""Build a Hornet chase-camera form candidate from one continuous lifting shell.

This is deliberately a new construction technique after the C185 three-house reset was
rejected.  The body is a chined pressure shell with a broad wing carry-through, not a set of
house rings with fairings attached.  The script reuses the sanctioned chase renderer, export
contract, socket map, and material-map helpers from ``build_hornet_mtx.py``.  It only writes the
Hornet authoring GLBs, source textures, and cycle evidence; it never writes release files.
"""

from __future__ import annotations

import importlib.util
import math
import sys
from pathlib import Path


BASE = Path(__file__).with_name("build_hornet_mtx.py")
SPEC = importlib.util.spec_from_file_location("hornet_mtx_base", BASE)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"cannot load sanctioned Hornet builder: {BASE}")
MTX = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MTX)

bpy = MTX.bpy
bmesh = MTX.bmesh
Vector = MTX.Vector
FAMILY = MTX.FAMILY


def cycle_from_args() -> int:
    for index, token in enumerate(sys.argv):
        if token.startswith("--mtx-cycle="):
            return int(token.split("=", 1)[1])
        if token in {"--mtx-cycle", "--cycle"} and index + 1 < len(sys.argv):
            return int(sys.argv[index + 1])
    return int(getattr(MTX, "CYCLE", 1))


CYCLE = cycle_from_args()
MTX.CYCLE = CYCLE
TAG = f"C{CYCLE:03d}"


def _set_input(node, name, value):
    socket = node.inputs.get(name)
    if socket is not None:
        socket.default_value = value


def wire_form_maps(material, bsdf, maps, coat=0.0, uv1_scale=72.0):
    """Bind unique UV0 maps and a restrained UV1 material-specific micro response."""
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    uv0 = nodes.new("ShaderNodeUVMap")
    uv0.name = "SF_UV0_BAKE"
    uv0.uv_map = "UVMap"
    uv1 = nodes.new("ShaderNodeUVMap")
    uv1.name = "SF_UV1_DETAIL"
    uv1.uv_map = "UV1"
    base = nodes.new("ShaderNodeTexImage")
    base.name = "SF_UNIQUE_ALBEDO"
    base.image = maps[0]
    orm = nodes.new("ShaderNodeTexImage")
    orm.name = "SF_AUTHORED_ORM"
    orm.image = maps[1]
    normal = nodes.new("ShaderNodeTexImage")
    normal.name = "SF_TANGENT_NORMAL"
    normal.image = maps[2]
    links.new(uv0.outputs["UV"], base.inputs["Vector"])
    links.new(uv0.outputs["UV"], orm.inputs["Vector"])
    links.new(uv0.outputs["UV"], normal.inputs["Vector"])
    links.new(base.outputs["Color"], bsdf.inputs["Base Color"])
    split = nodes.new("ShaderNodeSeparateColor")
    links.new(orm.outputs["Color"], split.inputs["Color"])
    if split.outputs.get("Green") is not None:
        links.new(split.outputs["Green"], bsdf.inputs["Roughness"])
    if split.outputs.get("Blue") is not None:
        links.new(split.outputs["Blue"], bsdf.inputs["Metallic"])
    normal_map = nodes.new("ShaderNodeNormalMap")
    normal_map.name = "SF_MIKKT_OPENGL_NORMAL"
    normal_map.space = "TANGENT"
    _set_input(normal_map, "Strength", 0.78)
    links.new(normal.outputs["Color"], normal_map.inputs["Color"])

    # UV1 is a separate tiled detail coordinate.  It modulates a small bump response and never
    # replaces the unique bake, so meso construction remains geometry/UV0 driven.
    noise = nodes.new("ShaderNodeTexNoise")
    noise.name = "SF_UV1_MATERIAL_DETAIL"
    _set_input(noise, "Scale", uv1_scale)
    _set_input(noise, "Detail", 2.0)
    _set_input(noise, "Roughness", 0.58)
    bump = nodes.new("ShaderNodeBump")
    bump.name = "SF_UV1_MICRO_NORMAL"
    _set_input(bump, "Strength", 0.045)
    _set_input(bump, "Distance", 0.006)
    links.new(uv1.outputs["UV"], noise.inputs["Vector"])
    links.new(noise.outputs["Fac"], bump.inputs["Height"])
    links.new(normal_map.outputs["Normal"], bump.inputs["Normal"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    if coat and bsdf.inputs.get("Coat Weight") is not None:
        _set_input(bsdf, "Coat Weight", coat)
        _set_input(bsdf, "Coat Roughness", 0.10)


def soften_plate_seams(maps, role):
    """Keep authored map density while removing the synthetic checkerboard read.

    The sanctioned role-map generator deliberately bakes narrow plate seams.  At the
    close chase distance, C186-C189's repeated 96x64/72x48 seams were aliasing into a
    uniform grid across the whole airframe.  C190 retains the same unique UV0/ORM/normal
    maps and UV1 detail, but blends only the two-pixel seam bands toward their immediate
    plate so they read as restrained course breaks instead of a debug texture.
    """
    if CYCLE < 190 or role not in {"hull", "armor"}:
        return maps
    periods = {"hull": (96, 64), "armor": (72, 48)}
    pw, ph = periods[role]
    for image in maps:
        width, height = image.size[:]
        pixels = list(image.pixels)
        for y in range(height):
            for x in range(width):
                sx, sy = x % pw, y % ph
                if sx not in (0, 1, pw - 2, pw - 1) and sy not in (0, 1, ph - 2, ph - 1):
                    continue
                if sx in (0, 1, pw - 2, pw - 1):
                    nx = (x + 2) % width if sx in (0, 1) else (x - 2) % width
                    ny = y
                else:
                    nx = x
                    ny = (y + 2) % height if sy in (0, 1) else (y - 2) % height
                target = 4 * (y * width + x)
                source = 4 * (ny * width + nx)
                for channel in range(3):
                    pixels[target + channel] = pixels[target + channel] * 0.30 + pixels[source + channel] * 0.70
        image.pixels = pixels
        image.update()
        image.filepath_raw = str(MTX.TEX_DIR / f"{image.name}.png")
        image.file_format = "PNG"
        image.save()
    return maps


def create_form_materials():
    """Create distinct Hornet material roles with a deterministic LOD texture ladder."""
    specs = {
        "Material_Hull": ((0.50, 0.55, 0.61), "hull", 0.0, 0.46, 0.42),
        "Material_HullPanel": ((0.34, 0.39, 0.45), "hull", 0.0, 0.52, 0.36),
        "Material_Armor": ((0.075, 0.095, 0.12), "armor", 0.16, 0.50, 0.55),
        "Material_Wing": ((0.19, 0.24, 0.30), "armor", 0.12, 0.44, 0.62),
        "Material_Mechanical": ((0.24, 0.27, 0.29), "mechanical", 0.90, 0.30, 24.0),
        "Material_Ceramic": ((0.31, 0.27, 0.23), "ceramic", 0.0, 0.68, 36.0),
        "Material_Radiator": ((0.11, 0.13, 0.14), "mechanical", 0.82, 0.48, 52.0),
        "Material_Accent": ((0.035, 0.36, 0.46), "accent", 0.10, 0.34, 64.0),
        "Material_Warning": ((0.88, 0.18, 0.035), "warning", 0.04, 0.42, 52.0),
    }
    if CYCLE >= 188:
        # A restrained steel-blue value hierarchy: bright pressure shell, dark lifting
        # surfaces/mechanical recesses, and small cyan/red service marks.  This is a surface
        # read correction, not a new identity or an extra garnish layer.
        specs.update({
            "Material_Hull": ((0.39, 0.47, 0.56), "hull", 0.0, 0.46, 0.42),
            "Material_HullPanel": ((0.25, 0.32, 0.40), "hull", 0.0, 0.52, 0.36),
            "Material_Armor": ((0.055, 0.090, 0.130), "armor", 0.16, 0.50, 0.55),
            "Material_Wing": ((0.075, 0.145, 0.205), "armor", 0.12, 0.44, 0.62),
            "Material_Mechanical": ((0.16, 0.20, 0.24), "mechanical", 0.90, 0.30, 24.0),
            "Material_Ceramic": ((0.34, 0.27, 0.20), "ceramic", 0.0, 0.68, 36.0),
        })
    mats = {}
    for name, (rgb, role, metallic, roughness, detail_scale) in specs.items():
        material = bpy.data.materials.new(name)
        bsdf = MTX.principled(material)
        _set_input(bsdf, "Base Color", (*rgb, 1.0))
        _set_input(bsdf, "Metallic", metallic)
        _set_input(bsdf, "Roughness", roughness)
        maps = MTX.role_maps(
            role,
            rgb,
            size=MTX.TEX,
            prefix=f"form_c{CYCLE:03d}_lod{MTX.TEX}_{name.replace('Material_', '').lower()}",
        )
        soften_plate_seams(maps, role)
        wire_form_maps(material, bsdf, maps, coat=0.22 if role == "hull" else 0.08, uv1_scale=detail_scale)
        material["spacefaceRole"] = role
        material["spacefaceMapLadder"] = f"LOD{MTX.TEX} unique UV0 + UV1 detail"
        mats[name] = material

    simple_specs = {
        "Material_Canopy": ((0.008, 0.018, 0.028), 0.0, 0.12, "glass"),
        "Material_Frame": ((0.34, 0.39, 0.43), 0.88, 0.32, "mechanical"),
        "Material_Soot": ((0.012, 0.014, 0.016), 0.0, 0.84, "soot"),
        "Material_Gap": ((0.018, 0.022, 0.026), 0.0, 0.76, "gap"),
    }
    for name, (rgb, metallic, roughness, role) in simple_specs.items():
        material = bpy.data.materials.new(name)
        bsdf = MTX.principled(material)
        _set_input(bsdf, "Base Color", (*rgb, 1.0))
        _set_input(bsdf, "Metallic", metallic)
        _set_input(bsdf, "Roughness", roughness)
        if name == "Material_Canopy":
            _set_input(bsdf, "Transmission Weight", 0.0)
            _set_input(bsdf, "Coat Weight", 0.32)
            _set_input(bsdf, "Coat Roughness", 0.10)
            _set_input(bsdf, "Alpha", 1.0)
            try:
                material.surface_render_method = "DITHERED"
            except (AttributeError, TypeError):
                pass
            try:
                material.blend_method = "OPAQUE"
            except (AttributeError, TypeError):
                pass
        material["spacefaceRole"] = role
        mats[name] = material
    return mats


def finish(obj, material, bevel=0.010):
    return MTX.finish_mesh(obj, material, bevel)


def mesh_object(name, vertices, faces, material, collection, bevel=0.010):
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    return finish(obj, material, bevel)


def loft_open(name, rings, material, collection, bevel=0.006):
    """Loft a thin shell without closing the underside (used for the canopy glass)."""
    sides = len(rings[0])
    vertices = [point for ring in rings for point in ring]
    faces = []
    for station in range(len(rings) - 1):
        start = station * sides
        next_start = (station + 1) * sides
        for index in range(sides - 1):
            faces.append((start + index, next_start + index, next_start + index + 1, start + index + 1))
    return mesh_object(name, vertices, faces, material, collection, bevel)


def section_ring(x, half_width, half_height, zc, flat, shoulder, keel):
    """Authored 16-point pressure-shell station with changing deck/chine/keel sections."""
    flat = max(0.0, min(1.0, flat))
    shoulder = max(0.0, min(1.0, shoulder))
    keel = max(0.0, min(1.0, keel))
    deck = half_width * (0.08 + flat * 0.62)
    upper = zc + half_height
    shoulder_y = half_width * (0.38 + shoulder * 0.40)
    shoulder_z = zc + half_height * (0.72 - shoulder * 0.20)
    beam_z = zc + half_height * (0.15 - shoulder * 0.15)
    lower_y = half_width * (0.78 - shoulder * 0.08)
    lower_z = zc - half_height * (0.38 + shoulder * 0.10)
    keel_y = half_width * (0.10 + (1.0 - keel) * 0.36)
    keel_z = zc - half_height * (0.88 + keel * 0.12)
    return [
        (x, 0.0, upper),
        (x, deck, upper - half_height * 0.015),
        (x, half_width * 0.34, zc + half_height * 0.93),
        (x, shoulder_y, shoulder_z),
        (x, half_width * 0.88, zc + half_height * 0.42),
        (x, half_width, beam_z),
        (x, lower_y, lower_z),
        (x, keel_y, keel_z),
        (x, 0.0, zc - half_height),
        (x, -keel_y, keel_z),
        (x, -lower_y, lower_z),
        (x, -half_width, beam_z),
        (x, -half_width * 0.88, zc + half_height * 0.42),
        (x, -shoulder_y, shoulder_z),
        (x, -half_width * 0.34, zc + half_height * 0.93),
        (x, -deck, upper - half_height * 0.015),
    ]


def airfoil_section(y, x_le, zc, chord, thickness):
    """Closed formed wing section; thickness tapers with span instead of becoming a card."""
    return [
        (x_le, y, zc),
        (x_le - chord * 0.10, y, zc + thickness * 0.48),
        (x_le - chord * 0.28, y, zc + thickness),
        (x_le - chord * 0.52, y, zc + thickness * 0.78),
        (x_le - chord * 0.78, y, zc + thickness * 0.30),
        (x_le - chord, y, zc),
        (x_le - chord * 0.80, y, zc - thickness * 0.18),
        (x_le - chord * 0.52, y, zc - thickness * 0.46),
        (x_le - chord * 0.27, y, zc - thickness * 0.72),
        (x_le - chord * 0.10, y, zc - thickness * 0.30),
    ]


def append_lower_material(obj, material, limit=0.0):
    if material.name not in [slot.name for slot in obj.material_slots]:
        obj.data.materials.append(material)
    slot = obj.data.materials.find(material.name)
    for poly in obj.data.polygons:
        mean_z = sum(obj.data.vertices[index].co.z for index in poly.vertices) / len(poly.vertices)
        if mean_z < limit:
            poly.material_index = slot


def assign_hull_roles(obj, mats):
    for material_name in ("Material_HullPanel", "Material_Mechanical"):
        if material_name not in [slot.name for slot in obj.material_slots]:
            obj.data.materials.append(mats[material_name])
    panel_slot = obj.data.materials.find("Material_HullPanel")
    mech_slot = obj.data.materials.find("Material_Mechanical")
    for poly in obj.data.polygons:
        center_x = sum(obj.data.vertices[index].co.x for index in poly.vertices) / len(poly.vertices)
        center_z = sum(obj.data.vertices[index].co.z for index in poly.vertices) / len(poly.vertices)
        if center_x < -2.45 and center_z > 0.15:
            poly.material_index = panel_slot
        elif center_z < -0.55:
            poly.material_index = mech_slot


def add_annulus(name, x, y, z, outer, inner, depth, material, collection, vertices=24):
    verts = []
    for side_x in (-depth * 0.5, depth * 0.5):
        for radius in (outer, inner):
            for index in range(vertices):
                angle = math.tau * index / vertices
                verts.append((side_x, radius * math.cos(angle), radius * math.sin(angle)))
    faces = []
    outer_a, inner_a = 0, vertices
    outer_b, inner_b = vertices * 2, vertices * 3
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
    obj = mesh_object(name, verts, faces, material, collection, 0.004)
    obj.location = (x, y, z)
    MTX.apply_modifiers(obj)
    return obj


def cut_cylinder(host, name, location, radius, depth):
    """Cut a +X drive throat, restoring the host if the boolean collapses the shell."""
    MTX.apply_modifiers(host)
    backup = host.data.copy()
    before = len(host.data.vertices)
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=24,
        radius=radius,
        depth=depth,
        location=location,
        rotation=(0.0, math.pi / 2.0, 0.0),
    )
    cutter = bpy.context.object
    cutter.name = name
    MTX.apply_modifiers(cutter)
    bpy.context.view_layer.objects.active = host
    host.select_set(True)
    mod = host.modifiers.new(name, "BOOLEAN")
    mod.operation = "DIFFERENCE"
    # A Boolean without an operand is silently disabled by Blender.  The first C186
    # export therefore reported a restored throat even though the construction code
    # looked otherwise identical to the sanctioned cube-cut helper.
    mod.object = cutter
    mod.show_viewport = True
    mod.show_render = True
    mod.show_in_editmode = True
    try:
        mod.solver = "FLOAT"
    except (AttributeError, TypeError):
        pass
    mod_name = mod.name
    ok = False
    try:
        result = bpy.ops.object.modifier_apply(modifier=mod_name)
        ok = result == {"FINISHED"} and len(host.data.vertices) >= max(320, int(before * 0.45))
    except Exception as exc:
        print(f"cut_cylinder {name} failed: {exc}")
    finally:
        host.select_set(False)
        if not ok:
            remaining = host.modifiers.get(mod_name)
            if remaining is not None:
                host.modifiers.remove(remaining)
        if cutter.name in bpy.data.objects:
            bpy.data.objects.remove(cutter, do_unlink=True)
    if not ok:
        host.data = backup
    print(f"cut_cylinder {name}: {'hit' if ok else 'restored'} {before}->{len(host.data.vertices)}")
    return ok


def triangulate_export_mesh(obj):
    """Make every render mesh explicitly triangulated before tangent/export work.

    The glTF exporter can triangulate at export time, but tangent generation runs before
    that conversion and emits warnings for the authored n-gons.  Doing this once at the
    authored boundary keeps the tangent basis deterministic without touching collision
    geometry or the runtime asset.
    """
    if obj.type != "MESH" or obj.get("collision"):
        return
    mesh = obj.data
    bm = bmesh.new()
    try:
        bm.from_mesh(mesh)
        faces = list(bm.faces)
        if faces:
            bmesh.ops.triangulate(
                bm,
                faces=faces,
                quad_method="BEAUTY",
                ngon_method="BEAUTY",
            )
            bm.to_mesh(mesh)
            mesh.update()
    finally:
        bm.free()


def add_decal(name, outline, z, material, collection):
    verts = [(x, y, z) for x, y in outline]
    return mesh_object(name, verts, [tuple(range(len(verts)))], material, collection, 0.0)


def add_canopy(hull, mats, collection, lod):
    canopy = mats["Material_Canopy"]
    frame = mats["Material_Frame"]
    gap = mats["Material_Gap"]
    # C187 keeps the same cockpit interface but gives the excavation enough beam and
    # setback to read from the actual 60-degree chase view instead of as a nose slit.
    cockpit_x = 3.45 if CYCLE >= 187 else 3.68
    cockpit_scale = (0.98, 0.68, 0.46) if CYCLE >= 187 else (0.78, 0.54, 0.40)
    tub_size = (0.87, 0.59, 0.22) if CYCLE >= 187 else (0.70, 0.46, 0.20)
    cut_ok = MTX.safe_boolean_cut(hull, f"CanopyWell_{TAG}", (cockpit_x, 0.0, 0.72), cockpit_scale)
    tub = MTX.add_five_wall_tub(
        f"CanopyTub_{TAG}",
        (cockpit_x, 0.0, 0.46 if CYCLE >= 187 else 0.48),
        tub_size,
        0.065,
        gap,
        collection,
    )
    _ = tub
    section_count = 6 if lod < 2 else 4
    profile = [
        (4.42, 0.08, 0.61),
        (4.16, 0.38, 0.64),
        (3.82, 0.52, 0.72),
        (3.42, 0.52, 0.74),
        (3.08, 0.37, 0.68),
        (2.94, 0.08, 0.62),
    ]
    if CYCLE >= 187:
        # The shell must crest above the pressure deck.  The first C187 pass enlarged the
        # cut but left its glass crown buried in the hull's upper station, so the chase still
        # saw only a black slit.  Raise the crown while retaining the excavated tub below it.
        profile = [(x - 0.23, width * 1.16, top + 0.34) for x, width, top in profile]
    if section_count == 4:
        profile = [profile[index] for index in (0, 2, 3, 5)]
    rings = []
    for x, half_width, top_z in profile:
        points = []
        for index in range(9):
            angle = math.pi * index / 8.0
            y = -half_width * math.cos(angle)
            z = 0.58 + (top_z - 0.58) * math.sin(angle)
            points.append((x, y, z))
        rings.append(points)
    glass = loft_open("Canopy_GlassShell", rings, canopy, collection, 0.003)
    frames = []
    for sign, tag in ((-1.0, "Port"), (1.0, "Stbd")):
        frames.append(
            MTX.add_folded_sheet(
                f"CanopyFrame_{tag}",
                ((4.19 if CYCLE >= 187 else 4.42), sign * (0.12 if CYCLE >= 187 else 0.10), 0.86 if CYCLE >= 187 else 0.62),
                ((2.85 if CYCLE >= 187 else 3.08), sign * (0.46 if CYCLE >= 187 else 0.40), 1.02 if CYCLE >= 187 else 0.68),
                ((2.85 if CYCLE >= 187 else 3.08), sign * (0.39 if CYCLE >= 187 else 0.34), 1.07 if CYCLE >= 187 else 0.73),
                ((4.19 if CYCLE >= 187 else 4.42), sign * (0.07 if CYCLE >= 187 else 0.06), 0.92 if CYCLE >= 187 else 0.67),
                0.045,
                frame,
                collection,
                0.003,
            )
        )
    if lod == 0:
        frames.append(MTX.add_folded_sheet(
            "CanopyFrame_Fore",
            (4.20 if CYCLE >= 187 else 4.43, -0.12 if CYCLE >= 187 else -0.10, 0.86 if CYCLE >= 187 else 0.62),
            (4.20 if CYCLE >= 187 else 4.43, 0.12 if CYCLE >= 187 else 0.10, 0.86 if CYCLE >= 187 else 0.62),
            (3.97 if CYCLE >= 187 else 4.20, 0.39 if CYCLE >= 187 else 0.34, 0.94 if CYCLE >= 187 else 0.66),
            (3.97 if CYCLE >= 187 else 4.20, -0.39 if CYCLE >= 187 else -0.34, 0.94 if CYCLE >= 187 else 0.66),
            0.040,
            frame,
            collection,
            0.003,
        ))
    print(f"canopy well: {'hit' if cut_ok else 'fallback'}; shell stations={len(rings)}")
    return [glass, *frames]


def add_drive(tag, sign, mats, collection, lod):
    y = 0.98 * sign
    z = 0.10
    opened = cut_cylinder(MTX._active_hull_for_c186, f"DriveWell_{TAG}_{tag}", (-4.84, y, z), 0.62, 1.10)
    rim = add_annulus(f"DriveFlange_{tag}", -4.98, y, z, 0.68, 0.53, 0.18, mats["Material_Frame"], collection, 28 if lod == 0 else 20)
    ceramic = add_annulus(f"DriveCeramic_{tag}", -4.90, y, z, 0.53, 0.38, 0.15, mats["Material_Ceramic"], collection, 24 if lod == 0 else 18)
    bore = MTX.add_cylinder(
        f"DriveBore_{tag}",
        (-4.81, y, z),
        0.37,
        0.08,
        mats["Material_Soot"],
        collection,
        vertices=22 if lod == 0 else 16,
        bevel=0.002,
        rot=(0.0, math.pi / 2.0, 0.0),
    )
    bits = [rim, ceramic, bore]
    vane_count = 8 if lod == 0 else (5 if lod == 1 else 0)
    for index in range(vane_count):
        angle = math.tau * index / vane_count
        bits.append(
            MTX.add_box(
                f"DriveVane_{tag}_{index}",
                (-4.84, y + math.cos(angle) * 0.25, z + math.sin(angle) * 0.25),
                (0.055, 0.035, 0.26 if lod == 0 else 0.21),
                mats["Material_Mechanical"],
                collection,
                0.002,
                rot=(angle, 0.0, 0.0),
            )
        )
    return bits, {"tag": tag, "opened": opened, "mouthOuterRadius": 0.68}


def build_wing(name, sign, mats, collection, lod):
    # C188 separates the lifting surfaces from the pressure shell in value.  C186/C187
    # carried the hull map across the wing crown, so the silhouette disappeared into one
    # gridded slab in the play frame; the root fairing below remains hull-colored.
    wing = mats["Material_Wing"] if CYCLE >= 188 else mats["Material_Hull"]
    underside = mats["Material_Wing"]
    full = [
        (1.34, 2.22, 0.09, 3.72, 0.52),
        (1.72, 2.04, 0.11, 3.58, 0.46),
        (2.22, 2.58, 0.13, 3.10, 0.36),
        (2.86, 3.10, 0.16, 2.56, 0.26),
        (3.54, 3.56, 0.18, 1.88, 0.17),
        (4.02, 3.88, 0.20, 1.22, 0.10),
    ]
    if lod == 1:
        full = [full[index] for index in (0, 1, 3, 5)]
    elif lod == 2:
        full = [full[index] for index in (0, 3, 5)]
    rings = [MTX.densify_ring(airfoil_section(y * sign, x, z, chord, thick), 2 if lod == 0 else 1) for x, y, z, chord, thick in full]
    obj = MTX.loft_from_rings(name, rings, wing, collection, 0.012 if lod == 0 else 0.008, cap=True)
    append_lower_material(obj, underside, limit=0.0)
    # The root fairing is also hull-colored and starts inside the pressure shell.  It leaves a
    # continuous lifting shoulder instead of a detached triangular card.
    root_rings = [
        MTX.densify_ring(airfoil_section(1.12 * sign, 1.46, 0.08, 3.38, 0.64), 2),
        MTX.densify_ring(airfoil_section(1.34 * sign, 1.34, 0.09, 3.72, 0.52), 2),
        MTX.densify_ring(airfoil_section(1.72 * sign, 1.72, 0.11, 3.58, 0.46), 2),
    ]
    fairing = MTX.loft_from_rings(f"{name}_RootFairing", root_rings, wing, collection, 0.012, cap=True)
    append_lower_material(fairing, underside, limit=-0.02)
    bits = [obj, fairing]
    if lod < 2:
        flap = MTX.loft_from_rings(
            f"{name}_Flap",
            [
                MTX.densify_ring(airfoil_section(2.42 * sign, -0.58, 0.15, 0.92, 0.12), 1),
                MTX.densify_ring(airfoil_section(3.52 * sign, -0.44, 0.18, 0.54, 0.07), 1),
            ],
            underside,
            collection,
            0.004,
            cap=True,
        )
        bits.append(flap)
    return bits


def add_canards(mats, collection, lod):
    bits = []
    if lod == 2:
        return bits
    for sign, tag in ((-1.0, "Port"), (1.0, "Stbd")):
        bits.append(
            MTX.loft_from_rings(
                f"Canard_{tag}",
                [
                    MTX.densify_ring(airfoil_section(0.30 * sign, 4.55, 0.22, 0.88, 0.13), 1),
                    MTX.densify_ring(airfoil_section(0.96 * sign, 4.22, 0.25, 0.44, 0.075), 1),
                ],
                mats["Material_Armor"],
                collection,
                0.005,
                cap=True,
            )
        )
        bits.append(MTX.add_box(
            f"GunCheek_{tag}",
            (4.65, 0.42 * sign, 0.12),
            (0.38, 0.13, 0.16),
            mats["Material_Armor"],
            collection,
            0.008,
        ))
    return bits


def build_radiator(hull, mats, collection, lod):
    ok = MTX.safe_boolean_cut(hull, f"RadiatorWell_{TAG}", (-1.15, 2.05, 0.55), (0.56, 0.42, 0.18))
    bits = []
    bits.extend(MTX.add_five_wall_tub(
        f"RadiatorCassette_{TAG}",
        (-1.15, 2.10, 0.50),
        (0.48, 0.24, 0.13),
        0.045,
        mats["Material_Gap"],
        collection,
    ) or [])
    count = 7 if lod == 0 else (4 if lod == 1 else 0)
    for index in range(count):
        bits.append(MTX.add_box(
            f"RadiatorFin_{TAG}_{index}",
            (-1.53 + index * 0.13, 2.30, 0.54),
            (0.035, 0.17, 0.14),
            mats["Material_Radiator"],
            collection,
            0.002,
        ))
    return bits, ok


def add_surface_story(mats, collection, lod):
    bits = []
    if lod < 2:
        panel = mats["Material_HullPanel"]
        for sign, tag in ((-1.0, "Port"), (1.0, "Stbd")):
            bits.append(MTX.add_folded_sheet(
                f"SaddlePanel_{tag}",
                (1.42, 0.20 * sign, 0.72),
                (0.42, 1.05 * sign, 0.67),
                (-0.90, 1.16 * sign, 0.63),
                (-1.36, 0.30 * sign, 0.70),
                0.028,
                panel,
                collection,
                0.003,
            ))
    if lod == 0:
        bits.append(add_decal(
            "WarningStencil_Spray",
            [(1.05, 0.26), (0.76, 0.48), (0.42, 0.44), (0.68, 0.22)],
            0.76,
            mats["Material_Warning"],
            collection,
        ))
        # A single off-center repair patch breaks the mirrored factory read without adding a
        # random cube or a raised plaque.
        bits.append(add_decal(
            "RepairPatch_Offset",
            [(-0.62, -0.68), (-0.92, -0.84), (-1.30, -0.76), (-1.06, -0.56)],
            0.65,
            mats["Material_Accent"],
            collection,
        ))
        bits.extend([
            MTX.add_curve_hose(
                "ServiceHose_Stbd",
                [(-1.12, 1.34, 0.46), (-1.55, 1.34, 0.40), (-2.18, 1.16, 0.32), (-2.92, 1.04, 0.28)],
                mats["Material_Mechanical"],
                collection,
                0.018,
            ),
            MTX.add_curve_hose(
                "ServiceHose_Port",
                [(-1.12, -1.34, 0.46), (-1.55, -1.34, 0.40), (-2.18, -1.16, 0.32), (-2.92, -1.04, 0.28)],
                mats["Material_Mechanical"],
                collection,
                0.018,
            ),
        ])
    return bits


def collision_mesh(collection, root):
    verts = [
        (-5.22, -2.55, -1.12), (-5.22, 2.55, -1.12), (-5.22, -2.55, 1.12), (-5.22, 2.55, 1.12),
        (5.52, -0.32, -0.55), (5.52, 0.32, -0.55), (5.52, -0.32, 0.66), (5.52, 0.32, 0.66),
        (-1.1, -4.15, 0.0), (-1.1, 4.15, 0.0),
    ]
    faces = [
        (0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6),
        (0, 2, 6, 4), (1, 5, 7, 3), (0, 8, 9, 1),
    ]
    obj = mesh_object("COLLISION_HULL", verts, faces, mats_for_collision_material(), collection, 0.0)
    obj.parent = root
    obj.hide_render = True
    obj["collision"] = True
    obj["nonRender"] = True
    return obj


def mats_for_collision_material():
    material = bpy.data.materials.get("Material_Gap")
    if material is None:
        material = bpy.data.materials.new("Material_Gap")
    return material


def build_lod(lod, mats):
    collection = bpy.data.collections.new(f"HORNET_FORM_{TAG}_LOD{lod}")
    bpy.context.scene.collection.children.link(collection)
    root = MTX.add_empty(f"HORNET_LOD{lod}_ROOT", (0.0, 0.0, 0.0), collection)
    root["spacefaceAsset"] = {
        "assetId": "SF_HORNET_PRODUCTION_V1",
        "partId": "hornet_production_v1",
        "lod": f"lod{lod}",
        "slot": "hull",
        "category": "wholeships",
        "forward": "+X",
        "embeddedPlume": False,
    }
    root["spacefaceConstruction"] = f"{TAG.lower()}_continuous_lifting_shell"

    all_specs = [
        (5.46, 0.14, 0.13, 0.10, 0.02, 0.02, 0.96),
        (5.16, 0.27, 0.22, 0.12, 0.14, 0.10, 0.94),
        (4.76, 0.48, 0.38, 0.16, 0.30, 0.16, 0.90),
        (4.28, 0.72, 0.52, 0.19, 0.50, 0.20, 0.86),
        (3.80, 0.93, 0.61, 0.20, 0.66, 0.22, 0.82),
        (3.28, 1.17, 0.66, 0.18, 0.78, 0.24, 0.78),
        (2.72, 1.52, 0.68, 0.14, 0.86, 0.22, 0.74),
        (2.16, 1.88, 0.66, 0.10, 0.90, 0.20, 0.70),
        (1.54, 2.18, 0.62, 0.06, 0.88, 0.18, 0.66),
        (0.86, 2.38, 0.59, 0.03, 0.84, 0.16, 0.62),
        (0.18, 2.44, 0.58, 0.02, 0.80, 0.14, 0.60),
        (-0.50, 2.40, 0.60, 0.04, 0.76, 0.14, 0.62),
        (-1.16, 2.26, 0.63, 0.07, 0.72, 0.16, 0.66),
        (-1.78, 2.10, 0.68, 0.10, 0.68, 0.18, 0.70),
        (-2.40, 2.08, 0.73, 0.12, 0.62, 0.20, 0.74),
        (-3.02, 2.18, 0.77, 0.14, 0.56, 0.22, 0.78),
        (-3.60, 2.30, 0.81, 0.16, 0.50, 0.24, 0.82),
        (-4.16, 2.36, 0.85, 0.15, 0.44, 0.26, 0.86),
        (-4.62, 2.30, 0.88, 0.13, 0.36, 0.28, 0.90),
        (-4.96, 2.20, 0.89, 0.10, 0.28, 0.30, 0.92),
    ]
    if lod == 1:
        specs = [all_specs[index] for index in range(0, len(all_specs), 2)]
        if specs[-1] != all_specs[-1]:
            specs.append(all_specs[-1])
    else:
        specs = [all_specs[index] for index in (0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 19)]

    if CYCLE >= 187:
        # C186's broad aft shoulder read as a rectangular pod in the play frame.  This
        # controlled taper keeps the same collision/socket envelope while letting the
        # carry-through wings, cockpit, and twin drives own the silhouette.
        tapered = []
        for x, hw, hh, zc, flat, shoulder, keel in specs:
            if CYCLE >= 189:
                width_scale = 0.78 if x < -1.8 else (0.90 if x < 0.6 else 0.96)
                height_scale = 0.90 if x < -2.2 else 0.96
            else:
                width_scale = 0.88 if x < -2.2 else (0.94 if x < 0.4 else 0.98)
                height_scale = 1.0
            tapered.append((x, hw * width_scale, hh * height_scale, zc, flat, shoulder, keel))
        specs = tapered

    rings = [
        MTX.densify_ring(section_ring(x, hw, hh, zc, flat, shoulder, keel), 2)
        for x, hw, hh, zc, flat, shoulder, keel in specs
    ]
    hull = MTX.loft_from_rings(f"LOD{lod}_Hull", rings, mats["Material_Hull"], collection, 0.014 if lod == 0 else 0.010, cap=True)
    MTX._active_hull_for_c186 = hull
    assign_hull_roles(hull, mats)

    canopy_bits = add_canopy(hull, mats, collection, lod)
    drive_bits = []
    drive_reports = []
    for sign, tag in ((-1.0, "Port"), (1.0, "Stbd")):
        bits, report = add_drive(tag, sign, mats, collection, lod)
        drive_bits.extend(bits)
        drive_reports.append(report)
    radiator_bits, radiator_ok = build_radiator(hull, mats, collection, lod)
    wings = []
    for sign, tag in ((-1.0, "Port"), (1.0, "Stbd")):
        wings.extend(build_wing(f"Wing_{tag}", sign, mats, collection, lod))
    canards = add_canards(mats, collection, lod)
    surface_bits = add_surface_story(mats, collection, lod)
    built = [hull, *canopy_bits, *drive_bits, *radiator_bits, *wings, *canards, *surface_bits]

    for obj in built:
        if obj is not None and obj.name in bpy.data.objects:
            obj.parent = root

    # Keep the continuous body dense enough for the historical hull-resolution guard while
    # letting LOD1/2 remove the camera-subpixel hardware. The authored cross sections remain the
    # shape; subdivision only supplies stable mid-poly shading and bake support.
    MTX.subdivide_mesh(hull, 2 if lod == 0 else 3)
    sockets = MTX.sockets()
    for name, location in sockets.items():
        MTX.add_empty(name, location, collection, root)
    collision_mesh(collection, root)

    meshes = [obj for obj in collection.objects if obj.type == "MESH" and not obj.get("collision")]
    for obj in meshes:
        triangulate_export_mesh(obj)
        MTX.shade_and_uv(obj)
    hull.data.calc_loop_triangles()
    hull_triangles = len(hull.data.loop_triangles)
    total_triangles = 0
    for obj in meshes:
        obj.data.calc_loop_triangles()
        total_triangles += len(obj.data.loop_triangles)
    report = {
        "lod": lod,
        "triangles": total_triangles,
        "hullTriangles": hull_triangles,
        "draws": len(meshes),
        "materials": sorted({slot.name for obj in meshes for slot in obj.material_slots}),
        "construction": "continuous_chined_pressure_shell_with_integrated_wing_carrythrough",
        "canopyCut": bool(canopy_bits),
        "driveWells": drive_reports,
        "radiatorWell": bool(radiator_ok),
        "textureMapSize": MTX.TEX,
        "textureMapLadder": {"lod0": 1024, "lod1": 512, "lod2": 512},
    }
    print(f"{TAG} LOD{lod}: hull={hull_triangles} tris={total_triangles} draws={len(meshes)}")
    return collection, report


def main():
    # Delegate reset/export/render bookkeeping to the existing sanctioned Hornet builder.  Its
    # main loop sets MTX.TEX for each LOD and writes cycle JSON plus chase stills.
    MTX.build_lod = build_lod
    MTX.create_materials = create_form_materials
    MTX.main()


if __name__ == "__main__":
    raise SystemExit(main())
