// THE WORLD REMEMBERS - U-B: fences with faces.
//
// Six authored fences, one per outlaw-friendly berth. Trust moves on the EXISTING deniable receipts
// (thanked +1, lost -1, burned -3 and the window); trust 0 posts the C11 job, trust >= 1 a bigger
// haul over a longer leg, trust >= 2 the fence's three-leg ROUTE with a one-time reward; ambush odds
// fall with trust; the fixer scrubs heat through heat.js by intent; a cold fence sells a hot pilot;
// a fence shows its face at the bar. A pod ransomed at a fence who wants them pays the lawful
// rescue fee times that fence's pay scale and earns trust; any other fence station pays nothing.
//
//   node --test test/world-remembers-fences.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { SECTORS } from '../src/data/sectors.js';
import { FACTION_META } from '../src/data/factions.js';
import { MODULES } from '../src/data/modules.js';
import { localPortraitForContact } from '../src/data/localPortraits.js';
import { stationBerthAdmits } from '../src/data/frontierRumors.js';
import {
  DENIABLE_CAUSE_TAG, DENIABLE_PAY_SCALE, OUTLAW_FRIENDLY_PERSONALITIES, deniableAmbushChance,
} from '../src/data/economyContractTemplates.js';
import { DENIABLE_BURN_EPOCHS, deniableBoardEpoch } from '../src/data/deniableAftermath.js';
import {
  FENCES, FENCE_BY_ID, FENCE_FORGIVE_EPOCHS, FENCE_RANSOM_FALLBACK_LINE, FENCE_RANSOM_FEE_CR,
  FENCE_ROUTE_CAUSE_TAG, FENCE_TRUST_DELTA,
  fenceAmbushChance, fenceContactId, fenceRansomLine, fenceRowOf, fenceTipRoll, sanitizeFenceLedger,
} from '../src/data/fences.js';
import { economyContracts } from '../src/systems/economyContracts.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { heat as heatProto, SCRUB_COOLDOWN_S } from '../src/systems/heat.js';
import { missions as missionsProto } from '../src/systems/missions.js';
import { generateContacts, buildReply } from '../src/ui/station/barContacts.js';

const SEEDS = [4242, 8008];
const STATION_INFO = new Map();
for (const sec of SECTORS) for (const st of sec.stations) STATION_INFO.set(st.id, { ...st, sectorId: sec.id, sector: sec });
const FACTION_BY_ID = new Map(FACTION_META.map((f) => [f.id, f]));
const SMUGGLER = FENCE_BY_ID.get('fence_oriel_pask'); // station_smuggler - the fixer; trust 0 = the C11 job
const ILSA = FENCE_BY_ID.get('fence_ilsa_greve'); // station_kepler_scar - buys pods

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

function makeHarness({ seed = 4242, heat = 0.5, sector = 'sector_pallas_drift' } = {}) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.simTime = 10;
  state.playerId = 1;
  state.player.credits = 20000;
  state.player.heat = heat;
  state.player.cargo = { items: {}, usedVolume: 0, usedMass: 0, capVolume: 200, capMass: 400 };
  state.world = state.world || {};
  state.world.currentSectorId = sector;
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
  const heatSys = Object.assign({}, heatProto);
  heatSys.init({ state, bus });
  return { state, bus, missions, econ, director, heat: heatSys, lines };
}

const receipts = (h, name) => h.bus.emitLog.filter((e) => e.evt === name).map((e) => e.payload);
const toEpoch = (h, epoch) => { h.state.simTime = epoch * (h.state.missions.config.refreshSec || 600) + 5; };
const dock = (h, stationId) => h.bus.emit('dock:docked', { stationId });
const thank = (h, fence) => h.bus.emit('deniable:fenceThanked', {
  schemaVersion: 1, stationId: fence.stationId, sectorId: STATION_INFO.get(fence.stationId).sectorId, tick: 0,
});
const board = (h, stationId) => ((h.state.missions.boards[stationId] || {}).slots || []);
const jobRows = (h, stationId) => board(h, stationId).filter((o) => o && o.cause
  && (o.cause.tag === DENIABLE_CAUSE_TAG || o.cause.tag === FENCE_ROUTE_CAUSE_TAG));

/** Raise a fence to `trust` through the real receipts (thanked, +1 each). */
function trustTo(h, fence, trust) {
  for (let i = 0; i < trust; i++) thank(h, fence);
  assert.equal(fenceRowOf(h.state, fence.id).trust, trust);
}

function accept(h, offerId) {
  const before = h.bus.emitLog.length;
  const ok = h.missions.acceptMission(offerId) !== false;
  const toast = h.bus.emitLog.slice(before).find((e) => e.evt === 'toast');
  assert.ok(ok, `accepted ${offerId} ${toast ? toast.payload.text : ''}`);
  const inst = h.state.missions.active.find((m) => m.sourceOfferId === offerId || m.id === offerId);
  assert.ok(inst, 'accepted instance is live');
  return inst;
}

