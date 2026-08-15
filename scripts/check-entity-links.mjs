#!/usr/bin/env node
// check-entity-links.mjs — J5 "Everything is a link" (CANONICAL_BUILD_MAP §11.12).
//
// The resolver is PURE, so most of this is a real behavioural test rather than substring matching:
// it imports entityResolver and exercises it. Only the placement rules — which are about DOM and
// CSS the resolver never sees — fall back to source assertions, and each one guards a trap that is
// live in this codebase rather than a style preference.
//
// Run: node scripts/check-entity-links.mjs

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENTITY_TYPES, parseEntityRef, entityExists, entityLabel, resolveEntity } from '../src/ui/entityResolver.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const failures = [];
const notes = [];
const fail = (rule, detail) => failures.push(`${rule}: ${detail}`);
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

// ── A. behaviour: every declared type resolves, and nothing else does ──────────────────────────
// A representative real id per type. `contract` is a LIVE record, not a catalogue, so it is driven
// from a synthetic state below rather than from a fixture id.
const SAMPLES = {
  faction: 'faction_scn',
  commodity: 'cmdty_ore_iron',
  station: 'station_helios',
  sector: 'sector_helios_prime',
  hull: 'ship_kestrel',
  module: 'mod_shield_booster_s',
  captain: 'ace_yara_no_cut',
};
const STATE = {
  factions: { faction_scn: { rep: -120, tier: 'Poor', aggro: false, bribesPaid: 0 } },
  missions: { active: [{ id: 'mission_probe', reward: 4200, factionId: 'faction_scn', sectorId: 'sector_helios_prime', status: 'active', description: 'Probe fixture.' }] },
};

for (const type of ENTITY_TYPES) {
  const id = type === 'contract' ? 'mission_probe' : SAMPLES[type];
  if (!id) { fail('A/coverage', `no sample id for declared type "${type}" — it cannot be proven to resolve`); continue; }
  const ref = `${type}:${id}`;
  const d = resolveEntity(STATE, ref);
  if (!d) { fail('A/resolve', `${ref} resolves to null — a declared type that cannot produce a dossier`); continue; }
  if (!d.label) fail('A/label', `${ref} produced a dossier with no label`);
  if (d.type !== type || d.id !== id) fail('A/identity', `${ref} produced type=${d.type} id=${d.id}`);
  // A dossier with no facts AND no lines is a door into an empty room.
  if (!d.facts.length && !d.lines.length) fail('A/substance', `${ref} produced an empty dossier (no facts, no lines)`);
  for (const f of d.facts) {
    if (f.tone && !['you', 'foe', 'goal', 'calm'].includes(f.tone)) {
      fail('A/tone', `${ref} fact "${f.k}" uses tone "${f.tone}" — not a grammar §4 role`);
    }
  }
  // Every onward link must itself resolve, or the graph has dead ends.
  for (const l of d.links) {
    if (!entityExists(l.ref)) fail('A/graph', `${ref} links to ${l.ref}, which does not exist`);
  }
}
notes.push(`${ENTITY_TYPES.length} entity types resolved with real dossiers`);

// ── B. the causeLedger discipline: unknown resolves to NOTHING, never a placeholder ────────────
const JUNK = [
  'faction:faction_does_not_exist', 'sector:nope', 'commodity:', 'station',
  'garbage', '', ':x', 'notatype:faction_scn', null, undefined, 42, {},
];
for (const bad of JUNK) {
  if (resolveEntity(STATE, bad) !== null) {
    fail('B/unknown', `resolveEntity(${JSON.stringify(bad)}) returned a dossier — unknown refs must render NOTHING`);
  }
  if (entityLabel(bad) != null && parseEntityRef(bad)) {
    fail('B/unknown', `entityLabel(${JSON.stringify(bad)}) invented a label`);
  }
}
// A resolver that throws instead of returning null would take a screen down with it.
try { resolveEntity(null, 'faction:faction_scn'); } catch (e) { fail('B/throw', `resolveEntity threw on a null state: ${e.message}`); }
notes.push(`${JUNK.length} malformed refs rejected without inventing text`);

// ── C. placement: the three traps that no runtime assertion can see ───────────────────────────
const LINKS = 'src/ui/entityLinks.js';
const links = read(LINKS);

