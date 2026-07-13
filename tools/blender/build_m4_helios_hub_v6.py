#!/usr/bin/env python3
"""Build the isolated Helios V6 environment-family candidate.

V6 keeps the proven V3 production/export contract, but replaces the weak hero
silhouettes with a materially re-authored CC0 BlenderKit macro donor.  Poly
Haven scans and Kenney kit parts remain subordinate detail sources.  Nothing
in this script promotes assets into the live release tree.

Usage:
  blender --background --python tools/blender/build_m4_helios_hub_v6.py --
  blender --background --python tools/blender/build_m4_helios_hub_v6.py -- --only hub,gate
"""
from __future__ import annotations

import hashlib
import importlib.util
import json
import math
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
V3_BUILDER = ROOT / "tools" / "blender" / "build_m4_helios_hub_v3.py"
PACKET_ROOT = ROOT / "assets" / "ships" / "m4_helios_hub_v6"
REFERENCE_ROOT = PACKET_ROOT / "source" / "reference"
VENDOR_ROOT = REFERENCE_ROOT / "helios_v3"
DONOR = REFERENCE_ROOT / "blenderkit_scifi_station" / "blenderkit_scifi_station_cc0.blend"
DONOR_PROVENANCE = REFERENCE_ROOT / "blenderkit_scifi_station" / "PROVENANCE.json"

spec = importlib.util.spec_from_file_location("helios_v3_pipeline", V3_BUILDER)
if spec is None or spec.loader is None:
    raise RuntimeError(f"Cannot load base pipeline: {V3_BUILDER}")
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)

base.PACKET_ROOT = PACKET_ROOT
base.PACKET = "PROFESSIONAL-HELIOS-HUB-VISUAL-V6-CODEX-001"
base.FAMILY = "helios_hub_env_v6"
base.AUTHORING_LOCK = PACKET_ROOT / "authoring.__lock"
base.REJECTED_PACKET = "PROFESSIONAL-HELIOS-HUB-VISUAL-V5-GROK-001"
base.VENDOR_ROOT = VENDOR_ROOT
base.KIT_POLY = VENDOR_ROOT / "polyhaven"
base.KIT_KENNEY = VENDOR_ROOT / "kenney_space_kit" / "Models" / "GLTF format"
base.CAMPAIGN_BUILD = PACKET_ROOT / "evidence" / "build"


DONOR_OBJECTS = {
    "Sci-Fi_Station_base ring",
    "Sci-Fi_Station_base ring details",
    "Sci-Fi_Station_base ring secondary spikes",
    "Sci-Fi_Station_base ring spikes",
    "Sci-Fi_Station_Interior pods",
    "Sci-Fi_Station_lights",
    "Sci-Fi_Station_outer ring",
    "Sci-Fi_Station_outer ring details",
    "Sci-Fi_Station_outer ring pods",
}


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest().upper()


def _assign_material(obj: bpy.types.Object, material: bpy.types.Material) -> None:
    if obj.type != "MESH" or obj.data is None:
        return
    obj.data.materials.clear()
    obj.data.materials.append(material)


def _apply_object_transforms(obj: bpy.types.Object) -> None:
    base.ensure_object_mode()
    base.deselect_all()
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    obj.select_set(False)


def _bounds(objects: list[bpy.types.Object]) -> tuple[Vector, Vector]:
    bpy.context.view_layer.update()
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for obj in objects:
        if obj.type != "MESH":
            continue
        for corner in obj.bound_box:
            p = obj.matrix_world @ Vector(corner)
            lo.x = min(lo.x, p.x); lo.y = min(lo.y, p.y); lo.z = min(lo.z, p.z)
            hi.x = max(hi.x, p.x); hi.y = max(hi.y, p.y); hi.z = max(hi.z, p.z)
    return lo, hi


