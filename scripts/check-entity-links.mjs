#!/usr/bin/env node
// check-entity-links.mjs — J5 "Everything is a link" (build_map §11.12).
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
import { TECH_NODES } from '../src/data/tech.js';
import { MODULES } from '../src/data/modules.js';
import { WEAPONS } from '../src/data/weapons.js';
import { ORES, RECIPES } from '../src/data/mining.js';
import { OUTPOSTS } from '../src/data/automation.js';

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
  missions: {
    active: [{ id: 'mission_probe', reward: 4200, factionId: 'faction_scn', sectorId: 'sector_helios_prime', status: 'active', description: 'Probe fixture.' }],
    // Station boards hold offers under a different field spelling (reward_cr / destSectorId /
    // brief). A board row that cannot resolve is a dead door — the contract dossier reads both.
    boards: {
      station_helios: {
        slots: [{ id: 'board_probe', title: 'Board Probe Run', reward_cr: 900, factionId: 'faction_scn', destSectorId: 'sector_helios_prime', brief: 'Board fixture.' }],
      },
    },
  },
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
// A contract that exists only on a station mission board must still open a real dossier —
// labelled by its offer title, priced by reward_cr, routed by destSectorId.
const boardOffer = resolveEntity(STATE, 'contract:board_probe');
if (!boardOffer) {
  fail('A/board', 'contract:board_probe — a live station-board offer resolves to nothing (dead door on the Bar board)');
} else {
  if (boardOffer.label !== 'Board Probe Run') fail('A/board', `board dossier label "${boardOffer.label}" — expected the offer title`);
  if (!boardOffer.facts.some((f) => f.k === 'Pays' && /900/.test(String(f.v)))) fail('A/board', 'board dossier never priced reward_cr');
  if (!boardOffer.links.some((l) => l.ref === 'sector:sector_helios_prime')) fail('A/board', 'board dossier never linked destSectorId');
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

// ── D. tagging: named surfaces emit doors; every literal ref must resolve ─────────────────────
function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) yield* walk(p);
    else if (name.endsWith('.js')) yield p;
  }
}

