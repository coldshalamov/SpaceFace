// THE CHRONICLER REMEMBERS THE BIG BEATS — marquee deed families become first-class facts.
//
// Contract (deterministic, sim-time only; every payload field name copied from the real emitter):
//   1. `ship:purchased`   (src/systems/ships.js:2173, { defId, price }) records one fact per hull
//      id — a different hull is a new beat, re-buying the same hull dedupes;
//   2. `achievement:unlocked` (src/systems/achievements.js:1010, { id, name, category, at, via,
//      retroactive }) records the unlock and dedupes on the achievement id;
//   3. `career:ladder:completed` (src/careers/ladders/ladderShared.js:821, { careerId, receiptId,
//      nonBinding, simTime }) records one completion per career and dedupes on the career id;
//   4. `stunt:trickDetected` (src/systems/stuntGrammar.js:189, the trick receipt from
//      src/combat/stuntRecognition.js) records ONLY marquee tricks — legendary outright, rare
//      with collateral — and dedupes on the episode id. Below the gate: noise, not a fact.
//
// All four ride the existing 'story' stage, so the fact's own details.title/note becomes the
// story view's headline and summary (narrative.js story branch) — no new stage, no new priority.
// Run: node --test test/infer-chronicler-big-beats.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { chronicler } from '../src/systems/chronicler.js';

const SEED = 4242;

function boot() {
  const sim = createSimulation({ seed: SEED, systems: [chronicler] });
  sim.state.mode = 'flight';
  sim.state.world.currentSectorId = 'sector_ceres_belt';
  return { sim, state: sim.state, bus: sim.bus, chron: sim.registry.get('chronicler') };
}

function facts(state) {
  return state.chronicler.stories.flatMap((s) => s.nodes);
}

function factsFor(state, event) {
  return facts(state).filter((f) => f.event === event);
}

function step(t, ticks = 1) {
  for (let i = 0; i < ticks; i++) t.sim.step();
}

/** Real trick receipt shape (fields read by consumers: stuntGrammar pay, marketNews, titles). */
function trickReceipt(over = {}) {
  return {
    schemaVersion: 2, trickId: 'slingshot_golf', name: 'Slingshot Golf',
    rarity: 'legendary', baseScore: 200, family: 'field', role: 'primary',
    actorId: 0, targetId: 'pirate_7', secondaryIds: [],
    episodeId: 'ep_sling_1', rootId: 'ep_sling_1', rootTick: 120, tick: 260,
    firstPayoffTick: 260, amendment: false, amendmentDeadline: 740,
    victimLives: [], modifiers: { razorRelease: null, collateralCount: 1, closeShave: false },
    causeChain: [], factualTags: [], evidenceRevision: 1, encounterId: null,
    ...over,
  };
}

test('a ship purchase lands as a fact that names the hull, and re-buying the hull dedupes', () => {
  const t = boot();
  t.bus.emit('ship:purchased', { defId: 'ship_kestrel', price: 4800 });
  step(t);

  const bought = factsFor(t.state, 'ship:purchased');
  assert.equal(bought.length, 1, 'exactly one fact for the first purchase');
  const fact = bought[0];
  assert.equal(fact.stage, 'story', 'deeds ride the existing story stage');
  assert.equal(fact.details.defId, 'ship_kestrel');
  assert.equal(fact.actor.player, true, 'the purchase is the player\'s deed');
  assert.ok(fact.subject.name.includes('Kestrel'), `the hull name is on the fact: ${fact.subject.name}`);
  assert.ok(fact.details.note.includes('Kestrel') && fact.details.note.includes('4800'),
    `the note names the hull and the price: ${fact.details.note}`);

  // The ledger's story view renders the fact's own title/note — the recall/news surface text.
  const view = t.chron.query({}).find((v) => v.title === 'A new hull');
  assert.ok(view, 'the purchase story is publishable under its own title');
  assert.ok(view.summary.includes('Kestrel'), `the summary names the hull: ${view.summary}`);

  // Re-buying the SAME hull: dedup. A DIFFERENT hull: a new beat.
  t.bus.emit('ship:purchased', { defId: 'ship_kestrel', price: 4800 });
  t.bus.emit('ship:purchased', { defId: 'ship_wasp', price: 2600 });
  step(t);
  const after = factsFor(t.state, 'ship:purchased');
  assert.equal(after.length, 2, 'one fact per distinct hull, no double for the re-buy');
  assert.ok(after.some((f) => f.details.defId === 'ship_wasp'));
});

test('an achievement unlock lands as a fact that names the achievement, and re-emitting dedupes', () => {
  const t = boot();
  t.bus.emit('achievement:unlocked', {
    id: 'first_blood', name: 'First Blood', category: 'combat',
    at: '2094-01-01T00:00:00.000Z', via: 'kill', retroactive: false,
  });
  step(t);

  const unlocked = factsFor(t.state, 'achievement:unlocked');
  assert.equal(unlocked.length, 1, 'exactly one fact for the unlock');
  const fact = unlocked[0];
  assert.equal(fact.details.achievementId, 'first_blood');
  assert.ok(fact.details.note.includes('First Blood'), `the note names it: ${fact.details.note}`);
  assert.equal(fact.details.title, 'First Blood');
  assert.equal(fact.details.retroactive, false);

  // The retro/merge path can re-emit an id; the ledger records it once.
  t.bus.emit('achievement:unlocked', {
    id: 'first_blood', name: 'First Blood', category: 'combat',
    at: '2094-01-01T00:00:00.000Z', via: 'kill', retroactive: true,
  });
  step(t);
  assert.equal(factsFor(t.state, 'achievement:unlocked').length, 1, 'one fact per achievement id');
});

