// Temporary physical race packs, owned by missions. No save authority or reward writer.
import { makeShipEntitySpec, fittingsFromDefaultModules } from '../systems/ships.js';
import { raceGateGlobals } from '../data/raceLevels.js';
import { advanceCircuit, circuitProgress } from '../systems/racingGeometry.js';
import { isRacingCorridorSession } from '../world/racingCorridor.js';
import { queryNearbyEntities } from '../core/spatialQuery.js';
import { RACING_PERSONALITIES, createRacingDriver, racingDriverIntent } from '../ai/racingDriver.js';
import { stepRacingDraft } from './racingDraft.js';

const compareId = (a, b) => String(a).localeCompare(String(b), 'en');
export function racingOpponentGrid(params, index) {
  const gates = raceGateGlobals(params), a = gates[0], b = gates[1];
  if (!a || !b) return null;
  const length = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  const nx = (b.x - a.x) / length, nz = (b.z - a.z) / length;
  const back = [165, 210, 65][index], lateral = [-52, 52, 0][index];
  return { x: a.x - nx * back - nz * lateral, z: a.z - nz * back + nx * lateral, heading: Math.atan2(nz, nx) };
}

export function rankRacingEntrants(rows) {
  return [...rows].sort((a, b) => {
    if (a.status === 'finished' || b.status === 'finished') {
      if (a.status !== b.status) return a.status === 'finished' ? -1 : 1;
      return a.elapsedS - b.elapsedS || compareId(a.id, b.id);
    }
    if (a.status === 'dnf' || b.status === 'dnf') {
      if (a.status !== b.status) return a.status === 'dnf' ? 1 : -1;
    }
    return b.progress - a.progress || compareId(a.id, b.id);
  }).map((row, index) => ({ ...row, position: index + 1 }));
}

