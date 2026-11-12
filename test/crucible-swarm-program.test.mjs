// The swarm program's honesty suite (design/swarm/SWARM_PROGRAM.md §S6) — stakes are pure data,
// the purse lands before the armory, the shelf is exhaustive against the real def tables, hull
// launches re-derive legality, events draw deterministically, a demo strips and a buy keeps,
// and the stake rides the run record into the ghost comparison.
//
// The harness drives the REAL owners — runSession owns state.run, survivalDraft owns the armory,
// ships owns fittings. Transitions walk the same run:transitionRequested seam the phase machine
// emits; nothing stubs the wallet or the shelf.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { runSession } from '../src/systems/runSession.js';
import { survivalDraft } from '../src/systems/survivalDraft.js';
import { survivalResults } from '../src/systems/survivalResults.js';
import { ships } from '../src/systems/ships.js';
import { economy } from '../src/systems/economy.js';
import { currentStuntRunRules } from '../src/combat/stuntRunRules.js';
import { ghostComparability } from '../src/systems/survivalRecords.js';

import { SHIPS } from '../src/data/ships.js';
import { WEAPONS } from '../src/data/weapons.js';
import { MODULES } from '../src/data/modules.js';
import { TECH_NODES } from '../src/data/tech.js';
import { SURVIVAL_DRAFT_OFFERS, offerDraft } from '../src/data/survivalDraft.js';
import { SWARM_DRAFT_OFFERS } from '../src/data/swarmDraft.js';
import {
  catalogBlurbFor,
  isArmoryStock,
  isSwarmRelevantDef,
  swarmCatalogCoverage,
  swarmCatalogOffers,
  validateSwarmCatalog,
} from '../src/data/swarmCatalog.js';
import {
  SWARM_STAKES,
  normalizeSwarmStake,
  swarmStakeFor,
  swarmStakePitch,
  swarmStakeYield,
  validateSwarmStakes,
} from '../src/data/swarmStakes.js';
import {
  SWARM_EVENT_BY_ID,
  SWARM_EVENT_TABLES,
  isSwarmMinorEventWave,
  swarmEventFor,
  swarmMinorEventFor,
  swarmMinorEventPool,
  validateSwarmEvents,
} from '../src/data/swarmEvents.js';
import { SWARM_RULESET, isSwarmBossWave } from '../src/data/swarmMode.js';
import { swarmCourseFor } from '../src/data/swarmCourse.js';
import { createSwarmEventDirector, swarmEventFrame } from '../src/systems/swarmEvents.js';
import {
  crucibleHullSetupFor,
  crucibleSetupFor,
  crucibleStarterIdForSetup,
} from '../src/ui/crucibleLaunch.js';
import { applyRunShareCode, doorRunShareCode } from '../src/ui/screens/shareCode.js';

const ARENA = 'helios_core';
const SEED = 4242;

function boot({ seed = SEED, hullId = 'ship_hornet' } = {}) {
  const state = createGameState(seed);
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
  // The door unlocks the run arsenal; mirror that so fitting is what is under test.
  state.player.researchPoints += TECH_NODES.reduce((s, n) => s + ((n.cost && n.cost.rp) || 0), 0) + 1000;
  const cost = TECH_NODES.reduce((s, n) => s + ((n.cost && n.cost.credits) || 0), 0);
  if (cost > 0) economy.grantCredits(cost, 'test:tech');
  for (let pass = 0; pass < TECH_NODES.length + 1; pass++) {
    let progressed = false;
    for (const node of TECH_NODES) {
      if (!state.player.researchedNodes.includes(node.id) && ships.unlockTech(node.id)) progressed = true;
    }
    if (!progressed) break;
  }
  ships.buyShip({ defId: hullId, setActive: true, grant: true });
  return { state, bus, emitted, ctx, registry };
}

function beginSwarm(h, { stake = null } = {}) {
  h.bus.emit('run:beginRequested', {
    kind: 'survival', ruleset: SWARM_RULESET, seed: SEED, arenaId: ARENA,
    swarmStake: stake || undefined,
  });
  return h.state.run;
}

/** The launcher's purse emit — the same seam applySandboxSetup uses, in the same order. */
function landPurse(h, stakeId) {
  const purse = swarmStakeFor(stakeId).purse;
  if (purse > 0) {
    h.bus.emit('run:awardRequested', { credits: purse, reason: `swarm:stake:${stakeId}` });
  }
}

function transition(h, expectedPhase, nextPhase) {
  h.bus.emit('run:transitionRequested', {
    expectedPhase, nextPhase, reason: 't', tick: 0,
  });
}

function named(emitted, event) {
  return emitted.filter((entry) => entry.event === event);
}

function activeFittings(h) {
  const p = h.state.player;
  return p.ownedShips[p.activeShipIndex].fittings;
}

// ── S6.1 — the stake table is honest frozen data ─────────────────────────────

