"""build_cannon_variants.py — Lane F weapon_pulse_cannon donor-derived variants.

Builds 3 FULL variant GLBs from ``weapon_pulse_cannon.glb`` — the default
modular gun (audit rank #10) that multiplies on every hardpoint. The cannon is
a small weapon part (NOT a whole-ship): dims 4.79 m × 1.0 m × 1.04 m, 1944 tris.
Geometry counts are reported by the validator; they are not an aesthetic cap.

  6. var_weapon_pulse_cannon_military_v01.glb   — SCN shroud: fitted armor
     shroud, recessed fastener rows, frame-line emissive (bible §SCN).
  7. var_weapon_pulse_cannon_industrial_v01.glb — DMC clamp: exposed clamp-
     mount, pipe clamp + conduit, gusset brackets, hazard band region (§DMC).
  8. var_weapon_pulse_cannon_pirate_v01.glb     — Reach weld jacket: scrap
     sleeve, stitch welds, mismatched plates, scorched muzzle collar (§Reach).

Headless:
  blender -b --factory-startup -P tools/foundry/variants/build_cannon_variants.py
"""
from __future__ import annotations

import bmesh
import math
import os
import sys
from mathutils import Vector

_HERE = os.path.dirname(os.path.abspath(__file__))
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)
import variant_common as vc  # noqa: E402

DONOR = vc.DONORS["weapon_pulse_cannon"]
OUT_DIR = vc.VARIANTS_DIR

TREATMENTS = {
    "military":   {"stem": "var_weapon_pulse_cannon_military_v01",   "tag": "SCN",   "seed": 72301},
    "industrial": {"stem": "var_weapon_pulse_cannon_industrial_v01", "tag": "DMC",   "seed": 72302},
    "pirate":     {"stem": "var_weapon_pulse_cannon_pirate_v01",     "tag": "REACH", "seed": 72303},
}


def _raycast_surface(default_z):
    return vc.make_surface_fn(default_z)


def _cannon_surface(surf, x, y, default_z=0.52):
    """The cannon dorsal top is roughly the bbox top (z ~= 0.52). The barrel is
    a long +X cylinder with a small +Z extent; raycasting onto it from above
    works, but the default fallback handles the muzzle overhang gracefully."""
    try:
        z = surf(x, y)
        if z is None or z < -1.0:
            return default_z
        return z
    except Exception:
        return default_z


# ---------------------------------------------------------------------------
# SCN — military shroud: fitted armor shroud, recessed fastener rows, frame-
# line emissive. (bible §SCN: order, low plate count, straight seams, frame-
# line blue emissive, recessed torx)
#
# Z BUDGET: donor z=1.04, +25% growth = 1.30; dorsal top z=0.52; headroom to
#   z=0.78 = 0.26 m. All additions kept flat (<=0.20 m tall).
# Geometry telemetry baseline: donor 1944 tris.
# ---------------------------------------------------------------------------
def _scn(mn, mx, r, kit, surf):
    tag = "SCN"
    added = []
    paint = kit["KitMat_Paint"]
    steel = kit["KitMat_Steel"]
    emis = kit["KitMat_Emissive"]

    dorsal_z = 0.52

    # 1) Fitted armor shroud — one large symmetric plate covering the central
    #    mechanical section (bible §SCN: low plate count, large uniform plates).
    shroud_x = 2.30
    added.append(vc.beveled_box(f"VAR_{tag}_shroud_main",
                                (shroud_x, 0.0, dorsal_z + 0.07),
                                (3.0, 0.92, 0.14), paint, bevel=0.015))
    # Subtle two-tone band on the shroud, exactly following a "split line"
    # (bible §SCN: masked two-tone, secondary band follows an existing split)
    added.append(vc.beveled_box(f"VAR_{tag}_twotone_band",
                                (shroud_x - 0.6, 0.0, dorsal_z + 0.15),
                                (0.16, 0.78, 0.025), paint, bevel=0.004))

    # 2) Recessed fastener rows — flush strips along the shroud's two long
    #    edges (bible §SCN: recessed torx, parallel rows). Cheap flat_disk
    #    proxies (16 tris each); count kept low to stay inside the tris budget.
    pitch = 0.50
    for sy in (-1, 1):
        y_edge = sy * 0.38
        x_lo = shroud_x - 1.0
        x_hi = shroud_x + 1.0
        n = int((x_hi - x_lo) / pitch)
        for i in range(n + 1):
            fx = x_lo + i * pitch
            if fx > x_hi + 1e-6:
                continue
            added.append(vc.flat_disk(f"VAR_{tag}_fastener_{ 'p' if sy > 0 else 'n'}_{i:02d}",
                                      (fx, y_edge, dorsal_z + 0.155),
                                      0.035, 0.010, steel, segments=5))

    # 3) Frame-line emissive — raised straight channels tracing structural
    #    lines (bible §SCN: cool blue window strips seated on frame lines,
    #    disciplined). Two parallel fore-aft lines only (skip the athwart cross
    #    to stay inside the tris budget).
    for sy in (-1, 1):
        added.append(vc.beveled_box(f"VAR_{tag}_frameline_long_{ 'p' if sy > 0 else 'n'}",
                                    (shroud_x, sy * 0.28, dorsal_z + 0.18),
                                    (2.6, 0.035, 0.035), emis, bevel=0.0))

    # 4) Weapon collar at the muzzle end (bible §SCN: armor_spacer + weapon
    #    collar on patrol fit). Small low-poly ring just behind the muzzle.
    collar_x = 4.30
    added.append(vc.torus_ring(f"VAR_{tag}_muzzlecollar",
                               (collar_x, 0.0, dorsal_z),
                               major_r=0.18, minor_r=0.05, mat=steel,
                               segments_major=8, segments_minor=4))

    return added


