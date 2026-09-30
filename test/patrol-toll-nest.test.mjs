/**
 * WF-08 — patrol toll posts. The board's patrol_clear writ is a held place, not a number of
 * ships in a ring: the writ names a raider toll post at a real named feature of the
 * destination sector, the pack anchors on a stripped hulk the post is named for, and a robbed
 * civilian mule sits on the post. First blood breaks the post — the anchor's line scatters,
 * the mule bolts for the nearest gate — and the witness outcome rides settlement: the board's
 * standing reward pays the rep channel when the mule lives.
 *
 * Chain under test: roll (deterministic, named place) → board row (title/brief read like a
 * place) → placed scene (hulk + ringed pack + mule at the named place, nav on the anchor) →
 * hail → first-blood break → bolt drive → settle (rep bonus / debrief) → aftermath release
 * (hulk stays stripable) → mule-death alternative → legacy no-nest writ unchanged.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { physics } from '../src/core/physics.js';
import { world } from '../src/systems/world.js';
import { missions } from '../src/systems/missions.js';
import { lootShards } from '../src/systems/lootShards.js';
import {
  PATROL_NEST_NAMES, PATROL_NEST_HAIL_LINES, PATROL_NEST_LOUD_LINES,
  rollPatrolNest, patrolNestHail, patrolNestLoudLine,
} from '../src/data/bountyMarks.js';
import { SECTORS } from '../src/data/sectors.js';
import { SECTOR_ANCHORS } from '../src/data/sectorAnchors.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';

const BOARD_ID = 'station_expanse'; // bounty_board profile — patrol weight 5
const DEST_SECTOR = 'sector_vesta_forge';
const DEST_STATION = 'station_depot3';
const ORIGIN_STATION = 'station_depot3';
const RING_MAX_WU = 180; // mirror of missions.js PATROL_NEST_RING_MAX_WU
const MULE_ESCAPE_WU = 500; // mirror of PATROL_NEST_MULE_ESCAPE_WU

// ── light harness (board rolls only — mirrors bounty-mark-posting.test.mjs) ─────────────────

function makeLightWorld(seed = 0x5eed) {
  const state = {
    meta: { seed },
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
  const handlers = new Map();
  const bus = {
    on(name, fn) {
      const rows = handlers.get(name) || [];
      rows.push(fn);
      handlers.set(name, rows);
    },
    emit() {},
  };
  const missionSystem = { ...missions };
  missionSystem.init({ state, bus, helpers: {}, registry: { get: () => null } });
  return { state, missionSystem };
}

function patrolOffers(board) {
  return (board && board.slots || []).filter((o) => o && o.type === 'patrol_clear');
}

// ── full-sim harness (scene + script — mirrors mission-salvage-claim-site.test.mjs) ─────────

function buildSim() {
  const bus = createBus();
  const emitted = [];
  const rawEmit = bus.emit.bind(bus);
  bus.emit = (name, payload) => {
    emitted.push({ name, payload });
    return rawEmit(name, payload);
  };
  bus.emitted = emitted;
  const sim = createSimulation({ seed: 4242, bus, systems: [physics, world, missions, lootShards] });
  const { state } = sim;
  state.mode = 'flight';
  state.player.credits = 5000;
  if (!state.ui) state.ui = {};
  if (!state.nav) state.nav = { waypoint: null };
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 12, mass: 24,
    hull: 100, hullMax: 100, collides: true,
  });
  state.playerId = player.id;
  return { sim, bus, state, player };
}

function boardAndAccept(state, missionsApi, offer) {
  state.missions.boards[offer.stationId] = { refreshEpoch: 0, slots: [offer] };
  assert.equal(missionsApi.acceptMission(offer.id), true, 'board offer accepts');
}

function activeNestMission(state) {
  return (state.missions.active || []).find((m) => m && m.status === 'active' && m.params && m.params.nestName);
}

/** A rolled nest storyTarget for the test offer — the real shape a board roll produces. */
function nestStoryTargetFor(offerId) {
  const byId = new Map(SECTORS.map((s) => [s.id, s]));
  const nest = rollPatrolNest({
    seed: 4242, offerId, sectorId: DEST_SECTOR, sectorDef: byId.get(DEST_SECTOR),
  });
  const { placeName: _place, ...storyTarget } = nest;
  return { storyTarget, placeName: nest.placeName };
}

