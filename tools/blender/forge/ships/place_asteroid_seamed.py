"""Seamed asteroid (place_asteroid_seamed) — Forge rebuild (GFX-8 rework).

Idea: "the veined rock". One big displaced-stone boulder cut by a continuous mineral vein —
a real band() stratum of muted copper-green (#3f5a4c) wrapping the whole body and crossing
the crown, with a faint warm glow line laid in the vein's hot middle. Dark fracture bands
flank the vein. SOCKET_Scan_Target sits on the seam (copied live). Reads as ROCK with a
readable ore band — no machinery tile, no plate chain.
Live bounds (Blender): x -14.1..14.3, y -11.7..12.1, z -10.2..11.4.
Scene root stays place_asteroid_seamed (render-package pilot rootNode).
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402

SHIP_ID = 'place_asteroid_seamed'
COLORS = {
    'stone': '#524a40',
    'stone.strata': '#403830',
    'stone.deep': '#403830',
    'stone.vein': '#456a55',     # copper-green mineral vein — lifted a touch over the darker
    # stone so the band still separates at chase zoom
    'dark': '#16191d',
    'glow_warm': '#c8903a',      # faint hot-seam line only
    'glow_amber': '#c88f2a',
}


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)
    s.emit_scale = 4.0

    # --- the mass: one dominant displaced boulder + flanking lumps --------------------------
    F.rock(s, 'Core', (0, 0, 0), 10.5, seed=13, subdiv=4, relief=0.34, terrace=0.0,
           material='stone')
    F.rock(s, 'LumpA', (-7.5, -3.0, -2.0), 4.4, seed=47, subdiv=4, relief=0.3, terrace=0.0,
           material='stone.deep')
    F.rock(s, 'LumpB', (6.0, 4.5, 3.0), 3.8, seed=59, subdiv=4, relief=0.3, terrace=0.0,
           material='stone')
    F.rock(s, 'LumpC', (1.0, -6.5, 4.2), 3.0, seed=71, subdiv=4, relief=0.3, terrace=0.0,
           material='stone.deep')

    # --- the seam: a real banded vein cut through the rock — a tilted plane crossing the
    # crown diagonally so the band reads continuously from the top at chase zoom ------------
    # dark fracture shoulders, then the ore band, then a thin warm glow line down its middle
    F.band(s, 'Core', (0, 2.1, 0.4), (0.0, 0.82, 0.57), 0.8, 'stone.deep')
    F.band(s, 'Core', (0, -2.1, -0.4), (0.0, 0.82, 0.57), 0.8, 'stone.deep')
    F.band(s, 'Core', (0, 0.0, 0.0), (0.0, 0.82, 0.57), 4.0, 'stone.vein', depth=-0.06)
    F.band(s, 'Core', (0, 0.0, 0.0), (0.0, 0.82, 0.57), 0.8, 'glow_warm')
    # the vein carries through the satellites it would cross — same plane family
    F.band(s, 'LumpB', (0, 0.0, 0.0), (0.0, 0.82, 0.57), 2.2, 'stone.vein')
    F.band(s, 'LumpA', (0, 0.0, 0.0), (0.0, 0.82, 0.57), 1.9, 'stone.vein')
    # one crossing stratum away from the seam so the body reads layered, not striped-in-one-axis
    F.band(s, 'Core', (0, 0.4, -4.2), (0.1, -0.06, 1.0), 1.0, 'stone.strata')
    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
