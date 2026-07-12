#!/usr/bin/env node
// PROD-004 — dispatch discipline tracker (11_ENFORCEMENT_MACHINERY_SPEC §3).
//
// Mechanically detects the orchestrator collapsing to solo work. The log file
// (.campaign/dispatch-log.json, schema design/production/schemas/dispatch-log.schema.json)
// survives compaction; the prose rule does not. markSoloTurn() past the budget
// records a violation whose `actionTaken` is resolved by whatever happens next:
// a dispatch or blocker upgrades it, another solo turn marks it permanently
// "ignored" — and ignored violations fail check:dispatch-discipline forever.
//
// CLI:
//   node tools/production/dispatch-log.mjs status
//   node tools/production/dispatch-log.mjs mark-solo
//   node tools/production/dispatch-log.mjs mark-dispatch <packetId> <agent> <model> <lane>
//   node tools/production/dispatch-log.mjs mark-blocker <packetId> <reason...>
//   node tools/production/dispatch-log.mjs mark-return <packetId>
//   node tools/production/dispatch-log.mjs lane <name> <free|leased|blocked> [packetId]
//   (all accept --control-root <dir>, default <cwd>/.campaign, and --session <id>)
import fs from 'node:fs';
import path from 'node:path';
import { atomicWriteJson, readJson, nowIso } from './lib/util.mjs';

export const DEFAULT_BUDGET = 3;

export function logPath(controlRoot) {
  return path.join(controlRoot, 'dispatch-log.json');
}

export function emptyLog(sessionId) {
  return {
    schemaVersion: 1,
    logId: 'dispatch-discipline',
    lastUpdatedBySession: sessionId,
    soloTurnBudget: DEFAULT_BUDGET,
    turnsSinceLastDispatch: 0,
    lastDispatchAt: nowIso(),
    totalDispatches: 0,
    totalSoloTurns: 0,
    totalSoloViolations: 0,
    currentSprint: { milestone: 'unset', activePackets: [], readyPackets: [], blockedPackets: [] },
    lanes: {},
    violations: [],
    recentDispatches: [],
  };
}

export function loadLog(controlRoot, sessionId) {
  try {
    return readJson(logPath(controlRoot));
  } catch {
    return emptyLog(sessionId);
  }
}

export function saveLog(controlRoot, log) {
  const errors = validateLog(log);
  if (errors.length) throw new Error(`dispatch log invalid: ${errors.join('; ')}`);
  atomicWriteJson(logPath(controlRoot), log);
}

// A pending violation is the newest one whose action is not yet resolved.
function pendingViolation(log) {
  const last = log.violations[log.violations.length - 1];
  return last && last.actionTaken === 'pending' ? last : null;
}

function resolvePending(log, action) {
  const pending = pendingViolation(log);
  if (pending) pending.actionTaken = action;
}

export function markSoloTurn(controlRoot, sessionId) {
  const log = loadLog(controlRoot, sessionId);
  log.lastUpdatedBySession = sessionId;
  log.totalSoloTurns += 1;
  log.turnsSinceLastDispatch += 1;

  // A solo turn taken while a violation is pending = the warning was ignored.
  const pending = pendingViolation(log);
  if (pending) pending.actionTaken = 'ignored';

  let warned = false;
  if (log.turnsSinceLastDispatch > log.soloTurnBudget) {
    log.totalSoloViolations += 1;
    log.violations.push({
      at: nowIso(),
      sessionId,
      turnsOver: log.turnsSinceLastDispatch - log.soloTurnBudget,
      actionTaken: 'pending',
    });
    warned = true;
  }
  saveLog(controlRoot, log);
  if (warned) {
    console.log(
      `⚠ DISPATCH VIOLATION: ${log.turnsSinceLastDispatch} solo turns since last dispatch ` +
      `(budget ${log.soloTurnBudget}). Dispatch now or record a blocker — anything else is recorded as "ignored".`
    );
  }
  return log;
}

