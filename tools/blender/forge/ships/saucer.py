"""Saucer — tier-5 exotic player hull (design/FLYING_SAUCER_DESIGN.md). Lit-rim gunmetal disc.

Plan read at the chase camera: a featureless lenticular silhouette — the only ship in the
fleet with no nose, no tail, no preferred facing. The identity lives in the rim: a bezel of
dark machinery carrying an unbroken chain of cyan field lamps, a low metallic dome ringed by
warm portholes under a dark glass crown, and a ventral dish whose gyroscope-caged glowing
core is the drive. Radial seams break the upper shell into plates so the disc reads
manufactured, not sculpted, and three field-emitter turrets ride the rim edge.
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402
import forge_export as E  # noqa: E402
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'animations'))
import ANI_38  # noqa: E402

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


def rim_tabs():
    """Small armour tabs alternating with the lamps on the outer rim face — the bead chain
    reads as machinery seated in a toothed edge, not a string of fairy lights."""
    tabs = []
    for k in range(24):
        a = 2 * math.pi * (k + 0.5) / 24
        x = (R - 0.02) * math.cos(a)
        y = (R - 0.02) * math.sin(a)
        tabs.append(((x, y, RIM_Z - 0.02), (0.30, 0.34, 0.30), a))
    return tabs


def portholes():
    """A warm-lit porthole ring around the dome's waist — the classic flying-saucer icon."""
    ports = []
    for k in range(10):
        a = 2 * math.pi * k / 10
        ports.append(((1.985 * math.cos(a), 1.985 * math.sin(a), 1.44),
                      (0.34, 0.12, 0.18), a + math.pi / 2))
    return ports


def field_vanes():
    """Eight ventral field fins on the belly slope — swept fins with glowing emitter tips."""
    vanes = []
    tips = []
    for i in range(8):
        a = i * math.pi / 4 + math.pi / 8
        x = 5.55 * math.cos(a)
        y = 5.55 * math.sin(a)
        vanes.append(((x, y, -0.88), (2.1, 0.16, 0.72), a))
        tips.append(((6.55 * math.cos(a), 6.55 * math.sin(a), -1.06), (0.30, 0.14, 0.18), a))
    return vanes, tips


