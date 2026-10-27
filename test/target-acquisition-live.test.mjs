// Packet 02: the live acquisition path (ui/uiRoot targetNearestHostileToPlayer) honours sensor truth
// and occupant identity. Driven headlessly through the real exported function.
import test from 'node:test';
import assert from 'node:assert/strict';

import { targetNearestHostileToPlayer, LOCK_REACQUIRE_GRACE_S, LOCK_PICK_RANGE_WEIGHT } from '../src/ui/uiRoot.js';
import { ACQUISITION_PROTOTYPE } from '../src/combat/targetAcquisition.js';
import { applyFeatureConfigToMaps, PRODUCTION_FEATURES } from '../src/data/featureFlags.js';
import { engageEntityCloak } from '../src/systems/cloak.js';
import { bindSelection } from '../src/combat/targetIdentity.js';
import { createBus } from '../src/core/eventBus.js';

applyFeatureConfigToMaps(PRODUCTION_FEATURES);

function hostile(id, x, z, gen = id * 10) {
  const e = { id, type: 'ship', team: 1, alive: true, radius: 8, pos: { x, z }, vel: { x: 0, z: 0 }, data: { encounter: true } };
  Object.defineProperty(e, 'occupantGeneration', { value: gen, writable: true, configurable: true, enumerable: false });
  return e;
}
function world(hostiles, cursor) {
  const player = { id: 1, type: 'ship', team: 0, alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, targetId: null };
  const list = [player, ...hostiles];
  return {
    playerId: 1, simTime: 10, entities: new Map(list.map((e) => [e.id, e])), entityList: list, player: { targetId: null },
    input: { aimIntentActive: !!cursor, aimWorld: cursor ? { ...cursor } : { x: 0, z: 0 } },
    camera: { zoom: 144 },
  };
}
const refresh = (state, bus = null) => targetNearestHostileToPlayer(state, bus, { quiet: true });

test('the acquisition weight is the picker\'s one number', () => {
  assert.equal(LOCK_PICK_RANGE_WEIGHT, ACQUISITION_PROTOTYPE.rangeWeight);
});

test('a cloak-hidden hostile is never acquired, even with the cursor on it', () => {
  const dark = hostile(2, 520, -40);
  const lit = hostile(3, 700, 300);
  engageEntityCloak(dark, 150, 10);
  const state = world([dark, lit], { x: 520, z: -40 });
  refresh(state);
  assert.equal(state.player.targetId, 3, 'the unseen hull is not on the sensors; the visible one is taken');
});

test('a lock on a hull that cloaks is LOST, announced as lost (not killed), and re-picked from visible contacts', () => {
  const foe = hostile(2, 400, 0);
  const other = hostile(3, 380, 260);
  const state = world([foe, other], { x: 400, z: 0 });
  const bus = createBus();
  const toasts = [];
  bus.on('toast', (t) => toasts.push(t.text));
  refresh(state, bus);
  assert.equal(state.player.targetId, 2);
  engageEntityCloak(foe, 150, state.simTime);
  state.input.aimWorld = { x: 380, z: 260 };
  state.simTime += LOCK_REACQUIRE_GRACE_S + 0.01;
  refresh(state, bus); // lock lost: the cursor gets the reacquire grace to reach the next contact
  state.simTime += LOCK_REACQUIRE_GRACE_S + 0.01;
  refresh(state, bus);
  assert.equal(state.player.targetId, 3, 'the dark hull no longer holds the lock');
  assert.ok(toasts.some((t) => /LOCK LOST/.test(t)), `lost, not destroyed: ${JSON.stringify(toasts)}`);
  assert.ok(!toasts.some((t) => /DESTROYED/.test(t)));
});

test('reacquisition follows sensor truth: it is takeable again when the cloak burns open', () => {
  const foe = hostile(2, 400, 0);
  engageEntityCloak(foe, 150, 10);
  const state = world([foe], { x: 400, z: 0 });
  refresh(state);
  assert.equal(state.player.targetId, null, 'hidden: nothing to lock');
  foe.data.cloak.revealUntil = state.simTime + 1.6; // scan pulse
  state.simTime += 0.2;
  refresh(state);
  assert.equal(state.player.targetId, 2);
});

test('a recycled id does not inherit the lock: it is retired and the cursor contact is taken', () => {
  const original = hostile(2, 400, 0, 20);
  const bystander = hostile(3, 380, 260);
  const state = world([original, bystander], { x: 400, z: 0 });
  refresh(state);
  assert.equal(state.player.targetId, 2);
  bindSelection(state);
  // the original dies; its number is handed to a new hostile elsewhere
  state.entities.delete(2);
  state.entityList.splice(state.entityList.findIndex((e) => e.id === 2), 1);
  const heir = hostile(2, -400, 90, 7777);
  state.entities.set(2, heir);
  state.entityList.push(heir);
  state.input.aimWorld = { x: 380, z: 260 };
  state.simTime += LOCK_REACQUIRE_GRACE_S + 0.01;
  refresh(state);
  assert.notEqual(state.player.targetId, 2, 'the heir of number 2 inherited nothing');
  state.simTime += LOCK_REACQUIRE_GRACE_S + 0.01;
  refresh(state);
  assert.equal(state.player.targetId, 3, 'the lock moved to the contact under the cursor, not the heir of number 2');
});

test('a held lock is sticky against other contacts near the cursor (only Tab, a click or loss changes it)', () => {
  const a = hostile(2, 400, 0);
  const b = hostile(3, 420, 10);
  const state = world([a, b], { x: 400, z: 0 });
  refresh(state);
  assert.equal(state.player.targetId, 2);
  state.input.aimWorld = { x: 420, z: 10 };
  for (let i = 0; i < 40; i += 1) { state.simTime += 0.12; refresh(state); }
  assert.equal(state.player.targetId, 2);
});

test('crossing hostiles do not thrash the first acquisition: the lock lands once and holds', () => {
  const a = hostile(2, 400, 14);
  const b = hostile(3, 400, -14);
  const state = world([a, b], { x: 400, z: 0 });
  const seen = [];
  for (let i = 0; i < 80; i += 1) {
    const t = i * 0.12;
    a.pos.x = 400 + 20 * Math.sin(t * 6); b.pos.x = 400 - 20 * Math.sin(t * 6);
    state.simTime += 0.12;
    refresh(state);
    seen.push(state.player.targetId);
  }
  assert.ok(seen[0] != null);
  assert.equal(new Set(seen).size, 1, `one lock all along: ${JSON.stringify([...new Set(seen)])}`);
});