export function createRacingOpponents({ state, bus, helpers }) {
  let heat = null;
  const nearby = [];
  const eligible = mission => mission?.type === 'race' && mission.status === 'active'
    && mission.params?.racingContractId && !mission.params.adventureSpeedId
    && ['race', 'cup'].includes(mission.params.raceMode) && isRacingCorridorSession(state);
  const entityFor = row => state.entities?.get(row.entityId);
  function snapshot(mission, playerElapsedS = null) {
    if (!heat || heat.missionId !== mission.id) return [];
    const player = state.entities?.get(state.playerId);
    const rows = heat.rivals.map(row => ({ id: row.id, name: row.name, entityId: row.entityId,
      hullId: row.hullId, style: row.style, status: row.status, elapsedS: row.elapsedS,
      lap: row.params.lap | 0, nextGate: row.params.nextGate | 0, recoveries: row.driver.recoveries,
      progress: row.status === 'finished' ? 1 : circuitProgress(row.params, entityFor(row)?.pos, heat.gates).fraction }));
    rows.push({ id: 'player', name: 'You', entityId: state.playerId, player: true,
      status: playerElapsedS == null ? 'racing' : 'finished', elapsedS: playerElapsedS,
      lap: mission.params.lap | 0, nextGate: mission.params.nextGate | 0,
      progress: playerElapsedS == null ? circuitProgress(mission.params, player?.pos, heat.gates).fraction : 1 });
    const ranked = rankRacingEntrants(rows);
    mission.params.raceStandings = ranked;
    mission.params.raceEntrants = ranked.length;
    mission.params.racePosition = ranked.find(row => row.player).position;
    return ranked;
  }
  function stop(reason = 'race_closed') {
    if (!heat) return false;
    for (const row of heat.rivals) {
      const entity = entityFor(row);
      if (entity?.data?.raceOpponent?.missionId === heat.missionId) helpers.removeEntity?.(entity.id, { immediate: true, reason });
    }
    heat = null;
    return true;
  }
  function start(mission) {
    const p = mission.params, gates = raceGateGlobals(p);
    if (gates.length < 2 || !helpers.spawnEntity) return false;
    stop('race_replaced');
    heat = { missionId: mission.id, sectorId: p.courseSectorId, gates, rivals: [], draftEntrants: [],
      nextStandingS: -Infinity, lastTime: Number(state.simTime) || 0 };
    const count = Math.max(1, Math.min(3, Math.round(Number(p.raceOpponents) || 2)));
    const rosterOffset = p.courseId === 'circuit_tethys_tally' ? 1 : p.courseId === 'circuit_veil_wash' ? 2 : 0;
    for (let i = 0; i < count; i++) {
      const personality = RACING_PERSONALITIES[(i + rosterOffset) % RACING_PERSONALITIES.length], pose = racingOpponentGrid(p, i);
      const spec = makeShipEntitySpec(personality.hullId, { team: 2,
        pos: { x: pose.x, z: pose.z }, rot: pose.heading,
        fittings: fittingsFromDefaultModules(personality.hullId, ['mod_engine_ion_m']),
        ai: { passive: true, roe: 'hold_fire' } });
      spec.flags = { ...spec.flags, missionPinned: true };
      Object.assign(spec.data, { name: personality.name, scanLabel: `${personality.name} · ${personality.style}`,
        raceOpponent: { missionId: mission.id, id: personality.id }, missionTag: mission.id, tetherable: false });
      const entity = helpers.spawnEntity(spec);
      if (!entity) continue;
      heat.rivals.push({ id: personality.id, entityId: entity.id, hullId: personality.hullId,
        name: personality.name, style: personality.style, status: 'racing', elapsedS: null,
        driver: createRacingDriver(personality, p.raceDifficulty),
        params: { nextGate: 0, lap: 0, laps: p.laps, closedCircuit: p.closedCircuit, gateRadiusWU: p.gateRadiusWU },
        previous: { ...entity.pos }, previousTime: heat.lastTime });
    }
    return true;
  }
  function update(mission) {
    if (!eligible(mission)) { if (heat?.missionId === mission?.id) stop('ineligible'); return []; }
    if (!heat || heat.missionId !== mission.id) if (!start(mission)) return [];
    const p = mission.params, now = Number(state.simTime) || 0;
    const dt = Math.max(0, Math.min(0.1, now - heat.lastTime));
    heat.lastTime = now;
    const startS = Number.isFinite(p.raceStartSimS) ? p.raceStartSimS : p.gridUntilSimS;
    const held = !Number.isFinite(startS) || now < startS;
    let terminalChanged = false;
    for (const row of heat.rivals) {
      const entity = entityFor(row);
      if (!entity || entity.alive === false) { if (row.status === 'racing') { row.status = 'dnf'; terminalChanged = true; } continue; }
      if (row.status === 'racing' && !held) {
        row.params.raceStartSimS = startS;
        const events = advanceCircuit(row.params, { prev: row.previous, pos: entity.pos, vel: entity.vel,
          gates: heat.gates, previousTime: row.previousTime, now });
        const finish = events.find(event => event.finished);
        if (finish) { row.status = 'finished'; row.elapsedS = finish.elapsedS; terminalChanged = true;
          bus?.emit?.('race:rivalFinished', { missionId: mission.id, rivalId: row.id, name: row.name, elapsedS: row.elapsedS }); }
        else if (now - startS > Math.max(240, (Number(p.courseLengthWU) || 5000) * Math.max(1, p.laps || 1) / 24)) {
          row.status = 'dnf'; terminalChanged = true;
        }
      }
      row.previous.x = entity.pos.x; row.previous.z = entity.pos.z; row.previousTime = now;
      entity.data.intent = racingDriverIntent(row.driver, { entity, params: row.params, gates: heat.gates,
        nearby: queryNearbyEntities(state, entity.pos, 350, nearby), dt,
        held: held || row.status !== 'racing' });
    }
    // Reuse the bounded entrant records; both player and opponents obey the same wake rule.
    const count = heat.rivals.length + 1;
    for (let i = 0; i < count; i++) {
      const entry = heat.draftEntrants[i] ||= {};
      entry.entity = i ? entityFor(heat.rivals[i - 1]) : state.entities.get(state.playerId);
      entry.status = i ? heat.rivals[i - 1].status : 'racing';
    }
    heat.draftEntrants.length = count;
    stepRacingDraft(state, mission, heat.draftEntrants, dt);
    // HUD standings need 10 Hz; gates, steering and physics still run at 60 Hz.
    if (terminalChanged || now >= heat.nextStandingS) {
      heat.nextStandingS = now + 0.1;
      return snapshot(mission);
    }
    return p.raceStandings || [];
  }
  return {
    update,
    finish(mission, playerElapsedS) { return snapshot(mission, Math.max(0, Number(playerElapsedS) || 0)); },
    stop,
    reconcile(active = state.missions?.active || []) {
      if (!heat) return;
      const mission = active.find(row => row.id === heat.missionId);
      const player = state.entities?.get(state.playerId);
      if (!eligible(mission) || !player || player.alive === false || state.mode === 'menu'
        || state.world?.currentSectorId !== heat.sectorId) stop('race_left_course');
    },
    inspect() { return heat ? { missionId: heat.missionId, rivals: heat.rivals.map(row => ({
      id: row.id, entityId: row.entityId, status: row.status, elapsedS: row.elapsedS,
      nextGate: row.params.nextGate, lap: row.params.lap, recoveries: row.driver.recoveries })) } : null; },
  };
}
