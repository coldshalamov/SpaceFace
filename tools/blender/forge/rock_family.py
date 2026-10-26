"""Row 495 rock family — the 24 hand-made throwable bodies (05 §2: three sizes x eight
substances). One deterministic builder; each body is a thin ship file that names its
substance and size.

Design law (FORGE.md + 05 §2 colour language):
  - the mass is `stone`-finish faceted rock, seeded — same seed, same rock;
  - the substance is read at a glance: veins, rime, fissures, crystal spikes or welded
    junk carry the signature. Emissive seams stay thin (a lit strip reads as neon);
  - three sizes share one recipe at three scales — pebble ~ one core, boulder ~ core plus
    satellites, monolith ~ a fused cluster, so size reads from silhouette before colour.

Built at place scale (metres); the runtime normalises to the entity radius, so
proportions between sizes are what matter (~1 : 2 : 3).
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import forge as F  # noqa: E402

SIZES = {
    # core radius, satellite count, satellite radius band, vein count
    'pebble': dict(r=3.2, sats=0, sat_r=(1.0, 1.4), veins=3),
    'boulder': dict(r=5.6, sats=2, sat_r=(1.6, 2.4), veins=4),
    'monolith': dict(r=8.2, sats=3, sat_r=(2.2, 3.4), veins=6),
}


def _seed(substance, size):
    """Deterministic per-body seed — no ambient randomness, same rock every build."""
    subs = {'metallic_ore': 1, 'silicate': 2, 'ice': 3, 'slag': 4,
            'crystal': 5, 'reef_metal': 6, 'cooked_rock': 7, 'junk': 8}
    sz = {'pebble': 0, 'boulder': 1, 'monolith': 2}
    return subs[substance] * 131 + sz[size] * 17 + 11


def _dir(i, n, tilt=0.55):
    """Seeded unit direction spread over the sphere, biased toward the +Z hemisphere the
    chase camera reads."""
    a = math.tau * (i / n + 0.13)
    z = 0.25 + 0.75 * math.sin(i * 2.39 + 0.7)
    r = math.sqrt(max(0.0, 1.0 - z * z))
    return (r * math.cos(a), r * math.sin(a), z)


def _lump_k(d, seed):
    """The broad-lump radius term F.rock applies to its core, recomputed so dressing can
    hug the seeded surface: the rock displaces verts by k = .80 + relief*.5*lump (plus a
    small per-vert `fine` term we cannot address), then rotates the whole mesh seed*1.7
    about Z. Placing parts at ~k*r instead of a fixed lift keeps them seated whether they
    land on a swell or a hollow."""
    a = -seed * 1.7
    dx = d[0] * math.cos(a) - d[1] * math.sin(a)
    dy = d[0] * math.sin(a) + d[1] * math.cos(a)
    lump = (math.sin(3.1 * dx + seed * 1.7) * math.sin(2.7 * dy + seed * 0.9)
            * math.sin(3.9 * d[2] + seed * 2.3))
    return 0.80 + 0.17 * lump  # relief=.34 -> relief*.5


CORE_Z = -0.12  # core centre is sunk this fraction of r so the +Z shoulder reads big


def _surf(d, r, seed, embed=0.03, quarry=None):
    """Point on the seeded core surface along direction d (core sits CORE_Z*r low), sunk
    `embed` inside so parts read as seated seams even where the per-vert jitter dips.
    `quarry`=(point, normal) pulls points back under the cut face where it flattens the
    body."""
    k = _lump_k(d, seed) - embed
    p = [d[0] * r * k, d[1] * r * k, d[2] * r * k + CORE_Z * r]
    if quarry:
        q0 = quarry[0]
        nn = math.sqrt(sum(c * c for c in quarry[1])) or 1.0
        qn = tuple(c / nn for c in quarry[1])
        dist = sum((p[j] - q0[j]) * qn[j] for j in range(3))
        if dist > -embed:
            for j in range(3):
                p[j] -= qn[j] * (dist + embed)
    return tuple(p)


def _veins(s, count, r, finish, size=(1.0, 0.14, 0.3), seed=0, quarry=None):
    """Thin slivers sunk into the surface — exposed seams, not mounted panels."""
    for i in range(count):
        d = _dir(i, count)
        p = _surf(d, r, seed, 0.04, quarry)
        ln = size[0] * (0.75 + 0.5 * ((i * 37) % 10) / 10.0)
        F.box(s, f'Vein{i}', p, (ln, size[1], size[2]), material=finish, bevel=0.01,
              rot=(0.25 * math.sin(i * 1.7), 0.4 * math.cos(i * 2.3), i * 1.9))


def _quarry_plane(r):
    """The cut-face plane every quarried substance shares — returned so dressing knows
    where the body was flattened."""
    return ((0.3 * r, -0.2 * r, 0.75 * r), (0.25, -0.15, 1.0))


def _core(s, r, seed, material='stone', quarry=False, qmat='stone.quarry'):
    """One displaced faceted core; optional quarried face on the +Z shoulder."""
    qp = _quarry_plane(r) if quarry else None
    F.rock(s, 'Core', (0, 0, CORE_Z * r), r, seed=seed, subdiv=4, relief=0.34,
           material=material, quarry_plane=qp, quarry_material=qmat if qp else None)


def _satellites(s, r, seed, count, material='stone.deep'):
    """Smaller fused boulders riding the core's flanks — the cluster read."""
    for i in range(count):
        d = _dir(i + 2, count + 3)
        rad = r * (0.30 + 0.12 * ((i * 41) % 7) / 7.0)
        dist = r * (0.78 + 0.10 * (i % 2))
        F.rock(s, f'Lump{i}', (d[0] * dist, d[1] * dist, d[2] * dist * 0.8 - 0.08 * r),
               rad, seed=seed + 31 + i * 13, subdiv=4, relief=0.30, material=material)


