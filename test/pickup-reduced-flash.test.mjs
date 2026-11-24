import test from 'node:test';
import assert from 'node:assert/strict';
import {createVisualFactory, setFactoryPresentationNow} from '../src/render/visualFactory.js';
import {createPickupMotionTracker} from '../src/render/pickupMotionPresentation.js';
import {worthReadFor} from '../src/render/pickupWorthRead.js';

test('live pickup reduced flash keeps a steady worth glint without rings (no rings around things, owner 2026-11-23)', () => {
  const makeEntity = (id) => ({id,type:'pickup',radius:2,pos:{x:1000,z:1000},
    data:{commodityId:'cmdty_ore_iron',amount:1000}});
  const factory=createVisualFactory(), tracker=createPickupMotionTracker();
  const e=makeEntity(505), other=makeEntity(506), root=factory.build(e), sibling=factory.build(other);
  const gem=root.userData.gem;
  const otherGem=sibling.userData.gem;
  const worth=worthReadFor(root.userData.worthTier), gemColor=gem.material.emissive.getHex();
  assert.equal(root.userData.pickupHalo, null, 'no orbiting halo torus around pickups (no rings around things, owner 2026-11-23)');
  assert.equal(root.userData.worthBand, undefined, 'no double torus ring around rich pickups');
  assert.equal(gem.geometry,otherGem.geometry, 'geometry remains shared');
  assert.notEqual(gem.material,otherGem.material, 'per-pickup glint material is private');
  const baseIntensity = (worth.doubleBand ? 2.4 : 1.9) * worth.glintHeat;
  const sample=(time, options) => {
    tracker.updatePickupMotion(e,root,time,.016,null,options);
    setFactoryPresentationNow(time); gem.onBeforeRender();
    return {scale:gem.scale.x, intensity:gem.material.emissiveIntensity, rotY:gem.rotation.y};
  };
  try {
    const calm=[];
    for(let i=0;i<100;i++) calm.push(sample(3+i*.016,{reducedMotion:false,reducedFlash:true}));
    for(const x of calm) {
      assert.equal(x.scale,1, 'transponder kick is steady');
      assert.equal(x.intensity,baseIntensity, 'gem stays visibly lit at its worth heat');
    }
    assert.notEqual(calm[0].rotY,calm.at(-1).rotY, 'reduced flash does not suppress tumble motion');
    tracker.updatePickupMotion(other,sibling,4,.016,null,{reducedFlash:false});
    setFactoryPresentationNow(4); otherGem.onBeforeRender(); const first=otherGem.material.emissiveIntensity;
    setFactoryPresentationNow(4.4); otherGem.onBeforeRender();
    assert.notEqual(otherGem.material.emissiveIntensity,first, 'other pickup continues animating');
    assert.equal(gem.material.emissiveIntensity,baseIntensity, 'other callback leaves calm material untouched');
    assert.equal(gem.material.emissive.getHex(),gemColor);
    const resumed=sample(5,{reducedFlash:false,flashReduce:true});
    assert.notEqual(resumed.intensity,baseIntensity, 'canonical off setting resumes the glint');
    const calmAgain=sample(5.1,{reducedFlash:true});
    assert.equal(calmAgain.intensity,baseIntensity);
  } finally {setFactoryPresentationNow(null);}
});
