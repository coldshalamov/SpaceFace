// PQ-032.00 — beats 1–3 are PQ-152 set pieces with physical headline verbs.
// Seed 3200. Headless. Prints beat id + headline verb.
//
// HONESTY CONTRACT FOR THIS HARNESS
// --------------------------------
// The bar is the INPUT, not the assertion: every number this test feeds a mission law has to be a
// number the live route can actually produce.
//
//  • The dest berth is the REAL station, spawned by the live `world` system in the dest sector — not
//    a hand-built fixture. An earlier revision of this file spawned `radius: 40, dockRadius: 80`,
//    geometry that exists nowhere in the game (src/systems/world.js:1463-1464 emits only 42/90,
//    34/72, 26/60), and reported the resulting 111 / 120 WU story latch-dock gate as if it were
//    live. Both dest stations (`station_expanse`, `station_ceres`) are size 'M' in
//    src/data/sectors.js, so the live gate is 103 WU for the pod (r7) and 112 WU for the core (r16).
//  • B1's rock is not teleported onto the tower. It is released with a real velocity and flown, one
//    fixed step at a time, until `masslineImpacts` detects contact — which lands at exactly the
//    combined radii. Centre-on-centre is a pose no solver can produce.
//  • B2/B3's cargo is not assigned to the berth position. 0 WU from the station centre is INSIDE the
//    hull. The cargo is reeled to a tight carry and flown in on a live `state.player.tether` mirror,
//    and the arrival pose is asserted legal (clear of the hull, clear of the ship, player inside the
//    live docking range from src/core/physics.js:757) before the turn-in is attempted.
//  • The far throw is the LIVE event chain, not a bare bus poke. src/systems/masslineThrow.js:419-463
//    only emits `massline:throw` when `state.player.tether.attachmentId` is set and the attachment
//    service accepts the cut — and that same cut makes the canonical `tether:releaseRated` land on
//    the following tick. So one far throw is really THREE inputs (latch, throw, clean release) and
//    all three have to refuse. An earlier revision emitted the throw with no latch at all, a shape
//    the live publisher cannot produce.
//  • The refusal distances are SMALLER than the live ones. `_spawnPhysicalTargetsFor`
//    (src/systems/missions.js:3888) drops the cargo 220-300 WU from the PLAYER on the first target
//    pass after arrival, and a real jump lands the player at `world.entryPoint` — 2663 WU from
//    station_expanse, 4444 WU from station_ceres. The spine below spawns off the sector origin
//    instead, so it refuses at 890 / 1471 WU where the live route would refuse at ~2.4k / ~4.2k WU.
//    The third test pins that live arrival geometry so the bound stays a bound.
//  • Both of B3's posted methods are proven, one per spine run (missions.js:2008 posts
//    ['tow_in','sling_in']). A mission settles ONCE — the first pay ends it — so a single run cannot
//    assert both, and asserting only the throw would leave the beat's own headline verb unproven.
//
// The tow itself is scripted kinematics, not a rapier solve: this harness runs no physics and no
// `tetherGameplay`, so the reel and the run home are stepped by hand. What that buys is an arrival
// POSE the live route can produce and a latch the live route can produce; it does not prove the
// constraint solver drags the mass. A headed or full-registry proof would be needed for that.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { addCargo } from '../src/systems/cargo.js';
import {
  AUTHORED_SET_PIECE_HEADLINE,
  PQ032_BEAT_SET_PIECES,
  STORY_BEATS,
  listPq032SpineSetPieces,
} from '../src/data/missions.js';
import { SECTORS } from '../src/data/sectors.js';
import {
  buildMissionBoardContract,
  validateEmbodiedDialogue,
  validateEmbodiedMissions,
} from '../src/story/campaign47a/index.js';
import { masslineImpacts } from '../src/systems/masslineImpacts.js';
import { missions } from '../src/systems/missions.js';
import { world } from '../src/systems/world.js';

