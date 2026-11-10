// SWARM-06 wager enforcement — the two Threat cards that rewrite the armory's rules now hold in
// the system that sells, not just the door that shows them. Draftless never deals: the phase
// still resolves on its own receipt, and every shopping seam — pick, purchase, demo, hold,
// re-deal, sell-back — is refused while kills, refits and the run itself stay lawful.
// No Re-rolls opens the shelf exactly once: the free Hangar draw, Gambler's bench and the paid
// roll are all refused by the same owner before a wallet is ever asked.
// Deterministic: seeded state, manual phase transitions, no wall clock.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { TECH_NODES } from '../src/data/tech.js';
import { migrateHangar } from '../src/data/swarmHangar.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import { economy } from '../src/systems/economy.js';
import { runSession } from '../src/systems/runSession.js';
import { ships } from '../src/systems/ships.js';
import {
  CRUCIBLE_REROLL_SPEND_REASON,
  survivalDraft,
} from '../src/systems/survivalDraft.js';
import { survivalRun } from '../src/systems/survivalRun.js';
import { resetCrucibleMetaForTests } from '../src/systems/survivalRecords.js';

const SEED = 90210;
const ARENA = 'helios_core';
const SWARM = 'swarm';
const DT = 1 / 60;

function boot() {
  resetCrucibleMetaForTests();
  const state = createGameState(SEED);
  const raw = createBus();
  const emitted = [];
  const bus = {
    on: raw.on.bind(raw),
    off: raw.off.bind(raw),
    once: raw.once.bind(raw),
    emit(event, payload) {
      emitted.push({ event, payload });
      raw.emit(event, payload);
    },
  };
  const registry = { get: (name) => ({ ships, economy, survivalDraft })[name] || null };
  const ctx = { state, bus, helpers: {}, registry };
  economy.init(ctx);
  ships.init(ctx);
  economy.newGame();
  ships.newGame();
  // The public Crucible launch supplies the complete arsenal to this ephemeral run.
  state.player.researchedNodes = TECH_NODES.map((node) => node.id);
  ships.buyShip({ defId: 'ship_hornet', grant: true, setActive: true });
  runSession.init(ctx);
  survivalRun.init(ctx);
  survivalDraft.init(ctx);
  return { state, bus, emitted };
}

function named(h, event) {
  return h.emitted.filter((entry) => entry.event === event);
}

function transition(h, expectedPhase, nextPhase) {
  h.bus.emit('run:transitionRequested', { expectedPhase, nextPhase, reason: 't', tick: 0 });
}

function begin(h, threats) {
  h.bus.emit('run:beginRequested', {
    kind: 'survival', ruleset: SWARM, seed: SEED, arenaId: ARENA,
    threats: threats && threats.length ? threats : undefined,
  });
  return h.state.run;
}

/** The swarm's real opening: loadout leads straight into the armory stop. */
function openingArmory(h, threats) {
  begin(h, threats);
  assert.equal(h.state.run.phase, 'loadout');
  transition(h, 'loadout', 'draft');
  assert.equal(h.state.run.phase, 'draft');
}

/** A between-rounds armory: fight, clean up, then the shelf opens on `wave`. */
function waveArmory(h, threats, wave) {
  begin(h, threats);
  transition(h, 'loadout', 'arena_intro');
  transition(h, 'arena_intro', 'wave_intro');
  transition(h, 'wave_intro', 'active');
  transition(h, 'active', 'cleanup');
  h.state.run.wave = wave;
  h.bus.emit('run:awardRequested', { credits: 4000, reason: 'round_loot' });
  transition(h, 'cleanup', 'draft');
  assert.equal(h.state.run.phase, 'draft');
}

