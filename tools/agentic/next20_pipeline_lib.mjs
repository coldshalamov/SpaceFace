/**
 * Next-N dispatch pipeline helpers.
 *
 * The live queue remains `scripts/program-dispatch.mjs --ready` /
 * `readyDispatchUnits`. This module does not rank, admit, or invent units.
 * It snapshots a slate, groups overlapping write-sets so those run in series,
 * and is the only place that may patch a dispatch unit to `done`.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_COUNT = 20;
export const REVIEW_WAVES = 2;

export function normalizePathSpec(value) {
  return String(value || '').replaceAll('\\', '/').replace(/\/+$/, '');
}

/** Two write-set entries overlap when they are equal or one is a directory prefix of the other. */
export function pathsOverlap(a, b) {
  const x = normalizePathSpec(a);
  const y = normalizePathSpec(b);
  if (!x || !y) return false;
  if (x === y) return true;
  return y.startsWith(`${x}/`) || x.startsWith(`${y}/`);
}

export function unitsOverlap(left, right) {
  const a = Array.isArray(left?.paths) ? left.paths : [];
  const b = Array.isArray(right?.paths) ? right.paths : [];
  for (const p of a) {
    for (const q of b) {
      if (pathsOverlap(p, q)) return true;
    }
  }
  return false;
}

export function groupByOverlap(units) {
  const list = Array.isArray(units) ? units : [];
  const n = list.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i) => {
    let x = i;
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  const unite = (i, j) => {
    const a = find(i);
    const b = find(j);
    if (a !== b) parent[b] = a;
  };
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      if (unitsOverlap(list[i], list[j])) unite(i, j);
    }
  }
  const buckets = new Map();
  for (let i = 0; i < n; i += 1) {
    const root = find(i);
    if (!buckets.has(root)) buckets.set(root, []);
    buckets.get(root).push(list[i]);
  }
  const families = [...buckets.values()].sort(
    (a, b) => list.indexOf(a[0]) - list.indexOf(b[0]),
  );
  return families.map((members, index) => ({
    id: `family-${index}`,
    serial: true,
    ids: members.map((unit) => unit.id),
    units: members,
    sharedPaths: sharedOverlapPaths(members),
  }));
}

function sharedOverlapPaths(members) {
  const found = new Set();
  for (let i = 0; i < members.length; i += 1) {
    for (let j = i + 1; j < members.length; j += 1) {
      const a = members[i].paths || [];
      const b = members[j].paths || [];
      for (const p of a) {
        for (const q of b) {
          if (pathsOverlap(p, q)) {
            found.add(normalizePathSpec(p));
            found.add(normalizePathSpec(q));
          }
        }
      }
    }
  }
  return [...found].sort();
}

function isProtected(unit, skipIds, protectedPaths) {
  if (skipIds.has(unit.id)) return `skip-id:${unit.id}`;
  const paths = Array.isArray(unit.paths) ? unit.paths : [];
  for (const p of paths) {
    const norm = normalizePathSpec(p);
    for (const claimed of protectedPaths) {
      if (norm === normalizePathSpec(claimed)) return `protected-path:${claimed}`;
    }
  }
  return null;
}

/**
 * Take the first `count` ready dispatcher units, substituting the next ready
 * row when a frozen id is already gone or its exact write-set is protected.
 */
