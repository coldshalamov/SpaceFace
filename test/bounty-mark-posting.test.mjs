import assert from 'node:assert/strict';
import test from 'node:test';

// Board-writ bounty marks — the writ wall names a person at a place.
//
// Chain under test: the bounty board rolls a deterministic storyTarget (name + named place) onto
// ordinary bounty_hunt offers → the title/brief/nav line read like a warrant, not a slot machine
// → accepting spawns the mark INSIDE its named landmark/zone/gate instead of on the anonymous
// player ring → scanner reads the person's name → the mark hails once when the player closes →
// the ordinary kill path still settles the contract.

import { missions } from '../src/systems/missions.js';
import { contractClausesSystem } from '../src/systems/contractClauses.js';
import { SECTORS } from '../src/data/sectors.js';
import { SECTOR_ANCHORS } from '../src/data/sectorAnchors.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { MARK_NAMES, MARK_HAIL_RANGE_WU, rollBountyMark } from '../src/data/bountyMarks.js';

const BOARD_ID = 'station_expanse';

function makeBus() {
  const handlers = new Map();
  const emitted = [];
  return {
    emitted,
    on(name, fn) {
      const rows = handlers.get(name) || [];
      rows.push(fn);
      handlers.set(name, rows);
    },
    emit(name, payload) {
      emitted.push({ name, payload });
      for (const fn of [...(handlers.get(name) || [])]) fn(payload);
    },
  };
}

function makeState() {
  return {
    meta: { seed: 0x5eed },
    simTime: 1800,
    tick: 100,
    playerId: 1,
    entities: new Map(),
    player: { credits: 5000, cargo: { capVolume: 200, usedVolume: 0 }, stats: {}, researchPoints: 0 },
    ui: {},
    story: { beatIndex: 0, branch: null, flags: {}, chainProgress: 0 },
    missions: { boards: {}, active: [], completedLog: [], receipts: [], nextId: 1, config: null },
    world: { currentSectorId: 'sector_charon_expanse', activeSector: {}, sectors: {} },
    sectorSim: { sectors: {}, field: { nodes: {} } },
  };
}

function makeWorld(state = makeState()) {
  const bus = makeBus();
  const voiceCalls = [];
  let nextEntityId = 100;
  const spawnedSpecs = [];
  const helpers = {
    voice: { say(cue) { voiceCalls.push(cue); return true; } },
    spawnEntity(spec) {
      spawnedSpecs.push(spec);
      const ent = {
        id: nextEntityId++,
        alive: true,
        team: spec.team != null ? spec.team : 2,
        factionId: spec.factionId || null,
        pos: { ...(spec.pos || { x: 0, z: 0 }) },
        flags: spec.flags || {},
        data: spec.data || {},
      };
      state.entities.set(ent.id, ent);
      return ent;
    },
  };
  const missionSystem = { ...missions };
  missionSystem.init({ state, bus, helpers, registry: { get: () => null } });
  // The real route always registers contractClauses: clause-observing missions defer kill
  // settlement to its `contract:clauseSettledKill` pass-through, so the harness needs it live.
  const clauseSystem = { ...contractClausesSystem };
  clauseSystem.init({ state, bus, helpers, registry: { get: () => null } });
  return { state, bus, voiceCalls, spawnedSpecs, missionSystem, clauseSystem };
}

function bountyOffers(board) {
  return (board && board.slots || []).filter((o) => o && o.type === 'bounty_hunt');
}

/** Resolve a storyTarget's anchor the same way missionStoryTargetSpawnPos does. */
function anchorCenterLocal(sectorId, anchorId) {
  const anchors = SECTOR_ANCHORS[sectorId];
  if (!anchors) return null;
  const anchor = ['stations', 'gates', 'fields', 'pois']
    .flatMap((key) => Array.isArray(anchors[key]) ? anchors[key] : [])
    .find((c) => c && (c.id === anchorId || c.to === anchorId));
  return anchor ? (anchor.pos || anchor.center) : null;
}
function anchorCenterGlobal(sectorId, anchorId) {
  const c = anchorCenterLocal(sectorId, anchorId);
  return c ? sectorLocalToGlobalForSector({ x: c.x, z: c.z }, sectorId) : null;
}

/** Mirror of bountyMarks' lawful-protection volumes (local space): patrol bubble = dockRadius
 * (by size) × 4 × size factor, floor 600 WU; station_helios owns the 1400 WU starter sanctuary. */
