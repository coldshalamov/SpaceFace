// Compact target hail beside the comms log. Simulation validation lives in scanner.js; this module
// only consumes scanner receipts, emits intents, and renders at most two lines/two ordinary actions.

import { isUiInteractionFenced } from './input.js';

const STYLE_ID = 'sf-contact-hail-style';

export function createContactHailPrompt(ctx) {
  const { state, bus } = ctx;
  injectStyle();

  const root = document.createElement('div');
  root.id = 'sf-contact-hail';
  root.innerHTML = `
    <button type="button" class="sf-contact-hail__button" data-k="hail" disabled
      aria-label="Hail selected contact">HAIL</button>
    <aside class="sf-contact-hail__panel" data-k="panel" role="region" aria-live="polite"
      aria-atomic="true" hidden>
      <div class="sf-contact-hail__lines" data-k="lines"></div>
      <div class="sf-contact-hail__actions" data-k="actions"></div>
    </aside>`;
  document.getElementById('ui-root').appendChild(root);

  const hailButton = root.querySelector('[data-k="hail"]');
  const panel = root.querySelector('[data-k="panel"]');
  const linesEl = root.querySelector('[data-k="lines"]');
  const actionsEl = root.querySelector('[data-k="actions"]');
  let active = null;
  let availability = { enabled: false, targetId: null, kind: null, label: 'HAIL' };
  let destroyed = false;

  function hidePanel() {
    active = null;
    panel.hidden = true;
    linesEl.replaceChildren();
    actionsEl.replaceChildren();
  }

  function render(payload) {
    if (!payload || payload.targetId !== state.player.targetId) return false;
    active = { ...payload };
    const lines = Array.isArray(payload.lines) ? payload.lines : [];
    const actions = Array.isArray(payload.actions) ? payload.actions : [];
    linesEl.replaceChildren(...lines.slice(0, 2).map((line) => {
      const row = document.createElement('div');
      row.className = 'sf-contact-hail__line';
      row.textContent = line;
      return row;
    }));
    actionsEl.replaceChildren(...actions.slice(0, 2).map((action, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.choice = action.id;
      button.textContent = `${index + 1} · ${action.label}`;
      button.setAttribute('aria-label', `${action.label}. Choice ${index + 1}.`);
      return button;
    }));
    panel.hidden = false;
    panel.setAttribute('aria-label', lines.slice(0, 2).join(' '));
    return true;
  }

  function applyAvailability(payload) {
    availability = payload || { enabled: false, targetId: null, kind: null, label: 'HAIL' };
    hailButton.disabled = !availability.enabled;
    hailButton.textContent = availability.enabled ? 'HAIL' : 'HAIL —';
    hailButton.setAttribute('aria-label', availability.enabled
      ? availability.label
      : 'Hail unavailable for selected contact');
    root.classList.toggle('sf-contact-hail--ready', !!availability.enabled);
    if (active && (!availability.enabled || availability.targetId !== active.targetId)) hidePanel();
  }

  function request(source = 'pointer') {
    if (isUiInteractionFenced(state) || !availability.enabled) return false;
    bus.emit('contactHail:request', { targetId: availability.targetId, source });
    return true;
  }

  function choose(choice, source = 'pointer') {
    if (isUiInteractionFenced(state) || !active || !choice) return false;
    bus.emit('contactHail:choice', {
      requestId: active.requestId,
      targetId: active.targetId,
      choice,
      source,
    });
    return true;
  }

  function onPanelClick(event) {
    if (isUiInteractionFenced(state)) return;
    const button = event.target && event.target.closest && event.target.closest('[data-choice]');
    if (!button || !panel.contains(button)) return;
    choose(button.dataset.choice, 'pointer');
  }

  function onKeyDown(event) {
    if (isUiInteractionFenced(state) || !active || event.altKey || event.ctrlKey || event.metaKey) return;
    const index = event.code === 'Digit1' || event.code === 'Numpad1' ? 0
      : event.code === 'Digit2' || event.code === 'Numpad2' ? 1 : -1;
    if (index < 0) return;
    const action = active.actions && active.actions[index];
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    choose(action.id, 'keyboard');
  }

  function tick() {
    if (destroyed) return;
    if (active) {
      const now = Number(state.simTime) || 0;
      if (active.targetId !== state.player.targetId
        || state.mode !== 'flight' || state.ui && state.ui.docked
        || Number(active.expiresAt) <= now) hidePanel();
    }
  }

  function destroy() {
    destroyed = true;
    for (const [event, handler] of busBindings) bus.off(event, handler);
    document.removeEventListener('keydown', onKeyDown, true);
    root.remove();
  }

  hailButton.addEventListener('click', () => request('pointer'));
  panel.addEventListener('click', onPanelClick);
  document.addEventListener('keydown', onKeyDown, true);
  const busBindings = [
    ['contactHail:availability', applyAvailability],
    ['contactHail:offer', render],
    ['contactHail:response', render],
    ['contactHail:clear', hidePanel],
    ['contactHail:handoff', hidePanel],
    ['game:new', hidePanel],
    ['game:load', hidePanel],
    ['dock:docked', hidePanel],
    ['mode:changed', hidePanel],
  ];
  for (const [event, handler] of busBindings) bus.on(event, handler);

  return { el: root, tick, request, choose, hide: hidePanel, destroy };
}

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
  #sf-contact-hail { position:absolute; left:85px; top:20px; z-index:1061;
    font-family:"IBM Plex Sans","Segoe UI",sans-serif; contain:layout paint style; }
  .sf-contact-hail__button { width:66px; height:32px; padding:0 8px; border-radius:0 2px 2px 0;
    border:1px solid rgba(147,174,195,.34); background:linear-gradient(180deg,rgba(20,29,41,.88),rgba(8,13,21,.9)); color:#718298;
    font:700 10px "Saira SemiCondensed",sans-serif; letter-spacing:.1em; cursor:default; }
  .sf-contact-hail--ready .sf-contact-hail__button { color:#e7edf5; border-color:rgba(131,206,216,.62);
    cursor:pointer; box-shadow:inset 0 -2px #83ced8; }
  .sf-contact-hail__button:hover:not(:disabled), .sf-contact-hail__button:focus-visible,
  .sf-contact-hail__actions button:hover, .sf-contact-hail__actions button:focus-visible {
    outline:2px solid #39d0ff; outline-offset:1px; background:rgba(57,208,255,.12); }
  .sf-contact-hail__button:disabled { opacity:.72; }
  .sf-contact-hail__panel { position:absolute; left:-65px; top:38px; width:min(300px, calc(100vw - 28px));
    box-sizing:border-box; padding:9px 10px; background:linear-gradient(112deg,rgba(18,27,39,.96),rgba(7,12,20,.94)); color:#e7edf5;
    border:1px solid rgba(147,174,195,.32); border-top:2px solid #83ced8; border-radius:2px; box-shadow:0 14px 30px rgba(0,0,0,.32); }
  .sf-contact-hail__panel[hidden] { display:none !important; }
  .sf-contact-hail__lines { display:grid; gap:2px; }
  .sf-contact-hail__line { overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
    font-size:10px; line-height:1.35; letter-spacing:.04em; }
  .sf-contact-hail__line + .sf-contact-hail__line { color:#84a0c8; }
  .sf-contact-hail__actions { display:flex; gap:6px; margin-top:7px; }
  .sf-contact-hail__actions:empty { display:none; }
  .sf-contact-hail__actions button { min-height:30px; flex:1 1 0; border:1px solid rgba(57,208,255,.34);
    background:rgba(57,208,255,.05); color:#d7e6ff; cursor:pointer;
    font:9px var(--mono, Consolas, monospace); letter-spacing:.08em; }
  body.ui-modal-open #sf-contact-hail { opacity:0; visibility:hidden; pointer-events:none; }
  @media (max-width:900px), (max-height:620px) {
    #sf-contact-hail { left:85px; top:12px; }
    .sf-contact-hail__panel { left:-65px; }
  }
  @media (prefers-reduced-motion:reduce) {
    #sf-contact-hail, .sf-contact-hail__button, .sf-contact-hail__panel { transition:none; }
  }`;
  document.head.appendChild(style);
}

export default createContactHailPrompt;
