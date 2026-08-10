import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const PACKET_LIFECYCLES = new Set([
  'planned',
  'ready',
  'claimed',
  'implemented',
  'integrated',
  'blocked',
  'deferred',
  'historical',
]);

export const PACKET_ACCEPTANCE_STATES = new Set([
  'unproven',
  'focused_green',
  'route_accepted',
  'milestone_accepted',
]);

const DISPATCHABLE_QUEUE_STATES = new Set(['planned', 'ready']);
const DISPATCHABLE_PACKET_LIFECYCLES = new Set(['planned', 'ready']);
const QUEUE_SCHEMA_VERSION = 1;
const QUEUE_STATES = [
  'planned',
  'ready',
  'claimed',
  'implemented',
  'focused_green',
  'route_accepted',
  'integrated',
  'blocked',
  'deferred',
  'historical',
];
const CHECKED_OFF_STATES = ['integrated', 'historical'];
const INTEGRATION_FIELDS = ['integratedCommit', 'acceptanceRef', 'receipt'];
const DISPATCH_UNIT_STATES = new Set(['ready', 'claimed', 'blocked', 'done', 'deferred']);
const DISPATCH_UNIT_KINDS = new Set([
  'program_control',
  'implementation',
  'acceptance_repair',
  'acceptance_capture',
  'acceptance_review',
  'performance',
  'integration',
]);

export class ProgramControlError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = 'ProgramControlError';
    this.details = details;
  }
}

function requireString(value, label, errors) {
  if (typeof value !== 'string' || !value.trim()) {
    errors.push(`${label} must be a non-empty string`);
    return null;
  }
  return value.trim();
}

function requireStringArray(value, label, errors) {
  if (!Array.isArray(value)) {
    errors.push(`${label} must be an array`);
    return [];
  }
  const result = [];
  for (const [index, item] of value.entries()) {
    const parsed = requireString(item, `${label}[${index}]`, errors);
    if (parsed) result.push(parsed);
  }
  return result;
}

function sameMembers(actual, expected) {
  return actual.length === expected.length
    && actual.every((value) => expected.includes(value))
    && new Set(actual).size === actual.length;
}

function requireRepoRelativePath(value, label, errors) {
  const parsed = requireString(value, label, errors);
  if (!parsed) return null;
  const filePart = parsed.split('#')[0].split('?')[0];
  if (!filePart || /^[a-z][a-z0-9+.-]*:/i.test(filePart) || path.isAbsolute(filePart)) {
    errors.push(`${label} must be a repository-relative path`);
    return null;
  }
  const normalized = filePart.replaceAll('\\', '/');
  if (normalized.split('/').includes('..')) {
    errors.push(`${label} must not escape the repository`);
    return null;
  }
  return parsed;
}

function parseEvidenceDependencies(value, label, errors) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    errors.push(`${label} must be an array`);
    return [];
  }
  const parsed = [];
  const ids = new Set();
  for (const [index, item] of value.entries()) {
    const prefix = `${label}[${index}]`;
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      errors.push(`${prefix} must be an object`);
      continue;
    }
    const packetId = requireString(item.packetId, `${prefix}.packetId`, errors);
    const leafId = requireString(item.leafId, `${prefix}.leafId`, errors);
    const requiredAcceptance = requireString(
      item.requiredAcceptance,
      `${prefix}.requiredAcceptance`,
      errors,
    );
    const receipt = requireRepoRelativePath(item.receipt, `${prefix}.receipt`, errors);
    const receiptBlob = item.receiptBlob === null
      ? null
      : requireString(item.receiptBlob, `${prefix}.receiptBlob`, errors);

    if (packetId && !/^PQ-\d{3}$/.test(packetId)) {
      errors.push(`${prefix}.packetId has invalid packet ID ${packetId}`);
    }
    if (packetId && leafId && !leafId.startsWith(`${packetId}.`)) {
      errors.push(`${prefix}.leafId must start with ${packetId}.`);
    }
    if (leafId && ids.has(leafId)) errors.push(`${label} contains duplicate leafId ${leafId}`);
    if (leafId) ids.add(leafId);
    if (requiredAcceptance && !PACKET_ACCEPTANCE_STATES.has(requiredAcceptance)) {
      errors.push(`${prefix}.requiredAcceptance is invalid: ${requiredAcceptance}`);
    }
    if (requiredAcceptance === 'unproven') {
      errors.push(`${prefix}.requiredAcceptance cannot be unproven`);
    }
    if (receiptBlob && !/^[0-9a-f]{40,64}$/i.test(receiptBlob)) {
      errors.push(`${prefix}.receiptBlob must be null or a 40/64-hex Git blob ID`);
    }
    parsed.push({
      packetId,
      leafId,
      requiredAcceptance,
      receipt,
      receiptBlob,
    });
  }
  return parsed;
}

