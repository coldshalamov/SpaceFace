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
import bmesh  # noqa: E402
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


def _rot2(ang, lx, ly):
    """Rotate a local horizontal offset (lx along axis, ly across) into world XY."""
    c, s = math.cos(ang), math.sin(ang)
    return (lx * c - ly * s, lx * s + ly * c)


def _sheared_box(name, center, size, mat, rot_z=0.0, shear_a=0.0, shear_b=0.0, bevel=0.18):
    """A box-derived container mass (metres) with TWO faces sheared by shear_a/shear_b
    degrees so it reads as a racked salvage box, not an extruded capsule. Hard edges
    (small 1-segment chamfer). Optional yaw about Z, then seated at center. Local frame
    before yaw: +X = length, +Y = width, +Z = height. Deterministic (no RNG here)."""
    sx, sy, sz = size
    ka = math.tan(math.radians(shear_a))
    kb = math.tan(math.radians(shear_b))
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= sx
        v.co.y *= sy
        v.co.z *= sz
    # Shear two faces: the top leans along +X (shear_a), one end skews along +Y (shear_b).
    for v in bm.verts:
        v.co.x += ka * v.co.z
    for v in bm.verts:
        v.co.y += kb * v.co.x
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=bm.edges[:] + bm.verts[:], offset=bevel,
                        segments=1, affect="EDGES", clamp_overlap=True)
    if rot_z:
        c, s = math.cos(rot_z), math.sin(rot_z)
        for v in bm.verts:
            x, y = v.co.x, v.co.y
            v.co.x = x * c - y * s
            v.co.y = x * s + y * c
    for v in bm.verts:
        v.co += Vector(center)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    hc.assign_material(obj, mat)
    return obj


def _open_frame_pod(name, center, size, mat, ang, bar=0.5):
    """An open-frame salvage pod: 4 longerons + 3 rib hoops showing the interior ribs
    (a gutted container). Steel bars only, joined into one VAR_ object. Deterministic."""
    cx, cy, cz = center
    L, W, H = size
    parts = []
    # 4 longerons run the full length at the cross-section corners.
    for sy in (-1, 1):
        for sz in (-1, 1):
            ox, oy = _rot2(ang, 0.0, sy * (W / 2))
            parts.append(hc.beveled_box(
                f"{name}_lon{'p' if sy > 0 else 'n'}{'p' if sz > 0 else 'n'}",
                (cx + ox, cy + oy, cz + sz * (H / 2)), (L, bar, bar), mat, bevel=0.05, rot_z=ang))
    # 3 rib hoops (interior ribs) at stations along the length.
    for k, fx in enumerate((-0.34, 0.0, 0.34)):
        ox, oy = _rot2(ang, fx * L, 0.0)
        hcx, hcy = cx + ox, cy + oy
        for sz in (-1, 1):  # top + bottom bars span the width
            parts.append(hc.beveled_box(f"{name}_rib{k}{'t' if sz > 0 else 'b'}",
                         (hcx, hcy, cz + sz * (H / 2)), (bar, W, bar), mat, bevel=0.05, rot_z=ang))
        for sy in (-1, 1):  # left + right bars span the height
            lx, ly = _rot2(ang, fx * L, sy * (W / 2))
            parts.append(hc.beveled_box(f"{name}_rib{k}{'r' if sy > 0 else 'l'}",
                         (cx + lx, cy + ly, cz), (bar, bar, H), mat, bevel=0.05, rot_z=ang))
    return hc.join_objects(name, parts)


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
    Big habitat pods — box-derived container masses, sheared on two faces with steel
    splice collars (one an open rib frame) — clustered at random over the roof and
    breaking the rim outline at unaligned points; junk truss splices bridge them;
    mismatched panel skirts hang off two edges (-X and -Y) only, at mixed sizes and
    cocked angles. Nothing is aligned (bible Free: history/junk is the identity).
    The zoom_out read is the ragged asymmetric outline — pods past the rim + skirts."""
    tag = "FREE"
    steel = kit["KitMat_Steel"]
    paint = kit["KitMat_Paint"]
    cx, cy = frame["center"][0], frame["center"][1]
    hx, hy = frame["outerRX"], frame["outerRY"]
    roof = frame["topZ"]
    added = []

    # --- 12 scavenged habitat pods, each a BOX-DERIVED container mass (12-20 m) sheared
    # 3-8 deg on two faces (racked salvage, not extruded comfort), wrapped by a 0.6 m
    # steel splice collar where its truss lands. The first two are OVERSIZED outriggers
    # cantilevered radially past the rim; ONE pod (i=5) is an OPEN FRAME showing interior
    # ribs. Irregular cluster placement is preserved (bible Free: tape/filler/patch).
    open_i = 5
    anchors = []
    for i in range(12):
        outrigger = i < 2
        a = r.uniform(0, 360)
        frac = r.uniform(1.12, 1.28) if outrigger else r.uniform(0.60, 1.18)
        x, y = _ellipse(frame, frac, a)
        z = roof + r.uniform(-1.0, 7.0)
        length = r.uniform(18.0, 20.0) if outrigger else r.uniform(12.0, 18.0)
        rad = r.uniform(4.4, 6.0) if outrigger else r.uniform(3.2, 5.0)
        w_, h_ = 2.0 * rad, 1.7 * rad
        # outriggers point radially outward; junk pods sit at unaligned angles.
        ang = math.radians(a) if outrigger else math.radians(r.uniform(0, 360))
        # draw shear for every pod (keeps the RNG stream stable regardless of pod type)
        sha = r.uniform(3.0, 8.0) * r.choice((-1.0, 1.0))
        shb = r.uniform(3.0, 8.0) * r.choice((-1.0, 1.0))
        if i == open_i:
            added.append(_open_frame_pod(f"VAR_{tag}_pod{i:02d}", (x, y, z), (length, w_, h_), steel, ang))
        else:
            added.append(_sheared_box(f"VAR_{tag}_pod{i:02d}", (x, y, z), (length, w_, h_), steel,
                         rot_z=ang, shear_a=sha, shear_b=shb, bevel=0.18))
        # splice collar: a proud 0.6 m steel band wrapping the pod at the truss junction.
        added.append(hc.beveled_box(f"VAR_{tag}_pod{i:02d}_collar", (x, y, z),
                     (0.6, w_ + 0.7, h_ + 0.7), steel, bevel=0.05, rot_z=ang))
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
