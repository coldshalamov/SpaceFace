// Imported by shipjack; no second inventory, wallet, heat, or reward owner.
import { SECTORS } from '../data/sectors.js';
import { fenceForStation } from '../data/fences.js';
import { BLACK_FLAG_YARD_BY_STATION } from '../data/blackFlag.js';
import { ensureShipjack, isBlackFlagAdventure } from './model.js';
import { createYardQuote, validateYardQuote, componentDefinition } from './market.js';

const STATIONS = new Map(SECTORS.flatMap((s) => (s.stations || []).map((st) => [st.id, { ...st, sectorId: s.id }])));
const ACTIONS = new Set(['sell', 'return', 'extract', 'repair_module', 'register', 'settle_title', 'forge_broadcast', 'repaint', 'settle_lien']);
const RECEIPT_CAP = 128;
const MAX_JOBS = 8;
const IN_FLIGHT = new WeakSet(); // transient reentrancy guard; never a serializable transfer
const bad = (reason) => ({ ok: false, reason });

function factorsFor(state, payload) {
  if (!isBlackFlagAdventure(state)) return bad('Shipworks custody is available in Adventure only');
  const vessel = state.shipjack?.vesselsById?.[payload?.vesselId] || state.player?.shipjack?.vesselsById?.[payload?.vesselId];
  const owned = state.player?.ownedShips?.find((s) => s.vesselId === payload?.vesselId);
  const stationId = state.ui?.docked === true ? state.ui.dockedStationId : null;
  const station = STATIONS.get(stationId);
  if (!station) return bad('Dock at a receiving yard first');
  if (!vessel || !owned || vessel.custodian !== 'player') return bad('This vessel is no longer in your custody');
  if (!ACTIONS.has(payload.action)) return bad('Unknown yard service');
  const active = state.player.ownedShips[state.player.activeShipIndex] === owned;
  const atBerth = vessel.location?.kind === 'berth' && vessel.location.stationId === stationId;
  if (!active && !atBerth) return bad('Deliver this vessel to this yard before requesting work');
  const illicit = !!fenceForStation(stationId);
  if (!(station.services || []).some((s) => s === 'shipyard' || s === 'repair') && !illicit) return bad('This port has no receiving yard');
  const saturation = Number((state.shipjack || state.player?.shipjack)?.yardDemand?.[`${stationId}:${owned.defId}`]) || 0;
  return { ok: true, vessel, owned, station, stationId, action: payload.action,
    slotIndex: payload.slotIndex ?? null, simTime: Number(state.simTime) || 0, illicit, saturation, active };
}

function serviceBlocker(state, f) {
  const { vessel, owned, action, active, illicit, slotIndex } = f;
  if (['sell', 'return'].includes(action)) {
    if (active) return 'Change to another ship before releasing this hull';
    if (Object.values(owned.cargo?.items || {}).some((v) => Number(v) > 0)) return 'Empty the cargo hold before releasing the vessel';
  }
  if (action === 'sell') {
    if (!illicit && vessel.title !== 'clean') return 'Unresolved title — return the hull, obtain salvage title, or find a fence';
    if (!illicit && Number(vessel.lienCr) > 0) return 'Settle the lender lien before honest resale';
  }
  if (action === 'return' && ['returned', 'clean'].includes(vessel.title)) return 'No outstanding owner recovery claim';
  if (action === 'register' && !(vessel.title === 'salvage'
    && (vessel.salvageEligible === true || ['unregistered', 'abandoned'].includes(vessel.originalOwner)))) {
    return 'Registry needs an abandoned-frame salvage claim; custody alone is not title';
  }
  if (action === 'register' && illicit) return 'A lawful registry must adjudicate this salvage claim';
  if (action === 'settle_title') {
    const yard = BLACK_FLAG_YARD_BY_STATION.get(f.stationId);
    if (illicit || !yard || !['lawful', 'authority'].includes(yard.kind)) return 'A licensed recovery registry must arrange claimant compensation';
    if (!['active', 'berth'].includes(vessel.location?.kind) || vessel.location.stationId !== f.stationId) return 'Physically berth this hull at the licensed registry before buying title';
    if (vessel.title !== 'disputed' || vessel.claimResolved) return 'No unresolved registered-owner claim is available to purchase';
    if (!vessel.recognizedOwner || ['player', 'unregistered', 'abandoned', 'unclaimed', 'unknown', 'yard'].includes(vessel.recognizedOwner)) return 'No registered claimant can authorize a title purchase; use salvage adjudication where eligible';
    if (!vessel.originalOwner || vessel.originalOwner !== vessel.recognizedOwner) return 'Competing registry claimants need adjudication before a private title purchase';
    if (vessel.profile === 'military' || [vessel.originalOwner, vessel.recognizedOwner].includes('faction_scn')) return 'Government and military frames withhold private title; return the vessel to its authority';
    if (vessel.crewSafe !== true && !['automated', 'evacuated', 'uncrewed'].includes(vessel.crew)) return 'Guarantee safe crew passage before negotiating claimant compensation';
    if (!(Number(vessel.condition?.hull) > 0)) return 'A destroyed frame cannot be purchased as an intact vessel';
  }
  if (action === 'forge_broadcast') {
    if (!illicit) return 'Only an illicit identity broker offers broadcast mimicry';
    if (!state.player.moduleInventory?.some((m) => m.defId === 'mod_cargo_scanner_s')) return 'A Cargo Scanner S donor is required and will be consumed';
    if (vessel.signature?.forged) return 'A copied broadcast is already installed; it does not establish clean title';
  }
  if (action === 'repaint' && vessel.signature?.repainted) return 'This vessel already carries the broker coating';
  if (action === 'settle_lien' && !(Number(vessel.lienCr) > 0)) return 'No lender lien remains';
  if (action === 'extract' || action === 'repair_module') {
    if (!Number.isInteger(slotIndex) || slotIndex < 0 || !owned.fittings?.[slotIndex]) return 'Choose an occupied hardpoint';
    if (!componentDefinition(owned.fittings[slotIndex])) return 'This part cannot be serviced by the yard';
    if (action === 'extract' && (Number(vessel.condition?.hull) || 0) <= 0) return 'Fractured wrecks require wreck salvage, not intact extraction';
    if (action === 'repair_module' && Number(owned.fittedInstances?.[slotIndex]?.condition ?? 1) >= 1) return 'This module is already serviceable';
  }
  return null;
}

