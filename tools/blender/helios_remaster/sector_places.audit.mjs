// Exact candidate inventory and attachment preservation. This does not grant art acceptance.
import {openSync,readSync,closeSync,readdirSync,readFileSync,writeFileSync,statSync} from 'node:fs';
import {join,relative,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {Matrix4,Vector3,Quaternion} from 'three';
const root=process.cwd(),dir=resolve(root,'.devshots/helios-remaster/sector-places');
function document(path){const fd=openSync(path,'r');try{const h=Buffer.alloc(20);readSync(fd,h,0,20,0);if(h.toString('ascii',0,4)!=='glTF')throw Error(path+': not GLB');const j=Buffer.alloc(h.readUInt32LE(12));readSync(fd,j,0,j.length,20);return JSON.parse(j.toString('utf8'));}finally{closeSync(fd);}}
function helpers(doc){const found={};const walk=(i,parent)=>{const n=doc.nodes[i];const local=n.matrix?new Matrix4().fromArray(n.matrix):new Matrix4().compose(new Vector3(...(n.translation||[0,0,0])),new Quaternion(...(n.rotation||[0,0,0,1])),new Vector3(...(n.scale||[1,1,1])));const world=parent.clone().multiply(local);if(/SOCKET|MOUNT|COLLISION/i.test(n.name||''))found[n.name]=world.elements;for(const c of n.children||[])walk(c,world);};for(const i of doc.scenes[doc.scene||0].nodes)walk(i,new Matrix4());return found;}
const assets=[];
for(const file of readdirSync(dir).filter(f=>f.endsWith('.report.json'))){
  const report=JSON.parse(readFileSync(join(dir,file),'utf8')),candidate=resolve(root,report.candidate),doc=document(candidate),sourceDoc=document(resolve(root,report.source));
  const before=helpers(sourceDoc),after=helpers(doc),attachmentErrors=[];
  for(const [name,m] of Object.entries(before)){if(!after[name])attachmentErrors.push('missing:'+name);else if(m.some((v,i)=>Math.abs(v-after[name][i])>1e-4))attachmentErrors.push('moved:'+name);}
  const materialFlags=(doc.materials||[]).every(m=>m.extras?.spacefaceRemasterGeometry===true);
  let triangles=0;
  for(const mesh of doc.meshes||[])for(const primitive of mesh.primitives||[])triangles+=(doc.accessors[primitive.indices??primitive.attributes.POSITION].count/3)|0;
  const row={id:report.asset,source:report.source,candidate:relative(root,candidate).replaceAll('\\','/'),sourceSha256:report.sourceSha256,candidateSha256:createHash('sha256').update(readFileSync(candidate)).digest('hex'),bytes:statSync(candidate).size,trianglesAllLods:triangles,materialFlags,attachmentErrors,changes:report.changes,sourceComponents:report.zones.map(z=>z.component),visualVerdict:report.visualVerdict};
  if(attachmentErrors.length||!materialFlags||!triangles)throw Error(JSON.stringify(row));
  assets.push(row);
}
assets.sort((a,b)=>a.id.localeCompare(b.id));
const result={scope:'Helios nonship models',sourceRevision:'463d9383855d99fce87e5ee6e59974fe5f2653c4',candidateCount:assets.length,technicalStatus:'attachments preserved; actual authored materials flagged',artAcceptance:'Independent controller review, live release integration and representative runtime checks owned by root. Counts are not visual acceptance.',assets};
writeFileSync(resolve(root,'tools/blender/helios_remaster/sector_places.contract.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({candidates:assets.length,attachments:'preserved',materialFlags:'all true'}));
