import assert from 'node:assert/strict';
import test from 'node:test';

import { scanPhysicsWriterCandidates } from '../scripts/lib/physicsWriterAudit.mjs';

test('physics writer audit separates authority, compatibility, and review candidates', () => {
  const report = scanPhysicsWriterCandidates([
    {
      path: 'src/core/physics.js',
      source: 'entity.pos.x += entity.vel.x * dt;\nentity.rot = nextYaw;',
    },
    {
      path: 'src/systems/flight.js',
      source: 'entity.vel.x += thrust;\nqueuePhysicsImpulse(entity, impulse);',
    },
    {
      path: 'src/systems/teleport.js',
      source: '// entity.pos.x = 0;\nplayer.pos.z = destination.z;',
    },
  ]);

  assert.deepEqual(report.summary, {
    files: 3,
    candidates: 4,
    authority: 2,
    compatibility: 1,
    review: 1,
  });
  assert.deepEqual(report.candidates.map(({ path, line, category }) => ({ path, line, category })), [
    { path: 'src/core/physics.js', line: 1, category: 'authority' },
    { path: 'src/core/physics.js', line: 2, category: 'authority' },
    { path: 'src/systems/flight.js', line: 1, category: 'compatibility' },
    { path: 'src/systems/teleport.js', line: 2, category: 'review' },
  ]);
});

test('physics writer audit is a diagnostic candidate list, not a pass verdict', () => {
  const report = scanPhysicsWriterCandidates([
    { path: 'src/systems/example.js', source: 'body.vel.z *= drag;' },
  ]);
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.verdict, 'diagnostic-only');
  assert.match(report.candidates[0].expression, /body\.vel\.z/);
});
