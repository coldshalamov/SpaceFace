// Importable integration adapters for the deliberately scoped candidate. Shared registries,
// worker mirrors, save envelope, and renderer imports are applied by the local integrator.
import { createSalvageOutfitsPresentation, createSalvageOutfitsOverlay,
  SALVAGE_OUTFITS_MAIN_TO_SIM_EVENTS, SALVAGE_OUTFITS_PRESENTATION_EVENTS } from './presentation.js';
import { salvageOutfitMeetingPresent } from './readModel.js';
import { SALVAGE_OUTFITS_LIMITS } from './catalog.js';
export { captureSalvageOutfits, restoreSalvageOutfits, normalizeSalvageOutfits,
  freshSalvageOutfits } from './persistence.js';
export { createSalvageOutfitsReadModel, writeSalvageOutfitsReadModel,
  getSalvageOutfitsReadModel, salvageOutfitMeetingPresent } from './readModel.js';

export const SALVAGE_OUTFITS_INTEGRATION = Object.freeze({
  owner: 'salvageOutfits',
  ownerImport: 'src/features/salvageOutfits/index.js',
  promptOwner: 'salvageOutfitsPrompt',
  promptImport: 'src/features/salvageOutfits/integration.js',
  initBefore: 'npcJobsRuntime',
  updateAfter: 'borrowedVoice',
  updateBefore: 'npcJobsRuntime',
  clock: 'near',
  promptCapability: Object.freeze({ nodeSafe: true, phase: 'platform', capability: 'hud' }),
  saveKey: 'salvageOutfits',
  domainMirrorKey: 'salvageOutfits',
  mainToSimEvents: SALVAGE_OUTFITS_MAIN_TO_SIM_EVENTS,
  presentationEvents: SALVAGE_OUTFITS_PRESENTATION_EVENTS,
  uiMount: 'mountSalvageOutfitsPresentation',
  uiHost: 'src/ui/uiRoot.js',
  encounterImport: 'src/data/encounters/8204-pro-salvage-outfits.js',
});

const installed = new WeakMap();

/** One presenter per main-thread bus. Calling again may attach its optional render overlay;
 * it never subscribes a second prompt or radio producer. Pass a separate 2D overlay canvas,
 * not the game's WebGL canvas. The host owns placement, resize, projection, and draw cadence.
 */
export function installSalvageOutfitsPresentation(ctx = {}) {
  const bus = ctx.bus;
  if (!bus || typeof bus !== 'object') throw new TypeError('Salvage outfit integration needs a bus');
  const previous = installed.get(bus);
  if (previous) {
    if (ctx.overlayCanvas && ctx.worldToScreen) previous.attachOverlay(ctx);
    previous.rehydrate();
    return previous;
  }
  // On the whole-sim lane the node-safe adapter queues radio inside the worker, alongside
  // voiceArbiter. This main-thread mount consumes offers and already-arbitrated audio receipts.
  const radioEnabled = ctx.radioEnabled ?? !(typeof document !== 'undefined' && ctx.simLane === 'worker');
  const prompt = createSalvageOutfitsPresentation({ ...ctx, radioEnabled, voice: ctx.helpers?.voice }), off = [];
  let overlay = null, destroyed = false;
  const stateOf = () => typeof ctx.state === 'function' ? ctx.state() : ctx.state;

  function rehydrate() {
    if (destroyed) return;
    const state = stateOf();
    if (state?.mode !== 'flight' || state?.ui?.docked) return;
    const meetings = state?.salvageOutfits?.meetings;
    const player = state.entities?.get?.(state.playerId);
    if (!player?.pos) return;
    for (const id in meetings) {
      const meeting = meetings[id];
      if (!meeting || meeting.sectorId !== state.world?.currentSectorId
        && !salvageOutfitMeetingPresent(state, meeting)) continue;
      if (Math.hypot(player.pos.x - meeting.anchor.x, player.pos.z - meeting.anchor.z)
        > SALVAGE_OUTFITS_LIMITS.offerRange) continue;
      const offer = meeting.offer;
      // Only replay complete producer-authored terms. Presentation never invents prices,
      // enables an invalid bargain, or silently turns an old agreement into a new offer.
      if (offer && (offer.id || offer.offerId) && Array.isArray(offer.choices)) {
        prompt.show({ ...offer, meetingId: meeting.id, offerId: offer.id || offer.offerId });
      }
    }
  }
  const api = {
    prompt,
    rehydrate,
    attachOverlay(options) {
      if (destroyed || overlay) return overlay;
      if (!options.overlayCanvas || typeof options.worldToScreen !== 'function') return null;
      overlay = createSalvageOutfitsOverlay({ canvas: options.overlayCanvas,
        state: stateOf, worldToScreen: options.worldToScreen, colors: options.colors,
        pixelRatio: options.pixelRatio });
      return overlay;
    },
    detachOverlay() { overlay?.destroy(); overlay = null; },
    draw() { return overlay?.draw(); },
    newGame() { prompt.clear(); },
    destroy() {
      if (destroyed) return;
      destroyed = true; prompt.destroy(); overlay?.destroy();
      off.splice(0).forEach(remove => remove()); installed.delete(bus);
    },
  };
  installed.set(bus, api);
  for (const event of ['save:loaded', 'sector:enter', 'dock:undocked']) {
    const remove = bus.on(event, rehydrate);
    off.push(typeof remove === 'function' ? remove : () => bus.off?.(event, rehydrate));
  }
  if (ctx.overlayCanvas && ctx.worldToScreen) api.attachOverlay(ctx);
  rehydrate();
  return api;
}

