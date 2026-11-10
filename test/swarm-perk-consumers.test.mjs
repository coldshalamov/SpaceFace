// SWARM-06 perk consumers — the audit's proof half. Every pick on the Hangar's two-slot loadout
// must do what its card says once the run is live; a launch pick the game never honors is a
// sticker, not a decision. Each test drives the real owner end-to-end — swarmElites owns the
// kill/impact effects, survivalDraft owns the re-roll bench, survivalRewards owns the run wallet
// every chip pays into — and pins the same path ON (the perk stamped on run.telemetry.perks, the
// field runSession writes at begin) and OFF (the stamp absent).
// Deterministic: seeded state, manual phase transitions, no wall clock.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { rerollPrice } from '../src/data/survivalDraft.js';
import { migrateHangar } from '../src/data/swarmHangar.js';
import { TECH_NODES } from '../src/data/tech.js';
import { economy } from '../src/systems/economy.js';
import { runSession } from '../src/systems/runSession.js';
import { ships } from '../src/systems/ships.js';
import {
  CRUCIBLE_REROLL_SPEND_REASON,
  survivalDraft,
} from '../src/systems/survivalDraft.js';
import { survivalRewards } from '../src/systems/survivalRewards.js';
import { survivalRun } from '../src/systems/survivalRun.js';
import {
  resetCrucibleMetaForTests,
  saveCrucibleMeta,
} from '../src/systems/survivalRecords.js';
import { swarmElites } from '../src/systems/swarmElites.js';

const SEED = 90210;
const ARENA = 'helios_core';
const SWARM = 'swarm';

function named(h, event) {
  return h.emitted.filter((entry) => entry.event === event);
}

/* ---- the field harness: the live run plus the kill/impact owners ------------- */

function fieldHarness({ perks = [], wave = 5 } = {}) {
  const state = createGameState(SEED);
  state.run = {
    // validateRunState holds the closed-key contract — spread the real shape, never hand-roll it.
    ...createRunState({ kind: 'survival', ruleset: SWARM, seed: SEED }),
    phase: 'active',
    wave,
    arenaId: ARENA,
    telemetry: { perks: perks.slice() },
  };
  const raw = createBus();
  const emitted = [];
  const bus = {
    on: raw.on.bind(raw),
    off: raw.off.bind(raw),
    once: raw.once.bind(raw),
    emit(event, payload) { emitted.push({ event, payload }); raw.emit(event, payload); },
  };
  const routed = [];
  const ctx = {
    state, bus,
    helpers: {
      routeCombatDamage: (call) => { routed.push(call); },
      spawnBudget: { request: () => 0, bindEntity: () => true, releaseSome: () => {} },
      spawnEntity: () => null,
    },
    registry: { get: () => null },
  };
  swarmElites.init(ctx);
  survivalRewards.init(ctx);
  return { state, bus, emitted, routed };
}

function cohortBody(id, wave, { champion = false, role = 'fodder' } = {}) {
  return {
    id, alive: true, type: 'ship', pos: { x: 0, z: 0 },
    hull: 100, hullMax: 100, maxSpeed: 60, combatSpeed: 50, thrust: 40,
    data: { runCohort: 'survival', runWave: wave, runRole: role, swarmChampion: champion },
  };
}

/** A real kill receipt: the body is dead before the owners hear about it. */
function killBody(h, body) {
  body.alive = false;
  h.state.entities.set(body.id, body);
  h.bus.emit('entity:killed', { id: body.id, killerId: h.state.playerId });
}

function channelTotal(packet) {
  return Object.values((packet && packet.channels) || {}).reduce((a, b) => a + b, 0);
}

/* ---- scavenger: every tenth kill drops a bonus credit chip ------------------- */

