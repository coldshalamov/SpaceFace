"""Shared kit for the shipworks dock interiors (place_dock_interior*).

One interior language across the three variants: a hangar bay seen by the shipworks camera
from front-left-above (glTF camera octant is -X / +Y / +Z => Blender -X / +Z / -Y), so the
bay is walled on the BACK (+Y Blender) and RIGHT (+X) sides only and open on -X / -Y. The
ship parks on the deck centred under its own bounds; deck surface sits at the live
floorLocalY = -3.44 (glTF Y -> Blender Z). Live bounds ~ x +-26, z -3.44..13.8, y +-18.

Variants: 'standard' (navy/graphite working bay), 'grit' (patched civilian yard — rust
plates, more lamps, crates), 'military' (clean armoured bay — navy band, red/white deck
lines). Sockets (SOCKET_Structure_Core) and previewMount metadata are copied live by the
exporter; all three ship files export LOD0-only (the preview mounts every primitive).
"""
import math

import forge as F  # noqa: E402  (imported after the ship file inserts the forge dir)

FLOOR_Z = -3.44          # live previewMount floorLocalY — the deck walking surface
WALL_X = 23.0            # right-hand wall plane (+x glTF)
WALL_Y = 15.0            # back wall plane (-z glTF)
BAY_X, BAY_Y = 26.0, 18.0

BASE_COLORS = {
    'paint': '#8f8674',
    'paint2': '#33383f',         # graphite structure
    'paint.aged': '#6e685c',
    'paint.deck': '#2a2e34',     # dark deck
    'paint.navy': '#2b3140',
    'stripe': '#8a5a1c',
    'paint.line_red': '#8a2f24',
    'paint.line_white': '#b8b2a4',
    'deadmetal.rust': '#4e3423',
    'deadmetal': '#23211e',
    'gunmetal': '#2e3339',
    'dark': '#14171b',
    'ceramic': '#6c6660',
    'hazard': '#8a7418',
    'glass': '#0f2a3a',
    'glow_warm': '#ffc27a',
    'glow_amber': '#e09a2e',
    'glow_cyan': '#4fd8e8',
    'glow_red': '#ff3a2a',
    'glow_green': '#3dff7a',
}

GRIT_COLORS = dict(BASE_COLORS, **{
    'paint.deck': '#262a2e',
    'paint2': '#2e3237',
    'stripe': '#7a5a20',
})

MIL_COLORS = dict(BASE_COLORS, **{
    'paint.deck': '#2e3238',
    'paint2': '#363c46',
    'stripe': '#3a4a66',         # navy band identity
})


