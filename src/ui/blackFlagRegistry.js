// The fleet rail's registry lens. It uses existing Shipworks typography/ladder and
// never owns a transaction, fitting, cargo hold, title or quote calculation.
import { SHIPS } from '../data/ships.js';
import { SECTORS } from '../data/sectors.js';
import { BLACK_FLAG_TERMS } from '../data/blackFlag.js';
import { quoteYardOperation } from '../shipjack/yardOperations.js';
import { quoteFleetOperation } from '../shipjack/fleetOperations.js';
import { valuationBreakdown, inspectVessel, componentDefinition } from '../shipjack/market.js';
import { isBlackFlagAdventure } from '../shipjack/model.js';
import { inspectComponentProvenance, inspectFittedComponents, quoteModuleSale } from '../shipjack/componentProvenance.js';
import { arcGauge } from './orrery/instruments.js';
import { svg } from './orrery/svg.js';
import { dressLampKey } from './orrery/lampKey.js';
import { injectBlackFlagRegistryLayout } from './orrery/blackFlagRegistryLayouts.js';

const HULLS = new Map(SHIPS.map(row => [row.id, row]));
const SECTOR_NAMES = new Map(SECTORS.map(row => [row.id, row.name]));
const STATIONS = new Map(SECTORS.flatMap(row => (row.stations || []).map(station => [station.id, station.name])));
const SERVICE_LABELS = Object.freeze({ sell: 'Offer intact hull', return: 'Return to registered owner',
  register: 'File salvage title', settle_title: 'Compensate claimant / buy title', extract: 'Extract this part', repair_module: 'Restore this part',
  forge_broadcast: 'Copy service broadcast', repaint: 'Rework registry marks', settle_lien: 'Settle lender lien',
  recover: 'Send recovery tug', secure_berth: 'Reserve a secure berth', module_sell: 'Spare component offer' });
const integer = value => Math.max(0, Math.floor(Number(value) || 0)).toLocaleString('en-US');

export function vesselLocationText(vessel) {
  const loc = vessel?.location || {};
  const sector = SECTOR_NAMES.get(loc.sectorId) || 'Unconfirmed sector';
  if (loc.kind === 'active') return `Piloted · ${sector}`;
  if (loc.kind === 'missing') return `Signal lost · last recorded in ${sector} · plot the last trajectory; recovery is unconfirmed`;
  if (loc.kind === 'berth') return `Berthed · ${STATIONS.get(loc.stationId) || 'Unconfirmed berth'}`;
  if (loc.kind === 'field' || loc.kind === 'remote' || loc.kind === 'tow') {
    const position = loc.pos;
    return `${loc.kind === 'tow' ? 'In tow' : 'Field parked'} · ${sector}${position && Number.isFinite(position.x) && Number.isFinite(position.z) ? ` · ${Math.round(position.x)}, ${Math.round(position.z)} u` : ''}${vessel.beacon ? ' · beacon marked' : ''}`;
  }
  return ({ in_transit: 'Recovery tug carrying the hull to a named berth', destroyed: 'Lost hull · last trajectory recorded', impounded: 'Impounded · registry hold',
    returned: 'Returned to owner', sold: 'Released to buyer' })[loc.kind] || 'Location unconfirmed';
}

