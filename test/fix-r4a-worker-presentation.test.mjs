import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createGameState } from '../src/core/gameState.js';
import { createSimLaneRuntime } from '../src/core/simLaneMain.js';
import { createBus } from '../src/core/eventBus.js';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { createThreatHalo } from '../src/ui/threatHalo.js';
import { MINE_ARM_DELAY_S } from '../src/systems/mines.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { laneDomEvent } from '../src/core/simLaneCommands.js';
import * as THREE from 'three';
import { ActionVfx } from '../src/render/actionVfx.js';

async function workerLane(t) {
  const scenarioContract = JSON.parse(readFileSync(
    new URL('../src/data/scenarios/47a.scenario.json', import.meta.url), 'utf8',
  ));
  const worker = createSimHost();
  let deliver;
  let pendingTick;
  const channelFactory = () => ({
    post(message) {
      if (message.kind === 'shutdown') return worker.shutdown();
      const operation = message.kind === 'init'
        ? worker.init({ ...message, scenarioContract })
        : worker.tick(message);
      Promise.resolve(operation).then((reply) => {
        const envelope = structuredClone({
          kind: message.kind === 'init' ? 'ready' : 'tickDone', seq: message.seq, ...reply,
        });
        deliver(envelope);
        if (message.kind === 'tick' && message.steps > 0 && pendingTick) {
          const pending = pendingTick;
          pendingTick = null;
          pending.resolve(envelope);
        }
      }, (error) => {
        deliver({ kind: 'error', seq: message.seq, message: String(error?.message || error) });
        if (pendingTick) {
          const pending = pendingTick;
          pendingTick = null;
          pending.reject(error);
        }
      });
    },
    onMessage(callback) { deliver = callback; },
    terminate() { worker.shutdown(); },
  });
  const state = createGameState(4242);
  const bus = createBus();
  const lane = createSimLaneRuntime({
    state, registry: {}, bus,
    flags: { lane: 'worker', warnings: [], sab: false }, channelFactory,
  });
  t.after(() => { lane.close(); worker.shutdown(); });
  await lane.readyPromise;
  return {
    state, worker, lane, bus,
    tick: () => new Promise((resolve, reject) => {
      pendingTick = { resolve, reject };
      lane.runner.stepOnce();
    }),
  };
}

function mockDocument() {
  const elements = [];
  const fakeElement = (tag) => {
    const el = {
      tagName: String(tag || 'div').toUpperCase(),
      className: '',
      attributes: {},
      style: {},
      children: [],
      innerHTML: '',
      parentNode: null,
      firstChild: null,
      setAttribute(k, v) { this.attributes[k] = String(v); },
      removeAttribute(k) { delete this.attributes[k]; },
      getAttribute(k) { return this.attributes[k]; },
      appendChild(child) { this.children.push(child); child.parentNode = this; if (!this.firstChild) this.firstChild = child; return child; },
      removeChild(child) { const i = this.children.indexOf(child); if (i >= 0) this.children.splice(i, 1); child.parentNode = null; },
      querySelector() { return null; },
    };
    elements.push(el);
    return el;
  };
  return { elements, document: { createElement: fakeElement } };
}

test('delayed mine arming reaches the halo through cloned worker replies without a rebuild', async (t) => {
  const { state, worker, lane, tick } = await workerLane(t);
  const nativeState = worker.host.state;
  const player = worker.host.runtime.spawn(makeShipEntitySpec('ship_kestrel', { isPlayer: true, pos: { x: 0, z: 0 } }));
  nativeState.playerId = player.id;
  nativeState.mode = 'flight';
  const layer = worker.host.runtime.spawn({
    type: 'ship', team: 1, mass: 58, physicsBody: false, radius: 8,
    pos: { x: player.pos.x + 900, z: player.pos.z }, vel: { x: 0, z: 0 },
    data: { encounter: true, role: 'mine_layer_jackal', ai: { combatDoctrineId: 'mine_layer_wake' } },
  });
  const native = worker.host.registry.get('mines').placeMine({
    ownerId: layer.id, pos: { x: layer.pos.x + 200, z: layer.pos.z + 300 },
  });
  assert.ok(native, 'the real mine owner lays an ordinary delayed mine');
  assert.equal(native.data.armed, false);
  await tick();
  const mine = state.entities.get(native.id);
  assert.ok(mine, 'the unarmed spawn reaches the page');
  assert.notEqual(mine.data, native.data, 'mine state crosses the structured-cloned boundary');
  assert.equal(mine.data.armed, false);
  const generation = lane.journal.getRebuildGeneration();
  const mock = mockDocument();
  const oldDocument = globalThis.document;
  globalThis.document = mock.document;
  const halo = createThreatHalo(mock.document.createElement('div'), createBus());
  globalThis.document = oldDocument;
  t.after(() => { halo.destroy(); globalThis.document = oldDocument; });
  const update = () => {
    globalThis.document = mock.document;
    try { halo.update(state.entities.get(state.playerId), state, (world, out) => {
    out.x = 640 + (world.x - player.pos.x) * .2;
    out.y = 360 + (world.z - player.pos.z) * .2;
    out.onScreen = false;
    return out;
    }); } finally { globalThis.document = oldDocument; }
  };
  const slot = () => mock.elements.find((el) =>
    el.attributes['data-entity-id'] === String(layer.id) && el.style.display === 'block');
  update();
  assert.ok(slot(), 'the transported mine-layer has a visible halo');
  assert.doesNotMatch(slot().attributes['aria-label'], /\d+ MINES?/);
  for (let i = 0; i < Math.ceil(MINE_ARM_DELAY_S * 60) + 1; i++) await tick();
  assert.equal(native.data.armed, true, 'the registered mine system arms the native mine');
  assert.equal(lane.journal.getRebuildGeneration(), generation, 'arming uses vitals without a journal rebuild');
  update();
  assert.match(slot().attributes['aria-label'], /1 MINE/,
    'the transported delayed-arm screen must reach the halo label');
  const numeral = slot().children.find((el) => el.textContent === '1' && el.style.display !== 'none');
  assert.ok(numeral, 'the armed screen draws its exposed numeral');
  const steady = await tick();
  assert.ok(!steady.entityVitals.some(([id]) => id === native.id), 'unchanged armed mines send no new vitals row');
  native.hull = 0;
  await tick();
  update();
  assert.equal(numeral.style.display, 'none', 'destroying the mine removes the numeral through the lane');
  assert.doesNotMatch(slot().attributes['aria-label'], /\d+ MINES?/);
});

