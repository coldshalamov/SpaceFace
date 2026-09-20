// Proximity-starved combat beats relocate to the player. A player parked far from every authored
// zone used to fizzle-drop every combat beat (measured: 0 encounter:spawned for hours 5–9, both
// hunter seeds) while prop-only ambients kept the telegraph counter alive. The relocation clock
// is per-sector (it survives the sector-day replan that resets per-item defer counts). Real
// director pump, real pirate_toll shape, compressed clock.

import assert from 'node:assert/strict';
import test from 'node:test';

import { encounterDirector } from '../src/systems/encounterDirector.js';
import { ENCOUNTERS } from '../src/data/encounters.js';
import { COMMODITIES } from '../src/data/commodities.js';
import { ENCOUNTER_SCRIPTS } from '../src/systems/encounterScripts.js';

function makeHarness() {
  const entities = new Map();
  const player = {
    id: 1, type: 'ship', alive: true, hull: 400, hullMax: 400, shield: 200, shieldMax: 200,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, flags: {},
  };
  entities.set(1, player);
  const state = {
    playerId: 1,
    entities,
    simTime: 0,
    tick: 0,
    player: { flags: {}, credits: 5000, cargo: { items: {} }, bounty: 0, heat: 0 },
    onboarding: { active: false, finished: true },
    ui: {},
    world: { currentSectorId: 'sector_nyx_march' },
    meta: { seed: 8008 },
    story: { beatIndex: 3 },
  };
  // A sellable cargo hold worth well above pirate_toll's minCargoValue gate.
  const cmdty = COMMODITIES.find((c) => (c.basePrice || 0) > 20);
  state.player.cargo.items[cmdty.id] = 20;
  const events = [];
  const dir = Object.create(encounterDirector);
  dir.state = state;
  dir.bus = { emit(name, payload) { events.push({ name, payload }); }, on() {} };
  dir.helpers = {
    spawnEntity(spec) {
      const ent = { id: entities.size + 10, alive: true, type: 'ship', pos: { ...spec.pos }, data: spec.data || {} };
      entities.set(ent.id, ent);
      return ent;
    },
  };
  state.encounterDirector = {
    pending: [], active: {}, live: {}, plannedKey: null,
    pressure: { combat: 200, civilian: 200 }, noise: { mining: 0 }, window: [], cooldowns: {},
    named: {}, externalNamed: {}, receipts: [],
    stats: { fired: 0, resolved: 0, fizzled: 0 },
    lastMeaningfulAt: -1e9, lastAmbientAt: -1e9, lastMajorAt: -1e9, lastEndAt: -1e9,
    escalationSeeds: [], _accum: 0, proxStarve: {},
  };
  function pendingItem(zoneCenter) {
    return {
      encounterId: 'enc_test_1', shapeId: 'pirate_toll', script: 'toll',
      tier: 'minor', deck: 'combat', squadId: 'enc_test_1',
      sectorId: 'sector_nyx_march', zoneId: 'zone_nyx_cutlane', zoneName: 'Nyx Cutlane',
      zoneCenter: zoneCenter || { x: 20000, z: 0 }, zoneRadius: 620,   // 20k WU from the parked player
      factionId: 'faction_reach', bark: null, motive: null, engagementTrigger: null,
      variantKind: null, levelBand: [2, 4], delay: 0,
      ships: [
        { archetype: 'reaver_pirate', level: 3, pos: { x: 20000, z: 40 }, factionId: 'faction_reach', context: 'toll' },
        { archetype: 'wasp_swarmer', level: 2, pos: { x: 19960, z: 0 }, factionId: 'faction_reach', context: 'toll' },
      ],
      dueAt: 0, defers: 0,
    };
  }
  function pumpUntil(t1, step = 21) {
    for (let t = 0; t <= t1; t += step) {
      state.simTime = t;
      dir._pump(state.encounterDirector, state, t);
    }
  }
  const disengagements = () => events.filter((e) => e.name === 'harasser:disengaged');
  return { state, player, entities, events, dir, pendingItem, pumpUntil, disengagements };
}

