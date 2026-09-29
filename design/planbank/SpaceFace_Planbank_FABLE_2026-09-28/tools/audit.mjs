// Self-audit for the FABLE task bank (brief §7). Reads the GENERATED markdown, not the data source,
// so it audits the deliverable an executing agent will actually open.
// Usage: node design/planbank/SpaceFace_Planbank_FABLE_2026-09-28/tools/audit.mjs
//   1. every repo path referenced in INFERENCE_LINES.md, plans/**, INDEX.md, BOARD_ROWS.md exists
//      (new files the task creates are allowed only under the fb-/FB- prefix rule)
//   2. FB ids unique + sequential; inference ids continue the live catalog with no collision
//   3. near-duplicate titles / done-checks inside the bank, and titles against the SF-001…300 bank
//   4. every backticked symbol / event name is present somewhere in src/, test/, tests/, scripts/, electron/
//   5. §5 coverage: each area has ≥3 tasks and ≥1 packet (from tools/coverage.json written by generate.mjs)
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const BANK = path.resolve(HERE, '..');
const ROOT = path.resolve(BANK, '..', '..', '..');
const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/');

const problems = [];
const warn = (kind, msg) => problems.push(`[${kind}] ${msg}`);

const read = (p) => fs.readFileSync(p, 'utf8');
const exists = (p) => fs.existsSync(path.join(ROOT, p));
const NEW_FILE_OK = (p) => /(^|\/)(fb-|FB-)[A-Za-z0-9._-]*\.(mjs|js|md|json)$/.test(p);
const PATH_RE = /`([A-Za-z0-9_./-]+\/[A-Za-z0-9_.-]+\.(?:m?js|cjs|json|md|css|html|txt|glsl|py))`/g;
const LOOSE_PATH_RE = /`((?:src|test|tests|scripts|design|docs|electron|styles|tools|assets)\/[A-Za-z0-9_./-]+)`/g;

// ---------- 1. paths ---------------------------------------------------------------------
function checkPaths(file, text) {
  const seen = new Set();
  for (const re of [PATH_RE, LOOSE_PATH_RE]) {
    for (const m of text.matchAll(re)) {
      const p = m[1];
      if (seen.has(p)) continue;
      seen.add(p);
      if (exists(p)) continue;
      if (NEW_FILE_OK(p)) continue;
      warn('path', `${file}: ${p} does not exist (and is not an fb-/FB- new file)`);
    }
  }
}

// ---------- symbol index -----------------------------------------------------------------
const CODE_DIRS = ['src', 'test', 'tests', 'scripts', 'electron', 'styles', 'design/program', 'docs'];
const tokenSet = new Set();
const quotedEvents = new Set();
function indexDir(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (/node_modules|\.git$|vendor|catalogs$/.test(p)) continue;
      indexDir(p);
    } else if (/\.(m?js|cjs|json|css|html|md)$/.test(ent.name)) {
      const t = fs.readFileSync(p, 'utf8');
      for (const m of t.matchAll(/[A-Za-z_$][A-Za-z0-9_$]{3,}/g)) tokenSet.add(m[0]);
      for (const m of t.matchAll(/['"`]([a-zA-Z0-9_-]+:[a-zA-Z0-9_:.-]+)['"`]/g)) quotedEvents.add(m[1]);
    }
  }
}
for (const d of CODE_DIRS) if (fs.existsSync(path.join(ROOT, d))) indexDir(path.join(ROOT, d));

const SYMBOL_SKIP = new Set(['seed', 'OPEN', 'CHECK', 'build', 'wire', 'polish', 'deepening', 'null', 'true', 'false', 'npm', 'node']);
function checkSymbols(file, text) {
  for (const m of text.matchAll(/`([^`\n]+)`/g)) {
    const tok = m[1].trim();
    if (tok.startsWith('+')) continue; // bank convention: `+name` is a NEW identifier the task creates
    if (tok.includes('/') && /\.[a-z]+$/.test(tok)) continue; // a path, handled above
    if (/^(FB|SF|PIC|VERB|WORLD|INST|TOOL|[A-Z]{2,6})-\d+/.test(tok)) continue;
    if (/^\d/.test(tok) || /\s/.test(tok) && tok.split(/\s+/).length > 3) continue; // prose / commands
    if (/^[a-zA-Z0-9_-]+:[a-zA-Z0-9_:.-]+$/.test(tok)) {
      if (!quotedEvents.has(tok)) warn('event', `${file}: event \`${tok}\` is quoted nowhere in the tree`);
      continue;
    }
    // identifiers, dotted paths, calls: every identifier piece ≥4 chars must exist in the tree
    for (const piece of tok.split(/[^A-Za-z0-9_$]+/)) {
      if (piece.length < 4 || SYMBOL_SKIP.has(piece)) continue;
      if (/^\d+$/.test(piece)) continue;
      if (!tokenSet.has(piece)) warn('symbol', `${file}: \`${tok}\` — piece "${piece}" not found in the tree`);
    }
  }
}

