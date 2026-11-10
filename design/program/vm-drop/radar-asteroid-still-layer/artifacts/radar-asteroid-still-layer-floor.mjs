import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const PAIRS = 11;
const RUNS = 5;
const worker = `
import { performance } from 'node:perf_hooks';
import {
  censusRadarAsteroidStillLayer,
  createRadarAsteroidStillCache,
  setRadarAsteroidStillLayerForBench,
} from '../src/ui/radar.js';
const ITERS = 60000, WARM = 1200;
const CELLS = 9, DOT = 14, SIZE = 220, CENTER = 110, RANGE = 4000;
const radarScale = 105 / RANGE, rangeSq = RANGE * RANGE;
const live = [], field = [];
for (let i = 0; i < 11; i++) live.push({ id: i+1, type:'asteroid', alive:true, pos:{x:80+i*30,z:i*20}, fieldResident:false });
for (let i = 0; i < 200; i++) field.push({ id:1000+i, type:'asteroid', alive:true, pos:{x:Math.cos(i)*(200+i*8),z:Math.sin(i)*(200+i*8)}, fieldResident:true });
const asteroidSource = [...live, ...field];
const entities = { get(id){ for (const r of live) if (r.id===id) return r; return null; } };
const player = { id:0 };
function buf(){ return { fieldCellCounts:new Uint16Array(CELLS*CELLS), nearRockSlots:Array.from({length:DOT},()=>({x:0,y:0,distanceSq:Infinity})), cache:createRadarAsteroidStillCache() }; }
function go(b,x,z){ return censusRadarAsteroidStillLayer({ asteroidSource, player, playerX:x, playerZ:z, range:RANGE, rangeSq, radarScale, center:CENTER, size:SIZE, targetId:null, fieldVersion:1, indexVersion:1, entities, fieldCellCounts:b.fieldCellCounts, nearRockSlots:b.nearRockSlots, cache:b.cache }); }
function us(setup, body){ setup(); for(let i=0;i<WARM;i++) body(); if (global.gc) global.gc(); const t0=performance.now(); for(let i=0;i<ITERS;i++) body(); return ((performance.now()-t0)*1000)/ITERS; }
const pairs = [];
for (let p = 0; p < ${PAIRS}; p++) {
  const before = buf(), after = buf();
  const px = 120, pz = 40;
  setRadarAsteroidStillLayerForBench(true); go(after, px, pz);
  const bUs = us(()=>{ setRadarAsteroidStillLayerForBench(false); before.cache.armed=false; }, ()=>go(before,px,pz));
  const aUs = us(()=>{ setRadarAsteroidStillLayerForBench(true); }, ()=>go(after,px,pz));
  pairs.push({ beforeUs:+bUs.toFixed(4), afterUs:+aUs.toFixed(4), speedup:+(bUs/aUs).toFixed(3) });
}
const speedups = pairs.map(p=>p.speedup).sort((a,b)=>a-b);
const mid = speedups[Math.floor(speedups.length/2)];
console.log(JSON.stringify({ pairs, median:mid, min:speedups[0], max:speedups[speedups.length-1] }));
`;

writeFileSync('artifacts/_radar-still-floor-worker.mjs', worker);
const runs = [];
for (let r = 0; r < RUNS; r++) {
  const res = spawnSync(process.execPath, ['--expose-gc', 'artifacts/_radar-still-floor-worker.mjs'], {
    encoding: 'utf8',
    cwd: process.cwd(),
  });
  if (res.status !== 0) {
    console.error(res.stderr || res.stdout);
    process.exit(1);
  }
  const line = res.stdout.trim().split('\n').filter(Boolean).pop();
  const parsed = JSON.parse(line);
  runs.push(parsed);
  console.log(`run${r + 1}`, { median: parsed.median, min: parsed.min, max: parsed.max });
}
const medians = runs.map((r) => r.median);
const mins = runs.map((r) => r.min);
const summary = {
  label: 'radar-asteroid-still-layer-floor',
  runs: RUNS,
  pairsPerRun: PAIRS,
  medians,
  mins,
  medianOfMedians: medians.slice().sort((a, b) => a - b)[Math.floor(medians.length / 2)],
  floorMinSpeedup: Math.min(...mins),
};
writeFileSync('artifacts/radar-asteroid-still-layer-floor-summary.json', JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
