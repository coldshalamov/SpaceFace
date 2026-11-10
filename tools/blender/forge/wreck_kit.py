"""Forge-derived wreck tooling (GFX-7).

One shared pipeline for "wrecked version of a real Forge hull": load a donor ship module's
build(), keep only a region, cut it with a slightly jagged multi-plane bisect, cap the cut
with scorched dark plate, grow exposed frame ribs and torn plate along the break, then apply
a damage state:

    fresh          original paint; scorch only at the cut; two dim red emergency lamps;
                   drives dark.
    cooling        paint intact, heat markers dimmed — the pack's default aftermath state.
    derelict       every finish faded toward deadmetal; all lights dead.
    stripped       outer plating removed in patches, frames exposed.
    stripped_heavy most plating gone; frames and machinery left.

No texture noise anywhere: scorch, fade and wear are modelled (darker plates, missing
panels, exposed members). The cut/cap/rib functions (jagged_bisect, cap_loops, frame_stubs,
torn_flange, plating_patches) are donor-agnostic — the GFX-6 note wants them reusable for
live hull damage.

Determinism: every jitter/wobble keys off an explicit `seed`, never bpy's RNG.
"""
from __future__ import annotations

import importlib.util
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
SHIPS_DIR = os.path.join(HERE, 'ships')
for _p in (HERE, SHIPS_DIR):
    if _p not in sys.path:
        sys.path.insert(0, _p)

import forge as F  # noqa: E402

# ---------------------------------------------------------------------------------------------
# Wreck-kit finishes. Same FINISHES vocabulary as the fleet; extra keys live on a per-kit Ship so
# donor palettes stay untouched. Values are deliberately dark: a wreck is lit by the sector,
# and its skin reads mostly in silhouette.
WRECK_EXTRAS = {
    'wk_scorch': ('ceramic', '#171310'),    # near-black burnt cap plate
    'wk_scorch_edge': ('ceramic', '#33231a'),  # heat-tinted ring around the burn
    'wk_torn': ('bare', '#8f9298'),         # bright ragged bare-metal tear edge
    'wk_cut': ('bare', '#6e6154'),          # straight salvage-torch cut, faintly oxidised
    'wk_frame': ('gunmetal', '#3c4148'),    # exposed frame steel
    'wk_dead': ('deadmetal', '#26262a'),    # derelict skin fallback
    'wk_emerg': ('glow_red', '#8f1f14'),    # dim emergency lamp
    'wk_glass_dead': ('ceramic', '#141a1e'),  # dead glazing
}

PAINT_FINISHES = frozenset(('paint', 'paint2', 'paint.upper', 'stripe', 'hazard', 'ceramic'))
EMISSIVE_FINISHES = frozenset(k for k, spec in F.FINISHES.items() if spec.get('emit')) \
    | {'wk_emerg'}


def build_donor(ship_id):
    """Run the donor Forge ship's own build() and return its Ship. Scene is left populated —
    region selection and surgery happen on these objects."""
    path = os.path.join(SHIPS_DIR, f'{ship_id}.py')
    spec = importlib.util.spec_from_file_location(f'forge_ship_{ship_id}', path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    ship = mod.build()
    _inject_wreck_finishes(ship)
    return ship


def _inject_wreck_finishes(ship):
    for key, (finish, hexcolor) in WRECK_EXTRAS.items():
        ship.colors[key] = hexcolor
    ship._wreck_finish_of = {key: finish for key, (finish, _c) in WRECK_EXTRAS.items()}


def wk_mat(ship, key):
    """Material for a wreck-kit finish. wk_* keys are not FINISHES entries — the tuple maps each
    to the real finish role it is built on — so they need make_material directly."""
    if key in WRECK_EXTRAS:
        if key not in ship._mats:
            finish, hexcolor = WRECK_EXTRAS[key]
            m = F.make_material(f'{ship.id}_{key}', finish, hexcolor, ship.id)
            m['forgeKey'] = key
            ship._mats[key] = m
        return ship._mats[key]
    return ship.mat(key)


def _finish_of_material(mat):
    """The finish key a material was built with — Forge stamps `forgeFinish`; kit extras are
    looked up on the ship separately."""
    return mat.get('forgeFinish')


def _finish_of_face(obj, face, ship):
    try:
        mat = obj.data.materials[face.material_index]
    except IndexError:
        return None
    key = getattr(mat, 'get', lambda *_: None)('forgeKey') or _finish_of_material(mat)
    return key


# ---------------------------------------------------------------------------------------------
# Region selection + the jagged cut

def objects_world_bounds(objs):
    pts = []
    for o in objs:
        if o.type != 'MESH':
            continue
        pts.extend(o.matrix_world @ Vector(c) for c in o.bound_box)
    if not pts:
        return Vector((0, 0, 0)), Vector((0, 0, 0))
    return (Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts))),
            Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts))))


