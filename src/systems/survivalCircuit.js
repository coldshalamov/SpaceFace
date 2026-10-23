// Boss-circuit helpers (PQ-133.10b).
// Five consecutive authored bosses, compressed refits, no drafts.
//
// SWARM-08 B5 — this file ALSO owns the finite four-stage Circuit journey. The older Boss
// Circuit ruleset (`boss_circuit`) stays exactly as it was; the journey is a MODE of an ordinary
// Swarm run (`run.ruleset === 'swarm'`) whose bounded state rides `run.telemetry.circuit`. Keep
// that state strictly bounded and normalized: absent means ordinary Swarm, malformed fails closed.

import {
  SURVIVAL_BOSS_CIRCUIT,
  SURVIVAL_BOSS_CIRCUIT_LENGTH,
  SURVIVAL_LIVE_CIRCUIT_ARENAS,
} from '../data/survivalWaves.js';
import { COMBAT_LAB_ARENAS } from '../data/combatLabSetups.js';
import { SWARM_BOSS_ROTATION } from '../data/swarmMode.js';
import { promotedPilotIdentity } from '../data/pilotCallsigns.js';

export { SURVIVAL_BOSS_CIRCUIT, SURVIVAL_BOSS_CIRCUIT_LENGTH, SURVIVAL_LIVE_CIRCUIT_ARENAS };

export function isBossCircuitRuleset(ruleset) {
  return ruleset === 'boss_circuit';
}

export function circuitStepForWave(wave) {
  if (!Number.isInteger(wave) || wave < 1 || wave > SURVIVAL_BOSS_CIRCUIT_LENGTH) return null;
  return SURVIVAL_BOSS_CIRCUIT[wave - 1];
}

// ---------------------------------------------------------------------------
// SWARM-08 B5 — the finite journey.
// ---------------------------------------------------------------------------

export const CIRCUIT_VERSION = 1;
export const CIRCUIT_STAGE_COUNT = 4;
export const CIRCUIT_ROUNDS_PER_STAGE = 4;
export const CIRCUIT_TOTAL_ROUNDS = CIRCUIT_STAGE_COUNT * CIRCUIT_ROUNDS_PER_STAGE;
export const CIRCUIT_SURVIVE_TICKS = 3600;
export const CIRCUIT_NODE_COUNT = 3;
export const CIRCUIT_CORE_COUNT = 4;
export const CIRCUIT_HOLD_TICKS = 600;
export const CIRCUIT_REACH_TICKS = 180;
// Offsets from the arena the player is fighting in. The fight view keeps about 760 units.
// The ship starts outside both spots, and both stay inside that view.
export const CIRCUIT_HOLD_ZONE = Object.freeze({ x: 280, z: 160, radius: 140 });
export const CIRCUIT_REACH_GATE = Object.freeze({ x: 620, z: 0, radius: 120 });
export const CIRCUIT_COMMANDER_NAME = promotedPilotIdentity(4242, 'circuit-commander').name;

/** Cohort slots that are a different contract. Local 2 stays survive. The last round stays the champion. */
const CIRCUIT_SPECIAL_KIND = Object.freeze({
  '2:1': 'nodes',
  '2:3': 'hold',
  '3:1': 'collect',
  '3:3': 'commander',
  '4:1': 'reach',
});

/** The room the live run relocated the player into, or the origin when the arena is unknown. */
export function circuitArenaSpawn(arenaId) {
  const arena = COMBAT_LAB_ARENAS.find((row) => row && row.id === arenaId);
  const spawn = arena && arena.spawnPos;
  if (spawn && Number.isFinite(spawn.x) && Number.isFinite(spawn.z)) return { x: spawn.x, z: spawn.z };
  return { x: 0, z: 0 };
}

function circuitSpot(arenaId, offset) {
  const room = circuitArenaSpawn(arenaId);
  return { x: room.x + offset.x, z: room.z + offset.z, radius: offset.radius };
}

export function circuitFightScale(fight) {
  if (fight === 'elite') return { pressureMul: 1.25, earnMul: 1.35 };
  if (fight === 'challenge') return { pressureMul: 1.5, earnMul: 1.6 };
  return { pressureMul: 1, earnMul: 1 };
}

/** Authored champion per stage, as SWARM_BOSS_ROTATION ids. */
export const CIRCUIT_BOSS_SEQUENCE = Object.freeze([
  'mirrorjaw_foreman',
  'forge_regent',
  'brood_queen',
  'brood_tendril',
]);

