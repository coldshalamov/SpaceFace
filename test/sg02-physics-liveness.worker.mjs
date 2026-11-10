import { parentPort } from 'node:worker_threads';

import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import {
  queuePhysicsTorqueImpulse,
  writePhysicsControl,
} from '../src/core/physicsAuthority.js';

function makeEntity(id, { isPlayer = false, angVel = 0, material = 'rock', type = 'asteroid' } = {}) {
  const entity = {
    id,
    type,
    alive: true,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    angVel,
    radius: 8,
    mass: 40,
    physicsBody: {
      mass: 40,
      inertiaY: 320,
      radius: 8,
      shape: 'ball',
      dynamic: true,
      material,
      ccd: false,
    },
  };
  if (isPlayer) entity.isPlayer = true;
  return entity;
}

async function ownerWith(entity) {
  const owner = await createSg02DynamicBodyOwner();
  owner.syncFromEntities([entity]);
  return owner;
}

const OPS = {
  async stepAngvel({ angVel, isPlayer }) {
    const entity = makeEntity('e1', { angVel, isPlayer: isPlayer === true });
    const owner = await ownerWith(entity);
    const rec = owner.records.get('e1');
    const preY = rec.body.angvel().y;
    const diag = owner.step(owner.fixedDt);
    const post = rec.body.angvel();
    return {
      tick: diag.tick,
      preY,
      postY: post.y,
      postX: post.x,
      postZ: post.z,
      angVel: entity.angVel,
      rot: entity.rot,
      ceilingFlag: rec._playerYawCeilingApplied === true,
    };
  },
  async syncAngvel({ angVel }) {
    const entity = makeEntity('e1', { angVel });
    const owner = await ownerWith(entity);
    const w = owner.records.get('e1').body.angvel();
    return { y: w.y };
  },
  async resyncAngvel({ angVel }) {
    const entity = makeEntity('e1', { angVel: 0 });
    const owner = await ownerWith(entity);
    entity.angVel = angVel;
    owner.syncFromEntities([entity]);
    const w = owner.records.get('e1').body.angvel();
    return { y: w.y };
  },
  async pooledReuse({ angVel }) {
    const owner = await createSg02DynamicBodyOwner();
    const first = makeEntity('p1', { type: 'projectile', material: 'projectile', angVel: 0 });
    first.data = {};
    owner.syncFromEntities([first]);
    const firstBody = owner.records.get('p1').body;
    owner.syncFromEntities([]);
    const second = makeEntity('p2', { type: 'projectile', material: 'projectile', angVel });
    second.data = {};
    owner.syncFromEntities([second]);
    const rec = owner.records.get('p2');
    const w = rec.body.angvel();
    return { reused: rec.body === firstBody, y: w.y };
  },
  async rawOverride({ value, isPlayer, axis }) {
    const entity = makeEntity('e1', { angVel: 0, isPlayer: isPlayer === true });
    const owner = await ownerWith(entity);
    const rec = owner.records.get('e1');
    const write = { x: 0, y: 0, z: 0 };
    if (axis === 'x' || axis === 'both') write.x = value;
    if (axis === 'z' || axis === 'both') write.z = value;
    if (axis === undefined || axis === 'y' || axis === 'both') write.y = value;
    rec.body.setAngvel(write, true);
    const before = rec.body.angvel();
    const atStep = [];
    const rawStep = owner.world.step.bind(owner.world);
    owner.world.step = (...args) => {
      const w = rec.body.angvel();
      atStep.push({ x: w.x, y: w.y, z: w.z });
      return rawStep(...args);
    };
    owner.step(owner.fixedDt);
    const after = rec.body.angvel();
    return {
      beforeX: before.x,
      beforeY: before.y,
      beforeZ: before.z,
      atStep,
      afterX: after.x,
      afterY: after.y,
      afterZ: after.z,
      angVel: entity.angVel,
      rot: entity.rot,
      ceilingFlag: rec._playerYawCeilingApplied === true,
    };
  },
  async torqueImpulse({ value }) {
    const entity = makeEntity('e1', { angVel: 0 });
    const owner = await ownerWith(entity);
    queuePhysicsTorqueImpulse(entity, { x: 0, y: value, z: 0 });
    owner.step(owner.fixedDt);
    const rec = owner.records.get('e1');
    return {
      bodyY: rec.body.angvel().y,
      angVel: entity.angVel,
      rot: entity.rot,
    };
  },
  async controlTorque({ value }) {
    const entity = makeEntity('e1', { angVel: 0 });
    const owner = await ownerWith(entity);
    writePhysicsControl(entity, {
      mode: 'helm',
      force: { x: 0, y: 0, z: 0 },
      torque: { x: 0, y: value, z: 0 },
    });
    owner.step(owner.fixedDt);
    const rec = owner.records.get('e1');
    return {
      appliedY: rec.appliedTorque.y,
      controlY: rec.controlTorque.y,
      bodyY: rec.body.angvel().y,
      angVel: entity.angVel,
      rot: entity.rot,
    };
  },
  async controlTorqueRepeat({ value, steps }) {
    const entity = makeEntity('e1', { angVel: 0 });
    const owner = await ownerWith(entity);
    const rec = owner.records.get('e1');
    let last;
    for (let i = 0; i < steps; i++) {
      writePhysicsControl(entity, {
        mode: 'helm',
        force: { x: 0, y: 0, z: 0 },
        torque: { x: 0, y: value, z: 0 },
      });
      owner.step(owner.fixedDt);
      last = { appliedY: rec.appliedTorque.y, bodyY: rec.body.angvel().y, angVel: entity.angVel };
    }
    return last;
  },
  async stepGuard({ fixedDt, accumulator, dt }) {
    const entity = makeEntity('e1', { angVel: 2 });
    const owner = await ownerWith(entity);
    if (fixedDt !== undefined && fixedDt !== null) owner.fixedDt = fixedDt;
    if (accumulator !== undefined && accumulator !== null) owner.accumulator = accumulator;
    const tickBefore = owner.tick;
    const accBefore = owner.accumulator;
    try {
      owner.step(dt == null ? owner.fixedDt : dt);
      return {
        threw: null,
        tickBefore,
        tick: owner.tick,
        accBefore,
        accumulator: owner.accumulator,
        angVel: entity.angVel,
      };
    } catch (err) {
      return {
        threw: err && err.name,
        message: String((err && err.message) || err),
        tickBefore,
        tick: owner.tick,
        accBefore,
        accumulator: owner.accumulator,
        angVel: entity.angVel,
      };
    }
  },
  async restoreAfterGuard() {
    const entity = makeEntity('e1', { angVel: 2 });
    const owner = await ownerWith(entity);
    owner.fixedDt = 0;
    let threw = null;
    try {
      owner.step(1 / 60);
    } catch (err) {
      threw = err && err.name;
    }
    owner.fixedDt = 1 / 60;
    const diag = owner.step(1 / 60);
    return { threw, tick: diag.tick, angVel: entity.angVel };
  },
};

const wasmWarm = createSg02DynamicBodyOwner().then((owner) => owner.dispose());

parentPort.once('message', (msg) => {
  Promise.resolve(wasmWarm).then(
    () => parentPort.postMessage({ type: 'ready' }),
    (err) => parentPort.postMessage({
      type: 'ready',
      wasmError: String((err && err.message) || err),
    }),
  );
  const op = OPS[msg && msg.op];
  if (!op) {
    parentPort.postMessage({ type: 'done', error: { name: 'Error', message: `unknown op ${msg && msg.op}` } });
    return;
  }
  Promise.resolve()
    .then(() => op(msg))
    .then(
      (result) => parentPort.postMessage({ type: 'done', result }),
      (err) => parentPort.postMessage({
        type: 'done',
        error: { name: err && err.name, message: String((err && err.message) || err) },
      }),
    );
});
