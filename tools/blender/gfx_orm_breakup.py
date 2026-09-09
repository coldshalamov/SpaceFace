# Author surface breakup into an asset's ORM green channel (and optional base-colour value zones).
#
#   blender --background --python tools/blender/gfx_orm_breakup.py -- <job.json>
#
# WHY THIS EXISTS
# A Blender sweep of every shipped GLB (scripts/gfx-asset-audit.mjs) found TWENTY assets whose ORM
# green channel has a standard deviation of EXACTLY ZERO — all eleven modular hulls, all six engines,
# two cockpits, two dock interiors. A constant roughness gives a constant specular response, so the
# surface reads as one plastic sheet however well the materials are split.
#
# Two renderer-side attempts to compensate (low-frequency roughness perturbation, then albedo value
# zones) were each measured at median-of-5 and each left the `material` axis at 2/5, unanimous. The
# reviewer wants authored variety PER ZONE, readable at ship size. That is texture content, so it has
# to be written into the map.
#
# WHAT IT DOES
# Multi-octave value noise, seeded per image name so a rebuild is deterministic, written into:
#   * ORM green (roughness)  — the actual defect
#   * base colour value      — optional, off by default, because global value change is art direction
# Hue is never touched. Existing variation is preserved: the noise is applied as a delta around the
# map's current value, so a map that already has breakup keeps it and simply gains a little more.
#
# SAFETY
# Writes to an OUTPUT PATH ONLY. Never overwrites the input GLB. Live assets are untouched; the
# result is a candidate for the ordinary review/promotion path.
import bpy
import json
import os
import sys
import math


def argv_after_ddash():
    return sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def hash01(x, y, seed):
    """Deterministic value hash in [0,1) — no numpy, no RNG state."""
    n = math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453
    return n - math.floor(n)


