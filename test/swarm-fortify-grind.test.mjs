// SWARM-GRIND-01 — the Fortify Gravity Beacon must gather light attackers into a readable
// ring, not pull them into its own collider and grind them. Focused Node repro: a real
// Fortify-built beacon plus eight real Wasp Swarmer hulls (Swarm-materialized: fodder hull,
// character-sheet body) diving through it at combat pace inside the authoritative sim on
// the real Rapier authority. Packet assertions:
//   * zero `entity:killed` payloads whose impactorId is the beacon body;
//   * the hostiles end GATHERED — most inside a ring band around the beacon and slow.
// The same file pushes a light hostile into every other Fortify body at ordinary speed
// (bounce, not die — no device description promises contact damage) and proves a thrown
// body still kills what it hits, so the fix never weakened collision damage globally.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRunState } from '../src/core/runState.js';
import { FIELD_FLAGS } from '../src/data/fields.js';
import { COMBAT_FLAGS } from '../src/data/featureFlags.js';
import { runSession } from '../src/systems/runSession.js';
import { fields as fieldOwner } from '../src/systems/fields.js';
import { swarmFortify } from '../src/systems/swarmFortify.js';
import { collisionConsequences } from '../src/systems/collisionConsequences.js';
import { createSimulation } from '../src/core/sim.js';
import { createGameState } from '../src/core/gameState.js';
import { physics } from '../src/core/physics.js';
import { combat, makeEnemySpawnSpec } from '../src/systems/combat.js';
import { applySwarmFeelSpec } from '../src/systems/waveMaterialization.js';
import { swarmFeel } from '../src/data/swarmFeelProfile.js';

const BEACON_FIELD = { radius: 190, innerRadius: 72, innerSoft: 48 };
// The beacon's collider (12) plus a Wasp's hull radius (12): contact distance between
// centers. The ring's settled band starts a body-length clear of it.
const CONTACT_R = 24;
const RING_LO = 40;
const RING_HI = BEACON_FIELD.innerRadius + BEACON_FIELD.innerSoft + 12;
const SLOW_WU = 40;
const ORDINARY_WU = 60;   // a fodder transit at ordinary speed
const DIVE_WU = 105;      // the Wasp's authored combat speed — the look's dive

function makeRun({ credits = 1000, phase = 'draft', wave = 1 } = {}) {
  const run = createRunState({ kind: 'survival', ruleset: 'swarm', seed: 27 });
  run.phase = phase;
  run.wave = wave;
  run.credits = credits;
  return run;
}

// The systems the kill needs for real: the fortify owner places, the field owner moves
// bodies, flight owns hull drag, physics owns contact, collisionConsequences -> combat
// owns the kill. Turret volley/tesla arc damage is NOT under test — contact is.
const SYSTEMS = [runSession, fieldOwner, swarmFortify, combat, collisionConsequences, physics];

async function makeSim(seed) {
  const state = createGameState(seed);
  state.run = makeRun();
  const sim = createSimulation({ seed, state, systems: SYSTEMS });
  sim.state.mode = 'flight';
  const physicsOwner = sim.registry.get('physics');
  assert.equal(await physicsOwner.prepareBackend(sim.state, { initTimeoutMs: 5000 }), true,
    'the contact law runs on the real Rapier authority');
  const player = sim.spawn({
    type: 'ship', team: 0, alive: true, pos: { x: 0, z: 0 }, radius: 8,
    factionId: 'faction_player', data: { defId: 'ship_kestrel' },
  });
  sim.state.playerId = player.id;
  sim.bus.emit('run:wavePlanned', { wave: 1 });
  return sim;
}

function buildDevice(sim, requestId, deviceId, socketId = 'front-near', facing = null) {
  const fortify = sim.registry.get('swarmFortify');
  const receipt = fortify.build({
    requestId, runToken: fortify.getReadModel().runToken, deviceId, socketId, facing,
  });
  assert.equal(receipt.accepted, true, `${deviceId} should build through the real fortify owner`);
  const structures = [...sim.state.entities.values()]
    .filter((entity) => entity.data?.swarmFortify?.deviceId === deviceId);
  assert.ok(structures.length >= 1, `${deviceId} should leave a live structure body`);
  return structures;
}

