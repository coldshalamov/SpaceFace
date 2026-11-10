import test from 'node:test';
import assert from 'node:assert/strict';
import { salvageActions } from '../src/systems/salvageActions.js';
import { ORCHARD_GEOMETRY as G, orchardFrameBodySpec } from '../src/data/anvilOrchardBody.js';

test('world-site component cannot receive or activate generic wreck salvage; ordinary wreck still can', () => {
  const site = { id: 1045, type: 'wreck', alive: true, data: { role: 'world_site_component',
    worldSiteId: 'world_site_ceres_second_measure', worldSiteComponentId: 'long_plate_clamp', worldSiteTargetable: true } };
  const ordinary = { id: 4, type: 'wreck', alive: true, data: {} };
  const structural = { id: 5, type: 'wreck', alive: true, data: { worldSiteStructural: true,
    persistenceOwner: 'asteroidSites', salvagePool: { cmdty_ore_iron: 8 } } };
  const orchard = { id: 6, type: 'wreck', alive: true, radius: G.radius, physicsBody: orchardFrameBodySpec(), data: {
    orchardId: 'anvil_storm_orchard', orchardKind: 'frame', worldRecordId: G.worldRecordId,
    placeId: 'place_anvil_storm_orchard', authoredAssetId: G.assetId, authoredPayloadAssetId: G.assetId,
    masslineTetherable: false } };
  const state = { entities: new Map([[site.id, site], [ordinary.id, ordinary], [structural.id, structural]]) };
  const bus = { on() {}, off() {}, emit() {} };
  salvageActions.init({ state, bus, registry: { get() { return null; } } });
  try {
    assert.equal(salvageActions._annotate(site), null);
    assert.equal(site.data.salvagePool, undefined);
    assert.equal(site.data.salvageAction, undefined);
    assert.equal(salvageActions.configureAuthoredWreck(site, { salvagePool: { cmdty_scrap_metal: 9 } }), null);
    site.data.salvagePool = { cmdty_scrap_metal: 4 }; // stale annotation remains inert here
    assert.equal(salvageActions._vent(site.id), null);
    assert.deepEqual(site.data.salvagePool, { cmdty_scrap_metal: 4 });
    assert.equal(salvageActions._annotate(structural), null);
    assert.deepEqual(structural.data.salvagePool, { cmdty_ore_iron: 8 });
    assert.equal(salvageActions._annotate(orchard), null);
    assert.equal(orchard.data.salvagePool, undefined);
    assert.ok(salvageActions._annotate(ordinary));
    assert.deepEqual(ordinary.data.salvagePool, { cmdty_scrap_metal: 4 });
  } finally { salvageActions.destroy(); }
});
