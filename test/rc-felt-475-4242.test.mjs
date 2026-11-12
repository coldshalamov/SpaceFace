// RC-FELT (row 475) — weapon-family impact identity + the authoritative big-moment pulse.
// Accepted player attacks pulse by weapon family through the real combat:damage route; the
// bulletTime holy-shit verdict gets its own bounded, deduped pulse. Firing requests, NPC
// fire and whiffs stay silent; a same-tick kill keeps the heavier kill pulse; feedback
// never crosses a settings-off, restore or run boundary. The production worker route is
// proven end-to-end through createSimHost — no fixture projector. Run:
//   node --test test/rc-felt-475-4242.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let installedPad = null;
function makePad() {
  return {
    id: 'SpaceFace Synthetic Pad',
    index: 0,
    connected: true,
    mapping: 'standard',
    timestamp: 1,
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false })),
    vibrationActuator: {
      calls: [],
      playEffect(type, params) { this.calls.push({ type, params }); return Promise.resolve('complete'); },
      reset() { this.resetCalls = (this.resetCalls || 0) + 1; },
      resetCalls: 0,
    },
  };
}
const navDesc = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
Object.defineProperty(globalThis, 'navigator', {
  value: { getGamepads: () => (installedPad ? [installedPad] : []) },
  configurable: true,
});
test.after(() => {
  if (navDesc) Object.defineProperty(globalThis, 'navigator', navDesc);
  else delete globalThis.navigator;
});

const {
  createGamepad,
  weaponImpactHaptic,
  HAPTIC_WEAPON_FAMILY_PULSES,
  HAPTIC_MOMENT_PULSE,
  HAPTIC_VERB_PULSES,
  HAPTIC_PULSE_MIN_GAP_TICKS,
} = await import('../src/systems/gamepad.js');
const { createBus } = await import('../src/core/eventBus.js');
const { createGameState } = await import('../src/core/gameState.js');
const { createTimeEffects } = await import('../src/core/timeEffects.js');
const { bulletTime, MOMENT_EVENT } = await import('../src/systems/bulletTime.js');
const { createSimHost } = await import('../scripts/lib/simWorkerHost.mjs');
const { tableChaseFraming, tableWorldToScreen } = await import('../src/render/tabletopPolicy.js');
const { makeShipEntitySpec } = await import('../src/systems/ships.js');
const { applyLaneCameraFrame, laneCameraFramePayload } = await import('../src/core/simLaneCommands.js');
const { createChaseCamera } = await import('../src/render/camera.js');
const THREE = await import('three');
const {
  createSimCommandRing,
  pushLaneCommand,
  applySimCommandEnvelope,
} = await import('../scripts/lib/simCommandChannel.mjs');
const { resetRunState } = await import('../src/core/newGameBoot.js');

function padState(overrides = {}) {
  return {
    tick: 1,
    mode: 'flight',
    playerId: 1,
    player: { tether: { active: false, load: 0 } },
    input: {},
    settings: {
      controls: { gamepad: { enabled: true } },
      accessibility: { haptics: 'full', reduceMotion: false, ...overrides },
    },
    entities: new Map([[1, { id: 1, type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } }]]),
  };
}
function step(gp, state, n = 1) {
  for (let i = 0; i < n; i++) { state.tick += 1; gp.tick(1 / 60, state); }
}
function settle(gp, state, n = 20) { step(gp, state, n); }
function dmg(weaponId, changes = {}) {
  return {
    attackerId: 1, targetId: 2, weaponId, applied: 40,
    targetHostileToPlayer: true, ...changes,
  };
}
function boot(access) {
  installedPad = makePad();
  const bus = createBus();
  const state = padState(access);
  const gp = createGamepad({ bus, state });
  gp.tick(1 / 60, state);
  assert.equal(gp.connected, true);
  return { bus, state, gp };
}

test('RC-FELT: three weapon families produce three distinct actuator pulses', () => {
  const { bus, state, gp } = boot();
  const cases = [
    ['wpn_pulse_laser_s', 'plasma'],
    ['wpn_autocannon_s', 'kinetic'],
    ['wpn_missile_rack_m', 'missile'],
  ];
  const motors = {};
  for (const [weaponId, family] of cases) {
    settle(gp, state);
    installedPad.vibrationActuator.calls.length = 0;
    bus.emit('combat:damage', dmg(weaponId));
    step(gp, state); // deferred admission: queued at emit, admitted next _stepHaptics
    assert.ok(gp.haptics.pulse, `${family} lays a pulse`);
    assert.equal(gp._lastVerbPulse, `weaponImpact:${family}`);
    const spec = HAPTIC_WEAPON_FAMILY_PULSES[family];
    assert.equal(gp.haptics.pulse.strong, spec.strong);
    assert.equal(gp.haptics.pulse.weak, spec.weak);
    const call = installedPad.vibrationActuator.calls.at(-1);
    assert.ok(call && call.type === 'dual-rumble', `${family} drives the actuator`);
    motors[family] = [call.params.strongMagnitude, call.params.weakMagnitude];
  }
  assert.notDeepEqual(motors.plasma, motors.kinetic);
  assert.notDeepEqual(motors.kinetic, motors.missile);
  assert.notDeepEqual(motors.plasma, motors.missile);
});

test('RC-FELT: only accepted player attacks qualify — every gate stays shut', () => {
  const { bus, state, gp } = boot();
  const rejected = [
    dmg('wpn_pulse_laser_s', { attackerId: 9 }),            // NPC attack
    dmg('wpn_pulse_laser_s', { targetId: 1 }),              // self-damage
    dmg('wpn_pulse_laser_s', { targetHostileToPlayer: false }),
    dmg('wpn_pulse_laser_s', { targetHostileToPlayer: undefined }),
    dmg('wpn_pulse_laser_s', { applied: 0 }),
    dmg('wpn_pulse_laser_s', { applied: -5 }),
    dmg('wpn_pulse_laser_s', { applied: Number.NaN }),
    dmg('wpn_pulse_laser_s', { weaponId: '' }),
    dmg('wpn_pulse_laser_s', { weaponId: null }),
    dmg('wpn_pulse_laser_s', { weaponId: undefined }),
    dmg('wpn_gravity_well_m', { weaponId: 'wpn_gravity_well_m' }), // unsupported family
    null,
    {},
  ];
  for (const p of rejected) {
    settle(gp, state);
    bus.emit('combat:damage', p);
    step(gp, state, 3);
    assert.equal(gp.haptics.pulse, null, `rejected payload ${JSON.stringify(p)}`);
    assert.equal(gp._lastVerbPulse, null);
  }
  // weaponImpactHaptic agrees with the subscription gate, and never throws on junk.
  assert.equal(weaponImpactHaptic(dmg('wpn_pulse_laser_s'), null), null);
  assert.equal(weaponImpactHaptic(dmg('wpn_pulse_laser_s'), 1).family, 'plasma');
  assert.equal(weaponImpactHaptic({ attackerId: 1, targetId: 2, weaponId: 'wpn_railgun_x', applied: 10, targetHostileToPlayer: true }, 1), null);
  // Firing requests are not felt: combat:fire alone produces no pulse.
  settle(gp, state);
  bus.emit('combat:fire', { attackerId: 1, weaponId: 'wpn_pulse_laser_s' });
  step(gp, state, 3);
  assert.equal(gp.haptics.pulse, null);
});

test('RC-FELT: a killing shot keeps the kill pulse — ordinary damage never preempts it', () => {
  const { bus, state, gp } = boot();
  settle(gp, state);
  // Same-tick ordering: damage queues, kill starts immediately — the kill owns the gap.
  bus.emit('combat:damage', dmg('wpn_missile_rack_m'));
  bus.emit('entity:killed', { killerId: 1, entityId: 2 });
  step(gp, state);
  assert.equal(gp._lastVerbPulse, 'entity:killed');
  assert.equal(gp.haptics.pulse.strong, HAPTIC_VERB_PULSES['entity:killed'].strong);
  // The family candidate expired (one-tick shelf life); no delayed missile pulse follows.
  step(gp, state, 8);
  assert.equal(gp._lastVerbPulse, 'entity:killed');
});

