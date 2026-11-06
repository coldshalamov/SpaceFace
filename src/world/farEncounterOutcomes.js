// Off-glass NPC vs NPC is a scheduled outcome, not a 60 Hz dogfight.
// Deterministic from seed + ids + simTime. Does not promote either body.
// Motion uses the farActorTable catch-up path; identity uses encounterCausality fingerprints.

import { hash32 } from '../core/rng.js';
import { catchUpFarRecord, FAR_ACTOR_CELL } from './farActorTable.js';
import { encounterFingerprint, resolvedEncounterFingerprint } from './encounterCausality.js';
import { markAuxRowDirty } from './auxRowJournal.js';

const DELAY_MIN_S = 8;
const DELAY_SPAN_S = 12;
const WINNER_COOLDOWN_S = 30;

function hostileRole(rec) {
  const role = rec && (rec.trafficRole || (rec.data && rec.data.trafficRole));
  const intent = rec && rec.intent && (rec.intent.kind || rec.intent.type);
  return role === 'pirate' || role === 'raider' || role === 'hunter'
    || intent === 'hunt' || intent === 'attack' || intent === 'intercept';
}

function liveShip(rec) {
  return !!(rec && rec.alive !== false && rec.type !== 'wreck' && rec.pos);
}

function eligibleAt(rec, simTime) {
  if (!liveShip(rec) || rec.team == null) return false;
  const due = Number(rec.nextEventAtT);
  return !(Number.isFinite(due) && due >= 0 && due > simTime);
}

function pushQueueHead(heap, queue, kind) {
  const index = queue[`${kind}Index`];
  const entry = queue[`${kind}Rows`][index];
  if (!entry) return;
  const node = { queue, entry, order: entry.order };
  let i = heap.push(node) - 1;
  while (i > 0) {
    const parent = (i - 1) >> 1;
    if (heap[parent].order <= node.order) break;
    heap[i] = heap[parent];
    i = parent;
  }
  heap[i] = node;
}

function popQueueHead(heap) {
  const first = heap[0];
  const last = heap.pop();
  if (heap.length && last) {
    let i = 0;
    while (true) {
      const left = i * 2 + 1;
      if (left >= heap.length) break;
      const right = left + 1;
      const child = right < heap.length && heap[right].order < heap[left].order ? right : left;
      if (heap[child].order >= last.order) break;
      heap[i] = heap[child];
      i = child;
    }
    heap[i] = last;
  }
  return first;
}

function advanceUsedQueueHead(queue, kind, used) {
  const rowsKey = `${kind}Rows`;
  const indexKey = `${kind}Index`;
  const rows = queue[rowsKey];
  while (queue[indexKey] < rows.length && used.has(rows[queue[indexKey]])) queue[indexKey]++;
  return rows[queue[indexKey]] || null;
}

function takeEarliestOtherTeam(heap, team, kind, used) {
  const held = [];
  let chosen = null;
  while (heap.length) {
    const node = popQueueHead(heap);
    const { queue } = node;
    const head = advanceUsedQueueHead(queue, kind, used);
    if (!head) continue;
    if (head !== node.entry) {
      pushQueueHead(heap, queue, kind);
      continue;
    }
    if (queue.team === team) {
      held.push(queue);
      continue;
    }
    chosen = head;
    queue[`${kind}Index`]++;
    advanceUsedQueueHead(queue, kind, used);
    pushQueueHead(heap, queue, kind);
    break;
  }
  for (let i = 0; i < held.length; i++) pushQueueHead(heap, held[i], kind);
  return chosen;
}

function enqueueCandidate(queues, entry, anyHeap, hostileHeap) {
  let queue = queues.get(entry.team);
  if (!queue) {
    queue = { team: entry.team, anyRows: [], anyIndex: 0, hostileRows: [], hostileIndex: 0 };
    queues.set(entry.team, queue);
  }
  if (queue.anyIndex === queue.anyRows.length) {
    queue.anyRows.push(entry);
    pushQueueHead(anyHeap, queue, 'any');
  } else queue.anyRows.push(entry);
  if (entry.hostile) {
    if (queue.hostileIndex === queue.hostileRows.length) {
      queue.hostileRows.push(entry);
      pushQueueHead(hostileHeap, queue, 'hostile');
    } else queue.hostileRows.push(entry);
  }
}

