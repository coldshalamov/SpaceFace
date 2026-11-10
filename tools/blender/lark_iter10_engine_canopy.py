#!/usr/bin/env python3
"""Lark iter10: replace box engines/canopy with cylindrical nacelles + bubble canopy."""
from __future__ import annotations

import importlib.util
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
SCRATCH = Path(r"C:\Users\93rob\AppData\Local\Temp\grok-goal-5d58d165aa45\implementer")
BLEND = ROOT / "assets/ships/m4_helios_civilian/blender/helios_lark_production.blend"


def load_family():
    spec = importlib.util.spec_from_file_location(
        "family", ROOT / "tools/blender/build_m4_helios_civilian_family.py"
    )
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(mod)
    return mod


def activate(o):
    if bpy.context.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="DESELECT")
    o.hide_set(False)
    o.hide_viewport = False
    o.select_set(True)
    bpy.context.view_layer.objects.active = o


def link_auth(o):
    coll = bpy.data.collections.get("AUTHORING")
    if coll is None:
        coll = bpy.data.collections.new("AUTHORING")
        bpy.context.scene.collection.children.link(coll)
    for c in list(o.users_collection):
        try:
            c.objects.unlink(o)
        except Exception:
            pass
    coll.objects.link(o)


def delete_named(names):
    for n in names:
        o = bpy.data.objects.get(n)
        if not o:
            continue
        mesh = o.data if o.type == "MESH" else None
        bpy.data.objects.remove(o, do_unlink=True)
        if mesh and mesh.users == 0:
            try:
                bpy.data.meshes.remove(mesh)
            except Exception:
                pass


def bevel(o, w=0.03, seg=3, ang=30):
    activate(o)
    m = o.modifiers.new("B", "BEVEL")
    m.limit_method = "ANGLE"
    m.angle_limit = math.radians(ang)
    m.width = w
    m.segments = seg
    try:
        bpy.ops.object.modifier_apply(modifier=m.name)
    except Exception:
        pass


def unwrap(o):
    activate(o)
    if not o.data.uv_layers:
        o.data.uv_layers.new(name="UVMap")
    try:
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        try:
            bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.02)
        except Exception:
            try:
                bpy.ops.uv.unwrap(method="ANGLE_BASED", margin=0.02)
            except Exception as e:
                print("UV_WARN", o.name, e)
        try:
            bpy.ops.uv.pack_islands(margin=0.02)
        except Exception:
            pass
        bpy.ops.object.mode_set(mode="OBJECT")
    except Exception as e:
        print("UV_SKIP", o.name, e)
        try:
            bpy.ops.object.mode_set(mode="OBJECT")
        except Exception:
            pass


def world_bounds(obj):
    mins = Vector((1e9, 1e9, 1e9))
    maxs = Vector((-1e9, -1e9, -1e9))
    for corner in obj.bound_box:
        w = obj.matrix_world @ Vector(corner)
        mins.x = min(mins.x, w.x)
        mins.y = min(mins.y, w.y)
        mins.z = min(mins.z, w.z)
        maxs.x = max(maxs.x, w.x)
        maxs.y = max(maxs.y, w.y)
        maxs.z = max(maxs.z, w.z)
    return mins, maxs


