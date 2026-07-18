// GOLD-CORRIDOR-PUBLIC-PILOT — reusable autonomous public-input pilot core.
//
// Drives the game the way a player does, starting from the title route, and reports SEMANTIC
// milestones instead of teleporting or mutating state:
//
//   title → New Game → Launch → free flight (undocked) → objective acquired
//   → career origin accepted (advisory) → galaxy map used → travel underway
//   → first physical dock → station service used → F5 save → cold Continue → clean teardown
//
// Contract:
//   * NO state injection. The pilot may OBSERVE `window.SF.state` / bus events; it may never write
//     gameplay state, emit gameplay events, set debug flags, or synthesize DOM input events.
//     All input goes through the same public Playwright keyboard/pointer surface the existing
//     public-route harnesses use.
//   * Every milestone wait is BOUNDED, and a stall is CLASSIFIED against the milestone that was not
//     reached — never reported as a bare failure.
//   * Evidence is written only under the repo's ignored artifact tree (`.devshots/`).
//
// Structure: everything above `runGoldCorridorPublicPilot` is pure and browser-free so
// test/gold-corridor-public-pilot-contract.test.mjs can prove the contracts without launching a
// browser. The browser driver lives at the bottom and imports nothing beyond node builtins.

import path from 'node:path';

export const GOLD_CORRIDOR_SCHEMA = 'spaceface.goldCorridorPublicPilot.v1';
export const GOLD_CORRIDOR_TASK_ID = 'gold-corridor-public-pilot';
export const GOLD_CORRIDOR_ARTIFACT_ROOT = '.devshots/gold-corridor';
export const GOLD_CORRIDOR_SAVE_SLOT = 'quick';
export const GOLD_CORRIDOR_SAVE_STORAGE_KEY = 'sf.save.quick';

export const GOLD_CORRIDOR_CAREERS = Object.freeze(['hauler', 'hunter', 'prospector']);

/**
 * Canonical milestone order.
 *
 * NOTE ON ORDER: the packet brief lists the semantic milestones as
 * "New Game, career choice, objective acquisition, undock, travel, map use, first dock, ...".
 * The shipped game does not offer a career on the New Game screen (that screen carries pilot name +
 * difficulty only) — career origins are offered/accepted through the public Mission Log, which is
 * only reachable once the run is live and the player is flying. The canonical order below therefore
 * places `run-started` / `undocked` ahead of `career-selected`, matching verified game reality.
 * The milestone SET is unchanged; only the position of the career milestone moved.
 */
export const GOLD_CORRIDOR_MILESTONES = Object.freeze([
  'title-visible',
  'new-game-opened',
  'run-started',
  'undocked',
  'objective-acquired',
  'career-selected',
  'map-used',
  'travel-underway',
  'first-dock',
  'service-used',
  'save-written',
  'continue-restored',
  'clean-teardown',
]);

/**
 * Advisory milestones are reported but never gate the corridor.
 *
 * `career-selected` is advisory because career origin offers are event-driven (careerContracts
 * offers on `dock:docked`), so a legitimate pre-dock run may have no acceptable origin chip yet.
 * Making it a hard gate would mask the real blocker further down the corridor.
 */
export const GOLD_CORRIDOR_ADVISORY_MILESTONES = Object.freeze(['career-selected']);

/** `--stop=<name>` targets → the last milestone the pilot must reach before teardown. */
export const GOLD_CORRIDOR_STOPS = Object.freeze({
  title: 'title-visible',
  'new-game': 'new-game-opened',
  launch: 'run-started',
  undock: 'undocked',
  objective: 'objective-acquired',
  career: 'career-selected',
  map: 'map-used',
  travel: 'travel-underway',
  'first-station': 'first-dock',
  service: 'service-used',
  save: 'save-written',
  continue: 'continue-restored',
  full: 'clean-teardown',
});

export const GOLD_CORRIDOR_DEFAULT_STOP = 'full';

/** Coarse stage name per milestone — what a human would call the part of the run that stalled. */
const MILESTONE_STAGES = Object.freeze({
  'title-visible': 'title',
  'new-game-opened': 'new-game',
  'run-started': 'launch',
  undocked: 'free-flight',
  'objective-acquired': 'objective',
  'career-selected': 'career',
  'map-used': 'map',
  'travel-underway': 'travel',
  'first-dock': 'first-dock',
  'service-used': 'station-service',
  'save-written': 'save',
  'continue-restored': 'continue',
  'clean-teardown': 'teardown',
});

export const GOLD_CORRIDOR_SCREENSHOTS = Object.freeze({
  title: '01-title.png',
  newGame: '02-new-game.png',
  flight: '03-flight-undocked.png',
  objective: '04-objective.png',
  map: '05-galaxy-map.png',
  approach: '06-approach.png',
  dock: '07-first-dock.png',
  service: '08-station-service.png',
  save: '09-pre-save.png',
  title2: '10-title-continue.png',
  restored: '11-continue-restored.png',
  failure: 'failure.png',
});

const BLOCKER_PREFIX = 'GOLD-CORRIDOR-BLOCKER';

// ---------------------------------------------------------------------------
// Pure helpers — milestone schema + ordering
// ---------------------------------------------------------------------------

/**
 * Finite-number coercion. NaN/Infinity/null/undefined/booleans/objects/blank strings all collapse
 * to `fallback` (default null). Deliberately stricter than `Number()`, which would silently turn
 * `null` and `''` into 0 and let a missing timestamp masquerade as "at 0ms".
 */
export function finiteOrNull(value, fallback = null) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

export function isKnownMilestone(id) {
  return GOLD_CORRIDOR_MILESTONES.includes(String(id));
}

/** Canonical index, or -1 when the id is not a corridor milestone. */
export function milestoneIndex(id) {
  return GOLD_CORRIDOR_MILESTONES.indexOf(String(id));
}

export function milestoneStage(id) {
  return MILESTONE_STAGES[String(id)] || 'unknown';
}

export function isAdvisoryMilestone(id) {
  return GOLD_CORRIDOR_ADVISORY_MILESTONES.includes(String(id));
}

export function resolveStopMilestone(stop) {
  const key = String(stop || GOLD_CORRIDOR_DEFAULT_STOP);
  return Object.prototype.hasOwnProperty.call(GOLD_CORRIDOR_STOPS, key)
    ? GOLD_CORRIDOR_STOPS[key]
    : null;
}