function nestOffer(offerId = 'offer_toll_nest_test') {
  const { storyTarget, placeName } = nestStoryTargetFor(offerId);
  return {
    id: offerId,
    type: 'patrol_clear',
    stationId: ORIGIN_STATION,
    factionId: 'faction_scn',
    params: {
      clearCount: 3, killCount: 0, targetStrength: 2.2, fValue: 2.2, taskTime: 135,
      nestName: storyTarget.name, nestPlace: placeName || null,
    },
    reward_cr: 900,
    collateral_cr: 0,
    riskTier: 2,
    destStationId: DEST_STATION,
    destSectorId: DEST_SECTOR,
    distance: 1400,
    duration_s: 3600,
    title: `Break ${storyTarget.name}${placeName ? ` — ${placeName}` : ''}`,
    storyTarget,
  };
}

function nestSceneOf(state, mission) {
  const out = { hulk: null, mule: null, pack: [] };
  for (const e of state.entityList || []) {
    if (!e || e.alive === false || !e.data || String(e.data.patrolNestOf) !== String(mission.id)) continue;
    if (e.data.patrolRole === 'toll_hulk') out.hulk = e;
    else if (e.data.patrolRole === 'mule') out.mule = e;
  }
  for (const id of mission.targetEntityIds || []) {
    const e = state.entities.get(id);
    if (e && e.alive !== false) out.pack.push(e);
  }
  return out;
}

/** Nearest gate of the destination sector to a global origin — mirrors _patrolNestGatePos. */
function nearestGateGlobal(sectorId, origin) {
  const gates = (SECTOR_ANCHORS[sectorId] && SECTOR_ANCHORS[sectorId].gates) || [];
  let best = null;
  let bestD = Infinity;
  for (const gate of gates) {
    if (!gate || !gate.pos) continue;
    const global = sectorLocalToGlobalForSector({ x: gate.pos.x, z: gate.pos.z }, sectorId);
    const d = origin ? Math.hypot(global.x - origin.x, global.z - origin.z) : 0;
    if (d < bestD) { bestD = d; best = global; }
  }
  return best;
}

// ── the roll ─────────────────────────────────────────────────────────────────────────────────

test('the nest roll is deterministic and names the post in the toll register', () => {
  const byId = new Map(SECTORS.map((s) => [s.id, s]));
  const golden = rollPatrolNest({
    seed: 0x5eed, offerId: 'mo_probe_1', sectorId: 'sector_charon_expanse',
    sectorDef: byId.get('sector_charon_expanse'),
  });
  assert.deepEqual(golden, {
    id: 'nest:mo_probe_1',
    name: 'Ash Wharf',
    label: 'ASH WHARF — TOLL POST',
    role: 'nest_anchor',
    archetype: 'reaver_pirate',
    factionId: 'faction_reach',
    zoneId: 'zone_charon_belt',
    placeName: 'Deep Frontier Seams',
  });
  const again = rollPatrolNest({
    seed: 0x5eed, offerId: 'mo_probe_1', sectorId: 'sector_charon_expanse',
    sectorDef: byId.get('sector_charon_expanse'),
  });
  assert.deepEqual(again, golden, 'same (seed, offerId, sector) → identical post');
  assert.ok(PATROL_NEST_NAMES.includes(golden.name));
  for (let i = 0; i < 32; i++) {
    assert.ok(patrolNestHail(i, `m${i}`) && PATROL_NEST_HAIL_LINES.includes(patrolNestHail(i, `m${i}`)));
    assert.ok(patrolNestLoudLine(i, `m${i}`) && PATROL_NEST_LOUD_LINES.includes(patrolNestLoudLine(i, `m${i}`)));
  }
});