function sameFarCell(a, b) {
  if (a._cell != null && b._cell != null) return a._cell === b._cell;
  return Math.floor((Number(a.pos.x) || 0) / FAR_ACTOR_CELL)
      === Math.floor((Number(b.pos.x) || 0) / FAR_ACTOR_CELL)
    && Math.floor((Number(a.pos.z) || 0) / FAR_ACTOR_CELL)
      === Math.floor((Number(b.pos.z) || 0) / FAR_ACTOR_CELL);
}

export function resolveFarEncounters(state, simTime) {
  const table = state && state.world && state.world.farActors;
  if (!table || !Array.isArray(table.rows) || table.rows.length < 2) return 0;
  const grid = table.grid;
  if (!(grid instanceof Map)) return 0;
  const t = Number.isFinite(simTime) ? simTime : 0;
  const seed = (state.meta && state.meta.seed) >>> 0 || 1;
  const sectorId = state.world && state.world.currentSectorId;
  let resolved = 0;
  const handledActors = new Set();
  // Never iterate the live Map while catch-up may remove/reinsert grid buckets. The copied
  // bucket rows are also the fixed candidate snapshot for this sweep; actors which moved into
  // a new cell are considered on the next sim tick.
  const buckets = Array.from(grid, ([key, rows]) => ({ key, rows: Array.isArray(rows) ? rows.slice() : [] }));
  for (const { key, rows } of buckets) {
    if (rows.length < 2) continue;
    const queues = new Map();
    const anyHeap = [];
    const hostileHeap = [];
    const pairs = [];
    const seenActors = new Set();
    const usedEntries = new Set();
    for (let i = 0; i < rows.length; i++) {
      const actor = rows[i];
      if (!actor || seenActors.has(actor) || handledActors.has(actor) || !eligibleAt(actor, t)) continue;
      if (actor._cell != null && key !== actor._cell) continue;
      seenActors.add(actor);
      const hostile = hostileRole(actor);
      const entry = { actor, team: actor.team, hostile, order: i };
      const opponent = hostile
        ? takeEarliestOtherTeam(anyHeap, entry.team, 'any', usedEntries)
        : takeEarliestOtherTeam(hostileHeap, entry.team, 'hostile', usedEntries);
      if (opponent) {
        usedEntries.add(entry);
        usedEntries.add(opponent);
        handledActors.add(actor);
        handledActors.add(opponent.actor);
        pairs.push([opponent, entry]);
      } else enqueueCandidate(queues, entry, anyHeap, hostileHeap);
    }

    for (let i = 0; i < pairs.length; i++) {
      const [entryA, entryB] = pairs[i];
      const a = entryA.actor;
      const b = entryB.actor;
      const dueA = Number(a.nextEventAtT);
      const dueB = Number(b.nextEventAtT);
      const due = Number.isFinite(dueA) && dueA >= 0 ? dueA
        : (Number.isFinite(dueB) && dueB >= 0 ? dueB : NaN);
      if (!Number.isFinite(due)) {
        const when = t + DELAY_MIN_S + (hash32(seed, a.id, b.id) % DELAY_SPAN_S);
        a.nextEventAtT = when;
        b.nextEventAtT = when;
        continue;
      }

      // Advance before deciding the outcome: this keeps lastExactT, velocity, spatial
      // membership, and the versioned presentation query in sync at the event time.
      catchUpFarRecord(a, t, table);
      catchUpFarRecord(b, t, table);
      if (!liveShip(a) || !liveShip(b) || !sameFarCell(a, b)) continue;

      const lo = a.id < b.id ? a : b;
      const hi = a.id < b.id ? b : a;
      const causality = {
        fingerprint: encounterFingerprint({
          seed,
          encounterId: `far:${lo.id}:${hi.id}`,
          shapeId: 'off_glass_fight',
          sectorId,
          zoneId: 'far-cell',
        }),
        shapeId: 'off_glass_fight',
        sectorId,
      };
      const experience = resolvedEncounterFingerprint(causality, 'killed');
      const roll = hash32(seed, causality.fingerprint, Math.floor(due));
      const aWins = (roll & 1) === 0;
      const winner = aWins ? a : b;
      const loser = aWins ? b : a;
      loser.hull = 0;
      loser.type = 'wreck';
      loser.vel = { x: 0, z: 0 };
      loser.nextEventAtT = -1;
      loser.encounterFingerprint = causality.fingerprint;
      loser.resolvedEncounterFingerprint = experience && experience.fingerprint;
      markAuxRowDirty(table, loser.id);
      winner.nextEventAtT = t + WINNER_COOLDOWN_S;
      markAuxRowDirty(table, winner.id);
      resolved++;
    }
  }
  return resolved;
}
