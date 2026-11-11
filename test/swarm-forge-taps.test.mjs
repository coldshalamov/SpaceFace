import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { getCombatKernel } from '../src/combat/kernel.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import { survivalArena } from '../src/systems/survivalArena.js';
import { swarmElites } from '../src/systems/swarmElites.js';
import { SWARM_PASSIVE_RECORD_KIND } from '../src/data/swarmDraft.js';
import { FOUNDRY_ARENA_ID } from '../src/systems/swarmArena.js';
import { runSession as runSessionProto } from '../src/systems/runSession.js';
import { ships as shipsProto, buildSlotList, fits } from '../src/systems/ships.js';
import { weapons as weaponsProto } from '../src/systems/weapons.js';
import { COMBAT_FLAGS } from '../src/data/featureFlags.js';
import { bombs as bombsProto } from '../src/systems/bombs.js';
import { BOMB_DEFS } from '../src/data/bombs.js';
import { powerPreviewPlan } from '../src/data/powerPreview.js';
import { mines as minesProto } from '../src/systems/mines.js';
import { playerPickupMagnetRange } from '../src/systems/mining.js';
import { resolvePropulsionProfile } from '../src/core/flight/propulsionCatalog.js';
import { SHIPS } from '../src/data/ships.js';
import { WEAPONS } from '../src/data/weapons.js';
import { SWARM_RULESET } from '../src/data/swarmMode.js';
import {
  SWARM_FORGE_PRICE,
  SWARM_FORGE_RECORD_KIND,
  SWARM_TAP_MODS,
  SWARM_TAP_PRICES,
  SWARM_TAP_RECORD_KIND,
  SWARM_TAP_MAX_PURCHASES,
  swarmForgeFormName,
} from '../src/data/swarmMods.js';
import {
  maintainSwarmPlayerMods,
  swarmFieldCooldownScale,
  swarmFieldRadiusScale,
  swarmHeldWeaponDefId,
  swarmMineMagnetRange,
  swarmModFireRateScale,
  swarmModHeatScale,
  swarmOwnedTapMods,
  swarmRamDealtScale,
  swarmRamTakenScale,
  swarmReelRateScale,
  swarmMagnetPickupBonus,
  swarmTapCount,
  swarmWeaponDamageScale,
  swarmWeaponImpulseScale,
  swarmWeaponPierceRank,
} from '../src/systems/playerModifiers.js';

const DT = 1 / 60;
const HORNET = SHIPS.find((s) => s.id === 'ship_hornet');
const HORNET_SLOTS = buildSlotList(HORNET);
const WEAPON_BY_ID = new Map(WEAPONS.map((def) => [def.id, def]));

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

function starterShip() {
  const fittings = Array(HORNET_SLOTS.length).fill(null);
  fittings[0] = 'wpn_pulse_laser_s';
  return { defId: 'ship_hornet', fittings };
}

/**
 * Full owner stack: survivalArena hosts the floor director; runSession is the real purse
 * and the real run:modifierRecordRequested owner; ships is the real fitting owner.
 */
