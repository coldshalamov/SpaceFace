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
  const testsPass = !!input?.testsPass;
  if (!testsPass) return { ok: false, reason: 'tests-failed' };
  const review = input?.review;
  if (review && review.wouldShip === false) {
    return { ok: false, reason: 'reviewer-would-not-ship', notes: String(review.notes || '').trim() };
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
  if (!rel) return next;
  const again = next.indexOf(idNeedle);
  const window = next.slice(again, again + 4000);
  const refsMatch = window.match(/"receiptRefs":\s*(\[[^\]]*\])/);
  if (!refsMatch) return next;
  let refs;
  try {
    refs = JSON.parse(refsMatch[1]);
  } catch {
    return next;
  }
  if (!Array.isArray(refs)) return next;
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
 * Close or refuse from a teammate look, not from review-file theater.
 * wouldShip false keeps the unit ready so the implementer can fix what was found.
 */
export function applyReviewClose(unitId, input) {
  const gate = canIntegrate(input);
  return {
    id: unitId,
    integrated: false,
    ...gate,
    verdict: gate.ok ? 'ELIGIBLE' : 'NOT-YET',
  };
}

export function buildImplementerPrompt(unit) {
  const u = compactUnit(unit);
  const paths = (u.paths || []).map((p) => `- ${p}`).join('\n');
  const checks = (u.checks || []).map((c) => `- ${c}`).join('\n');
  return [
    `You are building SpaceFace unit ${u.id} — ${u.title}.`,
    'This is production. Care about how it plays, how it looks, and whether a person would enjoy it.',
    'The first version that merely meets the bar is a draft. Look at it, find the cheap bits, and make it good.',
    '',
    `Packet: ${u.packet}`,
    `Kind: ${u.kind}  Priority: ${u.priority}`,
    `What done looks like: ${u.brief}`,
    '',
    'Stay on this write-set. Preserve any currently dirty foreign hunk on these paths:',
    paths || '- (none listed)',
    '',
    'Checks that catch THIS change (run these, not the world):',
    checks || '- (none listed)',
    '',
    'How to work:',
    '- Glance at NOW.md and git status so you do not collide. Then start.',
    '- Read How agents get this wrong, then the Leaves row. Connect what already exists before inventing.',
    '- Play the change on the default route. If the player would see or hear it, look at it.',
    '- Tests import shipped functions. Do not mock the thing under test. Do not edit goldens merely to pass.',
    '- Do not mark the queue done. Do not invent a second backlog. Do not store stills or review files.',
    '- A short note for the next engineer only if you learned something they could not see from the code.',
    '',
    'Return JSON: { id, verdict: "DONE"|"NOT DONE", notes }.',
  ].join('\n');
}

export function buildReviewerPrompt(unit, _wave, implementerReport = '') {
  const u = compactUnit(unit);
  return [
    `Look at the work for SpaceFace unit ${u.id} — ${u.title}.`,
    'You are a teammate, not a gate. Read the actual change. Play it if the player would see it.',
    'Find three things: what is unfinished, what is buggy, and what would make it better.',
    'Be specific. A lazy first try is common — catch it with taste, not with a checklist.',
    'Do not write review JSON as the product. Do not archive stills. Do not re-type test stdout as evidence.',
    '',
    `Packet: ${u.packet}`,
    `What done looks like: ${u.brief}`,
    `Write-set: ${(u.paths || []).join(', ')}`,
    implementerReport ? `\nImplementer notes (untrusted):\n${implementerReport}\n` : '',
    'wouldShip=true only if you would put this in front of the owner tonight.',
    'wouldShip=false if it is unfinished, buggy, thin, or cheap — say what to fix.',
    '',
    'Return JSON: { id, wouldShip, unfinished, bugs, improvements }.',
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
  lines.push('implementer: one worker per unit; serial within overlapping write-sets; fan-out across disjoint families');
  lines.push('review: one teammate look per unit for unfinished work, bugs, and improvements — then fix what is real');
  lines.push('integrator: sole writer of queue state; refuses if tests that catch the change failed or the reviewer would not ship it');
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
