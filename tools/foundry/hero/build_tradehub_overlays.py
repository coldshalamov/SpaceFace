"""Fleet Breadth Foundry — HERO Mission B: Trade-hub construction overlays.

Builds 3 OVERLAY GLBs (ADDITIONS ONLY, authored in the donor's coordinate frame,
origin identical) that reskin the shared trade-hub station per faction:
  * SCN  — Concord plated: orthogonal cladding band + corner bastions + roof masts + twin customs booms
  * MTS  — Meridian gantry: standoff commerce rings + rounded clamshell corner crowns + holo-ad billboards
  * Free — patchwork: big scavenged habitat pods breaking the rim + junk truss splices + hanging skirts

The donor (place_station_trade_hub.glb, ~1.66M tris, EXT_meshopt_compression) is
NOT re-exported and is NOT needed to AUTHOR the overlays: overlays are built against
the donor's Blender-space bounding frame (HUB_FRAME below, verified by importing a
decompressed copy). Blender 5.1 cannot import the meshopt donor directly; the
before/after render decompresses a working copy via tools/art/decompress_part.mjs.

Overlay tri cap 12000 each. Writes variants/tradehub_overlays.json.
Headless: blender -b --factory-startup -P tools/foundry/hero/build_tradehub_overlays.py
"""
from __future__ import annotations

import json
import math
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)
import hero_common as hc  # noqa: E402

import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

ROOT = os.path.abspath(os.path.join(_HERE, "..", "..", ".."))
OUT_DIR = os.path.join(ROOT, "assets", "ships", "foundry", "fleet_breadth_20260720", "variants")
DONOR_REL = "assets/ships/parts/places/place_station_trade_hub.glb"

# Donor Blender-space frame (glTF Y-up -> Blender Z-up: Blender=(x,-z,y)); VERIFIED
# against a decompressed import: dims [120.845, 104.854, 32.857], center (3,0,12.25).
HUB_FRAME = {
    "min": (-57.423, -52.425, -4.180),
    "max": (63.422, 52.429, 28.677),
    "center": (2.9995, 0.002, 12.2485),
    "outerRX": 60.4,   # X half-extent from centre
    "outerRY": 52.4,   # Y half-extent from centre
    "topZ": 28.677,
    "baseZ": -4.180,
}

OVERLAYS = {
    "scn":  {"stem": "var_station_trade_hub_scn_overlay_v01",  "tag": "SCN",  "seed": 81011,
             "intendedFaction": "faction_scn"},
    "mts":  {"stem": "var_station_trade_hub_mts_overlay_v01",  "tag": "MTS",  "seed": 81022,
             "intendedFaction": "faction_mts"},
    "free": {"stem": "var_station_trade_hub_free_overlay_v01", "tag": "FREE", "seed": 81033,
             "intendedFaction": "faction_free"},
}

ATTACH_NOTES = {
    "scn":  "Armored cladding band seated on the roof-edge fascia; four corner bastions clamp the corners; frame-line masts stand on the roof grid; twin customs booms cantilever off the -X approach. Kit pass: plate perimeters, bastion armor seams, mast roots, boom truss gussets.",
    "mts":  "Two standoff commerce rings float outside the hull on roof struts; rounded clamshell fairing crowns bond over the roof corners and mid-edges; holo-ad billboards stand on the roof. Kit pass: ring node clamps, crown parting seams, billboard base flanges.",
    "free": "Scavenged habitat pods bolted at random over the roof and rim; junk truss splices bridge them; mismatched panel skirts hang off the -X and -Y edges. Kit pass: pod collars, truss gussets, skirt rivet rows.",
}