function boot({ seed = 7, ruleset = SWARM_RULESET, arenaId = FOUNDRY_ARENA_ID, credits = 0, fittings = null } = {}) {
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
    routeCombatDamage(req) { return getCombatKernel(ctx).routeDamage(req); },
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
  if (fittings) owned.fittings = fittings.slice();
  state.player.ownedShips = [owned];
  state.player.activeShipIndex = 0;
  const pilot = helpers.spawnEntity({
    type: 'ship', team: 1, mass: 60, radius: 10, hull: 200, hullMax: 200,
    // A pinned drive class: the real player flies an authored derived profile, so a
    // mass mod never re-bands the catalog inference underneath the test.
    driveId: 'drive_reaction_m',
    pos: { x: 0, z: -600 },
    physicsBody: { dynamic: true, mass: 60, inertiaY: 6000, radius: 10 },
    boost: { energy: 100, burnDurS: 3, drainRate: 40, burnCdS: 2, topSpeedPct: 0.5, _burnT: 0, _burnCdT: 0 },
    data: { defId: 'ship_hornet', fittings: owned.fittings, derived: {} },
  });
  state.playerId = pilot.id;

  const run = createRunState({ kind: 'survival', ruleset, seed });
  run.arenaId = arenaId;
  run.wave = 1;
  run.phase = 'wave_intro';
  state.run = run;
  state.simTime = 0;
  state.tick = 0;
  state.mode = 'flight';
  if (credits > 0) bus.emit('run:awardRequested', { credits, reason: 'test_stake' });
  const kernel = getCombatKernel(ctx);

  const events = {
    armed: [], bought: [], refused: [], spent: [], toasts: [], cues: [], vfx: [],
    recorded: [],
  };
  bus.on('swarm:floorArmed', (p) => events.armed.push({ ...p }));
  bus.on('swarm:floorPadBought', (p) => events.bought.push({ ...p }));
  bus.on('swarm:floorPadRefused', (p) => events.refused.push({ ...p }));
  bus.on('run:spent', (p) => events.spent.push({ ...p }));
  bus.on('run:modifierRecorded', (p) => events.recorded.push({ ...p }));
  bus.on('toast', (p) => events.toasts.push({ ...p }));
  bus.on('audio:cue', (p) => events.cues.push({ ...p }));
  bus.on('presentation:vfxCue', (p) => events.vfx.push({ ...p }));

  // The install fires synchronously inside this emit — listeners must already be attached.
  bus.emit('run:wavePlanned', { wave: 1, plan: planWave({ seed, arenaId, wave: 1 }) });

  function pads() {
    return state.entityList.filter((e) => e && e.alive !== false && e.data && e.data.swarmFloorPad);
  }
  function padById(padId) {
    return pads().find((e) => e.data.swarmFloorPad.padId === padId) || null;
  }
  function collect(pad, collectorId = state.playerId) {
    const payload = {
      pickupId: pad.id, collectorId,
      kind: pad.data.kind, amount: pad.data.amount,
      pos: { x: pad.pos.x, z: pad.pos.z },
    };
    bus.emit('pickup:collected', payload);
    return payload;
  }
  function recordTap(offerId, wave = 1) {
    bus.emit('run:modifierRecordRequested', {
      record: { kind: SWARM_TAP_RECORD_KIND, offerId, wave }, wave,
    });
  }
  function upkeep(dt = DT) {
    maintainSwarmPlayerMods(state, helpers, dt);
  }

  // Baseline flight numbers resolved before any bottle lands — the propulsion scaler
  // reads the live ledger, so a "before" measured after a buy is already scaled.
  const baseProp = resolvePropulsionProfile(pilot, state);

  return {
    state, ctx, bus, kernel, events, helpers, pilot, owned, pads, padById, collect,
    recordTap, upkeep, baseProp,
    destroy() { survivalArena.destroy(); session.destroy(); kernel.dispose(); },
  };
}

// ---------------------------------------------------------------------------

test('the Forge pad and two Taps install at their authored spots with live labels', () => {
  const h = boot();
  try {
    const armed = h.events.armed[0];
    assert.equal(armed.pads.length, 6);
    const forge = h.padById('foundry-forge');
    const tapW = h.padById('foundry-tap-west');
    const tapE = h.padById('foundry-tap-east');
    assert.ok(forge && tapW && tapE);
    assert.equal(forge.data.swarmFloorPad.kind, 'forge');
    assert.equal(forge.data.swarmFloorPad.label, 'THE FORGE · 5000');
    assert.equal(forge.data.swarmFloorPad.price, SWARM_FORGE_PRICE);
    // The Forge sits behind the furnace on the north wall, off the freight lane.
    const south = h.padById('foundry-gun-south');
    const anchor = { x: south.pos.x, z: south.pos.z - 310 };
    assert.ok(Math.abs(forge.pos.x - anchor.x) < 1e-6
      && Math.abs(forge.pos.z - (anchor.z - 300)) < 1e-6);
    for (const tap of [tapW, tapE]) {
      assert.equal(tap.data.swarmFloorPad.kind, 'tap');
      assert.equal(tap.data.swarmFloorPad.price, SWARM_TAP_PRICES[0]);
      assert.ok(/^TAP · [A-Z ]+ · 1500$/.test(tap.data.swarmFloorPad.label),
        `tap shows its round offer and the first price step: ${tap.data.swarmFloorPad.label}`);
    }
    // The pair never pours the same bottle in the same round.
    assert.notEqual(tapW.data.swarmFloorPad.modId, tapE.data.swarmFloorPad.modId);
  } finally { h.destroy(); }
});

