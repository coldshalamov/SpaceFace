import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root='/workspace/scratch/d2415e46e35b',runtime=root+'/recovery-latch-20261004/normal-route-v2';
const expected=new Map(JSON.parse(fs.readFileSync(root+'/recovery-latch-20261004/latch-functional-successor-1/SOURCE_MAP.json')).files.map(f=>[f.path,f.sha256]));
const hash=x=>createHash('sha256').update(x).digest('hex');
export async function load(url,context,nextLoad){
 const result=await nextLoad(url,context);
 if(url.startsWith('file:')){
  const p=fileURLToPath(url),real=fs.realpathSync(p),bytes=fs.readFileSync(p),relative=path.relative(runtime,p),sha256=hash(bytes);
  const row={url,path:p,realpath:real,sha256,loadedSourceSha256:result.source==null?null:hash(result.source),relative,expected:expected.get(relative)||null};
  if(row.expected&&row.expected!==sha256)throw Error('Frozen hash mismatch '+p);
  fs.appendFileSync(root+'/latch-independent-review-functional-20261004/imports-'+process.pid+'.jsonl',JSON.stringify(row)+'\n');
 }
 return result;
}
export async function resolve(specifier,context,nextResolve){
 if(context.parentURL?.includes('/latch-independent-review-functional-20261004/')&&!specifier.startsWith('.')&&!specifier.startsWith('/')&&!specifier.includes(':'))return nextResolve(specifier,{...context,parentURL:'file://'+runtime+'/test/__independent_review__.mjs'});
 return nextResolve(specifier,context);
}
