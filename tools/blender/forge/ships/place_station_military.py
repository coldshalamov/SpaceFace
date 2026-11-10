"""Coalition Bastion — armoured military station. Forge rebuild. "Stepped armoured keep, gun batteries."

The station stands astride the flight plane (glTF y = 0, Blender z = 0): ships dock at mid-height and
the top-down camera looks at the upper half. Plan read from above: four concentric armoured tiers
stepping up to a citadel bridge crowned with radar masts, like a star-fort seen from the sky. Every
terrace ring carries a gun battery (round barbette + faceted house + barrels); the bow terraces
carry superfiring heavy turrets over a gatehouse whose dark hangar mouth opens on the +X face at the
flight plane, fed by a lit landing apron. The lower half mirrors the keep in lighter detail and ends
in a sensor keel. Three values: slate armour, dark armour, dark machinery; warning red bands.
Sockets (SOCKET_Dock_Approach at the hangar mouth, SOCKET_Emissive, SOCKET_Structure_Core) are copied
from the live file on export.
"""
import math
import os
import sys

import bmesh
from mathutils import Matrix

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'animations'))
import forge as F  # noqa: E402
import ANI_41  # noqa: E402

SHIP_ID = 'place_station_military'
COLORS = {
    'paint': '#243142',       # Coalition blue-slate (brief #39434f, deepened: the key light lifts ~2.5x)
    'paint2': '#10141a',      # dark armour: battle-deck, glacis, keel
    'stripe': '#6e1812',      # warning red
    'hazard': '#6e5214',
    'dark': '#121518',
    'paint.pale': '#394350',  # pale armour facings (citadel crown, landing apron, bastion caps)
    'glow_cyan.warning': '#ff4838',  # warning red, lit: the belt and keep deck-edge outlines
}

# Tiers: (name, x0, x1, half-width, corner cut, z0, thickness, chamfer). Upper keep and lower keel.
UPPER = [
    ('T1', -33.0, 17.0, 11.5, 3.5, 7.0, 10.0, 1.2),
    ('T2', -27.0, 9.0, 7.6, 2.8, 17.0, 8.0, 1.0),
    ('T3', -21.0, 1.0, 4.6, 2.0, 25.0, 6.0, 0.8),
]
LOWER = [
    ('B1', -33.0, 17.0, 11.5, 3.5, -17.0, 10.0, 1.2),
    ('B2', -27.0, 9.0, 7.6, 2.8, -25.0, 8.0, 1.0),
    ('B3', -21.0, 1.0, 4.6, 2.0, -31.0, 6.0, 0.8),
]
T0 = dict(x0=-38.0, x1=16.0, hw=14.5, c=4.0)
# Star-fort bastions round the belt: (cx, cy) diamond centres, port side (mirrored).
BASTIONS = [(-10.0, 14.0), (-33.0, 13.5)]


def octo(x0, x1, hw, c):
    """CCW plan outline of a rectangle with cut corners."""
    return [(x1, hw - c), (x1 - c, hw), (x0 + c, hw), (x0, hw - c), (x0, -hw + c), (x0 + c, -hw), (x1 - c, -hw),
            (x1, -hw + c)]


def boxes(s, name, items, material, bevel=0.0):
    """Local helper: many boxes in one part (window rows, lamp strings). items: (center, size[, rot_z])."""
    bm = bmesh.new()
    for it in items:
        c, sz = it[0], it[1]
        rz = it[2] if len(it) > 2 else 0.0
        m = Matrix.Translation(c) @ Matrix.Rotation(rz, 4, 'Z') @ Matrix.Diagonal((sz[0], sz[1], sz[2], 1.0))
        bmesh.ops.create_cube(bm, size=1.0, matrix=m)
    return s.add(F._new_object(name, bm, s.slots([material]), bevel=bevel, smooth_angle=30.0))


