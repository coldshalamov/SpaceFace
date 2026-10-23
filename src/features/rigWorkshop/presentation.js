// The workshop owns decisions, not a second UI. promptDeck remains the only
// keyboard/gamepad/DOM owner; every callback sends an intent to the fixed-step
// workshop writer. Nothing in this module changes a body, account, or save.
import { getPromptDeck } from '../../ui/promptDeck.js';

const PREFIX = 'rig-workshop:';
const mounts = new WeakMap();
const MAX_CHOICES = 9;
const MAX_RECEIPTS = 64;

export const RIG_PART_CUES = Object.freeze({
  frame: 'Start here. A short frame keeps the load close to the pull.',
  hitch: 'Make a hitch. The connection carries the force between bodies.',
  cradle: 'Carry awkward cargo. Keep the mouth clear when turning.',
  collector: 'Catch loose salvage. Approach slowly enough to keep the catch.',
  mover: 'Push where you place it. An offset motor turns the whole rig.',
  bumper: 'Put the sacrificial face toward the rocks, not toward your cargo.',
});

const FEEDBACK_VOICES = Object.freeze({
  undo: 'ui_back', cancel: 'ui_back', repair: 'sfx_salvage_plate',
  recover: 'confirm', warning: 'warning', reject: 'deny',
  delivery: 'confirm', partial: 'confirm', signature: 'sfx_discovery_plate_note',
  // The existing attachment/audio owners already speak for welds and breaks.
  edit: null,
});

/** Return ordinary deck data; useful to read-model consumers and headless tests. */
export function rigWorkshopDecision(payload = {}) {
  const options = payload.options || payload.choices;
  if (!payload.id || !Array.isArray(options)) return null;
  const choices = [];
  const seen = new Set();
  for (const option of options) {
    const id = String(option?.id || '');
    if (!id || seen.has(id) || choices.length >= MAX_CHOICES) continue;
    seen.add(id);
    choices.push({
      id, label: String(option.label ?? id),
      disabled: option.disabled === true || option.available === false,
      danger: option.danger === true, cancel: option.cancel === true,
      reason: option.reason == null ? undefined : String(option.reason),
    });
  }
  if (!choices.length) return null; // Facts belong in the receipt lane.
  return {
    id: PREFIX + payload.id,
    kind: ['info', 'warn', 'danger'].includes(payload.kind) ? payload.kind : 'info',
    sender: String(payload.sender || 'RIG WORKSHOP'),
    headline: String(payload.title || 'Make it your machine'),
    detail: String(payload.detail || ''),
    statusFlag: String(payload.status || ''),
    deadlineAt: Number.isFinite(payload.deadlineAt) ? payload.deadlineAt : null,
    choices,
  };
}

/**
 * Install once beside the existing encounter prompt adapter in uiRoot. Calling
 * this twice on one bus disposes the previous mount, so re-entering the workshop
 * cannot multiply prompts, audio or intents. update() also handles UI mounting
 * after the first simulation offer (Continue / sector streaming).
 */
