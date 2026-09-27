const fs=require('fs');
const f=process.argv[2];const b=fs.readFileSync(f);const l=b.readUInt32LE(12);const j=JSON.parse(b.slice(20,20+l));
const sc=j.scenes[j.scene||0];
console.log('scene extras', JSON.stringify(sc.extras||null).slice(0,1500));
console.log('asset extras', JSON.stringify((j.asset||{}).extras||null).slice(0,600));
const walk=(i,d)=>{const n=j.nodes[i];console.log(' '.repeat(d*2)+n.name+(n.mesh!=null?' [mesh '+j.meshes[n.mesh].primitives.map(p=>j.materials[p.material]?.name).join(',')+']':'')+(n.extras?' '+JSON.stringify(n.extras).slice(0,160):'')+(n.translation?' t='+n.translation.map(v=>v.toFixed(2)):'')); (n.children||[]).forEach(c=>walk(c,d+1));};
sc.nodes.forEach(i=>walk(i,0));
console.log('materials', j.materials.map(m=>m.name+(m.extras?JSON.stringify(m.extras):'')).join(' | ').slice(0,1500));
console.log('images', (j.images||[]).length, 'extensionsUsed', j.extensionsUsed);