def _deck(s, variant):
    """Deck slab + landing markings + tie-down gear. The ship is centred on its own bounds,
    so the pad sits at the origin."""
    F.box(s, 'Deck', (0, 0, FLOOR_Z - 0.5), (52.0, 36.0, 1.0), material='paint.deck',
          bevel=0.04)
    # recessed darker deck-panel grid breaks the slab
    s.detail = 1
    for ix in range(-3, 4):
        for iy in range(-2, 3):
            if (ix * 7 + iy * 5) % 3 == 0:
                continue
            F.box(s, f'DeckPanel{ix}_{iy}', (ix * 6.4, iy * 6.0, FLOOR_Z + 0.02),
                  (5.6, 5.2, 0.08), material='dark', bevel=0.0)
    s.detail = 0
    # landing pad: a lit ring + centre bars + corner ticks — small emissive markings
    F.ring(s, 'PadRing', (0, 0, FLOOR_Z + 0.08), 7.2, 0.32, axis=(0, 0, 1),
           material='glow_warm', segments=36, sides=6)
    for e in (-1, 1):
        F.box(s, f'PadBar{e:+d}', (e * 1.6, 0, FLOOR_Z + 0.06), (1.0, 6.0, 0.08),
              material='paint.line_white', bevel=0.0)
        F.box(s, f'PadTick{e:+d}', (e * 8.6, 0, FLOOR_Z + 0.07), (2.2, 0.5, 0.08),
              material='hazard', bevel=0.0)
    s.detail = 1
    for i in range(8):
        a = math.radians(i * 45 + 22.5)
        F.box(s, f'PadMark{i}', (math.cos(a) * 8.4, math.sin(a) * 8.4, FLOOR_Z + 0.07),
              (1.2, 0.4, 0.08), material='stripe', bevel=0.0, rot_z=a + math.pi / 2)
    s.detail = 0
    # guide lanes: two stripes running the deck's length past the pad
    if variant == 'military':
        for e in (-1, 1):
            F.box(s, f'LaneRed{e:+d}', (0, e * 10.5, FLOOR_Z + 0.06), (44.0, 0.5, 0.08),
                  material='paint.line_red', bevel=0.0)
            F.box(s, f'LaneWhite{e:+d}', (0, e * 11.4, FLOOR_Z + 0.06), (44.0, 0.35, 0.08),
                  material='paint.line_white', bevel=0.0)
    else:
        for e in (-1, 1):
            F.box(s, f'Lane{e:+d}', (0, e * 10.5, FLOOR_Z + 0.06), (44.0, 0.45, 0.08),
                  material='stripe', bevel=0.0)
    # ship cradle: low clamp jaws either side of the pad. They must stay flatter than the
    # minimum ship floor clearance (0.45) or they occlude hull vertices in the preview.
    for e in (-1, 1):
        F.box(s, f'CradleArm{e:+d}', (e * 5.2, -1.0, FLOOR_Z + 0.15), (1.6, 4.0, 0.3),
              material='paint2', bevel=0.04, taper=0.85)
        F.box(s, f'CradlePad{e:+d}', (e * 4.4, -1.0, FLOOR_Z + 0.28), (0.5, 3.0, 0.22),
              material='dark', bevel=0.02)
    # tie-down bollards along the deck edges
    s.detail = 1
    for i, bx in enumerate((-20.0, -10.0, 10.0, 20.0)):
        for e in (-1, 1):
            F.box(s, f'Bollard{i}{e:+d}', (bx, e * 15.2, FLOOR_Z + 0.5), (0.9, 0.9, 1.0),
                  material='gunmetal', bevel=0.06)
    s.detail = 0


def _back_wall(s, variant):
    """The tall back wall (+Y Blender): panelled face, window band, service doors, buttress
    ribs, signal lights."""
    F.box(s, 'WallBack', (0, WALL_Y + 1.4, 4.6), (52.0, 3.0, 17.0), material='paint2',
          bevel=0.1)
    # buttress ribs across the face
    s.detail = 1
    for i, bx in enumerate((-22.0, -14.0, -6.0, 6.0, 14.0, 22.0)):
        F.box(s, f'Rib{i}', (bx, WALL_Y - 0.15, 4.0), (1.6, 1.2, 15.0), material='paint2',
              bevel=0.06, taper=0.85)
    s.detail = 0
    # window band — the lit gallery strip across the wall
    s.detail = 1
    for i in range(12):
        F.box(s, f'Gallery{i}', (-21.0 + i * 3.8, WALL_Y - 0.35, 9.4), (2.4, 0.5, 1.1),
              material='glow_warm', bevel=0.0)
    s.detail = 0
    # big bay door at centre with a hazard kerb
    F.box(s, 'BayDoor', (0, WALL_Y - 0.3, 0.6), (12.0, 0.7, 8.0), material='gunmetal',
          bevel=0.05)
    s.detail = 1
    for i in range(6):
        F.box(s, f'DoorRib{i}', (0, WALL_Y - 0.7, -1.8 + i * 1.5), (11.4, 0.12, 0.3),
              material='dark', bevel=0.0)
    s.detail = 0
    for e in (-1, 1):
        F.box(s, f'DoorKerb{e:+d}', (e * 6.4, WALL_Y - 0.35, 0.6), (0.6, 0.5, 8.4),
              material='hazard', bevel=0.0)
        F.light(s, f'DoorLamp{e:+d}', (e * 6.4, WALL_Y - 0.8, 5.4), 'glow_amber', size=0.4)
    # top cornice + signal beacons
    F.box(s, 'Cornice', (0, WALL_Y - 0.2, 12.9), (52.0, 1.4, 1.2), material='paint.aged',
          bevel=0.06)
    F.beacon(s, 'WallBeaconL', (-24.0, WALL_Y - 0.6, 13.6), finish='glow_red', size=0.4)
    F.beacon(s, 'WallBeaconR', (24.0, WALL_Y - 0.6, 13.6), finish='glow_red', size=0.4)