def keep_band(ship, lo=None, hi=None, axis=0, also=None, drop=None, seed=1,
              jag=0.45, cap_finish='wk_scorch'):
    """Keep objects whose world bbox centre sits inside [lo, hi] on `axis` (and inside `also`
    bounds dict {axis: (lo,hi)} when given). Objects straddling a boundary are bisected with a
    jagged cut; objects fully outside are deleted. `drop` is a list of name substrings to delete
    unconditionally (e.g. lamps on the kept side that make no sense on a wreck).

    Returns the list of kept objects."""
    bounds = {axis: (lo, hi)}
    if also:
        bounds.update(also)
    keep, cut, dead = [], [], []
    drop = tuple(drop or ())
    for o in ship.objects:
        if o.type != 'MESH':
            continue
        if drop and any(d in o.name for d in drop):
            dead.append(o)
            continue
        lo_w, hi_w = objects_world_bounds([o])
        status = 'in'
        for ax, (a, b) in bounds.items():
            if a is not None and hi_w[ax] < a - 1e-4:
                status = 'out'
            elif b is not None and lo_w[ax] > b + 1e-4:
                status = 'out'
            elif (a is not None and lo_w[ax] < a) or (b is not None and hi_w[ax] > b):
                status = 'cut'
        if status == 'out':
            dead.append(o)
        elif status == 'cut':
            cut.append(o)
        else:
            keep.append(o)
    for i, o in enumerate(cut):
        survived = True
        for ax, (a, b) in bounds.items():
            n = Vector((0, 0, 0))
            n[ax] = 1.0
            # jagged_bisect keeps the -normal side: to keep ABOVE a lower bound the plane normal
            # must point -axis, to keep BELOW an upper bound it must point +axis.
            for val, keep_sign in ((a, -1), (b, +1)):
                if val is None:
                    continue
                co = Vector((0, 0, 0))
                co[ax] = val
                survived = jagged_bisect(o, co, n * keep_sign, seed=seed + i * 7 + ax,
                                         jag=jag, ship=ship, cap_finish=cap_finish)
                if not survived:
                    break
            if not survived:
                break
        if survived:
            keep.append(o)
        else:
            dead.append(o)
    for o in dead:
        if o.name in [x.name for x in ship.objects]:
            ship.objects.remove(o)
        bpy.data.objects.remove(o, do_unlink=True)
    return keep


