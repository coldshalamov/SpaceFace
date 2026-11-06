// inf-bank-cascade-yield — the staged beat outranks the cascade. Two shipped systems
// fought: the composition bank (planSwarmBank) stages a three-beat opening — first pass,
// flank lob, second pass — and the B-BLOOM grief loop bends every living mourner toward
// a fresh corpse. A corpse next to the staged slot armed the bend on the STAGED body too:
// the second charger mourned its way off its flank into the hull scrum the first pass had
// just made, touched the hull, and died by the room's own collision law before its stage
// ever called it — the bank's authored second pass died of room noise, red in
// test/swarm-bank.test.mjs since the grief loop landed. The repair is the law the engine
// already keeps for windups: the attack language outranks the cascade. A bank-staged slot
// (slot + spawn serial, the same last-write identity the FSM holds) does not mourn and
// does not panic while the bank holds it; unstaged cells keep every scrap of the answer,
// and a still-live grief resumes bending the moment the bank releases the slot.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { createBroodEngine } from '../src/systems/swarmBrood.js';
import { BROOD_PHASE_FLOCK } from '../src/systems/swarmBrood.js';
import { BROOD_GRIEF_S } from '../src/data/swarmBrood.js';

const DT = 1 / 60;
const SEED = 4242;

/** The bank room: the one arena rock the composition needs, the ordinary wave behind it. */
function fixture(wave) {
  const state = createGameState(SEED);
  const player = { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 }, radius: 6, mass: 20 };
  state.entities.set(1, player); state.entityList.push(player); state.playerId = 1;
  const stone = { id: 2, type: 'asteroid', alive: true, pos: { x: 88, z: 0 },
    vel: { x: 0, z: 0 }, radius: 8, collides: true, physicsBody: { dynamic: true },
    data: { swarmArenaDebris: true, terrainAnchor: true } };
  state.entities.set(2, stone); state.entityList.push(stone);
  state.entityIndex = { __spacefaceEntityIndexV1: true, ready: true,
    asteroids: [stone], shipLike: [player] };
  state.run = createRunState({ kind: 'survival', ruleset: 'swarm', seed: SEED });
  Object.assign(state.run, { phase: 'active', wave, arenaId: 'helios_core', arenaMutators: [] });
  state.mode = 'flight';
  state.simTime = 30;
  const busLog = [];
  const engine = createBroodEngine({ getState: () => state,
    bus: { emit: (type, payload) => busLog.push({ type, payload }) }, fieldList: () => [] });
  engine.prepareWave(state.run, wave);
  engine.spawnWave(state);
  return { state, engine, busLog, player, bodies: engine._bodies };
}

/** The staged trio from the engine's own bank record: [[slot, life], ...] filtered live. */
function bankSlots(h) {
  const bk = h.engine._bank();
  assert.ok(bk, 'the wave staged its bank');
  return bk.slots.filter(([slot, life]) => h.bodies.alive[slot] === 1 && h.bodies.serial[slot] === life);
}

/** Quiet the room except the named slots, so the staged cascade read is the only one. */
function silenceExcept(h, keep) {
  const keepSet = new Set(keep);
  for (let j = 0; j < h.bodies.alive.length; j++) {
    if (h.bodies.alive[j] === 1 && !keepSet.has(j)) h.bodies.alive[j] = 0;
  }
}

/** The first unstaged live mite outside the named slots. */
const findMite = (h, except) => h.bodies.alive.findIndex((alive, i) => alive === 1
  && !except.includes(i) && h.bodies.liveFamilyId[h.bodies.family[i]] === 'mite');

function steps(h, seconds) {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) { h.state.simTime += DT; h.engine.step(h.state); }
}

const dist = (h, i, x, z) => Math.hypot(h.bodies.px[i] - x, h.bodies.pz[i] - z);