export function queueRows(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ProgramControlError('queue root must be an object with stateContract and tasks');
  }
  if (!Array.isArray(parsed.tasks)) {
    throw new ProgramControlError('queue root must contain a tasks array');
  }
  return parsed.tasks;
}

export function validateQueueDocument(parsed) {
  const errors = [];
  if (parsed?.schemaVersion !== QUEUE_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${QUEUE_SCHEMA_VERSION}`);
  }
  const contract = parsed?.stateContract;
  if (!contract || typeof contract !== 'object' || Array.isArray(contract)) {
    errors.push('stateContract must be an object');
  }

  const allowed = requireStringArray(contract?.allowed, 'stateContract.allowed', errors);
  const checkedOff = requireStringArray(contract?.checkedOff, 'stateContract.checkedOff', errors);
  const integrationRequires = requireStringArray(
    contract?.integrationRequires,
    'stateContract.integrationRequires',
    errors,
  );
  if (!sameMembers(allowed, QUEUE_STATES)) {
    errors.push(`stateContract.allowed must contain exactly: ${QUEUE_STATES.join(', ')}`);
  }
  if (!sameMembers(checkedOff, CHECKED_OFF_STATES)) {
    errors.push(`stateContract.checkedOff must contain exactly: ${CHECKED_OFF_STATES.join(', ')}`);
  }
  if (!sameMembers(integrationRequires, INTEGRATION_FIELDS)) {
    errors.push(`stateContract.integrationRequires must contain exactly: ${INTEGRATION_FIELDS.join(', ')}`);
  }
  const allowedSet = new Set(allowed);
  for (const state of checkedOff) {
    if (!allowedSet.has(state)) {
      errors.push(`stateContract.checkedOff contains unrecognized state ${state}`);
    }
  }

  let rows = [];
  try {
    rows = queueRows(parsed);
  } catch (error) {
    errors.push(error.message);
  }

  const byId = new Map();
  const priorities = new Map();
  const canonicalOwners = new Map();
  const evidenceDependenciesById = new Map();

  for (const [index, row] of rows.entries()) {
    const prefix = `tasks[${index}]`;
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      errors.push(`${prefix} must be an object`);
      continue;
    }

    const id = requireString(row.id, `${prefix}.id`, errors);
    if (id && !/^PQ-\d{3}$/.test(id)) errors.push(`${prefix}.id has invalid packet ID ${id}`);
    if (id && byId.has(id)) errors.push(`duplicate packet ID ${id}`);
    if (id) byId.set(id, row);

    if (!Number.isInteger(row.priority) || row.priority <= 0) {
      errors.push(`${id || prefix}.priority must be a positive integer`);
    } else if (priorities.has(row.priority)) {
      errors.push(`duplicate priority ${row.priority} (${priorities.get(row.priority)}, ${id || prefix})`);
    } else {
      priorities.set(row.priority, id || prefix);
    }

    requireString(row.title, `${id || prefix}.title`, errors);
    const state = requireString(row.state, `${id || prefix}.state`, errors);
    if (state && !allowedSet.has(state)) errors.push(`${id || prefix}.state is not allowed: ${state}`);

    const dependsOn = requireStringArray(row.dependsOn, `${id || prefix}.dependsOn`, errors);
    requireStringArray(row.mutexes, `${id || prefix}.mutexes`, errors);
    requireStringArray(row.sources, `${id || prefix}.sources`, errors);
    requireStringArray(row.checks, `${id || prefix}.checks`, errors);
    requireStringArray(row.evidence, `${id || prefix}.evidence`, errors);
    const evidenceDependencies = parseEvidenceDependencies(
      row.evidenceDependencies,
      `${id || prefix}.evidenceDependencies`,
      errors,
    );
    if (id) evidenceDependenciesById.set(id, evidenceDependencies);
    requireString(row.brief, `${id || prefix}.brief`, errors);

    for (const field of ['canonical', 'aliases']) {
      for (const token of requireStringArray(row[field], `${id || prefix}.${field}`, errors)) {
        if (!canonicalOwners.has(token)) canonicalOwners.set(token, new Set());
        if (id) canonicalOwners.get(token).add(id);
      }
    }

    if (state && checkedOff.includes(state)) {
      for (const field of integrationRequires) {
        requireString(row[field], `${id || prefix}.${field}`, errors);
      }
      if (state === 'historical' && !requireString(
        row.dependencyWaiver,
        `${id || prefix}.dependencyWaiver`,
        errors,
      )) {
        errors.push(`${id || prefix} historical completion requires an explicit dependencyWaiver`);
      }
    }

    if (id && dependsOn.includes(id)) errors.push(`${id} depends on itself`);
  }

  for (const [id, row] of byId.entries()) {
    for (const dependency of Array.isArray(row.dependsOn) ? row.dependsOn : []) {
      if (!byId.has(dependency)) errors.push(`${id} depends on missing packet ${dependency}`);
    }
    for (const dependency of evidenceDependenciesById.get(id) || []) {
      if (!byId.has(dependency.packetId)) {
        errors.push(`${id} evidence dependency ${dependency.leafId} names missing packet ${dependency.packetId}`);
      }
    }
  }

  const visiting = new Set();
  const visited = new Set();
  const stack = [];
  function visit(id) {
    if (visited.has(id)) return;
    if (visiting.has(id)) {
      const start = stack.indexOf(id);
      errors.push(`dependency cycle ${[...stack.slice(start), id].join(' -> ')}`);
      return;
    }
    visiting.add(id);
    stack.push(id);
    const dependencies = byId.get(id)?.dependsOn;
    for (const dependency of Array.isArray(dependencies) ? dependencies : []) {
      if (byId.has(dependency)) visit(dependency);
    }
    stack.pop();
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of byId.keys()) visit(id);

  const dispatchUnits = [];
  const dispatchById = new Map();
  const dispatchPriorities = new Map();
  const rawDispatchUnits = parsed?.dispatchUnits ?? [];
  if (!Array.isArray(rawDispatchUnits)) {
    errors.push('dispatchUnits must be an array when present');
  } else {
    for (const [index, unit] of rawDispatchUnits.entries()) {
      const prefix = `dispatchUnits[${index}]`;
      if (!unit || typeof unit !== 'object' || Array.isArray(unit)) {
        errors.push(`${prefix} must be an object`);
        continue;
      }
      const id = requireString(unit.id, `${prefix}.id`, errors);
      if (id && !/^PQ-\d{3}\.[a-z0-9][a-z0-9-]*$/.test(id)) {
        errors.push(`${prefix}.id has invalid dispatch-unit ID ${id}`);
      }
      if (id && dispatchById.has(id)) errors.push(`duplicate dispatch-unit ID ${id}`);
      if (id) dispatchById.set(id, unit);

      const parentId = requireString(unit.parentId, `${id || prefix}.parentId`, errors);
      if (parentId && !byId.has(parentId)) {
        errors.push(`${id || prefix}.parentId names missing packet ${parentId}`);
      }
      if (!Number.isInteger(unit.priority) || unit.priority <= 0) {
        errors.push(`${id || prefix}.priority must be a positive integer`);
      } else if (dispatchPriorities.has(unit.priority)) {
        errors.push(
          `duplicate dispatch-unit priority ${unit.priority} (${dispatchPriorities.get(unit.priority)}, ${id || prefix})`,
        );
      } else {
        dispatchPriorities.set(unit.priority, id || prefix);
      }
      requireString(unit.title, `${id || prefix}.title`, errors);
      const kind = requireString(unit.kind, `${id || prefix}.kind`, errors);
      if (kind && !DISPATCH_UNIT_KINDS.has(kind)) {
        errors.push(`${id || prefix}.kind is not allowed: ${kind}`);
      }
      const state = requireString(unit.state, `${id || prefix}.state`, errors);
      if (state && !DISPATCH_UNIT_STATES.has(state)) {
        errors.push(`${id || prefix}.state is not allowed: ${state}`);
      }
      requireStringArray(unit.dependsOn, `${id || prefix}.dependsOn`, errors);
      requireStringArray(unit.mutexes, `${id || prefix}.mutexes`, errors);
      requireStringArray(unit.paths, `${id || prefix}.paths`, errors);
      requireStringArray(unit.checks, `${id || prefix}.checks`, errors);
      const receiptRefs = requireStringArray(
        unit.receiptRefs,
        `${id || prefix}.receiptRefs`,
        errors,
      );
      requireString(unit.brief, `${id || prefix}.brief`, errors);
      if (state === 'done' && receiptRefs.length === 0) {
        errors.push(`${id || prefix}.state done requires at least one receiptRefs entry`);
      }
      if (state === 'blocked') {
        requireString(unit.blocker, `${id || prefix}.blocker`, errors);
      }
      dispatchUnits.push(unit);
    }
  }

  for (const unit of dispatchUnits) {
    if (!unit?.id) continue;
    for (const dependency of Array.isArray(unit.dependsOn) ? unit.dependsOn : []) {
      if (!dispatchById.has(dependency)) {
        errors.push(`${unit.id} depends on missing dispatch unit ${dependency}`);
      }
    }
  }

  const dispatchVisiting = new Set();
  const dispatchVisited = new Set();
  const dispatchStack = [];
  function visitDispatch(id) {
    if (dispatchVisited.has(id)) return;
    if (dispatchVisiting.has(id)) {
      const start = dispatchStack.indexOf(id);
      errors.push(`dispatch-unit dependency cycle ${[...dispatchStack.slice(start), id].join(' -> ')}`);
      return;
    }
    dispatchVisiting.add(id);
    dispatchStack.push(id);
    const dependencies = dispatchById.get(id)?.dependsOn;
    for (const dependency of Array.isArray(dependencies) ? dependencies : []) {
      if (dispatchById.has(dependency)) visitDispatch(dependency);
    }
    dispatchStack.pop();
    dispatchVisiting.delete(id);
    dispatchVisited.add(id);
  }
  for (const id of dispatchById.keys()) visitDispatch(id);

  if (errors.length) {
    throw new ProgramControlError('queue schema is invalid', [...new Set(errors)]);
  }

  return {
    rows,
    byId,
    contract: {
      allowed: allowedSet,
      checkedOff: new Set(checkedOff),
      integrationRequires,
    },
    canonicalOwners,
    evidenceDependenciesById,
    dispatchUnits,
    dispatchById,
    verifiedIntegrationIds: new Set(),
    evidenceDependencyStatusById: new Map(),
  };
}

function repoPath(root, relativePath) {
  const resolved = path.resolve(root, relativePath);
  const relativeToRoot = path.relative(root, resolved);
  if (
    relativeToRoot === '..'
    || relativeToRoot.startsWith(`..${path.sep}`)
    || path.isAbsolute(relativeToRoot)
  ) {
    throw new ProgramControlError(`path escapes repository root: ${relativePath}`);
  }
  return resolved;
}

function splitReference(value) {
  const hash = value.indexOf('#');
  return hash === -1
    ? { file: value, anchor: null }
    : { file: value.slice(0, hash), anchor: value.slice(hash + 1) };
}

function integrationReferencePath(root, value) {
  const { file, anchor } = splitReference(value);
  const relative = file.replaceAll('\\', '/');
  return { absolute: repoPath(root, relative), relative, anchor };
}

function markdownHeadingSlugs(text) {
  const slugs = new Set();
  const counts = new Map();
  for (const match of stripFencedCode(text).matchAll(/^#{1,6}\s+(.+?)\s*#*\s*$/gm)) {
    const base = match[1]
      .replace(/<[^>]*>/g, '')
      .replace(/[`*_~]/g, '')
      .trim()
      .toLocaleLowerCase('en-US')
      .replace(/[^\p{L}\p{N}\s_-]/gu, '')
      .replace(/\s+/g, '-');
    const occurrence = counts.get(base) || 0;
    counts.set(base, occurrence + 1);
    slugs.add(occurrence === 0 ? base : `${base}-${occurrence}`);
  }
  return slugs;
}

