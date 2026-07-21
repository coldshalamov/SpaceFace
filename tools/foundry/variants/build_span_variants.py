"""build_span_variants.py — Lane F helios_span donor-derived faction variants.

Builds 3 FULL variant GLBs from ``helios_span.glb`` (the dominant hauler, audit
rank #3) by ADDING macro construction onto the donor dorsal per
FACTION_SURFACE_LANGUAGE.md. Donor meshes, empties, materials, and +X-forward
pivot are preserved untouched; faction identity is carried by CONSTRUCTION
LANGUAGE + emissive PLACEMENT PATTERN, not paint.

  1. var_helios_span_mts_sealed_v01.glb  — MTS corporate sealed hold:
     clamshell fairings over the cargo frames, flush access rows, conformal
     sensor blisters (bible §MTS).
  2. var_helios_span_dmc_orebox_v01.glb  — DMC ore-box hauler: open ribbed ore
     boxes with doubler plates + dome-rivet rows, pipe runs with clamps, work
     lamps (bible §DMC).
  3. var_helios_span_reach_scrap_v01.glb — Reach scrap hauler: mixed-thickness
     scavenge plates over the spine, torch-cut edges, stitch welds, big standoff
     collars (bible §Reach).

Headless:
  blender -b --factory-startup -P tools/foundry/variants/build_span_variants.py
"""
from __future__ import annotations

import math
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)
import variant_common as vc  # noqa: E402

DONOR = vc.DONORS["helios_span"]
OUT_DIR = vc.VARIANTS_DIR

# faction -> output stem, treatment tag, deterministic seed
TREATMENTS = {
    "mts_sealed":  {"stem": "var_helios_span_mts_sealed_v01",  "tag": "MTS",  "seed": 72101},
    "dmc_orebox":  {"stem": "var_helios_span_dmc_orebox_v01",  "tag": "DMC",  "seed": 72102},
    "reach_scrap": {"stem": "var_helios_span_reach_scrap_v01", "tag": "REACH", "seed": 72103},
}


def _raycast_surface(default_z):
    return vc.make_surface_fn(default_z)


