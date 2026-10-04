"""Bastion — tier-3 player corvette. "Slab-sided warship with twin turrets."

Plan read at the chase camera: a long armoured arrowhead built from stacked chamfered slabs — a dark
lower hull, heavy side armour belts, a slate deck with a sloped glacis, a raised citadel — carrying
two twin-barrel turrets forward (the second superfiring), a stepped bridge tower amidships, a missile
hatch grid aft and a heavy three-nozzle drive block. Warning-red bands mark the bow chevron, belts
and turret cheeks. Three values: slate, dark gunmetal hull, near-black machinery; red identity.
"""
import math
import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402
import forge_export as E  # noqa: E402
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'animations'))
import ANI_38  # noqa: E402

SHIP_ID = 'bastion'
COLORS = {
    'paint': '#232b36',    # military slate (brief #39434f, authored darker: the key light lifts ~2.5x)
    'paint2': '#111418',   # dark hull slate
    'paint.upper': '#3a4552',  # lighter upper-works slate: turrets, citadel, bridge
    'stripe': '#7a241c',   # warning red (brief #8a2a22)
    'hazard': '#7a241c',
    'dark': '#16191d',
    'glow_cyan.warning': '#ff4838',  # warning red, lit: the deck-edge outline
}


def skin_z(x, y, parts, strict=True):
    """Top-down ray onto the named parts: the skin height under (x, y). A miss is a design error."""
    best = None
    for n in parts:
        o = bpy.data.objects.get(n)
        if o is None:
            continue
        hit, loc, _, _ = o.ray_cast(Vector((x, y, 60.0)), Vector((0.0, 0.0, -1.0)))
        if hit and (best is None or loc.z > best):
            best = loc.z
    if best is None and strict:
        raise ValueError(f'detail point ({x:.2f}, {y:.2f}) is off the skin of {parts}')
    return best


def skin_y(x, z, part, y0=4.0):
    """Side-on ray along -y at (x, z): the port-side wall of a part (windows, side hatches)."""
    o = bpy.data.objects[part]
    hit, loc, _, _ = o.ray_cast(Vector((x, y0, z)), Vector((0.0, -1.0, 0.0)))
    if not hit:
        raise ValueError(f'no wall of {part} at x={x:.2f} z={z:.2f}')
    return loc.y


def run(pts, parts, proud=0.025, h=0.06, tol=0.01, closed=False):
    """A plan-view polyline laid on the skin as beam segments. One beam per straight run: a leg is
    split only where the skin bends under it (a chamfer crease), so a flat hatch costs 4 beams."""
    pts = list(pts) + ([pts[0]] if closed else [])
    segs = []

    def z_at(x, y):
        return skin_z(x, y, parts) + proud - h / 2

    def leg(a, b, za, zb, depth):
        bent = False
        if depth < 4 and math.hypot(b[0] - a[0], b[1] - a[1]) > 0.2:
            for t in (0.25, 0.5, 0.75):
                zt = z_at(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)
                if abs(zt - (za + (zb - za) * t)) > tol:
                    bent = True
                    break
        if bent:
            m = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
            zm = z_at(m[0], m[1])
            leg(a, m, za, zm, depth + 1)
            leg(m, b, zm, zb, depth + 1)
        else:
            segs.append(((a[0], a[1], za), (b[0], b[1], zb)))
    for a, b in zip(pts, pts[1:]):
        leg(a, b, z_at(*a), z_at(*b), 0)
    return segs


def rect(cx, cy, sx, sy, ang=0.0):
    """Closed plan-view rectangle (corner list), yawed `ang` rad about its centre."""
    c, sn = math.cos(ang), math.sin(ang)
    return [(cx + c * dx - sn * dy, cy + sn * dx + c * dy)
            for dx, dy in ((-sx / 2, -sy / 2), (sx / 2, -sy / 2), (sx / 2, sy / 2), (-sx / 2, sy / 2))]


