// RC-09 / RC-10 / RC-11 — the starter hull and the first-minute tracker name real things.
//
//   RC-09: no `Kestrel` anywhere in the onboarding source — the tutorial calls the ship "Hitch"
//          (STARTER_WEAPON_HINT), and even the explanatory comment drops the market name.
//   RC-10: both `ship:purchased` emits in ships.js (buyShip + buyImpound) carry the catalog
//          `name`, so a `ship_kestrel` purchase lands in the chronicle as "Hitch" instead of
//          the id-derived "Kestrel" (normalize.js falls back to properName(defId) when no name
//          rides the event).
//   RC-11: the first-minute objective tracker labels the drill actors in-world — the tether
//          wreck is "Derelict" (the marked derelict of the step line) and the drill raider is
//          the actor's own name when it is already in-world ('Claim Jumper Wingman' /
//          'SCN Gunnery Buoy'), otherwise the fiction name "Fleeing Raider" — never
//          "Training Derelict" or a "trainer" billing.
//
// Run: node --test test/rc-starter-names.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { createBus } from '../src/core/eventBus.js';
import { makeEntity } from '../src/core/entity.js';
import { createSimulation } from '../src/core/sim.js';
import { BEATS as ROUTE_BEATS, onboarding } from '../src/systems/onboarding.js';
import { ships as shipsProto } from '../src/systems/ships.js';
import { chronicler } from '../src/systems/chronicler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── RC-09 ─────────────────────────────────────────────────────────────────────

test('RC-09: no Kestrel anywhere in the onboarding source', () => {
  const src = readFileSync(path.join(__dirname, '..', 'src', 'systems', 'onboarding.js'), 'utf8');
  assert.doesNotMatch(src, /\bKestrel\b/, 'onboarding.js must not name the hull "Kestrel"');
  assert.match(src, /'Hitch is armed: fire the Pulse Laser S/, 'the weapon hint names Hitch');
});

// ── RC-10 ─────────────────────────────────────────────────────────────────────

function bootShips(over = {}) {
  const bus = createBus();
  const state = {
    simTime: 0,
    tick: 0,
    entities: new Map(),
    player: { ownedShips: [], credits: 5000 },
    lossLedger: {},
    ui: {},
    ...over,
  };
  const sys = Object.create(shipsProto);
  sys.init({ state, bus, helpers: {}, registry: { get: () => null } });
  return { state, bus, sys };
}

function chronicleNameFor(payload) {
  const sim = createSimulation({ seed: 4242, systems: [chronicler] });
  sim.state.mode = 'flight';
  sim.bus.emit('ship:purchased', payload);
  sim.step();
  const facts = sim.state.chronicler.stories.flatMap((s) => s.nodes).filter((f) => f.event === 'ship:purchased');
  return facts.length ? { name: facts[0].subject.name, note: facts[0].details.note } : null;
}

test('RC-10: buyShip emits ship:purchased with the catalog name — the chronicle reads "Hitch"', () => {
  const { bus, sys } = bootShips();
  const seen = [];
  bus.on('ship:purchased', (p) => seen.push(p));
  assert.equal(sys.buyShip({ defId: 'ship_kestrel', grant: true }), true);
  assert.equal(seen.length, 1, 'one purchase receipt');
  assert.equal(seen[0].defId, 'ship_kestrel');
  assert.equal(seen[0].name, 'Hitch', 'the emit carries the hull name, not just the id');

  const fact = chronicleNameFor(seen[0]);
  assert.equal(fact.name, 'Hitch', `the chronicle subject names Hitch: ${fact.name}`);
  assert.match(fact.note, /Hitch/, `the chronicle note reads Hitch: ${fact.note}`);
});

test('RC-10: a hull whose id already names it keeps the minimal receipt shape', () => {
  // The id-derived label for ship_pelican is already "Pelican"; the emit only attaches `name`
  // when it carries information the id cannot (the starter's "Hitch"). This is also what keeps
  // the pinned UI-intent receipt shape stable.
  const { bus, sys } = bootShips();
  const seen = [];
  bus.on('ship:purchased', (p) => seen.push(p));
  assert.equal(sys.buyShip({ defId: 'ship_pelican', grant: true }), true);
  assert.equal(seen.length, 1);
  assert.deepEqual(seen[0], { defId: 'ship_pelican', price: 0 });
});

test('RC-10: buyImpound emits ship:purchased with the catalog name too', () => {
  const { bus, state, sys } = bootShips();
  state.lossLedger.impound = { listingId: 'L1', defId: 'ship_kestrel', price: 100 };
  const seen = [];
  bus.on('ship:purchased', (p) => seen.push(p));
  assert.equal(sys.buyImpound({ listingId: 'L1' }), true);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].defId, 'ship_kestrel');
  assert.equal(seen[0].name, 'Hitch', 'the impound buy-back emit also names the hull');

  const fact = chronicleNameFor(seen[0]);
  assert.equal(fact.name, 'Hitch');
});