def jagged_bisect(obj, plane_co, plane_no, seed=0, jag=0.45, ship=None, cap_finish='wk_scorch'):
    """Bisect one mesh along a plane, keep the -normal side (bisect_plane clear_outer removes the
    +normal side), then roughen the cut edge and cap the wound with a scorched plate. `jag`
    jitters the fresh cut verts in-plane AND along the normal (the multi-plane stagger) so the
    edge never reads as a machine cut. Returns False if nothing survived."""
    n = Vector(plane_no).normalized()
    me = obj.data
    bm = bmesh.new()
    bm.from_mesh(me)
    geom = list(bm.verts) + list(bm.edges) + list(bm.faces)
    res = bmesh.ops.bisect_plane(bm, geom=geom, dist=1e-4, plane_co=tuple(plane_co),
                                 plane_no=tuple(n), clear_outer=True)
    if not bm.faces:
        bm.to_mesh(me)
        bm.free()
        return False
    # jagged edge: push every fresh cut vertex perpendicular in-plane AND a little along n
    new_verts = [g for g in res.get('geom_cut', []) if isinstance(g, bmesh.types.BMVert)]
    cut_edges = [g for g in res.get('geom_cut', []) if isinstance(g, bmesh.types.BMEdge)]
    up = Vector((0, 0, 1))
    if abs(n.dot(up)) > 0.9:
        up = Vector((0, 1, 0))
    u = n.cross(up).normalized()
    v = n.cross(u).normalized()
    for i, vtx in enumerate(new_verts):
        k = math.sin(seed * 3.71 + i * 17.31) + 0.55 * math.sin(seed * 1.13 + i * 41.7)
        vtx.co += n * (k * jag * 0.5) + u * (math.sin(seed * 7.7 + i * 9.3) * jag * 0.35) \
            + v * (math.cos(seed * 5.3 + i * 12.9) * jag * 0.35)
    # cap the wound: fill every boundary loop left by the cut, painted scorch
    boundary = [e for e in bm.edges if len(e.link_faces) == 1]
    if boundary:
        fill = bmesh.ops.holes_fill(bm, edges=boundary)
        cap_faces = fill.get('faces', [])
        if cap_finish and ship is not None:
            idx = _slot_index(obj, ship, cap_finish)
            for f in cap_faces:
                f.material_index = idx
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    return bool(me.polygons)


def ship_mats(obj):
    return obj.data.materials


def _slot_index(obj, ship, finish_key):
    for i, m in enumerate(obj.data.materials):
        if m.get('forgeKey') == finish_key:
            return i
    obj.data.materials.append(wk_mat(ship, finish_key))
    return len(obj.data.materials) - 1


def cap_wound(obj, ship, cap_finish='wk_scorch', inset=0.0):
    """Fill every open boundary loop of the mesh with a scorched cap plate. Used after a cut or
    after plating removal where a face is wanted (not an open ribcage)."""
    me = obj.data
    bm = bmesh.new()
    bm.from_mesh(me)
    boundary = [e for e in bm.edges if len(e.link_faces) == 1]
    if not boundary:
        bm.free()
        return 0
    fill = bmesh.ops.holes_fill(bm, edges=boundary)
    idx = _slot_index(obj, ship, cap_finish)
    for f in fill.get('faces', []):
        f.material_index = idx
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    return len(fill.get('faces', []))


def carve_band(ship, lo, hi, axis=0, seed=0, jag=0.45, cap_finish='wk_scorch'):
    """Remove a mid-band of the donor along `axis`: drop objects whose bbox sits fully inside
    [lo, hi]; objects that straddle are SPLIT into two pieces — each survivor keeps its outer
    part, jagged-bisected and scorch-capped. This is how a torn-out bay (the freighter ribcage
    gap, the burst drum) is made without hand-authoring either side."""
    n = Vector((0.0, 0.0, 0.0))
    n[axis] = 1.0
    co_lo, co_hi = Vector((0.0, 0.0, 0.0)), Vector((0.0, 0.0, 0.0))
    co_lo[axis], co_hi[axis] = lo, hi
    for i, o in enumerate(list(ship.objects)):
        if o.type != 'MESH':
            continue
        bl, bh = objects_world_bounds([o])
        if bh[axis] <= lo or bl[axis] >= hi:
            continue  # fully outside the band — untouched
        if bl[axis] >= lo and bh[axis] <= hi:
            ship.objects.remove(o)
            bpy.data.objects.remove(o, do_unlink=True)
            continue
        # straddles at least one face: below-part keeps x <= lo (normal +axis keeps the -side),
        # upper-part keeps x >= hi (normal -axis keeps the +side). The copy is made BEFORE the
        # bisect — a bisect that empties the mesh deletes the object.
        upper = o.copy()
        upper.data = o.data.copy()
        if not jagged_bisect(o, co_lo, n, seed=seed + i * 13, jag=jag, ship=ship,
                             cap_finish=cap_finish):
            ship.objects.remove(o)
            bpy.data.objects.remove(o, do_unlink=True)
        bpy.context.scene.collection.objects.link(upper)
        ship.objects.append(upper)
        if not jagged_bisect(upper, co_hi, -n, seed=seed + i * 29, jag=jag, ship=ship,
                             cap_finish=cap_finish):
            ship.objects.remove(upper)
            bpy.data.objects.remove(upper, do_unlink=True)


