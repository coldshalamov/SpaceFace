"""place_landmark_cut_saw — The Cut Saw, Hyperion Cut (sector_hyperion_cut). Forge build.

The audit's monumental landmark for the open cut (WORLD_PLACEMENT_AUDIT §8.15, AEP ID-L):
a giant tracked saw assembly parked mid-stroke on the rock it is slicing in two. Reads from
the top-down camera as a long cut running through a moonlet's split halves, with the saw
carriage and its huge circular blade standing in the kerf.

Built at real metres (~230 m across); the runtime scales places to their gameplay radius.
Sockets: SOCKET_Structure_Core at the blade hub (the machine's visual centre), SOCKET_Camera_Focus
a little above it.

    blender -b --python tools/blender/forge/ships/place_landmark_cut_saw.py
    node scripts/fleet-look.mjs --file=assets/ships/forge/preview/place_landmark_cut_saw.glb \\
      --name=place_landmark_cut_saw --views=inspect,close,top --out=.devshots/forge-cut-saw
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402

SHIP_ID = 'place_landmark_cut_saw'

# Hyperion work-site palette: quarry ochre and charcoal machinery over blasted grey rock;
# the only identity colour is the hazard orange of the saw rig's running gear and lamps.
COLORS = {
    'stone': '#4b4640',       # blasted moonlet stone — mid grey-brown, matte (geology finish)
    'stone.kerfed': '#2e2b28',  # the shadowed kerf walls and rubble floor — same geology finish
    'paint': '#8a5a1e',       # saw-rig ochre — quarry machinery yellow, dulled for the key lift
    'paint2': '#2b2b2e',      # charcoal frame, track bed, counterweight
    'stripe': '#9c7a2a',
    'hazard': '#b88a22',      # hazard bands + kerf markers
    'gunmetal': '#3a3d40',
}

# Overall envelope (metres): the cut runs along X; the moonlet halves sit either side (±Y).
CUT_L = 190.0          # length of the open cut / track bed
MOON_R = 34.0          # each moonlet half's rough radius
KERF_W = 14.0          # the sawn gap between the halves
TRACK_Y = 0.0
BLADE_R = 30.0         # the great blade — reads monumental at 4-8 player ships
BLADE_HUB_Y = -2.0     # blade spins in the vertical XZ plane (axis = Y)


def _moonlet_half(s, side):
    """One ragged half of the split moonlet: a stacked mass of rock plates, its sawn face
    a flat clean wall facing the kerf (cut faces are smooth — blasted faces are not)."""
    cy = side * (KERF_W / 2 + MOON_R * 0.62)
    # Three offset slabs make a mass that reads ROCK from above, not a rounded lump:
    # a broad base slab, a shorter upper slab, and a small shoulder mass toward the cut's start.
    F.box(s, f'Moon{side}Base', (0, cy, -MOON_R * 0.32),
          (CUT_L * 0.62, MOON_R * 1.24, MOON_R * 0.95), material='stone', bevel=3.2)
    F.box(s, f'Moon{side}Top', (-CUT_L * 0.10, cy + side * 2.0, MOON_R * 0.28),
          (CUT_L * 0.40, MOON_R * 0.86, MOON_R * 0.62), material='stone', bevel=2.6)
    F.box(s, f'Moon{side}Shoulder', (-CUT_L * 0.34, cy - side * 4.0, -MOON_R * 0.05),
          (CUT_L * 0.20, MOON_R * 0.9, MOON_R * 0.7), material='stone', bevel=2.4)
    # The sawn face: a clean, slightly darker plate standing just outboard of the kerf —
    # the polished wall the blade left behind. Rubble teeth along its base where fragments
    # broke away instead of shearing clean.
    face_y = side * KERF_W * 0.5
    F.box(s, f'CutFace{side}', (0, face_y + side * 0.4, -MOON_R * 0.30),
          (CUT_L * 0.60, 1.2, MOON_R * 0.9), material='stone.kerfed', bevel=0.35)
    for i in range(9):
        x = -CUT_L * 0.27 + i * (CUT_L * 0.54 / 8)
        h = 2.0 + (i * 7 % 5) * 1.1
        F.box(s, f'Kerth{side}_{i}', (x, face_y - side * 1.1, -MOON_R * 0.30 + h * 0.5 - MOON_R * 0.45),
              (3.2 + (i % 3), 1.6, h), material='stone.kerfed', bevel=0.5, rot_z=(i * 37 % 11 - 5) * 0.02)
    # Drill collars + shot anchors down the blasted face (the work that precedes the saw).
    for i in range(6):
        x = -CUT_L * 0.24 + i * (CUT_L * 0.44 / 5)
        F.cylinder(s, f'Drill{side}_{i}', (x, cy + side * MOON_R * 0.30, MOON_R * 0.22),
                   (x, cy + side * MOON_R * 0.30, MOON_R * 0.30), 0.5, material='gunmetal',
                   segments=10, bevel=0.05)


def _track_bed(s):
    """The saw's runway: twin rails on a ballast bed running the full cut, with sleeper
    cross-ties and end stops. The machine must sit ON something — nothing floats."""
    bed_y = 0.0
    F.box(s, 'TrackBed', (0, bed_y, -MOON_R * 0.30 - 0.4),
          (CUT_L, 7.5, 1.6), material='paint2', bevel=0.3)
    for sy in (-1, 1):
        F.box(s, f'Rail{sy}', (0, bed_y + sy * 2.4, -MOON_R * 0.30 + 0.7),
              (CUT_L, 0.5, 0.55), material='gunmetal', bevel=0.08)
    for i in range(19):
        x = -CUT_L * 0.48 + i * (CUT_L * 0.96 / 18)
        F.box(s, f'Tie{i}', (x, bed_y, -MOON_R * 0.30 - 0.1),
              (1.1, 6.4, 0.5), material='gunmetal', bevel=0.06)
    for sx in (-1, 1):
        F.box(s, f'Stop{sx}', (sx * (CUT_L * 0.5 - 1.5), bed_y, -MOON_R * 0.30 + 1.0),
              (3.0, 6.0, 2.6), material='hazard', bevel=0.3)


def _saw_carriage(s, cx):
    """The saw rig: a gantry carriage straddling the kerf, carrying the blade hub and the
    drive housing. The blade hangs below the carriage, half-buried in the kerf."""
    # Gantry frame: four legs off the rails, cross-beams over the cut.
    leg_h = 16.0
    for sx in (-1, 1):
        for sy in (-1, 1):
            F.box(s, f'Leg{sx}{sy}', (cx + sx * 9.0, TRACK_Y + sy * 4.6, -MOON_R * 0.30 + leg_h * 0.5),
                  (2.2, 2.2, leg_h), material='paint2', bevel=0.35)
    F.box(s, 'BeamA', (cx - 9.0, TRACK_Y, -MOON_R * 0.30 + leg_h),
          (2.6, 13.5, 3.0), material='paint', bevel=0.4)
    F.box(s, 'BeamB', (cx + 9.0, TRACK_Y, -MOON_R * 0.30 + leg_h),
          (2.6, 13.5, 3.0), material='paint', bevel=0.4)
    F.box(s, 'BeamTop', (cx, TRACK_Y, -MOON_R * 0.30 + leg_h + 1.6),
          (21.0, 2.6, 2.0), material='paint', bevel=0.3)
    F.band(s, 'BeamA', (cx - 9.0, TRACK_Y, -MOON_R * 0.30 + leg_h), (0, 0, 1), 1.2, 'hazard')
    F.band(s, 'BeamB', (cx + 9.0, TRACK_Y, -MOON_R * 0.30 + leg_h), (0, 0, 1), 1.2, 'hazard')

    # Drive housing above the hub: motor block, gearbox dome, cooling vents, service crane.
    F.box(s, 'Drive', (cx + 2.0, TRACK_Y, -MOON_R * 0.30 + leg_h + 4.6),
          (8.5, 6.0, 5.2), material='paint', bevel=0.6)
    F.cylinder(s, 'GearDome', (cx + 2.0, TRACK_Y, -MOON_R * 0.30 + leg_h + 7.0),
               (cx + 2.0, TRACK_Y, -MOON_R * 0.30 + leg_h + 8.6), 2.6, material='paint2',
               segments=16, bevel=0.3)
    F.vent(s, 'DriveVent', (cx - 2.6, TRACK_Y, -MOON_R * 0.30 + leg_h + 4.4), (0.4, 5.0, 3.4),
           frame='gunmetal', slats=5, axis='x')
    F.truss(s, 'Crane', (cx + 6.4, TRACK_Y + 1.8, -MOON_R * 0.30 + leg_h + 6.4),
            (cx + 15.0, TRACK_Y + 1.8, -MOON_R * 0.30 + leg_h + 9.2), 0.7, 3, material='gunmetal')
    # Counterweight over the back legs — the rig is visibly balanced on its rails.
    F.box(s, 'Counterweight', (cx - 13.5, TRACK_Y, -MOON_R * 0.30 + leg_h - 2.0),
          (4.6, 7.5, 5.5), material='paint2', bevel=0.5)
    F.band(s, 'Counterweight', (cx - 13.5, TRACK_Y, -MOON_R * 0.30 + leg_h - 2.0),
           (0, 0, 1), 1.4, 'hazard')


def _blade(s, cx):
    """The monumental blade: a huge toothed disc standing in the kerf, axis across Y.
    Hub, rim segments, tooth ring, and the cool-down spray bar above the cut."""
    hub_z = -MOON_R * 0.30 + 6.0
    # Rim: a flat ring — the blade plate proper. Teeth around it as separate boxes so the
    # silhouette reads SAW at landmark scale.
    F.ring(s, 'BladeRim', (cx, BLADE_HUB_Y, hub_z), BLADE_R, 4.2, axis=(0, 1, 0),
           material='paint', segments=44, sides=10)
    # Blade plate (thin disc filling the rim, just proud of the ring faces).
    F.cylinder(s, 'BladePlate', (cx, BLADE_HUB_Y - 0.55, hub_z), (cx, BLADE_HUB_Y + 0.55, hub_z),
               BLADE_R - 1.5, material='gunmetal', segments=44, bevel=0.2)
    # Teeth: individual carbide tips around the rim — the one detail that must read at 200 m.
    teeth = 26
    for i in range(teeth):
        a = i * math.tau / teeth
        tx = cx + math.cos(a) * (BLADE_R + 1.3)
        tz = hub_z + math.sin(a) * (BLADE_R + 1.3)
        F.box(s, f'Tooth{i}', (tx, BLADE_HUB_Y, tz), (2.6, 1.7, 3.4),
              material='hazard', bevel=0.25, rot=(0, -a, 0))
    # Hub: the spindle the blade turns on, with bearing housing at the carriage beam.
    F.cylinder(s, 'Hub', (cx, BLADE_HUB_Y - 3.4, hub_z), (cx, BLADE_HUB_Y + 2.6, hub_z),
               4.2, material='paint2', segments=18, bevel=0.4)
    F.ring(s, 'HubCollar', (cx, BLADE_HUB_Y + 0.9, hub_z), 5.4, 1.0, axis=(0, 1, 0),
           material='gunmetal', segments=20, sides=8)
    # Spray bar: coolant line over the kerf, nozzles angled at the blade's working edge.
    F.cylinder(s, 'SprayBar', (cx + 1.0, TRACK_Y - KERF_W * 0.62, hub_z + BLADE_R * 0.42),
               (cx + 1.0, TRACK_Y + KERF_W * 0.62, hub_z + BLADE_R * 0.42), 0.35,
               material='gunmetal', segments=10)
    for i in range(4):
        ny = TRACK_Y - KERF_W * 0.42 + i * (KERF_W * 0.84 / 3)
        F.cylinder(s, f'Nozzle{i}', (cx + 1.0, ny, hub_z + BLADE_R * 0.42),
                   (cx + 1.0, ny, hub_z + BLADE_R * 0.42 - 2.6), 0.18, material='gunmetal',
                   segments=8)


def _site_dressing(s):
    """The open cut is a workplace, not a monument: spoil heaps, a survey mast, kerf-side
    work lamps, and a debris conveyor stub feeding off the cut's mouth."""
    # Spoil heaps at the cut's mouth (-X end): two low mounds of fresh tailings.
    for i, (x, y, r) in enumerate([(-CUT_L * 0.52, -26, 9), (-CUT_L * 0.50, 24, 7), (-CUT_L * 0.56, 8, 11)]):
        F.cylinder(s, f'Spoil{i}', (x, y, -MOON_R * 0.45), (x, y, -MOON_R * 0.45 + r * 0.5),
                   r, material='stone.kerfed', segments=9, bevel=1.2)
    # Survey mast at the far end of the cut: a thin tower with a working lamp and a flag spar.
    mx = CUT_L * 0.46
    F.cylinder(s, 'Mast', (mx, 14.0, -MOON_R * 0.30), (mx, 14.0, -MOON_R * 0.30 + 22.0),
               0.5, material='gunmetal', segments=8)
    F.truss(s, 'MastBrace', (mx, 14.0, -MOON_R * 0.30 + 8.0), (mx - 6.0, 14.0, -MOON_R * 0.30),
            0.3, 2, material='gunmetal')
    F.work_lamp(s, 'MastLamp', (mx, 14.0, -MOON_R * 0.30 + 22.4), aim=(0.0, -0.2, -1.0), size=0.9)
    F.beacon(s, 'MastBeacon', (mx, 14.0, -MOON_R * 0.30 + 24.2), finish='glow_amber', size=0.7)
    # Kerf-side work lamps so the gap reads LIT, not a void: alternating hazard markers.
    for i in range(7):
        x = -CUT_L * 0.30 + i * (CUT_L * 0.60 / 6)
        side = 1 if i % 2 == 0 else -1
        F.work_lamp(s, f'KerfLamp{i}', (x, side * KERF_W * 0.46, -MOON_R * 0.30 + 2.0),
                    aim=(0.0, -side * 0.3, -1.0), size=0.6)
    # Conveyor stub lifting spoil out of the cut mouth toward the (unmodelled) works.
    F.truss(s, 'Conveyor', (-CUT_L * 0.46, -8.0, -MOON_R * 0.30 + 1.0),
            (-CUT_L * 0.58, -18.0, -MOON_R * 0.30 + 7.5), 2.6, 4, material='paint2')
    F.box(s, 'ConveyorHead', (-CUT_L * 0.58, -18.0, -MOON_R * 0.30 + 7.0),
          (4.0, 4.5, 3.0), material='paint', bevel=0.4)


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)
    _moonlet_half(s, -1)
    _moonlet_half(s, 1)
    _track_bed(s)
    # The carriage sits a third of the way along the cut, mid-stroke.
    cx = CUT_L * 0.12
    _saw_carriage(s, cx)
    _blade(s, cx)
    _site_dressing(s)

    s.socket_names = ['SOCKET_Structure_Core', 'SOCKET_Camera_Focus']
    s.socket('SOCKET_Structure_Core', (cx, BLADE_HUB_Y, -MOON_R * 0.30 + 6.0))
    s.socket('SOCKET_Camera_Focus', (cx * 0.3, 0.0, -MOON_R * 0.30 + 26.0))
    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    live = '--live' in sys.argv
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview=not live)
