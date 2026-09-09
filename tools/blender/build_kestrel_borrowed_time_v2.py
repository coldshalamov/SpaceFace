#!/usr/bin/env python3
"""Build the isolated SF-K0 Borrowed Time V2 hero candidate.

This is a bounded adaptation of build_kestrel_borrowed_time.py. It consumes the
user-supplied editable revamp, adds a deliberate macro/meso silhouette pass, and
writes only assets/ships/kestrel_borrowed_time_v2/**. It never promotes live.
"""
from __future__ import annotations

import hashlib
import importlib.util
import json
import math
import os
import sys
import zipfile
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
FAMILY = ROOT / "assets" / "ships" / "kestrel_borrowed_time_v2"
PACKET = "PROFESSIONAL-KESTREL-BORROWED-TIME-V2-CODEX-001"
REVAMP_ZIP = Path(r"C:\Users\93rob\Downloads\SpaceFace_SF-K0_Borrowed-Time_Revamp.zip")
RUNTIME_ZIP = Path(r"C:\Users\93rob\Downloads\SpaceFace_SF-K0_Borrowed-Time_Runtime.zip")
CURRENT_RELEASE = ROOT / "assets" / "ships" / "release" / "parts" / "wholeships" / "kestrel.glb"


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest().upper()


def load_base():
    path = ROOT / "tools" / "blender" / "build_kestrel_borrowed_time.py"
    spec = importlib.util.spec_from_file_location("spaceface_kestrel_base", path)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


base = load_base()
base.PACKET = PACKET
base.ASSET_ID = "SF_WHOLESHIP_KESTREL_BORROWED_TIME_V2"
base.PART_ID = "wholeship_kestrel_borrowed_time_v2"
# The current release totals 28,864 triangles. This isolated hero candidate
# retains more of the authored near silhouette while keeping mid/far restrained.
base.LOD_RECIPES = (
    ("lod0", 2, 0.58, False),
    ("lod1", 1, 0.30, True),
    ("lod2", 0, 0.14, True),
)


def link_object(obj: bpy.types.Object) -> None:
    collection = bpy.data.collections.get("SOURCE_HERO_LOD0")
    if collection is None:
        collection = bpy.context.scene.collection
    if obj.name not in collection.objects:
        collection.objects.link(obj)


def assign(obj: bpy.types.Object, material_name: str, detail: int = 0) -> bpy.types.Object:
    material = bpy.data.materials.get(material_name)
    if material is None:
        raise RuntimeError(f"missing canonical material {material_name}")
    obj.data.materials.clear()
    obj.data.materials.append(material)
    obj["sf_detail_level"] = detail
    obj["sf_component"] = "hero_structure"
    obj["sf_v2_authored"] = True
    return obj


def bevel(obj: bpy.types.Object, width: float, segments: int = 2) -> None:
    modifier = obj.modifiers.new("V2_Production_Chamfer", "BEVEL")
    modifier.width = width
    modifier.segments = segments
    modifier.limit_method = "ANGLE"
    modifier.angle_limit = math.radians(28)


def box(name: str, location, scale, material: str, detail: int = 0,
        rotation=(0.0, 0.0, 0.0), bevel_width: float = 0.06) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bevel(obj, bevel_width)
    return assign(obj, material, detail)


def tapered_prism(name: str, x0: float, x1: float, y_center: float,
                  y0_half: float, y1_half: float, z0: float, z1: float,
                  h0: float, h1: float, material: str, detail: int = 0,
                  bevel_width: float = 0.05) -> bpy.types.Object:
    verts = [
        (x0, y_center - y0_half, z0 - h0), (x0, y_center + y0_half, z0 - h0),
        (x0, y_center + y0_half, z0 + h0), (x0, y_center - y0_half, z0 + h0),
        (x1, y_center - y1_half, z1 - h1), (x1, y_center + y1_half, z1 - h1),
        (x1, y_center + y1_half, z1 + h1), (x1, y_center - y1_half, z1 + h1),
    ]
    faces = [
        (0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1),
        (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0),
    ]
    mesh = bpy.data.meshes.new(name + "_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    link_object(obj)
    bevel(obj, bevel_width)
    return assign(obj, material, detail)


def torus(name: str, location, major: float, minor: float, material: str,
          detail: int = 0) -> bpy.types.Object:
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major, minor_radius=minor, major_segments=48,
        minor_segments=10, location=location, rotation=(0.0, math.pi / 2.0, 0.0),
    )
    obj = bpy.context.object
    obj.name = name
    bevel(obj, 0.025)
    return assign(obj, material, detail)


