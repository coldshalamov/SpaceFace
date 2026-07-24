// Final-disposition payoff cards. Presentation only: reads ending state, owns one DOM dialog,
// and never emits narrative, sound, gameplay, or save events.

import {
  SANDBOX_DEF,
  endingDef,
  isSandboxId,
} from '../story/endings/endingDefs.js';

const STYLE_ID = 'sf-ending-epilogue-style';
const DEFER_MS = 240;

const CONSEQUENCE_BY_ID = Object.freeze({
  A: 'Your record is expunged. Concord standing and patrol work now define your route.',
  B: 'Your public identity is gone. Quiet routing and uncredited freight define your route.',
  C: 'Same bay. Same date. 47-A: OPEN / PAYMENT: PENDING.',
  D: 'You hold the ledger at Ashfall. Witness work now defines your route.',
  E: '47-A is closed. 47-B is pending, and paid contract work continues.',
  SANDBOX: 'No disposition was filed. The world and every unfinished obligation remain open.',
});

function clean(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function postEndingOf(state) {
  const rec = state && state.story && state.story.postEnding;
  return rec && typeof rec === 'object' ? rec : null;
}

export function buildEndingEpilogueModel({ event, payload = {}, state } = {}) {
  const rec = postEndingOf(state);
  const sandbox = event === 'endgame:sandboxContinued'
    || isSandboxId(payload.choice)
    || (!payload.choice && rec && isSandboxId(rec.choiceId));
  const id = sandbox
    ? SANDBOX_DEF.id
    : clean(payload.choice || (rec && (rec.choiceId || rec.endingId)));
  const def = endingDef(id);
  if (!def) return null;

  const isEnding = def.id !== SANDBOX_DEF.id;
  return Object.freeze({
    id: def.id,
    isEnding,
    kind: isEnding ? 'ending' : 'continuation',
    eyebrow: isEnding ? `FINAL DISPOSITION · ${def.id}` : 'CONTINUATION · NO ENDING',
    title: clean(payload.title) || def.title,
    resolution: clean(payload.resolution) || def.resolution,
    consequence: CONSEQUENCE_BY_ID[def.id],
    objective: clean(rec && rec.objective) || def.continuity.objective,
    objectiveTitle: clean(rec && rec.title) || def.continuity.title,
    dismissLabel: 'CONTINUE OPERATIONS',
  });
}

function element(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text != null) el.textContent = text;
  return el;
}

