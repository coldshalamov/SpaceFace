"""MTS claim overlay for the Helios trade hub — the Meridian corporate halo. Forge rebuild of
the pre-Forge blockout var_station_trade_hub_mts_overlay_v01.glb (same file, same asset id).

Idea: "a corporate halo over the market". Meridian dresses the wheel it owns: a complete
elevated ring deck (the halo) carried above the rooftops on crown pylons and struts, six
stepped corporate crowns on the roofline — four on the diagonals with cantilevered outer
canopies, a gold gate arch across the harbour mouth standing on the breakwater heads, a keep
over the freight terminal — and four lit ad pylons at the courtyard rim. Lit panels carry NO
text (patternless glow faces).
Three values: pale Meridian gold coat, deep bronze secondary, gunmetal structure. Identity
colour: Meridian gold #F2B233, authored dark in bands and carried by the lit ad faces. Lights:
gold ad panels, warm halo markers, clearance lamps on the gate.
Overlay hangs on the hub frame (hub_overlay_kit): roofs at z ~28.2, ring wall r 54, breakwater
heads at +-18.4 deg carry the mouth arch's feet.
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402
import hub_overlay_kit as K  # noqa: E402

SHIP_ID = 'var_station_trade_hub_mts_overlay_v01'
COLORS = {
    'paint': '#8d815f',            # pale Meridian gold coat (#E8D8A0 lifted, authored dark)
    'paint2': '#54411c',           # deep bronze secondary
    'paint.graphite': '#23282e',
    'stripe': '#a8761e',           # Meridian gold #F2B233 carried in bands
    'hazard': '#a8861c',
    'dark': '#15181c',
    'glow_amber.mts': '#f2b233',   # lit ad-panel gold (no text, ever)
    'glow_warm': '#ffd9a0',
    'glow_red': '#ff3a2a',
    'glow_green': '#3dff7a',
}

HALO_Z = 42.2
HALO_R0, HALO_R1 = 66.5, 72.5
DIAGONALS = (45.0, 135.0, 225.0, 315.0)


def build_halo(s):
    """The elevated corporate ring deck: main slab, gunmetal under-truss ring, gold rim rails."""
    F.annulus(s, 'Halo', (K.CX, 0.0), HALO_R0, HALO_R1, HALO_Z, 1.5, material='paint',
              side_material='paint2', segments=44, bevel=0.0)
    F.annulus(s, 'HaloTruss', (K.CX, 0.0), HALO_R0 + 1.0, HALO_R1 - 1.0, HALO_Z - 1.1, 0.8,
              material='gunmetal', segments=32, bevel=0.0)
    F.annulus(s, 'HaloRim', (K.CX, 0.0), HALO_R1 - 0.6, HALO_R1, HALO_Z + 1.5, 0.45,
              material='stripe', segments=44, bevel=0.0)
    F.annulus(s, 'HaloWalk', (K.CX, 0.0), HALO_R0, HALO_R0 + 0.9, HALO_Z + 1.5, 0.45,
              material='paint2', segments=44, bevel=0.0)
    # warm marker lights under the outer rim — the halo reads as a ring of lights at night
    s.detail = 1
    marks = []
    for i in range(24):
        a = 7.5 + i * 15.0
        x, y, _ = K.polar(HALO_R1 - 0.4, a)
        marks.append(((x, y, HALO_Z - 0.35), (0.5, 0.5, 0.3), 0.0))
    F.boxes(s, 'HaloLights', marks, 'glow_warm')
    s.detail = 0


def halo_strut(s, k, a, z_from):
    """Slanted support from a crown/deck top up to the halo inner edge — nothing floats."""
    F.beams(s, f'HaloStrut{k}', [(K.polar(56.5, a, z_from), K.polar(HALO_R0 - 0.4, a, HALO_Z - 0.4))],
            1.1, material='gunmetal')


def build_crown(s, k, a):
    """Diagonal corporate crown: rooftop pylon, stepped cap, cantilevered outer canopy on
    tie-rods, gold band and lit face bars."""
    F.box(s, f'Crown{k}', K.polar(55.0, a, 31.8), (16.0, 14.0, 9.4), material='paint',
          rot_z=math.radians(a), bevel=0.18)
    F.band(s, f'Crown{k}', K.polar(55.0, a, 34.6), (0, 0, 1), 1.2, 'stripe', inset=0.05, depth=0.1)
    F.box(s, f'Crown{k}Cap', K.polar(56.5, a, 37.6), (12.0, 11.0, 3.4), material='paint2',
          rot_z=math.radians(a), bevel=0.1)
    # cantilevered canopy out over the rim, hung off the cap by tie-rods
    F.box(s, f'Crown{k}Canopy', K.polar(64.0, a, 36.2), (16.0, 10.0, 1.2), material='paint2',
          rot_z=math.radians(a), bevel=0.06)
    F.beams(s, f'Crown{k}Ties', [
        (K.polar(70.0, a - 4.0, 36.9), K.polar(57.0, a - 4.0, 39.4)),
        (K.polar(70.0, a + 4.0, 36.9), K.polar(57.0, a + 4.0, 39.4)),
    ], 0.45, material='gunmetal')
    # lit gold face bars on the cap's outward face
    for e in (-1, 1):
        F.box(s, f'Crown{k}Face{e:+d}', K.polar(62.7, a + e * 5.0, 37.6), (0.7, 3.4, 2.2),
              material='glow_amber.mts', rot_z=math.radians(a + e * 5.0), bevel=0.05)
    F.light(s, f'Crown{k}Edge0', K.polar(71.6, a - 5.0, 36.6), 'glow_warm', size=0.4)
    F.light(s, f'Crown{k}Edge1', K.polar(71.6, a + 5.0, 36.6), 'glow_warm', size=0.4)
    halo_strut(s, k, a, 39.4)


def build_mouth_crown(s):
    """The Meridian gate: an arch over the harbour mouth, feet on the breakwater heads."""
    for e in (-1, 1):
        a = e * 17.5
        F.box(s, f'GateFoot{e:+d}', K.polar(50.5, a, 32.6), (6.0, 5.0, 10.6), material='paint',
              rot_z=math.radians(a), bevel=0.2)
        F.band(s, f'GateFoot{e:+d}', K.polar(50.5, a, 36.6), (0, 0, 1), 0.9, 'stripe')
        F.light(s, f'GateNav{e:+d}', K.polar(51.5, a, 38.4),
                'glow_red' if e > 0 else 'glow_green', size=0.6)
    F.box(s, 'GateLintel', K.polar(50.5, 0.0, 39.0), (5.4, 34.0, 2.8), material='paint2',
          bevel=0.15)
    F.band(s, 'GateLintel', K.polar(50.5, 0.0, 39.0), (1, 0, 0), 1.2, 'stripe')
    # the big lit board facing the approach (+X): the syndicate's nameless golden billboard
    F.box(s, 'GateBoard', K.polar(53.4, 0.0, 39.0), (0.8, 26.0, 2.0), material='glow_amber.mts',
          bevel=0.05)
    # a cantilevered canopy forward of the lintel over the dock approach
    F.box(s, 'GateCanopy', K.polar(58.0, 0.0, 40.7), (9.0, 20.0, 0.9), material='paint2',
          bevel=0.05)
    F.beams(s, 'GateCanopyTies', [
        (K.polar(61.5, 0.0, 40.9), K.polar(51.0, -8.0, 40.4)),
        (K.polar(61.5, 0.0, 40.9), K.polar(51.0, 8.0, 40.4)),
    ], 0.4, material='gunmetal')
    halo_strut(s, 'M', 0.0, 40.2)


def build_terminal_crown(s):
    """Corporate keep over the freight terminal at -X."""
    F.box(s, 'TermCrown', (-49.0, 0.0, 30.6), (14.0, 22.0, 8.6), material='paint', bevel=0.25)
    F.band(s, 'TermCrown', (-49.0, 0.0, 33.4), (0, 0, 1), 1.1, 'stripe')
    F.box(s, 'TermCrownCap', (-49.0, 0.0, 36.6), (11.0, 17.0, 3.2), material='paint2', bevel=0.15)
    for e in (-1, 1):
        F.box(s, f'TermFace{e:+d}', (-49.0, e * 8.8, 36.4), (8.0, 0.7, 2.4),
              material='glow_amber.mts', bevel=0.05)
    F.light(s, 'TermCrownLamp', (-55.8, 0.0, 38.4), 'glow_warm', size=0.5)
    halo_strut(s, 'T', 180.0, 38.4)


def build_ad_pylon(s, k, a):
    """Lit billboard pylon on the courtyard rim — a gold glow face, no text, no bitmap."""
    base = K.polar(40.0, a)
    ca, sa = math.cos(math.radians(a)), math.sin(math.radians(a))
    tx, ty = -sa, ca  # tangential unit direction at this azimuth
    F.box(s, f'Ad{k}Foot', (base[0], base[1], 28.9), (5.2, 5.2, 1.8), material='paint2',
          rot_z=math.radians(a), bevel=0.08)
    F.truss(s, f'Ad{k}Mast', (base[0], base[1], 29.6), (base[0], base[1], 39.6), 2.3, 5,
            material='gunmetal', chord=0.4, web=0.22)
    # the board: a framed lit slab facing outward, tilting a little toward the sky camera
    c = K.polar(40.0, a, 42.4)
    F.box(s, f'Ad{k}Board', c, (1.1, 13.0, 9.4), material='paint2', rot_z=math.radians(a),
          bevel=0.1)
    F.box(s, f'Ad{k}Face', K.polar(40.6, a, 42.4), (0.5, 11.6, 8.0), material='glow_amber.mts',
          rot_z=math.radians(a), bevel=0.0)
    F.box(s, f'Ad{k}FaceB', K.polar(39.4, a, 42.4), (0.5, 11.6, 8.0), material='glow_amber.mts',
          rot_z=math.radians(a), bevel=0.0)
    # tripod bracing so the board visibly hangs on the mast: knee braces from the foot to the
    # board's lower corners plus spreader arms into its back corners
    F.beams(s, f'Ad{k}Knees', [
        ((base[0] + tx * 3.6, base[1] + ty * 3.6, 29.6),
         (base[0] + tx * 5.0 - ca * 0.6, base[1] + ty * 5.0 - sa * 0.6, 38.2)),
        ((base[0] - tx * 3.6, base[1] - ty * 3.6, 29.6),
         (base[0] - tx * 5.0 - ca * 0.6, base[1] - ty * 5.0 - sa * 0.6, 38.2)),
    ], 0.6, material='gunmetal')
    F.beams(s, f'Ad{k}Arms', [
        ((base[0], base[1], 39.2), (base[0] + tx * 5.6, base[1] + ty * 5.6, 41.6)),
        ((base[0], base[1], 39.2), (base[0] - tx * 5.6, base[1] - ty * 5.6, 41.6)),
    ], 0.7, material='gunmetal')
    F.box(s, f'Ad{k}Rail', K.polar(40.0, a, 47.4), (1.4, 13.6, 0.7), material='stripe',
          rot_z=math.radians(a), bevel=0.05)
    F.light(s, f'Ad{k}Under', K.polar(40.0, a, 37.6), 'glow_warm', size=0.4)


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)
    build_halo(s)
    for k, a in enumerate(DIAGONALS):
        build_crown(s, k, a)
    build_mouth_crown(s)
    build_terminal_crown(s)
    # two plain mid-arc pylons where no crown stands carry the halo at 90/270
    for e in (1, -1):
        a = 90.0 * e
        F.box(s, f'HaloPost{e:+d}', K.polar(60.0, a, 34.9), (3.2, 3.2, 14.2), material='paint',
              bevel=0.15)
        F.band(s, f'HaloPost{e:+d}', K.polar(60.0, a, 39.6), (0, 0, 1), 0.8, 'stripe')
        F.beams(s, f'HaloBrace{e:+d}',
                [(K.polar(52.0, a, 28.3), K.polar(60.0, a, 36.0))], 0.9, material='gunmetal')
        halo_strut(s, f'P{e:+d}', a, 41.9)
    for k, a in enumerate((38.0, 142.0, 218.0, 322.0)):
        build_ad_pylon(s, k, a)
    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
