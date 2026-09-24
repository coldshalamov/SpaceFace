/**
 * Portable microbench: liveListSquads retain-when-stable.
 * Before = full rebuild every tick (alloc members + signature strings).
 * After  = membership key match → refresh mutable fields only on retained roster.
 * Quiet Ceres: AI roster membership is stable for long stretches.
 */
import { performance } from 'node:perf_hooks';
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const mode = process.argv[2] || 'all';

const SQUADS = 6;
const MEMBERS_PER = 4;
const ITERS = 30000;
const ROSTER_SIGNATURE_FLAG = '__spacefaceRosterSignature';
const NORMALIZED_ROSTER_FLAG = '__spacefaceNormalizedAIRoster';

function capabilitiesFor(id) {
  return Object.freeze(id % 3 === 0 ? ['ranged', 'screen'] : ['ranged']);
}

function makeEntities() {
  const entities = [];
  for (let s = 0; s < SQUADS; s++) {
    for (let m = 0; m < MEMBERS_PER; m++) {
      const id = s * 100 + m + 1;
      entities.push({
        id,
        team: 2,
        alive: true,
        factionId: `f${s}`,
        pos: { x: id * 1.1, z: -id * 0.7 },
        activity: { simTier: 'S0_EXACT' },
        data: {
          ai: {
            doctrine: s % 2 ? 'aggressive' : 'balanced',
            squadId: `squad_${s}`,
            formation: 'wedge',
            formationSpacing: 72,
            formationBound: 170,
            preferredRole: m === 0 ? 'leader' : null,
            combatDoctrineId: m % 2 ? 'swarm_pack' : null,
            passive: false,
          },
        },
      });
    }
  }
  return entities;
}

function rosterSignature(squad) {
  let text = `${squad.id}|${squad.doctrine}|${squad.faction}|${squad.formation}|${squad.formationSpacing}|${squad.formationBound}|`;
  for (const member of squad.members) {
    text += `;${member.id}:${member.preferredRole || ''}:${member.combatDoctrineId || ''}:${(member.capabilities || []).join('+')}`;
  }
  return text;
}

function compareIds(a, b) { return a < b ? -1 : (a > b ? 1 : 0); }
function compareText(a, b) { return a < b ? -1 : (a > b ? 1 : 0); }

function membershipKey(entities) {
  // Sorted entity walk already matches production candidate order.
  let key = '';
  for (const entity of entities) {
    const ai = entity.data.ai;
    key += `${entity.id}|${ai.squadId}|${ai.doctrine}|${ai.preferredRole || ''}|${ai.combatDoctrineId || ''}|${entity.factionId};`;
  }
  return key;
}

function buildFull(entities, playerId, playerTeam, authorityOrigin, authorityRadius, tick) {
  const squads = new Map();
  for (const entity of entities) {
    const ai = entity.data.ai;
    const squadId = String(ai.squadId);
    let squad = squads.get(squadId);
    if (!squad) {
      squad = {
        id: squadId,
        doctrine: String(ai.doctrine),
        faction: String(entity.factionId),
        formation: String(ai.formation),
        formationSpacing: ai.formationSpacing,
        formationBound: ai.formationBound,
        factionBehavior: null,
        members: [],
        tick,
      };
      squads.set(squadId, squad);
    }
    squad.members.push({
      id: entity.id,
      preferredRole: ai.preferredRole || null,
      capabilities: capabilitiesFor(entity.id),
      combatDoctrineId: ai.combatDoctrineId || null,
      factionBehavior: null,
      team: entity.team,
      alive: entity.alive !== false,
      pos: entity.pos || null,
      passive: false,
      playerId,
      playerTeam,
      authorityOrigin,
      authorityRadius,
      activity: entity.activity || null,
    });
  }
  const roster = [];
  for (const squad of squads.values()) {
    squad.members.sort((a, b) => compareIds(a.id, b.id));
    const entry = {
      id: squad.id,
      doctrine: squad.doctrine,
      faction: squad.faction,
      formation: squad.formation,
      formationSpacing: squad.formationSpacing,
      formationBound: squad.formationBound,
      factionBehavior: null,
      members: squad.members,
    };
    entry[ROSTER_SIGNATURE_FLAG] = rosterSignature(entry);
    roster.push(entry);
  }
  roster.sort((a, b) => compareText(a.id, b.id));
  roster[NORMALIZED_ROSTER_FLAG] = true;
  return roster;
}

