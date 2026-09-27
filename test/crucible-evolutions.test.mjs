// CRU-038 / PQ-133.07 — named build evolutions. The Storm Carom synthesis converts Bank Shot,
// Relay Arc and Ion Payload into one evolved fitting inside the Swarm armory: explicit parts,
// explicit cost, and a result the shared attack compiler already understands.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { runSession } from '../src/systems/runSession.js';
import { survivalDraft } from '../src/systems/survivalDraft.js';
import { ships, buildSlotList } from '../src/systems/ships.js';
import { economy } from '../src/systems/economy.js';
import { TECH_NODES } from '../src/data/tech.js';
import { SHIPS } from '../src/data/ships.js';
import { MODULES } from '../src/data/modules.js';
import { validateAttackTraitCatalog, ATTACK_TRAIT_BY_ID } from '../src/data/attackTraits.js';
import { assertTraitMapComplete } from '../src/data/adventureTraitMap.js';
import {
  EVOLUTION_OFFER_KIND,
  SURVIVAL_EVOLUTIONS,
  SURVIVAL_EVOLUTION_DEF_IDS,
  evolutionOffersFor,
  survivalEvolutionById,
} from '../src/data/survivalEvolutions.js';
import { compileFittedAttackSpec } from '../src/systems/adventureMigration.js';
import { createRunState } from '../src/core/runState.js';

const SHIP_BY_ID = new Map(SHIPS.map((def) => [def.id, def]));
const MODULE_BY_ID = new Map(MODULES.map((def) => [def.id, def]));
const PARTS = ['mod_bank_shot', 'mod_relay_arc', 'mod_ion_payload'];

function shop({ cash = 400, hullId = 'ship_hawser', ruleset = 'swarm' } = {}) {
  const state = createGameState(4242);
  const bus = createBus();
  const events = [];
  for (const name of ['run:spent', 'run:draftResolved', 'run:shopPurchased',
    'module:equipped', 'module:unequipped']) {
    bus.on(name, (payload) => events.push({ name, payload }));
  }
  const registry = { get: (name) => ({ ships, economy, survivalDraft })[name] };
  const ctx = { state, bus, registry, helpers: {} };
  economy.init(ctx); ships.init(ctx); economy.newGame(); ships.newGame();
  // The public Crucible launch supplies the complete arsenal to this ephemeral run.
  state.player.researchedNodes = TECH_NODES.map((n) => n.id);
  ships.buyShip({ defId: hullId, grant: true, setActive: true });
  runSession.init(ctx); survivalDraft.init(ctx);
  bus.emit('run:beginRequested', { kind: 'survival', ruleset, seed: 4242, arenaId: 'helios_core' });
  let phase = 'loadout';
  for (const next of ['arena_intro', 'wave_intro', 'active', 'cleanup']) {
    bus.emit('run:transitionRequested', { expectedPhase: phase, nextPhase: next }); phase = next;
  }
  state.run.wave = 1;
  bus.emit('run:awardRequested', { credits: cash, reason: 'round_loot' });
  bus.emit('run:transitionRequested', { expectedPhase: 'cleanup', nextPhase: 'draft' });
  return { state, bus, events };
}

function activeFittings(state) {
  const p = state.player;
  return p.ownedShips[p.activeShipIndex].fittings;
}

function grantParts() {
  for (const defId of PARTS) ships.grantModule({ defId, reason: 'test:parts' });
}

function inventoryDefIds(state) {
  return (state.player.moduleInventory || []).map((item) => item && item.defId);
}

test('the trait and module catalogs both carry the evolved fitting cleanly', () => {
  assert.equal(validateAttackTraitCatalog().ok, true, 'attack trait catalog stays valid');
  const trait = ATTACK_TRAIT_BY_ID.mod_storm_carom;
  assert.ok(trait, 'mod_storm_carom trait exists');
  assert.equal(trait.tier, 'evolution');
  const def = MODULE_BY_ID.get('mod_storm_carom');
  assert.ok(def, 'mod_storm_carom module def exists');
  assert.equal(def.slotType, 'utility');
  assert.equal(def.size, 'S');
  // The whole map still accounts for every trait, including the new one.
  assert.equal(assertTraitMapComplete().ok, true);
});

