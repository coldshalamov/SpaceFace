"""Top-down HUD silhouettes traced from the forged player hulls (src/data/shipSilhouettes.js).

Run:  blender -b --python tools/blender/forge/silhouettes.py
Imports each player hull's source GLB, rasterizes its LOD0 triangles in plan view (nose right),
traces the outer contour (marching squares) and simplifies it (Ramer-Douglas-Peucker) into a path in
the HUD's 48x28 viewBox. The secondary ('cut') path outlines the largest dark-machinery masses (engine blocks, bays,
intakes), so the icon keeps the ship's value structure. Prints JSON {defId: svg}.
"""
import json
import os
import sys

import bpy
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
PLAYER = {
    'ship_kestrel': 'kestrel', 'ship_pelican': 'pelican_production_v1', 'ship_wasp': 'wasp_production_v1',
    'ship_mule': 'mule_production_v1', 'ship_drifter': 'drifter_production_v1', 'ship_hornet': 'hornet_production_v1',
    'ship_ironback': 'ironback_production_v1', 'ship_hawser': 'yard_tug', 'ship_bastion': 'bastion_production_v1',
    'ship_atlas': 'atlas_production_v1', 'ship_ranger': 'ranger_production_v1', 'ship_warden': 'warden_production_v1',
    'ship_colossus': 'colossus_production_v1', 'ship_leviathan': 'leviathan_production_v1',
    'ship_saucer': 'saucer_production_v1',
}
VB_W, VB_H, MARGIN = 48.0, 28.0, 1.5
RES = 480


def triangles(path, dark_only=False):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)
    tris = []
    for o in bpy.context.scene.objects:
        if o.type != 'MESH' or o.name.startswith(('LOD1', 'LOD2', 'COLLISION')):
            continue
        me = o.data
        me.calc_loop_triangles()
        mw = o.matrix_world
        mats = [m.name if m else '' for m in me.materials]
        verts = [mw @ v.co for v in me.vertices]
        for t in me.loop_triangles:
            name = mats[t.material_index] if t.material_index < len(mats) else ''
            is_dark = 'MechanicalDark' in name
            if dark_only and not is_dark:
                continue
            # Blender after glTF import is Z-up again: plan = (x, y)
            tris.append([(verts[i].x, verts[i].y) for i in t.vertices])
    return np.array(tris, dtype=np.float64)


def rasterize(tris, bounds, res):
    (x0, y0), (x1, y1) = bounds
    w = res
    h = max(8, int(res * (y1 - y0) / max(x1 - x0, 1e-6)))
    grid = np.zeros((h, w), dtype=bool)
    sx = (w - 1) / max(x1 - x0, 1e-6)
    sy = (h - 1) / max(y1 - y0, 1e-6)
    for tri in tris:
        px = (tri[:, 0] - x0) * sx
        py = (tri[:, 1] - y0) * sy
        minx, maxx = int(max(0, np.floor(px.min()))), int(min(w - 1, np.ceil(px.max())))
        miny, maxy = int(max(0, np.floor(py.min()))), int(min(h - 1, np.ceil(py.max())))
        if maxx < minx or maxy < miny:
            continue
        xs, ys = np.meshgrid(np.arange(minx, maxx + 1) + 0.5, np.arange(miny, maxy + 1) + 0.5)
        (ax, ay), (bx, by), (cx, cy) = zip(px, py)
        d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
        if abs(d) < 1e-9:
            continue
        l1 = ((by - cy) * (xs - cx) + (cx - bx) * (ys - cy)) / d
        l2 = ((cy - ay) * (xs - cx) + (ax - cx) * (ys - cy)) / d
        inside = (l1 >= -0.02) & (l2 >= -0.02) & (1 - l1 - l2 >= -0.02)
        grid[miny:maxy + 1, minx:maxx + 1] |= inside
    return grid


