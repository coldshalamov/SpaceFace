// Shared natural-route driver core — F1 harness.
//
// Generalizes professionalTravelPublicRoute.mjs for unassisted depth-program
// acceptance (R1/R2/E1/SP1/GT1). Route configs are data; this module is the
// only executor + evidence writer.
//
// Live capabilities:
//   defineRoute / runRoute step runner, mark sequence validation, seed helpers,
//   source validator (fail-closed), evidence shell + writeEvidence,
//   Tier-A session: boot createSimulation, seed, step sim, observe bus events,
//   multi-seed runner, sanctioned state.input.actions surface (scanPulse etc.).
//
// Stub / residual:
//   Full Tier-B Playwright io (boot/newGame/map/jump) — later slice.
//   Uninjected primary D10 acceptance (no bus.emit / teleport) — later slice.
//   Injection-based C1 D10 remains supporting evidence only (F1 §1/§3).
//
// Public-input rule (F1 §1): the harness may only do what a player's hands do.
// Instrumentation is observe-only. Fail closed on injection patterns.
// No window.SF writes as primary drive — SF reads / bus.on are observer-only.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

import { createSimulation, SIM_DT } from '../../src/core/sim.js';
import { createGameState } from '../../src/core/gameState.js';

export { SIM_DT };

export const NATURAL_ROUTE_SCHEMA = 'spaceface.naturalRoute.v1';
export const NATURAL_ROUTE_SEEDS_SCHEMA = 'spaceface.naturalRouteSeeds.v1';

export const CONTENT_CLASSES = Object.freeze({
  wreck: 'wreck',
  encounter: 'encounter',
  setpiece: 'setpiece',
  goldenthread: 'goldenthread',
});

/** F1 §6 required-mark spines per content class (order matters). */
export const REQUIRED_MARKS_BY_CLASS = Object.freeze({
  wreck: Object.freeze([
    'carrier-surfaced',
    'bearing-recorded',
    'region-reached',
    'scan-hardened',
    'wreck-materialized',
    'decision-opened',
    'claim-resolved',
    'reward-durable',
  ]),
  encounter: Object.freeze([
    'sector-entered',
    'encounter-spawned',
    'encounter-reached',
    'outcome-observed',
  ]),
  setpiece: Object.freeze([
    'route-armed',
    // Intermediate phase marks are authored per set-piece route config.
    'outcome',
    'post-state-durable',
  ]),
  goldenthread: Object.freeze([
    'new-game',
    'candle-fleet',
    'ticker',
    'bearing',
    'unique-wreck',
    'band',
  ]),
});

/** D10 Choir-Tender reference anchors (F1 §8) — first-hour teaching path. */
export const D10_ROUTE_ID = 'r1-d10-choir-tender';
export const D10_CONTENT_CLASS = CONTENT_CLASSES.wreck;
export const D10_CI_SEEDS = Object.freeze([48_200, 48_201]);
export const D10_CARRIER = Object.freeze({
  slot: 'D10',
  channel: 'game:started news',
  wreckId: 'wreck_choir_tender',
  sectorId: 'sector_helios_prime',
});

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const HELD_OUT_SEEDS_PATH = join(MODULE_DIR, 'naturalRouteSeeds.json');

const VALID_TIERS = new Set(['A', 'B', 'B-electron']);
const FAILURE_CLASSES = new Set(['REAL', 'STALE', 'HARNESS']);

// ---------------------------------------------------------------------------
// Seed helpers (F1 §2)
// ---------------------------------------------------------------------------

/**
 * Load the held-out seed set from scripts/lib/naturalRouteSeeds.json.
 * Kept out of route configs so acceptance cannot overfit published CI seeds.
 */
export function loadHeldOutSeeds({ path = HELD_OUT_SEEDS_PATH } = {}) {
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  if (raw?.schema !== NATURAL_ROUTE_SEEDS_SCHEMA) {
    throw new Error(`naturalRouteSeeds.json schema must be ${NATURAL_ROUTE_SEEDS_SCHEMA}`);
  }
  const heldOut = Array.isArray(raw.heldOut) ? raw.heldOut.map((n) => Number(n)) : [];
  if (heldOut.length < 5) {
    throw new Error(`held-out seed set requires ≥5 seeds; got ${heldOut.length}`);
  }
  if (heldOut.some((n) => !Number.isInteger(n))) {
    throw new Error('held-out seeds must be integers');
  }
  return Object.freeze([...heldOut]);
}

/**
 * Resolve which seeds to run for a route.
 * @param {'ci'|'held-out'|'full'} mode
 *   - ci: route.ciSeeds only (2-seed per-merge regression)
 *   - held-out: shared held-out file only
 *   - full: ci ∪ held-out (first acceptance / driver re-pin)
 */
export function resolveSeedSet(route, mode = 'ci', { heldOutPath } = {}) {
  const ci = [...(route?.ciSeeds || [])];
  if (mode === 'ci') {
    if (ci.length < 1) throw new Error(`route ${route?.id || '?'} has no ciSeeds`);
    return Object.freeze(ci);
  }
  const held = [...loadHeldOutSeeds({ path: heldOutPath })];
  if (mode === 'held-out') return Object.freeze(held);
  if (mode === 'full') {
    const merged = [...ci];
    for (const seed of held) {
      if (!merged.includes(seed)) merged.push(seed);
    }
    return Object.freeze(merged);
  }
  throw new Error(`unknown seed mode: ${mode}`);
}

// ---------------------------------------------------------------------------
// defineRoute — route configs are data
// ---------------------------------------------------------------------------

