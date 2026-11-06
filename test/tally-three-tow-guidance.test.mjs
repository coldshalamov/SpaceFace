import test from 'node:test';
import assert from 'node:assert/strict';
import * as tally from '../src/data/tallyThree.js';
import {createBus} from '../src/core/eventBus.js';
import {createGameState} from '../src/core/gameState.js';
import {createContactHailPrompt} from '../src/ui/contactHailPrompt.js';

test('Tally assesses original live mass against normalized effective line class without writes',()=>{
 assert.equal(typeof tally.tallyThreeTowAssessment,'function');
 const body={id:9,alive:true,mass:17,physicsBody:{mass:180},data:{worldRecordId:tally.TALLY_THREE.worldRecordId}};
 const state={entityList:[body,{id:10,alive:true,mass:9999,data:{worldRecordId:tally.TALLY_THREE.assessorId}}],lineProgression:{classIndex:8,tonnageLoggedT:0,grantedClassSteps:0,trialClassSteps:0,winchHeat:.4}};
 const before=JSON.stringify(state);
 let view=tally.tallyThreeTowAssessment(state);
 assert.equal(view.massT,180);assert.equal(view.classIndex,1);assert.equal(view.fullControlMassT,20);assert.equal(view.overClass,true);
 assert.match(view.text,/temporary hold/i);assert.match(view.text,/heat can snap/i);
 assert.equal(JSON.stringify(state),before);
 body.physicsBody.mass=20.001;view=tally.tallyThreeTowAssessment(state);
 assert.equal(view.overClass,true);assert.match(view.text,/^>20T load/,'rounded mass must still visibly exceed the class ceiling');
 body.physicsBody.mass=180;
 for(const progress of [{tonnageLoggedT:15000},{grantedClassSteps:2},{trialClassSteps:2}]){
  state.lineProgression={...progress,classIndex:1};view=tally.tallyThreeTowAssessment(state);assert.equal(view.classIndex,3);assert.equal(view.overClass,false);assert.match(view.text,/below 8/);assert.doesNotMatch(view.text,/safe|unbreakable/i);
 }
 state.lineProgression={};body.physicsBody.mass=20;assert.equal(tally.tallyThreeTowAssessment(state).overClass,false);
 body.physicsBody.mass=NaN;body.mass=180;assert.equal(tally.tallyThreeTowAssessment(state).massT,180);
 body.mass=NaN;assert.equal(tally.tallyThreeTowAssessment(state).available,false);
 assert.match(tally.tallyThreeTowAssessment(state).text,/assessment unavailable/i);
 state.entityList=[];assert.equal(tally.tallyThreeTowAssessment(state).available,false);
});

test('actual hail presenter shows one bounded wrapped Tally advice row and aria without changing actions or lifetime',()=>{
 const old=globalThis.document;globalThis.document=makeHailTestDocument();
 const state=createGameState(611),bus=createBus();state.mode='flight';state.player.targetId=9;
 const prompt=createContactHailPrompt({state,bus});
 try{
  const lines=['TALLY-3 · OWNED · 4u / 140 cr','Ceres Refinery · CERES-RECOVERY-03 · Ceres receiver'];
  const offer={kind:'tally_three',targetId:9,requestId:'real-offer',expiresAt:8,lines,actions:[{id:'tally_deliver',label:'DELIVER'},{id:'tally_contest',label:'CITE MANIFEST'},{id:'tally_receiver',label:'RECEIVER COURSE'}],towAdvice:'180T load · Class I controls 20T. Temporary hold: heat can snap the line.'};
  bus.emit('contactHail:offer',offer);
  const rows=prompt.el.querySelector('[data-k="lines"]').children;
  assert.equal(rows.length,3,'advice is not discarded by original two-line renderer');
  assert.deepEqual(rows.slice(0,2).map(e=>e.textContent),lines);
  assert.equal(rows[2].textContent,offer.towAdvice);
  assert.match(rows[2].className,/tow-advice/);
  const css=document.head.children.map(e=>e.textContent||'').join('\n');
  assert.match(css,/sf-contact-hail__tow-advice[^}]*white-space:normal/);
  assert.match(css,/sf-contact-hail__tow-advice[^}]*overflow-wrap:anywhere/);
  assert.equal(prompt.el.querySelector('[data-k="panel"]').attributes['aria-label'],[...lines,offer.towAdvice].join(' '));
  assert.equal(prompt.el.querySelector('[data-k="actions"]').children.length,3);
  let chosen;bus.on('contactHail:choice',p=>chosen=p);assert.equal(prompt.choose('tally_receiver'),true);assert.equal(chosen.requestId,'real-offer');
  state.simTime=8;prompt.tick();assert.equal(prompt.el.querySelector('[data-k="panel"]').hidden,true,'original TTL unchanged');
  bus.emit('contactHail:offer',{...offer,kind:'worker',expiresAt:10});assert.equal(prompt.el.querySelector('[data-k="lines"]').children.length,2);
  bus.emit('contactHail:offer',{...offer,expiresAt:10,towAdvice:'x'.repeat(1000)});assert.ok(prompt.el.querySelector('[data-k="lines"]').children[2].textContent.length<=240);
 }finally{prompt.destroy();if(old===undefined)delete globalThis.document;else globalThis.document=old}
});

export function makeHailTestDocument(){
 const nodes=new Map();
 class Element{
  constructor(){this.children=[];this.dataset={};this.attributes={};this.style={};this.classList={add(){},remove(){},toggle(){},contains(){return false}};this.hidden=false;}
  appendChild(e){this.children.push(e);e.parentNode=this;return e}
  removeChild(e){this.children=this.children.filter(x=>x!==e);e.parentNode=null}
  replaceChildren(...es){this.children=[];for(const e of es)this.appendChild(e)}
  querySelector(q){if(!nodes.has(q))nodes.set(q,new Element());return nodes.get(q)}
  setAttribute(k,v){this.attributes[k]=String(v)} removeAttribute(k){delete this.attributes[k]}
  getBoundingClientRect(){return {left:0,top:0,width:0,height:0}}
  addEventListener(){} removeEventListener(){} remove(){this.parentNode?.removeChild(this)}
  contains(e){return this.children.includes(e)}
 }
 const root=new Element(),head=new Element();
 return {head,createElement:()=>new Element(),getElementById:id=>id==='ui-root'?root:null,addEventListener(){},removeEventListener(){}};
}
