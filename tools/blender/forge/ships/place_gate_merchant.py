"""place_gate_merchant — BP-8c Meridian toll ring (C6). Ornate toll-ring gold.

A merchant prince's toll gate: a double ring (inner transit band + outer gilded
scrollwork band) with four toll-booth pods clamped on the rim, ornate crown
finials, and warm counting-house windows. Ships transit along X through the
SOCKET_Gate_Aperture.
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402
import c6_kit as K  # noqa: E402

SHIP_ID = 'place_gate_merchant'
COLORS = {
    'paint': '#6b5636',        # Meridian bronze
    'paint2': '#33291c',
    'stripe.gold': '#c8a03c',
    'dark': '#14110c',
    'glow_warm.toll': '#ffd070',
    'glow_amber.toll': '#ffb030',
}
R_IN, R_OUT = 29.0, 35.0
R_BAND = 39.0
HX = 4.6


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)
    # transit band + gilded outer scroll band on standoffs
    K.xz_annular_sector(s, F, 'Ring', R_IN, R_OUT, 0, 2 * math.pi, -HX, HX, 'paint', bevel=0.15)
    K.xz_annular_sector(s, F, 'GoldBand', R_BAND - 1.6, R_BAND + 1.6, 0, 2 * math.pi, -1.8, 1.8,
                        'stripe.gold', steps=48, bevel=0.25)
    # scrollwork: 24 gold vanes between the rings
    vanes = K.yz_ring_items(24, (R_OUT + R_BAND) / 2, (0.5, 4.5, 1.0), x=0.0)
    K.boxes(s, F, 'Scrollwork', vanes, 'stripe.gold', bevel=0.06)
    # inner liner + gold edge rails on both faces
    for sx in (1, -1):
        K.xz_annular_sector(s, F, f'Liner{sx}', R_IN - 0.35, R_IN + 0.05, 0, 2 * math.pi,
                            sx * (HX - 1.0), sx * HX, 'paint2', steps=48, bevel=0.0)
        F.ring(s, f'GoldRail{sx}', (sx * HX, 0, 0), R_OUT - 0.7, 0.35, axis=(1, 0, 0),
               material='stripe.gold', segments=96, sides=6)
        F.ring(s, f'Aperture{sx}', (sx * (HX - 0.6), 0, 0), R_IN - 0.4, 0.2, axis=(1, 0, 0),
               material='glow_amber.toll', segments=96, sides=4)
    # four toll-booth pods on the rim (45-degree diagonals)
    for i in range(4):
        a = math.pi / 4 + i * math.pi / 2
        cy, cz = R_OUT * math.cos(a), R_OUT * math.sin(a)
        F.box(s, f'Booth{i}', (0, cy * 1.06, cz * 1.06), (HX * 2 + 5, 9.0, 10.5),
              material='paint', rot=(a, 0, 0), bevel=0.5)
        F.box(s, f'BoothCap{i}', (0, cy * 1.10, cz * 1.10), (HX * 2 + 6, 6.0, 5.5),
              material='stripe.gold', rot=(a, 0, 0), bevel=0.4)
        # lit toll windows on the pod's transit-facing side
        win = []
        for k in range(3):
            off = -2.0 + k * 2.0
            wy = cy * 1.06 - math.cos(a) * 5.2 - math.sin(a) * off
            wz = cz * 1.06 - math.sin(a) * 5.2 + math.cos(a) * off
            win.append(((0, wy, wz), (HX * 2 + 5.2, 0.18, 1.0), (0, 0, 0)))
        K.boxes(s, F, f'BoothWin{i}', win, 'glow_warm.toll')
    # crown finials top and bottom — the ornate read
    for sy in (1, -1):
        F.box(s, f'CrownStem{sy}', (0, 0, sy * (R_BAND + 3.0)), (HX * 2 + 4, 4.0, 9.0),
              material='stripe.gold', bevel=0.4)
        F.box(s, f'CrownTip{sy}', (0, 0, sy * (R_BAND + 8.5)), (HX * 2 + 2, 2.0, 3.0),
              material='stripe.gold', rot=(0.785 * sy, 0, 0), bevel=0.2)
        F.dish(s, f'CrownDish{sy}', (HX + 2.0, 0, sy * (R_BAND + 2.0)), 2.2, 0.9,
               axis=(0.3, 0.0, sy * 0.95), material='paint')
    # tally lanterns around the gold band + emissive pool at the aperture
    s.detail = 1
    lamps = K.yz_ring_items(12, R_BAND + 2.2, (0.9, 0.9, 0.9), x=0.0)
    K.boxes(s, F, 'Lanterns', lamps, 'glow_amber.toll', bevel=0.15)
    s.detail = 0
    K.gate_sockets(s, ring_radius=R_BAND + 4.0)
    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