/**
 * Authored destination pairs. These are existing arena-law rooms (swarmArena installs their
 * physical law through its registered slot); the Circuit never invents a room. Keyed by the
 * stage being entered — stage one uses the arena the run launched in.
 */
export const CIRCUIT_DESTINATIONS = Object.freeze({
  2: Object.freeze([
    Object.freeze({
      arenaId: 'lagrange_crucible',
      nodeId: 'lagrange_crucible',
      label: 'Lagrange Crucible',
      line: 'Wells pull the whole room. Weight your passes.',
    }),
    Object.freeze({
      arenaId: 'cinder_sluice',
      nodeId: 'cinder_sluice',
      label: 'Cinder Sluice',
      line: 'A current rakes one lane. Cross it, do not fight it.',
    }),
  ]),
  3: Object.freeze([
    Object.freeze({
      arenaId: 'cryo_drift',
      nodeId: 'cryo_drift',
      label: 'Cryo Drift',
      line: 'Thermal islands in a cold drift. Break the props to hold the field.',
    }),
    Object.freeze({
      arenaId: 'storm_lattice',
      nodeId: 'storm_lattice',
      label: 'Storm Lattice',
      line: 'Pylons conduct between each other. Break the lattice or stay off it.',
    }),
  ]),
  4: Object.freeze([
    Object.freeze({
      arenaId: 'asteroid_mill',
      nodeId: 'asteroid_mill',
      label: 'Asteroid Mill',
      line: 'The densest rock band in the catalog. Throw everything.',
    }),
    Object.freeze({
      arenaId: 'the_hive',
      nodeId: 'the_hive',
      label: 'The Hive',
      line: 'The room is alive. Its walls are the only cover you get.',
    }),
  ]),
});

const CIRCUIT_ARENA_LINE = (() => {
  const map = new Map();
  for (const stage of Object.keys(CIRCUIT_DESTINATIONS)) {
    for (const dest of CIRCUIT_DESTINATIONS[stage]) {
      map.set(dest.arenaId, dest);
    }
  }
  return map;
})();

const ARENA_LABELS = new Map();
for (const stage of Object.keys(CIRCUIT_DESTINATIONS)) {
  for (const dest of CIRCUIT_DESTINATIONS[stage]) ARENA_LABELS.set(dest.arenaId, dest.label);
}

/** Label for any arena id seen in a route that is not an authored destination (stage one). */
export function circuitArenaLabel(arenaId) {
  if (typeof arenaId !== 'string' || arenaId.length === 0) return 'Arena';
  if (ARENA_LABELS.has(arenaId)) return ARENA_LABELS.get(arenaId);
  return arenaId.replace(/_/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase());
}

/** The authored destination line, or a plain fallback for the launch arena. */
export function circuitArenaLine(arenaId) {
  const dest = CIRCUIT_ARENA_LINE.get(arenaId);
  return dest ? dest.line : null;
}

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

const CIRCUIT_STATUSES = new Set(['running', 'route', 'finale', 'overtime', 'completed']);
const CIRCUIT_ARENA_IDS = new Set(COMBAT_LAB_ARENAS.map((arena) => arena.id));

/** Bounded rules identity; shared by telemetry validation and idempotent record stamping. */
export function circuitRecordIdentity(raw) {
  if (!isPlainObject(raw) || raw.version !== CIRCUIT_VERSION
    || !CIRCUIT_ARENA_IDS.has(raw.startArenaId)
    || !Array.isArray(raw.route) || raw.route.length < 1 || raw.route.length > CIRCUIT_STAGE_COUNT) return null;
  const route = [];
  for (const [index, entry] of raw.route.entries()) {
    const stage = index + 1;
    if (!isPlainObject(entry) || entry.stage !== stage) return null;
    if (stage === 1) {
      if (entry.arenaId !== raw.startArenaId || entry.nodeId !== raw.startArenaId) return null;
    } else if (!CIRCUIT_DESTINATIONS[stage].some(dest =>
      dest.arenaId === entry.arenaId && dest.nodeId === entry.nodeId)) return null;
    const row = { stage, arenaId: entry.arenaId, nodeId: entry.nodeId };
    if (entry.fight === 'elite' || entry.fight === 'challenge') row.fight = entry.fight;
    route.push(row);
  }
  return { version: CIRCUIT_VERSION, startArenaId: raw.startArenaId, route };
}