function refreshRetained(roster, entities, playerId, playerTeam, authorityOrigin, authorityRadius) {
  // entities already in same order as members across squads when built from sorted candidates.
  const byId = new Map();
  for (const e of entities) byId.set(e.id, e);
  for (const squad of roster) {
    for (const member of squad.members) {
      const entity = byId.get(member.id);
      member.alive = entity.alive !== false;
      member.pos = entity.pos || null;
      member.activity = entity.activity || null;
      member.playerId = playerId;
      member.playerTeam = playerTeam;
      member.authorityOrigin = authorityOrigin;
      member.authorityRadius = authorityRadius;
      // drift positions each tick like flight
      entity.pos.x += 0.01;
      entity.pos.z -= 0.005;
    }
  }
  return roster;
}

function runBefore(entities, playerId, playerTeam, authorityOrigin, authorityRadius) {
  let sink = 0;
  for (let i = 0; i < ITERS; i++) {
    // drift
    for (const e of entities) { e.pos.x += 0.01; e.pos.z -= 0.005; }
    const roster = buildFull(entities, playerId, playerTeam, authorityOrigin, authorityRadius, i);
    sink += roster.length + roster[0].members[0].id + (roster[0][ROSTER_SIGNATURE_FLAG] || '').length;
  }
  return sink;
}

function runAfter(entities, playerId, playerTeam, authorityOrigin, authorityRadius) {
  let sink = 0;
  let retained = null;
  let lastKey = '';
  for (let i = 0; i < ITERS; i++) {
    const key = membershipKey(entities);
    if (retained && key === lastKey) {
      refreshRetained(retained, entities, playerId, playerTeam, authorityOrigin, authorityRadius);
    } else {
      // rebuild (and drift happens inside refresh path only — match before drift)
      for (const e of entities) { e.pos.x += 0.01; e.pos.z -= 0.005; }
      retained = buildFull(entities, playerId, playerTeam, authorityOrigin, authorityRadius, i);
      lastKey = key;
    }
    sink += retained.length + retained[0].members[0].id + (retained[0][ROSTER_SIGNATURE_FLAG] || '').length;
  }
  return sink;
}

function runOnce() {
  const entities = makeEntities();
  const playerId = 1, playerTeam = 1;
  const authorityOrigin = { x: 0, z: 0 };
  const authorityRadius = 900;
  // warm
  runBefore(makeEntities(), playerId, playerTeam, authorityOrigin, authorityRadius);
  const e1 = makeEntities();
  const t0 = performance.now();
  const s1 = runBefore(e1, playerId, playerTeam, authorityOrigin, authorityRadius);
  const beforeMs = performance.now() - t0;
  const e2 = makeEntities();
  const t1 = performance.now();
  const s2 = runAfter(e2, playerId, playerTeam, authorityOrigin, authorityRadius);
  const afterMs = performance.now() - t1;
  return { beforeMs, afterMs, speedup: beforeMs / afterMs, sink: s1 + s2 };
}

if (mode === 'child') {
  writeFileSync(process.argv[3], JSON.stringify(runOnce()));
  process.exit(0);
}

const runs = [];
for (let i = 0; i < 11; i++) {
  const outPath = join(__dirname, `roster-retain-stable-run-${i}.json`);
  const res = spawnSync(process.execPath, [fileURLToPath(import.meta.url), 'child', outPath], {
    cwd: ROOT, encoding: 'utf8',
  });
  if (res.status !== 0) { console.error(res.stderr || res.stdout); process.exit(1); }
  runs.push(JSON.parse(readFileSync(outPath, 'utf8')));
}
const speedups = runs.map((r) => r.speedup).sort((a, b) => a - b);
const befores = runs.map((r) => r.beforeMs).sort((a, b) => a - b);
const afters = runs.map((r) => r.afterMs).sort((a, b) => a - b);
const mid = (a) => a[(a.length / 2) | 0];
const summary = {
  label: 'roster-retain-stable',
  iters: ITERS, members: SQUADS * MEMBERS_PER, runs: runs.length,
  beforeMedMs: mid(befores), afterMedMs: mid(afters),
  minSpeedup: speedups[0], medSpeedup: mid(speedups), maxSpeedup: speedups[speedups.length - 1],
  primary: `~${mid(speedups).toFixed(2)}×`,
  ship_bar: 1.5,
  clears_bar: mid(speedups) >= 1.5 && speedups[0] >= 1.35,
};
writeFileSync(join(__dirname, 'roster-retain-stable-microbench.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