def wall_windows(x0, x1, y, z, n, size=(0.9, 0.4), mirror=True, skip=None):
    """Window boxes along a side wall (normal +-y)."""
    out = []
    for i in range(n):
        x = x0 + (x1 - x0) * (i + 0.5) / n
        if skip and any(abs(x - k) < 1.6 for k in skip):
            continue
        out.append(((x, y - 0.06, z), (size[0], 0.3, size[1])))
        if mirror:
            out.append(((x, -y + 0.06, z), (size[0], 0.3, size[1])))
    return out


def wall_y(hw, z0, th, z, cht=0.0, chb=0.0):
    """Half-width of a chamfered plate() wall at height z (the kit pulls the top ring down 0.55 th and
    raises the bottom ring 0.35 th), so windows sit on the sloped armour instead of floating."""
    top = z0 + th
    zt = top - 0.55 * th if cht else top
    zb = z0 + 0.35 * th if chb else z0
    if z > zt:
        return hw - cht * (z - zt) / (top - zt)
    if z < zb:
        return hw - chb * (zb - z) / (zb - z0)
    return hw


def end_windows(x, y0, y1, z, n, size=(0.9, 0.4)):
    return [((x - 0.06, y0 + (y1 - y0) * (i + 0.5) / n, z), (0.3, size[0], size[1])) for i in range(n)]


def turret(s, name, x, y, z, sc=1.0, barrels=3, yaw=0.0, housing='paint', sight=True):
    """Gun turret: barbette + red ring, faceted armoured house, mantlet, barrels with muzzle brakes."""
    c, sn = math.cos(yaw), math.sin(yaw)

    def P(dx, dy, dz=0.0):
        return (x + (dx * c - dy * sn) * sc, y + (dx * sn + dy * c) * sc, z + dz * sc)

    F.cylinder(s, name + '_Barbette', (x, y, z - 0.4 * sc), (x, y, z + 0.3 * sc), 1.25 * sc, material='gunmetal',
               segments=24, cap_material='dark', bevel=0.0)
    F.cylinder(s, name + '_Ring', (x, y, z + 0.08 * sc), (x, y, z + 0.24 * sc), 1.33 * sc, material='stripe',
               segments=24, bevel=0.0)
    house = [(1.35, 0.55), (0.8, 1.15), (-1.2, 1.15), (-1.55, 0.8), (-1.55, -0.8), (-1.2, -1.15), (0.8, -1.15),
             (1.35, -0.55)]
    F.plate(s, name + '_House', [P(dx, dy)[:2] for dx, dy in house], z0=z + 0.2 * sc, thickness=0.95 * sc,
            material=housing, chamfer=0.26 * sc, bevel=0.03)
    zb = 0.62
    F.box(s, name + '_Mantlet', P(1.35, 0, zb), (0.45 * sc, (0.42 * barrels + 0.35) * sc, 0.55 * sc),
          material='gunmetal', rot_z=yaw, bevel=0.0)
    L = 4.2
    for i in range(barrels):
        dy = (i - (barrels - 1) / 2) * 0.42
        F.cylinder(s, f'{name}_Sleeve{i}', P(1.5, dy, zb), P(2.4, dy, zb), 0.17 * sc, 0.14 * sc,
                   material='gunmetal', segments=10, bevel=0.0)
        F.cylinder(s, f'{name}_Barrel{i}', P(2.3, dy, zb), P(1.5 + L, dy, zb), 0.1 * sc, 0.085 * sc,
                   material='gunmetal', segments=8, bevel=0.0)
        F.cylinder(s, f'{name}_Muzzle{i}', P(1.3 + L, dy, zb), P(1.62 + L, dy, zb), 0.13 * sc, material='dark',
                   segments=8, bevel=0.0)
    if sight:
        F.box(s, name + '_Sight', P(-0.75, 0, 1.22), (0.3 * sc, 2.7 * sc, 0.26 * sc), material='gunmetal',
              rot_z=yaw, bevel=0.0)
        for e in (-1, 1):
            F.box(s, f'{name}_Lens{e}', P(-0.75, e * 1.37, 1.22), (0.22 * sc, 0.06 * sc, 0.16 * sc),
                  material='glow_cyan', rot_z=yaw, bevel=0.0)


