// Mechanical consensus tally per design/program/special-500/DEBATE_PROTOCOL.md
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const ID_RE = /^###\s+(SP[123]-\d{3}|SPX-[ABC]-\d{2})\s+—\s+(.+)$/;
function parseProposals(text) {
  const out = new Map();
  let cur = null;
  for (const raw of text.split(/\r?\n/)) {
    const m = raw.match(ID_RE);
    if (m) {
      if (cur) out.set(cur.id, cur);
      cur = { id: m[1], title: m[2].trim(), fields: {}, hones: [], mergedFrom: [] };
      continue;
    }
    if (!cur) continue;
    const f = raw.match(/^-\s+([A-Za-z][A-Za-z'/ ]*?):\s+(.*)$/);
    if (f) {
      const key = f[1].trim();
      if (!(key in cur.fields)) cur.fields[key] = f[2].trim();
    }
  }
  if (cur) out.set(cur.id, cur);
  return out;
}

const proposals = new Map();
for (const f of ['round1/sa1-encounters.md', 'round1/sa2-world.md', 'round1/sa3-spectacle.md']) {
  for (const [id, e] of parseProposals(read(f))) proposals.set(id, e);
}
for (const f of ['round2/debater-a-verdict.md', 'round2/debater-b-verdict.md', 'round2/debater-c-verdict.md']) {
  for (const [id, e] of parseProposals(read(f))) {
    if (!proposals.has(id)) proposals.set(id, e);
  }
}

function section(text, name) {
  const lines = text.split(/\r?\n/);
  const want = '## ' + name;
  const start = lines.findIndex((l) => l.trim() === want);
  if (start === -1) return '';
  const out = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^## /.test(lines[i])) break;
    out.push(lines[i]);
  }
  return out.join('\n');
}
const DEBATERS = ['a', 'b', 'c'];
const ballots = {}, my500 = {};
for (const d of DEBATERS) {
  const text = read(`round3/debater-${d}-final.md`);
  const bal = [];
  for (const raw of section(text, 'FINAL-BALLOT').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('```')) continue;
    const parts = line.split('|');
    if (parts.length < 2) continue;
    const id = parts[0].trim();
    if (!/^(SP[123]-\d{3}|SPX-[ABC]-\d{2})$/.test(id)) continue;
    bal.push({ id, vote: parts[1].trim().toUpperCase(), reason: parts.slice(2).join('|').trim() });
  }
  ballots[d] = bal;
  my500[d] = [...section(text, 'MY-500').matchAll(/SP[123]-\d{3}|SPX-[ABC]-\d{2}/g)].map((m) => m[0]);
  console.error(`debater ${d}: ballot lines ${bal.length}, my500 ${my500[d].length}`);
}


// ---------- tally ----------
const keeps = new Map(), kills = new Map(), mergeMap = new Map();
const honesBy = new Map();
for (const d of DEBATERS) for (const { id, vote, reason } of ballots[d]) {
  if (vote === 'KEEP') keeps.set(id, (keeps.get(id) || 0) + 1);
  else if (vote === 'HONE') {
    keeps.set(id, (keeps.get(id) || 0) + 1);
    if (!honesBy.has(id)) honesBy.set(id, {});
    honesBy.get(id)[d] = reason;
  } else if (vote.startsWith('MERGE')) {
    const t = vote.replace('MERGE->', '').replace('MERGE', '').trim();
    if (!proposals.has(t)) { console.error(`WARN merge target missing: ${id} -> ${t}`); continue; }
    if (!mergeMap.has(id)) mergeMap.set(id, []);
    mergeMap.get(id).push({ d, t, reason });
  } else if (vote === 'KILL') kills.set(id, (kills.get(id) || 0) + 1);
}
for (const id of proposals.keys()) {
  if (/^SPX-/.test(id)) keeps.set(id, (keeps.get(id) || 0) + 1); // proposer auto-KEEP
}
// protocol keeps formula: KEEP + HONE votes + MERGE votes received (one hop)
const mergeReceived = new Map();
for (const [, votes] of mergeMap) for (const v of votes) mergeReceived.set(v.t, (mergeReceived.get(v.t) || 0) + 1);
const keepsOf = (id) => (keeps.get(id) || 0) + (mergeReceived.get(id) || 0);
const directKeeps = (id) => keeps.get(id) || 0;

function majorityTarget(id) {
  const counts = new Map();
  for (const { t } of mergeMap.get(id)) counts.set(t, (counts.get(t) || 0) + 1);
  let best = null, bestN = -1;
  for (const [t, n] of counts) if (n > bestN) { best = t; bestN = n; }
  return best;
}
const linkOf = new Map();
for (const src of mergeMap.keys()) linkOf.set(src, majorityTarget(src));

// walk a merge-source chain to its fate; cycles resolve to their strongest member
function walk(id) {
  const seen = [], seenSet = new Set();
  let cur = id;
  while (linkOf.has(cur) && !seenSet.has(cur)) { seenSet.add(cur); seen.push(cur); cur = linkOf.get(cur); }
  if (seenSet.has(cur)) {
    const cyc = seen.slice(seen.indexOf(cur));
    const score = (m) => keepsOf(m) - (kills.get(m) || 0);
    let rep = cyc[0];
    for (const m of cyc) if (score(m) > score(rep) || (score(m) === score(rep) && m < rep)) rep = m;
    const cycKeeps = cyc.reduce((s, m) => s + keepsOf(m), 0);
    const cycKills = cyc.reduce((s, m) => s + (kills.get(m) || 0), 0);
    const alive = cycKeeps >= 2 && cycKeeps > cycKills;
    return { fate: alive ? 'alive' : 'dead', target: alive ? rep : '' };
  }
  const curAlive = keepsOf(cur) >= 2 && keepsOf(cur) > (kills.get(cur) || 0);
  return curAlive ? { fate: 'alive', target: cur } : { fate: 'dead', target: '' };
}

const standaloneSurvivor = (id) => directKeeps(id) >= 2 && directKeeps(id) > (kills.get(id) || 0);
const foldInto = new Map(), dropped = [];
for (const src of mergeMap.keys()) {
  if (standaloneSurvivor(src)) continue; // strong enough to stand on its own direct votes
  const r = walk(src);
  if (r.fate === 'alive' && r.target && r.target !== src) foldInto.set(src, r.target);
  else dropped.push(src);
}

const survivors = [];
for (const id of proposals.keys()) {
  if (foldInto.has(id) || dropped.includes(id)) continue;
  const k = keepsOf(id), x = kills.get(id) || 0;
  const rankSum = DEBATERS.reduce((s, d) => {
    const i = my500[d].indexOf(id);
    return s + (i === -1 ? 550 : i + 1);
  }, 0);
  if (k >= 2 && k > x) survivors.push({ id, keeps: k, kills: x, rankSum });
}
survivors.sort((p, q) => (q.keeps - p.keeps) || (p.rankSum - q.rankSum));

// fold source content into surviving targets
for (const [src, dst] of foldInto) {
  const t = proposals.get(dst), s = proposals.get(src);
  if (!t || !s) continue;
  const srcMergeReasons = mergeMap.has(src) ? mergeMap.get(src).map((v) => `${v.d}:${v.reason}`).join(' | ') : '';
  t.mergedFrom.push({ id: src, title: s.title, why: srcMergeReasons });
  for (const [d, dir] of Object.entries(honesBy.get(src) || {})) t.hones.push(`(${src} via ${d}) ${dir}`);
}
for (const [id, hs] of honesBy) {
  const p = proposals.get(id);
  if (p) for (const [d, dir] of Object.entries(hs)) if (!p.hones.some((h) => h.endsWith(dir))) p.hones.push(`(${d}) ${dir}`);
}
if (dropped.length) console.error('WARN merge chain dead, content not folded for:', dropped.join(', '));

// ---------- constraint fill: 520 under caps ----------
const KIND_OF = (id) => (proposals.get(id).fields.Kind || '').trim().toLowerCase();
const EFF_OF = (id) => (proposals.get(id).fields.Effort || '').trim().toLowerCase();
const KINDS = ['encounter', 'oneoff-mission', 'easter-egg', 'anomaly', 'comms-event', 'visual-setpiece', 'world-oneoff'];
const chosen = [], skipped = [];
const kindCount = Object.fromEntries(KINDS.map((k) => [k, 0]));
let bespoke = 0;
const CAP_KIND = 120, CAP_BESPOKE = 160, TARGET = 520;
for (const s of survivors) {
  if (foldInto.has(s.id)) continue;
  if (chosen.length >= TARGET) break;
  const k = KIND_OF(s.id), e = EFF_OF(s.id);
  if (!KINDS.includes(k)) { skipped.push(s.id); continue; }
  if (kindCount[k] >= CAP_KIND) { skipped.push(s.id); continue; }
  if (e === 'bespoke' && bespoke >= CAP_BESPOKE) { skipped.push(s.id); continue; }
  chosen.push(s.id); kindCount[k]++; if (e === 'bespoke') bespoke++;
}
for (const k of KINDS) {
  while (kindCount[k] < 25) {
    const cand = skipped.find((id) => KIND_OF(id) === k);
    if (!cand) break;
    for (let i = chosen.length - 1; i >= 0; i--) {
      const dk = KIND_OF(chosen[i]);
      if (dk !== k && kindCount[dk] > 25) { kindCount[dk]--; chosen.splice(i, 1); break; }
    }
    chosen.push(cand); kindCount[k]++;
    skipped.splice(skipped.indexOf(cand), 1);
  }
}
const cheapCount = () => chosen.filter((id) => EFF_OF(id) !== 'bespoke').length;
while (cheapCount() < Math.ceil(0.45 * TARGET)) {
  const cand = skipped.find((id) => EFF_OF(id) !== 'bespoke');
  if (!cand) break;
  for (let i = chosen.length - 1; i >= 0; i--) {
    const dk = KIND_OF(chosen[i]);
    if (EFF_OF(chosen[i]) === 'bespoke' && kindCount[dk] > 25) { bespoke--; kindCount[dk]--; chosen.splice(i, 1); break; }
  }
  chosen.push(cand);
  if (EFF_OF(cand) === 'bespoke') bespoke++;
  skipped.splice(skipped.indexOf(cand), 1);
}
const seenTitles = new Set(), deduped = [];
for (const id of chosen) {
  const key = proposals.get(id).title.toLowerCase().replace(/[^a-z0-9]+/g, '');
  if (seenTitles.has(key)) continue;
  seenTitles.add(key); deduped.push(id);
}
const build = deduped.slice(0, 500), bench = deduped.slice(500, 520);

// ---------- emit ----------
const kindDist = Object.fromEntries(KINDS.map((k) => [k, build.filter((id) => KIND_OF(id) === k).length]));
const effDist = { data: 0, 'data+glue': 0, bespoke: 0 };
for (const id of build) effDist[EFF_OF(id)] = (effDist[EFF_OF(id)] || 0) + 1;
const sectors = new Set(build.map((id) => (proposals.get(id).fields.Where || '').split(',')[0].trim()).filter((w) => w.startsWith('sector_')));

const json = {
  counts: { build: build.length, bench: bench.length, survivors: survivors.length, pool: proposals.size },
  kindDistribution: kindDist, effortDistribution: effDist,
  sectorsRepresented: [...sectors].sort(),
  build: build.map((id, i) => {
    const p = proposals.get(id);
    return {
      rank: i + 1, id, title: p.title, kind: p.fields.Kind, where: p.fields.Where,
      trigger: p.fields.Trigger,
      sees: p.fields['The player sees'] || p.fields['The player sees/hears'] || p.fields['The player hears'] || '',
      payoff: p.fields.Payoff, seam: p.fields['Build seam'], effort: p.fields.Effort,
      keeps: keepsOf(id), kills: kills.get(id) || 0,
      hones: p.hones, mergedFrom: p.mergedFrom,
    };
  }),
  bench: bench.map((id, i) => {
    const p = proposals.get(id);
    return { rank: 501 + i, id, title: p.title, kind: p.fields.Kind, effort: p.fields.Effort };
  }),
};
fs.writeFileSync(path.join(ROOT, 'CONSENSUS_500.json'), JSON.stringify(json, null, 1));

const md = [];
md.push(`<!-- GENERATED by tools/tally.mjs per DEBATE_PROTOCOL.md - do not hand-edit ranks -->`);
md.push(`# special-500 CONSENSUS - ${build.length} build entries + ${bench.length} bench`);
md.push('');
md.push(`Pool ${proposals.size} proposals; survivors ${survivors.length}; ranked by keeps desc then sum-of-MY-500-ranks asc; constraints: kind 25-120 each, bespoke <= ${CAP_BESPOKE}, data/data+glue >= 45%, >=10 sectors.`);
md.push('');
md.push(`Kind distribution: ${JSON.stringify(kindDist)} . Effort: ${JSON.stringify(effDist)} . Sectors: ${sectors.size}`);
md.push('');
for (const e of json.build) {
  md.push(`### ${e.rank}. ${e.id} - ${e.title}`);
  md.push(`- Kind: ${e.kind}`);
  md.push(`- Where: ${e.where}`);
  md.push(`- Trigger: ${e.trigger}`);
  md.push(`- The player sees: ${e.sees}`);
  md.push(`- Payoff: ${e.payoff}`);
  md.push(`- Build seam: ${e.seam}`);
  md.push(`- Effort: ${e.effort}`);
  md.push(`- Votes: ${e.keeps} keep / ${e.kills} kill`);
  for (const h of e.hones) md.push(`- HONE: ${h}`);
  for (const m of e.mergedFrom) md.push(`- MERGED FROM: ${m.id} (${m.title}) - ${m.why}`);
  md.push('');
}
md.push(`## Bench (swap-in order)`);
for (const b of json.bench) md.push(`- ${b.rank}. ${b.id} - ${b.title} (${b.kind}, ${b.effort})`);
fs.writeFileSync(path.join(ROOT, 'CONSENSUS_500.md'), md.join('\n'));

console.log('pool', proposals.size, '| survivors', survivors.length, '| build', build.length, '| bench', bench.length);
console.log('kinds', JSON.stringify(kindDist));
console.log('effort', JSON.stringify(effDist));
console.log('sectors', sectors.size);
console.log('top30:', build.slice(0, 30).join(', '));
console.log('tail:', build.slice(-8).join(', '));
console.log('bench:', bench.join(', '));