test('THE FORGE at 5000 makes Forged <name> with x1.4 damage and x1.35 knock, once per gun', () => {
  const h = boot({ credits: 5000 });
  try {
    assert.equal(swarmHeldWeaponDefId(h.state), 'wpn_pulse_laser_s',
      'the gun you hold is the primary mount');
    const forge = h.padById('foundry-forge');
    h.collect(forge);
    assert.equal(h.state.run.credits, 0, 'the wallet paid the full 5000');
    const rec = h.state.run.modifiers.find((m) => m && m.kind === SWARM_FORGE_RECORD_KIND);
    assert.ok(rec, 'a swarm_forge row landed on the run ledger through the canonical receipt');
    assert.equal(rec.defId, 'wpn_pulse_laser_s');
    assert.equal(rec.form, 'Forged Pulse Laser S');
    assert.equal(swarmWeaponDamageScale(h.state, h.pilot, 'wpn_pulse_laser_s'), 1.4);
    assert.equal(swarmWeaponImpulseScale(h.state, h.pilot, 'wpn_pulse_laser_s'), 1.35);
    // The forge voice: heavy machinery cue plus the ship flash through the vfx channel.
    assert.ok(h.events.cues.some((c) => c.id === 'sfx_station_machinery'));
    assert.ok(h.events.vfx.some((v) => v.id === 'swarm.forge' && v.sourceId === h.state.playerId));
    // A second visit with the same gun never charges again.
    h.bus.emit('run:awardRequested', { credits: 9000, reason: 'test_stake' });
    h.collect(forge);
    const refuse = h.events.refused.find((r) => r.padId === 'foundry-forge' && r.reason === 'already_forged');
    assert.ok(refuse, 'the revisit refused');
    assert.equal(h.state.run.credits, 9000, 'the revisit never billed');
    assert.ok(h.events.toasts.some((t) => t.text === 'Already forged'), 'packet law: Already forged');
    assert.equal(h.state.run.modifiers.filter((m) => m && m.kind === SWARM_FORGE_RECORD_KIND).length, 1);
  } finally { h.destroy(); }
});

test('a held Free Forge forges once and clears the flag without touching the purse', () => {
  const h = boot({ credits: 0 });
  try {
    h.state.run.telemetry.freeForge = true;
    const forge = h.padById('foundry-forge');
    h.collect(forge);
    assert.equal(h.state.run.credits, 0, 'the free pour never billed');
    assert.equal(h.state.run.telemetry.freeForge, false, 'the flag was consumed');
    const rec = h.state.run.modifiers.find((m) => m && m.kind === SWARM_FORGE_RECORD_KIND);
    assert.ok(rec, 'the free pour still writes the ledger row');
    const buy = h.events.bought.find((b) => b.kind === 'forge');
    assert.ok(buy && buy.price === 0, 'the buy receipt reads as free');
    // The flag spent, an ordinary revisit is a purse refusal — not another forge.
    h.collect(forge);
    const refuse = h.events.refused.find((r) => r.padId === 'foundry-forge');
    assert.equal(refuse.reason, 'already_forged');
    assert.equal(h.state.run.modifiers.filter((m) => m && m.kind === SWARM_FORGE_RECORD_KIND).length, 1);
  } finally { h.destroy(); }
});

test('a short purse is refused: Need N more, deny cue, no record', () => {
  const h = boot({ credits: 4999 });
  try {
    const forge = h.padById('foundry-forge');
    h.collect(forge);
    const refuse = h.events.refused.find((r) => r.padId === 'foundry-forge');
    assert.equal(refuse.reason, 'insufficient_funds');
    assert.equal(refuse.missing, 1);
    assert.ok(h.events.toasts.some((t) => t.text === 'Need 1 more · THE FORGE'));
    assert.equal(h.state.run.credits, 4999);
    assert.equal(h.state.run.modifiers.filter((m) => m && m.kind === SWARM_FORGE_RECORD_KIND).length, 0);
  } finally { h.destroy(); }
});

