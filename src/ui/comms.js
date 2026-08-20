// src/ui/comms.js — the narrative overlay layer.
//
// Four event-driven surfaces, three of them driven by the story system (src/systems/story.js):
//
//   1. COMMS LOG  — listens to `comms:popup`. A left-edge feed of channel noise. Most lines are
//                   ambient (not for the player). The ones that ARE for the player don't name them.
//                   Mirrors the alerts.js pattern (queue, raise, fade). Closable entries; the comms key
//                   opens a scrollable backlog so the player can re-read what they missed.
//   2. GRAFFITI   — listens to `graffiti:show{ line, where }`. 'bulkhead' = a line that appears on
//                   the player's own HUD (their ship's interior). airlock/shipyard/etc. = lines the
//                   station hub surfaces (rendered there via a DOM hook the hub queries).
//   3. ENDGAME    — A/B live on the Ashfall board; C/D/E use short contextual confirmations.
//                   five choices (A–E). Emits `ui:endgameChoose{ choice }`.
//   4. EPILOGUE   — one restrained outcome card after a final disposition or sandbox continuation.
//
// Pure DOM + event listeners. Reads ctx.state only for the backlog; never mutates sim state (§0.6).
// CSS is injected once (injectCommsCss) so this module is self-contained.

import { BINDINGS } from './bindings.js';
import { createPirateParleyPrompt } from './pirateParleyPrompt.js';
import { createSectorLawPresenter } from './sectorLawPresenter.js';
import { createSignalInvestigationPrompt } from './signalInvestigationPrompt.js';
import { createRecoveryEncounterPrompt } from './recoveryEncounterPrompt.js';
import { createContactHailPrompt } from './contactHailPrompt.js';
import { createCommsRadial } from './commsRadial.js';
import { createEndingEpilogue } from './endingEpilogue.js';
import { createCommsTrace } from './effects/commsTrace.js';

const COMMS_STYLE_ID = 'sf-comms-style';

// category → accent color + label prefix. Most are NOT addressed to the player.
const CATEGORY_STYLE = {
  ambient:  { color: 'var(--ink-mute)',  tag: 'CHN',  glow: 'none' },
  trap:     { color: 'var(--warn)',      tag: 'ALERT', glow: '0 0 8px rgba(255,179,71,.4)' },
  personal: { color: 'var(--accent-3)',  tag: 'MSG',  glow: '0 0 8px rgba(192,139,255,.4)' },
  late:     { color: 'var(--danger)',    tag: 'LOG',  glow: '0 0 8px rgba(255,84,112,.4)' },
  story:    { color: 'var(--accent)',    tag: 'LOG',  glow: '0 0 10px rgba(57,208,255,.5)' },
};

const MAX_LIVE = 4;          // max simultaneous live comms entries on the feed
const MAX_BACKLOG = 80;      // retained history for the comms backlog view
const SCENARIO_DIALOGUE_TTL = 18; // authored mission comms need to survive cold-open/load stalls.

export function branchLifecycleCommsPayload(payload) {
  const lifecycle = payload && payload.lifecycle && typeof payload.lifecycle === 'object' ? payload.lifecycle : {};
  const complete = cleanLifecycleText(lifecycle.complete || (payload && payload.summary));
  const aftermath = cleanLifecycleText(lifecycle.aftermath);
  if (!complete && !aftermath) return null;
  return {
    sender: 'CONTRACT 47-A',
    category: 'story',
    text: complete || aftermath,
    note: aftermath && aftermath !== complete ? aftermath : null,
    persist: true,
  };
}

export function scenarioDialogueCommsPayload(payload) {
  const text = cleanLifecycleText(payload && payload.text);
  if (!text) return null;
  const sender = cleanLifecycleText(payload && (payload.speaker || payload.speakerActorId)) || 'UNKNOWN';
  return {
    sender,
    category: 'story',
    text,
    ttl: SCENARIO_DIALOGUE_TTL,
    persist: false,
  };
}