def _append_dense_donor(
    coll: bpy.types.Collection,
    mats: dict[str, bpy.types.Material],
    *,
    gate: bool,
) -> list[bpy.types.Object]:
    """Append, normalize, materially separate, and budget the CC0 donor."""
    if not DONOR.exists() or not DONOR_PROVENANCE.exists():
        raise FileNotFoundError(f"V6 donor or provenance missing: {DONOR}")

    with bpy.data.libraries.load(str(DONOR), link=False) as (data_from, data_to):
        data_to.objects = [name for name in data_from.objects if name in DONOR_OBJECTS]

    objects: list[bpy.types.Object] = []
    for obj in data_to.objects:
        if obj is None or obj.type != "MESH":
            continue
        coll.objects.link(obj)
        obj.animation_data_clear()
        for modifier in list(obj.modifiers):
            base.deselect_all()
            obj.select_set(True)
            bpy.context.view_layer.objects.active = obj
            try:
                bpy.ops.object.modifier_apply(modifier=modifier.name)
            except Exception as exc:
                base.log(f"WARN V6 donor modifier {obj.name}/{modifier.name}: {exc}")
            obj.select_set(False)
        obj["sf_component"] = "cc0_authored_macro_donor"
        obj["sf_source"] = "BlenderKit b180fdbd-668f-4081-ad51-f364e829f11d / CC0"
        objects.append(obj)

    if not objects:
        raise RuntimeError("CC0 station donor appended no mesh objects")

    # Remove both spike layers. Even shortened, their very large donor faces
    # become view-filling triangular artifacts after the station is rotated
    # into a gate. Purpose-built V6 projectors carry the silhouette instead.
    for obj in list(objects):
        name = obj.name.lower()
        if (
            "spike" in name
            or name.endswith("base ring")
            or name.endswith("outer ring")
        ):
            objects.remove(obj)
            bpy.data.objects.remove(obj, do_unlink=True)
            continue
        _apply_object_transforms(obj)

    lo, hi = _bounds(objects)
    center = (lo + hi) * 0.5
    span = max(hi.x - lo.x, hi.y - lo.y, hi.z - lo.z, 1.0)
    target_span = 38.0 if not gate else 31.0
    scale = target_span / span
    for obj in objects:
        obj.location -= center
        obj.scale *= scale
        if gate:
            # The donor is a horizontal station; a gate must read as a vertical,
            # load-bearing aperture in the semi-top-down flight composition.
            obj.rotation_euler.x += math.radians(90.0)
        _apply_object_transforms(obj)

    # Canonical roles are deliberately high-contrast: ceramic shell, graphite
    # machinery, cyan navigation, and amber service wayfinding.
    for obj in objects:
        name = obj.name.lower()
        if "lights" in name:
            mat = mats["Material_Accent"]
            obj["sf_keep_separate"] = True
            obj["sf_component"] = "emissive"
            obj["sf_close_only"] = True
        elif "pod" in name:
            mat = mats["Material_Hull"]
        elif "detail" in name or "spike" in name:
            mat = mats["Material_Mechanical"]
            obj["sf_close_only"] = True
        elif "outer ring" in name:
            mat = mats["Material_Warm"]
        else:
            mat = mats["Material_Hull"]
        _assign_material(obj, mat)

    # The donor's dense topology is retained where it changes silhouette and
    # surface rhythm, then bounded so the production LOD pipeline has room for
    # the new functional masses below.
    total = sum(base.tri_count_object(obj) for obj in objects)
    budget = 14500 if not gate else 12500
    if total > budget:
        for obj in sorted(objects, key=base.tri_count_object, reverse=True):
            tris = base.tri_count_object(obj)
            target = max(48, int(tris * budget / total))
            base.decimate_to_max_tris(obj, target, label=f"V6 donor:{obj.name}")
    return objects


