// FB-028 — the Crucible results sheet. Presentation only: the rows and the two
// readings are handed in already settled. This module never scores a stunt,
// never ranks a kit, and never counts a streak.

import { survivalArenaById } from '../../data/survivalArenas.js';
import { el } from '../kit/index.js';
import { decrypt } from '../orrery/text.js';
import { injectCrucibleResultsSheetLayout } from '../orrery/crucible-resultsLayouts.js';

// ORRERY §3.5 arrival, local to the band: labels decrypt (220 ms) after the glass
// settles, lists follow at the 28 ms stagger — captions ride the same stagger, one
// slot ahead of their ladder. decrypt() itself lands the final string instantly
// under reduced motion or without a frame loop (probes, tests).
const DECRYPT = { duration: 220 };
const TITLE_AT = 240;
const NAME_AT = 300;
const LIST_AT = 360;
const LIST_STEP = 28;

/** The empty reading: it names what would be here instead of leaving dead air. */
const EMPTY_READING = 'No stunt rounds or kit balance yet.';

const RAW_ID = /^[a-z0-9]+(?:[_-][a-z0-9]+)+$/;

/** The arena's name, never its id. Unknown arenas stay a plain word. */
export function namedRunLabel(arenaId, explicitLabel) {
  const given = typeof explicitLabel === 'string' ? explicitLabel.trim() : '';
  if (given && given !== arenaId && !RAW_ID.test(given)) return given;
  const arena = survivalArenaById(arenaId);
  const label = arena && typeof arena.label === 'string' ? arena.label.trim() : '';
  if (label && label !== arenaId && !RAW_ID.test(label)) return label;
  return 'This run';
}

