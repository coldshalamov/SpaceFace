// INFERENCE (WF-14) — the target panel previews the price on a hull when, and only
// when, the kill would actually pay campaign credits: the same rewardEligibility
// gates combat settles through, read through the production spawn path.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { targetBountyPreview } from '../src/ui/targetPanel.js';
import { targetFrameHtml } from '../src/ui/views/targetFrame.js';

test('payable bounties preview, reserved ones stay silent', () => {
  assert.equal(targetBountyPreview(null), 0);
  assert.equal(targetBountyPreview({ type: 'ship', data: {} }), 0, 'no bounty staged');
  assert.equal(targetBountyPreview({ type: 'ship', data: { bountyCr: 0 } }), 0);
  assert.equal(targetBountyPreview({ type: 'ship', data: { bountyCr: 450 } }), 450);
  assert.equal(targetBountyPreview({ type: 'drone', data: { bountyCr: 125.6 } }), 126, 'rounds like the grant');
  assert.equal(targetBountyPreview({ type: 'ship', data: { bountyCr: -30 } }), 0, 'never negative');
  // Mission-owned targets settle through missions, never the generic bounty path.
  assert.equal(targetBountyPreview({ type: 'ship', data: { bountyCr: 500, missionId: 'm1' } }), 0);
  assert.equal(targetBountyPreview({ type: 'ship', data: { bountyCr: 500, missionTag: 'hit' } }), 0);
  assert.equal(targetBountyPreview({ type: 'ship', data: { bountyCr: 500, missionPinned: true } }), 0);
  assert.equal(targetBountyPreview({ type: 'ship', flags: { missionPinned: true }, data: { bountyCr: 500 } }), 0);
  // Survival bodies pay the run wallet, never campaign credits.
  assert.equal(targetBountyPreview({ type: 'ship', data: { bountyCr: 500, runCohort: 'survival' } }), 0);
});

test('a production hunter spawn previews its staged captain bounty', () => {
  const sim = createSimulation({ seed: 90210, systems: [encounterDirector] });
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, mass: 100, hull: 100, hullMax: 100,
    data: { intent: {}, ai: {} },
  });
  sim.state.playerId = player.id;
  sim.state.mode = 'flight';
  sim.state.world.currentSectorId = 'sector_io_reach';
  const director = sim.registry.get('encounterDirector');
  const result = director.requestAuthoredEncounter({
    shapeId: 'named_hunter', encounterId: 'bounty-preview:one',
    sectorId: 'sector_io_reach', anchor: { x: 0, z: 0 }, force: true,
  });
  assert.equal(result.ok, true);
  const live = sim.state.encounterDirector.live['bounty-preview:one'];
  const bossId = Object.keys(live.roles).find((key) => live.roles[key] === 'boss');
  const boss = sim.state.entities.get(Number(bossId));
  assert.ok(boss.data.bountyCr > 0, 'the encounter stages a captain bounty');
  assert.equal(targetBountyPreview(boss), boss.data.bountyCr, 'preview reads the staged figure exactly');
  // Tagging the same hull mission-owned silences the preview without touching the figure.
  boss.data.missionId = 'contract-1';
  assert.equal(targetBountyPreview(boss), 0);
  assert.ok(boss.data.bountyCr > 0, 'the staged figure itself is untouched');
});

test('the panel frame carries a gold bounty row', () => {
  const html = targetFrameHtml();
  assert.match(html, /sf-target__bounty/);
  assert.match(html, /var\(--k-gold\)/);
});
