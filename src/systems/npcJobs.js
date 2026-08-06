// npcJobs — deterministic, serializable NPC job-state kernel (PQ-014 / SF-15 / W06).
//
// WHAT THIS IS: a PURE LIBRARY of plain serializable job records and the functions that create,
// validate, advance, interrupt, resume, virtualize, materialize, and serialize them. Its SIX job
// kinds are six genuinely different phase graphs, not six labels on one machine: cyclic field work
// (miner), one-shot payload delivery (hauler), cyclic scheduled patrol, a circuit that measures at
// every stop instead of dwelling (surveyor), a shuttle that severs and then separately wrangles what
// it severed (salvor), and the only cycle that re-undocks for each call-out and never touches cargo
// at all (tender). test/npc-jobs-working-trades.test.mjs enforces that distinctness directly: strip
// the labels off a phase trace and you must still be able to tell which trade produced it.
//
// WHAT THIS IS NOT: it is not a registered system, not a scheduler, not an entity spawner, and not
// an owner of any single-writer state. It emits bounded, sequence-stamped INTENTS through a
// caller-provided sink; it never writes cargo, credits, reputation, heat, economy, factions, the
// registry, or a bus. The owning systems (encounterDirector for spawning/materialization, sectorSim
// for virtualization, tacticalAI/aiPorts for movement, the save owner for persistence) remain the
// single writers. Integration is a later packet; this file wires nothing into the live game.
//
// ─── The one invariant that shapes every line ─────────────────────────────────────────────────────
//
// ADVANCEMENT IS DECOMPOSABLE. For any job j and times a,b >= 0:
//     advance(j, a) then advance(j, b)  ==  advance(j, a + b)
// in BOTH final state AND the concatenated intent stream. This holds because (1) progress within a
// phase is strictly linear in dt, (2) phase transitions fire exactly once on the boundary where
// progress reaches 1.0, and (3) NO RANDOMNESS and NO WALL TIME is consulted during stepping — the
// only RNG draws happen once at commission and are frozen into the serializable record.
//
// Decomposability is why the offscreen/onscreen equivalence is free: the owning system may step a
// materialized job at the fixed 1/60 sim rate, or virtualize it and step the whole elapsed interval
// in one aggregated call — both produce the identical phase, progress, route position, payload, and
// intent sequence. There is no second code path to keep in agreement.
//
// ─── Determinism ──────────────────────────────────────────────────────────────────────────────────
// No Math.random, no Date.now, no timers, no wall time. Per-job variance is a single uint32
// `rngSeed` drawn at creation via drawSeeded (../core/rng.js) and advanced only when the owning
// integration explicitly asks for a roll; the kernel's own advance() path never draws. simTime is
// carried on the record (job.simTime) and advanced by dt, never read from a clock.
//
// ─── Safety ───────────────────────────────────────────────────────────────────────────────────────
// normalizeJob() heals every numeric field (NaN→0, negatives→0, >1→1) and remaps an unknown phase to
// a legal restart. A record whose KIND or ROUTE is unrecoverable is marked `corrupt: true`; advance,
// materialize, and routePosition then fail safe (no-op / null) so a bad save can never move an NPC
// to an unrelated origin or spawn a convoy from nowhere.

import { drawSeeded, hash32 } from '../core/rng.js';

export const NPC_JOB_SCHEMA = 'npc_jobs_v1';

/** The job kinds. Each has a distinct phase graph (see PHASE_GRAPHS below). */
export const NPC_JOB_KIND = Object.freeze({
  MINER: 'miner',
  HAULER: 'hauler',
  PATROL: 'patrol',
  // Added with the working-trades wave. Each is a STRUCTURALLY different graph, not a relabelling —
  // see PHASE_GRAPHS. The test that matters is whether you can tell two kinds apart from the phase
  // sequence alone with the labels stripped off; three kinds that all read
  // commission/transit/approach/work/return are one kind wearing three hats.
  SURVEYOR: 'surveyor',
  SALVOR: 'salvor',
  TENDER: 'tender',
});

/**
 * The phase vocabulary. Not every kind visits every phase; the per-kind graphs below are the law.
 * `flee` and `complete` are the only phases advance() will not auto-leave: flee waits for resume(),
 * complete is terminal. Every other phase has exactly one successor.
 */
export const NPC_JOB_PHASE = Object.freeze({
  COMMISSION: 'commission',
  DEPART: 'depart',
  TRANSIT: 'transit',
  APPROACH: 'approach',
  WORK: 'work',
  LOAD: 'load',
  UNLOAD: 'unload',
  RETURN: 'return',
  HOLD: 'hold',
  FLEE: 'flee',
  COMPLETE: 'complete',
});

const LEGAL_KINDS = new Set(Object.values(NPC_JOB_KIND));
const LEGAL_PHASES = new Set(Object.values(NPC_JOB_PHASE));

// ─── Authorable defaults (overridable per-job in the spec) ────────────────────────────────────────
// Speeds in world-units/sec; durations in seconds. These are KERNEL planning constants used only to
// turn route geometry into phase durations — they are not movement commands. The owning movement
// system flies the materialized entity; the kernel merely decides WHEN each phase ends.
// Planning speeds, wu/s. Ordering encodes the trades: a survey rig crawls because it is measuring
// while it moves; a salvor is a barge dragging cut plate; a tender is quick off the berth because
// somebody is venting. These only turn leg geometry into durations — they are not movement commands.
const DEFAULT_SPEED = {
  miner: 60, hauler: 45, patrol: 80,
  surveyor: 34, salvor: 40, tender: 66,
};
/**
 * How long a stop at the work face lasts, per kind, in seconds.
 *
 * This table exists because its absence was a SILENT skip, not a visible bug. `workS` previously
 * defaulted to 30 for miners and to MIN_PHASE_S (one millisecond) for everything else, so a kind
 * whose whole identity is what it does while stopped would enter WORK, complete it inside a single
 * tick, and leave — producing a phase trace of `approach -> load` with no work in it at all. The
 * job still ran, the intents still fired, and nothing anywhere reported a problem.
 *
 * Durations are the trades' own, from design/fiction/THE_WORKING_TRADES.md: a survey stop is
 * "pulse, wait, pulse, log"; cutting a hull apart is the longest single act on any shift; a weld
 * call-out outlasts it because you cannot rush a seal somebody has to breathe behind.
 */
const DEFAULT_WORK_S = {
  miner: 30, surveyor: 22, salvor: 40, tender: 45,
};
/** Work duration for a kind, or a floor for kinds that have no work phase at all. */
function defaultWorkS(kind) {
  return DEFAULT_WORK_S[kind] || MIN_PHASE_S;
}
const DEFAULT_COMMISSION_S = 2;
const DEFAULT_DEPART_S = 3;
const DEFAULT_APPROACH_S = 4;
const DEFAULT_LOAD_S = 8;
const DEFAULT_UNLOAD_S = 6;
const DEFAULT_DWELL_S = 12; // patrol schedule hold at each waypoint
const MIN_PHASE_S = 1e-3; // floor so a zero-length leg still yields a legal, finite duration
/**
 * Safety valve on phase transitions inside a single advance() call. Bounds a pathologically large dt
 * (e.g. a corrupt simTime delta) so the loop cannot run forever. Real gameplay NEVER reaches this:
 * a 60 Hz tick advances one phase at most a few times per second, and even a multi-second offscreen
 * aggregated step crosses at most (dt / MIN_PHASE_S) ≈ 1000 transitions/second of authored phases.
 *
 * When the cap DOES bind (a malformed/huge dt), advance() stops HONESTLY: it sets simTime to the last
 * crossing it actually processed (NEVER past it), leaves the unprocessed remainder, emits a
 * `truncated` intent describing the shortfall, and returns. The caller may resume with
 * advance(job, remaining). This is the opposite of silently advancing the clock while discarding
 * transitions — which would break decomposability (advance(a)+advance(b) would disagree with
 * advance(a+b) whenever one path hit the cap and the other didn't).
 */
