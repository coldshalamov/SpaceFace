// S1 Phase-B stage 9 — event-surface census.
//
// Computes the sim-bus event boundary the same way stage-5 drew the write
// census: the sim side is exactly the module set the whole-sim worker imports
// (static-import closure of scripts/lib/simWorkerHost.mjs). Everything else
// under src/ is main-side.
//
// Emits a table (JSON + markdown) classifying every literal-string event type:
//   subscribers : files with bus.on/bus.once('type') inside the worker set
//   mainEmitters: files OUTSIDE the worker set with bus.emit/bus.queue('type')
//   simEmitters : files inside the worker set with bus.emit/bus.queue('type')
//
// A type is "main→sim required" when subscribers non-empty AND mainEmitters
// non-empty. Dynamic-type call sites (template/variable first arg) land in
// `dynamic` for human review — the census is explicit over literals and lists
// every dynamic site it could not bind.

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const ENTRY = resolve(ROOT, 'scripts/lib/simWorkerHost.mjs');

// ---- worker import set -----------------------------------------------------
const IMPORT_RE = /(?:import|export)\s+(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/g;
const DYN_IMPORT_RE = /import\(\s*['"]([^'"]+)['"]\s*\)/g;

function resolveSpecifier(spec, fromFile) {
  if (!spec.startsWith('.')) return null;
  let base = resolve(dirname(fromFile), spec);
  const candidates = extname(base) ? [base] : [`${base}.js`, `${base}.mjs`, `${base}/index.js`, `${base}/index.mjs`];
  for (const c of candidates) {
    try { if (statSync(c).isFile()) return c; } catch (_) {}
  }
  return null;
}

function walkImports(entry) {
  const seen = new Set();
  const stack = [entry];
  while (stack.length) {
    const file = stack.pop();
    if (!file || seen.has(file)) continue;
    seen.add(file);
    let src;
    try { src = readFileSync(file, 'utf8'); } catch (_) { continue; }
    for (const re of [IMPORT_RE, DYN_IMPORT_RE]) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(src))) {
        const r = resolveSpecifier(m[1], file);
        if (r && r.startsWith(ROOT) && !seen.has(r)) stack.push(r);
      }
    }
  }
  return seen;
}

// ---- source scan -----------------------------------------------------------
function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = resolve(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name.startsWith('.')) continue;
      yield* walk(p);
    } else if (/\.(js|mjs)$/.test(name)) {
      yield p;
    }
  }
}

