#!/usr/bin/env python3
"""Render the exact PQ-019 receiver-facility material-truth evidence allowlist.

The renderer imports the frozen baseline and isolated candidate source GLBs, never a canonical live
release.  It emits exactly twenty 1920x1080 PNGs for each asset/epoch and one hash-bound combined
render report.  It does not save a Blend or mutate any source, manifest, or sibling facility.
"""
from __future__ import annotations

import hashlib
import json
import math
from contextlib import contextmanager
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
ASSET_ROOT = ROOT / "assets" / "ships" / "m5_claim_outposts"
EVIDENCE_ROOT = ASSET_ROOT / "evidence" / "pq019-receivers-material-truth-v1"
BASELINE_MANIFEST = EVIDENCE_ROOT / "baseline-manifest.json"
BUILD_REPORT = EVIDENCE_ROOT / "build-report.json"
RENDER_REPORT = EVIDENCE_ROOT / "render-report.json"
CANDIDATE_ID = "receiver_facility_material_truth_v1"
DISPATCH_UNIT = "PQ-019.receiver-facility-reauthor"
REVIEW_COLLECTION = "SF_PQ019_RECEIVER_REVIEW_RIG"
RESOLUTION = (1920, 1080)
TARGET_ORDER = ("place_claim_outpost_base", "place_claim_outpost_refinery")
MATERIAL_NAMES = (
    "Material_Hull",
    "Material_Mechanical",
    "Material_Accent",
    "Material_Glass",
    "Material_Warm",
)
SOCKET_NAMES = (
    "SOCKET_Structure_Core",
    "SOCKET_Dock_Approach",
    "SOCKET_Emissive",
    "SOCKET_Module_Depot",
    "SOCKET_Module_Refinery",
    "SOCKET_Module_Defense",
    "SOCKET_Module_Teleporter",
)
VIEW_NAMES = (
    "front_three_quarter",
    "rear_three_quarter",
    "service_side",
    "top_load_path",
    "role_close",
    "dock_axis",
)
RUNTIME_FRAMINGS = (
    {"name": "close", "zoom": 72, "zoomRadii": 3.0},
    {"name": "default", "zoom": 132, "zoomRadii": 5.5},
    {"name": "far", "zoom": 264, "zoomRadii": 11.0},
)
TARGETS = {
    "place_claim_outpost_base": {
        "root": "SF_PLACE_CLAIM_OUTPOST_BASE_ROOT",
        "runtimeScale": 0.16,
        "bounds": {
            "min": (-47.0226, -17.6696, -47.0226),
            "max": (55.5, 12.5, 47.0226),
            "size": (102.5226, 30.1696, 94.0452),
        },
        "roleTarget": (40.0, 2.0, 0.0),
    },
    "place_claim_outpost_refinery": {
        "root": "SF_PLACE_CLAIM_OUTPOST_REFINERY_ROOT",
        "runtimeScale": 0.20,
        "bounds": {
            "min": (-50.8652, -17.6696, -50.8652),
            "max": (55.5, 30.93, 47.0226),
            "size": (106.3652, 48.5996, 97.8878),
        },
        "roleTarget": (36.0, 4.0, 11.0),
    },
}


def repo_path(path: Path) -> str:
    return str(path.relative_to(ROOT)).replace("\\", "/")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().lower()


def identity(path: Path) -> dict:
    if not path.is_file():
        raise FileNotFoundError(path)
    return {"path": repo_path(path), "bytes": path.stat().st_size, "sha256": sha256(path)}


def load_contracts() -> tuple[dict, dict]:
    baseline = json.loads(BASELINE_MANIFEST.read_text(encoding="utf-8"))
    build = json.loads(BUILD_REPORT.read_text(encoding="utf-8"))
    if baseline.get("schema") != "spaceface.pq019ReceiverFacilityBaseline.v1":
        raise RuntimeError("unsupported receiver baseline schema")
    if build.get("schema") != "spaceface.claimOutpostReceiverFacilityMaterialTruthBuild.v1":
        raise RuntimeError("unsupported receiver build-report schema")
    if build.get("candidateId") != CANDIDATE_ID or tuple(build.get("targetOrder", ())) != TARGET_ORDER:
        raise RuntimeError("build report is not the exact two-target receiver candidate")
    return baseline, build


