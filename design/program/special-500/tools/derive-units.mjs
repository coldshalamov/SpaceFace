#!/usr/bin/env node
// derive-units.mjs — derives the Phase-2 build ledger (500 units) from live catalog truth.
//
// Re-running is idempotent: existing status/commit/verification fields and hand-set size
// overrides (recorded in the previous ledger) are preserved by unit id.
//
// Usage: node design/program/special-500/tools/derive-units.mjs [--print-stats]

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..', '..');
const OUT = join(HERE, '..', 'BUILD_LEDGER.json');

const { SPECIAL500, SPECIAL500_ALL, special500ById } = await import(
  'file://' + join(ROOT, 'src/data/special500/index.js').replace(/\\/g, '/')
);

const ratifiedIds = new Set(SPECIAL500.map((e) => e.id));

// ---- 1. derive the unit list -------------------------------------------------

const units = [];
const seen = new Set();

function add(entry, source, legs) {
  if (seen.has(entry.id)) return;
  seen.add(entry.id);
  units.push({
    id: entry.id,
    title: entry.title,
    kind: entry.kind,
    sectors: entry.sectors || [],
    source,
    legs,
    followup: entry.followup || '',
    sees: entry.trigger && entry.trigger.sees ? '' : '', // consensus text lives in CONSENSUS_500.json
    size: null,
    family: null,
    batch: null,
    status: 'pending',
    commit: '',
    verification: '',
    note: '',
  });
}

const isDormant = (e) => !!e.dormant;
const isAnnex = (e) => !ratifiedIds.has(e.id);

for (const e of SPECIAL500_ALL) {
  if (isDormant(e)) { add(e, 'dormant', ['dormant']); continue; }
  if (e.followup) { add(e, isAnnex(e) ? 'annex-followup' : 'ratified-followup', []); continue; }
  if (e.channel === 'spectacle') {
    add(e, isAnnex(e) ? 'annex-spectacle' : 'ratified-spectacle', ['spectacle']);
  }
}

// Serial mail pass: 24 letters keyed to entries already firing complete as authored
// (flag exists -> letter arrives). Deterministic pick, round-robin across kinds.
const mailPool = SPECIAL500.filter((e) =>
  !isDormant(e) && !e.followup && e.channel !== 'spectacle' && ratifiedIds.has(e.id)
);
const byKind = new Map();
for (const e of mailPool) {
  if (!byKind.has(e.kind)) byKind.set(e.kind, []);
  byKind.get(e.kind).push(e);
}
const kindOrder = [...byKind.keys()].sort();
let mailNeeded = 29;
let round = 0;
while (mailNeeded > 0) {
  let progressed = false;
  for (const k of kindOrder) {
    const list = byKind.get(k);
    if (round < list.length) { add(list[round], 'mail', ['mail']); mailNeeded--; progressed = true; if (mailNeeded === 0) break; }
  }
  if (!progressed) break;
  round++;
}

// ---- 2. classify size by mechanic keywords -----------------------------------

const RE = {
  minigame: /minigame|racing|race course|drill course|runnable job|boreDeadDrop|course/,
  serializedVendor: /page-store|page store|serialized|subscription/,
  npcSpawn: /(spawn|roam).{0,40}(captain|crew|wing|family|npc|figure)|oneOffCast|roamers/,
  placeRecord: /place record|chartable place|PLACE_REGISTRATION|world site|world-site|persistent site/,
  encounter: /encounter|squad|wing|hostile|ambush|attack|boarding|pirate|hunter|patrol|hostiles/,
  choice: /choice|choose|pay-or-refuse|invoice|deal|broker|accept|refuse|offer/,
  vendor: /vendor|market|wares|shelf|stock|price/,
  cache: /cache|stash|strongbox|locker|loot/,
  counter: /counter|tally|stat|history row|record row|screen|panel|\bui\b|\bhud\b|chart/,
  codex: /codex|lore|attribution/,
  mail: /mail|letter/,
  lightMood: /light|dims|dim|moon|eclipse|aurora|sky|star|glow/,
  formation: /silhouette|formation|convoy|parade|procession|traffic/,
};

