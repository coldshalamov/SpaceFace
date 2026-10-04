import assert from 'node:assert/strict';
import { test } from 'node:test';

import { queuePhysicsImpulse } from '../src/core/physicsAuthority.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';

const DT = 1 / 60;
const MAX_CONTACT_DV = 40;
const TUMBLE_MAX_CONTACT_DV = 160;

function involves(receipt, id) {
  return receipt.aId === id || receipt.bId === id;
}

function makeCraft(id, pose) {
  const radius = 6;
  const mass = 24;
  return {
    id,
    type: 'ship',
    alive: true,
    isPlayer: pose.isPlayer === true,
    radius,
    mass,
    combatSpeed: 100,
    maxSpeed: 100,
    pos: { x: pose.x, z: pose.z },
    vel: { x: pose.vx || 0, z: pose.vz || 0 },
    rot: 0,
    angVel: 0,
    physicsBody: {
      schemaVersion: 1,
      radius,
      mass,
      inertiaY: 48,
      dynamic: true,
      ccd: true,
      revision: 0,
    },
    data: { defId: 'ship_kestrel' },
  };
}

function makeRock(id, pose) {
  return {
    id,
    type: 'asteroid',
    alive: true,
    radius: 10,
    mass: 1_000_000,
    pos: { x: pose.x, z: pose.z },
    vel: { x: 0, z: 0 },
    rot: 0,
    angVel: 0,
    physicsBody: {
      schemaVersion: 1,
      radius: 10,
      mass: 1_000_000,
      inertiaY: 1_000_000,
      dynamic: false,
      ccd: false,
      revision: 0,
    },
    data: {},
  };
}

function corruptNextWorldStep(owner, writes) {
  const world = owner.world;
  const original = world.step;
  let used = false;
  world.step = (...args) => {
    original.apply(world, args);
    if (used) return;
    used = true;
    writes();
  };
  return () => { world.step = original; };
}

function injectReceipts(owner, receipts) {
  const original = owner._captureContactImpacts;
  owner._captureContactImpacts = () => receipts;
  return () => { owner._captureContactImpacts = original; };
}

function writeBody(rec, { linvel, translation, angvel }) {
  if (linvel) rec.body.setLinvel({ x: linvel[0], y: 0, z: linvel[1] }, true);
  if (translation) rec.body.setTranslation({ x: translation[0], y: 0, z: translation[1] }, true);
  if (angvel) rec.body.setAngvel({ x: 0, y: angvel, z: 0 }, true);
}

test('a numerical solver blow-up on the player recovers to the trusted pre-solve prediction', async () => {
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false, fixedDt: DT });
  try {
    const player = makeCraft(1, { isPlayer: true, x: 671, z: -226, vx: 190, vz: 60 });
    const rocks = [
      makeRock(348, { x: 900, z: -240 }),
      makeRock(333, { x: 940, z: -200 }),
      makeRock(334, { x: 980, z: -210 }),
      makeRock(350, { x: 920, z: -260 }),
    ];
    owner.syncFromEntities([player, ...rocks]);
    owner.step(DT);
    owner.drainContactImpacts();

    const rec = owner.records.get(1);
    const before = { x: player.pos.x, z: player.pos.z, rot: player.rot };

    const receipts = [
      { aId: 1, bId: 348, impulse: 1280, normal: { x: -0.879, z: 0.476 }, pos: { x: 671, z: -226 } },
      { aId: 1, bId: 333, impulse: 30, normal: { x: 0.831, z: 0.556 }, pos: { x: 671, z: -226 } },
      { aId: 1, bId: 334, impulse: 28, normal: { x: 0.659, z: 0.752 }, pos: { x: 671, z: -226 } },
      { aId: 1, bId: 350, impulse: 1400, normal: { x: 0.1, z: 0.995 }, pos: { x: 671, z: -226 } },
    ];
    const restoreReceipts = injectReceipts(owner, receipts);
    const restoreStep = corruptNextWorldStep(owner, () => {
      writeBody(owner.records.get(1), {
        linvel: [-13898139, 4957162.5],
        translation: [-591197.515625, 212502.96875],
        angvel: 248957,
      });
    });

    owner.step(DT);
    restoreStep();
    restoreReceipts();
    const impacts = owner.drainContactImpacts();

    const e = rec.expected;
    const relV = Math.hypot(e.vx, e.vz);
    const budget = MAX_CONTACT_DV + 4 * 2 * relV;
    assert.ok(Number.isFinite(player.vel.x) && Number.isFinite(player.vel.z),
      `published velocity must be finite after a solver blow-up (got ${player.vel.x},${player.vel.z})`);
    const acceptedDv = Math.hypot(player.vel.x - e.vx, player.vel.z - e.vz);
    assert.ok(acceptedDv <= budget + 1e-3,
      `accepted contact delta-V ${acceptedDv} must stay inside the multi-receipt budget ${budget}`);
    const reach = Math.hypot(player.pos.x - before.x, player.pos.z - before.z);
    assert.ok(reach <= (relV + budget) * DT + 0.5,
      `position leap ${reach.toFixed(1)} WU must stay inside one physically reachable tick`);
    assert.equal(player.rot, before.rot, 'commanded heading survives the solver spike');
    assert.ok(Math.abs(rec._lastSolverPlayerYawRateKick) > 1e5,
      `the raw solver yaw metric retains the blow-up (${rec._lastSolverPlayerYawRateKick})`);
    assert.ok(rec._lastAppliedPlayerDeltaV <= budget + 1e-3,
      `applied delta-V publishes the accepted response (${rec._lastAppliedPlayerDeltaV})`);

    const playerReceipts = impacts.filter((r) => involves(r, 1));
    assert.equal(playerReceipts.length, 4);
    const appliedSum = playerReceipts.reduce((n, r) => n + r.appliedPlayerDeltaV, 0);
    assert.ok(Math.abs(appliedSum - rec._lastAppliedPlayerDeltaV) < 1e-6,
      'receipts still sum exactly to the bounded applied delta-V');

    owner.step(DT);
    owner.drainContactImpacts();
    assert.ok(Number.isFinite(player.vel.x) && Number.isFinite(player.vel.z),
      'an ordinary step continues after the recovered tick');
  } finally {
    owner.dispose();
  }
});

