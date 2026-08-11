/**
 * Pure selection/memory logic for the autonomous INFERENCE system.
 *
 * Everything here takes plain data and returns plain data — no filesystem,
 * no repo imports — so test/inference-core.test.mjs can pin the behavior
 * with synthetic fixtures. scripts/inference-detect.mjs gathers repo facts
 * and calls into this module; scripts/inference-record.mjs appends memory.
 *
 * Design intent (see design/program/INFERENCE_LANES.md):
 * - Structural counts DETECT thinness; they do not alone CHOOSE the task.
 * - A director board offers one pick per mode cell (repair / starved /
 *   opportunity / integration / recovery) so repeated runs cannot collapse
 *   onto whichever registry is easiest to count.
 * - Memory decays; rejected ideas block resurrection for a window; domains
 *   never structurally measured still get scheduled via staleness.
 */

export const MEMORY_SCHEMA = 'spaceface.inferenceMemory.v1';

export const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Every workflow domain. `measured: true` means inference-detect has at least
// one structural metric feeding it; the rest can only be reached through the
// starvation scheduler, so they must never be dropped from this table.
export const DOMAINS = [
  { wf: 'WF-01', name: 'NPC occupations / living world', measured: true },
  { wf: 'WF-02', name: 'enemy roster / encounters', measured: true },
  { wf: 'WF-03', name: 'sector / world composition', measured: true },
  { wf: 'WF-04', name: 'stations / destinations', measured: true },
  { wf: 'WF-05', name: 'weapons / physics tools', measured: true },
  { wf: 'WF-06', name: 'economy / logistics', measured: false },
  { wf: 'WF-07', name: 'progression / ships / modules', measured: true },
  { wf: 'WF-08', name: 'missions / activities', measured: false },
  { wf: 'WF-09', name: 'narrative / characters / ledger', measured: false },
  { wf: 'WF-10', name: 'exploration / discovery', measured: false },
  { wf: 'WF-11', name: 'graphics asset families', measured: true },
  { wf: 'WF-12', name: 'VFX / camera / visual feel', measured: false },
  { wf: 'WF-13', name: 'audio / world sound', measured: false },
  { wf: 'WF-14', name: 'UI / UX / onboarding', measured: false },
  { wf: 'WF-15', name: 'gameplay feel / balance', measured: false },
  { wf: 'WF-16', name: 'variants / states / aftermath', measured: false },
  { wf: 'WF-17', name: 'vertical slice / integration', measured: false },
  { wf: 'WF-18', name: 'design recovery / simplification', measured: false },
  { wf: 'WF-19', name: 'technical production / performance', measured: false },
];

// Scope keywords accepted after `INFERENCE Nx <SCOPE>`. Multi-domain scopes
// (POLISH, WORLD, ...) expand to several workflows on purpose: a 5x POLISH
// slate must be able to span layers instead of returning five VFX tweaks.
export const SCOPE_MAP = {
  NPCS: ['WF-01'],
  ENEMIES: ['WF-02'],
  COMBAT: ['WF-02', 'WF-05', 'WF-15'],
  WORLD: ['WF-03', 'WF-04', 'WF-06', 'WF-10'],
  SECTORS: ['WF-03'],
  STATIONS: ['WF-04'],
  WEAPONS: ['WF-05'],
  ECONOMY: ['WF-06'],
  PROGRESSION: ['WF-07'],
  MISSIONS: ['WF-08'],
  STORY: ['WF-09'],
  EXPLORATION: ['WF-10'],
  GRAPHICS: ['WF-11', 'WF-12'],
  VFX: ['WF-12'],
  AUDIO: ['WF-13'],
  UI: ['WF-14'],
  FEEL: ['WF-15', 'WF-18'],
  POLISH: ['WF-12', 'WF-13', 'WF-14', 'WF-15'],
  VARIANTS: ['WF-16'],
  INTEGRATION: ['WF-17'],
  RECOVERY: ['WF-18'],
  PERF: ['WF-19'],
};

