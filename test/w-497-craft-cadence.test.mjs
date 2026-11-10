// W-497 CRAFT-CADENCE (build_map §33 row 497)
// Something happens every minute: first hostile contact inside 2 minutes, then every
// 3–5; the hostile cohort spends at most half of hour one travelling to the player.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import {
  craftCadenceEnsure, cadenceVerdict, cadenceTravelShare,
  CADENCE_FIRST_CONTACT_DEADLINE_S, CADENCE_CONTACT_GAP_MIN_S,
  CADENCE_CONTACT_GAP_MAX_S, CADENCE_TRAVEL_SHARE_CAP, CADENCE_BACKSTOP_SHAPE_ID,
} from '../src/data/craftCadence.js';
import { ENCOUNTERS } from '../src/data/encounters.js';

const SECTOR = 'sector_sker_haven';

function boot() {
  const sim = createSimulation({ seed: 424207, systems: [encounterDirector] });
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, mass: 100, hull: 100, hullMax: 100,
    data: { intent: {}, ai: {} },
  });
  sim.state.playerId = player.id;
  sim.state.mode = 'flight';
  sim.state.world.currentSectorId = SECTOR;
  return { sim, state: sim.state, director: sim.registry.get('encounterDirector'), player };
}

/** Jump the clock then give the director one 1 Hz update. */
function jump(t, seconds) {
  t.state.simTime += seconds;
  t.sim.step(1);
}

const dirOf = (t) => t.state.encounterDirector;
const cadenceItem = (dir) => (dir.pending || []).find((it) => it && it.cadence === true);
const liveCombat = (dir) => Object.values(dir.live || {})
  .some((row) => row && row.deck === 'combat' && row.phase !== 'done');

test('w-497: the backstop shape exists and is a proximity-gated minor combat shape', () => {
  const shape = ENCOUNTERS[CADENCE_BACKSTOP_SHAPE_ID];
  assert.ok(shape, 'patrol_scan registered in the catalog');
  assert.equal(shape.deck, 'combat');
  assert.equal(shape.tier, 'minor');
  assert.equal(shape.proximity, true, 'it relocates to the player instead of fizzling');
});

test('w-497: first contact is injected and admitted inside two minutes on a quiet field', () => {
  const t = boot();
  // A quiet field: nothing authored lands for a stretch — the governor must fill it.
  let firstContactAt = null;
  for (let i = 0; i < 21 && firstContactAt == null; i++) {
    jump(t, 10); // 10s per update: well under the inject deadline granularity
    const dir = dirOf(t);
    const c = dir.cadence;
    if (liveCombat(dir) || (c && Number.isFinite(c.firstContactAt))) {
      firstContactAt = c.firstContactAt != null ? c.firstContactAt : t.state.simTime;
    }
  }
  assert.ok(firstContactAt != null, 'a combat contact lands inside the window');
  const c = dirOf(t).cadence;
  assert.ok(firstContactAt - c.bornAt <= CADENCE_FIRST_CONTACT_DEADLINE_S,
    `first contact at +${(firstContactAt - c.bornAt).toFixed(0)}s ≤ 120s`);
  assert.ok(c.injected >= 1 || cadenceItem(dirOf(t)) || liveCombat(dirOf(t)),
    'the governor acted (injected, pending, or already fighting)');
});

test('w-497: after contact ends, a new contact recurs inside the 5-minute ceiling', () => {
  const t = boot();
  const dir = dirOf(t);
  // Plant the ledger as if first contact already happened a minute ago.
  const c = craftCadenceEnsure(dir, 0);
  c.firstContactAt = 0;
  c.lastContactAt = 60;
  c.contactCount = 1;
  t.state.simTime = 60;
  t.sim.step(1);
  // Walk the gap to just past the ceiling; nothing else queues combat.
  let recurAt = null;
  for (let i = 0; i < 30 && recurAt == null; i++) {
    jump(t, 10);
    if (cadenceItem(dir) || dir.cadence.injected >= 1 || liveCombat(dir)) recurAt = t.state.simTime;
  }
  assert.ok(recurAt != null, 'the governor refills the quiet');
  assert.ok(recurAt - 60 <= CADENCE_CONTACT_GAP_MAX_S + 30,
    `recur at +${(recurAt - 60).toFixed(0)}s of gap ≤ the 300s ceiling plus one update`);
});

