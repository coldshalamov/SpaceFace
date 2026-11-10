import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { normalizeFrontierRumorState } from '../src/data/frontierRumors.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { SECTORS } from '../src/data/sectors.js';
import { frontierRumorCorroborations } from '../src/ui/frontierRumorMapLayer.js';

const SECTOR = SECTORS.find((sector) => (sector.pois || []).some((poi) => poi.type === 'cache'));
const TARGET = SECTOR.pois.find((poi) => poi.type === 'cache');
const OTHER = SECTOR.pois.find((poi) => poi.type === 'cache' && poi.id !== TARGET.id)
  || { id: 'poi_second_reach' };

function bareState(seed = 51) {
  const state = createGameState(seed);
  state.world.sectors = Object.fromEntries(SECTORS.map((sector) => [sector.id, { ...sector, owner: sector.factionId }]));
  state.world.frontierRumors = normalizeFrontierRumorState(null);
  return state;
}

let cardSerial = 0;
function card(state, { targetId = TARGET.id, sectorId = SECTOR.id, dx = 0, dz = 0, radius = 500, phase = 'rumored' }) {
  const id = `frontier-rumor:station_x:${(cardSerial += 1)}:cache:${targetId}`;
  state.world.frontierRumors.byId[id] = {
    id,
    schemaVersion: 1,
    kind: 'cache',
    kindLabel: 'Cache Tally',
    targetId,
    targetName: 'unclaimed cache',
    sectorId,
    sectorName: SECTOR.name || SECTOR.id,
    sourceStationId: `station_src_${cardSerial}`,
    sourceSectorId: `sector_src_${cardSerial}`,
    bearingCenter: { x: 1000 + dx, z: -800 + dz },
    radius,
    phase,
    text: 'A cargo tally points somewhere.',
  };
  return id;
}

test('three cards naming the same reach form one corroboration with arrows into the overlap', () => {
  const state = bareState();
  card(state, { dx: -140, dz: 0, radius: 700 });
  card(state, { dx: 140, dz: 0, radius: 700 });
  card(state, { dx: 0, dz: 160, radius: 900 });
  const groups = frontierRumorCorroborations(state);
  assert.equal(groups.length, 1);
  const group = groups[0];
  assert.equal(group.memberCount, 3, 'three independent cards converge');
  assert.ok(group.memberRumorIds.length >= 2, 'at least two arrows draw');
  // The convergence is precision-weighted: it sits inside the tightest member ring.
  const tightest = group.members.reduce((a, b) => (a.radius <= b.radius ? a : b));
  const drift = Math.hypot(group.converge.x - tightest.center.x, group.converge.z - tightest.center.z);
  assert.ok(drift <= tightest.radius, 'the shared patch stays inside the tightest ring');
});

test('distinct reaches group separately, and a lone card draws no arrows', () => {
  const state = bareState();
  card(state, { dx: 0 });
  card(state, { dx: 80 });
  card(state, { targetId: OTHER.id, dx: 5000, dz: 5000 });
  card(state, { dx: 3000, dz: 3000 }); // third card on TARGET — but different centers is fine
  const groups = frontierRumorCorroborations(state);
  assert.equal(groups.length, 1, 'the second reach has one card — no corroboration yet');
  assert.equal(groups[0].memberCount, 3);
});

test('confirming the reach resolves the group: resolved cards leave, then it dissolves', () => {
  const state = bareState();
  const a = card(state, { dx: -140 });
  const b = card(state, { dx: 140 });
  card(state, { dx: 0, dz: 160 });
  assert.equal(frontierRumorCorroborations(state).length, 1);
  // World resolves every record naming the site at once — mirror that on the records.
  state.world.frontierRumors.byId[a].phase = 'resolved';
  state.world.frontierRumors.byId[b].phase = 'resolved';
  assert.equal(frontierRumorCorroborations(state).length, 0, 'under two live cards, the arrows resolve');
});

test('corroboration rows are a field whitelist — no target id, no position behind the rings', () => {
  const state = bareState();
  card(state, { dx: -140 });
  card(state, { dx: 140 });
  const group = frontierRumorCorroborations(state)[0];
  assert.ok(group);
  assert.deepEqual(
    Object.keys(group).sort(),
    ['converge', 'id', 'memberCount', 'memberRumorIds', 'members', 'sectorId'],
    'the row schema is exactly the whitelist',
  );
  assert.deepEqual(
    Object.keys(group.members[0]).sort(),
    ['center', 'radius', 'rumorId', 'sectorId'],
    'a member row is only what its card already shows',
  );
  const json = JSON.stringify(group);
  for (const banned of ['targetId', 'targetName', 'exactPos', 'targetPos', OTHER.id]) {
    assert.ok(!json.includes(banned), `corroboration leaks ${banned}`);
  }
  // The reach's id may appear only inside card-id strings — group.id and memberRumorIds are
  // built from the cards' own ids, the same strings the purchased cards already show on the
  // rumor ring rows. Outside those strings the row never names it.
  const withoutCardIds = { ...group, id: '', memberRumorIds: [], members: group.members.map(({ rumorId, ...rest }) => rest) };
  assert.ok(!JSON.stringify(withoutCardIds).includes(TARGET.id), 'the reach is named outside card ids');
  // The convergence is derived from the rings — it is never the true site coordinate.
  const truth = sectorLocalToGlobalForSector(TARGET.pos, SECTOR.id);
  const leak = Math.hypot(group.converge.x - truth.x, group.converge.z - truth.z);
  assert.ok(leak > 1, 'the shared patch is not the true target coordinate');
});

test('records survive the save normalize and still corroborate; malformed rows fail closed', () => {
  const state = bareState();
  card(state, { dx: -140 });
  card(state, { dx: 140 });
  state.world.frontierRumors = normalizeFrontierRumorState(state.world.frontierRumors);
  assert.equal(frontierRumorCorroborations(state).length, 1, 'a reload keeps the group');

  const broken = bareState();
  broken.world.frontierRumors.byId['bad:1'] = { id: 'bad:1', kind: 'cache', sectorId: SECTOR.id, targetId: TARGET.id, phase: 'rumored' };
  broken.world.frontierRumors.byId['bad:2'] = { id: 'bad:2', kind: 'cache', sectorId: SECTOR.id, targetId: TARGET.id, phase: 'rumored' };
  assert.equal(frontierRumorCorroborations(broken).length, 0, 'cards without a drawn ring state nothing');
});