test('the Concussion Cannon forges into Wrecking Ball carrying a two-body pierce', () => {
  const fittings = Array(HORNET_SLOTS.length).fill(null);
  fittings[0] = 'wpn_concussion_cannon_s';
  assert.ok(fits(HORNET_SLOTS[0], WEAPON_BY_ID.get('wpn_concussion_cannon_s')),
    'the cannon legally mounts the primary slot');
  const h = boot({ credits: 6000, fittings });
  try {
    assert.equal(swarmHeldWeaponDefId(h.state), 'wpn_concussion_cannon_s');
    const forge = h.padById('foundry-forge');
    h.collect(forge);
    const rec = h.state.run.modifiers.find((m) => m && m.kind === SWARM_FORGE_RECORD_KIND);
    assert.equal(rec.form, 'Wrecking Ball');
    assert.equal(swarmForgeFormName('wpn_concussion_cannon_s'), 'Wrecking Ball');
    // The real attack-spec path: the forged slug carries pierce rank 2 — the packet
    // (with its x1.35 knock) applies on each of the two bodies it passes through.
    assert.equal(swarmWeaponPierceRank(h.state, h.pilot, 'wpn_concussion_cannon_s'), 2);
    const weapons = Object.create(weaponsProto);
    const w = { defId: 'wpn_concussion_cannon_s', slotIndex: 0 };
    const spec = weapons._attackSpecFor(w, WEAPON_BY_ID.get('wpn_concussion_cannon_s'), h.state, h.pilot);
    assert.equal(spec && spec.propagation && spec.propagation.pierce, 2,
      'the compiled attack spec carries the two-body pierce');
    // An unforged gun stays rank 0 — the form is per gun, not per run.
    assert.equal(swarmWeaponPierceRank(h.state, h.pilot, 'wpn_pulse_laser_s'), 0);
  } finally { h.destroy(); }
});

test('the shared till sells four bottles at stepping prices, then the fifth refuses', () => {
  const h = boot({ credits: 100000 });
  try {
    const tapW = () => h.padById('foundry-tap-west');
    const tapE = () => h.padById('foundry-tap-east');
    const priceSeen = [];
    // Four buys across the two pads — each crossing charges the step for the count
    // already bought, and the record lands on the run ledger.
    const pads = [tapW, tapE, tapW, tapE];
    for (let i = 0; i < SWARM_TAP_MAX_PURCHASES; i++) {
      const pad = pads[i]();
      priceSeen.push(pad.data.swarmFloorPad.price);
      const wantModId = pad.data.swarmFloorPad.modId;
      h.collect(pad);
      const buy = h.events.bought[h.events.bought.length - 1];
      assert.equal(buy.kind, 'tap');
      assert.equal(buy.price, SWARM_TAP_PRICES[i], `buy ${i + 1} charges step ${i + 1}`);
      assert.equal(buy.modId, wantModId, 'the pad vends the bottle it advertises');
      const owned = h.state.run.modifiers.filter((m) => m && m.kind === SWARM_TAP_RECORD_KIND);
      assert.equal(owned.length, i + 1);
      assert.equal(owned[i].offerId, wantModId);
    }
    assert.deepEqual(priceSeen, [1500, 2000, 2500, 3000], 'the till steps 1500→3000');
    assert.equal(h.state.run.credits, 100000 - 9000);
    // The till is dry: both pads read SOLD OUT and the fifth crossing refuses without
    // touching the purse.
    assert.equal(tapW().data.swarmFloorPad.label, 'TAP · SOLD OUT');
    assert.equal(tapE().data.swarmFloorPad.label, 'TAP · SOLD OUT');
    h.collect(tapW());
    const refuse = h.events.refused.find((r) => r.padId === 'foundry-tap-west' && r.reason === 'sold_out');
    assert.ok(refuse, 'the fifth buy refused');
    assert.ok(h.events.toasts.some((t) => t.text === 'TAP · SOLD OUT'));
    assert.equal(h.state.run.credits, 100000 - 9000, 'the till never took a fifth coin');
    assert.equal(swarmTapCount(h.state.run), 4);
    assert.equal(swarmOwnedTapMods(h.state).length, 4, 'the HUD row would show four bottles');
  } finally { h.destroy(); }
});

