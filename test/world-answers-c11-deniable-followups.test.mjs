// THE WORLD ANSWERS - C11 follow-ups: the deniable ambush has a next beat the player can read.
//
//   survived  (snare cleared/escaped, or the job delivered through it) -> the fence is BURNED:
//             deniable offers suppressed for DENIABLE_BURN_EPOCHS epochs, one setup rumor at the next
//             dock, receipt deniable:fenceBurned.
//   succeeded (job failed after the snare fired, or the pilot went down) -> the fence is EMBOLDENED:
//             +0.2 ambush chance (total capped at 1) for DENIABLE_EMBOLDEN_EPOCHS epochs, one
//             "marked cargo" rumor, receipt deniable:fenceEmboldened.
//   clean     (delivered a job whose clause never rolled) -> quiet rep + a bark, deniable:fenceThanked.
//
//   node --test test/world-answers-c11-deniable-followups.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import { DENIABLE_CAUSE_TAG, deniableAmbushChance } from '../src/data/economyContractTemplates.js';
import {
  DENIABLE_BURN_EPOCHS, DENIABLE_EMBOLDEN_BONUS, DENIABLE_EMBOLDEN_EPOCHS, DENIABLE_CLEAN_REP,
  boldAmbushChance, deniableBoardEpoch, deniableSeedsOf, emboldenedBonus, isFenceBurned,
} from '../src/data/deniableAftermath.js';
import { economyContracts } from '../src/systems/economyContracts.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { missions as missionsProto } from '../src/systems/missions.js';
import { createGameState } from '../src/core/gameState.js';
import { createSimulation } from '../src/core/sim.js';

const FENCE = 'station_smuggler'; // sector_pallas_drift - faction_quiet - blackmarket
const FENCE_SECTOR = 'sector_pallas_drift';
const SEEDS = [4242, 8008];

function makeBus() {
  const handlers = new Map();
  const emitLog = [];
  return {
    emitLog,
    on(evt, fn) { if (!handlers.has(evt)) handlers.set(evt, []); handlers.get(evt).push(fn); },
    off(evt, fn) {
      const list = handlers.get(evt) || [];
      const i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
    },
    emit(evt, payload) {
      emitLog.push({ evt, payload });
      for (const fn of (handlers.get(evt) || []).slice()) fn(payload);
    },
  };
}

function makeHarness({ seed = 4242, heat = 0.5 } = {}) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.simTime = 10;
  state.playerId = 1;
  state.player.credits = 5000;
  state.player.heat = heat;
  state.player.cargo = { items: {}, usedVolume: 0, usedMass: 0, capVolume: 80, capMass: 120 };
  state.world = state.world || {};
  state.world.currentSectorId = FENCE_SECTOR;
  state.ui = state.ui || {};
  state.missions = state.missions || {};
  state.missions.active = [];
  state.missions.boards = {};
  state.missions.completedLog = [];
  state.missions.receipts = [];
  state.missions.nextId = 1;
  state.missions.config = state.missions.config || { refreshSec: 600, maxActive: 8 };
  state.entities.set(1, { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } });
  const bus = makeBus();
  const lines = [];
  bus.on('economy:grantCredits', (p) => { state.player.credits += Math.max(0, Math.round(Number(p && p.amount) || 0)); });
  bus.on('economy:chargeCredits', (p) => { state.player.credits -= Math.max(0, Math.round(Number(p && p.amount) || 0)); });
  const helpers = {
    voice: { say: (row) => { lines.push(row); return true; } },
    hash32: (...parts) => {
      let h = 2166136261;
      for (const p of parts) {
        const s = String(p);
        for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
      }
      return h >>> 0;
    },
    mulberry32: (seedIn) => {
      let a = seedIn >>> 0;
      return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    },
  };
  const missions = Object.assign({}, missionsProto);
  missions.init({ state, bus, helpers, registry: { get: () => null } });
  bus.emit('game:started');
  state.missions.active = [];
  state.missions.boards = {};
  state.missions.receipts = [];
  state.missions.nextId = 1;
  state.ui.trackedMissionId = null;
  if (state.nav) state.nav.waypoint = null;
  const econ = Object.assign({}, economyContracts);
  econ.init({ state, bus, helpers });
  const director = Object.assign({}, encounterDirector);
  director.init({ state, bus, helpers, registry: null });
  return { state, bus, missions, econ, director, lines };
}

