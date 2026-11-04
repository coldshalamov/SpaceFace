// Explicit isolated candidate assembly. Native physics, save, cargo/economy/law remain production
// owners. Proposed owner methods and traffic hunks are loaded without touching shared source.
import assert from 'node:assert/strict';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { world } from '../src/systems/world.js';
import { cargo } from '../src/systems/cargo.js';
import { economy } from '../src/systems/economy.js';
import { lawSecurity } from '../src/systems/lawSecurity.js';
import { factions } from '../src/systems/factions.js';
import { heat } from '../src/systems/heat.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { combat } from '../src/systems/combat.js';
import { actions } from '../src/systems/actions.js';
import { save } from '../src/save/saveSystem.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { createCombatCatalog } from '../src/combat/runtime.js';
import { getCombatKernel } from '../src/combat/kernel.js';
import { COMBAT_PROFILES, ATTACHMENT_DEFS } from '../src/data/combatDefs.js';
import { createCinderglassJobSystem } from '../src/features/cinderglassJob/runtime.js';
import { createBreakwaterSpurSystem } from '../src/features/breakwaterSpur/runtime.js';
import { createCounterweightCircuitSystem } from '../src/features/counterweightCircuit/runtime.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { CINDERGLASS_JOB_COMBAT_PROFILE, CINDERGLASS_JOB_MOUNT_DEFINITION,
  CINDERGLASS_JOB_SECTOR_ID, CINDERGLASS_JOB_ROLES } from '../src/features/cinderglassJob/definition.js';

export async function candidateScene({ withLaw = false, playerPos = null } = {}) {
  const catalog = createCombatCatalog({
    profiles: [...COMBAT_PROFILES.filter(r => r.id !== CINDERGLASS_JOB_COMBAT_PROFILE.id), CINDERGLASS_JOB_COMBAT_PROFILE],
    attachments: [...ATTACHMENT_DEFS.filter(r => r.id !== CINDERGLASS_JOB_MOUNT_DEFINITION.id), CINDERGLASS_JOB_MOUNT_DEFINITION] });
  const fixture = { name: 'cinderglassCatalogFixture', init(ctx) { getCombatKernel(ctx, { catalog }); } };
  const sim = createSimulation({ seed: 4242, systems: [physics, world,
    cargo, economy,
    ...(withLaw ? [factions, heat, lawSecurity] : []), fixture, npcJobsRuntime, actions, flightV3,
    combat, createCounterweightCircuitSystem(), createBreakwaterSpurSystem(), createCinderglassJobSystem(), save] });
  const state = sim.state, bus = sim.bus || sim.registry.ctx.bus;
  state.mode = 'flight'; state.run = { kind: 'adventure' };
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  assert.equal(await sim.registry.get('physics').prepareBackend(state), true);
  state.player.credits = 5000; state.player.docked = false;
  state.story ||= {}; state.story.campaign47a = { stepProgress: { '1': { completed: ['alloy_run'] } } };
  const player = sim.spawn(makeShipEntitySpec('ship_kestrel', { isPlayer: true, team: 0, pos: playerPos || { x: 0, z: 0 } }));
  state.playerId = player.id;
  // Optional authored fixture placement happens before native admission, never by moving a live body.
  sim.registry.get('world').enterSector(CINDERGLASS_JOB_SECTOR_ID, playerPos ? { placePlayer: false } : {});
  const sys = sim.registry.get('cinderglassJob');
  const t = { sim, state, bus, sys, player,
    cg: () => state.world.cinderglassJob,
    step(n = 1) { for (let i = 0; i < n; i++) sim.step(SIM_DT); },
    until(fn, max = 120) { for (let i = 0; i < max; i++) { t.step(); if (fn()) return true; } return false; },
    action(action, rest = {}) { const p = { action, token: sys.token(), operationId: t.cg().operationId, ...rest }; bus.emit('cinderglassJob:action', p); return p.result; },
    body(key) { return state.entities.get(t.cg().entities[key]); },
    ack() { sys._rebind(state); bus.emit('cinderglassJob:presentationReady', { token: sys.token(), operationId: t.cg().operationId,
      bodies: [...sys._bindings.values()].map(({ entity }) => ({ id: entity.id, generation: entity.occupantGeneration })) }); },
    async accept() {
      assert.equal(t.action('contact').ok, true);
      assert.equal(t.action('accept', { offerEpoch: t.cg().offerEpoch }).ok, true);
      t.step(4); t.ack();
      assert.ok(t.until(() => t.cg().phase === 'recon'), t.cg().admissionReason);
    },
    restore(data) { const result = sim.registry.get('save')._restore(JSON.parse(JSON.stringify(data)), 'cinderglass-fixture');
      assert.equal(result.restored, true); t.step(2); t.ack(); t.step(3); return result; },
    originalCount(key = 'podId') { const rid = CINDERGLASS_JOB_ROLES[key].worldRecordId;
      return [...state.entities.values()].filter(e => e.data?.worldRecordId === rid).length; },
  };
  return t;
}

// Explicit fixture positioning through the canonical native body for isolated seam tests.
export function placeBody(t, entity, pos, vel = { x: 0, z: 0 }) {
  const native = t.sim.registry.get('physics')._sg02, rec = native.records.get(entity.id), origin = native._frameOrigin || { x: 0, z: 0 };
  rec.body.setTranslation({ x: pos.x - origin.x, y: 0, z: pos.z - origin.z }, true);
  rec.body.setLinvel({ x: vel.x, y: 0, z: vel.z }, true);
  entity.pos.x = pos.x; entity.pos.z = pos.z; entity.vel.x = vel.x; entity.vel.z = vel.z;
}