test('stakes are pure frozen data with an honest ordering and one default', () => {
  assert.ok(Object.isFrozen(SWARM_STAKES));
  assert.equal(SWARM_STAKES.length, 4);
  const ids = SWARM_STAKES.map((s) => s.id);
  assert.deepEqual(ids, ['exhibition', 'contender', 'veteran', 'ironbound']);
  for (const stake of SWARM_STAKES) {
    assert.ok(Object.isFrozen(stake));
    assert.ok(stake.label.length > 0 && stake.blurb.length > 0, `${stake.id} speaks`);
    assert.ok(Number.isFinite(stake.purse) && stake.purse >= 0);
    assert.ok(Number.isFinite(stake.pressure) && stake.pressure > 0);
    assert.ok(Number.isFinite(stake.earn) && stake.earn > 0);
    const pitch = swarmStakePitch(stake.id);
    assert.ok(
      stake.purse > 0 ? pitch.includes(`${stake.purse} cr`) : pitch.includes('no purse'),
      `${stake.id} pitch names its purse`,
    );
  }
  const audit = validateSwarmStakes();
  assert.ok(audit.ok, `stake validation clean: ${audit.issues.join('; ')}`);
  // Richer purse, softer pressure, thinner earn — the contract reads top to bottom.
  const purses = SWARM_STAKES.map((s) => s.purse);
  const pressures = SWARM_STAKES.map((s) => s.pressure);
  assert.deepEqual([...purses].sort((a, b) => b - a), purses);
  assert.deepEqual([...pressures].sort((a, b) => a - b), pressures);
  // Unknown and absent normalize to the tuning baseline, never silently higher.
  assert.equal(normalizeSwarmStake(null), 'contender');
  assert.equal(normalizeSwarmStake('ironboundX'), 'contender');
  assert.equal(normalizeSwarmStake(undefined), 'contender');
  assert.equal(swarmStakeFor('bogus').id, 'contender');
});

// ── S6.2 — the purse lands before the armory opens ───────────────────────────

test('the stake purse lands in the run wallet before the opening armory', () => {
  const h = boot();
  const run = beginSwarm(h, { stake: 'exhibition' });
  assert.equal(run.phase, 'loadout');
  assert.equal(run.telemetry.swarmStake, 'exhibition');
  landPurse(h, 'exhibition');
  // The wallet speaks pre-armory: the loadout phase still stands when the purse lands.
  // (runSession commits a fresh run object on every award — always read state.run again.)
  assert.equal(h.state.run.credits, 2400);
  assert.equal(h.state.run.phase, 'loadout');
  // The armory opens on it: walk loadout → draft and the shop sees the whole purse.
  transition(h, 'loadout', 'draft');
  assert.equal(h.state.run.phase, 'draft');
  const offers = survivalDraft.currentOffers();
  assert.ok(offers.length > 40, 'the swarm shelf is wide');
  const affordable = offers.filter((o) => o.available);
  assert.ok(affordable.length > 0, 'a 2400 cr purse can buy');
});

test('an ironbound run opens with nothing but the hull', () => {
  const h = boot();
  beginSwarm(h, { stake: 'ironbound' });
  landPurse(h, 'ironbound');
  assert.equal(h.state.run.credits, 0);
  transition(h, 'loadout', 'draft');
  const offers = survivalDraft.currentOffers();
  assert.ok(offers.length > 0, 'the shelf is still honest about what is on it');
  assert.ok(offers.every((o) => !o.available || o.price === 0), 'nothing is buyable on nothing');
});

// ── S6.3 — the loadout → draft walk reaches round 1 ──────────────────────────

test('a swarm run walks loadout through the armory into wave 1', () => {
  const h = boot();
  beginSwarm(h, { stake: 'contender' });
  landPurse(h, 'contender');
  transition(h, 'loadout', 'draft');
  const offered = named(h.emitted, 'run:draftOffered');
  assert.equal(offered.length, 1, 'the armory opened exactly once');
  assert.ok(offered[0].payload.offers.length > 0);
  // Skip the shop — Launch — and the run moves on.
  h.bus.emit('run:draftPickRequested', { offerId: null });
  assert.ok(named(h.emitted, 'run:draftResolved').length === 1, 'the draft resolved');
  h.state.run.wave = 1;
  transition(h, 'draft', 'wave_intro');
  transition(h, 'wave_intro', 'active');
  assert.equal(h.state.run.phase, 'active');
  assert.equal(h.state.run.wave, 1);
});

// ── S6.4 — the shelf is exhaustive against the real def tables ───────────────

test('the armory shelf covers every purchasable def that does something in a Swarm fight', () => {
  const authoredIds = new Set(
    SURVIVAL_DRAFT_OFFERS.concat(SWARM_DRAFT_OFFERS).map((offer) => offer.defId),
  );
  const stock = WEAPONS.concat(MODULES).filter(isArmoryStock);
  const coverage = swarmCatalogCoverage();
  assert.equal(coverage.total, stock.length, 'coverage counts the same stock the gate does');
  const catalog = swarmCatalogOffers(authoredIds);
  const cataloged = new Set(catalog.map((row) => row.defId));
  for (const def of stock) {
    if (!isSwarmRelevantDef(def)) {
      assert.equal(cataloged.has(def.id), false, `${def.id} is adventure stock, off the Swarm shelf`);
      continue;
    }
    assert.ok(authoredIds.has(def.id) || cataloged.has(def.id),
      `${def.id} is buyable — authored card or catalog row`);
  }
  const audit = validateSwarmCatalog(authoredIds);
  assert.ok(audit.ok, `catalog validation clean: ${audit.issues.join('; ')}`);
  // And the live offer generator really serves catalog rows on a swarm hull.
  const hornet = SHIPS.find((s) => s.id === 'ship_hornet');
  const fittings = new Array(hornet ? 8 : 8).fill(null);
  const result = offerDraft({
    seed: SEED, wave: 1, hullId: 'ship_hornet', fittings, pickCount: 0,
    count: 100, ruleset: SWARM_RULESET,
  });
  assert.ok(result.ok);
  assert.ok(result.offers.some((o) => o.catalog === true), 'catalog rows reach the shelf');
  assert.ok(result.offers.every((o) => authoredIds.has(o.defId) || cataloged.has(o.defId)),
    'every offered row is authored or cataloged');
});

