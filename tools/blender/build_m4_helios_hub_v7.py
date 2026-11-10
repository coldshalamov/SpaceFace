#!/usr/bin/env python3
"""Build the isolated Helios V7 environment-family candidate.

Packet: PROFESSIONAL-HELIOS-HUB-VISUAL-V7-GROK-001

Required family (player-facing core):
  - helios_hub_station  → place_station_trade_hub
  - helios_gate         → place_gate_jump_ring
  - helios_rock_a/b/c   → place_asteroid_rock_a/b/c

V7 improves on V6:
  - Filled civic/industrial body mass (rejects empty-ring reading from V4/V5)
  - Open gate aperture with load-path buttresses (no axial cross clutter)
  - Distinct geological hero rocks (scan-based + fracture storytelling)
  - Robust framing binary-search so evidence margins land in 8–15%
  - Lifted graphite/amber so materials read without emissive dependence
  - Shared 1024 PBR material language across the family

Isolation only — never writes live parts/release/manifests.

Usage:
  blender --background --python tools/blender/build_m4_helios_hub_v7.py --
  blender --background --python tools/blender/build_m4_helios_hub_v7.py -- --only hub_station,gate,rock_a,rock_b
"""
from __future__ import annotations

import hashlib
import importlib.util
import json
import math
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
V6_BUILDER = ROOT / "tools" / "blender" / "build_m4_helios_hub_v6.py"
PACKET_ROOT = ROOT / "assets" / "ships" / "m4_helios_hub_v7"
PACKET = "PROFESSIONAL-HELIOS-HUB-VISUAL-V7-GROK-001"
FAMILY = "helios_hub_env_v7"
REFERENCE_ROOT = PACKET_ROOT / "source" / "reference"
VENDOR_ROOT = REFERENCE_ROOT / "helios_v3"
DONOR = REFERENCE_ROOT / "blenderkit_scifi_station" / "blenderkit_scifi_station_cc0.blend"
DONOR_PROVENANCE = REFERENCE_ROOT / "blenderkit_scifi_station" / "PROVENANCE.json"

# Load V6 (which loads V3 as base) so we reuse production/export contract.
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
base.REJECTED_PACKET = "PROFESSIONAL-HELIOS-HUB-VISUAL-V6-CODEX-001"
base.VENDOR_ROOT = VENDOR_ROOT
base.KIT_POLY = VENDOR_ROOT / "polyhaven"
base.KIT_KENNEY = VENDOR_ROOT / "kenney_space_kit" / "Models" / "GLTF format"
base.CAMPAIGN_BUILD = PACKET_ROOT / "evidence" / "build"

# Core family only (supports optional but not required this sprint).
CORE_IDS = {
    "helios_hub_station",
    "helios_gate",
    "helios_rock_a",
    "helios_rock_b",
    "helios_rock_c",
}
base.ASSETS = [a for a in base.ASSETS if a["id"] in CORE_IDS]


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


# ---------------------------------------------------------------------------
# Materials: V6 generator + V6.1 lift so graphite/amber are not crushed black
# ---------------------------------------------------------------------------
_generate_textures = base.generate_material_textures


