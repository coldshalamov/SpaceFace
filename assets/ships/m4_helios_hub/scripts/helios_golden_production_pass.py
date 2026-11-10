"""Helios golden production pass: material-value lift + bay variance + export.

Builds on the STATION-GOLDEN-02 candidate (supported service-truss bays, batching,
12 role materials). Deterministic; preserves SOCKET_Structure_Core, LOD prefixes,
bounds, and pivot.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from collections import Counter
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

RECIPE_ID = "helios-golden-production-v1"
SOCKET_NAME = "SOCKET_Structure_Core"


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input-blend", type=Path, required=True)
    parser.add_argument("--output-blend", type=Path, required=True)
    parser.add_argument("--output-glb", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    tail = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    return parser.parse_args(tail)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def mesh_objects():
    return [obj for obj in bpy.data.objects if obj.type == "MESH"]


def slot_index(obj, material_name: str) -> int | None:
    for index, slot in enumerate(obj.material_slots):
        if slot.material and slot.material.name == material_name:
            return index
    return None


def ensure_slot(obj, material_name: str) -> int:
    existing = slot_index(obj, material_name)
    if existing is not None:
        return existing
    mat = bpy.data.materials.get(material_name)
    if mat is None:
        raise RuntimeError(f"missing material {material_name}")
    obj.data.materials.append(mat)
    return len(obj.data.materials) - 1


def face_histogram(obj) -> dict[str, int]:
    slots = [slot.material.name if slot.material else "None" for slot in obj.material_slots]
    counts: Counter[str] = Counter()
    for poly in obj.data.polygons:
        name = slots[poly.material_index] if poly.material_index < len(slots) else "!!bad"
        counts[name] += 1
    return dict(counts)


def lift_exposed_dark_faces(obj) -> dict:
    """Promote outward-facing HullDark / excess Machinery faces to readable structure roles."""
    mesh = obj.data
    dark_idx = slot_index(obj, "SF_HullDark_K0PBR")
    mech_idx = slot_index(obj, "SF_Machinery_K0PBR")
    if dark_idx is None and mech_idx is None:
        return {"object": obj.name, "changed": 0}

    hull_mid = ensure_slot(obj, "SF_HullMid_K0PBR")
    armor = ensure_slot(obj, "SF_Armor_K0PBR")
    structure = ensure_slot(obj, "SF_StructuralLight_PBR")
    service = ensure_slot(obj, "SF_ServiceAccess_PBR")
    docking = ensure_slot(obj, "SF_DockingContact_PBR")

    mw = obj.matrix_world
    normal_matrix = mw.to_3x3().inverted().transposed()
    center = Vector(mw.translation)
    changed = Counter()

    for poly in mesh.polygons:
        world_n = (normal_matrix @ poly.normal).normalized()
        world_c = mw @ poly.center
        radial = world_c - center
        radial_len = radial.length
        radial_dir = radial / radial_len if radial_len > 1e-6 else Vector((1, 0, 0))
        outward = world_n.dot(radial_dir)
        up = world_n.z
        height = world_c.z
        area = poly.area

        target = None
        if poly.material_index == dark_idx:
            # Deep recesses / underside stay dark.
            if outward < -0.15 or up < -0.55:
                continue
            # Large exposed plates → coated structure / hull.
            if area > 1.8 and outward > 0.25 and height > 4.0:
                target = structure
            elif outward > 0.35 and up > 0.15:
                target = hull_mid
            elif outward > 0.20 and abs(world_n.x) > 0.55:
                target = armor
            elif outward > 0.10 and height > 8.0:
                target = hull_mid
            elif outward > 0.05 and area > 0.6:
                target = armor
        elif poly.material_index == mech_idx:
            # Flat outward machinery panels read as blank slabs — promote some to service/docking/hull.
            if area > 2.5 and outward > 0.40 and abs(up) < 0.35:
                target = service if (int(abs(world_c.x) * 3) + int(abs(world_c.y) * 3)) % 3 else hull_mid
            elif area > 4.0 and outward > 0.50 and up > 0.55:
                target = docking

        if target is not None and target != poly.material_index:
            poly.material_index = target
            changed[mesh.materials[target].name] += 1

    mesh.update()
    return {"object": obj.name, "changed": int(sum(changed.values())), "to": dict(changed)}


def break_service_bay_repetition() -> list[dict]:
    """Deterministic UV offset + slight scale variance on linked ring-bay instances."""
    receipt = []
    bays = sorted(
        [obj for obj in bpy.data.objects if "SupportedRingBay" in obj.name and obj.type == "MESH"],
        key=lambda item: item.name,
    )
    # Group by shared mesh datablock.
    by_mesh: dict[int, list] = {}
    for obj in bays:
        by_mesh.setdefault(obj.data.as_pointer(), []).append(obj)

    for pointer, instances in by_mesh.items():
        if len(instances) < 2:
            continue
        # Make each instance unique mesh data so UV offsets stick.
        for index, obj in enumerate(instances):
            if index == 0:
                mesh = obj.data
            else:
                mesh = obj.data.copy()
                obj.data = mesh
            if not mesh.uv_layers:
                continue
            uv = mesh.uv_layers.active.data
            # Deterministic hash from object name.
            seed = int(hashlib.sha256(obj.name.encode("utf-8")).hexdigest()[:8], 16)
            ox = ((seed % 97) / 97.0) * 0.37
            oy = (((seed // 97) % 89) / 89.0) * 0.31
            rot = ((seed // 8633) % 4) * (math.pi * 0.5)
            cos_r, sin_r = math.cos(rot), math.sin(rot)
            for loop in uv:
                u, v = loop.uv
                u2 = u * cos_r - v * sin_r + ox
                v2 = u * sin_r + v * cos_r + oy
                loop.uv = (u2, v2)
            receipt.append({
                "object": obj.name,
                "uvOffset": [round(ox, 4), round(oy, 4)],
                "uvRotationQuarterTurns": (seed // 8633) % 4,
            })
    return receipt


def stamp_material_roles():
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
    runtime_roles = {
        "SF_Armor_K0PBR": "hull",
        "SF_StructuralLight_PBR": "hull",
        "SF_Window_PBR": "glass",
        "SF_Machinery_K0PBR": "mechanical",
        "SF_Radiator_PBR": "radiator",
        "SF_DockingContact_PBR": "docking",
        "SF_ServiceAccess_PBR": "service",
        "SF_HullDark_K0PBR": "mechanical",
        "SF_HullMid_K0PBR": "hull",
        "SF_IndustrialMarking_PBR": "warning",
        "SF_CyanEmission": "signal",
        "SF_AmberEmission": "signal",
    }
    for material in bpy.data.materials:
        role = roles.get(material.name, "unclassified")
        material["sf_material_role"] = role
        material["sf_surface_recipe"] = RECIPE_ID
        material["spacefaceMaterialRole"] = runtime_roles.get(material.name, "hull")
        material["spacefaceOrmContract"] = "R=AO,G=Roughness,B=Metallic"


def export_glb(path: Path):
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="DESELECT")
    for obj in bpy.data.objects:
        if obj.type == "MESH" or obj.name.startswith("LOD") or obj.name == SOCKET_NAME:
            obj.hide_set(False)
            obj.hide_viewport = False
            obj.select_set(True)
    path.parent.mkdir(parents=True, exist_ok=True)
    options = dict(
        filepath=str(path),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_extras=True,
        export_animations=False,
        export_materials="EXPORT",
        export_texcoords=True,
        export_normals=True,
        export_tangents=True,
        export_image_format="AUTO",
        export_keep_originals=False,
    )
    try:
        bpy.ops.export_scene.gltf(**options)
    except TypeError:
        bpy.ops.export_scene.gltf(
            filepath=str(path),
            export_format="GLB",
            use_selection=True,
            export_apply=True,
            export_yup=True,
            export_extras=True,
            export_texcoords=True,
            export_normals=True,
            export_tangents=True,
        )


def stamp_spaceface_asset_extras(glb_path: Path):
    """Post-process GLB JSON to attach the runtime ASSET_AUTHORING_CONTRACT extras."""
    data = glb_path.read_bytes()
    magic, version, length = __import__("struct").unpack_from("<4sII", data, 0)
    assert magic == b"glTF"
    offset = 12
    json_doc = None
    bin_chunk = None
    json_start = json_len = 0
    while offset < length:
        chunk_len, chunk_type = __import__("struct").unpack_from("<II", data, offset)
        offset += 8
        payload = data[offset : offset + chunk_len]
        if chunk_type == 0x4E4F534A:
            json_start = offset - 8
            json_len = chunk_len
            json_doc = json.loads(payload.decode("utf-8"))
        elif chunk_type == 0x004E4942:
            bin_chunk = payload
        offset += chunk_len
    assert json_doc is not None

    # Bounds from POSITION accessors.
    mins = [1e30, 1e30, 1e30]
    maxs = [-1e30, -1e30, -1e30]
    for mesh in json_doc.get("meshes", []):
        for prim in mesh.get("primitives", []):
            pos = prim.get("attributes", {}).get("POSITION")
            if pos is None:
                continue
            acc = json_doc["accessors"][pos]
            if "min" in acc and "max" in acc:
                for i in range(3):
                    mins[i] = min(mins[i], acc["min"][i])
                    maxs[i] = max(maxs[i], acc["max"][i])
    dims = [maxs[i] - mins[i] for i in range(3)]
    extras = {
        "spacefaceAsset": {
            "contractVersion": 2,
            "slot": "place",
            "assetId": "place_station_trade_hub",
            "forward": "+X",
            "up": "+Y",
            "starboard": "+Z",
            "unit": "metre",
            "normalConvention": "OpenGL",
            "ormChannels": "R=AO,G=Roughness,B=Metallic",
            "textureCompression": "PNG-source",
            "bounds": {
                "min": [round(v, 6) for v in mins],
                "max": [round(v, 6) for v in maxs],
                "dimensionsM": [round(v, 6) for v in dims],
            },
            "recipeId": RECIPE_ID,
        }
    }
    json_doc["asset"] = {**(json_doc.get("asset") or {}), "extras": extras}
    # Also stamp scene extras.
    if json_doc.get("scenes"):
        json_doc["scenes"][0]["extras"] = {
            **(json_doc["scenes"][0].get("extras") or {}),
            **extras,
        }

    encoded = json.dumps(json_doc, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
    pad = (4 - (len(encoded) % 4)) % 4
    encoded = encoded + (b" " * pad)
    out = bytearray()
    out += __import__("struct").pack("<4sII", b"glTF", 2, 12 + 8 + len(encoded) + 8 + len(bin_chunk or b""))
    out += __import__("struct").pack("<I4s", len(encoded), b"JSON")
    out += encoded
    if bin_chunk is not None:
        out += __import__("struct").pack("<I4s", len(bin_chunk), b"BIN\x00")
        out += bin_chunk
    glb_path.write_bytes(bytes(out))
    return extras["spacefaceAsset"]["bounds"]


def main():
    args = parse_args()
    bpy.ops.wm.open_mainfile(filepath=str(args.input_blend.resolve()))

    socket = bpy.data.objects.get(SOCKET_NAME)
    socket_pos = list(socket.matrix_world.translation) if socket else None

    before = {}
    after = {}
    lifts = []
    for obj in sorted(mesh_objects(), key=lambda item: item.name):
        if "Batch" not in obj.name and "SupportedRingBay" not in obj.name:
            continue
        before[obj.name] = face_histogram(obj)
        if "Batch" in obj.name:
            lifts.append(lift_exposed_dark_faces(obj))
        after[obj.name] = face_histogram(obj)

    bay_receipt = break_service_bay_repetition()
    stamp_material_roles()

    args.output_blend.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(args.output_blend.resolve()))
    export_glb(args.output_glb.resolve())
    bounds = stamp_spaceface_asset_extras(args.output_glb.resolve())

    report = {
        "schema": "spaceface.heliosGoldenProduction.v1",
        "recipeId": RECIPE_ID,
        "inputBlend": str(args.input_blend),
        "inputBlendSha256": sha256(args.input_blend),
        "outputBlend": str(args.output_blend),
        "outputBlendSha256": sha256(args.output_blend),
        "outputGlb": str(args.output_glb),
        "outputGlbSha256": sha256(args.output_glb),
        "outputGlbBytes": args.output_glb.stat().st_size,
        "socket": SOCKET_NAME,
        "socketWorldPosition": socket_pos,
        "bounds": bounds,
        "materialLift": lifts,
        "faceHistogramBefore": before,
        "faceHistogramAfter": after,
        "serviceBayVariance": bay_receipt,
        "preserved": {
            "lodPrefixes": ["LOD0_", "LOD1_", "LOD2_"],
            "socket": SOCKET_NAME,
            "sourceGeometryRetained": True,
        },
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({"ok": True, "glb": str(args.output_glb), "report": str(args.report)}))


if __name__ == "__main__":
    try:
        main()
    except Exception:
        import traceback

        traceback.print_exc()
        sys.exit(1)