export function selectSlate(readyUnits, options = {}) {
  const count = Number.isInteger(options.count) ? options.count : DEFAULT_COUNT;
  const skipIds = new Set(options.skipIds || []);
  const protectedPaths = Array.isArray(options.protectedPaths) ? options.protectedPaths : [];
  const frozenIds = Array.isArray(options.frozenIds) ? options.frozenIds : null;
  const ready = Array.isArray(readyUnits) ? readyUnits : [];
  const taken = [];
  const skipped = [];
  const takenIds = new Set();

  const tryTake = (unit, reasonIfSkip) => {
    if (!unit || takenIds.has(unit.id) || taken.length >= count) return;
    const blocked = isProtected(unit, skipIds, protectedPaths);
    if (blocked) {
      skipped.push({ id: unit.id, reason: blocked });
      return;
    }
    taken.push(unit);
    takenIds.add(unit.id);
    if (reasonIfSkip) skipped.push({ id: unit.id, reason: reasonIfSkip, taken: true });
  };

  if (frozenIds && frozenIds.length) {
    const byId = new Map(ready.map((unit) => [unit.id, unit]));
    for (const id of frozenIds) {
      const unit = byId.get(id);
      if (!unit) {
        skipped.push({ id, reason: 'not-ready-or-done' });
        continue;
      }
      tryTake(unit);
    }
    for (const unit of ready) {
      if (taken.length >= count) break;
      if (takenIds.has(unit.id)) continue;
      if (frozenIds.includes(unit.id)) continue;
      tryTake(unit, 'substitute');
    }
  } else {
    for (const unit of ready) {
      if (taken.length >= count) break;
      tryTake(unit);
    }
  }

  const slate = taken.slice(0, count);
  return {
    count,
    source: 'program-dispatch --ready',
    slate,
    skipped,
    families: groupByOverlap(slate),
  };
}

export function compactUnit(unit) {
  if (!unit) return null;
  return {
    id: unit.id,
    parentId: unit.parentId || null,
    title: unit.title || '',
    kind: unit.kind || '',
    priority: unit.priority,
    state: unit.state,
    paths: unit.paths || [],
    checks: unit.checks || [],
    brief: unit.brief || '',
    packet: unit.packet || (unit.parentId ? `design/program/roadmap/active/${unit.parentId}.md` : ''),
    receiptRefs: unit.receiptRefs || [],
  };
}

export function loadReadyFromDispatcher(root, execPath = process.execPath) {
  const result = spawnSync(execPath, ['scripts/program-dispatch.mjs', '--ready'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.status !== 0) {
    const err = (result.stderr || result.stdout || '').trim() || `exit ${result.status}`;
    throw new Error(`program-dispatch --ready failed: ${err}`);
  }
  const parsed = JSON.parse(result.stdout);
  if (!Array.isArray(parsed)) throw new Error('program-dispatch --ready did not return an array');
  return parsed;
}

export function canIntegrate(input) {
  const receiptExists = !!input?.receiptExists;
  const testsPass = !!input?.testsPass;
  const reviews = Array.isArray(input?.reviews) ? input.reviews : [];
  if (!receiptExists) return { ok: false, reason: 'missing-receipt' };
  if (!testsPass) return { ok: false, reason: 'tests-failed' };
  if (reviews.length < REVIEW_WAVES) return { ok: false, reason: 'need-two-review-waves' };
  for (let i = 0; i < REVIEW_WAVES; i += 1) {
    const review = reviews[i];
    if (!review || review.verdict !== 'PASS') {
      return { ok: false, reason: 'review-rejected', wave: review?.wave ?? i + 1 };
    }
    if (!review.evidence || String(review.evidence).trim() === '') {
      return { ok: false, reason: 'review-missing-evidence', wave: review.wave ?? i + 1 };
    }
  }
  return { ok: true };
}

/**
 * Surgical text patch: flip one dispatch unit from ready → done and append a receipt.
 * Avoids rewriting the whole queue document (concurrent agents own other rows).
 */
export function patchDispatchUnitDone(queueText, unitId, receiptRelPath) {
  const idNeedle = `"id": ${JSON.stringify(unitId)}`;
  const start = queueText.indexOf(idNeedle);
  if (start < 0) throw new Error(`dispatch unit ${unitId} not found`);
  const fromId = queueText.slice(start);
  const stateMatch = fromId.match(/"state":\s*"(ready|done|blocked|deferred)"/);
  if (!stateMatch) throw new Error(`dispatch unit ${unitId} has no state field`);
  if (stateMatch[1] !== 'ready' && stateMatch[1] !== 'done') {
    throw new Error(`dispatch unit ${unitId} state is ${stateMatch[1]}, not ready/done`);
  }
  const stateOffset = start + fromId.indexOf(stateMatch[0]);
  let next = `${queueText.slice(0, stateOffset)}"state": "done"${queueText.slice(stateOffset + stateMatch[0].length)}`;

  const rel = String(receiptRelPath || '').replaceAll('\\', '/');
  if (!rel) throw new Error('receiptRelPath is required');
  const again = next.indexOf(idNeedle);
  const window = next.slice(again, again + 4000);
  const refsMatch = window.match(/"receiptRefs":\s*(\[[^\]]*\])/);
  if (!refsMatch) throw new Error(`dispatch unit ${unitId} has no receiptRefs`);
  let refs;
  try {
    refs = JSON.parse(refsMatch[1]);
  } catch {
    throw new Error(`dispatch unit ${unitId} receiptRefs is not a JSON array`);
  }
  if (!Array.isArray(refs)) throw new Error(`dispatch unit ${unitId} receiptRefs is not an array`);
  if (!refs.includes(rel)) refs.push(rel);
  const rendered = JSON.stringify(refs, null, 8).replace(/\n/g, '\n      ');
  const refsAt = again + window.indexOf(refsMatch[0]);
  next = `${next.slice(0, refsAt)}"receiptRefs": ${rendered}${next.slice(refsAt + refsMatch[0].length)}`;
  return next;
}