/**
 * Milestones that MUST be reached for a given `--stop` target: the canonical prefix through the
 * stop milestone, minus advisory milestones, plus `clean-teardown` (always required).
 */
export function requiredMilestonesFor(stop) {
  const target = resolveStopMilestone(stop);
  if (!target) return [];
  const end = milestoneIndex(target);
  const required = GOLD_CORRIDOR_MILESTONES
    .slice(0, end + 1)
    .filter((id) => !isAdvisoryMilestone(id));
  if (!required.includes('clean-teardown')) required.push('clean-teardown');
  return required;
}

/**
 * Build one milestone record. Fail-closed: an unknown id or a non-finite time never throws and
 * never produces a half-formed record — it produces a defined record flagged invalid.
 */
export function buildMilestoneRecord({ id, atMs, note = '', detail = null, advisory } = {}) {
  const milestoneId = String(id == null ? '' : id);
  const known = isKnownMilestone(milestoneId);
  const at = finiteOrNull(atMs);
  return {
    schema: GOLD_CORRIDOR_SCHEMA,
    id: milestoneId,
    index: known ? milestoneIndex(milestoneId) : -1,
    stage: known ? milestoneStage(milestoneId) : 'unknown',
    advisory: typeof advisory === 'boolean' ? advisory : isAdvisoryMilestone(milestoneId),
    atMs: at,
    note: String(note || ''),
    detail: detail && typeof detail === 'object' ? detail : null,
    valid: known && at !== null && at >= 0,
  };
}

/**
 * Ordering rule: observed milestones must form a strictly-increasing subsequence of the canonical
 * order (no unknown ids, no duplicates, no regressions), times must be finite and non-decreasing,
 * and every required milestone for the stop target must be present.
 */
export function validateMilestoneOrder(records, { stop = GOLD_CORRIDOR_DEFAULT_STOP } = {}) {
  const failures = [];
  const list = Array.isArray(records) ? records : [];
  if (!Array.isArray(records)) failures.push('milestones must be an array');

  let lastIndex = -1;
  let lastAt = -Infinity;
  const seen = new Set();
  for (const record of list) {
    const id = String(record?.id ?? '');
    if (!isKnownMilestone(id)) {
      failures.push(`unknown milestone: ${id || '(empty)'}`);
      continue;
    }
    if (seen.has(id)) failures.push(`duplicate milestone: ${id}`);
    seen.add(id);
    const index = milestoneIndex(id);
    if (index <= lastIndex) failures.push(`milestone out of order: ${id}`);
    else lastIndex = index;
    const at = finiteOrNull(record?.atMs);
    if (at === null) failures.push(`milestone has non-finite time: ${id}`);
    else {
      if (at < lastAt) failures.push(`milestone time went backwards: ${id}`);
      lastAt = at;
    }
  }

  const target = resolveStopMilestone(stop);
  if (!target) failures.push(`unknown stop target: ${stop}`);
  for (const id of requiredMilestonesFor(stop)) {
    if (!seen.has(id)) failures.push(`missing required milestone: ${id}`);
  }

  return {
    pass: failures.length === 0,
    failures,
    reached: [...seen],
    lastReached: lastIndex >= 0 ? GOLD_CORRIDOR_MILESTONES[lastIndex] : null,
    stopMilestone: target,
  };
}

/** Highest canonical milestone actually reached, or null. */
export function lastReachedMilestone(records) {
  const list = Array.isArray(records) ? records : [];
  let best = -1;
  for (const record of list) {
    const index = milestoneIndex(record?.id);
    if (index > best) best = index;
  }
  return best >= 0 ? GOLD_CORRIDOR_MILESTONES[best] : null;
}