def _wayfinding_modules(
    coll: bpy.types.Collection,
    mats: dict[str, bpy.types.Material],
    *,
    gate: bool,
) -> list[bpy.types.Object]:
    made: list[bpy.types.Object] = []
    hull = mats["Material_Hull"]
    mech = mats["Material_Mechanical"]
    cyan = mats["Material_Accent"]
    amber = mats["Material_Warm"]
    if not gate:
        # A tall civic spindle, four transfer spokes, and two asymmetric cargo
        # docks turn the donor ring into a readable working trade hub.
        made.append(base.make_cylinder("V6_CivicSpindle", 3.9, 19.0, (0, 5.5, 0), hull, coll, vertices=28, axis="Y"))
        made.append(base.make_cylinder("V6_OperationsCrown", 6.2, 2.8, (0, 14.0, 0), mech, coll, vertices=28, axis="Y"))
        for i, angle in enumerate((0, 90, 180, 270)):
            a = math.radians(angle)
            x, z = math.cos(a) * 10.0, math.sin(a) * 10.0
            spoke = base.make_box(
                f"V6_LoadSpoke_{i}", (16.0, 1.25, 1.6), (x * 0.45, 1.0, z * 0.45),
                mech, coll, rotation=(0.0, -a, 0.0), detail=1,
            )
            made.append(spoke)
        for side in (-1, 1):
            z = side * 15.2
            made.append(base.make_box(f"V6_DockArm_{side:+d}", (17.0, 2.2, 3.8), (8.5, -0.5, z), mech, coll, detail=0))
            made.append(base.make_box(
                f"V6_DockGuide_{side:+d}", (14.5, 0.18, 0.28), (9.2, 0.72, z),
                cyan, coll, detail=1, component="emissive", keep_separate=True,
            ))
            made.append(base.make_box(f"V6_CargoPod_{side:+d}", (8.0, 5.2, 6.0), (-8.0, 1.0, z * 0.82), hull, coll, detail=0))
        for i in range(12):
            a = i * math.tau / 12
            made.append(base.make_box(
                f"V6_AmberBerth_{i:02d}", (1.25, 0.16, 0.24),
                (math.cos(a) * 18.3, 2.15, math.sin(a) * 18.3), amber, coll,
                detail=1, component="emissive", keep_separate=True,
            ))
    else:
        # Thick feet, projector housings, and an energy rail give the aperture
        # a credible load path and an immediately legible travel direction.
        for side in (-1, 1):
            made.append(base.make_box(f"V6_GatePylon_{side:+d}", (5.2, 14.0, 6.4), (0, -8.2, side * 12.0), mech, coll, detail=0))
            made.append(base.make_box(f"V6_GateFoot_{side:+d}", (10.5, 3.0, 9.0), (0, -15.0, side * 12.0), hull, coll, detail=0))
        for i, angle in enumerate(range(0, 360, 45)):
            a = math.radians(angle)
            y, z = math.sin(a) * 13.4, math.cos(a) * 13.4
            made.append(base.make_box(f"V6_Projector_{i}", (4.4, 2.7, 2.7), (0, y, z), mech, coll, detail=0))
            made.append(base.make_box(
                f"V6_ProjectorGlow_{i}", (4.6, 0.32, 0.55), (0.1, y * 0.88, z * 0.88),
                cyan if i % 2 == 0 else amber, coll, detail=1,
                component="emissive", keep_separate=True,
            ))
        made.append(base.make_torus("V6_EnergyWayfindingRail", 10.3, 0.17, (0, 0, 0), cyan, coll, major_segs=64, minor_segs=10, detail=1))
    return made


def build_hub_v6(coll: bpy.types.Collection, mats: dict[str, bpy.types.Material], _asset: dict) -> list[bpy.types.Object]:
    donor = _append_dense_donor(coll, mats, gate=False)
    authored = base.build_hub_station(coll, mats)
    return authored + donor + _wayfinding_modules(coll, mats, gate=False)


def build_gate_v6(coll: bpy.types.Collection, mats: dict[str, bpy.types.Material], _asset: dict) -> list[bpy.types.Object]:
    donor = _append_dense_donor(coll, mats, gate=True)
    authored = base.build_gate(coll, mats)
    return authored + donor + _wayfinding_modules(coll, mats, gate=True)


def _voxel_retopologize(obj: bpy.types.Object, target_tris: int) -> None:
    """Make a scan production-safe while retaining its real geological silhouette."""
    base.ensure_object_mode()
    base.deselect_all()
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.context.view_layer.update()
    extent = max(float(obj.dimensions.x), float(obj.dimensions.y), float(obj.dimensions.z), 0.1)
    try:
        obj.data.remesh_voxel_size = extent / 26.0
        obj.data.use_remesh_preserve_volume = True
        bpy.ops.object.voxel_remesh()
    except Exception as exc:
        base.log(f"WARN V6 voxel retopology {obj.name}: {exc}")
    obj.select_set(False)
    base.decimate_to_max_tris(obj, target_tris, label=f"V6 rock:{obj.name}")
    base.ensure_uvs_force(obj)
    base.ensure_normals(obj)
    base.triangulate_object(obj)


