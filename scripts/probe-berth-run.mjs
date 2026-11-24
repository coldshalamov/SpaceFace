// Probe: the Adventure berth run E starts, tick by tick (DEMO-BERTH-1).
//
// Boots the real production sim in Node (same host the worker lane uses), then plays a list of
// starting conditions through the SAME command ui/input.js flies on E (`ui:setCourse` with the
// berth stamp) and logs, four times a second, where the flight computer is aiming, what the
// guidance is doing and how far the berth is. Diagnostic only; writes nothing.
//
//   node scripts/probe-berth-run.mjs [--seed=4242] [--seconds=70] [--cases=default]
//
// A case is `bearing:distance:speedTowardStation:speedTangential` (bearing = the ship's angle
// around the station, degrees). Defaults cover the after-throw frames: 320 wu at rest, the same
// with the throw's momentum outbound, and the far, fast runs (640/1480 wu, 120-210 wu/s).
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.SPACEFACE_PLAYER_STORE_DIR = '';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));
const SEED = Number(argv.seed || 4242);
const SECONDS = Number(argv.seconds || 70);
const CASES = String(argv.cases || '250:320:0:0,250:320:-90:40,200:650:120:60,100:1480:-210:0,0:900:0:0');
// --strip: every non-station body is made non-physical for the run. The matched control: same
// seed, same seat, same command, empty space. If the run goes straight in, the traffic avoidance
// is what bends it out.
const STRIP = argv.strip === true;

const { createSimHost } = await import('./lib/simWorkerHost.mjs');
const { createSimCommandRing, pushLaneCommand } = await import('./lib/simCommandChannel.mjs');
const { resolveAutopilotTarget } = await import('../src/core/flight/flightPresentationReads.js');
const { resolveBerthWorld, resolveCorridorAxisWorld, resolveCollisionProxyManifest,
  effectiveCorridorBearingDeg, resolveDockAnchor } = await import('../src/data/collisionProxyManifests.js');

const scenarioContract = JSON.parse(readFileSync(join(ROOT, 'src/data/scenarios/47a.scenario.json'), 'utf8'));
const lane = createSimHost();
await lane.init({ profile: 'production', seed: SEED, scenarioContract });
const ring = createSimCommandRing();
let tick = 0; let ackEnd = 0;
const send = async (n, ...commands) => {
  for (const command of commands) pushLaneCommand(ring, command);
  const reply = await lane.tick({ tick: ++tick, steps: n, ackEnd, commands: ring.drain() });
  ackEnd = (reply && reply.journal && reply.journal.end) ?? (reply && reply.rebuild && reply.rebuild.end) ?? ackEnd;
  return reply;
};

await send(0, { kind: 'mode', mode: 'loading' },
  { kind: 'rpc', id: 'probe-boot', op: 'newGameBoot', args: { opts: { seed: SEED } } });
const state = lane.host.state;
await send(1, { kind: 'mode', mode: 'flight' });
for (let i = 0; i < 90; i++) { await new Promise((ok) => setImmediate(ok)); await send(1); }

const station = (state.entityList || []).find((e) => e && e.type === 'station'
  && String(e.data?.stationId || '') === 'station_helios');
if (!station) { console.log('NO HELIOS'); process.exit(1); }
const manifest = resolveCollisionProxyManifest(station);
const berth = resolveBerthWorld(station, manifest);
const axis = resolveCorridorAxisWorld(station, manifest);
const bearing = effectiveCorridorBearingDeg(manifest, station);
const player = state.entities.get(state.playerId);
const anchor = resolveDockAnchor(station, manifest, player);
console.log(`station ${station.id} ${station.pos.x.toFixed(0)},${station.pos.z.toFixed(0)} dockR ${station.data?.dockRadius}`
  + ` stamped ${station.data?.corridorBearingDeg?.toFixed(1)} snap ${bearing}° axis ${axis.x.toFixed(2)},${axis.z.toFixed(2)}`
  + ` berth ${berth.x.toFixed(0)},${berth.z.toFixed(0)} anchor ${anchor.kind} @${Math.hypot(anchor.x - station.pos.x, anchor.z - station.pos.z).toFixed(0)} dockR ${anchor.dockRadius}`);
if (STRIP) {
  let stripped = 0;
  for (const e of state.entityList) {
    if (!e || e === station || e === player) continue;
    if (e.collides) { e.collides = false; stripped++; }
    if (e.physicsBody && e.physicsBody !== false) e.physicsBody = false;
  }
  console.log(`stripped ${stripped} non-station bodies`);
}

const fmt = (n, w = 5) => (Number.isFinite(n) ? n.toFixed(0).padStart(w) : ' '.repeat(w - 1) + '-');