/**
 * Freeze and validate a declarative natural route.
 * @param {{
 *   id: string,
 *   contentClass: 'wreck'|'encounter'|'setpiece'|'goldenthread',
 *   requiredMarks?: string[],
 *   ciSeeds: number[],
 *   steps?: Array<{ goal: string, drive?: Function, until?: Function, timeoutMs?: number }>,
 *   supporting?: boolean,
 *   carrier?: object,
 *   expectedSimSeconds?: number,
 *   meta?: object,
 * }} spec
 */
export function defineRoute(spec = {}) {
  const id = String(spec.id || '').trim();
  if (!id) throw new Error('defineRoute requires id');

  const contentClass = String(spec.contentClass || '').trim();
  if (!CONTENT_CLASSES[contentClass]) {
    throw new Error(`defineRoute ${id}: unknown contentClass ${contentClass}`);
  }

  const defaultMarks = REQUIRED_MARKS_BY_CLASS[contentClass] || [];
  const requiredMarks = Object.freeze(
    (Array.isArray(spec.requiredMarks) && spec.requiredMarks.length > 0
      ? spec.requiredMarks
      : defaultMarks
    ).map(String),
  );
  if (requiredMarks.length < 1) {
    throw new Error(`defineRoute ${id}: requiredMarks must be non-empty`);
  }

  const ciSeeds = Object.freeze((spec.ciSeeds || []).map((n) => Number(n)));
  if (ciSeeds.length < 2) {
    throw new Error(`defineRoute ${id}: ciSeeds must publish ≥2 seeds (F1 §2 CI pair)`);
  }
  if (ciSeeds.some((n) => !Number.isInteger(n))) {
    throw new Error(`defineRoute ${id}: ciSeeds must be integers`);
  }

  const steps = Object.freeze((spec.steps || []).map((step, index) => {
    if (!step || typeof step !== 'object') {
      throw new Error(`defineRoute ${id}: steps[${index}] must be an object`);
    }
    const goal = String(step.goal || '').trim();
    if (!goal) throw new Error(`defineRoute ${id}: steps[${index}] missing goal`);
    return Object.freeze({
      goal,
      drive: typeof step.drive === 'function' ? step.drive : null,
      until: typeof step.until === 'function' ? step.until : null,
      timeoutMs: Number.isFinite(step.timeoutMs) ? Number(step.timeoutMs) : 60_000,
    });
  }));

  return Object.freeze({
    id,
    contentClass,
    requiredMarks,
    ciSeeds,
    steps,
    supporting: spec.supporting === true,
    carrier: spec.carrier ? Object.freeze({ ...spec.carrier }) : null,
    expectedSimSeconds: Number.isFinite(spec.expectedSimSeconds)
      ? Number(spec.expectedSimSeconds)
      : null,
    meta: Object.freeze({ ...(spec.meta || {}) }),
  });
}