const SEED = 3200;
const DT = 1 / 60;
// src/systems/missions.js STORY_LATCH_DOCK_SLACK_WU. Mirrored, not imported, so a silent widening
// there shows up here as a failed gate rather than a quietly-tracking expectation.
const STORY_LATCH_DOCK_SLACK_WU = 24;
// src/systems/missions.js PHYSICAL_BERTH_WU — the leftover berth radius that authored set pieces and
// `sling_in` still use. Mirrored so the far-side proof below can show it is the rule being beaten.
const PHYSICAL_BERTH_WU = 700;
// src/systems/world.js MEMBERSHIP_DWELL_S — free-flight sector membership carries hysteresis: the
// world only re-runs residency after the candidate sector has held its lead this many sim seconds.
// Mirrored so a silent change there fails loudly here instead of quietly never spawning the sector.
const MEMBERSHIP_DWELL_S = 8;

function printSpine() {
  for (const row of listPq032SpineSetPieces()) {
    console.log(`PQ-032.00 ${row.id} ${row.headlineVerb} (${row.setPiece})`);
  }
}

function boot() {
  // `world` is on the harness so the dest berth is the live station with its live geometry. It is
  // not in updateOrder — the spawn pass is driven explicitly, the same way the mission target pass is.
  const sim = createSimulation({
    seed: SEED, systems: [missions, masslineImpacts, world], updateOrder: [],
  });
  const { state } = sim;
  state.mode = 'flight';
  state.player.credits = 250000;
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    hull: 200, hullMax: 200, radius: 8,
  });
  state.playerId = player.id;
  state.onboarding = { active: false, finished: true };
  if (state.settings && state.settings.gameplay) state.settings.gameplay.tutorialHints = false;
  const completed = [];
  sim.bus.on('mission:completed', (p) => completed.push(p));
  // The B0 mine→dock order records through the campaign sidecar — newGame installs it.
  sim.registry.get('missions').newGame();
  return {
    sim,
    state,
    player,
    completed,
    missionsSys: sim.registry.get('missions'),
    worldSys: sim.registry.get('world'),
    impactsSys: sim.registry.get('masslineImpacts'),
  };
}

function roleOf(entity) {
  return entity && entity.data && entity.data.physicalRole || null;
}

function targetsByRole(state, mission, role) {
  return (mission.targetEntityIds || []).map((id) => state.entities.get(id)).filter((e) => (
    e && e.alive !== false && roleOf(e) === role
  ));
}

function acceptStory(h, stationId, storyTag) {
  const board = h.missionsSys.ensureBoard(stationId);
  const offer = (board.slots || []).find((row) => row && row.storyTag === storyTag);
  assert.ok(offer, `missing ${storyTag} at ${stationId}`);
  assert.equal(h.missionsSys.acceptMission(offer.id), true, `accept ${storyTag}`);
  const mission = h.state.missions.active.find((row) => row.storyTag === storyTag);
  assert.ok(mission, `active ${storyTag}`);
  return mission;
}

function liveStation(h, stationId) {
  for (const e of h.state.entities.values()) {
    if (e && e.alive !== false && e.type === 'station' && e.pos
      && e.data && e.data.stationId === stationId) return e;
  }
  return null;
}

// Get into the destination sector the way the live route does: the player is THERE, and the world
// system spawns that sector's real stations around them. `world.update` derives
// state.world.currentSectorId from the player position, so moving the ship is what changes sectors.
function flyToDestSector(h, mission) {
  const origin = h.worldSys._toGlobal({ x: 0, z: 0 }, mission.destSectorId);
  assert.ok(origin && Number.isFinite(origin.x), `no global origin for ${mission.destSectorId}`);
  h.player.pos.x = origin.x;
  h.player.pos.z = origin.z;
  h.player.vel.x = 0;
  h.player.vel.z = 0;
  // One update only registers the new sector as a residency candidate: 3e84b438e added membership
  // hysteresis so a live residency switch needs the candidate to hold for MEMBERSHIP_DWELL_S of sim
  // time before enterSector({continuous}) fires. Advance the same sim clock the dwell reads; the
  // penetration lead already holds because the pose sits on the dest sector's own origin.
  h.worldSys.update(DT, h.state);
  h.state.simTime += MEMBERSHIP_DWELL_S + 1;
  h.worldSys.update(DT, h.state);
  const berth = liveStation(h, mission.destStationId);
  assert.ok(berth, `live world must spawn ${mission.destStationId} in ${mission.destSectorId}`);
  // Stand off the berth by a real working distance, then let the world settle around that pose.
  h.player.pos.x = berth.pos.x + 700;
  h.player.pos.z = berth.pos.z + 520;
  h.worldSys.update(DT, h.state);
  assert.equal(h.state.world.currentSectorId, mission.destSectorId,
    'the player must actually be standing in the dest sector');
  h.sim.bus.emit('sector:enter', { sectorId: mission.destSectorId });
  // Live equivalent: missions.update() re-runs this every 15 ticks (src/systems/missions.js:894-897).
  // This harness registers no updateOrder, so the spawn pass is called directly.
  h.missionsSys._ensureMissionTargets(mission);
  return liveStation(h, mission.destStationId);
}

