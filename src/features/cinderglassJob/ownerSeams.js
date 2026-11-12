// These narrow methods are imported by the canonical cargo/economy owners.
// They never install themselves or create a second wallet.
import { ensureCommittedIntents } from '../../systems/cargoCustody.js';
import { attachments, nativeCinderglassAttachment } from './custody.js';

export function receiveCinderglassPod(operationId, quoteId, token) {
  const owner = this.registry?.get('cinderglassJob');
  const quote = owner?.receiveAuthorization(operationId, quoteId, token);
  if (!quote || owner._receiving) return { ok: false, reason: 'receive_unavailable' };
  const { pod, receiver } = quote, state = this.state, life = owner.token(), svc = attachments(owner);
  const economy = this.registry?.get('economy');
  const walletReady = () => Number.isSafeInteger(state.player?.credits) && state.player.credits >= 0
    && state.player.credits <= Number.MAX_SAFE_INTEGER - quote.amount;
  if (!svc || state !== owner.state || typeof economy?.settleCinderglassResult !== 'function') return { ok: false, reason: 'physical_owner_unavailable' };
  if (!walletReady()) return { ok: false, reason: 'wallet_full' };
  owner._receiving = true;
  try {
    const existing = svc.listForEntity(pod.id).find(a => a.state === 'active'
      && a.defId === 'attachment_transport_clamp' && a.ownerId === receiver.id && a.targetId === pod.id
      && a.ownerGeneration === receiver.occupantGeneration && a.targetGeneration === pod.occupantGeneration);
    const made = existing ? { ok: true, attachment: existing }
      : svc.create({ defId: 'attachment_transport_clamp', ownerId: receiver.id, targetId: pod.id });
    if (!made?.ok) return { ok: false, reason: made?.reason || 'receive_refused' };
    const joint = made.attachment;
    const fresh = owner.token() === life && owner.receiveAuthorization(operationId, quoteId, token);
    if (!fresh || fresh.pod !== pod || fresh.receiver !== receiver || !walletReady() || !nativeCinderglassAttachment(owner, state, joint)) {
      if (!existing) svc.cut(joint.id, receiver.id, 'cinderglass_receive_cancelled');
      return { ok: false, reason: 'stale_receive' };
    }
    const receipt = { receiptId: `${operationId}:receive`, operationId, recipient: quote.recipient,
      originalId: pod.data.originalId, condition: quote.condition, baseCr: quote.baseCr,
      refundCr: quote.refundCr, amount: quote.amount, receivedAtTick: state.tick,
      source: 'cargo:cinderglass', status: 'accepted' };
    // Cargo owns the physical manifest transfer. Legal title remains disputed at the fence.
    pod.ownerId = pod.data.ownerId = quote.recipient === 'tala' ? 'manifest_tala_rook' : 'manifest_vesi_khand';
    pod.data.custodyOwnerId = receiver.data.worldRecordId;
    pod.data.cinderglassReceiveReceipt = receipt.receiptId;
    if (!owner.acceptReceive(receipt, joint)) throw new Error('cinderglass_receive_commit_changed');
    // Settlement precedes any outward line-retirement event. Its wallet+receipt+feature writes
    // complete before credits listeners can Continue, reset, or attempt another transfer.
    const paid = economy.settleCinderglassResult(operationId, receipt.receiptId);
    if (!paid?.ok) return { ok: false, reason: paid?.reason || 'settlement_pending', receipt };
    // The receiver's real native joint has accepted the original before the pilot's line retires.
    for (const line of owner.token() === life && state.entities.get(pod.id) === pod ? svc.listForEntity(pod.id) : []) if (line.state === 'active'
      && line.targetId === pod.id && line.ownerId === state.playerId) svc.cut(line.id, state.playerId, 'received_cinderglass');
    this.bus.emit('cargo:cinderglassReceived', { ...receipt });
    return { ok: true, receipt };
  } finally { owner._receiving = false; }
}

export function settleCinderglassResult(operationId, receiptId) {
  const owner = this.registryGet?.('cinderglassJob');
  if (!owner || this.state !== owner.state || typeof operationId !== 'string' || typeof receiptId !== 'string') {
    return { ok: false, reason: 'operation_unavailable' };
  }
  const key = `cinderglass:${operationId}:settlement`, intents = ensureCommittedIntents(this.state);
  const prior = intents?.[key]?.result;
  if (prior) return owner.settlementMatches(prior) && prior.receiptId === receiptId
    ? { ok: true, duplicate: true, ...prior } : { ok: false, reason: 'receipt_mismatch' };
  const auth = owner.settlementAuthorization(operationId, receiptId);
  if (!auth || !intents || !Number.isSafeInteger(auth.amount) || auth.amount <= 0
    || ![300, 450, 600].includes(auth.amount)) return { ok: false, reason: 'unaccepted_receive' };
  const before = this.state.player?.credits;
  if (!Number.isSafeInteger(before) || before < 0 || before > Number.MAX_SAFE_INTEGER - auth.amount) {
    return { ok: false, reason: 'wallet_full' };
  }
  const result = { operationId, receiptId, recipient: auth.recipient, creditedCr: auth.amount,
    baseCr: auth.baseCr, refundCr: auth.refundCr, key };
  // No emissions between authorization, feature acceptance and durable receipt reservation.
  if (!owner.acceptSettlement(result)) return { ok: false, reason: 'receive_changed' };
  intents[key] = { result };
  this.grantCredits(auth.amount, key); // sole wallet writer, normal cash/earnings/notification path
  return { ok: true, duplicate: false, ...result };
}
