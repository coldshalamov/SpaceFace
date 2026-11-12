"""Build held-out Helios V4 hub/gate candidates from the validated BlenderKit CC0 donor.

This lane is deliberately isolated. It produces production .blend files and visual evidence
under assets/ships/m4_helios_hub_v4 only; it never writes live source/release registries.
The acquired donor and license evidence live under assets/third_party/helios_v4.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import sys
import time
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
DONOR = ROOT / "assets" / "third_party" / "helios_v4" / "blenderkit_scifi_station" / "blenderkit_scifi_station_cc0.blend"
OUT = ROOT / "assets" / "ships" / "m4_helios_hub_v4"
EVIDENCE = OUT / "evidence" / "renders"
BLENDS = OUT / "blender"
LOCK = OUT / "authoring.__lock"
METAL_TEX = ROOT / "assets" / "third_party" / "helios_v3" / "polyhaven" / "metal_plate"

DONOR_OBJECTS = {
    "Sci-Fi_Station_base ring",
    "Sci-Fi_Station_base ring details",
    "Sci-Fi_Station_base ring secondary spikes",
    "Sci-Fi_Station_base ring spike details",
    "Sci-Fi_Station_base ring spikes",
    "Sci-Fi_Station_Interior pods",
    "Sci-Fi_Station_lights",
    "Sci-Fi_Station_outer ring",
    "Sci-Fi_Station_outer ring details",
    "Sci-Fi_Station_outer ring pods",
}


def log(msg: str) -> None:
    print(f"[helios-v4] {msg}", flush=True)


def ensure_dirs() -> None:
    for p in (OUT, EVIDENCE, BLENDS):
        p.mkdir(parents=True, exist_ok=True)


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest().upper()


def clear_non_asset_scene() -> None:
    for obj in list(bpy.data.objects):
        if obj.name not in DONOR_OBJECTS:
            bpy.data.objects.remove(obj, do_unlink=True)
    for action in list(bpy.data.actions):
        bpy.data.actions.remove(action)


def apply_modifier(obj: bpy.types.Object, modifier: bpy.types.Modifier) -> None:
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    try:
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    except Exception as exc:
        log(f"modifier apply warning {obj.name}/{modifier.name}: {exc}")
    obj.select_set(False)


def prepare_donor(asset_id: str) -> list[bpy.types.Object]:
    bpy.ops.wm.open_mainfile(filepath=str(DONOR))
    clear_non_asset_scene()
    bpy.context.scene.frame_set(0)
    source = [bpy.data.objects[n] for n in DONOR_OBJECTS if n in bpy.data.objects]
    for obj in source:
        if obj.type != "MESH":
            continue
        for mod in list(obj.modifiers):
            apply_modifier(obj, mod)
        obj.animation_data_clear()
        obj["sf_component"] = "authored_macro_donor"
        obj["sf_donor_asset_base_id"] = "b180fdbd-668f-4081-ad51-f364e829f11d"
        obj["sf_donor_version_id"] = "83d164c8-2aa1-4be4-bceb-ebb4f2cdc280"

    # The 64k-face layer is the needle-noise source and becomes unreadable combing at the
    # flight camera. Cull it completely; the two separate authored structural-spike meshes
    # remain as sparse major antenna clusters and preserve the donor's silhouette language.
    spike_detail = bpy.data.objects.get("Sci-Fi_Station_base ring spike details")
    if spike_detail:
        source.remove(spike_detail)
        bpy.data.objects.remove(spike_detail, do_unlink=True)
    for name, height_scale in (
        ("Sci-Fi_Station_base ring spikes", 0.26),
        ("Sci-Fi_Station_base ring secondary spikes", 0.34),
    ):
        obj = bpy.data.objects.get(name)
        if obj:
            obj.scale.z *= height_scale
            bpy.context.view_layer.objects.active = obj
            obj.select_set(True)
            bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
            obj.select_set(False)
            obj["sf_component"] = "authored_sparse_major_antenna_cluster"

    if asset_id == "helios_gate":
        # A gate reads as vertical machinery in the semi-top-down flight camera.
        for obj in source:
            obj.rotation_euler.x += math.radians(90.0)
            obj.scale *= 0.78
            bpy.context.view_layer.objects.active = obj
            obj.select_set(True)
            bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
            obj.select_set(False)
    return source


def principled_material(name: str, base: tuple[float, float, float, float], *, metallic: float,
                        roughness: float, emission: tuple[float, float, float, float] | None = None,
                        emission_strength: float = 0.0) -> bpy.types.Material:
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = base
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if "Coat Weight" in bsdf.inputs:
        bsdf.inputs["Coat Weight"].default_value = 0.22
        bsdf.inputs["Coat Roughness"].default_value = 0.18
    if emission:
        key = "Emission Color" if "Emission Color" in bsdf.inputs else "Emission"
        bsdf.inputs[key].default_value = emission
        if "Emission Strength" in bsdf.inputs:
            bsdf.inputs["Emission Strength"].default_value = emission_strength
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    mat["sf_role"] = "emissive" if emission else "surface"
    return mat


def textured_metal_material() -> bpy.types.Material:
    mat = principled_material("Helios_Steel_PBR", (0.21, 0.25, 0.28, 1), metallic=0.86, roughness=0.34)
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = next(n for n in nodes if n.type == "BSDF_PRINCIPLED")
    texcoord = nodes.new("ShaderNodeTexCoord")
    mapping = nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (3.5, 3.5, 3.5)
    links.new(texcoord.outputs["UV"], mapping.inputs["Vector"])

    def image_node(filename: str, colorspace: str) -> bpy.types.Node | None:
        p = METAL_TEX / filename
        if not p.exists():
            return None
        node = nodes.new("ShaderNodeTexImage")
        node.image = bpy.data.images.load(str(p), check_existing=True)
        node.image.colorspace_settings.name = colorspace
        links.new(mapping.outputs["Vector"], node.inputs["Vector"])
        return node

    diff = image_node("metal_plate_diff_2k.jpg", "sRGB")
    rough = image_node("metal_plate_rough_2k.jpg", "Non-Color")
    metal = image_node("metal_plate_metal_2k.jpg", "Non-Color")
    normal = image_node("metal_plate_nor_gl_2k.jpg", "Non-Color")
    if diff:
        links.new(diff.outputs["Color"], bsdf.inputs["Base Color"])
    if rough:
        links.new(rough.outputs["Color"], bsdf.inputs["Roughness"])
    if metal:
        links.new(metal.outputs["Color"], bsdf.inputs["Metallic"])
    if normal:
        nmap = nodes.new("ShaderNodeNormalMap")
        nmap.inputs["Strength"].default_value = 0.32
        links.new(normal.outputs["Color"], nmap.inputs["Color"])
        links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    mat["sf_texture_source"] = "Poly Haven metal_plate CC0"
    return mat


def create_materials() -> dict[str, bpy.types.Material]:
    return {
        "armor": principled_material("Helios_Armor_Ceramic", (0.42, 0.47, 0.5, 1), metallic=0.62, roughness=0.3),
        "steel": textured_metal_material(),
        "dark": principled_material("Helios_Industrial_Dark", (0.065, 0.085, 0.11, 1), metallic=0.88, roughness=0.29),
        "accent": principled_material(
            "Helios_Warm_Accent", (0.72, 0.17, 0.025, 1), metallic=0.46, roughness=0.3,
            emission=(1.0, 0.16, 0.008, 1), emission_strength=2.8,
        ),
        "cyan": principled_material(
            "Helios_Cyan_Wayfinding", (0.01, 0.12, 0.16, 1), metallic=0.28, roughness=0.2,
            emission=(0.0, 0.92, 1.0, 1), emission_strength=7.0,
        ),
    }


def assign_material(obj: bpy.types.Object, mat: bpy.types.Material) -> None:
    if obj.type != "MESH":
        return
    obj.data.materials.clear()
    obj.data.materials.append(mat)


def zone_donor_materials(mats: dict[str, bpy.types.Material]) -> None:
    for obj in list(bpy.data.objects):
        if obj.type != "MESH":
            continue
        low = obj.name.lower()
        if "lights" in low:
            assign_material(obj, mats["cyan"])
        elif "interior pods" in low or "outer ring pods" in low or low.endswith("spikes") or "secondary spikes" in low:
            assign_material(obj, mats["dark"])
        elif "details" in low:
            assign_material(obj, mats["steel"])
        else:
            assign_material(obj, mats["armor"])


def create_prism(name: str, x0: float, x1: float, yz: list[tuple[float, float]], mat: bpy.types.Material,
                 collection: bpy.types.Collection | None = None) -> bpy.types.Object:
    verts = [(x0, y, z) for y, z in yz] + [(x1, y, z) for y, z in yz]
    n = len(yz)
    faces = [tuple(range(n - 1, -1, -1)), tuple(range(n, 2 * n))]
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, j, n + j, n + i))
    mesh = bpy.data.meshes.new(name + "_mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    (collection or bpy.context.scene.collection).objects.link(obj)
    assign_material(obj, mat)
    obj["sf_component"] = "functional_custom_topology"
    return obj


def create_octagonal_frame(name: str, center: tuple[float, float, float], depth: float,
                           outer: float, inner: float, mat: bpy.types.Material,
                           collection: bpy.types.Collection | None = None) -> bpy.types.Object:
    cx, cy, cz = center
    n = 8
    verts: list[tuple[float, float, float]] = []
    for x in (cx - depth / 2, cx + depth / 2):
        for r in (outer, inner):
            for i in range(n):
                a = 2 * math.pi * i / n + math.pi / 8
                verts.append((x, cy + math.cos(a) * r, cz + math.sin(a) * r))
    faces = []
    # Offsets: x0 outer=0, x0 inner=8, x1 outer=16, x1 inner=24.
    for i in range(n):
        j = (i + 1) % n
        faces += [
            (i, j, 16 + j, 16 + i),
            (8 + j, 8 + i, 24 + i, 24 + j),
            (i, 8 + i, 8 + j, j),
            (16 + j, 24 + j, 24 + i, 16 + i),
        ]
    mesh = bpy.data.meshes.new(name + "_mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    (collection or bpy.context.scene.collection).objects.link(obj)
    assign_material(obj, mat)
    obj["sf_component"] = "functional_docking_frame"
    return obj


def create_beam_between(name: str, start: tuple[float, float, float], end: tuple[float, float, float],
                        half_width: float, half_height: float, mat: bpy.types.Material,
                        collection: bpy.types.Collection) -> bpy.types.Object:
    """Create a chamfered load-bearing beam along an arbitrary vector (not a rotated box)."""
    a, b = Vector(start), Vector(end)
    axis = (b - a).normalized()
    reference = Vector((0, 0, 1)) if abs(axis.z) < 0.86 else Vector((0, 1, 0))
    side = axis.cross(reference).normalized()
    up = side.cross(axis).normalized()
    cross = [
        side * -half_width + up * -half_height,
        side * half_width + up * -half_height,
        side * (half_width * 1.18) + up * 0.0,
        side * half_width + up * half_height,
        side * -half_width + up * half_height,
        side * (-half_width * 1.18) + up * 0.0,
    ]
    verts = [tuple(a + v) for v in cross] + [tuple(b + v) for v in cross]
    n = len(cross)
    faces = [tuple(range(n - 1, -1, -1)), tuple(range(n, 2 * n))]
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, j, n + j, n + i))
    mesh = bpy.data.meshes.new(name + "_mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    assign_material(obj, mat)
    obj["sf_component"] = "integrated_load_path"
    return obj


def add_docking_mass(mats: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    coll = bpy.data.collections.new("HELIOS_FUNCTIONAL_DOCKING")
    bpy.context.scene.collection.children.link(coll)
    made: list[bpy.types.Object] = []
    hull_profile = [(-3.8, -1.4), (-2.7, -2.3), (2.7, -2.3), (3.8, -1.4), (3.8, 1.4), (2.7, 2.3), (-2.7, 2.3), (-3.8, 1.4)]
    panel_profile = [(-3.15, -1.46), (-2.45, -1.86), (2.45, -1.86), (3.15, -1.46), (3.15, -1.28), (-3.15, -1.28)]
    for lane_y, accent_sign in ((12.0, 1), (-12.0, -1)):
        arm = create_prism(f"DockArm_{accent_sign:+d}_LoadBearing", 31.0, 61.5, hull_profile, mats["dark"], coll)
        arm.location.y = lane_y
        made.append(arm)
        # Layered armor panels establish actual load paths rather than a single extruded bar.
        for idx, (xa, xb) in enumerate(((33.0, 40.5), (41.3, 49.0), (49.8, 57.5))):
            panel = create_prism(f"DockArm_{accent_sign:+d}_ArmorPanel_{idx}", xa, xb, panel_profile, mats["steel"], coll)
            panel.location.y = lane_y
            made.append(panel)
        bay = create_octagonal_frame(f"DockBay_{accent_sign:+d}_PressureFrame", (61.0, lane_y, 0.0), 5.0, 6.2, 4.35, mats["armor"], coll)
        made.append(bay)
        bulkhead = create_octagonal_frame(f"DockBay_{accent_sign:+d}_HubBulkhead", (34.0, lane_y, 0.0), 3.2, 5.4, 3.7, mats["steel"], coll)
        made.append(bulkhead)
        inner = create_octagonal_frame(f"DockBay_{accent_sign:+d}_CyanApproach", (63.65, lane_y, 0.0), 0.38, 4.7, 4.25, mats["cyan"], coll)
        made.append(inner)
        # Orange service chevrons and cyan lane bars are separate, readable material roles.
        for z in (-2.45, 2.45):
            strip = create_prism(
                f"DockArm_{accent_sign:+d}_ServiceStripe_{z:+.0f}", 35.0, 56.0,
                [(-3.9, z - 0.12), (-3.35, z - 0.12), (-3.35, z + 0.12), (-3.9, z + 0.12)],
                mats["accent"], coll,
            )
            strip.location.y = lane_y
            made.append(strip)
        lane = create_prism(
            f"DockArm_{accent_sign:+d}_CyanGuide", 37.0, 59.0,
            [(-0.11, -2.37), (0.11, -2.37), (0.11, -2.18), (-0.11, -2.18)], mats["cyan"], coll,
        )
        lane.location.y = lane_y
        made.append(lane)
        # Sparse amber task lights provide human/ship scale along the thirty-metre arm.
        for marker_i, marker_x in enumerate((37.5, 42.0, 46.5, 51.0, 55.5)):
            marker = create_prism(
                f"DockArm_{accent_sign:+d}_TaskLight_{marker_i}", marker_x, marker_x + 0.34,
                [(-0.35, 2.25), (0.35, 2.25), (0.35, 2.48), (-0.35, 2.48)], mats["accent"], coll,
            )
            marker.location.y = lane_y
            made.append(marker)
        socket = bpy.data.objects.new(f"SOCKET_DOCK_{'A' if accent_sign > 0 else 'B'}", None)
        socket.location = (66.5, lane_y, 0.0)
        socket.empty_display_type = "ARROWS"
        socket["spaceface.socket"] = True
        socket["role"] = "dock"
        socket["forward"] = [1, 0, 0]
        coll.objects.link(socket)
        # Diagonal trusses visually and structurally tie each arm into two separated ring nodes.
        ring_outer_y = 28.5 if lane_y > 0 else -28.5
        ring_inner_y = 22.0 if lane_y > 0 else -22.0
        made.append(create_beam_between(
            f"DockArm_{accent_sign:+d}_OuterButtress", (26.5, ring_outer_y, -1.5), (41.0, lane_y, -1.5),
            0.8, 0.65, mats["dark"], coll,
        ))
        made.append(create_beam_between(
            f"DockArm_{accent_sign:+d}_UpperButtress", (31.0, ring_inner_y, 2.2), (45.5, lane_y, 2.2),
            0.62, 0.52, mats["steel"], coll,
        ))
    return made


def add_gate_buttresses(mats: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    coll = bpy.data.collections.new("HELIOS_GATE_LOAD_PATHS")
    bpy.context.scene.collection.children.link(coll)
    made: list[bpy.types.Object] = []
    profile = [(-3.1, -2.0), (-2.0, -3.0), (2.0, -3.0), (3.1, -2.0), (3.1, 2.0), (2.0, 3.0), (-2.0, 3.0), (-3.1, 2.0)]
    for x in (-24.0, 24.0):
        # Build along local +X, then rotate that axis downward into -Z. The two lower pylons
        # visibly carry the vertical gate instead of reading as disconnected decoration.
        pylon = create_prism(f"Gate_Pylon_{x:+.0f}", 0.0, 20.0, profile, mats["dark"], coll)
        pylon.rotation_euler.y = math.radians(90)
        pylon.location = (x, -2.4, -24.0)
        made.append(pylon)
        collar = create_octagonal_frame(f"Gate_Pylon_Collar_{x:+.0f}", (0.0, 0.0, 0.0), 3.8, 5.2, 3.7, mats["steel"], coll)
        collar.rotation_euler.y = math.radians(90)
        collar.location = (x, -2.4, -23.5)
        made.append(collar)
    return made


def triangle_count(objects: list[bpy.types.Object]) -> int:
    deps = bpy.context.evaluated_depsgraph_get()
    total = 0
    for obj in objects:
        if obj.type != "MESH":
            continue
        ev = obj.evaluated_get(deps)
        mesh = ev.to_mesh()
        mesh.calc_loop_triangles()
        total += len(mesh.loop_triangles)
        ev.to_mesh_clear()
    return total


def bounds(objects: list[bpy.types.Object]) -> tuple[Vector, Vector]:
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for obj in objects:
        if obj.type != "MESH":
            continue
        for c in obj.bound_box:
            v = obj.matrix_world @ Vector(c)
            lo.x, lo.y, lo.z = min(lo.x, v.x), min(lo.y, v.y), min(lo.z, v.z)
            hi.x, hi.y, hi.z = max(hi.x, v.x), max(hi.y, v.y), max(hi.z, v.z)
    return lo, hi


def setup_world(game_sky: bool) -> None:
    for obj in list(bpy.data.objects):
        if obj.type in {"LIGHT", "CAMERA"}:
            bpy.data.objects.remove(obj, do_unlink=True)
    world = bpy.data.worlds.get("HeliosEvidenceWorld") or bpy.data.worlds.new("HeliosEvidenceWorld")
    bpy.context.scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    bg.inputs["Color"].default_value = (0.004, 0.009, 0.018, 1) if game_sky else (0.055, 0.07, 0.085, 1)
    bg.inputs["Strength"].default_value = 0.36 if game_sky else 0.68

    lights = [
        ((72, -86, 105), 3600, (0.88, 0.95, 1.0), 38),
        ((-76, 36, 54), 1900, (0.22, 0.66, 1.0), 32),
        ((20, 62, -28), 1500, (1.0, 0.33, 0.08), 24),
    ]
    for i, (loc, energy, color, size) in enumerate(lights):
        bpy.ops.object.light_add(type="AREA", location=loc)
        light = bpy.context.object
        light.name = f"EvidenceLight_{i}"
        light.data.energy = energy * (0.68 if game_sky else 1.0)
        light.data.color = color
        light.data.shape = "DISK"
        light.data.size = size
        target = Vector((8.0, 0.0, 0.0))
        light.rotation_euler = (target - light.location).to_track_quat("-Z", "Y").to_euler()


def look_camera(location: tuple[float, float, float], target: Vector, lens: float = 52.0) -> None:
    bpy.ops.object.camera_add(location=location)
    cam = bpy.context.object
    cam.name = "EvidenceCamera"
    cam.data.lens = lens
    cam.data.sensor_width = 36
    cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.camera = cam


def render(path: Path, resolution: tuple[int, int] = (1280, 720)) -> None:
    scene = bpy.context.scene
    for engine in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE", "CYCLES"):
        try:
            scene.render.engine = engine
            break
        except TypeError:
            continue
    scene.render.resolution_x, scene.render.resolution_y = resolution
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.render.filepath = str(path)
    scene.view_settings.exposure = 0.7
    for look in ("AgX - Medium High Contrast", "Medium High Contrast", "High Contrast"):
        try:
            scene.view_settings.look = look
            break
        except TypeError:
            continue
    scene.render.image_settings.color_mode = "RGBA"
    bpy.ops.render.render(write_still=True)
    log(f"rendered {path.relative_to(ROOT)}")


def render_evidence(asset_id: str, objects: list[bpy.types.Object]) -> list[str]:
    out = EVIDENCE / asset_id
    out.mkdir(parents=True, exist_ok=True)
    lo, hi = bounds(objects)
    center = (lo + hi) * 0.5
    ext = hi - lo
    radius = max(ext.x, ext.y, ext.z) * 1.08
    shots = [
        ("gameplay_topdown", (center.x + radius * 0.05, center.y - radius * 0.34, center.z + radius * 1.78), 50),
        ("gameplay_forward_34", (center.x + radius * 1.12, center.y - radius * 1.36, center.z + radius * 0.94), 50),
        ("heldout_rear_34", (center.x - radius * 1.15, center.y + radius * 1.28, center.z + radius * 0.8), 52),
        ("heldout_side", (center.x + radius * 0.05, center.y - radius * 1.72, center.z + radius * 0.34), 52),
        ("heldout_detail_dock", (center.x + radius * 0.92, center.y - radius * 0.7, center.z + radius * 0.42), 58),
    ]
    paths = []
    for name, loc, lens in shots:
        setup_world(game_sky=name.startswith("gameplay"))
        look_camera(loc, center, lens)
        p = out / f"{asset_id}_{name}.png"
        render(p)
        paths.append(str(p.relative_to(ROOT)).replace("\\", "/"))
    # Downsampled gameplay readability is evidence, not a replacement for full-size review.
    setup_world(game_sky=True)
    look_camera(shots[1][1], center, shots[1][2])
    p = out / f"{asset_id}_gameplay_readability_160.png"
    render(p, (160, 90))
    paths.append(str(p.relative_to(ROOT)).replace("\\", "/"))
    return paths


def stamp_root(asset_id: str, objects: list[bpy.types.Object]) -> bpy.types.Object:
    root = bpy.data.objects.new("ROOT_HeliosHubV4" if asset_id == "helios_hub_station" else "ROOT_HeliosGateV4", None)
    bpy.context.scene.collection.objects.link(root)
    root["spacefaceAsset"] = {
        "contractVersion": 1,
        "assetId": asset_id,
        "slot": "place",
        "family": "HELIOS_HUB_V4_CC0_DONOR",
        "packet": "PROFESSIONAL-HELIOS-HUB-VISUAL-V4",
        "unit": "metre",
        "forward": "+X",
        "up": "+Y",
        "wiringStatus": "candidate_visual_review_only",
        "donorAssetBaseId": "b180fdbd-668f-4081-ad51-f364e829f11d",
        "donorVersionId": "83d164c8-2aa1-4be4-bceb-ebb4f2cdc280",
        "donorLicense": "CC0-1.0",
    }
    for obj in objects:
        if obj.parent is None:
            obj.parent = root
    return root


def build(asset_id: str) -> dict:
    t0 = time.time()
    source = prepare_donor(asset_id)
    mats = create_materials()
    zone_donor_materials(mats)
    additions = add_docking_mass(mats) if asset_id == "helios_hub_station" else add_gate_buttresses(mats)
    objects = [o for o in source + additions if o and o.type == "MESH"]
    root = stamp_root(asset_id, objects)
    tri = triangle_count(objects)
    lo, hi = bounds(objects)
    blend_path = BLENDS / f"{asset_id}_v4_candidate.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
    shots = render_evidence(asset_id, objects)
    result = {
        "schema": "spaceface.heliosV4.visualCandidate.v1",
        "assetId": asset_id,
        "status": "candidate_visual_review_only",
        "livePromotion": False,
        "donor": {
            "assetBaseId": "b180fdbd-668f-4081-ad51-f364e829f11d",
            "versionId": "83d164c8-2aa1-4be4-bceb-ebb4f2cdc280",
            "license": "CC0-1.0",
            "sha256": sha256(DONOR),
        },
        "triangleCount": tri,
        "objectCount": len(objects),
        "boundsBlender": {"min": list(lo), "max": list(hi), "size": list(hi - lo)},
        "culledLayer": "Sci-Fi_Station_base ring spike details",
        "culledLayerRatio": 0.0,
        "materialZones": [m.name for m in mats.values()],
        "productionBlend": str(blend_path.relative_to(ROOT)).replace("\\", "/"),
        "evidence": shots,
        "elapsedSec": round(time.time() - t0, 2),
    }
    report = OUT / "evidence" / f"{asset_id}_visual_candidate.json"
    report.parent.mkdir(parents=True, exist_ok=True)
    report.write_text(json.dumps(result, indent=2), encoding="utf-8")
    log(f"built {asset_id}: {tri:,} triangles / {len(objects)} objects")
    return result


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="hub_station,gate", help="hub_station, gate, or both")
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    return ap.parse_args(argv)


def main() -> int:
    ensure_dirs()
    if not DONOR.exists():
        raise FileNotFoundError(DONOR)
    if LOCK.exists():
        raise RuntimeError(f"V4 authoring lock exists: {LOCK}")
    LOCK.write_text(json.dumps({"pid": os.getpid(), "startedAt": time.time(), "donor": str(DONOR)}), encoding="utf-8")
    try:
        args = parse_args()
        wanted = {x.strip() for x in args.only.split(",") if x.strip()}
        results = []
        if "hub_station" in wanted:
            results.append(build("helios_hub_station"))
        if "gate" in wanted:
            results.append(build("helios_gate"))
        (OUT / "evidence" / "build_summary.json").write_text(json.dumps({"results": results}, indent=2), encoding="utf-8")
        return 0
    finally:
        try:
            LOCK.unlink()
        except FileNotFoundError:
            pass


if __name__ == "__main__":
    raise SystemExit(main())
