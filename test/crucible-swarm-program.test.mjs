// The swarm program's honesty suite (design/swarm/SWARM_PROGRAM.md §S6) — stakes are pure data,
// the purse lands before the armory, the shelf is exhaustive against the real def tables, hull
// launches re-derive legality, events draw deterministically, a demo strips and a buy keeps,
// and the stake rides the run record into the ghost comparison.
//
// The harness drives the REAL owners — runSession owns state.run, survivalDraft owns the armory,
// ships owns fittings. Transitions walk the same run:transitionRequested seam the phase machine
// emits; nothing stubs the wallet or the shelf.
import assert from 'node:assert/strict';
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
  isArmoryStock,
  swarmCatalogCoverage,
  swarmCatalogOffers,
  validateSwarmCatalog,
} from '../src/data/swarmCatalog.js';
import {
  SWARM_STAKES,
  normalizeSwarmStake,
  swarmStakeFor,
  swarmStakePitch,
  validateSwarmStakes,
} from '../src/data/swarmStakes.js';
import {
  SWARM_EVENT_BY_ID,
  SWARM_EVENT_TABLES,
  SWARM_SHARED_EVENTS,
  swarmEventFor,
  validateSwarmEvents,
} from '../src/data/swarmEvents.js';
import { SWARM_RULESET, isSwarmBossWave } from '../src/data/swarmMode.js';
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

test('the armory shelf covers every purchasable def the game ships', () => {
  const authoredIds = new Set(
    SURVIVAL_DRAFT_OFFERS.concat(SWARM_DRAFT_OFFERS).map((offer) => offer.defId),
  );
  const stock = WEAPONS.concat(MODULES).filter(isArmoryStock);
  const coverage = swarmCatalogCoverage();
  assert.equal(coverage.total, stock.length, 'coverage counts the same stock the gate does');
  const catalog = swarmCatalogOffers(authoredIds);
  const cataloged = new Set(catalog.map((row) => row.defId));
  for (const def of stock) {
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
  // Non-event waves draw nothing; boss rounds carry the boss room instead.
  for (let wave = 1; wave <= 40; wave++) {
    const draw = swarmEventFor({ arenaId: 'helios_core', wave, seed: SEED });
    if (wave % 5 !== 0 || isSwarmBossWave(wave)) {
      assert.equal(draw, null, `wave ${wave} is not an event round`);
    } else {
      assert.ok(draw && SWARM_EVENT_BY_ID[draw.id], `wave ${wave} draws a real card`);
      // Same inputs, same card — a ghost replay and a share code see the same room.
      const again = swarmEventFor({ arenaId: 'helios_core', wave, seed: SEED });
      assert.equal(again.id, draw.id, `wave ${wave} is seeded-stable`);
    }
  }
  // Signature events headline their own room: across a seed sweep the arena's cards
  // outnumber the shared deck.
  let signature = 0;
  let shared = 0;
  const own = new Set(SWARM_EVENT_TABLES.helios_core);
  for (let seed = 1; seed <= 40; seed++) {
    const draw = swarmEventFor({ arenaId: 'helios_core', wave: 5, seed });
    if (own.has(draw.id)) signature++;
    else if (SWARM_SHARED_EVENTS.includes(draw.id)) shared++;
  }
  assert.ok(signature > shared,
    `signatures headline helios_core (${signature} signature vs ${shared} shared)`);
  assert.equal(signature + shared, 40, 'every event wave draws a card');
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

test('buying a hull retires the demos on the hull you are leaving', () => {
  const h = boot();
  beginSwarm(h, { stake: 'exhibition' });
  landPurse(h, 'exhibition');
  transition(h, 'loadout', 'draft');
  const offers = survivalDraft.currentOffers();
  const demoable = offers.find((o) =>
    Number.isInteger(o.slotIndex) && typeof o.defId === 'string' && o.kind === 'number');
  const hullOffer = offers.find((o) =>
    o.kind === 'hull' && o.available && o.defId !== 'ship_hornet');
  assert.ok(demoable && hullOffer, 'a demoable card and a foreign hull are on the shelf');
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
