// DEMO-BERTH-1: the after-throw berth run must CLOSE on the station and take the dock gate.
//
// The pure-guidance checks in berth-autopilot-holds-course.test.mjs can only prove what one call to
// the flight computer asks for. The defect they could not catch lives across ticks: the hull would
// close, punch through the berth pocket, fall out of the lane, and be aimed at the far-side orbit
// point 190 wu back out — twice in one run, ending "arrived" 61 wu away with no dock prompt. This
// file ticks the real sim from a seeded start and holds the two facts that actually matter to a
// pilot:
//   1. once the run has closed to the berth, it never flies back out (the "flew away" shape);
//   2. the run reaches the station's own dock prompt, not merely an "arrived" status.
//
// Start conditions are the after-throw seat measured in .devshots/first-ten: 320 wu out on the 250°
// bearing with the throw's inbound and tangential momentum. Seed 4242 New Game is the demo route.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.SPACEFACE_PLAYER_STORE_DIR = '';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const { createSimHost } = await import('../scripts/lib/simWorkerHost.mjs');
const { createSimCommandRing, pushLaneCommand } = await import('../scripts/lib/simCommandChannel.mjs');
const { resolveAutopilotTarget } = await import('../src/core/flight/flightPresentationReads.js');
const { resolveDockRange } = await import('../src/core/dockRange.js');

const SEED = 4242;
const TICKS = 60 * 70;

/**
 * Fly one berth run and collect the trace. `bearing:distance:inbound:tangential`, matching
 * scripts/probe-berth-run.mjs so a failure here reproduces on that probe.
 */
async function flyBerthRun(spec) {
  const scenarioContract = JSON.parse(readFileSync(join(ROOT, 'src/data/scenarios/47a.scenario.json'), 'utf8'));
  const lane = createSimHost();
  await lane.init({ profile: 'production', seed: SEED, scenarioContract });
  const ring = createSimCommandRing();
  let tick = 0;
  let ackEnd = 0;
  const send = async (n, ...commands) => {
    for (const command of commands) pushLaneCommand(ring, command);
    const reply = await lane.tick({ tick: ++tick, steps: n, ackEnd, commands: ring.drain() });
    ackEnd = (reply && reply.journal && reply.journal.end) ?? (reply && reply.rebuild && reply.rebuild.end) ?? ackEnd;
    return reply;
  };

  try {
    await send(0, { kind: 'mode', mode: 'loading' },
      { kind: 'rpc', id: 'boot', op: 'newGameBoot', args: { opts: { seed: SEED } } });
    const state = lane.host.state;
    await send(1, { kind: 'mode', mode: 'flight' });
    // The boot settles the sector across a few ticks before the station list is complete.
    for (let i = 0; i < 90; i++) { await new Promise((ok) => setImmediate(ok)); await send(1); }

    const station = (state.entityList || []).find((e) => e && e.type === 'station'
      && String(e.data?.stationId || '') === 'station_helios');
    assert.ok(station, 'the Helios trade hub must be in the New Game sector');
    const stationId = station.data?.stationId || null;

    const player = state.entities.get(state.playerId);
    assert.ok(player, 'the player hull must exist');
    const [bearingDeg, dist, inbound, tangential] = spec.split(':').map(Number);
    const a = bearingDeg * Math.PI / 180;
    const rx = Math.cos(a);
    const rz = Math.sin(a);
    player.pos.x = station.pos.x + rx * dist;
    player.pos.z = station.pos.z + rz * dist;
    player.vel.x = -rx * inbound + (-rz) * tangential;
    player.vel.z = -rz * inbound + rx * tangential;
    player.rot = Math.atan2(-rz, -rx);
    player.angVel = 0;
    Object.assign(state.input, { moveX: 0, moveZ: 0, turnIntent: 0, boost: false, brake: false });
    if (state.nav && state.nav.autopilot) state.nav.autopilot.active = false;
    await send(2);

    // The gate is read from core's resolveDockRange while the run flies (see the loop below). The
    // bus event is kept as a second witness that physics actually published the transition.
    let eventGate = false;
    lane.host.bus.on('dock:range', (p) => {
      if (p && p.stationId === stationId && p.inRange) eventGate = true;
    });

    // The exact command `E` flies (src/ui/input.js flyToBerth).
    await send(0, { kind: 'busEmit', emit: 'ui:setCourse', payload: {
      pos: { x: station.pos.x, z: station.pos.z }, targetEntityId: station.id,
      label: 'Helios Station', waypointKind: 'local', autopilot: true,
      berthAutopilot: true, berthStationId: station.data?.stationId || station.id,
    } });
    state.ui.berthAutopilotStationId = station.id;

    const ranges = [];
    let closestToBerth = Infinity;
    let docked = false;
    let heldDockGate = false;
    for (let s = 0; s < TICKS; s++) {
      await send(1);
      ranges.push(Math.hypot(player.pos.x - station.pos.x, player.pos.z - station.pos.z));
      const target = state.nav && state.nav.autopilot ? resolveAutopilotTarget(state, state.nav.autopilot) : null;
      if (target) {
        closestToBerth = Math.min(closestToBerth, Math.hypot(target.x - player.pos.x, target.z - player.pos.z));
      }
      // The gate is core's own resolveDockRange — the function the real dock:range event is
      // published from. state.ui.dockInRange is written by the DOM input layer, which a headless
      // lane never mounts, so reading it here would report "never in range" on a docked hull.
      if (!heldDockGate) {
        const gate = resolveDockRange(state, {});
        if (gate.stationId === stationId && gate.station === station) heldDockGate = true;
      }
      if (state.ui && state.ui.docked) { docked = true; break; }
      if (state.nav && state.nav.autopilot && state.nav.autopilot.active !== true) break;
    }
    return { ranges, closestToBerth, dockInRange: heldDockGate, eventGate, docked, simTime: Number(state.simTime) || 0 };
  } finally {
    try { lane.host.registry.get('save')._suppressUnloadExitPlay = true; } catch (_) { /* teardown */ }
    try { lane.host.registry.get('save')._suppressUnloadExitSave = true; } catch (_) { /* teardown */ }
    try { lane.shutdown(); } catch (_) { /* teardown */ }
  }
}

