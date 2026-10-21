import test from 'node:test';
import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { runSession } from '../src/systems/runSession.js';
import { survivalResults } from '../src/systems/survivalResults.js';
import { simulateCrucibleSwarm } from '../scripts/lib/bench/crucibleBench.mjs';
import {
  settleCrucibleRun, useCrucibleMetaStorage, useCrucibleMetaClock,
  resetCrucibleMetaForTests, loadCrucibleMeta, parseCrucibleMeta,
  submitCabinetInitials, normalizeCabinetInitials, cabinetBoardRows, mergeCrucibleProfiles,
  dailySeedForDateKey, CRUCIBLE_META_STORAGE_KEY,
} from '../src/systems/survivalRecords.js';
import { extractCabinetFrame, frameAtElapsed, createCabinetAttract, cabinetDailySnapshot,
  renderCabinetBoard } from '../src/ui/swarmCabinet.js';
import { SWARM_CABINET_ATTRACT_TAPE as TAPE } from '../src/ui/swarmCabinetAttractTape.js';
import { runCardModel, runCardSvg, runCardHref, applyRunShareCode, doorRunShareCode, copyShareText } from '../src/ui/screens/shareCode.js';
import { crucibleResultsScreen, crucibleScreen, buildShareBand } from '../src/ui/screens/crucible.js';
import { clearCrucibleSetup, crucibleSetupFor, requestCrucibleRun, lastCrucibleSetup } from '../src/ui/crucibleLaunch.js';
import { clearQueuedChallenge, peekQueuedChallenge } from '../src/systems/survivalMutators.js';
import { fakeDom, findAll, textLines } from './helpers/fake-dom.mjs';

const FIXED = '2026-10-20T12:00:00.000Z';
const RULES = { mode:'swarm', arenaId:'helios_core', balanceRevision:'cabinet-test-v1',
  physicsRevision:'rapier-test-v1', scoringRevision:'survival-v1', difficulty:'contender',
  loadoutRules:'{"ruleset":"swarm","starter":"physics_toolkit"}', simulationAssistProfile:'assisted', complete:true };
const result = overrides => ({ outcome:'defeat', seed:4242, arenaId:'helios_core', ruleset:'swarm',
  wave:4, deepestWave:4, wavesCleared:3, highestRoundEntered:4, lastRoundCleared:3,
  roundThreatBudget:100, roundThreatResolved:50, score:1200, credits:80, bestChain:7,
  recordRules:{...RULES}, ...overrides });
function storage() {
  const map = new Map();
  return { map, writes:0, fail:false, getItem:k=>map.get(k) ?? null,
    setItem(k,v) { if (this.fail) throw Error('storage refused'); this.writes++; map.set(k,v); } };
}
function fixture() {
  resetCrucibleMetaForTests(); clearCrucibleSetup(); clearQueuedChallenge();
  const store = storage(); useCrucibleMetaStorage(store); useCrucibleMetaClock(()=>FIXED);
  return store;
}
function settle(overrides) {
  const res = result(overrides);
  return settleCrucibleRun({ result:res, run:{ kind:'survival', ruleset:res.ruleset,
    seed:res.seed, arenaId:res.arenaId, practice:res.practice, recordRules:res.recordRules } });
}

/** The only capture path. Normal test runs compare data and write no artifacts. */
export async function captureCabinetTape() {
  fixture();
  const frames = [];
  let activeTicks = 0, pending = [];
  await simulateCrucibleSwarm({ arenaId:'helios_core', loadoutId:'physics_toolkit', seed:4242,
    waveCount:3, tickCap:1800, pilot:'bench', openingLesson:false,
    onTick({state, events}) {
      if (state.run?.phase !== 'active' || frames.length >= 120) return;
      pending.push(...events.filter(e => /^(combat:|projectile:hit|swarm:.*(?:hit|kill|damage))/.test(e.ev)).map(e=>e.ev));
      if (activeTicks++ % 6 !== 0) return;
      frames.push(extractCabinetFrame(state, [...new Set(pending)])); pending = [];
    } });
  return { version:1, seed:4242, ruleset:'swarm', arenaId:'helios_core', sampleHz:10, frames };
}