// C1 — the delegate must sit on #screens. screenManager binds shieldModalPointerEvent to that node
// in the bubble phase and stopPropagation()s while a modal is open, so a document-level delegate
// never fires at all.
if (!/screensRoot\.addEventListener\('click'/.test(links)) {
  fail('C1/delegate', `${LINKS} does not bind its click delegate to #screens — a document-level delegate never fires behind screenManager's pointer shield`);
}
if (/document\.addEventListener\('click'/.test(links)) {
  fail('C1/delegate', `${LINKS} binds a document-level click listener, which screenManager's shield swallows`);
}

// C2 — the drawer must mount inside the active screen root, or screenManager's Tab trap
// (which tests rec.el.contains(active)) yanks focus out of it on every Tab.
if (!/host\.appendChild\(layer\)/.test(links) || !/activeScreenRoot\(\)/.test(links)) {
  fail('C2/mount', `${LINKS} no longer parents the drawer layer to the active screen root — the focus trap will eject it`);
}
if (/document\.body\.appendChild\(\s*layer/.test(links)) {
  fail('C2/mount', `${LINKS} parents the drawer to <body>, outside screenManager's focus trap and inert handling`);
}

// C3 — .screen carries a transform, which makes it the containing block for position:fixed
// descendants. The drawer layer must therefore be absolute, and its host stretched while open.
const CSS = 'styles/ui.css';
const css = read(CSS);
const at = css.indexOf('/* 14 ─ entity links');
if (at < 0) {
  fail('C3/css', `${CSS} has no entity-link/drawer block (section 14)`);
} else {
  const block = css.slice(at).replace(/\/\*[\s\S]*?\*\//g, '');
  if (!/\.sf-drawerlayer\s*\{[^}]*position:\s*absolute/.test(block)) {
    fail('C3/css', `${CSS}: .sf-drawerlayer is not position:absolute — .screen's transform makes fixed anchor to a possibly content-sized box`);
  }
  if (!/\.screen\.sf-drawerhost\s*\{[^}]*inset:\s*0/.test(block)) {
    fail('C3/css', `${CSS}: .sf-drawerhost does not stretch its screen — the drawer would slide inside a content-sized box`);
  }
  // The host class must be removable, or every screen that ever showed a drawer stays relaid-out.
  if (!/classList\.remove\('sf-drawerhost'\)/.test(links)) {
    fail('C3/css', `${LINKS} never removes .sf-drawerhost — screens stay force-stretched after the drawer closes`);
  }
  // An entity link must not read as a link by colour alone.
  if (!/\.sf-entity-link\s*\{[^}]*text-decoration:\s*underline/.test(block)) {
    fail('C3/a11y', `${CSS}: .sf-entity-link has no underline — colour alone fails colour-blind and forced-colors modes`);
  }
  if (!/@media\s*\(\s*forced-colors:\s*active\s*\)/.test(block)) {
    fail('C3/a11y', `${CSS} entity block has no @media (forced-colors: active) rule`);
  }
}

// C4 — Escape must close the drawer WITHOUT also popping the screen behind it.
if (!/ev\.key !== 'Escape'/.test(links) || !/addEventListener\('keydown', onKeydown, true\)/.test(links)) {
  fail('C4/escape', `${LINKS} does not own Escape in the capture phase — one Esc would close the drawer AND pop the screen`);
}

// C5 — a drawer is not a modal. Tier 3 is the floor (grammar §7). Match SETTING the attribute, not
// reading it: entityLinks legitimately queries `.screen[aria-modal="true"]` to find which screen
// owns the stack, and a bare /aria-modal/ flagged that selector as a violation.
if (/setAttribute\(\s*['"]aria-modal|['"]aria-modal['"]\s*:/.test(links)) {
  fail('C5/tier', `${LINKS} sets aria-modal — a DRAWER must never be a modal-over-modal (grammar §7)`);
}

// ── D. tagging: every emitted data-entity must be able to resolve ──────────────────────────────
function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) yield* walk(p);
    else if (name.endsWith('.js')) yield p;
  }
}
let tagged = 0;
let guarded = 0;
let callSites = 0;   // includes the helper's own definition; the tagged-noun count subtracts it
for (const abs of walk(join(ROOT, 'src'))) {
  const rel = relative(ROOT, abs).replace(/\\/g, '/');
  if (rel === LINKS || rel === 'src/ui/entityResolver.js') continue;
  const src = readFileSync(abs, 'utf8');
  if (!src.includes('data-entity')) continue;
  // Literal refs must resolve right now; interpolated ones must be guarded by entityExists so a
  // runtime-only id degrades to plain text rather than a door into an empty room.
  for (const m of src.matchAll(/data-entity="([^"$`]+)"/g)) {
    tagged++;
    if (!entityExists(m[1])) {
      const line = src.slice(0, m.index).split('\n').length;
      fail('D/tag', `${rel}:${line} emits data-entity="${m[1]}", which does not resolve`);
    }
  }
  for (const _ of src.matchAll(/data-entity="\$\{/g)) {
    tagged++;
    if (!/entityExists|entityAttr/.test(src)) {
      fail('D/tag', `${rel} interpolates data-entity without an entityExists guard — a stale id becomes a dead door`);
    } else guarded++;
  }
  // Count the real adoption surface too. A file can route every tag through one guarded helper, so
  // counting `data-entity` literals alone under-reports how many nouns actually became doors.
  for (const _ of src.matchAll(/\bentityAttr\(/g)) callSites++;
}
if (tagged === 0) fail('D/adoption', 'no screen emits data-entity — an unadopted resolver proves nothing');
if (callSites <= 1) {
  fail('D/adoption', `only ${callSites} tagged noun(s) in screens — the tagging pass has not happened`);
}
notes.push(`${tagged} data-entity emission point(s), ${guarded} guarded; ${callSites - 1} tagged nouns in screens`);

for (const n of notes) console.log(`  · ${n}`);
if (failures.length) {
  console.error('\ncheck:entity-links FAILED');
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log('check:entity-links OK — 8 types resolve, unknowns render nothing, drawer placement safe');
