// SFQ-I017: an attack tell disappears on the tick the owning tactic aborts.
// Seed 4242. The tell is the live aim indicator, not a timer and not a source scan.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { mulberry32 } from '../src/core/rng.js';
import { ai } from '../src/systems/ai.js';
import { ActionVfx } from '../src/render/actionVfx.js';

const SEED = 4242;
const DT = 1 / 60;

function aimLines(vfx) {
  return vfx.inspect().instances.filter((row) => row.event === 'ai:telegraph' && row.kind === 'attackRun');
}

function otherLines(vfx) {
  return vfx.inspect().instances.filter((row) => row.event === 'ai:telegraph' && row.kind === 'weapon_charge');
}

function rig() {
  const player = {
    id: 1, type: 'ship', alive: true, team: 0, name: 'Pilot',
    pos: { x: 80, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 8,
    hull: 100, hullMax: 100,
  };
  const npc = {
    id: 2, type: 'ship', alive: true, team: 1, name: 'Raider',
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 12,
    hull: 100, hullMax: 100,
    data: {
      weapons: [{ dps: 12, projSpeed: 340 }],
      combat: { targetId: 1, lockTarget: null, lockProgress: 0 },
      ai: { archetype: 'brawler', fsm: 'pursue', _retarget: 10 },
    },
  };
  const state = {
    mode: 'flight', simTime: 10, tick: 600, playerId: 1, rng: mulberry32(SEED),
    settings: { video: {} },
    entities: new Map([[1, player], [2, npc]]),
    player: { heat: 0 },
  };
  const scene = new THREE.Scene();
  const vfx = new ActionVfx(scene);
  const bus = {
    on() { return () => {}; },
    emit(name, payload) {
      if (name === 'ai:telegraph') vfx.emit(name, payload, state);
    },
  };
  ai.init({ state, bus, helpers: {} });
  return { state, player, npc, vfx };
}

test('a live attack keeps its aim line on the next presentation tick', () => {
  const { state, npc, vfx } = rig();
  try {
    ai._think(npc, npc.data, state, state.entities.get(1), DT);
    assert.equal(npc.data.ai._attackTelegraph.kind, 'attackRun');
    state.simTime += DT;
    vfx.update(state);
    assert.equal(aimLines(vfx).length, 1);
    ai._think(npc, npc.data, state, state.entities.get(1), DT);
    assert.equal(npc.data.ai._attackTelegraph.kind, 'attackRun');
    state.simTime += DT;
    vfx.update(state);
    assert.equal(aimLines(vfx).length, 1);
  } finally {
    vfx.dispose();
  }
});

test('aborting the attack drops the aim line on the next presentation tick', () => {
  const { state, player, npc, vfx } = rig();
  try {
    ai._think(npc, npc.data, state, player, DT);
    vfx.emit('ai:telegraph', { entityId: npc.id, kind: 'weapon_charge' }, state);
    state.simTime += DT;
    vfx.update(state);
    assert.equal(aimLines(vfx).length, 1);
    assert.equal(otherLines(vfx).length, 1);
    player.alive = false;
    ai._think(npc, npc.data, state, player, DT);
    assert.equal(npc.data.ai._attackTelegraph, undefined);
    state.simTime += DT;
    vfx.update(state);
    assert.equal(aimLines(vfx).length, 0);
    assert.equal(otherLines(vfx).length, 1);
  } finally {
    vfx.dispose();
  }
});
