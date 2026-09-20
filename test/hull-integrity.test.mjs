import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SHIP_SILHOUETTES } from '../src/data/shipSilhouettes.js';
import { createIntegrityState, stepIntegrity, integrityPercent, integrityHullId,
  shipConditionMarkup, updateShipCondition, INTEGRITY_LAMINAE, INTEGRITY_TRAIL_SECONDS } from '../src/ui/views/hullIntegrity.js';
import { HULL_INTEGRITY_CSS, mountHullIntegrityStyles } from '../src/ui/views/hullIntegrityStyles.js';
const sample = (h=100,s=100,id='ship_kestrel') => ({id:'player', hull:h,hullMax:100,shield:s,shieldMax:100,data:{defId:id}});
const step = (m,p,n=1,dt=1/60,reduce=false,flash=false) => {for(let i=0;i<n;i++) stepIntegrity(m,p,dt,reduce,flash);return m;};

for (const id of Object.keys(SHIP_SILHOUETTES)) {
  test(`canonical projection and unique clip namespace: ${id}`,()=>{
    const html=shipConditionMarkup(id,'proof-'+id);
    assert.ok(html.includes(SHIP_SILHOUETTES[id]));
    assert.match(html,/matrix\(0 -2\.08 2\.08 0 40\.88 134\)/);
    assert.equal((html.match(/class="sf-integrity__lamina"/g)||[]).length,INTEGRITY_LAMINAE);
    assert.equal((html.match(/class="sf-integrity__loss"/g)||[]).length,INTEGRITY_LAMINAE);
    // Chromium cannot use a referenced group as the clipping shape. Direct paths are mandatory.
    const clip=html.match(/<clipPath[^>]*>(.*?)<\/clipPath>/s)[1];
    assert.match(clip,/<path/);assert.doesNotMatch(clip,/<use/);
    assert.doesNotMatch(html,/NaN|Infinity|<img|<canvas|<animate|<filter/);
  });
}
for (const [n,s] of [[0,'0'],[.0001,'1'],[.001,'1'],[.18,'18'],[.434,'43'],[.9999,'99'],[1,'100'],[2,'100'],[-1,'0'],[NaN,'—']])
  test(`honest rounded boundary ${n} => ${s}`,()=>assert.equal(integrityPercent(n),s));