const LAWFUL_FACTIONS = new Set(['faction_scn', 'faction_mts', 'faction_dmc', 'faction_free']);
function lawfulVolumes(sectorId, sectorDef) {
  const volumes = [];
  const posById = new Map(((SECTOR_ANCHORS[sectorId] && SECTOR_ANCHORS[sectorId].stations) || [])
    .map((a) => [a && a.id, a && a.pos]));
  for (const st of (sectorDef && sectorDef.stations) || []) {
    if (!st || !st.id) continue;
    const pos = posById.get(st.id);
    if (!pos) continue;
    if (st.id === 'station_helios') { volumes.push({ x: pos.x, z: pos.z, radius: 1400 }); continue; }
    if (!LAWFUL_FACTIONS.has(st.factionId)) continue;
    const size = st.size || 'M';
    const dockRadius = size === 'L' ? 90 : size === 'S' ? 60 : 72;
    const patrol = dockRadius * 4.0 * (size === 'L' ? 1.15 : size === 'S' ? 0.9 : 1.0);
    volumes.push({ x: pos.x, z: pos.z, radius: Math.max(600, patrol) });
  }
  return volumes;
}

test('rolled bounty offers carry a deterministic named mark at a named place', () => {
  const first = makeWorld();
  const replay = makeWorld();
  const boardA = first.missionSystem.ensureBoard(BOARD_ID);
  const boardB = replay.missionSystem.ensureBoard(BOARD_ID);
  const bountiesA = bountyOffers(boardA);
  const bountiesB = bountyOffers(boardB);
  assert.ok(bountiesA.length >= 1, 'the bounty board posts bounty work');
  assert.deepEqual(bountiesB.map((o) => o.storyTarget), bountiesA.map((o) => o.storyTarget),
    'same seed same board → identical writs');
  for (const offer of bountiesA) {
    const st = offer.storyTarget;
    assert.ok(st, `bounty offer ${offer.id} carries a storyTarget`);
    assert.ok(MARK_NAMES.includes(st.name), 'the writ names a person from the poster pool');
    assert.equal(st.label, `${st.name.toUpperCase()} — WARRANT`);
    assert.equal(st.role, 'board_writ');
    assert.ok(st.archetype, 'the posting implies a hull the spawn table can produce');
    assert.equal(st.placeName, undefined, 'placeName lives in params.markPlace, not on the target');
    assert.equal(offer.params.markName, st.name);
    assert.ok(offer.title.includes(st.name), 'the posting reads like a warrant');
    assert.ok(offer.brief.includes(st.name), 'the brief names the mark');
    assert.ok(offer.brief.length <= 90, 'brief stays inside the one-line clamp');
  }
});

test('the mark place is a real named feature of the destination sector', () => {
  let sawNamedPlace = 0;
  for (let seed = 1; seed <= 32; seed++) {
    const world = makeWorld();
    world.state.meta.seed = seed;
    const board = world.missionSystem.ensureBoard(BOARD_ID);
    for (const offer of bountyOffers(board)) {
      const st = offer.storyTarget;
      if (!st) continue;
      const destSectorId = offer.destSectorId;
      if (st.zoneId) {
        const zone = zonesForSector(destSectorId).find((z) => z && z.id === st.zoneId);
        assert.ok(zone, `zone ${st.zoneId} must exist in ${destSectorId}`);
        sawNamedPlace += 1;
      } else if (st.anchorId) {
        assert.ok(anchorCenterGlobal(destSectorId, st.anchorId),
          `anchor ${st.anchorId} must resolve in ${destSectorId}`);
        sawNamedPlace += 1;
      }
      if (offer.params.markPlace) {
        assert.ok(offer.title.includes(st.name));
      }
    }
  }
  assert.ok(sawNamedPlace >= 8, `most rolled marks should hold a named place (got ${sawNamedPlace})`);
});

test('the mark roll is a pure function of (seed, offer id, sector, tier) — a fixed golden', () => {
  const byId = new Map(SECTORS.map((s) => [s.id, s]));
  assert.deepEqual(rollBountyMark({
    seed: 0x5eed, offerId: 'mo_probe_1', sectorId: 'sector_charon_expanse',
    riskTier: 1, sectorDef: byId.get('sector_charon_expanse'),
  }), {
    id: 'mark:mo_probe_1',
    name: 'Pike Sorrow',
    label: 'PIKE SORROW — WARRANT',
    role: 'board_writ',
    archetype: 'wasp_swarmer',
    factionId: 'faction_reach',
    zoneId: 'zone_charon_belt',
    placeName: 'Deep Frontier Seams',
  });
});

