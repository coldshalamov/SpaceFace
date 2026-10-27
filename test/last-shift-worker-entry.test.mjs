import test from 'node:test';
import assert from 'node:assert/strict';
import {createBus} from '../src/core/eventBus.js';
import {lastShift} from '../src/systems/lastShift.js';
import {lastShiftPrompt} from '../src/ui/lastShiftPrompt.js';
import {towlineTablePrompt} from '../src/ui/towlineTablePrompt.js';
import {ilexArkPrompt} from '../src/ui/ilexArkPrompt.js';
import {towlineTable} from '../src/systems/towlineTable.js';
import {setPromptDeck} from '../src/ui/promptDeck.js';
import {SYSTEM_CAPABILITIES} from '../src/runtime/authoritativeSystemManifest.js';
import {MAIN_TO_SIM_BUS_EVENTS} from '../src/core/mainToSimEventSurface.js';
import {projectBridgeEvent} from '../scripts/lib/simEventBridge.mjs';
import {freshLastShiftRecord,lastShiftReport} from '../src/data/lastShift.js';
const row={revision:1,clueIds:['fairlead'],text:lastShiftReport(['fairlead']),canArchive:true,canReturnRecorder:false};
function fixture(){const bus=createBus(),prompt={...lastShiftPrompt},events=[];let spec;setPromptDeck({offerDecision(s){spec=s;return true;},resolveDecision(){return true;}});prompt.init({bus});for(const type of ['lastShift:archive','lastShift:returnRecorder'])bus.on(type,p=>events.push({type,p}));prompt.offer(row);return {bus,prompt,events,get spec(){return spec;},close(){prompt.destroy();setPromptDeck(null);}};}
test('three realm-local prompt adapters stay on main; only current Last Shift commands are exposed',()=>{
 for(const id of ['lastShiftPrompt','ilexArkPrompt','towlineTablePrompt'])assert.equal(SYSTEM_CAPABILITIES[id].nodeSafe,false,id);
 assert.deepEqual([...MAIN_TO_SIM_BUS_EVENTS].filter(x=>x.startsWith('lastShift:')).sort(),['lastShift:archive','lastShift:readRecovery','lastShift:returnRecorder']);
});
test('current Last Shift owner offer projects to prompt and archives exactly once without invented evidence or reward',()=>{
 const h=fixture(),authority=createBus(),record=freshLastShiftRecord();record.knownClueIds=['fairlead'];record.revision=1;
 const state={world:{lastShift:record},entities:new Map(),player:{credits:73},simTime:12},owner={...lastShift};owner.init({state,bus:authority,helpers:{}});
 const off=authority.on('lastShift:offer',r=>{const e=projectBridgeEvent('lastShift:offer',r);assert.equal(e.dropped,false);h.bus.emit('lastShift:offer',structuredClone(e.flat));});
 const route=h.bus.on('lastShift:archive',p=>{assert(MAIN_TO_SIM_BUS_EVENTS.has('lastShift:archive'));authority.emit('lastShift:archive',structuredClone(p));});
 try{owner._offer();const card=h.spec;assert.equal(card.onChoose('return'),false);assert.equal(card.onChoose('archive'),true);assert.equal(card.onChoose('archive'),false);
 assert.equal(owner._row.receipts.length,1);assert.deepEqual(owner._row.receipts[0].clueIds,['fairlead']);assert.equal(owner._row.receipts[0].text,lastShiftReport(['fairlead']));assert.equal(state.player.credits,73);
 }finally{off();route();for(const off of owner._subs)off();h.close();}
});
test('unrendered, replaced, rejected and empty Last Shift offers cannot invoke archived callbacks',()=>{
 const h=fixture();try{const old=h.spec;assert.equal(old.onChoose('return'),false);assert.equal(old.onChoose('__proto__'),false);
 h.prompt.offer({...row,revision:2});assert.equal(old.onChoose('archive'),false);const newer=h.spec;
 assert.equal(h.prompt.offer({canArchive:false,canReturnRecorder:false}),false);assert.equal(newer.onChoose('archive'),false);
 h.prompt.offer(row);const rejected=h.spec;setPromptDeck({offerDecision(){return false;},resolveDecision(){return true;}});
 assert.equal(h.prompt.offer(row),false);assert.equal(rejected.onChoose('archive'),false);assert.equal(h.events.length,0);
 }finally{h.close();}
});
test('all existing lifecycle interruptions invalidate Last Shift callbacks; fresh offers still work once',()=>{
 for(const event of ['game:load','game:new','game:newGame','save:restoring','save:loaded','dock:docked','sector:exit','destroy']){const h=fixture();try{const old=h.spec;if(event==='destroy')h.prompt.destroy();else h.bus.emit(event);assert.equal(old.onChoose('archive'),false,event);assert.equal(h.events.length,0);if(event!=='destroy'){h.prompt.offer(row);assert.equal(h.spec.onChoose('archive'),true);assert.equal(h.spec.onChoose('archive'),false);assert.equal(h.events.length,1);}}finally{h.close();}}
});
test('return-only Last Shift offer emits only rendered return command with original revision',()=>{
 const h=fixture();try{h.prompt.offer({...row,canArchive:false,canReturnRecorder:true});assert.equal(h.spec.onChoose('archive'),false);assert.equal(h.spec.onChoose('return'),true);assert.deepEqual(h.events,[{type:'lastShift:returnRecorder',p:{revision:1}}]);}finally{h.close();}
});
test('nine explicit Ilex and Towline commands preserve authority payload boundaries',()=>{
 assert.deepEqual([...MAIN_TO_SIM_BUS_EVENTS].filter(x=>x.startsWith('ilexArk:')).sort(),['accept','course','deliver','finish'].map(x=>'ilexArk:'+x));
 assert.deepEqual([...MAIN_TO_SIM_BUS_EVENTS].filter(x=>x.startsWith('towlineTable:')).sort(),['assist','course','deliver','release','take'].map(x=>'towlineTable:'+x));
 for(const id of ['deliver','assist']){const bus=createBus(),prompt={...towlineTablePrompt},events=[];let card;setPromptDeck({offerDecision(s){card=s;return true;},resolveDecision(){return true;}});
 prompt.init({bus});bus.on('towlineTable:'+id,p=>events.push(p));try{prompt.offer({memberId:'mara',name:'Mara',revision:4,targetId:42,canDeliver:true,canAssist:true});assert.equal(card.onChoose(id),true);assert.deepEqual(events,[{memberId:'mara',revision:4,...(id==='assist'?{targetId:42}:{})}]);}finally{prompt.destroy();setPromptDeck(null);}}
 const bus=createBus(),calls=[],owner={...towlineTable,deliver(id,revision,by='player'){calls.push({id,revision,by});return {ok:true};}};owner.init({bus,state:{},helpers:{}});try{bus.emit('towlineTable:deliver',{memberId:'mara',revision:4,targetId:'crew',by:'crew'});assert.deepEqual(calls,[{id:'mara',revision:4,by:'player'}]);}finally{for(const off of owner._subs)off();}
});
test('Ilex current-choice and once-only guards do not expose an unrendered finish',()=>{
 const bus=createBus(),prompt={...ilexArkPrompt},events=[];let card;setPromptDeck({offerDecision(s){card=s;return true;},resolveDecision(){return true;}});prompt.init({bus});bus.on('ilexArk:accept',p=>events.push(p));try{prompt.offer({revision:2,canAccept:true});assert.equal(card.onChoose('finish'),false);const old=card;bus.emit('save:restoring');assert.equal(old.onChoose('accept'),false);prompt.offer({revision:3,canAccept:true});assert.equal(card.onChoose('accept'),true);assert.equal(card.onChoose('accept'),false);assert.deepEqual(events,[{revision:3}]);}finally{prompt.destroy();setPromptDeck(null);}
});