test('a career ladder completion lands as a fact that names the ladder, and re-emitting dedupes', () => {
  const t = boot();
  t.bus.emit('career:ladder:completed', {
    careerId: 'hunter', receiptId: 'ladder_done:hunter', nonBinding: true,
    simTime: t.state.simTime,
  });
  step(t);

  const done = factsFor(t.state, 'career:ladder:completed');
  assert.equal(done.length, 1, 'exactly one fact for the completion');
  const fact = done[0];
  assert.equal(fact.details.careerId, 'hunter');
  assert.ok(fact.details.note.includes('Hunter'), `the note names the career: ${fact.details.note}`);
  assert.equal(fact.externalId, 'ladder_done:hunter', 'the completion receipt is the external id');
  assert.ok(fact.provides.some((r) => r.kind === 'receipt' && r.id === 'ladder_done:hunter'),
    'the receipt ref is provided for citation');

  t.bus.emit('career:ladder:completed', {
    careerId: 'hunter', receiptId: 'ladder_done:hunter', nonBinding: true,
    simTime: t.state.simTime,
  });
  step(t);
  assert.equal(factsFor(t.state, 'career:ladder:completed').length, 1, 'one fact per career ladder');
});

test('only marquee stunt tricks are facts — legendary, or rare with collateral — and below the gate is silence', () => {
  const t = boot();

  // Below the gate: ordinary rarities and collateral-less rare tricks record NOTHING.
  t.bus.emit('stunt:trickDetected', trickReceipt({ trickId: 'bolas', name: 'Bolas', rarity: 'uncommon', baseScore: 90 }));
  t.bus.emit('stunt:trickDetected', trickReceipt({ trickId: 'rock_discovery', name: 'Rock Discovery', rarity: 'common', baseScore: 50 }));
  t.bus.emit('stunt:trickDetected', trickReceipt({ trickId: 'clothesline', name: 'Clothesline', rarity: 'rare', baseScore: 140, modifiers: { razorRelease: null, collateralCount: 1, closeShave: false } }));
  step(t);
  assert.equal(factsFor(t.state, 'stunt:trickDetected').length, 0,
    'a mid/low-tier trick below the marquee gate records nothing');

  // Marquee: legendary outright.
  t.bus.emit('stunt:trickDetected', trickReceipt({ episodeId: 'ep_sling_marquee' }));
  step(t);
  const legendary = factsFor(t.state, 'stunt:trickDetected');
  assert.equal(legendary.length, 1, 'a legendary trick is a fact');
  assert.ok(legendary[0].details.note.includes('Slingshot Golf'),
    `the note names the trick: ${legendary[0].details.note}`);
  assert.equal(legendary[0].details.title, 'Slingshot Golf');
  assert.equal(legendary[0].details.rarity, 'legendary');

  // Marquee: rare that caught other hulls in it.
  t.bus.emit('stunt:trickDetected', trickReceipt({
    trickId: 'clothesline', name: 'Clothesline', rarity: 'rare', baseScore: 140,
    episodeId: 'ep_clothes_marquee',
    modifiers: { razorRelease: null, collateralCount: 2, closeShave: false },
  }));
  step(t);
  const marquee = factsFor(t.state, 'stunt:trickDetected');
  assert.equal(marquee.length, 2, 'a rare trick with collateral is also a fact');
  assert.ok(marquee[1].details.note.includes('2 hulls'),
    `the note names the collateral: ${marquee[1].details.note}`);

  // The same episode again (an amended re-detection rides the same episode id): dedup.
  t.bus.emit('stunt:trickDetected', trickReceipt({ episodeId: 'ep_sling_marquee' }));
  step(t);
  assert.equal(factsFor(t.state, 'stunt:trickDetected').length, 2, 'one fact per episode');
});

test('the deed ledger survives serialize/deserialize round-trip', () => {
  const t = boot();
  t.bus.emit('ship:purchased', { defId: 'ship_kestrel', price: 4800 });
  t.bus.emit('achievement:unlocked', { id: 'first_blood', name: 'First Blood', category: 'combat', at: null, via: 'kill', retroactive: false });
  t.bus.emit('career:ladder:completed', { careerId: 'hunter', receiptId: 'ladder_done:hunter', nonBinding: true, simTime: 0 });
  t.bus.emit('stunt:trickDetected', trickReceipt({ episodeId: 'ep_sling_save' }));
  step(t);

  const before = t.chron.diagnostics();
  assert.equal(before.stories, 4, 'each marquee deed is its own story');

  const snap = t.chron.serialize();
  t.chron.deserialize(snap);

  const after = t.chron.diagnostics();
  assert.equal(after.stories, before.stories, 'story count survives the round-trip');
  assert.equal(after.facts, before.facts, 'fact count survives the round-trip');
  const names = facts(t.state).map((f) => f.details.note).join(' | ');
  assert.ok(names.includes('Kestrel') && names.includes('First Blood')
    && names.includes('Hunter') && names.includes('Slingshot Golf'),
    `all four deed notes survive: ${names}`);
});
