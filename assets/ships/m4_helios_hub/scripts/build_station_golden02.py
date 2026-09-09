import argparse
import hashlib
import json
import math
import re
import sys
from collections import Counter
from pathlib import Path

import bpy
from mathutils import Vector


RECIPE_ID = "station-golden-02"
LOD_RE = re.compile(r"^(LOD[012])_")
CURVED_TOKENS = (
    "perimeter", "citadel", "habitat", "collar", "radiatorfeed", "radiatormanifold",
    "utilitypipe", "pipeclamp", "rail", "ladderrail", "manifold", "window",
)


def args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--blend", required=True)
    parser.add_argument("--glb", required=True)
    parser.add_argument("--report", required=True)
    tail = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    return parser.parse_args(tail)


def sha256(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def reset_scene():
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)


def bounds(objects):
    points = []
    for obj in objects:
        if obj.type != "MESH" or not obj.data.vertices or obj.name.startswith("COLLISION_"):
            continue
        points.extend(obj.matrix_world @ Vector(corner) for corner in obj.bound_box)
    lo = Vector((min(p.x for p in points), min(p.y for p in points), min(p.z for p in points)))
    hi = Vector((max(p.x for p in points), max(p.y for p in points), max(p.z for p in points)))
    return {
        "min": [round(v, 6) for v in lo],
        "max": [round(v, 6) for v in hi],
        "dimensions": [round(v, 6) for v in hi - lo],
        "center": [round(v, 6) for v in (hi + lo) * 0.5],
    }


def geometry_counts(objects):
    counts = Counter()
    unique = set()
    for obj in objects:
        if obj.type != "MESH":
            continue
        mesh = obj.data
        unique.add(mesh.as_pointer())
        counts.update(
            meshObjects=1,
            vertices=len(mesh.vertices),
            edges=len(mesh.edges),
            polygons=len(mesh.polygons),
            materialPrimitives=max(1, len({p.material_index for p in mesh.polygons})),
        )
    counts["uniqueMeshDatablocks"] = len(unique)
    counts["instancedMeshObjects"] = counts["meshObjects"] - len(unique)
    return dict(counts)


def set_input(node, name, value):
    socket = node.inputs.get(name)
    if socket is None:
        return False
    socket.default_value = value
    return True


