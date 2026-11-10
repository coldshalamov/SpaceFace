// INF — "the absent factions show up": Choir, Helix, and Free gain K1 presence.
// Seeded and plain node --test throughout, mirroring the depth-program-k1 suites.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { makeEntity } from '../src/core/entity.js';
import {
  FACTION_PRESENCE_NODES,
  mapFactionPresenceNodes,
  planFactionPresence,
  presenceServiceForStation,
} from '../src/data/factionPresence.js';
import { FACTION_KITS } from '../src/data/factions/index.js';
import { SHIPS } from '../src/data/ships.js';
import { SECTORS } from '../src/data/sectors.js';
import { normalizeFactionBehaviorProfile } from '../src/ai/factionBehavior.js';
import { factionPresence } from '../src/systems/factionPresence.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import {
  factionPresenceServiceRows,
  runFactionPresenceDockAction,
} from '../src/ui/station/serviceQuotes.js';

const SEED = 0x47a;

const ABSENT_NODES = Object.freeze([
  { id: 'presence_choir_pilgrim_walk', factionId: 'faction_choir', sectorIds: ['sector_vesta_forge'] },
  { id: 'presence_helix_rim_audit', factionId: 'faction_helix', sectorIds: ['sector_sedna_dark'] },
  { id: 'presence_free_homestead_watch', factionId: 'faction_free', sectorIds: ['sector_io_reach'] },
]);

function shipRoleHulls(factionId, role) {
  const kit = FACTION_KITS.find((row) => row.id === factionId);
  const row = kit.shipRoles.find((entry) => entry.role === role);
  return row.hullIds;
}

test('the three absent-faction nodes exist with real faction, sector, and station ids', () => {
  const sectorIds = new Set(SECTORS.map((sector) => sector.id));
  const stationIds = new Set(SECTORS.flatMap((sector) => sector.stations || []).map((station) => station.id));
  const kitIds = new Set(FACTION_KITS.map((kit) => kit.id));
  for (const expected of ABSENT_NODES) {
    const node = FACTION_PRESENCE_NODES.find((row) => row.id === expected.id);
    assert.ok(node, `${expected.id} exists in FACTION_PRESENCE_NODES`);
    assert.equal(node.factionId, expected.factionId);
    assert.equal(kitIds.has(node.factionId), true, `${node.factionId} is a registered kit`);
    assert.deepEqual(node.sectorIds, expected.sectorIds, `${expected.id} sectors`);
    assert.equal(node.sectorIds.every((id) => sectorIds.has(id)), true, `${expected.id} sector refs are real`);
    assert.equal(node.stationIds.length > 0, true, `${expected.id} names a station`);
    assert.equal(node.stationIds.every((id) => stationIds.has(id)), true, `${expected.id} station refs are real`);
  }
  const helixKit = FACTION_KITS.find((kit) => kit.id === 'faction_helix');
  assert.equal(helixKit.fleetClass, 'none', 'Helix remains the paper faction');
});

test('the Choir pilgrim walk is a two-ship slow procession of pilgrim-transport hulls', () => {
  const plans = planFactionPresence({ sectorId: 'sector_vesta_forge', seed: SEED });
  const choir = plans.filter((plan) => plan.factionId === 'faction_choir');
  assert.equal(choir.length, 2, 'a procession, not a convoy');
  const pilgrimHulls = shipRoleHulls('faction_choir', 'pilgrim-transport');
  const shipIds = new Set(SHIPS.map((ship) => ship.id));
  for (const plan of choir) {
    assert.equal(pilgrimHulls.includes(plan.shipDefId), true, `${plan.shipDefId} comes from the pilgrim-transport row`);
    assert.equal(shipIds.has(plan.shipDefId), true, 'K1 law: no invented hulls');
    assert.equal(plan.passive, true);
    assert.equal(plan.fixedRoute, true, 'the walk echoes the Fulfillment route pattern');
    assert.equal(plan.routeId, 'choir_vesta_procession');
    assert.equal(plan.formationCount, 2);
    assert.equal(Number.isFinite(plan.pos.x) && Number.isFinite(plan.pos.z), true);
    const profile = normalizeFactionBehaviorProfile(plan.behavior);
    assert.ok(profile, 'the pilgrim doctrine row normalizes');
    assert.equal(profile.firstFire, false, 'pilgrims never fire first, so a player hit can flip them');
    assert.equal(profile.fixedRoute, true, 'the generic route updater animates the procession');
  }
  assert.equal(new Set(choir.map((plan) => `${plan.pos.x}:${plan.pos.z}`)).size, 2, 'the pair walks apart');
  assert.equal(choir[0].routePeriodS > 32, true, 'slower than the 32s Fulfillment route');
  assert.deepEqual(
    planFactionPresence({ sectorId: 'sector_vesta_forge', seed: SEED }).filter((plan) => plan.factionId === 'faction_choir'),
    choir,
    'seeded replay is identical',
  );
  assert.equal(
    planFactionPresence({ sectorId: 'sector_tethys_junction', seed: SEED })
      .some((plan) => plan.factionId === 'faction_choir'),
    false,
    'the procession only walks its home sector',
  );
});

