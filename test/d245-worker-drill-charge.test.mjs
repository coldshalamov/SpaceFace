import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { createRegistry } from '../src/core/registry.js';
import { installSimCommandSink, uninstallSimCommandSink } from '../src/core/simLaneCommands.js';
import { input } from '../src/systems/input.js';

// D245: bore charges were dead on the worker-sim route — the lane facade exposed only
// begin/pulseScan/end and the worker-side drillCall dispatcher dropped every charge op.
// The facade must ship drillCall descriptors for the charge verbs, and ingestLaneDomEvent
// must route them to the real drill system.

function drillFacade(state) {
  const registry = createRegistry({
    simLane: 'worker',
    state,
    bus: createBus(),
    helpers: {},
  });
  return registry.get('drill');
}

function shippedOps(msgs) {
  return msgs.filter((m) => m && m.kind === 'domEvent' && m.d && m.d.type === 'drillCall')
    .map((m) => m.d);
}

test('worker facade: arm/disarm/cycle/aim/plant ship drillCall ops with honest mirror answers', () => {
  const state = createGameState(4242);
  const msgs = [];
  const uninstall = installSimCommandSink((msg) => msgs.push(msg));
  try {
    const drill = drillFacade(state);
    assert.ok(drill && typeof drill === 'object', 'drill facade resolves under the worker lane');

    // Inactive session refuses to arm and ships nothing.
    state.drill = { active: false };
    assert.equal(drill.armCharge(), false);
    assert.equal(shippedOps(msgs).length, 0);

    // Active, unfused, uncooled session arms — one op, and the answer mirrors the gate.
    state.drill = { active: true, charge: null, chargeCooldown: 0, chargeArmed: false, chargePayload: 'blast' };
    assert.equal(drill.armCharge(), true);
    let ops = shippedOps(msgs);
    assert.equal(ops.length, 1);
    assert.deepEqual(ops[0], { type: 'drillCall', op: 'armCharge' });

    // Already-armed mirror answers true without re-shipping.
    state.drill.chargeArmed = true;
    assert.equal(drill.armCharge(), true);
    assert.equal(shippedOps(msgs).length, 1);

    // Cooling charge refuses.
    state.drill.chargeArmed = false;
    state.drill.chargeCooldown = 5;
    assert.equal(drill.armCharge(), false);
    assert.equal(shippedOps(msgs).length, 1);
    state.drill.chargeCooldown = 0;

    // Disarm mirrors the armed bit.
    state.drill.chargeArmed = true;
    assert.equal(drill.disarmCharge(), true);
    ops = shippedOps(msgs);
    assert.equal(ops.at(-1).op, 'disarmCharge');
    state.drill.chargeArmed = false;
    assert.equal(drill.disarmCharge(), false);

    // Aim ships the descriptor verbatim.
    drill.setChargeAim(4, 7);
    ops = shippedOps(msgs);
    assert.deepEqual(ops.at(-1), { type: 'drillCall', op: 'setChargeAim', col: 4, row: 7 });

    // Payload cycling ships and predicts the worker's next rack slot (blast -> shape).
    state.drill.chargeArmed = true;
    state.drill.chargePayload = 'blast';
    assert.equal(drill.cycleChargePayload(), 'shape');
    ops = shippedOps(msgs);
    assert.equal(ops.at(-1).op, 'cycleChargePayload');
    state.drill.chargePayload = 'seismic';
    assert.equal(drill.cycleChargePayload(), 'blast');
    // Disarmed mirror refuses the cycle.
    state.drill.chargeArmed = false;
    assert.equal(drill.cycleChargePayload(), null);

    // Plant ships while the session is active; the worker's own gate still owns refusal.
    state.drill.chargeArmed = true;
    assert.equal(drill.plantCharge(), true);
    ops = shippedOps(msgs);
    assert.equal(ops.at(-1).op, 'plantCharge');
    state.drill.active = false;
    assert.equal(drill.plantCharge(), false);

    // The quote preview reads the mirrored board through the read view.
    state.drill.active = false;
    const pv = drill.chargePreview();
    assert.ok(pv && pv.ok === false && pv.reason === 'inactive');
  } finally {
    uninstall();
  }
});

test('worker dispatcher: every charge drillCall op reaches the real drill system', () => {
  const calls = [];
  const fakeDrill = {
    armCharge: () => calls.push('armCharge'),
    disarmCharge: () => calls.push('disarmCharge'),
    setChargeAim: (c, r) => calls.push(`setChargeAim:${c},${r}`),
    cycleChargePayload: () => calls.push('cycleChargePayload'),
    plantCharge: () => calls.push('plantCharge'),
  };
  const prevCtx = input._inputContext;
  input._inputContext = { registry: { get: (name) => (name === 'drill' ? fakeDrill : null) } };
  try {
    for (const op of ['armCharge', 'disarmCharge', 'cycleChargePayload', 'plantCharge']) {
      input.ingestLaneDomEvent({ type: 'drillCall', op });
    }
    input.ingestLaneDomEvent({ type: 'drillCall', op: 'setChargeAim', col: 3, row: 9 });
    input.ingestLaneDomEvent({ type: 'drillCall', op: 'noSuchVerb' });
    input.ingestLaneDomEvent({ type: 'drillCall' });
    input.ingestLaneDomEvent(null);
    assert.deepEqual(calls, ['armCharge', 'disarmCharge', 'cycleChargePayload', 'plantCharge', 'setChargeAim:3,9'],
      'five charge ops dispatch in order; unknown/malformed ops drop silently');
  } finally {
    input._inputContext = prevCtx;
  }
});
