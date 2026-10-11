import { racingSetPieceDefinitions } from '../data/racingSetPieces.js';
import { raceGateGlobals } from '../data/raceLevels.js';
import { asteroidColliderRadius } from '../data/asteroidColliders.js';
import { asteroidMass } from '../data/sectorPhysical.js';
import { ASTEROIDS, deriveAsteroidSeams } from '../data/mining.js';
import { makeShipEntitySpec, fittingsFromDefaultModules } from '../systems/ships.js';
import { createRacingDriver, racingDriverIntent } from '../ai/racingDriver.js';
import { queuePhysicsImpulse, writePhysicsControl } from '../core/physicsAuthority.js';
import { queryNearbyEntities } from '../core/spatialQuery.js';
import { isRacingCorridorSession } from '../world/racingCorridor.js';
import { segmentDistanceSquared } from '../world/arranger.js';

const ROCK = ASTEROIDS.find(row => row.id === 'ast_common_rock');
const anchorRadius = 24;
const rockSize = 8;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

function lateralPoint(frame, lateral) {
  return { x: frame.x - frame.nz * lateral, z: frame.z + frame.nx * lateral };
}

function shutterSpec(frame, def, sectorId) {
  const radius = def.radiusWU, mass = def.mass;
  return { type: 'payload', pos: lateralPoint(frame, def.openLateralWU),
    rot: Math.atan2(frame.nx, -frame.nz), radius, mass, hull: 1600, hullMax: 1600,
    collides: true, flags: { missionPinned: true },
    physicsBody: { dynamic: true, radius, mass, inertiaY: 0.5 * mass * radius * radius,
      ccd: true, material: 'payload' },
    // The canonical typeId takes the released container's measured skin. Its
    // authored payload renderer fits that same centered model to 2 * radius.
    data: { typeId: 'pod_cargo_container', authoredPayloadAssetId: 'pod_cargo_container',
      name: def.name, scanLabel: `${def.name} · left service cut always open`, homeSectorId: sectorId } };
}

function driveShutter(entity, frame, def, closed) {
  const target = lateralPoint(frame, closed ? def.closedLateralWU : def.openLateralWU);
  let vx = (target.x - entity.pos.x) * 0.8, vz = (target.z - entity.pos.z) * 0.8;
  const speed = Math.hypot(vx, vz);
  if (speed > def.maxSpeedWU) { vx *= def.maxSpeedWU / speed; vz *= def.maxSpeedWU / speed; }
  let ax = (vx - (entity.vel?.x || 0)) * 3, az = (vz - (entity.vel?.z || 0)) * 3;
  const accel = Math.hypot(ax, az);
  if (accel > def.maxAccelWU) { ax *= def.maxAccelWU / accel; az *= def.maxAccelWU / accel; }
  const error = Math.atan2(frame.nx, -frame.nz) - (entity.rot || 0);
  const angularAccel = clamp(Math.atan2(Math.sin(error), Math.cos(error)) * 3 - (entity.angVel || 0) * 3, -0.8, 0.8);
  writePhysicsControl(entity, { source: 'race-customs-shutter', mode: 'actuator',
    force: { x: ax * def.mass, z: az * def.mass }, torque: { y: angularAccel * entity.physicsBody.inertiaY } });
  return Math.hypot(target.x - entity.pos.x, target.z - entity.pos.z);
}

function frameFor(gates, definition) {
  const a = gates[definition.legIndex], b = gates[definition.legIndex + 1];
  if (!a || !b) return null;
  const length = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  const nx = (b.x - a.x) / length, nz = (b.z - a.z) / length;
  const point = { x: a.x + (b.x - a.x) * definition.fraction, z: a.z + (b.z - a.z) * definition.fraction };
  return { ...point, nx, nz, waitPos: { x: point.x - nx * definition.waitBackWU, z: point.z - nz * definition.waitBackWU } };
}

function rockSpec(pos, size, sectorId, name, anchor, seed) {
  const hp = anchor ? ROCK.hp[1] : ROCK.hp[0];
  return { type: 'asteroid', pos, radius: size, mass: asteroidMass(sectorId, size),
    hull: hp, hullMax: hp, collides: true,
    physicsBody: { dynamic: !anchor, radius: asteroidColliderRadius(ROCK.id, size) },
    flags: { missionPinned: true },
    data: { typeId: ROCK.id, tier: ROCK.tierCap, tierCap: ROCK.tierCap, size,
      oreHP: hp, oreHPMax: hp, yieldU: ROCK.yieldU[0], pctEjected: 0,
      name, scanLabel: name, homeSectorId: sectorId, masslineTetherable: true,
      seams: deriveAsteroidSeams(seed, name, size) } };
}