import {KNOWN_UNFORWARDED_BUS_EVENTS} from '../src/core/mainToSimEventSurface.js';
// Exact published bridge contract at 3bf67c9617e285561330a413472bd11a94bf2f7b.
const PUBLIC_FORWARD=["band:cycle","borrowedVoice:disposition","bracket:matchFinished","career:ladder:abandon","career:ladder:accept","career:ladder:choose","career:ladder:decline","career:ladder:recover","career:origin:accept","career:origin:choose","career:origin:decline","career:origin:reoffer","claim:defenseIgnore","combat:aftermathChoose","contactHail:choice","contactHail:request","contraband:bribe","crew:decline","crew:hire","customs:submit","debug:invulnerable","debug:refillPlayer","dock:committed","dock:denied","dock:docked","dock:launder","dock:range","dock:undocked","drill:approachRequested","economy:marketOpened","economy:payBounty","encounter:choose","encounter:resolved","entity:destroyed","entity:kill","entity:spawnRequest","faction:bribe","fuel:crackCell","game:exitToMenu","game:load","game:new","game:save","hud:layoutChanged","industrialDisasters:command","industrialDisasters:presentationReady","industrialDisasters:requirePresentation","input:worldGestureCancelled","kinetic-league:enter","kinetic-league:leave","kinetic-league:next","kinetic-league:retry","lastShift:archive","lastShift:returnRecorder","law:fineChoice","law:impoundPay","lawfulInspection:choose","ledger:evidenceLinked","longBerth:claim","longBerth:restore","mercyService:order","mercyService:tool","mission:abandon","mode:changed","moralTrap:choose","nav:abortRoute","nav:engageRoute","nemesis:spare","orbital-gallery:enter","orbital-gallery:leave","orbital-gallery:next","orbital-gallery:retry","orrinWitness:submitEvidence","pallasHiddenCache:choose","palletJack:drop","palletJack:trail","physics-venues:records","pirateDisengage:verdict","pirateParley:choose","player:recoveryRequested","race:abort","race:launchFailed","race:reset","race:restart","range:opened","recovery:choose","recovery:vent","redKite:course","redKite:start","rigWorkshop:choose","run:awardRequested","run:beginRequested","run:draftLockRequested","run:draftPickRequested","run:draftRerollRequested","run:loadoutReady","run:openingPrepareRequested","run:refitCloseRequested","run:refitFitRequested","run:refitSellRequested","run:refitStripRequested","sable:demonstrated","salvage:reactorVented","salvageOutfits:choose","salvageTender:action","salvageTender:inspect","save:error","save:loadSpeculationTarget","save:loaded","save:restoring","scenario:branchChoice","scenario:scavengerResponse","service:decantRequest","settings:changed","ship:appearanceChanged","shipbreakingYard:action","signal:investigate","signal:track","sim:pause","siteEvidence:action","spectrum:focus","survivorPod:choose","toast","touch:guide","ui:abandonMission","ui:acceptMission","ui:applyLoadoutPreset","ui:buy","ui:buyModule","ui:buyPayload","ui:buyShip","ui:deleteLoadoutPreset","ui:endgameChoose","ui:endgameDecline","ui:endgameDepartAshfall","ui:endgameSandbox","ui:endgameStayAshfall","ui:endgameUnfiledJump","ui:endgameUnfiledJumpConfirm","ui:entityRoute","ui:factionPresenceService","ui:firstRunSplash:active","ui:firstRunSplash:done","ui:fitModule","ui:fitPayload","ui:fleetOrder","ui:kurtzInteract","ui:manifestAction","ui:manifestOpen","ui:manifestStart","ui:prepareBombRack","ui:previewBombRackPreparation","ui:purchaseFrontierRumor","ui:purchaseSurveyData","ui:saveLoadoutPreset","ui:sell","ui:sellPayload","ui:service","ui:setActiveShip","ui:setCourse","ui:setShipAppearance","ui:setShipName","ui:shipjack","ui:talkContact","ui:trackMission","ui:unfitPayload","ui:unlockTech","ui:upgradeBombRack","ui:wingOrder","uniqueWreck:choose","vestaOreCache:choose","voice:surface","world:abortJumpCharge","world:playerRelocated","world:requestJump","world:requestRoute","world:requestSectorScan","world:stuckTowAccept","wreckCourt:action","wreckMission:choose"];
const PUBLIC_KNOWN=["alert","ambient","audio:cue","audio:outputDeviceChanged","barkDirector:voice","borrowedSun:lost","borrowedSun:notice","borrowedSun:offer","borrowedSun:phase","borrowedSun:route","camera:shake","camera:zoom","cargo:jettison","combustion","comms:log","comms:popup","contactHail:deck:open","customs:breakScan","dock:attempt","drill:approachCompleted","drill:approachStarted","dust","encounter:choiceOffered","game:embarkSpeculation","game:loadingProgress","game:over:dismissed","game:retryStart","game:startFailed","hud:recallObjective","hud:slotClaim","hud:slotRelease","lane:facadeMiss","logbook:stillReady","mission:updated","nav:waypoint","news:headline","news:publish","news:render","presentation:audioCue","presentation:caption","presentation:vfxCue","race:armed","race:toggleView","setPiece:staged","ship:deathFlash","ship:deathPop","ship:rcsPulse","sim:resume","station:exitRequest","station:navigate","ui:bulkHaulTag","ui:bulkHaulTagCleared","ui:cancel","ui:clearTarget","ui:closeAll","ui:closeCargo","ui:closeComms","ui:confirm","ui:cycleComponent","ui:cycleTarget","ui:endgameConfirm","ui:endingArchiveOpen","ui:entityDrawer","ui:globalFind","ui:heliosBay7Scan","ui:loadingHidden","ui:navigate","ui:popScreen","ui:pushScreen","ui:replaceScreen","ui:restockBombRack","ui:screenTop","ui:ship:range","ui:toggleCargo","ui:toggleComms","ui:toggleOverview","ui:transferParkedCargo","ui:wingmanRadial","uniqueWreck:rumorHeard","vent","voice:clear","voice:dismiss","voice:say","warrant:acceptPayment","watch:changed"];
test('port adds nine intended commands and one read-only recovery request while preserving every public bridge contract',()=>{
 const extra=['lastShift:readRecovery','ilexArk:accept','ilexArk:course','ilexArk:deliver','ilexArk:finish','towlineTable:assist','towlineTable:course','towlineTable:deliver','towlineTable:release','towlineTable:take',
  // 866bf365f42: the every-5th-wave swarm event is an accept/refuse wager; the deck answers on this verdict.
  'swarm:eventVerdict'];
 assert.deepEqual([...MAIN_TO_SIM_BUS_EVENTS].sort(),[...new Set([...PUBLIC_FORWARD,...extra])].sort());
 assert.deepEqual([...KNOWN_UNFORWARDED_BUS_EVENTS].sort(),PUBLIC_KNOWN.sort());
 assert.equal(MAIN_TO_SIM_BUS_EVENTS.has('game:started'),false);assert.equal(KNOWN_UNFORWARDED_BUS_EVENTS.has('game:started'),false);
});

