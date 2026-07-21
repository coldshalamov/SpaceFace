// PQ-015 / SF-17 — Unit coverage for the shared interaction descriptor module (pure query API).
// Covers component enumeration, stable-key identity, cycling, and per-verb component resolution.

import test from 'node:test';
import assert from 'node:assert/strict';

import { describeEntity, listComponents, describeComponent, listSelectableComponents,
  nextComponentSelection, resolveComponentForVerb, isWreckLikeEntity } from '../src/systems/interactionDescriptors.js';
import { stableEntityKey, capabilityFlagsForEntity, DENIAL, verbAcceptsType } from '../src/data/interactionDescriptorCatalog.js';

function state() {
  const s = { tick: 0, playerId: 1, entities: new Map(), combat: { entities: {} } };
  s.entities.set(1, { id: 1, type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 12 });
  return s;
}
const ship = () => ({ id: 2, type: 'ship', alive: true, team: 1, pos: { x: 10, z: 0 }, radius: 12, data: { ai: { huntPlayer: true } } });
const wreck = () => ({ id: 4, type: 'wreck', alive: true, pos: { x: 3, z: 0 }, radius: 6, data: { parentType: 'ship', salvagePointId: 'z7' } });
const rock = () => ({ id: 3, type: 'asteroid', alive: true, pos: { x: 5.03, z: -0.02 }, radius: 8, data: { typeId: 'ast_metallic' } });

test('describeEntity: identity, label, capabilities, hostility from shared IFF', () => {
  const s = state();
  const d = describeEntity(s, ship());
  assert.equal(d.type, 'ship');
  assert.equal(d.label, 'Ship');
  assert.equal(d.hostile, true, 'huntPlayer ship is hostile via scanner.isHostileToPlayer');
  assert.equal(d.capabilities.tetherable, true);
  assert.equal(d.capabilities.destructible, true);
  assert.equal(describeEntity(s, rock()).label, 'Metallic Asteroid');
  assert.equal(describeEntity(s, wreck()).capabilities.salvageable, true);
});

test('listComponents: ship has 5 combat subsystems (damage-serviced), rock has none', () => {
  const s = state();
  const comps = listComponents(s, ship());
  assert.equal(comps.length, 5);
  assert.deepEqual(comps.map((c) => c.componentId),
    ['subsystem_drive', 'subsystem_weapon', 'subsystem_sensor', 'subsystem_tether_spool', 'subsystem_power']);
  assert.ok(comps.every((c) => c.verb === 'damage' && c.kind === 'subsystem'));
  assert.equal(listComponents(s, rock()).length, 0);
});

test('listComponents: wreck exposes exactly its salvage weak-point (salvage-serviced)', () => {
  const s = state();
  const comps = listComponents(s, wreck());
  assert.equal(comps.length, 1);
  assert.equal(comps[0].componentId, 'pull_module');
  assert.equal(comps[0].verb, 'salvage');
  assert.equal(comps[0].kind, 'weakpoint');
});

test('component key is (stableEntityKey, componentId) — never bare entity id', () => {
  const s = state();
  const w = wreck();
  const comp = listComponents(s, w)[0];
  assert.equal(comp.key, `${stableEntityKey(w)}::pull_module`);
  assert.equal(stableEntityKey(w), 'sal:z7', 'wreck keys on durable salvagePointId');
  // asteroid without a world record keys on the quantized formation body key (stable across rematerialize).
  assert.equal(stableEntityKey(rock()), 'ast:5|0|ast_metallic|8');
  // worldRecordId wins when present.
  assert.equal(stableEntityKey({ id: 9, type: 'ship', data: { worldRecordId: 'wr-42' } }), 'wr:wr-42');
});

test('describeComponent returns the matching descriptor or null', () => {
  const s = state();
  assert.equal(describeComponent(s, ship(), 'subsystem_weapon').componentId, 'subsystem_weapon');
  assert.equal(describeComponent(s, ship(), 'nope'), null);
});

