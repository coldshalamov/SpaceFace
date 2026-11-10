// NXB-007 — one physical kill leaves exactly one readable legal and salvage aftermath.
//
// Route proof for the parent contract: a thrown collision kill of a witnessed,
// manifest-carrying civilian must produce
//   * ONE law receipt whose kind keys off the physical cause (reckless_kill, not a gun kill)
//   * the outcome receipt naming the move while the record keeps the responsible actor
//   * ONE durable wreck marker
//   * ONE tetherable manifest payload (the whole cargo as one body, not a shard burst)
// and a replayed entity:killed (stale relay / re-emitted event) must not mint a second
// of any of them — the stored receipt republishes, the marker dedupes, the drop stamp holds.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { MASSLINE2_FLAGS } from '../src/data/featureFlags.js';
import { lawSecurity } from '../src/systems/lawSecurity.js';
import { heat } from '../src/systems/heat.js';
import { aftermathWrecks, aftermathForSector } from '../src/systems/aftermathWrecks.js';
import { lootShards, CIVILIAN_MANIFEST_PAYLOAD_TYPE } from '../src/systems/lootShards.js';
import { combatOutcome } from '../src/systems/combatOutcome.js';

const SEED = 77007;
const SECTOR = 'sector_tethys_junction';

function civilianManifest() {
  return {
    manifestId: 'fm_nxb007_haul',
    freighterKey: 'nxb007:hauler:0',
    role: 'hauler',
    lines: [
      { commodityId: 'cmdty_food', qty: 5 },
      { commodityId: 'cmdty_fuel_cells', qty: 3 },
    ],
    totalQty: 8,
  };
}

function boot() {
  const priorFlags = { enabled: MASSLINE2_FLAGS.enabled, lootShards: MASSLINE2_FLAGS.lootShards };
  MASSLINE2_FLAGS.enabled = true;
  MASSLINE2_FLAGS.lootShards = true;

  const voices = [];
  const sim = createSimulation({
    seed: SEED,
    systems: [lawSecurity, heat, aftermathWrecks, lootShards, combatOutcome],
    helpers: {
      voice: { say(payload) { voices.push(structuredClone(payload)); return true; } },
    },
  });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = SECTOR;
  state.world.sectors[SECTOR] = { id: SECTOR, factionId: 'faction_scn', security: 0.9, tier: 0 };
  state.player.heat = 0;
  state.player.credits = 5000;

  const player = sim.spawn({ type: 'ship', team: 0, pos: { x: 250, z: 10 }, hull: 200, hullMax: 200, radius: 8 });
  state.playerId = player.id;

  const receipts = [];
  const lawResponses = [];
  bus.on('law:reportIncidentReceipt', (p) => receipts.push(structuredClone(p)));
  bus.on('law:killedAdjudicated', (p) => lawResponses.push(structuredClone(p)));

  const restore = () => {
    MASSLINE2_FLAGS.enabled = priorFlags.enabled;
    MASSLINE2_FLAGS.lootShards = priorFlags.lootShards;
    sim.dispose();
  };
  return { sim, state, bus, player, voices, receipts, lawResponses, restore };
}

function lawfulWitness(run, pos = { x: 120, z: 0 }) {
  return run.sim.spawn({
    type: 'ship', team: 2, factionId: 'faction_scn',
    pos: { x: pos.x, z: pos.z }, hull: 80, hullMax: 80, radius: 8,
    data: { ai: { lawful: true } },
  });
}

function collisionKillPayload(run, victim, overrides = {}) {
  return {
    id: victim.id,
    killerId: run.state.playerId,
    type: 'ship',
    victimClass: (victim.data && victim.data.shipClass) || 'hauler',
    factionId: victim.factionId,
    pos: { x: victim.pos.x, z: victim.pos.z },
    sectorId: SECTOR,
    presentation: { cause: 'ship_collision', surface: 'craft', playerCaused: true },
    ...overrides,
  };
}