// ── S6.5 — a hull launch re-derives legality and round-trips the door code ───

test('every hull launches bare, a bad hull refuses, and the code round-trips it', () => {
  for (const ship of SHIPS) {
    const setup = crucibleHullSetupFor({ hullId: ship.id, seed: SEED, arenaId: ARENA });
    assert.ok(setup.ok, `${ship.id} launches bare`);
    assert.equal(crucibleStarterIdForSetup(setup.value), `hull:${ship.id}`,
      `${ship.id} re-derives its own starter id`);
  }
  const bad = crucibleHullSetupFor({ hullId: 'ship_nope', seed: SEED, arenaId: ARENA });
  assert.equal(bad.ok, false, 'an unknown hull never reaches the run');
  // A swarm code carries the stake and the bare-hull starter, and decodes both back.
  const code = doorRunShareCode({
    starterId: 'hull:ship_wasp', seed: SEED, arenaId: 'lagrange_crucible',
    ruleset: SWARM_RULESET, stake: 'veteran',
  });
  assert.ok(code.ok, `code writes: ${code.error || ''}`);
  const applied = applyRunShareCode(code.code);
  assert.ok(applied.ok, `code reads: ${applied.error || ''}`);
  assert.equal(applied.starterId, 'hull:ship_wasp');
  assert.equal(applied.hullId, 'ship_wasp');
  assert.equal(applied.stake, 'veteran');
  assert.equal(applied.arenaId, 'lagrange_crucible');
  // And a code written before the door learned 'hull:' still resolves its bare hull.
  const legacy = doorRunShareCode({
    starterId: 'hull:ship_mule', seed: SEED + 1, arenaId: ARENA, ruleset: SWARM_RULESET,
  });
  assert.ok(legacy.ok);
  const decodedLegacy = applyRunShareCode(legacy.code);
  assert.equal(decodedLegacy.starterId, 'hull:ship_mule');
});

// ── S6.6 — the event table is deterministic and room-shaped ──────────────────

test('swarm events validate, draw deterministically, and leave boss rounds to the boss', () => {
  const issues = validateSwarmEvents();
  assert.deepEqual(issues, [], issues.join('; '));
  // C01-03: through the win every fifth round is a champion so the course deals no majors;
  // past it the ≡5-mod-10 deep rounds are real non-champion rows and the major band deals
  // again — wave 35 is the first card it hands back.
  for (let wave = 1; wave <= 40; wave++) {
    const draw = swarmEventFor({ arenaId: 'helios_core', wave, seed: SEED });
    // G08-02 — a course round's twistId deals its own card through the same consult; band
    // rounds serve it at the minor voice instead, so they stay out of the major column.
    const course = swarmCourseFor(wave);
    const majors = (wave > 30 && wave % 10 === 5)
      || Boolean(course && course.twistId && !isSwarmMinorEventWave(wave));
    if (!majors) {
      assert.equal(draw, null, `wave ${wave} has no major event round`);
    } else {
      assert.ok(draw && SWARM_EVENT_BY_ID[draw.id], `wave ${wave} deals a real major card`);
      const again = swarmEventFor({ arenaId: 'helios_core', wave, seed: SEED });
      assert.equal(again.id, draw.id, `wave ${wave} is seeded-stable`);
    }
    const minor = swarmMinorEventFor({ arenaId: 'helios_core', wave, seed: SEED });
    if (isSwarmMinorEventWave(wave)) {
      assert.ok(minor && SWARM_EVENT_BY_ID[minor.id], `wave ${wave} draws a real minor card`);
      // Same inputs, same card — a ghost replay and a share code see the same room.
      const again = swarmMinorEventFor({ arenaId: 'helios_core', wave, seed: SEED });
      assert.equal(again.id, minor.id, `wave ${wave} is seeded-stable`);
    } else {
      assert.equal(minor, null, `wave ${wave} is not a minor round`);
    }
  }
  // The minor band deals only from the arena's authored pool: every draw lands inside it,
  // the room's own trick deals its share, and the shared pods out-deal it (helios's mix
  // is one own card against the two shared ones).
  const pool = new Set(swarmMinorEventPool('helios_core'));
  const counts = {};
  for (let seed = 1; seed <= 40; seed++) {
    const draw = swarmMinorEventFor({ arenaId: 'helios_core', wave: 2, seed });
    assert.ok(draw, 'the minor round always deals');
    assert.ok(pool.has(draw.id), 'every draw lands inside the authored minor pool');
    counts[draw.id] = (counts[draw.id] || 0) + 1;
  }
  assert.ok(counts.sprocket_crate > 0, "helios's own crate deals its share");
  assert.ok((counts.supply_drop || 0) + (counts.mine_drift || 0) > counts.sprocket_crate,
    'the shared pods out-deal the room trick — the authored 1:2 mix');
});

