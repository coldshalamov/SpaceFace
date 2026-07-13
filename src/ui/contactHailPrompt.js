// Compact target hail beside the comms log. Simulation validation lives in scanner.js; this module
// only consumes scanner receipts, emits intents, and renders at most two lines/two ordinary actions.

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
    if (!availability.enabled) return false;
    bus.emit('contactHail:request', { targetId: availability.targetId, source });
    return true;
  }

  function choose(choice, source = 'pointer') {
    if (!active || !choice) return false;
    bus.emit('contactHail:choice', {
      requestId: active.requestId,
      targetId: active.targetId,
      choice,
      source,
    });
    return true;
  }

  function onPanelClick(event) {
    const button = event.target && event.target.closest && event.target.closest('[data-choice]');
    if (!button || !panel.contains(button)) return;
    choose(button.dataset.choice, 'pointer');
  }

  function onKeyDown(event) {
    if (!active || event.altKey || event.ctrlKey || event.metaKey) return;
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
  #sf-contact-hail { position:absolute; left:54px; top:54px; z-index:1061;
    font-family:var(--mono, Consolas, monospace); contain:layout paint style; }
  .sf-contact-hail__button { width:58px; height:32px; padding:0 8px; border-radius:6px;
    border:1px solid rgba(120,148,190,.34); background:rgba(5,9,18,.84); color:#7894be;
    font:9px var(--mono, Consolas, monospace); letter-spacing:.12em; cursor:default; }
  .sf-contact-hail--ready .sf-contact-hail__button { color:#39d0ff; border-color:rgba(57,208,255,.56);
    cursor:pointer; box-shadow:0 0 8px rgba(57,208,255,.12); }
  .sf-contact-hail__button:hover:not(:disabled), .sf-contact-hail__button:focus-visible,
  .sf-contact-hail__actions button:hover, .sf-contact-hail__actions button:focus-visible {
    outline:2px solid #39d0ff; outline-offset:1px; background:rgba(57,208,255,.12); }
  .sf-contact-hail__button:disabled { opacity:.52; }
  .sf-contact-hail__panel { position:absolute; left:-38px; top:40px; width:min(292px, calc(100vw - 28px));
    box-sizing:border-box; padding:8px 9px; background:rgba(5,9,18,.92); color:#d7e6ff;
    border:1px solid rgba(57,208,255,.38); border-left:2px solid #39d0ff; }
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
    #sf-contact-hail { left:52px; top:46px; }
    .sf-contact-hail__panel { left:-40px; }
  }
  @media (prefers-reduced-motion:reduce) {
    #sf-contact-hail, .sf-contact-hail__button, .sf-contact-hail__panel { transition:none; }
  }`;
  document.head.appendChild(style);
}

export default createContactHailPrompt;
