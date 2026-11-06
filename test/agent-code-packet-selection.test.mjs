import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const py = path.join(root, 'scripts/lib/agent_code_packet_selection.py');

function runTree(tree) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-acp-'));
  const file = path.join(dir, 'tree.json');
  fs.writeFileSync(file, JSON.stringify(tree));
  const r = spawnSync('python3', [py, '--tree-json', file], { encoding: 'utf8' });
  return r;
}

test('agent-code-packet selection omits archive/probe bulk and stays under ceiling on a toy tree', () => {
  const tree = {
    truncated: false,
    tree: [
      { type: 'blob', path: 'src/render/renderer.js', size: 1000 },
      { type: 'blob', path: 'artifacts/scene-truth/report.json', size: 5_000_000 },
      { type: 'blob', path: 'design/archive/old/INDEX.html', size: 4_000_000 },
      { type: 'blob', path: 'design/program/vm-drop/x/note.md', size: 100 },
      { type: 'blob', path: 'review/preimage/src/x.js', size: 50_000 },
      { type: 'blob', path: 'src/localization/catalogs/en-US.generated.js', size: 3_000_000 },
      { type: 'blob', path: 'trace.cpuprofile', size: 2_000_000 },
      { type: 'blob', path: 'suite.log', size: 1_000_000 },
      { type: 'blob', path: 'assets/ships/a/render-package.json', size: 500 },
      { type: 'blob', path: 'huge.bin', size: 9_000_000 },
    ],
  };
  const r = runTree(tree);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.match(r.stdout, /selected_bytes=1500\b/);
  assert.match(r.stdout, /PASS:/);
});

test('agent-code-packet selection fails closed when selected bytes exceed the ceiling', () => {
  // One eligible 257 MiB text blob (over 256 MiB ceiling, under 8 MiB? no - must be <=8MiB each)
  // So many 7 MiB files.
  const blobs = [];
  for (let i = 0; i < 40; i++) {
    blobs.push({ type: 'blob', path: `src/pad/file${i}.js`, size: 7 * 1024 * 1024 });
  }
  const r = runTree({ truncated: false, tree: blobs });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /above the .*byte agent-packet ceiling/);
});

test('agent-code-packet selection rejects a truncated GitHub tree', () => {
  const r = runTree({ truncated: true, tree: [] });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /truncated/i);
});