# ---------------------------------------------------------------------------------------------
# Break decoration (all geometry ADDS; nothing floats — every member roots on rim points)

def _mk_beam(ship, name, a, b, radius, finish='wk_frame', verts=5):
    a, b = Vector(a), Vector(b)
    d = b - a
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=verts, radius1=radius,
                          radius2=radius * 0.8, depth=d.length)
    rot = d.to_track_quat('Z', 'Y')
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=rot.to_matrix().to_4x4())
    bmesh.ops.translate(bm, verts=bm.verts, vec=(a + b) * 0.5)
    return ship.add(F._new_object(name, bm, [wk_mat(ship, finish)], bevel=0.0, smooth_angle=20.0))


def _mk_plate(ship, name, a, b, width, thick, roll, finish='wk_torn'):
    a, b = Vector(a), Vector(b)
    d = b - a
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for vtx in bm.verts:
        vtx.co.x *= thick
        vtx.co.y *= width
        vtx.co.z *= d.length
    q = d.to_track_quat('Z', 'Y')
    if roll:
        q = q @ Matrix.Rotation(roll, 4, 'Z').to_quaternion()
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=q.to_matrix().to_4x4())
    bmesh.ops.translate(bm, verts=bm.verts, vec=(a + b) * 0.5)
    return ship.add(F._new_object(name, bm, [wk_mat(ship, finish)], bevel=0.0, smooth_angle=20.0))


def _basis(normal):
    n = Vector(normal).normalized()
    up = Vector((0, 0, 1))
    if abs(n.dot(up)) > 0.94:
        up = Vector((0, 1, 0))
    u = n.cross(up).normalized()
    v = n.cross(u).normalized()
    return n, u, v


def frame_stubs(ship, name, center, normal, radius, count=9, stub=2.2, thick=0.28,
                squash=1.0, seed=0, finish='wk_frame'):
    """Frame members projecting OUT of the cut — hulls snap between frames, so the frames stick
    out of the wound. `normal` points AWAY from the kept material, into the void the removed
    part occupied. Every stub roots at the rim (radius ring on the cut plane); nothing floats."""
    n, u, v = _basis(normal)
    made = []
    for i in range(count):
        ang = seed * 0.37 + (i / count) * math.tau
        wobble = 0.78 + 0.34 * ((i * 7 + seed) % 5) / 4.0
        p = Vector(center) + (u * math.cos(ang) + v * math.sin(ang) * squash) * radius
        tip = p + n * (stub * wobble) + (u * math.cos(ang) + v * math.sin(ang)) * (0.3 * wobble)
        made.append(_mk_beam(ship, f'{name}_rib{i}', p, tip, thick * wobble, finish=finish))
    return made


def torn_flange(ship, name, center, normal, radius, count=7, depth=1.6, width=1.4,
                squash=1.0, seed=0, finish='wk_torn'):
    """Curled plating petals around the cut rim — the ragged edge a torn hull leaves. Petals fold
    out along +normal (away from the kept material) and curl back over the rim."""
    n, u, v = _basis(normal)
    made = []
    for i in range(count):
        ang = seed * 0.53 + (i / count) * math.tau
        k = (i * 11 + seed) % 7
        d = depth * (0.55 + 0.22 * k)
        w = width * (0.7 + 0.16 * ((i * 5) % 4))
        curl = 0.5 + 0.42 * ((i * 3) % 5)
        base = Vector(center) + (u * math.cos(ang) + v * math.sin(ang) * squash) * radius
        tip = base + n * d - (u * math.cos(ang) + v * math.sin(ang)) * (0.35 * d)
        made.append(_mk_plate(ship, f'{name}_tear{i}', base, tip, w, 0.1, roll=curl,
                              finish=finish))
    return made