// ── S6.7 — demo flies one round; buying keeps it ─────────────────────────────

test('a demo strips at the next armory; the bought copy stays fitted', () => {
  const h = boot();
  beginSwarm(h, { stake: 'exhibition' });
  landPurse(h, 'exhibition');
  transition(h, 'loadout', 'draft');
  const offers = survivalDraft.currentOffers();
  const demoable = offers.find((o) =>
    Number.isInteger(o.slotIndex) && typeof o.defId === 'string' && o.kind === 'number');
  assert.ok(demoable, 'the shelf has a fittable card to demo');
  const { slotIndex, defId } = demoable;
  // Demo it — free fit for the round.
  h.bus.emit('run:draftPickRequested', { offerId: demoable.id, demo: true });
  assert.equal(activeFittings(h)[slotIndex], defId, 'the demo is fitted');
  // Launch: resolve, walk the round, come back through cleanup to the next armory.
  h.bus.emit('run:draftPickRequested', { offerId: null });
  h.state.run.wave = 1;
  transition(h, 'draft', 'wave_intro');
  transition(h, 'wave_intro', 'active');
  transition(h, 'active', 'cleanup');
  transition(h, 'cleanup', 'draft');
  assert.equal(activeFittings(h)[slotIndex] === defId, false,
    'the demo copy is stripped when the next armory opens');
});

test('buying the demoed slot retires the trial — the run keeps it', () => {
  const h = boot();
  beginSwarm(h, { stake: 'exhibition' });
  landPurse(h, 'exhibition');
  transition(h, 'loadout', 'draft');
  const offers = survivalDraft.currentOffers();
  // The keep-path is a weapon: swarm re-offers guns already mounted (battery building is legal),
  // so a demoed gun is still buyable in the same armory; a module card goes quiet once fitted.
  const buyable = offers.find((o) =>
    Number.isInteger(o.slotIndex) && o.available && o.kind === 'number'
    && WEAPONS.some((w) => w.id === o.defId));
  assert.ok(buyable, 'a 2400 cr purse makes a gun buyable');
  const { defId } = buyable;
  h.bus.emit('run:draftPickRequested', { offerId: buyable.id, demo: true });
  assert.ok(activeFittings(h).includes(defId), 'the demo copy is fitted');
  // Buy the real copy of the card on trial.
  h.bus.emit('run:draftPickRequested', { offerId: buyable.id });
  const beforeWalk = activeFittings(h).filter((f) => f === defId).length;
  assert.ok(beforeWalk >= 1, 'the bought copy is fitted');
  // Walk to the next armory — the demo copy strips, the paid copy stays. Exactly one remains.
  h.bus.emit('run:draftPickRequested', { offerId: null });
  h.state.run.wave = 1;
  transition(h, 'draft', 'wave_intro');
  transition(h, 'wave_intro', 'active');
  transition(h, 'active', 'cleanup');
  transition(h, 'cleanup', 'draft');
  const kept = activeFittings(h).filter((f) => f === defId).length;
  assert.equal(kept, 1, 'the paid copy stays fitted when the next armory opens');
});

test('a displaced demo is destroyed, never shelved as a free spare', () => {
  const h = boot();
  beginSwarm(h, { stake: 'exhibition' });
  landPurse(h, 'exhibition');
  transition(h, 'loadout', 'draft');
  const offers = survivalDraft.currentOffers();
  const demoable = offers.find((o) =>
    Number.isInteger(o.slotIndex) && typeof o.defId === 'string' && o.kind === 'number');
  assert.ok(demoable, 'the shelf has a fittable card to demo');
  const { slotIndex, defId } = demoable;
  h.bus.emit('run:draftPickRequested', { offerId: demoable.id, demo: true });
  assert.equal(activeFittings(h)[slotIndex], defId, 'the demo is fitted');
  // Any unfit — refit UI, a purchase over the slot — retires the demo at the moment it leaves
  // the slot, on the same emit that bumped the copy into the hold.
  assert.ok(ships.unfitModule({ slotIndex }), 'the unfit lands');
  const inventory = h.state.player.moduleInventory || [];
  assert.equal(inventory.filter((item) => item && item.defId === defId).length, 0,
    'the demo copy is destroyed, not shelved');
  assert.equal(activeFittings(h)[slotIndex], null, 'the slot is empty');
});

test('one trial at a time — a second demo retires the first, never refits the ship free', () => {
  const h = boot();
  beginSwarm(h, { stake: 'exhibition' });
  landPurse(h, 'exhibition');
  transition(h, 'loadout', 'draft');
  const offers = survivalDraft.currentOffers();
  const demoables = offers.filter((o) =>
    Number.isInteger(o.slotIndex) && typeof o.defId === 'string' && o.kind === 'number');
  assert.ok(demoables.length >= 2, 'the shelf has two fittable cards to demo');
  const first = demoables[0];
  const second = demoables[1];
  h.bus.emit('run:draftPickRequested', { offerId: first.id, demo: true });
  h.bus.emit('run:draftPickRequested', { offerId: second.id, demo: true });
  const fittings = activeFittings(h);
  // 3e8f6f898a re-judges a card against the live hull, and targetSlotFor takes the
  // first empty hardpoint. Both cards named slot 0 on the bare shelf; once the first
  // trial occupies it, the second lands on the next empty slot. The first trial still
  // comes off, and the hull does not keep both for free.
  assert.equal(fittings.filter((f) => f === second.defId).length, 1, 'the new trial is fitted');
  if (first.defId !== second.defId) {
    assert.equal(fittings.includes(first.defId), false,
      'the first demo came off when the second went on');
  }
  assert.equal(fittings.filter(Boolean).length, 1, 'a second demo never leaves two free fittings');
  const inventory = h.state.player.moduleInventory || [];
  assert.equal(inventory.filter((item) => item && item.defId === first.defId).length, 0,
    'and the retired copy is destroyed, not shelved as an unpaid spare');
});

