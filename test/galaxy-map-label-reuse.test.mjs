import assert from 'node:assert/strict';
import test from 'node:test';
import { galaxyMapScreen, mapLabelPriority } from '../src/ui/galaxyMap.js';
import { placeChartLabels } from '../src/ui/orrery/chartLabels.js';

function fixture() {
  return {
    candidates: [
      { id:'station:home', kind:'station', x:85, y:90, anchorRadius:8, width:64, height:21,
        text:'Home', lines:['Home'], color:'#eee', metadata:{source:'survey'} },
      { id:'gate', kind:'gate', x:215, y:155, anchorRadius:9, width:60, height:21,
        text:'Gate', lines:['Gate'], alts:[{width:40,height:36,lines:['Gate','Alpha'],nameLines:2}] },
    ],
    options: { reserved:[{x:0,y:0,width:16,height:200}], discs:[{x:180,y:50,r:12}],
      rings:[{x:210,y:150,r:40,clear:3}], segments:[{x1:80,y1:90,x2:215,y2:155}] },
  };
}

function owner() {
  const chart=Object.create(galaxyMapScreen);
  Object.assign(chart, { _visible:true, _zoom:0.1, _root:{}, _ctx:{state:{}},
    _labelSolveReuse:null, _clickTargets:[], _youScreen:null, _line:null, _hoverTarget:null,
    _lastReadingRect:null, _previewPts:[], _edgeScalePxPerWU:0,
    _bounds:{x:0,y:0,width:400,height:280},
    _clearField() { return this._bounds; }, _edgeScaleReservedRect() { return null; },
    _reservedLabelRects(w,h,extra) { return extra; },
  });
  return chart;
}

const solve=(chart,input)=>chart._placeLabels(input.candidates,400,280,input.options);
function reference(chart,input,eligible) {
  const marks=chart._clickTargets.filter(t=>t.kind!=='zone' && !t.edgeTick
    && Number.isFinite(t.sx) && Number.isFinite(t.sy))
    .map(t=>({x:t.sx,y:t.sy,r:Math.min(44,Math.max(6,(t.radiusPx||10)-2))}));
  if(chart._youScreen) marks.push({x:chart._youScreen.x,y:chart._youScreen.y,r:16});
  const reach=[chart._hoverTarget?.id,chart._line?.snap?.id].filter(id=>id!=null).map(id=>':'+id);
  const candidates=reach.length ? input.candidates.map(c=>reach.some(tail=>String(c.id||'').endsWith(tail))?{...c,force:true}:c) : input.candidates;
  return placeChartLabels(candidates,{bounds:chart._bounds,...input.options,
    discs:marks.concat(input.options.discs),maxLeader:64,priorityOf:mapLabelPriority,eligible});
}

test('identical fresh Galaxy inputs reuse one solve while results and nested input bindings stay fresh',()=>{
  const chart=owner(), firstInput=fixture(), first=solve(chart,firstInput);
  const saved=chart._labelSolveReuse;
  assert.ok(saved);
  const expected=structuredClone(first);
  const firstHome=first.find(p=>p.id==='station:home');
  firstHome.x=-999;
  firstHome.lines[0]='mutated prior result';
  firstHome.metadata.source='mutated prior input';
  const current=fixture(), next=solve(chart,current);
  assert.equal(chart._labelSolveReuse,saved);
  assert.deepEqual(next,expected);
  assert.notEqual(next,first);
  assert.notEqual(next[0],first[0]);
  const nextHome=next.find(p=>p.id==='station:home');
  assert.equal(nextHome.lines,current.candidates[0].lines);
  assert.equal(nextHome.metadata,current.candidates[0].metadata);
  assert.notEqual(nextHome.metadata,firstInput.candidates[0].metadata);
  assert.notEqual(chart._readingObstacles.labels,saved.snapshot.placed);
});

