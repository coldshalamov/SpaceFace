import test from 'node:test';
import assert from 'node:assert/strict';
import { bootRealPath, writeRealPathInput } from '../scripts/lib/bench/realPath.mjs';
import { createGameState } from '../src/core/gameState.js';
import { clearEntityRuntime } from '../src/core/entity.js';
import { FRESH_RUN_SYSTEMS, resetFreshRunSystems } from '../src/core/runReset.js';
import { applyFeatureConfigToMaps, snapshotFeatureMaps, restoreFeatureMaps } from '../src/data/featureFlags.js';
import { terrainAnchors } from '../src/systems/terrainAnchors.js';

const SEED = 4242;
const DT = 1 / 60;
const resetKeys = ['meta', 'rng', 'input', 'bounds', 'spatialHash', 'player', 'run', 'combat', 'world'];

async function boot() {
  return bootRealPath({ seed: SEED, systems: [terrainAnchors, 'flightV3', 'physics'] });
}

async function startArena(h) {
  const { state, runtime } = h;
  state.run.ruleset = 'swarm';
  // Canonical scene construction spawns the player before encounter content. This also
  // reconciles the entity index after the old scene's store was cleared.
  h.spawnShip({ hullId: 'ship_kestrel', isPlayer: true, pos: { x: 0, z: 0 }, rot: 0 });
  h.withFeatures(() => h.bus.emit('encounter:telegraph', {
    encounterId: 'survival-arena-w1', kind: 'survival_arena', arcadeLayout: true,
    arenaSeed: state.meta.seed, pos: { x: 0, z: 0 },
  }));
  const anchors = state.entityList.filter(e => e.data?.terrainAnchor);
  assert.equal(anchors.length, 6);
  const authored = anchors.map(e => ({ id: e.id, x: e.pos.x, z: e.pos.z, radius: e.radius, spin: e.angVel }));
  // Initial scene placement only. Every subsequent sample is produced by real flight/native physics.
  const rock = anchors[0];
  h.player.pos.x = rock.pos.x - 50;
  h.player.pos.z = rock.pos.z;
  const previous = snapshotFeatureMaps();
  applyFeatureConfigToMaps(runtime.config.features);
  try {
    assert.equal(await runtime.getSystem('physics').prepareBackend(state, { reset: true }), true);
  } finally {
    restoreFeatureMaps(previous);
  }
  state.mode = 'flight';
  h.bus.emit('game:started', {});
  h.bus.flush();
  return authored;
}

// Observe the existing native solver directly. This reset regression must not depend
// on the separate Leecher contact-sampling API or count broad-phase candidates as contact.
function nativeAnchorContacts(native, playerId) {
  const player = native.records.get(playerId);
  assert.ok(player?.entity.alive && player.colliders.length > 0, 'the player has live native colliders');
  let contacts = 0;
  for (const collider of player.colliders) {
    if (collider.isSensor()) continue;
    native.world.contactPairsWith(collider, other => {
      const anchor = native._colliderOwners.get(other.handle)?.rec.entity;
      if (other.isSensor() || anchor?.alive === false || !anchor?.data?.terrainAnchor) return;
      native.world.contactPair(collider, other, manifold => {
        for (let i = 0; i < manifold.numSolverContacts(); i++) {
          if (manifold.solverContactDist(i) <= .05) contacts++;
        }
      });
    });
  }
  return contacts;
}

function fly(h) {
  const tape = [];
  let contacts = 0;
  for (let tick = 0; tick < 180; tick++) {
    writeRealPathInput(h.state, { moveZ: tick < 90 ? .35 : 0 });
    h.runtime.step(DT);
    const native = h.runtime.getSystem('physics')._sg02;
    contacts += nativeAnchorContacts(native, h.player.id);
    tape.push({ bodies: native.quantizedSnapshot(), player: {
      pos: { ...h.player.pos }, vel: { ...h.player.vel }, rot: h.player.rot, angVel: h.player.angVel,
    } });
  }
  assert.ok(contacts > 0, 'the player actually encounters native anchor skin');
  return tape;
}

function freshRun(h, seed) {
  const { state, runtime } = h;
  state.mode = 'loading';
  for (const e of [...state.entityList]) {
    clearEntityRuntime(e);
    h.bus.emit('entity:destroyed', { id: e.id, type: e.type, pos: { ...e.pos }, radius: e.radius, reason: 'run_reset' });
  }
  state.entities.clear(); state.entityList.length = 0; state.freeIds.length = 0;
  state.nextEntityId = 1; state.playerId = 0;
  const fresh = createGameState(seed);
  for (const key of resetKeys) state[key] = fresh[key];
  state.tick = 0; state.simTime = 0; state.days = 0; state.accumulator = 0;
  resetFreshRunSystems({ get: name => runtime.getSystem(name) });
  h.bus.emit('game:newGame', { seed });
  h.bus.flush();
}

test('canonical retained New Game reseeds anchor geometry/spin and reproduces native/player motion', async () => {
  const h = await boot();
  try {
    const owner = h.runtime.getSystem('terrainAnchors');
    const subscriptions = owner._unsubs.slice();
    const first = await startArena(h);
    const expected = fly(h);
    freshRun(h, SEED);
    assert.equal(h.runtime.getSystem('terrainAnchors'), owner);
    assert.deepEqual(owner._unsubs, subscriptions, 'reset does not init again or duplicate subscriptions');
    assert.deepEqual(await startArena(h), first);
    assert.deepEqual(fly(h), expected, 'all 180 native/player samples match on retained same-seed reset');
    assert.ok(FRESH_RUN_SYSTEMS.indexOf('terrainAnchors') < FRESH_RUN_SYSTEMS.indexOf('world'));
  } finally {
    h.dispose();
  }
});

test('retained New Game uses the new seed while ordinary Continue preserves the current random stream', async () => {
  const h = await boot();
  try {
    const first = await startArena(h);
    const owner = h.runtime.getSystem('terrainAnchors');
    const stream = owner._rng;
    h.bus.emit('save:loaded', {});
    assert.equal(owner._rng, stream, 'Continue must not rewind the run stream');
    freshRun(h, SEED + 1);
    const second = await startArena(h);
    assert.notDeepEqual(second.map(e => e.spin), first.map(e => e.spin));
    assert.notDeepEqual(second.map(e => [e.x, e.z]), first.map(e => [e.x, e.z]));
    const expectedStream = h.runtime.getHelpers().mulberry32(h.runtime.getHelpers().hash32(SEED + 1, 'terrainAnchors'));
    assert.equal(second[0].spin, (expectedStream() - .5) * .12,
      'the first anchor reads the new run seed, not a constant or the old run');
  } finally {
    h.dispose();
  }
});