test('RC-FELT: the bulletTime holy-shit verdict lands the biggest pulse — deduped, bounded', () => {
  const { bus, state, gp } = boot();
  // The real detector wants the full state plumbing: stuntMoments profile + stunts store.
  state.settings.gameplay = { ...(state.settings.gameplay || {}), stuntMoments: 'cinematic' };
  state.settings.video = { ...(state.settings.video || {}), motionReduce: false };
  if (state.stunts == null) state.stunts = {};
  const effects = createTimeEffects(state);
  const bt = Object.create(bulletTime);
  const seen = [];
  bus.on(MOMENT_EVENT, (r) => seen.push(r));
  bt.init({ state, bus, timeEffects: effects, helpers: { worldToScreen: (p) => ({ x: p.x, y: p.z, onScreen: true }) } });
  try {
    for (let id = 0; id < 3; id++) state.entities.set(id, { id, pos: { x: id * 10, z: 0 }, radius: 6, vel: { x: 0, z: 0 } });
    state.playerId = 0;
    state.entities.set(0, { id: 0, type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } });
    const receipt = {
      trickId: 'one_two', name: 'one_two', rarity: 'rare', actorId: 0, targetId: 1,
      secondaryIds: [2], episodeId: 'root:t:13', rootId: 'root:t:13', rootTick: state.tick - 120,
      causeChain: [{ kind: 'impulse', pos: { x: 0, z: 0 } }, { kind: 'contact', pos: { x: 10, z: 0 } }],
      consequence: { killed: true }, sourceRadius: 6,
      metrics: { availableMomentum: 1500, referenceMomentum: 400 }, modifiers: { collateralCount: 1 },
    };
    settle(gp, state);
    installedPad.vibrationActuator.calls.length = 0;
    // The receipt is stamped at emit time — the detector rejects receipts more than one
    // tick stale relative to state.tick.
    receipt.tick = state.tick;
    receipt.rootTick = state.tick - 120;
    state.simTime = state.tick / 60;
    bus.emit('stunt:trickDetected', receipt);
    assert.equal(seen.length, 1, 'the real producer emitted moment:holyShit');
    step(gp, state);
    assert.equal(gp._lastVerbPulse, 'moment:holyShit');
    assert.equal(gp.haptics.pulse.strong, HAPTIC_MOMENT_PULSE.strong);
    assert.equal(gp.haptics.pulse.weak, HAPTIC_MOMENT_PULSE.weak);
    assert.ok(installedPad.vibrationActuator.calls.at(-1).type === 'dual-rumble');
    // A duplicate delivery of the same rootId and a mid-window amendment cannot replay it.
    step(gp, state, 3);
    const callsAfterLive = installedPad.vibrationActuator.calls.length;
    bus.emit('moment:holyShit', { ...seen[0] });
    bus.emit('moment:amended', { ...seen[0], peakScore: 9 });
    step(gp, state, 30);
    assert.equal(gp._lastVerbPulse, 'moment:holyShit');
    assert.ok(installedPad.vibrationActuator.calls.length - callsAfterLive <= 13,
      'only the live tail re-issued — no second pulse');
    // An NPC-owned moment record is not the player's beat.
    settle(gp, state);
    installedPad.vibrationActuator.calls.length = 0;
    bus.emit('moment:holyShit', { ...seen[0], actorId: 9, rootId: 'root:npc:1' });
    step(gp, state, 3);
    assert.equal(gp._lastVerbPulse, 'moment:holyShit');
    assert.equal(installedPad.vibrationActuator.calls.length, 0, 'NPC moment stayed silent');
  } finally {
    bt.destroy();
    bus.clear();
  }
});

test('RC-FELT: a same-tick kill cannot swallow the moment — it waits out the gap, then expires', () => {
  const { bus, state, gp } = boot();
  settle(gp, state);
  // Kill owns the gap first; the moment queues behind it and admits when the gap clears.
  bus.emit('entity:killed', { killerId: 1, entityId: 2 });
  bus.emit('moment:holyShit', { actorId: 1, rootId: 'root:m:1', tick: state.tick });
  step(gp, state);
  assert.equal(gp._lastVerbPulse, 'entity:killed');
  step(gp, state, HAPTIC_PULSE_MIN_GAP_TICKS);
  assert.equal(gp._lastVerbPulse, 'moment:holyShit');
  assert.equal(gp.haptics.pulse.strong, HAPTIC_MOMENT_PULSE.strong);
});

test('RC-FELT: a queued moment expires past 12 ticks behind a continuously owned gap', () => {
  // gyre:thrown force-admits (the throw can never be swallowed by its own windup gap), so
  // every emit re-arms the 5-tick window — the gap NEVER opens for the queued moment. An
  // ordinary per-tick pulse cannot hold it: it can only fire once the gap is already open,
  // which hands the moment a window to slip in (the previous dash-driven version of this
  // test was vacuous — the moment admitted on tick five and a later dash overwrote the
  // diagnostic). Record EVERY admission: the expired moment must never appear.
  const { bus, state, gp } = boot();
  settle(gp, state);
  bus.emit('moment:holyShit', { actorId: 1, rootId: 'root:m:expire', tick: state.tick });
  const admissions = [];
  for (let i = 0; i < 14; i++) {
    bus.emit('gyre:thrown', { mass: 1200 }); // forced pulse — re-arms the gap each tick
    step(gp, state);
    admissions.push(gp._lastVerbPulse);
  }
  assert.ok(admissions.every((name) => name === 'gyre:thrown'),
    `expired moment never admitted — admissions: ${JSON.stringify(admissions)}`);
  step(gp, state, 20);
  assert.equal(gp._lastVerbPulse, 'gyre:thrown');
  assert.equal(gp.haptics.pulse, null);
  // Expiry is the bounded-queue gate, not a wedge: a FRESH moment admits once free.
  bus.emit('moment:holyShit', { actorId: 1, rootId: 'root:m:free', tick: state.tick });
  step(gp, state, 2);
  assert.equal(gp._lastVerbPulse, 'moment:holyShit');
  assert.equal(gp.haptics.pulse.strong, HAPTIC_MOMENT_PULSE.strong);
});

test('RC-FELT: a live moment owns the channel for its tail — family impacts inside it stay silent', () => {
  const { bus, state, gp } = boot();
  settle(gp, state);
  bus.emit('moment:holyShit', { actorId: 1, rootId: 'root:m:lock', tick: state.tick });
  step(gp, state);
  assert.equal(gp._lastVerbPulse, 'moment:holyShit');
  // The 5-tick admission gap clears while the 220 ms tail (13 ticks) is still live. A
  // family impact landing in that window must queue-and-drop — never truncate the moment.
  step(gp, state, HAPTIC_PULSE_MIN_GAP_TICKS + 1);
  assert.equal(gp.haptics.pulse && gp.haptics.pulse.strong, HAPTIC_MOMENT_PULSE.strong,
    'the moment tail is still live after its gap clears');
  bus.emit('combat:damage', dmg('wpn_pulse_laser_s'));
  step(gp, state, 3);
  assert.equal(gp._lastVerbPulse, 'moment:holyShit', 'family never preempted the moment tail');
  // After the tail expires the same family impact pulses normally — the lock was the live
  // window, not a wedge on weapon feedback.
  settle(gp, state, 30);
  bus.emit('combat:damage', dmg('wpn_pulse_laser_s'));
  step(gp, state);
  assert.equal(gp._lastVerbPulse, 'weaponImpact:plasma');
});

