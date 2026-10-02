"""Kestrel SF-K0 "Borrowed Time" (Hitch) — the starter. Forge rebuild of the owner's design.

Identity kept from the owner-supplied source blend (assets/ships/kestrel_borrowed_time_v4): a long
conical pressure hull on an axial drive drum, two armoured shoulder sponsons with radiator combs,
a dorsal spine over a long low canopy, twin bow guns, a mining head under the chin, a salvage-green
repair pod on the port shoulder, a dorsal sensor dish. What changed is the build: clean forge
surfaces (no grime/scratch noise), crisp bevelled armour, one livery, lights where a crew needs them.
All nine gameplay sockets sit exactly where the live game expects them.
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402
import forge as F  # noqa: E402
import forge_export as E  # noqa: E402
import skin  # noqa: E402
import stencil  # noqa: E402
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'animations'))
import ANI_01  # noqa: E402
import ANI_02  # noqa: E402
import ANI_05  # noqa: E402
import ANI_06  # noqa: E402
import ANI_07  # noqa: E402
import ANI_18  # noqa: E402
import ANI_17  # noqa: E402
import ANI_16  # noqa: E402

SHIP_ID = 'kestrel'


def E_spec_asset_id():
    return E.fleet_spec(SHIP_ID)['asset_id']


COLORS = {
    'paint': '#2b5159',        # Hitch steel-teal pressure hull (Helios key light lifts it ~2.5x)
    'paint2': '#25282c',       # warm charcoal armour
    'stripe': '#23a0a0',       # frontier cyan livery
    'hazard': '#d4712a',       # warning orange
    'paint.green': '#3d5a2a',  # salvage-green repair pod
    'paint2.ivory': '#b3aa94', # hull markings
}

# glTF (x, y-up, z-starboard) positions pinned by scripts/check-kestrel-wholeship-runtime.mjs,
# written here in Blender axes (x, -z, y).
SOCKETS = {
    'SOCKET_Weapon_Front': (12.62, 0.0, 1.43), 'SOCKET_Mining_Front': (12.26, 0.0, -1.08),
    'SOCKET_Engine_Main': (-13.85, 0.0, 0.0), 'SOCKET_Trail_Main': (-14.05, 0.0, 0.0),
    'SOCKET_Utility_Dorsal': (-1.45, 3.8, 1.95), 'SOCKET_Cargo_Ventral': (-0.8, 0.0, -2.1),
    'SOCKET_Camera_Focus': (0.0, 0.0, 0.35), 'SOCKET_RCS_Port': (1.6, 6.6, 0.45),
    'SOCKET_RCS_Starboard': (1.6, -6.6, 0.45),
}


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)
    s.socket_names = list(SOCKETS)
    s.collision_scale = 0.92
    for name, pos in SOCKETS.items():
        s.socket(name, pos)

    # --- pressure hull: drum aft, long taper to an armoured bow wedge -------------------------
    F.loft(s, 'PressureHull', [
        dict(x=-12.4, w=2.55, ht=2.35, hb=2.15, zc=0.0, n=2.15),
        dict(x=-11.6, w=2.75, ht=2.5, hb=2.3, zc=0.0, n=2.2),
        dict(x=-7.5, w=2.8, ht=2.4, hb=2.2, zc=0.05, n=2.3),
        dict(x=-2.0, w=2.55, ht=2.05, hb=1.95, zc=0.1, n=2.4),
        dict(x=3.5, w=2.05, ht=1.7, hb=1.6, zc=0.12, n=2.5),
        dict(x=8.0, w=1.45, ht=1.3, hb=1.2, zc=0.12, n=2.6),
        dict(x=11.2, w=0.85, ht=0.85, hb=0.8, zc=0.1, n=2.4),
        dict(x=12.9, w=0.25, ht=0.3, hb=0.3, zc=0.05, n=2.0),
    ], material='paint', belly='paint2', back_material='dark', count=64)
    # Hull courses: three frame bands (raised charcoal rings) and a cyan livery ring forward.
    for x in (-9.6, -4.6, 0.6):
        F.band(s, 'PressureHull', (x, 0, 0), (1, 0, 0), 0.34, 'paint2', inset=0.03, depth=0.05)
    F.band(s, 'PressureHull', (6.2, 0, 0), (1, 0, 0), 0.55, 'stripe', inset=0.02, depth=0.02)
    F.band(s, 'PressureHull', (5.2, 0, 0), (1, 0, 0), 0.16, 'hazard')
    # Recessed service bays along the flanks (dark wells), raised roof plates.
    F.panel(s, 'PressureHull', (-7.2, 0.0), (2.4, 2.2), 'paint', inset=0.05, depth=0.04)
    F.panel(s, 'PressureHull', (-2.4, 0.0), (2.2, 2.0), 'paint', inset=0.05, depth=0.04)

    # --- bow: armoured brow over twin guns, chin mining head ---------------------------------
    F.plate(s, 'Brow', [(12.4, 0.55), (8.2, 1.35), (6.6, 1.2), (6.6, -1.2), (8.2, -1.35), (12.4, -0.55)],
            z0=0.72, thickness=0.42, material='paint2', chamfer=0.22, side_material='paint2')
    for y in (0.34, -0.34):
        F.cylinder(s, f'GunBarrel{y}', (8.0, y, 1.33), (13.3, y, 1.33), 0.11, material='gunmetal')
        F.cylinder(s, f'GunJacket{y}', (8.2, y, 1.33), (10.8, y, 1.33), 0.2, 0.18, material='gunmetal',
                   cap_material='dark')
        F.cylinder(s, f'GunMuzzle{y}', (13.0, y, 1.33), (13.4, y, 1.33), 0.14, material='dark')
    F.box(s, 'GunReceiver', (7.8, 0.0, 1.3), (1.4, 1.1, 0.42), material='gunmetal', bevel=0.03)
    # Mining head: a clamp frame with an orange cutter lens under the chin.
    F.box(s, 'MiningClamp', (11.1, 0.0, -0.95), (2.0, 0.9, 0.55), material='gunmetal', bevel=0.04, taper=0.85)
    cutter = F.cylinder(s, 'MiningCutter', (11.9, 0.0, -1.05), (12.75, 0.0, -1.05), 0.34, 0.24, material='dark',
                        cap_material='glow_amber')
    F.band(s, 'MiningClamp', (11.1, 0, 0), (1, 0, 0), 0.3, 'hazard')

    # --- canopy under the dorsal spine -------------------------------------------------------
    canopy = F.canopy(s, 'Canopy', x0=2.6, x1=7.2, w=0.78, h=0.52, z=1.62, peak=0.55, frame=False)
    # Canopy hardware rides the canopy: four dark frame arches over the glass and a coaming along each
    # lower edge, seated on the real glass skin. Built here so ANI-17 hangs them on the canopy's hinge:
    # when the lid opens on a repair job its frame goes with it.
    bpy.context.view_layer.update()
    canopy_kit = [canopy]
    s.detail = 2
    for x in (3.5, 4.6, 5.7, 6.6):
        path = [p for p in skin.run('Canopy', [(x, y / 10.0) for y in range(-8, 9)], 0.025) if p[2] > 1.7]
        if len(path) > 2:
            canopy_kit.append(F.sweep(s, f'CanopyArch{x}', path, 0.13, 0.08, material='gunmetal', bevel=0.0))
    for side in (1, -1):
        path = []
        for x in (2.9, 3.4, 4.0, 4.6, 5.2, 5.8, 6.4, 6.9):
            ok, loc, _n, _i = bpy.data.objects['Canopy'].ray_cast(Vector((x, side * 3.0, 1.67)),
                                                                  Vector((0.0, -side, 0.0)))
            if ok:
                path.append((x, loc.y, 1.64))
        if len(path) > 2:
            canopy_kit.append(F.sweep(s, f'CanopyComing{side}', path, 0.09, 0.08, material='gunmetal', bevel=0.0))
    s.detail = 0
    F.plate(s, 'Spine', [(4.8, 0.28), (-10.2, 0.34), (-10.2, -0.34), (4.8, -0.28)], z0=2.05, thickness=0.26,
            material='paint2', chamfer=0.08)
    for i, x in enumerate((-9.0, -6.6, -4.2, -1.8, 0.6, 3.0)):
        F.box(s, f'SpineRib{i}', (x, 0.0, 2.0), (0.26, 1.7 if x < 1 else 1.45, 0.3), material='gunmetal',
              bevel=0.02)
    # The dorsal livery line is lit: one thin neon spine in the ship's identity colour, the line
    # the chase camera reads first (the Look: lamps are light, docs/visual-assets/LOOK.md).
    F.band(s, 'Spine', (-4.0, 0, 0), (0, 1, 0), 0.2, 'glow_cyan', facing=(0, 0, 1))

    # --- shoulder sponsons: charcoal armour, cyan top band, radiator combs outboard ------------
    sponson = [(6.3, 3.0), (4.6, 6.2), (-8.8, 6.2), (-10.2, 5.2), (-10.2, 3.1), (-4.0, 2.7)]
    F.plate(s, 'Sponson', sponson, z0=-0.55, thickness=1.2, material='paint2', chamfer=0.4, chamfer_bottom=0.2,
            mirror=True)
    F.band(s, 'Sponson', (0.0, 4.6, 0), (1, 0, 0), 0.9, 'stripe', facing=(0, 0, 1), mirror=True)
    F.band(s, 'Sponson', (1.0, 4.6, 0), (1, 0, 0), 0.18, 'hazard', facing=(0, 0, 1), mirror=True)
    # Replaceable armour courses: three raised teal plates with dark gaps between them.
    F.panel(s, 'Sponson', (-5.6, 4.55), (3.6, 2.3), 'paint', inset=0.06, depth=0.06, mirror=True)
    F.panel(s, 'Sponson', (3.1, 4.4), (2.4, 1.9), 'paint', inset=0.06, depth=0.06, mirror=True)
    # The hero marking: DIE LAUGHING, hand-cut through a stencil in warm-ivory lacquer across the aft
    # port armour course (the raised teal plate above). Two lines, bridges in the counters, chipped
    # edges, a little overspray; conformal to the plate, LOD0 only (design: TOP_FIVE_MATERIAL_TRUTH
    # §1 — not a label, not a raised plaque). Reads toward the nose, tops to port.
    s.detail = 2
    stencil.stamp(s, 'HeroMark_DieLaughing', [('DIE', 0.86, 0.30), ('LAUGHING', 0.72, 0.12)], (-5.6, 4.55),
                  'Sponson', finish='paint2.ivory')
    s.detail = 0
    # Load braces between hull and sponsons.
    for x in (3.0, -1.5, -6.5):
        F.box(s, f'Brace{x}', (x, 2.9, 0.1), (0.9, 1.4, 0.55), material='gunmetal', mirror=True, bevel=0.03)
    # Radiator comb along each outer edge.
    s.detail = 1
    for i in range(9):
        x = 3.4 - i * 1.35
        F.box(s, f'RadFin{i}', (x, 6.35, 0.1), (0.5, 0.42, 0.95), material='gunmetal', mirror=True, bevel=0.015)
    s.detail = 0
    F.box(s, 'RadSpine', (-2.0, 6.25, 0.1), (11.5, 0.12, 0.7), material='dark', mirror=True, bevel=0.0)

    # --- axial drive drum --------------------------------------------------------------------
    F.cylinder(s, 'DriveCollar', (-13.0, 0.0, 0.0), (-11.2, 0.0, 0.0), 2.9, 2.85, material='gunmetal',
               segments=48, cap_material='dark')
    F.cylinder(s, 'DriveRing', (-12.3, 0.0, 0.0), (-11.9, 0.0, 0.0), 3.05, material='stripe', segments=48,
               cap=False)
    F.nozzle(s, 'DriveBell', (-14.1, 0.0, 0.0), 2.05, 1.3, material='gunmetal', bell=1.18, segments=48)
    s.hook('HOOK_DRIVE_CORE', (-14.0, 0.0, 0.0))
    for i, (y, z) in enumerate(((0, 2.55), (0, -2.55), (2.55, 0), (-2.55, 0))):
        F.box(s, f'DriveClamp{i}', (-12.2, y, z), (2.2, 0.5 if y else 0.6, 0.6 if y else 0.5), material='paint2',
              bevel=0.03)

    # --- port shoulder: salvage-green repair pod (secondary damage part) -----------------------
    pod = F.box(s, 'RepairPod', (-1.45, 4.35, 1.2), (3.2, 1.9, 1.3), material='paint.green', bevel=0.08)
    band = F.box(s, 'RepairPodBand', (-0.6, 4.35, 1.2), (0.3, 2.0, 1.4), material='hazard', bevel=0.02)
    lid = F.box(s, 'RepairPodHatch', (-2.1, 4.35, 1.88), (1.2, 1.2, 0.08), material='paint2', bevel=0.01)
    # Dark recess floor under the lid — when the hatch swings open the pod reads as hollow,
    # not as a lid lifting off a solid green box. The folded arm sits just above this plate.
    F.box(s, 'PodCavity', (-2.1, 4.35, 1.46), (1.14, 1.14, 0.1), material='dark', bevel=0.0)
    s.hook_part('HOOK_SECONDARY_POD', pod, band, lid)

    # ANI-06 proposed geometry: a compact two-joint service arm stowed INSIDE the pod under the
    # hatch cutout — Z-folded flat at rest (two links stacked over each other) so the solid pod
    # reads unchanged until the lid swings. The shoulder pivot sits at the opening's +X edge:
    # pitching the -X-hanging chain up carries the whole arm out through the hole, then the
    # elbow unbends the forearm toward the ship shoulder and parks its tool tip just outside.
    arm_a = F.box(s, 'SvcArmA', (-2.3, 4.35, 1.55), (1.25, 0.16, 0.11), material='gunmetal')
    arm_b = F.box(s, 'SvcArmB', (-2.2, 4.35, 1.62), (1.3, 0.14, 0.09), material='gunmetal')
    arm_head = F.box(s, 'SvcHead', (-1.45, 4.35, 1.62), (0.24, 0.14, 0.16), material='dark')
    arm_tip = F.light(s, 'SvcTip', (-1.28, 4.35, 1.68), 'glow_amber', size=0.08)

    # --- dorsal sensor dish (sensor damage part; ANI-01 motion rig) -----------------------------
    ped = F.cylinder(s, 'DishPedestal', (-2.2, -0.9, 2.1), (-2.2, -0.9, 2.85), 0.2, 0.13, material='gunmetal',
                     segments=16)
    # ANI-01 proposed geometry: a short rigid telescoping inner stem inside the pedestal bore —
    # hidden at rest, exposed as the dish lifts.
    stem = F.cylinder(s, 'DishStem', (-2.2, -0.9, 2.55), (-2.2, -0.9, 3.02), 0.085, 0.07,
                      material='gunmetal', segments=12)
    # A shallow dish tilted aft: rim ring, dark reflector face, feed horn with a cyan pickup.
    dish = F.cylinder(s, 'Dish', (-2.12, -0.9, 2.95), (-2.32, -0.9, 3.12), 0.8, 0.86, material='gunmetal',
                      segments=32, cap_material='dark')
    horn = F.cylinder(s, 'DishHorn', (-2.3, -0.9, 3.1), (-2.55, -0.9, 3.55), 0.05, 0.03, material='gunmetal',
                      segments=8)
    lens = F.light(s, 'DishFeed', (-2.56, -0.9, 3.58), 'glow_cyan', size=0.1)
    dish = [dish, horn]
    s.hook_part('HOOK_SENSOR_DISH', ped, stem, *dish, lens)
    ani01_bank = ANI_01.build(s, {'stem': stem, 'dish': dish, 'feed': lens},
                              source_asset_id=E_spec_asset_id())
    # ANI-02 authors into the shared bank — one kestrel.motion.json carries every rig's clips.
    ANI_02.build(s, {'cutter': cutter}, source_asset_id=E_spec_asset_id(), bank=ani01_bank)
    # ANI-05 proposed geometry: six rigid iris petals inside the DriveBell mouth, hidden under
    # the inner rim at rest; they slide toward the axis on boost and read as the fan over the
    # glowing core. One motion group per petal so each slides along its own radial direction.
    iris_petals = []
    for i in range(ANI_05.PETALS):
        # Alternate the plate plane a few mm so neighbouring blades never sit coplanar.
        petal = F.plate_v(s, f'IrisPetal{i}', ANI_05.petal_outline(math.radians(i * 60 + 30)),
                          ANI_05.PETAL_X - 0.09 + (i % 3) * 0.012, 0.09, plane='yz',
                          material='dark', chamfer=0.02, bevel=0.01)
        iris_petals.append(petal)
    # Static hub the fan reads against when the iris opens — a shallow chrome dome on the axis.
    F.cylinder(s, 'IrisHub', (ANI_05.PETAL_X - 0.16, 0, 0), (ANI_05.PETAL_X + 0.1, 0, 0),
               0.42, 0.16, material='bare', segments=20, bevel=0.03)
    ANI_05.build(s, {'petals': iris_petals}, source_asset_id=E_spec_asset_id(), bank=ani01_bank)
    s.ani01_bank = ani01_bank

    # --- armour plate that sheds under damage (port shoulder cap) ------------------------
    cap = F.plate(s, 'ShoulderCap', [(4.0, 3.4), (3.1, 5.8), (0.5, 5.8), (0.5, 3.4)], z0=0.62,
                  thickness=0.14, material='paint2', chamfer=0.06)
    s.hook_part('HOOK_ARMOR_PORT', cap)

    # ANI-06/07 author into the shared bank: pod hatch+arm on repair jobs, cap peel on hull hits.
    ANI_06.build(s, {'hatch': lid, 'arm_a': arm_a, 'arm_b': [arm_b, arm_head, arm_tip]},
                 source_asset_id=E_spec_asset_id(), bank=ani01_bank)
    ANI_07.build(s, {'cap': cap}, source_asset_id=E_spec_asset_id(), bank=ani01_bank)
    # ANI-18 authors into the shared bank too — the flinch claims cap + dish groups only.
    ANI_18.build(s, {}, source_asset_id=E_spec_asset_id(), bank=ani01_bank)
    ANI_17.build(s, {'canopy': canopy_kit}, source_asset_id=E_spec_asset_id(), bank=ani01_bank)

    # --- detail ------------------------------------------------------------------------------
    s.detail = 1
    F.vent(s, 'HullVent', (-8.8, 1.2, 2.05), (1.8, 0.55, 0.14), mirror=True)
    F.rcs(s, 'RCSFwd', (1.6, 6.45, 0.45), size=0.42, mirror=True)
    F.rcs(s, 'RCSAft', (-9.4, 6.0, 0.45), size=0.36, mirror=True)
    F.antenna(s, 'Mast', (-6.0, -1.1, 2.1), 1.3, tip='glow_red')
    F.windows(s, 'Ports', 1.2, 4.8, 1.92, 0.75, 4, size=(0.4, 0.2), finish='glow_warm', mirror=True)
    F.box(s, 'Skid', (-4.0, 1.6, -2.15), (4.0, 0.25, 0.25), material='dark', mirror=True, bevel=0.03)
    F.box(s, 'NoseSkid', (4.6, 0.0, -1.9), (1.4, 0.28, 0.24), material='dark', bevel=0.03)
    s.detail = 0

    # --- close-zoom hero detail layer (LOD0 only; gunmetal and dark, finishes this hull already draws) ----
    # Every fixture is seated on the real skin of the part it rides (tools/blender/forge/skin.py), so
    # nothing floats and nothing clips. Static parts only: whatever moves (canopy, dish, pod, cap, iris,
    # mining head, skids) either carries its own detail inside its MOTION_ group or none.
    bpy.context.view_layer.update()
    s.detail = 2
    studs = []
    # Rear teal courses are bolted at their corners and edges. The port one wears the DIE LAUGHING
    # stencil instead (paint over its bolts), so only the starboard course carries fasteners.
    pts = [(x, -y) for x in (-7.2, -6.4, -5.6, -4.8, -4.0) for y in (3.55, 5.55)]
    pts += [(x, -y) for x in (-7.2, -4.0) for y in (4.2, 4.9)]
    studs += skin.studs('Sponson_M', pts)
    # front course: starboard only (the port one lives under the shoulder cap)
    studs += skin.studs('Sponson_M', [(x, y) for x in (2.1, 3.1, 4.1) for y in (-3.65, -5.15)]
                        + [(2.1, -4.4), (4.1, -4.4)])
    studs += skin.studs('PressureHull', [(x, y) for x in (-9.6, -4.6, 0.6) for y in (-2.1, -1.7, -0.7, 0.7, 1.7, 2.1)])
    studs += skin.studs('DriveCollar', [(x, y) for x in (-12.7, -11.6) for y in (-2.5, -1.8, -0.9, 0.9, 1.8, 2.5)],
                        nz=0.4)
    studs += skin.studs('GunReceiver', [(7.8 + dx, dy) for dx in (-0.5, 0.5) for dy in (-0.4, 0.4)])
    for x in (7.2, 8.2, 9.2, 10.2):
        ye = 1.2 + (x - 6.6) * 0.15 / 1.6 if x <= 8.2 else 1.35 - 0.19 * (x - 8.2)
        studs += skin.studs('Brow', [(x, ye - 0.4), (x, -(ye - 0.4))])
    studs += skin.studs('DriveClamp0', [(-12.2 + dx, dy) for dx in (-0.8, 0.8) for dy in (-0.18, 0.18)])

    # hatches: a thin dark coaming and a gunmetal handle on each (dorsal hull, sponson roofs)
    frames, handles = [], []
    for part, cx, cy, sx, sy in (('PressureHull', -6.3, 1.7, 0.9, 0.6), ('PressureHull', -6.3, -1.7, 0.9, 0.6),
                                 ('PressureHull', -0.5, 1.55, 0.9, 0.6), ('PressureHull', -0.5, -1.55, 0.9, 0.6),
                                 ('Sponson', -9.0, 4.4, 1.4, 0.9), ('Sponson_M', -9.0, -4.4, 1.4, 0.9),
                                 ('Sponson_M', -2.2, -4.6, 1.3, 0.9)):
        fr, grip = skin.hatch(part, cx, cy, sx, sy)
        frames += fr
        if part == 'PressureHull' and grip:
            handles.append(grip)
    F.beams(s, 'ArmourStuds', studs, 0.12, material='gunmetal')
    F.beams(s, 'HatchComing', frames, 0.06, material='dark')
    F.beams(s, 'HatchHandle', handles, 0.05, material='gunmetal')

    # cable tray along each sponson root: a gunmetal pipe, a dark cable and cross brackets
    for side, part in ((1, 'Sponson'), (-1, 'Sponson_M')):
        xs = [-8.0 + 1.1 * i for i in range(9)]
        F.beams(s, f'TrayPipe{side}', skin.segments(skin.run(part, [(x, side * 3.27) for x in xs], 0.045)), 0.09,
                material='gunmetal')
        F.beams(s, f'TrayCable{side}', skin.segments(skin.run(part, [(x, side * 3.46) for x in xs], 0.04)), 0.06,
                material='dark')
        F.boxes(s, f'TrayBracket{side}', [((x, side * 3.37, skin.hit(part, x, side * 3.37)[0].z + 0.02),
                                           (0.22, 0.45, 0.04)) for x in xs[::2]], material='dark')
    for x in (-7.1, -2.1, 3.3):
        F.band(s, 'PressureHull', (x, 0, 0), (1, 0, 0), 0.05, 'dark', facing=(0, 0, 1), min_facing=0.3,
               region=(('z', 0.3, 9.0),))
    s.detail = 0

    F.light(s, 'NavPort', (-9.2, 6.3, 0.75), 'glow_red', size=0.16)
    F.light(s, 'NavStarboard', (-9.2, -6.3, 0.75), 'glow_green', size=0.16)
    F.light(s, 'Beacon', (-10.4, 0.0, 2.25), 'glow_amber', size=0.16)

    # ANI-16: belly gear — the two aft rails plus the nose skid just created above.
    _o = {o.name: o for o in s.objects}
    ANI_16.build(s, {'skidP': _o['Skid'], 'skidS': _o['Skid_M'], 'skidF': _o['NoseSkid']},
                 source_asset_id=E_spec_asset_id(), bank=ani01_bank)
    return s


if __name__ == '__main__':
    ship = build().finish()
    live = '--live' in sys.argv
    spec = E.fleet_spec(SHIP_ID)
    written = E.export_ship(ship, spec, preview=not live)
    # The motion bank seals against the exported release GLB — preview runs leave the authored
    # rig in place but skip the bank (the runtime only reads it from release packages).
    if live:
        ship.ani01_bank.bake([path for path, _tris in written])
