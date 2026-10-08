import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import { snapshotFeatureMaps, applyFeatureConfigToMaps, restoreFeatureMaps } from '../src/data/featureFlags.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { PALLET_JACK as C } from '../src/data/palletJack.js';
import { palletJackPresentation } from '../src/systems/palletJack.js';

const external = (runtime, fn) => {
  const old = snapshotFeatureMaps(); applyFeatureConfigToMaps(runtime.config.features);
  try { return fn(); } finally { restoreFeatureMaps(old); }
};
const advance = (runtime, fn, cap, diagnostic) => {
  let n = 0; while (!fn() && n++ < cap) runtime.step(1 / 60);
  assert.ok(fn(), `capped production route ended: ${JSON.stringify(diagnostic?.() || { ticks: n })}`);
};

test('ordinary purchased-and-jettisoned cargo earns one production Pallet Jack; cold repeated Continue and nonlethal parley keep the same original', async () => {
  const source = createAuthoritativeRuntime({ profileId: 'production', nodeSafeOnly: true, seed: 79 });
  let target = null;
  try {
    const s = source.state; s.mode = 'flight'; s.story.beatIndex = Math.max(1, s.story.beatIndex);
    s.simTime = 120; s.tick = 7200;
    const player = source.spawn(makeShipEntitySpec('ship_hawser', { isPlayer: true, player: s.player,
      pos: { x: 0, z: 0 }, fittings: [] })); s.playerId = player.id;
    external(source, () => source.getSystem('world').enterSector(C.sectors[0], { continuous: false,
      noTeleport: true, placePlayer: false }));
    const station = s.entityIndex.stations.find(e => e.data?.stationId === 'station_ceres'); assert.ok(station);
    // The load is a real ordinary purchase and dump through the existing single writers.
    // The encounter creates no cargo, bonus stock, or free victim pallet.
    external(source, () => source.getSystem('economy').grantCredits(1000, 'fixture:pallet-jack:starting-budget'));
    const trade = external(source, () => source.getSystem('economy').execute('station_ceres', 'cmdty_electronics', 'buy', 3,
      { intentId: 'fixture:pallet-jack:ordinary-purchase' }));
    assert.equal(trade.ok, true, JSON.stringify(trade));
    external(source, () => source.getSystem('world').relocatePlayerInSector({ x: station.pos.x + 1700,
      z: station.pos.z + 1400, heading: 0 }, { reason: 'pallet-jack-cargo-pocket' }));
    assert.equal(external(source, () => source.getSystem('cargo').jettison('cmdty_electronics', 3)), 3);
    const cargo = s.entityList.find(e => e.alive && e.data?.jettisonedCargo && e.data.commodityId === 'cmdty_electronics');
    assert.ok(cargo); const mass = cargo.mass, identity = structuredClone(cargo.data.cargoIdentity);
    external(source, () => source.getSystem('world').relocatePlayerInSector({ x: cargo.pos.x + 250,
      z: cargo.pos.z + 200, heading: Math.PI }, { reason: 'pallet-jack-contest-pocket' }));
    assert.equal(await source.getSystem('physics').prepareBackend(s, { reset: true }), true);
    const owner = source.getSystem('palletJack'), director = source.getSystem('encounterDirector'), requests = [];
    const request = director.requestAuthoredEncounter;
    director.requestAuthoredEncounter = function(p) { const out = request.call(this, p);
      if (p.shapeId === C.encounterId) requests.push(out); return out; };
    advance(source, () => owner.serialize().introduced, 7200, () => ({ requests,
      eligible: owner._eligible(), candidate: owner._candidate()?.id, cargoAlive: cargo.alive,
      cargo: { pos: cargo.pos, data: cargo.data }, player: player.pos, director: s.encounterDirector?.pressure }));
    let actor = owner._find('actor'); assert.ok(actor); let row = owner._row.incident;
    const id = row.targetCargoId;
    assert.equal(owner._find('cargo'), cargo); assert.equal(cargo.mass, mass);
    assert.equal(source.getSystem('physics')._sg02.records.get(actor.id).colliders.length, 3);
    assert.equal(actor.mass, 100); assert.equal(actor.data.combatProfileId, 'combat_profile_pallet_jack');
    advance(source, () => !!owner._line(), 1800, () => ({ phase: row.phase, actor: actor.pos,
      cargo: cargo.pos, rotation: actor.rot, view: actor.data.palletJack,
      decision: source.getSystem('tacticalAI')?.decisions?.get?.(actor.id) }));
    assert.equal(palletJackPresentation(s, actor).loaded, true);
    assert.deepEqual(cargo.data.cargoIdentity, identity); assert.equal(cargo.mass + actor.mass, mass + 100);
    let envelope = source.getSystem('save').serialize('pallet-jack-route');
    source.dispose();
    target = createAuthoritativeRuntime({ profileId: 'production', nodeSafeOnly: true, seed: 80 });
    for (let pass = 0; pass < 2; pass++) {
      assert.equal(await target.getSystem('save').loadEnvelope(structuredClone(envelope), 'pallet-jack-route'), true);
      target.state.mode = 'flight'; const savedOwner = target.getSystem('palletJack');
      assert.equal(savedOwner._row.incident.targetCargoId, id);
      assert.equal(await target.getSystem('physics').prepareBackend(target.state), true);
      advance(target, () => !!savedOwner._line(), 125, () => ({ phase: savedOwner._row.incident.phase,
        actor: savedOwner._find('actor')?.pos, cargo: savedOwner._find('cargo')?.pos,
        native: target.getSystem('physics')._sg02?.attachments.size }));
      actor = savedOwner._find('actor'); row = savedOwner._row.incident;
      assert.equal(target.state.entityList.filter(e => e.alive && e.data?.palletJackCargoId === id).length, 1);
      assert.equal(target.state.entityList.filter(e => e.alive && e.data?.palletJackActorId === C.actorId).length, 1);
      assert.equal(savedOwner._find('cargo').mass + actor.mass, mass + 100);
      assert.equal(palletJackPresentation(target.state, actor).loaded, true);
      envelope = target.getSystem('save').serialize('pallet-jack-route');
    }
    const restored = target.getSystem('palletJack'), original = restored._find('cargo'), p = target.state.entities.get(target.state.playerId);
    actor.hull = actor.hullMax * .35;
    external(target, () => target.getSystem('world').relocatePlayerInSector({ x: actor.pos.x + 90,
      z: actor.pos.z + 90, heading: Math.PI }, { reason: 'pallet-jack-nonlethal-parley' }));
    target.state.player.targetId = actor.id; target.step(1 / 60);
    const credits = target.state.player.credits;
    assert.equal(restored.demandDrop({ incidentId: row.id, revision: row.revision }).ok, true);
    assert.equal(restored._find('cargo'), original); assert.equal(original.alive, true); assert.equal(actor.alive, true);
    assert.equal(target.getSystem('physics')._sg02.attachments.size, 0);
    assert.equal(target.state.player.credits, credits);
    assert.ok(p.alive); assert.equal(row.result, 'cargo_recovered');
  } finally { target?.dispose(); source.dispose(); }
});
