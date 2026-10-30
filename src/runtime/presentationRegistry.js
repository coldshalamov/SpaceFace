// Main-thread presentation owners for the whole-simulation worker lane.
import { resolveRuntimeManifest } from './resolveRuntimeManifest.js';
import { DEFAULT_RUNTIME_PROFILE_ID } from './runtimeProfiles.js';
import { isNodeSafeSystemId, getSystemCapability } from './authoritativeSystemManifest.js';
import { bindRuntimeToState } from './bindRuntimeToState.js';
import { applyFeatureConfigToMaps } from '../data/featureFlags.js';
import { createSystemLifecycle, TEARDOWN_DEPENDENCIES } from './registryLifecycle.js';
import { createLaneSystemFacade } from './laneSystemFacades.js';
import { createGamepad } from '../systems/gamepad.js';
import { laneKeepalive } from '../core/simLaneCommands.js';
import { ensurePerfRuntime, perfNow } from '../core/perfRuntime.js';
import { runRenderUpdatePhase } from '../core/renderUpdatePhase.js';
import { render } from '../render/renderer.js';
import { vfx } from '../render/vfx.js';
import { feel } from '../render/feel.js';
import { audio } from '../audio/audioSystem.js';
import { ui } from '../ui/uiRoot.js';
import { survivalHud } from '../ui/survivalHud.js';
import { swarmJuiceHud } from '../ui/swarmJuiceHud.js';
import { crucibleFocus } from '../ui/crucibleFocus.js';
import { lastShiftPrompt } from '../ui/lastShiftPrompt.js';
import { redKitePrompt } from '../ui/redKitePrompt.js';
import { ilexArkPrompt } from '../ui/ilexArkPrompt.js';
import { mothlightPrompt } from '../ui/mothlightPrompt.js';
import { palletJackPrompt } from '../ui/palletJackPrompt.js';
import { towlineTablePrompt } from '../ui/towlineTablePrompt.js';
import { borrowedVoicePrompt } from '../ui/borrowedVoicePrompt.js';
import { borrowedSunPrompt } from '../ui/borrowedSunPrompt.js';
import { masslineHud } from '../ui/masslineHud.js';
import { massSeedHud } from '../ui/massSeedHud.js';
import { fieldHud } from '../ui/fieldHud.js';
import { gyreHud } from '../ui/gyreHud.js';
import { pylonHud } from '../ui/pylonHud.js';
import { planetHud } from '../ui/planetHud.js';
import { miningHud } from '../ui/miningHud.js';
import { createShipbreakingYardBrowserEntries } from '../features/shipbreakingYard/browser.js';
import { createSalvageTenderPromptSystem } from '../features/salvageTender/prompts.js';
import { salvageOutfitsPrompt } from '../features/salvageOutfits/integration.js';

export function createPresentationRegistry(ctx) {
  const gameplay = ctx.state?.settings?.gameplay || {};
  const tactical = gameplay.aiBackend === 'sg06-tactical' && gameplay.physicsBackend === 'rapier-dynamic';
  const v3 = gameplay.flightBackend === 'v3' && gameplay.physicsBackend === 'rapier-dynamic';
  // Slot identities are descriptive only; all simulation owners live in the worker.
  const resolved = resolveRuntimeManifest({
    profileId: gameplay.runtimeProfile || DEFAULT_RUNTIME_PROFILE_ID,
    slots: { aiSlot: { name: tactical ? 'tacticalAI' : 'ai' }, flightSlot: { name: 'flight' },
      aiBackend: tactical ? 'sg06-tactical' : 'legacy', flightBackend: v3 ? 'v3' : 'legacy' },
  });
  if (ctx.applyRuntimeFeatures !== false) applyFeatureConfigToMaps(resolved.features);
  bindRuntimeToState(ctx.state, resolved, resolved);
  const entries = [
    ...createShipbreakingYardBrowserEntries(),
    ['salvageTenderPrompt', createSalvageTenderPromptSystem()],
    ['salvageOutfitsPrompt', Object.create(salvageOutfitsPrompt)],
    ...[lastShiftPrompt, redKitePrompt, ilexArkPrompt, mothlightPrompt, palletJackPrompt,
      towlineTablePrompt, borrowedVoicePrompt, borrowedSunPrompt, masslineHud, massSeedHud,
      fieldHud, gyreHud, pylonHud, planetHud, miningHud, survivalHud, swarmJuiceHud,
      crucibleFocus, render, vfx, feel, audio, ui].map(system => [system.name, system]),
  ];
  const lookup = new Map(entries);
  const isPresentation = id => !isNodeSafeSystemId(id) || getSystemCapability(id).phase === 'platform'
    || getSystemCapability(id).domGuarded === true;
  const presentationIds = resolved.authoritativeSystemIds.filter(isPresentation);
  const systems = presentationIds.map(id => {
    const system = lookup.get(id);
    if (!system) throw new Error(`Missing presentation registry owner: ${id}`);
    return system;
  });
  const byName = new Map(systems.map(system => [system.name, system]));
  const simOwned = new Set(resolved.authoritativeSystemIds.filter(id => isNodeSafeSystemId(id)
    && getSystemCapability(id).phase !== 'platform' && !getSystemCapability(id).domGuarded));
  const facade = createLaneSystemFacade(ctx);
  const hud = systems.filter(system => getSystemCapability(system.name).domGuarded === true
    && typeof system.update === 'function');
  const hudErrors = new Map();
  ctx.gamepad = createGamepad(ctx, { connectionEvents: false, laneHaptics: true });
  const lifecycle = createSystemLifecycle({ systems, context: ctx, dependencies: TEARDOWN_DEPENDENCIES });
  return {
    systems, updateOrder: [], runtimeManifest: resolved, ctx,
    get(name) { return simOwned.has(name) ? facade(name) : byName.get(name); },
    init: lifecycle.init, initAsync: lifecycle.initAsync, destroy: lifecycle.destroy,
    keepalive(_dt = 0, wallDt = _dt) { laneKeepalive(wallDt); },
    renderUpdate(alpha, frameDt, presentationFrame = null) {
      const state = ctx.state, perf = ensurePerfRuntime(state);
      try {
        return runRenderUpdatePhase({ state, bus: ctx.bus, render, vfx, feel, ui, alpha, frameDt,
          presentationFrame, recordPhase: (name, ms) => perf.recordPhase(name, ms), now: perfNow });
      } finally {
        for (const system of hud) {
          try { system.update(frameDt, state); }
          catch (error) {
            const count = (hudErrors.get(system.name) || 0) + 1;
            hudErrors.set(system.name, count);
            if (count <= 10) console.error(`[loop] ${system.name} presentation update error:`, error);
            else if (count === 11) console.error(`[loop] further ${system.name} presentation errors suppressed`);
          }
        }
        try { state.render?.diagnostics?.update?.(frameDt); }
        catch (error) {
          const n = (perf._diagErrorLogCount = (perf._diagErrorLogCount || 0) + 1);
          if (n <= 20) console.error('[loop] diagnostics error:', error);
          else if (n === 21) console.error('[loop] further diagnostics errors suppressed');
        }
      }
    },
  };
}
