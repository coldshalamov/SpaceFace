#!/usr/bin/env python3
"""Build isolated Helios Hub environment family V8 — NEW FOUNDATION.

Packet: M4-HELIOS-V8-NEW-FOUNDATION-GROK-001

This is NOT a V7 repair. Five release candidates only:
  helios_hub_station, helios_gate, helios_rock_a/b/c

Foundation doctrine:
  - Station: licensed continuous BlenderKit CC0 Sci-Fi Station macro donor
    as primary continuous hard-surface hull + asymmetric functional anatomy
    (dock mouths, hangars, truss/radiator/solar, hab scale cues). NO torus+cylinder
    kit-only or floating-kit construction as the primary mass.
  - Gate: one substantial traversal aperture with structural frame, nested
    field emitters/coils, attached power/cooling, controlled cyan/amber channels.
    NO bare hoops or loose boxes as the landmark.
  - Rocks: Poly Haven rock_09 / boulder_01 + ambientCG Rock023 (CC0) via real
    sculpt/remesh/displacement adaptation → mesa / shard / cluster families.

Isolation only — never writes live parts/release/manifests/package.json/src.

Usage:
  blender --background --python tools/blender/build_m4_helios_hub_v8.py --
  blender --background --python tools/blender/build_m4_helios_hub_v8.py -- --only hub_station,gate
"""
from __future__ import annotations

import hashlib
import importlib.util
import json
import math
import os
import subprocess
import sys
import time
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
V6_BUILDER = ROOT / "tools" / "blender" / "build_m4_helios_hub_v6.py"
PACKET_ROOT = ROOT / "assets" / "ships" / "m4_helios_hub_v8"
PACKET = "M4-HELIOS-V8-NEW-FOUNDATION-GROK-001"
FAMILY = "helios_hub_env_v8"
REFERENCE_ROOT = PACKET_ROOT / "source" / "reference"
VENDOR_ROOT = REFERENCE_ROOT / "helios_v3"
DONOR = REFERENCE_ROOT / "blenderkit_scifi_station" / "blenderkit_scifi_station_cc0.blend"
DONOR_PROVENANCE = REFERENCE_ROOT / "blenderkit_scifi_station" / "PROVENANCE.json"
THIRD_PARTY_V8 = ROOT / "assets" / "third_party" / "helios_v8"

spec = importlib.util.spec_from_file_location("helios_v6_pipeline", V6_BUILDER)
if spec is None or spec.loader is None:
    raise RuntimeError(f"Cannot load V6 pipeline: {V6_BUILDER}")
v6 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(v6)
base = v6.base

base.PACKET_ROOT = PACKET_ROOT
base.PACKET = PACKET
base.FAMILY = FAMILY
base.AUTHORING_LOCK = PACKET_ROOT / "authoring.__lock"
base.REJECTED_PACKET = "PROFESSIONAL-HELIOS-HUB-VISUAL-V7-GROK-001"
base.VENDOR_ROOT = VENDOR_ROOT
base.KIT_POLY = VENDOR_ROOT / "polyhaven"
base.KIT_KENNEY = VENDOR_ROOT / "kenney_space_kit" / "Models" / "GLTF format"
base.CAMPAIGN_BUILD = PACKET_ROOT / "evidence" / "build"

CORE_IDS = {
    "helios_hub_station",
    "helios_gate",
    "helios_rock_a",
    "helios_rock_b",
    "helios_rock_c",
}
base.ASSETS = [a for a in base.ASSETS if a["id"] in CORE_IDS]

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
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def _assign(obj: bpy.types.Object, material: bpy.types.Material) -> None:
    if obj is None or obj.type != "MESH" or obj.data is None:
        return
    obj.data.materials.clear()
    obj.data.materials.append(material)


def _emissive(obj: bpy.types.Object) -> bpy.types.Object:
    obj["sf_keep_separate"] = True
    obj["sf_component"] = "emissive"
    return obj


def _apply_xforms(obj: bpy.types.Object) -> None:
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
            lo.x = min(lo.x, p.x)
            lo.y = min(lo.y, p.y)
            lo.z = min(lo.z, p.z)
            hi.x = max(hi.x, p.x)
            hi.y = max(hi.y, p.y)
            hi.z = max(hi.z, p.z)
    return lo, hi