test('a writ never names a hidden, gated, or owned place', () => {
  const poiById = new Map();
  const bossGateIds = new Set();
  for (const sec of SECTORS) for (const poi of (sec.pois || [])) {
    if (!poi || !poi.id) continue;
    if (poi.unlockAfterBossId) bossGateIds.add(poi.unlockAfterBossId);
    if (!poiById.has(poi.id)) poiById.set(poi.id, poi);
  }
  const SPOILERS = new Set([
    'poi_tutorial', 'poi_blackmkt', 'poi_vesta_ore_cache', 'poi_hcache', 'poi_stash',
    'poi_anomaly', 'poi_wormhole', 'poi_boss', 'poi_vault', 'poi_vault_maw',
    'heist_launcher', 'lawful_catcher', 'fence_receiver',
  ]);
  let poiPlaces = 0;
  for (let seed = 1; seed <= 64; seed++) {
    for (const sec of SECTORS) {
      for (let i = 0; i < 4; i++) {
        const mark = rollBountyMark({
          seed, offerId: `mo_sweep_${seed}_${i}`, sectorId: sec.id,
          riskTier: 1 + (seed % 4), sectorDef: sec,
        });
        if (!mark || !mark.anchorId) continue;
        const poi = poiById.get(mark.anchorId);
        assert.ok(!SPOILERS.has(mark.anchorId) && !bossGateIds.has(mark.anchorId),
          `${mark.anchorId} is an authored/gated place — the board must not name it`);
        if (!poi) continue; // gate anchors resolve to neighbor sector ids, not POIs
        poiPlaces++;
        assert.ok(!poi.hidden && !poi.runtimeOwner && !poi.unlockAfterBossId && !poi.gatedBy
          && !poi.requiresActiveScan && !poi.manualInvestigation && !poi.recoveryEncounter
          && !poi.discoveryPlate && poi.type !== 'anomaly' && poi.type !== 'wormhole'
          && !(sec.enemyDensity === 0 && poi.type === 'beacon'),
          `writ must not name ${poi.id} — hidden, gated, or owned content`);
      }
    }
  }
  assert.ok(poiPlaces > 0, 'the sweep actually visited POI places');
});

test('a writ never posts a mark inside lawful protection', () => {
  // A hostile holding a station bubble can never return fire — protection turns the hunt into
  // an execution. Every place's scatter disc must sit clear of lawful volumes.
  let placed = 0;
  for (let seed = 1; seed <= 64; seed++) {
    for (const sec of SECTORS) {
      const volumes = lawfulVolumes(sec.id, sec);
      if (!volumes.length) continue;
      for (let i = 0; i < 4; i++) {
        const mark = rollBountyMark({
          seed, offerId: `mo_law_${seed}_${i}`, sectorId: sec.id,
          riskTier: 1 + (seed % 4), sectorDef: sec,
        });
        if (!mark) continue;
        let center = null;
        let scatter = 0;
        if (mark.anchorId) {
          center = anchorCenterLocal(sec.id, mark.anchorId);
          scatter = mark.anchorRadius || 200;
        } else if (mark.zoneId) {
          const zone = zonesForSector(sec.id).find((z) => z && z.id === mark.zoneId);
          center = zone && zone.center;
          scatter = zone ? Math.max(40, Math.min(240, (zone.radius || 400) * 0.35)) : 0;
        }
        if (!center) continue;
        placed++;
        for (const v of volumes) {
          const reach = v.radius + scatter;
          const dist = Math.hypot(center.x - v.x, center.z - v.z);
          assert.ok(dist >= reach,
            `${mark.placeName || mark.anchorId} sits inside lawful protection of ${sec.id} station (dist ${dist.toFixed(0)} < ${reach.toFixed(0)})`);
        }
      }
    }
  }
  assert.ok(placed > 0, 'the sweep visited sectors with lawful stations');
});

