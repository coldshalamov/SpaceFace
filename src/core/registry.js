// System registry: holds every system, runs init in registration order, runs the sim UPDATE_ORDER
// each step (§2.3), and the render-phase systems each frame. main.js builds it with the ctx.
import { core } from './coreSystem.js';
import { physics } from './physics.js';
import { input } from '../systems/input.js';
import { ai } from '../systems/ai.js';
import { actions } from '../systems/actions.js';
import { flight } from '../systems/flight.js';
import { weapons } from '../systems/weapons.js';
import { combat } from '../systems/combat.js';
import { mining } from '../systems/mining.js';
import { cargo } from '../systems/cargo.js';
import { economy } from '../systems/economy.js';
import { automation } from '../systems/automation.js';
import { world } from '../systems/world.js';
import { factions } from '../systems/factions.js';
import { sectorSim } from '../systems/sectorSim.js';   // ADR-0002 / V2 §33 — offscreen stat sim
import { missions } from '../systems/missions.js';
import { story } from '../systems/story.js';
import { ships } from '../systems/ships.js';
import { crafting } from '../systems/crafting.js';
import { heat } from '../systems/heat.js';
import { traffic } from '../systems/traffic.js';
import { drill } from '../systems/drill.js';
import { intervention } from '../systems/intervention.js';
import { claims } from '../systems/claims.js';
import { onboarding } from '../systems/onboarding.js';
import { render } from '../render/renderer.js';
import { vfx } from '../render/vfx.js';
import { feel } from '../render/feel.js';
import { audio } from '../audio/audioSystem.js';
import { ui } from '../ui/uiRoot.js';
import { save } from '../save/saveSystem.js';
import { ensurePerfRuntime, perfNow } from './perfRuntime.js';

export function createRegistry(ctx) {
  // init / registration order
  const SYSTEMS = [
    core, input, ai, physics, actions, flight, weapons, combat, mining, cargo, economy,
    automation, intervention, world, factions, sectorSim, missions, story, ships, crafting, heat, traffic, drill, claims, onboarding, render, vfx, feel, audio, ui, save,
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
    input, ai, actions, flight, weapons, physics, combat, mining, cargo, crafting,
    economy, automation, intervention, world, factions, sectorSim, missions, story, heat, traffic, drill, claims, onboarding,
  ];
  const byName = new Map(SYSTEMS.map((s) => [s.name, s]));

  return {
    systems: SYSTEMS,
    ctx,
    get(name) { return byName.get(name); },
    init() { for (const s of SYSTEMS) { if (s.init) s.init(ctx); } },
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
        try { render.renderFrame(alpha, frameDt); }
        finally { perf.recordPhase('render', perfNow() - t); }
        if (vfx.update) {
          t = perfNow();
          try { vfx.update(frameDt, state); }
          finally { perf.recordPhase('vfx', perfNow() - t); }
        }
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