def main():
    bpy.ops.wm.open_mainfile(filepath=str(BLEND))
    F = load_family()

    delete_named(
        [
            "Engine_Housing_P",
            "Engine_Housing_S",
            "Engine_Core_P",
            "Engine_Core_S",
            "Engine_Fan_P",
            "Engine_Fan_S",
            "Canopy_Glass",
            "Engine_Fairing_P",
            "Engine_Fairing_S",
        ]
    )

    fus = bpy.data.objects.get("Hull_Fuselage")
    if not fus:
        print("NO_FUSELAGE")
        return 2
    mins, maxs = world_bounds(fus)
    aft_x = mins.x + 1.4
    rot = (0.0, math.radians(90.0), 0.0)

    for side, ysign in (("P", -1.0), ("S", 1.0)):
        y = ysign * 0.85
        bpy.ops.mesh.primitive_cylinder_add(
            vertices=36, radius=0.52, depth=2.6, location=(aft_x - 0.3, y, 0.05), rotation=rot
        )
        house = bpy.context.view_layer.objects.active
        house.name = f"Engine_Housing_{side}"
        link_auth(house)
        bevel(house, 0.04, 3, 28)

        bpy.ops.mesh.primitive_cone_add(
            vertices=28,
            radius1=0.56,
            radius2=0.3,
            depth=1.15,
            location=(aft_x + 1.15, y, 0.05),
            rotation=rot,
        )
        fair = bpy.context.view_layer.objects.active
        fair.name = f"Engine_Fairing_{side}"
        link_auth(fair)
        bevel(fair, 0.025, 2, 30)
        activate(house)
        mod = house.modifiers.new("U", "BOOLEAN")
        mod.operation = "UNION"
        mod.solver = "EXACT"
        mod.object = fair
        try:
            bpy.ops.object.modifier_apply(modifier=mod.name)
            mesh = fair.data
            bpy.data.objects.remove(fair, do_unlink=True)
            if mesh.users == 0:
                bpy.data.meshes.remove(mesh)
        except Exception as e:
            print("FAIR_UNION", side, e)

        bpy.ops.mesh.primitive_cylinder_add(
            vertices=20, radius=0.26, depth=0.48, location=(aft_x - 1.55, y, 0.05), rotation=rot
        )
        core = bpy.context.view_layer.objects.active
        core.name = f"Engine_Core_{side}"
        link_auth(core)

        bpy.ops.mesh.primitive_cylinder_add(
            vertices=22, radius=0.36, depth=0.14, location=(aft_x - 1.2, y, 0.05), rotation=rot
        )
        fan = bpy.context.view_layer.objects.active
        fan.name = f"Engine_Fan_{side}"
        link_auth(fan)
        unwrap(house)
        unwrap(core)
        unwrap(fan)

    # Bubble canopy
    mid_x = (mins.x + maxs.x) * 0.55
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=32, ring_count=18, radius=0.75, location=(mid_x, 0.0, maxs.z + 0.05)
    )
    can = bpy.context.view_layer.objects.active
    can.name = "Canopy_Glass"
    can.scale = (1.4, 0.82, 0.48)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    link_auth(can)
    bpy.ops.mesh.primitive_cube_add(size=3.2, location=(mid_x, 0.0, maxs.z - 0.85))
    cut = bpy.context.view_layer.objects.active
    activate(can)
    mod = can.modifiers.new("CUT", "BOOLEAN")
    mod.operation = "DIFFERENCE"
    mod.solver = "EXACT"
    mod.object = cut
    try:
        bpy.ops.object.modifier_apply(modifier=mod.name)
    except Exception as e:
        print("CANOPY_CUT", e)
    mesh = cut.data
    bpy.data.objects.remove(cut, do_unlink=True)
    if mesh.users == 0:
        bpy.data.meshes.remove(mesh)
    bevel(can, 0.05, 3, 48)
    unwrap(can)

    mats = {
        n: bpy.data.materials.get(n)
        for n in [
            "Material_Hull",
            "Material_Mechanical",
            "Material_Cyan",
            "Material_Warm",
            "Material_Glass",
        ]
    }
    for o in bpy.data.objects:
        if o.type != "MESH" or o.name.startswith("LOD"):
            continue
        n = o.name.lower()
        if "glass" in n or "canopy" in n:
            m = mats.get("Material_Glass")
        elif "core" in n or "nose" in n:
            m = mats.get("Material_Cyan")
        elif any(t in n for t in ("engine", "fan", "gun")):
            m = mats.get("Material_Mechanical")
        else:
            m = mats.get("Material_Hull")
        if m:
            o.data.materials.clear()
            o.data.materials.append(m)

    # Rebuild LODs + export
    authoring = []
    for o in list(bpy.data.objects):
        if o.type != "MESH" or o.name.startswith("LOD") or o.name == "COLLISION_HULL":
            continue
        colls = [c.name for c in o.users_collection]
        if any(c.startswith("PRODUCTION") or c == "EXPORT" for c in colls) and "AUTHORING" not in colls:
            continue
        authoring.append(o)

    for o in list(bpy.data.objects):
        if (
            o.name.startswith("LOD")
            or o.name.startswith("SOCKET_")
            or o.name == "COLLISION_HULL"
            or "HELIOS_LARK_ROOT" in o.name
            or o.name.startswith("SF_M4_HELIOS")
        ):
            mesh = o.data if o.type == "MESH" else None
            bpy.data.objects.remove(o, do_unlink=True)
            if mesh and getattr(mesh, "users", 1) == 0:
                try:
                    bpy.data.meshes.remove(mesh)
                except Exception:
                    pass
    for cname in list(bpy.data.collections.keys()):
        if cname.startswith("PRODUCTION_LOD") or cname == "EXPORT":
            coll = bpy.data.collections[cname]
            for o in list(coll.objects):
                mesh = o.data if o.type == "MESH" else None
                bpy.data.objects.remove(o, do_unlink=True)
                if mesh and getattr(mesh, "users", 1) == 0:
                    try:
                        bpy.data.meshes.remove(mesh)
                    except Exception:
                        pass
            bpy.data.collections.remove(coll)

    mats2 = {n: bpy.data.materials.get(n) for n in F.CANONICAL_MATERIAL_NAMES if bpy.data.materials.get(n)}
    all_lod = []
    lod_stats = []
    for lod_name, ratio in (("lod0", 1.0), ("lod1", 0.5), ("lod2", 0.25)):
        src = [o for o in authoring if o.type == "MESH"]
        if lod_name == "lod2":
            src = [
                o
                for o in src
                if any(t in o.name.lower() for t in ("fuselage", "hull", "engine", "canopy", "nose", "gun"))
                or F.classify_keep_separate(o)
            ]
        _c, meshes, stats = F.build_lod_collection(src, lod_name, ratio, False, mats2)
        all_lod.extend(meshes)
        lod_stats.append(stats)

    spec_ship = F.SHIP_SPECS["lark"]
    export_coll = F.new_collection("EXPORT")
    root = F.create_root_and_sockets(export_coll, spec_ship)
    for o in all_lod:
        F.set_parent_keep_world(o, root)
        try:
            export_coll.objects.link(o)
        except Exception:
            pass
    collision = F.create_collision_hull(export_coll, root, all_lod)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))

    source_glb = ROOT / "assets/ships/m4_helios_civilian/source/wholeships/helios_lark.glb"
    export_objects = [root] + all_lod
    for o in bpy.data.objects:
        if o.name.startswith("SOCKET_"):
            export_objects.append(o)
    if collision:
        export_objects.append(collision)
    F.export_glb(source_glb, export_objects)
    F.stamp_material_basecolor_factors(source_glb)
    report = F.stamp_glb_metadata(source_glb, spec_ship, lod_stats)
    F.stamp_material_basecolor_factors(source_glb)
    sha = F.sha256_file(source_glb)
    rc = ROOT / "assets/ships/m4_helios_civilian/release_candidates/wholeships/helios_lark.glb"
    rc.write_bytes(source_glb.read_bytes())

    # Evidence renders
    for o in bpy.data.objects:
        if o.type == "MESH":
            o.hide_render = not o.name.startswith("LOD0")
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 900
    cam = scene.camera
    mins2, maxs2 = Vector((1e9, 1e9, 1e9)), Vector((-1e9, -1e9, -1e9))
    for o in bpy.data.objects:
        if not o.name.startswith("LOD0") or o.type != "MESH":
            continue
        for corner in o.bound_box:
            w = o.matrix_world @ Vector(corner)
            mins2.x = min(mins2.x, w.x)
            mins2.y = min(mins2.y, w.y)
            mins2.z = min(mins2.z, w.z)
            maxs2.x = max(maxs2.x, w.x)
            maxs2.y = max(maxs2.y, w.y)
            maxs2.z = max(maxs2.z, w.z)
    center = (mins2 + maxs2) * 0.5
    size = (maxs2 - mins2).length
    dist = max(size * 1.3, 12)
    out = SCRATCH / "lark_evidence" / "iter10"
    out.mkdir(parents=True, exist_ok=True)
    renders = []
    for name, offset in (
        ("forward_34", Vector((dist * 0.75, -dist * 0.85, dist * 0.35))),
        ("grazing", Vector((dist * 0.12, -dist * 0.22, dist * 0.03))),
        ("side", Vector((0, -dist * 1.1, 0.05 * size))),
    ):
        cam.location = center + offset
        cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y").to_euler()
        path = out / f"{name}.png"
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        renders.append(str(path))
    for lod in ("LOD0", "LOD1", "LOD2"):
        for o in bpy.data.objects:
            if o.type != "MESH":
                continue
            o.hide_render = not o.name.startswith(lod)
        cam.location = center + Vector((dist * 0.75, -dist * 0.85, dist * 0.35))
        cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y").to_euler()
        path = out / f"lod_{lod.lower()}.png"
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        renders.append(str(path))

    print(
        "ITER10_DONE",
        sha,
        report.get("totalTriangles"),
        {s["lod"]: s["triangles"] for s in lod_stats},
        len(authoring),
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        import traceback

        traceback.print_exc()
        print("ITER10_FAILED", exc)
        raise SystemExit(2)
