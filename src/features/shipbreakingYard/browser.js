import { createShipbreakingYardPresentation } from './presentation.js';
import { createShipbreakingYardAudio } from './audio.js';
import { createShipbreakingYardRenderer } from './render.js';
import { projectShipbreakingYardView } from './bridge.js';

// One browser driver per registry state; no global live simulation or deck closure.
const PRESENTERS = new WeakMap();
const hiddenView = () => ({ visible: false, jobs: [] });

/** Main-thread lifecycle adapter for either simulation lane. It reads projected facts
 * and submits intents to the existing bus; it never reaches across a worker facade. */
export function createShipbreakingYardBrowser({ deckProvider } = {}) {
  return {
    name: 'shipbreakingYardBrowser',
    init(ctx) {
      this.destroy();
      this._state = ctx.state; this._bus = ctx.bus; this._subscriptions = [];
      this._view = null; this._renderer = null;
      this._presentation = createShipbreakingYardPresentation(deckProvider ? { deckProvider } : {});
      this._audio = createShipbreakingYardAudio();
      this._presentation.init(ctx); this._audio.init(ctx);
      PRESENTERS.set(ctx.state, this);
      const on = (event, listener) => {
        // View/lifecycle records must retain event order. Deferring a sector reset to
        // the presentation queue could erase a later valid offer or show an old view.
        // Only GPU work waits for frame(); the existing mixer schedules playback.
        const off = ctx.bus.on(event, listener);
        this._subscriptions.push(typeof off === 'function' ? off : () => ctx.bus.off?.(event, listener));
      };
      on('shipbreakingYard:view', view => { this._view = projectShipbreakingYardView(view); });
      for (const event of ['save:restoring', 'sector:exit', 'dock:docked', 'run:ended']) on(event, () => this.reset());
      on('game:new', () => this.newGame());
    },
    frame(state = this._state) {
      if (state !== this._state || !state?.render?.scene) return false;
      if (!this._renderer) this._renderer = createShipbreakingYardRenderer({
        readView: s => this._view || s.shipbreakingYardView || hiddenView(),
      });
      this._renderer.update(state);
      return true;
    },
    reset() {
      this._view = hiddenView(); this._renderer?.reset();
      this._presentation?.reset(); this._audio?.newGame();
    },
    newGame() { this.reset(); },
    destroy() {
      for (const off of this._subscriptions || []) off(); this._subscriptions = [];
      this._presentation?.destroy(); this._audio?.destroy(); this._renderer?.dispose();
      if (this._state && PRESENTERS.get(this._state) === this) PRESENTERS.delete(this._state);
      this._presentation = this._audio = this._renderer = this._state = this._bus = this._view = null;
    },
  };
}

/** Spread into the browser registry lookup only. Not imported by Node factory tables. */
export function createShipbreakingYardBrowserEntries() {
  return [['shipbreakingYardBrowser', createShipbreakingYardBrowser()]];
}

/** Call after render.prepareFrame and before drawPreparedFrame, beside bomb presentation. */
export function presentShipbreakingYardFrame(state) {
  return PRESENTERS.get(state)?.frame(state) || false;
}

/** Optional early-release hook when flight presentation is discarded. Lifecycle destroy
 * also disposes GPU resources and listeners; a later flight frame can create a fresh mesh. */
export function releaseShipbreakingYardPresentation(state) {
  const presenter = PRESENTERS.get(state);
  if (!presenter) return false;
  presenter._renderer?.dispose(); presenter._renderer = null;
  return true;
}

