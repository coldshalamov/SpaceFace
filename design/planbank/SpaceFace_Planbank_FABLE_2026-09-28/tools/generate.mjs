// Generator for the FABLE task bank. Authoring happens as data under tools/bank/*.mjs;
// this script emits INFERENCE_LINES.md, plans/**, INDEX.md, OVERLAP_MAP.md, BOARD_ROWS.md and
// FIRST_BATCHES.md from that one source so ids, cross-references and formats stay consistent.
// Usage: node design/planbank/SpaceFace_Planbank_FABLE_2026-09-28/tools/generate.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const BANK_DIR = path.join(HERE, 'bank');
const OUT = path.resolve(HERE, '..');
const PLANS = path.join(OUT, 'plans');

const LINE_GROUP_START = { PICTURE: 13, VERB: 14, WORLD: 21, INSTRUMENT: 17 };
const LINE_PREFIX = { PICTURE: 'PIC', VERB: 'VERB', WORLD: 'WORLD', INSTRUMENT: 'INST' };

async function loadChunks(prefix, key) {
  const files = fs.readdirSync(BANK_DIR).filter((n) => n.startsWith(prefix) && n.endsWith('.mjs')).sort();
  const out = [];
  for (const f of files) {
    const mod = await import(pathToFileURL(path.join(BANK_DIR, f)).href);
    const arr = mod[key];
    if (!Array.isArray(arr)) throw new Error(`${f} must export ${key}[]`);
    for (const item of arr) out.push({ ...item, _file: f });
  }
  return out;
}

const packets = await loadChunks('packets-', 'packets');
const lines = await loadChunks('lines-', 'lines');
const routing = await import(pathToFileURL(path.join(BANK_DIR, 'routing.mjs')).href);
const nearMap = (await import(pathToFileURL(path.join(BANK_DIR, 'near.mjs')).href)).near;
for (const p of packets) if (nearMap[p.slug]) p.near = [...new Set([...(p.near || []), ...nearMap[p.slug]])];
for (const slug of Object.keys(nearMap)) if (!packets.some((p) => p.slug === slug)) throw new Error(`near.mjs names unknown slug ${slug}`);

// ---- ids ---------------------------------------------------------------------------------
const slugToId = new Map();
packets.forEach((p, i) => {
  if (!p.slug || !p.domain || !p.title) throw new Error(`packet ${i} in ${p._file} lacks slug/domain/title`);
  if (slugToId.has(p.slug)) throw new Error(`duplicate slug ${p.slug}`);
  p.id = `FB-${String(i + 1).padStart(3, '0')}`;
  slugToId.set(p.slug, p.id);
});
const groupCounters = {};
for (const l of lines) {
  const g = l.group;
  if (!g) throw new Error(`line without group: ${l.change}`);
  const prefix = LINE_PREFIX[g] || g;
  if (!(g in groupCounters)) groupCounters[g] = LINE_GROUP_START[g] || 1;
  l.id = `${prefix}-${String(groupCounters[g]).padStart(2, '0')}`;
  groupCounters[g] += 1;
}

// ---- cross references ---------------------------------------------------------------------
function ref(text) {
  if (text == null) return '';
  return String(text).replace(/@([a-z0-9][a-z0-9-]+)/g, (m, slug) => {
    if (!slugToId.has(slug)) throw new Error(`unknown packet reference @${slug}`);
    return slugToId.get(slug);
  });
}
const code = (p) => `\`${p}\``;