/**
 * Normalize a raw telemetry circuit object to the bounded schema, or null when it is not a
 * usable Circuit. A partially-written object fails closed rather than manufacturing progress.
 */
export function normalizeCircuitState(raw) {
  const identity = circuitRecordIdentity(raw);
  if (!identity || !CIRCUIT_STATUSES.has(raw.status)) return null;
  const { route } = identity;
  const clearedStages = raw.clearedStages;
  if (!Number.isInteger(clearedStages) || clearedStages < 0 || clearedStages > CIRCUIT_STAGE_COUNT) return null;
  if (raw.revision != null && (!Number.isSafeInteger(raw.revision) || raw.revision < 1)) return null;
  const status = raw.status;
  if (status === 'running' || status === 'route') {
    if (raw.wonAtWave != null) return null;
    if (status === 'running' && (clearedStages >= CIRCUIT_STAGE_COUNT || route.length !== clearedStages + 1)) return null;
    if (status === 'route' && (clearedStages < 1 || clearedStages >= CIRCUIT_STAGE_COUNT || route.length !== clearedStages)) return null;
  } else if (clearedStages !== CIRCUIT_STAGE_COUNT || route.length !== CIRCUIT_STAGE_COUNT
    || raw.wonAtWave !== CIRCUIT_TOTAL_ROUNDS) return null;
  return {
    ...identity,
    clearedStages,
    revision: raw.revision ?? 1,
    status,
    wonAtWave: raw.wonAtWave ?? null,
  };
}

/** The normalized Circuit state carried by a run, or null for ordinary Swarm. */
export function circuitFor(run) {
  if (!run || !isPlainObject(run.telemetry)) return null;
  return normalizeCircuitState(run.telemetry.circuit);
}

/** Absent telemetry is ordinary Swarm; present but invalid telemetry must refuse progression. */
export function circuitStateError(run) {
  return run?.telemetry?.circuit != null && !circuitFor(run)
    ? 'Circuit data is invalid. Start a new run to continue.' : null;
}

/** Build the fresh Circuit state a Start Circuit choice commits. */
export function createCircuitState(startArenaId, nodeId) {
  const arena = typeof startArenaId === 'string' && startArenaId ? startArenaId : 'helios_core';
  return {
    version: CIRCUIT_VERSION,
    startArenaId: arena,
    route: [{ stage: 1, arenaId: arena, nodeId: nodeId || arena }],
    clearedStages: 0,
    revision: 1,
    status: 'running',
    wonAtWave: null,
  };
}

/**
 * The descriptor for a Circuit round, or null when `wave` is past the Circuit (overtime, done,
 * or not a Circuit at all). Pure.
 */
export function circuitRoundFor(run, wave) {
  const circuit = circuitFor(run);
  if (!circuit) return null;
  if (circuit.status === 'completed') return null;
  if (circuit.status === 'overtime') return null;
  if (!Number.isInteger(wave) || wave < 1 || wave > CIRCUIT_TOTAL_ROUNDS) return null;
  const stage = Math.floor((wave - 1) / CIRCUIT_ROUNDS_PER_STAGE) + 1;
  const localRound = ((wave - 1) % CIRCUIT_ROUNDS_PER_STAGE) + 1;
  let kind = 'cohort';
  if (localRound === 2) kind = 'survive';
  else if (localRound === CIRCUIT_ROUNDS_PER_STAGE) kind = 'boss';
  else if (CIRCUIT_SPECIAL_KIND[`${stage}:${localRound}`]) kind = CIRCUIT_SPECIAL_KIND[`${stage}:${localRound}`];
  const bossId = kind === 'boss' ? (CIRCUIT_BOSS_SEQUENCE[stage - 1] || null) : null;
  const routeEntry = (circuit.route || []).find((entry) => entry && entry.stage === stage) || null;
  const fight = routeEntry && (routeEntry.fight === 'elite' || routeEntry.fight === 'challenge')
    ? routeEntry.fight : null;
  const scale = circuitFightScale(fight);
  return {
    stage,
    localRound,
    kind,
    bossId,
    surviveTicks: kind === 'survive' ? CIRCUIT_SURVIVE_TICKS : null,
    fight,
    pressureMul: scale.pressureMul,
    earnMul: scale.earnMul,
    commanderName: kind === 'commander' ? CIRCUIT_COMMANDER_NAME : null,
    nodeCount: kind === 'nodes' ? CIRCUIT_NODE_COUNT : null,
    coreCount: kind === 'collect' ? CIRCUIT_CORE_COUNT : null,
    holdTicks: kind === 'hold' ? CIRCUIT_HOLD_TICKS : null,
    reachTicks: kind === 'reach' ? CIRCUIT_REACH_TICKS : null,
    zone: kind === 'hold' ? circuitSpot(run && run.arenaId, CIRCUIT_HOLD_ZONE) : null,
    gate: kind === 'reach' ? circuitSpot(run && run.arenaId, CIRCUIT_REACH_GATE) : null,
  };
}

