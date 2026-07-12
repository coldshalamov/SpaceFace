// Pure ending eligibility against live campaign facts.
// Returns player-visible unmet conditions. Never mutates state.

import {
  BRANCH_FACTION,
  CAPITAL_SHIP_DEF_IDS,
  ENDGAME_NET_WORTH_CR,
  ENDGAME_REP_MIN,
  ENDING_DEFS,
  ENDING_IDS,
  SANDBOX_DEF,
  SANDBOX_ID,
  endingDef,
  isSandboxId,
} from './endingDefs.js';

const CAPITAL_SET = new Set(CAPITAL_SHIP_DEF_IDS);

/**
 * Snapshot of facts used for eligibility (deterministic pure read).
 * @param {object} state
 */
export function snapshotEndingFacts(state) {
  const s = state || {};
  const story = s.story || {};
  const player = s.player || {};
  const cargo = player.cargo || {};
  const items = cargo.items || {};
  const cargoIds = Object.keys(items).filter((id) => (items[id] || 0) > 0);
  const factions = s.factions || {};
  const branch = story.branch || null;
  const branchFactionId = branch ? BRANCH_FACTION[branch] || null : null;
  let branchRep = 0;
  if (branchFactionId && factions[branchFactionId]) {
    branchRep = Number(factions[branchFactionId].rep) || 0;
  } else {
    for (const k of Object.keys(factions)) {
      branchRep = Math.max(branchRep, Number(factions[k] && factions[k].rep) || 0);
    }
  }
  const scnRep = Number(factions.faction_scn && factions.faction_scn.rep) || 0;
  const mtsRep = Number(factions.faction_mts && factions.faction_mts.rep) || 0;
  const freeRep = Number(factions.faction_free && factions.faction_free.rep) || 0;

  const credits = Number(player.credits) || 0;
  // Net worth proxy: credits + simple ship stake (capital count * 25k). Deterministic, no market appraise.
  const owned = Array.isArray(player.ownedShips) ? player.ownedShips : [];
  const ownedDefIds = owned.map((o) => (o && o.defId) || o).filter(Boolean);
  const capitalOwned = ownedDefIds.some((id) => CAPITAL_SET.has(id));
  const netWorthCr = credits + (capitalOwned ? 25000 : 0) + ownedDefIds.length * 2000;

  const claims = (s.claims && Array.isArray(s.claims.bodies)) ? s.claims.bodies : [];
  const hasClaim = claims.length > 0;

  const camp = story.campaign47a || {};
  const outposts = Array.isArray(camp.outpostsOwned) ? camp.outpostsOwned : [];
  const liveOutposts = s.automation && Array.isArray(s.automation.outposts)
    ? s.automation.outposts
    : [];
  const hasOutpost = liveOutposts.length > 0 || outposts.length > 0 || !!camp.outpostSpecializationId;

  const origins = readAcceptedOrigins(s);
  const declined = Array.isArray(story.endgameDeclined)
    ? story.endgameDeclined.slice()
    : (story.flags && Array.isArray(story.flags.endgameDeclined)
      ? story.flags.endgameDeclined.slice()
      : []);

  const activeMissions = (s.missions && Array.isArray(s.missions.active)) ? s.missions.active : [];
  const capVol = Number(cargo.capVolume) || 0;
  const usedVol = Number(cargo.usedVolume) || 0;
  const fullLoad = capVol > 0 && usedVol >= capVol * 0.95;

  const sectorId = (s.world && s.world.currentSectorId) || null;
  const flags = story.flags || {};

  return Object.freeze({
    beatIndex: Number(story.beatIndex) || 0,
    endgameFlag: !!(flags.endgame),
    endgameOffered: !!story.endgameOffered,
    endgameChoice: story.endgameChoice ?? null,
    endgameResolved: !!(story.endgameResolved || story.endgameChoice || flags.sandboxContinued),
    sandboxContinued: !!flags.sandboxContinued,
    pendingChoice: story.endgamePending && story.endgamePending.choice
      ? story.endgamePending.choice
      : null,
    branch,
    branchFactionId,
    branchRep,
    scnRep,
    mtsRep,
    freeRep,
    credits,
    netWorthCr,
    capitalOwned,
    ownedDefIds: Object.freeze(ownedDefIds.slice()),
    hasClaim,
    hasOutpost,
    empireStake: capitalOwned || hasClaim || hasOutpost,
    origins: Object.freeze(origins.slice()),
    declined: Object.freeze(declined.slice()),
    cargoIds: Object.freeze(cargoIds.slice()),
    hasLedger: cargoIds.includes('cmdty_personal_ledger') || !!flags.hasLedger,
    activeMissionCount: activeMissions.length,
    noActiveMissions: activeMissions.length === 0,
    fullLoad,
    sectorId,
    inAshfall: sectorId === 'sector_ashfall_reach',
    heat: Number(player.heat) || 0,
  });
}