test('a staged slot holds its beat while an unstaged neighbor mourns the same corpse', () => {
  const h = fixture(7);
  const staged = bankSlots(h);
  const held = staged[2][0]; // the second pass: the slot whose stage comes last
  const victim = findMite(h, staged.map(([s]) => s));
  assert.ok(victim >= 0, 'an unstaged mite exists to die beside the staged slot');
  const witness = findMite(h, [...staged.map(([s]) => s), victim]);
  assert.ok(witness >= 0, 'a second unstaged mite exists as the mourning comparator');

  // The corpse lands 12 wu off the staged slot on the side AWAY from the player, so the
  // slot's ordinary seek (toward the pilot) pulls opposite the mourning bend: any closing
  // on this corpse is the cascade's doing, not the flock's day job. The witness sits one
  // ring further out on the same line.
  const away = Math.hypot(h.bodies.px[held], h.bodies.pz[held]) || 1;
  const ax = h.bodies.px[held] / away, az = h.bodies.pz[held] / away;
  const corpse = { x: h.bodies.px[held] + ax * 12, z: h.bodies.pz[held] + az * 12 };
  h.bodies.px[victim] = corpse.x; h.bodies.pz[victim] = corpse.z;
  h.bodies.vx[victim] = 0; h.bodies.vz[victim] = 0;
  h.bodies.px[witness] = corpse.x + ax * 12; h.bodies.pz[witness] = corpse.z + az * 12;
  h.bodies.vx[witness] = 0; h.bodies.vz[witness] = 0;
  h.bodies.phase[held] = BROOD_PHASE_FLOCK;
  h.bodies.phase[witness] = BROOD_PHASE_FLOCK;
  silenceExcept(h, [...staged.map(([s]) => s), victim, witness]);
  h.engine.onExplosion({ pos: corpse, radius: 4, ownerId: h.player.id });
  assert.equal(h.bodies.alive[victim], 0, 'the corpse is made');
  assert.equal(h.bodies.alive[held], 1, 'the staged slot survives the corpse beside it');
  const census = h.engine.census();
  assert.ok(census.mourners >= 1, `the room mourns (${census.mourners} mourners)`);

  // The witness closes on the corpse; the staged slot does not walk its beat into it.
  const heldStart = dist(h, held, corpse.x, corpse.z);
  const witnessStart = dist(h, witness, corpse.x, corpse.z);
  steps(h, 1.0);
  const heldNow = dist(h, held, corpse.x, corpse.z);
  const witnessNow = dist(h, witness, corpse.x, corpse.z);
  assert.ok(witnessNow < witnessStart - 2,
    `the unstaged mourner still bends (${witnessStart.toFixed(1)} -> ${witnessNow.toFixed(1)})`);
  assert.ok(heldNow >= heldStart - 1,
    `the staged slot holds its ground (${heldStart.toFixed(1)} -> ${heldNow.toFixed(1)})`);
  // The yield is the bank's hold, not a cancelled answer: past the bank's own window the
  // staged slot's mourning clock has expired with the room's (BROOD_GRIEF_S), so run the
  // bank out and confirm the engine itself is unchanged otherwise.
  steps(h, BROOD_GRIEF_S);
  assert.equal(h.engine.census().mourners, 0, 'the grief clock expires on schedule');
  h.engine.clear();
});

test('a staged slot does not bolt when a mass kill panics the pack around it', () => {
  // Wave 15 fields the wake_eel (mass 120 — above the authored panic threshold) and is
  // bank-eligible, so one room can stage the beat AND the mass kill.
  const h = fixture(15);
  const staged = bankSlots(h);
  const held = staged[2][0];
  const victim = h.bodies.alive.findIndex((alive, i) => alive === 1
    && !staged.some(([s]) => s === i) && h.bodies.liveFamilyId[h.bodies.family[i]] === 'wake_eel');
  assert.ok(victim >= 0, 'an unstaged wake_eel exists to be the mass kill');
  const witness = h.bodies.alive.findIndex((alive, i) => alive === 1
    && !staged.some(([s]) => s === i) && i !== victim
    && h.bodies.liveFamilyId[h.bodies.family[i]] === 'mite');
  assert.ok(witness >= 0, 'an unstaged mite exists as the panic comparator');

  const corpse = { x: h.bodies.px[held] + 30, z: h.bodies.pz[held] };
  h.bodies.px[victim] = corpse.x; h.bodies.pz[victim] = corpse.z;
  h.bodies.vx[victim] = 0; h.bodies.vz[victim] = 0;
  h.bodies.px[witness] = corpse.x; h.bodies.pz[witness] = corpse.z + 20;
  h.bodies.vx[witness] = 0; h.bodies.vz[witness] = 0;
  h.bodies.phase[held] = BROOD_PHASE_FLOCK;
  h.bodies.phase[witness] = BROOD_PHASE_FLOCK;
  silenceExcept(h, [...staged.map(([s]) => s), victim, witness]);
  h.engine.onExplosion({ pos: corpse, radius: 4, ownerId: h.player.id });
  assert.ok(h.engine.census().panicking >= 1, 'the pack around the corpse panics');
  const witnessStart = dist(h, witness, corpse.x, corpse.z);
  const heldStart = dist(h, held, corpse.x, corpse.z);
  const witness0 = { x: h.bodies.px[witness], z: h.bodies.pz[witness] };
  const held0 = { x: h.bodies.px[held], z: h.bodies.pz[held] };
  for (let t = 0; t < 45; t++) { h.state.simTime += DT; h.engine.step(h.state); }
  const witnessBolt = Math.hypot(h.bodies.px[witness] - witness0.x, h.bodies.pz[witness] - witness0.z);
  const heldMove = Math.hypot(h.bodies.px[held] - held0.x, h.bodies.pz[held] - held0.z);
  assert.ok(dist(h, witness, corpse.x, corpse.z) > witnessStart + 25,
    `the unstaged neighbor bolts outward from the corpse (${dist(h, witness, corpse.x, corpse.z).toFixed(1)} from ${witnessStart.toFixed(1)})`);
  assert.ok(heldMove < witnessBolt * 0.4 && dist(h, held, corpse.x, corpse.z) < heldStart + 15,
    `the staged slot keeps its beat (moved ${heldMove.toFixed(1)} vs bolt ${witnessBolt.toFixed(1)})`);
  h.engine.clear();
});