def author_v2_structure(source_objects: list[bpy.types.Object]) -> list[bpy.types.Object]:
    made: list[bpy.types.Object] = []

    # Macro: a ventral keel turns the soft capsule into an unmistakable arrow
    # without adding a second hull mass or compromising the cockpit read.
    made.append(tapered_prism(
        "BT2_Ventral_Keel", -8.8, 11.8, 0.0, 1.45, 0.22,
        -2.12, -0.72, 0.38, 0.12, "Material_Hull", 0, 0.08,
    ))

    # Macro: separated shoulder chines create strong negative space and a
    # practical load path from the drive collar toward the nose.
    for side in (-1.0, 1.0):
        made.append(tapered_prism(
            f"BT2_Shoulder_Chine_{'P' if side > 0 else 'S'}", -8.2, 8.9,
            side * 5.75, 0.72, 0.34, 0.28, 0.04, 0.48, 0.22,
            "Material_Hull", 0, 0.075,
        ))
        made.append(tapered_prism(
            f"BT2_Forward_Cheek_{'P' if side > 0 else 'S'}", 5.2, 12.25,
            side * 3.45, 0.64, 0.12, 0.48, -0.02, 0.34, 0.10,
            "Material_Mechanical", 0, 0.055,
        ))

    # Macro: the open drive yoke makes aft orientation readable in one glance.
    made.append(torus("BT2_Drive_Load_Ring", (-12.75, 0.0, 0.0), 3.20, 0.20,
                      "Material_Hull", 0))
    for y, z in ((-3.25, -1.45), (-3.25, 1.45), (3.25, -1.45), (3.25, 1.45)):
        made.append(tapered_prism(
            "BT2_Drive_Yoke", -13.15, -8.7, y, 0.35, 0.20,
            z, z * 0.72, 0.30, 0.18, "Material_Hull", 0, 0.05,
        ))

    # Meso: canopy brows frame, rather than cover, the existing glass volume.
    for side in (-1.0, 1.0):
        made.append(tapered_prism(
            f"BT2_Canopy_Brow_{'P' if side > 0 else 'S'}", 1.8, 8.0,
            side * 2.55, 0.34, 0.18, 2.18, 1.25, 0.20, 0.10,
            "Material_Hull", 1, 0.035,
        ))

    # Meso: rails carry cyan identity as paint, not bloom, and reinforce the
    # long low frontier-cutter silhouette at 45-120 px.
    for side in (-1.0, 1.0):
        made.append(box(
            f"BT2_Nav_Rail_{'P' if side > 0 else 'S'}", (0.8, side * 6.18, 0.88),
            (8.0, 0.18, 0.20), "Material_Cyan_Paint", 1,
            rotation=(0.0, math.radians(-2.5), 0.0), bevel_width=0.035,
        ))
        for x in (-2.1, 0.8, 3.7):
            made.append(box(
                f"BT2_Nav_Rail_Stanchion_{'P' if side > 0 else 'S'}", (x, side * 5.86, 0.70),
                (0.24, 0.70, 0.42), "Material_Mechanical", 1,
                bevel_width=0.028,
            ))
        made.append(box(
            f"BT2_RCS_Cowl_{'P' if side > 0 else 'S'}", (1.8, side * 6.25, 0.38),
            (2.2, 0.95, 1.10), "Material_Mechanical", 1,
            rotation=(math.radians(side * 5.0), 0.0, 0.0), bevel_width=0.10,
        ))

    # Meso biography: one bolted repair plate stays intentionally asymmetric.
    made.append(box(
        "BT2_Field_Repair_Plate", (-1.2, -6.98, 0.10),
        (4.6, 0.16, 1.55), "Material_Repair_Paint", 1,
        rotation=(0.0, math.radians(-4.0), 0.0), bevel_width=0.045,
    ))
    made.append(box(
        "BT2_Field_Repair_Warning", (-1.1, -7.09, 0.10),
        (0.30, 0.08, 1.30), "Material_Warm_Paint", 2,
        bevel_width=0.025,
    ))

    # Close-only heat vanes around the drive retain causal mechanical detail.
    for side in (-1.0, 1.0):
        for z in (-1.8, -0.6, 0.6, 1.8):
            made.append(box(
                "BT2_Drive_Heat_Vane", (-10.2, side * 3.55, z),
                (2.4, 0.14, 0.32), "Material_Mechanical", 2,
                rotation=(0.0, math.radians(side * 4.0), 0.0), bevel_width=0.025,
            ))

    source_objects.extend(made)
    return made