/** Next non-advisory milestone the corridor still owed, given what was reached. */
export function nextExpectedMilestone(records, { stop = GOLD_CORRIDOR_DEFAULT_STOP } = {}) {
  const reached = new Set((Array.isArray(records) ? records : [])
    .map((record) => String(record?.id ?? '')));
  for (const id of requiredMilestonesFor(stop)) {
    if (!reached.has(id)) return id;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Pure helpers — timeout / stall classification
// ---------------------------------------------------------------------------

/**
 * Classify a stalled or failed run against the milestone that was not reached.
 * Always returns a defined classification object with a parseable `blocker` line; never throws.
 */
export function classifyStall({
  milestones = [],
  stop = GOLD_CORRIDOR_DEFAULT_STOP,
  blockedMilestone = null,
  cause = 'timeout',
  elapsedMs = null,
  timeoutMs = null,
  message = '',
} = {}) {
  const lastReached = lastReachedMilestone(milestones);
  const inferred = blockedMilestone && isKnownMilestone(blockedMilestone)
    ? String(blockedMilestone)
    : nextExpectedMilestone(milestones, { stop });
  const target = resolveStopMilestone(stop);
  const causeName = String(cause || 'unknown') || 'unknown';
  const blocked = inferred || null;

  const classification = {
    schema: GOLD_CORRIDOR_SCHEMA,
    classified: blocked !== null || causeName !== 'timeout',
    kind: blocked ? 'milestone-not-reached' : 'no-milestone-outstanding',
    cause: causeName,
    blockedMilestone: blocked,
    blockedStage: blocked ? milestoneStage(blocked) : 'unknown',
    lastReachedMilestone: lastReached,
    lastReachedIndex: lastReached ? milestoneIndex(lastReached) : -1,
    stop: String(stop || GOLD_CORRIDOR_DEFAULT_STOP),
    stopMilestone: target,
    elapsedMs: finiteOrNull(elapsedMs),
    timeoutMs: finiteOrNull(timeoutMs),
    message: String(message || ''),
    blocker: '',
  };
  classification.blocker = formatBlocker(classification);
  return classification;
}

/** Stable, machine-parseable one-line blocker. Downstream packets consume this exact shape. */
export function formatBlocker(classification = {}) {
  const blocked = classification.blockedMilestone || 'none';
  const stage = classification.blockedStage || milestoneStage(blocked);
  const last = classification.lastReachedMilestone || 'none';
  const target = classification.stopMilestone || 'none';
  const cause = classification.cause || 'unknown';
  const elapsed = finiteOrNull(classification.elapsedMs);
  const timeout = finiteOrNull(classification.timeoutMs);
  const parts = [
    BLOCKER_PREFIX,
    `milestone=${blocked}`,
    `stage=${stage}`,
    `last-reached=${last}`,
    `target=${target}`,
    `cause=${cause}`,
    `elapsed-ms=${elapsed === null ? 'unknown' : Math.round(elapsed)}`,
    `timeout-ms=${timeout === null ? 'unknown' : Math.round(timeout)}`,
  ];
  const detail = String(classification.message || '').replace(/\s+/g, ' ').trim();
  return detail ? `${parts.join(' ')} :: ${detail}` : parts.join(' ');
}

/** Inverse of formatBlocker for downstream consumers (G04). Returns null on a non-blocker line. */
export function parseBlocker(line) {
  const text = String(line || '');
  if (!text.startsWith(BLOCKER_PREFIX)) return null;
  const [head, ...rest] = text.split(' :: ');
  const fields = {};
  for (const token of head.slice(BLOCKER_PREFIX.length).trim().split(/\s+/)) {
    const eq = token.indexOf('=');
    if (eq <= 0) continue;
    fields[token.slice(0, eq)] = token.slice(eq + 1);
  }
  return {
    milestone: fields.milestone || null,
    stage: fields.stage || null,
    lastReached: fields['last-reached'] || null,
    target: fields.target || null,
    cause: fields.cause || null,
    elapsedMs: fields['elapsed-ms'] === 'unknown' ? null : finiteOrNull(fields['elapsed-ms']),
    timeoutMs: fields['timeout-ms'] === 'unknown' ? null : finiteOrNull(fields['timeout-ms']),
    message: rest.join(' :: ') || '',
  };
}

// ---------------------------------------------------------------------------
// Pure helpers — route identity, cleanup receipt, argv
// ---------------------------------------------------------------------------

/** Build/worktree identity fields the receipt must carry. */
export function buildRouteIdentity({
  fingerprint = null,
  rootUrl = '',
  career = '',
  stop = GOLD_CORRIDOR_DEFAULT_STOP,
  runtimeKind = 'browser',
  nodeVersion = '',
  platform = '',
  browserExecutable = '',
} = {}) {
  return {
    schema: GOLD_CORRIDOR_SCHEMA,
    taskId: GOLD_CORRIDOR_TASK_ID,
    runtimeKind: String(runtimeKind || 'browser'),
    career: String(career || ''),
    stop: String(stop || GOLD_CORRIDOR_DEFAULT_STOP),
    stopMilestone: resolveStopMilestone(stop),
    rootUrl: String(rootUrl || ''),
    inputSource: 'playwright-keyboard-pointer',
    injectedState: false,
    worktree: {
      id: fingerprint?.id || null,
      branch: fingerprint?.branch || null,
      head: fingerprint?.head || null,
      dirty: fingerprint?.dirty === true,
      digest: fingerprint?.digest || null,
      untrackedCount: finiteOrNull(fingerprint?.untracked?.count, 0),
    },
    nodeVersion: String(nodeVersion || ''),
    platform: String(platform || ''),
    browserExecutable: String(browserExecutable || ''),
  };
}

/** Normalize a `closeOwnedResources` report (or a thrown cleanup error) into a stable receipt. */
export function buildCleanupReceipt(raw = null) {
  const report = raw && typeof raw === 'object' ? raw : {};
  const closed = Array.isArray(report.closed) ? report.closed : [];
  const failures = Array.isArray(report.failures)
    ? report.failures.map((failure) => (typeof failure === 'string'
      ? failure
      : `${failure?.name || 'cleanup'}: ${failure?.error?.message || 'failed'}`))
    : [];
  const receipt = {
    schema: GOLD_CORRIDOR_SCHEMA,
    attempted: raw != null,
    pageClosed: report.pageClosed === true,
    contextClosed: report.contextClosed === true,
    browserDisconnected: report.browserDisconnected === true,
    serverReleased: report.serverReleased === true,
    closed: closed.map((item) => ({
      name: String(item?.name || ''),
      present: item?.present === true,
      closed: item?.closed === true,
    })),
    failures,
    leakedResources: [],
    pass: false,
  };
  for (const [name, ok] of [
    ['page', receipt.pageClosed],
    ['context', receipt.contextClosed],
    ['browser', receipt.browserDisconnected],
    ['server', receipt.serverReleased],
  ]) {
    if (!ok) receipt.leakedResources.push(name);
  }
  receipt.pass = receipt.attempted && receipt.leakedResources.length === 0 && failures.length === 0;
  return receipt;
}

/** Full JSON receipt. Never throws; missing pieces become explicit nulls/empties. */
export function buildPilotReceipt({
  identity = null,
  milestones = [],
  actions = [],
  classification = null,
  consoleErrors = [],
  pageErrors = [],
  cleanup = null,
  artifacts = [],
  generatedAt = '',
  saveSlot = null,
} = {}) {
  const milestoneRecords = (Array.isArray(milestones) ? milestones : [])
    .map((record) => (record && record.schema === GOLD_CORRIDOR_SCHEMA
      ? record
      : buildMilestoneRecord(record || {})));
  const stop = identity?.stop || GOLD_CORRIDOR_DEFAULT_STOP;
  const order = validateMilestoneOrder(milestoneRecords, { stop });
  const cleanupReceipt = buildCleanupReceipt(cleanup);
  const pass = order.pass && cleanupReceipt.pass && classification == null
    && consoleErrors.length === 0 && pageErrors.length === 0;
  return {
    schema: GOLD_CORRIDOR_SCHEMA,
    taskId: GOLD_CORRIDOR_TASK_ID,
    generatedAt: String(generatedAt || ''),
    pass,
    identity,
    saveSlot: saveSlot == null ? null : String(saveSlot),
    milestones: milestoneRecords,
    milestoneOrder: order,
    actions: (Array.isArray(actions) ? actions : []).map((action) => ({
      kind: String(action?.kind || ''),
      input: String(action?.input || ''),
      target: String(action?.target || ''),
      atMs: finiteOrNull(action?.atMs),
    })),
    failureStage: classification?.blockedStage || null,
    blocker: classification?.blocker || null,
    classification,
    consoleErrors: Array.isArray(consoleErrors) ? consoleErrors : [],
    pageErrors: Array.isArray(pageErrors) ? pageErrors : [],
    cleanup: cleanupReceipt,
    artifacts: (Array.isArray(artifacts) ? artifacts : []).map(String),
  };
}

/** Parse `--career=` / `--stop=` / `--timeout-scale=`. Fail-closed on unknown or non-finite input. */
export function parsePilotArgv(argv = []) {
  const args = Array.isArray(argv) ? argv.map(String) : [];
  const errors = [];
  let career = GOLD_CORRIDOR_CAREERS[0];
  let stop = GOLD_CORRIDOR_DEFAULT_STOP;
  let timeoutScale = 1;
  let headless = false;

  for (const arg of args) {
    if (arg.startsWith('--career=')) {
      const value = arg.slice('--career='.length);
      if (!GOLD_CORRIDOR_CAREERS.includes(value)) errors.push(`unknown career: ${value}`);
      else career = value;
    } else if (arg.startsWith('--stop=')) {
      const value = arg.slice('--stop='.length);
      if (!resolveStopMilestone(value)) errors.push(`unknown stop target: ${value}`);
      else stop = value;
    } else if (arg.startsWith('--timeout-scale=')) {
      const value = finiteOrNull(arg.slice('--timeout-scale='.length));
      if (value === null || value <= 0) errors.push(`invalid timeout scale: ${arg}`);
      else timeoutScale = Math.min(10, value);
    } else if (arg === '--headless') {
      headless = true;
    } else if (arg.startsWith('--')) {
      errors.push(`unknown flag: ${arg}`);
    }
  }

  return {
    career,
    stop,
    stopMilestone: resolveStopMilestone(stop),
    timeoutScale,
    headless,
    errors,
    ok: errors.length === 0,
  };
}

// ---------------------------------------------------------------------------
// Pure helpers — refusal-to-inject source contract
// ---------------------------------------------------------------------------

// The forbidden patterns are assembled from fragments at runtime so this pattern table can be
// scanned by itself without false-positiving on its own source. Do not inline the literals.
const FORBIDDEN_SOURCE_PATTERNS = Object.freeze([
  // Any receiver, not just a variable literally named `bus` — an aliased handle injects just as hard.
  { parts: ['\\.', 'emit', '\\('], message: 'must not emit gameplay events (observe only)' },
  { parts: ['state', '\\.', 'mode', '\\s*=(?!=)'], message: 'must not assign game mode' },
  { parts: ['currentSectorId', '\\s*=(?!=)'], message: 'must not assign the current sector' },
  { parts: ['player', '\\.', 'pos', '\\.', '(?:x|z)', '\\s*=(?!=)'], message: 'must not teleport the player' },
  { parts: ['player', '\\.', 'credits', '\\s*=(?!=)'], message: 'must not assign player credits' },
  { parts: ['dispatch', 'Event', '\\('], message: 'must not synthesize DOM events (bypasses public input)' },
  { parts: ['new', '\\s+', 'Keyboard', 'Event'], message: 'must not synthesize keyboard events' },
  { parts: ['new', '\\s+', 'Mouse', 'Event'], message: 'must not synthesize mouse events' },
  { parts: ['new', '\\s+', 'Pointer', 'Event'], message: 'must not synthesize pointer events' },
  { parts: ['enter', 'Sector', '\\s*\\('], message: 'must not call internal sector transitions' },
  { parts: ['debug', 'Flight'], message: 'must not use debug-flight as player proof' },
  { parts: ['[?&]', 'debug', '='], message: 'must not use query debug flags' },
  { parts: ['force', 'Dock', '|', 'teleport', 'Player', '|', 'fake', 'Dock'], message: 'must not name teleport/fake helpers' },
]);

const REQUIRED_SOURCE_PATTERNS = Object.freeze([
  { parts: ['runGoldCorridorPublicPilot'], message: 'shared pilot export must exist' },
  { parts: ['keyboard', '\\.', 'press'], message: 'must drive input through the public keyboard surface' },
  { parts: ['closeOwnedResources'], message: 'must clean up owned browser/server resources' },
  { parts: ['classifyStall'], message: 'must classify stalls against a milestone' },
  { parts: ['\\.devshots'], message: 'evidence must go to the ignored artifact tree' },
]);

function compilePattern(entry) {
  return new RegExp(entry.parts.join(''));
}

function stripSourceComments(value) {
  return String(value || '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[\n\r])\s*\/\/.*$/gm, '$1');
}

/**
 * Fail-closed static contract: the pilot core and its driver script must stay non-injecting and
 * must keep the public seams. Scans BOTH sources for forbidden patterns (the pattern table above is
 * fragment-assembled precisely so this file can scan itself) and the union for required seams.
 */
export function validatePilotSources({ pilotSrc = '', driverSrc = '', testSrc = '' } = {}) {
  const failures = [];
  const pilot = stripSourceComments(pilotSrc);
  const driver = stripSourceComments(driverSrc);
  const scanned = [pilot, driver].filter((value) => value.trim()).join('\n');
  if (!scanned.trim()) failures.push('no sources provided');

  for (const entry of FORBIDDEN_SOURCE_PATTERNS) {
    if (compilePattern(entry).test(scanned)) failures.push(entry.message);
  }

  const combined = [scanned, stripSourceComments(testSrc)].join('\n');
  for (const entry of REQUIRED_SOURCE_PATTERNS) {
    if (!compilePattern(entry).test(combined)) failures.push(entry.message);
  }

  return { pass: failures.length === 0, failures: [...new Set(failures)] };
}

export function repoRel(root, absPath) {
  return path.relative(root, absPath).replace(/\\/g, '/');
}

// ---------------------------------------------------------------------------
// Browser driver (Playwright page is injected; this module never launches anything)
// ---------------------------------------------------------------------------

const OBSERVED_EVENTS = Object.freeze([
  'game:started',
  'game:new',
  'mission:offered',
  'mission:accepted',
  'mission:updated',
  'nav:waypoint',
  'nav:autopilot',
  'dock:docked',
  'dock:undocked',
  'ui:service',
  'economy:marketOpened',
  'save:completed',
  'save:loaded',
  'jump:arrive',
  'sector:enter',
]);

const BASE_TIMEOUTS = Object.freeze({
  boot: 90_000,
  title: 60_000,
  newGame: 30_000,
  launch: 180_000,
  undock: 45_000,
  objective: 60_000,
  career: 20_000,
  map: 30_000,
  travel: 60_000,
  dock: 360_000,
  service: 60_000,
  save: 30_000,
  continue: 180_000,
});

/**
 * Drive the gold corridor with public input only.
 *
 * Returns `{ pass, milestones, actions, classification, saveSlot, screenshots }`. A route that
 * cannot reach a milestone resolves (it does not throw) with `pass:false` and a classified
 * blocker — a failed route with a precise blocker is a successful harness.
 */
export async function runGoldCorridorPublicPilot({
  page,
  outputDir,
  expectedRootUrl = '',
  career = GOLD_CORRIDOR_CAREERS[0],
  stop = GOLD_CORRIDOR_DEFAULT_STOP,
  timeoutScale = 1,
  log = () => {},
  now = () => Date.now(),
} = {}) {
  if (!page) throw new TypeError('gold corridor pilot requires a Playwright page');
  if (!outputDir) throw new TypeError('gold corridor pilot requires an output directory');

  const scale = finiteOrNull(timeoutScale, 1) || 1;
  const budget = (key) => Math.max(1_000, Math.round((BASE_TIMEOUTS[key] || 30_000) * scale));
  const startedAt = now();
  const milestones = [];
  const actions = [];
  const screenshots = [];
  const stopMilestone = resolveStopMilestone(stop) || GOLD_CORRIDOR_STOPS[GOLD_CORRIDOR_DEFAULT_STOP];
  const stopIndex = milestoneIndex(stopMilestone);

  const elapsed = () => now() - startedAt;
  const mark = (id, detail = null, note = '') => {
    const record = buildMilestoneRecord({ id, atMs: elapsed(), note, detail });
    milestones.push(record);
    log(`[gold-corridor] milestone ${id} @${Math.round(record.atMs ?? 0)}ms${note ? ` — ${note}` : ''}`);
    return record;
  };
  const act = (kind, input, target = '') => {
    actions.push({ kind, input, target, atMs: elapsed() });
    return page;
  };
  const shot = async (name) => {
    try {
      await page.screenshot({ path: path.join(outputDir, name), type: 'png', animations: 'allow' });
      screenshots.push(name);
    } catch (_) { /* screenshots are evidence, never a gate */ }
  };

  let classification = null;
  const fail = (milestoneId, cause, error) => {
    if (classification) return classification;
    classification = classifyStall({
      milestones,
      stop,
      blockedMilestone: milestoneId,
      cause,
      elapsedMs: elapsed(),
      timeoutMs: null,
      message: error?.message || String(error || ''),
    });
    log(`[gold-corridor] ${classification.blocker}`);
    return classification;
  };

  /** Run one corridor step under a bounded budget; classify (not throw) on failure. */
  const step = async (milestoneId, budgetKey, body, { advisory = false } = {}) => {
    if (classification) return false;
    if (milestoneIndex(milestoneId) > stopIndex) return false;
    const timeoutMs = budget(budgetKey);
    const stepStart = now();
    try {
      // The guard is a backstop for a body that ignores its OWN budget. Give it headroom so a
      // self-bounding body (the dock approach loop, Playwright waitForFunction) always throws its
      // own informative error first — otherwise the guard preempts it and the diagnostic detail
      // (closest approach in WU, dock-prompt state) is lost from the receipt.
      const detail = await withDeadline(body({ timeoutMs }), timeoutMs + 8_000, milestoneId);
      mark(milestoneId, detail && typeof detail === 'object' ? detail : null);
      return true;
    } catch (error) {
      if (advisory) {
        log(`[gold-corridor] advisory milestone ${milestoneId} not reached: ${error?.message || error}`);
        return false;
      }
      classification = classifyStall({
        milestones,
        stop,
        blockedMilestone: milestoneId,
        cause: /gold-corridor deadline/.test(String(error?.message || '')) ? 'timeout' : 'error',
        elapsedMs: now() - stepStart,
        timeoutMs,
        message: error?.message || String(error || ''),
      });
      log(`[gold-corridor] ${classification.blocker}`);
      await shot(GOLD_CORRIDOR_SCREENSHOTS.failure);
      return false;
    }
  };

  try {
    await page.waitForFunction(() => !!(window.SF && window.SF.state && window.SF.bus), null,
      { timeout: budget('boot') });
    await installPilotObservers(page);
  } catch (error) {
    fail('title-visible', 'boot', error);
  }

  await step('title-visible', 'title', async ({ timeoutMs }) => {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const splash = page.locator('#cinematic-splash');
      if (await splash.isVisible().catch(() => false)) {
        act('key', 'Space', 'cinematic-splash');
        await page.keyboard.press('Space');
        await splash.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
      }
      const landed = await page.waitForFunction(isMainMenuVisibleInPage, null, { timeout: 15_000 })
        .then(() => true).catch(() => false);
      if (landed) break;
      act('key', 'Escape', 'boot');
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(350);
    }
    await page.waitForFunction(isMainMenuVisibleInPage, null, { timeout: timeoutMs });
    await shot(GOLD_CORRIDOR_SCREENSHOTS.title);
    return { screen: 'mainMenu' };
  });

  await step('new-game-opened', 'newGame', async ({ timeoutMs }) => {
    act('click', 'New Game', '[data-screen="mainMenu"]');
    await page.getByRole('button', { name: 'New Game', exact: true }).click({ timeout: timeoutMs });
    await page.locator('[data-screen="newGame"]').first()
      .waitFor({ state: 'visible', timeout: timeoutMs });
    await shot(GOLD_CORRIDOR_SCREENSHOTS.newGame);
    return { screen: 'newGame' };
  });

  await step('run-started', 'launch', async ({ timeoutMs }) => {
    act('click', 'Launch', '[data-screen="newGame"]');
    await page.getByRole('button', { name: 'Launch', exact: true }).click({ timeout: 30_000 });
    await page.waitForFunction(isFlightReadyInPage, null, { timeout: timeoutMs });
    const snapshot = await readPilotSnapshot(page);
    if (snapshot.mode !== 'flight') throw new Error(`Launch did not enter flight (mode=${snapshot.mode})`);
    return { mode: snapshot.mode, sectorId: snapshot.sectorId, tick: snapshot.tick };
  });

  await step('undocked', 'undock', async ({ timeoutMs }) => {
    const canvas = page.locator('#gl-canvas');
    await canvas.waitFor({ state: 'visible', timeout: timeoutMs });
    const box = await canvas.boundingBox();
    if (!box || box.width < 100) throw new Error('flight canvas is not visible');
    await page.mouse.move(Math.round(box.x + box.width * 0.55), Math.round(box.y + box.height * 0.48));
    await canvas.focus().catch(() => {});
    const before = await readPilotSnapshot(page);
    act('key-hold', 'KeyW', 'gl-canvas');
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(1_400);
    await page.keyboard.up('KeyW');
    const after = await readPilotSnapshot(page);
    if (after.docked === true) throw new Error('player is still docked after launch');
    const moved = Math.hypot(
      (after.player?.pos?.x ?? 0) - (before.player?.pos?.x ?? 0),
      (after.player?.pos?.z ?? 0) - (before.player?.pos?.z ?? 0),
    );
    if (!(moved > 1)) throw new Error(`public helm input produced no motion (moved=${moved.toFixed(3)})`);
    await shot(GOLD_CORRIDOR_SCREENSHOTS.flight);
    return { movedWu: Number(moved.toFixed(3)), speed: after.player?.speed ?? null };
  });

  await step('objective-acquired', 'objective', async ({ timeoutMs }) => {
    const found = await page.waitForFunction(() => {
      const tracker = document.querySelector('.sf-mission-tracker');
      const text = tracker && !tracker.hidden ? String(tracker.textContent || '').trim() : '';
      if (text.length > 3) return { source: 'hud', text: text.slice(0, 160) };
      const events = window.__GOLD_CORRIDOR__?.events || [];
      const offered = events.find((entry) => entry.event === 'mission:offered');
      if (offered) return { source: 'mission:offered', text: '' };
      const story = window.SF?.state?.story;
      if (story && Number.isFinite(Number(story.beatIndex))) {
        return { source: 'story-beat', text: `beat ${story.beatIndex}` };
      }
      return null;
    }, null, { timeout: timeoutMs }).then((handle) => handle.jsonValue());
    await shot(GOLD_CORRIDOR_SCREENSHOTS.objective);
    return found;
  });

  await step('career-selected', 'career', async ({ timeoutMs }) => {
    act('key', 'KeyJ', 'mission-log');
    await page.keyboard.press('KeyJ').catch(() => {});
    const log = page.locator('[data-screen="missionLog"]').first();
    await log.waitFor({ state: 'visible', timeout: Math.min(timeoutMs, 10_000) });
    const accept = page.locator(
      `[data-career-act="originAccept"][data-career-id="${career}"]`,
    ).first();
    await accept.waitFor({ state: 'visible', timeout: Math.min(timeoutMs, 10_000) });
    act('click', 'originAccept', career);
    await accept.click({ timeout: 8_000 });
    await page.waitForTimeout(400);
    act('key', 'Escape', 'mission-log');
    await page.keyboard.press('Escape').catch(() => {});
    return { career, via: 'mission-log-origin-accept' };
  }, { advisory: true });

  // The advisory career step may have left a screen open; return to flight through public Escape.
  await closeAnyOpenScreen(page, act);

  let dockTarget = null;
  await step('map-used', 'map', async ({ timeoutMs }) => {
    act('key', 'KeyN', 'galaxy-map');
    await page.keyboard.press('KeyN');
    await page.locator('[data-screen="galaxyMap"]').first()
      .waitFor({ state: 'visible', timeout: timeoutMs });
    await shot(GOLD_CORRIDOR_SCREENSHOTS.map);
    dockTarget = await readNearestStation(page);
    if (!dockTarget?.name) throw new Error('no dockable station entity visible from the public map');
    await searchAndSelectOnMap(page, dockTarget.name, act);
    const setWaypoint = page.getByRole('button', { name: 'Set Waypoint', exact: true });
    await setWaypoint.waitFor({ state: 'visible', timeout: 10_000 });
    act('click', 'Set Waypoint', dockTarget.name);
    await setWaypoint.click({ timeout: 8_000 }).catch(async () => {
      await page.waitForTimeout(150);
      await setWaypoint.click({ timeout: 8_000 });
    });
    return { station: dockTarget.name, distanceWu: Number((dockTarget.dist ?? 0).toFixed(3)) };
  });

  await step('travel-underway', 'travel', async ({ timeoutMs }) => {
    await page.waitForFunction(() => {
      const autopilot = window.SF?.state?.nav?.autopilot;
      return !!(autopilot && autopilot.active === true && autopilot.target);
    }, null, { timeout: timeoutMs });
    const nav = await page.evaluate(() => {
      const autopilot = window.SF?.state?.nav?.autopilot;
      return {
        active: autopilot?.active === true,
        label: String(autopilot?.label || ''),
        status: String(autopilot?.status || ''),
      };
    });
    return nav;
  });

  await step('first-dock', 'dock', async ({ timeoutMs }) => {
    const deadline = now() + timeoutMs;
    let best = Infinity;
    let last = null;
    let prompted = false;
    let promptText = '';
    let dockAttempts = 0;
    while (now() < deadline) {
      last = await readPilotSnapshot(page);
      if (last.player?.alive === false) throw new Error('player died during the station approach');
      if (last.docked === true) break;
      if (Number.isFinite(last.stationDistance)) best = Math.min(best, last.stationDistance);
      if (last.dockPromptVisible === true) {
        if (!prompted) {
          prompted = true;
          promptText = last.dockPromptText || '';
          await shot(GOLD_CORRIDOR_SCREENSHOTS.approach);
        }
        // Public dock binding is E (src/ui/bindings.js). Hold it across a few fixed sim ticks — a
        // zero-duration press can fall entirely between ticks in a headed browser.
        dockAttempts += 1;
        act('key-hold', 'KeyE', 'dock-prompt');
        await page.keyboard.down('KeyE');
        await page.waitForTimeout(250);
        await page.keyboard.up('KeyE').catch(() => {});
        await page.waitForTimeout(350);
        const after = await readPilotSnapshot(page);
        if (after.docked === true) { last = after; break; }
      }
      await page.waitForTimeout(300);
    }
    if (last?.docked !== true) {
      throw new Error(
        `never docked: closest approach ${Number.isFinite(best) ? best.toFixed(3) : 'unknown'} WU, `
        + `final ${Number.isFinite(last?.stationDistance) ? last.stationDistance.toFixed(3) : 'unknown'} WU, `
        + `dock prompt ${prompted ? `seen (${promptText}) but ${dockAttempts} public E hold(s) did not dock` : 'never shown'}`,
      );
    }
    await shot(GOLD_CORRIDOR_SCREENSHOTS.dock);
    return {
      stationId: last.dockedStationId || last.stationId,
      closestWu: Number.isFinite(best) ? Number(best.toFixed(3)) : null,
      dockAttempts,
    };
  });

  await step('service-used', 'service', async ({ timeoutMs }) => {
    const opened = await openStationService(page, act, timeoutMs);
    await shot(GOLD_CORRIDOR_SCREENSHOTS.service);
    return opened;
  });

  await step('save-written', 'save', async ({ timeoutMs }) => {
    await shot(GOLD_CORRIDOR_SCREENSHOTS.save);
    await page.evaluate(() => {
      if (window.__GOLD_CORRIDOR__) window.__GOLD_CORRIDOR__.saved = false;
    });
    act('key', 'Tab', 'focus-release');
    await page.keyboard.press('Tab').catch(() => {});
    act('key', 'F5', 'quick-save');
    await page.keyboard.press('F5');
    await page.waitForFunction((key) => window.__GOLD_CORRIDOR__?.saved === true
      && !!localStorage.getItem(key), GOLD_CORRIDOR_SAVE_STORAGE_KEY, { timeout: timeoutMs });
    return { slot: GOLD_CORRIDOR_SAVE_SLOT, storageKey: GOLD_CORRIDOR_SAVE_STORAGE_KEY };
  });

  await step('continue-restored', 'continue', async ({ timeoutMs }) => {
    act('reload', 'page-reload', expectedRootUrl);
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 90_000 });
    await page.waitForFunction(() => !!(window.SF && window.SF.state), null, { timeout: 60_000 });
    await installPilotObservers(page);
    const splash = page.locator('#cinematic-splash');
    if (await splash.isVisible().catch(() => false)) {
      act('key', 'Space', 'cinematic-splash');
      await page.keyboard.press('Space');
      await splash.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
    }
    await page.waitForFunction(isMainMenuVisibleInPage, null, { timeout: 30_000 });
    await shot(GOLD_CORRIDOR_SCREENSHOTS.title2);
    const continueBtn = page.getByRole('button', { name: 'Continue', exact: true });
    await continueBtn.waitFor({ state: 'visible', timeout: 20_000 });
    act('click', 'Continue', '[data-screen="mainMenu"]');
    await continueBtn.click({ timeout: 20_000 });
    await page.waitForFunction(() => {
      const state = window.SF?.state;
      const player = state?.entities?.get(state.playerId);
      return (state?.mode === 'flight' || state?.mode === 'station') && player && player.alive !== false;
    }, null, { timeout: timeoutMs });
    await shot(GOLD_CORRIDOR_SCREENSHOTS.restored);
    const snapshot = await readPilotSnapshot(page);
    return { mode: snapshot.mode, sectorId: snapshot.sectorId };
  });

  const observed = await readPilotEvents(page).catch(() => []);
  const reached = new Set(milestones.map((record) => record.id));
  const owed = requiredMilestonesFor(stop).filter((id) => id !== 'clean-teardown' && !reached.has(id));
  if (!classification && owed.length > 0) {
    classification = classifyStall({
      milestones,
      stop,
      blockedMilestone: owed[0],
      cause: 'not-reached',
      elapsedMs: elapsed(),
      message: `corridor ended with ${owed.length} required milestone(s) outstanding`,
    });
    log(`[gold-corridor] ${classification.blocker}`);
  }

  return {
    pass: classification === null,
    schema: GOLD_CORRIDOR_SCHEMA,
    career,
    stop,
    stopMilestone,
    milestones,
    actions,
    classification,
    screenshots,
    saveSlot: reached.has('save-written') ? GOLD_CORRIDOR_SAVE_SLOT : null,
    observedEvents: observed.slice(-120),
    expectedRootUrl,
    elapsedMs: elapsed(),
  };
}

