// The Stage — EC-G16 "one glass" / packet G16-01 (design/program/fleet/drafts/G16-one-glass.md §6).
// One host for every transient popup surface. Four named slots hold the game's transient chrome:
//
//   dialog — the centre dialog/card slot; owns #modal-backdrop and #screens (screenManager.js).
//   banner — the top-centre annunciator strip; owns #alerts (alerts.js).
//   feed   — the receipt lane; owns #toasts (toasts.js). Lives inside #hud so the mobile seats'
//            `#hud #toasts` rules keep binding; at most three stacked items are visible.
//   prompt — the flight decision column; owns #sf-prompt-deck (promptDeck.js).
//
// The slot containers are layout-transparent divs in index.html: the hosts inside keep their
// own ids, z-order, accessibility and pointer rules. The Stage's own job is the door — one call,
// `show(slot, content)`, which mounts at most the slot's visible capacity and queues the rest:
// severity first (danger > warning > info — the alert severity ranking), then first-come within
// a priority. Two things can never overlap a slot because the second item never mounts until
// the first clears. The HUD's fixed panels (objective, contacts) stay in the HUD; radials and
// world-anchored markers are separate surfaces (packet lead answers).
//
// Every item shown through the Stage carries the shared kit frame (.sf-stage__item + .dp-glass —
// the deckplate glass face, not a new visual design), and enters through the kit motion seam:
// settle() for ordinary motion, cut() when the player asked for reduced motion.

import { SEV_RANK } from './alerts.js';
import { cut, reducedMotion, settle } from './kit/motion.js';

// Each slot names the container element that hosts it in index.html, the parent that container
// mounts under, its visible capacity, and the kit settle edge its items enter from. A slot whose
// host already owns a flex lane (banner -> #alerts, feed -> #toasts) names it as `lane`: stage
// items join that lane's own column, so a stage item and a host's pills stack with the lane's gap
// instead of two absolutely placed layers drawing on one another. feed's
// parent is #hud — the receipt lane's real mount point; everything else mounts under #ui-root.
export const STAGE_SLOTS = Object.freeze({
  dialog: Object.freeze({ id: 'sf-stage-dialog', parent: 'ui-root', maxVisible: 1, enter: 'bottom' }),
  banner: Object.freeze({ id: 'sf-stage-banner', parent: 'ui-root', maxVisible: 1, enter: 'top', lane: 'alerts' }),
  feed: Object.freeze({ id: 'sf-stage-feed', parent: 'hud', maxVisible: 3, enter: 'bottom', lane: 'toasts' }),
  prompt: Object.freeze({ id: 'sf-stage-prompt', parent: 'ui-root', maxVisible: 1, enter: 'right' }),
});

// Toast and alert vocabularies say 'warn' and 'error' where the stage contract says 'warning'
// and 'danger'; both land on the same rank.
const SEVERITY_ALIASES = Object.freeze({ warning: 'warn', error: 'danger', good: 'info', success: 'info' });

/** Priority for a stage item, reusing the alerts severity ranking (danger > warning > info). */
export function stagePriority(severity) {
  const key = SEVERITY_ALIASES[severity] || severity || 'info';
  const rank = SEV_RANK[key];
  return Number.isFinite(rank) ? rank : SEV_RANK.info;
}

// Popups that receive no ctx (module-level confirm(), mountWhyReveal(), the hud-owned tutorial
// card and stunt callout) reach the door through the same accessor pattern getPromptDeck() uses.
// createStage publishes the live instance; destroy() clears it, so a torn-down stage can never
// seat a popup on a dead host.
let activeStage = null;

/** The live Stage, or null before ui init / after destroy / on a page without the slot hosts. */
export function getStage() {
  return activeStage;
}

function inertStage() {
  const known = (name) => { if (!(name in STAGE_SLOTS)) throw new RangeError(`unknown stage slot "${name}"`); };
  return {
    show: (name) => { known(name); return null; },
    clear: (name) => { known(name); return false; },
    slotEl: (name) => { known(name); return null; },
    names: () => Object.keys(STAGE_SLOTS),
    visible: (name) => { known(name); return []; },
    queued: (name) => { known(name); return []; },
    has: (name) => { known(name); return false; },
    destroy() {},
  };
}

