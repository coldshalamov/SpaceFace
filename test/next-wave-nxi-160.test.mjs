// NXI-160 — a chase follows the new actual cargo owner.
// Parent NXB-040 commits a handover by actual custody: the lot's real current carrier is the
// entity the custody stamp names, never the hull that used to hold it. This file exercises the
// exact case through the existing owner (encounterScripts scripted convoy predation): the
// moment the carrier's manifest is sold off and custody restamps to the player's hold, the
// bound chase releases — it cannot keep hunting the emptied hull "as though it still carries
// the sold cargo", and it never retargets the player's hold. A neighboring legitimate chase
// still binds while the carrier actually holds, and the sale cannot launder an earlier take:
// the raider's already-secured loot stays aboard and the new-carrier stamp is not reverted.
import assert from 'node:assert/strict';
import test from 'node:test';

import { isAuthorizedPredationRelation, isHostileForAI } from '../src/ai/engagementAuthority.js';
import { createSimulation } from '../src/core/sim.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';

const SECTOR_ID = 'sector_tethys_junction';
const ENCOUNTER_ID = 'nxi160:curtain-convoy';
const ANCHOR = Object.freeze({ x: 6200, z: 4800 });

function boot(seed = 4242) {
  const sim = createSimulation({ seed, systems: [spawnBudget, encounterDirector] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = SECTOR_ID;
  state.story.beatIndex = 7;
  const player = sim.spawn({
    type: 'ship',
    team: 0,
    pos: { x: ANCHOR.x - 900, z: ANCHOR.z + 200 },
    vel: { x: 0, z: 0 },
    hull: 200,
    hullMax: 200,
    radius: 8,
    data: { intent: {}, ai: {} },
  });
  state.playerId = player.id;
  const events = { cleared: [], engaged: [] };
  bus.on('encounter:predationCleared', (payload) => events.cleared.push(payload));
  bus.on('encounter:predationEngaged', (payload) => events.engaged.push(payload));
  return { sim, state, bus, player, events, director: sim.registry.get('encounterDirector') };
}

function compareIds(a, b) {
  const an = Number(a.id);
  const bn = Number(b.id);
  return Number.isFinite(an) && Number.isFinite(bn) && an !== bn
    ? an - bn
    : String(a.id).localeCompare(String(b.id));
}

function fire(harness, encounterId = ENCOUNTER_ID) {
  const result = harness.director.requestAuthoredEncounter({
    shapeId: 'curtain_convoy',
    encounterId,
    sectorId: SECTOR_ID,
    anchor: { ...ANCHOR },
    zoneType: 'trade_lane',
    zoneRadius: 800,
    force: true,
  });
  assert.deepEqual(result, { ok: true, encounterId });
  const live = harness.state.encounterDirector.live[encounterId];
  assert.ok(live, 'authored route remains live after materialization');
  return live;
}

function actors(harness, live) {
  const entities = harness.state.entities;
  const haulers = live.ids
    .filter((id) => live.roles[id] === 'hauler')
    .map((id) => entities.get(id))
    .filter(Boolean)
    .sort(compareIds);
  return {
    haulers,
    target: entities.get(live.data.predationTargetId),
    raider: entities.get(live.data.predationRaiderId),
  };
}

function activate(harness, live) {
  const waitS = Math.max(2.1, live.data.predationNoFireUntil - harness.state.simTime + 1.1);
  harness.sim.runTicks(Math.ceil(waitS * 60));
  assert.equal(live.data.predationStatus, 'active', 'the response window opens the exact relation');
  return actors(harness, live);
}

test('NXI-160: a live chase still binds the carrier that actually holds the lot', () => {
  // The neighboring legitimate success: while the manifest stays in the original hull's
  // custody, the pursuit keeps the exact raider→carrier relation — nothing here stands
  // down early, and the player's hold is never the bound target.
  const harness = boot(4242);
  const live = fire(harness);
  const { target, raider } = activate(harness, live);

  assert.equal(isAuthorizedPredationRelation(harness.state, raider, target), true);
  assert.equal(isHostileForAI(harness.state, raider, target), true,
    'the chase stays on the hull that actually carries the lot');
  assert.equal(raider.data.ai.activity.targetId, target.id,
    'the pursuit objective binds the live carrier, not a position or a stale id');
  assert.equal(isHostileForAI(harness.state, raider, harness.player), false,
    'even a live chase never treats the player as the carrier');
});

test('NXI-160: after the lot sells to the player the chase releases — no hunt of the emptied hull or the player hold', () => {
  const harness = boot(4242);
  const live = fire(harness);
  const { target, raider } = activate(harness, live);
  const manifest = target.data.cargoManifest;
  assert.ok(manifest.lines.some((line) => line.qty > 0), 'the carrier still holds the lot');

  // The raider already carries an earlier take — "previous offenses" the sale must not erase.
  raider.data.ai.stolenLoot = {
    lines: [{ commodityId: 'cmdty_stolen_goods', qty: 3 }],
    victimId: 'prior:victim',
    manifestId: 'prior:manifest',
  };

  // The parent handover: the lot leaves the hull (hold empties) and the custody ledger
  // restamps the lot's real current carrier — the player's hold.
  for (const line of manifest.lines) line.qty = 0;
  manifest.totalQty = 0;
  target.data.freightCustody = {
    ...target.data.freightCustody,
    status: 'transferred',
    carrierId: harness.player.id,
  };
  harness.sim.runTicks(61);

  assert.equal(live.data.predationStatus, 'cleared', 'the chase ends on custody transfer');
  assert.equal(live.data.predationEndReason, 'custody_changed', 'the receipt names the sale');
  assert.equal(harness.events.cleared.length, 1, 'the release settles exactly once');
  assert.equal(harness.events.cleared[0].raiderId, raider.id);
  assert.equal(harness.events.cleared[0].targetId, target.id);
  assert.equal(isAuthorizedPredationRelation(harness.state, raider, target), false);
  assert.equal(isHostileForAI(harness.state, raider, target), false,
    'the emptied hull is not hunted as though it still carries the sold cargo');
  assert.equal(isHostileForAI(harness.state, raider, harness.player), false,
    'the chase does not retarget the player hold that now owns the lot');
  assert.equal(raider.data.ai.passive, true, 'the released raider stands down');
  assert.equal(raider.data.ai.activity && raider.data.ai.activity.targetId, null,
    'no pursuit objective remains pointed at either carrier');

  // A sale cannot launder what was already taken: the raider's earlier secured take stays
  // aboard, and the new-carrier stamp on the emptied hull is not reverted by the release.
  assert.deepEqual(raider.data.ai.stolenLoot.lines, [{ commodityId: 'cmdty_stolen_goods', qty: 3 }],
    'prior take survives the sale intact');
  assert.equal(target.data.freightCustody.carrierId, harness.player.id,
    'the release honors the restamped owner instead of rolling the sale back');
  assert.equal(target.data.freightCustody.status, 'transferred');

  harness.sim.runTicks(180);
  assert.equal(harness.events.cleared.length, 1, 'the release stays settled — nothing re-opens the stale chase');
});
