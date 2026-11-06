import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { FIELD_FLAGS } from '../src/data/fields.js';
import { fields } from '../src/systems/fields.js';
import { gyreSnare } from '../src/systems/gyreSnare.js';
import { readRailModel } from '../src/ui/powerRail.js';
import {
  applyDomainPathUpdate,
  configureDomainMirroring,
  createDomainDiffer,
} from '../scripts/lib/simReadModel.mjs';

function makeTransport(state) {
  configureDomainMirroring({});
  const differ = createDomainDiffer();
  const domains = new Map();
  const touched = new Set();
  const facade = {
    entities: state.entities,
    player: state.player,
    playerId: state.playerId,
    input: state.input,
    run: state.run,
    planet: state.planet,
    world: state.world,
    bombs: state.bombs,
  };

  return {
    facade,
    land(tick) {
      const reply = differ.diff(state, tick);
      for (const update of reply.updates) {
        const segs = update.segs.length === 1 && update.segs[0].includes('.')
          ? update.segs[0].split('.') : update.segs;
        touched.clear();
        applyDomainPathUpdate(domains, { ...update, segs }, touched);
        facade[segs[0]] = domains.get(segs[0]);
      }
      return reply.updates;
    },
  };
}

function playerEntity() {
  return {
    id: 1, type: 'ship', team: 0, alive: true,
    pos: { x: 120, z: 45 }, vel: { x: 0, z: 0 }, rot: 0,
    cap: 500, hull: 100, hullMax: 100, flags: {}, data: {},
    radius: 12, mass: 40,
  };
}

test('worker field and Gyre readouts reach the main power rail and clear on owner lifecycle', () => {
  const priorFieldFlag = FIELD_FLAGS.enabled;
  FIELD_FLAGS.enabled = true;

  const state = {
    mode: 'flight', tick: 1, simTime: 1, playerId: 1, nextEntityId: 2,
    player: { credits: 0, cargo: {}, massSeed: {}, tether: { active: false } },
    entities: new Map(), entityList: [],
    input: { actions: {} }, ui: {},
    world: { currentSectorId: 'helios_core' }, run: null,
  };
  const player = playerEntity();
  state.entities.set(player.id, player);
  state.entityList.push(player);

  const bus = createBus();
  const helpers = {
    queryRadius(_center, _radius, out) { out.length = 0; return out; },
    spawnEntity(spec) {
      const entity = {
        ...spec, id: spec.id ?? state.nextEntityId++, alive: true,
        flags: {}, data: { ...(spec.data || {}) },
        pos: { ...(spec.pos || {}) }, vel: { ...(spec.vel || {}) },
      };
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      return entity;
    },
  };

  try {
    fields.init({ state, bus, helpers, registry: { get: () => null } });
    gyreSnare.init({ state, bus, helpers, registry: { get: () => null } });

    // These are the registered owners' normal input/publish entry points. They
    // create the field records and cooldowns, and the Gyre's published phase.
    state.input.actions = { deployWell: true, deployRepulsor: true, toggleClearingCone: true };
    fields.update(1 / 60, state);
    state.input.actions = { gyreSnare: true };
    gyreSnare.update(1 / 60, state);

    const transport = makeTransport(state);
    transport.land(state.tick);
    const view = readRailModel(transport.facade, state.simTime);

    assert.equal(transport.facade.fields.cooldowns.well, state.fields.cooldowns.well);
    assert.equal(transport.facade.fields.cooldowns.repulsor, state.fields.cooldowns.repulsor);
    assert.ok(transport.facade.fields.cooldowns.well > state.simTime);
    assert.ok(transport.facade.fields.cooldowns.repulsor > state.simTime);
    assert.equal(view[1].state, 'cooling');
    assert.equal(view[2].state, 'cooling');
    assert.equal(transport.facade.fields.coneActive, true);
    assert.equal(view[5].state, 'armed');
    assert.ok(Object.values(transport.facade.fields.deployed).some((row) => row.kind === 'well' && row.emitterId != null));
    assert.equal(transport.facade.gyreSnare.phase, 'beaming');
    assert.equal(view[7].state, 'armed');

    // A real Gyre owner entry point adopts, tracks and publishes a launched body;
    // the HUD status uses the current published count even after the beam closes.
    const ball = {
      id: state.nextEntityId++, type: 'rock', alive: true,
      pos: { x: 150, z: 45 }, vel: { x: 1, z: 0 }, rot: 0, angVel: 0,
      radius: 5, mass: 20, flags: {}, data: {}, physicsBody: {},
    };
    state.entities.set(ball.id, ball);
    state.entityList.push(ball);
    gyreSnare.adoptThrownAggregate(ball, { mass: 20, radius: 5, members: [] });
    state.input.actions = {};
    state.tick++;
    state.simTime += 1 / 60;
    gyreSnare.update(1 / 60, state);
    transport.land(state.tick);
    assert.equal(transport.facade.gyreSnare.liveBalls, 1);
    assert.equal(readRailModel(transport.facade, state.simTime)[7].state, 'ready');

    // The owners publish their own reset/retirement state. No main-side clearing
    // is simulated here: the next normal diff must carry the reset projections.
    bus.emit('game:new');
    bus.emit('game:newGame');
    ball.alive = false;
    state.tick++;
    state.simTime += 1 / 60;
    state.input.actions = {};
    fields.update(1 / 60, state);
    gyreSnare.update(1 / 60, state);
    transport.land(state.tick);

    const cleared = readRailModel(transport.facade, state.simTime);
    assert.deepEqual(transport.facade.fields.deployed, {});
    assert.equal(transport.facade.fields.cooldowns.well, 0);
    assert.equal(transport.facade.fields.cooldowns.repulsor, 0);
    assert.equal(transport.facade.fields.coneActive, false);
    assert.equal(cleared[1].state, 'ready');
    assert.equal(cleared[2].state, 'ready');
    assert.equal(cleared[5].state, 'ready');
    assert.equal(transport.facade.gyreSnare.phase, 'off');
    assert.equal(transport.facade.gyreSnare.liveBalls, 0);

    // The transport carries presentation records, not field-owner internals.
    assert.equal(Object.hasOwn(transport.facade.fields, 'anchored'), false);
    assert.equal(Object.hasOwn(transport.facade.fields, 'npcFields'), false);
    assert.equal(Object.hasOwn(transport.facade.fields, 'hitches'), false);
  } finally {
    gyreSnare.destroy();
    for (const unsubscribe of fields._lifecycleUnsubs || []) unsubscribe();
    fields._lifecycleUnsubs = [];
    FIELD_FLAGS.enabled = priorFieldFlag;
  }
});
