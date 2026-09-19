import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { planInstall, applyInstall, rollbackInstall, wireManifest } from '../../../tools/install.mjs';

// Minimal manifest is a signature fixture, NOT represented as a full production manifest.
const MANIFEST = `export const PRODUCTION_INIT_ORDER = Object.freeze(['core', 'world', 'encounterDirector', 'save']);
export const PRODUCTION_UPDATE_ORDER = Object.freeze(['world', 'encounterDirector', 'save']);
export const CALENDAR_CLOCK_IDS = Object.freeze(['world', 'encounterDirector', 'save']);\n`;
async function checkout(t, crlf = false) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'spaceface-tension-install-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  await fs.cp(new URL('../../../fixture/baseline/', import.meta.url), dir, { recursive: true });
  await fs.mkdir(path.join(dir, 'src/runtime'), { recursive: true });
  await fs.writeFile(path.join(dir, 'src/runtime/authoritativeSystemManifest.js'), MANIFEST);
  if (crlf) for (const name of ['src/core/registry.js', 'src/systems/encounterDirector.js']) {
    const file = path.join(dir, name); await fs.writeFile(file, (await fs.readFile(file, 'utf8')).replace(/\n/g, '\r\n'));
  }
  return dir;
}

test('installer preflights every file, wires all manifest arrays, is idempotent and rolls back exactly', async (t) => {
  const dir = await checkout(t), preflight = await planInstall(dir);
  assert.equal(preflight.plan.filter((r) => r.changed).length, 7);
  await assert.rejects(fs.access(path.join(dir, 'src/ai/tensionDirector.js')));
  const applied = await applyInstall(preflight); assert.equal(applied.changed, 7);
  const next = await planInstall(dir); assert(next.plan.every((r) => !r.changed));
  const manifest = await fs.readFile(path.join(dir, 'src/runtime/authoritativeSystemManifest.js'), 'utf8');
  assert.equal((manifest.match(/'tensionDirector', 'encounterDirector'/g) || []).length, 3);
  assert.equal((await rollbackInstall(applied.backup)).restored, 7);
  assert.equal(await fs.readFile(path.join(dir, 'src/runtime/authoritativeSystemManifest.js'), 'utf8'), MANIFEST);
  await assert.rejects(fs.access(path.join(dir, 'src/ai/tensionDirector.js')));
});
test('installer handles Windows CRLF and preserves unrelated checkout changes', async (t) => {
  const dir = await checkout(t, true), file = path.join(dir, 'src/core/registry.js');
  await fs.appendFile(file, '// unrelated newer checkout comment\r\n');
  const preflight = await planInstall(dir); await applyInstall(preflight);
  const text = await fs.readFile(file, 'utf8');
  assert(text.endsWith('// unrelated newer checkout comment\r\n'));
  assert(!text.replace(/\r\n/g, '').includes('\n'));
});
test('conflicting newer source fails without adding even the new modules', async (t) => {
  const dir = await checkout(t), file = path.join(dir, 'src/core/registry.js');
  await fs.writeFile(file, '// completely changed registry\n');
  await assert.rejects(planInstall(dir), /unique context not found/);
  await assert.rejects(fs.access(path.join(dir, 'src/ai/tensionDirector.js')));
  assert.equal(await fs.readFile(file, 'utf8'), '// completely changed registry\n');
});
test('checkout changes after preflight and modified-source rollback are refused', async (t) => {
  const dir = await checkout(t), plan = await planInstall(dir), file = path.join(dir, 'src/core/registry.js');
  await fs.appendFile(file, '// edit during preflight\n');
  await assert.rejects(applyInstall(plan), /changed after preflight/);
  const applied = await applyInstall(await planInstall(dir));
  await fs.appendFile(file, '// valuable work after installation\n');
  await assert.rejects(rollbackInstall(applied.backup), /changed since install/);
});
test('manifest wiring refuses duplicate or wrong-order identities and is exact when already wired', () => {
  assert.equal(wireManifest(wireManifest(MANIFEST)), wireManifest(MANIFEST));
  assert.throws(() => wireManifest(MANIFEST.replace("'core', 'world'", "'tensionDirector', 'world'")), /not immediately/);
  assert.throws(() => wireManifest(MANIFEST.replace("'core', 'world'", "'encounterDirector', 'world'")), /Ambiguous/);
});
test('installer refuses a symlinked source destination', async (t) => {
  const dir = await checkout(t);
  try { await fs.symlink(os.tmpdir(), path.join(dir, 'src/ai')); }
  catch (error) {
    if (process.platform === 'win32' && error.code === 'EPERM') { t.skip('Windows symlink permission unavailable'); return; }
    throw error;
  }
  await assert.rejects(planInstall(dir), /Refusing symlink/);
});
