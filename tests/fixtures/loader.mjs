/** Explicit TEST-ONLY dependencies omitted from the supplied packet.
 * The real packet economy, cycles, contracts, catalogs and all new modules execute unmodified.
 * Missing unlisted imports fail; this is not a substitute full game and is NEVER a runtime loader.
 */
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const fixture=pathToFileURL(path.join(root,'tests/fixtures/world.mjs')).href;
const rng=pathToFileURL(path.join(root,'tests/fixtures/rng.mjs')).href;
const modules={
 'data/commodityFlavor.js': `export const COMMODITY_FLAVOR={};`,
 'data/commodityMoralTags.js':`export const COMMODITY_MORAL_TAGS={}; export const MORAL_TAGS={};`,
 'data/sectors.js':`export {SECTORS} from '${fixture}';`,
 'data/factions.js':`export const FACTION_META=[{id:'faction_scn',name:'Fixture Coalition'}];`,
 'data/factionPresence.js':`export const presenceServiceForStation=()=>null;`,
 'data/frontierRumors.js':`export const TETHYS_BLACK_MARKET_RUN={stationId:'fixture_locked'};export const hasTethysBlackMarketAccess=()=>true;`,
 'data/killRewards.js':`export const KILL_REWARD_RECIPES={light:{creditChips:{count:1,amountMin:60,amountMax:120}}};`,
 'data/researchGrants.js':`export const RESEARCH_GRANTS={'signal:investigated':{rp:3},'anomaly:triangulated':{rp:3}};`,
 'data/techVerbLadder.js':`export const FIRST_UPGRADE={};export const FIRST_UPGRADE_MINUTES={};export const TARGET_FIRST_UPGRADE_MINUTES=15;export const TECH_VERB_LADDER=[];export const VERB_LADDER_RATES={creditsPerHour:3750,rpPerHour:12};export const assertCommittedLadder=()=>{throw Error('Legacy ladder outside fixture')};export const purchaseAffordableTech=assertCommittedLadder;export const treePathCost=assertCommittedLadder;export const verbIdsOf=assertCommittedLadder;`,
 'core/rng.js':`export {hash32,mulberry32,drawSeeded} from '${rng}';`,
 'core/livingHull.js':`export const livingHullGrimeAt=()=>0;`,
 'systems/cargo.js':`export {addCargo,removeCargo,isUnsellableCargo} from '${fixture}';`,
 'systems/cargoCustody.js':`export const ensureCommittedIntents=s=>(s.economy.committedIntents ||= {});`,
 'systems/factions.js':`export const priceModForState=s=>s.fixtureStanding || {buy:1,sell:1,surchargeWaived:false};`,
 'systems/sectorSim.js':`export const sectorSignalFor=(s,id)=>s.fixtureSignals?.[id] || null;export const effectiveDangerTierFor=(s,id)=>s.fixtureRisk?.[id] || 0;`,
 'economy/customsRisk.js':`export const hiddenHoldCapacity=()=>0;export const remainingIllicit=()=>0;export const scanChance=()=>0;export const hotUntilActive=()=>false;export const HOT_DURATION_S=90;`,
 'economy/regionalSupply.js':`export const allRegionalPressureRecipes=()=>({});`,
 'economy/demandModel.js':`export const applyPersistentDemand=(price,mult)=>price*(Number.isFinite(mult)?Math.max(.72,Math.min(1.45,mult)):1);export const effectiveDemandFor=({state,sectorId})=>({multiplier:state.fixtureDemand?.[sectorId] || 1,drivers:[]});`,
};
export async function resolve(specifier,context,next) {
  if(context.parentURL && (specifier.startsWith('.') || specifier.startsWith('file:'))) {
    const url=new URL(specifier,context.parentURL);
    const rel=path.relative(path.join(root,'src'),fileURLToPath(url)).replaceAll(path.sep,'/');
    if(Object.hasOwn(modules,rel)) return {url:'data:text/javascript,'+encodeURIComponent(modules[rel]),shortCircuit:true};
  }
  return next(specifier,context);
}
