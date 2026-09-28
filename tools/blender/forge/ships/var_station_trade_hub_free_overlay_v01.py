"""FREE claim overlay for the Helios trade hub — the Free Frontier drift-town. Forge rebuild of
the pre-Forge blockout var_station_trade_hub_free_overlay_v01.glb (same file, same asset id).

Idea: "a shanty welded to the wheel". The Free Frontier does not own Helios — it lives on it:
squat improvised habitat pods squatting on the market ring's roofs on dark welded collars, wall
patch-plates and a stern lean-to bolted over the paint, lash trusses strung pod-to-pod, cargo
and drums strapped down wherever a roof was flat. Frontier cyan shows in cut bands, window
slits and a few work lamps — a squatter claim, not a coat of paint.
Three values: salvaged light hulls, mismatched mid patch plate, dark weld collars and machinery.
Identity colour: Frontier cyan #4ECBE0, authored dark in bands. Lights: warm slit windows,
cyan pod lights, amber markers. Nothing floats: every pod sits on a welded collar at roof z,
every wall plate overlaps the ring's outer face, trusses land on pod tops.
Frame: hub_overlay_kit — roofs at z ~28.2, wall face r 54 (+fenders), mouth arc kept clear.
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402
import hub_overlay_kit as K  # noqa: E402

SHIP_ID = 'var_station_trade_hub_free_overlay_v01'
COLORS = {
    'paint': '#7d7668',            # salvaged light hull plate
    'paint2': '#1f4f59',           # Frontier cyan, authored dark (#4ECBE0 in game light)
    'paint.patch': '#57504a',      # mismatched salvage plate
    'paint.primer': '#4a4f4a',     # bare primer
    'paint.graphite': '#23282e',
    'stripe': '#2f8a99',           # cyan claim band
    'hazard': '#a8861c',
    'dark': '#15181c',
    'glow_cyan.free': '#4ecbe0',   # frontier cyan pod light
    'glow_warm': '#ffc27a',
    'glow_amber': '#ffae2a',
    'glow_red': '#ff3a2a',
}

# (angle deg, radius, tangential w, radial w, height, style) — all on the ring roof z ~28.2
PODS = (
    (205.0, 46.0, 14.0, 10.0, 7.0, 'box'),
    (242.0, 48.0, 12.0, 9.0, 6.5, 'drum'),
    (288.0, 50.0, 13.0, 10.0, 8.0, 'box'),
    (328.0, 51.0, 12.0, 9.0, 6.0, 'box'),
    (27.0, 52.0, 13.0, 10.0, 7.0, 'drum'),
    (58.0, 47.0, 14.0, 11.0, 8.5, 'stack'),
    (100.0, 43.0, 11.0, 9.0, 6.0, 'box'),
    (150.0, 47.0, 13.0, 10.0, 7.5, 'drum'),
    (176.0, 46.0, 12.0, 9.0, 6.0, 'stack'),
)

# patch plates welded on the ring's outer wall and the terminal face. Centres sit at
# r ~54.5 (thickness 1.0): the inner face embeds in the r54 wall so nothing floats, the
# outer face lands ~55.0 just shy of the fender ribs at ~55.5.
SKIRTS = (
    (160.0, 54.5, 22.0, 10.0, 8.0, 'paint.patch'),
    (180.0, 54.55, 24.5, 12.0, 9.0, 'paint2'),
    (200.0, 54.5, 21.0, 9.0, 7.0, 'paint.primer'),
    (235.0, 54.45, 25.0, 10.0, 7.0, 'paint.patch'),
    (300.0, 54.45, 23.5, 9.0, 8.0, 'paint2'),
    (62.0, 54.5, 21.5, 10.0, 8.5, 'paint.patch'),
    (118.0, 54.5, 23.0, 11.0, 7.5, 'paint.primer'),
)


def pod_shell(s, k, a, r, wt, wr, h, body_mat):
    """Welded pod: a dark collar seat overlapping the roof, then the mismatched hull on it."""
    cx, cy, _ = K.polar(r, a)
    ra = math.radians(a)
    z0 = ROOF = K.ROOF_Z1 - 1.0          # collar sinks a metre into the hall roof
    F.box(s, f'Pod{k}Collar', (cx, cy, z0 + 0.7), (wr + 1.6, wt + 1.6, 2.6), material='dark',
          rot_z=ra, bevel=0.1)
    F.box(s, f'Pod{k}', (cx, cy, z0 + 1.4 + h / 2), (wr, wt, h), material=body_mat, rot_z=ra,
          bevel=0.18)
    return (cx, cy, z0 + 1.4 + h)


def pod_windows(s, k, a, r, wt, h_top, mat='glow_cyan.free'):
    """Slit windows on the pod's outward face + one warm door light — the pods are lived in."""
    ra = math.radians(a)
    for i in (-1, 0, 1):
        p = K.polar(r + 0.4 + i * 0.0, a, h_top - 1.6 + (i % 2) * 0.9)
        F.box(s, f'Pod{k}Win{i:+d}', (p[0] + 0.0, p[1] + 0.0, p[2]), (1.0, 0.16, 0.5),
              material=mat, rot_z=ra, bevel=0.0)