// Fingerprint axes for candidate/unit distinctness. Slates and resurrection
// checks compare these axes; free-text tokens are not enough because two
// paraphrases of the same idea share axes, not words.
export const FINGERPRINT_AXES = ['verb', 'subject', 'sector', 'layer', 'tempo', 'domain'];

export function uniq(values) {
  return [...new Set(values.filter((v) => v != null && v !== ''))];
}

export function concentration(values) {
  const list = values.filter((v) => v != null && v !== '');
  if (list.length === 0) return { n: 0, unique: 0, topShare: 1, top: null };
  const counts = new Map();
  for (const v of list) counts.set(v, (counts.get(v) || 0) + 1);
  let top = null;
  let topN = 0;
  for (const [k, n] of counts) {
    if (n > topN) { top = k; topN = n; }
  }
  return { n: list.length, unique: counts.size, topShare: topN / list.length, top };
}

/**
 * Breadth of an id list where duplicates are a DEFECT, not extra breadth.
 * Adding five copies of an existing weapon id must not move `unique`.
 */
export function idBreadth(ids) {
  const list = ids.filter((v) => v != null && v !== '');
  const seen = new Set();
  const duplicates = [];
  for (const id of list) {
    if (seen.has(id)) duplicates.push(id);
    else seen.add(id);
  }
  return { n: list.length, unique: seen.size, duplicates: uniq(duplicates) };
}

/**
 * Extract the top-level keys of an object literal from source text, e.g.
 * objectLiteralKeys(src, 'const ENEMY_FAMILY_BUILDERS =').
 * Used to read runtime vocabularies that live in modules too heavy to import
 * (render/combat). Line comments are stripped so commented-out keys never
 * count — an unknown string that the runtime silently discards must not be
 * scoreable as diversity.
 */
export function objectLiteralKeys(source, marker) {
  const text = String(source).replace(/\/\/[^\n]*/g, '');
  const idx = text.indexOf(marker);
  if (idx === -1) return [];
  const start = text.indexOf('{', idx);
  if (start === -1) return [];
  let depth = 0;
  let end = -1;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end === -1) return [];
  const block = text.slice(start + 1, end);
  const keys = [];
  let d = 0;
  let segStart = 0;
  const segments = [];
  for (let j = 0; j < block.length; j++) {
    const ch = block[j];
    if (ch === '{' || ch === '[' || ch === '(') d++;
    else if (ch === '}' || ch === ']' || ch === ')') d--;
    else if (ch === ',' && d === 0) { segments.push(block.slice(segStart, j)); segStart = j + 1; }
  }
  segments.push(block.slice(segStart));
  for (const seg of segments) {
    const m = seg.match(/^\s*['"]?([A-Za-z_$][\w$]*)['"]?\s*:/);
    if (m) keys.push(m[1]);
  }
  return keys;
}

export function scoreStructuralGap({ unique, n, topShare, floorUnique, softUnique }) {
  let score = 0;
  if (unique < floorUnique) score += (floorUnique - unique) * 20;
  else if (unique < softUnique) score += (softUnique - unique) * 8;
  if (n > 0 && topShare >= 0.45) score += Math.round((topShare - 0.44) * 100);
  if (n > 0 && unique / n < 0.35) score += 15;
  return score;
}

/**
 * Live breadth for asset-backed surfaces: only ids present in the release
 * manifest count toward breadth. Source-only files are integration debt.
 * A GLB dropped in the source dir must not make graphics breadth look solved.
 */
export function liveAssetBreadth({ onDisk, released }) {
  const disk = new Set(onDisk);
  const rel = new Set(released);
  const live = [...disk].filter((id) => rel.has(id));
  const sourceOnly = [...disk].filter((id) => !rel.has(id));
  return { live, sourceOnly, liveCount: live.length, sourceOnlyCount: sourceOnly.length };
}

// ---------------------------------------------------------------------------
// Memory
// ---------------------------------------------------------------------------

export function emptyMemory(today) {
  return {
    schema: MEMORY_SCHEMA,
    updated: today,
    runs: [],
    units: [],
    knownDefects: [],
    referenceUse: {},
    notes: [],
  };
}

/** Tolerant load: a corrupt or foreign shape degrades to empty + warning, never a crash. */
export function normalizeMemory(raw, today) {
  const warnings = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { memory: emptyMemory(today), warnings: ['memory missing or not an object; starting empty'] };
  }
  if (raw.schema !== MEMORY_SCHEMA) warnings.push(`unexpected memory schema ${raw.schema}; fields read best-effort`);
  const memory = emptyMemory(today);
  memory.updated = typeof raw.updated === 'string' ? raw.updated : today;
  for (const key of ['runs', 'units', 'knownDefects', 'notes']) {
    if (Array.isArray(raw[key])) memory[key] = raw[key].filter((e) => e && typeof e === 'object');
    else if (raw[key] != null) warnings.push(`memory.${key} not an array; ignored`);
  }
  if (raw.referenceUse && typeof raw.referenceUse === 'object' && !Array.isArray(raw.referenceUse)) {
    memory.referenceUse = raw.referenceUse;
  }
  return { memory, warnings };
}

