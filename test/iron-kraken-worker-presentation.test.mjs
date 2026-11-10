import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { collectEntityVitals } from '../scripts/lib/simWorkerHost.mjs';
import { IRON_KRAKEN_PROFILES } from '../src/data/ironKraken.js';
import { readIronKrakenMotionFrame, ironKrakenPresentationFight } from '../src/data/ironKrakenPresentation.js';
import { resolveIronKrakenAudioCue } from '../src/audio/ironKrakenAudio.js';
import { createIronKrakenAttackVfx } from '../src/render/ironKrakenAttackVfx.js';

function fixture() {
  const profile = IRON_KRAKEN_PROFILES.heavy;
  const boss = { id: 7, occupantGeneration: 2, type: 'ship', alive: true, hull: 280,
    pos: { x: 40, z: 20 }, vel: { x: 0, z: 0 }, rot: .2,
    data: { enemyTypeId: profile.enemyId, ironKraken: { variant: 'heavy', fightId: 'kraken:7' } } };
  const fight = { bossId: 7, encounterId: profile.scoreId, fightId: 'kraken:7', clock: 150,
    phase: 'active', nextAt: 180, suspended: false, terminal: null,
    cast: { id: 'kraken:7:1', beatId: 'siphon_jet', startedAt: 0, heading: .2, fired: true,
      shapes: [{ kind: 'lane', a: { x: 40, z: 20 }, b: { x: 240, z: 20 }, radius: 56 }] },
    recovery: null, plates: [{ id: 'mantle_port', attached: true }] };
  const state = { tick: 150, entities: new Map([[7, boss]]), entityList: [boss],
    capitalBossEncounters: { fights: { 'kraken:7': fight } } };
  const shadow = new Map();
  const remoteBoss = { ...boss, data: { ...boss.data, ironKraken: { variant: 'heavy' } } };
  const remote = { tick: 150, entities: new Map([[7, remoteBoss]]), entityList: [remoteBoss] };
  function deliver() {
    const rows = collectEntityVitals(state, shadow);
    const row = rows.find(row => row[0] === 7);
    assert.ok(row, 'changed committed phase has a bounded entity receipt');
    Object.assign(remoteBoss, structuredClone(row[1]));
    return row[1].ironKrakenMotionFrame;
  }
  return { boss, fight, state, remote, remoteBoss, deliver, profile };
}

test('compact worker receipts drive the same locked volume and audio without publishing fight ledgers', () => {
  const h = fixture();
  const wire = h.deliver();
  assert.equal(h.remote.capitalBossEncounters, undefined);
  const fight = ironKrakenPresentationFight(h.remote, h.remoteBoss);
  assert.equal(fight.cast.id, h.fight.cast.id);
  assert.equal(fight.cast.fired, true);
  assert.deepEqual(fight.cast.shapes, h.fight.cast.shapes);
  assert.equal(fight.bossId, h.boss.id);
  assert.equal(fight.wings, undefined);
  assert.equal(fight.telemetry, undefined);
  h.fight.cast.shapes[0].b.x = 999;
  assert.equal(JSON.parse(wire).cast.shapes[0].b.x, 240, 'wire receipt owns its committed coordinates');
  const root = new THREE.Group();
  const effect = createIronKrakenAttackVfx(root, h.profile);
  assert.equal(effect.update(h.remoteBoss, fight).activeCount, 1);
  const cue = resolveIronKrakenAudioCue(h.remote, 'capitalBoss:attack', {
    encounterId: h.profile.scoreId, fightId: h.fight.fightId,
    castId: fight.cast.id, beatId: 'siphon_jet' });
  assert.equal(cue.recipeId, 'sfx_kraken_jet');
  effect.dispose();
});

test('worker recovery retains the counterplay clock and rejects recycled actor lives', () => {
  const h = fixture();
  h.fight.cast = null; h.fight.phase = 'recovery'; h.fight.clock = 180;
  h.fight.recovery = { beatId: 'siphon_jet', startedAt: 180, durationTicks: 156,
    heading: .2, cancelled: false };
  h.deliver();
  const fight = readIronKrakenMotionFrame(h.remoteBoss);
  assert.deepEqual(fight.recovery, h.fight.recovery);
  const payload = { encounterId: h.profile.scoreId, fightId: h.fight.fightId, beatId: 'siphon_jet', startedAt: 180 };
  assert.equal(resolveIronKrakenAudioCue(h.remote, 'capitalBoss:recovery', { ...payload, startedAt: 20 }), null,
    'an old recovery cannot borrow the latest compact worker frame');
  assert.equal(resolveIronKrakenAudioCue(h.remote, 'capitalBoss:recovery', payload).recipeId, 'sfx_kraken_vent');
  h.remoteBoss.occupantGeneration++;
  assert.equal(readIronKrakenMotionFrame(h.remoteBoss), null);
  assert.equal(resolveIronKrakenAudioCue(h.remote, 'capitalBoss:recovery', payload), null);
});

test('the retained mantle trawl has an exact stern danger volume and a distinct lower cue', () => {
  const h = fixture();
  const shape = { kind: 'sector', x: 40, z: 20, heading: .2 + Math.PI, inner: 14, outer: 112.7, halfAngle: .8 };
  h.fight.cast = { id: 'kraken:7:2', beatId: 'mantle_trawl', startedAt: 0, heading: .2,
    fired: true, shapes: [shape] };
  h.deliver();
  const fight = readIronKrakenMotionFrame(h.remoteBoss);
  const root = new THREE.Group(); const effect = createIronKrakenAttackVfx(root, h.profile);
  assert.equal(effect.update(h.remoteBoss, fight).activeCount, 1);
  const volume = effect.group.children.find(object => object.visible);
  assert.equal(volume.material.uniforms.uHalfAngle.value, .8);
  assert.equal(volume.material.uniforms.uInner.value, 14 / 112.7);
  assert.equal(volume.scale.x, 112.7);
  const cue = resolveIronKrakenAudioCue(h.remote, 'capitalBoss:attack', {
    encounterId: h.profile.scoreId, fightId: h.fight.fightId,
    castId: fight.cast.id, beatId: 'mantle_trawl' });
  assert.equal(cue.recipeId, 'sfx_kraken_rake');
  assert.equal(cue.rate, .74);
  effect.dispose();
});
