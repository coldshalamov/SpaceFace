// S12 — Zombies staples with ceremony: drops paced per round, call-ins with a one-word
// callout, special rounds on the seeded cadence, and the two-slot perk pick visible beside
// the hull ring. Each test goes through the staple's existing owner; Fortify's behavioral
// proof stays in test/swarm-fortify.test.mjs.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { runSession } from '../src/systems/runSession.js';
import {
  SWARM_REPAIR_KIND,
  SWARM_REPAIR_PER_ROUND_MAX,
  swarmRepairInterval,
  swarmSupply,
} from '../src/systems/swarmSupply.js';
import { createSwarmCallinsDirector, SWARM_CALLIN_CALLOUT, LANCE_TELEGRAPH_S } from '../src/systems/swarmCallins.js';
import { SWARM_RULESET } from '../src/data/swarmMode.js';
import { SWARM_CALLIN_RECORD_KIND } from '../src/data/swarmDraft.js';
import {
  isSwarmEventWave,
  isSwarmMinorEventWave,
  swarmEventFor,
  swarmMinorEventFor,
  SWARM_EVENT_TABLES,
} from '../src/data/swarmEvents.js';
import { SURVIVAL_COHORT_TAG } from '../src/systems/waveMaterialization.js';
import { createFlightCluster } from '../src/ui/orrery/flightCluster.js';
import { fakeDom } from './helpers/fake-dom.mjs';

const SEED = 4242;
const ARENA = 'helios_core';
const HULL_MAX = 200;

function boot({ hull = HULL_MAX, modifiers = [] } = {}) {
  const state = createGameState(SEED);
  const bus = createBus();
  const emitted = [];
  const wrapped = {
    on: bus.on.bind(bus),
    off: bus.off.bind(bus),
    once: bus.once.bind(bus),
    emit(event, payload) { emitted.push({ event, payload }); bus.emit(event, payload); },
  };
  const helpers = {
    spawnEntity(spec) {
      const id = state.nextEntityId++;
      const entity = { ...spec, id, alive: true, pos: { ...spec.pos } };
      state.entities.set(id, entity);
      state.entityList.push(entity);
      wrapped.emit('entity:spawned', { id, type: entity.type, entity });
      return entity;
    },
  };
  const player = {
    id: state.nextEntityId++, alive: true, pos: { x: 0, z: 0 }, type: 'ship',
    hull, hullMax: HULL_MAX,
  };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  state.input = { actions: {} };

  const ctx = { state, bus: wrapped, helpers };
  runSession.init(ctx);
  swarmSupply.init(ctx);
  const callins = createSwarmCallinsDirector(ctx);
  callins.init();
  wrapped.emit('run:beginRequested', { kind: 'survival', ruleset: SWARM_RULESET, seed: SEED, arenaId: ARENA });
  if (modifiers.length) state.run.modifiers = modifiers;
  state.run.phase = 'active';
  state.mode = 'flight';
  return { state, bus: wrapped, emitted, helpers, player, ctx, callins };
}

let bodyN = 0;
function killCohortBody(h, { cohort = SURVIVAL_COHORT_TAG } = {}) {
  const id = h.state.nextEntityId++;
  const victim = {
    id, alive: true, type: 'ship', pos: { x: 30 + (bodyN++ % 7), z: -10 },
    vel: { x: 4, z: 0 }, data: cohort ? { runCohort: cohort } : {},
  };
  h.state.entities.set(id, victim);
  h.state.entityList.push(victim);
  h.bus.emit('entity:killed', { id, killerId: h.state.playerId, type: 'ship', pos: { ...victim.pos } });
  return victim;
}

function cells(h) {
  return h.state.entityList.filter(
    (e) => e.alive !== false && e.type === 'pickup' && e.data && e.data.kind === SWARM_REPAIR_KIND,
  );
}

test('a round pays one or two cells and no more — the medicine is rationed', () => {
  const h = boot({ hull: HULL_MAX * 0.3 });
  const interval = swarmRepairInterval(0.3);
  // Enough kills for several cells' worth — the round cap, not the interval, is the ceiling.
  for (let i = 0; i < interval * 5; i++) killCohortBody(h);
  const first = cells(h).length;
  assert.ok(first >= 1 && first <= SWARM_REPAIR_PER_ROUND_MAX,
    `one round yields 1-${SWARM_REPAIR_PER_ROUND_MAX} cells, got ${first}`);

  // A new round re-opens the ration; the old cap does not follow it.
  h.state.run.wave += 1;
  for (let i = 0; i < interval * 5; i++) killCohortBody(h);
  const total = cells(h).length;
  assert.ok(total <= SWARM_REPAIR_PER_ROUND_MAX * 2 && total > first,
    `the next round pays its own cells (${total} total)`);

  // Uncredited removals still buy nothing.
  const stray = boot({ hull: HULL_MAX * 0.3 });
  for (let i = 0; i < interval * 5; i++) killCohortBody(stray, { cohort: null });
  assert.equal(cells(stray).length, 0);
});

