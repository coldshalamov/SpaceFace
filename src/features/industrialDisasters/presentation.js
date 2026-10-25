import { SITE, SCENARIOS, SCENARIO_IDS } from './scenarios.js';
import { decodeIndustrialDisasterStatus, sendIndustrialDisasterRequest } from './workerAdapter.js';

const PROMPT_PREFIX = 'industrial-disasters:';
const TITLES = Object.freeze({ drift: 'Runaway consignment', corridor: 'The closed lane', cascade: 'Live feed' });
const finite = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;

/** Presentation-only summary: counts are explicit; no grade disguises what happened. */
export function industrialOutcomeLine(model = {}) {
  const parts = [];
  for (const [key, noun] of [['people', 'crew'], ['equipment', 'machines'], ['cargo', 'consignments']]) {
    const row = model[key];
    if (!row || !finite(row.total)) continue;
    const rescued = finite(row.saved), lost = finite(row.lost), waiting = Math.max(0, finite(row.total) - rescued - lost);
    parts.push(`${noun}: ${rescued} safe, ${lost} lost${waiting ? `, ${waiting} recoverable` : ''}`);
  }
  return parts.join(' · ') || model.summary || model.statusLine || 'Inspect the changed workplace.';
}

/** The existing encounterChoicePrompt -> promptDeck remains the sole decision surface. */
export function industrialDecision(model = {}) {
  const scenarioId = SCENARIO_IDS.includes(model.scenarioId) ? model.scenarioId : 'drift';
  const label = TITLES[scenarioId];
  const phase = model.phase;
  if (model.hidden || model.discovered === false || model.near === false) return null;
  if (phase === 'offered' || phase === 'inspecting' || phase === 'inspect' || phase === 'available') {
    return {
      key: `offer:${scenarioId}:${model.inspected === true}`,
      title: model.inspected ? `${label} — ${SCENARIOS[scenarioId].firstHint}` : `Hinge Works — ${label}`,
      options: [
        { id: 'inspect', label: 'Inspect the scene — no rescue clock' },
        { id: `accept:${scenarioId}`, label: 'Take the response — release emergency hold' },
        { id: 'decline', label: 'Fly on — leave emergency hold in place' },
        { id: 'cancel', label: 'Close channel — reopen on your next approach' },
      ],
    };
  }
  if (phase === 'suspended') return {
    key: `suspended:${scenarioId}`, title: `Hinge Works — response suspended`,
    options: [
      { id: 'resume', label: 'Resume from the saved physical state' },
      { id: 'inspect', label: 'Inspect what remains' },
      { id: 'cancel', label: 'Close channel — reopen on your next approach' },
    ],
  };
  if (phase === 'active') return null; // gameplay is bodies and tools, not a wall of buttons
  if (phase === 'recovery') return {
    key: `recovery:${scenarioId}:${model.drill === true}`,
    title: `Hinge Works — ${industrialOutcomeLine(model)}`,
    options: [
      { id: 'inspect', label: 'Continue recovery — tow survivors and parts to refuge' },
      { id: model.drill ? 'finishDrill' : 'finalize', label: model.drill ? 'End drill — restore the real aftermath' : 'Close response — record what was saved and lost' },
      { id: 'cancel', label: 'Close channel — keep this state; reopen on return' },
    ],
  };
  if (phase === 'settled' || phase === 'aftermath') {
    if (model.drill) return { key: `drill-end:${scenarioId}`, title: `Response drill — ${industrialOutcomeLine(model)}`,
      options: [{ id: 'finishDrill', label: 'End drill — restore the real aftermath' }, { id: 'cancel', label: 'Close channel — reopen on return' }] };
    const completed = SCENARIO_IDS.filter((id) => model.history?.some((row) => row.scenarioId === id));
    if (!completed.length) completed.push(scenarioId);
    return {
      key: `aftermath:${scenarioId}`, title: `Hinge Works — ${industrialOutcomeLine(model)}`,
      options: [
        { id: 'next', label: 'Next incident — inspect before committing', available: model.hasNext !== false },
        ...completed.map((id) => ({ id: `drill:${id}`, label: `Practice ${TITLES[id].toLowerCase()} — no pay; real aftermath retained` })),
        { id: 'cancel', label: 'Close channel — reopen on your next approach' },
      ],
    };
  }
  return null;
}

export function commandForIndustrialChoice(choiceId) {
  if (typeof choiceId !== 'string') return null;
  const [action, scenarioId, extra] = choiceId.split(':');
  if (extra !== undefined) return null;
  if (action === 'accept' || action === 'drill') {
    return SCENARIO_IDS.includes(scenarioId) ? { action, scenarioId } : null;
  }
  return ['inspect', 'decline', 'cancel', 'resume', 'next', 'finalize', 'finishDrill', 'markSite'].includes(action)
    && scenarioId === undefined ? { action } : null;
}

/** Mount once next to createEncounterChoicePrompt. No DOM, keyboard, CSS, AudioContext or sim
 * writes. All decisions and their gamepad/digit routing belong to the existing prompt deck. */
