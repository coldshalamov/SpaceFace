"""Row 514 Understory Overgrowth kit: the gardener skiff Kestrel half-reclaimed by the
garden — moss mats and vine runs seated on the real hull skin, pale spore-lamps where
yard lights used to be (02 §10, 05 §4; the same kit dresses Bloom Husks). Same hull as
kestrel.py (tools/blender/forge/variant.py)."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import forge as F  # noqa: E402
from variant import main  # noqa: E402

SHIP_ID = 'kestrel_understory_growth'
COLORS = {
    'paint': '#3a4226',            # moss-olive over the Hitch steel-teal (faction #8FA82E lifted)
    'paint2': '#2c3018',
    'stripe': '#5a7028',
    'hazard': '#7a8a30',           # even the warnings faded to lichen
    'dark': '#12150e',
    'paint.green': '#4a6428',
    'paint2.ivory': '#8a9660',
    'glow_cyan': '#a8d858',        # bioluminescent spore-light, not yard cyan
    'glow_amber': '#c8e06a',
    'glow_amber.beacon': '#c8e06a',
    'glow_warm': '#b8d860',
    'stone.moss': '#465a20',       # the overgrowth itself: rough organic, never metallic
    'stone.mossDeep': '#2e3a16',
}


def extra(ship):
    """The growth: moss clumps and two vine runs draped on the PressureHull's own skin
    (skin.run reads the built mesh), so nothing floats and the same dressing survives a
    hull refit."""
    import bpy
    import skin
    bpy.context.view_layer.update()
    mats = ('stone.moss', 'stone.mossDeep')
    clumps = [(-10.4, 1.1), (-8.8, -0.9), (-6.9, 1.5), (-5.2, -1.4), (-3.3, 0.6),
              (-1.2, -1.9), (0.8, 1.3), (2.6, -0.7), (4.4, 0.9)]
    for i, (x, y) in enumerate(clumps):
        h = skin.hit('PressureHull', x, y)
        if not h:
            continue
        p, n = h
        if n.z < 0.35:
            continue
        F.box(ship, f'Moss{i}', tuple(p + n * 0.02),
              (0.55 + 0.2 * (i % 3), 0.4 + 0.15 * (i % 2), 0.10),
              material=mats[i % 2], bevel=0.05)
    for k, ys in enumerate((-1.1, 0.9)):
        path = skin.run('PressureHull', [(-10.8 + i * 1.6, ys + 0.5 * __import__('math').sin(i * 1.4 + k))
                                         for i in range(11)], 0.05)
        if len(path) > 1:
            F.sweep(ship, f'Vine{k}', path, 0.09, 0.07, material='stone.mossDeep', bevel=0.02)


if __name__ == '__main__':
    main('kestrel', SHIP_ID, COLORS, extra)
