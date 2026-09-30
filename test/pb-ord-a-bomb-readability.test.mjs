// PB-ORD-A — SF-035+036+037 bomb readability trio (build_map.md §1C row 93).
// Counterexamples the old behavior fails:
//   · SF-036: burn sprites/gain ignored the actual stacks (fixed 2 sprites, fixed volume) —
//     a 1-stack splash was indistinguishable from a 3-stack committed burn.
//   · SF-035: nothing read the EMP's denied (hardware out) vs recovering (ionized caps
//     rearming at the flattened rate) states off the combat runtime.
//   · SF-037: nothing distinguished can't-fire from can't-steer; the bay copy was a generic
//     scramble claim.
// The lifecycle laws the readout claims (stacking caps, true expiry, thrower attribution)
// are proven through the real kernel/status service, not mirrors.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { getCombatKernel } from '../src/combat/kernel.js';
import { createCombatCatalog, ensureCombatant } from '../src/combat/runtime.js';
import { applyPendingSubsystemTransitions, recomputeCombatantModifiers } from '../src/combat/subsystems.js';
import { createStatusService } from '../src/combat/statuses.js';
import { scalarHitToDamagePacket } from '../src/combat/damage.js';
import { BOMB_DEFS } from '../src/data/bombs.js';
import { ACTION_DEFS } from '../src/data/combatDefs.js';
import { targetConditionReadout } from '../src/ui/targetCondition.js';
import {
  collectStatusAttachedVictims,
  planStatusAttachedEmit,
} from '../src/render/statusAttachedVfx.js';
import {
  BOMB_STATUS_AUDIO,
  burnResidueGain,
  collectBombStatusLoopSpecs,
} from '../src/audio/bombAudio.js';

const DT = 1 / 60;

function makeShip(state, id, x, z, { team = 0, cap = 20, capMax = 40, capRegen = 6 } = {}) {
  const ship = {
    id, type: 'ship', alive: true, team, mass: 32, radius: 6, rot: 0,
    pos: { x, z }, vel: { x: 0, z: 0 },
    hull: 100, hullMax: 100, shield: 0, shieldMax: 0, armorHp: 0, armorMax: 0,
    cap, capMax, capRegen,
  };
  state.entities.set(id, ship);
  if (Array.isArray(state.entityList)) state.entityList.push(ship);
  else state.entityList = [ship];
  return ship;
}

/** Real kernel over a seeded flat state: the same records the production systems run on. */
function bootKernel({ targetCap = 5 } = {}) {
  const state = createGameState(47);
  state.mode = 'flight';
  state.simTime = 0;
  state.playerId = 1;
  const bus = createBus();
  const rejections = [];
  bus.on('combat:actionRejected', (p) => rejections.push(p));
  const helpers = { combatPhysics: { applyImpulse: () => true } };
  const kernel = getCombatKernel({ state, bus, helpers, registry: null });
  const player = makeShip(state, 1, 0, 0, { team: 0 });
  const target = makeShip(state, 2, 40, 0, { team: 1, cap: targetCap });
  const runtime = ensureCombatant(state, target, kernel.catalog);
  const recompute = () => recomputeCombatantModifiers({ state, catalog: kernel.catalog, bus }, target, runtime);
  const advanceOneTick = () => {
    state.tick += 1;
    state.simTime += DT;
    applyPendingSubsystemTransitions({ state, catalog: kernel.catalog, bus }, target, runtime);
    if (kernel.statuses.advance(target, runtime, kernel.routeDamage)) recompute();
  };
  return {
    state, bus, kernel, player, target, runtime, rejections,
    advanceOneTick, recompute,
    readout: () => targetConditionReadout(state, target),
  };
}

/** The exact packet src/systems/bombs.js _blastVictims builds for one static-bomb blast. */
function empPacket(pos, { subsystemId = null, subsystemShare = null } = {}) {
  const def = BOMB_DEFS.bomb_emp;
  const packet = scalarHitToDamagePacket({
    damage: def.damage, damageType: def.damageType, pos,
    penetration: def.penetration || 0, heat: def.heat || 0, statuses: def.statuses,
    subsystemShare: subsystemShare ?? (def.subsystemShare ?? null), shieldBypass: def.shieldBypass || 0,
    source: { kind: 'bomb', payloadId: def.id, bombId: 99 },
  });
  packet.flags = { ignoreFriendlyFire: true, allowAnyTarget: true };
  if (subsystemId) packet.hit = { subsystemId };
  return packet;
}