def _right_wall(s, variant):
    """The right-hand wall (+x): lower service wall with columns, tool bays, rack frames."""
    F.box(s, 'WallRight', (WALL_X + 1.2, 4.0, 2.6), (3.0, 24.0, 12.0), material='paint2',
          bevel=0.1)
    # columns standing off the face
    for i, by in enumerate((-6.0, 0.0, 6.0, 12.0)):
        F.box(s, f'Col{i}', (WALL_X - 0.4, by, 2.0), (1.4, 1.6, 11.0), material='paint2',
              bevel=0.06, taper=0.9)
    # tool racks + cabinets on the wall foot
    for i, (by, mat) in enumerate(((-8.0, 'paint.aged'), (-4.0, 'gunmetal'),
                                   (2.0, 'paint.aged'), (8.5, 'gunmetal'),
                                   (11.5, 'paint2'))):
        F.box(s, f'Rack{i}', (WALL_X - 1.0, by, FLOOR_Z + 1.6), (1.6, 3.0, 3.2),
              material=mat, bevel=0.05)
        F.box(s, f'RackFace{i}', (WALL_X - 1.85, by, FLOOR_Z + 1.7), (0.1, 2.6, 2.4),
              material='dark', bevel=0.0)
        F.light(s, f'RackLamp{i}', (WALL_X - 1.9, by, FLOOR_Z + 3.4), 'glow_warm', size=0.25)
    # upper window strip on the right wall
    s.detail = 1
    for i in range(5):
        F.box(s, f'RWGallery{i}', (WALL_X - 0.35, -6.0 + i * 4.4, 6.6), (0.5, 2.6, 1.0),
              material='glow_warm', bevel=0.0)
    s.detail = 0


def _gantry(s, variant):
    """Gantry crane running along the back wall — rails + bridge + trolley + hook, all
    tucked to y > +9 so it stays behind the parked ship from the preview camera."""
    for e in (-1, 1):
        F.box(s, f'CraneRail{e:+d}', (e * 17.0, 12.5, FLOOR_Z + 6.4), (1.2, 4.0, 12.8),
              material='paint2', bevel=0.06)
    F.box(s, 'CraneRailBar', (0, 12.5, 8.9), (36.0, 1.4, 0.8), material='paint2',
          bevel=0.05)
    F.truss(s, 'CraneBridge', (-16.0, 11.8, 8.6), (16.0, 11.8, 8.6), 1.6, 10,
            material='gunmetal', chord=0.4, web=0.22)
    F.box(s, 'CraneTrolley', (-3.0, 11.8, 7.9), (2.6, 2.0, 1.4), material='paint.aged',
          bevel=0.08)
    F.cylinder(s, 'CraneCable', (-3.0, 11.8, 7.4), (-3.0, 11.8, 3.6), 0.08,
               material='dark', segments=6)
    F.box(s, 'CraneHook', (-3.0, 11.8, 3.2), (0.9, 0.9, 0.8), material='gunmetal',
          bevel=0.05)
    for e in (-1, 1):
        F.light(s, f'CraneLamp{e:+d}', (e * 16.0, 11.8, 8.4), 'glow_amber', size=0.3)


def _front_trim(s, variant):
    """Low kerbs on the OPEN sides (-x, -y): just enough to frame the bay floor without
    ever standing between the shipworks camera and the hull."""
    F.box(s, 'KerbFront', (0, -BAY_Y + 0.4, FLOOR_Z + 0.45), (52.0, 0.8, 0.9),
          material='paint2', bevel=0.04)
    F.box(s, 'KerbLeft', (-BAY_X + 0.4, 0, FLOOR_Z + 0.45), (0.8, 36.0, 0.9),
          material='paint2', bevel=0.04)
    s.detail = 1
    for i in range(6):
        F.light(s, f'KerbLampF{i}', (-20.0 + i * 8.0, -BAY_Y + 0.2, FLOOR_Z + 1.0),
                'glow_cyan', size=0.22)
    for i in range(4):
        F.light(s, f'KerbLampL{i}', (-BAY_X + 0.2, -12.0 + i * 8.0, FLOOR_Z + 1.0),
                'glow_cyan', size=0.22)
    s.detail = 0