test('every changed placement input recomputes the original result without quantization',()=>{
  const changes=[
    i=>{i.candidates[0].x+=0.00001;}, i=>{i.candidates[0].y+=1;},
    i=>{i.candidates[0].text='Harbour';}, i=>{i.candidates[0].lines[0]='Harbour';},
    i=>{i.candidates[0].width+=8;}, i=>{i.candidates[0].height+=4;},
    i=>{i.candidates[1].alts[0].width+=4;}, i=>{i.candidates[0].selected=true;},
    i=>{i.candidates[0].color='#f00';}, i=>{i.options.reserved[0].width+=60;},
    i=>{i.options.discs[0].r+=5;}, i=>{i.options.rings[0].r+=5;},
    i=>{i.options.segments[0].x2+=30;},
    (i,c)=>{c._hoverTarget={id:'home'};},
    (i,c)=>{c._youScreen={x:100,y:110};},
    (i,c)=>{c._clickTargets=[{sx:130,sy:120,radiusPx:18}];},
    (i,c)=>{c._bounds={...c._bounds,width:350};},
  ];
  for(const change of changes){
    const chart=owner();solve(chart,fixture());const saved=chart._labelSolveReuse;
    const input=fixture();change(input,chart);
    const expected=reference(chart,input,saved.eligible);
    assert.deepEqual(solve(chart,input),expected);
    assert.notEqual(chart._labelSolveReuse,saved);
  }
});

test('input alias topology and non-JSON scalar distinctions remain part of exact equality',()=>{
  const chart=owner(), input=fixture();
  input.candidates[0].metadata={n:NaN,z:-0,u:undefined};
  input.candidates[1].metadata=input.candidates[0].metadata;
  solve(chart,input);const saved=chart._labelSolveReuse;
  const same=structuredClone(input), out=solve(chart,same);
  assert.equal(chart._labelSolveReuse,saved);
  assert.equal(out[0].metadata,same.candidates[0].metadata);
  assert.equal(out[1].metadata,same.candidates[0].metadata);
  const unshared=structuredClone(input);unshared.candidates[1].metadata={...unshared.candidates[0].metadata};
  solve(chart,unshared);assert.notEqual(chart._labelSolveReuse,saved);
  let prior=chart._labelSolveReuse;
  unshared.candidates[0].metadata.z=0;solve(chart,unshared);assert.notEqual(chart._labelSolveReuse,prior);
  prior=chart._labelSolveReuse;
  delete unshared.candidates[0].metadata.u;solve(chart,unshared);assert.notEqual(chart._labelSolveReuse,prior);
});

test('policy identities, owner changes and non-Galaxy views cannot consume another solve',()=>{
  const chart=owner();solve(chart,fixture());let prior=chart._labelSolveReuse;
  prior.priorityOf=()=>-1;solve(chart,fixture());assert.notEqual(chart._labelSolveReuse,prior);
  prior=chart._labelSolveReuse;prior.eligible=()=>false;solve(chart,fixture());assert.notEqual(chart._labelSolveReuse,prior);
  for(const field of ['_root','_ctx']){
    prior=chart._labelSolveReuse;chart[field]=field==='_ctx'?{state:{}}:{};
    solve(chart,fixture());assert.notEqual(chart._labelSolveReuse,prior);
  }
  prior=chart._labelSolveReuse;chart._ctx.state={};solve(chart,fixture());assert.notEqual(chart._labelSolveReuse,prior);
  chart._zoom=20;solve(chart,fixture());assert.equal(chart._labelSolveReuse,null);
  chart._zoom=0.1;solve(chart,fixture());assert.ok(chart._labelSolveReuse);
  chart._visible=false;solve(chart,fixture());assert.equal(chart._labelSolveReuse,null);
});

test('unsupported input data keeps original solve semantics without extra getter calls',()=>{
  const chart=owner(), input=fixture();let reads=0;
  Object.defineProperty(input.candidates[0],'metadata',{enumerable:true,get(){reads++;return 'current';}});
  solve(chart,input);assert.equal(reads,1);assert.equal(chart._labelSolveReuse,null);
  solve(chart,input);assert.equal(reads,2);assert.equal(chart._labelSolveReuse,null);
  input.candidates[1].metadata=()=>1;
  const result=solve(chart,input);
  assert.equal(result.find(p=>p.id==='gate').metadata,input.candidates[1].metadata);
  assert.equal(chart._labelSolveReuse,null);
});

test('hide and remount retire the retained placement graph',()=>{
  const chart=owner();solve(chart,fixture());assert.ok(chart._labelSolveReuse);
  chart._unsubscribeKills=()=>{};chart._rememberScreenState=()=>{};chart._hub=null;
  chart.onHide();assert.equal(chart._labelSolveReuse,null);
  chart._visible=true;solve(chart,fixture());assert.ok(chart._labelSolveReuse);
  chart.mount(null,{state:{}});assert.equal(chart._labelSolveReuse,null);
});
