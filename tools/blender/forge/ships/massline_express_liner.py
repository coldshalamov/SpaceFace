"""Massline Express liner — Helios civic passenger liner (traffic role 'express').

Identity from the liner dossier (assets/ships/massline_express_liner_v1/G0_DOSSIER.md): a framed
boarding-and-operations wedge whose windshield is structure (panes between mullions, not a glossy
nose), then one stepped, faceted pressure drum with bulkhead seams, a dorsal spine, a boarding dock,
and a keel fairlead that answers the Massline tether. Rebuilt in Forge: Helios ivory ceramic paint,
Massline deep-teal livery with a gold pinstripe, two decks of lit passenger windows.
All fifteen gameplay sockets stay exactly where the live game expects them.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402
import forge_export as E  # noqa: E402
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'animations'))
import ANI_38  # noqa: E402

SHIP_ID = 'massline_express_liner'
COLORS = {
    'paint': '#a69d8a',      # Helios ivory ceramic paint
    'paint2': '#0f4a49',     # Massline deep teal
    'stripe': '#0f4a49',
    'hazard': '#9a7a32',     # gold pinstripe / civic brass
    'paint2.frame': '#23282e',
}

# glTF (x, y-up, z) socket positions from the live liner, in Blender axes (x, -z, y).
_GLTF = {
    'SOCKET_Camera_Focus': (0.40, 0.45, 0.00), 'SOCKET_Cargo_Ventral': (0.35, -5.28, 0.00),
    'SOCKET_Dock_Port': (3.40, 0.42, 9.35), 'SOCKET_Engine_Main': (-20.15, 0.38, 0.00),
    'SOCKET_RCS_Port': (8.80, 0.85, 9.02), 'SOCKET_RCS_Starboard': (8.80, 0.85, -9.02),
    'SOCKET_Service_Starboard': (-1.80, 0.42, -9.35), 'SOCKET_Tether_Keel': (0.35, -5.28, 0.00),
    'SOCKET_Trail_Main': (-20.85, 0.38, 0.00), 'SOCKET_Trail_Port': (-20.85, 0.38, 4.55),
    'SOCKET_Trail_Starboard': (-20.85, 0.38, -4.55), 'SOCKET_Utility_Dorsal': (4.40, 5.55, 0.00),
    'SOCKET_Weapon_Front': (17.85, 0.55, 0.00),
    # Gameplay mounts (master 4f9f96b2): the mining beam origin ahead of the bow, the Massline tether.
    'SOCKET_Mining_Front': (19.80, 0.10, 0.00), 'SOCKET_Tether_Massline': (-9.78, 0.10, 0.00),
}
SOCKETS = {k: (x, -z, y) for k, (x, y, z) in _GLTF.items()}


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)
    s.socket_names = list(SOCKETS)
    for name, pos in SOCKETS.items():
        s.socket(name, pos)

    # --- pressure drum: stepped, faceted (squarish superellipse), shouldered at both ends -------
    F.loft(s, 'Drum', [
        dict(x=-18.6, w=5.6, ht=4.4, hb=4.4, zc=0.2, n=3.4),
        dict(x=-17.4, w=6.6, ht=4.9, hb=4.8, zc=0.2, n=3.6),
        dict(x=-9.0, w=7.2, ht=5.1, hb=5.0, zc=0.2, n=3.8),
        dict(x=-8.2, w=8.4, ht=5.3, hb=5.1, zc=0.2, n=3.8),
        dict(x=5.2, w=8.6, ht=5.3, hb=5.1, zc=0.2, n=3.8),
        dict(x=7.0, w=7.8, ht=4.8, hb=4.6, zc=0.2, n=3.4),
        dict(x=9.0, w=6.8, ht=4.0, hb=4.0, zc=0.1, n=3.0),
    ], material='paint', belly='paint2.frame', back_material='dark', count=64)
    # Bulkhead seams (dark frame rings) and the teal Massline band with a gold pinstripe.
    for x in (-13.0, -8.6, -3.4, 1.8):
        F.band(s, 'Drum', (x, 0, 0), (1, 0, 0), 0.32, 'paint2.frame', inset=0.04, depth=0.06)
    F.band(s, 'Drum', (6.2, 0, 0), (1, 0, 0), 1.6, 'paint2', inset=0.03, depth=0.03)
    F.band(s, 'Drum', (4.95, 0, 0), (1, 0, 0), 0.22, 'hazard')
    # Roof course: raised ivory deck plates either side of the dorsal spine.
    F.panel(s, 'Drum', (-5.8, 3.6), (4.4, 2.8), 'paint', inset=0.08, depth=0.07, mirror=True)
    F.panel(s, 'Drum', (-0.8, 3.6), (4.4, 2.8), 'paint', inset=0.08, depth=0.07, mirror=True)
    F.panel(s, 'Drum', (-14.4, 0.0), (3.4, 6.0), 'dark', inset=0.08, depth=-0.08)

    # --- operations wedge bow: framed windshield panes with dark mullions ---------------------
    F.loft(s, 'Wedge', [
        dict(x=8.6, w=6.9, ht=4.1, hb=4.1, zc=0.1, n=3.0),
        dict(x=12.0, w=5.4, ht=3.2, hb=3.3, zc=0.0, n=2.6),
        dict(x=15.4, w=3.2, ht=2.0, hb=2.3, zc=-0.2, n=2.2),
        dict(x=17.6, w=1.2, ht=0.9, hb=1.2, zc=-0.3, n=2.0),
        dict(x=18.4, w=0.2, ht=0.2, hb=0.3, zc=-0.3, n=2.0),
    ], material='paint', belly='paint2.frame', count=56)
    F.band(s, 'Wedge', (13.4, 0, 0), (1, 0, 0), 2.6, 'glass', facing=(0.35, 0, 1), min_facing=0.35,
           inset=0.05, depth=-0.04)
    for y in (-1.6, -0.55, 0.55, 1.6):
        F.box(s, f'Mullion{y}', (13.35, y, 2.62 - abs(y) * 0.22), (2.9, 0.12, 0.14), material='paint2.frame',
              bevel=0.01, rot=(0.0, -0.42, 0.0))
    F.band(s, 'Wedge', (11.3, 0, 0), (1, 0, 0), 0.5, 'paint2')
    F.band(s, 'Wedge', (16.5, 0, 0), (1, 0, 0), 0.35, 'hazard')

    # --- dorsal spine ---------------------------------------------------------------------
    F.plate(s, 'Spine', [(9.6, 0.7), (-17.0, 0.9), (-17.0, -0.9), (9.6, -0.7)], z0=5.1, thickness=0.5,
            material='paint2', chamfer=0.18)
    for i, x in enumerate((-15.0, -10.8, -6.0, -1.2, 3.6, 7.8)):
        F.box(s, f'SpineSaddle{i}', (x, 0.0, 5.25), (0.5, 2.6, 0.45), material='paint2.frame', bevel=0.03)
    s.detail = 1
    F.windows(s, 'SkyLights', -15.5, 8.5, 0.0, 5.62, 12, size=(0.8, 0.5), finish='glow_warm', normal='z')
    s.detail = 0

    # --- observation lounges: long glazed galleries on the roof shoulders ---------------------
    for y in (3.1, -3.1):
        F.box(s, f'Gallery{y}', (-2.0, y, 5.2), (13.8, 1.7, 0.7), material='paint2.frame', bevel=0.08, taper=0.86)
        F.box(s, f'GalleryGlass{y}', (-2.0, y, 5.58), (13.2, 1.2, 0.08), material='glass', bevel=0.0)
        for i in range(7):
            F.box(s, f'GalleryRib{y}{i}', (-8.4 + i * 2.13, y, 5.62), (0.16, 1.3, 0.1), material='paint2', bevel=0.0)
        F.windows(s, f'GalleryLit{y}', -8.6, 4.6, y + (0.87 if y > 0 else -0.87), 5.2, 12, size=(0.6, 0.3),
                  finish='glow_warm')
    # --- two decks of passenger windows --------------------------------------------------------
    for z, n in ((1.35, 20), (-0.55, 20)):
        F.windows(s, f'Deck{z}', -7.6, 4.6, 8.62, z, n, size=(0.42, 0.52), finish='glow_warm', mirror=True)
    F.windows(s, 'AftDeck', -16.9, -9.6, 7.25, 1.0, 10, size=(0.36, 0.44), finish='glow_warm', mirror=True)

    # --- boarding dock (glTF 'Dock_Port' side, Blender -Y) and service hatch (+Y) ------------
    F.cylinder(s, 'DockCollar', (3.4, -8.3, 0.4), (3.4, -9.5, 0.4), 1.25, 1.1, material='gunmetal',
               cap_material='dark', segments=32)
    F.ring(s, 'DockRing', (3.4, -9.45, 0.4), 1.2, 0.09, axis=(0, 1, 0), material='hazard')
    F.box(s, 'ServiceHatch', (-1.8, 8.72, 0.4), (2.2, 0.2, 1.8), material='paint2.frame', bevel=0.03)
    F.light(s, 'DockLamp', (3.4, -8.9, 1.85), 'glow_amber', size=0.18)

    # --- keel tether fairlead (Massline answer) ------------------------------------------------
    F.box(s, 'KeelSkeg', (0.35, 0.0, -4.7), (6.0, 1.6, 1.0), material='paint2.frame', bevel=0.06, taper=0.8)
    F.ring(s, 'Fairlead', (0.35, 0.0, -5.28), 0.7, 0.18, axis=(0, 0, 1), material='gunmetal')

    # --- drive: three nozzles in a shouldered stern block -------------------------------------
    F.box(s, 'SternBlock', (-19.4, 0.0, 0.3), (1.8, 12.4, 6.6), material='paint2.frame', bevel=0.12)
    F.band(s, 'SternBlock', (-19.4, 0, 0), (1, 0, 0), 0.5, 'paint2', facing=(0, 0, 1))
    for y in (4.55, 0.0, -4.55):
        F.nozzle(s, f'Drive{y}', (-21.2, y, 0.38), 1.7 if y == 0 else 1.35, 1.3, material='gunmetal')
    s.hook('HOOK_DRIVE_CORE', (-21.1, 0.0, 0.38))

    # --- detail --------------------------------------------------------------------------------
    s.detail = 1
    F.rcs(s, 'RCSFwd', (8.8, 7.0, 0.85), size=0.6, mirror=True)
    F.rcs(s, 'RCSAft', (-16.0, 6.6, 0.85), size=0.55, mirror=True)
    F.dish(s, 'CommsDish', (-12.4, 2.4, 5.3), 0.9, 0.25, axis=(-0.4, 0.3, 1))
    F.antenna(s, 'Mast', (-10.0, -2.2, 5.3), 2.0, tip='glow_red')
    F.vent(s, 'Vent', (-17.0, 3.8, 4.6), (1.6, 1.2, 0.2), mirror=True)
    s.detail = 0
    F.light(s, 'NavPort', (-17.2, 8.2, 0.9), 'glow_red', size=0.3)
    F.light(s, 'NavStarboard', (-17.2, -8.2, 0.9), 'glow_green', size=0.3)
    F.beacon(s, 'Beacon', (-17.8, 0.0, 5.3), size=0.35)
    s.ani38_bank = ANI_38.build(s, list(s.objects), source_asset_id=E.fleet_spec(SHIP_ID)['asset_id'])
    return s


if __name__ == '__main__':
    ship = build().finish()
    live = '--live' in sys.argv
    written = E.export_ship(ship, E.fleet_spec(SHIP_ID), preview=not live)
    if live:
        ANI_38.bake_ship_banks(ship, written, bank_key=E.fleet_spec(SHIP_ID)['file'].replace('_', '-'))