export function daysBetween(fromDate, toDate) {
  const a = Date.parse(fromDate);
  const b = Date.parse(toDate);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Infinity;
  return Math.max(0, (b - a) / MS_PER_DAY);
}

/** Exponential decay: weight 1.0 today, 0.5 after halfLifeDays. */
export function decayWeight(dateStr, today, halfLifeDays = 21) {
  const days = daysBetween(dateStr, today);
  if (!Number.isFinite(days)) return 0;
  return Math.pow(0.5, days / halfLifeDays);
}

/** Decayed pile-on pressure for one domain: recent accepted work counts most. */
export function domainRecentWeight(memory, wf, today) {
  let w = 0;
  for (const u of memory.units) {
    if (u.wf !== wf) continue;
    if (u.verdict === 'rejected' || u.verdict === 'cut') continue;
    w += decayWeight(u.date, today);
  }
  return w;
}

/** Days since a domain last produced any unit (Infinity if never). */
export function domainStaleness(memory, wf, today) {
  let latest = null;
  for (const u of memory.units) {
    if (u.wf !== wf) continue;
    if (latest === null || daysBetween(u.date, today) < daysBetween(latest, today)) latest = u.date;
  }
  for (const r of memory.runs) {
    const wfs = Array.isArray(r.domains) ? r.domains : [];
    if (!wfs.includes(wf)) continue;
    if (latest === null || daysBetween(r.date, today) < daysBetween(latest, today)) latest = r.date;
  }
  return latest === null ? Infinity : daysBetween(latest, today);
}

export function parseFingerprint(fp) {
  // Accept 'verb=steal,subject=hauler,...' strings or already-parsed objects.
  if (fp && typeof fp === 'object') return fp;
  const out = {};
  if (typeof fp !== 'string') return out;
  for (const part of fp.split(',')) {
    const [k, ...rest] = part.split('=');
    if (!k || rest.length === 0) continue;
    out[k.trim().toLowerCase()] = rest.join('=').trim().toLowerCase();
  }
  return out;
}

/** Count fingerprint axes defined on both and equal / differing. */
export function fingerprintOverlap(a, b) {
  const fa = parseFingerprint(a);
  const fb = parseFingerprint(b);
  let shared = 0;
  let equal = 0;
  for (const axis of FINGERPRINT_AXES) {
    if (fa[axis] == null || fb[axis] == null) continue;
    shared += 1;
    if (fa[axis] === fb[axis]) equal += 1;
  }
  return { shared, equal, differing: shared - equal };
}

/**
 * Two candidates are "the same idea" when they agree on nearly every axis
 * both define. Used for anti-resurrection and slate distinctness.
 */