/** Surgical text patch: return a dispatch unit to ready (keep receiptRefs). */
export function patchDispatchUnitReady(queueText, unitId) {
  const idNeedle = `"id": ${JSON.stringify(unitId)}`;
  const start = queueText.indexOf(idNeedle);
  if (start < 0) throw new Error(`dispatch unit ${unitId} not found`);
  const fromId = queueText.slice(start);
  const stateMatch = fromId.match(/"state":\s*"(ready|done|blocked|deferred)"/);
  if (!stateMatch) throw new Error(`dispatch unit ${unitId} has no state field`);
  const stateOffset = start + fromId.indexOf(stateMatch[0]);
  return `${queueText.slice(0, stateOffset)}"state": "ready"${queueText.slice(stateOffset + stateMatch[0].length)}`;
}

/**
 * Close or refuse a slate from on-disk review JSON. Never flips done without two PASS
 * waves, an existing receipt, and testsPass.
 */
export function applyReviewClose(unitId, input) {
  const gate = canIntegrate(input);
  return {
    id: unitId,
    integrated: false,
    ...gate,
    verdict: gate.ok ? 'ELIGIBLE' : 'FAIL-CLOSED',
  };
}

export function buildImplementerPrompt(unit) {
  const u = compactUnit(unit);
  const paths = (u.paths || []).map((p) => `- ${p}`).join('\n');
  const checks = (u.checks || []).map((c) => `- ${c}`).join('\n');
  return [
    `You are the IMPLEMENTER for SpaceFace dispatch unit ${u.id} (${u.title}).`,
    'Use tools. Read the packet before editing. Do not answer from memory.',
    '',
    'Authority: user direction → ARCHITECTURE.md → design/VISION.md → the packet → supporting refs.',
    'The queue is program-dispatch. Do not invent a second backlog. Do not mark the queue done.',
    '',
    `Packet: ${u.packet}`,
    `Kind: ${u.kind}  Priority: ${u.priority}`,
    `Done-when (brief): ${u.brief}`,
    '',
    'Write-set (stay inside; preserve any currently dirty foreign hunk on these paths):',
    paths || '- (none listed)',
    '',
    'Named checks (run the ones that catch THIS change; do not loop the world):',
    checks || '- (none listed)',
    '',
    'Required procedure:',
    '1. Read design/program/NOW.md and git status --short for the write-set. Preserve exact dirty foreign hunks.',
    '2. Open the packet. Read **How agents get this wrong** before touching code, then the Leaves row for this leaf.',
    '3. Surface before invent: list what already computes the thing; connect it. Do not add a second writer.',
    '4. Implement the Leaves done-when in player units on a named seed. A green check is not the number.',
    '5. Add or extend tests that import the SHIPPED functions (not a copy, not a mock of the unit under test).',
    '6. Write design/program/roadmap/receipts/' + u.id + '-REPORT.md in build_map.md §1.4 words with seed + before/after or honest NOT DONE residual. Never silently omit a clause.',
    '7. Do not edit test/*.expected.json merely to pass. Do not check off program-queue.json. The integrator does that after two review waves.',
    '8. git add -N any new files. Pathspec-commit owned files if you can; skip unrelated dirty files.',
    '',
    'Return JSON: { id, verdict: "DONE"|"NOT DONE", seed, numbers, receiptPath, testsRun, residual }.',
  ].join('\n');
}

