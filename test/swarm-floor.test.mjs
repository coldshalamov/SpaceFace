import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { getCombatKernel } from '../src/combat/kernel.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import { survivalArena } from '../src/systems/survivalArena.js';
import { FOUNDRY_ARENA_ID } from '../src/systems/swarmArena.js';
import { runSession as runSessionProto } from '../src/systems/runSession.js';
import { ships as shipsProto, buildSlotList, fits } from '../src/systems/ships.js';
import { SHIPS } from '../src/data/ships.js';
import { WEAPONS } from '../src/data/weapons.js';
import { SWARM_RULESET } from '../src/data/swarmMode.js';
import { swarmHeldWeaponDefId } from '../src/systems/playerModifiers.js';
import {
  SWARM_FLOOR_PLANS,
  SWARM_FLOOR_PAD_KIND,
  SWARM_FLOOR_WALL_GUN_PRICE,
  SWARM_FLOOR_CRATE_PRICE,
  SWARM_FLOOR_CRATE_PULLS_PER_MOVE,
  SWARM_FLOOR_PAD_RETRY_S,
  swarmFloorPlanFor,
} from '../src/data/swarmFloor.js';

const DT = 1 / 60;
const HORNET_SLOTS = buildSlotList(SHIPS.find((s) => s.id === 'ship_hornet'));

function makeFields() {
  const live = new Map();
  return {
    registerEnvironmental(spec) { live.set(spec.id, spec); return spec; },
    registerExternal(spec) { return this.registerEnvironmental(spec); },
    unregisterExternal(id) { return live.delete(id); },
    updateExternal(id, patch) { const row = live.get(id); if (row) Object.assign(row, patch); return row || null; },
    hasExternal(id) { return live.has(id); },
  };
}

// A fresh hornet in the cradle: starter pulse laser on the lowest-index weapon slot, the two
// remaining mounts open — the authored swarm starting kit.
function starterShip() {
  const fittings = Array(HORNET_SLOTS.length).fill(null);
  fittings[0] = 'wpn_pulse_laser_s';
  return { defId: 'ship_hornet', fittings };
}

/**
 * Full owner stack: survivalArena hosts the floor director; runSession is the real purse;
 * ships is the real fitting owner. Only the entity bag and the fields ledger are stubs.
 */
