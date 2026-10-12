import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { parseArgs, runOutputDirectory } from '../scripts/player-truth/run.mjs';

// The real gate runs idle then active. A custom output root must retain both receipts.
test('a custom multi-pass output keeps the idle verdict and contact sheet when the active pass starts', () => {
  const taskDir = mkdtempSync(path.join(os.tmpdir(), 'spaceface-player-truth-output-'));
  try {
    const args = parseArgs(['--mode=swarm', '--gate', `--out=${taskDir}`]);
    const idle = runOutputDirectory(args, 'swarm-idle', true);
    const active = runOutputDirectory(args, 'swarm-active', true);
    assert.notEqual(idle, active);
    mkdirSync(idle, { recursive: true });
    writeFileSync(path.join(idle, 'verdict.md'), 'idle FAIL');
    writeFileSync(path.join(idle, 'contact-sheet.jpg'), 'idle rendered evidence');
    rmSync(active, { recursive: true, force: true }); mkdirSync(active, { recursive: true });
    writeFileSync(path.join(active, 'verdict.md'), 'active INCOMPLETE');
    assert.equal(readFileSync(path.join(idle, 'verdict.md'), 'utf8'), 'idle FAIL');
    assert.equal(readFileSync(path.join(idle, 'contact-sheet.jpg'), 'utf8'), 'idle rendered evidence');
    assert.equal(path.dirname(idle), taskDir);
    assert.equal(path.dirname(active), taskDir);
  } finally {
    assert.ok(path.resolve(taskDir).startsWith(path.resolve(os.tmpdir()) + path.sep));
    rmSync(taskDir, { recursive: true, force: true });
  }
});

test('a single player-truth run preserves the exact requested output directory', () => {
  const args = parseArgs(['--mode=adventure', '--headed', '--gate', '--out=.devshots/pr-maturation/player-truth/adventure']);
  assert.equal(runOutputDirectory(args, 'adventure', false), path.resolve(args.out));
  assert.equal(args.duration, 300); assert.equal(args.viewport, '1280x720');
});
