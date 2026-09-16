import { shipConditionMarkup, updateShipCondition } from '../../src/ui/views/hullIntegrity.js';
import { SHIP_SILHOUETTES } from '../../src/data/shipSilhouettes.js';
const host = document.querySelector('#instrument');
const player = { id:'preview-player', hull:86, hullMax:100, shield:78, shieldMax:100, data:{defId:'ship_kestrel'} };
const ids = Object.keys(SHIP_SILHOUETTES);
const $ = id => document.getElementById(id);
host.innerHTML = shipConditionMarkup(player.data.defId, 'preview-primary');
for (const id of ids) { const option = document.createElement('option'); option.value = id; option.textContent = id.slice(5).toUpperCase(); $('ship').appendChild(option); }
let frame = 0, last = 0, until = 0, mode = null;
let osReduce = matchMedia('(prefers-reduced-motion: reduce)');
function paint(dt=0) {
  updateShipCondition(host, player, dt, $('reduce').checked || osReduce.matches, $('flash').checked);
  $('hull').value = player.hull; $('shield').value = player.shield;
  $('hullOut').textContent = Math.round(player.hull) + '%'; $('shieldOut').textContent = Math.round(player.shield) + '%';
}
// Only this fixture owns a demonstration clock. It sleeps after a finite interaction and is
// deliberately not imported by production. Gameplay supplies its already-existing frame instead.
function animate(now) {
  const dt = last ? Math.min(.1, (now-last)/1000) : 0; last = now;
  if (mode === 'charge' && player.shield < 100) player.shield = Math.min(100, player.shield + dt*35);
  if (mode === 'repair' && player.hull < 100) player.hull = Math.min(100, player.hull + dt*30);
  paint(dt);
  if (now < until && !document.hidden) frame = requestAnimationFrame(animate);
  else { frame = 0; mode = null; paint(1); $('motionLog').textContent = 'Settled. No idle animation loop.'; }
}
function wake(duration=1000) {
  until = performance.now()+duration;
  if (!frame) { last = performance.now(); frame = requestAnimationFrame(animate); }
  $('motionLog').textContent = 'Showing the change; live values remain authoritative.';
}
for (const key of ['hull','shield']) $(key).addEventListener('input', () => { mode = null; player[key] = Number($(key).value); paint(0); wake(); });
$('ship').addEventListener('change', () => { player.data.defId = $('ship').value; paint(0); });
$('hit').addEventListener('click', () => { mode = null; player.hull = Math.max(0, player.hull-19); player.shield = Math.max(0, player.shield-31); paint(0); wake(); });
$('repair').addEventListener('click', () => { mode = 'repair'; wake(4500); });
$('charge').addEventListener('click', () => { mode = 'charge'; wake(4000); });
$('reset').addEventListener('click', () => { mode = null; player.hull = 100; player.shield = 100; paint(1); });
for (const key of ['reduce','flash']) $(key).addEventListener('change', () => { document.documentElement.classList.toggle('sf-reduce-motion', $('reduce').checked); document.documentElement.classList.toggle('sf-reduce-flash',$('flash').checked); paint(0); });
$('contrast').addEventListener('change', () => document.documentElement.classList.toggle('sf-high-contrast',$('contrast').checked));
osReduce.addEventListener?.('change', () => paint(0));
document.addEventListener('visibilitychange', () => { if (document.hidden) { if (frame) cancelAnimationFrame(frame); frame=0; mode=null; paint(1); } });
const states = [ ['Full integrity',100,100], ['Hull damaged',43,62], ['Hull critical',18,0], ['Telemetry lost',NaN,NaN] ];
for (const [name,h,s] of states) {
  const card = document.createElement('article'); card.className='state';
  const title=document.createElement('h2');title.textContent=name;card.appendChild(title);
  const instrument=document.createElement('div');instrument.className='sf-schematic sf-integrity';instrument.innerHTML=shipConditionMarkup('ship_kestrel');card.appendChild(instrument);
  $('states').appendChild(card); updateShipCondition(instrument,{...player,hull:h,shield:s},0,true,true);
}
for (const id of ids) {
  const instrument=document.createElement('div');instrument.className='sf-schematic sf-integrity';instrument.innerHTML=shipConditionMarkup(id);$('atlas').appendChild(instrument);
  updateShipCondition(instrument,{...player,hull:100,shield:100,data:{defId:id}},0,true,true);
}
paint(0);
window.LAMINA_QA = { host, player, paint, updateShipCondition, shipConditionMarkup, ids, get frame(){return frame;} };