// ── 1. the roster ─────────────────────────────────────────────────────────────────────────────
test('six fences, each bound to a real outlaw-friendly station, with a face and five lines', () => {
  assert.equal(FENCES.length, 6);
  assert.equal(new Set(FENCES.map((f) => f.stationId)).size, 6, 'one station each');
  assert.equal(new Set(FENCES.map((f) => f.id)).size, 6);
  const faces = new Set();
  for (const fence of FENCES) {
    const st = STATION_INFO.get(fence.stationId);
    assert.ok(st, `${fence.id} binds a real station`);
    assert.equal(fence.factionId, st.factionId || st.sector.factionId, 'the fence speaks for the station faction');
    const personality = FACTION_BY_ID.get(fence.factionId).personality;
    assert.ok(st.type === 'blackmarket' || OUTLAW_FRIENDLY_PERSONALITIES.includes(personality), 'outlaw-friendly berth');
    for (const key of ['first', 'trusted', 'burned', 'lost', 'thanks', 'unknown']) {
      assert.ok(typeof fence.lines[key] === 'string' && fence.lines[key].length > 20, `${fence.id}.${key}`);
    }
    const face = localPortraitForContact({ id: fenceContactId(fence), name: fence.name, role: 'smuggler' });
    assert.ok(face, `${fence.id} has a portrait`);
    faces.add(face);
    // The route: three real, dockable, non-military berths, each one hop (or the same sector) from the last.
    assert.equal(fence.route.legs.length, 3);
    let from = st.sectorId;
    for (const legId of fence.route.legs) {
      const leg = STATION_INFO.get(legId);
      assert.ok(leg && leg.type !== 'military', `${fence.id} leg ${legId} is a real civil berth`);
      assert.ok(leg.sectorId === from || STATION_INFO.get(fence.stationId) && leg.sector.neighbors.includes(from)
        || SECTORS.find((s) => s.id === from).neighbors.includes(leg.sectorId), `${legId} is adjacent to ${from}`);
      from = leg.sectorId;
      // Berthable by a pilot at rep 0 - or at the +1 the fence's own faction already gave them.
      const record = leg.sector.stations.find((s) => s.id === legId);
      assert.ok(stationBerthAdmits(record, leg.factionId === fence.factionId ? 1 : 0, null), `${legId} berths the pilot`);
    }
    if (fence.route.reward.kind === 'module') assert.ok(MODULES.some((m) => m.id === fence.route.reward.defId));
  }
  assert.equal(faces.size, 6, 'six distinct faces');
  assert.deepEqual(FENCES.map((f) => f.quirk.id).sort(), ['corridor', 'fixer', 'mercy', 'ransom', 'tinker', 'volatile']);
});

// ── 2. trust ──────────────────────────────────────────────────────────────────────────────────
for (const seed of SEEDS) {
  test(`trust moves on the existing deniable receipts, clamped, with one trustChanged each (seed ${seed})`, () => {
    const h = makeHarness({ seed });
    assert.equal(h.state.encounterDirector.stats.fences, undefined, 'lazy: nothing before a fence is met');
    thank(h, SMUGGLER);
    let row = fenceRowOf(h.state, SMUGGLER.id);
    assert.equal(row.trust, 1);
    assert.equal(row.jobsDone, 1);
    assert.equal(row.lastOutcome, 'thanked');
    h.bus.emit('deniable:fenceEmboldened', { schemaVersion: 1, stationId: SMUGGLER.stationId });
    row = fenceRowOf(h.state, SMUGGLER.id);
    assert.equal(row.trust, 0);
    assert.equal(row.jobsLost, 1);
    assert.equal(row.lastOutcome, 'lost');
    const e0 = deniableBoardEpoch(h.state);
    h.bus.emit('deniable:fenceBurned', { schemaVersion: 1, stationId: SMUGGLER.stationId });
    row = fenceRowOf(h.state, SMUGGLER.id);
    assert.equal(row.trust, FENCE_TRUST_DELTA.burned);
    assert.equal(row.burnedUntilEpoch, e0 + DENIABLE_BURN_EPOCHS, 'burned reuses the existing window');
    h.bus.emit('deniable:fenceBurned', { schemaVersion: 1, stationId: SMUGGLER.stationId });
    assert.equal(fenceRowOf(h.state, SMUGGLER.id).trust, -3, 'clamped at -3');
    for (let i = 0; i < 6; i++) thank(h, SMUGGLER);
    assert.equal(fenceRowOf(h.state, SMUGGLER.id).trust, 3, 'clamped at +3');

    const changed = receipts(h, 'fence:trustChanged');
    assert.deepEqual(changed.slice(0, 3).map((r) => [r.trust, r.cause]), [[1, 'thanked'], [0, 'lost'], [-3, 'burned']]);
    for (const r of changed) {
      assert.equal(r.schemaVersion, 1);
      assert.equal(r.fenceId, SMUGGLER.id);
      assert.equal(r.factionId, SMUGGLER.factionId);
    }
    // A station with no fence is not the fence cast's business.
    h.bus.emit('deniable:fenceThanked', { schemaVersion: 1, stationId: 'station_helios' });
    assert.equal(Object.keys(h.state.encounterDirector.stats.fences.byId).length, 1);
  });

  test(`a sour fence warms one step per ${FENCE_FORGIVE_EPOCHS} epochs of silence, never deleted (seed ${seed})`, () => {
    const h = makeHarness({ seed, heat: 0 });
    h.bus.emit('deniable:fenceBurned', { schemaVersion: 1, stationId: SMUGGLER.stationId });
    const e0 = deniableBoardEpoch(h.state);
    toEpoch(h, e0 + FENCE_FORGIVE_EPOCHS - 1);
    dock(h, SMUGGLER.stationId);
    assert.equal(fenceRowOf(h.state, SMUGGLER.id).trust, -3, 'not yet');
    toEpoch(h, e0 + FENCE_FORGIVE_EPOCHS);
    dock(h, SMUGGLER.stationId);
    assert.equal(fenceRowOf(h.state, SMUGGLER.id).trust, -2);
    assert.equal(receipts(h, 'fence:trustChanged').pop().cause, 'time');
    toEpoch(h, e0 + FENCE_FORGIVE_EPOCHS * 20);
    dock(h, SMUGGLER.stationId);
    assert.equal(fenceRowOf(h.state, SMUGGLER.id).trust, 0, 'forgiveness stops at 0');
    assert.ok(h.state.encounterDirector.stats.fences.byId[SMUGGLER.id], 'the fence is still on the books');
  });
}