test('buying a hull retires the demos on the hull you are leaving', () => {
  const h = boot();
  beginSwarm(h, { stake: 'exhibition' });
  landPurse(h, 'exhibition');
  transition(h, 'loadout', 'draft');
  // Foreign hulls go on sale once the run has begun — the opening armory fits the door's
  // free pick, so the buy under test happens at the round-1 shelf.
  h.bus.emit('run:draftPickRequested', { offerId: null });
  h.state.run.wave = 1;
  transition(h, 'draft', 'wave_intro');
  transition(h, 'wave_intro', 'active');
  transition(h, 'active', 'cleanup');
  transition(h, 'cleanup', 'draft');
  const shelf = survivalDraft.currentOffers();
  const demoable = shelf.find((o) =>
    Number.isInteger(o.slotIndex) && typeof o.defId === 'string' && o.kind === 'number');
  const hullOffer = shelf.find((o) =>
    o.kind === 'hull' && o.available && o.defId !== 'ship_hornet');
  assert.ok(demoable && hullOffer, 'a demoable card and a foreign hull are on the round-1 shelf');
  h.bus.emit('run:draftPickRequested', { offerId: demoable.id, demo: true });
  const oldHull = h.state.player.ownedShips[h.state.player.activeShipIndex];
  assert.ok(oldHull.fittings.includes(demoable.defId), 'the demo is bolted on');
  // Buy the hull — the swap lands, and the demo does not ride onto a hull that stays owned.
  h.bus.emit('run:draftPickRequested', { offerId: hullOffer.id });
  const player = h.state.player;
  assert.notEqual(player.ownedShips[player.activeShipIndex], oldHull, 'the new hull is active');
  assert.equal(oldHull.fittings.includes(demoable.defId), false,
    'the demo copy is stripped off the hull you left');
  const inventory = player.moduleInventory || [];
  assert.equal(inventory.filter((item) => item && item.defId === demoable.defId).length, 0,
    'and it is not waiting in the hold either');
});

test('the opening armory survives the game:started close-all', async () => {
  const h = boot();
  beginSwarm(h, { stake: 'exhibition' });
  landPurse(h, 'exhibition');
  transition(h, 'loadout', 'draft');
  const pushes = () => named(h.emitted, 'ui:pushScreen')
    .filter((e) => e.payload && e.payload.id === 'crucibleDraft').length;
  assert.equal(pushes(), 1, 'the armory pushed under the loading gate');
  // game:started's close-all runs synchronously after; the draft re-opens on the next microtask.
  h.bus.emit('game:started', {});
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(pushes(), 2, 'the live draft re-opens after the handoff');
});

// ── S6.7b — the manifest is a switchyard, not a storefront ───────────────────

test('an owned hull switches back for free and stays switchable', () => {
  const h = boot(); // the hornet is already on the manifest, flying
  beginSwarm(h, { stake: 'exhibition' });
  landPurse(h, 'exhibition');
  transition(h, 'loadout', 'draft');
  // The hornet's own row is a free switch, not a second sale.
  const ownedRow = survivalDraft.currentOffers()
    .find((o) => o.kind === 'hull' && o.defId === 'ship_hornet');
  assert.ok(ownedRow && ownedRow._flying, 'the flown hull reads as the one in the cradle');
  assert.equal(ownedRow.price, 0, 'an owned hull is never priced again');
  // Foreign hulls go on sale once the run has begun — walk to the round-1 shelf for the buy.
  h.bus.emit('run:draftPickRequested', { offerId: null });
  h.state.run.wave = 1;
  transition(h, 'draft', 'wave_intro');
  transition(h, 'wave_intro', 'active');
  transition(h, 'active', 'cleanup');
  transition(h, 'cleanup', 'draft');
  // Buy a foreign hull — the swap lands; the hornet leaves the cradle but not the manifest.
  const foreign = survivalDraft.currentOffers().find((o) =>
    o.kind === 'hull' && o.available && o.defId !== 'ship_hornet');
  assert.ok(foreign, 'a foreign hull is on the round-1 shelf');
  h.bus.emit('run:draftPickRequested', { offerId: foreign.id });
  const player = h.state.player;
  assert.equal(player.ownedShips[player.activeShipIndex].defId, foreign.defId, 'the bought hull flies');
  // The hornet row re-shelves as a free switch.
  const hornetRow = survivalDraft.currentOffers()
    .find((o) => o.kind === 'hull' && o.defId === 'ship_hornet');
  assert.equal(hornetRow.verb, 'Switch ship', 'the manifest row is a switch');
  assert.equal(hornetRow.price, 0, 'the manifest row is free');
  assert.ok(hornetRow.available, `the switch is live (${hornetRow.unavailableReason || 'ready'})`);
  const creditsBefore = h.state.run.credits;
  h.bus.emit('run:draftPickRequested', { offerId: hornetRow.id });
  assert.equal(h.state.player.ownedShips[h.state.player.activeShipIndex].defId, 'ship_hornet',
    'the hornet is back in the cradle');
  assert.equal(h.state.run.credits, creditsBefore, 'the wallet never moved');
  // And the bought hull is still a live switch row — a purchase must not freeze the door.
  const foreignRow = survivalDraft.currentOffers()
    .find((o) => o.kind === 'hull' && o.defId === foreign.defId);
  assert.ok(foreignRow && foreignRow.available,
    `the bought hull stays switchable (${foreignRow && foreignRow.unavailableReason || 'ready'})`);
});

