"""Ash pin — "Ash Pin — SPAN-HOLD", the burnt hold marker of a lost Span hauler.
Forge rebuild of place_ash_pin.glb (same file, same asset id).

Idea: "a scorch mark that kept its name". A charred hex plate sunk low on stub feet — the
hold marker's silhouette — carrying a stub of scorched mast, the hull's torn registry plate
welded beside it, and one weak ember-orange lamp that never went out. Everything is dark:
the plate is scorched metal, the mast charcoal, the only pale thing is the ash-grey splash
where the wreck burned.
Three values: scorched dark plate and mast, charcoal feet, pale ash splash (the one mid
value). Identity colour: none — one ember lamp only. Lights: the single weak ember.
Live bounds (Blender): x [-1.7, 1.7], y [-1.7, 1.7], z [-0.1, 3.7].
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402

SHIP_ID = 'place_ash_pin'
COLORS = {
    'deadmetal': '#0f0d0b',      # scorched plate — stays dark under the env wash
    'deadmetal.deep': '#0b0d10',
    'paint2': '#33373c',         # ash splash — pale grey where the wreck burned
    'gunmetal': '#1c2024',
    'dark': '#0b0d0e',
    'bare': '#3a352c',           # burnt bare metal at the tear
    'hazard': '#3a3010',
    'glow_amber': '#c2681a',     # the one weak ember
}


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)

    # === the charred plate: a low hex slab, edge chipped ============================
    F.cylinder(s, 'Plate', (0, 0, 0.0), (0, 0, 0.55), 3.1, material='deadmetal', segments=6,
               bevel=0.1)
    # the pale ash splash — a flat grey patch where the wreck lay
    F.plate(s, 'AshSplash', [(-1.2, -0.9), (0.4, -1.4), (1.6, -0.2), (1.1, 1.0), (-0.6, 1.2),
                             (-1.5, 0.3)], 0.58, 0.1, material='paint2', chamfer=0.15)
    # four stub feet under the plate
    for i in range(4):
        a = math.radians(45 + i * 90)
        x, y = 2.4 * math.cos(a), 2.4 * math.sin(a)
        F.box(s, f'Foot{i}', (x, y, -0.15), (0.7, 0.7, 0.6), material='gunmetal', bevel=0.05,
              rot_z=a)

    # === the scorched pin: a mast stub rising off the plate =========================
    F.cylinder(s, 'Pin', (0.2, 0.1, 0.5), (0.35, 0.2, 3.4), 0.3, 0.18, material='deadmetal',
               segments=8, bevel=0.03)
    # char rings — bands of deeper black up the stub
    F.band(s, 'Pin', (0.28, 0.14, 1.8), (0, 0, 1), 0.4, 'deadmetal.deep', depth=0.05)
    F.band(s, 'Pin', (0.33, 0.18, 2.9), (0, 0, 1), 0.3, 'deadmetal.deep', depth=0.05)
    # snapped tip: a jagged crown of bare stubs
    s.detail = 1
    for i in range(3):
        a = math.radians(i * 120 + 15)
        F.box(s, f'TipShard{i}', (0.35 + 0.12 * math.cos(a), 0.2 + 0.12 * math.sin(a), 3.5),
              (0.12, 0.1, 0.4), material='bare', bevel=0.0,
              rot=(math.radians(14) * math.cos(a), math.radians(14) * math.sin(a), 0))
    s.detail = 0

    # === the torn registry plate — the hull's name welded beside the pin ============
    F.box(s, 'RegistryPlate', (-1.6, -1.2, 1.1), (1.5, 0.14, 1.3), material='bare', bevel=0.04,
          rot=(math.radians(-18), 0, math.radians(-30)))
    F.box(s, 'RegistryMark', (-1.55, -1.28, 1.15), (0.9, 0.08, 0.25), material='hazard',
          bevel=0.0, rot=(math.radians(-18), 0, math.radians(-30)))
    # a strut welding it to the plate
    F.beams(s, 'RegistryStrut', [((-1.4, -1.1, 0.55), (-1.6, -1.2, 0.7))], 0.12,
            material='gunmetal')

    # === the one weak ember ==========================================================
    # a small caged lamp low on the pin — ember orange, dim
    F.box(s, 'EmberCage', (0.55, -0.25, 1.15), (0.5, 0.5, 0.5), material='gunmetal',
          bevel=0.03)
    F.light(s, 'Ember', (0.55, -0.25, 1.2), 'glow_amber', size=0.24)

    # a few chain links dropped beside the pin — burnt debris
    s.detail = 1
    links = [((1.1 + 0.35 * i, -0.9 - 0.2 * (i % 2), 0.66), (0.22, 0.18, 0.1), 0.4 * i)
             for i in range(4)]
    F.boxes(s, 'ChainLinks', links, 'gunmetal')
    s.detail = 0

    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