function deniableRows(h) {
  const board = h.state.missions.boards && h.state.missions.boards[FENCE];
  return ((board && board.slots) || []).filter((o) => o && o.cause && o.cause.tag === DENIABLE_CAUSE_TAG);
}

function receipts(h, name) {
  return h.bus.emitLog.filter((e) => e.evt === name).map((e) => e.payload);
}

/** Jump the sim clock to the start of board epoch `epoch`. */
function toEpoch(h, epoch) {
  const step = h.state.missions.config.refreshSec || 600;
  h.state.simTime = epoch * step + 5;
}

/** Dock at the fence, take the deniable job, and return { inst, row } with the clause forced. */
function takeJob(h, { hit, fired }) {
  h.bus.emit('dock:docked', { stationId: FENCE });
  const offer = deniableRows(h)[0];
  assert.ok(offer, 'a deniable offer boarded');
  assert.equal(h.missions.acceptMission(offer.id) !== false, true, 'the unchanged accept path takes it');
  const inst = h.state.missions.active.find((m) => m.sourceOfferId === offer.id);
  assert.ok(inst, 'accepted instance is live');
  const row = h.state.encounterDirector.stats.deniableClauses[inst.id];
  assert.ok(row, 'the director decided the clause at accept');
  assert.equal(row.fenceStationId, FENCE, 'the clause remembers which fence sold it');
  row.hit = hit;
  row.fired = fired;
  return { inst, row, offer };
}

const resolved = (id, outcome) => ({ encounterId: `deniable:${id}`, shape: 'ambush_snare', outcome, sectorId: FENCE_SECTOR });