if (process.argv.includes('--emit-cabinet-tape')) {
  const tape = await captureCabinetTape();
  process.stdout.write('// Generated offline by captureCabinetTape in test/gold-453-cabinet.test.mjs.\n'
    + 'export const SWARM_CABINET_ATTRACT_TAPE = ' + JSON.stringify(tape) + ';\n');
} else {

test('terminal publication creates one stable cabinet entry, duplicate terminal events do not settle twice', () => {
  fixture();
  const state = createGameState(4242), bus = createBus(), published = [];
  state.playerId = 1; state.entities.set(1,{id:1,type:'ship',alive:true,pos:{x:0,z:0},data:{}});
  const ctx = {state,bus,helpers:{}};
  runSession.init(ctx); survivalResults.init(ctx);
  bus.on('run:resultsReady', r=>published.push(r));
  bus.emit('run:beginRequested',{kind:'survival',ruleset:'swarm',seed:4242,arenaId:'helios_core'});
  state.run.recordRules = {...RULES};
  state.run.phase = 'ended'; state.run.wave = 4;
  survivalResults._publish('defeat');
  assert.equal(published.length,1);
  assert.ok(published[0].cabinetEntryId);
  assert.equal(loadCrucibleMeta().cabinet.entries[0].id,published[0].cabinetEntryId);
  bus.emit('run:ended',{outcome:'defeat'}); survivalResults._publish('defeat');
  assert.equal(published.length,1); assert.equal(loadCrucibleMeta().cabinet.entries.length,1);
  survivalResults.dispose?.(); runSession.dispose?.();
});

test('initials validate ASCII, make no failed writes, and only update one entry without rewards', () => {
  const store = fixture(), settled = settle(), id = settled.result.cabinetEntryId;
  assert.equal(normalizeCabinetInitials(' ab7 '),'AB7');
  const before = loadCrucibleMeta(), writes = store.writes;
  for (const value of ['AB','ABCD','A!7','<b>','ÄB7','ﬀA','ßA']) {
    assert.equal(submitCabinetInitials(id,value).ok,false);
  }
  assert.equal(submitCabinetInitials('missing','AB7').ok,false);
  assert.equal(store.writes,writes);
  assert.equal(submitCabinetInitials(id,' ab7 ').initials,'AB7');
  assert.equal(submitCabinetInitials(id,'CD8').ok,true);
  const after = loadCrucibleMeta();
  assert.equal(after.cabinet.entries.length,1); assert.equal(after.cabinet.entries[0].initials,'CD8');
  const expected = structuredClone(before); expected.cabinet.entries[0].initials = 'CD8';
  assert.deepEqual(after,expected,'all fields except the initials stay identical, including score, credits, bounty and attempts');
});

test('profile migration, independent round-trip, bounded retention and named/idempotent import merge', () => {
  const store = fixture(), first = settle();
  submitCabinetInitials(first.result.cabinetEntryId,'AB7');
  const independent = storage(); independent.setItem(CRUCIBLE_META_STORAGE_KEY, store.getItem(CRUCIBLE_META_STORAGE_KEY));
  assert.equal(loadCrucibleMeta(independent).cabinet.entries[0].initials,'AB7');
  assert.deepEqual(parseCrucibleMeta({schemaVersion:1}).cabinet,{nextId:1,entries:[]});
  const named = loadCrucibleMeta(), unnamed = structuredClone(named); unnamed.cabinet.entries[0].initials = null;
  settle({seed:99}); const distinct = loadCrucibleMeta();
  const merged = mergeCrucibleProfiles(unnamed,distinct);
  assert.equal(merged.cabinet.entries.length,2); assert.equal(merged.cabinet.entries[0].initials,'AB7');
  assert.deepEqual(mergeCrucibleProfiles(merged,distinct),merged);
  assert.deepEqual(mergeCrucibleProfiles(distinct,unnamed).cabinet, merged.cabinet);
  for (let i=0;i<45;i++) settle({seed:100+i});
  const bounded = loadCrucibleMeta(); assert.equal(bounded.cabinet.entries.length,40); assert.equal(bounded.cabinet.nextId,48);
  const future = parseCrucibleMeta({schemaVersion:2,future:{safe:true},cabinet:{nextId:-4,entries:[null,{},...bounded.cabinet.entries]}});
  assert.equal(future.cabinet.entries.length,40); assert.ok(future.cabinet.nextId > 0); assert.deepEqual(future.future,{safe:true});
});

test('local board uses survival-first tuples, shared ties, isolated rules/dates and unranked unknowns', () => {
  fixture();
  settle({highestRoundEntered:3,score:99999});
  const top = settle({score:1,roundThreatResolved:80}).result.cabinetEntryId;
  settle({score:1,roundThreatResolved:80});
  settle({score:9999,roundThreatResolved:60});
  const unknown = settle({roundThreatBudget:null,roundThreatResolved:null}).result.cabinetEntryId;
  settle({dailyDateKey:'2026-10-20'}); settle({dailyDateKey:'2026-10-21'});
  settle({recordRules:{...RULES,difficulty:'veteran'}});
  const profile = loadCrucibleMeta(), rows = cabinetBoardRows(profile,{recordRules:RULES,dailyDateKey:null});
  assert.equal(rows.length,5); assert.equal(rows[0].id,top);
  assert.deepEqual(rows.map(r=>r.rank),[1,1,3,4,null]); assert.equal(rows[4].id,unknown);
  assert.equal(cabinetBoardRows(profile,{recordRules:RULES,dailyDateKey:'2026-10-20'}).length,1);
  const groups = new Set(cabinetBoardRows(profile).map(r=>r.group)); assert.equal(groups.size,4);
  const dom = cabinetDom(); assert.match(textLines(renderCabinetBoard(dom,profile)).join(' '),/Progress unknown/);
});

test('only ordinary terminal Swarm runs are eligible, including successful cash-outs', () => {
  fixture();
  for (const overrides of [ {outcome:'aborted'}, {practice:true},
    {ruleset:'powered_conveyor'}, {ruleset:'scored'}, {circuit:{status:'active'}},
    {recordRules:{...RULES,physicsRevision:null}}, {recordRules:{...RULES,mode:'practice'}} ]) settle(overrides);
  assert.equal(loadCrucibleMeta().cabinet.entries.length,0);
  settle({outcome:'victory'}); settle({outcome:'extracted',cashOut:true}); settle();
  assert.equal(loadCrucibleMeta().cabinet.entries.length,3);
  assert.equal(loadCrucibleMeta().cabinet.entries[1].result.cashOut,false,'early extraction banks half but still finishes a run');
  assert.equal(loadCrucibleMeta().cabinet.entries[0].result.bestChain,7);
});

test('actual results screen saves, refreshes card, retries refused storage, skips and recovers initials on remount', () => {
  const store = fixture(), res = {...result(),cabinetEntryId:settle().result.cabinetEntryId};
  const setup = crucibleSetupFor({starterId:'physics_toolkit',seed:4242,arenaId:'helios_core',ruleset:'swarm'});
  requestCrucibleRun({emit(){}},setup.value,'swarm');
  withDocument(cabinetDom(), doc => {
    const screen = Object.create(crucibleResultsScreen), root = doc.createElement('div'), emitted = [];
    const ctx = {state:createGameState(4242),bus:{emit:(...e)=>emitted.push(e),on(){},off(){},once(){}},
      registry:{get:name=>name==='survivalResults'?{lastResult:()=>res}:null}};
    screen.mount(root,ctx);
    const input = root.querySelector('input[aria-label="Your initials"]'); assert.ok(input);
    assert.equal(input.getAttribute('maxlength'),'3'); input.value = 'ab7';
    const save = findButton(root,'Save initials'), skip = findButton(root,'Skip');
    const card = findAll(root,n=>n.textContent==='Save run card')[0]; assert.ok(card);
    store.fail = true; save.click(); assert.match(textLines(root).join(' '),/retry/);
    assert.equal(input.value,'ab7'); assert.equal(loadCrucibleMeta().cabinet.entries[0].initials,null);
    store.fail = false; save.click(); assert.equal(loadCrucibleMeta().cabinet.entries[0].initials,'AB7');
    assert.match(decodeURIComponent(card.getAttribute('href')),/AB7/);
    assert.equal(card.getAttribute('download'),'spaceface-swarm-4242.svg');
    input.value = 'CD8'; save.click(); assert.equal(loadCrucibleMeta().cabinet.entries.length,1);
    skip.click(); assert.match(textLines(root).join(' '),/Skipped/);
    assert.ok(findButton(root,/again|retry/i)); assert.ok(findButton(root,/back/i));
    screen.dispose(); screen.mount(root,ctx);
    assert.equal(root.querySelector('input[aria-label="Your initials"]').value,'CD8');
    findButton(root,/back/i).click(); assert.ok(emitted.length); screen.dispose();
  });
});

test('Daily stays outside disclosures and the original control launches a paired UTC date/seed', () => {
  fixture();
  withDocument(cabinetDom({svg:true}), doc => {
    const screen = Object.create(crucibleScreen), root = doc.createElement('div'), emitted = [];
    const state = createGameState(4242);
    const ctx = {state,bus:{emit:(...e)=>emitted.push(e),on(){},off(){},once(){}},registry:{get:()=>null}};
    screen.mount(root,ctx);
    doc.documentElement.classList.add('sf-reduce-motion');
    screen.onShow(); assert.ok(doc.listenerCount()>=4,'cabinet lifecycle starts before the reduced-motion early return');
    const visibility = [], attract = screen._cabinetAttract, setVisible = attract.setVisible;
    attract.setVisible = value => { visibility.push(value); setVisible(value); };
    root.querySelector('#sf-prep-tab-1').click(); assert.equal(visibility.at(-1),false);
    root.querySelector('#sf-prep-tab-0').click(); assert.equal(visibility.at(-1),true);
    findAll(root,n=>n.classList.contains('sf-crd-mode') && n.dataset.ruleset==='scored')[0].click();
    assert.equal(visibility.at(-1),false);
    const daily = root.querySelector('.sf-crd-daily'), reading = root.querySelector('.orr-prep-daily');
    assert.ok(daily); assert.ok(reading); assert.equal(daily.closest('details'),null);
    assert.equal(reading.closest('details'),null); assert.match(reading.textContent,/Today · 2026-10-20 UTC/);
    assert.ok(reading.textContent.endsWith(`seed ${dailySeedForDateKey('2026-10-20')}`));
    daily.click();
    const copy = findButton(root,'Copy code'); copy.click();
    const codeField = root.querySelector('.sf-crd-code');
    const code = codeField?.value || findAll(root,n=>typeof n.value==='string' && n.value.startsWith('SFC1-'))[0]?.value;
    const decoded = applyRunShareCode(code); assert.equal(decoded.ok,true);
    assert.equal(decoded.seed,dailySeedForDateKey('2026-10-20')); assert.equal(decoded.dailyDateKey,'2026-10-20');
    assert.notEqual(state.meta.seed,decoded.seed,'the daily is a separately constructed seeded state');
    useCrucibleMetaClock(()=>'2026-10-21T00:00:00.001Z');
    doc.hidden=true; doc.dispatch({type:'visibilitychange'});
    doc.hidden=false; doc.dispatch({type:'visibilitychange'});
    assert.match(reading.textContent,/2026-10-21/); copy.click();
    const nextCode = findAll(root,n=>typeof n.value==='string' && n.value.startsWith('SFC1-'))[0].value;
    const next = applyRunShareCode(nextCode); assert.equal(next.seed,dailySeedForDateKey(next.dailyDateKey));
    assert.equal(next.dailyDateKey,'2026-10-21');
    // The original launch control still owns game:new; preparation only moves its node.
    const enter = screen._regions.enter; enter.click();
    const payload = emitted.find(e=>e[0]==='game:new')?.[1]; assert.ok(payload);
    assert.equal(payload.seed,next.seed);
    assert.equal(peekQueuedChallenge().dailyDateKey,next.dailyDateKey);
    assert.equal(lastCrucibleSetup().dailyDateKey,next.dailyDateKey);
    screen.onHide(); assert.equal(doc.listenerCount(),0); screen.dispose();
  });
  let reads = 0; useCrucibleMetaClock(()=>++reads===1?'2026-10-20T23:59:59.999Z':'2026-10-21T00:00:00.001Z');
  const snap = cabinetDailySnapshot(); assert.equal(reads,1); assert.equal(snap.seed,dailySeedForDateKey(snap.dateKey));
});

test('SVG card contains actual results and a reversible code, escapes labels and uses no external resources', async () => {
  fixture();
  const code = doorRunShareCode({starterId:'physics_toolkit',seed:4242,arenaId:'helios_core',ruleset:'swarm'}).code;
  const model = runCardModel(result({dailyDateKey:'2026-10-20'}),{initials:'AB7',code});
  const svg = runCardSvg(model); assert.match(svg,/width="1200" height="675"/);
  for (const fact of ['AB7','4242','Helios Core','defeat','1200','7','2026-10-20','Highest round entered: 4','Last round cleared: 3','50\/100']) assert.match(svg,new RegExp(fact));
  const chunks = [...svg.matchAll(/<text[^>]*font-family="monospace"[^>]*>(.*?)<\/text>/g)].map(m=>m[1]).join('');
  assert.equal(chunks,code); const decoded = applyRunShareCode(chunks);
  assert.equal(decoded.ok,true); assert.equal(decoded.seed,4242); assert.equal(decoded.starterId,'physics_toolkit');
  const hostile = runCardSvg({...model,arena:'<script>&"\'',initials:'<img onload="evil">',code:null});
  assert.match(hostile,/&lt;script&gt;&amp;&quot;&apos;/);
  assert.doesNotMatch(hostile,/<script|<image|<foreignObject|href=|url\(|@import|<img/);
  assert.doesNotMatch(hostile,/Challenge code|SFC1-/);
  assert.equal(decodeURIComponent(runCardHref(svg).split(',')[1]),svg);
  assert.equal(await copyShareText('result',{writeText:()=>Promise.reject(Error('denied'))}),false);
  const previousDoc = globalThis.document;
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis,'navigator');
  const doc = cabinetDom(); globalThis.document = doc;
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard:{writeText:()=>Promise.reject(Error('denied'))}}});
  try {
    const setup = crucibleSetupFor({starterId:'physics_toolkit',seed:4242,ruleset:'swarm',arenaId:'helios_core'});
    requestCrucibleRun({emit(){}},setup.value,'swarm');
    const band = buildShareBand(result());
    const field = findAll(band,n=>n.tagName==='textarea' || n.tagName==='input')[0]; assert.ok(field);
    assert.equal(field.readOnly,true); assert.ok(field.value.startsWith('SFC1-'));
    findButton(band,'Copy result').click();
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    const fallback = band.querySelector('[aria-label="Result line"]'); assert.ok(fallback);
    assert.equal(fallback.selected,true); assert.match(fallback.value,/4242/);
  } finally {
    globalThis.document=previousDoc;
    if(navigatorDescriptor)Object.defineProperty(globalThis,'navigator',navigatorDescriptor); else delete globalThis.navigator;
  }
});