# ---------------------------------------------------------------------------
# Per-faction overlays — station-scale macro forms authored in the donor frame.
# Pure function of (faction, frame, seed). Returns VAR_ objects (origin identical).
# The station is a ~121x105 m slab whose TOP is a full-extent roof rectangle at
# z~=28.7; forms seat on the roof + roof-edge and are sized in tens of metres so the
# SILHOUETTE reads from the 60 deg top-down at station distance (zoom_out ~3.2 m/px:
# outward horizontal masses carry the read, not thin verticals). Identity is
# CONSTRUCTION, and each outline is categorically different from the others + the
# bare donor: SCN = enlarged crisp rectangle (corner bastions) + twin outward booms;
# MTS = rounded corner/edge crowns + standoff halo rings; Free = ragged asymmetric
# pods breaking the rim + hanging skirts.
# ---------------------------------------------------------------------------
def _ellipse(frame, ax_frac, angle_deg):
    cx, cy, _cz = frame["center"]
    return (cx + frame["outerRX"] * ax_frac * math.cos(math.radians(angle_deg)),
            cy + frame["outerRY"] * ax_frac * math.sin(math.radians(angle_deg)))


def _scn_hub(frame, r, kit):
    """Concord plated (station-scale): a fortified, strictly ORTHOGONAL armored rim.
    A full-perimeter cladding band segmented into plates, four heavy corner bastions
    that clamp and enlarge the rectangle, a disciplined grid of frame-line masts on
    the roof, and two SYMMETRIC customs gantry booms cantilevered out over the -X
    docking approach. Every form is axis-aligned (bible SCN: order is the identity).
    The zoom_out silhouette read is the enlarged crisp rectangle (bastions) + the
    twin outward booms; the masts and band splits are the closer game_cam reads."""
    tag = "SCN"
    paint = kit["KitMat_Paint"]
    emis = kit["KitMat_Emissive"]
    steel = kit["KitMat_Steel"]
    cx, cy = frame["center"][0], frame["center"][1]
    hx, hy = frame["outerRX"], frame["outerRY"]
    roof = frame["topZ"]
    added = []

    # --- Full-perimeter armored cladding band: plates straddling each roof edge,
    # 5 m proud, 12 m tall, segmented at ~17 m pitch (visible splits = SCN seams).
    band_z, band_h, proud, embed, pitch, gap = 25.0, 12.0, 5.0, 5.0, 17.0, 2.2
    band_sy = proud + embed
    corner_keep = 30.0  # leave the corners to the bastions
    plates = []
    for sign in (-1, 1):  # -Y and +Y edges: plates long in X
        ey = cy + sign * hy
        span = 2 * hx - corner_keep
        n = max(1, int(span / pitch))
        seg = span / n
        for i in range(n):
            px = cx - hx + corner_keep / 2 + seg * (i + 0.5)
            plates.append(hc.beveled_box(
                f"VAR_{tag}_bandX_{'p' if sign > 0 else 'n'}{i:02d}",
                (px, ey, band_z), (seg - gap, band_sy, band_h), paint, bevel=0.2))
    for sign in (-1, 1):  # -X and +X edges: plates long in Y
        ex = cx + sign * hx
        span = 2 * hy - corner_keep
        n = max(1, int(span / pitch))
        seg = span / n
        for i in range(n):
            py = cy - hy + corner_keep / 2 + seg * (i + 0.5)
            plates.append(hc.beveled_box(
                f"VAR_{tag}_bandY_{'p' if sign > 0 else 'n'}{i:02d}",
                (ex, py, band_z), (band_sy, seg - gap, band_h), paint, bevel=0.2))
    added.append(hc.join_objects(f"VAR_{tag}_cladding_band", plates))

    # --- Four heavy corner bastions: big orthogonal armor blocks clamping each
    # corner ~13 m proud in both axes — the crisp, enlarged-rectangle zoom_out read.
    for sx in (-1, 1):
        for sy in (-1, 1):
            added.append(hc.beveled_box(
                f"VAR_{tag}_bastion_{'p' if sx > 0 else 'n'}{'p' if sy > 0 else 'n'}",
                (cx + sx * hx, cy + sy * hy, 26.0), (26.0, 26.0, 16.0), paint, bevel=0.3))

    # --- Frame-line masts: 6 in two symmetric rows of 3, standing on the roof grid
    # (thick shaft + cross head + emissive tip). Ordered; a closer read than zoom_out.
    mast_h = 24.0
    for row, my in enumerate((-hy * 0.5, hy * 0.5)):
        for col, fx in enumerate((-0.5, 0.0, 0.5)):
            mx, myy = cx + fx * hx, cy + my
            shaft = hc.beveled_box(f"VAR_{tag}_mast{row}{col}_shaft",
                        (mx, myy, roof + mast_h / 2), (3.4, 3.4, mast_h), steel, bevel=0.15)
            head = hc.beveled_box(f"VAR_{tag}_mast{row}{col}_head",
                        (mx, myy, roof + mast_h), (9.0, 3.0, 2.4), steel, bevel=0.15)
            tip = hc.beveled_box(f"VAR_{tag}_mast{row}{col}_tip",
                        (mx, myy, roof + mast_h + 2.2), (1.0, 1.0, 2.6), emis, bevel=0.05)
            added.append(hc.join_objects(f"VAR_{tag}_mast{row}{col}", [shaft, head, tip]))

    # --- Two symmetric customs gantry booms cantilevered out over the -X approach
    # (~40 m reach past the wall). The strong outward zoom_out read; symmetric = order.
    boom_len, boom_z = 40.0, 24.0
    inner_x = (cx - hx) + 6.0            # overlap the -X wall
    outer_x = inner_x - boom_len
    boom_cx = (inner_x + outer_x) / 2
    for sy in (-1, 1):
        by = cy + sy * 24.0
        s = 'p' if sy > 0 else 'n'
        beam = hc.beveled_box(f"VAR_{tag}_boom_{s}_beam",
                    (boom_cx, by, boom_z), (boom_len, 8.0, 7.0), steel, bevel=0.2)
        head = hc.beveled_box(f"VAR_{tag}_boom_{s}_head",
                    (outer_x, by, boom_z), (6.0, 12.0, 10.0), steel, bevel=0.25)
        strut = hc.tube(f"VAR_{tag}_boom_{s}_strut",
                    (inner_x, by, boom_z - 3.5), (boom_cx + 6.0, by, boom_z - 12.0), 0.9, steel, segments=8)
        added.append(hc.join_objects(f"VAR_{tag}_boom_{s}", [beam, head, strut]))
    # Cross-tie between the booms at the outer end: the customs 'gate' bar.
    added.append(hc.beveled_box(f"VAR_{tag}_boom_gate",
                 (outer_x + 3.0, cy, boom_z + 6.0), (4.0, 48.0, 3.0), steel, bevel=0.2))
    return added


