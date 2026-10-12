"""place_landmark_pit_anchor — QUEUE F7-31 pit-ember anchor (C6).

A broken colony anchor, melancholy: the two colossal jaw arms of a colony berth
pylon snapped apart mid-service; a torn habitat ring segment still hangs off the
port jaw on bent hinges; ember-orange memorial lights burn inside the gap.
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402
import c6_kit as K  # noqa: E402

SHIP_ID = 'place_landmark_pit_anchor'
COLORS = {
    'paint': '#5c5650',        # weathered colony steel
    'paint2': '#33383e',
    'dark': '#14171b',
    'hazard.ember': '#8a5a20',
    'glow_warm.ember': '#ff9a3c',
    'glow_amber.ember': '#ff8433',
}


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)
    K.rock_base(s, F, 'AnchorBed', (0, 0, 2.0), 30.0, seed=23)
    # base slab the jaws hinge out of
    K.boxes(s, F, 'Root', [((0, 0, 10.0), (44.0, 30.0, 12.0), (0, 0, 0))], 'paint2', bevel=0.8)
    # two jaw arms: massive tapering arms splayed open and snapped
    for sy in (1, -1):
        a = sy * 0.42  # splay angle from forward
        arm_x = 26.0
        for i in range(4):
            t = i / 3
            cx = arm_x + t * 38.0
            w = 13.0 - t * 6.0
            h = 15.0 - t * 5.5
            rot = (0.0, sy * -0.10 * t, a + sy * 0.16 * t)
            F.box(s, f'Jaw{sy}{i}', (cx, sy * (8.0 + t * 15.0), 14.0 + t * 10.0),
                  (12.5, w, h), material='paint' if i < 3 else 'dark',
                  rot=rot, bevel=0.5)
        # snapped fracture face: jagged bright metal + hazard paint at the break
        tip_x = arm_x + 40.0
        F.box(s, f'Break{sy}', (tip_x + 2.5, sy * 24.5, 24.0), (2.2, 8.0, 9.0),
              material='bare', rot=(0.1, sy * -0.25, a + sy * 0.3), bevel=0.1)
        # cable bundles dangling from the break
        for k in range(3):
            px = tip_x + 2.0 + k * 1.4
            F.cylinder(s, f'Cable{sy}{k}', (px, sy * 24.0, 23.0), (px + 1.0, sy * 26.0, 15.0 - k * 2.5),
                       0.28, 0.12, material='gunmetal', segments=6)
    # torn habitat ring segment hanging off the port jaw by two bent hinges
    seg_a0, seg_a1 = math.radians(200), math.radians(315)
    F.box(s, 'HingeA', (52.0, 27.0, 20.0), (2.0, 3.0, 5.5), material='gunmetal', bevel=0.1)
    F.box(s, 'HingeB', (62.0, 30.0, 16.0), (2.0, 3.0, 5.0), material='gunmetal',
          rot=(0.3, 0, 0.2), bevel=0.1)
    K.xz_annular_sector(s, F, 'HabitatSeg', 14.0, 19.5, seg_a0, seg_a1, 58.0, 63.0,
                        material='paint2', steps=10, bevel=0.3)
    # dead windows on the hanging ring — two lit, the rest dark (melancholy)
    win, dead = [], []
    for i in range(10):
        a = seg_a0 + (seg_a1 - seg_a0) * (i + 0.5) / 10
        p = ((61.6, 17.5 * math.cos(a), 17.5 * math.sin(a)), (0.15, 1.1, 0.5), (a + math.pi / 2, 0, 0))
        (win if i in (2, 7) else dead).append(p)
    K.boxes(s, F, 'SegWinLit', win, 'glow_warm.ember')
    K.boxes(s, F, 'SegWinDead', dead, 'dark')
    # ember memorial lights inside the gap between the jaws
    s.detail = 1
    for i in range(7):
        a = 2 * math.pi * i / 7
        F.light(s, f'Ember{i}', (30.0 + 4.0 * math.cos(a), 0.5 * math.sin(a) * 3.0, 15.0),
                'glow_amber.ember', size=0.6)
    # hazard warning band on the root
    K.boxes(s, F, 'HazBand', [((0, 15.02, 10.0), (40.0, 0.2, 3.0), (0, 0, 0)),
                              ((0, -15.02, 10.0), (40.0, 0.2, 3.0), (0, 0, 0))], 'hazard.ember')
    s.detail = 0
    K.landmark_sockets(s, focus_z=20.0)
    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
