"""SF20-16: five broken recorder-ring panels retain an uncertain work shift.

Original Forge source; +X nose/+Y port/+Z up. Four independently published
families, actual metre coordinates, no preview-blockout geometry.
"""
import argparse
import json
import math
import shutil
import sys
from pathlib import Path
import bpy
from mathutils import Vector

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE))
import forge as F
from concept_export import export_family

COLORS = {'paint': '#536165', 'paint2': '#7b8276', 'dark': '#222a2d',
          'bare': '#6c7878', 'stripe': '#426d73', 'stone': '#919b9b',
          'glow_cyan': '#578a90'}
SPEC = 'design/program/world-depth-2026-10-02/references/sf20-2026-10-03/package/concepts/16_borrowed_voice.md'
PREFLIGHT = {'idea': 'Broken work ring retains echoes', 'authority': [SPEC],
    'supportedViews': ['chase', 'close', 'top'],
    'silhouette': 'Five metal eighths around a real open bore; six broad scalloped fans and three separate hard recorders.',
    'values': 'Pale dry fungal tissue, mid blue-gray lacquer panels, dark exposed cable troughs.',
    'signal': 'Only small recessed cyan notches and short exposed wire runs. Dry carrying handles never claim capture.',
    'review': 'Open actual Look pixels, fix observed craft, then root serial publication.'}


def source(family):
    F.reset_scene()
    s = F.Ship(family, COLORS)
    s.refresh_lod_normals = True
    s.collision_scale = 1
    return s


