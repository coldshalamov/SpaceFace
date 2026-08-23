// Non-modal, player-facing bridge for authored encounter choices. The sim owns timing and outcome;
// this presenter only renders the offer and emits one intent back to encounterDirector.
import { isUiInteractionFenced } from './input.js';

const STYLE_ID = 'sf-encounter-choice-style';

export function createEncounterChoicePrompt(ctx = {}) {
  const state = ctx.state || {};
  const bus = ctx.bus;
  const doc = ctx.document || (typeof document !== 'undefined' ? document : null);
  if (!doc || typeof doc.createElement !== 'function' || !bus || typeof bus.on !== 'function') {
    return inertPrompt();
  }

  injectStyle(doc);
  const mount = ctx.mount || doc.getElementById('ui-root') || doc.body;
  const root = doc.createElement('aside');
  root.id = 'sf-encounter-choice';
  root.hidden = true;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'false');
  root.setAttribute('aria-live', 'polite');
  root.setAttribute('aria-atomic', 'true');
  root.setAttribute('aria-labelledby', 'sf-encounter-choice-title');
  root.setAttribute('aria-describedby', 'sf-encounter-choice-status');

  const eyebrow = doc.createElement('div');
  eyebrow.className = 'sf-encounter-choice__eyebrow';
  eyebrow.textContent = 'ENCOUNTER DECISION';
  const title = doc.createElement('h2');
  title.id = 'sf-encounter-choice-title';
  const status = doc.createElement('p');
  status.id = 'sf-encounter-choice-status';
  status.className = 'sf-encounter-choice__status';
  const actions = doc.createElement('div');
  actions.className = 'sf-encounter-choice__actions';
  root.appendChild(eyebrow);
  root.appendChild(title);
  root.appendChild(status);
  root.appendChild(actions);
  if (mount && typeof mount.appendChild === 'function') mount.appendChild(root);

  let active = null;
  let submitted = false;
  let buttons = [];
  let destroyed = false;
  const offs = [];

  function canSurface() {
    return state.mode === 'flight' && !(state.ui && state.ui.docked) && !isUiInteractionFenced(state);
  }

  function hide() {
    active = null;
    submitted = false;
    buttons = [];
    actions.replaceChildren();
    root.hidden = true;
    root.setAttribute('aria-busy', 'false');
  }

  function show(payload) {
    if (destroyed || !canSurface() || !payload || !payload.encounterId || !Array.isArray(payload.options)) {
      return false;
    }
    active = {
      encounterId: payload.encounterId,
      deadlineAt: Number.isFinite(payload.deadlineAt) ? Number(payload.deadlineAt) : null,
      options: payload.options.map((option) => ({
        id: String(option && option.id || ''),
        label: String(option && option.label || option && option.id || ''),
        available: option && option.available !== false,
      })).filter((option) => option.id),
    };
    submitted = false;
    title.textContent = String(payload.title || payload.kind || 'ENCOUNTER DECISION');
    status.textContent = deadlineText(active.deadlineAt, state.simTime);
    buttons = active.options.map((option, index) => {
      const button = doc.createElement('button');
      button.type = 'button';
      button.dataset.choice = option.id;
      button.dataset.key = String(index + 1);
      button.disabled = !option.available;
      button.textContent = option.label;
      button.setAttribute('aria-label', `${option.label}${option.available ? '' : '. Unavailable'}`);
      button.setAttribute('aria-keyshortcuts', String(index + 1));
      button.addEventListener('click', () => choose(option.id, 'click'));
      return button;
    });
    actions.replaceChildren(...buttons);
    root.setAttribute('aria-busy', 'false');
    root.hidden = false;
    return true;
  }

  function choose(choiceId, source = 'ui') {
    if (destroyed || !active || submitted || isUiInteractionFenced(state)) return false;
    const choice = active.options.find((option) => option.id === choiceId && option.available);
    if (!choice) return false;
    submitted = true;
    const encounterId = active.encounterId;
    // Choice can intentionally lead into a longer-running simulation phase. The decision is over
    // as soon as it is submitted, so do not leave a dead-looking "transmitting" panel on screen
    // until that later phase resolves.
    hide();
    bus.emit('encounter:choose', { encounterId, choiceId: choice.id, source });
    return true;
  }

  function onKeyDown(event) {
    if (destroyed || !active || submitted || !event || event.ctrlKey || event.altKey || event.metaKey) return;
    const index = keyIndex(event);
    if (index < 0 || index >= active.options.length) return;
    // A decision owns its visible number keys, including unavailable choices, so flight bindings
    // cannot fire through an active response surface.
    if (typeof event.preventDefault === 'function') event.preventDefault();
    if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
    else if (typeof event.stopPropagation === 'function') event.stopPropagation();
    choose(active.options[index].id, 'keyboard');
  }

  function resolved(payload) {
    if (active && payload && payload.encounterId === active.encounterId) hide();
  }

  function tick() {
    if (!active || destroyed) return;
    if (!canSurface()) { hide(); return; }
    if (!submitted) status.textContent = deadlineText(active.deadlineAt, state.simTime);
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    for (const off of offs) {
      try { if (typeof off === 'function') off(); } catch (err) { /* teardown stays best-effort */ }
    }
    offs.length = 0;
    hide();
    root.remove();
  }

  offs.push(bus.on('encounter:choiceOffered', show));
  offs.push(bus.on('encounter:resolved', resolved));
  offs.push(bus.on('sector:exit', hide));
  offs.push(bus.on('game:new', hide));
  offs.push(bus.on('game:load', hide));
  if (typeof doc.addEventListener === 'function') {
    doc.addEventListener('keydown', onKeyDown, true);
    offs.push(() => doc.removeEventListener('keydown', onKeyDown, true));
  }

  return {
    el: root,
    get buttons() { return [...buttons]; },
    show,
    hide,
    choose,
    tick,
    destroy,
  };
}