def _strata(s, r, finish='stone.strata', count=2):
    """Darker stratum bands cut through the body — geology, not trim."""
    for i in range(count):
        z = (-0.42 + 0.62 * i) * r
        F.band(s, 'Core', (0.05 * r * i, -0.1 * r + 0.06 * r * i, z),
               (0.10 + 0.04 * i, 0.06 - 0.10 * i, 1.0), 0.09 * r, finish)


def _crystal_spikes(s, r, seed, count, finish='glass', base='stone.quarry'):
    """Tapered spike cluster erupting from the +Z shoulder — the crystal signature."""
    for i in range(count):
        d = _dir(i + 1, count + 1)
        base_p = (d[0] * r * 0.55, d[1] * r * 0.55, max(0.30, d[2]) * r * 0.80)
        tip = (base_p[0] + d[0] * r * (0.30 + 0.08 * (i % 3)),
               base_p[1] + d[1] * r * (0.30 + 0.08 * ((i + 1) % 3)),
               base_p[2] + abs(d[2]) * r * (0.34 + 0.10 * (i % 2)))
        F.cylinder(s, f'Spike{i}', base_p, tip, r * 0.09, r * 0.015,
                   material=finish, segments=7, bevel=0.0)


def _rime_caps(s, r):
    """Matte frost sheets laid nearly flush on the +Z faces — rime, not armour."""
    F.plate(s, 'RimeA', [(-0.28 * r, -0.22 * r), (0.34 * r, -0.30 * r), (0.60 * r, 0.02 * r),
                         (0.42 * r, 0.34 * r), (-0.10 * r, 0.44 * r), (-0.34 * r, 0.18 * r)],
            0.72 * r, 0.045 * r, material='ceramic.ice', chamfer=0.04 * r)
    F.plate(s, 'RimeB', [(-0.44 * r, 0.14 * r), (-0.16 * r, 0.06 * r), (0.02 * r, 0.30 * r),
                         (-0.24 * r, 0.52 * r), (-0.52 * r, 0.38 * r)],
            0.76 * r, 0.038 * r, material='ceramic.ice', chamfer=0.03 * r)