test('an un-wagered armory still deals a shelf and answers its re-roll bench', () => {
  const h = boot();
  waveArmory(h, null, 1);
  const dealt = named(h, 'run:draftOffered');
  assert.equal(dealt.length, 1);
  assert.ok(dealt[0].payload.offers.length > 0, 'the shelf dealt stock');
  assert.equal(
    named(h, 'ui:pushScreen').some((entry) => entry.payload.id === 'crucibleDraft'), true,
    'the armory surface opened',
  );
  const offers = survivalDraft.currentOffers();
  assert.ok(offers.some((row) => row.available), 'a funded armory has a buyable row');

  // The Hangar's free draw re-deals through the same owner — a receipt, a new deal, a spent rank.
  h.state.run.telemetry.hangar = migrateHangar({ ranks: { rerolls: 1 } });
  const info = survivalDraft.rerollState();
  assert.equal(info.available, true);
  assert.equal(info.reason, 'hangar_reroll');
  assert.equal(survivalDraft.requestReroll(), true);
  assert.equal(named(h, 'run:draftRerolled').length, 1);
  assert.equal(survivalDraft.rerollCount(), 1);
  assert.equal(h.state.run.telemetry.hangar.rerollsUsed, 1, 'the free draw was spent');
  assert.ok(survivalDraft.currentOffers().length > 0, 'the re-dealt shelf stays open');
});

test('Draftless: the armory never deals — no shelf, no transactions, and the run still flows', () => {
  const h = boot();
  openingArmory(h, ['draftless']);
  // The wager folded into the challenge contract at run:started — the same mutator a queued
  // challenge would carry, stamped off the launch pick rather than re-derived downstream.
  assert.deepEqual(h.state.run.telemetry.threats, ['draftless']);
  assert.ok(h.state.run.arenaMutators.includes('draftless'));

  // The opening stop resolved on the wager's word, without dealing a single row.
  assert.equal(named(h, 'run:draftResolved').length, 1);
  assert.equal(named(h, 'run:draftResolved')[0].payload.reason, 'draftless');
  assert.equal(named(h, 'run:draftOffered').length, 0, 'nothing was ever dealt');
  assert.equal(
    named(h, 'ui:pushScreen').some((entry) => entry.payload.id === 'crucibleDraft'), false,
    'no armory surface opens',
  );
  assert.deepEqual(survivalDraft.currentOffers(), []);

  // Every shopping verb is refused while the phase sits in draft — card, hold, re-deal.
  assert.equal(survivalDraft.resolvePick({ offerId: 'any-card' }), false);
  assert.equal(survivalDraft.resolvePick({ offerId: 'any-card', demo: true }), false);
  assert.equal(survivalDraft.lockOffer({ offerId: 'any-card' }), false);
  assert.equal(survivalDraft.requestReroll(), false);
  assert.equal(survivalDraft.refitSell({ slotIndex: 0 }), false);
  assert.match(survivalDraft.lastNotice(), /armory is closed/i);

  // The wager cannot stall the run: the phase machine moves on the resolution receipt alone.
  survivalRun.update(DT);
  assert.equal(h.state.run.phase, 'wave_intro');

  // And it holds on every between-rounds pass, including the refit wave — the bench still
  // benches, it just will not buy anything back.
  for (const wave of [1, 2, 10]) {
    transition(h, 'wave_intro', 'active');
    transition(h, 'active', 'cleanup');
    h.state.run.wave = wave;
    transition(h, 'cleanup', 'draft');
    assert.equal(h.state.run.phase, 'draft');
    assert.deepEqual(survivalDraft.currentOffers(), [], `wave ${wave} dealt nothing`);
    assert.equal(survivalDraft.resolvePick({ offerId: null }), false, 'already resolved');
    survivalRun.update(DT);
    if (wave === 10) {
      assert.equal(h.state.run.phase, 'refit', 'the refit bench still opens');
      assert.equal(survivalDraft.refitSell({ slotIndex: 0 }), false);
      survivalDraft.closeRefit();
      survivalRun.update(DT);
    }
    assert.equal(h.state.run.phase, 'wave_intro', `wave ${wave} flowed through the dead shop`);
  }

  const resolvedReasons = named(h, 'run:draftResolved').map((entry) => entry.payload.reason);
  assert.ok(resolvedReasons.length >= 4 && resolvedReasons.every((reason) => reason === 'draftless'));
  assert.equal(named(h, 'run:draftOffered').length, 0, 'no draft ever dealt a shelf');
  assert.equal(
    named(h, 'run:spendRequested').length, 0,
    'no purchase or re-roll ever reached for the wallet',
  );
  assert.equal(named(h, 'run:shopPurchased').length, 0);
});