test('the opening armory fits the door hull — foreign hulls wait for round 1', () => {
  const h = boot();
  beginSwarm(h, { stake: 'exhibition' });
  landPurse(h, 'exhibition');
  transition(h, 'loadout', 'draft');
  const hulls = survivalDraft.currentOffers().filter((o) => o.kind === 'hull');
  assert.equal(hulls.length, 1, 'only the cradle row rides the opening shelf');
  assert.equal(hulls[0].defId, 'ship_hornet', 'the door pick is the one in the cradle');
  assert.equal(hulls[0]._flying, true);
});

test('an unearned crossover hull is a locked goal on the shelf, never a sale', () => {
  const h = boot();
  beginSwarm(h, { stake: 'exhibition' });
  landPurse(h, 'exhibition');
  transition(h, 'loadout', 'draft');
  h.bus.emit('run:draftPickRequested', { offerId: null });
  h.state.run.wave = 1;
  transition(h, 'draft', 'wave_intro');
  transition(h, 'wave_intro', 'active');
  transition(h, 'active', 'cleanup');
  transition(h, 'cleanup', 'draft');
  const saucer = survivalDraft.currentOffers().find((o) => o.id === 'hull_ship_saucer');
  assert.ok(saucer, 'the saucer rides the shelf as the visible goal');
  assert.equal(saucer.available, false, 'no ledger earn, no sale');
  assert.match(saucer.unavailableReason || '', /earned/i, 'the row names the earn');
  // Even a fat wallet cannot buy past the ledger — the door refuses the pick the same way.
  h.bus.emit('run:awardRequested', { credits: 99999, reason: 'test:rich' });
  const ownedBefore = h.state.player.ownedShips.length;
  h.bus.emit('run:draftPickRequested', { offerId: 'hull_ship_saucer' });
  assert.equal(h.state.player.ownedShips.length, ownedBefore, 'the ledger holds');
});

test('a catalog gun carries its figures; a stake tile carries its yield', () => {
  const gun = WEAPONS.find((w) => Number.isFinite(w.dps) && Number.isFinite(w.impulsePerHit));
  assert.ok(gun, 'a figured gun exists to shelf');
  const blurb = catalogBlurbFor(gun);
  assert.ok(blurb.includes('dps'), 'sustained fire reads on the row');
  assert.ok(blurb.includes('impulse'), 'shove reads on the row');
  const rig = MODULES.find((m) => m.slotType === 'utility');
  assert.equal(catalogBlurbFor(rig).includes('dps'), false, 'a rig keeps its sentence');
  for (const stake of SWARM_STAKES) {
    assert.equal(swarmStakeYield(stake.id), `pays ×${stake.earn} · scores ×${stake.score}`);
  }
});

test('a demoed module stays buyable — the trial is not a lock', () => {
  const h = boot();
  beginSwarm(h, { stake: 'exhibition' });
  landPurse(h, 'exhibition');
  transition(h, 'loadout', 'draft');
  const card = survivalDraft.currentOffers().find((o) =>
    Number.isInteger(o.slotIndex) && o.kind === 'number'
    && MODULES.some((m) => m.id === o.defId));
  assert.ok(card, 'a support module card is on the shelf');
  h.bus.emit('run:draftPickRequested', { offerId: card.id, demo: true });
  assert.equal(activeFittings(h)[card.slotIndex], card.defId, 'the demo is wearing');
  const trial = survivalDraft.currentOffers().find((o) => o.id === card.id);
  assert.ok(trial && trial.demoed, 'the card knows it is on trial');
  assert.ok(trial.available, `buy-to-keep stays live (${trial.unavailableReason || 'ready'})`);
  h.bus.emit('run:draftPickRequested', { offerId: card.id });
  assert.equal(activeFittings(h)[card.slotIndex], card.defId, 'the paid copy is on the slot');
  // Walk to the next armory — a paid copy was never a trial, so nothing strips.
  h.bus.emit('run:draftPickRequested', { offerId: null });
  h.state.run.wave = 1;
  transition(h, 'draft', 'wave_intro');
  transition(h, 'wave_intro', 'active');
  transition(h, 'active', 'cleanup');
  transition(h, 'cleanup', 'draft');
  assert.ok(activeFittings(h).includes(card.defId), 'the kept module rides on');
});

// ── S6.6b — a surge holds its window inside the per-tick write ───────────────

