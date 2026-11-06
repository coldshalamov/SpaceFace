// Lantern Ward's optional family-lamp story. World work owns evidence; missions owns settlement.
const STORY_ID = 'lw_helios_empty_plinth';
const DISTRICT_ID = 'district_helios_lantern_ward';
const SECTOR_ID = 'sector_helios_prime';
const RECEIPT_ID = 'lantern-ward:venn-family-lamp:service:01';
const LAMP_RECORD_ID = 'lantern-ward:lamp';
const RECEIVER_RECORD_ID = 'lantern-ward:receiver';
const LAMP_SERIAL = 'venn-family-lamp:01';
const REWARD = 180;
const VERSION = 1;
const isRecord = value => value != null && typeof value === 'object' && !Array.isArray(value);
const nonnegative = value => Number.isFinite(value) && value >= 0;
const tickValue = value => Number.isSafeInteger(value) && value >= 0;
const blockedReward = () => ({ version: VERSION, status: 'blocked', storyId: STORY_ID });

/** Additive save journal: absent is unpaid; malformed presence never reopens payment. */
export function normalizeLanternWardReward(value) {
  if (value == null) return null;
  if (!isRecord(value) || value.version !== VERSION || value.storyId !== STORY_ID) return blockedReward();
  if (value.status === 'blocked') return blockedReward();
  if (!['settled', 'reserved'].includes(value.status) || value.receiptId !== RECEIPT_ID ||
      !Number.isSafeInteger(value.credited) || value.credited < 0 || value.credited > REWARD ||
      !tickValue(value.committedTick) || !nonnegative(value.committedAtS)) return blockedReward();
  return {
    version: VERSION, status: value.status, storyId: STORY_ID, receiptId: RECEIPT_ID,
    credited: value.credited, committedTick: value.committedTick, committedAtS: value.committedAtS,
  };
}

function validReceipt(receipt, receiptId) {
  return isRecord(receipt) && receiptId === RECEIPT_ID && receipt.receiptId === receiptId &&
    receipt.storyId === STORY_ID && receipt.districtId === DISTRICT_ID && receipt.sectorId === SECTOR_ID &&
    receipt.lampRecordId === LAMP_RECORD_ID && receipt.lampSerial === LAMP_SERIAL &&
    receipt.receiverRecordId === RECEIVER_RECORD_ID && receipt.committed === true && receipt.count === 1 &&
    tickValue(receipt.committedTick) && nonnegative(receipt.committedAtS) && receipt.playerHelped === true;
}

/** Called only by the registered missions owner in response to the work owner's commit. */
export function settleLanternWard(owner, receiptId) {
  const state = owner?.state;
  if (!state || !isRecord(state.missions) || typeof receiptId !== 'string') return { ok: false, reason: 'invalid_request' };
  const prior = normalizeLanternWardReward(state.missions.lanternWardReward);
  if (prior) {
    state.missions.lanternWardReward = prior;
    return prior.status === 'settled' && receiptId === prior.receiptId
      ? { ok: true, duplicate: true, journal: { ...prior } }
      : { ok: false, reason: 'reward_closed', journal: { ...prior } };
  }
  const work = owner.registry?.get?.('npcJobsRuntime');
  let receipt;
  try { receipt = work?.lanternWardReceipt?.(receiptId); } catch {
    return { ok: false, reason: 'unverified_receipt' };
  }
  if (!validReceipt(receipt, receiptId)) return { ok: false, reason: 'unverified_receipt' };
  if (receipt.committedTick !== state.tick || receipt.committedAtS !== state.simTime ||
      state.world?.currentSectorId !== SECTOR_ID) return { ok: false, reason: 'stale_receipt' };
  const economy = owner.registry?.get?.('economy');
  if (typeof economy?.grantCredits !== 'function' || typeof owner.bus?.emit !== 'function') {
    return { ok: false, reason: 'credit_owner_pending' };
  }
  const before = state.player?.credits;
  if (!Number.isSafeInteger(before) || before < 0) return { ok: false, reason: 'invalid_balance' };
  const journal = {
    version: VERSION, status: 'reserved', storyId: STORY_ID, receiptId,
    credited: Math.min(REWARD, Number.MAX_SAFE_INTEGER - before),
    committedTick: receipt.committedTick, committedAtS: receipt.committedAtS,
  };
  // Reserve before synchronous listeners run, including save and reentrant settlement listeners.
  state.missions.lanternWardReward = journal;
  try {
    if (journal.credited > 0) owner.bus.emit('economy:grantCredits', { amount: journal.credited, reason: STORY_ID });
  } catch {
    return { ok: false, reason: 'credit_dispatch_uncertain', journal: { ...journal } };
  }
  if (state.player.credits !== before + journal.credited) {
    return { ok: false, reason: 'credit_dispatch_uncertain', journal: { ...journal } };
  }
  // A reentrant listener may normalize the reservation into a new object.
  // Commit through state again so the saved journal, not a detached reference, settles.
  state.missions.lanternWardReward = { ...journal, status: 'settled' };
  journal.status = 'settled';
  try { owner._logCompletion?.(STORY_ID, journal.credited, true); } catch { /* Presentation cannot reopen the journal. */ }
  try {
    owner.bus.emit('mission:completed', { missionId: STORY_ID, type: STORY_ID, reward: journal.credited, factionId: null, repMult: 0 });
  } catch { /* The economy mutation has already completed. */ }
  return { ok: true, duplicate: false, journal: { ...journal } };
}

