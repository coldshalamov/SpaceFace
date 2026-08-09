#!/usr/bin/env node
// Validate the microevent catalog and generate its human-readable documents.
//
// SINGLE SOURCE OF TRUTH: catalog/*.json. EVENT_BIBLE.md, DEPENDENCY_MAP.md and
// TIERS.md are GENERATED - edit the catalog, rerun this, never edit the outputs.
// That is what keeps the machine-readable and human-readable deliverables from
// drifting apart.
//
// Deliberately NOT registered in package.json: the catalog is additive design data
// that nothing imports until a later integration task. Run directly:
//
//   node design/incubator/microevent_library/build-microevent-bible.mjs
//
// Deterministic: no dates, no randomness; same catalog -> byte-identical docs.

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CATALOG_DIR = join(HERE, 'catalog');

const CATEGORY_ORDER = ['work', 'logistics', 'law', 'crime', 'accident', 'construction', 'civilian', 'environmental'];
const REQUIRED = ['id', 'title', 'category', 'durationS', 'participants', 'environment',
  'arrangement', 'startConditions', 'visibleCue', 'phases', 'completion', 'interruptions',
  'playerInterference', 'criminalOpportunity', 'aftermath', 'systems', 'fallback', 'tier'];

const schema = JSON.parse(readFileSync(join(HERE, 'microevent.schema.json'), 'utf8'));
const ROLES = new Set(schema.properties.participants.items.properties.role.enum);
const SYSTEMS = new Set(schema.properties.systems.items.enum);
const SIGNALS = new Set(schema.$defs.signal.enum);
const TIERS = new Set(schema.properties.tier.enum);

// ---------------------------------------------------------------------------
// Load + validate. The validator is intentionally hand-rolled (no deps) and
// fails loudly with every finding at once, not just the first.

const errors = [];
const events = [];
for (const file of readdirSync(CATALOG_DIR).sort()) {
  if (!file.endsWith('.json')) continue;
  const doc = JSON.parse(readFileSync(join(CATALOG_DIR, file), 'utf8'));
  if (doc.schema !== 'spaceface.microevent.v1') errors.push(`${file}: bad schema tag ${doc.schema}`);
  for (const ev of doc.events) {
    ev._file = file;
    events.push(ev);
  }
}

const seen = new Set();
for (const ev of events) {
  const where = `${ev._file}:${ev.id ?? '<no id>'}`;
  for (const k of REQUIRED) if (!(k in ev)) errors.push(`${where}: missing required field '${k}'`);
  if (ev.id) {
    if (!/^ev_[a-z0-9_]+$/.test(ev.id)) errors.push(`${where}: bad id format`);
    if (seen.has(ev.id)) errors.push(`${where}: duplicate id`);
    seen.add(ev.id);
  }
  if (ev.durationS && (ev.durationS[0] < 5 || ev.durationS[1] > 180 || ev.durationS[0] > ev.durationS[1]))
    errors.push(`${where}: durationS out of the 10s-2min brief band (5..180 tolerated)`);
  for (const p of ev.participants ?? [])
    if (!ROLES.has(p.role)) errors.push(`${where}: unknown participant role '${p.role}'`);
  for (const s of ev.systems ?? [])
    if (!SYSTEMS.has(s)) errors.push(`${where}: unknown system '${s}'`);
  for (const ph of ev.phases ?? [])
    for (const sig of ph.signals ?? [])
      if (!SIGNALS.has(sig)) errors.push(`${where}: phase '${ph.name}' unknown signal '${sig}'`);
  if (ev.tier && !TIERS.has(ev.tier)) errors.push(`${where}: unknown tier '${ev.tier}'`);
  if (ev.tier === 'blocked') {
    if (!ev.blockedOn) errors.push(`${where}: blocked without blockedOn`);
    if (!(ev.systems ?? []).some((s) => s.startsWith('future.')))
      errors.push(`${where}: blocked but no future.* system listed`);
  } else if ((ev.systems ?? []).some((s) => s.startsWith('future.'))) {
    errors.push(`${where}: lists a future.* system but tier is not 'blocked'`);
  }
  if ((ev.playerInterference ?? []).length < 1) errors.push(`${where}: needs at least one player interference option`);
}

const byTier = { first15: [], next20: [], standard: [], blocked: [] };
for (const ev of events) (byTier[ev.tier] ?? (byTier[ev.tier] = [])).push(ev);
if (byTier.first15.length !== 15) errors.push(`tier first15 has ${byTier.first15.length} events, expected exactly 15`);
if (byTier.next20.length !== 20) errors.push(`tier next20 has ${byTier.next20.length} events, expected exactly 20`);
if (events.length < 50 || events.length > 70) errors.push(`catalog has ${events.length} events, brief asks 50-70`);