function routeEmp(t, overrides = {}) {
  return t.kernel.routeDamage({
    attackerId: t.player.id,
    targetId: t.target.id,
    packet: empPacket(t.target.pos, overrides),
    origin: { kind: 'bomb', id: 99, payloadId: 'bomb_emp' },
  });
}

// ── SF-035: denied vs recovering ─────────────────────────────────────────────

test('a static-bomb hit leaves ionized stacks that flatten regen and deny the burst with a real clock', () => {
  const t = bootKernel({ targetCap: 5 }); // burst costs 12: start starved
  try {
    const result = routeEmp(t);
    assert.ok(result && result.ok !== false, 'EMP packet must route');
    t.advanceOneTick();

    const active = t.runtime.statuses.status_ionized;
    assert.ok(active, 'status_ionized must be live after the routed hit');
    assert.equal(active.stacks, 2);
    assert.equal(t.kernel.capRegenMultiplier(t.target.id), 0.7 ** 2);

    // DENIED, with the recover clock: caps below the burst cost rearm at the flattened rate.
    const burst = ACTION_DEFS.find((d) => d.id === 'action_burst');
    const cost = burst.costs.capacitor;
    const denied = t.readout();
    assert.ok(denied.fire && denied.fire.denied && denied.fire.recovering, 'starved caps read as recovering, not out');
    assert.equal(denied.fire.label, 'REARM');
    const regenPerS = t.target.capRegen * 0.49;
    assert.ok(Math.abs(denied.fire.secondsLeft - (cost - 5) / regenPerS) < 1e-9,
      'rearm clock is the true refill window at the suppressed rate');
    assert.match(denied.text, /REARM ~\d/);

    // The powered action is actually refused while starved — the readout names the real gate.
    t.kernel.actions.requestAction({ actorId: t.target.id, actionId: 'action_burst', target: { kind: 'entity', entityId: t.player.id } });
    t.kernel.actions.advance();
    assert.ok(t.rejections.some((r) => r.actorId === t.target.id && r.reason === 'insufficient_capacitor'),
      'burst rejected for the same reason the readout shows');

    // RECOVERING: the clock is deterministic in state.tick/cap and shrinks as the caps climb.
    t.target.cap = 11;
    const later = t.readout();
    assert.ok(later.fire.secondsLeft < denied.fire.secondsLeft, 'clock shrinks as caps recover');
    assert.ok(Math.abs(later.fire.secondsLeft - 1 / regenPerS) < 1e-9);
    t.target.cap = t.target.capMax;
    assert.equal(t.readout().fire, null, 'recovered caps lift the denial entirely');
  } finally {
    t.bus.clear();
  }
});

test('repeated static-bomb hits obey the ionized stacking limit and refresh one recovery window', () => {
  const t = bootKernel({ targetCap: 40 });
  try {
    routeEmp(t);
    t.advanceOneTick();
    const first = t.runtime.statuses.status_ionized;
    const firstExpiry = first.expiresTick;

    t.state.tick += 30;
    routeEmp(t);
    t.advanceOneTick();
    const second = t.runtime.statuses.status_ionized;
    assert.equal(second.stacks, 2, 'refresh stacking never accumulates past the payload stacks');
    assert.equal(second.expiresTick, Math.max(firstExpiry, t.state.tick + 90),
      'expiry refreshes to the payload window, it does not accumulate');
    // Two centre blasts also wreck the power plant (the authored centre hit): its 0.2 regen
    // behaviour composes with the ionized multiplier — the hardware half of denied-vs-recovering.
    assert.equal(t.runtime.subsystems.subsystem_power.destroyed, true,
      'the repeated centre blasts earn the hardware-out state');
    assert.equal(t.kernel.capRegenMultiplier(t.target.id), 0.7 ** 2 * 0.2,
      'recovery multipliers compose: ionized stacks and the wrecked power plant');
  } finally {
    t.bus.clear();
  }
});