export function sameIdea(a, b) {
  const { shared, equal } = fingerprintOverlap(a, b);
  if (shared < 3) return false; // not enough signal to call them the same
  return equal >= shared - 1 && equal >= 3;
}

/** Rejected/cut units within the window whose idea must not silently return. */
export function blockedFingerprints(memory, today, windowDays = 45) {
  return memory.units.filter((u) => (
    (u.verdict === 'rejected' || u.verdict === 'cut')
    && daysBetween(u.date, today) <= windowDays
    && u.fingerprint
  ));
}

/**
 * True when a candidate fingerprint matches a recently rejected/cut unit.
 * Resurrection requires NEW evidence recorded in memory, not silence.
 */
export function isBlockedCandidate(memory, fingerprint, today, windowDays = 45) {
  for (const u of blockedFingerprints(memory, today, windowDays)) {
    if (sameIdea(fingerprint, u.fingerprint)) return { blocked: true, by: u };
  }
  return { blocked: false, by: null };
}

/** Patterns that failed twice for the same root reason: do not attempt a third time. */
export function failedTwicePatterns(memory) {
  const byReason = new Map();
  for (const u of memory.units) {
    if (u.verdict !== 'rejected' && u.verdict !== 'cut' && u.verdict !== 'rebuilt') continue;
    const key = (u.rootReason || u.reason || '').toLowerCase().trim();
    if (!key) continue;
    byReason.set(key, (byReason.get(key) || []).concat([u]));
  }
  return [...byReason.entries()]
    .filter(([, units]) => units.length >= 2)
    .map(([reason, units]) => ({ reason, count: units.length, units }));
}

/** References (games/talks) leaned on recently; heavy reuse => rotate or go repo-native. */
export function overusedReferences(memory, today, { windowDays = 30, threshold = 3 } = {}) {
  const counts = new Map();
  for (const u of memory.units) {
    if (daysBetween(u.date, today) > windowDays) continue;
    for (const ref of u.references || []) {
      const k = String(ref).toLowerCase();
      counts.set(k, (counts.get(k) || 0) + 1);
    }
  }
  return [...counts.entries()].filter(([, n]) => n >= threshold).map(([ref, n]) => ({ ref, uses: n }));
}

const MEMORY_CAPS = { units: 120, runs: 60, notes: 30, maxAgeDays: 180 };

/** Keep memory small and current; failed-twice evidence survives pruning. */
export function pruneMemory(memory, today) {
  const keepUnit = (u) => daysBetween(u.date, today) <= MEMORY_CAPS.maxAgeDays;
  const failedReasons = new Set(failedTwicePatterns(memory).map((p) => p.reason));
  memory.units = memory.units
    .filter((u) => keepUnit(u) || failedReasons.has((u.rootReason || u.reason || '').toLowerCase().trim()))
    .slice(-MEMORY_CAPS.units);
  memory.runs = memory.runs.filter((r) => daysBetween(r.date, today) <= MEMORY_CAPS.maxAgeDays).slice(-MEMORY_CAPS.runs);
  memory.notes = (memory.notes || []).slice(-MEMORY_CAPS.notes);
  memory.updated = today;
  return memory;
}

export function recordRun(memory, run) {
  memory.runs.push(run);
  return pruneMemory(memory, run.date || memory.updated);
}

export function recordUnit(memory, unit) {
  memory.units.push(unit);
  return pruneMemory(memory, unit.date || memory.updated);
}

// ---------------------------------------------------------------------------
// Director board
// ---------------------------------------------------------------------------

const MODES = ['recovery', 'integration', 'starved', 'opportunity', 'repair'];

/**
 * Deterministic default mode for this run, from run history balance.
 * The agent may override with judgment, but must say why; the default
 * prevents months of repair-only runs on measured registries.
 */
