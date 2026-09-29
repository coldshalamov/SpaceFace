// Similarity of this bank's packet titles+gaps against the next-wave (NXB/NXI) and finish-expansion (SFQ) catalogs.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const STOP = new Set('a an the of to in on for and or is are that this with as at by from into its it be not no one every when than then so but their your you we our can has have does do what which who where how'.split(' '));
const tok = (s) => new Set(String(s).toLowerCase().replace(/[`*_|]/g,' ').split(/[^a-z0-9]+/).filter(w => w.length > 2 && !STOP.has(w)));
const jac = (a,b) => { let i=0; for (const x of a) if (b.has(x)) i++; const u=a.size+b.size-i; return u? i/u : 0; };
const ext = [];
for (const f of ['nextwave-titles.txt','sfq-titles.txt']) for (const line of fs.readFileSync(path.join(HERE,f),'utf8').split('\n')) {
  const [id, title, delta] = line.split(' | ');
  if (id) ext.push({ id: id.trim(), title: (title||'').trim(), text: `${title||''} ${delta||''}` });
}
const extT = ext.map(e => ({ ...e, t: tok(e.title), tt: tok(e.text) }));
const files = fs.readdirSync(path.join(HERE,'bank')).filter(n => n.startsWith('packets-'));
const threshold = Number(process.argv[2] || 0.22);
for (const f of files) {
  const mod = await import(pathToFileURL(path.join(HERE,'bank',f)).href);
  for (const p of mod.packets) {
    const t = tok(p.title), tt = tok(`${p.title} ${p.gap}`);
    const hits = extT.map(e => ({ id: e.id, title: e.title, s: Math.max(jac(t, e.t), 0.85*jac(tt, e.tt)) })).filter(h => h.s >= threshold).sort((a,b)=>b.s-a.s).slice(0,3);
    if (hits.length) console.log(`${p.slug}\n   ${hits.map(h => `${h.s.toFixed(2)} ${h.id} — ${h.title}`).join('\n   ')}`);
  }
}