function anchorPosition(state, gates, row, aperture, existing) {
  const gate = gates[row.gateIndex], before = gates[row.gateIndex - 1], after = gates[row.gateIndex + 1];
  if (!gate || !before || !after) return null;
  const inLength = Math.hypot(before.x - gate.x, before.z - gate.z) || 1;
  const outLength = Math.hypot(after.x - gate.x, after.z - gate.z) || 1;
  const heading = Math.atan2((before.z - gate.z) / inLength + (after.z - gate.z) / outLength,
    (before.x - gate.x) / inLength + (after.x - gate.x) / outLength);
  const solids = [...state.entityList, ...(state.world?.asteroidField?.rocks || []), ...(state.world?.dressing?.rows || []), ...existing]
    .filter(body => body?.alive !== false && body.collides !== false && body.type !== 'ship' && body.pos);
  const collider = asteroidColliderRadius(ROCK.id, anchorRadius);
  for (const distance of [220, 270, 320, 360]) for (const offset of [0, 0.35, -0.35, 0.7, -0.7, Math.PI]) {
    const pos = { x: gate.x + Math.cos(heading + offset) * distance, z: gate.z + Math.sin(heading + offset) * distance };
    if (gates.slice(1).some((b, i) => segmentDistanceSquared(pos, gates[i], b) < (aperture + 32 + collider) ** 2)) continue;
    if (solids.some(body => Math.hypot(pos.x - body.pos.x, pos.z - body.pos.z)
      < collider + Number(body.physicsBody?.radius || body.radius || 0) + 12)) continue;
    return pos;
  }
  return null;
}

