import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONTROLLER_PATH = 'tools/art/blender/run_full_finish_bar.ps1';
const HULL_IDS = [
  'hull_starter',
  'hull_fighter',
  'hull_miner',
  'hull_freighter',
  'hull_interceptor',
  'hull_corvette',
  'hull_frigate',
  'hull_capital',
  'hull_multirole',
  'hull_gunship',
];

test('every modular hull declares the canonical finalizer and blocks unproven Blender promotion', () => {
  const authoring = JSON.parse(readFileSync(
    resolve(ROOT, 'assets/ships/parts/blender/authoring.json'),
    'utf8',
  ));

  for (const id of HULL_IDS) {
    const entry = authoring.entries?.[id];
    assert.ok(entry, `${id} must have an authoring registry entry`);
    assert.equal(entry.texture_role_owner, 'modular-hull-texture-finalizer-v2');
    assert.equal(entry.texture_finalizer_status, 'canonical-glb-repair-only');
    assert.equal(
      entry.texture_finalizer_path,
      'tools/art/repair_modular_hull_texture_roles.mjs',
    );
    assert.ok(existsSync(resolve(ROOT, entry.blend_path)), `${id} editable .blend must exist`);
    assert.ok(existsSync(resolve(ROOT, entry.exporter_path)), `${id} exporter must exist`);
    assert.ok(existsSync(resolve(ROOT, entry.texture_finalizer_path)), `${id} finalizer must exist`);
  }
});

test('the Blender controller blocks modular promotion until exact Blender parity is proven', () => {
  assert.ok(existsSync(resolve(ROOT, CONTROLLER_PATH)), 'authoring controller must exist');
  const controller = readFileSync(resolve(ROOT, CONTROLLER_PATH), 'utf8');
  assert.match(controller, /authoring\.json/);
  assert.match(controller, /texture_finalizer_path/);
  assert.match(controller, /texture_finalizer_status -ne 'blender-export-ready'/);
  assert.match(controller, /canonical-GLB repair-only/);
  assert.match(controller, /--input=\$tmp/);
  assert.match(controller, /--apply/);
  assert.match(controller, /texture-finalizer-report\.json/);
});

test('the actual full-finish exporter classifies hull and place slots correctly', () => {
  const exporter = resolve(ROOT, 'tools/art/blender/revamp_full_finish.py');
  const probe = [
    'import ast, json, pathlib, sys',
    'tree = ast.parse(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))',
    'fn = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == "export_slot")',
    'scope = {}',
    'exec(compile(ast.Module(body=[fn], type_ignores=[]), sys.argv[1], "exec"), scope)',
    'print(json.dumps([scope["export_slot"]("hull_fighter"), scope["export_slot"]("place_dead_hulk")]))',
  ].join('; ');
  const output = execFileSync('python', ['-c', probe, exporter], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 10_000,
  });
  assert.deepEqual(JSON.parse(output), ['hull', 'place']);
});