export function quoteYardOperation(state, payload = {}) {
  const f = factorsFor(state, payload);
  if (!f.ok) return f;
  const reason = serviceBlocker(state, f);
  if (reason) return bad(reason);
  return { ok: true, quote: createYardQuote(f) };
}

function finishReceipt(state, bus, receipt, publish = true) {
  const sj = ensureShipjack(state);
  if (!Array.isArray(sj.yardReceipts)) sj.yardReceipts = [];
  sj.yardReceipts.push(receipt);
  if (sj.yardReceipts.length > RECEIPT_CAP) sj.yardReceipts.splice(0, sj.yardReceipts.length - RECEIPT_CAP);
  if (publish) bus.emit('shipjack:yardReceipt', receipt);
  return receipt;
}

/** The economy's exact-payment callback owns the synchronous commit boundary.
 * Do not publish title/claim success until that owner confirms its debit. */
function settleTitle(ctx, payload, f, quote) {
  const { state, bus, registry } = ctx;
  if (!registry?.get?.('economy')) return bad('The economy owner is unavailable');
  if (state.player.credits < -quote.amount) return bad('Insufficient credits for full claimant compensation');
  const vessel = f.vessel;
  const claimant = vessel.recognizedOwner;
  const line = 'Claimant paid in full; player title and lawful broadcast issued. Liens and incident evidence remain.';
  const receipt = { ok: true, status: 'completed', operationId: payload.operationId,
    vesselId: vessel.vesselId, action: 'settle_title', stationId: f.stationId, amount: quote.amount, at: state.simTime || 0 };
  const charge = { amount: -quote.amount, expectedCredits: state.player.credits,
    requireFull: true, reason: `shipjack:${payload.operationId}`, result: false,
    commit: () => {
      vessel.title = 'clean';
      vessel.recognizedOwner = 'player';
      vessel.claimResolved = true;
      vessel.noticeAt = 0;
      vessel.signature ||= {};
      vessel.signature.broadcast = `REG-${quote.fingerprint}-${vessel.vesselId.slice(-12)}`;
      vessel.signature.broadcastFlagged = false;
      vessel.signature.forged = false;
      vessel.revision = (Number(vessel.revision) || 0) + 1;
      vessel.history ||= [];
      vessel.history.push({ at: Number(state.simTime) || 0, action: 'settle_title', text: line, operationId: payload.operationId });
      if (vessel.history.length > 12) vessel.history.splice(0, vessel.history.length - 12);
      // Stored silently inside the atomic boundary, so an autosave caused by the
      // wallet notification includes both property truth and its terminal receipt.
      finishReceipt(state, bus, receipt, false);
      return true;
    } };
  bus.emit('economy:chargeCredits', charge);
  if (charge.result !== true) return bad('Payment changed or the economy owner refused claimant compensation');
  bus.emit('shipjack:yardReceipt', receipt);
  bus.emit('shipjack:yardCompleted', { ...receipt, line });
  bus.emit('shipjack:claimResolved', { vesselId: vessel.vesselId, incidentId: vessel.incidentId,
    operationId: payload.operationId, claimant, resolution: 'compensated' });
  return receipt;
}

