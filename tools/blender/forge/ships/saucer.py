"""Saucer — tier-5 exotic player hull (design/FLYING_SAUCER_DESIGN.md). Lit-rim gunmetal disc.

Plan read at the chase camera: a featureless lenticular silhouette — the only ship in the
fleet with no nose, no tail, no preferred facing. The identity lives in the rim: a bezel of
dark machinery carrying an unbroken chain of cyan field lamps, a low metallic dome over a
dark glass crown, and a ventral dish whose glowing core is the drive. Radial seams break the
upper shell into plates so the disc reads manufactured, not sculpted.
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402

SHIP_ID = 'saucer'
COLORS = {
    # Key light lifts ~2.5x — the gunmetal shell is authored cold and dark so it lands
    # gunmetal on screen; deadmetal keeps the belly charcoal.
    'paint': '#101820',     # gunmetal shell — authored cold; lands graphite under the warm key
    'paint2': '#1c2129',    # darker armour plates / rim bezel
    'dark': '#15181d',      # seams, intakes, dish interior
    'stripe': '#4d5660',
    'hazard': '#6e5b26',
}

R = 9.6          # disc radius
RIM_Z = -0.16    # rim droop: the edge sits below centre plane


def disc_sections():
    """Lenticular loft along +X: circular planform w=sqrt(R²−x²), lens-thick centre that
    pinches to a finite rim edge with a slight outward droop."""
    secs = []
    nsec = 13
    for i in range(nsec):
        t = i / (nsec - 1)
        x = -R + 2 * R * t
        frac = abs(x) / R
        w = max(R * math.sqrt(max(1.0 - frac * frac, 0.0)), 0.06)
        # lens profile: thickest at centre, blunt armoured edge — the mass reads
        ht = 0.32 + 1.08 * max(1.0 - frac * frac, 0.0)
        hb = 0.32 + 0.98 * max(1.0 - frac * frac, 0.0)
        zc = RIM_Z * frac * frac           # rim droops a touch
        secs.append(dict(x=x, w=w, ht=ht, hb=hb, zc=zc, n=3.2))
    return secs


def rim_beads():
    """24 cyan field lamps ringing the rim — one mesh, one draw, the saucer's drive read."""
    beads = []
    for i in range(24):
        a = 2 * math.pi * i / 24
        x = (R - 0.25) * math.cos(a)
        y = (R - 0.25) * math.sin(a)
        beads.append(((x, y, RIM_Z + 0.10), (0.62, 0.34, 0.26), a))
    return beads


def rim_vents():
    """Dark intake slots between the lamps — the bezel reads as machinery, not a plain torus."""
    vents = []
    for k in range(12):
        a = 2 * math.pi * (k + 0.5) / 24
        x = (R - 0.10) * math.cos(a)
        y = (R - 0.10) * math.sin(a)
        vents.append(((x, y, RIM_Z - 0.05), (0.20, 0.75, 0.24), a))
    return vents


