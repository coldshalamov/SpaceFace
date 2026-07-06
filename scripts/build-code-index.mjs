// Auto-generates docs/EVENT_ROUTING.md and docs/SYSTEM_REGISTRY.md by scanning src/.
// Run: `npm run build:indexes` (or `node scripts/build-code-index.mjs`).
//
// Why this exists: the codebase has 187+ bus events across 408+ subscription sites with no
// routing map. Agents tracing "who emits combat:fire / who handles it" had to grep 400+ sites
// fresh every time. This regenerates the map in <100ms so it never rots.
//
// Zero dependencies (Node built-ins only), matches the repo's check-script convention.
// Scans src/**/*.js for: bus.emit('event:name') / .on('event:name') / add('event:name', ...)
// and registry.js for the system list + update order. Emits markdown tables.

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SRC = join(ROOT, 'src');
const DOCS = join(ROOT, 'docs');
const now = new Date().toISOString().slice(0, 10);

// --- file walker (recursive, .js only) ---
function walkJs(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walkJs(p, out);
    else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}

// --- event extraction ---
// Matches: bus.emit('x:y'), this.bus.emit("x:y"), ctx.bus.emit('x:y'), .emit('x:y'),
//          bus.on('x:y'), .on('x:y'), add('x:y', ...), bus.once('x:y')
const EVENT_NAME = '[a-z][a-zA-Z0-9]*:[a-zA-Z][a-zA-Z0-9]*';
const EMIT_RE = new RegExp(`\\.emit\\(\\s*['"](${EVENT_NAME})['"]`, 'g');
const SUB_RE = new RegExp(`\\.on(?:ce)?\\(\\s*['"](${EVENT_NAME})['"]`, 'g');
const ADD_RE = new RegExp(`\\badd\\(\\s*['"](${EVENT_NAME})['"]`, 'g');

function scanFile(path) {
  const src = readFileSync(path, 'utf8');
  const lines = src.split(/\r?\n/);
  const emits = [];
  const subs = [];
  lines.forEach((line, i) => {
    const lineNo = i + 1;
    // skip comment-only lines (cheap pre-filter; // at start after whitespace)
    const trimmed = line.trimStart();
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) return;
    let m;
    EMIT_RE.lastIndex = 0;
    while ((m = EMIT_RE.exec(line)) !== null) emits.push({ event: m[1], line: lineNo });
    SUB_RE.lastIndex = 0;
    while ((m = SUB_RE.exec(line)) !== null) subs.push({ event: m[1], line: lineNo, kind: 'on' });
    ADD_RE.lastIndex = 0;
    while ((m = ADD_RE.exec(line)) !== null) subs.push({ event: m[1], line: lineNo, kind: 'add' });
  });
  return { emits, subs };
}

function rel(p) { return relative(ROOT, p).split(sep).join('/'); }

function shortRel(p) {
  // "src/systems/combat.js" → "systems/combat.js"; "src/render/vfx.js" → "render/vfx.js"
  return rel(p).replace(/^src\//, '');
}

// --- registry parsing (system list + update order) ---
function parseRegistry() {
  const regPath = join(SRC, 'core', 'registry.js');
  const src = readFileSync(regPath, 'utf8');
  // Extract the SYSTEMS array literal and UPDATE_ORDER array literal.
  const systemsMatch = src.match(/const SYSTEMS = \[([\s\S]*?)\];/);
  const orderMatch = src.match(/const UPDATE_ORDER = \[([\s\S]*?)\];/);
  const parseNames = (block) =>
    (block || '')
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith('//') && !s.startsWith('}'))
      .filter((s) => /^[a-zA-Z]/.test(s));
  return {
    initOrder: parseNames(systemsMatch ? systemsMatch[1] : ''),
    updateOrder: parseNames(orderMatch ? orderMatch[1] : ''),
  };
}

// --- main ---
const files = walkJs(SRC).sort();
const byEvent = new Map(); // event → { emitters: [{file,line}], subscribers: [{file,line,kind}] }
const byFile = new Map(); // file → { emits:[], subs:[] }