export function createStage(ctx = {}) {
  const doc = ctx.document || (typeof document !== 'undefined' ? document : null);
  if (!doc || !doc.createElement) return inertStage();

  const slots = new Map();
  for (const [name, def] of Object.entries(STAGE_SLOTS)) {
    slots.set(name, { name, def, el: null, flow: null, visible: [], queue: [], seq: 0 });
  }
  const slot = (name) => {
    const found = slots.get(name);
    if (!found) throw new RangeError(`unknown stage slot "${name}"`);
    return found;
  };

  function parentFor(def) {
    if (def.parent === 'hud') {
      return doc.getElementById('hud') || doc.getElementById('ui-root') || doc.body || null;
    }
    return doc.getElementById('ui-root') || doc.body || null;
  }

  /**
   * The slot's container element — the authored div in index.html, or one built on demand so a
   * host page that lacks the markup still lands its popups inside a named slot. Re-attaches to
   * its parent when that parent's owner wiped it: createHud's innerHTML='' clears the feed slot
   * along with the receipt lane it holds, and the next access seats it again.
   */
  function slotEl(name) {
    const s = slot(name);
    let el = s.el || doc.getElementById(s.def.id);
    if (!el) {
      el = doc.createElement('div');
      el.id = s.def.id;
      el.className = 'sf-stage-slot';
      el.setAttribute('data-stage-slot', name);
    }
    const parent = parentFor(s.def);
    if (parent && el.parentNode !== parent) parent.appendChild(el);
    s.el = el;
    return el;
  }

  /** The lane stage items mount into, inside the slot container. */
  function flowFor(s) {
    if (!s.flow) {
      s.flow = doc.createElement('div');
      s.flow.className = 'sf-stage__flow';
      s.flow.setAttribute('data-stage-flow', s.name);
    }
    const slotHost = slotEl(s.name);
    const lane = s.def.lane ? doc.getElementById(s.def.lane) : null;
    const host = lane && lane.nodeType === 1 && slotHost.contains?.(lane) !== false ? lane : slotHost;
    if (s.flow.parentNode !== host) host.appendChild(s.flow);
    return s.flow;
  }

  function normalizeContent(content) {
    if (content == null) return null;
    // A DOM element mounts as-is inside the frame; text gets a span so the frame still carries it.
    if (typeof content === 'object' && (content.nodeType === 1 || content.tagName
      || typeof content.appendChild === 'function')) return content;
    const text = doc.createElement('span');
    text.className = 'sf-stage__text';
    text.textContent = String(content);
    return text;
  }

  function mount(s, rec) {
    rec.visible = true;
    s.visible.push(rec);
    flowFor(s).appendChild(rec.el);
    try {
      if (reducedMotion()) cut(null, rec.el, { state: 'stage-show' });
      else settle(rec.el, { from: s.def.enter, state: 'stage-show' });
    } catch (_) { /* motion is cosmetic — the item still shows without it */ }
  }

  function promote(s) {
    while (s.visible.length < s.def.maxVisible && s.queue.length) {
      mount(s, s.queue.shift());
    }
  }

  function removeRec(s, rec, { promoteQueue = true } = {}) {
    const vi = s.visible.indexOf(rec);
    if (vi >= 0) {
      s.visible.splice(vi, 1);
      rec.visible = false;
      if (rec.el && rec.el.parentNode) rec.el.parentNode.removeChild(rec.el);
      if (promoteQueue) promote(s);
      return true;
    }
    const qi = s.queue.indexOf(rec);
    if (qi >= 0) { s.queue.splice(qi, 1); return true; }
    return false;
  }

  /**
   * The door: show content in a named slot. Returns a handle whose clear() releases the slot.
   * Re-showing the same id replaces the earlier record — a refreshed warning is one popup, not
   * two. Items past the slot's visible capacity queue by priority, then arrival order.
   */
  function show(name, content, opts = {}) {
    const s = slot(name);
    const seq = ++s.seq;
    const id = String(opts.id || `sf-stage-${name}-${seq}`);
    // A refresh keeps its seat: freeing it must not promote a queued rival ahead of the
    // replacement, so the swap releases the seat without promoting.
    for (const old of [...s.visible, ...s.queue]) if (old.id === id) removeRec(s, old, { promoteQueue: false });

    const rec = { id, seq, severity: opts.severity || 'info', el: null, visible: false };
    const frame = doc.createElement('div');
    const sev = SEVERITY_ALIASES[rec.severity] || rec.severity;
    frame.className = `sf-stage__item sf-stage__item--${sev in SEV_RANK ? sev : 'info'} dp-glass`;
    frame.setAttribute('data-stage-item', id);
    const body = normalizeContent(content);
    if (body) frame.appendChild(body);
    rec.el = frame;

    if (s.visible.length < s.def.maxVisible) {
      mount(s, rec);
    } else {
      const rank = stagePriority(rec.severity);
      let at = s.queue.length;
      for (let i = 0; i < s.queue.length; i++) {
        const q = s.queue[i];
        if (rank > stagePriority(q.severity) || (rank === stagePriority(q.severity) && rec.seq < q.seq)) { at = i; break; }
      }
      s.queue.splice(at, 0, rec);
    }

    return {
      id, slot: name, el: frame,
      get visible() { return rec.visible; },
      get queued() { return s.queue.includes(rec); },
      clear() { return removeRec(s, rec); },
    };
  }

  /** Release a slot item: the visible head, or the named record. A freed seat promotes the queue. */
  function clear(name, id) {
    const s = slot(name);
    const rec = id != null
      ? [...s.visible, ...s.queue].find((r) => r.id === String(id))
      : s.visible[0];
    return rec ? removeRec(s, rec) : false;
  }

  const api = {
    show, clear, slotEl,
    names: () => [...slots.keys()],
    visible: (name) => slot(name).visible.map((r) => r.id),
    queued: (name) => slot(name).queue.map((r) => r.id),
    has: (name) => { const s = slot(name); return s.visible.length + s.queue.length > 0; },
    destroy() {
      if (activeStage === api) activeStage = null;
      for (const s of slots.values()) {
        for (const rec of [...s.visible, ...s.queue]) {
          if (rec.el && rec.el.parentNode) rec.el.parentNode.removeChild(rec.el);
        }
        s.visible.length = 0;
        s.queue.length = 0;
        if (s.flow && s.flow.parentNode) s.flow.parentNode.removeChild(s.flow);
        s.flow = null;
      }
    },
  };
  // Resolve the authored containers up front so a page missing the markup gets named slots
  // created before any host asks for one.
  for (const name of slots.keys()) slotEl(name);
  activeStage = api;
  return api;
}