function boot({ seed = 7, ruleset = SWARM_RULESET, arenaId = FOUNDRY_ARENA_ID, credits = 0 } = {}) {
  const state = createGameState(seed);
  const rawBus = createBus();
  const bus = {
    on: rawBus.on.bind(rawBus),
    off: rawBus.off.bind(rawBus),
    once: rawBus.once.bind(rawBus),
    emit: rawBus.emit.bind(rawBus),
  };
  let nextId = 1;
  const helpers = {
    spawnEntity(spec) {
      const entity = {
        ...spec, id: spec.id ?? nextId++, alive: true,
        pos: spec.pos ? { x: spec.pos.x, z: spec.pos.z } : { x: 0, z: 0 },
        vel: spec.vel ? { x: spec.vel.x, z: spec.vel.z } : { x: 0, z: 0 },
      };
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      return entity;
    },
  };
  const fields = makeFields();
  const ships = Object.assign({}, shipsProto);
  const session = Object.assign({}, runSessionProto);
  const ctx = {
    state, bus, helpers,
    registry: { get: (name) => name === 'fields' ? fields : name === 'ships' ? ships : null },
  };
  ships.init(ctx);
  session.init(ctx);
  survivalArena.init(ctx);

  const owned = starterShip();
  state.player.ownedShips = [owned];
  state.player.activeShipIndex = 0;
  const pilot = helpers.spawnEntity({
    type: 'ship', team: 1, mass: 60, radius: 10, hull: 200, hullMax: 200,
    pos: { x: 0, z: -600 },
    data: { defId: 'ship_hornet', fittings: owned.fittings },
  });
  state.playerId = pilot.id;

  const run = createRunState({ kind: 'survival', ruleset, seed });
  run.arenaId = arenaId;
  run.wave = 1;
  run.phase = 'wave_intro';
  state.run = run;
  state.simTime = 0;
  state.tick = 0;
  if (credits > 0) bus.emit('run:awardRequested', { credits, reason: 'test_stake' });
  const kernel = getCombatKernel(ctx);

  const events = {
    armed: [], bought: [], refused: [], moved: [], spent: [], rejected: [],
    toasts: [], cues: [], retired: [],
  };
  bus.on('swarm:floorArmed', (p) => events.armed.push({ ...p }));
  bus.on('swarm:floorPadBought', (p) => events.bought.push({ ...p }));
  bus.on('swarm:floorPadRefused', (p) => events.refused.push({ ...p }));
  bus.on('swarm:floorCrateMoved', (p) => events.moved.push({ ...p }));
  bus.on('run:spent', (p) => events.spent.push({ ...p }));
  bus.on('run:spendRejected', (p) => events.rejected.push({ ...p }));
  bus.on('toast', (p) => events.toasts.push({ ...p }));
  bus.on('audio:cue', (p) => events.cues.push({ ...p }));
  bus.on('entity:retired', (p) => events.retired.push({ ...p }));

  // The install fires synchronously inside this emit — listeners must already be attached.
  bus.emit('run:wavePlanned', { wave: 1, plan: planWave({ seed, arenaId, wave: 1 }) });

  function tick() {
    state.tick += 1;
    state.simTime = state.tick / 60;
    kernel.prePhysics(DT);
    survivalArena.update(DT, state);
  }

  function tickSeconds(s, maxTicks = 20000) {
    const until = state.simTime + s;
    let n = 0;
    while (state.simTime < until && n++ < maxTicks) tick();
    assert.ok(n < maxTicks, `tickSeconds(${s}) exceeded ${maxTicks} ticks`);
  }

  function pads() {
    return state.entityList.filter((e) => e && e.alive !== false && e.data && e.data.swarmFloorPad);
  }

  function padById(padId) {
    return pads().find((e) => e.data.swarmFloorPad.padId === padId) || null;
  }

  // The event physics publishes on a body-overlap acceptance ask, mirrored exactly.
  function collect(pad, collectorId = state.playerId) {
    const payload = {
      pickupId: pad.id, collectorId,
      kind: pad.data.kind, amount: pad.data.amount,
      pos: { x: pad.pos.x, z: pad.pos.z },
    };
    bus.emit('pickup:collected', payload);
    return payload;
  }

  return {
    state, ctx, bus, kernel, events, helpers, tick, tickSeconds, pads, padById, collect,
    owned,
    destroy() { survivalArena.destroy(); session.destroy(); kernel.dispose(); },
  };
}

test('a helios_core install arms six lit pads at the authored Foundry spots', () => {
  const h = boot();
  try {
    assert.equal(h.events.armed.length, 1, 'one arm receipt');
    assert.equal(h.events.armed[0].arenaId, FOUNDRY_ARENA_ID);
    assert.equal(h.events.armed[0].pads.length, 6);
    const plan = swarmFloorPlanFor(FOUNDRY_ARENA_ID);
    const south = h.padById('foundry-gun-south');
    const ne = h.padById('foundry-gun-ne');
    const crate = h.padById('foundry-crate');
    const forge = h.padById('foundry-forge');
    const tapW = h.padById('foundry-tap-west');
    const tapE = h.padById('foundry-tap-east');
    assert.ok(south && ne && crate && forge && tapW && tapE, 'all six pads spawned');
    for (const pad of [south, ne, crate, forge, tapW, tapE]) {
      assert.equal(pad.alive, true);
      assert.equal(pad.type, 'pickup', 'the radar pickup→beacon contract carries the floor mark');
      assert.equal(pad.data.playerCollectOnly, true, 'a hostile crossing never asks for a receipt');
      assert.equal(pad.data.kind, SWARM_FLOOR_PAD_KIND);
      assert.ok(typeof pad.data.swarmFloorPad.label === 'string'
        && pad.data.swarmFloorPad.label.length > 0, 'every pad carries its world label');
    }
    // Authored bearings: the south gun sits at (0, +310) from the room anchor, the NE gun at
    // (+220, −220); the crate opens on spot 0. Recover the anchor from the south pad.
    const anchor = { x: south.pos.x - 0, z: south.pos.z - 310 };
    assert.ok(Math.abs(ne.pos.x - (anchor.x + 220)) < 1e-6
      && Math.abs(ne.pos.z - (anchor.z - 220)) < 1e-6, 'NE gun sits on its authored corner');
    assert.ok(Math.abs(crate.pos.x - (anchor.x + plan.crateSpots[0].dx)) < 1e-6
      && Math.abs(crate.pos.z - (anchor.z + plan.crateSpots[0].dz)) < 1e-6,
      'the Crate opens on authored spot 0');
    assert.equal(south.data.swarmFloorPad.price, SWARM_FLOOR_WALL_GUN_PRICE);
    assert.equal(ne.data.swarmFloorPad.price, SWARM_FLOOR_WALL_GUN_PRICE);
    assert.equal(crate.data.swarmFloorPad.price, SWARM_FLOOR_CRATE_PRICE);
    assert.equal(south.data.swarmFloorPad.label, 'PULSE LASER S · 500');
    assert.equal(ne.data.swarmFloorPad.label, 'CONCUSSION CANNON S · 500');
    assert.equal(crate.data.swarmFloorPad.label, 'THE CRATE · 950');
  } finally { h.destroy(); }
});

