#!/usr/bin/env node
// check:dispatch-discipline — PROD-004 fixture suite + live-log gate.
//
// 1. Fixtures (temp control root): the violation state machine must record,
//    upgrade, and permanently mark ignored violations exactly as specified in
//    11_ENFORCEMENT_MACHINERY_SPEC §3.
// 2. Live gate: if .campaign/dispatch-log.json exists, it must validate and
//    contain ZERO violations with actionTaken "ignored" — ignored violations
//    are permanent process failures, the exact laziness this system exists to catch.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadLog, markSoloTurn, markDispatch, markBlocker, validateLog, emptyLog, saveLog,
} from '../tools/production/dispatch-log.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

let failures = 0;
let checks = 0;
function expect(cond, msg) {
  checks++;
  console.log(`  ${cond ? 'ok   ' : 'FAIL '} ${msg}`);
  if (!cond) failures++;
}

const SID = 'fixture-session';

console.log('D1: solo turns within budget record no violation');
{
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-dd-'));
  for (let i = 0; i < 3; i++) markSoloTurn(root, SID);
  const log = loadLog(root, SID);
  expect(log.turnsSinceLastDispatch === 3, `counter at 3 (got ${log.turnsSinceLastDispatch})`);
  expect(log.totalSoloViolations === 0, 'no violation inside budget');
}

console.log('D2: exceeding the budget records a violation; a dispatch upgrades it');
{
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-dd-'));
  for (let i = 0; i < 4; i++) markSoloTurn(root, SID);
  let log = loadLog(root, SID);
  expect(log.totalSoloViolations === 1, `violation recorded on turn 4 (got ${log.totalSoloViolations})`);
  expect(log.violations[0].actionTaken === 'pending', 'violation pending until next action');
  markDispatch(root, SID, { packetId: 'P-1', agent: 'codex', model: 'gpt-5.6', lane: 'code_mutation' });
  log = loadLog(root, SID);
  expect(log.violations[0].actionTaken === 'dispatched', 'dispatch resolves the pending violation');
  expect(log.turnsSinceLastDispatch === 0, 'counter reset by dispatch');
  expect(log.lanes.code_mutation.packetId === 'P-1', 'lane leased by dispatch');
  expect(log.currentSprint.activePackets.includes('P-1'), 'packet active');
}

console.log('D3: a blocker is a valid alternative to dispatching');
{
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-dd-'));
  for (let i = 0; i < 4; i++) markSoloTurn(root, SID);
  markBlocker(root, SID, { packetId: 'P-2', reason: 'waiting on external usage-limit reset at 03:54' });
  const log = loadLog(root, SID);
  expect(log.violations[0].actionTaken === 'recorded_blocker', 'blocker resolves the pending violation');
  expect(log.turnsSinceLastDispatch === 0, 'counter reset by blocker');
  expect(log.currentSprint.blockedPackets.some((b) => b.packetId === 'P-2'), 'blocker recorded in sprint');
}

console.log('D4: ignoring the warning is permanent and fails the live gate');
{
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-dd-'));
  for (let i = 0; i < 5; i++) markSoloTurn(root, SID); // turn 5 ignores turn-4 violation
  const log = loadLog(root, SID);
  expect(log.violations[0].actionTaken === 'ignored', 'earlier violation marked ignored by the next solo turn');
  expect(log.violations.length === 2 && log.violations[1].actionTaken === 'pending', 'new violation opened');
  const ignoredCount = log.violations.filter((v) => v.actionTaken === 'ignored').length;
  expect(ignoredCount === 1, 'exactly one ignored violation');
}

console.log('D5: structural validation rejects malformed logs');
{
  const good = emptyLog(SID);
  expect(validateLog(good).length === 0, 'empty log validates');
  const bad1 = { ...good, logId: 'wrong' };
  expect(validateLog(bad1).length > 0, 'wrong logId rejected');
  const bad2 = { ...good, lanes: { code: { status: 'leased', packetId: null } } };
  expect(validateLog(bad2).length > 0, 'leased lane without packetId rejected');
  const bad3 = { ...good, currentSprint: { ...good.currentSprint, blockedPackets: [{ packetId: 'X', blocker: 'short' }] } };
  expect(validateLog(bad3).length > 0, 'blocker reason under 10 chars rejected');
}

console.log('D6: saveLog refuses to persist an invalid log');
{
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-dd-'));
  const log = emptyLog(SID);
  log.logId = 'tampered';
  let threw = false;
  try { saveLog(root, log); } catch { threw = true; }
  expect(threw, 'invalid log rejected at save');
}

console.log('LIVE: real .campaign/dispatch-log.json gate');
{
  const liveFile = path.join(REPO_ROOT, '.campaign', 'dispatch-log.json');
  if (!fs.existsSync(liveFile)) {
    console.log('  ok    no live dispatch log yet (nothing to gate)');
  } else {
    const live = JSON.parse(fs.readFileSync(liveFile, 'utf8'));
    const errors = validateLog(live);
    expect(errors.length === 0, `live log validates (${errors.join('; ') || 'clean'})`);
    const ignored = (live.violations || []).filter((v) => v.actionTaken === 'ignored').length;
    expect(ignored === 0, `live log has zero IGNORED violations (got ${ignored} — permanent process failure)`);
  }
}

console.log(`\ncheck:dispatch-discipline — ${checks - failures}/${checks} assertions passed`);
if (failures > 0) process.exit(1);
console.log('PROD-004 dispatch discipline: PASS');
