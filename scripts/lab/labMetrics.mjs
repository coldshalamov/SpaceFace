// Shared metric helpers + result writer for tuning-lab benches.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export function stats(values) {
  const v = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (!v.length) return { n: 0, mean: null, p50: null, p95: null, min: null, max: null };
  const q = (p) => v[Math.min(v.length - 1, Math.max(0, Math.round(p * (v.length - 1))))];
  const mean = v.reduce((s, x) => s + x, 0) / v.length;
  return { n: v.length, mean: r4(mean), p50: r4(q(0.5)), p95: r4(q(0.95)), min: r4(v[0]), max: r4(v[v.length - 1]) };
}

export function r4(x) { return Number.isFinite(x) ? Math.round(x * 1e4) / 1e4 : x; }

export function writeResult(path, payload) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(payload, null, 2) + '\n');
}

/** Fixed-width table for terminal / notebook pasting. */
export function table(rows, columns) {
  const head = columns.map((c) => c.label);
  const body = rows.map((r) => columns.map((c) => {
    const v = typeof c.get === 'function' ? c.get(r) : r[c.key];
    return v == null ? '-' : (typeof v === 'number' ? String(r4(v)) : String(v));
  }));
  const widths = head.map((h, i) => Math.max(h.length, ...body.map((b) => b[i].length)));
  const line = (cells) => '| ' + cells.map((c, i) => c.padEnd(widths[i])).join(' | ') + ' |';
  return [line(head), '|' + widths.map((w) => '-'.repeat(w + 2)).join('|') + '|', ...body.map(line)].join('\n');
}
