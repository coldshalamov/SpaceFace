"""Row 495 rock family — place_rock_metallic_ore_boulder (metallic_ore / boulder).

metallic ore — dark metal-tinged stone, bright bare-metal veins, cyan ore glints. Size class: boulder (~2x). Authored by tools/blender/forge/rock_family.py —
one shared builder, deterministic seed per body, stone-finish faceted mass with substance
read at a glance.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

SHIP_ID = 'place_rock_metallic_ore_boulder'
SUBSTANCE = 'metallic_ore'
SIZE_CLASS = 'boulder'

if __name__ == '__main__':
    from rock_family import main
    main(SHIP_ID, SUBSTANCE, SIZE_CLASS)