test('a non-player companion body recovers its pose while its velocity stays under the generic bound', async () => {
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false, fixedDt: DT });
  try {
    const npc = makeCraft(7, { isPlayer: false, x: 600, z: -180, vx: 50, vz: 0 });
    const rock = makeRock(20, { x: 900, z: -180 });
    owner.syncFromEntities([npc, rock]);
    owner.step(DT);
    owner.drainContactImpacts();

    const before = { x: npc.pos.x, z: npc.pos.z };
    const restoreReceipts = injectReceipts(owner, [
      { aId: 7, bId: 20, impulse: 900, normal: { x: -1, z: 0 }, pos: { x: 600, z: -180 } },
    ]);
    const restoreStep = corruptNextWorldStep(owner, () => {
      writeBody(owner.records.get(7), {
        linvel: [900000, -400000],
        translation: [-900000, 300000],
      });
    });

    owner.step(DT);
    restoreStep();
    restoreReceipts();
    owner.drainContactImpacts();

    const rec = owner.records.get(7);
    const e = rec.expected;
    const relV = Math.hypot(e.vx, e.vz);
    const budget = MAX_CONTACT_DV + 2 * relV;
    const reach = Math.hypot(npc.pos.x - before.x, npc.pos.z - before.z);
    assert.ok(reach <= (relV + budget) * DT + 0.5,
      `NPC position leap ${reach.toFixed(1)} WU repaired to a reachable tick`);
    const dv = Math.hypot(npc.vel.x - e.vx, npc.vel.z - e.vz);
    const genericBound = Math.max(MAX_CONTACT_DV, relV + MAX_CONTACT_DV);
    assert.ok(dv <= genericBound + 1e-3,
      `NPC velocity still answers the ordinary contact bound (${dv} <= ${genericBound})`);
    assert.ok(Number.isFinite(npc.pos.x) && Number.isFinite(npc.pos.z));
  } finally {
    owner.dispose();
  }
});

