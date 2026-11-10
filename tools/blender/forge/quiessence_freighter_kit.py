"""Shared kit for the Quiessence becalmed freighter family (place_quiessence_freighter_a/b/c).

Seventeen intact freighters hold formation around one violet buoy: cold drives, dark
throats, no running lights — but every bunk window burns warm, and each hull carries one
faint violet beacon answering the buoy.

GFX-4 rework: each variant is built FROM a finished Forge freighter via tools/blender/forge/
variant.py (build_variant), so the family inherits Forge-grade construction and only the
palette and the becalmed dressing differ. The palette below is the "becalmed" override:
charcoal-violet hulls, muted violet identity bands, running lights driven nearly dead by
colour, drive glow absent because the place socket whitelist carries no engine socket.
"""
import forge as F  # noqa: E402  (imported after the ship file inserts the forge dir)
import os  # noqa: E402
import sys  # noqa: E402

# The Quiessence ring is BECALMED: dead hulls, cold engines. The base ships these freighters are
# built on (volatiles_tanker, helios_span, ore_barge) now end their build() with the ANI-38 chassis
# rig (idle breathing, brace, kick, wag), which would make a dead freighter look alive and would leave
# a MOTION_ pivot in the GLB with no bank to seal. Switch the rig off for this process (one Blender
# process builds one body), so the freighters stay still and ship without a motion pivot.
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'animations'))
try:
    import ANI_38  # noqa: E402
    ANI_38.build = lambda ship, objects, **kwargs: None
    ANI_38.bake_ship_banks = lambda *args, **kwargs: None
except ImportError:  # the rig is optional for this kit
    pass

# Becalmed finish override. The sector key light gives a dielectric (metal~0.1) paint a fixed
# pale floor — the white F0 specular picks up the hot amber backdrop no matter how dark the
# albedo — which is exactly why these hulls read pastel mauve in flight even at charcoal
# albedo. The deadmetal finish exists for this; rather than rewrite every base ship's
# material names, raise the painted finishes to near-full metal for this process so the
# albedo tints the specular instead of the env washing it out (measured: changing the factor
# alone moved the rendered hull mean by 0.0 px). Violet then survives only in the stripe band
# and the beacon, which is the intent.
for _finish in ('paint', 'paint2', 'stripe', 'hazard'):
    F.FINISHES[_finish] = {**F.FINISHES[_finish], 'metal': 1.0, 'rough': 0.55}

# The base freighters (volatiles_tanker, helios_span, ore_barge) now carry LIT identity trims in
# their own glow variants (glow_cyan.rust, glow_cyan.helios): neon rings and runway lines that
# have no place on a becalmed hull, and each would add a draw call and ~3k triangles the family
# never had. A becalmed hull is not trimmed in light: skip every inherited lit-cyan band, and
# fold any other lit-cyan variant into the dead (violet-dark) glow_amber the palette below already
# drives cold, so no new finish ever reaches the exported file.
_ship_mat = F.Ship.mat
_band = F.band


def _becalmed_mat(self, finish):
    if finish.startswith('glow_cyan.'):
        finish = 'glow_amber'
    return _ship_mat(self, finish)


def _becalmed_band(ship, obj_name, point, normal, width, finish, *args, **kwargs):
    if finish.startswith('glow_cyan.'):
        return None
    return _band(ship, obj_name, point, normal, width, finish, *args, **kwargs)


F.Ship.mat = _becalmed_mat
F.band = _becalmed_band

# Becalmed override applied on top of each base freighter's COLORS.
# paint channels stay in the 0x30-0x90 calibration band; glow nav/amber colours are driven
# near-black so the stock running lights and warn lamps read as dead embers, while
# 'glow_warm' (bunk windows, cabin floods) keeps the base warm colour — every bunk is warm.
COLORS = {
    # The sector key light lifts saturated violet into pink — hull surfaces stay near-neutral
    # charcoal and violet lives only in the stripe band and the beacon.
    'paint': '#25242a',        # near-neutral charcoal hull skin
    'paint2': '#2f2c36',       # charcoal secondary plating, hint of violet
    'paint2.box': '#232027',   # container loads, near-black charcoal
    'paint2.b': '#28252e',
    'paint2.teal': '#292632',  # the one identity box, desaturated violet-grey
    'stripe': '#3d3352',       # muted violet identity band — the only violet surface
    'hazard': '#2e2a33',       # becalmed hazard markings
    'gunmetal': '#1a1e24',
    'dark': '#0c0a10',         # engine throats, interior shadow
    'bare': '#3a3840',
    'glass': '#101820',
    'glow_red': '#160b0a',     # running lights nearly dead
    'glow_green': '#0c1611',
    'glow_amber': '#1c1424',   # warn lamps gone cold and violet-dark
    'glow_warm': '#ffcf96',    # bunk windows — every bunk is warm
    'glow_warm.violet': '#7a55c9',   # the faint violet beacon answering the buoy
}


def bunk_windows(s, x0, x1, count, y=3.4, z=1.2, tag='', z_top=None):
    """Rows of warm lit bunk windows on both flanks — the only alive thing aboard.
    When z_top is given, a second flat row runs along the deck crown so the top-down
    chase camera sees the same lit-bunk read as the flanks."""
    s.detail = 1
    for e in (-1, 1):
        specs = []
        for i in range(count):
            x = x0 + (x1 - x0) * i / max(1, count - 1)
            specs.append(((x, e * y, z), (0.6, 0.1, 0.4), 0.0))
        F.boxes(s, f'Bunks{tag}{e:+d}', specs, 'glow_warm')
    if z_top is not None:
        specs = []
        for i in range(count):
            x = x0 + (x1 - x0) * i / max(1, count - 1)
            specs.append(((x, 0.0, z_top), (0.6, 0.4, 0.1), 0.0))
        F.boxes(s, f'BunksTop{tag}', specs, 'glow_warm')
    s.detail = 0


def violet_beacon(s, pos, tag=''):
    """The one faint violet beacon echoing the buoy."""
    F.light(s, f'QBeacon{tag}', pos, 'glow_warm.violet', size=0.5)


def flatten_motion(s):
    """The ring is becalmed: strip every motion rig the base ship brought along.

    The bases (volatiles_tanker, helios_span, ore_barge) declare motion groups: the ANI-38 chassis
    rig, and the ore barge's own claw and gantry rigs. Their parts keep their authored world
    positions, so removing the tag, the registry and the pivot empties leaves a still, ordinary
    body with no MOTION_ node to seal a bank for.
    """
    import bpy
    for o in list(s.objects):
        if o.get('forge_motion'):
            del o['forge_motion']
    groups = getattr(s, 'motion_groups', None)
    if groups is not None:
        groups.clear()
    pivots = getattr(s, 'motion_pivots', None)
    if pivots:
        for empty in list(pivots.values()):
            bpy.data.objects.remove(empty, do_unlink=True)
        pivots.clear()


def place_sockets(s, focus=(0.0, 0.0, 0.0)):
    """The new-place socket contract: structure core at the origin, camera focus on the hull."""
    flatten_motion(s)
    s.socket_names = ['SOCKET_Structure_Core', 'SOCKET_Camera_Focus']
    s.socket('SOCKET_Structure_Core', (0.0, 0.0, 0.0))
    s.socket('SOCKET_Camera_Focus', focus)
