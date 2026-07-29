import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

import sharp from 'sharp';

export const ASHLINE_EVIDENCE_EPOCH_SCHEMA = 'spaceface.ashlineEvidenceEpoch.v2';
export const ASHLINE_ELIGIBLE_EVIDENCE_ROOT =
  'assets/ships/m4_ashline_v2/evidence/material_truth_v2/';
export const ASHLINE_SHIP_KEYS = Object.freeze(['dart', 'lode', 'rig']);
export const ASHLINE_ELIGIBLE_ARTIFACT_COUNTS = Object.freeze({
  dart: 8,
  lode: 10,
  rig: 11,
});
export const ASHLINE_ELIGIBLE_ARTIFACT_TOTAL = 29;

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function digest(value) {
  return createHash('sha256').update(stableStringify(value)).digest('hex').toUpperCase();
}

export function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex').toUpperCase();
}

function relativePath(root, path) {
  return path.replace(/\\/g, '/').replace(`${root.replace(/\\/g, '/')}/`, '');
}

function eligibleArtifactCounts(artifacts) {
  const counts = Object.fromEntries(
    Object.keys(ASHLINE_ELIGIBLE_ARTIFACT_COUNTS).map((key) => [key, 0]),
  );
  for (const artifact of artifacts) {
    const scope = artifact.path
      ?.slice(ASHLINE_ELIGIBLE_EVIDENCE_ROOT.length)
      .split('/')[0];
    if (Object.prototype.hasOwnProperty.call(counts, scope)) counts[scope]++;
  }
  return counts;
}

function currentAcceptancePerShip(sourceCandidatePairs, eligibleArtifacts) {
  const counts = eligibleArtifactCounts(eligibleArtifacts);
  return Object.fromEntries(sourceCandidatePairs.map((pair) => {
    const expected = ASHLINE_ELIGIBLE_ARTIFACT_COUNTS[pair.key];
    return [
      pair.key,
      Number.isInteger(expected) && counts[pair.key] === expected,
    ];
  }));
}

function validateExactPairKeySet(pairs, failures) {
  const expected = new Set(ASHLINE_SHIP_KEYS);
  const counts = new Map();
  for (const pair of pairs) {
    const key = pair?.key;
    counts.set(key, (counts.get(key) || 0) + 1);
    if (!expected.has(key)) failures.push(`pairs:unknown-key:${key || 'missing'}`);
  }
  for (const key of ASHLINE_SHIP_KEYS) {
    const count = counts.get(key) || 0;
    if (count === 0) failures.push(`pairs:missing-key:${key}`);
    if (count > 1) failures.push(`pairs:duplicate-key:${key}:${count}`);
  }
}

async function artifactReceipt(root, path, {
  eligible,
  inputBindings = null,
  producer = null,
  reason = null,
}) {
  const absolute = resolve(root, path);
  if (!existsSync(absolute)) throw new Error(`missing evidence artifact: ${path}`);
  const metadata = await sharp(absolute).metadata();
  return {
    path: relativePath(root, absolute),
    sha256: sha256File(absolute),
    bytes: statSync(absolute).size,
    width: metadata.width ?? null,
    height: metadata.height ?? null,
    eligible,
    inputBindings,
    producer,
    reason,
  };
}

export async function buildAshlineEvidenceEpoch({
  root,
  family,
  ships,
  toolPaths,
  eligibleArtifacts = [],
  legacyArtifacts = [],
}) {
  const sourceCandidatePairs = ships.map((ship) => {
    const source = resolve(family, 'source/wholeships', `${ship.id}.glb`);
    const candidate = resolve(family, 'release_candidates/wholeships', `${ship.id}.glb`);
    if (!existsSync(source) || !existsSync(candidate)) {
      throw new Error(`missing Ashline pair for ${ship.key}`);
    }
    return {
      key: ship.key,
      id: ship.id,
      source: relativePath(root, source),
      sourceSha256: sha256File(source),
      sourceBytes: statSync(source).size,
      candidate: relativePath(root, candidate),
      candidateSha256: sha256File(candidate),
      candidateBytes: statSync(candidate).size,
    };
  }).sort((left, right) => left.key.localeCompare(right.key));

  const tools = toolPaths.map((path) => {
    const absolute = resolve(root, path);
    if (!existsSync(absolute)) throw new Error(`missing evidence tool: ${path}`);
    return {
      path: relativePath(root, absolute),
      sha256: sha256File(absolute),
    };
  }).sort((left, right) => left.path.localeCompare(right.path));

  const accepted = [];
  for (const artifact of eligibleArtifacts) {
    accepted.push(await artifactReceipt(root, artifact.path, {
      eligible: true,
      inputBindings: artifact.inputBindings,
      producer: artifact.producer,
      reason: null,
    }));
  }
  accepted.sort((left, right) => left.path.localeCompare(right.path));

  const legacy = [];
  for (const path of legacyArtifacts) {
    if (!existsSync(resolve(root, path))) continue;
    legacy.push(await artifactReceipt(root, path, {
      eligible: false,
      inputBindings: null,
      producer: null,
      reason: 'unbound-historical-artifact-requires-current-rebuild',
    }));
  }
  legacy.sort((left, right) => left.path.localeCompare(right.path));
  const perShip = currentAcceptancePerShip(sourceCandidatePairs, accepted);
  const familyVisualEvidenceEligible = sourceCandidatePairs.length > 0
    && sourceCandidatePairs.every((pair) => perShip[pair.key] === true)
    && accepted.length === ASHLINE_ELIGIBLE_ARTIFACT_TOTAL;

  const core = {
    schema: ASHLINE_EVIDENCE_EPOCH_SCHEMA,
    family: 'ashline_v2',
    sourceCandidatePairs,
    tools,
    eligibleArtifacts: accepted,
    legacyArtifacts: legacy,
    currentAcceptance: {
      perShip,
      visualEvidenceEligible: familyVisualEvidenceEligible,
      historicalArtifactsEligible: false,
      requiresCurrentRender: !familyVisualEvidenceEligible,
    },
  };
  return {
    ...core,
    epochDigest: digest(core),
  };
}