const LINES = {
  neutral: ["That's a family lamp. The twenty-fifth memorial stays dark.", "Our lamp has its own seat. The memorial's dark one belongs to everyone."],
  blockage: ["The mast blocks our Venn household lamp. Its seat has three brass strokes; the separate public memorial stays dark.", "Our family lamp is waiting on the cradle. Its seat is not the dark public memorial."],
  help: ["Your help counts. Bring this same lamp to the Venn seat; I'll make the connection.", "We saw your help with our lamp. Nessa can finish the connection now."],
  missingLamp: ["The original Venn lamp is unavailable. Another lamp cannot fill their seat.", "Our original lamp is unavailable. Its seat must wait."],
  displaced: ["The Venn lamp is out of its seat. Return the same lamp and release your Massline near the three brass strokes; I will connect it.", "Our lamp is out of its seat. Nessa can connect it when it is returned."],
  unavailable: ["The service cannot continue while its equipment or operator is unavailable. The household seat must wait.", "Our household seat must wait until the service can continue."],
  shortage: ["The cradle is away. The Venn lamp needs its cradle or a lift to the household seat.", "The cradle is away. Our lamp still needs to reach its seat."],
  injury: ["The launch took a hit. This run will be late; keep the turn clear.", "Nessa's launch was damaged. We're keeping the seat clear while she works."],
  repair: ["The lamp's contacts are damaged. One electronics unit, here beside the launch, and I can repair them.", "The family lamp was damaged. Nessa needs an electronics unit to mend the contacts."],
  theft: ["I remember the missing procession gear. The household is still waiting for its lamp.", "We remember when our procession gear went missing."],
  recovery: ["Same serial, back in its seat. I'll remember what happened, and the return.", "Our own lamp came back. We kept its seat waiting."],
  installedHelp: ["The Venn lamp's connected. You helped get it here. Thank you.", "You helped bring our lamp home. We left you room by the rail."],
  installed: ["Venn family circuit is live. One household done; the dark memorial stays dark.", "Nessa brought our lamp home. We're ready for the procession."],
  ignored: ["The watch deadline passed. The household waited; I still have a lamp to connect.", "We waited through the watch with our seat empty."],
  working: ["Keep the cradle steady. I need both contacts seated before I energise it.", "That's our lamp on the cradle. Nessa's lining up the contacts."],
  revisitHelp: ["Venn lamp's still here. You helped get that light home last time.", "We remember your help with our lamp. There's still room by the rail."],
  revisitTheft: ["I remember the missing gear. A new visit doesn't settle that debt.", "We remember when our gear went missing. The empty seat wasn't decoration."],
  revisitRecovery: ["The returned lamp is still the same one. We remember getting it back.", "Our lamp came back. We still tell that part of the story."],
  revisitIgnored: ["The watch deadline passed. We still remember the household's wait.", "We waited through the blocked passage. A visit later, we still remember."],
};

/** Pure projection of the work owner's status; neither accepts work nor changes world state. */
export function selectLanternWardDialogue(status, { speaker = 'nessa', revisit = false } = {}) {
  const household = speaker === 'household';
  const who = household ? 'household' : 'nessa';
  const s = isRecord(status) && status.districtId === DISTRICT_ID ? status : {};
  const h = isRecord(s.history) ? s.history : {};
  const theft = s.cradleStolen === true || h.cradleStolen === true || h.lampStolen === true;
  const recovered = s.installed === true && h.recovered === true;
  const returnVisit = revisit === true;
  let key = 'neutral';
  if (s.missingLamp === true) key = 'missingLamp';
  else if (s.damaged === true || s.phase === 'damaged') key = 'repair';
  else if (s.phase === 'displaced') key = 'displaced';
  else if (s.cradleMissing === true && !s.installed) key = 'shortage';
  else if (s.phase === 'missing') key = 'unavailable';
  else if (s.injured === true || s.tugDamaged === true || s.phase === 'injured') key = 'injury';
  else if (recovered) key = returnVisit ? 'revisitRecovery' : 'recovery';
  else if (returnVisit && (s.ignored === true || h.ignored === true)) key = 'revisitIgnored';
  else if (s.installed === true && s.playerHelped === true) key = returnVisit ? 'revisitHelp' : 'installedHelp';
  else if (s.installed === true) key = 'installed';
  else if (theft) key = returnVisit ? 'revisitTheft' : 'theft';
  else if (s.ignored === true || h.ignored === true) key = returnVisit ? 'revisitIgnored' : 'ignored';
  else if (s.blocked === true || s.phase === 'blocked') key = 'blockage';
  else if (s.playerHelped === true) key = 'help';
  else if (['working', 'collecting', 'carrying', 'aligning', 'installing', 'servicing'].includes(s.phase)) key = 'working';
  const currentProblem = ['missingLamp', 'repair', 'displaced', 'shortage', 'unavailable'].includes(key);
  const memory = (currentProblem || (s.installed === true && !recovered)) && theft ? (household ? ' We remember the missing gear.' : ' I remember the missing gear.')
    : currentProblem && (s.ignored === true || h.ignored === true) ? ' The household remembers the wait.' : '';
  return { id: `${STORY_ID}:${who}:${key}`, text: LINES[key][household ? 1 : 0] + memory, speaker: who };
}