test('scavenger: kills 10 and 20 mint a bonus chip that sweeps into the run wallet', () => {
  const h = fieldHarness({ perks: ['scavenger'] });
  for (let i = 0; i < 20; i++) killBody(h, cohortBody(100 + i, 5));
  const asks = named(h, 'swarm:bonusChip');
  assert.equal(asks.length, 2, 'every tenth kill — and only those — asked for the bonus');
  assert.match(asks[0].payload.reason, /scavenger/);
  // The wallet's own mint answered the intent: a run-wallet chip, priced like the perk says.
  const drops = named(h, 'loot:drop')
    .filter((e) => /scavenger/.test(e.payload?.items?.[0]?.grantReason || ''));
  assert.equal(drops.length, 2);
  assert.equal(drops[0].payload.items[0].credits, 25);
  assert.equal(drops[0].payload.items[0].wallet, 'run');
  // Honest pay, not a rounding path: the entitlement settles into the wallet at round clear,
  // on top of the cohort chips the same kills earned (20 fodder x 10 + 2 x 25).
  const paid = survivalRewards.sweepChips('test');
  assert.equal(paid, 250);
  const settled = named(h, 'run:awardRequested')
    .filter((e) => e.payload?.reason === 'sweep:test' && e.payload?.credits === 25);
  assert.equal(settled.length, 2, 'each bonus chip paid the run wallet once');

  const off = fieldHarness({ perks: [] });
  for (let i = 0; i < 20; i++) killBody(off, cohortBody(100 + i, 5));
  assert.equal(named(off, 'swarm:bonusChip').length, 0, 'unperked kills mint nothing extra');
  assert.equal(
    named(off, 'loot:drop')
      .filter((e) => /scavenger/.test(e.payload?.items?.[0]?.grantReason || '')).length,
    0,
  );
});

/* ---- overclock: every kill feeds the boost reserve ---------------------------- */

test('overclock: a player kill feeds the boost reserve, capped at the tank', () => {
  const h = fieldHarness({ perks: ['overclock'] });
  const player = {
    id: h.state.playerId, alive: true, type: 'ship', pos: { x: 0, z: 0 },
    boost: { energy: 10, max: 100 }, data: {},
  };
  h.state.entities.set(h.state.playerId, player);
  killBody(h, cohortBody(1, 5));
  assert.equal(player.boost.energy, 24, 'the kill fed the reserve by the perk\'s trickle');
  player.boost.energy = 95;
  killBody(h, cohortBody(2, 5));
  assert.equal(player.boost.energy, 100, 'the feed caps at the tank, never overfills');

  const off = fieldHarness({ perks: [] });
  const pilot = {
    id: off.state.playerId, alive: true, type: 'ship', pos: { x: 0, z: 0 },
    boost: { energy: 10, max: 100 }, data: {},
  };
  off.state.entities.set(off.state.playerId, pilot);
  killBody(off, cohortBody(1, 5));
  assert.equal(pilot.boost.energy, 10, 'unperked, the reserve stays where it was');
});

/* ---- chain_reactor: a kill past chain 25 detonates the body ------------------- */

test('chain_reactor: a player kill at chain 25+ cooks off the body; below the mark it stays quiet', () => {
  const h = fieldHarness({ perks: ['chain_reactor'] });
  const bystander = cohortBody(2, 5);
  bystander.pos = { x: 30, z: 0 };
  h.state.entities.set(2, bystander);

  h.bus.emit('swarm:chain', { chain: 24, wave: 5 });
  killBody(h, cohortBody(1, 5));
  assert.equal(h.routed.length, 0, 'chain 24 is under the perk\'s mark');
  assert.equal(named(h, 'charge:detonated').length, 0);

  h.bus.emit('swarm:chain', { chain: 25, wave: 5 });
  killBody(h, cohortBody(3, 5));
  assert.ok(h.routed.length >= 1, 'the blast routed damage to the hull in reach');
  assert.equal(h.routed[0].targetId, 2);
  assert.ok(channelTotal(h.routed[0].packet) > 0);
  const det = named(h, 'charge:detonated');
  assert.equal(det.length, 1);
  assert.equal(det[0].payload.trigger, 'chain_reactor');

  const off = fieldHarness({ perks: [] });
  const near = cohortBody(2, 5);
  near.pos = { x: 30, z: 0 };
  off.state.entities.set(2, near);
  off.bus.emit('swarm:chain', { chain: 60, wave: 5 });
  killBody(off, cohortBody(1, 5));
  assert.equal(off.routed.length, 0, 'no chain, however hot, detonates without the perk');
  assert.equal(named(off, 'charge:detonated').length, 0);
});

/* ---- ram_plate: the hull hits like the plated module --------------------------- */