function wuBetween(a, b) {
  return Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);
}

// The live story latch-dock limit, read off the LIVE berth entity rather than a fixture.
function storyLatchDockLimitWu(station, cargo) {
  const berthR = Math.max(
    Number.isFinite(station.radius) && station.radius > 0 ? station.radius : 0,
    Number.isFinite(station.data.dockRadius) && station.data.dockRadius > 0
      ? station.data.dockRadius : 0,
  );
  const cargoR = Number.isFinite(cargo.radius) && cargo.radius > 0 ? cargo.radius : 0;
  return berthR + cargoR + STORY_LATCH_DOCK_SLACK_WU;
}

// src/core/physics.js:757 — how close the ship has to be for `dock:docked` to be reachable at all.
function liveDockRangeWu(station, ship) {
  return ((station.data.dockRadius || station.radius || 80) + (ship.radius || 0)) * 1.5;
}

function setLiveTether(h, targetId, restLength) {
  h.state.player.tether = {
    active: targetId != null,
    targetId,
    strain: 0,
    load: 0,
    attachmentId: null,
    restLength,
    phase: targetId != null ? 'loaded' : 'idle',
  };
}

// B3 leftover throw door: one massline:throw in the dest sector used to pay sling_in with no
// dest-dock test. Story B3 must refuse that sector-scale throw; leftover authored sling_in may
// still use PHYSICAL_BERTH_WU 700.
//
// This drives the whole live release chain, because the live route cannot produce the throw alone:
// masslineThrow arms off a real attachment, cuts it, emits `massline:throw` on that tick, and the
// attachment cut makes `tether:releaseRated` land next tick. Both of those events reach a story-B3
// completion path (`_onPhysicalThrow`, `_onPhysicalReleaseRated`), so refusing only one would leave
// the other door open.
function throwFromTheField(h, mission, role) {
  const cargo = targetsByRole(h.state, mission, role)[0];
  assert.ok(cargo, `${mission.type} needs a ${role}`);
  const berth = liveStation(h, mission.destStationId);
  assert.ok(berth, `${mission.type} needs the live ${mission.destStationId}`);
  const far = wuBetween(cargo, berth);
  // The probe is mission-level: a book leg can settle its contract without moving the beat.
  const settled = () => mission.status === 'completed';

  // Latch first: no attachment, no throw. This is the arm state masslineThrow requires.
  setLiveTether(h, cargo.id, wuBetween(cargo, h.player));
  h.sim.bus.emit('tether:latched', { targetId: cargo.id, type: 'tether_standard' });
  h.sim.bus.emit('massline:throw', {
    releaseId: `massline:throw:${h.state.tick}:${cargo.id}`,
    payloadId: cargo.id, aimTargetId: berth.id, aimSynthetic: false, mode: 'aimed',
  });
  const paidThrow = settled();

  // The cut drops the line, then the canonical rated release lands on the next tick.
  setLiveTether(h, null, 0);
  h.sim.bus.emit('tether:releaseRated', {
    targetId: cargo.id, sourceId: h.player.id, classification: 'clean',
  });
  const paidRelease = settled();

  console.log(`PQ-032.00 ${mission.type} ${role} one leftover latch+throw+clean release at `
    + `${Math.round(far)} WU — throw paid: ${paidThrow ? 'yes' : 'no'}, `
    + `release paid: ${paidRelease ? 'yes' : 'no'}`);
  assert.ok(far > PHYSICAL_BERTH_WU,
    `the ${role} throw must start outside the leftover ${PHYSICAL_BERTH_WU} WU berth`);
  assert.equal(paidThrow, false,
    `${role} throw at ${Math.round(far)} WU must not settle ${mission.type}`);
  assert.equal(paidRelease, false,
    `${role} clean release at ${Math.round(far)} WU must not settle ${mission.type} either`);
  return far;
}