test('unknown hull is a safe canonical fallback, never interpolated markup',()=>{
  assert.equal(integrityHullId('constructor'),'ship_kestrel');assert.equal(integrityHullId('__proto__'),'ship_kestrel');
  assert.equal(shipConditionMarkup('<script>alert(1)</script>','x'),shipConditionMarkup('ship_kestrel','x'));
});
test('default mount IDs are disjoint, while explicit namespaces are reproducible',()=>{
  assert.notEqual(shipConditionMarkup(),shipConditionMarkup());
  assert.equal(shipConditionMarkup('ship_mule','fixture'),shipConditionMarkup('ship_mule','fixture'));
});
test('the model never writes to the authoritative entity',()=>{
  const p=Object.freeze({...sample(71,30),data:Object.freeze({defId:'ship_kestrel'})});
  const m=createIntegrityState();step(m,p,200);assert.equal(p.hull,71);assert.equal(p.shield,30);
});
test('damage changes live quantities immediately; the afterimage never pretends to be health',()=>{
  const m=step(createIntegrityState(),sample());
  step(m,sample(18,0));assert.equal(m.hull,.18);assert.equal(m.shield,0);
  assert.equal(m.hullState,'critical');assert.equal(m.shieldState,'offline');
  assert.equal(m.hullTrail,1);assert.equal(m.shieldTrail,1);
  step(m,sample(18,0),60);assert.equal(m.hullTrail,.18);assert.equal(m.shieldTrail,0);
});
test('damage echo is time-based at 30, 60, 144 and 240 Hz',()=>{
  const samples=[];
  for (const fps of [30,60,144,240]) {
    const m=step(createIntegrityState(),sample());stepIntegrity(m,sample(41,21),0);
    step(m,sample(41,21),Math.round(fps*.5),1/fps);samples.push(m.hullTrail);
    step(m,sample(41,21),fps,1/fps);assert.equal(m.hullTrail,.41);
  }
  assert.ok(Math.max(...samples)-Math.min(...samples)<1e-10);
});
test('repeat hits preserve the current loss echo without reflows or timers',()=>{
  const m=step(createIntegrityState(),sample());step(m,sample(70,40),9);
  const echo=m.hullTrail;step(m,sample(40,10));assert.ok(m.hullTrail>=echo);
  step(m,sample(40,10),100);assert.equal(m.hullTrail,.4);assert.equal(m.hImpact,0);
});
test('repair never animates the actual value through fabricated intermediate HP',()=>{
  const m=step(createIntegrityState(),sample(20,20));step(m,sample(75,83));
  assert.equal(m.hull,.75);assert.equal(m.hullTrail,.75);assert.equal(m.shield,.83);assert.ok(m.repair>0);
  assert.equal(m.shieldState,'charging');step(m,sample(75,83),60);assert.equal(m.shieldState,'online');
});
test('zero means destroyed, not critically alive; a respawn resets the stale echo',()=>{
  const m=step(createIntegrityState(),sample(10,1));step(m,sample(0,0));assert.equal(m.hullState,'destroyed');
  step(m,sample(100,100));assert.equal(m.hullTrail,1);assert.equal(m.repair,0);assert.equal(m.hImpact,0);
});
test('capacity, active entity and hull changes reset presentation history',()=>{
  const m=step(createIntegrityState(),sample());step(m,sample(20,20));
  step(m,{...sample(40,10),id:'new-player'});assert.equal(m.hullTrail,.4);assert.equal(m.hImpact,0);
  step(m,{...sample(40,10,'ship_mule'),hullMax:200});assert.equal(m.hullTrail,.2);assert.equal(m.defId,'ship_mule');
});
test('missing and nonfinite telemetry never paint a full or destroyed ship',()=>{
  for (const value of [NaN,Infinity,-Infinity,undefined,null,'100']) {
    const m=step(createIntegrityState(),{...sample(),hull:value,shield:value});
    assert.equal(m.hullAvailable,false);assert.equal(m.hullState,'unavailable');assert.equal(m.hull,0);
  }
  const m=step(createIntegrityState(),null);assert.equal(m.hullState,'unavailable');
});
test('a ship without shield capacity is distinct from a depleted shield',()=>{
  const m=step(createIntegrityState(),{...sample(),shieldMax:0});assert.equal(m.shieldState,'absent');
  step(m,sample(100,0));assert.equal(m.shieldState,'offline');
});
test('negative/over-max resources clamp, while invalid capacities are unavailable',()=>{
  const m=step(createIntegrityState(),sample(-20,300));assert.equal(m.hull,0);assert.equal(m.shield,1);
  for (const max of [-1,NaN,Infinity,undefined,'100']) {
    step(m,{...sample(),hullMax:max,shieldMax:max});assert.equal(m.hullAvailable,false);assert.equal(m.shieldAvailable,false);
  }
});
test('motion reduction, flash reduction, and long-frame suspension are distinct',()=>{
  const m=step(createIntegrityState(),sample());step(m,sample(20,20),1,1/60,true,false);
  assert.equal(m.hullTrail,.2);assert.equal(m.flashes,false);assert.equal(m.motion,false);
  step(m,sample(10,10),1,1/60,false,true);assert.ok(m.hullTrail>.1);assert.equal(m.flashes,false);assert.equal(m.motion,true);
  step(m,sample(10,10),1,3);assert.equal(m.hullTrail,.1);assert.equal(m.hImpact,0);
  step(m,sample(80,80),1,3);assert.equal(m.repair,0);assert.equal(m.recharge,0);
  assert.equal(m.hullTrail,.8);assert.equal(m.shieldTrail,.8);
});