def pd_mount(s, name, x, y, z, yaw=0.0):
    """Point-defence drum with twin guns pointed outboard."""
    F.cylinder(s, name + '_Drum', (x, y, z - 0.2), (x, y, z + 0.5), 0.55, 0.45, material='paint2', segments=14,
               bevel=0.0, cap_material='dark')
    c, sn = math.cos(yaw), math.sin(yaw)
    for dy in (-0.15, 0.15):
        F.cylinder(s, f'{name}_Gun{dy}', (x + 0.3 * c - dy * sn, y + 0.3 * sn + dy * c, z + 0.3),
                   (x + 1.5 * c - dy * sn, y + 1.5 * sn + dy * c, z + 0.3), 0.07, material='gunmetal', segments=8,
                   bevel=0.0)


def parked_fighter(s, name, x, y, z, yaw=0.0, sc=0.75):
    """A small parked interceptor sitting on a pad: scale reference from the chase camera."""
    c, sn = math.cos(yaw), math.sin(yaw)

    def P(dx, dy):
        return (x + (dx * c - dy * sn) * sc, y + (dx * sn + dy * c) * sc)
    F.plate(s, name + '_Wing', [P(1.6, 0.3), P(-1.2, 1.9), P(-1.6, 1.9), P(-1.4, 0.0), P(-1.6, -1.9), P(-1.2, -1.9),
                                P(1.6, -0.3)], z0=z + 0.12 * sc, thickness=0.18 * sc, material='paint.pale',
            chamfer=0.05, bevel=0.01)
    F.box(s, name + '_Body', (*P(0.0, 0.0), z + 0.28 * sc), (3.6 * sc, 0.7 * sc, 0.5 * sc), material='paint2',
          rot_z=yaw, bevel=0.05, taper=0.8)
    F.box(s, name + '_Canopy', (*P(0.9, 0.0), z + 0.56 * sc), (0.9 * sc, 0.4 * sc, 0.14 * sc), material='glass',
          rot_z=yaw, bevel=0.02)


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)

    # --- T0: the battle belt at the flight plane, split round the hangar gatehouse ---------------
    t0 = octo(T0['x0'], T0['x1'], T0['hw'], T0['c'])
    F.plate(s, 'T0', t0, z0=-7.0, thickness=14.0, material='paint', chamfer=0.8, chamfer_bottom=0.8,
            side_material='paint2', top_material='paint2')
    # gatehouse towers flank the hangar mouth: the two bow bastions of the star fort
    gate = [(29.5, 6.8), (29.5, 11.0), (23.0, 18.0), (16.0, 15.0), (16.0, 6.8)]
    # side and stern bastions: arrowhead towers that give the plan its star-fort outline
    for i, (cx, cy) in enumerate(BASTIONS):
        F.plate(s, f'Bastion{i}', [(cx + 5.5, cy - 1.0), (cx + 1.0, cy + 4.8), (cx - 1.0, cy + 4.8),
                                   (cx - 5.5, cy - 1.0), (cx - 5.5, cy - 4.0), (cx + 5.5, cy - 4.0)],
                z0=-9.0, thickness=18.0, material='paint', chamfer=0.9, chamfer_bottom=0.9, side_material='paint',
                top_material='paint.pale', mirror=True)
        F.band(s, f'Bastion{i}', (cx, cy + 2.6, 0), (0, 1, 0), 0.5, 'stripe', facing=(0, 0, 1), mirror=True)
    F.plate(s, 'Gate', gate, z0=-8.0, thickness=16.0, material='paint', chamfer=0.9, chamfer_bottom=0.9,
            side_material='paint', top_material='paint.pale', mirror=True)
    F.plate(s, 'HangarRoof', [(27.0, 6.9), (16.0, 6.9), (16.0, -6.9), (27.0, -6.9)], z0=3.6, thickness=3.6,
            material='paint', chamfer=0.6, side_material='paint2')
    F.box(s, 'HangarBack', (16.3, 0.0, 0.0), (0.6, 13.6, 7.4), material='dark', bevel=0.0)
    F.box(s, 'HangarLinerP', (22.0, 6.75, 0.0), (12.0, 0.3, 7.4), material='dark', bevel=0.0)
    F.box(s, 'HangarLinerS', (22.0, -6.75, 0.0), (12.0, 0.3, 7.4), material='dark', bevel=0.0)
    F.box(s, 'HangarCeil', (22.0, 0.0, 3.5), (12.0, 13.4, 0.3), material='dark', bevel=0.0)
    # landing deck: runs out of the hangar and past the gatehouse as a lit apron
    F.plate(s, 'Apron', [(36.0, 5.2), (34.0, 6.6), (16.0, 6.6), (16.0, -6.6), (34.0, -6.6), (36.0, -5.2)],
            z0=-7.2, thickness=3.6, material='paint.pale', chamfer=0.5, side_material='paint2')
    F.band(s, 'Apron', (35.0, 0, 0), (1, 0, 0), 0.9, 'hazard', facing=(0, 0, 1))
    F.band(s, 'Apron', (0, 5.9, 0), (0, 1, 0), 0.35, 'stripe', facing=(0, 0, 1))
    F.band(s, 'Apron', (0, -5.9, 0), (0, 1, 0), 0.35, 'stripe', facing=(0, 0, 1))
    F.box(s, 'ApronStrut', (31.5, 0.0, -9.5), (2.0, 8.0, 3.6), material='gunmetal', bevel=0.05, taper=0.8)
    # T0 roof livery: red bands on the crown edges, rank bars across the bow terrace
    F.band(s, 'Gate', (26.3, 0, 0), (1, 0, 0), 0.6, 'stripe', facing=(0, 0, 1), mirror=True)
    # Identity trim, lit: one thin warning-red line just inside each long edge of the battle belt's
    # dark deck, so the star fort is outlined by its own light at the chase tilt (LOOK.md: lamps
    # are light). The corner cut is 4 m, so the line stops short of the octagon's diagonals.
    for sy in (1, -1):
        F.band(s, 'T0', (0, sy * (T0['hw'] - 1.3), 0), (0, 1, 0), 0.3, 'glow_cyan.warning', facing=(0, 0, 1),
               min_facing=0.6, inset=0.01, depth=-0.03, region=(('x', T0['x0'] + 5.2, T0['x1'] - 5.2),))
    # ...and the hangar threshold: a lit bar across the apron at the mouth, the Leviathan's flight
    # deck vocabulary, so the dock reads before the ship is over it.
    F.box(s, 'Threshold', (35.1, 0.0, -3.5), (0.35, 10.8, 0.1), material='glow_warm', bevel=0.0)

    # --- upper keep: stepped tiers, each a chamfered armour slab -------------------------------
    for name, x0, x1, hw, c, z0, th, ch in UPPER:
        F.plate(s, name, octo(x0, x1, hw, c), z0=z0, thickness=th, material='paint', chamfer=ch,
                side_material='paint', top_material={'T1': 'paint', 'T2': 'paint2', 'T3': 'paint.pale'}[name])
    for name, x0, x1, hw, c, z0, th, ch in LOWER:
        F.plate(s, name, octo(x0, x1, hw, c), z0=z0, thickness=th, material='paint2', chamfer_bottom=ch,
                side_material='paint')
    # red crown stripe round each upper tier's front
    F.band(s, 'T1', (14.2, 0, 0), (1, 0, 0), 0.7, 'stripe', facing=(0, 0, 1))
    F.band(s, 'T2', (6.4, 0, 0), (1, 0, 0), 0.6, 'stripe', facing=(0, 0, 1))
    # raised armour plates on the terraces (dark), recessed service bays
    F.panel(s, 'T1', (-8.0, 0.0), (14.0, 17.0), 'paint2', inset=0.25, depth=0.12)
    F.panel(s, 'T0', (-35.5, 0.0), (3.4, 24.0), 'paint2', inset=0.2, depth=0.1)
    F.panel(s, 'T2', (-24.3, 0.0), (3.0, 11.0), 'paint2', inset=0.2, depth=-0.1)

    # --- angled armour skirts on the battle belt between the bastions: sloped glacis plates ------
    for i, (x, w) in enumerate(((-21.5, 11.0), (0.6, 9.4), (10.6, 9.4))):
        F.box(s, f'Glacis{i}', (x, 15.0, -0.6), (w, 0.9, 8.6), material='paint2', rot=(0.3, 0.0, 0.0),
              mirror=True, mirror_flip=True, bevel=0.12)
        F.box(s, f'GlacisL{i}', (x, 14.9, -5.6), (w, 0.8, 2.6), material='paint', rot=(-0.45, 0.0, 0.0),
              mirror=True, mirror_flip=True, bevel=0.08)
    # stern armour: buttress blocks with radiator combs between them
    for y in (-10.5, 0.0, 10.5):
        F.box(s, f'Buttress{y}', (-38.6, y, 0.0), (2.4, 3.2, 12.0), material='paint2', bevel=0.12, taper=0.9)
    for sy in (1, -1):
        for k in range(8):
            yy = sy * (2.2 + k * 0.95)
            F.box(s, f'RadFin{sy}{k}', (-39.2, yy, 0.0), (1.8, 0.16, 9.0), material='gunmetal', bevel=0.0)

    # --- main battery: heavy turrets on the bow terraces, superfiring --------------------------
    turret(s, 'Main1', 21.6, 0.0, 7.2, 1.95)          # on the hangar roof
    turret(s, 'Main2', 13.2, 0.0, 17.1, 1.8)         # T1 bow terrace, fires over Main1
    F.cylinder(s, 'Main3Barbette', (5.2, 0, 25.0), (5.2, 0, 25.6), 2.4, material='paint2', segments=28, bevel=0.0)
    turret(s, 'Main3', 5.2, 0.0, 25.7, 1.6)           # T2 bow terrace, raised
    turret(s, 'Gate1', 22.5, 11.5, 8.1, 1.0, barrels=2, yaw=0.35, housing='paint2', sight=False)
    turret(s, 'Gate1S', 22.5, -11.5, 8.1, 1.0, barrels=2, yaw=-0.35, housing='paint2', sight=False)
    # broadside batteries on the bastions, facing outboard; point defence on the belt terrace
    for i, (cx, cy) in enumerate(BASTIONS):
        for sy in (1, -1):
            turret(s, f'Bastion{i}T{sy}', cx, sy * (cy + 0.6), 9.05, 1.15, barrels=2, yaw=sy * math.pi / 2,
                   housing='paint2', sight=False)
    for i, x in enumerate((6.0, -21.0)):
        for sy in (1, -1):
            pd_mount(s, f'BeltPD{i}{sy}', x, sy * 12.9, 7.0, yaw=sy * math.pi / 2)
    # T1 terrace: twin mounts, angled forward-outboard
    for i, x in enumerate((1.5, -14.0)):
        for sy in (1, -1):
            turret(s, f'Upper{i}{sy}', x, sy * 9.6, 17.05, 0.7, barrels=2, yaw=sy * 1.2, housing='paint2',
                   sight=False)
    # stern battery facing aft on T1
    turret(s, 'Aft', -29.8, 0.0, 17.05, 1.1, yaw=math.pi)

    # --- citadel: bridge, radar masts, dishes --------------------------------------------------
    F.plate(s, 'Bridge', octo(-13.0, 0.5, 3.4, 1.4), z0=31.0, thickness=2.6, material='paint2', chamfer=0.5)
    F.band(s, 'Bridge', (-1.0, 0, 0), (1, 0, 0), 1.4, 'glass', facing=(1, 0, 0.3), min_facing=0.2)
    F.box(s, 'BridgeGlaze', (0.2, 0.0, 32.3), (0.25, 4.2, 0.9), material='glow_warm', bevel=0.0)
    for sy in (1, -1):
        F.box(s, f'BridgeWing{sy}', (-2.6, sy * 4.6, 32.1), (2.4, 2.4, 1.1), material='paint2', bevel=0.08)
        F.box(s, f'BridgeWingGlaze{sy}', (-2.6, sy * 5.82, 32.2), (1.8, 0.1, 0.5), material='glow_warm', bevel=0.0)
    # lattice radar mast with a rotating bar
    mx = -16.5
    for dx, dy in ((0.9, 0.9), (0.9, -0.9), (-0.9, 0.9), (-0.9, -0.9)):
        F.cylinder(s, f'MastLeg{dx}{dy}', (mx + dx, dy, 31.0), (mx + dx * 0.3, dy * 0.3, 38.0), 0.14, material='gunmetal',
                   segments=8, bevel=0.0)
    for z in (33.0, 35.0, 37.0):
        F.box(s, f'MastRing{z}', (mx, 0.0, z), (1.6 - (z - 31) * 0.18, 1.6 - (z - 31) * 0.18, 0.18), material='gunmetal',
              bevel=0.0)
    F.box(s, 'RadarBar', (mx, 0.0, 38.3), (0.5, 7.0, 0.7), material='paint2', bevel=0.05)
    F.box(s, 'RadarFace', (mx + 0.28, 0.0, 38.3), (0.06, 6.4, 0.45), material='glow_cyan', bevel=0.0)
    F.light(s, 'MastTip', (mx, 0.0, 39.0), 'glow_red', size=0.45)
    # search radome and a fire-control dish on T3
    F.sensor_dome(s, 'Radome', (-6.5, 0.0, 33.6), 1.9)
    F.cylinder(s, 'RadomePlinth', (-6.5, 0, 33.2), (-6.5, 0, 33.7), 1.4, material='gunmetal', segments=18)
    F.dish(s, 'FireControl', (-19.2, 3.0, 31.6), 1.7, 0.6, axis=(0.5, 0.3, 0.8))
    F.cylinder(s, 'FireControlPost', (-19.2, 3.0, 31.0), (-19.2, 3.0, 31.8), 0.3, material='gunmetal', segments=10)
    F.dish(s, 'CommDish', (-19.2, -3.0, 31.6), 1.4, 0.5, axis=(-0.4, -0.3, 0.85))
    F.cylinder(s, 'CommDishPost', (-19.2, -3.0, 31.0), (-19.2, -3.0, 31.8), 0.3, material='gunmetal', segments=10)

    # --- lower keel: sensor spike and heat radiators -------------------------------------------
    F.box(s, 'Keel', (-10.0, 0.0, -33.0), (14.0, 5.0, 4.0), material='paint2', bevel=0.2, taper=1.0)
    F.cylinder(s, 'KeelSpike', (-10.0, 0.0, -35.0), (-10.0, 0.0, -40.0), 0.6, 0.15, material='gunmetal',
               segments=12)
    F.light(s, 'KeelTip', (-10.0, 0.0, -40.0), 'glow_red', size=0.4)
    F.dish(s, 'KeelDish', (-4.0, 0.0, -35.0), 1.5, 0.5, axis=(0.3, 0.0, -1.0))
    for i, x in enumerate((6.0, -6.0, -18.0)):
        for sy in (1, -1):
            pd_mount(s, f'LowPD{i}{sy}', x, sy * 9.8, -17.6, yaw=sy * math.pi / 2)

    # --- lit windows: armoured slits, set on each tier's (sloped) wall ------------------------------
    win = []
    for name, x0, x1, hw, c, z0, th, ch in UPPER:
        rows = {'T1': (8.6, 10.6), 'T2': (19.0,), 'T3': (26.3,)}[name]
        for z in rows:
            y = wall_y(hw, z0, th, z, cht=ch)
            win += wall_windows(x0 + c + 0.8, x1 - c - 0.8, y, z, int((x1 - x0 - 2 * c) / 1.9), size=(1.2, 0.32))
        for z in rows[:2]:
            xe = x1 - (hw - wall_y(hw, z0, th, z, cht=ch))
            win += end_windows(xe, -hw + c + 0.6, hw - c - 0.6, z, int((2 * hw - 2 * c) / 1.9), size=(1.2, 0.32))
    for name, x0, x1, hw, c, z0, th, ch in LOWER:
        rows = {'B1': (-8.6, -10.6), 'B2': (-19.0,), 'B3': (-26.3,)}[name]
        for z in rows:
            y = wall_y(hw, z0, th, z, chb=ch)
            win += wall_windows(x0 + c + 0.8, x1 - c - 0.8, y, z, int((x1 - x0 - 2 * c) / 1.9), size=(1.2, 0.32))
    # belt slits above the glacis, bastion firing slits
    for seg in ((-26.5, -16.5, 5), (-3.8, 15.4, 9)):
        win += wall_windows(seg[0], seg[1], wall_y(T0['hw'], -7.0, 14.0, 5.2, cht=0.8, chb=0.8), 5.2, seg[2],
                            size=(1.2, 0.32))
    for (cx, cy) in BASTIONS:
        for z in (-1.5, 1.5, 4.5):
            yb = cy + 4.8 - (0.9 * max(0.0, z + 0.9) / 9.9) - 0.02
            win += wall_windows(cx - 0.6, cx + 0.6, yb, z, 1, size=(1.1, 0.32))
    # gatehouse towers: window stacks on the outer bow face
    for z in (-4.5, -2.5, 2.5, 4.5):
        xg = 29.5 - (0.9 * max(0.0, z + 0.8) / 8.8 if z > 0 else 0.9 * max(0.0, -2.4 - z) / 5.6)
        win += end_windows(xg + 0.02, 7.6, 10.6, z, 2, size=(1.1, 0.4))
        win += end_windows(xg + 0.02, -10.6, -7.6, z, 2, size=(1.1, 0.4))
    # hangar control room windows in the back wall
    win += [((16.62, y, 1.6), (0.1, 1.4, 0.7)) for y in (-4.5, -2.25, 0.0, 2.25, 4.5)]
    boxes(s, 'Windows', win, 'glow_warm')
    # armour pilasters: dark buttress ribs up the keep walls, breaking the window courses
    pil = []
    for name, x0, x1, hw, c, z0, th, ch in UPPER[:2] + LOWER[:2]:
        zt = z0 + 0.45 * th if z0 > 0 else z0 + 0.35 * th
        za, zb = (z0, zt + 0.6) if z0 > 0 else (zt - 0.6, z0 + th)
        nx = int((x1 - x0 - 2 * c) / 7.0)
        for k in range(nx + 1):
            x = x0 + c + (x1 - x0 - 2 * c) * k / nx
            for sy in (1, -1):
                pil.append(((x, sy * (hw + 0.25), (za + zb) / 2), (1.1, 0.7, zb - za)))
    boxes(s, 'Pilasters', pil, 'paint2', bevel=0.08)

    # --- landing lights: approach strings on the apron, bay lights, red edge lights --------------
    lamps_amber = [((18.0 + i * 1.8, sy * 5.3, -3.52), (0.4, 0.4, 0.12)) for i in range(10) for sy in (1, -1)]
    lamps_green = [((18.5 + i * 2.2, 0.0, -3.52), (0.9, 0.22, 0.1)) for i in range(8)]
    boxes(s, 'ApronAmber', lamps_amber, 'glow_amber')
    boxes(s, 'ApronCentre', lamps_green, 'glow_green')
    boxes(s, 'BayLights', [((22.0 + i * 2.0, y, 3.3), (1.2, 0.3, 0.1)) for i in range(-2, 3) for y in (-4, 0, 4)],
          'glow_cyan')
    # red obstruction lights on every tier corner
    red = []
    for (x0, x1, hw, zt) in ((-38.0, 16.0, 14.5, 7.0), (-33.0, 17.0, 11.5, 17.0), (-27.0, 9.0, 7.6, 25.0),
                             (-21.0, 1.0, 4.6, 31.0)):
        for (x, y) in ((x1 - 1.0, hw - 1.6), (x0 + 1.0, hw - 1.6), (x1 - 1.0, -hw + 1.6), (x0 + 1.0, -hw + 1.6)):
            red.append(((x, y, zt + 0.25), (0.5, 0.5, 0.35)))
    red += [((23.0, sy * 17.2, 8.2), (0.6, 0.6, 0.4)) for sy in (1, -1)]
    red += [((cx, sy * (cy + 4.0), 9.2), (0.6, 0.6, 0.4)) for (cx, cy) in BASTIONS for sy in (1, -1)]
    boxes(s, 'RedLights', red, 'glow_red')
    F.work_lamp(s, 'ApronLamp', (27.6, 8.5, 8.4), aim=(0.6, -0.3, 0.6), size=0.9, mirror=True)
    F.beacon(s, 'Beacon', (-6.5, 0.0, 36.1), size=0.5)
    F.light(s, 'NavPort', (-10.0, 18.95, 0.0), 'glow_red', size=0.6)
    F.light(s, 'NavStarboard', (-10.0, -18.95, 0.0), 'glow_green', size=0.6)

    s.detail = 1
    # VLS hatches on the T1 stern terrace, vents on T2
    for i in range(3):
        for j in range(4):
            F.box(s, f'VLS{i}{j}', (-26.0 + i * 1.9, -3.3 + j * 2.2, 17.05), (1.5, 1.8, 0.14), material='dark',
                  bevel=0.0)
            F.box(s, f'VLSLid{i}{j}', (-26.0 + i * 1.9, -3.3 + j * 2.2, 17.14), (1.2, 1.5, 0.1), material='gunmetal',
                  bevel=0.0)
    F.vent(s, 'T2Vent', (-12.0, 5.5, 25.05), (5.0, 1.6, 0.2), mirror=True, slats=8)
    F.vent(s, 'T0Vent', (-35.5, 7.0, 7.05), (2.6, 5.0, 0.2), mirror=True, slats=6, axis='y')
    for sy in (1, -1):
        F.antenna(s, f'Whip{sy}', (-9.5, sy * 2.6, 33.6), 3.5)
        F.antenna(s, f'WhipT1{sy}', (-31.0, sy * 9.8, 17.0), 4.0)
    # parked interceptors on the stern pads of T1
    for sy in (1, -1):
        F.cylinder(s, f'Pad{sy}', (-4.5, sy * 9.0, 17.0), (-4.5, sy * 9.0, 17.1), 1.3, material='paint2',
                   segments=24, bevel=0.0)
        F.ring(s, f'PadRing{sy}', (-4.5, sy * 9.0, 17.1), 1.2, 0.07, axis=(0, 0, 1), material='hazard', segments=24,
               sides=4)
    parked_fighter(s, 'Fighter1', -4.5, 9.0, 17.1, yaw=0.0)
    parked_fighter(s, 'Fighter2', -4.5, -9.0, 17.1, yaw=0.0)
    s.detail = 0
    # ANI-41: radar bar, bow battery and fire-control dish ride motion pivots (see animations/ANI_41.py)
    ANI_41.register(s)
    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    spec = E.fleet_spec(SHIP_ID)
    live = '--live' in sys.argv
    bank = ANI_41.build(ship, spec['asset_id'])
    written = E.export_ship(ship, spec, preview=not live)
    # --live seals the bank against the release GLB (the lead publishes). A preview build skips it
    # unless SF_BANK_OUT names a scratch folder: the bank is then baked against the preview GLB.
    # Bank file name = render-package pilot key ('military'), see scripts/lib/renderPackageRuntimeTable.mjs.
    scratch = os.environ.get('SF_BANK_OUT')
    if live or scratch:
        out_dir = ANI_41.motion_bank.MOTIONS_DIR if live else scratch
        os.makedirs(out_dir, exist_ok=True)
        bank.bake([path for path, _tris in written], out_path=os.path.join(out_dir, 'military.motion.json'))