function readAcceptedOrigins(state) {
  const out = [];
  const root = state && state.careers && state.careers.origins;
  if (!root || typeof root !== 'object') return out;
  for (const id of ['hauler', 'hunter', 'prospector']) {
    const rec = root[id];
    if (!rec || typeof rec !== 'object') continue;
    const st = String(rec.status || '').toLowerCase();
    // Accepted, active, or completed origins count as career identity for ending gates.
    if (st && st !== 'idle' && st !== 'declined' && st !== 'offered' && st !== 'available') {
      out.push(id);
    } else if (rec.acceptedAtS != null || rec.completedAtS != null || rec.accepted === true) {
      out.push(id);
    }
  }
  return out;
}

/**
 * Shared B7 disposition gate (net worth, branch rep, empire stake, spine ready).
 * @param {ReturnType<typeof snapshotEndingFacts>} facts
 */
export function evaluateSharedGate(facts) {
  const unmet = [];
  if (!facts.endgameFlag && facts.beatIndex < 7) {
    unmet.push({
      code: 'beat_b7',
      text: 'Reach The Deep Reach (B7) first.',
    });
  }
  if (facts.netWorthCr < ENDGAME_NET_WORTH_CR) {
    unmet.push({
      code: 'net_worth',
      text: `Net worth ≥ ${ENDGAME_NET_WORTH_CR.toLocaleString()} cr (now ${Math.floor(facts.netWorthCr).toLocaleString()}).`,
      need: ENDGAME_NET_WORTH_CR,
      have: facts.netWorthCr,
    });
  }
  if (facts.branchRep < ENDGAME_REP_MIN) {
    unmet.push({
      code: 'branch_rep',
      text: `Standing ≥ ${ENDGAME_REP_MIN} with your branch faction (now ${facts.branchRep}).`,
      need: ENDGAME_REP_MIN,
      have: facts.branchRep,
    });
  }
  if (!facts.empireStake) {
    unmet.push({
      code: 'empire_stake',
      text: 'Own a capital hull, claim, or outpost.',
    });
  }
  if (facts.endgameResolved) {
    unmet.push({
      code: 'already_resolved',
      text: 'Final disposition already filed.',
    });
  }
  return {
    ok: unmet.length === 0,
    unmet,
    need: {
      netWorthCr: ENDGAME_NET_WORTH_CR,
      repMin: ENDGAME_REP_MIN,
      empireStake: true,
    },
  };
}

/**
 * Evaluate one ending (or sandbox) against state.
 * @returns {{ id, eligible, unmet: Array<{code,text}>, def, facts }}
 */
