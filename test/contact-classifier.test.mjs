// Packet 02: living-contact classification — independent dimensions, a minimal mark only where one
// is needed, status chips only the fitted attack can act on, and one vocabulary for denial.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { applyFeatureConfigToMaps, PRODUCTION_FEATURES } from '../src/data/featureFlags.js';
import { engageEntityCloak } from '../src/systems/cloak.js';
import {
  ATTACK, AWARENESS, DENIAL, INERT, MARK_BELOW_PX, PHYSICAL, RELATION,
  classifyContact, contactMark, denialText, exploitableStatusChips, fittedExploitedStatuses, intentDenial,
} from '../src/combat/contactClassifier.js';
import { LIFECYCLE } from '../src/combat/lifecycle.js';
import { semanticShape } from '../src/ui/accessibility.js';

applyFeatureConfigToMaps(PRODUCTION_FEATURES);

function boot(fittings = []) {
  const state = createGameState(4242);
  state.mode = 'flight';
  state.entities.clear();
  state.entityList.length = 0;
  const player = {
    id: 1, type: 'ship', alive: true, team: 0, radius: 14, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, mass: 100,
    flags: {}, data: { weapons: [{ defId: 'wpn_pulse_laser_s' }], fittings },
  };
  state.playerId = 1;
  const add = (e) => { state.entities.set(e.id, e); state.entityList.push(e); return e; };
  add(player);
  return { state, add };
}
const ship = (id, team, x, data = {}) => ({
  id, type: 'ship', alive: true, team, radius: 8, pos: { x, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, mass: 60, flags: {}, data,
});

test('dimensions are independent: a neutral worker is alive and alert without being hostile', () => {
  const { state, add } = boot();
  const worker = add(ship(2, 2, 200, { trafficRole: 'miner', ai: { archetype: 'miner' } }));
  const c = classifyContact(state, worker);
  assert.equal(c.physical, PHYSICAL.SHIP);
  assert.equal(c.relation, RELATION.NEUTRAL);
  assert.equal(c.lifecycle, LIFECYCLE.ALIVE);
  assert.equal(c.living, true);
  assert.equal(c.attack, ATTACK.NONE);
  assert.equal(c.observed, true);
  assert.equal(c.selected, false);
});

test('a hostile that has the player in its sights is engaged and says so; one merely hostile is not', () => {
  const { state, add } = boot();
  const hunting = add(ship(3, 1, 300, { combat: { targetId: 1 }, intent: { fire: true } }));
  const posture = add(ship(4, 1, 320, { encounter: true }));
  const a = classifyContact(state, hunting);
  assert.equal(a.relation, RELATION.HOSTILE);
  assert.equal(a.attack, ATTACK.FIRING);
  assert.equal(a.awareness, AWARENESS.ENGAGED);
  const b = classifyContact(state, posture);
  assert.equal(b.relation, RELATION.HOSTILE);
  assert.equal(b.attack, ATTACK.POSTURE, 'hostile posture is not an attack on the player');
  assert.notEqual(b.awareness, AWARENESS.ENGAGED);
});

test('a wreck is useful but not alive; a rock is inert; a disabled hull is alive and says disabled', () => {
  const { state, add } = boot();
  const wreck = add({ id: 5, type: 'wreck', alive: true, team: 0, radius: 6, pos: { x: 90, z: 0 }, vel: { x: 0, z: 0 }, data: {} });
  const rock = add({ id: 6, type: 'asteroid', alive: true, team: 0, radius: 20, pos: { x: 120, z: 0 }, vel: { x: 0, z: 0 }, data: {} });
  const hull = add(ship(7, 1, 150, { encounter: true }));
  state.combat.entities = { 7: { capabilities: { drive: false }, statuses: {} } };
  const w = classifyContact(state, wreck);
  assert.equal(w.physical, PHYSICAL.WRECK);
  assert.equal(w.living, false);
  assert.equal(w.lifecycle, LIFECYCLE.WRECK);
  const r = classifyContact(state, rock);
  assert.equal(r.physical, PHYSICAL.ROCK);
  assert.equal(r.lifecycle, INERT);
  assert.equal(r.living, false);
  const h = classifyContact(state, hull);
  assert.equal(h.living, true);
  assert.equal(h.lifecycle, LIFECYCLE.DISABLED);
});

test('a cloaked hull exists but is not observed, and earns no mark', () => {
  const { state, add } = boot();
  const dark = add(ship(8, 1, 600, { encounter: true }));
  engageEntityCloak(dark, 150, state.simTime || 0);
  const c = classifyContact(state, dark);
  assert.equal(c.observed, false);
  assert.equal(contactMark(c, 6), null);
});

test('the contact mark: shape carries relation, only living observed unselected hulls, only when small', () => {
  const { state, add } = boot();
  const foe = add(ship(9, 1, 400, { encounter: true }));
  const friend = add(ship(10, 0, 100, { ownerId: 1 }));
  const worker = add(ship(11, 2, 200, {}));
  const wreck = add({ id: 12, type: 'wreck', alive: true, team: 0, radius: 6, pos: { x: 90, z: 10 }, vel: { x: 0, z: 0 }, data: {} });
  const small = MARK_BELOW_PX - 4;
  assert.equal(contactMark(classifyContact(state, foe), small).shape, 'triangle');
  assert.equal(contactMark(classifyContact(state, friend), small).shape, 'diamond');
  assert.equal(contactMark(classifyContact(state, worker), small).shape, 'square');
  assert.equal(contactMark(classifyContact(state, wreck), small), null, 'debris is not marked as alive');
  assert.equal(contactMark(classifyContact(state, foe), MARK_BELOW_PX + 10), null, 'a hull big enough to read by silhouette needs no mark');
  assert.equal(contactMark(classifyContact(state, foe, {}, { selectedId: 9 }), small), null, 'the selected hull has its own bracket');
  const down = classifyContact(state, foe);
  down.lifecycle = LIFECYCLE.DISABLED;
  assert.equal(contactMark(down, small).variant, 'down');
  const aimed = add(ship(13, 1, 410, { combat: { targetId: 1 }, intent: { fire: true } }));
  assert.equal(contactMark(classifyContact(state, aimed), small).variant, 'on-you');
});

test('ARC READY is a chip only when a fitted attack can chain off the status', () => {
  const ionized = (tick) => ({ 20: { statuses: { status_ionized: { expiresTick: tick + 120, stacks: 1 } } } });
  // no chain fitted: an ionized hull earns no chip
  const plain = boot();
  const t1 = plain.add(ship(20, 1, 300, { encounter: true }));
  plain.state.tick = 100;
  plain.state.combat.entities = ionized(100);
  assert.deepEqual(exploitableStatusChips(plain.state, t1), []);
  assert.equal(fittedExploitedStatuses(plain.state).size, 0);
  // Conductive Path + Relay Arc fitted: the chain only hops to Ionized targets, so now it matters
  const arc = boot(['mod_relay_arc', 'mod_conductive_path']);
  const t2 = arc.add(ship(20, 1, 300, { encounter: true }));
  arc.state.tick = 100;
  arc.state.combat.entities = ionized(100);
  assert.ok(fittedExploitedStatuses(arc.state).has('status_ionized'));
  const chips = exploitableStatusChips(arc.state, t2);
  assert.equal(chips.length, 1);
  assert.equal(chips[0].label, 'ARC READY');
  assert.ok(Math.abs(chips[0].secondsLeft - 2) < 1e-9, 'the clock is the simulation\'s expiresTick');
  // expired or absent: nothing
  arc.state.combat.entities = ionized(-500);
  assert.deepEqual(exploitableStatusChips(arc.state, t2), []);
  arc.state.combat.entities = {};
  assert.deepEqual(exploitableStatusChips(arc.state, t2), []);
});

test('denial at the point of intent: one vocabulary, fixable order, sensor truth owned here', () => {
  const { state, add } = boot();
  const lit = add(ship(30, 1, 300));
  assert.equal(intentDenial(state, lit, null), null);
  assert.equal(intentDenial(state, lit, { distance: 900, range: 500, blocked: true }), DENIAL.OUT_OF_RANGE, 'range before line');
  assert.equal(intentDenial(state, lit, { distance: 100, range: 500, blocked: true }), DENIAL.BLOCKED);
  assert.equal(intentDenial(state, lit, { requiresLock: true, hasLock: false }), DENIAL.NO_LOCK);
  assert.equal(intentDenial(state, lit, { requiresLock: true, hasLock: true }), null);
  assert.equal(intentDenial(state, lit, { protectedCargo: true }), DENIAL.PROTECTED_CARGO);
  assert.equal(intentDenial(state, lit, { tooLarge: true }), DENIAL.TOO_LARGE);
  const dark = add(ship(31, 1, 700));
  engageEntityCloak(dark, 150, 0);
  assert.equal(intentDenial(state, dark, { distance: 700, range: 500 }), DENIAL.UNOBSERVED, 'you cannot act on what your sensors do not hold');
  for (const reason of Object.values(DENIAL)) assert.ok(denialText(reason).length > 0, reason);
  assert.equal(denialText('nonsense'), '');
});

test('mark shapes are the radar\'s IFF shapes: one vocabulary on the radar, the roster and in the world', () => {
  const { state, add } = boot();
  const small = MARK_BELOW_PX - 4;
  const foe = add(ship(40, 1, 400, { encounter: true }));
  const friend = add(ship(41, 0, 100, { ownerId: 1 }));
  const worker = add(ship(42, 2, 200, {}));
  assert.equal(contactMark(classifyContact(state, foe), small).shape, semanticShape('hostile'));
  assert.equal(contactMark(classifyContact(state, friend), small).shape, semanticShape('friendly'));
  assert.equal(contactMark(classifyContact(state, worker), small).shape, semanticShape('neutral'));
});
