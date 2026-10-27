#!/usr/bin/env node
// Focused production-module test. Dependency adapters model candidate sources;
// they do not replace gatherPhysicalCandidates or schedule/drain blast logic.
// Run: node --experimental-vm-modules scripts/test-furnace-fauna-blast.mjs
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
if (!vm.SourceTextModule) {
  const result = spawnSync(process.execPath, ['--experimental-vm-modules', ...process.argv.slice(1)], { stdio: 'inherit' });
  process.exit(result.status ?? 1);
}
const context = vm.createContext({});
const adapters = {
  hasActiveSpatialHash: hash => !!(hash?.diagnostics?.activeBuckets > 0),
  queryCombatTableEntities: (state, x, z, radius, out) => out.push(...(state.tableBodies || [])),
  COMBAT_TABLE_FLAGS: { SHIP: 1, PROJECTILE: 2, WRECK: 8 },
  resolvePhysicsBodySpec: e => ({ dynamic: e.physicsBody !== false, mass: 1 }),
  queuePhysicsImpulse: () => { throw new Error('candidate discovery must not queue impulses'); },
  prepareExternalPhysicsImpulse: () => { throw new Error('kinematic fauna cannot receive impulse'); },
  environmentResponse: () => 1,
  isEnvironmentalBody: () => false,
  isAnchoredPhysicalBody: () => false,
  isPhysicalMissionBody: () => false,
  PHYSICAL_REFERENCE_MASS: 1,
  queryAsteroidField: () => {},
  getAsteroidFieldRock: () => null,
  promoteAsteroidFieldRock: () => { throw new Error('live entities require no promotion'); },
  routeRecoilThroughWinchBrace: () => null,
};
const dependency = new vm.SyntheticModule(Object.keys(adapters), function () {
  for (const [name, value] of Object.entries(adapters)) this.setExport(name, value);
}, { context });
const source = readFileSync(new URL('../src/combat/physicalEffects.js', import.meta.url), 'utf8');
const module = new vm.SourceTextModule(source, { context, identifier: 'physicalEffects.js' });
await module.link(() => dependency);
await module.evaluate();
const { schedulePhysicalBlast, queryPhysicalBodies, deliverPhysicalImpulse, tickPhysicalEffects } = module.namespace;
const entity = (id, type, extra = {}) => ({ id, type, alive: true, pos: { x: 0, z: 0 }, radius: 4, ...extra });
function fixture(mode = 'index') {
  const mite = entity(2, 'fauna', { physicsBody: false, collides: false, hull: 60, species: 'suture_mite' });
  const rejected = entity(3, 'fauna', { physicsBody: false, collides: false, species: 'other' });
  const ship = entity(4, 'ship');
  const cargo = entity(5, 'payload', { collides: false });
  const far = entity(6, 'fauna', { physicsBody: false, species: 'suture_mite', pos: { x: 1000, z: 0 } });
  const dead = entity(7, 'fauna', { physicsBody: false, species: 'suture_mite', alive: false });
  const entities = [mite, rejected, ship, cargo, far, dead];
  const state = { tick: 1, entities: new Map(entities.map(e => [e.id, e])), entityList: entities, tableBodies: [ship] };
  if (mode !== 'fallback') state.spatialHash = { diagnostics: { activeBuckets: 1 }, queryRadius(x, z, radius, out) { out.push(ship, ship); } };
  if (mode === 'index' || mode === 'unready') state.entityIndex = { __spacefaceEntityIndexV1: true, ready: mode !== 'unready', fauna: mode === 'unready' ? [] : [mite, mite, rejected, far, dead], pickups: [], wrecks: [], payloads: [cargo, cargo], mines: [] };
  return { state, mite, ship, cargo };
}
const acceptsMite = e => e.type === 'fauna' && e.species === 'suture_mite';
function blast(f, predicate) {
  const hits = [];
  schedulePhysicalBlast(f.state, { center: { x: 0, z: 0 }, radius: 96, alsoEligible: predicate, onBody: e => hits.push(e.id) });
  tickPhysicalEffects(f.state, 1 / 60);
  return hits;
}
for (const mode of ['index', 'unready', 'absent-index', 'fallback']) {
  assert.deepEqual(blast(fixture(mode), acceptsMite), [2, 4, 5], mode + ': approved fauna and ordinary bodies exactly once');
  assert.deepEqual(blast(fixture(mode)), [4, 5], mode + ': ordinary effects unchanged');
  assert.deepEqual(blast(fixture(mode), () => false), [4, 5], mode + ': rejected predicate');
  const f = fixture(mode);
  const bodies = queryPhysicalBodies(f.state, { x: 0, z: 0 }, 96, {}, [], { alsoEligible: acceptsMite });
  assert.deepEqual(Array.from(bodies, e => e.id), [4, 5], mode + ': no body eligibility widening');
  assert.equal(deliverPhysicalImpulse(f.state, f.mite, { x: 420, z: 0 }), false, mode + ': kinematic fauna not shoved');
  const exclusions = [];
  schedulePhysicalBlast(f.state, { center: { x: 0, z: 0 }, radius: 96, alsoEligible: acceptsMite, excludeId: 2, onBody: e => exclusions.push(e.id) });
  assert.deepEqual(exclusions, [4, 5], mode + ': exclusion survives supplemental lane');
  const contained = [];
  schedulePhysicalBlast(f.state, { center: { x: 0, z: 0 }, radius: 96, alsoEligible: acceptsMite, contains: e => e.id === 2, onBody: e => contained.push(e.id) });
  assert.deepEqual(contained, [2], mode + ': contains applies to supplemental lane');
}
console.log('PASS: indexed/true-unready/absent-index/fallback parity; no opt-in and rejected-species negatives; dead/range/exclusion/contains; dedup; unchanged craft/cargo; no kinematic shove.');

