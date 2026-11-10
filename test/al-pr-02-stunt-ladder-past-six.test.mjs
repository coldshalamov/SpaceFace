// AL-PR-02 — the stunt-chain ladder keeps climbing past link 6 (INFERENCE_IDEAS row).
// stuntLinkRate walks a diatonic staircase across the whole 32-act combo; the old six-cell
// ladder clamp is gone. A 12-link chain must sound different from a 6-link chain, and each
// link still spends exactly one voice (no cap violations).
// Same host pattern as cv-ear-stunt-chain: init against a bare state + real bus, play() spied.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { audio } from '../src/audio/audioSystem.js';
import { stuntLinkRate } from '../src/audio/stuntScore.js';
import { resolveScoreIdentity } from '../src/audio/scoreDirector.js';

function bareState() {
  return {
    mode: 'flight',
    playerId: 7,
    entities: new Map(),
    entityList: [],
    input: { actions: {} },
    stunts: { combo: { acts: [] } },
  };
}

const trick = () => ({ trickId: 'barrel_roll', name: 'Barrel Roll', actorId: 7 });

function hostWith(state, played = []) {
  const host = Object.create(audio);
  host.play = (recipeId, opts) => { played.push({ recipeId, opts }); return null; };
  const bus = createBus();
  host.init({ state, bus, helpers: {} });
  return { host, bus };
}

function playChain(state, bus, links) {
  for (let i = 0; i < links; i++) {
    state.stunts.combo.acts.push({}); // recordTrick commits the act before the emit
    bus.emit('stunt:trickDetected', trick());
  }
}

test('a 12-link chain climbs past where a 6-link chain stops', () => {
  const state = bareState();
  const played = [];
  const { host, bus } = hostWith(state, played);
  host.rt._scoreIdentity = resolveScoreIdentity('sector_helios_prime');
  playChain(state, bus, 12);
  const rates = played.map((p) => p.opts.rate);
  // Links 7–12 each rise past their predecessor — the rung does not plateau at link 6.
  for (let i = 6; i < 12; i++) {
    assert.ok(rates[i] > rates[i - 1],
      `link ${i + 1} must climb past link ${i} — got ${rates.join(', ')}`);
  }
  assert.ok(rates[11] > rates[5], `link 12 (${rates[11]}) must sound above link 6 (${rates[5]})`);
  // One pluck per link: twelve links spend twelve voices, never more.
  assert.equal(played.filter((p) => p.recipeId === 'sfx_stunt_link').length, 12);
});

test('a 6-link chain and a 12-link chain resolve different ladders', () => {
  const sixState = bareState(), sixPlayed = [];
  const six = hostWith(sixState, sixPlayed);
  six.host.rt._scoreIdentity = resolveScoreIdentity('sector_helios_prime');
  playChain(sixState, six.bus, 6);

  const twelveState = bareState(), twelvePlayed = [];
  const twelve = hostWith(twelveState, twelvePlayed);
  twelve.host.rt._scoreIdentity = resolveScoreIdentity('sector_helios_prime');
  playChain(twelveState, twelve.bus, 12);

  assert.equal(sixPlayed.length, 6);
  assert.equal(twelvePlayed.length, 12);
  const sixTop = sixPlayed.at(-1).opts.rate;
  const twelveTop = twelvePlayed.at(-1).opts.rate;
  assert.notEqual(twelveTop, sixTop, 'the 12th link must not repeat the 6th rung — that was the clamp');
  assert.ok(twelveTop > sixTop, 'the longer chain ends higher');
});

test('stuntLinkRate stays strict and unclamped from link 1 through the 32-act combo cap', () => {
  for (const sector of ['sector_helios_prime', 'sector_sker_haven']) {
    const identity = resolveScoreIdentity(sector);
    const rates = Array.from({ length: 32 }, (_, i) => stuntLinkRate(i + 1, identity));
    for (let i = 1; i < rates.length; i++) {
      assert.ok(rates[i] > rates[i - 1],
        `${sector}: link ${i + 1} (${rates[i]}) must climb past link ${i} (${rates[i - 1]})`);
    }
    assert.ok(rates[11] > rates[5], `${sector}: link 12 must differ from link 6`);
  }
});
