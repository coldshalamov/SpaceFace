import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { installVisualOverrides } from '../src/render/visualOverrides.js';
import { hostileHeldUntilAuthored, HOSTILE_PENDING_HOLD_MS, syncResolvingMarker } from '../src/render/renderer.js';

function boundaryFor(entity) {
  const factory = { build() { return new THREE.Group(); } };
  installVisualOverrides(factory, { releaseMode: true, directAuthoredMount: true, admissionStandInRecord: () => null });
  return factory.build(entity);
}
const substrateOf = (b) => b.children.find((c) => c.userData && c.userData.authoredAdmissionSubstrate === true);
const hostile = (id, extra = {}) => ({ id, type: 'ship', isPlayer: false, team: 2, alive: true, radius: 10, data: { defId: 'ship_wasp' }, ...extra });
const swarm = { run: { kind: 'survival' }, missions: { active: [] }, render: { scene: {} } };

test('a pending Swarm hostile is held off the glass and un-lockable', () => {
  const entity = hostile(701);
  const boundary = boundaryFor(entity);
  boundary.userData.authoredAssetState = 'loading';
  syncResolvingMarker(boundary, swarm);
  assert.equal(substrateOf(boundary).userData.resolvingMarker.visible, false, 'no stand-in drawn');
  assert.equal(entity.presentationFallbackVisible, false, 'lock gate sees empty air');
});

test('the hold has a failsafe so a stuck admission never leaves an invisible attacker', () => {
  const entity = hostile(702);
  const boundary = boundaryFor(entity);
  boundary.userData.authoredAssetState = 'loading';
  const t0 = 1000;
  assert.equal(hostileHeldUntilAuthored(boundary, entity, swarm, t0), true);
  assert.equal(hostileHeldUntilAuthored(boundary, entity, swarm, t0 + HOSTILE_PENDING_HOLD_MS - 1), true);
  assert.equal(hostileHeldUntilAuthored(boundary, entity, swarm, t0 + HOSTILE_PENDING_HOLD_MS + 1), false);
});

test('the player, friendlies, mission targets and non-Swarm runs keep the stand-in', () => {
  const plain = { run: { kind: 'survival' }, missions: { active: [] }, render: { scene: {} } };
  const mk = (e) => { const b = boundaryFor(e); b.userData.authoredAssetState = 'loading'; return b; };
  for (const [label, entity, state] of [
    ['player', hostile(703, { isPlayer: true }), plain],
    ['friendly', hostile(704, { team: 0 }), plain],
    ['mission target', hostile(705, { data: { defId: 'ship_wasp', missionTag: 'warrant' } }), plain],
    ['adventure run', hostile(706), { ...plain, run: { kind: 'adventure' } }],
  ]) {
    const boundary = mk(entity);
    syncResolvingMarker(boundary, state);
    assert.equal(substrateOf(boundary).userData.resolvingMarker.visible, true, `${label} still draws its stand-in`);
  }
});
