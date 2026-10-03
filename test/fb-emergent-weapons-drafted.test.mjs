// FB-021 — the four live emergent weapons (src/data/emergentPrimitives.js) are drawn through the
// shared provenance classifier (FB-071) and drafted in the Crucible as authored verb cards, each
// sentence naming its primitive (sticks / primes / cooks / drives), gated by `fromWave` so the
// primer never appears before the detonator.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { WEAPONS } from '../src/data/weapons.js';
import { MODULES } from '../src/data/modules.js';
import { SHIPS } from '../src/data/ships.js';
import { SWARM_DRAFT_OFFERS } from '../src/data/swarmDraft.js';
import { SWARM_RULESET } from '../src/data/swarmMode.js';
import { RUN_MODIFIER_VERBS } from '../src/data/runModifiers.js';
import { classifyWeaponFamily } from '../src/data/vfxProfiles.js';
import { auditDraftShapes, draftCatalogFor, offerDraft } from '../src/data/survivalDraft.js';
import { resolveWeaponPresentationFamily } from '../src/render/vfxProfiles.js';
import { recipeForWeapon } from '../src/audio/audioSystem.js';
import { TECH_NODES } from '../src/data/tech.js';
import { economy } from '../src/systems/economy.js';
import { runSession } from '../src/systems/runSession.js';
import { ships } from '../src/systems/ships.js';
import { survivalDraft } from '../src/systems/survivalDraft.js';

const SEED = 4242;
const DEF_BY_ID = new Map(WEAPONS.map((def) => [def.id, def]));

// The four cards: defId, offer id, the display verb (must be an existing RUN_MODIFIER_VERBS row —
// new verbs orphan the validator table), the primitive word the sentence must name, the debut
// wave, and the presentation family + voice the shared classifier resolves.
const FOUR = [
  ['sticky', 'wpn_sticky_detonator', 'Trap', 'Sticks', 3, 'sticky', 'sfx_wpn_charge'],
  ['driver', 'wpn_mass_driver', 'Throw', 'Drives', 5, 'driver', 'sfx_wpn_railgun'],
  ['primer', 'wpn_conductive_primer', 'Arc', 'Primes', 7, 'primer', 'sfx_wpn_disruptor'],
  ['cooker', 'wpn_thermal_cooker', 'Burn', 'Cooks', 9, 'cooker', 'sfx_wpn_beam_laser'],
];
const CARD_BY_ID = new Map(SWARM_DRAFT_OFFERS.map((card) => [card.id, card]));

function boot(hullId = 'ship_hornet') {
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
  const registry = {
    get(name) {
      if (name === 'ships') return ships;
      if (name === 'economy') return economy;
      if (name === 'survivalDraft') return survivalDraft;
      return null;
    },
  };
  const ctx = { state, bus, helpers: {}, registry };
  economy.init(ctx);
  ships.init(ctx);
  if (economy.newGame) economy.newGame();
  if (ships.newGame) ships.newGame();
  runSession.init(ctx);
  survivalDraft.init(ctx);
  // The Crucible launch unlocks the run's arsenal; mirror that so the fit gate is the thing
  // under test, not research.
  state.player.researchPoints += TECH_NODES.reduce((s, n) => s + ((n.cost && n.cost.rp) || 0), 0) + 1000;
  economy.grantCredits(TECH_NODES.reduce((s, n) => s + ((n.cost && n.cost.credits) || 0), 0) + 5000, 'test:tech');
  for (let pass = 0; pass < TECH_NODES.length + 1; pass++) {
    let progressed = false;
    for (const node of TECH_NODES) {
      if (!state.player.researchedNodes.includes(node.id) && ships.unlockTech(node.id)) progressed = true;
    }
    if (!progressed) break;
  }
  ships.buyShip({ defId: hullId, setActive: true, grant: true });
  return { state, bus, emitted, registry };
}

/** The real Crucible route: a swarm run standing at `wave`, dropped into the draft phase. */
function openSwarmDraft(h, wave) {
  h.state.run = createRunState({ kind: 'survival', ruleset: 'swarm', seed: SEED });
  h.state.run.phase = 'draft';
  h.state.run.wave = wave;
  h.state.run.credits = 500;
  h.bus.emit('run:transitioned', { phase: 'draft' });
  return survivalDraft.currentOffers();
}

test('FB-021: the four emergent weapons have authored verb cards naming their primitives', () => {
  for (const [offerId, defId, verb, primitiveWord, fromWave] of FOUR) {
    const card = CARD_BY_ID.get(offerId);
    assert.ok(card, `SWARM_DRAFT_OFFERS carries the ${offerId} card`);
    assert.equal(card.defId, defId);
    assert.equal(card.kind, 'verb', `${offerId} is a verb card, never a number card`);
    assert.ok(RUN_MODIFIER_VERBS.includes(card.verb), `${card.verb} validates`);
    assert.equal(card.verb, verb);
    assert.equal(card.fromWave, fromWave, `${offerId} debuts at wave ${fromWave}`);
    assert.match(card.blurb, new RegExp(`^${primitiveWord}`),
      `${offerId} names its primitive: ${primitiveWord.toLowerCase()}`);
    assert.ok(!card.blurb.includes('\n') && card.blurb.length > 20, 'one clean line');
    // The defId is a live emergent weapon, not a module or an invented row.
    const def = DEF_BY_ID.get(defId);
    assert.ok(def && def.emergentPrimitive, `${defId} is a live emergent weapon`);
  }
  // And no other card squats on their defIds — authored rows own their gun.
  for (const [, defId] of FOUR) {
    assert.equal(SWARM_DRAFT_OFFERS.filter((card) => card.defId === defId).length, 1,
      `${defId} has exactly one authored card`);
  }
});

