// Actual current pure geometry/body readers for focused source-owner tests.
// Defaults read production. Explicit auxiliary roots are sparse local evidence only.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
export async function loadClearanceGeometry({root,auxRoots=[]}) {
 const roots=[root,...auxRoots], inventory=[];
 const read=name=>{const file=roots.map(r=>path.join(r,name)).find(f=>fs.existsSync(f));assert(file,`Missing current clearance owner ${name}; supply explicit --aux-root for sparse evidence`);const b=fs.readFileSync(file);inventory.push({path:name,file,sha256:createHash('sha256').update(b).digest('hex')});return b.toString('utf8').replace(/\r\n/g,'\n')};
 const fn=(s,n)=>{const m=s.match(new RegExp('(?:export )?function '+n+'\\('));assert(m,n);const end=s.indexOf('\n}',m.index);assert(end>m.index,n);return s.slice(m.index,end+2).replace(/^export /,'')};
 const strip=s=>s.replace(/^import[\s\S]*?;\n/gm,'').replace(/^export /gm,'');
 const model=read('src/data/modelTruth.js'),proxy=read('src/data/collisionProxyManifests.js'),physics=read('src/core/physicsAuthority.js');
 const census=read('src/data/modelTruthCensus.generated.js'),materials=read('src/data/physicsMaterials.js'),ceres=read('src/data/ceresWorkfleetArticulation.js');
 const context=vm.createContext({Map,Set,WeakMap,Object,Math,Number,Array,JSON,
  recipeFor:()=>{throw Error('Ceres articulation is outside this focused clearance projection')},
  C:new Proxy({},{get(){throw Error('Ceres identity outside clearance projection')}}),
  ceresWorkfleetSlide:()=>{throw Error('Ceres slide outside clearance projection')},
  poseCeresWorkfleetPrimitive:()=>{throw Error('Ceres pose outside clearance projection')},
 });
 const modelFns=['byIdMap','modelTruthRow','stationRow','modelTruthRowForEntity','modelTruthProxyRowForEntity','skinReference','modelTruthPlanarRadius','openingPrimitivesForRow','hoopOpeningPrimitives','modelTruthProxyManifest'];
 const hoopAt=model.indexOf('const HOOP_OPENING_ROW_IDS = ');assert(hoopAt>=0);const hoop=model.slice(hoopAt,model.indexOf(';',hoopAt)+1);
 vm.runInContext(strip(census)+'\nconst ROWS=JSON.parse(CENSUS_JSON).rows;let byIdCache=null;\n'+hoop+'\n'+modelFns.map(n=>fn(model,n)).join('\n'),context);
 const physicsFns=['authoredPhysicsBody','shouldSyncPhysicsBodyEntity','substanceFor','defaultDynamic','defaultMaterial','isFixedPhysicsEntity','isDynamicPhysicsBodyEntity'];
 const fixedThreshold=physics.match(/export const FIXED_BODY_RADIUS_THRESHOLD = [^;]+;/);assert(fixedThreshold);
 vm.runInContext(fixedThreshold[0].replace('export ','')+'\n'+physicsFns.map(n=>fn(physics,n)).join('\n'),context);
 vm.runInContext('const roles=["breaker","cradle"];\n'+fn(ceres,'ceresWorkfleetSlideRole')+'\n'+strip(materials)+'\n'+strip(proxy)+'\nthis.api={measuredSkinAllowedFor,hullEnvelopeWu,proxyOuterRadiusWu,COLLISION_PROXY_MANIFESTS,modelTruthProxyManifest,shouldSyncPhysicsBodyEntity,substanceFor,PHYSICS_MATERIALS};',context);
 console.log(JSON.stringify({clearanceGeometrySources:inventory,qualification:'Actual pure readers; unexercised articulated Ceres ports throw, no native solver'}));
 return context.api;
}
