// inf-overdrive-voice — the chain's score cap is where the reward changes kind: the bonus stops
// climbing and the player's guns cycle at the overdrive rate for as long as the chain holds
// (swarmChainFireRateScale, read by weapons). The chain owner announced the window on
// `swarm:overdrive` and nothing listened: the triple-rate guns arrived and left in silence. The
// juice layer now names both edges through the existing announcer — the word with the rate the
// weapons read, the climb's top chime, the chain's own dip — and only a window it saw open is
// closed out loud.
//
// Harness mirrors swarm-payoff: real swarmChain + swarmJuice on one ctx, a live swarm run, the
// real brood-kill receipt driving the chain past its cap.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { createTimeEffects } from '../src/core/timeEffects.js';
import {
  swarmChain,
  swarmChainFireRateScale,
  SWARM_CHAIN_OVERDRIVE_RATE,
  SWARM_CHAIN_SCORE_CAP,
  SWARM_CHAIN_WINDOW_S,
} from '../src/systems/swarmChain.js';
import { swarmJuice, swarmClimbRate, SWARM_MOMENT_CUES } from '../src/systems/swarmJuice.js';
import { SWARM_CHAIN_TIERS, SWARM_HITSTOP_SOURCE } from '../src/data/swarmJuice.js';

const DT = 1 / 60;
/** The climb's top step: swarmClimbRate clamps any index past the ladder to the octave. */
const TOP_CHIME_RATE = swarmClimbRate(99);

function boot({ effects: effectsLevel = 'full' } = {}) {
  const state = createGameState(11);
  state.settings.video.arcadeEffects = effectsLevel;
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
  swarmChain.init(ctx);
  swarmJuice.init(ctx);
  state.run = createRunState({ kind: 'survival', ruleset: 'swarm', seed: 4242 });
  state.run.phase = 'active';
  state.run.wave = 6;
  return { state, bus, emitted, effects };
}

function teardown() {
  swarmJuice.destroy();
  swarmChain.destroy();
}

const named = (h, event) => h.emitted.filter((e) => e.event === event).map((e) => e.payload);
const overdriveCalls = (h) => named(h, 'swarm:announce').filter((p) => p.kind === 'overdrive');

/** One brood wipe: the chain owner walks every body through its own step logic. */
function wipe(h, count) {
  h.bus.emit('swarm:broodKills', { count, cause: 'direct', pos: { x: 40, z: 0 } });
}

function tick(h, seconds) {
  h.state.simTime += seconds;
  swarmChain.update(DT, h.state);
  swarmJuice.update(DT, h.state);
}

test('the cap is not a tier mark: the overdrive needs its own word', () => {
  assert.ok(!SWARM_CHAIN_TIERS.some((tier) => tier.at === SWARM_CHAIN_SCORE_CAP),
    'no chain tier names the score cap, so the tier chime never told the player');
  assert.ok(SWARM_CHAIN_OVERDRIVE_RATE > 1);
});

test('crossing the score cap names the overdrive once, with the rate the guns read', () => {
  const h = boot();
  try {
    wipe(h, SWARM_CHAIN_SCORE_CAP - 1);
    assert.equal(overdriveCalls(h).length, 0, 'below the cap the guns are ordinary and nothing says otherwise');
    assert.equal(swarmChainFireRateScale(), 1);

    wipe(h, 1);
    assert.equal(swarmChainFireRateScale(), SWARM_CHAIN_OVERDRIVE_RATE, 'the weapons now cycle at the overdrive rate');
    const calls = overdriveCalls(h);
    assert.equal(calls.length, 1, 'the gear change gets one call');
    assert.equal(calls[0].text, `OVERDRIVE · GUNS ×${SWARM_CHAIN_OVERDRIVE_RATE}`);
    assert.equal(calls[0].count, SWARM_CHAIN_SCORE_CAP);
    const chime = named(h, 'audio:cue').filter((p) => p.id === SWARM_MOMENT_CUES.chainTier
      && p.rate === TOP_CHIME_RATE);
    assert.equal(chime.length, 1, 'the climb\'s top chime marks it');
    const tierRates = SWARM_CHAIN_TIERS.map((_, i) => swarmClimbRate(i));
    assert.ok(!tierRates.includes(chime[0].rate), 'no tier mark uses that pitch, so it never reads as another rung');
    assert.ok(h.effects.describeRequests()[SWARM_HITSTOP_SOURCE], 'the chain\'s own dip lands with it');

    // The chain keeps climbing inside the same window: the overdrive is said once, not per kill.
    tick(h, 0.5);
    wipe(h, 5);
    tick(h, 0.5);
    wipe(h, 5);
    assert.equal(overdriveCalls(h).length, 1, 'one window, one opening call');
  } finally {
    teardown();
  }
});

