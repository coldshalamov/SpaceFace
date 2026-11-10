"""Row 495 rock family — place_rock_reef_metal_monolith (reef_metal / monolith).

reef metal — rusted ore body with teal sheen pockets. Size class: monolith (~3x, fused cluster). Authored by tools/blender/forge/rock_family.py —
one shared builder, deterministic seed per body, stone-finish faceted mass with substance
read at a glance.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

SHIP_ID = 'place_rock_reef_metal_monolith'
SUBSTANCE = 'reef_metal'
SIZE_CLASS = 'monolith'

if __name__ == '__main__':
    from rock_family import main
    main(SHIP_ID, SUBSTANCE, SIZE_CLASS)
