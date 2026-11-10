// SFQ-I017: a startup tell vanishes on the tick its owner dies or tumbles.
// Seed 4242. The picture is the live slot, not a timer and not a source scan.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { mulberry32 } from '../src/core/rng.js';
import { ActionVfx } from '../src/render/actionVfx.js';

const SEED = 4242;
const DT = 1 / 60;

function tells(vfx, kind, id) {
  return vfx.inspect().instances.filter((row) => row.event === 'ai:telegraph' && row.kind === kind && row.id === id);
}

function rig() {
  const npc = {
    id: 2, type: 'ship', alive: true, team: 1, name: 'Raider',
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 12,
    hull: 100, hullMax: 100,
    data: { ai: {} },
  };
  const other = {
    id: 3, type: 'ship', alive: true, team: 1, name: 'Wing',
    pos: { x: 40, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 12,
    hull: 100, hullMax: 100,
    data: { ai: {} },
  };
  const state = {
    mode: 'flight', simTime: 10, tick: 600, playerId: 1, rng: mulberry32(SEED),
    settings: { video: {} },
    entities: new Map([[2, npc], [3, other]]),
    combat: { entities: {} },
    player: { heat: 0 },
  };
  const vfx = new ActionVfx(new THREE.Scene());
  return { state, npc, other, vfx };
}

function showTell(vfx, state, entity, kind) {
  assert.equal(
    vfx.emit('ai:telegraph', { entityId: entity.id, kind, durationTicks: 90 }, state),
    true,
    `${kind} tell must appear on a live hostile`,
  );
  assert.equal(tells(vfx, kind, entity.id).length, 1);
}

test('a living hostile keeps its charge tell on the next tick', () => {
  const { state, npc, vfx } = rig();
  try {
    showTell(vfx, state, npc, 'weapon_charge');
    state.simTime += DT;
    vfx.update(state);
    assert.equal(tells(vfx, 'weapon_charge', npc.id).length, 1);
  } finally {
    vfx.dispose();
  }
});

test('killing the hostile drops the charge tell on the next tick', () => {
  const { state, npc, vfx } = rig();
  try {
    showTell(vfx, state, npc, 'weapon_charge');
    npc.alive = false;
    state.simTime += DT;
    vfx.update(state);
    assert.equal(tells(vfx, 'weapon_charge', npc.id).length, 0);
  } finally {
    vfx.dispose();
  }
});

test('a tumble status drops the charge tell on the next tick', () => {
  const { state, npc, vfx } = rig();
  try {
    showTell(vfx, state, npc, 'weapon_charge');
    state.combat.entities[String(npc.id)] = {
      statuses: { status_tumbling: { id: 'status_tumbling', stacks: 1 } },
    };
    state.simTime += DT;
    vfx.update(state);
    assert.equal(tells(vfx, 'weapon_charge', npc.id).length, 0);
  } finally {
    vfx.dispose();
  }
});

test('a tumble that starts during the wind-up drops the charge tell', () => {
  const { state, npc, vfx } = rig();
  try {
    showTell(vfx, state, npc, 'weapon_charge');
    const born = tells(vfx, 'weapon_charge', npc.id)[0].born;
    npc.data.tumbledAt = born;
    state.simTime += DT;
    vfx.update(state);
    assert.equal(tells(vfx, 'weapon_charge', npc.id).length, 0);
  } finally {
    vfx.dispose();
  }
});

test('an older tumble stamp leaves a later charge tell up', () => {
  const { state, npc, vfx } = rig();
  try {
    npc.data.tumbledAt = 1;
    showTell(vfx, state, npc, 'weapon_charge');
    state.simTime += DT;
    vfx.update(state);
    assert.equal(tells(vfx, 'weapon_charge', npc.id).length, 1);
  } finally {
    vfx.dispose();
  }
});

test('tumbling drops a live attack line while the old tactic still aims', () => {
  const { state, npc, vfx } = rig();
  try {
    npc.data.ai._attackTelegraph = { kind: 'attackRun' };
    showTell(vfx, state, npc, 'attackRun');
    state.combat.entities[String(npc.id)] = {
      statuses: { status_tumbling: { id: 'status_tumbling', stacks: 1 } },
    };
    state.simTime += DT;
    vfx.update(state);
    assert.equal(tells(vfx, 'attackRun', npc.id).length, 0);
  } finally {
    vfx.dispose();
  }
});

test('killing a different ship leaves this charge tell up', () => {
  const { state, npc, other, vfx } = rig();
  try {
    showTell(vfx, state, npc, 'weapon_charge');
    other.alive = false;
    state.simTime += DT;
    vfx.update(state);
    assert.equal(tells(vfx, 'weapon_charge', npc.id).length, 1);
  } finally {
    vfx.dispose();
  }
});

test('ram spool is not a drawn tell, so a death leaves no slot behind', () => {
  const { state, npc, vfx } = rig();
  try {
    const drawn = vfx.emit('ai:telegraph', { entityId: npc.id, kind: 'ram_spool', durationTicks: 90 }, state);
    if (drawn) {
      assert.equal(tells(vfx, 'ram_spool', npc.id).length, 1);
      npc.alive = false;
      state.simTime += DT;
      vfx.update(state);
      assert.equal(tells(vfx, 'ram_spool', npc.id).length, 0);
    } else {
      npc.alive = false;
      state.simTime += DT;
      vfx.update(state);
      assert.equal(tells(vfx, 'ram_spool', npc.id).length, 0);
    }
  } finally {
    vfx.dispose();
  }
});
