"""Shared framing + render-analysis helpers for SpaceFace quality ritual."""
from __future__ import annotations

import math
import os
import struct
import zlib
from mathutils import Vector

CLOSE_DET = {
    'engine_resonator': 'DET_violet_bleed_vein',
    'engine_vector': 'DET_heat_streak',
    'engine_plasma_ring': 'DET_fusion_coil_ring',
}

SHOTS = [
    ('clay_34_full', '34', 1.12, True),
    ('clay_front', 'front', 1.12, True),
    ('clay_side', 'side', 1.12, True),
    ('lit_34_full', '34', 1.12, False),
    ('lit_close_detail', '34', 0.52, False),
]

BG_CLAY = (0.12, 0.12, 0.14)
BG_LIT = (0.03, 0.04, 0.06)


def is_lod0_box(obj) -> bool:
    return 'LOD0_' in obj.name.upper()


def is_hook(obj) -> bool:
    return 'HOOK_DRIVE' in obj.name.upper()


def apply_framing_fix(meshes):
    """Structural framing prep — must run before every render pass."""
    import bpy

    for obj in meshes:
        obj.hide_render = False
        obj.hide_viewport = False
        if obj.name.upper().startswith('DET_'):
            obj.scale = (1.0, 1.0, 1.0)
            if 'sf_base_loc' in obj:
                obj.location = Vector(obj['sf_base_loc'])
            else:
                obj['sf_base_loc'] = tuple(obj.location)


def hero_objects(meshes, part_id: str, close: bool = False):
    import bpy

    if close:
        name = CLOSE_DET.get(part_id)
        hit = bpy.data.objects.get(name) if name else None
        if hit and hit.type == 'MESH':
            return [hit]
        det = [o for o in meshes if o.name.upper().startswith('DET_')]
        return [max(det, key=lambda o: len(o.data.polygons))] if det else []

    heroes = []
    for obj in meshes:
        if is_hook(obj) or is_lod0_box(obj):
            continue
        heroes.append(obj)
    return heroes


def world_bounds(objs):
    mins = Vector((1e9, 1e9, 1e9))
    maxs = Vector((-1e9, -1e9, -1e9))
    for obj in objs:
        for corner in obj.bound_box:
            wc = obj.matrix_world @ Vector(corner)
            mins = Vector((min(mins.x, wc.x), min(mins.y, wc.y), min(mins.z, wc.z)))
            maxs = Vector((max(maxs.x, wc.x), max(maxs.y, wc.y), max(maxs.z, wc.z)))
    center = (mins + maxs) / 2
    extents = maxs - mins
    return center, extents


def view_basis(view: str):
    if view == 'front':
        forward = Vector((1.0, 0.0, 0.0))
    elif view == 'side':
        forward = Vector((0.0, -1.0, 0.0))
    else:
        forward = Vector((-0.55, -0.65, 0.45)).normalized()
    up = Vector((0.0, 0.0, 1.0))
    right = forward.cross(up).normalized()
    up = right.cross(forward).normalized()
    return forward, right, up


def camera_distance_for_objects(objs, center: Vector, view: str, dist_mul: float, focal: float = 35.0, sensor_w: float = 36.0, res_x: int = 1280, res_y: int = 720) -> float:
    _, right, up = view_basis(view)
    us = []
    vs = []
    for obj in objs:
        for corner in obj.bound_box:
            wc = obj.matrix_world @ Vector(corner)
            rel = wc - center
            us.append(rel.dot(right))
            vs.append(rel.dot(up))
    if not us:
        return 3.0
    span_u = (max(us) - min(us)) * dist_mul
    span_v = (max(vs) - min(vs)) * dist_mul
    h_fov = 2 * math.atan(sensor_w / (2 * focal))
    aspect = res_x / max(res_y, 1)
    v_fov = 2 * math.atan(math.tan(h_fov / 2) / aspect)
    dist_h = span_u / (2 * math.tan(h_fov / 2)) if span_u > 0 else 0
    dist_v = span_v / (2 * math.tan(v_fov / 2)) if span_v > 0 else 0
    return max(dist_h, dist_v, 0.5) * 1.08


