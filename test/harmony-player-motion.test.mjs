// test/harmony-player-motion.test.mjs — HARMONY-FIX 1: nothing outside the flight
// controllers and the physics membrane writes the player ship's motion directly (R23).
// - the lint holds: no direct player-motion writers in src/systems outside the allow-list;
// - a mercy pull (the tow-post's lend) reaches the hull only as a membrane impulse with
//   provenance, inside the player-external budget — the plant never touches player.vel.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { pl338TowPost, TOW_POST_TUNING, PL_338_LENT_EVENT } from '../src/systems/plants/pl338TowPost.js';
import { queuePlayerImpulse } from '../src/systems/plants/playerImpulse.js';
import { readExternalPhysicsFeedback } from '../src/core/physicsAuthority.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('check:player-motion — no direct player-motion writers outside the allow-list', () => {
  const res = spawnSync(process.execPath, ['scripts/check-player-motion-writers.mjs'], { cwd: root, encoding: 'utf8' });
  assert.equal(res.status, 0, `lint must pass:\n${res.stdout}\n${res.stderr}`);
});

test('the lint pattern bites: it catches a direct write and spares reads and comparisons', () => {
  const WRITE = /\bplayer\s*\.\s*(?:vel|angVel|heading|pos|rot)(?:\s*\.\s*[xyzwy])?\s*(?:\+=|-=|\*=|\/=|=)(?![=>])/;
  assert.ok(WRITE.test('export function shove(player) { player.vel.x += 3; }'),
    'a planted direct write must be caught');
  assert.ok(WRITE.test('player.vel = player.vel || { x: 0, z: 0 };'), 'whole-object writes are caught');
  assert.ok(!WRITE.test('export const v = player.vel.x;'), 'reads are not writes');
  assert.ok(!WRITE.test('if (player.vel.x === 0) return;'), 'comparisons are not writes');
});

test('a mercy pull crosses the membrane with provenance — player.vel is never written', () => {
  const entities = new Map();
  const state = {
    mode: 'flight', simTime: 100, tick: 6000, playerId: 'p1', entities,
    world: { currentSectorId: TOW_POST_TUNING.sectorId },
    meta: { seed: 7 }, story: { flags: {} },
  };
  entities.set('p1', {
    id: 'p1', alive: true, type: 'ship', isPlayer: true,
    pos: { x: 500, z: 500 }, vel: { x: 0, z: 0 }, rot: 0,
    hull: 100, hullMax: 100, mass: 12, physicsBody: { mass: 12 }, data: {},
  });
  entities.set(TOW_POST_TUNING.stationId, {
    id: TOW_POST_TUNING.stationId, alive: true, type: 'station',
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    data: { stationId: TOW_POST_TUNING.stationId, dockRadius: 72, size: 'M' },
  });
  const log = [];
  const bus = { on: () => () => {}, emit: (type, payload) => log.push({ type, payload }) };
  const spawned = [];
  let nextId = 100;
  const helpers = {
    spawnEntity(spec) {
      const ent = { ...spec, id: nextId++, alive: true, pos: { ...(spec.pos || { x: 0, z: 0 }) },
        data: structuredClone(spec.data || {}) };
      spawned.push(ent);
      entities.set(ent.id, ent);
      return ent;
    },
    removeEntity(id) { entities.delete(id); },
  };
  pl338TowPost.init({ state, bus, helpers });
  const post = () => spawned.find((e) => e.data?.plantsPl338Post === true);
  pl338TowPost.update(1, state); // spawn the post
  const p = entities.get('p1');
  p.pos.x = post().pos.x + 10; // a stuck hull inside the post's lend ring
  p.pos.z = post().pos.z;
  pl338TowPost.update(1, state);
  assert.ok(log.some((e) => e.type === PL_338_LENT_EVENT), 'the post lends its line');
  pl338TowPost.update(1, state); // the tow beat
  assert.equal(p.vel.x, 0, 'the plant never writes the hull\'s vel (R23)');
  assert.equal(p.vel.z, 0, 'the plant never writes the hull\'s vel (R23)');
  const feedback = readExternalPhysicsFeedback(p);
  assert.ok(feedback && feedback.deltaV > 0,
    'the tow pull crossed the SG-02 membrane and entered the player-external budget ledger');
  pl338TowPost.destroy();
});

test('queuePlayerImpulse scales a huge shove down to the budget — no invisible hurl', () => {
  const entity = { id: 'px', isPlayer: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    mass: 10, physicsBody: { mass: 10 } };
  const state = { tick: 100 };
  const ok = queuePlayerImpulse(state, entity, 500, 0, 'testHurl');
  assert.equal(ok, true, 'the impulse is queued');
  const feedback = readExternalPhysicsFeedback(entity);
  assert.ok(feedback, 'the budget ledger saw it');
  assert.ok(feedback.deltaV <= 5.01, `a 500 wu/s shove lands as at most the 5 wu/s window budget, got ${feedback.deltaV}`);
  assert.equal(entity.vel.x, 0, 'the helper itself never writes vel');
});
