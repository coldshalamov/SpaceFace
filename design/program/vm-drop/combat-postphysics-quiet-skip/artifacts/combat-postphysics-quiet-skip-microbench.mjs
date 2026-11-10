/**
 * Primary KPI: quiet combat postPhysics residual under registry.step after #86.
 * Before = reconcilePhysics (breakOrphans + Map.clear + orderedAttachments) +
 *          updateTelemetryAndBreak + ensure walk (all table hits) every tick.
 * After  = empty byId early-out for attachment pair + skip ensure walk when
 *          prePhysics already covered this tick's roster (stable sorted cache).
 * Soft-GPU fps not claimed.
 */
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const ROOT = process.cwd();

function runOnce(mode, combatants = 48, iters = 80000) {
  const script = `
function entityKey(id) { return String(id); }
function hasAttachmentKeys(map) {
  if (!map || typeof map !== 'object') return false;
  for (const _ in map) return true;
  return false;
}
function compareIds(a, b) {
  if (Number.isFinite(a) && Number.isFinite(b)) return a - b;
  const aa = String(a), bb = String(b);
  return aa < bb ? -1 : aa > bb ? 1 : 0;
}

const entities = [];
const combatEntities = {};
for (let i = 0; i < ${combatants}; i++) {
  const id = i + 1;
  entities.push({ id, type: 'ship', alive: true });
  combatEntities[entityKey(id)] = { profileId: 'ship_default', heat: 0 };
}
const state = {
  tick: 0,
  combat: {
    entities: combatEntities,
    attachments: { byId: {}, nextId: 1 },
  },
  entityIndex: { __spacefaceEntityIndexV1: true, version: 1 },
};

const EMPTY = Object.freeze([]);
let orderedCache = null;
let orderedKeys = -1;
let orderedDirty = true;
const tickTelemetry = new Map();
let telemetryTick = -1;

function orderedAttachments() {
  const map = state.combat.attachments.byId;
  let count = 0;
  for (const id in map) {
    if (Object.prototype.hasOwnProperty.call(map, id)) count++;
  }
  if (orderedCache && !orderedDirty && orderedKeys === count) return orderedCache;
  orderedCache = Object.values(map).sort(compareIds);
  orderedKeys = count;
  orderedDirty = false;
  return orderedCache;
}

function breakOrphans() {
  let broken = 0;
  for (const att of orderedAttachments()) {
    if (!att || att.state !== 'active') continue;
    broken++;
  }
  return broken;
}

function reconcileBefore() {
  breakOrphans();
  tickTelemetry.clear();
  telemetryTick = state.tick;
  for (const att of orderedAttachments()) {
    if (!att || att.state !== 'active') continue;
  }
  return { recreated: 0, pending: 0 };
}

function telemetryBefore() {
  for (const att of orderedAttachments()) {
    if (!att || att.state !== 'active') continue;
  }
}

function reconcileAfter() {
  if (!hasAttachmentKeys(state.combat.attachments.byId)) return { recreated: 0, pending: 0 };
  return reconcileBefore();
}

function telemetryAfter() {
  if (!hasAttachmentKeys(state.combat.attachments.byId)) return;
  telemetryBefore();
}

let sortedCache = null;
let sortedCacheTick = -1;
let sortedCacheRevision = 0;
let sortedCacheSeenRevision = -1;
let sortedCacheIndexVersion = -2;
let sortedCacheLength = -1;
const sourceScratch = [];

function sortedEntitiesForTick() {
  sourceScratch.length = 0;
  for (let i = 0; i < entities.length; i++) sourceScratch.push(entities[i]);
  const length = sourceScratch.length;
  const indexVersion = state.entityIndex.version;
  if (
    sortedCache
    && sortedCacheTick === state.tick
    && sortedCacheSeenRevision === sortedCacheRevision
    && sortedCacheIndexVersion === indexVersion
    && sortedCacheLength === length
  ) {
    return sortedCache;
  }
  sortedCache = sourceScratch.slice();
  sortedCacheTick = state.tick;
  sortedCacheSeenRevision = sortedCacheRevision;
  sortedCacheIndexVersion = indexVersion;
  sortedCacheLength = length;
  return sortedCache;
}

function isCombatantType(type) {
  return type === 'ship' || type === 'station' || type === 'drone';
}

function ensureWalk() {
  const table = state.combat.entities;
  for (const entity of sortedEntitiesForTick()) {
    if (!entity.alive || !isCombatantType(entity.type)) continue;
    if (table && table[entityKey(entity.id)]) continue;
    // cold ensure — never hit on quiet warm fleet
    table[entityKey(entity.id)] = { profileId: 'ship_default', heat: 0 };
  }
}

function postBefore() {
  // Simulate prePhysics having already built the sorted cache this tick.
  sortedEntitiesForTick();
  reconcileBefore();
  telemetryBefore();
  ensureWalk();
}

function postAfter() {
  // Simulate prePhysics having already built the sorted cache this tick.
  sortedEntitiesForTick();
  reconcileAfter();
  telemetryAfter();
  // Skip ensure walk when prePhysics already covered this tick's roster.
  const indexVersion = state.entityIndex.version;
  if (
    sortedCache
    && sortedCacheTick === state.tick
    && sortedCacheSeenRevision === sortedCacheRevision
    && sortedCacheIndexVersion === indexVersion
  ) {
    return;
  }
  ensureWalk();
}

const fn = ${JSON.stringify(mode)} === 'before' ? postBefore : postAfter;
for (let w = 0; w < 2000; w++) { state.tick = w; fn(); }
const t0 = performance.now();
for (let i = 0; i < ${iters}; i++) { state.tick = i + 10000; fn(); }
process.stdout.write(JSON.stringify({ ms: performance.now() - t0 }));
`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    encoding: 'utf8', cwd: ROOT, timeout: 180000,
  });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout || 'fail');
  return JSON.parse(r.stdout);
}

const pairs = [];
for (let i = 0; i < 11; i++) {
  const before = runOnce('before');
  const after = runOnce('after');
  pairs.push({
    beforeMs: +before.ms.toFixed(3),
    afterMs: +after.ms.toFixed(3),
    speedup: +(before.ms / Math.max(after.ms, 1e-9)).toFixed(3),
  });
}
const xs = pairs.map((p) => p.speedup).sort((a, b) => a - b);
const out = {
  label: 'combat-postphysics-quiet-skip',
  primary: 'quiet-48-combatant-postphysics-residual-after-86',
  pairs,
  medianSpeedup: xs[Math.floor(xs.length / 2)],
  minSpeedup: xs[0],
  maxSpeedup: xs[xs.length - 1],
  note: 'Before=reconcile+telemetry+ensure-walk every tick. After=empty byId early-out + roster-stable ensure skip. Soft-GPU fps not claimed.',
};
writeFileSync(join(ROOT, 'artifacts/combat-postphysics-quiet-skip-microbench.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