test('RC-FELT: accessibility and reset boundaries hold', () => {
  // 'low' halves motor magnitudes; 'off' produces no actuator effect and drops pendings.
  const { bus, state, gp } = boot();
  settle(gp, state);
  installedPad.vibrationActuator.calls.length = 0;
  state.settings.accessibility.haptics = 'low';
  bus.emit('combat:damage', dmg('wpn_missile_rack_m'));
  step(gp, state);
  const low = installedPad.vibrationActuator.calls.at(-1).params;
  const spec = HAPTIC_WEAPON_FAMILY_PULSES.missile;
  assert.ok(Math.abs(low.strongMagnitude - spec.strong / 2) < 1e-9, 'low halves strong');
  assert.ok(Math.abs(low.weakMagnitude - spec.weak / 2) < 1e-9, 'low halves weak');
  // off: a queued candidate discards; a live event never queues; re-enable replays nothing.
  state.settings.accessibility.haptics = 'off';
  settle(gp, state);
  installedPad.vibrationActuator.calls.length = 0;
  bus.emit('combat:damage', dmg('wpn_pulse_laser_s'));
  step(gp, state, 3);
  assert.equal(installedPad.vibrationActuator.calls.length, 0, 'off produces no rumble');
  state.settings.accessibility.haptics = 'full';
  step(gp, state, 3);
  assert.equal(installedPad.vibrationActuator.calls.length, 0, 're-enable replays nothing');
  // reduceMotion alone does not silence haptics (it is a vestibular axis).
  state.settings.accessibility.reduceMotion = true;
  bus.emit('combat:damage', dmg('wpn_autocannon_s'));
  step(gp, state);
  assert.equal(gp._lastVerbPulse, 'weaponImpact:kinetic');
  state.settings.accessibility.reduceMotion = false;
  // Restore / new game / run start clear a queued moment.
  for (const evt of ['save:restoring', 'game:newGame', 'run:started']) {
    settle(gp, state);
    bus.emit('entity:killed', { killerId: 1, entityId: 2 }); // own the gap
    bus.emit('moment:holyShit', { actorId: 1, rootId: `root:${evt}`, tick: state.tick });
    step(gp, state);
    bus.emit(evt, {});
    step(gp, state, HAPTIC_PULSE_MIN_GAP_TICKS + 2);
    assert.notEqual(gp._lastVerbPulse, 'moment:holyShit', `${evt} cleared the queue`);
  }
  // Round-1 (review finding 2): the same boundaries also cancel an ADMITTED new-feature
  // pulse — a 220 ms moment still rumbling through a restore describes a dead world.
  for (const evt of ['save:restoring', 'game:newGame', 'run:started']) {
    settle(gp, state);
    installedPad.vibrationActuator.calls.length = 0;
    bus.emit('moment:holyShit', { actorId: 1, rootId: `root:live:${evt}`, tick: state.tick });
    step(gp, state);
    assert.equal(gp._lastVerbPulse, 'moment:holyShit', `${evt}: moment admitted`);
    assert.equal(gp.haptics.pulse && gp.haptics.pulse.strong, HAPTIC_MOMENT_PULSE.strong,
      `${evt}: the 0.95 moment pulse is live`);
    bus.emit(evt, {});
    step(gp, state);
    assert.equal(gp.haptics.pulse, null, `${evt} canceled the live moment pulse`);
    step(gp, state, 20);
    assert.equal(gp.haptics.pulse, null, `${evt}: no late re-admission`);
  }
  // An admitted family pulse is owned the same way.
  settle(gp, state);
  bus.emit('combat:damage', dmg('wpn_missile_rack_m'));
  step(gp, state);
  assert.equal(gp._lastVerbPulse, 'weaponImpact:missile');
  assert.ok(gp.haptics.pulse);
  bus.emit('save:restoring', {});
  step(gp, state);
  assert.equal(gp.haptics.pulse, null, 'save:restoring cancels a live family pulse');
  // The boundary touches ONLY new-feature pulses — shipped feedback keeps its tail.
  settle(gp, state);
  bus.emit('entity:killed', { killerId: 1, entityId: 2 });
  step(gp, state);
  assert.equal(gp._lastVerbPulse, 'entity:killed');
  assert.ok(gp.haptics.pulse, 'kill pulse live');
  bus.emit('save:restoring', {});
  step(gp, state);
  assert.ok(gp.haptics.pulse, 'the shipped kill pulse survives the boundary untouched');
  // A backward sim tick (restore boundary) drops queued feedback.
  settle(gp, state);
  bus.emit('moment:holyShit', { actorId: 1, rootId: 'root:back', tick: state.tick });
  state.tick -= 40;
  gp.tick(1 / 60, state);
  state.tick += 60;
  step(gp, state, HAPTIC_PULSE_MIN_GAP_TICKS + 4);
  assert.notEqual(gp._lastVerbPulse, 'moment:holyShit');
  // A backward tick also cancels a LIVE felt pulse (the admitted moment belongs to the
  // pre-restore world).
  settle(gp, state);
  bus.emit('moment:holyShit', { actorId: 1, rootId: 'root:back2', tick: state.tick });
  step(gp, state);
  assert.equal(gp._lastVerbPulse, 'moment:holyShit');
  assert.ok(gp.haptics.pulse);
  state.tick -= 40;
  gp.tick(1 / 60, state);
  assert.equal(gp.haptics.pulse, null, 'backward tick canceled the live moment pulse');
  state.tick += 60;
  step(gp, state, 20);
  assert.equal(gp.haptics.pulse, null, 'no replay after the restore');
});

test('RC-FELT: the lane transport carries the identical frame without double admission', () => {
  installedPad = makePad();
  const bus = createBus();
  const state = padState();
  const gp = createGamepad({ bus, state });
  gp.tick(1 / 60, state);
  settle(gp, state);
  bus.emit('combat:damage', dmg('wpn_missile_rack_m'));
  step(gp, state);
  const frame = gp.haptics;
  assert.equal(frame.pulse.strong, HAPTIC_WEAPON_FAMILY_PULSES.missile.strong);
  // The main-lane facade consumes the resolved frame as-is.
  const facadePad = makePad();
  installedPad = facadePad;
  const facade = createGamepad({ bus: createBus(), state: {} }, { laneHaptics: true });
  facade.applyLaneFrame({ pads: [facadePad] });
  facade.tick(1 / 60, { input: { gamepadHaptics: frame }, settings: {} });
  const call = facadePad.vibrationActuator.calls.at(-1);
  assert.ok(call && call.type === 'dual-rumble');
  assert.equal(call.params.strongMagnitude, frame.strong);
  assert.equal(call.params.weakMagnitude, frame.weak);
  // The facade admits nothing of its own: no subscriptions exist under laneHaptics.
  facade.applyLaneFrame({ pads: [facadePad] });
  facade.tick(1 / 60, { input: { gamepadHaptics: null }, settings: {} });
});

