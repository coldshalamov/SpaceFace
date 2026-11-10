// Guard: every render package that seals a motion bank must point runtime.motionBank.uri at a
// file that exists under assets/ships/motions/. LOD pilots share their base ship's bank
// (kestrel-lod1/kestrel-lod2 -> kestrel.motion.json) — sealing pilot.key into the uri mints a
// dead reference that rejects the entire package load in prepareDecoded.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const PILOTS = JSON.parse(readFileSync('assets/ships/render-packages/pilots.json', 'utf8'));

test('every sealed runtime.motionBank.uri resolves to a real bank file', () => {
  const offenders = [];
  for (const pilot of PILOTS.pilots || []) {
    const metadataUrl = pilot.metadataUrl;
    if (!metadataUrl || !existsSync(metadataUrl)) continue;
    const pkg = JSON.parse(readFileSync(metadataUrl, 'utf8'));
    const ref = pkg.runtime && pkg.runtime.motionBank;
    if (!ref) continue;
    if (!existsSync(ref.uri)) {
      offenders.push(`${pilot.key}: ${ref.uri}`);
      continue;
    }
    // uri and hash must describe the same file — a uri that resolves but binds stale bytes
    // fails the same way at load time.
    const bytes = readFileSync(join(ref.uri));
    assert.equal(ref.sha256, createHash('sha256').update(bytes).digest('hex'),
      `${pilot.key} sealed sha256 must match the bank bytes`);
    assert.equal(ref.bytes, bytes.length, `${pilot.key} sealed byte count must match`);
    const bank = JSON.parse(bytes.toString('utf8'));
    assert.equal(bank.schema, 'spaceface.rigidMotionBank.v1', `${pilot.key} bank schema`);
    assert.equal(ref.rigId, bank.rigId, `${pilot.key} sealed rigId must match the bank`);
  }
  assert.deepEqual(offenders, [], `dead motionBank.uri references: ${offenders.join(', ')}`);
});
