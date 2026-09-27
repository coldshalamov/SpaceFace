"""Shared kit for the Quiessence becalmed freighter family (place_quiessence_freighter_a/b/c).

Seventeen intact freighters hold formation around one violet buoy: cold drives, dark
throats, no running lights — but every bunk window burns warm, and each hull carries one
faint violet beacon answering the buoy. Built as places (fixed heading, unpowered, dockable
landmarks) rather than ships: no hooks, no engine glow.
"""
import forge as F  # noqa: E402  (imported after the ship file inserts the forge dir)

COLORS = {
    # deadmetal finishes keep the becalmed hulls dark: near-black albedo + high roughness so the
    # sector key/env lift can't wash them to pale grey.
    'deadmetal': '#161120',   # charcoal-violet hull skin (exports as Material_Hull)
    'deadmetal.deep': '#0e0b17',  # deeper violet-black secondary (Material_Hull_deep)
    'paint': '#2d2836',       # unused alias kept for kit compatibility
    'paint2': '#1f1b28',
    'stripe': '#463a5e',      # dim violet identity band
    'gunmetal': '#1a1e24',
    'dark': '#0c0a10',        # engine throats, interior shadow
    'bare': '#3c3644',
    'glass': '#101820',
    'glow_warm': '#ffcf96',   # bunk windows — every bunk is warm
    'glow_warm.violet': '#7a55c9',   # the faint violet beacon (emit 2.2, quiet)
    'glow_red.dim': '#5a1f1a',       # running lights, nearly dead
}


def bunk_windows(s, x0, x1, count, y=3.4, z=1.2, tag=''):
    """Rows of warm lit bunk windows on both flanks — the only alive thing aboard."""
    s.detail = 1
    for e in (-1, 1):
        specs = []
        for i in range(count):
            x = x0 + (x1 - x0) * i / max(1, count - 1)
            specs.append(((x, e * y, z), (0.5, 0.1, 0.34), 0.0))
        F.boxes(s, f'Bunks{tag}{e:+d}', specs, 'glow_warm')
    s.detail = 0


def cold_engines(s, x, ys, r=1.3, tag=''):
    """Dead engine cluster: gunmetal bells with dark, unlit throats."""
    for i, y in enumerate(ys):
        F.cylinder(s, f'Eng{tag}{i}', (x + 2.2, y, 0), (x - 0.6, y, 0), r * 0.75,
                   material='gunmetal', segments=10, bevel=0.04)
        F.cylinder(s, f'EngBell{tag}{i}', (x - 0.6, y, 0), (x - 1.6, y, 0), r * 0.75, r,
                   material='deadmetal.deep', segments=10, bevel=0.05)
        F.cylinder(s, f'EngThroat{tag}{i}', (x - 1.7, y, 0), (x - 1.4, y, 0), r * 0.72,
                   material='dark', segments=10, bevel=0.0)


def violet_beacon(s, pos, tag=''):
    """The one faint violet beacon echoing the buoy."""
    F.light(s, f'Beacon{tag}', pos, 'glow_warm.violet', size=0.34)


def dead_nav(s, x, tag=''):
    """Nearly-dead running lights — off or embers, not lit."""
    F.light(s, f'NavP{tag}', (x, -4.2, 0.6), 'glow_red.dim', size=0.12)