test('gate marks hold an authored floor off the transit proxy', () => {
  const gateAnchorIds = new Set();
  for (const anchors of Object.values(SECTOR_ANCHORS)) {
    for (const g of (anchors && anchors.gates) || []) if (g && g.to) gateAnchorIds.add(g.to);
  }
  let gatesSeen = 0;
  for (let seed = 1; seed <= 64 && gatesSeen < 200; seed++) {
    for (const sec of SECTORS) {
      for (let i = 0; i < 4; i++) {
        const mark = rollBountyMark({
          seed, offerId: `mo_gate_${seed}_${i}`, sectorId: sec.id,
          riskTier: 1 + (seed % 4), sectorDef: sec,
        });
        if (!mark || !gateAnchorIds.has(mark.anchorId)) continue;
        gatesSeen++;
        assert.ok(mark.anchorMinRadius >= 60,
          `gate mark ${mark.anchorId} must floor its scatter off the gate proxy`);
      }
    }
  }
  assert.ok(gatesSeen > 0, 'the sweep actually rolled gate marks');
});

test('accepting spawns the named mark inside its named place, not on the player ring', () => {
  const world = makeWorld();
  const { state, missionSystem } = world;
  const board = missionSystem.ensureBoard(BOARD_ID);
  const offer = bountyOffers(board).find((o) => o.storyTarget && (o.storyTarget.anchorId || o.storyTarget.zoneId));
  assert.ok(offer, 'fixture seed must roll a mark with a named place');
  assert.ok(missionSystem.acceptMission(offer.id), 'the writ accepts');
  const active = state.missions.active[0];
  state.world.currentSectorId = active.destSectorId; // arrival: targets spawn on-site
  missionSystem._ensureMissionTargets(active);
  assert.equal(active.targetEntityIds.length, 1, 'a board writ owes exactly one mark');
  const mark = state.entities.get(active.targetEntityIds[0]);
  assert.equal(mark.data.name, offer.storyTarget.name, 'the hull carries the person');
  assert.equal(mark.data.scanLabel, offer.storyTarget.label, 'the scanner reads the warrant');
  assert.equal(mark.data.ai.name, offer.storyTarget.name, 'comms/AI identity agrees');

  const st = offer.storyTarget;
  if (st.anchorId) {
    const center = anchorCenterGlobal(active.destSectorId, st.anchorId);
    const dist = Math.hypot(mark.pos.x - center.x, mark.pos.z - center.z);
    assert.ok(dist <= Math.min(320, st.anchorRadius || 120) + 1,
      `mark must hold inside ${st.anchorId} (dist ${dist.toFixed(0)})`);
    assert.ok(dist >= (st.anchorMinRadius || 0) - 0.001,
      `mark must stay off the ${st.anchorId} proxy (dist ${dist.toFixed(0)})`);
  } else {
    const zone = zonesForSector(active.destSectorId).find((z) => z && z.id === st.zoneId);
    const center = sectorLocalToGlobalForSector({ x: zone.center.x, z: zone.center.z }, active.destSectorId);
    const dist = Math.hypot(mark.pos.x - center.x, mark.pos.z - center.z);
    const maxR = Math.max(40, Math.min(240, (zone.radius || 400) * 0.35));
    assert.ok(dist <= maxR + 1, `mark must lurk inside ${zone.name} (dist ${dist.toFixed(0)})`);
  }

  // The waypoint reason names the person once the hull is live.
  const waypoint = missionSystem._missionWaypoint(active);
  assert.equal(waypoint.reason, `Intercept ${offer.params.markName}`,
    'the nav line keeps the warrant name after spawn');
});

test('killing the named mark still settles the contract', () => {
  const world = makeWorld();
  const { state, bus, missionSystem } = world;
  const board = missionSystem.ensureBoard(BOARD_ID);
  const offer = bountyOffers(board)[0];
  // Contract fine print (INFERENCE-28) can attach a hostile kill-observing clause to a bounty;
  // that offer fails when the mark dies — the sibling test pins it. The ordinary settle path
  // this test owns is a contract without a kill-observing clause.
  offer.clauses = (offer.clauses || []).filter((c) => c && c.event !== 'entity:killed');
  assert.ok(missionSystem.acceptMission(offer.id));
  const active = state.missions.active[0];
  state.world.currentSectorId = active.destSectorId; // arrival: targets spawn on-site
  missionSystem._ensureMissionTargets(active);
  const markId = active.targetEntityIds[0];
  bus.emit('entity:killed', { id: markId, killerId: state.playerId, type: 'ship' });
  assert.equal(state.missions.active.length, 0, 'the mark kill completes the bounty');
  const completed = bus.emitted.filter((e) => e.name === 'mission:completed');
  assert.equal(completed.length, 1);
});

