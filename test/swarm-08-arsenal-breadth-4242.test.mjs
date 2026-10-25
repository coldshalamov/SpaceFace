// SWARM-08 / build_map row 270 — the arcade arsenal's breadth leg: a second gun-gated
// synthesis (a maxed barrage plus its named rigs becomes the triad mount) and a second
// stacking passive (the gun cycler, a faster trigger per coil held). Seed 4242.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { runSession } from '../src/systems/runSession.js';
import { survivalDraft } from '../src/systems/survivalDraft.js';
import { ships, buildSlotList } from '../src/systems/ships.js';
import { economy } from '../src/systems/economy.js';
import { TECH_NODES } from '../src/data/tech.js';
import { SHIPS } from '../src/data/ships.js';
import { MODULES } from '../src/data/modules.js';
import { WEAPONS } from '../src/data/weapons.js';
import {
  SURVIVAL_EVOLUTIONS,
  SURVIVAL_EVOLUTION_DEF_IDS,
  evolutionOffersFor,
  survivalEvolutionById,
} from '../src/data/survivalEvolutions.js';
import {
  SWARM_PASSIVE_CATALOG,
  SWARM_PASSIVE_RECORD_KIND,
  SWARM_PASSIVE_STACK_MAX,
  swarmPassiveById,
  swarmPassiveCount,
  swarmPassiveFireRateScale,
} from '../src/data/swarmDraft.js';
import { swarmChain, swarmChainFireRateScale, swarmPassiveGunRateScale } from '../src/systems/swarmChain.js';
import { assertTraitMapComplete } from '../src/data/adventureTraitMap.js';

const MODULE_BY_ID = new Map(MODULES.map((def) => [def.id, def]));
const SHIP_BY_ID = new Map(SHIPS.map((def) => [def.id, def]));
const GUN = 'wpn_micro_barrage_m';
const TRIAD = SURVIVAL_EVOLUTIONS.find((row) => row.id === 'triad_volley');
const CYCLER = swarmPassiveById('gun_cycler');

function shop({ cash = 400, wave = 2, ruleset = 'swarm' } = {}) {
  const state = createGameState(4242);
  const bus = createBus();
  const registry = { get: (name) => ({ ships, economy, survivalDraft })[name] };
  const ctx = { state, bus, registry, helpers: {} };
  economy.init(ctx); ships.init(ctx); economy.newGame(); ships.newGame();
  state.player.researchedNodes = TECH_NODES.map((n) => n.id);
  ships.buyShip({ defId: 'ship_hawser', grant: true, setActive: true });
  runSession.init(ctx); survivalDraft.init(ctx); swarmChain.init(ctx);
  bus.emit('run:beginRequested', { kind: 'survival', ruleset, seed: 4242, arenaId: 'helios_core' });
  let phase = 'loadout';
  for (const next of ['arena_intro', 'wave_intro', 'active', 'cleanup']) {
    bus.emit('run:transitionRequested', { expectedPhase: phase, nextPhase: next }); phase = next;
  }
  state.run.wave = wave;
  bus.emit('run:awardRequested', { credits: cash, reason: 'round_loot' });
  bus.emit('run:transitionRequested', { expectedPhase: 'cleanup', nextPhase: 'draft' });
  return { state, bus };
}

test('every defId the synthesis shelf names is a real module, including the new trade', () => {
  for (const defId of SURVIVAL_EVOLUTION_DEF_IDS) {
    assert.ok(MODULE_BY_ID.has(defId), `${defId} resolves to a module def`);
  }
  assert.equal(assertTraitMapComplete().ok, true, 'the trait map still accounts for every trait');
  assert.ok(TRIAD, 'the shelf names the triad volley synthesis');
  assert.deepEqual(TRIAD.consumes.slice().sort(), ['mod_smart_bank', 'mod_targeting_computer_m']);
  assert.equal(TRIAD.defId, 'mod_triad_mount');
  assert.equal(TRIAD.requiresWeaponLevel.defId, GUN);
  assert.equal(TRIAD.requiresWeaponLevel.level, 5);
  assert.equal(TRIAD.consumes.includes(GUN), false, 'the gun is not spent');
  assert.ok(MODULE_BY_ID.get(TRIAD.defId), 'the product is a fittable module');
});