test('a surge overdrive rides the per-tick write for its whole window', () => {
  const h = boot();
  beginSwarm(h, { stake: 'contender' });
  h.state.run.phase = 'active';
  const writes = [];
  const fields = {
    updateExternal(id, patch) { writes.push({ id, ...patch }); return { id }; },
    unregisterExternal() { return true; },
  };
  const registry = { get: (name) => (name === 'fields' ? fields : null) };
  const director = createSwarmEventDirector({ state: h.state, bus: h.bus, helpers: {}, registry });
  director.init();
  // C01-01: majors are dead inside the course — sling_gust is the minor band's
  // install-free surge, dealt on lagrange's wave-12 minor round at seed 1.
  const seed = 1;
  assert.equal(
    swarmMinorEventFor({ arenaId: 'lagrange_crucible', wave: 12, seed })?.id,
    'sling_gust',
    'the seeded draw lands the minor surge',
  );
  h.state.run.seed = seed;
  h.state.run.arenaId = 'lagrange_crucible';
  h.state.run.wave = 12;
  director.setFrame(swarmEventFrame({ at: { x: 0, z: 0 }, laneGate: null, seed, wave: 12 }));
  director.setInstalledFields([{ id: 'survival_arena_field_a', strength: 40 }]);
  h.bus.emit('run:waveStarted', { wave: 12 });
  // Past the windup: the overdrive is live, and the per-tick write must carry it.
  h.state.simTime += 10;
  director.update(0.016, h.state);
  assert.equal(director.fieldStrengthScale('survival_arena_field_a'), 1.8,
    'the sling runs hot through the window');
  assert.ok(writes.some((w) => w.id === 'survival_arena_field_a' && w.strength === 72),
    'the authored field got its overdrive patch');
  // Past the window: the scale is calm again — the machinery's own write restores the base.
  h.state.simTime += 11;
  director.update(0.016, h.state);
  assert.equal(director.fieldStrengthScale('survival_arena_field_a'), 1,
    'the window closed calm');
});

test('the lattice signatures are pulses — its authored fields are strength-0 markers', () => {
  // A surge multiplies what is already there; storm relays are occupancy fields authored at
  // zero, so storm's signature cards are temporary fields, not multipliers.
  for (const id of SWARM_EVENT_TABLES.storm_lattice) {
    const card = SWARM_EVENT_BY_ID[id];
    assert.equal(card.kind, 'pulse', `${id} is a temporary field, not a multiplier on zero`);
    assert.ok(card.field && card.field.strength > 0, `${id} carries a real authored field`);
  }
});

test('the result revision moves on every write — a retry cannot repeat a plate', () => {
  const h = boot();
  survivalResults.init(h.ctx);
  const first = survivalResults.resultRevision();
  beginSwarm(h, { stake: 'veteran' });
  h.bus.emit('run:waveStarted', { wave: 1, tick: 1 });
  h.bus.emit('run:ended', { outcome: 'defeat', reason: 'player_death' });
  const revA = survivalResults.resultRevision();
  assert.ok(revA > first, 'a result write bumped the revision');
  // The same seed, the same death on the same tick — the revision still moves.
  beginSwarm(h, { stake: 'veteran' });
  h.bus.emit('run:waveStarted', { wave: 1, tick: 1 });
  h.bus.emit('run:ended', { outcome: 'defeat', reason: 'player_death' });
  assert.ok(survivalResults.resultRevision() > revA, 'the identical retry still moved');
  survivalResults.destroy();
});

// ── The quieter flags: collector gate, score factor, door parity, fresh reading ──

test('a pod a drone scoops is refused outright — the pilot can still claim it', () => {
  const h = boot();
  beginSwarm(h, { stake: 'contender' });
  h.state.run.phase = 'active';
  h.state.playerId = 9;
  const registry = { get: () => null };
  const director = createSwarmEventDirector({ state: h.state, bus: h.bus, helpers: {}, registry });
  director.init();
  const awards = () => named(h.emitted, 'run:awardRequested')
    .filter((e) => e.payload && e.payload.reason === 'swarm:supplyPod');
  director._pods.set(77, 60);
  const foreign = { pickupId: 77, collectorId: 40 };
  h.bus.emit('pickup:collected', foreign);
  assert.equal(awards().length, 0, 'an NPC collector is refused, never paid');
  assert.equal(foreign.acceptedAmount, 0, 'explicit rejection leaves the pod physical');
  assert.equal(foreign.rejectedAmount, 60, 'the full stamped worth stays unclaimed');
  assert.ok(director._pods.has(77), 'a refused scoop never spends the ledger');
  h.bus.emit('pickup:collected', { pickupId: 77, collectorId: 9 });
  assert.equal(awards().length, 1, 'the same pod still pays the pilot afterward');
  assert.ok(!director._pods.has(77), 'paid is spent — the ledger cannot pay twice');
  // Absent claims (the publishers disagree on payload shape); the player's id claims.
  for (const collectorId of [undefined, 9]) {
    director._pods.set(88, 60);
    const before = awards().length;
    h.bus.emit('pickup:collected', { pickupId: 88, collectorId });
    assert.equal(awards().length, before + 1, `collector ${collectorId} still pays`);
  }
  director.destroy();
});