function instrument(id='ship_kestrel') {
  const stats={writes:0,queries:0,rebuilds:0};
  const node=()=>{const attrs=new Map();let content='',html='';return {
    getAttribute:k=>attrs.get(k)??null,setAttribute(k,v){attrs.set(k,String(v));stats.writes++;},
    removeAttribute(k){attrs.delete(k);stats.writes++;},
    get textContent(){return content;},set textContent(v){content=String(v);stats.writes++;},
    get innerHTML(){return html;},set innerHTML(v){html=String(v);stats.rebuilds++;},
  };};
  const host=node(),nodes={},groups={};host.classList={add(){}};
  for (const k of ['art','geometry','identity','hull-readout','shield-readout','hull-state','shield-state','shield-value','rail-fill','impact','repair']) nodes['.sf-integrity__'+k]=node();
  for(const [k,n]of[['lamina',16],['loss',16],['envelope',2],['envelope-echo',2],['figures path',3]]) groups['.sf-integrity__'+k]=Array.from({length:n},node);
  const art=nodes['.sf-integrity__art'];art.setAttribute('data-integrity-prefix','mock');art.setAttribute('data-integrity-hull',id);
  host.querySelector=k=>{stats.queries++;return nodes[k]??null;};host.querySelectorAll=k=>{stats.queries++;return groups[k]||[];};
  const q=k=>nodes['.sf-integrity__'+k];
  return {host,stats,q,groups};
}
test('10,000 steady-state updates cause zero DOM mutations, selectors or subtree replacements',()=>{
  const i=instrument(),p=sample(86,78);updateShipCondition(i.host,p,1/60);
  Object.assign(i.stats,{writes:0,queries:0,rebuilds:0});
  for(let n=0;n<10000;n++) updateShipCondition(i.host,p,1/60);
  assert.deepEqual(i.stats,{writes:0,queries:0,rebuilds:0});
});
test('health mutation keeps every live node; the two accessible meters report actual values',()=>{
  const i=instrument(),p=sample();updateShipCondition(i.host,p,1/60);
  Object.assign(i.stats,{writes:0,queries:0,rebuilds:0});p.hull=18;p.shield=0;updateShipCondition(i.host,p,1/60);
  assert.equal(i.q('hull-readout').getAttribute('role'),'meter');assert.equal(i.q('hull-readout').getAttribute('aria-valuenow'),'18');
  assert.equal(i.q('shield-readout').getAttribute('aria-valuenow'),'0');assert.equal(i.q('hull-state').textContent,'CRITICAL');
  assert.equal(i.stats.rebuilds,0);assert.equal(i.stats.queries,0);assert.equal(i.host.getAttribute('role'),'group');
});
test('critical recovery does not replace the safety warning with a repair label',()=>{
  const i=instrument(),p=sample(10,0);updateShipCondition(i.host,p,1/60);p.hull=18;updateShipCondition(i.host,p,1/60);
  assert.equal(i.q('hull-state').textContent,'CRITICAL');
});
test('the first sample can have a different hull than the initial markup',()=>{
  const i=instrument();updateShipCondition(i.host,sample(86,72,'ship_mule'),1/60);
  assert.equal(i.stats.rebuilds,1);assert.match(i.q('geometry').innerHTML,/M4 9h11/);
  assert.equal(i.host.getAttribute('data-hull-id'),'ship_mule');
});
test('disappearance clears accessible ranges; reappearance restores valid meters',()=>{
  const i=instrument();updateShipCondition(i.host,sample(),0);updateShipCondition(i.host,null,1/60);
  assert.equal(i.q('hull-readout').getAttribute('role'),'img');assert.equal(i.q('hull-readout').getAttribute('aria-valuenow'),null);
  assert.equal(i.q('hull-state').textContent,'NO DATA');updateShipCondition(i.host,sample(),0);
  assert.equal(i.q('hull-readout').getAttribute('role'),'meter');assert.equal(i.q('hull-readout').getAttribute('aria-valuenow'),'100');
});
test('zero-capacity accessibility says not fitted, and unsafe IDs cannot become labels',()=>{
  const i=instrument();updateShipCondition(i.host,{...sample(50,0,'<bad>'),shieldMax:0},0);
  assert.equal(i.q('shield-readout').getAttribute('aria-label'),'Shield not fitted');
  assert.equal(i.q('identity').textContent,'UNLISTED');
});
test('style owner is once per document and accepts headless rendering',()=>{
  assert.doesNotThrow(()=>mountHullIntegrityStyles(null));let count=0;const stored=new Map();
  const doc={getElementById:id=>stored.get(id),createElement:()=>({}),head:{appendChild(n){count++;stored.set(n.id,n);}}};
  mountHullIntegrityStyles(doc);mountHullIntegrityStyles(doc);assert.equal(count,1);
});