def frame(cx, cy, sx, sy, parts, w=0.07, proud=0.025, h=0.06):
    """A rectangular hatch frame: four beams, corners filled (each leg runs just under w/2 past its corner)."""
    segs = []
    c = rect(cx, cy, sx, sy)
    for i in range(4):
        p, q = c[i], c[(i + 1) % 4]
        L = math.hypot(q[0] - p[0], q[1] - p[1])
        ux, uy = (q[0] - p[0]) / L, (q[1] - p[1]) / L
        e = w / 2 - 0.012       # stop a hair short of the corner so two legs never share a vertex (it would
        #                         weld at finish and light a one-pixel glint at every corner)
        segs += run([(p[0] - ux * e, p[1] - uy * e), (q[0] + ux * e, q[1] + uy * e)], parts, proud=proud, h=h)
    return segs


def studs(pts, parts, size=0.06, proud=0.025, cover=()):
    """Fastener heads sitting on the skin: (centre, size) rows for F.boxes. A point whose skin is
    hidden under a taller part in `cover` is dropped."""
    out = []
    for x, y in pts:
        z = skin_z(x, y, parts, strict=False)
        if z is None:
            continue
        zc = skin_z(x, y, cover, strict=False) if cover else None
        if zc is not None and zc > z + 0.01:
            continue
        out.append(((x, y, z + proud - size / 2), (size, size, size)))
    return out


def along(p0, p1, pitch, t0=0.0, t1=1.0):
    """Evenly spaced plan points from p0 to p1 (fractions t0..t1 of the way), about `pitch` apart."""
    n = max(1, round(math.hypot(p1[0] - p0[0], p1[1] - p0[1]) * (t1 - t0) / pitch))
    return [(p0[0] + (p1[0] - p0[0]) * (t0 + (t1 - t0) * (i + 0.5) / n),
             p0[1] + (p1[1] - p0[1]) * (t0 + (t1 - t0) * (i + 0.5) / n)) for i in range(n)]


def mirror_full(half):
    """Port-half outline (bow to stern, CCW from above) -> full closed outline mirrored to starboard."""
    return half + [(x, -y) for (x, y) in reversed(half) if abs(y) > 1e-6]