/** Event-only registered adapter, following lastShiftPrompt/towlineTablePrompt conventions. */
export const salvageOutfitsPrompt = {
  name: 'salvageOutfitsPrompt',
  init(ctx) {
    this._salvageOutfitsPresentation?.destroy();
    this._salvageOutfitsBus = ctx.bus;
    this._salvageOutfitsPresentation = installSalvageOutfitsPresentation(ctx);
  },
  newGame() { installed.get(this._salvageOutfitsBus)?.newGame(); },
  destroy() {
    installed.get(this._salvageOutfitsBus)?.destroy();
    this._salvageOutfitsPresentation = null; this._salvageOutfitsBus = null;
  },
};

/** Existing uiRoot host seam. The host calls draw from its frame and destroy on teardown;
 * this mount adds no loop, controls, gameplay clock, CSS dependency, or state mutation.
 * Keep ctx.simLane: it selects the one radio producer on the whole-sim worker path.
 */
export function mountSalvageOutfitsPresentation(ctx = {}) {
  const { root, bus, helpers } = ctx;
  if (typeof document === 'undefined' || !root?.appendChild || !bus) return null;
  const ownsPresenter = !installed.has(bus);
  const api = installSalvageOutfitsPresentation(ctx);
  const canvas = document.createElement('canvas');
  canvas.className = 'sf-salvage-outfits-overlay';
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%',
    pointerEvents: 'none' });
  root.appendChild(canvas);
  let dirty = true, destroyed = false, dpr = 1;
  const bounds = { left: 0, top: 0, width: 1, height: 1 };
  const markDirty = () => { dirty = true; };
  let observer = null, windowResize = false;
  if (typeof ResizeObserver === 'function') {
    observer = new ResizeObserver(markDirty); observer.observe(root);
  } else if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('resize', markDirty); windowResize = true;
  }
  function syncSize() {
    const rect = root.getBoundingClientRect?.();
    bounds.left = Number(rect?.left) || 0; bounds.top = Number(rect?.top) || 0;
    bounds.width = Math.max(1, Number(rect?.width) || root.clientWidth || 1);
    bounds.height = Math.max(1, Number(rect?.height) || root.clientHeight || 1);
    dpr = Math.max(1, Math.min(3, Number(globalThis.devicePixelRatio) || 1));
    const width = Math.round(bounds.width * dpr), height = Math.round(bounds.height * dpr);
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    dirty = !observer && !windowResize;
  }
  syncSize();
  const world = { x: 0, y: 0, z: 0 }, screen = { x: 0, y: 0, onScreen: false };
  function project(point, out) {
    world.x = point.x; world.z = point.z;
    const p = helpers?.worldToScreen?.(world, screen);
    if (!p || p.onScreen === false || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
    out.x = p.x - bounds.left; out.y = p.y - bounds.top;
    return out;
  }
  api.attachOverlay({ overlayCanvas: canvas, worldToScreen: project,
    pixelRatio: () => dpr, colors: ctx.colors });
  return {
    canvas,
    draw(currentState, hudVisible = true) {
      if (destroyed) return;
      const state = currentState || (typeof ctx.state === 'function' ? ctx.state() : ctx.state);
      canvas.hidden = !hudVisible || state?.mode !== 'flight' || state?.ui?.docked === true;
      if (canvas.hidden) return;
      if (dirty) syncSize();
      api.draw();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true; observer?.disconnect();
      if (windowResize) window.removeEventListener('resize', markDirty);
      api.detachOverlay();
      if (ownsPresenter) api.destroy();
      canvas.remove();
    },
  };
}