test('FB-021: the primer is gated behind the detonator — never on the shelf first', () => {
  const sticky = CARD_BY_ID.get('sticky');
  const primer = CARD_BY_ID.get('primer');
  assert.ok(sticky.fromWave < primer.fromWave,
    'the primer debuts strictly after the detonator it needs');

  const draftArgs = {
    seed: SEED, hullId: 'ship_hornet', fittings: [null, null, null],
    pickCount: 0, ruleset: SWARM_RULESET, count: 100,
  };
  // Before the primer's debut wave the detonator is already legal while the primer is not.
  const early = offerDraft({ ...draftArgs, wave: sticky.fromWave });
  assert.ok(early.offers.some((o) => o.defId === 'wpn_sticky_detonator'),
    'the detonator is on the shelf at its debut wave');
  assert.ok(!early.offers.some((o) => o.defId === 'wpn_conductive_primer'),
    'the primer is not offered before its gate');
  for (let wave = sticky.fromWave; wave < primer.fromWave; wave += 1) {
    const result = offerDraft({ ...draftArgs, wave });
    assert.ok(!result.offers.some((o) => o.defId === 'wpn_conductive_primer'),
      `wave ${wave}: the primer never surfaces before the detonator's later gate`);
  }
  // Past the gate both are legal. The authored card is the row — the generated cat_* shelf row
  // is gone now that an authored card owns the defId.
  const late = offerDraft({ ...draftArgs, wave: primer.fromWave });
  const emergentIds = new Set(FOUR.map((f) => f[1]));
  const catRows = late.offers.filter((o) => o.catalog === true && emergentIds.has(o.defId));
  assert.deepEqual(catRows, [], 'no generated shelf row shadows an authored card');
});

test('FB-021: every emergent card is draftable in the Crucible under the shape rules', () => {
  // The authored catalog keeps its shape: verb majority and no stat-smelling copy.
  const audit = auditDraftShapes(SWARM_RULESET);
  assert.equal(audit.ok, true, audit.issues.join('; '));
  assert.ok(audit.verbRatio + 1e-9 >= 2 / 3, 'verb ratio stays at or above two in three');
  assert.deepEqual(audit.smelled, [], 'no verb card reads as a +stat');

  const cards = draftCatalogFor(SWARM_RULESET);
  for (const [offerId] of FOUR) {
    const card = cards.find((entry) => entry.id === offerId);
    assert.ok(card, `${offerId} is in the swarm draft catalog`);
    assert.equal(card.kind, 'verb');
  }

  // Through offerDraft — the resolver the Crucible actually calls — the whole swarm shelf at a
  // late wave carries all four, each landing on a legal slot.
  const result = offerDraft({
    seed: SEED, wave: 12, hullId: 'ship_hornet', fittings: [null, null, null],
    pickCount: 0, ruleset: SWARM_RULESET, count: 100,
  });
  assert.equal(result.ok, true);
  for (const [offerId, defId] of FOUR) {
    const offer = result.offers.find((o) => o.defId === defId);
    assert.ok(offer, `wave 12 Crucible draft offers ${defId}`);
    assert.equal(offer.id, offerId);
    assert.equal(offer.kind, 'verb');
    assert.ok(Number.isInteger(offer.slotIndex) && offer.slotIndex >= 0,
      `${defId} resolves to a legal hardpoint`);
  }
});

test('FB-021: each card resolves a distinct presentation family and audio recipe through the shared classifier', () => {
  const families = new Set();
  const recipes = new Set();
  for (const [offerId, defId, , , , family, recipe] of FOUR) {
    // The render resolver IS the shared classifier — and the ear follows the same row.
    const render = resolveWeaponPresentationFamily(defId);
    const shared = classifyWeaponFamily(defId, DEF_BY_ID.get(defId));
    assert.equal(render.family, family, `${offerId} draws as family ${family}`);
    assert.equal(shared.family, family);
    assert.equal(recipeForWeapon(defId), recipe, `${offerId} sounds as ${recipe}`);
    families.add(render.family);
    recipes.add(recipeForWeapon(defId));
  }
  assert.equal(families.size, FOUR.length, 'four cards, four distinct presentation families');
  assert.equal(recipes.size, FOUR.length, 'four cards, four distinct voices');
});

test('FB-021: the seed-4242 Crucible offers at least one emergent card by wave 12', () => {
  const h = boot();
  const offers = openSwarmDraft(h, 12);
  const emergentIds = new Set(FOUR.map((f) => f[1]));
  const emergent = offers.filter((offer) => emergentIds.has(offer.defId) && offer.kind === 'verb');
  assert.ok(emergent.length >= 1, 'at least one authored emergent card is on the wave-12 shelf');
  for (const offer of emergent) {
    const card = CARD_BY_ID.get(offer.id);
    assert.ok(card, `${offer.id} is an authored card, not a generated shelf row`);
    assert.ok(offer.available === true || offer.unavailableReason == null
      || typeof offer.unavailableReason === 'string',
      `${offer.id} is a real offer row`);
  }
});