// B2/B3: the tow. Latch a live tether mirror, prove a turn-in with the mass still out in the field
// does not pay, then reel to a tight carry and fly the package to the hull before docking.
//
// `settle` names the posted method this run ends on, and it is asserted — never defaulted to the
// mission TYPE. `sling_in` cuts the line at the dock and lets the mass fly the last stretch;
// anything else docks with the mass still on the line (latch-dock).
function towToTheDock(h, mission, role, settle) {
  const cargo = targetsByRole(h.state, mission, role)[0];
  assert.ok(cargo, `${mission.type} needs a ${role}`);
  const berth = liveStation(h, mission.destStationId);
  assert.ok(berth, `${mission.type} needs the live ${mission.destStationId}`);

  const gate = storyLatchDockLimitWu(berth, cargo);
  console.log(`PQ-032.00 ${mission.type} live berth ${mission.destStationId} `
    + `radius ${berth.radius} dockRadius ${berth.data.dockRadius} — story latch-dock gate `
    + `${Math.round(gate)} WU`);

  // The probe is mission-level: a book leg can settle its contract without moving the beat.
  const settled = () => mission.status === 'completed';
  setLiveTether(h, cargo.id, wuBetween(cargo, h.player));
  h.sim.bus.emit('tether:latched', { targetId: cargo.id, type: 'tether_standard' });

  // Turn-in attempt one: on the line, but still out where it was found.
  const far = wuBetween(cargo, berth);
  h.sim.bus.emit('dock:docked', { stationId: mission.destStationId });
  const paidFar = settled();
  console.log(`PQ-032.00 ${mission.type} ${role} sits ${Math.round(far)} WU from the berth `
    + `at turn-in — paid: ${paidFar ? 'yes' : 'no'}`);
  assert.ok(far > gate, `the ${role} must start OUTSIDE the gate for this to prove anything`);
  assert.equal(paidFar, false, `${role} at ${Math.round(far)} WU must not settle ${mission.type}`);

  // Reel to a tight carry: the line comes in, the mass comes with it, and it never enters the hull.
  const minLine = h.player.radius + cargo.radius + 4;
  let reelTicks = 0;
  while (h.state.player.tether.restLength > minLine && reelTicks < 20000) {
    h.state.player.tether.restLength = Math.max(minLine, h.state.player.tether.restLength - 1);
    const line = h.state.player.tether.restLength;
    const bx = cargo.pos.x - h.player.pos.x;
    const bz = cargo.pos.z - h.player.pos.z;
    const back = Math.hypot(bx, bz) || 1;
    cargo.pos.x = h.player.pos.x + (bx / back) * line;
    cargo.pos.z = h.player.pos.z + (bz / back) * line;
    reelTicks++;
  }

  // Fly the package toward the berth, the mass trailing on the short line. One step = one fixed tick.
  // The stop tolerance is not cosmetic: without it the final sub-WU step leaves float residue above
  // the target and the leg spins to its cap instead of arriving.
  let towTicks = 0;
  const flyUntil = (stopAtShipDistance, label) => {
    const cap = towTicks + 20000;
    while (towTicks < cap) {
      const dx = berth.pos.x - h.player.pos.x;
      const dz = berth.pos.z - h.player.pos.z;
      const d = Math.hypot(dx, dz);
      if (d - stopAtShipDistance <= 1e-6) break;
      const step = Math.min(1, d - stopAtShipDistance);
      h.player.pos.x += (dx / d) * step;
      h.player.pos.z += (dz / d) * step;
      const line = h.state.player.tether.restLength;
      cargo.pos.x = h.player.pos.x - (dx / d) * line;
      cargo.pos.z = h.player.pos.z - (dz / d) * line;
      towTicks++;
    }
    assert.ok(towTicks < cap, `the ${label} leg of the ${role} tow never arrived`);
  };

  // THE DISCRIMINATOR. Stop the tow at a waypoint that is inside the leftover PHYSICAL_BERTH_WU of
  // 700 — the radius `_entityNearDestBerth` still uses for authored set pieces and for `sling_in` —
  // but outside the story latch-dock gate. This exact pose PAID under the old berth-radius rule.
  // A player passes through it on every run in, so it is a turn-in they can really attempt. If this
  // one pays, the story gate is not doing anything the old 700 WU rule did not already do.
  const midWaypoint = Math.round((gate + PHYSICAL_BERTH_WU) / 2);
  flyUntil(midWaypoint, 'waypoint');
  const cargoAtWaypoint = wuBetween(cargo, berth);
  assert.ok(cargoAtWaypoint > gate && cargoAtWaypoint < PHYSICAL_BERTH_WU,
    `waypoint ${Math.round(cargoAtWaypoint)} WU must sit between the story gate `
    + `${Math.round(gate)} and the leftover berth radius ${PHYSICAL_BERTH_WU}`);
  h.sim.bus.emit('dock:docked', { stationId: mission.destStationId });
  const paidMid = settled();
  console.log(`PQ-032.00 ${mission.type} ${role} inside the leftover ${PHYSICAL_BERTH_WU} WU berth `
    + `at ${Math.round(cargoAtWaypoint)} WU — paid: ${paidMid ? 'yes' : 'no'}`);
  assert.equal(paidMid, false,
    `${role} at ${Math.round(cargoAtWaypoint)} WU is inside the old berth radius and must STILL `
    + 'not settle — this is the only assertion that proves the story gate tightened anything');

  // Now finish the run: stop against the hull with the mass trailing on the short line.
  flyUntil(berth.radius + h.player.radius + 20, 'final approach');

  // The arrival pose has to be one a solver could hold: outside the station hull, outside the ship,
  // and close enough that the ship could have docked at all.
  const cargoToBerth = wuBetween(cargo, berth);
  const cargoToShip = wuBetween(cargo, h.player);
  const shipToBerth = wuBetween(h.player, berth);
  const dockRange = liveDockRangeWu(berth, h.player);
  console.log(`PQ-032.00 ${mission.type} reeled ${reelTicks} + towed ${towTicks} ticks — `
    + `${role} parks ${Math.round(cargoToBerth)} WU out on a ${Math.round(cargoToShip)} WU line, `
    + `ship ${Math.round(shipToBerth)} WU (dock range ${Math.round(dockRange)} WU)`);
  assert.ok(cargoToBerth > berth.radius + cargo.radius,
    `the ${role} must park OUTSIDE the station hull, not at the berth centre`);
  assert.ok(cargoToShip > h.player.radius + cargo.radius,
    `the ${role} must park clear of the ship that towed it`);
  assert.ok(shipToBerth <= dockRange,
    'the ship must be inside the live docking range for dock:docked to be reachable');

  // Leftover throw at the dest dock still pays. Story B3 used to treat any in-sector throw as
  // sling_in; the dest-dock gate is what closed that. The SAME pose is what pays tow_in through
  // dock:docked, so the two posted methods differ only in whether the line is cut — which is why
  // each needs its own spine run.
  if (settle === 'sling_in') {
    h.sim.bus.emit('massline:throw', {
      releaseId: `massline:throw:${h.state.tick}:${cargo.id}`,
      payloadId: cargo.id, aimTargetId: berth.id, aimSynthetic: false, mode: 'aimed',
    });
    const paidThrow = settled();
    console.log(`PQ-032.00 ${mission.type} ${role} leftover throw at dest dock `
      + `${Math.round(cargoToBerth)} WU — paid: ${paidThrow ? 'yes' : 'no'}`);
    assert.equal(paidThrow, true, `${role} leftover throw at the dest dock must settle`);
    const thrown = h.completed[h.completed.length - 1];
    assert.equal(thrown && thrown.completionMethod, 'sling_in',
      `${mission.type} dest-dock throw must pay sling_in`);
    setLiveTether(h, null, 0);
    return;
  }

  h.sim.bus.emit('dock:docked', { stationId: mission.destStationId });
  const paidNear = settled();
  console.log(`PQ-032.00 ${mission.type} ${role} towed to ${Math.round(cargoToBerth)} WU `
    + `(gate ${Math.round(gate)} WU) — paid: ${paidNear ? 'yes' : 'no'} (${settle})`);
  assert.equal(paidNear, true, `${role} towed to the dest dock must settle ${mission.type}`);
  const last = h.completed[h.completed.length - 1];
  assert.equal(last && last.completionMethod, settle,
    `${mission.type} must settle on ${settle}, not another posted method`);
  setLiveTether(h, null, 0);
}

