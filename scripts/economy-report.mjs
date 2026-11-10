#!/usr/bin/env node
/** Auditable, dependency-free projections of the model. This does not claim observed progression. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {ECONOMY_BALANCE as B} from '../src/data/economyDerived.js';
import {quoteMissionEconomics} from '../src/economy/economyMissionTerms.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.resolve(process.argv[2] || path.join(root,'economy-model-report'));
const catalog=JSON.parse(await readFile(path.join(root,'tests/fixtures/catalog-contract.json'),'utf8'));
const commodities=catalog.commodities.map(c=>{
  const model=B.commodities[c.id];
  const exclusiveConsumers=(c.consumedBy||[]).filter(role=>!(c.producedBy||[]).includes(role));
  return {id:c.id,name:c.name,legality:c.legality,marketTier:c.marketTier??0,
    producedBy:c.producedBy,consumedBy:c.consumedBy,volPerU:c.volPerU,
    ...model,referenceHold:B.phases[model.economyTier].referenceHold,
    referenceRolesExist:!!exclusiveConsumers.length,
    warning:exclusiveConsumers.length?null:'No exclusive consumer role in this catalog: the idealized reference trading route is NOT a demonstrated production route.'};
});
const techMap=new Map(catalog.tech.map(t=>[t.id,t]));
function pathIds(id,set=new Set()) {
  if(set.has(id))return set;set.add(id);
  for(const p of techMap.get(id).prereqs)pathIds(p,set);
  return set;
}
const technology=catalog.tech.map(t=>{
  const ancestors=[...pathIds(t.id)];
  return {id:t.id,name:t.name,prereqs:t.prereqs,...B.tech[t.id],
    pathIds:ancestors,pathCredits:ancestors.reduce((n,id)=>n+B.tech[id].credits,0),
    pathRp:ancestors.reduce((n,id)=>n+B.tech[id].rp,0),
    interpretation:'Unlock-only cost; physical hardware, fitting, travel, availability and actual RP income are not included.'};
});
const missionExamples=[];
for(let tier=0;tier<B.phases.length;tier++)for(const type of Object.keys(B.mission.work)) {
  const params={qty:24,cmdtyId:'cmdty_fuel_cells',clearCount:3,scanTargets:2,targetStrength:1.5};
  missionExamples.push(quoteMissionEconomics({type,tier,riskTier:Math.min(tier,4),distance:1800,params,
    preloadedCargo:type==='cargo_delivery'}));
}
const report={schema:1,modelVersion:B.version,
  scope:'Normative design targets and mathematical reference books, not observed full-game affordances.',
  assumptions:{phases:B.phases,market:B.market,resource:B.resource,mission:B.mission},
  commodities,technology,missionExamples,
  warnings:[
    'Reference travel/work times and success probabilities need calibration from the native six-career battery.',
    'Resource reservations do not create reachable rocks: the world owner must publish and acknowledge them.',
    'Real station size, authored equilibrium overrides, demand, reputation, customs and conversion recipes can change these reference margins.',
    'Zero-RP roots remove an unlock gate; they do not fit hardware or create a repeatable RP source.',
    'The 72,000cr/h enterprise phase requires appropriate high-tier work; it is not a passive or elapsed-time stipend.',
  ]};
await mkdir(output,{recursive:true});
await writeFile(path.join(output,'model-audit.json'),JSON.stringify(report,null,2)+'\n');
const fmt=n=>Number(n).toLocaleString('en-US',{maximumFractionDigits:2});
const lines=[
 '# Economic model audit','',
 'Generated from the committed authoring model. Targets and reference books are not measured gameplay.',
 '', '## Phase budgets','',
 '| Opportunity phase | Net cr/hour | Operating fraction | Assumed RP/hour | Reference hold volume |',
 '|---|---:|---:|---:|---:|',
 ...B.phases.map(p=>`| ${p.id} | ${fmt(p.netCrPerHour)} | ${fmt(100*p.operatingFraction)}% | ${p.rpPerHour} | ${p.referenceHold} |`),
 '', '## All 47 commodities','',
 'Working capital is for the idealized steady producer-to-consumer lot. Extraction has no cargo-purchase principal. Local overrides and recipe economics must be audited separately.',
 '', '| Commodity | Tier | Lot / volume | Price cr/u | Half-life s | Steady reference net cr/h | Working capital cr |',
 '|---|---:|---:|---:|---:|---:|---:|',
 ...commodities.map(c=>`| ${c.name} | ${c.economyTier} | ${c.lotUnits} / ${fmt(c.lotVolume)} | ${fmt(c.basePrice)} | ${fmt(c.recoveryHalfLifeS)} | ${fmt(c.referenceNetCrPerHour)} | ${fmt(c.workingCapitalCr)} |`),
 '', '### Catalog role exceptions','',
 ...commodities.filter(c=>c.warning).map(c=>`- **${c.name} (${c.id}):** ${c.warning}`),
 '', '## All 32 technology unlocks','',
 'Path totals count each unique prerequisite once. A path total is not a first-purchase timestamp or fitted-ship value.',
 '', '| Technology | Tier | Marginal cr / RP | Unique prerequisite path cr / RP |',
 '|---|---:|---:|---:|',
 ...technology.map(t=>`| ${t.name||t.id} | ${t.tier} | ${fmt(t.credits)} / ${fmt(t.rp)} | ${fmt(t.pathCredits)} / ${fmt(t.pathRp)} |`),
 '', '## Calibration gates','',...report.warnings.map(w=>'- '+w),'',
 'The JSON companion contains every intermediate assumption and 90 illustrative contract quotes. Authored set-piece examples are reference calculations, not repricing of accepted authored missions.','',
];
await writeFile(path.join(output,'MODEL-AUDIT.md'),lines.join('\n'));
console.log(`Wrote model audit: ${commodities.length} commodities, ${technology.length} unlocks, ${missionExamples.length} example quotes.`);
