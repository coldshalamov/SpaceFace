import test from 'node:test';
import assert from 'node:assert/strict';
import {story} from '../src/systems/story.js';
import {elroyLedgerNote, reconcileElroyLedgerRows} from '../src/story/campaign47a/elroyLedger.js';
function desk(saved, action='desk') {
  const emitted=[];
  const owner={state:{story:saved,player:{callsign:'Pilot'}},bus:{emit:(name,payload)=>emitted.push({name,payload})},
    _fireComms(){},_addPersistentCargo(){},_markVergeEvidence(){},_maybeOfferEndgame(){}};
  story._onKurtzInteract.call(owner,{action});
  return emitted;
}
for(const [outcome, expected] of [['custody','CUSTODY FILED'],['force','DECEASED'],[undefined,'STATUS UNVERIFIED']]) {
  test(`actual desk records ${outcome || 'unknown'} without inferring later branch`,()=>{
    const s={flags:{elroy_outcome:outcome},branch:outcome==='custody'?'traders':'patrol'};
    const events=desk(s,'openLedger');
    assert.match(s.kurtzLedgerRows.find(r=>r.name==='ELROY').note,new RegExp(expected));
    assert.equal(events.find(e=>e.name==='story:kurtzLedger').payload.rows[2].note,elroyLedgerNote(s));
    assert.equal(s.flags.elroy_outcome,outcome);
  });
}
test('old persisted dead row is reconciled for custody at reopen, repeat and cold JSON restore',()=>{
  const old={column:'COUNTERPARTY',name:'ELROY',note:'DECEASED (B2) — MAINTENANCE / PIT ENGINEERING'};
  const custom={column:'BENEFICIARY',name:'VALE, D.',note:'CUSTOM EVIDENCE'};
  let s={flags:{elroy_outcome:'custody'},kurtzLedgerRows:[custom,old]};
  desk(s); assert.match(s.kurtzLedgerRows[1].note,/CUSTODY FILED/); assert.equal(s.kurtzLedgerRows[0],custom);
  assert.match(old.note,/DECEASED/); s=JSON.parse(JSON.stringify(s)); desk(s); desk(s);
  assert.equal(s.kurtzLedgerRows.length,2); assert.match(s.kurtzLedgerRows[1].note,/CUSTODY FILED/);
});
test('custom Elroy testimony and malformed rows are not overwritten',()=>{
  const rows=[null,{column:'COUNTERPARTY',name:'ELROY',note:'FILE AMENDED BY WITNESS'}];
  const result=reconcileElroyLedgerRows(rows,{flags:{elroy_outcome:'custody'}});
  assert.deepEqual(result,rows); assert.equal(result[1],rows[1]);
  assert.equal(reconcileElroyLedgerRows(null,{}),null);
});
