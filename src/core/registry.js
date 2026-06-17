// System registry: holds every system, runs init in registration order, runs the sim UPDATE_ORDER
// each step (§2.3), and the render-phase systems each frame. main.js builds it with the ctx.
import { core } from './coreSystem.js';
import { physics } from './physics.js';
import { input } from '../systems/input.js';
import { ai } from '../systems/ai.js';
import { flight } from '../systems/flight.js';
import { weapons } from '../systems/weapons.js';
import { combat } from '../systems/combat.js';
import { mining } from '../systems/mining.js';
import { cargo } from '../systems/cargo.js';
import { economy } from '../systems/economy.js';
import { automation } from '../systems/automation.js';
import { world } from '../systems/world.js';
import { factions } from '../systems/factions.js';
import { missions } from '../systems/missions.js';
import { ships } from '../systems/ships.js';
import { crafting } from '../systems/crafting.js';
import { heat } from '../systems/heat.js';
import { onboarding } from '../systems/onboarding.js';
import { render } from '../render/renderer.js';
import { vfx } from '../render/vfx.js';
import { feel } from '../render/feel.js';
import { audio } from '../audio/audioSystem.js';
import { ui } from '../ui/uiRoot.js';
import { save } from '../save/saveSystem.js';

export function createRegistry(ctx) {
  // init / registration order
  const SYSTEMS = [
    core, input, ai, flight, weapons, physics, combat, mining, cargo, economy,
    automation, world, factions, missions, ships, crafting, heat, onboarding, render, vfx, feel, audio, ui, save,
  ];
  // sim step order (AI before flight, weapons before physics, etc.) — render-phase systems excluded.
  // onboarding runs last: it only reads state (proximity checks) and drives tutorial UI.
  // heat runs late so piracy events from combat/factions this tick have landed before decay.
  const UPDATE_ORDER = [
    input, ai, flight, weapons, physics, combat, mining, cargo,
    economy, automation, world, factions, missions, heat, onboarding,
  ];
  const byName = new Map(SYSTEMS.map((s) => [s.name, s]));

  return {
    systems: SYSTEMS,
    ctx,
    get(name) { return byName.get(name); },
    init() { for (const s of SYSTEMS) { if (s.init) s.init(ctx); } },
    step(dt) {
      const state = ctx.state;
      core.preStep(dt, state);
      for (const s of UPDATE_ORDER) { if (s.update) s.update(dt, state); }
      core.lifetimeSweep(dt, state);
    },
    renderUpdate(alpha, frameDt) {
      const state = ctx.state;
      render.renderFrame(alpha, frameDt);
      if (vfx.update) vfx.update(frameDt, state);
      if (feel.frame) feel.frame(frameDt, state);
      if (ui.frame) ui.frame(frameDt, state);
    },
  };
}
