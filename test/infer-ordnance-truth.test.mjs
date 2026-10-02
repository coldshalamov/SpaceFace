// NXI-038 / NXI-042 / NXI-045 / NXI-046 — ordnance truth on the live owners.
// Seeded. A center overlap stays a zero shove, a rejected tool press spends nothing,
// an empty dispenser does not cheer, and cooldown is not the same sentence as no lock.
import assert from 'node:assert/strict';
import test from 'node:test';

import { bombRadialDirection } from '../src/combat/bombDynamics.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';
import { mulberry32 } from '../src/core/rng.js';
import { createBus } from '../src/core/eventBus.js';
import { BOMB_DEFS } from '../src/data/bombs.js';
import { countermeasures } from '../src/systems/countermeasures.js';
import { impulseCharges } from '../src/systems/impulseCharges.js';
import { bombScenario } from './helpers/bombScenario.mjs';

const DT = 1 / 60;
const SEED = 4242;

function chargesOf(state) {
  return state.player.cargo.items.cmdty_impulse_charge || 0;
}

function chargeBodies(state) {
  return state.entityList.filter((e) => e && e.type === 'charge' && e.alive !== false);
}

test('NXI-038: exact center overlap is a finite zero shove, and an offset hull still feels the field', () => {
  const zero = bombRadialDirection(0, 0);
  assert.deepEqual(zero, { x: 0, z: 0, dist: 0 });
  assert.ok(Number.isFinite(zero.x) && Number.isFinite(zero.z));
  assert.notEqual(zero.z, 1, 'coincident centers must not invent a +Z axis');
  const unit = bombRadialDirection(3, 4);
  assert.ok(Math.abs(unit.x - 0.6) < 1e-12 && Math.abs(unit.z - 0.8) < 1e-12);

  const t = bombScenario();
  try {
    const overlapped = t.spawn({ pos: { x: 5, z: 5 }, vel: { x: 1, z: 0 }, radius: 6, mass: 32 });
    const offset = t.spawn({ pos: { x: 35, z: 5 }, vel: { x: 0, z: 0 }, radius: 6, mass: 32 });
    const before = { x: overlapped.pos.x, z: overlapped.pos.z };
    t.system._targets = [overlapped];
    const havoc = t.system._blastVictims(t.state, {
      pos: { x: overlapped.pos.x, z: overlapped.pos.z },
      def: BOMB_DEFS.bomb_scrambler,
      ownerId: t.player.id,
      originId: -1,
      trigger: 'fuze',
    });
    assert.equal(t.impulses.length, 0, 'a tangent blast at the center does not invent a direction');
    assert.equal(havoc.shoves.length, 0);
    assert.equal(overlapped.pos.x, before.x);
    assert.equal(overlapped.pos.z, before.z);
    assert.ok(Number.isFinite(overlapped.vel.x) && Number.isFinite(overlapped.vel.z));

    const bomb = {
      id: -2,
      alive: true,
      pos: { x: 5, z: 5 },
      vel: { x: 0, z: 0 },
      data: {
        bombId: 'bomb_singularity',
        fieldStartedAt: 0,
        nextFieldTick: 0,
        ownerId: t.player.id,
      },
    };
    t.state.simTime = 0.05;
    t.state.tick = 1;
    t.system._targets = [overlapped, offset];
    t.system._tickField(bomb, t.state, DT);
    assert.equal(consumePhysicsCommand(overlapped), null, 'the well does not pull a hull it is sitting on');
    assert.equal(overlapped.pos.x, before.x);
    assert.equal(overlapped.pos.z, before.z);
    const pulled = consumePhysicsCommand(offset);
    assert.ok(pulled && pulled.impulses.length === 1, 'a hull off center still feels the well');
    assert.ok(pulled.impulses[0].x < 0);
    assert.ok(Number.isFinite(pulled.impulses[0].x) && Number.isFinite(pulled.impulses[0].z));
  } finally {
    t.close();
  }
});

