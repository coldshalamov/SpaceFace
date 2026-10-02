// S1 Phase-B stage 3 — main-side read model v1.
//
// Reconstructs what the present lane reads from live sim state, fed entirely by
// transported data: journal spawn/destroy records + entity-info blocks (entities
// Map) and the aux-row channel (ledger rows: far actors, field rocks, dressing
// rows that are not GameState.entityList members).
//
// The collect query is windowed exactly like appendNearbyLedgerRows: a quantized
// cell walk memoized on (walkX, walkZ, walkRadius, auxVersion), then per-row
// ballistic projection + collect-radius / time-to-enter predicates run against
// the exact origin every call. The worker ships the resolved collect inputs
// (origin, radii, simTime, player velocity) each tick in `collectProbe`, so the
// read-model collect is an apples-to-apples set-equality check against the live
// walk's id set (gate F).
//
// Membership semantics mirror the live state exactly:
//   - entities Map ~ state.entities: spawn info inserts; journal DESTROY deletes
//     (removal-time, matching state.entities.delete — killed-but-unswept rows
//     cannot exist at collect time because the corpse sweep + recordDestroy run
//     inside the tick before the collect probe).
//   - pushAlive parity: every entry that crossed the journal already passed
//     entityIsJournaled (no _noMesh, no visual-factory-skip projectile), so the
//     read-model journaled set = live collect's entityList contribution.
//   - aux rows ~ ledger rows: alive/liveEntityId gates applied per row kind the
//     same way queryAsteroidField/queryFarActors + appendNearbyLedgerRows apply
//     them; dressing rows ride the same aux channel but keep pushAlive's
//     _noMesh filter and dedupe against journaled ids.

import { createHash } from 'node:crypto';
import { ASTEROID_FIELD_CELL } from '../../src/world/asteroidField.js';
import {
  timeToEnterRadiusSeconds,
  TABLE_COLLECT_HORIZON_SECONDS,
  TABLE_DECODE_RUNWAY_SECONDS,
} from '../../src/render/tabletopPolicy.js';

// Same numeric cell encoding as the live grids (bijective for |cell| < 1,048,576).
const CELL_KEY_OFFSET = 1048576;
const CELL_KEY_STRIDE = 2097152;
const READ_MODEL_CELL = ASTEROID_FIELD_CELL;

function cellKeyOf(x, z) {
  return (Math.floor(x / READ_MODEL_CELL) + CELL_KEY_OFFSET) * CELL_KEY_STRIDE
    + (Math.floor(z / READ_MODEL_CELL) + CELL_KEY_OFFSET);
}

function finite(n, fallback = 0) {
  return Number.isFinite(n) ? n : fallback;
}

export function createReadModel() {
  return {
    entities: new Map(),   // entityId -> projected entity row (journal-covered)
    aux: new Map(),        // rowId -> aux row (far | rock | dressing)
    auxCells: new Map(),   // numeric cellKey -> Set(rowId)
    auxVersion: 0,
    meshKey: { walkX: NaN, walkZ: NaN, walkRadius: NaN, auxVersion: -1 },
    meshScratch: [],
    domains: new Map(),    // domain key -> mirror facade (stage 4; mutate-in-place)
  };
}

export function applySpawnInfos(readModel, spawnInfos) {
  for (const info of spawnInfos || []) {
    if (!info || !Number.isSafeInteger(info.entityId)) continue;
    readModel.entities.set(info.entityId, {
      id: info.entityId,
      type: info.type,
      alive: info.alive !== false,
      team: info.team,
      factionId: info.factionId,
      pos: { x: info.x || 0, y: 0, z: info.z || 0 },
      radius: info.radius || 0,
      isPlayer: info.isPlayer === true,
      farResident: info.farResident === true,
      fieldResident: info.fieldResident === true,
      sectorId: info.sectorId || null,
      flags: info.flags || {},
      data: {
        callsign: info.callsign,
        name: info.name,
        trafficRole: info.trafficRole,
        role: info.role,
      },
      activity: { presentationTier: info.presentationTier || 0 },
    });
  }
}

// Journal DESTROY == state.entities.delete (fired at removal, inside the same
// tick sweep, before the collect probe). Delete keeps `entities.has` parity with
// the live far-row check (`state.entities.has(rec.id)`).
export function applyDestroyIds(readModel, ids) {
  for (const id of ids || []) {
    if (Number.isSafeInteger(id)) readModel.entities.delete(id);
  }
}

export function applyAuxUpserts(readModel, upserts) {
  if (!Array.isArray(upserts) || !upserts.length) return;
  for (const u of upserts) {
    if (!u || !Number.isSafeInteger(u.id)) continue;
    const cell = cellKeyOf(finite(u.x), finite(u.z));
    const prev = readModel.aux.get(u.id);
    if (prev && prev.cell !== cell) {
      const bucket = readModel.auxCells.get(prev.cell);
      if (bucket) {
        bucket.delete(u.id);
        if (bucket.size === 0) readModel.auxCells.delete(prev.cell);
      }
    }
    const row = {
      id: u.id,
      kind: u.kind,
      type: u.type,
      alive: u.alive !== false,
      pos: { x: finite(u.x), z: finite(u.z) },
      vel: { x: finite(u.vx), z: finite(u.vz) },
      rot: finite(u.rot),
      radius: finite(u.radius),
      lastExactT: Number.isFinite(u.lastExactT) ? u.lastExactT : null,
      liveEntityId: u.liveEntityId == null ? null : u.liveEntityId,
      _noMesh: u.noMesh === true,
      sectorId: u.sectorId || null,
      cell,
    };
    if (!prev) {
      let bucket = readModel.auxCells.get(cell);
      if (!bucket) {
        bucket = new Set();
        readModel.auxCells.set(cell, bucket);
      }
      bucket.add(u.id);
    } else if (prev.cell !== cell) {
      let bucket = readModel.auxCells.get(cell);
      if (!bucket) {
        bucket = new Set();
        readModel.auxCells.set(cell, bucket);
      }
      bucket.add(u.id);
    }
    readModel.aux.set(u.id, row);
    readModel.auxVersion++;
  }
}