test('ram_plate: a measured player impact routes contact damage once a beat', () => {
  const h = fieldHarness({ perks: ['ram_plate'] });
  h.state.entities.set(7, cohortBody(7, 5));
  const impact = { aId: h.state.playerId, bId: 7, playerInvolved: true, dp: 440, pos: { x: 5, z: 5 } };
  h.state.tick = 100;
  h.bus.emit('physics:impact', impact);
  assert.equal(h.routed.length, 1, 'the contact dealt damage');
  assert.equal(h.routed[0].attackerId, h.state.playerId);
  assert.equal(h.routed[0].targetId, 7);
  assert.equal(h.routed[0].packet.source.kind, 'ram_plate');
  assert.equal(channelTotal(h.routed[0].packet), 68, 'the receipt\'s dp scales the hit');
  // One ram per pair per window: the grinding contact pays once a beat, not per tick.
  h.state.tick = 110;
  h.bus.emit('physics:impact', impact);
  assert.equal(h.routed.length, 1, 'the same pair inside the window is one hit');
  h.state.tick = 131;
  h.bus.emit('physics:impact', impact);
  assert.equal(h.routed.length, 2, 'the window passed, the contact pays again');
  // A scrape under the measured bar is not a ram.
  h.state.tick = 200;
  h.bus.emit('physics:impact', { ...impact, dp: 100 });
  assert.equal(h.routed.length, 2, 'a light scrape never fires the plate');

  const off = fieldHarness({ perks: [] });
  off.state.entities.set(7, cohortBody(7, 5));
  off.state.tick = 100;
  off.bus.emit('physics:impact', impact);
  assert.equal(off.routed.length, 0, 'unperked, the hull is just a hull');
});

/* ---- bounty_hunter: champions pay three times the run credits ----------------- */

test('bounty_hunter: a champion\'s chip pays triple; a plain elite and an unperked champion pay base', () => {
  const h = fieldHarness({ perks: ['bounty_hunter'] });
  killBody(h, cohortBody(1, 5, { champion: true, role: 'elite' }));
  killBody(h, cohortBody(2, 5, { role: 'elite' }));
  const drops = named(h, 'loot:drop').map((e) => e.payload.items[0].credits);
  // Elite threat pays 60; the perk triples the champion's entitlement on the same chip.
  assert.deepEqual(drops, [180, 60], 'only the marked hull pays the bounty');
  assert.equal(survivalRewards.sweepChips('test'), 240);
  // The perk pays credits, not score — the award row stays the threat table's.
  const score = named(h, 'run:awardRequested').find((e) => e.payload?.score > 0);
  assert.equal(score.payload.score, 600);

  const off = fieldHarness({ perks: [] });
  killBody(off, cohortBody(1, 5, { champion: true, role: 'elite' }));
  assert.equal(named(off, 'loot:drop')[0].payload.items[0].credits, 60,
    'a champion without the perk pays the table price');
});

/* ---- gambler: two more re-rolls on the bench, then paid draws at half --------- */

function draftBoot({ hullId = 'ship_hornet' } = {}) {
  resetCrucibleMetaForTests();
  const state = createGameState(SEED);
  const raw = createBus();
  const emitted = [];
  const bus = {
    on: raw.on.bind(raw),
    off: raw.off.bind(raw),
    once: raw.once.bind(raw),
    emit(event, payload) { emitted.push({ event, payload }); raw.emit(event, payload); },
  };
  const registry = { get: (name) => ({ ships, economy, survivalDraft })[name] || null };
  const ctx = { state, bus, helpers: {}, registry };
  economy.init(ctx);
  ships.init(ctx);
  economy.newGame();
  ships.newGame();
  // The public Crucible launch supplies the complete arsenal to this ephemeral run.
  state.player.researchedNodes = TECH_NODES.map((node) => node.id);
  ships.buyShip({ defId: hullId, grant: true, setActive: true });
  runSession.init(ctx);
  survivalRun.init(ctx);
  survivalDraft.init(ctx);
  return { state, bus, emitted };
}

function ladderWithStars(n) {
  // Zone rows carry up to 3 stars each; spread n stars across the zones honestly.
  const zones = {};
  let left = Math.max(0, n);
  let idx = 0;
  while (left > 0) {
    const stars = Math.min(3, left);
    zones[String(idx)] = { stars, bestChain: 0 };
    left -= stars;
    idx += 1;
  }
  return { arenas: { [ARENA]: { zones, bestWave: 0, checkpoint: 0 } } };
}

function transition(h, expectedPhase, nextPhase) {
  h.bus.emit('run:transitionRequested', { expectedPhase, nextPhase, reason: 't', tick: 0 });
}