test('nextComponentSelection cycles forward/back and wraps; null when no components', () => {
  const s = state();
  const comps = listSelectableComponents(s, ship());
  assert.equal(nextComponentSelection(comps, null, 1).componentId, 'subsystem_drive');
  assert.equal(nextComponentSelection(comps, null, -1).componentId, 'subsystem_power');
  assert.equal(nextComponentSelection(comps, 'subsystem_drive', 1).componentId, 'subsystem_weapon');
  assert.equal(nextComponentSelection(comps, 'subsystem_power', 1).componentId, 'subsystem_drive', 'wraps to front');
  assert.equal(nextComponentSelection([], null, 1), null);
});

test('resolveComponentForVerb: subsystem selection resolves for damage, denies for wrong verb', () => {
  const s = state();
  const sh = ship();
  const sel = { componentId: 'subsystem_drive', kind: 'subsystem', verb: 'damage', stableKey: stableEntityKey(sh) };
  const dmg = resolveComponentForVerb(s, sh, 'damage', sel);
  assert.equal(dmg.ok, true);
  assert.equal(dmg.subsystemId, 'subsystem_drive');
  // servicing the same selection with the salvage verb is not serviceable.
  const salv = resolveComponentForVerb(s, sh, 'salvage', sel);
  assert.equal(salv.ok, false);
  assert.equal(salv.reason, DENIAL.COMPONENT_NOT_SERVICEABLE);
  // null selection → ok with no component (verb resolves geometrically as before).
  assert.deepEqual(resolveComponentForVerb(s, sh, 'damage', null), { ok: true });
});

test('resolveComponentForVerb: a selection made on another entity does not leak', () => {
  const s = state();
  const sh = ship();
  const staleSel = { componentId: 'subsystem_drive', kind: 'subsystem', verb: 'damage', stableKey: 'id:999' };
  const res = resolveComponentForVerb(s, sh, 'damage', staleSel);
  assert.equal(res.ok, false);
  assert.equal(res.reason, DENIAL.NO_COMPONENT);
});

test('resolveComponentForVerb: destroyed subsystem is not serviceable (falls back)', () => {
  const s = state();
  const sh = ship();
  s.combat.entities[String(sh.id)] = { subsystems: { subsystem_drive: { destroyed: true } } };
  const sel = { componentId: 'subsystem_drive', kind: 'subsystem', verb: 'damage', stableKey: stableEntityKey(sh) };
  const res = resolveComponentForVerb(s, sh, 'damage', sel);
  assert.equal(res.ok, false);
  assert.equal(res.reason, DENIAL.COMPONENT_NOT_SERVICEABLE);
  assert.equal(res.detail, 'destroyed');
});

test('capability flags: known profile/gate asymmetries are surfaced faithfully (findings)', () => {
  // profile.destructible=true for asteroid/payload, yet weapon-damage membership excludes them.
  assert.equal(capabilityFlagsForEntity(rock()).destructible, true);
  assert.equal(verbAcceptsType('damage', 'asteroid'), false);
  assert.equal(capabilityFlagsForEntity({ type: 'payload' }).destructible, true);
  assert.equal(verbAcceptsType('damage', 'payload'), false);
  // massSeed has no presentation profile (kind 'unknown') yet IS tether/damage eligible.
  assert.equal(capabilityFlagsForEntity({ type: 'massSeed' }).kind, 'unknown');
  assert.equal(verbAcceptsType('damage', 'massSeed'), true);
  assert.equal(verbAcceptsType('tether', 'massSeed'), true);
});

test('isWreckLikeEntity mirrors the scanner wreck-like predicate', () => {
  assert.equal(isWreckLikeEntity({ type: 'wreck' }), true);
  assert.equal(isWreckLikeEntity({ type: 'asteroid', data: { salvage: true } }), true);
  assert.equal(isWreckLikeEntity({ type: 'ship' }), false);
});