// ---------- 2. ids -----------------------------------------------------------------------
const liveIdeas = read(path.join(ROOT, 'design/program/INFERENCE_IDEAS.md'));
const liveIds = new Set([...liveIdeas.matchAll(/^\| ([A-Z]{2,6}-\d+) \|/gm)].map((m) => m[1]));
const liveMax = {};
for (const id of liveIds) {
  const [g, n] = id.split('-');
  liveMax[g] = Math.max(liveMax[g] || 0, Number(n));
}

const linesText = read(path.join(BANK, 'INFERENCE_LINES.md'));
checkPaths('INFERENCE_LINES.md', linesText);
checkSymbols('INFERENCE_LINES.md', linesText);
const lineRows = [];
let currentGroup = null;
for (const raw of linesText.split(/\r?\n/)) {
  const h = raw.match(/^## (.+)$/);
  if (h) { currentGroup = h[1].trim(); continue; }
  const m = raw.match(/^\| ([A-Z]{2,6}-\d+) \| (.+?) \| (.+?) \| (.+?) \| (.+?) \| (OPEN) \|$/);
  if (!m) { if (/^\| [A-Z]{2,6}-\d+ \|/.test(raw)) warn('format', `line row malformed: ${raw.slice(0, 80)}`); continue; }
  lineRows.push({ id: m[1], group: currentGroup, change: m[2], paths: [...m[3].matchAll(/`([^`]+)`/g)].map((x) => x[1]), done: m[4], doNot: m[5] });
}
const lineIds = new Set();
const groupCounts = {};
for (const r of lineRows) {
  if (lineIds.has(r.id)) warn('id', `duplicate line id ${r.id}`);
  lineIds.add(r.id);
  groupCounts[r.group] = (r.group in groupCounts) ? groupCounts[r.group] + 1 : 1;
  if (r.paths.length < 1 || r.paths.length > 3) warn('format', `${r.id}: ${r.paths.length} paths (need 1–3)`);
  for (const p of r.paths) if (!exists(p)) warn('path', `${r.id}: path ${p} does not exist`);
  if (!/4242|\btest\b|\.test\.mjs|seed \d+/.test(r.done)) warn('done', `${r.id}: done is not pinned to a seed or a focused test`);
}
// Post-landing the bank's own rows are part of the live catalog; only FOREIGN ids collide or set
// the continuation floor. Pre-landing, none of the bank's ids exist live and the sets are equal.
const foreignLiveIds = new Set([...liveIds].filter((id) => !lineIds.has(id)));
const foreignMax = {};
for (const id of foreignLiveIds) {
  const [g, n] = id.split('-');
  foreignMax[g] = Math.max(foreignMax[g] || 0, Number(n));
}
for (const r of lineRows) {
  if (foreignLiveIds.has(r.id)) warn('id', `${r.id} collides with the live catalog`);
  const [g, n] = r.id.split('-');
  if (g === 'TOOL') warn('id', `${r.id}: TOOL group is closed`);
  if (foreignMax[g] && Number(n) <= foreignMax[g]) warn('id', `${r.id} does not continue the live numbering (max ${foreignMax[g]})`);
}
for (const [g, c] of Object.entries(groupCounts)) if (c < 5) warn('group', `group ${g} has ${c} lines (<5)`);

// ---------- packets ----------------------------------------------------------------------
const plansDir = path.join(BANK, 'plans');
const packetFiles = [];
for (const d of fs.readdirSync(plansDir)) for (const f of fs.readdirSync(path.join(plansDir, d))) packetFiles.push({ domain: d, file: f, full: path.join(plansDir, d, f) });
packetFiles.sort((a, b) => a.file.localeCompare(b.file));
const packets = [];
const REQUIRED = ['**Kind:**', '**Seam tags:**', '**Write-set:**', '## The gap', '## Why this direction', '## Done when', '## Do not', '## Focus test starting points'];
for (const pf of packetFiles) {
  const text = read(pf.full);
  const relFile = `plans/${pf.domain}/${pf.file}`;
  const idm = pf.file.match(/^(FB-\d{3})-([a-z0-9-]+)\.md$/);
  if (!idm) { warn('format', `${relFile}: filename is not FB-NNN-<slug>.md`); continue; }
  const id = idm[1];
  const title = (text.match(/^# (FB-\d{3}) — (.+)$/m) || [])[2] || '';
  if (!title) warn('format', `${relFile}: missing H1`);
  for (const r of REQUIRED) if (!text.includes(r)) warn('format', `${relFile}: missing ${r}`);
  const isCheck = /\*\*Kind:\*\* CHECK/i.test(text);
  if (isCheck ? !text.includes('## Reproduction gate') : !text.includes('## Mechanism')) warn('format', `${relFile}: ${isCheck ? 'CHECK packet needs a Reproduction gate' : 'missing ## Mechanism'}`);
  const routing = (text.match(/\*\*Routing:\*\* ([^\n]+)/) || [])[1] || '';
  if (!['open', 'ORRERY lane', 'graphics lane', 'parked-expansion'].includes(routing.trim())) warn('format', `${relFile}: routing "${routing}" not in the allowed set`);
  // lanes: the eight live finish lanes (FINISH_LANES.md §2); THE RELEASE is parked (§12) and may not carry open work
  const lane = (text.match(/\*\*Lane:\*\* ([^·\n]+)/) || [])[1] || '';
  const LIVE_LANES = ['THE MACHINE', 'THE HAND', 'THE FIGHT', 'THE WORLD', 'THE LONG GAME', 'THE PICTURE', 'THE INSTRUMENT', 'THE EAR'];
  if (!LIVE_LANES.includes(lane.trim())) warn('format', `${relFile}: lane "${lane.trim()}" is not a live finish lane (THE RELEASE is parked)`);
  if (lane.trim() === 'THE INSTRUMENT' && routing.trim() === 'open' && !/ORRERY/.test(text)) warn('format', `${relFile}: THE INSTRUMENT packet routed open must say what it leaves to ORRERY`);
  const done = (text.match(/## Done when\n([\s\S]*?)\n## /) || [])[1] || '';
  if (!/4242|test\/|seed \d+|focused test/.test(done)) warn('done', `${relFile}: Done when is not pinned to a seed or a test`);
  const lines = text.split(/\r?\n/).length;
  if (lines < 28 || lines > 90) warn('size', `${relFile}: ${lines} lines (target ~30–50 wrapped)`);
  if (/design\/program\/vm-drop\//.test(text)) warn('path', `${relFile}: names the remote-authoritative vm-drop tree`);
  checkPaths(relFile, text);
  checkSymbols(relFile, text);
  packets.push({ id, domain: pf.domain, title, done, file: relFile });
}
packets.sort((a, b) => a.id.localeCompare(b.id));
packets.forEach((p, i) => {
  const want = `FB-${String(i + 1).padStart(3, '0')}`;
  if (p.id !== want) warn('id', `${p.file}: expected ${want} in sequence`);
});
const seenIds = new Set();
for (const p of packets) { if (seenIds.has(p.id)) warn('id', `duplicate packet id ${p.id}`); seenIds.add(p.id); }

// ---------- 3. near-duplicates -----------------------------------------------------------
const STOP = new Set('a an the of to in on for and or is are that this with as at by from into its it be not no one every when than then so but their your you we our'.split(' '));
const tokens = (s) => new Set(String(s).toLowerCase().replace(/[`*_|]/g, ' ').split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w)));
const jaccard = (a, b) => { let inter = 0; for (const x of a) if (b.has(x)) inter++; const u = a.size + b.size - inter; return u ? inter / u : 0; };
function nearDup(label, items, key, threshold) {
  const toks = items.map((it) => tokens(it[key]));
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const s = jaccard(toks[i], toks[j]);
    if (s >= threshold) warn('near-dup', `${label}: ${items[i].id} ~ ${items[j].id} (${s.toFixed(2)}) — "${String(items[i][key]).slice(0, 60)}" vs "${String(items[j][key]).slice(0, 60)}"`);
  }
}
nearDup('packet titles', packets, 'title', 0.6);
nearDup('packet done', packets, 'done', 0.6);
nearDup('line change', lineRows, 'change', 0.6);
nearDup('line done', lineRows, 'done', 0.6);
const sfTitles = [...read(path.join(ROOT, 'design/planbank/SpaceFace_Planbank_300/INDEX.md')).matchAll(/(SF-\d{3}) — ([^\]]+)\]/g)].map((m) => ({ id: m[1], title: m[2] }));
{
  const sfT = sfTitles.map((s) => tokens(s.title));
  for (const p of packets) {
    const t = tokens(p.title);
    sfTitles.forEach((s, i) => { const j = jaccard(t, sfT[i]); if (j >= 0.6) warn('near-dup', `${p.id} title ~ ${s.id} (${j.toFixed(2)}): "${p.title}" vs "${s.title}"`); });
  }
  for (const l of lineRows) {
    const t = tokens(l.change);
    sfTitles.forEach((s, i) => { const j = jaccard(t, sfT[i]); if (j >= 0.6) warn('near-dup', `${l.id} ~ ${s.id} (${j.toFixed(2)})`); });
  }
}

