/**
 * Pure ledger logic for the INFERENCE hygiene loop.
 *
 * The ledger is the whole-game state on one screen: one row per workflow
 * domain with a grade, dated inspections, open gaps, and a next move.
 * Everything here takes plain data and returns plain data — no filesystem,
 * no git, no repo imports beyond the shared domain table — so
 * test/inference-ledger.test.mjs can pin the behavior with synthetic
 * fixtures. scripts/inference-ledger.mjs gathers git facts (HEAD, changed
 * paths) and calls into this module; freshness is computed, never stored.
 *
 * Design intent (see design/program/INFERENCE_CONVERGENCE.md):
 * - Bounded: 3 inspections + 5 open gaps per domain, pruned on write.
 * - Stale inspections are rumors: validity derives from "did the inspected
 *   paths change since the inspection commit", computed fresh every run.
 * - Suggestions rank weakest/stalest first but never assign; looking wins.
 */
import { DOMAINS } from './inferenceCore.mjs';

export const LEDGER_SCHEMA = 'spaceface.inferenceLedger.v1';

export const MAX_INSPECTIONS = 3;
export const MAX_OPEN_GAPS = 5;

/** Grade scale. U = uninspected (honest default, never a soft grade). */
export const GRADES = Object.freeze({
  S: 'exemplary — the bar other domains chase',
  A: 'shippable — solid, polish optional',
  B: 'good — works, gaps noted below',
  C: 'weak — a player would feel it',
  D: 'broken or thin — fix or cut',
  U: 'uninspected — nobody has looked yet',
});

/** Pick order: broken first, then weak, unknown, stale, then polish. Lower is earlier. */
const GRADE_RANK = Object.freeze({ D: 0, C: 1, U: 2, B: 4, A: 5, S: 6 });
const STALE_RANK = 3;

export function validWf(wf) {
  return DOMAINS.some((d) => d.wf === wf);
}

export function validGrade(grade) {
  return Object.hasOwn(GRADES, grade);
}

export function emptyDomain() {
  return { grade: 'U', updated: null, inspections: [], gaps: [], next: '' };
}

export function emptyLedger(today) {
  const domains = {};
  for (const d of DOMAINS) domains[d.wf] = { ...emptyDomain(), updated: today };
  return { schema: LEDGER_SCHEMA, updated: today, domains };
}

/** Tolerant load: a corrupt or foreign shape degrades field-by-field, never a crash. */
export function normalizeLedger(raw, today) {
  const warnings = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ledger: emptyLedger(today), warnings: ['ledger missing or not an object; starting empty'] };
  }
  if (raw.schema !== LEDGER_SCHEMA) warnings.push(`unexpected ledger schema ${raw.schema}; fields read best-effort`);
  const ledger = emptyLedger(typeof raw.updated === 'string' ? raw.updated : today);
  const domains = raw.domains && typeof raw.domains === 'object' ? raw.domains : {};
  for (const d of DOMAINS) {
    const entry = domains[d.wf];
    if (!entry || typeof entry !== 'object') continue;
    const out = ledger.domains[d.wf];
    if (validGrade(entry.grade)) out.grade = entry.grade;
    else if (entry.grade != null) warnings.push(`${d.wf}: unknown grade ${entry.grade}; kept U`);
    if (typeof entry.updated === 'string') out.updated = entry.updated;
    if (typeof entry.next === 'string') out.next = entry.next.slice(0, 280);
    if (Array.isArray(entry.inspections)) {
      out.inspections = entry.inspections
        .filter((i) => i && typeof i === 'object' && typeof i.finding === 'string')
        .map((i) => ({
          date: typeof i.date === 'string' ? i.date : today,
          atCommit: typeof i.atCommit === 'string' ? i.atCommit : '',
          paths: Array.isArray(i.paths) ? i.paths.filter((p) => typeof p === 'string').slice(0, 12) : [],
          finding: i.finding.slice(0, 500),
        }))
        .slice(-MAX_INSPECTIONS);
    } else if (entry.inspections != null) warnings.push(`${d.wf}: inspections not an array; ignored`);
    if (Array.isArray(entry.gaps)) {
      out.gaps = entry.gaps
        .filter((g) => g && typeof g === 'object' && typeof g.id === 'string' && typeof g.note === 'string')
        .map((g) => ({
          id: g.id.slice(0, 80),
          note: g.note.slice(0, 280),
          status: g.status === 'done' ? 'done' : 'open',
          byUnit: typeof g.byUnit === 'string' ? g.byUnit.slice(0, 80) : undefined,
        }));
    } else if (entry.gaps != null) warnings.push(`${d.wf}: gaps not an array; ignored`);
  }
  return { ledger, warnings };
}

function entryOf(ledger, wf) {
  if (!validWf(wf)) throw new Error(`unknown workflow ${wf}`);
  return ledger.domains[wf];
}

