"""Row 495 rock family — place_rock_slag_pebble (slag / pebble).

slag — near-black crust with ember fissures (glow_amber veins). Size class: pebble (~1 unit). Authored by tools/blender/forge/rock_family.py —
one shared builder, deterministic seed per body, stone-finish faceted mass with substance
read at a glance.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

SHIP_ID = 'place_rock_slag_pebble'
SUBSTANCE = 'slag'
SIZE_CLASS = 'pebble'

if __name__ == '__main__':
    from rock_family import main
    main(SHIP_ID, SUBSTANCE, SIZE_CLASS)