// INF-051 state grammar: shield-down, hull-critical and safe regeneration are different by PLACE and
// SHAPE, not three shades of one mark. Vestigial/overlapping decoration is gone from the markup.
test('the three urgent states own different marks in different places',()=>{
  const css=HULL_INTEGRITY_CSS.replace(/\/\*[\s\S]*?\*\//g,'');
  const html=shipConditionMarkup('ship_kestrel','grammar');
  // offline: amber break marks cut the envelope at the waist (outside the hull), gate on data-shield
  assert.match(html,/sf-integrity__shield-break" d="M16 83l11 9M27 83l-11 9M112 83l11 9M123 83l-11 9"/);
  assert.match(css,/\.sf-integrity\[data-shield="offline"\] \.sf-integrity__shield-break \{ display:block/);
  assert.match(css,/\.sf-integrity\[data-shield="offline"\] \.sf-integrity__shield-state \{ color:var\(--si-warning\)/);
  // charging: bone feed-chevrons above the shoulders, gated on data-shield
  assert.match(html,/sf-integrity__recharge" d="M65 13l5 5 5-5M65 20l5 5 5-5"/);
  assert.match(css,/\.sf-integrity \.sf-integrity__recharge \{ fill:none; stroke:var\(--si-paper\); stroke-width:2; display:none/);
  assert.match(css,/\.sf-integrity\[data-shield="charging"\] \.sf-integrity__recharge \{ display:block/);
  // critical/destroyed: the silhouette outline itself goes danger red
  assert.match(css,/\.sf-integrity\[data-hull="critical"\] \.sf-integrity__outline,[\s\S]*?\{ stroke:var\(--si-danger\); stroke-width:\.9/);
});
test('vestigial marks are gone and no datum overlaps the projected hull',()=>{
  const html=shipConditionMarkup('ship_kestrel','vestige');
  assert.ok(!html.includes('sf-integrity__signal-mark'),'retired decorative chevrons removed from markup');
  assert.ok(!HULL_INTEGRITY_CSS.includes('signal-mark'),'retired decorative chevron rule removed');
  // the projection puts the nose tip at (70, 34.2); the datum set must not draw inside the hull box
  const datum=html.match(/sf-integrity__datum" d="([^"]+)"/)[1];
  assert.ok(!/M70 27v9/.test(datum),'nose tick removed');
  for (const seg of datum.match(/M[^M]+/g)) {
    const nums=seg.match(/-?\d+(?:\.\d+)?/g).map(Number);
    for (let i=0;i<nums.length;i+=2) {
      const x=nums[i],y=nums[i+1];
      assert.ok(!(x>40&&x<100&&y>34&&y<134),'datum point '+x+','+y+' overlaps the hull projection');
    }
  }
});
test('the deck pass keeps the critical alarm loud and drops the retired rule',()=>{
  const source=readFileSync(new URL('../src/ui/views/hudStyles.js',import.meta.url),'utf8');
  assert.ok(!source.includes('sf-integrity__signal-mark'),'deck rule for retired mark removed');
  assert.match(source,/sf-integrity:is\(\[data-hull="critical"\], \[data-hull="destroyed"\]\) \{ --si-signal:var\(--dp-danger-hot\)/,
    'critical/destroyed state word + figures step to danger despite the ink remap');
});
test('production scope has no new animation loop, layout flush, network, filters, or sim writes',()=>{
  const source=readFileSync(new URL('../src/ui/views/hullIntegrity.js',import.meta.url),'utf8');
  assert.doesNotMatch(source,/requestAnimationFrame\s*\(|setTimeout\s*\(|setInterval\s*\(|getBoundingClientRect\s*\(|offsetWidth|fetch\s*\(|Math\.random\s*\(/);
  assert.doesNotMatch(HULL_INTEGRITY_CSS.replace(/\/\*[\s\S]*?\*\//g,''),/backdrop-filter\s*:|filter\s*:\s*(?:blur|url|drop-shadow)|infinite/);
  assert.match(HULL_INTEGRITY_CSS,/forced-colors:active/);assert.match(HULL_INTEGRITY_CSS,/sf-reduce-flash/);
  assert.ok(INTEGRITY_TRAIL_SECONDS<1);
});