test('PQ-032.00 leftover set pieces name physical headline verbs', () => {
  printSpine();
  // PQ032_BEAT_SET_PIECES is DERIVED from STORY_BEATS (src/data/missions.js), so the deepEqual rows
  // and the `beat.headlineVerb === row.headlineVerb` check below are self-referential — they pin the
  // spelling of the table, not any behaviour. The load-bearing assertions in this test are the
  // buildMissionBoardContract ones: what the station board actually posts.
  //
  // W-BOOKS-0-2 / W-BOOKS-3-4 (§34.7): B1–B3 play the authored book lists, so only B3's
  // long tow keeps the leftover single set-piece row — the wrecking-ball contract and the
  // pod rescue moved into the book-contract flow.
  assert.equal(PQ032_BEAT_SET_PIECES.length, 1);
  assert.deepEqual(PQ032_BEAT_SET_PIECES.map((row) => row.id), [
    'bigger_boat',
  ]);
  assert.deepEqual(PQ032_BEAT_SET_PIECES.map((row) => row.headlineVerb), [
    'tow',
  ]);
  assert.deepEqual(PQ032_BEAT_SET_PIECES.map((row) => row.setPiece), [
    'variance adjustment + feed the maw + foreman',
  ]);
  assert.deepEqual(PQ032_BEAT_SET_PIECES.map((row) => row.physicalType), [
    'tow_recovery',
  ]);
  for (const row of PQ032_BEAT_SET_PIECES) {
    const beat = STORY_BEATS[row.beat];
    assert.equal(beat.id, row.id);
    assert.equal(beat.headlineVerb, row.headlineVerb);
    assert.equal(beat.authoredSetPieceId, row.authoredSetPieceId);
    const offer = buildMissionBoardContract(row.beat, { seed: SEED, epoch: 1 });
    assert.ok(offer, `${row.id} must post a board contract`);
    assert.equal(offer.type, row.physicalType);
    assert.equal(offer.params.authoredSetPieceId, row.authoredSetPieceId);
    assert.equal(offer.params.completionMethods.length, 2);
    assert.match(offer.title, AUTHORED_SET_PIECE_HEADLINE);
    assert.equal(offer.title.toLowerCase().startsWith(row.headlineVerb), true);
  }
  assert.deepEqual(validateEmbodiedMissions(), { ok: true, errors: [] });
  assert.deepEqual(validateEmbodiedDialogue(), { ok: true, errors: [] });
});

