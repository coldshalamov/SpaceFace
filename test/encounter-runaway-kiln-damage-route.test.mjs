import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { SECTOR_ANCHORS } from '../src/data/sectorAnchors.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { getCombatKernel } from '../src/combat/kernel.js';
import { scalarHitToDamagePacket } from '../src/combat/damage.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { isAttachable } from '../src/systems/tetherGameplay.js';
import { salvageActions } from '../src/systems/salvageActions.js';
import { physics } from '../src/core/physics.js';

const SECTOR = 'sector_vesta_forge';
const SHAPE = 'the_runaway_kiln';

function fixture(t) {
  const sim = createSimulation({ seed: 4242, systems: [encounterDirector] });
  t.after(() => sim.dispose());
  const { state, bus } = sim;
  const depot = SECTOR_ANCHORS[SECTOR].stations.find(row => row.id === 'station_depot3');
  const zone = zonesForSector(SECTOR).find(row => row.id === 'zone_vesta_forge');
  assert.ok(depot);
  assert.ok(zone);
  const anchor = sectorLocalToGlobalForSector(zone.center, SECTOR);
  const player = sim.spawn({ type: 'ship', team: 0, pos: anchor, radius: 8, hull: 100, hullMax: 100 });
  state.playerId = player.id;
  state.mode = 'flight';
  state.world.currentSectorId = SECTOR;
  state.world.activeSector = {
    stations: [{ ...depot, pos: sectorLocalToGlobalForSector(depot.pos, SECTOR) }], pois: [],
  };
  const events = [];
  for (const name of ['encounter:voice', 'encounter:resolved', 'economy:grantCredits', 'pickup:collected']) {
    bus.on(name, payload => events.push({ name, payload }));
  }
  // Seed admission only, at the authored Forge zone. Never fabricate combat, outcomes or payout.
  const director = sim.registry.get('encounterDirector');
  assert.equal(director.requestAuthoredEncounter({
    shapeId: SHAPE, encounterId: 'test:kiln:damage-route', sectorId: SECTOR, anchor, force: true,
  }).ok, true);
  const live = state.encounterDirector.live['test:kiln:damage-route'];
  const body = state.entities.get(live.vars.crucibleId);
  assert.ok(body);
  const kernel = getCombatKernel(sim.registry.ctx);
  const hit = damage => kernel.routeDamage({
    attackerId: player.id, targetId: body.id,
    packet: scalarHitToDamagePacket({ damage, damageType: 'kinetic', pos: { ...body.pos } }),
  });
  return { state, body, player, live, events, hit };
}

test('ordinary scratches warn, then detonate the Runaway Kiln without a rescue payout', t => {
  const { state, body, live, events, hit } = fixture(t);
  const first = hit(3);
  assert.equal(first.ok, true, `ordinary hit rejected: ${first.reason}`);
  assert.ok(body.hull < 90 && body.hull > 0);
  assert.equal(live.vars.struck, 1);
  assert.equal(state.story.depthProgramEncounters?.completed?.[SHAPE], undefined);
  assert.ok(events.some(row => row.name === 'encounter:voice' && /Stop shooting/.test(row.payload.text)));
  assert.equal(hit(3).ok, true);
  assert.equal(live.vars.struck, 2);
  assert.equal(state.story.depthProgramEncounters.completed[SHAPE].outcome, 'detonated');
  assert.equal(events.some(row => row.name === 'economy:grantCredits'), false);
});

test('an ordinary lethal hit detonates the Runaway Kiln instead of silently losing it', t => {
  const { state, events, hit } = fixture(t);
  const result = hit(1000);
  assert.equal(result.ok, true, `ordinary lethal hit rejected: ${result.reason}`);
  assert.equal(state.story.depthProgramEncounters.completed[SHAPE].outcome, 'detonated');
  assert.equal(events.some(row => row.name === 'economy:grantCredits'), false);
});

test('the damageable crucible retains its native tow body and is not scoopable salvage', async t => {
  const { state, body, player, events } = fixture(t);
  const native = await createSg02DynamicBodyOwner({ publishTelemetry: false });
  t.after(() => native.dispose());
  native.syncFromEntities([body]);
  const record = native.records.get(body.id);
  assert.ok(record);
  assert.equal(record.body.mass(), 150);
  assert.equal(record.proxyId, 'kilnback:forge:v1:00');
  assert.equal(record.colliders.length, 1);
  assert.ok(Math.abs(Math.hypot(body.vel.x, body.vel.z) - 24) < 1e-9);
  assert.equal(isAttachable(body, player.id, state), true);
  assert.equal(salvageActions.configureAuthoredWreck(body), null);
  assert.equal(body.data.salvageAction, undefined);
  // Exercise the production collector gate with the player overlapping the spawned load.
  const collector = Object.create(physics);
  let attemptedCollections = 0;
  collector._diag = { pickupPairChecks: 0 };
  collector._tryCollectPickup = () => { attemptedCollections += 1; };
  collector.collectPickups(state);
  assert.equal(attemptedCollections, 0);
  assert.equal(events.some(row => row.name === 'pickup:collected'), false);
});
