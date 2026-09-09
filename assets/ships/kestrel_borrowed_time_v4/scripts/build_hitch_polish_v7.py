"""Build the isolated Hitch V7 polish candidate from the V6 production blend."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import sys
import tempfile
import time
from pathlib import Path

import bpy
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_v4 import (  # noqa: E402
    REQUIRED_SOCKETS,
    RIG_NAMES,
    create_lod,
    ensure_decal_pbr_roles,
    enforce_socket_contract,
    export_lod,
    remove_collection,
    sha256,
    visible_bounds,
)
from hitch_polish_v7 import PASS_ID, apply_hitch_polish_v7  # noqa: E402
from surface_maps_v7 import (  # noqa: E402
    PROFILES,
    REMASTER_ID,
    apply_to_blender_images,
    composite_ao_into_orm,
)


FAMILY = Path(__file__).resolve().parents[1]
DEFAULT_BASELINE = FAMILY / "blender" / "kestrel_material_truth_v6_production.blend"
PACKET = "SF-K0-HITCH-POLISH-V7-001"
ROLE_MATERIALS = {
    "hull": "Material_Hull",
    "mechanical": "Material_Mechanical",
    "armor_dark": "Material_ArmorDark",
    "brushed_metal": "Material_BrushedMetal",
    "frontier_cyan": "Material_Accent_FrontierCyan",
    "warning_orange": "Material_Accent_WarningOrange",
    "repair_green": "Material_RepairGreen",
    "rubber": "Material_Rubber",
    "engine_ceramic": "Material_EngineCeramic",
    "radiator": "Material_Radiator",
}


def publish_file(src: Path, dst: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    tmp = dst.with_name(f".{dst.name}.publishing")
    shutil.copy2(src, tmp)
    last_error = None
    for _ in range(8):
        try:
            if dst.exists():
                dst.unlink()
            os.replace(tmp, dst)
            return
        except PermissionError as error:
            last_error = error
            time.sleep(0.4)
    shutil.copy2(tmp, dst)
    tmp.unlink(missing_ok=True)
    if not dst.exists():
        raise last_error or RuntimeError(f"failed to publish {dst}")


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--baseline", type=Path, default=DEFAULT_BASELINE)
    parser.add_argument("--ao-samples", type=int, default=24)
    parser.add_argument("--skip-ao", action="store_true")
    parser.add_argument("--skip-unique-bake", action="store_true")
    return parser.parse_args(argv)


def production_collection_visibility(source: bpy.types.Collection) -> dict[str, bool]:
    visible = {"RIG_AND_SOCKETS"}
    pending = [source]
    while pending:
        collection = pending.pop()
        if collection.name in visible:
            continue
        visible.add(collection.name)
        pending.extend(collection.children)
    for collection in bpy.data.collections:
        collection.hide_render = collection.name not in visible
    visibility = {
        collection.name: not collection.hide_render
        for collection in sorted(bpy.data.collections, key=lambda item: item.name)
    }
    hidden_descendants = [
        collection.name
        for collection in source.children_recursive
        if not visibility.get(collection.name, False)
    ]
    if hidden_descendants:
        raise RuntimeError(f"production blend hides source descendants: {hidden_descendants}")
    return visibility


def save_candidate_blend(source: bpy.types.Collection, target: Path) -> tuple[Path, dict[str, bool]]:
    visibility = production_collection_visibility(source)
    for image in bpy.data.images:
        if image.source == "FILE" and image.size[0] > 0 and not image.packed_file:
            image.pack()
    target.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(target), compress=True)
    if target.stat().st_size >= 100 * 1024 * 1024:
        raise RuntimeError("V7 packed candidate blend exceeds 100 MiB")
    return target, visibility


def generation_contract(baseline_hash: str) -> dict:
    scripts = [
        Path(__file__).resolve(),
        Path(__file__).with_name("build_v4.py"),
        Path(__file__).with_name("hitch_polish_v7.py"),
        Path(__file__).with_name("surface_maps_v7.py"),
        Path(__file__).with_name("material_truth_v6.py"),
    ]
    script_hashes = {
        str(path.relative_to(FAMILY)).replace("\\", "/"): sha256(path)
        for path in scripts
    }
    core = {
        "baselineSha256": baseline_hash,
        "polishPassId": PASS_ID,
        "surfaceRemasterId": REMASTER_ID,
        "scriptSha256": script_hashes,
    }
    payload = json.dumps(core, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return {**core, "generationFingerprint": hashlib.sha256(payload).hexdigest().upper()}


def bake_mesh_ao(samples: int) -> dict[str, dict]:
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = samples
    scene.render.bake.margin = 8
    scene.render.bake.use_clear = True
    scene.render.bake.use_pass_direct = True
    scene.render.bake.use_pass_indirect = True
    if scene.world is None:
        world = bpy.data.worlds.new("V7_AO_ENV")
        world.use_nodes = True
        scene.world = world
    bg = scene.world.node_tree.nodes.get("Background")
    if bg is not None:
        bg.inputs[0].default_value = (1.0, 1.0, 1.0, 1.0)
        bg.inputs[1].default_value = 1.0

    report = {}
    for role, material_name in ROLE_MATERIALS.items():
        material = bpy.data.materials.get(material_name)
        image = bpy.data.images.get(f"{role}_orm.png")
        if material is None or image is None:
            continue
        meshes = [
            obj for obj in bpy.data.objects
            if obj.type == "MESH"
            and not obj.hide_render
            and not obj.hide_get()
            and "COLLISION" not in obj.name.upper()
            and any(slot and slot.name == material_name for slot in obj.data.materials)
        ]
        if not meshes:
            continue
        width, height = int(image.size[0]), int(image.size[1])
        bake_image = bpy.data.images.new(f"V7_AO_{role}", width=width, height=height, alpha=False)
        bake_image.colorspace_settings.name = "Non-Color"
        bake_image.generated_color = (1.0, 1.0, 1.0, 1.0)
        nodes = material.node_tree.nodes
        links = material.node_tree.links
        image_node = nodes.new("ShaderNodeTexImage")
        image_node.image = bake_image
        image_node.select = True
        nodes.active = image_node
        bpy.ops.object.select_all(action="DESELECT")
        for obj in meshes:
            obj.hide_set(False)
            obj.hide_viewport = False
            obj.select_set(True)
        bpy.context.view_layer.objects.active = meshes[0]
        try:
            bpy.ops.object.bake(type="AO")
            pixels = np.empty(width * height * 4, dtype=np.float32)
            bake_image.pixels.foreach_get(pixels)
            ao = pixels.reshape((height, width, 4))[:, :, 0]
            composite_ao_into_orm(bpy, role, ao)
            report[role] = {
                "meshCount": len(meshes),
                "aoMean": float(np.mean(ao)),
                "aoStd": float(np.std(ao)),
                "aoMin": float(np.min(ao)),
            }
        except Exception as error:
            report[role] = {"meshCount": len(meshes), "error": str(error)}
        nodes.remove(image_node)
        bpy.data.images.remove(bake_image)
        bpy.ops.object.select_all(action="DESELECT")
    return report


SKIP_UNIQUE_BAKE = {
    "Material_Emissive_Cyan",
    "Material_Emissive_DriveCore",
    "Material_Emissive_Orange",
    "Material_Glass_Canopy",
    "Material_V6_MarkingIvory",
}


def _principled(material: bpy.types.Material):
    if not material or not material.node_tree:
        return None
    return next((node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED"), None)


def _bake_image(name: str, size: int, colorspace: str) -> bpy.types.Image:
    image = bpy.data.images.new(name, width=size, height=size, alpha=True)
    image.colorspace_settings.name = colorspace
    image.generated_color = (0.5, 0.5, 1.0, 1.0) if "normal" in name else (1.0, 1.0, 1.0, 1.0)
    return image


def _set_active_image(material: bpy.types.Material, image: bpy.types.Image) -> bpy.types.Node:
    nodes = material.node_tree.nodes
    node = nodes.new("ShaderNodeTexImage")
    node.image = image
    node.select = True
    nodes.active = node
    return node


def transfer_bake_joined_meshes(collection: bpy.types.Collection, samples: int) -> list[dict]:
    """Bake unique AO/albedo/normals onto joined LOD meshes so construction reads in-game.

    Shared tileable role maps cannot hold mesh AO. Each joined draw gets unique UVs and
    a transferred unique map set.
    """
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = max(4, samples)
    scene.render.bake.use_selected_to_active = True
    scene.render.bake.cage_extrusion = 0.05
    scene.render.bake.margin = 8
    scene.render.bake.use_clear = True
    scene.render.bake.use_pass_direct = True
    scene.render.bake.use_pass_indirect = True
    scene.render.bake.use_pass_color = True
    reports = []
    meshes = [
        obj for obj in list(collection.objects)
        if obj.type == "MESH"
        and "COLLISION" not in obj.name.upper()
        and obj.data.materials
        and obj.data.materials[0]
        and obj.data.materials[0].name not in SKIP_UNIQUE_BAKE
        and len(obj.data.polygons) >= 8
    ]
    for obj in meshes:
        reports.append(_transfer_bake_one(obj, collection))
    scene.render.bake.use_selected_to_active = False
    return reports


def _transfer_bake_one(obj: bpy.types.Object, collection: bpy.types.Collection) -> dict:
    original = obj.data.materials[0]
    size = 1024 if len(obj.data.polygons) >= 400 else 512
    src = obj.copy()
    src.data = obj.data.copy()
    src.name = f"_BAKESRC_{obj.name[-40:]}"
    collection.objects.link(src)
    src.hide_render = False
    src.hide_set(False)
    report = {"object": obj.name, "material": original.name, "size": size}
    try:
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.smart_project(angle_limit=1.151917, island_margin=0.006, scale_to_bounds=True)
        bpy.ops.object.mode_set(mode="OBJECT")

        unique = original.copy()
        unique.name = f"{original.name}_{obj.name[-24:]}"
        unique.use_nodes = True
        obj.data.materials.clear()
        obj.data.materials.append(unique)

        diffuse = _bake_image(f"{obj.name}_albedo", size, "sRGB")
        normal = _bake_image(f"{obj.name}_normal", size, "Non-Color")
        ao = _bake_image(f"{obj.name}_ao", size, "Non-Color")
        rough = _bake_image(f"{obj.name}_rough", size, "Non-Color")

        def bake(image, bake_type):
            node = _set_active_image(unique, image)
            bpy.ops.object.select_all(action="DESELECT")
            src.select_set(True)
            obj.select_set(True)
            bpy.context.view_layer.objects.active = obj
            if bake_type == "DIFFUSE":
                bpy.ops.object.bake(type=bake_type, pass_filter={"COLOR"})
            else:
                bpy.ops.object.bake(type=bake_type)
            unique.node_tree.nodes.remove(node)

        bake(ao, "AO")
        bake(diffuse, "DIFFUSE")
        bake(normal, "NORMAL")
        bake(rough, "ROUGHNESS")

        ao_pixels = np.empty(size * size * 4, dtype=np.float32)
        rough_pixels = np.empty(size * size * 4, dtype=np.float32)
        ao.pixels.foreach_get(ao_pixels)
        rough.pixels.foreach_get(rough_pixels)
        ao_r = np.clip(ao_pixels.reshape((size, size, 4))[:, :, 0], 0.0, 1.0)
        # Remap crushed bakes into a readable occlusion range.
        ao_lo, ao_hi = float(np.percentile(ao_r, 5)), float(np.percentile(ao_r, 95))
        if ao_hi - ao_lo > 1e-4:
            ao_r = np.clip((ao_r - ao_lo) / (ao_hi - ao_lo), 0.0, 1.0)
        ao_r = 0.42 + 0.58 * ao_r
        rough_g = np.clip(rough_pixels.reshape((size, size, 4))[:, :, 0], 0.12, 0.96)
        metallic = 0.0
        shader = _principled(original)
        if shader and "Metallic" in shader.inputs:
            metallic = float(shader.inputs["Metallic"].default_value)
        orm_rgba = np.ones((size, size, 4), dtype=np.float32)
        orm_rgba[:, :, 0] = ao_r
        orm_rgba[:, :, 1] = rough_g
        orm_rgba[:, :, 2] = metallic
        orm = _bake_image(f"{obj.name}_orm", size, "Non-Color")
        orm.pixels.foreach_set(orm_rgba.reshape(-1))
        orm.update()
        orm.pack()
        diffuse.pack()
        normal.pack()

        nodes = unique.node_tree.nodes
        links = unique.node_tree.links
        for node in list(nodes):
            if node.type not in {"BSDF_PRINCIPLED", "OUTPUT_MATERIAL"}:
                nodes.remove(node)
        shader = _principled(unique)
        output = next(node for node in nodes if node.type == "OUTPUT_MATERIAL")
        tex_base = nodes.new("ShaderNodeTexImage")
        tex_base.image = diffuse
        tex_orm = nodes.new("ShaderNodeTexImage")
        tex_orm.image = orm
        tex_orm.image.colorspace_settings.name = "Non-Color"
        tex_n = nodes.new("ShaderNodeTexImage")
        tex_n.image = normal
        tex_n.image.colorspace_settings.name = "Non-Color"
        nmap = nodes.new("ShaderNodeNormalMap")
        sep = nodes.new("ShaderNodeSeparateColor")
        links.new(tex_base.outputs["Color"], shader.inputs["Base Color"])
        links.new(tex_orm.outputs["Color"], sep.inputs["Color"])
        if "Metallic" in shader.inputs:
            links.new(sep.outputs["Blue"], shader.inputs["Metallic"])
        if "Roughness" in shader.inputs:
            links.new(sep.outputs["Green"], shader.inputs["Roughness"])
        links.new(tex_n.outputs["Color"], nmap.inputs["Color"])
        links.new(nmap.outputs["Normal"], shader.inputs["Normal"])
        if "Ambient Occlusion" in shader.inputs:
            links.new(sep.outputs["Red"], shader.inputs["Ambient Occlusion"])
        gltf_group = bpy.data.node_groups.get("glTF Material Output")
        if gltf_group is not None:
            group_node = nodes.new("ShaderNodeGroup")
            group_node.node_tree = gltf_group
            if "Occlusion" in group_node.inputs:
                links.new(sep.outputs["Red"], group_node.inputs["Occlusion"])
        links.new(shader.outputs["BSDF"], output.inputs["Surface"])
        unique["spaceface"] = {
            **dict(unique.get("spaceface") or {}),
            "uniqueMeshBake": True,
            "ormChannels": "R=AO,G=Roughness,B=Metallic",
        }
        report.update({
            "ok": True,
            "aoMean": float(np.mean(ao_r)),
            "aoStd": float(np.std(ao_r)),
            "roughMean": float(np.mean(rough_g)),
        })
    except Exception as error:
        report.update({"ok": False, "error": str(error)})
        try:
            bpy.ops.object.mode_set(mode="OBJECT")
        except Exception:
            pass
        obj.data.materials.clear()
        obj.data.materials.append(original)
        if src.data.uv_layers and obj.data.uv_layers:
            src_uv = np.empty(len(src.data.uv_layers.active.data) * 2, dtype=np.float32)
            src.data.uv_layers.active.data.foreach_get("uv", src_uv)
            obj.data.uv_layers.active.data.foreach_set("uv", src_uv)
    finally:
        mesh = src.data
        bpy.data.objects.remove(src, do_unlink=True)
        if mesh and getattr(mesh, "users", 1) == 0:
            bpy.data.meshes.remove(mesh)
        bpy.ops.object.select_all(action="DESELECT")
    return report


def main() -> int:
    args = parse_args()
    baseline = args.baseline.resolve()
    if not baseline.exists():
        raise RuntimeError(f"missing V6 production baseline: {baseline}")
    baseline_hash = sha256(baseline)
    generation = generation_contract(baseline_hash)
    evidence = FAMILY / "evidence" / "hitch_polish_v7"
    evidence.mkdir(parents=True, exist_ok=True)
    report_path = evidence / "build_report.json"
    report_path.write_text(json.dumps({
        "schema": "spaceface.hitchPolishV7.build.v1",
        "status": "building",
        "generationFingerprint": generation["generationFingerprint"],
        "candidateOnly": True,
        "livePromotion": False,
    }, indent=2) + "\n", encoding="utf-8")

    bpy.ops.wm.open_mainfile(filepath=str(baseline))
    source = bpy.data.collections.get("KESTREL_V4_PRODUCTION_SOURCE")
    if source is None:
        raise RuntimeError("KESTREL_V4_PRODUCTION_SOURCE missing")
    canonical_collision_bounds = visible_bounds(source)
    surface_remaster = apply_to_blender_images(bpy)
    decal_pbr_roles = ensure_decal_pbr_roles()
    polish = apply_hitch_polish_v7()
    ao_report = {}
    socket_contract = enforce_socket_contract()
    visible_bounds_v7 = visible_bounds(source)
    root = bpy.data.objects.get("SF_K0_BORROWED_TIME_ROOT")
    if root is None:
        raise RuntimeError("source root missing")
    asset = dict(root.get("spacefaceAsset") or {})
    asset.update({
        "packet": PACKET,
        "polishPassId": PASS_ID,
        "surfaceRemasterId": REMASTER_ID,
        "wiringStatus": "isolated_candidate_no_promote",
        "generationFingerprint": generation["generationFingerprint"],
    })
    root["spacefaceAsset"] = asset
    final_blend = FAMILY / "blender" / "kestrel_hitch_polish_v7_production.blend"
    final_output_dir = FAMILY / "source_candidates" / "hitch_polish_v7" / "wholeships"
    with tempfile.TemporaryDirectory(prefix="spaceface-hitch-v7-") as staging_raw:
        staging = Path(staging_raw)
        staged_blend, production_visibility = save_candidate_blend(source, staging / final_blend.name)
        for obj in list(bpy.data.objects):
            if obj.name in REQUIRED_SOCKETS or obj.name in RIG_NAMES:
                obj.name = f"_SOURCE_{obj.name}"
        staged_output_dir = staging / "wholeships"
        reports = []
        staged_outputs = []
        final_outputs = []
        for lod in (0, 1, 2):
            collection, report = create_lod(
                source, lod, canonical_collision_bounds, generation["generationFingerprint"],
            )
            unique_bake = [] if args.skip_unique_bake else transfer_bake_joined_meshes(
                collection, args.ao_samples,
            )
            staged_output = export_lod(collection, lod, staged_output_dir)
            final_output = final_output_dir / staged_output.name
            report.update({
                "path": str(final_output.relative_to(FAMILY)).replace("\\", "/"),
                "bytes": staged_output.stat().st_size,
                "sha256": sha256(staged_output),
                "generationFingerprint": generation["generationFingerprint"],
                "uniqueBake": unique_bake,
            })
            publish_file(staged_output, final_output)
            reports.append(report)
            staged_outputs.append(staged_output)
            final_outputs.append(final_output)
            remove_collection(collection)
        result = {
            "schema": "spaceface.hitchPolishV7.build.v1",
            "status": "complete",
            "packet": PACKET,
            "baseline": str(baseline.relative_to(FAMILY)).replace("\\", "/"),
            "baselineSha256": baseline_hash,
            "generation": generation,
            "generationFingerprint": generation["generationFingerprint"],
            "polishPassId": PASS_ID,
            "surfaceRemasterId": REMASTER_ID,
            "surfaceRemaster": surface_remaster,
            "polish": polish,
            "meshAo": ao_report,
            "decalPbrRoles": decal_pbr_roles,
            "socketContract": socket_contract,
            "canonicalCollisionBoundsBlenderXYZ": canonical_collision_bounds,
            "visibleBoundsBlenderXYZ": visible_bounds_v7,
            "productionBlend": str(final_blend.relative_to(FAMILY)).replace("\\", "/"),
            "productionBlendBytes": staged_blend.stat().st_size,
            "productionBlendSha256": sha256(staged_blend),
            "productionBlendCollectionVisibility": production_visibility,
            "lods": reports,
            "outputs": [str(path.relative_to(FAMILY)).replace("\\", "/") for path in final_outputs],
            "candidateOnly": True,
            "livePromotion": False,
        }
        staged_report = staging / report_path.name
        staged_report.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
        publish_file(staged_blend, final_blend)
        for staged_output, final_output in zip(staged_outputs, final_outputs, strict=True):
            publish_file(staged_output, final_output)
        publish_file(staged_report, report_path)
    print("HITCH_POLISH_V7_BUILD_REPORT=" + json.dumps({
        "fingerprint": result["generationFingerprint"],
        "lods": [{"lod": row["lod"], "triangles": row["triangles"], "draws": row["draws"]} for row in reports],
        "hooks": polish["hooks"],
        "aoRoles": list(ao_report),
    }))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