// Synchronous deck admission and HUD-release reentrancy contracts.

const promptCases = [
 {name:'Last Shift', adapter:lastShiftPrompt, event:'lastShift:offer', command:'lastShift:archive', choice:'archive', row:{revision:1,clueIds:['fairlead'],text:'Read evidence',canArchive:true}, payload:{revision:2}},
 {name:'Ilex', adapter:ilexArkPrompt, event:'ilexArk:offer', command:'ilexArk:accept', choice:'accept', row:{revision:1,canAccept:true}, payload:{revision:2}},
 {name:'Towline', adapter:towlineTablePrompt, event:'towlineTable:offer', command:'towlineTable:assist', choice:'assist', row:{revision:1,name:'Mara',memberId:'mara',targetId:42,canAssist:true}, payload:{memberId:'mara',revision:2,targetId:42}}
];
function reentrantPromptFixture(c) {
 const bus=createBus(), prompt={...c.adapter}, events=[], cards=[];
 const deck={offerDecision(s){cards.push(s);return true;},resolveDecision(){return true;}};
 setPromptDeck(deck);prompt.init({bus});bus.on(c.command,p=>events.push(p));
 return {bus,prompt,events,cards,deck,offer(revision=1){return prompt.offer({...c.row,revision});},close(){deck.resolveDecision=()=>true;prompt.destroy();setPromptDeck(null);}};
}
for(const c of promptCases){
 test(c.name+' rejects retained choice when resolution synchronously accepts a newer offer',()=>{
  const h=reentrantPromptFixture(c);try{h.offer();const old=h.cards.at(-1);let fired=false;
   h.deck.resolveDecision=()=>{if(!fired){fired=true;h.offer(2);}return true;};
   assert.equal(old.onChoose(c.choice),false);assert.deepEqual(h.events,[]);
   assert.equal(old.onChoose(c.choice),false);assert.equal(h.cards.at(-1).onChoose(c.choice),true);
   assert.deepEqual(h.events,[c.payload]);assert.equal(h.cards.at(-1).onChoose(c.choice),false);
  }finally{h.close();}
 });
 test(c.name+' cancels command when lifecycle or destroy reenters resolution',()=>{
  for(const event of ['game:load','game:new','game:newGame','save:restoring','save:loaded','dock:docked','sector:exit','destroy']){
   const h=reentrantPromptFixture(c);try{h.offer();const old=h.cards.at(-1);let fired=false;
    h.deck.resolveDecision=()=>{if(!fired){fired=true;if(event==='destroy')h.prompt.destroy();else h.bus.emit(event);}return true;};
    assert.equal(old.onChoose(c.choice),false,event);assert.deepEqual(h.events,[],event);
   }finally{h.close();}
  }
 });
 test(c.name+' does not dispatch before offer acceptance or let rejected outer offer invalidate accepted inner card',()=>{
  const h=reentrantPromptFixture(c);try{let nesting=false,early;
   h.deck.offerDecision=s=>{h.cards.push(s);if(nesting)return true;early=s.onChoose(c.choice);nesting=true;h.offer(2);return false;};
   assert.equal(h.offer(),false);assert.equal(early,false);assert.deepEqual(h.events,[]);
   assert.equal(h.cards[0].onChoose(c.choice),false);assert.equal(h.cards.at(-1).onChoose(c.choice),true);assert.deepEqual(h.events,[c.payload]);
  }finally{h.close();}
 });
 test(c.name+' null, rejected, destroyed and unrendered choices stay inert without rebuilding same-ID offers',()=>{
  const h=reentrantPromptFixture(c);try{let resolves=0;h.deck.resolveDecision=()=>{resolves++;return true;};
   h.offer();const first=h.cards.at(-1);h.offer(2);assert.equal(resolves,0);assert.equal(first.onChoose(c.choice),false);
   const second=h.cards.at(-1);assert.equal(second.onChoose('__proto__'),false);
   assert.equal(second.onChoose(c.choice==='archive'?'return':c.choice==='accept'?'finish':'deliver'),false);
   assert.equal(h.prompt.offer(null),false);assert.equal(second.onChoose(c.choice),false);
   h.deck.offerDecision=s=>{h.cards.push(s);return false;};assert.equal(h.offer(),false);assert.equal(h.cards.at(-1).onChoose(c.choice),false);
   h.prompt.destroy();const count=h.cards.length;assert.equal(h.offer(),false);assert.equal(h.cards.length,count);assert.deepEqual(h.events,[]);
  }finally{h.close();}
 });
}