/** The authored champion row for a Circuit boss id, or null. */
export function circuitBossFor(bossId) {
  if (typeof bossId !== 'string') return null;
  return SWARM_BOSS_ROTATION.find((boss) => boss && boss.id === bossId) || null;
}

/** Reserved choice-id shapes carried over the existing draft-pick intent. */
export function circuitChoiceId(kind, { arenaId = null, wave = 0, revision = 1, fight = null } = {}) {
  const rev = Number.isInteger(revision) && revision > 0 ? revision : 1;
  const w = Number.isInteger(wave) ? wave : 0;
  if (kind === 'start') return `circuit_start_w${w}_r${rev}`;
  if (kind === 'finish') return `circuit_finish_w${w}_r${rev}`;
  if (kind === 'overtime') return `circuit_overtime_w${w}_r${rev}`;
  if (kind === 'route' && typeof arenaId === 'string' && arenaId) {
    const suffix = fight === 'elite' || fight === 'challenge' ? `_${fight}` : '';
    return `circuit_route_${arenaId}${suffix}_w${w}_r${rev}`;
  }
  return null;
}

/** Parse a reserved Circuit choice id, or null when it is an ordinary offer id. */
export function parseCircuitChoiceId(id) {
  if (typeof id !== 'string' || !id.startsWith('circuit_')) return null;
  const route = /^circuit_route_(.+?)(?:_(elite|challenge))?_w(\d+)_r(\d+)$/.exec(id);
  if (route) {
    return {
      kind: 'route',
      arenaId: route[1],
      fight: route[2] || null,
      wave: Number(route[3]),
      revision: Number(route[4]),
    };
  }
  const simple = /^circuit_(start|finish|overtime)_w(\d+)_r(\d+)$/.exec(id);
  if (simple) {
    return { kind: simple[1], arenaId: null, wave: Number(simple[2]), revision: Number(simple[3]) };
  }
  return null;
}

/**
 * The choices offered right now, as bounded descriptors. Empty for ordinary Swarm and for a
 * Circuit mid-stage. Each descriptor carries the reserved id the UI sends back verbatim.
 */
export function circuitChoicesFor(run) {
  if (circuitStateError(run)) return [];
  const circuit = circuitFor(run);
  const wave = Number.isInteger(run && run.wave) ? run.wave : 0;
  if (!circuit) {
    // SWARM-08 B5 — entry is offered in the ordinary opening armory, before any Circuit state
    // exists. The descriptor's revision is 1; accepting it stamps revision 2, so a replay of
    // this exact id is stale.
    if (!run || run.ruleset !== 'swarm' || run.phase !== 'draft' || wave !== 0) return [];
    const arenaId = typeof run.arenaId === 'string' && run.arenaId ? run.arenaId : 'helios_core';
    return [{
      id: circuitChoiceId('start', { wave, revision: 1 }),
      kind: 'start',
      stage: 1,
      arenaId,
      label: 'Start Circuit · four stages',
      line: 'Sixteen rounds, four stages, four champions. Finish or continue into Overtime.',
      wave,
      revision: 1,
    }];
  }
  const revision = circuit.revision;
  if (circuit.status === 'route') {
    const nextStage = circuit.clearedStages + 1;
    const destinations = CIRCUIT_DESTINATIONS[nextStage] || [];
    return destinations.flatMap((dest) => {
      const ordinary = {
        id: circuitChoiceId('route', { arenaId: dest.arenaId, wave, revision }),
        kind: 'route',
        stage: nextStage,
        arenaId: dest.arenaId,
        nodeId: dest.nodeId,
        fight: null,
        label: dest.label,
        line: dest.line,
        wave,
        revision,
      };
      return [ordinary, ...['elite', 'challenge'].map((fight) => {
        const scale = circuitFightScale(fight);
        const word = fight === 'elite' ? 'Elite' : 'Challenge';
        return {
          ...ordinary,
          id: circuitChoiceId('route', { arenaId: dest.arenaId, wave, revision, fight }),
          fight,
          label: `${word} · ${dest.label}`,
          line: `${dest.line} Pressure ×${scale.pressureMul}, purse ×${scale.earnMul}. The ordinary room is still a choice.`,
        };
      })];
    });
  }
  if (circuit.status === 'finale') {
    return [
      {
        id: circuitChoiceId('finish', { wave, revision }),
        kind: 'finish',
        stage: CIRCUIT_STAGE_COUNT,
        arenaId: null,
        label: 'Finish Circuit',
        line: 'Bank the run. The Circuit is complete.',
        wave,
        revision,
      },
      {
        id: circuitChoiceId('overtime', { wave, revision }),
        kind: 'overtime',
        stage: CIRCUIT_STAGE_COUNT,
        arenaId: null,
        label: 'Enter Overtime',
        line: 'Keep the build and purse, and fly on into endless Swarm.',
        wave,
        revision,
      },
    ];
  }
  return [];
}