def _mts_hub(frame, r, kit):
    """Meridian gantry (station-scale): the soft, layered commerce identity. Two
    smooth concentric standoff gantry rings float OUTSIDE the hull with a visible
    gap (the MTS halo), tied down to the roof by struts; big rounded clamshell
    fairing crowns bulge past the roof corners and mid-edges — the dominant rounded
    zoom_out read; upright holo-ad billboard frames stand on the roof (closer read).
    Rounded, product-radius forms (bible MTS: soft product rounds)."""
    tag = "MTS"
    steel = kit["KitMat_Steel"]
    paint = kit["KitMat_Paint"]
    emis = kit["KitMat_Emissive"]
    cx, cy = frame["center"][0], frame["center"][1]
    hx, hy = frame["outerRX"], frame["outerRY"]
    roof = frame["topZ"]
    added = []

    # --- Two concentric standoff commerce rings: smooth ellipses OFFSET ~8-15 m out
    # from the hull edge (the MTS halo gap), STANDING on 12-15 m vertical legs so the
    # scaffold floats clear of the hull rather than hugging the roof. Thick members.
    # (offset per axis: inner ~8-10 m, outer ~13-15 m; verified vs 60.4/52.4 half-ext.)
    rings = [("inner", 1.16, roof + 11.5, 1.8), ("outer", 1.24, roof + 14.0, 1.6)]
    ring_pts = {}
    n = 30
    for nm, frac, z, rad in rings:
        pts = [(*_ellipse(frame, frac, 360.0 * i / n), z) for i in range(n)]
        ring_pts[nm] = pts
        segs = [hc.tube(f"VAR_{tag}_ring_{nm}{i:02d}", pts[i], pts[(i + 1) % n], rad, steel, segments=6)
                for i in range(n)]
        added.append(hc.join_objects(f"VAR_{tag}_ring_{nm}", segs))
    # Vertical standoff legs (inner ~12 m, outer ~14.5 m) from each ring straight down
    # to the roof, plus inner-to-outer horizontal ties (commerce scaffold).
    struts = []
    for i in range(0, n, 3):
        ix, iy, iz = ring_pts["inner"][i]
        ox, oy, oz = ring_pts["outer"][i]
        struts.append(hc.tube(f"VAR_{tag}_legI{i:02d}", (ix, iy, iz), (ix, iy, roof - 0.5), 1.0, steel, segments=6))
        struts.append(hc.tube(f"VAR_{tag}_legO{i:02d}", (ox, oy, oz), (ox, oy, roof - 0.5), 0.9, steel, segments=6))
        struts.append(hc.tube(f"VAR_{tag}_tie{i:02d}", (ix, iy, iz), (ox, oy, oz), 0.8, steel, segments=6))
    added.append(hc.join_objects(f"VAR_{tag}_struts", struts))

    # --- Rounded clamshell fairing crowns: bulge past the 4 roof corners + 2 mid
    # long-edges (soft product silhouette; the dominant MTS zoom_out read).
    crowns = []
    for sx in (-1, 1):
        for sy in (-1, 1):
            crowns.append((cx + sx * (hx - 6.0), cy + sy * (hy - 6.0), (34.0, 30.0, 15.0)))
    crowns.append((cx - hx + 4.0, cy, (16.0, 34.0, 13.0)))
    crowns.append((cx + hx - 4.0, cy, (16.0, 34.0, 13.0)))
    for idx, (pxc, pyc, sz) in enumerate(crowns):
        added.append(hc.rounded_shell(f"VAR_{tag}_crown{idx}",
                     (pxc, pyc, roof - 2.0 + sz[2] / 2), sz, paint, bevel=3.0, segments=4))

    # --- Upright holo-ad billboard frames standing on the roof (radial facing).
    for i in range(4):
        a = 90.0 * i + 45.0
        x, y = _ellipse(frame, 0.62, a)
        added.append(hc.billboard_frame(f"VAR_{tag}_adframe{i}", (x, y, roof + 10.0),
                     18.0, 20.0, 1.1, steel, angle_z=math.radians(a)))
        added.append(hc.beveled_box(f"VAR_{tag}_adpanel{i}", (x, y, roof + 10.0),
                     (0.4, 15.0, 16.0), emis, bevel=0.03, rot_z=math.radians(a)))
    return added


