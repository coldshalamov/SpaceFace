"""Fleet Breadth Foundry — HERO Mission A: Patrol Wasp faction kit variants.

Builds 3 FULL variant GLBs from wasp_production_v1.glb — SCN patrol, MTS escort,
Free militia — by ADDING macro construction (plates, fairings, blisters, conduit,
emissive frame-lines) onto the donor dorsal per FACTION_SURFACE_LANGUAGE.md. The
donor's meshes, empties, materials and +X-forward pivot are preserved untouched;
faction identity is carried by construction + emissive PLACEMENT PATTERN, not paint
(KitMat_Paint is neutral — runtime tint multiplies it).

Headless:
  "C:\\Program Files\\Blender Foundation\\Blender 5.1\\blender.exe" -b \
     --factory-startup -P tools/foundry/hero/build_wasp_kits.py [-- --out <dir>]

Deterministic: geometry is a pure function of (faction, seed, donor hull bbox);
all jitter from random.Random(seed). check_hero.py re-invokes build_faction twice
and hashes the VAR_ vertices.
"""
from __future__ import annotations

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
DONOR = os.path.join(ROOT, "assets", "ships", "parts", "wholeships", "wasp_production_v1.glb")
OUT_DIR = os.path.join(ROOT, "assets", "ships", "foundry", "fleet_breadth_20260720", "variants")

# faction -> output stem, VAR treatment tag, deterministic seed
FACTIONS = {
    "scn":  {"stem": "var_wasp_scn_patrol_v01",  "tag": "SCN",  "seed": 71011},
    "mts":  {"stem": "var_wasp_mts_escort_v01",  "tag": "MTS",  "seed": 71022},
    "free": {"stem": "var_wasp_free_militia_v01", "tag": "FREE", "seed": 71033},
}

# Clean attachment zones the later kit-detail (rivet/fastener) pass should target,
# recorded per variant in hero_manifest.json.
WASP_ATTACH_NOTES = {
    "scn":  "Recessed torx rows (0.18 m) along every plate split-line and the two-tone band edge; weapon collars at SOCKET_Weapon_Front.",
    "mts":  "Hidden seal-heads only at clamshell parting lines; conformal sensor blister seams; NO exposed rivets (bible §MTS).",
    "free": "Hand rivets (0.15 m ±15%) around each bolt-on plate lip and the overplate patch; pipe-clamp saddles along the conduit run.",
}


def _argv_out():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    if "--out" in args:
        return args[args.index("--out") + 1]
    return OUT_DIR


def _raycast_surface(default_z):
    """Return f(x,y)->dorsal top Z by casting down onto whatever is in the scene
    (the donor hull). Falls back to default_z off-hull. Sample BEFORE adding parts."""
    def f(x, y):
        deps = bpy.context.evaluated_depsgraph_get()
        hit, loc, _n, _i, _o, _m = bpy.context.scene.ray_cast(deps, (x, y, 40.0), (0, 0, -1))
        return loc.z if hit else default_z
    return f


def _place_z(surf_z, half_h, embed=0.15):
    """Centre Z so the form embeds `embed` into the hull and sits proud above it."""
    return surf_z - embed + half_h


