// SEED-SW-21 — Singularity Mortar: the lobbed shell plants a brief gravity well (~1 s),
// drags what it caught toward the pit, then detonates — damage + shove through the combat
// and physics authorities, never a direct HP or velocity write.
import assert from 'node:assert/strict';
import test from 'node:test';

import { WEAPONS } from '../src/data/weapons.js';
import { SWARM_DRAFT_OFFERS } from '../src/data/swarmDraft.js';
import { weapons } from '../src/systems/weapons.js';

const SEED = 4242;
const DEF = WEAPONS.find((d) => d.id === 'wpn_singularity_mortar_m');

function ship(id, x, z, team) {
  return { id, type: 'ship', alive: true, pos: { x, z }, vel: { x: 0, z: 0 }, radius: 8, team, data: {} };
}

test('singularity mortar is a catalogued lobber on the swarm shelf', () => {
  assert.ok(DEF);
  assert.equal(SWARM_DRAFT_OFFERS.find((o) => o.defId === DEF.id)?.id, 'singularity_mortar');
  assert.ok(DEF.mortarShell && DEF.mortarShell.pullS >= 0.5 && DEF.mortarShell.pullS <= 2, `pull ${DEF.mortarShell.pullS}s`);
});

test('the shell lands, holds a ~1 s pull, then detonates through the combat router', () => {
  void SEED;
  const owner = ship('player', 0, 0, 'player');
  const victim = ship('v1', 300, 0, 'brood');           // inside pull + blast radius
  const shell = {
    id: 'shell1', type: 'projectile', alive: true,
    pos: { x: 260, z: 0 }, vel: { x: 300, z: 0 }, radius: 2, rot: 0,
    ownerId: 'player', team: 'player',
    data: {
      weaponId: DEF.id, mortar: { ...DEF.mortarShell },
      spawnPos: { x: 0, z: 0 }, maxDistance: 260,
    },
  };
  const entities = new Map([[owner.id, owner], [victim.id, victim], [shell.id, shell]]);
  const state = {
    tick: 5, simTime: 0, playerId: 'player', entities,
    entityList: [...entities.values()], entityIndex: null, spatialHash: null,
  };
  const events = [];
  const damage = [];
  const host = Object.assign(Object.create(weapons), {
    state,
    helpers: {
      getEntity: (id) => entities.get(id) || null,
      routeCombatDamage: (req) => { damage.push(req.targetId); return true; },
    },
    bus: { emit: (name, payload) => events.push({ name, payload }) },
    _mortarShots: new Map(),
  });
  // Tick 1: the shell has flown its authored range → it plants and the pull phase begins.
  weapons._tickMortarShots.call(host, 1 / 60, state);
  const rec = host._mortarShots.get(shell.id);
  assert.equal(rec.phase, 'pull');
  assert.equal(shell.alive, false, 'range landing ends the projectile without fabricating a hit');
  const landing = { ...rec.pos };
  assert.ok(rec.pullUntil - state.simTime >= 1.0 - 1e-6, `pull window ${rec.pullUntil - state.simTime}s`);
  assert.ok(events.some((e) => e.name === 'weapons:mortarLanded'), 'landing receipt');
  // During the well: victim is inside the radius and NOT the owner — the pull leg runs
  // without erroring on a non-authority body.
  shell.pos.x += 100;
  weapons._tickMortarShots.call(host, 1 / 60, state);
  assert.equal(rec.phase, 'pull', 'well still holding inside its window');
  assert.deepEqual(rec.pos, landing, 'pull and blast stay at the accepted landing point');
  // Past the window → detonation: the victim takes the packet through routeCombatDamage,
  // the owner is excluded, and the detonation receipt names the hits.
  state.simTime = rec.pullUntil + 0.001;
  weapons._tickMortarShots.call(host, 1 / 60, state);
  assert.equal(rec.phase, 'done');
  assert.ok(damage.includes('v1'), `victim damaged: ${JSON.stringify(damage)}`);
  assert.ok(!damage.includes('player'), 'owner never takes own blast');
  const det = events.find((e) => e.name === 'weapons:mortarDetonated');
  assert.ok(det && det.payload.hits.includes('v1'), 'detonation receipt names the hit');
  assert.deepEqual(det.payload.pos, landing, 'detonation shares the planted shell position');
});
