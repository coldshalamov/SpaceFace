// Pure BLACK FLAG quotes. Inventory lives in ships; title facts live in shipjack.
import { SHIPS } from '../data/ships.js';
import { MODULES } from '../data/modules.js';
import { WEAPONS } from '../data/weapons.js';
import { hash32 } from '../core/rng.js';

const HULLS = new Map(SHIPS.map((d) => [d.id, d]));
const PARTS = new Map([...MODULES, ...WEAPONS].map((d) => [d.id, d]));
const WEAPON_IDS = new Set(WEAPONS.map(d => d.id));
const finite = (n, fallback = 0) => Number.isFinite(Number(n)) ? Number(n) : fallback;
const money = (n) => Math.max(0, Math.floor(finite(n)));
export function componentCondition(value) {
  if (value === 'damaged') return 0.5;
  if (value === 'scarred') return 0.8;
  return Math.max(0, Math.min(1, finite(value, 1)));
}
export function componentDefinition(defId) { return PARTS.get(defId) || null; }
/** Canonical combat groups; shield emitters have no separate combat subsystem. */
export function componentSubsystemId(defId) {
  const def = PARTS.get(defId);
  if (!def) return null;
  if (def.slotType === 'engine') return 'subsystem_drive';
  if (WEAPON_IDS.has(defId)) return 'subsystem_weapon';
  if (def.slotType === 'reactor' || def.slotType === 'power') return 'subsystem_power';
  if (def.slotType === 'sensor' || def.mods?.revealCargo || def.mods?.radarRangePct
    || def.mods?.scannerRadiusMult) return 'subsystem_sensor';
  return null;
}

/** Hull and fittings are disjoint: removing a fitting removes its entire quoted value. */
export function valuationBreakdown(vessel, owned, { illicit = false, saturation = 0 } = {}) {
  const hull = HULLS.get(owned?.defId || vessel?.defId);
  const integrity = componentCondition(vessel?.condition?.hull);
  const hullBase = money(hull?.buyback ?? hull?.price);
  const removedDrive = owned?.shipjackDriveRemoved === true;
  const shell = money(hullBase * 0.35 * integrity * (removedDrive ? 0.65 : 1));
  const parts = (owned?.fittings || []).map((defId, slotIndex) => {
    const def = PARTS.get(defId);
    if (!def) return null;
    const instance = owned?.fittedInstances?.[slotIndex];
    const condition = componentCondition(instance?.condition);
    return { slotIndex, defId, instanceId: instance?.instanceId || null, condition,
      value: money(def.price * 0.3 * condition), labor: Math.max(40, money(def.price * 0.04)),
      family: def.slotType || 'weapon' };
  }).filter(Boolean);
  const componentValue = parts.reduce((n, p) => n + p.value, 0);
  const clean = vessel?.title === 'clean';
  const legalFactor = clean ? 1 : illicit ? 0.48 : 0;
  const demandFactor = Math.max(0.45, 1 - Math.min(10, money(saturation)) * 0.08);
  const lien = money(vessel?.lienCr);
  const intact = money((shell + componentValue) * legalFactor * demandFactor - lien);
  // A claimant sells the remaining physical property at replacement appraisal,
  // never at a fence's discounted redemption price. Removed parts keep their own
  // disputed provenance; purchasing this hull does not launder inventory.
  const claimantCompensation = money(money(hull?.price) * integrity
    + parts.reduce((n, p) => n + money(PARTS.get(p.defId)?.price * p.condition), 0));
  const titleServiceFee = Math.max(300, money(claimantCompensation * 0.1));
  return { hullBase, integrity, shell, parts, componentValue, legalFactor, demandFactor,
    claimantCompensation, titleServiceFee, titleSettlementCost: claimantCompensation + titleServiceFee,
    lien, intact, stripNet: money(componentValue - parts.reduce((n, p) => n + p.labor, 0)),
    returnFee: Math.min(2000, money(hullBase * 0.045 * integrity * (vessel?.proofRecorded&&vessel?.crewSafe?1.15:1))),
    registrationCost: Math.max(300, money(hullBase * 0.06)),
    forgeryCost: Math.max(900, money(hullBase * 0.12)) };
}