/** Record the teardown milestone once the caller has actually released its resources. */
export function markCleanTeardown(result, cleanupReceipt, { atMs = null } = {}) {
  if (!result || !Array.isArray(result.milestones)) return null;
  if (cleanupReceipt?.pass !== true) return null;
  const record = buildMilestoneRecord({
    id: 'clean-teardown',
    atMs: finiteOrNull(atMs, finiteOrNull(result.elapsedMs, 0)),
    note: 'browser/context/server released with no leaked resources',
    detail: { leakedResources: cleanupReceipt.leakedResources || [] },
  });
  result.milestones.push(record);
  return record;
}

// ---------------------------------------------------------------------------
// Page helpers — OBSERVE ONLY (no gameplay writes)
// ---------------------------------------------------------------------------

function withDeadline(promise, timeoutMs, label) {
  let timer = null;
  const guard = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`gold-corridor deadline: ${label} exceeded ${timeoutMs}ms`)),
      timeoutMs,
    );
  });
  return Promise.race([Promise.resolve(promise), guard]).finally(() => clearTimeout(timer));
}

async function installPilotObservers(page) {
  await page.evaluate((eventNames) => {
    const bus = window.SF && window.SF.bus;
    if (!bus || window.__GOLD_CORRIDOR_INSTALLED__) return;
    window.__GOLD_CORRIDOR__ = { events: [], saved: false, loaded: false };
    window.__GOLD_CORRIDOR_INSTALLED__ = true;
    for (const name of eventNames) {
      bus.on(name, (payload) => {
        const store = window.__GOLD_CORRIDOR__;
        let safe = null;
        try {
          safe = payload && typeof payload === 'object'
            ? JSON.parse(JSON.stringify(payload, (_key, value) => (
              typeof value === 'function' ? undefined : value)))
            : payload;
        } catch (_) { safe = null; }
        store.events.push({
          event: name,
          at: performance.now(),
          tick: window.SF?.state?.tick ?? null,
          payload: safe,
        });
        if (store.events.length > 400) store.events.splice(0, store.events.length - 400);
        if (name === 'save:completed') store.saved = true;
        if (name === 'save:loaded') store.loaded = true;
      });
    }
  }, OBSERVED_EVENTS.slice());
}

