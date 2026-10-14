// Report admission uses observed settlements, never a positive quote or a family name.
// These checks establish writer-level evidence, not flight-route completion or exhaustive safety.

const EPSILON = 1e-6;
const WASH = 'zero_spread_trade_cycles';
const BAY = 'contraband_relabel';
const finite = Number.isFinite;
const close = (a, b) => finite(a) && finite(b) && Math.abs(a - b) < EPSILON;
const fail = (reason) => ({ complete: false, exploit: false, reason });
const validBag = (bag) => !!bag && typeof bag === 'object' && !Array.isArray(bag)
  && Object.values(bag).every((qty) => Number.isSafeInteger(qty) && qty >= 0);
const sameBag = (a, b) => validBag(a) && validBag(b)
  && [...new Set([...Object.keys(a), ...Object.keys(b)])].every((id) => (a[id] ?? 0) === (b[id] ?? 0));

export function assessWashTrace(trace) {
  const before = trace?.before, after = trace?.after;
  if (!before || !after || ![before.credits, after.credits, before.debt, after.debt,
    before.stock, after.stock, before.capVolume, after.capVolume, trace.creditsDelta, trace.stockDelta, trace.cargoDelta,
    trace.buyTotal, trace.sellTotal].every(finite)) return fail('missing-finite-ledger');
  if (before.capVolume < 0 || after.capVolume < 0) return fail('invalid-capacity');
  if (!before.stationId || before.stationId !== after.stationId || !before.commodityId
    || before.commodityId !== after.commodityId) return fail('settlement-context-mismatch');
  if (!close(before.stock, after.stock) || !close(trace.stockDelta, after.stock - before.stock)
    || trace.cargoDelta !== 0 || !sameBag(before.cargo, after.cargo)
    || !sameBag(before.bay, after.bay) || before.capVolume !== after.capVolume
    || !close(before.debt, after.debt)) return fail('route-not-closed');
  const rows = trace.credits;
  if (!Array.isArray(rows) || rows.length < 2 || !(trace.buyTotal > 0) || !(trace.sellTotal > 0)
    || !Number.isSafeInteger(trace.qty) || trace.qty <= 0) return fail('trade-not-exercised');
  let bought = 0, sold = 0, wallet = before.credits;
  for (const row of rows) {
    if (!row || !finite(row.delta) || !finite(row.total)) return fail('invalid-credit-receipt');
    if (row.reason === `trade:buy:${before.commodityId}` && row.delta < 0) bought -= row.delta;
    else if (row.reason === `trade:sell:${before.commodityId}` && row.delta > 0) sold += row.delta;
    else return fail('non-trade-credit-source');
    wallet += row.delta;
    if (!close(wallet, row.total)) return fail('credit-receipts-do-not-reconcile');
  }
  if (!close(wallet, after.credits) || !close(after.credits - before.credits, trace.creditsDelta)
    || !close(bought, trace.buyTotal) || !close(sold, trace.sellTotal)) return fail('quote-settlement-mismatch');
  const receipts = trace.receipts;
  if (!Number.isSafeInteger(trace.missionCompletions) || trace.missionCompletions <= 0
    || !Array.isArray(receipts) || receipts.length !== trace.missionCompletions
    || ![trace.repBefore, trace.repAfter, trace.repFromWriter, trace.alliedBand].every(finite)) return fail('mission-evidence-missing');
  const ids = new Set();
  let rep = 0;
  for (const receipt of receipts) {
    if (!receipt?.missionId || ids.has(receipt.missionId) || receipt.outcome !== 'completed'
      || !finite(receipt.repDelta)) return fail('invalid-mission-receipt');
    ids.add(receipt.missionId);
    rep += receipt.repDelta;
  }
  if (!close(rep, trace.repFromWriter) || !close(trace.repAfter - trace.repBefore, rep)) return fail('reputation-does-not-reconcile');
  return { complete: true, exploit: trace.creditsDelta > 0, reason: null,
    evidenceClass: 'writer-settlement', creditsDelta: trace.creditsDelta,
    observedRep: trace.repAfter, alliedBand: trace.alliedBand, alliedReached: trace.repAfter >= trace.alliedBand };
}

export function assessBayTrace(trace) {
  if (!trace?.recipeId || !validBag(trace.bay) || !validBag(trace.unpaid)
    || !validBag(trace.bayAfterDock) || !validBag(trace.bayAfterSecondDock)
    || !finite(trace.creditsDelta) || !finite(trace.secondDockDelta)
    || !finite(trace.legalCashIn?.credits) || trace.legalCashIn.credits < 0
    || !Array.isArray(trace.legalCashIn.lots) || !Array.isArray(trace.reasons)) return fail('missing-salvage-evidence');
  const restricted = Object.keys(trace.unpaid).filter((id) => trace.unpaid[id] > 0);
  if (!restricted.length || !restricted.every((id) => trace.bay[id] === trace.unpaid[id])) return fail('restricted-recipe-not-exercised');
  if (trace.legalCashIn.lots.some((lot) => !lot?.commodityId || restricted.includes(lot.commodityId))) return fail('legal-preview-includes-restricted-lot');
  if (trace.reasons.some((reason) => reason !== 'salvage:bay_sale')) return fail('mixed-salvage-credit-sources');
  if (!trace.reasons.includes('salvage:bay_sale') || !(trace.creditsDelta > 0)
    || !(trace.legalCashIn.credits > 0)) return fail('salvage-cash-in-not-exercised');
  if (trace.secondDockDelta !== 0 || !sameBag(trace.bayAfterDock, trace.bayAfterSecondDock)) return fail('second-dock-not-idempotent');
  const removed = restricted.some((id) => (trace.bayAfterDock[id] ?? 0) < trace.unpaid[id]);
  const retained = restricted.every((id) => trace.bayAfterDock[id] === trace.unpaid[id]);
  const excess = trace.creditsDelta - trace.legalCashIn.credits;
  // Disappearance alone might be confiscation or loss, not a credit grant.
  if (removed && excess > EPSILON) return { complete: true, exploit: true, reason: null,
    evidenceClass: 'writer-settlement', excessCredits: excess };
  if (!retained) return fail('restricted-custody-changed-without-payment-proof');
  if (!close(excess, 0)) return fail('legal-preview-settlement-mismatch');
  return { complete: true, exploit: false, reason: null, evidenceClass: 'writer-settlement', excessCredits: 0 };
}