export function createRigWorkshopPresentation(ctx = {}) {
  const { state = {}, bus } = ctx;
  const deckFor = typeof ctx.getDeck === 'function' ? ctx.getDeck : getPromptDeck;
  if (bus && (typeof bus === 'object' || typeof bus === 'function')) mounts.get(bus)?.destroy();
  let currentState = state;
  let disposed = false;
  let pending = null;
  let visibleId = null;
  let visibleDeck = null;
  let presentedVersion = null;
  let answeredVersion = null;
  let latestRevision = null;
  const unsubs = [];
  const receiptIds = new Map();
  const lastVoice = new Map();

  function close(payload) {
    if (payload?.id && pending?.id !== payload.id) return false;
    pending = null;
    presentedVersion = null;
    if (visibleId) visibleDeck?.resolveDecision(visibleId);
    visibleId = null;
    visibleDeck = null;
    return true;
  }

  function show(payload) {
    if (disposed || !rigWorkshopDecision(payload)) return false;
    // Delayed presentation tails must not put an earlier decision back over the
    // confirmation page. Revision is a monotonically increasing producer token.
    if (Number.isFinite(payload.revision) && Number.isFinite(latestRevision)
      && payload.revision < latestRevision) return false;
    const version = `${String(payload.id)}:${String(payload.revision ?? '')}`;
    if (version === answeredVersion) return false;
    if (Number.isFinite(payload.revision)) latestRevision = payload.revision;
    pending = { ...payload, options: (payload.options || payload.choices).map((x) => ({ ...x })) };
    presentedVersion = null;
    return update();
  }

  function update(liveState) {
    // A worker facade may be replaced between frames. Only the presentation
    // clock is read here; a closed page is never reopened by an update call.
    if (liveState && typeof liveState === 'object') currentState = liveState;
    if (disposed || !pending) return false;
    const deck = deckFor();
    if (!deck) return false;
    const spec = rigWorkshopDecision(pending);
    if (!spec) return false;
    const version = `${String(pending.id)}:${String(pending.revision ?? '')}`;
    if (presentedVersion === version && visibleDeck === deck
      && (typeof deck.hasDecision !== 'function' || deck.hasDecision(spec.id))) return true;
    if (visibleId && (visibleId !== spec.id || visibleDeck !== deck)) visibleDeck?.resolveDecision(visibleId);
    const offered = pending;
    let answered = false;
    spec.onChoose = (choiceId, source = 'deck') => {
      if (disposed || answered || pending !== offered) return;
      const choice = spec.choices.find((row) => row.id === choiceId);
      if (!choice || choice.disabled) return;
      answered = true;
      answeredVersion = version;
      // Clear before synchronous emit: the fixed-step writer may immediately
      // offer another page. Closing afterward would erase that next decision.
      close();
      bus?.emit?.('rigWorkshop:choose', {
        promptId: offered.id, choiceId, revision: offered.revision, source,
      });
    };
    const admitted = deck.offerDecision(spec);
    if (admitted !== false) {
      visibleId = spec.id;
      visibleDeck = deck;
      presentedVersion = version;
    }
    return admitted !== false;
  }

  function feedback(payload = {}) {
    if (disposed || !payload.text) return false;
    const now = Number(currentState.simTime) || 0;
    const key = payload.id == null ? null : String(payload.id);
    if (key && receiptIds.has(key)) return false;
    if (key) {
      receiptIds.set(key, now);
      if (receiptIds.size > MAX_RECEIPTS) receiptIds.delete(receiptIds.keys().next().value);
    }
    const kind = String(payload.kind || 'info');
    bus?.emit?.('toast', {
      text: String(payload.text),
      kind: kind === 'reject' ? 'error' : (kind === 'warning' || kind === 'partial') ? 'warn' : 'info',
      ttl: kind === 'signature' ? 6 : 4,
    });
    const voice = FEEDBACK_VOICES[kind];
    const cooldown = kind === 'warning' || kind === 'reject' ? 4 : 0.25;
    const last = lastVoice.get(kind);
    if (voice && !payload.silent && (!Number.isFinite(last) || now < last || now - last >= cooldown)) {
      lastVoice.set(kind, now);
      bus?.emit?.('audio:cue', {
        id: voice, gain: kind === 'signature' ? 0.45 : 0.28,
        position: finitePosition(payload.position),
        importance: kind === 'warning' ? 0.45 : 0.2,
      });
    }
    return true;
  }

  function reset() {
    close();
    answeredVersion = null;
    latestRevision = null;
    receiptIds.clear();
    lastVoice.clear();
  }

  function listen(name, fn) {
    if (!bus?.on) return;
    const unsub = bus.on(name, fn);
    unsubs.push(typeof unsub === 'function' ? unsub : () => bus.off?.(name, fn));
  }
  listen('rigWorkshop:prompt', show);
  listen('rigWorkshop:promptClosed', close);
  listen('rigWorkshop:feedback', feedback);
  for (const event of ['game:new', 'game:newGame', 'game:load', 'save:restoring',
    'save:loaded', 'sector:exit', 'player:docked']) listen(event, reset);

  const api = {
    show, close, update, tick: update, feedback,
    destroy() {
      if (disposed) return;
      reset();
      disposed = true;
      for (const unsub of unsubs) unsub();
      unsubs.length = 0;
      if (bus && mounts.get(bus) === api) mounts.delete(bus);
    },
  };
  if (bus && (typeof bus === 'object' || typeof bus === 'function')) mounts.set(bus, api);
  // The sim may have made the arrival offer before uiRoot finished mounting.
  // Its saved current payload closes that one-way bootstrap event gap.
  if (state.rigWorkshop?.prompt) show(state.rigWorkshop.prompt);
  return api;
}