test('tap offers are deterministic on the seed and never repeat an owned bottle', () => {
  const offers = [];
  for (let leg = 0; leg < 2; leg++) {
    const h = boot({ credits: 50000 });
    const armed = h.events.armed[0];
    const taps = armed.pads.filter((p) => p.kind === 'tap').map((p) => p.modId);
    offers.push(taps);
    h.destroy();
  }
  assert.deepEqual(offers[0], offers[1], 'same seed, same pour');
  assert.ok(offers[0].every((id) => SWARM_TAP_MODS.some((m) => m.id === id)),
    'every offer is a real bottle');
  // After a buy the pad re-pours from the not-owned pool — the sold bottle never returns.
  const h = boot({ credits: 50000 });
  try {
    const tapW = h.padById('foundry-tap-west');
    const sold = tapW.data.swarmFloorPad.modId;
    h.collect(tapW);
    const after = h.padById('foundry-tap-west').data.swarmFloorPad.modId;
    assert.notEqual(after, sold, 'the tap pours something the run does not already own');
  } finally { h.destroy(); }
});

// Each of the ten mods changes exactly its two numbers — one fresh run per bottle so
// compounding never hides a single trade.
const MOD_EXPECTATIONS = {
  overbore(h) {
    assert.equal(swarmWeaponImpulseScale(h.state, h.pilot, 'wpn_pulse_laser_s'), 2.0, 'knockback ×2.0');
    assert.equal(swarmModFireRateScale(h.state), 0.5, 'fire rate ×0.5');
  },
  hair_trigger(h) {
    assert.equal(swarmModFireRateScale(h.state), 2.0, 'fire rate ×2.0');
    assert.equal(swarmWeaponImpulseScale(h.state, h.pilot, 'wpn_pulse_laser_s'), 0.7, 'knockback ×0.7');
    assert.equal(swarmModHeatScale(h.state), 1.5, 'heat gain ×1.5');
  },
  long_reel(h) {
    h.upkeep();
    assert.equal(h.pilot.data.swarmMods.tetherLenMult, 1.5,
      'Line max length ×1.5 rides the mutable marks bag the read site folds in');
    assert.equal(swarmReelRateScale(h.state), 0.7, 'reel speed ×0.7');
  },
  hot_core(h) {
    h.upkeep();
    assert.equal(h.pilot.boost.burnDurS, 6, 'boost duration ×2');
    assert.equal(h.pilot.boost.drainRate, 20, 'boost drain ×0.5');
  },
  ballast(h) {
    h.upkeep();
    assert.equal(h.pilot.mass, 96, 'player mass ×1.6');
    const after = resolvePropulsionProfile(h.pilot, h.state);
    assert.ok(Math.abs(after.maxYawRate - h.baseProp.maxYawRate * 0.75) < 1e-9,
      'turn rate ×0.75 through the propulsion seam');
    assert.ok(Math.abs(h.pilot.physicsBody.mass - 96) < 1e-9, 'the physics body mass follows');
  },
  stripped(h) {
    h.upkeep();
    assert.equal(h.pilot.mass, 39, 'player mass ×0.65');
    const after = resolvePropulsionProfile(h.pilot, h.state);
    assert.ok(Math.abs(after.mainAccel - h.baseProp.mainAccel * 1.25) < 1e-6,
      'acceleration ×1.25');
    assert.ok(Math.abs(after.maxYawRate - h.baseProp.maxYawRate * 1.25) < 1e-9,
      'turn rate ×1.25');
  },
  magnet_hull(h) {
    assert.equal(swarmMagnetPickupBonus(h.state), 260, 'the scrap reach grant');
    assert.ok(Math.abs(playerPickupMagnetRange(h.state, h.pilot) - (800 + 260)) < 1e-9,
      'pickups within 260 extra WU drift to you');
    assert.equal(swarmMineMagnetRange(h.state), 260, 'enemy mines within 260 WU drift too');
  },
  glass_cannon(h) {
    assert.equal(swarmWeaponImpulseScale(h.state, h.pilot, 'wpn_pulse_laser_s'), 1.4, 'knockback ×1.4');
    h.upkeep();
    assert.equal(h.pilot.hullMax, 100, 'max hull ×0.5');
    assert.ok(h.pilot.hull <= h.pilot.hullMax, 'hull clamps inside the new max');
  },
  bumper_rails(h) {
    h.upkeep();
    assert.equal(h.pilot.physicsBody.impactDamageScale, 2.0, 'ram damage dealt ×2');
    assert.equal(swarmRamTakenScale(h.state), 0.5, 'ram damage taken ×0.5');
    assert.equal(swarmRamDealtScale(h.state), 2.0, 'authored ram packets pay ×2');
    const after = resolvePropulsionProfile(h.pilot, h.state);
    assert.ok(Math.abs(after.combatSpeed - h.baseProp.combatSpeed * 0.85) < 1e-6, 'top speed ×0.85');
  },
  wide_bore(h) {
    assert.equal(swarmFieldRadiusScale(h.state), 1.4, 'power radius ×1.4');
    assert.equal(swarmFieldCooldownScale(h.state), 1.35, 'power cooldowns ×1.35');
  },
};

