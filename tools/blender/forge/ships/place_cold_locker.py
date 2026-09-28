"""Cold locker — "Bonded Cold Locker", the squat bonded freezer block at the Helios bays.
Forge rebuild of place_cold_locker.glb (same file, same asset id).

Idea: "a freezer chest, not a tower". From above the read is a wide pale slab with a dark
seal seam around its middle — a squat insulated locker, twice as wide as it is tall, skinned
in frost-white ceramic panels, wearing a bonded seal band round its waist, with cyan status
lights down the seal and a customs lock on the lid. Four feet, a vent stack at one end, and
the bond ring the bay's tie-downs catch.
Three values: frost-pale ceramic skin, charcoal feet and machinery, dark recesses. Identity
colour: cold cyan in the status run; the seal band is bonded-ochre. Lights: the cyan status
run and one amber customs lamp.
Live bounds (Blender): x [-3.1, 3.1], y [-3.1, 3.1], z [-0.8, 20.1] — the live body was a
tower; the bond block is squat and wide inside the same footprint, scaled up in place.
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402

SHIP_ID = 'place_cold_locker'
COLORS = {
    'paint': '#5e6058',       # cabinet coat under the panels
    'paint2': '#33383e',
    'stripe': '#1c5552',
    'gunmetal': '#23282e',
    'dark': '#0e1216',
    'ceramic': '#7e8a8c',     # frost-white insulated panels (authored dark)
    'ceramic.dim': '#5a6466',
    'hazard': '#7a6218',      # the bonded seal band
    'glow_cyan': '#6ee7e0',
    'glow_amber': '#ffb345',
}


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)

    W, D, H = 9.2, 6.8, 4.6   # wide, deep, squat

    # === the insulated body: skin core + proud ceramic panels ========================
    F.box(s, 'Core', (0, 0, H / 2), (W, D, H), material='paint', bevel=0.2)
    # frost-white insulation panels — layered slabs on every face, gapped like tiles
    for e in (-1, 1):
        # flank panels in a 3x1 grid
        for i in range(3):
            x = -W / 2 + 0.9 + i * (W - 1.8) / 2
            F.box(s, f'Panel{e:+d}{i}', (x, e * (D / 2 + 0.12), H / 2),
                  ((W - 2.4) / 3, 0.22, H - 0.9), material='ceramic', bevel=0.06)
        # lid panels
        for i in range(3):
            x = -W / 2 + 0.9 + i * (W - 1.8) / 2
            F.box(s, f'LidPanel{i}', (x, 0, H + 0.14),
                  ((W - 2.4) / 3, D - 1.2, 0.28), material='ceramic.dim', bevel=0.05)
    # recessed dark seams between the panel columns — the tile gaps read
    s.detail = 1
    seams = []
    for e in (-1, 1):
        for i in range(2):
            x = -W / 2 + 0.9 + (i + 0.5) * (W - 1.8) / 2 - (W - 1.8) / 6 + (W - 2.4) / 6
            seams.append(((x, e * (D / 2 + 0.05), H / 2), (0.3, 0.14, H - 0.6), 0.0))
    F.boxes(s, 'Seams', seams, 'dark')
    s.detail = 0

    # === the bonded seal band around the waist — a customs strap ======================
    F.box(s, 'SealBandA', (0, -D / 2 - 0.22, H * 0.55), (W + 0.3, 0.3, 0.9), material='hazard',
          bevel=0.04)
    F.box(s, 'SealBandB', (0, D / 2 + 0.22, H * 0.55), (W + 0.3, 0.3, 0.9), material='hazard',
          bevel=0.04)
    for e in (-1, 1):
        F.box(s, f'SealEnd{e:+d}', (e * (W / 2 + 0.22), 0, H * 0.55), (0.3, D + 0.3, 0.9),
              material='hazard', bevel=0.04)
    # the cyan status run along the seal — a row of small cold lights
    s.detail = 1
    stat = []
    for i in range(6):
        x = -W / 2 + 0.8 + i * (W - 1.6) / 5
        stat.append(((x, -D / 2 - 0.42, H * 0.55), (0.22, 0.1, 0.3), 0.0))
    F.boxes(s, 'StatusRun', stat, 'glow_cyan')
    s.detail = 0
    # the customs lock on the lid — a sealed clasp box with one amber lamp
    F.box(s, 'Lock', (1.8, -1.0, H + 0.35), (1.6, 1.4, 0.7), material='gunmetal', bevel=0.08)
    F.band(s, 'Lock', (1.8, -1.0, H + 0.4), (0, 0, 1), 0.3, 'hazard')
    F.light(s, 'LockLamp', (1.8, -1.75, H + 0.4), 'glow_amber', size=0.22)

    # === feet, vent stack, bond ring ================================================
    for sx in (-1, 1):
        for sy in (-1, 1):
            F.box(s, f'Foot{sx}{sy}', (sx * (W / 2 - 0.7), sy * (D / 2 - 0.7), -0.45),
                  (1.2, 1.2, 0.9), material='paint2', bevel=0.08)
    # vent stack + compressor block at the +X end
    F.box(s, 'Compressor', (W / 2 - 1.2, 1.6, H + 0.3), (2.0, 1.8, 0.9), material='paint2',
          bevel=0.08)
    F.cylinder(s, 'VentStack', (W / 2 - 1.2, 1.6, H + 0.6), (W / 2 - 1.2, 1.6, H + 2.2), 0.55,
               material='gunmetal', segments=10, bevel=0.04)
    F.ring(s, 'VentBand', (W / 2 - 1.2, 1.6, H + 1.6), 0.58, 0.12, axis=(0, 0, 1),
           material='hazard', segments=10, sides=5)
    # the bond ring the tie-downs catch — a low apron under the block
    F.ring(s, 'BondRing', (0, 0, -0.4), 3.4, 0.4, axis=(0, 0, 1), material='paint2',
           segments=16, sides=8)
    for i in range(4):
        a = math.radians(45 + i * 90)
        F.box(s, f'BondTab{i}', (3.3 * math.cos(a), 3.3 * math.sin(a), -0.25),
              (0.5, 0.5, 0.6), material='hazard', bevel=0.04, rot_z=a)

    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