def build_rock_v6(
    coll: bpy.types.Collection,
    mats: dict[str, bpy.types.Material],
    asset: dict,
) -> list[bpy.types.Object]:
    """Three source-scan hero rocks with real, bounded LOD0 topology."""
    variant = str(asset.get("variant") or asset["id"].rsplit("_", 1)[-1]).lower()
    kits = base.kit_paths()
    source_key = "rock_scan" if variant == "b" else "boulder"
    source = kits.get(source_key) or kits.get("boulder") or kits.get("rock_scan")
    if source is None:
        raise FileNotFoundError("V6 curated Poly Haven hero-rock scan missing")
    rock = base.kit_component(
        source, f"V6_Rock_{variant.upper()}_Scan", coll,
        scale=1.0, location_rt=(0.0, 0.0, 0.0), material=mats["Material_Rock"],
        preserve_maps=False, close_only=False, max_tris=None,
    )
    if rock is None:
        raise RuntimeError(f"Could not import V6 rock scan for variant {variant}")

    bpy.context.view_layer.update()
    extent = max(float(rock.dimensions.x), float(rock.dimensions.y), float(rock.dimensions.z), 0.1)
    target_extent = {"a": 12.0, "b": 10.5, "c": 11.0}.get(variant, 11.0)
    rock.scale *= target_extent / extent
    shape = {
        "a": (1.55, 0.62, 1.10),  # broad stratified slab
        "b": (0.78, 1.48, 0.88),  # cleaved vertical wedge
        "c": (1.10, 0.95, 1.38),  # tall, knuckled cluster
    }.get(variant, (1.0, 1.0, 1.0))
    rock.scale.x *= shape[0]; rock.scale.y *= shape[1]; rock.scale.z *= shape[2]
    rock.rotation_euler = {
        "a": (math.radians(7), math.radians(-12), math.radians(4)),
        "b": (math.radians(-18), math.radians(22), math.radians(31)),
        "c": (math.radians(16), math.radians(-28), math.radians(-10)),
    }.get(variant, (0.0, 0.0, 0.0))
    _apply_object_transforms(rock)
    _voxel_retopologize(rock, 3000)
    _assign_material(rock, mats["Material_Rock"])
    rock["sf_component"] = "cc0_scan_retopologized_hero"
    rock["sf_close_only"] = False
    rock["sf_source"] = str(source.relative_to(ROOT)).replace("\\", "/")

    # Sparse emissive seams improve mining readability without repainting the
    # whole rock or obscuring the scan's geological silhouette.
    seams: list[bpy.types.Object] = []
    seam_specs = {
        "a": [((5.8, 0.16, 0.34), (0.3, 0.65, 0.1)), ((2.4, 0.12, 0.22), (-2.4, 0.2, 1.4))],
        "b": [((0.22, 4.8, 0.36), (0.6, 0.4, 0.2)), ((0.18, 2.2, 0.22), (-0.8, 1.5, -0.4))],
        "c": [((2.8, 0.18, 0.32), (1.1, 0.4, 1.4)), ((0.3, 2.4, 0.24), (-1.0, 0.8, -0.8))],
    }
    for index, (size, loc) in enumerate(seam_specs.get(variant, [])):
        seams.append(base.make_box(
            f"V6_OreSeam_{variant.upper()}_{index}", size, loc,
            mats["Material_Warm"], coll, detail=1,
            component="emissive", keep_separate=True, close_only=True,
        ))
    return [rock, *seams]


_original_lighting = base.setup_studio_lights


def setup_v6_lights(gamesky: bool = False) -> None:
    _original_lighting(gamesky)
    scene = bpy.context.scene
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = 1.15 if gamesky else 0.55
    for obj in bpy.data.objects:
        if obj.type == "LIGHT":
            obj.data.energy *= 1.55 if gamesky else 1.25
    world = scene.world
    if world and world.use_nodes:
        background = world.node_tree.nodes.get("Background")
        if background:
            # Keep the evidence field near-black so the objective margin probe
            # measures the model silhouette instead of classifying the entire
            # gray world background as foreground. Illumination comes from the
            # authored area lights above, not a flat ambient wash.
            background.inputs[0].default_value = (0.004, 0.008, 0.014, 1.0)
            background.inputs[1].default_value = 0.10 if gamesky else 0.14


def _write_adaptation_record() -> None:
    evidence = PACKET_ROOT / "evidence"
    evidence.mkdir(parents=True, exist_ok=True)
    record = {
        "schema": "spaceface.assetAdaptation.v1",
        "packet": base.PACKET,
        "candidateOnly": True,
        "livePromotion": False,
        "sources": [
            {
                "role": "station_macro_donor",
                "path": str(DONOR.relative_to(ROOT)).replace("\\", "/"),
                "license": "CC0-1.0",
                "sha256": _sha256(DONOR),
                "adaptation": "needle-noise removal, scale normalization, material-role reassignment, bounded topology, functional mass integration",
            },
            {
                "role": "hero_rocks_and_industrial_detail",
                "path": str(VENDOR_ROOT.relative_to(ROOT)).replace("\\", "/"),
                "license": "CC0-1.0 / Kenney permissive",
                "adaptation": "source-based hero-rock variants and subordinate functional kitbash",
            },
        ],
        "qualityIntent": "Kestrel Borrowed Time or better; no primitive downgrade; professional place-family readability",
    }
    (evidence / "SOURCE_ADAPTATION.json").write_text(json.dumps(record, indent=2), encoding="utf-8")


base.BUILDERS["helios_hub_station"] = build_hub_v6
base.BUILDERS["helios_gate"] = build_gate_v6
base.BUILDERS["helios_rock_a"] = build_rock_v6
base.BUILDERS["helios_rock_b"] = build_rock_v6
base.BUILDERS["helios_rock_c"] = build_rock_v6
base.setup_studio_lights = setup_v6_lights


if __name__ == "__main__":
    _write_adaptation_record()
    raise SystemExit(base.main())
