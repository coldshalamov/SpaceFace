import fs from 'fs';
const [f, re, gapMs='2'] = process.argv.slice(2);
const p = JSON.parse(fs.readFileSync(f));
const byId = new Map(); for (const n of p.nodes) byId.set(n.id, n);
const parent = new Map(); for (const n of p.nodes) for (const c of (n.children||[])) parent.set(c, n.id);
const key = n => `${n.callFrame.functionName||'(anon)'} ${n.callFrame.url.split('/').slice(-1)[0]}:${n.callFrame.lineNumber+1}`;
const R = new RegExp(re); let t=p.startTime; const bursts=[]; let cur=null;
for (let i=0;i<p.samples.length;i++){ t+=p.timeDeltas[i]; const dt=(p.timeDeltas[i+1]||p.timeDeltas[i])/1000;
  let id=p.samples[i], hit=false; while(id!=null){ if(R.test(key(byId.get(id)))){hit=true;break;} id=parent.get(id);} 
  if(hit){ if(cur && (t-cur.end)/1000 <= +gapMs){cur.ms+=dt; cur.end=t;} else { cur={start:t,end:t,ms:dt}; bursts.push(cur);} } }
console.log('bursts', bursts.length, 'total', bursts.reduce((a,b)=>a+b.ms,0).toFixed(1));
for (const b of bursts) if (b.ms>=2) console.log(((b.start-p.startTime)/1e6).toFixed(2)+'s', b.ms.toFixed(1)+'ms', 'span', ((b.end-b.start)/1000).toFixed(1));
