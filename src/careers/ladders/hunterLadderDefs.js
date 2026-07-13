// CL-02 Hunter professional ladder — pure data definition (candidate pack).
// Non-binding six-step progression on the quality-PASS CL-00 shared framework.
//
// Authority boundaries:
// - Never writes credits / cargo / rep / heat / story.beatIndex.
// - Rewards/choices emit only canonical owner intents (economy:grantCredits,
//   economy:chargeCredits, faction:repDelta). Heat has no public intent seam.
// - Live event seams are documented in `eventsConsumed` (listen-only).
//
// Not registry-wired. Lead integrator registers via careerLadders + hunterLadderFsm.

import { CombatDoctrineId, DOCTRINE_TELEGRAPH_TICKS } from '../../ai/combatDoctrine.js';
import {
  HUNTER_FORBIDDEN_MARK_WORDS,
  HUNTER_LEGAL_MARK_WORDS,
} from '../origins/hunterOriginData.js';
import {
  LADDER_REWARD_EVENTS,
  validateLadderDefinition,
} from './ladderShared.js';

export const HUNTER_LADDER_CAREER_ID = 'hunter';
export const HUNTER_LADDER_TITLE = 'Hunter Professional';
export const HUNTER_ROLE_HULL_DEF_ID = 'ship_wasp';

/** Fixed-timestep contact hold (mirrors hunter origin pursuit). 60 Hz × 4.5 s. */
export const HUNTER_LADDER_PURSUIT_CONTACT_TICKS = 270;
/** Out-of-range ticks before mark_lost (careerOrigins HUNTER_LOST_TICKS). */
export const HUNTER_LADDER_LOST_TICKS = 90;
/** Pursuit range squared (careerOrigins HUNTER_PURSUIT_RANGE_SQ = 2200²). */
export const HUNTER_LADDER_PURSUIT_RANGE_SQ = 2200 * 2200;
/** Escalation package survival window (simTime seconds). */
export const HUNTER_LADDER_PACKAGE_TIMER_S = 90;

/** Live CombatDoctrineId pool — must match src/ai/combatDoctrine.js. */
export const HUNTER_LADDER_DOCTRINE_POOL = Object.freeze([
  CombatDoctrineId.INTERCEPTOR_FLYBY,
  CombatDoctrineId.TETHER_CONTROL_RAIDER,
  CombatDoctrineId.RANGED_DISENGAGER,
]);

export const HUNTER_LADDER_TELEGRAPH_TICKS = DOCTRINE_TELEGRAPH_TICKS;

/**
 * Verified live event names this ladder may observe (listen-only).
 * Emit path is restricted to CAREER_LADDER_EVENTS + LADDER_REWARD_EVENTS.
 */
export const HUNTER_LADDER_LIVE_EVENTS = Object.freeze({
  MISSION_ACCEPTED: 'mission:accepted',
  MISSION_COMPLETED: 'mission:completed',
  MISSION_FAILED: 'mission:failed',
  COMBAT_DAMAGE: 'combat:damage',
  COMBAT_SUBSYSTEM_DISABLED: 'combat:subsystemDisabled',
  COMBAT_OUTCOME: 'combat:outcome',
  ENTITY_KILLED: 'entity:killed',
  HEAT_CHANGED: 'heat:changed',
  AI_TELEGRAPH: 'ai:telegraph',
  AI_FLEE: 'ai:flee',
  BOUNTY_TRICK_TELEGRAPH: 'bountyHunt:trickTelegraph',
  BOUNTY_TRICK_ACTIVATED: 'bountyHunt:trickActivated',
  BOUNTY_OUTCOME: 'bountyHunt:outcome',
  DOCK_DOCKED: 'dock:docked',
  SCAN_COMPLETED: 'scan:completed',
  SCAN_PULSE: 'scan:pulse',
  SHIP_PURCHASED: 'ship:purchased',
  SAVE_LOADED: 'save:loaded',
  // Explicitly NOT used — combatOutcome listens, but no live emitter exists.
  COMBAT_SURRENDERED: 'combat:surrendered',
});

/** Soft alternate unlock keys under state.careers.ladders.__meta.skillProof. */
export const HUNTER_LADDER_SKILL_PROOF = Object.freeze({
  BOUNTY_HUNT_COMPLETE: 'bounty_hunt_complete',
});

