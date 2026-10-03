// D118 regression: a station-assault incident's disengage ring must anchor to the jurisdiction's
// verified position, never to a recycled entity id. Entity ids flow back through state.freeIds when
// a body is removed; before the fix, a station id reissued to a live projectile dragged the ring
// kilometres away from the still-engaged attacker, so `disengaged` fired mid-assault and CONTROL
// cleared the response (security_response:clear → lawful_wanted_only) while the attacker kept
// shooting.
//
// The intended rule is the break-contact contract on the resolution receipt: patrol stands down
// only after the attacker leaves the ring AND goes quiet AND is not WANTED. An attacker parked
// inside the ring is still in contact — the incident stays open and responders stay weapons_free.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { lawSecurity } from '../src/systems/lawSecurity.js';
import { heat } from '../src/systems/heat.js';
import { RulesOfEngagement } from '../src/ai/doctrine.js';

const SEED = 47;
const HELIOS = 'sector_helios_prime';
// Coalition HQ's authored sector-local anchor — >1400 WU from the Helios origin so the starter
// protection bubble cannot supply the jurisdiction instead of the station itself.
const STATION_POS = { x: -920, z: 1080 };
const PLAYER_POS = { x: STATION_POS.x + 180, z: STATION_POS.z + 40 };

function boot() {
  const sim = createSimulation({
    seed: SEED,
    systems: [spawnBudget, lawSecurity, heat],
  });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = HELIOS;
  state.world.sectors[HELIOS] = { id: HELIOS, factionId: 'faction_scn', security: 0.98, tier: 0 };
  state.simTime = 120;
  state.tick = 7200;

  const station = sim.spawn({
    type: 'station',
    team: 2,
    factionId: 'faction_scn',
    pos: { x: STATION_POS.x, z: STATION_POS.z },
    radius: 60,
    data: { stationId: 'station_coalition', dockRadius: 90, factionId: 'faction_scn' },
  });
  const player = sim.spawn({
    type: 'ship',
    team: 0,
    factionId: 'faction_free',
    isPlayer: true,
    pos: { x: PLAYER_POS.x, z: PLAYER_POS.z },
    hull: 100,
    hullMax: 100,
  });
  state.playerId = player.id;

  const resolved = [];
  bus.on('law:incidentResolved', (p) => resolved.push(p && p.outcome));
  return { sim, state, bus, station, player, resolved };
}

function fireOnStation(bus, playerId, stationId) {
  bus.emit('combat:damage', {
    attackerId: playerId,
    targetId: stationId,
    applied: 8,
    amount: 8,
    kind: 'energy',
  });
}

test('D118: a station id recycled onto a projectile cannot drag the disengage ring off the parked attacker', () => {
  const { sim, state, bus, station, player, resolved } = boot();

  fireOnStation(bus, player.id, station.id);
  sim.runTicks(30);
  const incidents = () => Object.values(state.lawSecurity.incidents || {});
  assert.equal(incidents().length, 1, 'station hit must open a jurisdiction incident');
  const incident = incidents()[0];
  assert.equal(incident.cause, 'player_assault');

  // Let the dispatch land so live responders hold the incident's authorization.
  sim.runTicks(60 * 12);
  const responders = () => [...state.entities.values()].filter((e) => e && e.type === 'ship'
    && e.data && e.data.ai && e.data.ai.spawnContext === 'security_response');
  assert.ok(responders().length > 0, 'CONTROL must have dispatched responders before the recycle');
  for (const r of responders()) {
    assert.equal(r.data.ai.roe, RulesOfEngagement.WEAPONS_FREE,
      'dispatched responder must be weapons_free under the open incident');
  }

  // The defect regime: heat already priced, now cold enough to read not-WANTED.
  state.player.heat = 0;

  // Kill+remove the station, then reissue its entity id to a live projectile — the exact recycle
  // sequence that moved the ring origin in the historical repro (projectile at velocity through
  // the incident's stationEntityId slot).
  sim.helpers.removeEntity(station.id, { immediate: true });
  const projectile = sim.spawn({
    type: 'projectile',
    pos: { x: 2400, z: 4200 },
    vel: { x: 380, z: 0 },
  });
  assert.equal(projectile.id, station.id, 'projectile must reoccupy the freed station id');

  // The parked attacker keeps pouring fire onto the stale target id — the shots resolve to the
  // projectile now, so the incident's lastDamageAt goes stale exactly like the dead-station case.
  for (let s = 0; s < 12; s++) {
    state.player.heat = 0; // hold the cold-heat regime the defect needs
    fireOnStation(bus, player.id, projectile.id);
    sim.runTicks(60);
  }

  assert.equal(resolved.filter((o) => o === 'disengaged').length, 0,
    `incident must not stand down while the attacker is parked inside the ring: ${JSON.stringify(resolved)}`);
  assert.ok(incidents().length > 0, 'incident must remain open while contact is unbroken');
  for (const r of responders()) {
    assert.equal(r.data.ai.roe, RulesOfEngagement.WEAPONS_FREE,
      `responder ${r.id} must stay weapons_free while the incident is open`);
    assert.ok(r.data.ai.activity && String(r.data.ai.activity.reason || '').startsWith('security_response'),
      `responder ${r.id} must stay on the response activity, got ${r.data.ai.activity && r.data.ai.activity.reason}`);
  }

  // Break-contact still works: leave the frozen ring, go quiet, stay cold — the incident must
  // resolve disengaged against the anchored ring, not hold a dead file open forever.
  player.pos.x += 3000;
  player.pos.z += 0;
  for (let s = 0; s < 10 && incidents().length > 0; s++) {
    state.player.heat = 0;
    sim.runTicks(60);
  }
  assert.ok(resolved.includes('disengaged'),
    `fleeing the ring and going quiet must still stand the response down: ${JSON.stringify(resolved)}`);

  sim.dispose();
});