export function evaluateEndingEligibility(state, endingId) {
  const def = endingDef(endingId);
  const facts = snapshotEndingFacts(state);
  if (!def) {
    return {
      id: endingId,
      eligible: false,
      unmet: [{ code: 'unknown', text: 'Unknown disposition.' }],
      def: null,
      facts,
    };
  }

  if (isSandboxId(def.id)) {
    return evaluateSandboxEligibility(facts, def);
  }

  const unmet = [];
  const shared = evaluateSharedGate(facts);
  for (const u of shared.unmet) unmet.push(u);

  // Alignment (A/B)
  if (def.alignment) {
    const a = def.alignment;
    const branchOk = a.branches && a.branches.includes(facts.branch);
    const facRep = a.factionId === 'faction_scn' ? facts.scnRep
      : a.factionId === 'faction_free' ? facts.freeRep
        : a.factionId === 'faction_mts' ? facts.mtsRep
          : 0;
    const repOk = facRep >= (a.factionRepMin || ENDGAME_REP_MIN);
    const originOk = (a.origins || []).some((o) => facts.origins.includes(o));
    if (!branchOk && !repOk && !originOk) {
      const originHint = (a.origins || []).join('/');
      unmet.push({
        code: 'alignment',
        text: alignmentUnmetText(def.id, a, originHint),
      });
    }
  }

  // World requirements (C/D/E)
  if (def.world) {
    const w = def.world;
    if (w.sectorId && facts.sectorId !== w.sectorId) {
      unmet.push({
        code: 'sector',
        text: 'Be in Ashfall Reach.',
      });
    }
    if (w.fullLoad && !facts.fullLoad) {
      unmet.push({
        code: 'full_load',
        text: 'Hold a full cargo load (≥95% volume).',
      });
    }
    if (w.noActiveMissions && !facts.noActiveMissions) {
      unmet.push({
        code: 'no_missions',
        text: 'Clear all active contracts first.',
      });
    }
    if (w.cargoIds && w.cargoIds.length) {
      for (const id of w.cargoIds) {
        if (!facts.cargoIds.includes(id) && !(id === 'cmdty_personal_ledger' && facts.hasLedger)) {
          unmet.push({
            code: `cargo:${id}`,
            text: id === 'cmdty_personal_ledger'
              ? 'Carry the Kurtz ledger (PERSONAL EFFECTS).'
              : `Carry required cargo (${id}).`,
          });
        }
      }
    }
    if (w.requireLedgerFlag && !facts.hasLedger && !facts.cargoIds.includes('cmdty_personal_ledger')) {
      // already covered by cargo if listed
      if (!unmet.some((u) => u.code === 'cargo:cmdty_personal_ledger')) {
        unmet.push({
          code: 'ledger',
          text: 'Take the ledger from the Kurtz figure.',
        });
      }
    }
    if (w.declineAll && w.declineAll.length) {
      for (const id of w.declineAll) {
        if (!facts.declined.includes(id)) {
          unmet.push({
            code: `decline:${id}`,
            text: `Decline disposition ${id} first.`,
          });
        }
      }
    }
  }

  return {
    id: def.id,
    eligible: unmet.length === 0,
    unmet,
    def,
    facts,
  };
}

function alignmentUnmetText(endingId, alignment, originHint) {
  if (endingId === 'A') {
    return `Lawful path: patrol branch, Concord standing ≥ ${alignment.factionRepMin}, or ${originHint || 'hunter'} origin.`;
  }
  if (endingId === 'B') {
    return `Quiet path: free branch, Freeport standing ≥ ${alignment.factionRepMin}, or ${originHint || 'hauler'} origin.`;
  }
  return 'Alignment requirements unmet.';
}

function evaluateSandboxEligibility(facts, def) {
  const unmet = [];
  // Sandbox requires the offer window (B7 gate met / offered) but is not an ending.
  if (!facts.endgameOffered && !facts.endgameFlag && facts.beatIndex < 7) {
    unmet.push({
      code: 'not_offered',
      text: 'Final disposition not yet available.',
    });
  }
  // Soft gate: still need net worth / rep so sandbox is not a free skip of the campaign.
  if (facts.netWorthCr < ENDGAME_NET_WORTH_CR) {
    unmet.push({
      code: 'net_worth',
      text: `Net worth ≥ ${ENDGAME_NET_WORTH_CR.toLocaleString()} cr to continue open.`,
      need: ENDGAME_NET_WORTH_CR,
      have: facts.netWorthCr,
    });
  }
  if (facts.branchRep < ENDGAME_REP_MIN) {
    unmet.push({
      code: 'branch_rep',
      text: `Standing ≥ ${ENDGAME_REP_MIN} with your branch faction.`,
      need: ENDGAME_REP_MIN,
      have: facts.branchRep,
    });
  }
  if (facts.endgameResolved) {
    unmet.push({
      code: 'already_resolved',
      text: 'Disposition already filed or sandbox already chosen.',
    });
  }
  return {
    id: SANDBOX_ID,
    eligible: unmet.length === 0,
    unmet,
    def: def || SANDBOX_DEF,
    facts,
  };
}

/**
 * List all five endings + sandbox with eligibility and unmet reasons.
 */
export function listEndingEligibility(state) {
  const rows = ENDING_IDS.map((id) => evaluateEndingEligibility(state, id));
  rows.push(evaluateEndingEligibility(state, SANDBOX_ID));
  return rows;
}

/** Ending ids that are currently eligible (excludes sandbox). */
export function listEligibleEndingIds(state) {
  return ENDING_IDS.filter((id) => evaluateEndingEligibility(state, id).eligible);
}

/** Board contract rows (A/B) that pass eligibility. */
export function listBoardEligibleEndingIds(state) {
  return ENDING_DEFS
    .filter((d) => d.boardEligible)
    .filter((d) => evaluateEndingEligibility(state, d.id).eligible)
    .map((d) => d.id);
}

export function listUniqueEndingIds() {
  return ENDING_IDS.slice();
}