def mk_ring_arc(ship, name, radius, tube_w, tube_h, a0_deg, a1_deg, center=(0, 0, 0),
                segments=18, finish='wk_frame'):
    """A swept rectangular-section ring arc in the YZ plane (the frame rings a trunk hull snaps
    between). Closed solid with end caps — the torn ends are dressed by wound() separately."""
    bm = bmesh.new()
    verts = []
    a0, a1 = math.radians(a0_deg), math.radians(a1_deg)
    for i in range(segments + 1):
        a = a0 + (a1 - a0) * i / segments
        radial = Vector((0.0, math.cos(a), math.sin(a)))
        c = Vector(center) + radial * radius
        for du, dv in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            verts.append(bm.verts.new(c + radial * (du * tube_w * 0.5)
                                      + Vector((dv * tube_h * 0.5, 0, 0))))
    for i in range(segments):
        b0, b1 = i * 4, (i + 1) * 4
        for j in range(4):
            j2 = (j + 1) % 4
            bm.faces.new((verts[b0 + j], verts[b1 + j], verts[b1 + j2], verts[b0 + j2]))
    bm.faces.new((verts[0], verts[1], verts[2], verts[3]))
    e = segments * 4
    bm.faces.new((verts[e + 3], verts[e + 2], verts[e + 1], verts[e]))
    bm.normal_update()
    return ship.add(F._new_object(name, bm, [wk_mat(ship, finish)], bevel=0.0, smooth_angle=20.0))


def mk_pipe(ship, name, points, radius, finish='wk_frame', verts=6):
    """A bent pipe as a chain of beam segments along `points` — cable runs, torn plumbing."""
    made = []
    for i in range(len(points) - 1):
        made.append(_mk_beam(ship, f'{name}{i}', points[i], points[i + 1], radius,
                             finish=finish, verts=verts))
    return made


def keep_side(ship, axis=1, sign=1, at=0.0, seed=0, jag=0.3):
    """Keep only the `sign` side of a plane through `at` on `axis` — bisect straddlers."""
    n = Vector((0.0, 0.0, 0.0))
    n[axis] = float(sign)
    co = Vector((0.0, 0.0, 0.0))
    co[axis] = at
    for i, o in enumerate(list(ship.objects)):
        if o.type != 'MESH':
            continue
        bl, bh = objects_world_bounds([o])
        centre = 0.5 * (bl[axis] + bh[axis])
        if sign > 0 and bh[axis] <= at:
            ship.objects.remove(o)
            bpy.data.objects.remove(o, do_unlink=True)
        elif sign < 0 and bl[axis] >= at:
            ship.objects.remove(o)
            bpy.data.objects.remove(o, do_unlink=True)
        elif (sign > 0 and centre < at) or (sign < 0 and centre > at):
            # straddling: keep the signed side
            if not jagged_bisect(o, co, -n if sign > 0 else n, seed=seed + i * 3, jag=jag,
                                 ship=ship):
                ship.objects.remove(o)
                bpy.data.objects.remove(o, do_unlink=True)


def wound(ship, name, center, normal, radius, seed=0, ribs=9, tears=7, squash=1.0,
          stub=None, cap='wk_scorch'):
    """The complete Forge-language break: scorched cap (done by the bisect), frame stubs
    projecting past the cut, torn plate petals on the rim."""
    frame_stubs(ship, f'{name}_f', center, normal, radius, count=ribs, stub=stub or radius * 0.35,
                squash=squash, seed=seed)
    torn_flange(ship, f'{name}_t', center, normal, radius * 1.02, count=tears, squash=squash,
                depth=radius * 0.3, width=radius * 0.24, seed=seed + 3)


# ---------------------------------------------------------------------------------------------
# Damage states

def _iter_face_mats(obj):
    """Yield (face_loop_index→material_index) mapping helpers — we work on bpy mesh polygons."""
    return obj.data.polygons