const MAX_TRANSITIONS_PER_ADVANCE = 100000;
/** Float-noise tolerance for "has dt reached the phase boundary?". A dt that lands on the boundary
 *  to within this (scaled by phase duration) is treated as a boundary crossing so the completion
 *  intent fires exactly once, instead of dangling at progress 0.9999999999 forever. */
const BOUNDARY_EPS = 1e-9;

/**
 * The phase graph per kind. Miner and patrol are CYCLIC (loopCount increments per circuit and they
 * re-enter transit); hauler is ONE-SHOT (terminates in `complete`). The graphs differ structurally:
 *   • miner   — alternates home↔field, with WORK at the field and UNLOAD at home, forever.
 *   • hauler  — origin → (LOAD) → transit chain → destination → UNLOAD → COMPLETE. Linear, terminal.
 *   • patrol  — cyclic over N waypoints with a scheduled HOLD (dwell) at each, wrapping around.
 * `next` is a function of the job so routeIndex bookkeeping stays inside the transition. */
const PHASE_GRAPHS = {
  miner: {
    start: NPC_JOB_PHASE.COMMISSION,
    next: {
      [NPC_JOB_PHASE.COMMISSION]: NPC_JOB_PHASE.TRANSIT,
      [NPC_JOB_PHASE.TRANSIT]: NPC_JOB_PHASE.APPROACH,
      [NPC_JOB_PHASE.APPROACH]: NPC_JOB_PHASE.WORK,
      [NPC_JOB_PHASE.WORK]: NPC_JOB_PHASE.RETURN,
      [NPC_JOB_PHASE.RETURN]: NPC_JOB_PHASE.APPROACH,
      // APPROACH after RETURN goes to UNLOAD only when we have arrived home (see _transitionMiner).
      [NPC_JOB_PHASE.UNLOAD]: NPC_JOB_PHASE.TRANSIT,
    },
  },
  hauler: {
    start: NPC_JOB_PHASE.COMMISSION,
    next: {
      [NPC_JOB_PHASE.COMMISSION]: NPC_JOB_PHASE.LOAD,
      [NPC_JOB_PHASE.LOAD]: NPC_JOB_PHASE.DEPART,
      [NPC_JOB_PHASE.DEPART]: NPC_JOB_PHASE.TRANSIT,
      [NPC_JOB_PHASE.TRANSIT]: NPC_JOB_PHASE.APPROACH,
      [NPC_JOB_PHASE.APPROACH]: NPC_JOB_PHASE.UNLOAD,
      [NPC_JOB_PHASE.UNLOAD]: NPC_JOB_PHASE.COMPLETE,
    },
  },
  patrol: {
    start: NPC_JOB_PHASE.COMMISSION,
    next: {
      [NPC_JOB_PHASE.COMMISSION]: NPC_JOB_PHASE.TRANSIT,
      [NPC_JOB_PHASE.TRANSIT]: NPC_JOB_PHASE.APPROACH,
      [NPC_JOB_PHASE.APPROACH]: NPC_JOB_PHASE.HOLD,
      [NPC_JOB_PHASE.HOLD]: NPC_JOB_PHASE.TRANSIT,
    },
  },
  // ── The working-trades wave ─────────────────────────────────────────────────────────────────────
  // Each graph below differs from all three originals in SHAPE, and each shape is the trade's actual
  // working day rather than a route with a different label on it.
  //
  //   surveyor — a patrol that WORKS its marks instead of holding them. Same modulo-N circuit, but
  //              every stop is a measurement, so the phase that ends a stop is WORK and there is no
  //              scheduled dwell at all. "Reading the dark" (THE WORKING LIGHT §2): pulse, move,
  //              pulse. It never carries and never unloads, which is why it has no LOAD/UNLOAD edge.
  //   salvor   — a miner that must LIFT what it cut. Same home<->site toggle, but WORK (cutting the
  //              hull apart) and LOAD (getting the piece aboard) are separate acts with separate
  //              durations, because on a wreck they genuinely are: you sever, then you wrangle.
  //              That LOAD between WORK and RETURN is the whole structural difference from a barge.
  //   tender   — the only cycle carrying DEPART, and the only one with no cargo phase whatsoever.
  //              A repair rig re-undocks for every call-out, welds on the client's hull, and comes
  //              home with nothing: the Code's "hull open" entry is explicit that repair ADDS
  //              material, which is why there is no ejecta and no unload to model.
  surveyor: {
    start: NPC_JOB_PHASE.COMMISSION,
    next: {
      [NPC_JOB_PHASE.COMMISSION]: NPC_JOB_PHASE.TRANSIT,
      [NPC_JOB_PHASE.TRANSIT]: NPC_JOB_PHASE.APPROACH,
      [NPC_JOB_PHASE.APPROACH]: NPC_JOB_PHASE.WORK,
      [NPC_JOB_PHASE.WORK]: NPC_JOB_PHASE.TRANSIT,
    },
  },
  salvor: {
    start: NPC_JOB_PHASE.COMMISSION,
    next: {
      [NPC_JOB_PHASE.COMMISSION]: NPC_JOB_PHASE.TRANSIT,
      [NPC_JOB_PHASE.TRANSIT]: NPC_JOB_PHASE.APPROACH,
      // APPROACH forks on arrival — wreck (idx 1) cuts, home (idx 0) unloads. See successorPhase.
      [NPC_JOB_PHASE.WORK]: NPC_JOB_PHASE.LOAD,
      [NPC_JOB_PHASE.LOAD]: NPC_JOB_PHASE.RETURN,
      [NPC_JOB_PHASE.RETURN]: NPC_JOB_PHASE.APPROACH,
      [NPC_JOB_PHASE.UNLOAD]: NPC_JOB_PHASE.TRANSIT,
    },
  },
  tender: {
    start: NPC_JOB_PHASE.COMMISSION,
    next: {
      [NPC_JOB_PHASE.COMMISSION]: NPC_JOB_PHASE.DEPART,
      [NPC_JOB_PHASE.DEPART]: NPC_JOB_PHASE.TRANSIT,
      [NPC_JOB_PHASE.TRANSIT]: NPC_JOB_PHASE.APPROACH,
      // APPROACH forks — client (idx 1) welds, home berth (idx 0) re-departs for the next call-out.
      [NPC_JOB_PHASE.WORK]: NPC_JOB_PHASE.RETURN,
      [NPC_JOB_PHASE.RETURN]: NPC_JOB_PHASE.APPROACH,
    },
  },
};

/**
 * The set of phases each kind may legally occupy. Derived from the graph (start + every successor)
 * plus FLEE (reachable from any phase via interrupt) so it can never drift from the graph. A phase
 * outside this set for the given kind is a corrupt save combination (e.g. miner with phase=LOAD,
 * patrol with phase=WORK) and normalizeJob heals it back to the kind's start rather than letting
 * advance() emit a phase-completion intent for a phase that kind can never reach.
 */
const LEGAL_PHASES_BY_KIND = Object.fromEntries(
  Object.entries(PHASE_GRAPHS).map(([kind, graph]) => {
    const set = new Set([graph.start, NPC_JOB_PHASE.FLEE]);
    for (const [from, to] of Object.entries(graph.next)) {
      set.add(from);
      set.add(to);
    }
    return [kind, set];
  }),
);

