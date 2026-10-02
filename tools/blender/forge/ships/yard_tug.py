"""Yard Tug — Work fleet tug (also the 47-A recovery tug). All engine and push-bumper.

Plan read at the chase camera: a hammerhead — a wide rubber push-bumper on a hazard-striped beam up
front, a narrow neck under a stubby lit cab, and a massive twin-drive engine block aft with the tow
winch sitting between the drives. Rust-orange paint, graphite armour, dark machinery, yellow hazard.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402
import forge_export as E  # noqa: E402
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'animations'))
import ANI_03  # noqa: E402
import ANI_21  # noqa: E402

SHIP_ID = 'yard_tug'
COLORS = {
    'paint': '#7c3620',    # yard rust-orange (Helios key light lifts values ~2.5x: author dark)
    'paint2': '#282a2f',   # graphite armour
    'stripe': '#282a2f',
    'hazard': '#c8901e',   # safety yellow, deep enough that it never clips
    'glow_cyan.rust': '#ffd23a',  # the yard's safety yellow, lit: the T of beam bar and keel line
}


def work_lamp(s, name, base, direction, r, mirror=False):
    """Local helper: a tilted flood can on a yoke — gunmetal barrel, bright lens disc, dark bezel."""
    bx, by, bz = base
    dx, dy, dz = direction
    L = r * 1.5
    tip = (bx + dx * L, by + dy * L, bz + dz * L)
    F.box(s, name + 'Yoke', (bx, by, bz - r * 0.35), (r * 1.4, r * 1.6, r * 0.5), material='gunmetal', bevel=0.02,
          mirror=mirror)
    F.cylinder(s, name + 'Can', base, tip, r * 0.9, r, material='gunmetal', segments=18, mirror=mirror)
    lens0 = (tip[0] - dx * 0.02, tip[1] - dy * 0.02, tip[2] - dz * 0.02)
    lens1 = (tip[0] + dx * 0.04, tip[1] + dy * 0.04, tip[2] + dz * 0.04)
    F.cylinder(s, name + 'Bezel', lens0, lens1, r * 1.08, material='dark', segments=18, bevel=0.0, mirror=mirror)
    lens2 = (tip[0] + dx * 0.07, tip[1] + dy * 0.07, tip[2] + dz * 0.07)
    F.cylinder(s, name + 'Lens', lens0, lens2, r * 0.86, material='glow_warm', segments=18, bevel=0.0, mirror=mirror)


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)

    # --- Engine block: two huge boxy drive nacelles hugging a central keel -----------------------
    NY = 2.22
    F.loft(s, 'Nacelle', [
        dict(x=-12.0, w=1.02, ht=1.1, hb=1.05, zc=0.0, n=3.2, y=NY),
        dict(x=-11.3, w=1.2, ht=1.32, hb=1.25, zc=0.0, n=3.5, y=NY),
        dict(x=2.0, w=1.2, ht=1.32, hb=1.25, zc=0.0, n=3.5, y=NY),
        dict(x=3.9, w=1.08, ht=1.16, hb=1.1, zc=0.0, n=3.2, y=NY),
        dict(x=4.8, w=0.72, ht=0.76, hb=0.72, zc=0.0, n=2.8, y=NY),
        dict(x=5.1, w=0.3, ht=0.32, hb=0.3, zc=0.0, n=2.4, y=NY),
    ], material='paint', belly='paint2', back_material='dark', count=36, mirror=True)
    # hazard ring round the drive end of each nacelle
    F.band(s, 'Nacelle', (-10.35, NY, 0), (1, 0, 0), 0.55, 'hazard', inset=0.02, depth=0.02, mirror=True)
    F.band(s, 'Nacelle', (4.3, NY, 0), (1, 0, 0), 1.6, 'paint2', inset=0.02, depth=0.02, mirror=True)
    # rub strake: a raised graphite rail along each outboard flank at the waterline
    F.band(s, 'Nacelle', (0, NY, -0.05), (0, 0, 1), 0.32, 'paint2', facing=(0, 1, 0), min_facing=0.6, inset=0.02,
           depth=0.06, mirror=True)
    # graphite armour plates on the nacelle tops
    F.panel(s, 'Nacelle', (1.0, NY), (2.6, 1.6), 'paint2', inset=0.05, depth=0.04, mirror=True)
    F.panel(s, 'Nacelle', (-3.6, NY), (5.6, 1.24), 'dark', inset=0.05, depth=-0.1, mirror=True)

    F.loft(s, 'Keel', [
        dict(x=-10.6, w=1.25, ht=1.1, hb=1.0, zc=0.2, n=3.4),
        dict(x=-9.8, w=1.6, ht=1.38, hb=1.15, zc=0.2, n=3.6),
        dict(x=3.0, w=1.7, ht=1.45, hb=1.2, zc=0.2, n=3.6),
        dict(x=8.0, w=1.85, ht=1.3, hb=1.15, zc=0.15, n=3.6),
        dict(x=10.2, w=1.95, ht=1.1, hb=1.05, zc=0.1, n=3.4),
        dict(x=10.6, w=1.7, ht=0.9, hb=0.9, zc=0.1, n=3.0),
    ], material='paint', belly='paint2', back_material='dark', count=56)
    F.band(s, 'Keel', (0, 0, 0), (0, 1, 0), 0.7, 'paint2', facing=(0, 0, 1), min_facing=0.6, inset=0.02, depth=0.02)
    # ...and the T's stem: one thin lit rust-orange line down the graphite keel stripe, cab to winch
    F.band(s, 'Keel', (0, 0, 0), (0, 1, 0), 0.16, 'glow_cyan.rust', facing=(0, 0, 1), min_facing=0.6, inset=0.01,
           depth=-0.02, region=(('x', -6.3, 4.1),))
    F.band(s, 'Keel', (9.7, 0, 0), (1, 0, 0), 1.6, 'paint2')

    # --- Push bumper: hazard-striped graphite beam carrying a ribbed rubber D-fender --------------
    beam = [(9.3, 3.45), (9.6, 3.8), (10.9, 3.8), (10.9, -3.8), (9.6, -3.8), (9.3, -3.45)]
    F.plate(s, 'Beam', beam, z0=-1.0, thickness=2.25, material='paint2', chamfer=0.12, chamfer_bottom=0.08)
    for i, y in enumerate((-3.3, -2.0, -0.7, 0.6, 1.9, 3.2)):
        F.band(s, 'Beam', (10.1, y, 0), (0.7, 0.71, 0), 0.42, 'hazard', facing=(0, 0, 1), min_facing=0.5)
    # Identity trim, lit: one thin rust-orange bar along the aft edge of the beam top -- the
    # hammerhead's cross-bar the chase camera reads first (LOOK.md: lamps are light).
    F.box(s, 'BeamTrim', (9.55, 0.0, 1.27), (0.16, 7.2, 0.06), material='glow_cyan.rust', bevel=0.0)
    F.loft(s, 'Fender', [
        dict(x=10.7, w=3.6, ht=1.0, hb=1.0, zc=0.12, n=4.0),
        dict(x=11.4, w=3.68, ht=1.12, hb=1.12, zc=0.12, n=4.0),
        dict(x=12.3, w=3.55, ht=1.1, hb=1.1, zc=0.12, n=3.8),
        dict(x=12.85, w=3.05, ht=1.0, hb=1.0, zc=0.12, n=3.4),
        dict(x=13.15, w=2.0, ht=0.85, hb=0.85, zc=0.12, n=3.0),
        dict(x=13.25, w=0.6, ht=0.5, hb=0.5, zc=0.12, n=2.6),
    ], material='dark', count=36)
    # rubber ribs: raised strakes running fore-aft across the fender face
    for i, y in enumerate((-2.75, -1.65, -0.55, 0.55, 1.65, 2.75)):
        F.band(s, 'Fender', (12.0, y, 0.12), (0, 1, 0), 0.34, 'dark', inset=0.03, depth=0.07)
    # shock rams from the nacelle noses to the beam: push loads go into the drives, not the cab
    F.cylinder(s, 'RamBody', (4.5, 2.15, 0.1), (7.6, 2.8, 0.1), 0.34, material='gunmetal', mirror=True,
               cap_material='dark')
    F.cylinder(s, 'RamRod', (7.5, 2.78, 0.1), (9.5, 3.2, 0.1), 0.17, material='bare', mirror=True)
    F.cylinder(s, 'RamCollar', (7.35, 2.75, 0.1), (7.75, 2.83, 0.1), 0.42, material='hazard', mirror=True)

    # --- Cab: stubby, high, forward, glazed on three sides -----------------------------------------
    F.loft(s, 'Cab', [
        dict(x=4.2, w=1.3, ht=1.0, hb=0.55, zc=2.05, n=3.4),
        dict(x=4.8, w=1.5, ht=1.45, hb=0.6, zc=2.05, n=3.8),
        dict(x=7.3, w=1.55, ht=1.45, hb=0.6, zc=2.05, n=3.8),
        dict(x=8.5, w=1.5, ht=1.2, hb=0.6, zc=2.05, n=3.4),
        dict(x=9.15, w=1.2, ht=0.7, hb=0.55, zc=2.05, n=2.8),
        dict(x=9.3, w=0.8, ht=0.3, hb=0.5, zc=2.05, n=2.4),
    ], material='paint', count=48)
    # wraparound glazing: the whole forward brow of the cab is glass, readable from above
    F.band(s, 'Cab', (8.85, 0, 2.6), (1, 0, 0), 0.9, 'glass', facing=(1, 0, 0.6), min_facing=0.3)
    F.panel(s, 'Cab', (5.9, 0.0), (2.4, 2.1), 'paint2', inset=0.05, depth=0.05)
    F.windows(s, 'CabWin', 5.0, 8.0, 1.52, 2.5, 3, size=(0.66, 0.4), mirror=True)
    # cab plinth sinks the cab into the keel
    F.box(s, 'CabPlinth', (6.6, 0.0, 1.55), (4.6, 2.7, 0.6), material='paint2', bevel=0.04)

    # --- Drives -----------------------------------------------------------------------------------
    F.nozzle(s, 'Nozzle', (-12.95, NY, 0.0), 0.92, 1.3, material='gunmetal', mirror=True, bell=1.2)
    F.cylinder(s, 'NozzleRing', (-12.25, NY, 0.0), (-11.85, NY, 0.0), 1.16, material='paint2', mirror=True)
    F.nozzle(s, 'KeelNozzle', (-11.3, 0.0, 0.25), 0.5, 0.9, material='gunmetal')
    s.hook('HOOK_DRIVE_CORE', (-12.9, 0.0, 0.0))

    # --- Tow winch between the drives -------------------------------------------------------------
    WX, WZ = -7.6, 2.45
    F.cylinder(s, 'WinchDrum', (WX, 1.05, WZ), (WX, -1.05, WZ), 0.72, material='dark', segments=32)
    for i in range(6):
        y = -0.85 + i * 0.34
        F.cylinder(s, f'WinchCable{i}', (WX, y - 0.14, WZ), (WX, y + 0.14, WZ), 0.86, material='gunmetal',
                   segments=24, bevel=0.0)
    F.cylinder(s, 'WinchFlange', (WX, 1.05, WZ), (WX, 1.25, WZ), 1.16, material='hazard', segments=32, mirror=True)
    # index blocks on the flange rims: the drum is otherwise rotationally symmetric, so a bare
    # steel landmark per side makes its spin readable (mirrored pair keeps the look balanced)
    F.box(s, 'WinchFlangeKey', (WX, 1.18, WZ + 0.85), (0.34, 0.22, 0.3), material='bare', bevel=0.02,
          mirror=True)
    F.plate(s, 'WinchCheek', [(WX - 1.2, 1.25), (WX + 1.2, 1.25), (WX + 0.7, 1.55), (WX - 0.7, 1.55)], z0=1.1,
            thickness=1.75, material='paint2', chamfer=0.05, mirror=True)
    F.cylinder(s, 'WinchHub', (WX, 1.55, WZ), (WX, 1.72, WZ), 0.34, material='gunmetal', mirror=True)
    # cable run aft to the fairlead and tow hook — its tail sits deep in the drum wrap and its
    # tip seats inside the hook, so both ends stay engaged across the full payout travel
    F.cylinder(s, 'TowCable', (WX + 0.05, 0.0, WZ + 0.82), (-10.85, 0.0, 1.8), 0.11, material='gunmetal', segments=12)
    F.box(s, 'Fairlead', (-10.35, 0.0, 1.7), (0.9, 1.2, 0.8), material='paint2', bevel=0.05)
    F.cylinder(s, 'FairleadRoll', (-10.35, 0.5, 2.0), (-10.35, -0.5, 2.0), 0.2, material='bare', segments=16)
    F.box(s, 'TowHook', (-10.95, 0.0, 1.6), (0.5, 0.4, 0.45), material='hazard', bevel=0.04)
    s.socket('SOCKET_Tether_Massline', (-11.1, 0.0, 1.6))

    s.detail = 1
    # floodlights: big work lamps tilted up-forward (they light the hull being pushed, which towers
    # over the tug), so their lenses face the chase camera too
    work_lamp(s, 'CabFlood', (7.95, 0.95, 3.42), (0.55, 0, 0.84), 0.3, mirror=True)
    work_lamp(s, 'BeamFlood', (10.25, 3.3, 1.22), (0.55, 0, 0.84), 0.34, mirror=True)
    F.box(s, 'CabFloodBar', (7.95, 0.0, 3.36), (0.36, 2.3, 0.16), material='gunmetal', bevel=0.02)
    work_lamp(s, 'AftFlood', (-9.3, 1.0, 2.1), (-0.7, 0, 0.72), 0.22, mirror=True)
    # nacelle vents and RCS
    F.vent(s, 'NacVent', (-7.4, NY, 1.33), (1.6, 1.1, 0.12), mirror=True, slats=6)
    F.vent(s, 'KeelVent', (-1.2, 0.0, 1.66), (3.2, 0.9, 0.12), slats=8)
    F.rcs(s, 'RCSFwd', (2.6, NY + 1.12, 0.45), size=0.42, mirror=True)
    F.rcs(s, 'RCSAft', (-10.8, NY + 1.12, 0.45), size=0.42, mirror=True)
    F.antenna(s, 'CabMast', (4.9, -0.8, 3.4), 1.1, tip='glow_red')
    F.fins(s, 'WellFin', -6.1, -1.1, NY, 1.18, 0.16, 10, thickness=0.12, depth=1.05, material='gunmetal', mirror=True)
    F.cylinder(s, 'WellPipe', (-6.3, NY + 0.45, 1.3), (-0.9, NY + 0.45, 1.3), 0.08, material='bare', segments=8,
               mirror=True, bevel=0.0)
    s.detail = 0

    # --- Lights -----------------------------------------------------------------------------------
    F.light(s, 'NavPort', (-11.6, NY + 1.18, 0.2), 'glow_red', size=0.2)
    F.light(s, 'NavStarboard', (-11.6, -NY - 1.18, 0.2), 'glow_green', size=0.2)
    F.light(s, 'NavPortFwd', (10.1, 3.83, 0.6), 'glow_red', size=0.16)
    F.light(s, 'NavStarboardFwd', (10.1, -3.83, 0.6), 'glow_green', size=0.16)
    F.light(s, 'Beacon', (5.9, 0.0, 3.58), 'glow_amber.beacon', size=0.3)
    F.light(s, 'BeaconAft', (-10.35, 0.0, 2.16), 'glow_amber.beacon', size=0.18)

    # --- damage hooks: mast + tow gear shed, beacons strobe, port winch cheek lifts ----------------
    _dmg = {o.name: o for o in s.objects}
    s.hook_part('HOOK_SECONDARY_MAST', _dmg['CabMast_Mast'], _dmg['CabMast_Foot'], _dmg['CabMast_Tip'])
    s.hook_part('HOOK_SECONDARY_TOWGEAR', _dmg['Fairlead'], _dmg['FairleadRoll'], _dmg['TowHook'])
    s.hook_part('HOOK_SENSOR_BEACON', _dmg['Beacon'], _dmg['BeaconAft'])
    s.hook_part('HOOK_ARMOR_WINCH', _dmg['WinchCheek'])

    # ANI-03: massline winch payout/catch/reel/release — one bank carries all the tug's clips.
    s.ani03_bank = ANI_03.build(s, {
        'winch': [o for n, o in _dmg.items() if n.startswith('WinchDrum')
                  or n.startswith('WinchCable') or n.startswith('WinchFlange')
                  or n.startswith('WinchHub')],
        'fairlead': [_dmg['Fairlead'], _dmg['FairleadRoll']],
        'hook': [_dmg['TowHook'], _dmg['TowCable']],
    }, source_asset_id=E.fleet_spec(SHIP_ID)['asset_id'])
    # ANI-21: idle hook dangle + line quiver ride the same groups and merge into the tug's bank.
    ANI_21.build(s, None, source_asset_id=None, bank=s.ani03_bank)
    return s


if __name__ == '__main__':
    ship = build().finish()
    live = '--live' in sys.argv
    written = E.export_ship(ship, E.fleet_spec(SHIP_ID), preview=not live)
    if live:
        # The bank seals against the exported release GLBs; bake() defaults derive the file name
        # from rig_id ('yard' — wrong), so the pilot-key name is passed explicitly.
        ship.ani03_bank.bake([path for path, _tris in written],
                             out_path=os.path.join(ANI_03.motion_bank.MOTIONS_DIR,
                                                   'yard-tug.motion.json'))