test('attract tape is a quantized production recording with bounded active frames, hostile motion and combat', async () => {
  const regenerated = await captureCabinetTape();
  assert.ok(isDeepStrictEqual(regenerated,TAPE),'every quantized frame must equal the committed production recording');
  assert.equal(TAPE.seed,4242); assert.equal(TAPE.sampleHz,10);
  assert.ok(TAPE.frames.length>=60 && TAPE.frames.length<=120);
  assert.ok(TAPE.frames.some(f=>f.receipts.some(e=>['combat:damage','projectile:hit','swarm:killPopup'].includes(e))),
    'an actual damage/hit/kill receipt occurred inside the recording');
  const hostiles = TAPE.frames.flatMap(f=>[...f.ships,...f.brood]);
  assert.ok(hostiles.length>0);
  assert.ok(TAPE.frames.some((f,i)=>i && f.brood.some(p=> {
    const previous = TAPE.frames[0].brood.find(q=>q.id===p.id);
    return previous && (p.x!==previous.x || p.z!==previous.z);
  })),'published hostile positions visibly move');
  for (const frame of TAPE.frames) {
    assert.ok(frame.ships.length<=16 && frame.brood.length<=128 && frame.projectiles.length<=32 && frame.props.length<=16);
    for (const p of [frame.player,...frame.ships,...frame.brood,...frame.projectiles,...frame.props]) {
      assert.equal(quantized(p.x,10),p.x); assert.equal(quantized(p.z,10),p.z); assert.equal(quantized(p.yaw,1000),p.yaw);
    }
  }
  assert.ok(TAPE.frames.every((f,i)=>!i || f.tick-TAPE.frames[i-1].tick===6));
  assert.deepEqual(frameAtElapsed(TAPE,0),TAPE.frames[0]);
  assert.deepEqual(frameAtElapsed(TAPE,TAPE.frames.length/10),TAPE.frames[0]);
});

