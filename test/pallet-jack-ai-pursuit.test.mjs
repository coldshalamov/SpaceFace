import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import { snapshotFeatureMaps, applyFeatureConfigToMaps, restoreFeatureMaps } from '../src/data/featureFlags.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { PALLET_JACK as C } from '../src/data/palletJack.js';
import { sectorGlobalOrigin } from '../src/data/sectorCoordinates.js';
import { addCargo } from '../src/systems/cargo.js';

const external = (runtime, fn) => {
  const old = snapshotFeatureMaps(); applyFeatureConfigToMaps(runtime.config.features);
  try { return fn(); } finally { restoreFeatureMaps(old); }
};

test('Pallet Jack production AI captures the original drifting jettisoned load through its native clamp', async () => {
  const runtime = createAuthoritativeRuntime({ profileId: 'production', nodeSafeOnly: true, seed: 79 });
  const state = runtime.state;
  state.mode = 'flight'; state.story.beatIndex = Math.max(1, state.story.beatIndex);
  state.simTime = 120; state.tick = 7200; state.world.currentSectorId = C.sectors[0];
  const origin = sectorGlobalOrigin(C.sectors[0]);
  const pocket = { x: origin.x - 400, z: origin.z - 2400 };
  const player = runtime.spawn(makeShipEntitySpec('ship_kestrel', { isPlayer: true, player: state.player,
    pos: { ...pocket }, fittings: [] }));
  state.playerId = player.id;
  let cargo;
  try {
    external(runtime, () => runtime.getSystem('world').enterSector(C.sectors[0], {
      continuous: false, placePlayer: false }));
    external(runtime, () => runtime.getSystem('world').relocatePlayerInSector({
      ...pocket, heading: -Math.PI / 2,
    }, { reason: 'pallet-jack-native-fixture' }));
    assert.equal(await runtime.getSystem('physics').prepareBackend(state, { reset: true }), true);
    external(runtime, () => {
      assert.equal(addCargo(state, 'cmdty_electronics', 3), 3);
      assert.equal(runtime.getSystem('cargo').jettison('cmdty_electronics', 3), 3);
    });
    cargo = state.entityList.find(e => e.alive && e.data?.jettisonedCargo);
    assert.ok(cargo);
    const owner = runtime.getSystem('palletJack');
    owner._nextRequest = Number.POSITIVE_INFINITY;
    // Use the actual dump's embargo/collider reactivation, not a hand-authored pickup.
    for (let i = 0; i < 180 && !owner._candidate(); i++) runtime.step(1 / 60);
    assert.equal(owner._candidate(), cargo);
    const encounterId = 'pallet-jack:direct-ai-fixture';
    const admitted = runtime.getSystem('encounterDirector').requestAuthoredEncounter({
      shapeId: C.encounterId, encounterId, sectorId: C.sectors[0],
      anchor: { x: cargo.pos.x - 100, z: cargo.pos.z + 70 }, zoneRadius: C.searchRadius + 250, force: true,
    });
    assert.equal(admitted.ok, true, JSON.stringify(admitted));
    const actor = owner._find('actor'); assert.ok(actor);
    external(runtime, () => runtime.getSystem('world').relocatePlayerInSector({
      x: pocket.x + 1200, z: pocket.z + 600, heading: 0,
    }, { reason: 'pilot-clear-of-dumped-freight' }));
    const end = state.simTime + 60;
    let n = 0, decision = null;
    const motion = [], grabs = [];
    const grab = owner._grab;
    owner._grab = function() {
      grabs.push({ tick: state.tick, angle: actor.rot, spin: actor.angVel,
        actor: { ...actor.pos }, cargo: { ...cargo.pos }, av: { ...actor.vel }, cv: { ...cargo.vel },
        committed: this._row.incident.grabVelocity, gate: !!this._grabGate() });
      return grab.call(this);
    };
    while (!owner._line() && state.simTime < end && n++ < 3601) {
      runtime.step(1 / 60);
      const inspect = runtime.getSystem('tacticalAI').inspect({ entityId: actor.id });
      decision = inspect.lastResult?.decisions?.find(row => row.entityId === actor.id) || decision;
      if (n % 120 === 0) motion.push({ tick: state.tick, phase: owner._row.incident.phase,
        gap: Math.hypot(actor.pos.x - cargo.pos.x, actor.pos.z - cargo.pos.z) });
    }
    assert.equal(owner._find('cargo'), cargo, 'capture retains the actual dumped body');
    assert.ok(decision, 'the production tactical AI issued a live decision for the thief');
    assert.equal(decision.action.maneuver.reason, 'pallet-jack-physical-freight');
    assert.ok(owner._line(), JSON.stringify({ phase: owner._row.incident.phase, motion, grabs }));
    assert.equal(state.entityList.filter(e => e.alive && e.data?.palletJackCargoId).length, 1);
    assert.equal(owner._line().targetId, cargo.id);
    assert.equal(owner._row.incident.receipts.filter(row => row.kind === 'grab').length, 1);
  } finally {
    runtime.dispose();
  }
});
