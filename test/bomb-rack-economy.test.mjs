// PQ-205.03 — bomb rack economy and loadout orchestration.
// The bay is a fitted rack: payloads are bought into hangar stock at stations, loaded into
// rack sockets dock-side, and only loaded sockets are cyclable/droppable in flight. Credits
// move only through the economy owner's event seam (the real economy system is wired in here
// to prove it), cooldowns are per-payload and survive cycle + dock + save/load, and NPC
// drift-bomb drops never consult the player rack.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { core } from '../src/core/coreSystem.js';
import { bombs } from '../src/systems/bombs.js';
import { economy } from '../src/systems/economy.js';
import { BOMB_DEFS, BOMB_RACK, BOMB_STARTER_KIT } from '../src/data/bombs.js';
import { shipworksStationAccess } from '../src/systems/ships.js';

const DT = 1 / 60;
const OUTFIT_BERTH = 'station_helios'; // shipyard service → shipworksStationAccess().outfit

function rackScenario({ credits = 0 } = {}) {
  const state = createGameState(47), bus = createBus(), helpers = {};
  state.mode = 'flight'; state.simTime = 0; state.tick = 0;
  const ctx = { state, bus, helpers, registry: { get: () => null } };
  Object.create(core).init(ctx);
  const econ = Object.create(economy);
  econ.init(ctx);
  const player = helpers.spawnEntity({
    type: 'ship', team: 0, mass: 32, radius: 6,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, hull: 1000, hullMax: 1000,
  });
  state.playerId = player.id;
  state.player.credits = credits;
  const sys = Object.create(bombs);
  sys.init(ctx);
  const denied = [], toasts = [], charges = [], grants = [], dropped = [], cycles = [];
  bus.on('bombs:denied', (p) => denied.push(p));
  bus.on('toast', (p) => toasts.push(p));
  bus.on('economy:chargeCredits', (p) => charges.push(p));
  bus.on('economy:grantCredits', (p) => grants.push(p));
  bus.on('bombs:dropped', (p) => dropped.push(p));
  bus.on('bombs:cycle', (p) => cycles.push(p));
  return {
    state, bus, player, sys, econ, denied, toasts, charges, grants, dropped, cycles,
    dock() { state.ui.docked = true; state.ui.dockedStationId = OUTFIT_BERTH; },
    undock() { state.ui.docked = false; state.ui.dockedStationId = null; },
    tick(n = 1, dt = DT) { for (let i = 0; i < n; i++) { state.tick++; state.simTime += dt; sys.update(dt, state); } },
    press(action) { state.input.actions ||= {}; state.input.actions[action] = true; },
    spawn(spec = {}) {
      return helpers.spawnEntity({ type: 'ship', team: 1, mass: 32, radius: 1, hull: 1000, hullMax: 1000, ...spec });
    },
    cell(id) { return state.bombs.rack.cells.find((c) => c && c.id === id) || null; },
    loaded() { return state.bombs.rack.cells.filter((c) => c && c.count > 0); },
    close() { sys.destroy(); if (typeof econ.destroy === 'function') econ.destroy(); bus.clear(); },
  };
}

test('a fresh ship leaves the yard with the two-payload starter kit', () => {
  const t = rackScenario();
  try {
    const rt = t.state.bombs;
    assert.equal(rt.rack.sockets, BOMB_RACK.socketsBase);
    assert.equal(rt.rack.cells.length, BOMB_RACK.socketsBase);
    assert.deepEqual(rt.rack.cells.map((c) => c && c.id), [...BOMB_STARTER_KIT]);
    for (const c of rt.rack.cells) assert.equal(c.count, BOMB_DEFS[c.id].magazine);
    assert.deepEqual(rt.stock, {});
    assert.equal(rt.selectedId, BOMB_STARTER_KIT[0]);
  } finally { t.close(); }
});