// call sites: receiver.bus.(on|once|emit|queue)('type' | `tpl` | expr)
const CALL_RE = /([A-Za-z_$][\w$.[\]]*)\s*\.\s*(on|once|emit|queue)\s*\(\s*([^,)\n]+)/g;
// bare alias calls: on('type' / emit('type' — counted only when the file
// defines a local alias for that verb whose body touches a bus
// (`const on = (e,f) => bus.on(e,f)` / `function on(e,f){ ...bus.on... }`).
const ALIAS_RE = /(?:const|let|var)\s+(on|once|emit|queue)\s*=|function\s+(on|once|emit|queue)\s*\([^)]*\)\s*\{/g;
const BARE_CALL_RE = /(^|[^\w$.])(on|once|emit|queue)\s*\(\s*([^,)\n]+)/g;

function classifyArg(arg) {
  const a = arg.trim();
  if (/^['"][A-Za-z0-9_:.*-]+['"]$/.test(a)) return { kind: 'literal', type: a.slice(1, -1) };
  if (/^`[^`]*`$/.test(a)) return { kind: 'template', type: a };
  return { kind: 'expr', type: a };
}

function scanFile(file) {
  const src = readFileSync(file, 'utf8');
  const hits = [];
  CALL_RE.lastIndex = 0;
  let m;
  while ((m = CALL_RE.exec(src))) {
    const recv = m[1];
    const verb = m[2];
    const arg = classifyArg(m[3]);
    const line = src.slice(0, m.index).split('\n').length;
    hits.push({ recv, verb, ...arg, line });
  }
  // Bus-alias verbs defined in this file. An arrow assignment counts when its
  // rhs slice references `.bus` / `bus.`; a function declaration counts when a
  // window after the opening brace does.
  const aliases = new Set();
  ALIAS_RE.lastIndex = 0;
  while ((m = ALIAS_RE.exec(src))) {
    const verb = m[1] || m[2];
    const window = src.slice(m.index, m.index + 320);
    if (/\bbus\b/.test(window)) aliases.add(verb);
  }
  if (aliases.size) {
    BARE_CALL_RE.lastIndex = 0;
    while ((m = BARE_CALL_RE.exec(src))) {
      const verb = m[2];
      if (!aliases.has(verb)) continue;
      const arg = classifyArg(m[3]);
      const line = src.slice(0, m.index).split('\n').length;
      hits.push({ recv: `alias:${verb}`, verb, ...arg, line });
    }
  }
  return hits;
}

const workerSet = walkImports(ENTRY);
const workerRel = new Set([...workerSet].map((p) => relative(ROOT, p).replace(/\\/g, '/')));
// The browser worker entry + the lane twin are main-side transport, not sim.
workerRel.delete('src/core/wholeSimBrowserWorker.js');

const types = new Map(); // type -> {subscribers:Set, mainEmitters:Set, simEmitters:Set}
const dynamicSites = [];
const nonBusOn = new Map(); // suspicious .on receivers for eyeball review

function typeRec(t) {
  let r = types.get(t);
  if (!r) { r = { subscribers: new Set(), mainSubscribers: new Set(), mainEmitters: new Set(), simEmitters: new Set() }; types.set(t, r); }
  return r;
}

// Presentation-layer paths: transitively imported by the worker (shared
// helpers/constants) but their emit/on call sites only ever execute main-side.
// Per the stage-9 brief these are main-side regardless of import membership.
const PRESENTATION_RE = /^(src\/(ui|render|audio|presentation)\/|src\/main\.js$)/;
const isPresentationPath = (rel) => PRESENTATION_RE.test(rel);

// Harness code: drives its own in-process sim on its own bus — emits never
// touch the lane boundary. src/balance/** and src/testing/** are dev harnesses;
// haulerOriginSystem.js is a never-registered candidate module (dead code).
const HARNESS_RE = /^src\/(balance|testing)\//;
const HARNESS_FILES = new Set(['src/careers/origins/haulerOriginSystem.js']);
const isHarnessPath = (rel) => HARNESS_RE.test(rel) || HARNESS_FILES.has(rel);

const SRC = resolve(ROOT, 'src');
for (const file of walk(SRC)) {
  const rel = relative(ROOT, file).replace(/\\/g, '/');
  const inWorker = workerRel.has(rel) && !isPresentationPath(rel);
  for (const hit of scanFile(file)) {
    const busish = /(^|[._])bus$/i.test(hit.recv)
      || /(^|\.)(eventBus|events)$/i.test(hit.recv);
    if (hit.kind === 'literal') {
      if (hit.verb === 'on' || hit.verb === 'once') {
        if (hit.recv.startsWith('alias:') || busish) {
          if (isHarnessPath(rel)) continue;
          (inWorker ? typeRec(hit.type).subscribers : typeRec(hit.type).mainSubscribers).add(rel);
        } else if (!nonBusOn.has(hit.recv)) nonBusOn.set(hit.recv, `${rel}:${hit.line}`);
      } else { // emit | queue
        if (isHarnessPath(rel)) continue;
        const rec = typeRec(hit.type);
        if (inWorker) rec.simEmitters.add(rel);
        else rec.mainEmitters.add(rel);
      }
    } else if (hit.kind === 'template' || hit.kind === 'expr') {
      dynamicSites.push({ file: rel, line: hit.line, recv: hit.recv, verb: hit.verb, arg: hit.type, side: inWorker ? 'sim' : 'main' });
    }
  }
}

// ---- output ----------------------------------------------------------------
const rows = [];
for (const [t, r] of types) {
  rows.push({
    type: t,
    simSubscribers: [...r.subscribers].sort(),
    mainSubscribers: [...r.mainSubscribers].sort(),
    mainEmitters: [...r.mainEmitters].sort(),
    simEmitters: [...r.simEmitters].sort(),
    needsForward: r.subscribers.size > 0 && r.mainEmitters.size > 0,
  });
}
rows.sort((a, b) => a.type.localeCompare(b.type));

const out = {
  generatedAt: new Date().toISOString(),
  workerModuleCount: workerRel.size,
  rows,
  dynamicSites: dynamicSites.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line),
  nonBusOnReceivers: [...nonBusOn.entries()].sort(),
};
if (!process.argv.includes('--forward-set') && !process.argv.includes('--markdown')) {
  console.log(JSON.stringify(out, null, 1));
}

// ============================================================================
// Stage-9 forward-set emission.
//
// `--forward-set <path>`   writes src/core/mainToSimEventSurface.js (generated)
// `--markdown <path>`      writes design/perf/S1-EVENT-SURFACE.md
// Neither flag:            JSON census to stdout (scratch/analysis).
// ============================================================================

// Dynamic-type call sites the literal scan cannot bind, resolved by hand at
// stage 9. Each entry: the resolved event type, where the emit comes from, and
// why a literal scan missed it. Sim-side subscription was verified at the same
// sites the literal census lists.
const DYNAMIC_FORWARD = [
  { type: 'ui:buy', emitters: ['src/systems/pirates.js'], note: 'ternary emit: trade ? "ui:buy" : ...' },
  { type: 'ui:sell', emitters: ['src/systems/pirates.js'], note: 'ternary emit: trade ? ... : "ui:sell"' },
  { type: 'ui:talkContact', emitters: ['src/systems/barContacts.js'], note: 'emit via resolved event const' },
  { type: 'orrinWitness:submitEvidence', emitters: ['src/systems/barContacts.js'], note: 'emit via ORRIN_WITNESS_SUBMISSION_EVENT const; story.js:240 subscribes via the same const' },
  { type: 'claim:defenseIgnore', emitters: ['src/ui/galaxyMap.js'], note: 'verb.event / action.event.name emit' },
  { type: 'nav:engageRoute', emitters: ['src/ui/galaxyMap.js'], note: 'action.event emit' },
  { type: 'nav:abortRoute', emitters: ['src/ui/galaxyMap.js'], note: 'action.event emit' },
  { type: 'ui:endgameUnfiledJumpConfirm', emitters: ['src/systems/comms.js'], note: 'intentEvent emit' },
  { type: 'signal:track', emitters: ['src/ui/signalInvestigationPrompt.js'], note: 'resolved event const' },
  { type: 'signal:investigate', emitters: ['src/ui/signalInvestigationPrompt.js'], note: 'resolved event const' },
];

// Stage-8's hand-maintained forward set carried these on purpose: replayed
// worker→main types that are also emitted main-side during boot/restore, or
// kept for symmetric coverage. Unioned in so closing the hand-maintained list
// does not regress them.
const LEGACY_FORWARD = [
  'world:playerRelocated', 'ship:appearanceChanged', 'entity:kill',
  'entity:spawnRequest', 'save:restoring', 'save:loaded', 'scenario:branchChoice',
];

// Payload adapter classification: every forwarded type goes through the generic
// canonicalClone + entityRef-flatten adapter except these bespoke ones.
const BESPOKE_ADAPTERS = {
  'game:load': '__laneStorage: ships the whole sf.* keyspace into the worker storage shim',
  'game:save': '__laneStorage: ships the whole sf.* keyspace into the worker storage shim',
};

// Census hits that must NOT cross the lane anyway. game:started is a main-side
// lifecycle RECEIPT: the worker sim initiates its own game lifecycle (newGame
// rpc / save cascade), and replaying the receipt double-fires ~30 sim-side
// new-game subscribers — sectorSim._seedCurrentSector, factions/missions
// newGame, ships — spawning into an already-seeded world. Verified stage-9:
// forwarded game:started leaves duplicate ship ids in entityList, which the
// post-restore presentation-journal rebuild rejects (rebuild-publication-
// failed) → CONTINUE regression in check-game-playable. game:new is forwarded
// and verified safe; only the receipt is excluded.
const FORWARD_EXCLUDE = {
  'game:started': 'lifecycle receipt — worker runs its own new-game lifecycle; forwarding double-seeds the worker world (duplicate entity ids on restore)',
};

function computeForwardSet() {
  const censusTypes = new Set();
  for (const r of rows) if (r.needsForward) censusTypes.add(r.type);
  const dynamic = new Set(DYNAMIC_FORWARD.map((d) => d.type));
  const legacy = new Set(LEGACY_FORWARD);
  const excluded = new Set(Object.keys(FORWARD_EXCLUDE));
  const all = new Set([...censusTypes, ...dynamic, ...legacy]);
  for (const t of excluded) all.delete(t);
  return { censusTypes, dynamic, legacy, excluded, all };
}

function emitForwardSetModule(path) {
  const { censusTypes, dynamic, legacy, excluded, all } = computeForwardSet();
  const lines = [];
  lines.push('// GENERATED by scripts/lib/eventSurfaceCensus.mjs --forward-set.');
  lines.push('// Do not hand-edit: regenerate with `node scripts/lib/eventSurfaceCensus.mjs --forward-set`.');
  lines.push('//');
  lines.push('// Every event type a main-side emitter can raise that a sim-side system');
  lines.push('// subscribes to. installBusForward gates the main\u2192worker bus bridge on this');
  lines.push('// set; an emit whose type is absent bumps the unforwardedEmitTypes');
  lines.push('// diagnostic instead of crossing the lane.');
  lines.push('');
  lines.push('export const MAIN_TO_SIM_BUS_EVENTS = new Set([');
  for (const t of [...all].sort()) lines.push(`  '${t}',`);
  lines.push(']);');
  lines.push('');
  lines.push('// Census hits deliberately NOT forwarded — see FORWARD_EXCLUDE in the');
  lines.push('// generator for the full reasons.');
  for (const [t, reason] of Object.entries(FORWARD_EXCLUDE)) {
    lines.push(`//   ${t} — ${reason}`);
  }
  lines.push('');
  lines.push('// Types covered by bespoke payload adapters rather than the generic');
  lines.push('// canonicalClone+entityRef-flatten pass.');
  lines.push('export const BESPOKE_FORWARD_ADAPTERS = new Set([');
  for (const t of Object.keys(BESPOKE_ADAPTERS)) lines.push(`  '${t}',`);
  lines.push(']);');
  lines.push('');
  lines.push(`// provenance: census=${censusTypes.size} dynamic=${dynamic.size} legacy=${legacy.size} excluded=${excluded.size} total=${all.size}`);
  lines.push('');
  writeFileSync(path, lines.join('\n'), 'utf8');
  console.log(`wrote ${path}: ${all.size} forwarded types (census=${censusTypes.size} dynamic=${dynamic.size} legacy=${legacy.size} excluded=${excluded.size})`);
}

function emitMarkdown(path) {
  const { dynamic, legacy, all, excluded } = computeForwardSet();
  const L = [];
  L.push('# S1 event-surface census');
  L.push('');
  L.push('Generated by `node scripts/lib/eventSurfaceCensus.mjs --markdown`. Do not hand-edit.');
  L.push('');
  L.push('Sim side = static-import closure of `scripts/lib/simWorkerHost.mjs`, excluding');
  L.push('presentation paths (`src/ui/`, `src/render/`, `src/audio/`, `src/presentation/`,');
  L.push('`src/main.js`) and harness paths (`src/balance/**`, `src/testing/**`,');
  L.push('`src/careers/origins/haulerOriginSystem.js`). Main side = everything else.');
  L.push('');
  L.push(`**Forwarded main\u2192sim types: ${all.size}** (census-resolved + hand-resolved dynamic + legacy).`);
  L.push('');
  L.push('## Forwarded types (main-emitted, sim-subscribed)');
  L.push('');
  L.push('| event type | main emitters | sim subscribers | adapter |');
  L.push('|---|---|---|---|');
  for (const r of rows) {
    if (!r.needsForward || excluded.has(r.type)) continue;
    const adapter = BESPOKE_ADAPTERS[r.type] || 'generic (canonicalClone + entityRef flatten)';
    L.push(`| \`${r.type}\` | ${r.mainEmitters.map((f) => `\`${f}\``).join('<br>')} | ${r.simSubscribers.map((f) => `\`${f}\``).join('<br>')} | ${adapter} |`);
  }
  L.push('');
  L.push('## Census types deliberately NOT forwarded');
  L.push('');
  L.push('| event type | reason |');
  L.push('|---|---|');
  for (const [t, reason] of Object.entries(FORWARD_EXCLUDE)) {
    L.push(`| \`${t}\` | ${reason} |`);
  }
  L.push('');
  L.push('## Forwarded types (dynamic-resolved)');
  L.push('');
  L.push('Literal-arg scanning could not bind these sites; each was resolved by hand.');
  L.push('');
  L.push('| event type | main emitter | resolution |');
  L.push('|---|---|---|');
  for (const d of DYNAMIC_FORWARD) {
    L.push(`| \`${d.type}\` | ${d.emitters.map((f) => `\`${f}\``).join('<br>')} | ${d.note} |`);
  }
  L.push('');
  L.push('## Forwarded types (legacy, preserved from stage-8 set)');
  L.push('');
  L.push('Replayed or symmetric-coverage types kept so closing the hand-maintained');
  L.push('allowlist cannot regress them:');
  L.push('');
  for (const t of legacy) L.push(`- \`${t}\``);
  L.push('');
  L.push('## Deliberately main-only (emitted main-side, no sim subscribers)');
  L.push('');
  L.push('| event type | main emitters | reason |');
  L.push('|---|---|---|');
  for (const r of rows) {
    if (r.needsForward || r.mainEmitters.size === 0 || r.simSubscribers.size > 0) continue;
    L.push(`| \`${r.type}\` | ${r.mainEmitters.map((f) => `\`${f}\``).join('<br>')} | no sim-side subscribers |`);
  }
  L.push('');
  L.push('## Worker-emitted, main-subscribed (bridge adapters)');
  L.push('');
  L.push('Worker\u2192main projection types shipped by `scripts/lib/simEventBridge.mjs`');
  L.push('adapters:');
  L.push('');
  for (const r of rows) {
    if (r.simEmitters.size === 0 || r.mainSubscribers.size === 0) continue;
    L.push(`- \`${r.type}\``);
  }
  L.push('');
  L.push('## Dynamic call sites (unresolved by scan — reviewed, none needing forward missed)');
  L.push('');
  L.push('| file:line | recv.verb | arg | side |');
  L.push('|---|---|---|---|');
  for (const d of dynamicSites) {
    L.push(`| \`${d.file}:${d.line}\` | \`${d.recv}.${d.verb}\` | \`${d.arg}\` | ${d.side} |`);
  }
  L.push('');
  writeFileSync(path, L.join('\n'), 'utf8');
  console.log(`wrote ${path}: ${all.size} forwarded, ${rows.length} types total`);
}

const fwdFlag = process.argv.indexOf('--forward-set');
const mdFlag = process.argv.indexOf('--markdown');
if (fwdFlag !== -1) emitForwardSetModule(resolve(ROOT, process.argv[fwdFlag + 1] || 'src/core/mainToSimEventSurface.js'));
if (mdFlag !== -1) emitMarkdown(resolve(ROOT, process.argv[mdFlag + 1] || 'design/perf/S1-EVENT-SURFACE.md'));
