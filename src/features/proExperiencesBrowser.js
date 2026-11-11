import { createCeresNinthMouthPrompt } from '../ui/ceresNinthMouthPrompt.js';
import { createCeresNinthMouthVisuals } from '../render/ceresNinthMouthVisuals.js';
import { createCeresWinchingPrompt } from '../ui/ceresWinchingPrompt.js';
import { createRigWorkshopView } from './rigWorkshop/view.js';
// The production browser's existing UI and prepared-frame owners drive these adapters.
// There is no gameplay owner here: decisions are intents and all views read sim facts.
import { presentShipbreakingYardFrame, releaseShipbreakingYardPresentation } from './shipbreakingYard/browser.js';
import { createSalvageTenderPromptSystem } from './salvageTender/prompts.js';
import { updateSalvageTenderPresentation, releaseSalvageTenderPresentation } from './salvageTender/presentation.js';
import { createCounterweightCircuitPromptSystem } from './counterweightCircuit/prompts.js';
import { updateCounterweightCircuitPresentation, releaseCounterweightCircuitPresentation } from './counterweightCircuit/presentation.js';
import { mountSalvageOutfitsPresentation } from './salvageOutfits/integration.js';
import { createIndustrialDisastersPresentation } from './industrialDisasters/presentationAdapter.js';
import { createCinderglassJobPromptSystem } from './cinderglassJob/presentation.js';
import { createBreakwaterSpurPromptSystem, mountBreakwaterSpurPresentation } from './breakwaterSpur/presentation.js';
import * as THREE from 'three';

const OWNERS = new WeakMap();
const signature = offer => offer ? JSON.stringify(offer) : '';

/** Mount after promptDeck and encounterChoicePrompt. Outfits reuses its per-bus installer,
 * including the registered radio owner; the tender's prompt lives only on this browser lane. */
export function mountProExperiencesBrowser(ctx = {}) {
  const { state, bus } = ctx;
  if (!state || !bus) return null;
  OWNERS.get(state)?.destroy();
  // The full and worker presentation registries already own these adapters. UI initializes
  // before them, so borrow the registered instance and let its lifecycle initialize it once.
  // Standalone mounts without a registry retain their own prompt lifecycle.
  const registeredTender = ctx.registry?.get?.('salvageTenderPrompt');
  const registeredCircuit = ctx.registry?.get?.('counterweightCircuitPrompt');
  const registeredBreakwater = ctx.registry?.get?.('breakwaterSpurPrompt');
  const tender = registeredTender || createSalvageTenderPromptSystem();
  const circuit = registeredCircuit || createCounterweightCircuitPromptSystem();
  const breakwater = registeredBreakwater || createBreakwaterSpurPromptSystem();
  if (!registeredTender) tender.init(ctx);
  if (!registeredCircuit) circuit.init(ctx);
  if (!registeredBreakwater) breakwater.init(ctx);
  const registeredCinderglass = ctx.registry?.get?.('cinderglassJobPrompt');
  const cinderglass = registeredCinderglass || createCinderglassJobPromptSystem();
  if (!registeredCinderglass) cinderglass.init(ctx);
  const outfits = mountSalvageOutfitsPresentation(ctx);
  const ceresWinching = createCeresWinchingPrompt(ctx);
  const ninthMouth = createCeresNinthMouthPrompt(ctx);
  let ninthMouthWorld = null;
  const off = [];
  let disaster = null, rig = null, breakwaterWorld = null, scene = null, renderer = null, destroyed = false;
  let uiElapsed = 0, tenderSignature, circuitSignature, breakwaterSignature;
  const on = (event, fn) => {
    const remove = bus.on(event, fn);
    off.push(typeof remove === 'function' ? remove : () => bus.off?.(event, fn));
  };
  // Live receipts win over an older mirror. A closed choice must not reappear while
  // a queued worker command waits for its next authoritative snapshot.
  on('salvageTender:offer', offer => { tenderSignature = signature(offer); });
  on('counterweightCircuit:offer', offer => { circuitSignature = signature(offer); });
  on('breakwaterSpur:offer', offer => { breakwaterSignature = signature(offer); });
  const reset = () => { tender.close(); circuit.close(); breakwater.close(); cinderglass.close(); releaseWorld(); };
  for (const event of ['save:restoring', 'sector:exit', 'game:new', 'game:newGame']) on(event, reset);

  function releaseWorld() {
    ninthMouthWorld?.destroy(); ninthMouthWorld = null;
    disaster?.dispose(); disaster = null; rig?.destroy(); rig = null; breakwaterWorld?.destroy(); breakwaterWorld = null; scene = renderer = null;
    releaseSalvageTenderPresentation(state);
    releaseShipbreakingYardPresentation(state);
    releaseCounterweightCircuitPresentation(state);
  }
  function ensureDisaster() {
    const nextScene = state.render?.scene, nextRenderer = state.render?.renderer;
    if (!nextScene?.add) return null;
    if (disaster && (scene !== nextScene || renderer !== nextRenderer)) {
      ninthMouthWorld?.destroy(); ninthMouthWorld = null;
      disaster.dispose(); disaster = null; rig?.destroy(); rig = null; breakwaterWorld?.destroy(); breakwaterWorld = null;
    }
    if (!disaster) {
      scene = nextScene; renderer = nextRenderer;
      ninthMouthWorld = createCeresNinthMouthVisuals({ state, scene });
      disaster = createIndustrialDisastersPresentation({ ...ctx, scene, renderer });
      rig = createRigWorkshopView({ state, bus, scene });
      breakwaterWorld = mountBreakwaterSpurPresentation({ ...ctx, scene, THREE });
    }
    return disaster;
  }
  const api = {
    frame(dt, currentState = state, hudVisible = true) {
      if (destroyed || currentState !== state) return;
      ceresWinching.frame();
      ninthMouth.frame();
      outfits?.draw(currentState, hudVisible);
      cinderglass.frame(dt, currentState, hudVisible);
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
      const breakwaterOffer = state.breakwaterSpurOffer || null;
      const nextBreakwaterSignature = signature(breakwaterOffer);
      if (nextBreakwaterSignature !== breakwaterSignature) {
        breakwaterSignature = nextBreakwaterSignature;
        if (breakwaterOffer && state.mode === 'flight' && !state.ui?.docked) breakwater.offer(breakwaterOffer);
        else breakwater.close();
      }
      // Same mirror discipline for the circuit registrar's deck.
      const circuitOffer = state.counterweightCircuitOffer || null;
      const nextCircuitSignature = signature(circuitOffer);
      if (nextCircuitSignature !== circuitSignature) {
        circuitSignature = nextCircuitSignature;
        if (circuitOffer && state.mode === 'flight' && !state.ui?.docked) circuit.offer(circuitOffer);
        else circuit.close();
      }
    },
    present(alpha = 1) {
      if (destroyed) return;
      ensureDisaster()?.update(alpha);
      ninthMouthWorld?.update(alpha);
      rig?.frame(1 / 60, state);
      breakwaterWorld?.update(alpha);
      updateCounterweightCircuitPresentation(state, bus);
    },
    releaseWorld,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const remove of off) remove();
      off.length = 0;
      if (registeredTender) tender.close(); else tender.destroy();
      if (registeredCircuit) circuit.close(); else circuit.destroy();
      if (registeredBreakwater) breakwater.close(); else breakwater.destroy();
      if (registeredCinderglass) cinderglass.close(); else cinderglass.destroy();
      ceresWinching.destroy();
      ninthMouth.destroy();
      outfits?.destroy(); releaseWorld();
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