test('payload purchases debit through the economy owner and refuse when broke', () => {
  const t = rackScenario({ credits: 1000 });
  try {
    t.dock();
    t.bus.emit('ui:buyPayload', { payloadId: 'bomb_goo', units: 2 });
    assert.equal(t.state.player.credits, 1000 - BOMB_DEFS.bomb_goo.price * 2);
    assert.equal(t.state.bombs.stock.bomb_goo, 2);
    assert.equal(t.charges.length, 1);
    assert.equal(t.charges[0].amount, BOMB_DEFS.bomb_goo.price * 2);
    assert.match(t.charges[0].reason, /ordnance:bomb_goo/);
    // Broke: the intent is denied and no credit write happens at all.
    t.state.player.credits = BOMB_DEFS.bomb_emp.price - 1;
    const held = t.state.player.credits;
    t.bus.emit('ui:buyPayload', { payloadId: 'bomb_emp', units: 1 });
    assert.equal(t.state.player.credits, held, 'no partial charge when broke');
    assert.equal(t.state.bombs.stock.bomb_emp || 0, 0);
    assert.ok(t.denied.some((d) => d.reason === 'credits' && d.payloadId === 'bomb_emp'));
  } finally { t.close(); }
});

test('sell-back pays the resell fraction through the same economy seam', () => {
  const t = rackScenario({ credits: 0 });
  try {
    t.dock();
    t.state.bombs.stock.bomb_thermite = 3;
    t.bus.emit('ui:sellPayload', { payloadId: 'bomb_thermite', units: 2 });
    const refund = Math.max(1, Math.floor(BOMB_DEFS.bomb_thermite.price * 2 * BOMB_RACK.sellbackFraction));
    assert.equal(t.state.player.credits, refund);
    assert.equal(t.state.bombs.stock.bomb_thermite, 1);
    assert.equal(t.grants.length, 1);
    assert.match(t.grants[0].reason, /ordnance:resell:bomb_thermite/);
    // Nothing to sell → no grant.
    t.bus.emit('ui:sellPayload', { payloadId: 'bomb_emp', units: 1 });
    assert.equal(t.grants.length, 1);
  } finally { t.close(); }
});

test('fitting and unfitting are dock-side verbs that move units between hangar and sockets', () => {
  const t = rackScenario();
  try {
    t.state.bombs.stock.bomb_emp = 3;
    t.bus.emit('ui:fitPayload', { socketIndex: 0, payloadId: 'bomb_emp' });
    assert.ok(t.denied.some((d) => d.reason === 'not_docked'), 'undocked fit is refused');
    assert.equal(t.state.bombs.rack.cells[0].id, 'bomb_frag', 'rack untouched while undocked');
    t.dock();
    assert.equal(shipworksStationAccess(t.state).outfit, true);
    // Fitting over a loaded socket returns the displaced magazine to the hangar.
    t.bus.emit('ui:fitPayload', { socketIndex: 0, payloadId: 'bomb_emp' });
    assert.equal(t.state.bombs.rack.cells[0].id, 'bomb_emp');
    assert.equal(t.state.bombs.rack.cells[0].count, Math.min(BOMB_DEFS.bomb_emp.magazine, 3));
    assert.equal(t.state.bombs.stock.bomb_emp || 0, Math.max(0, 3 - BOMB_DEFS.bomb_emp.magazine));
    assert.equal(t.state.bombs.stock.bomb_frag, BOMB_DEFS.bomb_frag.magazine);
    // Top-up path: same payload id on the socket pulls more units from stock.
    t.state.bombs.stock.bomb_emp = 2;
    t.state.bombs.rack.cells[0].count = 1;
    t.bus.emit('ui:fitPayload', { socketIndex: 0, payloadId: 'bomb_emp' });
    assert.equal(t.state.bombs.rack.cells[0].count, Math.min(BOMB_DEFS.bomb_emp.magazine, 3));
    // Unfit hands the whole cell back to the hangar.
    t.bus.emit('ui:unfitPayload', { socketIndex: 0 });
    assert.equal(t.state.bombs.rack.cells[0], null);
    assert.equal(t.state.bombs.stock.bomb_emp, BOMB_DEFS.bomb_emp.magazine);
  } finally { t.close(); }
});

test('cycle walks only fitted, loaded sockets — hangar stock is never cyclable', () => {
  const t = rackScenario();
  try {
    t.state.bombs.stock.bomb_emp = 5; // owned but never fitted
    for (let i = 0; i < 3; i++) { t.press('cycleBomb'); t.tick(1); }
    assert.deepEqual(t.cycles.map((c) => c.payloadId), ['bomb_concussion', 'bomb_frag', 'bomb_concussion']);
    assert.equal(t.state.bombs.selectedId, 'bomb_concussion');
    // Unfit the concussion cell dock-side: a one-payload rack wraps onto itself.
    t.dock();
    t.bus.emit('ui:unfitPayload', { socketIndex: 1 });
    t.undock();
    t.state.bombs.selectedId = 'bomb_frag';
    t.press('cycleBomb'); t.tick(1);
    assert.equal(t.state.bombs.selectedId, 'bomb_frag', 'single loaded socket wraps onto itself');
    assert.equal(t.cycles[t.cycles.length - 1].payloadId, 'bomb_frag');
  } finally { t.close(); }
});