def clear_scene_datablocks() -> None:
    # Local datablock clearing preserves Blender preferences and add-ons; never use factory reset.
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for collection in list(bpy.data.collections):
        bpy.data.collections.remove(collection)
    for datablocks in (bpy.data.meshes, bpy.data.curves, bpy.data.cameras, bpy.data.lights,
                       bpy.data.materials, bpy.data.images):
        for datablock in list(datablocks):
            if datablock.users == 0:
                datablocks.remove(datablock)


def import_source(path: Path) -> None:
    clear_scene_datablocks()
    bpy.ops.import_scene.gltf(filepath=str(path))
    bpy.context.view_layer.update()


def calculate_bounds(objects):
    minimum = Vector((1e9, 1e9, 1e9))
    maximum = Vector((-1e9, -1e9, -1e9))
    for obj in objects:
        for corner in obj.bound_box:
            point = obj.matrix_world @ Vector(corner)
            for axis in range(3):
                minimum[axis] = min(minimum[axis], point[axis])
                maximum[axis] = max(maximum[axis], point[axis])
    return minimum, maximum, maximum - minimum


def visible_lod(lod: int) -> list:
    visible = []
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        show = obj.name.startswith(f"LOD{lod}_") and obj.name != "COLLISION_HULL"
        obj.hide_render = not show
        obj.hide_viewport = False
        if show:
            visible.append(obj)
    if len(visible) != 5:
        raise RuntimeError(f"LOD{lod} must expose exactly five joined semantic meshes, got {len(visible)}")
    roles = sorted(obj.data.materials[0].name for obj in visible)
    if roles != sorted(MATERIAL_NAMES):
        raise RuntimeError(f"LOD{lod} material roles drifted: {roles}")
    return visible


def assert_source_contract(asset_id: str) -> dict:
    spec = TARGETS[asset_id]
    required = (spec["root"], "COLLISION_HULL", *SOCKET_NAMES)
    missing = [name for name in required if bpy.data.objects.get(name) is None]
    if missing:
        raise RuntimeError(f"{asset_id}: imported source missing frozen objects {missing}")
    lod0 = visible_lod(0)
    minimum, maximum, size = calculate_bounds(lod0)
    expected = spec["bounds"]
    for label, actual, wanted in (("min", minimum, expected["min"]),
                                  ("max", maximum, expected["max"]),
                                  ("size", size, expected["size"])):
        for axis in range(3):
            if abs(actual[axis] - wanted[axis]) > 0.001:
                raise RuntimeError(f"{asset_id}: imported {label}[{axis}] {actual[axis]} != {wanted[axis]}")
    return {
        "min": [round(value, 4) for value in minimum],
        "max": [round(value, 4) for value in maximum],
        "size": [round(value, 4) for value in size],
    }


def point_at(obj, target, up="Y") -> None:
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", up).to_euler()


def link_only(obj, collection) -> None:
    for current in list(obj.users_collection):
        current.objects.unlink(obj)
    collection.objects.link(obj)


def review_collection():
    collection = bpy.data.collections.get(REVIEW_COLLECTION)
    if collection is not None:
        for obj in list(collection.objects):
            bpy.data.objects.remove(obj, do_unlink=True)
        bpy.data.collections.remove(collection)
    collection = bpy.data.collections.new(REVIEW_COLLECTION)
    bpy.context.scene.collection.children.link(collection)
    return collection


def add_area_light(collection, name, location, energy, color, size, target) -> None:
    bpy.ops.object.light_add(type="AREA", location=location)
    light = bpy.context.object
    light.name = name
    light.data.energy = energy
    light.data.color = color
    light.data.shape = "DISK"
    light.data.size = size
    point_at(light, target)
    link_only(light, collection)


def configure_scene(asset_id: str):
    spec = TARGETS[asset_id]
    bounds = spec["bounds"]
    target = Vector(tuple((bounds["min"][axis] + bounds["max"][axis]) * 0.5 for axis in range(3)))
    collection = review_collection()
    world = bpy.context.scene.world or bpy.data.worlds.new("SF_PQ019_REVIEW_WORLD")
    bpy.context.scene.world = world
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (0.003, 0.006, 0.012, 1.0)
    background.inputs["Strength"].default_value = 0.38
    bpy.ops.object.camera_add(location=target + Vector((150.0, 90.0, 150.0)))
    camera = bpy.context.object
    camera.name = "SF_PQ019_REVIEW_CAMERA"
    camera.data.type = "PERSP"
    camera.data.lens = 58.0
    camera.data.sensor_width = 36.0
    camera.data.sensor_fit = "VERTICAL"
    camera.data.dof.use_dof = False
    link_only(camera, collection)
    bpy.context.scene.camera = camera
    configure_lighting(collection, target, "surface")
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = RESOLUTION[0]
    scene.render.resolution_y = RESOLUTION[1]
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.film_transparent = False
    scene.render.use_file_extension = True
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = 0.82
    return collection, camera, target


