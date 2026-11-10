// Focused current-source presentation-owner proof, not a full renderer/GLB admission run.
// The optional source roots below are explicit sparse-evidence adapters only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const arg = (name, fallback) => process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fallback;
export const paths = {
  visual: arg('--visual-source', path.join(root, 'src/render/visualOverrides.js')),
  parts: arg('--parts-source', path.join(root, 'src/render/partsLibrary.js')),
  fauna: arg('--fauna-source', path.join(root, 'src/render/faunaVisuals.js')),
};
export const THREE = await import(arg('--three-module', 'three').startsWith('/')
  ? pathToFileURL(arg('--three-module')).href : arg('--three-module', 'three'));
const sources = Object.fromEntries(Object.entries(paths).map(([name, filename]) => [name, fs.readFileSync(filename, 'utf8')]));
const part = (s, start, end) => {
  const a = s.indexOf(start), b = end ? s.indexOf(end, a + start.length) : s.length;
  assert(a >= 0 && b > a, `current source boundary: ${start}`);
  return s.slice(a, b).replace(/^export /gm, '');
};
export function buildProjection() {
  const c = {
    THREE,
    // This focused owner uses only infestation geometry. Unrelated families are not exercised.
    creatureSkin: () => null,
    isOrchardFrame: () => false, isLatchActor: () => false, isTallyThreeAssessor: () => false,
    hasExplicitAuthoredGeologyPresentation: () => false, isCeresShipbreakSection: () => false,
    isCeresWorkfleetPlace: () => false,
  };
  vm.createContext(c);
  vm.runInContext(`const TISSUE_TINT_MIX=0.78;\n${part(sources.fauna,'function tissueMat(', '// ── species builders')}\n${part(sources.fauna,'export function buildAlienGrowthProp(')}\n${part(sources.parts,'export function buildFallbackPlaceProp(', 'function getFallbackPlaceGeometry(')}\n${part(sources.visual,'function isUnderstoryGardenPlace(', 'function hasStationArchetype(')}\n${part(sources.visual,'function attachUnderstoryGardenDressing(', '/**\n * Install the hero-asset registry')}\nthis.attach=attachUnderstoryGardenDressing;this.admits=isWorldPlaceProp;`, c);
  return c;
}
export function run() {
  const c = buildProjection();
  // Measured-skin reference scale, not a solid-circle collision radius. Physics owner verifies
  // its24capsules separately; this test only proves presentation leaves the value unchanged.
  const hullReferenceRadius = 42 * 144 / 55.200022;
  const entity = { id: 71, alive: true, factionId:'faction_understory', type: 'garden', radius:hullReferenceRadius, data: { gardenRadius:90, understoryGarden:true, placeId:'place_dead_hulk', placeTargetRadius:72, gardenStage:1, gardenBiomass:52 } };
  const before=JSON.stringify(entity);
  assert.equal(c.admits(entity), true);
  assert.equal(c.admits({...entity, data:{...entity.data,understoryGarden:false}}), false);
  assert.equal(c.admits({...entity, data:{...entity.data,placeId:'place_other'}}), false);
  assert.equal(c.admits({...entity, type:'wreck'}), false);
  assert.equal(c.admits({...entity, factionId:'faction_other'}), false);
  assert.equal(c.admits({...entity, factionId:undefined}), false);
  assert.equal(c.admits({...entity, data:{...entity.data,placeId:undefined}}), false,'unadopted legacy data stays with its actual owner');
  for (const key of ['archetypeGlb','landmarkGlb','assetId','assetRef','packagedPropFile','claimSpecId','storyPropKind']) {
    assert.equal(c.admits({...entity,data:{...entity.data,[key]:'custom_body'}}),false,`custom ${key} is not adopted`);
  }
  assert.equal(c.admits({...entity,data:{...entity.data,claimOwned:true}}),false);
  const boundary = new THREE.Group();
  c.attach(boundary,entity);
  assert.equal(JSON.stringify(entity),before,'presentation cannot mutate sim identity or credit');
  const growth=boundary.userData.understoryGardenDressing;
  assert.equal(growth.children.length,19,'bounded real infestation props');
  let meshCount=0;growth.traverse(n=>{if(n.isMesh)meshCount++;});assert.equal(meshCount,128);
  const roots=[...growth.children];
  const measures=[];
  for(const [stage,radius] of [[1,90],[2,140],[3,200],[4,280],[5,380]]) {
    entity.data.gardenRadius=radius;entity.data.gardenStage=stage;
    boundary.userData.updateRuntimeState(entity,12);
    growth.updateMatrixWorld(true);
    const box=new THREE.Box3().setFromObject(growth, true);const size=box.getSize(new THREE.Vector3());
    assert(size.x>=radius*1.98 && size.x<=radius*2.01,'the actual mat reaches the growth X edge');
    assert(size.z>=radius*1.82 && size.z<=radius*2.01,'connected lobes cover the growth Z footprint');
    assert.equal(growth.children.length,19);assert.deepEqual([...growth.children],roots,'stage change reuses geometry');
    assert.equal(growth.userData.gardenStage,stage);assert.equal(entity.radius,hullReferenceRadius,'growth does not change the hull skin reference scale');
    const stamp=boundary.userData.visualBounds;
    assert(stamp.size[0]>=size.x && stamp.size[1]>=size.y && stamp.size[2]>=size.z,'culling bounds contain real growth');
    boundary.userData.visualBounds={center:[0,0,0],size:[144,40,40]};
    assert.equal(boundary.userData.visualBounds,stamp,'full mat envelope survives authored core swap immediately');
    assert(stamp.size[0]>=size.x && stamp.size[2]>=size.z,'far LOD cannot cull the outer roots after hull admission');
    boundary.userData.updateRuntimeState(entity,13);
    measures.push({stage,radius,size:size.toArray(),visibleProps:growth.children.filter(x=>x.visible).length});
  }
  // Ordinary/death-seeded gardens keep their pre-existing dynamic stage-radius physics.
  // New owners stamp gardenRadius; older adopted owners may have only their radius.
  const ordinaryMeasures=[];
  for (const hasGardenRadius of [true,false]) {
    const ordinary={id:72,alive:true,type:'garden',factionId:'faction_understory',radius:90,
      data:{understoryGarden:true,placeId:'place_dead_hulk',poi:true,placeTargetRadius:72,gardenStage:1,gardenBiomass:0}};
    assert.equal(c.admits(ordinary),true);
    const ordinaryBoundary=new THREE.Group();c.attach(ordinaryBoundary,ordinary);
    const ordinaryGrowth=ordinaryBoundary.userData.understoryGardenDressing;
    const ordinaryRoots=[...ordinaryGrowth.children];
    for(const [stage,radius] of [[1,90],[2,140],[3,200],[4,280],[5,380]]) {
      ordinary.radius=radius;ordinary.data.gardenStage=stage;
      if(hasGardenRadius)ordinary.data.gardenRadius=radius;
      const unchanged=JSON.stringify(ordinary);
      ordinaryBoundary.userData.updateRuntimeState(ordinary,14);ordinaryGrowth.updateMatrixWorld(true);
      const size=new THREE.Box3().setFromObject(ordinaryGrowth,true).getSize(new THREE.Vector3());
      assert(size.x>=radius*1.98&&size.x<=radius*2.01);
      assert(size.z>=radius*1.82&&size.z<=radius*2.01);
      assert.equal(JSON.stringify(ordinary),unchanged,'ordinary stage physics/biomass/run data untouched');
      assert.deepEqual([...ordinaryGrowth.children],ordinaryRoots,'ordinary growth reuses same roots');
      ordinaryBoundary.userData.visualBounds={center:[6,1,-2],size:[144,40,40]};
      const bounds=ordinaryBoundary.userData.visualBounds;
      assert(bounds.size[0]>=size.x&&bounds.size[1]>=size.y&&bounds.size[2]>=size.z,'ordinary roots survive authored cull stamp');
      ordinaryMeasures.push({hasGardenRadius,stage,radius,size:size.toArray()});
    }
  }
  // Actual installer source, instrumenting only its documented injected authored-place builder.
  // No decode/admission success is fabricated: this checks the presentation view at the seam.
  let received=null;
  Object.assign(c,{
    isReleaseAssetMode:()=>false,buildKestrelHero:()=>{},buildAuthoredCargoCapsule:()=>{},buildAuthoredStationArchetype:()=>{},
    requiresProductionWholeShip:()=>false,hasExplicitAuthoredPayloadPresentation:()=>false,
    attachPackagedScenarioProp:x=>x,assertReleaseHeroVisual:()=>{},
  });
  vm.runInContext(part(sources.visual,'export function installVisualOverrides(', '\nfunction settleSameSemanticGeologyBuildFallback(')+'\nthis.install=installVisualOverrides;',c);
  const factory={build:()=>{throw Error('garden must not take invisible fallback');}};
  c.install(factory,{authoredPlaceBuilder:e=>{received=e;return new THREE.Group();}});
  const visual=factory.build(entity);
  assert.equal(received.type,'fx','existing place admission guard receives supported view');
  assert.equal(entity.type,'garden','simulation identity retained');
  assert.equal(received.id,entity.id);assert.equal(received.data,entity.data);
  c.CLAIM_SPECIALIZATION_PLACE_FILE_BY_ID = {};
  vm.runInContext(part(sources.parts,'export const OPENING_DOCK_HULK_DEBRIS_PLACE_FILE_BY_ID =', '// PQ-193.05:')
    + part(sources.parts,'function placeFileForEntity(', '// A request deduped'), c);
  assert.equal(c.placeFileForEntity(received),'places/place_dead_hulk.glb','actual current place resolver chooses the released hull');
  entity.alive=false;assert.equal(received.alive,false,'pending view observes real owner death');
  entity.alive=true;
  assert(visual.userData.understoryGardenDressing);
  c.authoredRuntimeState=()=>({entities:new Map([[entity.id,entity]])});
  vm.runInContext(part(sources.parts,'export function boundaryLiveEntity(', '/** True when the admission'),c);
  const bound={userData:{presentationEntityId:entity.id,presentationEntityType:'garden'}};
  assert.equal(c.boundaryLiveEntity(bound,received),entity,'bound authored requests retain the actual live owner, not a presentation data overlay');
  assert.match(sources.parts,/entity\.type !== 'fx'/,'actual place-wrapper guard is covered by supported presentation type');
  console.log(JSON.stringify({status:'PASS',scope:'current-source owner projections + native Three geometry; not GPU/full admission',measures,ordinaryMeasures,meshCount,sources:Object.entries(paths).map(([owner,filename])=>({owner,filename,sha256:createHash('sha256').update(sources[owner]).digest('hex')}))},null,2));
}
if (!process.argv.includes('--render-only')) run();