for (const f of files) {
  const { emits, subs } = scanFile(f);
  byFile.set(f, { emits, subs });
  for (const e of emits) {
    if (!byEvent.has(e.event)) byEvent.set(e.event, { emitters: [], subscribers: [] });
    byEvent.get(e.event).emitters.push({ file: shortRel(f), line: e.line });
  }
  for (const s of subs) {
    if (!byEvent.has(s.event)) byEvent.set(s.event, { emitters: [], subscribers: [] });
    byEvent.get(s.event).subscribers.push({ file: shortRel(f), line: s.line, kind: s.kind });
  }
}

const events = [...byEvent.keys()].sort();
const { initOrder, updateOrder } = parseRegistry();

// --- write EVENT_ROUTING.md ---
const evLines = [];
evLines.push('# Event Routing Map — auto-generated');
evLines.push('');
evLines.push('> **Do not edit by hand.** Regenerate with `npm run build:indexes`. Scans `src/**/*.js` for');
evLines.push("> `bus.emit`/`.on`/`add('event', ...)` sites. Use this to trace any event end-to-end:");
evLines.push('> who emits it, who subscribes. Companion to `docs/MODULE_MAP.md` and');
evLines.push('> `design/EVENT_TAXONOMY.md` (which covers only the telemetry-sink subset).');
evLines.push('>');
evLines.push(`> Generated: ${now} · ${events.length} events · ${[...byEvent.values()].reduce((a, e) => a + e.emitters.length + e.subscribers.length, 0)} routing sites.`);
evLines.push('');
evLines.push('## By event (alphabetical)');
evLines.push('');
evLines.push('| Event | Emitters (file:line) | Subscribers (file:line) |');
evLines.push('|---|---|---|');
for (const ev of events) {
  const { emitters, subscribers } = byEvent.get(ev);
  const e = emitters.map((x) => `\`${x.file}:${x.line}\``).join(', ') || '—';
  const s = subscribers.map((x) => `\`${x.file}:${x.line}\``).join(', ') || '—';
  evLines.push(`| \`${ev}\` | ${e} | ${s} |`);
}
evLines.push('');
evLines.push('## Events with no emitter (likely dead, or emitted dynamically)');
evLines.push('');
const dead = events.filter((e) => byEvent.get(e).emitters.length === 0);
if (dead.length) {
  for (const e of dead) evLines.push(`- \`${e}\` — ${byEvent.get(e).subscribers.length} subscriber(s)`);
} else {
  evLines.push('(none)');
}
evLines.push('');
evLines.push('## Events with no subscriber (likely dead, or subscribed dynamically)');
evLines.push('');
const orphan = events.filter((e) => byEvent.get(e).subscribers.length === 0);
if (orphan.length) {
  for (const e of orphan) evLines.push(`- \`${e}\` — ${byEvent.get(e).emitters.length} emitter(s)`);
} else {
  evLines.push('(none)');
}
writeFileSync(join(DOCS, 'EVENT_ROUTING.md'), evLines.join('\n') + '\n');

// --- write SYSTEM_REGISTRY.md ---
// For each system in update order: file, lines, emits, subs, owned state fields (heuristic).
const sysLines = [];
sysLines.push('# System Registry — auto-generated');
sysLines.push('');
sysLines.push('> **Do not edit by hand.** Regenerate with `npm run build:indexes`. Derives the system list,');
sysLines.push('> init/update order, and per-system event emissions/subscriptions by scanning `src/`. The');
sysLines.push('> authoritative source is `src/core/registry.js`; this is a navigable projection of it.');
sysLines.push('>');
sysLines.push(`> Generated: ${now}. Live/legacy note: \`flight\` and \`ai\` slots are flag-selected`);
sysLines.push("> (see root `AGENTS.md` §5). Defaults: `flightBackend:'v3'`, `aiBackend:'sg06-tactical'`,");
sysLines.push("> `physicsBackend:'rapier-dynamic'`. Legacy `flight.js`/`ai.js` are fallback-only.");
sysLines.push('');
sysLines.push('## Init order (registration order — `registry.js` SYSTEMS array)');
sysLines.push('');
sysLines.push('```');
sysLines.push(initOrder.map(normalizeSlot).join(' → '));
sysLines.push('```');
sysLines.push('');
sysLines.push('## Update order (per-tick sim step order — `registry.js` UPDATE_ORDER)');
sysLines.push('');
sysLines.push('```');
sysLines.push(updateOrder.map(normalizeSlot).join(' → '));
sysLines.push('```');
sysLines.push('');
sysLines.push('## Per-system detail');
sysLines.push('');
sysLines.push('| Slot | Likely file | Lines | Emits (count) | Subscribes (count) | Top events |');
sysLines.push('|---|---|---|---|---|---|');

