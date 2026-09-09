// Pure ending eligibility against live campaign facts.
// Returns player-visible unmet conditions. Never mutates state.

import { MODULES } from '../../data/modules.js';
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
const MODULE_BY_ID = new Map(MODULES.map((def) => [def.id, def]));

/** Ace-memory bag keys that are not named-ace records. Read-only; aceMemory owns writes. */
const ACE_MEMORY_META = new Set([
  'schemaVersion', 'news', 'activeReturns', 'cultureIntros', 'planetChallenges', 'playerStyle', 'aces',
]);

const TOW_CLASS_RANK = Object.freeze({ none: 0, light: 1, medium: 2, heavy: 3 });
/** Heavy-verb tow floor (industrial spool / frame coupler / spine long tow). */
export const TOW_CLASS_MIN = 'medium';
/** PQ-032.00 first_blood — pods in the field. */
const SPINE_FIELD_BEAT = 2;
/** PQ-032.00 bigger_boat — the long tow. */
const SPINE_TOW_BEAT = 3;

function towClassRank(name) {
  return TOW_CLASS_RANK[name] || 0;
}

function higherTowClass(a, b) {
  return towClassRank(a) >= towClassRank(b) ? (a || 'none') : (b || 'none');
}

function pushFittingId(slot, out) {
  if (!slot) return;
  if (typeof slot === 'string') {
    out.push(slot);
    return;
  }
  if (typeof slot === 'object') {
    const id = slot.defId || slot.id;
    if (id) out.push(id);
  }
}

function collectFittingIds(state) {
  const out = [];
  const owned = state && state.player && Array.isArray(state.player.ownedShips)
    ? state.player.ownedShips
    : [];
  for (const ship of owned) {
    if (!ship || !Array.isArray(ship.fittings)) continue;
    for (const slot of ship.fittings) pushFittingId(slot, out);
  }
  const entities = state && state.entities;
  const playerId = state && state.playerId;
  const live = entities && typeof entities.get === 'function' && playerId != null
    ? entities.get(playerId)
    : null;
  const liveFits = live && live.data && live.data.fittings;
  if (Array.isArray(liveFits)) {
    for (const slot of liveFits) pushFittingId(slot, out);
  }
  return out;
}

function towClassFromFittings(state) {
  let spool = 1;
  let hasHead = false;
  let hasCoupler = false;
  for (const id of collectFittingIds(state)) {
    const def = MODULE_BY_ID.get(id);
    if (!def) continue;
    const mods = def.mods || {};
    if (Number.isFinite(mods.tetherSpoolMult) && mods.tetherSpoolMult > spool) {
      spool = mods.tetherSpoolMult;
    }
    if (mods.masslineHeadId) {
      hasHead = true;
      if (mods.masslineHeadId === 'frame_coupler') hasCoupler = true;
    }
  }
  if (spool >= 6) return 'heavy';
  if (spool >= 3 || hasCoupler) return 'medium';
  if (spool > 1 || hasHead) return 'light';
  return 'none';
}

function completedNamedKind(state, kinds) {
  const log = state && state.missions && Array.isArray(state.missions.completedLog)
    ? state.missions.completedLog
    : [];
  for (const row of log) {
    if (!row) continue;
    const type = String(row.type || '');
    const id = String(row.id || row.storyTag || '');
    if (kinds.includes(type) || kinds.some((kind) => id.includes(kind))) return true;
  }
  return false;
}

function readTowClass(state, beatIndex) {
  let cls = higherTowClass(
    towClassFromFittings(state),
    beatIndex >= SPINE_TOW_BEAT ? 'medium' : 'none',
  );
  if (completedNamedKind(state, ['tow_recovery', 'bigger_boat'])) {
    cls = higherTowClass(cls, 'medium');
  }
  return cls;
}