export async function validateAshlineEvidenceEpoch(receipt, { root }) {
  const failures = [];
  if (!receipt || receipt.schema !== ASHLINE_EVIDENCE_EPOCH_SCHEMA) {
    failures.push(`schema:${receipt?.schema || 'missing'}`);
    return { pass: false, failures };
  }

  const digestInput = { ...receipt };
  delete digestInput.epochDigest;
  const actualDigest = digest(digestInput);
  if (receipt.epochDigest !== actualDigest) {
    failures.push(`epochDigest:${receipt.epochDigest || 'missing'}!=${actualDigest}`);
  }

  const pairs = Array.isArray(receipt.sourceCandidatePairs)
    ? receipt.sourceCandidatePairs
    : [];
  if (pairs.length !== 3) failures.push(`pairs:${pairs.length}!=3`);
  validateExactPairKeySet(pairs, failures);
  const pairByKey = new Map();
  for (const pair of pairs) {
    for (const role of ['source', 'candidate']) {
      const path = pair?.[role];
      const hashKey = `${role}Sha256`;
      const bytesKey = `${role}Bytes`;
      const absolute = path ? resolve(root, path) : null;
      if (!absolute || !existsSync(absolute)) {
        failures.push(`${pair?.key || 'unknown'}.${role}:missing`);
        continue;
      }
      const actualHash = sha256File(absolute);
      const actualBytes = statSync(absolute).size;
      if (pair[hashKey] !== actualHash) {
        failures.push(`${pair.key}.${hashKey}:${pair[hashKey]}!=${actualHash}`);
      }
      if (pair[bytesKey] !== actualBytes) {
        failures.push(`${pair.key}.${bytesKey}:${pair[bytesKey]}!=${actualBytes}`);
      }
      if (role === 'source'
          && ASHLINE_SHIP_KEYS.includes(pair.key)
          && !pairByKey.has(pair.key)) {
        pairByKey.set(pair.key, actualHash);
      }
    }
  }

  const registeredTools = new Map();
  for (const tool of receipt.tools || []) {
    const absolute = resolve(root, tool.path || '');
    if (!existsSync(absolute)) {
      failures.push(`tool:${tool.path || 'missing'}:missing`);
      continue;
    }
    const actualHash = sha256File(absolute);
    if (tool.sha256 !== actualHash) {
      failures.push(`tool:${tool.path}:${tool.sha256}!=${actualHash}`);
    }
    registeredTools.set(tool.path, actualHash);
  }

  const legacyPaths = new Set((receipt.legacyArtifacts || []).map((artifact) => artifact.path));
  const eligibleArtifactPaths = new Set();
  for (const artifact of receipt.eligibleArtifacts || []) {
    if (eligibleArtifactPaths.has(artifact.path)) {
      failures.push(`artifact:${artifact.path}:duplicate-path`);
    }
    eligibleArtifactPaths.add(artifact.path);
    await validateArtifact(artifact, root, failures);
    if (artifact.eligible !== true) failures.push(`artifact:${artifact.path}:not-eligible`);
    if (!artifact.path?.startsWith(ASHLINE_ELIGIBLE_EVIDENCE_ROOT)
        || legacyPaths.has(artifact.path)) {
      failures.push(`artifact:${artifact.path}:legacy-or-unversioned-path`);
    }
    validateArtifactBindings(artifact, pairByKey, failures);
    validateArtifactProducer(artifact, registeredTools, failures);
  }

  for (const artifact of receipt.legacyArtifacts || []) {
    await validateArtifact(artifact, root, failures);
    if (artifact.eligible !== false) failures.push(`legacy:${artifact.path}:eligible`);
    if (artifact.inputBindings !== null) failures.push(`legacy:${artifact.path}:bound-source`);
    if (artifact.reason !== 'unbound-historical-artifact-requires-current-rebuild') {
      failures.push(`legacy:${artifact.path}:reason`);
    }
  }

  const eligibleArtifacts = receipt.eligibleArtifacts || [];
  const artifactCounts = eligibleArtifactCounts(eligibleArtifacts);
  for (const key of pairByKey.keys()) {
    const actual = artifactCounts[key] || 0;
    const expected = ASHLINE_ELIGIBLE_ARTIFACT_COUNTS[key];
    if (actual !== 0 && actual !== expected) {
      failures.push(`eligibleArtifactContract:${key}:${actual}!=${expected}`);
    }
  }
  const expectedPerShip = currentAcceptancePerShip(
    [...pairByKey.keys()].sort().map((key) => ({ key })),
    eligibleArtifacts,
  );
  const allShipsComplete = pairByKey.size > 0
    && [...pairByKey.keys()].every((key) => expectedPerShip[key] === true);
  const familyVisualEvidenceEligible = allShipsComplete
    && eligibleArtifacts.length === ASHLINE_ELIGIBLE_ARTIFACT_TOTAL;
  if (allShipsComplete && eligibleArtifacts.length !== ASHLINE_ELIGIBLE_ARTIFACT_TOTAL) {
    failures.push(
      `eligibleArtifactContract:family:${eligibleArtifacts.length}`
      + `!=${ASHLINE_ELIGIBLE_ARTIFACT_TOTAL}`,
    );
  }
  if (stableStringify(receipt.currentAcceptance?.perShip || {}) !== stableStringify(expectedPerShip)) {
    failures.push('currentAcceptance:perShip');
  }
  if (receipt.currentAcceptance?.visualEvidenceEligible !== familyVisualEvidenceEligible) {
    failures.push('currentAcceptance:visualEvidenceEligible');
  }
  if (receipt.currentAcceptance?.historicalArtifactsEligible !== false) {
    failures.push('currentAcceptance:historicalArtifactsEligible');
  }
  if (receipt.currentAcceptance?.requiresCurrentRender !== !familyVisualEvidenceEligible) {
    failures.push('currentAcceptance:requiresCurrentRender');
  }

  return {
    pass: failures.length === 0,
    failures,
    epochDigest: actualDigest,
  };
}

