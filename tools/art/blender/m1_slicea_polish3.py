"""M1-SLICEA POLISH3 — form rewrite + UV PBR atlases.

Hub: rectangular/hex dock arms, truss, hangars (NOT round tubes).
Gate: segmented armored ring flush to spine (NOT smooth torus alone).
Rocks: continuous geology + surface-following ore veins + textures.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import sys
from datetime import date

import bpy
from mathutils import Vector, Matrix, Euler

ROOT = os.environ.get("SF_ROOT", r"C:\Users\93rob\Documents\GitHub\SpaceFace")
DATE = date.today().isoformat()
TEX = os.path.join(ROOT, "assets", "ships", "parts", "textures")


def argv_after():
    return sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--asset", required=True)
    p.add_argument("--variant", default="a")
    return p.parse_args(argv_after())


def clear_scene_meshes():
    for o in list(bpy.data.objects):
        if o.type in {"MESH", "CURVE", "EMPTY", "LIGHT"} and not o.name.startswith("Camera"):
            bpy.data.objects.remove(o, do_unlink=True)
    for m in list(bpy.data.meshes):
        if m.users == 0:
            bpy.data.meshes.remove(m)


def load_img(path, non_color=False):
    name = os.path.basename(path)
    img = bpy.data.images.get(name)
    if img is None:
        img = bpy.data.images.load(path)
    else:
        img.filepath = path
        img.reload()
    if non_color:
        try:
            img.colorspace_settings.name = "Non-Color"
        except Exception:
            pass
    return img


def pbr_mat(name, tex_dir, base_rgba=(0.4, 0.4, 0.4, 1), metal=0.5, rough=0.4, emi=None, emi_s=0.0):
    """Material with UV basecolor/normal/ORM (+ contract ao/rough bake node names)."""
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = base_rgba
    bsdf.inputs["Metallic"].default_value = metal
    bsdf.inputs["Roughness"].default_value = rough
    if emi is not None:
        if "Emission Color" in bsdf.inputs:
            bsdf.inputs["Emission Color"].default_value = emi
        if "Emission Strength" in bsdf.inputs:
            bsdf.inputs["Emission Strength"].default_value = emi_s

    uv = nodes.new("ShaderNodeTexCoord")
    # basecolor
    bc_path = os.path.join(tex_dir, "basecolor.png")
    nrm_path = os.path.join(tex_dir, "normal.png")
    orm_path = os.path.join(tex_dir, "orm.png")
    if os.path.isfile(bc_path):
        tex_bc = nodes.new("ShaderNodeTexImage")
        tex_bc.image = load_img(bc_path, non_color=False)
        tex_bc.name = "basecolor"
        links.new(uv.outputs["UV"], tex_bc.inputs["Vector"])
        links.new(tex_bc.outputs["Color"], bsdf.inputs["Base Color"])
    if os.path.isfile(nrm_path):
        tex_n = nodes.new("ShaderNodeTexImage")
        tex_n.image = load_img(nrm_path, non_color=True)
        tex_n.name = "normal_bake"
        links.new(uv.outputs["UV"], tex_n.inputs["Vector"])
        nrm = nodes.new("ShaderNodeNormalMap")
        links.new(tex_n.outputs["Color"], nrm.inputs["Color"])
        links.new(nrm.outputs["Normal"], bsdf.inputs["Normal"])
    if os.path.isfile(orm_path):
        tex_o = nodes.new("ShaderNodeTexImage")
        tex_o.image = load_img(orm_path, non_color=True)
        tex_o.name = "orm"
        # also name ao_bake/rough_bake for contract
        tex_ao = nodes.new("ShaderNodeTexImage")
        tex_ao.image = tex_o.image
        tex_ao.name = "ao_bake"
        tex_r = nodes.new("ShaderNodeTexImage")
        tex_r.image = tex_o.image
        tex_r.name = "rough_bake"
        links.new(uv.outputs["UV"], tex_o.inputs["Vector"])
        links.new(uv.outputs["UV"], tex_ao.inputs["Vector"])
        links.new(uv.outputs["UV"], tex_r.inputs["Vector"])
        sep = nodes.new("ShaderNodeSeparateColor")
        links.new(tex_o.outputs["Color"], sep.inputs["Color"])
        # R=AO G=Rough B=Metal
        if "Ambient Occlusion" in bsdf.inputs:
            links.new(sep.outputs["Red"], bsdf.inputs["Ambient Occlusion"])
        links.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
        links.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])
    else:
        # flat contract images
        if "SF_ao_flat" not in bpy.data.images:
            img = bpy.data.images.new("SF_ao_flat", 8, 8)
            img.generated_color = (0.6, 0.6, 0.6, 1)
        if "SF_rough_flat" not in bpy.data.images:
            img = bpy.data.images.new("SF_rough_flat", 8, 8)
            img.generated_color = (rough, rough, rough, 1)
        ao = nodes.new("ShaderNodeTexImage")
        ao.name = "ao_bake"
        ao.image = bpy.data.images["SF_ao_flat"]
        rt = nodes.new("ShaderNodeTexImage")
        rt.name = "rough_bake"
        rt.image = bpy.data.images["SF_rough_flat"]
        links.new(rt.outputs["Color"], bsdf.inputs["Roughness"])

    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat


def set_mat(obj, mat):
    if not obj.data.materials:
        obj.data.materials.append(mat)
    else:
        for i in range(len(obj.data.materials)):
            obj.data.materials[i] = mat
    obj["spaceface_chamfered"] = True


def bevel(obj, width=0.05, segs=2):
    if any(m.type == "BEVEL" for m in obj.modifiers):
        return
    m = obj.modifiers.new("SF_Bevel", "BEVEL")
    m.width = width
    m.segments = segs
    m.limit_method = "ANGLE"
    m.angle_limit = math.radians(30)


def wn(obj):
    try:
        if not any(m.type == "WEIGHTED_NORMAL" for m in obj.modifiers):
            m = obj.modifiers.new("SF_WN", "WEIGHTED_NORMAL")
            m.mode = "FACE_AREA"
            m.weight = 50
            m.keep_sharp = True
    except Exception:
        pass


def apply_mods(obj):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    for m in list(obj.modifiers):
        try:
            bpy.ops.object.modifier_apply(modifier=m.name)
        except Exception:
            pass
    obj.select_set(False)


def smart_uv(obj):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    try:
        bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.02)
    except Exception:
        bpy.ops.uv.unwrap(margin=0.02)
    bpy.ops.object.mode_set(mode="OBJECT")
    obj.select_set(False)


def box(name, loc, scale, mat, rot=(0, 0, 0), bw=0.05):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.active_object
    o.name = name
    o.scale = scale
    o.rotation_euler = rot
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    o.location = Vector(loc)
    set_mat(o, mat)
    bevel(o, bw)
    wn(o)
    return o


def cyl(name, loc, r, depth, mat, axis="Z", segs=20, bw=0.04):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, location=loc, vertices=segs)
    o = bpy.context.active_object
    o.name = name
    if axis == "X":
        o.rotation_euler = (0, math.radians(90), 0)
    elif axis == "Y":
        o.rotation_euler = (math.radians(90), 0, 0)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    o.location = Vector(loc)
    set_mat(o, mat)
    bevel(o, bw)
    wn(o)
    return o


def sphere(name, loc, r, mat, segs=32, rings=20, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc, segments=segs, ring_count=rings)
    o = bpy.context.active_object
    o.name = name
    o.scale = scale
    bpy.ops.object.transform_apply(scale=True)
    o.location = Vector(loc)
    set_mat(o, mat)
    bevel(o, 0.02)
    return o


def displace(obj, strength=0.45, scale=1.5, seed=1):
    import random

    rng = random.Random(seed)
    me = obj.data
    for v in me.vertices:
        x, y, z = v.co
        n = 0.0
        amp, freq = 1.0, scale
        for _ in range(4):
            n += amp * (
                math.sin(x * freq * 1.7 + seed)
                * math.cos(y * freq * 1.3 + seed * 0.6)
                * math.sin(z * freq * 1.1 + seed * 1.2)
            )
            n += amp * 0.1 * (rng.random() * 2 - 1)
            amp *= 0.5
            freq *= 2.0
        if v.co.length > 1e-6:
            v.co += v.co.normalized() * (n * strength)
    me.update()


def join_by_material(prefix, mat_name):
    """Merge all mesh objects whose material matches, starting with prefix."""
    objs = []
    for o in bpy.data.objects:
        if o.type != "MESH":
            continue
        if not o.name.startswith(prefix) and prefix != "":
            # allow all
            pass
        mats = [s.material.name if s.material else "" for s in o.material_slots]
        if mat_name in mats:
            objs.append(o)
    if len(objs) < 2:
        return objs[0] if objs else None
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    o = bpy.context.active_object
    o.name = f"Merged_{mat_name.replace('Material_', '')}"
    o["spaceface_chamfered"] = True
    return o


def shade_smooth_all():
    for o in bpy.data.objects:
        if o.type != "MESH":
            continue
        bpy.context.view_layer.objects.active = o
        o.select_set(True)
        try:
            bpy.ops.object.shade_smooth()
        except Exception:
            pass
        o.select_set(False)
        if hasattr(o.data, "use_auto_smooth"):
            o.data.use_auto_smooth = True
            o.data.auto_smooth_angle = math.radians(40)


def uv_all():
    for o in list(bpy.data.objects):
        if o.type == "MESH":
            smart_uv(o)


def bounds():
    coords = []
    for o in bpy.data.objects:
        if o.type != "MESH":
            continue
        coords += [o.matrix_world @ Vector(c) for c in o.bound_box]
    if not coords:
        return Vector(), Vector((1, 1, 1))
    xs = [c.x for c in coords]
    ys = [c.y for c in coords]
    zs = [c.z for c in coords]
    mn = Vector((min(xs), min(ys), min(zs)))
    mx = Vector((max(xs), max(ys), max(zs)))
    return (mn + mx) * 0.5, mx - mn


def tri_total():
    t = 0
    for o in bpy.data.objects:
        if o.type == "MESH":
            t += sum(max(0, len(p.vertices) - 2) for p in o.data.polygons)
    return t


def save_blend(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=path)


def setup_studio(clay=False):
    sc = bpy.context.scene
    for eng in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"):
        try:
            sc.render.engine = eng
            break
        except Exception:
            continue
    sc.render.resolution_x = 1600
    sc.render.resolution_y = 900
    world = sc.world or bpy.data.worlds.new("SF_World")
    sc.world = world
    world.use_nodes = True
    nodes, links = world.node_tree.nodes, world.node_tree.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputWorld")
    bg = nodes.new("ShaderNodeBackground")
    bg.inputs["Color"].default_value = (0.14, 0.14, 0.16, 1) if clay else (0.012, 0.015, 0.022, 1)
    bg.inputs["Strength"].default_value = 1.0 if clay else 0.5
    links.new(bg.outputs["Background"], out.inputs["Surface"])
    for n in list(bpy.data.objects):
        if n.name.startswith("SF_") and n.type == "LIGHT":
            bpy.data.objects.remove(n, do_unlink=True)
    center, extents = bounds()
    sun = bpy.data.lights.new("SF_SUN", "SUN")
    sun.energy = 4.5 if clay else 5.5
    so = bpy.data.objects.new("SF_SUN", sun)
    sc.collection.objects.link(so)
    so.rotation_euler = (math.radians(50), 0, math.radians(30))
    fill = bpy.data.lights.new("SF_FILL", "AREA")
    fill.energy = 280 if not clay else 400
    fill.size = 26
    fo = bpy.data.objects.new("SF_FILL", fill)
    sc.collection.objects.link(fo)
    fo.location = center + Vector((18, -24, 16))
    rim = bpy.data.lights.new("SF_RIM", "SUN")
    rim.energy = 1.8
    ro = bpy.data.objects.new("SF_RIM", rim)
    sc.collection.objects.link(ro)
    ro.rotation_euler = (math.radians(18), 0, math.radians(155))
    return center, extents


def frame_cam(center, extents, view="34", dmul=1.4):
    cam = bpy.data.objects.get("SF_CAM")
    if cam is None:
        data = bpy.data.cameras.new("SF_CAM")
        cam = bpy.data.objects.new("SF_CAM", data)
        bpy.context.scene.collection.objects.link(cam)
    bpy.context.scene.camera = cam
    span = max(extents.x, extents.y, extents.z, 1.0)
    dist = span * dmul * 1.6
    if view == "close":
        cam.location = center + Vector((dist * 0.4, -dist * 0.4, span * 0.22))
    elif view == "front":
        cam.location = center + Vector((0, -dist, span * 0.12))
    else:
        cam.location = center + Vector((dist * 0.75, -dist * 0.75, dist * 0.45))
    cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y").to_euler()
    cam.data.lens = 45
    return cam


def render_to(path, clay=False, view="34", dmul=1.4):
    center, extents = setup_studio(clay=clay)
    frame_cam(center, extents, view=view, dmul=dmul)
    stash = {}
    if clay:
        clay_mat = pbr_mat("SF_CLAY", "", base_rgba=(0.9, 0.9, 0.92, 1), metal=0, rough=0.9)
        for o in bpy.data.objects:
            if o.type != "MESH":
                continue
            stash[o.name] = [s.material for s in o.material_slots]
            set_mat(o, clay_mat)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    if clay:
        for o in bpy.data.objects:
            if o.type != "MESH" or o.name not in stash:
                continue
            o.data.materials.clear()
            for m in stash[o.name]:
                if m:
                    o.data.materials.append(m)
    return path


def export_part(part_id):
    sys.path.insert(0, os.path.join(ROOT, "tools", "blender"))
    from spaceface_export import export_gltf

    evidence = os.path.join(ROOT, "assets", "ships", "parts", "revamp-evidence", part_id)
    os.makedirs(evidence, exist_ok=True)
    out = os.path.join(evidence, "_export_tmp.glb")
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    if meshes:
        bpy.context.view_layer.objects.active = meshes[0]
        for o in meshes:
            o.select_set(True)
    export_gltf(
        out,
        {
            "kind": "place",
            "id": part_id,
            "assetId": part_id,
            "slot": "place",
            "tri_budget": 120000,
            "min_hull_tris": 0,
            "required_maps": ["ao", "roughness"],
        },
    )
    return out


# ── HUB: rectangular commercial arms ────────────────────────────────────────

def build_hub():
    clear_scene_meshes()
    tdir = os.path.join(TEX, "place_station_trade_hub")
    hull = pbr_mat("Material_Hull", tdir, (0.4, 0.38, 0.35, 1), metal=0.55, rough=0.4)
    accent = pbr_mat(
        "Material_Accent",
        tdir,
        (0.95, 0.7, 0.2, 1),
        metal=0.7,
        rough=0.28,
        emi=(1.0, 0.8, 0.3, 1),
        emi_s=0.45,
    )
    mech = pbr_mat("Material_Mechanical", tdir, (0.12, 0.12, 0.13, 1), metal=0.85, rough=0.5)
    glass = pbr_mat(
        "Material_Glass",
        tdir,
        (0.15, 0.28, 0.38, 1),
        metal=0.1,
        rough=0.15,
        emi=(0.4, 0.7, 0.95, 1),
        emi_s=0.55,
    )

    # CORE — faceted hexagonal tower (not pure cylinder)
    for i, (r, d, z, mat) in enumerate(
        [
            (4.2, 3.2, 0.0, hull),
            (4.8, 2.0, 0.2, hull),
            (3.6, 2.8, 4.2, hull),
            (2.6, 2.0, 6.8, hull),
            (3.2, 2.2, -3.8, mech),
            (1.8, 1.5, -5.6, mech),
        ]
    ):
        # hexagonal prism via cylinder 6 verts
        o = cyl(f"STN_core_{i}", (0, 0, z), r, d, mat, segs=8 if i < 4 else 10, bw=0.07)
    # gold bands
    cyl("STN_gold_mid", (0, 0, 1.2), 5.0, 0.22, accent, segs=16, bw=0.02)
    cyl("STN_gold_upper", (0, 0, 5.8), 3.9, 0.18, accent, segs=12, bw=0.02)
    # deck plates (layered rectangles)
    box("STN_deck_main", (0, 0, -1.6), (14.5, 14.5, 0.55), hull, bw=0.06)
    box("STN_deck_lip", (0, 0, -1.25), (15.2, 15.2, 0.18), accent, bw=0.02)
    box("STN_deck_inner", (0, 0, -1.9), (10.0, 10.0, 0.4), mech, bw=0.05)

    # windows on core faces
    for i in range(8):
        a = i * math.pi / 4
        for j, z in enumerate((-0.5, 1.5, 3.5, 5.2)):
            r = 4.25 if z < 3 else 3.55
            x, y = math.cos(a) * r, math.sin(a) * r
            box(f"STN_win_{i}_{j}", (x, y, z), (0.15, 1.0, 0.45), glass, rot=(0, 0, a), bw=0.015)

    # beacon + antennas
    box("STN_beacon_h", (0, 0, 8.6), (1.6, 1.6, 1.1), hull, bw=0.04)
    cyl("STN_beacon_l", (0, 0, 9.3), 0.4, 0.35, accent, segs=10)
    for i, (dx, dy) in enumerate(((1.5, 1.0), (-1.3, 1.2), (0.9, -1.4))):
        cyl(f"STN_ant_{i}", (dx, dy, 8.8), 0.07, 2.0 + i * 0.3, mech, segs=8)

    # ASYMMETRIC RECTANGULAR DOCK ARMS (key form change)
    # +X: long freighter berth
    box("STN_arm_xp_main", (9.5, 0, 0.2), (11.0, 3.4, 2.8), hull, bw=0.08)
    box("STN_arm_xp_joint", (4.0, 0, 0.2), (3.0, 4.2, 3.4), hull, bw=0.08)
    # triangular gussets at joint
    box("STN_arm_xp_gus_u", (5.2, 0, 1.8), (2.2, 0.35, 1.4), mech, rot=(0, math.radians(-25), 0), bw=0.04)
    box("STN_arm_xp_gus_d", (5.2, 0, -1.4), (2.2, 0.35, 1.4), mech, rot=(0, math.radians(25), 0), bw=0.04)
    box("STN_arm_xp_gus_s0", (5.2, 1.6, 0.2), (2.0, 0.3, 1.2), mech, rot=(0, 0, math.radians(15)), bw=0.03)
    box("STN_arm_xp_gus_s1", (5.2, -1.6, 0.2), (2.0, 0.3, 1.2), mech, rot=(0, 0, math.radians(-15)), bw=0.03)
    # hangar mouth integrated
    box("STN_hangar_xp", (15.2, 0, 0.2), (1.2, 2.6, 2.2), mech, bw=0.05)
    box("STN_hangar_xp_in", (15.6, 0, 0.2), (0.6, 2.0, 1.6), glass, bw=0.02)
    box("STN_collar_xp", (16.4, 0, 0.2), (0.8, 2.2, 1.8), accent, bw=0.03)
    # service channels
    for k in range(4):
        box(f"STN_chan_xp_{k}", (7 + k * 2.0, 1.75, 1.5), (1.6, 0.2, 0.25), mech, bw=0.02)
        box(f"STN_chan_xp_b_{k}", (7 + k * 2.0, -1.75, 1.5), (1.6, 0.2, 0.25), mech, bw=0.02)

    # -X: shorter with cargo gantry
    box("STN_arm_xm_main", (-8.5, 0, 0.1), (9.0, 3.0, 2.6), hull, bw=0.08)
    box("STN_arm_xm_joint", (-4.0, 0, 0.1), (2.8, 3.8, 3.2), hull, bw=0.08)
    box("STN_arm_xm_gus", (-5.0, 0, 1.6), (2.0, 0.35, 1.2), mech, rot=(0, math.radians(22), 0), bw=0.04)
    box("STN_hangar_xm", (-13.2, 0, 0.1), (1.1, 2.4, 2.0), mech, bw=0.05)
    box("STN_hangar_xm_in", (-13.6, 0, 0.1), (0.55, 1.8, 1.5), glass, bw=0.02)
    box("STN_collar_xm", (-14.3, 0, 0.1), (0.7, 2.0, 1.6), accent, bw=0.03)
    # cargo gantry tower (asymmetric function)
    box("STN_gantry", (-8.0, 2.8, 2.2), (4.5, 1.4, 3.5), mech, bw=0.06)
    box("STN_gantry_rail", (-8.0, 3.6, 3.8), (4.8, 0.25, 0.25), accent, bw=0.02)
    box("STN_gantry_hook", (-6.5, 3.5, 2.5), (0.4, 0.4, 1.8), mech, bw=0.03)

    # +Y: customs / commercial wing (hex-ish wider)
    box("STN_arm_yp_main", (0, 8.0, 0.0), (3.2, 8.5, 2.5), hull, bw=0.08)
    box("STN_arm_yp_joint", (0, 3.8, 0.0), (4.0, 2.6, 3.0), hull, bw=0.08)
    box("STN_customs", (2.0, 7.5, 1.8), (2.0, 3.0, 2.8), hull, bw=0.06)
    box("STN_customs_sign", (3.05, 7.5, 2.0), (0.12, 2.4, 1.4), accent, bw=0.02)
    box("STN_hangar_yp", (0, 12.4, 0.0), (2.4, 1.0, 1.9), mech, bw=0.05)
    box("STN_collar_yp", (0, 13.2, 0.0), (2.0, 0.65, 1.5), accent, bw=0.03)
    # triangular truss braces +Y
    for k, (dy, z, ry) in enumerate(((5.5, 1.4, -20), (5.5, -1.2, 20), (7.5, 1.2, -15))):
        box(f"STN_truss_yp_{k}", (1.5, dy, z), (0.25, 2.4, 0.25), mech, rot=(0, math.radians(ry), 0), bw=0.03)
        box(f"STN_truss_yp_m_{k}", (-1.5, dy, z), (0.25, 2.4, 0.25), mech, rot=(0, math.radians(-ry), 0), bw=0.03)

    # -Y: utility / shorter
    box("STN_arm_ym_main", (0, -7.2, 0.0), (2.8, 7.0, 2.3), hull, bw=0.08)
    box("STN_arm_ym_joint", (0, -3.6, 0.0), (3.6, 2.4, 2.8), hull, bw=0.08)
    box("STN_hangar_ym", (0, -11.0, 0.0), (2.2, 0.95, 1.7), mech, bw=0.05)
    box("STN_collar_ym", (0, -11.7, 0.0), (1.8, 0.6, 1.4), accent, bw=0.03)
    box("STN_truss_ym_0", (1.3, -5.5, 1.2), (0.22, 2.0, 0.22), mech, bw=0.03)
    box("STN_truss_ym_1", (-1.3, -5.5, 1.2), (0.22, 2.0, 0.22), mech, bw=0.03)

    # cross-deck truss between arms
    for i in range(8):
        a = i * math.pi / 4 + 0.2
        x, y = math.cos(a) * 6.5, math.sin(a) * 6.5
        box(f"STN_ring_truss_{i}", (x, y, -0.8), (1.8, 0.22, 0.3), mech, rot=(0, 0, a), bw=0.02)

    # layered deck plates / chevrons
    for i, x in enumerate((-5, -1.5, 2, 5.5)):
        box(f"STN_chevron_{i}", (x, 6.2, -1.2), (1.4, 0.9, 0.12), accent, bw=0.02)

    # radiators (flat plates)
    box("STN_rad_0", (9.0, 2.0, 1.8), (3.5, 0.12, 1.4), mech, bw=0.02)
    box("STN_rad_1", (-8.0, -1.8, 1.6), (3.0, 0.12, 1.2), mech, bw=0.02)
    for k in range(6):
        box(f"STN_rad_fin_{k}", (8.0 + k * 0.5, 2.0, 1.8), (0.1, 0.18, 1.3), mech, bw=0.01)

    uv_all()
    shade_smooth_all()
    # merge by material for fewer draw objects
    for mn in ("Material_Hull", "Material_Mechanical", "Material_Accent", "Material_Glass"):
        join_by_material("", mn)
    uv_all()
    return "place_station_trade_hub"


# ── GATE: segmented armored ring ────────────────────────────────────────────

def build_gate():
    clear_scene_meshes()
    tdir = os.path.join(TEX, "place_gate_jump_ring")
    hull = pbr_mat("Material_Hull", tdir, (0.32, 0.36, 0.42, 1), metal=0.6, rough=0.35)
    accent = pbr_mat(
        "Material_Accent",
        tdir,
        (0.25, 0.85, 1.0, 1),
        metal=0.3,
        rough=0.22,
        emi=(0.35, 0.9, 1.0, 1),
        emi_s=0.7,
    )
    mech = pbr_mat("Material_Mechanical", tdir, (0.1, 0.1, 0.12, 1), metal=0.9, rough=0.48)

    R = 8.8
    Z0 = 10.0
    N = 20  # segments
    # structural spine (thin torus kept as continuous load path under armor)
    bpy.ops.mesh.primitive_torus_add(
        major_radius=R, minor_radius=0.55, location=(0, 0, Z0), major_segments=48, minor_segments=12
    )
    spine = bpy.context.active_object
    spine.name = "GATE_spine"
    spine.rotation_euler = (math.radians(90), 0, 0)
    bpy.ops.object.transform_apply(rotation=True)
    spine.location = Vector((0, 0, Z0))
    set_mat(spine, mech)
    bevel(spine, 0.03)

    # SEGMENTED ARMOR — boxes flush on ring path, overlapping arc
    for i in range(N):
        a = i * (2 * math.pi / N)
        y = math.cos(a) * R
        z = Z0 + math.sin(a) * R
        # ring lies in YZ; segment local: X=out-of-plane thickness, Y=tangential arc, Z=radial depth
        bpy.ops.mesh.primitive_cube_add(size=1, location=(0, y, z))
        o = bpy.context.active_object
        o.name = f"GATE_seg_{i}"
        # size: thickness X, arc length ~ 2*pi*R/N * 1.15 overlap, tube depth
        arc = (2 * math.pi * R / N) * 1.25
        o.scale = (1.8, arc * 0.5, 1.65)
        # orient: rotate around X so local Y follows tangent in YZ plane
        # tangent = (-sin a, cos a) in YZ
        o.rotation_euler = (a, 0, 0)
        bpy.ops.object.transform_apply(rotation=True, scale=True)
        o.location = Vector((0, y, z))
        set_mat(o, hull if i % 2 == 0 else mech)
        bevel(o, 0.05)
        wn(o)
        # emitter housing every 4th — attached flush on inner face
        if i % 4 == 0:
            yi = math.cos(a) * (R - 1.1)
            zi = Z0 + math.sin(a) * (R - 1.1)
            box(f"GATE_emit_{i}", (0.7, yi, zi), (0.9, 0.7, 0.7), accent, bw=0.03)

    # outer rail (second segmented band, slightly larger R)
    for i in range(N // 2):
        a = i * (2 * math.pi / (N // 2)) + 0.1
        y = math.cos(a) * (R + 1.15)
        z = Z0 + math.sin(a) * (R + 1.15)
        bpy.ops.mesh.primitive_cube_add(size=1, location=(0, y, z))
        o = bpy.context.active_object
        o.name = f"GATE_outer_{i}"
        o.scale = (1.1, 1.4, 0.7)
        o.rotation_euler = (a, 0, 0)
        bpy.ops.object.transform_apply(rotation=True, scale=True)
        o.location = Vector((0, y, z))
        set_mat(o, mech)
        bevel(o, 0.04)

    # inner cyan accent ring (continuous thin torus)
    bpy.ops.mesh.primitive_torus_add(
        major_radius=R - 1.35, minor_radius=0.28, location=(0, 0, Z0), major_segments=40, minor_segments=10
    )
    em = bpy.context.active_object
    em.name = "GATE_emitter_ring"
    em.rotation_euler = (math.radians(90), 0, 0)
    bpy.ops.object.transform_apply(rotation=True)
    em.location = Vector((0, 0, Z0))
    set_mat(em, accent)
    bevel(em, 0.02)

    # BASE + triangular lattice A-frame (continuous beams)
    box("GATE_base", (0, 0, -1.7), (7.0, 18.5, 1.2), hull, bw=0.1)
    box("GATE_base_lip", (0, 0, -1.0), (7.4, 19.0, 0.2), accent, bw=0.02)
    box("GATE_core", (0, 0, -0.2), (4.5, 7.0, 1.8), mech, bw=0.08)
    box("GATE_control", (2.7, 0, 1.5), (2.0, 3.0, 2.6), hull, bw=0.06)
    box("GATE_control_win", (3.75, 0, 1.8), (0.12, 2.0, 1.3), accent, bw=0.02)

    # Left lattice tower: continuous vertical + diagonals
    box("GATE_foot_L", (0, 7.5, -1.0), (3.2, 3.8, 1.3), mech, bw=0.09)
    box("GATE_leg_L", (0, 6.6, 3.0), (2.2, 2.4, 9.0), hull, bw=0.09)
    # diagonals as long boxes connecting foot to ring lower attachment
    box("GATE_diag_L0", (0, 5.5, 3.5), (0.45, 4.5, 0.45), mech, rot=(math.radians(35), 0, 0), bw=0.04)
    box("GATE_diag_L1", (0.6, 5.5, 4.5), (0.4, 4.2, 0.4), mech, rot=(math.radians(-30), 0, 0), bw=0.04)
    box("GATE_diag_L2", (-0.6, 5.8, 5.5), (0.4, 3.8, 0.4), mech, rot=(math.radians(28), 0, 0), bw=0.04)
    # horizontal rungs
    for k, z in enumerate((1.0, 2.8, 4.6, 6.4, 8.0)):
        box(f"GATE_rung_L_{k}", (0, 6.4, z), (1.8, 2.6, 0.28), mech, bw=0.03)
    # ring attachment boss — overlaps lower ring segments
    box("GATE_boss_L", (0, 5.4, 5.8), (2.6, 2.8, 3.0), hull, bw=0.08)
    cyl("GATE_join_L", (0, 5.6, 5.0), 1.6, 2.4, hull, segs=14, bw=0.05)

    # Right mirror
    box("GATE_foot_R", (0, -7.5, -1.0), (3.2, 3.8, 1.3), mech, bw=0.09)
    box("GATE_leg_R", (0, -6.6, 3.0), (2.2, 2.4, 9.0), hull, bw=0.09)
    box("GATE_diag_R0", (0, -5.5, 3.5), (0.45, 4.5, 0.45), mech, rot=(math.radians(-35), 0, 0), bw=0.04)
    box("GATE_diag_R1", (-0.6, -5.5, 4.5), (0.4, 4.2, 0.4), mech, rot=(math.radians(30), 0, 0), bw=0.04)
    box("GATE_diag_R2", (0.6, -5.8, 5.5), (0.4, 3.8, 0.4), mech, rot=(math.radians(-28), 0, 0), bw=0.04)
    for k, z in enumerate((1.0, 2.8, 4.6, 6.4, 8.0)):
        box(f"GATE_rung_R_{k}", (0, -6.4, z), (1.8, 2.6, 0.28), mech, bw=0.03)
    box("GATE_boss_R", (0, -5.4, 5.8), (2.6, 2.8, 3.0), hull, bw=0.08)
    cyl("GATE_join_R", (0, -5.6, 5.0), 1.6, 2.4, hull, segs=14, bw=0.05)

    # cross brace
    box("GATE_brace", (0, 0, 2.8), (1.6, 11.5, 1.1), mech, bw=0.06)
    cyl("GATE_brace_hub", (0, 0, 2.8), 1.25, 1.8, hull, segs=14, bw=0.05)
    box("GATE_strut_L", (0, 3.5, 1.8), (1.0, 5.5, 0.9), mech, rot=(0, 0, math.radians(-18)), bw=0.05)
    box("GATE_strut_R", (0, -3.5, 1.8), (1.0, 5.5, 0.9), mech, rot=(0, 0, math.radians(18)), bw=0.05)

    # walkway shelf
    box("GATE_walk", (1.8, 0, 4.0), (0.5, 9.0, 0.2), mech, bw=0.03)
    for i, y in enumerate((-8, -4, 0, 4, 8)):
        cyl(f"GATE_nav_{i}", (2.8, y, -0.9), 0.28, 0.4, accent, segs=10)

    uv_all()
    shade_smooth_all()
    for mn in ("Material_Hull", "Material_Mechanical", "Material_Accent"):
        join_by_material("", mn)
    uv_all()
    return "place_gate_jump_ring"


# ── ROCKS: continuous geology + surface ore ─────────────────────────────────

def build_rock(variant="a"):
    clear_scene_meshes()
    pid = f"place_asteroid_rock_{variant}"
    tdir = os.path.join(TEX, pid)
    basalt = pbr_mat("Material_Hull", tdir, (0.18, 0.16, 0.15, 1), metal=0.12, rough=0.88)
    iron = pbr_mat("Material_Mechanical", tdir, (0.22, 0.18, 0.14, 1), metal=0.35, rough=0.75)
    ore = pbr_mat(
        "Material_Accent",
        tdir,
        (0.7, 0.5, 0.18, 1),
        metal=0.55,
        rough=0.4,
        emi=(0.4, 0.28, 0.08, 1),
        emi_s=0.12,
    )

    if variant == "a":
        body = sphere("ROCK_body", (0, 0, 0), 3.5, basalt, segs=40, rings=28, scale=(1.05, 0.9, 1.55))
        displace(body, 0.65, 1.25, 71)
        set_mat(body, basalt)
        # broad fracture slabs intersecting surface
        box("ROCK_frac0", (0.2, 0.5, 0.8), (5.2, 0.55, 3.5), iron, rot=(math.radians(12), 0, math.radians(8)), bw=0.08)
        box("ROCK_frac1", (-0.3, -0.4, -0.9), (4.5, 0.5, 3.0), iron, rot=(math.radians(-8), math.radians(5), math.radians(-15)), bw=0.08)
        box("ROCK_strata", (0, 0, 0.2), (5.5, 4.2, 0.55), iron, bw=0.07)
        # cavity
        box("ROCK_cavity", (1.5, 0.8, 0.5), (1.8, 1.5, 1.2), iron, bw=0.06)
        # continuous ore veins — long ribbons on surface (outside body)
        box("ROCK_ore_vein_a", (0.1, 2.4, 0.3), (4.2, 0.45, 0.9), ore, rot=(0, 0, math.radians(18)), bw=0.04)
        box("ROCK_ore_vein_b", (0.2, -2.2, -0.4), (3.6, 0.4, 0.75), ore, rot=(math.radians(8), 0, math.radians(-22)), bw=0.04)
        box("ROCK_ore_vein_c", (2.3, 0.2, 1.2), (0.5, 3.5, 0.8), ore, rot=(math.radians(15), 0, math.radians(5)), bw=0.04)
        box("ROCK_ore_band", (-1.5, 0.3, 1.8), (2.8, 0.4, 0.55), ore, rot=(0, math.radians(12), math.radians(10)), bw=0.04)
    elif variant == "b":
        body = sphere("ROCK_body", (0, 0, 0), 3.7, basalt, segs=40, rings=24, scale=(1.55, 1.35, 0.48))
        displace(body, 0.5, 1.4, 81)
        set_mat(body, basalt)
        box("ROCK_strata0", (0, 0, 0.35), (6.5, 5.5, 0.45), iron, bw=0.06)
        box("ROCK_strata1", (0.1, 0, -0.3), (5.8, 4.8, 0.4), iron, bw=0.05)
        box("ROCK_strata2", (-0.1, 0.2, 0.05), (6.0, 5.0, 0.25), basalt, bw=0.04)
        box("ROCK_overhang", (1.8, 1.0, 0.6), (2.5, 2.0, 0.7), iron, bw=0.06)
        box("ROCK_ore_vein_a", (0, 0.5, 0.55), (5.5, 0.42, 0.5), ore, rot=(0, 0, math.radians(6)), bw=0.03)
        box("ROCK_ore_vein_b", (0.3, -1.9, 0.15), (4.0, 0.38, 0.45), ore, rot=(0, 0, math.radians(-14)), bw=0.03)
        box("ROCK_ore_vein_c", (-2.2, 0.8, 0.4), (0.4, 3.0, 0.5), ore, bw=0.03)
    else:
        body = sphere("ROCK_body", (0, 0, 0), 3.2, basalt, segs=36, rings=24, scale=(1.25, 0.78, 1.15))
        displace(body, 0.58, 1.7, 91)
        set_mat(body, basalt)
        box("ROCK_wedge", (1.7, 0.1, 0.2), (3.0, 2.4, 3.0), iron, rot=(0, 0, math.radians(28)), bw=0.1)
        box("ROCK_cleave", (0.15, 0, 0.05), (0.4, 3.8, 3.4), iron, rot=(0, math.radians(14), 0), bw=0.05)
        box("ROCK_plane", (-0.8, -0.5, 0.5), (2.0, 0.4, 2.5), iron, rot=(math.radians(20), 0, math.radians(15)), bw=0.05)
        box("ROCK_ore_vein_a", (-0.15, 0.9, 0.4), (0.45, 3.4, 1.0), ore, rot=(math.radians(12), 0, math.radians(28)), bw=0.03)
        box("ROCK_ore_vein_b", (2.1, -0.3, 0.9), (1.1, 0.9, 0.9), ore, bw=0.04)
        box("ROCK_ore_vein_c", (0.3, -1.3, -0.2), (2.8, 0.4, 0.65), ore, rot=(0, math.radians(-8), math.radians(18)), bw=0.03)

    uv_all()
    shade_smooth_all()
    for mn in ("Material_Hull", "Material_Mechanical", "Material_Accent"):
        join_by_material("", mn)
    uv_all()
    return pid


def render_set(part_id):
    evidence = os.path.join(ROOT, "assets", "ships", "parts", "revamp-evidence", part_id, "renders")
    os.makedirs(evidence, exist_ok=True)
    shots = []
    for clay, view, tag, dmul in (
        (True, "34", "clay_34_full", 1.4),
        (False, "34", "lit_34_full", 1.4),
        (False, "close", "lit_close_detail", 0.7),
    ):
        path = os.path.join(evidence, f"{DATE}_{part_id}_polish3_{tag}.png")
        render_to(path, clay=clay, view=view, dmul=dmul)
        shots.append(path)
    import shutil

    final = os.path.join(evidence, f"{DATE}_{part_id}_final_lit_34_full.png")
    shutil.copy2(os.path.join(evidence, f"{DATE}_{part_id}_polish3_lit_34_full.png"), final)
    shots.append(final)
    return shots


def main():
    args = parse_args()
    asset = args.asset
    if asset == "place_station_trade_hub":
        part_id = build_hub()
    elif asset == "place_gate_jump_ring":
        part_id = build_gate()
    elif asset.startswith("place_asteroid_rock"):
        var = args.variant if args.variant in "abc" else asset[-1]
        part_id = build_rock(var)
    else:
        raise SystemExit(f"unknown {asset}")

    blend = os.path.join(ROOT, "assets", "ships", "parts", "blender", f"{part_id}_authored.blend")
    save_blend(blend)
    shots = render_set(part_id)
    try:
        out = export_part(part_id)
        export_ok = True
        export_err = None
    except Exception as ex:
        out = None
        export_ok = False
        export_err = str(ex)

    summary = {
        "part_id": part_id,
        "pass": "polish3",
        "date": DATE,
        "tris": tri_total(),
        "meshes": sum(1 for o in bpy.data.objects if o.type == "MESH"),
        "extents": [round(v, 2) for v in bounds()[1]],
        "renders": shots,
        "export_ok": export_ok,
        "export": out,
        "export_err": export_err,
    }
    evidence = os.path.join(ROOT, "assets", "ships", "parts", "revamp-evidence", part_id)
    with open(os.path.join(evidence, "polish3_summary.json"), "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
