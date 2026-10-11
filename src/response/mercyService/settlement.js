// Settlement emits intents. It does not write credits, reputation, or heat.
// Economy listens for economy:grantCredits / economy:chargeCredits.
// Factions listens for distress:rescued and faction:repDelta.
// Law heat is not forged: custody breaches are mercyService:lawFact records
// the withheld adapter would hand to lawSecurity.

import {
  CARGO_CAP, CARGO_RATE, EVIDENCE_CREDIT, LIFE_CREDIT, UNLAWFUL_FINE, UNLAWFUL_REP,
} from './constants.js';

function already(inc, key) {
  return !!(inc.settlementReceipt && inc.settlementReceipt.keys && inc.settlementReceipt.keys[key]);
}

function pushIntent(rt, inc, intent) {
  if (!intent.key || already(inc, intent.key)) return false;
  inc.settlementReceipt.keys[intent.key] = true;
  const row = {
    key: intent.key,
    type: intent.type,
    amount: intent.amount || 0,
    delta: intent.type === 'faction:repDelta' ? (intent.amount || 0) : 0,
    reason: intent.reason || intent.type,
    factionId: intent.factionId || null,
    incidentId: inc.defId,
    uid: inc.uid,
    fact: intent.fact || null,
    at: rt.simTime,
  };
  rt.intentLog.push(row);
  if (rt.bus && typeof rt.bus.emit === 'function') rt.bus.emit(row.type, row);
  return true;
}

export function quoteBody(body, beaconOk) {
  const survivors = body && body.survivors > 0 ? body.survivors : 0;
  const cargoCr = body && body.cargoCr > 0 ? body.cargoCr : 0;
  const evidence = body && body.evidence > 0 ? 1 : 0;
  const lives = survivors * LIFE_CREDIT;
  const cargo = beaconOk ? Math.min(CARGO_CAP, Math.round(cargoCr * CARGO_RATE)) : 0;
  const evidencePay = beaconOk && evidence ? EVIDENCE_CREDIT : 0;
  const credits = lives + cargo + evidencePay;
  let outcome = 'mixed';
  if (lives && !cargo && !evidencePay) outcome = 'lives';
  else if (!lives && cargo && !evidencePay) outcome = 'cargo';
  else if (!lives && !cargo && evidencePay) outcome = 'evidence';
  else if (!credits) outcome = beaconOk ? 'empty' : 'unlawful';
  return { credits, outcome, lives, cargo, evidencePay, survivors, cargoCr, evidence };
}

function ensureReceipt(inc) {
  if (!inc.settlementReceipt) inc.settlementReceipt = { keys: {}, outcome: null };
  return inc.settlementReceipt;
}

export function settleDelivery(rt, inc, body, beaconOk) {
  if (!inc || inc.latches.settled) return inc && inc.settlementReceipt;
  const receipt = ensureReceipt(inc);
  const quote = quoteBody(body, beaconOk);
  const unlawful = !beaconOk && body && (body.cargoCr > 0 || body.evidence > 0);
  receipt.outcome = unlawful && quote.credits === 0 ? 'unlawful' : quote.outcome;
  receipt.credits = quote.credits;
  receipt.beaconOk = beaconOk;
  inc.outcome = receipt.outcome;
  if (quote.credits > 0) {
    pushIntent(rt, inc, {
      key: `${inc.uid}:grant`,
      type: 'economy:grantCredits',
      amount: quote.credits,
      reason: `mercy:${inc.defId}:${receipt.outcome}`,
    });
  }
  if (quote.credits > 0 && beaconOk) {
    pushIntent(rt, inc, {
      key: `${inc.uid}:distress`,
      type: 'distress:rescued',
      factionId: inc.def.factionId,
      reason: 'mercy:rescue',
    });
  }
  if (unlawful) {
    pushIntent(rt, inc, {
      key: `${inc.uid}:fine`,
      type: 'economy:chargeCredits',
      amount: UNLAWFUL_FINE,
      reason: `mercy:${inc.defId}:custody_without_beacon`,
    });
    pushIntent(rt, inc, {
      key: `${inc.uid}:rep`,
      type: 'faction:repDelta',
      amount: UNLAWFUL_REP,
      factionId: inc.def.factionId,
      reason: 'mercy:custody_without_beacon',
    });
    pushIntent(rt, inc, {
      key: `${inc.uid}:law`,
      type: 'mercyService:lawFact',
      fact: 'custody_without_beacon',
      reason: 'mercy:custody_without_beacon',
    });
  }
  inc.latches.settled = true;
  return receipt;
}

export function settleLeave(rt, inc) {
  if (!inc || inc.latches.settled || inc.latches.extracted) return null;
  const receipt = ensureReceipt(inc);
  receipt.outcome = 'leave';
  receipt.credits = 0;
  inc.outcome = 'leave';
  inc.latches.settled = true;
  receipt.note = 'left';
  return receipt;
}

export function settleLost(rt, inc, outcome) {
  if (!inc || inc.latches.settled) return null;
  const receipt = ensureReceipt(inc);
  receipt.outcome = outcome;
  receipt.credits = 0;
  inc.outcome = outcome;
  inc.latches.settled = true;
  return receipt;
}

export function emitRivalCapture(rt, inc) {
  if (!inc) return;
  ensureReceipt(inc);
  pushIntent(rt, inc, {
    key: `${inc.uid}:rival-law`,
    type: 'mercyService:lawFact',
    fact: 'rival_took_beaconed_capsule',
    reason: 'mercy:rival_capture',
  });
}