def build_pods(s):
    tops = []
    for k, (a, r, wt, wr, h, style) in enumerate(PODS):
        ra = math.radians(a)
        body_mat = ('paint', 'paint.patch', 'paint2', 'paint.primer')[k % 4]
        if style == 'drum':
            # a salvaged tank-hull pod: horizontal drum on a collar, strapped down
            cx, cy, _ = K.polar(r, a)
            F.box(s, f'Pod{k}Collar', (cx, cy, K.ROOF_Z1 - 0.3), (wr + 1.6, wt + 1.6, 2.6),
                  material='dark', rot_z=ra, bevel=0.1)
            axis = (-math.sin(ra), math.cos(ra), 0)
            c = K.polar(r, a, K.ROOF_Z1 + 3.0)
            p0 = (c[0] - axis[0] * wt / 2, c[1] - axis[1] * wt / 2, c[2])
            p1 = (c[0] + axis[0] * wt / 2, c[1] + axis[1] * wt / 2, c[2])
            F.cylinder(s, f'Pod{k}', p0, p1, wr * 0.42, material=body_mat, segments=14, bevel=0.08)
            for e in (-1, 1):  # strap rings: the drum is lashed, not faired in
                q = (c[0] + axis[0] * e * wt * 0.3, c[1] + axis[1] * e * wt * 0.3, c[2])
                F.ring(s, f'Pod{k}Strap{e:+d}', q, wr * 0.47, 0.28, axis=(axis[0], axis[1], 0),
                       material='hazard', segments=18, sides=6)
            tops.append((cx, cy, K.ROOF_Z1 + 3.0 + wr * 0.42))
            # crates lash down onto the drum crest — sunk half a metre so they read strapped
            crate_base = K.ROOF_Z1 + 3.0 + wr * 0.42 - 0.5
        elif style == 'stack':
            top = pod_shell(s, k, a, r, wt, wr, h * 0.62, body_mat)
            # the upper tier stays within the lower pod's roof (offset kept inside the
            # wt*0.62 footprint so it cannot cantilever into air)
            cx, cy, _ = K.polar(r - wr * 0.08, a - 3.5)
            F.box(s, f'Pod{k}Upper', (cx, cy, top[2] + h * 0.28), (wr * 0.62, wt * 0.62, h * 0.56),
                  material='paint.primer', rot_z=ra + 0.35, bevel=0.15)
            tops.append((cx, cy, top[2] + h * 0.56))
            crate_base = top[2]      # crates ride the lower roof, not the upper top
        else:
            top = pod_shell(s, k, a, r, wt, wr, h, body_mat)
            tops.append(top)
            crate_base = top[2]
        # a cyan claim band cut into every pod body
        F.band(s, f'Pod{k}', K.polar(r, a, tops[k][2] - h * 0.34), (0, 0, 1), 0.7, 'stripe')
        pod_windows(s, k, a, r, wt, tops[k][2])
        # roof clutter: strapped crates and a drum — lashed ON the pod roof they stand on.
        # Keep the azimuth offset inside the pod's tangential half-width (~3 deg) so the
        # crate lands on the roof instead of hanging off it.
        q = K.polar(r + wr * 0.12, a + 3.0, crate_base + 0.7)
        F.box(s, f'Pod{k}Crate', q, (1.8, 1.4, 1.4), material='paint2', rot_z=ra + 0.5,
              bevel=0.05)
        F.box(s, f'Pod{k}Strap', (q[0], q[1], q[2] + 0.35), (1.9, 0.3, 0.16), material='hazard',
              rot_z=ra + 0.5, bevel=0.0)
    return tops


