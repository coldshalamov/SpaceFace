"""Shared kit for the player-built claim outpost family (place_claim_outpost_*).

One design language across all six bodies: a claimed rock wrapped by a work-fleet clamp-foot
deck — an OPEN octagonal truss frame over graphite spokes (no slab: the plan read is modules +
dark gaps), safety-yellow hazard bands kept thin and mid-value, one role accent colour per
specialisation — with a dock arm reaching +X and four open module pads at the frame's corner
stations.

AUTHORING FRAME (do not "fix"): the live bodies are a VERTICAL wheel — the collision hull is
x +-46, y +-42, z +-14 in glTF (tall in Y, thin in Z): the wheel stands upright in the glTF
XY plane and its front face looks down -Z (module pads sit at z ~ -1, the emissive bay
reaches z -8). glTF (x, z, -y) <- Blender (x, y, z), so the wheel is the Blender XZ plane
and the front face is Blender +Y. All helpers take plan coords P(u, v, d) = Blender
(u, +d, v): u along +X (dock-arm side), v up the wheel face (glTF +Y), d out of the face
toward the viewer (glTF -Z = Blender +Y, positive = front, negative = backside machinery).

Live contract (all six share it): dock approach (48, 0, +2); module pads at plan (+-20, +-20)
just proud of the face (d ~ +1); structure core at origin; emissive bay in front at d ~ +8.
"""
import math

import forge as F  # noqa: E402  (imported after the ship file inserts the forge dir)

# Family palette — work-fleet industrial: ivory plate over graphite, safety-yellow hazard
# trim, one role accent per body (each ship file adds 'paint.role' / 'glow.role').
COLORS = {
    'paint': '#a69d8a',       # work-fleet ivory (brightest allowed)
    'paint2': '#23282e',      # graphite structure
    'paint.aged': '#6e685c',  # worn ivory, patch plates
    'stripe': '#8a5a1c',      # ochre fleet identity band
    'hazard': '#8a7418',      # safety yellow — MID VALUE: thin bands only, never bright
    'dark': '#16191d',
    'stone': '#3f3a34',       # claim rock — dark enough to sit back inside the wheel
    'glow_warm': '#ffc27a',
    'glow_amber': '#ffae2a',
    'glow_cyan': '#5fe8ff',
    'glow_red': '#ff3a2a',
    'glow_green': '#3dff7a',
}

RING_R0, RING_R1 = 30.0, 44.0     # live bound reference radii (the old slab ring)
FRAME_R = RING_R1 - 4.0           # open clamp-foot frame vertex radius (~40)
DECK_D = 1.2                      # ring deck thickness centreline (d = 0 plane)
MODULE_PADS = ((20.0, -20.0), (-20.0, -20.0), (-20.0, 20.0), (20.0, 20.0))  # plan (u, v)


def P(u, v, d):
    """Plan coords -> Blender: u = +X (dock side), v = up the wheel face (glTF +Y,
    Blender +Z), d = out of the face toward the viewer (glTF -Z, Blender +Y)."""
    return (u, d, v)


def plan_box(s, name, u, v, d, su, sv, sd, material='paint', rot=0.0, bevel=0.04, taper=1.0):
    """Box in plan coords: su along u, sv along v (wheel-face vertical), sd depth out of
    the face. `rot` spins the box in the wheel plane."""
    p = P(u, v, d)
    # plan rotation u->+v is Ry(-rot) in Blender (v maps to +Z)
    return F.box(s, name, p, (su, sd, sv), material=material, bevel=bevel,
                 taper=taper, rot=(0, -rot, 0) if rot else None)


def plan_cyl(s, name, u0, v0, d0, u1, v1, d1, r, material='gunmetal', segments=16, bevel=0.02):
    return F.cylinder(s, name, P(u0, v0, d0), P(u1, v1, d1), r, material=material,
                      segments=segments, bevel=bevel)


def plan_beams(s, name, segs, w, material='gunmetal', h=None):
    return F.beams(s, name, [(P(*a), P(*b)) for a, b in segs], w, material=material, h=h)


def plan_truss(s, name, a, b, w, bays, material='gunmetal', chord=None, web=None):
    return F.truss(s, name, P(*a), P(*b), w, bays, material=material, chord=chord, web=web)


