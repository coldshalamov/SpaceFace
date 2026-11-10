import { pluralWord } from './numberFormat.js';
// marketPulsePresenter.js — the market's own pulse, read.
//
// The economy already MEASURES the berth economy's value flow (src/economy/economyPulse.js:
// 48 fifteen-minute bins of observed cash in/out, sale proceeds, contract offers and accepts,
// field work published and depleted) and exposes it as economyPulseReport — but no surface ever
// read it, so the flow the economy tracks was invisible at the one screen where the player
// watches money. This module is the read layer: PURE over the report, no DOM writes, no clock,
// no invented movement. Quiet bins stay quiet — a silent stretch is reported as a silent
// stretch, never smoothed into activity (the report's own rule: quiet intervals remain zero,
// never interpolated). Presentation matches the market screen's other rails: whole sentences,
// grouped credits, no raw ids.

const BIN_WORD = 'quarter-hour';
const BIN_WORD_PLURAL = 'quarter-hours';
const BIN_MINUTES = 15;

function grouped(n) {
  return Math.max(0, Math.round(Number(n) || 0)).toLocaleString('en-US');
}

function binCountWord(count) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  if (n === 1) return `1 ${BIN_WORD}`;
  return `${n} ${BIN_WORD_PLURAL}`;
}

function sum(rows, key) {
  let total = 0;
  for (const row of rows) total += Math.max(0, Number(row && row[key]) || 0);
  return total;
}

function longestQuietStretch(rows) {
  let best = 0;
  let run = 0;
  for (const row of rows) {
    const moved = (row.cashInCr + row.cashOutCr) > 0;
    if (!row.complete) { run = 0; continue; }
    run = moved ? 0 : run + 1;
    if (run > best) best = run;
  }
  return best;
}

function lastMovementRow(rows) {
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    if ((row.cashInCr + row.cashOutCr) > 0) return row;
  }
  return null;
}

function lastMovementLine(rows, throughS) {
  const row = lastMovementRow(rows);
  if (!row) return null;
  const sinceS = Math.max(0, Math.round(throughS - row.endS));
  if (sinceS < BIN_MINUTES * 60) return 'Credits moved within the last quarter-hour.';
  const bins = Math.round(sinceS / (BIN_MINUTES * 60));
  return `The last credit moved ${binCountWord(bins)} ago.`;
}

/**
 * marketPulseRead(report) → pulse model, or `null` for a corrupt/absent report (fail closed).
 * Every line states an observed fact; a zero is stated as quiet, never dressed up.
 */
export function marketPulseRead(report) {
  const rows = Array.isArray(report && report.rows) ? report.rows : [];
  if (!rows.length) return null;
  const throughS = Math.max(0, Number(report.throughS) || 0);
  const cashInCr = sum(rows, 'cashInCr');
  const cashOutCr = sum(rows, 'cashOutCr');
  const saleCr = sum(rows, 'saleCr');
  const offers = sum(rows, 'offers');
  const accepts = sum(rows, 'accepts');
  const publishedUnits = sum(rows, 'publishedUnits');
  const depletedRequests = sum(rows, 'depletedRequests');
  const last = rows[rows.length - 1];
  const lastMoved = (last.cashInCr + last.cashOutCr) > 0;
  const quietStretch = longestQuietStretch(rows);
  const alive = (cashInCr + cashOutCr) > 0;

  const lines = [];
  if (!alive) {
    lines.push('Nothing observed yet — the pulse starts when the first credit moves.');
  } else {
    lines.push(`Over twelve hours ${grouped(cashInCr + cashOutCr)} cr moved: ${grouped(cashInCr)} cr in, ${grouped(cashOutCr)} cr out.`);
    if (saleCr > 0) lines.push(`Sales accounted for ${grouped(saleCr)} cr of the inflow.`);
    lines.push(lastMoved
      ? `This quarter-hour already moved ${grouped(last.cashInCr)} cr in and ${grouped(last.cashOutCr)} cr out.`
      : (lastMovementLine(rows, throughS) || 'This quarter-hour has been quiet so far.'));
    if (quietStretch > 0) lines.push(`The longest quiet stretch ran ${binCountWord(quietStretch)}.`);
    if (offers + accepts > 0) {
      lines.push(`Contract work: ${grouped(offers)} ${pluralWord(offers, 'offer', 'offers')} posted, ${grouped(accepts)} ${pluralWord(accepts, 'was taken', 'were taken')}.`);
    }
    if (publishedUnits + depletedRequests > 0) {
      const parts = [];
      if (publishedUnits === 1) parts.push('fields published 1 unit of work');
      else if (publishedUnits > 0) parts.push(`fields published ${grouped(publishedUnits)} units of work`);
      if (depletedRequests > 0) parts.push(`${grouped(depletedRequests)} work ${pluralWord(depletedRequests, 'request came', 'requests came')} back depleted`);
      lines.push(`Field work: ${parts.join(' and ')}.`);
    }
  }
  return {
    alive,
    scope: String((report && report.scope) || 'Observed cash flow; sale proceeds include principal. Not a profit or gameplay-completion estimate.'),
    lines,
  };
}

/** One compact read block: the scope line first, then the observed sentences. Pure HTML string. */
export function marketPulseHtml(pulse) {
  const read = pulse || null;
  if (!read) {
    return '<p class="k-sentence sx-muted">Nothing observed yet — the pulse starts when the first credit moves.</p>';
  }
  const body = read.lines.map((line) => `<p class="k-sentence">${line}</p>`).join('');
  return `${body}<p class="k-sentence sx-muted">${read.scope}</p>`;
}