def build_trusses(s, tops):
    """Lash runs pod-to-pod along the roof (the chain breaks at the harbour mouth) and two
    diagonal stays down onto the teal walk."""
    runs = [(0, 1), (1, 2), (2, 3), (4, 5), (5, 6), (6, 7), (7, 8)]
    for k, (i, j) in enumerate(runs):
        F.truss(s, f'Lash{k}', tops[i], tops[j], 1.3, 6, material='gunmetal', chord=0.22,
                web=0.13)
    # stays down to the roof edge between pod 2 and the rim, and off pod 5's roof
    F.beams(s, 'Stays', [
        (tops[2], K.polar(52.5, 288.0, K.ROOF_Z1 - 0.4)),
        (tops[5], K.polar(52.5, 55.0, K.ROOF_Z1 - 0.4)),
    ], 0.5, material='gunmetal')


def build_skirts(s):
    """Salvage plates welded over the ring's outer wall — a patchwork claim, plus a lean-to
    shack on the terminal's stern face."""
    for k, (a, r, zc, wt, h, mat) in enumerate(SKIRTS):
        F.box(s, f'Skirt{k}', K.polar(r, a, zc), (1.0, wt, h), material=mat,
              rot_z=math.radians(a), bevel=0.06)
        if k % 2 == 0:
            p = K.polar(r + 0.55, a, zc + h * 0.2)
            F.box(s, f'Skirt{k}Win', p, (0.14, 1.4, 0.45), material='glow_warm',
                  rot_z=math.radians(a), bevel=0.0)
    # terminal stern lean-to: a salvaged shack welded to the -X face
    F.box(s, 'SternLeanTo', (-58.8, -8.0, 19.5), (3.6, 11.0, 13.0), material='paint.patch',
          bevel=0.12)
    F.box(s, 'SternRoof', (-58.2, -8.0, 26.3), (5.0, 11.6, 0.8), material='paint.primer',
          bevel=0.06)
    F.box(s, 'SternWin', (-60.7, -8.0, 21.5), (0.14, 2.2, 0.6), material='glow_warm', bevel=0.0)


def build_details(s):
    """Amber markers on collars and a couple of cyan work lamps over the busiest pods."""
    s.detail = 1
    marks = []
    for k, (a, r, wt, wr, h, style) in enumerate(PODS):
        if k % 2:
            continue
        p = K.polar(r + wr * 0.5, a, K.ROOF_Z1 + 0.6)
        marks.append(((p[0], p[1], p[2]), (0.4, 0.4, 0.25), 0.0))
    F.boxes(s, 'CollarMarks', marks, 'glow_amber')
    s.detail = 0
    F.work_lamp(s, 'LampA', K.polar(44.0, 265.0, 34.0), aim=(0.2, 0.0, -1.0), size=0.5,
                lens='glow_cyan.free')
    F.work_lamp(s, 'LampB', K.polar(45.0, 78.0, 35.0), aim=(0.2, 0.0, -1.0), size=0.5,
                lens='glow_cyan.free')


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)
    tops = build_pods(s)
    build_trusses(s, tops)
    build_skirts(s)
    build_details(s)
    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
