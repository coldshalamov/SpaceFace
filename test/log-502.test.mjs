// Row 502 (W-LOG): LOG — the physics narrator. Cause-aware one-line register; silent in
// terminal zones; reads with sound off.
import test from 'node:test';
import assert from 'node:assert/strict';
import { physicsLogLine, physicsLogSilent, PHYSICS_LOG_EVENTS } from '../src/data/physicsLog.js';

test('impact kills read as projectile reclassifications with tonnage', () => {
  assert.match(physicsLogLine('combat:kill', { cause: 'impact', victimName: 'reaver-2', impactMass: 640 }),
    /REAVER-2 RECLASSIFIED: PROJECTILE — 640t/);
  assert.equal(physicsLogLine('combat:kill', { cause: 'gun' }), null, 'ordinary gun kills stay quiet');
  assert.match(physicsLogLine('entity:killed', { cause: 'impact', name: 'hulk' }), /DEBRIS/);
});

test('throws, liens, deliveries and records all narrate in the register voice', () => {
  assert.match(physicsLogLine('tether:releaseRated', { classification: 'clean', tonnageU: 42 }), /LINE RELEASED 42t/);
  assert.match(physicsLogLine('vael:lienClamped'), /LIEN ATTACHED/);
  assert.match(physicsLogLine('vael:lienThrown'), /LIEN TRANSFERRED/);
  assert.match(physicsLogLine('cargo:delivered', { tonnage: 12, destination: 'Tethys' }), /12t DELIVERED — TETHYS/);
  assert.match(physicsLogLine('lossLedger:recorded'), /LOSS RECORDED/);
  assert.match(physicsLogLine('mail:delivered'), /MAIL/);
});

test('silent in terminal zones and on unknown events', () => {
  for (const mode of ['gameover', 'debrief', 'dead', 'crash']) {
    assert.equal(physicsLogSilent({ mode }), true, mode);
  }
  assert.equal(physicsLogSilent({ mode: 'flight' }), false);
  assert.equal(physicsLogSilent({ player: { dead: true } }), true);
  assert.equal(physicsLogLine('something:else', {}), null);
  assert.ok(PHYSICS_LOG_EVENTS.length >= 10, 'the feed covers the authored causes');
});