def _variant_dressing(s, variant):
    if variant == 'grit':
        # patched plates welded over the deck + wall, rust streaks, extra clutter
        s.detail = 1
        for i, (px, py, w, h) in enumerate(((-8.0, -6.0, 5.0, 4.0), (9.0, 8.0, 4.0, 3.0),
                                            (14.0, -8.0, 3.4, 3.0), (-16.0, 4.0, 4.4, 3.6))):
            F.box(s, f'Patch{i}', (px, py, FLOOR_Z + 0.05), (w, h, 0.1),
                  material='deadmetal.rust', bevel=0.02, rot_z=0.1 * (i - 1.5))
        s.detail = 0
        for i, (wx, wz, wh) in enumerate(((-18.0, 4.0, 6.0), (12.0, 6.5, 4.5))):
            F.box(s, f'WallPatch{i}', (wx, WALL_Y - 0.35, wz), (3.4, 0.35, wh),
                  material='deadmetal.rust', bevel=0.03)
        # yard clutter: crates + a parked tug cart on the open apron
        for i, (cx, cy, mat) in enumerate(((-16.0, -10.0, 'paint.aged'),
                                          (-14.2, -11.6, 'gunmetal'),
                                          (-15.4, -8.6, 'deadmetal.rust'),
                                          (17.0, -12.0, 'paint.aged'))):
            F.box(s, f'Crate{i}', (cx, cy, FLOOR_Z + 1.0), (2.2, 2.0, 2.0), material=mat,
                  bevel=0.06)
        F.box(s, 'Tug', (-18.0, -4.0, FLOOR_Z + 0.9), (3.2, 1.8, 1.8), material='paint2',
              bevel=0.15)
        # extra strung work lamps — cheap yard lighting
        for i, lx in enumerate((-14.0, -4.0, 6.0)):
            F.work_lamp(s, f'YardLamp{i}', (lx, -BAY_Y + 2.5, FLOOR_Z + 3.4),
                        aim=(0.1, 0.5, -0.4), size=0.45, lens='glow_warm')
    elif variant == 'military':
        # armoured shutter band along the walls + clean readiness strips
        F.box(s, 'NavyBand', (0, WALL_Y - 0.42, 11.2), (52.0, 0.4, 1.6),
              material='paint.navy', bevel=0.0)
        F.box(s, 'NavyBandR', (WALL_X - 0.35, 4.0, 10.6), (0.4, 24.0, 1.4),
              material='paint.navy', bevel=0.0)
        # readiness boards: lit status columns by the bay door
        for e in (-1, 1):
            F.box(s, f'ReadyBoard{e:+d}', (e * 8.4, WALL_Y - 0.5, 7.2), (1.0, 0.5, 3.0),
                  material='paint.navy', bevel=0.04)
            for i in range(3):
                F.box(s, f'ReadyLamp{e:+d}{i}', (e * 8.4, WALL_Y - 0.78,
                                                 6.3 + i * 0.9), (0.6, 0.12, 0.4),
                      material='glow_green' if i < 2 else 'glow_red', bevel=0.0)
        # honour-guard stanchions beside the pad
        s.detail = 1
        for e in (-1, 1):
            for i in range(4):
                F.cylinder(s, f'Stan{e:+d}{i}', (e * 10.6, -8.0 + i * 5.0, FLOOR_Z),
                           (e * 10.6, -8.0 + i * 5.0, FLOOR_Z + 1.1), 0.08,
                           material='gunmetal', segments=6)
        s.detail = 0
    else:
        # standard: a couple of service carts + a fuel boom parked along the right side
        for i, (cx, cy) in enumerate(((16.0, -8.0), (18.0, -4.0))):
            F.box(s, f'Cart{i}', (cx, cy, FLOOR_Z + 0.8), (2.0, 1.4, 1.6),
                  material='paint.aged', bevel=0.08)
        F.cylinder(s, 'FuelBoom', (20.0, -2.0, FLOOR_Z + 2.2), (14.0, -2.0, FLOOR_Z + 4.2),
                   0.22, material='gunmetal', segments=8)


def build_hangar(s, variant='standard'):
    _deck(s, variant)
    _back_wall(s, variant)
    _right_wall(s, variant)
    _gantry(s, variant)
    _front_trim(s, variant)
    _variant_dressing(s, variant)
    return s