def ring_slab(s, name, r_in, r_out, d0, d1, material='paint', segments=48, arc=None):
    """Annular slab in the wheel plane (Blender XZ), extruded through depths d0..d1
    (positive = front, Blender +Y). arc=(a0_deg, a1_deg) limits the sweep
    (0 deg = +u, CCW toward +v)."""
    import bmesh  # noqa: E402  (Blender module; kit runs inside Blender)
    bm = bmesh.new()
    a0 = math.radians(arc[0]) if arc else 0.0
    a1 = math.radians(arc[1]) if arc else 2 * math.pi
    n = segments
    rings = []
    for y in (d0, d1):   # d -> blender +y (front face direction)
        inner, outer = [], []
        for i in range(n + 1):
            a = a0 + (a1 - a0) * i / n
            ca, sa = math.cos(a), math.sin(a)
            inner.append(bm.verts.new((r_in * ca, y, r_in * sa)))
            outer.append(bm.verts.new((r_out * ca, y, r_out * sa)))
        rings.append((inner, outer))
    (bi, bo), (ti, to) = rings
    for i in range(n):
        bm.faces.new((ti[i], to[i], to[i + 1], ti[i + 1]))
        bm.faces.new((bi[i + 1], bo[i + 1], bo[i], bi[i]))
        bm.faces.new((bo[i], bo[i + 1], to[i + 1], to[i]))
        bm.faces.new((bi[i], bi[i + 1], ti[i + 1], ti[i]))
    if arc:
        bm.faces.new((bi[0], ti[0], to[0], bo[0]))
        bm.faces.new((bi[n], bo[n], to[n], ti[n]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return s.add(F._new_object(name, bm, s.slots([material]), bevel=0.05))


def polar_plan(r, a_deg, d=0.0):
    a = math.radians(a_deg)
    return (r * math.cos(a), r * math.sin(a), d)


def placed_sphere(s, name, u, v, d, r, material='paint', segments=24, scale=None,
                  tilt_x_deg=0.0):
    """Sphere/dome at plan (u,v,d). Forge parts bake world coords with the object at the
    origin, so scaling/rotating a sphere authored in place swings it around the world
    origin. Build at the origin, transform, then place — the exporter applies
    matrix_world."""
    obj = F.sphere(s, name, (0.0, 0.0, 0.0), r, material=material, segments=segments)
    if obj is not None:
        if scale:
            obj.scale = scale
        if tilt_x_deg:
            obj.rotation_euler[0] = math.radians(tilt_x_deg)
        obj.location = P(u, v, d)
    return obj


def placed_rock(s, name, u, v, d, r, seed, material='stone', scale_y=None):
    """Same origin-bake hazard as placed_sphere: author the rock at the origin, squash,
    then move it to (u,v,d) plan position."""
    obj = F.rock(s, name, (0.0, 0.0, 0.0), r, seed=seed, material=material)
    if obj is not None:
        if scale_y is not None:
            obj.scale.y = scale_y
        obj.location = P(u, v, d)
    return obj


def build_platform(s, opts=None):
    """The shared claim-anchor platform: open clamp-foot frame + module pads + dock arm +
    ops pod + emissive bay. Returns nothing; spec files add their module structure on top.
    No rock: the claimed asteroid is its own runtime entity — deck boulders read as blobs.
    opts['hab']=(u,v) recentres the hab pod (specs move it aft so their function block owns
    the centre); opts['hab_scale'] shrinks it; the Structure_Core collar + bay stay at the
    origin where the live sockets sit."""
    opts = opts or {}
    hu, hv = opts.get('hab', (0.0, 0.0))
    hs = opts.get('hab_scale', 1.0)
    # --- clamp-foot deck frame: an OPEN octagonal truss ring, not a slab. The plan read is
    # the modules + the dark gaps between them — the rock shows through the frame.
    frame_verts = [polar_plan(FRAME_R, k * 45.0) for k in range(8)]
    for k in range(8):
        au, av, _ = frame_verts[k]
        bu, bv, _ = frame_verts[(k + 1) % 8]
        plan_truss(s, f'Frame{k}', (au, av, 0.0), (bu, bv, 0.0), 2.6, 4,
                   material='paint2', chord=0.55, web=0.28)
    # vertex clamp feet: a stub post at each corner + two jaw struts reaching back onto the
    # rock so the deck visibly CLAMPS the claim instead of floating beside it
    for k in range(8):
        a = k * 45.0
        u, v, _ = frame_verts[k]
        plan_box(s, f'FootPost{k}', u, v, 1.6, 3.2, 3.2, 3.0, material='paint2', bevel=0.08)
        plan_box(s, f'FootCap{k}', u, v, 3.25, 3.4, 3.4, 0.4, material='hazard', bevel=0.02)
        ju, jv, _ = polar_plan(18.0, a + 6.0)
        ku, kv, _ = polar_plan(18.0, a - 6.0)
        plan_beams(s, f'Clamp{k}A', [((u, v, -0.6), (ju, jv, -8.0))], 0.85, material='dark')
        plan_beams(s, f'Clamp{k}B', [((u, v, -0.6), (ku, kv, -8.0))], 0.85, material='dark')
    # spokes: ring verts -> the ops collar, two rails each so the webbing reads
    for k in range(8):
        u, v, _ = frame_verts[k]
        hu, hv, _ = polar_plan(13.5, k * 45.0)
        plan_beams(s, f'Spoke{k}A', [((u, v, 0.9), (hu, hv, 1.7))], 0.7, material='paint2')
        plan_beams(s, f'Spoke{k}B', [((u, v, -0.9), (hu, hv, 1.0))], 0.55, material='dark')
    # --- module pads: open frames at the corner stations — a thin dark grating sheet on a
    # beam square, not an ivory slab (specialisation blocks stand on these).
    for k, (mu, mv) in enumerate(MODULE_PADS):
        for e in (-1, 1):
            plan_box(s, f'Pad{k}RailU{e}', mu + e * 6.0, mv, 1.2, 0.8, 13.0, 1.2,
                     material='paint2', bevel=0.04)
            plan_box(s, f'Pad{k}RailV{e}', mu, mv + e * 6.0, 1.2, 13.0, 0.8, 1.2,
                     material='paint2', bevel=0.04)
        plan_box(s, f'Pad{k}Grate', mu, mv, 1.9, 12.2, 12.2, 0.45, material='dark',
                 bevel=0.02)
        # narrow hazard kerb ticks on two pad corners only
        plan_box(s, f'Pad{k}KerbA', mu + 6.0, mv + 6.0, 1.9, 0.9, 0.9, 0.5,
                 material='hazard', bevel=0.0)
        plan_box(s, f'Pad{k}KerbB', mu - 6.0, mv - 6.0, 1.9, 0.9, 0.9, 0.5,
                 material='hazard', bevel=0.0)
        F.light(s, f'Pad{k}Lamp', P(mu + 5.4, mv + 5.4, 2.6), 'glow_amber', size=0.35)
        # Lit structure (GFX light-upgrades): one amber line down each pad rail's face (0.5 m: at the place tilt 0.2 m was one invisible pixel), so the
        # four module pads read as lit squares at the place tilt (the lamps alone are dots there).
        for e in (-1, 1):
            F.band(s, f'Pad{k}RailU{e}', P(mu + e * 6.0, mv, 1.2), (1, 0, 0), 0.5, 'glow_amber',
                   facing=(0, 1, 0), min_facing=0.5, inset=0.01, depth=-0.02)
            F.band(s, f'Pad{k}RailV{e}', P(mu, mv + e * 6.0, 1.2), (0, 0, 1), 0.5, 'glow_amber',
                   facing=(0, 1, 0), min_facing=0.5, inset=0.01, depth=-0.02)
        # struts from pad to frame verts so nothing floats
        ru, rv, _ = polar_plan(FRAME_R - 2.0, math.degrees(math.atan2(mv, mu)))
        plan_beams(s, f'Pad{k}Strut', [((ru, rv, 0.2), (mu, mv, 1.0))], 1.1,
                   material='paint2')
    # --- ops pod (crewed hab): lived-in block on the wheel face. Spec bodies shrink it and
    # push it to the aft rim (opts['hab']) so the specialization block owns the centre; the
    # Structure_Core collar + emissive bay stay at the origin where the live sockets sit.
    pw, ph, pd = 20.0 * hs, 14.0 * hs, 9.0 * hs
    plan_box(s, 'OpsPod', hu, hv, 2.0 + pd * 0.55, pw, ph, pd, material='paint', bevel=0.3)
    plan_box(s, 'OpsPodBrow', hu, hv, 2.0 + pd + 0.8, pw * 0.65, ph * 0.65, 1.6 * hs,
             material='paint2', bevel=0.15)
    plan_box(s, 'OpsCollar', 0.0, 0.0, 2.2, 18.0, 13.0, 2.4, material='dark', bevel=0.1)
    # lit window rows on the pod's front face — the crew deck
    s.detail = 1
    nw = max(4, int(round(9 * hs)))
    for i in range(nw):
        u = hu + (-(nw - 1) / 2.0 + i) * 1.8 * hs
        plan_box(s, f'OpsWin{i}', u, hv - 3.2 * hs, 2.0 + pd + 0.15, 1.1 * hs, 0.7 * hs,
                 0.14, material='glow_warm', bevel=0.0)
        plan_box(s, f'OpsWinB{i}', u, hv + 3.2 * hs, 2.0 + pd + 0.15, 1.1 * hs, 0.7 * hs,
                 0.14, material='glow_warm', bevel=0.0)
    s.detail = 0
    plan_box(s, 'OpsBand', hu, hv + ph * 0.46, 2.0 + pd * 0.55, pw + 0.4, 1.2, pd * 0.93,
             material='stripe', bevel=0.0)
    # comm antenna + beacon over the pod roof — kept inside the live depth bound (~d<13.6)
    plan_cyl(s, 'OpsMast', hu - 6.0 * hs, hv + 5.0 * hs, 2.0 + pd,
             hu - 6.0 * hs, hv + 5.0 * hs, 2.0 + pd + 1.8 * hs, 0.35, material='paint2',
             segments=10)
    F.beacon(s, 'OpsBeacon', P(hu - 6.0 * hs, hv + 5.0 * hs, 2.0 + pd + 2.2 * hs),
             finish='glow_amber', size=0.5)
    # --- dock arm: approach gantry out to +X (tip kept inside the live +55.5 bound) ------
    plan_truss(s, 'DockArm', (FRAME_R, 0.0, 1.2), (51.5, 0.0, 1.2), 4.4, 6,
               material='paint2', chord=0.6, web=0.3)
    plan_box(s, 'DockDeck', 47.5, 0.0, 1.8, 18.0, 8.0, 0.8, material='paint.aged', bevel=0.05)
    plan_box(s, 'DockHead', 51.0, 0.0, 4.6, 7.0, 10.0, 5.0, material='paint', bevel=0.2)
    plan_box(s, 'DockHeadBand', 53.6, 0.0, 4.6, 0.6, 10.4, 4.2, material='stripe', bevel=0.0)
    # ...and a lit amber line across the dock head's face so the berth reads from the lane
    F.band(s, 'DockHead', P(49.4, 0.0, 4.6), (1, 0, 0), 0.7, 'glow_amber', facing=(0, 1, 0), min_facing=0.5,
           inset=0.01, depth=-0.02)
    for e in (-1, 1):
        F.light(s, f'DockGuide{e}', P(51.6, e * 4.4, 5.6),
                'glow_green' if e > 0 else 'glow_red', size=0.4)
        plan_box(s, f'DockRail{e}', 46.5, e * 3.8, 2.6, 12.0, 0.35, 0.9, material='hazard',
                 bevel=0.0)
    # --- emissive bay: the reactor grate at the origin socket station (plan (0,0), d ~ +8).
    # On the base body it sits on the pod's front face; on spec bodies the pod moves aft and
    # a squat core block carries the grate between/under the function block.
    if (hu, hv) != (0.0, 0.0):
        plan_box(s, 'CoreBlock', 0.0, 0.0, 4.9, 14.0, 10.0, 7.0, material='paint.aged',
                 bevel=0.2)
        bay_d = 8.5
    else:
        bay_d = 10.55
    ring_slab(s, 'BayRing', 2.6, 3.4, bay_d - 0.15, bay_d + 0.35, material='paint2',
              segments=24)
    s.detail = 1
    for k in range(6):
        plan_box(s, f'BayBar{k}', -1.9 + k * 0.76, 0.0, bay_d + 0.07, 0.4, 4.6, 0.18,
                 material='glow_amber', bevel=0.0)
    s.detail = 0
    # --- perimeter work lamps on the frame verts --------------------------------------------
    for k in range(8):
        a = k * 45.0
        u, v, _ = polar_plan(FRAME_R + 0.4, a, 2.6)
        F.work_lamp(s, f'WorkLamp{k}', P(u, v, 2.6),
                    aim=(-math.cos(math.radians(a)), -0.4, -math.sin(math.radians(a))),
                    size=0.5, lens='glow_warm')
    # nav markers on the frame verts
    for k, a in enumerate((0.0, 90.0, 180.0, 270.0)):
        u, v, _ = polar_plan(FRAME_R, a, 0.0)
        F.light(s, f'Nav{k}', P(u, v, 2.5),
                'glow_red' if a in (90.0, 270.0) else 'glow_green', size=0.4)