for (const seed of SEEDS) {
  test(`survived the snare -> the fence is burned: one receipt, one setup rumor, offers suppressed then resume (seed ${seed})`, () => {
    const h = makeHarness({ seed });
    const e0 = deniableBoardEpoch(h.state);
    const { inst } = takeJob(h, { hit: true, fired: true });
    assert.equal(h.state.encounterDirector.stats.deniableAftermath, undefined, 'nothing planted yet');

    h.bus.emit('encounter:resolved', resolved(inst.id, 'escaped'));
    h.bus.emit('encounter:resolved', resolved(inst.id, 'cleared')); // duplicate: never a second beat
    h.bus.emit('mission:completed', { missionId: inst.id }); // delivered after: still one receipt
    const burned = receipts(h, 'deniable:fenceBurned');
    assert.equal(burned.length, 1, 'exactly one fenceBurned receipt');
    assert.deepEqual(burned[0], { schemaVersion: 1, stationId: FENCE, sectorId: FENCE_SECTOR, tick: h.state.tick | 0 });
    assert.equal(receipts(h, 'deniable:fenceEmboldened').length, 0);
    assert.equal(receipts(h, 'deniable:fenceThanked').length, 0);

    const seeds = deniableSeedsOf(h.state);
    assert.equal(seeds.length, 1);
    assert.equal(seeds[0].beat, 'burned');
    assert.equal(seeds[0].untilEpoch, e0 + DENIABLE_BURN_EPOCHS);
    assert.equal(seeds[0].rumorPending, true);

    // The next dock at the fence says the job was a setup - once.
    const before = h.lines.length;
    h.bus.emit('dock:docked', { stationId: FENCE });
    const said = h.lines.slice(before);
    assert.equal(said.length, 1);
    assert.equal(said[0].channel, 'news');
    assert.match(said[0].text, /setup/);
    assert.match(said[0].text, /knows you know/);
    h.bus.emit('dock:docked', { stationId: FENCE });
    assert.equal(h.lines.length, before + 1, 'the rumor is spoken once');
    assert.equal(deniableSeedsOf(h.state)[0].rumorPending, false);

    // The window: no deniable offer inside it, the offer resumes the epoch it closes.
    for (let epoch = e0 + 1; epoch < e0 + DENIABLE_BURN_EPOCHS; epoch++) {
      toEpoch(h, epoch);
      assert.equal(isFenceBurned(h.state, FENCE, epoch), true);
      h.bus.emit('dock:docked', { stationId: FENCE });
      assert.equal(deniableRows(h).filter((o) => o.id.includes(`_${epoch}_`)).length, 0, `epoch ${epoch}: burned fence posts nothing`);
    }
    const reopen = e0 + DENIABLE_BURN_EPOCHS;
    toEpoch(h, reopen);
    assert.equal(isFenceBurned(h.state, FENCE, reopen), false);
    h.bus.emit('dock:docked', { stationId: FENCE });
    assert.equal(deniableRows(h).filter((o) => o.id.includes(`_${reopen}_`)).length, 1, 'the fence deals again once the window closes');
  });

  test(`ambush landed (job failed after the snare fired) -> the fence is emboldened, once (seed ${seed})`, () => {
    const h = makeHarness({ seed, heat: 0.2 }); // heat level 1: base chance 0.6
    const e0 = deniableBoardEpoch(h.state);
    const { inst } = takeJob(h, { hit: true, fired: true });

    h.bus.emit('mission:failed', { missionId: inst.id, reason: 'cargo_lost' });
    h.bus.emit('mission:failed', { missionId: inst.id, reason: 'cargo_lost' });
    h.bus.emit('player:death', {});
    const bold = receipts(h, 'deniable:fenceEmboldened');
    assert.equal(bold.length, 1, 'exactly one fenceEmboldened receipt');
    assert.deepEqual(bold[0], { schemaVersion: 1, stationId: FENCE, sectorId: FENCE_SECTOR, tick: h.state.tick | 0 });
    assert.equal(receipts(h, 'deniable:fenceBurned').length, 0);
    const [s] = deniableSeedsOf(h.state);
    assert.equal(s.beat, 'emboldened');
    assert.equal(s.bonus, DENIABLE_EMBOLDEN_BONUS);
    assert.equal(s.untilEpoch, e0 + DENIABLE_EMBOLDEN_EPOCHS);

    // One rumor at the next dock: the fence is moving marked cargo.
    const before = h.lines.length;
    h.bus.emit('dock:docked', { stationId: FENCE });
    const said = h.lines.slice(before);
    assert.equal(said.length, 1);
    assert.match(said[0].text, /marked cargo/);

    // The next deniable offer prints, and the next accept rolls, the bolder chance.
    toEpoch(h, e0 + 1);
    h.state.missions.active = []; // free the slot; the harness does not settle the failed row
    h.bus.emit('dock:docked', { stationId: FENCE });
    const offer = deniableRows(h).find((o) => o.id.includes(`_${e0 + 1}_`));
    assert.ok(offer, 'the emboldened fence still deals');
    const expected = boldAmbushChance(deniableAmbushChance(1), DENIABLE_EMBOLDEN_BONUS);
    assert.ok(Math.abs(expected - 0.8) < 1e-9);
    assert.equal(offer.cause.deniable.ambushChance, expected, 'the card prints the honest bolder odds');
    h.missions.acceptMission(offer.id);
    const inst2 = h.state.missions.active.find((m) => m.sourceOfferId === offer.id);
    const row2 = h.state.encounterDirector.stats.deniableClauses[inst2.id];
    assert.equal(row2.chance, expected);
    assert.equal(row2.bonus, DENIABLE_EMBOLDEN_BONUS);

    // The bonus ends with its window.
    assert.equal(emboldenedBonus(h.state, FENCE, e0 + DENIABLE_EMBOLDEN_EPOCHS), 0);
  });

  test(`a pilot going down with the snare open is the ambush succeeding (seed ${seed})`, () => {
    const h = makeHarness({ seed });
    takeJob(h, { hit: true, fired: true });
    h.bus.emit('player:death', {});
    h.bus.emit('player:death', {});
    assert.equal(receipts(h, 'deniable:fenceEmboldened').length, 1);
    assert.equal(receipts(h, 'deniable:fenceBurned').length, 0);
  });

  test(`delivering a job whose clause never rolled -> quiet rep and a bark, once (seed ${seed})`, () => {
    const h = makeHarness({ seed });
    const { inst } = takeJob(h, { hit: false, fired: false });
    h.bus.emit('mission:completed', { missionId: inst.id, factionId: inst.factionId });
    h.bus.emit('mission:completed', { missionId: inst.id, factionId: inst.factionId });
    const thanks = receipts(h, 'deniable:fenceThanked');
    assert.equal(thanks.length, 1, 'exactly one fenceThanked receipt');
    assert.equal(thanks[0].schemaVersion, 1);
    assert.equal(thanks[0].stationId, FENCE);
    const reps = h.bus.emitLog.filter((e) => e.evt === 'faction:repDelta' && e.payload.reason === 'deniable_delivered');
    assert.equal(reps.length, 1, 'the existing repDelta intent, once');
    assert.equal(reps[0].payload.factionId, inst.factionId);
    assert.equal(reps[0].payload.delta, DENIABLE_CLEAN_REP);
    assert.ok(reps[0].payload.delta > 0 && reps[0].payload.delta <= 3, 'a small positive delta');
    const barks = h.lines.filter((l) => l.channel === 'bark' && l.kind === 'fence');
    assert.equal(barks.length, 1);
    // A carrot is not a seed: nothing is planted.
    assert.equal(h.state.encounterDirector.stats.deniableAftermath, undefined);
    assert.equal(receipts(h, 'deniable:fenceBurned').length + receipts(h, 'deniable:fenceEmboldened').length, 0);
  });

  test(`no deniable job ever taken -> no seed, no serialized key (seed ${seed})`, () => {
    const h = makeHarness({ seed });
    h.bus.emit('dock:docked', { stationId: FENCE });
    h.bus.emit('dock:docked', { stationId: 'station_helios' });
    h.bus.emit('encounter:resolved', resolved('m_nope', 'escaped'));
    h.bus.emit('encounter:resolved', { encounterId: 'enc_other', outcome: 'cleared' });
    h.bus.emit('mission:completed', { missionId: 'm_plain' });
    h.bus.emit('mission:failed', { missionId: 'm_plain', reason: 'expired' });
    h.bus.emit('player:death', {});
    const dir = h.state.encounterDirector;
    assert.equal(deniableSeedsOf(h.state).length, 0);
    assert.equal(dir === undefined || (dir.stats || {}).deniableAftermath === undefined, true);
    assert.equal(JSON.stringify(dir || {}).includes('deniableAftermath'), false);
    assert.equal(receipts(h, 'deniable:fenceBurned').length, 0);
    assert.equal(receipts(h, 'deniable:fenceEmboldened').length, 0);
    assert.equal(receipts(h, 'deniable:fenceThanked').length, 0);
  });
}