# ---------------------------------------------------------------------------
# Per-faction macro treatments — bible §SCN / §MTS / §Free. Each is a pure
# function of (hull bbox, seed, surface_fn); parameters are tweakable for repair
# rounds. Forms sized in bible metres; identity carried by construction language
# + emissive PLACEMENT PATTERN (KitMat_Emissive is neutral — colour is runtime).
# ---------------------------------------------------------------------------
def _scn(mn, mx, r, kit, surf):
    """Order/restraint: few large symmetric orthogonal plates on a strict grid,
    straight parallel emissive frame-lines, a masked two-tone band on a split line."""
    tag = "SCN"
    cx = (mn.x + mx.x) / 2
    added = []
    paint = kit["KitMat_Paint"]
    emis = kit["KitMat_Emissive"]

    # 3 spine plates (Y=0) + 1 symmetric flank pair — LOW count (restraint), uniform,
    # chamfered. SCN identity is order, not plate quantity; do not out-armor the donor.
    spine_x = [cx + 4.6, cx + 0.9, cx - 3.4]
    for i, x in enumerate(spine_x):
        sz = (2.3, 2.4, 0.5)
        z = _place_z(surf(x, 0.0), sz[2] / 2, embed=0.12)
        added.append(hc.beveled_box(f"VAR_{tag}_plate_spine{i}", (x, 0.0, z), sz, paint, bevel=0.02))
    for s, sign in enumerate((1, -1)):  # symmetric flank pair over the reactor bay
        x = cx + 0.4
        y = sign * 2.9
        sz = (1.9, 1.8, 0.42)
        z = _place_z(surf(x, y), sz[2] / 2, embed=0.12)
        added.append(hc.beveled_box(f"VAR_{tag}_plate_flank{s}", (x, y, z), sz, paint, bevel=0.02))

    # Masked two-tone band: one BOLD full-width band across the body on a split line —
    # the disciplined tonal read that survives distance (tint gives it hue at runtime).
    bx = cx - 1.4
    bz = _place_z(surf(bx, 0.0), 0.15, embed=0.06) + 0.28
    added.append(hc.beveled_box(f"VAR_{tag}_band", (bx, 0.0, bz), (1.5, 7.4, 0.30), paint, bevel=0.03))

    # Frame-line emissive: raised straight channels (read as relief even unlit) — two long
    # fore-aft rails + two athwart connectors. The disciplined grid IS the identity.
    railz = _place_z(surf(cx, 0.95), 0.09, embed=0.02) + 0.40
    for s, sign in enumerate((1, -1)):
        added.append(hc.beveled_box(f"VAR_{tag}_frameline_long{s}",
                     (cx + 0.3, sign * 1.0, railz), (10.8, 0.16, 0.14), emis, bevel=0.02))
    for i, x in enumerate((cx + 4.6, cx - 3.6)):
        added.append(hc.beveled_box(f"VAR_{tag}_frameline_cross{i}",
                     (x, 0.0, railz), (0.16, 2.2, 0.14), emis, bevel=0.02))
    return added


def _mts(mn, mx, r, kit, surf):
    """Product/smoothness: large smooth clamshell fairings that COVER the donor's
    angularity, conformal sensor blisters, one clean cabin strip. Biggest gestalt shift."""
    tag = "MTS"
    cx = (mn.x + mx.x) / 2
    added = []
    paint = kit["KitMat_Paint"]
    steel = kit["KitMat_Steel"]
    emis = kit["KitMat_Emissive"]

    # Continuous smooth dorsal spine cover — the biggest gestalt shift: TALL overlapping
    # clamshells wrap the fuselage into one rounded lump that changes the TOP PROFILE
    # (this is what survives at 150 px), covering the donor's angularity.
    shells = [
        ("mid", cx - 0.3, 0.0, (7.4, 4.0, 1.7), 0.55),
        ("fore", cx + 4.6, 0.0, (4.4, 3.0, 1.25), 0.45),
        ("aft", cx - 4.9, 0.0, (4.4, 3.3, 1.30), 0.45),
    ]
    for nm, x, y, sz, bev in shells:
        z = _place_z(surf(x, y), sz[2] / 2, embed=0.20)  # proud, tall, continuous
        added.append(hc.rounded_shell(f"VAR_{tag}_clamshell_{nm}", (x, y, z), sz, paint, bevel=bev, segments=4))

    # Gold-zone accent: a raised smooth panel on the central shell (tint -> gold).
    gx = cx - 0.3
    gz = _place_z(surf(gx, 0.0), 0.14, embed=0.0) + 0.95
    added.append(hc.rounded_shell(f"VAR_{tag}_goldzone", (gx, 0.0, gz), (2.8, 1.7, 0.3), paint, bevel=0.14, segments=3))

    # Conformal sensor blisters (smooth domes, never masts).
    blisters = [(cx + 1.9, 1.2, 0.58), (cx - 1.6, -1.4, 0.54), (cx + 3.4, -0.2, 0.48)]
    for i, (x, y, rad) in enumerate(blisters):
        z = _place_z(surf(x, y), 0.0, embed=0.0) + 0.85
        added.append(hc.dome(f"VAR_{tag}_blister{i}", (x, y, z), rad, steel, height=rad * 0.72, subdiv=2))

    # ONE clean cabin strip (raised relief) + a small logo backlight zone. No frame grid.
    cabz = _place_z(surf(cx + 3.0, 0.0), 0.07, embed=0.0) + 1.05
    added.append(hc.beveled_box(f"VAR_{tag}_cabinstrip", (cx + 3.2, 0.0, cabz), (5.4, 0.16, 0.12), emis, bevel=0.02))
    added.append(hc.beveled_box(f"VAR_{tag}_logo", (cx - 3.0, 0.0, cabz), (0.8, 0.8, 0.1), emis, bevel=0.02))
    return added


