"""ANI-00 bake: real Blender actions on MOTION_ pivots -> spaceface.rigidMotionBank.v1 JSON.

The ANI animation scripts keyframe the persistent pivot empties a ship registered via
`Ship.motion_group` (tools/blender/forge/motion.py). This module samples each pivot's
`matrix_basis` at 60 fps, converts the local transform to the glTF basis (the exporter writes
per-node locals conjugated: translation (x, z, -y), rotation K ⊗ q ⊗ K⁻¹), and stores
rest-relative deltas the runtime composes as `rest + delta` / `rest ⊗ delta`
(src/contracts/motionBank.js).

`seal()` reads the exported release GLB for each binding's authoritative rest pose — the GLB is
the truth the runtime binds, not the Blender scene — and pins `sourceGlbSha256` so provenance
checks can prove bank↔GLB agreement.
"""
import hashlib
import json
import os
import struct

import bpy
from mathutils import Euler, Matrix, Quaternion, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..'))
MOTIONS_DIR = os.path.join(ROOT, 'assets', 'ships', 'motions')

# glTF basis vectors expressed in Blender axes: +X nose, +Z up, -Y port.
# blender (x, y, z) -> glTF (x, z, -y): columns are the images of the Blender basis vectors.
K = Matrix(((1, 0, 0), (0, 0, 1), (0, -1, 0)))
K_INV = K.inverted()
K_QUAT = K.to_quaternion()
K_QUAT_INV = K_QUAT.inverted()


def blender_local_to_gltf(basis):
    """A node's local basis (Blender, relative to its glTF parent) -> (t, q_xyzw) in glTF axes."""
    loc, rot, _scale = basis.decompose()
    tg = K @ loc
    qg = K_QUAT @ rot @ K_QUAT_INV
    return [tg.x, tg.y, tg.z], [qg.x, qg.y, qg.z, qg.w]


def _quat_mul(a, b):
    return Quaternion(a) @ Quaternion(b)


def _quat_inv(q):
    return Quaternion(q).inverted()


def _glb_json(path):
    with open(path, 'rb') as f:
        data = f.read()
    magic, _version, _length = struct.unpack_from('<III', data, 0)
    assert magic == 0x46546C67, f'{path}: not a GLB'
    jlen = int.from_bytes(data[12:16], 'little')
    return json.loads(data[20:20 + jlen].decode('utf-8'))


def _sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


class Clip:
    """One authored action: keyframe pivots with `key(t, loc=..., rot=...)` at 60 fps."""

    def __init__(self, name, duration_s, loop=False, end_mode='rest', overlay=False):
        self.name = name
        # Keys land on the 60 fps grid and the bake closes every channel at the last frame, so the
        # clip's own duration must sit on the grid too. A mass-scaled duration (7.409 s) otherwise
        # ships a final key at 7.4167 s and the runtime validator rejects the whole bank.
        self.duration_s = round(float(duration_s) * 60) / 60
        self.loop = bool(loop)
        if end_mode not in ('rest', 'hold'):
            raise ValueError(f'clip {name}: endMode must be rest or hold')
        self.end_mode = end_mode
        # Transient overlay: its group claims RELEASE when it drains, so a held base
        # pose or running loop underneath re-drives instead of staying suppressed.
        self.overlay = bool(overlay)
        # rig -> {t_frame: {'loc':..., 'rot':...}}
        self._keys = {}

    def key(self, rig_id, t_s, loc=None, rot=None):
        """One absolute key at t seconds: loc (pivot-local vec3) and/or rot (Euler/quaternion)."""
        frame = int(round(t_s * 60))
        entry = self._keys.setdefault(rig_id, {}).setdefault(frame, {})
        if loc is not None:
            entry['loc'] = tuple(float(v) for v in loc)
        if rot is not None:
            if isinstance(rot, Euler):
                rot = rot.to_quaternion()
            elif isinstance(rot, (tuple, list)):
                rot = Quaternion(rot) if len(rot) == 4 else Euler(rot).to_quaternion()
            entry['rot'] = rot
        return self