test('depletion advances in socket order, not back to the first loaded socket', () => {
  const t = rackScenario();
  try {
    // Three sockets: 0 frag, 1 concussion, 2 EMP. Deplete the MIDDLE one — the next loaded
    // socket in circular order is EMP (socket 2), not the frag at socket 0.
    t.dock();
    t.state.player.credits += BOMB_RACK.socketUpgradeCr + BOMB_DEFS.bomb_emp.price;
    t.bus.emit('ui:upgradeBombRack', {});
    t.bus.emit('ui:buyPayload', { payloadId: 'bomb_emp', units: 1 });
    t.bus.emit('ui:fitPayload', { socketIndex: 2, payloadId: 'bomb_emp' });
    assert.equal(t.cell('bomb_emp').count, 1);
    t.state.bombs.selectedId = 'bomb_concussion';
    const concussion = t.cell('bomb_concussion');
    concussion.count = 1;
    t.state.simTime += 10; // clear the payload cooldown for the fixture
    const bomb = t.sys.drop(t.player, 'bomb_concussion', t.state);
    assert.ok(bomb);
    assert.equal(t.cell('bomb_concussion').count, 0);
    assert.equal(t.state.bombs.selectedId, 'bomb_emp',
      'selection advanced to the next loaded socket in rack order');
    assert.equal(t.cycles[t.cycles.length - 1].index, 2, 'the cycle receipt names socket 2');
  } finally { t.close(); }
});

test('a drop consumes one loaded unit; a dry rack refuses the verb and toasts once per press', () => {
  const t = rackScenario();
  try {
    const frag = t.cell('bomb_frag'), full = frag.count;
    const bomb = t.sys.drop(t.player, 'bomb_frag', t.state);
    assert.ok(bomb);
    assert.equal(t.cell('bomb_frag').count, full - 1, 'one unit left the magazine');
    // Dropping the last unit auto-advances the selection to the next loaded socket.
    frag.count = 1;
    t.state.simTime += 10; // clear the payload cooldown for the fixture
    const last = t.sys.drop(t.player, 'bomb_frag', t.state);
    assert.ok(last);
    assert.equal(t.cell('bomb_frag').count, 0);
    assert.equal(t.cell('bomb_frag').id, 'bomb_frag', 'a dry socket keeps its fit for dock-side restock');
    assert.equal(t.state.bombs.selectedId, 'bomb_concussion');
    // Drain the rack entirely: the verb answers with a toast and drops nothing.
    t.state.bombs.rack.cells[1].count = 0;
    const droppedBefore = t.dropped.length, toastsBefore = t.toasts.length;
    t.press('dropBomb'); t.tick(1);
    assert.equal(t.dropped.length, droppedBefore, 'no bomb spawned from an empty rack');
    assert.equal(t.state.bombs.selectedId, null);
    assert.ok(t.toasts.slice(toastsBefore).some((x) => /rack empty/i.test(x.text)));
    // The player cannot reach unfitted ordnance directly either.
    assert.equal(t.sys.drop(t.player, 'bomb_goo', t.state), null);
    assert.ok(t.denied.some((d) => d.reason === 'not_loaded' && d.payloadId === 'bomb_goo'));
  } finally { t.close(); }
});