# ---------------------------------------------------------------------------
# MTS — corporate sealed hold: clamshell fairings over cargo frames, flush
# access rows, conformal sensor blisters. (bible §MTS)
#
# Z BUDGET: donor z=5.11, +25% = 6.39. Dorsal top z=2.81. Headroom to z=4.09
#   is 1.28 m. All additions kept <= 1.2 m above the donor dorsal top.
# ---------------------------------------------------------------------------
def _mts(mn, mx, r, kit, surf):
    tag = "MTS"
    cx = (mn.x + mx.x) / 2
    added = []
    paint = kit["KitMat_Paint"]
    steel = kit["KitMat_Steel"]
    emis = kit["KitMat_Emissive"]

    # 1) Continuous smooth dorsal clamshell over the cargo frames — the biggest
    #    gestalt shift. Three overlapping shells run the cargo spine. Heights
    #    kept modest to stay within the +25% Z growth budget.
    shells = [
        ("aft", cx - 7.5, 0.0, (8.5, 6.6, 1.10), 0.55),
        ("mid", cx + 0.5, 0.0, (10.0, 7.4, 1.30), 0.65),
        ("fore", cx + 8.0, 0.0, (6.0, 5.2, 0.95), 0.45),
    ]
    for nm, x, y, sz, bev in shells:
        z = vc.place_z(surf(x, y), sz[2] / 2, embed=0.30)
        added.append(vc.rounded_shell(f"VAR_{tag}_clamshell_{nm}", (x, y, z), sz, paint,
                                      bevel=bev, segments=4))

    # 2) Gold-zone accent panel on the central shell — tint -> gold at runtime.
    #    Smooth panel, product-radius. Seated on top of the mid clamshell
    #    WITHOUT stacking on raycast (use the mid shell's known z + half-height).
    gx = cx + 0.5
    # Compute mid shell's top z directly (we just placed it): center z was
    # surf(gx,0) - 0.30 + 1.30/2 = surf(gx,0) + 0.35. Top = center + 0.65.
    mid_top_z = surf(gx, 0.0) + 0.35 + 0.65
    gz = mid_top_z + 0.15  # goldzone center 0.15 m above mid shell top
    added.append(vc.rounded_shell(f"VAR_{tag}_goldzone", (gx, 0.0, gz),
                                  (4.0, 2.0, 0.22), paint, bevel=0.12, segments=3))

    # 3) Flush access rows along the clamshell parting line — the only visible
    #    "seam" on an MTS hull (bible §MTS: hidden fasteners, coin-gap parting).
    #    Two parallel thin rails running fore-aft, with serialized seal-heads
    #    at regular pitch. Use cheap flat_disk proxies to stay inside tris budget.
    seal_pitch = 0.60
    for sy in (-1, 1):
        rail_y = sy * 1.6
        rail_z = surf(cx + 0.5, rail_y) + 1.00  # raised rail above the shell
        added.append(vc.beveled_box(f"VAR_{tag}_parting_rail_{'p' if sy > 0 else 'n'}",
                                    (cx + 0.5, rail_y, rail_z), (10.0, 0.08, 0.08),
                                    steel, bevel=0.012))
        x_lo = cx + 0.5 - 4.5
        x_hi = cx + 0.5 + 4.5
        n_seals = int((x_hi - x_lo) / seal_pitch)
        for i in range(n_seals + 1):
            sx = x_lo + i * seal_pitch
            if sx < x_lo or sx > x_hi:
                continue
            added.append(vc.flat_disk(f"VAR_{tag}_seal_{ 'p' if sy > 0 else 'n'}_{i:02d}",
                                      (sx, rail_y, rail_z + 0.05),
                                      0.05, 0.02, steel, segments=6))

    # 4) Conformal sensor blisters (bible §MTS: never masts). Three smooth
    #    blisters on the dorsal — they read as bumps, not sticks.
    blisters = [(cx + 6.0, 1.8, 0.55), (cx - 2.0, -2.0, 0.50), (cx - 8.5, 1.2, 0.45)]
    for i, (x, y, rad) in enumerate(blisters):
        z = surf(x, y) + 0.90
        added.append(vc.dome(f"VAR_{tag}_blister{i}", (x, y, z), rad, steel,
                             height=rad * 0.45, subdiv=1))

    # 5) ONE clean warm cabin strip (bible §MTS: warm gold cabin strip along the
    #    glazing line). Single straight relief, not a grid.
    cabz = surf(cx + 8.0, 0.0) + 0.70
    added.append(vc.beveled_box(f"VAR_{tag}_cabinstrip", (cx + 8.0, 0.0, cabz),
                                (3.5, 0.14, 0.10), emis, bevel=0.012))
    # Logo backlight zone (small panel near the fore clamshell)
    logoz = surf(cx - 9.0, 0.0) + 0.75
    added.append(vc.beveled_box(f"VAR_{tag}_logo", (cx - 9.0, 0.0, logoz),
                                (1.0, 1.0, 0.08), emis, bevel=0.012))
    return added


