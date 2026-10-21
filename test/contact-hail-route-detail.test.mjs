import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContactHailPrompt } from '../src/ui/contactHailPrompt.js';

// Minimal DOM only: actual layout is checked by the production-component browser harness.
class El {
  constructor(tag) { this.tagName=tag;this.children=[];this.attrs={};this.style={};this.dataset={};this.hidden=false;this.nodes={};this.listeners={};const c=new Set();this.classList={add:(...x)=>x.forEach(v=>c.add(v)),remove:(...x)=>x.forEach(v=>c.delete(v)),contains:x=>c.has(x),toggle:(x,b)=>b?c.add(x):c.delete(x)}; }
  set innerHTML(html) { for(const key of html.matchAll(/data-k="([^"]+)"/g)) { const el=new El('div');this.nodes[key[1]]=el;this.appendChild(el); } }
  querySelector(selector) { return this.nodes[/data-k="([^"]+)"/.exec(selector)?.[1]]; }
  setAttribute(k,v){this.attrs[k]=String(v);} removeAttribute(k){delete this.attrs[k];}
  appendChild(n){this.children.push(n);return n;} replaceChildren(...n){this.children=n;}
  addEventListener(n,f){this.listeners[n]=f;} removeEventListener(){} remove(){} contains(n){return this===n||this.children.includes(n);} focus(){document.activeElement=this;}
}
function fixture() {
  const old=globalThis.document;const head=new El('head'),root=new El('div');
  globalThis.document={head,createElement:t=>new El(t),getElementById:id=>id==='ui-root'?root:head.children.find(e=>e.id===id)||null,addEventListener(){},removeEventListener(){}};
  const handlers=new Map();const bus={on(n,f){handlers.set(n,f)},off(n){handlers.delete(n)},emit(n,p){handlers.get(n)?.(p)}};
  const target={id:113,type:'ship',alive:true,data:{callsign:'Stormshift collector'}};
  const state={mode:'flight',simTime:1,player:{targetId:113},entities:new Map([[113,target]]),ui:{}};
  const prompt=createContactHailPrompt({state,bus});
  return {prompt,bus,head,state,restore(){prompt.destroy();globalThis.document=old}};
}
test('chosen long route remains full DOM text with focused scroll region and concise heading',()=>{
 const f=fixture();try{
  const text='ROUTE · REPAIR HOLD. Aim at this collector and attach Massline. '.repeat(8);
  f.bus.emit('contactHail:response',{targetId:113,kind:'trader',choice:'route',lines:[text],expiresAt:5});
  const panel=f.prompt.el.nodes.panel;
  assert.equal(panel.hidden,false);assert.ok(panel.classList.contains('sf-contact-hail__panel--detail'));
  assert.equal(panel.attrs.tabindex,'0');assert.equal(panel.attrs['aria-label'],text);
  assert.equal(f.prompt.el.nodes.lines.children[0].textContent,text);
  assert.equal(f.prompt.el.nodes.classword.textContent,'ROUTE DETAILS · SNAPSHOT');
 }finally{f.restore();}
});
test('offer, status and clear reset route-only expansion and keep compact behavior',()=>{
 const f=fixture();try{
  const panel=f.prompt.el.nodes.panel;
  for(const choice of ['route','status',undefined]) {
   f.bus.emit(choice?'contactHail:response':'contactHail:offer',{targetId:113,kind:'trader',choice,lines:['CONTACT · READY'],expiresAt:5});
   assert.equal(panel.classList.contains('sf-contact-hail__panel--detail'),choice==='route');
   assert.equal(panel.attrs.tabindex,choice==='route'?'0':undefined);
  }
  f.bus.emit('contactHail:clear');assert.equal(panel.hidden,true);
  assert.equal(panel.classList.contains('sf-contact-hail__panel--detail'),false);
 }finally{f.restore();}
});
test('detail CSS wraps long tokens and bounds scrolling to narrow or short viewport without changing compact rows',()=>{
 const source=readFileSync(new URL('../src/ui/contactHailPrompt.js',import.meta.url),'utf8');
 assert.match(source,/\.sf-contact-hail__line \{ overflow:hidden; text-overflow:ellipsis; white-space:nowrap/);
 assert.match(source,/\.sf-contact-hail__panel--detail \{ max-height:min\(480px, calc\(100dvh - 90px\)\);\s*overflow-y:auto/);
 assert.match(source,/\.sf-contact-hail__panel--detail \.sf-contact-hail__line \{ white-space:normal;\s*overflow:visible; overflow-wrap:anywhere; text-overflow:clip/);
 assert.match(source,/width:min\(332px, calc\(100vw - 28px\)\)/);
});

test('route reading grace and focused reading do not extend receipt or actionable expiry',()=>{
 const f=fixture();try{
  const panel=f.prompt.el.nodes.panel;const reply={targetId:113,kind:'trader',choice:'route',lines:['ROUTE · read this snapshot'],expiresAt:5};
  f.bus.emit('contactHail:response',reply);f.state.simTime=6;f.prompt.tick();assert.equal(panel.hidden,false);assert.equal(reply.expiresAt,5);
  f.state.simTime=30;f.prompt.tick();assert.equal(panel.hidden,false);
  f.state.simTime=31;f.prompt.tick();assert.equal(panel.hidden,true);
  f.state.simTime=1;f.bus.emit('contactHail:response',reply);panel.focus();
  f.state.simTime=40;f.prompt.tick();assert.equal(panel.hidden,false);document.activeElement=null;f.prompt.tick();assert.equal(panel.hidden,true);
  f.bus.emit('contactHail:response',{...reply,expiresAt:44,actions:[{id:'status',label:'STATUS'}]});f.state.simTime=45;f.prompt.tick();assert.equal(panel.hidden,true);
 }finally{f.restore();}
});
test('close, target change, dock, mode and newer receipt invalidate route presentation',()=>{
 const f=fixture();try{
  const panel=f.prompt.el.nodes.panel;const reply={targetId:113,kind:'trader',choice:'route',lines:['ROUTE'],expiresAt:5};
  f.bus.emit('contactHail:response',reply);panel.focus();f.prompt.el.nodes.close.listeners.click();assert.equal(panel.hidden,true);assert.equal(document.activeElement,f.prompt.el.nodes.hail);
  for(const invalidate of [()=>{f.state.player.targetId=114},()=>{f.state.ui.docked=true},()=>{f.state.mode='menu'}]) {
   f.state.player.targetId=113;f.state.ui.docked=false;f.state.mode='flight';f.bus.emit('contactHail:response',reply);invalidate();f.prompt.tick();assert.equal(panel.hidden,true);
  }
  f.state.mode='flight';f.state.ui.docked=false;f.bus.emit('contactHail:response',reply);
  f.bus.emit('contactHail:response',{...reply,choice:'status'});f.state.simTime=6;f.prompt.tick();assert.equal(panel.hidden,true);
 }finally{f.restore();}
});

test('only matching scanner expiry retains a read-only route snapshot; other clears remain authoritative',()=>{
 const f=fixture();try{
  const panel=f.prompt.el.nodes.panel;const reply={requestId:'r1',targetId:113,kind:'trader',choice:'route',lines:['ROUTE'],expiresAt:5};
  f.bus.emit('contactHail:response',reply);f.state.simTime=5;
  f.bus.emit('contactHail:clear',{reason:'expired',requestId:'r1',targetId:113});f.prompt.tick();assert.equal(panel.hidden,false);
  for(const clear of [{reason:'availability_lost',requestId:'r1',targetId:113},{reason:'expired',requestId:'other',targetId:113},{reason:'expired',requestId:'r1',targetId:114},{reason:'load',requestId:'r1',targetId:113}]) {
   f.bus.emit('contactHail:response',reply);f.bus.emit('contactHail:clear',clear);assert.equal(panel.hidden,true);
  }
  f.bus.emit('contactHail:response',reply);f.bus.emit('contactHail:availability',{enabled:false,targetId:null});assert.equal(panel.hidden,true);
  f.bus.emit('contactHail:response',{...reply,actions:[{id:'status',label:'STATUS'}]});f.bus.emit('contactHail:clear',{reason:'expired',requestId:'r1',targetId:113});assert.equal(panel.hidden,true);
 }finally{f.restore();}
});
