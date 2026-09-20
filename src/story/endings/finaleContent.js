// Authored transmission scripts, not generated quest summaries. No gameplay or renderer imports.
// Channels match story.js: comms:popup / graffiti:show / hud:phase.
import { freeze, integerText as n, text } from './value.js';

const comms = (sender, line, delayS = 12, note = null) => ({
  kind: 'comms', sender, text: line, category: 'story', ttl: 10, persist: true, delayS, note,
});
const wall = line => ({ kind: 'graffiti', line, where: 'bulkhead', beat: 7, delayS: 8 });
const slot = name => ({ kind: 'evidence', slot: name, delayS: 13 });
const hud = lie => ({ kind: 'hud', phase: 3, beat: 7, lie, delayS: 3 });

export const FINALE_CONTENT_VERSION = 1;
export const FINALE_CONTENT = freeze({
  A: {
    subtitle: 'The office was vacant. The signature was not.',
    beats: [
      comms('CONCORD PERSONNEL', 'AUXILIARY COMMISSION / ORIGINAL APPOINTMENT DATE: PRIOR TO CONTRACT 47-A. TODAY’S SIGNATURE: ACKNOWLEDGEMENT.', 11),
      comms('KESSLER', 'That date is not a mistake. You have been signing for the weight. They are giving the signature an office.'),
      slot('balance'),
      comms('CONCORD RECORDS', 'PUBLIC SEARCH: CLEAR. UNDERLYING FILE: RETAINED. EXPUNGEMENT APPLIES TO SEARCH RESULTS, NOT TO COUNTERPARTY COPIES.'),
      slot('law'),
      comms('DIRECTOR VALE', 'The important qualification was never innocence. It was that you could keep the route open.'),
      slot('lives'),
      comms('KESSLER', 'Personnel asked me for one number. I sent the attachment as well. They can detach it. They have to open it first.'),
      slot('archive'),
      comms('CONCORD ALLOCATION DESK', 'FIRST IN-TRAY: OUTER-SECTOR VIABILITY REVIEW. REF 44-C. AUTHORISING OFFICER: AUXILIARY ADMINISTRATION.'),
      comms('CAPTAIN’S LOG', 'The form has an approval box and a refusal box. Both sit under the same heading: VARIANCE DISPOSAL. There is room in the margin. Not much.'),
      wall('AN APPOINTMENT IS NOT AN ACQUITTAL.'),
      hud(null),
      comms('HELIOS DOCKMASTER', 'They changed the name on your berth. I recognise the hull.', 16),
    ],
    epilogue: [
      'On the public terminal, the search comes back clear. Somewhere else, someone has the copy they made before the order arrived. The commission gives the captain an institutional address. It does not give the creditors a reason to forget it.',
      'The first Auxiliary Watch asks for three returns. Out beyond the berth there is still work to fly, and a report for each job that comes back. The office would prefer a total. Totals fit in the space provided.',
      'At home, the wall makes no allowance for the new uniform. On the channel, the administration begins to say we. It is difficult to tell which word has changed more: the captain’s name, or theirs.',
    ],
    ambient: [
      ['CONCORD AUXILIARY', 'WATCH ROSTER: YOUR CALLSIGN NOW APPEARS IN THE AUTHORISATION COLUMN.'],
      ['CONCORD RECORDS', 'EXPUNGEMENT QUERY CLOSED. COUNTERPARTY ATTACHMENTS ARE OUTSIDE THE SCOPE OF THIS QUERY.'],
      ['HELIOS DOCKMASTER', 'Same berth. Different letterhead. Keep your fees current.'],
      ['AUXILIARY DISPATCH', 'PATROL RETURN RECEIVED. CASUALTY ANNEX: DO NOT SUBSTITUTE TONNAGE.'],
    ],
    homeGraffiti: 'THE BADGE DID NOT MOVE THE BODIES.',
    completion: 'THREE WATCH RETURNS FILED. THE ATTACHMENTS REMAIN ATTACHED.',
  },
  B: {
    subtitle: 'The name disappears from the form. Not from the mouths.',
    beats: [
      comms('QUIET ROUTING', 'OPERATOR FIELD: WITHDRAWN. ROUTE FIELD: RETAINED. PLEASE DO NOT RESUBMIT YOUR NAME.', 11),
      comms('CLERK YUNE', 'They will tell you this is disappearing. It is a change of address. Everything you move still arrives somewhere.'),
      slot('routes'),
      slot('balance'),
      comms('BOURSE FREIGHT', 'MANIFEST 47-A / VARIANCE ACCEPTED AS ROUTING OVERHEAD. CLAIMANT FIELD: NOT REQUIRED.'),
      comms('MIRA', 'Not required is not the same as not there. I used to write the names in the seal notes. The notes have a limit.'),
      slot('lives'),
      slot('law'),
      comms('QUIET ROUTING', 'PUBLIC IDENTITY MASKED. LOCAL COPIES, WITNESSES AND ACTIVE WARRANTS ARE NOT A PUBLIC IDENTITY.'),
      slot('archive'),
      comms('CLERK YUNE', 'The first instruction is to pass a manifest without opening it. You already know how. That is why they asked.'),
      wall('A CHANNEL HAS TWO ENDS.'),
      hud('manifest_silent_correct'),
      comms('KAEL', 'I still have this frequency. You do not have to answer.', 19),
    ],
    epilogue: [
      'The public label goes blank. The balance does not. Neither do the copies held by the people who were there. The Quiet has bought continuity of service; whatever followed the captain into the appointment has not been asked to leave.',
      'The routing desk wants three different sale routes. It keeps places and cargo where another office would keep a portrait. There is no ceremony. There are arrivals to account for.',
      'At home, the wall remembers the freight that moved without a claimant. Out on the private frequency, a friend still has an address. The public record was never the whole of being known.',
    ],
    ambient: [
      ['QUIET ROUTING', 'ROUTE VERIFIED. OPERATOR FIELD OMITTED BY AGREEMENT.'],
      ['BOURSE FREIGHT', 'PLEASE RETAIN THE ORIGINAL MANIFEST. NOT THE VERSION WE SENT AFTER ARRIVAL.'],
      ['OPEN CHANNEL — FREQ 9', 'Someone is still flying that hull.'],
      ['MIRA', 'The receiver asked for a name. I left the channel open.'],
    ],
    homeGraffiti: 'NO NAME DOES NOT MEAN NO ONE.',
    completion: 'THREE DISTINCT ROUTES LOGGED. THE OPERATOR FIELD REMAINS EMPTY. THE ARRIVALS DO NOT.',
  },
  C: {
    subtitle: 'The drive can leave a sector. The return address has other ideas.',
    beats: [
      comms('NAVIGATION', 'DESTINATION: UNFILED. RETURN RECORD: ACCEPTED. THESE FIELDS ARE NOT CONTRADICTORY.', 11),
      comms('TYCHO RELAY', 'WEIGHT VARIANCE NOTICE: SHIPMENT 47-A UNDER REVIEW. PAYMENT STATUS: UNCHANGED.'),
      comms('CAPTAIN’S LOG', 'No destination was entered. A return has been filed. The drive has not explained the difference. The account has.'),
      slot('balance'),
      comms('NAVIGATION', 'INVENTORY RETAINED. DAMAGE RETAINED. HISTORY RETAINED. NO REVERSAL INSTRUCTION RECEIVED.'),
      slot('lives'),
      comms('KESSLER', 'A return is not a correction. Nothing you brought back makes the earlier column unhappen.'),
      slot('law'),
      slot('archive'),
      comms('CONCORD LOGISTICS', 'RECONCILIATION RESULT: THE DECLARED LOAD IS SUFFICIENT TO ACCOUNT FOR THE DECLARED LOAD.'),
      comms('CAPTAIN’S LOG', 'For once the screen is exactly right. It has said nothing.'),
      wall('THE RETURN IS REAL. THE REFUND IS NOT.'),
      hud('phase3_freeze'),
      comms('NAVIGATION', 'FOUR DISTINCT REGION RETURNS REQUESTED. ESTABLISH WHETHER THE ERROR TRAVELS.', 17),
    ],
    epilogue: [
      'The return is on file. So are the debts, the damage and the last reports of the missing. No second Tessera has been issued. No earlier captain has arrived to take this one’s place.',
      'Navigation asks for returns from four different regions. One repeated address would only prove that an address can be repeated. The captain takes the error out into the lanes to learn whether it follows the ship or was already waiting.',
      'Contract 47-A stays unpaid. The readout says the declared load accounts for the declared load. The words have become perfectly accurate by giving up everything they might have meant.',
    ],
    ambient: [
      ['TYCHO RELAY', '47-A: RETURN RECEIVED. SETTLEMENT STILL UNDER REVIEW.'],
      ['NAVIGATION', 'REGION IDENTIFIED. PRIOR IDENTIFICATION DOES NOT INVALIDATE THIS OBSERVATION.'],
      ['KESSLER', 'Same contract number. Keep both copies.'],
      ['CONCORD VESSEL REGISTRY', 'RETURNED VESSEL IS NOT A REPLACEMENT VESSEL. HISTORY RETAINED.'],
    ],
    homeGraffiti: 'I WAS HERE AFTER I LEFT.',
    completion: 'FOUR DISTINCT REGION RETURNS FILED. THE ERROR HAS A ROUTE NOW.',
  },
  D: {
    subtitle: 'Someone has to refuse the convenient zero.',
    beats: [
      comms('PERSONAL EFFECTS', 'ONE LEDGER / 0.4t. CONTENTS NOT VALUED. KEEP SEPARATE FROM FREIGHT.', 11),
      comms('THE KURTZ FIGURE', 'The chair is not the job. The job is making sure the next person cannot say there was no record.'),
      slot('lives'),
      comms('CAPTAIN’S LOG', 'The first new column is not ALIVE or DEAD. It is LAST SEEN. There are entries the desk cannot finish honestly.'),
      slot('law'),
      comms('THE KURTZ FIGURE', 'Your name goes in too. Otherwise it is not a ledger. It is an alibi.'),
      slot('balance'),
      slot('archive'),
      comms('CAPTAIN’S LOG', 'For an unreturned person I leave the space open. The total refuses to close. Nothing breaks. It was always allowed to stay open.'),
      wall('UNKNOWN IS NOT ZERO.'),
      hud(null),
      comms('ASH CACHE — BERTH CONTROL', 'DEPARTURE CLEARANCE AVAILABLE. ARCHIVE CUSTODIANSHIP IS NOT A DETENTION ORDER.'),
      comms('THE KURTZ FIGURE', 'Take the ship. The desk cannot see past its own window.', 18),
    ],
    epilogue: [
      'The ledger stays in the captain’s custody. The berth stays open. The archive asks for three separate observations, with a place written beside each one. A desk can preserve a report; it cannot go and find out.',
      'No payment arrives for taking the book. No warrant is recalled. The captain’s own entries sit among the others, where another hand may someday turn to them. The page has room for that possibility.',
      'At home, the wall refuses the convenient zero. At Ashfall, the chair can be left empty without the record being abandoned. For once, an absence is not made to do more work than it can bear.',
    ],
    ambient: [
      ['ASH CACHE ARCHIVE', 'LAST-SEEN COLUMN OPEN. DO NOT CLOSE ON ABSENCE OF FURTHER TRAFFIC.'],
      ['DUSTWIFE SENNA', 'Put down where you found it. Someone will know what that means.'],
      ['ARCHIVE ROUTING', 'UNRESOLVED RECORD RETAINED. NO AUTOMATIC ZERO SUBSTITUTION.'],
      ['THE KURTZ FIGURE', 'You can leave the chair. Leave a way to find the book.'],
    ],
    homeGraffiti: 'UNKNOWN IS NOT ZERO.',
    completion: 'THREE DISTINCT OBSERVATIONS FILED. NONE REPLACES AN EARLIER ONE.',
  },
  E: {
    subtitle: 'The account closes. The reason to work does not.',
    beats: [
      comms('ASH CACHE COURIER', 'No commission? No routing title? All right. There is still a delivery.', 11),
      comms('CONCORD CLEARING', 'CONTRACT 47-A / SETTLEMENT: 1,200 cr. ACCEPTANCE CLOSES THIS CLAIM. IT DOES NOT CERTIFY THE MANIFEST.'),
      slot('balance'),
      comms('KESSLER', 'I can close the payment line. That is the only line this payment closes.'),
      slot('lives'),
      slot('law'),
      comms('ASH CACHE COURIER', 'The next one has a different number. Read it anyway.'),
      slot('archive'),
      comms('CAPTAIN’S LOG', 'I keep the old manifest. Not as permission. Not as punishment. So that the next weight has something to disagree with.'),
      wall('THE RECEIPT IS NOT THE REASON.'),
      hud('stable_load'),
      comms('BOURSE FREIGHT', 'CONTRACT 47-B: PENDING. OPERATOR REQUIRED. NO TITLE AVAILABLE.'),
      comms('KAEL', 'You still flying?', 18),
    ],
    epilogue: [
      'The clearing desk posts twelve hundred credits. Beside 47-A, the status changes to CLOSED. Underneath it another number waits. The payment has bought no standing and recalled no pursuit. It has paid a working pilot.',
      'The next manifest wants two contract returns. There are ordinary jobs in the lanes, with ordinary terms, and that word has acquired a weight of its own. The old manifest goes aboard with the new one.',
      'The home wall accuses. The paperwork answers with particulars, and with blank spaces it cannot honestly fill. The captain goes back to work without a title to hide behind or a final excuse to carry in place of freight.',
    ],
    ambient: [
      ['BOURSE FREIGHT', '47-B REMAINS PENDING. STANDARD TERMS. PLEASE READ THE STANDARD TERMS.'],
      ['KESSLER', 'Different contract. Keep the earlier manifest.'],
      ['HELIOS DOCKMASTER', 'Your berth is still your berth.'],
      ['CONCORD CLEARING', '47-A SETTLEMENT POSTED. NO FURTHER PAYMENT GENERATED BY THIS NOTICE.'],
    ],
    homeGraffiti: 'YOU KNEW THE MASS AND YOU TOOK THE COIN.',
    completion: 'TWO CONTRACT RETURNS FILED UNDER THE NEXT MANIFEST. THE OLD ONE HAS NOT BEEN DISCARDED.',
  },
});

