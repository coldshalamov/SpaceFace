// Final-disposition payoff cards. Presentation only: reads ending state, owns one DOM dialog,
// and never emits narrative, sound, gameplay, or save events.

import {
  SANDBOX_DEF,
  endingDef,
  isSandboxId,
} from '../story/endings/endingDefs.js';
import { confessionalReadback, CONFESSIONAL_RECORD_TEXT_MAX } from '../systems/special500Confessional.js';
import { FACTION_META } from '../data/factions.js';
import { SECTORS } from '../data/sectors.js';
import { contestedSectorForPair } from '../data/conflictZones.js';
import { localizeText } from '../localization/sourceText.js';

const STYLE_ID = 'sf-ending-epilogue-style';
const DEFER_MS = 240;

const CONSEQUENCE_BY_ID = Object.freeze({
  A: 'Your record is expunged. Concord standing and patrol work now define your route.',
  B: 'Your public identity is gone. Quiet routing and uncredited freight define your route.',
  C: 'The jump returned you to Ashfall. The unpaid circuit remains physically intact.',
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

// THE WAR YOU LEFT (inf-epilogue-war): the epilogue closes the captain's account — what the
// disposition bought, what stays open — but never said what the galaxy was doing when you
// filed it. A front at 'war' in the factions-owned conflict record at ending time reads back
// on its own line: which houses, which contested lane, and — when the banked playerLean is
// real — which way your work left it leaning. Pure read; factions stays the sole writer, and
// a galaxy with no live war stays silent.
const FACTION_NAME_BY_ID = new Map(FACTION_META.map((row) => [row.id, row.short || row.name]));
const SECTOR_NAME_BY_ID = new Map(SECTORS.map((sector) => [sector.id, sector.name]));

function endingWarLine(state) {
  const conflicts = state && state.conflicts;
  if (!conflicts || typeof conflicts !== 'object') return null;
  for (const pairKey of Object.keys(conflicts)) {
    const rec = conflicts[pairKey];
    if (!rec || String(rec.state || '').toLowerCase() !== 'war') continue;
    const [aId, bId] = String(pairKey).split(':');
    if (!aId || !bId) continue;
    const name = (id) => FACTION_NAME_BY_ID.get(id) || String(id).replace(/^faction_/, '');
    const frontSectorId = contestedSectorForPair(pairKey);
    const front = (frontSectorId && SECTOR_NAME_BY_ID.get(frontSectorId)) || 'the contested lane';
    const lean = Number(rec.playerLean) || 0;
    const favoredId = lean > 0.05 ? bId : lean < -0.05 ? aId : null;
    const base = localizeText('The {a} and {b} front at {front} never cooled. The war you left is still a war.', {
      a: name(aId), b: name(bId), front,
    });
    return favoredId
      ? `${base} ${localizeText('The ledger has it leaning {side}\'s way, and your name is on the lean.', { side: name(favoredId) })}`
      : base;
  }
  return null;
}

export function buildEndingEpilogueModel({ event, payload = {}, state } = {}) {
  const rec = postEndingOf(state);
  const mailed = event === 'mail:delivered' && payload.id === 'mail_guilt_read_back' ? payload.readback : null;
  const deliveredRecord = mailed && typeof mailed.text === 'string' && mailed.text.length > 0
    && mailed.text.length <= CONFESSIONAL_RECORD_TEXT_MAX && typeof mailed.finaleReceiptId === 'string'
    && mailed.finaleReceiptId.length > 0 && typeof mailed.offerId === 'string'
    && endingDef(mailed.choiceId) && !isSandboxId(mailed.choiceId) ? mailed : null;
  const readback = deliveredRecord || confessionalReadback(state);
  const sandbox = event === 'endgame:sandboxContinued'
    || isSandboxId(payload.choice)
    || (!payload.choice && !deliveredRecord && rec && isSandboxId(rec.choiceId));
  const id = sandbox
    ? SANDBOX_DEF.id
    : clean(payload.choice || (deliveredRecord && deliveredRecord.choiceId)
      || (rec && (rec.choiceId || rec.endingId)) || (readback && readback.choiceId));
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
    filedRecordText: isEnding ? (readback?.text || null) : null,
    warLine: endingWarLine(state),
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
      letter-spacing:.06em; color: #76d9f3;
    }
    .sf-ending-epilogue__eyebrow { font-size: 12px; margin-bottom: 14px; }
    .sf-ending-epilogue__title {
      margin: 0; max-width: 18ch; font-family: var(--mono, monospace); font-size: clamp(30px, 6vw, 62px);
      line-height: .98; letter-spacing: .025em; font-weight: 650; text-wrap: balance;
    }
    .sf-ending-epilogue__resolution {
      margin: 22px 0 0; max-width: 58ch; color: #c9d7e3; font-size: clamp(15px, 2vw, 19px); line-height: 1.55;
    }
    .sf-ending-epilogue__rule { width: 72px; height: 1px; margin: 30px 0; background: #76d9f3; opacity: .75; }
    .sf-ending-epilogue__sections { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; }
    .sf-ending-epilogue__section-title { font-size: 12px; margin-bottom: 9px; color: #89a9bc; }
    .sf-ending-epilogue__section-copy { margin: 0; color: #e1ebf2; font-size: 14px; line-height: 1.55; }
    .sf-ending-epilogue__record { grid-column: 1 / -1; }
    .sf-ending-epilogue__record .sf-ending-epilogue__section-copy { white-space: pre-wrap; overflow-wrap: anywhere; }
    .sf-ending-epilogue__objective-name { display: block; margin-bottom: 5px; color: #76d9f3; }
    .sf-ending-epilogue__dismiss {
      margin-top: 34px; min-height: 42px; padding: 9px 18px; border: 1px solid rgba(118, 217, 243, .72);
      border-radius: 3px; background: rgba(33, 107, 130, .12); color: #dff8ff;
      font: 12px var(--mono, monospace); letter-spacing:.06em; cursor: pointer;
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

  function appendFiledRecord(sections, text) {
    if (!text || sections.querySelector('.sf-ending-epilogue__record')) return;
    const record = element('section', 'sf-ending-epilogue__section sf-ending-epilogue__record');
    record.append(element('h2', 'sf-ending-epilogue__section-title', 'THE FILED RECORD, READ BACK'),
      element('p', 'sf-ending-epilogue__section-copy', text));
    sections.append(record);
  }

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
    if (model.warLine) {
      const war = element('section', 'sf-ending-epilogue__section sf-ending-epilogue__record');
      war.append(
        element('h2', 'sf-ending-epilogue__section-title', 'THE WAR YOU LEFT'),
        element('p', 'sf-ending-epilogue__section-copy', model.warLine),
      );
      sections.append(war);
    }
    appendFiledRecord(sections, model.filedRecordText);

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

  function presentReadback(payload) {
    const event = payload && payload.id === 'mail_guilt_read_back' ? 'mail:delivered' : 'endgame:finaleCompleted';
    const model = buildEndingEpilogueModel({ event, payload: payload || {}, state });
    if (!model || !model.filedRecordText || destroyed) return false;
    if (active) {
      appendFiledRecord(active.querySelector('.sf-ending-epilogue__sections'), model.filedRecordText);
      return true;
    }
    return present(event, payload || {});
  }

  if (bus && typeof bus.on === 'function') {
    for (const [event, handler] of [
      ['endgame:chosen', (payload) => present('endgame:chosen', payload)],
      ['endgame:sandboxContinued', (payload) => present('endgame:sandboxContinued', payload)],
      ['endgame:finaleCompleted', presentReadback],
      ['mail:delivered', (payload) => {
        if (payload && payload.id === 'mail_guilt_read_back') presentReadback(payload);
      }],
      ['save:loaded', () => {
        pending = null;
        dismiss();
        if (!state.mail?.delivered?.includes('mail_guilt_read_back')) presentReadback();
      }],
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