async function runCase(spec) {
  const [bearingDeg, dist, radVel, tanVel] = spec.split(':').map(Number);
  const a = bearingDeg * Math.PI / 180;
  const rx = Math.cos(a); const rz = Math.sin(a);
  player.pos.x = station.pos.x + rx * dist;
  player.pos.z = station.pos.z + rz * dist;
  // Inbound is -r; tangential is the perpendicular.
  player.vel.x = -rx * radVel + (-rz) * tanVel;
  player.vel.z = -rz * radVel + (rx) * tanVel;
  player.rot = Math.atan2(-rz, -rx);
  player.angVel = 0;
  Object.assign(state.input, { moveX: 0, moveZ: 0, turnIntent: 0, boost: false, brake: false });
  if (state.nav && state.nav.autopilot) state.nav.autopilot.active = false;
  await send(2);
  const anchorNow = resolveDockAnchor(station, manifest, player);
  console.log(`\n== case ${spec} · start d ${dist} bearing ${bearingDeg}° speed ${Math.hypot(player.vel.x, player.vel.z).toFixed(0)}`
    + ` · anchor ${anchorNow.kind} berth-r ${Math.hypot(anchorNow.x - station.pos.x, anchorNow.z - station.pos.z).toFixed(0)}`);

  // The dock prompt is the sim's own dock:range event — the gate a player meets.
  let promptAt = null;
  const onRange = (p) => {
    if (!p || p.stationId !== (station.data?.stationId || null)) return;
    if (p.inRange && promptAt == null) promptAt = state.simTime;
  };
  lane.host.bus.on('dock:range', onRange);

  await send(0, { kind: 'busEmit', emit: 'ui:setCourse', payload: {
    pos: { x: station.pos.x, z: station.pos.z }, targetEntityId: station.id,
    label: 'Helios Station', waypointKind: 'local', autopilot: true,
    berthAutopilot: true, berthStationId: station.data?.stationId || station.id,
  } });
  state.ui.berthAutopilotStationId = station.id;

  let maxD = dist; let minD = dist; let maxShipAim = 0; let docked = false;
  for (let s = 0; s < SECONDS * 60; s++) {
    await send(1);
    const ap = state.nav && state.nav.autopilot;
    const target = ap ? resolveAutopilotTarget(state, ap) : null;
    const d = Math.hypot(player.pos.x - station.pos.x, player.pos.z - station.pos.z);
    const anchorD = Math.hypot(anchorNow.x - player.pos.x, anchorNow.z - player.pos.z);
    maxD = Math.max(maxD, d); minD = Math.min(minD, d);
    if (target) maxShipAim = Math.max(maxShipAim, Math.hypot(target.x - player.pos.x, target.z - player.pos.z));
    if (s % 15 === 0 || (ap && ap.active !== true)) {
      const speed = Math.hypot(player.vel.x, player.vel.z);
      const tel = state.input && state.input.autopilot;
      const aimD = target ? Math.hypot(target.x - station.pos.x, target.z - station.pos.z) : NaN;
      const aimFromShip = target ? Math.hypot(target.x - player.pos.x, target.z - player.pos.z) : NaN;
      console.log(`t=${(s / 60).toFixed(2).padStart(6)} d=${fmt(d)} berth ${fmt(anchorD)} spd=${fmt(speed)}`
        + ` aim r${fmt(aimD)} ship ${fmt(aimFromShip)} ${target ? (target.dockingStage || 'point') : '-'}`
        + `${target && target.corridorInLane ? ' lane' : ''}`
        + ` | ap ${ap ? (ap.active ? 'on ' : 'OFF') + '/' + ap.status : '-'}`
        + ` tel ${tel && typeof tel === 'object' ? `${tel.status || '-'}${tel.avoiding ? ' avoid' : ''}${tel.settled ? ' settle' : ''}${tel.braking ? ' brake' : ''}` : '-'}`
        + ` dock ${state.dockingCorridor ? state.dockingCorridor.phase : '-'}/${state.dockingCorridor ? fmt(state.dockingCorridor.distToBerth) : '-'}`
        + ` range ${state.ui?.dockInRange ? 'Y' : 'n'}`);
    }
    if (state.ui && state.ui.docked) { docked = true; console.log('DOCKED'); break; }
    if (ap && ap.active !== true) break;
  }
  console.log(`RESULT ${spec} range ${minD.toFixed(0)}..${maxD.toFixed(0)} furthestAim ${maxShipAim.toFixed(0)}`
    + ` dockInRange ${!!state.ui?.dockInRange} prompt ${promptAt == null ? 'never' : promptAt.toFixed(1) + 's'}`
    + ` docked ${docked}`);
  // The dock PROMPT is not a dock. A run that ends holding the prompt, parked at the gate, is a
  // good berth; it is still not "docked", and reporting the prompt as success is what let a run
  // that never reached the gate read as done (review of DEMO-BERTH-1).
  const heldGate = promptAt != null && Math.hypot(player.vel.x, player.vel.z) <= 12
    && !!(state.ui?.dockInRange);
  if (heldGate && !docked) console.log(`AT GATE ${spec} — prompt is up at ${Math.hypot(player.vel.x, player.vel.z).toFixed(1)} wu/s, hull never docked`);
  lane.host.bus.off?.('dock:range', onRange);
  if (state.ui) state.ui.dockInRange = false;
  return { spec, minD, maxD, maxShipAim, docked, promptAt, heldGate };
}

const results = [];
for (const spec of CASES.split(',').filter(Boolean)) results.push(await runCase(spec));console.log('\n== summary');
for (const r of results) {
  const outcome = r.docked ? 'DOCKED' : r.heldGate ? 'at gate (prompt up, not docked)' : 'no dock';
  console.log(` ${r.spec}: ${outcome} min ${r.minD.toFixed(0)} max ${r.maxD.toFixed(0)} furthestAim ${r.maxShipAim.toFixed(0)}`);
}
try { lane.host.registry.get('save')._suppressUnloadExitSave = true; } catch (_) { /* teardown */ }
try { lane.shutdown(); } catch (_) { /* teardown */ }
process.exit(0);