test('attract idle/input/visibility/disposal lifecycle, reduced motion and playback purity', () => {
  fixture(); settle();
  const state = createGameState(4242), profileBefore = loadCrucibleMeta();
  const snapshot = structuredClone({...state,rng:null}); const rng = state.rng, rngBefore = rng.getState();
  const doc = cabinetDom(), host = doc.createElement('div'), clock = fakeClock();
  const controller = createCabinetAttract({host,doc,tape:TAPE,...clock.options});
  controller.start(); clock.advance(7999); assert.equal(host.hidden,true);
  clock.advance(1); assert.equal(host.hidden,false); assert.equal(clock.raf.size,1);
  assert.ok(doc.canvasCalls.length>0);
  clock.advance(13000); clock.frame(); assert.equal(host.hidden,false);
  let consumed = false; doc.dispatch({type:'keydown',preventDefault(){consumed=true;},stopPropagation(){consumed=true;}});
  assert.equal(consumed,false); assert.equal(host.hidden,true); assert.equal(clock.raf.size,0);
  clock.advance(8000); assert.equal(host.hidden,false);
  doc.dispatch({type:'pointerdown'}); assert.equal(host.hidden,true);
  clock.advance(8000); doc.dispatch({type:'pointermove',clientX:10,clientY:10}); assert.equal(host.hidden,true);
  clock.advance(7999); doc.dispatch({type:'pointermove',clientX:11,clientY:11}); clock.advance(1);
  assert.equal(host.hidden,false,'subthreshold pointer noise does not reset the timer');
  controller.setVisible(false); assert.equal(host.hidden,true); assert.equal(clock.raf.size,0);
  clock.advance(10000); assert.equal(host.hidden,true);
  controller.setVisible(true); clock.advance(8000); assert.equal(host.hidden,false);
  doc.hidden = true; doc.dispatch({type:'visibilitychange'}); assert.equal(host.hidden,true);
  doc.hidden = false; doc.dispatch({type:'visibilitychange'}); clock.advance(8000); assert.equal(host.hidden,false);
  controller.stop(); assert.equal(clock.timers.size,0); assert.equal(clock.raf.size,0); assert.equal(doc.listenerCount(),0);
  controller.start(); controller.dispose(); assert.equal(doc.listenerCount(),0); assert.equal(clock.timers.size,0);
  const stillHost = doc.createElement('div');
  const still = createCabinetAttract({host:stillHost,doc,tape:TAPE,...clock.options,reducedMotion:()=>true});
  still.start(); clock.advance(8000); assert.equal(stillHost.hidden,false); assert.equal(clock.raf.size,0);
  still.dispose(); assert.deepEqual(loadCrucibleMeta(),profileBefore);
  assert.equal(state.rng,rng); assert.deepEqual(structuredClone({...state,rng:null}),snapshot);
  assert.deepEqual(state.rng.getState(),rngBefore,'playback consumes no live RNG draws');
  const failed = cabinetDom({canvas:false}), failHost = failed.createElement('div');
  const optional = createCabinetAttract({host:failHost,doc:failed,tape:TAPE,...clock.options});
  optional.start(); optional.stop(); optional.dispose(); assert.equal(clock.timers.size,0);
});