for(const c of promptCases){
 test(c.name+' accepted outer offer stays stale after a newer accepted offer or lifecycle during admission',()=>{
  for(const interrupt of ['offer','game:load','destroy']){
   const h=reentrantPromptFixture(c);try{let nesting=false;
    h.deck.offerDecision=s=>{h.cards.push(s);if(!nesting){nesting=true;if(interrupt==='offer')h.offer(2);else if(interrupt==='destroy')h.prompt.destroy();else h.bus.emit(interrupt);}return true;};
    assert.equal(h.offer(),false);assert.equal(h.cards[0].onChoose(c.choice),false);assert.deepEqual(h.events,[]);
    if(interrupt==='offer'){assert.equal(h.cards.at(-1).onChoose(c.choice),true);assert.deepEqual(h.events,[c.payload]);}
   }finally{h.close();}
  }
 });
 test(c.name+' destroy rejects offers emitted synchronously by resolution; absent deck cannot arm callbacks',()=>{
  const h=reentrantPromptFixture(c);try{h.offer();const old=h.cards.at(-1),count=h.cards.length;let result;
   h.deck.resolveDecision=()=>{result=h.offer(2);return true;};h.prompt.destroy();
   assert.equal(result,false);assert.equal(h.cards.length,count);assert.equal(old.onChoose(c.choice),false);assert.deepEqual(h.events,[]);
  }finally{h.close();}
  const absent=reentrantPromptFixture(c);try{setPromptDeck(null);assert.equal(absent.offer(),false);assert.deepEqual(absent.events,[]);}finally{absent.close();}
 });
}
