// FB-028 — the Crucible results sheet. Presentation only: the rows and the two
// readings are handed in already settled. This module never scores a stunt,
// never ranks a kit, and never counts a streak.

import { survivalArenaById } from '../../data/survivalArenas.js';
import { el } from '../kit/index.js';

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

/** Compact kit-balance lines from a kitBalanceBoard() result. Empty is honest. */
export function kitBalanceLines(board) {
  const order = board && Array.isArray(board.order) ? board.order : [];
  const summary = board && board.summary && typeof board.summary === 'object' ? board.summary : {};
  if (!order.length) return ['No kit balance on this record.'];
  return order.map((kit) => {
    const row = summary[kit] || {};
    const median = Number.isFinite(row.median) ? String(Math.round(row.median)) : '—';
    const n = Number.isInteger(row.n) ? row.n : 0;
    const runs = n === 1 ? '1 run' : `${n} runs`;
    return `${kitWord(kit)} — median ${median} over ${runs}`;
  });
}

/** The overconfidence reading. The count is the sim's; this only says it. */
export function overconfidenceReading(streak) {
  const n = Number.isInteger(streak) && streak > 0 ? streak : 0;
  if (n <= 0) return 'No overconfidence streak on this record.';
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

/** The sheet as a column the results plate can append. DOM only. */
export function renderResultsSheet(model) {
  const sheet = model && typeof model === 'object' ? model : resultsSheetModel();
  const root = el('section', 'sf-crres__sheet');
  root.setAttribute('aria-label', 'Results sheet');
  root.appendChild(el('p', 'k-caps sf-crres__band-title', 'Results sheet'));
  root.appendChild(el('p', 'k-sentence k-sentence--emph sf-crres__run-name', sheet.runName));

  const stunts = el('ul', 'k-rows sf-crres__stunt-rows');
  stunts.setAttribute('aria-label', 'Stunt rows');
  if (!sheet.stuntRows.length) {
    root.appendChild(el('p', 'k-sentence sf-crres__stunt-rows', 'This run scored no named stunts.'));
  } else {
    for (const [name, detail] of sheet.stuntRows) {
      const li = el('li', 'k-row k-row--static sf-crres__stunt-row');
      const left = el('div');
      left.appendChild(el('span', 'k-row__name', name));
      li.appendChild(left);
      li.appendChild(el('span', 'k-row__num', detail));
      stunts.appendChild(li);
    }
    root.appendChild(stunts);
  }

  const kit = el('div', 'sf-crres__kit-balance');
  kit.setAttribute('aria-label', 'Kit balance');
  for (const line of sheet.kitLines) kit.appendChild(el('p', 'k-sentence', line));
  root.appendChild(kit);
  root.appendChild(el('p', 'k-sentence sf-crres__overconfidence', sheet.overconfidence));
  return root;
}
