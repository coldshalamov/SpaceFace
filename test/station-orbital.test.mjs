// Orbital station contracts. Run with Node 22+ after the repository's usual npm install.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stationMotionAllowed } from '../src/ui/station/stationEffects.js';
import { stationIcon, stationSymbolsHtml, stationSealHtml } from '../src/ui/station/stationArt.js';
import { maxAffordableQuantity } from '../src/ui/station/screens/market.js';
import { marketTradeHtml, marketRowHtml } from '../src/ui/views/marketPresentation.js';
import { stationFrameHtml, marketFrameHtml } from '../src/ui/views/stationFrames.js';

// Tests follow 15da68c1fe: a quote must echo the quantity it prices (`fullQuantityQuote` rejects
// a book that answers for a different lot), so this stub stamps its own qty like the real owner.
const cost = q => ({ ok: true, qty: q, total: q * 30 + q * q });
test('ordinary settings allow station motion', () => assert.equal(stationMotionAllowed({}), true));
test('OS reduce-motion veto wins over normal game settings', () => assert.equal(stationMotionAllowed({}, true), false));
test('game motion reduction veto', () => assert.equal(stationMotionAllowed({settings:{video:{motionReduce:true}}}), false));
test('game flash reduction veto', () => assert.equal(stationMotionAllowed({settings:{accessibility:{flashReduce:true}}}), false));
test('a nonlinear canonical quote, not unit price multiplication, controls Max', () => {
  const q = maxAffordableQuantity({limit:100,credits:300,quote:cost});
  assert.ok(cost(q).total <= 300); assert.ok(cost(q + 1).total > 300); assert.equal(q,7);
});
test('physical/stock limit bounds Max even with ample credits', () => assert.equal(maxAffordableQuantity({limit:3.9,credits:10000,quote:cost}),3));
test('invalid or infinite query parameters fail closed and terminate', () => {
  for (const limit of [NaN,Infinity,-Infinity,-1]) assert.equal(maxAffordableQuantity({limit,credits:10,quote:cost}),0);
  for (const credits of [NaN,Infinity,-1]) assert.equal(maxAffordableQuantity({limit:10,credits,quote:cost}),0);
  assert.equal(maxAffordableQuantity({limit:10,credits:100,quote:null}),0);
});
test('unavailable / nonfinite quotes cannot be afforded', () => {
  assert.equal(maxAffordableQuantity({limit:10,credits:100,quote:()=>({ok:false,total:0})}),0);
  assert.equal(maxAffordableQuantity({limit:10,credits:100,quote:()=>({ok:true,total:NaN})}),0);
});
test('Max search is logarithmic for large capacity', () => {
  let calls=0;
  // Tests follow 15da68c1fe: the quote must echo the lot it prices, as the real owner does.
  const result=maxAffordableQuantity({limit:1000000,credits:500001,quote:q=>{calls++;return {ok:true,qty:q,total:q};}});
  assert.equal(result,500001);assert.ok(calls<=21, String(calls));
});
test('20 unique authored icon symbols have stable view boxes', () => {
  const art=stationSymbolsHtml();const ids=[...art.matchAll(/<symbol id="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(ids.length,20);assert.equal(new Set(ids).size,20);
  assert.equal((art.match(/<symbol[^>]+viewBox="0 0 24 24"/g)||[]).length,20);
  assert.doesNotMatch(art,/<script|onload=|(?:href|src)="https?:/i);
});
test('icon names cannot inject SVG and unknown names resolve to the cargo glyph', () => {
  const svg=stationIcon('"/><script>bad</script>', 'safe" onclick="bad');
  assert.match(svg, /href="#so-cargo"/);assert.doesNotMatch(svg,/<script|onclick=/);
});
test('seal has real trace / rotating component hooks, no bitmap', () => {
  const svg=stationSealHtml();assert.match(svg,/so-orbit__rotor/);assert.match(svg,/so-orbit__trace/);assert.doesNotMatch(svg,/<image/);
});
test('the execution ticket contains the full quote plus disabled execution when invalid', () => {
  const html=marketTradeHtml({mode:'buy',qty:0,canAct:false,totalLabel:'Total cost',totalText:'0 cr',receiptHtml:'<div>Breakdown</div>'});
  assert.match(html,/data-trade-total/);assert.match(html,/so-trade-breakdown/);assert.match(html,/data-go[^>]*disabled|disabled[^>]*data-go/);
});
test('quote total and note escape markup', () => {
  const html=marketTradeHtml({mode:'sell',qty:1,canAct:true,totalLabel:'Receivable',totalText:'<img onerror=bad>',note:'<script>bad</script>',receiptHtml:''});
  assert.doesNotMatch(html,/<img|<script/);assert.match(html,/&lt;/);
});
test('commodity identity and labels escape markup', () => {
  const html=marketRowHtml({id:'x" onmouseover="bad',name:'<img src=x>',buy:2,sell:1,stock:5});
  assert.doesNotMatch(html,/<img|data-cmdty="x" onmouseover/);assert.match(html,/&lt;img/);
});
test('station and market frame expose stable analysis / execution hooks without the retired command palette', () => {
  assert.doesNotMatch(stationFrameHtml(),/so-command-trigger/);assert.match(stationFrameHtml(),/data-act="undock"/);
  assert.match(marketFrameHtml(),/sx-mkt__analysis/);assert.match(marketFrameHtml(),/sx-mkt__console/);
});
test('station controller loads the new stylesheet on the default docking path', async () => {
  const src=await readFile(new URL('../src/ui/station/stationApp.js',import.meta.url),'utf8');
  // Tests follow a596aa9d24 (ledger D15): the station sheet set lives in ./stationStyles.js so game
  // boot can load it without the station app's graph; stationApp re-exports and calls it. The old
  // createStationCommands module was retired — nothing constructs a command dock in the four-door
  // station any more (f791a472da).
  assert.match(src,/createStationEffects/);
  const stylesSrc=await readFile(new URL('../src/ui/station/stationStyles.js',import.meta.url),'utf8');
  assert.match(stylesSrc,/\/styles\/station-orbital\.css/,'the sheet set still names the orbital sheet');
  assert.match(src,/ensureStylesheet/,'the app loads that set on the docking path');
});