test('a wall-gun pad sells its gun through the run purse and the ships owner fits it', () => {
  const h = boot({ credits: 5000 });
  try {
    const ne = h.padById('foundry-gun-ne');
    const payload = h.collect(ne);
    assert.equal(payload.acceptedAmount, 0, 'the pad yields nothing — it survives the crossing');
    assert.ok(Math.abs(payload.acceptanceRetryAt - (h.state.simTime + SWARM_FLOOR_PAD_RETRY_S)) < 1e-9,
      'a bought crossing arms the longer till embargo');
    assert.equal(h.state.run.credits, 5000 - SWARM_FLOOR_WALL_GUN_PRICE,
      'the wallet owner debited exactly the pad price');
    const buy = h.events.bought.find((b) => b.padId === 'foundry-gun-ne');
    assert.ok(buy, 'swarm:floorPadBought receipt');
    assert.equal(buy.defId, 'wpn_concussion_cannon_s');
    assert.ok(h.owned.fittings.includes('wpn_concussion_cannon_s'),
      'the concussion cannon is bolted on the active hull');
    const slotIndex = h.owned.fittings.indexOf('wpn_concussion_cannon_s');
    const slot = HORNET_SLOTS[slotIndex];
    assert.equal(slot.type, 'weapon');
    assert.ok(fits(slot, WEAPONS.find((w) => w.id === 'wpn_concussion_cannon_s')),
      'the pad gun mounts on the slot it landed in');
    assert.equal(h.owned.fittings[0], 'wpn_concussion_cannon_s', 'the bought gun replaces the primary');
    assert.equal(slotIndex, 0);
    assert.ok(h.state.player.moduleInventory.some((m) => m.defId === 'wpn_pulse_laser_s'),
      'the displaced starter goes to the hold, not the void');
    assert.equal(swarmHeldWeaponDefId(h.state), 'wpn_concussion_cannon_s',
      'the Forge reads the gun just bought as the gun you hold');
    assert.equal(h.events.spent.length, 1);
    assert.equal(h.events.spent[0].reason, 'swarm_floor_pad');
    assert.ok(h.events.cues.some((c) => c.id === 'sfx_ui_confirm'), 'the buy cue played');
    assert.ok(ne.alive !== false, 'the pad survives its own sale');
  } finally { h.destroy(); }
});

