#!/usr/bin/env node
// Replayable evidence, not a fabricated production performance/physics benchmark.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { playStyle, steeringProbe } from './nemesis/harness.mjs';
import { inferPlayerModel } from '../src/nemesis/learning.js';
import { NEMESIS_RIVAL, NEMESIS_KITS, NEMESIS_CHAPTERS } from '../src/data/nemesisRival.js';
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function runFixture(seed = 4242) {
  const campaigns = [['massline-pilot', 'fling'], ['ordnance-pilot', 'explosive']].map(([id, style]) => {
    const t = playStyle(style, seed), a = t.state.nemesis.active;
    const boss = t.state.entities.get(a.bossId);
    const encounters = t.rows.filter((row) => row.event === 'nemesis:engaged').map(({ payload: p }) => {
      const kit = NEMESIS_KITS[p.plan.primary];
      return { encounterId: p.encounterId, chapter: p.plan.chapter, title: NEMESIS_CHAPTERS[p.plan.chapter].title,
        kit: p.plan.primary, bossArchetype: kit.bossArchetype, escortArchetype: kit.escortArchetype,
        doctrine: kit.doctrineId, counterBudget: p.plan.counterBudget, level: p.plan.level,
        tell: kit.tell, opening: kit.opening, reason: p.plan.reason,
        confidence: p.plan.confidence, evidenceUnits: p.plan.evidenceUnits, t: p.t };
    });
    const steering = steeringProbe(t);
    boss.hull = 60; t.advance(0.3); boss.hull = 30; t.advance(0.3); boss.hull = 17; t.advance(0.3);
    if (style === 'fling') t.bus.emit('nemesis:spare', { encounterId: a.id });
    else { boss.hull = 0; boss.alive = false; t.kill('explosive', boss.id); }
    t.tick();
    return { id, inputStyle: style, seed, encounters, finalModel: inferPlayerModel(t.state.nemesis.episodes),
      steering, ending: t.state.nemesis.ending, rngCalls: t.rngCalls(),
      simulatedSeconds: t.state.simTime, stateBytes: Buffer.byteLength(JSON.stringify(t.engine.serialize())),
      dialogue: t.rows.filter((row) => row.event === 'nemesis:voice').map((row) => row.payload),
      transcript: t.rows, transcriptSha256: hash(t.rows), stateSha256: hash(t.engine.serialize()) };
  });
  assert.notEqual(campaigns[0].encounters[1].bossArchetype, campaigns[1].encounters[1].bossArchetype);
  assert.notDeepEqual(campaigns[0].steering, campaigns[1].steering);
  return { formatVersion: 1, evidenceClass: 'focused-explicit', seed,
    limitations: ['Not a production-manifest run.', 'Catalogue calls verified; production spawn builder not executed.',
      'Damage and separation are fixture inputs, not proof of combat balance.',
      'Trajectory is a kinematic probe using the shipped maneuver policy, not the production physics kernel.'],
    character: NEMESIS_RIVAL, campaigns };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const seedIndex = process.argv.indexOf('--seed');
    const seed = seedIndex < 0 ? 4242 : Number(process.argv[seedIndex + 1]);
    if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('--seed must be a uint32');
    const report = runFixture(seed), repeat = runFixture(seed);
    assert.deepEqual(report, repeat, 'Replay must be byte-stable across repeated runs');
    const index = process.argv.indexOf('--output');
    if (index >= 0) {
      const output = process.argv[index + 1]; if (!output || output.startsWith('--')) throw new Error('--output requires a path');
      fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
      fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
      console.log(`Wrote ${output}`);
    }
    for (const c of report.campaigns) {
      console.log(`\n${c.id}: ${c.encounters.map((e) => e.kit).join(' -> ')}; ending=${c.ending}`);
      console.log(`  ${c.encounters[1].bossArchetype}; ${c.encounters[1].doctrine}`);
      console.log(`  state=${c.stateBytes} bytes; RNG calls=${c.rngCalls}`);
      console.log(`  transcript SHA-256 ${c.transcriptSha256}`);
    }
    console.log('\nRepeated fixed-seed runs matched. See report limitations before interpreting this evidence.');
  } catch (error) { console.error(error.stack); process.exitCode = 1; }
}