test('every defId the catalog names is a real module, and the recipe is honest', () => {
  const evo = survivalEvolutionById('storm_carom');
  assert.ok(evo);
  assert.deepEqual(evo.consumes.slice().sort(), PARTS.slice().sort());
  assert.ok(evo.price > 0, 'explicit cost');
  for (const defId of SURVIVAL_EVOLUTION_DEF_IDS) {
    assert.ok(MODULE_BY_ID.has(defId), `${defId} resolves to a module def`);
  }
  assert.equal(SURVIVAL_EVOLUTIONS.length, 1, 'v1 ships exactly the one authored synthesis');
});

test('the offer exists exactly when the build holds every part — fitted or in the hold', () => {
  const hawser = SHIP_BY_ID.get('ship_hawser');
  const slots = buildSlotList(hawser);
  // All three parts loose in the hold: the two-slot starters can still synthesize.
  const held = evolutionOffersFor({
    hullId: 'ship_hawser', slots, fittings: ['wpn_pulse_laser_m', null, null, null, null, null, null, null],
    moduleInventory: PARTS.map((defId) => ({ instanceId: 1, defId })),
  });
  assert.equal(held.length, 1);
  assert.equal(held[0].id, 'evo_storm_carom');
  assert.equal(held[0].kind, EVOLUTION_OFFER_KIND);
  assert.equal(held[0].defId, 'mod_storm_carom');
  assert.equal(held[0].price, 48);
  assert.equal(held[0].slotIndex, 4, 'first empty utility hardpoint');
  // One part missing: no offer at all — the absence is the state.
  const short = evolutionOffersFor({
    hullId: 'ship_hawser', slots, fittings: ['wpn_pulse_laser_m', null, null, null, null, null, null, null],
    moduleInventory: PARTS.slice(0, 2).map((defId) => ({ instanceId: 1, defId })),
  });
  assert.equal(short.length, 0);
  // Already synthesized: the parts are gone with it, so the trade is not offered twice.
  const done = evolutionOffersFor({
    hullId: 'ship_hawser', slots,
    fittings: ['wpn_pulse_laser_m', null, null, null, 'mod_storm_carom', null, null, null],
    moduleInventory: PARTS.map((defId) => ({ instanceId: 1, defId })),
  });
  assert.equal(done.length, 0);
});

test('a fully-mounted part set lands the result on the slot the trade vacates', () => {
  const hawser = SHIP_BY_ID.get('ship_hawser');
  const slots = buildSlotList(hawser);
  const fittings = ['wpn_pulse_laser_m', null, null, null, 'mod_bank_shot', 'mod_relay_arc', 'mod_ion_payload', null];
  const offers = evolutionOffersFor({ hullId: 'ship_hawser', slots, fittings, moduleInventory: [] });
  assert.equal(offers.length, 1);
  assert.equal(offers[0].slotIndex, 4, 'the result lands where its parts stood');
});

test('the offer computation is deterministic', () => {
  const hawser = SHIP_BY_ID.get('ship_hawser');
  const input = {
    hullId: 'ship_hawser', slots: buildSlotList(hawser),
    fittings: ['wpn_pulse_laser_m', null, null, null, null, null, null, null],
    moduleInventory: PARTS.map((defId) => ({ instanceId: 1, defId })),
  };
  assert.deepEqual(evolutionOffersFor(input), evolutionOffersFor(input));
});

