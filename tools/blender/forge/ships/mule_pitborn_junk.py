"""Row 514 Pitborn junk-and-string-light kit: the yard Mule rebuilt in rust and primer,
its saddle pods patched with mismatched welded plates and hung with a run of work lamps —
the Pit hangs lights on everything it owns (02 §13, 05 §4). Same hull as mule.py
(tools/blender/forge/variant.py); plates sit on the flat authored pod lids so nothing
floats."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import forge as F  # noqa: E402
from variant import main  # noqa: E402

SHIP_ID = 'mule_pitborn_junk'
COLORS = {
    'paint': '#4a2e1e',            # packed-rust hull (faction #C8501C lifted by the key)
    'paint2': '#7a4426',
    'stripe': '#c89828',           # yard hazard-gold stays — the Pit marks its own
    'hazard': '#c8501c',
    'dark': '#141110',
    'glow_cyan.cream': '#ffb04a',  # the dorsal line turns into a string of work lamps
}


def extra(ship):
    """Welded scrap: mismatched plates on each flat pod lid plus a run of lamp dots along
    the outboard top edge — accreted, not designed."""
    import mule
    py, w, h = mule.PY, mule.POD_W, mule.POD_H
    zlid = h / 2 + 0.035
    # patch plates — odd sizes, mixed finishes, only on the flat lid so nothing floats
    mats = ('bare', 'gunmetal', 'paint2', 'hazard')
    plates = []
    for i in range(6):
        x = mule.POD_X0 + 0.7 + i * 1.45
        yoff = (-0.35, 0.28, -0.1, 0.42, -0.42, 0.12)[i]
        plates.append(((x, py + yoff, zlid),
                       (0.9 + 0.25 * (i % 3), 0.6 + 0.2 * (i % 2), 0.07), i * 0.53))
    for sgn in (1, -1):
        for i, ((px, py_, pz), ps, rot) in enumerate(plates):
            F.box(ship, f'ScrapPlate{sgn}_{i}', (px, sgn * py_, pz), ps, rot_z=rot,
                  material=mats[i % len(mats)], bevel=0.01)
        # string lights along the outboard lid edge
        for i in range(5):
            F.light(ship, f'StringLamp{sgn}_{i}',
                    (mule.POD_X0 + 0.55 + i * 1.8, sgn * (py + w / 2 - 0.1), zlid + 0.05),
                    'glow_amber', size=0.11)


if __name__ == '__main__':
    main('mule', SHIP_ID, COLORS, extra)
