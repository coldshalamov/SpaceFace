import test from 'node:test';
import assert from 'node:assert/strict';
import { getBootVisualizer } from '../src/ui/bootVisualizer.js';

function fixture() {
  class Element extends EventTarget {
    constructor() { super(); this.style = {}; this.dataset = {}; this.attrs = new Map(); this.classes = new Set();
      this.classList = { contains: v => this.classes.has(v), add: v => this.classes.add(v), remove: v => this.classes.delete(v) }; }
    setAttribute(k,v) { this.attrs.set(k,v); } querySelector() { return null; } insertBefore() {}
  }
  class Video extends Element {
    constructor() { super(); this.currentTime = 0; this.duration = 17.5; this.readyState = 4; this.paused = true; this.loads = 0; this.frames = new Map(); this.serial = 0; }
    play() { this.paused = false; return Promise.resolve(); } pause() { this.paused = true; } load() { this.loads++; }
    requestVideoFrameCallback(fn) { this.frames.set(++this.serial,fn); return this.serial; }
    cancelVideoFrameCallback(id) { this.frames.delete(id); }
    present(t) { this.currentTime = t; const work = [...this.frames.values()]; this.frames.clear(); for (const fn of work) fn(0,{mediaTime:t}); }
  }
  const overlay=new Element(), video=new Video(), html=new Element(), document=new Element(), host=new Element();
  const timers=new Map(); let timer=0;
  Object.assign(host,{setTimeout:fn=>{timers.set(++timer,fn);return timer;},clearTimeout:id=>timers.delete(id),
    setInterval:fn=>{timers.set(++timer,fn);return timer;},clearInterval:id=>timers.delete(id),matchMedia:()=>null});
  Object.assign(document,{defaultView:host,documentElement:html,hidden:false,createElement:()=>new Element(),
    getElementById:id=>id==='boot-overlay'?overlay:id==='boot-intro-video'?video:null});
  const stats={starts:0,stops:0,destroys:0,creates:0,arguments:null};
  const module={ensureBootTerminalCanvas:()=>new Element(),createTerminalArtwork:args=>{
    stats.creates++;stats.arguments=args;
    return {start(){stats.starts++;},stop(){stats.stops++;},destroy(){stats.destroys++;},updateProgress(){}};
  }};
  return {document,host,overlay,video,html,timers,stats,module,error:()=>video.dispatchEvent(new Event('error'))};
}
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};

test('entry and presenter acquire one native owner, not two competing renderers',async()=>{
 const f=fixture();const a=getBootVisualizer(f.document),b=getBootVisualizer(f.document);
 assert.equal(a,b);a.start();f.video.present(1);f.video.present(1.1);await a.ready;
 for(let i=0;i<100;i++){b.start();b.updateProgress({progress:i/100});}
 assert.equal(f.video.loads,1);assert.equal(f.video.currentTime,1.1);assert.equal(f.video.attrs.get('data-boot-native'),'true');
 a.destroy();assert.equal(f.timers.size,0);assert.notEqual(getBootVisualizer(f.document),a);
 getBootVisualizer(f.document).destroy();
});
test('actual media failure exposes the preserved worker instead of hiding it behind a poster',async()=>{
 const f=fixture();const a=getBootVisualizer(f.document,{loadArtwork:async()=>f.module});a.start();f.error();f.error();await flush();
 assert.equal(f.stats.creates,1);assert.equal(f.stats.arguments.force2D,true);assert.equal(f.stats.arguments.overlay,null);
 assert.equal(f.video.style.visibility,'hidden');assert.equal(f.overlay.classList.contains('boot-video-live'),false);
 assert.equal(f.stats.starts,1);a.stop();assert(f.stats.stops>0);a.destroy();assert.equal(f.stats.destroys,1);
});
test('a fallback import completing after destruction cannot allocate a renderer',async()=>{
 const f=fixture();let resolve;const pending=new Promise(r=>{resolve=r;});
 const a=getBootVisualizer(f.document,{loadArtwork:()=>pending});a.start();f.error();f.error();await flush();
 a.destroy();resolve(f.module);await flush();assert.equal(f.stats.creates,0);assert.equal(f.timers.size,0);
});
test('a fallback import completing after hide cannot restart invisible artwork',async()=>{
 const f=fixture();let resolve;const pending=new Promise(r=>{resolve=r;});
 const a=getBootVisualizer(f.document,{loadArtwork:()=>pending});a.start();f.error();f.error();await flush();
 a.stop();resolve(f.module);await flush();assert.equal(f.stats.creates,0);a.destroy();
});
test('reduced flash never creates the live normal-art fallback',async()=>{
 const f=fixture();f.html.classList.add('sf-reduce-flash');
 const a=getBootVisualizer(f.document,{loadArtwork:async()=>f.module});a.start();f.error();await flush();
 assert.equal(f.stats.creates,0);assert.equal(a.inspect().status,'fallback');a.destroy();
});
test('page visibility holds and restores native playback without changing its source',async()=>{
 const f=fixture();const a=getBootVisualizer(f.document);a.start();await flush();f.video.present(3);f.video.present(3.1);
 f.document.hidden=true;f.document.dispatchEvent(new Event('visibilitychange'));assert(f.video.paused);
 f.document.hidden=false;f.document.dispatchEvent(new Event('visibilitychange'));assert(!f.video.paused);
 assert.equal(f.video.loads,1);assert.equal(f.video.currentTime,3.1);a.destroy();
});
