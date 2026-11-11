// fix-ghost-escape-pos — the ghost you failed to hold melts where it was, not nowhere.
//
// The deception loop's two endings both read (inf-ghost-resolve-read): the harden snaps at the
// hull, the escape melts. But the melt read the position through a live entity lookup, and the
// sim despawns an escaped ghost — so the lookup usually missed and the melt honestly skipped:
// a contact you failed to hold winked out with no answer on the glass. The emitter now stamps
// the ghost's last recorded position into the receipt (the truth, taken at emit time), and the
// consumer reads the live contact first, the receipt's stamp second, and nothing only when
// nobody ever knew where it was.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { ghostEscapePosition, ghostEscapePlan } from '../src/render/vfx/ghostResolveRead.js';

test('the melt reads the live contact first, the receipt stamp second, nowhere third', () => {
  const receipt = { entityId: 31, reason: 'beyond_escape_range', pos: { x: 120, z: -40 } };
  // A contact the sim has not despawned yet: its own (fresher) position wins.
  const contact = { pos: { x: 125, z: -38 } };
  assert.equal(ghostEscapePosition(receipt, contact), contact.pos, 'the live contact wins');
  // The usual case: the sim despawned the ghost — the receipt's stamp is the truth.
  const stamp = ghostEscapePosition(receipt, null);
  assert.equal(stamp, receipt.pos);
  assert.equal(stamp.x, 120);
  assert.equal(stamp.z, -40);
  // Nobody ever knew where it was: the honest skip, unchanged.
  assert.equal(ghostEscapePosition({ entityId: 31 }, null), null);
  assert.equal(ghostEscapePosition({ entityId: 31, pos: { x: NaN, z: 4 } }, null), null,
    'a corrupt stamp is no position');
  assert.equal(ghostEscapePosition(null, null), null);
});

test('the plan is untouched: the melt stays the dimmer, floor-kept dissolve', () => {
  const full = ghostEscapePlan(false);
  const reduced = ghostEscapePlan(true);
  assert.ok(full.dissolve.life > 0 && full.dissolve.life <= 0.95);
  assert.ok(reduced.dissolve.op0 > full.dissolve.op0, 'reduced motion keeps a floor, never silence');
});

test('both ends of the wire carry the stamp', () => {
  const scanner = readFileSync(new URL('../src/systems/scanner.js', import.meta.url), 'utf8');
  assert.match(scanner, /scanner:ghostEscaped[\s\S]{0,400}pos: \{ x: px, z: pz \}/,
    'the emitter stamps the last recorded position');
  const vfx = readFileSync(new URL('../src/render/vfx.js', import.meta.url), 'utf8');
  assert.match(vfx, /const pos = ghostEscapePosition\(p, contact\);/,
    'the melt reads the decision, live contact or stamp');
});
