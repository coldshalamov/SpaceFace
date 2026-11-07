// S13 — the payoff ladder, pinned as a contract: credited kills climb DOUBLE→TRIPLE→QUAD and a
// physics wipe is a PILE-UP; empty receipts say nothing; two pile-ups inside the re-arm gap are
// ONE presentation. And the score: the run's chain lifts the mix, the shop rests, a boss burns.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { createTimeEffects } from '../src/core/timeEffects.js';
import { runSession } from '../src/systems/runSession.js';
import { swarmJuice } from '../src/systems/swarmJuice.js';
import { SWARM_HITSTOP_SOURCE } from '../src/data/swarmJuice.js';
import { SURVIVAL_COHORT_TAG } from '../src/systems/waveMaterialization.js';
import { resolveThemeMatrix, swarmChainLift } from '../src/audio/themeMatrix.js';

const DT = 1 / 60;

function boot() {
  const state = createGameState(9);
  state.settings.video.arcadeEffects = 'full';
  const raw = createBus();
  const emitted = [];
  const bus = {
    on: raw.on.bind(raw),
    off: raw.off.bind(raw),
    once: raw.once.bind(raw),
    emit(event, payload) { emitted.push({ event, payload }); raw.emit(event, payload); },
  };
  const player = { id: state.nextEntityId++, alive: true, pos: { x: 0, z: 0 }, type: 'ship', hull: 200, hullMax: 200 };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  state.simTime = 0;
  const effects = createTimeEffects(state);
  const ctx = { state, bus, helpers: {}, timeEffects: effects };
  runSession.init(ctx);
  swarmJuice.init(ctx);
  state.run = createRunState({ kind: 'survival', ruleset: 'swarm', seed: 4242 });
  state.run.phase = 'active';
  state.run.wave = 3;
  return { state, bus, emitted, player, effects };
}

function named(h, event) {
  return h.emitted.filter((e) => e.event === event);
}

function kill(h, { cause = 'direct', surface = null } = {}) {
  const id = h.state.nextEntityId++;
  const victim = { id, alive: false, type: 'ship', pos: { x: 10, z: 10 }, data: { runCohort: SURVIVAL_COHORT_TAG } };
  h.state.entities.set(id, victim);
  h.state.entityList.push(victim);
  h.bus.emit('entity:killed', {
    id, killerId: h.state.playerId, type: 'ship', pos: { x: 10, z: 10 },
    presentation: { cause, surface, playerCaused: true },
  });
}

function advance(h, seconds) {
  h.state.simTime += seconds;
  swarmJuice.update(DT, h.state);
}

test('credited kills climb the announce ladder in order', () => {
  const h = boot();
  kill(h); advance(h, 0.1);
  kill(h); advance(h, 0.1);
  kill(h); advance(h, 0.1);
  kill(h);
  const words = named(h, 'swarm:announce').map((e) => e.payload.text);
  assert.deepEqual(words, ['DOUBLE', 'TRIPLE', 'QUAD']);
  swarmJuice.destroy();
});

test('an empty kills receipt announces nothing', () => {
  const h = boot();
  h.bus.emit('swarm:broodKills', { count: 0, cause: 'direct', pos: { x: 0, z: 0 } });
  advance(h, 0.1);
  assert.equal(named(h, 'swarm:announce').length, 0);
  assert.equal(named(h, 'swarm:killPopup').length, 0);
  swarmJuice.destroy();
});

test('two pile-ups inside the re-arm gap are one presentation', () => {
  const h = boot();
  // First pile: three physics deaths arm the dip.
  kill(h, { cause: 'terrain_collision', surface: 'terrain' });
  kill(h, { cause: 'terrain_collision', surface: 'terrain' });
  kill(h, { cause: 'ship_collision', surface: 'craft' });
  advance(h, DT);
  const dipsAfterFirst = h.effects.describeRequests()[SWARM_HITSTOP_SOURCE];
  assert.ok(dipsAfterFirst, 'the first pile armed the dip');
  const firstLeft = swarmJuice._hitStopLeft;
  // Second pile lands while the re-arm gate is shut: the count grows, the dip does not re-top.
  kill(h, { cause: 'terrain_collision', surface: 'terrain' });
  kill(h, { cause: 'terrain_collision', surface: 'terrain' });
  kill(h, { cause: 'terrain_collision', surface: 'terrain' });
  advance(h, DT);
  assert.ok(swarmJuice._hitStopLeft <= firstLeft, 'a second pile inside the gap never re-arms');
  const texts = named(h, 'swarm:announce').map((e) => e.payload.text).filter((t) => t.startsWith('PILE-UP'));
  assert.ok(texts.length >= 2, 'the count still climbs — presentation, not silence');
  swarmJuice.destroy();
});

test('the score answers the run: shop calm, pressure combat, chain lift on the faders', () => {
  // The shop: docked read — the station layer, not the combat row.
  const shop = resolveThemeMatrix({ docked: true, threat: 0, scoreThreat: 0 });
  assert.equal(shop.state, 'station');
  assert.notEqual(shop.musicState, 'combat');
  // Round start, nothing committed yet: the travel row sits under combat.
  const open = resolveThemeMatrix({ docked: false, inCombat: false, threat: 0.1, scoreThreat: 0.1 });
  assert.notEqual(open.musicState, 'combat');
  // Mid-round peak: live hostiles read combat; a boss crest is the same row the chain's lift
  // drags the calm travel row toward — the faders heat as the chain climbs.
  const combat = resolveThemeMatrix({ docked: false, inCombat: true, threat: 0.9, scoreThreat: 0.9 });
  assert.equal(combat.musicState, 'combat');
  const calm = resolveThemeMatrix({ docked: false, inCombat: false, threat: 0.1, scoreThreat: 0.1, swarmLift: 0 });
  const lifted = resolveThemeMatrix({ docked: false, inCombat: false, threat: 0.1, scoreThreat: 0.1, swarmLift: 0.9 });
  const sum = (row) => Object.values(row).reduce((a, b) => a + (Number(b) || 0), 0);
  assert.ok(sum(lifted.audibleStemWeights) > sum(calm.audibleStemWeights),
    'the chain lift heats the same row it rides');
  // The lift itself is a ladder — the chain's hand on the faders never drops as it climbs.
  assert.ok(swarmChainLift(50) >= swarmChainLift(10));
  assert.ok(swarmChainLift(10) >= swarmChainLift(0));
  assert.equal(swarmChainLift(0), 0);
});