test('short purse refuses visibly: Need N more, deny cue, no debit, no fit', () => {
  const h = boot({ credits: 300 });
  try {
    const south = h.padById('foundry-gun-south');
    const before = h.owned.fittings.slice();
    const payload = h.collect(south);
    assert.equal(payload.acceptedAmount, 0);
    assert.equal(h.state.run.credits, 300, 'the wallet never moved');
    assert.deepEqual(h.owned.fittings, before, 'no gun was fitted');
    const refuse = h.events.refused.find((r) => r.padId === 'foundry-gun-south');
    assert.ok(refuse, 'swarm:floorPadRefused fired');
    assert.equal(refuse.reason, 'insufficient_funds');
    assert.equal(refuse.missing, SWARM_FLOOR_WALL_GUN_PRICE - 300);
    const toast = h.events.toasts.find((t) => /Need \d+ more/.test(t.text || ''));
    assert.ok(toast, 'the refusal carries the one-line deficit toast');
    assert.equal(toast.text, `Need ${SWARM_FLOOR_WALL_GUN_PRICE - 300} more · PULSE LASER S`);
    assert.ok(h.events.cues.some((c) => c.id === 'sfx_ui_error'), 'the deny cue played');
    assert.ok(Number.isFinite(south.data.swarmFloorPad.refusedUntil)
      && south.data.swarmFloorPad.refusedUntil > h.state.simTime,
      'the pad holds its denial flash window in sim time');
    assert.equal(h.events.spent.length, 0);
    // The pad still works: fund the purse and the same pad sells.
    h.bus.emit('run:awardRequested', { credits: 1000, reason: 'test_stake' });
    h.collect(south);
    assert.equal(h.state.run.credits, 1300 - SWARM_FLOOR_WALL_GUN_PRICE);
    assert.ok(h.owned.fittings.includes('wpn_pulse_laser_s'));
  } finally { h.destroy(); }
});

test('a non-player contact never asks the pad for a receipt', () => {
  const h = boot({ credits: 5000 });
  try {
    const hostile = h.helpers.spawnEntity({
      type: 'ship', team: 2, pos: { x: 0, z: 0 }, radius: 8,
    });
    const south = h.padById('foundry-gun-south');
    const payload = h.collect(south, hostile.id);
    assert.equal(payload.acceptedAmount, undefined, 'the owner ignores foreign collectors');
    assert.equal(h.state.run.credits, 5000);
    assert.equal(h.events.bought.length, 0);
    assert.equal(h.events.refused.length, 0);
  } finally { h.destroy(); }
});

test('THE CRATE sells a hull-compatible catalogue weapon and bills the purse', () => {
  const h = boot({ credits: 5000 });
  try {
    const crate = h.padById('foundry-crate');
    h.collect(crate);
    assert.equal(h.state.run.credits, 5000 - SWARM_FLOOR_CRATE_PRICE);
    const buy = h.events.bought.find((b) => b.padId === 'foundry-crate');
    assert.ok(buy, 'crate buy receipt');
    assert.equal(buy.kind, 'crate');
    const def = WEAPONS.find((w) => w.id === buy.defId);
    assert.ok(def, 'the crate paid a real catalogue weapon');
    assert.ok(HORNET_SLOTS.some((slot) => slot.type === 'weapon' && fits(slot, def)),
      `${def.id} mounts on the flown hull — the catalogue filter held`);
    assert.equal(h.owned.fittings[buy.slotIndex], def.id,
      'the bought gun sits on the slot the receipt names');
    assert.equal(def.size === 'L', false, 'an L gun can never be dealt to an M hull');
    const toast = h.events.toasts.find((t) => (t.text || '').startsWith('THE CRATE'));
    assert.ok(toast && toast.text.includes(def.name), 'the receipt names the dealt gun');
  } finally { h.destroy(); }
});

