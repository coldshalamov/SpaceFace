#!/usr/bin/env python3
"""Bounded Helios V6.1 taste repair: gate and three support assets only.

V6 remains immutable. This delta reuses its committed, licensed source ledger,
keeps the dense station donor details, and writes only m4_helios_hub_v6_1.
"""
from __future__ import annotations

import hashlib
import importlib.util
import json
import math
from pathlib import Path

import bpy
import numpy as np


ROOT = Path(__file__).resolve().parents[2]
V6_BUILDER = ROOT / "tools" / "blender" / "build_m4_helios_hub_v6.py"
V6_ROOT = ROOT / "assets" / "ships" / "m4_helios_hub_v6"
PACKET_ROOT = ROOT / "assets" / "ships" / "m4_helios_hub_v6_1"
PACKET = "PROFESSIONAL-HELIOS-HUB-VISUAL-V6.1-CODEX-001"
FAMILY = "helios_hub_env_v6_1"
ASSET_IDS = {
    "helios_gate",
    "helios_support_gantry",
    "helios_support_dock_arm",
    "helios_nav_spire",
}

spec = importlib.util.spec_from_file_location("helios_v6_committed", V6_BUILDER)
if spec is None or spec.loader is None:
    raise RuntimeError(f"Cannot load committed V6 pipeline: {V6_BUILDER}")
v6 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(v6)
base = v6.base

base.PACKET_ROOT = PACKET_ROOT
base.PACKET = PACKET
base.FAMILY = FAMILY
base.AUTHORING_LOCK = PACKET_ROOT / "authoring.__lock"
base.REJECTED_PACKET = "PROFESSIONAL-HELIOS-HUB-VISUAL-V6-CODEX-001"
base.VENDOR_ROOT = V6_ROOT / "source" / "reference" / "helios_v3"
base.KIT_POLY = base.VENDOR_ROOT / "polyhaven"
base.KIT_KENNEY = base.VENDOR_ROOT / "kenney_space_kit" / "Models" / "GLTF format"
base.CAMPAIGN_BUILD = PACKET_ROOT / "evidence" / "build"
base.ASSETS = [asset for asset in base.ASSETS if asset["id"] in ASSET_IDS]


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


_generate_textures = base.generate_material_textures


def generate_v6_1_textures(tex_dir: Path, force: bool = False):
    """Retain PBR variance while lifting graphite and amber out of crushed black."""
    maps = _generate_textures(tex_dir, force=force)
    transforms = {
        "mechanical": (np.array([0.82, 0.86, 0.90], dtype=np.float32),
                       np.array([0.105, 0.105, 0.105], dtype=np.float32)),
        "warm": (np.array([1.25, 1.18, 1.08], dtype=np.float32),
                 np.array([0.075, 0.032, 0.008], dtype=np.float32)),
    }
    for role, (gain, lift) in transforms.items():
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


def build_gate_v6_1(coll: bpy.types.Collection, mats: dict, _asset: dict) -> list[bpy.types.Object]:
    hull = mats["Material_Hull"]
    mech = mats["Material_Mechanical"]
    cool = mats["Material_Accent"]
    warm = mats["Material_Warm"]

    donor = v6._append_dense_donor(coll, mats, gate=True)
    parts = base.build_gate(coll, mats)

    # Remove the opaque axial cross that read as random spokes through the
    # navigable aperture. Compact attached emitters remain around the ring.
    remove_names = (
        "gate_service_spine", "spine_bus_", "travel_axis_mark_",
        "coolant_feed_",
    )
    kept: list[bpy.types.Object] = []
    for obj in parts:
        name = obj.name.lower()
        if name.startswith(remove_names):
            base.unlink_object(obj)
            continue
        if any(token in name for token in ("emitter_housing", "emitter_fin", "power_bank")):
            _assign(obj, hull)
        elif any(token in name for token in ("cooling_coil", "coolant_feed", "service_walk")):
            _assign(obj, mech)
        kept.append(obj)
    parts = kept

    # Open, unmistakable energy focus: a cool inner ring, warm phase rail, and
    # four small directional nodes. The center stays physically unobstructed.
    focus = base.make_torus(
        "V61_Gate_Energy_Aperture", 9.45, 0.22, (0.0, 0.0, 0.0), cool, coll,
        major_segs=64, minor_segs=10, detail=1,
    )
    parts.append(_emissive(focus))
    phase = base.make_torus(
        "V61_Gate_Warm_PhaseRail", 10.05, 0.11, (0.0, 0.0, 0.0), warm, coll,
        major_segs=56, minor_segs=8, detail=1,
    )
    parts.append(_emissive(phase))
    for index, angle_deg in enumerate((45, 135, 225, 315)):
        angle = math.radians(angle_deg)
        y, z = math.sin(angle) * 9.72, math.cos(angle) * 9.72
        node = base.make_box(
            f"V61_ApertureNode_{index}", (1.25, 0.42, 0.42), (0.35, y, z),
            warm if index % 2 else cool, coll, detail=1,
            component="emissive", keep_separate=True,
        )
        parts.append(node)

    # Two open ivory load paths replace the monolithic black pylons. Their
    # separated feet and diagonal legs read at 45px without closing the gate.
    crossbar = base.make_box("V61_Gate_Foundation", (3.2, 1.6, 20.0), (0.0, -15.4, 0.0), hull, coll)
    base.bevel_object(crossbar, 0.08, 2)
    parts.append(crossbar)
    for side in (-1, 1):
        leg = base.make_box(
            f"V61_Gate_Buttress_{side:+d}", (2.7, 10.2, 2.4),
            (0.0, -10.0, side * 9.4), hull, coll,
            rotation=(math.radians(-side * 11.0), 0.0, 0.0),
        )
        base.bevel_object(leg, 0.08, 2)
        parts.append(leg)
        foot = base.make_box(
            f"V61_Gate_Foot_{side:+d}", (4.8, 2.0, 5.2),
            (0.0, -15.0, side * 10.2), mech, coll,
        )
        base.bevel_object(foot, 0.10, 2)
        parts.append(foot)
        band = base.make_box(
            f"V61_Gate_WarmBand_{side:+d}", (2.95, 0.32, 2.6),
            (0.15, -7.0, side * 8.85), warm, coll, detail=1,
            component="emissive", keep_separate=True,
        )
        parts.append(band)
    return donor + parts