test('every rolled nest holds a real named feature of its destination sector', () => {
  let placed = 0;
  for (let seed = 1; seed <= 24; seed++) {
    const byId = new Map(SECTORS.map((s) => [s.id, s]));
    for (const sec of SECTORS) {
      const nest = rollPatrolNest({
        seed, offerId: `mo_sweep_${seed}_${sec.id}`, sectorId: sec.id, sectorDef: byId.get(sec.id),
      });
      if (!nest) continue;
      if (nest.zoneId) {
        const zone = zonesForSector(sec.id).find((z) => z && z.id === nest.zoneId);
        assert.ok(zone, `zone ${nest.zoneId} must exist in ${sec.id}`);
        assert.ok(zone.name, 'the zone is named — the writ can say where');
        placed++;
      } else if (nest.anchorId) {
        const anchors = SECTOR_ANCHORS[sec.id];
        const found = ['stations', 'gates', 'fields', 'pois']
          .flatMap((key) => Array.isArray(anchors && anchors[key]) ? anchors[key] : [])
          .find((c) => c && (c.id === nest.anchorId || c.to === nest.anchorId));
        assert.ok(found, `anchor ${nest.anchorId} must resolve in ${sec.id}`);
        placed++;
      }
    }
  }
  assert.ok(placed > 40, `the sweep placed most posts at named features (got ${placed})`);
});

test('board-rolled patrol writs name the post; bounty writs are untouched', () => {
  let sawPatrol = 0;
  let sawBounty = 0;
  for (let seed = 1; seed <= 12 && sawPatrol < 4; seed++) {
    const first = makeLightWorld(seed);
    const replay = makeLightWorld(seed);
    const boardA = first.missionSystem.ensureBoard(BOARD_ID);
    const boardB = replay.missionSystem.ensureBoard(BOARD_ID);
    const patrolsA = patrolOffers(boardA);
    const patrolsB = patrolOffers(boardB);
    assert.deepEqual(
      patrolsB.map((o) => [o.params.nestName, o.params.nestPlace, o.storyTarget]),
      patrolsA.map((o) => [o.params.nestName, o.params.nestPlace, o.storyTarget]),
      `same seed same board → identical posts (seed ${seed})`,
    );
    for (const offer of patrolsA) {
      sawPatrol++;
      const st = offer.storyTarget;
      assert.ok(st && st.role === 'nest_anchor', 'the writ points at the post');
      assert.equal(offer.params.nestName, st.name, 'params carry the post name');
      assert.ok(PATROL_NEST_NAMES.includes(offer.params.nestName), 'the name is from the post pool');
      assert.equal(st.label, `${st.name.toUpperCase()} — TOLL POST`);
      assert.ok(offer.title.includes(st.name), 'the title names the post');
      if (offer.params.nestPlace) assert.ok(offer.title.includes(offer.params.nestPlace));
      assert.ok(offer.brief.includes('hulk'), 'the brief says what is holding the place');
      assert.ok(offer.brief.includes('mule'), 'the brief says who is being robbed');
      // Base line clamps at 90; contract fine print may append up to CONDITION_BRIEF_MAX.
      assert.ok(offer.brief.length <= 150, 'brief stays inside the condition-suffixed clamp');
    }
    for (const offer of boardA.slots || []) {
      if (offer && offer.type === 'bounty_hunt') {
        sawBounty++;
        assert.equal(offer.params.nestName, undefined, 'bounty writs do not grow nest fields');
      }
    }
  }
  assert.ok(sawPatrol >= 4, `the sweep actually rolled nest writs (got ${sawPatrol})`);
  assert.ok(sawBounty >= 1, 'the same boards still post bounty writs');
});

