import { getPromptDeck } from '../../ui/promptDeck.js';
import { getPromptDevice, getGamepadGlyphSet } from '../../ui/bindings.js';
import { resolveActionLabel } from '../../systems/input.js';
import { gamepadButtonLabels, resolveGamepadBindings } from '../../systems/gamepad.js';

export const SHIPBREAKING_DECISION_ID = 'shipbreaking-yard:decision';
const META_KEYS = ['layoutId', 'moduleId', 'couplingId', 'jobId'];
/** Names the real controls, including remaps/chords, without taking ownership of input. */
export function shipbreakingControlHint(row, state, device = getPromptDevice()) {
  if (row?.kind !== 'work') return null;
  if (device === 'touch') return 'Back to Flying → MassLine to tow · Scan to reopen';
  const pad = device === 'gamepad' ? resolveGamepadBindings(state?.settings) : null;
  const label = action => pad
    ? gamepadButtonLabels(action === 'tether' ? 'massline' : action, pad, { glyphSet: getGamepadGlyphSet() }).join('/')
    : resolveActionLabel(state, action);
  const line = label('tether'), scan = label('scanPulse');
  return `Back to Flying → ${line ? `${line} ` : ''}MassLine · ${scan ? `${scan} ` : ''}scan`;
}
/** Adapts sim-owned decisions onto the existing flight deck. No gameplay writes or key handlers. */
export function shipbreakingDecisionSpec(row, choose) {
  if (!row || !Array.isArray(row.actions)) return null;
  const actions = row.actions.slice(0, 8);
  const counts = new Map();
  for (const action of actions) counts.set(action.id, (counts.get(action.id) || 0) + 1);
  // Several rows may ask the same verb for different originals. Deck IDs identify the row;
  // the outgoing actionId remains the sim-owned verb. Never resolve the first matching verb.
  const wireIds = actions.map((action, index) => counts.get(action.id) > 1 ? `${action.id}:${index}` : String(action.id));
  const choices = actions.map((action, index) => ({
    id: wireIds[index], label: String(action.label || action.id), title: String(action.title || ''),
    disabled: action.disabled === true, cancel: action.id === 'leave' || action.cancel === true,
  }));
  if (!choices.some(choice => choice.cancel)) choices.push({ id: 'leave', label: 'LEAVE OPEN', cancel: true });
  return {
    id: SHIPBREAKING_DECISION_ID,
    kind: row.kind === 'confirm-abandon' || row.danger ? 'danger' : row.warning ? 'warn' : 'info',
    sender: 'CERES SHIPBREAKERS · RECEIVING SCALE',
    headline: String(row.title || row.headline || 'Choose a wreck'),
    detail: String(row.detail || row.text || ''),
    statusFlag: String(row.statusFlag || 'Inspect freely · flight remains active'),
    choices,
    onChoose: choiceId => {
      const selected = actions[wireIds.indexOf(choiceId)];
      const actionId = selected?.id || choiceId;
      if (selected?.disabled) return false;
      if (!selected && actionId !== 'leave') return false;
      const payload = { actionId, revision: row.revision, jobId: row.jobId || null };
      for (const key of META_KEYS) {
        const value = selected?.[key] ?? row[key];
        if (typeof value === 'string') payload[key] = value;
      }
      choose(payload); return true;
    },
  };
}
export function createShipbreakingYardPresentation({ deckProvider = getPromptDeck } = {}) {
  return {
    name: 'shipbreakingYardPresentation',
    init(ctx) {
      this.destroy(); this._state = ctx.state; this._bus = ctx.bus; this._subscriptions = [];
      const on = (name, fn) => {
        const bus = this._bus, off = bus.on(name, fn);
        this._subscriptions.push(typeof off === 'function' ? off : () => bus.off?.(name, fn));
      };
      on('shipbreakingYard:offer', row => this.offer(row));
      on('shipbreakingYard:close', () => this.reset());
      on('shipbreakingYard:receipt', row => {
        if (!row?.text) return;
        this._bus?.emit('toast', { text: String(row.text), kind: row.kind || 'info', ttl: 5, source: 'shipbreakingYard' });
      });
      for (const event of ['save:restoring', 'dock:docked', 'sector:exit', 'run:ended']) on(event, () => this.reset());
    },
    offer(row) {
      const deck = deckProvider(); if (!deck) return false;
      if (row?.refreshOnly === true && (!deck.hasDecision?.(SHIPBREAKING_DECISION_ID)
        || this._currentContext?.jobId !== row.jobId || this._currentContext?.moduleId !== row.moduleId)) return false;
      const presented = row && !row.statusFlag ? { ...row, statusFlag: shipbreakingControlHint(row, this._state) || undefined } : row;
      const spec = shipbreakingDecisionSpec(presented, payload => {
        deck.resolveDecision(SHIPBREAKING_DECISION_ID); this._lastSignature = null; this._currentContext = null;
        this._bus?.emit('shipbreakingYard:action', payload);
      });
      if (!spec) return false;
      const signature = JSON.stringify([row.revision, row.jobId, row.kind, spec.headline, spec.detail, spec.statusFlag, spec.choices]);
      if (signature === this._lastSignature) return true;
      this._lastSignature = signature; this._currentContext = { jobId: row.jobId, moduleId: row.moduleId };
      if (deck.hasDecision?.(SHIPBREAKING_DECISION_ID) && typeof deck.updateDecision === 'function') {
        return deck.updateDecision(SHIPBREAKING_DECISION_ID, spec) !== false;
      }
      return deck.offerDecision(spec) !== false;
    },
    reset() { deckProvider()?.resolveDecision(SHIPBREAKING_DECISION_ID); this._lastSignature = null; this._currentContext = null; },
    newGame() { this.reset(); },
    destroy() { this.reset(); for (const off of this._subscriptions || []) off(); this._subscriptions = []; this._bus = null; this._state = null; },
  };
}
// Runtime fields are assigned through `this`, so createSimulation's prototype forks stay isolated.
export const shipbreakingYardPresentation = createShipbreakingYardPresentation();
export default shipbreakingYardPresentation;