test('wrecked gun hardware reads GUNS OUT with no clock while unrelated movement stays valid', () => {
  const t = bootKernel({ targetCap: 40 });
  try {
    // The focused-subsystem route the disabled-hauler flow uses: ion straight into the weapon.
    routeEmp(t, { subsystemId: 'subsystem_weapon', subsystemShare: 1 });
    routeEmp(t, { subsystemId: 'subsystem_weapon', subsystemShare: 1 });
    t.advanceOneTick();

    const weapon = t.runtime.subsystems.subsystem_weapon;
    assert.equal(weapon.destroyed, true, 'two focused EMP blasts wreck the weapon hardware');
    assert.equal(t.runtime.capabilities.weapon, false);

    const readout = t.readout();
    assert.ok(readout.fire && readout.fire.denied, 'the attack verb is denied');
    assert.equal(readout.fire.recovering, false, 'hardware out has no authored field-repair clock');
    assert.equal(readout.fire.label, 'GUNS OUT');
    assert.equal(readout.steer, null, 'steering is untouched: can-not-fire is not can-not-steer');
    assert.equal(t.runtime.multipliers.movement, 1, 'unrelated movement remains valid');
    assert.match(readout.text, /GUNS OUT/);
  } finally {
    t.bus.clear();
  }
});

// ── SF-036: burn commitment ──────────────────────────────────────────────────

function bootStatuses() {
  const state = { tick: 0, combat: {} };
  const bus = createBus();
  const applied = [];
  const expired = [];
  const routedPeriodic = [];
  bus.on('combat:statusApplied', (p) => applied.push(p));
  bus.on('combat:statusExpired', (p) => expired.push(p));
  const catalog = createCombatCatalog();
  const entity = {
    id: 3, type: 'ship', alive: true, team: 1,
    pos: { x: 10, z: 0 }, vel: { x: 0, z: 0 },
    hull: 80, hullMax: 80, shield: 0, shieldMax: 0, armorHp: 0, armorMax: 0,
  };
  const runtime = ensureCombatant(state, entity, catalog);
  const statuses = createStatusService({ state, catalog, bus });
  return { state, bus, entity, runtime, statuses, applied, expired, routedPeriodic };
}

test('burn commitment: sustained contact stacks to the cap and expiry stays the true window', () => {
  const s = bootStatuses();
  try {
    const scheduled = s.statuses.schedule(s.entity, s.runtime, { id: 'status_burning', stacks: 2 }, { attackerId: 7 });
    assert.equal(scheduled.ok, true);
    s.state.tick = 1;
    s.statuses.advance(s.entity, s.runtime, (req) => s.routedPeriodic.push(req));
    let active = s.runtime.statuses.status_burning;
    assert.ok(active, 'burning live after the thermite-scale application');
    assert.equal(active.stacks, 2);
    assert.equal(active.expiresTick, 121);

    // Attribution survives the bomb: the DoT routes with the thrower id while the bomb
    // entity (99) was never a registered entity at all.
    s.state.tick = 31;
    s.statuses.advance(s.entity, s.runtime, (req) => s.routedPeriodic.push(req));
    assert.ok(s.routedPeriodic.length >= 1, 'the burn DoT pays on its periodic clock');
    assert.equal(s.routedPeriodic[0].attackerId, 7, 'burn damage keeps the thrower as its cause');
    assert.equal(s.routedPeriodic[0].packet.flags.statusPeriodic, true);

    // Sustained contact: a second application inside the window stacks to the cap and
    // extends only to its own window — never past the authored per-hit duration.
    s.state.tick = 61;
    s.statuses.schedule(s.entity, s.runtime, { id: 'status_burning', stacks: 2 }, { attackerId: 7 });
    s.state.tick = 62;
    s.statuses.advance(s.entity, s.runtime, (req) => s.routedPeriodic.push(req));
    active = s.runtime.statuses.status_burning;
    assert.equal(active.stacks, 3, 're-contact builds the burn to the stacking cap');
    assert.equal(active.expiresTick, 182, 'true expiry = the latest application window');
    assert.equal(s.expired.length, 0);

    // Burn ends at the true expiry — not a tick before, not a tick after.
    s.state.tick = 181;
    s.statuses.advance(s.entity, s.runtime, (req) => s.routedPeriodic.push(req));
    assert.ok(s.runtime.statuses.status_burning, 'still burning one tick before expiry');
    s.state.tick = 182;
    s.statuses.advance(s.entity, s.runtime, (req) => s.routedPeriodic.push(req));
    assert.equal(s.runtime.statuses.status_burning, undefined, 'burn ends at the true expiry');
    assert.ok(s.expired.some((p) => p.targetId === 3 && p.statusId === 'status_burning'));
  } finally {
    s.bus.clear();
  }
});