test('a bounty carrying hostile no-kill fine print fails when the mark dies', () => {
  const world = makeWorld();
  const { state, bus, missionSystem } = world;
  const board = missionSystem.ensureBoard(BOARD_ID);
  const offer = bountyOffers(board)[0];
  // This seed's offer rolls no_kills: disclosed hostile terms — the kill breaches, the contract
  // fails, and the objective must NOT have completed behind the observer's back.
  assert.ok((offer.clauses || []).some((c) => c && c.id === 'no_kills'),
    'seed 0x5eed expanse board carries the no_kills clause');
  assert.ok(missionSystem.acceptMission(offer.id));
  const active = state.missions.active[0];
  state.world.currentSectorId = active.destSectorId;
  missionSystem._ensureMissionTargets(active);
  const markId = active.targetEntityIds[0];
  bus.emit('entity:killed', { id: markId, killerId: state.playerId, type: 'ship' });
  assert.equal(state.missions.active.length, 0);
  assert.ok(bus.emitted.some((e) => e.name === 'contract:clauseBroken' && e.payload.clauseId === 'no_kills'));
  assert.equal(bus.emitted.filter((e) => e.name === 'mission:completed').length, 0);
  assert.ok(bus.emitted.some((e) => e.name === 'mission:failed'));
});

test('a mark killed by a third party still settles through the clause pass-through', () => {
  const world = makeWorld();
  const { state, bus, missionSystem } = world;
  const board = missionSystem.ensureBoard(BOARD_ID);
  const offer = bountyOffers(board)[0];
  // no_kills only breaches on PLAYER kills; a third-party kill is not a breach, but the clause-
  // observing mission defers its whole kill path to the observer — the settled-kill pass-through
  // must still deliver the objective.
  assert.ok(missionSystem.acceptMission(offer.id));
  const active = state.missions.active[0];
  state.world.currentSectorId = active.destSectorId;
  missionSystem._ensureMissionTargets(active);
  const markId = active.targetEntityIds[0];
  bus.emit('entity:killed', { id: markId, killerId: 4242, type: 'ship' });
  assert.equal(state.missions.active.length, 0,
    'non-breaching kill settles through contract:clauseSettledKill');
  assert.equal(bus.emitted.filter((e) => e.name === 'mission:completed').length, 1);
  assert.equal(bus.emitted.filter((e) => e.name === 'mission:failed').length, 0);
});

test('the mark hails once when the player closes inside scanner range', () => {
  const world = makeWorld();
  const { state, bus, missionSystem } = world;
  const board = missionSystem.ensureBoard(BOARD_ID);
  const offer = bountyOffers(board)[0];
  assert.ok(missionSystem.acceptMission(offer.id));
  const active = state.missions.active[0];
  state.world.currentSectorId = active.destSectorId; // arrival: targets spawn on-site
  missionSystem._ensureMissionTargets(active);
  const mark = state.entities.get(active.targetEntityIds[0]);

  // Park the player just inside the approach band.
  state.entities.set(state.playerId, {
    id: state.playerId, alive: true, team: 1,
    pos: { x: mark.pos.x + (MARK_HAIL_RANGE_WU - 700), z: mark.pos.z },
    data: {},
  });

  missionSystem._maybeMarkHail(active, state);
  missionSystem._maybeMarkHail(active, state);
  const popups = bus.emitted.filter((e) => e.name === 'comms:popup'
    && e.payload && e.payload.sender === offer.storyTarget.name);
  assert.equal(popups.length, 1, 'the mark acknowledges the board exactly once');
  assert.equal(active._markHailed, true, 'the once-latch rides the mission record');
  assert.ok(popups[0].payload.text.length > 0);
  assert.equal(popups[0].payload._viaVoice, true,
    'a voiced hail logs to the backlog only — no double surface');
});

