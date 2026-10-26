"""Row 514 Fulfillment hospital-white barcode kit: the re-router hauler Mule in bone
livery with stamp-red seals and a printed barcode band across each saddle pod — a
requisition form that happens to fly (02 §11). Same hull as mule.py
(tools/blender/forge/variant.py); the pod face is authored flat so the barcode stripes
sit proud but seated."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import forge as F  # noqa: E402
from variant import main  # noqa: E402

SHIP_ID = 'mule_fulfillment_hauler'
COLORS = {
    'paint': '#787668',            # bone white authored a step under target (#F0F0E8 lifted)
    'paint2': '#8f8d80',
    'stripe': '#9a9688',
    'hazard': '#a03828',           # the stamp-red of a stamped form, not warning yellow
    'dark': '#16171a',
    'glow_cyan.cream': '#e8ddc0',  # warm-white reading lamps
}


def extra(ship):
    """The barcode: thin dark stripes printed up each pod's outboard face and across its
    lid — the same marks a requisition crate would carry. Pod wall is authored flat at
    y=±(PY+POD_W/2) so the stripes sit 0.02 proud and cannot float."""
    import mule
    py, w = mule.PY, mule.POD_W
    x0, x1 = mule.POD_X0 + 0.35, mule.POD_X1 - 0.35
    h = mule.POD_H
    yo = py + w / 2 + 0.02
    # a deterministic code: widths/gaps vary but every barcode reads identical
    bars = []
    x = x0
    i = 0
    while x < x1:
        bw = (0.05, 0.12, 0.03, 0.18, 0.07)[i % 5]
        gap = (0.10, 0.16, 0.07, 0.12, 0.20)[i % 5]
        bars.append(((x + bw / 2, yo, 0.02), (bw, 0.06, h * 0.72)))
        x += bw + gap
        i += 1
    for sgn in (1, -1):
        F.boxes(ship, f'Barcode{sgn}',
                [((bx, sgn * by, bz), bs) for (bx, by, bz), bs in bars], 'dark', bevel=0.005)
    # one stamped seal plate over the code, off the bars
    for sgn in (1, -1):
        F.box(ship, f'Seal{sgn}', (x0 + 0.55, sgn * yo, 0.62), (0.5, 0.07, 0.34),
              material='hazard', bevel=0.02)


if __name__ == '__main__':
    main('mule', SHIP_ID, COLORS, extra)