function victimStubState(overrides = {}) {
  const entity = { id: 3, alive: true, type: 'ship', pos: { x: 8, z: 2 }, radius: 6 };
  const entities = new Map([[3, entity]]);
  return {
    tick: 4,
    playerId: 1,
    entities,
    combat: {
      entities: {
        3: { statuses: { status_burning: { id: 'status_burning', stacks: 2, expiresTick: 124 } } },
      },
    },
    settings: { video: {}, accessibility: {} },
    ...overrides,
  };
}

test('burn sprites scale with the actual stacks — a 1-stack splash reads thinner than a maxed burn', () => {
  const state = victimStubState();
  const rows = collectStatusAttachedVictims(state);
  const burn = rows.find((r) => r.statusId === 'status_burning');
  assert.ok(burn, 'the burning victim is collected from the live status bag');
  const thin = planStatusAttachedEmit({ ...burn, stacks: 1 }, 0.08, {}, 0);
  const committed = planStatusAttachedEmit({ ...burn, stacks: 3 }, 0.08, {}, 0);
  assert.ok(thin.emit && committed.emit);
  assert.ok(committed.sprites.length > thin.sprites.length,
    'more burn fronts at higher stacks (old behavior: fixed 2 sprites at any stack count)');
  assert.ok(committed.sprites[0].size0 > thin.sprites[0].size0, 'the committed burn is wider');
  assert.ok(committed.sprites[0].opacity0 > thin.sprites[0].opacity0, 'the committed burn is brighter');
  // Reduced motion keeps the single stable mark; sprite life never outruns the status.
  const motion = planStatusAttachedEmit({ ...burn, stacks: 3 }, 0.08, { motionReduce: true }, 0);
  assert.equal(motion.sprites.length, 1);
  assert.ok(motion.sprites.every((sp) => sp.vx === 0 && sp.vz === 0));
  for (const sp of committed.sprites) assert.ok(sp.life <= burn.remainingS + 1e-9);
});

test('burn residue never attaches to a dead or recycled body and dies with the true expiry', () => {
  const deadState = victimStubState();
  deadState.entities.get(3).alive = false;
  assert.equal(collectStatusAttachedVictims(deadState).length, 0,
    'a stale runtime row for a dead body is not presented (pool reuse safety)');

  const expiredState = victimStubState();
  expiredState.tick = 124; // the exact expiresTick
  assert.equal(collectStatusAttachedVictims(expiredState).length, 0,
    'the residue stops at the true expiry tick');
});

test('the burn loop is audible at the committed stack count', () => {
  const thin = burnResidueGain(1);
  const committed = burnResidueGain(3);
  assert.ok(committed > thin, 'gain scales with stacks (old behavior: fixed volume)');
  assert.equal(committed, BOMB_STATUS_AUDIO.status_burning.gain);
  const state = victimStubState();
  state.combat.entities[3].statuses.status_burning.stacks = 3;
  const specs = collectBombStatusLoopSpecs(state);
  const burn = specs.find((spec) => spec.statusId === 'status_burning');
  assert.ok(burn, 'the burning hull carries a status loop spec');
  assert.equal(burn.gain, committed, 'the live loop spec pays the committed gain');
});

// ── SF-037: can't-fire vs can't-steer ────────────────────────────────────────

