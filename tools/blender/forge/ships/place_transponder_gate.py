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
    s.emit_scale = 4.0

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
            pos = (0, y - e * 0.8, 2.4 + i * 2.0)
            F.box(s, f'LaneStrip{e:+d}{i}', pos, (0.4, 0.1, 0.9), material='glow_cyan', bevel=0.0)
            # the transit strip chases up the tower face
            s.anim(s.objects[-1:], f'chase:lane{e:+d}:{i}:5:2p4', pos)
        s.detail = 0
        # red corner marker on the crown
        o = F.light(s, f'CrownLamp{e:+d}', (0, y, 12.95), 'glow_red', size=0.3)
        s.anim(o, f'blink:1p{3 + e}:0p{1 - e}', (0, y, 12.95))

    # --- the portal: a heavy lit beam spans the crowns, a sill closes the rectangle ------------
    # ships fly through along +/-X, so the opening must read as a doorway: beam at the top,
    # sill at the bottom, scanner heads facing the lane on both
    F.box(s, 'PortalBeam', (0, 0, 11.7), (1.0, 19.6, 1.5), material='paint2.navy',
          bevel=0.08)
    F.box(s, 'PortalBeamCap', (0, 0, 12.55), (1.05, 19.2, 0.35), material='dark',
          bevel=0.03)
    # truss fascia above the beam — engineered, not a flat bar
    F.truss(s, 'BeamTruss', (0, -9.4, 12.75), (0, 9.4, 12.75), 0.8, 9, material='dark',
            chord=0.22, web=0.13)
    # lit edge strips down the beam's underside — the "scan curtain" ships pass under
    s.detail = 1
    for i in range(7):
        pos = (0, -7.5 + i * 2.5, 10.85)
        F.box(s, f'ScanBar{i}', pos, (0.7, 0.9, 0.22), material='glow_cyan', bevel=0.0)
        # the scan curtain sweeps along the beam
        s.anim(s.objects[-1:], f'chase:scan:{i}:7:3p6', pos)
    s.detail = 0
    # reader head at the throat centre, face looking down the lane (+-X)
    F.box(s, 'ReaderHead', (0, 0, 11.6), (1.05, 3.2, 1.9), material='paint2.navy',
          bevel=0.1)
    for ex in (-1, 1):
        F.box(s, f'ReaderEye{ex:+d}', (ex * 0.56, 0, 11.6), (0.14, 2.2, 1.1),
              material='glow_cyan', bevel=0.0)
        # lane-facing scanner paddles at mid-height — the heads that read you as you pass
        F.box(s, f'ScanPaddle{ex:+d}', (ex * 0.75, -4.5, 6.4), (0.5, 2.0, 1.6),
              material='paint2', bevel=0.06)
        F.box(s, f'ScanPaddleEye{ex:+d}', (ex * 1.03, -4.5, 6.4), (0.08, 1.3, 0.9),
              material='glow_cyan', bevel=0.0)
        F.box(s, f'ScanPaddleB{ex:+d}', (ex * 0.75, 4.5, 6.4), (0.5, 2.0, 1.6),
              material='paint2', bevel=0.06)
        F.box(s, f'ScanPaddleBEye{ex:+d}', (ex * 1.03, 4.5, 6.4), (0.08, 1.3, 0.9),
              material='glow_cyan', bevel=0.0)
    # sill between the shoes closes the gate's rectangle
    F.box(s, 'PortalSill', (0, 0, 0.6), (0.7, 16.6, 0.5), material='dark', bevel=0.04)
    s.detail = 1
    for i in range(7):
        F.box(s, f'SillTick{i}', (0, -6.0 + i * 2.0, 0.9), (0.6, 0.55, 0.14),
              material='hazard', bevel=0.0)
    s.detail = 0

    # --- lane-centre beacon on the beam's crown --------------------------------------------------
    F.cylinder(s, 'LaneMast', (0, 0, 12.6), (0, 0, 13.0), 0.16, material='gunmetal',
               segments=8)
    n0 = len(s.objects)
    F.beacon(s, 'LaneBlink', (0, 0, 13.05), 'glow_amber', size=0.25)
    s.anim([o for o in s.objects[n0:] if o.name == 'LaneBlink_Dome'], 'blink:1p1:0p2',
           (0, 0, 13.05))
    # service lamp on one foot
    F.work_lamp(s, 'ServiceLamp', (0.4, -10.4, 1.2), aim=(-0.2, 0.4, 0.6), size=0.4,
                lens='glow_warm')
    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