// ── 3. chains ─────────────────────────────────────────────────────────────────────────────────
for (const seed of SEEDS) {
  test(`trust 0 posts the C11 job; trust 1 a bigger haul, longer leg, better pay (seed ${seed})`, () => {
    const a = makeHarness({ seed });
    dock(a, SMUGGLER.stationId);
    const base = jobRows(a, SMUGGLER.stationId)[0];
    assert.ok(base && base.cause.tag === DENIABLE_CAUSE_TAG);
    assert.equal(base.cause.deniable.payScale, DENIABLE_PAY_SCALE);
    assert.match(base.title, /\(double pay\)$/);

    const b = makeHarness({ seed });
    trustTo(b, SMUGGLER, 1);
    dock(b, SMUGGLER.stationId);
    const big = jobRows(b, SMUGGLER.stationId)[0];
    assert.ok(big && big.cause.tag === DENIABLE_CAUSE_TAG);
    assert.ok(big.cause.deniable.payScale > DENIABLE_PAY_SCALE, 'better pay');
    assert.ok(big.params.qty > base.params.qty, 'a bigger haul');
    const here = STATION_INFO.get(SMUGGLER.stationId);
    const hopOne = here.sector.neighbors;
    assert.ok(base.destSectorId === here.sectorId || hopOne.includes(base.destSectorId), 'trust 0 drops one hop out');
    assert.ok(!hopOne.includes(big.destSectorId) && big.destSectorId !== here.sectorId, 'trust 1 drops two hops out');
  });

  test(`trust 2: the route posts leg 1, each leg unlocks the next, the reward lands once (seed ${seed})`, () => {
    const h = makeHarness({ seed });
    trustTo(h, SMUGGLER, 2);
    dock(h, SMUGGLER.stationId);
    const first = jobRows(h, SMUGGLER.stationId);
    assert.equal(first.length, 1);
    assert.equal(first[0].cause.tag, FENCE_ROUTE_CAUSE_TAG, 'the route, not the crate');
    assert.equal(first[0].id, `fenceroute_${SMUGGLER.id}_1`);
    assert.equal(first[0].destStationId, SMUGGLER.route.legs[0]);
    assert.equal(first[0].cause.fenceRoute.leg, 1);
    assert.equal(receipts(h, 'fence:routeOpened').length, 0, 'posted is not opened');

    let inst = accept(h, first[0].id);
    const opened = receipts(h, 'fence:routeOpened');
    assert.equal(opened.length, 1);
    assert.equal(opened[0].schemaVersion, 1);
    assert.equal(opened[0].factionId, SMUGGLER.factionId);
    assert.equal(fenceRowOf(h.state, SMUGGLER.id).route.status, 'running');
    // A route in motion posts nothing else at the fence's berth.
    toEpoch(h, deniableBoardEpoch(h.state) + 1);
    dock(h, SMUGGLER.stationId);
    assert.equal(jobRows(h, SMUGGLER.stationId).filter((o) => o.id !== first[0].id).length, 0);

    const repsBefore = receipts(h, 'faction:repDelta').length;
    for (let leg = 1; leg <= 3; leg++) {
      const destId = SMUGGLER.route.legs[leg - 1];
      if (leg > 1) {
        const offer = board(h, SMUGGLER.route.legs[leg - 2]).find((o) => o.id === `fenceroute_${SMUGGLER.id}_${leg}`);
        assert.ok(offer, `leg ${leg} is posted at ${SMUGGLER.route.legs[leg - 2]}, where leg ${leg - 1} delivered`);
        assert.equal(offer.destStationId, destId);
        assert.equal(receipts(h, 'fence:routeCompleted').length, 0, 'not done before the last leg');
        inst = accept(h, offer.id);
      }
      h.state.missions.active = h.state.missions.active.filter((m) => m.id !== inst.id);
      h.bus.emit('mission:completed', { missionId: inst.id });
      h.bus.emit('mission:completed', { missionId: inst.id }); // duplicate: never a second beat
    }
    const done = receipts(h, 'fence:routeCompleted');
    assert.equal(done.length, 1, 'the route completes once');
    assert.equal(done[0].schemaVersion, 1);
    assert.equal(done[0].factionId, SMUGGLER.factionId);
    assert.equal(done[0].fenceName, SMUGGLER.name);
    assert.equal(done[0].reward.kind, SMUGGLER.route.reward.kind);
    const reps = receipts(h, 'faction:repDelta').slice(repsBefore).filter((r) => r.reason === 'fence_route');
    assert.equal(reps.length, 1, 'the one-time reward, by the factions intent');
    assert.deepEqual([reps[0].factionId, reps[0].delta], [SMUGGLER.factionId, SMUGGLER.route.reward.amount]);
    const row = fenceRowOf(h.state, SMUGGLER.id);
    assert.equal(row.routeDone, true);
    assert.equal(row.route, null);

    // Never again: the next wanted dock posts the ordinary (lower-odds) job, not leg 1.
    toEpoch(h, deniableBoardEpoch(h.state) + 2);
    h.state.missions.active = [];
    dock(h, SMUGGLER.stationId);
    const after = jobRows(h, SMUGGLER.stationId).filter((o) => o.id.includes(`_${deniableBoardEpoch(h.state)}_`));
    assert.equal(after.length, 1);
    assert.equal(after[0].cause.tag, DENIABLE_CAUSE_TAG);
    assert.equal(receipts(h, 'fence:routeCompleted').length, 1);
  });

  test(`a failed leg closes the route and costs trust; abandoning does not (seed ${seed})`, () => {
    const h = makeHarness({ seed });
    trustTo(h, SMUGGLER, 2);
    dock(h, SMUGGLER.stationId);
    const inst = accept(h, jobRows(h, SMUGGLER.stationId)[0].id);
    h.bus.emit('mission:failed', { missionId: inst.id, reason: 'abandoned' });
    let row = fenceRowOf(h.state, SMUGGLER.id);
    assert.equal(row.route, null);
    assert.equal(row.trust, 2, 'walking away is not the cargo going down');
    assert.equal(row.routeDone, false, 'the route can be run again');

    h.state.missions.active = [];
    toEpoch(h, deniableBoardEpoch(h.state) + 1);
    dock(h, SMUGGLER.stationId);
    const again = accept(h, `fenceroute_${SMUGGLER.id}_1`);
    h.bus.emit('mission:failed', { missionId: again.id, reason: 'cargo_lost' });
    row = fenceRowOf(h.state, SMUGGLER.id);
    assert.equal(row.trust, 1);
    assert.equal(row.jobsLost, 1);
    assert.equal(receipts(h, 'fence:trustChanged').pop().cause, 'route_lost');
  });
}