/** No RNG or global WANTED substitution: inspectors compare the channels they can see. */
export function inspectVessel(vessel, { grade = 1, jurisdiction = 'border' } = {}) {
  const s = vessel?.signature || {};
  const findings = [];
  if (s.broadcastFlagged && !s.forged) findings.push('Flagged broadcast registration');
  if (grade >= 2 && s.forged) findings.push('Engine signature disagrees with broadcast registration');
  if (grade >= 3 && vessel?.title !== 'clean') findings.push('Title does not establish lawful ownership');
  if (grade >= 3 && s.tamper) findings.push('Frame authentication shows identity tampering');
  if (grade >= 3 && money(vessel?.lienCr)) findings.push('Outstanding lender lien');
  return { accepted: findings.length === 0, findings, grade, jurisdiction,
    checked: grade >= 3 ? ['broadcast', 'engine', 'frame', 'title', 'lien']
      : grade >= 2 ? ['broadcast', 'engine'] : ['broadcast'],
    advice: findings.length ? 'Return the vessel, establish title, or use a broker who accepts disputed property.'
      : grade < 3 ? 'Broadcast accepted; deeper registry checks remain possible.' : 'Registry inspection passed.' };
}

export function quoteFingerprint(vessel, owned, stationId, action, slotIndex, saturation = 0) {
  const cargo = owned?.cargo || {};
  const items = Object.entries(cargo.items || {}).sort(([a], [b]) => a.localeCompare(b));
  const fits = (owned?.fittings || []).map((id, i) => [id,
    owned?.fittedInstances?.[i]?.instanceId || null, owned?.fittedInstances?.[i]?.condition ?? 1]);
  const location = vessel?.location || {};
  const signature = vessel?.signature || {};
  // Narrative notices advance the ledger revision during a booked job. They do not
  // change its price or inventory. Bind the actual economic/custody facts instead.
  const factors = [vessel?.vesselId, vessel?.generation || '', owned?.defId, vessel?.title,
    vessel?.custodian, vessel?.recognizedOwner, vessel?.lienCr || 0,vessel?.proofRecorded===true,vessel?.crewSafe===true,
    [componentCondition(vessel?.condition?.hull), vessel?.condition?.driveMissing === true],
    [location.kind || '', location.sectorId || '', location.stationId || ''],
    [signature.broadcast || '', signature.frame || '', signature.engine || '',
      signature.forged === true, Number(signature.tamper) || 0, signature.repainted === true], owned?.shipjackDriveRemoved || false,
    fits, items, stationId, action, slotIndex ?? null, saturation];
  // Keep previously persisted cutter-job fingerprints byte-equivalent.
  if (action === 'settle_title') factors.push([vessel?.originalOwner || '', vessel?.profile || '',
    vessel?.crew || '', vessel?.claimResolved === true, signature.broadcastFlagged === true]);
  return hash32(JSON.stringify(factors)).toString(36);
}

export function createYardQuote({ vessel, owned, stationId, action, slotIndex, simTime = 0,
  illicit = false, saturation = 0 }) {
  const value = valuationBreakdown(vessel, owned, { illicit, saturation });
  const part = value.parts.find((p) => p.slotIndex === slotIndex);
  const amounts = { sell: value.intact, return: value.returnFee, extract: -(part?.labor || 0),
    repair_module: -Math.max(40, money((PARTS.get(part?.defId)?.price || 0) * (1 - (part?.condition ?? 1)) * 0.18)),
    register: -value.registrationCost, settle_title: -value.titleSettlementCost, forge_broadcast: -value.forgeryCost,
    repaint: -Math.max(150, money(value.hullBase * 0.025)), settle_lien: -value.lien };
  return { version: 1, vesselId: vessel?.vesselId, stationId, action, slotIndex: slotIndex ?? null,
    fingerprint: quoteFingerprint(vessel, owned, stationId, action, slotIndex, saturation),
    expiresAt: finite(simTime) + 45, amount: amounts[action] ?? 0, value };
}

