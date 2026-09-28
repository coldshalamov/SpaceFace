"""Shared kit for the player-built claim outpost family (place_claim_outpost_*).

One design language across all six bodies: a claimed rock wrapped by a work-fleet service
ring — ivory deck plates over graphite structure, safety-yellow hazard bands, one role accent
colour per specialisation — with a dock arm reaching +X and four module pads at the ring's
corner stations.

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
    'hazard': '#b0841f',      # safety yellow
    'dark': '#16191d',
    'stone': '#3f3a34',       # claim rock — dark enough to sit back inside the wheel
    'glow_warm': '#ffc27a',
    'glow_amber': '#ffae2a',
    'glow_cyan': '#5fe8ff',
    'glow_red': '#ff3a2a',
    'glow_green': '#3dff7a',
}

RING_R0, RING_R1 = 30.0, 44.0     # service ring inner/outer radius (plan)
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
    """The shared claim-anchor platform: rock + service ring + module pads + dock arm +
    ops pod + emissive bay. Returns nothing; spec files add their module structure on top."""
    opts = opts or {}
    # --- claim rock: the boulder the outpost is bolted onto. Behind the wheel face
    # (blender -Y), flattened through the plane so it fills the ring's mouth without
    # swallowing the front-face structures; inside the live depth contract (~+-18 m).
    rock = placed_rock(s, 'ClaimRock', 0.0, 0.0, -4.0, 22.0, seed=opts.get('seed', 7),
                       scale_y=0.5)
    rock2 = placed_rock(s, 'ClaimRockB', -18.0, 16.0, -8.0, 12.0,
                        seed=opts.get('seed', 7) + 3, scale_y=0.6)
    # --- service ring ------------------------------------------------------------------
    ring_slab(s, 'RingDeck', RING_R0, RING_R1, -1.6, 1.6, material='paint')
    ring_slab(s, 'RingRim', RING_R1 - 1.2, RING_R1, -2.2, 2.2, material='hazard')
    ring_slab(s, 'RingInner', RING_R0, RING_R0 + 0.9, -2.0, 2.0, material='paint2')
    # deck plates over the slab: raised quadrant plates with recessed seams
    for k in range(8):
        a0 = k * 45.0 + 3.0
        ring_slab(s, f'DeckPlate{k}', RING_R0 + 3.0, RING_R1 - 3.0, 1.6, 2.1,
                  material='paint.aged' if k % 3 == 0 else 'paint', arc=(a0, a0 + 39.0),
                  segments=8)
    # --- X-bridges: two trussed deck arms crossing the wheel mouth diagonally. They carry
    # the four module pads and the ops pod — the family's plan signature is the X across
    # the ring, and every pad visibly stands on a bridge, never floats in the hole.
    for k, ((au, av), (bu, bv)) in enumerate((((-20.0, -20.0), (20.0, 20.0)),
                                             ((-20.0, 20.0), (20.0, -20.0)))):
        plan_box(s, f'Bridge{k}Deck', (au + bu) / 2, (av + bv) / 2, 0.6, 58.0, 9.0, 1.4,
                 material='paint.aged', rot=math.radians(45.0 if k == 0 else -45.0),
                 bevel=0.06)
        plan_truss(s, f'Bridge{k}Truss', (au, av, -0.4), (bu, bv, -0.4), 5.0, 10,
                   material='paint2', chord=0.4, web=0.24)
        # hazard kerb lines down each bridge edge
        for e in (-1, 1):
            a = math.radians(45.0 if k == 0 else -45.0)
            ex, ev = math.cos(a + math.pi / 2), math.sin(a + math.pi / 2)
            plan_box(s, f'Bridge{k}Kerb{e:+d}', e * ex * 4.7, e * ev * 4.7, 1.5,
                     57.0, 0.4, 0.4, material='hazard',
                     rot=a, bevel=0.0)
    # radial trusses tying ring to the rock collar
    for k in range(8):
        a = k * 45.0 + 22.5
        u, v, _ = polar_plan(RING_R0 - 1.5, a)
        u2, v2, _ = polar_plan(14.0, a)
        plan_beams(s, f'RingSpoke{k}', [((u2, v2, -1.0), (u, v, -1.0))], 0.9,
                   material='paint2')
    # --- module pads: four square pad decks at the ring corner stations -------------------
    for k, (mu, mv) in enumerate(MODULE_PADS):
        plan_box(s, f'Pad{k}', mu, mv, 2.0, 15.0, 15.0, 1.6, material='paint2', bevel=0.1)
        plan_box(s, f'Pad{k}Top', mu, mv, 2.9, 13.0, 13.0, 0.35, material='paint.aged',
                 bevel=0.03)
        # hazard kerb round the pad lip
        for e in (-1, 1):
            plan_box(s, f'Pad{k}KerbU{e}', mu + e * 6.4, mv, 3.0, 0.8, 13.0, 0.5,
                     material='hazard', bevel=0.0)
            plan_box(s, f'Pad{k}KerbV{e}', mu, mv + e * 6.4, 3.0, 13.0, 0.8, 0.5,
                     material='hazard', bevel=0.0)
        F.light(s, f'Pad{k}Lamp', P(mu + 6.0, mv + 6.0, 3.3), 'glow_amber', size=0.35)
        # struts from pad to ring face so nothing floats
        ru, rv, _ = polar_plan(RING_R1 - 6.0, math.degrees(math.atan2(mv, mu)))
        plan_beams(s, f'Pad{k}Strut', [((ru, rv, 0.4), (mu, mv, 1.4))], 1.2, material='paint2')
    # --- central ops pod (structure core): lived-in block on the wheel face --------------
    plan_box(s, 'OpsPod', 0.0, 0.0, 6.0, 20.0, 14.0, 9.0, material='paint', bevel=0.3)
    plan_box(s, 'OpsPodBrow', 0.0, 0.0, 11.0, 13.0, 9.0, 2.0, material='paint2', bevel=0.15)
    plan_box(s, 'OpsCollar', 0.0, 0.0, 2.2, 24.0, 18.0, 2.4, material='dark', bevel=0.1)
    # lit window rows on the pod's front face — the crew deck
    s.detail = 1
    for i in range(9):
        u = -7.2 + i * 1.8
        plan_box(s, f'OpsWin{i}', u, -3.2, 10.55, 1.1, 0.7, 0.14, material='glow_warm',
                 bevel=0.0)
        plan_box(s, f'OpsWinB{i}', u, 3.2, 10.55, 1.1, 0.7, 0.14, material='glow_warm',
                 bevel=0.0)
    s.detail = 0
    plan_box(s, 'OpsBand', 0.0, 6.4, 6.0, 20.4, 1.2, 8.4, material='stripe', bevel=0.0)
    # comm antenna + beacon over the pod roof — kept inside the live depth bound (~d<13.6)
    plan_cyl(s, 'OpsMast', -6.0, 5.0, 10.8, -6.0, 5.0, 12.6, 0.35, material='paint2',
             segments=10)
    F.beacon(s, 'OpsBeacon', P(-6.0, 5.0, 13.0), finish='glow_amber', size=0.5)
    # --- dock arm: approach gantry out to +X (tip kept inside the live +55.5 bound) ------
    plan_truss(s, 'DockArm', (RING_R1 - 4, 0.0, 1.2), (51.5, 0.0, 1.2), 4.4, 6,
               material='paint2', chord=0.6, web=0.3)
    plan_box(s, 'DockDeck', 47.5, 0.0, 1.8, 18.0, 8.0, 0.8, material='paint.aged', bevel=0.05)
    plan_box(s, 'DockHead', 51.0, 0.0, 4.6, 7.0, 10.0, 5.0, material='paint', bevel=0.2)
    plan_box(s, 'DockHeadBand', 53.6, 0.0, 4.6, 0.6, 10.4, 4.2, material='stripe', bevel=0.0)
    for e in (-1, 1):
        F.light(s, f'DockGuide{e}', P(51.6, e * 4.4, 5.6),
                'glow_green' if e > 0 else 'glow_red', size=0.4)
        plan_box(s, f'DockRail{e}', 46.5, e * 3.8, 2.6, 12.0, 0.35, 0.9, material='hazard',
                 bevel=0.0)
    # --- emissive bay: the reactor grate on the ops pod's front face (socket station
    # plan (0,0) d ~ +8): a glowing grate between the window rows.
    ring_slab(s, 'BayRing', 2.6, 3.4, 10.4, 10.9, material='paint2', segments=24)
    s.detail = 1
    for k in range(6):
        plan_box(s, f'BayBar{k}', -1.9 + k * 0.76, 0.0, 10.62, 0.4, 4.6, 0.18,
                 material='glow_amber', bevel=0.0)
    s.detail = 0
    # --- perimeter work lamps --------------------------------------------------------------
    for k in range(8):
        a = k * 45.0
        u, v, _ = polar_plan(RING_R1 + 0.4, a, 2.6)
        F.work_lamp(s, f'WorkLamp{k}', P(u, v, 2.6),
                    aim=(-math.cos(math.radians(a)), -0.4, -math.sin(math.radians(a))),
                    size=0.5, lens='glow_warm')
    # nav markers on the ring rim
    for k, a in enumerate((0.0, 90.0, 180.0, 270.0)):
        u, v, _ = polar_plan(RING_R1, a, 0.0)
        F.light(s, f'Nav{k}', P(u, v, 2.5),
                'glow_red' if a in (90.0, 270.0) else 'glow_green', size=0.4)