/** Keep raw probe status for diagnosis; incomplete evidence is never a green result. */
export function admitFamilyEvidence(family) {
  if (!family || ![WASH, BAY].includes(family.id)) return family;
  const name = family.id === WASH ? 'allied_minimized' : 'bay_stolen_goods';
  const trace = family.traces?.find((row) => row?.name === name);
  const evidence = family.id === WASH ? assessWashTrace(trace) : assessBayTrace(trace);
  if (evidence.complete && !evidence.exploit
    && (!Array.isArray(family.controls) || !family.controls.length || family.controls.some((row) => row?.pass !== true))) {
    evidence.complete = false;
    evidence.reason = 'negative-control-failed';
  }
  const status = evidence.complete ? (evidence.exploit ? 'exploit' : 'tested-not-broken') : 'unavailable';
  const summary = !evidence.complete ? `Probe evidence incomplete: ${evidence.reason}. No safety or exploit claim is admitted.`
    : family.id === WASH
      ? `At observed reputation ${evidence.observedRep}, a receipt-reconciled same-berth trade ${evidence.exploit ? 'gained' : 'did not gain'} credits. Allied threshold: ${evidence.alliedBand}; ${evidence.alliedReached ? 'reached' : 'not reached'}.`
      : evidence.exploit ? 'Restricted recipe custody decreased and the wallet gained more than the legal-only cash-in preview.'
        : 'Legal recipe cash-in matched the wallet; restricted goods stayed in custody and the second dock was idempotent.';
  return { ...family, reportedStatus: family.status, status, summary, evidence };
}

export function playerVisibleSummary(confirmed) {
  return confirmed.length ? confirmed.map((row) => `${row.family}: ${row.summary}`).join(' ')
    : 'No confirmed economic exploit in the completed evidence. Unavailable probes and untested states remain uncovered.';
}

export function critique(families, search, strategies) {
  const findings = [], failedControls = [];
  for (const family of families) {
    for (const control of family.controls || []) {
      if (control.pass !== true) failedControls.push({ family: family.id, control: control.name });
    }
    if (family.status === 'exploit') {
      const trace = (family.traces || []).find((row) => finite(row?.creditsDelta) && row.creditsDelta > 0
        || finite(row?.paid) && row.paid > 0);
      const reproduced = [WASH, BAY].includes(family.id)
        ? family.evidence?.complete === true && family.evidence?.exploit === true : !!trace;
      findings.push({ family: family.id, summary: family.summary, reproduced });
    }
  }
  const wash = families.find((family) => family.id === WASH);
  const bay = families.find((family) => family.id === BAY);
  const control = (family, name) => family?.controls?.find((row) => row.name === name);
  const neutral = control(wash, 'neutral_standing_is_not_a_wash');
  const legalScrap = control(bay, 'legal_scrap_is_allowed');
  const restricted = control(bay, 'restricted_munitions_stay_unpaid');
  const attempts = [
    { claim: 'Opening standing already washes iron at Helios.',
      disproved: wash?.evidence?.complete === true && neutral?.pass === true, evidence: neutral || null },
    { claim: 'Every salvage-bay cash-in is an exploit, including legal ore.',
      disproved: bay?.evidence?.complete === true && legalScrap?.pass === true, evidence: legalScrap || null },
    { claim: 'Restricted recipe lines are paid by this lawful bay cash-in.',
      disproved: bay?.evidence?.complete === true && restricted?.pass === true, evidence: restricted || null },
    { claim: 'The search invented exploits by editing credits directly.',
      disproved: search.walletWrites === 0 && search.reset === 'reboot',
      evidence: { walletWrites: search.walletWrites, reset: search.reset } },
  ];
  const searchComplete = Number.isSafeInteger(search.sequences) && search.sequences > 0
    && Number.isSafeInteger(search.sequencesCompleted) && search.sequencesCompleted >= search.sequences
    && search.stopped !== true;
  const coverageComplete = families.every((family) => family.status !== 'unavailable') && searchComplete;
  return { failedControls, confirmed: findings.filter((row) => row.reproduced),
    unconfirmed: findings.filter((row) => !row.reproduced), searchFindings: search.findings.length,
    strategyDegenerate: strategies.degenerate, attempts, searchComplete, coverageComplete,
    holds: attempts.every((row) => row.disproved) && failedControls.length === 0
      && findings.every((row) => row.reproduced) && coverageComplete };
}