test('RC-FELT: feedback admission leaves the protected gameplay fields untouched', () => {
  // Review-2 finding 2: the old proof emitted every damage event next to a moment —
  // moments suppress family admission for their whole live tail, so the family
  // channel never actually admitted a pulse and the comparison was vacuous for it.
  // Each channel now runs ALONE against its own no-event control on the protected
  // surface: credits, cargo, entity positions/velocities, weapon state, and the RNG
  // continuation (seed/state/draw count). A mutation hiding behind moment
  // suppression can no longer pass.
  const snapshot = (state) => ({
    credits: state.player.credits,
    cargo: JSON.parse(JSON.stringify(state.player.cargo)),
    entities: [...state.entities.values()].map((e) => ({
      id: e.id,
      pos: { ...e.pos },
      vel: { ...e.vel },
    })),
    weapons: JSON.parse(JSON.stringify(
      state.entities.get(state.playerId)?.data?.weapons ?? state.player.fireGroups,
    )),
    rng: state.rng.getState(),
  });
  const bootRun = () => {
    installedPad = makePad();
    const bus = createBus();
    const state = createGameState(4242);
    state.mode = 'flight';
    state.playerId = 1;
    state.tick = 1;
    state.entities.set(1, {
      id: 1, type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 3, z: -1 },
      data: { weapons: [{ id: 'wpn_pulse_laser_s', cooldown: 0.4, group: 1 }] },
    });
    const gp = createGamepad({ bus, state });
    gp.tick(1 / 60, state);
    return { bus, state, gp };
  };
  const controlRun = (ticks = 30) => {
    const run = bootRun();
    step(run.gp, run.state, ticks);
    return run;
  };

  // --- family-only leg: combat:damage events, ZERO moments anywhere ----------
  const familyRun = bootRun();
  const familyTrace = [];
  for (const weaponId of ['wpn_pulse_laser_s', 'wpn_autocannon_s', 'wpn_missile_rack_m']) {
    familyRun.bus.emit('combat:damage', dmg(weaponId));
    step(familyRun.gp, familyRun.state, 10);
    familyTrace.push(familyRun.gp._lastVerbPulse);
  }
  assert.deepEqual(familyTrace, [
    'weaponImpact:plasma', 'weaponImpact:kinetic', 'weaponImpact:missile',
  ], 'family pulses actually admitted — no moment suppresses the channel in this run');
  assert.ok(installedPad.vibrationActuator.calls.length >= 3,
    'the actuator fired for each family pulse — admission is real, not just a trace label');
  assert.deepEqual(snapshot(familyRun.state), snapshot(controlRun().state),
    'family admission left credits, cargo, positions, velocities, weapons and RNG untouched');
  // Determinism: the same family sequence on the same seed replays identically.
  const familyRerun = bootRun();
  const familyRerunTrace = [];
  for (const weaponId of ['wpn_pulse_laser_s', 'wpn_autocannon_s', 'wpn_missile_rack_m']) {
    familyRerun.bus.emit('combat:damage', dmg(weaponId));
    step(familyRerun.gp, familyRerun.state, 10);
    familyRerunTrace.push(familyRerun.gp._lastVerbPulse);
  }
  assert.deepEqual(familyRerunTrace, familyTrace);
  assert.deepEqual(snapshot(familyRerun.state), snapshot(controlRun().state));

  // --- moment-only leg: moment:holyShit events, ZERO damage events -----------
  const momentRun = bootRun();
  const momentTrace = [];
  for (const suffix of ['a', 'b', 'c']) {
    momentRun.bus.emit('moment:holyShit', {
      actorId: 1, rootId: `root:eq:${suffix}`, tick: momentRun.state.tick,
    });
    step(momentRun.gp, momentRun.state, 10);
    momentTrace.push(momentRun.gp._lastVerbPulse);
  }
  assert.deepEqual(momentTrace, [
    'moment:holyShit', 'moment:holyShit', 'moment:holyShit',
  ], 'authoritative moments admitted — the moment channel is exercised on its own');
  assert.deepEqual(snapshot(momentRun.state), snapshot(controlRun().state),
    'moment admission left credits, cargo, positions, velocities, weapons and RNG untouched');
});

test('RC-FELT: the production worker lane emits and admits the moment with NO fixture projector', { timeout: 60000 }, async (t) => {
  // Review finding 1: this is the real ?simLane=worker route — createSimHost production
  // init, the authoritative runtime's own bulletTime + input/gamepad, the lane's
  // transported pixel viewport, and the worker-side projection helper the host binds.
  // Nothing in this test supplies worldToScreen: visibility comes from production wiring.
  const worker = createSimHost();
  t.after(() => worker.shutdown());
  const settings = JSON.parse(JSON.stringify(createGameState(4242).settings));
  settings.gameplay.stuntMoments = 'cinematic';
  settings.accessibility.haptics = 'full';
  await worker.init({
    kind: 'init', seq: 1, profile: 'production', seed: 4242,
    settings, bridgeAll: true, tacticalAI: true,
    viewport: { w: 1280, h: 720 },
    scenarioContract: JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url), 'utf8')),
    domainMirroring: {},
  });
  const state = worker.host.state;
  const bus = worker.host.bus;
  const gp = worker.host.registry.get('input').gamepad;
  assert.ok(gp, 'the production input system constructed the gamepad');
  const player = worker.host.runtime.spawn(makeShipEntitySpec('ship_kestrel', {
    isPlayer: true, pos: { x: 0, z: 0 },
  }));
  state.playerId = player.id;
  const target = worker.host.runtime.spawn(makeShipEntitySpec('ship_wasp', {
    pos: { x: 0, z: 40 }, team: 1,
  }));
  const source = worker.host.runtime.spawn(makeShipEntitySpec('ship_wasp', {
    pos: { x: 0, z: -12 }, team: 1,
  }));
  await worker.host.registry.get('physics').prepareBackend(state);
  // The pad connects through the wire descriptor — the worker has no Gamepad API.
  const lanePad = {
    id: 'RC-FELT worker pad', connected: true, index: 0, mapping: 'standard',
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
  };
  const padCommand = (seq) => ({
    seq, t: 'dom',
    p: { d: { type: 'gamepadFrame', frame: { pads: [lanePad], captureMode: false }, promptDevice: 'gamepad' } },
  });
  let seq = 2;
  let reply = await worker.tick({ seq: seq, tick: state.tick, steps: 1, commands: [
    padCommand(seq++), { seq: seq++, t: 'mode', p: { mode: 'flight' } },
  ] });
  assert.equal(state.mode, 'flight');
  assert.equal(gp.connected, true, 'the lane pad connected inside the worker');
  const receiptFor = (suffix, { targetId = target.id, terminalPos = null, contact = null } = {}) => ({
    trickId: 'one_two', name: 'one_two', rarity: 'rare',
    actorId: player.id, targetId, secondaryIds: [source.id],
    episodeId: `root:lane:${suffix}`, rootId: `root:lane:${suffix}`,
    rootTick: state.tick - 20, tick: state.tick,
    causeChain: [
      { kind: 'impulse', pos: { x: source.pos.x, z: source.pos.z } },
      { kind: 'contact', pos: contact || { x: target.pos.x, z: target.pos.z } },
    ],
    consequence: { killed: true }, sourceRadius: 6,
    metrics: { availableMomentum: 1500, referenceMomentum: 400 },
    modifiers: { collateralCount: 1 },
    ...(terminalPos ? { terminalPos } : {}),
  });
  const momentEvents = (r) => (r.events || []).filter((e) => e.t === 'moment:holyShit');
  // Honesty leg: an off-glass receipt is rejected by the lane projector — the helper is
  // a real visibility answer, never an always-true stub. targetId resolves to nothing so
  // the terminal read falls to terminalPos, 9000 WU off the frustum.
  bus.emit('stunt:trickDetected', receiptFor('offglass', {
    targetId: null,
    terminalPos: { x: player.pos.x + 9000, z: player.pos.z },
    contact: { x: player.pos.x + 9000, z: player.pos.z },
  }));
  reply = await worker.tick({ seq: seq, tick: state.tick, steps: 1, commands: [padCommand(seq++)] });
  assert.equal(momentEvents(reply).length, 0,
    'off-glass receipt produced no moment — the projection is honest');
  assert.notEqual(gp._lastVerbPulse, 'moment:holyShit');
  // The qualifying receipt: emitted on the worker bus exactly where the stunts producer
  // lands it, rated by the worker's bulletTime, projected by the lane helper.
  bus.emit('stunt:trickDetected', receiptFor('hit'));
  reply = await worker.tick({ seq: seq, tick: state.tick, steps: 1, commands: [padCommand(seq++)] });
  const bridged = momentEvents(reply);
  assert.equal(bridged.length, 1, 'moment:holyShit crossed the worker event bridge');
  assert.equal(bridged[0].p.actorId, player.id);
  assert.equal(bridged[0].p.rootId, 'root:lane:hit');
  assert.equal(bridged[0].p.framingSafe, false,
    'the worker honestly reports no framing guarantee (no DOM glass to measure against)');
  assert.equal(gp._lastVerbPulse, 'moment:holyShit',
    'the worker gamepad admitted the moment pulse');
  assert.ok(gp.haptics.pulse, 'the moment pulse is live on the worker pad frame');
  assert.equal(gp.haptics.pulse.strong, HAPTIC_MOMENT_PULSE.strong);
  assert.equal(gp.haptics.pulse.weak, HAPTIC_MOMENT_PULSE.weak);
  assert.equal(state.input.gamepadHaptics.pulse.strong, HAPTIC_MOMENT_PULSE.strong,
    'the resolved frame published onto state.input.gamepadHaptics for the lane');
});