// ---------- INDEX / BOARD_ROWS ----------------------------------------------------------
const indexText = read(path.join(BANK, 'INDEX.md'));
checkPaths('INDEX.md', indexText);
const indexIds = new Set([...indexText.matchAll(/^\| \[(FB-\d{3})\]/gm)].map((m) => m[1]));
for (const p of packets) if (!indexIds.has(p.id)) warn('index', `${p.id} missing from INDEX.md`);
if (indexIds.size !== packets.length) warn('index', `INDEX.md has ${indexIds.size} rows for ${packets.length} packets`);

const boardText = read(path.join(BANK, 'BOARD_ROWS.md'));
checkPaths('BOARD_ROWS.md', boardText);
const liveBoard = read(path.join(ROOT, 'build_map.md'));
const liveMaxRow = Math.max(...[...liveBoard.matchAll(/^\| (\d{3}) \|/gm)].map((m) => Number(m[1])));
const liveRowNums = new Set([...liveBoard.matchAll(/^\| (\d{3}) \|/gm)].map((m) => Number(m[1])));
const boardRowMatches = [...boardText.matchAll(/^\| (\d+) \| ([^|]+) \| ([^|]+) \| PB \| (OPEN[^|]*) \|$/gm)];
// Pre-landing the proposal must start at liveMaxRow+1; post-landing its rows are already on the
// live board and must be internally consecutive from their own first number.
const firstProposalRow = boardRowMatches.length ? Number(boardRowMatches[0][1]) : 0;
let expectRow = liveRowNums.has(firstProposalRow) ? firstProposalRow : liveMaxRow + 1;
for (const m of boardRowMatches) {
  if (Number(m[1]) !== expectRow) warn('board', `row ${m[1]}: expected ${expectRow} (live board max is ${liveMaxRow})`);
  expectRow += 1;
  for (const id of m[2].split('+').map((s) => s.trim())) if (!seenIds.has(id)) warn('board', `row ${m[1]} references unknown ${id}`);
}
if (!boardRowMatches.length) warn('board', 'no board rows parsed');