test('every quirk shapes the job its fence posts', () => {
  const at = (fence, trust = 0) => {
    const h = makeHarness({ seed: 4242, heat: 0.3, sector: STATION_INFO.get(fence.stationId).sectorId });
    // A pilot who can berth at the fence's own (standing-gated) station holds its faction's favor.
    h.state.factions = h.state.factions || {};
    for (const id of FACTION_BY_ID.keys()) h.state.factions[id] = { ...(h.state.factions[id] || {}), rep: 1 };
    if (trust) trustTo(h, fence, trust);
    dock(h, fence.stationId);
    const offer = jobRows(h, fence.stationId).find((o) => o.cause.tag === DENIABLE_CAUSE_TAG);
    assert.ok(offer, `${fence.id} posts its job`);
    return { h, offer };
  };
  const mercy = at(FENCE_BY_ID.get('fence_hesper_quill'));
  assert.ok(['cmdty_medical', 'cmdty_food'].includes(mercy.offer.params.cmdtyId), 'mercy moves only medical/food');
  assert.ok(mercy.offer.cause.deniable.payScale < DENIABLE_PAY_SCALE, 'and pays less');
  assert.equal(mercy.offer.cause.deniable.ambushChance, 0, 'and never sets you up');

  const powder = at(FENCE_BY_ID.get('fence_cutter_ruan'));
  assert.ok(['cmdty_volatiles', 'cmdty_fuel_cells', 'cmdty_gas_hydrogen'].includes(powder.offer.params.cmdtyId));
  assert.ok(powder.offer.cause.deniable.payScale > DENIABLE_PAY_SCALE, 'volatile pays rich');
  assert.equal(powder.offer.time_limit_s, powder.offer.economyTerms.deadlineS, 'the card carries the short timer');
  assert.ok(powder.offer.time_limit_s >= 180, 'a short timer, never an impossible one');

  const corridor = at(FENCE_BY_ID.get('fence_teodor_lisk'));
  const dest = STATION_INFO.get(corridor.offer.destStationId);
  assert.ok(dest.type !== 'blackmarket' && !OUTLAW_FRIENDLY_PERSONALITIES.includes(
    FACTION_BY_ID.get(dest.factionId || dest.sector.factionId).personality), 'corridor drops lawful-side');

  const tinker = at(FENCE_BY_ID.get('fence_pyrrha_rivet'));
  assert.match(tinker.offer.title, /1\.5x pay\)$/);
  const ransom = at(FENCE_BY_ID.get('fence_ilsa_greve'));
  assert.ok(ransom.offer.cause.deniable.payScale >= 2.6, 'ransom pays the most');
});