/** A between-rounds armory: begin stamped with the pick, fight, clean up, shelf opens on `wave`. */
function waveArmory(h, perks, wave) {
  h.bus.emit('run:beginRequested', {
    kind: 'survival', ruleset: SWARM, seed: SEED, arenaId: ARENA,
    perks: perks && perks.length ? perks : undefined,
  });
  transition(h, 'loadout', 'arena_intro');
  transition(h, 'arena_intro', 'wave_intro');
  transition(h, 'wave_intro', 'active');
  transition(h, 'active', 'cleanup');
  h.state.run.wave = wave;
  h.bus.emit('run:awardRequested', { credits: 4000, reason: 'round_loot' });
  transition(h, 'cleanup', 'draft');
  assert.equal(h.state.run.phase, 'draft');
}

test('gambler: two free draws ride after the Hangar\'s, then the bench sells at half price', () => {
  // The Warden's hull is big enough that the armory's hundred-card shelf cannot show the whole
  // legal pool at once — so a re-deal always has fresh cards to sell, and the paid bench opens.
  const h = draftBoot({ hullId: 'ship_warden' });
  // 8 stars earns Gambler; the Hangar carries one free draw of its own to stack under. The save
  // lands after the boot's meta reset and before begin reads it.
  saveCrucibleMeta({ ladder: ladderWithStars(8), hangar: migrateHangar({ ranks: { rerolls: 1 } }) });
  waveArmory(h, ['gambler'], 5);
  assert.deepEqual(h.state.run.telemetry.perks, ['gambler'], 'the earned pick was stamped at begin');

  let info = survivalDraft.rerollState();
  assert.equal(info.available, true);
  assert.equal(info.reason, 'hangar_reroll');
  assert.equal(info.freeRerolls, 3, 'the perk\'s two ride on top of the Hangar\'s one');
  assert.equal(info.gambler, true);
  assert.equal(survivalDraft.requestReroll(), true);
  assert.equal(h.state.run.telemetry.hangar.rerollsUsed, 1, 'the Hangar\'s draw spends first');
  assert.equal(survivalDraft.requestReroll(), true);
  assert.equal(survivalDraft.requestReroll(), true);
  const freeDeals = named(h, 'run:draftRerolled');
  assert.equal(freeDeals.length, 3);
  assert.ok(freeDeals.every((e) => e.payload.price === 0), 'all three rode free');

  info = survivalDraft.rerollState();
  assert.equal(info.reason, 'gambler_paid');
  assert.equal(info.available, true);
  const full = rerollPrice(info.wave, info.rerolls);
  assert.equal(info.price, Math.max(1, Math.round(full * 0.5)), 'half price, never free');
  const credits = h.state.run.credits;
  assert.equal(survivalDraft.requestReroll(), true);
  const charge = named(h, 'run:spendRequested')
    .find((e) => e.payload?.reason === CRUCIBLE_REROLL_SPEND_REASON);
  assert.equal(charge.payload.credits, info.price, 'the wallet was asked the halved figure');
  assert.equal(h.state.run.credits, credits - info.price, 'the draw was bought, not given');
  assert.equal(survivalDraft.rerollCount(), 4);
});

test('without gambler the same armory spends the Hangar\'s draw, then the bench is dead', () => {
  const h = draftBoot();
  saveCrucibleMeta({ ladder: ladderWithStars(8), hangar: migrateHangar({ ranks: { rerolls: 1 } }) });
  waveArmory(h, null, 1);
  assert.equal(h.state.run.telemetry.perks, undefined, 'no pick was stamped');

  const info = survivalDraft.rerollState();
  assert.equal(info.available, true);
  assert.equal(info.freeRerolls, 1, 'just the Hangar\'s own draw');
  assert.ok(!info.gambler, 'no gambler flag rides an unperked bench');
  assert.equal(survivalDraft.requestReroll(), true);
  assert.equal(named(h, 'run:draftRerolled').length, 1);

  const after = survivalDraft.rerollState();
  assert.equal(after.open, false, 'the swarm armory has no paid bench without the perk');
  assert.equal(survivalDraft.requestReroll(), false);
  assert.equal(named(h, 'run:draftRerolled').length, 1, 'no second deal happened');
  assert.equal(
    named(h, 'run:spendRequested')
      .filter((e) => e.payload?.reason === CRUCIBLE_REROLL_SPEND_REASON).length,
    0, 'no price was ever asked',
  );
});