export function applyAuxRemovals(readModel, ids) {
  if (!Array.isArray(ids) || !ids.length) return;
  for (const id of ids) {
    const prev = readModel.aux.get(id);
    if (!prev) continue;
    const bucket = readModel.auxCells.get(prev.cell);
    if (bucket) {
      bucket.delete(id);
      if (bucket.size === 0) readModel.auxCells.delete(prev.cell);
    }
    readModel.aux.delete(id);
    readModel.auxVersion++;
  }
}

// Mirror of resolveWorldPresentationEntity's precedence for read-model consumers
// (entities → rock → dressing → far → live-fallback).
export function readModelResolve(readModel, id) {
  if (id == null || !readModel) return null;
  const live = readModel.entities.get(id);
  if (live && live.alive !== false) return live;
  const aux = readModel.aux.get(id);
  if (aux && aux.alive !== false) {
    if (aux.kind === 'rock' && aux.liveEntityId == null) return aux;
    if (aux.kind === 'dressing') return aux;
    if (aux.kind === 'far') return aux;
  }
  return live && live.alive !== false ? live : null;
}

// Disc query over the aux grid — the "windowed query" the stage replaces
// appendNearbyLedgerRows' live-table scans with. Mirrors queryAsteroidField's
// cell walk + per-row disc filter (reach union: d2 <= (r + radius)^2 || d2 <= r2).
// Far rows query the same grid — the live code's row-scan shortcut is a cost
// decision, not a membership difference, so one windowed walk covers both.
function auxQueryDisc(readModel, walkX, walkZ, walkRadius, out) {
  out.length = 0;
  const r = walkRadius;
  const r2 = r * r;
  const minC = Math.floor((walkX - r) / READ_MODEL_CELL);
  const maxC = Math.floor((walkX + r) / READ_MODEL_CELL);
  const minR = Math.floor((walkZ - r) / READ_MODEL_CELL);
  const maxR = Math.floor((walkZ + r) / READ_MODEL_CELL);
  for (let cx = minC; cx <= maxC; cx++) {
    const rowBase = (cx + CELL_KEY_OFFSET) * CELL_KEY_STRIDE + CELL_KEY_OFFSET;
    for (let cz = minR; cz <= maxR; cz++) {
      const bucket = readModel.auxCells.get(rowBase + cz);
      if (!bucket) continue;
      for (const id of bucket) {
        const row = readModel.aux.get(id);
        if (!row) continue;
        const dx = row.pos.x - walkX;
        const dz = row.pos.z - walkZ;
        const d2 = dx * dx + dz * dz;
        const reach = r + finite(row.radius);
        if (d2 <= reach * reach || d2 <= r2) out.push(row);
      }
    }
  }
  return out;
}

const _eff = { x: 0, z: 0 };
function ledgerPredicted(row, simTime) {
  const drift = Math.max(0, finite(simTime) - finite(row.lastExactT));
  _eff.x = finite(row.pos.x) + finite(row.vel.x) * drift;
  _eff.z = finite(row.pos.z) + finite(row.vel.z) * drift;
  return _eff;
}

/**
 * Read-model twin of collectMeshPresentationEntities — returns an id SET (not
 * row objects) for digest comparison against the worker's live collect.
 *
 * `inputs` = the worker-shipped collectProbe block:
 *   { originX, originZ, collectRadius, scanRadius, glassCorner, simTime,
 *     pvx, pvz }
 * origin is the resolved tableLookAtOrigin (focus+frameOrigin math stays
 * worker-side; the resolved scalar crosses — the read model never sees
 * camera.focus directly).
 */