// ── the placed scene ─────────────────────────────────────────────────────────────────────────

test('a nest writ materializes a toll post: hulk, ringed pack, robbed mule — at the named place', () => {
  const { sim, state } = buildSim();
  const missionsApi = sim.registry.get('missions');
  sim.registry.get('world').enterSector('sector_helios_prime');
  sim.step(SIM_DT);

  const offer = nestOffer();
  boardAndAccept(state, missionsApi, offer);
  const m = activeNestMission(state);
  assert.ok(m, 'nest mission active');
  assert.equal(m.needsTargets, true, 'the post defers to destination arrival');
  assert.equal(m.targetEntityIds.length, 0, 'nothing spawns offsite');

  sim.registry.get('world').enterSector(DEST_SECTOR);
  sim.step(SIM_DT);

  const scene = nestSceneOf(state, m);
  assert.ok(scene.hulk, 'the toll hulk materializes');
  assert.equal(scene.hulk.type, 'wreck');
  assert.equal(scene.hulk.data.tetherable, true, 'the hulk is a body the line can use');
  assert.match(scene.hulk.data.scanLabel, /TOLL HULK/, 'the scanner reads the post');
  assert.ok(scene.hulk.data.salvagePool
    && Object.values(scene.hulk.data.salvagePool).reduce((a, b) => a + (b | 0), 0) >= 2,
    'the hulk carries a real salvage pool');
  assert.equal(scene.pack.length, 3, 'the pack is the full writ');
  assert.ok(scene.mule, 'the robbed mule is on the post');
  assert.equal(scene.mule.team, 0, 'the mule is a civilian hull, not a combatant');
  assert.equal(scene.mule.data.ai && scene.mule.data.ai.passive, true, 'the mule holds while the post holds');
  assert.match(scene.mule.data.scanLabel, /mule/i, 'the scanner reads the robbery');

  // The post is a PLACE: the pack rings the hulk, not the player's arrival ring.
  const anchor = m.params.nestAnchorPos;
  assert.ok(anchor, 'the post anchor is recorded');
  for (const e of [...scene.pack, scene.hulk, scene.mule]) {
    const d = Math.hypot(e.pos.x - anchor.x, e.pos.z - anchor.z);
    assert.ok(d <= RING_MAX_WU + 1, `scene hull sits on the post (dist ${Math.round(d)})`);
  }
  // The anchor sits inside the writ's named place.
  const st = m.storyTarget;
  if (st.anchorId) {
    const anchors = SECTOR_ANCHORS[DEST_SECTOR];
    const found = ['stations', 'gates', 'fields', 'pois']
      .flatMap((key) => Array.isArray(anchors[key]) ? anchors[key] : [])
      .find((c) => c && (c.id === st.anchorId || c.to === st.anchorId));
    const center = sectorLocalToGlobalForSector(
      { x: (found.pos || found.center).x, z: (found.pos || found.center).z }, DEST_SECTOR);
    const d = Math.hypot(anchor.x - center.x, anchor.z - center.z);
    assert.ok(d <= Math.min(320, st.anchorRadius || 120) + 1,
      `the post holds inside ${st.anchorId} (dist ${Math.round(d)})`);
  } else if (st.zoneId) {
    const zone = zonesForSector(DEST_SECTOR).find((z) => z && z.id === st.zoneId);
    const center = sectorLocalToGlobalForSector(
      { x: zone.center.x, z: zone.center.z }, DEST_SECTOR);
    const d = Math.hypot(anchor.x - center.x, anchor.z - center.z);
    const maxR = Math.max(40, Math.min(240, (zone.radius || 400) * 0.35)) + RING_MAX_WU;
    assert.ok(d <= maxR + 1, `the post holds inside ${zone.name} (dist ${Math.round(d)})`);
  }

  // The named face: slot 0 carries the post's name on the hull and the scanner.
  const anchorShip = state.entities.get(m.targetEntityIds[0]);
  assert.equal(anchorShip.data.name, st.name, 'the anchor hull carries the post');
  assert.equal(anchorShip.data.scanLabel, st.label, 'the scanner reads the post');

  // Nav rides the placed scene, not a ring.
  assert.ok(state.nav.waypoint && state.nav.waypoint.kind === 'mission', 'the marker is the mission');
});

