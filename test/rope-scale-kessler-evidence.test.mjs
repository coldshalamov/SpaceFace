import { readFileSync } from 'node:fs';
import { fakeDom } from './helpers/fake-dom.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { generateContacts, getChoices, buildReply } from '../src/ui/station/barContacts.js';
import { economyContracts } from '../src/systems/economyContracts.js';
const OFFER = 'eco_mass_scale_weight_audit_station_helios';
const ID = `mass-slip:${OFFER}:0`;
function boot() { const s = createGameState(4242); s.ui.docked = true; s.ui.dockedStationId = 'station_helios'; return s; }
function evidence(s, filed = false) {
  const row = { slipId: ID, sourceOfferId: OFFER, missionId: 'mission-audit-1', kind: 'weight_audit', issuer: 'Helios Variance Office', reference: '47-A', targetSlot: 0, declaredMassT: 20, measuredMassT: 1598.25, issuingStationId: 'station_helios', weighedTick: 60, weighedSimTime: 1, filedAtStations: filed ? { station_helios: { outcome: 'mass_discrepancy_filed', tick: 120, simTime: 2 } } : {} };
  s.economyContracts = { massScale: { version: 1, slips: { [ID]: row }, completed: {}, fenceOffers: {} } }; return row;
}
function contact(s, station='station_helios') { return generateContacts(station, s).find(c=>c.canonicalKey==='kessler'); }
function choice(s) { const c=contact(s); return getChoices(c.role,c).find(x=>x.id.startsWith('weight_slip:')); }
function answer(s, selected=choice(s), c=contact(s), station='station_helios') { assert.ok(selected,'ordinary Bar exposes weight slip choice'); return buildReply(c.role,selected.id,{state:s,bus:{emit(){throw Error('conversation emitted event');}}},station,c).text; }

test('ordinary Helios Kessler offers retained evidence without replacing merchant choices or greeting',()=>{
 const s=boot(); const original=contact(s); const existing=getChoices(original.role,original); evidence(s);
 const c=contact(s), pick=choice(s); assert.ok(pick); assert.equal(pick.label,'Show the weight slip.');
 assert.equal(c.line,original.line); assert.deepEqual(getChoices(c.role,c).filter(x=>x.id!==pick.id),existing);
 assert.match(answer(s),/Declared 20 t\. Your line read 1598\.25 t\./); assert.match(answer(s),/Customs has no filing/);
});
test('filed audit states the accepted filing, not guilt, cargo contents, immunity or correction',()=>{
 const s=boot();evidence(s,true); const text=answer(s);assert.match(text,/office filed the difference/);assert.match(text,/Keep the original/);
 assert.doesNotMatch(text,/cleared|guilty|catalyst|patient|corrected|reward|innocent/i);
});
test('empty and legacy saves do not grow evidence or a new choice',()=>{const s=boot();const before=JSON.stringify(s.economyContracts);assert.equal(choice(s),undefined);assert.equal(JSON.stringify(s.economyContracts),before);});
test('another station and an undocked stale contact cannot reveal a slip',()=>{
 const s=boot();evidence(s,true);const pick=choice(s),c=contact(s);
 s.ui.dockedStationId='station_ceres';assert.equal(choice(s),undefined);assert.doesNotMatch(answer(s,pick,c),/1598|filed the difference/);
 s.ui.dockedStationId='station_helios';s.ui.docked=false;assert.equal(choice(s),undefined);assert.doesNotMatch(answer(s,pick,c),/1598/);
 s.ui.docked=true;assert.doesNotMatch(answer(s,pick,c,'station_ceres'),/1598/);
});
test('stale clicked identity is not retargeted to replacement evidence',()=>{
 const s=boot();const r=evidence(s);const pick=choice(s),c=contact(s);r.missionId='replacement';assert.doesNotMatch(answer(s,pick,c),/1598/);
 assert.match(answer(s),/1598/);delete s.economyContracts.massScale.slips[ID];assert.doesNotMatch(answer(s,pick,c),/1598/);
});
test('wrong kind, issuer station, offer, target slot, issuer or reference is not the Helios audit',()=>{
 for(const change of [{kind:'carrier_frame'},{kind:'sealed_recovery'},{issuingStationId:'station_ceres'},{sourceOfferId:'unrelated'},{targetSlot:1},{issuer:'Some other clerk'},{reference:'other'}]){const s=boot();Object.assign(evidence(s),change);assert.equal(choice(s),undefined,JSON.stringify(change));}
});
test('invalid mass, forged slip key and missing mission identity earn no dialogue',()=>{
 for(const change of [{measuredMassT:0},{measuredMassT:NaN},{measuredMassT:20},{declaredMassT:Infinity},{declaredMassT:32},{slipId:'forged'},{missionId:''}]){const s=boot();Object.assign(evidence(s),change);assert.equal(choice(s),undefined);}
});
test('wrong filing outcome or wrong filing station never reads as filed',()=>{
 for(const filings of [{station_helios:{outcome:'mass_frame_disputed'}},{station_ceres:{outcome:'mass_discrepancy_filed'}}]){const s=boot();evidence(s).filedAtStations=filings;assert.match(answer(s),/Customs has no filing/);}
});
test('other cases cannot displace or contaminate the audit answer',()=>{
 const s=boot();evidence(s);s.economyContracts.massScale.slips.other={slipId:'other',kind:'carrier_frame',measuredMassT:444};assert.match(answer(s),/1598\.25/);assert.doesNotMatch(answer(s),/444|issuer.*disputed/i);
});
test('Bay 7 remains the opener and existing merchant replies still work',()=>{
 const s=boot();evidence(s);s.story.flags.helios_bay7_available=true;const c=contact(s);assert.match(c.line,/Bay 7/);assert.equal(c.bay7Rumor,true);assert.ok(choice(s));
 assert.match(buildReply(c.role,'dismiss',{state:s},'station_helios',c).text,/sign the seal/);
});
test('repeated read-only conversations leave frozen evidence unchanged and award nothing',()=>{
 const s=boot();evidence(s,true);const before=JSON.stringify(s.economyContracts),credits=s.player.credits;
 function freeze(x){if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}}freeze(s.economyContracts);
 const first=answer(s);for(let i=0;i<3;i++)assert.equal(answer(s),first);assert.equal(JSON.stringify(s.economyContracts),before);assert.equal(s.player.credits,credits);
});
test('economy owner Save/Continue preserves retained/filed distinctions; newGame clears them',()=>{
 for(const filed of [false,true]){const s=boot();evidence(s,filed);const owner=Object.create(economyContracts);owner.state=s;
 const data=JSON.parse(JSON.stringify(owner.serialize()));const resumed=boot();const loaded=Object.create(economyContracts);loaded.state=resumed;loaded.deserialize(data);
 assert.equal(answer(resumed),answer(s));loaded.newGame();assert.equal(choice(resumed),undefined);}
});