function classify(u) {
  if (u.source === 'dormant') return ['large', 'dormant'];
  const text = `${u.followup} ${u.title}`.toLowerCase();
  const legs = Object.entries(RE).filter(([, re]) => re.test(text)).map(([k]) => k);
  u.legs = legs.length ? legs : ['other'];
  if (RE.minigame.test(text) || RE.serializedVendor.test(text) || RE.npcSpawn.test(text)) {
    return ['large', RE.npcSpawn.test(text) ? 'spawn' : (RE.minigame.test(text) ? 'minigame' : 'vendor')];
  }
  // Spectacle-only units are presentation legs regardless of what words their titles contain.
  if (u.source.endsWith('spectacle')) {
    if (RE.formation.test(text) || RE.lightMood.test(text)) return ['medium', 'spectacle'];
    return ['small', 'spectacle'];
  }
  if (RE.placeRecord.test(text)) return ['medium', 'world'];
  if (RE.encounter.test(text)) return ['medium', 'encounter'];
  if (RE.choice.test(text)) return ['medium', 'choice'];
  if (RE.vendor.test(text)) return ['medium', 'vendor'];
  if (RE.cache.test(text)) return ['medium', 'cache'];
  if (RE.counter.test(text) && !RE.codex.test(text)) return ['small', 'counter'];
  if (RE.mail.test(text)) return ['small', 'mail'];
  if (RE.codex.test(text)) return ['small', 'codex'];
  if (u.source === 'mail') return ['small', 'mail'];
  return ['medium', 'other'];
}

for (const u of units) {
  const [size, family] = classify(u);
  u.size = size;
  u.family = family;
}

// ---- 3. rebalance to exactly 167 / 167 / 166 ---------------------------------

const TARGET = { small: 167, medium: 167, large: 166 };
function countSizes() {
  const c = { small: 0, medium: 0, large: 0 };
  for (const u of units) c[u.size]++;
  return c;
}
// Rich legs (multiple keyword families) move toward large; single-leg units toward small.
const richness = (u) => u.legs.length;
let counts = countSizes();
const rebalanceNotes = [];
// Fill 'large' from 'medium' first (prefer richest), then from 'small'.
while (counts.large < TARGET.large) {
  const pool = units.filter((u) => u.size === 'medium').sort((a, b) => richness(b) - richness(a));
  const u = pool[0];
  if (!u) break;
  u.size = 'large'; u.note = (u.note ? u.note + '; ' : '') + 'promoted to large (balance)';
  rebalanceNotes.push(`${u.id}: medium->large`);
  counts = countSizes();
}
while (counts.large > TARGET.large) {
  const pool = units.filter((u) => u.size === 'large' && u.source !== 'dormant')
    .sort((a, b) => richness(a) - richness(b));
  const u = pool[0];
  if (!u) break;
  u.size = 'medium'; u.note = (u.note ? u.note + '; ' : '') + 'demoted to medium (balance)';
  rebalanceNotes.push(`${u.id}: large->medium`);
  counts = countSizes();
}
while (counts.small < TARGET.small) {
  const pool = units.filter((u) => u.size === 'medium').sort((a, b) => richness(a) - richness(b));
  const u = pool[0];
  if (!u) break;
  u.size = 'small'; u.note = (u.note ? u.note + '; ' : '') + 'demoted to small (balance)';
  rebalanceNotes.push(`${u.id}: medium->small`);
  counts = countSizes();
}
while (counts.small > TARGET.small) {
  const pool = units.filter((u) => u.size === 'small').sort((a, b) => richness(b) - richness(a));
  const u = pool[0];
  if (!u) break;
  u.size = 'medium'; u.note = (u.note ? u.note + '; ' : '') + 'promoted to medium (balance)';
  rebalanceNotes.push(`${u.id}: small->medium`);
  counts = countSizes();
}
while (counts.medium > TARGET.medium) {
  const pool = units.filter((u) => u.size === 'medium').sort((a, b) => richness(a) - richness(b));
  const u = pool[0];
  if (!u) break;
  u.size = 'small'; u.note = (u.note ? u.note + '; ' : '') + 'demoted to small (balance)';
  rebalanceNotes.push(`${u.id}: medium->small`);
  counts = countSizes();
}

// ---- 4. batch assignment ------------------------------------------------------
// Family order; pilot batch (1) proves every route; batch 0 is INFRA (not counted).
const UNITS_PER_BATCH = 14;
const familyOrder = ['mail', 'spectacle', 'codex', 'counter', 'encounter', 'choice',
  'vendor', 'cache', 'world', 'spawn', 'minigame', 'other', 'dormant'];