test('an abandoned job after the snare fired is not the ambush succeeding', () => {
  const h = makeHarness({ seed: 4242 });
  const { inst } = takeJob(h, { hit: true, fired: true });
  h.bus.emit('mission:failed', { missionId: inst.id, reason: 'abandoned' });
  assert.equal(receipts(h, 'deniable:fenceEmboldened').length, 0);
  assert.equal(deniableSeedsOf(h.state).length, 0);
});

test('emboldened chance is capped at 1, including stacked seeds (seeds 4242 / 8008)', () => {
  assert.equal(boldAmbushChance(1, DENIABLE_EMBOLDEN_BONUS), 1);
  assert.equal(boldAmbushChance(0.9, 0.4), 1);
  assert.ok(Math.abs(boldAmbushChance(0.6, 0.2) - 0.8) < 1e-9);
  for (const seed of SEEDS) {
    const h = makeHarness({ seed, heat: 1 }); // level 5: base chance already 1
    const { inst } = takeJob(h, { hit: true, fired: true });
    h.bus.emit('mission:failed', { missionId: inst.id, reason: 'cargo_lost' });
    const e1 = deniableBoardEpoch(h.state) + 1;
    toEpoch(h, e1);
    h.state.missions.active = [];
    h.bus.emit('dock:docked', { stationId: FENCE });
    const offer = deniableRows(h).find((o) => o.id.includes(`_${e1}_`));
    assert.ok(offer);
    assert.equal(offer.cause.deniable.ambushChance, 1, 'printed odds never exceed 1');
    h.missions.acceptMission(offer.id);
    const inst2 = h.state.missions.active.find((m) => m.sourceOfferId === offer.id);
    assert.equal(h.state.encounterDirector.stats.deniableClauses[inst2.id].chance, 1);
  }
});