def configure_lighting(collection, target, mode: str) -> None:
    for obj in list(collection.objects):
        if obj.type == "LIGHT":
            bpy.data.objects.remove(obj, do_unlink=True)
    background = bpy.context.scene.world.node_tree.nodes.get("Background")
    if mode == "grazing":
        background.inputs["Strength"].default_value = 0.10
        add_area_light(collection, "SF_GRAZE_KEY", target + Vector((18, 22, 175)),
                       105000.0, (1.0, 0.82, 0.60), 22.0, target)
        add_area_light(collection, "SF_GRAZE_RIM", target + Vector((-90, 15, -120)),
                       38000.0, (0.34, 0.55, 1.0), 30.0, target)
    else:
        background.inputs["Strength"].default_value = 0.38
        add_area_light(collection, "SF_KEY", target + Vector((120, 150, 110)),
                       88000.0, (1.0, 0.88, 0.72), 55.0, target)
        add_area_light(collection, "SF_FILL", target + Vector((-100, 80, 130)),
                       44000.0, (0.50, 0.68, 1.0), 65.0, target)
        add_area_light(collection, "SF_RIM", target + Vector((-130, 20, -100)),
                       64000.0, (0.30, 0.55, 1.0), 45.0, target)


def view_contracts(asset_id: str, target: Vector) -> dict:
    role_target = Vector(TARGETS[asset_id]["roleTarget"])
    return {
        "front_three_quarter": {"target": target, "offset": Vector((150, 92, 150)), "lens": 58.0, "up": "Y"},
        "rear_three_quarter": {"target": target, "offset": Vector((-150, 92, -150)), "lens": 58.0, "up": "Y"},
        "service_side": {"target": target, "offset": Vector((0, 52, -215)), "lens": 58.0, "up": "Y"},
        "top_load_path": {"target": target, "offset": Vector((0.1, 235, 0.0)), "lens": 58.0, "up": "X"},
        "role_close": {"target": role_target, "offset": Vector((92, 48, 82)), "lens": 68.0, "up": "Y"},
        "dock_axis": {"target": Vector((29.0, 2.0, 0.0)), "offset": Vector((185, 15, 0)), "lens": 62.0, "up": "Y"},
    }


def set_view(camera, contract: dict) -> dict:
    camera.data.type = "PERSP"
    camera.data.lens = contract["lens"]
    camera.location = contract["target"] + contract["offset"]
    point_at(camera, contract["target"], contract["up"])
    return {
        "position": [round(value, 6) for value in camera.location],
        "target": [round(value, 6) for value in contract["target"]],
        "lensMm": contract["lens"],
        "up": contract["up"],
    }


def diagnostic_material(name: str, color, metallic=0.0, roughness=0.72):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1.0)
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Roughness"].default_value = roughness
    return material


@contextmanager
def override_materials(objects, replacements: dict | None = None, universal=None):
    original = []
    try:
        for obj in objects:
            slots = list(obj.data.materials)
            original.append((obj, slots))
            role = slots[0].name if slots else None
            obj.data.materials.clear()
            obj.data.materials.append(universal if universal is not None else replacements[role])
        yield
    finally:
        for obj, slots in original:
            obj.data.materials.clear()
            for material in slots:
                obj.data.materials.append(material)


@contextmanager
def emission_disabled():
    saved = []
    try:
        for name in MATERIAL_NAMES:
            material = bpy.data.materials.get(name)
            if material is None or not material.use_nodes:
                continue
            for node in material.node_tree.nodes:
                if node.type != "BSDF_PRINCIPLED":
                    continue
                for socket_name in ("Emission Color", "Emission Strength"):
                    socket = node.inputs.get(socket_name)
                    if socket is None:
                        continue
                    previous = list(socket.default_value) if hasattr(socket.default_value, "__iter__") else socket.default_value
                    saved.append((socket, previous))
                    socket.default_value = (0.0, 0.0, 0.0, 1.0) if socket_name == "Emission Color" else 0.0
        yield
    finally:
        for socket, value in saved:
            socket.default_value = value