test('the Swarm armory lists the synthesis and the purchase converts the parts', () => {
  const h = shop({ cash: 400 });
  grantParts();
  const offer = survivalDraft.currentOffers().find((o) => o.id === 'evo_storm_carom');
  assert.ok(offer, 'synthesis is on the armory rail');
  assert.equal(offer.available, true);
  assert.equal(offer.price, 48);

  assert.equal(survivalDraft.resolvePick({ offerId: offer.id }), true);
  assert.equal(h.state.run.credits, 400 - 48, 'exactly its price leaves the run wallet');
  const fittings = activeFittings(h.state);
  assert.equal(fittings[offer.slotIndex], 'mod_storm_carom');
  for (const defId of PARTS) {
    assert.ok(!fittings.includes(defId), `${defId} is not fitted after conversion`);
    assert.ok(!inventoryDefIds(h.state).includes(defId), `${defId} is not a spare — it was consumed`);
  }
  const equipped = h.events.filter((e) => e.name === 'module:equipped');
  assert.equal(equipped[equipped.length - 1].payload.defId, 'mod_storm_carom');
  assert.equal(h.events.filter((e) => e.name === 'run:shopPurchased').length, 1);
  const record = h.state.run.modifiers[h.state.run.modifiers.length - 1];
  assert.equal(record.kind, 'evolution');
  assert.equal(record.defId, 'mod_storm_carom');
  assert.deepEqual(record.consumes.slice().sort(), PARTS.slice().sort());
  assert.equal(record.verb, 'Evolve');
  assert.match(survivalDraft.lastNotice(), /synthesized/i);
  // The shop stays open; the spent row is gone from the list rather than sold twice.
  assert.equal(survivalDraft.resolvePick({ offerId: offer.id }), false, 'the trade cannot be taken twice');
  assert.ok(!survivalDraft.currentOffers().some((o) => o.id === 'evo_storm_carom'),
    'the synthesis leaves the rail once its parts are gone');
});

test('parts mounted on the hull are consumed through the real unfit path, freeing hardpoints', () => {
  const h = shop({ cash: 400 });
  const fittings = activeFittings(h.state);
  // Mount all three parts the way the Lab forge package does (utility 4, 5, 6 on the Hawser).
  fittings[4] = 'mod_bank_shot'; fittings[5] = 'mod_relay_arc'; fittings[6] = 'mod_ion_payload';
  const offer = survivalDraft.currentOffers().find((o) => o.id === 'evo_storm_carom');
  assert.ok(offer, 'mounted parts make the synthesis reachable on the lab forge hull');
  assert.equal(survivalDraft.resolvePick({ offerId: offer.id }), true);
  const after = activeFittings(h.state);
  assert.equal(after[offer.slotIndex], 'mod_storm_carom');
  const emptyUtility = [4, 5, 6].filter((i) => after[i] == null).length;
  assert.equal(emptyUtility, 2, 'the conversion frees two of the three hardpoints it ate');
  assert.equal(h.state.run.credits, 400 - 48);
});

test('the gauntlet draft never lists a synthesis — no wallet, no conversion', () => {
  const h = shop({ ruleset: 'scored' });
  grantParts();
  assert.ok(!survivalDraft.currentOffers().some((o) => o.kind === EVOLUTION_OFFER_KIND));
});

test('a broke run sees the row but cannot take it, and nothing moves', () => {
  const h = shop({ cash: 0 });
  grantParts();
  const offer = survivalDraft.currentOffers().find((o) => o.id === 'evo_storm_carom');
  assert.ok(offer, 'the rail still shows the trade the run cannot afford');
  assert.equal(offer.available, false);
  const before = JSON.stringify({ fittings: activeFittings(h.state), inv: h.state.player.moduleInventory });
  assert.equal(survivalDraft.resolvePick({ offerId: offer.id }), false);
  assert.equal(JSON.stringify({ fittings: activeFittings(h.state), inv: h.state.player.moduleInventory }), before);
  assert.equal(h.state.run.credits, 0);
});

test('the evolved fitting compiles to the bounded storm: one bounce, a two-hop gated chain', () => {
  const entity = { id: 1, data: { defId: 'ship_hawser', fittings: ['wpn_pulse_laser_m', null, null, null, 'mod_storm_carom', null, null, null] } };
  const result = compileFittedAttackSpec(
    { run: createRunState({ kind: 'adventure' }) }, entity, 'wpn_pulse_laser_m');
  assert.equal(result.ok, true, JSON.stringify(result.issues));
  const spec = result.spec;
  assert.equal(spec.trajectory.bounces, 1, 'exactly one bounce');
  assert.ok(spec.propagation && spec.propagation.chain, 'the storm chains');
  assert.equal(spec.propagation.chain.count, 2, 'two hops, not the loose three-part ceiling');
  assert.equal(spec.propagation.chain.requireBounce, true, 'direct hits cannot chain');
  assert.equal(spec.propagation.chain.prerequisiteStatus, 'status_ionized', 'the storm only feeds live targets');
  const statuses = (spec.payload || []).map((p) => p.statusId);
  assert.ok(statuses.includes('status_ionized'), 'hits Ionize so a bounced hit feeds the storm it joins');
});