// ── 4. ambush odds ────────────────────────────────────────────────────────────────────────────
test('ambush odds fall with trust, never rise with a sour fence, and the C11 numbers are untouched', () => {
  for (let level = 1; level <= 5; level++) {
    assert.equal(deniableAmbushChance(level, 0), deniableAmbushChance(level), 'trust 0 is C11');
    assert.equal(deniableAmbushChance(level, -3), deniableAmbushChance(level), 'a sour fence is the burn window\'s job');
    let prev = deniableAmbushChance(level);
    for (let trust = 1; trust <= 3; trust++) {
      const now = deniableAmbushChance(level, trust);
      assert.ok(now < prev || now === 0, `level ${level} trust ${trust} is lower`);
      prev = now;
    }
  }
  assert.equal(deniableAmbushChance(1), 0.6);
  assert.equal(deniableAmbushChance(5), 1);
});

for (const seed of SEEDS) {
  test(`the printed and rolled odds follow trust at the berth (seed ${seed})`, () => {
    const odds = [];
    for (const trust of [0, 1]) {
      const h = makeHarness({ seed, heat: 0.2 }); // level 1
      if (trust) trustTo(h, SMUGGLER, trust);
      dock(h, SMUGGLER.stationId);
      const offer = jobRows(h, SMUGGLER.stationId)[0];
      assert.equal(offer.cause.deniable.ambushChance, fenceAmbushChance(h.state, SMUGGLER.stationId, 1, 0));
      const inst = accept(h, offer.id);
      const row = h.state.encounterDirector.stats.deniableClauses[inst.id];
      assert.equal(row.chance, offer.cause.deniable.ambushChance, 'the clause rolls what the card printed');
      odds.push(row.chance);
    }
    assert.ok(odds[1] < odds[0], `trust 1 ${odds[1]} < trust 0 ${odds[0]}`);
  });
}

// ── 5. the scrub ──────────────────────────────────────────────────────────────────────────────
const ask = (h, fence = SMUGGLER) => h.bus.emit('ui:talkContact', {
  contactId: fenceContactId(fence), choiceId: 'fence_scrub', stationId: fence.stationId,
});

for (const seed of SEEDS) {
  test(`scrub: one level of cooling through heat.js, charged by intent, once per cooldown (seed ${seed})`, () => {
    const h = makeHarness({ seed, heat: 0.3 }); // level 2
    dock(h, SMUGGLER.stationId);
    const credits = h.state.player.credits;
    ask(h);
    assert.equal(h.state.player.heat, 0.2, 'level 2 -> level 1');
    const requests = receipts(h, 'heat:scrubRequested');
    assert.equal(requests.length, 1);
    assert.equal(requests[0].fenceId, SMUGGLER.id);
    assert.equal(requests[0].stationId, SMUGGLER.stationId);
    assert.ok(requests[0].costCr > 0);
    const charges = h.bus.emitLog.filter((e) => e.evt === 'economy:chargeCredits' && e.payload.reason === 'service:fence_scrub');
    assert.equal(charges.length, 1, 'charged by the economy intent');
    assert.equal(charges[0].payload.amount, requests[0].costCr);
    assert.equal(h.state.player.credits, credits - requests[0].costCr);
    const scrubbed = receipts(h, 'fence:scrubbed');
    assert.equal(scrubbed.length, 1);
    assert.equal(scrubbed[0].schemaVersion, 1);
    assert.equal(scrubbed[0].factionId, SMUGGLER.factionId);
    assert.equal(scrubbed[0].fenceName, SMUGGLER.name);
    assert.equal(scrubbed[0].costCr, requests[0].costCr);

    // Once per fence per cooldown: the second ask cools nothing and costs nothing.
    ask(h);
    assert.equal(h.state.player.heat, 0.2);
    assert.equal(h.bus.emitLog.filter((e) => e.evt === 'economy:chargeCredits').length, 1);
    assert.equal(receipts(h, 'fence:scrubbed').length, 1);
    assert.equal(fenceRowOf(h.state, SMUGGLER.id).lastAsk.reason, 'cooldown');

    // After the cooldown the fixer takes the last level off.
    h.state.simTime += SCRUB_COOLDOWN_S;
    ask(h);
    assert.equal(h.state.player.heat, 0, 'level 1 -> clean');
    assert.equal(receipts(h, 'fence:scrubbed').length, 2);
  });

  test(`scrub never takes a live net below its floor and never touches impound or a clean pilot (seed ${seed})`, () => {
    const nets = makeHarness({ seed, heat: 0.5 }); // level 3 = nets
    const creditsNets = nets.state.player.credits;
    ask(nets);
    assert.equal(nets.state.player.heat, 0.5, 'a live net keeps its band');
    assert.equal(nets.state.player.credits, creditsNets, 'and nothing is charged');
    assert.equal(receipts(nets, 'fence:scrubbed').length, 0);
    assert.equal(fenceRowOf(nets.state, SMUGGLER.id).lastAsk.reason, 'nets_floor');

    const high = makeHarness({ seed, heat: 0.8 }); // level 4 -> 3 is still a net
    ask(high);
    assert.equal(high.state.player.heat, 0.6);

    const impound = makeHarness({ seed, heat: 1 }); // level 5
    ask(impound);
    assert.equal(impound.state.player.heat, 1);
    assert.equal(fenceRowOf(impound.state, SMUGGLER.id).lastAsk.reason, 'impound');

    const clean = makeHarness({ seed, heat: 0 });
    ask(clean);
    assert.equal(fenceRowOf(clean.state, SMUGGLER.id).lastAsk.reason, 'clean');
    assert.equal(receipts(clean, 'heat:scrubRequested').length, 0);

    // A fence that is not a fixer, or a burned one, will not scrub.
    const burned = makeHarness({ seed, heat: 0.3 });
    burned.bus.emit('deniable:fenceBurned', { schemaVersion: 1, stationId: SMUGGLER.stationId });
    ask(burned);
    assert.equal(burned.state.player.heat, 0.3);
    const notFixer = FENCE_BY_ID.get('fence_hesper_quill');
    const other = makeHarness({ seed, heat: 0.3 });
    ask(other, notFixer);
    assert.equal(other.state.player.heat, 0.3);

    // No credits, no scrub.
    const broke = makeHarness({ seed, heat: 0.3 });
    broke.state.player.credits = 1;
    ask(broke);
    assert.equal(broke.state.player.heat, 0.3);
    assert.equal(fenceRowOf(broke.state, SMUGGLER.id).lastAsk.reason, 'credits');
  });
}