def turret(s, name, x, z, r=0.95, barrel=2.3):
    """Local helper: low round base ring, angular armoured gun house, twin barrels with muzzle brakes."""
    F.cylinder(s, name + 'Ring', (x, 0.0, z - 0.05), (x, 0.0, z + 0.2), r, material='gunmetal', segments=40,
               cap_material='dark')
    F.cylinder(s, name + 'Race', (x, 0.0, z + 0.2), (x, 0.0, z + 0.26), r * 0.86, material='dark', segments=40)
    house = [(x + 1.05, 0.55), (x + 0.45, 0.8), (x - 0.95, 0.8), (x - 1.15, 0.5), (x - 1.15, -0.5),
             (x - 0.95, -0.8), (x + 0.45, -0.8), (x + 1.05, -0.55)]
    F.plate(s, name + 'House', house, z0=z + 0.24, thickness=0.62, material='paint.upper', chamfer=0.22,
            side_material='paint')
    F.band(s, name + 'House', (x - 0.3, 0.0, 0), (1, 0, 0), 0.22, 'stripe', inset=0.01, depth=0.015)
    F.box(s, name + 'Sight', (x - 0.45, 0.42, z + 0.95), (0.42, 0.24, 0.18), material='gunmetal', bevel=0.02)
    F.box(s, name + 'Mantlet', (x + 1.05, 0.0, z + 0.5), (0.3, 0.8, 0.4), material='gunmetal', bevel=0.03)
    for y in (0.22, -0.22):
        F.cylinder(s, f'{name}Barrel{y}', (x + 1.1, y, z + 0.52), (x + 1.1 + barrel, y, z + 0.52), 0.085,
                   material='gunmetal', segments=14)
        F.cylinder(s, f'{name}Sleeve{y}', (x + 1.1, y, z + 0.52), (x + 1.8, y, z + 0.52), 0.13, 0.11,
                   material='gunmetal', segments=14)
        F.cylinder(s, f'{name}Brake{y}', (x + 0.95 + barrel, y, z + 0.52), (x + 1.2 + barrel, y, z + 0.52), 0.12,
                   material='dark', segments=14)


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)

    # --- lower hull: dark slab with a sloped keel ------------------------------------------------
    lower = mirror_full([(10.2, 0.0), (6.0, 1.95), (-2.0, 3.0), (-8.8, 3.1), (-9.9, 2.5), (-9.9, 0.0)])
    F.plate(s, 'LowerHull', lower, z0=-1.1, thickness=1.15, material='paint2', chamfer=0.25, chamfer_bottom=0.55)
    # --- deck: slate armour with a sloped glacis, inset from the lower hull ----------------------
    deck = mirror_full([(9.6, 0.0), (5.6, 1.75), (-2.0, 2.7), (-8.0, 2.75), (-9.4, 1.9), (-9.4, 0.0)])
    F.plate(s, 'Deck', deck, z0=-0.05, thickness=0.85, material='paint', chamfer=0.45, side_material='paint')
    # bow chevron: two red bands meeting in a V on the glacis
    F.band(s, 'Deck', (7.4, 0.55, 0), (0.42, 0.91, 0), 0.34, 'stripe', facing=(0, 0, 1), min_facing=0.3)
    F.band(s, 'Deck', (7.4, -0.55, 0), (0.42, -0.91, 0), 0.34, 'stripe', facing=(0, 0, 1), min_facing=0.3)
    for y in (1.6, -1.6):
        F.panel(s, 'Deck', (-7.6, y), (1.6, 1.4), 'paint', inset=0.05, depth=0.05)
    F.band(s, 'Deck', (8.2, 0, 0), (1, 0, 0), 0.32, 'stripe', facing=(0, 0, 1), min_facing=0.3)
    # Identity trim, lit: a thin warning-red line just inside the deck's outer edge, bow to
    # stern on both sides, so the armoured arrowhead is outlined by its own light.
    for (ax, ay), (bx, by), lo, hi in (((9.6, 0.0), (5.6, 1.75), 5.55, 9.2), ((5.6, 1.75), (-2.0, 2.7), -2.0, 5.55),
                                        ((-2.0, 2.7), (-8.0, 2.75), -8.6, -2.0)):
        dx, dy = bx - ax, by - ay
        L = math.hypot(dx, dy)
        nx, ny = dy / L, -dx / L            # outboard normal of the port edge (bow-to-stern winding)
        mx, my = (ax + bx) / 2 - nx * 0.32, (ay + by) / 2 - ny * 0.32
        F.band(s, 'Deck', (mx, my, 0), (nx, ny, 0), 0.1, 'glow_cyan.warning', facing=(0, 0, 1), min_facing=0.3,
               inset=0.01, depth=-0.02, mirror=True, region=(('x', lo, hi),))
    F.panel(s, 'Deck', (3.2, 0.0), (0.9, 1.6), 'dark', inset=0.04, depth=-0.04)
    for y in (1.3, -1.3):
        F.panel(s, 'Deck', (6.3, y * 0.75), (0.8, 0.5), 'paint', inset=0.04, depth=0.05)

    # --- heavy armour belts along the flanks: three raised slabs per side, dark gaps -------------
    belts = []
    for i, (xa, xb) in enumerate(((1.4, -2.2), (-2.5, -5.6), (-5.9, -8.9))):
        belt = F.plate(s, f'Belt{i}', [(xa, 2.62), (xa - 0.3, 3.35), (xb + 0.2, 3.4), (xb, 2.62)], z0=-0.55,
                       thickness=0.95, material='paint', chamfer=0.22, chamfer_bottom=0.25, mirror=True)
        belts.append(belt)
        F.band(s, f'Belt{i}', ((xa + xb) / 2, 3.0, 0), (1, 0, 0), 0.28, 'stripe', inset=0.01, depth=0.015,
               mirror=True)
    s.hook_part('HOOK_ARMOR_PORT', belts[1])

    # --- citadel: raised armoured superstructure --------------------------------------------------
    cit = mirror_full([(2.6, 0.0), (1.6, 1.25), (-6.4, 1.55), (-7.4, 1.1), (-7.4, 0.0)])
    F.plate(s, 'Citadel', cit, z0=0.7, thickness=0.75, material='paint.upper', chamfer=0.3, side_material='paint2')
    # missile hatch grid aft of the bridge: 2 x 4 recessed dark cells
    for i in range(4):
        for y in (0.5, -0.5):
            F.panel(s, 'Citadel', (-5.0 - i * 0.55, y), (0.44, 0.7), 'dark', inset=0.03, depth=-0.05)

    # --- bridge tower: stepped block, lit window band facing forward ------------------------------
    F.plate(s, 'Bridge1', [(-1.2, 0.0), (-1.6, 1.0), (-4.2, 1.1), (-4.4, 0.0), (-4.2, -1.1), (-1.6, -1.0)],
            z0=1.4, thickness=0.8, material='paint.upper', chamfer=0.2, side_material='paint2')
    F.plate(s, 'Bridge2', [(-2.05, 0.7), (-3.8, 0.75), (-3.9, 0.0), (-3.8, -0.75), (-2.05, -0.7)],
            z0=2.15, thickness=0.6, material='paint.upper', chamfer=0.16, side_material='paint2')
    # lit bridge glazing wrapped round the forward faces of the upper block
    F.band(s, 'Bridge2', (-2.3, 0, 2.42), (0, 0, 1), 0.2, 'glow_warm', facing=(1, 0, 0), min_facing=0.7)
    F.windows(s, 'TowerWin', -3.9, -1.9, 1.03, 1.85, 4, size=(0.3, 0.14), finish='glow_warm', mirror=True)

    # sensor mast on the bridge roof (sensor damage part)
    mast = F.cylinder(s, 'Mast', (-3.2, 0.0, 2.7), (-3.2, 0.0, 3.9), 0.07, 0.04, material='gunmetal', segments=10)
    yard = F.box(s, 'MastYard', (-3.2, 0.0, 3.45), (0.12, 1.3, 0.08), material='gunmetal', bevel=0.0)
    radar = F.box(s, 'MastRadar', (-3.2, 0.0, 3.2), (0.18, 0.9, 0.34), material='dark', bevel=0.02)
    beacon = F.light(s, 'Beacon', (-3.2, 0.0, 3.93), 'glow_amber.beacon', size=0.14)
    s.hook_part('HOOK_SENSOR_MAST', mast, yard, radar, beacon)

    # --- turrets: A on the deck, B superfiring from the citadel ----------------------------------
    turret(s, 'TurretA', 5.0, 0.8, r=0.95, barrel=2.4)
    turret(s, 'TurretB', 1.4, 1.45, r=0.95, barrel=2.3)
    F.cylinder(s, 'TurretBBarbette', (1.4, 0.0, 0.7), (1.4, 0.0, 1.46), 1.0, material='paint2', segments=40)

    # --- broadside casemates: one gun each side ----------------------------------------------------
    casemate = F.box(s, 'Casemate', (-0.4, 3.35, 0.05), (1.3, 0.7, 0.7), material='paint2', bevel=0.05,
                     mirror=True, taper=0.85)
    casemate_gun = F.cylinder(s, 'CasemateGun', (-0.4, 3.6, 0.1), (-0.4, 4.3, 0.1), 0.1,
                              material='gunmetal', segments=12, mirror=True, cap_material='dark')
    s.hook_part('HOOK_SECONDARY_CASEMATE', casemate, casemate_gun)

    # --- drive block: three torch nozzles in an armoured frame -------------------------------------
    F.box(s, 'DriveBlock', (-9.6, 0.0, -0.1), (1.2, 4.2, 1.5), material='gunmetal', bevel=0.05)
    for y, r in ((1.35, 0.72), (-1.35, 0.72), (0.0, 0.55)):
        F.nozzle(s, f'Nozzle{y}', (-10.9, y, -0.1 if y else 0.25), r, 0.95, material='gunmetal')
    s.hook('HOOK_DRIVE_CORE', (-10.8, 0.0, -0.1))

    # --- detail --------------------------------------------------------------------------------------
    s.detail = 1
    F.vent(s, 'DeckVent', (-8.3, 0.0, 0.84), (0.9, 1.4, 0.1), slats=6, axis='y')
    for y in (1.9, -1.9):
        F.sensor_dome(s, f'PDDome{y}', (-4.6, y, 0.8), 0.3, lens='glow_red')
    F.rcs(s, 'RCSFwd', (5.2, 1.85, 0.0), size=0.34, mirror=True)
    F.rcs(s, 'RCSAft', (-8.8, 3.1, 0.55), size=0.34, mirror=True)
    F.antenna(s, 'Whip', (-6.8, 0.8, 1.45), 1.0, tip='glow_red')
    F.box(s, 'BowSensor', (9.2, 0.0, 0.25), (0.8, 0.5, 0.2), material='dark', bevel=0.02)
    s.detail = 0

    # --- close-zoom detail layer (LOD0 only, existing finishes, every part seated on the real skin) ---
    bpy.context.view_layer.update()
    s.detail = 2
    # Fine detail is dielectric paint, never metal: a sub-pixel gunmetal bead glints white at the chase camera.
    LINE, LIGHT = 'paint2', 'paint.upper'

    # Lines are at least 10 cm wide and 1-2 cm proud: anything thinner is under one pixel at the chase camera,
    # where it breaks into dots instead of reading as a line. Nothing here is a stud row for the same reason.
    # Missile hatch grid: a coaming a hand's width outside the 2 x 4 cells.
    gx0, gx1, gy = -4.62, -7.03, 1.0
    F.beams(s, 'GridCoaming', frame((gx0 + gx1) / 2, 0.0, abs(gx1 - gx0), 2 * gy, ['Citadel'], w=0.11, proud=0.015,
                                    h=0.05), 0.11, LINE, h=0.05)

    # Deck: hatch frames (kept well inboard of the lit edge line).
    deck = frame(3.2, 0.0, 1.06, 1.74, ['Deck'], w=0.11, proud=0.015, h=0.05)
    for y in (1.55, -1.55):
        deck += frame(-7.6, y, 1.2, 0.8, ['Deck'], w=0.1, proud=0.015, h=0.05)
    deck += frame(6.5, 0.0, 0.6, 0.8, ['Deck'], w=0.1, proud=0.015, h=0.05)     # bow hatch behind the chevron apex
    F.beams(s, 'DeckHatches', deck, 0.1, LINE, h=0.05)

    # Citadel: a hatch seam between the bridge and the superfiring turret.
    F.beams(s, 'CitadelSeam', frame(-0.375, 0.0, 1.15, 1.6, ['Citadel'], w=0.1, proud=0.015, h=0.05), 0.1, LINE,
            h=0.05)

    # Bridge: a dark bezel round every tower window (lintel, sill, two jambs), each piece laid 2 cm proud of
    # the sloped wall under it, and a seam round the mast foot.
    bez = []
    for wx in (-3.65, -3.15, -2.65, -2.15):
        for dz in (0.1, -0.1):
            yo = skin_y(wx, 1.85 + dz, 'Bridge1') + 0.02
            bez.append(((wx, yo - 0.05, 1.85 + dz), (0.38, 0.1, 0.045)))
        for dx in (0.17, -0.17):
            yo = skin_y(wx + dx, 1.85, 'Bridge1') + 0.02
            bez.append(((wx + dx, yo - 0.05, 1.85), (0.045, 0.1, 0.2)))
    F.boxes(s, 'TowerBezels', bez, material=LINE, mirror=True)
    F.beams(s, 'MastFoot', frame(-3.2, 0.0, 0.9, 0.7, ['Bridge2'], w=0.1, proud=0.015, h=0.05), 0.1, LINE, h=0.05)

    # Turrets: a hatch and a rear seam on each house top and dark clamp rings on the sleeves and barrels.
    for name, tx, tz, barrel in (('TurretA', 5.0, 0.8, 2.4), ('TurretB', 1.4, 1.45, 2.3)):
        house = [name + 'House']
        segs = frame(tx - 0.2, -0.22, 0.7, 0.5, house, w=0.1, proud=0.015, h=0.05)
        segs += run([(tx - 0.8, -0.5), (tx - 0.8, 0.5)], house, proud=0.015, h=0.05)
        F.beams(s, name + 'Seams', segs, 0.1, LINE, h=0.05)
        for y in (0.22, -0.22):
            for rx, rr in ((1.45, 0.135), (2.25, 0.098), (2.8, 0.098)):
                F.cylinder(s, f'{name}Clamp{y}_{rx}', (tx + rx, y, tz + 0.52), (tx + rx + 0.07, y, tz + 0.52), rr,
                           material='dark', segments=14, cap=False, bevel=0.0)

    # Flank deck strips: one conduit along the citadel foot (broken for the point-defence dome).
    pipes = []
    for xa, xb in ((1.0, -4.1), (-5.05, -6.6)):
        pipes += run([(xa, 1.7), (xb, 1.7)], ['Deck'], proud=0.05, h=0.1)
    F.beams(s, 'Conduits', pipes, 0.14, LINE, h=0.1, mirror=True)

    # Belt roots: feed lines running into each casemate.
    feeds = []
    for xa, xb in ((1.15, 0.27), (-1.07, -1.95)):
        feeds += run([(xa, 2.98), (xb, 2.98)], ['Belt0'], proud=0.03, h=0.08)
    F.beams(s, 'CasemateFeeds', feeds, 0.12, LINE, h=0.08, mirror=True)

    # Casemates (shed with the gun): clamp collars on the barrel. The port set carries the secondary-casemate
    # hook; the starboard set is the plain mirror.
    collar = F.cylinder(s, 'CasemateCollar', (-0.4, 3.78, 0.1), (-0.4, 3.88, 0.1), 0.135, material='dark',
                        segments=14, cap=False, bevel=0.0, mirror=True)
    clamp = F.cylinder(s, 'CasemateClamp', (-0.4, 4.02, 0.1), (-0.4, 4.1, 0.1), 0.12, material='dark', segments=14,
                       cap=False, bevel=0.0, mirror=True)
    s.hook_part('HOOK_SECONDARY_CASEMATE', collar, clamp)

    s.detail = 0

    # --- lights --------------------------------------------------------------------------------------
    F.light(s, 'NavPort', (-8.4, 3.42, 0.3), 'glow_red', size=0.18)
    F.light(s, 'NavStarboard', (-8.4, -3.42, 0.3), 'glow_green', size=0.18)
    F.light(s, 'BowLight', (9.75, 0.0, 0.6), 'glow_amber', size=0.12)
    s.ani38_bank = ANI_38.build(s, list(s.objects), source_asset_id=E.fleet_spec(SHIP_ID)['asset_id'])
    return s


if __name__ == '__main__':
    ship = build().finish()
    live = '--live' in sys.argv
    written = E.export_ship(ship, E.fleet_spec(SHIP_ID), preview=not live)
    if live:
        ANI_38.bake_ship_banks(ship, written, bank_key=E.fleet_spec(SHIP_ID)['file'].replace('_', '-'))