def retune_materials():
    profiles = {
        "SF_Armor_K0PBR": {"Coat Weight": 0.14, "Coat Roughness": 0.36},
        "SF_StructuralLight_PBR": {"Coat Weight": 0.20, "Coat Roughness": 0.30},
        "SF_Window_PBR": {
            "Coat Weight": 0.38, "Coat Roughness": 0.14, "Transmission Weight": 0.08, "IOR": 1.48,
        },
        "SF_Machinery_K0PBR": {"Anisotropic IOR Level": 0.22},
        "SF_Radiator_PBR": {"Anisotropic IOR Level": 0.34},
        "SF_DockingContact_PBR": {"Anisotropic IOR Level": 0.16},
    }
    roles = {
        "SF_Armor_K0PBR": "coated_armor",
        "SF_StructuralLight_PBR": "coated_structure",
        "SF_Window_PBR": "inhabited_glazing",
        "SF_Machinery_K0PBR": "exposed_alloy_machinery",
        "SF_Radiator_PBR": "thermal_radiator",
        "SF_DockingContact_PBR": "docking_contact_wear",
        "SF_ServiceAccess_PBR": "service_access",
        "SF_HullDark_K0PBR": "dark_recess_structure",
        "SF_HullMid_K0PBR": "coated_hull",
        "SF_IndustrialMarking_PBR": "nonemissive_wayfinding",
        "SF_CyanEmission": "bounded_cyan_signal",
        "SF_AmberEmission": "bounded_amber_signal",
    }
    receipt = []
    for material in sorted(bpy.data.materials, key=lambda item: item.name):
        material["sf_material_role"] = roles.get(material.name, "unclassified")
        material["sf_surface_recipe"] = RECIPE_ID
        changes = {}
        if material.use_nodes and material.node_tree:
            principled = next((node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED"), None)
            if principled:
                for key, value in profiles.get(material.name, {}).items():
                    if set_input(principled, key, value):
                        changes[key] = value
        receipt.append({"material": material.name, "role": material["sf_material_role"], "changes": changes})
    return receipt


def stabilize_curved_shading(objects):
    receipt = []
    for obj in sorted(objects, key=lambda item: item.name):
        if obj.type != "MESH" or not any(token in obj.name.lower() for token in CURVED_TOKENS):
            continue
        changed = 0
        for polygon in obj.data.polygons:
            if not polygon.use_smooth:
                polygon.use_smooth = True
                changed += 1
        if changed:
            obj.data.update()
            receipt.append({"object": obj.name, "smoothedPolygons": changed})
    return receipt


def compact_material_slots(obj):
    mesh = obj.data
    old = list(mesh.materials)
    if not old:
        return 0
    unique = []
    remap = {}
    by_pointer = {}
    for index, material in enumerate(old):
        key = material.as_pointer() if material else 0
        if key not in by_pointer:
            by_pointer[key] = len(unique)
            unique.append(material)
        remap[index] = by_pointer[key]
    polygon_indices = [remap.get(poly.material_index, 0) for poly in mesh.polygons]
    mesh.materials.clear()
    for material in unique:
        if material:
            mesh.materials.append(material)
    for polygon, material_index in zip(mesh.polygons, polygon_indices):
        polygon.material_index = material_index
    return len(old) - len(unique)


def group_key(obj):
    match = LOD_RE.match(obj.name)
    return match.group(1) if match else "COMMON"


def join_group(objects, target_name):
    source_names = sorted(obj.name for obj in objects)
    bpy.ops.object.select_all(action="DESELECT")
    ordered = sorted(objects, key=lambda item: item.name)
    active = ordered[0]
    for obj in ordered:
        obj.hide_set(False)
        obj.hide_viewport = False
        obj.select_set(True)
    bpy.context.view_layer.objects.active = active
    bpy.ops.object.join()
    active.name = target_name
    active.data.name = f"{target_name}_Mesh"
    removed_slots = compact_material_slots(active)
    active["sf_batch_recipe"] = RECIPE_ID
    active["sf_source_object_count"] = len(source_names)
    active["sf_source_name_sha256"] = hashlib.sha256("\n".join(source_names).encode("utf-8")).hexdigest()
    active["sf_visual_policy"] = "preserve all geometry; consolidate by runtime LOD"
    active.data.validate(clean_customdata=False)
    active.data.update()
    return active, {
        "target": target_name,
        "sourceObjectCount": len(source_names),
        "sourceNameSha256": active["sf_source_name_sha256"],
        "removedDuplicateMaterialSlots": removed_slots,
        "materials": [material.name for material in active.data.materials],
        "vertices": len(active.data.vertices),
        "polygons": len(active.data.polygons),
    }


def add_box(verts, faces, material_indices, center, dimensions, material_index, yaw=0.0):
    cx, cy, cz = center
    dx, dy, dz = (value * 0.5 for value in dimensions)
    c, s = math.cos(yaw), math.sin(yaw)
    base = [
        (-dx, -dy, -dz), (dx, -dy, -dz), (dx, dy, -dz), (-dx, dy, -dz),
        (-dx, -dy, dz), (dx, -dy, dz), (dx, dy, dz), (-dx, dy, dz),
    ]
    start = len(verts)
    for x, y, z in base:
        verts.append((cx + x * c - y * s, cy + x * s + y * c, cz + z))
    for face in ((0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)):
        faces.append(tuple(start + index for index in face))
        material_indices.append(material_index)


def add_beam_xy(verts, faces, material_indices, a, b, width, height, z, material_index):
    ax, ay = a
    bx, by = b
    length = math.hypot(bx - ax, by - ay)
    yaw = math.atan2(by - ay, bx - ax)
    add_box(
        verts, faces, material_indices,
        ((ax + bx) * 0.5, (ay + by) * 0.5, z),
        (length, width, height), material_index, yaw,
    )


def add_box_projected_uvs(mesh, scale=0.28):
    """Create stable per-loop UV0 for the generated service-bay hard surface."""
    if mesh.uv_layers:
        uv_layer = mesh.uv_layers.active
    else:
        uv_layer = mesh.uv_layers.new(name="UVMap")
    mesh.calc_loop_triangles()
    for polygon in mesh.polygons:
        nx, ny, nz = (abs(component) for component in polygon.normal)
        for loop_index in polygon.loop_indices:
            vertex = mesh.vertices[mesh.loops[loop_index].vertex_index].co
            if nx >= ny and nx >= nz:
                uv = (vertex.y * scale, vertex.z * scale)
            elif ny >= nx and ny >= nz:
                uv = (vertex.x * scale, vertex.z * scale)
            else:
                uv = (vertex.x * scale, vertex.y * scale)
            uv_layer.data[loop_index].uv = uv
    mesh.update()


def build_supported_ring_bay(materials):
    verts, faces, material_indices = [], [], []
    add_box(verts, faces, material_indices, (36.8, 0.0, 0.15), (10.4, 0.55, 0.55), 0)
    add_box(verts, faces, material_indices, (32.2, 0.0, 0.4), (0.5, 3.2, 0.5), 0)
    add_box(verts, faces, material_indices, (41.4, 0.0, 0.4), (0.5, 3.2, 0.5), 0)
    add_beam_xy(verts, faces, material_indices, (32.3, -1.25), (41.3, 0.0), 0.28, 0.32, -0.1, 0)
    add_beam_xy(verts, faces, material_indices, (32.3, 1.25), (41.3, 0.0), 0.28, 0.32, -0.1, 0)
    add_box(verts, faces, material_indices, (36.8, -1.05, -0.05), (2.6, 0.52, 0.34), 1)
    add_box(verts, faces, material_indices, (36.8, 1.05, -0.05), (2.6, 0.52, 0.34), 1)
    add_box(verts, faces, material_indices, (39.3, 0.0, 0.48), (1.8, 1.5, 0.18), 2)
    mesh = bpy.data.meshes.new("SFG02_SupportedRingBay_Mesh")
    mesh.from_pydata(verts, [], faces)
    for material in materials:
        mesh.materials.append(material)
    for polygon, index in zip(mesh.polygons, material_indices):
        polygon.material_index = index
        polygon.use_smooth = False
    mesh.validate(clean_customdata=False)
    mesh.update()
    base = bpy.data.objects.new("LOD0_SFG02_SupportedRingBay_00", mesh)
    bpy.context.scene.collection.objects.link(base)
    base["sf_functional_zone"] = "perimeter_service_support"
    base["sf_lod_membership"] = "lod0,lod1"
    base["sf_recipe"] = RECIPE_ID
    bevel = base.modifiers.new("SFG02_PhysicalEdgeBevel", "BEVEL")
    bevel.width = 0.055
    bevel.segments = 2
    bevel.limit_method = "ANGLE"
    bpy.context.view_layer.objects.active = base
    base.select_set(True)
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    base.select_set(False)
    add_box_projected_uvs(base.data)
    base["sf_uv_contract"] = "box-projected UV0; tangent-ready"

    instances = [base]
    for index in range(1, 16):
        obj = base.copy()
        obj.data = base.data
        obj.name = f"LOD0_SFG02_SupportedRingBay_{index:02d}"
        obj.rotation_euler[2] = math.tau * index / 16.0
        bpy.context.scene.collection.objects.link(obj)
        instances.append(obj)
    for index in range(8):
        obj = base.copy()
        obj.data = base.data
        obj.name = f"LOD1_SFG02_SupportedRingBay_{index:02d}"
        obj.rotation_euler[2] = math.tau * index / 8.0
        bpy.context.scene.collection.objects.link(obj)
        instances.append(obj)
    return instances


def export_glb(path):
    bpy.ops.object.select_all(action="DESELECT")
    selected = []
    for obj in bpy.context.scene.objects:
        if obj.type in {"MESH", "EMPTY"}:
            obj.hide_set(False)
            obj.hide_viewport = False
            obj.select_set(True)
            selected.append(obj)
    bpy.context.view_layer.objects.active = next(obj for obj in selected if obj.type == "MESH")
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(path), export_format="GLB", use_selection=True,
        export_apply=False, export_yup=True, export_extras=True, export_animations=False,
        export_materials="EXPORT", export_texcoords=True, export_normals=True,
        export_tangents=True, export_image_format="AUTO", export_keep_originals=False,
    )


def main():
    parsed = args()
    source = Path(parsed.input).resolve()
    blend_path = Path(parsed.blend).resolve()
    glb_path = Path(parsed.glb).resolve()
    report_path = Path(parsed.report).resolve()
    for path in (blend_path, glb_path, report_path):
        path.parent.mkdir(parents=True, exist_ok=True)

    reset_scene()
    bpy.ops.import_scene.gltf(filepath=str(source), import_shading="NORMALS")
    bpy.context.view_layer.update()
    original_objects = list(bpy.context.scene.objects)
    socket = bpy.data.objects.get("SOCKET_Structure_Core")
    if socket is None:
        raise RuntimeError("SOCKET_Structure_Core missing from immutable source")
    socket_before = [round(v, 6) for v in socket.matrix_world.translation]
    before = {
        "bounds": bounds(original_objects),
        "geometry": geometry_counts(original_objects),
        "objectCount": len(original_objects),
        "socket": socket_before,
    }

    material_receipt = retune_materials()
    smoothing_receipt = stabilize_curved_shading(original_objects)

    grouped = {"LOD0": [], "LOD1": [], "LOD2": [], "COMMON": []}
    protected = []
    for obj in list(bpy.context.scene.objects):
        if obj.type != "MESH":
            continue
        if obj.name.startswith("COLLISION_"):
            protected.append(obj)
            continue
        grouped[group_key(obj)].append(obj)

    join_receipt = []
    joined = []
    for key in ("LOD0", "LOD1", "LOD2", "COMMON"):
        if not grouped[key]:
            continue
        name = f"{key}_HeliosGolden02_Batch" if key != "COMMON" else "HeliosGolden02_CommonBatch"
        obj, receipt = join_group(grouped[key], name)
        joined.append(obj)
        join_receipt.append(receipt)

    machinery = bpy.data.materials.get("SF_Machinery_K0PBR")
    service = bpy.data.materials.get("SF_ServiceAccess_PBR")
    marking = bpy.data.materials.get("SF_IndustrialMarking_PBR")
    if not all((machinery, service, marking)):
        raise RuntimeError("required ring-support material roles missing")
    ring_instances = build_supported_ring_bay((machinery, service, marking))
    bpy.context.view_layer.update()

    socket_after = [round(v, 6) for v in socket.matrix_world.translation]
    if socket_before != socket_after:
        raise RuntimeError(f"socket moved: {socket_before} -> {socket_after}")
    after_objects = list(bpy.context.scene.objects)
    after = {
        "bounds": bounds(after_objects),
        "geometry": geometry_counts(after_objects),
        "objectCount": len(after_objects),
        "socket": socket_after,
    }
    for before_value, after_value in zip(before["bounds"]["dimensions"], after["bounds"]["dimensions"]):
        if after_value > before_value + 1e-3:
            raise RuntimeError(f"repair changed recognizable silhouette bounds: {before['bounds']} -> {after['bounds']}")

    bpy.context.scene["sf_asset_recipe"] = RECIPE_ID
    bpy.context.scene["sf_visual_acceptance"] = "unreviewed_requires_game_camera"
    bpy.context.scene["sf_source_sha256"] = sha256(source)
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path), check_existing=False)
    export_glb(glb_path)

    report = {
        "schema": "spaceface.stationGolden02.build.v1",
        "recipeId": RECIPE_ID,
        "status": "candidate_unreviewed",
        "source": {"path": str(source), "sha256": sha256(source), "bytes": source.stat().st_size},
        "candidateBlend": {"path": str(blend_path), "sha256": sha256(blend_path), "bytes": blend_path.stat().st_size},
        "candidateRawGlb": {"path": str(glb_path), "sha256": sha256(glb_path), "bytes": glb_path.stat().st_size},
        "before": before,
        "after": after,
        "materials": material_receipt,
        "smoothing": {
            "objectCount": len(smoothing_receipt),
            "polygonCount": sum(item["smoothedPolygons"] for item in smoothing_receipt),
            "objects": smoothing_receipt,
        },
        "batching": join_receipt,
        "linkedRingSupport": {
            "objectCount": len(ring_instances),
            "sharedMeshDatablocks": len({obj.data.as_pointer() for obj in ring_instances}),
            "lod0": sum(obj.name.startswith("LOD0_") for obj in ring_instances),
            "lod1": sum(obj.name.startswith("LOD1_") for obj in ring_instances),
            "purpose": "replace floating perimeter-block read with physically attached service truss bays",
        },
        "preservedContracts": {
            "socket": "SOCKET_Structure_Core",
            "socketWorldPosition": socket_after,
            "lodPrefixes": ["LOD0_", "LOD1_", "LOD2_"],
            "geometryPolicy": "all source geometry retained; only organization, curved shading, material response, and supported ring bays changed",
        },
        "visualAcceptance": False,
        "knownDefects": [
            "No new close/default/far/grazing/PBR-channel/wireframe/turntable evidence captured because the GPU lane was not granted.",
            "The window transmission and machinery/radiator anisotropy extensions require runtime-loader and game-camera review.",
            "Consolidation preserves LOD prefixes but removes per-piece node names; controller must confirm no external tooling treats those names as gameplay sockets.",
            "This candidate intentionally retains the source triangle count; a future bake/retopology pass should target duplicated high-density perimeter geometry only after matched visual proof.",
        ],
    }
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({
        "ok": True,
        "blend": report["candidateBlend"],
        "glb": report["candidateRawGlb"],
        "before": before["geometry"],
        "after": after["geometry"],
        "ringSupport": report["linkedRingSupport"],
    }))


if __name__ == "__main__":
    main()