// ── 6. the tip-off ────────────────────────────────────────────────────────────────────────────
for (const seed of SEEDS) {
  test(`tip-off fires only at high heat and low trust, once per epoch, deterministically (seed ${seed})`, () => {
    const tipsAt = (heat, trust) => {
      const h = makeHarness({ seed, heat });
      if (trust > 0) trustTo(h, SMUGGLER, trust);
      const hit = [];
      for (let epoch = 2; epoch < 42; epoch++) {
        toEpoch(h, epoch);
        const before = receipts(h, 'law:fenceTip').length;
        dock(h, SMUGGLER.stationId);
        dock(h, SMUGGLER.stationId); // same epoch: never a second tip
        const n = receipts(h, 'law:fenceTip').length - before;
        assert.ok(n <= 1, 'one tip per epoch at most');
        if (n) hit.push(epoch);
      }
      return { h, hit };
    };
    const hot = tipsAt(0.8, 0); // level 4, trust 0
    assert.ok(hot.hit.length > 0, 'a cold fence sells a hot pilot');
    const tip = receipts(hot.h, 'law:fenceTip')[0];
    assert.deepEqual([tip.schemaVersion, tip.fenceId, tip.stationId, tip.sectorId, tip.factionId],
      [1, SMUGGLER.id, SMUGGLER.stationId, 'sector_pallas_drift', SMUGGLER.factionId]);
    const said = hot.h.lines.filter((l) => l.text.includes(SMUGGLER.lines.unknown));
    assert.equal(said.length, hot.hit.length, 'and says the I-do-not-know-you line each time');
    // Pure in (seed, fence, epoch, trust): the same epochs fire on a rerun.
    assert.deepEqual(hot.hit, tipsAt(0.8, 0).hit);
    assert.deepEqual(hot.hit.filter((e) => !fenceTipRoll(seed, SMUGGLER.id, e, 0)), []);

    assert.equal(tipsAt(0.5, 0).hit.length, 0, 'level 3 is not hot enough');
    assert.equal(tipsAt(0.8, 1).hit.length, 0, 'a fence that trusts you does not sell you');
    assert.equal(tipsAt(0.2, 0).hit.length, 0);
  });
}

// ── 7. first meeting, receipts, persistence ───────────────────────────────────────────────────
test('the first wanted dock is fence:met, once, with the first-meeting line; a clean dock is nothing', () => {
  const clean = makeHarness({ seed: 4242, heat: 0 });
  dock(clean, SMUGGLER.stationId);
  assert.equal(receipts(clean, 'fence:met').length, 0);
  assert.equal(clean.state.encounterDirector.stats.fences, undefined);

  const h = makeHarness({ seed: 4242, heat: 0.2 });
  dock(h, SMUGGLER.stationId);
  dock(h, SMUGGLER.stationId);
  const met = receipts(h, 'fence:met');
  assert.equal(met.length, 1);
  assert.equal(met[0].schemaVersion, 1);
  assert.equal(met[0].fenceId, SMUGGLER.id);
  assert.equal(met[0].factionId, SMUGGLER.factionId);
  assert.ok(h.lines.some((l) => l.text === `${SMUGGLER.name}: ${SMUGGLER.lines.first}`));
});