_base_build_lod = base.build_lod_collection
_authored = False


def build_lod_collection(source_objects, lod_name, max_detail, ratio, drop_close, materials):
    global _authored
    if not _authored:
        made = author_v2_structure(source_objects)
        base.log(f"V2 authored structure: {len(made)} objects")
        _authored = True
    return _base_build_lod(source_objects, lod_name, max_detail, ratio, drop_close, materials)


base.build_lod_collection = build_lod_collection
_base_assert = base.assert_production_gates


def assert_production_gates(report: dict) -> list[str]:
    errors = [e for e in _base_assert(report)
              if not e.startswith("total stored triangles")]
    total = int(report.get("totalTriangles", 0))
    if total > 46000:
        errors.append(f"total stored triangles {total} > 46000 V2 structural guard")
    lod = report.get("lodBreakdown") or {}
    counts = [int((lod.get(k) or {}).get("triangles", 0)) for k in ("lod0", "lod1", "lod2")]
    if not (counts[0] > counts[1] > counts[2] > 0):
        errors.append(f"non-monotonic V2 LODs {counts}")
    if counts[0] < 22000:
        errors.append(f"V2 near-field geometry {counts[0]} < 22000 quality floor")
    return errors


base.assert_production_gates = assert_production_gates


def extract_source() -> Path:
    temp = Path(os.environ.get("TEMP", str(FAMILY))) / "spaceface_kestrel_bt_v2_source"
    target = temp / "SF_K0_Borrowed_Time_Revamp.blend"
    if target.exists():
        return target
    temp.mkdir(parents=True, exist_ok=True)
    member = "SpaceFace_SF-K0_Borrowed-Time_Revamp/SF_K0_Borrowed_Time_Revamp.blend"
    with zipfile.ZipFile(REVAMP_ZIP) as archive:
        with archive.open(member) as src, target.open("wb") as dst:
            while True:
                chunk = src.read(1 << 20)
                if not chunk:
                    break
                dst.write(chunk)
    return target


def write_provenance(source: Path) -> None:
    FAMILY.mkdir(parents=True, exist_ok=True)
    provenance = {
        "schema": "spaceface.assetProvenance.v1",
        "packet": PACKET,
        "family": "kestrel_borrowed_time_v2",
        "candidateOnly": True,
        "livePromotion": False,
        "qualityBar": "SF-K0 Borrowed Time package plus current production Kestrel",
        "sources": [
            {"path": str(REVAMP_ZIP), "sha256": sha256(REVAMP_ZIP),
             "license": "project-original; no third-party content per docs/THIRD_PARTY.md"},
            {"path": str(RUNTIME_ZIP), "sha256": sha256(RUNTIME_ZIP),
             "license": "project-original; no third-party content per docs/THIRD_PARTY.md"},
            {"path": str(CURRENT_RELEASE.relative_to(ROOT)).replace("\\", "/"),
             "sha256": sha256(CURRENT_RELEASE), "role": "current shipped comparison"},
            {"path": str(source), "sha256": sha256(source), "role": "editable authoring source"},
        ],
        "adaptation": [
            "stronger ventral keel and shoulder chine silhouette",
            "open drive load ring and yoke for aft readability",
            "canopy brows, painted nav rails, RCS cowlings, and asymmetric repair biography",
            "higher-retention near LOD with restrained mid/far tiers",
        ],
        "forbidden": ["live promotion", "embedded drive plume", "accessory-only hull"],
    }
    (FAMILY / "PROVENANCE.json").write_text(json.dumps(provenance, indent=2), encoding="utf-8")


def main() -> int:
    source = extract_source()
    out_blend = FAMILY / "blender" / "kestrel_borrowed_time_v2_production.blend"
    out_glb = FAMILY / "source" / "wholeships" / "kestrel_borrowed_time_v2.glb"
    evidence = FAMILY / "evidence"
    for path in (out_blend.parent, out_glb.parent, evidence):
        path.mkdir(parents=True, exist_ok=True)
    write_provenance(source)
    sys.argv = [sys.argv[0], "--",
                "--source", str(source),
                "--out-blend", str(out_blend),
                "--out-glb", str(out_glb),
                "--evidence", str(evidence)]
    return base.main()


if __name__ == "__main__":
    raise SystemExit(main())