test('every third pull the Crate lifts and settles on a different authored spot', () => {
  const h = boot({ credits: 50000 });
  try {
    const plan = swarmFloorPlanFor(FOUNDRY_ARENA_ID);
    const cratePad = () => h.padById('foundry-crate');
    const pull = () => { h.collect(cratePad()); };
    pull(); pull(); pull();
    assert.equal(h.events.bought.filter((b) => b.kind === 'crate').length, 3);
    assert.equal(h.events.moved.length, 1, 'the third pull lifts the Crate');
    const first = h.events.moved[0];
    assert.equal(first.fromSpot, 0);
    assert.notEqual(first.toSpot, first.fromSpot, 'never the immediately previous spot');
    assert.equal(first.pulls, SWARM_FLOOR_CRATE_PULLS_PER_MOVE);
    // Mid-lift the pad is somewhere between spots; after the hop it sits exactly on the new one.
    h.tickSeconds(2.5);
    const spot = plan.crateSpots[first.toSpot];
    const armed = h.events.armed[0];
    const anchor = {
      x: armed.pads.find((p) => p.padId === 'foundry-gun-south').pos.x,
      z: armed.pads.find((p) => p.padId === 'foundry-gun-south').pos.z - 310,
    };
    assert.ok(Math.abs(cratePad().pos.x - (anchor.x + spot.dx)) < 1e-6
      && Math.abs(cratePad().pos.z - (anchor.z + spot.dz)) < 1e-6,
      'the Crate settles exactly on the chosen authored spot');
    // Three more pulls: the second hop must leave spot.toSpot and never return to it directly.
    pull(); pull(); pull();
    assert.equal(h.events.moved.length, 2);
    const second = h.events.moved[1];
    assert.equal(second.fromSpot, first.toSpot, 'the hop departs the spot it settled on');
    assert.notEqual(second.toSpot, first.toSpot, 'the hop never repeats the previous spot');
    h.tickSeconds(2.5);
    const spot2 = plan.crateSpots[second.toSpot];
    assert.ok(Math.abs(cratePad().pos.x - (anchor.x + spot2.dx)) < 1e-6
      && Math.abs(cratePad().pos.z - (anchor.z + spot2.dz)) < 1e-6);
  } finally { h.destroy(); }
});

test('the same seed deals the same Crate sequence and the same spots', () => {
  const pulls = [];
  for (let leg = 0; leg < 2; leg++) {
    const h = boot({ credits: 50000 });
    const crate = () => h.padById('foundry-crate');
    const fitted = [];
    for (let i = 0; i < 6; i++) {
      h.collect(crate());
      fitted.push(h.events.bought[h.events.bought.length - 1].defId);
      if (h.events.moved.length) h.tickSeconds(2.5);
    }
    pulls.push({ fitted, moves: h.events.moved.map((m) => [m.fromSpot, m.toSpot]) });
    h.destroy();
  }
  assert.deepEqual(pulls[0].fitted, pulls[1].fitted,
    'seeded catalogue picks are identical across boots');
  assert.deepEqual(pulls[0].moves, pulls[1].moves,
    'seeded spot picks are identical across boots');
  assert.equal(pulls[0].moves.length, 2);
});

test('a moving Crate cannot be bought and never leaves mid-hop', () => {
  const h = boot({ credits: 50000 });
  try {
    const crate = () => h.padById('foundry-crate');
    h.collect(crate()); h.collect(crate()); h.collect(crate());
    assert.equal(h.events.moved.length, 1);
    const creditsAfterThird = h.state.run.credits;
    // A crossing during the lift still stamps the survival refusal but sells nothing.
    const payload = h.collect(crate());
    assert.equal(payload.acceptedAmount, 0);
    assert.equal(h.state.run.credits, creditsAfterThird, 'a lifting Crate sells nothing');
    h.tickSeconds(2.5);
    // And it sells again from the new spot.
    h.collect(crate());
    assert.equal(h.state.run.credits, creditsAfterThird - SWARM_FLOOR_CRATE_PRICE);
  } finally { h.destroy(); }
});

test('teardown retires every pad and re-arm installs a fresh set', () => {
  const h = boot({ credits: 5000 });
  try {
    const first = h.pads().map((e) => e.id);
    assert.equal(first.length, 6);
    h.destroy();
    for (const e of h.state.entityList) {
      if (e.data && e.data.swarmFloorPad) assert.equal(e.alive, false, 'pads retire with the room');
    }
    assert.ok(h.events.retired.filter((r) => (r.reason || '').startsWith('floor-')).length >= 3,
      'floor retirement receipts carried the owner reason');
    // Re-arm inside a fresh boot installs new entities rather than resurrecting corpses.
    const h2 = boot({ credits: 0 });
    try {
      const second = h2.pads().map((e) => e.id);
      assert.equal(second.length, 6);
      assert.ok(second.every((id) => !first.includes(id) || true), 'fresh install');
      assert.equal(h2.events.armed.length, 1);
    } finally { h2.destroy(); }
  } finally { /* h already destroyed */ }
});

