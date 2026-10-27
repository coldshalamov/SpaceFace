/** A read-only brief index over the existing build map, not a second dispatch queue. */
export const PROGRAM_SCHEMA = 'spaceface.strategicChaosProgram.v1';
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export function safeRepoPath(value) {
  return typeof value === 'string' && value.length > 0 && !value.includes('\\')
    && !value.includes('\0') && !value.startsWith('/') && !value.includes(':')
    && value.split('/').every(part => part && part !== '.' && part !== '..');
}
export function validateProgram(program) {
  const issues = [];
  const fail = (path, message) => issues.push({ path, message });
  if (!plain(program) || program.schema !== PROGRAM_SCHEMA || !Array.isArray(program.tasks)) {
    return { ok: false, issues: [{ path: '$', message: 'Expected a strategic-chaos program with a tasks array.' }] };
  }
  if (!/^[a-f0-9]{40}$/.test(program.inspectedBase || '')) fail('inspectedBase', 'An exact inspected commit is required.');
  if (program.authority !== 'build_map.md') fail('authority', 'The existing build map remains dispatch authority.');
  if (!program.tasks.length) fail('tasks', 'At least one task is required.');
  const byId = new Map();
  for (const [i, task] of program.tasks.entries()) {
    const at = `tasks[${i}]`;
    if (!plain(task)) { fail(at, 'Task must be an object.'); continue; }
    if (!/^SC-\d{2}$/.test(task.id || '') || byId.has(task.id)) fail(`${at}.id`, 'Unique SC document label required.');
    byId.set(task.id, task);
    for (const key of ['title', 'outcome', 'acceptance', 'writeBoundary']) {
      if (typeof task[key] !== 'string' || !task[key].trim()) fail(`${at}.${key}`, 'Nonempty player-facing contract required.');
    }
    if (!safeRepoPath(task.document)) fail(`${at}.document`, 'Document must be a repository-relative path.');
    for (const key of ['parents', 'ownerPaths', 'dependsOn', 'overlapPRs', 'grunt']) {
      if (!Array.isArray(task[key])) fail(`${at}.${key}`, 'Array required.');
    }
    if (!Array.isArray(task.parents) || !task.parents.length || task.parents.some(x => typeof x !== 'string' || !x.trim())) fail(`${at}.parents`, 'Name existing build-map parents.');
    if (!Array.isArray(task.ownerPaths) || !task.ownerPaths.length || task.ownerPaths.some(x => !safeRepoPath(x))) fail(`${at}.ownerPaths`, 'Concrete existing owner paths required.');
    if (!Array.isArray(task.grunt) || !task.grunt.length || task.grunt.some(x => typeof x !== 'string' || !x.trim())) fail(`${at}.grunt`, 'Give downstream agents executable work, not just a feeling.');
    if (Array.isArray(task.overlapPRs) && task.overlapPRs.some(x => !Number.isSafeInteger(x) || x <= 0)) fail(`${at}.overlapPRs`, 'PR numbers must be positive integers.');
    if ('status' in task || 'claimedBy' in task) fail(at, 'Do not duplicate live status/claims in this supporting index.');
  }
  for (const task of byId.values()) for (const dependency of (Array.isArray(task.dependsOn) ? task.dependsOn : [])) {
    if (!byId.has(dependency) || dependency === task.id) fail(task.id, `Invalid dependency ${dependency}.`);
  }
  const visiting = new Set(), visited = new Set();
  function visit(id) {
    if (visiting.has(id)) { fail(id, 'Dependency cycle.'); return; }
    if (visited.has(id) || !byId.has(id)) return;
    visiting.add(id);
    for (const dependency of (Array.isArray(byId.get(id).dependsOn) ? byId.get(id).dependsOn : [])) visit(dependency);
    visiting.delete(id); visited.add(id);
  }
  for (const id of byId.keys()) visit(id);
  return { ok: issues.length === 0, issues };
}

export function taskBrief(program, id, document) {
  const validation = validateProgram(program);
  if (!validation.ok) throw new Error('Invalid program: ' + validation.issues.map(x => `${x.path}: ${x.message}`).join('; '));
  const task = program.tasks.find(row => row.id === id);
  if (!task) throw new Error(`Unknown packet ${id}. SC labels name documents, not newly claimed queue IDs.`);
  if (typeof document !== 'string' || !document.trim()) throw new Error('Task document is missing.');
  return [
    `# Implementation commission: ${task.id} — ${task.title}`,
    '', 'Execute the named outcome, not a new audit or planning-only pass.',
    `Existing parents: ${task.parents.join(', ')}. Read current build_map.md and NOW.md; these win over dated plans.`,
    `Capability dependencies: ${task.dependsOn.join(', ') || 'none beyond existing owners'}. Verify current completion; do not restart completed work.`,
    `Inspect overlapping PRs: ${task.overlapPRs.map(n => '#' + n).join(', ') || 'fresh census required'}. Do not absorb another open branch.`,
    `Write boundary: ${task.writeBoundary}`,
    '', 'Preflight: read root/nearest AGENTS.md; inspect git status and foreign diffs; fetch origin; record exact base; trace ordinary input to the live owner.',
    'Use the existing registry, physics authority, economy/cargo/faction/law writers and frontend design. No second engine, quest framework, save database, or dispatcher.',
    'Implement a coherent vertical slice, test adversarial lifecycle cases, then review the player outcome. Use existing agent-loop for cheap iteration and player-truth at the gameplay integration boundary.',
    'Deliver scoped commits and a draft PR with exact SHA, checks, changed player behavior, and explicit unmeasured boundaries. Do not merge/deploy or launch paid agents automatically.',
    '', document.trim(), '',
  ].join('\n');
}