def _junk_dressing(s, r, seed):
    """Pitborn accretion: welded plates, a hazard band, cable runs and lamp dots over a
    compacted scrap core — the ball reads as MADE, not found."""
    plates = []
    for i in range(7):
        d = _dir(i, 7)
        plates.append((_surf(d, r, seed, 0.015), (0.42 * r * (0.7 + 0.3 * (i % 3) / 3.0),
                           0.30 * r, 0.05 * r), i * 0.83))
    F.boxes(s, 'WeldPlate', plates, 'bare', bevel=0.01)
    # a hazard band where the yard marked its ballast
    F.band(s, 'Core', (0, 0, 0.18 * r), (0.08, 0.05, 1.0), 0.16 * r, 'hazard')
    # wire runs — beams hugging the surface between plate clusters, midpoint reseated
    for i in range(3):
        a0, a1 = _dir(i, 3, tilt=0.4), _dir(i + 1, 3, tilt=0.4)
        am = tuple((a0[j] + a1[j]) * 0.5 for j in range(3))
        n = math.sqrt(sum(c * c for c in am)) or 1.0
        am = tuple(c / n for c in am)
        F.beams(s, f'Cable{i}',
                [(_surf(a0, r, seed, 0.02), _surf(am, r, seed, 0.02)),
                 (_surf(am, r, seed, 0.02), _surf(a1, r, seed, 0.02))],
                0.05 * r, material='dark')
    # string-light dots — the Pit hangs lights on everything it owns
    for i in range(4):
        d = _dir(i + 1, 5)
        F.light(s, f'Lamp{i}', _surf(d, r, seed, 0.02), 'glow_amber', size=0.05 * r)


SUBSTANCE_COLORS = {
    # authored a step under target — the sector key lifts them into the 05 §2 read
    'metallic_ore': {
        'stone': '#3f4348', 'stone.strata': '#2f3338', 'stone.deep': '#33373c',
        'stone.quarry': '#4a5058', 'bare': '#8fa8c0', 'glow_cyan': '#66c8ff',
        'dark': '#14171b',
    },
    'silicate': {
        'stone': '#5e564b', 'stone.strata': '#473f36', 'stone.deep': '#4c463d',
        'stone.quarry': '#665e52', 'dark': '#16191d', 'glow_amber': '#c88f2a',
    },
    'ice': {
        'stone': '#5c666a', 'stone.strata': '#495256', 'stone.deep': '#4c565a',
        'stone.quarry': '#68747a', 'ceramic.ice': '#8a98a0', 'glass': '#3a5a66',
        'glow_cyan': '#7fe0ff', 'dark': '#16191d',
    },
    'slag': {
        'stone': '#24211f', 'stone.strata': '#191715', 'stone.deep': '#1d1a18',
        'stone.quarry': '#2e2a27', 'glow_amber': '#e07818', 'glow_red': '#c04020',
        'dark': '#0e0c0b',
    },
    'crystal': {
        'stone': '#463d52', 'stone.strata': '#372f42', 'stone.deep': '#3a3344',
        'stone.quarry': '#524a5e', 'glass': '#5a3a80', 'glow_cyan': '#a878e8',
        'dark': '#17131c',
    },
    'reef_metal': {
        'stone': '#5c4434', 'stone.strata': '#46332a', 'stone.deep': '#4c382e',
        'stone.quarry': '#6a5040', 'bare': '#4a9090', 'glow_cyan': '#40b8b0',
        'dark': '#171310',
    },
    'cooked_rock': {
        'stone': '#1f201d', 'stone.strata': '#171816', 'stone.deep': '#1a1b18',
        'stone.quarry': '#262723', 'glow_green': '#50c878', 'dark': '#0d0e0c',
    },
    'junk': {
        'stone': '#4a3a30', 'stone.strata': '#382c24', 'stone.deep': '#3c2f28',
        'stone.quarry': '#54443a', 'bare': '#a07040', 'hazard': '#c89828',
        'gunmetal': '#50443c', 'dark': '#181410', 'glow_amber': '#d8a030',
        'ceramic.primer': '#5c5c58', 'paint.gold': '#8a6a20',
    },
}