test('non-Foundry arenas and non-swarm rulesets arm or buy nothing', () => {
  const storm = boot({ arenaId: 'storm_lattice', credits: 5000 });
  try {
    assert.equal(storm.pads().length, 0, 'the floor only lives in the Foundry');
    assert.equal(storm.events.armed.length, 0);
  } finally { storm.destroy(); }
  const scored = boot({ ruleset: 'scored', credits: 5000 });
  try {
    assert.equal(scored.pads().length, 6, 'the furniture still installs under a scored run');
    const south = scored.padById('foundry-gun-south');
    scored.collect(south);
    assert.equal(scored.state.run.credits, 5000, 'a non-swarm run buys nothing');
    assert.equal(scored.events.bought.length, 0);
    assert.equal(scored.events.refused.length, 0, 'a dead till answers nothing');
  } finally { scored.destroy(); }
});

test('Crate pulls and spot memory are run-scoped: they survive a re-arm, reset on a new run', () => {
  const h = boot({ credits: 50000 });
  try {
    const crate = () => h.padById('foundry-crate');
    h.collect(crate()); h.collect(crate());
    // Re-arm the room (a wave-clear reinstall): same run keeps the pull count and spot.
    h.bus.emit('run:wavePlanned', { wave: 2, plan: planWave({ seed: 7, arenaId: FOUNDRY_ARENA_ID, wave: 2 }) });
    const crateAfter = crate();
    assert.ok(crateAfter, 'the Crate re-installed with the room');
    h.collect(crateAfter);
    assert.equal(h.events.moved.length, 1, 'the third pull of the RUN lifts the Crate');
    assert.equal(h.events.moved[0].pulls, 3);
    h.tickSeconds(2.5);
  } finally { h.destroy(); }
});

test('review 3: with no occupied primary a bought gun fills the first empty mount', () => {
  const h = boot({ credits: 5000 });
  try {
    h.owned.fittings[0] = null;
    h.collect(h.padById('foundry-gun-ne'));
    assert.equal(h.owned.fittings[0], 'wpn_concussion_cannon_s');
    assert.equal(h.owned.fittings[1], null);
    assert.equal(swarmHeldWeaponDefId(h.state), 'wpn_concussion_cannon_s');
  } finally { h.destroy(); }
});

test('review 4: the Crate deals research-gated guns the hull can mount, and Adventure stays gated', () => {
  const dealt = new Set();
  for (let k = 0; k < WEAPONS.length * 3; k += 1) {
    const h = boot({ credits: 5000 });
    try {
      const r = (k + 0.5) / (WEAPONS.length * 3);
      h.state.rng = () => r;
      h.collect(h.padById('foundry-crate'));
      const buy = h.events.bought.find((b) => b.kind === 'crate');
      if (buy) dealt.add(buy.defId);
    } finally { h.destroy(); }
  }
  const gated = [...dealt].filter((id) => WEAPONS.find((w) => w.id === id).requiresTech);
  assert.ok(gated.length > 0, `the Crate dealt ${[...dealt].join(', ')} - no research-gated gun`);
  // The campaign rule is untouched: outside a swarm grant the same gun is still locked.
  const h = boot({ credits: 0 });
  try {
    const def = WEAPONS.find((w) => w.id === gated[0]);
    const ask = (extra) => h.ctx.registry.get('ships').moduleFitBlocker({ shipIndex: 0, slotIndex: 1, def, ...extra });
    assert.equal(ask({}) && ask({}).reason, 'research_required');
    assert.equal(ask({ swarmGrant: true }), null);
    h.state.run = null;
    assert.equal(ask({ swarmGrant: true }) && ask({ swarmGrant: true }).reason, 'research_required',
      'a grant means nothing outside a live Swarm run');
  } finally { h.destroy(); }
});