test('a non-finite NPC response restores the queued baseline instead of dropping to zero', async () => {
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false, fixedDt: DT });
  try {
    const npc = makeCraft(7, { isPlayer: false, x: 0, z: 0, vx: 0, vz: 0 });
    const rock = makeRock(9, { x: 400, z: 0 });
    owner.syncFromEntities([npc, rock]);
    owner.step(DT);
    owner.drainContactImpacts();

    queuePhysicsImpulse(npc, { x: 24 * 900, y: 0, z: 0 });
    const restoreReceipts = injectReceipts(owner, [
      { aId: 7, bId: 9, impulse: 100, normal: { x: -1, z: 0 }, pos: { x: 0, z: 0 } },
    ]);
    const restoreStep = corruptNextWorldStep(owner, () => {
      writeBody(owner.records.get(7), {
        linvel: [NaN, NaN],
        translation: [NaN, 1e30],
      });
    });
    owner.step(DT);
    restoreStep();
    restoreReceipts();
    owner.drainContactImpacts();

    const e = owner.records.get(7).expected;
    assert.ok(Number.isFinite(npc.vel.x) && Number.isFinite(npc.vel.z),
      'a NaN solver response must never publish on a companion body');
    assert.ok(Math.abs(npc.vel.x - e.vx) < 1e-6 && Math.abs(npc.vel.z - e.vz) < 1e-6,
      `the trusted baseline survives recovery (${npc.vel.x},${npc.vel.z} vs ${e.vx},${e.vz})`);
    assert.ok(npc.vel.x > 800,
      `the queued ~900 WU/s baseline is preserved, not dropped to zero (${npc.vel.x})`);
    assert.ok(Math.abs(npc.pos.x - e.x) < 1 && Math.abs(npc.pos.z - e.z) < 1,
      'the pose stays on the predicted tick');
  } finally {
    owner.dispose();
  }
});

test('a finite solver response with no contact receipts is preserved wholesale', async () => {
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false, fixedDt: DT });
  try {
    const player = makeCraft(1, { isPlayer: true, x: 0, z: 0, vx: 0, vz: 0 });
    owner.syncFromEntities([player]);
    owner.step(DT);
    owner.drainContactImpacts();

    const restoreReceipts = injectReceipts(owner, []);
    const injectedPos = { x: 14.5, z: -3.5 };
    const restoreStep = corruptNextWorldStep(owner, () => {
      writeBody(owner.records.get(1), {
        linvel: [900, -120],
        translation: [injectedPos.x, injectedPos.z],
      });
    });

    owner.step(DT);
    restoreStep();
    restoreReceipts();
    owner.drainContactImpacts();

    assert.ok(Math.abs(player.vel.x - 900) < 1e-3 && Math.abs(player.vel.z + 120) < 1e-3,
      `a rope/earned-momentum response with no receipts is not contact work (got ${player.vel.x},${player.vel.z})`);
    assert.ok(Math.abs(player.pos.x - injectedPos.x) < 0.1
      && Math.abs(player.pos.z - injectedPos.z) < 0.1,
      'the finite solver pose stands when no receipt implicates the body');
  } finally {
    owner.dispose();
  }
});

test('a non-finite solver response recovers to the prediction even without receipts', async () => {
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false, fixedDt: DT });
  try {
    const player = makeCraft(1, { isPlayer: true, x: 40, z: 10, vx: 30, vz: -12 });
    owner.syncFromEntities([player]);
    owner.step(DT);
    owner.drainContactImpacts();

    const before = { x: player.pos.x, z: player.pos.z };
    const rec = owner.records.get(1);
    const restoreReceipts = injectReceipts(owner, []);
    const restoreStep = corruptNextWorldStep(owner, () => {
      writeBody(rec, {
        linvel: [NaN, Infinity],
        translation: [NaN, 1e30],
        angvel: NaN,
      });
    });

    owner.step(DT);
    restoreStep();
    restoreReceipts();
    owner.drainContactImpacts();

    assert.ok(Number.isFinite(player.vel.x) && Number.isFinite(player.vel.z),
      'a NaN/Infinity solver response must never publish');
    const e = rec.expected;
    assert.ok(Math.abs(player.vel.x - e.vx) < 1e-6 && Math.abs(player.vel.z - e.vz) < 1e-6,
      'non-finite contact response falls back to the trusted prediction');
    const reach = Math.hypot(player.pos.x - before.x, player.pos.z - before.z);
    assert.ok(reach <= (Math.hypot(e.vx, e.vz) + 1) * DT + 0.5,
      'the pose stays inside the predicted tick');
  } finally {
    owner.dispose();
  }
});