// Pilot batch: 12 units, 2 per family where available, smallest sizes first for confidence.
const pilot = [];
for (const fam of ['mail', 'spectacle', 'codex', 'encounter', 'choice', 'vendor']) {
  const pool = units.filter((u) => u.family === fam && u.batch === null)
    .sort((a, b) => ({ small: 0, medium: 1, large: 2 })[a.size] - ({ small: 0, medium: 1, large: 2 })[b.size]);
  pilot.push(...pool.slice(0, 2));
}
for (const u of pilot) { u.batch = 1; u.note = (u.note ? u.note + '; ' : '') + 'pilot batch'; }

let batchNo = 2;
for (const fam of familyOrder) {
  const pool = units.filter((u) => u.family === fam && u.batch === null);
  for (let i = 0; i < pool.length; i += UNITS_PER_BATCH) {
    for (const u of pool.slice(i, i + UNITS_PER_BATCH)) u.batch = batchNo;
    batchNo++;
  }
}

// ---- 5. write ledger ----------------------------------------------------------

const LEDGER_VERSION = 'spaceface.special500.phase2.v1';
const prevPath = OUT;
let prev = null;
if (existsSync(prevPath)) {
  try {
    prev = JSON.parse(readFileSync(prevPath, 'utf8'));
  } catch { prev = null; }
}
const prevById = new Map((prev && prev.units ? prev.units : []).map((u) => [u.id, u]));

let preserved = 0;
for (const u of units) {
  const p = prevById.get(u.id);
  if (!p) continue;
  // Preserve progress; hand-set size overrides win over re-derivation.
  u.status = p.status || u.status;
  u.commit = p.commit || '';
  u.verification = p.verification || '';
  u.note = p.note || u.note;
  if (p.sizeOverride) { u.size = p.sizeOverride; preserved++; }
  if (p.batch && p.batchOverride) u.batch = p.batch;
  preserved++;
}

// Infra unit (not counted in the 500) rides at the head of the ledger.
const infraUnit = {
  id: 'INFRA-SPECTACLE-REGISTRY',
  title: 'Spectacle presentation registry: director emits special500:spectacle; a presentation system maps entry ids to VFX/lamp/audio templates',
  kind: 'infra',
  sectors: [],
  source: 'infra',
  legs: ['spectacle', 'audio', 'visual'],
  followup: 'One small director emission + one registry + one system; every spectacle leg then lands as data.',
  size: 'large',
  family: 'infra',
  batch: 0,
  status: 'pending',
  commit: '',
  verification: '',
  note: 'infrastructure — not counted toward the 500',
};

const ledger = {
  schema: LEDGER_VERSION,
  updated: new Date().toISOString().slice(0, 10),
  plan: 'design/program/special-500/PHASE2_PLAN.md',
  totals: {
    target: 500,
    small: countSizes().small,
    medium: countSizes().medium,
    large: countSizes().large,
    landed: 0,
  },
  derivation: {
    ratifiedFollowup: units.filter((u) => u.source === 'ratified-followup').length,
    ratifiedSpectacle: units.filter((u) => u.source === 'ratified-spectacle').length,
    dormant: units.filter((u) => u.source === 'dormant').length,
    annexLegs: units.filter((u) => u.source.startsWith('annex-')).length,
    mail: units.filter((u) => u.source === 'mail').length,
    rebalances: rebalanceNotes.length,
  },
  units: [infraUnit, ...units.map(({ sees, ...rest }) => rest)],
};

writeFileSync(OUT, JSON.stringify(ledger, null, 1), 'utf8');

const stats = {};
for (const u of units) {
  stats[`${u.size}`] = (stats[u.size] || 0) + 1;
  stats[`fam:${u.family}`] = (stats[`fam:${u.family}`] || 0) + 1;
}
console.log('ledger written:', OUT);
console.log('units:', units.length, JSON.stringify(stats));
console.log('sources:', JSON.stringify(ledger.derivation));
console.log('batches:', Math.max(...ledger.units.map((u) => u.batch)));
if (process.argv.includes('--print-stats')) {
  for (const u of units.slice(0, 5)) console.log(JSON.stringify({ id: u.id, size: u.size, family: u.family, legs: u.legs }));
}
