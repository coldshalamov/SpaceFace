"""Run: python3 -m unittest discover -s test -p asset_bank_bounds_test.py."""
import copy
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import struct
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location('bounds', Path(__file__).resolve().parents[1] / 'tools/blender/forge/asset_bank_bounds.py')
bounds = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(bounds)


def fixture(points):
    binary = b'HEAD' + b''.join(struct.pack('<4f', *point, 99) for point in points)
    meta = {'bounds': {'min': [0]*3, 'max': [0]*3}, 'sockets': [{'name': 'end'}],
            'collision': {'type': 'none', 'solids': []}}
    doc = {'asset': {'version': '2.0', 'extras': {'spacefaceAsset': copy.deepcopy(meta)}},
           'scene': 0, 'scenes': [{'nodes': [0], 'extras': {'spacefaceAsset': copy.deepcopy(meta)}}],
           'nodes': [{'mesh': 0}], 'meshes': [{'primitives': [{'attributes': {'POSITION': 0}}]}],
           'buffers': [{'byteLength': len(binary)}],
           'bufferViews': [{'buffer': 0, 'byteOffset': 0, 'byteLength': len(binary), 'byteStride': 16}],
           'accessors': [{'bufferView': 0, 'byteOffset': 4, 'componentType': 5126, 'type': 'VEC3',
                          'count': len(points), 'min': [-999]*3, 'max': [999]*3}]}
    return doc, binary


def write_glb(path, doc, binary):
    payload = json.dumps(doc).encode()
    payload += b' ' * (-len(payload) % 4)
    body = struct.pack('<II', len(payload), bounds._JSON) + payload
    body += struct.pack('<II', len(binary), bounds._BIN) + binary
    path.write_bytes(struct.pack('<III', 0x46546C67, 2, 12+len(body)) + body)


class AssetBoundsTests(unittest.TestCase):
    def test_actual_vertices_offsets_and_stride(self):
        doc, binary = fixture([(-2, 1, 3), (4, -5, 6)])
        self.assertEqual(bounds.scene_vertex_bounds(doc, binary), {'min': [-2, -5, 3], 'max': [4, 1, 6]})

    def test_parent_rotation_nonuniform_scale_and_instances(self):
        doc, binary = fixture([(1, 0, 0), (0, 1, 0)])
        doc['nodes'] = [{'translation': [10, 0, 0], 'rotation': [0, 0, math.sqrt(.5), math.sqrt(.5)], 'children': [1]},
                        {'mesh': 0, 'scale': [2, 3, 1]}, {'mesh': 0, 'translation': [-5, 0, 0]},
                        {'mesh': 0, 'translation': [1000, 0, 0]}]
        doc['scenes'][0]['nodes'] = [0, 2]
        result = bounds.scene_vertex_bounds(doc, binary)
        for actual, expected in zip(result['min'] + result['max'], [-5, 0, 0, 10, 2, 0]):
            self.assertAlmostEqual(actual, expected)

    def test_matrix_transform(self):
        doc, binary = fixture([(1, 2, 3)])
        doc['nodes'][0]['matrix'] = [-2, 0, 0, 0, 0, 3, 0, 0, 0, 0, .5, 0, 5, 6, 7, 1]
        self.assertEqual(bounds.scene_vertex_bounds(doc, binary), {'min': [3, 12, 8.5], 'max': [3, 12, 8.5]})

    def test_union_stamps_all_lods_preserves_binary_and_metadata_and_refreshes_receipts(self):
        with tempfile.TemporaryDirectory() as directory:
            base = {'bounds': {'min': [0]*3, 'max': [0]*3}, 'lods': []}
            originals = []
            for level, extent in enumerate([1, 1.2, 1.4]):
                doc, binary = fixture([(-extent, 0, 0), (extent, 1, 1)])
                filename = 'part_lod%d.glb' % level
                write_glb(Path(directory)/filename, doc, binary)
                base['lods'].append({'level': level, 'file': filename, 'triangles': 12, 'bytes': 0, 'sha256': ''})
                originals.append((copy.deepcopy(doc['asset']['extras']['spacefaceAsset']), binary))
            bounds.finalize_asset_bounds(base, directory)
            self.assertAlmostEqual(base['bounds']['max'][0], 1.4, places=6)
            for lod, (original, binary) in zip(base['lods'], originals):
                path = Path(directory)/lod['file']
                doc, chunks = bounds._read_glb(path)
                self.assertEqual(chunks[1][1], binary)
                for meta in [doc['asset']['extras']['spacefaceAsset'], doc['scenes'][0]['extras']['spacefaceAsset']]:
                    self.assertEqual(meta['bounds'], base['bounds'])
                    meta.pop('bounds')
                    self.assertEqual(meta, {key: value for key, value in original.items() if key != 'bounds'})
                self.assertEqual(lod['bytes'], path.stat().st_size)
                self.assertEqual(lod['sha256'], hashlib.sha256(path.read_bytes()).hexdigest())
                self.assertEqual(lod['triangles'], 12)
            snapshots = [(Path(directory)/lod['file']).read_bytes() for lod in base['lods']]
            bounds.finalize_asset_bounds(base, directory)
            self.assertEqual(snapshots, [(Path(directory)/lod['file']).read_bytes() for lod in base['lods']])

    def test_rejects_unreachable_geometry_and_cycles(self):
        doc, binary = fixture([(0, 0, 0)])
        doc['scenes'][0]['nodes'] = []
        with self.assertRaisesRegex(ValueError, 'No reachable'):
            bounds.scene_vertex_bounds(doc, binary)
        doc['scenes'][0]['nodes'] = [0]
        doc['nodes'][0]['children'] = [0]
        with self.assertRaisesRegex(ValueError, 'cyclic'):
            bounds.scene_vertex_bounds(doc, binary)

    def test_rejects_nonfinite_and_unsupported_geometry(self):
        doc, binary = fixture([(float('nan'), 0, 0)])
        with self.assertRaisesRegex(ValueError, 'Nonfinite'):
            bounds.scene_vertex_bounds(doc, binary)
        doc, binary = fixture([(0, 0, 0)])
        doc['accessors'][0]['sparse'] = {'count': 1}
        with self.assertRaisesRegex(ValueError, 'nonsparse'):
            bounds.scene_vertex_bounds(doc, binary)
        doc['accessors'][0].pop('sparse')
        doc['bufferViews'][0]['byteLength'] = 4
        with self.assertRaisesRegex(ValueError, 'range'):
            bounds.scene_vertex_bounds(doc, binary)


if __name__ == '__main__':
    unittest.main()