// ── E. surface manifest (PQ-183.00) ────────────────────────────────────────────────────────────
// "Every mention is a door." Each entry pins ONE noun-emitting surface to the resolver helper that
// tags it: the regex must match the actual adoption site, so deleting the tag (or reverting the
// emitter to bare text) fails the check on that surface's name. Prose/canvas surfaces that carry
// no DOM mention (bar contact dialogue, drill canvas labels, localmap route buttons, the HUD —
// which has no drawer host while no screen is open) are documented residuals, not entries.
const SURFACE_MANIFEST = [
  // [file, surface, adoption-site probe]
  ['src/ui/galaxyMap.js', 'chart inspector faction/jurisdiction rows', /entityAttr\('faction:'/],
  ['src/ui/galaxyMap.js', 'chart inspector commodity best-sell', /entityAttr\('commodity:'/],
  ['src/ui/galaxyMap.js', 'chart inspector sector target', /entityAttr\('sector:'/],
  ['src/ui/galaxyMap.js', 'chart inspector station title', /entityAttr\('station:'/],
  ['src/ui/screens/missionLog.js', 'contract destination station', /entitySpanHtml\('station:' \+ m\.destStationId/],
  ['src/ui/screens/missionLog.js', 'contract destination sector', /entitySpanHtml\('sector:' \+ m\.destSectorId/],
  ['src/ui/screens/missionLog.js', 'contract terms: contract door', /entitySpanHtml\('contract:' \+ m\.id/],
  ['src/ui/screens/missionLog.js', 'contract terms: client faction', /entitySpanHtml\('faction:' \+ m\.factionId/],
  ['src/ui/screens/missionLog.js', 'career chip contact faction', /entitySpanHtml\(place\.contactRef/],
  ['src/ui/screens/missionLog.js', 'career chip location (station · sector)', /place\.locationParts\.map\(\(p\) => \(p\.ref \? entitySpanHtml/],
  ['src/ui/screens/missionLog.js', 'trade-route recommended action title', /entitySpanHtml\(a\.titleRef/],
  ['src/ui/station/screens/market.js', 'commodity rows', /entitySpanHtml\('commodity:' \+ r\.id/],
  ['src/ui/station/screens/market.js', 'trade-route destination stations', /entitySpanHtml\('station:' \+ t\.destStation/],
  ['src/ui/station/screens/contracts.js', 'destination station/sector names', /entitySpanHtml\('(?:station|sector):'/],
  ['src/ui/station/screens/contracts.js', 'client faction', /entitySpanHtml\('faction:' \+ m\.factionId/],
  ['src/ui/station/screens/contracts.js', 'contract title door', /entitySpanHtml\('contract:' \+ String\(mid\(m\)\)/],
  ['src/ui/station/screens/contracts.js', 'cargo commodity', /entitySpanHtml\('commodity:' \+ cargo\.commodityId/],
  ['src/ui/screens/starmap.js', 'faction influence rows', /entitySpanHtml\('faction:' \+ id/],
  ['src/ui/screens/starmap.js', 'selected sector', /entitySpanHtml\('sector:' \+ s\.id/],
  ['src/ui/screens/starmap.js', 'commodity market-memory heading', /entitySpanHtml\('commodity:' \+ this\._commodityId/],
  ['src/ui/screens/starmap.js', 'route-leg sectors', /entitySpanHtml\('sector:' \+ leg\.from/],
  ['src/ui/screens/starmap.js', 'market-memory stations', /entitySpanHtml\('station:' \+ entry\.stationId/],
  ['src/ui/screens/footprint.js', 'sector place readout', /entitySpanHtml\('sector:' \+ sectorId/],
  ['src/ui/screens/footprint.js', 'faction focus line', /entitySpanHtml\('faction:' \+ faction/],
  ['src/ui/screens/footprint.js', 'record rows (node/incident/ace)', /decorateEntityNode\(node, ref\)/],
  ['src/ui/screens/drill.js', 'ore legend items', /decorateEntityNode\(legendItem\.querySelector\('\.drill-legend-label'\), 'commodity:' \+ oreId\)/],
  ['src/ui/screens/drill.js', 'manifest hold rows', /decorateEntityNode\(oreName, 'commodity:' \+ commodityId\)/],
  ['src/ui/screens/drill.js', 'scan tooltip vein name', /entitySpanHtml\('commodity:' \+ t\.ore/],
  ['src/ui/screens/drill.js', 'settle manifest items', /decorateEntityNode\(oreLink, 'commodity:' \+ commodityId\)/],
  ['src/ui/screens/techTree.js', 'unlock rows (hulls/modules)', /entitySpanHtml\(ref, name\)/],
  ['src/ui/screens/automationPanel.js', 'outpost feedstock inputs', /entitySpanHtml\('commodity:' \+ input\.goodId/],
  ['src/ui/screens/automationPanel.js', 'outpost sector pill', /entitySpanHtml\('sector:' \+ o\.sectorId/],
  ['src/ui/screens/automationPanel.js', 'outpost output good', /entitySpanHtml\('commodity:' \+ operation\.output\.goodId/],
  ['src/ui/screens/automationPanel.js', 'wingman hull card', /entitySpanHtml\('hull:' \+ fs\.defId/],
  ['src/ui/screens/automationPanel.js', 'assignable owned hull', /entitySpanHtml\('hull:' \+ s\.defId/],
  ['src/ui/screens/saveLoad.js', 'portrait hull + grudge captain lines', /paintEntityLine\(nodes\.(hull|grudge)/],
  ['src/ui/screens/saveLoad.js', 'slot ship name', /paintEntityLine\(refs\.shipName/],
  ['src/ui/screens/pause.js', 'flight-brief objective contract', /entitySpanHtml\(mention\.ref/],
  ['src/ui/screens/help.js', 'ships register names', /'hull:' \+ s\.id/],
  ['src/ui/screens/help.js', 'commodities register names', /'commodity:' \+ c\.id/],
  ['src/ui/screens/help.js', 'ores register names', /'commodity:' \+ o\.id/],
  ['src/ui/screens/help.js', 'faction roster names', /decorateEntityNode\(fname, 'faction:' \+ f\.id\)/],
  ['src/ui/screens/crucible.js', 'starter hull blurb', /entitySpanHtml\('hull:' \+ starter\.hullId/],
  ['src/ui/screens/crucibleDraft.js', 'refit fitted module name', /decorateEntityNode\(valueEl, lines\.valueRef\)/],
  ['src/ui/screens/gameOver.js', 'recovery dock value', /decorateEntityNode\(els\.dock, 'station:' \+ recovery\.stationId\)/],
  ['src/ui/screens/gameOver.js', 'recovery berth line', /entitySpanHtml\('station:' \+ recovery\.stationId/],
  ['src/ui/station/stationApp.js', 'docked station crest name', /decorateEntityNode\(crestName, dockedRef\)/],
  ['src/ui/station/stationApp.js', 'berth ident holding faction', /entitySpanHtml\('faction:' \+ st\.factionId/],
  ['src/ui/station/screens/bar.js', 'frontier rumor sector', /entitySpanHtml\('sector:' \+ offer\.sectorId/],
  ['src/ui/station/screens/bar.js', 'survey lead sector', /entitySpanHtml\('sector:' \+ survey\.sectorId/],
  ['src/ui/station/screens/bar.js', 'mission-board contract title', /entitySpanHtml\('contract:' \+ mid\(m\)/],
  ['src/ui/station/screens/factions.js', 'faction identity name', /entitySpanHtml\('faction:' \+ f\.id/],
  ['src/ui/station/screens/industry.js', 'fabricator input materials', /entitySpanHtml\('commodity:' \+ id/],
  ['src/ui/station/screens/shipworks.js', 'staged hull name', /entitySpanHtml\('hull:' \+ model\.def\.id/],
  ['src/ui/station/screens/shipworks.js', 'hull list names', /entitySpanHtml\('hull:' \+ def\.id/],
  ['src/ui/station/screens/shipworks.js', 'module row names', /entitySpanHtml\('module:' \+ d\.id/],
  ['src/ui/screens/codex.js', 'discovery sector plates', /decorateEntityNode\(linked, 'sector:' \+ plate\.sectorId\)/],
  ['src/ui/screens/codex.js', 'figure faction affiliation', /decorateEntityNode\(org, 'faction:' \+ FIGURE_FACTION\[key\]\)/],
];
const MANIFEST_MIN_SURFACES = 30;
for (const [rel, surface, re] of SURFACE_MANIFEST) {
  let src;
  try { src = read(rel); } catch (_) { fail('E/manifest', `${rel} (${surface}) — file missing`); continue; }
  if (!re.test(src)) fail('E/unlinked', `${rel} (${surface}) emits its entity noun untagged — the mention is not a door`);
}
if (SURFACE_MANIFEST.length < MANIFEST_MIN_SURFACES) {
  fail('E/manifest', `only ${SURFACE_MANIFEST.length} surfaces in the manifest — PQ-183.00 requires ≥ ${MANIFEST_MIN_SURFACES}`);
}
notes.push(`${SURFACE_MANIFEST.length} manifest surfaces each pin a tagged emitter`);

// ── E2. id-space resolution crawl ──────────────────────────────────────────────────────────────
// The manifest proves helpers are CALLED; this proves the ids those helpers are fed RESOLVE.
// Emitters draw ids from live catalogues — if a catalogue drifts outside the resolver vocabulary
// (e.g. weapons emitted as `module:` before WEAPONS joined the index), every tag on that surface
// silently degrades while the regex still passes. Crawl each emitter-facing id space and demand
// the door can actually open.
const ID_SPACES = [
  ['tech unlock modules', 'module', TECH_NODES.flatMap((n) => (n.unlocks && n.unlocks.modules) || [])],
  ['tech unlock hulls', 'hull', TECH_NODES.flatMap((n) => (n.unlocks && n.unlocks.ships) || [])],
  ['shipworks fittable catalogue', 'module', MODULES.concat(WEAPONS).map((m) => m.id)],
  ['drill ore ids', 'commodity', ORES.map((o) => o.id)],
  ['industry fabricator goods', 'commodity', RECIPES.flatMap((r) => [...Object.keys(r.inputs || {}), ...Object.keys(r.output || {})])],
  ['automation outpost goods', 'commodity', OUTPOSTS.flatMap((o) => o.recipe ? [...Object.keys(o.recipe.inputs || {}), ...Object.keys(o.recipe.output || {})] : [])],
];
for (const [space, type, ids] of ID_SPACES) {
  for (const id of ids) {
    if (!entityExists(`${type}:${id}`)) {
      fail('E2/resolve', `${space}: \`${type}:${id}\` is emitted on a tagged surface but never resolves — a dead door`);
    }
  }
}
notes.push(`id-space crawl: ${ID_SPACES.reduce((n, [, , ids]) => n + ids.length, 0)} emitter-fed ids all resolve`);

// Census note (not a failure): files under screens/ and station/ that import an entity catalogue
// but never call a resolver helper are the remaining prose/canvas/button-wrapped residuals.
const CATALOGUE_IMPORT = /from\s+'[^']*data\/(factions|commodities|stations|sectors|ships|modules|aces|missions)\.js'/;
const censusResidual = [];
for (const abs of walk(join(ROOT, 'src/ui'))) {
  const rel = relative(ROOT, abs).replace(/\\/g, '/');
  if (!rel.startsWith('src/ui/screens/') && !rel.startsWith('src/ui/station/')) continue;
  const src = readFileSync(abs, 'utf8');
  if (CATALOGUE_IMPORT.test(src) && !/entitySpanHtml|decorateEntityNode|entityAttr/.test(src)) censusResidual.push(rel);
}
notes.push(`entity-catalogue files without a tagged surface (prose/canvas residuals): ${censusResidual.length ? censusResidual.join(', ') : 'none'}`);

let tagged = 0;
let guarded = 0;
let callSites = 0;
for (const abs of walk(join(ROOT, 'src'))) {
  const rel = relative(ROOT, abs).replace(/\\/g, '/');
  if (rel === LINKS || rel === 'src/ui/entityResolver.js') continue;
  const src = readFileSync(abs, 'utf8');
  // Literal refs must resolve right now; interpolated ones must be guarded so a stale id degrades
  // to plain text rather than a door into an empty room.
  for (const m of src.matchAll(/data-entity="([^"$`]+)"/g)) {
    tagged++;
    if (!entityExists(m[1])) {
      const line = src.slice(0, m.index).split('\n').length;
      fail('D/tag', `${rel}:${line} emits data-entity="${m[1]}", which does not resolve`);
    }
  }
  for (const _ of src.matchAll(/data-entity="\$\{/g)) {
    tagged++;
    if (!/entityExists|entityAttr|entitySpanHtml|decorateEntityNode/.test(src)) {
      fail('D/tag', `${rel} interpolates data-entity without an existence guard — a stale id becomes a dead door`);
    } else guarded++;
  }
  // Helpers live in entityResolver (skipped above). Counting them here is the real adoption surface.
  for (const _ of src.matchAll(/\b(entityAttr|entitySpanHtml|decorateEntityNode)\s*\(/g)) callSites++;
}
if (callSites < SURFACE_MANIFEST.length) {
  fail('D/adoption', `only ${callSites} tagged-noun helper call(s) in screens — below the ${SURFACE_MANIFEST.length}-surface manifest, the tagging pass has regressed`);
}
notes.push(`${tagged} literal data-entity emission(s), ${guarded} guarded interpolations; ${callSites} helper call(s) across screens`);

for (const n of notes) console.log(`  · ${n}`);
if (failures.length) {
  console.error('\ncheck:entity-links FAILED');
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log('check:entity-links OK — 8 types resolve, unknowns render nothing, drawer placement safe');