def build_gantry_v6_1(coll: bpy.types.Collection, mats: dict, _asset: dict) -> list[bpy.types.Object]:
    hull, mech = mats["Material_Hull"], mats["Material_Mechanical"]
    cool, warm = mats["Material_Accent"], mats["Material_Warm"]
    parts = base.build_gantry(coll, mats)
    for obj in parts:
        name = obj.name.lower()
        if name.startswith("lattice_"):
            _assign(obj, hull)
        elif name in ("winch_drum", "winch_cable"):
            _assign(obj, warm)
    # Wide counterweight and split boom give the crane a readable asymmetric C silhouette.
    counter = base.make_box("V61_Gantry_Counterweight", (3.2, 3.0, 3.6), (-2.1, 5.1, 0.0), hull, coll)
    base.bevel_object(counter, 0.08, 2); parts.append(counter)
    counter_band = base.make_box(
        "V61_Gantry_Counterweight_WarmBand", (0.26, 2.45, 3.75),
        (-3.73, 5.1, 0.0), warm, coll, detail=1,
    )
    base.bevel_object(counter_band, 0.035, 2); parts.append(counter_band)
    counter_status = base.make_box(
        "V61_Gantry_Counterweight_CoolStatus", (0.30, 0.52, 1.5),
        (-3.88, 5.65, 0.0), cool, coll, detail=1,
        component="emissive", keep_separate=True,
    )
    base.bevel_object(counter_status, 0.025, 2); parts.append(counter_status)
    for z in (-1.05, 1.05):
        rail = base.make_box("V61_Gantry_BoomRail", (8.8, 0.42, 0.32), (4.6, 6.0, z), hull, coll)
        base.bevel_object(rail, 0.04, 2); parts.append(rail)
        brace = base.make_curve_pipe(
            f"V61_Gantry_Diagonal_{z:+.0f}", [(0.2, 2.4, z), (4.5, 4.8, z), (8.7, 5.6, z)],
            0.13, hull, coll,
        )
        parts.append(brace)
    for z in (-2.4, 2.4):
        outrigger = base.make_box("V61_Gantry_Outrigger", (3.8, 0.5, 0.55), (0.0, -5.0, z), hull, coll)
        base.bevel_object(outrigger, 0.04, 2); parts.append(outrigger)
    parts.append(_emissive(base.make_box(
        "V61_Gantry_CoolTip", (0.5, 0.5, 2.8), (9.0, 5.2, 0.0), cool, coll,
        detail=1, component="emissive", keep_separate=True,
    )))
    parts.append(base.make_box("V61_Gantry_WarmJaw", (1.1, 0.3, 2.4), (8.7, 4.4, 0.0), warm, coll, detail=1))
    return parts


