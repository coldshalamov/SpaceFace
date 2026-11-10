import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { createUiInput } from '../src/ui/input.js';
import { flightHudFocusShortcut, voiceDismissBindingMatches } from '../src/ui/bindings.js';
import { DEFAULTS } from '../src/systems/input.js';

class Target {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, fn, options = false) {
    const rows = this.listeners.get(type) || [];
    rows.push({ fn, capture: options === true || !!options?.capture }); this.listeners.set(type, rows);
  }
  removeEventListener(type, fn, options = false) {
    const capture = options === true || !!options?.capture;
    this.listeners.set(type, (this.listeners.get(type) || []).filter((r) => r.fn !== fn || r.capture !== capture));
  }
  dispatch(type, event) {
    for (const row of [...(this.listeners.get(type) || [])].sort((a,b) => Number(b.capture)-Number(a.capture))) {
      row.fn(event); if (event.stopped || event.immediateStopped) break;
    }
    return event;
  }
}
function setup() {
  const priorDoc=globalThis.document, priorWin=globalThis.window;
  const doc=new Target(), win=new Target();
  const reads={computed:0,rects:0};
  doc.documentElement={classList:{add(){},remove(){}}};
  doc.body={tagName:'BODY',parentNode:null,style:{opacity:'1'}}; doc.activeElement=doc.body;
  const hud={id:'hud',parentNode:doc.body,style:{opacity:'1'},children:[],
    contains(t){for(let n=t;n;n=n.parentNode) if(n===this)return true;return false;},
    querySelectorAll(){return this.children;}, getAttribute(){return null;}};
  doc.getElementById=(id)=>id==='hud'?hud:null;
  win.getComputedStyle=(e)=>{reads.computed++;return {display:e.style?.display||'block',visibility:e.style?.visibility||'visible',opacity:e.style?.opacity||'1'};};
  globalThis.document=doc; globalThis.window=win;
  function control(kind='summary') {
    const el={tagName:kind.toUpperCase(),parentNode:hud,style:{opacity:''},isConnected:true,hidden:false,
      getAttribute(name){return name==='tabindex'?null:null;}, getClientRects(){reads.rects++;return [{}];},
      closest(selector){ if(selector.startsWith('input, textarea'))return kind==='input'?this:null; return this; },
      focus(){const previous=doc.activeElement;doc.activeElement=this;doc.dispatch('focusin',{target:this,relatedTarget:previous});},
      blur(){if(doc.activeElement===this)doc.activeElement=doc.body;}};
    hud.children.push(el);return el;
  }
  const state={mode:'flight',timeScale:1,ui:{},settings:{controls:{bindings:null}}};
  const screens=[]; const manager={isOpen:()=>screens.length>0,pushScreen:(v)=>screens.push(v),popScreen:()=>screens.pop(),
    top:()=>screens.at(-1)||null,getActiveScreenDef:()=>null};
  const bus=createBus(), cycles=[], releases=[]; let docks=0;
  bus.on('ui:cycleTarget',(p)=>cycles.push(p.dir));bus.on('dock:docked',()=>{docks++;});
  const input=createUiInput({state,bus,registry:{get:(id)=>id==='input'?{releaseHeldControls:(why)=>releases.push(why)}:null}},manager);
  function key(key, opts={}) {
    return doc.dispatch('keydown',{key,code:opts.code||key,target:opts.target||doc.activeElement,
      shiftKey:!!opts.shiftKey,ctrlKey:!!opts.ctrlKey,altKey:!!opts.altKey,metaKey:false,repeat:!!opts.repeat,
      prevented:false,stopped:false, preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;},
      stopImmediatePropagation(){this.immediateStopped=true;}});
  }
  return {doc,win,hud,state,screens,bus,input,control,key,cycles,releases,reads,get docks(){return docks;},
    close(){input.dispose();globalThis.document=priorDoc;globalThis.window=priorWin;}};
}

test('F10 does not conflict with a shipped flight scheme',()=>{
  for (const [scheme, bindings] of Object.entries(DEFAULTS.SCHEMES)) {
    for (const [action, codes] of Object.entries(bindings)) {
      assert.equal(codes.includes('F10'), false, `${scheme}.${action} must not steal the HUD shortcut`);
    }
  }
});