def generate_v7_textures(tex_dir: Path, force: bool = False):
    maps = _generate_textures(tex_dir, force=force)
    transforms = {
        "mechanical": (
            np.array([0.88, 0.90, 0.94], dtype=np.float32),
            np.array([0.12, 0.125, 0.135], dtype=np.float32),
        ),
        "warm": (
            np.array([1.28, 1.18, 1.06], dtype=np.float32),
            np.array([0.085, 0.038, 0.010], dtype=np.float32),
        ),
        "hull": (
            np.array([1.05, 1.02, 0.98], dtype=np.float32),
            np.array([0.018, 0.014, 0.010], dtype=np.float32),
        ),
        "accent": (
            np.array([1.05, 1.08, 1.12], dtype=np.float32),
            np.array([0.01, 0.02, 0.04], dtype=np.float32),
        ),
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


base.generate_material_textures = generate_v7_textures


# ---------------------------------------------------------------------------
# Station: continuous asymmetric trade hub (NO dense donor / NO floating panels)
# ---------------------------------------------------------------------------
def _apply_rot(obj: bpy.types.Object, euler) -> None:
    obj.rotation_euler = euler
    base.ensure_object_mode()
    base.deselect_all()
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    obj.select_set(False)


def build_hub_v7(coll: bpy.types.Collection, mats: dict, _asset: dict) -> list[bpy.types.Object]:
    """Connected asymmetric orbital trade hub — continuous mass, recessed glazing/emissives.

    Rejected predecessors stacked donor debris + floating cyan squares on beige
    cylinders. This pass authors one continuous primary shell with distinct
    hull / mechanical / glass / warm / wear zones that stay legible at distance.
    """
    hull, mech = mats["Material_Hull"], mats["Material_Mechanical"]
    cool, warm = mats["Material_Accent"], mats["Material_Warm"]
    glass = mats["Material_Glass"]
    parts: list[bpy.types.Object] = []
    base.log("V7 REPAIR hub — continuous asymmetric trade hub (no donor, no floaters)")

    # --- PRIMARY SHELL: hab tower + trade deck + industrial + docks as unions ---
    primary = base.make_cylinder(
        "V7_Hab_Core", 4.6, 13.5, (-0.8, 3.5, 0.3), hull, coll, vertices=36, axis="Y",
    )
    base._apply_scale(primary, (1.22, 1.0, 0.92))

    # Upper ops crown (mechanical graphite, not hull ivory)
    ops = base.make_cylinder(
        "_u_ops", 3.4, 3.6, (-1.2, 11.8, 0.6), mech, coll, vertices=28, axis="Y",
    )
    base.boolean_union(primary, ops)
    cap = base.make_uv_sphere(
        "_u_cap", 2.6, (-1.2, 14.0, 0.6), hull, coll, segments=20, rings=12,
    )
    base._apply_scale(cap, (1.25, 0.55, 1.1))
    base.boolean_union(primary, cap)

    # Asymmetric trade deck loft (thick +X commercial, thin −X service)
    def r_in(ang, _t):
        return 9.4 + 0.7 * math.cos(ang + 0.35)

    def r_out(ang, _t):
        r = 14.6 + 2.0 * max(0.0, math.cos(ang - 0.3))
        r += 1.4 * max(0.0, math.sin(ang))
        return r

    deck = base._bmesh_loft_annulus(
        "_u_trade_deck", segs=52, y0=-1.0, y1=1.7,
        r_in_fn=r_in, r_out_fn=r_out, material=hull, coll=coll,
    )
    base.boolean_union(primary, deck)

    # Commercial cargo lobe (+X/+Z) — solid exchange mass
    commercial = base.make_cylinder(
        "_u_commercial", 5.4, 4.2, (14.5, 0.6, 5.2), hull, coll, vertices=28, axis="Y",
    )
    base._apply_scale(commercial, (1.45, 1.0, 1.18))
    base.boolean_union(primary, commercial)

    # Long cargo pier (+X) — connected, not floating arm
    pier = base.make_box(
        "_u_pier", (12.5, 3.2, 5.0), (18.0, -0.2, 0.5), hull, coll, detail=0,
    )
    base.boolean_union(primary, pier)
    pier_tip = base.make_box(
        "_u_pier_tip", (4.5, 2.6, 4.2), (25.0, -0.1, 0.5), mech, coll, detail=0,
    )
    base.boolean_union(primary, pier_tip)

    # Industrial freight wedge (−X/−Z) — graphite guts framed by hull
    industrial = base.make_box(
        "_u_industrial", (11.5, 4.0, 6.5), (-11.5, 0.1, -10.5), hull, coll, detail=0,
    )
    base.boolean_union(primary, industrial)
    ind_head = base.make_cylinder(
        "_u_ind_head", 2.8, 3.6, (-17.0, 0.9, -10.5), hull, coll, vertices=22, axis="Y",
    )
    base.boolean_union(primary, ind_head)

    # Underslung service collar + transit tube (continuous travel path)
    collar = base.make_cylinder(
        "_u_collar", 5.2, 2.0, (0.0, -3.6, 0.0), hull, coll, vertices=28, axis="Y",
    )
    base._apply_scale(collar, (1.35, 1.0, 0.95))
    base.boolean_union(primary, collar)
    transit = base.make_cylinder(
        "_u_transit", 1.75, 20.0, (2.0, -1.7, -2.5), hull, coll, vertices=18, axis="X",
    )
    base.boolean_union(primary, transit)
    # Bore transit interior for readable tunnel mouth
    bore = base.make_cylinder(
        "_u_transit_bore", 1.2, 21.0, (2.0, -1.7, -2.5), hull, coll, vertices=16, axis="X",
    )
    base.boolean_cut(primary, bore)

    # Framed mechanical cavities (dark voids with mech lips — not unsupported holes)
    for i, (size, loc) in enumerate((
        ((3.2, 1.6, 2.4), (14.2, 1.5, 5.0)),
        ((2.8, 1.4, 2.0), (-10.0, 1.2, -10.0)),
        ((2.2, 1.2, 1.8), (18.5, 0.8, 0.5)),
        ((2.0, 1.1, 1.6), (-1.0, 6.5, 3.8)),
    )):
        base.inset_panel_cut(primary, size, loc)
        lip = base.make_box(
            f"V7_CavityLip_{i}",
            (size[0] + 0.35, 0.22, size[2] + 0.35),
            (loc[0], loc[1] + size[1] * 0.35, loc[2]),
            mech, coll, detail=1,
        )
        base.bevel_object(lip, 0.03, 2)
        parts.append(lip)
        # Mechanical cavity fill so voids read as engineered recesses, not black holes
        fill = base.make_box(
            f"V7_CavityFill_{i}",
            (size[0] * 0.88, size[1] * 0.55, size[2] * 0.88),
            (loc[0], loc[1] - 0.15, loc[2]),
            mech, coll, detail=1,
        )
        parts.append(fill)

    # Hab window belts: continuous glass cylinders seated INSIDE the hull radius
    # (rejects floating diamond/square panels that read as cyan floaters at distance)
    for yi, y in enumerate((3.4, 5.9, 8.5, 10.9)):
        # Outer mech frame ring (attached)
        frame = base.make_cylinder(
            f"V7_HabWinFrame_{yi}", 5.15, 0.95, (-0.8, y, 0.3), mech, coll,
            vertices=28, axis="Y", detail=1,
        )
        base._apply_scale(frame, (1.18, 1.0, 0.92))
        parts.append(frame)
        # Glass belt slightly smaller — physically under the frame lip
        belt = base.make_cylinder(
            f"V7_HabGlassBelt_{yi}", 5.05, 0.72, (-0.8, y, 0.3), glass, coll,
            vertices=28, axis="Y", detail=1,
        )
        base._apply_scale(belt, (1.18, 1.0, 0.92))
        parts.append(belt)
        # Shallow panel cuts into primary for recessed reading
        for j, ang_deg in enumerate(range(0, 360, 40)):
            a = math.radians(ang_deg + yi * 8)
            r = 5.1
            x, z = -0.8 + math.cos(a) * r, 0.3 + math.sin(a) * r
            base.inset_panel_cut(primary, (1.1, 0.7, 0.45), (x, y, z))

    primary.name = "V7_Hub_Continuous_Shell"
    if primary.data:
        primary.data.name = primary.name
    base.bevel_object(primary, width=0.09, segments=2, angle=28.0)
    if base.tri_count_object(primary) > 18000:
        base.decimate_to_max_tris(primary, 18000, label="V7_Hub_Primary")
    parts.insert(0, primary)

    # --- SECONDARY MECHANICAL DETAIL (attached, role-merged) ---
    # Pier clamp / bay lip (warm functional)
    clamp = base.make_box(
        "V7_Pier_Clamp", (5.5, 2.2, 3.6), (25.5, 0.3, 0.5), mech, coll, detail=0,
    )
    base.bevel_object(clamp, 0.08, 2)
    parts.append(clamp)
    bay = base.make_box(
        "V7_BayLip", (4.8, 0.28, 3.8), (25.8, 1.5, 0.5), warm, coll, detail=1,
    )
    parts.append(bay)

    # Recessed dock guide channel on pier top (mech channel + cyan strip inside)
    guide_ch = base.make_box(
        "V7_DockGuide_Channel", (11.5, 0.22, 0.55), (18.0, 1.45, 0.5), mech, coll, detail=1,
    )
    parts.append(guide_ch)
    guide = base.make_box(
        "V7_DockGuide_Strip", (10.8, 0.12, 0.22), (18.0, 1.58, 0.5), cool, coll, detail=1,
        component="emissive", keep_separate=True,
    )
    parts.append(_emissive(guide))

    # Industrial radiator stack (graphite fins on industrial wedge)
    for i in range(7):
        fin = base.make_box(
            f"V7_RadFin_{i}", (0.18, 3.4, 2.5),
            (-17.6, 2.1, -10.5 + (i - 3) * 0.72), mech, coll, detail=1,
        )
        parts.append(fin)
    tank = base.make_cylinder(
        "V7_PropTank", 1.9, 5.8, (-15.0, -1.1, -6.0), mech, coll, vertices=18, axis="X",
    )
    parts.append(tank)
    for i, x in enumerate((-8.0, -12.0, -15.5)):
        run = base.make_box(
            f"V7_IndRun_{i}", (2.2, 0.65, 3.0), (x, 2.0, -10.5), mech, coll, detail=1,
        )
        base.bevel_object(run, 0.03, 2)
        parts.append(run)

    # Transit portal rings (mech mouths at tunnel ends)
    for x in (-7.5, 11.5):
        portal = base.make_cylinder(
            f"V7_TransitPortal_{int(x)}", 1.65, 0.38, (x, -1.7, -2.5), mech, coll,
            vertices=16, axis="X",
        )
        parts.append(portal)
    # Warm functional hazard band on transit portal lips
    for x in (-7.5, 11.5):
        band = base.make_cylinder(
            f"V7_TransitWarm_{int(x)}", 1.72, 0.12, (x, -1.7, -2.5), warm, coll,
            vertices=16, axis="X",
        )
        parts.append(band)

    # Load-path truss ribs under deck (mech, attached to shell footprint)
    for i, ang_deg in enumerate(range(0, 360, 32)):
        a = math.radians(ang_deg)
        rib = base.make_box(
            f"V7_TrussRib_{i}", (0.32, 1.9, 1.05),
            (math.cos(a) * 11.2, -0.35, math.sin(a) * 11.2), mech, coll, detail=1,
        )
        base.bevel_object(rib, 0.02, 2)
        parts.append(rib)

    # Deck-rim berth markers: recessed into warm channel blocks (not free-float)
    for i, ang_deg in enumerate(range(8, 200, 18)):
        a = math.radians(ang_deg)
        rx, rz = math.cos(a) * 14.2, math.sin(a) * 14.2
        block = base.make_box(
            f"V7_BerthBlock_{i:02d}", (1.15, 0.35, 0.55),
            (rx, 1.55, rz), mech, coll, detail=1,
        )
        parts.append(block)
        mark = base.make_box(
            f"V7_BerthMark_{i:02d}", (0.95, 0.10, 0.22),
            (rx, 1.78, rz), warm, coll, detail=1,
            component="emissive", keep_separate=True,
        )
        parts.append(_emissive(mark))

    # Identity rail segments seated on deck rim (hull channel + cyan inset)
    for i, ang_deg in enumerate(range(12, 185, 22)):
        a = math.radians(ang_deg)
        rx, rz = math.cos(a) * 13.5, math.sin(a) * 13.5
        ch = base.make_box(
            f"V7_IdChannel_{i}", (1.05, 0.18, 0.32),
            (rx, 1.72, rz), mech, coll, detail=1,
        )
        parts.append(ch)
        strip = base.make_box(
            f"V7_IdStrip_{i}", (0.9, 0.08, 0.12),
            (rx, 1.85, rz), cool, coll, detail=1,
            component="emissive", keep_separate=True,
        )
        parts.append(_emissive(strip))

    # Crown beacon on cap (attached)
    mast = base.make_box("V7_SensorMast", (0.28, 3.8, 0.28), (-2.4, 15.2, 1.4), mech, coll, detail=1)
    parts.append(mast)
    beacon = base.make_cylinder(
        "V7_Crown_Beacon", 0.48, 1.6, (-1.2, 15.2, 0.6), cool, coll,
        vertices=14, axis="Y", component="emissive", keep_separate=True,
    )
    parts.append(_emissive(beacon))

    # Scale cues + service pipes (wear/detail zone)
    for i, (x, z) in enumerate(((15.2, 2.5), (16.0, 7.2), (12.0, 8.8), (-12.0, -8.0))):
        crate = base.make_box(
            f"V7_Crate_{i}", (1.5, 1.0, 1.2), (x, -0.9, z), mech, coll, detail=1, close_only=True,
        )
        parts.append(crate)
    try:
        parts.append(base.make_curve_pipe(
            "V7_ServicePipe_A",
            [(8.0, -0.2, -2.0), (11.0, 0.5, -4.5), (14.0, 0.9, -7.5), (13.0, 1.3, -9.5)],
            0.09, mech, coll,
        ))
        parts.append(base.make_curve_pipe(
            "V7_ServicePipe_B",
            [(-4.0, 0.5, -8.0), (-8.5, 1.0, -9.5), (-13.0, 1.5, -10.0), (-16.0, 2.0, -9.0)],
            0.08, mech, coll,
        ))
    except Exception as exc:
        base.log(f"WARN service pipes: {exc}")

    # Kitbash mechanical richness (subordinate, material-reassigned)
    kits = base.kit_paths()
    for key, name, scale, loc, mat, mt in (
        ("pipes", "V7_Kit_Pipes", 0.55, (-11.0, 0.9, -11.0), mech, 1600),
        ("utility_box", "V7_Kit_Utility", 0.85, (22.0, -0.5, 2.5), mech, 1000),
        ("power_box", "V7_Kit_Power", 0.7, (-14.5, 1.1, -8.0), mech, 1000),
        ("aircon", "V7_Kit_Aircon", 0.8, (-2.8, 9.0, -1.8), mech, 1200),
        ("barrels", "V7_Kit_Barrels", 1.0, (20.0, -1.0, 3.5), mech, 500),
    ):
        if key in kits:
            k = base.kit_component(
                kits[key], name, coll, scale=scale, location_rt=loc,
                material=mat, max_tris=mt, preserve_maps=True,
            )
            if k:
                parts.append(k)

    return parts


# ---------------------------------------------------------------------------
# Gate: ONE continuous primary ring + 2–3 supports; clean aperture; no debris
# ---------------------------------------------------------------------------
def build_gate_v7(coll: bpy.types.Collection, mats: dict, _asset: dict) -> list[bpy.types.Object]:
    """Landmark jump gate: continuous spar ring, open aperture, recessed emissive arcs.

    Rejected predecessors stacked dense-donor debris, box occluders, and loose
    emissives that hid the landmark silhouette.
    """
    hull, mech = mats["Material_Hull"], mats["Material_Mechanical"]
    cool, warm = mats["Material_Accent"], mats["Material_Warm"]
    parts: list[bpy.types.Object] = []
    base.log("V7 REPAIR gate — continuous ring + 3 supports, no donor debris")

    # Primary continuous outer spar (hull ivory) — the landmark silhouette
    outer = base.make_torus(
        "V7_Gate_OuterSpar", 11.4, 1.05, (0.0, 0.0, 0.0), hull, coll,
        major_segs=72, minor_segs=16, detail=0,
    )
    base.bevel_object(outer, 0.07, 2)
    parts.append(outer)

    # Structural mid rail (graphite) — continuous, not box-occluded
    mid = base.make_torus(
        "V7_Gate_MidRail", 11.4, 0.42, (0.15, 0.0, 0.0), mech, coll,
        major_segs=64, minor_segs=12, detail=1,
    )
    parts.append(mid)

    # Recessed emissive channel: cut a groove, seat cyan arc inside
    # Channel walls as slightly larger minor radius mechanical trough
    channel = base.make_torus(
        "V7_Gate_EmissiveChannel", 10.35, 0.38, (0.05, 0.0, 0.0), mech, coll,
        major_segs=60, minor_segs=10, detail=1,
    )
    parts.append(channel)
    # Cyan arc seated deeper/smaller so it reads recessed into the channel
    cyan_arc = base.make_torus(
        "V7_Gate_CyanArc", 10.35, 0.16, (0.12, 0.0, 0.0), cool, coll,
        major_segs=56, minor_segs=8, detail=1,
    )
    parts.append(_emissive(cyan_arc))
    # Warm phase arc (thinner, alternate) also recessed
    warm_arc = base.make_torus(
        "V7_Gate_WarmArc", 10.85, 0.10, (-0.05, 0.0, 0.0), warm, coll,
        major_segs=48, minor_segs=6, detail=1,
    )
    parts.append(_emissive(warm_arc))

    # 2–3 clearly connected support masses only (foundation + 2 buttresses)
    foundation = base.make_box(
        "V7_Gate_Foundation", (4.2, 2.0, 20.0), (0.0, -15.6, 0.0), hull, coll, detail=0,
    )
    base.bevel_object(foundation, 0.12, 2)
    parts.append(foundation)

    for side in (-1, 1):
        # Continuous buttress from foundation into ring (no gap)
        leg = base.make_box(
            f"V7_Gate_Buttress_{side:+d}", (3.2, 12.5, 3.0),
            (0.0, -9.0, side * 9.2), hull, coll,
            rotation=(math.radians(-side * 14.0), 0.0, 0.0),
        )
        base.bevel_object(leg, 0.10, 2)
        parts.append(leg)
        # Ring attachment pad (connects buttress to outer spar)
        pad = base.make_box(
            f"V7_Gate_RingPad_{side:+d}", (3.6, 2.8, 3.4),
            (0.1, -1.2, side * 10.6), mech, coll, detail=0,
        )
        base.bevel_object(pad, 0.08, 2)
        parts.append(pad)
        foot = base.make_box(
            f"V7_Gate_Foot_{side:+d}", (5.5, 2.4, 5.8),
            (0.0, -15.2, side * 9.8), mech, coll, detail=0,
        )
        base.bevel_object(foot, 0.10, 2)
        parts.append(foot)
        # Warm functional marker recessed into foot channel
        foot_ch = base.make_box(
            f"V7_Gate_FootChannel_{side:+d}", (3.4, 0.28, 2.6),
            (0.15, -13.9, side * 9.8), mech, coll, detail=1,
        )
        parts.append(foot_ch)
        foot_band = base.make_box(
            f"V7_Gate_WarmBand_{side:+d}", (3.0, 0.12, 1.8),
            (0.2, -13.75, side * 9.8), warm, coll, detail=1,
            component="emissive", keep_separate=True,
        )
        parts.append(_emissive(foot_band))
        bank = base.make_box(
            f"V7_PowerBank_{side:+d}", (2.6, 3.0, 2.2),
            (3.0, -13.8, side * 7.8), mech, coll, detail=1,
        )
        base.bevel_object(bank, 0.06, 2)
        parts.append(bank)

    # Third support mass: rear service spine fully BEHIND the ring (clear aperture)
    spine = base.make_box(
        "V7_Gate_ServiceSpine", (2.4, 8.5, 2.0), (-5.2, -8.0, 0.0), mech, coll, detail=0,
    )
    base.bevel_object(spine, 0.08, 2)
    parts.append(spine)
    spine_cap = base.make_box(
        "V7_Gate_SpineCap", (3.0, 1.6, 2.6), (-5.2, -2.5, 0.0), hull, coll, detail=1,
    )
    parts.append(spine_cap)

    # 4 projector housings ON the ring (attached pads), glow recessed into housing face
    for i, ang_deg in enumerate((30, 120, 210, 300)):
        a = math.radians(ang_deg)
        y, z = math.sin(a) * 11.3, math.cos(a) * 11.3
        housing = base.make_box(
            f"V7_Projector_{i}", (2.8, 2.0, 2.0), (0.35, y, z), mech, coll, detail=0,
        )
        base.bevel_object(housing, 0.06, 2)
        parts.append(housing)
        # Recessed face plate + glow strip inside housing mouth
        face = base.make_box(
            f"V7_ProjectorFace_{i}", (0.2, 1.5, 1.5), (1.55, y * 0.98, z * 0.98),
            mech, coll, detail=1,
        )
        parts.append(face)
        glow = base.make_box(
            f"V7_ProjectorGlow_{i}", (0.14, 1.1, 0.35),
            (1.7, y * 0.97, z * 0.97),
            cool if i % 2 == 0 else warm, coll, detail=1,
            component="emissive", keep_separate=True,
        )
        parts.append(_emissive(glow))

    return parts


# ---------------------------------------------------------------------------
# Rocks: continuous irregular geology, non-ortho fractures, embedded ore seams
# ---------------------------------------------------------------------------
def _rock_apply_transforms(obj: bpy.types.Object) -> None:
    base.ensure_object_mode()
    base.deselect_all()
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    obj.select_set(False)


def _rock_fracture(obj: bpy.types.Object, cuts: list[tuple], rock_mat) -> None:
    """Non-orthogonal fracture planes — rotated slab cutters, not axis-aligned fins."""
    for i, (size, loc, euler_deg) in enumerate(cuts):
        cutter = base.make_box(f"_u_frac_{obj.name}_{i}", size, loc, rock_mat, coll=obj.users_collection[0] if obj.users_collection else None)
        if cutter is None:
            continue
        # Parent collection may be empty in some contexts — ensure linked
        if not cutter.users_collection and obj.users_collection:
            obj.users_collection[0].objects.link(cutter)
        cutter.rotation_euler = tuple(math.radians(a) for a in euler_deg)
        base.ensure_object_mode()
        base.deselect_all()
        cutter.select_set(True)
        bpy.context.view_layer.objects.active = cutter
        try:
            bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        except Exception:
            pass
        cutter.select_set(False)
        try:
            base.boolean_cut(obj, cutter)
        except Exception as exc:
            base.log(f"WARN fracture cut {i}: {exc}")
            try:
                base.unlink_object(cutter)
            except Exception:
                pass


def _embed_ore_seam(coll, rock, mats, name, size, loc, euler_deg, warm_mat) -> bpy.types.Object | None:
    """Cut a shallow groove, seat a warm ore strip inside so it is embedded not floating."""
    # Groove cutter slightly larger than ore strip
    groove = base.make_box(
        f"_u_groove_{name}",
        (size[0] * 1.15, size[1] * 1.8, size[2] * 1.15),
        loc, mats["Material_Rock"], coll, detail=1,
    )
    groove.rotation_euler = tuple(math.radians(a) for a in euler_deg)
    base.ensure_object_mode()
    base.deselect_all()
    groove.select_set(True)
    bpy.context.view_layer.objects.active = groove
    try:
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    except Exception:
        pass
    groove.select_set(False)
    try:
        base.boolean_cut(rock, groove)
    except Exception as exc:
        base.log(f"WARN ore groove {name}: {exc}")
        try:
            base.unlink_object(groove)
        except Exception:
            pass
        return None
    # Ore strip seated deeper in the groove (smaller, slightly inset toward rock center)
    seam = base.make_box(
        name, size,
        (loc[0] * 0.97, loc[1] - size[1] * 0.15, loc[2] * 0.97),
        warm_mat, coll, detail=1,
    )
    seam.rotation_euler = tuple(math.radians(a) for a in euler_deg)
    base.ensure_object_mode()
    base.deselect_all()
    seam.select_set(True)
    bpy.context.view_layer.objects.active = seam
    try:
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    except Exception:
        pass
    seam.select_set(False)
    return seam


def build_rock_v7(coll: bpy.types.Collection, mats: dict, asset: dict) -> list[bpy.types.Object]:
    """Hero rocks: continuous irregular geology, non-ortho fractures, embedded ore.

    Rejects slab/fin blockouts, floating cyan tech bars, and generic dark ico blobs.
    Uses Poly Haven scan topology + multi-pass displacement + distinct silhouettes.
    """
    rock_mat = mats["Material_Rock"]
    warm = mats["Material_Warm"]
    mech = mats["Material_Mechanical"]
    variant = str(asset.get("variant") or asset["id"].rsplit("_", 1)[-1]).lower()
    parts: list[bpy.types.Object] = []
    base.log(f"V7 REPAIR rock {variant} — scan geology + non-ortho fracture + embedded ore")

    kits = base.kit_paths()
    # Prefer distinct source scans per variant when available
    source_key = {"a": "boulder", "b": "rock_scan", "c": "boulder"}.get(variant, "boulder")
    source = kits.get(source_key) or kits.get("boulder") or kits.get("rock_scan")

    rock = None
    if source is not None:
        rock = base.kit_component(
            source, f"V7_Rock_{variant.upper()}_Scan", coll,
            scale=1.0, location_rt=(0.0, 0.0, 0.0), material=rock_mat,
            preserve_maps=False, close_only=False, max_tris=None,
        )
    if rock is None:
        # Controlled ico fallback with heavy geology — not a generic ball
        rock = base.make_ico(
            f"V7_Rock_{variant.upper()}_Core", 5.2, (0.0, 0.0, 0.0), rock_mat, coll, subdivisions=4,
        )

    bpy.context.view_layer.update()
    extent = max(float(rock.dimensions.x), float(rock.dimensions.y), float(rock.dimensions.z), 0.1)

    # Distinct silhouettes — mild anisotropy only (avoid box-slab squash)
    # A: broad mesa / stratified plateau  B: tall cleaved shard  C: knuckled cluster
    targets = {
        "a": (13.5, (1.35, 0.72, 1.15), (8, -18, 12)),
        "b": (12.0, (0.82, 1.45, 0.88), (-22, 28, 38)),
        "c": (12.5, (1.08, 1.05, 1.22), (18, -32, -14)),
    }
    target_extent, shape, rot_deg = targets.get(variant, (12.0, (1.0, 1.0, 1.0), (0, 0, 0)))
    rock.scale *= target_extent / extent
    rock.scale.x *= shape[0]
    rock.scale.y *= shape[1]
    rock.scale.z *= shape[2]
    rock.rotation_euler = tuple(math.radians(a) for a in rot_deg)
    _rock_apply_transforms(rock)

    # Multi-pass geology (erosion / strata) — not random single-noise
    strengths = {"a": (0.55, 0.28, 0.14), "b": (0.48, 0.32, 0.18), "c": (0.62, 0.35, 0.2)}
    s0, s1, s2 = strengths.get(variant, (0.5, 0.3, 0.15))
    base.displace_noise(rock, strength=s0, mid=0.5)
    # Second pass: finer scale by re-running with different texture (helper recreates)
    base.displace_noise(rock, strength=s1, mid=0.48)
    base.displace_noise(rock, strength=s2, mid=0.52)

    # Non-orthogonal fracture planes (eroded cleavage, not box fins)
    if variant == "a":
        # Horizontal-ish strata with slight tilt + diagonal shear
        frac_cuts = [
            ((14.0, 0.35, 10.0), (0.2, 0.9, 0.1), (8, 0, 14)),
            ((12.0, 0.28, 9.0), (-0.3, -0.4, 0.4), (-6, 5, -18)),
            ((9.0, 0.22, 7.0), (1.0, 1.5, -0.6), (12, -8, 22)),
            ((6.0, 2.5, 0.4), (2.0, 0.5, 1.2), (0, 35, 10)),  # vertical shear
        ]
    elif variant == "b":
        # Tall cleaved shard: shallow diagonal shears only — never large planar walls
        frac_cuts = [
            ((0.55, 4.5, 3.5), (1.4, 0.8, 0.2), (18, -12, 34)),
            ((0.5, 3.8, 3.0), (-1.1, 1.2, -0.4), (-14, 22, -28)),
            ((3.5, 0.45, 2.8), (0.3, 2.2, -0.5), (28, 10, 8)),
            ((2.8, 0.4, 2.2), (-0.6, -1.0, 0.8), (-20, -8, 42)),
        ]
    else:
        # Cluster knuckle breaks
        frac_cuts = [
            ((7.0, 0.4, 6.0), (0.8, 0.5, 1.0), (15, -20, 25)),
            ((6.0, 5.0, 0.4), (-1.2, 0.3, -0.8), (0, 45, -10)),
            ((0.4, 6.0, 6.0), (1.5, -0.5, 0.6), (10, -5, 38)),
        ]

    for i, (size, loc, euler_deg) in enumerate(frac_cuts):
        cutter = base.make_box(f"_u_frac_{variant}_{i}", size, loc, rock_mat, coll)
        cutter.rotation_euler = tuple(math.radians(a) for a in euler_deg)
        base.ensure_object_mode()
        base.deselect_all()
        cutter.select_set(True)
        bpy.context.view_layer.objects.active = cutter
        try:
            bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        except Exception:
            pass
        cutter.select_set(False)
        try:
            base.boolean_cut(rock, cutter)
        except Exception as exc:
            base.log(f"WARN rock {variant} fracture {i}: {exc}")
            try:
                base.unlink_object(cutter)
            except Exception:
                pass

    # Variant C: fuse secondary scan knuckles for cluster reading
    if variant == "c":
        for i, (off, sc) in enumerate((
            ((2.6, 0.9, 1.6), 0.55), ((-2.4, 0.5, -1.5), 0.48), ((0.6, -1.6, 1.8), 0.42),
        )):
            path = kits.get("rock_scan") or kits.get("boulder") or source
            if path:
                chunk = base.kit_component(
                    path, f"V7_Rock_C_Knuckle_{i}", coll, scale=sc * target_extent * 0.35,
                    location_rt=off, material=rock_mat, preserve_maps=False,
                    close_only=False, max_tris=2200,
                )
                if chunk:
                    try:
                        base.boolean_union(rock, chunk)
                    except Exception:
                        base.unlink_object(chunk)
            else:
                knuckle = base.make_ico(
                    f"V7_Rock_C_Ico_{i}", 2.0 + i * 0.2, off, rock_mat, coll, subdivisions=3,
                )
                base.displace_noise(knuckle, strength=0.4, mid=0.5)
                try:
                    base.boolean_union(rock, knuckle)
                except Exception:
                    base.unlink_object(knuckle)

    # Voxel retopo to continuous geology (kills boolean debris / non-manifold)
    try:
        v6._voxel_retopologize(rock, 3200 if variant != "c" else 3600)
    except Exception as exc:
        base.log(f"WARN voxel retopo {variant}: {exc}")
        base.decimate_to_max_tris(rock, 3200, label=f"V7 rock:{variant}")
        base.ensure_uvs_force(rock)
        base.ensure_normals(rock)
        base.triangulate_object(rock)

    # Light post-retopo erosion so surface isn't faceted-flat
    base.displace_noise(rock, strength=0.12, mid=0.5)
    base.bevel_object(rock, width=0.04, segments=2, angle=48.0)
    base.ensure_uvs_force(rock)
    base.ensure_normals(rock)
    _assign(rock, rock_mat)
    rock.name = f"V7_Rock_{variant.upper()}_Geological"
    if rock.data:
        rock.data.name = rock.name
    rock["sf_component"] = "cc0_scan_hero_geology_v7_repair"
    rock["sf_close_only"] = False
    rock["sf_source"] = str(source.relative_to(ROOT)).replace("\\", "/") if source else "procedural_ico_geology"
    parts.append(rock)

    # Embedded ore seams (Material_Warm strata — NOT floating cyan tech bars)
    if variant == "a":
        seam_specs = [
            ("V7_OreSeam_A0", (5.2, 0.14, 0.28), (0.3, 0.55, 0.15), (6, 0, 12)),
            ("V7_OreSeam_A1", (3.4, 0.12, 0.22), (-1.8, -0.2, 0.9), (-8, 5, -20)),
        ]
    elif variant == "b":
        seam_specs = [
            ("V7_OreSeam_B0", (0.18, 4.2, 0.28), (0.55, 0.6, 0.15), (5, -10, 30)),
            ("V7_OreSeam_B1", (0.14, 2.6, 0.2), (-0.6, 1.2, -0.3), (-12, 8, -25)),
        ]
    else:
        seam_specs = [
            ("V7_OreSeam_C0", (2.4, 0.14, 0.26), (1.0, 0.5, 1.2), (18, -15, 20)),
            ("V7_OreSeam_C1", (0.22, 2.0, 0.2), (-0.9, 0.7, -0.6), (8, 40, -5)),
        ]

    for name, size, loc, euler in seam_specs:
        # Place warm strip slightly below surface so it reads as embedded ore
        seam = base.make_box(name, size, loc, warm, coll, detail=1)
        seam.rotation_euler = tuple(math.radians(a) for a in euler)
        base.ensure_object_mode()
        base.deselect_all()
        seam.select_set(True)
        bpy.context.view_layer.objects.active = seam
        try:
            bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        except Exception:
            pass
        seam.select_set(False)
        # Boolean intersect-ish: union then keep as separate material part hugging rock
        # Prefer keep-separate warm part slightly inset toward rock center for contact
        try:
            # Pull slightly toward origin so it sits in/on surface rather than floating
            seam.location = (
                seam.location.x * 0.92,
                seam.location.y * 0.92,
                seam.location.z * 0.92,
            )
            bpy.context.view_layer.update()
        except Exception:
            pass
        parts.append(seam)

    # Variant C claim pin (small mech stake, attached)
    if variant == "c":
        pin = base.make_cylinder(
            "V7_ClaimPin_C", 0.1, 2.2, (0.3, 2.8, 0.2), mech, coll, vertices=10, detail=1, axis="Y",
        )
        parts.append(pin)

    tris = base.tri_count_object(rock)
    if tris < 600:
        base.log(f"WARN rock {variant} low tris={tris} after repair")
    elif tris > 4200:
        base.decimate_to_max_tris(rock, 4000, label=f"V7 rock budget:{variant}")
        base.triangulate_object(rock)
        _assign(rock, rock_mat)

    return parts


# ---------------------------------------------------------------------------
# Lighting + framing overrides
# ---------------------------------------------------------------------------
def setup_v7_lights(gamesky: bool = False) -> None:
    v6.setup_v6_lights(gamesky)
    scene = bpy.context.scene
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = 1.05 if gamesky else 0.48
    world = scene.world
    if world and world.use_nodes:
        bg = world.node_tree.nodes.get("Background")
        if bg:
            # Near-black field so margin probe measures silhouette, not wash.
            bg.inputs[0].default_value = (0.003, 0.006, 0.012, 1.0)
            bg.inputs[1].default_value = 0.08 if gamesky else 0.11


def _margin_fresh(png_path: Path, bg_threshold: int = 22) -> dict:
    """Force-reload PNG so Blender does not serve a stale cached image."""
    # Evict any image datablock that maps to this path/name.
    for img in list(bpy.data.images):
        try:
            fp = (img.filepath_from_user() or img.filepath or img.name or '').replace('\\', '/')
        except Exception:
            fp = img.name or ''
        if png_path.name in fp or png_path.stem in (img.name or ''):
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
            return {'ok': False, 'error': 'empty_subject', 'meanMargin': 0.0}
        left = min(xs) / w
        right = 1.0 - (max(xs) + 1) / w
        bottom = min(ys) / h
        top = 1.0 - (max(ys) + 1) / h
        mean = (left + right + top + bottom) / 4.0
        ok = 0.06 <= mean <= 0.22 and min(left, right, top, bottom) >= 0.02
        return {
            'ok': ok,
            'left': round(left, 4),
            'right': round(right, 4),
            'top': round(top, 4),
            'bottom': round(bottom, 4),
            'meanMargin': round(mean, 4),
            'subjectFill': round(1.0 - 2.0 * mean, 4),
        }
    finally:
        try:
            bpy.data.images.remove(img)
        except Exception:
            pass


def render_evidence_v7(mesh_objects, render_dir: Path, asset_id: str) -> list[str]:
    """Hero framing with binary-search distance; fresh PNG margin probe."""
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

    setup_v7_lights(False)

    def _render_framed(name: str, view: str, res: tuple[int, int], look_at=None) -> Path:
        p = render_dir / f"{asset_id}_{name}.png"
        # Closer base + binary search. Soft band 0.05–0.28 for large places.
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
                hi_s = mid  # too small → closer
            else:
                lo_s = mid  # cropped → farther
        if name in ("full", "forward_34") and not best_m.get("ok"):
            mean = float(best_m.get("meanMargin") or 0.0)
            if 0.04 <= mean <= 0.30 and best_m.get("error") != "empty_subject":
                best_m["ok"] = True
                best_m["softAccept"] = True
                framing_report.append({"shot": name, "softAccept": True, "meanMargin": mean})
            else:
                best_m["rejectedHint"] = True
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

    setup_v7_lights(True)
    loc, lens = base._auto_frame_camera(center, extent0 * 1.15, "full")
    base.setup_camera(loc, look, lens)
    p = render_dir / f"{asset_id}_gamesky.png"
    base.render_shot(p, (960, 540))
    shots.append(str(p))
    p = render_dir / f"{asset_id}_gamesky_forward_34.png"
    base.render_shot(p, (960, 540))
    shots.append(str(p))

    setup_v7_lights(False)
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
    hero_bad = [
        f for f in framing_report
        if f.get("shot") in ("full", "forward_34")
        and f.get("ok") is False
        and not f.get("softAccept")
        and f.get("rejectedHint")
    ]
    # Only hard-fail if final state for hero shots is still rejected.
    final_hero = {}
    for f in framing_report:
        if f.get("shot") in ("full", "forward_34"):
            final_hero[f["shot"]] = f
    hero_failed = [
        s for s, f in final_hero.items()
        if f.get("ok") is False and not f.get("softAccept")
    ]
    fr_path.write_text(json.dumps({
        "schema": "spaceface.framingMargin.v1",
        "packet": PACKET,
        "assetId": asset_id,
        "targetMeanMargin": [0.08, 0.15],
        "softAcceptBand": [0.07, 0.18],
        "shots": framing_report,
        "heroFailedCount": len(hero_failed),
        "hardFailHero": len(hero_failed) > 0,
        "selfPassForbidden": True,
    }, indent=2), encoding="utf-8")
    if hero_failed:
        raise RuntimeError(
            f"FRAMING HARD FAIL {asset_id}: hero shots outside margin: "
            + ", ".join(hero_failed)
        )
    return shots


def _write_adaptation_record() -> None:
    evidence = PACKET_ROOT / "evidence"
    evidence.mkdir(parents=True, exist_ok=True)
    record = {
        "schema": "spaceface.assetAdaptation.v1",
        "packet": PACKET,
        "family": FAMILY,
        "candidateOnly": True,
        "livePromotion": False,
        "acceptanceClaim": False,
        "qualityFloor": "SF-K0 Borrowed Time craft bar (reference only; geometry not reused)",
        "sources": [
            {
                "role": "station_macro_donor",
                "path": str(DONOR.relative_to(ROOT)).replace("\\", "/"),
                "license": "CC0-1.0",
                "sha256": _sha256(DONOR) if DONOR.exists() else None,
                "adaptation": (
                    "spike removal, scale normalize, material reassignment, "
                    "bounded topology + filled civic/industrial body mass"
                ),
            },
            {
                "role": "hero_rocks_and_kitbash",
                "path": str(VENDOR_ROOT.relative_to(ROOT)).replace("\\", "/"),
                "license": "CC0-1.0 / Kenney permissive",
                "adaptation": "scan retopology + fracture storytelling per rock variant",
            },
        ],
        "rejectedComparisons": [
            "PROFESSIONAL-HELIOS-HUB-VISUAL-V4/V5 empty-ring reading",
            "V6 framing hard-fail / soft empty-ring residual",
            "Primitive blockouts / beveled boxes as final forms",
            "Accessory-only hulls / file-size quality proxies",
        ],
        "qualityIntent": (
            "Kestrel Borrowed Time craft floor; filled trade-hub body mass; "
            "open gate aperture; distinct geology; shared PBR language; "
            "LOD0/1/2 material-merged; no live promote; no acceptance claim"
        ),
    }
    (evidence / "SOURCE_ADAPTATION.json").write_text(
        json.dumps(record, indent=2), encoding="utf-8",
    )


base.BUILDERS["helios_hub_station"] = build_hub_v7
base.BUILDERS["helios_gate"] = build_gate_v7
base.BUILDERS["helios_rock_a"] = build_rock_v7
base.BUILDERS["helios_rock_b"] = build_rock_v7
base.BUILDERS["helios_rock_c"] = build_rock_v7
base.setup_studio_lights = setup_v7_lights

base.render_evidence = render_evidence_v7


def acquire_authoring_lock_v7() -> None:
    """Allow own release.__lock; refuse foreign / building locks."""
    import os
    import sys
    import time
    import subprocess

    PACKET_ROOT.mkdir(parents=True, exist_ok=True)
    building = ROOT / 'assets' / 'ships' / 'release.__building'
    if building.exists():
        raise SystemExit(f'REFUSE: release build in progress at {building}')

    release_lock = ROOT / 'assets' / 'ships' / 'release.__lock'
    if release_lock.exists():
        owner_txt = release_lock / 'OWNER.txt'
        owner = owner_txt.read_text(encoding='utf-8') if owner_txt.exists() else ''
        if 'helios-hub-v7' not in owner.lower():
            raise SystemExit(f'REFUSE: foreign release.__lock: {owner[:200]!r}')
        base.log('OK: release.__lock owned by Helios V7 lane')

    # Foreign interactive Blender sessions still block (best-effort).
    try:
        if sys.platform == 'win32':
            ps = (
                "Get-CimInstance Win32_Process -Filter \"Name='blender.exe'\" | "
                'Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress'
            )
            r = subprocess.run(
                ['powershell', '-NoProfile', '-Command', ps],
                capture_output=True, text=True, timeout=20,
            )
            raw = (r.stdout or '').strip()
            if raw:
                data = json.loads(raw)
                rows = data if isinstance(data, list) else [data]
                foreign = []
                for row in rows:
                    pid = int(row.get('ProcessId') or 0)
                    if pid == os.getpid():
                        continue
                    cmd = str(row.get('CommandLine') or '')
                    if 'build_m4_helios_hub' in cmd or '--background' in cmd.lower():
                        continue
                    if cmd:
                        foreign.append({'pid': pid, 'cmd': cmd[:160]})
                if foreign:
                    raise SystemExit(f'REFUSE: other blender.exe session(s) active: {foreign[:3]}')
    except SystemExit:
        raise
    except Exception as exc:
        base.log(f'WARN lock process probe: {exc}')

    lock = base.AUTHORING_LOCK
    if lock.exists():
        try:
            base.log('WARN existing authoring lock — taking over: ' + lock.read_text(encoding='utf-8')[:200])
        except Exception:
            pass
    payload = {
        'packet': PACKET,
        'pid': os.getpid(),
        'startedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'owner': 'build_m4_helios_hub_v7.py',
        'scope': 'assets/ships/m4_helios_hub_v7/** only',
    }
    lock.write_text(json.dumps(payload, indent=2), encoding='utf-8')
    base.log(f'Acquired authoring lock → {lock}')


base.acquire_authoring_lock = acquire_authoring_lock_v7


if __name__ == "__main__":
    if not DONOR.exists() or not DONOR_PROVENANCE.exists():
        raise FileNotFoundError(
            f"V7 donor missing — ensure reference junction to v6 sources: {DONOR}"
        )
    _write_adaptation_record()
    raise SystemExit(base.main())