export function createComms(ctx) {
  const { bus, state } = ctx;
  let choiceModalOpen = false;
  let destroyed = false;
  const unsubscribers = [];
  const ownedModals = new Set();
  function listen(event, handler) {
    const off = bus.on(event, handler);
    if (typeof off === 'function') unsubscribers.push(off);
    else if (bus && typeof bus.off === 'function') unsubscribers.push(() => bus.off(event, handler));
    return handler;
  }
  injectCommsCss();
  // Actionable pirate hails live in their own compact, non-modal strip. Keeping the renderer in a
  // dedicated module prevents the general comms feed from becoming an interaction/state owner.
  const pirateParleyPrompt = createPirateParleyPrompt(ctx);
  const sectorLawPresenter = createSectorLawPresenter(ctx);
  const signalInvestigationPrompt = createSignalInvestigationPrompt(ctx);
  const recoveryEncounterPrompt = createRecoveryEncounterPrompt(ctx);
  const contactHailPrompt = createContactHailPrompt(ctx);
  const commsRadial = createCommsRadial(ctx);
  const endingEpilogue = createEndingEpilogue({
    ...ctx,
    isBlocked: () => choiceModalOpen,
  });

  // ── 1. Comms feed (left edge) ────────────────────────────────────────────────────────────
  const feed = document.createElement('div');
  feed.id = 'sf-comms';
  feed.setAttribute('aria-live', 'polite');
  feed.setAttribute('aria-label', 'Comms channel');
  const flightContext = document.querySelector('.sf-leftcontext');
  if (flightContext) flightContext.prepend(feed);
  else document.getElementById('ui-root').appendChild(feed);
  const live = [];        // { el, rec, born, ttl, persist }
  const backlog = [];     // full history for the backlog view
  let nextSweepAt = Infinity;
  const traceHost = document.createElement('div');
  traceHost.id = 'sf-comm-trace-host';
  traceHost.className = 'sf-commtape__tracehost';
  traceHost.setAttribute('aria-hidden', 'true');
  (document.getElementById('ui-root') || feed).appendChild(traceHost);
  const commsTrace = createCommsTrace(traceHost);
  let traceFactionId = resolveCommsFactionId(null, state, 'faction_scn');
  let traceHoldUntilMs = 0;
  let traceAmpCarry = 0;

  // ── One-voice gate (GDD §8.1, minimal pass) ──────────────────────────────────────────────
  // While tutorial or an actionable route owns attention, non-critical chatter queues instead of
  // stacking a text wall. Once clear, held lines drip out one every few seconds. Alert-ish
  // categories bypass the gate; stale ambient lines (>60 s) drop silently — old small talk is
  // noise, not information.
  const held = [];
  let nextDripAt = 0;
  const GATE_BYPASS = /alert|danger|critical|warning/i;
  function attentionGateActive() {
    const ob = state && state.onboarding;
    if (ob && ob.active && !ob.finished) return true;
    if (state && state.nav && state.nav.waypoint) return true;
    const trackedId = state && state.ui && state.ui.trackedMissionId;
    return !!trackedId || !!document.querySelector('.sf-firstrun-splash');
  }
  function tickHeldComms() {
    if (!held.length || attentionGateActive()) return;
    const now = performance.now();
    if (now < nextDripAt) return;
    while (held.length) {
      const q = held.shift();
      if ((performance.now() - q._heldAt) > 60000 && (q.category || 'ambient') === 'ambient') continue;
      nextDripAt = now + 3500;
      pushComms(q, true);
      break;
    }
  }

  function pushComms(p, delivery = null) {
    if (!p || !p.text) return;
    traceHoldUntilMs = Math.max(traceHoldUntilMs, nowMs() + 320);
    traceFactionId = resolveCommsFactionId(p, state, traceFactionId);
    const fromQueue = delivery === true || !!(delivery && delivery.fromQueue);
    const bypassAttentionGate = !!(delivery && delivery.bypassAttentionGate);
    // One-voice (spec2/06): a player-addressed line already surfaced by the arbiter as the top-center
    // floor pill is logged to the BACKLOG only — re-stacking it on the live left-edge feed would show
    // the same voice twice. Ambient chatter (unmarked) still fills the feed as the channel texture.
    if (p._viaVoice) {
      backlog.unshift({ sender: p.sender || 'UNKNOWN', text: p.text, category: p.category || 'ambient', note: p.note || null, at: Date.now() });
      while (backlog.length > MAX_BACKLOG) backlog.pop();
      if (!backlogOpen) backlogBtn.classList.add('sf-comm-backlog-btn--pulse');
      return;
    }
    if (!fromQueue && !bypassAttentionGate && attentionGateActive() && !GATE_BYPASS.test(p.category || '')) {
      p._heldAt = performance.now();
      held.push(p);
      return;
    }
    const cat = CATEGORY_STYLE[p.category] || CATEGORY_STYLE.ambient;
    const entry = document.createElement('div');
    entry.className = `sf-comm sf-comm--${p.category || 'ambient'}`;
    entry.style.setProperty('--comm-color', cat.color);
    entry.style.setProperty('--comm-glow', cat.glow);

    const head = document.createElement('div');
    head.className = 'sf-comm__head';
    const tag = document.createElement('span');
    tag.className = 'sf-comm__tag mono';
    tag.textContent = cat.tag;
    const sender = document.createElement('span');
    sender.className = 'sf-comm__sender mono';
    sender.textContent = p.sender || 'UNKNOWN';
    head.append(tag, sender);

    const body = document.createElement('div');
    body.className = 'sf-comm__body';
    body.textContent = p.text;

    entry.append(head, body);
    // dismiss on click (the player learns to clear the migraine)
    entry.addEventListener('click', () => dismissLive(rec));
    feed.prepend(entry);

    const rec = {
      el: entry,
      sender: p.sender || 'UNKNOWN', text: p.text, category: p.category || 'ambient',
      note: p.note || null, born: performance.now(),
      ttl: p.persist ? Infinity : normalizeTtlMs(p.ttl), persist: !!p.persist,
    };
    live.unshift(rec);
    recomputeNextSweep();
    backlog.unshift({ sender: rec.sender, text: rec.text, category: rec.category, note: rec.note, at: Date.now() });
    while (backlog.length > MAX_BACKLOG) backlog.pop();

    requestAnimationFrame(() => entry.classList.add('sf-comm--in'));
    while (live.length > MAX_LIVE) dismissLive(live[live.length - 1]);
    // pulse the backlog button when new content arrives while it's closed
    if (!backlogOpen) backlogBtn.classList.add('sf-comm-backlog-btn--pulse');
  }

  function dismissLive(rec) {
    if (!rec) return;
    const i = live.indexOf(rec);
    if (i >= 0) live.splice(i, 1);
    rec.el.classList.remove('sf-comm--in');
    rec.el.classList.add('sf-comm--out');
    setTimeout(() => { if (rec.el.parentNode) rec.el.parentNode.removeChild(rec.el); }, 220);
    recomputeNextSweep();
  }

  // Fade sweep called from tick(), but sleeps until a non-persistent line can fade or expire.
  function sweep() {
    if (!live.length) return;
    const now = performance.now();
    if (now < nextSweepAt) return;
    let next = Infinity;
    for (let i = live.length - 1; i >= 0; i--) {
      const rec = live[i];
      if (rec.persist) continue;
      const age = now - rec.born;
      if (age > rec.ttl) { dismissLive(rec); continue; }
      const left = rec.ttl - age;
      if (left < 400) {
        const nextOpacity = String(Math.max(0, left / 400));
        if (rec._sfOpacity !== nextOpacity) {
          rec._sfOpacity = nextOpacity;
          rec.el.style.opacity = nextOpacity;
        }
        next = Math.min(next, now);
      } else {
        next = Math.min(next, rec.born + Math.max(0, rec.ttl - 400));
      }
    }
    nextSweepAt = live.length ? next : Infinity;
  }

  function recomputeNextSweep() {
    nextSweepAt = Infinity;
    for (let i = 0; i < live.length; i++) {
      const rec = live[i];
      if (!rec.persist) nextSweepAt = Math.min(nextSweepAt, rec.born + Math.max(0, rec.ttl - 400));
    }
  }

  function updateCommsTrace() {
    const sample = sampleCommsTraceState({
      ctx,
      state,
      now: nowMs(),
      holdUntilMs: traceHoldUntilMs,
      ampCarry: traceAmpCarry,
      fallbackFactionId: traceFactionId,
    });
    traceAmpCarry = sample.ampCarry;
    if (sample.factionId) traceFactionId = sample.factionId;
    commsTrace.update({
      live: sample.live,
      amplitude: sample.amplitude,
      density: sample.density,
      factionId: traceFactionId,
      phaseStep: sample.phaseStep,
    });
  }

  listen('comms:popup', (payload) => {
    traceFactionId = resolveCommsFactionId(payload, state, traceFactionId);
    pushComms(payload);
  });
  listen('scenario:dialogueLine', (payload) => {
    const comms = scenarioDialogueCommsPayload(payload || {});
    if (comms) pushComms(comms, { bypassAttentionGate: true });
  });
  listen('scenario:branchResolved', (payload) => {
    const comms = branchLifecycleCommsPayload(payload || {});
    if (comms) pushComms(comms);
  });

  // ── 2. Backlog view (toggle with the comms binding) ──────────────────────────────────────
  const backlogBtn = document.createElement('button');
  backlogBtn.className = 'sf-comm-backlog-btn';
  backlogBtn.id = 'sf-comm-backlog-btn';
  backlogBtn.title = 'Comms log (' + BINDINGS.comms.label + ')';
  backlogBtn.setAttribute('aria-label', 'Open comms log');
  backlogBtn.textContent = 'COMMS';
  document.getElementById('ui-root').appendChild(backlogBtn);

  const backlogView = document.createElement('div');
  backlogView.className = 'sf-comm-backlog';
  backlogView.id = 'sf-comm-backlog';
  backlogView.innerHTML =
    '<div class="sf-comm-backlog__head"><span class="sf-comm-backlog__title">COMMS LOG</span>' +
    '<button class="sf-comm-backlog__close">ESC</button></div>' +
    '<div class="sf-comm-backlog__hint">Most of these are not for you. The ones that are don\u2019t name you.</div>' +
    '<div class="sf-comm-backlog__list"></div>';
  document.getElementById('ui-root').appendChild(backlogView);
  const backlogList = backlogView.querySelector('.sf-comm-backlog__list');

  let backlogOpen = false;
  if (state.ui) state.ui.commsBacklogOpen = false;
  function openBacklog() {
    backlogOpen = true;
    if (state.ui) state.ui.commsBacklogOpen = true;
    backlogBtn.classList.remove('sf-comm-backlog-btn--pulse');
    rebuildBacklog();
    backlogView.classList.add('open');
    backlogView.setAttribute('aria-hidden', 'false');
  }
  function closeBacklog() {
    backlogOpen = false;
    if (state.ui) state.ui.commsBacklogOpen = false;
    backlogView.classList.remove('open');
    backlogView.setAttribute('aria-hidden', 'true');
  }
  function toggleBacklog() { backlogOpen ? closeBacklog() : openBacklog(); }

  function rebuildBacklog() {
    backlogList.innerHTML = '';
    if (!backlog.length) {
      backlogList.innerHTML = '<div class="sf-comm-backlog__empty">Channel is quiet. For now.</div>';
      return;
    }
    const frag = document.createDocumentFragment();
    for (const e of backlog) {
      const cat = CATEGORY_STYLE[e.category] || CATEGORY_STYLE.ambient;
      const row = document.createElement('div');
      row.className = `sf-comm-backlog__row sf-comm-backlog__row--${e.category}`;
      row.style.setProperty('--comm-color', cat.color);
      row.innerHTML =
        `<span class="sf-comm-backlog__sender mono">${escapeHtml(e.sender)}</span>` +
        `<span class="sf-comm-backlog__text">${escapeHtml(e.text)}</span>`;
      if (e.note) {
        const note = document.createElement('div');
        note.className = 'sf-comm-backlog__note';
        note.textContent = e.note;
        row.appendChild(note);
      }
      frag.appendChild(row);
    }
    backlogList.appendChild(frag);
  }

  const backlogCloseBtn = backlogView.querySelector('.sf-comm-backlog__close');
  backlogBtn.addEventListener('click', toggleBacklog);
  backlogCloseBtn.addEventListener('click', closeBacklog);
  // Route L/ESC through the central UI input bus so overlays close before Pause can open.
  listen('ui:toggleComms', toggleBacklog);
  listen('ui:closeComms', closeBacklog);

  // ── 3. Bulkhead graffiti (player's own ship interior — shown on the HUD) ─────────────────
  // Appended to #ui-root (NOT #hud): createHud() does `root.innerHTML = ''` on #hud which would
  // wipe anything appended there before it runs. ui-root is stable. The bulkhead is a full-overlay
  // narrative element positioned over the ship interior, not a HUD gauge, so ui-root is the right parent.
  const bulkhead = document.createElement('div');
  bulkhead.className = 'sf-bulkhead';
  bulkhead.id = 'sf-bulkhead';
  bulkhead.setAttribute('aria-hidden', 'true');
  bulkhead.innerHTML = '<div class="sf-bulkhead__line"></div>';
  document.getElementById('ui-root').appendChild(bulkhead);
  const bulkheadLine = bulkhead.querySelector('.sf-bulkhead__line');
  let bulkheadHideT = 0;

  listen('graffiti:show', (p) => {
    if (!p || !p.line) return;
    if (p.where === 'bulkhead') {
      // bulkhead graffiti is persistent (it's on the player's ship); it stays until replaced.
      bulkheadLine.textContent = p.line;
      bulkhead.classList.add('sf-bulkhead--visible');
      bulkhead.setAttribute('aria-label', 'Bulkhead graffiti: ' + p.line);
      bulkheadHideT = 0; // never auto-hide; the player lives with it
    } else {
      // airlock/shipyard/clearing/chain_dest: surfaced at the dock hub. We stash the latest on
      // state so the station hub can read it (it mounts after dock). Also briefly flash it as a
      // toast-style graffiti readout so the player sees it even mid-flight (e.g. on a docked hub).
      stashAirlockGraffiti(p);
    }
  });

  function stashAirlockGraffiti(p) {
    if (!state.ui) state.ui = {};
    if (!state.ui.graffiti) state.ui.graffiti = [];
    // dedupe by line+where within the current stash
    const key = p.where + ':' + p.line;
    if (state.ui.graffiti.some((g) => (g.where + ':' + g.line) === key)) return;
    state.ui.graffiti.push({ line: p.line, where: p.where, beat: p.beat, author: p.author });
    // keep the stash short
    while (state.ui.graffiti.length > 8) state.ui.graffiti.shift();
  }

  // expose a reader for the station hub (it imports nothing from here; it reads state.ui.graffiti)

  // ── 4. Contextual ending confirmations. Contract endings A/B remain board rows. ──────────
  function presentPhysicalChoice(
    choice,
    promptText,
    hint,
    declineEffect = null,
    intentEvent = 'ui:endgameChoose',
    decision = null,
  ) {
    if (choiceModalOpen) return;
    const wrap = document.createElement('div');
    choiceModalOpen = true;
    ownedModals.add(wrap);
    wrap.className = 'sf-endgame sf-endgame--c';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.innerHTML =
      '<div class="sf-endgame__panel sf-endgame__panel--c">' +
      '<div class="sf-endgame__c-prompt">' + escapeHtml(promptText) + '</div>' +
      '<div class="sf-endgame__c-hint">' + escapeHtml(hint) + '</div>' +
      '<div class="sf-endgame__c-actions"><button class="sf-endgame__c-yes">YES</button><button class="sf-endgame__c-no">NO</button></div>' +
      '</div>';
    document.getElementById('ui-root').appendChild(wrap);
    requestAnimationFrame(() => wrap.classList.add('open'));
    const cleanup = () => {
      choiceModalOpen = false;
      ownedModals.delete(wrap);
      wrap.classList.remove('open');
      setTimeout(() => wrap.remove(), 220);
    };
    wrap.querySelector('.sf-endgame__c-yes').addEventListener('click', () => {
      if (decision && typeof decision.onYes === 'function') decision.onYes();
      else bus.emit(intentEvent, { choice, confirm: true });
      cleanup();
    });
    wrap.querySelector('.sf-endgame__c-no').addEventListener('click', () => {
      if (decision && typeof decision.onNo === 'function') decision.onNo();
      else {
        bus.emit('ui:endgameDecline', { choice });
        if (typeof declineEffect === 'function') declineEffect();
      }
      cleanup();
    });
  }
  listen('endgame:promptChoiceC', ({ promptText }) => presentPhysicalChoice(
    'C', promptText || 'JUMP WITHOUT DESTINATION?',
    'The wormhole files a return, not an escape.',
    () => bus.emit('world:abortJumpCharge', { reason: 'choice_c_declined' }),
    'ui:endgameUnfiledJumpConfirm',
  ));
  listen('endgame:promptChoiceD', ({ promptText, targetSectorId, via }) => presentPhysicalChoice(
    'D', promptText || 'DEPART ASHFALL REACH?', 'Leave, or stay and keep the record.',
    null,
    'ui:endgameChoose',
    {
      onYes: () => bus.emit('ui:endgameDepartAshfall', { targetSectorId, via }),
      onNo: () => bus.emit('ui:endgameStayAshfall', { targetSectorId, via }),
    },
  ));
  listen('endgame:promptSandbox', ({ promptText, confirmHint }) => presentPhysicalChoice(
    'SANDBOX',
    promptText || 'CONTINUE WITHOUT FINAL DISPOSITION?',
    confirmHint || 'Not an ending. The world remains open and no disposition rewards apply.',
    null,
    'ui:endgameSandbox',
  ));
  // Irreversible confirmation for staged A/B (board) and any pending disposition.
  listen('endgame:confirmRequired', ({ choice, confirmPrompt, confirmHint, isSandbox }) => {
    if (!choice) return;
    presentPhysicalChoice(
      choice,
      confirmPrompt || (isSandbox ? 'CONTINUE WITHOUT FINAL DISPOSITION?' : 'CONFIRM FINAL DISPOSITION?'),
      confirmHint || 'Irreversible.',
    );
  });
  listen('endgame:ineligible', ({ unmet }) => {
    // Eligibility already voiced by story; stash for station/codex surfaces.
    if (!state.ui) state.ui = {};
    state.ui.endgameUnmet = Array.isArray(unmet) ? unmet.slice() : [];
  });
  listen('endgame:eligibility', ({ rows }) => {
    if (!state.ui) state.ui = {};
    state.ui.endgameEligibility = Array.isArray(rows) ? rows.slice() : [];
  });
  listen('scenario:safeOpeningDemand', () => {
    if (choiceModalOpen) return;
    const wrap = document.createElement('div');
    choiceModalOpen = true;
    ownedModals.add(wrap);
    wrap.className = 'sf-endgame sf-endgame--c';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.innerHTML =
      '<div class="sf-endgame__panel sf-endgame__panel--c">' +
      '<div class="sf-endgame__c-prompt">SCAVENGER CLAIM: SEALED SPINDLE</div>' +
      '<div class="sf-endgame__c-hint">They hold fire in a wedge. Cut loose safely, or refuse and use the twelve-second escape window.</div>' +
      '<div class="sf-endgame__c-actions"><button class="sf-endgame__c-yes">CUT LINE</button><button class="sf-endgame__c-no">REFUSE</button></div>' +
      '</div>';
    document.getElementById('ui-root').appendChild(wrap);
    requestAnimationFrame(() => wrap.classList.add('open'));
    const cleanup = () => {
      choiceModalOpen = false;
      ownedModals.delete(wrap);
      wrap.classList.remove('open');
      setTimeout(() => wrap.remove(), 220);
    };
    wrap.querySelector('.sf-endgame__c-yes').addEventListener('click', () => {
      bus.emit('scenario:scavengerResponse', { choice: 'yield' });
      cleanup();
    });
    wrap.querySelector('.sf-endgame__c-no').addEventListener('click', () => {
      bus.emit('scenario:scavengerResponse', { choice: 'refuse' });
      cleanup();
    });
  });

  // ── tick: fade sweep (called by uiRoot.frame via the returned api) ────────────────────────
  function tick() {
    if (pirateParleyPrompt && pirateParleyPrompt.tick) pirateParleyPrompt.tick();
    if (sectorLawPresenter && sectorLawPresenter.tick) sectorLawPresenter.tick();
    if (signalInvestigationPrompt && signalInvestigationPrompt.tick) signalInvestigationPrompt.tick();
    if (recoveryEncounterPrompt && recoveryEncounterPrompt.tick) recoveryEncounterPrompt.tick();
    if (contactHailPrompt && contactHailPrompt.tick) contactHailPrompt.tick();
    if (commsRadial && commsRadial.tick) commsRadial.tick();
    updateCommsTrace();
    tickHeldComms();
    sweep();
  }

  // hide comms surfaces when not in flight (menu/dock keeps the backlog accessible)
  function setFlightVisibility(visible) {
    feed.style.display = visible ? 'flex' : 'none';
    bulkhead.style.display = visible ? 'block' : 'none';
    traceHost.style.display = visible ? '' : 'none';
    if (!visible) commsTrace.update({ live: false });
    if (!visible) closeBacklog();
  }
  listen('mode:changed', () => {
    const flight = state.mode === 'flight' && !(state.ui && state.ui.docked);
    setFlightVisibility(flight);
  });
  // initial
  const initialVisibilityTimer = setTimeout(() => {
    if (destroyed) return;
    const flight = state.mode === 'flight' && !(state.ui && state.ui.docked);
    setFlightVisibility(flight);
  }, 60);

  function isModalOpen() {
    return choiceModalOpen || endingEpilogue.isOpen() || endingEpilogue.hasPending();
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    clearTimeout(initialVisibilityTimer);
    for (const unsubscribe of unsubscribers.splice(0)) {
      try { unsubscribe(); } catch (_) {}
    }
    backlogBtn.removeEventListener('click', toggleBacklog);
    backlogCloseBtn.removeEventListener('click', closeBacklog);
    for (const child of [
      endingEpilogue,
      pirateParleyPrompt,
      sectorLawPresenter,
      signalInvestigationPrompt,
      recoveryEncounterPrompt,
      contactHailPrompt,
      commsRadial,
    ]) {
      try { if (child && typeof child.destroy === 'function') child.destroy(); } catch (_) {}
    }
    for (const modal of ownedModals) modal.remove();
    ownedModals.clear();
    live.length = 0;
    held.length = 0;
    backlog.length = 0;
    choiceModalOpen = false;
    feed.remove();
    commsTrace.dispose();
    traceHost.remove();
    backlogBtn.remove();
    backlogView.remove();
    bulkhead.remove();
  }

  return { tick, pushComms, openBacklog, closeBacklog, isModalOpen, destroy, endingEpilogue, pirateParleyPrompt, sectorLawPresenter, signalInvestigationPrompt, recoveryEncounterPrompt, contactHailPrompt, commsRadial };
}

