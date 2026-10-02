"""Interdiction buoy (place_interdiction_buoy) — Forge rebuild.

Idea: "the field marshal's fist". A squat Concord authority buoy: an octagonal drum hull
with graphite banding, a caged emitter crown on four struts (SOCKET_Field_Emitter lives
there), hazard cheek panels, and a slow red authority strobe. Reads from above as a drum
with an X of struts and a lit crown.
Live bounds (Blender): x +-3.7, y +-3.2, z -2.2..2.74 — pivot near centre.
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402
import forge_export as E  # noqa: E402
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'animations'))
import ANI_33  # noqa: E402

SHIP_ID = 'place_interdiction_buoy'
COLORS = {
    'paint': '#8f8674',
    'paint2': '#3a3f45',
    'paint2.navy': '#2b3140',
    'gunmetal.navy': '#232c38',      # metal navy — dielectric tops go pale under the env
    'gunmetal': '#23282e',
    'dark': '#101418',
    'hazard': '#8a7418',
    'glow_cyan': '#5fd8e0',
    'glow_warm': '#ffdba6',
    'glow_amber': '#ffb345',
    'glow_red': '#ff3a2a',
}


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)

    # --- octagonal drum hull ------------------------------------------------------------------
    # Metal-navy drum: a dielectric cap face lifts to pale under the warm env no matter the
    # albedo, so the drum wears a metallic finish and keeps the authority colour in its tint.
    F.cylinder(s, 'Drum', (0, 0, -1.5), (0, 0, 1.0), 3.1, material='gunmetal.navy', segments=8,
               bevel=0.12)
    F.cylinder(s, 'DrumBelt', (0, 0, -0.5), (0, 0, 0.1), 3.24, material='gunmetal',
               segments=8, bevel=0.03)
    # dark deck plate on the drum top so the crown isn't standing on bare drum
    # Identity trim, lit: one thin cyan ring round the belt, so the authority buoy reads as a lit
    # octagon before its strobe (LOOK.md: lamps are light). No new material.
    F.band(s, 'DrumBelt', (0, 0, -0.2), (0, 0, 1), 0.16, 'glow_cyan', inset=0.01, depth=-0.02)
    F.cylinder(s, 'DrumDeck', (0, 0, 1.0), (0, 0, 1.35), 2.6, material='dark', segments=8,
               bevel=0.04)
    # hazard cheek panels on two flats
    for e in (-1, 1):
        F.box(s, f'Cheek{e:+d}', (0, e * 3.0, -0.4), (2.2, 0.3, 1.6), material='hazard',
              bevel=0.03)
    # keel ballast + graphite undertray
    F.cylinder(s, 'Keel', (0, 0, -2.2), (0, 0, -1.4), 1.6, material='gunmetal', segments=8,
               bevel=0.08)
    F.box(s, 'Undertray', (0, 0, -1.7), (4.4, 4.4, 0.4), material='dark', bevel=0.05)

    # --- emitter cage: four struts lifting a crown ring ----------------------------------------
    for k in range(4):
        a = math.radians(45 + k * 90)
        x, y = math.cos(a), math.sin(a)
        F.beams(s, f'Cage{k}', [((x * 2.4, y * 2.4, 0.8), (x * 1.2, y * 1.2, 2.5))], 0.35,
                material='paint2')
    F.ring(s, 'EmitterRing', (0, 0, 2.55), 1.7, 0.28, axis=(0, 0, 1), material='paint2',
           segments=16, sides=8)
    F.cylinder(s, 'EmitterCore', (0, 0, 1.4), (0, 0, 2.6), 0.7, material='gunmetal',
               segments=10, bevel=0.05)
    # the authority read: a red strobe crown over cyan emitter slits
    s.detail = 1
    for i in range(4):
        a = math.radians(45 + i * 90)
        F.box(s, f'EmitterSlit{i}', (math.cos(a) * 1.2, math.sin(a) * 1.2, 2.2),
              (0.5, 0.14, 0.5), material='glow_cyan', rot_z=a, bevel=0.0)
    s.detail = 0
    F.beacon(s, 'AuthorityStrobe', (0, 0, 2.42), 'glow_red', size=0.3)
    # --- ANI-33 iris petals: six deck plates hinged on the crown rim ---------------------------
    petals = []
    for k in range(6):
        a = math.radians(k * 60)
        petals.append(F.box(s, f'SnarePetal{k}', (2.05 * math.cos(a), 2.05 * math.sin(a), 2.0),
                            (0.2, 1.1, 1.4), material='paint2', bevel=0.02, rot_z=a))
    # corner nav dots on the drum flats
    for k in range(4):
        a = math.radians(k * 90)
        F.light(s, f'NavDot{k}', (math.cos(a) * 3.05, math.sin(a) * 3.05, 0.4),
                'glow_amber', size=0.2)
    _o = {o.name: o for o in s.objects}
    core = [o for o in s.objects if o.name in
            ('EmitterCore', 'EmitterRing', 'EmitterSlit0', 'EmitterSlit1',
             'EmitterSlit2', 'EmitterSlit3')]
    s.ani33_bank = ANI_33.build(s, {'petals': petals, 'core': core},
                                source_asset_id=E.fleet_spec(SHIP_ID)['asset_id'])
    return s


if __name__ == '__main__':
    ship = build().finish()
    live = '--live' in sys.argv
    written = E.export_ship(ship, E.fleet_spec(SHIP_ID), preview=not live)
    if live:
        ship.ani33_bank.bake([path for path, _tris in written],
                             out_path=os.path.join(ANI_33.motion_bank.MOTIONS_DIR,
                                                   'interdiction-buoy.motion.json'))