function commit(ctx, payload, f, quote, prepaid = false) {
  const { state, bus, registry } = ctx;
  const ships = registry?.get?.('ships');
  const economy = registry?.get?.('economy');
  if (!ships || !economy || typeof ships.settleVesselYardOperation !== 'function') return bad('Yard owners are unavailable');
  if (!prepaid && quote.amount < 0 && state.player.credits < -quote.amount) return bad('Insufficient credits for the posted service');
  const { vessel, action } = f;
  let result = { ok: true };
  if (['sell', 'return', 'extract', 'repair_module'].includes(action)) {
    result = ships.settleVesselYardOperation({ ...payload, action, slotIndex: f.slotIndex });
    if (!result?.ok) return result || bad('The receiving yard refused the transfer');
    if (action === 'repair_module' && f.active && result.subsystemId) {
      const combat = registry?.get?.('combat');
      combat?.kernel?.repair?.(state.playerId, result.subsystemId, 1000000, 'yard_module_repair');
    }
  } else if (action === 'forge_broadcast') {
    const donor = state.player.moduleInventory.find((m) => m.defId === 'mod_cargo_scanner_s');
    const consumed = ships.takeInventoryModuleInstance(donor?.instanceId);
    if (!consumed) return bad('The donor scanner is no longer in inventory');
    vessel.signature ||= {};
    vessel.signature.broadcast = `service-${String(consumed.instanceId).slice(-24)}`;
    vessel.signature.forged = true;
    vessel.signature.tamper = Math.min(10, (Number(vessel.signature.tamper) || 0) + 1);
    result.donorInstanceId = consumed.instanceId;
  } else if (action === 'repaint') {
    const shipIndex = state.player.ownedShips.indexOf(f.owned);
    if (!ships.setShipAppearance({ shipIndex, appearance: { ...f.owned.appearance,
      hullColor: '#343b48', accentColor: '#d9b96e', finish: 'worn', wear: 0.12, decalId: 'industrial' } })) {
      return bad('The yard could not apply the hull coating');
    }
    vessel.signature ||= {};
    vessel.signature.repainted = true;
  } else if (action === 'register') {
    vessel.title = 'clean';
    vessel.recognizedOwner = 'player';
  } else if (action === 'settle_lien') vessel.lienCr = 0;
  if (action === 'sell' || action === 'return') {
    vessel.custodian = action === 'return' ? vessel.originalOwner : 'yard';
    vessel.title = action === 'return' ? 'returned' : vessel.title;
    vessel.location = { kind: action === 'return' ? 'returned' : 'sold', stationId: f.stationId, sectorId: f.station.sectorId };
    if (action === 'return') vessel.claimResolved = true;
    const sj = ensureShipjack(state);
    sj.yardDemand ||= {};
    const key = `${f.stationId}:${vessel.defId}`;
    sj.yardDemand[key] = Math.min(10, (Number(sj.yardDemand[key]) || 0) + (action === 'sell' ? 1 : 0));
  }
  vessel.revision = (Number(vessel.revision) || 0) + 1;
  vessel.history ||= [];
  const line = ({ sell: 'Released with installed equipment to the receiving yard', return: 'Returned intact to the registry claimant',
    extract: 'A fitted module was extracted into inventory', repair_module: 'A fitted module was restored',
    register: 'Salvage court recognized clean player title', forge_broadcast: 'A broker copied a service broadcast; frame evidence remains',
    repaint: 'Fresh registry coating; physical frame identity remains', settle_lien: 'Lender lien paid in full' })[action];
  vessel.history.push({ at: Number(state.simTime) || 0, action, text: line, operationId: payload.operationId });
  if (vessel.history.length > 12) vessel.history.splice(0, vessel.history.length - 12);
  // Terminal receipt precedes public wallet intents, including reentrant UI listeners.
  const receipt = finishReceipt(state, bus, { ok: true, status: 'completed', operationId: payload.operationId,
    vesselId: vessel.vesselId, action, stationId: f.stationId, amount: quote.amount, at: state.simTime || 0, ...result });
  if (!prepaid && quote.amount < 0) bus.emit('economy:chargeCredits', { amount: -quote.amount, reason: `shipjack:${payload.operationId}` });
  if (quote.amount > 0) bus.emit('economy:grantCredits', { amount: quote.amount, reason: `shipjack:${payload.operationId}` });
  bus.emit('shipjack:yardCompleted', { ...receipt, line });
  if (action === 'return') bus.emit('shipjack:claimResolved', { vesselId: vessel.vesselId, incidentId: vessel.incidentId, operationId: payload.operationId });
  return receipt;
}