// One Swarm-materialized Wasp Swarmer — the real enemy spawn spec stamped the way wave
// materialization stamps it (fodder hull, character-sheet radius/mass/speed, contact law).
function spawnWasp(sim, pos, vel = null) {
  const spec = makeEnemySpawnSpec('wasp_swarmer', 1, pos);
  applySwarmFeelSpec(spec, 'wasp_swarmer', swarmFeel(sim.state));
  if (vel) spec.vel = { x: vel.x, z: vel.z };
  return sim.spawn(spec);
}

function dist(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }
function speed(entity) { return Math.hypot(entity.vel?.x ?? 0, entity.vel?.z ?? 0); }

test('Gravity Beacon gathers eight diving Wasp Swarmers onto a ring — none die on the device', async () => {
  const prevFields = FIELD_FLAGS.enabled;
  const prevCombat = COMBAT_FLAGS.weaponImpulseConsequences;
  FIELD_FLAGS.enabled = true;
  COMBAT_FLAGS.weaponImpulseConsequences = true;
  const sim = await makeSim(90314);
  const killed = [];
  const contacts = [];
  sim.bus.on('entity:killed', (payload) => killed.push(payload));
  sim.bus.on('combat:collisionConsequence', (payload) => contacts.push(payload));
  try {
    const [beacon] = buildDevice(sim, 1, 'gravity_beacon');
    assert.ok(beacon.data?.fieldAnchor, 'the beacon must own a live field anchor');

    // The look's shape: a fodder pack transiting toward the player's side at combat pace —
    // roughly parallel vectors, spread across the well's face. The unfixed well dragged the
    // transit into the collider and ground ~ten of them in five seconds; the fix must catch
    // the pack onto the ring instead. (Eight bodies aimed dead-center at one point kill each
    // other in open space with no well at all — verified counterfactual — so the repro uses
    // the real transit shape, not a synchronized head-on.)
    const wasps = [];
    for (let i = 0; i < 8; i++) {
      const lane = i % 4;                 // four rough lanes through the well's face
      const pos = {
        x: beacon.pos.x - 170 - 30 * Math.floor(i / 4),
        z: beacon.pos.z - 70 + lane * 45,
      };
      const vel = { x: DIVE_WU, z: (i % 2 === 0 ? 1 : -1) * 8 };
      wasps.push(spawnWasp(sim, pos, vel));
    }
    sim.state.run.phase = 'active';
    for (let tick = 0; tick < 600; tick++) sim.step();

    const beaconKills = killed.filter((k) => k.impactorId === beacon.id);
    assert.equal(beaconKills.length, 0,
      `beacon body caused ${beaconKills.length} kill(s): ${JSON.stringify(beaconKills.map((k) => k.id ?? k.victimId))}`);

    const rows = wasps.map((wasp) => ({
      alive: wasp.alive !== false,
      r: Math.round(dist(wasp.pos, beacon.pos) * 10) / 10,
      v: Math.round(speed(wasp) * 10) / 10,
    }));
    const gathered = rows.filter((row) => row.alive && row.r >= RING_LO && row.r <= RING_HI && row.v < SLOW_WU);
    assert.ok(gathered.length >= 6,
      `expected most of the pack settled in the ring band [${RING_LO},${RING_HI}] slow; rows=${JSON.stringify(rows)}`);
    const touched = contacts.filter((c) => c.otherId === beacon.id && wasps.some((w) => w.id === c.targetId));
    assert.ok(touched.every((c) => (c.impactDamage ?? 0) === 0),
      `beacon contact must not deal damage; saw ${JSON.stringify(touched.map((c) => c.impactDamage))}`);
    // Thrown-body preservation in the same run: a flung wreck still kills a Wasp it meets.
    const [farWasp] = [spawnWasp(sim, { x: beacon.pos.x + 400, z: beacon.pos.z })];
    const wreck = sim.spawn({
      type: 'wreck', team: 9, pos: { x: farWasp.pos.x + 90, z: farWasp.pos.z },
      vel: { x: -110, z: 0 }, radius: 12, collides: true, hull: 60, hullMax: 60,
      physicsBody: { schemaVersion: 1, radius: 12, mass: 55, inertiaY: 220, dynamic: true, ccd: false, material: 'debris', revision: 0 },
      data: { majorDebris: true, parentType: 'debris' },
    });
    for (let tick = 0; tick < 120; tick++) sim.step();
    const thrownKill = killed.find((k) => k.impactorId === wreck.id);
    assert.ok(thrownKill, 'a thrown body must still kill the light hostile it meets');
    assert.equal(farWasp.alive, false, 'the thrown-body kill path is unchanged');
  } finally {
    sim.dispose();
    FIELD_FLAGS.enabled = prevFields;
    COMBAT_FLAGS.weaponImpulseConsequences = prevCombat;
  }
});

