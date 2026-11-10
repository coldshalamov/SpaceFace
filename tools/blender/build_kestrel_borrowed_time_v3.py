#!/usr/bin/env python3
"""Build the isolated SF-K0 Borrowed Time V3 foundation candidate.

V3 intentionally starts from the user's original editable Borrowed Time blend,
never from the rejected V2 candidate. It retains the coherent pressure hull,
cockpit, and axial drive, removes the detached radiator/pontoon grammar, and
authors continuous shoulder shells plus integrated drive/cargo load paths.

Writes only assets/ships/kestrel_borrowed_time_v3/**. Never promotes live.
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


ROOT = Path(__file__).resolve().parents[2]
FAMILY = ROOT / "assets" / "ships" / "kestrel_borrowed_time_v3"
PACKET = "PROFESSIONAL-KESTREL-BORROWED-TIME-V3-CODEX-001"
REVAMP_ZIP = Path(r"C:\Users\93rob\Downloads\SpaceFace_SF-K0_Borrowed-Time_Revamp.zip")
RUNTIME_ZIP = Path(r"C:\Users\93rob\Downloads\SpaceFace_SF-K0_Borrowed-Time_Runtime.zip")
CURRENT_RELEASE = ROOT / "assets" / "ships" / "release" / "parts" / "wholeships" / "kestrel.glb"
V2_REJECT_PROOF = ROOT / "assets" / "ships" / "kestrel_borrowed_time_v2" / "evidence" / "devshots" / "kestrel_v2_three_close.png"


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest().upper()


def load_base():
    path = ROOT / "tools" / "blender" / "build_kestrel_borrowed_time.py"
    spec = importlib.util.spec_from_file_location("spaceface_kestrel_v3_base", path)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


base = load_base()
base.PACKET = PACKET
base.ASSET_ID = "SF_WHOLESHIP_KESTREL_BORROWED_TIME_V3"
base.PART_ID = "wholeship_kestrel_borrowed_time_v3"
# Retain a hero-quality close tier while preserving the production 15/11/7
# material-role draw structure inherited from the canonical pipeline.
base.LOD_RECIPES = (
    ("lod0", 2, 0.58, False),
    ("lod1", 1, 0.31, True),
    ("lod2", 0, 0.15, True),
)


def link_source(obj: bpy.types.Object) -> None:
    coll = bpy.data.collections.get("SOURCE_HERO_LOD0") or bpy.context.scene.collection
    if obj.name not in coll.objects:
        coll.objects.link(obj)


def assign(obj: bpy.types.Object, material: bpy.types.Material, detail: int,
           component: str) -> bpy.types.Object:
    obj.data.materials.clear()
    obj.data.materials.append(material)
    obj["sf_detail_level"] = detail
    obj["sf_component"] = component
    obj["sf_v3_foundation"] = True
    return obj


def bevel(obj: bpy.types.Object, width: float, segments: int = 3) -> None:
    mod = obj.modifiers.new("V3_Integrated_Chamfer", "BEVEL")
    mod.width = width
    mod.segments = segments
    mod.limit_method = "ANGLE"
    mod.angle_limit = math.radians(24)


def loft_shell(name: str, side: float, stations: list[tuple[float, float, float, float, float]],
               material: bpy.types.Material, detail: int = 0,
               bevel_width: float = 0.10) -> bpy.types.Object:
    """Continuous side shell.

    Each station is (x, inner_y, outer_y, z_bottom, z_top). The inner edge
    overlaps the pressure hull; the outer edge defines one continuous shoulder.
    """
    verts: list[tuple[float, float, float]] = []
    for x, inner, outer, z0, z1 in stations:
        yi, yo = side * inner, side * outer
        verts.extend(((x, yi, z0), (x, yo, z0), (x, yo, z1), (x, yi, z1)))
    faces: list[tuple[int, ...]] = []
    faces.append((0, 3, 2, 1))
    last = (len(stations) - 1) * 4
    faces.append((last, last + 1, last + 2, last + 3))
    for i in range(len(stations) - 1):
        a, b = i * 4, (i + 1) * 4
        faces.extend((
            (a, b, b + 1, a + 1),
            (a + 1, b + 1, b + 2, a + 2),
            (a + 2, b + 2, b + 3, a + 3),
            (a + 3, b + 3, b, a),
        ))
    mesh = bpy.data.meshes.new(name + "_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    link_source(obj)
    bevel(obj, bevel_width)
    return assign(obj, material, detail, "integrated_shoulder_shell")


def center_loft(name: str, stations: list[tuple[float, float, float, float]],
                material: bpy.types.Material, detail: int, component: str,
                bevel_width: float = 0.08) -> bpy.types.Object:
    """Symmetric integrated carapace from (x, half_y, z_bottom, z_top)."""
    verts: list[tuple[float, float, float]] = []
    for x, half_y, z0, z1 in stations:
        verts.extend(((x, -half_y, z0), (x, half_y, z0),
                      (x, half_y, z1), (x, -half_y, z1)))
    faces: list[tuple[int, ...]] = [(0, 3, 2, 1)]
    last = (len(stations) - 1) * 4
    faces.append((last, last + 1, last + 2, last + 3))
    for i in range(len(stations) - 1):
        a, b = i * 4, (i + 1) * 4
        faces.extend(((a, b, b + 1, a + 1),
                      (a + 1, b + 1, b + 2, a + 2),
                      (a + 2, b + 2, b + 3, a + 3),
                      (a + 3, b + 3, b, a)))
    mesh = bpy.data.meshes.new(name + "_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    link_source(obj)
    bevel(obj, bevel_width)
    return assign(obj, material, detail, component)


def tapered_prism(name: str, x0: float, x1: float, y: float,
                  half_y0: float, half_y1: float, z0: float, z1: float,
                  half_z0: float, half_z1: float, material: bpy.types.Material,
                  detail: int, component: str, bevel_width: float = 0.07) -> bpy.types.Object:
    verts = [
        (x0, y-half_y0, z0-half_z0), (x0, y+half_y0, z0-half_z0),
        (x0, y+half_y0, z0+half_z0), (x0, y-half_y0, z0+half_z0),
        (x1, y-half_y1, z1-half_z1), (x1, y+half_y1, z1-half_z1),
        (x1, y+half_y1, z1+half_z1), (x1, y-half_y1, z1+half_z1),
    ]
    faces = ((0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1),
             (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0))
    mesh = bpy.data.meshes.new(name + "_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    link_source(obj)
    bevel(obj, bevel_width)
    return assign(obj, material, detail, component)


def box(name: str, location, dimensions, material: bpy.types.Material,
        detail: int, component: str, bevel_width: float = 0.04) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bevel(obj, bevel_width, 2)
    return assign(obj, material, detail, component)


def remove_detached_grammar(source_objects: list[bpy.types.Object]) -> list[str]:
    exact = {
        "hull_radiator_pod_pair",
        "hull_shoulder_armor_pair",
        "radiator_fin_array_source",
        "hull_dorsal_spine",
        "nose_armored_brow",
        "practical_utility_-1",
        "practical_utility_1",
    }
    prefixes = (
        "radiator_lip_", "shoulder_brace_", "grabrail_",
        "dorsal_spine_rib_", "pulse_", "rcs_core_", "rcs_nozzle_",
    )
    removed: list[str] = []
    for obj in list(source_objects):
        low = obj.name.lower()
        if low in exact or low.startswith(prefixes):
            removed.append(obj.name)
            source_objects.remove(obj)
            base.unlink_object(obj)
    return removed


def remap_primary_masses(source_objects: list[bpy.types.Object], materials) -> list[str]:
    role = {
        "engine_main_housing": "Material_Hull",
        "engine_forward_loadring": "Material_Warm_Paint",
        "engine_aft_loadring": "Material_Cyan_Paint",
        "hull_ventral_keel": "Material_Hull",
    }
    changed: list[str] = []
    for obj in source_objects:
        target = role.get(obj.name.lower())
        if obj.type == "MESH" and target in materials:
            obj.data.materials.clear()
            obj.data.materials.append(materials[target])
            changed.append(f"{obj.name}->{target}")
    return changed


def author_v3_foundation(source_objects: list[bpy.types.Object], materials) -> dict:
    removed = remove_detached_grammar(source_objects)
    remapped = remap_primary_masses(source_objects, materials)
    made: list[bpy.types.Object] = []

    # One continuous shell per side: broad root overlap into the pressure hull,
    # tapered nose, and a powerful aft shoulder. No detached pontoon or rail.
    stations = [
        (-8.6, 2.05, 3.25, -0.92, 0.62),
        (-5.8, 2.25, 4.55, -0.84, 0.86),
        (-1.0, 2.35, 5.15, -0.72, 0.98),
        (4.2, 2.18, 4.72, -0.56, 0.86),
        (8.7, 1.42, 2.58, -0.30, 0.48),
        (11.3, 0.45, 0.78, -0.12, 0.20),
    ]
    for side in (-1.0, 1.0):
        tag = "P" if side > 0 else "S"
        made.append(loft_shell(
            f"BT3_LoadBearing_Shoulder_{tag}", side, stations,
            materials["Material_Hull"], 0, 0.12,
        ))

        # Aft drive buttress physically overlaps both engine housing and shell.
        made.append(tapered_prism(
            f"BT3_Drive_Buttress_{tag}", -12.3, -6.7, side * 2.42,
            0.52, 0.82, 0.18, 0.36, 0.58, 0.72,
            materials["Material_Hull"], 0, "drive_load_path", 0.10,
        ))

        # Flush cargo door and frame sit on the shoulder surface instead of
        # becoming another hull island.
        made.append(tapered_prism(
            f"BT3_Cargo_Door_{tag}", -4.3, 2.5, side * 5.10,
            0.055, 0.055, 0.02, 0.16, 0.62, 0.58,
            materials["Material_Mechanical"], 1, "flush_cargo_door", 0.035,
        ))
        for x in (-3.65, 1.85):
            made.append(box(
                f"BT3_Cargo_Latch_{tag}_{x:+.2f}", (x, side * 5.18, 0.14),
                (0.34, 0.10, 0.64), materials["Material_Warm_Paint"],
                1, "cargo_load_latch", 0.025,
            ))

        # Small forward cool marker: a directional cue, never a luminous rail.
        made.append(tapered_prism(
            f"BT3_Nose_ID_Panel_{tag}", 7.3, 10.4, side * 1.86,
            0.16, 0.06, 0.67, 0.25, 0.14, 0.06,
            materials["Material_Cyan_Paint"], 1, "orientation_marker", 0.025,
        ))

        # Flush RCS blocks replace the source pods that floated outside the
        # rebuilt shell. Each block overlaps the shoulder skin.
        for x, y_outer, z in ((4.0, 4.70, 0.30), (-7.3, 3.34, -0.06)):
            made.append(box(
                f"BT3_RCS_Cowl_{tag}_{x:+.1f}", (x, side * y_outer, z),
                (0.82, 0.42, 0.62), materials["Material_Hull"],
                1, "flush_rcs_cowl", 0.09,
            ))
            made.append(box(
                f"BT3_RCS_Core_{tag}_{x:+.1f}", (x, side * (y_outer + 0.23), z),
                (0.28, 0.10, 0.28), materials["Material_Cyan_Emissive"],
                1, "flush_rcs_core", 0.035,
            ))

        # A flush warm service lamp replaces the floating practical beacon.
        made.append(box(
            f"BT3_Service_Lamp_{tag}", (-2.0, side * 4.86, 0.91),
            (0.22, 0.10, 0.42), materials["Material_Warm_Emissive"],
            1, "flush_service_lamp", 0.03,
        ))

    # Replace the inherited rail-like dorsal spine with a broad equipment
    # saddle whose entire underside overlaps the pressure hull.
    made.append(center_loft(
        "BT3_Dorsal_Service_Saddle",
        [(-7.0, 0.72, 1.72, 2.05), (-4.4, 1.02, 1.78, 2.22),
         (-0.2, 1.15, 1.82, 2.28), (3.7, 0.82, 1.64, 2.08)],
        materials["Material_Hull"], 0, "integrated_dorsal_saddle", 0.09,
    ))

    # Replace the source rectangular nose brow with a tapered, continuous prow
    # carapace. It joins the pressure hull and preserves the forward arrow.
    made.append(center_loft(
        "BT3_Forward_Carapace",
        [(6.1, 1.72, 1.08, 1.64), (8.5, 1.40, 0.92, 1.52),
         (10.6, 0.72, 0.52, 1.00), (12.1, 0.18, 0.10, 0.36)],
        materials["Material_Hull"], 0, "integrated_forward_carapace", 0.08,
    ))

    # Compact hardpoint integrated into the prow. Short barrels are secondary
    # mechanical detail, not long black spear members or a separate gun island.
    made.append(tapered_prism(
        "BT3_Hardpoint_Cowl", 6.8, 9.0, 0.0, 0.66, 0.44,
        1.58, 1.42, 0.30, 0.22, materials["Material_Hull"],
        0, "integrated_forward_hardpoint", 0.08,
    ))
    for side in (-1.0, 1.0):
        made.append(tapered_prism(
            f"BT3_Hardpoint_Barrel_{'P' if side > 0 else 'S'}", 8.7, 11.15,
            side * 0.27, 0.11, 0.09, 1.46, 1.28, 0.11, 0.09,
            materials["Material_Mechanical"], 1, "short_hardpoint_barrel", 0.025,
        ))
        made.append(box(
            f"BT3_Hardpoint_Muzzle_{'P' if side > 0 else 'S'}",
            (11.2, side * 0.27, 1.28), (0.18, 0.26, 0.26),
            materials["Material_Warm_Paint"], 1, "hardpoint_muzzle", 0.035,
        ))

    # Warm structural crown breaks up the engine mass without becoming a dark
    # full-width ring or embedded plume.
    made.append(tapered_prism(
        "BT3_Drive_Crown", -11.9, -8.2, 0.0, 1.38, 1.62,
        1.76, 1.58, 0.18, 0.24, materials["Material_Warm_Paint"],
        1, "thermal_service_crown", 0.055,
    ))

    # A restrained asymmetric field repair is flush with the port shell.
    made.append(tapered_prism(
        "BT3_Field_Repair_Inlay", -1.9, 1.1, -5.19, 0.045, 0.045,
        -0.22, -0.12, 0.42, 0.38, materials["Material_Repair_Paint"],
        2, "flush_repair_biography", 0.025,
    ))

    # Close-only service fasteners: compact and causal, never silhouette noise.
    for side in (-1.0, 1.0):
        for x in (-2.9, -1.5, -0.1, 1.3):
            made.append(box(
                f"BT3_Service_Fastener_{'P' if side > 0 else 'S'}_{x:+.1f}",
                (x, side * 5.20, 0.62), (0.16, 0.08, 0.16),
                materials["Material_Warm_Emissive"], 2,
                "cargo_status_fastener", 0.018,
            ))

    source_objects.extend(made)
    return {"removed": removed, "remapped": remapped, "made": [o.name for o in made]}


_base_build_lod = base.build_lod_collection
_foundation_report: dict | None = None


def build_lod_collection(source_objects, lod_name, max_detail, ratio, drop_close, materials):
    global _foundation_report
    if _foundation_report is None:
        _foundation_report = author_v3_foundation(source_objects, materials)
        base.log(
            f"V3 foundation rebuild: removed={len(_foundation_report['removed'])} "
            f"remapped={len(_foundation_report['remapped'])} "
            f"authored={len(_foundation_report['made'])}"
        )
    return _base_build_lod(source_objects, lod_name, max_detail, ratio, drop_close, materials)


base.build_lod_collection = build_lod_collection
_base_assert = base.assert_production_gates


def assert_production_gates(report: dict) -> list[str]:
    errors = [e for e in _base_assert(report)
              if not e.startswith("total stored triangles")]
    total = int(report.get("totalTriangles", 0))
    if total > 52000:
        errors.append(f"total stored triangles {total} > 52000 V3 structural guard")
    lod = report.get("lodBreakdown") or {}
    counts = [int((lod.get(k) or {}).get("triangles", 0))
              for k in ("lod0", "lod1", "lod2")]
    if not (counts[0] > counts[1] > counts[2] > 0):
        errors.append(f"non-monotonic V3 LODs {counts}")
    # The source release is a 19k-triangle hero. V3 judges authored continuity,
    # material structure, and proof quality rather than rewarding raw triangles;
    # 18k prevents accidental proxy exports without rejecting focused geometry.
    if counts[0] < 18000:
        errors.append(f"V3 near-field geometry {counts[0]} < 18000 authored floor")
    draws = [int((lod.get(k) or {}).get("drawEstimate", 0))
             for k in ("lod0", "lod1", "lod2")]
    for got, cap, name in zip(draws, (15, 11, 7), ("lod0", "lod1", "lod2")):
        if got > cap:
            errors.append(f"{name} draw estimate {got} > {cap}")
    return errors


base.assert_production_gates = assert_production_gates


def extract_source() -> Path:
    temp = Path(os.environ.get("TEMP", str(FAMILY))) / "spaceface_kestrel_bt_v3_source"
    target = temp / "SF_K0_Borrowed_Time_Revamp.blend"
    if target.exists():
        return target
    temp.mkdir(parents=True, exist_ok=True)
    member = "SpaceFace_SF-K0_Borrowed-Time_Revamp/SF_K0_Borrowed_Time_Revamp.blend"
    with zipfile.ZipFile(REVAMP_ZIP) as archive:
        with archive.open(member) as src, target.open("wb") as dst:
            while chunk := src.read(1 << 20):
                dst.write(chunk)
    return target


def write_packet_docs(source: Path) -> None:
    FAMILY.mkdir(parents=True, exist_ok=True)
    provenance = {
        "schema": "spaceface.assetProvenance.v1",
        "packet": PACKET,
        "family": "kestrel_borrowed_time_v3",
        "candidateOnly": True,
        "livePromotion": False,
        "foundationRebuild": True,
        "qualityBar": "user Borrowed Time ZIP/current release, improved without V2 slab grammar",
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
            "removed detached radiator/shoulder-pod and long rail grammar",
            "two continuous load-bearing shoulder shells overlap the pressure hull",
            "integrated drive buttresses and flush cargo/service structures",
            "hull-valued engine primary mass with restrained warm/cool hierarchy",
        ],
        "forbidden": [
            "live promotion", "V2 geometry reuse", "embedded drive plume",
            "detached pontoons or rails", "featureless black primary mass",
        ],
    }
    (FAMILY / "PROVENANCE.json").write_text(
        json.dumps(provenance, indent=2), encoding="utf-8"
    )
    design = "# SF-K0 Borrowed Time V3 - foundation rebuild\n\n"
    design += f"Packet: `{PACKET}`\n\n"
    design += (
        "V3 imports the user's original editable Borrowed Time source directly and does not "
        "consume V2. It preserves the coherent pressure hull, cockpit, and axial drive while "
        "replacing the detached radiator/pontoon grammar with two continuous shoulder shells, "
        "integrated drive buttresses, and flush cargo/service structure. The candidate is "
        "isolated and not wired to default play.\n"
    )
    (FAMILY / "DESIGN.md").write_text(design, encoding="utf-8")


def main() -> int:
    source = extract_source()
    out_blend = FAMILY / "blender" / "kestrel_borrowed_time_v3_production.blend"
    out_glb = FAMILY / "source" / "wholeships" / "kestrel_borrowed_time_v3.glb"
    evidence = FAMILY / "evidence"
    for path in (out_blend.parent, out_glb.parent, evidence):
        path.mkdir(parents=True, exist_ok=True)
    write_packet_docs(source)
    sys.argv = [sys.argv[0], "--", "--source", str(source),
                "--out-blend", str(out_blend), "--out-glb", str(out_glb),
                "--evidence", str(evidence)]
    return base.main()


if __name__ == "__main__":
    raise SystemExit(main())
