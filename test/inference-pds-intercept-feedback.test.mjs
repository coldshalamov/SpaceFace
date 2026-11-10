/**
 * PIC-15 — a point-defence intercept is a spark and a snap AT THE MISSILE, not a missile
 * that silently vanishes.
 *
 * The countermeasures owner already kills the inbound shot and publishes pds:intercept, but
 * the receipt carried no position — the only feedback was a generic vfxCue bolted on beside it.
 * One designed answer now owns the seam: the receipt carries the missile's own point (and its
 * motion as direction), the action-recipe resolver anchors a brief contact spark there — the
 * target is already dead, so the receipted point is the only honest anchor — and one direct
 * audio subscription plays the authored chaff snap at that point.
 *
 * Proven here against the real bus + real countermeasures owner + real resolver + real audio
 * subscription (playback mocked at the play() seam, not by reading source).
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { countermeasures } from '../src/systems/countermeasures.js';
import {
  ADDITIONAL_ACTION_VFX_RECIPES,
  resolveAdditionalActionVfxReceipt,
} from '../src/render/vfx/actionEventRecipes.js';
import { audio } from '../src/audio/audioSystem.js';

const DT = 1 / 60;

function makeBus() {
  const handlers = {};
  return {
    on(name, fn) {
      (handlers[name] || (handlers[name] = [])).push(fn);
      return () => {
        const list = handlers[name];
        if (list) handlers[name] = list.filter((f) => f !== fn);
      };
    },
    emit(name, payload) {
      for (const fn of handlers[name] || []) fn(payload);
    },
  };
}

function boot({ withMissile = true } = {}) {
  const player = {
    id: 1,
    type: 'ship',
    alive: true,
    team: 0,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 8,
    flags: {},
    cap: 100,
    data: {
      fittings: ['mod_pds_servo_s'],
      weapons: [],
      combat: {},
      derived: { cap: 100 },
    },
  };
  // Inside the servo's authored 240 wu ring, inbound on the hull.
  const missile = {
    id: 20,
    type: 'projectile',
    alive: true,
    ownerId: 9,
    team: 1,
    pos: { x: 140, z: 30 },
    vel: { x: -80, z: -10 },
    rot: Math.PI,
    radius: 1,
    data: { kind: 'missile', targetId: 1, turnRate: 2.8, projSpeed: 80 },
  };
  const entities = new Map([[1, player]]);
  const entityList = [player];
  if (withMissile) {
    entities.set(20, missile);
    entityList.push(missile);
  }
  const state = {
    mode: 'flight',
    playerId: 1,
    tick: 100,
    simTime: 1.6,
    meta: { seed: 4242 },
    rng: () => 0,
    player: {},
    input: { fire: false, deployCountermeasure: false, actions: {} },
    combat: { beams: [] },
    entities,
    entityList,
    entityIndex: {
      __spacefaceEntityIndexV1: true,
      ships: [player],
      weaponShips: [player],
      projectiles: withMissile ? [missile] : [],
    },
  };
  const bus = makeBus();
  const helpers = {
    getEntity: (id) => state.entities.get(id),
    spawnEntity() { return null; },
  };
  const cm = Object.create(countermeasures);
  cm.init({ state, bus, helpers });
  const seen = { intercepts: [], vfxCues: [], audioCues: [] };
  bus.on('pds:intercept', (p) => seen.intercepts.push(p));
  bus.on('presentation:vfxCue', (p) => seen.vfxCues.push(p));
  bus.on('audio:cue', (p) => seen.audioCues.push(p));
  return { state, bus, cm, player, missile, seen };
}

test('the intercept receipt carries the missile point and motion once — and no generic cue rides along', () => {
  const { state, cm, missile, seen } = boot();
  cm.update(DT, state);
  assert.equal(seen.intercepts.length, 1, 'exactly one confirmed intercept');
  const p = seen.intercepts[0];
  assert.deepEqual(p.pos, { x: 140, z: 30 }, 'the receipt carries the missile point, not the hull');
  assert.deepEqual(p.dir, { x: -80, z: -10 }, 'the receipt copies the inbound motion as direction');
  assert.equal(p.shipId, 1);
  assert.equal(p.missile, true);
  assert.equal(missile.alive, false, 'the servo still kills the shot');
  assert.equal(
    seen.vfxCues.filter((c) => c && c.id === 'combat.pds.intercept').length, 0,
    'the ad-hoc vfxCue is retired — the designed recipe owns the answer',
  );
  assert.equal(seen.audioCues.length, 0, 'no parallel semantic cue — the audio seam listens directly');
});

test('the recipe resolves the receipted intercept point after the target is gone', () => {
  const { state, cm, seen } = boot();
  cm.update(DT, state);
  const p = seen.intercepts[0];
  state.entities.delete(20); // the bolt is not merely dead — it is out of the index entirely
  const record = resolveAdditionalActionVfxReceipt('pds:intercept', p, state);
  assert.ok(record, 'a confirmed intercept resolves a record');
  assert.deepEqual(record.pos, { x: 140, z: 30 });
  assert.equal(record.sourceId, 1, 'the servo hull owns the action');
  assert.equal(record.targetId, null, 'never attaches to a dead target');
  assert.equal(record.attachToTarget, false);
  assert.deepEqual(record.direction, { x: -80, z: -10 });
  const recipe = ADDITIONAL_ACTION_VFX_RECIPES['pds:intercept'];
  assert.ok(recipe, 'pds:intercept has a designed recipe row');
  assert.equal(recipe.primitive, 'induction');
  assert.equal(recipe.verb, 'disrupt');
  assert.equal(recipe.life, 0.22, 'a brief spark, not a kill burst');
});

test('one authored chaff snap plays at the intercept point through the real subscription', () => {
  const { state, bus, cm } = boot();
  const ear = Object.create(audio);
  ear.init({ state, bus, helpers: null });
  const plays = [];
  ear.play = (recipeId, opts) => { plays.push({ recipeId, opts }); };
  cm.update(DT, state);
  assert.equal(plays.length, 1, 'one snap per confirmed intercept');
  assert.equal(plays[0].recipeId, 'sfx_cm_chaff');
  assert.deepEqual(plays[0].opts.position, { x: 140, z: 30 }, 'positional at the missile, not the hull');
  assert.equal(plays[0].opts.gain, 0.45);
});

test('a servo inside its cooldown reports nothing, and an empty ring stays silent', () => {
  const { state, cm, seen } = boot();
  cm.update(DT, state);
  const second = { id: 21, type: 'projectile', alive: true, ownerId: 9, team: 1, pos: { x: 100, z: 0 }, vel: { x: -60, z: 0 }, radius: 1, data: { kind: 'missile' } };
  state.entities.set(21, second);
  state.entityList.push(second);
  state.entityIndex.projectiles.push(second);
  state.tick += 1;
  cm.update(DT, state);
  assert.equal(seen.intercepts.length, 1, 'cooldown swallows the second inbound');

  const empty = boot({ withMissile: false });
  empty.cm.update(DT, empty.state);
  assert.equal(empty.seen.intercepts.length, 0, 'nothing to intercept, nothing announced');
});

test('a receipt with no finite point fabricates no visual and no audio', () => {
  const { state, bus } = boot();
  const ear = Object.create(audio);
  ear.init({ state, bus, helpers: null });
  const plays = [];
  ear.play = (recipeId, opts) => { plays.push({ recipeId, opts }); };
  for (const bad of [null, {}, { pos: { x: Number.NaN, z: 0 } }, { pos: { x: Infinity, z: 1 } }]) {
    bus.emit('pds:intercept', bad);
    assert.equal(resolveAdditionalActionVfxReceipt('pds:intercept', bad, state), null);
  }
  assert.equal(plays.length, 0, 'malformed receipts are silent');
});

test('the neighboring countermeasure deploy answer still resolves', () => {
  const { state } = boot();
  const ship = state.entities.get(1);
  ship.data.cm = { effect: { originX: -9, originZ: 3 } };
  const record = resolveAdditionalActionVfxReceipt('countermeasure:deployed', { shipId: 1, kind: 'chaff' }, state);
  assert.ok(record, 'chaff deploy still resolves its designed answer');
  assert.deepEqual(record.pos, { x: -9, z: 3 });
});
