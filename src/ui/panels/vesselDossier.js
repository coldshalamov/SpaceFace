/** Read-only, lifecycle-driven ship instrument. The values come from the live entity, never a mock hull. */
import { SHIPS } from '../../data/ships.js';
import { SECTORS } from '../../data/sectors.js';
import { instrumentGlyph } from '../kit/insignia.js';
const HULLS = new Map(SHIPS.map(s => [s.id, s]));
const PLACES = new Map(SECTORS.map(s => [s.id, s.name]));
const finite = v => v == null || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null;
const clamp = v => Math.min(1, Math.max(0, v));
const fmt = v => v === null ? '—' : Math.round(v).toLocaleString('en-US');
export function vesselDossierModel(state) {
  const player = state?.player || {};
  const owned = player.ownedShips?.[player.activeShipIndex || 0];
  const entity = state?.entities?.get?.(state.playerId) || null;
  const id = owned?.defId || entity?.data?.defId || player.shipId;
  const hull = HULLS.get(id);
  const read = (label, value, max, icon, scarce = true) => {
    value = finite(value); max = finite(max);
    const ratio = value !== null && max > 0 ? clamp(value / max) : null;
    return { label, value, max, icon, ratio, low: ratio !== null && (scarce ? ratio < .25 : ratio > .9),
      text: ratio === null ? '—' : `${Math.round(ratio * 100)}%`,
      description: `${label}: ${fmt(value)} of ${fmt(max)}` };
  };
  const cargo = player.cargo || {};
  const meters = [read('Hull', entity?.hull, entity?.hullMax, 'ship'),
    read('Shield', entity?.shield, entity?.shieldMax, 'shield'),
    read('Fuel', state?.fuel?.current, state?.fuel?.max, 'fuel'),
    read('Hold', cargo.usedVolume, cargo.capVolume, 'market', false)];
  const hullRatio = meters[0].ratio;
  return { id, name: owned?.name || hull?.name || 'Your ship',
    role: hull?.role ? `${hull.role[0].toUpperCase()}${hull.role.slice(1)} · Tier ${hull.tier}` : 'Flight status',
    sector: PLACES.get(state?.world?.currentSectorId) || 'Position unavailable',
    credits: fmt(finite(player.credits)),
    condition: hullRatio === null ? 'Awaiting telemetry' : hullRatio <= .2 ? 'Critical damage' : hullRatio < .75 ? 'Hull damaged' : 'Flight ready',
    critical: hullRatio !== null && hullRatio <= .2, meters };
}
function node(tag, cls, text) { const e = document.createElement(tag); e.className = cls; if(text!=null)e.textContent=text; return e; }
export function createVesselDossier(state) {
  const element = node('section', 'cd-vessel');
  const mast = node('div', 'cd-vessel__mast');
  const icon = node('div','cd-vessel__insignia'); icon.innerHTML = instrumentGlyph('ship'); icon.setAttribute('aria-hidden','true');
  const head=node('div',''); const name=node('h2','cd-vessel__name'); const role=node('p','cd-vessel__role'); head.append(name,role); mast.append(icon,head);
  const sector=node('p','cd-vessel__sector'); const condition=node('p','cd-vessel__condition');
  const art=node('img','cd-vessel__art');art.alt='';art.setAttribute('aria-hidden','true');art.width=420;art.height=180;
  art.addEventListener('error',()=>{art.hidden=true;});
  const meters=node('div','cd-vessel__meters');
  const meterRefs=Array.from({length:4},()=>{
    const row=node('div','cd-vessel__meter');const label=node('span','');const track=node('span','cd-vessel__track');const fill=node('span','cd-vessel__fill');const value=node('strong','');
    track.append(fill);track.setAttribute('aria-hidden','true');row.append(label,track,value);meters.append(row);return {row,label,fill,value};
  });
  const balance=node('p','cd-vessel__balance');
  element.append(mast,sector,art,condition,meters,balance);
  let lastId = null;
  const update = current => {
    const model=vesselDossierModel(current);
    name.textContent=model.name; role.textContent=model.role; sector.textContent=model.sector;
    condition.textContent=model.condition; element.dataset.critical=String(model.critical);balance.textContent=`${model.credits} CR available`;
    if(model.id!==lastId){lastId=model.id;art.hidden=model.id!=='ship_kestrel';if(!art.hidden)art.src='assets/ui/command-deck/hitch-plan.svg';}
    model.meters.forEach((m,i)=>{const r=meterRefs[i];r.label.textContent=m.label;r.row.dataset.low=String(m.low);r.row.setAttribute('aria-label',m.description);r.fill.style.setProperty('--value',m.ratio??0);r.value.textContent=m.text;});
    return model;
  };
  update(state);return {element,update};
}