test('the actual door respects reduced motion even when browser animation APIs are available', () => {
  fixture();
  const clock=fakeClock(), keys=['requestAnimationFrame','cancelAnimationFrame','setTimeout','clearTimeout','HTMLElement'];
  const previous=Object.fromEntries(keys.map(k=>[k,globalThis[k]]));
  Object.assign(globalThis,{requestAnimationFrame:clock.options.requestFrame,cancelAnimationFrame:clock.options.cancelFrame,
    setTimeout:clock.options.schedule,clearTimeout:clock.options.cancel,HTMLElement:function(){}});
  try {
    withDocument(cabinetDom({svg:true}),doc=> {
      doc.documentElement.classList.add('sf-reduce-motion');
      const screen=Object.create(crucibleScreen),root=doc.createElement('div');
      const ctx={state:createGameState(4242),bus:{emit(){},on(){},off(){},once(){}},registry:{get:()=>null}};
      try {
        screen.mount(root,ctx); clock.frame(); screen.onShow();
        clock.advance(8000);
        assert.equal(screen._preparation.attractHost.hidden,false);
        assert.ok(doc.canvasCalls.length>0); assert.equal(clock.raf.size,0,'static demo schedules no animation');
        screen.onHide(); assert.equal(clock.timers.size,0); assert.equal(doc.listenerCount(),0);
      } finally {screen.dispose();}
    });
  } finally { for(const key of keys){if(previous[key]===undefined)delete globalThis[key];else globalThis[key]=previous[key];} }
});

}