// ── hail → break → bolt → settle ─────────────────────────────────────────────────────────────

test('the post hails once on approach; first blood breaks it and the mule bolts', () => {
  const { sim, bus, state, player } = buildSim();
  const missionsApi = sim.registry.get('missions');
  sim.registry.get('world').enterSector(DEST_SECTOR);
  sim.step(SIM_DT);
  const offer = nestOffer('offer_toll_hail_test');
  boardAndAccept(state, missionsApi, offer);
  const m = activeNestMission(state);
  sim.step(SIM_DT);

  const scene = nestSceneOf(state, m);
  assert.ok(scene.pack.length === 3 && scene.mule, 'scene live');

  // Approach: the post speaks the toll register, once.
  player.pos.x = m.params.nestAnchorPos.x + 1500;
  player.pos.z = m.params.nestAnchorPos.z;
  sim.step(SIM_DT);
  const hail = bus.emitted.filter((e) => e.name === 'comms:popup' && e.payload.sender === m.storyTarget.name);
  assert.equal(hail.length, 1, 'the post hails exactly once');
  assert.ok(PATROL_NEST_HAIL_LINES.includes(hail[0].payload.text), 'the hail is the toll register');
  sim.step(SIM_DT);
  assert.equal(bus.emitted.filter((e) => e.name === 'comms:popup' && e.payload.sender === m.storyTarget.name).length, 1,
    'no repeat hail');

  // First blood: the post breaks — the loud line goes out, the mule bolts.
  const firstTarget = m.targetEntityIds[0];
  state.entities.get(firstTarget).alive = false;
  bus.emit('entity:killed', { id: firstTarget, killerId: player.id, type: 'ship' });
  assert.equal(m.params.nestLoud, true, 'first blood breaks the post');
  const loud = bus.emitted.filter((e) => e.name === 'comms:popup' && e.payload.sender === m.storyTarget.name);
  assert.equal(loud.length, 2, 'the anchor speaks the break over the hail');
  assert.ok(PATROL_NEST_LOUD_LINES.includes(loud[1].payload.text), 'the break is the loud register');
  const mule = nestSceneOf(state, m).mule;
  assert.equal(mule.data.ai, undefined, 'the mule drops its passive hold');
  assert.equal(m.params.muleBolted, true, 'the bolt latches');
  assert.ok(mule.data.intent, 'the drive owns the mule from here');

  // The drive runs it for the gate: park the mule just inside escape range of the nearest one.
  const gate = nearestGateGlobal(DEST_SECTOR, m.params.nestAnchorPos);
  assert.ok(gate, 'the destination sector has a gate to run for');
  mule.pos.x = gate.x + MULE_ESCAPE_WU - 100;
  mule.pos.z = gate.z;
  sim.step(SIM_DT);
  assert.equal(m.params.muleEscaped, true, 'the witness clears the ring');
  assert.equal(nestSceneOf(state, m).mule, null, 'the escaped mule is out of the world');
  assert.equal(m.params.muleFate, undefined, 'an escaped mule is not a dead mule');
});