test('Helix stays paper: zero ship plans anywhere, presence is the Sedna audit desk only', () => {
  for (const sector of SECTORS) {
    const plans = planFactionPresence({ sectorId: sector.id, seed: SEED });
    assert.equal(
      plans.some((plan) => plan.factionId === 'faction_helix'),
      false,
      `${sector.id} must not mint a Helix hull`,
    );
  }
  const node = FACTION_PRESENCE_NODES.find((row) => row.id === 'presence_helix_rim_audit');
  assert.deepEqual(node.stationIds, ['station_sedna'], 'the audit lives at the Sedna Survey Post');
});

test('the Free homestead watch is a 1-2 hull passive loiter of homestead-guard hulls in Io Reach', () => {
  const plans = planFactionPresence({ sectorId: 'sector_io_reach', seed: SEED })
    .filter((plan) => plan.factionId === 'faction_free');
  assert.ok(plans.length >= 1 && plans.length <= 2, 'smallest possible watch');
  const guardHulls = shipRoleHulls('faction_free', 'homestead-guard');
  const shipIds = new Set(SHIPS.map((ship) => ship.id));
  for (const plan of plans) {
    assert.equal(guardHulls.includes(plan.shipDefId), true, `${plan.shipDefId} comes from the homestead-guard row`);
    assert.equal(shipIds.has(plan.shipDefId), true, 'K1 law: no invented hulls');
    assert.equal(plan.passive, true, 'the watch loiters, it does not hunt');
    assert.equal(Number.isFinite(plan.pos.x) && Number.isFinite(plan.pos.z), true);
  }
  assert.deepEqual(
    planFactionPresence({ sectorId: 'sector_io_reach', seed: SEED }).filter((plan) => plan.factionId === 'faction_free'),
    plans,
    'seeded replay is identical',
  );
});

test('the generic galaxy-map path carries the three new nodes as active', () => {
  const mapped = mapFactionPresenceNodes({ seed: SEED });
  for (const expected of ABSENT_NODES) {
    const row = mapped.find((node) => node.id === expected.id);
    assert.ok(row, `${expected.id} rides mapFactionPresenceNodes`);
    assert.equal(row.phase, 'active', `${expected.id} is not story-gated like the Verge`);
  }
});

test('the Sedna audit desk is rep-gated and every existing desk is unchanged', () => {
  const below = presenceServiceForStation('station_sedna', { faction_helix: 14 });
  assert.equal(below.factionId, 'faction_helix');
  assert.deepEqual(below.services, ['directorate_audit']);
  assert.equal(below.available, false);
  assert.equal(below.requiredRep, 15);
  const at = presenceServiceForStation('station_sedna', { faction_helix: 15 });
  assert.equal(at.available, true);
  assert.equal(at.requiredRep, 15);
  const above = presenceServiceForStation('station_sedna', { faction_helix: 90 });
  assert.equal(above.available, true);

  const drift = presenceServiceForStation('station_drift', { faction_archive: 25 });
  assert.deepEqual(drift.services, ['reading_room']);
  assert.equal(drift.available, true);
  assert.equal(presenceServiceForStation('station_drift', { faction_archive: 24 }).available, false);
  const forge = presenceServiceForStation('station_forge', { faction_pitborn: 0 });
  assert.deepEqual(forge.services, ['yard', 'fence']);
  const expanse = presenceServiceForStation('station_expanse', {});
  assert.deepEqual(expanse.services, ['wreck_buy']);
  assert.equal(expanse.available, true);
});

function flightRuntime() {
  const state = createGameState(SEED);
  state.world.currentSectorId = 'sector_vesta_forge';
  state.world.sectors = {
    sector_vesta_forge: { id: 'sector_vesta_forge', name: 'Vesta Forge', owner: 'faction_dmc' },
  };
  const bus = createBus();
  const spawned = [];
  const helpers = {
    spawnEntity(spec) {
      const entity = makeEntity(spec);
      entity.id = 100 + spawned.length;
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      spawned.push(entity);
      return entity;
    },
  };
  const presence = Object.create(factionPresence);
  presence.init({ state, bus, helpers, registry: { get() { return null; } } });
  return { state, bus, spawned, presence };
}

