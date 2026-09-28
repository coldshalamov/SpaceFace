"""Slurry tank (place_slurry_tank) — Forge rebuild.

Idea: "the wet store". Three spherical slurry tanks in a cradle frame, hazard-banded end
caps, an insulated downpipe manifold underneath, a valve platform between the tanks with a
work lamp. Compact and squat — reads as three pressure bulbs in a rack.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402
import claim_outpost_kit as K  # noqa: E402

SHIP_ID = 'place_slurry_tank'
COLORS = dict(K.COLORS, **{
    # slurry domes: opaque warm-grey — on a METALLIC finish so the sector env can't lift a
    # dielectric dome to pale glass (white F0 spec floor); full metal, albedo-tinted env,
    # matte roughness — the tank stays a solid mid-value pressure vessel, not a greenhouse.
    'deadmetal.dome': '#6e675a',
})


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)

    # --- cradle frame: base skid + rib arcs under the tanks ----------------------------------------
    F.box(s, 'Skid', (0, 0, 0.5), (10.4, 4.0, 1.0), material='paint2', bevel=0.06)
    for k, tx in enumerate((-3.4, 0.0, 3.4)):
        # rib saddles front and back of each sphere
        for e in (-1, 1):
            F.box(s, f'Rib{k}{e:+d}', (tx, e * 1.7, 1.7), (1.4, 0.5, 2.6),
                  material='paint2', bevel=0.05, taper=0.7)
        # the pressure sphere
        F.sphere(s, f'Tank{k}', (tx, 0, 3.4), 2.05, material='deadmetal.dome', segments=22)
        # graphite banding off-equator + ONE narrow hazard ring at the equator
        for e in (-1, 1):
            F.cylinder(s, f'TankGraphite{k}{e:+d}', (tx, e * 1.35, 3.4),
                       (tx, e * 1.5, 3.4), 1.92, material='paint2', segments=20)
        F.cylinder(s, f'TankBand{k}', (tx, -0.18, 3.4), (tx, 0.18, 3.4), 2.12,
                   material='hazard', segments=20)
        # valve bonnet on top
        F.cylinder(s, f'Valve{k}', (tx, 0, 5.3), (tx, 0, 6.0), 0.3, material='gunmetal',
                   segments=8)
        F.light(s, f'ValveLamp{k}', (tx, 0, 6.2), 'glow_amber', size=0.28)

    # --- end caps with hazard paint ------------------------------------------------------------------
    for k, ex in enumerate((-5.0, 5.0)):
        F.box(s, f'EndCap{k}', (ex, 0, 2.2), (0.7, 3.6, 3.4), material='paint2',
              bevel=0.08)
        F.box(s, f'EndHaz{k}', (ex, 0, 3.6), (0.76, 3.7, 0.5), material='hazard',
              bevel=0.0)

    # --- downpipe manifold under the tanks --------------------------------------------------------------
    F.cylinder(s, 'DownMain', (-4.6, 1.9, 1.1), (4.6, 1.9, 1.1), 0.28, material='gunmetal',
               segments=10)
    for k, tx in enumerate((-3.4, 0.0, 3.4)):
        F.cylinder(s, f'Down{k}', (tx, 1.9, 1.1), (tx, 1.0, 2.0), 0.2, material='gunmetal',
                   segments=8)

    # --- valve platform between tanks B and C ------------------------------------------------------------
    F.box(s, 'ValveDeck', (1.7, -1.9, 4.2), (4.0, 1.4, 0.3), material='paint.aged',
          bevel=0.03)
    for k in range(3):
        F.cylinder(s, f'Rail{k}', (0.2 + k * 1.5, -2.4, 4.3), (0.2 + k * 1.5, -2.4, 5.1),
                   0.06, material='paint2', segments=6)
    F.work_lamp(s, 'DeckLamp', (1.7, -2.2, 5.4), aim=(0, 0.5, -0.7), size=0.4,
                lens='glow_warm')
    F.beacon(s, 'Strobe', (-5.0, 0, 4.3), finish='glow_red', size=0.35)
    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