test('post-spawn boost-thrown decoy reaches retained VFX, follows cloned bait positions, and expires', async (t) => {
  const { state, worker, lane, bus, tick } = await workerLane(t);
  const spec = makeShipEntitySpec('ship_kestrel', {
    isPlayer: true, pos: { x: 0, z: 0 }, fittings: ['mod_decoy_buoy_s'],
  });
  spec.vel = { x: 120, z: -40 };
  const native = worker.host.runtime.spawn(spec);
  const nativeState = worker.host.state;
  nativeState.playerId = native.id;
  nativeState.mode = 'flight';
  await tick();
  const ship = state.entities.get(native.id);
  assert.ok(ship, 'the player spawn reaches the page before deployment');
  assert.ok(!ship.data.cm?.effect, 'the player has no countermeasure effect at spawn');
  const generation = lane.journal.getRebuildGeneration();
  const out = new ActionVfx(new THREE.Scene());
  t.after(() => out.dispose());
  const emissions = [];
  bus.on('countermeasure:deployed', (payload) => emissions.push(out.emit('countermeasure:deployed', payload, state)));
  laneDomEvent({ type: 'keydown', pressed: true, code: 'ShiftLeft' });
  laneDomEvent({ type: 'keydown', pressed: true, code: 'KeyW' });
  await tick();
  laneDomEvent({ type: 'keydown', pressed: true, code: 'KeyX' });
  const deployedReply = await tick();
  laneDomEvent({ type: 'keyup', pressed: false, code: 'KeyX' });
  laneDomEvent({ type: 'keyup', pressed: false, code: 'ShiftLeft' });
  laneDomEvent({ type: 'keyup', pressed: false, code: 'KeyW' });
  const nativeEffect = native.data.cm?.effect;
  assert.ok(nativeEffect, 'the public deploy key reaches the registered countermeasure owner');
  assert.ok(Math.hypot(nativeEffect.body.vel.x, nativeEffect.body.vel.z) > 1,
    'boost deployment throws a moving buoy');
  assert.ok(deployedReply.events.some((event) => event.t === 'countermeasure:deployed'),
    'the deployment event crosses the real worker reply');
  assert.deepEqual(emissions, [true], 'the replayed deployment must create retained VFX after the initial spawn');
  const effect = ship.data.cm.effect;
  assert.notEqual(effect, nativeEffect, 'the retained record is cloned, not shared with simulation');
  assert.equal(effect.body, undefined, 'the presentation record does not ship the simulation body');
  assert.equal(effect.lineage, undefined, 'the presentation record does not ship seeker targeting state');
  const slot = out.slots.find((entry) => entry.alive && entry.cmEffect === effect);
  assert.ok(slot, 'the presenter retains the transported effect');
  const start = { x: nativeEffect.originX, z: nativeEffect.originZ };
  for (let sample = 0; sample < 2; sample++) {
    for (let i = 0; i < 90; i++) await tick();
    out.update(state);
    assert.equal(ship.data.cm.effect, effect, 'later replies preserve presentation effect identity');
    assert.equal(slot.cmClosingAt, -1, 'a cloned update must not cancel the active mechanism');
    assert.deepEqual([slot.x, slot.z], [nativeEffect.originX, nativeEffect.originZ],
      'the marker follows the authoritative moving bait point');
    assert.equal(out.batch.count, 5, 'the retained buoy surfaces survive past the deployment burst');
    const origins = out.batch.attributes[0];
    for (let i = 0; i < out.batch.count; i++) {
      assert.ok(Math.abs(origins.getX(i) - nativeEffect.originX) < .001);
      assert.ok(Math.abs(origins.getZ(i) - nativeEffect.originZ) < .001);
    }
  }
  assert.ok(Math.hypot(slot.x - start.x, slot.z - start.z) > 10, 'the buoy actually travels');
  assert.equal(lane.journal.getRebuildGeneration(), generation, 'deployment and movement need no journal rebuild');
  for (let i = 0; native.data.cm.effect && i <= Math.ceil(nativeEffect.cfg.durationS * 60); i++) await tick();
  assert.equal(native.data.cm.effect, null, 'the registered owner expires the buoy within its duration');
  assert.equal(ship.data.cm.effect, null, 'native expiry clears the retained record through vitals');
  assert.equal(ship.data.cm.effectT, 0, 'native expiry reaches the presenter timer');
  out.update(state);
  for (let i = 0; i < 16; i++) await tick();
  out.update(state);
  assert.equal(out.live, 0, 'the expired buoy closes finitely');
  assert.equal(out.mesh.visible, false, 'expired buoy surfaces disappear');
});