function quantized(v,s) { return Math.round(v*s)/s || 0; }
function findButton(root, label) {
  return findAll(root,n=>n.tagName==='button' && (label instanceof RegExp ? label.test(n.textContent) : n.textContent===label))[0];
}
function withDocument(doc,fn) {
  const previous = globalThis.document; globalThis.document = doc;
  try { return fn(doc); } finally { globalThis.document = previous; }
}
function fakeClock() {
  let time=0,id=0; const timers=new Map(),raf=new Map();
  return {timers,raf,options:{now:()=>time,schedule:(fn,delay)=>{timers.set(++id,{fn,at:time+delay});return id;},
    cancel:key=>timers.delete(key),requestFrame:fn=>{raf.set(++id,fn);return id;},cancelFrame:key=>raf.delete(key)},
    advance(ms) { const end=time+ms; for (;;) {const due=[...timers].filter(([,v])=>v.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];
      if (!due) break; time=due[1].at; timers.delete(due[0]); due[1].fn();} time=end;},
    frame() {const callbacks=[...raf.values()];raf.clear();for(const fn of callbacks)fn(time);} };
}

/** A moving-node DOM stub, sufficient to exercise the actual preparation reparenting. */
function cabinetDom({svg=false,canvas=true}={}) {
  const doc=fakeDom(), base=doc.createElement, listeners=new Map(), calls=[];
  doc.hidden=false; doc.canvasCalls=calls;
  doc.addEventListener=(name,fn)=>{if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn);};
  doc.removeEventListener=(name,fn)=>listeners.get(name)?.delete(fn);
  doc.dispatch=event=>{for(const fn of listeners.get(event.type)||[])fn(event);};
  doc.listenerCount=()=>[...listeners.values()].reduce((sum,set)=>sum+set.size,0);
  const descendants=n=>n.children.flatMap(c=>[c,...descendants(c)]);
  const matches=(n,selector)=>selector.split(',').some(raw=> {
    const s=raw.trim(); if(!s)return false;
    const attr=[...s.matchAll(/\[([^=\]]+)(?:="([^"]*)")?\]/g)];
    const simple=s.replace(/\[[^\]]*\]/g,'');
    if(attr.some(([,key,val])=>val===undefined?n.getAttribute(key)===null:n.getAttribute(key)!==val))return false;
    const tag=simple.match(/^[a-zA-Z][\w-]*/)?.[0]; if(tag && n.tagName.toLowerCase()!==tag.toLowerCase())return false;
    const nodeId=simple.match(/#([\w-]+)/)?.[1]; if(nodeId && n.id!==nodeId)return false;
    return [...simple.matchAll(/\.([\w-]+)/g)].every(m=>n.classList.contains(m[1]));
  });
  doc.createElement=tag=> {
    const n=base(tag); n.ownerDocument=doc;
    Object.defineProperty(n,'parentElement',{get(){return this.parentNode;}});
    n.appendChild=function(child){if(typeof child==='string'){const text=doc.createElement('span');text.textContent=child;child=text;}
      child.parentNode?.removeChild(child);child.parentNode=this;this.children.push(child);return child;};
    n.removeChild=function(child){const index=this.children.indexOf(child);if(index>=0)this.children.splice(index,1);child.parentNode=null;return child;};
    n.insertBefore=function(child,anchor){child.parentNode?.removeChild(child);const index=this.children.indexOf(anchor);
      child.parentNode=this;this.children.splice(index<0?this.children.length:index,0,child);return child;};
    n.replaceChildren=function(...children){for(const c of [...this.children])this.removeChild(c);this.append(...children);};
    n.remove=function(){this.parentNode?.removeChild(this);};
    n.matches=s=>matches(n,s); n.querySelectorAll=s=>descendants(n).filter(c=>matches(c,s));
    n.querySelector=s=>n.querySelectorAll(s)[0]||null;
    n.closest=function(s){let p=this;while(p){if(matches(p,s))return p;p=p.parentNode;}return null;};
    n.removeEventListener=(name,fn)=>{n.listeners[name]=(n.listeners[name]||[]).filter(f=>f!==fn);};
    n.focus=()=>{doc.activeElement=n;}; n.select=()=>{n.selected=true;}; n.setSelectionRange=()=>{n.selected=true;};
    if(tag==='canvas')n.getContext=()=>canvas?new Proxy({}, {get:(_target,key)=>(...args)=>calls.push([key,...args])}):null;
    return n;
  };
  if(svg)doc.createElementNS=(_ns,tag)=>doc.createElement(tag);
  doc._make=doc.createElement; doc.documentElement=doc.createElement('html');
  return doc;
}
