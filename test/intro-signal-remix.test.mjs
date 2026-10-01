import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SIGNAL_REMIX, sampleSignalRemix, signalCover, attachIntroSignalRemix } from '../src/ui/introSignalRemix.js';
import { installIntroSignalRemix } from '../src/ui/introSignalRemixBoot.js';

// Pure score / optical contracts. Existing geometry/feedback suites still own
// their source engines; these tests must not rebaseline or weaken those suites.
test('32-second negative plays in 18 seconds without seeking or replacing assets', () => {
  assert.equal(SIGNAL_REMIX.sourceSeconds / (SIGNAL_REMIX.sourceSeconds / SIGNAL_REMIX.loopSeconds), 18);
  const src = readFileSync(new URL('../src/ui/introSignalRemix.js', import.meta.url), 'utf8');
  assert(!/currentTime\s*=|Math\.random\(|fetch\(/.test(src));
  assert(src.includes("from './loadingSignalTableaux.js'"));
  assert(!src.includes('new Audio'));
  assert.equal(SIGNAL_REMIX.glyphs.length,16);
});
test('pure edit score is finite, deterministic and bounded for malformed clocks', () => {
  for (const time of [NaN,Infinity,-Infinity,-10,0,1.125,18,350,1e6]) {
    const a=sampleSignalRemix(time,time), b=sampleSignalRemix(time,time);
    assert.deepEqual(a,b);
    for(const n of Object.values(a)) assert(Number.isFinite(n));
    assert(a.zoom>=1.03 && a.zoom<=1.30); assert(a.sculpture>=0 && a.sculpture<=1.11);
    assert(a.splice>=0&&a.splice<=1);assert(a.echo<=.45);
  }
});
test('splices line up with the existing six shot boundaries', () => {
  for (const cut of [0,4,10.4,16.6,22.4,28.8]) assert.equal(sampleSignalRemix(5,cut).splice,1);
  assert.equal(sampleSignalRemix(5,7).splice,0);
});
test('live overprint bridges the movie fade and preserves source-wrap continuity', () => {
  assert(sampleSignalRemix(18,31.8).bridge>.95);
  assert(sampleSignalRemix(18,0).bridge>.95);
  const a=sampleSignalRemix(18,32-1e-5),b=sampleSignalRemix(18,1e-5);
  for(const key of Object.keys(a)) assert(Math.abs(a[key]-b[key])<.0001,key);
});
test('flash reduction removes the splice/tear score, without freezing the slow camera', () => {
  const a=sampleSignalRemix(0,0,true),b=sampleSignalRemix(8,10.4,true);
  assert.equal(a.splice,0);assert.equal(b.splice,0);assert.equal(a.echo,.1);
  assert(Math.abs(a.panX)<.007);assert.notEqual(a.panX,b.panX);
});
test('cover UVs preserve video proportions on ultrawide and portrait screens',()=>{
  assert.deepEqual(signalCover(1280,720,1920,1080),[1,1]);
  assert.deepEqual(signalCover(2560,1080,1920,1080),[1,.75]);
  const portrait=signalCover(390,844,1920,1080);assert(portrait[0]<.27);assert.equal(portrait[1],1);
  assert(signalCover(0,0,0,0).every(Number.isFinite));
});
test('native media is ready before the game graph; live title optics remain optional afterwards',()=>{
  const src=readFileSync(new URL('../src/ui/bootEntry.js',import.meta.url),'utf8');
  const media=src.indexOf('await Promise.all([ring?.ready, artwork?.ready])');
  const main=src.indexOf("await import('../main.js')");
  const title=src.indexOf("import('./introSignalRemixBoot.js')");
  assert(media>=0 && main>media && title>main);
  assert(src.includes('.catch(() => { /* Decoration cannot block boot. */ });'));
  assert(!src.includes('bootstrapLoadingTerminal'));
});
test('headless/unsupported hosts keep the original movie untouched',()=>{
  assert.equal(attachIntroSignalRemix(null),null);assert.equal(installIntroSignalRemix({}),null);
  const video={parentNode:{},playbackRate:1};
  const canvas={style:{},setAttribute(){},getContext(){return null;}};
  const errors=[];
  assert.equal(attachIntroSignalRemix(video,{document:{createElement:()=>canvas},onError:e=>errors.push(e.message)}),null);
  assert.equal(video.playbackRate,1);assert.equal(errors.length,1);
});

function fixture({reduced=false,playing=true,native=false}={}) {
  const observers=[],idle=new Map();let id=0;
  class Element {
    constructor(id='') {this.id=id;this.nodeType=1;this.isConnected=true;this.hidden=false;this.style={};this.listeners=new Map();this.classes=new Set();this.classList={contains:x=>this.classes.has(x),add:x=>this.classes.add(x),remove:x=>this.classes.delete(x)};}
    addEventListener(t,fn){if(!this.listeners.has(t))this.listeners.set(t,new Set());this.listeners.get(t).add(fn);}
    removeEventListener(t,fn){this.listeners.get(t)?.delete(fn);}
    emit(t){for(const fn of [...this.listeners.get(t)||[]])fn({target:this});}
    querySelector(){return null;} matches(s){return s.includes('#'+this.id);}
    contains(e){return e===this||e===video&&this===root;}
    closest(){return root;}
  }
  const root=new Element('boot-overlay'),html=new Element('html'),video=new Element('boot-intro-video');
  video.parentNode=root;video.readyState=4;video.videoWidth=1920;video.playbackRate=1;video.paused=!playing;
  video.native=native; video.hasAttribute=name=>name==='data-boot-native'&&video.native;
  let plays=0,pauses=0;
  video.play=()=>{plays++;video.paused=false;return Promise.resolve();};
  video.pause=()=>{pauses++;video.paused=true;video.emit('pause');};
  const state={running:false,destroyed:false,resumes:0,pauses:0,preferences:[]};
  const fakeCtl={resume(){state.running=true;state.resumes++;},pause(){state.running=false;state.pauses++;},preferences(p){state.preferences.push(p);},destroy(){state.destroyed=true;state.running=false;},inspect(){return {...state};}};
  video.__sfSignalRemix=fakeCtl;
  const document=new Element('document');document.body=new Element('body');document.documentElement=html;document.hidden=false;
  document.createElement=()=>new Element();document.querySelectorAll=()=>video.isConnected?[video]:[];video.ownerDocument=document;
  const media=new Element();media.matches=reduced;
  class Observer{constructor(fn){this.fn=fn;this.active=true;observers.push(this);}observe(target){this.target=target;}disconnect(){this.active=false;}}
  const env={MutationObserver:Observer,requestAnimationFrame:fn=>{idle.set(++id,fn);return id;},cancelAnimationFrame:n=>idle.delete(n),matchMedia:()=>media,getComputedStyle:()=>({display:'block',visibility:'visible'}),addEventListener(){},removeEventListener(){}};
  const flush=()=>{const work=[...idle.values()];idle.clear();for(const fn of work)fn(0);};
  const mutate=(target,records=[])=>{for(const o of [...observers])if(o.active&&o.target===target)o.fn(records);};
  const ctl=installIntroSignalRemix(document,env);
  return {document,env,root,video,html,media,ctl,state,flush,mutate,idle,observers,counts:()=>({plays,pauses})};
}
test('shared binder installs once, initializes lazily and never owns input',()=>{
 const f=fixture();assert.strictEqual(installIntroSignalRemix(f.document,f.env),f.ctl);
 assert.equal(f.state.resumes,0);assert.equal(f.idle.size,1);f.flush();assert.equal(f.state.resumes,1);
 assert(!f.video.listeners.has('keydown'));assert(!f.video.listeners.has('click'));f.ctl.destroy();
});
test('hiding a loading host stops its video and optical frame work; show restores owned intent',()=>{
 const f=fixture();f.flush();f.root.classList.add('hidden');f.mutate(f.root);
 assert.equal(f.state.running,false);assert.equal(f.video.paused,true);
 f.root.classList.remove('hidden');f.mutate(f.root);assert.equal(f.counts().plays,1);assert.equal(f.state.running,true);f.ctl.destroy();
});
test('externally paused video is never autoplayed by decoration',()=>{
 const f=fixture();f.flush();f.video.pause();f.ctl.refresh();assert.equal(f.counts().plays,0);assert.equal(f.state.running,false);f.ctl.destroy();
});
test('initial reduced motion allocates no renderer; changing preferences is observed',()=>{
 const f=fixture({reduced:true});assert.equal(f.idle.size,0);assert.equal(f.video.paused,true);
 f.media.matches=false;f.media.emit('change');f.flush();assert.equal(f.state.running,true);
 f.html.classList.add('sf-reduce-motion');f.mutate(f.html);assert.equal(f.state.running,false);
 assert.equal(f.state.preferences.at(-1).motion,true);f.ctl.destroy();
});
test('flash reduction is a separate preference on the actual running controller',()=>{
 const f=fixture();f.flush();f.html.classList.add('sf-reduce-flash');f.mutate(f.html);
 assert.deepEqual(f.state.preferences.at(-1),{motion:false,flash:true});assert(f.state.running);f.ctl.destroy();
});
test('hidden document cancels deferred creation and cannot spend invisible frames',()=>{
 const f=fixture();f.document.hidden=true;f.document.emit('visibilitychange');assert.equal(f.idle.size,0);
 f.flush();assert.equal(f.state.resumes,0);f.document.hidden=false;f.document.emit('visibilitychange');f.flush();assert.equal(f.state.running,true);f.ctl.destroy();
});
test('video errors tear down the optional layer instead of affecting the boot owner',()=>{
 const f=fixture();f.flush();f.video.emit('error');assert.equal(f.state.destroyed,true);f.ctl.refresh();f.flush();assert.equal(f.state.resumes,1);f.ctl.destroy();
});
test('detaching a splash/boot host releases its observers, deferred callbacks and renderer',()=>{
 const f=fixture();f.flush();f.video.isConnected=false;
 f.mutate(f.document.body,[{addedNodes:[],removedNodes:[f.root]}]);assert.equal(f.state.destroyed,true);assert.equal(f.ctl.inspect().length,0);
 f.ctl.destroy();f.ctl.destroy();assert(f.observers.every(o=>!o.active));assert.equal(f.idle.size,0);
});
test('native boot media cannot acquire an opaque live optical overlay',()=>{
 const f=fixture({native:true});f.flush();f.ctl.refresh();
 assert.equal(f.ctl.inspect().length,0);assert.equal(f.idle.size,0);
 assert.equal(f.state.resumes,0);assert.equal(f.counts().pauses,0);f.ctl.destroy();
});
test('native ownership acquired before deferred init prevents the stale renderer from starting',()=>{
 const f=fixture();assert.equal(f.idle.size,1);f.video.native=true;f.flush();
 assert.equal(f.state.resumes,0);assert.equal(f.ctl.inspect().length,0);f.ctl.destroy();
});
