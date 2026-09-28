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

# Becalmed override applied on top of each base freighter's COLORS.
# paint channels stay in the 0x30-0x90 calibration band; glow nav/amber colours are driven
# near-black so the stock running lights and warn lamps read as dead embers, while
# 'glow_warm' (bunk windows, cabin floods) keeps the base warm colour — every bunk is warm.
COLORS = {
    'paint': '#37324a',        # charcoal-violet hull skin — dark but reads in-sector
    'paint2': '#463f5e',       # violet secondary plating
    'paint2.box': '#2e2940',   # container loads, deep violet-grey
    'paint2.b': '#362f48',
    'paint2.teal': '#3c3258',  # the one identity box, muted violet
    'stripe': '#52417a',       # muted violet identity band
    'hazard': '#3a3150',       # becalmed hazard markings
    'gunmetal': '#1a1e24',
    'dark': '#0c0a10',         # engine throats, interior shadow
    'bare': '#443e52',
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


def place_sockets(s, focus=(0.0, 0.0, 0.0)):
    """The new-place socket contract: structure core at the origin, camera focus on the hull."""
    s.socket_names = ['SOCKET_Structure_Core', 'SOCKET_Camera_Focus']
    s.socket('SOCKET_Structure_Core', (0.0, 0.0, 0.0))
    s.socket('SOCKET_Camera_Focus', focus)
