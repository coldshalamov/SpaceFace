#!/usr/bin/env node
// PQ-019C — run the predeclared fixed-seed tuning matrix and select once.
//
// The matrix in `test/fixtures/pq019c-tuning-matrix.json` was committed BEFORE this script was run,
// so the search space cannot be back-fitted to numbers somebody already liked. This script measures
// the world, applies each dimension's stated objective to its candidate list, and prints the
// selection. It writes nothing: the selected values are transcribed by hand into
// `src/data/heistMission.js` and pinned by `test/pq019c-heist-tuning.test.mjs`.
//
// Headless only. No browser, no Electron, no frame timings — PQ-034 holds those leases.
//
//   node scripts/tune-pq019c-heist.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { physics } from '../src/core/physics.js';
import { world } from '../src/systems/world.js';
import { heistFacilities } from '../src/systems/heistFacilities.js';
import {
  lawSecurity, LAW_INCIDENT_WITNESS_RADIUS, effectiveLawSecurity,
} from '../src/systems/lawSecurity.js';
import { authorityResponsePolicy } from '../src/law/authorityResponse.js';
import {
  PQ019_CAPSULE, PQ019_FACILITIES, PQ019_HEIST_SECTOR_ID, projectPq019FacilitySocket,
} from '../src/data/heistFacilities.js';
import { MISSION_TUNING } from '../src/data/missions.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const matrix = JSON.parse(readFileSync(
  path.join(here, '..', 'test', 'fixtures', 'pq019c-tuning-matrix.json'), 'utf8',
));

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

/** Authored socket-to-socket geometry, the same projection the facility owner spawns against. */
function routeGeometry() {
  const launcher = projectPq019FacilitySocket(PQ019_FACILITIES.heist_launcher);
  const catcher = projectPq019FacilitySocket(PQ019_FACILITIES.lawful_catcher);
  const fence = projectPq019FacilitySocket(PQ019_FACILITIES.fence_receiver);
  return {
    launcherToCatcherWu: dist(launcher, catcher),
    catcherToFenceWu: dist(catcher, fence),
    launcherToFenceWu: dist(launcher, fence),
  };
}

/** Boot the real world once so the measurements below are facts, not arithmetic on constants. */
function measureWorld(seed) {
  const bus = createBus();
  const sim = createSimulation({
    seed, bus, systems: [physics, world, heistFacilities, lawSecurity],
  });
  const { state } = sim;
  state.mode = 'flight';
  state.player.heat = 0;
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 12, mass: 24,
    hull: 100, hullMax: 100, collides: true,
  });
  state.playerId = player.id;
  sim.registry.get('world').enterSector(PQ019_HEIST_SECTOR_ID);
  sim.step(SIM_DT);

  const stations = state.entityList.filter((e) => e?.alive !== false && e.type === 'station');
  const tethys = stations.find((e) => e.data?.stationId === 'station_tethys') || stations[0] || null;
  // MEASURE BETWEEN LIVE ENTITIES. An earlier version of this script projected the authored socket
  // into sector-local space and then added `state.world.originX`, which does not exist — the sum
  // went NaN, `|| 0` swallowed it, and the "distance to the launcher" was really the distance to the
  // world origin. Both facility heads and the station are already spawned in global coordinates, so
  // measuring hull-to-hull is both simpler and impossible to get wrong that way.
  const launcherHead = state.entityList.find((e) => (
    e?.alive !== false && e.data?.heistFacilityRole === 'heist_launcher_head'
  )) || null;
  const policy = authorityResponsePolicy(effectiveLawSecurity(state));

  return {
    seed,
    responderCap: policy.responderCap,
    witnessRadiusLive: LAW_INCIDENT_WITNESS_RADIUS,
    // Distance a player actually has to cover from the Tethys board to the launch corridor.
    tethysToLauncherWu: tethys && launcherHead ? dist(tethys.pos, launcherHead.pos) : null,
    stationCount: stations.length,
  };
}

/**
 * Highest credit value an ordinary board contract at a Tethys-grade hub can carry at risk tier 3.
 * Read from the live mission tuning rather than eyeballed: BASE * RISK_MULT[3], best base type.
 */