# ---------------------------------------------------------------------------
# DMC — industrial clamp: exposed clamp-mount, pipe clamp + conduit, gusset
# brackets, hazard band region. (bible §DMC: honest workboat, rivets, external
# pipe runs, gussets at every doubler)
#
# Z BUDGET: additions kept <= 0.22 m tall above dorsal z=0.52.
# TRIS BUDGET: donor 1944, cap 2500, additions <= 556 tris.
# ---------------------------------------------------------------------------
def _dmc(mn, mx, r, kit, surf):
    tag = "DMC"
    added = []
    paint = kit["KitMat_Paint"]
    steel = kit["KitMat_Steel"]
    rubber = kit["KitMat_Rubber"]
    emis = kit["KitMat_Emissive"]

    dorsal_z = 0.52

    # 1) Exposed clamp-mount — a saddle-clamp assembly strapping the cannon to
    #    its hardpoint (bible §DMC: external clamp-mounts, honest hardware).
    #    Bevel-free small boxes to stay inside the tris budget.
    clamp_sites = [0.8, 2.6]
    for i, cx in enumerate(clamp_sites):
        # Saddle base (square pad under the barrel)
        added.append(vc.beveled_box(f"VAR_{tag}_clampbase_{i}",
                                    (cx, 0.0, dorsal_z - 0.12),
                                    (0.32, 0.80, 0.08), steel, bevel=0.0))
        # Two side ears of the clamp
        for sy in (-1, 1):
            added.append(vc.beveled_box(f"VAR_{tag}_clampear_{i}_{ 'p' if sy > 0 else 'n'}",
                                        (cx, sy * 0.38, dorsal_z + 0.04),
                                        (0.28, 0.08, 0.20), steel, bevel=0.0))
            # One dome rivet per ear (bible §DMC signature) — kept minimal.
            rx = cx
            added.append(vc.flat_disk(f"VAR_{tag}_rivet_{i}_{ 'p' if sy > 0 else 'n'}",
                                      (rx, sy * 0.38, dorsal_z + 0.15),
                                      0.028, 0.012, steel, segments=5))

    # 2) Pipe clamp + conduit — an external pipe run with saddle clamps (bible
    #    §DMC preferred module: pipe_clamp, external runs). Runs along one side.
    pipe_y = 0.36
    pipe_z = dorsal_z + 0.10
    added.append(vc.tube(f"VAR_{tag}_conduit",
                         (0.4, pipe_y, pipe_z), (3.0, pipe_y, pipe_z),
                         0.04, steel, segments=6))
    # Saddle clamps along the conduit (2 only — tight tris budget)
    for i, cx in enumerate([1.1, 2.4]):
        added.append(vc.beveled_box(f"VAR_{tag}_conduit_clamp_{i}",
                                    (cx, pipe_y, pipe_z - 0.03),
                                    (0.08, 0.14, 0.08), rubber, bevel=0.0))

    # 3) Gusset brackets — triangular stiffeners at the clamp bases (bible §DMC
    #    preferred: bracket_gusset at every doubler). One per clamp ear. Bevel-
    #    free small boxes to stay inside the tris budget.
    for i, cx in enumerate(clamp_sites):
        for sy in (-1, 1):
            bm = bmesh.new()
            bmesh.ops.create_cube(bm, size=1.0)
            for v in bm.verts:
                v.co.x *= 0.13
                v.co.y *= 0.030
                v.co.z *= 0.13
            cs, ss = math.cos(math.radians(45)), math.sin(math.radians(45))
            for v in bm.verts:
                x, z = v.co.x, v.co.z
                v.co.x = x * cs - z * ss
                v.co.z = x * ss + z * cs
            for v in bm.verts:
                v.co += Vector((cx, sy * 0.38, dorsal_z - 0.04))
            bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
            obj = vc._finish(bm, f"VAR_{tag}_gusset_{i}_{ 'p' if sy > 0 else 'n'}", steel)
            added.append(obj)

    # 4) Hazard band region — a raised chevron-marked band on the breech
    #    (bible §DMC: hazard chevrons and lift-point marks, slightly crooked).
    #    Shifted forward (band_x=0.8) so it stays well within donor X range.
    #    Bevel-free; chevrons are simple flat boxes.
    band_x = 0.8
    added.append(vc.beveled_box(f"VAR_{tag}_hazardband_base",
                                (band_x, 0.0, dorsal_z + 0.06),
                                (1.0, 0.80, 0.08), paint, bevel=0.0))
    # Two chevron slats (small angled bars)
    for ci in range(2):
        cx = band_x - 0.20 + ci * 0.30
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        for v in bm.verts:
            v.co.x *= 0.20
            v.co.y *= 0.42
            v.co.z *= 0.03
        rot = math.radians(15)
        c, s = math.cos(rot), math.sin(rot)
        for v in bm.verts:
            x, y = v.co.x, v.co.y
            v.co.x = x * c - y * s
            v.co.y = x * s + y * c
        for v in bm.verts:
            v.co += Vector((cx, 0.0, dorsal_z + 0.11))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        obj = vc._finish(bm, f"VAR_{tag}_chevron_{ci}", steel)
        added.append(obj)

    # 5) Sodium work lamp (bible §DMC: sodium work lamps at service points) —
    #    small flat emissive disk, kept low to stay inside the Z budget.
    added.append(vc.flat_disk(f"VAR_{tag}_worklamp",
                              (band_x, -0.36, dorsal_z + 0.12),
                              0.06, 0.025, emis, segments=8))

    return added


