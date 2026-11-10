import assert from 'node:assert/strict';
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

test('every modular hull routes new authoring through material truth and quarantines its legacy exporter', () => {
  const authoring = JSON.parse(readFileSync(
    resolve(ROOT, 'assets/ships/parts/blender/authoring.json'),
    'utf8',
  ));

  for (const id of HULL_IDS) {
    const entry = authoring.entries?.[id];
    assert.ok(entry, `${id} must have an authoring registry entry`);
    assert.equal(entry.texture_role_owner, 'modular-hull-texture-finalizer-v2');
    assert.equal(entry.texture_finalizer_status, 'canonical-glb-repair-only');
    assert.equal(entry.exporter_path, undefined, `${id} must not advertise a legacy current exporter`);
    assert.equal(
      entry.authoring_status,
      'legacy-source-requires-new-material-truth-authoring-packet',
    );
    assert.equal(entry.current_authoring_route, 'docs/visual-assets/README.md');
    assert.equal(
      entry.texture_finalizer_path,
      'tools/art/repair_modular_hull_texture_roles.mjs',
    );
    assert.ok(existsSync(resolve(ROOT, entry.blend_path)), `${id} editable .blend must exist`);
    assert.ok(
      existsSync(resolve(ROOT, entry.legacy_exporter_path)),
      `${id} legacy exporter must remain reproducible`,
    );
    assert.ok(existsSync(resolve(ROOT, entry.texture_finalizer_path)), `${id} finalizer must exist`);
  }
});

test('the historical Blender controller requires explicit replay and blocks modular promotion', () => {
  assert.ok(existsSync(resolve(ROOT, CONTROLLER_PATH)), 'legacy controller must exist');
  const controller = readFileSync(resolve(ROOT, CONTROLLER_PATH), 'utf8');
  assert.match(controller, /LEGACY FULL FINISH REPLAY BLOCKED/);
  assert.match(controller, /LegacyReplay/);
  assert.match(controller, /authoring\.json/);
  assert.match(controller, /texture_finalizer_path/);
  assert.match(controller, /texture_finalizer_status -ne 'blender-export-ready'/);
  assert.match(controller, /canonical-GLB repair-only/);
  assert.match(controller, /--input=\$tmp/);
  assert.match(controller, /--apply/);
  assert.match(controller, /texture-finalizer-report\.json/);
});

test('the retired full-finish exporter cannot masquerade as current authoring', () => {
  const exporter = resolve(ROOT, 'tools/art/blender/revamp_full_finish.py');
  const source = readFileSync(exporter, 'utf8');
  assert.match(source, /HISTORICAL \/ LEGACY REPLAY ONLY/);
  assert.match(source, /LEGACY FULL FINISH REPLAY BLOCKED/);
  assert.match(source, /--legacy-replay/);
  assert.match(source, /docs\/visual-assets\/README\.md/);
});