def emitter_turret(s, name, x, y, z, yaw=0.0, sc=1.0, barrels=2):
    """A rim field-emitter turret — the fleet's barbette/collar/mantlet vocabulary spoken in
    saucer: faceted armoured cupola on a dark collar, emitter barrels ending in amber lenses.
    Barrels run along local +x rotated by yaw."""
    c, sn = math.cos(yaw), math.sin(yaw)

    def P(dx, dy, dz=0.0):
        return (x + (dx * c - dy * sn) * sc, y + (dx * sn + dy * c) * sc, z + dz * sc)

    F.cylinder(s, name + '_Barbette', P(0, 0, -0.30), P(0, 0, 0.20), 0.62 * sc,
               material='paint2', segments=16, cap_material='dark', bevel=0.0)
    F.cylinder(s, name + '_Collar', P(0, 0, 0.02), P(0, 0, 0.15), 0.72 * sc,
               material='stripe', segments=16, bevel=0.0)
    house = [(0.55, 0.50), (0.72, 0.28), (0.72, -0.28), (0.55, -0.50),
             (-0.55, -0.50), (-0.70, -0.30), (-0.70, 0.30), (-0.55, 0.50)]
    F.plate(s, name + '_House', [P(dx, dy)[:2] for dx, dy in house], z0=z + 0.14 * sc,
            thickness=0.52 * sc, material='paint2', chamfer=0.16 * sc, bevel=0.02)
    F.box(s, name + '_Mantlet', P(0.62, 0, 0.30), (0.30 * sc, (0.32 * barrels + 0.18) * sc, 0.32 * sc),
          material='gunmetal', rot_z=yaw, bevel=0.0)
    offs = [(i - (barrels - 1) / 2) * 0.32 for i in range(barrels)]
    for i, dy in enumerate(offs):
        F.cylinder(s, f'{name}_Sleeve{i}', P(0.72, dy, 0.30), P(1.06, dy, 0.30), 0.11 * sc,
                   0.09 * sc, material='gunmetal', segments=10, bevel=0.0)
        F.cylinder(s, f'{name}_Emitter{i}', P(1.02, dy, 0.30), P(1.74, dy, 0.30), 0.065 * sc,
                   0.055 * sc, material='gunmetal', segments=10, bevel=0.0)
        F.cylinder(s, f'{name}_Lens{i}', P(1.64, dy, 0.30), P(1.88, dy, 0.30), 0.085 * sc,
                   0.05 * sc, material='glow_amber', segments=10, bevel=0.0)
    # Rear feed spine — the emitter's power bus, and the silhouette that sells the turret.
    F.box(s, name + '_Spine', P(-0.45, 0, 0.60), (0.24 * sc, 0.52 * sc, 0.18 * sc),
          material='gunmetal', rot_z=yaw, bevel=0.0)


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)

    # --- the disc ---------------------------------------------------------------------------
    F.loft(s, 'Disc', disc_sections(), material='paint', belly='gunmetal',
           back_material='paint2', count=40)

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
    # A continuous glow groove the lamps sit in, then the unbroken lamp chain and the
    # armour tabs between them.
    F.ring(s, 'RimGroove', (0, 0, RIM_Z + 0.04), R - 0.28, 0.07, axis=(0, 0, 1),
           material='glow_cyan', segments=40, sides=6)
    F.boxes(s, 'RimLights', rim_beads(), 'glow_cyan', bevel=0.02)
    F.boxes(s, 'RimVents', rim_vents(), 'dark', bevel=0.02)
    F.boxes(s, 'RimTabs', rim_tabs(), 'paint2', bevel=0.02)

    # --- guns: three field-emitter turrets riding the rim edge --------------------------------
    # Flank hardpoints fire broadside; the chin turret owns the forward arc. On a disc the
    # rim is the only place a gun silhouette survives the planform.
    emitter_turret(s, 'GunPort', 0.2, R - 0.45, -0.02, yaw=math.pi / 2, barrels=2)
    emitter_turret(s, 'GunStarboard', 0.2, -R + 0.45, -0.02, yaw=-math.pi / 2, barrels=2)
    emitter_turret(s, 'TurretFront', R - 0.55, 0, -0.48, yaw=0.0, sc=1.15, barrels=4)

    # --- dorsal dome ------------------------------------------------------------------------
    # Metallic dome with a warm porthole ring, a dark glass crown and a cyan base ring.
    F.sphere(s, 'Dome', (0, 0, 1.2), 2.0, material='gunmetal', segments=26)
    F.boxes(s, 'DomePorts', portholes(), 'glow_warm', bevel=0.02)
    F.sphere(s, 'DomeGlass', (0, 0, 2.3), 1.1, material='glass', segments=20)
    F.ring(s, 'DomeRing', (0, 0, 1.62), 2.02, 0.13, axis=(0, 0, 1), material='glow_cyan',
           segments=40, sides=8)
    F.ring(s, 'GlassCollar', (0, 0, 2.05), 1.08, 0.05, axis=(0, 0, 1), material='dark',
           segments=24, sides=5)
    F.beacon(s, 'ApexBeacon', (0, 0, 3.42), 'glow_amber', size=0.16)
    F.antenna(s, 'MastAntenna', (1.15, 0, 2.55), 0.85, tip='glow_cyan')

    # Dorsal sensor blisters — low domes flanking the crown, lenses looking forward.
    F.sensor_dome(s, 'SensorBlisterFore', (3.5, 2.7, 1.10), 0.5, material='paint2', lens='glow_cyan')
    F.sensor_dome(s, 'SensorBlisterAft', (-3.5, -2.7, 1.10), 0.5, material='paint2', lens='glow_cyan')

    # --- ventral dish + caged drive core ------------------------------------------------------
    # A real concave bowl with a feed stalk; the glowing core hangs in the dish mouth inside
    # a gyroscope cage of three machine rings — the field drive, worn on the outside.
    F.dish(s, 'Dish', (0, 0, -0.90), 2.7, 0.75, axis=(0, 0, -1), material='gunmetal',
           face='dark', segments=28, feed=None)
    F.ring(s, 'DishThroat', (0, 0, -1.62), 1.55, 0.07, axis=(0, 0, 1),
           material='glow_cyan', segments=24, sides=6)
    F.sphere(s, 'DriveCore', (0, 0, -2.45), 1.15, material='glow_cyan', segments=20)
    F.ring(s, 'CageH', (0, 0, -2.45), 1.52, 0.05, axis=(0, 0, 1), material='paint2',
           segments=18, sides=5)
    F.ring(s, 'CageX', (0, 0, -2.45), 1.52, 0.05, axis=(1, 0, 0), material='paint2',
           segments=18, sides=5)
    F.ring(s, 'CageY', (0, 0, -2.45), 1.52, 0.05, axis=(0, 1, 0), material='paint2',
           segments=18, sides=5)
    s.hook('HOOK_DRIVE_CORE', (0, 0, -3.2))

    # Ventral field vanes with lit tips — detail tier: gone at LOD2.
    s.detail = 1
    vanes, tips = field_vanes()
    F.boxes(s, 'FieldVanes', vanes, 'gunmetal', bevel=0.02)
    F.boxes(s, 'FieldVaneTips', tips, 'glow_cyan', bevel=0.02)
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
    s.socket('SOCKET_Engine_Main', (0, 0, -3.1), forward=(0, 0, -1))
    s.socket('SOCKET_Tether_Massline', (0.8, 0, -1.9))
    s.socket('SOCKET_Weapon_Front', (R + 0.9, 0, -0.18))
    s.socket('SOCKET_Weapon_Port', (0.35, R + 0.5, 0.10))
    s.socket('SOCKET_Weapon_Starboard', (0.35, -R - 0.5, 0.10))
    s.socket('SOCKET_Trail_Main', (-R + 0.9, 0, -0.35))
    s.socket('SOCKET_Trail_Port', (-7.2, 4.5, -0.35))
    s.socket('SOCKET_Trail_Starboard', (-7.2, -4.5, -0.35))
    s.socket('SOCKET_RCS_Port', (-4.0, 8.3, -0.1))
    s.socket('SOCKET_RCS_Starboard', (-4.0, -8.3, -0.1))
    s.socket('SOCKET_Utility_Dorsal', (0, 0, 1.9))
    s.socket('SOCKET_Cargo_Ventral', (0, 0, -1.9))
    s.ani38_bank = ANI_38.build(s, list(s.objects), source_asset_id=E.fleet_spec(SHIP_ID)['asset_id'])
    return s


if __name__ == '__main__':
    ship = build().finish()
    live = '--live' in sys.argv
    written = E.export_ship(ship, E.fleet_spec(SHIP_ID), preview=not live)
    if live:
        ANI_38.bake_ship_banks(ship, written, bank_key=E.fleet_spec(SHIP_ID)['file'].replace('_', '-'))
