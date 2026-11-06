// The recorder owns the field and all aftermath choices. This adapter only surfaces a
// decision when the player caused or explicitly targeted that nearby field, or has
// actual open raid custody. Leaving the field clears presentation, never the custody.
import { getPromptDeck } from './promptDeck.js';

const DECISION_ID = 'aftermath:field';
const OBSERVE_DISTANCE_WU = 900;

export function createAftermathChoicePrompt(ctx = {}) {
  const bus = ctx.bus, state = ctx.state;
  if (!bus || typeof bus.on !== 'function') return inertPrompt();
  const deckOf = () => (ctx.deck != null ? ctx.deck : getPromptDeck());
  let observed = null, pending = null, waitingForObservation = false, disposed = false;
  let open = false, submitting = false;

  const currentPlayer = () => state?.entities?.get?.(state.playerId);
  const sector = () => state?.world?.currentSectorId || null;
  const close = () => { open = false; submitting = false; const deck = deckOf(); deck?.resolveDecision?.(DECISION_ID); };
  const nearby = (anchor) => {
    const pos = currentPlayer()?.pos;
    return !!(pos && anchor && Number.isFinite(pos.x) && Number.isFinite(pos.z)
      && Math.hypot(pos.x - anchor.x, pos.z - anchor.z) <= OBSERVE_DISTANCE_WU);
  };
  const relevant = () => !!(state?.mode === 'flight' && observed && observed.sectorId === sector() && nearby(observed.pos));
  const rememberPlayerLocation = (sectorId) => {
    const pos = currentPlayer()?.pos;
    if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return false;
    observed = { sectorId, pos: { x: pos.x, z: pos.z } };
    return true;
  };
  const observe = (record) => {
    const here = sector(), player = currentPlayer();
    if (!player?.pos || !here || record?.sectorId !== here) return;
    const body = state.entities?.get?.(record.entityId);
    const sameLife = body && (record.occupantGeneration == null
      || body.occupantGeneration === record.occupantGeneration);
    const bodyPos = sameLife && body.pos;
    const selected = state.player?.targetId === body?.id || state.ui?.objectSelection?.targetId === body?.id;
    const snapshot = record.observedSelection;
    const snapshotValid = snapshot && snapshot.entityId === record.entityId
      && Number.isSafeInteger(snapshot.occupantGeneration) && snapshot.occupantGeneration > 0
      && snapshot.occupantGeneration === record.occupantGeneration
      && [snapshot.pos?.x, snapshot.pos?.z, snapshot.playerPos?.x, snapshot.playerPos?.z].every(Number.isFinite)
      && Math.hypot(snapshot.pos.x - snapshot.playerPos.x, snapshot.pos.z - snapshot.playerPos.z) <= OBSERVE_DISTANCE_WU;
    const witnessed = selected && bodyPos && Number.isFinite(bodyPos.x) && Number.isFinite(bodyPos.z)
      && Math.hypot(bodyPos.x - player.pos.x, bodyPos.z - player.pos.z) <= OBSERVE_DISTANCE_WU;
    const playerCaused = record.killerId === state.playerId || record.destruction?.playerCaused === true;
    if (!snapshotValid && !witnessed && !playerCaused) return;
    const pos = snapshotValid ? snapshot.pos : witnessed ? bodyPos : player.pos;
    observed = { sectorId: here, pos: { x: pos.x, z: pos.z } };
    // The recorder may suppress an unchanged choice signature. Once a nearby outcome is
    // actually witnessed, surface the still-current offer after its synchronous update.
    if (waitingForObservation && pending) queueMicrotask(() => {
      if (!disposed && waitingForObservation && pending && relevant()) show(pending);
    });
  };
  const show = (payload) => {
    const choices = Array.isArray(payload?.choices) ? payload.choices : [];
    const deck = deckOf();
    if (!deck || typeof deck.offerDecision !== 'function') return false;
    if (choices.length < 2) { pending = null; waitingForObservation = false; close(); return false; }
    if (payload.sectorId !== sector()) { pending = null; waitingForObservation = false; close(); return false; }
    // Retain refreshes for a genuinely unresolved offer awaiting observation.
    // A refresh after an answer still cannot create a new decision.
    if (payload.refreshOnly && !open && !waitingForObservation) return false;
    pending = payload;
    if (payload.stale) submitting = false;
    if (!relevant() && Array.isArray(payload.custody) && payload.custody.length) rememberPlayerLocation(payload.sectorId);
    if (!relevant()) { waitingForObservation = true; close(); return false; }
    waitingForObservation = false;
    const descriptions = { salvage: 'Wreck available', pursuit: 'Ship recorded fleeing', rescue: 'Survivor available' };
    const contexts = choices.map((choice) => choice?.context || descriptions[choice?.id]).filter(Boolean);
    const spec = {
      id: DECISION_ID, kind: 'info', sender: 'AFTERMATH', headline: 'FIELD RESPONSE', deadlineAt: null,
      detail: contexts.length ? contexts.join(' · ') : 'Choose a response. Flight remains active.',
      choices: choices.map((choice) => ({ id: String(choice?.id || ''), label: String(choice?.label || choice?.id || '') })).filter((choice) => choice.id),
      // Retain the exact unresolved choice without claiming keys away from the field.
      // The deck restores it automatically if the pilot returns before a lifecycle reset.
      onTick: () => { deck.setDecisionVisible?.(DECISION_ID, relevant()); },
      onChoose: (choiceId) => {
        if (!relevant()) { pending = null; close(); return; }
        if (submitting) return;
        const choice = pending?.choices?.find((item) => item.id === choiceId);
        if (!choice) return;
        submitting = true;
        bus.emit('combat:aftermathChoose', { choiceId, source: 'deck',
          ...(choice.targetIdentity != null ? { targetIdentity: choice.targetIdentity } : {}) });
      },
    };
    if (payload.refreshOnly && open && typeof deck.updateDecision === 'function') {
      return deck.updateDecision(DECISION_ID, spec);
    }
    open = true;
    return deck.offerDecision(spec);
  };
  const reset = () => { observed = null; pending = null; waitingForObservation = false; close(); };
  const chosen = () => { pending = null; waitingForObservation = false; close(); };
  const unsubs = [bus.on('combat:outcome', observe), bus.on('combat:aftermathChoices', show),
    bus.on('combat:aftermathChosen', chosen),
    bus.on('sector:exit', reset), bus.on('game:new', reset), bus.on('save:loaded', reset)];
  return {
    show,
    destroy() { disposed = true; reset(); for (const off of unsubs) if (typeof off === 'function') off(); },
  };
}
function inertPrompt() { return { show: () => false, destroy() {} }; }
export default createAftermathChoicePrompt;