def smooth_noise(u, v, freq, seed):
    x, y = u * freq, v * freq
    xi, yi = math.floor(x), math.floor(y)
    xf, yf = x - xi, y - yi
    sx = xf * xf * (3.0 - 2.0 * xf)
    sy = yf * yf * (3.0 - 2.0 * yf)
    a = hash01(xi, yi, seed)
    b = hash01(xi + 1, yi, seed)
    c = hash01(xi, yi + 1, seed)
    d = hash01(xi + 1, yi + 1, seed)
    return (a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sy


def fbm(u, v, seed, octaves=3, base_freq=5.0):
    total, amp, freq, norm = 0.0, 1.0, base_freq, 0.0
    for _ in range(octaves):
        total += smooth_noise(u, v, freq, seed) * amp
        norm += amp
        amp *= 0.5
        freq *= 2.13          # non-integer so octaves do not align into a grid
    return total / norm if norm else 0.5


def image_ready(img):
    try:
        if img.packed_file is None and not img.filepath:
            return False
        _ = img.pixels[0]
        return img.size[0] > 0 and img.size[1] > 0
    except Exception:
        return False


def channel_stdev(px, n, channel, budget=2048):
    step = max(1, n // budget)
    vals = [px[i * 4 + channel] for i in range(0, n, step)]
    if not vals:
        return 0.0
    mean = sum(vals) / len(vals)
    return (sum((v - mean) ** 2 for v in vals) / len(vals)) ** 0.5


def apply_breakup(img, channel, amount, seed, octaves, base_freq):
    """Add zero-mean fbm to one channel, clamped. Returns (before_stdev, after_stdev)."""
    w, h = img.size
    n = w * h
    px = list(img.pixels)                     # one bulk read; per-pixel access is far slower
    before = channel_stdev(px, n, channel)
    for j in range(h):
        v = j / float(h)
        for i in range(w):
            idx = (j * w + i) * 4 + channel
            u = i / float(w)
            delta = (fbm(u, v, seed, octaves, base_freq) - 0.5) * amount
            px[idx] = min(1.0, max(0.0, px[idx] + delta))
    img.pixels[:] = px
    after = channel_stdev(px, n, channel)
    return before, after


def main():
    args = argv_after_ddash()
    if not args:
        print('usage: -- <job.json>')
        return
    with open(args[0], 'r', encoding='utf-8') as fh:
        job = json.load(fh)

    src = job['input']
    dst = job['output']
    rough_amount = float(job.get('roughnessAmount', 0.42))
    albedo_amount = float(job.get('albedoAmount', 0.0))   # off by default: art direction
    octaves = int(job.get('octaves', 3))
    base_freq = float(job.get('baseFreq', 5.0))

    bpy.ops.wm.read_homefile(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=src)

    # Which images are ACTUALLY the roughness map, read from the material graph rather than guessed
    # from the file name. Name-guessing silently skipped 4 of 20 assets whose ORM image is named by
    # material (e.g. "engine_ion_small_mat_2") with no 'orm'/'roughness' token anywhere in it — the
    # run reported success while writing nothing. glTF packs ORM as one image feeding the Metallic
    # and Roughness inputs of Principled BSDF, so the graph is the authority.
    roughness_images = set()
    for mat in bpy.data.materials:
        if not mat.use_nodes or not mat.node_tree:
            continue
        for node in mat.node_tree.nodes:
            if node.type != 'BSDF_PRINCIPLED':
                continue
            for slot in ('Roughness', 'Metallic'):
                inp = node.inputs.get(slot)
                if not inp or not inp.is_linked:
                    continue
                walk = inp.links[0].from_node
                # glTF inserts a Separate Color / Separate RGB between the image and these inputs.
                for _ in range(4):
                    if walk.type == 'TEX_IMAGE':
                        if walk.image:
                            roughness_images.add(walk.image.name)
                        break
                    linked = [i for i in walk.inputs if i.is_linked]
                    if not linked:
                        break
                    walk = linked[0].links[0].from_node

    report = {'input': src, 'output': dst, 'images': [],
              'roughnessImagesFromGraph': sorted(roughness_images)}
    for img in list(bpy.data.images):
        if not image_ready(img):
            continue
        low = img.name.lower()
        seed = sum(ord(c) for c in img.name) % 977          # stable per image name
        # NEVER match 'orm' as a bare substring: "n-orm-al" contains it, and an early version of this
        # script wrote noise into hull_starter_neutral_NORMAL's green channel — the Y component of a
        # tangent-space normal — which would have shipped visibly wrong lighting on every surface
        # using that map. Match ORM only as a delimited token, and exclude normal maps outright.
        is_normal = 'normal' in low or low.endswith('_nrm') or '_nrm_' in low
        is_orm = (not is_normal) and (
            img.name in roughness_images                    # authoritative: the material graph
            or low.endswith('_orm') or '_orm_' in low or low.endswith('orm')
            or 'roughness' in low
        )
        if is_orm:
            b, a = apply_breakup(img, 1, rough_amount, seed, octaves, base_freq)
            report['images'].append({'image': img.name, 'channel': 'roughness',
                                     'stdevBefore': round(b, 4), 'stdevAfter': round(a, 4)})
        elif albedo_amount > 0 and 'basecolor' in low:
            for ch in (0, 1, 2):                            # value only — same delta per channel
                b, a = apply_breakup(img, ch, albedo_amount, seed, octaves, base_freq * 0.55)
            report['images'].append({'image': img.name, 'channel': 'basecolor-value',
                                     'stdevBefore': round(b, 4), 'stdevAfter': round(a, 4)})

    os.makedirs(os.path.dirname(dst), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=dst, export_format='GLB',
        export_materials='EXPORT', export_image_format='AUTO',
        export_extras=True, export_yup=True, use_selection=False,
    )
    # An export that wrote no map is a NO-OP, not a success. The first batch reported 20/20 "ok" while
    # four assets had silently matched nothing, so absence of a written map is now an explicit failure.
    report['ok'] = os.path.exists(dst) and len(report['images']) > 0
    report['wroteNoMaps'] = len(report['images']) == 0
    report['bytes'] = os.path.getsize(dst) if os.path.exists(dst) else 0
    print('[breakup] ' + json.dumps(report))
    with open(dst + '.report.json', 'w', encoding='utf-8') as fh:
        json.dump(report, fh, indent=2)


main()