test('attacking the procession flips it defensive like Understory and Archive', () => {
  const rt = flightRuntime();
  rt.bus.emit('sector:enter', { sectorId: 'sector_vesta_forge' });
  const choir = rt.spawned.filter((entity) => entity.factionId === 'faction_choir');
  assert.equal(choir.length, 2, 'the procession materializes in its home sector');
  for (const pilgrim of choir) {
    assert.equal(pilgrim.data.ai.passive, true, 'pilgrims spawn passive');
    assert.equal(pilgrim.team, 2, 'pilgrims spawn neutral');
  }
  const player = makeEntity(makeShipEntitySpec('ship_kestrel', { isPlayer: true, team: 0, pos: { x: 0, z: 0 } }));
  player.id = 1;
  rt.state.playerId = player.id;
  rt.state.entities.set(player.id, player);
  rt.state.entityList.push(player);

  rt.presence._onCombatDamage({ attackerId: player.id, targetId: choir[0].id, applied: 5 });
  for (const pilgrim of choir) {
    assert.equal(pilgrim.data.ai.passive, false, 'the whole procession answers an attack');
    assert.equal(pilgrim.data.ai.roe, 'weapons_free');
    assert.equal(pilgrim.data.ai.retaliationTargetId, player.id);
    assert.equal(pilgrim.team, 1);
  }
});

function serviceRuntime() {
  const state = createGameState(SEED);
  state.factions = { ...(state.factions || {}), faction_helix: { rep: 15 } };
  const creditsBefore = state.player.credits;
  const bus = createBus();
  const events = [];
  for (const event of ['comms:popup', 'toast', 'factionPresence:serviceAction', 'factionPresence:spawned']) {
    bus.on(event, (payload) => events.push({ event, payload }));
  }
  const system = Object.create(factionPresence);
  system.init({ state, bus, helpers: {}, registry: { get() { return null; } } });
  return { state, bus, events, system, creditsBefore };
}

test('the Sedna audit desk pops one stamped paper-voice receipt and nothing else', () => {
  const rt = serviceRuntime();
  try {
    rt.bus.emit('dock:docked', { stationId: 'station_sedna' });
    const rows = factionPresenceServiceRows(rt.state, 'station_sedna');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, 'directorate_audit');
    assert.equal(rows[0].available, true);

    const result = runFactionPresenceDockAction(rt.bus, rt.state, 'station_sedna', 'directorate_audit');
    assert.equal(result.ok, true);
    const popups = rt.events.filter((row) => row.event === 'comms:popup');
    assert.equal(popups.length, 1, 'ONE comms popup');
    assert.equal(popups[0].payload.sender, 'Helix Rim Audit');
    assert.equal(popups[0].payload.category, 'paper');
    assert.match(popups[0].payload.text, /STAMP/, 'the audit stamps something');
    assert.match(popups[0].payload.text, /thank/i, 'the audit thanks the captain for the paperwork');

    // A second open re-reads the same stamped receipt; the durable receipt records once.
    runFactionPresenceDockAction(rt.bus, rt.state, 'station_sedna', 'directorate_audit');
    assert.equal(rt.events.filter((row) => row.event === 'comms:popup').length, 2);
    assert.equal(
      rt.events.filter((row) => row.event === 'comms:popup')[1].payload.text,
      popups[0].payload.text,
      'the stamp is seeded and stable',
    );
    assert.equal(
      rt.state.factionPresence.receipts.filter((row) => row.kind === 'directorateAudit').length, 1,
    );
    assert.ok(rt.events.some((row) => row.event === 'factionPresence:serviceAction'
      && row.payload.factionId === 'faction_helix'));

    // Paper law at the desk: no ships, no credits moved.
    assert.equal(rt.events.some((row) => row.event === 'factionPresence:spawned'), false);
    assert.equal(rt.state.player.credits, rt.creditsBefore);
  } finally {
    rt.bus.clear();
  }
});

test('below the audit gate the desk explains itself instead of opening', () => {
  const rt = serviceRuntime();
  try {
    rt.state.factions.faction_helix.rep = 14;
    rt.bus.emit('dock:docked', { stationId: 'station_sedna' });
    const rows = factionPresenceServiceRows(rt.state, 'station_sedna');
    assert.equal(rows[0].available, false);
    assert.match(rows[0].disabledReason, /15/);
    const result = runFactionPresenceDockAction(rt.bus, rt.state, 'station_sedna', 'directorate_audit');
    assert.equal(result.ok, false);
    assert.match(String(result.reason), /reputation/i);
    assert.equal(rt.events.some((row) => row.event === 'comms:popup'), false);
  } finally {
    rt.bus.clear();
  }
});
