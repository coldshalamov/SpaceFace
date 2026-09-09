import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { escapeMarkup, iconHtml } from '../src/ui/views/identity.js';
import * as frames from '../src/ui/views/stationFrames.js';
import { marketBrowserHtml, marketRowHtml, marketTradeHtml, marketQuoteHtml, buildChart, marketFamily, trendHtml } from '../src/ui/views/marketPresentation.js';
import { contractDossierView, commitWordHtml } from '../src/ui/views/contractPresentation.js';
import { navigationFrameHtml } from '../src/ui/views/navigationFrame.js';
import { targetFrameHtml } from '../src/ui/views/targetFrame.js';
import { shipConditionMarkup, hudBarMarkup } from '../src/ui/views/flightInstruments.js';
import { bindCommittedRange } from '../src/ui/views/settingsControls.js';
import { describeTechNodeReadiness } from '../src/ui/screens/techTree.js';

const read = path => readFileSync(new URL(path, import.meta.url),'utf8');

test('untrusted names are escaped in text and quoted attributes', () => {
  assert.equal(escapeMarkup(`<A&B "C" 'D'>`),'&lt;A&amp;B &quot;C&quot; &#39;D&#39;&gt;');
  assert.doesNotMatch(iconHtml('not-in-the-vocabulary', 'x" onload="alert(1)'), /class="x" onload/);
});
for (const [name, factory] of Object.entries(frames)) {
  test(`${name}: native view is nonempty, not a disconnected placeholder`, () => {
    assert.equal(typeof factory(), 'string');
    const hooks = {stationFrameHtml:['sx-panel','sxb-launch'],marketFrameHtml:['sx-mkt__list','sx-mkt__trade'],shipworksFrameHtml:['sx-sw__list','sx-sw__stage'],contractsFrameHtml:['sx-ct__board','sx-ct__dossier'],barFrameHtml:['sx-bar__'],industryFrameHtml:['sx-ind__list','sx-ind__stage'],factionsFrameHtml:['sx-fac__rail','sx-fac__stage']};
    for (const hook of hooks[name] || []) assert.ok(factory().includes(hook), `${name} must retain ${hook}`);
    assert.match(factory(), /<(?:nav|section|div|header)\b/);
    assert.doesNotMatch(factory(), /undefined|NaN/);
  });
}
test('station has one facility rail and retains service/comms/undock hooks', () => {
  const html=frames.stationFrameHtml();
  assert.equal((html.match(/sxb-ops__dock/g)||[]).length,1);
  for(const hook of ['sx-panel','sxb-vitals','sxb-purse__value','sxb-launch','sx-comms']) assert.ok(html.includes(hook),hook);
  assert.match(html,/class="of-facility-rail"/);
});
test('market filter taxonomy and native search/selection hooks are retained', () => {
  assert.equal(marketFamily('raw ore'),'raw'); assert.equal(marketFamily('component'),'industry');
  assert.equal(marketFamily('contraband'),'restricted');
  const html=marketBrowserHtml();
  for(const hook of ['data-market-search','sx-mkt-browser__count','role="tablist"','scope="col"']) assert.ok(html.includes(hook),hook);
});
test('market row names/IDs cannot create controls or attributes', () => {
  const html=marketRowHtml({id:'x" onfocus="evil()',name:'<script>evil()</script>',buy:10,sell:9,stock:20,selected:true});
  assert.doesNotMatch(html, /<script>|id="sx-market-tab-x" onfocus=/);
  assert.match(html,/&lt;script&gt;/);assert.match(html,/aria-selected="true" tabindex="0"/);
});
for(const mode of ['buy','sell']) {
  test(`${mode}: exactly one commit control; the other only switches mode`, () => {
    const html=marketTradeHtml({mode,qty:3,canAct:true,receiptHtml:''});
    assert.equal((html.match(/ data-go/g)||[]).length,1);
    assert.match(html,new RegExp(`data-mode="${mode}" aria-pressed="true" data-go`));
    assert.match(html,/role="group" aria-label="Buy or sell"/);
    assert.doesNotMatch(html,/<ul[^>]*sx-trade__words[^>]*role="tablist"/);
  });
}
test('unavailable transaction is natively disabled and names its reason', () => {
  const html=marketTradeHtml({mode:'buy',qty:2,canAct:false,receiptHtml:'',note:'Quote unavailable <not free>'});
  assert.match(html,/data-go disabled/);assert.match(html,/Quote unavailable &lt;not free&gt;/);
  assert.equal((html.match(/ data-go/g)||[]).length,1);
});
test('missing/nonfinite chart samples never become invented zero prices or invalid SVG', () => {
  assert.match(buildChart([],4,'x','No data'), /Price history unavailable/);
  const html=buildChart([Infinity,12,NaN,14],13,'safe','A < B');
  assert.doesNotMatch(html,/NaN|Infinity/);assert.match(html,/2 samples, 12 to 14 credits/);assert.match(html,/A &lt; B/);
});
test('flat single-sample history produces finite coordinates', () => {
  const html=buildChart([12],12,'one','Price');assert.doesNotMatch(html,/NaN|Infinity/);assert.match(html,/1 samples/);
});
test('market quote exposes contraband without making it an authorization decision', () => {
  const html=marketQuoteHtml({name:'Sample',legal:'contraband',buy:100,sell:90,avg:95,hist:[90,100]});
  assert.match(html,/Contraband/);assert.doesNotMatch(html,/data-go|onclick/);
});
test('blocked contract retains its disabled accept target and explicit reason', () => {
  const html=contractDossierView({typeName:'Courier',titleHtml:'Sealed cargo',clientHtml:'Ceres',reward:'1,800',summary:'Cargo < 6',routeHtml:'Ceres → Vesta',riskHtml:'Low risk',termsHtml:'',readiness:{blocker:'Cargo hold full'},action:{id:'offer-4',ready:false,readyLabel:'Accept',blockedLabel:'Resolve Readiness',aria:'Cannot accept. Cargo hold full',reason:'Cargo hold full'}});
  assert.match(html,/data-accept="offer-4" disabled/);assert.match(html,/Cargo &lt; 6/);
  assert.match(html,/sx-dossier__gate">Cargo hold full/);
});
test('final disposition retains review wording, not an immediate commit', () => {
  assert.match(commitWordHtml({id:'filing',ready:true,readyLabel:'Review Final Disposition',aria:'Opens a separate confirmation'}),/Review Final Disposition/);
  const source=read('../src/ui/station/screens/contracts.js');
  assert.match(source,/separate irreversible confirmation/);assert.match(source,/ui:endgameChoose/);
});
test('native chart keeps plot and engage separate and preserves no-selection guards', () => {
  const html=navigationFrameHtml();
  for(const id of ['gm-plot-course-btn','gm-engage-route-btn','gm-set-course-btn','gm-frame-both-btn','gm-return-ship-btn']) assert.ok(html.includes(`id="${id}"`),id);
  assert.match(html,/id="gm-plot-course-btn"[^>]+hidden disabled/);
  assert.match(html,/id="gm-engage-route-btn"[^>]+hidden disabled/);
  assert.match(html,/role="tablist" aria-label="Inspector detail"/);
});
test('target presentation retains distinct selected and engaged identities', () => {
  const html=targetFrameHtml();for(const hook of ['sf-target__name','sf-target__engaged','sf-target__component','sf-target__threat']) assert.ok(html.includes(hook));
  assert.match(html,/aria-label="Cycle target component"/);
});
test('ship condition follows canonical active hull, never the menu scout image', () => {
  const a=shipConditionMarkup('ship_kestrel'), b=shipConditionMarkup('ship_mule');
  assert.notEqual(a,b);assert.equal(shipConditionMarkup('unknown'),a);
  assert.doesNotMatch(a,/<img|\.png|fetch\(/);assert.match(a,/sf-sch-ship-fill-crop/);
});
test('gauge label escapes text and rejects arbitrary modifier classes', () => {
  assert.match(hudBarMarkup('<fuel>','energy'),/&lt;fuel&gt;/);
  assert.match(hudBarMarkup('x','unknown'),/sf-bar--energy/);
});
test('range input previews; change commits once; paint handles a nonzero minimum', () => {
  const input=new EventTarget(), paint=new Map(), calls=[];
  Object.assign(input,{min:'20',max:'80',value:'50',style:{setProperty:(k,v)=>paint.set(k,v)}});
  const label={textContent:''};bindCommittedRange(input,label,v=>v+'%',(value,persist)=>calls.push({value,persist}));
  assert.equal(paint.get('--sf-range-fill'),'50.0%');assert.deepEqual(calls,[]);
  input.value='65';input.dispatchEvent(new Event('input'));input.dispatchEvent(new Event('change'));
  assert.deepEqual(calls,[{value:65,persist:false},{value:65,persist:true}]);assert.equal(label.textContent,'65%');assert.equal(paint.get('--sf-range-fill'),'75.0%');
});
test('real research readiness still checks prerequisites, credits and points', () => {
  const node={id:'b',name:'B',prereqs:['a'],cost:{credits:6000,rp:10}};
  const state={player:{credits:18000,researchPoints:12,researchedNodes:[]}};
  assert.notEqual(describeTechNodeReadiness(node,state,[{id:'a',name:'A'},node]).state,'available');
  state.player.researchedNodes=['a'];assert.equal(describeTechNodeReadiness(node,state,[node]).state,'available');
  state.player.researchPoints=0;assert.notEqual(describeTechNodeReadiness(node,state,[node]).state,'available');
});
test('runtime imports shared production views; fixture is never loaded by the game', () => {
  for(const [file,symbol] of [['screens/mainMenu.js','createTitleFrame'],['screens/pause.js','createPauseFrame'],['screens/settings.js','paneBuilder'],['station/screens/market.js','marketQuoteHtml'],['station/screens/contracts.js','contractDossierView'],['galaxyMap.js','navigationFrameHtml'],['hud.js','shipConditionMarkup'],['targetPanel.js','targetFrameHtml'],['screens/saveLoad.js','createSaveStage']]) {
    const source=read('../src/ui/'+file);assert.ok(source.includes(symbol),file);assert.doesNotMatch(source,/ORBITAL_QA|orbital-interface/);
  }
  const html=read('../index.html');assert.match(html,/styles\/orbital\.css/);assert.doesNotMatch(html,/commandDeckRefit\.js|command-deck-refit\.css|orbital-interface/);
});
test('presentation helpers cannot schedule frames, query a server, or mutate gameplay', () => {
  for(const file of ['identity','marketPresentation','contractPresentation','flightInstruments','navigationFrame','targetFrame','saveFrame','stationFrames']) {
    const source=read('../src/ui/views/'+file+'.js');assert.doesNotMatch(source,/requestAnimationFrame\s*\(|fetch\s*\(|new MutationObserver|setInterval\s*\(/,file);
  }
});

test('trend renders missing history as unavailable, not a fabricated flat trend', () => {
  for (const history of [[],[12],[NaN,Infinity],[0,1],null]) {
    const html=trendHtml(history);assert.match(html,/History unavailable/);assert.doesNotMatch(html,/NaN|Infinity|▲0%/);
  }
  assert.match(trendHtml([100,110]),/▲10%/);assert.match(trendHtml([100,90]),/▼10%/);
});
