// FIX-04 — Swarm presentation leaks and the worker UI leak.
//   1. The sim worker (nodeSafeOnly lane) must order no main-lane presentation
//      system: swarmJuiceHud subscribing `swarm:bossIntro` in the worker read
//      `document` and threw on every Swarm boss intro.
//   2. The Choir kill ear is Adventure liturgy — no Shrine Cantor bark and no
//      sacrilege ledger write inside a live Swarm round.
//   3. World-anchored stunt words (QUICK verdict pill, "+100 PUNCHED"-style
//      score pops) are dropped in Swarm — the centre callout and the SCORE
//      figure already carry the news.
//   4. The boss started-receipt lesson is one clause of eight words or fewer,
//      so the toast fits its lane.
//   5. The left boss-row figure is a percent of its own meter — never a bare
//      N/M that reads as a second boss census beside the announcer's 1/1.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

import { createBus } from '../src/core/eventBus.js';
import { isMainLanePresentationSystemId } from '../src/core/registry.js';
import {
  getAuthoritativeInitOrder,
  getAuthoritativeUpdateOrder,
} from '../src/runtime/authoritativeSystemManifest.js';
import { resolveRuntimeManifest } from '../src/runtime/resolveRuntimeManifest.js';
import { SWARM_RULESET } from '../src/data/swarmMode.js';
import { swarmJuiceHud } from '../src/ui/swarmJuiceHud.js';
import choirResonance from '../src/systems/faction_choir.js';
import { IRON_MAW } from '../src/data/encounters/capital-boss/iron-maw.js';
import { capitalBossStartedReceipt } from '../src/ui/toasts.js';
import { survivalBossFigureText } from '../src/ui/survivalHud.js';

// ── 1. The worker lane ───────────────────────────────────────────────────────

test('the nodeSafeOnly worker lane orders no main-lane presentation system', () => {
  const init = getAuthoritativeInitOrder('production', { nodeSafeOnly: true });
  const update = getAuthoritativeUpdateOrder('production', { nodeSafeOnly: true });
  for (const id of [...init, ...update]) {
    assert.equal(isMainLanePresentationSystemId(id), false, `worker lane orders ${id}`);
  }
  assert.equal(init.includes('swarmJuiceHud'), false);
  assert.equal(update.includes('swarmJuiceHud'), false);
  // The resolved runtime manifest is the shape the sim worker actually boots.
  const resolved = resolveRuntimeManifest({ profileId: 'production', nodeSafeOnly: true });
  for (const id of [...resolved.authoritativeSystemIds, ...resolved.authoritativeUpdateOrderIds]) {
    assert.equal(isMainLanePresentationSystemId(id), false, `resolved worker lane orders ${id}`);
  }
});

test('a swarm:bossIntro emit throws nothing in a DOM-less lane', () => {
  const subs = [];
  const bus = {
    on: (name, fn) => { subs.push([name, fn]); return () => {}; },
    emit() {},
  };
  swarmJuiceHud.init({ state: { simTime: 0 }, bus, helpers: {} });
  const real = subs.find(([name]) => name === 'swarm:bossIntro');
  assert.ok(real, 'bossIntro handler is still subscribed on the main lane');
  // The exact real emitter payload shape (src/systems/swarmJuice.js):
  // { name, line, wave } — invoked under Node, where no document exists.
  assert.doesNotThrow(() => real[1]({ name: "Dreadnought 'Iron Maw'", line: 'Throw the pack into it.', wave: 10 }));
  assert.equal(swarmJuiceHud._bossHp?.name, "Dreadnought 'Iron Maw'",
    'the guarded handler still keeps its presentation model');
});

// ── 2. The Choir kill ear ────────────────────────────────────────────────────

function choirKillState(run) {
  const entities = new Map();
  const state = {
    simTime: 10, tick: 100, playerId: 1, run,
    entities, entityList: [],
  };
  // A dead choir pilgrim, killed by the player: the classic sacrilege path that
  // produced "SHRINE CANTOR: You are out of the chord…" inside Swarm round 10.
  entities.set(7, {
    id: 7, alive: false, pos: { x: 0, z: 0 }, occupantGeneration: 1,
    data: { choirPilgrim: true, pilgrimName: 'PILGRIM · LAUDS' },
  });
  return state;
}

