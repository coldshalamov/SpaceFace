#!/usr/bin/env node
/** Mandatory native-owner integration. Default is dry-run; --apply writes with backup.
 * Use the packet commit. On another revision, port the explicit seams manually and run its tests.
 */
import {readFile,writeFile,rename,unlink} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {MISSIONS_BASE_BLOB,patchMissionsSeams,SEAMS} from './lib/patch-missions-owner.mjs';
const args=process.argv.slice(2);
const root=path.resolve(args.find((a)=>!a.startsWith('--')) || '.');
const file=path.join(root,'src/systems/missions.js');
const original=await readFile(file,'utf8');
const crlf=original.includes('\r\n');
const source=original.replace(/\r\n/g,'\n');
const hash=createHash('sha1').update(`blob ${Buffer.byteLength(source)}\0`).update(source).digest('hex');
if(source.includes("import { priceProceduralOffer, offerMixForTier, economicRiskTier, standingWorkTier }")) {
  if(!SEAMS.every(([,after])=>source.includes(after))) {
    throw new Error('Partial or drifted missions economy hook found. No write performed; reconcile the owner manually.');
  }
  console.log('All primary missions economy hook markers are present; no write performed. Run native owner tests to validate the full integration.');
} else {
  if(hash!==MISSIONS_BASE_BLOB) throw new Error(`Refusing missions owner drift: expected ${MISSIONS_BASE_BLOB}, got ${hash}. Port patches manually; do not overwrite parallel agent work.`);
  const next=patchMissionsSeams(source);
  if(args.includes('--apply')) {
    const backup=file+'.economy-pulse.bak';
    await writeFile(backup,original,{flag:'wx'});
    const temporary=file+'.economy-pulse.tmp';
    try {
      await writeFile(temporary,crlf?next.replace(/\n/g,'\r\n'):next,{flag:'wx'});
      // Last-moment compare prevents overwriting edits made while preparing this patch.
      if(await readFile(file,'utf8')!==original) throw new Error('Missions changed concurrently; original left untouched');
      await rename(temporary,file);
    } catch(err) { await unlink(temporary).catch(()=>{}); throw err; }
    console.log(`Patched native missions owner; backup: ${backup}`);
  } else console.log('All native missions seams match. Re-run with --apply to install the mandatory owner hook.');
}