class MotionBank:
    """Bakes clips against a ship's registered motion pivots.

    `ship` must carry motion_pivots/motion_groups from Ship.motion_group; `rig_id` is the bank's
    stable rig, `source_asset_id` the runtime assetId the exported GLB carries.
    """

    def __init__(self, ship, rig_id, source_asset_id, events=None):
        self.ship = ship
        self.rig_id = rig_id
        self.source_asset_id = source_asset_id
        self.events = dict(events or {})
        self.clips = []

    def clip(self, name, duration_s, loop=False, end_mode='rest', overlay=False):
        c = Clip(name, duration_s, loop=loop, end_mode=end_mode, overlay=overlay)
        self.clips.append(c)
        return c

    # -- baking --------------------------------------------------------------------------------
    def _sample_group_channels(self, clip):
        """Bake every keyed group at 60fps to rest-relative glTF delta channels."""
        scene = bpy.context.scene
        scene.frame_start = 0
        scene.frame_end = max(1, int(round(clip.duration_s * 60)))
        scene.render.fps = 60
        scene.render.fps_base = 1.0

        # Evaluate authored keys directly per output frame. Blender's quaternion F-curves
        # canonicalize stored keys to w>=0, which drops winding information: a roll past pi
        # lands the next key at -q and the in-between frames reverse through the wrap.
        # Interpolating the keys here keeps authored winding intact across any span.
        def _channel_samples(entries, frames_out, default):
            """entries: sorted [(frame, vec|quat)] -> interpolated absolute value per frame."""
            if not entries:
                return {f: default for f in frames_out}
            out = {}
            i = 0
            prev_entry = None
            for f in frames_out:
                while i + 1 < len(entries) and entries[i + 1][0] <= f:
                    i += 1
                if f <= entries[0][0]:
                    out[f] = entries[0][1]
                    continue
                if i + 1 >= len(entries):
                    out[f] = entries[-1][1]
                    continue
                f0, v0 = entries[i]
                f1, v1 = entries[i + 1]
                if f1 <= f0:
                    out[f] = v1
                    continue
                t = (f - f0) / (f1 - f0)
                if isinstance(v0, Quaternion):
                    q1 = v1 if v0.dot(v1) >= 0 else Quaternion((-v1.w, -v1.x, -v1.y, -v1.z))
                    out[f] = v0.slerp(q1, t)
                else:
                    out[f] = v0.lerp(v1, t)
                prev_entry = f
            return out

        channels = {}
        end_frame = int(round(clip.duration_s * 60))
        for rig_id in clip._keys:
            pivot = self.ship.motion_pivots.get(rig_id)
            if pivot is None:
                raise KeyError(f'motion bank {self.rig_id}: clip {clip.name} keys unknown group {rig_id}')
            rest = self._rest_basis(rig_id)
            rest_loc, rest_rot_b, _ = rest.decompose()
            rest_t, rest_q = blender_local_to_gltf(rest)
            keymap = clip._keys[rig_id]
            loc_entries = sorted((f, Vector(v['loc'])) for f, v in keymap.items() if 'loc' in v)
            rot_entries = sorted((f, v['rot']) for f, v in keymap.items() if 'rot' in v)
            # Emit at the authored keys (+ the clip endpoints) rather than dense 60 fps:
            # the runtime slerps/lerps between samples, so a sparse channel reproduces the
            # curve exactly at a fraction of the bytes. A path with no authored keys emits
            # no channel at all — the evaluator holds rest for unwritten paths anyway.
            channels[rig_id] = {}
            if loc_entries:
                key_frames = sorted({0.0, float(end_frame)} | {f for f, _ in loc_entries})
                loc_at = _channel_samples(loc_entries, key_frames, rest_loc)
                t_times, t_values = [], []
                for frame in key_frames:
                    tg, _ = blender_local_to_gltf(Matrix.Translation(loc_at[frame]))
                    dt = [tg[0] - rest_t[0], tg[1] - rest_t[1], tg[2] - rest_t[2]]
                    t_times.append(frame / 60.0)
                    t_values += dt
                channels[rig_id]['translation'] = (t_times, t_values)
            if rot_entries:
                key_frames = sorted({0.0, float(end_frame)} | {f for f, _ in rot_entries})
                rot_at = _channel_samples(rot_entries, key_frames, rest_rot_b)
                r_times, r_values = [], []
                for frame in key_frames:
                    _, qg = blender_local_to_gltf(rot_at[frame].to_matrix().to_4x4())
                    # rotation delta left-multiplies the rest quaternion: q = rest ⊗ delta
                    dq = _quat_mul(_quat_inv([rest_q[3], rest_q[0], rest_q[1], rest_q[2]]),
                                   [qg[3], qg[0], qg[1], qg[2]])
                    r_times.append(frame / 60.0)
                    r_values += [dq.x, dq.y, dq.z, dq.w]
                channels[rig_id]['rotation'] = (r_times, r_values)
        return channels

    def _rest_basis(self, rig_id):
        """A pivot's rest local basis: the authored mount pose captured at registration.

        matrix_basis at keying time is mutable (each key assignment moves it), so the rest is
        read from the immutable snapshot register_motion_group stored on the pivot.
        """
        pivot = self.ship.motion_pivots[rig_id]
        rest = pivot.get('forge_motion_rest')
        if rest is None:
            return pivot.matrix_basis.copy()
        return Matrix(tuple(tuple(row) for row in rest))

    def bake(self, glb_paths, out_path=None):
        """Evaluate all clips and seal the bank against the exported release GLBs.

        `glb_paths`: one path per LOD file (player layout) or the single npc file. The LOD0 file
        must be first — its node locals become the bindings' restPose.
        """
        os.makedirs(MOTIONS_DIR, exist_ok=True)
        out_path = out_path or os.path.join(MOTIONS_DIR, f'{self.rig_id.split("_")[0]}.motion.json')

        # Authoritative rest poses come from the exported GLB nodes, not from Blender math —
        # the GLB is exactly what the runtime loads, so bank rest == node local by construction.
        lods = [_glb_json(p) for p in glb_paths]
        primary = lods[0]
        nodes_by_name = {}
        for node in primary.get('nodes', []):
            if node.get('name'):
                nodes_by_name[node['name']] = node

        bindings = []
        for group in self.ship.motion_groups:
            rig = group['id']
            node_name = f'MOTION_{rig.upper()}'
            node = nodes_by_name.get(node_name)
            present = [i for i, doc in enumerate(lods)
                       if any(n.get('name') == node_name for n in doc.get('nodes', []))]
            if node is None:
                raise KeyError(
                    f'motion bank {self.rig_id}: {node_name} is not in {glb_paths[0]} — '
                    'export before baking, and check the pivot survived weld+export.'
                )
            bindings.append({
                'id': rig,
                'node': node_name,
                'parent': group['parent'],
                'restPose': {
                    'translation': node.get('translation', [0, 0, 0]),
                    'rotation': node.get('rotation', [0, 0, 0, 1]),
                    'scale': node.get('scale', [1, 1, 1]),
                },
                'requiredAtLod': list(present),
            })

        clips = []
        for clip in self.clips:
            channels = []
            for rig_id, sampled in self._sample_group_channels(clip).items():
                for path, (times, values) in sampled.items():
                    channels.append({
                        'group': rig_id,
                        'path': path,
                        'times': times,
                        'values': values,
                        'interpolation': 'slerp' if path == 'rotation' else 'linear',
                    })
            entry = {
                'name': clip.name,
                'durationS': clip.duration_s,
                'loop': clip.loop,
                'endMode': clip.end_mode,
                'channels': channels,
            }
            if clip.overlay:
                entry['overlay'] = True
            clips.append(entry)

        bank = {
            'schema': 'spaceface.rigidMotionBank.v1',
            'rigId': self.rig_id,
            'sourceAssetId': self.source_asset_id,
            'sourceGlbSha256': _sha256(glb_paths[0]),
            'fps': 60,
            'bindings': bindings,
            'clips': clips,
        }
        if self.events:
            bank['events'] = dict(self.events)
        # newline='' keeps json.dump's \n literal — text mode would emit CRLF on Windows and
        # desync the byte/sha seals the render-package attests (canonical LF).
        with open(out_path, 'w', newline='') as f:
            json.dump(bank, f, indent=1)
            f.write('\n')
        size = os.path.getsize(out_path)
        print(f'[motion-bank] {out_path} {size}B rig={self.rig_id} clips={len(clips)} bindings={len(bindings)}')
        return bank
