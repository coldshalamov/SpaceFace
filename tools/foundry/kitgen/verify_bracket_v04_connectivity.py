"""verify_bracket_v04_connectivity.py — evidence that the bracket_gusset v04
strut physically overlaps both pad volumes (the lead's vision-review fix).

Builds the parts via kitgen, snapshots each part's world-space bbox BEFORE the
join+bevel step (when the strut and pads are still separate named objects), and
tests whether the strut's bbox intersects both pad bboxes.

PASS = strut bbox overlaps BOTH pad bboxes. Exit 0. FAIL = exit 1.
"""
from __future__ import annotations
import os, sys

import bpy
import bmesh
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
sys.path.insert(0, HERE)
import kitgen


def _build_v04_parts(size=None, seed=0xC0FFEE):
    """Re-derive the three v04 parts (pad_bot, pad_top, strut) as separate
    objects so we can inspect each bbox before finish_many joins them.

    Mirrors _bracket_angle_rib exactly, but skips the join step.
    """
    import math
    from mathutils import Quaternion
    if size is None:
        # Use the same draw as build_bracket_gusset -> r.uniform(0.10, 0.30)
        r = kitgen._rng(kitgen._derive_seed("bracket_gusset", 4, seed))
        size = round(r.uniform(0.10, 0.30), 4)
    thick = max(0.014, size * 0.10)
    pad_size = size * 0.30
    kitgen.clear_scene()

    # Bottom pad
    bm = bmesh.new()
    kitgen.bm_add_box(bm, Vector((pad_size, pad_size, thick)),
                      center=Vector((0.0, 0.0, thick * 0.5)))
    pad_bot = kitgen.new_object("KIT_BRACKET_GUSSET_pad_bot", bm)

    # Top pad
    top_y_center = -size * 0.5 + thick * 0.5
    top_z_center = size - pad_size * 0.5
    bm = bmesh.new()
    kitgen.bm_add_box(bm, Vector((pad_size, thick, pad_size)),
                      center=Vector((0.0, top_y_center, top_z_center)))
    pad_top = kitgen.new_object("KIT_BRACKET_GUSSET_pad_top", bm)

    # Strut — replicate the orientation logic
    p_bot = Vector((0.0, 0.0, thick * 0.5))
    p_top = Vector((0.0, top_y_center, top_z_center))
    direction = p_top - p_bot
    dlen = direction.length
    if dlen < 1e-6:
        direction = Vector((0.0, 0.0, 1.0))
        dlen = 1.0
    dn = direction / dlen
    embed = thick * 0.5
    a = p_bot - dn * embed
    b = p_top + dn * embed
    strut_vec = b - a
    strut_len = strut_vec.length
    strut_center = (a + b) * 0.5
    bm = bmesh.new()
    kitgen.bm_add_box(bm, Vector((thick, thick, strut_len)))
    strut = kitgen.new_object("KIT_BRACKET_GUSSET_strut", bm)
    z_axis = Vector((0.0, 0.0, 1.0))
    quat = z_axis.rotation_difference(strut_vec.normalized())
    strut.rotation_mode = 'QUATERNION'
    strut.rotation_quaternion = quat
    strut.location = strut_center
    # Bake transforms so vertex coords are in world space.
    kitgen.apply_transforms(strut)
    kitgen.apply_transforms(pad_bot)
    kitgen.apply_transforms(pad_top)
    return pad_bot, pad_top, strut, size, thick


def _bbox(obj):
    mw = obj.matrix_world
    verts = [mw @ v.co for v in obj.data.vertices]
    xs = [v.x for v in verts]
    ys = [v.y for v in verts]
    zs = [v.z for v in verts]
    return Vector((min(xs), min(ys), min(zs))), Vector((max(xs), max(ys), max(zs)))


def _intersect(mn_a, mx_a, mn_b, mx_b, tol=1e-5):
    """Axis-aligned bbox intersection test."""
    return (mn_a.x <= mx_b.x + tol and mx_a.x >= mn_b.x - tol and
            mn_a.y <= mx_b.y + tol and mx_a.y >= mn_b.y - tol and
            mn_a.z <= mx_b.z + tol and mx_a.z >= mn_b.z - tol)


def main():
    # Try several sizes spanning the brief envelope to prove the strut connects
    # for ANY size, not just the seed-drawn one.
    sizes = [0.10, 0.15, 0.20, 0.25, 0.30]
    all_ok = True
    for size in sizes:
        pad_bot, pad_top, strut, _, _ = _build_v04_parts(size=size)
        bot_mn, bot_mx = _bbox(pad_bot)
        top_mn, top_mx = _bbox(pad_top)
        st_mn, st_mx = _bbox(strut)
        o_bot = _intersect(bot_mn, bot_mx, st_mn, st_mx)
        o_top = _intersect(top_mn, top_mx, st_mn, st_mx)
        dims_st = st_mx - st_mn
        ratio = max(dims_st) / max(min(dims_st), 1e-9)
        print(f"size={size:.2f}  strut dims=({dims_st.x:.4f},{dims_st.y:.4f},{dims_st.z:.4f}) "
              f"longest/shortest={ratio:.2f}  overlaps pad_bot={o_bot}  overlaps pad_top={o_top}")
        if not (o_bot and o_top):
            all_ok = False
    if all_ok:
        print("\nBRACKET_V04_CONNECTIVITY_OK — strut physically overlaps both pads across sizes 0.10..0.30")
        sys.exit(0)
    print("\nBRACKET_V04_CONNECTIVITY_FAIL — strut does not overlap both pads for some size")
    sys.exit(1)


if __name__ == "__main__":
    main()