export function yardQuotePreview(quote) {
  if (quote.action === 'module_sell') return `${componentDefinition(quote.defId)?.name || 'Spare component'} · ${Math.round(quote.condition*100)}% condition. Receive ${integer(quote.amount)} credits${quote.fenceId ? ' after the fence cut' : ''}. This exact part leaves your module inventory; fitted parts and the hull remain.`;
  if (quote.action === 'recover' || quote.action === 'secure_berth') {
    return `Recovery tug to ${quote.stationName || STATIONS.get(quote.stationId) || 'the receiving station'}. Cost ${integer(quote.feeCr)} credits. Pickup in ${integer(quote.pickupAt-quote.departureAt)}s; delivery in ${integer(quote.arrivalAt-quote.departureAt)}s after departure. ${quote.riskLine || 'The tug must reach the recorded hull before it can bring anything home.'}`;
  }
  const part = quote?.value?.parts?.find(row => row.slotIndex === quote.slotIndex);
  const amount = Number(quote?.amount) || 0;
  const cost = amount < 0 ? `Cost ${integer(-amount)} credits` : `Receive ${integer(amount)} credits`;
  const notes = [cost];
  if (quote.action === 'extract' && part) {
    notes.push(`${componentDefinition(part.defId)?.name || 'Fitted component'} moves to your module inventory, retaining its identity and ${Math.round(part.condition * 100)}% condition`);
    if (part.family === 'engine') notes.push('Removing the drive strands this hull until a compatible drive is fitted');
    notes.push('The yard works while you are away; return to this berth to collect. The hull cannot also be sold with this part');
  }
  if (quote.action === 'sell') notes.push('Hull and all remaining fitted parts leave your fleet. This sale cannot be repeated');
  if (quote.action === 'return') notes.push('Custody passes back to the claimant. You keep the recovery receipt, not the hull');
  if (quote.action === 'forge_broadcast') notes.push('Consumes one Cargo Scanner S from inventory. Basic broadcast checks may pass; engine and title checks still expose the mismatch');
  if (quote.action === 'repaint') notes.push('Changes recorded external marks. The frame, engine signature and title remain traceable');
  if (quote.action === 'register') notes.push('Registry adjudicates an eligible abandoned frame; this cannot wash a theft');
  if (quote.action === 'settle_title') notes.push(`Claimant compensation ${integer(quote.value?.claimantCompensation)} credits plus registry service ${integer(quote.value?.titleServiceFee)} credits. You retain this damaged hull under lawful title and receive a lawful broadcast registration. Recorded offenses, lender liens and the source history of fitted parts remain`);
  return notes.join('. ') + '.';
}

export function registryVesselModel(state, vesselId) {
  const sj = state.player?.shipjack || state.shipjack;
  const vessel = sj?.vesselsById?.[vesselId];
  if (!vessel) return null;
  const owned = state.player?.ownedShips?.find(row => row.vesselId === vesselId);
  const value = owned ? valuationBreakdown(vessel, owned) : null;
  const inspection = inspectVessel(vessel, { grade: 3, jurisdiction: 'registry' });
  const components = inspectFittedComponents(state, owned?.fittedInstances, { grade: 3 });
  inspection.findings.push(...components.findings); inspection.accepted &&= components.accepted;
  return { vessel, owned, name: vessel.name || HULLS.get(vessel.defId)?.name || 'Unidentified vessel',
    hullName: HULLS.get(vessel.defId)?.name || 'Unidentified hull', location: vesselLocationText(vessel),
    title: BLACK_FLAG_TERMS[vessel.title] || 'Title unresolved',
    condition: Math.max(0, Math.min(1, Number(vessel.condition?.hull) || 0)),
    latest: vessel.history?.at(-1)?.text || 'No incident recorded.', value, inspection,
    job: sj?.yards?.[vesselId] || null, fleetJob:sj?.fleetOperations?.[vesselId] || null };
}

