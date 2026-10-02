"""Helios Massline Gate — the jump ring. Forge rebuild. "Segmented ring with a glowing aperture."

The ring stands vertical across the flight path (its plane is Blender Y-Z, ships pass along X through
SOCKET_Gate_Aperture at the centre). Twelve ivory armour segments, each with a lit crew corridor on its
outer face, a cyan light strip on both faces and an emitter prong aimed at the aperture; between them,
charcoal coil housings wrapped in glowing field coils. A control tower crowns the ring (the camera's
nearest point), a power block hangs under it, and at the flight plane two service platforms reach out
port and starboard with pads, cranes and landing lights, so the gate reads as a wide lit ellipse
from the 60 degree chase camera.
"""
import math
import os
import sys

import bmesh
from mathutils import Matrix

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402

SHIP_ID = 'place_gate_jump_ring'
COLORS = {
    'paint': '#6e695c',       # Helios ivory
    'paint2': '#23282e',      # charcoal: coil housings, clamp towers
    'stripe': '#1b4d5e',      # Massline blue
    'hazard': '#6e5214',
    'dark': '#14171b',
}

R_IN, R_OUT = 32.8, 40.4      # ring body
HX = 6.0                      # half axial thickness of the body
N_SEG = 12
GAP = math.radians(7.0)


def boxes(s, name, items, material, bevel=0.0):
    """Local helper: many boxes in one part. items: (center, size[, (rx, ry, rz)])."""
    bm = bmesh.new()
    for it in items:
        c, sz = it[0], it[1]
        r = it[2] if len(it) > 2 else (0.0, 0.0, 0.0)
        rot = Matrix.Rotation(r[2], 4, 'Z') @ Matrix.Rotation(r[1], 4, 'Y') @ Matrix.Rotation(r[0], 4, 'X')
        m = Matrix.Translation(c) @ rot @ Matrix.Diagonal((sz[0], sz[1], sz[2], 1.0))
        bmesh.ops.create_cube(bm, size=1.0, matrix=m)
    return s.add(F._new_object(name, bm, s.slots([material]), bevel=bevel, smooth_angle=30.0))


def sector(s, name, r0, r1, a0, a1, x0, x1, material='paint', steps=None, bevel=0.06, side_material=None):
    """Local helper: an annular sector of the ring (radial r0..r1, angle a0..a1 in the Y-Z plane,
    axial x0..x1). side_material paints the two axial faces (the faces the chase camera rakes)."""
    steps = steps or max(2, int(abs(a1 - a0) / math.radians(2.5)))
    bm = bmesh.new()
    rings = []
    prof = ((x0, r0), (x1, r0), (x1, r1), (x0, r1))
    for i in range(steps + 1):
        a = a0 + (a1 - a0) * i / steps
        c, sn = math.cos(a), math.sin(a)
        rings.append([bm.verts.new((x, r * c, r * sn)) for (x, r) in prof])
    faces = []
    for i in range(steps):
        for j in range(4):
            k = (j + 1) % 4
            faces.append((bm.faces.new((rings[i][j], rings[i][k], rings[i + 1][k], rings[i + 1][j])), j))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mats = [material] + ([side_material] if side_material else [])
    if side_material:
        for f, j in faces:
            if j in (1, 3):   # x1 face and x0 face
                f.material_index = 1
    return s.add(F._new_object(name, bm, s.slots(mats), bevel=bevel, smooth_angle=30.0))