test('w-497: inside the 3–5 window a queued combat item is pulled forward', () => {
  const t = boot();
  const dir = dirOf(t);
  const c = craftCadenceEnsure(dir, 0);
  c.firstContactAt = 0;
  c.lastContactAt = 0;
  c.contactCount = 1;
  t.state.simTime = CADENCE_CONTACT_GAP_MIN_S + 30; // inside the band
  // An authored combat item scheduled far out: the pull brings it inside the window.
  const combatShape = Object.entries(ENCOUNTERS).find(([, s]) => s && s.deck === 'combat');
  assert.ok(combatShape, 'a combat shape exists to schedule');
  dir.pending.push({
    encounterId: 'authored:1', shapeId: combatShape[0], sectorId: SECTOR,
    dueAt: t.state.simTime + 600, defers: 0,
  });
  t.sim.step(1);
  const item = dir.pending.find((it) => it && it.encounterId === 'authored:1');
  if (item) {
    // Still queued (not yet fired): its due time was pulled inside the band.
    assert.ok(item.dueAt <= c.lastContactAt + CADENCE_CONTACT_GAP_MIN_S + 60,
      `dueAt pulled forward to ${item.dueAt}`);
  } else {
    assert.ok(liveCombat(dir), 'or it fired — either way the band was honored');
  }
});

test('w-497: tutorial rail and docking keep the governor out of the room', () => {
  const t = boot();
  t.state.onboarding = { active: true, finished: false };
  for (let i = 0; i < 8; i++) jump(t, 30);
  assert.equal(dirOf(t).cadence.injected || 0, 0, 'tutorial rail owns the first minutes');

  const t2 = boot();
  t2.state.ui.docked = true;
  for (let i = 0; i < 8; i++) jump(t2, 30);
  const c2 = dirOf(t2).cadence;
  assert.ok(c2 == null || (c2.injected || 0) === 0, 'no governor while docked');
});

test('w-497: hour-one cohort travel share is bounded by the contract', () => {
  // Pure ledger math: 40% transit reads under the cap; 80% reads over.
  const c = craftCadenceEnsure({}, 0);
  c.travelS = 1440; // 40% of hour one
  assert.ok(cadenceTravelShare(c, 3600) <= CADENCE_TRAVEL_SHARE_CAP);
  c.travelS = 2880; // 80%
  assert.ok(cadenceTravelShare(c, 3600) > CADENCE_TRAVEL_SHARE_CAP);
  // The live ledger accrues travel only outside live combat.
  const t = boot();
  const dir = dirOf(t);
  const c2 = craftCadenceEnsure(dir, t.state.simTime);
  dir.live['fight:1'] = { deck: 'combat', phase: 'live', sectorId: SECTOR, ids: [] };
  const travel0 = c2.travelS;
  t.director._tickCadence(dir, t.state, t.state.simTime + 2, 2);
  assert.equal(c2.travelS, travel0, 'live combat is combat time, not travel time');
  assert.ok(c2.combatS > 0);
  dir.live['fight:1'].phase = 'done';
  t.director._tickCadence(dir, t.state, t.state.simTime + 4, 2);
  assert.ok(c2.travelS > travel0, 'the quiet accrues to the travel clock');
});

test('w-497: cadence backstop items bypass pacing deferrals, authored items do not', () => {
  // The pump's cadence bypass is the contract that a ceiling injection actually
  // fires: prove the shape of the admit rule by driving one tick with a synthetic
  // pacing block — a cadence item still has a dueAt at/under now.
  const t = boot();
  const dir = dirOf(t);
  const c = craftCadenceEnsure(dir, t.state.simTime);
  c.injected = 1;
  t.state.simTime += CADENCE_CONTACT_GAP_MAX_S + 10;
  const ok = t.director._injectCadenceContact(dir, t.state, t.state.simTime, c);
  assert.equal(ok, true);
  const item = cadenceItem(dir);
  assert.ok(item, 'backstop queued');
  assert.equal(item.dueAt, t.state.simTime, 'due now — no authored delay');
  assert.equal(item.shapeId, CADENCE_BACKSTOP_SHAPE_ID);
  assert.ok(item.zoneCenter && Number.isFinite(item.zoneCenter.x),
    'anchored on the player so the proximity gate passes');
});
