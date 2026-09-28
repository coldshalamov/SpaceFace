"""Transponder gate (place_transponder_gate) — Forge rebuild.

Idea: "the toll-booth arch". A lane-reader gate standing across the flight lane: two navy
plate pylons with splayed base feet, a trussed crossbar between their crowns carrying the
reader head and a slow cyan pulse strip down its inner faces, and a lane-centre beacon at
the throat. Concord lane furniture — navy/graphite with cyan transit lights, one amber
service lamp. Live bounds (Blender): x +-1.2, y +-11.2, z -0.04..13.2 — the gate is a thin
plate wall, so the plan read is a line with two pad nodes and a lit centre.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402

SHIP_ID = 'place_transponder_gate'
COLORS = {
    'paint': '#8f8674',
    'paint2': '#3a3f45',
    'paint2.navy': '#2b3140',        # Concord navy towers
    'stripe': '#4a5a6a',
    'gunmetal': '#23282e',
    'dark': '#101418',
    'hazard': '#8a7418',
    'glow_cyan': '#5fd8e0',   # transit-read light
    'glow_warm': '#ffdba6',
    'glow_amber': '#ffb345',
    'glow_red': '#ff3a2a',
}


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)

    # --- twin pylons, thin in x, standing on splayed feet ------------------------------------
    # Tall/thin rule: the gate is a plan sliver, so the feet carry the top read — each pylon
    # gets outrigger skids spreading along +/-X and a low equipment deck beside it.
    for e in (-1, 1):
        y = e * 9.6
        # base shoe: wider than the tower so each end reads as a planted pad in plan
        F.box(s, f'Shoe{e:+d}', (0, y, 0.25), (1.1, 3.4, 0.5), material='gunmetal',
              bevel=0.06)
        F.box(s, f'ShoePad{e:+d}', (0, y, 0.55), (1.0, 0.8, 0.35), material='hazard',
              bevel=0.02)
        # outrigger skids: two diagonal feet spreading the plan, plus a cross rail
        for ex in (-1, 1):
            F.beams(s, f'Outrigger{e:+d}{ex:+d}', [((ex * 0.4, y, 0.4), (ex * 0.95, y, 0.4))],
                    0.35, material='gunmetal')
            F.box(s, f'OutPad{e:+d}{ex:+d}', (ex * 0.88, y, 0.15), (0.5, 2.4, 0.3),
                  material='dark', bevel=0.03)
        # service deck strip between the pylons — a ground-level equipment ledge
        F.box(s, f'Equip{e:+d}', (0, y - e * 2.4, 0.9), (0.8, 1.4, 1.4),
              material='dark', bevel=0.05)
        # the tower: layered plate — navy core, graphite edge ribs, pale face strips
        F.box(s, f'Tower{e:+d}', (0, y, 6.6), (0.9, 1.5, 11.6), material='paint2.navy', bevel=0.08)
        for ex in (-1, 1):
            F.box(s, f'TowerRib{e:+d}{ex:+d}', (ex * 0.55, y, 6.6), (0.18, 1.7, 11.2),
                  material='dark', bevel=0.02)
        F.box(s, f'TowerFace{e:+d}', (0, y - e * 0.8, 6.6), (0.7, 0.16, 9.8),
              material='paint2', bevel=0.02)
        # dark crown cap — a top-facing plate that must read graphite, not pale
        F.box(s, f'Crown{e:+d}', (0, y, 12.6), (1.1, 1.9, 0.8), material='dark',
              bevel=0.08)
        # transit strip down the inner face — the lane light column
        s.detail = 1
        for i in range(5):
            F.box(s, f'LaneStrip{e:+d}{i}', (0, y - e * 0.8, 2.4 + i * 2.0),
                  (0.4, 0.1, 0.9), material='glow_cyan', bevel=0.0)
        s.detail = 0
        # red corner marker on the crown
        F.light(s, f'CrownLamp{e:+d}', (0, y, 12.95), 'glow_red', size=0.3)

    # --- trussed crossbar between the crowns ---------------------------------------------------
    F.truss(s, 'Crossbar', (0, -9.6, 12.2), (0, 9.6, 12.2), 1.5, 8, material='dark',
            chord=0.35, web=0.2)
    # reader head at the throat centre — the unit that scans the lane
    F.box(s, 'ReaderHead', (0, 0, 12.2), (1.0, 2.6, 1.6), material='paint2.navy', bevel=0.1)
    F.box(s, 'ReaderFace', (0, 0, 11.3), (0.8, 1.8, 0.5), material='dark', bevel=0.03)
    s.detail = 1
    for i in range(3):
        F.box(s, f'ReaderLamp{i}', (0, -0.6 + i * 0.6, 11.0), (0.5, 0.3, 0.12),
              material='glow_cyan', bevel=0.0)
    s.detail = 0

    # --- lane-centre beacon: a slow amber pulse on a stub mast under the bar -------------------
    F.cylinder(s, 'LaneMast', (0, 0, 12.0), (0, 0, 12.85), 0.16, material='gunmetal',
               segments=8)
    F.beacon(s, 'LaneBlink', (0, 0, 12.95), 'glow_amber', size=0.25)
    # service lamp on one foot
    F.work_lamp(s, 'ServiceLamp', (0.4, -10.4, 1.2), aim=(-0.2, 0.4, 0.6), size=0.4,
                lens='glow_warm')
    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
