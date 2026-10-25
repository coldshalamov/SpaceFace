import { createRigWorkshopView } from './rigWorkshop/view.js';
// The production browser's existing UI and prepared-frame owners drive these adapters.
// There is no gameplay owner here: decisions are intents and all views read sim facts.
import { presentShipbreakingYardFrame, releaseShipbreakingYardPresentation } from './shipbreakingYard/browser.js';
import { createSalvageTenderPromptSystem } from './salvageTender/prompts.js';
import { updateSalvageTenderPresentation, releaseSalvageTenderPresentation } from './salvageTender/presentation.js';
import { mountSalvageOutfitsPresentation } from './salvageOutfits/integration.js';
import { createIndustrialDisastersPresentation } from './industrialDisasters/presentationAdapter.js';

const OWNERS = new WeakMap();
const signature = offer => offer ? JSON.stringify(offer) : '';

/** Mount after promptDeck and encounterChoicePrompt. Outfits reuses its per-bus installer,
 * including the registered radio owner; the tender's prompt lives only on this browser lane. */
export function mountProExperiencesBrowser(ctx = {}) {
  const { state, bus } = ctx;
  if (!state || !bus) return null;
  OWNERS.get(state)?.destroy();
  const tender = createSalvageTenderPromptSystem();
  tender.init(ctx);
  const outfits = mountSalvageOutfitsPresentation(ctx);
  const off = [];
  let disaster = null, rig = null, scene = null, renderer = null, destroyed = false;
  let uiElapsed = 0, tenderSignature;
  const on = (event, fn) => {
    const remove = bus.on(event, fn);
    off.push(typeof remove === 'function' ? remove : () => bus.off?.(event, fn));
  };
  // Live receipts win over an older mirror. A closed choice must not reappear while
  // a queued worker command waits for its next authoritative snapshot.
  on('salvageTender:offer', offer => { tenderSignature = signature(offer); });
  const reset = () => { tender.close(); releaseWorld(); };
  for (const event of ['save:restoring', 'sector:exit', 'game:new', 'game:newGame']) on(event, reset);

  function releaseWorld() {
    disaster?.dispose(); disaster = null; rig?.destroy(); rig = null; scene = renderer = null;
    releaseSalvageTenderPresentation(state);
    releaseShipbreakingYardPresentation(state);
  }
  function ensureDisaster() {
    const nextScene = state.render?.scene, nextRenderer = state.render?.renderer;
    if (!nextScene?.add) return null;
    if (disaster && (scene !== nextScene || renderer !== nextRenderer)) {
      disaster.dispose(); disaster = null; rig?.destroy(); rig = null;
    }
    if (!disaster) {
      scene = nextScene; renderer = nextRenderer;
      disaster = createIndustrialDisastersPresentation({ ...ctx, scene, renderer });
      rig = createRigWorkshopView({ state, bus, scene });
    }
    return disaster;
  }
  const api = {
    frame(dt, currentState = state, hudVisible = true) {
      if (destroyed || currentState !== state) return;
      outfits?.draw(currentState, hudVisible);
      // Domain mirrors recover offers across a worker attach or UI remount. Ordinary
      // main-sim events remain the immediate route, with no registry-facade calls.
      uiElapsed += Number.isFinite(dt) && dt > 0 ? dt : 0;
      if (uiElapsed < 0.125) return;
      uiElapsed %= 0.125;
      const offer = state.salvageTenderOffer || null;
      const nextSignature = signature(offer);
      if (nextSignature !== tenderSignature) {
        tenderSignature = nextSignature;
        if (offer && state.mode === 'flight' && !state.ui?.docked) tender.offer(offer);
        else tender.close();
      }
    },
    present(alpha = 1) {
      if (destroyed) return;
      ensureDisaster()?.update(alpha);
      rig?.frame(1 / 60, state);
    },
    releaseWorld,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const remove of off) remove();
      off.length = 0;
      tender.destroy(); outfits?.destroy(); releaseWorld();
      if (OWNERS.get(state) === api) OWNERS.delete(state);
    },
  };
  OWNERS.set(state, api);
  // Subscribe the incident channel before its first distant distress signal. Its view
  // creates authored bodies only when the existing status owner publishes them.
  ensureDisaster();
  return api;
}

/** Called after prepareFrame and before drawPreparedFrame, on the one current scene. */
export function presentProExperiencesFrame(state, bus, alpha = 1) {
  if (!state || state.mode !== 'flight') return;
  let error = null;
  for (const present of [
    () => presentShipbreakingYardFrame(state),
    () => updateSalvageTenderPresentation(state, bus),
    () => OWNERS.get(state)?.present(alpha),
  ]) {
    try { present(); } catch (cause) { error ||= cause; }
  }
  // A cosmetic failure must not suppress a sibling feature or the normal draw/HUD.
  if (error) throw error;
}

export function releaseProExperiencesPresentation(state) {
  OWNERS.get(state)?.releaseWorld();
  releaseSalvageTenderPresentation(state);
  releaseShipbreakingYardPresentation(state);
}
