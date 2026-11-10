"""GRAPHICS_3D unit 3 — 47-A family candidate GLBs (unwired).

Author manufactured shells that match live envelopes and sockets.
Do not hook scenarioProps47a.js. No glow-stick cores, no wire tori, no floor disc.
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

PI2 = math.pi / 2
OUT_DIR_DEFAULT = Path("assets/ships/scenario_47a/evidence/graphics_3d/unit3/candidates")
REVISION = "candidate_v4"


def parse_args(argv):
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", default="all", choices=["all", "spindle", "pod", "beacon", "wreck"])
    parser.add_argument("--output-dir", type=Path, default=OUT_DIR_DEFAULT)
    return parser.parse_args(argv)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        for item in list(block):
            block.remove(item)


def principled(name, color, roughness, metal, emission=None):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metal
    if emission and "Emission Color" in bsdf.inputs:
        bsdf.inputs["Emission Color"].default_value = (0.0, 0.0, 0.0, 1.0)
        bsdf.inputs["Emission Strength"].default_value = 0.0
    links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])
    return mat


def apply_object(obj):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    obj.select_set(False)


def add_cyl_x(name, radius, length, location, material, vertices=20):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices, radius=radius, depth=length, location=location, rotation=(0.0, PI2, 0.0),
    )
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.clear()
    obj.data.materials.append(material)
    apply_object(obj)
    return obj


def add_sphere(name, radius, location, material, segments=16):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=max(8, segments // 2), radius=radius, location=location)
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


def bevel(obj, width=0.08, segments=2):
    modifier = obj.modifiers.new("SF_Bevel", "BEVEL")
    modifier.width = width
    modifier.segments = segments
    modifier.limit_method = "ANGLE"
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    obj.select_set(False)


def boolean_union(target, other):
    for solver in ("FLOAT", "EXACT"):
        modifier = target.modifiers.new("SF_Union", "BOOLEAN")
        modifier.operation = "UNION"
        modifier.solver = solver
        modifier.object = other
        bpy.context.view_layer.objects.active = target
        target.select_set(True)
        try:
            bpy.ops.object.modifier_apply(modifier=modifier.name)
            target.select_set(False)
            bpy.data.objects.remove(other, do_unlink=True)
            return True
        except Exception:
            if modifier.name in target.modifiers:
                target.modifiers.remove(modifier)
            target.select_set(False)
    bpy.data.objects.remove(other, do_unlink=True)
    return False


def boolean_difference(target, cutter, solver="FLOAT"):
    tried = [solver] if solver == "EXACT" else [solver, "EXACT"]
    last_cutter = cutter
    for index, use_solver in enumerate(tried):
        modifier = target.modifiers.new("SF_Cut", "BOOLEAN")
        modifier.operation = "DIFFERENCE"
        modifier.solver = use_solver
        modifier.object = last_cutter
        bpy.context.view_layer.objects.active = target
        target.select_set(True)
        try:
            bpy.ops.object.modifier_apply(modifier=modifier.name)
            target.select_set(False)
            bpy.data.objects.remove(last_cutter, do_unlink=True)
            return True
        except Exception:
            if modifier.name in target.modifiers:
                target.modifiers.remove(modifier)
            target.select_set(False)
            if index < len(tried) - 1:
                continue
    bpy.data.objects.remove(last_cutter, do_unlink=True)
    return False


def join_into(target, extras):
    extras = [extra for extra in extras if extra is not None]
    if not extras:
        return target
    bpy.ops.object.select_all(action="DESELECT")
    target.select_set(True)
    for extra in extras:
        extra.select_set(True)
    bpy.context.view_layer.objects.active = target
    bpy.ops.object.join()
    target.select_set(False)


def parent_keep_world(obj, root):
    world = obj.matrix_world.copy()
    obj.parent = root
    obj.matrix_world = world


def make_root(name):
    empty = bpy.data.objects.new(name, None)
    empty.empty_display_type = "PLAIN_AXES"
    empty.empty_display_size = 1.0
    bpy.context.scene.collection.objects.link(empty)
    return empty


def add_socket(root, name, location, role):
    socket = bpy.data.objects.new(name, None)
    socket.empty_display_type = "CUBE"
    socket.empty_display_size = 0.4
    socket.location = location
    socket["role"] = role
    socket["spacefaceSocket"] = True
    bpy.context.scene.collection.objects.link(socket)
    parent_keep_world(socket, root)
    return socket


def add_cyl_z(name, radius, length, location, material, vertices=20):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices, radius=radius, depth=length, location=location,
    )
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.clear()
    obj.data.materials.append(material)
    apply_object(obj)
    return obj


def shade_smooth(obj):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    try:
        bpy.ops.object.shade_smooth()
    except Exception:
        pass
    obj.select_set(False)


def collar_z(name, z, outer, inner, width, material, bolts=6, bolt_mat=None, bolt=0.28, location=None):
    loc = location or (0.0, 0.0, z)
    ring = add_cyl_z(name, outer, width, loc, material, vertices=28)
    cutter = add_cyl_z(f"{name}_bore", inner, width + 0.4, loc, material, vertices=24)
    boolean_difference(ring, cutter, solver="FLOAT")
    bits = []
    bolt_mat = bolt_mat or material
    for i in range(bolts):
        angle = (math.pi * 2.0 * i) / bolts
        x = loc[0] + math.cos(angle) * ((outer + inner) * 0.5)
        y = loc[1] + math.sin(angle) * ((outer + inner) * 0.5)
        boss = add_box(f"{name}_Bolt_{i}", (bolt, bolt, width * 0.7), (x, y, loc[2]), bolt_mat)
        bits.append(boss)
    if bits:
        join_into(ring, bits)
    return ring


def collar_x(name, x, outer, inner, width, material, bolts=6, bolt_mat=None, bolt=0.28):
    ring = add_cyl_x(name, outer, width, (x, 0.0, 0.0), material, vertices=18)
    cutter = add_cyl_x(f"{name}_bore", inner, width + 0.2, (x, 0.0, 0.0), material, vertices=16)
    boolean_difference(ring, cutter, solver="FLOAT")
    bits = []
    bolt_mat = bolt_mat or material
    for i in range(bolts):
        angle = (math.pi * 2.0 * i) / bolts
        y = math.cos(angle) * ((outer + inner) * 0.5)
        z = math.sin(angle) * ((outer + inner) * 0.5)
        boss = add_box(f"{name}_Bolt_{i}", (width * 0.7, bolt, bolt), (x, y, z), bolt_mat)
        bits.append(boss)
    if bits:
        join_into(ring, bits)
    gap = add_box(f"{name}_Gap", (width + 0.5, outer * 0.7, outer * 0.9), (x, 0.0, outer * 0.55), material)
    boolean_difference(ring, gap, solver="FLOAT")
    return ring


def triangulate(obj):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    modifier = obj.modifiers.new("SF_Tri", "TRIANGULATE")
    modifier.keep_custom_normals = True
    try:
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    except Exception:
        if modifier.name in obj.modifiers:
            obj.modifiers.remove(modifier)
    obj.select_set(False)


def stamp_contract(root, asset_id, part_id, live_id, sockets):
    extras = {
        "contractVersion": 1,
        "assetId": asset_id,
        "partId": part_id,
        "liveId": live_id,
        "slot": "scenario_prop_candidate",
        "forward": "+X",
        "up": "+Y(runtime) +Z(blender-source)",
        "unit": "metre",
        "wiringStatus": "candidate_unwired",
        "campaign": "GRAPHICS_3D unit 3",
        "revision": REVISION,
        "sockets": sockets,
        "normalConvention": "OpenGL",
    }
    payload = json.dumps(extras, separators=(",", ":"))
    root["spacefaceAssetJson"] = payload
    root["assetId"] = asset_id
    root["partId"] = part_id
    bpy.context.scene["spacefaceAssetJson"] = payload
    bpy.context.scene["assetId"] = asset_id
    bpy.context.scene["partId"] = part_id
    return extras


def rename_mesh_data():
    for obj in bpy.data.objects:
        if obj.type == "MESH" and obj.data:
            obj.data.name = obj.name


def export_glb(path: Path, root):
    rename_mesh_data()
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


def mesh_report():
    meshes = [obj for obj in bpy.data.objects if obj.type == "MESH"]
    tris = 0
    for obj in meshes:
        obj.data.calc_loop_triangles()
        tris += len(obj.data.loop_triangles)
    return {"triangles": tris, "objects": [obj.name for obj in meshes]}


def build_spindle():
    R = 10.0
    root = make_root("Evidence_Spindle_47A")
    hull_mat = principled("Spindle_Sealed_Hull", (0.34, 0.38, 0.44), 0.56, 0.42)
    clamp_mat = principled("Spindle_Black_Clamp", (0.07, 0.08, 0.10), 0.52, 0.78)
    brass_mat = principled("Spindle_Ledger_Brass", (0.71, 0.54, 0.27), 0.40, 0.62)
    well_mat = principled("Spindle_Well", (0.04, 0.045, 0.05), 0.62, 0.18)

    hull = add_cyl_x("Spindle_Shell", R * 0.42, R * 2.15, (0, 0, 0), hull_mat, vertices=32)
    cap_a = add_sphere("Spindle_CapA", R * 0.42, (R * 1.07, 0, 0), hull_mat, segments=24)
    cap_b = add_sphere("Spindle_CapB", R * 0.42, (-R * 1.07, 0, 0), hull_mat, segments=24)
    boolean_union(hull, cap_a)
    boolean_union(hull, cap_b)
    bevel(hull, width=0.10, segments=2)

    cutter = add_box("Spindle_WellCut", (R * 0.92, R * 0.50, R * 0.42), (0.0, 0.0, R * 0.34), well_mat)
    boolean_difference(hull, cutter, solver="FLOAT")
    floor = add_box("Spindle_WellFloor", (R * 0.84, R * 0.42, 0.10), (0.0, 0.0, R * 0.16), well_mat)
    lip_a = add_box("Spindle_WellLip_X", (R * 0.92, R * 0.08, R * 0.08), (0.0, R * 0.26, R * 0.38), well_mat)
    lip_b = add_box("Spindle_WellLip_Y", (R * 0.08, R * 0.50, R * 0.08), (R * 0.46, 0.0, R * 0.38), well_mat)
    join_into(floor, [lip_a, lip_b])

    collars = []
    for x in (-0.95, -0.35, 0.35, 0.95):
        collars.append(collar_x(
            f"Spindle_Clamp_{int((x + 1) * 100)}", x * R, R * 0.50, R * 0.405, R * 0.16, clamp_mat, bolts=8, bolt=0.45,
        ))
    tag_port = add_box("Spindle_Seal_Tag_Port", (R * 0.36, R * 0.05, R * 0.12), (R * 0.28, -R * 0.44, R * 0.08), brass_mat)
    tag_stbd = add_box("Spindle_Seal_Tag_Starboard", (R * 0.36, R * 0.05, R * 0.12), (R * 0.28, R * 0.44, R * 0.08), brass_mat)

    for obj in [hull, floor, tag_port, tag_stbd, *collars]:
        parent_keep_world(obj, root)
    join_into(collars[0], collars[1:])
    join_into(tag_port, [tag_stbd])
    stamp_contract(
        root, "SF_47A_EVIDENCE_SPINDLE", "place_47a_evidence_spindle",
        "asset.slice.47a_spindle", ["SOCKET_Tether_Massline", "SOCKET_Camera_Focus"],
    )
    add_socket(root, "SOCKET_Tether_Massline", (0.0, 0.0, 0.0), "tether")
    add_socket(root, "SOCKET_Camera_Focus", (0.0, 0.0, R * 0.25), "camera")
    for obj in list(bpy.data.objects):
        if obj.type == "MESH":
            triangulate(obj)
    return root


def hoop_x(name, x, outer, inner, width, material, vertices=20):
    ring = add_cyl_x(name, outer, width, (x, 0.0, 0.0), material, vertices=vertices)
    bore = add_cyl_x(f"{name}_bore", inner, width + 0.35, (x, 0.0, 0.0), material, vertices=max(12, vertices - 2))
    boolean_difference(ring, bore, solver="FLOAT")
    return ring


def build_pod():
    R = 8.0
    root = make_root("Civilian_Pod_47A")
    hull_mat = principled("CivilianPod_White_Ceramic", (0.85, 0.87, 0.86), 0.48, 0.08)
    scorch_mat = principled("CivilianPod_Scorch", (0.24, 0.22, 0.20), 0.88, 0.08)
    paint_mat = principled("CivilianPod_Distress_Paint", (0.72, 0.12, 0.18), 0.38, 0.04)
    well_mat = principled("CivilianPod_Port_Well", (0.08, 0.10, 0.12), 0.40, 0.12)

    body = add_cyl_x("CivilianPod_Shell", R * 0.42, R * 1.05, (0, 0, 0), hull_mat, vertices=28)
    nose = add_sphere("CivilianPod_Nose", R * 0.42, (R * 0.52, 0, 0), hull_mat, segments=20)
    tail = add_sphere("CivilianPod_Tail", R * 0.42, (-R * 0.52, 0, 0), hull_mat, segments=20)
    boolean_union(body, nose)
    boolean_union(body, tail)
    bevel(body, width=0.07, segments=2)

    groove_s = hoop_x("CivilianPod_ScorchGroove", -R * 0.62, R * 0.50, R * 0.33, R * 0.24, scorch_mat)
    boolean_difference(body, groove_s, solver="EXACT")
    scorch = hoop_x("CivilianPod_Aft_Scorch_Band", -R * 0.62, R * 0.418, R * 0.37, R * 0.18, scorch_mat)
    groove_p = hoop_x("CivilianPod_PaintGroove", R * 0.22, R * 0.50, R * 0.33, R * 0.16, paint_mat)
    boolean_difference(body, groove_p, solver="EXACT")
    band = hoop_x("CivilianPod_Distress_Band", R * 0.22, R * 0.418, R * 0.37, R * 0.10, paint_mat)

    floors = []
    for y, name in ((-1, "Port"), (1, "Starboard")):
        cutter = add_box(
            f"CivilianPod_PortCut_{name}",
            (R * 0.42, R * 0.16, R * 0.36),
            (R * 0.08, y * R * 0.36, R * 0.08),
            well_mat,
        )
        boolean_difference(body, cutter, solver="FLOAT")
        floors.append(add_box(
            f"CivilianPod_Port_{name}",
            (R * 0.36, 0.07, R * 0.28),
            (R * 0.08, y * R * 0.32, R * 0.02),
            well_mat,
        ))
    for obj in (body, scorch, band, *floors):
        parent_keep_world(obj, root)
    join_into(floors[0], floors[1:])
    stamp_contract(
        root, "SF_47A_CIVILIAN_POD", "place_47a_civilian_pod",
        "asset.slice.civilian_pod", ["SOCKET_Tether_Massline", "SOCKET_Camera_Focus"],
    )
    add_socket(root, "SOCKET_Tether_Massline", (0.0, 0.0, 0.0), "tether")
    add_socket(root, "SOCKET_Camera_Focus", (0.0, 0.0, R * 0.18), "camera")
    for obj in list(bpy.data.objects):
        if obj.type == "MESH":
            triangulate(obj)
    return root


def build_beacon():
    R = 25.6
    root = make_root("Kessler_Handoff_Beacon_47A")
    mast_mat = principled("HandoffBeacon_Dark_Mast", (0.09, 0.10, 0.14), 0.62, 0.55)
    paint_mat = principled("HandoffBeacon_Quiet_Violet", (0.28, 0.20, 0.48), 0.44, 0.22)
    well_mat = principled("HandoffBeacon_KeyWell", (0.05, 0.06, 0.08), 0.55, 0.2)

    spine = add_box("HandoffBeacon_Spine", (R * 0.16, R * 0.16, R * 1.35), (0.0, 0.0, R * 0.52), mast_mat)
    bevel(spine, width=0.20, segments=2)
    arm = add_box("HandoffBeacon_Crossbar", (R * 0.92, R * 0.11, R * 0.11), (R * 0.42, 0.0, R * 0.92), mast_mat)
    parent_keep_world(arm, root)
    parent_keep_world(spine, root)
    join_into(spine, [arm])
    slot = add_box("HandoffBeacon_KeyCut", (R * 0.12, R * 0.06, R * 0.30), (0.0, 0.0, R * 1.12), well_mat)
    boolean_difference(spine, slot, solver="FLOAT")
    floor = add_box("HandoffBeacon_KeyFloor", (R * 0.10, R * 0.10, 0.10), (0.0, 0.0, R * 0.98), well_mat)
    ring = collar_z(
        "HandoffBeacon_Covert_Ring",
        R * 0.48,
        R * 0.52,
        R * 0.42,
        R * 0.12,
        paint_mat,
        bolts=8,
        bolt_mat=mast_mat,
        bolt=R * 0.04,
        location=(R * 0.78, 0.0, R * 0.48),
    )
    for obj in (floor, ring):
        parent_keep_world(obj, root)
    stamp_contract(
        root, "SF_47A_KESSLER_HANDOFF_BEACON", "place_47a_kessler_beacon",
        "asset.slice.kessler_handoff_beacon", ["SOCKET_Handoff_Core", "SOCKET_Camera_Focus"],
    )
    add_socket(root, "SOCKET_Handoff_Core", (0.0, 0.0, R * 0.58), "objective")
    add_socket(root, "SOCKET_Camera_Focus", (0.0, 0.0, R * 0.6), "camera")
    for obj in list(bpy.data.objects):
        if obj.type == "MESH":
            triangulate(obj)
    return root


def build_wreck():
    R = 92.0
    root = make_root("Bourse_Carrier_Wreck_47A")
    char_mat = principled("Bourse_Charred_Plate", (0.16, 0.14, 0.12), 0.92, 0.22)
    rib_mat = principled("Bourse_Exposed_Rib", (0.36, 0.33, 0.28), 0.72, 0.50)

    hull = add_box("Bourse_Carrier_Hull", (R * 1.85, R * 0.38, R * 0.28), (0.0, -R * 0.12, -R * 0.02), char_mat)
    bevel(hull, width=2.2, segments=2)
    deck = add_box(
        "Bourse_Broken_FlightDeck",
        (R * 1.05, R * 0.62, R * 0.09),
        (R * 0.08, R * 0.22, R * 0.16),
        char_mat,
        rotation=(0.16, -0.10, 0.12),
    )
    wing = add_box(
        "Bourse_Torn_Plate",
        (R * 0.48, R * 0.36, R * 0.07),
        (-R * 0.38, R * 0.40, R * 0.06),
        char_mat,
        rotation=(0.55, 0.18, -0.28),
    )
    parent_keep_world(deck, root)
    parent_keep_world(wing, root)
    parent_keep_world(hull, root)
    join_into(hull, [deck, wing])
    side_open = add_box("Bourse_SideTear", (R * 1.05, R * 0.70, R * 0.48), (R * 0.10, R * 0.42, R * 0.10), rib_mat)
    boolean_difference(hull, side_open, solver="FLOAT")
    bite = add_box(
        "Bourse_CornerBite",
        (R * 0.55, R * 0.42, R * 0.36),
        (R * 0.72, R * 0.18, R * 0.08),
        rib_mat,
        rotation=(0.25, -0.35, 0.18),
    )
    boolean_difference(hull, bite, solver="FLOAT")
    floor = add_box("Bourse_BayFloor", (R * 0.90, R * 0.40, R * 0.06), (R * 0.06, R * 0.02, -R * 0.10), rib_mat)
    ribs = []
    for i in range(5):
        x = -R * 0.48 + i * R * 0.22
        side = -1 if i % 2 == 0 else 1
        ribs.append(add_box(
            f"Bourse_Rib_{i}",
            (R * 0.05, R * 0.55, R * 0.26),
            (x, R * 0.04, R * 0.04),
            rib_mat,
            rotation=(0.22 * side, 0.04 * side, 0.12 * side),
        ))
    for obj in [floor, *ribs]:
        parent_keep_world(obj, root)
    join_into(ribs[0], [*ribs[1:], floor])
    stamp_contract(
        root, "SF_47A_BOURSE_CARRIER_WRECK", "place_47a_bourse_wreck",
        "asset.slice.bourse_carrier_wreck", ["SOCKET_Hazard_Core", "SOCKET_Camera_Focus"],
    )
    add_socket(root, "SOCKET_Hazard_Core", (0.0, 0.0, 0.0), "hazard")
    add_socket(root, "SOCKET_Camera_Focus", (0.0, 0.0, R * 0.18), "camera")
    for obj in list(bpy.data.objects):
        if obj.type == "MESH":
            triangulate(obj)
    return root

ASSETS = {
    "spindle": ("place_47a_evidence_spindle.glb", build_spindle),
    "pod": ("place_47a_civilian_pod.glb", build_pod),
    "beacon": ("place_47a_kessler_beacon.glb", build_beacon),
    "wreck": ("place_47a_bourse_wreck.glb", build_wreck),
}


def main():
    args = parse_args(sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else [])
    out_dir = args.output_dir
    keys = list(ASSETS) if args.only == "all" else [args.only]
    reports = []
    for key in keys:
        filename, builder = ASSETS[key]
        clear_scene()
        root = builder()
        path = (out_dir / filename).resolve()
        export_glb(path, root)
        report = {
            "ok": True,
            "asset": key,
            "revision": REVISION,
            "root": root.name,
            "output": str(path),
            "bytes": path.stat().st_size,
            **mesh_report(),
        }
        path.with_suffix(".report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        reports.append(report)
        print(json.dumps(report))
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "unit3_build.json").write_text(json.dumps({"revision": REVISION, "assets": reports}, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
