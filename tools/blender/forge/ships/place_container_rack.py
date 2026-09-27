"""Container rack (place_container_rack) — Forge rebuild.

Idea: "charcoal steel rack, stacked freight". An open three-bay, three-level charcoal steel rack with
hazard-banded uprights, holding intermodal containers (the same ribbed build as the standard cargo
pod) in teal, ochre, rust and blue, doors facing the approach side. Ladder towers with safety cages
climb both ends; an overhead gantry hoist runs on rails along the top and hangs its hook into the
free top bay (SOCKET_Bay_Free). Floodlights and green corner lights. Plan read: a rack of coloured
boxes with a yellow crane bridge across one empty slot.

Live contract (glTF): X ±6.77, Y-up -4.07..7.63, Z ±4.18. SOCKET_Bay_Free at (3.2, 5.0, 0),
SOCKET_Approach at (0, 0, -8) -> Blender +Y side. Blender (x, y, z) = glTF (X, -Z, Y).
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402

SHIP_ID = 'place_container_rack'
COLORS = {
    'paint': '#8c6c1e',          # safety yellow (hoist, ladders)
    'paint2': '#23282e',         # charcoal rack steel
    'stripe': '#9c7a2a',
    'hazard': '#b88a22',
    'paint.teal': '#17494a',     # container colours
    'paint.ochre': '#6a4a18',
    'paint.rust': '#4c201c',
    'paint.blue': '#1f3a5c',
}

CL, CW, CH = 6.0, 3.3, 3.1          # container length (along y), width (x), height
COLS = (-3.7, 0.0, 3.7)
Z_FLOORS = (-3.92, -0.32, 3.28)
Z_TOP = 6.72
UX = (-5.55, -1.85, 1.85, 5.55)     # upright x
UY = 3.3                            # upright y
Z_BASE = -4.07


def strut(s, name, p0, p1, w, material='paint2', bevel=0.0):
    return F.sweep(s, name, [p0, p1], w, w, material=material, bevel=bevel)


def container(s, name, cx, cz, finish):
    """Intermodal container, long axis along Y, doors on the +/-Y ends (cargo-pod build)."""
    F.box(s, name, (cx, 0, cz), (CW - 0.2, CL - 0.3, CH - 0.2), material=finish, bevel=0.04)
    for sy in (-1, 1):
        F.band(s, name, (cx, sy * 1.75, cz), (0, 1, 0), 0.24, 'hazard')
    s.detail = 1
    for i in range(7):
        y = -CL / 2 + 0.6 + i * (CL - 1.2) / 6
        if abs(abs(y) - 1.75) < 0.3:
            continue
        F.box(s, f'{name}Rib{i}', (cx, y, cz), (CW - 0.08, 0.12, CH - 0.08), material=finish, bevel=0.0)
    s.detail = 0
    for sx in (-1, 1):
        for sy in (-1, 1):
            F.box(s, f'{name}Post{sx}{sy}', (cx + sx * (CW / 2 - 0.12), sy * (CL / 2 - 0.12), cz), (0.24, 0.24, CH),
                  material='paint2', bevel=0.0)
        for sz in (-1, 1):
            F.box(s, f'{name}Side{sx}{sz}', (cx + sx * (CW / 2 - 0.12), 0, cz + sz * (CH / 2 - 0.12)), (0.22, CL, 0.22),
                  material='paint2', bevel=0.0)
    for sy in (-1, 1):
        for sz in (-1, 1):
            F.box(s, f'{name}End{sy}{sz}', (cx, sy * (CL / 2 - 0.12), cz + sz * (CH / 2 - 0.12)), (CW, 0.22, 0.22),
                  material='paint2', bevel=0.0)
        F.box(s, f'{name}Door{sy}', (cx, sy * (CL / 2 - 0.06), cz), (CW - 0.6, 0.08, CH - 0.6), material='paint2',
              bevel=0.0)
        s.detail = 2
        for x in (-0.7, -0.25, 0.25, 0.7):
            F.cylinder(s, f'{name}Lock{sy}{x}', (cx + x, sy * (CL / 2 + 0.0), cz - CH / 2 + 0.4),
                       (cx + x, sy * (CL / 2 + 0.0), cz + CH / 2 - 0.4), 0.045, material='gunmetal', segments=6,
                       bevel=0.0)
        s.detail = 0
    F.box(s, f'{name}Lug', (cx, 0, cz + CH / 2 + 0.02), (1.0, 1.2, 0.1), material='paint2', bevel=0.0)
    F.light(s, f'{name}Status', (cx + CW / 2 - 0.45, CL / 2 - 0.45, cz + CH / 2 + 0.01), 'glow_amber', size=0.14)


def ladder(s, name, x):
    """Ladder with safety cage up the end frame at x (outboard of the end uprights)."""
    sgn = 1 if x > 0 else -1
    for sy in (-1, 1):
        F.box(s, f'{name}Rail{sy}', (x, sy * 0.3, (Z_BASE + Z_TOP) / 2 + 0.3), (0.08, 0.08, Z_TOP - Z_BASE + 0.6),
              material='paint', bevel=0.0)
    s.detail = 1
    n = 28
    for k in range(n):
        z = Z_BASE + 0.3 + k * (Z_TOP - Z_BASE) / n
        F.box(s, f'{name}Rung{k}', (x, 0, z), (0.05, 0.6, 0.05), material='paint', bevel=0.0)
    s.detail = 0
    for k, z in enumerate((Z_FLOORS[0] + 1.8, Z_FLOORS[1] + 0.3, Z_FLOORS[1] + 2.4, Z_FLOORS[2] + 0.3,
                           Z_FLOORS[2] + 2.4)):
        strut(s, f'{name}Stand{k}{0}', (sgn * 5.55, 0.3, z), (x, 0.3, z), 0.08, material='paint')
        strut(s, f'{name}Stand{k}{1}', (sgn * 5.55, -0.3, z), (x, -0.3, z), 0.08, material='paint')
    # cage: hoops and three straps
    s.detail = 1
    hoops = [Z_FLOORS[0] + 2.4 + k * 0.9 for k in range(10)]
    for k, z in enumerate(hoops):
        strut(s, f'{name}HoopO{k}', (x + sgn * 0.5, -0.42, z), (x + sgn * 0.5, 0.42, z), 0.05, material='paint')
        for sy in (-1, 1):
            strut(s, f'{name}HoopS{k}{sy}', (x, sy * 0.42, z), (x + sgn * 0.5, sy * 0.42, z), 0.05, material='paint')
    for sy in (-1, 0, 1):
        yy = sy * 0.42
        xx = x + sgn * 0.5 if sy == 0 else x + sgn * 0.3
        strut(s, f'{name}Strap{sy}', (xx, yy, hoops[0]), (xx, yy, hoops[-1]), 0.05, material='paint')
    s.detail = 0


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)

    # --- rack frame ------------------------------------------------------------------------------
    for i, x in enumerate(UX):
        for sy in (-1, 1):
            F.box(s, f'Up{i}{sy}', (x, sy * UY, (Z_BASE + Z_TOP) / 2), (0.34, 0.34, Z_TOP - Z_BASE + 0.3),
                  material='paint2', bevel=0.03)
            F.band(s, f'Up{i}{sy}', (0, 0, Z_BASE + 0.6), (0, 0, 1), 0.5, 'hazard')
            F.band(s, f'Up{i}{sy}', (0, 0, Z_TOP - 0.2), (0, 0, 1), 0.3, 'hazard')
            F.box(s, f'Foot{i}{sy}', (x, sy * UY, Z_BASE + 0.08), (0.7, 0.7, 0.16), material='gunmetal', bevel=0.0)
    for k, z in enumerate(Z_FLOORS + (Z_TOP,)):
        for sy in (-1, 1):
            F.box(s, f'Beam{k}{sy}', (0, sy * UY, z), (UX[-1] * 2 + 0.3, 0.28, 0.3), material='paint2', bevel=0.02)
        for i, x in enumerate(UX):
            F.box(s, f'Cross{k}{i}', (x, 0, z), (0.26, UY * 2, 0.28), material='paint2', bevel=0.0)
        if z < Z_TOP:
            for c, cx in enumerate(COLS):
                for sx in (-1, 1):
                    F.box(s, f'Rail{k}{c}{sx}', (cx + sx * 1.15, 0, z + 0.05), (0.2, UY * 2, 0.18),
                          material='gunmetal', bevel=0.0)
    # X-bracing on both end frames and the lowest back bays
    s.detail = 1
    for x in (UX[0], UX[-1]):
        for k in range(3):
            z0, z1 = Z_FLOORS[k], (Z_FLOORS + (Z_TOP,))[k + 1]
            strut(s, f'EndX{x:.0f}{k}a', (x, -UY, z0), (x, UY, z1), 0.14)
            strut(s, f'EndX{x:.0f}{k}b', (x, UY, z0), (x, -UY, z1), 0.14)
    s.detail = 0
    # base skid beams
    for sy in (-1, 1):
        F.box(s, f'Skid{sy}', (0, sy * UY, Z_BASE + 0.1), (UX[-1] * 2 + 1.0, 0.5, 0.2), material='gunmetal',
              bevel=0.02)

    # --- containers (7 of 9 bays filled; top-right is the free bay) ------------------------------
    fills = {
        (0, 0): 'paint.teal', (1, 0): 'paint.ochre', (2, 0): 'paint.rust',
        (1, 1): 'paint.blue', (2, 1): 'paint.teal',
        (0, 2): 'paint.rust', (1, 2): 'paint.teal',
    }
    for (c, lv), fin in fills.items():
        cz = Z_FLOORS[lv] + 0.14 + CH / 2
        container(s, f'Box{c}{lv}', COLS[c], cz, fin)

    # --- ladders at both ends -----------------------------------------------------------------------
    ladder(s, 'LadE', 6.15)
    ladder(s, 'LadW', -6.15)

    # --- overhead gantry hoist over the free bay ---------------------------------------------------
    ZR = Z_TOP + 0.3
    for sy in (-1, 1):
        F.box(s, f'CraneRail{sy}', (0, sy * UY, ZR), (UX[-1] * 2 + 0.2, 0.22, 0.16), material='gunmetal', bevel=0.01)
    BX = COLS[2]
    for sy in (-1, 1):
        F.box(s, f'Truck{sy}', (BX, sy * UY, ZR + 0.25), (1.0, 0.5, 0.36), material='paint', bevel=0.04)
    F.box(s, 'Bridge', (BX, 0, ZR + 0.52), (0.6, UY * 2 + 0.3, 0.36), material='paint', bevel=0.04)
    for k in range(-4, 5):
        F.band(s, 'Bridge', (BX, k * 0.7, ZR + 0.52), (0.6, 0.8, 0), 0.18, 'paint2', facing=(0, 0, 1))
    F.box(s, 'Trolley', (BX, 0.8, ZR + 0.3), (0.8, 0.8, 0.5), material='paint2', bevel=0.04)
    F.cylinder(s, 'Drum', (BX - 0.3, 0.8, ZR + 0.3), (BX + 0.3, 0.8, ZR + 0.3), 0.2, material='gunmetal',
               segments=14)
    for dx in (-0.12, 0.12):
        F.cylinder(s, f'Cable{dx}', (BX + dx, 0.8, ZR + 0.05), (BX + dx, 0.8, 5.1), 0.03, material='dark',
                   segments=6, bevel=0.0)
    F.box(s, 'HookBlock', (BX, 0.8, 4.9), (0.5, 0.35, 0.45), material='hazard', bevel=0.04)
    F.ring(s, 'Hook', (BX, 0.8, 4.45), 0.2, 0.06, axis=(1, 0, 0), material='gunmetal', segments=16, sides=6)
    # operator cab slung under the bridge end, warm lit windows
    F.box(s, 'Cab', (BX - 0.55, -UY + 0.9, ZR + 0.05), (0.7, 1.1, 0.8), material='paint2', bevel=0.05)
    F.box(s, 'CabWinF', (BX - 0.55, -UY + 1.46, ZR + 0.12), (0.5, 0.04, 0.3), material='glow_warm', bevel=0.0)
    for sx in (-1, 1):
        F.box(s, f'CabWin{sx}', (BX - 0.55 + sx * 0.36, -UY + 0.9, ZR + 0.12), (0.04, 0.8, 0.3), material='glow_warm',
              bevel=0.0)
    F.box(s, 'CabRoof', (BX - 0.55, -UY + 0.9, ZR + 0.48), (0.8, 1.2, 0.08), material='paint', bevel=0.02)
    F.beacon(s, 'CraneBeacon', (BX, -1.6, ZR + 0.7), finish='glow_amber', size=0.3)

    # --- lights ---------------------------------------------------------------------------------------
    for sx in (-1, 1):
        for sy in (-1, 1):
            F.work_lamp(s, f'Flood{sx}{sy}', (sx * 5.55, sy * UY, Z_TOP + 0.55), aim=(-sx * 0.5, -sy * 0.3, 0.8),
                        size=0.42, lens='glow_warm')
            F.light(s, f'Nav{sx}{sy}', (sx * 5.55, sy * (UY + 0.2), Z_FLOORS[1]), 'glow_green', size=0.16)
    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