for (const mod of SWARM_TAP_MODS) {
  test(`mod ${mod.id} changes exactly its two numbers`, () => {
    const expect = MOD_EXPECTATIONS[mod.id];
    assert.ok(expect, `no expectation written for ${mod.id}`);
    const h = boot({ credits: 0 });
    try {
      h.recordTap(mod.id);
      expect(h);
    } finally { h.destroy(); }
  });
}

test('Magnet Hull: an enemy mine inside the lure radius drifts toward the pilot', () => {
  const h = boot();
  try {
    h.recordTap('magnet_hull');
    const mines = Object.assign({}, minesProto);
    mines.init(h.ctx);
    // Enemy mine, armed, 200 WU out: inside the 260 lure, outside the trigger radius.
    const mine = h.helpers.spawnEntity({
      type: 'mine', team: 2, mass: 1, radius: 6, hull: 28,
      pos: { x: h.pilot.pos.x + 200, z: h.pilot.pos.z },
      data: { kind: 'mine', mine: true, armed: true, ownerId: 9999 },
    });
    const before = mine.pos.x;
    mines.update(DT, h.state);
    assert.ok(mine.pos.x < before, `the enemy mine drifted toward the pilot (${before} → ${mine.pos.x})`);
    // A pilot-owned mine stays put — the lure only moves the enemy's.
    const own = h.helpers.spawnEntity({
      type: 'mine', team: 1, mass: 1, radius: 6, hull: 28,
      pos: { x: h.pilot.pos.x - 250, z: h.pilot.pos.z },
      data: { kind: 'mine', mine: true, armed: true, ownerId: h.state.playerId },
    });
    const ownBefore = own.pos.x;
    mines.update(DT, h.state);
    assert.equal(own.pos.x, ownBefore, 'a pilot-owned mine ignores its own lure');
    mines.destroy && mines.destroy();
  } finally { h.destroy(); }
});

test('the forge receipt outlives the room: forged name survives a re-arm', () => {
  const h = boot({ credits: 10000 });
  try {
    const forge = () => h.padById('foundry-forge');
    h.collect(forge());
    // Re-arm the room (a wave-clear reinstall): the ledger row is the memory.
    h.bus.emit('run:wavePlanned', { wave: 2, plan: planWave({ seed: 7, arenaId: FOUNDRY_ARENA_ID, wave: 2 }) });
    assert.ok(h.padById('foundry-forge'), 'the Forge re-installed with the room');
    // Upkeep re-stamps the forged name on the live runtime after any republish.
    const w = { defId: 'wpn_pulse_laser_s', slotIndex: 0, name: 'Pulse Laser S' };
    h.pilot.weapons = [w];
    h.upkeep();
    assert.equal(w.name, 'Forged Pulse Laser S', 'the live runtime reads the forged form');
    assert.equal(w.forgeForm, 'Forged Pulse Laser S');
    // And a second crossing still refuses through the ledger, not the pad.
    h.collect(forge());
    assert.equal(h.state.run.credits, 5000, 're-arm never reset the forge receipt');
  } finally { h.destroy(); }
});

// ---- lead review 2026-11-11 -------------------------------------------------

