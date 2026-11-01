#!/usr/bin/env node
// DUST P1c — encounter exposure digest. Consumes one or more session-report JSON files (or stdin)
// and prints a compact cross-session summary of which authored encounter modules players actually
// crossed, as measured by the `exposure` section the telemetry sink writes (fed by the
// `encounter:telegraph` presentation seam; see src/systems/telemetry.js).
//
// Accepted inputs, per file (or stdin): a session-report JSON (the `exposure` section built by
// src/observability/sessionReport.js: `presentationsTotal`/`topIds`) or a raw serialized session
// (the live aggregate from src/systems/telemetry.js: `presentations`/`byEncounter`), as a single
// object, an array of objects, or an envelope `{ sessions: [...] }`. Report JSON itemizes only the
// per-session top ids, so id unions over report inputs are a lower bound and are flagged as such.
// Objects without an `exposure` section are counted as skipped and reported, never fatal.
//
// Usage:
//   node scripts/dust-exposure-digest.mjs reports/session-*.json
//   cat report.json | node scripts/dust-exposure-digest.mjs
import { readFileSync } from 'node:fs';

const TOP_N = 20;

function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch (error) {
    return null;
  }
}

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch (error) {
    console.error(`dust-exposure-digest: ${label} is not valid JSON (${error.message})`);
    process.exit(1);
  }
}

// Flatten any accepted input shape into a list of candidate session objects.
function sessionObjects(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') {
    if (Array.isArray(value.sessions)) return value.sessions;
    return [value];
  }
  return [];
}

function hasExposure(obj) {
  return !!obj && typeof obj === 'object' && obj.exposure && typeof obj.exposure === 'object';
}

function main() {
  const paths = process.argv.slice(2);
  const inputs = [];
  if (paths.length > 0) {
    for (const path of paths) {
      let text;
      try {
        text = readFileSync(path, 'utf8');
      } catch (error) {
        console.error(`dust-exposure-digest: cannot read ${path} (${error.message})`);
        process.exit(1);
      }
      inputs.push({ label: path, value: parseJson(text, path) });
    }
  } else {
    const text = readStdin();
    if (text == null || text.trim() === '') {
      console.error('dust-exposure-digest: no path arguments and stdin is empty — nothing to digest.');
      console.error('Usage: node scripts/dust-exposure-digest.mjs <session-report.json...>  (or pipe JSON via stdin)');
      process.exit(1);
    }
    inputs.push({ label: 'stdin', value: parseJson(text, 'stdin') });
  }

  const byId = new Map();
  const byTier = new Map();
  let sessions = 0;
  let skipped = 0;
  let presentationsTotal = 0;
  let overflowTotal = 0;
  let partialIdSessions = 0;

  for (const { label, value } of inputs) {
    for (const obj of sessionObjects(value)) {
      if (!hasExposure(obj)) {
        skipped += 1;
        continue;
      }
      sessions += 1;
      const ex = obj.exposure;
      presentationsTotal += Number(ex.presentations != null ? ex.presentations : ex.presentationsTotal) || 0;
      overflowTotal += Number(ex.overflow) || 0;
      // Raw aggregates carry the full `byEncounter` map; report JSON carries only `topIds`.
      const counts = ex.byEncounter && typeof ex.byEncounter === 'object'
        ? Object.entries(ex.byEncounter).map(([id, count]) => ({ id, count }))
        : Array.isArray(ex.topIds) ? ex.topIds : [];
      if (!ex.byEncounter && counts.length > 0) partialIdSessions += 1;
      for (const { id, count } of counts) {
        if (typeof id !== 'string') continue;
        const c = Number.isFinite(Number(count)) ? Math.max(0, Number(count)) : 0;
        if (c === 0) continue;
        byId.set(id, (byId.get(id) || 0) + c);
      }
      const tiers = ex.byTier && typeof ex.byTier === 'object' ? ex.byTier : {};
      for (const [tier, count] of Object.entries(tiers)) {
        const c = Number.isFinite(Number(count)) ? Math.max(0, Number(count)) : 0;
        if (c === 0) continue;
        byTier.set(tier, (byTier.get(tier) || 0) + c);
      }
    }
  }

  if (sessions === 0) {
    console.error('dust-exposure-digest: no session objects with an `exposure` section were found.');
    process.exit(1);
  }

  const filesLabel = paths.length > 0 ? `${paths.length} file(s)` : 'stdin';
  console.log(`dust-exposure-digest: ${sessions} session(s) from ${filesLabel}` + (skipped ? `, ${skipped} object(s) skipped (no exposure section)` : ''));
  console.log(`presentations: ${presentationsTotal}` + (overflowTotal ? ` (+${overflowTotal} overflow beyond per-session id caps)` : ''));
  const lowerBound = [];
  if (overflowTotal) lowerBound.push('overflow ids are not itemized');
  if (partialIdSessions) lowerBound.push(`${partialIdSessions} session(s) itemize only their top ids (report JSON input)`);
  console.log(`distinct module ids: ${byId.size}` + (lowerBound.length ? ` (lower bound — ${lowerBound.join('; ')})` : ''));

  const top = [...byId.entries()]
    .sort((a, b) => (b[1] - a[1]) || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .slice(0, TOP_N);
  if (top.length > 0) {
    console.log(`top ${top.length}:`);
    for (const [id, count] of top) {
      const share = presentationsTotal > 0 ? ` (${Math.round((count / presentationsTotal) * 1000) / 10}%)` : '';
      console.log(`  ${String(count).padStart(6)}  ${id}${share}`);
    }
  } else {
    console.log('top: (no itemized encounter ids)');
  }

  if (byTier.size > 0) {
    const tiers = [...byTier.entries()].sort((a, b) => (b[1] - a[1]) || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    console.log('by tier/category:');
    for (const [tier, count] of tiers) {
      console.log(`  ${String(count).padStart(6)}  ${tier}`);
    }
  }
}

main();
