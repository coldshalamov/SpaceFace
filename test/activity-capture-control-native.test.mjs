import assert from 'node:assert/strict';
import test from 'node:test';
import { createSimulation } from '../src/core/sim.js';
import { aiPorts } from '../src/systems/aiPorts.js';
import { setEntityDoctrine } from '../src/ai/doctrine.js';
function setup() {
  const sim = createSimulation({
    systems: [aiPorts]
  });
  const e = sim.spawn({
    type: 'ship',
    team: 1,
    pos: {
      x: 0,
      z: 0
    },
    hull: 100,
    data: {
      ai: {
        passive: true
      }
    }
  });
  const ai = setEntityDoctrine(e, {
    activity: {
      kind: 'flee',
      reason: 'test:owned',
      anchor: {
        x: 100,
        z: 0
      }
    },
    roe: 'hold_fire'
  });
  return {
    sim,
    e,
    ai,
    port: sim.helpers.aiManeuver
  };
}
test('capture closure is single-use and callback failure cannot escape committed boundary', () => {
  const h = setup();
  try {
    let calls = 0;
    h.port.claimActivity(h.e, h.ai.activity, {
      onCapture: () => {
        calls++;
        throw Error('expected callback failure');
      }
    });
    const release = h.port.captureActivity(h.e);
    assert.equal(typeof release, 'function');
    assert.doesNotThrow(() => assert.equal(release(), false));
    assert.equal(release(), false);
    assert.equal(calls, 1);
    assert.equal(h.port.captureActivity(h.e), null);
  } finally {
    h.sim.dispose();
  }
});
for (const kind of ['ai', 'activity', 'lease', 'body', 'occupant']) test('snapshot release preserves foreign successor: ' + kind, () => {
  const h = setup();
  try {
    let calls = 0;
    h.port.claimActivity(h.e, h.ai.activity, {
      onCapture: () => calls++
    });
    const release = h.port.captureActivity(h.e);
    if (kind === 'ai') h.e.data.ai = {
      ...h.ai
    };
    if (kind === 'activity') h.ai.activity = {
      ...h.ai.activity,
      reason: 'foreign'
    };
    if (kind === 'lease') h.port.claimActivity(h.e, h.ai.activity, {
      onCapture: () => calls += 100
    });
    if (kind === 'body') h.e.physicsBody = {
      ...h.e.physicsBody
    };
    if (kind === 'occupant') h.sim.state.entities.set(h.e.id, {
      ...h.e
    });
    const before = JSON.stringify(h.e.data);
    release();
    assert.equal(calls, 0);
    assert.equal(JSON.stringify(h.e.data), before);
    if (kind === 'lease') {
      const foreign = h.port.captureActivity(h.e);
      assert.equal(typeof foreign, 'function');
      foreign();
      assert.equal(calls, 100);
    }
  } finally {
    h.sim.dispose();
  }
});
import { cargo } from '../src/systems/cargo.js';
import { bootRealPath } from '../scripts/lib/bench/realPath.mjs';
import { captureAndTransfer } from '../src/systems/shipControlTransfer.js';
import { AI_CONTRACT_VERSION } from '../src/ai/contracts.js';
import { writePhysicsControl, queuePhysicsImpulse, consumePhysicsCommand } from '../src/core/physicsAuthority.js';
for (const kind of ['normal', 'throw_from', 'failed_admission']) test('canonical helm capture preserves commit and cleanup: ' + kind, async () => {
  const h = await bootRealPath({
    seed: 4242,
    systems: ['aiPorts', 'physics', cargo],
    hulls: [{
      hullId: 'ship_wasp',
      isPlayer: true,
      pos: {
        x: 0,
        z: 0
      }
    }, {
      hullId: 'ship_hornet',
      pos: {
        x: 60,
        z: 0
      }
    }]
  });
  try {
    h.step(1);
    const from = h.hulls[0],
      to = h.hulls[1];
    h.assertBodies([from, to]);
    const ports = h.runtime.getSystem('aiPorts'),
      port = ports.helpers.aiManeuver;
    to.data.vesselId = 'camp:target';
    to.data.shipjackGeneration = 1;
    from.data.vesselId = 'camp:player';
    h.state.run = {
      kind: 'adventure'
    };
    h.state.player.ownedShips = [{
      defId: 'ship_wasp',
      vesselId: from.data.vesselId,
      fittings: [],
      fittedInstances: {}
    }];
    h.state.player.activeShipIndex = 0;
    let fromCalls = 0,
      toCalls = 0,
      freightCalls = 0,
      events = 0;
    for (const e of [from, to]) {
      e.data.ai ||= {};
      e.data.ai.activity = {
        kind: 'transit',
        reason: 'camp:lease'
      };
    }
    port.claimActivity(from, from.data.ai.activity, {
      onCapture: () => {
        fromCalls++;
        if (kind === 'throw_from') throw Error('expected cleanup failure');
        from.data.ai.activity = null;
      }
    });
    port.claimActivity(to, to.data.ai.activity, {
      onCapture: () => {
        toCalls++;
        to.data.ai.activity = null;
      }
    });
    ports.helpers.captureEncounterFreightControl = () => () => freightCalls++;
    h.bus.on('ship:controlChanging', () => {
      events++;
      assert.equal(fromCalls, 1);
      assert.equal(toCalls, 1);
      assert.equal(to.data.ai.activity, null);
    });
    assert.equal(h.withFeatures(() => port.request({
      version: AI_CONTRACT_VERSION,
      entityId: to.id,
      tick: h.state.tick,
      kind: 'transit',
      forceLocal: {
        forward: 1,
        right: 0
      },
      torqueYaw: 0,
      reason: 'camp:lease'
    })), true);
    const owner = {
      state: h.state,
      bus: h.bus,
      helpers: ports.helpers,
      validateTransferFittings: () => true,
      nextInstanceId: () => 'camp:instance',
      getTransferCargoCapacity: () => 100,
      recomputeEntity() {},
      publishActiveRoleContext() {}
    };
    const result = captureAndTransfer(owner, {
      targetId: to.id,
      targetGeneration: kind === 'failed_admission' ? 0 : 1,
      vesselId: to.data.vesselId,
      operationId: 'camp:capture'
    });
    if (kind === 'failed_admission') {
      assert.equal(result.ok, false);
      assert.equal(fromCalls, 0);
      assert.equal(toCalls, 0);
      assert.equal(freightCalls, 0);
      assert.equal(events, 0);
      assert.equal(typeof port.captureActivity(to), 'function');
    } else {
      assert.equal(result.ok, true, JSON.stringify(result));
      assert.equal(fromCalls, 1);
      assert.equal(toCalls, 1);
      assert.equal(freightCalls, 2);
      assert.equal(events, 1);
      h.withFeatures(() => ports.update(1 / 60, h.state));
      const command = consumePhysicsCommand(to);
      assert.equal(Math.hypot(command?.control?.force?.x || 0, command?.control?.force?.z || 0), 0);
      assert.equal(h.state.playerId, to.id);
    }
    console.log(JSON.stringify({
      kind,
      result,
      fromCalls,
      toCalls,
      freightCalls,
      events
    }));
  } finally {
    h.dispose();
  }
});
test('capture cancels only its receipt and preserves foreign control and queued impulse', async () => {
  const h = await bootRealPath({
    seed: 4242,
    systems: ['aiPorts', 'physics'],
    hulls: [{
      hullId: 'ship_wasp',
      isPlayer: true,
      pos: {
        x: 0,
        z: 0
      }
    }, {
      hullId: 'ship_hornet',
      pos: {
        x: 60,
        z: 0
      }
    }]
  });
  try {
    h.step(1);
    const e = h.hulls[1],
      ports = h.runtime.getSystem('aiPorts'),
      port = ports.helpers.aiManeuver;
    e.data.ai ||= {};
    e.data.ai.activity = {
      kind: 'transit',
      reason: 'camp:lease'
    };
    let calls = 0;
    port.claimActivity(e, e.data.ai.activity, {
      onCapture: () => calls++
    });
    assert.equal(h.withFeatures(() => port.request({
      version: AI_CONTRACT_VERSION,
      entityId: e.id,
      tick: h.state.tick,
      kind: 'transit',
      forceLocal: {
        forward: 1,
        right: 0
      },
      torqueYaw: 0,
      reason: 'camp:lease'
    })), true);
    h.withFeatures(() => ports.update(1 / 60, h.state));
    const release = port.captureActivity(e);
    e.data.ai.activity = {
      kind: 'transit',
      reason: 'foreign'
    };
    writePhysicsControl(e, {
      force: {
        x: 123,
        z: 456
      },
      torqueYaw: 7
    });
    queuePhysicsImpulse(e, {
      x: 11,
      z: 13
    });
    assert.equal(release(), true);
    assert.equal(calls, 0);
    const command = consumePhysicsCommand(e);
    assert.equal(command.control.force.x, 123);
    assert.equal(command.control.force.z, 456);
    assert.ok(command.impulses.some(v => v.x === 11 && v.z === 13));
    assert.equal(e.data.ai.activity.reason, 'foreign');
  } finally {
    h.dispose();
  }
});