def mesh(s, name, vertices, faces, material):
    data = bpy.data.meshes.new(name)
    data.from_pydata(vertices, [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(s.mat(material))
    obj['forge_bevel'] = .008
    return s.add(obj)


def fan(s, name, foot, outward, radius):
    """A thick, curved scalloped lamina on a modeled neck, never a flat glow card."""
    u = Vector((math.cos(outward), math.sin(outward), 0))
    v = Vector((-u.y, u.x, 0))
    anchor = Vector(foot)
    height = min(1, radius / 1.8)
    F.cylinder(s, name + 'Neck', foot, tuple(anchor + u * (.18 * height) + Vector((0, 0, .42 * height))),
               .22 * height, .16 * height, material='stone', segments=12, bevel=.015)
    origin = anchor + u * (.18 * height) + Vector((0, 0, .40 * height))
    cols, rows = 41, 5
    vertices, faces = [], []
    for skin in (0, 1):
        for row in range(rows):
            t = .05 + .95 * row / (rows - 1)
            for col in range(cols):
                theta = -1.18 + 2.36 * col / (cols - 1)
                scallop = 1 - .045 * (1 + math.cos(5 * theta * math.pi / 1.18)) * t ** 4
                r = radius * t * scallop
                p = origin + u * (r * math.cos(theta)) + v * (r * math.sin(theta))
                p.z += height * (.55 * t + .55 * math.sin(math.pi * t) + .08 * math.cos(theta * 7) * t - skin * .105)
                vertices.append(tuple(p))
    layer = cols * rows
    for skin in (0, 1):
        offset = skin * layer
        for row in range(rows - 1):
            for col in range(cols - 1):
                quad = (offset + row * cols + col, offset + row * cols + col + 1,
                        offset + (row + 1) * cols + col + 1, offset + (row + 1) * cols + col)
                faces.append(quad if skin == 0 else tuple(reversed(quad)))
    perimeter = list(range(cols)) + [r * cols + cols - 1 for r in range(1, rows)]
    perimeter += list(range(layer - 2, layer - cols - 1, -1)) + [r * cols for r in range(rows - 2, 0, -1)]
    for a, b in zip(perimeter, perimeter[1:] + perimeter[:1]):
        faces.append((a, a + layer, b + layer, b))
    return mesh(s, name + 'ScallopedLamina', vertices, faces, 'stone')


def build_ring():
    s = source('borrowed_voice_ring')
    components, pivots, groups = {}, {}, {}
    centers = [math.radians(-22.5 + 45 * i) for i in range(5)]
    half = math.radians(21.7)
    for i, center in enumerate(centers):
        def point(r, angle): return (r * math.cos(angle), r * math.sin(angle))
        # A straight inner edge tangent at r13 makes each actual panel convex;
        # no convex aggregation fills the bore or the three missing eighths.
        outline = [point(18, center - half + 2 * half * k / 8) for k in range(9)]
        outline += [point(13 / math.cos(half), center + half), point(13 / math.cos(half), center - half)]
        panel = F.plate(s, 'BrokenRecorderSegment' + str(i + 1), outline, -1.7, 3.4,
                        material='paint', side_material='dark', chamfer=.18, bevel=.035)
        components['segment_' + str(i + 1)] = [panel]
        race = [(15.8 * math.cos(center - half + 2 * half * k / 8),
                 15.8 * math.sin(center - half + 2 * half * k / 8), 1.70) for k in range(9)]
        F.sweep(s, 'ExposedCableRaceway' + str(i + 1), race, .75, .12, material='dark', bevel=.012)
        F.sweep(s, 'CableTroughLip' + str(i + 1), [(x * 1.017, y * 1.017, z + .10) for x, y, z in race],
                .12, .15, material='bare', bevel=.008)
        trace = F.sweep(s, 'RetainedWireTrace' + str(i + 1), race[2:7], .075, .035,
                        material='glow_cyan', bevel=.003)
        s.hook_part('HOOK_BORROWED_SIGNAL_' + str(i + 1), trace)
        # Small seated segment latches, with no closed receiver or docking cue.
        x, y = point(14.3, center)
        F.box(s, 'PanelAccessLatch' + str(i + 1), (x, y, 1.79), (.9, .5, .13),
              material='paint2', rot_z=center, bevel=.03)
    for i, (index, offset, radius) in enumerate([(0, -.18, 2.1), (1, .12, 2.6),
               (2, -.20, 1.7), (2, .21, 2.25), (3, .08, 2.5), (4, -.08, 1.9)]):
        angle = centers[index] + offset
        foot = (16.8 * math.cos(angle), 16.8 * math.sin(angle), 1.71)
        start = len(s.objects)
        fan(s, 'FungalFan' + str(i + 1), foot, angle + (math.pi * .8 if i in (1, 4) else 0), radius)
        key = 'borrowed_voice_fan_' + str(i + 1)
        groups[key] = s.objects[start:]
        pivots[key] = s.motion_group(key, foot, groups[key])
    # Both exposed cable ends originate inside the last real panel raceway.
    for label, angle, direction in [('Lower', centers[0] - half, -1), ('Upper', centers[-1] + half, 1)]:
        radial = Vector((math.cos(angle), math.sin(angle), 0))
        tangent = Vector((-radial.y, radial.x, 0)) * direction
        for strand, r in enumerate((15.5, 15.8, 16.1)):
            p = radial * r + Vector((0, 0, 1.80))
            F.sweep(s, 'Exposed' + label + 'CableEnd' + str(strand),
                    [tuple(p - tangent * .4), tuple(p + tangent * .8),
                     tuple(p + tangent * 1.55 + radial * .22 + Vector((0, 0, -.4)))],
                    .14, .14, material='dark', bevel=.008)
    s.socket('SOCKET_Camera_Focus', (0, 0, 1.7))
    s.socket('SOCKET_Borrowed_Receiver', (0, 0, 0))
    s.socket_names = list(s.sockets)
    s.finish()
    return s, components, pivots, groups, ['13m open central bore', 'three missing eighths', 'five separately convex panel seams']


def broken_dish(s):
    center = Vector((1.15, 0, 1.72)); axis = Vector((1, 0, 1)).normalized()
    u = Vector((0, 1, 0)); v = axis.cross(u)
    vertices, faces = [], []
    rows, cols = 5, 25
    for row in range(rows):
        r = .055 + .80 * row / (rows - 1)
        for col in range(cols):
            theta = math.radians(-130 + 280 * col / (cols - 1))
            p = center + u * (r * math.cos(theta)) + v * (r * math.sin(theta)) + axis * (.20 * (r / .85) ** 2)
            vertices.append(tuple(p))
    for row in range(rows - 1):
        for col in range(cols - 1):
            a = row * cols + col; faces.append((a, a + 1, a + cols + 1, a + cols))
    obj = mesh(s, 'BrokenReceiverDish', vertices, faces, 'bare')
    modifier = obj.modifiers.new('Actual dish shell', 'SOLIDIFY'); modifier.thickness = .065
    bpy.context.view_layer.objects.active = obj; bpy.ops.object.modifier_apply(modifier=modifier.name)
    F.cylinder(s, 'DishFeedRod', tuple(center), tuple(center + axis * .65), .06, .035, material='dark', segments=12)


def build_recorder(recorder_id):
    family = 'borrowed_voice_' + recorder_id
    s = source(family)
    hull = F.box(s, 'HardMemoryHousing', (0, 0, 0), (4, 3, 2), material='paint', bevel=.10)
    F.box(s, 'MemoryLidCourse', (0, 0, 1.015), (3.7, 2.72, .10), material='paint2', bevel=.045)
    F.box(s, 'RecessedServiceSeam', (-.40, 0, 1.075), (.10, 2.1, .035), material='dark', bevel=.005)
    F.box(s, 'SignalNotchCoaming', (-1.05, -.75, 1.09), (.72, .34, .12), material='dark', bevel=.025)
    F.box(s, 'ActualSignalNotch', (-1.05, -.75, 1.158), (.49, .095, .025), material='glow_cyan', bevel=.004)
    # A dry carrying handle attached to the case, separate from the tiny notch.
    F.beams(s, 'SeatedDryCarryingHandle', [((-.95, .8, 1.055), (-.95, .8, 1.6)),
          ((-.95, .8, 1.6), (-.05, .8, 1.6)), ((-.05, .8, 1.6), (-.05, .8, 1.055))],
            .14, h=.14, material='bare', bevel=.02)
    F.box(s, 'AntennaMountFoot', (1.05, 0, 1.1), (.70, .65, .16), material='dark', bevel=.035)
    start = len(s.objects)
    # A small folded, dry relay organ colonizes the real socket. Its dark mounting
    # seam remains a damaged instrument, never a face or a luminous mouth.
    fan(s, 'FoldedRelayOrgan', (.78, 0, 1.055), -.55, .68)
    if recorder_id == 'a':
        F.cylinder(s, 'DishSupportNeck', (1.05, 0, 1.15), (1.15, 0, 1.74), .16, .12,
                   material='dark', segments=16, bevel=.012)
        broken_dish(s)
    elif recorder_id == 'b':
        F.beams(s, 'ForkReceiverAntenna', [((1.05, 0, 1.15), (1.05, 0, 1.65)),
          ((1.05, -.58, 1.65), (1.05, .58, 1.65)),
          ((1.05, -.58, 1.65), (1.38, -.58, 2.65)), ((1.05, .58, 1.65), (1.38, .58, 2.65))],
            .14, h=.16, material='bare', bevel=.018)
    else:
        F.cylinder(s, 'ShearedMissingMastStump', (1.05, 0, 1.15), (1.15, 0, 1.48), .16, .11,
                   material='bare', cap_material='dark', segments=12, bevel=.006)
        F.box(s, 'EmptyMastMountSocket', (1.11, -.26, 1.18), (.16, .12, .09), material='dark', bevel=.008)
    key = 'borrowed_voice_receiver'
    groups = {key: s.objects[start:]}
    pivots = {key: s.motion_group(key, (1.05, 0, 1.15), groups[key])}
    s.socket('SOCKET_Massline', (-1.75, 0, 0), (-1, 0, 0))
    s.socket('SOCKET_Borrowed_Receiver', (1.05, 0, 1.15), (1, 0, 0))
    s.socket('SOCKET_Camera_Focus', (0, 0, 1.0))
    s.socket_names = list(s.sockets)
    s.finish()
    return s, {'housing': [hull]}, pivots, groups, ['handle aperture', 'damaged receiver remains physically separate from ring']


def main():
    parser = argparse.ArgumentParser(); parser.add_argument('--live', action='store_true')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    for family, asset, builder in [('borrowed_voice_ring', 'SF_PLACE_BORROWED_VOICE_RING', build_ring)] + [
        ('borrowed_voice_' + rid, 'SF_PROP_BORROWED_VOICE_' + rid.upper(), lambda rid=rid: build_recorder(rid)) for rid in ('a', 'b', 'c')]:
        s, components, pivots, groups, gaps = builder()
        out = ROOT/'assets/ships/forge/preview'/family
        paths, contract = export_family(s, out, family=family, asset_id=asset, recipe=__file__,
            components=components, pivots=pivots, groups=groups, preflight=PREFLIGHT, negative_space=gaps)
        if args.live:
            source_dir = ROOT/'assets/ships/parts/wholeships'
            provenance = ROOT/'assets/ships/forge/sources'/family
            source_dir.mkdir(parents=True, exist_ok=True); provenance.mkdir(parents=True, exist_ok=True)
            for path in paths: shutil.copyfile(path, source_dir/path.name)
            for name in (family + '.blend', 'measured-contract.json'): shutil.copyfile(out/name, provenance/name)
            bank = out/(family.replace('_', '-') + '.motion.json')
            shutil.copyfile(bank, ROOT/'assets/ships/motions'/bank.name)
        print('BORROWED_VOICE_SOURCE', json.dumps({k: contract[k] for k in ('assetId', 'lods', 'bounds', 'physicalBounds')}))


if __name__ == '__main__': main()