def build_dock_arm_v6_1(coll: bpy.types.Collection, mats: dict, _asset: dict) -> list[bpy.types.Object]:
    hull, mech = mats["Material_Hull"], mats["Material_Mechanical"]
    cool, warm = mats["Material_Accent"], mats["Material_Warm"]
    parts = base.build_dock_arm(coll, mats)
    # Twin rails and an end collar preserve the long reach while making the arm
    # legible as load-bearing machinery rather than a single beige bar.
    for y, z in ((0.75, -1.05), (0.75, 1.05), (-0.65, -0.8), (-0.65, 0.8)):
        rail = base.make_box("V61_DockArm_TrussRail", (10.5, 0.32, 0.30), (6.3, y, z), mech, coll)
        base.bevel_object(rail, 0.035, 2); parts.append(rail)
    collar = base.make_torus(
        "V61_DockArm_ClampCollar", 1.6, 0.20, (12.6, 0.0, 0.0), hull, coll,
        major_segs=32, minor_segs=8,
    )
    parts.append(collar)
    guide = base.make_box(
        "V61_DockArm_CoolGuide", (9.6, 0.14, 0.20), (6.2, 1.18, 0.0), cool, coll,
        detail=1, component="emissive", keep_separate=True,
    )
    parts.append(guide)
    for x in (3.0, 6.0, 9.0):
        parts.append(base.make_box("V61_DockArm_WarmPlate", (1.0, 0.22, 2.4), (x, -0.95, 0.0), warm, coll, detail=1))
    return parts


def build_nav_spire_v6_1(coll: bpy.types.Collection, mats: dict, _asset: dict) -> list[bpy.types.Object]:
    hull, mech = mats["Material_Hull"], mats["Material_Mechanical"]
    cool, warm = mats["Material_Accent"], mats["Material_Warm"]
    parts = base.build_nav_spire(coll, mats)
    # A broad tripod base and dual halo turn the thin pole into a nav landmark.
    for index, angle_deg in enumerate((0, 120, 240)):
        angle = math.radians(angle_deg)
        x, z = math.cos(angle) * 1.6, math.sin(angle) * 1.6
        fin = base.make_box(
            f"V61_Spire_BaseFin_{index}", (3.2, 0.45, 0.55), (x, -4.7, z), mech, coll,
            rotation=(0.0, -angle, 0.0),
        )
        base.bevel_object(fin, 0.04, 2); parts.append(fin)
    halo = base.make_torus(
        "V61_Spire_CoolHalo", 1.65, 0.13, (0.0, 7.8, 0.0), cool, coll,
        major_segs=32, minor_segs=8, detail=1,
    )
    parts.append(_emissive(halo))
    crown = base.make_torus(
        "V61_Spire_WarmHalo", 1.25, 0.10, (0.0, 9.25, 0.0), warm, coll,
        major_segs=28, minor_segs=8, detail=1,
    )
    parts.append(_emissive(crown))
    for side in (-1, 1):
        wing = base.make_box("V61_Spire_HeadWing", (0.55, 1.4, 2.2), (0.0, 7.6, side * 1.45), hull, coll)
        base.bevel_object(wing, 0.05, 2); parts.append(wing)
    return parts


def _write_delta_provenance() -> None:
    PACKET_ROOT.mkdir(parents=True, exist_ok=True)
    donor = V6_ROOT / "source" / "reference" / "blenderkit_scifi_station" / "blenderkit_scifi_station_cc0.blend"
    record = {
        "schema": "spaceface.assetDeltaProvenance.v1",
        "packet": PACKET,
        "family": FAMILY,
        "candidateOnly": True,
        "livePromotion": False,
        "upstream": {
            "family": "assets/ships/m4_helios_hub_v6",
            "commitRequired": True,
            "donor": str(donor.relative_to(ROOT)).replace("\\", "/"),
            "donorSha256": _sha256(donor),
            "license": "CC0-1.0",
            "provenance": "assets/ships/m4_helios_hub_v6/source/reference/blenderkit_scifi_station/PROVENANCE.json",
        },
        "scope": sorted(ASSET_IDS),
        "unchanged": ["helios_hub_station", "helios_rock_a", "helios_rock_b", "helios_rock_c"],
        "tasteRepair": [
            "open ivory gate buttresses replace opaque black masses",
            "warm/cool material-value hierarchy",
            "unobstructed energy aperture focal structure",
            "45-120px support silhouette reinforcement",
        ],
    }
    (PACKET_ROOT / "PROVENANCE.json").write_text(json.dumps(record, indent=2), encoding="utf-8")


base.generate_material_textures = generate_v6_1_textures
base.setup_studio_lights = v6.setup_v6_lights
base.BUILDERS["helios_gate"] = build_gate_v6_1
base.BUILDERS["helios_support_gantry"] = build_gantry_v6_1
base.BUILDERS["helios_support_dock_arm"] = build_dock_arm_v6_1
base.BUILDERS["helios_nav_spire"] = build_nav_spire_v6_1


if __name__ == "__main__":
    _write_delta_provenance()
    raise SystemExit(base.main())