def _free_hub(frame, r, kit):
    """Free patchwork (station-scale): a scavenged, IRREGULAR, asymmetric accretion.
    Big habitat pods (capsule bodies + domed end caps) clustered at random over the
    roof and breaking the rim outline at unaligned points; junk truss splices bridge
    them; mismatched panel skirts hang off two edges (-X and -Y) only, at mixed sizes
    and cocked angles. Nothing is aligned (bible Free: history/junk is the identity).
    The zoom_out read is the ragged asymmetric outline — pods past the rim + skirts."""
    tag = "FREE"
    steel = kit["KitMat_Steel"]
    paint = kit["KitMat_Paint"]
    cx, cy = frame["center"][0], frame["center"][1]
    hx, hy = frame["outerRX"], frame["outerRY"]
    roof = frame["topZ"]
    added = []

    # --- 12 scavenged habitat pods: big capsules at random angle/radius/height.
    # The first two are OVERSIZED outriggers cantilevered radially far past the rim
    # (the asymmetric big-mass read); the rest cluster over the roof and break the
    # rim at unaligned points. Enough push past the edge to ragged the outline.
    anchors = []
    for i in range(12):
        outrigger = i < 2
        a = r.uniform(0, 360)
        frac = r.uniform(1.12, 1.28) if outrigger else r.uniform(0.60, 1.18)
        x, y = _ellipse(frame, frac, a)
        z = roof + r.uniform(-1.0, 7.0)
        length = r.uniform(18.0, 24.0) if outrigger else r.uniform(11.0, 19.0)
        rad = r.uniform(4.4, 6.0) if outrigger else r.uniform(3.2, 5.0)
        # outriggers point radially outward; junk pods sit at unaligned angles.
        ang = math.radians(a) if outrigger else math.radians(r.uniform(0, 360))
        dx, dy = math.cos(ang), math.sin(ang)
        p0 = (x - dx * length / 2, y - dy * length / 2, z)
        p1 = (x + dx * length / 2, y + dy * length / 2, z)
        body = hc.tube(f"VAR_{tag}_pod{i:02d}_body", p0, p1, rad, steel, segments=10)
        cap0 = hc.dome(f"VAR_{tag}_pod{i:02d}_c0", p0, rad, steel, height=rad * 0.8, subdiv=1)
        cap1 = hc.dome(f"VAR_{tag}_pod{i:02d}_c1", p1, rad, steel, height=rad * 0.8, subdiv=1)
        added.append(hc.join_objects(f"VAR_{tag}_pod{i:02d}", [body, cap0, cap1]))
        anchors.append((x, y, z))
    # --- Junk truss splices bridging consecutive pods (whatever held). 2-3 m members.
    for i in range(len(anchors) - 1):
        if r.random() < 0.72:
            added.append(hc.tube(f"VAR_{tag}_truss{i:02d}", anchors[i], anchors[i + 1],
                         r.uniform(1.0, 1.5), steel, segments=6))
    # --- Mismatched panel skirts hanging off the -X and -Y edges only (asymmetric),
    # drooping below the roof edge and sticking out at mixed sizes and cocked angles.
    for i in range(6):
        ex = cx - hx
        py = cy + r.uniform(-hy * 0.85, hy * 0.85)
        w, h = r.uniform(9.0, 18.0), r.uniform(8.0, 13.0)
        z = roof - r.uniform(2.0, 9.0)
        mat = paint if r.random() < 0.5 else steel
        added.append(hc.beveled_box(f"VAR_{tag}_skirtX{i}", (ex - 5.0, py, z),
                     (8.0, w, h), mat, bevel=0.1, rot_z=math.radians(r.uniform(-14, 14))))
    for i in range(5):
        ey = cy - hy
        px = cx + r.uniform(-hx * 0.85, hx * 0.85)
        w, h = r.uniform(9.0, 18.0), r.uniform(8.0, 13.0)
        z = roof - r.uniform(2.0, 9.0)
        mat = paint if r.random() < 0.5 else steel
        added.append(hc.beveled_box(f"VAR_{tag}_skirtY{i}", (px, ey - 5.0, z),
                     (w, 8.0, h), mat, bevel=0.1, rot_z=math.radians(r.uniform(-14, 14))))
    return added