function balanceLine(id, f) {
  const balance = `${n(f.credits)} cr in liquid credit; ${n(f.debt)} cr in recorded debt`;
  if (id === 'A') return `AT APPOINTMENT: ${balance}. ASSET ALLOWANCE: ${n(f.assetProxyCr)} cr. Appointment is not repayment. The creditors retain their copies.`;
  if (id === 'B') return `AT TRANSFER: ${balance}. A name can be withdrawn from the public field. A balance still needs a destination.`;
  if (id === 'C') return `BEFORE RETURN FILING: ${balance}. No refund entry. No restoration entry. The discrepancy is not in the addition.`;
  if (id === 'D') return `AT CUSTODY: ${balance}. The desk pays nothing. A person with a debt can still keep an honest record.`;
  if (f.debt > f.credits) return `BEFORE SETTLEMENT: ${balance}. Twelve hundred will not make the account whole. Needing the money is a fact, not an acquittal and not a conviction.`;
  if (f.netWorthCr >= 100000) return `BEFORE SETTLEMENT: ${balance}. You did not need a title to keep working. That does not make the manifest harmless.`;
  return `BEFORE SETTLEMENT: ${balance}. The payment is small. The next expenses are not imaginary.`;
}

function lawLine(id, f) {
  const known = f.incidentIds.length;
  let line = known > 0
    ? `${n(known)} surviving incident receipt${known === 1 ? ' bears' : 's bear'} a valid law seal. The file is incomplete. This is the part still on paper.`
    : 'INCIDENT FILE: no validated count available. Do not stamp CLEAR in a field that says NO RETURN.';
  if (f.smuggledValue > 0) line += ` Smuggled value recorded: ${n(f.smuggledValue)} cr. Value does not identify who was hurt.`;
  if (id === 'A') line += ' The new commission can clear a search. It cannot unsend these copies.';
  else if (id === 'B' && f.heat > 0) line += ' Your pursuit was active when the name was masked. Masking does not clear it.';
  else if (f.kills > 0) line += ` The combat tally records ${n(f.kills)} kills; it does not identify them all as crimes.`;
  return line;
}