test('RC-FELT: the worker frustum matches the settled chase camera at the glass edge', { timeout: 60000 }, async (t) => {
  // Review-2 finding 1 reproduction: seed 4242, stationary player at (0,0),
  // 1280x720 viewport, camera settled — the real rig's dynamic speed-zoom rests
  // at 144 x 0.88 = 126.72 WU, so (115,0) sits at real NDC x -1.094719, OFF the
  // glass. A projector fed the commanded 144 called it on-screen and admitted a
  // phantom moment + a 0.8 timeScale. The lane derivation now runs the shipped
  // rig's own settled framing, so the worker answers the same frustum.
  const worker = createSimHost();
  t.after(() => worker.shutdown());
  const settings = JSON.parse(JSON.stringify(createGameState(4242).settings));
  settings.gameplay.stuntMoments = 'cinematic';
  settings.accessibility.haptics = 'full';
  await worker.init({
    kind: 'init', seq: 1, profile: 'production', seed: 4242,
    settings, bridgeAll: true, tacticalAI: true,
    viewport: { w: 1280, h: 720 },
    scenarioContract: JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url), 'utf8')),
    domainMirroring: {},
  });
  const state = worker.host.state;
  const bus = worker.host.bus;
  const gp = worker.host.registry.get('input').gamepad;
  const player = worker.host.runtime.spawn(makeShipEntitySpec('ship_kestrel', {
    isPlayer: true, pos: { x: 0, z: 0 },
  }));
  state.playerId = player.id;
  const source = worker.host.runtime.spawn(makeShipEntitySpec('ship_wasp', {
    pos: { x: 0, z: -12 }, team: 1,
  }));
  await worker.host.registry.get('physics').prepareBackend(state);
  const lanePad = {
    id: 'RC-FELT boundary pad', connected: true, index: 0, mapping: 'standard',
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
  };
  const padCommand = (seq) => ({
    seq, t: 'dom',
    p: { d: { type: 'gamepadFrame', frame: { pads: [lanePad], captureMode: false }, promptDevice: 'gamepad' } },
  });
  let seq = 2;
  const momentEvents = (r) => (r.events || []).filter((e) => e.t === 'moment:holyShit');
  await worker.tick({ seq: seq, tick: state.tick, steps: 1, commands: [
    padCommand(seq++), { seq: seq++, t: 'mode', p: { mode: 'flight' } },
  ] });
  assert.equal(state.mode, 'flight');
  // The flight step gives a live hull a small drift velocity, which feeds the
  // rig's look-ahead and speed-zoom. The review reproduction is a stationary
  // player, so pin the hull back to rest before each projection — the same
  // settled-state fixture the 300-frame idle on the real rig produces.
  const stationary = () => {
    player.pos.x = 0; player.pos.z = 0;
    player.vel.x = 0; player.vel.z = 0;
  };
  stationary();

  // The settled envelope itself: base 144 x the shipped idle speed-zoom factor.
  const viewport = worker.host.laneViewport;
  assert.equal(viewport.width, 1280);
  assert.equal(viewport.height, 720);
  const framing = tableChaseFraming(state, viewport);
  assert.ok(Math.abs(framing.distance - 144 * 0.88) < 1e-6,
    `settled effective zoom is base*SPEED_ZOOM_MIN, not the commanded 144 — got ${framing.distance}`);
  assert.ok(Math.abs(framing.focusX - player.pos.x) < 1e-9
    && Math.abs(framing.focusZ - player.pos.z) < 1e-9,
    'a stationary, untargeted, unthreatened hull keeps the look-at on the player');

  // The review's exact reproduction point: (115,0) is off the real glass.
  const edge = tableWorldToScreen(state, viewport, { x: 115, z: 0 });
  assert.equal(edge.onScreen, false, '(115,0) is off-screen at the settled 126.72 frame');
  assert.ok(Math.abs(edge.ndcX - (-1.094719)) < 1e-4,
    `real NDC x matches the shipped camera's -1.094719 — got ${edge.ndcX}`);
  // Just inside vs just outside the real NDC edge, computed from the same
  // settled envelope (|ndcX| = 1 at dx = distance * tanHalf * aspect ≈ 105 WU).
  const tanHalf = Math.tan((framing.fov * Math.PI / 180) * 0.5);
  const edgeWu = framing.distance * tanHalf * framing.aspect;
  const inside = tableWorldToScreen(state, viewport, { x: edgeWu - 0.5, z: 0 });
  const outside = tableWorldToScreen(state, viewport, { x: edgeWu + 0.5, z: 0 });
  assert.equal(inside.onScreen, true, `x=${(edgeWu - 0.5).toFixed(2)} is inside the edge (ndc ${inside.ndcX.toFixed(4)})`);
  assert.equal(outside.onScreen, false, `x=${(edgeWu + 0.5).toFixed(2)} is outside the edge (ndc ${outside.ndcX.toFixed(4)})`);

  // Gate semantics through the lane. The outside-edge receipt must be suppressed:
  // no moment:holyShit, no moment pulse on the pad, and no 0.8 timeScale — the
  // phantom the old commanded-zoom projector produced.
  const receiptFor = (suffix, terminal) => ({
    trickId: 'one_two', name: 'one_two', rarity: 'rare',
    actorId: player.id, targetId: null, secondaryIds: [source.id],
    episodeId: `root:edge:${suffix}`, rootId: `root:edge:${suffix}`,
    rootTick: state.tick - 20, tick: state.tick,
    causeChain: [
      { kind: 'impulse', pos: { x: source.pos.x, z: source.pos.z } },
      { kind: 'contact', pos: terminal },
    ],
    consequence: { killed: true }, sourceRadius: 6,
    metrics: { availableMomentum: 1500, referenceMomentum: 400 },
    modifiers: { collateralCount: 1 },
    terminalPos: terminal,
  });
  bus.emit('stunt:trickDetected', receiptFor('outside', { x: 115, z: 0 }));
  let reply = await worker.tick({ seq: seq, tick: state.tick, steps: 1, commands: [padCommand(seq++)] });
  assert.equal(momentEvents(reply).length, 0,
    'outside-edge receipt produced no moment — the lane frustum is the settled one');
  assert.notEqual(gp._lastVerbPulse, 'moment:holyShit');
  assert.equal(state.timeScale, 1, 'no phantom 0.8 timeScale from an off-glass moment');
  // A tick past the first, the inside-edge receipt qualifies and lands. The
  // intervening step re-armed the hull's drift — pin it stationary again so the
  // receipt lands against the same settled envelope.
  stationary();
  bus.emit('stunt:trickDetected', receiptFor('inside', { x: edgeWu - 1, z: 0 }));
  reply = await worker.tick({ seq: seq, tick: state.tick, steps: 1, commands: [padCommand(seq++)] });
  const bridged = momentEvents(reply);
  assert.equal(bridged.length, 1, 'inside-edge receipt emitted moment:holyShit');
  assert.equal(gp._lastVerbPulse, 'moment:holyShit', 'the worker pad admitted the inside-edge moment');
  assert.ok(state.timeScale < 1, `the real moment armed the 0.8 slow-mo (timeScale ${state.timeScale})`);
});