// ─── Small pure helpers ───────────────────────────────────────────────────────────────────────────

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

/** Finite AND non-negative — used for simTime, which must never go backwards even from a bad save. */
function nonNegFinite(value, fallback = 0) {
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/**
 * Round a float to a 1e-6 grid for the READ SEAM (serialization, public summaries, test comparison).
 *
 * WHY THIS IS AT THE SEAM, NOT IN THE MATH: advance() keeps progress and simTime in full double
 * precision so that decomposability — advance(a);advance(b) ≡ advance(a+b) — holds to ~1e-16 (float
 * assoc error) rather than drifting from a per-step snap. The residual ~1e-16 noise is real but
 * invisible; callers that need byte-stable values (a save round-trip asserting deepEqual, a test
 * comparing two runs) round here. This is the standard deterministic-sim pattern: float inside,
 * rounded projection outside.
 */
export function snapFloat(value) {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  return Math.round(value * 1e6) / 1e6;
}

/**
 * Payload JSON-safety contract. A job's payload is the cargo descriptor the owning cargo owner will
 * apply; it MUST be plain JSON-safe data (no cycles, no functions, no class instances, no undefined)
 * because it is (a) emitted inside intents that callers may serialize, (b) deep-cloned into the save
 * record, and (c) compared byte-for-byte in tests. A cyclic or non-JSON payload would alias into
 * intents (letting a sink mutate authoritative job state) and throw serializeJob. We validate at the
 * creation/restore seam and reject (null out) anything that fails, so the kernel never carries a
 * payload it cannot serialize.
 */
const MAX_PAYLOAD_DEPTH = 32;
export function isJSONSafe(value, seen = new WeakSet(), depth = 0) {
  if (depth > MAX_PAYLOAD_DEPTH) return false;
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return true;
  if (typeof value === 'string') return true;
  if (typeof value !== 'object') return false; // functions, symbols, bigint, undefined → reject
  if (Array.isArray(value)) {
    if (seen.has(value)) return false; // cycle
    seen.add(value);
    for (const v of value) if (!isJSONSafe(v, seen, depth + 1)) return false;
    return true;
  }
  // plain object only (reject class instances, Maps, Sets, Dates, etc.)
  if (Object.getPrototypeOf(value) !== Object.prototype && value.constructor !== Object) return false;
  if (seen.has(value)) return false; // cycle
  seen.add(value);
  for (const k of Object.keys(value)) {
    if (!isJSONSafe(value[k], seen, depth + 1)) return false;
  }
  return true;
}

/** Deep-clone a value via JSON round-trip. Caller MUST guarantee isJSONSafe first (we assert it so a
 *  future payload that breaks the contract fails loudly at the seam, not silently aliases). */
function cloneJSON(value) {
  if (value === null || value === undefined) return null;
  // isJSONSafe is the contract gate; if it ever returns false here the caller bypassed the seam.
  if (!isJSONSafe(value)) return null;
  return JSON.parse(JSON.stringify(value));
}

/**
 * Coerce an arbitrary input payload into the JSON-safe contract or null. Used at every seam where a
 * payload enters the kernel (createJob, normalizeJob). A payload that is missing, not an object, or
 * not JSON-safe (cyclic, has functions/class instances/undefined) is rejected as null so the kernel
 * never carries a payload it cannot serialize or that could alias through emit(). The optional
 * `healed` array records the rejection reason for diagnostics.
 */
function sanitizePayload(input, healed = null) {
  if (input === null || input === undefined) return null;
  if (typeof input !== 'object' || Array.isArray(input)) {
    if (healed) healed.push('payload:not-plain-object');
    return null;
  }
  if (!isJSONSafe(input)) {
    if (healed) healed.push('payload:not-json-safe');
    return null;
  }
  return cloneJSON(input);
}

function isPlainPos(p) {
  return !!p && Number.isFinite(p.x) && Number.isFinite(p.z);
}

function dist2D(a, b) {
  return Math.hypot(b.x - a.x, b.z - a.z);
}

/** Normalize an authored route into waypoint records. Rejects anything that is not an ordered list
 *  of at least two positions with finite x/z. Returns null if the route cannot be salvaged. */
function normalizeRoute(input) {
  if (!Array.isArray(input)) return null;
  const out = [];
  for (let i = 0; i < input.length; i++) {
    const w = input[i];
    const pos = w && typeof w === 'object' ? w.pos : null;
    if (!isPlainPos(pos)) return null;
    const id = typeof w.id === 'string' && w.id.length ? w.id : `wp${i}`;
    out.push({ id, pos: { x: finite(pos.x), z: finite(pos.z) }, label: typeof w.label === 'string' ? w.label : id });
  }
  return out.length >= 2 ? out : null;
}

// ─── Validation ───────────────────────────────────────────────────────────────────────────────────

/**
 * Validate a creation spec without building a job. Returns { ok, errors }.
 * A valid spec needs: a legal kind, a string id, and a route of >= 2 finite waypoints. Patrol routes
 * additionally need >= 2 waypoints to form a circuit (enforced by normalizeRoute's >= 2 rule).
 */
export function validateJobSpec(spec) {
  const errors = [];
  if (!spec || typeof spec !== 'object') {
    return { ok: false, errors: ['spec must be an object'] };
  }
  if (!LEGAL_KINDS.has(spec.kind)) errors.push(`unknown kind "${spec.kind}"`);
  if (typeof spec.id !== 'string' || spec.id.length === 0) errors.push('id must be a non-empty string');
  const route = normalizeRoute(spec.route);
  if (!route) errors.push('route must be an ordered list of >= 2 waypoints each with finite {x,z}');
  if (spec.kind === NPC_JOB_KIND.HAULER) {
    // hauler is one-shot; an explicit payload describes the intended cargo intent (applied by the
    // cargo owner, never by this kernel). Missing payload is allowed (the owning loop fills it).
  }
  return { ok: errors.length === 0, errors };
}

// ─── Job creation & normalization ─────────────────────────────────────────────────────────────────

function baseRecord(spec, route) {
  const kind = spec.kind;
  const speed = Math.max(finite(spec.speed, DEFAULT_SPEED[kind] || 60), MIN_PHASE_S);
  return {
    schema: NPC_JOB_SCHEMA,
    id: spec.id,
    kind,
    phase: PHASE_GRAPHS[kind].start,
    routeIndex: 0,
    progress: 0,
    loopCount: 0,
    sequence: 0,
    simTime: finite(spec.simTime, 0),
    rngSeed: 0, // filled below
    heading: 0,
    materialized: spec.materialized !== false, // default on-screen until the owner virtualizes
    interrupted: false,
    preInterruptPhase: null,
    corrupt: false,
    healed: [],
    // authorable planning constants (kernel-only; not movement commands)
    speed,
    commissionS: Math.max(finite(spec.commissionS, DEFAULT_COMMISSION_S), MIN_PHASE_S),
    departS: Math.max(finite(spec.departS, DEFAULT_DEPART_S), MIN_PHASE_S),
    approachS: Math.max(finite(spec.approachS, DEFAULT_APPROACH_S), MIN_PHASE_S),
    workS: Math.max(finite(spec.workS, defaultWorkS(kind)) || MIN_PHASE_S, MIN_PHASE_S),
    loadS: Math.max(finite(spec.loadS, DEFAULT_LOAD_S), MIN_PHASE_S),
    unloadS: Math.max(finite(spec.unloadS, DEFAULT_UNLOAD_S), MIN_PHASE_S),
    dwellS: Math.max(finite(spec.dwellS, DEFAULT_DWELL_S), MIN_PHASE_S),
    route,
    payload: sanitizePayload(spec.payload),
  };
}

/**
 * Create a fresh job from a spec. Deterministic given (spec.id, spec.kind, spec.route, masterSeed):
 * two calls with identical inputs produce byte-identical records (rngSeed derived via hash32).
 * The job starts in its kind's start phase (commission) with zero progress.
 */
export function createJob(spec, masterSeed = 0) {
  const v = validateJobSpec(spec);
  if (!v.ok) {
    throw new Error(`createJob: invalid spec: ${v.errors.join('; ')}`);
  }
  const route = normalizeRoute(spec.route);
  const job = baseRecord(spec, route);
  // Per-job seed: stable from (masterSeed, id, kind). drawSeeded writes the advanced seed back onto
  // the record so future explicit rolls (by the owning integration) advance it deterministically.
  const seedRoot = hash32(masterSeed, job.id, job.kind);
  drawSeeded(job, 'rngSeed', seedRoot || 1);
  job.heading = headingToward(job, route[0].pos, route[1].pos);
  return job;
}

/**
 * Normalize an arbitrary input (e.g. a restored save) into a legal, advanceable job record.
 *  - Heals every numeric field: NaN/negative/>1 progress → clamped; bad routeIndex → 0.
 *  - Remaps an unknown phase to the kind's start phase (a safe restart of the legal machine).
 *  - A missing/unknown kind, missing id, or unsalvageable route is unrecoverable: the record is
 *    returned with `corrupt: true`, and advance/materialize/routePosition treat it as a no-op so a
 *    corrupt save can never move an NPC or duplicate its intents.
 * Idempotent: normalizeJob(normalizeJob(x)) deep-equals normalizeJob(x).
 */
export function normalizeJob(input) {
  if (!input || typeof input !== 'object') {
    return { schema: NPC_JOB_SCHEMA, id: null, kind: null, corrupt: true, healed: ['non-object'] };
  }
  const kind = LEGAL_KINDS.has(input.kind) ? input.kind : null;
  const id = typeof input.id === 'string' && input.id.length ? input.id : null;
  const route = normalizeRoute(input.route);

  // Unrecoverable: mark corrupt but still echo back a record the caller can recognize and drop.
  if (!kind || !id || !route) {
    return {
      schema: NPC_JOB_SCHEMA,
      id,
      kind,
      route: route || [],
      phase: NPC_JOB_PHASE.COMMISSION,
      routeIndex: 0,
      progress: 0,
      loopCount: 0,
      sequence: finite(input.sequence, 0),
      simTime: nonNegFinite(input.simTime, 0),
      rngSeed: finite(input.rngSeed, 0) >>> 0,
      heading: 0,
      materialized: input.materialized !== false,
      interrupted: false,
      preInterruptPhase: null,
      corrupt: true,
      healed: [!kind && 'kind', !id && 'id', !route && 'route'].filter(Boolean),
      speed: finite(input.speed, 60),
      commissionS: Math.max(finite(input.commissionS, DEFAULT_COMMISSION_S), MIN_PHASE_S),
      departS: Math.max(finite(input.departS, DEFAULT_DEPART_S), MIN_PHASE_S),
      approachS: Math.max(finite(input.approachS, DEFAULT_APPROACH_S), MIN_PHASE_S),
      workS: Math.max(finite(input.workS, MIN_PHASE_S), MIN_PHASE_S),
      loadS: Math.max(finite(input.loadS, DEFAULT_LOAD_S), MIN_PHASE_S),
      unloadS: Math.max(finite(input.unloadS, DEFAULT_UNLOAD_S), MIN_PHASE_S),
      dwellS: Math.max(finite(input.dwellS, DEFAULT_DWELL_S), MIN_PHASE_S),
      payload: sanitizePayload(input.payload),
    };
  }

  const healed = [];
  // Validate phase against THIS KIND's graph (not the global phase vocabulary). A miner with
  // phase=LOAD or a patrol with phase=WORK is a corrupt kind/phase combination: that kind can never
  // reach that phase, so advancing it would emit a completion intent for an impossible phase. Heal
  // back to the kind's start rather than honoring the bogus phase.
  const legalForKind = LEGAL_PHASES_BY_KIND[kind];
  let phase = legalForKind.has(input.phase) ? input.phase : PHASE_GRAPHS[kind].start;
  if (!legalForKind.has(input.phase)) healed.push(`phase:${input.phase}:illegal-for-kind:${kind}`);
  if (phase === NPC_JOB_PHASE.FLEE && !input.interrupted) {
    // a flee phase without an interrupted flag is inconsistent → restart the legal machine
    phase = PHASE_GRAPHS[kind].start;
    healed.push('flee-without-interrupt');
  }
  const speed = Math.max(finite(input.speed, DEFAULT_KIND_SPEED(kind)), MIN_PHASE_S);

  const job = {
    schema: NPC_JOB_SCHEMA,
    id,
    kind,
    phase,
    routeIndex: Number.isInteger(input.routeIndex) && input.routeIndex >= 0 && input.routeIndex < route.length
      ? input.routeIndex
      : (healed.push('routeIndex'), 0),
    progress: clamp01(input.progress),
    loopCount: Math.max(0, Number.isInteger(input.loopCount) ? input.loopCount : 0),
    sequence: Math.max(0, Number.isInteger(input.sequence) ? input.sequence : 0),
    simTime: nonNegFinite(input.simTime, 0),
    rngSeed: finite(input.rngSeed, 0) >>> 0,
    heading: finite(input.heading, 0),
    materialized: input.materialized !== false,
    interrupted: input.interrupted === true,
    // preInterruptPhase must be a non-FLEE phase legal for this kind (fleeing resumes to a real phase)
    preInterruptPhase: input.preInterruptPhase !== NPC_JOB_PHASE.FLEE && legalForKind.has(input.preInterruptPhase)
      ? input.preInterruptPhase
      : null,
    corrupt: false,
    healed,
    speed,
    commissionS: Math.max(finite(input.commissionS, DEFAULT_COMMISSION_S), MIN_PHASE_S),
    departS: Math.max(finite(input.departS, DEFAULT_DEPART_S), MIN_PHASE_S),
    approachS: Math.max(finite(input.approachS, DEFAULT_APPROACH_S), MIN_PHASE_S),
    workS: Math.max(finite(input.workS, defaultWorkS(kind)), MIN_PHASE_S),
    loadS: Math.max(finite(input.loadS, DEFAULT_LOAD_S), MIN_PHASE_S),
    unloadS: Math.max(finite(input.unloadS, DEFAULT_UNLOAD_S), MIN_PHASE_S),
    dwellS: Math.max(finite(input.dwellS, DEFAULT_DWELL_S), MIN_PHASE_S),
    route,
    payload: sanitizePayload(input.payload, healed),
  };
  return job;
}

function DEFAULT_KIND_SPEED(kind) {
  return DEFAULT_SPEED[kind] || 60;
}

/** restoreJob is the save-owner alias for normalizeJob (clear intent at the persistence seam). */
export function restoreJob(input) {
  return normalizeJob(input);
}

// ─── Route geometry (shared by all kinds) ─────────────────────────────────────────────────────────

/**
 * The index this job is currently sitting at (just arrived, or about to leave). Always a valid index
 * into job.route. For miner this toggles 0/1 (home/field); hauler advances forward; patrol wraps.
 */
function originIndex(job) {
  return job.routeIndex;
}

/**
 * The index the current transit/return leg is heading toward. Kind-specific:
 *   miner   — the OTHER endpoint of its two-way hop (0↔1).
 *   hauler  — routeIndex + 1, clamped (the destination is the final waypoint).
 *   patrol  — (routeIndex + 1) % route.length.
 * Returns null when the job has no further leg (hauler at destination).
 */
function targetIndex(job) {
  const n = job.route.length;
  // Two-point shuttles (home <-> site) toggle; circuit walkers wrap.
  if (job.kind === NPC_JOB_KIND.MINER
    || job.kind === NPC_JOB_KIND.SALVOR
    || job.kind === NPC_JOB_KIND.TENDER) return job.routeIndex === 0 ? 1 : 0;
  if (job.kind === NPC_JOB_KIND.PATROL || job.kind === NPC_JOB_KIND.SURVEYOR) {
    return (job.routeIndex + 1) % n;
  }
  // hauler: linear advance; null once we are at the final waypoint
  return job.routeIndex < n - 1 ? job.routeIndex + 1 : null;
}

function waypoint(job, i) {
  return i == null || i < 0 || i >= job.route.length ? null : job.route[i];
}

function headingToward(job, from, to) {
  if (!isPlainPos(from) || !isPlainPos(to)) return finite(job.heading, 0);
  return Math.atan2(to.z - from.z, to.x - from.x);
}

/**
 * The truthful world position of this job RIGHT NOW, derived from the route and current progress.
 * During transit/return the position is the linear interpolation along the active leg; at any
 * stationary phase it is the current waypoint. This is what makes virtualize/materialize continuous:
 * the same progress math runs offscreen, so a job materializing after a long offscreen interval
 * appears exactly where it would have been had it been stepped live — never teleported, never reset.
 */
export function routePosition(job) {
  if (!job || job.corrupt || !Array.isArray(job.route) || job.route.length < 2) return null;
  const phase = job.phase;
  if (phase === NPC_JOB_PHASE.TRANSIT || phase === NPC_JOB_PHASE.RETURN) {
    const o = waypoint(job, originIndex(job));
    const t = waypoint(job, targetIndex(job));
    if (!o || !t) return o ? { x: o.pos.x, z: o.pos.z } : null;
    const p = clamp01(job.progress);
    return { x: o.pos.x + (t.pos.x - o.pos.x) * p, z: o.pos.z + (t.pos.z - o.pos.z) * p };
  }
  // stationary phases (commission/depart/approach/work/load/unload/hold/flee/complete) sit at the
  // current waypoint. approach is a short final-close at the target, modeled as sitting at target.
  const here = waypoint(job, job.routeIndex);
  return here ? { x: here.pos.x, z: here.pos.z } : null;
}

// ─── Phase durations & progress ───────────────────────────────────────────────────────────────────

/** Seconds the current phase still needs at zero progress. Transit/return derive from geometry. */
function phaseDuration(job) {
  switch (job.phase) {
    case NPC_JOB_PHASE.COMMISSION:
      return job.commissionS;
    case NPC_JOB_PHASE.DEPART:
      return job.departS;
    case NPC_JOB_PHASE.APPROACH:
      return job.approachS;
    case NPC_JOB_PHASE.WORK:
      return job.workS;
    case NPC_JOB_PHASE.LOAD:
      return job.loadS;
    case NPC_JOB_PHASE.UNLOAD:
      return job.unloadS;
    case NPC_JOB_PHASE.HOLD:
      return job.dwellS;
    case NPC_JOB_PHASE.TRANSIT:
    case NPC_JOB_PHASE.RETURN: {
      const o = waypoint(job, originIndex(job));
      const t = waypoint(job, targetIndex(job));
      if (!o || !t) return job.approachS; // safety: degenerate leg → short finite duration
      const d = dist2D(o.pos, t.pos);
      return Math.max(d / job.speed, MIN_PHASE_S);
    }
    default:
      return MIN_PHASE_S; // flee/complete are not auto-left; advance() stops before reaching here
  }
}

// ─── Intent emission ──────────────────────────────────────────────────────────────────────────────

/**
 * Stamp and emit one intent. seq is monotonic per job → provably unique across the job's life.
 *
 * The payload is DEEP-CLONED into the intent (every nested object, including any `payload` cargo
 * descriptor). This is load-bearing: without it, an intent's nested object would be the SAME
 * reference as the job's, and a sink that mutates `intent.payload.meta` would mutate
 * `job.payload.meta` — corrupting authoritative state through a side channel. The clone also makes
 * the returned intent list safe for the caller to mutate freely.
 */
function emit(job, intents, sink, kind, payload) {
  const intent = { event: `npcjobs:${kind}`, jobId: job.id, kind: job.kind, seq: ++job.sequence, simTime: job.simTime };
  if (payload) {
    // Shallow-copy the top level (cheap) then deep-clone any nested payload/object fields that could
    // alias job state. Scalars (strings, numbers, booleans, null) and the top-level spread are safe.
    for (const key of Object.keys(payload)) {
      const v = payload[key];
      intent[key] = (v && typeof v === 'object') ? cloneJSON(v) : v;
    }
  }
  intents.push(intent);
  if (typeof sink === 'function') {
    try {
      sink(intent);
    } catch {
      /* a sink failure must never corrupt the deterministic record; swallow and continue. */
    }
  }
  return intent;
}

// ─── Phase transition (single-pass, no recursion) ────────────────────────────────────────────────
//
// Every transition is resolved by ONE call to transition(). It (1) emits the completion intent for
// the phase that just finished, (2) advances routeIndex / loopCount as the kind requires, and (3)
// selects the successor phase. There is no mutual recursion and no per-kind fallthrough: the kind's
// structural rules are inlined below so the whole machine is readable in one place. This is what
// makes miner / hauler / patrol genuinely different graphs rather than three labels on one loop.

/**
 * Advance routeIndex for a transit/return completion, per kind. Returns the new routeIndex. This is
 * the only place routeIndex moves forward; every other phase leaves it alone.
 *   miner   — toggles 0↔1 (home↔field). The just-finished leg's target becomes the new origin.
 *   hauler  — steps +1 along the linear chain (clamped at the final waypoint).
 *   patrol  — wraps modulo N.
 */
function advanceRouteIndex(job, finishedPhase) {
  const n = job.route.length;
  if (finishedPhase === NPC_JOB_PHASE.TRANSIT || finishedPhase === NPC_JOB_PHASE.RETURN) {
    if (job.kind === NPC_JOB_KIND.MINER
      || job.kind === NPC_JOB_KIND.SALVOR
      || job.kind === NPC_JOB_KIND.TENDER) {
      return job.routeIndex === 0 ? 1 : 0;
    }
    if (job.kind === NPC_JOB_KIND.PATROL || job.kind === NPC_JOB_KIND.SURVEYOR) {
      return (job.routeIndex + 1) % n;
    }
    // hauler: linear
    return job.routeIndex < n - 1 ? job.routeIndex + 1 : job.routeIndex;
  }
  return job.routeIndex;
}

function emitCompletionFor(job, intents, sink, finishedPhase) {
  const pos = routePosition(job);
  switch (finishedPhase) {
    case NPC_JOB_PHASE.COMMISSION:
      emit(job, intents, sink, 'commission', { phase: finishedPhase, at: waypoint(job, job.routeIndex)?.id || null });
      break;
    case NPC_JOB_PHASE.DEPART:
      emit(job, intents, sink, 'depart', { phase: finishedPhase, from: waypoint(job, job.routeIndex)?.id || null, pos });
      break;
    case NPC_JOB_PHASE.TRANSIT:
      emit(job, intents, sink, 'transit', { phase: finishedPhase, from: waypoint(job, originIndex(job))?.id || null, to: waypoint(job, targetIndex(job))?.id || null, pos, heading: job.heading });
      break;
    case NPC_JOB_PHASE.APPROACH:
      emit(job, intents, sink, 'approach', { phase: finishedPhase, target: waypoint(job, job.routeIndex)?.id || null, pos });
      break;
    case NPC_JOB_PHASE.WORK:
      // miner only. completed:true distinguishes the single completion from progress ticks.
      emit(job, intents, sink, 'work', { phase: finishedPhase, completed: true, field: waypoint(job, job.routeIndex)?.id || null, pos });
      break;
    case NPC_JOB_PHASE.LOAD:
      emit(job, intents, sink, 'load', { phase: finishedPhase, completed: true, origin: waypoint(job, job.routeIndex)?.id || null, payload: cloneJSON(job.payload), pos });
      break;
    case NPC_JOB_PHASE.UNLOAD:
      emit(job, intents, sink, 'unload', { phase: finishedPhase, completed: true, destination: waypoint(job, job.routeIndex)?.id || null, payload: cloneJSON(job.payload), pos });
      break;
    case NPC_JOB_PHASE.RETURN: {
      // RETURN completes on ARRIVAL at the destination (home for a miner). The `to` field must name
      // the destination actually reached (targetIndex), and `from` the origin the leg left. Using
      // routeIndex here would name the origin (field) and lie about where the job arrived.
      const from = waypoint(job, originIndex(job));
      const to = waypoint(job, targetIndex(job));
      emit(job, intents, sink, 'return', { phase: finishedPhase, from: from?.id || null, to: to?.id || null, pos });
      break;
    }
    case NPC_JOB_PHASE.HOLD:
      emit(job, intents, sink, 'hold', { phase: finishedPhase, completed: true, at: waypoint(job, job.routeIndex)?.id || null, pos });
      break;
    default:
      break;
  }
}

/**
 * Resolve the successor phase for a just-finished phase, applying the kind's structural rules. This
 * is where the three graphs genuinely diverge:
 *
 *   miner (cyclic two-place):
 *     commission→transit, transit→approach, approach→work|unload (WORK at field idx 1, UNLOAD at
 *     home idx 0), work→return, return→approach, unload→transit (loop++). Never terminates.
 *
 *   hauler (linear, terminal):
 *     commission→load, load→depart, depart→transit, transit→approach when the final waypoint is
 *     reached else transit→transit (advance routeIndex), approach→unload, unload→complete. Terminates.
 *
 *   patrol (cyclic N-place):
 *     commission→transit, transit→approach, approach→hold, hold→transit (wrap routeIndex, loop++ on
 *     wrap to 0). Never terminates.
 *
 * Mutates job.routeIndex / job.loopCount as needed and returns the new phase. Emits the loop `cycle`
 * marker exactly when a circuit completes (miner unload→transit, patrol wrap-to-0). The per-phase
 * completion intent is emitted by the caller (transition) BEFORE this runs.
 */
function successorPhase(job, finishedPhase, intents, sink) {
  const k = job.kind;
  const graph = PHASE_GRAPHS[k];

  // Transit/return first move the origin forward to the leg's target, then route to the successor.
  if (finishedPhase === NPC_JOB_PHASE.TRANSIT || finishedPhase === NPC_JOB_PHASE.RETURN) {
    job.routeIndex = advanceRouteIndex(job, finishedPhase);
  }

  // Kind-specific divergences (these are the structural differences, not labels):
  if (k === NPC_JOB_KIND.MINER) {
    if (finishedPhase === NPC_JOB_PHASE.APPROACH) {
      // Arrived at the field (idx 1) → mine; arrived home (idx 0) → unload.
      return job.routeIndex === 1 ? NPC_JOB_PHASE.WORK : NPC_JOB_PHASE.UNLOAD;
    }
    if (finishedPhase === NPC_JOB_PHASE.UNLOAD) {
      job.loopCount += 1;
      emit(job, intents, sink, 'cycle', { loopCount: job.loopCount, at: waypoint(job, 0)?.id || null });
      return NPC_JOB_PHASE.TRANSIT;
    }
  }
  if (k === NPC_JOB_KIND.HAULER) {
    if (finishedPhase === NPC_JOB_PHASE.TRANSIT) {
      // If we just arrived at the final waypoint, approach for unload; otherwise keep transiting.
      return job.routeIndex >= job.route.length - 1 ? NPC_JOB_PHASE.APPROACH : NPC_JOB_PHASE.TRANSIT;
    }
    if (finishedPhase === NPC_JOB_PHASE.UNLOAD) {
      return NPC_JOB_PHASE.COMPLETE;
    }
  }
  if (k === NPC_JOB_KIND.SURVEYOR) {
    if (finishedPhase === NPC_JOB_PHASE.WORK) {
      // A circuit closes when the next mark is the first one again — a survey sweep is only a sweep
      // once it has come back round, and that is what the crew logs.
      if (job.routeIndex === 0) {
        job.loopCount += 1;
        emit(job, intents, sink, 'cycle', { loopCount: job.loopCount, at: waypoint(job, 0)?.id || null });
      }
      return NPC_JOB_PHASE.TRANSIT;
    }
  }
  if (k === NPC_JOB_KIND.SALVOR) {
    if (finishedPhase === NPC_JOB_PHASE.APPROACH) {
      // Arrived at the wreck (idx 1) → cut; arrived home (idx 0) → put the pieces on the scales.
      return job.routeIndex === 1 ? NPC_JOB_PHASE.WORK : NPC_JOB_PHASE.UNLOAD;
    }
    if (finishedPhase === NPC_JOB_PHASE.UNLOAD) {
      job.loopCount += 1;
      emit(job, intents, sink, 'cycle', { loopCount: job.loopCount, at: waypoint(job, 0)?.id || null });
      return NPC_JOB_PHASE.TRANSIT;
    }
  }
  if (k === NPC_JOB_KIND.TENDER) {
    if (finishedPhase === NPC_JOB_PHASE.APPROACH) {
      // At the client (idx 1) → open the hull and weld. Back at the berth (idx 0) → the call-out is
      // over, so re-DEPART for the next one. That second DEPART is why a tender's cycle is visibly
      // different from a barge's: it undocks properly every single time.
      if (job.routeIndex === 1) return NPC_JOB_PHASE.WORK;
      job.loopCount += 1;
      emit(job, intents, sink, 'cycle', { loopCount: job.loopCount, at: waypoint(job, 0)?.id || null });
      return NPC_JOB_PHASE.DEPART;
    }
  }
  if (k === NPC_JOB_KIND.PATROL) {
    if (finishedPhase === NPC_JOB_PHASE.HOLD) {
      // wrap the circuit; count a loop when we return to waypoint 0
      if (job.routeIndex === 0) {
        job.loopCount += 1;
        emit(job, intents, sink, 'cycle', { loopCount: job.loopCount, at: waypoint(job, 0)?.id || null });
      }
      return NPC_JOB_PHASE.TRANSIT;
    }
  }
  // default: the static successor from the kind's graph
  return graph.next[finishedPhase] || NPC_JOB_PHASE.COMMISSION;
}

// ─── The canonical advance engine ─────────────────────────────────────────────────────────────────

/**
 * Advance a job by dt seconds. THIS IS THE WHOLE MACHINE. It is called for both materialized
 * (on-screen, fixed-step) and virtualized (offscreen, aggregated) jobs — there is no second path.
 *
 * Algorithm: while dt remains and the phase is auto-leavable, compute the seconds left in the
 * current phase from (1 - progress) * phaseDuration. If dt is less than that, advance progress
 * linearly and consume all dt. Otherwise burn the residual, set progress to exactly 1, emit the
 * phase-completion intent ONCE, transition to the successor phase (resetting progress to 0), and
 * continue with the leftover dt.
 *
 * Decomposability: progress is affine in dt within a phase; transitions are deterministic boundary
 * events with one emitted intent each; and simTime NEVER advances past the last transition that was
 * actually processed. Therefore for any a,b >= 0:
 *     advance(j,a); advance(j,b)  ≡  advance(j, a+b)
 * in final state and in the concatenation of the two returned intent lists, PROVIDED neither call
 * is truncated (see TRUNCATION below). When both stay under the cap, the proof is: the boundary
 * times and successor selections depend only on (phase, progress, routeIndex), which the two paths
 * visit in the same order, and simTime is set to the last crossing in both.
 *
 * TRUNCATION (the safety valve, honestly reported): a pathologically large dt can carry more
 * transitions than MAX_TRANSITIONS_PER_ADVANCE. Rather than silently advance the clock past the
 * unprocessed transitions (which would break decomposability and lie about how far the job got),
 * advance() stops at the cap: simTime is set to the LAST crossing actually processed, the unprocessed
 * remainder is left, and a `truncated` intent {requestedDt, processedDt, remainingDt} is emitted so
 * the caller can observe and resume with advance(job, remainingDt). Real gameplay never truncates;
 * the cap exists only to bound corrupt input. See `isTruncated(intent)`.
 *
 * @param {object} job   a record from createJob/normalizeJob
 * @param {number} dt    seconds to advance (>= 0); dt === 0 is a strict no-op
 * @param {(intent)=>void} [sink]  optional caller sink (e.g. a future bus bridge); never required
 * @returns {object[]} the intents emitted by this call, in order, each stamped with a unique seq.
 *                     The final intent may be a `truncated` marker if the transition cap was reached.
 */
export function advance(job, dt, sink) {
  if (!job || job.corrupt) return [];
  if (!Number.isFinite(dt) || dt < 0) return [];
  if (dt === 0) return []; // strict no-op; preserves decomposability at the boundary

  const base = nonNegFinite(job.simTime, 0);

  // FLEE and COMPLETE do not transition, but time still passes. simTime advances by the FULL dt here
  // because there are no transitions to discard — this is the one case where advancing past the last
  // (nonexistent) transition is honest, and it is what makes terminal-job decomposability hold.
  if (job.phase === NPC_JOB_PHASE.FLEE || job.phase === NPC_JOB_PHASE.COMPLETE) {
    job.simTime = base + dt;
    return [];
  }

  const intents = [];
  let remaining = dt;
  let transitions = 0;
  // simTime is set to each crossing as we process it. After the loop, simTime holds the last crossing
  // we actually reached — NEVER base+dt unless we processed the whole interval OR landed in a terminal
  // phase (where the remaining time passes harmlessly). This is the invariant that makes truncation
  // honest and decomposability exact.
  let lastCrossing = base;
  // Why the loop ended — distinguished so the post-loop logic can tell a legitimate terminal stop
  // (NOT truncation; remaining time passes) from a safety-valve stop (IS truncation; simTime freezes).
  let reachedTerminal = false;
  let degenerate = false; // a phase with non-finite/<=0 duration: the job is stuck, report it

  while (remaining > 0 && transitions < MAX_TRANSITIONS_PER_ADVANCE) {
    const phase = job.phase;
    if (phase === NPC_JOB_PHASE.FLEE || phase === NPC_JOB_PHASE.COMPLETE) { reachedTerminal = true; break; }

    const dur = phaseDuration(job);
    if (!Number.isFinite(dur) || dur <= 0) { degenerate = true; break; } // never divide by zero/NaN

    const leftInPhase = Math.max((1 - job.progress) * dur, 0);

    // Treat `remaining` within float-noise of `leftInPhase` as reaching the boundary exactly. Without
    // this, a dt that should land on the boundary (e.g. the last 1/60 step of a phase whose duration
    // is a multiple of 1/60) takes the partial path due to ~1e-16 float error, never firing the
    // completion intent.
    const boundaryTol = BOUNDARY_EPS * Math.max(1, dur);
    if (remaining < leftInPhase - boundaryTol) {
      // Partial advance within the current phase. Progress is linear in dt; consume all remaining.
      job.progress = clamp01(job.progress + remaining / dur);
      lastCrossing = base + dt; // full dt consumed within the phase
      remaining = 0;
      break;
    }

    // Reach the boundary: pin progress to 1, consume exactly leftInPhase of time, then transition.
    job.progress = 1;
    remaining = Math.max(0, remaining - leftInPhase);
    const crossingTime = base + (dt - remaining);
    lastCrossing = crossingTime;
    const savedSimTime = job.simTime;
    job.simTime = crossingTime;
    transition(job, intents, sink, phase);
    job.simTime = savedSimTime;
    transitions += 1;
    // If the transition landed us in FLEE/COMPLETE, the next loop iteration's guard will catch it;
    // but we also set reachedTerminal here so the post-loop knows remaining-time-passes applies.
    if (job.phase === NPC_JOB_PHASE.FLEE || job.phase === NPC_JOB_PHASE.COMPLETE) reachedTerminal = true;
  }

  if (reachedTerminal) {
    // A legitimate terminal stop (job completed or fled mid-interval): time passes for the rest of
    // dt with no further transitions. This is honest (there is nothing to discard) and is what makes
    // terminal-job decomposability hold (live-stepping a completed hauler agrees with one aggregated
    // step that reaches completion partway through). NOT a truncation.
    job.simTime = base + dt;
    if (!Number.isFinite(job.progress)) job.progress = 0;
    return intents;
  }

  // Non-terminal stop. simTime is the last crossing we genuinely reached. If we processed the whole
  // interval (remaining === 0), lastCrossing === base + dt. If we hit the cap or a degenerate phase,
  // simTime freezes at the last crossing so the caller sees exactly how far the job got.
  job.simTime = lastCrossing;
  if (!Number.isFinite(job.progress)) job.progress = 0;

  // HONEST TRUNCATION SIGNAL. Only the safety-valve stops emit `truncated`: the transition cap bound
  // (a pathologically large dt) or a degenerate phase (the job is stuck). simTime already reflects
  // the last real crossing, so the caller can resume deterministically with advance(job, remaining).
  // A normal full-interval stop (remaining === 0) emits nothing.
  const capped = transitions >= MAX_TRANSITIONS_PER_ADVANCE && remaining > BOUNDARY_EPS;
  if (capped || degenerate) {
    const processedDt = Math.max(0, lastCrossing - base);
    emit(job, intents, sink, 'truncated', {
      reason: degenerate ? 'degenerate_phase' : 'transition_cap',
      requestedDt: dt,
      processedDt,
      remainingDt: Math.max(0, dt - processedDt),
      atTransitionCap: capped,
    });
  }

  return intents;
}

/** True if this intent is the truncation safety-valve marker emitted by advance(). */
export function isTruncated(intent) {
  return !!intent && intent.event === 'npcjobs:truncated';
}

/**
 * ONE transition: emit the completion intent for `finishedPhase`, then select and enter the
 * successor. No recursion, no fallthrough — the whole per-step state change happens here. The
 * completion intent captures position/target/payload as a DESCRIPTION the owning system reads; it
 * performs no write. Progress is reset to 0 for the incoming phase.
 */
function transition(job, intents, sink, finishedPhase) {
  // 1. Emit the completion intent for the phase that just ended (position captured BEFORE moving).
  emitCompletionFor(job, intents, sink, finishedPhase);

  // 2. Select the successor and apply routeIndex/loopCount side effects.
  const next = successorPhase(job, finishedPhase, intents, sink);
  job.phase = next;

  // 3. On entering a transit/return phase, face the new target so materialization is truthful.
  if (next === NPC_JOB_PHASE.TRANSIT || next === NPC_JOB_PHASE.RETURN) {
    const o = waypoint(job, originIndex(job));
    const t = waypoint(job, targetIndex(job));
    if (o && t) job.heading = headingToward(job, o.pos, t.pos);
  }

  // 4. Hauler's final transit-to-approach edge emits the destination-arrived marker once.
  if (job.kind === NPC_JOB_KIND.HAULER && finishedPhase === NPC_JOB_PHASE.TRANSIT && next === NPC_JOB_PHASE.APPROACH) {
    emit(job, intents, sink, 'arrived', { destination: waypoint(job, job.routeIndex)?.id || null });
  }
  // Hauler terminal: announce completion with the payload descriptor (cargo owner applies it).
  if (next === NPC_JOB_PHASE.COMPLETE) {
    emit(job, intents, sink, 'complete', { payload: cloneJSON(job.payload) });
  }

  // 5. Every phase starts at progress 0.
  job.progress = 0;
}

// ─── Interrupt / resume ───────────────────────────────────────────────────────────────────────────

/**
 * Interrupt a job into flee, remembering the phase it left so resume() can restore the legal machine
 * exactly. Flee is sticky: advance() will not auto-leave it. The threat descriptor is echoed on the
 * intent for the owning tactical layer; this kernel does no combat math.
 * Idempotent: interrupting an already-fleeing job updates the threat but does not stack phases.
 */
export function interrupt(job, threat = null) {
  if (!job || job.corrupt) return job;
  if (job.phase === NPC_JOB_PHASE.FLEE) {
    // already fleeing; just refresh the threat descriptor on a new intent
    job._lastThreat = threat;
    return job;
  }
  if (job.phase === NPC_JOB_PHASE.COMPLETE) return job; // nothing to interrupt
  job.preInterruptPhase = job.phase;
  job.interrupted = true;
  job._lastThreat = threat;
  job.phase = NPC_JOB_PHASE.FLEE;
  // note: we do NOT emit here — emission belongs to advance()/the owning loop so the intent stream
  // stays inside advance()'s decomposable contract. resume() likewise only mutates state.
  return job;
}

/**
 * Resume the prior legal phase. The job returns to EXACTLY the phase, routeIndex, and progress it had
 * before fleeing — never to a reset or an unrelated origin. If there was no prior phase (e.g. a heal
 * left preInterruptPhase null), resume into the kind's start phase so the machine stays legal.
 */
export function resume(job) {
  if (!job || job.corrupt) return job;
  if (job.phase !== NPC_JOB_PHASE.FLEE) return job;
  const prior = LEGAL_PHASES.has(job.preInterruptPhase) ? job.preInterruptPhase : PHASE_GRAPHS[job.kind].start;
  job.phase = prior;
  job.interrupted = false;
  job.preInterruptPhase = null;
  // progress/routeIndex are untouched by interrupt(), so continuity is preserved.
  return job;
}

// ─── Virtualize / materialize ─────────────────────────────────────────────────────────────────────

/**
 * Mark a job offscreen. This is a structural no-op — phase, routeIndex, progress, loopCount, payload,
 * and sequence are all preserved, because advance() runs the identical math either way. The owner
 * calls advance(job, elapsedDt) with the full offscreen interval; on return to the screen the job is
 * exactly where live-stepping would have put it.
 */
export function virtualize(job) {
  if (!job || job.corrupt) return job;
  job.materialized = false;
  return job;
}

/**
 * Mark a job on-screen and produce its truthful materialization description. The position comes from
 * routePosition() over the preserved progress, so an offscreen job returning on-screen appears
 * exactly where it would have been — never at an unrelated origin, never with reset progress.
 *
 * This is a DESCRIPTION, not an entity. The owning encounterDirector consumes it to spawn/move the
 * real entity; this kernel creates nothing.
 */
export function materialize(job) {
  if (!job || job.corrupt) return null;
  job.materialized = true;
  return describeMaterialization(job);
}

/** A complete, serializable description of where this job is and what it is doing right now. */
export function describeMaterialization(job) {
  if (!job || job.corrupt) return null;
  const pos = routePosition(job);
  if (!pos) return null;
  const target = (job.phase === NPC_JOB_PHASE.TRANSIT || job.phase === NPC_JOB_PHASE.RETURN)
    ? waypoint(job, targetIndex(job))
    : null;
  return {
    schema: NPC_JOB_SCHEMA,
    jobId: job.id,
    kind: job.kind,
    phase: job.phase,
    routeIndex: job.routeIndex,
    progress: clamp01(job.progress),
    loopCount: job.loopCount,
    pos: { x: pos.x, z: pos.z },
    heading: finite(job.heading, 0),
    targetId: target ? target.id : null,
    payload: cloneJSON(job.payload),
    interrupted: job.interrupted,
    materialized: job.materialized,
    simTime: job.simTime,
  };
}

// ─── Serialization ────────────────────────────────────────────────────────────────────────────────

/**
 * Produce a plain, deep-cloned, JSON-safe record for the save owner to persist. Stamping the schema
 * version lets restoreJob() migrate older shapes later without changing the outcome of a save/restore
 * round trip. Excludes the transient `_lastThreat` marker (not part of the deterministic state).
 */
export function serializeJob(job) {
  if (!job || typeof job !== 'object') return null;
  const { _lastThreat, ...rest } = job;
  void _lastThreat;
  // Enforce the JSON-safe payload contract at serialization too: if a caller mutated job.payload to
  // a cyclic/non-JSON value after creation, fail predictably (drop the payload) instead of throwing
  // inside JSON.stringify. The rest of the record is JSON-safe by construction (scalars + the
  // route array of plain {id,pos:{x,z}} objects).
  if (rest.payload !== null && rest.payload !== undefined && !isJSONSafe(rest.payload)) {
    rest.payload = null;
    if (Array.isArray(rest.healed)) rest.healed.push('payload:not-json-safe-at-serialize');
  }
  const out = JSON.parse(JSON.stringify(rest));
  out.schema = NPC_JOB_SCHEMA;
  return out;
}

/** Public projection for HUD/UI/acceptance harnesses — one stable shape, never the raw record. */
export function summarizeJob(job) {
  if (!job || job.corrupt) {
    return { schema: NPC_JOB_SCHEMA, jobId: job ? job.id : null, kind: job ? job.kind : null, status: 'corrupt', resumable: false };
  }
  const pos = routePosition(job);
  return {
    schema: NPC_JOB_SCHEMA,
    jobId: job.id,
    kind: job.kind,
    phase: job.phase,
    status: job.phase === NPC_JOB_PHASE.COMPLETE ? 'complete' : job.phase === NPC_JOB_PHASE.FLEE ? 'fleeing' : 'active',
    routeIndex: job.routeIndex,
    progress: clamp01(job.progress),
    loopCount: job.loopCount,
    pos: pos ? { x: pos.x, z: pos.z } : null,
    heading: finite(job.heading, 0),
    materialized: job.materialized,
    interrupted: job.interrupted,
    resumable: job.phase !== NPC_JOB_PHASE.COMPLETE,
    payload: cloneJSON(job.payload),
  };
}

export default {
  NPC_JOB_SCHEMA,
  NPC_JOB_KIND,
  NPC_JOB_PHASE,
  validateJobSpec,
  createJob,
  normalizeJob,
  restoreJob,
  advance,
  isTruncated,
  interrupt,
  resume,
  virtualize,
  materialize,
  describeMaterialization,
  routePosition,
  serializeJob,
  summarizeJob,
  isJSONSafe,
  snapFloat,
};