test('a pending seed survives a save round-trip and still burns the fence + speaks its rumor (seeds 4242 / 8008)', () => {
  for (const seed of SEEDS) {
    const a = makeHarness({ seed });
    const e0 = deniableBoardEpoch(a.state);
    const { inst } = takeJob(a, { hit: true, fired: true });
    a.bus.emit('encounter:resolved', resolved(inst.id, 'cleared'));
    const saved = JSON.parse(JSON.stringify(a.state.encounterDirector.stats)); // saveSystem keeps stats wholesale
    assert.ok(saved.deniableAftermath && saved.deniableAftermath.seeds.length === 1);

    const b = makeHarness({ seed });
    b.state.encounterDirector = undefined;
    b.director.newGame();
    b.state.encounterDirector.stats = { ...b.state.encounterDirector.stats, ...saved };
    b.state.simTime = a.state.simTime;
    b.director.update(1, b.state); // ensureDirectorState normalizes the loaded ledger
    const seeds = deniableSeedsOf(b.state);
    assert.equal(seeds.length, 1, 'the seed came back');
    assert.equal(seeds[0].rumorPending, true, 'the rumor is still owed');
    assert.equal(isFenceBurned(b.state, FENCE, e0 + 1), true);

    const before = b.lines.length;
    b.bus.emit('dock:docked', { stationId: FENCE });
    assert.equal(b.lines.length, before + 1);
    assert.match(b.lines[before].text, /setup/);
    assert.equal(deniableRows(b).length, 0, 'the loaded burn suppresses the offer');

    // Corrupt ledgers are dropped, never trusted.
    b.state.encounterDirector.stats.deniableAftermath = { seeds: [{ beat: 'nope' }, null, 7] };
    b.director.update(1, b.state);
    assert.equal(b.state.encounterDirector.stats.deniableAftermath, undefined);
    b.state.encounterDirector.stats.deniableAftermath = 'garbage';
    b.director.update(1, b.state);
    assert.equal(b.state.encounterDirector.stats.deniableAftermath, undefined);
  }
});

test('through the real director: resolving the drop encounter escaped burns the fence (seed 4242)', () => {
  const sim = createSimulation({ seed: 4242, systems: [encounterDirector] });
  const { state, bus } = sim;
  const director = sim.registry.get('encounterDirector');
  state.mode = 'flight';
  const DEST_SECTOR = 'sector_ceres_belt';
  state.world.currentSectorId = DEST_SECTOR;
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 8, mass: 40,
    hull: 100, hullMax: 100, data: { intent: {}, ai: {} },
  });
  state.playerId = player.id;
  state.player.heat = 1;
  state.missions.active.push({
    id: 'm_deniable_fu', type: 'cargo_delivery', status: 'active', source: 'economyContract',
    stationId: FENCE, factionId: 'faction_quiet',
    destStationId: 'station_ceres', destSectorId: DEST_SECTOR,
    cause: { tag: DENIABLE_CAUSE_TAG, axis: 'heat', line: 'x' },
  });
  const burned = [];
  bus.on('deniable:fenceBurned', (p) => burned.push(p));
  bus.emit('mission:accepted', { missionId: 'm_deniable_fu' });
  const row = state.encounterDirector.stats.deniableClauses.m_deniable_fu;
  assert.equal(row.hit, true);
  assert.equal(row.fenceStationId, FENCE);
  assert.equal(row.fenceSectorId, FENCE_SECTOR);
  assert.equal(row.fenceFactionId, 'faction_quiet');
  assert.equal(row.bonus, undefined, 'no bonus key without an emboldened seed');

  const drop = director._deniableDropPoint(row);
  player.pos.x = drop.x + 900; player.pos.z = drop.z;
  state.simTime = 40;
  director.update(1, state);
  state.simTime = 47;
  director.update(1, state);
  const live = state.encounterDirector.live['deniable:m_deniable_fu'];
  assert.ok(live, 'the drop ambush is live');
  assert.equal(row.fired, true);

  director.resolve(live, 'escaped');
  assert.equal(burned.length, 1);
  assert.equal(burned[0].stationId, FENCE);
  assert.equal(isFenceBurned(state, FENCE, deniableBoardEpoch(state)), true);
  assert.equal(row.outcome, 'survived');
});