// ---------- near-duplicates against the two landed banks (NXB/NXI, SFQ) ---------------------
{
  const ext = [];
  for (const f of ['nextwave-titles.txt', 'sfq-titles.txt']) {
    const p = path.join(HERE, f);
    if (!fs.existsSync(p)) { warn('near-dup', `${f} missing (regenerate from the landed catalogs)`); continue; }
    for (const line of read(p).split('\n')) { const [id, title] = line.split(' | '); if (id && title) ext.push({ id: id.trim(), title: title.trim(), t: tokens(title) }); }
  }
  // open defect-ledger rows (DEMO_READINESS §6) and every live §1C board row's "what lands" column
  const ledger = read(path.join(ROOT, 'design/program/DEMO_READINESS_2026-09-20.md'));
  for (const m of ledger.matchAll(/^\| (D\d+) \| ([^|]+)\|/gm)) ext.push({ id: m[1], title: m[2].trim(), t: tokens(m[2]) });
  for (const m of liveBoard.matchAll(/^\| (\d{3}) \| ([^|]+) \| ([^|]+) \| ([^|]+) \|/gm)) {
    // group G/H/I/J rows carry the description in the third or fourth cell depending on section
    const idCell = m[2].trim();
    const cell = /^\[?(NXB|NXI|SFQ|SF|FB)-/.test(idCell) ? m[3] : m[2];
    ext.push({ id: `row ${m[1]}`, title: cell.trim(), t: tokens(cell), ids: idCell });
  }
  for (const p of packets) { const t = tokens(p.title); for (const e of ext) { if (e.ids && e.ids.includes(p.id)) continue; const j = jaccard(t, e.t); if (j >= 0.6) warn('near-dup', `${p.id} title ~ ${e.id} (${j.toFixed(2)}): "${p.title}" vs "${e.title}"`); } }
  for (const l of lineRows) { const t = tokens(l.change); for (const e of ext) { if (e.ids && e.ids.includes(l.id)) continue; const j = jaccard(t, e.t); if (j >= 0.6) warn('near-dup', `${l.id} ~ ${e.id} (${j.toFixed(2)}): "${l.change}" vs "${e.title}"`); } }
}

// ---------- 5. coverage ------------------------------------------------------------------
const AREAS = ['hands', 'fight', 'world', 'longgame', 'presentation', 'machine', 'professionalism', 'parity'];
const covPath = path.join(HERE, 'coverage.json');
const coverage = fs.existsSync(covPath) ? JSON.parse(read(covPath)) : null;
if (!coverage) warn('coverage', 'tools/coverage.json missing (run generate.mjs)');
else for (const a of AREAS) {
  const c = coverage[a] || { packets: 0, lines: 0 };
  if (c.packets + c.lines < 3) warn('coverage', `area ${a}: ${c.packets + c.lines} tasks (<3)`);
  if (c.packets < 1) warn('coverage', `area ${a}: no packet-scale task`);
}

// ---------- report -----------------------------------------------------------------------
const perDomain = {};
for (const p of packets) perDomain[p.domain] = (perDomain[p.domain] || 0) + 1;
console.log(`packets: ${packets.length}  lines: ${lineRows.length}`);
console.log('packets per domain: ' + Object.entries(perDomain).map(([d, c]) => `${d}=${c}`).join(' '));
console.log('lines per group: ' + Object.entries(groupCounts).map(([g, c]) => `${g}=${c}`).join(' '));
if (coverage) console.log('coverage: ' + AREAS.map((a) => `${a}=${(coverage[a] || {}).packets || 0}p/${(coverage[a] || {}).lines || 0}l`).join(' '));
console.log(`symbol index: ${tokenSet.size} identifiers, ${quotedEvents.size} quoted events`);
if (problems.length) {
  console.log(`\nFLAGS (${problems.length}):`);
  for (const p of problems) console.log('- ' + p);
  process.exitCode = 1;
} else {
  console.log('\nPASS — no flags');
}
