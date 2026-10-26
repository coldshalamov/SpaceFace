"""Row 495 rock family — place_rock_cooked_rock_boulder (cooked_rock / boulder).

cooked rock — black body with green fissures. Size class: boulder (~2x). Authored by tools/blender/forge/rock_family.py —
one shared builder, deterministic seed per body, stone-finish faceted mass with substance
read at a glance.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

SHIP_ID = 'place_rock_cooked_rock_boulder'
SUBSTANCE = 'cooked_rock'
SIZE_CLASS = 'boulder'

if __name__ == '__main__':
    from rock_family import main
    main(SHIP_ID, SUBSTANCE, SIZE_CLASS)