export function validateYardQuote(quote, factors) {
  if (!quote || quote.version !== 1 || !Number.isFinite(quote.expiresAt)
    || finite(factors.simTime) > quote.expiresAt) return { ok: false, reason: 'Quote expired — request a fresh appraisal' };
  const fresh = createYardQuote(factors);
  if (quote.vesselId !== fresh.vesselId || quote.stationId !== fresh.stationId
    || quote.action !== fresh.action || quote.slotIndex !== fresh.slotIndex
    || quote.fingerprint !== fresh.fingerprint || quote.amount !== fresh.amount) {
    return { ok: false, reason: 'Vessel or market changed — revised quote required' };
  }
  return { ok: true, quote: fresh };
}

/** Save boundary: import only the finite service facts needed for settlement. */
export function sanitizeYardPersistence(input, vesselsById = {}) {
  const plain = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const str = (v, max = 120) => typeof v === 'string' ? v.slice(0, max) : '';
  const result = { yards: {}, yardReceipts: [], yardDemand: {} };
  for (const [id, raw] of Object.entries(plain(input?.yards) ? input.yards : {}).slice(0, 8)) {
    const q = raw?.quote;
    if (!vesselsById[id] || !plain(raw) || !plain(q) || raw.action !== 'extract'
      || q.action !== 'extract' || q.vesselId !== id || !Number.isInteger(raw.slotIndex)
      || raw.slotIndex < 0 || raw.slotIndex > 63 || q.slotIndex !== raw.slotIndex
      || !Number.isFinite(raw.startedAt) || !Number.isFinite(raw.completesAt)
      || raw.startedAt < 0 || raw.completesAt < raw.startedAt || raw.completesAt > raw.startedAt + 60
      || !Number.isSafeInteger(q.amount) || q.amount > 0 || q.amount < -1000000
      || !Number.isFinite(q.expiresAt) || q.version !== 1
      || typeof q.fingerprint !== 'string' || !/^[a-z0-9]{1,16}$/.test(q.fingerprint)
      || typeof raw.operationId !== 'string' || raw.operationId.length < 3) continue;
    result.yards[id] = { vesselId: id, operationId: str(raw.operationId), action: 'extract',
      stationId: str(raw.stationId), slotIndex: raw.slotIndex, startedAt: raw.startedAt,
      completesAt: raw.completesAt, quote: { version: 1, vesselId: id, stationId: str(q.stationId),
        action: 'extract', slotIndex: q.slotIndex, fingerprint: q.fingerprint, expiresAt: q.expiresAt, amount: q.amount } };
  }
  for (const raw of (Array.isArray(input?.yardReceipts) ? input.yardReceipts : []).slice(-128)) {
    if (!plain(raw) || typeof raw.operationId !== 'string') continue;
    result.yardReceipts.push({ operationId: str(raw.operationId), vesselId: str(raw.vesselId),
      action: str(raw.action, 30), status: str(raw.status, 20), ok: raw.ok === true,
      stationId: str(raw.stationId),
      amount: Math.max(-1e8, Math.min(1e8, finite(raw.amount))), at: Math.max(0, finite(raw.at)),
      reason: str(raw.reason, 180), instanceId: str(raw.instanceId), defId: str(raw.defId), subsystemId: str(raw.subsystemId, 60) });
  }
  for (const [key, amount] of Object.entries(plain(input?.yardDemand) ? input.yardDemand : {}).slice(0, 512)) {
    if (/^station_[a-z0-9_]+:ship_[a-z0-9_]+$/.test(key)) result.yardDemand[key] = Math.max(0, Math.min(10, money(amount)));
  }
  return result;
}
