"""Exporter cost arithmetic only; these tests do not execute Blender."""
import copy
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('asset_bank_cost', Path(__file__).resolve().parents[1] / 'tools/blender/forge/asset_bank_cost.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

def fixture():
    return {'scene': 0, 'scenes': [{'nodes': [0]}], 'nodes': [{'mesh': 0}],
            'meshes': [{'primitives': [{'attributes': {'POSITION': 0}, 'indices': 1}]}],
            'accessors': [{'type': 'VEC3', 'count': 3}, {'type': 'SCALAR', 'count': 3}]}

class SceneCostTests(unittest.TestCase):
    def test_indexed_and_nonindexed(self):
        doc = fixture()
        self.assertEqual(module.scene_cost(doc), {'triangles': 1, 'draws': 1})
        del doc['meshes'][0]['primitives'][0]['indices']
        self.assertEqual(module.scene_cost(doc), {'triangles': 1, 'draws': 1})
    def test_mesh_instances(self):
        doc = fixture(); doc['nodes'].append({'mesh': 0}); doc['scenes'][0]['nodes'].append(1)
        self.assertEqual(module.scene_cost(doc), {'triangles': 2, 'draws': 2})
    def test_orphans_ignored(self):
        doc = fixture(); doc['meshes'].append(copy.deepcopy(doc['meshes'][0]))
        self.assertEqual(module.scene_cost(doc)['triangles'], 1)
    def test_children_counted(self):
        doc = fixture(); doc['nodes'] = [{'children': [1]}, {'mesh': 0}]
        self.assertEqual(module.scene_cost(doc)['draws'], 1)
    def test_default_scene_selection(self):
        doc = fixture(); doc['scenes'].append({'nodes': []})
        self.assertEqual(module.scene_cost(doc)['draws'], 1)
        del doc['scene']
        with self.assertRaises(ValueError): module.scene_cost(doc)
    def test_single_scene_without_default(self):
        doc = fixture(); del doc['scene']
        self.assertEqual(module.scene_cost(doc)['draws'], 1)
    def test_cycles_rejected(self):
        doc = fixture(); doc['nodes'][0]['children'] = [0]
        with self.assertRaisesRegex(ValueError, 'cyclic'): module.scene_cost(doc)
    def test_invalid_indices_rejected(self):
        for bad in [-1, True, None, 99]:
            with self.subTest(index=bad):
                doc = fixture(); doc['nodes'][0]['mesh'] = bad
                with self.assertRaises(ValueError): module.scene_cost(doc)
    def test_invalid_triangle_counts(self):
        for bad in [0, 4, 1.5, True, None]:
            with self.subTest(count=bad):
                doc = fixture(); doc['accessors'][1]['count'] = bad
                with self.assertRaisesRegex(ValueError, 'triangle'): module.scene_cost(doc)
    def test_no_reachable_geometry(self):
        doc = fixture(); doc['scenes'][0]['nodes'] = []
        with self.assertRaisesRegex(ValueError, 'No reachable'): module.scene_cost(doc)
    def test_nontriangle_mode(self):
        doc = fixture(); doc['meshes'][0]['primitives'][0]['mode'] = 1
        with self.assertRaisesRegex(ValueError, 'triangle'): module.scene_cost(doc)
    def test_position_type(self):
        doc = fixture(); doc['accessors'][0]['type'] = 'VEC2'
        with self.assertRaisesRegex(ValueError, 'VEC3'): module.scene_cost(doc)

if __name__ == '__main__': unittest.main()