export function suggestMode({ memory, today, scopeWfs = null, knownDefects = [], integrationDebt = [], starved = [], repair = [] }) {
  // 1. A live foundation defect inside the requested scope beats everything:
  //    content multiplied on a broken base multiplies the defect.
  const scopedDefect = knownDefects.find((d) => (
    d.severity === 'foundation'
    && d.status !== 'resolved'
    && (!scopeWfs || !d.wf || scopeWfs.includes(d.wf))
  ));
  if (scopedDefect) {
    return { mode: 'recovery', reason: `open foundation defect: ${scopedDefect.id} — repair before adding content on top`, defect: scopedDefect };
  }

  const recent = memory.runs.slice(-6);
  const recentModes = recent.map((r) => r.mode || 'repair');

  // 2. Large authored-but-unwired debt and no recent integration run:
  //    the recorded promotion-boundary failure (98 unwired GLBs, 58 unwired
  //    events) is exactly what this branch exists to prevent recurring.
  //    A scoped run keeps its scope — debt only overrides unscoped runs or
  //    scopes that include the integration workflow.
  const debtCount = integrationDebt.reduce((s, d) => s + (d.count || 1), 0);
  const debtInScope = !scopeWfs || scopeWfs.includes('WF-17');
  if (debtCount >= 20 && debtInScope && !recentModes.slice(-5).includes('integration')) {
    return { mode: 'integration', reason: `${debtCount} authored-but-unwired items and no integration run in the last 5 — wire before authoring more` };
  }

  // 3. Repair streak on measured registries while unmeasured domains starve.
  const repairStreak = recentModes.filter((m) => m === 'repair').length;
  if (repairStreak >= 4 && starved.length > 0) {
    return { mode: 'starved', reason: `last ${repairStreak}/6 runs were structural repair; ${starved[0].wf} (${starved[0].name}) has waited ${starved[0].staleness === Infinity ? 'forever' : Math.round(starved[0].staleness) + 'd'}` };
  }

  // 4. Periodic opportunity pass: at least one run in six starts from
  //    "what could only SpaceFace do" instead of a deficit.
  if (recent.length >= 5 && !recentModes.includes('opportunity')) {
    return { mode: 'opportunity', reason: 'no opportunity-mode run in the last 6 — generate from strengths, not deficits' };
  }

  // 5. Nothing to repair (no unsaturated structural gap in scope — true for
  //    every unmeasured domain, e.g. POLISH/STORY/AUDIO): schedule by staleness.
  const repairAvailable = repair.some((g) => g.score > 0 && !g.saturated);
  if (!repairAvailable && starved.length > 0) {
    return { mode: 'starved', reason: `no unsaturated structural gap in scope; ${starved[0].wf} (${starved[0].name}) is the stalest domain — verify its reality on the ordinary route and produce its next unit` };
  }
  if (!repairAvailable) {
    return { mode: 'opportunity', reason: 'no structural gap and no starved domain in scope — generate from strengths' };
  }

  return { mode: 'repair', reason: 'no override triggered; take a high-score structural gap that is not saturated' };
}

/**
 * Build the full board. `structural` is the scored gap list from the detect
 * script; `integrationDebt` is authored-but-unwired inventory; `knownDefects`
 * come from memory. Returns cells; the agent picks ONE cell, then invents
 * within it.
 */