test('holding HUD focus does not trigger layout reads each frame',()=>{
  const f=setup();try {
    f.control(); f.key('F10'); const before={...f.reads};
    for(let i=0;i<10;i++) f.input.tick(1/60);
    assert.deepEqual(f.reads,before);
    f.win.dispatch('resize',{});
    assert.ok(f.reads.computed>before.computed, 'resize rechecks computed visibility once');
  } finally {f.close();}
});

test('world Tab targets; F10 enters visible HUD control, releases held input, and native keys stay native',()=>{
  const f=setup();try {
    const hidden=f.control();hidden.hidden=true; const summary=f.control();
    assert.equal(f.key('Tab').prevented,true);assert.deepEqual(f.cycles,[1]);
    assert.equal(f.key('Tab',{shiftKey:true}).prevented,true);assert.deepEqual(f.cycles,[1,-1]);
    const enter=f.key('F10');assert.equal(enter.prevented,true);assert.equal(f.doc.activeElement,summary);
    assert.deepEqual(f.releases,['flight-hud-focus']);
    const tab=f.key('Tab');assert.equal(tab.prevented,false);assert.equal(tab.stopped,true);assert.deepEqual(f.cycles,[1,-1]);
    const space=f.key(' ');assert.equal(space.prevented,false);assert.equal(space.stopped,true);
    f.bus.emit('dock:range',{stationId:'s',inRange:true});
    const enterButton=f.key('Enter');assert.equal(enterButton.prevented,false);assert.equal(f.docks,0);
    const exit=f.key('F10');assert.equal(exit.prevented,true);assert.equal(f.doc.activeElement,f.doc.body);
    f.key('Tab');assert.deepEqual(f.cycles,[1,-1,1]);
  } finally {f.close();}
});

test('an existing F10 flight rebind keeps F10 and provides Ctrl+F10 HUD access',()=>{
  const f=setup();try {
    const summary=f.control();f.state.settings.controls.bindings={bomb:['F10']};
    assert.equal(flightHudFocusShortcut(f.state).label,'Ctrl+F10');
    const bound=f.key('F10');assert.equal(bound.prevented,false);assert.equal(f.doc.activeElement,f.doc.body);
    const focus=f.key('F10',{ctrlKey:true});assert.equal(focus.prevented,true);assert.equal(f.doc.activeElement,summary);
    assert.equal(voiceDismissBindingMatches({key:'F6',code:'F6'}),true);
    assert.equal(f.key('F10',{ctrlKey:true}).prevented,true);assert.equal(f.doc.activeElement,f.doc.body);
  } finally {f.close();}
});

test('focus fallback also respects rebound modifier keys',()=>{
  const f=setup();try {
    const summary=f.control();
    f.state.settings.controls.bindings={bomb:['F10'],boost:['ControlLeft']};
    assert.equal(flightHudFocusShortcut(f.state).label,'Alt+F10');
    assert.equal(f.key('F10',{ctrlKey:true}).prevented,false);
    assert.equal(f.key('F10',{altKey:true}).prevented,true);assert.equal(f.doc.activeElement,summary);
    f.key('F10',{altKey:true});
    f.state.settings.controls.bindings.pull=['AltLeft'];
    assert.equal(flightHudFocusShortcut(f.state).available,false);
    assert.equal(f.key('F10',{ctrlKey:true}).prevented,false);
    assert.equal(f.key('F10',{altKey:true}).prevented,false);
    assert.equal(f.doc.activeElement,f.doc.body);
  } finally {f.close();}
});

test('HUD hiding or a screen transition drops stale focus; text and modal keys retain ownership',()=>{
  const f=setup();try {
    const summary=f.control();f.key('F10');assert.equal(f.doc.activeElement,summary);
    summary.hidden=true;f.input.tick(1/60);assert.equal(f.doc.activeElement,f.doc.body);
    summary.hidden=false;f.key('F10');assert.equal(f.doc.activeElement,summary);
    f.screens.push('pause');f.input.tick(1/60);assert.equal(f.doc.activeElement,f.doc.body);
    const modal=f.key('F10');assert.equal(modal.prevented,false);assert.equal(f.doc.activeElement,f.doc.body);
    f.screens.length=0;const input=f.control('input');input.focus();
    const text=f.key('F10');assert.equal(text.prevented,false);assert.equal(f.doc.activeElement,input);
  } finally {f.close();}
});
