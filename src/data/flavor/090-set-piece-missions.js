import { defineFlavorPack } from './catalog.js';

export const flavorOrder = 90;
export const flavorId = 'set_piece_missions';
export const flavorKind = 'mission_set_piece';

function stageCopy(archetypeId, stageId, copy) {
  return ['instruction', 'success', 'failure', 'recovery'].map((phase) => ({
    id: `${archetypeId}_${stageId}_${phase}`,
    sourceRef: `mission.sp1.${archetypeId}.${stageId}.${phase}`,
    archetypeId,
    stageId,
    phase,
    channelId: phase === 'instruction' ? 'mission' : 'mission_receipt',
    nativeFormat: phase === 'instruction' ? 'objective_brief' : 'house_receipt',
    text: copy[phase],
  }));
}

function travelLine(actorId, sequence, text) {
  return {
    id: `witness_${actorId}_travel_${sequence}`,
    sourceRef: `mission.sp1.witness_run.travel.${actorId}.${sequence}`,
    archetypeId: 'witness_run',
    actorId,
    phase: 'travel',
    channelId: 'comms',
    nativeFormat: 'witness_transit_line',
    text,
  };
}

export default defineFlavorPack({
  id: flavorId,
  kind: flavorKind,
  description: 'Instructions, witness transit lines, and house-voice receipts for SP1 set-piece mission chains (including depth shape expansions).',
  entries: [
    ...stageCopy('long_read', 'rumor_survey', {
      instruction: 'Pay Drift’s broker; fly the bearing, then harden ring to point.',
      success: 'RUMOR PURCHASED. THE BAD BEARING HARDENED INTO ONE RECOVERABLE WRECK.',
      failure: 'SURVEY CLOSED. THE WRECK CONTINUES OWNING ITSELF.',
      recovery: 'BROKER RETAINS THE SOURCE. THE SAME BEARING MAY BE FINISHED.',
    }),
    ...stageCopy('long_read', 'hold_the_cutters', {
      instruction: 'Reach the fixed wreck, survive its complication, and complete the live salvage.',
      success: 'RECOVERY OPENED. THE WRECK NOW REQUIRES A NAMED DISPOSITION.',
      failure: 'WORKSITE CLOSED. THE COMPLICATION KEPT THE BETTER CLAIM.',
      recovery: 'THE BEARING REMAINS FIXED. A SMALLER RECOVERY WINDOW IS OPEN.',
    }),
    ...stageCopy('long_read', 'file_the_evidence', {
      instruction: 'Choose lawful handover on the recovered wreck and file its native receipt.',
      success: 'EVIDENCE FILED. THE WRECK LEFT YOUR CLAIM UNDER A LEGIBLE NAME.',
      failure: 'HANDOVER CLOSED. THE RECOVERY STILL WAITS FOR A DISPOSITION.',
      recovery: 'THE AUTHORITY WINDOW REMAINS OPEN AT A REDUCED STAKE.',
    }),
    ...stageCopy('long_read', 'erase_the_origin', {
      instruction: 'Claim recovered hardware; let Quiet rewrite how it entered your hands.',
      success: 'ORIGIN REMOVED. THE WRECK ENTERED YOUR CLAIM UNDER A QUIETER NAME.',
      failure: 'CLAIM UNSETTLED. THE FENCE HAS REPRICED YOUR DISCRETION.',
      recovery: 'NYX RETAINS A NARROWER BLIND WINDOW. THE LOT MAY MOVE AGAIN.',
    }),

    ...stageCopy('witness_run', 'compare_aliases', {
      instruction: 'Scan three Customs marks; identify the alias attached to a person.',
      success: 'THREE ALIASES COMPARED. ONE PERSON REMAINS.',
      failure: 'ALIAS CHECK CLOSED. THE PERSON REMAINS ADMINISTRATIVELY OPTIONAL.',
      recovery: 'CUSTOMS PRESERVED TWO MATCHES. THE THIRD MAY BE READ AGAIN.',
    }),
    ...stageCopy('witness_run', 'extract_the_witness', {
      instruction: 'Carry the named witness from Customs Gate to Drift Market.',
      success: 'PASSENGER ARRIVED UNDER A NAME NOBODY OWNS.',
      failure: 'PASSENGER LOST. THE UNUSED NAME HAS RETURNED TO INVENTORY.',
      recovery: 'A SECOND BERTH IS OPEN. THE WITNESS STILL DISLIKES THE FIRST PLAN.',
    }),
    ...stageCopy('witness_run', 'transfer_public_custody', {
      instruction: 'Carry the witness to Coalition HQ without adding a kill.',
      success: 'WITNESS ENTERED INTO CUSTODY. THE FILE ACQUIRED A PULSE.',
      failure: 'CUSTODY TRANSFER FAILED. THE TESTIMONY REMAINS A TRAVEL STORY.',
      recovery: 'COALITION HOLDS A CIVILIAN BERTH. DRIFT HOLDS THE WITNESS.',
    }),
    ...stageCopy('witness_run', 'file_the_testimony', {
      instruction: 'Carry the sealed testimony from Coalition HQ to Tethys intact.',
      success: 'TESTIMONY FILED. RETALIATION WINDOW NOW PUBLIC.',
      failure: 'TESTIMONY LOST. RETALIATION REMAINS A PRIVATE SCHEDULING MATTER.',
      recovery: 'COALITION RETAINED A SIGNED EXTRACT. PUBLICATION MAY BE TRIED AGAIN.',
    }),
    ...stageCopy('witness_run', 'run_the_shelter_key', {
      instruction: 'Move the shelter key from Drift to Nyx without inspection.',
      success: 'SHELTER KEY DELIVERED. THE WITNESS NOW HAS SOMEWHERE NOT TO BE.',
      failure: 'SHELTER KEY EXPOSED. THE SAFE ADDRESS HAS BECOME DIRECTIONS.',
      recovery: 'DRIFT SPLIT THE KEY. NYX WILL ACCEPT THE SURVIVING HALF.',
    }),
    ...stageCopy('witness_run', 'verify_quiet_handoffs', {
      instruction: 'Scan three Nyx handoffs without submitting to patrol inspection.',
      success: 'WITNESS SHELTERED. RECORD REMAINS USEFUL AND UNAVAILABLE.',
      failure: 'SHELTER TRAIL BROKEN. ABSENCE NOW REQUIRES AN EXPLANATION.',
      recovery: 'NYX PRESERVED TWO HANDOFFS. A CLEAN THIRD MAY CLOSE THE TRAIL.',
    }),

    ...stageCopy('hearing', 'open_the_hearing', {
      instruction: 'Scan Vesta’s three siege anchors and enter them into evidence.',
      success: 'HEARING OPENED. STATION SURVIVAL ENTERED AS DISPUTED EVIDENCE.',
      failure: 'HEARING SUSPENDED. THE SIEGE CONTINUES WITHOUT COUNSEL.',
      recovery: 'VESTA RETAINS TWO ANCHOR READINGS. THE RECORD MAY REOPEN.',
    }),
    ...stageCopy('hearing', 'escort_the_tender', {
      instruction: 'Escort the repair tender to the Choir depot without killing.',
      success: 'REPAIR TENDER DOCKED. CONTINUANCE GRANTED TO THE LIVING.',
      failure: 'REPAIR TENDER LOST. CONTINUANCE DENIED BY MATERIAL FACT.',
      recovery: 'FORGE HAS ONE RESERVE TENDER. ITS CREW HAS READ THE FIRST RECEIPT.',
    }),
    ...stageCopy('hearing', 'break_the_screen', {
      instruction: 'Clear Vesta’s three marked siege ships. Leave unmarked traffic alone.',
      success: 'SIEGE SCREEN BROKEN. HEARING ADJOURNED WITHOUT A VERDICT.',
      failure: 'SIEGE SCREEN HOLDS. THE STATION HAS BEEN ORDERED TO KEEP WAITING.',
      recovery: 'FORGE HAS REFILED THE THREE MARKS. THE DEFENSE MAY CALL AGAIN.',
    }),
    ...stageCopy('hearing', 'deliver_target_deck', {
      instruction: 'Carry the signed target deck to the Choir depot uninspected.',
      success: 'TARGET DECK ACCEPTED. DELAY NOW COUNTS AS NONCOMPLIANCE.',
      failure: 'TARGET DECK EXPOSED. EXPEDIENCE HAS ACQUIRED WITNESSES.',
      recovery: 'FORGE RETAINED A THINNER DECK. THE EXPEDITED MOTION REMAINS OPEN.',
    }),
    ...stageCopy('hearing', 'file_firing_corrections', {
      instruction: 'Scan Vesta’s three firing apertures without submitting to inspection.',
      success: 'FIRING CORRECTIONS FILED. STATION RESPONSE ENTERED AS SILENCE.',
      failure: 'CORRECTIONS REJECTED. THE STATION RESPONSE REMAINS PENDING IMPACT.',
      recovery: 'TWO APERTURES REMAIN ON RECORD. THE THIRD MAY STILL BE MADE PRECISE.',
    }),

    ...stageCopy('blockade_run', 'map_the_cordon', {
      instruction: 'Scan three cordon anchors and enter their ranges into the approach brief.',
      success: 'CORDON MAPPED. THE LANE NOW HAS A COST AND A ROUTE.',
      failure: 'CORDON UNREAD. THE LANE REMAINS SOMEONE ELSE’S PROPERTY.',
      recovery: 'CUSTOMS KEPT TWO ANCHOR PINGS. THE THIRD MAY STILL BE BOUGHT.',
    }),
    ...stageCopy('blockade_run', 'hold_course_under_fire', {
      instruction: 'Carry the sealed crate through the cordon approach without losing the lot.',
      success: 'COURSE HELD. THE CRATE REACHED THE INNER MARK UNDER FIRE.',
      failure: 'COURSE BROKEN. THE CRATE IS A DEBRIS ENTRY NOW.',
      recovery: 'A THINNER CRATE IS PRELOADED. THE INNER MARK STILL ACCEPTS IT.',
    }),
    ...stageCopy('blockade_run', 'run_the_quiet_tithe', {
      instruction: 'Move the crate to the Smuggler Den without submitting to a scan.',
      success: 'TITHE PAID. ARRIVAL FILED UNDER A QUIETER AUTHORITY.',
      failure: 'TITHE EXPOSED. THE QUIET ROUTE HAS BECOME A PUBLIC STORY.',
      recovery: 'NYX REPRICED THE BLIND WINDOW. THE DEN STILL HAS A SLOT.',
    }),
    ...stageCopy('blockade_run', 'clear_the_cordon', {
      instruction: 'Clear three marked cordon ships. Leave unmarked traffic alone.',
      success: 'CORDON SCREEN BROKEN. THE PUBLIC LANE IS TEMPORARILY HONEST.',
      failure: 'CORDON HOLDS. PUBLIC ARRIVAL REMAINS A THEORETICAL RIGHT.',
      recovery: 'CUSTOMS REFILED THE THREE MARKS. THE GUNS MAY BE CALLED AGAIN.',
    }),
    ...stageCopy('blockade_run', 'dock_through_wreckage', {
      instruction: 'Deliver the crate to Drift Market with the cargo still sealed.',
      success: 'PUBLIC DOCK COMPLETE. THE BLOCKADE LEFT A RECEIPT WITH YOUR NAME.',
      failure: 'DELIVERY LOST IN WRECKAGE. PUBLIC MEMORY KEEPS THE FAILURE.',
      recovery: 'DRIFT HOLDS A REDUCED BERTH. THE SAME LOT MAY STILL ARRIVE.',
    }),

    ...stageCopy('investigation_chain', 'scan_the_silent_wreck', {
      instruction: 'Scan three wreck signatures and isolate the silent black-box ping.',
      success: 'WRECK ISOLATED. THE SILENT BOX IS NOW A BEARING, NOT A RUMOR.',
      failure: 'SCAN CLOSED. THE SILENT BOX REMAINS AN UNCLAIMED NOISE.',
      recovery: 'REACH KEPT TWO SIGNATURES. THE THIRD MAY BE READ AGAIN.',
    }),
    ...stageCopy('investigation_chain', 'recover_the_black_box', {
      instruction: 'Recover the black box without adding a kill to the wreck’s log.',
      success: 'BOX RECOVERED. THE LOG NOW REQUIRES A NAMED READER.',
      failure: 'RECOVERY FAILED. THE BOX STILL OWNS THE BETTER STORY.',
      recovery: 'THE WRECK REMAINS FIXED. A SMALLER EXTRACTION WINDOW IS OPEN.',
    }),
    ...stageCopy('investigation_chain', 'file_the_log', {
      instruction: 'Carry the sealed log to Customs Gate without losing integrity.',
      success: 'LOG FILED. NAMES ARE NOW PUBLIC AND SOMEBODY WILL ANSWER.',
      failure: 'FILING LOST. THE NAMES REMAIN PRIVATE AND DANGEROUS.',
      recovery: 'CUSTOMS HOLDS A THINNER DOCKET. PUBLICATION MAY BE RETRIED.',
    }),
    ...stageCopy('investigation_chain', 'sell_the_log', {
      instruction: 'Move the sealed log to Nyx March without inspection.',
      success: 'LOG SOLD QUIET. THE FINDER NAME HAS BEEN ERASED FROM THE STORY.',
      failure: 'SALE EXPOSED. THE QUIET BUYER HAS BECOME A PUBLIC INTEREST.',
      recovery: 'NYX REOPENED A NARROWER BLIND WINDOW FOR THE SAME LOT.',
    }),

    travelLine('dorin', '01', 'They made the seal clean after they made the corridor quiet.'),
    travelLine('dorin', '02', 'The first list named the missing. The second named authorized witnesses.'),
    travelLine('dorin', '03', 'Not courage. I exhausted every department willing to lose that page.'),
    travelLine('dorin', '04', 'If Coalition asks, I volunteered. If Nyx asks, nobody carried me.'),
    travelLine('kell', '01', 'Every manifest has a shadow copy. Mine started answering back.'),
    travelLine('kell', '02', 'Customs erased the question that made the cargo evidence.'),
    travelLine('kell', '03', 'I can testify to numbers. Motive costs extra.'),
    travelLine('kell', '04', 'Public or sheltered, someone keeps a receipt. Choose its reader.'),
  ],
});