# ---------------------------------------------------------------------------
# REACH — weld jacket: scrap sleeve, stitch welds, mismatched plates, scorched
# muzzle collar. (bible §Reach: rattle-can over unprimed, mixed salvage, weld
# seams, scorched shroud wraps)
#
# Z BUDGET: additions kept <= 0.20 m tall above dorsal z=0.52.
# TRIS BUDGET: donor 1944, cap 2500, additions <= 556 tris.
# ---------------------------------------------------------------------------
def _reach(mn, mx, r, kit, surf):
    tag = "REACH"
    added = []
    paint = kit["KitMat_Paint"]
    steel = kit["KitMat_Steel"]
    rubber = kit["KitMat_Rubber"]
    emis = kit["KitMat_Emissive"]

    dorsal_z = 0.52

    def jit(v, frac=0.15):
        return v * (1.0 + r.uniform(-frac, frac))

    # 1) Scrap sleeve — mismatched plates of different sizes overlapping along
    #    the barrel (bible §Reach: scavenge plates, mixed-thickness, no grid).
    #    Three irregular plates with random yaw and varied heights. Flat (<=0.18m).
    #    Positions kept within donor X range [0, 4.5] so bbox X does not grow.
    plate_specs = [
        (0.7,  0.0,  1.00, 0.16),
        (1.9,  0.15, 0.90, 0.14),
        (3.0, -0.10, 1.00, 0.18),
    ]
    for i, (px, py_off, pw, ph) in enumerate(plate_specs):
        py = py_off
        rot = math.radians(r.uniform(-12, 12))
        mat = paint if r.random() < 0.5 else steel
        # No bevel (torch-cut, sharp ragged edges — bible §Reach)
        added.append(vc.beveled_box(f"VAR_{tag}_scrapplate_{i}",
                                    (px, py, dorsal_z + ph / 2),
                                    (pw, 0.80, ph), mat, bevel=0.0, rot_z=rot))

    # 2) Stitch welds — irregular weld beads along the plate seams (bible
    #    §Reach: external stitch welds). Proxy: small flat disks at varying
    #    pitch. Kept low to stay within Z budget.
    weld_seams = [1.10, 2.40]
    for si, wx in enumerate(weld_seams):
        n = 3
        for wi in range(n):
            t = (wi + 0.5) / n
            offset = (t - 0.5) * 0.5
            wy_local = offset
            added.append(vc.flat_disk(f"VAR_{tag}_weld_{si}_{wi}",
                                      (wx, wy_local, dorsal_z + 0.18),
                                      0.040, 0.020, steel, segments=5))

    # 3) Scorched muzzle collar — oversized, heavily built (bible §Reach:
    #    weapon collars scorched smooth, oversized). Sits behind the muzzle.
    collar_x = 4.20
    added.append(vc.torus_ring(f"VAR_{tag}_muzzlecollar",
                               (collar_x, 0.0, dorsal_z + 0.04),
                               major_r=0.22, minor_r=0.08, mat=steel,
                               segments_major=12, segments_minor=5))
    # Heavy recoil braces (3 struts) — kept radially inside the collar's Z extent
    for bi in range(3):
        a = (bi / 3) * math.tau
        bx_in = collar_x + math.cos(a) * 0.22
        by_in = math.sin(a) * 0.22
        bx_out = collar_x + math.cos(a) * 0.42 - 0.08
        by_out = math.sin(a) * 0.42
        added.append(vc.tube(f"VAR_{tag}_wcollar_strut_{bi}",
                             (bx_in, by_in, dorsal_z + 0.04),
                             (bx_out, by_out, dorsal_z + 0.04),
                             0.028, steel, segments=5))

    # 4) Tape/prayer patch — one patch of speed tape wrapped around a seam
    #    (bible §Free, but Reach too: "some seams caulk and spite"). Thin
    #    rectangular wrap around the barrel at a random seam.
    patch_x = 1.4
    added.append(vc.beveled_box(f"VAR_{tag}_tapepatch",
                                (patch_x, 0.0, dorsal_z + 0.03),
                                (0.22, 0.88, 0.14), rubber, bevel=0.004))

    # 5) Jittery red-orange lamp (bible §Reach: jittery tube lamps). One
    #    crooked stub on top — flat, kept low.
    lamp_x = 2.2
    added.append(vc.flat_disk(f"VAR_{tag}_lamp",
                              (lamp_x, 0.0, dorsal_z + 0.16),
                              0.07, 0.04, emis, segments=8))

    return added