test('RC-FELT: the displayed-camera envelope lands on state.camera through the command channel', () => {
  // Round-3 finding 1 transport leg: the lane bridge ships the rig's live
  // record as a 'camera' command envelope; the channel's shared applier folds
  // it onto state.camera before the directive's steps — same landing zone as
  // applyLaneViewport.
  const ring = createSimCommandRing();
  const seq = pushLaneCommand(ring, {
    kind: 'camera',
    p: {
      zoom: 58, displayedZoom: 58 * 0.88, speedZoomFactor: 0.88,
      focusX: 3.5, focusZ: -2, tilt: 60, aspect: 16 / 9,
    },
  });
  assert.ok(seq > 0, 'the camera descriptor queued onto the ring');
  const wire = ring.drain();
  assert.equal(wire.length, 1);
  assert.equal(wire[0].t, 'camera', 'the wire envelope carries the camera type');
  const state = createGameState(4242);
  const out = applySimCommandEnvelope(wire[0], { state });
  assert.equal(out.type, 'camera');
  assert.equal(out.ack.ok, true, 'the shared applier accepted the frame');
  assert.equal(state.camera.zoom, 58, 'commanded zoom transported (camera:zoom is presentation-only)');
  assert.equal(state.camera.displayedZoom, 58 * 0.88);
  assert.equal(state.camera.speedZoomFactor, 0.88);
  assert.equal(state.camera.focusX, 3.5);
  assert.equal(state.camera.focusZ, -2);
  assert.equal(state.camera.tilt, 60);
  assert.equal(state.camera.aspect, 16 / 9);
  // Junk frames fold nothing: absent or non-finite fields leave the record alone.
  const before = JSON.stringify(state.camera);
  assert.equal(applySimCommandEnvelope({ t: 'camera', p: null }, { state }).ack.ok, false);
  assert.equal(applySimCommandEnvelope({ t: 'camera', p: { zoom: NaN, focusX: 'x' } }, { state }).ack.ok, false);
  assert.equal(JSON.stringify(state.camera), before, 'a junk frame touched nothing');
});

test('RC-FELT: settled zoom 58 — the transported envelope puts (70,0) off-screen like the real rig', () => {
  // Review-3 finding 1, boundary leg one: seed 4242, 1280×720, stationary hull,
  // real camera settled at commanded zoom 58 — (70,0) reads real NDC x
  // −1.654388 (OFF the glass). The worker's stale commanded-144 projector
  // answered −0.666351/onScreen:true and admitted a phantom moment. With the
  // displayed record transported, the lane projector answers the picture.
  const viewport = { width: 1280, height: 720 };
  const state = createGameState(4242);
  state.mode = 'flight';
  state.entities.set(1, { id: 1, type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } });
  state.playerId = 1;
  // Pre-transport the old gap still shows: the boot 144 record calls the same
  // point on-screen — the phantom the review reproduced.
  const stale = tableWorldToScreen(state, viewport, { x: 70, z: 0 });
  assert.equal(stale.onScreen, true, 'pre-transport: the 144 record still calls (70,0) on-screen');
  applyLaneCameraFrame(state, {
    zoom: 58, displayedZoom: 58 * 0.88, speedZoomFactor: 0.88,
    focusX: 0, focusZ: 0, tilt: 60, aspect: 1280 / 720,
  });
  const edge = tableWorldToScreen(state, viewport, { x: 70, z: 0 });
  assert.equal(edge.onScreen, false, '(70,0) is off the real glass at the displayed ~51 WU frame');
  assert.ok(Math.abs(edge.ndcX - (-1.654388)) < 5e-4,
    `worker NDC matches the real rig's −1.654388 — got ${edge.ndcX}`);
  // The framing record exposes the transported truth, not the derivation.
  const framing = tableChaseFraming(state, viewport);
  assert.ok(Math.abs(framing.distance - 58 * 0.88) < 1e-9,
    `framing distance is the eased displayed value — got ${framing.distance}`);
  assert.equal(framing.focusX, 0);
  assert.equal(framing.focusZ, 0);
  // Just inside the real edge still admits — the gate is moved, not closed.
  const tanHalf = Math.tan((framing.fov * Math.PI / 180) * 0.5);
  const inside = tableWorldToScreen(state, viewport, {
    x: framing.distance * tanHalf * framing.aspect - 0.5, z: 0,
  });
  assert.equal(inside.onScreen, true, `x=${(framing.distance * tanHalf * framing.aspect - 0.5).toFixed(1)} stays inside (ndc ${inside.ndcX.toFixed(3)})`);
});

test('RC-FELT: 0→120 accel — the damped envelope, not instantaneous speed, drives the frustum', () => {
  // Boundary leg two: with matching commanded zoom a 0→120 velocity change put
  // (140,0) at real NDC −1.320367 (OFF) — the eased distance had not yet opened
  // — while the worker's instantaneous-speed derivation answered −0.646675
  // (ON). The transported eased distance and damped speed-zoom factor close it.
  const viewport = { width: 1280, height: 720 };
  const state = createGameState(4242);
  state.mode = 'flight';
  state.entities.set(1, { id: 1, type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 120, z: 0 } });
  state.playerId = 1;
  const stale = tableWorldToScreen(state, viewport, { x: 140, z: 0 });
  assert.equal(stale.onScreen, true,
    `instantaneous-speed derivation still calls it on-screen (ndc ${stale.ndcX.toFixed(4)})`);
  // The rig's live record mid-accel: the eased distance had only reached ~128 —
  // shipping it makes the worker answer the picture exactly.
  applyLaneCameraFrame(state, {
    zoom: 144, displayedZoom: 127.9, speedZoomFactor: 0.889,
    focusX: 0, focusZ: 0, tilt: 60, aspect: 1280 / 720,
  });
  const proj = tableWorldToScreen(state, viewport, { x: 140, z: 0 });
  assert.equal(proj.onScreen, false, 'the transported eased distance puts (140,0) off-screen like the glass');
  assert.ok(Math.abs(proj.ndcX - (-1.320367)) < 1e-3,
    `worker NDC matches the real rig's −1.320367 — got ${proj.ndcX}`);
  // Field-independent consumption: with ONLY the damped factor transported,
  // the derived distance still lands the damped answer, not the instantaneous
  // one (144 × the saturated 1.35 speed-zoom opens ~194 WU).
  const partial = createGameState(4242);
  partial.mode = 'flight';
  partial.entities.set(1, { id: 1, type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 120, z: 0 } });
  partial.playerId = 1;
  applyLaneCameraFrame(partial, { speedZoomFactor: 0.9 });
  const damped = tableChaseFraming(partial, viewport);
  assert.ok(Math.abs(damped.distance - 144 * 0.9) < 1,
    `damped factor drives the derived distance — got ${damped.distance}`);
  // And a bare focus transport relocates the look-at verbatim (galactic-global).
  applyLaneCameraFrame(partial, { focusX: 7.5, focusZ: -4 });
  const refocused = tableChaseFraming(partial, viewport);
  assert.equal(refocused.focusX, 7.5, 'transported focusX lands as-is');
  assert.equal(refocused.focusZ, -4, 'transported focusZ lands as-is');
});

test('RC-FELT: a run reset drops the transported camera record — the projector falls back', () => {
  // The transported envelope describes the pre-reset world; a new run has no
  // displayed camera until the next frame ships, so resetRunState clears the
  // lane fields and the derivation owns the answer again.
  const viewport = { width: 1280, height: 720 };
  const state = createGameState(4242);
  state.mode = 'flight';
  state.entities.set(1, { id: 1, type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } });
  state.playerId = 1;
  applyLaneCameraFrame(state, {
    zoom: 58, displayedZoom: 58 * 0.88, speedZoomFactor: 0.88,
    focusX: 9, focusZ: 2, tilt: 60, aspect: 1280 / 720,
  });
  resetRunState(state, { seed: 4242 });
  assert.equal(state.camera.displayedZoom, undefined, 'reset cleared the eased distance');
  assert.equal(state.camera.speedZoomFactor, undefined, 'reset cleared the damped factor');
  assert.equal(state.camera.focusX, undefined, 'reset cleared the transported focus');
  assert.equal(state.camera.focusZ, undefined);
  assert.equal(state.camera.aspect, undefined);
  const framing = tableChaseFraming(state, viewport);
  assert.ok(Math.abs(framing.distance - 144 * 0.88) < 1e-6,
    `post-reset the settled derivation owns the frame again — got ${framing.distance}`);
});