// The gate the story latch-dock computes is only as honest as the berth it reads. Pin the AUTHORED
// size of both dest stations: if either is resized, the 103 / 112 WU figures in the PQ-032.00
// receipt stop being true and this fires instead of drifting silently.
test('PQ-032.00 the story latch-dock gate is live station geometry, not a fixture', () => {
  const byId = new Map();
  for (const sector of SECTORS) {
    for (const station of sector.stations || []) byId.set(station.id, station);
  }
  for (const id of ['station_expanse', 'station_ceres']) {
    const record = byId.get(id);
    assert.ok(record, `${id} must exist in the authored sector catalog`);
    assert.equal(record.size, 'M',
      `${id} is size M — src/systems/world.js:1463-1464 gives it radius 34 / dockRadius 72`);
  }
  // pod radius 7 (missions.js:3945), core radius 16 (missions.js:3895); dockRadius 72; slack 24.
  assert.equal(72 + 7 + STORY_LATCH_DOCK_SLACK_WU, 103, 'live B2 pod gate');
  assert.equal(72 + 16 + STORY_LATCH_DOCK_SLACK_WU, 112, 'live B3 core gate');
});

// A real jump is what puts the leftover cargo out in the field, and it puts it FURTHER out than the
// spine below does. `_spawnPhysicalTargetsFor` (src/systems/missions.js:3888) drops the cargo
// 220-300 WU from the player on the first target pass after arrival, and an intentional jump places
// the player at `world.entryPoint` (src/systems/world.js:660). So the live leftover pose is at least
// (entry distance - 300) WU from the berth. If that is not comfortably outside the leftover
// PHYSICAL_BERTH_WU rule, then "the leftover throw starts out in the field" is a harness artifact
// rather than the live case, and the spine's refusals prove nothing about a real run.
test('PQ-032.00 a live jump lands the leftover cargo outside the old 700 WU berth', () => {
  const sim = createSimulation({ seed: SEED, systems: [world], updateOrder: [] });
  const { state } = sim;
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    hull: 200, hullMax: 200, radius: 8,
  });
  state.playerId = player.id;
  const worldSys = sim.registry.get('world');
  const SPAWN_RING_MAX_WU = 300; // missions.js:3888 — r = 220 + rng() * 80.
  for (const [destSectorId, fromSectorId, stationId] of [
    ['sector_charon_expanse', 'sector_io_reach', 'station_expanse'],
    ['sector_ceres_belt', 'sector_tethys_junction', 'station_ceres'],
  ]) {
    worldSys.enterSector(destSectorId, { fromJump: true, via: 'jump', fromSectorId });
    let berth = null;
    for (const e of state.entities.values()) {
      if (e && e.alive !== false && e.type === 'station' && e.pos
        && e.data && e.data.stationId === stationId) berth = e;
    }
    assert.ok(berth, `a jump into ${destSectorId} must materialize ${stationId}`);
    const entry = state.world.entryPoint;
    const arrival = Math.hypot(entry.x - berth.pos.x, entry.z - berth.pos.z);
    const nearest = arrival - SPAWN_RING_MAX_WU;
    console.log(`PQ-032.00 live jump into ${destSectorId} arrives ${Math.round(arrival)} WU from `
      + `${stationId} — leftover cargo spawns no closer than ${Math.round(nearest)} WU`);
    assert.ok(nearest > PHYSICAL_BERTH_WU,
      `a live arrival at ${Math.round(arrival)} WU must leave the cargo outside the leftover `
      + `${PHYSICAL_BERTH_WU} WU berth, or the spine's field refusals are a harness artifact`);
  }
  sim.dispose();
});