test('review 1: Plated Hull after Glass Cannon adds the halved bonus, never lowers max hull', () => {
  const h = boot();
  try {
    swarmElites._maintainPassiveStack(h.state);
    h.recordTap('glass_cannon');
    h.upkeep();
    assert.equal(h.pilot.hullMax, 100, 'glass cannon halves 200');
    h.state.run.modifiers = [...h.state.run.modifiers,
      { kind: SWARM_PASSIVE_RECORD_KIND, passiveId: 'plated_hull', count: 1 }];
    swarmElites._maintainPassiveStack(h.state);
    h.upkeep();
    assert.equal(h.pilot.hullMax, 107, 'plating adds 14 x 0.5 on top of 100');
    h.upkeep();
    assert.equal(h.pilot.hullMax, 107, 'stable across further upkeep');
  } finally { h.destroy(); }
});

function hotCoreCap(h) {
  const profile = resolvePropulsionProfile(h.pilot, h.state);
  return profile.combatSpeed * profile.boostSpeedMult * (1 + h.pilot.boost.topSpeedPct);
}

for (const burner of [false, true]) {
  test(`review 2: Hot Core burns two true hull per second at top boost speed (${burner ? 'afterburner fitted' : 'no afterburner'})`, () => {
    const h = boot();
    try {
      h.recordTap('hot_core');
      h.pilot.shield = 80;
      h.pilot.armorHp = 60;
      h.pilot.armorFlat = 5;
      if (!burner) { h.pilot.boost.burnDurS = 0; }
      h.upkeep();
      if (burner) h.pilot.boost._burnT = 3;
      // The flight owner's own resource-gated flag: the ship is sustaining boost.
      h.pilot.flags = { ...(h.pilot.flags || {}), boosting: true };
      h.pilot.vel = { x: hotCoreCap(h), z: 0 };
      for (let i = 0; i < 130; i += 1) h.upkeep();
      assert.equal(h.pilot.hull, 196, 'a little over two seconds at top speed = 4 whole hull, whatever the shield and armor');
      assert.equal(h.pilot.shield, 80, 'the shield is not spent');
      assert.equal(h.pilot.armorHp, 60, 'the armor is not spent');
      // Below top speed, or off the boost, the core cools and costs nothing.
      h.pilot.vel = { x: 10, z: 0 };
      for (let i = 0; i < 120; i += 1) h.upkeep();
      assert.equal(h.pilot.hull, 196);
    } finally { h.destroy(); }
  });
}

// The cycle-rate and heat trades must bend every player fire path, not only projectiles.
function weaponsHost(h) {
  const events = [];
  const sys = Object.assign(Object.create(weaponsProto), {
    bus: { emit(name, payload) { events.push({ name, payload }); } },
    state: h.state,
    _byId: new Map(),
    _beamFiring: new Set(),
    _beamFiringPrev: new Set(),
    _beamActiveMeta: new Map(),
    _attackLive: new Set(),
    _spawnVectorMine() {},
    _muzzle(e) { return { x: e.pos.x, z: e.pos.z }; },
    _hardpointDir(e, w, aim) { return aim; },
  });
  h.state.combat = h.state.combat || {};
  h.state.combat.beams = [];
  return sys;
}

for (const [tap, rofMult, heatMult] of [['overbore', 0.5, 1], ['hair_trigger', 2, 1.5]]) {
  test(`review 5: ${tap} bends a deploy weapon's cycle and heat for the player only`, () => {
    const h = boot();
    const prev = COMBAT_FLAGS.weaponImpulseConsequences;
    COMBAT_FLAGS.weaponImpulseConsequences = true;
    try {
      const def = WEAPON_BY_ID.get('wpn_vector_mine_m');
      const sys = weaponsHost(h);
      const fire = (entity, isPlayer) => {
        const w = { defId: def.id, slotIndex: 0, _cooldown: 0, _heat: 0 };
        sys._serviceDeployWeapon(entity, w, def, isPlayer, 1000, h.state, 0);
        return w;
      };
      const plain = fire(h.pilot, true);
      h.recordTap(tap);
      const bent = fire(h.pilot, true);
      assert.ok(Math.abs(bent._cooldown - plain._cooldown / rofMult) < 1e-9,
        `cycle ${plain._cooldown} -> ${bent._cooldown}`);
      assert.ok(Math.abs(bent._heat - plain._heat * heatMult) < 1e-9,
        `heat ${plain._heat} -> ${bent._heat}`);
      const npc = h.helpers.spawnEntity({ type: 'ship', team: 2, pos: { x: 50, z: 0 }, radius: 8 });
      const theirs = fire(npc, false);
      assert.equal(theirs._cooldown, plain._cooldown, 'NPC cycle unchanged');
      assert.equal(theirs._heat, plain._heat, 'NPC heat unchanged');
    } finally { COMBAT_FLAGS.weaponImpulseConsequences = prev; h.destroy(); }
  });
}