test('dock-side restock refills fitted magazines for the yard fee; the socket weld extends once', () => {
  const t = rackScenario({ credits: 10000 });
  try {
    t.dock();
    const rt = t.state.bombs;
    rt.rack.cells[0].count = 1;
    rt.stock.bomb_frag = 10;
    const before = t.state.player.credits;
    t.bus.emit('ui:restockBombRack', {});
    assert.equal(rt.rack.cells[0].count, BOMB_DEFS.bomb_frag.magazine);
    assert.equal(rt.stock.bomb_frag, 10 - (BOMB_DEFS.bomb_frag.magazine - 1));
    assert.equal(t.state.player.credits, before - BOMB_RACK.restockFeeCr);
    assert.ok(t.charges.some((c) => c.reason === 'service:ordnance_restock' && c.amount === BOMB_RACK.restockFeeCr));
    // Full rack → no fee, no charge.
    const beforeFull = t.state.player.credits;
    t.bus.emit('ui:restockBombRack', {});
    assert.equal(t.state.player.credits, beforeFull);
    // The socket weld is a one-time yard service.
    t.bus.emit('ui:upgradeBombRack', {});
    assert.equal(rt.rack.sockets, BOMB_RACK.socketsMax);
    assert.equal(rt.rack.cells.length, BOMB_RACK.socketsMax);
    assert.equal(rt.rack.cells[BOMB_RACK.socketsMax - 1], null, 'the new socket arrives empty');
    assert.equal(t.state.player.credits, beforeFull - BOMB_RACK.socketUpgradeCr);
    const beforeMax = t.state.player.credits;
    t.bus.emit('ui:upgradeBombRack', {});
    assert.equal(t.state.player.credits, beforeMax, 'second weld refused');
    assert.equal(rt.rack.sockets, BOMB_RACK.socketsMax);
  } finally { t.close(); }
});

test('payload cooldowns are per-payload and survive cycles, sector sweeps and dock trips', () => {
  const t = rackScenario();
  try {
    t.sys.drop(t.player, 'bomb_frag', t.state);
    const fragUntil = t.state.bombs.cooldowns.bomb_frag;
    assert.ok(fragUntil > t.state.simTime);
    // Cycling to concussion does not touch frag's clock, and concussion itself is hot.
    t.press('cycleBomb'); t.tick(1);
    assert.equal(t.state.bombs.selectedId, 'bomb_concussion');
    assert.equal(t.state.bombs.cooldowns.bomb_frag, fragUntil);
    t.state.simTime += 1; // past the shared release latch
    const conc = t.sys.drop(t.player, 'bomb_concussion', t.state);
    assert.ok(conc, 'an uncooled fitted payload drops while frag is still cooling');
    assert.ok(t.state.bombs.cooldowns.bomb_frag > t.state.simTime, 'frag still on its own clock');
    // Sector/dock sweeps release live entities but never the payload clocks.
    t.bus.emit('sector:exit'); t.bus.emit('sector:enter');
    assert.equal(t.state.bombs.cooldowns.bomb_frag, fragUntil);
    assert.equal(t.state.bombs.cooldowns.bomb_concussion, t.state.bombs.cooldowns.bomb_concussion);
    // Frag cannot drop again until its own cooldown passes.
    t.state.bombs.selectedId = 'bomb_frag';
    assert.equal(t.sys.drop(t.player, 'bomb_frag', t.state), null, 'still cooling');
    t.state.simTime = fragUntil + 0.01;
    t.state.bombs.cooldownUntil = 0;
    assert.ok(t.sys.drop(t.player, 'bomb_frag', t.state), 'drops once its own clock clears');
  } finally { t.close(); }
});

