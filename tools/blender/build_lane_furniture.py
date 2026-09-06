#!/usr/bin/env python3
"""Author the six lane-furniture classes described in design/fiction/LANE_FURNITURE.md.

These are the things BETWEEN stations — the marks a working corridor accumulates and nobody
photographs. They exist because the sector reads as empty at the only scale the camera can see
(design/graphics-sprints/CAMERA_VISIBLE_BUBBLE.md: ~45-50 world units of visible ground-plane
depth), and because six small authored bodies buy more density per triangle than one more hull.

SOURCE ONLY. This writes GLBs under assets/places/lane_furniture/source/ and renders contact
sheets. It publishes no release artifact and touches no manifest; promotion belongs to whoever
holds those exact paths.

DETERMINISM. Every dimension, lean, dent and missing bolt below is AUTHORED, not sampled. There
is no RNG anywhere in this file. Two runs of the same revision produce byte-identical geometry,
which is what makes an adversarial review of one build binding on the next.

WHY THE DAMAGE IS MODELLED RATHER THAN TEXTURED. The fiction is specific about what breaks on
each class and why — an antenna ring crushed flat on one side where a Pelican's scoop brushed it,
two of four rock bolts sheared, one vane replaced with an unpainted flat plate after a strike.
That asymmetry is SILHOUETTE, and silhouette is the channel that survives distance. A dent painted
into a normal map disappears at 200 units; a missing fin does not.

WHAT THE TEXTURES DO CARRY. Damage stays geometry; MANUFACTURE and SERVICE are surfacing, and a
scalar cannot express either. Every role is backed by deterministic baseColor / packed ORM /
tangent-space normal images generated in memory and packed into the blend — rolled streaks on
structural stock, tighter grinding marks across bare steel, coating that loses to bare metal where
hands and wash have worked, a stencil band and glove polish on identity plates, dry granular soot.
No external image file is written and no procedural noise wallpaper is applied.

Usage:
    blender --background --python tools/blender/build_lane_furniture.py -- --render
    blender --background --python tools/blender/build_lane_furniture.py -- --only place_whistle --out-root C:/tmp/lane-candidate
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
import tempfile
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
# The family is AUTHORED at the fiction's true metres and PLACED at this multiple.
#
# Measured, not chosen: the player's hull is 28 m across and the chase camera shows a ground-plane
# strip only ~45-50 m deep (design/graphics-sprints/CAMERA_VISIBLE_BUBBLE.md). A 2.4 m claim mark
# beside that ship is a matchstick, and the matched-distance renders at 60 units showed all six
# classes reduced to specks. Confirmed in-game: the 9 m lane pin spawned correctly at 226 units and
# read as roughly twenty pixels.
#
# The fiction's metres are kept as the RATIOS between parts, which is where their authority lies —
# a 0.4 x 0.25 m claim plate on a 1.8 m shaft is a claim plate whatever the absolute size. What is
# adjusted is the family's relationship to a ship, because that is a fact about this game rather
# than about the world, and the render is what measured it.
FAMILY_SCALE = 3.4
OUT_SOURCE = ROOT / 'assets' / 'places' / 'lane_furniture' / 'source'
OUT_EVIDENCE = ROOT / 'assets' / 'places' / 'lane_furniture' / 'evidence'
PARTS_OUT = ROOT / 'assets' / 'ships' / 'parts' / 'places'

# Material roles, named the way the rest of the asset pipeline names them so a later promotion
# does not have to invent a mapping.
#
# (r, g, b, roughness, METALLIC). Four structural/steel/plate/scorch roles were 0.85 metallic in
# the rejected pass; the painted shell was 0.22 and the lens 0.0. Roles now reflect substance and
# retain their authored colour contrast.
ROLES = {
    'furniture_painted_shell': (0.42, 0.24, 0.10, 0.62, 0.0),     # heat-stained coating over steel
    'furniture_structural_alloy': (0.30, 0.31, 0.33, 0.68, 1.0),  # dulled mill-finish structure
    'furniture_bare_steel': (0.44, 0.45, 0.47, 0.26, 1.0),        # raw replacement plate and bolts
    'furniture_signal_lens': (0.90, 0.62, 0.22, 0.30, 0.0),       # optical, unchanged
    'furniture_identity_plate': (0.62, 0.60, 0.55, 0.58, 0.0),    # coated, stencilled, glove-wiped
    'furniture_scorch': (0.11, 0.09, 0.08, 0.92, 0.0),            # soot and slag: dry, not chrome
}

# One small manufactured edge break in metres before FAMILY_SCALE, clamped to a quarter of each
# part's thinnest dimension so hard-surface silhouettes stay crisp.
EDGE_BREAK = 0.010

# Image-backed surfacing. The scalar role table above sets the SUBSTANCE CLASS; these maps carry the
# manufacture and service history that a scalar cannot: a uniform dielectric with one roughness
# value has no incident at any distance, which is why the candidate stills read as stained timber
# and plain black drums rather than as coated steel and a scavenged fuel drum.
#
# 128 px per role is sized from the part, not from habit. At UV_PER_M one tile covers 0.71 authored
# metres, so a texel lands on about 5.6 mm of authored surface (19 mm once placed) - fine enough to
# break a specular highlight on a Tier C prop seen from 20-140 units, coarse enough that nothing
# here is standing in for geometry. It is also a cost decision: these buffers are built in pure
# Python and rebuilt for each of the six assets, so 256 would spend minutes per build and quadruple
# the embedded PNG bytes for detail no supported camera resolves.
TEX_SIZE = 128
UV_PER_M = 1.4           # texture tiles per authored metre, before FAMILY_SCALE


def _c01(x):
    return 0.0 if x < 0.0 else (1.0 if x > 1.0 else x)


def _hash01(x, y, seed):
    """Integer hash. Deterministic across platforms and runs; no `random`, no sampling."""
    n = (x * 374761393 + y * 668265263 + seed * 2246822519) & 0xFFFFFFFF
    n = ((n ^ (n >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((n ^ (n >> 16)) & 0xFFFF) / 65535.0


def _cell(u, v, cu, cv, seed):
    """Smoothed value noise on a wrapping integer lattice, with independent per-axis cell counts.

    Coherent patches with a controllable feature size, which is what oxidation, heat stain and
    coating loss actually look like. Deliberately not per-texel white noise: speckle wallpaper is
    the failure this is meant to avoid, so every caller sets a feature size and an ANISOTROPY that
    belongs to that substance's manufacture — a streak is `cu` far above `cv`, or the reverse.

    Both counts stay well under TEX_SIZE/4. A lattice finer than a few texels per cell stops being
    a grain direction and becomes aliasing, which is the same speckle failure by another route.
    """
    fx, fy = u * cu, v * cv
    x0, y0 = int(fx), int(fy)
    tx, ty = fx - x0, fy - y0
    tx = tx * tx * (3.0 - 2.0 * tx)
    ty = ty * ty * (3.0 - 2.0 * ty)
    x1, y1 = (x0 + 1) % cu, (y0 + 1) % cv
    x0, y0 = x0 % cu, y0 % cv
    a = _hash01(x0, y0, seed) * (1.0 - tx) + _hash01(x1, y0, seed) * tx
    b = _hash01(x0, y1, seed) * (1.0 - tx) + _hash01(x1, y1, seed) * tx
    return a * (1.0 - ty) + b * ty


def _surface(role, u, v):
    """One texel of one substance: (r, g, b, occlusion, roughness, metallic, height).

    Each branch is a different material story rather than one recipe recoloured - the failure the
    material-truth skill names explicitly. The alloy carries wide rolled streaks along one axis;
    bare steel carries tight grinding marks across the other, so the two metals differ by
    MICROSURFACE and not merely by grey value. The coating loses to bare substrate at its wear
    patches, which is the single feature that stops a painted shaft reading as timber. Soot has no
    direction at all, because nobody manufactured it.
    """
    r, g, b, rough, metal = ROLES[role]

    if role == 'furniture_structural_alloy':
        rolled = _cell(u, v, 48, 6, 11)              # rolled stock: streaks running along v
        oxide = _cell(u, v, 8, 8, 12)
        # RESTRAINT. `< 0.62` put oxide over ~38% of every alloy face at a near-black value, which
        # read as damage rather than as service and sank decks and grates into holes. At 0.90 the
        # patina is roughly a tenth of the surface and the mill finish is what you see.
        bare = oxide < 0.90
        k = 0.88 + 0.26 * rolled
        col = (r * k, g * k, b * k) if bare else (0.26 + 0.10 * oxide, 0.23 + 0.08 * oxide, 0.20)
        return (col[0], col[1], col[2],
                0.82 + 0.18 * rolled,
                _c01(rough + (rolled - 0.5) * 0.17 + (0.0 if bare else 0.14)),
                1.0 if bare else 0.0,
                rolled * 0.6 + oxide * 0.4)

    if role == 'furniture_bare_steel':
        grind = _cell(u, v, 6, 56, 31)               # ground/cut: tighter, and across the other axis
        rust = _cell(u, v, 18, 18, 32)
        # A replacement plate is mostly clean; rust is where the coating has not been renewed yet.
        clean = rust < 0.88
        k = 0.90 + 0.22 * grind
        col = (r * k, g * k, b * k) if clean else (0.34, 0.20, 0.11)
        return (col[0], col[1], col[2],
                0.88 + 0.12 * grind,
                _c01(rough + (grind - 0.5) * 0.20 + (0.0 if clean else 0.52)),
                1.0 if clean else 0.0,
                grind * 0.45 + (0.0 if clean else (rust - 0.70) * 2.4))

    if role == 'furniture_painted_shell':
        wear = _cell(u, v, 9, 9, 21)                 # where hands, straps and wash have worked
        stain = _cell(u, v, 16, 16, 22)
        chalk = _cell(u, v, 40, 40, 23)
        # RESTRAINT. `> 0.74` stripped about a quarter of every painted face back to metal, so the
        # shaft read as a rusted wreck instead of a maintained post. Wear is where hands, straps and
        # wash actually work: roughly a tenth of the surface, and the coating is the story.
        if wear > 0.90:                              # coating gone: substrate, and it is METAL
            return (0.40, 0.40, 0.42, 0.84 + 0.16 * chalk, 0.42 + (chalk - 0.5) * 0.14, 1.0,
                    0.30 + wear * 0.70)
        # A narrower stain swing: heat staining varies the coat, it does not mottle it.
        k = 0.90 + 0.16 * stain
        return (r * k, g * k * 0.96, b * k * 0.92,
                0.86 + 0.14 * wear,
                _c01(rough + (chalk - 0.5) * 0.18 - stain * 0.06),
                0.0,
                chalk * 0.30 + wear * 0.42)

    if role == 'furniture_identity_plate':
        polish = _cell(u, v, 10, 10, 42)             # glove wear where the read gets rubbed
        # Two stencil bands per tile, so a 0.3 m plate reliably catches one marking run. World
        # projection cannot place a mark on a named face, so the band is a repeating machine
        # marking rather than a specific serial - which is what these plates carry at this range.
        band = 0.30 < ((v * 2.0) % 1.0) < 0.46
        tick = band and _hash01(int(u * 24.0) % 24, 0, 41) > 0.46
        if tick:
            return (0.13, 0.12, 0.11, 0.78, 0.66, 0.0, 0.86)
        k = 0.88 + 0.20 * polish
        return (r * k, g * k, b * k,
                0.90 + 0.10 * polish,
                _c01(rough - polish * 0.17),
                0.0,
                0.30 + polish * 0.12)

    if role == 'furniture_scorch':
        grit = _cell(u, v, 52, 52, 51)               # dry and granular; soot has no grain direction
        crust = _cell(u, v, 14, 14, 52)
        k = 0.80 + 0.55 * crust
        return (r * k + 0.012 * grit, g * k, b * k,
                0.58 + 0.34 * crust,
                _c01(rough + (grit - 0.5) * 0.07),
                0.0,
                grit * 0.62 + crust * 0.38)

    # furniture_signal_lens: optical and serviced, so it stays clean. Only a faint radial falloff so
    # the gel is not a flat disc. Emission is set on the BSDF and is deliberately untouched here.
    du, dv = u - 0.5, v - 0.5
    fall = _c01(1.0 - (du * du + dv * dv) * 1.35)
    return (r * (0.80 + 0.24 * fall), g * (0.80 + 0.24 * fall), b * (0.82 + 0.22 * fall),
            1.0, _c01(rough - fall * 0.06), 0.0, 0.5)


def _authored_image(name, buf, n, srgb):
    """Turn an authored pixel buffer into an image datablock the EXPORTER actually reads.

    THE BUG THIS EXISTS FOR (measured 2026-09-06, and it shipped silently). A datablock from
    `bpy.data.images.new()` has `source == 'GENERATED'`. Writing `pixels` and calling `pack()` looks
    correct and raises nothing, but a generated image is re-derived from its `generated_color` fill
    when it is encoded, so the authored buffer is dropped. Every texture in the first surfaced build
    exported as pure black - baseColor, ORM and normal, six roles, four assets - and the assets
    rendered as black silhouettes with only the emissive lens visible. The build log said nothing;
    it took reading channel means back out of the exported GLB to see it.

    `save()` writes the buffer correctly (verified against the PNG on disk: 0.9/0.5/0.2 came back
    as 230/128/51). What does NOT survive is the datablock: after a save the in-memory buffer of a
    generated image reads back as zeros in background Blender, and `reload()` does not repair it. So
    the authored buffer is written once, and the file is then LOADED as an ordinary FILE image. That
    datablock holds real decoded pixels, packs its exact bytes into the blend, and exports them.

    The scratch file is deleted immediately, so no image file is left in the tree and the GLB still
    carries every map inline.
    """
    scratch = bpy.data.images.new(f'{name}__scratch', width=n, height=n, alpha=False)
    # COLORSPACE FIRST. Assigning `colorspace_settings` re-derives the buffer of a generated image
    # from its `generated_color` fill, so setting it AFTER writing pixels silently discards every
    # authored texel — which is how the whole family exported as solid black 473-byte PNGs.
    scratch.colorspace_settings.name = 'sRGB' if srgb else 'Non-Color'
    scratch.pixels.foreach_set(buf)
    scratch.update()
    tmp = Path(tempfile.gettempdir()) / f'sf_lane_furniture_{name}.png'
    scratch.filepath_raw = str(tmp)
    scratch.file_format = 'PNG'
    scratch.save()
    bpy.data.images.remove(scratch)

    img = bpy.data.images.load(str(tmp))
    img.name = name
    img.colorspace_settings.name = 'sRGB' if srgb else 'Non-Color'
    img.file_format = 'PNG'
    img.pack()
    # Packed: the bytes now live in the blend, so the scratch file is not needed and no image file
    # is left in the tree.
    img.filepath_raw = ''
    try:
        tmp.unlink()
    except OSError:
        pass
    return img


def role_images(role):
    """Build (baseColor, ORM, normal) image datablocks for one role and pack them in memory.

    Keyed by name and reused, so a run that touches a role forty times still holds three images.
    `reset_scene()` clears datablocks between assets, so every asset re-authors identical buffers
    from the same integer hash - the family shares one surface vocabulary by construction.

    Returns `normal=None` for the lens, which has no meaningful surface relief to encode.
    """
    key = f'{role}_baseColor'
    if key in bpy.data.images:
        return (bpy.data.images[key], bpy.data.images[f'{role}_orm'],
                bpy.data.images.get(f'{role}_normal'))

    n = TEX_SIZE
    base_buf = [0.0] * (n * n * 4)
    orm_buf = [0.0] * (n * n * 4)
    height = [0.0] * (n * n)
    inv = 1.0 / n
    for y in range(n):
        for x in range(n):
            cr, cg, cb, ao, ro, me, h = _surface(role, (x + 0.5) * inv, (y + 0.5) * inv)
            i = (y * n + x) * 4
            base_buf[i] = _c01(cr)
            base_buf[i + 1] = _c01(cg)
            base_buf[i + 2] = _c01(cb)
            base_buf[i + 3] = 1.0
            # glTF packed material texture: R=occlusion, G=roughness, B=metallic.
            orm_buf[i] = _c01(ao)
            orm_buf[i + 1] = _c01(ro)
            orm_buf[i + 2] = _c01(me)
            orm_buf[i + 3] = 1.0
            height[y * n + x] = h

    images = {}
    for suffix, buf, srgb in (('baseColor', base_buf, True), ('orm', orm_buf, False)):
        # `pixels` is always linear scene-referred, so writing the authored linear values into an
        # sRGB-tagged image round-trips the colour exactly, and the data maps stay untransformed.
        images[suffix] = _authored_image(f'{role}_{suffix}', buf, n, srgb)

    if role == 'furniture_signal_lens':
        return images['baseColor'], images['orm'], None

    # Tangent-space normal derived from the authored height field by central difference on the
    # buffer itself, so the cost is one cheap pass rather than three evaluations per texel. Green is
    # UP, matching the OpenGL convention glTF expects, because +y here is +v in the same buffer.
    strength = 1.7
    nrm_buf = [0.0] * (n * n * 4)
    for y in range(n):
        yn, yp = ((y - 1) % n) * n, ((y + 1) % n) * n
        row = y * n
        for x in range(n):
            xn, xp = (x - 1) % n, (x + 1) % n
            dx = (height[row + xp] - height[row + xn]) * strength
            dy = (height[yp + x] - height[yn + x]) * strength
            inv_len = 1.0 / math.sqrt(dx * dx + dy * dy + 1.0)
            i = (row + x) * 4
            nrm_buf[i] = _c01(-dx * inv_len * 0.5 + 0.5)
            nrm_buf[i + 1] = _c01(-dy * inv_len * 0.5 + 0.5)
            nrm_buf[i + 2] = _c01(inv_len * 0.5 + 0.5)
            nrm_buf[i + 3] = 1.0
    nrm = _authored_image(f'{role}_normal', nrm_buf, n, False)
    return images['baseColor'], images['orm'], nrm


def _occlusion_group():
    """The node group the glTF exporter reads an `occlusionTexture` from, or None.

    The exporter recognises baseColor and the packed metallic/roughness pair from ordinary
    Principled links, but occlusion is only exported through a group named `glTF Material Output`
    with an `Occlusion` input. That group is built through a versioned interface API, so it is
    attempted rather than assumed: if it cannot be created, the R channel of the ORM image is still
    authored truthfully and simply is not bound to an exported occlusionTexture.
    """
    name = 'glTF Material Output'
    grp = bpy.data.node_groups.get(name)
    if grp is not None:
        return grp
    try:
        grp = bpy.data.node_groups.new(name, 'ShaderNodeTree')
        grp.interface.new_socket('Occlusion', in_out='INPUT', socket_type='NodeSocketFloat')
        grp.nodes.new('NodeGroupInput')
        return grp
    except Exception as exc:                     # pragma: no cover - version-dependent API
        log(f'occlusion export unavailable ({exc.__class__.__name__}); ORM red channel is '
            f'authored but will not be bound to an exported occlusionTexture')
        if grp is not None and grp.name in bpy.data.node_groups:
            bpy.data.node_groups.remove(grp)
        return None


def log(msg):
    print(f'[lane-furniture] {msg}', flush=True)


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def material(role):
    """One material datablock per role, image-backed.

    The scalar values stay set as the honest fallback for anything that loses a texture binding, and
    the maps are layered on top through the ordinary Principled sockets the glTF exporter reads:
    Base Color from an sRGB image, and Roughness/Metallic from the G/B channels of one Non-Color
    packed image, which is the pattern the exporter collapses into a single metallicRoughness
    texture. Nothing here is a metadata claim - the pixels exist and are packed into the blend.
    """
    if role in bpy.data.materials:
        return bpy.data.materials[role]
    r, g, b, rough, metal = ROLES[role]
    mat = bpy.data.materials.new(role)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (r, g, b, 1.0)
    bsdf.inputs['Roughness'].default_value = rough
    if 'Metallic' in bsdf.inputs:
        bsdf.inputs['Metallic'].default_value = metal
    if role == 'furniture_signal_lens' and 'Emission Color' in bsdf.inputs:
        bsdf.inputs['Emission Color'].default_value = (1.0, 0.70, 0.28, 1.0)
        bsdf.inputs['Emission Strength'].default_value = 3.2

    base_img, orm_img, nrm_img = role_images(role)

    tex_base = nt.nodes.new('ShaderNodeTexImage')
    tex_base.image = base_img
    tex_base.label = f'{role}_baseColor'
    tex_base.location = (-620, 240)
    nt.links.new(tex_base.outputs['Color'], bsdf.inputs['Base Color'])

    tex_orm = nt.nodes.new('ShaderNodeTexImage')
    tex_orm.image = orm_img
    tex_orm.label = f'{role}_orm'
    tex_orm.location = (-620, -40)
    split = nt.nodes.new('ShaderNodeSeparateColor')
    split.location = (-360, -40)
    nt.links.new(tex_orm.outputs['Color'], split.inputs['Color'])
    nt.links.new(split.outputs['Green'], bsdf.inputs['Roughness'])
    if 'Metallic' in bsdf.inputs:
        nt.links.new(split.outputs['Blue'], bsdf.inputs['Metallic'])

    grp = _occlusion_group()
    if grp is not None:
        node = nt.nodes.new('ShaderNodeGroup')
        node.node_tree = grp
        node.location = (-140, -300)
        if node.inputs:
            nt.links.new(split.outputs['Red'], node.inputs[0])

    if nrm_img is not None:
        tex_n = nt.nodes.new('ShaderNodeTexImage')
        tex_n.image = nrm_img
        tex_n.label = f'{role}_normal'
        tex_n.location = (-620, -330)
        nmap = nt.nodes.new('ShaderNodeNormalMap')
        nmap.location = (-360, -330)
        nt.links.new(tex_n.outputs['Color'], nmap.inputs['Color'])
        nt.links.new(nmap.outputs['Normal'], bsdf.inputs['Normal'])
    return mat


def put(obj, role, parent=None):
    obj.data.materials.clear()
    obj.data.materials.append(material(role))
    if parent is not None:
        obj.parent = parent
    bpy.context.view_layer.objects.active = obj
    faceted = any(tag in obj.name for tag in (
        '_plate', '_vane', '_pad', '_deck', '_token', '_boot', '_petal',
        '_plaque', '_chevron', '_streamer', '_grate', '_crumple',
    ))
    if faceted:
        bpy.ops.object.shade_flat()
    else:
        try:
            bpy.ops.object.shade_smooth_by_angle(angle=math.radians(28))
        except Exception:
            bpy.ops.object.shade_smooth()
    return obj


def cyl(name, radius, depth, loc, rot=(0, 0, 0), verts=16):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=depth,
                                        location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    return o


def box(name, size, loc, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    o.scale = Vector(size)
    bpy.ops.object.transform_apply(scale=True)
    edge_break(o, size)
    return o


def edge_break(obj, size):
    """Apply one small angle-limited bevel without rounding the silhouette."""
    w = min(EDGE_BREAK, min(abs(s) for s in size) * 0.25)
    if w < 1e-4:
        return obj
    bpy.context.view_layer.objects.active = obj
    mod = obj.modifiers.new('edge_break', 'BEVEL')
    mod.width = w
    mod.segments = 1
    mod.limit_method = 'ANGLE'
    mod.angle_limit = math.radians(30.0)
    mod.use_clamp_overlap = True
    bpy.ops.object.modifier_apply(modifier=mod.name)
    return obj


def cutter(name, size, loc, rot=(0, 0, 0)):
    """An un-broken cube used only as a boolean tool; edge_break would fight the solver."""
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    o.scale = Vector(size)
    bpy.ops.object.transform_apply(scale=True)
    return o


def cut(target, tool):
    """Subtract a damage cutter and remove the temporary tool."""
    bpy.context.view_layer.objects.active = target
    mod = target.modifiers.new('cut', 'BOOLEAN')
    mod.operation = 'DIFFERENCE'
    mod.object = tool
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.data.objects.remove(tool, do_unlink=True)
    return target


def beam(name, a, b, radius, verts=6):
    """A member that physically SPANS from a to b.

    Round 2 of the adversarial review named this as the defect running through the whole family:
    "parts float instead of connecting... replace with an endpoint-driven beam/curve helper so every
    segment physically meets the next". Hand-placed segments with hand-guessed rotations do not meet
    at their ends, and a chain whose links do not touch reads as debris rather than as a chain.

    Taking two endpoints makes the join structural instead of approximate: the caller names where a
    member starts and stops, and the geometry cannot disagree with that.
    """
    a = Vector(a)
    b = Vector(b)
    d = b - a
    ln = d.length
    if ln < 1e-6:
        ln = 1e-3
    o = cyl(name, radius, ln, tuple((a + b) * 0.5), verts=verts)
    o.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
    return o


def ribbon(name, a, b, width, thick, role, parent):
    """Flat heat-cloth / plate spanning two world points so a flag cannot float."""
    a = Vector(a)
    b = Vector(b)
    d = b - a
    ln = max(d.length, 1e-3)
    o = box(name, (ln, thick, width), tuple((a + b) * 0.5))
    o.rotation_euler = d.to_track_quat('X', 'Z').to_euler()
    put(o, role, parent)
    return o


def embed_root(prefix, r, parent, kind='rock', radius=0.55,
               host_radius=None, host_top=0.0, sill_to=None):
    """Build the furniture-to-host interface: rock bite, weld, or ballast frame."""
    if kind == 'rock' and host_radius is not None:
        # Scale the drive interface to the caller's short host so tabs overlap the flange.
        span = host_radius
        put(cyl(f'{prefix}_embed_plug', span * 0.62, 0.14, (0, 0, host_top * 0.5 - 0.04), verts=7),
            'furniture_bare_steel', parent)
        # Keep the weld collar on the asset so the root remains self-contained.
        put(cyl(f'{prefix}_weld_collar', span * 0.76, 0.05, (0, 0, host_top + 0.005), verts=12),
            'furniture_scorch', parent)
        for i, (ang, ln, tilt) in enumerate(((0.0, 0.34, 0.5), (1.5, 0.28, 0.42), (2.9, 0.36, 0.58),
                                             (4.4, 0.25, 0.38), (5.6, 0.31, 0.47))):
            # The scaled tab overlaps the flange and lifts only slightly from its rim.
            reach = min(ln, span * 0.9)
            t = put(box(f'{prefix}_bite_tab_{i}', (reach, 0.09, 0.05),
                        (math.cos(ang) * span * 0.72, math.sin(ang) * span * 0.72, host_top * 0.45)),
                    'furniture_bare_steel', parent)
            t.rotation_euler = (0, tilt * 0.35, ang)
        for i, (ang, sc) in enumerate(((0.7, 0.17), (2.4, 0.13), (5.1, 0.20))):
            s = min(sc, span * 0.42)
            put(box(f'{prefix}_rim_slag_{i}', (s, s * 0.8, s * 0.45),
                    (math.cos(ang) * span * 0.80, math.sin(ang) * span * 0.80,
                     host_top + s * 0.10)),
                'furniture_scorch', parent)
    elif kind == 'rock':
        # Driven: an irregular skirt of rock-biting tabs splayed around the shaft, plus displaced
        # spoil where the drive pushed material up.
        put(cyl(f'{prefix}_embed_plug', radius * 0.62, 0.20, (0, 0, -0.02), verts=7),
            'furniture_bare_steel', parent)
        for i, (ang, ln, tilt) in enumerate(((0.0, 0.34, 0.5), (1.5, 0.28, 0.42), (2.9, 0.36, 0.58),
                                             (4.4, 0.25, 0.38), (5.6, 0.31, 0.47))):
            t = put(box(f'{prefix}_bite_tab_{i}', (ln, 0.09, 0.05),
                        (math.cos(ang) * radius * 0.8, math.sin(ang) * radius * 0.8, 0.03)),
                    'furniture_bare_steel', parent)
            t.rotation_euler = (0, tilt, ang)
        for i, (ang, sc) in enumerate(((0.7, 0.17), (2.4, 0.13), (5.1, 0.20))):
            put(box(f'{prefix}_spoil_{i}', (sc, sc * 0.8, sc * 0.45),
                    (math.cos(ang) * radius * 1.05, math.sin(ang) * radius * 1.05, 0.04)),
                'furniture_scorch', parent)
    elif kind == 'weld':
        # Welded to a face in a hurry: an uneven fillet skirt, thicker on the side the welder
        # started, plus two tack plates that were never dressed back.
        for i in range(8):
            a = i * math.pi / 4
            h = 0.10 + (0.07 if i < 3 else 0.0)
            put(box(f'{prefix}_fillet_{i}', (0.20, 0.10, h),
                    (math.cos(a) * radius * 0.9, math.sin(a) * radius * 0.9, h * 0.5)),
                'furniture_scorch', parent)
        for i, a in enumerate((0.9, 3.8)):
            put(box(f'{prefix}_tack_plate_{i}', (0.30, 0.22, 0.03),
                    (math.cos(a) * radius * 1.15, math.sin(a) * radius * 1.15, 0.02)),
                'furniture_bare_steel', parent)
    else:  # 'ballast'
        # A ballast frame: four feet on a spread base, one shimmed because the seat was not level.
        seats = []
        for i in range(4):
            a = i * math.pi / 2 + 0.4
            fx, fy = math.cos(a) * radius * 1.25, math.sin(a) * radius * 1.25
            seats.append((fx, fy))
            put(box(f'{prefix}_foot_{i}', (0.30, 0.24, 0.09), (fx, fy, 0.045)),
                'furniture_structural_alloy', parent)
            beam(f'{prefix}_foot_brace_{i}', (fx * 0.35, fy * 0.35, 0.30), (fx, fy, 0.09), 0.035)
            put(bpy.context.active_object, 'furniture_structural_alloy', parent)
            if i == 2:
                put(box(f'{prefix}_shim', (0.24, 0.18, 0.035), (fx, fy, 0.105)),
                    'furniture_bare_steel', parent)
        if sill_to is not None:
            # Bridge raised bodies to the ballast feet with a seated structural sill.
            rad = 0.055
            z = sill_to - rad
            for i in range(4):
                a0, a1 = seats[i], seats[(i + 1) % 4]
                beam(f'{prefix}_sill_{i}', (a0[0], a0[1], z), (a1[0], a1[1], z), rad, verts=6)
                put(bpy.context.active_object, 'furniture_structural_alloy', parent)


def root_for(name):
    bpy.ops.object.empty_add(type='PLAIN_AXES', location=(0, 0, 0))
    r = bpy.context.active_object
    r.name = name
    return r


# ─────────────────────────────────────────────────────────────────────────────────────────────────
# 1. CLAIM MARK — "a 1.8 m hexagonal spike, 0.28 m across flats, 0.9 m radio tick capsule at the
#    tip, 0.6 m base flange with four rock bolts, two often missing or sheared. Antenna ring often
#    crushed flat on one side where a Pelican's scoop brushed it."
# ─────────────────────────────────────────────────────────────────────────────────────────────────
def build_claim_mark():
    r = root_for('place_claim_mark')
    # The lean is authored: "many lean 5-12 degrees after a beam kiss or a bad drive."
    lean = math.radians(8.0)
    put(cyl('claim_flange', 0.30, 0.06, (0, 0, 0.03), verts=12), 'furniture_structural_alloy', r)
    # The short flange uses a caller-sized drive interface.
    embed_root('claim', r, r, kind='rock', radius=0.34, host_radius=0.30, host_top=0.06)
    # Four bolt seats; TWO are modelled as empty torn holes rather than bolts. The absence is the
    # point — a full set of four reads as new, and almost none of these are new.
    for i, present in enumerate([True, False, True, False]):
        a = i * math.pi / 2
        p = (math.cos(a) * 0.22, math.sin(a) * 0.22, 0.075)
        if present:
            put(cyl(f'claim_bolt_{i}', 0.035, 0.05, p, verts=6), 'furniture_bare_steel', r)
        else:
            # Torn metal: a shallow raised lip where the bolt tore out, offset off-centre.
            put(cyl(f'claim_tear_{i}', 0.055, 0.014, (p[0] * 1.04, p[1] * 0.96, 0.068), verts=8),
                'furniture_scorch', r)
    shaft = put(cyl('claim_shaft', 0.14, 1.8, (0, 0, 0.96), verts=6), 'furniture_painted_shell', r)
    shaft.rotation_euler = (lean, 0, 0)
    tip = math.sin(lean) * 0.9
    cap = put(cyl('claim_tick_capsule', 0.175, 0.9, (0, -tip * 1.9, 2.24), verts=14),
              'furniture_structural_alloy', r)
    cap.rotation_euler = (lean, 0, 0)
    # Antenna ring, CRUSHED FLAT ON ONE SIDE. Modelled as a scaled torus, not a clean one.
    bpy.ops.mesh.primitive_torus_add(major_radius=0.30, minor_radius=0.022,
                                     location=(0, -tip * 2.4, 2.66), major_segments=18,
                                     minor_segments=6)
    ring = bpy.context.active_object
    ring.name = 'claim_antenna_ring_crushed'
    ring.scale = Vector((1.0, 0.52, 1.0))   # the crush
    bpy.ops.object.transform_apply(scale=True)
    put(ring, 'furniture_structural_alloy', r)
    # Claim plate on the LEE side, hung on two bolts, 0.4 x 0.25 m.
    put(box('claim_plate', (0.40, 0.03, 0.25), (0.19, 0.10, 1.35), rot=(0, 0, math.radians(-14))),
        'furniture_identity_plate', r)
    # Caged miner-amber gel lamp, mid-shaft. The cage is BARS, not a tube — review finding 6 called
    # the first pass's smooth cylinder out, and bars are what make a caged lamp read as caged.
    for i, (oy, oz) in enumerate(((0.055, 0), (-0.055, 0), (0, 0.055), (0, -0.055))):
        put(box(f'claim_cage_bar_{i}', (0.14, 0.014, 0.014), (-0.20, 0.02 + oy, 1.10 + oz)),
            'furniture_structural_alloy', r)
    put(cyl('claim_lamp_lens', 0.052, 0.05, (-0.24, 0.02, 1.10), rot=(0, math.pi / 2, 0), verts=8),
        'furniture_signal_lens', r)
    # Paint-marker nozzle at the capsule tip, CAPPED WITH SLAG after the first cut bloom.
    put(cyl('claim_paint_nozzle', 0.038, 0.12, (0, -tip * 2.9, 2.76), rot=(lean, 0, 0), verts=8),
        'furniture_structural_alloy', r)
    put(cyl('claim_nozzle_slag', 0.052, 0.05, (0, -tip * 3.1, 2.84), rot=(lean, 0, 0), verts=6),
        'furniture_scorch', r)
    # Spare gel puck, taped to the flange. Secondary mass off the vertical, which is what stops the
    # whole thing reading as a nail with a bead past ~150 units.
    put(cyl('claim_spare_puck', 0.040, 0.04, (0.26, -0.10, 0.09), rot=(math.pi / 2, 0, 0), verts=8),
        'furniture_signal_lens', r)
    put(box('claim_puck_tape', (0.11, 0.09, 0.01), (0.26, -0.10, 0.13)), 'furniture_painted_shell', r)
    # Streamer stays ON the crushed ring as a single short tab. A two-card hang
    # read as detached bricks in the still panel.
    put(box('claim_streamer_tab', (0.22, 0.012, 0.08), (0.22, -tip * 2.38, 2.62),
            rot=(0, math.radians(-18), 0)), 'furniture_painted_shell', r)
    # Scarred tether loop for suit handholds.
    bpy.ops.mesh.primitive_torus_add(major_radius=0.13, minor_radius=0.016,
                                     location=(0.13, -0.02, 0.62), rotation=(math.pi / 2, 0, 0),
                                     major_segments=12, minor_segments=5)
    put(bpy.context.active_object, 'furniture_bare_steel', r)
    bpy.context.active_object.name = 'claim_tether_loop'
    return r


# ─────────────────────────────────────────────────────────────────────────────────────────────────
# 2. LANE PIN — Concord corridor marker.
#
# REBUILT after adversarial review. The first attempt was a clean symmetric toothpick, justified as
# "the control that proves the others are damaged on purpose". The review rejected that: the
# fiction's own modeller block specifies damage on this class too — "9 m vertical spine... planted
# in a 1.2 m hexagonal base drum... at 4 m and 7.5 m: two vane fins... with a third vane that is
# often not a fin at all: a flat unpainted repair plate... upper vane twisted 30 degrees;
# speed-band middle lamp empty socket; annex plate half-sheared."
#
# Concord SERVICES its marks; it does not replace them. A serviced object is one that visibly has
# been repaired, which is a different and more interesting read than one that is factory-new.
# ─────────────────────────────────────────────────────────────────────────────────────────────────
def build_lane_pin():
    r = root_for('place_lane_pin')
    # Hexagonal ballast drum, 1.2 m across flats, 0.8 m deep.
    put(cyl('pin_ballast_drum', 0.60, 0.80, (0, 0, 0.40), verts=6), 'furniture_structural_alloy', r)
    # Ballasted, not driven: Concord marks a corridor, it does not stake a claim it has no title to.
    embed_root('pin', r, r, kind='ballast', radius=0.60)
    put(cyl('pin_mast', 0.11, 9.0, (0, 0, 4.80), verts=10), 'furniture_painted_shell', r)
    # Vanes at TWO stations, 4.0 m and 7.5 m. Each station has a collar so the fins grow
    # out of the mast instead of hovering as cardboard cards.
    for station, (z, twist) in enumerate(((4.0, 0.0), (7.5, math.radians(30)))):
        put(cyl(f'pin_vane_collar_{station}', 0.18, 0.16, (0, 0, z), verts=10),
            'furniture_structural_alloy', r)
        for i in range(3):
            a = i * (2 * math.pi / 3)
            is_repair = (i == 2)
            # Center sits on the collar so the inner edge overlaps the mast.
            v = box(f'pin_vane_{station}_{i}', (1.46, 0.08, 0.40),
                    (math.cos(a) * 0.72, math.sin(a) * 0.72, z), rot=(0, 0, a))
            put(v, 'furniture_bare_steel' if is_repair else 'furniture_structural_alloy', r)
            put(box(f'pin_vane_root_{station}_{i}', (0.20, 0.14, 0.22),
                    (math.cos(a) * 0.18, math.sin(a) * 0.18, z), rot=(0, 0, a)),
                'furniture_bare_steel' if is_repair else 'furniture_structural_alloy', r)
            # Do not post-rotate a vane around its own centre — that is what made
            # the upper fin read as a flying card. The repair plate already names the damage.
    # Pass-side chevron housing: tells you which side to go by, and it is one-sided by definition.
    put(box('pin_chevron_housing', (0.50, 0.15, 0.35), (0.42, 0, 5.60)), 'furniture_painted_shell', r)
    put(box('pin_chevron_lens', (0.34, 0.04, 0.22), (0.62, 0, 5.60)), 'furniture_signal_lens', r)
    # Speed band: three sockets stacked. The MIDDLE one is an empty hole, not a lamp.
    for i, z in enumerate((8.30, 8.56, 8.82)):
        if i == 1:
            put(cyl('pin_speed_socket_empty', 0.062, 0.10, (0, 0, z), verts=8), 'furniture_scorch', r)
        else:
            put(cyl(f'pin_speed_lamp_{i}', 0.070, 0.12, (0, 0, z), verts=10),
                'furniture_signal_lens', r)
    put(cyl('pin_cap', 0.15, 0.10, (0, 0, 9.05), verts=10), 'furniture_structural_alloy', r)
    # Ref 44-C annex plate on the drum, HALF-SHEARED — modelled as a short plate, not a full one.
    put(box('pin_annex_plate_sheared', (0.16, 0.03, 0.20), (0.30, 0.55, 0.52)),
        'furniture_identity_plate', r)
    return r


# ─────────────────────────────────────────────────────────────────────────────────────────────────
# 3. TALLY POST — Meridian weigh-point.
#
# REBUILT after adversarial review. The first attempt was a fly-through gantry; the fiction
# specifies a TOWER ON A DECK WITH A BOOM: "a 6 m tower on a 3 m square platform deck... primary
# vertical is a 1.1 m diameter hexagonal drum... a boom arm 3.2 m long with a mass-sensor yoke
# (two pads like blunt tongs)... yoke pad one side worn concave, the other replaced with a flat
# unpainted plate... boom droops 8 degrees... deck corner crumpled."
#
# That is a completely different silhouette, and it is a better one: a one-sided boom reads as a
# machine reaching for something, where a symmetric gate reads as architecture.
# ─────────────────────────────────────────────────────────────────────────────────────────────────
def build_tally_post():
    r = root_for('place_tally_post')
    # 3 m square deck, 0.25 m thick: an open perimeter frame carrying spaced grate bars.
    DECK_Z, DECK_D, HALF, RAIL = 0.28, 0.25, 1.50, 0.28
    IN = HALF - RAIL                                     # 1.22, inner face of the frame
    embed_root('tally', r, r, kind='ballast', radius=1.05,
               sill_to=DECK_Z - DECK_D * 0.5)            # the deck stands on the frame, visibly
    rails = []
    for name, size, loc in (
        ('tally_deck_rail_n', (HALF * 2, RAIL, DECK_D), (0, IN + RAIL * 0.5, DECK_Z)),
        ('tally_deck_rail_s', (HALF * 2, RAIL, DECK_D), (0, -(IN + RAIL * 0.5), DECK_Z)),
        ('tally_deck_rail_e', (RAIL, IN * 2 + RAIL, DECK_D), (IN + RAIL * 0.5, 0, DECK_Z)),
        ('tally_deck_rail_w', (RAIL, IN * 2 + RAIL, DECK_D), (-(IN + RAIL * 0.5), 0, DECK_Z)),
    ):
        rails.append((name, put(box(name, size, loc), 'furniture_structural_alloy', r)))
    # Full interior runs sit inside the deck depth and share its structural alloy.
    for i in range(8):
        put(box(f'tally_grate_{i}', (IN * 2 + RAIL * 0.5, 0.14, DECK_D - 0.05),
                (0, -1.05 + i * 0.30, DECK_Z)),
            'furniture_structural_alloy', r)
    # Cut the damaged corner from both rails and replace it as a buckled fold inside the footprint.
    for name, obj in rails:
        if name.endswith('_e') or name.endswith('_s'):
            cut(obj, cutter(f'{name}_corner_bite', (0.50, 0.50, DECK_D * 2.0),
                            (HALF - 0.08, -(HALF - 0.08), DECK_Z)))
    c = put(box('tally_deck_crumple', (0.58, 0.58, 0.17), (1.16, -1.16, DECK_Z)),
            'furniture_structural_alloy', r)
    c.rotation_euler = (math.radians(-9), math.radians(7), 0)
    # Hexagonal scale house, 1.1 m across, 4 m tall.
    put(cyl('tally_scale_house', 0.55, 4.0, (0, 0, 2.25), verts=6), 'furniture_painted_shell', r)
    # The boom: 3.2 m, one side only, drooping 8 degrees. This is the whole silhouette.
    droop = math.radians(-8.0)
    boom = put(box('tally_boom', (3.2, 0.18, 0.22), (1.72, 0, 3.50)), 'furniture_structural_alloy', r)
    # Yoke lives in BOOM local space so the droop cannot leave the pads behind.
    put(box('tally_yoke_hub', (0.28, 0.28, 0.20), (1.58, 0, 0)), 'furniture_structural_alloy', boom)
    put(box('tally_tong_a', (0.36, 0.08, 0.08), (1.72, 0.22, -0.02), rot=(0, 0, math.radians(28))),
        'furniture_structural_alloy', boom)
    put(box('tally_tong_b', (0.36, 0.08, 0.08), (1.72, -0.22, -0.02), rot=(0, 0, math.radians(-28))),
        'furniture_structural_alloy', boom)
    put(box('tally_yoke_pad_worn', (0.35, 0.25, 0.12), (1.88, 0.38, -0.04)),
        'furniture_painted_shell', boom)
    put(cyl('tally_yoke_wear_cup', 0.11, 0.06, (1.88, 0.38, 0.04), verts=10),
        'furniture_scorch', boom)
    put(box('tally_yoke_pad_replacement', (0.35, 0.25, 0.02), (1.88, -0.38, -0.04)),
        'furniture_bare_steel', boom)
    boom.rotation_euler = (0, droop, 0)
    # Thermal hood over the house crown, and the gold invoice pulse on the mast.
    put(cyl('tally_thermal_hood', 0.66, 0.18, (0, 0, 4.34), verts=6), 'furniture_structural_alloy', r)
    put(cyl('tally_mast', 0.07, 1.5, (0, 0, 5.10), verts=8), 'furniture_structural_alloy', r)
    put(cyl('tally_invoice_lamp', 0.12, 0.14, (0, 0, 5.92), verts=10), 'furniture_signal_lens', r)
    put(box('tally_ledger_plate', (0.46, 0.03, 0.30), (0, 0.58, 2.40)), 'furniture_identity_plate', r)
    # Tag chain hanging off the boom root — the soft, swinging thing every real gantry has.
    for i in range(3):
        put(cyl(f'tally_tag_link_{i}', 0.030, 0.16, (0.62, 0.0, 3.30 - i * 0.15),
                rot=(math.radians(90 if i % 2 else 0), 0, 0), verts=6), 'furniture_bare_steel', r)
    return r


# ─────────────────────────────────────────────────────────────────────────────────────────────────
# 4. WHISTLE — Free Frontier distress relay.
#
# REBUILT after adversarial review round 1, finding 4: the first pass was "a tank with sticks" and
# carried the WRONG DAMAGE IDENTITY — a tilted drum and three straight aerials, when the fiction
# specifies "a 2.2 m scavenged fuel drum (1 m diameter) clamped with cargo straps and three unequal
# chains... a 0.7 m jury mast of welded rebar and a lamp cluster in a shopping basket of wire...
# a wide-band antenna bent from a survey paddle... antenna S-curved... one chain replaced with
# polymer line; drum lid warped and held with a clamp."
#
# The distinction matters: asymmetry alone is noise. Asymmetry that names WHICH part failed and what
# it was replaced with is character, and it is what makes two Free Frontier relays differ.
# ─────────────────────────────────────────────────────────────────────────────────────────────────
def build_whistle():
    r = root_for('place_whistle')
    # Scavenged fuel drum, 1.0 m diameter x 2.2 m, upright. The drum is honest; everything on it
    # is not.
    put(cyl('whistle_drum', 0.50, 2.20, (0, 0, 1.20), verts=14), 'furniture_bare_steel', r)
    # Warped lid, held down with a clamp because it no longer seats.
    lid = put(cyl('whistle_lid_warped', 0.52, 0.06, (0, 0, 2.33), verts=14),
              'furniture_structural_alloy', r)
    lid.rotation_euler = (math.radians(7), math.radians(-4), 0)
    put(box('whistle_lid_clamp', (0.16, 0.44, 0.05), (0.28, 0, 2.38)), 'furniture_bare_steel', r)
    # Two cargo straps.
    for i, z in enumerate((0.72, 1.66)):
        put(cyl(f'whistle_strap_{i}', 0.53, 0.07, (0, 0, z), verts=14), 'furniture_painted_shell', r)
    # THREE UNEQUAL CHAINS — 0.9 / 1.3 / 1.1 m. The third is polymer line: thinner, and a different
    # material, because somebody ran out of chain. Built endpoint-to-endpoint so each link actually
    # MEETS the next and the run terminates on the drum — review round 2 called the previous
    # hand-placed version "loose hairs", and it was right: a chain whose links do not touch is debris.
    for i, (yaw, ln, rad, role, sag) in enumerate((
        (0.5, 0.90, 0.030, 'furniture_bare_steel', 0.16),
        (2.6, 1.30, 0.030, 'furniture_bare_steel', 0.30),
        (4.6, 1.10, 0.018, 'furniture_painted_shell', 0.42),   # the polymer swap sags most
    )):
        ax, ay = math.cos(yaw) * 0.50, math.sin(yaw) * 0.50
        bx_, by_ = math.cos(yaw) * (0.50 + 0.30), math.sin(yaw) * (0.50 + 0.30)
        links = 4
        prev = (ax, ay, 1.42)
        for k in range(1, links + 1):
            t = k / links
            # A catenary, not a straight line: the sag is what says the member is slack.
            pt = (ax + (bx_ - ax) * t, ay + (by_ - ay) * t,
                  1.42 - ln * t - sag * math.sin(math.pi * t) * 0.6)
            beam(f'whistle_chain_{i}_{k}', prev, pt, rad, verts=4)
            put(bpy.context.active_object, role, r)
            prev = pt
        if i == 1:
            boot_anchor = prev

    # The shaft overlaps the last link; derive both z seats from the endpoint so the load path
    # survives future chain-length changes.
    bx, by, boot_z = boot_anchor
    put(box('whistle_boot', (0.20, 0.12, 0.13), (bx, by, boot_z - 0.045)),
        'furniture_painted_shell', r)
    put(box('whistle_boot_sole', (0.30, 0.13, 0.036), (bx + 0.05, by - 0.02, boot_z - 0.097)),
        'furniture_bare_steel', r)
    # Jury mast: 0.7 m of welded rebar, three rods that do not agree with each other.
    for i, (dx_, dy_, tilt) in enumerate(((0.0, 0.0, 0.0), (0.06, 0.03, 0.16), (-0.05, 0.05, -0.11))):
        rod = put(cyl(f'whistle_rebar_{i}', 0.018, 0.70, (dx_, dy_, 2.72), verts=4),
                  'furniture_bare_steel', r)
        rod.rotation_euler = (tilt, tilt * 0.6, 0)
    # Lamp cluster in an open wire basket: hollow rim, round bars, and gather struts root it to the
    # rebar mast while leaving the three lenses visible.
    BR = 0.17
    for name, z in (('whistle_basket_ring_lo', 3.048), ('whistle_basket_ring', 3.318)):
        bpy.ops.mesh.primitive_torus_add(major_radius=BR, minor_radius=0.014, location=(0, 0, z),
                                         major_segments=12, minor_segments=4)
        ring = bpy.context.active_object
        ring.name = name
        put(ring, 'furniture_bare_steel', r)
    for i, (ox, oy) in enumerate(((BR, 0), (-BR, 0), (0, BR), (0, -BR))):
        # Round section: this is wire, and square-section wire was part of the toy read.
        put(cyl(f'whistle_basket_bar_{i}', 0.015, 0.30, (ox, oy, 3.18), verts=6),
            'furniture_bare_steel', r)
    for i in range(3):
        a = i * (2 * math.pi / 3)
        beam(f'whistle_basket_gather_{i}', (0.0, 0.0, 3.00),
             (math.cos(a) * BR, math.sin(a) * BR, 3.048), 0.013, verts=4)
        put(bpy.context.active_object, 'furniture_bare_steel', r)
    for i, (ox, oy, oz) in enumerate(((0.05, 0.03, 3.14), (-0.06, -0.02, 3.20), (0.01, -0.06, 3.10))):
        put(cyl(f'whistle_lamp_{i}', 0.062, 0.09, (ox, oy, oz), verts=8), 'furniture_signal_lens', r)
    # Wide-band antenna bent from a survey paddle; the stanchion gives the paddle a real lid root.
    put(box('whistle_paddle_root', (0.45, 0.08, 0.02), (0.30, 0.10, 2.50),
            rot=(0, math.radians(18), math.radians(22))), 'furniture_structural_alloy', r)
    put(box('whistle_paddle_stanchion', (0.12, 0.10, 0.18), (0.30, 0.10, 2.42)),
        'furniture_structural_alloy', r)
    # S-curve antenna members share endpoints and start at the paddle clamp.
    put(box('whistle_antenna_clamp', (0.10, 0.10, 0.08), (0.42, 0.13, 2.56)), 'furniture_bare_steel', r)
    pts = [(0.42, 0.13, 2.56), (0.66, 0.24, 2.84), (0.58, 0.10, 3.12), (0.80, 0.20, 3.40)]
    for i in range(len(pts) - 1):
        beam(f'whistle_antenna_s_{i}', pts[i], pts[i + 1], 0.016, verts=4)
        put(bpy.context.active_object, 'furniture_structural_alloy', r)

    # Hand crank on the drum flank — the thing a survivor actually turns.
    put(cyl('whistle_crank_hub', 0.07, 0.10, (-0.52, 0, 1.20), rot=(0, math.pi / 2, 0), verts=8),
        'furniture_structural_alloy', r)
    put(box('whistle_crank_arm', (0.05, 0.26, 0.04), (-0.60, 0.12, 1.20)), 'furniture_bare_steel', r)
    put(box('whistle_plaque_standoff', (0.18, 0.08, 0.06), (0, -0.47, 1.60)),
        'furniture_structural_alloy', r)
    put(box('whistle_plaque', (0.30, 0.02, 0.16), (0, -0.51, 1.60)), 'furniture_identity_plate', r)
    for i, x in enumerate((-0.10, 0.10)):
        put(cyl(f'whistle_plaque_bolt_{i}', 0.014, 0.025, (x, -0.525, 1.60),
                rot=(math.pi / 2, 0, 0), verts=6), 'furniture_bare_steel', r)
    # Scorch collar where it was welded to a rock in a hurry.
    # Welded to a rock in a hurry and never dressed back — the fiction's own account of it.
    embed_root('whistle', r, r, kind='weld', radius=0.52)
    return r


# ─────────────────────────────────────────────────────────────────────────────────────────────────
# 5. COLD LOCKER — unmanned bonded cache.
#
# REBUILT after adversarial review. The first attempt was a box fridge; the fiction specifies a
# "4 m hexagonal drum (face-to-face 1.8 m) mounted on a 9 m spine of lattice truss... drum at
# mid-spine so the mass hangs like a tick on a wire... one lattice bay crushed inward... outrigger
# leg sheared and cabled... one petal bent."
#
# The long lattice spine with an off-centre mass is a far stronger distance read than a cube: it is
# mostly negative space, and negative space is a silhouette channel a box simply does not have.
# ─────────────────────────────────────────────────────────────────────────────────────────────────
def build_cold_locker():
    r = root_for('place_cold_locker')
    SPINE = 9.0
    BAY = 0.5
    bays = int(SPINE / BAY)
    put(cyl('locker_root_clamp', 0.34, 0.42, (0, 0, 0.21), verts=8), 'furniture_bare_steel', r)
    embed_root('locker', r, r, kind='rock', radius=0.40)  # clipped to a rock, per the fiction
    # Four-longeron lattice, not a flat ladder. ONE mid bay is crushed inward.
    crushed = bays // 2 + 1
    longerons = ((-1, -1), (-1, 1), (1, -1), (1, 1))
    for sx, sy in longerons:
        put(cyl(f'locker_rail_{sx}_{sy}', 0.040, SPINE,
                (sx * 0.20, sy * 0.20, SPINE * 0.5 + 0.4), verts=6),
            'furniture_structural_alloy', r)
    for i in range(bays):
        z = 0.55 + i * BAY
        span = 0.26 if i == crushed else 0.40
        role = 'furniture_bare_steel' if i == crushed else 'furniture_structural_alloy'
        put(box(f'locker_rung_x_{i}', (span, 0.040, 0.040), (0, 0.20 if i != crushed else 0.10, z)),
            role, r)
        put(box(f'locker_rung_y_{i}', (0.040, span, 0.040), (0.20 if i != crushed else 0.10, 0, z)),
            role, r)
        if i == crushed:
            continue
        a0 = ((-0.20, -0.20, z), (0.20, 0.20, z + BAY))
        a1 = ((0.20, -0.20, z), (-0.20, 0.20, z + BAY))
        if i % 2:
            a0, a1 = a1, a0
        beam(f'locker_diag_a_{i}', a0[0], a0[1], 0.022)
        put(bpy.context.active_object, 'furniture_structural_alloy', r)
        beam(f'locker_diag_b_{i}', a1[0], a1[1], 0.022)
        put(bpy.context.active_object, 'furniture_structural_alloy', r)
    # The drum: hexagonal, 1.8 m across flats, hung at MID-spine so the mass is off-centre.
    mid = SPINE * 0.5 + 0.4
    drum = put(cyl('locker_drum', 0.90, 2.05, (0, 0, mid), verts=6),
               'furniture_painted_shell', r)
    put(cyl('locker_hoop_lo', 0.93, 0.08, (0, 0, -0.72), verts=6),
        'furniture_structural_alloy', drum)
    put(cyl('locker_hoop_hi', 0.93, 0.08, (0, 0, 0.72), verts=6),
        'furniture_structural_alloy', drum)
    # Hatch face with THREE dogs — one of them a welded scrap bar rather than a proper lever.
    put(cyl('locker_hatch', 0.62, 0.10, (0, -0.78, SPINE * 0.5 + 0.4), rot=(math.pi / 2, 0, 0),
            verts=10), 'furniture_structural_alloy', r)
    for i, a in enumerate((0.6, 2.7, 4.7)):
        role = 'furniture_bare_steel' if i == 2 else 'furniture_structural_alloy'
        size = (0.36, 0.06, 0.06) if i == 2 else (0.26, 0.05, 0.05)
        dg = put(box(f'locker_dog_{i}', size,
                     (math.cos(a) * 0.42, -0.86, SPINE * 0.5 + 0.4 + math.sin(a) * 0.42)),
                 role, r)
        dg.rotation_euler = (0, 0, a if i != 2 else a + 0.5)
    # Bond lamp ring around the hatch — the bit a pilot actually reads.
    bpy.ops.mesh.primitive_torus_add(major_radius=0.72, minor_radius=0.035,
                                     location=(0, -0.84, SPINE * 0.5 + 0.4),
                                     rotation=(math.pi / 2, 0, 0),
                                     major_segments=14, minor_segments=5)
    ring = bpy.context.active_object
    ring.name = 'locker_bond_ring'
    put(ring, 'furniture_signal_lens', r)
    put(box('locker_manifest_plate', (0.42, 0.03, 0.26), (0.55, -0.95, SPINE * 0.5 - 0.35)),
        'furniture_identity_plate', r)
    # Two outriggers off the root — leg B is SHORTER and its tip is cabled back.
    #
    # Placed by explicit endpoint rather than by stacking Euler rotations. The first attempt
    # composed an X-tilt with a Z-yaw and the legs swung out to an 11.2 m envelope on a body whose
    # spine is 9 m — which then drove the review camera's framing radius and made the whole asset
    # render as a speck. Compute where the strut should END and aim it there.
    for i, (yaw, ln, out, up) in enumerate(((0.8, 1.55, 1.05, 0.62), (3.6, 1.05, 0.72, 0.44))):
        ex = math.cos(yaw) * out
        ey = math.sin(yaw) * out
        leg = put(cyl(f'locker_outrigger_{i}', 0.055, ln, (ex * 0.5, ey * 0.5, 0.20 + up * 0.5),
                      verts=6), 'furniture_structural_alloy', r)
        leg.rotation_euler = Vector((ex, ey, up)).to_track_quat('Z', 'Y').to_euler()
    # Leg B's tip is cabled back to the spine — the shear was never properly repaired. One member,
    # spanning two real points, rather than three floating fragments.
    bx, by = math.cos(3.6) * 0.72, math.sin(3.6) * 0.72
    beam('locker_shear_cable', (bx, by, 0.30), (0, 0, 1.85), 0.016, verts=4)
    put(bpy.context.active_object, 'furniture_bare_steel', r)

    # Solar / trickle petals sit on the drum crown in drum-local space. ONE is bent.
    for i, a in enumerate((0.0, 2.09, 4.19)):
        pet = put(box(f'locker_petal_{i}', (0.40, 0.15, 0.02),
                      (math.cos(a) * 0.70, math.sin(a) * 0.70, 1.08)),
                  'furniture_structural_alloy', drum)
        pet.rotation_euler = (math.radians(25) if i == 1 else 0, 0, a)
    return r


# ─────────────────────────────────────────────────────────────────────────────────────────────────
# 6. ASH PIN — a memorial where a hull died.
#
# REBUILT after adversarial review round 1, finding 5: the first pass was a tidy plaque-on-slab and
# the review named it "wrong damage language". The fiction says "a 3.5 m slender pin — often a cut
# spar... spar leaned by the explosion... plate half-melted on one corner; lamp cage empty more
# often than not; ballast chain one link wrong alloy."
#
# The lean is the whole read. A memorial that stands straight has been maintained, and the entry's
# closing line is that nobody maintains these.
# ─────────────────────────────────────────────────────────────────────────────────────────────────
def build_ash_pin():
    r = root_for('place_ash_pin')
    LEAN = math.radians(13.0)          # "leaned by the explosion", never straightened
    # Poured base, 1 m across.
    put(cyl('ash_base', 0.50, 0.26, (0, 0, 0.13), verts=10), 'furniture_structural_alloy', r)
    # Poured and ballasted. Nobody drills a memorial into somebody else's claim.
    embed_root('ash', r, r, kind='ballast', radius=0.50)
    # A cut spar, 3.5 m, slender. It is a piece of the dead hull, not a monument someone ordered.
    spar = put(cyl('ash_spar', 0.07, 3.50, (0, 0, 1.95), verts=8), 'furniture_bare_steel', r)
    spar.rotation_euler = (LEAN, 0, 0)
    # Plate, melt, and empty cage stay in spar-local space. The plate has a bolted bracket and the
    # melted corner is a subtraction, so damage reads as loss rather than an added block.
    plate = box('ash_name_plate', (0.50, 0.03, 0.30), (0.0, -0.112, -0.23))
    cut(plate, cutter('ash_plate_melt_bite', (0.20, 0.14, 0.20), (0.28, -0.112, -0.055),
                      rot=(0, 0, math.radians(38))))
    put(plate, 'furniture_identity_plate', spar)
    for i, ex in enumerate((0.17, -0.17)):
        # Two ears span spar face to plate back; the crossbar below carries them into the spar.
        put(box(f'ash_plate_ear_{i}', (0.07, 0.055, 0.12), (ex, -0.0965, -0.23)),
            'furniture_structural_alloy', spar)
        put(cyl(f'ash_plate_bolt_{i}', 0.018, 0.02, (ex, -0.132, -0.23),
                rot=(math.pi / 2, 0, 0), verts=6), 'furniture_bare_steel', spar)
    put(box('ash_plate_backing_bar', (0.42, 0.04, 0.06), (0, -0.078, -0.23)),
        'furniture_structural_alloy', spar)
    # Empty lamp cage with an arm into the spar and hollow upper/lower rings.
    put(box('ash_cage_arm', (0.05, 0.10, 0.05), (0, -0.055, 0.68)),
        'furniture_structural_alloy', spar)
    for i, (ox, oy) in enumerate(((0.052, 0), (-0.052, 0), (0, 0.052), (0, -0.052))):
        put(box(f'ash_cage_bar_{i}', (0.016, 0.016, 0.20), (ox, -0.11 + oy, 0.68)),
            'furniture_structural_alloy', spar)
    for name, z in (('ash_cage_ring_lo', 0.585), ('ash_cage_ring', 0.775)):
        bpy.ops.mesh.primitive_torus_add(major_radius=0.052, minor_radius=0.018,
                                         location=(0, -0.11, z), major_segments=8, minor_segments=4)
        ring = bpy.context.active_object
        ring.name = name
        put(ring, 'furniture_structural_alloy', spar)
    # Ballast chain runs between two eyes on the base; one thicker link marks the alloy change.
    CHAIN_A, CHAIN_B = (0.28, 0.20), (0.46, -0.14)
    for name, (ex, ey) in (('ash_chain_eye_a', CHAIN_A), ('ash_chain_eye_b', CHAIN_B)):
        put(cyl(name, 0.034, 0.07, (ex, ey, 0.285), rot=(math.pi / 2, 0, 0), verts=6),
            'furniture_bare_steel', r)
    for k in range(5):
        wrong = (k == 2)
        t = 0.1 + k * 0.2
        put(cyl(f'ash_ballast_link_{k}', 0.030 if wrong else 0.022, 0.10,
                (CHAIN_A[0] + (CHAIN_B[0] - CHAIN_A[0]) * t,
                 CHAIN_A[1] + (CHAIN_B[1] - CHAIN_A[1]) * t, 0.29),
                rot=(math.radians(90 if k % 2 else 0), 0, math.radians(-62)), verts=5),
            'furniture_bare_steel' if wrong else 'furniture_structural_alloy', r)
    # Passing-crew tokens are threaded on an offering wire between two anchored eyes.
    wire = [(-0.10, 0.36, 0.30), (-0.20, 0.20, 0.272), (-0.28, 0.02, 0.272), (-0.36, -0.14, 0.30)]
    for name, (ex, ey) in (('ash_offering_eye_a', wire[0][:2]), ('ash_offering_eye_b', wire[-1][:2])):
        put(cyl(name, 0.030, 0.05, (ex, ey, 0.285), verts=6), 'furniture_bare_steel', r)
    for i in range(len(wire) - 1):
        beam(f'ash_offering_wire_{i}', wire[i], wire[i + 1], 0.010, verts=4)
        put(bpy.context.active_object, 'furniture_bare_steel', r)
    for i, (sz, a, drop) in enumerate(((0.11, 0.4, 0.008), (0.08, 1.9, 0.006), (0.09, 3.1, 0.012))):
        a0, a1 = wire[i], wire[i + 1]
        t = put(box(f'ash_token_{i}', (sz, sz, sz * 0.35),
                    ((a0[0] + a1[0]) * 0.5, (a0[1] + a1[1]) * 0.5,
                     (a0[2] + a1[2]) * 0.5 - drop)),
                'furniture_painted_shell', r)
        t.rotation_euler = (0, 0, a)
    return r


BUILDERS = {
    'place_claim_mark': build_claim_mark,
    'place_lane_pin': build_lane_pin,
    'place_tally_post': build_tally_post,
    'place_whistle': build_whistle,
    'place_cold_locker': build_cold_locker,
    'place_ash_pin': build_ash_pin,
}


def project_uvs(obj):
    """World-space box projection at a fixed texel density.

    Deliberately not `smart_project`: an per-object atlas gives every part its own arbitrary scale,
    so a 3 m deck and a 20 mm bolt end up with wildly different texel densities and the family stops
    looking like one shop's stock. Projecting from world position at a constant tiles-per-metre
    means grain size is a property of the MATERIAL rather than of the part it landed on, and two
    parts that abut share a continuous surface across the join.

    Runs before the family scale is applied, so the density is in authored metres, and after every
    bevel and boolean, so cut faces are covered.
    """
    me = obj.data
    if not me.polygons:
        return
    uvl = me.uv_layers[0] if me.uv_layers else me.uv_layers.new(name='UVMap')
    mw = obj.matrix_world
    rot = mw.to_3x3()
    co = [mw @ v.co for v in me.vertices]
    for poly in me.polygons:
        n = rot @ poly.normal
        ax, ay, az = abs(n.x), abs(n.y), abs(n.z)
        for li in poly.loop_indices:
            p = co[me.loops[li].vertex_index]
            if az >= ax and az >= ay:
                u, v = p.x, p.y
            elif ax >= ay:
                u, v = p.y, p.z
            else:
                u, v = p.x, p.z
            uvl.data[li].uv = (u * UV_PER_M, v * UV_PER_M)


def export_glb(root, path, parts_out=PARTS_OUT):
    # UVs first, in authored metres and on the final mesh.
    for child in root.children_recursive:
        if child.type == 'MESH':
            project_uvs(child)
    # Scale the whole assembly on the root, so every authored dimension keeps its ratio and the
    # multiplier stays a single reviewable number rather than being baked into 200 literals.
    root.scale = Vector((FAMILY_SCALE, FAMILY_SCALE, FAMILY_SCALE))
    bpy.context.view_layer.update()
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action='DESELECT')
    root.select_set(True)
    for child in root.children_recursive:
        child.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(
        filepath=str(path), export_format='GLB', use_selection=True,
        export_apply=True, export_yup=True,
        export_texcoords=True,
    )
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if parts_out is not None:
        parts_out.mkdir(parents=True, exist_ok=True)
        parts_path = parts_out / path.name
        if parts_path.resolve() != path.resolve():
            parts_path.write_bytes(path.read_bytes())
    return digest


def tri_count(root):
    total = 0
    for o in [root] + list(root.children_recursive):
        if o.type != 'MESH':
            continue
        total += sum(max(0, len(p.vertices) - 2) for p in o.data.polygons)
    return total


def reset_render_cameras():
    """Drop cameras and lights between passes so a distance view cannot inherit the last framing."""
    for o in [o for o in bpy.data.objects if o.type in {'CAMERA', 'LIGHT'}]:
        bpy.data.objects.remove(o, do_unlink=True)


def setup_render(target, radius, distance=None):
    """Frame the asset.

    `distance` in WORLD UNITS puts the camera at a real gameplay range, and that parameter exists
    because adversarial review round 2 caught the evidence lying. The original version scaled camera
    distance from each asset's own maximum dimension, so every prop filled the frame and every
    render looked like a turntable. Small features - 16 mm cables, 14 mm cage bars, 30 mm chain
    links - were never shown to survive projection at the range a player actually sees them, which
    is the only question that matters.

    Same class of error as trusting a `drawn` counter instead of looking at pixels: the measurement
    was real, it just was not measuring the thing being claimed.
    """
    d = distance if distance is not None else radius * 2.6
    bpy.ops.object.camera_add(location=(d * 0.62, -d * 0.72, d * 0.44))
    cam = bpy.context.active_object
    cam.data.lens = 50   # matches the game camera's 50-degree FOV class
    direction = Vector(target) - cam.location
    cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.camera = cam
    # Warm key / cool fill, matching the game's authored lighting doctrine so a review judges the
    # geometry rather than a lighting mismatch.
    lamp_scale = max(1.0, d)
    bpy.ops.object.light_add(type='AREA', location=(d * 1.1, -d * 0.7, d * 1.2))
    key = bpy.context.active_object
    key.data.energy = 900 * lamp_scale
    key.data.size = max(2.0, radius * 2.5)
    key.data.color = (1.0, 0.86, 0.68)
    bpy.ops.object.light_add(type='AREA', location=(-d * 1.0, d * 0.8, d * 0.45))
    fill = bpy.context.active_object
    fill.data.energy = 260 * lamp_scale
    fill.data.size = max(2.0, radius * 3.0)
    fill.data.color = (0.55, 0.68, 1.0)
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x = 900
    scene.render.resolution_y = 900
    scene.render.film_transparent = False
    scene.world = bpy.data.worlds.new('w')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value = (0.02, 0.022, 0.03, 1)


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument('--render', action='store_true')
    ap.add_argument('--distances', action='store_true',
                    help='also render at 20/60/140 world units - the real gameplay band')
    ap.add_argument('--only', metavar='ID,...',
                    help='build a comma-separated subset of known asset IDs')
    ap.add_argument('--out-root', type=Path, metavar='PATH',
                    help='write source, parts and evidence below an isolated candidate root')
    args = ap.parse_args(argv)

    known = set(BUILDERS)
    if args.only is None:
        selected_names = list(BUILDERS)
    else:
        requested = [value.strip() for value in args.only.split(',') if value.strip()]
        unknown = sorted(set(requested) - known)
        if unknown:
            ap.error(f"unknown asset ID(s): {', '.join(unknown)}; choose from {', '.join(BUILDERS)}")
        if not requested:
            ap.error('--only requires at least one asset ID')
        selected_names = list(dict.fromkeys(requested))

    out_root = args.out_root.resolve() if args.out_root else None
    out_source = out_root / 'source' if out_root else OUT_SOURCE
    out_evidence = out_root / 'evidence' if out_root else OUT_EVIDENCE
    out_parts = out_root / 'parts' if out_root else PARTS_OUT

    def report_path(path):
        try:
            return str(path.relative_to(ROOT)).replace(chr(92), '/')
        except ValueError:
            return str(path)

    report = {'schema': 'spaceface.laneFurniture.v1', 'assets': []}
    for name in selected_names:
        builder = BUILDERS[name]
        reset_scene()
        root = builder()
        bpy.context.view_layer.update()
        # Envelope from the actual built geometry, not from the authored intent — if a dimension
        # drifts from the fiction, the number here is what says so.
        pts = []
        for o in root.children_recursive:
            if o.type != 'MESH':
                continue
            for c in o.bound_box:
                pts.append(o.matrix_world @ Vector(c))
        if pts:
            lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
            hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
            size = hi - lo
        else:
            lo = hi = size = Vector((0, 0, 0))
        tris = tri_count(root)
        glb = out_source / f'{name}.glb'
        digest = export_glb(root, glb, parts_out=out_parts)
        # Re-measure after the family scale so the report describes the PLACED object.
        size = size * FAMILY_SCALE
        entry = {
            'id': name,
            'triangles': tris,
            'sizeM': [round(size.x, 3), round(size.y, 3), round(size.z, 3)],
            'parts': len([o for o in root.children_recursive if o.type == 'MESH']),
            'bytes': glb.stat().st_size,
            'sha256': digest,
        }
        if args.render:
            out_evidence.mkdir(parents=True, exist_ok=True)
            radius = max(1.2, max(size.x, size.y, size.z))
            target = (0, 0, size.z * 0.45)
            # Turntable view, for judging construction.
            setup_render(target, radius)
            shot = out_evidence / f'{name}.png'
            bpy.context.scene.render.filepath = str(shot)
            bpy.ops.render.render(write_still=True)
            entry['render'] = report_path(shot)
            # Matched-distance views at the ranges these are actually seen from in play. The camera
            # bubble is ~45-50 units deep, so 20 and 60 bracket the readable band and 140 is the
            # point past which a prop is radar content.
            if args.distances:
                for dist in (20, 60, 140):
                    reset_render_cameras()
                    setup_render(target, radius, distance=float(dist))
                    dshot = out_evidence / f'{name}@{dist}u.png'
                    bpy.context.scene.render.filepath = str(dshot)
                    bpy.ops.render.render(write_still=True)
                entry['distanceViews'] = [20, 60, 140]
        report['assets'].append(entry)
        log(f"{name}: {tris} tris, {entry['parts']} parts, "
            f"{entry['sizeM'][0]}x{entry['sizeM'][1]}x{entry['sizeM'][2]} m")

    out_evidence.mkdir(parents=True, exist_ok=True)
    (out_evidence / 'build-report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    log(f"wrote {len(report['assets'])} source GLBs to {report_path(out_source)}")


if __name__ == '__main__':
    main()