def field_vanes():
    """Four shallow ventral fins at 45° diagonals — the field vanes under the belly."""
    vanes = []
    for a in (math.pi / 4, 3 * math.pi / 4, 5 * math.pi / 4, 7 * math.pi / 4):
        x = 4.6 * math.cos(a)
        y = 4.6 * math.sin(a)
        vanes.append(((x, y, -0.78), (1.5, 0.14, 0.34), a))
    return vanes


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)

    # --- the disc ---------------------------------------------------------------------------
    F.loft(s, 'Disc', disc_sections(), material='paint', belly='gunmetal',
           back_material='paint2', count=42)

    # Radial panel seams: six diameter cuts through the shell, recessed dark.
    for i in range(6):
        a = math.pi * i / 6
        depth = -0.05 if i % 2 == 0 else -0.025
        F.band(s, 'Disc', (0, 0, 0.55), (math.cos(a), math.sin(a), 0), 0.07, 'dark',
               facing=(0, 0, 1), inset=0.02, depth=depth)
    # Concentric groove breaking the wedge panels into inner and outer rings.
    F.ring(s, 'ShellSeam', (0, 0, 0.86), 5.8, 0.05, axis=(0, 0, 1), material='dark',
           segments=40, sides=6)

    # Rim bezel: a torus of dark machinery seating the rim edge.
    F.ring(s, 'RimBezel', (0, 0, RIM_Z - 0.02), R - 0.15, 0.30, axis=(0, 0, 1),
           material='paint2', segments=36, sides=8)
    # A continuous glow groove the lamps sit in, then the unbroken lamp chain.
    F.ring(s, 'RimGroove', (0, 0, RIM_Z + 0.04), R - 0.28, 0.07, axis=(0, 0, 1),
           material='glow_cyan', segments=40, sides=6)
    F.boxes(s, 'RimLights', rim_beads(), 'glow_cyan', bevel=0.02)
    F.boxes(s, 'RimVents', rim_vents(), 'dark', bevel=0.02)

    # Weapon pods mounted ON the rim edge — the only placement a flat disc silhouette lets
    # guns actually read. Two M pods on the flanks, S ball turret in the nose rim.
    F.box(s, 'GunPort', (0.3, R - 0.15, -0.16), (1.7, 1.0, 0.52), material='paint2')
    F.box(s, 'GunStarboard', (0.3, -R + 0.15, -0.16), (1.7, 1.0, 0.52), material='paint2')
    F.cylinder(s, 'GunPortBarrel', (0.55, R + 0.1, -0.14), (0.55, R + 0.95, -0.14), 0.11,
               material='gunmetal')
    F.cylinder(s, 'GunStarboardBarrel', (0.55, -R - 0.1, -0.14), (0.55, -R - 0.95, -0.14), 0.11,
               material='gunmetal')
    F.sphere(s, 'TurretBall', (R - 0.15, 0, -0.14), 0.48, material='gunmetal', segments=16)
    F.cylinder(s, 'TurretBarrel', (R + 0.15, 0, -0.14), (R + 0.95, 0, -0.14), 0.085,
               material='gunmetal')

    # --- dorsal dome ------------------------------------------------------------------------
    # Metallic dome with a dark glass crown and a cyan light ring at its base.
    F.sphere(s, 'Dome', (0, 0, 1.2), 2.0, material='gunmetal', segments=26)
    F.sphere(s, 'DomeGlass', (0, 0, 2.3), 1.1, material='glass', segments=20)
    F.ring(s, 'DomeRing', (0, 0, 1.62), 2.02, 0.13, axis=(0, 0, 1), material='glow_cyan',
           segments=40, sides=8)
    F.beacon(s, 'ApexBeacon', (0, 0, 3.42), 'glow_amber', size=0.16)

    # --- ventral dish + drive core ------------------------------------------------------------
    F.sphere(s, 'Dish', (0, 0, -0.55), 2.4, material='gunmetal', segments=22)
    F.sphere(s, 'DriveCore', (0, 0, -2.45), 1.15, material='glow_cyan', segments=20)
    s.hook('HOOK_DRIVE_CORE', (0, 0, -3.0))

    # Ventral field vanes — detail tier: gone at LOD2.
    s.detail = 1
    F.boxes(s, 'FieldVanes', field_vanes(), 'gunmetal', bevel=0.02)
    s.detail = 0

    # --- lights -------------------------------------------------------------------------------
    F.light(s, 'NavPort', (0.0, R - 0.1, 0.05), 'glow_red', size=0.15)
    F.light(s, 'NavStarboard', (0.0, -R + 0.1, 0.05), 'glow_green', size=0.15)

    # --- damage hooks --------------------------------------------------------------------------
    _dmg = {o.name: o for o in s.objects}
    s.hook_part('HOOK_SECONDARY_VANE', _dmg['FieldVanes'])
    s.hook_part('HOOK_SENSOR_DOME', _dmg['ApexBeacon_Dome'], _dmg['ApexBeacon_Base'])
    s.hook_part('HOOK_DRIVE_CORE_MESH', _dmg['DriveCore'])

    # --- sockets --------------------------------------------------------------------------------
    s.socket('SOCKET_Camera_Focus', (0, 0, 0.5))
    s.socket('SOCKET_Engine_Main', (0, 0, -1.7), forward=(0, 0, -1))
    s.socket('SOCKET_Tether_Massline', (0.8, 0, -1.5))
    s.socket('SOCKET_Weapon_Front', (R - 0.2, 0, -0.1))
    s.socket('SOCKET_Weapon_Port', (0.0, R - 0.2, -0.1))
    s.socket('SOCKET_Weapon_Starboard', (0.0, -R + 0.2, -0.1))
    s.socket('SOCKET_Trail_Main', (-R + 0.9, 0, -0.35))
    s.socket('SOCKET_Trail_Port', (-7.2, 4.5, -0.35))
    s.socket('SOCKET_Trail_Starboard', (-7.2, -4.5, -0.35))
    s.socket('SOCKET_RCS_Port', (-4.0, 8.3, -0.1))
    s.socket('SOCKET_RCS_Starboard', (-4.0, -8.3, -0.1))
    s.socket('SOCKET_Utility_Dorsal', (0, 0, 1.9))
    s.socket('SOCKET_Cargo_Ventral', (0, 0, -1.3))
    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