async function readPilotEvents(page) {
  return page.evaluate(() => (window.__GOLD_CORRIDOR__?.events || []).slice());
}

function isMainMenuVisibleInPage() {
  const el = document.querySelector('[data-screen="mainMenu"]');
  if (!el || el.hidden) return false;
  const style = getComputedStyle(el);
  const rect = el.getBoundingClientRect();
  return style.display !== 'none' && style.visibility !== 'hidden'
    && Number(style.opacity || 1) > 0.01 && rect.width > 1 && rect.height > 1;
}

function isFlightReadyInPage() {
  const state = window.SF?.state;
  const player = state?.entities?.get(state.playerId);
  const modalOpen = document.body.classList.contains('ui-modal-open');
  const splash = document.getElementById('cinematic-splash');
  const splashStyle = splash ? getComputedStyle(splash) : null;
  const splashVisible = !!(splash && !splash.hidden && splashStyle?.display !== 'none'
    && splashStyle?.visibility !== 'hidden');
  return state?.mode === 'flight' && player && player.alive !== false
    && Number(player.hull) > 0 && !modalOpen && !splashVisible;
}

async function readPilotSnapshot(page) {
  return page.evaluate(() => {
    const state = window.SF?.state;
    const player = state?.entities?.get(state.playerId);
    let stationDistance = null;
    let stationId = null;
    if (player?.pos && Array.isArray(state?.entityList)) {
      let best = Infinity;
      for (const entity of state.entityList) {
        if (!entity || entity.alive === false || entity.type !== 'station' || !entity.pos) continue;
        if (entity.data?.isGate) continue;
        const d = Math.hypot(entity.pos.x - player.pos.x, entity.pos.z - player.pos.z);
        if (d < best) {
          best = d;
          stationDistance = d;
          stationId = entity.data?.stationId || entity.data?.id || entity.id || null;
        }
      }
    }
    // The public dock prompt is the live-binding alert (src/ui/bindings.js: dock defaults to E).
    const promptEl = document.querySelector('.sf-alert--dock');
    const promptStyle = promptEl ? getComputedStyle(promptEl) : null;
    const promptVisible = !!(promptEl && !promptEl.hidden && promptStyle.display !== 'none'
      && promptStyle.visibility !== 'hidden' && Number(promptStyle.opacity || 1) > 0.01);
    return {
      mode: state?.mode || null,
      tick: Number(state?.tick || 0),
      sectorId: state?.world?.currentSectorId || null,
      docked: state?.ui?.docked === true,
      dockedStationId: state?.ui?.dockedStationId || null,
      stationId,
      stationDistance,
      dockPromptVisible: promptVisible,
      dockPromptText: promptVisible ? String(promptEl.textContent || '').trim().slice(0, 120) : '',
      player: player ? {
        alive: player.alive !== false && Number(player.hull) > 0,
        pos: { x: Number(player.pos?.x || 0), z: Number(player.pos?.z || 0) },
        speed: Math.hypot(Number(player.vel?.x || 0), Number(player.vel?.z || 0)),
      } : null,
    };
  });
}