/**
 * The route as four stage positions with completed/current/future state, plus the finale and
 * overtime flags. Null for ordinary Swarm. Pure.
 */
export function circuitRouteView(run) {
  const circuit = circuitFor(run);
  if (!circuit) return null;
  const currentStage = Math.min(CIRCUIT_STAGE_COUNT, circuit.clearedStages + 1);
  const stages = [];
  for (let stage = 1; stage <= CIRCUIT_STAGE_COUNT; stage++) {
    const entry = circuit.route.find((row) => row.stage === stage) || null;
    const arenaId = entry ? entry.arenaId : (stage === 1 ? circuit.startArenaId : null);
    let status = 'future';
    if (stage <= circuit.clearedStages) status = 'complete';
    else if (stage === currentStage) status = 'current';
    else if (circuit.status === 'finale' || circuit.status === 'overtime' || circuit.status === 'completed') status = 'complete';
    const bossId = CIRCUIT_BOSS_SEQUENCE[stage - 1] || null;
    const boss = circuitBossFor(bossId);
    stages.push({
      stage,
      arenaId,
      label: arenaId ? circuitArenaLabel(arenaId) : '—',
      line: arenaId ? circuitArenaLine(arenaId) : null,
      status: status === 'complete' && stage > circuit.clearedStages ? 'complete' : status,
      boss: boss ? { id: boss.id, label: boss.label, line: boss.line } : null,
    });
  }
  return {
    version: circuit.version,
    status: circuit.status,
    clearedStages: circuit.clearedStages,
    wonAtWave: circuit.wonAtWave,
    overtime: circuit.status === 'overtime',
    complete: circuit.status === 'completed',
    stages,
  };
}

/**
 * Why a run may NOT enter the Circuit, as a player-facing sentence, or null when it may. Pure.
 * `queuedChallenge` is supplied by the run owner (a trial/daily challenge rewrote this run).
 */
export function circuitEntryBlocker(run, { queuedChallenge = false } = {}) {
  if (!run || typeof run !== 'object') return 'No run to enter the Circuit.';
  if (run.practice === true) return 'Practice runs cannot enter the Circuit.';
  if (queuedChallenge) return 'A queued challenge cannot enter the Circuit.';
  const telemetry = isPlainObject(run.telemetry) ? run.telemetry : {};
  if (Number.isInteger(telemetry.startWave) && telemetry.startWave > 1) {
    return 'A checkpoint start cannot enter the Circuit.';
  }
  if (Array.isArray(run.arenaMutators) && run.arenaMutators.length > 0) {
    return 'A mutator is active — the Circuit runs plain.';
  }
  if (Array.isArray(telemetry.threats) && telemetry.threats.length > 0) {
    return 'Threat wagers cannot ride the Circuit.';
  }
  return null;
}

/** The bounded summary a settled result carries. Null when the run was not a Circuit. */
export function circuitSummaryFor(run) {
  const circuit = circuitFor(run);
  if (!circuit) return null;
  return {
    version: circuit.version,
    startArenaId: circuit.startArenaId,
    route: circuit.route.map((row) => ({ stage: row.stage, arenaId: row.arenaId, nodeId: row.nodeId })),
    clearedStages: circuit.clearedStages,
    status: circuit.status,
    wonAtWave: circuit.wonAtWave,
  };
}