export function rigStressLabel(stress, broken = false) {
  if (broken) return 'Connection separated — retrieve the original part and repair';
  const value = Number.isFinite(stress) ? stress : 0;
  if (value >= 0.9) return 'Connection at its limit — ease thrust and straighten the load';
  if (value >= 0.65) return 'Connection straining — slow the turn or shorten the rig';
  return 'Connection holding';
}

/** Small, serializable projection for a shared HUD/read-model seam. Native
 * bodies and edge telemetry remain authoritative; there are no build stats. */
export function buildRigWorkshopReadModel(state = {}) {
  const workshop = state.rigWorkshop;
  if (!workshop) return null;
  const entities = state.entities;
  const get = (id) => entities?.get ? entities.get(id) : entities?.[id];
  const rigs = (workshop.rigs || []).slice(0, 2).map((rig) => {
    const parts = (rig.partIds || []).slice(0, 12).map((id) => {
      const body = get(id);
      const hp = Number(body?.hull);
      const max = Number(body?.hullMax);
      const type = body?.data?.rigWorkshop?.partType || 'part';
      return {
        id, type, cue: RIG_PART_CUES[type] || '',
        alive: !!body && body.alive !== false,
        damage: Number.isFinite(hp) && max > 0 ? 1 - Math.max(0, Math.min(1, hp / max)) : 0,
        position: finitePosition(body?.pos),
      };
    });
    const connections = (rig.connections || []).slice(0, 16).map((edge) => ({
      id: edge.id, parentId: edge.parentId, childId: edge.childId,
      state: edge.state, stress: Math.max(0, Number(edge.stress) || 0),
      label: edge.state === 'pending' ? 'Connection seating — hold still'
        : rigStressLabel(edge.stress, edge.state === 'broken'),
    }));
    return {
      id: rig.id, name: String(rig.name || 'Workshop rig'), template: rig.template,
      ownerId: rig.ownerId, active: rig.id === workshop.activeRigId,
      modified: !!rig.modified, power: !!rig.power,
      parts, connections, cargoIds: [...(rig.cargoIds || [])],
      status: rigStressLabel(Math.max(0, ...connections.map((edge) => edge.stress)),
        connections.some((edge) => edge.state === 'broken')),
    };
  });
  const preview = workshop.preview;
  const jobs = Array.isArray(workshop.jobs) ? workshop.jobs : Object.values(workshop.jobs || {});
  const job = jobs.find((row) => row?.id === workshop.activeJobId) || null;
  return {
    activeRigId: workshop.activeRigId || null,
    bench: finitePosition(workshop.bench?.pos), rigs,
    preview: preview ? {
      valid: preview.valid === true, reason: String(preview.reason || ''),
      partType: preview.partType, position: finitePosition(preview.pos),
      warnings: Array.isArray(preview.warnings) ? preview.warnings.map(String) : [],
      cost: preview.cost || 0,
    } : null,
    job: job ? {
      id: job.id, title: String(job.title || 'Workshop job'), stage: job.stage,
      pickup: finitePosition(job.pickup), destination: finitePosition(job.destination),
      cargoIds: [...(job.cargoIds || [])], receipt: job.receipt || null,
    } : null,
    undoAvailable: !!workshop.undo,
  };
}

function finitePosition(value) {
  return value && Number.isFinite(value.x) && Number.isFinite(value.z)
    ? { x: value.x, z: value.z } : null;
}