test('clearing the pack settles the writ; a living mule pays the witness rep and the hulk stays', () => {
  const { sim, bus, state, player } = buildSim();
  const missionsApi = sim.registry.get('missions');
  sim.registry.get('world').enterSector(DEST_SECTOR);
  sim.step(SIM_DT);
  const offer = nestOffer('offer_toll_settle_test');
  boardAndAccept(state, missionsApi, offer);
  const m = activeNestMission(state);
  sim.step(SIM_DT);

  // Break the post, let the mule run, then clear the pack.
  const packIds = [...m.targetEntityIds];
  state.entities.get(packIds[0]).alive = false;
  bus.emit('entity:killed', { id: packIds[0], killerId: player.id, type: 'ship' });
  assert.equal(m.params.muleBolted, true);
  const gate = nearestGateGlobal(DEST_SECTOR, m.params.nestAnchorPos);
  const mule = nestSceneOf(state, m).mule;
  mule.pos.x = gate.x + MULE_ESCAPE_WU - 50;
  mule.pos.z = gate.z;
  sim.step(SIM_DT);
  assert.equal(m.params.muleEscaped, true);

  bus.emit('entity:killed', { id: packIds[1], killerId: player.id, type: 'ship' });
  bus.emit('entity:killed', { id: packIds[2], killerId: player.id, type: 'ship' });
  assert.equal(m.status, 'completed', 'the full pack settles the writ');
  const completed = bus.emitted.find((e) => e.name === 'mission:completed');
  assert.ok(completed, 'completion emits');
  // spec rep for patrol_clear at risk 2 = 5 * (1 + 2*0.4) = 9; the living witness adds 2.
  const receipt = state.missions.receipts.find((r) => r.missionId === m.id && r.id.endsWith(':completed'));
  assert.ok(receipt, 'a settlement receipt exists');
  assert.equal(receipt.repDelta, 11, 'the witness bonus rides the settlement rep channel');
  const debriefText = JSON.stringify(bus.emitted.filter((e) => e.name === 'comms:popup'));
  assert.ok(/witnesses/.test(debriefText), 'the debrief says the mule got out');

  // Aftermath: the hulk stays in the world, stripable, owned by the lane now.
  const scene = nestSceneOf(state, m);
  assert.ok(scene.hulk, 'the hulk survives the settlement');
  assert.equal(scene.hulk.data.patrolNestOf, null, 'the lane owns the wreck now');
  assert.ok(scene.hulk.data.salvagePool, 'the pool is still aboard');
});