if (errors.length) {
  console.error(`[microevents] ${errors.length} validation error(s):`);
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Generation helpers.

const inCategoryOrder = (list) =>
  [...list].sort((a, b) =>
    CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) || a.id.localeCompare(b.id));

function participantLine(ev) {
  return ev.participants
    .map((p) => `${p.count}x ${p.role}${p.optional ? ' (optional)' : ''}${p.note ? ` — ${p.note}` : ''}`)
    .join('; ');
}

function eventBlock(ev) {
  const out = [];
  out.push(`### \`${ev.id}\` — ${ev.title}`);
  out.push('');
  out.push(`*${ev.durationS[0]}–${ev.durationS[1]} s · tier: ${ev.tier}${ev.tier === 'blocked' ? ` · blocked on: ${ev.blockedOn}` : ''}*`);
  out.push('');
  out.push(`**Participants:** ${participantLine(ev)}`);
  if (ev.environment.length) out.push(`**Environment:** ${ev.environment.join('; ')}`);
  out.push(`**Arrangement:** ${ev.arrangement}`);
  out.push(`**Starts when:** ${ev.startConditions}`);
  out.push(`**The tell:** ${ev.visibleCue}`);
  out.push('');
  out.push('| # | phase | ~s | what you see |');
  out.push('|---|---|---:|---|');
  ev.phases.forEach((ph, i) => {
    const sig = ph.signals?.length ? ` _[${ph.signals.join(', ')}]_` : '';
    out.push(`| ${i + 1} | ${ph.name} | ${ph.durationS} | ${ph.visible}${sig} |`);
  });
  out.push('');
  out.push(`**Completes:** ${ev.completion}`);
  if (ev.interruptions.length) {
    out.push(`**Interrupts:** ${ev.interruptions.map((x) => `${x.trigger} → ${x.outcome}`).join(' · ')}`);
  }
  out.push(`**Player can:** ${ev.playerInterference.join(' · ')}`);
  if (ev.criminalOpportunity) out.push(`**Criminal read:** ${ev.criminalOpportunity}`);
  if (ev.aftermath) out.push(`**Aftermath:** ${ev.aftermath}`);
  out.push(`**Runs on:** ${ev.systems.join(', ')}`);
  out.push(`**If an actor vanishes:** ${ev.fallback}`);
  if (ev.notes) out.push(`**Notes:** ${ev.notes}`);
  if (ev.diagramMermaid) {
    out.push('');
    out.push('```mermaid');
    out.push(ev.diagramMermaid);
    out.push('```');
  }
  out.push('');
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// EVENT_BIBLE.md

const bible = [];
bible.push('<!-- GENERATED by build-microevent-bible.mjs from catalog/*.json - do not edit by hand -->');
bible.push('<!-- LIFETIME: DURABLE -->');
bible.push('# The Microevent Bible — ambient choreography for a lived-in region');
bible.push('');
bible.push(`${events.length} short ambient events (10 s – 2 min) expressed as state-machine`);
bible.push('choreography over systems that already exist: the six npcJobs kinds, the thirteen');
bible.push('Working Light signals, the five encounter scripts, the four station-side VFX');
bible.push('profiles, wrecks, pickups and passive avoidance. No NPC AI rewrite; no dialogue.');
bible.push('Every event obeys the design rule: **a player who never opens a mission log can');
bible.push('WATCH it and roughly understand what happened.** Each entry names its tell, its');
bible.push('visible phases, and what is left behind.');
bible.push('');
bible.push('Machine source of truth: `catalog/*.json` (validated against');
bible.push('`microevent.schema.json`). This file is generated; edit the catalog instead.');
bible.push('');
const counts = CATEGORY_ORDER.map((c) => `${c} ${events.filter((e) => e.category === c).length}`).join(' · ');
bible.push(`**Census:** ${counts} — first15 ${byTier.first15.length} / next20 ${byTier.next20.length} / standard ${byTier.standard.length} / blocked ${byTier.blocked.length}`);
bible.push('');
for (const cat of CATEGORY_ORDER) {
  bible.push(`## ${cat.toUpperCase()}`);
  bible.push('');
  for (const ev of inCategoryOrder(events.filter((e) => e.category === cat))) bible.push(eventBlock(ev));
}
writeFileSync(join(HERE, 'EVENT_BIBLE.md'), bible.join('\n'), 'utf8');

// ---------------------------------------------------------------------------
// DEPENDENCY_MAP.md — which events lean on which existing systems and roles.

const dep = [];
dep.push('<!-- GENERATED by build-microevent-bible.mjs - do not edit by hand -->');
dep.push('# Dependency map — events vs existing systems and roles');
dep.push('');
dep.push('`donor.*` rows are OPTIONAL dressing from the incubator packs (events must run');
dep.push('without them); `future.*` rows are missing mechanics and appear only on blocked');
dep.push('events. Everything else exists in the live game today (2026-08-08 audit).');
dep.push('');
const sysMap = new Map();
for (const ev of events) for (const s of ev.systems) {
  if (!sysMap.has(s)) sysMap.set(s, []);
  sysMap.get(s).push(ev.id);
}
dep.push('## By system');
dep.push('');
dep.push('| system | events | count |');
dep.push('|---|---|---:|');
for (const s of [...sysMap.keys()].sort()) {
  const ids = sysMap.get(s).sort();
  dep.push(`| \`${s}\` | ${ids.map((i) => `\`${i}\``).join(' ')} | ${ids.length} |`);
}
dep.push('');
const roleMap = new Map();
for (const ev of events) for (const p of ev.participants) {
  if (!roleMap.has(p.role)) roleMap.set(p.role, new Set());
  roleMap.get(p.role).add(ev.id);
}
dep.push('## By participant role');
dep.push('');
dep.push('| role | events | count |');
dep.push('|---|---|---:|');
for (const r of [...roleMap.keys()].sort()) {
  const ids = [...roleMap.get(r)].sort();
  dep.push(`| ${r} | ${ids.map((i) => `\`${i}\``).join(' ')} | ${ids.length} |`);
}
dep.push('');
const sigMap = new Map();
for (const ev of events) for (const ph of ev.phases) for (const s of ph.signals ?? []) {
  if (!sigMap.has(s)) sigMap.set(s, new Set());
  sigMap.get(s).add(ev.id);
}
dep.push('## By Working Light signal');
dep.push('');
dep.push('| signal | events | count |');
dep.push('|---|---|---:|');
for (const s of [...sigMap.keys()].sort()) {
  const ids = [...sigMap.get(s)].sort();
  dep.push(`| \`${s}\` | ${ids.map((i) => `\`${i}\``).join(' ')} | ${ids.length} |`);
}
dep.push('');
writeFileSync(join(HERE, 'DEPENDENCY_MAP.md'), dep.join('\n'), 'utf8');

// ---------------------------------------------------------------------------
// TIERS.md — implementation order.

const tiers = [];
tiers.push('<!-- GENERATED by build-microevent-bible.mjs - do not edit by hand -->');
tiers.push('# Implementation tiers — what to wire first');
tiers.push('');
tiers.push('## First 15 — least new code');
tiers.push('');
tiers.push('These compose existing encounter scripts, job cycles, signals and station-side');
tiers.push('profiles; the only new machinery is a small choreography timer that sequences');
tiers.push('phases and retargets waypoints. None needs a new asset, system, or physics.');
tiers.push('');
for (const ev of inCategoryOrder(byTier.first15)) tiers.push(`- \`${ev.id}\` — ${ev.title} *(${ev.category})*`);
tiers.push('');
tiers.push('## Next 20 — small additions');
tiers.push('');
tiers.push('Each needs one modest, named addition: a new TRAFFIC_ROLES entry, a');
tiers.push('parented-drift carry link, a manifest-transfer helper, a spawn-on-impact prop,');
tiers.push('or a donor hull promotion for full effect (all run degraded without it).');
tiers.push('');
for (const ev of inCategoryOrder(byTier.next20)) tiers.push(`- \`${ev.id}\` — ${ev.title} *(${ev.category})*`);
tiers.push('');
tiers.push('## Standard backlog');
tiers.push('');
for (const ev of inCategoryOrder(byTier.standard)) tiers.push(`- \`${ev.id}\` — ${ev.title} *(${ev.category})*`);
tiers.push('');
tiers.push('## Blocked on future mechanics');
tiers.push('');
for (const ev of inCategoryOrder(byTier.blocked)) tiers.push(`- \`${ev.id}\` — ${ev.title}: **${ev.blockedOn}**`);
tiers.push('');
writeFileSync(join(HERE, 'TIERS.md'), tiers.join('\n'), 'utf8');

console.log(`[microevents] OK: ${events.length} events across ${CATEGORY_ORDER.length} categories ` +
  `(first15 ${byTier.first15.length}, next20 ${byTier.next20.length}, standard ${byTier.standard.length}, ` +
  `blocked ${byTier.blocked.length}); wrote EVENT_BIBLE.md, DEPENDENCY_MAP.md, TIERS.md`);