export function markDispatch(controlRoot, sessionId, { packetId, agent, model, lane }) {
  const log = loadLog(controlRoot, sessionId);
  log.lastUpdatedBySession = sessionId;
  resolvePending(log, 'dispatched');
  log.turnsSinceLastDispatch = 0;
  log.totalDispatches += 1;
  log.lastDispatchAt = nowIso();
  log.recentDispatches.push({ packetId, agent, model, lane, at: nowIso(), status: 'dispatched' });
  while (log.recentDispatches.length > 20) log.recentDispatches.shift();
  if (!log.currentSprint.activePackets.includes(packetId)) log.currentSprint.activePackets.push(packetId);
  log.currentSprint.readyPackets = log.currentSprint.readyPackets.filter((p) => p !== packetId);
  log.currentSprint.blockedPackets = log.currentSprint.blockedPackets.filter((b) => b.packetId !== packetId);
  if (lane) log.lanes[lane] = { status: 'leased', packetId };
  saveLog(controlRoot, log);
  return log;
}

export function markBlocker(controlRoot, sessionId, { packetId, reason }) {
  const log = loadLog(controlRoot, sessionId);
  log.lastUpdatedBySession = sessionId;
  resolvePending(log, 'recorded_blocker');
  log.turnsSinceLastDispatch = 0;
  const existing = log.currentSprint.blockedPackets.find((b) => b.packetId === packetId);
  if (existing) existing.blocker = reason;
  else log.currentSprint.blockedPackets.push({ packetId, blocker: reason });
  saveLog(controlRoot, log);
  return log;
}

export function markReturn(controlRoot, sessionId, packetId) {
  const log = loadLog(controlRoot, sessionId);
  log.lastUpdatedBySession = sessionId;
  for (const d of log.recentDispatches) {
    if (d.packetId === packetId && d.status === 'dispatched') d.status = 'returned';
  }
  log.currentSprint.activePackets = log.currentSprint.activePackets.filter((p) => p !== packetId);
  for (const [name, lane] of Object.entries(log.lanes)) {
    if (lane.packetId === packetId && lane.status === 'leased') log.lanes[name] = { status: 'free', packetId: null };
  }
  saveLog(controlRoot, log);
  return log;
}

export function setLane(controlRoot, sessionId, { name, status, packetId = null, blockedReason = null }) {
  const log = loadLog(controlRoot, sessionId);
  log.lastUpdatedBySession = sessionId;
  log.lanes[name] = blockedReason ? { status, packetId, blockedReason } : { status, packetId };
  saveLog(controlRoot, log);
  return log;
}

// Minimal structural validation against dispatch-log.schema.json (same trust-boundary
// philosophy as lib/validate.mjs: readable in one sitting, no dependency).
export function validateLog(log) {
  const errors = [];
  const err = (m) => errors.push(m);
  if (log.schemaVersion !== 1) err('schemaVersion must be 1');
  if (log.logId !== 'dispatch-discipline') err('logId must be dispatch-discipline');
  if (typeof log.lastUpdatedBySession !== 'string' || !log.lastUpdatedBySession) err('lastUpdatedBySession required');
  for (const k of ['soloTurnBudget', 'turnsSinceLastDispatch', 'totalDispatches', 'totalSoloTurns', 'totalSoloViolations']) {
    if (!Number.isInteger(log[k]) || log[k] < 0) err(`${k} must be a non-negative integer`);
  }
  if (typeof log.lastDispatchAt !== 'string') err('lastDispatchAt required');
  const cs = log.currentSprint;
  if (!cs || typeof cs.milestone !== 'string' || !Array.isArray(cs.activePackets) ||
      !Array.isArray(cs.readyPackets) || !Array.isArray(cs.blockedPackets)) {
    err('currentSprint malformed');
  } else {
    for (const b of cs.blockedPackets) {
      if (!b.packetId || typeof b.blocker !== 'string' || b.blocker.length < 10) err(`blockedPackets entry malformed: ${JSON.stringify(b)}`);
    }
  }
  if (typeof log.lanes !== 'object' || log.lanes === null) err('lanes must be an object');
  else {
    for (const [name, lane] of Object.entries(log.lanes)) {
      if (!['free', 'leased', 'blocked'].includes(lane.status)) err(`lane ${name} bad status`);
      if (lane.status === 'leased' && !lane.packetId) err(`lane ${name} leased without packetId`);
    }
  }
  if (!Array.isArray(log.violations)) err('violations must be an array');
  else {
    for (const v of log.violations) {
      if (!['dispatched', 'recorded_blocker', 'ignored', 'pending'].includes(v.actionTaken)) {
        err(`violation actionTaken invalid: ${v.actionTaken}`);
      }
    }
  }
  if (!Array.isArray(log.recentDispatches) || log.recentDispatches.length > 20) err('recentDispatches must be an array of <=20');
  return errors;
}

