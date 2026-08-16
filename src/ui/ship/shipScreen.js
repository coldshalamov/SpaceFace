// src/ui/ship/shipScreen.js — THE SHIP (frontend program §11.3; SCREENS_B §1).
//
// The promoted shipworks stage as a pausing in-flight screen (F2, grammar §10.5 canonical key
// table; PAUSING_SCREENS per the owner's "menus pause the world" ruling). ONE implementation with
// the dock's shipworks destination (§0.5): this module never creates a mount — it re-parents the
// shared stage instance, so exactly one WebGLRenderer serves both hosts in a session.
//
// Flight host is the same instrument minus commerce (§1.2): fleet rail inspect-only, chooser
// read-only with the unavailability reason printed, no MAKE ACTIVE, no bay backdrop. READ-ONLY on
// sim state; all verbs that mutate anything emit intents, and the commerce intents are simply not
// reachable here.
//
// Build order note (SCREENS_B §3): this is step 1 — the promotion. Steps 2–5 (CREST/STAGE/APRON
// restructure, engineering-stage adoption, handling deck, scars, capability deck) land on top.

import { ensureStylesheet as ensureStationStylesheet } from '../station/stationApp.js';
import { getSharedShipStage } from '../station/screens/shipworks.js';

// The shared stage's .sx-* vocabulary is styled by the station sheets, which the station shell
// injects on first dock. THE SHIP must not depend on a dock having happened: inject the same
// idempotent links on mount (vision-review blocker: F2 before first dock rendered unstyled).
function ensureStageStyles() {
  try { ensureStationStylesheet(); } catch (_) { /* styles best-effort; the screen still renders */ }
}

export const shipScreen = {
  id: 'ship',
  _ctx: null,
  _root: null,
  _stage: null,

  mount(rootEl, ctx) {
    this._ctx = ctx;
    this._root = rootEl;
    rootEl.id = 'sf-ship';
    // Per-screen opaque backdrop (grammar §6): a dark bay, not the shared cinematic plate, so
    // the Ship never reads as the same room as the menu.
    rootEl.classList.add('sf-ship');
    ensureStageStyles();
    this._stage = getSharedShipStage(ctx);
    rootEl.appendChild(this._stage.el);
  },

  onShow(ctx) {
    if (ctx) this._ctx = ctx;
    if (!this._stage) this._stage = getSharedShipStage(this._ctx);
    // Re-parenting beats re-creating: appendChild moves the shared node here from wherever the
    // dock last showed it (or no-op if already here), keeping canvas + WebGL context alive.
    if (this._root && this._stage.el.parentNode !== this._root) this._root.appendChild(this._stage.el);
    this._stage.setHost('flight');
    this._stage.onShow(ctx);
  },

  onHide() {
    if (this._stage) this._stage.onHide();
  },

  refresh(ctx) {
    if (ctx) this._ctx = ctx;
    if (this._stage) this._stage.refresh(ctx);
  },
};