// ── RC-11 ─────────────────────────────────────────────────────────────────────

function makeState() {
  const player = makeEntity({
    type: 'ship',
    team: 1,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    radius: 8,
    data: { weapons: [], combat: {}, ai: {} },
  });
  player.id = 1;
  return {
    meta: { seed: 4242 },
    simTime: 10,
    tick: 0,
    mode: 'flight',
    settings: { gameplay: { tutorialHints: true } },
    playerId: 1,
    player: { hints: {}, targetId: null },
    entities: new Map([[1, player]]),
    entityList: [player],
    nextEntityId: 10,
    nav: {},
    combat: { attachments: { byId: {} } },
    input: { boost: false },
    world: { activeSector: { stations: [], gates: [] } },
    story: { beatIndex: 0 },
  };
}

function bootOnboarding(over = {}) {
  const bus = createBus();
  const state = makeState();
  const helpers = {
    spawnEntity(spec) {
      const entity = makeEntity(spec);
      entity.id = state.nextEntityId++;
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      return entity;
    },
    removeEntity(id) {
      const entity = state.entities.get(id);
      if (entity) entity.alive = false;
    },
  };
  const sys = Object.create(onboarding);
  sys.init({ state, bus, helpers, registry: null });
  state.onboarding = { active: true, finished: false, currentBeat: 0, beatDoneAt: {}, firedFollowups: {}, tutorialLog: [], ...over };
  return { state, bus, sys };
}

function beatIndex(key) {
  const i = ROUTE_BEATS.findIndex((b) => b.key === key);
  assert.ok(i >= 0, `beat ${key} exists`);
  return i;
}

test('RC-11: the tether waypoint labels the wreck "Derelict", not "Training Derelict"', () => {
  const { state, sys } = bootOnboarding();
  state.onboarding.currentBeat = beatIndex('tether');
  sys._spawnDerelict();
  sys._setObjectiveWaypoint(true);
  const wp = state.nav.waypoint;
  assert.ok(wp, 'the tether beat stamps an objective waypoint');
  assert.equal(wp.label, 'Derelict');
  assert.doesNotMatch(wp.label, /training derelict|trainer/i);
});

test('RC-11: the legacy-route drill waypoint labels the raider "Fleeing Raider", not a trainer', () => {
  const { state, sys } = bootOnboarding();
  // No rescue state — the legacy 47a route: the actor still bills itself "SCN Flight Trainer"
  // (its entity name is pinned elsewhere), but the tracker label names the fiction.
  state.onboarding.currentBeat = beatIndex('marker');
  const trainer = sys._spawnTrainer('marker');
  assert.equal(trainer.name, 'SCN Flight Trainer', 'the legacy-route entity name is unchanged');
  sys._setObjectiveWaypoint(true);
  const wp = state.nav.waypoint;
  assert.ok(wp, 'the marker beat stamps an objective waypoint');
  assert.equal(wp.label, 'Fleeing Raider');
  assert.doesNotMatch(wp.label, /trainer/i);
});

test('RC-11: the rescue-route drill waypoint keeps the actor\'s in-world name', () => {
  const { state, sys } = bootOnboarding({ rescue: {} });
  state.onboarding.currentBeat = beatIndex('marker');
  const trainer = sys._spawnTrainer('marker');
  assert.equal(trainer.name, 'Claim Jumper Wingman', 'the rescue-route wingman name is unchanged');
  sys._setObjectiveWaypoint(true);
  const wp = state.nav.waypoint;
  assert.ok(wp);
  assert.equal(wp.label, 'Claim Jumper Wingman');
  assert.doesNotMatch(wp.label, /trainer/i);
});
