import test from 'node:test';
import assert from 'node:assert/strict';
import {createVisualFactory, setFactoryPresentationNow} from '../src/render/visualFactory.js';
import {createPickupMotionTracker} from '../src/render/pickupMotionPresentation.js';
import {worthReadFor} from '../src/render/pickupWorthRead.js';

test('live pickup reduced flash keeps a steady worth cue without affecting another pickup', () => {
  const makeEntity = (id) => ({id,type:'pickup',radius:2,pos:{x:1000,z:1000},
    data:{commodityId:'cmdty_ore_iron',amount:1000}});
  const factory=createVisualFactory(), tracker=createPickupMotionTracker();
  const e=makeEntity(505), other=makeEntity(506), root=factory.build(e), sibling=factory.build(other);
  const gem=root.userData.gem, halo=root.userData.pickupHalo, band=root.userData.worthBand;
  const otherGem=sibling.userData.gem, otherHalo=sibling.userData.pickupHalo;
  const worth=worthReadFor(root.userData.worthTier), gemColor=gem.material.emissive.getHex();
  assert.ok(band && worth.doubleBand, 'rich collectible keeps its second readable band');
  assert.equal(gem.geometry,otherGem.geometry, 'geometry remains shared');
  assert.notEqual(gem.material,otherGem.material, 'per-pickup glint material is private');
  assert.notEqual(halo.material,otherHalo.material, 'per-pickup halo material is private');
  const sample=(time, options) => {
    tracker.updatePickupMotion(e,root,time,.016,null,options);
    setFactoryPresentationNow(time); gem.onBeforeRender();
    return {scale:gem.scale.x, opacity:halo.material.opacity, intensity:gem.material.emissiveIntensity,
      ring:halo.rotation.x, bandOpacity:band.material.opacity};
  };
  try {
    const calm=[];
    for(let i=0;i<100;i++) calm.push(sample(3+i*.016,{reducedMotion:false,reducedFlash:true}));
    for(const x of calm) {
      assert.equal(x.scale,1, 'transponder kick is steady');
      assert.equal(x.opacity,worth.haloFloor, 'collectible halo stays visible and worth-graded');
      assert.equal(x.bandOpacity,worth.haloFloor*.7, 'rich band remains visible');
      assert.equal(x.intensity,1.6*worth.glintHeat, 'gem stays visibly lit');
    }
    assert.notEqual(calm[0].ring,calm.at(-1).ring, 'reduced flash does not suppress motion');
    tracker.updatePickupMotion(other,sibling,4,.016,null,{reducedFlash:false});
    setFactoryPresentationNow(4); otherGem.onBeforeRender(); const first=otherGem.material.emissiveIntensity;
    setFactoryPresentationNow(4.4); otherGem.onBeforeRender();
    assert.notEqual(otherGem.material.emissiveIntensity,first, 'other pickup continues animating');
    assert.equal(gem.material.emissiveIntensity,1.6*worth.glintHeat, 'other callback leaves calm material untouched');
    assert.equal(gem.material.emissive.getHex(),gemColor);
    const resumed=sample(5,{reducedFlash:false,flashReduce:true});
    assert.notEqual(resumed.intensity,1.6*worth.glintHeat, 'canonical off setting resumes the glint');
    const calmAgain=sample(5.1,{reducedFlash:true});
    assert.equal(calmAgain.intensity,1.6*worth.glintHeat);
    assert.equal(calmAgain.opacity,worth.haloFloor);
  } finally {setFactoryPresentationNow(null);}
});