test('a Swarm kill earns no sacrilege and no Shrine Cantor bark', () => {
  const bus = createBus();
  const logs = [];
  bus.on('comms:log', (p) => logs.push(p));
  const state = choirKillState({ kind: 'survival', phase: 'active', ruleset: SWARM_RULESET });
  choirResonance.init({ state, bus, helpers: {} });
  bus.emit('entity:killed', { id: 7, killerId: 1, pos: { x: 0, z: 0 } });
  assert.equal(logs.length, 0, 'no comms bark inside a live Swarm round');
  assert.equal(state.choir.sacrilege.length, 0, 'no sacrilege ledger row inside Swarm');
  assert.equal(state.choir.sanctuary.standing, 'none', 'no banished standing leaks out of Swarm');
});

test('the same kill still sings the liturgy in Adventure', () => {
  const bus = createBus();
  const logs = [];
  bus.on('comms:log', (p) => logs.push(p));
  const state = choirKillState(null);
  choirResonance.init({ state, bus, helpers: {} });
  bus.emit('entity:killed', { id: 7, killerId: 1, pos: { x: 0, z: 0 } });
  assert.ok(logs.some((p) => p.speaker === 'Shrine Cantor' && /out of the chord/.test(p.text)),
    'the banished bark still fires in Adventure');
  assert.equal(state.choir.sanctuary.standing, 'banished');
});

// ── 3. World-anchored stunt words ────────────────────────────────────────────

test('swarmJuiceHud paints no world-anchored killPopup score words', () => {
  const subs = [];
  const bus = {
    on: (name) => { subs.push(name); return () => {}; },
    emit() {},
  };
  swarmJuiceHud.init({ state: { simTime: 0 }, bus, helpers: {} });
  assert.equal(subs.includes('swarm:killPopup'), false,
    'the "+100 PUNCHED" world words no longer subscribe');
  for (const kept of ['swarm:announce', 'swarm:bossIntro', 'swarm:roundSlam']) {
    assert.ok(subs.includes(kept), `keeps ${kept}`);
  }
});

test('the massline release-verdict pill is gated out of a live Swarm round', () => {
  const src = readFileSync(new URL('../src/ui/masslineHud.js', import.meta.url), 'utf8');
  assert.ok(src.includes('verdict && !isSwarmGlass(state)'),
    'the QUICK verdict pill render is gated on isSwarmGlass at its call site');
});

// ── 4. The boss started-receipt lesson ───────────────────────────────────────

test('the iron maw lesson is one clause of eight words or fewer', () => {
  const lesson = IRON_MAW.score.lesson;
  assert.ok(!lesson.includes('. '), 'one clause, not a stack of sentences');
  const words = lesson.replace(/[.;:!?]/g, ' ').trim().split(/\s+/).filter(Boolean);
  assert.ok(words.length <= 8, `lesson carries ${words.length} words`);
  const receipt = capitalBossStartedReceipt({ name: 'IRON MAW', lesson, fightId: 1 });
  assert.ok(receipt, 'the receipt still mints');
  assert.ok(receipt.text.length <= 64, `receipt "${receipt.text}" fits the lane`);
});

// ── 5. The boss-row figure ───────────────────────────────────────────────────

test('the boss-row figure reads a percent of its own meter, never a count', () => {
  // One Dreadnought, two attached plates: this used to paint "2/2" beside the
  // announcer's "1/1" — two contradictory boss censuses on one boss.
  assert.equal(survivalBossFigureText({ count: 1, pct: 1, parts: { attached: 2, total: 2 } }), '100%');
  assert.equal(survivalBossFigureText({ count: 1, pct: 0.5, parts: { attached: 1, total: 2 } }), '50%');
  assert.equal(survivalBossFigureText({ count: 2, pct: 0.4 }), '40%');
  assert.equal(survivalBossFigureText({ count: 0, pct: null }), '—');
});