test('the break that takes the overdrive away says so', () => {
  const h = boot();
  try {
    wipe(h, SWARM_CHAIN_SCORE_CAP + 4);
    assert.equal(overdriveCalls(h).length, 1);
    tick(h, SWARM_CHAIN_WINDOW_S + 0.1);
    assert.equal(swarmChainFireRateScale(), 1, 'the lapse returned the guns to ordinary');
    const calls = overdriveCalls(h);
    assert.equal(calls.length, 2, 'the loss of the gear has its own call');
    assert.equal(calls[1].text, 'OVERDRIVE SPENT');
    assert.equal(calls[1].count, SWARM_CHAIN_SCORE_CAP + 4);
    assert.ok(named(h, 'swarm:chainShatter').length === 1, 'the chain shatter still plays its own beat');

    // A fresh chain earns a fresh window and a fresh call.
    wipe(h, SWARM_CHAIN_SCORE_CAP);
    assert.equal(overdriveCalls(h).length, 3);
    assert.equal(overdriveCalls(h)[2].text, `OVERDRIVE · GUNS ×${SWARM_CHAIN_OVERDRIVE_RATE}`);
  } finally {
    teardown();
  }
});

test('a short chain that never reached the cap breaks without an overdrive word', () => {
  const h = boot();
  try {
    wipe(h, 20);
    tick(h, SWARM_CHAIN_WINDOW_S + 0.1);
    assert.equal(overdriveCalls(h).length, 0, 'nothing was opened, so nothing is spent');
  } finally {
    teardown();
  }
});

test('reduced arcade effects keep the words and the chime and drop the dip', () => {
  const h = boot({ effects: 'reduced' });
  try {
    wipe(h, SWARM_CHAIN_SCORE_CAP);
    assert.equal(overdriveCalls(h).length, 1, 'the word is information, not juice');
    assert.ok(named(h, 'audio:cue').some((p) => p.id === SWARM_MOMENT_CUES.chainTier && p.rate === TOP_CHIME_RATE));
    assert.ok(!h.effects.describeRequests()[SWARM_HITSTOP_SOURCE], 'no vestibular dip on reduced');
  } finally {
    teardown();
  }
});

test('a run that ends mid-overdrive closes nothing out loud; a closing receipt with no open window is ignored', () => {
  const h = boot();
  try {
    wipe(h, SWARM_CHAIN_SCORE_CAP);
    assert.equal(overdriveCalls(h).length, 1);
    h.state.run.phase = 'ended';
    tick(h, DT);                                  // the chain owner breaks it as run_over
    assert.equal(overdriveCalls(h).length, 1, 'the results plate owns that moment, not the announcer');

    // A stray close (another listener replaying the receipt) without an open window says nothing.
    h.state.run.phase = 'active';
    h.bus.emit('swarm:overdrive', { active: false, chain: 12, rate: 1, reason: 'lapsed' });
    assert.equal(overdriveCalls(h).length, 1);
  } finally {
    teardown();
  }
});
