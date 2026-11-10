/**
 * Linked Shield Pylons (packet 06) — acquisition, input and the next-operation label.
 *
 *   - the Pylon Projector is a real catalog module the pilot can buy at the first station and fit in
 *     the starter hull's utility slot (no hidden flag, no unreachable item);
 *   - the deploy verb is a labeled edge action with a real default binding that is rebindable, and
 *     the HUD label reads the key from the binding owner (never typed);
 *   - the label names the NEXT operation: place the first endpoint, link the second, recall the pair
 *     under the aim, capacity reached; with a wall standing it leads with the one primary resource
 *     and the most relevant failure cause.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { ships as shipsProto, buildSlotList, stationShopOffer } from '../src/systems/ships.js';
import { SHIPS } from '../src/data/ships.js';
import { MODULES } from '../src/data/modules.js';
import { TECH_NODES } from '../src/data/tech.js';
import { shieldPylons } from '../src/systems/shieldPylons.js';
import { DEFAULTS, resolveActionLabel, resolveActionCodes, TAUGHT_FLIGHT_ACTIONS } from '../src/systems/input.js';
import { resolvePylonHud, pylonHud } from '../src/ui/pylonHud.js';
import { PYLON_MODULE_ID, SHIELD_PYLON_DEF as DEF, PYLON_STATES as S, PYLON_NEXT_OP, PYLON_DENIALS as DENY } from '../src/data/shieldPylons.js';
import { pylonMirror } from '../src/combat/pylonShieldQuery.js';

const COOLDOWN_TICKS = Math.ceil(DEF.deployCooldownS / SIM_DT) + 3;

test('the Pylon Projector is a catalog module: researchable, on the first station rack, fits the starter utility slot', () => {
  const def = MODULES.find((m) => m.id === PYLON_MODULE_ID);
  assert.ok(def, 'in the module catalog');
  assert.equal(def.slotType, 'utility');
  assert.equal(def.size, 'S', 'the starter hull\'s only utility bay is S');
  assert.equal(def.mods.pylonPairs, 2);
  assert.ok(def.sentence && !def.sentence.includes('\n'), 'one player sentence');
  assert.ok(def.description.length > 40);
  const offer = stationShopOffer(def, 'station_helios');
  assert.ok(offer && offer.price > 0 && offer.price < def.price, 'sold at first-haul terms at Helios');
  const tech = TECH_NODES.find((t) => t.unlocks && t.unlocks.modules && t.unlocks.modules.includes(PYLON_MODULE_ID));
  assert.equal(def.requiresTech, tech && tech.id, 'the research gate and the tech unlock agree');
});

test('buy and fit at Helios through the real ships owner; the fitted module is what the projector reads', () => {
  const state = createGameState(250);
  state.playerId = 1;
  state.player.credits = 100000;
  state.player.moduleInventory = [];
  const slots = buildSlotList(SHIPS.find((s) => s.id === 'ship_kestrel'));
  state.player.ownedShips = [{ defId: 'ship_kestrel', fittings: Array(slots.length).fill(null) }];
  state.player.activeShipIndex = 0;
  state.ui.docked = true;
  state.ui.dockedStationId = 'station_helios';
  const bus = createBus();
  const charges = [];
  bus.on('economy:chargeCredits', (p) => charges.push(p));
  const ships = Object.assign({}, shipsProto);
  ships.init({ state, bus, helpers: {} });
  const utility = slots.find((s) => s.type === 'utility').index;
  assert.equal(ships.buyModule({ defId: PYLON_MODULE_ID, shipIndex: 0, fitSlotIndex: utility }), true);
  assert.equal(state.player.ownedShips[0].fittings[utility], PYLON_MODULE_ID);
  assert.equal(charges[0].amount, stationShopOffer(MODULES.find((m) => m.id === PYLON_MODULE_ID), 'station_helios').price);
});

test('the deploy verb has a default binding, is a taught flight action, and a rebind is what the label reads', () => {
  assert.deepEqual(DEFAULTS.SCHEMES.pilot.deployShieldPylon, ['Digit6']);
  assert.ok(TAUGHT_FLIGHT_ACTIONS.includes('deployShieldPylon'));
  const base = { settings: { gameplay: { controlScheme: 'pilot' }, controls: { bindings: null } } };
  assert.equal(resolveActionLabel(base, 'deployShieldPylon'), '6');
  const remapped = { settings: { gameplay: { controlScheme: 'pilot' }, controls: { bindings: { deployShieldPylon: ['KeyJ'] } } } };
  assert.deepEqual(resolveActionCodes(remapped, 'deployShieldPylon'), ['KeyJ']);
  assert.equal(resolveActionLabel(remapped, 'deployShieldPylon'), 'J');
  // No other flight verb shares the key in any scheme.
  for (const scheme of Object.keys(DEFAULTS.SCHEMES)) {
    for (const [action, codes] of Object.entries(DEFAULTS.SCHEMES[scheme])) {
      if (action === 'deployShieldPylon') continue;
      assert.ok(!(codes || []).includes('Digit6'), `${scheme}.${action} must not share Digit6`);
    }
  }
});

function boot({ fitted = true } = {}) {
  const sim = createSimulation({ seed: 6262, bus: createBus(), systems: [shieldPylons] });
  const { state } = sim;
  state.mode = 'flight';
  state.input.actions = {};
  state.player.credits = 5000;
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 12, collides: true, vel: { x: 0, z: 0 }, rot: 0, hull: 200, hullMax: 200, flags: {},
    data: { fittings: fitted ? [PYLON_MODULE_ID] : [] },
  });
  state.playerId = player.id;
  return { sim, state, player };
}

function press(t, aim) {
  t.state.input.aimWorld = { x: aim.x, z: aim.z };
  t.state.input.actions.deployShieldPylon = true;
  t.sim.step();
}

function wait(t, ticks) { for (let i = 0; i < ticks; i++) t.sim.step(); }

test('the label names the NEXT operation at every stage of the pair', () => {
  const t = boot();
  const label = () => resolvePylonHud(t.state);
  // Fitted, nothing deployed: place the first endpoint (and say which key).
  t.state.input.aimWorld = { x: 100, z: -60 };
  assert.equal(label().op, PYLON_NEXT_OP.first);
  assert.equal(label().key, '6');
  assert.equal(label().tone, 'idle');
  press(t, { x: 100, z: -60 });
  // First endpoint down, aim moved off it: link the second.
  t.state.input.aimWorld = { x: 100, z: 60 };
  assert.equal(label().next.id, 'second');
  assert.match(label().op, /recharging/i, 'the second press is not ready until the existing cooldown clears');
  assert.equal(label().status, 'PYLON DOWN');
  // Aim back on the pylon: the press would recall it, and the label says so.
  t.state.input.aimWorld = { x: 100, z: -60 };
  assert.equal(label().op, 'RECALL PAIR');
  wait(t, COOLDOWN_TICKS);
  press(t, { x: 100, z: 60 });
  assert.match(label().status, /^LINKING/);
  wait(t, 80);
  t.state.input.aimWorld = { x: 0, z: 150 };
  assert.match(label().status, /^WALL \d+% \d+s$/);
  assert.equal(label().op, PYLON_NEXT_OP.first, 'a second pair may still be placed');
  // Fill capacity: the label says CAPACITY REACHED and how to free a seat.
  wait(t, COOLDOWN_TICKS);
  press(t, { x: -100, z: -60 });
  wait(t, COOLDOWN_TICKS);
  press(t, { x: -100, z: 60 });
  wait(t, COOLDOWN_TICKS);
  t.state.input.aimWorld = { x: 0, z: 150 };
  assert.match(label().op, /^CAPACITY REACHED/);
  assert.match(label().op, /recall/);
});

test('the label names the one primary resource and the most relevant failure cause', () => {
  const t = boot();
  press(t, { x: 100, z: -60 });
  wait(t, COOLDOWN_TICKS);
  press(t, { x: 100, z: 60 });
  wait(t, 90);
  t.state.input.aimWorld = { x: 0, z: 150 };
  const pair = pylonMirror(t.state).pairs[0];
  assert.equal(pair.state, S.ACTIVE);
  pair.energy = pair.capacity * 0.2; pair.state = S.STRAINED;
  let v = resolvePylonHud(t.state);
  assert.equal(v.status, 'WALL STRAINED 20%'); assert.equal(v.tone, 'warning');
  pair.state = S.OVERLOADED; pair.overloadUntil = t.state.simTime + 4; pair.energy = 0;
  v = resolvePylonHud(t.state);
  assert.match(v.status, /^WALL OFFLINE [1-4]s$/);
  pair.state = S.ACTIVE; pair.energy = pair.capacity; pair.warnAt = t.state.simTime - 1; pair.expireAt = t.state.simTime + 5;
  v = resolvePylonHud(t.state);
  assert.match(v.status, /^WALL COLLAPSE IN [1-5]s$/);
});

test('not fitted: the HUD says nothing and a press only explains itself', () => {
  const t = boot({ fitted: false });
  assert.equal(resolvePylonHud(t.state), null);
  const toasts = [];
  t.sim.bus.on('toast', (p) => toasts.push(p.text));
  press(t, { x: 100, z: 0 });
  assert.match(toasts[0], /Fit a Pylon Projector/);
  assert.equal(pylonMirror(t.state), null);
});

test('the pill system is headless-safe and registers no DOM without a document', () => {
  const t = boot();
  const hud = Object.create(pylonHud);
  hud.init({ state: t.state });
  hud.update(1 / 60, t.state);
  hud.destroy();
});


test('second-endpoint preview shows the actual span and strength before spending, and matches the committed wall', () => {
  const t = boot(), charges = [];
  t.sim.bus.on('economy:chargeCredits', p => charges.push(p.amount));
  press(t, { x: 100, z: -60 });
  wait(t, COOLDOWN_TICKS);
  const pair = pylonMirror(t.state).pairs[0];
  t.state.input.aimWorld = { x: 100, z: -24 };
  const short = resolvePylonHud(t.state);
  assert.equal(short.preview.span, DEF.minSpan);
  assert.equal(short.preview.capacity, DEF.capacity);
  assert.equal(short.preview.cost, DEF.endpointCostCredits);
  assert.match(short.status, /36 WU.*620 SHIELD.*90 CR/);
  assert.equal(short.op, PYLON_NEXT_OP.second);

  t.state.input.aimWorld = { x: 100, z: 130 };
  const long = resolvePylonHud(t.state);
  assert.equal(long.preview.span, DEF.maxSpan);
  assert.equal(long.preview.capacity, DEF.capacity * DEF.capacitySpanFloor);
  assert.ok(long.preview.capacity < short.preview.capacity, 'a longer line visibly trades strength for coverage');
  assert.match(long.status, /190 WU.*341 SHIELD.*90 CR/);
  for (let i = 0; i < 5; i++) resolvePylonHud(t.state);
  assert.deepEqual(charges, [DEF.endpointCostCredits], 'aiming and reading never spends for the second endpoint');
  assert.equal(pair.state, S.UNPAIRED);
  assert.equal(pair.b, null);

  press(t, { x: 100, z: 130 });
  assert.deepEqual(charges, [DEF.endpointCostCredits, DEF.endpointCostCredits]);
  assert.equal(pair.capacity, long.preview.capacity, 'the displayed capacity is the real owner result');
  assert.equal(pair.span, long.preview.span);
});

test('placement denials give the next correction before a press and disappear when the plan becomes valid', () => {
  const t = boot(), charges = [];
  t.sim.bus.on('economy:chargeCredits', p => charges.push(p.amount));
  press(t, { x: 100, z: -60 });
  wait(t, COOLDOWN_TICKS);
  const blocker = t.sim.spawn({ type: 'ship', team: 1, pos: { x: 100, z: 60 }, radius: 10,
    vel: { x: 0, z: 0 }, collides: true, hull: 100, hullMax: 100, data: { encounter: true } });
  t.state.input.aimWorld = { x: 100, z: 60 };
  let view = resolvePylonHud(t.state);
  assert.equal(view.next.reason, DENY.clearance);
  assert.match(view.op, /clear space/i);
  assert.equal(view.preview, null);
  t.state.input.aimWorld = { x: -100, z: 60 };
  view = resolvePylonHud(t.state);
  assert.equal(view.next.reason, DENY.tooFar);
  assert.match(view.op, /second endpoint closer/i);
  blocker.alive = false;
  t.state.input.aimWorld = { x: 100, z: 60 };
  view = resolvePylonHud(t.state);
  assert.equal(view.next.ok, true);
  assert.equal(view.op, PYLON_NEXT_OP.second);
  assert.equal(view.preview.span, 120);
  assert.deepEqual(charges, [DEF.endpointCostCredits]);
});

test('previewing a second wall preserves the existing weak wall warning and real rebound key', () => {
  const t = boot();
  press(t, { x: 100, z: -60 }); wait(t, COOLDOWN_TICKS);
  press(t, { x: 100, z: 60 }); wait(t, 90);
  const standing = pylonMirror(t.state).pairs[0];
  standing.energy = standing.capacity * 0.2; standing.state = S.STRAINED;
  press(t, { x: -100, z: -60 }); wait(t, COOLDOWN_TICKS);
  standing.energy = standing.capacity * 0.2; standing.state = S.STRAINED;
  t.state.settings.controls.bindings = { deployShieldPylon: ['KeyJ'] };
  t.state.input.aimWorld = { x: -100, z: 60 };
  const view = resolvePylonHud(t.state);
  assert.equal(view.status, 'WALL STRAINED 20%');
  assert.equal(view.tone, 'warning');
  assert.equal(view.key, 'J');
  assert.equal(view.preview.span, 120);
  assert.match(view.op, /^LINK SECOND ENDPOINT/);
  assert.ok(view.op.endsWith('120WU/468SP'));
});