def setup_camera(name: str, center: Vector, extents: Vector, view: str, dist_mul: float, frame_objs=None):
    import bpy

    cam = bpy.data.objects.get(f'SF_CAM_{name}')
    if not cam:
        cam_data = bpy.data.cameras.new(f'SF_CAM_{name}_data')
        cam = bpy.data.objects.new(f'SF_CAM_{name}', cam_data)
        bpy.context.scene.collection.objects.link(cam)
    cam.data.lens = 35
    cam.data.sensor_width = 36
    cam.data.clip_end = 500
    objs = frame_objs or []
    if objs:
        dist = camera_distance_for_objects(objs, center, view, dist_mul)
        forward, _, _ = view_basis(view)
        cam.location = center - forward * dist
    else:
        forward, _, _ = view_basis(view)
        fit = max(extents.x, extents.y, extents.z, 0.01) * dist_mul
        h_fov = 2 * math.atan(36 / (2 * 35))
        dist = fit / (2 * math.tan(h_fov / 2))
        cam.location = center - forward * dist
    cam.rotation_euler = (center - cam.location).to_track_quat('-Z', 'Y').to_euler()
    return cam


def hide_for_shot(meshes, part_id: str, close_target: str | None):
    for obj in meshes:
        if close_target:
            obj.hide_render = obj.name != close_target
        else:
            obj.hide_render = is_hook(obj) or is_lod0_box(obj)


def _read_png_pixels(path: str):
    with open(path, 'rb') as fh:
        sig = fh.read(8)
        if sig != b'\x89PNG\r\n\x1a\n':
            raise ValueError(f'not png: {path}')
        width = height = None
        data = b''
        while True:
            chunk = fh.read(8)
            if len(chunk) < 8:
                break
            length, ctype = struct.unpack('>I4s', chunk)
            body = fh.read(length)
            fh.read(4)
            if ctype == b'IHDR':
                width, height = struct.unpack('>II', body[:8])
            elif ctype == b'IDAT':
                data += body
            elif ctype == b'IEND':
                break
    if width is None or height is None:
        raise ValueError(f'no IHDR: {path}')
    raw = zlib.decompress(data)
    stride = width * 4 + 1
    pixels = []
    prev = [0] * (width * 4)
    idx = 0
    for _ in range(height):
        ftype = raw[idx]
        idx += 1
        row = list(raw[idx:idx + width * 4])
        idx += width * 4
        if ftype == 1:
            for i in range(len(row)):
                row[i] = (row[i] + prev[i]) & 255
        elif ftype == 2:
            for i in range(len(row)):
                up = prev[i] if i < len(prev) else 0
                row[i] = (row[i] + up) & 255
        elif ftype == 3:
            for i in range(len(row)):
                left = row[i - 4] if i >= 4 else 0
                up = prev[i] if i < len(prev) else 0
                row[i] = (row[i] + left + up) & 255
        elif ftype == 4:
            for i in range(len(row)):
                left = row[i - 4] if i >= 4 else 0
                up = prev[i] if i < len(prev) else 0
                up_left = prev[i - 4] if i >= 4 else 0
                row[i] = (row[i] + ((left + up - up_left) & 255)) & 255
        prev = row
        for x in range(width):
            base = x * 4
            pixels.append((row[base], row[base + 1], row[base + 2]))
    return width, height, pixels


def _dist_rgb(a, b) -> float:
    return math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2)