function validateReference(root, value, label, errors) {
  const reference = requireRepoRelativePath(value, label, errors);
  if (!reference) return null;
  let resolved;
  try {
    resolved = integrationReferencePath(root, reference);
  } catch (error) {
    errors.push(`${label}: ${error.message}`);
    return null;
  }
  if (!/\.(?:md|ya?ml)$/i.test(resolved.relative)) {
    errors.push(`${label} must reference a Markdown or YAML receipt`);
    return null;
  }
  if (!fs.existsSync(resolved.absolute) || !fs.statSync(resolved.absolute).isFile()) {
    errors.push(`${label} missing path ${resolved.relative}`);
    return null;
  }
  if (resolved.anchor && /\.md$/i.test(resolved.relative)) {
    const slugs = markdownHeadingSlugs(fs.readFileSync(resolved.absolute, 'utf8'));
    if (!slugs.has(resolved.anchor)) {
      errors.push(`${label} missing Markdown heading #${resolved.anchor} in ${resolved.relative}`);
      return null;
    }
  }
  return resolved;
}

function git(root, args, input = undefined) {
  return spawnSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    input,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

function parseEvidenceReceipt(text, rel) {
  const header = text.match(
    /^\s*<!--\s*PROGRAM_EVIDENCE_RECEIPT\s*\r?\n([\s\S]*?)\r?\n-->\s*(?:\r?\n|$)/,
  );
  if (!header) {
    throw new ProgramControlError(
      `${rel}: receipt must start with a PROGRAM_EVIDENCE_RECEIPT metadata comment`,
    );
  }
  const metadata = parseScalarMetadata(header[1], rel);
  const errors = [];
  const packetId = requireString(metadata.packetId, `${rel}: packetId`, errors);
  const leafId = requireString(metadata.leafId, `${rel}: leafId`, errors);
  const acceptance = requireString(metadata.acceptance, `${rel}: acceptance`, errors);
  const disposition = requireString(metadata.disposition, `${rel}: disposition`, errors);
  const candidateCommit = requireString(metadata.candidateCommit, `${rel}: candidateCommit`, errors);
  if (acceptance && !PACKET_ACCEPTANCE_STATES.has(acceptance)) {
    errors.push(`${rel}: invalid acceptance ${acceptance}`);
  }
  if (disposition && disposition !== 'PASS') errors.push(`${rel}: disposition must be PASS`);
  if (candidateCommit && !/^[0-9a-f]{7,40}$/i.test(candidateCommit)) {
    errors.push(`${rel}: candidateCommit must be a Git commit ID`);
  }
  if (errors.length) throw new ProgramControlError('evidence receipt metadata is invalid', errors);
  return { packetId, leafId, acceptance, disposition, candidateCommit };
}

export function validateControlPlane(root, parsed, { allowNoGit = false } = {}) {
  const normalizedRoot = path.resolve(root);
  const control = validateQueueDocument(parsed);
  const errors = [];
  const packageFile = repoPath(normalizedRoot, 'package.json');
  let packageScripts = {};
  if (!fs.existsSync(packageFile)) {
    errors.push('package.json is missing');
  } else {
    try {
      packageScripts = JSON.parse(fs.readFileSync(packageFile, 'utf8')).scripts || {};
    } catch (error) {
      errors.push(`package.json cannot be parsed (${error.message})`);
    }
  }

  const commitOwners = new Map();
  const commitsByRow = new Map();
  for (const row of control.rows) {
    for (const source of row.sources) {
      let sourcePath;
      try {
        sourcePath = repoPath(normalizedRoot, source);
      } catch (error) {
        errors.push(`${row.id}.sources: ${error.message}`);
        continue;
      }
      if (!fs.existsSync(sourcePath)) errors.push(`${row.id} missing source ${source}`);
    }
    for (const command of row.checks) {
      const npm = command.match(/^npm run ([^\s]+)$/);
      if (npm && !packageScripts[npm[1]]) errors.push(`${row.id} names missing package script ${npm[1]}`);
    }

    if (control.contract.checkedOff.has(row.state)) {
      const commits = row.integratedCommit.split(',').map((value) => value.trim()).filter(Boolean);
      commitsByRow.set(row.id, commits);
      if (!commits.length || commits.some((value) => !/^[0-9a-f]{7,40}$/i.test(value))) {
        errors.push(`${row.id}.integratedCommit must contain comma-separated Git commit IDs`);
      } else {
        for (const commit of commits) {
          if (!commitOwners.has(commit)) commitOwners.set(commit, []);
          commitOwners.get(commit).push(row.id);
        }
      }
      validateReference(normalizedRoot, row.acceptanceRef, `${row.id}.acceptanceRef`, errors);
      validateReference(normalizedRoot, row.receipt, `${row.id}.receipt`, errors);
    }
  }
  for (const unit of control.dispatchUnits) {
    for (const command of unit.checks) {
      const npm = command.match(/^npm run ([^\s]+)$/);
      if (npm && !packageScripts[npm[1]]) {
        errors.push(`${unit.id} names missing package script ${npm[1]}`);
      }
    }
    if (unit.state === 'done') {
      for (const [index, reference] of unit.receiptRefs.entries()) {
        validateReference(
          normalizedRoot,
          reference,
          `${unit.id}.receiptRefs[${index}]`,
          errors,
        );
      }
    }
  }

  const verifiedIntegrationIds = new Set();
  const inside = git(normalizedRoot, ['rev-parse', '--is-inside-work-tree']);
  let headAncestors = null;
  if (inside.status !== 0 || inside.stdout.trim() !== 'true') {
    if (!allowNoGit) errors.push('Git integration verification is unavailable');
  } else {
    const history = git(normalizedRoot, ['rev-list', 'HEAD']);
    if (history.status !== 0) {
      errors.push(`could not inspect HEAD ancestry (${history.stderr.trim()})`);
    } else {
      headAncestors = new Set(history.stdout.trim().split(/\r?\n/).filter(Boolean));
    }
  }
  if (headAncestors && commitOwners.size) {
    const commits = [...commitOwners.keys()];
    const checked = git(
      normalizedRoot,
      ['cat-file', '--batch-check=%(objectname) %(objecttype)'],
      `${commits.join('\n')}\n`,
    );
    if (checked.status !== 0) {
      errors.push(`could not verify integratedCommit objects (${checked.stderr.trim()})`);
    } else {
      const objects = new Map();
      const lines = checked.stdout.trim().split(/\r?\n/);
      for (const [index, commit] of commits.entries()) {
        const match = lines[index]?.match(/^([0-9a-f]{40})\s+(\w+)$/i);
        if (!match || match[2] !== 'commit') {
          errors.push(`${commitOwners.get(commit).join(', ')} integratedCommit is unavailable: ${commit}`);
        } else {
          objects.set(commit, match[1]);
        }
      }
      for (const [rowId, commitsForRow] of commitsByRow) {
        const verified = commitsForRow.length > 0 && commitsForRow.every((commit) => {
          const object = objects.get(commit);
          if (!object) return false;
          if (!headAncestors.has(object)) {
            errors.push(`${rowId}.integratedCommit is not an ancestor of HEAD: ${commit}`);
            return false;
          }
          return true;
        });
        if (verified) verifiedIntegrationIds.add(rowId);
      }
    }
  }

  const evidenceDependencyStatusById = new Map();
  for (const row of control.rows) {
    const statuses = (control.evidenceDependenciesById.get(row.id) || []).map((dependency) => {
      const fail = (reason, hard = true) => {
        if (hard) errors.push(`${row.id}.${dependency.leafId}: ${reason}`);
        return { ...dependency, satisfied: false, reason };
      };
      let receiptPath;
      try {
        receiptPath = repoPath(normalizedRoot, dependency.receipt);
      } catch (error) {
        return fail(error.message);
      }
      if (!dependency.receiptBlob) {
        return fail('accepted receipt Git blob is not recorded', false);
      }
      if (!fs.existsSync(receiptPath) || !fs.statSync(receiptPath).isFile()) {
        return fail(`bound receipt is missing: ${dependency.receipt}`);
      }
      if (!headAncestors) return fail('Git receipt verification is unavailable');

      const receiptRel = path.relative(normalizedRoot, receiptPath).replaceAll('\\', '/');
      const worktree = git(normalizedRoot, [
        'status',
        '--porcelain=v1',
        '--untracked-files=all',
        '--',
        receiptRel,
      ]);
      if (worktree.status !== 0) {
        return fail(`could not inspect receipt worktree state (${worktree.stderr.trim()})`);
      }
      if (worktree.stdout.trim()) {
        return fail(`bound receipt must be committed and clean: ${dependency.receipt}`);
      }
      const blob = git(normalizedRoot, ['rev-parse', `HEAD:${receiptRel}`]);
      if (blob.status !== 0) {
        return fail(`bound receipt is not tracked at HEAD: ${dependency.receipt}`);
      }
      if (blob.stdout.trim().toLowerCase() !== dependency.receiptBlob.toLowerCase()) {
        return fail(`receipt Git blob mismatch for ${dependency.receipt}`);
      }

      let receipt;
      try {
        receipt = parseEvidenceReceipt(fs.readFileSync(receiptPath, 'utf8'), dependency.receipt);
      } catch (error) {
        if (error instanceof ProgramControlError) {
          const details = error.details.length ? error.details : [error.message];
          for (const detail of details) errors.push(`${row.id}.${dependency.leafId}: ${detail}`);
          return { ...dependency, satisfied: false, reason: 'receipt metadata is invalid' };
        }
        throw error;
      }
      if (receipt.packetId !== dependency.packetId) {
        return fail(`receipt packetId ${receipt.packetId} does not match ${dependency.packetId}`);
      }
      if (receipt.leafId !== dependency.leafId) {
        return fail(`receipt leafId ${receipt.leafId} does not match ${dependency.leafId}`);
      }
      if (receipt.acceptance !== dependency.requiredAcceptance) {
        return fail(
          `receipt acceptance ${receipt.acceptance} does not match ${dependency.requiredAcceptance}`,
        );
      }
      const candidate = git(normalizedRoot, ['rev-parse', `${receipt.candidateCommit}^{commit}`]);
      if (candidate.status !== 0) {
        return fail(`receipt candidateCommit is unavailable: ${receipt.candidateCommit}`);
      }
      if (!headAncestors.has(candidate.stdout.trim())) {
        return fail(`receipt candidateCommit is not an ancestor of HEAD: ${receipt.candidateCommit}`);
      }
      return { ...dependency, satisfied: true, reason: null };
    });
    evidenceDependencyStatusById.set(row.id, statuses);
  }

  if (errors.length) {
    throw new ProgramControlError('control-plane evidence is invalid', [...new Set(errors)]);
  }
  return {
    ...control,
    root: normalizedRoot,
    verifiedIntegrationIds,
    evidenceDependencyStatusById,
    gitVerified: inside.status === 0 && inside.stdout.trim() === 'true',
  };
}

function parseScalarMetadata(block, rel) {
  const metadata = {};
  const errors = [];
  for (const [index, rawLine] of block.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = rawLine.match(/^([A-Za-z][A-Za-z0-9]*):\s*(.*?)\s*$/);
    if (!match) {
      errors.push(`${rel}: metadata line ${index + 1} must be a scalar key/value`);
      continue;
    }
    const [, key, value] = match;
    if (Object.hasOwn(metadata, key)) errors.push(`${rel}: duplicate metadata key ${key}`);
    metadata[key] = value;
  }
  if (errors.length) throw new ProgramControlError('packet metadata is invalid', errors);
  return metadata;
}

export function stripFencedCode(text) {
  return text.replace(/```[\s\S]*?```/g, '');
}

export function parsePacketDocument(text, rel = '<packet>') {
  const header = text.match(
    /^\s*<!--\s*LIFETIME:\s*ACTIVE_PACKET\s*-->\s*\r?\n#\s+([^\r\n]+)\s*\r?\n\s*```yaml\s*\r?\n([\s\S]*?)\r?\n```\s*(?:\r?\n|$)/,
  );
  if (!header) {
    throw new ProgramControlError(
      `${rel}: packet must start with ACTIVE_PACKET marker, H1 title, and a fenced yaml metadata block`,
    );
  }

  const metadata = parseScalarMetadata(header[2], rel);
  const errors = [];
  const queueId = requireString(metadata.queueId, `${rel}: queueId`, errors);
  if (queueId && !/^PQ-\d{3}$/.test(queueId)) errors.push(`${rel}: invalid queueId ${queueId}`);
  const lifecycle = requireString(metadata.lifecycle, `${rel}: lifecycle`, errors);
  if (lifecycle && !PACKET_LIFECYCLES.has(lifecycle)) {
    errors.push(`${rel}: invalid lifecycle ${lifecycle}`);
  }
  const acceptance = requireString(metadata.acceptance, `${rel}: acceptance`, errors);
  if (acceptance && !PACKET_ACCEPTANCE_STATES.has(acceptance)) {
    errors.push(`${rel}: invalid acceptance ${acceptance}`);
  }
  const packetRevision = requireString(metadata.packetRevision, `${rel}: packetRevision`, errors);
  if (packetRevision && !/^[1-9]\d*$/.test(packetRevision)) {
    errors.push(`${rel}: packetRevision must be a positive integer`);
  }
  const owner = requireString(metadata.owner, `${rel}: owner`, errors);
  const dispatchPolicy = metadata.dispatchPolicy || 'direct';
  if (!new Set(['direct', 'leaf_required']).has(dispatchPolicy)) {
    errors.push(`${rel}: invalid dispatchPolicy ${dispatchPolicy}`);
  }
  if (
    (owner === 'portfolio-container' || dispatchPolicy === 'leaf_required')
    && !new Set(['planned', 'ready', 'blocked', 'deferred']).has(lifecycle)
  ) {
    errors.push(
      `${rel}: portfolio/leaf-required packet must stay planned, ready, deferred, or externally blocked until its leaves are complete`,
    );
  }
  if (errors.length) throw new ProgramControlError('packet metadata is invalid', errors);

  return {
    title: header[1].trim(),
    metadata: {
      ...metadata,
      queueId,
      lifecycle,
      acceptance,
      packetRevision,
      owner,
      dispatchPolicy,
    },
    prose: stripFencedCode(text),
  };
}

export function packetPath(root, id) {
  return path.join(root, 'design', 'program', 'roadmap', 'active', `${id}.md`);
}

export function readPacket(root, id) {
  const file = packetPath(root, id);
  if (!fs.existsSync(file)) return null;
  const rel = path.relative(root, file).replaceAll('\\', '/');
  const parsed = parsePacketDocument(fs.readFileSync(file, 'utf8'), rel);
  if (parsed.metadata.queueId !== id) {
    throw new ProgramControlError(`${rel}: queueId ${parsed.metadata.queueId} does not match filename ${id}`);
  }
  return { ...parsed, rel };
}

export function dependencySatisfied(row, control) {
  if (!row || !control?.verifiedIntegrationIds?.has(row.id)) return false;
  if (row.state === 'integrated') return true;
  return row.state === 'historical'
    && typeof row.dependencyWaiver === 'string'
    && Boolean(row.dependencyWaiver.trim());
}

export function evidenceDependenciesSatisfied(row, control) {
  const statuses = control?.evidenceDependencyStatusById?.get(row.id);
  return Array.isArray(statuses) && statuses.every((entry) => entry.satisfied);
}

export function summarizePacket(row, control, packet) {
  const dependencies = row.dependsOn.map((id) => {
    const dependency = control.byId.get(id);
    return {
      id,
      legacyQueueState: dependency?.state || 'missing',
      satisfied: dependencySatisfied(dependency, control),
    };
  });
  const evidenceDependencies = control.evidenceDependencyStatusById?.get(row.id) || [];
  const packetDependencyGateSatisfied = dependencies.every((entry) => entry.satisfied);
  const evidenceGateSatisfied = evidenceDependencies.every((entry) => entry.satisfied);

  return {
    id: row.id,
    priority: row.priority,
    title: row.title,
    legacyQueueState: row.state,
    packetLifecycle: packet.metadata.lifecycle,
    packetAcceptance: packet.metadata.acceptance,
    packetOwner: packet.metadata.owner,
    packetRevision: packet.metadata.packetRevision,
    activeSlice: packet.metadata.activeSlice || null,
    dispatchPolicy: packet.metadata.dispatchPolicy,
    dependencyGateSatisfied: packetDependencyGateSatisfied && evidenceGateSatisfied,
    packetDependencyGateSatisfied,
    evidenceGateSatisfied,
    dependencies,
    activePacket: packet.rel,
    checks: row.checks,
    evidence: row.evidence,
    evidenceDependencies,
    sources: row.sources,
    brief: row.brief,
    hasPartialLanding: Boolean(row.partialIntegration || row.integrationNote),
    receipt: row.receipt || row.acceptanceRef || null,
    dispatchUnits: control.dispatchUnits
      .filter((unit) => unit.parentId === row.id)
      .sort((a, b) => a.priority - b.priority)
      .map((unit) => ({
        id: unit.id,
        kind: unit.kind,
        state: unit.state,
        claimReady: dispatchUnitReady(unit, control),
        title: unit.title,
      })),
    instruction: 'Use the first ready dispatch unit. Re-read design/program/NOW.md before mutation and preserve only an exact currently dirty overlapping hunk. Historical owners and mutex labels never stop work.',
  };
}

export function selectNextPacket(control, root) {
  for (const row of [...control.rows].sort((a, b) => a.priority - b.priority)) {
    if (!DISPATCHABLE_QUEUE_STATES.has(row.state)) continue;
    if (!row.dependsOn.every((id) => dependencySatisfied(control.byId.get(id), control))) continue;
    if (!evidenceDependenciesSatisfied(row, control)) continue;
    const packet = readPacket(root, row.id);
    if (!packet) {
      throw new ProgramControlError(
        `dependency-ready packet ${row.id} has no active packet; create or classify it before dispatching later work`,
      );
    }
    if (!DISPATCHABLE_PACKET_LIFECYCLES.has(packet.metadata.lifecycle)) continue;
    if (packet.metadata.owner === 'portfolio-container' || packet.metadata.dispatchPolicy === 'leaf_required') {
      continue;
    }
    return { row, packet };
  }
  return null;
}

export function dispatchUnitReady(unit, control) {
  if (!unit || unit.state !== 'ready') return false;
  return unit.dependsOn.every((id) => control.dispatchById.get(id)?.state === 'done');
}

export function summarizeDispatchUnit(unit, control) {
  const parent = control.byId.get(unit.parentId);
  return {
    id: unit.id,
    parentId: unit.parentId,
    parentTitle: parent?.title || null,
    priority: unit.priority,
    title: unit.title,
    kind: unit.kind,
    state: unit.state,
    claimReady: dispatchUnitReady(unit, control),
    dependsOn: unit.dependsOn.map((id) => ({
      id,
      state: control.dispatchById.get(id)?.state || 'missing',
    })),
    paths: unit.paths,
    checks: unit.checks,
    receiptRefs: unit.receiptRefs,
    brief: unit.brief,
    packet: `design/program/roadmap/active/${unit.parentId}.md`,
    instruction: 'Start and finish this unit. Before editing, re-read design/program/NOW.md and preserve only an exact currently dirty overlapping hunk; otherwise begin immediately. Historical owners and mutex labels never stop work.',
  };
}

// Dispatch order: build work before proof work.
//
// Priority numbers were assigned per parent packet, so an old packet's capture unit carries a far
// lower number than a new packet's implementation unit. Sorting on priority alone therefore handed
// every fresh thread the same acceptance capture — `PQ-022.refinery-reauthor-h1` at priority 28 won
// over nine ready implementation units at 230-259 — and threads reported "the next task is the
// PQ-022 browser capture set" for work whose implementation had long since landed.
//
// Kind now orders first and priority breaks ties inside a kind, so `--next` returns something to
// build. This changes ORDER ONLY: `--ready` still lists every ready unit, no unit is filtered out,
// and captures/reviews stay dispatchable — they simply stop monopolizing the front of the queue.
const DISPATCH_KIND_ORDER = Object.freeze({
  implementation: 0,
  acceptance_repair: 1,
  integration: 2,
  performance: 3,
  acceptance_capture: 4,
  acceptance_review: 5,
  program_control: 6,
});

export function readyDispatchUnits(control) {
  const rank = (unit) => {
    const value = DISPATCH_KIND_ORDER[unit.kind];
    // An unrecognized kind sorts between build work and proof work rather than silently first.
    return Number.isInteger(value) ? value : 3.5;
  };
  return [...control.dispatchUnits]
    .filter((unit) => dispatchUnitReady(unit, control))
    .sort((a, b) => rank(a) - rank(b) || a.priority - b.priority);
}
