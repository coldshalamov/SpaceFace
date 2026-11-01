/**
 * Onboarding's scripted target actors are the lesson's own target dummies: the
 * tutorial orders shots at them ("Fire a short burst into the raider"), and their
 * passive ai flags would bank permanent suspicion residue for obeying the teacher
 * (run 117: 0.132 by t=95, one weir bolt from a frozen warrant at Rook's pad).
 * The set dressing — the raid hauler bystander — still prices unprovoked hits.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { heat } from '../src/systems/heat.js';

function makeBus() {
  const handlers = {};
  return {
    on(name, fn) {
      (handlers[name] || (handlers[name] = [])).push(fn);
    },
    emit(name, payload) {
      for (const fn of handlers[name] || []) fn(payload);
    },
  };
}

function boot() {
  const player = { id: 1, type: 'ship', alive: true, team: 0, pos: { x: 0, z: 0 } };
  // The marker/burst beats' drone ("Fleeing Raider" / "SCN Gunnery Buoy").
  const trainer = {
    id: 20, type: 'drone', alive: true, team: 0, pos: { x: 40, z: 0 },
    data: { onboarding: true, onboardingTraining: true, ai: { passive: true } },
  };
  // The raid tableau's crippled pirate hulk (the swing-into-rock lesson body).
  const claimJumper = {
    id: 21, type: 'ship', alive: true, team: 1, pos: { x: 60, z: 0 },
    data: { onboarding: true, onboardingRaid: true, ai: { passive: true } },
  };
  // The raider's armed wing — the live-fire lesson rounds.
  const wing = {
    id: 22, type: 'ship', alive: true, team: 1, pos: { x: 80, z: 0 },
    data: { onboarding: true, onboardingRaidWing: true, ai: { passive: true } },
  };
  // Set dressing the script never tells the player to shoot: a civilian bystander.
  const hauler = {
    id: 23, type: 'drone', alive: true, team: 2, pos: { x: 100, z: 0 },
    data: { onboarding: true, raidRole: 'hauler', ai: { passive: true } },
  };
  const civilian = { id: 30, type: 'ship', alive: true, team: 2, pos: { x: 120, z: 0 } };
  const entities = new Map([
    [1, player], [20, trainer], [21, claimJumper], [22, wing], [23, hauler], [30, civilian],
  ]);
  const state = {
    playerId: 1,
    simTime: 12,
    player: { heat: 0 },
    entities,
    entityList: [...entities.values()],
    factions: {},
  };
  const bus = makeBus();
  const sys = Object.create(heat);
  sys.init({ state, bus });
  return { state, bus, sys };
}

const HIT = (targetId) => ({
  attackerId: 1, targetId, amount: 6, type: 'kinetic', targetHostileToPlayer: false,
});

test('shots on the tutorial trainer bank no suspicion', () => {
  const { state, bus } = boot();
  bus.emit('combat:damage', HIT(20));
  assert.equal(state.player.heat, 0);
});

test('shots on the Claim Jumper and its wing bank no suspicion', () => {
  const { state, bus } = boot();
  bus.emit('combat:damage', HIT(21));
  bus.emit('combat:damage', HIT(22));
  assert.equal(state.player.heat, 0);
});

test('set dressing the script never targets still prices unprovoked hits', () => {
  const { state, bus } = boot();
  bus.emit('combat:damage', HIT(23));
  assert.ok(state.player.heat > 0, 'the raid hauler bystander must still mint suspicion');
});

test('ordinary civilians still mint suspicion alongside the exemption', () => {
  const { state, bus } = boot();
  bus.emit('combat:damage', HIT(30));
  assert.ok(state.player.heat > 0);
});