export function buildDirectorBoard({ structural, memory, today, integrationDebt = [], scopeWfs = null, saturationThreshold = 2.0 }) {
  const knownDefects = (memory.knownDefects || []).filter((d) => d.status !== 'resolved');

  // Repair cell: structural gaps minus saturated domains (decayed pile-on).
  const repair = structural
    .filter((g) => g.score > 0)
    .filter((g) => !scopeWfs || (g.wfs || []).some((wf) => scopeWfs.includes(wf)))
    .map((g) => {
      const weights = (g.wfs || []).map((wf) => domainRecentWeight(memory, wf, today));
      const maxWeight = weights.length ? Math.max(...weights) : 0;
      return { ...g, recentWeight: maxWeight, saturated: maxWeight >= saturationThreshold };
    })
    .sort((a, b) => b.score - a.score);

  // Starved cell: domains (esp. structurally unmeasured ones) by staleness.
  const starved = DOMAINS
    .filter((d) => !scopeWfs || scopeWfs.includes(d.wf))
    .map((d) => ({ ...d, staleness: domainStaleness(memory, d.wf, today) }))
    .filter((d) => d.staleness === Infinity || d.staleness > 14)
    .sort((a, b) => {
      // Unmeasured domains outrank measured ones at equal staleness: nothing
      // else in the system can ever surface them.
      const ax = (a.measured ? 0 : 1) * 1e6 + (a.staleness === Infinity ? 1e5 : a.staleness);
      const bx = (b.measured ? 0 : 1) * 1e6 + (b.staleness === Infinity ? 1e5 : b.staleness);
      return bx - ax;
    });

  const blocked = blockedFingerprints(memory, today);
  const failedTwice = failedTwicePatterns(memory);
  const overused = overusedReferences(memory, today);

  const suggestion = suggestMode({ memory, today, scopeWfs, knownDefects, integrationDebt, starved, repair });

  return {
    modes: MODES,
    suggestedMode: suggestion.mode,
    modeReason: suggestion.reason,
    repair,
    starved,
    integration: integrationDebt,
    recovery: knownDefects,
    blocked,
    failedTwice,
    overusedReferences: overused,
  };
}

/** Resolve `INFERENCE Nx <SCOPE>` scope keyword to workflow ids (null = unscoped). */
export function resolveScope(scope) {
  if (!scope) return null;
  const key = String(scope).toUpperCase().replace(/[^A-Z]/g, '');
  return SCOPE_MAP[key] || null;
}

/**
 * Slate requirements for an Nx run. Nx is an EFFORT/AMBITION target, not a
 * shipping quota: acceptedMax says how many units may ship, acceptedMin is
 * always 0 — an honest run may cut everything below bar.
 */
export function slateRequirements(nx, scopeWfs = null) {
  const n = Math.max(1, Math.min(9, Number(nx) || 1));
  const multiDomain = scopeWfs != null && scopeWfs.length > 1;
  return {
    acceptedMax: n,
    acceptedMin: 0,
    minCandidates: n <= 1 ? 4 : n <= 3 ? 10 : 16,
    minDistinctAxesPerPair: 2,
    // A multi-domain scope at 3x+ must span at least two of its domains:
    // "5x POLISH" returning five VFX tweaks is a scope violation.
    minDomainsSpanned: multiDomain && n >= 3 ? 2 : 1,
    honestUnderdelivery: 'Ship fewer, better units when the rest are filler; record cut candidates and why.',
  };
}

/**
 * Check a slate of candidate fingerprints for pairwise distinctness and
 * (when scoped multi-domain) domain coverage. Returns violations, not a score.
 */
export function checkSlate(fingerprints, { scopeWfs = null, nx = 1 } = {}) {
  const req = slateRequirements(nx, scopeWfs);
  const parsed = fingerprints.map(parseFingerprint);
  const collisions = [];
  for (let i = 0; i < parsed.length; i++) {
    for (let j = i + 1; j < parsed.length; j++) {
      const { shared, differing } = fingerprintOverlap(parsed[i], parsed[j]);
      if (shared >= 3 && differing < req.minDistinctAxesPerPair) {
        collisions.push({ a: i, b: j, differing });
      }
    }
  }
  const domainsSpanned = uniq(parsed.map((f) => f.domain));
  const domainViolation = domainsSpanned.length < req.minDomainsSpanned
    ? `slate spans ${domainsSpanned.length} domain(s); scope requires >= ${req.minDomainsSpanned}`
    : null;
  return { ok: collisions.length === 0 && !domainViolation, collisions, domainsSpanned, domainViolation, requirements: req };
}
