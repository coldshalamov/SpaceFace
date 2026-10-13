import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { createSimCommandRing, pushLaneCommand } from '../scripts/lib/simCommandChannel.mjs';
import { fightBeat, readTarget } from '../scripts/player-truth/driver.mjs';
import { publishRadarHostileCourse } from '../src/ui/radar.js';

const wrappedAngle = angle => Math.atan2(Math.sin(angle), Math.cos(angle));

test('public radar pursuit closes native bearing error and a reachable canvas attack reaches the native weapon owner', async () => {
  const oldWindow = globalThis.window;
  const oldDocument = globalThis.document;
  const lane = createSimHost();
  try {
    const init = await lane.init({ profile: 'production', seed: 4242,
      scenarioContract: JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url))) });
    let tick = 0;
    const send = async (steps, ...commands) => {
      const ring = createSimCommandRing();
      for (const command of commands) pushLaneCommand(ring, command);
      return lane.tick({ tick: ++tick, steps, ackEnd: init.initRebuild?.end ?? 0,
        commands: structuredClone(ring.drain()) });
    };
    await send(0, { kind: 'rpc', id: 'boot', op: 'newGameBoot', args: { opts: { seed: 4242 } } },
      { kind: 'mode', mode: 'flight' });
    const state = lane.host.state;
    const player = state.entities.get(state.playerId);
    const canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, right: 1000, bottom: 600, width: 1000, height: 600 }) };
    const attributes = new Map();
    const radar = { offsetParent: {}, getAttribute: key => attributes.get(key) ?? null,
      setAttribute: (key, value) => attributes.set(key, value), removeAttribute: key => attributes.delete(key) };
    class Vector3 {
      set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
      project() { this.x = (this.x - player.pos.x) / 1000; this.y = (this.z - player.pos.z) / 1000; this.z = 0; return this; }
    }
    const visibleEntities = [player];
    // The observer's canvas contains only this public contact set; native controls and physics
    // still run on the complete production host. No unseen entity can steer the actor.
    const facade = { get mode() { return state.mode; }, get simTime() { return state.simTime; },
      get run() { return state.run; }, playerId: player.id, entityList: visibleEntities,
      render: { camera: {}, renderer: { domElement: canvas } } };
    const observe = (fn, arg) => {
      globalThis.window = { SF: { state: facade, THREE: { Vector3 } } };
      globalThis.document = { querySelector: () => radar, elementFromPoint: () => canvas };
      try { return fn(arg); } finally {
        if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow;
        if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;
      }
    };
    const held = new Set();
    let nativeShots = 0;
    lane.host.bus.on('combat:fire', receipt => { if (receipt.ownerId === player.id) nativeShots++; });
    const page = {
      evaluate: async (fn, arg) => observe(fn, arg),
      waitForTimeout: async () => { await send(3); },
      keyboard: {
        down: async code => { held.add(code); await send(0, { kind: 'domEvent', d: { type: 'keydown', code, pressed: true, blocked: false } }); },
        up: async code => { held.delete(code); await send(0, { kind: 'domEvent', d: { type: 'keyup', code, pressed: false } }); },
        press: async () => {},
      },
      mouse: {
        move: async (clientX, clientY) => send(0, { kind: 'domEvent', d: { type: 'mousemove', clientX, clientY, offCanvas: false } }),
        down: async () => send(0, { kind: 'domEvent', d: { type: 'mousedown', button: 0, offCanvas: false } }),
        up: async () => send(0, { kind: 'domEvent', d: { type: 'mouseup', button: 0 } }),
      },
    };
    const wantedHeading = player.rot + Math.PI / 2;
    const degrees = Math.round((wantedHeading - Math.PI / 2) * 180 / Math.PI + 360) % 360;
    publishRadarHostileCourse(radar, { baseLabel: 'Local tactical radar.', mode: 'flight', simTime: state.simTime,
      courseText: `Nearest hostile at 12 o'clock, dial bearing ${degrees} degrees.` });
    const before = Math.abs(observe(readTarget).radarRel);
    await fightBeat(page, 0);
    assert.ok(Math.abs(wrappedAngle(wantedHeading - player.rot)) < before / 2,
      'the actual native yaw must turn toward the painted course, not away from it');
    assert.equal(held.size, 0);
    assert.equal(nativeShots, 0, 'radar pursuit does not shoot an unseen world coordinate');

    // Reacquisition is an actual native ship on the public gameplay canvas.
    const reply = await send(0, { kind: 'spawn', token: 'visible-hostile', spec: {
      type: 'ship', team: 3, pos: { x: player.pos.x + 80, y: 0, z: player.pos.z + 40 },
      hull: 100, hullMax: 100, radius: 8, data: { runRole: 'enemy' },
    } });
    const enemy = state.entityList.find(entity => entity.id !== player.id
      && entity.data?.runRole === 'enemy' && entity.pos.x === player.pos.x + 80);
    assert.ok(enemy, JSON.stringify(reply.spawnAcks));
    visibleEntities.push(enemy);
    const reachable = observe(readTarget);
    assert.equal(reachable.none, undefined);
    const attackError = Math.abs(reachable.rel);
    await fightBeat(page, 1);
    assert.ok(Math.abs(wrappedAngle(Math.atan2(enemy.pos.z - player.pos.z, enemy.pos.x - player.pos.x) - player.rot)) < attackError,
      'canvas pursuit uses the same native yaw sign');
    assert.ok(nativeShots > 0, 'trusted canvas firing reaches the real native weapon owner');
    assert.equal(held.size, 0);
  } finally {
    lane.shutdown();
    if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow;
    if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;
  }
});