test('a lighter physical measurement stays its exact evidence, not a hardcoded heavier load',()=>{const s=boot();evidence(s).measuredMassT=12.4;assert.match(answer(s),/Declared 20 t\. Your line read 12\.4 t\./);});

// Run the exact production composeStage function with the existing lightweight DOM.
// This verifies the inserted hint, not full-screen layout or browser acceptance.
test('production Bar stage advertises only its actual supported answer shortcuts',()=>{
 const source=readFileSync(new URL('../src/ui/station/screens/bar.js',import.meta.url),'utf8');
 const start=source.indexOf('  function composeStage(c) {');
 const end=source.indexOf('  // ---------- leads:',start);
 assert.ok(start>=0&&end>start);
 const code=source.slice(start,end);
 const run=new Function('stageEl','document','reducedMotion',`
   let wave=null,dial=null,stopType=null,saidText=null,spokenText=null;
   const stopDecrypt=[];
   ${code}
   return composeStage({});
 `);
 for(const count of [0,1,3,4,10]){
  const doc=fakeDom(),stage=doc.createElement('section'),list=doc.createElement('ul');
  const buttons=Array.from({length:count},()=>doc.createElement('button'));
  const inserted=[];list.insertAdjacentElement=(where,el)=>{assert.equal(where,'afterend');inserted.push(el);};
  stage.querySelector=(selector)=>selector==='.sx-choice'?(buttons[0]||null):selector==='.sx-talk__choices'?list:null;
  stage.querySelectorAll=(selector)=>selector==='.sx-choice'?buttons:[];
  run(stage,doc,()=>true);
  if(count===0){assert.equal(inserted.length,0);continue;}
  assert.equal(inserted.length,1);
  assert.equal(inserted[0].textContent,`${count===1?'1':`1–${Math.min(9,count)}`} · Enter answers`);
  assert.equal(buttons[0].classList.contains('is-current'),true);
 }
 assert.ok(source.includes('/^[1-9]$/.test(ev.key)'), 'existing digit handler stays limited to 1–9');
});