def faded_clone(ship, mat, tag, k_val=0.5, desat=0.45, emit_kill=True):
    """Clone a Forge material darkened/desaturated toward deadmetal; kills emission. Texture
    wiring (panel tile) is preserved — the wear is value, not noise."""
    name = f'{mat.name}__{tag}'
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    clone = mat.copy()
    clone.name = name
    bsdf = next((n for n in clone.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if bsdf is None:
        return clone
    if emit_kill:
        if 'Emission Strength' in bsdf.inputs:
            bsdf.inputs['Emission Strength'].default_value = 0.0
        if 'Emission Color' in bsdf.inputs:
            bsdf.inputs['Emission Color'].default_value = (0.0, 0.0, 0.0, 1.0)
    # the Forge paint texture path feeds colour through a MIX(A=color) node; the plain path
    # uses the Principled base colour directly. Fade whichever carries colour.
    mix = next((n for n in clone.node_tree.nodes
                if n.type == 'MIX' and n.data_type == 'RGBA'
                and n.outputs['Result'].is_linked), None)
    target = None
    if mix and mix.outputs['Result'].links and \
            mix.outputs['Result'].links[0].to_node == bsdf:
        target = mix.inputs['A'].default_value
        target = [c * k_val for c in target[:3]]
        g = sum(target) / 3.0
        target = [g + (c - g) * (1.0 - desat) for c in target]
        mix.inputs['A'].default_value = (*target, 1.0)
    else:
        bc = bsdf.inputs['Base Color'].default_value
        g = (bc[0] + bc[1] + bc[2]) / 3.0 * k_val
        bsdf.inputs['Base Color'].default_value = (
            g + (bc[0] * k_val - g) * (1.0 - desat),
            g + (bc[1] * k_val - g) * (1.0 - desat),
            g + (bc[2] * k_val - g) * (1.0 - desat), 1.0)
    if 'Roughness' in bsdf.inputs:
        bsdf.inputs['Roughness'].default_value = min(1.0, bsdf.inputs['Roughness'].default_value + 0.25)
    clone['forgeKey'] = mat.get('forgeKey', '')
    clone['wkState'] = tag
    return clone


def _remap_object_materials(obj, fn):
    """Replace each material slot on obj with fn(mat)."""
    me = obj.data
    for i, m in enumerate(me.materials):
        new = fn(m)
        if new is not m:
            me.materials[i] = new


def _snap_to_surface(ship, point, max_dist=3.5):
    """Closest point on any ship mesh to `point`, or None if nothing is within max_dist.
    Keeps authored marks (lamps) rooted on real structure even when the nominal position
    lands inside a hollow (e.g. a split drum's bore)."""
    best, best_d = None, max_dist
    for o in ship.objects:
        if o.type != 'MESH' or not o.data.polygons:
            continue
        try:
            hit, loc, _n, _i = o.closest_point_on_mesh(o.matrix_world.inverted() @ point)
        except (RuntimeError, ValueError):
            continue
        if not hit:
            continue
        d = ((o.matrix_world @ loc) - point).length
        if d < best_d:
            best_d = d
            best = (o.matrix_world @ loc) + (o.matrix_world.to_3x3() @ _n).normalized() * 0.12
    return best


def apply_damage_state(ship, state, cut_at=None, seed=0):
    """The GFX-7 ladder, implemented as geometry + material remap (no texture noise).

    fresh:           original paint; scorch ONLY near the cut; two dim red emergency lamps.
    cooling:         fresh minus the lamps — the default aftermath read.
    derelict:        every finish faded toward deadmetal; all lights dead (emissive killed).
    stripped:        plating faces removed in patches; frames exposed across the holes; the
                     surviving skin keeps faded paint; lights dead.
    stripped_heavy:  heavier patch removal; small plating objects removed whole.
    """
    if state in ('derelict', 'stripped', 'stripped_heavy'):
        dead_cache = {}
        def _dead(m):
            key = m.name
            if key not in dead_cache:
                dead_cache[key] = faded_clone(ship, m, 'dead', k_val=0.42, desat=0.55)
            return dead_cache[key]
        for o in ship.objects:
            if o.type != 'MESH':
                continue
            _remap_object_materials(o, _dead)
    if state == 'fresh':
        # two dim red emergency lamps near the wound, rooted on structure. Named emerg_* so the
        # pack's check_attachment() counts them as marks and proves they sit on a surface.
        if cut_at is not None:
            for i, off in enumerate(((0.0, 0.55, 0.25), (0.0, -0.5, -0.3))):
                at = _snap_to_surface(ship, Vector(cut_at) + Vector(off) * 1.5)
                if at is None:
                    continue
                bm = bmesh.new()
                bmesh.ops.create_icosphere(bm, subdivisions=1, radius=0.18)
                lamp = ship.add(F._new_object(f'emerg_wk{i}', bm,
                                              [wk_mat(ship, 'wk_emerg')],
                                              bevel=0.0, smooth_angle=40.0))
                # position lives on the object transform, not baked into the verts: the pack's
                # attachment check reads matrix_world.translation to prove the mark is seated
                lamp.location = at
    if state in ('stripped', 'stripped_heavy'):
        plating_patches(ship, fraction=0.38 if state == 'stripped' else 0.62,
                        seed=seed, add_ribs=True)
        if state == 'stripped_heavy':
            # whole small plating objects are already gone with the paint — remove detail parts
            doomed = [o for o in ship.objects
                      if o.type == 'MESH' and o.get('forge_detail') == 1]
            for o in doomed:
                ship.objects.remove(o)
                bpy.data.objects.remove(o, do_unlink=True)


def plating_patches(ship, fraction=0.38, seed=0, add_ribs=True, min_span=1.2):
    """Remove plating faces in deterministic patches across every kept mesh, then bridge the
    holes with frame members so the removal reads as exposed structure, never as a hole to
    nothing. Returns the patch count."""
    removed_total = 0
    patch_count = 0
    for o in list(ship.objects):
        if o.type != 'MESH' or not o.data.polygons:
            continue
        me = o.data
        plating_idx = {i for i, m in enumerate(me.materials)
                       if (m.get('forgeKey') or m.get('forgeFinish')) in PAINT_FINISHES
                       or (m.get('forgeFinish') in PAINT_FINISHES)}
        if not plating_idx:
            continue
        bm = bmesh.new()
        bm.from_mesh(me)
        plating = [f for f in bm.faces if f.material_index in plating_idx]
        if not plating:
            bm.free()
            continue
        # deterministic patch centres: seeded pick of plating faces, spaced by face-centre
        target = int(len(plating) * fraction)
        doomed = []
        pool = sorted(plating, key=lambda f: (f.index * 1103515245 + seed * 97) % 65536)
        centres = []
        for f in pool:
            c = f.calc_center_median()
            if all((c - p).length > min_span for p in centres):
                centres.append(c)
                doomed.append(f)
            if len(doomed) >= target:
                break
        # grow each patch to a contiguous blob of a few faces
        grown = set(doomed)
        frontier = list(doomed)
        while frontier and len(grown) < target:
            f = frontier.pop()
            for e in f.edges:
                for lf in e.link_faces:
                    if lf in grown or lf.material_index not in plating_idx:
                        continue
                    if len(grown) >= target:
                        break
                    grown.add(lf)
                    frontier.append(lf)
        if not grown:
            bm.free()
            continue
        # rim vertices of the holes, for rib anchors — snapshot the coordinates BEFORE the
        # delete: context='FACES' frees orphaned verts and invalidates the BMVert wrappers
        rim_pts = []
        seen = set()
        for f in grown:
            for e in f.edges:
                for lf in e.link_faces:
                    if lf not in grown:
                        for v in e.verts:
                            if v.index not in seen:
                                seen.add(v.index)
                                rim_pts.append(v.co.copy())
        if len(grown) >= 3:
            patch_count += 1
        bmesh.ops.delete(bm, geom=list(grown), context='FACES')
        bm.to_mesh(me)
        bm.free()
        if add_ribs and len(rim_pts) >= 3:
            pts = [o.matrix_world @ p for p in rim_pts]
            # span the hole with 1-3 chords between well-separated rim verts
            pts.sort(key=lambda p: p.x + p.y * 0.3 + p.z * 0.7)
            a, b = pts[0], pts[-1]
            mid = pts[len(pts) // 2]
            inward = (Vector(a) + Vector(b)) * 0.5
            _mk_beam(ship, f'{o.name}_xrib{patch_count}a', a, b,
                     0.09 + 0.02 * (seed % 3), finish='wk_frame')
            if (Vector(mid) - inward).length > 0.4:
                _mk_beam(ship, f'{o.name}_xrib{patch_count}b', mid, inward,
                         0.07, finish='wk_frame')
            removed_total += len(grown)
    return removed_total


def scorch_gradient(ship, at, reach, core=0.45):
    """Faces within `reach` of the break get heat-tinted; inside `core`*reach they go near-black.
    Modelled value falloff, not a decal."""
    at = Vector(at)
    for o in ship.objects:
        if o.type != 'MESH' or not o.data.polygons:
            continue
        me = o.data
        idx_edge = _slot_index(o, ship, 'wk_scorch_edge')
        idx_core = _slot_index(o, ship, 'wk_scorch')
        mw = o.matrix_world
        for f in me.polygons:
            d = (mw @ f.center - at).length
            if d > reach:
                continue
            key = _finish_of_material(me.materials[f.material_index]) \
                or (me.materials[f.material_index].get('forgeKey'))
            if key in EMISSIVE_FINISHES:
                continue
            f.material_index = idx_core if d < reach * core else idx_edge


def emergency_lamps(ship, positions, radius=0.18):
    """Dim red emergency lamps (fresh state), rooted on real geometry positions."""
    for i, at in enumerate(positions):
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=1, radius=radius)
        lamp = ship.add(F._new_object(f'emerg_wk{i}', bm, [wk_mat(ship, 'wk_emerg')],
                                      bevel=0.0, smooth_angle=40.0))
        lamp.location = at  # keep the position on the transform: attachment checks read origins


def clear_objects(ship):
    """Remove every mesh from a donor ship, keeping its palette/materials — the blank canvas for
    kit-authored fragments that still need the shared Forge finish vocabulary."""
    for o in list(ship.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    ship.objects.clear()


# ---------------------------------------------------------------------------------------------
# Sizing + finishing

def scale_to_longest(ship, target_m, axis_pad=0.0):
    """Uniform scale so the piece's longest envelope dimension equals the catalog longestM."""
    lo, hi = objects_world_bounds(ship.objects)
    size = hi - lo
    cur = max(size.x, size.y, size.z)
    if cur <= 1e-6:
        return 1.0
    k = target_m / (cur + axis_pad)
    for o in ship.objects:
        o.scale = (o.scale[0] * k, o.scale[1] * k, o.scale[2] * k)
        # keep object-space positions in step: transform_apply below bakes scale into the mesh
        # only, so an unscaled location would strand positioned objects (emerg lamps) at
        # donor-unit coordinates inside a metre-scale piece
        o.location = o.location * k
    bpy.context.view_layer.update()
    for o in ship.objects:
        if o.type == 'MESH':
            bpy.ops.object.select_all(action='DESELECT')
            o.select_set(True)
            bpy.context.view_layer.objects.active = o
            bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
            o['forge_bevel'] = float(o.get('forge_bevel', 0.03)) * k
    bpy.context.view_layer.update()
    return k


def finish_piece(ship):
    """Forge finish on every kept mesh — bevel, weighted normals, world-locked UVs — done AFTER
    scaling so the 4 m texture tiles stay honest at wreck size."""
    for o in ship.objects:
        if o.type == 'MESH':
            F.finish_object(o)
    return ship


# ---------------------------------------------------------------------------------------------
# Donor-side convenience: pull a named sub-part out of a donor by name prefix

def take_parts(ship, prefixes, keep_objects=None):
    """Keep only objects whose names start with one of `prefixes` (plus keep_objects names)."""
    keep = []
    drop = tuple(prefixes)
    for o in list(ship.objects):
        if o.type != 'MESH':
            continue
        if any(o.name.startswith(p) for p in drop) or (keep_objects and o.name in keep_objects):
            keep.append(o)
        else:
            ship.objects.remove(o)
            bpy.data.objects.remove(o, do_unlink=True)
    return keep