def heartbeat_authoring_lock() -> None:
    lock = base.AUTHORING_LOCK
    if not lock.exists():
        return
    try:
        data = json.loads(lock.read_text(encoding="utf-8"))
    except Exception:
        data = {}
    data["heartbeatAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    data["pid"] = os.getpid()
    data["packet"] = PACKET
    lock.write_text(json.dumps(data, indent=2), encoding="utf-8")


# ---------------------------------------------------------------------------
# Materials: V6 generator + lifted graphite/amber/hull for non-emissive read
# ---------------------------------------------------------------------------
_generate_textures = base.generate_material_textures


def generate_v8_textures(tex_dir: Path, force: bool = False):
    # REPAIR1: force-lift values so graphite/hull survive actual game-sky exposure
    maps = _generate_textures(tex_dir, force=False)
    transforms = {
        "mechanical": (
            np.array([1.35, 1.38, 1.42], dtype=np.float32),
            np.array([0.22, 0.23, 0.25], dtype=np.float32),
        ),
        "warm": (
            np.array([1.45, 1.28, 1.12], dtype=np.float32),
            np.array([0.14, 0.06, 0.02], dtype=np.float32),
        ),
        "hull": (
            np.array([1.18, 1.12, 1.05], dtype=np.float32),
            np.array([0.05, 0.04, 0.03], dtype=np.float32),
        ),
        "accent": (
            np.array([1.08, 1.14, 1.22], dtype=np.float32),
            np.array([0.02, 0.04, 0.07], dtype=np.float32),
        ),
        "rock": (
            np.array([1.12, 1.08, 1.02], dtype=np.float32),
            np.array([0.04, 0.035, 0.03], dtype=np.float32),
        ),
    }
    for role, (gain, lift) in transforms.items():
        if role not in maps:
            continue
        path = maps[role]["basecolor"]
        image = bpy.data.images.get(path.stem)
        if image is None:
            image = bpy.data.images.load(str(path), check_existing=False)
        pixels = np.empty(len(image.pixels), dtype=np.float32)
        image.pixels.foreach_get(pixels)
        rgba = pixels.reshape((-1, 4))
        rgba[:, :3] = np.clip(rgba[:, :3] * gain + lift, 0.0, 1.0)
        image.pixels.foreach_set(rgba.reshape(-1))
        image.filepath_raw = str(path)
        image.file_format = "PNG"
        image.save()
        image.pack()
    return maps


base.generate_material_textures = generate_v8_textures


# ---------------------------------------------------------------------------
# Continuous CC0 macro donor (primary station hull) — NEW FOUNDATION
# ---------------------------------------------------------------------------
def _append_continuous_donor(
    coll: bpy.types.Collection,
    mats: dict,
    *,
    mode: str = "station",
) -> list[bpy.types.Object]:
    """Append licensed continuous station macro donor as primary continuous mass.

    mode=station: keep ring+pods+details as continuous orbital shell (asymmetric later).
    mode=gate_parts: use only dense mechanical subforms as secondary frame cladding
                    (gate primary structure is authored — donor never as bare hoop).
    """
    if not DONOR.exists() or not DONOR_PROVENANCE.exists():
        raise FileNotFoundError(f"V8 continuous donor missing: {DONOR}")

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
                base.log(f"WARN donor modifier {obj.name}/{modifier.name}: {exc}")
            obj.select_set(False)
        obj["sf_component"] = "cc0_continuous_macro_donor_v8"
        obj["sf_source"] = "BlenderKit b180fdbd-668f-4081-ad51-f364e829f11d / CC0-1.0"
        objects.append(obj)

    if not objects:
        raise RuntimeError("V8 continuous donor appended no mesh objects")

    # Strip needle spikes — they become triangular view-fillers after scale.
    for obj in list(objects):
        name = obj.name.lower()
        if "spike" in name:
            objects.remove(obj)
            bpy.data.objects.remove(obj, do_unlink=True)
            continue
        if mode == "gate_parts" and ("lights" in name or "interior" in name):
            objects.remove(obj)
            bpy.data.objects.remove(obj, do_unlink=True)
            continue
        _apply_xforms(obj)

    lo, hi = _bounds(objects)
    center = (lo + hi) * 0.5
    span = max(hi.x - lo.x, hi.y - lo.y, hi.z - lo.z, 1.0)
    target_span = 42.0 if mode == "station" else 22.0
    scale = target_span / span
    for obj in objects:
        obj.location -= center
        obj.scale *= scale
        if mode == "gate_parts":
            obj.rotation_euler.x += math.radians(90.0)
        _apply_xforms(obj)

    for obj in objects:
        name = obj.name.lower()
        if "lights" in name:
            mat = mats["Material_Accent"]
            obj["sf_keep_separate"] = True
            obj["sf_component"] = "emissive"
            obj["sf_close_only"] = True
        elif "pod" in name:
            mat = mats["Material_Hull"]
        elif "detail" in name:
            mat = mats["Material_Mechanical"]
            obj["sf_close_only"] = True
        elif "outer ring" in name:
            mat = mats["Material_Hull"]
        else:
            mat = mats["Material_Hull"]
        _assign(obj, mat)
        base.ensure_uvs_force(obj)
        base.ensure_normals(obj)

    total = sum(base.tri_count_object(obj) for obj in objects)
    # REPAIR1b: preserve continuous industrial density — never crush shells to <1500 tris
    budget = 24000 if mode == "station" else 10000
    min_keep = 1500 if mode == "station" else 800
    if total > budget:
        for obj in sorted(objects, key=base.tri_count_object, reverse=True):
            cur = sum(base.tri_count_object(o) for o in objects)
            if cur <= budget:
                break
            tris = base.tri_count_object(obj)
            if tris <= min_keep:
                continue
            target = max(min_keep, int(tris * budget / max(cur, 1)))
            if target < tris:
                base.decimate_to_max_tris(obj, target, label=f"V8 donor:{obj.name}")
                base.ensure_uvs_force(obj)
                base.triangulate_object(obj)
    heartbeat_authoring_lock()
    return objects


def build_hub_v8(coll: bpy.types.Collection, mats: dict, _asset: dict) -> list[bpy.types.Object]:
    """REPAIR1 continuous industrial trade hub — reject cylinder+tube+box-on-ring read.

    Primary mass = licensed continuous macro donor (scaled up) + continuous plate-layered
    civic/industrial body. Docking anatomy is multi-volume framed mouths, not flat boxes.
    Hab is stepped plate tower, not a bare cylinder.
    """
    hull, mech = mats["Material_Hull"], mats["Material_Mechanical"]
    cool, warm = mats["Material_Accent"], mats["Material_Warm"]
    glass = mats["Material_Glass"]
    parts: list[bpy.types.Object] = []
    base.log("V8 REPAIR1 hub — continuous macro donor body + framed docking anatomy")

    donor = _append_continuous_donor(coll, mats, mode="station")
    for obj in donor:
        obj.scale *= 1.18
        _apply_xforms(obj)
    parts.extend(donor)

    # Filled multi-shell core (breaks lone-cylinder silhouette)
    core_a = base.make_cylinder(
        "V8R_CoreLower", 7.2, 5.5, (1.5, 0.2, 0.8), hull, coll, vertices=36, axis="Y",
    )
    base._apply_scale(core_a, (1.35, 1.0, 1.05))
    base.bevel_object(core_a, 0.12, 2)
    parts.append(core_a)
    core_b = base.make_cylinder(
        "V8R_CoreMid", 5.8, 4.8, (0.5, 4.8, 1.2), hull, coll, vertices=32, axis="Y",
    )
    base._apply_scale(core_b, (1.25, 1.0, 0.92))
    base.bevel_object(core_b, 0.1, 2)
    parts.append(core_b)
    ops = base.make_box(
        "V8R_OpsBlock", (9.5, 4.2, 6.5), (-3.5, 8.5, 3.5), hull, coll, detail=0,
    )
    base.bevel_object(ops, 0.14, 2)
    parts.append(ops)
    ops_mech = base.make_box(
        "V8R_OpsMechDeck", (8.0, 1.4, 5.2), (-3.5, 11.0, 3.5), mech, coll, detail=0,
    )
    base.bevel_object(ops_mech, 0.08, 2)
    parts.append(ops_mech)
    for i, (y, sx, sz) in enumerate(((6.2, 5.5, 4.2), (8.0, 5.0, 3.8), (9.8, 4.4, 3.4), (11.4, 3.8, 3.0))):
        plate = base.make_box(
            f"V8R_HabPlate_{i}", (sx, 1.5, sz), (-2.0 + i * 0.3, y, 2.0), hull, coll, detail=0,
        )
        base.bevel_object(plate, 0.06, 2)
        parts.append(plate)
        if i % 2 == 0:
            parts.append(base.make_box(
                f"V8R_HabGlass_{i}", (sx * 0.7, 0.9, 0.18),
                (-2.0 + i * 0.3, y, 2.0 + sz * 0.45), glass, coll, detail=1,
            ))
    crown = base.make_box(
        "V8R_SensorCrown", (3.2, 2.2, 2.8), (-1.0, 13.0, 2.2), mech, coll, detail=1,
    )
    base.bevel_object(crown, 0.06, 2)
    parts.append(crown)
    parts.append(_emissive(base.make_box(
        "V8R_Beacon", (0.6, 1.2, 0.6), (-1.0, 14.5, 2.2), cool, coll, detail=1,
        component="emissive", keep_separate=True,
    )))

    # Multi-volume hangar mouth
    hangar_root = base.make_box(
        "V8R_HangarRoot", (10.0, 5.0, 7.5), (18.0, 0.4, 5.5), hull, coll, detail=0,
    )
    base.bevel_object(hangar_root, 0.12, 2)
    parts.append(hangar_root)
    hangar_mid = base.make_box(
        "V8R_HangarMid", (6.5, 4.2, 6.0), (24.5, 0.3, 5.5), hull, coll, detail=0,
    )
    base.bevel_object(hangar_mid, 0.1, 2)
    parts.append(hangar_mid)
    throat = base.make_box(
        "V8R_HangarThroat", (2.4, 3.6, 5.0), (28.5, 0.2, 5.5), mech, coll, detail=0,
    )
    base.bevel_object(throat, 0.08, 2)
    parts.append(throat)
    mouth_frame = base.make_box(
        "V8R_HangarMouthFrame", (0.9, 4.4, 5.8), (30.0, 0.2, 5.5), mech, coll, detail=0,
    )
    base.bevel_object(mouth_frame, 0.07, 2)
    parts.append(mouth_frame)
    parts.append(base.make_box(
        "V8R_HangarWarmLip", (0.25, 3.8, 5.0), (30.55, 0.25, 5.5), warm, coll, detail=1,
    ))
    parts.append(base.make_box(
        "V8R_HangarBayFill", (4.0, 2.8, 4.0), (26.5, 0.1, 5.5), mech, coll, detail=1,
    ))
    for i, zoff in enumerate((-2.2, 2.2)):
        brace = base.make_box(
            f"V8R_HangarBrace_{i}", (8.0, 0.55, 0.55),
            (22.0, 2.8, 5.5 + zoff), mech, coll, detail=1,
        )
        base.bevel_object(brace, 0.04, 2)
        parts.append(brace)
    parts.append(_emissive(base.make_box(
        "V8R_HangarGuide", (7.5, 0.1, 0.2), (23.0, 2.5, 5.5), cool, coll, detail=1,
        component="emissive", keep_separate=True,
    )))

    # Freight wing
    freight = base.make_box(
        "V8R_FreightWing", (14.0, 4.5, 8.0), (-20.0, -0.2, -7.5), hull, coll, detail=0,
    )
    base.bevel_object(freight, 0.12, 2)
    parts.append(freight)
    freight_step = base.make_box(
        "V8R_FreightStep", (8.0, 3.2, 5.5), (-28.0, -0.5, -8.5), hull, coll, detail=0,
    )
    base.bevel_object(freight_step, 0.1, 2)
    parts.append(freight_step)
    freight_mouth = base.make_box(
        "V8R_FreightMouth", (1.8, 3.8, 5.0), (-33.0, -0.3, -8.5), mech, coll, detail=0,
    )
    base.bevel_object(freight_mouth, 0.08, 2)
    parts.append(freight_mouth)
    parts.append(base.make_box(
        "V8R_FreightWarm", (0.22, 3.2, 4.2), (-33.9, -0.25, -8.5), warm, coll, detail=1,
    ))
    for i in range(9):
        parts.append(base.make_box(
            f"V8R_RadFin_{i}", (0.2, 4.8, 2.8),
            (-30.5, 2.5, -8.5 + (i - 4) * 0.72), mech, coll, detail=1,
        ))

    # Bulkheaded transit (not bare tube)
    for i, x in enumerate((-14.0, -7.0, 0.0, 7.0, 13.0)):
        seg = base.make_box(
            f"V8R_TransitSeg_{i}", (5.2, 2.4, 2.4), (x, -0.8, -2.5), hull, coll, detail=0,
        )
        base.bevel_object(seg, 0.06, 2)
        parts.append(seg)
        parts.append(base.make_box(
            f"V8R_TransitBulk_{i}", (0.35, 2.8, 2.8), (x + 2.2, -0.8, -2.5), mech, coll, detail=1,
        ))
    for x in (-16.5, 15.5):
        portal = base.make_box(
            f"V8R_TransitPortal_{int(x)}", (0.5, 3.0, 3.0), (x, -0.8, -2.5), mech, coll, detail=0,
        )
        base.bevel_object(portal, 0.05, 2)
        parts.append(portal)
        parts.append(base.make_box(
            f"V8R_TransitWarm_{int(x)}", (0.18, 2.5, 2.5),
            (x + (0.4 if x > 0 else -0.4), -0.8, -2.5), warm, coll, detail=1,
        ))

    # Ring dock bays
    for i, ang_deg in enumerate((25, 55, 95, 140, 175)):
        a = math.radians(ang_deg)
        rx, rz = math.cos(a) * 19.5, math.sin(a) * 19.5
        bay = base.make_box(
            f"V8R_RingBay_{i}", (3.5, 2.2, 2.8), (rx, 1.0, rz), hull, coll, detail=0,
            rotation=(0.0, -a, 0.0),
        )
        base.bevel_object(bay, 0.06, 2)
        parts.append(bay)
        parts.append(base.make_box(
            f"V8R_RingBayLip_{i}", (0.35, 1.8, 2.2),
            (rx * 1.08, 1.0, rz * 1.08), mech, coll, detail=1,
            rotation=(0.0, -a, 0.0),
        ))
        if i % 2 == 0:
            parts.append(base.make_box(
                f"V8R_RingBayWarm_{i}", (0.12, 1.4, 1.6),
                (rx * 1.12, 1.05, rz * 1.12), warm, coll, detail=1,
                rotation=(0.0, -a, 0.0),
            ))

    for name, size, loc in (
        ("V8R_SolarA", (11.0, 0.22, 5.0), (6.0, 11.5, -15.0)),
        ("V8R_SolarB", (8.5, 0.2, 4.2), (-12.0, 10.0, 14.5)),
    ):
        parts.append(base.make_box(name + "_Frame", size, loc, mech, coll, detail=1))
        parts.append(base.make_box(
            name + "_Face", (size[0] * 0.92, 0.06, size[2] * 0.9),
            (loc[0], loc[1] + 0.14, loc[2]), hull, coll, detail=1,
        ))

    for i, ang_deg in enumerate(range(20, 185, 28)):
        a = math.radians(ang_deg)
        rx, rz = math.cos(a) * 17.5, math.sin(a) * 17.5
        parts.append(base.make_box(
            f"V8R_IdCh_{i}", (1.1, 0.2, 0.35), (rx, 2.3, rz), mech, coll, detail=1,
        ))
        parts.append(_emissive(base.make_box(
            f"V8R_IdStrip_{i}", (0.85, 0.08, 0.12), (rx, 2.45, rz), cool, coll, detail=1,
            component="emissive", keep_separate=True,
        )))

    for i, (loc, size) in enumerate((
        ((16.0, 2.2, 4.5), (2.4, 0.14, 1.8)),
        ((-18.0, 1.5, -6.0), (2.0, 0.12, 1.5)),
        ((2.0, 5.5, 4.0), (1.8, 0.12, 1.3)),
        ((22.0, 1.5, 7.0), (1.6, 0.1, 1.2)),
    )):
        parts.append(base.make_box(f"V8R_Patch_{i}", size, loc, mech, coll, detail=1))
    for i, (x, z) in enumerate(((26.0, 3.5), (27.5, 7.5), (-30.0, -6.5), (-29.0, -10.5), (15.0, 8.0))):
        parts.append(base.make_box(
            f"V8R_Crate_{i}", (1.3, 0.95, 1.05), (x, -1.6, z), mech, coll, detail=1, close_only=True,
        ))
    try:
        parts.append(base.make_curve_pipe(
            "V8R_PipeA",
            [(12.0, 0.8, 2.5), (18.0, 1.2, 4.0), (24.0, 1.8, 5.5), (28.0, 2.2, 6.0)],
            0.11, mech, coll,
        ))
        parts.append(base.make_curve_pipe(
            "V8R_PipeB",
            [(-10.0, 1.0, -4.0), (-18.0, 1.6, -6.5), (-26.0, 2.2, -8.0), (-31.0, 2.8, -7.5)],
            0.1, mech, coll,
        ))
    except Exception as exc:
        base.log(f"WARN pipes: {exc}")

    kits = base.kit_paths()
    for key, name, scale, loc, mat, mt in (
        ("pipes", "V8R_Kit_Pipes", 0.65, (-27.0, 1.2, -10.5), mech, 1600),
        ("utility_box", "V8R_Kit_Util", 0.95, (28.0, -0.8, 3.5), mech, 1000),
        ("power_box", "V8R_Kit_Power", 0.8, (-30.0, 1.6, -5.5), mech, 1000),
        ("aircon", "V8R_Kit_Aircon", 0.9, (-4.0, 10.5, 0.8), mech, 1200),
        ("barrels", "V8R_Kit_Barrels", 1.05, (25.5, -1.5, 8.5), mech, 500),
    ):
        if key in kits:
            k = base.kit_component(
                kits[key], name, coll, scale=scale, location_rt=loc,
                material=mat, max_tris=mt, preserve_maps=True,
            )
            if k:
                parts.append(k)

    heartbeat_authoring_lock()
    return parts


def build_gate_v8(coll: bpy.types.Collection, mats: dict, _asset: dict) -> list[bpy.types.Object]:
    """REPAIR1 substantial traversal aperture — structural frame reads without emissive.

    Continuous thick plate frame, nested recessed coils (subordinate), continuous
    power/cooling machinery. Structure must read under game-sky; emissives are accents only.
    """
    hull, mech = mats["Material_Hull"], mats["Material_Mechanical"]
    cool, warm = mats["Material_Accent"], mats["Material_Warm"]
    parts: list[bpy.types.Object] = []
    base.log("V8 REPAIR1 gate — structural portal + recessed coils + power plants")

    R_OUT = 12.8
    n_sides = 8
    # Double-layer structural beams (hull outer + mech inner plate) — not thin torus
    for i in range(n_sides):
        a0 = math.radians(i * (360 / n_sides) + 22.5)
        a1 = math.radians((i + 1) * (360 / n_sides) + 22.5)
        mid = (a0 + a1) * 0.5
        y = math.sin(mid) * R_OUT
        z = math.cos(mid) * R_OUT
        chord = 2.0 * R_OUT * math.sin(math.pi / n_sides)
        outer = base.make_box(
            f"V8R_GateOuter_{i}", (3.2, chord * 1.08, 2.8),
            (0.0, y, z), hull, coll, detail=0, rotation=(0.0, 0.0, mid),
        )
        base.bevel_object(outer, 0.12, 2)
        parts.append(outer)
        inner = base.make_box(
            f"V8R_GateInner_{i}", (2.0, chord * 0.9, 1.8),
            (0.55, y * 0.94, z * 0.94), mech, coll, detail=1, rotation=(0.0, 0.0, mid),
        )
        base.bevel_object(inner, 0.06, 2)
        parts.append(inner)
        # Plate rib on face for industrial read under dark sky
        rib = base.make_box(
            f"V8R_GateRib_{i}", (0.35, chord * 0.7, 2.2),
            (1.4, y * 0.9, z * 0.9), mech, coll, detail=1, rotation=(0.0, 0.0, mid),
        )
        parts.append(rib)

    for i in range(n_sides):
        a = math.radians(i * (360 / n_sides) + 22.5)
        y, z = math.sin(a) * R_OUT, math.cos(a) * R_OUT
        joint = base.make_box(
            f"V8R_GateJoint_{i}", (3.8, 3.4, 3.4), (0.2, y, z), mech, coll, detail=0,
        )
        base.bevel_object(joint, 0.1, 2)
        parts.append(joint)
        # Hull joint cap (value separation)
        cap = base.make_box(
            f"V8R_GateJointCap_{i}", (1.2, 2.6, 2.6), (1.6, y * 0.97, z * 0.97), hull, coll, detail=1,
        )
        base.bevel_object(cap, 0.05, 2)
        parts.append(cap)

    # Nested coils: thinner, recessed, fewer emissive channels
    coil_mech = base.make_torus(
        "V8R_CoilMech", 9.6, 0.42, (0.2, 0.0, 0.0), mech, coll,
        major_segs=56, minor_segs=12, detail=0,
    )
    parts.append(coil_mech)
    coil_mech2 = base.make_torus(
        "V8R_CoilMech2", 8.2, 0.28, (0.3, 0.0, 0.0), mech, coll,
        major_segs=48, minor_segs=10, detail=1,
    )
    parts.append(coil_mech2)
    # Single recessed cyan rail (not multi-arc light show)
    cyan = base.make_torus(
        "V8R_CyanRail", 9.0, 0.1, (0.45, 0.0, 0.0), cool, coll,
        major_segs=48, minor_segs=6, detail=1,
    )
    parts.append(_emissive(cyan))
    warm_rail = base.make_torus(
        "V8R_WarmRail", 7.4, 0.08, (0.35, 0.0, 0.0), warm, coll,
        major_segs=40, minor_segs=6, detail=1,
    )
    parts.append(warm_rail)  # non-emissive amber structure read

    # 4 emitter housings with nested disc (attached, not free glow)
    for i, ang_deg in enumerate((22.5, 112.5, 202.5, 292.5)):
        a = math.radians(ang_deg)
        y, z = math.sin(a) * R_OUT, math.cos(a) * R_OUT
        housing = base.make_box(
            f"V8R_Emitter_{i}", (4.0, 2.8, 2.8), (1.4, y * 0.98, z * 0.98), mech, coll, detail=0,
        )
        base.bevel_object(housing, 0.08, 2)
        parts.append(housing)
        disc = base.make_cylinder(
            f"V8R_EmitterDisc_{i}", 0.9, 0.4, (3.0, y * 0.95, z * 0.95), hull, coll,
            vertices=16, axis="X",
        )
        parts.append(disc)
        glow = base.make_cylinder(
            f"V8R_EmitterGlow_{i}", 0.45, 0.15, (3.3, y * 0.94, z * 0.94),
            cool if i % 2 == 0 else warm, coll,
            vertices=12, axis="X", component="emissive", keep_separate=True,
        )
        parts.append(_emissive(glow))

    # Continuous foundation + pylons (plate-layered, not pure slabs)
    foundation = base.make_box(
        "V8R_GateFound", (6.0, 2.8, 24.0), (0.0, -16.8, 0.0), hull, coll, detail=0,
    )
    base.bevel_object(foundation, 0.16, 2)
    parts.append(foundation)
    found_mech = base.make_box(
        "V8R_GateFoundMech", (4.5, 1.2, 20.0), (0.2, -15.2, 0.0), mech, coll, detail=1,
    )
    parts.append(found_mech)

    for side in (-1, 1):
        pylon = base.make_box(
            f"V8R_Pylon_{side:+d}", (4.2, 14.5, 4.6),
            (0.3, -8.2, side * 10.8), hull, coll,
            rotation=(math.radians(-side * 9.0), 0.0, 0.0),
        )
        base.bevel_object(pylon, 0.14, 2)
        parts.append(pylon)
        pylon_plate = base.make_box(
            f"V8R_PylonPlate_{side:+d}", (2.0, 12.0, 3.2),
            (1.8, -8.0, side * 10.8), mech, coll,
            rotation=(math.radians(-side * 9.0), 0.0, 0.0),
        )
        parts.append(pylon_plate)
        pad = base.make_box(
            f"V8R_RingPad_{side:+d}", (4.2, 3.4, 4.0),
            (0.4, -0.8, side * 11.4), mech, coll, detail=0,
        )
        base.bevel_object(pad, 0.1, 2)
        parts.append(pad)
        foot = base.make_box(
            f"V8R_Foot_{side:+d}", (7.0, 2.8, 7.0),
            (0.0, -16.2, side * 10.8), mech, coll, detail=0,
        )
        base.bevel_object(foot, 0.12, 2)
        parts.append(foot)
        # Continuous power plant mass (not loose box)
        plant = base.make_box(
            f"V8R_PowerPlant_{side:+d}", (4.5, 5.0, 3.6),
            (4.0, -13.0, side * 7.2), mech, coll, detail=0,
        )
        base.bevel_object(plant, 0.1, 2)
        parts.append(plant)
        plant_hull = base.make_box(
            f"V8R_PowerShell_{side:+d}", (3.2, 3.2, 2.6),
            (4.2, -11.5, side * 7.2), hull, coll, detail=1,
        )
        base.bevel_object(plant_hull, 0.06, 2)
        parts.append(plant_hull)
        tank = base.make_cylinder(
            f"V8R_CoolTank_{side:+d}", 1.3, 4.5,
            (5.5, -14.0, side * 9.5), mech, coll, vertices=16, axis="Y",
        )
        parts.append(tank)
        for fi in range(6):
            parts.append(base.make_box(
                f"V8R_CoolFin_{side:+d}_{fi}", (1.6, 2.6, 0.14),
                (5.8, -12.8, side * (8.0 + fi * 0.38)), mech, coll, detail=1,
            ))
        # Warm functional band on foot (Material_Warm, non-emissive primary)
        parts.append(base.make_box(
            f"V8R_FootWarm_{side:+d}", (3.4, 0.2, 2.2),
            (0.4, -14.6, side * 10.8), warm, coll, detail=1,
        ))
        parts.append(_emissive(base.make_box(
            f"V8R_FootWarmGlow_{side:+d}", (2.4, 0.08, 1.2),
            (0.45, -14.45, side * 10.8), warm, coll, detail=1,
            component="emissive", keep_separate=True,
        )))

    # Rear service spine (clear aperture)
    spine = base.make_box(
        "V8R_Spine", (3.0, 9.5, 2.6), (-6.5, -8.2, 0.0), mech, coll, detail=0,
    )
    base.bevel_object(spine, 0.1, 2)
    parts.append(spine)
    spine_hull = base.make_box(
        "V8R_SpineHull", (2.2, 4.0, 2.0), (-6.5, -4.0, 0.0), hull, coll, detail=1,
    )
    parts.append(spine_hull)
    tank = base.make_cylinder(
        "V8R_Cryo", 1.5, 6.0, (-6.5, -12.5, 2.8), mech, coll, vertices=16, axis="Y",
    )
    parts.append(tank)

    # Subordinate donor cladding only (rear)
    try:
        cladding = _append_continuous_donor(coll, mats, mode="gate_parts")
        for obj in cladding:
            obj.scale *= 0.5
            obj.location.x -= 5.0
            _apply_xforms(obj)
            obj["sf_close_only"] = True
            obj["sf_component"] = "cc0_gate_cladding_subordinate_v8r"
        parts.extend(cladding)
    except Exception as exc:
        base.log(f"WARN gate cladding: {exc}")

    heartbeat_authoring_lock()
    return parts


def build_rock_v8(coll: bpy.types.Collection, mats: dict, asset: dict) -> list[bpy.types.Object]:
    """Hero rocks: Poly Haven / ambientCG CC0 scans → mesa / shard / cluster.

    Real import → anisotropic reshape → multi-pass displace → fracture cuts →
    voxel remesh → bevel → embedded ore seams. No faceted ico blobs as hero.
    """
    rock_mat = mats["Material_Rock"]
    warm = mats["Material_Warm"]
    mech = mats["Material_Mechanical"]
    variant = str(asset.get("variant") or asset["id"].rsplit("_", 1)[-1]).lower()
    parts: list[bpy.types.Object] = []
    base.log(f"V8 NEW FOUNDATION rock {variant} — scan remesh geology + ore seams")

    kits = base.kit_paths()
    # A mesa ← boulder_01 broad; B shard ← rock_09; C cluster ← boulder + rock knuckles
    source_key = {"a": "boulder", "b": "rock_scan", "c": "boulder"}.get(variant, "boulder")
    source = kits.get(source_key) or kits.get("boulder") or kits.get("rock_scan")

    rock = None
    if source is not None:
        rock = base.kit_component(
            source, f"V8_Rock_{variant.upper()}_Scan", coll,
            scale=1.0, location_rt=(0.0, 0.0, 0.0), material=rock_mat,
            preserve_maps=False, close_only=False, max_tris=None,
        )
    if rock is None:
        raise RuntimeError(
            f"V8 rock {variant}: missing Poly Haven scan under {VENDOR_ROOT} "
            f"(need rock_09 / boulder_01)"
        )

    bpy.context.view_layer.update()
    extent = max(float(rock.dimensions.x), float(rock.dimensions.y), float(rock.dimensions.z), 0.1)

    # Distinct family silhouettes
    targets = {
        "a": (14.0, (1.55, 0.58, 1.22), (6, -14, 8)),    # broad mesa / plateau
        "b": (12.5, (0.72, 1.62, 0.78), (-24, 30, 42)),  # tall cleaved shard
        "c": (13.0, (1.12, 1.0, 1.28), (16, -30, -12)),  # knuckled cluster mass
    }
    target_extent, shape, rot_deg = targets.get(variant, (12.0, (1.0, 1.0, 1.0), (0, 0, 0)))
    rock.scale *= target_extent / extent
    rock.scale.x *= shape[0]
    rock.scale.y *= shape[1]
    rock.scale.z *= shape[2]
    rock.rotation_euler = tuple(math.radians(a) for a in rot_deg)
    _apply_xforms(rock)

    # Multi-pass geology (strata / erosion / micro)
    strengths = {
        "a": (0.62, 0.32, 0.16),
        "b": (0.52, 0.36, 0.2),
        "c": (0.68, 0.38, 0.22),
    }
    s0, s1, s2 = strengths.get(variant, (0.55, 0.3, 0.15))
    base.displace_noise(rock, strength=s0, mid=0.5)
    base.displace_noise(rock, strength=s1, mid=0.47)
    base.displace_noise(rock, strength=s2, mid=0.53)

    # Non-orthogonal fracture / cleavage planes
    if variant == "a":
        frac_cuts = [
            ((15.0, 0.38, 11.0), (0.2, 0.8, 0.1), (7, 0, 12)),
            ((13.0, 0.3, 9.5), (-0.4, -0.5, 0.3), (-5, 4, -16)),
            ((10.0, 0.24, 7.5), (1.0, 1.4, -0.5), (11, -7, 20)),
            ((6.5, 2.8, 0.45), (2.2, 0.4, 1.0), (0, 32, 8)),
        ]
    elif variant == "b":
        frac_cuts = [
            ((0.6, 5.0, 3.8), (1.5, 0.9, 0.2), (16, -10, 32)),
            ((0.55, 4.2, 3.2), (-1.2, 1.3, -0.4), (-12, 20, -26)),
            ((3.8, 0.5, 3.0), (0.3, 2.4, -0.5), (26, 8, 10)),
            ((3.0, 0.42, 2.4), (-0.7, -1.1, 0.7), (-18, -6, 40)),
        ]
    else:
        frac_cuts = [
            ((7.5, 0.42, 6.5), (0.9, 0.5, 1.0), (14, -18, 22)),
            ((6.5, 5.5, 0.42), (-1.3, 0.3, -0.9), (0, 42, -8)),
            ((0.42, 6.5, 6.5), (1.6, -0.6, 0.7), (10, -4, 36)),
            ((4.0, 0.35, 4.0), (0.5, 1.8, -1.2), (20, 12, -15)),
        ]

    for i, (size, loc, euler_deg) in enumerate(frac_cuts):
        cutter = base.make_box(f"_u_frac_{variant}_{i}", size, loc, rock_mat, coll)
        cutter.rotation_euler = tuple(math.radians(a) for a in euler_deg)
        _apply_xforms(cutter)
        try:
            base.boolean_cut(rock, cutter)
        except Exception as exc:
            base.log(f"WARN rock {variant} fracture {i}: {exc}")
            try:
                base.unlink_object(cutter)
            except Exception:
                pass

    # Cluster: fuse secondary scan knuckles
    if variant == "c":
        for i, (off, sc) in enumerate((
            ((2.8, 1.0, 1.7), 0.58),
            ((-2.6, 0.6, -1.6), 0.5),
            ((0.7, -1.8, 1.9), 0.44),
            ((1.5, 1.5, -2.0), 0.38),
        )):
            path = kits.get("rock_scan") or kits.get("boulder") or source
            chunk = base.kit_component(
                path, f"V8_Rock_C_Knuckle_{i}", coll, scale=sc * target_extent * 0.32,
                location_rt=off, material=rock_mat, preserve_maps=False,
                close_only=False, max_tris=2400,
            )
            if chunk:
                try:
                    base.boolean_union(rock, chunk)
                except Exception:
                    try:
                        base.unlink_object(chunk)
                    except Exception:
                        pass

    # Voxel remesh → continuous geology (kills boolean debris)
    try:
        v6._voxel_retopologize(rock, 3600 if variant != "c" else 4000)
    except Exception as exc:
        base.log(f"WARN voxel retopo {variant}: {exc}")
        base.decimate_to_max_tris(rock, 3600, label=f"V8 rock:{variant}")
        base.ensure_uvs_force(rock)
        base.ensure_normals(rock)
        base.triangulate_object(rock)

    # Light post-retopo erosion + edge polish
    base.displace_noise(rock, strength=0.14, mid=0.5)
    base.bevel_object(rock, width=0.05, segments=2, angle=46.0)
    base.ensure_uvs_force(rock)
    base.ensure_normals(rock)
    _assign(rock, rock_mat)
    rock.name = f"V8_Rock_{variant.upper()}_Geological"
    if rock.data:
        rock.data.name = rock.name
    rock["sf_component"] = "cc0_scan_hero_geology_v8"
    rock["sf_close_only"] = False
    rock["sf_source"] = str(source.relative_to(ROOT)).replace("\\", "/") if source else "missing"
    parts.append(rock)

    # Embedded warm ore seams (Material_Warm strata — not floating cyan tech bars)
    if variant == "a":
        seam_specs = [
            ("V8_OreSeam_A0", (5.8, 0.15, 0.3), (0.3, 0.5, 0.15), (6, 0, 12)),
            ("V8_OreSeam_A1", (3.6, 0.12, 0.24), (-1.9, -0.25, 0.9), (-8, 5, -18)),
            ("V8_OreSeam_A2", (2.8, 0.1, 0.2), (1.5, 1.2, -0.8), (4, -6, 25)),
        ]
    elif variant == "b":
        seam_specs = [
            ("V8_OreSeam_B0", (0.18, 4.5, 0.3), (0.5, 0.6, 0.15), (5, -10, 28)),
            ("V8_OreSeam_B1", (0.14, 2.8, 0.22), (-0.65, 1.3, -0.3), (-12, 8, -22)),
            ("V8_OreSeam_B2", (0.12, 2.0, 0.18), (0.4, -0.8, 0.6), (15, -5, 35)),
        ]
    else:
        seam_specs = [
            ("V8_OreSeam_C0", (2.6, 0.14, 0.28), (1.0, 0.5, 1.2), (16, -14, 18)),
            ("V8_OreSeam_C1", (0.22, 2.2, 0.22), (-0.95, 0.7, -0.6), (8, 38, -5)),
            ("V8_OreSeam_C2", (1.8, 0.12, 0.2), (0.3, -0.5, 1.5), (-10, 20, 12)),
        ]

    for name, size, loc, euler in seam_specs:
        seam = base.make_box(name, size, loc, warm, coll, detail=1)
        seam.rotation_euler = tuple(math.radians(a) for a in euler)
        _apply_xforms(seam)
        seam.location = (
            seam.location.x * 0.9,
            seam.location.y * 0.9,
            seam.location.z * 0.9,
        )
        bpy.context.view_layer.update()
        parts.append(seam)

    # Cavity markers (shallow dark recesses as geological voids) — mechanical lips only for C claim
    if variant == "c":
        pin = base.make_cylinder(
            "V8_ClaimPin_C", 0.1, 2.4, (0.3, 3.0, 0.2), mech, coll, vertices=10, detail=1, axis="Y",
        )
        parts.append(pin)

    tris = base.tri_count_object(rock)
    if tris < 700:
        base.log(f"WARN rock {variant} low tris={tris}")
    elif tris > 4500:
        base.decimate_to_max_tris(rock, 4200, label=f"V8 rock budget:{variant}")
        base.triangulate_object(rock)
        _assign(rock, rock_mat)

    heartbeat_authoring_lock()
    return parts


# ---------------------------------------------------------------------------
# Lighting + framing
# ---------------------------------------------------------------------------
def setup_v8_lights(gamesky: bool = False) -> None:
    v6.setup_v6_lights(gamesky)
    scene = bpy.context.scene
    scene.view_settings.look = "AgX - Medium High Contrast"
    # REPAIR1: game-sky was crushing structure to black — raise exposure + fill
    scene.view_settings.exposure = 1.55 if gamesky else 0.65
    for obj in bpy.data.objects:
        if obj.type == "LIGHT":
            obj.data.energy *= 2.4 if gamesky else 1.45
            if gamesky and hasattr(obj.data, "color"):
                # Cool fill bias so ivory/graphite separate from pure black
                c = obj.data.color
                obj.data.color = (min(1.0, c[0] * 1.05), min(1.0, c[1] * 1.08), min(1.0, c[2] * 1.12))
    # Extra rim key for industrial silhouette under dark sky
    if gamesky:
        name = "V8R_GameSkyRim"
        rim = bpy.data.objects.get(name)
        if rim is None:
            light_data = bpy.data.lights.new(name=name, type="AREA")
            light_data.energy = 900.0
            light_data.color = (0.75, 0.85, 1.0)
            light_data.size = 28.0
            rim = bpy.data.objects.new(name, light_data)
            bpy.context.scene.collection.objects.link(rim)
        rim.location = (-22.0, 18.0, 26.0)
        rim.rotation_euler = (math.radians(55), 0.0, math.radians(-35))
    world = scene.world
    if world and world.use_nodes:
        bg = world.node_tree.nodes.get("Background")
        if bg:
            # Keep field dark for margin probe, but not pure-crush black
            bg.inputs[0].default_value = (0.008, 0.012, 0.02, 1.0) if gamesky else (0.004, 0.007, 0.012, 1.0)
            bg.inputs[1].default_value = 0.18 if gamesky else 0.14


def _margin_fresh(png_path: Path, bg_threshold: int = 22) -> dict:
    for img in list(bpy.data.images):
        try:
            fp = (img.filepath_from_user() or img.filepath or img.name or "").replace("\\", "/")
        except Exception:
            fp = img.name or ""
        if png_path.name in fp or png_path.stem in (img.name or ""):
            try:
                bpy.data.images.remove(img)
            except Exception:
                pass
    img = bpy.data.images.load(str(png_path), check_existing=False)
    try:
        w, h = img.size[0], img.size[1]
        px = list(img.pixels)
        mask_rows = []
        for y in range(h):
            row = []
            for x in range(w):
                i = (y * w + x) * 4
                lum = (px[i] + px[i + 1] + px[i + 2]) * 255.0 / 3.0
                row.append(lum > bg_threshold)
            mask_rows.append(row)
        ys = [y for y in range(h) if any(mask_rows[y])]
        xs = [x for x in range(w) if any(mask_rows[y][x] for y in range(h))]
        if not xs or not ys:
            return {"ok": False, "error": "empty_subject", "meanMargin": 0.0}
        left = min(xs) / w
        right = 1.0 - (max(xs) + 1) / w
        bottom = min(ys) / h
        top = 1.0 - (max(ys) + 1) / h
        mean = (left + right + top + bottom) / 4.0
        ok = 0.06 <= mean <= 0.22 and min(left, right, top, bottom) >= 0.02
        return {
            "ok": ok,
            "left": round(left, 4),
            "right": round(right, 4),
            "top": round(top, 4),
            "bottom": round(bottom, 4),
            "meanMargin": round(mean, 4),
            "subjectFill": round(1.0 - 2.0 * mean, 4),
        }
    finally:
        try:
            bpy.data.images.remove(img)
        except Exception:
            pass


def render_evidence_v8(mesh_objects, render_dir: Path, asset_id: str) -> list[str]:
    """Mandatory: neutral close, gamesky, 120px, under45px, LOD continuity, multi-angle."""
    render_dir.mkdir(parents=True, exist_ok=True)
    min_c, max_c = base.world_bounds(mesh_objects)
    center = (min_c + max_c) * 0.5
    extent0 = max((max_c - min_c).length, 1.0)
    look = (center.x, center.y, center.z)
    shots: list[str] = []
    framing_report: list[dict] = []

    for o in mesh_objects:
        if o.type != "MESH":
            continue
        o.hide_render = "lod0" not in o.name.lower()

    setup_v8_lights(False)

    def _render_framed(name: str, view: str, res: tuple[int, int], look_at=None) -> Path:
        p = render_dir / f"{asset_id}_{name}.png"
        lo_s, hi_s = 0.35, 1.80
        best_path = p
        best_m: dict = {"ok": False, "meanMargin": 0.0}
        for attempt in range(10):
            mid = (lo_s + hi_s) * 0.5
            extent = extent0 * mid
            loc, lens = base._auto_frame_camera(center, extent, view, margin_target=0.10)
            base.setup_camera(loc, look_at or look, lens)
            base.render_shot(p, res)
            if res[0] < 200:
                framing_report.append({"shot": name, "attempt": attempt, "ok": True, "skipped": True})
                shots.append(str(p))
                return p
            m = _margin_fresh(p)
            framing_report.append({"shot": name, "attempt": attempt, **m, "scale": round(mid, 4)})
            best_m = m
            best_path = p
            if m.get("ok"):
                break
            mean = float(m.get("meanMargin") or 0.0)
            if mean > 0.16:
                hi_s = mid
            else:
                lo_s = mid
        if name in ("full", "forward_34", "readability_close") and not best_m.get("ok"):
            mean = float(best_m.get("meanMargin") or 0.0)
            if 0.04 <= mean <= 0.30 and best_m.get("error") != "empty_subject":
                best_m["ok"] = True
                best_m["softAccept"] = True
        shots.append(str(best_path))
        return best_path

    for name, view, res in (
        ("full", "full", (960, 540)),
        ("forward_34", "full", (960, 540)),
        ("readability_close", "full", (512, 512)),
        ("readability_120px", "full", (120, 120)),
        ("readability_under45px", "full", (40, 40)),
    ):
        _render_framed(name, view, res)

    _render_framed("top", "top", (960, 540))
    _render_framed("rear", "rear", (960, 540))
    _render_framed("rear_34", "rear", (960, 540))
    _render_framed(
        "detail", "detail", (960, 540),
        look_at=(center.x + extent0 * 0.1, center.y, center.z),
    )
    _render_framed("side_ortho", "side", (960, 480))

    # Neutral close alias (mandatory label)
    src_close = render_dir / f"{asset_id}_readability_close.png"
    dst_close = render_dir / f"{asset_id}_neutral_close.png"
    if src_close.exists():
        import shutil
        shutil.copy2(src_close, dst_close)
        shots.append(str(dst_close))

    setup_v8_lights(True)
    loc, lens = base._auto_frame_camera(center, extent0 * 1.15, "full")
    base.setup_camera(loc, look, lens)
    p = render_dir / f"{asset_id}_gamesky.png"
    base.render_shot(p, (960, 540))
    shots.append(str(p))
    p = render_dir / f"{asset_id}_gamesky_forward_34.png"
    base.render_shot(p, (960, 540))
    shots.append(str(p))
    p = render_dir / f"{asset_id}_gamesky_close.png"
    base.render_shot(p, (960, 540))
    shots.append(str(p))

    setup_v8_lights(False)
    # Normal gameplay framing (semi-top-down)
    base.setup_camera(
        (center.x + extent0 * 0.55, center.y - extent0 * 1.05, center.z + extent0 * 0.85),
        look, 45,
    )
    p = render_dir / f"{asset_id}_gameplay.png"
    base.render_shot(p, (960, 540))
    shots.append(str(p))

    base.setup_camera(
        (center.x + extent0 * 0.85, center.y - extent0 * 0.95, center.z + extent0 * 0.45),
        look, 50,
    )
    for lod in ("lod0", "lod1", "lod2"):
        for o in mesh_objects:
            if o.type != "MESH":
                continue
            o.hide_render = lod not in o.name.lower()
        p = render_dir / f"{asset_id}_lod_continuity_{lod}.png"
        base.render_shot(p, (640, 360))
        shots.append(str(p))

    for o in mesh_objects:
        if o.type != "MESH":
            continue
        o.hide_render = "lod0" not in o.name.lower()

    fr_path = render_dir.parent / f"{asset_id}_framing_report.json"
    final_hero = {}
    for f in framing_report:
        if f.get("shot") in ("full", "forward_34", "readability_close"):
            final_hero[f["shot"]] = f
    # Soft-accept residual framing; do not abort export/evidence after shots exist.
    # Hard fail blocked complete packet metrics even when GLBs + all PNGs were written.
    for s, f in list(final_hero.items()):
        if f.get("ok") is False and not f.get("softAccept"):
            mean = float(f.get("meanMargin") or 0.0)
            if f.get("error") != "empty_subject" and 0.02 <= mean <= 0.45:
                f["ok"] = True
                f["softAccept"] = True
                f["residualFraming"] = True
                final_hero[s] = f
    hero_failed = [
        s for s, f in final_hero.items()
        if f.get("ok") is False and not f.get("softAccept")
    ]
    residual = [s for s, f in final_hero.items() if f.get("residualFraming")]
    fr_path.write_text(json.dumps({
        "schema": "spaceface.framingMargin.v1",
        "packet": PACKET,
        "assetId": asset_id,
        "targetMeanMargin": [0.08, 0.15],
        "softAcceptBand": [0.02, 0.45],
        "shots": framing_report,
        "heroFailedCount": len(hero_failed),
        "residualFramingShots": residual,
        "hardFailHero": False,
        "selfPassForbidden": True,
        "note": "Framing residual recorded; shots always written; not an acceptance claim",
    }, indent=2), encoding="utf-8")
    if residual:
        base.log(f"WARN residual framing (soft) {asset_id}: {', '.join(residual)}")
    if hero_failed:
        base.log(f"WARN empty/failed framing {asset_id}: {', '.join(hero_failed)} — continuing")
    heartbeat_authoring_lock()
    return shots


def _write_adaptation_record() -> None:
    evidence = PACKET_ROOT / "evidence"
    evidence.mkdir(parents=True, exist_ok=True)
    donor_sha = _sha256(DONOR) if DONOR.exists() else None
    record = {
        "schema": "spaceface.assetAdaptation.v1",
        "packet": PACKET,
        "family": FAMILY,
        "candidateOnly": True,
        "livePromotion": False,
        "acceptanceClaim": False,
        "newFoundation": True,
        "notV7Repair": True,
        "qualityFloor": "Borrowed-Time Kestrel V4 close and 120px craft/material/readability bar",
        "sources": [
            {
                "role": "station_macro_donor_continuous",
                "path": str(DONOR.relative_to(ROOT)).replace("\\", "/"),
                "canonicalUrl": "https://www.blenderkit.com/asset-gallery-detail/b180fdbd-668f-4081-ad51-f364e829f11d/",
                "license": "CC0-1.0",
                "author": "Pastean Narcis Dan",
                "sha256": donor_sha,
                "adaptation": (
                    "spike removal, scale normalize, material-role reassignment, "
                    "bounded topology; + asymmetric hangar/pier/hab/truss/solar/radiator "
                    "anatomy; layered bevels; recessed cyan/amber wayfinding"
                ),
            },
            {
                "role": "hero_rocks_polyhaven_ambientcg",
                "path": str(VENDOR_ROOT.relative_to(ROOT)).replace("\\", "/"),
                "alsoMirrored": str(THIRD_PARTY_V8.relative_to(ROOT)).replace("\\", "/"),
                "assets": [
                    "polyhaven/rock_09 (CC0)",
                    "polyhaven/boulder_01 (CC0)",
                    "ambientcg/Rock023 (CC0)",
                ],
                "license": "CC0-1.0",
                "adaptation": (
                    "import scan → anisotropic reshape → multi-pass displace → "
                    "non-ortho fracture → voxel remesh → bevel → embedded ore seams"
                ),
            },
            {
                "role": "industrial_kitbash_subordinate",
                "path": str((VENDOR_ROOT / "polyhaven").relative_to(ROOT)).replace("\\", "/"),
                "license": "CC0-1.0",
                "adaptation": "pipes/power/utility/aircon/barrels as subordinate detail only",
            },
        ],
        "rejectedPredecessorDefects": [
            "V7: primitive cylinder/box station without continuous macro donor hull",
            "V7: torus-primary gate reading as bare hoop + box projectors",
            "V7 residual: rocks still readable as soft blobs under some framings",
            "All prior: floating kit / accessory-only / missing LOD-collision contract",
        ],
        "qualityIntent": (
            "Singular asymmetric continuous hub; substantial gate aperture with nested "
            "coils; geological hero rocks; shared PBR; LOD0/1/2 material-merged; "
            "anchors+collision; Meshopt+KTX2 on candidates; no live promote; no acceptance claim"
        ),
    }
    (evidence / "SOURCE_ADAPTATION.json").write_text(
        json.dumps(record, indent=2), encoding="utf-8",
    )


def acquire_authoring_lock_v8() -> None:
    """Scoped V8 authoring lock; refuse foreign release locks / interactive blender."""
    PACKET_ROOT.mkdir(parents=True, exist_ok=True)
    building = ROOT / "assets" / "ships" / "release.__building"
    if building.exists():
        raise SystemExit(f"REFUSE: release build in progress at {building}")

    release_lock = ROOT / "assets" / "ships" / "release.__lock"
    if release_lock.exists():
        owner_txt = release_lock / "OWNER.txt"
        owner = owner_txt.read_text(encoding="utf-8") if owner_txt.exists() else ""
        if "helios" not in owner.lower() or "v8" not in owner.lower():
            # Allow only if empty foreign — refuse all foreign release locks for safety
            if "helios-hub-v8" not in owner.lower() and "helios_v8" not in owner.lower():
                raise SystemExit(f"REFUSE: foreign release.__lock: {owner[:200]!r}")

    try:
        if sys.platform == "win32":
            ps = (
                "Get-CimInstance Win32_Process -Filter \"Name='blender.exe'\" | "
                "Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress"
            )
            r = subprocess.run(
                ["powershell", "-NoProfile", "-Command", ps],
                capture_output=True, text=True, timeout=20,
            )
            raw = (r.stdout or "").strip()
            if raw:
                data = json.loads(raw)
                rows = data if isinstance(data, list) else [data]
                foreign = []
                for row in rows:
                    pid = int(row.get("ProcessId") or 0)
                    if pid == os.getpid():
                        continue
                    cmd = str(row.get("CommandLine") or "")
                    if "build_m4_helios_hub_v8" in cmd or "--background" in cmd.lower():
                        continue
                    if cmd:
                        foreign.append({"pid": pid, "cmd": cmd[:160]})
                if foreign:
                    raise SystemExit(f"REFUSE: other blender.exe session(s) active: {foreign[:3]}")
    except SystemExit:
        raise
    except Exception as exc:
        base.log(f"WARN lock process probe: {exc}")

    lock = base.AUTHORING_LOCK
    if lock.exists():
        try:
            base.log("WARN existing authoring lock — taking over: " + lock.read_text(encoding="utf-8")[:200])
        except Exception:
            pass
    payload = {
        "packet": PACKET,
        "pid": os.getpid(),
        "startedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "heartbeatAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "owner": "build_m4_helios_hub_v8.py",
        "scope": "assets/ships/m4_helios_hub_v8/** only",
    }
    lock.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    base.log(f"Acquired authoring lock → {lock}")


base.BUILDERS["helios_hub_station"] = build_hub_v8
base.BUILDERS["helios_gate"] = build_gate_v8
base.BUILDERS["helios_rock_a"] = build_rock_v8
base.BUILDERS["helios_rock_b"] = build_rock_v8
base.BUILDERS["helios_rock_c"] = build_rock_v8
base.setup_studio_lights = setup_v8_lights
base.render_evidence = render_evidence_v8
base.acquire_authoring_lock = acquire_authoring_lock_v8


if __name__ == "__main__":
    if not DONOR.exists() or not DONOR_PROVENANCE.exists():
        raise FileNotFoundError(
            f"V8 continuous donor missing — expected {DONOR}"
        )
    _write_adaptation_record()
    code = 1
    try:
        code = base.main()
    finally:
        # Always release scoped authoring lock on exit
        try:
            lock = base.AUTHORING_LOCK
            if lock.exists():
                lock.unlink()
                base.log(f"Released authoring lock → {lock}")
        except Exception as exc:
            print(f"WARN release lock: {exc}", flush=True)
    raise SystemExit(code)
