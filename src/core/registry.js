// System registry: holds every system, runs init in registration order, runs the sim UPDATE_ORDER
// each step (§2.3), and the render-phase systems each frame. main.js builds it with the ctx.
import { core } from './coreSystem.js';
import { physics } from './physics.js';
import { input } from '../systems/input.js';
import { autoTargetAssist } from '../systems/autoTargetAssist.js';
import { scanner } from '../systems/scanner.js';
import { aiPorts } from '../systems/aiPorts.js';
import { ai } from '../systems/ai.js';
import { createTacticalAISystem } from '../systems/tacticalAI.js';
import { aiEncounter } from '../systems/aiEncounter.js';
import { actions } from '../systems/actions.js';
import { flight } from '../systems/flight.js';
import { flightV3 } from '../systems/flightV3.js';
import { cruise } from '../systems/cruise.js';
import { weapons } from '../systems/weapons.js';
import { countermeasures } from '../systems/countermeasures.js';
import { combat } from '../systems/combat.js';
import { tetherGameplay } from '../systems/tetherGameplay.js';
import { masslineTelemetry } from '../systems/masslineTelemetry.js';
import { masslineThreats } from '../systems/masslineThreats.js';
import { masslineImpacts } from '../systems/masslineImpacts.js';
import { impulseCharges } from '../systems/impulseCharges.js';
import { mining } from '../systems/mining.js';
import { cargo } from '../systems/cargo.js';
import { economy } from '../systems/economy.js';
import { automation } from '../systems/automation.js';
import { wingmen } from '../systems/wingmen.js';
import { world } from '../systems/world.js';
import { factions } from '../systems/factions.js';
import { sectorSim } from '../systems/sectorSim.js';   // ADR-0002 / V2 §33 — offscreen stat sim
import { missions } from '../systems/missions.js';
import { story } from '../systems/story.js';
import { scenarioRuntime } from '../systems/scenarioRuntime.js';
import { presentationOrchestrator } from '../systems/presentationOrchestrator.js';
import { presentationAdapters } from '../systems/presentationAdapters.js';
import { ships } from '../systems/ships.js';
import { crafting } from '../systems/crafting.js';
import { heat } from '../systems/heat.js';
import { traffic } from '../systems/traffic.js';
import { drill } from '../systems/drill.js';
import { intervention } from '../systems/intervention.js';
import { claims } from '../systems/claims.js';
import { beacons } from '../systems/beacons.js';
import { onboarding } from '../systems/onboarding.js';
// WORLD OVERHAUL / REVAMP 2.1 — Wave 1 systems (see design/revamp/REVAMP_MASTER.md).
import { spawnBudget } from '../systems/spawnBudget.js';            // single ship-cap arbiter (ctx.helpers.spawnBudget)
import { encounterDirector } from '../systems/encounterDirector.js'; // zone-anchored living-universe encounters
import { salvage } from '../systems/salvage.js';                     // derelict-field discovery loop
import { voiceArbiter } from '../ui/voiceArbiter.js';                // "one voice at a time" priority queue (ctx.helpers.voice)
// BP-11 Sector Atmosphere (Wave 3, design/revamp/detail/A_sector_station.md) — SYSTEMS-only
// surfacing modules (event-driven; no update; DOM fully guarded; voice via ctx.helpers.voice).
import { sectorPostcard } from '../ui/sectorPostcard.js';             // A1: arrival identity card + one 'news' rumor line
import { dockDenyBanner } from '../ui/dockDenyBanner.js';             // A3: dockDeny.js surfaced — scan line + one 'comms' denial
import { stationBroadcast } from '../systems/stationBroadcast.js';    // A5: ambient station flavor (window-timer only; lowest voice priority)
import { hazardHints } from '../data/hazardLanguage.js';               // A7: once-per-type 'warn' counterplay hint + state.ui.hazardRead
import { dangerGradient } from '../ui/dangerGradient.js';              // A9: dangerTier tint+badge overlay on existing starmap nodes (guarded applier)
// BP-12 Causal Economy (Wave 3, design/revamp/detail/E_salvage_economy_contracts.md) — SYSTEMS-only
// read layers over the shipped dangerModel/sectorSim field ("no economy change without cause").
import { causeLedger } from '../ui/causeLedger.js';                    // E: "why prices changed" tooltip over the live driver tags (voice:none)
import { economyContracts } from '../systems/economyContracts.js';     // E: field-born contract offers (emit-only mission:offered; ≤1 per station-epoch)
import { stationSideEventDirector } from '../systems/stationSideEventDirector.js'; // A6: seeded station side-events director (spawnBudget client)
import { gateControlDirector } from '../systems/gateControlDirector.js';          // A8: seeded gate traffic-control director (toll via economy:chargeCredits)
import { render } from '../render/renderer.js';
import { vfx } from '../render/vfx.js';
import { feel } from '../render/feel.js';
import { audio } from '../audio/audioSystem.js';
import { ui } from '../ui/uiRoot.js';
import { save } from '../save/saveSystem.js';
import { ensurePerfRuntime, perfNow } from './perfRuntime.js';