function canRestoreFocus(el) {
  return !!el && el.isConnected !== false && !el.disabled && typeof el.focus === 'function';
}

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .sf-ending-epilogue {
      position: fixed; inset: 0; z-index: 2800; display: grid; place-items: center;
      padding: clamp(18px, 4vw, 64px); box-sizing: border-box; pointer-events: auto;
      color: #edf6ff; background:
        radial-gradient(circle at 50% 38%, rgba(39, 91, 121, .18), transparent 44%),
        rgba(3, 7, 13, .96); animation: sf-ending-epilogue-in .42s ease-out both;
    }
    .sf-ending-epilogue[data-ending-kind="continuation"] {
      background: radial-gradient(circle at 50% 38%, rgba(88, 111, 128, .13), transparent 44%), rgba(3, 7, 13, .96);
    }
    .sf-ending-epilogue__panel {
      width: min(760px, 100%); max-height: min(760px, 92vh); overflow: auto;
      padding: clamp(26px, 5vw, 58px); box-sizing: border-box;
      border: 1px solid rgba(105, 205, 236, .42); border-inline-width: 0;
      background: linear-gradient(180deg, rgba(10, 20, 30, .84), rgba(5, 11, 19, .72));
      box-shadow: 0 32px 90px rgba(0, 0, 0, .58); text-align: left;
    }
    .sf-ending-epilogue__eyebrow,
    .sf-ending-epilogue__section-title {
      margin: 0; font-family: var(--mono, monospace); text-transform: uppercase;
      letter-spacing: .2em; color: #76d9f3;
    }
    .sf-ending-epilogue__eyebrow { font-size: 11px; margin-bottom: 14px; }
    .sf-ending-epilogue__title {
      margin: 0; max-width: 18ch; font-family: var(--mono, monospace); font-size: clamp(30px, 6vw, 62px);
      line-height: .98; letter-spacing: .025em; font-weight: 650; text-wrap: balance;
    }
    .sf-ending-epilogue__resolution {
      margin: 22px 0 0; max-width: 58ch; color: #c9d7e3; font-size: clamp(15px, 2vw, 19px); line-height: 1.55;
    }
    .sf-ending-epilogue__rule { width: 72px; height: 1px; margin: 30px 0; background: #76d9f3; opacity: .75; }
    .sf-ending-epilogue__sections { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; }
    .sf-ending-epilogue__section-title { font-size: 9px; margin-bottom: 9px; color: #89a9bc; }
    .sf-ending-epilogue__section-copy { margin: 0; color: #e1ebf2; font-size: 14px; line-height: 1.55; }
    .sf-ending-epilogue__objective-name { display: block; margin-bottom: 5px; color: #76d9f3; }
    .sf-ending-epilogue__dismiss {
      margin-top: 34px; min-height: 42px; padding: 9px 18px; border: 1px solid rgba(118, 217, 243, .72);
      border-radius: 3px; background: rgba(33, 107, 130, .12); color: #dff8ff;
      font: 11px var(--mono, monospace); letter-spacing: .15em; cursor: pointer;
    }
    .sf-ending-epilogue__dismiss:hover { background: rgba(52, 158, 190, .2); }
    .sf-ending-epilogue__dismiss:focus-visible { outline: 3px solid #f5c35b; outline-offset: 4px; }
    @keyframes sf-ending-epilogue-in {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @media (max-width: 620px) {
      .sf-ending-epilogue__sections { grid-template-columns: 1fr; gap: 20px; }
    }
    @media (prefers-reduced-motion: reduce) {
      .sf-ending-epilogue { animation: none; }
      .sf-ending-epilogue *, .sf-ending-epilogue *::before, .sf-ending-epilogue *::after {
        transition: none !important; animation: none !important;
      }
    }
  `;
  document.head.appendChild(style);
}

export function createEndingEpilogue({ bus, state, root, isBlocked } = {}) {
  const mount = root || document.getElementById('ui-root');
  if (!mount) throw new Error('ending epilogue requires #ui-root');
  injectStyles();

  let active = null;
  let pending = null;
  let opener = null;
  let deferHandle = null;
  let deferAttempts = 0;
  let destroyed = false;
  const offs = [];

  function blocked() {
    if (typeof isBlocked === 'function' && isBlocked()) return true;
    return !!document.querySelector('.sf-endgame.open');
  }

  function restoreFocus() {
    const target = canRestoreFocus(opener) ? opener : mount.querySelector('button');
    opener = null;
    if (canRestoreFocus(target)) target.focus();
  }

  function dismiss() {
    if (!active) return false;
    const current = active;
    active = null;
    current.remove();
    restoreFocus();
    return true;
  }

  function mountModel(model) {
    if (!model || active || destroyed) return false;
    opener = document.activeElement;

    const dialog = element('section', 'sf-ending-epilogue');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'sf-ending-epilogue-title');
    dialog.setAttribute('aria-describedby', 'sf-ending-epilogue-description');
    dialog.setAttribute('data-ending-kind', model.kind);
    dialog.setAttribute('data-ending-id', model.id);

    const panel = element('div', 'sf-ending-epilogue__panel');
    const eyebrow = element('p', 'sf-ending-epilogue__eyebrow', model.eyebrow);
    const title = element('h1', 'sf-ending-epilogue__title', model.title);
    title.id = 'sf-ending-epilogue-title';
    const resolution = element('p', 'sf-ending-epilogue__resolution', model.resolution);
    resolution.id = 'sf-ending-epilogue-description';
    const rule = element('div', 'sf-ending-epilogue__rule');
    rule.setAttribute('aria-hidden', 'true');

    const sections = element('div', 'sf-ending-epilogue__sections');
    const consequence = element('section', 'sf-ending-epilogue__section');
    consequence.append(
      element('h2', 'sf-ending-epilogue__section-title', 'CONSEQUENCE'),
      element('p', 'sf-ending-epilogue__section-copy', model.consequence),
    );
    const next = element('section', 'sf-ending-epilogue__section');
    const nextCopy = element('p', 'sf-ending-epilogue__section-copy');
    const objectiveName = element('strong', 'sf-ending-epilogue__objective-name', model.objectiveTitle);
    nextCopy.append(objectiveName, document.createTextNode ? document.createTextNode(model.objective) : element('span', '', model.objective));
    next.append(element('h2', 'sf-ending-epilogue__section-title', 'NEXT OBJECTIVE'), nextCopy);
    sections.append(consequence, next);

    const button = element('button', 'sf-ending-epilogue__dismiss', model.dismissLabel);
    button.setAttribute('type', 'button');
    button.setAttribute('data-ending-epilogue-dismiss', '');
    button.addEventListener('click', dismiss);

    panel.append(eyebrow, title, resolution, rule, sections, button);
    dialog.appendChild(panel);
    dialog.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        dismiss();
      } else if (event.key === 'Tab') {
        event.preventDefault();
        button.focus();
      }
    });

    active = dialog;
    mount.appendChild(dialog);
    button.focus();
    return true;
  }

  function schedulePending() {
    if (deferHandle != null || destroyed) return;
    deferHandle = setTimeout(() => {
      deferHandle = null;
      flushPending();
    }, DEFER_MS);
  }

  function flushPending() {
    if (!pending || active || destroyed) return false;
    if (blocked()) {
      deferAttempts += 1;
      if (deferAttempts < 12) schedulePending();
      return false;
    }
    const model = pending;
    pending = null;
    deferAttempts = 0;
    return mountModel(model);
  }

  function present(event, payload) {
    const model = buildEndingEpilogueModel({ event, payload, state });
    if (!model || active || destroyed) return false;
    if (blocked()) {
      pending = model;
      deferAttempts = 0;
      schedulePending();
      return true;
    }
    return mountModel(model);
  }

  if (bus && typeof bus.on === 'function') {
    for (const [event, handler] of [
      ['endgame:chosen', (payload) => present('endgame:chosen', payload)],
      ['endgame:sandboxContinued', (payload) => present('endgame:sandboxContinued', payload)],
    ]) {
      const off = bus.on(event, handler);
      if (typeof off === 'function') offs.push(off);
    }
  }

  function destroy() {
    destroyed = true;
    pending = null;
    if (deferHandle != null) clearTimeout(deferHandle);
    deferHandle = null;
    dismiss();
    for (const off of offs) off();
    offs.length = 0;
  }

  return {
    dismiss,
    destroy,
    flushPending,
    isOpen: () => !!active,
    hasPending: () => !!pending,
  };
}

export default createEndingEpilogue;