def contours(grid):
    """Marching squares on a boolean grid -> list of closed polylines (pixel coords)."""
    g = np.pad(grid, 1).astype(np.uint8)
    h, w = g.shape
    segs = {}
    table = {1: [((0, .5), (.5, 1))], 2: [((.5, 1), (1, .5))], 3: [((0, .5), (1, .5))], 4: [((1, .5), (.5, 0))],
             5: [((0, .5), (.5, 0)), ((1, .5), (.5, 1))], 6: [((.5, 1), (.5, 0))], 7: [((0, .5), (.5, 0))],
             8: [((.5, 0), (0, .5))], 9: [((.5, 0), (.5, 1))], 10: [((.5, 0), (1, .5)), ((.5, 1), (0, .5))],
             11: [((.5, 0), (1, .5))], 12: [((1, .5), (0, .5))], 13: [((1, .5), (.5, 1))], 14: [((.5, 1), (0, .5))]}
    for y in range(h - 1):
        for x in range(w - 1):
            c = (g[y + 1, x] << 0) | (g[y + 1, x + 1] << 1) | (g[y, x + 1] << 2) | (g[y, x] << 3)
            for (a, b) in table.get(int(c), []):
                p = (x + a[0], y + a[1])
                q = (x + b[0], y + b[1])
                segs[p] = q
    loops = []
    while segs:
        start, nxt = segs.popitem()
        loop = [start, nxt]
        while nxt in segs:
            nxt = segs.pop(nxt)
            loop.append(nxt)
        if len(loop) > 8:
            loops.append(np.array(loop) - 1.0)
    return loops


def rdp(pts, eps):
    if len(pts) < 3:
        return pts
    a, b = pts[0], pts[-1]
    ab = b - a
    n = np.hypot(*ab) or 1e-9
    rel = pts - a
    d = np.abs(ab[0] * rel[:, 1] - ab[1] * rel[:, 0]) / n
    i = int(np.argmax(d))
    if d[i] > eps:
        return np.vstack([rdp(pts[:i + 1], eps)[:-1], rdp(pts[i:], eps)])
    return np.array([a, b])


def to_path(loops, bounds, grid_shape):
    (x0, y0), (x1, y1) = bounds
    h, w = grid_shape
    span_x, span_y = x1 - x0, y1 - y0
    k = min((VB_W - 2 * MARGIN) / span_x, (VB_H - 2 * MARGIN) / span_y)
    ox = (VB_W - span_x * k) / 2
    oy = (VB_H - span_y * k) / 2
    parts = []
    for loop in loops:
        # A closed loop starts and ends on the same point, so RDP needs two halves.
        far = int(np.argmax(np.hypot(*(loop - loop[0]).T)))
        simp = np.vstack([rdp(loop[:far + 1], 1.6)[:-1], rdp(loop[far:], 1.6)])
        if len(simp) < 4:
            continue
        pts = []
        for px, py in simp[:-1]:
            wx = x0 + px / (w - 1) * span_x
            wy = y0 + py / (h - 1) * span_y
            sx = ox + (wx - x0) * k
            sy = VB_H - (oy + (wy - y0) * k)   # +Y (port) up in plan -> SVG y down
            pts.append(f'{sx:.1f} {sy:.1f}')
        parts.append('M' + 'L'.join(pts) + 'Z')
    return ''.join(parts)


def silhouette(file):
    path = os.path.join(ROOT, 'assets', 'ships', 'parts', 'wholeships', f'{file}.glb')
    tris = triangles(path)
    lo = tris.reshape(-1, 2).min(axis=0)
    hi = tris.reshape(-1, 2).max(axis=0)
    bounds = ((lo[0], lo[1]), (hi[0], hi[1]))
    grid = rasterize(tris, bounds, RES)
    outer = sorted(contours(grid), key=len, reverse=True)
    main = to_path(outer[:3], bounds, grid.shape)
    dark = triangles(path, dark_only=True)
    cut = ''
    if len(dark):
        dgrid = rasterize(dark, bounds, RES)
        dloops = [c for c in sorted(contours(dgrid), key=len, reverse=True) if len(c) > 60][:4]
        cut = to_path(dloops, bounds, dgrid.shape)
    svg = f'<path d="{main}"/>'
    if cut:
        svg += f'<path d="{cut}" class="sx-shipmark__cut"/>'
    return svg


if __name__ == '__main__':
    out = {def_id: silhouette(file) for def_id, file in PLAYER.items()}
    print('SILHOUETTES_JSON ' + json.dumps(out))