// Word-wrap a paragraph at ~110 columns without breaking inside backticks; continuation lines get `indent`.
function wrap(text, indent = '') {
  const words = String(text).split(/\s+/);
  const out = [];
  let line = '';
  let open = false; // inside a backtick span
  for (const w of words) {
    const ticks = (w.match(/`/g) || []).length;
    const candidate = line ? `${line} ${w}` : w;
    if (line && candidate.length > 110 && !open) { out.push(line); line = w; } else line = candidate;
    if (ticks % 2 === 1) open = !open;
  }
  if (line) out.push(line);
  return out.map((l, i) => (i === 0 ? l : indent + l));
}

// ---- packets ------------------------------------------------------------------------------
function renderPacket(p) {
  const isCheck = /^CHECK/i.test(p.kind);
  const body = [];
  body.push(`# ${p.id} — ${ref(p.title)}`);
  body.push('');
  body.push(`**Kind:** ${p.kind} · **Lane:** ${p.lane} · **Routing:** ${p.routing || 'open'}`);
  body.push(`**Seam tags:** ${p.seams.map((s) => `seam: ${s}`).join(', ')}`);
  body.push(`**Write-set:** ${p.writeSet.map(code).join(', ')}`);
  if (p.near && p.near.length) body.push(`**Neighbours (extend, never restate):** ${p.near.join(', ')}`);
  body.push('');
  body.push('## The gap');
  body.push(...wrap(ref(p.gap)));
  body.push('');
  body.push('## Why this direction');
  body.push(...wrap(ref(p.why)));
  body.push('');
  body.push(isCheck ? '## Reproduction gate' : '## Mechanism');
  for (const m of p.mechanism) { const w = wrap(ref(m), '  '); body.push(`- ${w[0]}`, ...w.slice(1)); }
  body.push('');
  body.push('## Done when');
  body.push(...wrap(ref(p.done)));
  body.push('');
  body.push('## Do not');
  body.push(...wrap(ref(p.doNot)));
  body.push('');
  body.push('## Focus test starting points');
  for (const t of p.tests) { const w = wrap(ref(t), '  '); body.push(`- ${w[0]}`, ...w.slice(1)); }
  body.push('');
  return body.join('\n');
}

if (fs.existsSync(PLANS)) fs.rmSync(PLANS, { recursive: true, force: true });
fs.mkdirSync(PLANS, { recursive: true });
for (const p of packets) {
  const dir = path.join(PLANS, p.domain);
  fs.mkdirSync(dir, { recursive: true });
  p.file = `plans/${p.domain}/${p.id}-${p.slug}.md`;
  fs.writeFileSync(path.join(OUT, p.file), renderPacket(p), 'utf8');
}

// ---- INFERENCE_LINES.md -------------------------------------------------------------------
const groupOrder = ['PICTURE', 'VERB', 'WORLD', 'INSTRUMENT', ...[...new Set(lines.map((l) => l.group))].filter((g) => !LINE_PREFIX[g])];
const lineOut = [];
lineOut.push('# INFERENCE lines — ready-to-append rows for `design/program/INFERENCE_IDEAS.md`');
lineOut.push('');
lineOut.push(`Generated ${new Date().toISOString().slice(0, 10)} by the FABLE planning pass. ${lines.length} lines. Ids continue the live catalog (PIC-13+, VERB-14+, WORLD-21+, INST-17+); new groups start at 01. Every done sentence is checked on seed 4242 unless it names another seed or a focused test. Paths are 1–3 existing files. A line whose path is under \`src/ui/\` is a functional edit (a readout of a number the sim already computes, or a verb reaching its owner), never a redesign: read \`design/frontend/ORRERY.md\` first and keep the diff minimal. All lines OPEN.`);
lineOut.push('');
for (const g of groupOrder) {
  const rows = lines.filter((l) => l.group === g);
  if (!rows.length) continue;
  lineOut.push(`## ${g}`);
  lineOut.push('');
  lineOut.push('| Id | Player-visible change | Paths | Done | Do not | Status |');
  lineOut.push('|---|---|---|---|---|---|');
  for (const l of rows) {
    lineOut.push(`| ${l.id} | ${ref(l.change)} | ${l.paths.map(code).join(', ')} | ${ref(l.done)} | ${ref(l.doNot)} | OPEN |`);
  }
  lineOut.push('');
}
fs.writeFileSync(path.join(OUT, 'INFERENCE_LINES.md'), lineOut.join('\n'), 'utf8');

// ---- INDEX.md -----------------------------------------------------------------------------
const domains = [...new Set(packets.map((p) => p.domain))].sort();
const idx = [];
idx.push('# FABLE task bank — index of plan packets');
idx.push('');
idx.push(`${packets.length} packets (FB-001…${packets[packets.length - 1].id}) plus ${lines.length} inference lines in [INFERENCE_LINES.md](INFERENCE_LINES.md). This is a navigation index, not a dispatch queue. Routing: open = any strong agent; ORRERY lane = pure UI, the frontend lane's; graphics lane = Forge/assets; parked-expansion = only if the owner opens the expansion. Lane names the finish lane whose bar the packet serves (\`design/program/FINISH_LANES.md\` §2); routing says who may take it. THE RELEASE is parked (owner, 2026-09-27) and no packet is laned there: save robustness and the desktop shell sit under THE MACHINE, settings truth under THE INSTRUMENT, captions under THE EAR. A THE INSTRUMENT packet routed open is a minimal functional edit in the ui tree of the kind AGENTS.md §1 allows any session, never a redesign; the ORRERY lane reads the diff when it returns.`);
idx.push('');
idx.push('[First batches](FIRST_BATCHES.md) · [Overlap map](OVERLAP_MAP.md) · [Board rows](BOARD_ROWS.md) · [Found gaps](FOUND_GAPS.md) · [Self audit](SELF_AUDIT.md)');
idx.push('');
idx.push('**Reading a packet.** Every backticked file and symbol was opened in the tree on 2026-09-29 and is checked by `design/planbank/SpaceFace_Planbank_FABLE_2026-09-28/tools/audit.mjs`. A backticked name that starts with `+` (for example `+physicalClass`) is a NEW identifier the packet asks you to create; it does not exist yet. New files a packet creates carry the `fb-` prefix (`test/fb-<slug>.test.mjs`, `scripts/fb-*.mjs`). The **Neighbours** line names the landed packets in `SpaceFace_Planbank_300` (SF-*), `design/program/next-wave-2026-09-28` (NXB/NXI) and `design/finish-expansion-2026-09` (SFQ-B/SFQ-I) that a packet extends or composes after: read them first, then do visibly more, never the same work twice.');
idx.push('');
const digest = (s) => {
  const t = ref(s).replace(/\s+/g, ' ').trim();
  const first = t.split(/(?<=[.;])\s/)[0];
  return (first.length > 150 ? first.slice(0, 147) + '…' : first).replace(/\|/g, '/');
};
for (const d of domains) {
  const rows = packets.filter((p) => p.domain === d);
  idx.push(`## ${d} (${rows.length})`);
  idx.push('');
  idx.push('| Id | Title | Lane | Kind | Seam tags | Done digest | Routing |');
  idx.push('|---|---|---|---|---|---|---|');
  for (const p of rows) {
    idx.push(`| [${p.id}](${p.file}) | ${ref(p.title)} | ${p.lane} | ${p.kind} | ${p.seams.join(', ')} | ${digest(p.done)} | ${p.routing || 'open'} |`);
  }
  idx.push('');
}
fs.writeFileSync(path.join(OUT, 'INDEX.md'), idx.join('\n'), 'utf8');

// ---- OVERLAP_MAP.md -----------------------------------------------------------------------
const bySeam = new Map();
for (const p of packets) for (const s of p.seams) {
  if (!bySeam.has(s)) bySeam.set(s, []);
  bySeam.get(s).push(p);
}
const ov = [];
ov.push('# Overlap map — which FB packets serialize on a shared seam');
ov.push('');
ov.push('Domain folders separate understanding, not write-sets. Two packets that carry the same seam tag touch the same owner file and should not run in the same sitting unless one integrator holds both. Inspect `git status --short` and the exact paths before every batch; a live foreign hunk on an owner is a reason to take a different seam, never a reason to stop.');
ov.push('');
ov.push('| Shared seam | Packets | Integration rule |');
ov.push('|---|---|---|');
const rules = routing.seamRules || {};
for (const [s, ps] of [...bySeam.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))) {
  if (ps.length < 2) continue;
  ov.push(`| ${code(s)} | ${ps.map((p) => p.id).join(', ')} | ${rules[s] || 'One writer per sitting; later packets read the landed diff first and extend it, never re-derive it.'} |`);
}
ov.push('');
ov.push('## Single-packet seams');
ov.push('');
ov.push([...bySeam.entries()].filter(([, ps]) => ps.length === 1).map(([s, ps]) => `${code(s)} (${ps[0].id})`).join(' · '));
ov.push('');
ov.push('## Lines that share an owner with a packet');
ov.push('');
ov.push('| Owner file | Lines | Packets |');
ov.push('|---|---|---|');
const owners = new Map();
for (const l of lines) for (const p of l.paths) {
  const base = path.basename(p);
  if (!owners.has(base)) owners.set(base, { lines: [], packets: [] });
  owners.get(base).lines.push(l.id);
}
for (const p of packets) for (const w of p.writeSet) {
  const base = path.basename(w);
  if (owners.has(base)) owners.get(base).packets.push(p.id);
}
for (const [base, o] of [...owners.entries()].sort()) {
  if (!o.packets.length) continue;
  ov.push(`| ${code(base)} | ${[...new Set(o.lines)].join(', ')} | ${[...new Set(o.packets)].join(', ')} |`);
}
ov.push('');
ov.push('## Parallel pattern');
ov.push('');
ov.push('Pick one packet per seam family per sitting: one massline owner, one traffic/jobs owner, one economy owner, one renderer/VFX owner, one audio owner, one save owner. Lines are safe to run beside a packet when their paths do not appear in that packet\'s write-set (the table above).');
ov.push('');
fs.writeFileSync(path.join(OUT, 'OVERLAP_MAP.md'), ov.join('\n'), 'utf8');

// ---- BOARD_ROWS.md ------------------------------------------------------------------------
const br = [];
br.push('# Proposed rows for `build_map.md` §1C');
br.push('');
br.push(`Rows start at ${routing.BOARD_START} and follow section I (the board's highest row today is ${routing.BOARD_START - 1}); the dispatcher decides whether they join group G or open a new section. Packets that share a seam or a write-set sit on one row. Rows that contain an ORRERY-lane packet name it in the status so the frontend lane can take that packet alone. Format matches the live board.`);
br.push('');
br.push('| Row | Packets | What lands | Lane | Status |');
br.push('|---|---|---|---|---|');
let rowNo = routing.BOARD_START;
const rowed = new Map();
for (const r of routing.boardRows) {
  const ids = r.packets.map((s) => {
    if (!slugToId.has(s)) throw new Error(`board row references unknown slug ${s}`);
    if (rowed.has(s)) throw new Error(`packet ${s} appears on two board rows`);
    rowed.set(s, rowNo);
    return slugToId.get(s);
  });
  const orrery = r.packets.filter((s) => (packets.find((x) => x.slug === s).routing || 'open') === 'ORRERY lane').map((s) => slugToId.get(s));
  const status = orrery.length ? `${r.status} (ORRERY lane: ${orrery.join(', ')})` : r.status;
  br.push(`| ${rowNo} | ${ids.join('+')} | ${ref(r.what)} | PB | OPEN — ${status} |`);
  rowNo += 1;
}
for (const p of packets) if (!rowed.has(p.slug)) throw new Error(`packet ${p.slug} is on no board row`);
br.push('');
fs.writeFileSync(path.join(OUT, 'BOARD_ROWS.md'), br.join('\n'), 'utf8');

// ---- FIRST_BATCHES.md ---------------------------------------------------------------------
const fb = [];
fb.push('# First ten batches — recommended dispatch order');
fb.push('');
fb.push('Each batch is one integrator\'s sitting. Where packets in a batch share a seam (listed per batch below, derived from the seam tags), they land in the order given, by one integrator, never in parallel; packets that share no seam may run beside each other. Lines listed with a batch touch no owner file in that batch\'s write-sets. The order front-loads surface-before-invent work (dead seams, unwired data), then the pieces other batches read.');
fb.push('');
routing.batches.forEach((b, i) => {
  fb.push(`## Batch ${i + 1} — ${b.title}`);
  fb.push('');
  fb.push(ref(b.why));
  fb.push('');
  {
    const seamCount = new Map();
    for (const s of b.packets) for (const t of packets.find((x) => x.slug === s).seams) seamCount.set(t, (seamCount.get(t) || 0) + 1);
    const shared = [...seamCount.entries()].filter(([, n]) => n > 1).map(([t]) => code(t));
    fb.push(`Shared seams in this batch: ${shared.length ? shared.join(', ') + ' (serialize on these)' : 'none (packets may run in parallel)'}.`);
    fb.push('');
  }
  for (const s of b.packets) {
    if (!slugToId.has(s)) throw new Error(`batch references unknown slug ${s}`);
    const p = packets.find((x) => x.slug === s);
    fb.push(`- ${p.id} — ${ref(p.title)} (${p.lane}; seams ${p.seams.join(', ')})`);
  }
  if (b.lines && b.lines.length) {
    fb.push(`- Lines to run beside it: ${b.lines.map((q) => {
      const l = lines.find((x) => x.key === q);
      if (!l) throw new Error(`batch references unknown line key ${q}`);
      return l.id;
    }).join(', ')}`);
  }
  fb.push('');
});
fs.writeFileSync(path.join(OUT, 'FIRST_BATCHES.md'), fb.join('\n'), 'utf8');

// ---- coverage.json (brief §5 areas) --------------------------------------------------------
const AREAS = ['hands', 'fight', 'world', 'longgame', 'presentation', 'machine', 'professionalism', 'parity'];
const coverage = Object.fromEntries(AREAS.map((a) => [a, { packets: 0, lines: 0, ids: [] }]));
for (const p of packets) {
  if (!p.area || !AREAS.includes(p.area)) throw new Error(`${p.slug}: area must be one of ${AREAS.join('|')}`);
  coverage[p.area].packets += 1; coverage[p.area].ids.push(p.id);
}
for (const l of lines) {
  if (!l.area || !AREAS.includes(l.area)) throw new Error(`${l.id}: area must be one of ${AREAS.join('|')}`);
  coverage[l.area].lines += 1; coverage[l.area].ids.push(l.id);
}
fs.writeFileSync(path.join(HERE, 'coverage.json'), JSON.stringify(coverage, null, 2), 'utf8');

// ---- summary ------------------------------------------------------------------------------
const perDomain = domains.map((d) => `${d}=${packets.filter((p) => p.domain === d).length}`).join(' ');
const perGroup = groupOrder.map((g) => `${g}=${lines.filter((l) => l.group === g).length}`).join(' ');
console.log(`packets ${packets.length} [${perDomain}]`);
console.log(`lines ${lines.length} [${perGroup}]`);
console.log(`board rows ${routing.boardRows.length}; batches ${routing.batches.length}`);