async function readNearestStation(page) {
  return page.evaluate(() => {
    const state = window.SF?.state;
    const player = state?.entities?.get(state.playerId);
    if (!player?.pos || !Array.isArray(state?.entityList)) return null;
    let best = null;
    let bestD = Infinity;
    for (const entity of state.entityList) {
      if (!entity || entity.alive === false || entity.type !== 'station' || !entity.pos) continue;
      if (entity.data?.isGate) continue;
      const d = Math.hypot(entity.pos.x - player.pos.x, entity.pos.z - player.pos.z);
      if (d < bestD) {
        bestD = d;
        best = { name: entity.data?.name || 'Station', dist: d, entityId: entity.id };
      }
    }
    return best;
  });
}

async function searchAndSelectOnMap(page, query, act) {
  act('key', 'Slash', 'map-search');
  await page.keyboard.press('/');
  await page.waitForFunction(
    () => document.activeElement?.matches('.gm-search-input') === true,
    null,
    { timeout: 5_000 },
  );
  await page.keyboard.press('Control+A').catch(() => {});
  act('type', query, 'map-search');
  await page.keyboard.type(query, { delay: 20 });
  await page.locator('.gm-search-item-name').first().waitFor({ state: 'visible', timeout: 10_000 });
  const items = page.locator('.gm-search-item');
  const count = await items.count();
  for (let i = 0; i < count; i += 1) {
    const text = (await items.nth(i).innerText()).trim();
    if (text.toLowerCase().includes(String(query).toLowerCase().slice(0, 8))) {
      act('click', 'map-search-item', text.slice(0, 60));
      await items.nth(i).click({ timeout: 5_000 });
      return;
    }
  }
  act('key', 'Enter', 'map-search');
  await page.keyboard.press('Enter');
}