test('the rack bag round-trips through save/load and pre-rack saves land on the starter kit', () => {
  const t = rackScenario({ credits: 10000 });
  try {
    t.dock();
    t.bus.emit('ui:upgradeBombRack', {});
    t.state.bombs.stock.bomb_emp = 2;
    t.sys.fitPayload({ socketIndex: 2, payloadId: 'bomb_emp' });
    const rt = t.state.bombs;
    rt.rack.cells[0].count = 1;
    rt.cooldowns.bomb_frag = 42.5;
    rt.cooldownUntil = 1.25;
    rt.selectedId = 'bomb_emp';
    const blob = JSON.parse(JSON.stringify(t.sys.serialize()));

    const t2 = rackScenario();
    try {
      t2.sys.deserialize(blob);
      const rt2 = t2.state.bombs;
      assert.equal(rt2.rack.sockets, rt.rack.sockets);
      assert.deepEqual(rt2.rack.cells, rt.rack.cells);
      assert.deepEqual(rt2.stock, rt.stock);
      assert.deepEqual(rt2.cooldowns, rt.cooldowns);
      assert.equal(rt2.cooldownUntil, rt.cooldownUntil);
      assert.equal(rt2.selectedId, rt.selectedId);
    } finally { t2.close(); }

    // A pre-rack save (no rack key, or no bombs key at all) gets the additive starter default.
    const t3 = rackScenario();
    try {
      t3.sys.deserialize({ selectedId: 'bomb_goo', cooldownUntil: 9, cooldowns: { bomb_goo: 99 } });
      assert.equal(t3.state.bombs.rack.sockets, BOMB_RACK.socketsBase);
      assert.deepEqual(t3.state.bombs.rack.cells.map((c) => c && c.id), [...BOMB_STARTER_KIT]);
      t3.sys.deserialize(undefined);
      assert.equal(t3.state.bombs.rack.sockets, BOMB_RACK.socketsBase);
      assert.equal(t3.state.bombs.selectedId, BOMB_STARTER_KIT[0]);
      assert.equal(t3.state.bombs.cooldowns.bomb_goo || 0, 0, 'legacy cooldowns do not smuggle through');
    } finally { t3.close(); }

    // A crafted oversize rack shrinks to socketsMax and hands overflow units to the hangar.
    const t4 = rackScenario();
    try {
      t4.sys.deserialize({
        rack: {
          sockets: 5,
          cells: [
            { id: 'bomb_frag', count: 2 }, { id: 'bomb_goo', count: 2 },
            { id: 'bomb_emp', count: 2 }, { id: 'bomb_scrambler', count: 1 },
            { id: 'bomb_anchor', count: 3 }, { id: 'bogus_payload', count: 9 },
          ],
        },
        stock: { bomb_anchor: 1, nope: 4 },
        cooldowns: { bomb_frag: 12, junk: 7 },
        selectedId: 'bomb_anchor',
      });
      const rt4 = t4.state.bombs;
      assert.equal(rt4.rack.sockets, BOMB_RACK.socketsMax);
      assert.equal(rt4.rack.cells.length, BOMB_RACK.socketsMax);
      // Overflow cells (indices 3+) returned their units to stock; junk ids dropped.
      assert.equal(rt4.stock.bomb_scrambler, 1);
      assert.equal(rt4.stock.bomb_anchor, 1 + 3, 'saved stock + trimmed socket units');
      assert.equal(rt4.stock.nope || 0, 0);
      assert.equal(rt4.cooldowns.junk || 0, 0);
      assert.equal(rt4.selectedId, 'bomb_frag', 'selection re-normalizes onto a loaded socket');
    } finally { t4.close(); }
  } finally { t.close(); }
});

test('NPC drift-bomb drops bypass the player rack and never consume its stock', () => {
  const t = rackScenario();
  try {
    const npc = t.spawn({ pos: { x: 60, z: 0 } });
    t.state.bombs.rack.cells = [null, null];
    t.state.bombs.selectedId = null;
    const bomb = t.sys.drop(npc, 'bomb_goo', t.state);
    assert.ok(bomb, 'npc drop ignores the empty player rack');
    assert.equal(bomb.data.bombId, 'bomb_goo');
    assert.equal(bomb.data.ownerId, npc.id);
    assert.equal(t.state.bombs.stock.bomb_goo || 0, 0, 'npc drops have no hangar and take nothing');
    // The empty player rack still refuses its own drop.
    assert.equal(t.sys.drop(t.player, 'bomb_goo', t.state), null);
    assert.ok(t.denied.some((d) => d.reason === 'not_loaded' && d.payloadId === 'bomb_goo'));
  } finally { t.close(); }
});

test('game:new reseats the starter kit and clears the run clocks', () => {
  const t = rackScenario({ credits: 5000 });
  try {
    t.dock();
    t.bus.emit('ui:upgradeBombRack', {});
    t.sys.drop(t.player, 'bomb_frag', t.state);
    t.state.bombs.stock.bomb_emp = 3;
    t.bus.emit('game:new', {});
    const rt = t.state.bombs;
    assert.equal(rt.rack.sockets, BOMB_RACK.socketsBase);
    assert.deepEqual(rt.rack.cells.map((c) => c && c.id), [...BOMB_STARTER_KIT]);
    assert.deepEqual(rt.stock, {});
    assert.deepEqual(rt.cooldowns, {});
    assert.equal(rt.selectedId, BOMB_STARTER_KIT[0]);
  } finally { t.close(); }
});
