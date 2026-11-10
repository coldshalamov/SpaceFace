// NXB-018 — draft offers stay honest about the actual build and run wallet.
// The swarm armory cards must name the fitting they displace, a stale pick must
// refuse instead of silently buying a different benefit, and a refused draft
// still reaches a terminal resolution.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { fittingName, offerDraft } from '../src/data/survivalDraft.js';
import { MODULES } from '../src/data/modules.js';
import { SHIPS } from '../src/data/ships.js';
import { TECH_NODES } from '../src/data/tech.js';
import { WEAPONS } from '../src/data/weapons.js';
import { economy } from '../src/systems/economy.js';
import { runSession } from '../src/systems/runSession.js';
import { buildSlotList, ships } from '../src/systems/ships.js';
import { survivalDraft } from '../src/systems/survivalDraft.js';

const SEED = 4242;
const SHIP_BY_ID = new Map(SHIPS.map((def) => [def.id, def]));
const DEF_NAME = new Map(
  [...WEAPONS, ...MODULES].map((def) => [def.id, def.name]),
);

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
  // Unlock the arsenal so the fitting authority — not tech — is what the offer gate reflects.
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

function openSwarmDraft(h, wave = 2) {
  h.state.run = createRunState({ kind: 'survival', ruleset: 'swarm', seed: SEED });
  h.state.run.phase = 'draft';
  h.state.run.wave = wave;
  h.state.run.credits = 500;
  h.bus.emit('run:transitioned', { phase: 'draft' });
  return survivalDraft.currentOffers();
}

/** Replace the active hull's fit with `fittings`, padded with nulls to the slot count. */
function wearFit(h, fittings) {
  const ship = h.state.player.ownedShips[h.state.player.activeShipIndex];
  const slots = buildSlotList(SHIP_BY_ID.get(ship.defId));
  ship.fittings = slots.map((slot, i) => fittings[i] || null);
  return slots;
}

/** One defId per slot kind, so every hardpoint reads occupied. */
function fillEverySlot(h) {
  const ship = h.state.player.ownedShips[h.state.player.activeShipIndex];
  const slots = buildSlotList(SHIP_BY_ID.get(ship.defId));
  const used = new Set();
  const fittings = slots.map((slot) => {
    const kind = slot.type || slot.slotType || slot;
    const pool = kind === 'weapon' ? WEAPONS : MODULES;
    const pick = pool.find((def) => !used.has(def.id) && def.slotType === kind);
    if (pick) used.add(pick.id);
    return pick ? pick.id : null;
  });
  ship.fittings = fittings;
  return fittings;
}

test('a draft row names the exact fitting its card displaces', () => {
  const h = boot();
  const worn = fillEverySlot(h);
  assert.ok(worn.every(Boolean), 'fixture fills every slot so offers must displace');
  const rows = openSwarmDraft(h);
  const displacing = rows.filter((row) => row.replaces);
  assert.ok(displacing.length > 0, 'a full hull must still see legal sidegrades');
  for (const row of displacing) {
    assert.equal(row.replacesName, DEF_NAME.get(row.replaces),
      `${row.id} names what leaves the fit`);
    assert.equal(typeof row.replacesName, 'string');
    assert.notEqual(row.replacesName, 'the fitted item', 'no vague placeholder');
  }
});

test('a stale pick refuses instead of buying a different benefit', () => {
  const h = boot();
  const rows = openSwarmDraft(h);
  const target = rows.find((row) => row.available && row.kind !== 'hull' && row.kind !== 'service');
  assert.ok(target, 'an affordable fitting offer exists');
  h.state.run.credits = 0;
  const creditsBefore = h.state.run.credits;
  const fittingsBefore = JSON.stringify(
    h.state.player.ownedShips[h.state.player.activeShipIndex].fittings);
  h.bus.emit('run:draftPickRequested', { offerId: target.id });
  assert.equal(h.state.run.credits, creditsBefore, 'a refused pick never touches the wallet');
  assert.equal(
    JSON.stringify(h.state.player.ownedShips[h.state.player.activeShipIndex].fittings),
    fittingsBefore,
    'a refused pick never lands a different fitting',
  );
  assert.ok(survivalDraft.lastNotice(), 'the refusal is said, not silent');
});

test('a declined draft still reaches exactly one terminal resolution', () => {
  const h = boot();
  openSwarmDraft(h);
  h.bus.emit('run:draftPickRequested', { offerId: null });
  const resolved = h.emitted.filter((e) => e.event === 'run:draftResolved');
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].payload.reason, 'skipped');
  // A second request cannot resolve again — the draft is closed.
  h.bus.emit('run:draftPickRequested', { offerId: null });
  assert.equal(h.emitted.filter((e) => e.event === 'run:draftResolved').length, 1);
});

test('an already-fitted support module never reappears as a fresh offer', () => {
  const h = boot();
  const slots = buildSlotList(SHIP_BY_ID.get('ship_hornet'));
  const supportKinds = new Set(slots.map((s) => s.type || s.slotType || s).filter((k) => k !== 'weapon'));
  const module = MODULES.find((def) => supportKinds.has(def.slotType));
  assert.ok(module, 'fixture hull accepts a support module');
  const worn = fillEverySlot(h).map((id, i) => {
    const kind = slots[i].type || slots[i].slotType || slots[i];
    return kind === module.slotType ? module.id : id;
  });
  const h2 = h.state.player.ownedShips[h.state.player.activeShipIndex];
  h2.fittings = worn;
  const rows = openSwarmDraft(h, 3);
  assert.ok(
    !rows.some((row) => row.defId === module.id && !row.replaces),
    'no card sells back the module you are already wearing',
  );
});

test('offerDraft alone already names the displaced def id through replaces', () => {
  const shipDef = SHIP_BY_ID.get('ship_hornet');
  const slots = buildSlotList(shipDef);
  const used = new Set();
  const fittings = slots.map((slot) => {
    const kind = slot.type || slot.slotType || slot;
    const pool = kind === 'weapon' ? WEAPONS : MODULES;
    const pick = pool.find((def) => !used.has(def.id) && def.slotType === kind);
    if (pick) used.add(pick.id);
    return pick ? pick.id : null;
  });
  const result = offerDraft({
    seed: SEED, wave: 2, hullId: 'ship_hornet', fittings, ruleset: 'swarm', count: 100,
  });
  assert.equal(result.ok, true);
  const displacing = result.offers.filter((offer) => offer.replaces);
  assert.ok(displacing.length > 0);
  for (const offer of displacing) {
    assert.equal(typeof offer.replaces, 'string');
    assert.equal(fittingName(offer.replaces), DEF_NAME.get(offer.replaces));
  }
});
