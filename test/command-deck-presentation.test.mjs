import test from 'node:test';
import assert from 'node:assert/strict';
import { vesselDossierModel } from '../src/ui/panels/vesselDossier.js';
import { cargoIllustration, cargoArtFamily, cargoCapacityHtml } from '../src/ui/art/cargoIllustration.js';
import { matchingTradeReceipt, tradeReceiptPresentation, tradeFailurePresentation } from '../src/ui/market/transactionPresentation.js';
import { instrumentGlyph, glyphForAction } from '../src/ui/kit/insignia.js';

const state = () => ({ playerId: 12, entities: new Map([[12, {data:{defId:'ship_kestrel'}, hull:75,hullMax:100,shield:0,shieldMax:60}]]),
  player: {credits:54321,ownedShips:[{defId:'ship_kestrel',name:'Wayfarer'}],activeShipIndex:0,cargo:{capVolume:40,usedVolume:36}},
  fuel:{current:42,max:100},world:{currentSectorId:'sector_helios_prime'} });
test('vessel plate reads the active owned hull and actual entity telemetry without mutation', () => {
  const s=state(),before=JSON.stringify({...s,entities:[...s.entities]});const m=vesselDossierModel(s);
  assert.equal(m.name,'Wayfarer');assert.equal(m.id,'ship_kestrel');assert.equal(m.credits,'54,321');
  assert.deepEqual(m.meters.map(v=>v.ratio),[.75,0,.42,.9]);
  assert.equal(JSON.stringify({...s,entities:[...s.entities]}),before);
});
test('empty telemetry never paints a fictional healthy ship', () => {
  const m=vesselDossierModel({}); assert.equal(m.condition,'Awaiting telemetry');
  assert.ok(m.meters.every(v=>v.ratio===null));
});
test('null, zero-capacity, invalid and out-of-range telemetry stay bounded', () => {
  const s=state();s.entities.get(12).hull=null;s.entities.get(12).shieldMax=0;s.fuel.current=Infinity;
  assert.deepEqual(vesselDossierModel(s).meters.slice(0,3).map(v=>v.ratio),[null,null,null]);
  s.entities.get(12).hull=-30;assert.equal(vesselDossierModel(s).meters[0].ratio,0);assert.equal(vesselDossierModel(s).critical,true);
  s.entities.get(12).hull=200;assert.equal(vesselDossierModel(s).meters[0].ratio,1);
});
test('entity data.defId is the hull fallback when no owned-ship record exists',()=>{
  const s=state();s.player.ownedShips=[];assert.equal(vesselDossierModel(s).id,'ship_kestrel');
});
test('cargo bay shows actual capacity and prospective transfer without changing cargo',()=>{
  const cargo={capVolume:40,usedVolume:10},markup=cargoCapacityHtml(cargo,12);
  assert.match(markup,/Hold: 10 of 40 units; after trade 22/);assert.match(markup,/18 u free after trade/);
  assert.match(markup,/scaleX\(0.55\)/);assert.deepEqual(cargo,{capVolume:40,usedVolume:10});
  assert.match(cargoCapacityHtml(cargo,-8),/data-direction="sell"/);
  assert.match(cargoCapacityHtml(cargo,100),/data-overflow="true"/);
  assert.equal(cargoCapacityHtml({}), '');assert.equal(cargoCapacityHtml({capVolume:0,usedVolume:0}), '');
});
test('each cargo family has a bounded authored SVG and never incorporates untrusted content',()=>{
  for(const category of ['ore','gas','crystal','exotic','refined','component','tech','consumer','luxury','food','med','salvage','military','contraband']) {
    const svg=cargoIllustration({category,name:'<img onerror=evil()>'});
    assert.match(svg,/viewBox="0 0 240 190"/);assert.match(svg,/aria-hidden="true"/);
    assert.doesNotMatch(svg,/<script|onerror|<img|<filter|<animate/);
    assert.ok((svg.match(/</g)||[]).length<120, category);assert.ok(svg.length<10000, category);
  }
  assert.equal(cargoArtFamily('<bad>'),'consumer');assert.equal(cargoArtFamily('raw ore'),'ore');
});
test('a receipt only completes the currently requested station, commodity and direction',()=>{
  const pending={stationId:'a',commodityId:'ore',side:'buy'};
  assert.equal(matchingTradeReceipt(pending,{...pending,qty:3}),true);
  for(const field of ['stationId','commodityId','side'])assert.equal(matchingTradeReceipt(pending,{...pending,[field]:'other'}),false);
  assert.equal(matchingTradeReceipt(null,pending),false);
});
test('transaction success comes from finite canonical receipt values, never from a click',()=>{
  assert.equal(tradeReceiptPresentation(null),null);
  for(const bad of [{qty:0,total:40,side:'buy'},{qty:2,total:NaN,side:'buy'},{qty:1,total:4,side:'x'}])assert.equal(tradeReceiptPresentation(bad),null);
  const receipt=tradeReceiptPresentation({qty:3,total:145,side:'buy',receiptId:'trade:1'},'Ore');
  assert.equal(receipt.title,'Cargo secured');assert.equal(receipt.text,'3 u Ore · −145 CR');assert.equal(receipt.receiptId,'trade:1');
  assert.equal(tradeFailurePresentation('mission_cargo_locked').text,'Sealed contract cargo cannot be sold.');
});
test('glyphs retain decorative semantics and action aliases',()=>{
  assert.match(instrumentGlyph('market','x" onclick="evil'),/aria-hidden="true"/);
  assert.doesNotMatch(instrumentGlyph('market','x" onclick="evil'),/onclick=/);
  assert.equal(glyphForAction('pause-4','Mission Log (J)'),'contracts');
  assert.equal(glyphForAction('newGame','New Game'),'newGame');
});