/** Missions calls this after its green-clock setup. Runtime stays out of save params. */
export function createRacingSetPieces({ state, bus, helpers }) {
  let run = null;
  const scratch = [];
  const eligible = mission => mission?.type === 'race' && mission.status === 'active'
    && mission.params?.racingContractId && !mission.params.adventureSpeedId && isRacingCorridorSession(state);
  function spawn(spec, id, kind) {
    Object.assign(spec.data, { missionTag: run.missionId, raceSetPiece: { id, kind, missionId: run.missionId } });
    const entity = helpers.spawnEntity?.(spec);
    if (entity) run.entities.add(entity.id);
    return entity;
  }
  function stop(reason = 'race_closed') {
    if (!run) return false;
    for (const id of run.entities) {
      const entity = state.entities?.get(id);
      if (entity?.data?.raceSetPiece?.missionId === run.missionId) helpers.removeEntity?.(id, { immediate: true, reason });
    }
    run = null;
    return true;
  }
  function start(mission) {
    stop('race_replaced');
    const p = mission.params, defs = racingSetPieceDefinitions(p.courseId), gates = raceGateGlobals(p);
    if (!defs || gates.length < 2) return false;
    run = { missionId: mission.id, sectorId: p.courseSectorId, entities: new Set(), cues: [],
      gates, lastTime: Number(state.simTime) || 0, dynamics: [] };
    const anchors = [];
    for (const row of defs.anchors) {
      const pos = anchorPosition(state, gates, row, Number(p.gateRadiusWU) || 90, anchors);
      if (!pos) continue;
      const entity = spawn(rockSpec(pos, anchorRadius, run.sectorId, row.name, true, state.meta?.seed), row.id, 'anchor');
      if (!entity) continue;
      anchors.push(entity);
      run.cues.push({ id: row.id, kind: 'anchor', name: row.name, label: row.name,
        gateIndex: row.gateIndex, phase: 'ready', pos, entityIds: [entity.id],
        hint: 'Optional Massline apex anchor. The gate corridor stays clear.' });
    }
    for (const [kind, def] of [['crossing', defs.crossing], ['wave', defs.wave], ['shutter', defs.shutter]]) {
      if (!def) continue;
      const frame = frameFor(gates, def);
      if (!frame) continue;
      const cue = { id: def.id, kind, name: def.name, label: def.name, phase: 'scheduled', countdownS: def.startsAtS,
        gateIndex: def.legIndex + 1, pos: { x: frame.x, z: frame.z }, waitPos: frame.waitPos,
        waitRadiusWU: def.waitRadiusWU, entityIds: [],
        hint: kind === 'shutter' ? 'Right lane closes. Keep left through the marked service cut.'
          : kind === 'crossing' ? 'Yield at the refuge marker or pass behind the cargo hull.'
          : 'Three spaced rocks cross the wash. Wait at the refuge marker or choose a gap.' };
      if (kind === 'shutter') Object.assign(cue, { servicePos: lateralPoint(frame, def.serviceLateralWU),
        serviceWidthWU: def.serviceWidthWU, serviceHint: 'LEFT SERVICE CUT · ALWAYS OPEN' });
      run.cues.push(cue); run.dynamics.push({ kind, def, frame, cue, launched: false, spawned: false, announced: false });
    }
    return true;
  }
  function update(mission) {
    if (!eligible(mission)) { if (run?.missionId === mission?.id) stop('ineligible'); return []; }
    if (!run || run.missionId !== mission.id) if (!start(mission)) return [];
    const p = mission.params, now = Number(state.simTime) || 0;
    const startS = Number.isFinite(p.raceStartSimS) ? p.raceStartSimS : p.gridUntilSimS;
    const elapsed = Number.isFinite(startS) ? Math.max(0, now - startS) : 0;
    const dt = Math.max(0, Math.min(0.1, now - run.lastTime)); run.lastTime = now;
    for (const cue of run.cues) if (cue.kind === 'anchor' && cue.phase === 'ready') {
      const entity = state.entities?.get(cue.entityIds[0]);
      if (!entity || entity.alive === false) { cue.phase = 'clear'; cue.entityIds = []; }
      else { cue.pos.x = entity.pos.x; cue.pos.z = entity.pos.z; }
    }
    for (const event of run.dynamics) {
      const { def, frame, cue } = event;
      cue.countdownS = Math.max(0, def.startsAtS - elapsed);
      if (elapsed < def.startsAtS - def.warningS) continue;
      if (!event.announced) {
        event.announced = true; cue.phase = 'warning';
        bus?.emit?.('race:setPieceWarning', { missionId: mission.id, ...cue, warningS: def.warningS });
        bus?.emit?.('toast', { text: `${def.name} in ${def.warningS}s. ${cue.hint}`, kind: 'warn', ttl: 5 });
      }
      if (!event.spawned) {
        event.spawned = true;
        const pos = lateralPoint(frame, def.lateralWU || 0);
        if (event.kind === 'shutter') {
          const entity = spawn(shutterSpec(frame, def, run.sectorId), def.id, event.kind);
          if (entity) cue.entityIds.push(entity.id);
        } else if (event.kind === 'crossing') {
          const spec = makeShipEntitySpec(def.hullId, { team: 2, pos, rot: Math.atan2(-frame.nx, frame.nz),
            fittings: fittingsFromDefaultModules(def.hullId, ['mod_engine_ion_m']), ai: { passive: true, roe: 'hold_fire' } });
          spec.flags = { ...spec.flags, missionPinned: true };
          Object.assign(spec.data, { name: 'Textile Cargo 04', scanLabel: 'Textile Cargo 04 · scheduled crossing' });
          const entity = spawn(spec, def.id, event.kind);
          if (entity) cue.entityIds.push(entity.id);
          const end = { x: frame.x + frame.nz * def.lateralWU, z: frame.z - frame.nx * def.lateralWU };
          event.route = [pos, end]; event.params = { nextGate: 1, lap: 0, gateRadiusWU: 26 };
          event.driver = createRacingDriver({ pace: 0.23, corner: 0.8, lane: 0 }, 'expert');
        } else {
          for (const offset of def.offsetsWU) {
            const piecePos = { x: pos.x + frame.nx * offset, z: pos.z + frame.nz * offset };
            const entity = spawn(rockSpec(piecePos, rockSize, run.sectorId, 'Veil wash fragment', false, state.meta?.seed), def.id, event.kind);
            if (entity) cue.entityIds.push(entity.id);
          }
        }
      }
      if (elapsed >= def.startsAtS && !event.launched) {
        event.launched = true; cue.phase = 'active';
        if (event.kind === 'wave') for (const id of cue.entityIds) {
          const entity = state.entities?.get(id);
          if (entity?.alive !== false && entity) queuePhysicsImpulse(entity,
            { x: frame.nz * def.speedWU * entity.mass, z: -frame.nx * def.speedWU * entity.mass });
        }
      }
      if (event.kind === 'shutter') {
        const entity = state.entities?.get(cue.entityIds[0]);
        if (!entity || entity.alive === false) { cue.phase = 'clear'; continue; }
        const closed = event.launched && elapsed < def.opensAtS;
        const remaining = driveShutter(entity, frame, def, closed);
        if (event.launched) {
          cue.phase = closed ? (remaining < 2 ? 'closed' : 'closing') : (remaining < 2 ? 'clear' : 'opening');
          cue.countdownS = closed ? Math.max(0, def.opensAtS - elapsed) : 0;
        }
      } else if (event.kind === 'crossing') {
        const entity = state.entities?.get(cue.entityIds[0]);
        if (!entity || entity.alive === false) { cue.phase = 'clear'; continue; }
        const end = event.route[1];
        if (event.launched && Math.hypot(entity.pos.x - end.x, entity.pos.z - end.z) < 24) cue.phase = 'clear';
        entity.data.intent = racingDriverIntent(event.driver, { entity, params: event.params, gates: event.route,
          nearby: queryNearbyEntities(state, entity.pos, 180, scratch), dt,
          held: !event.launched || cue.phase === 'clear' });
      } else if (event.launched && elapsed >= def.startsAtS + def.lifetimeS && cue.phase !== 'clear') {
        // The finite wave has passed; its real rocks continue under physics until
        // the heat closes. Never pop a visible or currently tethered body away.
        cue.phase = 'clear';
      }
    }
    // This owner alone updates the small serializable cue records. Share their stable array
    // instead of allocating every cue and ID list on every simulation tick.
    p.raceSetPieces = run.cues;
    return p.raceSetPieces;
  }
  return { update, stop,
    reconcile(active = state.missions?.active || []) {
      if (!run) return;
      const mission = active.find(row => row.id === run.missionId), player = state.entities?.get(state.playerId);
      if (!eligible(mission) || !player || player.alive === false || state.mode === 'menu'
        || state.world?.currentSectorId !== run.sectorId) stop('race_left_course');
    },
    inspect() { return run ? { missionId: run.missionId, entityIds: [...run.entities], cues: run.cues } : null; },
  };
}