def build(ship_id, substance, size):
    F.reset_scene()
    s = F.Ship(ship_id, SUBSTANCE_COLORS[substance])
    spec = SIZES[size]
    r = spec['r']
    seed = _seed(substance, size)

    quarry = substance in ('silicate', 'metallic_ore', 'cooked_rock', 'reef_metal')
    qp = _quarry_plane(r) if quarry else None
    _core(s, r, seed, quarry=quarry)
    if spec['sats']:
        _satellites(s, r, seed, spec['sats'])

    if substance == 'metallic_ore':
        _strata(s, r, count=2)
        _veins(s, spec['veins'], r, 'bare', size=(1.3 * r / 5.6, 0.12, 0.34),
               seed=seed, quarry=qp)
        # ore glints — a couple of lit pinpoints where the vein breaks the surface
        for i in range(2):
            d = _dir(i + 4, spec['veins'])
            F.light(s, f'Glint{i}', _surf(d, r, seed, 0.015, qp),
                    'glow_cyan', size=0.05 * r)
    elif substance == 'silicate':
        _strata(s, r, count=3)
    elif substance == 'ice':
        _strata(s, r, count=1)
        _rime_caps(s, r)
        _veins(s, spec['veins'], r, 'glass', size=(1.1 * r / 5.6, 0.16, 0.4), seed=seed)
        if size != 'pebble':
            _crystal_spikes(s, r, seed, 3, finish='glass')
    elif substance == 'slag':
        _strata(s, r, count=1)
        _veins(s, spec['veins'] + 1, r, 'glow_amber', size=(1.0 * r / 5.6, 0.18, 0.36),
               seed=seed)
        for i in range(2):
            d = _dir(i + 6, 8)
            F.light(s, f'Ember{i}', _surf(d, r, seed, 0.015), 'glow_red', size=0.045 * r)
    elif substance == 'crystal':
        _veins(s, spec['veins'], r, 'glass', size=(1.2 * r / 5.6, 0.14, 0.4), seed=seed)
        _crystal_spikes(s, r, seed, {'pebble': 3, 'boulder': 5, 'monolith': 7}[size])
        for i in range(2):
            d = _dir(i + 3, 6)
            F.light(s, f'Glow{i}', _surf(d, r, seed, 0.015), 'glow_cyan', size=0.04 * r)
    elif substance == 'reef_metal':
        _strata(s, r, count=2)
        _veins(s, spec['veins'], r, 'bare', size=(1.2 * r / 5.6, 0.13, 0.34),
               seed=seed, quarry=qp)
        # teal sheen pockets — spring-metal bright spots, kept sparse
        for i in range(3):
            d = _dir(i + 2, 7)
            F.light(s, f'Sheen{i}', _surf(d, r, seed, 0.015, qp),
                    'glow_cyan', size=0.04 * r)
    elif substance == 'cooked_rock':
        _veins(s, spec['veins'] + 1, r, 'glow_green', size=(0.9 * r / 5.6, 0.16, 0.34),
               seed=seed, quarry=qp)
        for i in range(2):
            d = _dir(i + 5, 7)
            F.light(s, f'Fissure{i}', _surf(d, r, seed, 0.015, qp),
                    'glow_green', size=0.05 * r)
    elif substance == 'junk':
        _junk_dressing(s, r, seed)

    return s


def main(ship_id, substance, size):
    import forge_export as E
    ship = build(ship_id, substance, size).finish()
    E.export_ship(ship, E.fleet_spec(ship_id), preview='--live' not in sys.argv)


SUBSTANCES = tuple(SUBSTANCE_COLORS.keys())
SIZES_ORDER = ('pebble', 'boulder', 'monolith')