test('review 5: Hair Trigger raises a continuous beam heat gain for the player only', () => {
  const h = boot();
  try {
    const def = WEAPON_BY_ID.get('wpn_beam_laser_m');
    const sys = weaponsHost(h);
    const burn = (entity) => {
      const w = { defId: def.id, slotIndex: 0, _heat: 0, heatPerSec: 55, heatMax: 1000, range: 400, energyCost: 0 };
      sys._serviceBeam(entity, w, { ...def, energyCost: 0 }, true, 1000, 0.5, h.state, 0);
      return w._heat;
    };
    const plain = burn(h.pilot);
    h.recordTap('hair_trigger');
    assert.ok(Math.abs(burn(h.pilot) - plain * 1.5) < 1e-9, 'heat gain x1.5 on the beam');
    const npc = h.helpers.spawnEntity({ type: 'ship', team: 2, pos: { x: 50, z: 0 }, radius: 8 });
    assert.equal(burn(npc), plain, 'NPC beam heat unchanged');
  } finally { h.destroy(); }
});

// Wide Bore: the Bomb power's reach and cooldown, at the player Bomb owner's own seam.
test('review 6: Wide Bore widens the player Bomb x1.4 and slows its cooldown x1.35', () => {
  const h = boot();
  const bombSys = Object.create(bombsProto);
  const events = [];
  try {
    bombSys.init(h.ctx);
    h.bus.on('bombs:dropped', (p) => events.push(['dropped', p]));
    h.bus.on('bombs:detonated', (p) => events.push(['detonated', p]));
    const payloadId = 'bomb_frag';
    const base = BOMB_DEFS[payloadId];
    const drop = () => {
      h.state.simTime += 100; // clear any bay cooldown between drops
      const bomb = bombSys.drop(h.pilot, payloadId, h.state);
      assert.ok(bomb, 'the bay dropped');
      return bomb;
    };
    const cooldownOf = () => h.state.bombs.cooldowns[payloadId] - h.state.simTime;

    const plain = drop();
    assert.equal(plain.data.radiusScale, 1);
    assert.ok(Math.abs(cooldownOf() - base.cooldownS) < 1e-9);

    h.recordTap('wide_bore');
    const wide = drop();
    assert.equal(wide.data.radiusScale, 1.4);
    assert.ok(Math.abs(cooldownOf() - base.cooldownS * 1.35) < 1e-9, 'cooldown x1.35');
    const droppedWide = events.filter(([n]) => n === 'dropped').pop()[1];
    assert.ok(Math.abs(droppedWide.radius - base.radius * 1.4) < 1e-9, 'presentation radius x1.4');

    // The held-power preview draws the same resolved radius the drop will stamp.
    h.state.input = { ...(h.state.input || {}), actions: { ...(h.state.input && h.state.input.actions), bomb: { held: true, pressed: false } } };
    const plan = powerPreviewPlan(h.state, 'bomb');
    assert.ok(plan, 'a bomb preview exists');
    assert.ok(Math.abs(plan.radius - base.radius * 1.4) < 1e-9, `preview radius ${plan.radius}`);

    // The blast itself reaches x1.4.
    bombSys._detonate(wide, wide.data, h.state, 'manual');
    const detonated = events.filter(([n]) => n === 'detonated').pop()[1];
    assert.ok(Math.abs(detonated.radius - base.radius * 1.4) < 1e-9, 'blast radius x1.4');

    // An NPC bomb and the shared base definition are untouched.
    const npc = h.helpers.spawnEntity({ type: 'ship', team: 2, mass: 30, radius: 8, hull: 100, hullMax: 100, pos: { x: 400, z: 0 } });
    const theirs = bombSys.drop(npc, payloadId, h.state);
    assert.ok(theirs, 'the NPC dropped');
    assert.equal(theirs.data.radiusScale, 1);
    assert.equal(BOMB_DEFS[payloadId].radius, base.radius, 'base data never mutated');
  } finally { bombSys.destroy(); h.destroy(); }
});
