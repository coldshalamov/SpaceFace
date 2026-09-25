import fs from 'node:fs';
const [file, ...names] = process.argv.slice(2);
const p = JSON.parse(fs.readFileSync(file,'utf8'));
const byId = new Map(p.nodes.map(n=>[n.id,n])); const parent=new Map();
for (const n of p.nodes) for (const c of (n.children||[])) parent.set(c,n.id);
const dt = new Map(); p.samples.forEach((s,i)=>dt.set(s,(dt.get(s)||0)+(p.timeDeltas[i]||0)));
const total = p.timeDeltas.reduce((a,b)=>a+b,0);
const out={}; for (const nm of names) out[nm]=0;
for (const [id,t] of dt) { const seen=new Set(); let cur=id; while(cur!==undefined){ const fn=byId.get(cur).callFrame.functionName; for(const nm of names) if(fn===nm && !seen.has(nm)){out[nm]+=t;seen.add(nm);} cur=parent.get(cur);} }
console.log(file.split('/').slice(-2,-1)[0], 'window', (total/1e6).toFixed(1)+'s', Object.entries(out).map(([k,v])=>`${k}=${(v/1000).toFixed(1)}ms (${(v/total*1e3).toFixed(2)}ms/s)`).join('  '));