function boardMaxCr() {
  const risk = (MISSION_TUNING.RISK_MULT && MISSION_TUNING.RISK_MULT[3]) || 2.2;
  const bases = Object.values(MISSION_TUNING.BASE || {}).filter((v) => Number.isFinite(v));
  const best = bases.length ? Math.max(...bases) : 600;
  return Math.round(best * risk);
}

function pick(list, predicate, fallback) {
  const hit = list.filter(predicate);
  return hit.length ? hit[0] : fallback;
}

function main() {
  const geo = routeGeometry();
  const worlds = matrix.seeds.map(measureWorld);
  const responderCap = Math.min(...worlds.map((w) => w.responderCap));
  const d = matrix.dimensions;
  const results = {};
  const rationale = {};

  // ── launchSpeed: fastest speed whose launcher->catcher transit still exceeds 20 s ─────────────
  const speedRows = d.launchSpeed.candidates.map((v) => ({
    value: v, transitS: geo.launcherToCatcherWu / v,
  }));
  const speedOk = speedRows.filter((r) => r.transitS > 20).sort((a, b) => b.value - a.value);
  results.launchSpeed = speedOk.length ? speedOk[0].value : d.launchSpeed.authored;
  rationale.launchSpeed = speedRows.map((r) => `${r.value}=>${r.transitS.toFixed(1)}s`).join(' ');

  // ── capsuleMass: authored unless a cell changes the ratio band against the player hull ────────
  const massRows = d.capsuleMass.candidates.map((v) => ({ value: v, ratio: v / 24 }));
  results.capsuleMass = d.capsuleMass.authored;
  rationale.capsuleMass = massRows.map((r) => `${r.value}=>x${r.ratio.toFixed(1)}`).join(' ');

  // ── launchWindowS: smallest window clearing the measured Tethys->launcher transit with margin ─
  // Cruise reference is the live mission tuning's own number, not an invented one.
  const cruise = MISSION_TUNING.cruiseSpeedRef || 140;
  const transitS = worlds[0].tethysToLauncherWu != null
    ? worlds[0].tethysToLauncherWu / cruise : null;
  const needS = transitS == null ? 0 : transitS * 1.25;
  results.launchWindowS = pick(
    [...d.launchWindowS.candidates].sort((a, b) => a - b), (v) => v >= needS,
    d.launchWindowS.candidates[d.launchWindowS.candidates.length - 1],
  );
  rationale.launchWindowS = `tethys->launcher ${worlds[0].tethysToLauncherWu == null ? 'n/a'
    : `${worlds[0].tethysToLauncherWu.toFixed(0)}WU`} @${cruise}WU/s = ${transitS == null ? 'n/a'
    : `${transitS.toFixed(1)}s`}; need >= ${needS.toFixed(1)}s`;

  // ── runWindowTicks: smallest that covers the whole route at the selected speed, with margin ───
  const fullRouteS = (geo.launcherToCatcherWu + geo.catcherToFenceWu) / results.launchSpeed;
  const needTicks = Math.ceil(fullRouteS * 2 / SIM_DT);
  results.runWindowTicks = pick(
    [...d.runWindowTicks.candidates].sort((a, b) => a - b), (v) => v >= needTicks,
    d.runWindowTicks.candidates[d.runWindowTicks.candidates.length - 1],
  );
  rationale.runWindowTicks = `full route ${fullRouteS.toFixed(0)}s @${results.launchSpeed}WU/s; `
    + `need >= ${needTicks} ticks (2x margin)`;

  // ── witnessRadius: largest candidate that still leaves an unwitnessed annulus under the floor ─
  const ceiling = 600;
  const radiusOk = d.witnessRadius.candidates
    .filter((v) => v < ceiling).sort((a, b) => b - a);
  results.witnessRadius = radiusOk.length ? radiusOk[0] : d.witnessRadius.authored;
  rationale.witnessRadius = `annulus at ${results.witnessRadius} = `
    + `${ceiling - results.witnessRadius}WU below the ${ceiling}WU lawful-station floor; `
    + `live LAW_INCIDENT_WITNESS_RADIUS=${worlds[0].witnessRadiusLive}`;

  // ── responderLeaseCap: min(authored, live authority responder cap) ────────────────────────────
  results.responderLeaseCap = Math.min(d.responderLeaseCap.authored, responderCap);
  rationale.responderLeaseCap = `live authority responderCap=${responderCap}`;

  // ── escapeRadiusWu: smaller than the leash and smaller than the launcher->catcher leg ─────────
  const legWu = geo.launcherToCatcherWu;
  const escapeOk = [...d.escapeRadiusWu.candidates].sort((a, b) => b - a)
    .filter((v) => v < legWu * 0.95);
  results.escapeRadiusWu = escapeOk.length ? escapeOk[0] : d.escapeRadiusWu.authored;
  rationale.escapeRadiusWu = `launcher->catcher leg ${legWu.toFixed(0)}WU; `
    + `largest candidate under 95% of it`;

  // ── responderLeashWu: smallest candidate at least 600 WU above the selected escape radius ─────
  results.responderLeashWu = pick(
    [...d.responderLeashWu.candidates].sort((a, b) => a - b),
    (v) => v - results.escapeRadiusWu >= 600,
    d.responderLeashWu.candidates[d.responderLeashWu.candidates.length - 1],
  );
  rationale.responderLeashWu = `leash - escape = `
    + `${results.responderLeashWu - results.escapeRadiusWu}WU (need >= 600)`;

  // ── escapeHoldTicks: smallest >= 1 s that latches well inside the selected run window ─────────
  const oneSecond = Math.round(1 / SIM_DT);
  results.escapeHoldTicks = pick(
    [...d.escapeHoldTicks.candidates].sort((a, b) => a - b),
    (v) => v >= oneSecond && v * 4 <= results.runWindowTicks,
    d.escapeHoldTicks.authored,
  );
  rationale.escapeHoldTicks = `1s = ${oneSecond} ticks; run window ${results.runWindowTicks}`;

  // ── payoutCr: smallest candidate above the risk-3 board max and within ~2x of it ──────────────
  const boardMax = boardMaxCr();
  results.payoutCr = pick(
    [...d.payoutCr.candidates].sort((a, b) => a - b),
    (v) => v > boardMax && v <= boardMax * 2,
    d.payoutCr.authored,
  );
  rationale.payoutCr = `risk-3 board max ${boardMax}cr; band (${boardMax}, ${boardMax * 2}]`;

  // ── recoveryPayoutCr: nearest candidate to half the selected payout, strictly under it ────────
  const half = results.payoutCr / 2;
  const recoveryOk = d.recoveryPayoutCr.candidates
    .filter((v) => v < results.payoutCr && v >= results.payoutCr / 3)
    .sort((a, b) => Math.abs(a - half) - Math.abs(b - half));
  results.recoveryPayoutCr = recoveryOk.length ? recoveryOk[0] : d.recoveryPayoutCr.authored;
  rationale.recoveryPayoutCr = `half of ${results.payoutCr} = ${half}; `
    + `nearest admissible candidate`;

  // ── unlaunchedWindowTicks: derived, must exceed the selected launch window with margin ────────
  results.unlaunchedWindowTicks = Math.ceil(results.launchWindowS * 1.35 / SIM_DT / 600) * 600;
  rationale.unlaunchedWindowTicks = `launch window ${results.launchWindowS}s = `
    + `${Math.round(results.launchWindowS / SIM_DT)} ticks; +35% margin, rounded to 600`;

  const report = {
    schema: 'spaceface.pq019c.tuningSelection.v1',
    matrixSchema: matrix.schema,
    seeds: matrix.seeds,
    geometry: {
      launcherToCatcherWu: Number(geo.launcherToCatcherWu.toFixed(3)),
      catcherToFenceWu: Number(geo.catcherToFenceWu.toFixed(3)),
      launcherToFenceWu: Number(geo.launcherToFenceWu.toFixed(3)),
    },
    measured: {
      responderCap,
      witnessRadiusLive: worlds[0].witnessRadiusLive,
      riskTier3BoardMaxCr: boardMax,
      tethysToLauncherWu: worlds[0].tethysToLauncherWu == null ? null
        : Number(worlds[0].tethysToLauncherWu.toFixed(1)),
      authoredCapsule: { launchSpeed: PQ019_CAPSULE.launchSpeed, mass: PQ019_CAPSULE.mass },
    },
    selected: results,
    rationale,
    confirmsAuthored: {
      launchSpeed: results.launchSpeed === PQ019_CAPSULE.launchSpeed,
      capsuleMass: results.capsuleMass === PQ019_CAPSULE.mass,
    },
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main();