export function installIndustrialDisasterPresentation({ state, bus, getReadModel = null } = {}) {
  if (!bus?.on || !bus?.emit) return { update() {}, dispose() {}, get current() { return null; } };
  let model = null, offered = null, signal = null, sequence = 0, disposed = false;
  let lastRadioKey = '', lastSoundAt = -Infinity, lastPhase = '', lastSeverity = 0;
  let lastEventAt = -Infinity;
  let suppressNextInspect = false;
  const seenEvents = new Set();
  const rejectionKeys = new Set();
  let promptClosed = false;
  const subscriptions = [];
  const on = (name, fn) => { bus.on(name, fn); subscriptions.push([name, fn]); };
  const clearPrompt = () => {
    if (offered) bus.emit('encounter:resolved', { encounterId: offered.id, outcome: 'channel_closed' });
    offered = null;
  };
  const radio = (text, key) => {
    if (!text || key === lastRadioKey) return;
    lastRadioKey = key;
    bus.emit('comms:log', { from: 'HINGE WORKS / FOREMAN', text, kind: 'encounter', sectorId: SITE.sectorId });
  };
  const cue = (id) => {
    if (state?.settings?.accessibility?.audioCues === false) return;
    const now = finite(state?.simTime);
    if (now - lastSoundAt < 6) return;
    lastSoundAt = now;
    bus.emit('audio:cue', { id, gain: 0.34, importance: 'normal', source: 'industrialDisasters' });
  };
  function showSignal(payload) {
    if (disposed || payload?.siteId !== SITE.id || payload.sectorId !== SITE.sectorId) return;
    if (model?.near && model?.discovered) return;
    if (signal && offered?.kind === 'signal') return;
    signal = { siteId: SITE.id, sectorId: SITE.sectorId };
    clearPrompt(); promptClosed = false;
    offered = { id: `${PROMPT_PREFIX}${SITE.id}:${++sequence}`, key: 'signal', kind: 'signal',
      title: 'Hinge Works distress — emergency hold is still engaged', options: [
        { id: 'markSite', label: 'Mark Hinge Works — inspect before committing' },
        { id: 'cancel', label: 'Keep current route' },
      ] };
    radio('A loading shift has reported an accident at Hinge Works. Mark the site to investigate; the emergency hold gives you time to look.', 'site-signal');
    bus.emit('encounter:choiceOffered', { encounterId: offered.id, kind: 'industrialDisasters',
      title: offered.title, options: offered.options, deadlineAt: null, timeoutChoice: null });
  }
  function update(next, options = {}) {
    next = decodeIndustrialDisasterStatus(next);
    if (disposed || !next) return;
    if (model && finite(next.presentationEpoch) < finite(model.presentationEpoch)) return;
    const oldCycle = model?.cycle ?? model?.attempt;
    const newCycle = next.cycle ?? next.attempt;
    const phaseChanged = next.phase !== model?.phase || oldCycle !== newCycle;
    if (options.force || phaseChanged) promptClosed = false;
    model = next;
    if (next.hidden || next.near === false || next.discovered === false) {
      // The far-field invitation is a separate untimed radio choice. Ordinary status polling
      // cannot erase its explicit route choice before the pilot responds.
      if (!signal) clearPrompt();
      return;
    }
    signal = null;
    const severity = Math.max(0, finite(next.severity));
    const phase = next.phase || '';
    if (phase !== lastPhase || severity > lastSeverity) {
      if (phase === 'active' && lastPhase !== 'active') {
        radio(next.hint || SCENARIOS[next.scenarioId]?.firstHint, `begin:${next.scenarioId}:${newCycle}`);
        cue('ui_accept');
      } else if (phase === 'recovery') {
        radio(`${next.hint || SCENARIOS[next.scenarioId]?.recoveryHint || 'The immediate danger has passed.'} ${industrialOutcomeLine(next)}`,
          `recovery:${next.scenarioId}:${newCycle}`);
        cue('warning');
      } else if (phase === 'settled') {
        radio(`${industrialOutcomeLine(next)}${next.drill ? ' Drill complete; this does not alter the real accident record.' : ' This is what the next shift will find.'}`,
          `settled:${next.scenarioId}:${newCycle}`);
        cue('confirm');
      } else if (phase === 'offered') {
        radio(SCENARIOS[next.scenarioId || 'drift']?.briefing, `offer:${next.scenarioId}:${newCycle}`);
      } else if (severity > lastSeverity && severity >= 0.5) {
        radio(next.hint || next.statusLine, `escalation:${next.scenarioId}:${newCycle}:${Math.floor(severity * 2)}`);
        cue('warning');
      }
      lastPhase = phase;
      lastSeverity = severity;
    }
    const decision = industrialDecision(next);
    if (!decision) { clearPrompt(); return; }
    if (promptClosed && !options.force) return;
    if (offered?.key === decision.key) return;
    clearPrompt();
    offered = { ...decision, id: `${PROMPT_PREFIX}${SITE.id}:${++sequence}` };
    bus.emit('encounter:choiceOffered', {
      encounterId: offered.id, kind: 'industrialDisasters', title: offered.title,
      options: offered.options, deadlineAt: null, timeoutChoice: null,
    });
  }
  function choose(payload) {
    if (!offered || payload?.encounterId !== offered.id) return;
    const choice = offered.options.find((row) => row.id === payload.choiceId && row.available !== false);
    if (!choice) return;
    const command = commandForIndustrialChoice(choice.id);
    if (!command) return;
    signal = null;
    // Choosing physical recovery dismisses its card. The owner's matching inspect receipt is
    // still informational; it must not immediately put the same decision back over the tools.
    suppressNextInspect = command.action === 'inspect' && model?.phase === 'recovery';
    clearPrompt();
    promptClosed = true;
    // Clear before emit: synchronous owner status re-entry cannot double-consume a decision.
    sendIndustrialDisasterRequest(bus, 'industrialDisasters:command', { ...command, siteId: SITE.id, source: payload.source || 'promptDeck' });
    if (command.action === 'inspect') {
      radio(model?.hint || SCENARIOS[model?.scenarioId || 'drift']?.firstHint,
        `inspect:${model?.scenarioId}:${sequence}`);
      if (model?.phase === 'offered') update({ ...model, inspected: true }, { force: true });
    }
  }
  const reset = () => { clearPrompt(); model = null; signal = null; suppressNextInspect = false; promptClosed = false; lastPhase = ''; lastSeverity = 0; lastRadioKey = ''; lastSoundAt = -Infinity; lastEventAt = -Infinity; seenEvents.clear(); rejectionKeys.clear(); };
  on('industrialDisasters:signal', showSignal);
  on('industrialDisasters:status', (payload) => update(payload));
  on('industrialDisasters:commandRejected', (payload) => {
    if (payload?.siteId !== SITE.id || (model && payload.cycle !== model.cycle)) return;
    suppressNextInspect = false;
    const key = `${payload.cycle}:${payload.reason}`;
    if (!rejectionKeys.has(key)) {
      rejectionKeys.add(key);
      if (rejectionKeys.size > 32) rejectionKeys.delete(rejectionKeys.values().next().value);
      const text = {
        release_tethers: 'Release your towline before changing incidents or ending a drill. The current worksite is still here.',
        approach_site: 'Approach the Hinge Works marker to inspect the physical scene.',
        restoring: 'The saved worksite is returning. Emergency hold stays engaged until it is ready.',
        make_safe_first: 'Make the immediate hazard safe before closing the response.',
        close_response_first: 'Close the current response before changing incidents.',
        complete_incident_first: 'Record the live incident before practicing it as a drill.',
        all_incidents_recorded: 'All three live incidents are recorded. Choose a practice drill to try a different response.',
        stale_choice: 'The worksite has changed. Review the current response choices.',
        already_involved: 'The response is already underway. Use the ship tools to change the physical situation.',
      }[payload.reason] || 'The worksite has changed. Review the current response choices.';
      radio(text, `rejected:${key}`);
    }
    // Recovery/aftermath decisions remain usable after a rejected transition. Active flight
    // still has no decision card, so stale requests cannot put controls over a live rescue.
    if (model) update(model, { force: true });
  });
  on('industrialDisasters:event', (payload) => {
    if (!payload?.text || model?.near === false) return;
    const key = `${payload.cycle}:${payload.id}`;
    if (seenEvents.has(key)) return;
    seenEvents.add(key);
    if (seenEvents.size > 64) seenEvents.delete(seenEvents.values().next().value);
    const now = finite(state?.simTime);
    // The read model retains the full bounded event history. The channel speaks at most one
    // ordinary physical transition per three seconds, so mass rescue never becomes a text flood.
    if (now - lastEventAt < 3 && payload.kind !== 'loss') return;
    lastEventAt = now;
    radio(payload.text, `event:${key}`);
    if (payload.kind === 'loss' || payload.kind === 'warn') cue('warning');
  });
  on('industrialDisasters:consequence', (payload) => {
    if (!payload?.text) return;
    const receipt = Number.isFinite(payload.amount)
      ? `DMC recovery settlement: ${payload.amount} cr. ${payload.summary || payload.text}` : payload.text;
    radio(receipt, `consequence:${payload.scenarioId}:${payload.cycle}`);
  });
  on('encounter:choose', choose);
  on('industrialDisasters:inspect', () => {
    if (suppressNextInspect) { suppressNextInspect = false; return; }
    const current = model || (getReadModel && getReadModel(state));
    if (current) update(current, { force: true });
  });
  on('sector:exit', reset);
  on('save:loaded', reset);
  on('game:new', reset);
  on('game:newGame', reset);
  on('game:load', reset);
  if (getReadModel) update(getReadModel(state));
  return {
    update,
    get current() { return model; },
    dispose() {
      if (disposed) return;
      clearPrompt(); disposed = true;
      for (const [name, fn] of subscriptions) bus.off?.(name, fn);
      subscriptions.length = 0;
    },
  };
}