# ---------------------------------------------------------------------------
# DMC — ore-box hauler: open ribbed ore boxes with doubler plates + dome-rivet
# rows, pipe runs with clamps, work lamps. (bible §DMC)
#
# Z BUDGET: additions kept <= 1.0 m above dorsal top z=2.81.
# TRIS BUDGET: donor 10688, cap = donor+40% = 14963.
# ---------------------------------------------------------------------------
def _dmc(mn, mx, r, kit, surf):
    tag = "DMC"
    cx = (mn.x + mx.x) / 2
    added = []
    paint = kit["KitMat_Paint"]
    steel = kit["KitMat_Steel"]
    rubber = kit["KitMat_Rubber"]
    emis = kit["KitMat_Emissive"]

    # 1) Open ribbed ore boxes — the signature. Big rectangular tubs seated on
    #    the cargo spine, open at the top, with transverse ribs (visible from
    #    above). Doubler plates strap the box corners. Two boxes port+starboard.
    #    Wall heights kept modest (0.9 m) to stay inside the +25% Z growth.
    ore_box_positions = [
        ("port_fwd",  cx + 4.5,  3.0),
        ("port_aft",  cx - 4.5,  3.0),
        ("stbd_fwd",  cx + 4.5, -3.0),
        ("stbd_aft",  cx - 4.5, -3.0),
    ]
    for nm, x, y in ore_box_positions:
        box_w, box_d, box_h = 5.0, 3.2, 0.90
        wall_h = box_h
        floor_z = vc.place_z(surf(x, y), 0.10, embed=0.10)
        parts = []
        # Floor
        parts.append(vc.beveled_box(f"VAR_{tag}_orebox_{nm}_floor",
                                    (x, y, floor_z + 0.05),
                                    (box_w, box_d, 0.10), paint, bevel=0.008))
        # Four walls
        for side, (ws_x, ws_y, ws_w, ws_d) in enumerate([
            ((x, y + box_d / 2 - 0.10, box_w, 0.20)),
            ((x, y - box_d / 2 + 0.10, box_w, 0.20)),
        ]):
            parts.append(vc.beveled_box(f"VAR_{tag}_orebox_{nm}_wallY{side}",
                                        (ws_x, ws_y, floor_z + wall_h / 2),
                                        (ws_w, ws_d, wall_h), paint, bevel=0.008))
        for side, (ws_x, ws_y, ws_w, ws_d) in enumerate([
            ((x + box_w / 2 - 0.10, y, 0.20, box_d)),
            ((x - box_w / 2 + 0.10, y, 0.20, box_d)),
        ]):
            parts.append(vc.beveled_box(f"VAR_{tag}_orebox_{nm}_wallX{side}",
                                        (ws_x, ws_y, floor_z + wall_h / 2),
                                        (ws_w, ws_d, wall_h), paint, bevel=0.008))
        # Transverse ribs inside the trough (visible from above as a dot-grid
        # proxy for the strong-back). 3 ribs per box at ~1.5 m pitch.
        n_ribs = 3
        for ri in range(n_ribs):
            t = (ri + 1) / (n_ribs + 1)
            rx = x - box_w / 2 + t * box_w
            parts.append(vc.beveled_box(f"VAR_{tag}_orebox_{nm}_rib{ri}",
                                        (rx, y, floor_z + wall_h * 0.5),
                                        (0.16, box_d - 0.4, wall_h * 0.4),
                                        steel, bevel=0.008))
        added.append(vc.join_objects(f"VAR_{tag}_orebox_{nm}", parts))

        # Doubler plates at the four box corners (bible §DMC: doublers at ore-
        # loading flank, tether points, engine saddle). Thick square pads.
        for ci, (sx, sy) in enumerate([(1, 1), (1, -1), (-1, 1), (-1, -1)]):
            dx = x + sx * (box_w / 2 - 0.25)
            dy = y + sy * (box_d / 2 - 0.25)
            doubler_z = floor_z + 0.10
            added.append(vc.beveled_box(f"VAR_{tag}_doubler_{nm}_{ci}",
                                        (dx, dy, doubler_z),
                                        (0.55, 0.55, 0.20), steel, bevel=0.010))

        # Dome-rivet row around the box rim (bible §DMC: dome rivets — the
        # signature dot-grid that reads at 60 px). Cheap flat_disk proxies.
        rivet_pitch = 0.70
        riv_r = 0.06
        for side_sign in (1, -1):
            ry = y + side_sign * (box_d / 2 - 0.10)
            rz = floor_z + wall_h + 0.04
            n_riv = int(box_w / rivet_pitch)
            for ri in range(n_riv + 1):
                rx = x - box_w / 2 + 0.20 + ri * rivet_pitch
                if rx > x + box_w / 2 - 0.20:
                    continue
                added.append(vc.flat_disk(f"VAR_{tag}_rivet_{nm}_{side_sign}_{ri:02d}",
                                          (rx, ry, rz), riv_r, 0.03, steel, segments=6))

    # 2) External pipe runs with saddle clamps (bible §DMC preferred module:
    #    pipe_clamp, external runs). One conduit run along the spine.
    ry = 0.0
    x_a = cx - 10.0
    x_b = cx + 10.0
    pz_a = surf(x_a, ry) + 0.30
    pz_b = surf(x_b, ry) + 0.30
    added.append(vc.tube(f"VAR_{tag}_piperun",
                         (x_a, ry, pz_a), (x_b, ry, pz_b),
                         0.14, steel, segments=8))
    # Saddle clamps along the run at ~3.0 m pitch
    clamp_pitch = 3.0
    x = x_a
    ci = 0
    while x <= x_b:
        cz = surf(x, ry) + 0.30
        added.append(vc.beveled_box(f"VAR_{tag}_saddleclamp_{ci:02d}",
                                    (x, ry, cz - 0.15),
                                    (0.40, 0.50, 0.18), rubber, bevel=0.012))
        x += clamp_pitch
        ci += 1

    # 3) Sodium-orange work lamps at service points (bible §DMC: sodium-orange
    #    work lamps at service points + hatch beacons). Two lamps on stanchions.
    lamp_sites = [(cx + 8.5, 1.5), (cx - 6.5, -1.8)]
    for i, (x, y) in enumerate(lamp_sites):
        lz_base = surf(x, y)
        # Stanchion (kept short to stay within Z budget)
        added.append(vc.tube(f"VAR_{tag}_lamp_stanchion_{i}",
                             (x, y, lz_base), (x, y, lz_base + 0.70),
                             0.05, steel, segments=6))
        # Lamp head (emissive) — flat disk to stay inside tris budget
        added.append(vc.flat_disk(f"VAR_{tag}_lamp_head_{i}",
                                  (x, y, lz_base + 0.75),
                                  0.16, 0.06, emis, segments=10))

    return added