// Optional here because the bounded staging tree omits unchanged damage.js.
// In the full repository this executes the production scalar damage router.
const damagePath = new URL('../src/combat/damage.js', import.meta.url);
if (existsSync(damagePath)) {

const damageSource = readFileSync(damagePath, 'utf8');
const damageAdapters = Object.fromEntries(["isCeresWorkfleetHardware","selectHitSubsystem","ensureCombatant","syncCombatantBounds","damageSubsystem","appendCombatTrace","difficultyDamageScale","combatFlag","publishHitstunImpulse","recordImpulseProvenance","signedHitSide","verbAcceptsType","isHostileToPlayer","currentPlayerRewardIdentity","readPlayerFirstHitTruth","writePlayerFirstHitTruth","wardScreenTarget","deliverPhysicalImpulseDetailed","isEnvironmentalBody","isPhysicalMissionBody","resolvePhysicsBodySpec","addEnvironmentHeat","GRAVITY_MARK_STATUS_ID","swarmPilotHasActed","crossfireDisciplineFor"].map(name => [name, () => null]));
Object.assign(damageAdapters, {
 ensureCombatant: () => ({heat:0,heatMax:100,subsystems:{}}),
 difficultyDamageScale: () => 1,
 verbAcceptsType: type => type === 'ship',
 GRAVITY_MARK_STATUS_ID: 'gravity_mark',
 currentPlayerRewardIdentity: () => 'player-1',
});
const damageDep = new vm.SyntheticModule(Object.keys(damageAdapters), function(){ for(const [name,value] of Object.entries(damageAdapters))this.setExport(name,value); }, {context});
const damageModule = new vm.SourceTextModule(damageSource,{context,identifier:'damage.js'});
await damageModule.link(()=>damageDep); await damageModule.evaluate();
const f = fixture('index'); f.state.playerId=1; f.state.combat={};
f.state.entities.set(1,entity(1,'ship'));
let kills=0;
const router = damageModule.namespace.createDamageRouter({state:f.state,catalog:{damageModel:{channelOrder:['explosive'],shieldMultipliers:{},armorMultipliers:{},hullMultipliers:{},subsystemShare:0}},helpers:{}},{schedule(){}},{onKill(target){kills++;target.alive=false;}});
for(let i=0;i<2;i++)schedulePhysicalBlast(f.state,{center:{x:0,z:0},radius:96,alsoEligible:acceptsMite,onBody(target){if(target.id!==2)return;const result=router({attackerId:1,targetId:2,packet:{channels:{explosive:30},flags:{allowAnyTarget:true,ignoreFriendlyFire:true}},origin:{kind:'bomb',id:'bomb_frag'}}); assert.equal(result.ok,true);}});
assert.equal(f.mite.hull,0);assert.equal(kills,1);
console.log('PASS: active-index scheduled blasts invoke full pinned damage router: 60 -> 30 -> 0 hull, one lethal callback. Runtime/status/identity adapters only; no ecology integration claim.');

} else console.log('SKIP: unchanged damage.js absent from bounded staging tree (in-memory pinned router separately verified).');