def render_png(output: Path) -> dict:
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.context.scene.render.filepath = str(output)
    bpy.ops.render.render(write_still=True)
    result = identity(output)
    result.update({"width": RESOLUTION[0], "height": RESOLUTION[1]})
    return result


def image_row(name: str, output: Path, look: str, view: str, lod: int,
              camera: dict, runtime_zoom=None) -> dict:
    row = {"name": name, **render_png(output), "look": look, "view": view, "lod": lod,
           "camera": camera, "runtimeZoom": runtime_zoom}
    return row


def render_runtime_band(asset_id: str, framing: dict, camera, target: Vector, output: Path) -> tuple[dict, dict]:
    spec = TARGETS[asset_id]
    fov_deg = 50.0
    distance_scale = 0.72
    camera.data.type = "PERSP"
    camera.data.sensor_fit = "VERTICAL"
    camera.data.angle = math.radians(fov_deg)
    distance = framing["zoom"] * distance_scale / spec["runtimeScale"]
    horizontal = math.cos(math.radians(60.0))
    vertical = math.sin(math.radians(60.0))
    direction = Vector((horizontal / math.sqrt(2), vertical, horizontal / math.sqrt(2)))
    camera.location = target + direction * distance
    point_at(camera, target)
    half_vertical = math.tan(math.radians(fov_deg * 0.5)) * framing["zoom"] * distance_scale
    projected_radius_fraction = 24.0 / half_vertical
    camera_row = {
        "position": [round(value, 6) for value in camera.location],
        "target": [round(value, 6) for value in target],
        "fovDeg": fov_deg,
        "sourceDistance": round(distance, 6),
        "runtimeScale": spec["runtimeScale"],
        "runtimeHalfVerticalWu": round(half_vertical, 9),
        "projectedRadiusFraction": round(projected_radius_fraction, 9),
    }
    return image_row(f"runtime_{framing['name']}", output, "surface", "runtime_equivalent", 0,
                     camera_row, framing["zoom"]), camera_row


def render_epoch(asset_id: str, epoch: str, source: dict) -> dict:
    source_path = ROOT / source["path"]
    actual = identity(source_path)
    if actual["bytes"] != source["bytes"] or actual["sha256"] != source["sha256"]:
        raise RuntimeError(f"{asset_id}/{epoch}: source identity changed before render")
    import_source(source_path)
    bounds = assert_source_contract(asset_id)
    collection, camera, target = configure_scene(asset_id)
    views = view_contracts(asset_id, target)
    output_root = EVIDENCE_ROOT / asset_id / epoch
    images = []

    # Six surfaced matched views.
    lod0 = visible_lod(0)
    for view_name in VIEW_NAMES:
        camera_row = set_view(camera, views[view_name])
        name = f"surface_{view_name}"
        images.append(image_row(name, output_root / f"{name}.png", "surface", view_name, 0, camera_row))

    # Six neutral-clay views reject primitive stacking independently of authored color.
    clay = diagnostic_material("SF_DIAG_NEUTRAL_CLAY", (0.46, 0.47, 0.48), 0.0, 0.76)
    with override_materials(lod0, universal=clay):
        for view_name in VIEW_NAMES:
            camera_row = set_view(camera, views[view_name])
            name = f"clay_{view_name}"
            images.append(image_row(name, output_root / f"{name}.png", "clay", view_name, 0, camera_row))

    # Required diagnostic looks.
    configure_lighting(collection, target, "grazing")
    camera_row = set_view(camera, views["service_side"])
    images.append(image_row("hard_grazing", output_root / "hard_grazing.png", "hard_grazing",
                            "service_side", 0, camera_row))
    configure_lighting(collection, target, "surface")
    id_colors = {
        "Material_Hull": (0.78, 0.18, 0.18),
        "Material_Mechanical": (0.18, 0.72, 0.24),
        "Material_Accent": (0.16, 0.32, 0.86),
        "Material_Glass": (0.70, 0.18, 0.78),
        "Material_Warm": (0.92, 0.64, 0.12),
    }
    id_materials = {name: diagnostic_material(f"SF_DIAG_ID_{name}", color, 0.0, 0.64)
                    for name, color in id_colors.items()}
    with override_materials(lod0, replacements=id_materials):
        camera_row = set_view(camera, views["front_three_quarter"])
        images.append(image_row("material_id", output_root / "material_id.png", "material_id",
                                "front_three_quarter", 0, camera_row))
    with emission_disabled():
        camera_row = set_view(camera, views["role_close"])
        images.append(image_row("emissive_off", output_root / "emissive_off.png", "emissive_off",
                                "role_close", 0, camera_row))

    # LOD meaning checks use the exact same front-three-quarter camera.
    for lod in (1, 2):
        visible_lod(lod)
        camera_row = set_view(camera, views["front_three_quarter"])
        name = f"lod{lod}_front_three_quarter"
        images.append(image_row(name, output_root / f"{name}.png", "surface",
                                "front_three_quarter", lod, camera_row))
    visible_lod(0)

    # Runtime-equivalent bands preserve the accepted H1 radius/zoom authority.  Source-space camera
    # distance divides by the exact runtime scale; the report records the projected radius fraction.
    runtime_cameras = []
    for framing in RUNTIME_FRAMINGS:
        row, camera_row = render_runtime_band(
            asset_id, framing, camera, target, output_root / f"runtime_{framing['name']}.png"
        )
        images.append(row)
        runtime_cameras.append({"name": framing["name"], "zoom": framing["zoom"], **camera_row})

    if len(images) != 20 or len({row["name"] for row in images}) != 20:
        raise RuntimeError(f"{asset_id}/{epoch}: renderer must emit exactly twenty named images")
    return {
        "source": actual,
        "bounds": bounds,
        "images": images,
        "runtimeCameras": runtime_cameras,
    }