# ---------------------------------------------------------------------------
# REACH — scrap hauler: mixed-thickness scavenge plates over the spine, torch-
# cut edges, stitch welds, big standoff collars. (bible §Reach)
# ---------------------------------------------------------------------------
def _reach(mn, mx, r, kit, surf):
    tag = "REACH"
    cx = (mn.x + mx.x) / 2
    added = []
    paint = kit["KitMat_Paint"]
    steel = kit["KitMat_Steel"]
    rubber = kit["KitMat_Rubber"]
    emis = kit["KitMat_Emissive"]

    def jit(v, frac=0.15):
        return v * (1.0 + r.uniform(-frac, frac))

    # 1) Mixed-thickness scavenge plates over the spine — the dominant read.
    #    Plates of different sizes/orientations, overlapping like scales. ±15%
    #    jitter (organic faction). Big stolen slabs mid-ship, smaller scrap
    #    toward the ends. Torch-cut = no bevel (sharp ragged outline).
    plate_slots = [
        (cx + 7.0, 0.5, 3.2, 2.6),
        (cx + 4.0, -1.8, 2.6, 2.0),
        (cx + 1.5, 1.6, 2.4, 1.8),
        (cx - 1.0, -0.8, 2.8, 2.2),
        (cx - 3.8, 1.2, 2.2, 1.6),
        (cx - 6.5, -1.5, 2.6, 2.0),
        (cx - 9.0, 0.8, 2.0, 1.5),
    ]
    for i, (x0, y0, w0, d0) in enumerate(plate_slots):
        x = x0 + r.uniform(-0.4, 0.4)
        y = y0 + r.uniform(-0.4, 0.4)
        w = jit(w0)
        d = jit(d0)
        h = r.uniform(0.30, 0.55)
        rot = math.radians(r.uniform(-22, 22))
        mat = paint if r.random() < 0.5 else steel
        z = vc.place_z(surf(x, y), h / 2, embed=r.uniform(0.10, 0.25))
        # NO bevel (torch-cut, sharp ragged edges — bible §Reach)
        plate = vc.beveled_box(f"VAR_{tag}_plate{i}", (x, y, z), (w, d, h), mat,
                               bevel=0.0, rot_z=rot)
        added.append(plate)
        # Stitch-weld bead along one random edge (bible §Reach: external stitch
        # welds). A row of tiny domes at varying pitch.
        edge_pick = r.randint(0, 3)
        if edge_pick == 0:    # +Y edge
            bx, by, bw = x, y + d / 2, w
        elif edge_pick == 1:  # -Y edge
            bx, by, bw = x, y - d / 2, w
        elif edge_pick == 2:  # +X edge
            bx, by, bw = x + w / 2, y, d
        else:                 # -X edge
            bx, by, bw = x - w / 2, y, d
        weld_pitch = jit(0.30, 0.30)
        n_welds = max(2, int(bw / weld_pitch))
        for wi in range(n_welds):
            t = (wi + 0.5) / n_welds
            if edge_pick in (0, 1):
                wx = bx - bw / 2 + t * bw
                wy = by
            else:
                wx = bx
                wy = by - bw / 2 + t * bw
            wz = z + h / 2 + 0.03
            added.append(vc.dome(f"VAR_{tag}_weld_{i}_{wi:02d}",
                                 (wx, wy, wz), 0.07, steel,
                                 height=0.04, subdiv=1))

    # 2) Big standoff collars around the engine saddles (bible §Reach preferred
    #    module: armor_spacer standoffs + weapon_collar oversized). A ring of
    #    standoff stubs around the engine bay (aft third).
    eng_x = cx - 11.5
    eng_y = 0.0
    collar_r = 2.8
    n_stubs = 8
    for i in range(n_stubs):
        a = (i / n_stubs) * math.tau
        sx = eng_x + math.cos(a) * collar_r
        sy = eng_y + math.sin(a) * collar_r * 0.6  # squashed ellipse around engine
        stub_h = r.uniform(0.45, 0.70)
        stub_z = vc.place_z(surf(sx, sy), stub_h / 2, embed=0.05)
        added.append(vc.tube(f"VAR_{tag}_standoff_{i}",
                             (sx, sy, stub_z - stub_h / 2),
                             (sx, sy, stub_z + stub_h / 2),
                             0.13, steel, segments=8))
        # Heavy square foot pad at the base (Reacher "what-was-on-the-last-ship")
        added.append(vc.beveled_box(f"VAR_{tag}_standoff_foot_{i}",
                                    (sx, sy, stub_z - stub_h / 2 + 0.04),
                                    (0.40, 0.40, 0.08), steel, bevel=0.005))

    # 3) Scorched muzzle collar at SOCKET_Weapon_Front (bible §Reach: weapon
    #    collars scorched smooth, recoil-braced). Heavily built ring at the
    #    weapon mount.
    muzzle_x = cx + 12.4
    muzzle_z = surf(muzzle_x, 0.0) + 0.20
    added.append(vc.torus_ring(f"VAR_{tag}_muzzlecollar",
                               (muzzle_x, 0.0, muzzle_z),
                               major_r=0.55, minor_r=0.18, mat=steel,
                               segments_major=18, segments_minor=8))

    # 4) Jittery red-orange tube lamps of uneven brightness (bible §Reach:
    #    jittery tube lamps, trophy rack floods, weapon root glow). Scattered,
    #    not aligned.
    lamp_sites = [(cx + 6.0, 1.9, 0.9), (cx - 2.0, -2.4, 0.6), (cx - 8.0, 1.4, 0.7)]
    for i, (x, y, ln) in enumerate(lamp_sites):
        z = surf(x, y) + 0.35 + r.uniform(-0.05, 0.10)
        added.append(vc.beveled_box(f"VAR_{tag}_lamp{i}", (x, y, z), (ln, 0.18, 0.13),
                                    emis, bevel=0.02,
                                    rot_z=math.radians(r.uniform(-30, 30))))

    return added


_TREATMENTS = {
    "mts_sealed":  _mts,
    "dmc_orebox":  _dmc,
    "reach_scrap": _reach,
}


def build_treatment(name, hull_mn, hull_mx, seed, surface_fn=None):
    """Build one treatment's macro additions. Pure in (name, bbox, seed, surf)."""
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
    print(f"SPAN_VARIANT {name} -> {os.path.basename(out)} "
          f"added_objs={len(added)} add_tris={add_tris} total_tris={tris}")
    return out


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for name in TREATMENTS:
        build_variant(name, OUT_DIR)
    print("BUILD_SPAN_VARIANTS_DONE")


if __name__ == "__main__":
    main()