// Map slot name → likely file. Most systems live in src/systems/<name>.js; some differ.
const slotToFile = {
  flight: ['systems/flightV3.js', 'systems/flight.js'], // flag-selected
  ai: ['systems/tacticalAI.js', 'systems/ai.js'], // flag-selected
  render: ['render/renderer.js'],
  vfx: ['render/vfx.js'],
  feel: ['render/feel.js'],
  audio: ['audio/audioSystem.js'],
  ui: ['ui/uiRoot.js'],
  save: ['save/saveSystem.js'],
  core: ['core/coreSystem.js'],
  physics: ['core/physics.js'],
  input: ['systems/input.js'],
};

function findFile(slot) {
  const candidates = slotToFile[slot] || [`systems/${slot}.js`, `${slot}.js`];
  for (const c of candidates) {
    const full = join(SRC, c);
    try { statSync(full); return full; } catch { /* try next */ }
  }
  // fallback: grep for name: 'slot' across systems
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    if (new RegExp(`name:\\s*['"]${slot}['"]`).test(src)) return f;
  }
  return null;
}

// The UPDATE_ORDER array uses the resolved slot variables (aiSlot, flightSlot). Normalize to the
// canonical slot name so the table reads "ai" / "flight" and resolves to the LIVE file.
function normalizeSlot(slot) {
  if (slot === 'aiSlot') return 'ai';
  if (slot === 'flightSlot') return 'flight';
  return slot;
}

for (const rawSlot of updateOrder) {
  const slot = normalizeSlot(rawSlot);
  const f = findFile(slot);
  if (!f) { sysLines.push(`| \`${slot}\` | *(not found)* | — | — | — | — |`); continue; }
  const info = byFile.get(f) || { emits: [], subs: [] };
  const lineCount = readFileSync(f, 'utf8').split(/\r?\n/).length;
  const emitCount = info.emits.length;
  const subCount = info.subs.length;
  // top events = most-emitted
  const evCount = new Map();
  for (const e of info.emits) evCount.set(e.event, (evCount.get(e.event) || 0) + 1);
  const top = [...evCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([e, n]) => `\`${e}\`×${n}`).join(', ');
  const fileLabel = slot === 'flight' || slot === 'ai' ? `\`${shortRel(f)}\` (+ legacy)` : `\`${shortRel(f)}\``;
  sysLines.push(`| \`${slot}\` | ${fileLabel} | ${lineCount} | ${emitCount} | ${subCount} | ${top || '—'} |`);
}

sysLines.push('');
sysLines.push('## Render-phase order (every animation frame)');
sysLines.push('');
sysLines.push('`render.prepareFrame` → `render.drawPreparedFrame` (or `render.renderFrame`) → `vfx.update` → `feel.frame` → `ui.frame`');
sysLines.push('');
sysLines.push('See `src/core/registry.js` `renderUpdate()` and root `AGENTS.md` §8 for rationale.');

writeFileSync(join(DOCS, 'SYSTEM_REGISTRY.md'), sysLines.join('\n') + '\n');

// --- console summary ---
console.log(`[build-code-index] wrote docs/EVENT_ROUTING.md (${events.length} events)`);
console.log(`[build-code-index] wrote docs/SYSTEM_REGISTRY.md (${updateOrder.length} systems in update order)`);
console.log(`[build-code-index] ${dead.length} events with no emitter, ${orphan.length} with no subscriber`);
