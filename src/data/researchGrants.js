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
// `research:contract` is the exception: it is not a first. After the firsts
// ledger is full, a completed research contract still pays `rp`, at most
// `dailyCap` times per sim-day. Kills are not a row in this table.
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
  // claims.js — a named ace's trophy head lands: combat data is the hunter
  // career's RP path (bounty settlements deliberately stay cash-only).
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
});

// Contract clauses honored at settlement pay fieldwork RP. Granted inside the
// missions settlement loop (mission context already in hand); a mission's
// clauses can only honor once, so no dedup record is needed.
export const CLAUSE_HONOR_RP = 1;

// Bound on persisted researchFirsts keys. Firsts deplete naturally; the cap
// only bounds save size, and evicting the oldest stamp can never double-pay
// a first the player already collected while it was recorded.
export const RESEARCH_FIRSTS_CAP = 256;