export function createBlackFlagRegistry(ctx, { dockHost = () => true } = {}) {
  const doc = document;
  injectBlackFlagRegistryLayout(doc);
  const el = doc.createElement('details');
  el.className = 'orr-blackflag-registry';
  el.dataset.blackFlagRegistry = '';
  const summary = doc.createElement('summary'); summary.className = 'k-word k-word--body';
  summary.textContent = 'Registry & recovery';
  const body = doc.createElement('div'); body.className = 'k-rows';
  el.append(summary, body);
  let selectedId = null, viewedId = null, selectedQuote = null, pending = false, stamp = '', gauge = null;
  let lastViewed = null;
  const offs = [];
  const node = (tag, className, text) => { const out = doc.createElement(tag); out.className = className; out.textContent = text; return out; };
  const line = text => body.appendChild(node('p', 'k-sentence', text));
  const button = (parent, text, run, options = {}) => {
    const out = node('button', options.primary ? 'k-word k-word--body' : 'k-row', text);
    out.type = 'button'; out.disabled = options.disabled === true; out.title = options.reason || '';
    out.setAttribute('aria-label', `${text}${options.reason ? `. ${options.reason}` : ''}`);
    if (options.primary) dressLampKey(out);
    out.addEventListener('click', event => { event.stopPropagation(); run(); }); parent.appendChild(out); return out;
  };
  const render = viewed => {
    lastViewed = viewed;
    const sj = ctx.state.player?.shipjack || ctx.state.shipjack;
    const vessels = Object.values(sj?.vesselsById || {});
    el.hidden = !isBlackFlagAdventure(ctx.state) || !vessels.length;
    if (el.hidden) return;
    if (viewed?.vesselId !== viewedId) { viewedId = viewed?.vesselId || null; selectedId = viewedId; selectedQuote = null; stamp = ''; }
    if (!selectedId || !sj.vesselsById[selectedId]) selectedId = viewedId || vessels[0].vesselId;
    const model = registryVesselModel(ctx.state, selectedId);
    if (!model) return;
    const next = JSON.stringify([selectedId, vessels.map(row => [row.vesselId,row.revision,row.location]), model.owned?.fittings,
      model.owned?.fittedInstances, ctx.state.player?.moduleInventory, model.job, model.fleetJob, ctx.state.ui?.dockedStationId, dockHost(), selectedQuote, pending]);
    if (next === stamp) return;
    stamp = next; gauge?.dispose(); gauge = null; body.replaceChildren();
    const list = node('div', 'k-rows', ''); list.setAttribute('aria-label', 'Known vessel registry');
    vessels.filter(row => row.custodian === 'player' || !['returned','sold','destroyed'].includes(row.location?.kind)).slice(0, 16).forEach(row => {
      const choice = button(list, `${row.name || HULLS.get(row.defId)?.name || 'Vessel'} · ${vesselLocationText(row)}`, () => {
        selectedId = row.vesselId; selectedQuote = null; stamp = ''; render(lastViewed);
      });
      choice.setAttribute('aria-pressed', String(row.vesselId === selectedId));
    });
    body.appendChild(list);
    body.appendChild(node('h3', 'k-t-sub', `${model.name} · ${model.hullName}`));
    line(model.location); line(model.title);
    const dial = svg('svg', { viewBox: '0 0 120 54', width: 120, height: 54, class: 'orr-svg', 'aria-label': `Hull integrity ${Math.round(model.condition * 100)} percent`, role: 'img' });
    gauge = arcGauge({cx:60,cy:49,r:38,from:270,to:450,ghost:false,head:false});
    gauge.set(model.condition,{instant:true}); dial.appendChild(gauge.el); body.appendChild(dial);
    line(`Hull ${Math.round(model.condition * 100)}%${model.owned?.shipjackDriveRemoved ? ' · Drive removed: cannot fly' : ''} · ${model.vessel.crewSafe ? 'Crew safe' : model.vessel.crew || 'Crew status unconfirmed'}`);
    line(model.latest);
    if (model.inspection.findings.length) line(`Registry checks: ${model.inspection.findings.join('; ')}. ${model.inspection.advice}`);
    if (model.value) line(`Physical value: shell ${integer(model.value.shell)} cr; fitted parts ${integer(model.value.componentValue)} cr. Honest intact offer ${integer(model.value.intact)} cr.`);
    if (model.job) {
      const remaining = Math.max(0,Math.ceil((Number(model.job.completesAt) || 0) - (ctx.state.simTime || 0)));
      const receiving = STATIONS.get(model.job.stationId) || 'the receiving yard';
      line(remaining > 0 ? `Yard work: ${remaining}s while you are away. Undock, then return to ${receiving} for the part.`
        : `Part ready — return to ${receiving} for the exact fitted component.`);
    }
    if (model.fleetJob) {
      const job=model.fleetJob;
      line(`Recovery tug ${job.status === 'queued' ? 'preparing to depart' : job.status === 'towing' ? 'carrying your hull' : 'outbound to the recorded hull'}. Destination: ${STATIONS.get(job.stationId) || 'the receiving yard'}.`);
      if (job.status === 'queued' && (ctx.state.simTime || 0) < job.departureAt) button(body,'Cancel tow before departure',()=>
        ctx.bus.emit('ui:shipjack',{action:'cancel_recovery',vesselId:selectedId,jobOperationId:job.operationId,operationId:`cancel:${job.operationId}`}));
    }
    if (['field','remote','tow','missing'].includes(model.vessel.location?.kind)) button(body, model.vessel.location.kind==='missing'?'Plot last trajectory':'Plot recovery course', () =>
      ctx.bus.emit('ui:shipjack', { action:'navigate', vesselId:selectedId }));
    if (!dockHost()) { line('Dock at a receiving yard for registry, extraction and sale services.'); return; }
    if (selectedQuote) {
      body.appendChild(node('h4', 'k-caps', SERVICE_LABELS[selectedQuote.action] || 'Yard quote'));
      line(yardQuotePreview(selectedQuote));
      button(body, pending ? 'Request transmitted' : 'Accept this quote', () => {
        if (pending) return;
        pending = true; stamp = ''; render(lastViewed);
        const quote = selectedQuote;
        ctx.bus.emit('ui:shipjack', { action:quote.action, vesselId:quote.vesselId, slotIndex:quote.slotIndex, instanceId:quote.instanceId,
          operationId:`${quote.action === 'module_sell' ? 'part' : quote.action === 'recover' || quote.action === 'secure_berth' ? 'fleet' : 'yard'}:${quote.fingerprint}:${quote.instanceId || quote.vesselId}`, quote });
      }, { disabled:pending, primary:true });
      button(body, 'Back to vessel', () => { if (pending) return; selectedQuote = null; stamp = ''; render(lastViewed); }, {disabled:pending});
      return;
    }
    const spares = doc.createElement('details'); spares.appendChild(node('summary','k-word k-word--body','Spare components / resale'));
    for (const item of (ctx.state.player.moduleInventory || []).slice(0,32)) {
      const definition=componentDefinition(item.defId), evidence=inspectComponentProvenance(ctx.state,item);
      const offer=quoteModuleSale(ctx.state,{instanceId:item.instanceId});
      spares.appendChild(node('p','k-sentence',`${definition?.name || 'Spare component'} · ${Math.round((Number.isFinite(item.condition)?item.condition:1)*100)}% condition${evidence.unresolved?' · disputed source frame':''}`));
      button(spares,offer.ok?`Offer spare · ${integer(offer.quote.amount)} cr`:'Sale unavailable',()=>{
        selectedQuote={...offer.quote,action:'module_sell'};stamp='';render(lastViewed);
      },{disabled:!offer.ok,reason:offer.reason});
      if(!offer.ok)spares.appendChild(node('p','k-t-fine',offer.reason));
    }
    if(!ctx.state.player.moduleInventory?.length)spares.appendChild(node('p','k-sentence','No spare components. Unfit or extract an exact fitted part to offer it here.'));
    body.appendChild(spares);
    if (!model.owned || model.vessel.custodian !== 'player') { line('Observe this frame in flight to negotiate, recover it, or contest custody.'); return; }
    const service = (parent, action, slotIndex = null) => {
      const offer = quoteYardOperation(ctx.state, { vesselId:selectedId, action, slotIndex });
      const text = SERVICE_LABELS[action];
      button(parent, text, () => { selectedQuote = offer.quote; stamp = ''; render(lastViewed); }, {disabled:!offer.ok || !!model.job,reason:offer.reason});
      if (!offer.ok) parent.appendChild(node('p','k-t-fine', offer.reason));
    };
    if (!model.fleetJob && ['field','remote'].includes(model.vessel.location?.kind)) {
      const offer=quoteFleetOperation(ctx.state,{vesselId:selectedId,action:'recover'});
      button(body,SERVICE_LABELS.recover,()=>{selectedQuote=offer.quote;stamp='';render(lastViewed);},{disabled:!offer.ok,reason:offer.reason});
      if(!offer.ok)line(offer.reason);
    }
    for (const action of ['return','sell','register','settle_title']) service(body,action);
    const identity = doc.createElement('details'); identity.appendChild(node('summary','k-word k-word--body','Identity & lender services'));
    for (const action of ['forge_broadcast','repaint','settle_lien']) service(identity,action);
    body.appendChild(identity);
    const parts = doc.createElement('details'); parts.appendChild(node('summary','k-word k-word--body','Parts / controlled dismantling'));
    for (const part of model.value?.parts || []) {
      const definition = componentDefinition(part.defId);
      parts.appendChild(node('p','k-sentence',`${definition?.name || 'Fitted part'} · ${Math.round(part.condition*100)}% condition · ${integer(part.value)} cr material value`));
      service(parts,'extract',part.slotIndex); service(parts,'repair_module',part.slotIndex);
    }
    if (!model.value?.parts?.length) parts.appendChild(node('p','k-sentence','No fitted parts remain. The hull shell has a separate value.'));
    body.appendChild(parts);

  };
  const settled = result => {
    if (result?.vesselId && result.vesselId !== selectedId) return;
    pending = false; selectedQuote = null; stamp = ''; render(lastViewed);
  };
  for (const event of ['shipjack:result','shipjack:yardReceipt','shipjack:fleetReceipt','shipjack:fleetArrived']) {
    const off = ctx.bus.on(event,settled); if (typeof off === 'function') offs.push(off);
  }
  return { el, render, dispose() { offs.forEach(off => off()); gauge?.dispose(); el.remove(); } };
}
