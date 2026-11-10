import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { findRetiredAssertions, readBannedAssertionPhrases } from '../scripts/check-vision-assertions.mjs';

const oldBrake = ['should decay', 'toward the cap'].join(' ');
test('Only the brake spends earned momentum: old assertion wording fails the command', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sf-assertion-guard-'));
  try {
    const file = join(dir, 'old.test.mjs');
    writeFileSync(file, `assert.equal(speed, cap, '${oldBrake}');`);
    const result = spawnSync(process.execPath, ['scripts/check-vision-assertions.mjs', file], { encoding: 'utf8' });
    assert.equal(result.status, 1, 'The guard must reject an assertion that preserves earned-speed braking');
    assert.ok(result.stderr.includes(':1:'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('Historical comments and legitimate terrain scrape assertions remain allowed', () => {
  assert.deepEqual(findRetiredAssertions(`// ${oldBrake}\nassert.ok(scrape, 'a terrain scrape must not stagger');`, [oldBrake]), []);
  assert.equal(findRetiredAssertions(`assert.equal(speed, cap,\n '${oldBrake}');`, [oldBrake])[0].line, 2);
});
test('An absent governing phrase list cannot silently disable the guard', () => {
  assert.throws(() => readBannedAssertionPhrases(''), /Missing/);
  assert.throws(() => readBannedAssertionPhrases('<!-- assertion-guard:start --><!-- assertion-guard:end -->'), /empty/);
});
