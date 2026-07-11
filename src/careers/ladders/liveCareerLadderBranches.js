// Live composite branch adapter for Hauler + Hunter + Prospector career ladders.
//
// CL-00 careerLadders remains the sole ladder / save / reward authority.
// This system only:
//   - registers the three accepted branch definitions (idempotent)
//   - binds each FSM exactly once (construction-time)
//   - forwards init / update / newGame / destroy
//   - never owns durable ladder state (no serialize/deserialize)
//
// Non-binding origin reachability is preserved: origins stay on careerOrigins;
// branch FSMs keep their existing soft-offer listeners and unlock prerequisites.

import {
  createHaulerLadderSystem,
  registerHaulerLadder,
} from './haulerLadderFsm.js';
import { createHunterLadderFsm } from './hunterLadderFsm.js';
import { createProspectorLadderSystem, ensureProspectorLadderRegistered } from './prospectorLadderFsm.js';

const BRANCH_ORDER = Object.freeze(['hauler', 'hunter', 'prospector']);

/**
 * Resolve the registered careerLadders authority from ctx/registry.
 * Never invent a second durable ladder owner when the framework is present.
 */
function resolveLaddersAuthority(ctx) {
  if (ctx && ctx.ladders && typeof ctx.ladders.applySignal === 'function') {
    return ctx.ladders;
  }
  const registry = ctx && ctx.registry;
  if (registry && typeof registry.get === 'function') {
    const viaReg = registry.get('careerLadders');
    if (viaReg && typeof viaReg.applySignal === 'function') return viaReg;
  }
  return null;
}

/**
 * Register all three branch definitions against the CL-00 process registry.
 * Idempotent: safe across repeated init / hot re-bind.
 */
function registerAllBranchDefinitions(laddersSys) {
  const results = {
    hauler: registerHaulerLadder(),
    hunter: null,
    prospector: ensureProspectorLadderRegistered(),
  };

  // Hunter prefers system.registerDefinition so the leaf hydrates when state is live.
  if (laddersSys && typeof laddersSys.registerDefinition === 'function') {
    // Deferred to hunter FSM.register (sets _registered + validates).
    results.hunter = { ok: true, reason: 'via_fsm_register' };
  } else {
    results.hunter = { ok: false, reason: 'no_ladders_system' };
  }

  return results;
}

/**
 * Create the composite live adapter.
 * Each branch FSM is constructed exactly once per composite instance.
 *
 * @param {{ hauler?: object, hunter?: object, prospector?: object }} [opts]
 *   Optional pre-built FSMs (tests). Production uses factories.
 */
export function createLiveCareerLadderBranchesSystem(opts = {}) {
  // Bind each FSM exactly once at composite construction — never re-create on init.
  const hauler = opts.hauler || createHaulerLadderSystem();
  const hunter = opts.hunter || createHunterLadderFsm();
  const prospector = opts.prospector || createProspectorLadderSystem();

  const branches = Object.freeze({ hauler, hunter, prospector });

  return {
    name: 'liveCareerLadderBranches',
    state: null,
    bus: null,
    registry: null,
    /** @type {object|null} resolved careerLadders authority (never owned) */
    ladders: null,
    _branches: branches,
    _defResults: null,
    _initGeneration: 0,

    /**
     * Register defs + bind live bus adapters.
     * destroy-first on every init prevents duplicate listeners / double rewards.
     */
    init(ctx) {
      // Tear down prior subscriptions before rebinding (repeated init safety).
      this.destroy();

      this.state = ctx && ctx.state ? ctx.state : null;
      this.bus = (ctx && ctx.bus) || null;
      this.registry = (ctx && ctx.registry) || null;
      this._initGeneration += 1;

      const laddersSys = resolveLaddersAuthority(ctx);
      this.ladders = laddersSys;

      // Prefer framework singleton; never create a second durable ladder owner here.
      if (laddersSys) {
        hauler.ladders = laddersSys;
        hauler._ownsLadders = false;
        hunter.ladders = laddersSys;
        prospector.ladders = laddersSys;
      }

      // Definitions first so branch init / leaf hydrate sees all three careerIds.
      this._defResults = registerAllBranchDefinitions(laddersSys);
      if (laddersSys && typeof hunter.register === 'function') {
        this._defResults.hunter = hunter.register(laddersSys);
      }

      const branchCtx = {
        state: this.state,
        bus: this.bus,
        registry: this.registry,
        ladders: laddersSys || undefined,
      };

      // Each FSM init is destroy-first internally; still safe under composite destroy.
      if (typeof hauler.init === 'function') hauler.init(branchCtx);
      if (typeof hunter.init === 'function') hunter.init(branchCtx);
      if (typeof prospector.init === 'function') prospector.init(branchCtx);

      // Re-assert non-ownership after hauler.init (which may re-resolve ladders).
      if (laddersSys) {
        hauler.ladders = laddersSys;
        hauler._ownsLadders = false;
        hunter.ladders = laddersSys;
        prospector.ladders = laddersSys;
      }
    },

    /**
     * Forward newGame scratch resets only.
     * Durable ladder wipe is owned by careerLadders.newGame (registry order: before this).
     * Prospector/hauler/hunter FSMs may reset local scratch or re-seed latent leaves
     * without introducing a second save/reward writer.
     */
    newGame() {
      for (const id of BRANCH_ORDER) {
        const branch = branches[id];
        if (branch && typeof branch.newGame === 'function') {
          try {
            branch.newGame();
          } catch (_) {
            /* best-effort: one branch must not block peers */
          }
        }
      }
    },

    update(dt, state) {
      if (state) this.state = state;
      for (const id of BRANCH_ORDER) {
        const branch = branches[id];
        if (branch && typeof branch.update === 'function') {
          branch.update(dt, this.state);
        }
      }
    },

    /** Read-only access for debug / harnesses — not a second authority. */
    getBranch(careerId) {
      return branches[careerId] || null;
    },

    listBranches() {
      return BRANCH_ORDER.map((id) => ({
        careerId: id,
        name: branches[id] && branches[id].name,
        bound: !!branches[id],
      }));
    },

    /**
     * Unsubscribe every branch. Does not clear CL-00 definitions or ladder leaves
     * (framework owns those; clearing defs would break peer tests / hot re-init).
     */
    destroy() {
      for (const id of BRANCH_ORDER) {
        const branch = branches[id];
        if (branch && typeof branch.destroy === 'function') {
          try {
            // Ensure hauler never destroys the shared framework on composite teardown.
            if (id === 'hauler' && branch._ownsLadders && this.ladders && branch.ladders === this.ladders) {
              branch._ownsLadders = false;
            }
            branch.destroy();
          } catch (_) {
            /* best-effort */
          }
        }
      }
    },
  };
}

/** Singleton composite registered by the registry (exactly one live bind site). */
export const liveCareerLadderBranches = createLiveCareerLadderBranchesSystem();

export default liveCareerLadderBranches;