test('golden save shape: no fence met, no key - even after docks, jobs and ordinary deniable play', () => {
  const h = makeHarness({ seed: 4242, heat: 0 });
  dock(h, 'station_helios');
  dock(h, SMUGGLER.stationId);
  h.bus.emit('mission:completed', { missionId: 'm_plain' });
  h.bus.emit('mission:failed', { missionId: 'm_plain', reason: 'expired' });
  assert.equal(JSON.stringify(h.state.encounterDirector).includes('fences'), false);
  assert.equal(h.state.player.heatScrubbed, undefined);
});

for (const seed of SEEDS) {
  test(`trust, the route and the scrub clock survive a save round-trip (seed ${seed})`, () => {
    const a = makeHarness({ seed, heat: 0.3 }); // level 2: below the nets floor, so a scrub lands
    trustTo(a, SMUGGLER, 2);
    dock(a, SMUGGLER.stationId);
    accept(a, `fenceroute_${SMUGGLER.id}_1`);
    ask(a);
    const savedStats = JSON.parse(JSON.stringify(a.state.encounterDirector.stats));
    const savedHeat = JSON.parse(JSON.stringify(a.state.player.heatScrubbed || null));
    assert.ok(savedStats.fences.byId[SMUGGLER.id], 'the ledger is part of the saved stats');
    assert.ok(savedHeat, 'the scrub clock is saved with the player');

    const b = makeHarness({ seed });
    b.state.encounterDirector = undefined;
    b.director.newGame();
    b.state.encounterDirector.stats = { ...b.state.encounterDirector.stats, ...savedStats };
    b.state.simTime = a.state.simTime;
    b.director.update(1, b.state); // ensureDirectorState re-sanitizes the loaded ledger
    const row = fenceRowOf(b.state, SMUGGLER.id);
    assert.deepEqual(row, fenceRowOf(a.state, SMUGGLER.id));
    assert.equal(row.trust, 2);
    assert.equal(row.route.status, 'running');
    assert.deepEqual(sanitizeFenceLedger(savedStats.fences), b.state.encounterDirector.stats.fences);

    // Garbage in a save is dropped, not trusted; an emptied ledger removes its key.
    const c = makeHarness({ seed });
    c.state.encounterDirector.stats.fences = { byId: { fence_nobody: { trust: 3 }, [SMUGGLER.id]: { trust: 99, jobsDone: -4 } } };
    c.director.update(1, c.state);
    assert.deepEqual(Object.keys(c.state.encounterDirector.stats.fences.byId), [SMUGGLER.id]);
    assert.equal(fenceRowOf(c.state, SMUGGLER.id).trust, 3);
    assert.equal(fenceRowOf(c.state, SMUGGLER.id).jobsDone, 0);
    c.state.encounterDirector.stats.fences = { byId: { fence_nobody: { trust: 3 } } };
    c.director.update(1, c.state);
    assert.equal(c.state.encounterDirector.stats.fences, undefined);
  });
}

// ── 8. the face at the bar ────────────────────────────────────────────────────────────────────
test('the fence is at the bar when WANTED or trusted, with a line by state, a face, and a working scrub', () => {
  for (const fence of FENCES) {
    const calm = makeHarness({ seed: 4242, heat: 0 });
    assert.equal(generateContacts(fence.stationId, calm.state).some((c) => c.fenceId), false, 'clean + unknown: not there');

    const hot = makeHarness({ seed: 4242, heat: 0.3 });
    const contact = generateContacts(fence.stationId, hot.state).find((c) => c.fenceId === fence.id);
    assert.ok(contact, `${fence.id} is at ${fence.stationId} when wanted`);
    assert.equal(contact.name, fence.name);
    assert.equal(contact.line, fence.lines.first);
    assert.ok(localPortraitForContact(contact), 'the face comes from localPortraitForContact');
    assert.ok(contact.choices.some((c) => c.id === 'fence_work'));
    assert.equal(contact.choices.some((c) => c.id === 'fence_scrub'), !!fence.quirk.fixer);

    const trusted = makeHarness({ seed: 4242, heat: 0 });
    trustTo(trusted, fence, 1);
    const again = generateContacts(fence.stationId, trusted.state).find((c) => c.fenceId === fence.id);
    assert.ok(again, 'trusted: there even when clean');
    assert.equal(again.line, fence.lines.thanks, 'the line follows the ledger');

    const burned = makeHarness({ seed: 4242, heat: 0.3 });
    burned.bus.emit('deniable:fenceBurned', { schemaVersion: 1, stationId: fence.stationId });
    assert.equal(generateContacts(fence.stationId, burned.state).find((c) => c.fenceId === fence.id).line, fence.lines.burned);
  }
  assert.equal(generateContacts('station_helios', makeHarness({ heat: 0.5 }).state).some((c) => c.fenceId), false);

  // The scrub through the bar's own reply path.
  const h = makeHarness({ seed: 4242, heat: 0.3 });
  const contact = generateContacts(SMUGGLER.stationId, h.state).find((c) => c.fenceId);
  const label = contact.choices.find((c) => c.id === 'fence_scrub').label;
  assert.match(label, /Clean my record \(\d+ cr\)/);
  h.bus.emit('ui:talkContact', { contactId: contact.id, choiceId: 'fence_scrub', stationId: SMUGGLER.stationId });
  const reply = buildReply(contact.role, 'fence_scrub', { state: h.state, bus: h.bus }, SMUGGLER.stationId, contact);
  assert.match(reply.text, /^Done\./);
  assert.equal(h.state.player.heat, 0.2);
  // Work: a posted job rides the reply as an offer.
  dock(h, SMUGGLER.stationId);
  const work = buildReply(contact.role, 'fence_work', { state: h.state, bus: h.bus }, SMUGGLER.stationId, contact);
  assert.ok(work.missionOffer && work.missionOffer.cause.tag === DENIABLE_CAUSE_TAG);
});