export function readModelCollectIds(readModel, inputs, out = []) {
  out.length = 0;
  const seen = new Set();
  for (const e of readModel.entities.values()) {
    if (e && e.alive !== false && e._noMesh !== true && !seen.has(e.id)) {
      seen.add(e.id);
      out.push(e.id);
    }
  }
  const {
    originX, originZ, collectRadius, scanRadius, glassCorner, simTime,
  } = inputs || {};
  const pvx = finite(inputs && inputs.pvx);
  const pvz = finite(inputs && inputs.pvz);
  // Dressing rows: live collect pushes them via collectJournalPresentationEntities'
  // dressing.rows loop (pushAlive semantics) — dedup against journaled ids.
  for (const row of readModel.aux.values()) {
    if (row.kind !== 'dressing') continue;
    if (row.alive === false || row._noMesh || seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(row.id);
  }
  if (!(collectRadius > 0)) return out;
  // Quantized walk — identical lattice math to appendNearbyLedgerRows so the
  // memo covers the same superset; per-row predicates still run every call.
  const walkX = (Math.floor(finite(originX) / ASTEROID_FIELD_CELL) + 0.5) * ASTEROID_FIELD_CELL;
  const walkZ = (Math.floor(finite(originZ) / ASTEROID_FIELD_CELL) + 0.5) * ASTEROID_FIELD_CELL;
  const radiusPad = Math.ceil(ASTEROID_FIELD_CELL * Math.SQRT1_2);
  const walkRadius = Math.ceil((finite(scanRadius) + radiusPad) / 500) * 500;
  const key = readModel.meshKey;
  if (!(key.walkX === walkX && key.walkZ === walkZ
        && key.walkRadius === walkRadius && key.auxVersion === readModel.auxVersion)) {
    auxQueryDisc(readModel, walkX, walkZ, walkRadius, readModel.meshScratch);
    key.walkX = walkX;
    key.walkZ = walkZ;
    key.walkRadius = walkRadius;
    key.auxVersion = readModel.auxVersion;
  }
  const radius2 = collectRadius * collectRadius;
  for (let i = 0; i < readModel.meshScratch.length; i++) {
    const row = readModel.meshScratch[i];
    if (!row || seen.has(row.id)) continue;
    if (row.kind === 'rock') {
      // queryAsteroidField already filtered liveEntityId/alive at query time;
      // the aux grid keeps them so the collect applies the same gates here.
      if (row.alive === false || row.liveEntityId != null) continue;
      const eff = ledgerPredicted(row, simTime);
      const relX = eff.x - originX;
      const relZ = eff.z - originZ;
      if (relX * relX + relZ * relZ <= radius2) {
        seen.add(row.id);
        out.push(row.id);
        continue;
      }
      const relVx = finite(row.vel.x) - pvx;
      const relVz = finite(row.vel.z) - pvz;
      const tEnter = timeToEnterRadiusSeconds(
        relX, relZ, relVx, relVz,
        glassCorner + finite(row.radius),
        TABLE_COLLECT_HORIZON_SECONDS,
      );
      if (tEnter <= TABLE_COLLECT_HORIZON_SECONDS) {
        seen.add(row.id);
        out.push(row.id);
      }
    } else if (row.kind === 'far') {
      if (row.alive === false) continue;
      // Live: `live.has(rec.id)` — read model: journaled-entity membership.
      if (readModel.entities.has(row.id)) continue;
      const eff = ledgerPredicted(row, simTime);
      const relX = eff.x - originX;
      const relZ = eff.z - originZ;
      if (relX * relX + relZ * relZ <= radius2) {
        seen.add(row.id);
        out.push(row.id);
        continue;
      }
      const relVx = finite(row.vel.x) - pvx;
      const relVz = finite(row.vel.z) - pvz;
      const tEnter = timeToEnterRadiusSeconds(
        relX, relZ, relVx, relVz,
        glassCorner + finite(row.radius, 8),
        TABLE_DECODE_RUNWAY_SECONDS,
      );
      if (tEnter <= TABLE_DECODE_RUNWAY_SECONDS) {
        seen.add(row.id);
        out.push(row.id);
      }
    }
  }
  return out;
}

/**
 * Set digest shared by both lanes: worker digests the live collect's ids, main
 * digests readModelCollectIds — equal digests prove the read-model collect
 * returns the same set. FNV-1a over the sorted id list; ids are safe-integers
 * (f64) so sort must be numeric.
 */
export function digestIds(ids) {
  const sorted = (ids || []).slice().sort((a, b) => a - b);
  let h = 0x811c9dc5;
  for (const id of sorted) {
    const s = String(id);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    h ^= 0x2c;
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

// ---------------------------------------------------------------------------
// S1 Phase-B stage 4 — domain mirrors (read model v2).
//
// The render+UI lane reads sim-owned state keys beyond the journal-covered
// presentation set. After the flip those reads must hit main-side facades, so
// the worker ships canonical snapshots of every mirrored key whenever its
// canonical signature changes. Facades are mutated in place on the main side —
// consumers hold references across ticks, identity is the contract.
//
// Mirrored key set (stage-4 census; UI+render reads merged). Top-level state
// keys plus the non-aux world.* subkeys. NOT mirrored, deliberately:
//   entities/entityList/entityIndex (v1 read model), world.asteroidField /
//   farActors / dressing (aux channel), settings (command envelopes),
//   render/ui/meshes/camera/perfRuntime/assets/pools/diagnostics/stats/slots
//   (render-local — they move WITH the render lane), bus (event bridge),
//   rng (worker-only — a main-side draw would fork the stream), timeScale /
//   flight / jump / scenario / traffic / claims / crafting / careers /
//   conflicts / aiEncounter / interventions (outside the census set).
// ---------------------------------------------------------------------------

// Stage-6 narrowed census (item C): mirror only what the render/UI lane
// provably reads. Whole roots carry dynamic consumers (player.cargo, economy.*,
// missions.active, factions[id].rep, combat.attachments, bare `state.onboarding`
// object reads, meta.seed/playtimeS, run.kind/ruleset, input.* live controls,
// fuel.current/max, aceMemory[id], cursor on the asteroid screen, sandbox,
// mode/simTime/tick/playerId/ruleset scalars). Dotted keys mirror just the
// consumed subtree — resolveDomainValue walks every segment.
//
// Dropped vs the stage-4 set: world.sectorId and world.currentSector (dead
// keys — neither ever exists on gameState), and the untouched halves of the
// narrowed roots (sectorSim.* minus .field, npcJobs.* minus .byId,
// factionPresence.* minus .boarding, automation internals, drill internals,
// save internals, world.records internals besides .byId).
export const DOMAIN_MIRROR_KEYS = Object.freeze([
  // whole-root mirrors
  'mode', 'simTime', 'tick', 'playerId', 'ruleset',
  'player', 'missions', 'nav', 'economy', 'story', 'factions', 'combat',
  'input', 'fuel', 'aceMemory', 'sandbox', 'onboarding', 'meta', 'run',
  'cursor',
  // leaf-path mirrors (root stays on the facade; only the subtree ships)
  'sectorSim.field', 'npcJobs.byId', 'factionPresence.boarding',
  'automation.meta', 'automation.traders', 'automation.fleet',
  'drill.scan', 'drill.active', 'drill.tilesCleared', 'drill.field',
  'drill.asteroidId',
  'save.slots', 'save.currentSlot',
  'world.currentSectorId', 'world.sectors', 'world.discovery',
  'world.frameOrigin', 'world.frameOriginSeq', 'world.frontierRumors',
  'world.scanPings', 'world.activeSector', 'world.records.byId',
  'world.vestaOreCache', 'world.pallasHiddenCache',
]);

// Per-key canonical-serialization ship cap (report-only): any single mirrored
// value whose signature exceeds this is flagged in the run diagnostics.
export const DOMAIN_SHIP_CAP_BYTES = 256 * 1024;

// Live-state accessor for a mirrored key. Every segment walks off the state
// root — 'world.currentSectorId' reaches state.world.currentSectorId, and the
// stage-6 leaf keys ('sectorSim.field', 'drill.scan', 'world.records.byId')
// walk their full path. A dead segment resolves to undefined: the differ then
// treats the leaf as absent rather than throwing on a missing container.
export function resolveDomainValue(state, key) {
  if (!state) return undefined;
  let node = state;
  const start = key.indexOf('.');
  if (start < 0) return node[key];
  for (const seg of key.split('.')) {
    if (node == null) return undefined;
    node = node[seg];
  }
  return node;
}

// Path granularity: mirrored roots are diffed at leaf-path level, not whole-key.
// A whole-key diff forces a full canonical walk of the largest roots every tick
// (economy ≈ 3.9 MB, measured stage-4 census) — ~75 ms/tick. Expansion descends
// into plain-object children up to the declared depth so big roots split into
// per-leaf paths (economy.markets.<station>, combat.attachments, ...).
// Cadence tiers (measured stage-4 census): leaf paths > DOMAIN_COLD_BYTES
// re-sign every DOMAIN_COLD_TICKS passes; > DOMAIN_WARM_BYTES every
// DOMAIN_WARM_TICKS; smaller leaves every pass. The probe always reports the
// last-signed digest per leaf path, so it stays consistent with the facade
// state between cold/warm re-signs (facades trail live by the tier interval
// at worst — the signed digest still describes the shipped content).
export const DOMAIN_EXPAND = Object.freeze({ economy: 2, combat: 1, story: 1, input: 1, meta: 1 });
// Path-prefix expansion overrides: a matching prefix raises the expansion
// depth for that subtree. None active — measured 2026-10: expanding
// economy.markets one more level (per-commodity rows) balloons the leaf set
// from ~150 to ~1300 and the fixed per-pass walk (~1µs/leaf) costs more than
// the ship bytes it saves. Kept as a tuning knob for stage 5+.
export const DOMAIN_EXPAND_PATHS = Object.freeze([]);
export const DOMAIN_COLD_BYTES = 4 * 1024;
export const DOMAIN_COLD_TICKS = 60;
export const DOMAIN_WARM_BYTES = 1024;
export const DOMAIN_WARM_TICKS = 10;
// Expanded containers re-enumerate their children on this cadence instead of
// every pass (add/remove detection trails by the interval; leaf signing inside
// the known set keeps its own tier cadence). Warm leaves and enumerations are
// staggered round-robin by node slot so per-pass cost stays flat. Cold leaves
// fire in ALIGNED bursts (a bounded 1/DOMAIN_COLD_TICKS of passes — excluded
// from p95, amortized and reported as diffMs max) at DOMAIN_COLD_OFFSET,
// offset half a period from the probe sweep so no single pass does both.
export const DOMAIN_ENUM_TICKS = 10;
export const DOMAIN_COLD_OFFSET = DOMAIN_COLD_TICKS >> 1;
// Stage-6 per-domain freshness budgets (item C): leaf paths under a listed
// root re-sign no more often than N passes. The effective interval is
// max(sizeTier, cadence) — cadence only ever RELAXES a leaf (markets refresh
// ~6x/s, slow UI bags ~1x/s); a cold leaf keeps its aligned-burst slot.
// Roots not listed keep the size-tier schedule unchanged.
export const DOMAIN_CADENCE = Object.freeze({
  economy: 10, missions: 10, story: 10, factions: 30,
  sectorSim: 10, npcJobs: 30, factionPresence: 10, automation: 30,
  onboarding: 10, meta: 30, run: 30, save: 10, aceMemory: 60,
  'world.sectors': 10, 'world.discovery': 10, 'world.records': 60,
  'world.frontierRumors': 10, 'world.scanPings': 10, 'world.activeSector': 10,
  'world.vestaOreCache': 60, 'world.pallasHiddenCache': 60,
});
// Every Nth probe ships the full slot/digest set instead of the changed-set
// delta: a periodic whole-facade re-verification that also re-checks for
// facade paths the live state no longer has.
export const DOMAIN_PROBE_SWEEP_TICKS = 60;

function expandDepthFor(segs) {
  let depth = DOMAIN_EXPAND[segs[0]] || 0;
  for (const rule of DOMAIN_EXPAND_PATHS) {
    const p = rule.segs;
    if (p.length >= segs.length) continue;
    let match = true;
    for (let i = 0; i < p.length; i++) {
      if (segs[i] !== p[i]) { match = false; break; }
    }
    if (match && rule.depth > depth) depth = rule.depth;
  }
  return depth;
}

// True for values the canonical object branch serializes as `o:{...}` — plain
// objects AND class instances (own enumerable fields only). These are the only
// kinds the differ descends into for path expansion.
function isCanonicalObject(v) {
  return v !== null && typeof v === 'object'
    && !Array.isArray(v) && !(v instanceof Map) && !(v instanceof Set)
    && !(v instanceof Date) && !(v instanceof RegExp)
    && !ArrayBuffer.isView(v) && !(v instanceof ArrayBuffer);
}

// sha256 hex (truncated to 64-bit) of a canonical signature string — what
// crosses the wire in the probe. 16 hex chars per path keeps the per-tick
// probe under a few KB; collision risk is nil at ~150-path scale.
export function domainSigDigest(sig) {
  return createHash('sha256').update(sig).digest('hex').slice(0, 16);
}

// --- canonical signature ----------------------------------------------------
//
// Deterministic serialization of a value's canonical (transport) form:
//   numbers/bigints/strings/booleans/null → typed literal tokens
//   plain objects & class instances       → own-enumerable sorted-key tuple
//   arrays                                → elements in order
//   Map                                   → entries sorted by key signature
//   Set                                   → values sorted by signature
//   Date/RegExp                           → tagged literal
//   typed arrays                          → ctor tag + elements in order
//   functions/undefined/symbols           → '@@opaque'
//   true back-edge revisits (cycles)      → '@@cycle'
// Shared references that are NOT ancestors of the current node re-sign by
// content (the signature describes data, not sharing topology — mutate-in-place
// facades legitimately hold different identity graphs than the live objects).
// `seen` is the ancestor set: add on descend, delete on ascend.
// The same traversal shapes canonicalClone, so a facade re-signs byte-identical
// to the live value it mirrors.

const SIG_OPAQUE = '@@opaque';
const SIG_CYCLE = '@@cycle';

function writeDomainSignature(value, parts, seen) {
  if (value === null) {
    parts.push('null');
    return;
  }
  const t = typeof value;
  if (t === 'number') {
    parts.push('n:', Number.isNaN(value) ? 'NaN'
      : Object.is(value, -0) ? '-0'
        : Number.isFinite(value) ? String(value)
          : String(value));
    return;
  }
  if (t === 'string') {
    parts.push('s:', JSON.stringify(value));
    return;
  }
  if (t === 'boolean') {
    parts.push('b:', String(value));
    return;
  }
  if (t === 'bigint') {
    parts.push('g:', String(value));
    return;
  }
  if (t !== 'object') {
    parts.push(SIG_OPAQUE);
    return;
  }
  if (seen.has(value)) {
    parts.push(SIG_CYCLE);
    return;
  }
  if (Array.isArray(value)) {
    seen.add(value);
    parts.push('a:[');
    for (let i = 0; i < value.length; i++) {
      if (i) parts.push(',');
      writeDomainSignature(value[i], parts, seen);
    }
    parts.push(']');
    seen.delete(value);
    return;
  }
  if (value instanceof Map) {
    seen.add(value);
    const entries = [];
    for (const [k, v] of value) {
      const keyParts = [];
      writeDomainSignature(k, keyParts, seen);
      entries.push([keyParts.join(''), v]);
    }
    entries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    parts.push('m:{');
    for (let i = 0; i < entries.length; i++) {
      if (i) parts.push(',');
      parts.push(entries[i][0], '=>');
      writeDomainSignature(entries[i][1], parts, seen);
    }
    parts.push('}');
    seen.delete(value);
    return;
  }
  if (value instanceof Set) {
    seen.add(value);
    const sigs = [];
    for (const item of value) {
      const itemParts = [];
      writeDomainSignature(item, itemParts, seen);
      sigs.push(itemParts.join(''));
    }
    sigs.sort();
    parts.push('e:{', sigs.join(','), '}');
    seen.delete(value);
    return;
  }
  if (value instanceof Date) {
    parts.push('d:', String(value.getTime()));
    return;
  }
  if (value instanceof RegExp) {
    parts.push('r:', value.source, '/', value.flags);
    return;
  }
  if (ArrayBuffer.isView(value)) {
    if (value instanceof DataView) {
      parts.push('y:DataView:[', String(value.byteLength), ']');
      return;
    }
    parts.push('y:', value.constructor.name, ':[');
    for (let i = 0; i < value.length; i++) {
      if (i) parts.push(',');
      writeDomainSignature(value[i], parts, seen);
    }
    parts.push(']');
    return;
  }
  seen.add(value);
  const keys = Object.keys(value).sort();
  parts.push('o:{');
  for (let i = 0; i < keys.length; i++) {
    if (i) parts.push(',');
    parts.push(JSON.stringify(keys[i]), '=');
    let field;
    try {
      field = value[keys[i]];
    } catch (_) {
      field = undefined; // throwing getter — opaque leaf
    }
    writeDomainSignature(field, parts, seen);
  }
  parts.push('}');
  seen.delete(value);
}

// Canonical signature of a value. `scratch` is a caller-retained object the
// helper fills with {parts, seen} so repeat calls allocate nothing but the
// joined result string.
export function canonicalSignature(value, scratch) {
  const ctx = scratch || {};
  const parts = ctx.parts || (ctx.parts = []);
  const seen = ctx.seen || (ctx.seen = new Set());
  parts.length = 0;
  seen.clear();
  writeDomainSignature(value, parts, seen);
  return parts.join('');
}

// --- canonical clone --------------------------------------------------------
//
// Transport-safe deep copy with the same traversal as the signature: functions
// and other opaque leaves become `undefined`, class instances become plain
// objects of their own enumerable fields, cycles/shared refs are preserved as
// shared references (structured clone carries the graph verbatim).

function cloneDomainValue(value, seen) {
  if (value === null) return null;
  const t = typeof value;
  if (t === 'number' || t === 'string' || t === 'boolean' || t === 'bigint') {
    return value;
  }
  if (t !== 'object') return undefined;
  let out = seen.get(value);
  if (out !== undefined) return out;
  if (Array.isArray(value)) {
    out = new Array(value.length);
    seen.set(value, out);
    for (let i = 0; i < value.length; i++) {
      out[i] = cloneDomainValue(value[i], seen);
    }
    return out;
  }
  if (value instanceof Map) {
    out = new Map();
    seen.set(value, out);
    for (const [k, v] of value) {
      out.set(cloneDomainValue(k, seen), cloneDomainValue(v, seen));
    }
    return out;
  }
  if (value instanceof Set) {
    out = new Set();
    seen.set(value, out);
    for (const item of value) out.add(cloneDomainValue(item, seen));
    return out;
  }
  if (value instanceof Date) {
    out = new Date(value.getTime());
    seen.set(value, out);
    return out;
  }
  if (value instanceof RegExp) {
    out = new RegExp(value.source, value.flags);
    seen.set(value, out);
    return out;
  }
  if (ArrayBuffer.isView(value)) {
    out = value instanceof DataView
      ? new DataView(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength))
      : value.slice();
    seen.set(value, out);
    return out;
  }
  if (value instanceof ArrayBuffer) {
    out = value.slice(0);
    seen.set(value, out);
    return out;
  }
  out = {};
  seen.set(value, out);
  for (const k of Object.keys(value)) {
    let field;
    try {
      field = value[k];
    } catch (_) {
      field = undefined;
    }
    out[k] = cloneDomainValue(field, seen);
  }
  return out;
}

// Canonical transport clone. `scratch` is a caller-retained object holding
// {seen}; the returned graph is structured-clone safe (no functions, no live
// class instances — everything below is plain data).
export function canonicalClone(value, scratch) {
  const ctx = scratch || {};
  const seen = ctx.seen || (ctx.seen = new Map());
  seen.clear();
  return cloneDomainValue(value, seen);
}

// --- mutate-in-place merge --------------------------------------------------
//
// Deep-assign a shipped canonical value into the stored facade. Same-kind
// containers are edited in place so facade identity survives across updates;
// anything else (primitive, kind change, first ship) replaces.
//
// `touched` tracks facade objects already mutated by THIS update application:
// when the same facade node is reached a second time (facade graph has sharing
// the shipped graph does not — or vice versa), merging again would alias the
// second path onto the first. The second visit replaces instead, which can
// break sharing but never corrupts content (content-based signatures make
// sharing topology invisible to the probe).

function isContainer(value) {
  return value !== null && typeof value === 'object';
}

export function deepAssignInPlace(target, source, touched) {
  if (target === source) return target;
  if (!isContainer(target) || !isContainer(source)) return source;
  if (touched) {
    if (touched.has(target)) return source;
    touched.add(target);
  }
  if (Array.isArray(source)) {
    if (!Array.isArray(target)) return source;
    for (let i = 0; i < source.length; i++) {
      target[i] = deepAssignInPlace(target[i], source[i], touched);
    }
    target.length = source.length;
    return target;
  }
  if (source instanceof Map) {
    if (!(target instanceof Map)) return source;
    for (const k of target.keys()) {
      if (!source.has(k)) target.delete(k);
    }
    for (const [k, v] of source) {
      target.set(k, deepAssignInPlace(target.get(k), v, touched));
    }
    return target;
  }
  if (source instanceof Set) {
    if (!(target instanceof Set)) return source;
    target.clear();
    for (const item of source) target.add(item);
    return target;
  }
  if (source instanceof Date) {
    if (!(target instanceof Date)) return source;
    target.setTime(source.getTime());
    return target;
  }
  if (ArrayBuffer.isView(source) || source instanceof ArrayBuffer) {
    if (target.constructor === source.constructor
        && target.length === source.length
        && typeof target.set === 'function') {
      target.set(source);
      return target;
    }
    return source;
  }
  if (Array.isArray(target) || target instanceof Map || target instanceof Set
      || target instanceof Date || ArrayBuffer.isView(target)
      || target instanceof ArrayBuffer) {
    return source; // container kind changed — replacement is the only merge
  }
  const targetKeys = Object.keys(target);
  for (const k of targetKeys) {
    if (!Object.prototype.hasOwnProperty.call(source, k)) delete target[k];
  }
  for (const k of Object.keys(source)) {
    target[k] = deepAssignInPlace(target[k], source[k], touched);
  }
  return target;
}

// True when two shipped/facade values are the same container kind — the case
// where mutate-in-place must hold (identity is not preserved across kind
// changes by design; a kind change is a legitimate swap).
export function sameDomainContainerKind(a, b) {
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b);
  if (a instanceof Map || b instanceof Map) return a instanceof Map && b instanceof Map;
  if (a instanceof Set || b instanceof Set) return a instanceof Set && b instanceof Set;
  if (a instanceof Date || b instanceof Date) return a instanceof Date && b instanceof Date;
  const aView = ArrayBuffer.isView(a);
  const bView = ArrayBuffer.isView(b);
  if (aView || bView) return aView && bView && a.constructor === b.constructor;
  return isContainer(a) && isContainer(b)
    && !(a instanceof ArrayBuffer) && !(b instanceof ArrayBuffer);
}

// --- domain path differ -----------------------------------------------------
//
// Worker-side per-pass differ. Maintains a path table: expanded (container)
// nodes enumerate their live children each pass; leaf nodes sign on their
// cadence (hot every pass, cold every DOMAIN_COLD_TICKS passes) and ship a
// canonical clone when the digest drifts. The probe is the digest set of every
// leaf path — the runner replays the same walk over its facades and compares.
//
// Node records: { leaf, kids:Set<string>|null, digest, bytes, lastSign, segs }.
// paths is keyed by the joined path string; segs is the segment array where
// segs[0] is the mirrored root key (which itself may contain dots, e.g.
// 'world.currentSectorId').

export function createDomainDiffer(options = {}) {
  // Stage-6 instrumentation gate (item F3): the probe slot table + digest sets
  // exist only for --probe domains runs. Production ticks pass probe:false and
  // pay zero slot bookkeeping / zero probe alloc; diff updates are identical
  // either way (probe content never fed the shipped updates).
  const probeEnabled = options.probe === true;
  const paths = new Map();
  const sigScratch = {};
  const cloneScratch = {};
  let nextSlot = 0;
  // Probe slot table: leaf paths interned to stable integer slots so the
  // per-tick probe ships [slot, digest] pairs instead of path strings.
  // probeSlots[slot] = path (null while the slot is free). pendingAdds /
  // pendingRemovals ride the next probe reply; probeGen bumps on table churn.
  const probeSlots = [];
  const freeSlots = [];
  const pendingAdds = [];
  const pendingRemovals = [];
  let probeGen = 0;

  function assignProbeSlot(node, path) {
    if (!probeEnabled) return;
    const slot = freeSlots.length ? freeSlots.pop() : probeSlots.length;
    probeSlots[slot] = path;
    node.probeSlot = slot;
    pendingAdds.push([slot, node.segs]);
    probeGen++;
  }

  function releaseProbeSlot(node) {
    if (!probeEnabled || node.probeSlot == null) return;
    probeSlots[node.probeSlot] = null;
    freeSlots.push(node.probeSlot);
    pendingRemovals.push(node.probeSlot);
    node.probeSlot = null;
    probeGen++;
  }

  function dropNode(path) {
    const n = paths.get(path);
    if (!n) return;
    if (n.kids) for (const c of n.kids) dropNode(`${path}.${c}`);
    releaseProbeSlot(n);
    paths.delete(path);
  }

  function ensureNode(path, segs) {
    let n = paths.get(path);
    if (!n) {
      n = {
        leaf: true, kids: null, digest: null, bytes: 0,
        lastSign: -1, lastEnum: null, segs, slot: nextSlot++,
        probeSlot: null, probeChanged: false,
      };
      paths.set(path, n);
    }
    return n;
  }

  function walk(path, segs, v, tick, updates, stats) {
    const node = ensureNode(path, segs);
    if (isCanonicalObject(v) && segs.length - 1 < expandDepthFor(segs)) {
      if (node.leaf) releaseProbeSlot(node); // leaf -> container
      node.leaf = false;
      const enumDue = node.lastEnum == null
        || tick % DOMAIN_ENUM_TICKS === node.slot % DOMAIN_ENUM_TICKS;
      if (enumDue) {
        const liveKids = new Set(Object.keys(v));
        for (const c of liveKids) {
          walk(`${path}.${c}`, segs.concat(c), v[c], tick, updates, stats);
        }
        if (node.kids) {
          for (const c of node.kids) {
            if (!liveKids.has(c)) {
              updates.push({ segs: segs.concat(c), del: true });
              dropNode(`${path}.${c}`);
            }
          }
        }
        node.kids = liveKids;
        node.lastEnum = tick;
      } else {
        // Between enumerations walk the known set only: absent children delete
        // eagerly (a present-undefined child will be re-discovered next enum);
        // new children wait for the enumeration pass.
        for (const c of node.kids) {
          const cv = v[c];
          if (cv === undefined) {
            updates.push({ segs: segs.concat(c), del: true });
            dropNode(`${path}.${c}`);
            node.kids.delete(c);
          } else {
            walk(`${path}.${c}`, segs.concat(c), cv, tick, updates, stats);
          }
        }
      }
      return;
    }
    if (node.kids) {
      // Was expanded, value no longer a canonical object — collapse: every
      // former child path deletes, then this node diffs as a leaf.
      for (const c of node.kids) {
        updates.push({ segs: segs.concat(c), del: true });
        dropNode(`${path}.${c}`);
      }
      node.kids = null;
    }
    node.leaf = true;
    if (node.lastSign >= 0) {
      const tierTicks = node.bytes > DOMAIN_COLD_BYTES ? DOMAIN_COLD_TICKS
        : node.bytes > DOMAIN_WARM_BYTES ? DOMAIN_WARM_TICKS : 1;
      const interval = Math.max(tierTicks, DOMAIN_CADENCE[segs[0]] || 0);
      if (interval > 1) {
        // Cold leaves keep their aligned burst (the amortized pass the p95
        // exclusion covers); every other interval staggers by node slot.
        if (tierTicks === DOMAIN_COLD_TICKS && interval === DOMAIN_COLD_TICKS) {
          if (tick % DOMAIN_COLD_TICKS !== DOMAIN_COLD_OFFSET) return;
        } else if (tick % interval !== node.slot % interval) {
          return;
        }
      }
    }
    const sig = canonicalSignature(v, sigScratch);
    const digest = domainSigDigest(sig);
    stats.signedBytes += sig.length;
    node.lastSign = tick;
    node.bytes = sig.length;
    const freshSlot = node.probeSlot == null;
    if (freshSlot) assignProbeSlot(node, path);
    if (digest !== node.digest) {
      node.digest = digest;
      node.probeChanged = true;
      updates.push({ segs, v: canonicalClone(v, cloneScratch), bytes: sig.length });
      stats.shipBytes += sig.length;
      stats.ships++;
      if (sig.length > DOMAIN_SHIP_CAP_BYTES && stats.oversize.length < 32) {
        stats.oversize.push({ path, bytes: sig.length, tick });
      }
    } else if (freshSlot) {
      node.probeChanged = true; // runner needs this digest for the new slot
    }
  }

  return {
    paths,
    diff(state, tick) {
      const start = process.hrtime.bigint();
      const updates = [];
      const stats = { shipBytes: 0, ships: 0, signedBytes: 0, oversize: [] };
      for (const key of DOMAIN_MIRROR_KEYS) {
        walk(key, [key], resolveDomainValue(state, key), tick, updates, stats);
      }
      const sweep = tick % DOMAIN_PROBE_SWEEP_TICKS === 0;
      let probe = null;
      if (probeEnabled) {
        const s = [];
        const h = [];
        for (const n of paths.values()) {
          if (!n.leaf || n.probeSlot == null) continue;
          if (sweep || n.probeChanged) {
            s.push(n.probeSlot);
            h.push(n.digest);
            n.probeChanged = false;
          }
        }
        probe = {
          gen: probeGen,
          sweep,
          a: pendingAdds.splice(0),
          r: pendingRemovals.splice(0),
          s,
          h,
        };
      }
      stats.diffMs = Number(process.hrtime.bigint() - start) / 1e6;
      return { updates, probe, ...stats };
    },
  };
}

// Apply one shipped path update into the facades map. Multi-segment updates
// resolve under the mirrored root (segs[0]); intermediate nodes are created as
// needed; the leaf slot is deep-assigned in place. {del:true} removes the leaf
// property. Root facade identity is preserved — the root object is mutated,
// never swapped, except by a root-level del (which the differ never emits for
// mirrored keys) or a root-level kind change (a legitimate swap).
export function applyDomainPathUpdate(domains, u, touched) {
  if (!u || !Array.isArray(u.segs) || u.segs.length === 0) return;
  const root = u.segs[0];
  if (u.segs.length === 1) {
    if (u.del) { domains.delete(root); return; }
    domains.set(root, deepAssignInPlace(domains.get(root), u.v, touched));
    return;
  }
  let node = domains.get(root);
  if (u.del) {
    if (!isCanonicalObject(node)) return;
    for (let i = 1; i < u.segs.length - 1; i++) {
      node = node[u.segs[i]];
      if (!isCanonicalObject(node)) return;
    }
    delete node[u.segs[u.segs.length - 1]];
    return;
  }
  if (!isCanonicalObject(node)) {
    node = {};
    domains.set(root, node);
  }
  for (let i = 1; i < u.segs.length - 1; i++) {
    let next = node[u.segs[i]];
    if (!isCanonicalObject(next)) {
      next = {};
      node[u.segs[i]] = next;
    }
    node = next;
  }
  const last = u.segs[u.segs.length - 1];
  node[last] = deepAssignInPlace(node[last], u.v, touched);
}

// Runner-side probe replay: walks the facade map with the same expansion rules
// the differ applies to live state and digests every leaf path. Set-equality of
// paths plus digest equality is gate F2.
export function facadeDomainProbe(domains, scratch) {
  const probe = {};
  for (const key of DOMAIN_MIRROR_KEYS) {
    if (!domains.has(key)) continue;
    walkFacade(domains.get(key), key, [key], probe, scratch);
  }
  return probe;
}

function walkFacade(v, path, segs, probe, scratch) {
  if (isCanonicalObject(v) && segs.length - 1 < expandDepthFor(segs)) {
    for (const k of Object.keys(v)) {
      walkFacade(v[k], `${path}.${k}`, segs.concat(k), probe, scratch);
    }
    return;
  }
  probe[path] = domainSigDigest(canonicalSignature(v, scratch));
}

// Resolve a dotted leaf path to the facade value's probe digest (undefined
// when the facade does not hold the path).
function facadeDigestAt(domains, segs, scratch) {
  let node = domains.get(segs[0]);
  for (let i = 1; i < segs.length; i++) {
    if (node == null || typeof node !== 'object') return undefined;
    node = node[segs[i]];
  }
  return domainSigDigest(canonicalSignature(node, scratch));
}

// Runner-side probe consumer: mirrors the worker's slot table from add/remove
// entries and verifies shipped digests against the facades. Between sweeps it
// re-signs only the paths the worker probed (the ones that changed); a sweep
// re-verifies every facade leaf and checks for extra facade paths.
export function createDomainProbeChecker(domains) {
  const slotSegs = [];
  const slotPath = [];
  const scratch = {};
  let gen = 0;
  return {
    consume(probe) {
      const res = { checks: 0, sweep: !!probe.sweep, events: [] };
      if (!probe) return res;
      if (Number.isSafeInteger(probe.gen) && probe.gen > gen) gen = probe.gen;
      for (const slot of probe.r || []) { slotSegs[slot] = null; slotPath[slot] = null; }
      for (const [slot, segs] of probe.a || []) {
        slotSegs[slot] = segs;
        slotPath[slot] = segs.join('.');
      }
      if (probe.sweep) {
        const facadeProbe = facadeDomainProbe(domains, scratch);
        const livePaths = new Set();
        for (const p of slotPath) if (p != null) livePaths.add(p);
        for (const path of Object.keys(facadeProbe)) {
          if (!livePaths.has(path)) {
            res.checks++;
            res.events.push({ kind: 'extra-facade-path', path });
          }
        }
        for (let i = 0; i < probe.s.length; i++) {
          const path = slotPath[probe.s[i]];
          res.checks++;
          if (path == null) {
            res.events.push({ kind: 'unbound-slot', slot: probe.s[i], liveDigest: probe.h[i] });
            continue;
          }
          const model = facadeProbe[path];
          if (model === undefined) {
            res.events.push({ kind: 'missing-facade-path', path, liveDigest: probe.h[i] });
          } else if (model !== probe.h[i]) {
            res.events.push({ kind: 'digest', path, modelDigest: model, liveDigest: probe.h[i] });
          }
        }
        return res;
      }
      for (let i = 0; i < probe.s.length; i++) {
        const segs = slotSegs[probe.s[i]];
        res.checks++;
        if (segs == null) {
          res.events.push({ kind: 'unbound-slot', slot: probe.s[i], liveDigest: probe.h[i] });
          continue;
        }
        const model = facadeDigestAt(domains, segs, scratch);
        if (model === undefined) {
          res.events.push({ kind: 'missing-facade-path', path: segs.join('.'), liveDigest: probe.h[i] });
        } else if (model !== probe.h[i]) {
          res.events.push({ kind: 'digest', path: segs.join('.'), modelDigest: model, liveDigest: probe.h[i] });
        }
      }
      return res;
    },
  };
}

// Facade accessor — the post-flip stand-in for `state.<key>` /
// `state.world.<sub>` reads. Undefined before the first ship (or when the live
// value itself is opaque/undefined).
export function readModelDomain(readModel, key) {
  return readModel && readModel.domains ? readModel.domains.get(key) : undefined;
}