test('NXI-042: a menu or arming rejection spends no charge; a throw that hits nothing still spends one', () => {
  const player = {
    id: 1, type: 'ship', alive: true, team: 0,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 8,
    flags: {}, data: {},
  };
  const state = {
    mode: 'flight', playerId: 1, tick: 10, simTime: 1, rng: mulberry32(SEED),
    entities: new Map([[1, player]]),
    entityList: [player],
    input: {
      aimAngle: 0, moveZ: 0, brake: false,
      actions: { chargeThrow: true, chargeDetonate: false },
    },
    ui: { screenStack: ['map'] },
    player: {
      activeShipIndex: 0,
      ownedShips: [{ fittings: [] }],
      cargo: { items: { cmdty_impulse_charge: 3 }, usedVolume: 6, usedMass: 6 },
    },
  };
  const bus = createBus();
  const system = Object.create(impulseCharges);
  system.init({
    state, bus, helpers: {
      spawnEntity(spec) {
        const entity = { ...spec, id: state.entityList.length + 1, alive: true };
        state.entities.set(entity.id, entity);
        state.entityList.push(entity);
        return entity;
      },
    },
  });

  system.update(DT, state);
  state.input.actions.chargeThrow = true;
  system.update(DT, state);
  assert.equal(chargesOf(state), 3, 'two menu rejections do not debit, once or twice');
  assert.equal(chargeBodies(state).length, 0);

  state.ui.screenStack = [];
  player.data.impulseCharges = { throwCdT: 2 };
  state.input.actions.chargeThrow = true;
  system.update(DT, state);
  assert.equal(chargesOf(state), 3, 'arming rejection spends nothing');
  assert.equal(chargeBodies(state).length, 0);

  player.data.impulseCharges.throwCdT = 0;
  state.input.actions.chargeThrow = true;
  system.update(DT, state);
  assert.equal(chargesOf(state), 2, 'a throw that sticks to nothing still costs one charge');
  assert.equal(chargeBodies(state).length, 1);
  assert.equal(chargeBodies(state)[0].data.hostId, null);

  state.input.actions.chargeThrow = true;
  system.update(DT, state);
  assert.equal(chargesOf(state), 2, 'the arming gap after a real throw does not spend a second charge');

  state.input.actions.chargeDetonate = true;
  system.update(DT, state);
  assert.equal(chargesOf(state), 2, 'detonating with nothing armed does not refund or double-charge the miss');
  assert.equal(chargeBodies(state).length, 1);
});