export function buildReviewerPrompt(unit, wave, implementerReport = '') {
  const u = compactUnit(unit);
  return [
    `You are REVIEW WAVE ${wave} for SpaceFace dispatch unit ${u.id} (${u.title}).`,
    'You are adversarial and independent of the implementer. Your job is to REFUTE a false close.',
    'Use tools. Re-run the shipped tests. Re-read stills and the receipt. Do not trust the implementer\'s word.',
    '',
    `Packet: ${u.packet}`,
    `Done-when: ${u.brief}`,
    `Write-set: ${(u.paths || []).join(', ')}`,
    implementerReport ? `\nImplementer report (untrusted):\n${implementerReport}\n` : '',
    'Fail closed (verdict FAIL) if any of these hold:',
    '- An unmet Leaves clause, including a silent omit of a visual/TTS/GPU/Chromium bar.',
    '- A golden / expected.json edited only to pass.',
    '- Tests that mock the unit under test, hard-code the expected value, or re-implement the shipped function.',
    '- A still that does not show the claim, is blank, or shows needle-jets when the claim is "honest nozzle thrust".',
    '- Queue state flipped to done by the implementer.',
    '- Wiring-only / stub / receipt-headline with no player-unit measurement.',
    '',
    'Pass only if you independently re-ran the unit tests (or the new tests that drive shipped functions) and they succeeded, AND the receipt quotes the Leaves done-when numbers on a named seed (or honest NOT DONE residual).',
    '',
    'Return JSON: { id, wave, verdict: "PASS"|"FAIL", evidence, unmetClause, testsReRun }.',
  ].join('\n');
}

export function formatPipelineLog(selection) {
  const lines = [];
  const slate = selection.slate || [];
  lines.push('NEXT20 PIPELINE');
  lines.push(`dispatcher: ${selection.source || 'program-dispatch --ready'}`);
  lines.push(`slate (${slate.length}): ${slate.map((u) => u.id).join(', ') || '(empty)'}`);
  lines.push('families (serial within, fan-out across):');
  for (const family of selection.families || []) {
    const shared = (family.sharedPaths || []).join(', ') || 'none';
    lines.push(`  ${family.id} serial [${family.ids.join(', ')}] overlap ${shared}`);
  }
  lines.push('implementer assignment: one worker per unit; serial within family; fan-out only across disjoint families');
  lines.push(`review waves: ${REVIEW_WAVES} independent waves per unit after implementer returns; fail-closed`);
  lines.push('integrator: sole writer of queue state/receiptRefs; refuses without two PASS reviews + existing receipt + testsPass');
  if ((selection.skipped || []).length) {
    lines.push('skipped/substituted:');
    for (const row of selection.skipped) {
      lines.push(`  ${row.id} ${row.reason}${row.taken ? ' (taken as substitute)' : ''}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

export function receiptPathFor(unitId) {
  return `design/program/roadmap/receipts/${unitId}-REPORT.md`;
}

export function assertReceiptOnDisk(root, relPath) {
  const abs = path.resolve(root, relPath);
  if (!fs.existsSync(abs)) return { ok: false, reason: 'receipt-missing', path: relPath };
  const text = fs.readFileSync(abs, 'utf8');
  if (!text.trim()) return { ok: false, reason: 'receipt-empty', path: relPath };
  return { ok: true, path: relPath, bytes: text.length };
}