_HUB_TREATMENTS = {"scn": _scn_hub, "mts": _mts_hub, "free": _free_hub}


def build_overlay(faction, frame, seed):
    kit = hc.ensure_all_kitmats()
    r = hc.rng(seed)
    return _HUB_TREATMENTS[faction](frame, r, kit)


def build_variant(faction, out_dir):
    hc.reset_scene()
    hc.ensure_all_kitmats()
    added = build_overlay(faction, HUB_FRAME, OVERLAYS[faction]["seed"])
    out = os.path.join(out_dir, OVERLAYS[faction]["stem"] + ".glb")
    hc.export_selection_glb(out, added)
    tris = sum(hc.object_tris(o) for o in added)
    print(f"HUB_OVERLAY {faction} -> {os.path.basename(out)} objs={len(added)} tris={tris}")
    return out, tris


def main():
    out_dir = OUT_DIR
    os.makedirs(out_dir, exist_ok=True)
    manifest = {"schema": "sf-foundry-tradehub-overlays/1", "donor": DONOR_REL,
                "hubFrameBlender": HUB_FRAME, "overlays": {}}
    for faction in OVERLAYS:
        _, tris = build_variant(faction, out_dir)
        manifest["overlays"][OVERLAYS[faction]["stem"]] = {
            "donor": DONOR_REL,
            "anchorFrame": "donor-origin",
            "intendedFaction": OVERLAYS[faction]["intendedFaction"],
            "tris": tris,
            "attachNotes": ATTACH_NOTES[faction],
        }
    with open(os.path.join(out_dir, "tradehub_overlays.json"), "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=2, sort_keys=True)
    print("BUILD_TRADEHUB_OVERLAYS_DONE")


if __name__ == "__main__":
    main()