def render() -> dict:
    baseline, build = load_contracts()
    targets = {}
    for asset_id in TARGET_ORDER:
        baseline_source = baseline["targets"][asset_id]["packetSource"]
        candidate = build["targets"][asset_id]
        candidate_source = {
            "path": candidate["sourceCandidate"],
            "bytes": candidate["bytes"]["source"],
            "sha256": candidate["sourceCandidateSha256"],
        }
        targets[asset_id] = {
            "runtimeScale": TARGETS[asset_id]["runtimeScale"],
            "expectedBounds": {key: list(value) for key, value in TARGETS[asset_id]["bounds"].items()},
            "epochs": {
                "baseline": render_epoch(asset_id, "baseline", baseline_source),
                "candidate": render_epoch(asset_id, "candidate", candidate_source),
            },
        }

    fov_deg = 50.0
    distance_scale = 0.72
    runtime_authority = []
    for framing in RUNTIME_FRAMINGS:
        half_vertical = math.tan(math.radians(fov_deg * 0.5)) * framing["zoom"] * distance_scale
        runtime_authority.append({
            **framing,
            "projectedRadiusFraction": round(24.0 / half_vertical, 9),
        })
    report = {
        "schema": "spaceface.claimOutpostReceiverFacilityMaterialTruthRender.v1",
        "dispatchUnit": DISPATCH_UNIT,
        "candidateId": CANDIDATE_ID,
        "renderer": repo_path(Path(__file__)),
        "rendererSha256": sha256(Path(__file__)),
        "buildReport": identity(BUILD_REPORT),
        "baselineManifest": identity(BASELINE_MANIFEST),
        "resolution": {"width": RESOLUTION[0], "height": RESOLUTION[1]},
        "renderEngine": "BLENDER_EEVEE",
        "colorManagement": {"look": "AgX - Medium High Contrast", "exposure": 0.82},
        "runtimeEquivalentAuthority": {
            "viewport": {"width": 1440, "height": 900},
            "subjectRadius": 24,
            "fovDeg": fov_deg,
            "distanceScale": distance_scale,
            "framings": runtime_authority,
            "outputResolution": {"width": RESOLUTION[0], "height": RESOLUTION[1]},
            "matchRule": "same vertical projected fraction after exact per-asset runtime scale",
        },
        "targetOrder": list(TARGET_ORDER),
        "targets": targets,
        "imageCount": 80,
        "exactAllowlistComplete": True,
    }
    actual_count = sum(len(epoch["images"]) for target in targets.values()
                       for epoch in target["epochs"].values())
    if actual_count != 80:
        raise RuntimeError(f"combined render report must bind exactly eighty images, got {actual_count}")
    RENDER_REPORT.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return report


if __name__ == "__main__":
    print(json.dumps(render(), indent=2, sort_keys=True))