function kitWord(kit) {
  const raw = typeof kit === 'string' ? kit.trim() : '';
  if (!raw) return 'Unknown kit';
  if (!RAW_ID.test(raw) && !/^[a-z0-9]+$/.test(raw)) return raw;
  return raw.split(/[_-]+/).filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/** Real records retain the starter in their immutable rule descriptor. */
export function recordedKitId(row) {
  const explicit = row && (row.kitId || row.kit);
  if (typeof explicit === 'string' && explicit) return explicit;
  try {
    const rules = row && row.recordRules && row.recordRules.loadoutRules;
    const descriptor = typeof rules === 'string' ? JSON.parse(rules) : rules;
    return descriptor && typeof descriptor.starter === 'string' ? descriptor.starter : null;
  } catch { return null; }
}

/**
 * The kit board as ladder rows: the kit's word on the left, its reading on the
 * right — the same grammar the stunt rows above it speak (ORRERY §3.2: a table
 * becomes a ladder). No median yet stays quiet about the median. Empty stays
 * quiet about the board.
 */
export function kitBalanceLines(board) {
  const order = board && Array.isArray(board.order) ? board.order : [];
  const summary = board && board.summary && typeof board.summary === 'object' ? board.summary : {};
  if (!order.length) return [];
  return order.map((kit) => {
    const row = summary[kit] || {};
    const median = Number.isFinite(row.median) ? String(Math.round(row.median)) : '';
    const n = Number.isInteger(row.n) ? row.n : 0;
    const runs = n === 1 ? '1 run' : `${n} runs`;
    return { name: kitWord(kit), reading: median ? `Median ${median} · ${runs}` : runs };
  });
}

/** The overconfidence reading. Zero is silence — the sheet does not apologize. */
export function overconfidenceReading(streak) {
  const n = Number.isInteger(streak) && streak > 0 ? streak : 0;
  if (n <= 0) return '';
  if (n === 1) return 'Overconfidence: the last run ended while confidence was still high.';
  return `Overconfidence: ${n} runs in a row ended while confidence was still high.`;
}

/**
 * What the sheet prints. Stunt rows are copied off result.stuntRoundRows and
 * nothing else — a missing list is an empty column, never a recomputed one.
 */
export function resultsSheetModel({ result, kitBoard, overconfidenceStreak } = {}) {
  const plate = result && typeof result === 'object' ? result : {};
  const stuntRows = Array.isArray(plate.stuntRoundRows)
    ? plate.stuntRoundRows
      .filter((row) => Array.isArray(row) && typeof row[0] === 'string' && row[0] && row[1] != null)
      .map(([name, detail]) => [String(name), String(detail)])
    : [];
  return {
    runName: namedRunLabel(plate.arenaId, plate.arenaLabel),
    stuntRows,
    kitLines: kitBalanceLines(kitBoard),
    overconfidence: overconfidenceReading(
      Number.isInteger(plate.overconfidenceStreak) ? plate.overconfidenceStreak : overconfidenceStreak,
    ),
  };
}

/**
 * The sheet as a column the results plate can append. DOM only.
 *
 * The run's name leads; each reading ladder carries an etched sub-caption (the same
 * words its list is labelled by), so the column reads without memory; and when the
 * run left no rows, no board and no streak, a quiet line says what would be here —
 * the sheet never renders as a heading over dead air.
 */
export function renderResultsSheet(model) {
  const sheet = model && typeof model === 'object' ? model : resultsSheetModel();
  injectCrucibleResultsSheetLayout();
  const root = el('section', 'sf-crres__sheet');
  root.setAttribute('aria-label', 'Results sheet');

  // The band title carries the same heading role as every other band on the plate
  // (crucible.js builds its own titles that way), so the column reads as one outline.
  const bandTitle = el('p', 'k-caps sf-crres__band-title', 'Results sheet');
  bandTitle.setAttribute('role', 'heading');
  bandTitle.setAttribute('aria-level', '2');
  root.appendChild(bandTitle);
  decrypt(bandTitle, 'Results sheet', { ...DECRYPT, delay: TITLE_AT });

  const runName = el('p', 'k-sentence k-sentence--emph sf-crres__run-name', sheet.runName);
  root.appendChild(runName);
  decrypt(runName, sheet.runName, { ...DECRYPT, delay: NAME_AT });

  let tick = 0;
  const listAt = () => LIST_AT + LIST_STEP * tick++;

  /** One captioned ladder: the caption takes a stagger slot, each row the next. */
  const ladderBlock = (caption, rows, listClass) => {
    const cap = el('p', 'k-caps sf-crres__sheet-sub', caption);
    root.appendChild(cap);
    decrypt(cap, caption, { ...DECRYPT, delay: listAt() });
    const list = el('ul', `k-rows ${listClass}`);
    list.setAttribute('aria-label', caption);
    for (const [name, detail] of rows) {
      const li = el('li', 'k-row k-row--static');
      const left = el('div');
      const nameSpan = el('span', 'k-row__name', name);
      left.appendChild(nameSpan);
      li.appendChild(left);
      const num = el('span', 'k-row__num', detail);
      li.appendChild(num);
      list.appendChild(li);
      const at = { ...DECRYPT, delay: listAt() };
      decrypt(nameSpan, name, at);
      decrypt(num, detail, at);
    }
    root.appendChild(list);
  };

  if (sheet.stuntRows.length) ladderBlock('Stunt rounds', sheet.stuntRows, 'sf-crres__stunt-rows');
  if (sheet.kitLines.length) {
    ladderBlock(
      'Kit balance',
      sheet.kitLines.map((line) => [line.name, line.reading]),
      'sf-crres__kit-rows',
    );
  }
  if (sheet.overconfidence) {
    const note = el('p', 'k-sentence sf-crres__overconfidence', sheet.overconfidence);
    root.appendChild(note);
    decrypt(note, sheet.overconfidence, { ...DECRYPT, delay: listAt() });
  }
  if (!sheet.stuntRows.length && !sheet.kitLines.length && !sheet.overconfidence) {
    const empty = el('p', 'k-sentence sf-crres__sheet-empty', EMPTY_READING);
    root.appendChild(empty);
    decrypt(empty, EMPTY_READING, { ...DECRYPT, delay: listAt() });
  }
  return root;
}