export function statusSummary(log) {
  const ignored = log.violations.filter((v) => v.actionTaken === 'ignored').length;
  const pending = log.violations.filter((v) => v.actionTaken === 'pending').length;
  const lines = [
    `dispatch discipline — solo turns since last dispatch: ${log.turnsSinceLastDispatch}/${log.soloTurnBudget}` +
      (log.turnsSinceLastDispatch > log.soloTurnBudget ? '  ⚠ OVER BUDGET' : ''),
    `totals: ${log.totalDispatches} dispatches, ${log.totalSoloTurns} solo turns, ${log.totalSoloViolations} violations (${ignored} ignored, ${pending} pending)`,
    `sprint [${log.currentSprint.milestone}] active: ${log.currentSprint.activePackets.join(', ') || '-'}`,
    `ready (dispatch obligations): ${log.currentSprint.readyPackets.join(', ') || '-'}`,
    `blocked: ${log.currentSprint.blockedPackets.map((b) => b.packetId).join(', ') || '-'}`,
    `lanes: ${Object.entries(log.lanes).map(([n, l]) => `${n}=${l.status}${l.packetId ? `(${l.packetId})` : ''}`).join('  ') || '-'}`,
    `last dispatch: ${log.lastDispatchAt}`,
  ];
  return lines.join('\n');
}

// ---------- CLI ----------
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
if (isMain) {
  const argv = process.argv.slice(2);
  const flags = { controlRoot: path.join(process.cwd(), '.campaign'), session: process.env.SF_SESSION_ID || 'orchestrator' };
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--control-root') flags.controlRoot = path.resolve(argv[++i]);
    else if (argv[i] === '--session') flags.session = argv[++i];
    else pos.push(argv[i]);
  }
  const [cmd, ...rest] = pos;
  try {
    if (cmd === 'status' || cmd === undefined) {
      console.log(statusSummary(loadLog(flags.controlRoot, flags.session)));
    } else if (cmd === 'mark-solo') {
      markSoloTurn(flags.controlRoot, flags.session);
      console.log(statusSummary(loadLog(flags.controlRoot, flags.session)).split('\n')[0]);
    } else if (cmd === 'mark-dispatch') {
      const [packetId, agent, model, lane] = rest;
      if (!packetId || !agent || !model) throw new Error('usage: mark-dispatch <packetId> <agent> <model> [lane]');
      markDispatch(flags.controlRoot, flags.session, { packetId, agent, model, lane });
      console.log(`dispatched ${packetId} -> ${agent} (${model})${lane ? ` on ${lane}` : ''}`);
    } else if (cmd === 'mark-blocker') {
      const [packetId, ...reasonParts] = rest;
      const reason = reasonParts.join(' ');
      if (!packetId || reason.length < 10) throw new Error('usage: mark-blocker <packetId> <reason of >=10 chars>');
      markBlocker(flags.controlRoot, flags.session, { packetId, reason });
      console.log(`blocker recorded for ${packetId}`);
    } else if (cmd === 'mark-return') {
      const [packetId] = rest;
      if (!packetId) throw new Error('usage: mark-return <packetId>');
      markReturn(flags.controlRoot, flags.session, packetId);
      console.log(`returned ${packetId}`);
    } else if (cmd === 'lane') {
      const [name, status, packetId] = rest;
      if (!name || !['free', 'leased', 'blocked'].includes(status)) throw new Error('usage: lane <name> <free|leased|blocked> [packetId]');
      setLane(flags.controlRoot, flags.session, { name, status, packetId: packetId || null });
      console.log(`lane ${name} -> ${status}${packetId ? ` (${packetId})` : ''}`);
    } else {
      throw new Error(`unknown command: ${cmd}`);
    }
  } catch (e) {
    console.error(String(e.message || e));
    process.exit(1);
  }
}
