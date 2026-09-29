import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PACK_ROOT, parseOptions, parseCanonicalRows, selectRows } from '../scripts/next-wave-read.mjs';

function fixture(t, build, inference) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-next-wave-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, PACK_ROOT), { recursive: true });
  fs.writeFileSync(path.join(root, PACK_ROOT, 'catalog.json'), JSON.stringify({
    schema: 'spaceface.next-wave.specifications.v1', is_live_queue: false,
    tasks: ['NXB-001', 'NXB-002', 'NXI-001', 'NXI-002'].map((id, i) => ({
      id, title: id, priority: i % 2 ? 'P1' : 'P0', initial_status: 'OPEN',
      dependency: id === 'NXI-002' ? 'NXB-001' : null, packet: `${PACK_ROOT}/${id}.md`, paths: ['src/owner.js'],
    })),
  }));
  fs.writeFileSync(path.join(root, 'build_map.md'), build);
  fs.writeFileSync(path.join(root, 'design/program/INFERENCE_IDEAS.md'), inference);
  return root;
}
const b = (id, status) => `| 159 | BUILD | [${id}](p.md) | Example | Existing | ${status} |\n`;
const i = (id, status) => `| [${id}](p.md) | Example | src/a.js | Done | Do not | ${status} |\n`;

test('CLI requires an unambiguous kind/mode and rejects unknown options', () => {
  assert.throws(() => parseOptions(['--kind', 'build']), /choose/);
  assert.throws(() => parseOptions(['--next', '--kind', 'unknown']), /must be/);
  assert.throws(() => parseOptions(['--next', '--ready', '--kind', 'build']), /exactly one/);
  assert.throws(() => parseOptions(['--id', 'PQ-018']), /expected/);
  assert.throws(() => parseOptions(['--oops']), /unknown/);
  assert.equal(parseOptions(['--id', 'NXI-002']).kind, 'inference');
});
test('ignores prose IDs and dependency IDs, handles CRLF', () => {
  const rows = parseCanonicalRows(('Prose NXB-002\n' + b('NXB-001', 'OPEN')).replace(/\n/g, '\r\n'), 'build');
  assert.deepEqual([...rows.keys()], ['NXB-001']);
});
test('rejects duplicate or malformed canonical rows', () => {
  assert.throws(() => parseCanonicalRows(b('NXB-001', 'OPEN') + b('NXB-001', 'DONE'), 'build'), /duplicate/);
  assert.throws(() => parseCanonicalRows('| [NXI-001](p) | bad | too | short |', 'inference'), /malformed/);
});
test('uses live SHIPPED instead of frozen initial OPEN', t => {
  const root = fixture(t, b('NXB-001', 'SHIPPED abc') + b('NXB-002', 'OPEN'), '');
  assert.deepEqual(selectRows(root, { kind: 'build', mode: 'next' }).tasks.map(t => t.id), ['NXB-002']);
});
test('WAITING does not auto-open when parent is DONE', t => {
  const root = fixture(t, b('NXB-001', 'DONE abc'), i('NXI-002', 'WAITING NXB-001'));
  assert.equal(selectRows(root, { kind: 'inference', mode: 'ready' }).tasks.length, 0);
});
test('a live explicitly opened child is eligible, without using snapshot status', t => {
  const root = fixture(t, b('NXB-001', 'DONE abc'), i('NXI-002', 'OPEN'));
  const result = selectRows(root, { kind: 'inference', mode: 'ready' });
  assert.equal(result.tasks[0].id, 'NXI-002');
  assert.equal(result.tasks[0].capabilityToVerify, 'NXB-001');
});
test('missing row is neither completion nor eligibility', t => {
  const root = fixture(t, '', '');
  assert.throws(() => selectRows(root, { kind: 'build', mode: 'id', id: 'NXB-001' }), /absence is not/);
});
test('CLAIMED, CUT and OPEN prose are not exact OPEN', t => {
  const root = fixture(t, b('NXB-001', 'CLAIMED agent') + b('NXB-002', 'OPEN pending review'), i('NXI-001', 'CUT reason'));
  assert.equal(selectRows(root, { kind: 'build', mode: 'ready' }).tasks.length, 0);
  assert.equal(selectRows(root, { kind: 'inference', mode: 'ready' }).tasks.length, 0);
});
test('selection does not write the canonical files', t => {
  const root = fixture(t, b('NXB-001', 'OPEN'), i('NXI-001', 'OPEN'));
  const before = fs.readFileSync(path.join(root, 'build_map.md'));
  selectRows(root, { kind: 'build', mode: 'ready' });
  assert.deepEqual(fs.readFileSync(path.join(root, 'build_map.md')), before);
});
