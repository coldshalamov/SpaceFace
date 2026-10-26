"""Row 514 Pitborn junk kit on the yard-tender Ironback — the hull the Pit fields live in
Ashfall, Vesta and Ceres (factionPresence). Packed rust under mismatched weld plates and a
run of string lamps hung off the carapace (02 §13, 05 §4). Variant of ironback.py
(tools/blender/forge/variant.py); plates and lamps are seated on the real Hull/Pronotum
skin so nothing floats."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import forge as F  # noqa: E402
from variant import main  # noqa: E402

SHIP_ID = 'ironback_pitborn_junk'
COLORS = {
    'paint': '#4a2e1e',            # packed-rust carapace (faction #C8501C lifted by the key)
    'paint2': '#7a4426',
    'stripe': '#7a4426',
    'hazard': '#c89828',           # yard hazard-gold stays — the Pit marks its own
    'dark': '#141110',
    'glow_cyan.oxide': '#ffb04a',  # the dorsal seam becomes a run of string lamps
    'glow_amber': '#ffb04a',
}


def extra(ship):
    """Welded scrap: mismatched plates on the Hull and Pronotum shells plus lamp dots along
    the dorsal — accreted, not designed. skin.hit reads the built mesh so the plates ride
    the real carapace curve."""
    import bpy
    import skin
    bpy.context.view_layer.update()
    mats = ('bare', 'gunmetal', 'paint2', 'dark')
    spots = [('Hull', -6.4, 1.0), ('Hull', -4.6, -1.2), ('Hull', -2.2, 1.3),
             ('Hull', 0.4, -1.1), ('Pronotum', 2.4, 0.9), ('Pronotum', 3.6, -0.7)]
    for i, (part, x, y) in enumerate(spots):
        h = skin.hit(part, x, y)
        if not h:
            continue
        p, n = h
        if n.z < 0.3:
            continue
        F.box(ship, f'ScrapPlate{i}', tuple(p + n * 0.015),
              (0.8 + 0.3 * (i % 3), 0.55 + 0.25 * (i % 2), 0.06),
              material=mats[i % 4], bevel=0.01)
    for i in range(6):
        h = skin.hit('Hull', -7.2 + i * 1.7, 0.15 * ((i % 3) - 1))
        if not h:
            continue
        p, n = h
        if n.z < 0.4:
            continue
        F.light(ship, f'StringLamp{i}', tuple(p + n * 0.06), 'glow_amber', size=0.10)


if __name__ == '__main__':
    main('ironback', SHIP_ID, COLORS, extra)