// The book route B0→B4, one spine per run for the berth's two posted methods: a mission settles
// ONCE, so the first pay ends it. The long tow's honest-geometry proofs live on the berth leg —
// it is the same set piece (authoredSetPieceId 'long_tow') the pre-book contract carried.
function playTheSpine(b3Settle) {
  const h = boot();
  h.sim.bus.emit('mining:yield', { commodityId: 'cmdty_ore_iron', qty: 1 });
  h.sim.bus.emit('dock:docked', { stationId: 'station_helios' });
  assert.equal(h.state.story.beatIndex, 1);

  // B1 book: the sealed alloy run to Tycho, the Scale 4 weigh, then the infested lane —
  // clear the mites and feed three pods to the intake.
  const alloy = acceptStory(h, 'station_helios', 'campaign47a:b1:alloy_run');
  assert.equal(alloy.type, 'cargo_delivery');
  assert.equal(alloy.params.physicalVerb, 'weigh');
  addCargo(h.state, 'cmdty_alloys', Math.max(1, alloy.params.qty || 6));
  h.sim.bus.emit('dock:docked', { stationId: 'station_tethys' });
  h.sim.bus.emit('kesslerPod:weighed', { variance: true, massT: 6 });
  const infested = acceptStory(h, 'station_tethys', 'campaign47a:b1:infested');
  assert.equal(infested.type, 'patrol_clear');
  flyToDestSector(h, infested);
  for (const id of [...infested.targetEntityIds]) {
    h.sim.bus.emit('entity:killed', { id, killerId: h.player.id });
  }
  for (let i = 0; i < 3; i++) h.sim.bus.emit('furnace:fed', { entityId: 9100 + i });
  assert.equal(h.state.story.beatIndex, 2, 'the alloy run and the furnace detail advance Honest Work');

  // B2 book: the cinder marks (+ the wreck tow receipt), the garden feed, the Nest, then the
  // register contract on Elroy — scan first, then the kill resolves the writ.
  const cinder = acceptStory(h, 'station_tethys', 'campaign47a:b2:cinder');
  assert.equal(cinder.type, 'patrol_clear');
  flyToDestSector(h, cinder);
  for (const id of [...cinder.targetEntityIds]) {
    h.sim.bus.emit('entity:killed', { id, killerId: h.player.id });
  }
  h.sim.bus.emit('rookWreck:delivered', { entityId: 9301 });
  h.sim.bus.emit('understory:gardenFed', { byPlayer: true, gardenId: 'g1', fedMass: 20 });
  h.sim.bus.emit('encounter:resolved', { shape: 'the_nest', sectorId: 'sector_charon_expanse' });
  const elroy = acceptStory(h, 'station_tethys', 'campaign47a:b2:elroy');
  assert.equal(elroy.type, 'bounty_hunt');
  flyToDestSector(h, elroy);
  const elroyId = elroy.targetEntityIds[0];
  h.state.entities.get(elroyId).pos = { x: h.player.pos.x + 5, z: h.player.pos.z };
  h.sim.bus.emit('scan:completed', { targetId: elroyId });
  h.sim.bus.emit('entity:killed', { id: elroyId, killerId: h.player.id });
  assert.equal(h.state.story.beatIndex, 3, 'the register writ advances First Blood');
  assert.equal(h.state.story.flags.elroy_outcome, 'force', 'the kill stamps the force outcome');

  h.sim.bus.emit('ship:purchased', { defId: 'ship_drifter', stationId: 'station_tethys', price: 9000 });
  assert.equal(h.state.story.beatIndex, 3, 'a hull buy cannot settle the long tow');

  // B3 book leg one — the berth delivery is the leftover long tow. A field throw and a
  // field release must still refuse; the dest-dock pose pays the asserted method.
  const berth = acceptStory(h, 'station_tethys', 'campaign47a:b3:berth');
  assert.equal(berth.type, 'tow_recovery');
  assert.equal(berth.params.physicalVerb, 'tow');
  assert.equal(berth.params.bookScene, 'variance_delivery');
  flyToDestSector(h, berth);
  throwFromTheField(h, berth, 'slag_core');
  towToTheDock(h, berth, 'slag_core', b3Settle);
  assert.equal(berth.status, 'completed');
  assert.equal(h.state.story.beatIndex, 3, 'the delivery is one leg of the yard list, not the book');

  // B3 book leg two — the maw stuns on three solid hits before the same tow settles it.
  const maw = acceptStory(h, 'station_tethys', 'campaign47a:b3:maw');
  assert.equal(maw.type, 'tow_recovery');
  assert.equal(maw.params.mawStunsNeeded, 3);
  flyToDestSector(h, maw);
  const mawBody = targetsByRole(h.state, maw, 'slag_core')[0];
  assert.ok(mawBody, 'the maw materializes as a slag core');
  for (let i = 0; i < 3; i++) {
    h.sim.bus.emit('tether:whipImpact', { victimId: mawBody.id, rating: 'solid' });
  }
  towToTheDock(h, maw, 'slag_core', 'tow_in');
  assert.equal(maw.status, 'completed');

  // B3 book leg three — the Foreman's yard feud closes the book.
  const foreman = acceptStory(h, 'station_tethys', 'campaign47a:b3:foreman');
  assert.equal(foreman.type, 'capital_boss');
  flyToDestSector(h, foreman);
  const capital = foreman.targetEntityIds
    .map((id) => h.state.entities.get(id))
    .find((e) => e && roleOf(e) === 'capital_hull');
  assert.ok(capital, 'the Foreman materializes as a capital hull');
  h.sim.bus.emit('entity:killed', { id: capital.id, killerId: h.player.id });
  assert.equal(foreman.status, 'completed');
  assert.equal(h.state.story.beatIndex, 4, 'the yard list closes Bigger Boat');

  // Name the methods the spine actually settled on, with no `||` fallback to the mission TYPE —
  // a type is what was posted, a completionMethod is what the player did.
  const methods = h.completed.map((row) => row.completionMethod);
  const berthMethod = h.completed
    .filter((row) => row.missionId === berth.id)
    .map((row) => row.completionMethod)[0];
  h.sim.dispose();
  return { methods, berthMethod };
}

test('PQ-032.00 seed 3200 plays the book spine with the long-tow set piece live', () => {
  printSpine();
  // The berth posts ['tow_in','sling_in'] like the pre-book long tow did. Prove BOTH from the
  // same dest-dock arrival pose: cutting the line for the last stretch pays sling_in, keeping
  // the mass on the line and docking pays tow_in — the beat's own headline verb.
  console.log('PQ-032.00 --- spine run 1: B3 berth settles by cutting the line at the dock ---');
  const run1 = playTheSpine('sling_in');
  assert.equal(run1.berthMethod, 'sling_in');
  console.log('PQ-032.00 --- spine run 2: B3 berth settles by docking with the mass on the line ---');
  const run2 = playTheSpine('tow_in');
  assert.equal(run2.berthMethod, 'tow_in');
});