async function closeAnyOpenScreen(page, act) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const flight = await page.evaluate(() => window.SF?.state?.mode === 'flight').catch(() => false);
    const overlay = await page.locator('[data-screen="missionLog"], [data-screen="galaxyMap"]')
      .first().isVisible().catch(() => false);
    if (flight && !overlay) return;
    act('key', 'Escape', 'close-screen');
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(300);
  }
}

async function openStationService(page, act, timeoutMs) {
  // Public station surface. The command dock renders its destinations as a real ARIA tablist
  // (src/ui/station/dock.js: `<button role="tab" data-nav="...">`), so an explicit role="tab"
  // shadows the implicit button role — getByRole('button') can NOT reach them. Drive the tablist
  // first, then fall back to the plain action buttons (Repair/Refuel/Resupply).
  const tabs = ['market', 'shipworks', 'industry', 'missions', 'factions', 'bar'];
  const actions = ['Repair', 'Refuel', 'Resupply', 'Outfitting', 'Shipyard'];
  const candidates = [
    ...tabs.map((id) => ({ label: id, locator: page.locator(`.sx-dock [data-nav="${id}"]`).first() })),
    ...tabs.map((id) => ({ label: id, locator: page.getByRole('tab', { name: new RegExp(id, 'i') }).first() })),
    ...actions.map((label) => ({
      label,
      locator: page.getByRole('button', { name: new RegExp(`^${label}$`, 'i') }).first(),
    })),
  ];
  for (const { label, locator } of candidates) {
    const visible = await locator.isVisible().catch(() => false);
    if (!visible) continue;
    act('click', label, 'station-dock');
    await locator.click({ timeout: Math.min(timeoutMs, 10_000) });
    await page.waitForTimeout(600);
    const settled = await page.evaluate(() => ({
      screens: Array.from(document.querySelectorAll('[data-screen]'))
        .filter((el) => !el.hidden && getComputedStyle(el).display !== 'none')
        .map((el) => el.getAttribute('data-screen')),
      serviceEvents: (window.__GOLD_CORRIDOR__?.events || [])
        .filter((entry) => entry.event === 'ui:service' || entry.event === 'economy:marketOpened')
        .length,
    }));
    return { service: label, ...settled };
  }
  throw new Error('no public station service command was visible while docked');
}