// ── 9. the ransom ─────────────────────────────────────────────────────────────────────────────
function ransomAt(h, stationId, victimId) {
  const before = h.bus.emitLog.length;
  const credits = h.state.player.credits;
  h.bus.emit('survivorPod:ransomed', {
    id: `survivor:${victimId}`,
    outcome: 'ransomed',
    entityId: 900 + victimId,
    victimId,
    sectorId: STATION_INFO.get(stationId).sectorId,
    factionId: 'faction_scn',
    t: 12,
    reason: 'fence_delivery',
    stationId,
    authorityFactionId: 'faction_reach',
  });
  return { fresh: h.bus.emitLog.slice(before), credits };
}

for (const seed of SEEDS) {
  test(`a ransomed pod at Ilsa's station pays her scale and earns trust (seed ${seed})`, () => {
    const h = makeHarness({ seed });
    const victimId = 77;
    const { fresh, credits } = ransomAt(h, ILSA.stationId, victimId);
    const grants = fresh.filter((e) => e.evt === 'economy:grantCredits').map((e) => e.payload);
    assert.equal(grants.length, 1);
    assert.equal(FENCE_RANSOM_FEE_CR, 420, 'ransom base equals the lawful rescue fee');
    const expected = Math.round(FENCE_RANSOM_FEE_CR * ILSA.quirk.payScale);
    assert.equal(grants[0].amount, expected);
    assert.equal(grants[0].reason, `fence_ransom:${ILSA.id}`);
    assert.equal(grants[0].fenceId, ILSA.id);
    assert.equal(grants[0].victimId, victimId);
    assert.equal(h.state.player.credits, credits + expected);
    const row = fenceRowOf(h.state, ILSA.id);
    assert.equal(row.trust, 1);
    assert.equal(row.met, true);
    const changed = fresh.filter((e) => e.evt === 'fence:trustChanged').map((e) => e.payload);
    assert.equal(changed.length, 1);
    assert.equal(changed[0].cause, 'ransom');
    assert.equal(changed[0].delta, 1);
    assert.equal(changed[0].factionId, ILSA.factionId);
    const ransomed = fresh.filter((e) => e.evt === 'fence:ransomed').map((e) => e.payload);
    assert.equal(ransomed.length, 1);
    assert.equal(ransomed[0].schemaVersion, 1);
    assert.equal(ransomed[0].fenceId, ILSA.id);
    assert.equal(ransomed[0].stationId, ILSA.stationId);
    assert.equal(ransomed[0].factionId, ILSA.factionId);
    assert.equal(ransomed[0].victimId, victimId);
    assert.equal(ransomed[0].amountCr, expected);
    assert.ok(h.lines.some((row) => row.text === `${ILSA.name}: ${ILSA.lines.ransom}`));
  });

  test(`a ransom at a fence that does not want pods changes nothing (seed ${seed})`, () => {
    const h = makeHarness({ seed });
    const { fresh, credits } = ransomAt(h, SMUGGLER.stationId, 88);
    assert.equal(fresh.filter((e) => e.evt === 'economy:grantCredits').length, 0);
    assert.equal(fresh.filter((e) => e.evt === 'fence:ransomed').length, 0);
    assert.equal(fresh.filter((e) => e.evt === 'fence:trustChanged').length, 0);
    assert.equal(fresh.filter((e) => e.evt === 'fence:met').length, 0);
    assert.equal(h.state.player.credits, credits);
    assert.equal(h.lines.length, 0);
    assert.equal(h.state.encounterDirector.stats.fences, undefined);
    assert.equal(fenceRowOf(h.state, SMUGGLER.id).trust, 0);
  });
}

test('a wantsPods fence with no authored ransom line gets the generic fallback', () => {
  assert.equal(fenceRansomLine(ILSA), ILSA.lines.ransom);
  assert.equal(fenceRansomLine({ lines: {} }), FENCE_RANSOM_FALLBACK_LINE);
  assert.ok(ILSA.lines.ransom.includes('dear') && ILSA.lines.ransom.includes('Scar'));
});