test('a queued impulse lands inside the trusted baseline and is not contact-clamped', async () => {
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false, fixedDt: DT });
  try {
    const player = makeCraft(1, { isPlayer: true, x: 0, z: 0, vx: 0, vz: 0 });
    const rock = makeRock(9, { x: 400, z: 0 });
    owner.syncFromEntities([player, rock]);
    owner.step(DT);
    owner.drainContactImpacts();

    queuePhysicsImpulse(player, { x: 24 * 900, y: 0, z: 0 });
    const restoreReceipts = injectReceipts(owner, [
      { aId: 1, bId: 9, impulse: 100, normal: { x: -1, z: 0 }, pos: { x: 0, z: 0 } },
    ]);
    owner.step(DT);
    restoreReceipts();
    owner.drainContactImpacts();

    assert.ok(Math.abs(player.vel.x - 900) < 5,
      `a queued 900 WU/s impulse is baseline momentum, not solver contact (${player.vel.x})`);
    assert.ok(player.pos.x > 5,
      'the body actually travelled on the impulse inside the same tick');
  } finally {
    owner.dispose();
  }
});

test('a combined multi-contact budget admits a full elastic reversal but not an impossible leap', async () => {
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false, fixedDt: DT });
  try {
    const player = makeCraft(1, { isPlayer: true, x: 0, z: 0, vx: 200, vz: 0 });
    const mover = makeCraft(8, { isPlayer: false, x: 500, z: 200, vx: 300, vz: 0 });
    const rock = makeRock(9, { x: 600, z: 0 });
    owner.syncFromEntities([player, mover, rock]);
    owner.step(DT);
    owner.drainContactImpacts();

    const rec = owner.records.get(1);
    const relToMover = Math.hypot(200 - 300, 0);
    const relToRock = Math.hypot(200 - 0, 0);
    const budget = MAX_CONTACT_DV + 2 * (relToMover + relToRock);

    const injectedPos = { x: 3.9, z: 0.1 };
    const restoreReceipts = injectReceipts(owner, [
      { aId: 1, bId: 8, impulse: 800, normal: { x: 1, z: 0 }, pos: { x: 3, z: 0 } },
      { aId: 1, bId: 9, impulse: 1200, normal: { x: 1, z: 0 }, pos: { x: 3, z: 0 } },
    ]);
    const restoreStep = corruptNextWorldStep(owner, () => {
      writeBody(rec, {
        linvel: [-200, 0],
        translation: [injectedPos.x, injectedPos.z],
      });
    });
    owner.step(DT);
    restoreStep();
    restoreReceipts();
    owner.drainContactImpacts();

    assert.ok(Math.abs(player.vel.x + 200) < 1e-3,
      `a 200 -> -200 full reversal fits the combined budget ${budget} and is preserved`);
    assert.ok(Math.abs(player.pos.x - injectedPos.x) < 0.2,
      'an in-budget finite response keeps the solver pose, depenetration included');
    assert.ok(Math.abs(rec._lastAppliedPlayerDeltaV - 400) < 1e-2,
      'applied metrics publish the real accepted reversal');
  } finally {
    owner.dispose();
  }
});

test('a tumble-class contact keeps the raised bound inside the sanity budget', async () => {
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false, fixedDt: DT });
  try {
    const npc = makeCraft(7, { isPlayer: false, x: 0, z: 0, vx: 120, vz: 0 });
    const rock = makeRock(9, { x: 300, z: 0 });
    owner.syncFromEntities([npc, rock]);
    owner.step(DT);
    owner.drainContactImpacts();

    const rec = owner.records.get(7);
    rec._tumbling = true;
    const injectedPos = { x: 6.2, z: 0.3 };
    const restoreReceipts = injectReceipts(owner, [
      { aId: 7, bId: 9, impulse: 900, normal: { x: 1, z: 0 }, pos: { x: 6, z: 0 } },
    ]);
    const restoreStep = corruptNextWorldStep(owner, () => {
      writeBody(rec, {
        linvel: [-240, 40],
        translation: [injectedPos.x, injectedPos.z],
      });
    });
    owner.step(DT);
    restoreStep();
    restoreReceipts();
    owner.drainContactImpacts();

    const genericBound = Math.max(TUMBLE_MAX_CONTACT_DV, 120 + TUMBLE_MAX_CONTACT_DV);
    const dv = Math.hypot(npc.vel.x - 120, npc.vel.z - 0);
    assert.ok(dv <= genericBound + 1e-3,
      `a tumbling ricochet stays inside the raised generic bound (${dv} <= ${genericBound})`);
    assert.ok(Math.hypot(npc.pos.x, npc.pos.z) < 20,
      'a tumbling hull still answers the impossible-pose guard');
  } finally {
    owner.dispose();
  }
});
