// Actual factory/admission/SG02 native initial-fit proof. No live-game/AI/save acceptance.
// Declared ports: unrelated derived stats, fittings, weapon/AI setup only. No geometry stand-ins.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const arg=n=>{const i=process.argv.indexOf(n);return i<0?null:process.argv[i+1]};
const root=path.resolve(arg('--source-root')||process.cwd());
const map=arg('--source-map')?JSON.parse(fs.readFileSync(arg('--source-map'),'utf8')):{};
const file=p=>map[p]||path.join(root,p);
const math=await import(pathToFileURL(file('src/data/modelTruthMath.js')));
const {planarProxyPrismHalfHeight}=await import(pathToFileURL(file('src/core/planarProxyGeometry.js')));
const {default:RAPIER}=await import(pathToFileURL(file('node_modules/@dimforge/rapier3d-compat/rapier.mjs')));await RAPIER.init();
function read(name){const p=file(name);const s=fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n');console.log(JSON.stringify({source:p,sha256:createHash('sha256').update(fs.readFileSync(p)).digest('hex')}));return s;}
function fn(src,name){const m=src.match(new RegExp('(?:export )?function '+name+'\\('));assert(m,name);const at=m.index;const end=src.indexOf('\n}',at);assert(end>at,name);return src.slice(at,end+2).replace(/^export /,'');}
function funcs(src,names){return names.map(n=>fn(src,n)).join('\n');}
const model=read('src/data/modelTruth.js'), proxy=read('src/data/collisionProxyManifests.js');
const physics=read('src/core/physicsAuthority.js'), core=read('src/core/coreSystem.js');
const sg=read('src/core/sg02DynamicBodyOwner.js'), entities=read('src/core/entity.js');
const materials=read('src/data/physicsMaterials.js'), census=read('src/data/modelTruthCensus.generated.js');
const ceres=read('src/data/ceresWorkfleetArticulation.js');
const no=n=>()=>{throw new Error('Unexercised unrelated port: '+n)};
const context=vm.createContext({...math,planarProxyPrismHalfHeight,console,assert,Map,WeakMap,Set,WeakSet,Object,Array,Number,Math,JSON,
 
 validateCollisionProxyManifest:no('authored manifest'),ceresWorkfleetSlide:no('Ceres slide'),poseCeresWorkfleetPrimitive:no('Ceres pose'),
 expandChain:no('chain'),rotateProxyPrimitives:no('approach rotation'),approachBearingDeg:no('approach'),
 buildCraftCapsuleColliderDesc:no('craft fallback'),
 convexPlanarParts:no('convex fan'),planarProxyObbHalfHeight:no('obb height'),
 recipeFor:no('Ceres recipe'),C:new Proxy({}, {get(){throw Error('Ceres identity accessed')}}),
 rockSubstanceFor:no('rock substance'),isPlayerSaucer:no('saucer'),isAnchoredPhysicalBody:no('anchor'),PLAYER_EXTERNAL_RESPONSE:{},SAUCER_DRIVE:{},
});
// Physics module is read verbatim; only import/re-export surfaces are omitted.
const physicsBody=physics.replace(/^import\s[\s\S]*?;\s*/gm,'').replace(/^export\s*\{[\s\S]*?\}\s*from[^;]+;\s*/gm,'').replace(/^export /gm,'');
vm.runInContext(materials.replace(/^export /gm,'')+'\n'+physicsBody,context);
vm.runInContext(entities.replace(/^export /gm,''),context);
vm.runInContext(read('src/data/rockSubstances.js').replace(/^export /gm,''),context);
vm.runInContext(census.replace(/^export /gm,'')+'\nconst ROWS=JSON.parse(CENSUS_JSON).rows;let byIdCache=null;\n'+
 funcs(model,['byIdMap','modelTruthRow','stationRow','modelTruthRowForEntity','modelTruthProxyRowForEntity','openingPrimitivesForRow','hoopOpeningPrimitives','modelTruthProxyManifest','skinReference','modelTruthSkinHull','modelTruthSkinPolygon'])+
 '\nconst SKIN_HULL_CACHE=new Map(),SKIN_POLYGON_CACHE=new Map();const HOOP_OPENING_ROW_IDS=new Set(["place_aftermath_aft_dock_collar","place_aftermath_deb_ore_freighter_ring_span","place_transponder_gate"]);',context);
// Exact resolver code with fresh native caches. No authored/declared static table row is reached.
vm.runInContext(`const MEASURED_PROXY_CACHE=new WeakMap(),AUTHORED_PROXY_CACHE=new WeakMap(),DYNAMIC_SKIN_CACHE=new Map();
 const COLLISION_PROXY_SCHEMA_VERSION=1,MAX_PROXY_PRIMITIVES=32,COLLISION_PROXY_FLAGS={collides:true,renderable:false,targetable:false,radarVisible:false};
 const COLLISION_PROXY_MANIFESTS={};const SKIN_DYNAMIC_TYPES=new Set(['ship','drone','asteroid','wreck','debris','payload','pod','prop','buoy']);
 const roles=['breaker','cradle'];\n`+funcs(ceres,['ceresWorkfleetSlideRole'])+'\n'+
 funcs(proxy,['hasAuthoredSkinOverride','declaresMeasuredSkinProxy','isCompoundSkinDynamicEligible','measuredSkinAllowedFor','authoredProxyManifest','resolveCollisionProxyManifest','resolveMeasuredProxyManifest','compactSkinManifest','proxyScaleFor','effectiveCorridorBearingDeg','expandProxyPrimitives']),context);
const admissionStart=core.indexOf('      const measuredSkin = e && e.collides !== false && measuredSkinAllowedFor(e)');
const admissionEnd=core.indexOf('      if(fence && !fence())',admissionStart);
assert(admissionStart>0&&admissionEnd>admissionStart);
const admission=core.slice(admissionStart,admissionEnd);
vm.runInContext(`const CONTACT_MATERIALS=PHYSICS_MATERIALS,RESOLVED_CONTACT_MATERIALS=new WeakMap();
 const COLLISION_GROUP_SOLID=0x0001,COLLISION_GROUP_CRAFT=0x0002,COLLISION_GROUP_DEBRIS=0x0004,COLLISION_GROUP_PICKUP=0x0008,SG02_CONTACT_FORCE_EVENT_THRESHOLD_N=60;\n`+
 funcs(sg,['convexPrismDesc','dressProxyColliderDesc','buildBallColliderDesc','proxyManifestForBody','buildCompoundProxyColliderDescs','capsulePlanarQuat','applyColliderContactMaterial','computeCollisionGroups','configureContactEvents','contactMaterialFor'])+
 `\nthis.api={makeEntity,resolvePhysicsBodySpec,resolveCollisionProxyManifest,buildBallColliderDesc,contactMaterialFor,admit(e){${admission}},recipe(e){const spec=resolvePhysicsBodySpec(e),manifest=proxyManifestForBody(e,spec);assert(manifest,'No measured manifest');return {spec,manifest,descs:buildCompoundProxyColliderDescs(R,e,manifest,contactMaterialFor(e,spec),spec,true,{})}}};`,context);

context.R=RAPIER;
const enemies=read('src/data/enemies.js'),at=enemies.indexOf("id: 'nest_carrier'"),start=enemies.lastIndexOf('\n  {',at),end=enemies.indexOf('\n  },',at)+5;
assert(at>0&&start>0&&end>at,'Current nest_carrier row required');
const enemy=vm.runInNewContext('('+enemies.slice(start,end).trim().replace(/,$/,'')+')');

const ships=read('src/systems/ships.js'),combat=read('src/systems/combat.js');
const ec=vm.createContext({console,ENEMY_TYPES:[enemy],ENEMY:new Map([[enemy.id,enemy]]),SHIP:new Map(),SHIPS:[],SHIP_BY_ID:new Map([['ship_atlas',{id:'ship_atlas'}]]),
getDerivedStats:()=>({radius:30,mass:520,boost:{},hull:460,hullMax:460}),buildWeaponList:()=>[],buildMiningBeam:()=>null,fittingsForView:()=>[],
factionBehaviorForCombatSpawn:()=>({}),resolveEnemyWeapon:w=>({...w}),normalizeCombatDoctrineId:x=>x,tacticalCapabilitiesFor:()=>({}),doctrineTelegraphFor:()=>null,contactGrammarFor:()=>null,applyLastArgumentSpawnSpec:s=>s,
MIN_AI_RESPONSE_WINDOW_S:1,DOCTRINE_TELEGRAPH_TICKS:60,defaultDoctrineFor:()=>({activity:{},roe:'weapons_free'})});
vm.runInContext(fn(ships,'makeShipEntitySpec')+'\n'+funcs(combat,['scaleCombatant','makeEnemySpawnSpec'])+'\nthis.make=makeEnemySpawnSpec;',ec);
const spec=ec.make('nest_carrier',1,{x:0,z:0});assert.equal(spec.data.defId,'ship_atlas');assert.equal(spec.radius,30);assert.equal(spec.physicsBody,undefined);
const carrier=context.api.makeEntity(spec);context.api.admit(carrier);const built=context.api.recipe(carrier);assert.equal(built.manifest.id,'skin:ship_atlas:hull');assert.equal(built.descs.length,1);
const world=new RAPIER.World({x:0,y:0,z:0});const body=world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setAdditionalMass(520));const hull=world.createCollider(built.descs[0],body);
const runtime=read('src/data/encounters/705-the-nest.js');const offsetMatch=runtime.match(/const BAY_OFFSETS = Object.freeze\((\[[^;]+\])\);/);assert(offsetMatch,'Current authored bay offsets required');const offsets=vm.runInNewContext(offsetMatch[1]);assert.deepEqual(JSON.parse(JSON.stringify(offsets)),[{dx:0,dz:-24},{dx:0,dz:24}]);
const doors=[];
for(const {dx,dz:z} of offsets){assert.equal(dx,0);const e=context.api.makeEntity({type:'beacon',radius:12,mass:400,pos:{x:0,z},data:{nestSlot:'door'}});context.api.admit(e);const p=context.api.resolvePhysicsBodySpec(e);assert.equal(p.dynamic,true);assert.equal(p.mass,400);assert.equal(p.radius,12);assert.equal(context.api.resolveCollisionProxyManifest(e),null);const desc=context.api.buildBallColliderDesc(RAPIER,p,context.api.contactMaterialFor(e,p),true,e);const rb=world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0,0,z).setAdditionalMass(400));const col=world.createCollider(desc,rb);doors.push(col);const ct=hull.contactCollider(col,100);assert(ct.distance>3);console.log('native initial pair',JSON.stringify({z,distance:ct.distance,shape:col.shape.type,proxy:built.manifest.id}));}
world.step();for(const door of doors){let count=0;world.contactPair(hull,door,()=>count++);assert.equal(count,0);}
console.log('PASS actual makeShipEntitySpec/makeEnemySpawnSpec with declared nongeometry stats/fittings ports, core admission, SG02 descriptor, native Rapier construction and one-step zero carrier-door contacts. Not live game/AI/Save acceptance.');
world.free();