function livesLine(id, f) {
  const rescued = f.lungOutcome === 'rescue';
  const first = f.namedDebts.find(r => r.explicitMercy) || f.namedDebts[0];
  let line;
  if (rescued) line = 'LUNG OF CHARON: hab-pod survivors recovered alive. Number of persons: not entered. The blank is in the report, not in the pod.';
  else if (f.lungOutcome === 'strip') line = 'LUNG OF CHARON: the hab-pod was stripped. The survivor signal was closed in the case record. The record does not establish what happened to every person behind it.';
  else if (f.lungOutcome === 'blackbox') line = 'LUNG OF CHARON: the black box was secured. Evidence came back. The entry does not say that the people did.';
  else if (f.lungOutcome === 'abandoned') line = 'LUNG OF CHARON: departure closed the incident without a recovery settlement. The ledger has no later report.';
  else if (f.lungOutcome === 'failed') line = 'LUNG OF CHARON: the recovery closed without a settlement. Outcome for the people: not established by this entry.';
  else if (f.rescueContractIds.length) line = `${n(f.rescueContractIds.length)} distinct rescue-under-fire contracts are retained. They are not a survivor headcount. Contracts can change under fire; the people require their own record.`;
  else line = 'SURVIVOR REGISTER: incomplete. No name will be supplied merely because the form has a space for one.';
  if (first) {
    const name = text(first.name).toUpperCase();
    line += first.explicitMercy ? ` ${name}: explicitly recorded spared at the last recorded encounter.`
      : first.escaped ? ` ${name}: escaped the encounter. Escape alone does not establish an act of mercy.`
        : ` ${name}: a retained moral-debt entry exists; its cause is ${text(first.cause) || 'unspecified'}.`;
    // No hidden ally/vengeful prediction and no promise the person remains alive now.
    line += ' Present whereabouts: UNCONFIRMED.';
  }
  if (rescued && id === 'A') line += ' Personnel has received the attachment. It has not cancelled it against the other columns.';
  return line;
}