/**
 * The "flew away" shape: after the run has closed inside `closeBand`, the range to the station
 * must never grow again by more than `slack` wu. A run that laps the station, or is flung to the
 * far-side orbit point, blows straight through this.
 */
function assertNoFlyAway(ranges, closeBand, slack, label) {
  let closedAt = -1;
  let closestAfterClose = Infinity;
  for (let i = 0; i < ranges.length; i++) {
    if (closedAt < 0) {
      if (ranges[i] <= closeBand) { closedAt = i; closestAfterClose = ranges[i]; }
      continue;
    }
    closestAfterClose = Math.min(closestAfterClose, ranges[i]);
    const grew = ranges[i] - closestAfterClose;
    assert.ok(grew <= slack,
      `${label}: range grew ${grew.toFixed(1)} wu after closing to ${closestAfterClose.toFixed(1)} wu `
      + `(t=${(i / 60).toFixed(2)}s, at ${ranges[i].toFixed(1)} wu) — the run must not fly away from the berth`);
  }
  assert.ok(closedAt >= 0, `${label}: the run never closed inside ${closeBand} wu; min was ${Math.min(...ranges).toFixed(1)}`);
}

test('the seeded after-throw berth run closes on Helios and takes the dock gate', async () => {
  // 250° bearing, 320 wu out, 90 wu/s inbound and 40 wu/s tangential — the seat the packet
  // measured (320 wu -> out to 642 m in the bad run, direct in the good one).
  const run = await flyBerthRun('250:320:-90:40');
  assertNoFlyAway(run.ranges, 120, 45, 'after-throw E');
  assert.equal(run.dockInRange, true,
    'the flight computer must put the hull inside the station\'s own dock gate, not just report "arrived"');
  assert.equal(run.eventGate, true,
    'physics must publish the dock:range transition for the gate the hull reached');
  assert.ok(run.closestToBerth <= 25,
    `the berth must actually be reached, closest was ${run.closestToBerth.toFixed(1)} wu`);
});

test('the same berth run from rest also closes and takes the dock gate', async () => {
  // The rest seat: no throw momentum to blame, so this pins the guidance itself rather than a
  // lucky inbound vector.
  const run = await flyBerthRun('250:320:0:0');
  assertNoFlyAway(run.ranges, 120, 45, 'from rest');
  assert.equal(run.dockInRange, true, 'a from-rest berth run must reach the dock gate too');
  assert.equal(run.eventGate, true, 'physics must publish the dock:range transition from rest too');
  assert.ok(run.closestToBerth <= 25,
    `the berth must actually be reached, closest was ${run.closestToBerth.toFixed(1)} wu`);
});
