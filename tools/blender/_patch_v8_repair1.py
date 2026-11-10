#!/usr/bin/env python3
"""One-shot patcher: inject V8 REPAIR1 hub/gate/lights into build_m4_helios_hub_v8.py."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TARGET = ROOT / "tools" / "blender" / "build_m4_helios_hub_v8.py"
text = TARGET.read_text(encoding="utf-8")

# --- 1) Material lifts ---
old_tex = """def generate_v8_textures(tex_dir: Path, force: bool = False):
    maps = _generate_textures(tex_dir, force=force)
    transforms = {
        "mechanical": (
            np.array([0.92, 0.94, 0.98], dtype=np.float32),
            np.array([0.14, 0.145, 0.155], dtype=np.float32),
        ),
        "warm": (
            np.array([1.32, 1.20, 1.08], dtype=np.float32),
            np.array([0.095, 0.042, 0.012], dtype=np.float32),
        ),
        "hull": (
            np.array([1.08, 1.04, 0.99], dtype=np.float32),
            np.array([0.022, 0.016, 0.012], dtype=np.float32),
        ),
        "accent": (
            np.array([1.06, 1.10, 1.14], dtype=np.float32),
            np.array([0.012, 0.024, 0.045], dtype=np.float32),
        ),
        "rock": (
            np.array([1.05, 1.02, 0.98], dtype=np.float32),
            np.array([0.02, 0.018, 0.015], dtype=np.float32),
        ),
    }"""

new_tex = """def generate_v8_textures(tex_dir: Path, force: bool = False):
    # REPAIR1: force-lift values so graphite/hull survive actual game-sky exposure
    maps = _generate_textures(tex_dir, force=True)
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
    }"""

if old_tex not in text:
    raise SystemExit("texture block not found")
text = text.replace(old_tex, new_tex, 1)
print("OK textures")

# --- 2) Replace hub builder ---
hub_start = text.find("def build_hub_v8(")
gate_start = text.find("def build_gate_v8(")
if hub_start < 0 or gate_start < 0:
    raise SystemExit("hub/gate markers not found")

new_hub = r'''def build_hub_v8(coll: bpy.types.Collection, mats: dict, _asset: dict) -> list[bpy.types.Object]:
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


'''

text = text[:hub_start] + new_hub + text[gate_start:]
print("OK hub")

# --- 3) Replace gate builder ---
text = TARGET.read_text(encoding="utf-8") if False else text  # keep patched text
gate_start = text.find("def build_gate_v8(")
rock_start = text.find("def build_rock_v8(")
if gate_start < 0 or rock_start < 0:
    raise SystemExit("gate/rock markers not found after hub replace")

new_gate = r'''def build_gate_v8(coll: bpy.types.Collection, mats: dict, _asset: dict) -> list[bpy.types.Object]:
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


'''

text = text[:gate_start] + new_gate + text[rock_start:]
print("OK gate")

# --- 4) Game-sky lighting boost ---
old_lights = """def setup_v8_lights(gamesky: bool = False) -> None:
    v6.setup_v6_lights(gamesky)
    scene = bpy.context.scene
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = 1.08 if gamesky else 0.5
    world = scene.world
    if world and world.use_nodes:
        bg = world.node_tree.nodes.get("Background")
        if bg:
            bg.inputs[0].default_value = (0.003, 0.006, 0.012, 1.0)
            bg.inputs[1].default_value = 0.09 if gamesky else 0.12"""

new_lights = """def setup_v8_lights(gamesky: bool = False) -> None:
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
            bg.inputs[1].default_value = 0.18 if gamesky else 0.14"""

if old_lights not in text:
    raise SystemExit("lights block not found")
text = text.replace(old_lights, new_lights, 1)
print("OK lights")

TARGET.write_text(text, encoding="utf-8")
print(f"Patched {TARGET}")