function manifestPayloads(state) {
  return state.entityList.filter((e) => e && e.data && e.data.payloadType === CIVILIAN_MANIFEST_PAYLOAD_TYPE);
}

test('a witnessed civilian collision kill mints exactly one charge, one marker, one payload', () => {
  const run = boot();
  try {
    lawfulWitness(run);
    const victim = run.sim.spawn({
      type: 'ship', team: 2, factionId: 'faction_free',
      pos: { x: 80, z: 0 }, hull: 40, hullMax: 40, radius: 8,
      data: {
        shipClass: 'hauler', name: 'Red Wake',
        ai: { archetype: 'fleeing_trader' },
        cargoManifest: civilianManifest(),
      },
    });
    const payload = collisionKillPayload(run, victim);

    run.bus.emit('entity:killed', payload);

    // ONE legal aftermath: a single signed receipt, priced as the physical act it was.
    assert.equal(run.receipts.length, 1, 'one kill signs exactly one incident receipt');
    assert.equal(run.receipts[0].accepted, true);
    assert.equal(run.receipts[0].kind, 'reckless_kill',
      'a slammed hull is recklessness on the charge, not a weapons kill');
    assert.equal(run.receipts[0].offenderStableId, 'player',
      'the receipt keeps the responsible actor while the kind names the cause');
    const adjudicated = run.lawResponses.filter((r) => r.outcome === 'charged');
    assert.equal(adjudicated.length, 1);
    assert.equal(adjudicated[0].cause, 'ship_collision');

    // ONE salvage aftermath: a single durable marker and a single cargo body for the manifest.
    const markers = aftermathForSector(run.state, SECTOR);
    assert.equal(markers.length, 1, 'one kill leaves one durable wreck marker');
    assert.equal(manifestPayloads(run.state).length, 1, 'one hull spills one manifest payload');
    assert.equal(victim.data.manifestPayloadDropped, true);

    // A replayed entity:killed (stale relay) must not mint a second aftermath anywhere.
    run.bus.emit('entity:killed', structuredClone(payload));
    assert.equal(aftermathForSector(run.state, SECTOR).length, 1, 'the marker dedupes on the victim key');
    assert.equal(manifestPayloads(run.state).length, 1, 'manifestPayloadDropped holds the drop to one');
    const reportIds = new Set(run.receipts.map((r) => r.reportId));
    assert.equal(reportIds.size, 1, 're-emits republish the same report, never a second charge');
  } finally {
    run.restore();
  }
});

test('a hostile collision kill speaks the physical move and keeps the responsible actor', () => {
  const run = boot();
  try {
    const hostile = run.sim.spawn({
      type: 'ship', team: 1, factionId: 'faction_reach',
      pos: { x: 180, z: 0 }, hull: 60, hullMax: 60, radius: 8,
      data: {
        shipClass: 'raider', name: 'Knife Wake',
        ai: { archetype: 'pirate_raider', hostileTeams: [0], motive: 'contract_combat' },
        intent: { fire: true, moveX: 0, moveZ: 0 },
        combat: { targetId: run.state.playerId },
      },
    });

    run.bus.emit('entity:killed', collisionKillPayload(run, hostile, { targetHostileToPlayer: true }));

    const line = run.voices.find((v) => v.kind === 'combat');
    assert.ok(line, 'a kill speaks one outcome line');
    assert.match(line.text, /collision/i, 'the receipt names the physical move, not a gun kill');
    assert.match(line.text, /Knife Wake/, 'the receipt still names the victim');

    const record = run.state.combatOutcome.byEntity[hostile.id];
    assert.ok(record, 'the outcome is retained on the record');
    assert.equal(record.killerId, run.state.playerId,
      'the law/outcome keeps the responsible actor separate from the displayed cause');
    assert.equal(record.destruction.cause, 'ship_collision');
  } finally {
    run.restore();
  }
});
