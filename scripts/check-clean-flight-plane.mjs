#!/usr/bin/env node
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import { makeShipEntitySpec, fittingsFromDefaultModules } from '../src/systems/ships.js';
import { NEW_GAME } from '../src/data/newGameDefaults.js';
import { transitionFlightKeyState } from '../src/systems/input.js';
import { SECTOR_ANCHORS } from '../src/data/sectorAnchors.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { createFlightPlaneObserver, compareFlightPlane } from './lib/cleanFlightPlane.mjs';

os.setPriority(os.constants.priority.PRIORITY_LOW);
const arg = key => process.argv.find(x => x.startsWith(`--${key}=`))?.slice(key.length + 3);
const seed = Number(arg('seed') || 4242), ticks = Number(arg('ticks') || 10800);
if (!Number.isInteger(seed) || !Number.isInteger(ticks) || ticks < 1 || ticks > 18000) throw new Error('seed/ticks must be bounded integers');
const runtime = createAuthoritativeRuntime({ profileId: 'production', nodeSafeOnly: true, seed });
let report;
try {
  const { state, bus } = runtime;
  state.mode = 'flight';
  state.settings.gameplay.tutorialHints = false;
  state.player.credits = NEW_GAME.credits;
  runtime.getSystem('ships').newGame();
  state.playerId = runtime.spawn(makeShipEntitySpec(NEW_GAME.shipId, {
    team: 0, factionId: 'faction_free', isPlayer: true, player: state.player,
    fittings: fittingsFromDefaultModules(NEW_GAME.shipId, NEW_GAME.fittedModules),
    pos: { x: 0, z: 0 }, rot: 0,
  })).id;
  runtime.getSystem('world').newGame();
  runtime.getSystem('economy').newGame();
  runtime.getSystem('world').enterSector(NEW_GAME.startingSectorId, {});
  bus.emit('game:started', {});
  await runtime.getSystem('physics').prepareBackend(state, { reset: true });
  const gate = SECTOR_ANCHORS.sector_helios_prime.gates.find(x => x.to === 'sector_ceres_belt').pos;
  const station = SECTOR_ANCHORS.sector_ceres_belt.stations[0].pos;
  const arrival = sectorLocalToGlobalForSector(station, 'sector_ceres_belt');
  const observer = createFlightPlaneObserver(state, bus), hash = createHash('sha256');
  const inputOwner = runtime.getSystem('input');
  let reached = false, lastRequest = -60;
  const refusals = [];
  bus.on('jump:chargeAbort', event => { if (refusals.length < 12) refusals.push({ tick: state.tick, reason: event.reason }); });
  for (let tick = 0; tick < ticks; tick++) {
    const player = state.entities.get(state.playerId);
    if (!player?.alive) break;
    const inCeres = state.world.currentSectorId === 'sector_ceres_belt';
    const target = inCeres ? arrival : gate;
    const dx = target.x - player.pos.x, dz = target.z - player.pos.z;
    const distance = Math.hypot(dx, dz);
    const error = Math.atan2(Math.sin(Math.atan2(dz, dx) - player.rot), Math.cos(Math.atan2(dz, dx) - player.rot));
    // Feed held keyboard transitions into the real input owner. Writing derived axes before
    // production input.update would simply be overwritten and would measure a parked ship.
    const keys = { KeyW: Math.abs(error) < 0.12 && distance > 100,
      ArrowLeft: error < -0.12, ArrowRight: error > 0.12, Digit0: distance < 180 };
    for (const [code, pressed] of Object.entries(keys)) inputOwner._keys = transitionFlightKeyState(state, inputOwner._keys, { code, pressed, blocked: false });
    hash.update(JSON.stringify(keys));
    if (inCeres && distance < 180) reached = true;
    if (!inCeres && distance < 150 && state.jump.state === 'IDLE' && tick - lastRequest >= 60) {
      lastRequest = tick;
      bus.emit('world:requestJump', { targetSectorId: 'sector_ceres_belt', via: 'gate' });
    }
    observer.sample(target);
    runtime.runTicks(1, 1 / 60);
    if (tick % 600 === 0) console.log(`flight-plane tick=${tick} sector=${state.world.currentSectorId} distance=${distance.toFixed(1)} heading=${player.rot.toFixed(2)} error=${error.toFixed(2)}`);
    if (reached) break;
  }
  report = observer.finish({ reached, seed, ticks, inputHash: hash.digest('hex') });
  report.finalSector = state.world.currentSectorId;
  report.finalPosition = { ...state.entities.get(state.playerId)?.pos };
  report.jumpRefusals = refusals;
} finally { runtime.dispose(); }
const out = path.resolve(arg('out') || '.devshots/clean-flight-plane/current.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
const baseline = arg('baseline');
const comparison = baseline ? compareFlightPlane(JSON.parse(fs.readFileSync(baseline, 'utf8')), report) : null;
console.log(JSON.stringify({ out, report, comparison }, null, 2));
if (!report.reached || comparison?.ok === false) process.exitCode = 1;