function archiveLine(id, f) {
  if (f.valeGatesRevoked) return 'The retained Verge record says Vale’s gate access was revoked. This disposition does not restore it. The surviving office is not proof that every one of its permissions survived.';
  if (f.heliosGridFound) return 'HELIOS BAY 7: the maintenance scan remains in your record. The wrong grid had a destination. A new title, a blank name or a closed payment line does not install it where it was needed.';
  if (f.archiveSources.length) return `${n(f.archiveSources.length)} independently verified archive source${f.archiveSources.length === 1 ? '' : 's'} remain attached. Neither an appointment nor a settlement turns an original into an administrative inconvenience.`;
  if (id === 'D') return 'The ledger is in custody. The wider archive is incomplete. This desk will distinguish what it holds from what it has only heard.';
  return '47-A is an administrative claim about the load. Your disposition changes the claim’s treatment. It does not make the load into something else.';
}

export function compileFinaleContent(id, facts) {
  const def = FINALE_CONTENT[id];
  if (!def) return null;
  const slots = {
    balance: () => comms('ACCOUNT ATTACHMENT — BEFORE DISPOSITION', balanceLine(id, facts)),
    law: () => comms('RETAINED INCIDENT FILE', lawLine(id, facts)),
    lives: () => comms('LAST-SEEN ATTACHMENT', livesLine(id, facts)),
    archive: () => comms('ORIGINALS REGISTER', archiveLine(id, facts)),
    routes: () => comms('QUIET ROUTING — SERVICE RECORD',
      `${n(facts.tradeCount)} recorded trades. ${n(facts.routeContracts)} retained route contracts. ${n(facts.smuggledValue)} cr recorded smuggled value. There is a reason they offered you a channel rather than a name.`),
  };
  return {
    subtitle: def.subtitle,
    // Insert the written aftermath before the last human/radio line. The terminal voice keeps the
    // final word, while the whole epilogue reaches existing comms/log consumers without new UI.
    beats: [...def.beats.slice(0, -1), ...def.epilogue.map((line, i) =>
      comms(`CAPTAIN’S LOG — AFTERWORD ${i + 1}`, line, 14)), def.beats.at(-1)].map((b, i) => {
      const resolved = b.kind === 'evidence' ? { ...slots[b.slot](), delayS: b.delayS, evidenceSlot: b.slot } : { ...b };
      // Every displayed comm is sized for reading; long ledger inserts hold the one-voice floor.
      if (resolved.kind === 'comms') {
        resolved.ttl = Math.max(10, Math.ceil(resolved.text.length / 18));
      }
      return { ...resolved, ordinal: i };
    }),
    epilogue: def.epilogue.slice(),
    aftermath: { ambient: def.ambient.map(([sender, line]) => ({ sender, text: line })),
      homeGraffiti: def.homeGraffiti, completion: def.completion },
  };
}
