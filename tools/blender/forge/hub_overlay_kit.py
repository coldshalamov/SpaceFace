"""Shared frame + helpers for the three Helios trade-hub faction overlays.

The overlays hang on the Forge trade hub's own coordinate frame (same origin, same axes, same
metres): hub centre at CX, the market ring's outer wall at r ~54 (fender ribs proud to ~55.5),
hall roofs at ROOF_Z1 ~28.2, the harbour mouth at +X +-15 deg, the freight terminal box at -X.
Overlay parts must sit on or connect to that body — nothing floats, the mouth rim stays clear
except where a faction deliberately spans it (the MTS mouth crown lands on the breakwater heads).
"""
import math

import bmesh

import forge as F

CX = 3.0
RING_R0, RING_R1 = 37.0, 54.0
RING_Z0, RING_Z1 = 19.0, 27.0
ROOF_Z1 = 28.2                       # upper deck plane: overlay feet sit here
MOUTH = 15.0                         # half-angle of the harbour mouth at +X (deg)
TERM_X0, TERM_X1 = -57.0, -40.0      # freight terminal box at -X
TERM_HY, TERM_Z1 = 30.0, 26.5        # terminal half-width / roof height


def polar(r, a_deg, z=0.0):
    a = math.radians(a_deg)
    return (CX + r * math.cos(a), r * math.sin(a), z)


def in_mouth(a_deg, pad=0.0):
    return abs(((a_deg + 180.0) % 360.0) - 180.0) < MOUTH + pad


def near(a_deg, ref, tol):
    return abs(((a_deg - ref + 180.0) % 360.0) - 180.0) < tol


def ring_wall(ship, name, r_out, z0, z1, depth, material, segs=56, skip=None, bevel=0.04):
    """Vertical annular cladding band hugging the ring's outer wall: a segmented shell with its
    outer face at r_out, radial thickness `depth`, vertical span z0..z1. `skip(a_deg)` culls
    facets (the harbour mouth stays open). One mesh, one draw."""
    bm = bmesh.new()
    rin = r_out - depth
    for i in range(segs):
        a0 = 360.0 * i / segs
        a1 = 360.0 * (i + 1.0) / segs
        if skip and skip(0.5 * (a0 + a1)):
            continue
        # A..D outer quad (a0,a1 x z0,z1), E..H inner
        va = bm.verts.new(polar(r_out, a0, z0))
        vb = bm.verts.new(polar(r_out, a1, z0))
        vc = bm.verts.new(polar(r_out, a1, z1))
        vd = bm.verts.new(polar(r_out, a0, z1))
        ve = bm.verts.new(polar(rin, a0, z0))
        vf = bm.verts.new(polar(rin, a1, z0))
        vg = bm.verts.new(polar(rin, a1, z1))
        vh = bm.verts.new(polar(rin, a0, z1))
        bm.faces.new((va, vb, vc, vd))       # outer face, +radial
        bm.faces.new((vf, ve, vh, vg))       # inner face, -radial
        bm.faces.new((vd, vc, vg, vh))       # top
        bm.faces.new((ve, vf, vb, va))       # bottom
        bm.faces.new((va, vd, vh, ve))       # cap at a0
        bm.faces.new((vb, vf, vg, vc))       # cap at a1
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return ship.add(F._new_object(name, bm, ship.slots([material]), bevel=bevel, smooth_angle=30.0))


def tangent_box(a_deg, r, z, w_rad, w_tan, h):
    """Spec row for boxes(): a slab centred at polar(r,a), rot_z-aligned (x = radial)."""
    x, y, _ = polar(r, a_deg)
    return ((x, y, z), (w_rad, w_tan, h), math.radians(a_deg))
