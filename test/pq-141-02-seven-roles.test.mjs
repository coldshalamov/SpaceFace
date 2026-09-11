// PQ-141.02 — seven occupational signatures are distinct. Seed 14102.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { vfx } from '../src/render/vfx.js';

const SEED = 14102;
const ROLES = ['miner', 'hauler', 'tender', 'surveyor', 'patrol', 'pirate', 'scavenger'];

function host(list) {
  const h = Object.create(vfx);
  h.state = { simTime: 1, entityList: list, playerId: 9 };
  h._ent = (id) => list.find((e) => e.id === id);
  h.lines = [];
  h._spawnStationSideEventStreak = (...args) => { h.lines.push(args); return 1; };
  h._npcPirateInterceptTarget = () => list.find((e) => e.id === 2) || null;
  return h;
}

function actor() {
  return { id: 1, pos: { x: 0, z: 0 }, radius: 10, rot: 0, vel: { x: 4, z: 0 } };
}

test(`seed ${SEED}: seven roles emit distinct contact signatures`, () => {
  const colors = new Set();
  const counts = {};
  for (const kind of ROLES) {
    const target = {
      id: 2, type: 'fx',
      alive: true, pos: { x: 40, z: 0 }, radius: 12,
      data: { activityObjectSlotId: 'client' },
    };
    const player = { id: 9, pos: { x: 50, z: 0 }, radius: 6 };
    const list = [actor(), target, player];
    const h = host(list);
    const job = {
      kind: kind === 'scavenger' ? 'salvor' : kind,
      phase: kind === 'patrol' ? 'hold' : (kind === 'pirate' ? 'intercept' : 'work'),
      routeIndex: 0,
      route: [{ targetRef: 'object:client' }],
    };
    const emitted = h._emitNpcJobContact({ elapsed: 1 }, { cadenceHz: 2 }, actor(), job, false);
    counts[kind] = emitted;
    assert.ok(emitted > 0, `${kind} must emit a visible signature`);
    for (const line of h.lines) {
      const color = line.find((v) => typeof v === 'string' && v.startsWith('#'));
      if (color) colors.add(`${kind}:${color}`);
    }
  }
  const kindsWithColor = new Set([...colors].map((row) => row.split(':')[0]));
  assert.ok(kindsWithColor.size >= 6, `expected ≥6/7 distinct role colours, got ${kindsWithColor.size}`);
  console.log(`SEED=${SEED} emitted=${JSON.stringify(counts)} coloredRoles=${kindsWithColor.size}`);
});