test('a mark beyond contact range stays silent; a dead mark stays silent', () => {
  const world = makeWorld();
  const { state, bus, missionSystem } = world;
  const board = missionSystem.ensureBoard(BOARD_ID);
  const offer = bountyOffers(board)[0];
  assert.ok(missionSystem.acceptMission(offer.id));
  const active = state.missions.active[0];
  state.world.currentSectorId = active.destSectorId; // arrival: targets spawn on-site
  missionSystem._ensureMissionTargets(active);
  const mark = state.entities.get(active.targetEntityIds[0]);

  state.entities.set(state.playerId, {
    id: state.playerId, alive: true, team: 1,
    pos: { x: mark.pos.x + 9000, z: mark.pos.z },
    data: {},
  });
  missionSystem._maybeMarkHail(active, state);
  assert.equal(bus.emitted.filter((e) => e.name === 'comms:popup').length, 0,
    'no hail outside contact range');

  mark.alive = false;
  state.entities.get(state.playerId).pos = { x: mark.pos.x + 100, z: mark.pos.z };
  missionSystem._maybeMarkHail(active, state);
  assert.equal(bus.emitted.filter((e) => e.name === 'comms:popup').length, 0,
    'a dead mark does not speak');
});

test('Continue-adopted marks get their person identity re-stamped', () => {
  const world = makeWorld();
  const { state, missionSystem } = world;
  const board = missionSystem.ensureBoard(BOARD_ID);
  const offer = bountyOffers(board)[0];
  assert.ok(missionSystem.acceptMission(offer.id));
  const active = state.missions.active[0];

  // A rematerialized host: durable record restores ai but NOT data.name/scanLabel.
  const host = {
    id: 777, alive: true, team: 2,
    pos: { x: 0, z: 0 },
    flags: {},
    data: { missionTag: active.id, ai: {} },
  };
  state.entities.set(host.id, host);
  missionSystem._stampMissionTargetIdentity(host, active, 0);
  assert.equal(host.data.name, offer.storyTarget.name);
  assert.equal(host.data.scanLabel, offer.storyTarget.label);
  assert.equal(host.data.ai.name, offer.storyTarget.name);
});

test('the hail once-latch survives save/load', () => {
  const world = makeWorld();
  const { state, missionSystem } = world;
  const board = missionSystem.ensureBoard(BOARD_ID);
  const offer = bountyOffers(board)[0];
  assert.ok(missionSystem.acceptMission(offer.id));
  const active = state.missions.active[0];
  active._markHailed = true;

  const restored = makeWorld();
  restored.missionSystem.deserialize(missionSystem.serialize());
  const restoredMission = restored.state.missions.active.find((m) => m.id === active.id);
  assert.ok(restoredMission, 'the mission round-trips the save');
  assert.equal(restoredMission._markHailed, true, 'the once-latch rides the save — no replay');
});

test('ghost-convoy and authored storyTarget offers keep their own fiction', () => {
  const world = makeWorld();
  const { state, bus, missionSystem, spawnedSpecs } = world;
  const authored = {
    id: 'ext_bounty_authored',
    source: 'encounterAftermath',
    type: 'bounty_hunt',
    stationId: BOARD_ID,
    factionId: 'faction_scn',
    reward_cr: 300,
    collateral_cr: 0,
    riskTier: 2,
    destStationId: BOARD_ID,
    destSectorId: 'sector_helios_prime',
    distance: 500,
    params: { clearCount: 1, killCount: 0, targetStrength: 2, fValue: 2, taskTime: 60 },
    title: 'Bounty: raider captain',
    storyTarget: { id: 'authored_mark', name: 'Authored Name', label: 'AUTHORED NAME', role: 'authored' },
  };
  assert.ok(missionSystem._onExternalBoardOffer(authored));
  assert.ok(missionSystem.acceptMission(authored.id));
  const active = state.missions.active[0];
  assert.equal(active.storyTarget.name, 'Authored Name', 'the authored mark is preserved verbatim');
  state.world.currentSectorId = active.destSectorId;
  missionSystem._ensureMissionTargets(active);
  const spec = spawnedSpecs[0];
  assert.equal(spec.data.name, 'Authored Name', 'spawn stamps the authored identity');

  // An authored writ keeps its own fiction — closing in does not produce board-register lines.
  const mark = state.entities.get(active.targetEntityIds[0]);
  state.entities.set(state.playerId, {
    id: state.playerId, alive: true, team: 1,
    pos: { x: mark.pos.x + 100, z: mark.pos.z },
    data: {},
  });
  missionSystem._maybeMarkHail(active, state);
  assert.equal(bus.emitted.filter((e) => e.name === 'comms:popup').length, 0,
    'an authored mark does not speak the board register');
});