test('the triad trade exists exactly at gun level five with every rig held', () => {
  const drifter = SHIP_BY_ID.get('ship_drifter');
  const slots = buildSlotList(drifter);
  const fittings = slots.map((slot, index) => (index === 0 ? GUN : null));
  const parts = TRIAD.consumes.map((defId, i) => ({ instanceId: i + 1, defId }));
  const atFive = [{ kind: 'swarm_weapon_level', defId: GUN, level: 5 }];
  const noParts = evolutionOffersFor({
    hullId: 'ship_drifter', slots, fittings, moduleInventory: [], modifiers: atFive,
  });
  assert.equal(noParts.length, 0, 'no rigs, no trade');
  const underLevel = evolutionOffersFor({
    hullId: 'ship_drifter', slots, fittings,
    moduleInventory: parts, modifiers: [{ kind: 'swarm_weapon_level', defId: GUN, level: 4 }],
  });
  assert.equal(underLevel.length, 0, 'level four does not synthesize');
  const unfitted = evolutionOffersFor({
    hullId: 'ship_drifter', slots, fittings: slots.map(() => null),
    moduleInventory: parts.concat([{ instanceId: 9, defId: GUN }]),
    modifiers: atFive,
  });
  assert.equal(unfitted.length, 0, 'a levelled gun in the hold is not the fitted gun');
  const ready = evolutionOffersFor({
    hullId: 'ship_drifter', slots, fittings, moduleInventory: parts, modifiers: atFive,
  });
  assert.equal(ready.length, 1);
  assert.equal(ready[0].id, 'evo_triad_volley');
  assert.equal(ready[0].defId, 'mod_triad_mount');
  assert.equal(ready[0].price, TRIAD.price);
  assert.ok(ready[0].slotIndex >= 0, 'the M fitting has somewhere to land');
});

test('the cycler stacks on the shelf and the ledger sets the rate', () => {
  assert.ok(CYCLER, 'the passive shelf names the gun cycler');
  assert.equal(CYCLER.offerId, 'passive_gun_cycler');
  assert.ok(CYCLER.price > 0 && CYCLER.fromWave >= 1);
  assert.ok(SWARM_PASSIVE_CATALOG.length >= 2, 'the stacking shelf holds more than one passive');
  assert.equal(swarmPassiveFireRateScale(null), 1, 'no run reads stock cadence');

  const h = shop({ cash: 500, wave: 2 });
  assert.equal(swarmPassiveGunRateScale(h.state), 1, 'no coils reads stock cadence');
  const offers = survivalDraft.currentOffers();
  const row = offers.find((offer) => offer.id === 'passive_gun_cycler');
  assert.ok(row, 'the cycler is on the armory rail from wave two');
  assert.equal(row.service, 'passive');
  assert.equal(survivalDraft.resolvePick({ offerId: row.id }), true);
  assert.equal(swarmPassiveCount(h.state.run, 'gun_cycler'), 1);
  assert.ok(h.state.run.modifiers.some((record) => record.kind === SWARM_PASSIVE_RECORD_KIND
    && record.passiveId === 'gun_cycler'), 'the coil rides the run ledger');
  const oneCopy = swarmPassiveFireRateScale(h.state.run);
  assert.ok(oneCopy > 1 && oneCopy < 1.1, `one coil is a small gift (${oneCopy})`);
  assert.equal(swarmPassiveGunRateScale(h.state), oneCopy,
    'the weapons-path scale reads the same ledger');
  assert.equal(swarmChainFireRateScale(), oneCopy,
    'the armed cooldown scale carries the coils with no overdrive open');
  // One row, one coil: a service line is spent for the armory it was bought in and racks
  // again next wave. The stack climbs across drafts, not inside one rail.
  const restock = survivalDraft.currentOffers().find((offer) => offer.id === 'passive_gun_cycler');
  assert.ok(restock, 'the rack stays on the shelf, marked');
  assert.equal(restock.available, false, 'a bought row reads spent inside its own armory');
  assert.equal(survivalDraft.resolvePick({ offerId: restock.id }), false, 'no second coil here');
  h.state.run.modifiers.push({ kind: SWARM_PASSIVE_RECORD_KIND, passiveId: 'gun_cycler', count: 1 });
  assert.equal(swarmPassiveCount(h.state.run, 'gun_cycler'), 2);
  assert.ok(swarmPassiveFireRateScale(h.state.run) > oneCopy, 'the stack rises across drafts');
  // The rack caps at five copies; a ledger that somehow holds more is clamped at the cap.
  h.state.run.modifiers.push({ kind: SWARM_PASSIVE_RECORD_KIND, passiveId: 'gun_cycler', count: 99 });
  const capped = swarmPassiveFireRateScale(h.state.run);
  assert.equal(capped, 1 + SWARM_PASSIVE_STACK_MAX * CYCLER.perCopyRofPct,
    'the scale reads the rack cap, not the forged count');
  assert.equal(swarmChainFireRateScale(), capped, 'the cooldown axis caps with the rack');
});

test('outside a live swarm run the cycler grants nothing', () => {
  const h = shop({ ruleset: 'scored' });
  h.state.run.modifiers.push({ kind: SWARM_PASSIVE_RECORD_KIND, passiveId: 'gun_cycler', count: 3 });
  assert.equal(swarmPassiveFireRateScale(h.state.run), 1, 'a gauntlet run holds no swarm coils');
  assert.equal(swarmPassiveGunRateScale(h.state), 1, 'the weapons scale stays stock');
  assert.equal(swarmChainFireRateScale(), 1, 'the cooldown axis stays stock outside swarm');
});