function deadlineText(deadlineAt, simTime) {
  if (!Number.isFinite(deadlineAt)) return 'Choose a response. Flight remains active.';
  const remaining = Math.max(0, Number(deadlineAt) - (Number(simTime) || 0));
  return `Choose a response · ${Math.ceil(remaining)} seconds`;
}

function injectStyle(doc) {
  if (!doc.head || doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
  #sf-encounter-choice { position:absolute; right:28px; top:clamp(184px,23vh,280px); z-index:86;
    width:min(360px,calc(100vw - 40px)); box-sizing:border-box; padding:14px 15px 15px;
    border:1px solid rgba(119,203,255,.48); border-top:3px solid #77cbff;
    background:linear-gradient(135deg,rgba(5,13,24,.98),rgba(3,7,14,.94)); color:#eef8ff;
    font-family:var(--mono,Consolas,monospace); box-shadow:0 18px 36px rgba(0,0,0,.36); pointer-events:auto; }
  #sf-encounter-choice[hidden] { display:none !important; }
  .sf-encounter-choice__eyebrow { color:#9bdcff; font-size:12px; font-weight:700; letter-spacing:.2em; }
  #sf-encounter-choice-title { margin:7px 0 0; font:700 17px/1.2 var(--mono,Consolas,monospace); letter-spacing:.025em; }
  .sf-encounter-choice__status { margin:6px 0 0; color:#b6c9da; font-size:12px; line-height:1.35; }
  .sf-encounter-choice__actions { display:grid; gap:6px; margin-top:13px; }
  .sf-encounter-choice__actions button { min-height:42px; position:relative; padding:8px 11px 8px 44px;
    border:1px solid rgba(119,203,255,.34); background:rgba(91,158,198,.08); color:#eff8ff;
    text-align:left; font:700 12px/1.25 var(--mono,Consolas,monospace); letter-spacing:.025em; cursor:pointer;
    transition:transform .14s ease, border-color .14s ease, background .14s ease; }
  .sf-encounter-choice__actions button::before { content:attr(data-key); position:absolute; left:10px; top:50%;
    width:22px; height:22px; display:grid; place-items:center; transform:translateY(-50%); border:1px solid rgba(155,220,255,.52);
    color:#9bdcff; font-size:12px; letter-spacing:0; }
  .sf-encounter-choice__actions button:hover,.sf-encounter-choice__actions button:focus-visible { transform:translateX(-2px);
    border-color:#9bdcff; background:rgba(119,203,255,.17); outline:2px solid #bdeaff; outline-offset:2px; }
  .sf-encounter-choice__actions button:disabled { opacity:.38; cursor:not-allowed; transform:none; }
  @media (max-width:820px) { #sf-encounter-choice { left:50%; right:auto; top:auto; bottom:104px;
    transform:translateX(-50%); width:min(400px,calc(100vw - 24px)); } }
  @media (prefers-reduced-motion:reduce) { .sf-encounter-choice__actions button { transition:none !important; } }`;
  doc.head.appendChild(style);
}

function inertPrompt() {
  return {
    el: null, buttons: [], show: () => false, hide: () => {}, choose: () => false,
    tick: () => {}, destroy: () => {},
  };
}

function keyIndex(event) {
  const key = String(event.key || '');
  const code = String(event.code || '');
  if (/^[1-9]$/.test(key)) return Number(key) - 1;
  const match = /^(?:Digit|Numpad)([1-9])$/.exec(code);
  return match ? Number(match[1]) - 1 : -1;
}