_TREATMENTS = {
    "military":   _scn,
    "industrial": _dmc,
    "pirate":     _reach,
}


def build_treatment(name, hull_mn, hull_mx, seed, surface_fn=None):
    kit = vc.ensure_all_kitmats()
    r = vc.rng(seed)
    surf = surface_fn if surface_fn is not None else (lambda x, y: hull_mx.z * 0.78)
    return _TREATMENTS[name](hull_mn, hull_mx, r, kit, surf)


def build_variant(name, out_dir):
    vc.reset_scene()
    vc.import_glb(DONOR)
    hull = vc.all_meshes()
    mn, mx, _, _ = vc.mesh_bbox(hull)
    donor_top = mx.z
    surf = _raycast_surface(donor_top * 0.78)
    added = build_treatment(name, mn, mx, TREATMENTS[name]["seed"], surface_fn=surf)
    out = os.path.join(out_dir, TREATMENTS[name]["stem"] + ".glb")
    vc.export_all_glb(out)
    tris = sum(vc.object_tris(o) for o in vc.all_meshes())
    add_tris = sum(vc.object_tris(o) for o in added)
    print(f"CANNON_VARIANT {name} -> {os.path.basename(out)} "
          f"added_objs={len(added)} add_tris={add_tris} total_tris={tris}")
    return out


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for name in TREATMENTS:
        build_variant(name, OUT_DIR)
    print("BUILD_CANNON_VARIANTS_DONE")


if __name__ == "__main__":
    main()