test('a tumbling hull reads helm AND guns out on one shared clock', () => {
  const t = bootKernel({ targetCap: 40 });
  try {
    t.runtime.statuses.status_tumbling = {
      id: 'status_tumbling', expiresTick: t.state.tick + 360, stacks: 1,
      data: { kind: 'weapon_tumble', startedAt: t.state.tick / 60, until: (t.state.tick + 360) / 60 },
    };
    t.recompute();
    const readout = t.readout();
    assert.ok(readout.steer && readout.steer.out && readout.steer.label === 'TUMBLING');
    assert.ok(Math.abs(readout.steer.secondsLeft - 6) < 1e-9);
    assert.ok(readout.fire && readout.fire.denied && readout.fire.label === 'GUNS LOCKED');
    assert.equal(readout.fire.secondsLeft, readout.steer.secondsLeft, 'one status, one settle clock');
    assert.match(readout.text, /TUMBLING/);
    assert.match(readout.text, /GUNS LOCKED/);
  } finally {
    t.bus.clear();
  }
});

test('overheated denies fire while steering stays valid; a wrecked drive is the reverse', () => {
  const t = bootKernel({ targetCap: 40 });
  try {
    // can't-fire without can't-steer
    t.runtime.statuses.status_overheated = { id: 'status_overheated', expiresTick: t.state.tick + 60, stacks: 1 };
    t.recompute();
    let readout = t.readout();
    assert.ok(readout.fire && readout.fire.denied && readout.fire.label === 'OVERHEATED');
    assert.ok(Math.abs(readout.fire.secondsLeft - 1) < 1e-9);
    assert.equal(readout.steer, null, 'the helm is untouched by the heat lock');
    assert.match(readout.text, /OVERHEATED/);

    // can't-steer without can't-fire
    delete t.runtime.statuses.status_overheated;
    const drive = t.runtime.subsystems.subsystem_drive;
    drive.destroyed = true;
    drive.health = 0;
    t.recompute();
    readout = t.readout();
    assert.ok(readout.steer && readout.steer.out && readout.steer.label === 'DRIVE OUT');
    assert.equal(readout.steer.secondsLeft, null, 'a wrecked drive stays out until a tender or taut line');
    assert.equal(readout.fire, null, 'the guns are untouched by the drive wreck');
    assert.match(readout.text, /DRIVE OUT/);
  } finally {
    t.bus.clear();
  }
});

test('a clean hull reads an empty condition and the readout is deterministic in sim state', () => {
  const t = bootKernel({ targetCap: 40 });
  try {
    const readout = t.readout();
    assert.equal(readout.text, '');
    assert.equal(readout.steer, null);
    assert.equal(readout.fire, null);
    assert.equal(readout.burn, null);
    assert.deepEqual(targetConditionReadout(t.state, t.target), readout,
      'the same sim state answers the same fact twice');
    assert.equal(targetConditionReadout(t.state, { id: 404, alive: false }), null);
  } finally {
    t.bus.clear();
  }
});

test('burn stacks ride the readout with the true remaining window', () => {
  const t = bootKernel({ targetCap: 40 });
  try {
    t.runtime.statuses.status_burning = { id: 'status_burning', expiresTick: t.state.tick + 120, stacks: 3 };
    const readout = t.readout();
    assert.ok(readout.burn);
    assert.equal(readout.burn.stacks, 3);
    assert.ok(Math.abs(readout.burn.secondsLeft - 2) < 1e-9);
    assert.match(readout.text, /BURNING ×3 2\.0s/);
  } finally {
    t.bus.clear();
  }
});

// ── bay copy (SF-037 generic stun text) ──────────────────────────────────────

test('the scrambler names the two locks and their settle instead of a generic scramble', () => {
  const sentence = BOMB_DEFS.bomb_scrambler.sentence;
  assert.match(sentence, /tumbles/, 'the steering fact is named');
  assert.match(sentence, /guns locked/i, 'the fire fact is named');
  assert.match(sentence, /settles/, 'the effect has a readable end');
  assert.doesNotMatch(sentence, /scrambl/i, 'the generic scramble word is gone');
  assert.equal(sentence.includes('verbs lock out'), false, 'the old generic verb-lock claim is gone');
  // The EMP copy keeps the out-vs-flat pair that the readout separates.
  assert.match(BOMB_DEFS.bomb_emp.sentence, /subsystems dark/);
  assert.match(BOMB_DEFS.bomb_emp.sentence, /capacitors flat/);
});

test('the panel wiring loads with the condition reader (default-route reachability smoke)', async () => {
  const panel = await import('../src/ui/targetPanel.js');
  assert.equal(typeof panel.createTargetPanel, 'function');
  assert.equal(typeof targetConditionReadout, 'function');
});