// Packet step 3 — every other Fortify body, same file: a light hostile pushed or flying
// into it at ordinary speed bounces rather than dies. No device description promises
// contact damage, so the contact contract holds at both probe speeds.
const CONTACT_DEVICES = [
  { deviceId: 'repulsor_pylon', socketId: 'front-near', facing: null },
  { deviceId: 'tesla_pair', socketId: 'port-near', facing: null },
  { deviceId: 'kinetic_turret', socketId: 'starboard-near', facing: null },
  { deviceId: 'reflector_fin', socketId: 'front-far', facing: 'square' },
];

for (const probe of CONTACT_DEVICES) {
  test(`a light hostile pushed into a ${probe.deviceId} bounces — the structure never kills on contact`, async () => {
    const prevFields = FIELD_FLAGS.enabled;
    const prevCombat = COMBAT_FLAGS.weaponImpulseConsequences;
    FIELD_FLAGS.enabled = true;
    COMBAT_FLAGS.weaponImpulseConsequences = true;
    const sim = await makeSim(91700 + probe.deviceId.length * 13);
    const killed = [];
    const contacts = [];
    sim.bus.on('entity:killed', (payload) => killed.push(payload));
    sim.bus.on('combat:collisionConsequence', (payload) => contacts.push(payload));
    try {
      const structures = buildDevice(sim, 1, probe.deviceId, probe.socketId, probe.facing);
      sim.state.run.phase = 'active';
      const wasps = [];
      for (const structure of structures) {
        for (const [side, inbound] of [[1, ORDINARY_WU], [-1, DIVE_WU]]) {
          const gap = (structure.radius ?? 12) + 40;
          const pos = { x: structure.pos.x + side * gap, z: structure.pos.z };
          wasps.push({ wasp: spawnWasp(sim, pos, { x: -side * inbound, z: 0 }), structure, inbound });
        }
      }
      for (let tick = 0; tick < 300; tick++) sim.step();
      const rows = [];
      for (const { wasp, structure, inbound } of wasps) {
        const structContacts = contacts.filter((c) => c.targetId === wasp.id && c.otherId === structure.id);
        rows.push({
          inbound,
          structure: structure.id,
          contacts: structContacts.length,
          contactDamage: structContacts.map((c) => c.impactDamage ?? 0),
          alive: wasp.alive !== false,
          killedBy: killed.find((k) => (k.victimId ?? k.id) === wasp.id)?.impactorId ?? null,
        });
      }
      for (const structure of structures) {
        const structureKills = killed.filter((k) => k.impactorId === structure.id);
        assert.equal(structureKills.length, 0,
          `${probe.deviceId} body killed on contact: ${JSON.stringify(rows)}`);
      }
      assert.ok(rows.every((row) => row.contactDamage.every((d) => d === 0)),
        `${probe.deviceId} contact dealt damage: ${JSON.stringify(rows)}`);
      for (const row of rows) {
        if (row.contacts > 0) {
          assert.equal(row.alive, true,
            `${probe.deviceId}: the ${row.inbound} WU/s transit contacted and must bounce, not die; ${JSON.stringify(row)}`);
        }
      }
    } finally {
      sim.dispose();
      FIELD_FLAGS.enabled = prevFields;
      COMBAT_FLAGS.weaponImpulseConsequences = prevCombat;
    }
  });
}
