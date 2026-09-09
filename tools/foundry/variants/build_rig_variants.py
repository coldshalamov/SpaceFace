"""build_rig_variants.py — Lane F ashline_rig donor-derived hostile variants.

Builds 2 FULL variant GLBs from ``ashline_rig.glb`` — the donor both
``reaver_pirate`` and ``corsair_raider`` map to (audit rank #7,
``partsLibrary.js:417-418``). After this, the two hostile types stop being
twins: silhouette-level differences visible top-down.

  4. var_ashline_rig_reaver_hook_v01.glb — Reaver hook-scavenger: salvage
     crane/hook gantry, grapple spars, drag-scarred prow plates.
  5. var_ashline_rig_corsair_blade_v01.glb — Corsair blade-raider: swept blade
     fairings, forward weapon collars, ram lip — same skeleton, different predator.

Headless:
  blender -b --factory-startup -P tools/foundry/variants/build_rig_variants.py
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

# Lane-D kitgen lives in a sibling dir; import its bracket_gusset family for the
# spar-root reinforcement the taste review (K-TASTE-REVIEW b.3) asks for.
_KITGEN_DIR = os.path.abspath(os.path.join(_HERE, "..", "kitgen"))
if _KITGEN_DIR not in sys.path:
    sys.path.insert(0, _KITGEN_DIR)
import kitgen  # noqa: E402

DONOR = vc.DONORS["ashline_rig"]
OUT_DIR = vc.VARIANTS_DIR

TREATMENTS = {
    "reaver_hook":  {"stem": "var_ashline_rig_reaver_hook_v01",  "tag": "REAVOR", "seed": 72201},
    "corsair_blade": {"stem": "var_ashline_rig_corsair_blade_v01", "tag": "CORSAIR", "seed": 72202},
}

# Taste-fix round (K-TASTE-REVIEW b.3): reaver grapple spars and corsair blade
# supports sat near the distance-vanishing threshold. Load-bearing spar/support
# cross-sections are bumped to >=0.35 m and a kitgen ``bracket_gusset`` (V01
# triangular plate) is seated at each spar root. Tip hardware stays thin so the
# taper reads as intent.
SPAR_ROOT_RADIUS_M = 0.20          # grapple-arm tube radius -> 0.40 m cross-section
BLADE_ROOT_Y_M = 0.50              # blade root Y cross-section (was 0.40)
BLADE_TAPER = 0.68                 # blade Y taper coeff (was 0.60); tip stays ~0.16 m


def _raycast_surface(default_z):
    return vc.make_surface_fn(default_z)


def _spar_root_gusset(tag, idx, root, d_xy, steel_mat, seed):
    """Seat a kitgen bracket_gusset (V01 right-triangular plate) at a spar root.

    The gusset is rebuilt at the origin by kitgen (transforms already applied),
    then this helper re-roots its mesh as a vertical reinforcement plate whose
    two legs run along the horizontal spar azimuth ``d_xy`` (unit, XY) and +Z,
    with its right-angle corner at ``root`` = (rx, ry, rz). The gusset's own
    thickness is centred on the spar's vertical plane so the bracket straddles
    the spar centreline. Pure function of (tag, idx, root, d_xy, seed) -> the
    VAR_-prefixed, KitMat_Steel-assigned object. No draw from the treatment RNG,
    so existing geometry is left byte-identical.
    """
    g = kitgen.build("bracket_gusset", 1, seed)[0]
    zs = [v.co.z for v in g.data.vertices]
    zmid = (min(zs) + max(zs)) * 0.5
    dx, dy = d_xy
    rx, ry, rz = root
    for v in g.data.vertices:
        x = v.co.x
        y = v.co.y
        z = v.co.z - zmid
        # Rotation: local +X -> d_xy (along spar), local +Y -> +Z (up),
        # local +Z -> (dy, -dx, 0) (horizontal perpendicular). det == 1.
        v.co.x = (x * dx + z * dy) + rx
        v.co.y = (x * dy - z * dx) + ry
        v.co.z = y + rz
    g.name = f"VAR_{tag}_spar_gusset_{idx}"
    g.data.name = f"VAR_{tag}_spar_gusset_{idx}_mesh"
    vc.assign_material(g, steel_mat)
    return g


# ---------------------------------------------------------------------------
# REAVOR — hook-scavenger: salvage crane/hook gantry, grapple spars, drag-
# scarred prow plates. (bible §Reach applied to a hostile hull)
#
# Z BUDGET: donor z=5.97, +25% = 7.46. Dorsal top z=3.87. Headroom to z=5.36
#   is 1.49 m. Crane gantry height kept at 1.2 m; spars/prow plates kept low.
# ---------------------------------------------------------------------------
def _reavor(mn, mx, r, kit, surf, seed):
    tag = "REAVOR"
    cx = (mn.x + mx.x) / 2
    added = []
    paint = kit["KitMat_Paint"]
    steel = kit["KitMat_Steel"]
    rubber = kit["KitMat_Rubber"]
    emis = kit["KitMat_Emissive"]

    def jit(v, frac=0.15):
        return v * (1.0 + r.uniform(-frac, frac))

    # 1) Salvage crane gantry — the silhouette-defining addition. An A-frame
    #    standing proud of the dorsal with a horizontal jib and a hanging hook.
    #    Built over the mid-aft cargo bed. Gantry height 1.2 m to stay within
    #    the +25% Z budget; jib and hook hang below the gantry top.
    crane_x = cx - 1.0
    crane_y = 0.0
    base_z = surf(crane_x, crane_y)
    gantry_h = 1.20
    gantry_w = 3.4
    # Two A-frame legs (splayed, port + starboard)
    for sign in (1, -1):
        leg_top_x = crane_x
        leg_top_y = crane_y + sign * 0.5
        leg_bot_x = crane_x + sign * 0.4
        leg_bot_y = crane_y + sign * (gantry_w / 2)
        added.append(vc.tube(f"VAR_{tag}_gantry_leg_{'p' if sign > 0 else 'n'}",
                             (leg_bot_x, leg_bot_y, base_z),
                             (leg_top_x, leg_top_y, base_z + gantry_h),
                             0.11, steel, segments=7))
    # Crossbeam at the top (the gantry header)
    beam_z = base_z + gantry_h
    added.append(vc.beveled_box(f"VAR_{tag}_gantry_header",
                                (crane_x, 0.0, beam_z),
                                (0.28, gantry_w + 0.5, 0.28), steel, bevel=0.015))
    # Jib arm extending forward (+X) from the gantry header
    jib_len = 3.5
    jib_x = crane_x + jib_len / 2
    added.append(vc.beveled_box(f"VAR_{tag}_crane_jib",
                                (jib_x, 0.0, beam_z),
                                (jib_len, 0.24, 0.24), steel, bevel=0.015))
    # Jib diagonal kicker (triangulation)
    jib_tip_x = crane_x + jib_len
    added.append(vc.tube(f"VAR_{tag}_crane_kicker",
                         (crane_x - 0.3, 0.5, beam_z - 0.14),
                         (jib_tip_x - 0.2, 0.5, beam_z),
                         0.06, steel, segments=5))
    # Hanging hook block + chain at the jib tip (drops down — does not add to z_max)
    hook_z_top = beam_z - 0.18
    hook_z_bot = hook_z_top - 0.80
    added.append(vc.tube(f"VAR_{tag}_crane_chain",
                         (jib_tip_x, 0.0, hook_z_top),
                         (jib_tip_x, 0.0, hook_z_bot + 0.18),
                         0.04, steel, segments=5))
    # Hook block (heavy cube)
    added.append(vc.beveled_box(f"VAR_{tag}_hook_block",
                                (jib_tip_x, 0.0, hook_z_bot),
                                (0.45, 0.32, 0.36), steel, bevel=0.015))
    # Hook itself (curved tube proxy — full torus)
    added.append(vc.torus_ring(f"VAR_{tag}_hook_ring",
                               (jib_tip_x, 0.0, hook_z_bot - 0.22),
                               major_r=0.18, minor_r=0.05, mat=steel,
                               segments_major=10, segments_minor=5))

    # 2) Grapple spars — long outward-reaching rods with end claws, asymmetric.
    #    Kept within Z budget (spar tip < donor z_max + 1.49).
    spar_specs = [
        ("port",  cx + 2.5,  2.4, math.radians(35), 2.6),
        ("stbd",  cx - 3.0, -2.2, math.radians(-28), 2.4),
    ]
    for si, (nm, sx, sy, ang, slen) in enumerate(spar_specs):
        base_z_s = surf(sx, sy) + 0.30
        ex = sx + math.cos(ang) * slen
        ey = sy - math.sin(ang) * slen
        ez = base_z_s + 0.60  # rises only 0.60 m above the local surface
        # Load-bearing grapple spar: cross-section bumped to >=0.35 m
        # (radius 0.20 -> 0.40 m diameter) per K-TASTE-REVIEW b.3.
        added.append(vc.tube(f"VAR_{tag}_grapple_arm_{nm}",
                             (sx, sy, base_z_s), (ex, ey, ez),
                             SPAR_ROOT_RADIUS_M, steel, segments=7))
        # Claw at the tip — three short claw fingers (TIP hardware, kept thin)
        for ci, ca in enumerate((math.radians(0), math.radians(50), math.radians(-50))):
            cx_tip = ex + math.cos(ang + ca) * 0.36
            cy_tip = ey - math.sin(ang + ca) * 0.36
            added.append(vc.tube(f"VAR_{tag}_grapple_claw_{nm}_{ci}",
                                 (ex, ey, ez),
                                 (cx_tip, cy_tip, ez - 0.22),
                                 0.04, steel, segments=5))
        # Gusset the spar root: kitgen bracket_gusset seated at the arm root,
        # legs along the arm azimuth and +Z.
        added.append(_spar_root_gusset(
            tag, nm, (sx, sy, base_z_s),
            (math.cos(ang), -math.sin(ang)), steel, seed + 1000 * (si + 1)))

    # 3) Drag-scarred prow plates — thick forward armor plates with visible
    #    scalloped drag damage on the leading edge (bible §Reach: burred torch
    #    cuts, blistered). Two heavy plates forward, asymmetric.
    prow_x = cx + 6.0
    for i, (py, prot) in enumerate([(1.0, math.radians(15)), (-0.8, math.radians(-18))]):
        pz = vc.place_z(surf(prow_x, py), 0.30, embed=0.10)
        added.append(vc.beveled_box(f"VAR_{tag}_prowplate_{i}",
                                    (prow_x, py, pz), (2.4, 1.6, 0.40), paint,
                                    bevel=0.0, rot_z=prot))
        # Scalloped drag scars on the leading edge — three small bite-marks
        for sc in range(3):
            t = (sc + 0.5) / 3
            sx_local = -0.9
            sy_local = -0.6 + t * 1.2
            c, s = math.cos(prot), math.sin(prot)
            wx = prow_x + sx_local * c - sy_local * s
            wy = py + sx_local * s + sy_local * c
            added.append(vc.flat_disk(f"VAR_{tag}_prowscar_{i}_{sc}",
                                      (wx, wy, pz + 0.18), 0.14, 0.05, steel, segments=6))

    # 4) Trophy rack floods (bible §Reach: extra floods bolted around trophy
    #    racks). Scattered emissive stubs near the crane base.
    for i, (x, y) in enumerate([(cx + 1.0, 1.5), (cx - 2.0, -1.5), (crane_x, 1.0)]):
        z = surf(x, y) + 0.30 + r.uniform(-0.04, 0.08)
        added.append(vc.beveled_box(f"VAR_{tag}_flood_{i}", (x, y, z),
                                    (0.45, 0.13, 0.10), emis, bevel=0.010,
                                    rot_z=math.radians(r.uniform(-25, 25))))

    return added


# ---------------------------------------------------------------------------
# CORSAIR — blade-raider: swept blade fairings, forward weapon collars, ram
# lip. Same skeleton, different predator. (bible §Reach offensive)
# ---------------------------------------------------------------------------
def _corsair(mn, mx, r, kit, surf, seed):
    tag = "CORSAIR"
    cx = (mn.x + mx.x) / 2
    added = []
    paint = kit["KitMat_Paint"]
    steel = kit["KitMat_Steel"]
    rubber = kit["KitMat_Rubber"]
    emis = kit["KitMat_Emissive"]

    def jit(v, frac=0.10):
        return v * (1.0 + r.uniform(-frac, frac))

    # 1) Swept blade fairings — the silhouette-defining addition. Tall swept
    #    fins/blade-fairings rising from the dorsal hull, sweeping forward.
    #    Four blades symmetric pairs, giving a predator profile. Dimensions
    #    tuned to keep Z growth within the +25% bible allowance.
    blade_specs = [
        # (x, y, length_along_X, height, sweep_angle_rad, yaw_rad)
        (cx + 3.0,  1.8, 3.2, 1.15, math.radians(18),  math.radians(8)),    # port-fwd
        (cx + 3.0, -1.8, 3.2, 1.15, math.radians(18),  math.radians(-8)),   # stbd-fwd
        (cx - 2.0,  2.2, 2.6, 0.95, math.radians(-14), math.radians(12)),   # port-aft
        (cx - 2.0, -2.2, 2.6, 0.95, math.radians(-14), math.radians(-12)),  # stbd-aft
    ]
    for i, (bx, by, blen, bh, sweep, yaw) in enumerate(blade_specs):
        bz_base = surf(bx, by)
        # Build the blade as a tapered box: long along X, narrow along Y, tall Z.
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        # Taper: tip (X+) is thinner in Y and shorter in Z than root (X-).
        # Load-bearing root Y cross-section bumped to >=0.35 m (0.50 m) per
        # K-TASTE-REVIEW b.3; taper steepened so the tip stays thin (~0.16 m)
        # and the taper still reads as intent.
        for v in bm.verts:
            v.co.x *= blen
            taper_t = (v.co.x / blen) + 0.5  # 0 at root (X-), 1 at tip (X+)
            y_scale = 1.0 - BLADE_TAPER * taper_t
            z_scale = 1.0 - 0.3 * taper_t
            v.co.y *= BLADE_ROOT_Y_M * y_scale
            v.co.z *= bh * z_scale
        # Sweep about Y so positive sweep angle raises the tip (forward-up).
        cs, ss = math.cos(sweep), math.sin(sweep)
        for v in bm.verts:
            x, z = v.co.x, v.co.z
            v.co.x = x * cs - z * ss
            v.co.z = x * ss + z * cs
        # Yaw about Z.
        cyaw, syaw = math.cos(yaw), math.sin(yaw)
        for v in bm.verts:
            x, y = v.co.x, v.co.y
            v.co.x = x * cyaw - y * syaw
            v.co.y = x * syaw + y * cyaw
        # Translate so root sits ~0.1 m into the hull surface.
        for v in bm.verts:
            v.co += Vector((bx, by, bz_base + bh * 0.4))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bmesh.ops.bevel(bm, geom=bm.edges[:] + bm.verts[:],
                        offset=0.025, segments=2,
                        affect="EDGES", clamp_overlap=True)
        obj = vc._finish(bm, f"VAR_{tag}_blade{i}", paint)
        added.append(obj)
        # Gusset the blade root: kitgen bracket_gusset seated on the hull at
        # the blade mount, legs along the blade yaw and +Z.
        added.append(_spar_root_gusset(
            tag, i, (bx, by, bz_base),
            (math.cos(yaw), math.sin(yaw)), steel, seed + 1000 * (i + 1)))

    # 2) Forward weapon collars — heavy reinforced rings around the weapon
    #    mounts (bible §Reach: oversized weapon collars, recoil-braced). Two
    #    collars, port + starboard of the existing SOCKET_Weapon_Front.
    weapon_x = cx + 6.9
    for sy, sy_off in [(1, 1.4), (-1, -1.4)]:
        cz = surf(weapon_x, sy_off) + 0.40
        added.append(vc.torus_ring(f"VAR_{tag}_weaponcollar_{ 'p' if sy > 0 else 'n'}",
                                   (weapon_x, sy_off, cz),
                                   major_r=0.42, minor_r=0.16, mat=steel,
                                   segments_major=16, segments_minor=8))
        # Recoil brace struts (3 radial)
        for bi in range(3):
            a = (bi / 3) * math.tau
            bx_in = weapon_x + math.cos(a) * 0.42
            by_in = sy_off + math.sin(a) * 0.42
            bx_out = weapon_x + math.cos(a) * 0.85
            by_out = sy_off + math.sin(a) * 0.85
            added.append(vc.tube(f"VAR_{tag}_wcollar_strut_{'p' if sy > 0 else 'n'}_{bi}",
                                 (bx_in, by_in, cz), (bx_out, by_out, cz),
                                 0.04, steel, segments=6))

    # 3) Ram lip — a heavy reinforced prow lip at the +X forward edge, the
    #    corsair "I ram things" signature. Single massive bar across the bow
    #    with a thick leading edge.
    ram_x = cx + 8.0
    ram_z = surf(ram_x, 0.0) + 0.30
    # Main ram bar (wide, thick, spanning the beam)
    added.append(vc.beveled_box(f"VAR_{tag}_ramlip_main",
                                (ram_x, 0.0, ram_z), (0.80, 4.6, 0.65),
                                steel, bevel=0.04))
    # Ram lip尖锐 leading edge (a wedge)
    wedge_x = ram_x + 0.65
    added.append(vc.beveled_box(f"VAR_{tag}_ramlip_edge",
                                (wedge_x, 0.0, ram_z - 0.10), (0.30, 4.4, 0.35),
                                steel, bevel=0.02))
    # Scorch ring at the ram tip (heat-polished from impacts)
    for sy_off in (1.8, -1.8):
        added.append(vc.dome(f"VAR_{tag}_ramscar_{'p' if sy_off > 0 else 'n'}",
                             (wedge_x + 0.10, sy_off, ram_z), 0.22, steel,
                             height=0.08, subdiv=2))

    # 4) Jittery emissive — kill-tally glow under the canopy (bible §Reach:
    #    weapon root glow, extra floods). Three small uneven lamps.
    # Lamp xy must lie on the dorsal plateau: the rig hull is asymmetric and
    # most negative-y / far-fore points miss the footprint (surf() falls back).
    for i, (x, y) in enumerate([(cx + 2.5, 0.4), (cx - 1.2, 1.3), (cx + 0.8, 0.9)]):
        # Seat the lamp base on the hull: half box height + a hair of bed,
        # jitter only upward so contact is never broken.
        z = surf(x, y) + 0.05 + 0.01 + r.uniform(0.0, 0.04)
        added.append(vc.beveled_box(f"VAR_{tag}_lamp{i}", (x, y, z),
                                    (0.45, 0.14, 0.10), emis, bevel=0.012,
                                    rot_z=math.radians(r.uniform(-20, 20))))

    return added


_TREATMENTS = {
    "reaver_hook":   _reavor,
    "corsair_blade": _corsair,
}


def build_treatment(name, hull_mn, hull_mx, seed, surface_fn=None):
    kit = vc.ensure_all_kitmats()
    r = vc.rng(seed)
    surf = surface_fn if surface_fn is not None else (lambda x, y: hull_mx.z * 0.78)
    return _TREATMENTS[name](hull_mn, hull_mx, r, kit, surf, seed)


def build_variant(name, out_dir):
    vc.reset_scene()
    vc.import_glb(DONOR)
    hull = vc.all_meshes()
    mn, mx, _, _ = vc.mesh_bbox(hull)
    donor_top = mx.z
    surf = _raycast_surface(donor_top * 0.78)
    added = build_treatment(name, mn, mx, TREATMENTS[name]["seed"], surface_fn=surf)
    # kitgen's bracket_gusset calls ensure_materials(), which resets the four
    # shared KitMat BSDFs to kitgen's spec (KitMat_Emissive base colour differs
    # from variant_common's). Restore variant_common's canonical values so the
    # only change vs HEAD is spar geometry + gussets, not material values.
    vc.ensure_all_kitmats()
    out = os.path.join(out_dir, TREATMENTS[name]["stem"] + ".glb")
    vc.export_all_glb(out)
    tris = sum(vc.object_tris(o) for o in vc.all_meshes())
    add_tris = sum(vc.object_tris(o) for o in added)
    print(f"RIG_VARIANT {name} -> {os.path.basename(out)} "
          f"added_objs={len(added)} add_tris={add_tris} total_tris={tris}")
    return out


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for name in TREATMENTS:
        build_variant(name, OUT_DIR)
    print("BUILD_RIG_VARIANTS_DONE")


if __name__ == "__main__":
    main()