function cmRig({ fittings, stock = null, cooldownT = 0, withLock = false, withMissile = false }) {
  const player = {
    id: 1, type: 'ship', alive: true, team: 0,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 8, flags: {},
    data: {
      fittings,
      combat: {},
      cm: { cooldownT, effectT: 0, effect: null },
    },
  };
  if (stock != null) player.data.cm.stock = stock;
  const pirate = {
    id: 7, type: 'ship', alive: true, team: 1,
    pos: { x: -400, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 8,
    data: { fittings: [], combat: withLock ? { lockTarget: 1, lockProgress: 1 } : { lockTarget: null, lockProgress: 0 } },
  };
  const missile = {
    id: 20, type: 'projectile', alive: true,
    pos: { x: 180, z: 0 }, vel: { x: -40, z: 0 }, rot: Math.PI, radius: 1,
    data: { kind: 'missile', targetId: withMissile ? 1 : 42, turnRate: 2.8, projSpeed: 90 },
  };
  const list = [player, pirate];
  if (withMissile || fittings[0] === 'mod_decoy_buoy_s') list.push(missile);
  const state = {
    mode: 'flight', playerId: 1, tick: 120, simTime: 2,
    meta: { seed: SEED }, rng: mulberry32(SEED),
    player: {},
    input: { deployCountermeasure: false, actions: {} },
    ui: { screenStack: [] },
    entities: new Map(list.map((e) => [e.id, e])),
    entityList: list,
    entityIndex: {
      __spacefaceEntityIndexV1: true,
      ships: [player, pirate],
      projectiles: list.filter((e) => e.type === 'projectile'),
    },
  };
  const bus = createBus();
  const seen = {};
  bus.on('*', () => {});
  const rawEmit = bus.emit.bind(bus);
  bus.emit = (name, payload) => {
    (seen[name] || (seen[name] = [])).push(payload);
    return rawEmit(name, payload);
  };
  const cm = Object.create(countermeasures);
  cm.init({ state, bus, helpers: { spawnEntity() { throw new Error('decoy must not spawn a body'); } } });
  return {
    state, cm, player, missile, pirate,
    events: (name) => seen[name] || [],
    press() {
      const before = state.entityList.length;
      state.input.deployCountermeasure = true;
      state.tick += 1;
      state.simTime += DT;
      cm.update(DT, state);
      state.input.deployCountermeasure = false;
      return before;
    },
  };
}

test('NXI-045: empty stock refuses without a success cue or a decoy; a loaded buoy still deploys and spends one', () => {
  const empty = cmRig({ fittings: ['mod_decoy_buoy_s'], stock: 0 });
  const before = empty.state.entityList.length;
  empty.press();
  assert.equal(empty.player.data.cm.stock, 0, 'refusal must not refill the magazine');
  assert.equal(empty.player.data.cm.effect, null);
  assert.equal(empty.events('countermeasure:deployed').length, 0);
  assert.equal(empty.state.entityList.length, before, 'no decoy body is spawned');
  assert.equal(empty.events('countermeasure:denied')[0].reason, 'empty');
  assert.equal(empty.events('alert')[0].text, 'COUNTERMEASURES EMPTY');
  assert.equal(empty.events('alert')[0].key, 'cm-denied');
  assert.ok(empty.events('audio:cue').every((cue) => cue.id !== 'cm_chaff'));
  assert.ok(empty.events('audio:cue').some((cue) => cue.id === 'ui_deny'));
  assert.equal(empty.events('toast').length, 0, 'the success line must not play');

  const loaded = cmRig({ fittings: ['mod_decoy_buoy_s'], stock: 2 });
  loaded.press();
  assert.equal(loaded.player.data.cm.stock, 1, 'a real buoy spends one round');
  assert.ok(loaded.player.data.cm.effect && loaded.player.data.cm.effect.decoyId);
  assert.equal(loaded.missile.data.targetId, loaded.player.data.cm.effect.decoyId, 'the buoy actually re-baits a seeker');
  assert.equal(loaded.events('countermeasure:deployed').length, 1);
  assert.equal(loaded.events('countermeasure:denied').length, 0);
  assert.ok(loaded.events('audio:cue').some((cue) => cue.id === 'cm_chaff'));
  assert.equal(loaded.events('toast')[0].text, 'Decoy buoy broadcasting');
  assert.equal(loaded.state.entityList.filter((e) => e.type === 'decoy').length, 0);
});

test('NXI-046: cooldown and no incoming lock are different sentences; a locked chaff still deploys', () => {
  const cooling = cmRig({ fittings: ['mod_chaff_dispenser_m'], stock: 3, cooldownT: 4.2 });
  cooling.press();
  assert.equal(cooling.events('countermeasure:denied')[0].reason, 'cooldown');
  assert.match(cooling.events('alert')[0].text, /^COUNTERMEASURE RECHARGING /);
  assert.equal(cooling.events('alert')[0].key, 'cm-denied');
  assert.equal(cooling.player.data.cm.stock, 3);
  assert.equal(cooling.player.data.cm.effect, null);
  assert.ok(!cooling.events('audio:cue').some((cue) => cue.id === 'cm_chaff'));

  const unlocked = cmRig({ fittings: ['mod_chaff_dispenser_m'], stock: 3 });
  unlocked.press();
  assert.equal(unlocked.events('countermeasure:denied')[0].reason, 'no_lock');
  assert.equal(unlocked.events('alert')[0].text, 'NO INCOMING LOCK');
  assert.notEqual(unlocked.events('alert')[0].text, cooling.events('alert')[0].text);
  assert.equal(unlocked.events('alert')[0].key, 'cm-denied', 'same alert voice, not a new panel');
  assert.equal(unlocked.player.data.cm.stock, 3, 'a lock refusal spends no round');
  assert.equal(unlocked.player.data.cm.effect, null);
  assert.ok(unlocked.events('audio:cue').every((cue) => cue.id !== 'cm_chaff'));

  const locked = cmRig({ fittings: ['mod_chaff_dispenser_m'], stock: 3, withLock: true, withMissile: true });
  locked.press();
  assert.equal(locked.events('countermeasure:denied').length, 0);
  assert.equal(locked.events('countermeasure:deployed').length, 1);
  assert.equal(locked.player.data.cm.stock, 2);
  assert.ok(locked.player.data.cm.effect && locked.player.data.cm.effect.decoyId);
  assert.ok(locked.events('audio:cue').some((cue) => cue.id === 'cm_chaff'));
  assert.equal(locked.events('toast')[0].text, 'Chaff deployed');
});