test('a pod pays its stamped amount even scooped after the wave cleared', () => {
  const h = boot();
  beginSwarm(h, { stake: 'contender' });
  h.state.run.phase = 'active';
  h.state.playerId = 9;
  const registry = { get: () => null };
  const director = createSwarmEventDirector({ state: h.state, bus: h.bus, helpers: {}, registry });
  director.init();
  // The supply card spends and finishes in one tick — _live is long gone by collect time, so
  // the ledger carries what the pod was stamped with, not whatever event happens to be live.
  director._pods.set(55, 90);
  h.bus.emit('run:waveCleared', {});
  h.bus.emit('pickup:collected', { pickupId: 55 });
  const award = named(h.emitted, 'run:awardRequested')
    .find((e) => e.payload && e.payload.reason === 'swarm:supplyPod');
  assert.equal(award?.payload?.credits, 90, 'the pod pays its own stamped worth post-clear');
  director.destroy();
});

test('the stake score factor rides every awarded point — exhibition halves, ironbound doubles', () => {
  const scoreAfter = (stake) => {
    const h = boot();
    beginSwarm(h, { stake });
    h.bus.emit('run:awardRequested', { score: 10, reason: 'kill' });
    return h.state.run.score;
  };
  assert.equal(scoreAfter('ironbound'), 20, 'ironbound tallies double');
  assert.equal(scoreAfter('exhibition'), 5, 'exhibition tallies half');
  assert.equal(scoreAfter('contender'), 10, 'contender tallies true');
  // A scored-ruleset run never hears of a purse: absent stake reads the 1× baseline.
  const h = boot();
  h.bus.emit('run:beginRequested', { kind: 'survival', ruleset: 'scored', seed: SEED, arenaId: ARENA });
  h.bus.emit('run:awardRequested', { score: 10, reason: 'kill' });
  assert.equal(h.state.run.score, 10, 'an unstaked run pays true');
});

test('the door prices ghost parity off the stake the launch will actually send', () => {
  const DOOR = readFileSync(new URL('../src/ui/screens/crucible.js', import.meta.url), 'utf8');
  // currentGhostRules must mirror launchCurrent: a daily rides Contender, not the picked stake.
  assert.match(DOOR, /stake: daily \|\| ruleset !== SWARM_RULESET \? null : normalizeSwarmStake\(stake\)/,
    'the pending-launch rules compare under the contract the run will race');
});

test('the reading repaints on a free demo — its key carries trial and bought state', () => {
  const DRAFT = readFileSync(new URL('../src/ui/screens/crucibleDraft.js', import.meta.url), 'utf8');
  assert.match(DRAFT, /r\.demoed === offer\.demoed/, 'the reading key knows the trial');
  assert.match(DRAFT, /r\.purchased === offer\.purchased/, 'the reading key knows a free switch');
});

// ── S6.8 — the stake rides the run record and the ghost comparison ───────────

test('the stake stamps the run record and ghosts stay honest about it', () => {
  const h = boot();
  survivalResults.init(h.ctx);
  beginSwarm(h, { stake: 'veteran' });
  h.bus.emit('run:waveStarted', { wave: 1, tick: 1 });
  const rules = currentStuntRunRules(h.state, 'swarm');
  const loadoutRules = JSON.parse(rules.loadoutRules);
  assert.equal(loadoutRules.stake, 'veteran', 'the stamp names the contract');
  h.bus.emit('run:ended', { outcome: 'defeat', reason: 'player_death' });
  const result = survivalResults.lastResult();
  assert.ok(result, 'a result published');
  assert.equal(result.swarmStake, 'veteran', 'the result surface reads the stake flat');
  assert.equal(JSON.parse(result.recordRules.loadoutRules).stake, 'veteran');
  survivalResults.destroy();

  // The ghost comparison: absent ≡ contender (pre-stake stamps raced under it); a different
  // contract is a different run.
  const stamp = (stake) => ({
    mode: 'swarm', arenaId: ARENA, balanceRevision: 'r1', physicsRevision: 'p1',
    scoringRevision: 's1', simulationAssistProfile: 'cinematic',
    loadoutRules: JSON.stringify({
      ruleset: 'swarm', mutators: [], starter: null,
      ...(stake ? { stake } : {}),
    }),
  });
  const base = stamp(null);
  const contender = stamp('contender');
  const veteran = stamp('veteran');
  assert.equal(ghostComparability(base, contender).status, 'compatible',
    'a pre-stake ghost still races a contender run');
  assert.equal(ghostComparability(base, veteran).status, 'incompatible',
    'a pre-stake ghost does not race a veteran run');
  assert.ok(ghostComparability(contender, veteran).mismatches.includes('loadoutRules'),
    'the differing contract names itself');
});

// ── S6 — the launch path carries the contract end to end ─────────────────────

test('the door setup carries the stake onto the launch config unchanged', () => {
  const setup = crucibleSetupFor({
    starterId: 'ricochet_runner', seed: SEED, arenaId: ARENA,
    ruleset: SWARM_RULESET, swarmStake: 'ironbound',
  });
  assert.ok(setup.ok);
  assert.equal(setup.value.swarmStake, 'ironbound');
  // Non-swarm rulesets drop it — a scored run has no purse contract.
  const scored = crucibleSetupFor({
    starterId: 'ricochet_runner', seed: SEED, arenaId: ARENA, ruleset: 'scored',
    swarmStake: 'ironbound',
  });
  assert.ok(scored.ok);
  assert.equal(scored.value.swarmStake, undefined);
});