export const HUNTER_LADDER_STEP_IDS = Object.freeze([
  'warrant_desk',
  'doctrine_pursuit',
  'escalation_package',
  'capture_window',
  'ledger_choice',
  'role_hull_capstone',
]);

export const HUNTER_LADDER_FAIL_CODES = Object.freeze({
  MARKED_LAWFUL: 'marked_lawful',
  MARKED_CIVILIAN: 'marked_civilian',
  HEAT_SPIKED: 'heat_spiked',
  NO_MARK: 'no_mark',
  ILLEGAL_FIRE: 'illegal_fire',
  MARK_LOST: 'mark_lost',
  CIVILIAN_KILL: 'civilian_kill',
  PACKAGE_WIPED_PLAYER: 'package_wiped_player',
  ILLEGAL_KILL: 'illegal_kill',
  MARK_ESCAPED: 'mark_escaped',
  WANTED_BLOCKS_LAW_FILE: 'wanted_blocks_law_file',
  DOUBLE_SELL_BLOCKED: 'double_sell_blocked',
});

const unlockPrereq = Object.freeze({
  type: 'or',
  any: Object.freeze([
    Object.freeze({ type: 'originCompleted', careerId: HUNTER_LADDER_CAREER_ID }),
    Object.freeze({
      type: 'skillProof',
      key: HUNTER_LADDER_SKILL_PROOF.BOUNTY_HUNT_COMPLETE,
      min: 1,
    }),
  ]),
});

/**
 * Data-driven ladder definition for CL-00 registerLadderDefinition().
 * Six embodied steps: lawful bounty intelligence → pursuit/escalation →
 * doctrine combat → capture/choice → ledger fork → Wasp ownership.
 */