test('No Re-rolls: the shelf deals once, then every bench — free or paid — is refused', () => {
  const h = boot();
  waveArmory(h, ['no_rerolls'], 1);
  assert.deepEqual(h.state.run.telemetry.threats, ['no_rerolls']);
  assert.ok(h.state.run.arenaMutators.includes('no_reroll'));

  // The wager strikes the re-deal, not the deal: the shelf still stocks and still sells.
  const dealt = named(h, 'run:draftOffered');
  assert.equal(dealt.length, 1);
  assert.ok(dealt[0].payload.offers.length > 0);

  // Both free benches are stocked and both are refused by the same gate before the wallet.
  h.state.run.telemetry.hangar = migrateHangar({ ranks: { rerolls: 2 } });
  h.state.run.telemetry.perks = ['gambler'];
  const info = survivalDraft.rerollState();
  assert.equal(info.available, false);
  assert.equal(info.reason, 'no_reroll');
  assert.match(info.note, /shelf deals once/i);

  const shelfBefore = survivalDraft.currentOffers().map((row) => row.id).join('|');
  const creditsBefore = h.state.run.credits;
  // The keyboard/headless seam, not the button: the intent event itself is refused.
  h.bus.emit('run:draftRerollRequested');
  const refused = named(h, 'run:draftRerollRejected');
  assert.equal(refused.length, 1);
  assert.equal(refused[0].payload.reason, 'no_reroll');
  assert.equal(named(h, 'run:draftRerolled').length, 0, 'no re-deal happened');
  assert.equal(
    named(h, 'run:spendRequested').filter(
      (entry) => entry.payload.reason === CRUCIBLE_REROLL_SPEND_REASON,
    ).length, 0,
    'no charge was ever asked for',
  );
  assert.equal(h.state.run.telemetry.hangar.rerollsUsed, 0, 'the free draw was not consumed');
  assert.equal(h.state.run.credits, creditsBefore);
  assert.equal(
    survivalDraft.currentOffers().map((row) => row.id).join('|'), shelfBefore,
    'the dealt shelf is the shelf you fly',
  );
  assert.match(survivalDraft.lastNotice(), /shelf deals once/i);

  // Shopping itself still works — the wager is a re-roll ban, not a closed armory.
  const offer = survivalDraft.currentOffers().find((row) => row.available);
  assert.ok(offer, 'the dealt shelf still sells');
  assert.equal(survivalDraft.resolvePick({ offerId: offer.id }), true);
  assert.equal(h.state.run.credits, creditsBefore - offer.price);
  assert.equal(named(h, 'run:shopPurchased').length, 1);
});

test('a wager that lives outside the armory still lands: Thick Pack pressures the room', () => {
  const h = boot();
  begin(h, ['thick_pack']);
  assert.deepEqual(h.state.run.telemetry.threats, ['thick_pack']);
  assert.deepEqual(h.state.run.arenaMutators, [], 'a room threat is not a rules rewrite');

  const base = planWave({ seed: SEED, wave: 3, arenaId: ARENA, ruleset: SWARM });
  const packed = planWave({
    seed: SEED, wave: 3, arenaId: ARENA, ruleset: SWARM, swarmThreats: ['thick_pack'],
  });
  assert.deepEqual(packed.swarm.threats, ['thick_pack']);
  assert.ok(Math.abs(packed.swarm.pressureScale - 1.35) < 1e-9);
  assert.ok(packed.swarm.killTarget > base.swarm.killTarget, 'the thicker room owes more bodies');
});