def _free(mn, mx, r, kit, surf):
    """History/clutter: mismatched bolt-on plates at varied heights with stepped
    lips, a fat hand-routed conduit snaking asymmetrically, one overplate patch,
    scattered mismatched emissive. ±15% jitter (organic faction)."""
    tag = "FREE"
    cx = (mn.x + mx.x) / 2
    added = []
    steel = kit["KitMat_Steel"]
    paint = kit["KitMat_Paint"]
    rubber = kit["KitMat_Rubber"]
    emis = kit["KitMat_Emissive"]

    def jit(v, frac=0.15):
        return v * (1.0 + r.uniform(-frac, frac))

    # 6 mismatched plates: different sizes, BIG height variance, small yaw, asymmetric,
    # stepped lip. The varied heights break the flat dorsal into a junk stack.
    slots = [(cx + 4.2, 1.4), (cx + 2.1, -1.8), (cx + 0.2, 1.1), (cx - 1.9, -0.6),
             (cx - 3.6, 1.7), (cx - 5.0, -1.2)]
    for i, (x0, y0) in enumerate(slots):
        x = x0 + r.uniform(-0.4, 0.4)
        y = y0 + r.uniform(-0.4, 0.4)
        w = jit(1.35)
        d = jit(1.2)
        h = r.uniform(0.3, 0.7)  # big height variance -> lumpy junk stack
        rot = math.radians(r.uniform(-14, 14))
        mat = paint if r.random() < 0.5 else steel
        surf_z = surf(x, y)
        z = _place_z(surf_z, h / 2, embed=r.uniform(0.08, 0.22))
        parts = []
        parts.append(hc.beveled_box(f"VAR_{tag}_plate{i}_main", (x, y, z), (w, d, h), mat, bevel=0.015, rot_z=rot))
        parts.append(hc.beveled_box(f"VAR_{tag}_plate{i}_lip", (x, y, z - h / 2 + 0.03),
                     (w + 0.26, d + 0.26, 0.09), steel, bevel=0.01, rot_z=rot))
        added.append(hc.join_objects(f"VAR_{tag}_plate{i}", parts))

    # Scavenged bolt-on POD that breaks the hull OUTLINE (survives at distance): a fat
    # capsule mounted proud off the port dorsal shoulder, past the fuselage edge.
    podx, pody = cx - 1.2, 3.4
    podz = surf(podx, pody) + 0.55
    pod = hc.tube(f"VAR_{tag}_pod_body", (podx - 1.6, pody, podz), (podx + 1.6, pody, podz), 0.55, steel, segments=12)
    podcap = hc.dome(f"VAR_{tag}_pod_cap", (podx + 1.6, pody, podz), 0.55, steel, height=0.4, subdiv=2)
    added.append(hc.join_objects(f"VAR_{tag}_pod", [pod, podcap]))

    # Fat hand-routed conduit snaking asymmetrically, one elbow riding OUT to the pod so
    # the run reads as a bold pipe, not a hairline.
    pts = [(cx - 5.4, 1.6), (cx - 2.8, 2.6), (cx - 1.2, 3.2), (cx + 1.2, 0.4), (cx + 4.6, -1.2)]
    prev = None
    conduit_parts = []
    for j, (x, y) in enumerate(pts):
        z = surf(x, y) + 0.22
        if prev is not None:
            conduit_parts.append(hc.tube(f"VAR_{tag}_conduit_seg{j}", (prev[0], prev[1], prev[2]),
                                  (x, y, z), 0.22, steel, segments=10))
        prev = (x, y, z)
    added.append(hc.join_objects(f"VAR_{tag}_conduit", conduit_parts))
    for k, (x, y) in enumerate(pts[1:4]):
        z = surf(x, y) + 0.14
        added.append(hc.beveled_box(f"VAR_{tag}_clamp{k}", (x, y, z), (0.3, 0.42, 0.26), rubber, bevel=0.02))

    # One visible overplate repair patch — odd-shaped, rotated, proud with a lip.
    px, py = cx + 1.2, 2.3
    pz = _place_z(surf(px, py), 0.19, embed=0.05)
    patch_main = hc.beveled_box(f"VAR_{tag}_patch_main", (px, py, pz), (1.5, 1.05, 0.38), steel, bevel=0.02, rot_z=math.radians(22))
    patch_lip = hc.beveled_box(f"VAR_{tag}_patch_lip", (px, py, pz - 0.17), (1.75, 1.3, 0.09), steel, bevel=0.01, rot_z=math.radians(22))
    added.append(hc.join_objects(f"VAR_{tag}_patch", [patch_main, patch_lip]))

    # Scattered mismatched emissive stubs (wrong-color spares) — different lengths, not
    # aligned; raised relief so the scattered PATTERN reads vs SCN's disciplined grid.
    stubs = [(cx + 3.4, 1.9, 0.8), (cx - 2.2, -2.4, 0.5), (cx - 4.6, 1.1, 0.6)]
    for i, (x, y, ln) in enumerate(stubs):
        z = surf(x, y) + 0.28
        added.append(hc.beveled_box(f"VAR_{tag}_light{i}", (x, y, z), (ln, 0.16, 0.12), emis,
                     bevel=0.02, rot_z=math.radians(r.uniform(-30, 30))))
    return added