export const HUNTER_LADDER_DEF = Object.freeze({
  careerId: HUNTER_LADDER_CAREER_ID,
  title: HUNTER_LADDER_TITLE,
  nonBinding: true,
  themeArc: 'lawful bounty intelligence → pursuit/escalation → doctrine combat → capture/choice consequence',
  // Soft metadata only — not interpreted by validateRewardSpec.
  meta: Object.freeze({
    legalMarkWords: HUNTER_LEGAL_MARK_WORDS,
    forbiddenMarkWords: HUNTER_FORBIDDEN_MARK_WORDS,
    doctrinePool: HUNTER_LADDER_DOCTRINE_POOL,
    pursuitContactTicks: HUNTER_LADDER_PURSUIT_CONTACT_TICKS,
    lostTicks: HUNTER_LADDER_LOST_TICKS,
    pursuitRangeSq: HUNTER_LADDER_PURSUIT_RANGE_SQ,
    packageTimerS: HUNTER_LADDER_PACKAGE_TIMER_S,
    telegraphTicks: HUNTER_LADDER_TELEGRAPH_TICKS,
    // Soft board bias is presentation/missions territory — never a reward key.
    softBoardBias: Object.freeze({ bounty_hunt: 0.05 }),
    doNotUseEvents: Object.freeze([HUNTER_LADDER_LIVE_EVENTS.COMBAT_SURRENDERED]),
  }),
  unlockPrerequisites: Object.freeze([unlockPrereq]),
  // Terminal choice pays; no double complete grant.
  completionBonus: Object.freeze({ credits: 0 }),
  steps: Object.freeze([
    Object.freeze({
      id: 'warrant_desk',
      index: 0,
      title: 'Warrant Desk',
      theme: 'lawful_bounty_intelligence',
      // Framework evaluatePrerequisites requires an array (bare objects pass as empty).
      prerequisites: Object.freeze([unlockPrereq]),
      // Listen surface matches draft: mission/combat/heat/entity only.
      // scan:pulse|scan:completed exist live but are not FSM-driven for this step.
      eventsConsumed: Object.freeze([
        HUNTER_LADDER_LIVE_EVENTS.MISSION_ACCEPTED,
        HUNTER_LADDER_LIVE_EVENTS.MISSION_COMPLETED,
        HUNTER_LADDER_LIVE_EVENTS.COMBAT_DAMAGE,
        HUNTER_LADDER_LIVE_EVENTS.HEAT_CHANGED,
        HUNTER_LADDER_LIVE_EVENTS.ENTITY_KILLED,
      ]),
      objective: Object.freeze({
        playerVisible: 'Pull a clean warrant. Mark HOSTILE only.',
        teach: 'PATROL and TRADER are never legal bags.',
      }),
      dialogue: Object.freeze({
        acceptLine: 'Warrant is clean. Mark HOSTILE only.',
        successLine: 'Mark confirmed. Bag stays legal.',
        failLine: 'Wrong hull. Warrant voids.',
        recoveryLine: 'Pulse contacts. Lock a HOSTILE.',
      }),
      recovery: Object.freeze({
        cooldownS: 15,
        hint: 'Pulse contacts. Lock a HOSTILE.',
      }),
      rewards: Object.freeze({
        credits: 120,
        rep: Object.freeze([
          Object.freeze({ factionId: 'faction_scn', delta: 2 }),
        ]),
      }),
      params: Object.freeze({
        missionType: 'bounty_hunt',
        riskTier: 1,
        baseRewardCr: 120,
        storyTag: 'ladder.hunter:warrant_desk',
      }),
    }),

    Object.freeze({
      id: 'doctrine_pursuit',
      index: 1,
      title: 'Doctrine Pursuit',
      theme: 'pursuit_escalation_doctrine',
      prerequisites: Object.freeze([
        Object.freeze({
          type: 'ladderStepDone',
          careerId: HUNTER_LADDER_CAREER_ID,
          stepId: 'warrant_desk',
        }),
      ]),
      eventsConsumed: Object.freeze([
        HUNTER_LADDER_LIVE_EVENTS.AI_TELEGRAPH,
        HUNTER_LADDER_LIVE_EVENTS.BOUNTY_TRICK_TELEGRAPH,
        HUNTER_LADDER_LIVE_EVENTS.COMBAT_DAMAGE,
        HUNTER_LADDER_LIVE_EVENTS.HEAT_CHANGED,
        HUNTER_LADDER_LIVE_EVENTS.ENTITY_KILLED,
      ]),
      objective: Object.freeze({
        playerVisible: 'Hold pursuit through the doctrine telegraph.',
        teach: 'Read the tell. Do not splash clean hulls.',
      }),
      dialogue: Object.freeze({
        acceptLine: 'Hold the line through its doctrine.',
        successLine: 'Doctrine read. Window open.',
        failLine: 'Mark broke contact or heat rose.',
        recoveryLine: 'Reacquire. Stay on the HOSTILE.',
      }),
      recovery: Object.freeze({
        cooldownS: 20,
        hint: 'Reacquire. Stay on the HOSTILE.',
      }),
      rewards: Object.freeze({
        credits: 180,
      }),
      params: Object.freeze({
        pursuitContactTicks: HUNTER_LADDER_PURSUIT_CONTACT_TICKS,
        lostTicks: HUNTER_LADDER_LOST_TICKS,
        pursuitRangeSq: HUNTER_LADDER_PURSUIT_RANGE_SQ,
        telegraphTicks: HUNTER_LADDER_TELEGRAPH_TICKS,
        doctrinePool: HUNTER_LADDER_DOCTRINE_POOL,
      }),
    }),

    Object.freeze({
      id: 'escalation_package',
      index: 2,
      title: 'Escalation Package',
      theme: 'pursuit_escalation',
      prerequisites: Object.freeze([
        Object.freeze({
          type: 'ladderStepDone',
          careerId: HUNTER_LADDER_CAREER_ID,
          stepId: 'doctrine_pursuit',
        }),
      ]),
      eventsConsumed: Object.freeze([
        HUNTER_LADDER_LIVE_EVENTS.BOUNTY_TRICK_ACTIVATED,
        HUNTER_LADDER_LIVE_EVENTS.BOUNTY_OUTCOME,
        HUNTER_LADDER_LIVE_EVENTS.ENTITY_KILLED,
        HUNTER_LADDER_LIVE_EVENTS.HEAT_CHANGED,
        HUNTER_LADDER_LIVE_EVENTS.AI_FLEE,
      ]),
      objective: Object.freeze({
        playerVisible: 'Survive the package. Keep the bag clean.',
        teach: 'Civilian splash voids the warrant.',
      }),
      dialogue: Object.freeze({
        acceptLine: 'Package inbound. Keep the bag clean.',
        successLine: 'Escalation down. Warrant still legal.',
        failLine: 'Splash fire burned the warrant.',
        recoveryLine: 'Reset. Hostiles only.',
      }),
      recovery: Object.freeze({
        cooldownS: 30,
        hint: 'Reset. Hostiles only.',
      }),
      rewards: Object.freeze({
        credits: 320,
        rep: Object.freeze([
          Object.freeze({
            factionId: 'faction_scn',
            delta: 4,
          }),
        ]),
      }),
      params: Object.freeze({
        packageTimerS: HUNTER_LADDER_PACKAGE_TIMER_S,
        reduceAddsOnRetry: true,
      }),
    }),

    Object.freeze({
      id: 'capture_window',
      index: 3,
      title: 'Capture Window',
      theme: 'capture_choice_consequence',
      prerequisites: Object.freeze([
        Object.freeze({
          type: 'ladderStepDone',
          careerId: HUNTER_LADDER_CAREER_ID,
          stepId: 'escalation_package',
        }),
      ]),
      eventsConsumed: Object.freeze([
        HUNTER_LADDER_LIVE_EVENTS.COMBAT_SUBSYSTEM_DISABLED,
        HUNTER_LADDER_LIVE_EVENTS.COMBAT_OUTCOME,
        HUNTER_LADDER_LIVE_EVENTS.ENTITY_KILLED,
        HUNTER_LADDER_LIVE_EVENTS.HEAT_CHANGED,
        HUNTER_LADDER_LIVE_EVENTS.DOCK_DOCKED,
      ]),
      // Step rewards empty — capture/execute choice consequences pay once.
      rewards: Object.freeze({}),
      objective: Object.freeze({
        playerVisible: 'Disable the mark. Capture or finish clean.',
        teach: 'No boarding sim — disable, declare, custody.',
      }),
      dialogue: Object.freeze({
        acceptLine: 'Disable the mark. Capture or finish clean.',
        successLineCapture: 'Custody sealed. Warrant closed soft.',
        successLineExecute: 'Clean kill. Bag paid.',
        failLine: 'Warrant burned. Heat or wrong hull.',
        recoveryLine: 'Clear heat. Pull a fresh mark.',
      }),
      recovery: Object.freeze({
        cooldownS: 35,
        hint: 'Clear heat. Pull a fresh mark.',
      }),
      choices: Object.freeze([
        Object.freeze({
          id: 'capture',
          label: 'Take them in',
          consequences: Object.freeze([
            Object.freeze({
              event: LADDER_REWARD_EVENTS.GRANT_CREDITS,
              payload: Object.freeze({
                amount: 550,
                reason: 'career:ladder:hunter:capture',
              }),
            }),
            Object.freeze({
              event: LADDER_REWARD_EVENTS.REP_DELTA,
              payload: Object.freeze({
                factionId: 'faction_scn',
                delta: 8,
                reason: 'capture_custody',
              }),
            }),
            Object.freeze({
              event: LADDER_REWARD_EVENTS.REP_DELTA,
              payload: Object.freeze({
                factionId: 'faction_reach',
                delta: -2,
                reason: 'capture_custody',
              }),
            }),
          ]),
        }),
        Object.freeze({
          id: 'execute',
          label: 'Finish clean',
          consequences: Object.freeze([
            Object.freeze({
              event: LADDER_REWARD_EVENTS.GRANT_CREDITS,
              payload: Object.freeze({
                amount: 400,
                reason: 'career:ladder:hunter:execute',
              }),
            }),
            Object.freeze({
              event: LADDER_REWARD_EVENTS.REP_DELTA,
              payload: Object.freeze({
                factionId: 'faction_scn',
                delta: 4,
                reason: 'clean_kill',
              }),
            }),
          ]),
        }),
      ]),
      params: Object.freeze({
        honesty: 'No interiors/boarding; disable + declare + custody flag only',
        disableEvents: Object.freeze([
          HUNTER_LADDER_LIVE_EVENTS.COMBAT_SUBSYSTEM_DISABLED,
          HUNTER_LADDER_LIVE_EVENTS.COMBAT_OUTCOME,
        ]),
        doNotUse: Object.freeze([HUNTER_LADDER_LIVE_EVENTS.COMBAT_SURRENDERED]),
      }),
    }),

    Object.freeze({
      id: 'ledger_choice',
      index: 4,
      title: 'Ledger Choice',
      theme: 'capture_choice_intelligence',
      prerequisites: Object.freeze([
        Object.freeze({
          type: 'ladderStepDone',
          careerId: HUNTER_LADDER_CAREER_ID,
          stepId: 'capture_window',
        }),
      ]),
      eventsConsumed: Object.freeze([
        HUNTER_LADDER_LIVE_EVENTS.DOCK_DOCKED,
        HUNTER_LADDER_LIVE_EVENTS.HEAT_CHANGED,
      ]),
      rewards: Object.freeze({}),
      objective: Object.freeze({
        playerVisible: 'File the bag with law, or sell it dark.',
        teach: 'One stamp only. Dark pays more; law pays clean.',
      }),
      dialogue: Object.freeze({
        acceptLine: 'File the bag or sell it dark.',
        successLineLaw: 'Ledger sealed with the law.',
        successLineDark: 'Dark desk paid. Watch your heat.',
        failLine: 'Desk refused. Clear your name.',
        recoveryLine: 'Pick a desk. One stamp only.',
      }),
      recovery: Object.freeze({
        cooldownS: 20,
        hint: 'Pick a desk. One stamp only.',
      }),
      choices: Object.freeze([
        Object.freeze({
          id: 'file_law',
          label: 'File with law',
          requires: Object.freeze(['!isPlayerWanted', 'military_dock']),
          consequences: Object.freeze([
            Object.freeze({
              event: LADDER_REWARD_EVENTS.GRANT_CREDITS,
              payload: Object.freeze({
                amount: 900,
                reason: 'career:ladder:hunter:complete:law',
              }),
            }),
            Object.freeze({
              event: LADDER_REWARD_EVENTS.REP_DELTA,
              payload: Object.freeze({
                factionId: 'faction_scn',
                delta: 10,
                reason: 'hunter_ledger_law',
              }),
            }),
            Object.freeze({
              event: LADDER_REWARD_EVENTS.REP_DELTA,
              payload: Object.freeze({
                factionId: 'faction_reach',
                delta: -5,
                reason: 'hunter_ledger_law',
              }),
            }),
          ]),
        }),
        Object.freeze({
          id: 'sell_dark',
          label: 'Sell dark',
          requires: Object.freeze(['blackmarket_dock']),
          // Dark path is rep-only for heat — never emit heat:delta.
          consequences: Object.freeze([
            Object.freeze({
              event: LADDER_REWARD_EVENTS.GRANT_CREDITS,
              payload: Object.freeze({
                amount: 1100,
                reason: 'career:ladder:hunter:complete:dark',
              }),
            }),
            Object.freeze({
              event: LADDER_REWARD_EVENTS.REP_DELTA,
              payload: Object.freeze({
                factionId: 'faction_reach',
                delta: 6,
                reason: 'hunter_ledger_dark',
              }),
            }),
            Object.freeze({
              event: LADDER_REWARD_EVENTS.REP_DELTA,
              payload: Object.freeze({
                factionId: 'faction_scn',
                delta: -8,
                reason: 'hunter_ledger_dark',
              }),
            }),
          ]),
        }),
      ]),
      params: Object.freeze({
        softDarkBoardBias: Object.freeze({ smuggling_run: 0.05 }),
      }),
    }),
    Object.freeze({
      id: 'role_hull_capstone',
      index: 5,
      title: 'Wasp Command',
      theme: 'physical_role_hull_ownership',
      prerequisites: Object.freeze([
        Object.freeze({
          type: 'ladderStepDone',
          careerId: HUNTER_LADDER_CAREER_ID,
          stepId: 'ledger_choice',
        }),
      ]),
      eventsConsumed: Object.freeze([HUNTER_LADDER_LIVE_EVENTS.SHIP_PURCHASED]),
      objective: Object.freeze({
        playerVisible: 'Own a Wasp. Carry the next warrant in it.',
        teach: 'A career becomes physical when the right hull is yours.',
      }),
      dialogue: Object.freeze({
        acceptLine: 'Own a Wasp. Carry the next warrant in it.',
        successLine: 'Wasp registered. Warrant work is yours.',
        failLine: 'No Wasp on the ownership ledger.',
        recoveryLine: 'Register a Wasp. Warrants wait.',
      }),
      recovery: Object.freeze({
        cooldownS: 0,
        hint: 'Register a Wasp. Warrants wait.',
      }),
      rewards: Object.freeze({}),
      params: Object.freeze({ roleHullDefId: HUNTER_ROLE_HULL_DEF_ID }),
    }),
  ]),
});

/** Validate the frozen definition against CL-00 schema (for tests / boot). */
export function validateHunterLadderDefinition() {
  return validateLadderDefinition(HUNTER_LADDER_DEF);
}

/** Deep-clone a plain definition suitable for registerLadderDefinition (unfreezes nested). */
export function createHunterLadderDefinition() {
  return JSON.parse(JSON.stringify(HUNTER_LADDER_DEF));
}