test('a stocked lance answers the bomb press with a telegraph and its one-word callout', () => {
  const h = boot({ modifiers: [{ kind: SWARM_CALLIN_RECORD_KIND, callinId: 'orbital_lance', count: 1 }] });
  h.state.input.actions.swarmBombThrow = true;
  h.callins.update(1 / 60, h.state);
  h.state.input.actions.swarmBombThrow = false;

  const telegraph = h.emitted.find((e) => e.event === 'swarm:callinTelegraph');
  assert.ok(telegraph, 'the paint lands before the column');
  assert.ok(telegraph.payload.atS - (h.state.simTime || 0) >= LANCE_TELEGRAPH_S - 1e-6,
    'the telegraph gives at least the authored 0.8 s');
  const call = h.emitted.find((e) => e.event === 'swarm:announce' && e.payload.kind === 'callin');
  assert.equal(call && call.payload.text, SWARM_CALLIN_CALLOUT.orbital_lance, 'LANCE! is the word');

  // The charge is spent: a second press shows nothing.
  const marks = h.emitted.length;
  h.state.input.actions.swarmBombThrow = true;
  h.callins.update(1 / 60, h.state);
  assert.equal(h.emitted.length, marks, 'an empty rack stays quiet — nothing fires, nothing shows');
});

test('a queued called charge deploys on Q with its callout — and an empty queue stays dark', () => {
  const h = boot();
  h.callins.queueCallin('turret_drop');
  h.state.input.actions.callIn = true;
  h.callins.update(1 / 60, h.state);
  h.state.input.actions.callIn = false;
  const deployed = h.emitted.find((e) => e.event === 'swarm:callinDeployed');
  assert.ok(deployed, 'the turret lands on the caller');
  const call = h.emitted.find((e) => e.event === 'swarm:announce' && e.payload.kind === 'callin');
  assert.equal(call && call.payload.text, SWARM_CALLIN_CALLOUT.turret_drop, 'TURRET! is the word');

  const quiet = boot();
  quiet.state.input.actions.callIn = true;
  quiet.callins.update(1 / 60, quiet.state);
  assert.equal(quiet.emitted.filter((e) => e.event.startsWith('swarm:callin')).length, 0,
    'nothing queued, nothing fires');
  assert.equal(quiet.emitted.filter((e) => e.event === 'swarm:announce').length, 0,
    'and nothing is announced');
});

test('the seeded cadence deals a card to every special round and to no ordinary one', () => {
  const arenas = Object.keys(SWARM_EVENT_TABLES);
  for (let w = 1; w <= 40; w++) {
    for (const arenaId of arenas) {
      const major = swarmEventFor({ arenaId, wave: w, seed: SEED });
      const minor = swarmMinorEventFor({ arenaId, wave: w, seed: SEED });
      if (isSwarmEventWave(w)) assert.ok(major, `wave ${w} in ${arenaId} must carry a major card`);
      else assert.equal(major, null, `wave ${w} is not a major round`);
      if (isSwarmMinorEventWave(w)) assert.ok(minor, `wave ${w} in ${arenaId} must carry a minor card`);
      else assert.equal(minor, null, `wave ${w} is not a minor round`);
      assert.ok(!(major && minor), 'a wave never books two events');
      // Deterministic: the same deal every replay (the minor def is a fresh stamped copy,
      // so the id — not the object — is the identity).
      assert.equal(swarmEventFor({ arenaId, wave: w, seed: SEED }), major);
      assert.equal((swarmMinorEventFor({ arenaId, wave: w, seed: SEED }) || {}).id, (minor || {}).id);
    }
  }
  // The specials are the announced cadence, not a scatter: C01-01 fills every multiple of
  // five with a champion, so the course deals no major round at all — majors are dead
  // inside the thirty; minors still ride the two off-beats of each ten (2, 8, 12, 18, 22, 28).
  assert.equal(isSwarmEventWave(10), false);
  assert.equal(isSwarmEventWave(20), false);
  assert.equal(isSwarmMinorEventWave(2), true);
  assert.equal(isSwarmMinorEventWave(18), true);
  assert.equal(isSwarmEventWave(4), false);
  assert.equal(isSwarmEventWave(13), false);
});

test('the run’s two perks mount beside the hull ring and pulse on their trigger', () => {
  const dom = fakeDom();
  dom.createElementNS = (_ns, tag) => dom._make(tag);
  dom.documentElement = dom._make('html');
  const prevDoc = globalThis.document;
  globalThis.document = dom;
  try {
    const cluster = createFlightCluster({});
    const host = dom._make('div');
    host.appendChild(cluster.el);

    const findChips = () => {
      const out = [];
      const visit = (n) => {
        if (!n || typeof n !== 'object') return;
        if (typeof n.className === 'string' && n.className.split(/\s+/).includes('orr-cluster__perk')) out.push(n);
        for (const c of n.children || []) visit(c);
      };
      visit(cluster.el);
      return out;
    };

    cluster.update({ hull: 50, hullMax: 100, perks: [], perkPulses: {} });
    assert.equal(findChips().length, 0, 'a run without perks mounts nothing');

    cluster.update({
      hull: 50, hullMax: 100,
      perks: [
        { id: 'scavenger', name: 'Scavenger', icon: 'credits' },
        { id: 'overclock', name: 'Overclock', icon: 'boost' },
        { id: 'gambler', name: 'Gambler', icon: 'spark' },
      ],
      perkPulses: {},
    });
    const chips = findChips();
    assert.equal(chips.length, 2, 'two slots, never a shelf');
    assert.equal(chips[0].title, 'Scavenger');

    cluster.update({
      perks: [
        { id: 'scavenger', name: 'Scavenger', icon: 'credits' },
        { id: 'overclock', name: 'Overclock', icon: 'boost' },
      ],
      perkPulses: { scavenger: 1 },
    });
    assert.ok(findChips()[0].classList.contains('is-pulse'), 'a trigger lights its chip');
    assert.ok(!findChips()[1].classList.contains('is-pulse'), 'the idle perk stays quiet');
    cluster.dispose();
  } finally {
    globalThis.document = prevDoc;
  }
});
