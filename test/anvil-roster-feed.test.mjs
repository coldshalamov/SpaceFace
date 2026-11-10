import test from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './fixtures/anvil-orchard-custody-source.mjs';
import { ANVIL_ORCHARD } from '../src/data/anvilOrchard.js';
import { listSelectableComponents } from '../src/systems/interactionDescriptors.js';
import { objectInfoLine, authoredSiteRosterDetail } from '../src/ui/targetPanel.js';
import { planetRuntime } from '../src/systems/planetRuntime.js';
import { PLANET_SITE } from '../src/data/planets.js';
import { stableEntityKey } from '../src/data/interactionDescriptorCatalog.js';
import { worldSiteManifestById } from '../src/data/worldSiteManifests.js';
import { createWorldSiteRecord } from '../src/systems/worldSiteKernel.js';

test('real player feed and worker pod give distinct, rebound socket guidance', async () => {
  const h=await setup();
  try {
    const s=h.sim.state,p=h.worker,f=h.frame;
    delete p.data.anvilSlingWitness;delete p.data.itinerary;
    p.pos.x=f.pos.x;p.pos.z=f.pos.z-180;p.vel.x=100;p.vel.z=0;p.data.miningBeam={tierId:'beam_mk1'};
    Object.assign(f.data,{worldSiteTargetable:true,isLandmark:true,landmarkId:ANVIL_ORCHARD.id,name:'Anvil Storm Orchard'});
    h.facade._syncSg02DynamicAuthorityEntities(s);
    s.mode='flight';s.tick=0;s.player.targetId=f.id;
    s.settings.controls.bindings={siteBeam:['KeyN'],rig:['KeyY']};
    const planet=Object.create(planetRuntime);
    const registry={get(name){return name==='cargo'?{addCargo(){return 0;}}:h.sim.registry.get(name);}};
    planet.init({state:s,bus:h.sim.bus,helpers:h.sim.helpers,registry});
    Object.assign(s.planet,{active:true,siteId:ANVIL_ORCHARD.planetId,center:{x:p.pos.x-950,z:p.pos.z}});
    Object.assign(s.planet.player,{region:'skim',collectorOn:true});
    s.ui.componentSelection={targetId:f.id,stableKey:stableEntityKey(f),componentId:'orchard_socket_1'};
    s.input.actions={siteBeam:true};
    let c=listSelectableComponents(s,f)[1];assert.equal(c.feedEligible,true);
    let text=objectInfoLine(f,s,p,180);
    assert.match(text,/Empty socket.*hold N to feed skim.*48 units/i);
    assert.doesNotMatch(text,/release|awaiting harvest/i);
    planet._tickHarvest(2,s,s.planet,PLANET_SITE);
    c=listSelectableComponents(s,f)[1];assert.equal(c.contributor,'player');assert.ok(c.units>0 && c.units<4);assert.equal(c.feedEligible,true);
    text=objectInfoLine(f,s,p,180);
    assert.match(text,/hold N to feed skim.*close Scoop \(Y\), let go N, then hold N to release/i);
    assert.equal(authoredSiteRosterDetail(s,f,p,180),text);
    s.planet.player.collectorOn=false;
    assert.match(objectInfoLine(f,s,p,180),/hold N to release/i);
    s.planet.player.collectorOn=true;p.vel.x=0;
    assert.match(objectInfoLine(f,s,p,180),/Fly faster in the skim band/i);
    p.vel.x=100;p.data.anvilSlingWitness=true;p.data.itinerary={kind:'anvil_work',role:'collector',phase:'collect'};
    assert.equal(h.accept(4,0),4);
    s.ui.componentSelection.componentId='orchard_socket_0';
    c=listSelectableComponents(s,f)[0];assert.equal(c.contributor,'worker');assert.equal(c.feedReason,'worker-pod');
    text=objectInfoLine(f,s,p,180);
    assert.match(text,/4 units.*Worker pod.*close Scoop \(Y\), let go N, then hold N to release/i);
    assert.doesNotMatch(text,/hold N to feed/i);
    assert.equal(authoredSiteRosterDetail(s,{type:'wreck',data:{}},p,10),null);
    const site=worldSiteManifestById('world_site_helios_relay');
    s.sites.worldById={[site.id]:createWorldSiteRecord(site)};
    const cradle={id:900,type:'wreck',alive:true,radius:8,data:{role:'world_site_component',worldSiteId:site.id,
      worldSiteComponentId:'payload_cradle',worldSiteTargetable:true}};
    assert.match(authoredSiteRosterDetail(s,cradle,p,10),/Payload: Scrap Metal ×6, Electronics ×2/);
  } finally {h.close();}
});