_TREATMENTS = {"scn": _scn, "mts": _mts, "free": _free}


def build_faction(faction, hull_mn, hull_mx, seed, surface_fn=None):
    """Build one faction's macro additions. Pure in (faction, bbox, seed, surface_fn)."""
    kit = hc.ensure_all_kitmats()
    r = hc.rng(seed)
    surf = surface_fn if surface_fn is not None else (lambda x, y: hull_mx.z * 0.78)
    return _TREATMENTS[faction](hull_mn, hull_mx, r, kit, surf)


def build_variant(faction, out_dir):
    hc.reset_scene()
    hc.import_glb(DONOR)
    hull = list(hc.all_meshes())
    mn, mx, _, _ = hc.mesh_bbox(hull)
    donor_top = mx.z
    surf = _raycast_surface(donor_top * 0.78)
    added = build_faction(faction, mn, mx, FACTIONS[faction]["seed"], surface_fn=surf)
    out = os.path.join(out_dir, FACTIONS[faction]["stem"] + ".glb")
    hc.export_all_glb(out)
    tris = sum(hc.object_tris(o) for o in hc.all_meshes())
    add_tris = sum(hc.object_tris(o) for o in added)
    print(f"WASP_VARIANT {faction} -> {os.path.basename(out)} added_objs={len(added)} add_tris={add_tris} total_tris={tris}")
    return out


def main():
    out_dir = _argv_out()
    os.makedirs(out_dir, exist_ok=True)
    for faction in FACTIONS:
        build_variant(faction, out_dir)
    print("BUILD_WASP_KITS_DONE")


if __name__ == "__main__":
    main()