function countDepletedFields(state) {
  const discovery = state && state.world && state.world.discovery;
  if (!discovery || typeof discovery !== 'object') return 0;
  let n = 0;
  for (const rec of Object.values(discovery)) {
    const bag = rec && rec.fieldsDepleted;
    if (!bag || typeof bag !== 'object') continue;
    for (const value of Object.values(bag)) {
      if (Number(value) > 0) n += 1;
    }
  }
  return n;
}

function countDeployedPlayerFields(state) {
  const bag = state && state.fields && state.fields.deployed;
  if (!bag || typeof bag !== 'object') return 0;
  const playerId = state.playerId;
  let n = 0;
  for (const rec of Object.values(bag)) {
    if (!rec) continue;
    if (playerId != null && rec.sourceId != null && rec.sourceId !== playerId) continue;
    n += 1;
  }
  return n;
}

function readFieldCount(state, beatIndex) {
  let n = countDepletedFields(state) + countDeployedPlayerFields(state);
  if (beatIndex >= SPINE_FIELD_BEAT) n = Math.max(n, 1);
  if (completedNamedKind(state, ['rescue_under_fire', 'first_blood'])) n = Math.max(n, 1);
  return n;
}

function pushDefeatedAce(id, rec, out) {
  if (!id || ACE_MEMORY_META.has(id) || !rec || typeof rec !== 'object') return;
  if (rec.defeated === true) out.add(String(rec.id || id));
}

function readDefeatedAceIds(state) {
  const memory = state && state.aceMemory;
  const out = new Set();
  if (!memory || typeof memory !== 'object') return [];
  if (memory.aces && typeof memory.aces === 'object') {
    for (const [id, rec] of Object.entries(memory.aces)) pushDefeatedAce(id, rec, out);
  }
  for (const [id, rec] of Object.entries(memory)) {
    pushDefeatedAce(id, rec, out);
  }
  return [...out].sort();
}

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
  const beatIndex = Number(story.beatIndex) || 0;
  const towClass = readTowClass(s, beatIndex);
  const fieldCount = readFieldCount(s, beatIndex);
  const aceIdsBeaten = readDefeatedAceIds(s);
  const acesBeaten = aceIdsBeaten.length;
  const combatStake = acesBeaten >= 1;
  const empireStake = capitalOwned || hasClaim || hasOutpost;

  return Object.freeze({
    beatIndex,
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
    empireStake,
    combatStake,
    worldStake: empireStake || combatStake,
    towClass,
    towClassOk: towClassRank(towClass) >= TOW_CLASS_RANK[TOW_CLASS_MIN],
    fieldCount,
    hasField: fieldCount >= 1,
    acesBeaten,
    aceIdsBeaten: Object.freeze(aceIdsBeaten.slice()),
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

/** Choice E is a physical Ash Cache contact, never a board row or global comms modal. */
export function isChoiceECourierReady(state, stationId) {
  if (stationId !== 'station_ashcache') return false;
  const story = state && state.story;
  if (!story || story.endgameChoice || story.endgameResolved
      || (story.flags && story.flags.sandboxContinued)) return false;
  return evaluateEndingEligibility(state, 'E').eligible;
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
 * Shared B7 disposition gate (net worth, branch rep, heavy-verb tier, world stake).
 * World stake is leftover empire (capital / claim / outpost) or a combat stake (one ace beaten).
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
  if (towClassRank(facts.towClass) < TOW_CLASS_RANK[TOW_CLASS_MIN]) {
    unmet.push({
      code: 'tow_class',
      text: `Tow class ≥ ${TOW_CLASS_MIN} (now ${facts.towClass || 'none'}).`,
      need: TOW_CLASS_MIN,
      have: facts.towClass || 'none',
    });
  }
  if (!facts.hasField) {
    unmet.push({
      code: 'field',
      text: 'Work one field.',
    });
  }
  if (!facts.empireStake && !facts.combatStake) {
    unmet.push({
      code: 'empire_stake',
      text: 'Own a capital hull, claim, or outpost — or beat a named ace.',
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
      empireStake: !facts.combatStake,
      combatStake: !facts.empireStake,
      towClass: TOW_CLASS_MIN,
      field: 1,
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