def polar(r, a, x=0.0):
    return (x, r * math.cos(a), r * math.sin(a))


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)
    step = 2 * math.pi / N_SEG
    win, strips, glow_tips = [], [], []
    coil_glow, coil_clamp, ribs, hatches = [], [], [], []

    for i in range(N_SEG):
        gc = i * step                      # gap centre (coil housing); 0 = port platform, 90 = tower
        a0, a1 = gc + GAP / 2, gc + step - GAP / 2
        am = (a0 + a1) / 2
        # armour segment: ivory body, charcoal-banded faces
        sector(s, f'Seg{i}', R_IN, R_OUT, a0, a1, -HX, HX, material='paint', side_material='paint')
        # raised outer armour cap, teal band down the middle of the outer face
        sector(s, f'SegCap{i}', R_OUT - 0.1, R_OUT + 0.9, a0 + 0.03, a1 - 0.03, -HX + 1.2, HX - 1.2,
               material='paint', bevel=0.12)
        sector(s, f'SegBand{i}', R_OUT + 0.85, R_OUT + 1.05, a0 + 0.03, a1 - 0.03, -0.6, 0.6, material='stripe',
               bevel=0.0)
        # inner face liner (dark) so the aperture edge reads as depth
        sector(s, f'SegLiner{i}', R_IN - 0.35, R_IN + 0.05, a0 + 0.01, a1 - 0.01, -HX + 0.6, HX - 0.6,
               material='paint2', bevel=0.04)
        # cyan light strips on both axial faces
        for sx in (1, -1):
            xa, xb = (HX - 0.05, HX + 0.12) if sx > 0 else (-HX - 0.12, -HX + 0.05)
            sector(s, f'Strip{i}{sx}', 34.6, 35.4, a0 + 0.05, a1 - 0.05, xa, xb, material='glow_cyan', bevel=0.0)
            # panel seams on the faces: raised charcoal ribs
            for t in (0.33, 0.66):
                a = a0 + (a1 - a0) * t
                ribs.append((polar(37.8, a, sx * (HX + 0.1)), (0.3, 0.5, 4.6), (a - math.pi / 2, 0.0, 0.0)))
            # access hatches between the ribs, a row of portholes along the outer rim of the face
            for tt in (0.165, 0.5, 0.835):
                a = a0 + (a1 - a0) * tt
                hatches.append((polar(37.6, a, sx * (HX + 0.02)), (0.12, 2.3, 2.0), (a - math.pi / 2, 0.0, 0.0)))
            for k in range(9):
                a = a0 + 0.02 + (a1 - a0 - 0.04) * (k + 0.5) / 9
                win.append((polar(39.6, a, sx * (HX + 0.02)), (0.12, 0.7, 0.34), (a - math.pi / 2, 0.0, 0.0)))
        # crew corridor: two rows of lit windows round the outer cap
        n = 7
        for k in range(n):
            a = a0 + 0.06 + (a1 - a0 - 0.12) * (k + 0.5) / n
            for xw in (-2.9, 2.9):
                win.append((polar(R_OUT + 0.93, a, xw), (0.9, 0.55, 0.12), (a - math.pi / 2, 0.0, 0.0)))
        # emitter prong: tapered block aimed at the aperture, lit tip and cyan fins
        F.box(s, f'Emitter{i}', polar(30.6, am), (3.2, 2.6, 5.0), material='paint2', rot=(am + math.pi / 2, 0, 0),
              taper=0.45, bevel=0.1)
        F.box(s, f'EmitterBase{i}', polar(32.6, am), (5.0, 4.4, 1.2), material='gunmetal',
              rot=(am + math.pi / 2, 0, 0), bevel=0.06)
        # ANI-15: the white tip is its own carriage block riding the prong's inner face —
        # a separate object so the index rig can slide it radially.
        F.box(s, f'EmitTip{i}', polar(28.35, am), (1.5, 1.05, 1.05), material='paint',
              rot=(am + math.pi / 2, 0, 0), taper=0.6, bevel=0.06)
        F.box(s, f'EmitTipGlow{i}', polar(27.72, am), (0.95, 0.72, 0.72), material='glow_cyan',
              rot=(am + math.pi / 2, 0, 0), bevel=0.04)
        for sx in (1, -1):
            glow_tips.append((polar(30.4, am, sx * 1.62), (0.1, 0.5, 3.4), (am + math.pi / 2, 0.0, 0.0)))

        # coil housing in the gap: charcoal block wrapped in glowing field coils
        big = i in (0, 3, 6, 9)
        sector(s, f'Coil{i}', R_IN - 0.8, R_OUT + (2.6 if big else 1.8), gc - GAP / 2 - 0.02, gc + GAP / 2 + 0.02,
               -HX - 1.6, HX + 1.6, material='paint2', steps=3, bevel=0.15)
        # field coils: rectangular collars wound round the ring body either side of the housing,
        # glowing cyan between charcoal clamp collars
        for d in (-1, 1):
            for k, (off, fin) in enumerate(((1.4, 'glow'), (2.6, 'glow'), (3.8, 'clamp'))):
                ac = gc + d * (GAP / 2 + math.radians(off))
                lst = coil_glow if fin == 'glow' else coil_clamp
                e = 0.28 if fin == 'glow' else 0.45
                w = 0.38 if fin == 'glow' else 1.0
                lst += [(polar(R_OUT + 1.05 + e / 2, ac), (2 * HX + 2 * e, e, w), (ac, 0.0, 0.0)),
                        (polar(R_IN - e / 2 - 0.35, ac), (2 * HX + 2 * e, e, w), (ac, 0.0, 0.0))]
                for sx in (1, -1):
                    lst.append((polar((R_IN - 0.35 + R_OUT + 1.05) / 2, ac, sx * (HX + e / 2)),
                                (e, R_OUT + 1.4 - R_IN + 2 * e, w), (ac, 0.0, 0.0)))
        # hazard band across the housing's outer face
        # louvred vent in the housing's outer face
        ro = R_OUT + (2.6 if big else 1.8)
        hatches.append((polar(ro + 0.02, gc), (9.0, 2.2, 0.12), (gc - math.pi / 2, 0.0, 0.0)))
        for k in range(7):
            xk = -3.9 + k * 1.3
            coil_clamp.append((polar(ro + 0.1, gc, xk), (0.35, 2.0, 0.14), (gc - math.pi / 2, 0.0, 0.0)))
        if big:
            for e in (-1, 1):
                sector(s, f'CoilHaz{i}{e}', R_OUT + 2.55, R_OUT + 2.75, gc + e * 0.032 - 0.005, gc + e * 0.032 + 0.005,
                       -HX - 1.2, HX + 1.2, material='hazard', steps=1, bevel=0.0)

    # aperture pilots: two long emitters on the platform housings reach in toward the aperture and
    # carry the gate's emissive anchor (SOCKET_Emissive sits on the port one)
    for gc in (0.0, math.pi):
        F.box(s, f'Pilot{gc:.1f}', polar(29.6, gc), (3.6, 3.0, 6.4), material='paint2', rot=(gc + math.pi / 2, 0, 0),
              taper=0.5, bevel=0.1)
        glow_tips.append((polar(26.4, gc), (1.4, 1.0, 1.0), (gc + math.pi / 2, 0.0, 0.0)))
        for sx in (1, -1):
            glow_tips.append((polar(29.4, gc, sx * 1.75), (0.1, 0.6, 4.6), (gc + math.pi / 2, 0.0, 0.0)))
    boxes(s, 'Windows', win, 'glow_warm')
    boxes(s, 'EmitterGlow', glow_tips, 'glow_cyan')
    boxes(s, 'FieldCoils', coil_glow, 'glow_cyan')
    boxes(s, 'CoilClamps', coil_clamp, 'paint2', bevel=0.0)
    boxes(s, 'FaceRibs', ribs, 'paint2', bevel=0.0)
    boxes(s, 'FaceHatches', hatches, 'dark', bevel=0.0)
    # aperture rims: two thin light lines on the inner edge of the ring
    for sx in (1, -1):
        F.ring(s, f'ApertureRim{sx}', (sx * (HX - 0.5), 0, 0), R_IN - 0.45, 0.18, axis=(1, 0, 0),
               material='glow_cyan', segments=128, sides=5)

    # --- control tower on the crown ---------------------------------------------------------------
    F.plate(s, 'TowerBase', [(7.5, 5.5), (-7.5, 5.5), (-7.5, -5.5), (7.5, -5.5)], z0=41.0, thickness=7.0,
            material='paint2', chamfer=0.6, side_material='paint2')
    F.plate(s, 'TowerDeck', [(8.8, 4.0), (6.0, 7.0), (-6.0, 7.0), (-8.8, 4.0), (-8.8, -4.0), (-6.0, -7.0),
                             (6.0, -7.0), (8.8, -4.0)], z0=48.0, thickness=3.6, material='paint', chamfer=0.7,
            top_material='paint')
    F.band(s, 'TowerDeck', (0, 0, 49.6), (0, 0, 1), 1.0, 'glass', min_facing=-1.0)
    F.band(s, 'TowerDeck', (0, 0, 0), (1, 0, 0), 1.2, 'stripe', facing=(0, 0, 1))
    tw = []
    for k in range(9):
        x = -7.0 + 14.0 * (k + 0.5) / 9
        tw += [((x, 7.02, 49.6), (1.0, 0.1, 0.6)), ((x, -7.02, 49.6), (1.0, 0.1, 0.6))]
    for k in range(5):
        y = -3.4 + 6.8 * (k + 0.5) / 5
        tw += [((8.82, y, 49.6), (0.1, 1.0, 0.6)), ((-8.82, y, 49.6), (0.1, 1.0, 0.6))]
    for z in (43.0, 45.0):
        for k in range(6):
            x = -6.0 + 12.0 * (k + 0.5) / 6
            tw += [((x, 5.52, z), (1.0, 0.1, 0.5)), ((x, -5.52, z), (1.0, 0.1, 0.5))]
    boxes(s, 'TowerWindows', tw, 'glow_warm')
    F.box(s, 'TowerRoof', (0, 0, 52.0), (7.0, 5.0, 1.0), material='paint2', bevel=0.15)
    F.dish(s, 'TowerDish', (-3.5, 2.0, 53.0), 1.8, 0.6, axis=(-0.4, 0.3, 0.86), material='paint')
    F.cylinder(s, 'TowerDishPost', (-3.5, 2.0, 52.4), (-3.5, 2.0, 53.2), 0.3, material='gunmetal', segments=10)
    F.cylinder(s, 'TowerMast', (2.5, -1.0, 52.4), (2.5, -1.0, 56.4), 0.25, 0.12, material='gunmetal', segments=8)
    F.light(s, 'TowerMastTip', (2.5, -1.0, 56.5), 'glow_red', size=0.5)
    F.beacon(s, 'Beacon', (0.0, 0.0, 52.5), size=0.8)

    # --- power block under the ring ----------------------------------------------------------------
    F.plate(s, 'PowerBlock', [(7.0, 6.0), (-7.0, 6.0), (-7.0, -6.0), (7.0, -6.0)], z0=-48.0, thickness=7.8,
            material='paint2', chamfer_bottom=0.8, chamfer=0.4)
    for k in range(9):
        y = -5.0 + 10.0 * (k + 0.5) / 9
        F.box(s, f'PowerFin{k}', (0, y, -45.0), (17.0, 0.18, 5.0), material='gunmetal', bevel=0.0)
    F.light(s, 'PowerLamp', (0, 0, -48.4), 'glow_red', size=0.6)
    F.band(s, 'PowerBlock', (0, 0, -47.2), (0, 0, 1), 0.5, 'hazard', min_facing=-1.0)

    # --- service platforms at the flight plane, port and starboard --------------------------------
    for sy in (1, -1):
        yo = sy * 45.0
        outline = [(9.5, 40.0), (9.5, 48.0), (6.5, 50.2), (-6.5, 50.2), (-9.5, 48.0), (-9.5, 40.0)]
        if sy < 0:
            outline = [(x, -y) for (x, y) in reversed(outline)]
        F.plate(s, f'Platform{sy}', outline, z0=-1.4, thickness=2.4, material='paint', chamfer=0.4,
                side_material='paint2')
        F.band(s, f'Platform{sy}', (0, yo + sy * 4.4, 0), (0, 1, 0), 0.6, 'hazard', facing=(0, 0, 1))
        F.panel(s, f'Platform{sy}', (-3.0, yo), (6.0, 6.0), 'paint2', inset=0.15, depth=-0.05)
        # hab module and a small crane on each platform
        F.box(s, f'Hab{sy}', (5.2, yo - sy * 0.5, 2.4), (5.0, 6.5, 3.6), material='paint', bevel=0.25)
        F.band(s, f'Hab{sy}', (5.2, 0, 0), (1, 0, 0), 0.8, 'stripe', inset=0.03, depth=0.04)
        hw = [((5.2 + dx, yo + sy * 2.78, 2.6), (0.8, 0.1, 0.5)) for dx in (-1.6, 0.0, 1.6)]
        hw += [((7.72, yo - sy * 0.5 + dy, 2.6), (0.1, 0.8, 0.5)) for dy in (-2.0, 0.0, 2.0)]
        boxes(s, f'HabWin{sy}', hw, 'glow_warm')
        F.cylinder(s, f'CranePost{sy}', (-7.0, yo + sy * 2.5, 1.0), (-7.0, yo + sy * 2.5, 6.0), 0.45,
                   material='hazard', segments=12)
        F.box(s, f'CraneJib{sy}', (-4.5, yo + sy * 2.5, 6.2), (6.5, 0.6, 0.6), material='hazard', bevel=0.05)
        F.cylinder(s, f'CraneCable{sy}', (-2.0, yo + sy * 2.5, 5.9), (-2.0, yo + sy * 2.5, 2.8), 0.05,
                   material='gunmetal', segments=6)
        F.box(s, f'CraneHook{sy}', (-2.0, yo + sy * 2.5, 2.6), (0.6, 0.6, 0.5), material='gunmetal', bevel=0.02)
        # pad lights
        pads = [((-3.0 + dx, yo + dy, 1.08), (0.35, 0.35, 0.12)) for dx in (-3.2, 3.2) for dy in (-3.2, 3.2)]
        boxes(s, f'PadLights{sy}', pads, 'glow_amber')
        F.light(s, f'Nav{sy}', (0.0, yo + sy * 5.3, 0.3), 'glow_red' if sy > 0 else 'glow_green', size=0.7)
        # platform braces up to the ring body
        for dx in (-7.0, 7.0):
            F.box(s, f'Brace{sy}{dx}', (dx, sy * 41.0, -2.4), (1.2, 4.5, 1.2), material='paint2', bevel=0.08,
                  rot=(sy * 0.5, 0, 0))
        F.work_lamp(s, f'PlatLamp{sy}', (8.6, yo + sy * 4.0, 1.3), aim=(0.4, -sy * 0.4, 0.8), size=0.8)

    s.detail = 1
    # amber marker lamps on the minor coil housings
    for i in (1, 2, 4, 5, 7, 8, 10, 11):
        gc = i * step
        F.light(s, f'CoilLamp{i}', polar(R_OUT + 2.0, gc, HX + 1.0), 'glow_amber', size=0.4)
        F.light(s, f'CoilLampB{i}', polar(R_OUT + 2.0, gc, -HX - 1.0), 'glow_amber', size=0.4)
    s.detail = 0
    return s


if __name__ == '__main__':
    import forge_export as E
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'animations'))
    import ANI_15  # noqa: E402
    import ANI_19  # noqa: E402
    import motion_bank  # noqa: E402
    ship = build().finish()
    _o = {o.name: o for o in ship.objects}
    ship.ani15_bank = ANI_15.build(ship, {
        'tips': [[_o[f'EmitTip{i}'], _o[f'EmitTipGlow{i}']] for i in range(12)],
    }, source_asset_id=E.fleet_spec(SHIP_ID)['asset_id'])
    ANI_19.build(ship, None, source_asset_id=None, bank=ship.ani15_bank)
    live = '--live' in sys.argv
    written = E.export_ship(ship, E.fleet_spec(SHIP_ID), preview=not live)
    if live:
        ship.ani15_bank.bake(
            [p for p, _t in written],
            out_path=os.path.join(motion_bank.MOTIONS_DIR, 'jump-ring.motion.json'))