/** Record an inspection; newest last, pruned to MAX_INSPECTIONS. Optionally re-grades. */
export function recordInspection(ledger, { wf, date, atCommit, paths, finding, grade = null, next = null }) {
  const entry = entryOf(ledger, wf);
  if (typeof finding !== 'string' || !finding.trim()) throw new Error('inspection needs a finding');
  entry.inspections.push({
    date,
    atCommit: atCommit || '',
    paths: (paths || []).slice(0, 12),
    finding: finding.slice(0, 500),
  });
  entry.inspections = entry.inspections.slice(-MAX_INSPECTIONS);
  if (grade != null) {
    if (!validGrade(grade)) throw new Error(`unknown grade ${grade}`);
    entry.grade = grade;
  }
  if (next != null) entry.next = String(next).slice(0, 280);
  entry.updated = date;
  ledger.updated = date;
  return entry;
}

/** Open a gap; capped so the ledger cannot become a wishlist. Returns ok:false when full. */
export function addGap(ledger, { wf, id, note, date }) {
  const entry = entryOf(ledger, wf);
  if (!id || !note) throw new Error('gap needs an id and a note');
  if (entry.gaps.some((g) => g.id === id)) throw new Error(`gap ${id} already exists on ${wf}`);
  const open = entry.gaps.filter((g) => g.status !== 'done').length;
  if (open >= MAX_OPEN_GAPS) {
    return { ok: false, reason: `close or delete an open gap first (${open}/${MAX_OPEN_GAPS} open)` };
  }
  entry.gaps.push({ id: id.slice(0, 80), note: note.slice(0, 280), status: 'open' });
  entry.updated = date || entry.updated;
  return { ok: true };
}

export function closeGap(ledger, { wf, id, byUnit = null, date = null }) {
  const entry = entryOf(ledger, wf);
  const gap = entry.gaps.find((g) => g.id === id);
  if (!gap) throw new Error(`no gap ${id} on ${wf}`);
  gap.status = 'done';
  if (byUnit) gap.byUnit = String(byUnit).slice(0, 80);
  // Done gaps leave the working set; git history keeps them.
  entry.gaps = entry.gaps.filter((g) => g.status !== 'done');
  if (date) {
    entry.updated = date;
    ledger.updated = date;
  }
  return gap;
}

export function setGrade(ledger, { wf, grade, next = null, date }) {
  const entry = entryOf(ledger, wf);
  if (!validGrade(grade)) throw new Error(`unknown grade ${grade}`);
  entry.grade = grade;
  if (next != null) entry.next = String(next).slice(0, 280);
  if (date) {
    entry.updated = date;
    ledger.updated = date;
  }
  return entry;
}

/**
 * Freshness of one inspection. `atCommitKnown` and `pathsChanged` ("did any
 * inspected path change since atCommit") are computed by the CLI from git;
 * unknown commits and git failures arrive as pathsChanged=true (fail closed
 * toward re-inspecting). Commits elsewhere never invalidate an inspection —
 * only movement under its own paths does.
 */
export function inspectionFreshness(inspection, { atCommitKnown, pathsChanged }) {
  if (!inspection) return 'none';
  if (!inspection.atCommit || !atCommitKnown || pathsChanged) return 'stale';
  return 'valid';
}

/** Newest inspection wins: a domain is only as fresh as its last look. */
export function domainFreshness(entry, git) {
  if (!entry.inspections.length) return 'none';
  return inspectionFreshness(entry.inspections[entry.inspections.length - 1], git);
}

/**
 * Suggested pick order — weakest/stalest/oldest first. Returns [{wf, name,
 * grade, freshness, updated, reason}]. A hint, never an assignment.
 */
export function rankDomains(ledger, freshnessOf) {
  const rows = DOMAINS.map((d) => {
    const entry = ledger.domains[d.wf];
    const freshness = freshnessOf(d.wf, entry);
    const rank = freshness === 'stale' && GRADE_RANK[entry.grade] > STALE_RANK
      ? STALE_RANK
      : GRADE_RANK[entry.grade];
    return { wf: d.wf, name: d.name, grade: entry.grade, freshness, updated: entry.updated, rank };
  });
  rows.sort((a, b) => (
    a.rank - b.rank
    || String(a.updated || '').localeCompare(String(b.updated || ''))
    || a.wf.localeCompare(b.wf)
  ));
  return rows.map(({ rank: _rank, ...row }) => ({
    ...row,
    reason: row.grade === 'D' ? 'broken or thin'
      : row.grade === 'C' ? 'weak'
        : row.grade === 'U' ? 'uninspected'
          : row.freshness === 'stale' ? 'inspection stale — re-inspect before building on it'
            : row.freshness === 'none' ? 'no inspection on record'
              : `graded ${row.grade}`,
  }));
}

export function openGaps(entry) {
  return entry.gaps.filter((g) => g.status !== 'done');
}