function validateArtifactBindings(artifact, pairByKey, failures) {
  const bindings = artifact?.inputBindings;
  if (!Array.isArray(bindings) || bindings.length === 0) {
    failures.push(`artifact:${artifact?.path}:missing-input-bindings`);
    return;
  }
  const keys = new Set();
  for (const binding of bindings) {
    if (!binding?.shipKey || keys.has(binding.shipKey)) {
      failures.push(`artifact:${artifact.path}:duplicate-or-missing-ship-key`);
      continue;
    }
    keys.add(binding.shipKey);
    const expected = pairByKey.get(binding.shipKey);
    if (!expected || binding.sourceSha256 !== expected) {
      failures.push(`artifact:${artifact.path}:unbound-source:${binding.shipKey}`);
    }
  }
  const scope = artifact.path?.slice(ASHLINE_ELIGIBLE_EVIDENCE_ROOT.length).split('/')[0];
  const expectedKeys = scope === 'family'
    ? new Set(pairByKey.keys())
    : pairByKey.has(scope)
      ? new Set([scope])
      : null;
  if (!expectedKeys) {
    failures.push(`artifact:${artifact.path}:unknown-evidence-scope`);
    return;
  }
  if (keys.size !== expectedKeys.size
      || [...expectedKeys].some((key) => !keys.has(key))) {
    failures.push(`artifact:${artifact.path}:incomplete-input-scope`);
  }
}

function validateArtifactProducer(artifact, registeredTools, failures) {
  const producer = artifact?.producer;
  if (!producer || typeof producer.path !== 'string' || typeof producer.sha256 !== 'string') {
    failures.push(`artifact:${artifact?.path}:missing-producer`);
    return;
  }
  const registeredHash = registeredTools.get(producer.path);
  if (!registeredHash || producer.sha256 !== registeredHash) {
    failures.push(`artifact:${artifact.path}:unregistered-producer`);
  }
}

async function validateArtifact(artifact, root, failures) {
  const absolute = resolve(root, artifact?.path || '');
  if (!artifact?.path || !existsSync(absolute)) {
    failures.push(`artifact:${artifact?.path || 'missing'}:missing`);
    return;
  }
  const metadata = await sharp(absolute).metadata();
  const actualHash = sha256File(absolute);
  const actualBytes = statSync(absolute).size;
  if (artifact.sha256 !== actualHash) {
    failures.push(`artifact:${artifact.path}:sha256`);
  }
  if (artifact.bytes !== actualBytes) {
    failures.push(`artifact:${artifact.path}:bytes`);
  }
  if (artifact.width !== (metadata.width ?? null)
      || artifact.height !== (metadata.height ?? null)) {
    failures.push(`artifact:${artifact.path}:dimensions`);
  }
}