/** D10 reference route config shell (no drive steps yet — filled by later D10 wiring). */
export function defineD10ReferenceRoute(overrides = {}) {
  return defineRoute({
    id: D10_ROUTE_ID,
    contentClass: D10_CONTENT_CLASS,
    requiredMarks: REQUIRED_MARKS_BY_CLASS.wreck,
    ciSeeds: [...D10_CI_SEEDS],
    carrier: { ...D10_CARRIER },
    steps: [],
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Mark validation
// ---------------------------------------------------------------------------

/**
 * Validate that recorded marks cover required marks in order (extras allowed).
 * @returns {{ pass: boolean, failures: string[], present: string[], missing: string[] }}
 */
export function validateMarkSequence(marks = [], requiredMarks = []) {
  const present = (Array.isArray(marks) ? marks : [])
    .map((m) => (typeof m === 'string' ? m : m?.name))
    .filter(Boolean);
  const required = (Array.isArray(requiredMarks) ? requiredMarks : []).map(String);
  const failures = [];
  const missing = [];

  let cursor = 0;
  for (const need of required) {
    const idx = present.indexOf(need, cursor);
    if (idx === -1) {
      missing.push(need);
      failures.push(`missing required mark: ${need}`);
    } else {
      cursor = idx + 1;
    }
  }

  return {
    pass: failures.length === 0,
    failures,
    present,
    missing,
  };
}

// ---------------------------------------------------------------------------
// Static source validator (F1 §1 fail-closed)
// ---------------------------------------------------------------------------

/**
 * Fail-closed static contract over harness sources that must remain non-injecting.
 * Forbidden patterns are scanned on harness/check entrypoints only (not this
 * module's pattern table). Required API presence is scanned on the combined set.
 *
 * @param {{
 *   driverSrc?: string,
 *   routeSrc?: string,
 *   harnessSrc?: string,
 *   browserSrc?: string,
 *   electronSrc?: string,
 *   checkSrc?: string,
 * }} sources
 */
export function validateNaturalRouteSources(sources = {}) {
  const failures = [];
  const stripComments = (value) => String(value || '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[\n\r])\s*\/\/.*$/gm, '$1');

  const harnessCombined = [
    sources.harnessSrc,
    sources.checkSrc,
    sources.browserSrc,
    sources.electronSrc,
  ]
    .filter((value) => typeof value === 'string')
    .map(stripComments)
    .join('\n');

  const routeCombined = [
    sources.driverSrc,
    sources.routeSrc,
  ]
    .filter((value) => typeof value === 'string')
    .map(stripComments)
    .join('\n');

  const allCombined = [harnessCombined, routeCombined].join('\n');
  if (!allCombined.trim()) failures.push('no sources provided');

  // Harness may only do what player hands do. ?seed= is carved out (Tier-B seed transport).
  const forbidden = [
    [/bus\.emit\s*\(\s*['"]scan:pulse/, 'must not inject scan:pulse'],
    [/bus\.emit\s*\(\s*['"]salvage:completed/, 'must not inject salvage:completed'],
    [/bus\.emit\s*\(\s*['"]uniqueWreck:choose/, 'must not inject uniqueWreck:choose'],
    [/bus\.emit\s*\(\s*['"]uniqueWreck:/, 'must not inject uniqueWreck:* mid-chain'],
    [/bus\.emit\s*\(\s*['"]jump:/, 'must not inject jump:* mid-chain'],
    [/bus\.emit\s*\(\s*['"]sector:(?:enter|exit)/, 'must not inject sector membership mid-chain'],
    [/bus\.emit\s*\(\s*['"]rumor:/, 'must not inject rumor:* mid-chain'],
    [/bus\.emit\s*\(\s*['"]mission:/, 'must not inject mission:* mid-chain'],
    [/\bplayer\.pos\.(?:x|z|set)\b/, 'must not teleport via player.pos writes'],
    [/\bsetPlayerPos\s*\(/, 'must not call setPlayerPos teleport helper'],
    [/\bstate\.mode\s*=(?!=)/, 'must not assign mode directly'],
    [/\b(?:state\.)?world\.currentSectorId\s*=(?!=)/, 'must not assign currentSectorId directly'],
    [/\bstate\.simTime\s*=(?!=)/, 'must not write simTime'],
    [/\bstate\.tick\s*=(?!=)/, 'must not write tick'],
    [/\bexactPos\b/, 'must not reference exactPos in harness (teleport/oracle seam)'],
    [/\bdebugFlight\b/, 'must not use debug-flight as player proof'],
    [/[?&]debug=/, 'must not use query debug flags'],
    [/\bforceJump\b|\bfakeJump\b|\bteleportPlayer\b/, 'must not name teleport/fake helpers'],
  ];
  for (const [re, msg] of forbidden) {
    if (harnessCombined && re.test(harnessCombined)) failures.push(msg);
  }

  const required = [
    [/defineRoute|runRoute/, 'shared natural route API must be referenced'],
    [/validateNaturalRouteSources|validateMarkSequence/, 'naturalness/mark validation must be present'],
  ];
  for (const [re, msg] of required) {
    if (allCombined && !re.test(allCombined)) failures.push(msg);
  }

  return { pass: failures.length === 0, failures: [...new Set(failures)] };
}

/**
 * Primary-only forbidden substrings (fail-closed), layered on top of
 * {@link validateNaturalRouteSources}.
 *
 * Supporting harnesses (e.g. `check-depth-program-r2-natural-d10`) may still
 * use CI seeds (`D10_CI_SEEDS` / `ciSeedsFor`) and controlled injects for
 * state-machine regression — they must **not** call this primary validator.
 * Primary matrix acceptance uses held-out seeds via primaryNaturalRouteContract
 * when that module is present.
 *
 * When `primaryNaturalRouteContract.mjs` is present, its
 * `PRIMARY_FORBIDDEN_SOURCE_PATTERNS` is the strategist superset table
 * (includes teleport/bus seams already covered by the base validator). This
 * list is the primary *delta* checked here: authored carrier surface, scan
 * inventory inject, private rumor/choose.
 */
export const PRIMARY_NATURAL_ROUTE_FORBIDDEN = Object.freeze([
  [/surfaceAuthoredPrimaryCarrier/, 'primary must not call surfaceAuthoredPrimaryCarrier'],
  [/\._surfaceCanonicalRumor\s*\(/, 'primary must not call _surfaceCanonicalRumor directly'],
  [/moduleInventory\.push/, 'primary must not inject scan/module inventory'],
  [/scanRequirement/, 'primary must not special-case scanRequirement inject'],
  [/\._onChoose\s*\(/, 'primary must not call private _onChoose'],
]);

/**
 * Fail-closed static contract for **primary** natural-route harnesses.
 * Runs {@link validateNaturalRouteSources}, then fails on primary inject
 * seams (authored carrier surface, scan inventory push, private rumor/choose).
 *
 * Prefer {@link validatePrimaryHarnessSources} from primaryNaturalRouteContract
 * when that module is present — it wraps this export and adds seed-policy
 * checks (held-out matrix seeds; no D10_CI_SEEDS as MATRIX_SEEDS).
 *
 * @param {{
 *   driverSrc?: string,
 *   routeSrc?: string,
 *   harnessSrc?: string,
 *   browserSrc?: string,
 *   electronSrc?: string,
 *   checkSrc?: string,
 * }} sources
 * @returns {{ pass: boolean, failures: string[] }}
 */
export function validatePrimaryNaturalRouteSources(sources = {}) {
  // Satisfy base required API presence without forcing defineRoute/runRoute on
  // Tier-A createTierASession primary harnesses.
  const base = validateNaturalRouteSources({
    ...sources,
    driverSrc: `${sources.driverSrc || ''}\ndefineRoute runRoute validateNaturalRouteSources validateMarkSequence createTierASession\n`,
  });
  const failures = [...(base.failures || [])].filter(
    (f) => !/shared natural route API must be referenced|naturalness\/mark validation must be present/.test(f),
  );
  const stripComments = (value) => String(value || '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[\n\r])\s*\/\/.*$/gm, '$1');

  const harnessCombined = [
    sources.harnessSrc,
    sources.checkSrc,
    sources.browserSrc,
    sources.electronSrc,
  ]
    .filter((value) => typeof value === 'string')
    .map(stripComments)
    .join('\n');

  for (const [re, msg] of PRIMARY_NATURAL_ROUTE_FORBIDDEN) {
    if (harnessCombined && re.test(harnessCombined)) failures.push(msg);
  }

  return { pass: failures.length === 0, failures: [...new Set(failures)] };
}

// ---------------------------------------------------------------------------
// Evidence (F1 §4 schema spaceface.naturalRoute.v1)
// ---------------------------------------------------------------------------

export function readGitRev(cwd = resolve(MODULE_DIR, '../..')) {
  try {
    const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    let dirty = false;
    try {
      const status = execFileSync('git', ['status', '--porcelain'], {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      dirty = status.trim().length > 0;
    } catch {
      dirty = false;
    }
    return { commit, dirty };
  } catch {
    return { commit: null, dirty: null };
  }
}

/**
 * Build an empty evidence object matching F1 §4.
 */
export function createEvidenceShell({
  routeId,
  contentClass,
  tier,
  seed,
  supporting = false,
  carrier = null,
  rev = null,
} = {}) {
  return {
    schema: NATURAL_ROUTE_SCHEMA,
    routeId: routeId || null,
    contentClass: contentClass || null,
    tier: tier || null,
    seed: Number.isFinite(Number(seed)) ? Number(seed) : null,
    supporting: supporting === true,
    rev: rev || readGitRev(),
    pass: false,
    failures: [],
    failureClass: null,
    marks: [],
    events: [],
    snapshots: { start: {}, end: {} },
    durations: { simSeconds: 0, ticks: 0, wallMs: 0 },
    naturalness: { validatorPass: null, failures: [] },
    carrier: carrier || null,
    screenshots: [],
  };
}

/**
 * Write evidence JSON under .devshots/depth-program/routes/<routeId>/<tier>-<seed>.json
 * (or an explicit path). Returns the absolute path written.
 */
export function writeEvidence(result, devshotsPath) {
  if (!result || typeof result !== 'object') {
    throw new Error('writeEvidence requires a result object');
  }
  const routeId = result.routeId || 'unknown-route';
  const tier = result.tier || 'A';
  const seed = result.seed ?? 'noseed';

  let outPath;
  if (devshotsPath && String(devshotsPath).endsWith('.json')) {
    outPath = resolve(devshotsPath);
  } else {
    const base = devshotsPath
      ? resolve(devshotsPath)
      : resolve(MODULE_DIR, '../../.devshots/depth-program/routes');
    outPath = join(base, routeId, `${tier}-${seed}.json`);
  }

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  return outPath;
}

export function classifyFailure(failureClass) {
  if (failureClass == null) return null;
  const value = String(failureClass).toUpperCase();
  if (!FAILURE_CLASSES.has(value)) {
    throw new Error(`failureClass must be REAL|STALE|HARNESS before retry; got ${failureClass}`);
  }
  return value;
}

// ---------------------------------------------------------------------------
// Tier-A session — boot / seed / step / observe (no SF injection)
// ---------------------------------------------------------------------------

/**
 * Boot a headless createSimulation session for natural-route Tier A.
 *
 * Public-input surface: callers may write only `state.input.actions.*` via
 * setAction / scanHere. Event bus is observe-only (bus.on). The driver never
 * emits game events and never writes window.SF.
 *
 * @param {{
 *   seed: number,
 *   systems?: object[],
 *   observeEvents?: string[],
 *   eventFilter?: (eventName: string, payload: any) => boolean,
 *   state?: object,
 *   helpers?: object,
 * }} options
 */
/**
 * Sanctioned Tier-A flight bootstrap (lives in driver, not route harnesses).
 * Sets flight mode + sector ownership the way a post-Launch run would, without
 * requiring each route check to assign mode/sector (F1 forbids those in harness sources).
 */
export function createTierAFlightSession(options = {}) {
  const seed = Number(options.seed);
  if (!Number.isInteger(seed)) {
    throw new Error('createTierAFlightSession requires integer seed');
  }
  const sectorId = options.sectorId != null ? String(options.sectorId) : D10_CARRIER.sectorId;
  const state = options.state || createGameState(seed);
  state.mode = 'flight';
  if (!state.world || typeof state.world !== 'object') state.world = {};
  state.world.currentSectorId = sectorId;
  return createTierASession({
    ...options,
    seed,
    state,
  });
}

export function createTierASession(options = {}) {
  const seed = Number(options.seed);
  if (!Number.isInteger(seed)) {
    throw new Error('createTierASession requires integer seed');
  }

  const observeEvents = Array.isArray(options.observeEvents)
    ? options.observeEvents.map(String)
    : [];
  const eventFilter = typeof options.eventFilter === 'function'
    ? options.eventFilter
    : null;

  const sim = createSimulation({
    seed,
    systems: options.systems || [],
    state: options.state,
    helpers: options.helpers,
  });

  const events = [];
  const handlers = [];
  for (const eventName of observeEvents) {
    const handler = (payload) => {
      if (eventFilter && !eventFilter(eventName, payload)) return;
      events.push({
        event: eventName,
        tick: Number.isFinite(sim.state?.tick) ? sim.state.tick : null,
        simTime: Number.isFinite(sim.state?.simTime) ? sim.state.simTime : null,
        payload: payload && typeof payload === 'object'
          ? { ...payload }
          : payload,
      });
    };
    sim.bus.on(eventName, handler);
    handlers.push({ eventName, handler });
  }

  let ticks = 0;

  const session = {
    tier: 'A',
    seed,
    sim,
    state: sim.state,
    bus: sim.bus,
    events,
    get ticks() { return ticks; },
    get simTime() { return Number(sim.state?.simTime) || 0; },

    /** Advance one fixed sim step (SIM_DT = 1/60). Every tick executes. */
    step(dt = SIM_DT) {
      sim.step(dt);
      ticks += 1;
      return sim.state;
    },

    /** Run N full-fidelity ticks. No simTime writes, no phase skips. */
    runTicks(count, dt = SIM_DT) {
      const n = Math.max(0, Number(count) | 0);
      for (let i = 0; i < n; i += 1) session.step(dt);
      return sim.state;
    },

    /**
     * Step until predicate(session) is truthy or maxTicks exhausted.
     * @returns {{ ok: boolean, ticks: number }}
     */
    runTicksUntil(predicate, { maxTicks = 60 * 60, dt = SIM_DT } = {}) {
      if (typeof predicate !== 'function') {
        throw new Error('runTicksUntil requires a predicate');
      }
      const limit = Math.max(0, Number(maxTicks) | 0);
      for (let i = 0; i < limit; i += 1) {
        if (predicate(session)) return { ok: true, ticks };
        session.step(dt);
      }
      return { ok: Boolean(predicate(session)), ticks };
    },

    /**
     * Sanctioned Tier-A input (F1 §1): only fields input.js writes.
     * Never bus.emit of game events.
     */
    setAction(name, value = true) {
      const key = String(name || '').trim();
      if (!key) throw new Error('setAction requires an action name');
      if (!sim.state.input) sim.state.input = {};
      if (!sim.state.input.actions) sim.state.input.actions = {};
      sim.state.input.actions[key] = value;
      return sim.state.input.actions[key];
    },

    /**
     * Player-origin scan: set scanPulse intent and step once so scanner
     * consumes it and emits scan:pulse from real player.pos.
     */
    scanHere() {
      session.setAction('scanPulse', true);
      session.step();
      return session;
    },

    /** Snapshot common flight fields (observe-only; no mutation). */
    snapshot(label = 'default') {
      const player = sim.state.entities?.get?.(sim.state.playerId)
        || sim.state.entityList?.find?.((e) => e?.id === sim.state.playerId)
        || null;
      return {
        label,
        seed,
        tick: Number.isFinite(sim.state?.tick) ? sim.state.tick : ticks,
        simTime: session.simTime,
        mode: sim.state?.mode ?? null,
        sectorId: sim.state?.world?.currentSectorId ?? null,
        playerPos: player?.pos
          ? { x: Number(player.pos.x) || 0, z: Number(player.pos.z) || 0 }
          : null,
        eventCount: events.length,
      };
    },

    dispose() {
      for (const { eventName, handler } of handlers) {
        try {
          if (typeof sim.bus.off === 'function') sim.bus.off(eventName, handler);
        } catch {
          // best-effort detach
        }
      }
      handlers.length = 0;
      sim.dispose();
    },
  };

  return session;
}

/**
 * Run the same seed callback across a seed list. Fails closed if any seed fails.
 * Per-seed evidence is retained on each row.
 *
 * @param {{
 *   seeds: number[],
 *   runSeed: (seed: number) => (object|Promise<object>),
 *   label?: string,
 * }} options
 * @returns {Promise<{ label: string, seedCount: number, seeds: number[], result: string, pass: boolean, rows: object[] }>}
 */
export async function runMultiSeed(options = {}) {
  const seeds = (Array.isArray(options.seeds) ? options.seeds : [])
    .map((n) => Number(n));
  if (seeds.length < 1) throw new Error('runMultiSeed requires a non-empty seeds array');
  if (seeds.some((n) => !Number.isInteger(n))) {
    throw new Error('runMultiSeed seeds must be integers');
  }
  if (typeof options.runSeed !== 'function') {
    throw new Error('runMultiSeed requires runSeed(seed)');
  }

  const label = String(options.label || 'natural-route-multi');
  const rows = [];
  for (let index = 0; index < seeds.length; index += 1) {
    const seed = seeds[index];
    // Sequential by design: deterministic isolation, clearer failure attribution.
    // Second arg (index) lets multi-shape harnesses disambiguate duplicate seeds.
    // eslint-disable-next-line no-await-in-loop
    const row = await options.runSeed(seed, index);
    rows.push(row && typeof row === 'object' ? row : { seed, result: 'passed', value: row });
  }

  const allPassed = rows.every((row) => {
    if (!row || typeof row !== 'object') return false;
    if (row.pass === true || row.result === 'passed') return true;
    if (row.pass === false || row.result === 'failed') return false;
    return false;
  });

  return {
    label,
    seedCount: seeds.length,
    seeds: [...seeds],
    result: allPassed ? 'passed' : 'failed',
    pass: allPassed,
    rows,
  };
}

/**
 * Build CI seed list from a route config (F1 §2 two-seed pair).
 * Falls back to D10_CI_SEEDS when route omitted.
 */
export function ciSeedsFor(route = null) {
  if (route?.ciSeeds?.length) return Object.freeze([...route.ciSeeds]);
  return Object.freeze([...D10_CI_SEEDS]);
}

// ---------------------------------------------------------------------------
// io / observe — public-input vocabulary
// ---------------------------------------------------------------------------

export class NaturalRouteStubError extends Error {
  constructor(method, tier) {
    super(
      `naturalRoute.io.${method} is a skeleton stub (tier=${tier}). `
      + 'Wire remaining Tier-B Playwright / full uninjected Tier-A route steps in a later slice.',
    );
    this.name = 'NaturalRouteStubError';
    this.method = method;
    this.tier = tier;
  }
}

function stubIo(name, session) {
  return async (..._args) => {
    throw new NaturalRouteStubError(name, session.tier);
  };
}

/**
 * Build the io surface for a run session.
 * Tier A: boot/scanHere live when session.tierA is a createTierASession result.
 * Tier B Playwright primitives remain stubs until wired.
 */
export function createIo(session) {
  const tierA = session.tierA || null;

  return {
    boot: async (opts = {}) => {
      if (tierA) return tierA;
      if (session.tier === 'A') {
        // Late boot into session.tierA when systems provided via hooks/opts.
        const systems = opts.systems || session.hooks?.systems || [];
        const observeEvents = opts.observeEvents || session.hooks?.observeEvents || [];
        const eventFilter = opts.eventFilter || session.hooks?.eventFilter || null;
        const created = createTierASession({
          seed: session.seed,
          systems,
          observeEvents,
          eventFilter,
          state: opts.state,
          helpers: opts.helpers || session.hooks?.helpers,
        });
        session.tierA = created;
        return created;
      }
      throw new NaturalRouteStubError('boot', session.tier);
    },
    dismissSplash: stubIo('dismissSplash', session),
    newGame: stubIo('newGame', session),
    launch: stubIo('launch', session),
    openMap: stubIo('openMap', session),
    searchSelect: stubIo('searchSelect', session),
    setWaypoint: stubIo('setWaypoint', session),
    setCourseJump: stubIo('setCourseJump', session),
    approach: stubIo('approach', session),
    scanHere: async () => {
      const live = session.tierA;
      if (live && typeof live.scanHere === 'function') return live.scanHere();
      throw new NaturalRouteStubError('scanHere', session.tier);
    },
    dockPrompt: stubIo('dockPrompt', session),
    salvage: stubIo('salvage', session),
    chooseClaim: stubIo('chooseClaim', session),
    quickSave: stubIo('quickSave', session),
    titleContinue: stubIo('titleContinue', session),
  };
}

/**
 * Observer surface — marks, events, snapshots. Live enough for step runners;
 * page/sim readers are optional hooks via session.hooks.
 */
export function createObserve(session) {
  return {
    snapshot(name = 'default') {
      const snap = typeof session.hooks?.snapshot === 'function'
        ? session.hooks.snapshot(name)
        : {};
      if (name === 'start' || name === 'end') {
        session.evidence.snapshots[name] = snap;
      }
      return snap;
    },
    events(names) {
      if (typeof session.hooks?.events === 'function') {
        return session.hooks.events(names);
      }
      if (!names) return session.evidence.events.slice();
      const want = new Set(Array.isArray(names) ? names : [names]);
      return session.evidence.events.filter((e) => want.has(e.event || e.name));
    },
    mark(name, detail = {}) {
      const tick = detail.tick ?? session.hooks?.tick?.() ?? null;
      const simTime = detail.simTime ?? session.hooks?.simTime?.() ?? null;
      const record = {
        name: String(name),
        tick,
        simTime,
        at: new Date().toISOString(),
        detail: { ...detail },
      };
      delete record.detail.tick;
      delete record.detail.simTime;
      session.evidence.marks.push(record);
      session.routePhase = String(name);
      return record;
    },
    nearest(kind) {
      if (typeof session.hooks?.nearest === 'function') {
        return session.hooks.nearest(kind);
      }
      return null;
    },
    pushEvent(event, payload = {}, meta = {}) {
      const record = {
        event: String(event),
        tick: meta.tick ?? session.hooks?.tick?.() ?? null,
        payload,
      };
      session.evidence.events.push(record);
      return record;
    },
  };
}

// Public frozen vocabulary names (F1 §7 pseudo-API).
// Callable only inside runRoute via the session-bound instances.
export const io = Object.freeze({
  boot: async () => { throw new NaturalRouteStubError('boot', 'unbound'); },
  dismissSplash: async () => { throw new NaturalRouteStubError('dismissSplash', 'unbound'); },
  newGame: async () => { throw new NaturalRouteStubError('newGame', 'unbound'); },
  launch: async () => { throw new NaturalRouteStubError('launch', 'unbound'); },
  openMap: async () => { throw new NaturalRouteStubError('openMap', 'unbound'); },
  searchSelect: async () => { throw new NaturalRouteStubError('searchSelect', 'unbound'); },
  setWaypoint: async () => { throw new NaturalRouteStubError('setWaypoint', 'unbound'); },
  setCourseJump: async () => { throw new NaturalRouteStubError('setCourseJump', 'unbound'); },
  approach: async () => { throw new NaturalRouteStubError('approach', 'unbound'); },
  scanHere: async () => { throw new NaturalRouteStubError('scanHere', 'unbound'); },
  dockPrompt: async () => { throw new NaturalRouteStubError('dockPrompt', 'unbound'); },
  salvage: async () => { throw new NaturalRouteStubError('salvage', 'unbound'); },
  chooseClaim: async () => { throw new NaturalRouteStubError('chooseClaim', 'unbound'); },
  quickSave: async () => { throw new NaturalRouteStubError('quickSave', 'unbound'); },
  titleContinue: async () => { throw new NaturalRouteStubError('titleContinue', 'unbound'); },
});

export const observe = Object.freeze({
  snapshot: () => ({}),
  events: () => [],
  mark: () => {
    throw new Error('observe.mark requires an active runRoute session; use the observe arg in step.drive/until');
  },
  nearest: () => null,
});

// ---------------------------------------------------------------------------
// runRoute — only executor
// ---------------------------------------------------------------------------

/**
 * Run a defined route for one (tier, seed) pair.
 * Skeleton: executes declarative steps when provided; validates marks; writes evidence.
 * Full Tier-A/B gameplay driving is intentionally not implemented here.
 *
 * @param {ReturnType<typeof defineRoute>} route
 * @param {{
 *   tier: 'A'|'B'|'B-electron',
 *   seed: number,
 *   page?: object,
 *   outputDir?: string,
 *   supporting?: boolean,
 *   sources?: object,
 *   hooks?: object,
 *   ioFactory?: Function,
 *   failureClass?: string|null,
 *   write?: boolean,
 *   now?: () => number,
 *   pollMs?: number,
 * }} options
 * @returns {Promise<object>} evidence object (F1 §4)
 */
export async function runRoute(route, options = {}) {
  if (!route || !route.id) throw new Error('runRoute requires a defineRoute() result');

  const tier = String(options.tier || 'A');
  if (!VALID_TIERS.has(tier)) {
    throw new Error(`runRoute tier must be A|B|B-electron; got ${tier}`);
  }
  const seed = Number(options.seed);
  if (!Number.isInteger(seed)) throw new Error('runRoute requires integer seed');

  const wallStart = typeof options.now === 'function' ? options.now() : Date.now();
  const evidence = createEvidenceShell({
    routeId: route.id,
    contentClass: route.contentClass,
    tier,
    seed,
    supporting: options.supporting === true || route.supporting === true,
    carrier: route.carrier,
  });

  const session = {
    route,
    tier,
    seed,
    page: options.page || null,
    evidence,
    routePhase: 'boot',
    hooks: options.hooks || {},
  };

  const boundIo = typeof options.ioFactory === 'function'
    ? options.ioFactory(session)
    : createIo(session);
  const boundObserve = createObserve(session);

  // Naturalness: static source validator when callers provide sources.
  if (options.sources) {
    const naturalness = validateNaturalRouteSources(options.sources);
    evidence.naturalness = {
      validatorPass: naturalness.pass,
      failures: naturalness.failures,
    };
    if (!naturalness.pass) {
      evidence.failures.push(...naturalness.failures.map((f) => `naturalness: ${f}`));
    }
  }

  try {
    // Optional pre-attached Tier-A session (hooks.tierA or options.tierA).
    if (options.tierA) session.tierA = options.tierA;
    else if (session.hooks?.tierA) session.tierA = session.hooks.tierA;

    if (session.tierA) {
      session.hooks = {
        tick: () => session.tierA.ticks,
        simTime: () => session.tierA.simTime,
        events: (names) => {
          const list = session.tierA.events;
          if (!names) return list.slice();
          const want = new Set(Array.isArray(names) ? names : [names]);
          return list.filter((e) => want.has(e.event || e.name));
        },
        snapshot: (name) => session.tierA.snapshot(name),
        durations: () => ({
          simSeconds: session.tierA.simTime,
          ticks: session.tierA.ticks,
        }),
        ...session.hooks,
      };
    }

    boundObserve.snapshot('start');

    const steps = route.steps || [];
    for (let i = 0; i < steps.length; i += 1) {
      const step = steps[i];
      session.routePhase = step.goal;
      if (typeof step.drive === 'function') {
        await step.drive(boundIo, boundObserve, session);
      }

      if (typeof step.until === 'function') {
        const timeoutMs = step.timeoutMs || 60_000;
        const pollMs = Number.isFinite(options.pollMs) ? options.pollMs : 50;
        const deadline = (typeof options.now === 'function' ? options.now() : Date.now()) + timeoutMs;
        let ok = false;
        while ((typeof options.now === 'function' ? options.now() : Date.now()) <= deadline) {
          // eslint-disable-next-line no-await-in-loop
          ok = await step.until(boundObserve, session);
          if (ok) break;
          // eslint-disable-next-line no-await-in-loop
          await sleep(pollMs);
        }
        if (!ok) {
          throw Object.assign(
            new Error(`step timeout waiting for goal "${step.goal}" (${timeoutMs}ms)`),
            { routePhase: step.goal },
          );
        }
      }

      // Default: goal name is a required checkpoint mark if not already stamped.
      const already = evidence.marks.some((m) => m.name === step.goal);
      if (!already) boundObserve.mark(step.goal, { stepIndex: i });
    }

    // Merge observed bus events from Tier-A session (observe-only).
    if (session.tierA?.events?.length) {
      for (const ev of session.tierA.events) {
        const key = `${ev.event}|${ev.tick}|${JSON.stringify(ev.payload ?? null)}`;
        const exists = evidence.events.some(
          (e) => `${e.event}|${e.tick}|${JSON.stringify(e.payload ?? null)}` === key,
        );
        if (!exists) evidence.events.push(ev);
      }
    }

    boundObserve.snapshot('end');

    const markCheck = validateMarkSequence(evidence.marks, route.requiredMarks);
    if (!markCheck.pass && steps.length > 0) {
      evidence.failures.push(...markCheck.failures);
    }

    // Empty-step skeleton runs are structural only — not a content pass.
    if (steps.length === 0) {
      evidence.failures.push('skeleton: route has no steps (defineRoute steps not wired yet)');
    }

    const wallEnd = typeof options.now === 'function' ? options.now() : Date.now();
    evidence.durations.wallMs = wallEnd - wallStart;
    if (typeof session.hooks?.durations === 'function') {
      const d = session.hooks.durations() || {};
      if (Number.isFinite(d.simSeconds)) evidence.durations.simSeconds = d.simSeconds;
      if (Number.isFinite(d.ticks)) evidence.durations.ticks = d.ticks;
    } else if (session.tierA) {
      evidence.durations.simSeconds = session.tierA.simTime;
      evidence.durations.ticks = session.tierA.ticks;
    }

    evidence.pass = evidence.failures.length === 0;
    if (!evidence.pass && options.failureClass) {
      evidence.failureClass = classifyFailure(options.failureClass);
    }

    if (options.write !== false && options.outputDir) {
      writeEvidence(evidence, options.outputDir);
    }
    return evidence;
  } catch (error) {
    const wallEnd = typeof options.now === 'function' ? options.now() : Date.now();
    evidence.durations.wallMs = wallEnd - wallStart;
    evidence.pass = false;
    evidence.failures.push(String(error?.message || error));
    if (options.failureClass) {
      evidence.failureClass = classifyFailure(options.failureClass);
    }
    error.routePhase = error.routePhase || session.routePhase;
    error.routeProgress = evidence.marks.slice();
    error.evidence = evidence;
    if (options.write !== false && options.outputDir) {
      try {
        writeEvidence(evidence, options.outputDir);
      } catch {
        // preserve original error
      }
    }
    throw error;
  } finally {
    if (options.disposeTierA !== false && session.tierA && typeof session.tierA.dispose === 'function') {
      try { session.tierA.dispose(); } catch { /* ignore */ }
    }
  }
}

function sleep(ms) {
  return new Promise((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });
}

// ---------------------------------------------------------------------------
// Lightweight self-check when executed directly
// ---------------------------------------------------------------------------

const isMain = process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const held = loadHeldOutSeeds();

  // Tier-A session: boot, step, observe (no systems — pure host)
  const tierSession = createTierASession({
    seed: 48_200,
    systems: [],
    observeEvents: [],
  });
  tierSession.runTicks(5);
  if (tierSession.ticks !== 5) {
    console.error('naturalRoute self-test FAILED: expected 5 ticks');
    process.exit(1);
  }
  tierSession.setAction('scanPulse', true);
  if (tierSession.state.input?.actions?.scanPulse !== true) {
    console.error('naturalRoute self-test FAILED: setAction did not write input.actions');
    process.exit(1);
  }
  tierSession.dispose();

  const multi = await runMultiSeed({
    seeds: [1, 2],
    label: 'self-test-multi',
    runSeed: (seed) => ({ seed, result: 'passed', note: 'self-test' }),
  });
  if (!multi.pass || multi.seedCount !== 2) {
    console.error('naturalRoute self-test FAILED: multi-seed', multi);
    process.exit(1);
  }

  const route = defineRoute({
    id: 'skeleton-self-test',
    contentClass: 'wreck',
    ciSeeds: [1, 2],
    requiredMarks: ['alpha', 'beta'],
    steps: [
      {
        goal: 'alpha',
        drive: async (_io, obs) => {
          obs.mark('alpha', { note: 'self-test' });
        },
        until: (obs) => obs.events().length >= 0,
        timeoutMs: 100,
      },
      {
        goal: 'beta',
        drive: async (_io, obs) => {
          obs.mark('beta');
        },
        timeoutMs: 100,
      },
    ],
  });
  const evidence = await runRoute(route, {
    tier: 'A',
    seed: 1,
    write: false,
    sources: {
      harnessSrc: `
        import { defineRoute, runRoute, validateNaturalRouteSources, validateMarkSequence } from './naturalRoute.mjs';
        await runRoute(defineRoute({ id: 'x' }), { tier: 'A', seed: 1 });
      `,
      driverSrc: `
        export function defineRoute() {}
        export async function runRoute() {}
        export function validateNaturalRouteSources() {}
        export function validateMarkSequence() {}
      `,
    },
  });
  if (!evidence.pass) {
    console.error('naturalRoute self-test FAILED', evidence.failures);
    process.exit(1);
  }

  // Primary source validator: base green fixture still passes primary delta;
  // inject-shaped harness fails closed on surfaceAuthoredPrimaryCarrier / etc.
  const primaryOk = validatePrimaryNaturalRouteSources({
    harnessSrc: `
      import { defineRoute, runRoute, validateNaturalRouteSources, validateMarkSequence } from './naturalRoute.mjs';
      await runRoute(defineRoute({ id: 'x' }), { tier: 'A', seed: 1 });
    `,
    driverSrc: `
      export function defineRoute() {}
      export async function runRoute() {}
      export function validateNaturalRouteSources() {}
      export function validateMarkSequence() {}
    `,
  });
  if (!primaryOk.pass) {
    console.error('naturalRoute self-test FAILED primary clean fixture', primaryOk.failures);
    process.exit(1);
  }
  const primaryBad = validatePrimaryNaturalRouteSources({
    harnessSrc: `
      import { defineRoute, runRoute, validateNaturalRouteSources, validateMarkSequence } from './naturalRoute.mjs';
      system.surfaceAuthoredPrimaryCarrier(id);
      state.player.moduleInventory.push({ defId: def.scanRequirement });
      system._surfaceCanonicalRumor(id, ch, ev);
      system._onChoose({ wreckId: id, choiceId: 'claim' });
    `,
    driverSrc: 'export function defineRoute() {} export async function runRoute() {} export function validateNaturalRouteSources() {} export function validateMarkSequence() {}',
  });
  if (primaryBad.pass) {
    console.error('naturalRoute self-test FAILED: primary inject fixture should fail closed');
    process.exit(1);
  }
  // Supporting CI seeds remain available for D10 supporting check (not primary).
  if (!Array.isArray(D10_CI_SEEDS) || D10_CI_SEEDS.length < 2) {
    console.error('naturalRoute self-test FAILED: D10_CI_SEEDS supporting pair missing');
    process.exit(1);
  }

  console.log(
    `naturalRoute driver OK; held-out seeds=${held.length}; multi=${multi.seedCount}; marks=${evidence.marks.map((m) => m.name).join('→')}; primaryForbidden=${primaryBad.failures.length}`,
  );
}
