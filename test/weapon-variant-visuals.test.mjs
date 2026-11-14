import test from 'node:test';
import assert from 'node:assert/strict';
import {authoredPreloadPlanForEntity} from '../src/render/partsLibrary.js';

function modular(weapon, facing = 'front') {
  return {id:`variant-visual-${weapon}-${facing}`,type:'ship',radius:18,factionId:'faction_lamplighter',
    data:{defId:'diagnostic_modular',weapons:[{defId:weapon,size:'M',facing}]}};
}

test('unique fitted weapon variants request the physical family of their base weapon', () => {
  for (const [variant, base, expected] of [
    ['unique_ironsong_ac','wpn_autocannon_m','weapons/weapon_gatling.glb'],
    ['unique_veil_cutter','wpn_beam_laser_m','weapons/weapon_lance.glb'],
    ['unique_nestbreaker_rack','wpn_missile_rack_m','weapons/weapon_heavy_cannon.glb'],
  ]) {
    assert.deepEqual(authoredPreloadPlanForEntity(modular(base)).weapon,[expected]);
    assert.deepEqual(authoredPreloadPlanForEntity(modular(variant)).weapon,[expected]);
  }
});

test('a turret mount still takes precedence over the inherited family', () => {
  assert.deepEqual(authoredPreloadPlanForEntity(modular('unique_ironsong_ac','turret')).weapon,
    ['weapons/weapon_turret_dual.glb']);
});

test('integrated player hulls do not acquire an extra bolt-on gun', () => {
  const ship=modular('unique_ironsong_ac');ship.data.defId='ship_kestrel';
  assert.deepEqual(authoredPreloadPlanForEntity(ship),{hull:['wholeships/kestrel.glb']});
});