export function createRegistry(ctx) {
  const aiSlot = selectAISystem(ctx);
  // Normal play is SG-06 tactical AI + Flight V3 on rapier-dynamic. Legacy/custom branches stay
  // available for explicit tool/test fixtures, not player-facing settings or save restore.
  const flightSlot = selectFlightSystem(ctx);
  // init / registration order
  const SYSTEMS = [
    core, voiceArbiter, input, autoTargetAssist, scanner, aiSlot, physics, aiPorts, aiEncounter, actions, flightSlot, cruise, weapons, countermeasures, impulseCharges, combat, tetherGameplay, masslineTelemetry, masslineThreats, masslineImpacts, mining, cargo, economy,
    automation, wingmen, intervention, spawnBudget, world, encounterDirector, stationSideEventDirector, gateControlDirector, salvage, factions, sectorSim, missions, story, scenarioRuntime, presentationOrchestrator, presentationAdapters, ships, crafting, heat, traffic, drill, claims, beacons, onboarding, sectorPostcard, dockDenyBanner, stationBroadcast, hazardHints, dangerGradient, causeLedger, economyContracts, render, vfx, feel, audio, ui, save,
  ];
  // sim step order (AI submits commands, actions resolve before flight, weapons before physics) — render-phase systems excluded.
  // onboarding runs last: it only reads state (proximity checks) and drives tutorial UI.
  // heat runs late so piracy events from combat/factions this tick have landed before decay.
  // traffic runs after world (sector:enter has spawned stations) and after heat (so piracy on a
  // freighter this frame is accounted) — it only writes its own entities' intent, never player state.
  // crafting now has a real update (build-queue progress) so it's in the sim order; it only mutates
  // its own queues + grants products, never movement/combat state.
  // intervention runs after automation (so automation:assetLost this tick has fired) and prunes
  // closed salvage wrecks.
  // claims runs late (after cargo/economy) so its refinery conversion uses fresh cargo state.
  // story runs after missions (so story:beatAdvanced from missions this tick has a listener ready)
  // and before ships — it only emits UI/comms/graffiti/hud events and reads state; never movement.
  // sectorSim runs after world + factions so its day-tick drift reads settled sector owners + the
  // freshly-recomputed faction power table; it owns ONLY state.sectorSim and affects the world by
  // emitting sanctioned intents (economy:applyTradePressure, factions.addOffscreenTension,
  // automation.offscreenRiskPass). It does NO per-frame work — all simulation is on day:tick /
  // sector transitions / save:loaded. A bug here can never freeze the loop (try/catch in init subs).
  const UPDATE_ORDER = [
    input, autoTargetAssist, scanner, aiSlot, aiEncounter, actions, beacons, flightSlot, cruise, aiPorts, weapons, countermeasures, impulseCharges, physics, combat, tetherGameplay, masslineTelemetry, masslineThreats, masslineImpacts, mining, cargo, automation, wingmen, crafting,
    economy, intervention, world, encounterDirector, stationSideEventDirector, gateControlDirector, salvage, factions, sectorSim, missions, story, scenarioRuntime, heat, traffic, drill, claims, onboarding, voiceArbiter,
  ];
  // masslineTelemetry runs immediately after tetherGameplay, which mirrors state.player.tether
  // after combat/physics have settled. It is read-only telemetry — it writes only its own
  // state.player.masslineTelemetry subtree, never entities or SG-02 attachments, and emits only the
  // documented trick-read events (tether:snapCatch rung 05, tether:reelPump rung 06).
  // masslineThreats runs immediately after masslineTelemetry (rung 09): it reads the mirrored
  // tether + telemetry subtrees after they've settled this tick, writes only its own
  // state.player.masslineThreats subtree, and emits exactly one documented event (massline:threat).
  // masslineImpacts runs immediately after masslineThreats (rung 13): it reads the settled tether
  // mirror + entities to detect the whipped mass (latched or just-slung) hitting a solid body,
  // writes only its own state.player.masslineImpacts subtree, and emits exactly one documented
  // event (tether:whipImpact).
  // beacons runs after AI/actions and before flight so its lure can override a hostile's intent for
  // this tick (drift toward the beacon) without touching AI internals; it is a no-op when none exist.
  const byName = new Map(SYSTEMS.map((s) => [s.name, s]));
  byName.set('ai', aiSlot);
  byName.set('flight', flightSlot);

  return {
    systems: SYSTEMS,
    ctx,
    get(name) { return byName.get(name); },
    init() { for (const s of SYSTEMS) { if (s.init) s.init(ctx); } },
    destroy() {
      const seen = new Set();
      for (const s of [...UPDATE_ORDER, ...SYSTEMS]) {
        if (!s || seen.has(s) || !s.destroy) continue;
        seen.add(s);
        s.destroy();
      }
    },
    step(dt) {
      const state = ctx.state;
      const perf = ensurePerfRuntime(state);
      const stepStart = perfNow();
      let t = perfNow();
      try { core.preStep(dt, state); }
      finally { perf.recordSystem('core.preStep', perfNow() - t); }
      for (const s of UPDATE_ORDER) {
        if (!s.update) continue;
        t = perfNow();
        try { s.update(dt, state); }
        finally { perf.recordSystem(s.name, perfNow() - t); }
      }
      t = perfNow();
      try { core.lifetimeSweep(dt, state); }
      finally {
        perf.recordSystem('core.lifetimeSweep', perfNow() - t);
        perf.recordStepTotal(perfNow() - stepStart);
      }
    },
    renderUpdate(alpha, frameDt) {
      const state = ctx.state;
      const perf = ensurePerfRuntime(state);
      try {
        let t = perfNow();
        let renderMs = 0;
        let renderedPreparedScene = false;
        const splitRender = typeof render.prepareFrame === 'function' && typeof render.drawPreparedFrame === 'function';
        let renderError = null;
        try {
          if (splitRender) renderedPreparedScene = render.prepareFrame(alpha, frameDt) !== false;
          else render.renderFrame(alpha, frameDt);
        }
        catch (err) { renderError = err; }
        finally { renderMs += perfNow() - t; }
        if (renderError) {
          perf.recordPhase('render', renderMs);
          throw renderError;
        }

        let vfxError = null;
        if (vfx.update) {
          t = perfNow();
          try { vfx.update(frameDt, state); }
          catch (err) { vfxError = err; }
          finally { perf.recordPhase('vfx', perfNow() - t); }
        }

        if (splitRender) {
          t = perfNow();
          try { if (renderedPreparedScene) render.drawPreparedFrame(); }
          finally {
            renderMs += perfNow() - t;
            perf.recordPhase('render', renderMs);
          }
        } else {
          perf.recordPhase('render', renderMs);
        }
        if (vfxError) throw vfxError;

        if (feel.frame) {
          t = perfNow();
          try { feel.frame(frameDt, state); }
          finally { perf.recordPhase('feel', perfNow() - t); }
        }
        if (ui.frame) {
          t = perfNow();
          try { ui.frame(frameDt, state); }
          finally { perf.recordPhase('ui', perfNow() - t); }
        }
      } finally {
        const diag = state.render && state.render.diagnostics;
        if (diag && typeof diag.update === 'function') diag.update(frameDt);
      }
    },
  };
}

function selectAISystem(ctx) {
  const gameplay = ctx && ctx.state && ctx.state.settings && ctx.state.settings.gameplay || {};
  if (gameplay.aiBackend === 'sg06-tactical' && gameplay.physicsBackend === 'rapier-dynamic') {
    return createTacticalAISystem();
  }
  return ai;
}

// Flight controller selection. V3 only functions under rapier-dynamic, so direct tool/test fixtures
// that request another backend resolve to the legacy controller.
function selectFlightSystem(ctx) {
  const gameplay = ctx && ctx.state && ctx.state.settings && ctx.state.settings.gameplay || {};
  if (gameplay.flightBackend === 'v3' && gameplay.physicsBackend === 'rapier-dynamic') {
    return flightV3;
  }
  return flight;
}