test('RC-FELT: switching haptics off cancels an ADMITTED felt pulse — re-enable replays nothing', () => {
  // Review-3 finding 2: 'off' dropped queued feedback but left an admitted
  // pulse ticking, so the 220 ms moment resumed on re-enable. The off branch
  // now cancels the live pulse too — felt-owned only, so another owner's tail
  // (a kill crossing the same window) still plays out.
  const { bus, state, gp } = boot();
  settle(gp, state);
  installedPad.vibrationActuator.calls.length = 0;
  bus.emit('moment:holyShit', { actorId: 1, rootId: 'root:off:1', tick: state.tick });
  step(gp, state);
  assert.equal(gp._lastVerbPulse, 'moment:holyShit');
  assert.ok(gp.haptics.pulse, 'the moment pulse is live');
  assert.ok(installedPad.vibrationActuator.calls.length > 0, 'the actuator received the pulse');
  // Off mid-tail: the admitted pulse dies on the spot, not merely for a frame.
  state.settings.accessibility.haptics = 'off';
  step(gp, state);
  assert.equal(gp.haptics.pulse, null, 'off canceled the live felt pulse');
  // Re-enable inside what would have been the tail: nothing replays.
  state.settings.accessibility.haptics = 'full';
  installedPad.vibrationActuator.calls.length = 0;
  step(gp, state, 20);
  assert.equal(gp.haptics.pulse, null, 'no replay after re-enable');
  assert.equal(installedPad.vibrationActuator.calls.length, 0,
    'the canceled pulse never reached the actuator again');
  // The family channel owns the same latch.
  settle(gp, state);
  bus.emit('combat:damage', dmg('wpn_missile_rack_m'));
  step(gp, state);
  assert.equal(gp._lastVerbPulse, 'weaponImpact:missile');
  assert.ok(gp.haptics.pulse);
  state.settings.accessibility.haptics = 'off';
  step(gp, state);
  assert.equal(gp.haptics.pulse, null, 'off canceled a live family pulse');
  state.settings.accessibility.haptics = 'full';
  installedPad.vibrationActuator.calls.length = 0;
  step(gp, state, 10);
  assert.equal(installedPad.vibrationActuator.calls.length, 0, 'the family pulse never replayed');
  // Preservation leg: a non-felt pulse admitted before 'off' keeps its tail —
  // the latch guards ONLY felt-owned feedback.
  settle(gp, state);
  bus.emit('entity:killed', { killerId: 1, entityId: 2 });
  step(gp, state);
  assert.equal(gp._lastVerbPulse, 'entity:killed');
  assert.ok(gp.haptics.pulse, 'kill pulse live');
  state.settings.accessibility.haptics = 'off';
  step(gp, state); // one off-tick — the kill tail keeps counting underneath
  state.settings.accessibility.haptics = 'full';
  step(gp, state);
  assert.equal(gp._lastVerbPulse, 'entity:killed');
  assert.ok(gp.haptics.pulse, 'the non-felt kill pulse resumed its tail after re-enable');
});

test('RC-FELT: the camera envelope carries the displayed pose and its frame origin', () => {
  // Round-4 transport leg: camera.js's follow() stamps the displayed pose and
  // the frame origin it belongs to; laneCameraFramePayload (the same builder
  // appendCameraFrame runs) ships them verbatim and the shared applier lands
  // every field independently on the worker's state.camera.
  const cam = {
    zoom: 58, displayedZoom: 51.04, speedZoomFactor: 0.88,
    focus: { x: 3.5, y: 0, z: -2 }, tilt: 60,
    frameOriginX: 2000, frameOriginZ: -2000,
    viewKind: 'racing', viewMix: 1,
    eyeX: -58, eyeY: 22, eyeZ: 0,
    quatX: 0.1, quatY: -0.2, quatZ: 0.05, quatW: 0.97,
    displayFov: 52, displayNear: 1.5, displayFar: 14000,
  };
  const payload = laneCameraFramePayload(cam, 16 / 9);
  assert.equal(payload.frameOriginX, 2000, 'the frame origin rides the envelope');
  assert.equal(payload.frameOriginZ, -2000);
  assert.equal(payload.viewKind, 'racing');
  assert.equal(payload.eyeY, 22, 'the eye ships its Y height, not a tilt');
  const ring = createSimCommandRing();
  pushLaneCommand(ring, { kind: 'camera', p: payload });
  const wire = ring.drain();
  assert.equal(wire[0].t, 'camera');
  const state = createGameState(4242);
  const out = applySimCommandEnvelope(wire[0], { state });
  assert.equal(out.ack.ok, true);
  assert.equal(state.camera.frameOriginX, 2000);
  assert.equal(state.camera.frameOriginZ, -2000);
  assert.equal(state.camera.viewKind, 'racing');
  assert.equal(state.camera.viewMix, 1);
  assert.equal(state.camera.eyeX, -58);
  assert.equal(state.camera.eyeY, 22);
  assert.equal(state.camera.eyeZ, 0);
  assert.equal(state.camera.quatX, 0.1);
  assert.equal(state.camera.quatY, -0.2);
  assert.equal(state.camera.quatZ, 0.05);
  assert.equal(state.camera.quatW, 0.97);
  assert.equal(state.camera.displayFov, 52);
  assert.equal(state.camera.displayNear, 1.5);
  assert.equal(state.camera.displayFar, 14000);
  // Junk fields fold nothing new; absent keys leave the record alone.
  assert.equal(applyLaneCameraFrame(state, { eyeX: 'x', quatW: NaN, viewKind: 7 }), false);
  assert.equal(state.camera.eyeX, -58, 'a junk frame cannot clobber the landed pose');
  assert.equal(laneCameraFramePayload(null), null, 'no camera record ships a null payload');
});