function executeOperation(ctx, payload = {}) {
  const { state, bus, registry } = ctx;
  if (!isBlackFlagAdventure(state)) return bad('Shipworks custody is available in Adventure only');
  const sj = ensureShipjack(state);
  const operationId = payload.operationId;
  if (typeof operationId !== 'string' || operationId.length < 3 || operationId.length > 120) return bad('Missing valid operation identity');
  const old = sj.yardReceipts?.find((r) => r.operationId === operationId);
  if (old) return old;
  sj.yards ||= {};
  const existing = Object.values(sj.yards).find((j) => j.operationId === operationId);
  if (existing) return { ok: true, status: 'processing', ...existing };
  const f = factorsFor(state, payload);
  if (!f.ok) return f;
  if (sj.yards[payload.vesselId]) return bad('A cutter already has this vessel on its cradle');
  const reason = serviceBlocker(state, f);
  if (reason) return bad(reason);
  const checked = validateYardQuote(payload.quote, f);
  if (!checked.ok) return checked;
  if (payload.action === 'settle_title') return settleTitle(ctx, payload, f, checked.quote);
  if (payload.action !== 'extract') {
    if (checked.quote.amount >= 0) return commit(ctx, payload, f, checked.quote);
    let settlement = null;
    const charge = { amount: -checked.quote.amount, expectedCredits: state.player.credits,
      requireFull: true, reason: `shipjack:${operationId}`, result: false,
      commit: () => { settlement = commit(ctx, payload, f, checked.quote, true); return settlement.ok; } };
    bus.emit('economy:chargeCredits', charge);
    return charge.result === true ? settlement : (settlement || bad('Payment changed or the economy owner refused the service'));
  }
  if (Object.keys(sj.yards).length >= MAX_JOBS) return bad('All eight extraction cradles are occupied');
  if (!registry?.get?.('economy') || !registry?.get?.('ships')) return bad('Yard owners are unavailable');
  if (state.player.credits < -checked.quote.amount) return bad('Insufficient credits for extraction labor');
  const part = checked.quote.value.parts.find((p) => p.slotIndex === f.slotIndex);
  const job = { operationId, vesselId: payload.vesselId, action: 'extract', slotIndex: f.slotIndex,
    stationId: f.stationId, startedAt: f.simTime, completesAt: f.simTime + (part.family === 'engine' ? 18 : 8),
    quote: { ...checked.quote, value: undefined } };
  const charge = { amount: -checked.quote.amount, expectedCredits: state.player.credits,
    requireFull: true, reason: `shipjack:extraction:${operationId}`, result: false,
    commit: () => { sj.yards[payload.vesselId] = job; return true; } };
  bus.emit('economy:chargeCredits', charge);
  if (charge.result !== true) return bad('Extraction payment changed or was refused');
  bus.emit('shipjack:yardStarted', job);
  return { ok: true, status: 'processing', ...job };
}

function advanceOperations(ctx) {
  const { state, bus } = ctx;
  if (!isBlackFlagAdventure(state)) return;
  const sj = state.shipjack || state.player?.shipjack;
  if (!sj?.yards) return;
  for (const job of Object.values(sj.yards).slice(0, MAX_JOBS)) {
    if ((Number(state.simTime) || 0) < job.completesAt) continue;
    const stillOwned = state.player?.ownedShips?.some((s) => s.vesselId === job.vesselId);
    // Station screens pause the simulation. A booked extraction becomes ready while
    // flying; collect it at the originating berth rather than cancelling on undock.
    if (stillOwned && (state.ui?.docked !== true || state.ui.dockedStationId !== job.stationId)) continue;
    const f = factorsFor(state, job);
    const reason = f.ok ? serviceBlocker(state, f) : f.reason;
    // A timed service honors the accepted price; identity/condition are still revalidated.
    const checked = f.ok && !reason ? validateYardQuote(job.quote, { ...f, simTime: job.startedAt }) : bad(reason);
    delete sj.yards[job.vesselId];
    const result = checked.ok ? commit(ctx, job, f, checked.quote, true) : checked;
    if (!result.ok) {
      bus.emit('economy:grantCredits', { amount: -job.quote.amount, reason: `shipjack:extraction-refund:${job.operationId}` });
      finishReceipt(state, bus, { ok: false, status: 'cancelled', operationId: job.operationId,
        vesselId: job.vesselId, action: job.action, reason: result.reason, amount: 0 });
    }
  }
}

export function executeYardOperation(ctx, payload = {}) {
  if (IN_FLIGHT.has(ctx.state)) return bad('The yard is settling another transaction');
  IN_FLIGHT.add(ctx.state);
  try { return executeOperation(ctx, payload); }
  finally { IN_FLIGHT.delete(ctx.state); }
}

export function advanceYardOperations(ctx) {
  if (IN_FLIGHT.has(ctx.state)) return;
  IN_FLIGHT.add(ctx.state);
  try { advanceOperations(ctx); }
  finally { IN_FLIGHT.delete(ctx.state); }
}
