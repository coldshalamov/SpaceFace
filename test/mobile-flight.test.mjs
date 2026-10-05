import test from 'node:test';
import assert from 'node:assert/strict';
import { MobileGestures, shapeStick, stickRadius, wheelSlot, shouldEnable, canFly, screenDirection, steerToward } from '../src/systems/mobile/model.js';
import { enhanceMobileTouch } from '../src/systems/mobile/bridge.js';
import { POWER_PAGES } from '../src/systems/mobile/catalog.js';

const tick = (m, n = 1) => { let frame; for (let i=0;i<n;i++) frame=m.sample(1/60); return frame; };
const begin = (m,role='stick',id=1) => m.begin(id,role,100,200,0,70);
test('phone detection fixes short-side 480 cutoff without enabling fine-pointer desktops',()=>{
 assert.equal(shouldEnable({},390,844,true,5),true);
 assert.equal(shouldEnable({},844,390,true,5),true);
 assert.equal(shouldEnable({},320,568,true,1),true);
 assert.equal(shouldEnable({},1920,1080,false,10),false);
 assert.equal(shouldEnable({enabled:false},390,844,true,5),false);
 assert.equal(shouldEnable({enabled:true},1920,1080,false,0),true);
});
test('control radius clamps and scales in CSS pixels',()=>{
 assert.equal(stickRadius(320,568),60.8); assert.equal(stickRadius(1000,1000),86);
 assert.equal(stickRadius(100,100),54); assert.equal(stickRadius(1000,1000,1.2),103.2);
});
test('progressive thrust, deadzone and direction are bounded',()=>{
 assert.equal(shapeStick(2,2,70).magnitude,0);
 assert.ok(shapeStick(30,0,70).magnitude<shapeStick(60,0,70).magnitude);
 assert.equal(shapeStick(1000,0,70).magnitude,1);
 assert.equal(shapeStick(0,-70,70).y,-1);
});
test('one thumb cannot steal another role; three fingers coexist',()=>{
 const m=new MobileGestures(); begin(m); assert.equal(begin(m,'stick',2),false);
 assert.equal(begin(m,'fire',2),true); assert.equal(begin(m,'wheel',3),true);
 assert.equal(m.pointers.size,3); m.end(2,100,200,50,true);
 assert.equal(m.held('stick'),true); assert.equal(m.held('wheel'),true);
});
test('thrust boost needs dwell, has hysteresis, stops when retracted',()=>{
 const m=new MobileGestures(); begin(m); m.move(1,200,200,90);
 assert.equal(tick(m,4).flight.boost,false); assert.equal(tick(m).flight.boost,true);
 m.move(1,185,200,180); assert.equal(tick(m).flight.boost,true);
 m.move(1,175,200,220); assert.equal(tick(m).flight.boost,false);
});
test('stationary hold brakes; release coasts; no release flick from idle',()=>{
 const m=new MobileGestures(); begin(m); assert.equal(tick(m,15).flight.brake,false);
 assert.equal(tick(m).flight.brake,true); m.end(1,100,200,400);
 assert.equal(tick(m).flight.active,false); assert.equal(tick(m).flight.boost,false);
});
test('flick yields a bounded boost tap, including a sub-frame gesture',()=>{
 const m=new MobileGestures(); begin(m); m.end(1,180,200,100);
 assert.equal(tick(m).flight.boost,true); assert.equal(tick(m,4).flight.boost,false);
});
test('slow drags, curved gestures, tiny taps and cancellations are not flicks',()=>{
 for (const [x,y,t,cancel] of [[180,200,450,false],[108,200,80,false],[180,200,80,true]]) {
  const m=new MobileGestures(); begin(m); m.end(1,x,y,t,cancel); assert.equal(tick(m).flight.boost,false);
 }
 const m=new MobileGestures(); begin(m); m.move(1,40,200,40);m.move(1,100,270,80);m.end(1,180,200,120);
 assert.equal(tick(m).flight.boost,false);
});
test('sub-frame gun and tether taps survive once, cancellation does not',()=>{
 for(const role of ['fire','tether']){
  const m=new MobileGestures();begin(m,role);m.end(1,100,200,60);
  assert.equal(tick(m).actions[role],true);assert.equal(!!tick(m).actions[role],false);
  begin(m,role);m.end(1,100,200,60,true);assert.equal(!!tick(m).actions[role],false);
 }
});
test('held fire and independent gun aim do not change flight direction',()=>{
 const m=new MobileGestures();begin(m);m.move(1,170,200,100);begin(m,'fire',2);m.move(2,100,130,100);
 const f=tick(m);assert.equal(f.flight.x,1);assert.equal(f.aim.y,-1);assert.equal(f.actions.fire,true);
 m.end(2,100,130,200);assert.equal(!!tick(m).actions.fire,false);assert.equal(m.held('stick'),true);
});
test('tether drag maps to dedicated line controls',()=>{
 const m=new MobileGestures();begin(m,'tether');m.move(1,100,170,200);
 assert.equal(tick(m).actions.reelIn,true);m.move(1,100,230,300);
 assert.equal(tick(m).actions.reelOut,true);m.move(1,100,200,400);assert.equal(!!tick(m).actions.reelOut,false);
});
test('repeated power requests are separated by a neutral sample',()=>{
 const m=new MobileGestures();m.pulse('dropBomb');m.pulse('dropBomb');
 assert.equal(tick(m).actions.dropBomb,true);assert.equal(!!tick(m).actions.dropBomb,false);
 assert.equal(tick(m).actions.dropBomb,true);assert.equal(!!tick(m).actions.dropBomb,false);
});
test('reset drops queued powers, held toggles, flick and all contacts',()=>{
 const m=new MobileGestures();begin(m);m.pulse('chargeThrow');m.toggle.bulletTime=true;m.reset();
 assert.equal(m.pointers.size,0);assert.deepEqual(m.toggle,{});assert.equal(Object.keys(tick(m).actions).length,0);
});
test('wheel top-left-bottom resolves all six sectors and cancels safely',()=>{
 for(let i=0;i<6;i++){
  const a=(i+.5)*Math.PI/6;
  assert.equal(wheelSlot(400-Math.sin(a)*100,300-Math.cos(a)*100,400,300,140),i);
 }
 assert.equal(wheelSlot(395,300,400,300,140),-1);
 assert.equal(wheelSlot(200,300,400,300,140),-1);
 assert.equal(wheelSlot(430,300,400,300,140),-1);
});
test('steering respects hull turn rate rather than teleporting orientation',()=>{
 assert.deepEqual(steerToward({x:1,z:0},0,1),{turn:0,thrust:1});
 const f=steerToward({x:-1,z:0},0,1);assert.equal(Math.abs(f.turn),1);assert.equal(f.thrust,.18);
});
test('camera projection supports rotation and reusable scratch rays',()=>{
 const scratch={x:0,z:0};const helpers={raycastToPlane:n=>{scratch.x=-n.y;scratch.z=n.x;return scratch;}};
 const p={pos:{x:0,z:0}};const d=screenDirection(1,0,helpers,p,400,800);
 assert.ok(Math.abs(d.x)<1e-8);assert.ok(Math.abs(d.z-1)<1e-8);
 assert.deepEqual(screenDirection(1,0,null,p,400,800),{x:1,z:-0});
});
test('modal, dock, death, blocked input and hidden tabs gate flight',()=>{
 const s={mode:'flight',player:{alive:true},ui:{screenStack:[]},input:{}};
 assert.equal(canFly(s,{}),true);
 for(const extra of [{mode:'docked'},{paused:true},{player:{alive:false}},{input:{blocked:true}},{ui:{screenStack:['pause']}}]) assert.equal(canFly({...s,...extra},{}),false);
 assert.equal(canFly(s,{hidden:true}),false);
});
function fixture() {
 const ship={pos:{x:0,z:0},rot:0,vel:{x:0,z:0},hull:100,shield:100};
 const state={tick:1,mode:'flight',playerId:1,player:{alive:true},settings:{controls:{touch:{}}},input:{},ui:{screenStack:[]},entities:new Map([[1,ship]])};
 const calls=[];const doc={body:{classList:{contains:()=>false}},documentElement:{dataset:{}}};
 const win={innerWidth:390,innerHeight:844,navigator:{maxTouchPoints:5},matchMedia:()=>({matches:true})};
 const touch={active:false,axes:{},actions:{},_btnHeld:{},_btnPulse:{},_clearTouchState(){this.axes={leftX:0,leftY:0,rightX:0,rightY:0};this._btnHeld={};this._btnPulse={};this.actions={};},tick(){for(const a of ['fire','boost'])this.actions[a]={held:!!this._btnHeld[a]};},isConnected(){return this.active;}};
 const held=function(_s,a){return !!this._keys[a];};
 const host={_keys:{},_held:held,_heldExcept:held,_masslineGrammar:{reset:()=>calls.push('grammar-reset')},_holdToggleLatches:{}};
 enhanceMobileTouch(touch,{state,bus:{emit:(...args)=>calls.push(args)}},{win,doc,mountView:()=>({root:{},render(){},applyConfig(){},cancelAll(){},destroy(){}})});
 touch.autoDetect();touch.tick(1/60,state,host);
 return {state,touch,model:touch.mobile.model,host,calls,original:held};
}
test('adapter drives existing axes and action resolver without touching keyboard or entity',()=>{
 const f=fixture();begin(f.model);f.model.move(1,170,200,100);f.model.pulse('deployWell');const before=JSON.stringify(f.state.entities.get(1));
 f.touch.tick(1/60,f.state,f.host);assert.equal(f.touch.axes.leftX,0);assert.equal(f.touch.axes.leftY,-1);
 assert.equal(f.host._held(f.state,'deployWell'),true);assert.deepEqual(f.host._keys,{});
 assert.equal(JSON.stringify(f.state.entities.get(1)),before);f.touch.tick(1/60,f.state,f.host);assert.equal(f.host._held(f.state,'deployWell'),false);
});
test('virtual gun held feeds the real touch fire channel',()=>{
 const f=fixture();begin(f.model,'fire');f.touch.tick(1/60,f.state,f.host);
 assert.equal(f.touch.actions.fire.held,true);assert.equal(f.touch.axes.rightX,1);
 f.model.end(1,100,200,200,true);f.touch.tick(1/60,f.state,f.host);assert.equal(f.touch.actions.fire.held,false);
});
test('mobile time toggle clears on modal and cannot fire when resumed',()=>{
 const f=fixture();f.touch.mobile.activate({id:'bulletTime',kind:'toggle'});f.touch.tick(1/60,f.state,f.host);
 assert.equal(f.host._held(f.state,'bulletTime'),true);f.state.ui.screenStack=['pause'];f.touch.tick(1/60,f.state,f.host);
 assert.equal(f.host._held(f.state,'bulletTime'),false);f.state.ui.screenStack=[];f.touch.tick(1/60,f.state,f.host);assert.equal(f.host._held(f.state,'bulletTime'),false);
});
test('cancelling tether resets grammar, leaving the gun contact alive',()=>{
 const f=fixture();begin(f.model,'tether');begin(f.model,'fire',2);f.touch.tick(1/60,f.state,f.host);
 f.model.end(1,100,200,100,true);f.touch.tick(1/60,f.state,f.host);
 assert.ok(f.calls.includes('grammar-reset'));assert.equal(f.touch.actions.fire.held,true);
});
test('disabling mobile restores original host methods and releases keys',()=>{
 const f=fixture();assert.notEqual(f.host._held,f.original);f.model.pulse('chargeThrow');f.touch.setEnabled(false);
 assert.equal(f.host._held,f.original);assert.equal(f.touch.active,false);assert.deepEqual(f.host._keys,{});
});
test('all four power banks have distinct, described choices',()=>{
 assert.equal(POWER_PAGES.length,4);assert.equal(new Set(POWER_PAGES.flatMap(p=>p.powers.map(x=>x.id))).size,24);
 for(const p of POWER_PAGES)for(const a of p.powers)assert.ok(a.description&&a.id&&a.label);
});

test('cancellation preserves the previously committed Massline command snapshot',()=>{
 const f=fixture();const command={latch:true};f.state.input.actions={massline:command};
 f.host._masslineGrammar={command,snapshot:()=>({...command}),reset:()=>{command.latch=false;}};
 f.touch._clearTouchState();assert.equal(f.state.input.actions.massline.latch,true);assert.notEqual(f.state.input.actions.massline,command);
});
