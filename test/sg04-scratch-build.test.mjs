import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('SG-04 scratch mode rejects live input, existing output, and live-build flags', () => {
  const dir = mkdtempSync(resolve('.devshots/sg04-scratch-test-'));
  const input = join(dir, 'in.glb'), output = join(dir, 'out.glb');
  writeFileSync(input, 'input'); writeFileSync(output, 'preserve');
  const base = ['scripts/build-sg04-release-assets.mjs', '--only=wholeship_drifter_production_v1'];
  const run = args => spawnSync(process.execPath, [...base, ...args], { encoding: 'utf8' });
  try {
    for (const args of [
      [`--scratch-source=${resolve('assets/ships/parts/wholeships/drifter_production_v1.glb')}`, `--scratch-output=${join(dir, 'new.glb')}`],
      [`--scratch-source=${input}`, `--scratch-output=${output}`],
      [`--scratch-source=${input}`, `--scratch-output=${join(dir, 'new.glb')}`, '--no-clean'],
    ]) assert.notEqual(run(args).status, 0);
    assert.equal(readFileSync(output, 'utf8'), 'preserve');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
