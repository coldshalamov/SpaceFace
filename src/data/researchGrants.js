// src/data/researchGrants.js – event -> research-point grant table.
//
// Single-writer contract: missions.js is the sole positive writer of
// state.player.researchPoints (ARCHITECTURE §3.5 seam). This file is pure
// data so every grant's size and dedup field stay declarative and auditable
// from one place.
//
// Each one-time entry maps a bus event to { rp, scope, field }: missions reads
// payload[field] and dedupes on `${scope}:${value}` inside the bounded
// state.player.researchFirsts record, so a grant pays once per durable
// discovery (per anomaly, per signal, per named wreck, per ace) — firsts
// are a finite early pool by design, never a repeatable RP farm.
//
// The `repeatable` rows are the exception: they are not firsts. They are paid
// at contract settlement by missions.js and counted in a per-sim-day ledger.
//   - `research:contract` waits for the firsts ledger to fill, then pays `rp`
//     for a completed recon or salvage contract, at most `dailyCap` times a day.
//   - `research:bounty` and `research:mining` are the fighter's and miner's
//     faucet: a completed bounty_hunt or mining_quota contract pays
//     `rp + perRiskTier * riskTier`, at most `dailyCap` times a day, per row.
//     They pay only once the player already owns `requiresNode` (the first node
//     of that path), so RP can never pull a pilot into the entry purchase early,
//     and `requiresNode` must cost no RP or the faucet could never start.
// Loose kills are still not a row in this table: combat data pays through the
// bounty settlement and the named-ace trophy head, never per kill.
//
// PQ-155 follow-on: these sources widen the RP faucet named by the
// techVerbLadder canyon without touching mission-settlement RP.

export const RESEARCH_GRANTS = Object.freeze({
  // scanner.js — three-pulse anomaly fix completes (or two with a fitted
  // Triangulation Suite). Dedup per POI record.
  'anomaly:triangulated': Object.freeze({ rp: 3, scope: 'anomaly', field: 'poiId' }),
  // scanner.js — physically reaching a tracked durable signal. Dedup per
  // signal record id.
  'signal:investigated': Object.freeze({ rp: 3, scope: 'signal', field: 'signalId' }),
  // scanner.js — ghost contact fully revealed. Dedup per entity.
  'scanner:ghostRevealed': Object.freeze({ rp: 1, scope: 'ghost', field: 'entityId' }),
  // uniqueWrecks.js — a named wreck reaches a resolved decision. Dedup per
  // authored wreck id.
  'uniqueWreck:resolved': Object.freeze({ rp: 4, scope: 'wreck', field: 'wreckId' }),
  // claims.js — a named ace's trophy head lands: a one-time combat first per
  // ace. Ordinary bounty contracts add the repeatable `research:bounty` row.
  'claim:trophyHeadGranted': Object.freeze({ rp: 6, scope: 'ace', field: 'aceId' }),
  // missions.js settlement — recon and salvage only, after RESEARCH_FIRSTS_CAP
  // firsts exist. Not subscribed as a first: repeatable rows never enter
  // researchFirsts. dailyCap is the per-sim-day ceiling.
  'research:contract': Object.freeze({
    rp: 2,
    scope: 'research_contract',
    field: 'missionId',
    repeatable: true,
    dailyCap: 4,
    types: Object.freeze(['recon_scan', 'salvage_retrieval']),
  }),
  // missions.js settlement — a completed bounty_hunt contract, once the pilot
  // owns Combat Basics. Risk tier 1..3 bounties pay 2..4 RP; eight a sim-day
  // (about 24 RP) opens Strike Craft and the first beam/driver nodes.
  'research:bounty': Object.freeze({
    rp: 1,
    perRiskTier: 1,
    scope: 'research_bounty',
    field: 'missionId',
    repeatable: true,
    dailyCap: 8,
    types: Object.freeze(['bounty_hunt']),
    requiresNode: 'tech_combat_basics',
  }),
  // missions.js settlement — a completed mining_quota contract, once the pilot
  // owns Industrial Mining. The base carries a tier-0 quota (the only kind most
  // starter boards post): four a sim-day (8 RP) opens Focused Extraction.
  'research:mining': Object.freeze({
    rp: 2,
    perRiskTier: 1,
    scope: 'research_mining',
    field: 'missionId',
    repeatable: true,
    dailyCap: 4,
    types: Object.freeze(['mining_quota']),
    requiresNode: 'tech_industrial_mining',
  }),
});

// Contract clauses honored at settlement pay fieldwork RP. Granted inside the
// missions settlement loop (mission context already in hand); a mission's
// clauses can only honor once, so no dedup record is needed.
export const CLAUSE_HONOR_RP = 1;

// Bound on persisted researchFirsts keys. Firsts deplete naturally; the cap
// only bounds save size, and evicting the oldest stamp can never double-pay
// a first the player already collected while it was recorded.
export const RESEARCH_FIRSTS_CAP = 256;
