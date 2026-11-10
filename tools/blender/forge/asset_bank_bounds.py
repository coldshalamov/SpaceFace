"""Truthful bind-pose bounds for Forge's uncompressed, static GLB exports.

Measure actual POSITION values in the selected scene, including every instance and
parent transform. A source mesh or LOD0 envelope cannot describe authored coarse LODs.
This module deliberately has no Blender dependency so its contract is unit-testable.
"""
import hashlib
import json
import math
import os
import struct

_JSON = 0x4E4F534A
_BIN = 0x004E4942
_IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]


def _read_glb(path):
    with open(path, 'rb') as stream:
        data = stream.read()
    magic, version, length = struct.unpack_from('<III', data)
    if magic != 0x46546C67 or version != 2 or length != len(data):
        raise ValueError('Invalid GLB header')
    chunks, offset = [], 12
    while offset < len(data):
        size, kind = struct.unpack_from('<II', data, offset)
        offset += 8
        if size % 4 or offset + size > len(data):
            raise ValueError('Invalid GLB chunk')
        chunks.append((kind, data[offset:offset + size]))
        offset += size
    if not chunks or chunks[0][0] != _JSON:
        raise ValueError('GLB must start with JSON')
    return json.loads(chunks[0][1]), chunks


def _multiply(a, b):
    return [sum(a[k * 4 + row] * b[col * 4 + k] for k in range(4))
            for col in range(4) for row in range(4)]


def _matrix(node):
    if 'matrix' in node:
        result = node['matrix']
    else:
        x, y, z, w = node.get('rotation', [0, 0, 0, 1])
        sx, sy, sz = node.get('scale', [1, 1, 1])
        tx, ty, tz = node.get('translation', [0, 0, 0])
        result = [(1-2*y*y-2*z*z)*sx, (2*x*y+2*z*w)*sx, (2*x*z-2*y*w)*sx, 0,
                  (2*x*y-2*z*w)*sy, (1-2*x*x-2*z*z)*sy, (2*y*z+2*x*w)*sy, 0,
                  (2*x*z+2*y*w)*sz, (2*y*z-2*x*w)*sz, (1-2*x*x-2*y*y)*sz, 0,
                  tx, ty, tz, 1]
    if len(result) != 16 or not all(math.isfinite(v) for v in result):
        raise ValueError('Invalid node transform')
    return result


def scene_vertex_bounds(doc, binary):
    """Read exported float32 positions, never accessor min/max approximations."""
    scenes = doc.get('scenes', [])
    scene_index = doc.get('scene', 0 if len(scenes) == 1 else None)
    if scene_index is None or not 0 <= scene_index < len(scenes):
        raise ValueError('Missing or ambiguous active scene')
    lo, hi, seen = [math.inf]*3, [-math.inf]*3, set()

    def visit(index, parent):
        if index in seen:
            raise ValueError('Repeated or cyclic scene node')
        seen.add(index)
        node = doc['nodes'][index]
        world = _multiply(parent, _matrix(node))
        if 'skin' in node:
            raise ValueError('Skinned assets need evaluated bind-pose geometry')
        if 'mesh' in node:
            for primitive in doc['meshes'][node['mesh']]['primitives']:
                if primitive.get('targets'):
                    raise ValueError('Morph assets need evaluated bind-pose geometry')
                accessor = doc['accessors'][primitive['attributes']['POSITION']]
                if (accessor.get('componentType') != 5126 or accessor.get('type') != 'VEC3'
                        or accessor.get('sparse') or accessor.get('normalized')):
                    raise ValueError('Expected nonsparse float32 VEC3 positions')
                view = doc['bufferViews'][accessor['bufferView']]
                if view.get('buffer', 0) != 0 or doc['buffers'][0].get('uri'):
                    raise ValueError('Expected embedded GLB position buffer')
                start = view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
                stride, count = view.get('byteStride', 12), accessor['count']
                end = start + (count - 1)*stride + 12
                if (count <= 0 or stride < 12 or start < view.get('byteOffset', 0)
                        or end > view.get('byteOffset', 0) + view['byteLength']
                        or end > len(binary)):
                    raise ValueError('Invalid position buffer range')
                for offset in range(start, start + count*stride, stride):
                    point = struct.unpack_from('<3f', binary, offset)
                    for axis in range(3):
                        value = sum(world[k*4+axis]*point[k] for k in range(3)) + world[12+axis]
                        if not math.isfinite(value):
                            raise ValueError('Nonfinite transformed vertex')
                        lo[axis], hi[axis] = min(lo[axis], value), max(hi[axis], value)
        for child in node.get('children', []):
            visit(child, world)

    for index in scenes[scene_index].get('nodes', []):
        visit(index, _IDENTITY)
    if not all(math.isfinite(v) for v in lo + hi):
        raise ValueError('No reachable geometry')
    return {'min': lo, 'max': hi}


def finalize_asset_bounds(base, out_dir):
    """After ALL LOD exports, stamp their shared union and refresh byte/hash receipts.

    Only bounds are changed in existing embedded metadata. Binary geometry, sockets,
    collision, material data and all other metadata retain their exported values.
    The caller writes the returned (in-place updated) manifest after this completes.
    """
    exports = []
    for lod in base['lods']:
        filename = lod['file']
        if os.path.basename(filename) != filename:
            raise ValueError('LOD file must be a basename')
        path = os.path.join(out_dir, filename)
        doc, chunks = _read_glb(path)
        binaries = [data for kind, data in chunks if kind == _BIN]
        if len(binaries) != 1:
            raise ValueError('Expected one GLB binary chunk')
        bounds = scene_vertex_bounds(doc, binaries[0])
        exports.append((lod, path, doc, chunks, bounds))
    if not exports:
        raise ValueError('No exported LODs')
    union = {key: [op(row[4][key][axis] for row in exports) for axis in range(3)]
             for key, op in [('min', min), ('max', max)]}
    for lod, path, doc, chunks, _ in exports:
        doc['asset']['extras']['spacefaceAsset']['bounds'] = union
        doc['scenes'][doc.get('scene', 0)]['extras']['spacefaceAsset']['bounds'] = union
        payload = json.dumps(doc, separators=(',', ':'), allow_nan=False).encode('utf8')
        payload += b' ' * (-len(payload) % 4)
        chunks[0] = (_JSON, payload)
        body = b''.join(struct.pack('<II', len(data), kind) + data for kind, data in chunks)
        data = struct.pack('<III', 0x46546C67, 2, len(body)+12) + body
        with open(path, 'wb') as stream:
            stream.write(data)
        lod['bytes'], lod['sha256'] = len(data), hashlib.sha256(data).hexdigest()
    base['bounds'] = union
    return base