test('RC-FELT: floating origin — the transported focus converts with ITS frame\'s origin', () => {
  // Review-4 finding 1: seed 4242, world.frameOrigin (2000,-2000), the player
  // near it. The rig's settled look-at is FRAME-LOCAL (~0,0 in that frame);
  // shipped as if galactic-global it put the worker's projector 2000 WU off —
  // onScreen:false/behind:true for a centered hull, 0 moments vs 1 expected.
  // The envelope now carries that displayed frame's own origin and the worker
  // converts with it — never with its live origin, which can have hopped on.
  const viewport = { width: 1280, height: 720 };
  const origin = { x: 2000, z: -2000 };
  const main = createGameState(4242);
  main.mode = 'flight';
  main.playerId = 1;
  main.entities.set(1, {
    id: 1, type: 'ship',
    pos: { x: 2000, z: -2000 }, prevPos: { x: 2000, z: -2000 },
    vel: { x: 0, z: 0 }, rot: 0, radius: 6,
  });
  main.entityList = [main.entities.get(1)];
  main.world.frameOrigin = { ...origin };
  const rig = createChaseCamera(main, { innerWidth: 1280, innerHeight: 720 });
  rig.snapToPlayer();
  for (let i = 0; i < 300; i++) rig.follow(1 / 60, 1);
  rig.obj.updateMatrixWorld(true);
  assert.ok(Math.abs(main.camera.focus.x) < 200 && Math.abs(main.camera.focus.z) < 200,
    `the settled look-at is frame-local, not 2000-scale galactic — got (${main.camera.focus.x},${main.camera.focus.z})`);
  assert.equal(main.camera.frameOriginX, 2000, 'the displayed frame\'s origin is stamped');
  assert.equal(main.camera.frameOriginZ, -2000);

  // The worker's sim is the same run — its own origin also reads (2000,-2000) —
  // and the envelope lands verbatim through the shared applier.
  const worker = createGameState(4242);
  worker.mode = 'flight';
  worker.playerId = 1;
  worker.entities.set(1, {
    id: 1, type: 'ship', pos: { x: 2000, z: -2000 }, vel: { x: 0, z: 0 }, radius: 6,
  });
  worker.world.frameOrigin = { ...origin };
  applyLaneCameraFrame(worker, laneCameraFramePayload(main.camera, 1280 / 720));
  const framing = tableChaseFraming(worker, viewport);
  assert.ok(Math.abs(framing.focusX - (main.camera.focus.x + origin.x)) < 1e-9
    && Math.abs(framing.focusZ - (main.camera.focus.z + origin.z)) < 1e-9,
    `local look-at (${main.camera.focus.x},${main.camera.focus.z}) converted to galactic-global `
    + `with the shipped origin — got (${framing.focusX},${framing.focusZ})`);
  const point = worker.entities.get(1).pos;
  const real = new THREE.Vector3(point.x - origin.x, 0, point.z - origin.z).project(rig.obj);
  const proj = tableWorldToScreen(worker, viewport, point);
  assert.equal(proj.onScreen, true, 'the worker sees the centered hull like the real rig');
  assert.equal(proj.behind, false);
  assert.ok(Math.abs(proj.ndcX - real.x) < 1e-6 && Math.abs(proj.ndcY - real.y) < 1e-6,
    `worker NDC (${proj.ndcX},${proj.ndcY}) matches the real rig (${real.x},${real.y})`);

  // Through the detector: the qualifying receipt at the hull admits the moment —
  // the review's reproduction emitted 0 before the conversion existed.
  const bus = createBus();
  const effects = createTimeEffects(worker);
  const bt = Object.create(bulletTime);
  bt.init({
    state: worker, bus, timeEffects: effects,
    helpers: { worldToScreen: (p, o) => tableWorldToScreen(worker, viewport, p, o) },
  });
  try {
    worker.tick = 100;
    worker.simTime = 100 / 60;
    worker.settings.gameplay.stuntMoments = 'cinematic';
    worker.entities.set(2, { id: 2, pos: { x: 2000, z: -1988 }, radius: 6 });
    let moments = 0;
    bus.on(MOMENT_EVENT, () => moments++);
    bus.emit('stunt:trickDetected', {
      trickId: 'one_two', name: 'one_two', rarity: 'rare',
      actorId: 1, targetId: null, secondaryIds: [2],
      episodeId: 'r4:origin', rootId: 'r4:origin', rootTick: 80, tick: 100,
      causeChain: [
        { kind: 'impulse', pos: { ...worker.entities.get(2).pos } },
        { kind: 'contact', pos: { x: point.x, z: point.z } },
      ],
      consequence: { killed: true }, sourceRadius: 6,
      metrics: { availableMomentum: 1500, referenceMomentum: 400 },
      modifiers: { collateralCount: 1 },
      terminalPos: { x: point.x, z: point.z },
    });
    assert.equal(moments, 1, 'the converted envelope admits the on-glass moment');
  } finally {
    bt.destroy();
    bus.clear();
  }
});

test('RC-FELT: racing view — the transported pose projects the stern frame exactly', () => {
  // Review-4 finding 2: steeringView='racing', stationary player at (0,0),
  // yaw 0, camera settled 300 frames. Point (-40,0) projects to real NDC y
  // -1.643649 — OFF the glass — while the top-down derivation answered
  // on-screen and the detector admitted a phantom moment + 0.8 timeScale.
  // The displayed pose now transports and the worker runs the same
  // perspective transform Three's project() runs.
  const viewport = { width: 1280, height: 720 };
  const main = createGameState(4242);
  main.mode = 'flight';
  main.playerId = 1;
  main.entities.set(1, {
    id: 1, type: 'ship', pos: { x: 0, z: 0 }, prevPos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 }, rot: 0, radius: 6,
  });
  main.entityList = [main.entities.get(1)];
  main.settings.gameplay.steeringView = 'racing';
  const rig = createChaseCamera(main, { innerWidth: 1280, innerHeight: 720 });
  rig.snapToPlayer();
  for (let i = 0; i < 300; i++) rig.follow(1 / 60, 1);
  rig.obj.updateMatrixWorld(true);
  assert.equal(main.camera.viewKind, 'racing', 'the rig settled into the stern view');
  assert.ok(main.camera.viewMix > 0.999, `the racing blend settled — got ${main.camera.viewMix}`);

  const worker = createGameState(4242);
  worker.mode = 'flight';
  worker.playerId = 1;
  worker.entities.set(1, {
    id: 1, type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 6,
  });
  applyLaneCameraFrame(worker, laneCameraFramePayload(main.camera, 1280 / 720));
  const framing = tableChaseFraming(worker, viewport);
  assert.equal(framing.poseReady, true, 'a complete displayed pose upgrades the projector');
  assert.equal(framing.viewKind, 'racing');

  let onScreenPoint = null;
  for (const point of [{ x: -40, z: 0 }, { x: 0, z: 60 }, { x: 100, z: 0 }]) {
    const real = new THREE.Vector3(point.x, 0, point.z).project(rig.obj);
    const realOnScreen = Math.abs(real.x) <= 1 && Math.abs(real.y) <= 1 && real.z < 1;
    const proj = tableWorldToScreen(worker, viewport, point);
    assert.equal(proj.onScreen, realOnScreen,
      `(${point.x},${point.z}) — worker ${proj.onScreen} vs real ${realOnScreen}`);
    assert.ok(Math.abs(proj.ndcX - real.x) < 1e-6 && Math.abs(proj.ndcY - real.y) < 1e-6,
      `(${point.x},${point.z}) worker NDC (${proj.ndcX},${proj.ndcY}) vs real (${real.x},${real.y})`);
    if (realOnScreen && !onScreenPoint) onScreenPoint = point;
  }
  const offscreen = tableWorldToScreen(worker, viewport, { x: -40, z: 0 });
  assert.equal(offscreen.onScreen, false, '(-40,0) is off the racing glass like the real rig');
  assert.ok(Math.abs(offscreen.ndcY - (-1.643649)) < 1e-3,
    `worker NDC y matches the review's real −1.643649 — got ${offscreen.ndcY}`);
  assert.ok(onScreenPoint, 'the fixture has an on-screen control point');

  // Through the detector: the off-glass receipt admits nothing — no moment, no
  // phantom 0.8 slow-mo — and the on-glass control still lands.
  const bus = createBus();
  const effects = createTimeEffects(worker);
  const bt = Object.create(bulletTime);
  bt.init({
    state: worker, bus, timeEffects: effects,
    helpers: { worldToScreen: (p, o) => tableWorldToScreen(worker, viewport, p, o) },
  });
  try {
    worker.tick = 100;
    worker.simTime = 100 / 60;
    worker.settings.gameplay.stuntMoments = 'cinematic';
    worker.entities.set(2, { id: 2, pos: { x: 0, z: 0 }, radius: 6 });
    let moments = 0;
    bus.on(MOMENT_EVENT, () => moments++);
    const receipt = (id, terminal) => ({
      trickId: 'one_two', name: 'one_two', rarity: 'rare',
      actorId: 1, targetId: null, secondaryIds: [2],
      episodeId: id, rootId: id, rootTick: 80, tick: 100,
      causeChain: [
        { kind: 'impulse', pos: { ...worker.entities.get(2).pos } },
        { kind: 'contact', pos: { x: terminal.x, z: terminal.z } },
      ],
      consequence: { killed: true }, sourceRadius: 6,
      metrics: { availableMomentum: 1500, referenceMomentum: 400 },
      modifiers: { collateralCount: 1 },
      terminalPos: { x: terminal.x, z: terminal.z },
    });
    bus.emit('stunt:trickDetected', receipt('r4:stern:off', { x: -40, z: 0 }));
    assert.equal(moments, 0, 'off-screen-in-racing receipt produced no moment');
    assert.equal(worker.timeScale, 1, 'no phantom 0.8 timeScale from the phantom moment');
    bus.emit('stunt:trickDetected', receipt('r4:stern:on', onScreenPoint));
    assert.equal(moments, 1, 'an on-glass receipt in racing view still admits the moment');
  } finally {
    bt.destroy();
    bus.clear();
  }
});