test('a far-from-zone combat beat relocates beside the player once the sector starvation clock opens', () => {
  const h = makeHarness();
  const item = h.pendingItem();
  h.state.encounterDirector.pending.push(item);
  h.pumpUntil(84); // first proximity failure stamps the clock at t=21; 63 s of starvation so far
  assert.equal(h.events.filter((e) => e.name === 'encounter:telegraph').length, 0, 'no fire while the starvation window is open');
  h.pumpUntil(147); // > 90 s of zone-unreachability on the 21 s pump grid
  const tele = h.events.find((e) => e.name === 'encounter:telegraph');
  assert.ok(tele, 'the beat fired instead of dissolving');
  assert.equal(tele.payload.relocated, true, 'the fire is a relocation');
  assert.ok(tele.payload.pos, 'the telegraph carries the new anchor');
  const dist = Math.hypot(tele.payload.pos.x - h.player.pos.x, tele.payload.pos.z - h.player.pos.z);
  assert.ok(dist >= 500 && dist <= 950, `relocated anchor sits off the player's bow (got ${Math.round(dist)} WU)`);
  const spawned = h.events.find((e) => e.name === 'encounter:spawned');
  assert.ok(spawned, 'ships actually materialized (encounter:spawned)');
  assert.equal(spawned.payload.count, 2, 'the whole squad spawned');
  assert.ok(!h.state.encounterDirector.pending.includes(item), 'item left the pending queue');
  // The squad is physically present around the parked player.
  const ents = [...h.entities.values()].filter((e) => e.type === 'ship' && e.id !== 1);
  assert.equal(ents.length, 2, 'two hostile entities exist');
  for (const e of ents) {
    const d = Math.hypot(e.pos.x - h.player.pos.x, e.pos.z - h.player.pos.z);
    assert.ok(d < 1200, `hostile is on top of the parked player's position (got ${Math.round(d)} WU)`);
  }
});

test('the starvation clock survives the sector-day replan that resets per-item defers', () => {
  const h = makeHarness();
  const item = h.pendingItem();
  h.state.encounterDirector.pending.push(item);
  h.pumpUntil(84);
  assert.equal(h.events.filter((e) => e.name === 'encounter:telegraph').length, 0);
  // A sector-day replan wipes the pending queue (600 s cadence) and the clock must persist.
  h.state.encounterDirector.pending = [];
  const item2 = h.pendingItem();
  item2.encounterId = 'enc_test_2';
  item2.squadId = 'enc_test_2';
  h.state.encounterDirector.pending.push(item2);
  h.pumpUntil(147);
  const tele = h.events.find((e) => e.name === 'encounter:telegraph');
  assert.ok(tele && tele.payload.relocated, 'relocation fires despite the replan');
});

test('the authored Ceres throughline ambush never relocates off its killbox', () => {
  const h = makeHarness();
  h.state.world.currentSectorId = 'sector_ceres_belt';
  const item = h.pendingItem();
  item.encounterId = 'ceres:activity:throughline-ambush';
  item.squadId = 'ceres:activity:throughline-ambush';
  item.shapeId = 'ambush_snare';
  item.script = 'ambush';
  item.sectorId = 'sector_ceres_belt';
  item.zoneId = 'zone_ceres_ambush';
  item.data = { ceresActivityAmbush: true };
  h.state.encounterDirector.pending.push(item);
  // Starvation clock matures (the sector sees only unreachable combat zones), but the authored
  // one-shot must wait for the player at its authored band — never relocate beside a parked
  // player and never gate-fizzle the durable item out of the queue.
  h.pumpUntil(300);
  assert.equal(h.events.filter((e) => e.name === 'encounter:telegraph').length, 0, 'no telegraph off the killbox');
  assert.equal(h.events.filter((e) => e.name === 'encounter:spawned').length, 0, 'no spawn off the killbox');
  assert.ok(h.state.encounterDirector.pending.includes(item), 'authored item still queued');
  assert.equal(item.defers, 0, 'waits on plain defer, never the fizzle counter');
});

test('a player near the authored zone fires in place, without relocation or starvation stamping', () => {
  const h = makeHarness();
  const item = h.pendingItem({ x: 400, z: 0 }); // inside the reach band of the parked player
  h.state.encounterDirector.pending.push(item);
  h.pumpUntil(30);
  const tele = h.events.find((e) => e.name === 'encounter:telegraph');
  assert.ok(tele, 'the authored-zone beat fires immediately');
  assert.equal(tele.payload.relocated, false, 'no relocation when the zone is reachable');
  assert.equal(h.state.encounterDirector.proxStarve.sector_nyx_march, undefined, 'no starvation stamp while zones are reachable');
});