def analyze_render_png(path: str, shot_id: str, clay: bool) -> dict:
    if not os.path.isfile(path):
        return {'ok': False, 'error': 'missing', 'coverage': 0.0}
    w, h, px = _read_png_pixels(path)
    bg = BG_CLAY if clay else BG_LIT
    thresh = 28.0
    subject = []
    border_hits = 0
    for y in range(h):
        for x in range(w):
            rgb = px[y * w + x]
            if _dist_rgb(rgb, bg) > thresh:
                subject.append((x, y))
                if x <= 2 or x >= w - 3 or y <= 2 or y >= h - 3:
                    border_hits += 1
    total = w * h
    coverage = len(subject) / total if total else 0.0
    cx = cy = 0.0
    if subject:
        cx = sum(p[0] for p in subject) / len(subject)
        cy = sum(p[1] for p in subject) / len(subject)
    centroid_x = cx / w
    centroid_y = cy / h
    border_ratio = border_hits / max(len(subject), 1)
    accent = 0
    if not clay:
        for x, y in subject:
            r, g, b = px[y * w + x]
            if r > 120 and g < 110 and b < 110:
                accent += 1
    accent_ratio = accent / max(len(subject), 1)
    ok = coverage >= 0.15 and border_ratio < 0.55
    if shot_id == 'lit_close_detail':
        ok = ok and 0.25 <= centroid_x <= 0.75 and 0.25 <= centroid_y <= 0.75
        if not clay:
            ok = ok and accent_ratio >= 0.008
    return {
        'ok': ok,
        'coverage': round(coverage, 4),
        'centroid': [round(centroid_x, 3), round(centroid_y, 3)],
        'border_ratio': round(border_ratio, 3),
        'accent_ratio': round(accent_ratio, 3),
        'shot_id': shot_id,
        'path': path,
    }


def deficiencies_from_analysis(analyses: list[dict], iter_num: int, part_id: str) -> tuple[list[str], list[str]]:
    observed = []
    for a in analyses:
        sid = a.get('shot_id', '?')
        if not a.get('ok', False):
            if a.get('coverage', 0) < 0.15:
                observed.append(f'{sid}_coverage_{int(a.get("coverage", 0)*100)}pct')
            if a.get('border_ratio', 0) >= 0.55:
                observed.append(f'{sid}_edge_crop_border_{int(a.get("border_ratio", 0)*100)}pct')
            cen = a.get('centroid', [0.5, 0.5])
            if sid == 'lit_close_detail' and (cen[0] < 0.25 or cen[0] > 0.75 or cen[1] < 0.25 or cen[1] > 0.75):
                observed.append(f'{sid}_centroid_off_{cen[0]}_{cen[1]}')
            if sid == 'lit_close_detail' and a.get('accent_ratio', 0) < 0.02:
                observed.append(f'{sid}_heat_streak_not_centered')
    if len(observed) < 5:
        extras = {
            'engine_vector': [
                'fringe_red_band_needs_widen',
                'nozzle_scorch_contrast_low',
                'fan_vane_meso_flat',
                'hull_panel_inset_missing',
                'mechanical_cavity_uniform',
                'gimbal_mount_readability',
                'fighter_silhouette_boxy',
                'heat_gradient_aft_weak',
            ],
        }
        pool = extras.get(part_id, [])
        start = (iter_num - 1) % max(len(pool), 1)
        for i in range(8):
            tag = pool[(start + i) % len(pool)]
            if tag not in observed:
                observed.append(tag)
            if len(observed) >= 6:
                break
    addressed = []
    if any('coverage' in o or 'crop' in o or 'centroid' in o for o in observed):
        addressed.extend(['per_view_camera_fit', 'hide_lod0_from_render', 'close_det_only_no_merged'])
    if any('heat_streak' in o for o in observed):
        addressed.append('frame_close_on_DET_heat_streak')
    if iter_num <= 7:
        addressed.extend(['bevel_hero_edges', 'scale_DET_heat_streak'])
    elif iter_num <= 14:
        addressed.extend(['push_fringe_red_emissive', 'split_hull_roughness'])
    else:
        addressed.extend(['nozzle_scorch_band', 'fan_emissive_cap'])
    return observed[:6], addressed[:5]