test('a mule that dies in the fight is a different outcome: no witness bonus, debrief remembers', () => {
  const { sim, bus, state, player } = buildSim();
  const missionsApi = sim.registry.get('missions');
  sim.registry.get('world').enterSector(DEST_SECTOR);
  sim.step(SIM_DT);
  const offer = nestOffer('offer_toll_mule_death_test');
  boardAndAccept(state, missionsApi, offer);
  const m = activeNestMission(state);
  sim.step(SIM_DT);

  const mule = nestSceneOf(state, m).mule;
  assert.ok(mule, 'mule on the post');
  mule.alive = false;
  bus.emit('entity:destroyed', { id: mule.id, entity: mule, pos: { x: mule.pos.x, z: mule.pos.z } });
  assert.equal(m.params.muleFate, 'dead', 'the robbery finished');
  assert.equal(m.params.muleEscaped, undefined, 'a dead mule never counts as out');

  const packIds = [...m.targetEntityIds];
  for (const id of packIds) {
    state.entities.get(id).alive = false;
    bus.emit('entity:killed', { id, killerId: player.id, type: 'ship' });
  }
  assert.equal(m.status, 'completed');
  const receipt = state.missions.receipts.find((r) => r.missionId === m.id && r.id.endsWith(':completed'));
  assert.equal(receipt.repDelta, 9, 'no witness bonus when the mule died');
  const debrief = JSON.stringify(bus.emitted.filter((e) => e.name === 'comms:popup'));
  assert.ok(/didn't make it/.test(debrief), 'the debrief remembers the dead mule');
});

test('the hulk going down is itself the break; its pool stays stripable afterwards', () => {
  const { sim, bus, state, player } = buildSim();
  const missionsApi = sim.registry.get('missions');
  sim.registry.get('world').enterSector(DEST_SECTOR);
  sim.step(SIM_DT);
  const offer = nestOffer('offer_toll_hulk_test');
  boardAndAccept(state, missionsApi, offer);
  const m = activeNestMission(state);
  sim.step(SIM_DT);

  const scene = nestSceneOf(state, m);
  assert.equal(m.params.nestLoud, undefined, 'the post holds until touched');
  scene.hulk.alive = false;
  bus.emit('entity:destroyed', { id: scene.hulk.id, entity: scene.hulk, pos: { ...scene.hulk.pos } });
  assert.equal(m.params.tollHulkGone, true, 'the hulk is remembered gone');
  assert.equal(m.params.nestLoud, true, 'destroying the post breaks it');
  assert.equal(m.params.muleBolted, true, 'the mule runs on the break');

  // The pack still owes its full quota — the wreck was never a target.
  assert.equal(m.objectiveProgress, 0, 'scene hulls never count as kills');
  const packIds = [...m.targetEntityIds];
  for (const id of packIds) {
    state.entities.get(id).alive = false;
    bus.emit('entity:killed', { id, killerId: player.id, type: 'ship' });
  }
  assert.equal(m.status, 'completed', 'the writ still settles on the pack alone');
});

test('a save mid-fight reloads with the post still loud and no replayed beat', () => {
  const { sim, bus, state } = buildSim();
  const missionsApi = sim.registry.get('missions');
  sim.registry.get('world').enterSector(DEST_SECTOR);
  sim.step(SIM_DT);
  const offer = nestOffer('offer_toll_save_test');
  boardAndAccept(state, missionsApi, offer);
  const m = activeNestMission(state);
  sim.step(SIM_DT);

  const packIds = [...m.targetEntityIds];
  state.entities.get(packIds[0]).alive = false;
  bus.emit('entity:killed', { id: packIds[0], killerId: state.playerId, type: 'ship' });
  assert.equal(m.params.nestLoud, true);
  assert.equal(m.params.muleBolted, true);
  sim.step(SIM_DT); // the drive runs the bolt and derives the runtime gate cache

  const snapshot = JSON.parse(JSON.stringify(sim.registry.get('missions').serialize()));
  const row = snapshot.active.find((a) => a.id === m.id);
  assert.equal(row.params.nestLoud, true, 'the loud latch rides the save');
  assert.equal(row._nestGatePos, undefined, 'the runtime gate cache is stripped');
  assert.ok(row.storyTarget && row.storyTarget.role === 'nest_anchor', 'the post rides the save');
});

test('a legacy writ without a nest keeps the old ring and the old words', () => {
  const { sim, state } = buildSim();
  const missionsApi = sim.registry.get('missions');
  sim.registry.get('world').enterSector(DEST_SECTOR);
  sim.step(SIM_DT);
  const offer = {
    id: 'offer_legacy_patrol_test',
    type: 'patrol_clear',
    stationId: ORIGIN_STATION,
    factionId: 'faction_scn',
    params: { clearCount: 2, killCount: 0, targetStrength: 1.8, fValue: 1.8, taskTime: 90 },
    reward_cr: 500,
    collateral_cr: 0,
    riskTier: 1,
    destStationId: DEST_STATION,
    destSectorId: DEST_SECTOR,
    distance: 900,
    duration_s: 1800,
    title: 'Clear 2 hostiles near Depot 3',
  };
  boardAndAccept(state, missionsApi, offer);
  const m = (state.missions.active || []).find((row) => row && row.status === 'active');
  assert.ok(m, 'legacy writ active');
  sim.registry.get('world').enterSector('sector_helios_prime');
  sim.step(SIM_DT);
  sim.registry.get('world').enterSector(DEST_SECTOR);
  sim.step(SIM_DT);
  assert.equal(m.targetEntityIds.length, 2, 'the legacy ring spawns the writ as before');
  const scene = nestSceneOf(state, m);
  assert.equal(scene.hulk, null, 'no hulk on a legacy writ');
  assert.equal(scene.mule, null, 'no mule on a legacy writ');
});