function normalizeTtlMs(ttl) {
  const n = Number(ttl);
  if (!Number.isFinite(n) || n <= 0) return 7000;
  return n > 60 ? n : n * 1000;
}

function cleanLifecycleText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

export function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp01(value) {
  const n = finite(value, 0);
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

function nowMs() {
  return (typeof performance !== 'undefined' && typeof performance.now === 'function')
    ? performance.now()
    : Date.now();
}

function resolveCommsFactionId(payload, state, fallback = 'faction_scn') {
  const candidates = [
    payload && payload.factionId,
    payload && payload.faction,
    payload && payload.senderFactionId,
    payload && payload.senderFaction,
    state && state.player && state.player.factionId,
    fallback,
    'faction_scn',
  ];
  for (const value of candidates) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return 'faction_scn';
}

function isLiveCommsVoice(voice, audioNow) {
  if (!voice || voice._stopped) return false;
  if (Number.isFinite(voice.stopAt) && voice.stopAt <= audioNow) return false;
  if (voice.busName === 'comms') return true;
  const recipe = voice.recipe || null;
  const recipeId = recipe && recipe.id ? String(recipe.id) : '';
  if (recipeId.includes('comms') || recipeId.includes('squelch')) return true;
  return recipe && recipe.category === 'comms';
}

function sampleCommsTraceState({
  ctx,
  state,
  now,
  holdUntilMs,
  ampCarry,
  fallbackFactionId,
}) {
  const registry = ctx && ctx.registry;
  const audio = registry && typeof registry.get === 'function' ? registry.get('audio') : null;
  const rt = audio && audio.rt;
  const priorityBus = rt && rt._priorityBus;
  const envelope = priorityBus && typeof priorityBus.activeEnvelope === 'function'
    ? priorityBus.activeEnvelope(now)
    : null;
  const cueId = String(envelope && (envelope.cueId || envelope.id || '') || '');
  const envelopeIsComms = !!(envelope && /^comms\./.test(cueId));
  const durationMs = Math.max(1, finite(envelope && envelope.durationMs, 250));
  const envelopeAmp = envelopeIsComms
    ? clamp01((finite(envelope.endMs, now) - now) / durationMs)
    : 0;

  let voiceUnits = 0;
  const voices = rt && Array.isArray(rt.voices) ? rt.voices : [];
  const audioNow = rt && rt.ctx && Number.isFinite(rt.ctx.currentTime) ? rt.ctx.currentTime : 0;
  for (const voice of voices) {
    if (!isLiveCommsVoice(voice, audioNow)) continue;
    const units = Array.isArray(voice.subVoices) && voice.subVoices.length ? voice.subVoices.length : 1;
    voiceUnits += units;
  }
  const density = clamp01(voiceUnits / 6);

  let nextAmpCarry = clamp01(ampCarry);
  if (envelopeIsComms) nextAmpCarry = envelopeAmp;
  else if (voiceUnits > 0) nextAmpCarry = Math.max(nextAmpCarry * 0.82, Math.min(0.34, density * 0.56));
  else nextAmpCarry *= 0.7;

  const eventLive = now < holdUntilMs;
  const live = voiceUnits > 0 || envelopeIsComms || eventLive;
  if (!live || nextAmpCarry < 0.01) {
    return {
      live: false,
      amplitude: 0,
      density: 0,
      ampCarry: nextAmpCarry,
      phaseStep: 0.42,
      factionId: resolveCommsFactionId(null, state, fallbackFactionId),
    };
  }

  return {
    live: true,
    amplitude: clamp01(nextAmpCarry),
    density: clamp01(Math.max(density, eventLive ? 0.2 : 0.08)),
    ampCarry: nextAmpCarry,
    phaseStep: 0.34 + density * 0.48,
    factionId: resolveCommsFactionId(null, state, fallbackFactionId),
  };
}

// ── CSS (injected once; matches the HUD's industrial cyan/purple language) ──────────────────
function injectCommsCss() {
  if (document.getElementById(COMMS_STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = COMMS_STYLE_ID;
  s.textContent = `
  /* ===== comms feed — joined to the flight context rail when the HUD is present ===== */
  #sf-comms { position:relative; width:100%; max-height:124px; display:flex;
    flex-direction:column-reverse; gap:4px; pointer-events:none; z-index:1050; overflow:hidden;
    font-family:var(--hud-body, "IBM Plex Sans", "Segoe UI", sans-serif); }
  #ui-root > #sf-comms { position:absolute; left:20px; top:118px; width:340px; }
  #sf-comms .sf-comm { pointer-events:auto; }
  body.ui-modal-open #sf-comms,
  body.ui-live-screen #sf-comms { opacity:0; pointer-events:none; }
  body.ui-modal-open .sf-comm-backlog-btn,
  body.ui-live-screen .sf-comm-backlog-btn { opacity:0; visibility:hidden; pointer-events:none; }
  .sf-comm { --comm-color:var(--text-secondary); --comm-glow:none; position:relative; padding:7px 10px 8px;
    border:1px solid rgba(147,174,195,.24); border-top-color:rgba(147,196,211,.42); border-radius:2px;
    background:linear-gradient(108deg, rgba(17,25,36,.91), rgba(7,12,20,.78)); box-shadow:0 10px 24px rgba(0,0,0,.22);
    color:var(--hud-paper,#e7edf5); font-size:12px; text-shadow:none;
    cursor:pointer; transform:translateX(-130%); opacity:0; transition:transform .18s ease, opacity .18s ease; }
  .sf-comm--in { transform:translateX(0); opacity:1; }
  .sf-comm--out { transform:translateX(-130%); opacity:0; }
  .sf-comm__head { display:flex; align-items:baseline; gap:7px; margin-bottom:3px; }
  .sf-comm__tag { padding:1px 4px; background:color-mix(in srgb, var(--comm-color) 13%, transparent);
    font:700 8px var(--hud-display,"Saira SemiCondensed",sans-serif); letter-spacing:.11em; color:var(--comm-color); text-shadow:none; }
  .sf-comm__sender { font:600 9px var(--hud-display,"Saira SemiCondensed",sans-serif); letter-spacing:.07em;
    color:var(--hud-muted,#718298); text-transform:uppercase;
    overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .sf-comm__body { line-height:1.38; color:var(--hud-paper,#e7edf5); }
  .sf-comm--personal .sf-comm__body, .sf-comm--late .sf-comm__body, .sf-comm--story .sf-comm__body { color:#eaf4ff; }

  /* Joined top-left utility rail: explicit words beat another ambiguous glyph. */
  .sf-comm-backlog-btn { position:absolute; left:20px; top:20px; width:66px; height:32px; z-index:1060;
    display:flex; align-items:center; justify-content:center;
    background:linear-gradient(180deg,rgba(20,29,41,.88),rgba(8,13,21,.9));
    border:1px solid rgba(147,174,195,.34); border-radius:2px 0 0 2px; color:#aebdce;
    font:700 10px var(--hud-display,"Saira SemiCondensed",sans-serif); letter-spacing:.09em; cursor:pointer; pointer-events:auto;
    transition:color .12s, border-color .12s; text-shadow:none; }
  .sf-comm-backlog-btn:hover { border-color:#83ced8; color:#e7edf5; }
  .sf-comm-backlog-btn--pulse { color:#e7edf5; border-color:#83ced8;
    animation:sf-commpulse 1.3s ease-in-out infinite alternate; }
  @keyframes sf-commpulse { from { box-shadow:inset 0 -2px rgba(131,206,216,.15); } to { box-shadow:inset 0 -2px #83ced8; } }
  .sf-comm-backlog { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%) scale(.97);
    width:min(620px, 92vw); max-height:78vh; display:none; flex-direction:column; z-index:2400;
    background:rgba(4,9,18,.96); border:1px solid var(--accent); border-radius:9px; box-shadow:0 10px 50px rgba(0,0,0,.7);
    pointer-events:auto; opacity:0; transition:opacity .18s ease, transform .18s ease; }
  .sf-comm-backlog.open { display:flex; opacity:1; transform:translate(-50%,-50%) scale(1); }
  .sf-comm-backlog__head { display:flex; align-items:center; justify-content:space-between; padding:12px 16px;
    border-bottom:1px solid var(--panel-edge); }
  .sf-comm-backlog__title { font-family:var(--mono); font-size:13px; letter-spacing:.18em; color:var(--accent); text-transform:uppercase; }
  .sf-comm-backlog__close { background:none; border:1px solid var(--ink-mute); border-radius:4px; color:var(--ink-dim);
    font-size:10px; padding:2px 9px; cursor:pointer; font-family:var(--mono); }
  .sf-comm-backlog__close:hover { border-color:var(--accent); color:var(--accent); }
  .sf-comm-backlog__hint { padding:7px 16px; font-size:11px; color:var(--ink-mute); font-style:italic;
    border-bottom:1px solid rgba(57,208,255,.07); }
  .sf-comm-backlog__list { overflow-y:auto; padding:4px 0; }
  .sf-comm-backlog__list::-webkit-scrollbar { width:5px; }
  .sf-comm-backlog__list::-webkit-scrollbar-thumb { background:var(--accent); border-radius:3px; }
  .sf-comm-backlog__row { --comm-color:var(--ink-dim); padding:8px 16px; border-bottom:1px solid rgba(57,208,255,.05);
    display:flex; flex-direction:column; gap:2px; }
  .sf-comm-backlog__row:hover { background:rgba(57,208,255,.04); }
  .sf-comm-backlog__sender { font-size:9px; letter-spacing:.08em; color:var(--comm-color); text-transform:uppercase; }
  .sf-comm-backlog__text { font-size:12px; color:var(--ink); line-height:1.4; }
  .sf-comm-backlog__note { margin-top:4px; font-size:10.5px; color:var(--ink-mute); font-style:italic; line-height:1.4;
    border-left:2px solid var(--comm-color); padding-left:8px; }
  .sf-comm-backlog__empty { padding:30px 16px; text-align:center; color:var(--ink-mute); font-style:italic; }

  /* ===== bulkhead graffiti (player's own ship) ===== */
  .sf-bulkhead { position:absolute; left:clamp(220px, 18vw, 340px); bottom:22%; transform:none; z-index:9;
    pointer-events:none; opacity:0; transition:opacity 1.2s ease; max-width:min(420px, 32vw); text-align:left; }
  .sf-bulkhead--visible { opacity:.22; }
  .sf-bulkhead__line { font-family:var(--mono); font-size:clamp(11px, 1.2vw, 13px); letter-spacing:.12em;
    color:#b9c4d6; text-transform:uppercase; text-shadow:0 0 12px rgba(0,0,0,.85), 0 1px 2px #000;
    transform:rotate(-1.5deg); }
  @media (max-width: 760px) { .sf-bulkhead { left:18px; right:18px; bottom:150px; max-width:none; } .sf-bulkhead__line { font-size:11px; letter-spacing:.08em; }
    #ui-root > #sf-comms { width:260px; top:88px; }
    .sf-comm-backlog-btn { top:12px; }
    .sf-comm { font-size:11px; padding:6px 9px; } }

  /* ===== endgame choice modal ===== */
  .sf-endgame { position:fixed; inset:0; z-index:2600; display:none; align-items:center; justify-content:center;
    background:rgba(3,5,10,.94); opacity:0; transition:opacity .3s ease; }
  .sf-endgame.open { display:flex; opacity:1; }
  .sf-endgame__panel { width:min(880px, 94vw); max-height:90vh; overflow-y:auto; padding:24px 28px;
    background:linear-gradient(180deg, var(--panel-2), var(--panel)); border:1px solid var(--accent); border-radius:10px;
    box-shadow:0 0 60px rgba(57,208,255,.15), 0 20px 60px rgba(0,0,0,.6); }
  .sf-endgame__head { text-align:center; margin-bottom:18px; }
  .sf-endgame__title { margin:0; font-family:var(--mono); font-size:18px; letter-spacing:.2em; color:var(--accent);
    text-transform:uppercase; text-shadow:0 0 14px rgba(57,208,255,.4); }
  .sf-endgame__sub { margin-top:6px; font-size:12px; color:var(--ink-mute); font-style:italic; }
  .sf-endgame__choices { display:flex; flex-direction:column; gap:14px; }
  .sf-endgame__choice { padding:14px 16px; background:rgba(4,9,18,.6); border:1px solid var(--panel-edge); border-radius:7px;
    transition:border-color .15s, background .15s; }
  .sf-endgame__choice:hover { border-color:var(--accent-3); background:rgba(192,139,255,.05); }
  .sf-endgame__choice-head { display:flex; align-items:baseline; gap:10px; margin-bottom:6px; }
  .sf-endgame__choice-id { font-size:20px; color:var(--accent-3); letter-spacing:.1em; }
  .sf-endgame__choice-title { font-size:15px; color:var(--ink); letter-spacing:.04em; }
  .sf-endgame__choice-board { font-size:11px; color:var(--accent); margin-bottom:6px; }
  .sf-endgame__choice-noboard { color:var(--ink-mute); font-style:italic; }
  .sf-endgame__choice-summary { font-size:12.5px; color:var(--ink); line-height:1.5; margin-bottom:6px; }
  .sf-endgame__choice-cost { font-size:11px; color:var(--ink-mute); font-style:italic; line-height:1.5;
    border-left:2px solid var(--danger); padding-left:9px; }
  .sf-endgame__choice-actions { margin-top:10px; display:flex; justify-content:flex-end; }
  .sf-endgame__accept { background:rgba(192,139,255,.12); border:1px solid var(--accent-3); color:var(--accent-3);
    font-family:var(--mono); font-size:11px; letter-spacing:.16em; padding:6px 18px; border-radius:5px; cursor:pointer; }
  .sf-endgame__accept:hover { background:rgba(192,139,255,.25); color:#fff; }
  .sf-endgame__footer { margin-top:18px; text-align:center; font-size:11px; color:var(--ink-mute); font-style:italic; }
  /* Choice C inline prompt */
  .sf-endgame--c .sf-endgame__panel--c { width:min(480px, 90vw); padding:28px; text-align:center; }
  .sf-endgame__c-prompt { font-family:var(--mono); font-size:18px; letter-spacing:.12em; color:var(--danger);
    text-transform:uppercase; margin-bottom:12px; text-shadow:0 0 14px rgba(255,84,112,.4); }
  .sf-endgame__c-hint { font-size:12px; color:var(--ink-mute); font-style:italic; line-height:1.5; margin-bottom:18px; }
  .sf-endgame__c-actions { display:flex; gap:14px; justify-content:center; }
  .sf-endgame__c-yes { background:rgba(255,84,112,.15); border:1px solid var(--danger); color:var(--danger);
    font-family:var(--mono); letter-spacing:.16em; padding:8px 24px; border-radius:5px; cursor:pointer; }
  .sf-endgame__c-no { background:rgba(84,160,200,.12); border:1px solid var(--panel-edge-2); color:var(--ink-dim);
    font-family:var(--mono); letter-spacing:.16em; padding:8px 24px; border-radius:5px; cursor:pointer; }
  .sf-endgame__c-yes:hover { background:rgba(255,84,112,.3); color:#fff; }
  .sf-endgame__c-no:hover { border-color:var(--accent); color:var(--accent); }
  `;
  document.head.appendChild(s);
}
