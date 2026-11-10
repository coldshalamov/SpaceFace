import { realpathSync } from 'node:fs';
import { lstat, open, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  ALPHA_EVIDENCE_SCHEMA,
  validateEvidenceDocument,
} from '../../src/contracts/evidenceSchemas.js';

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm']);

function normalizedPath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\.\//, '');
}

function relativeFile(repoRoot, filePath) {
  const relative = path.relative(repoRoot, filePath);
  return normalizedPath(relative || path.basename(filePath));
}

function issue(file, jsonPath, rule, message) {
  return { file: normalizedPath(file), path: jsonPath, rule, message };
}

function comparablePath(value) {
  const resolved = path.resolve(value);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function pathsEqual(left, right) {
  return comparablePath(left) === comparablePath(right);
}

function isContained(parent, candidate) {
  const relative = path.relative(comparablePath(parent), comparablePath(candidate));
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function nativeRealpath(value) {
  return realpathSync.native(value);
}

async function findEvidenceFiles(root, repoRoot, issues) {
  const found = [];
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    issues.push(issue(
      relativeFile(repoRoot, root),
      '$',
      'unsafeTreeEntry',
      `evidence tree directory could not be read: ${error.message}`,
    ));
    return found;
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const entryPath = path.join(root, entry.name);
    let metadata;
    try {
      metadata = await lstat(entryPath);
    } catch (error) {
      issues.push(issue(
        relativeFile(repoRoot, entryPath),
        '$',
        'unsafeTreeEntry',
        `evidence tree entry could not be inspected: ${error.message}`,
      ));
      continue;
    }

    if (entry.isSymbolicLink() || metadata.isSymbolicLink()) {
      issues.push(issue(
        relativeFile(repoRoot, entryPath),
        '$',
        'unsafeTreeEntry',
        'evidence tree cannot contain symbolic links, junctions, or reparse-point entries',
      ));
      continue;
    }
    if (metadata.isDirectory()) {
      found.push(...await findEvidenceFiles(entryPath, repoRoot, issues));
    } else if (metadata.isFile() && entry.name === 'evidence.json') {
      found.push(entryPath);
    } else if (!metadata.isFile()) {
      issues.push(issue(
        relativeFile(repoRoot, entryPath),
        '$',
        'unsafeTreeEntry',
        'evidence tree entries must be ordinary files or directories',
      ));
    }
  }
  return found;
}

async function readMagic(filePath) {
  const handle = await open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(16);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

function asciiAt(buffer, start, value) {
  if (buffer.length < start + value.length) return false;
  return buffer.subarray(start, start + value.length).toString('ascii') === value;
}

function hasMediaMagic(extension, buffer) {
  if (extension === '.png') {
    return buffer.length >= 8
      && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (extension === '.jpg' || extension === '.jpeg') {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (extension === '.webp') {
    return asciiAt(buffer, 0, 'RIFF') && asciiAt(buffer, 8, 'WEBP');
  }
  if (extension === '.mp4') {
    return asciiAt(buffer, 4, 'ftyp');
  }
  if (extension === '.webm') {
    return buffer.length >= 4
      && buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  }
  return false;
}

async function validateArtifacts(doc, evidenceFile, repoRoot, realEvidenceRoot, schemaIssues) {
  if (!Array.isArray(doc?.artifacts) || typeof doc?.taskId !== 'string') return [];

  const issues = [];
  const evidenceRelative = relativeFile(repoRoot, evidenceFile);
  const expectedTaskRoot = path.resolve(repoRoot, '.devshots', 'alpha', doc.taskId);
  const expectedEvidenceFile = path.join(expectedTaskRoot, 'evidence.json');
  if (!pathsEqual(evidenceFile, expectedEvidenceFile)) {
    issues.push(issue(
      evidenceRelative,
      '$.taskId',
      'taskDirectory',
      `evidence record must be .devshots/alpha/${doc.taskId}/evidence.json`,
    ));
  }

  let realTaskRoot;
  try {
    realTaskRoot = nativeRealpath(expectedTaskRoot);
  } catch (error) {
    issues.push(issue(
      evidenceRelative,
      '$.taskId',
      'taskContainment',
      `task evidence directory could not be resolved: ${error.message}`,
    ));
  }
  if (realTaskRoot && !isContained(realEvidenceRoot, realTaskRoot)) {
    issues.push(issue(
      evidenceRelative,
      '$.taskId',
      'taskContainment',
      'real task evidence directory must stay under the real .devshots/alpha root',
    ));
  }

  for (let index = 0; index < doc.artifacts.length; index += 1) {
    const artifact = doc.artifacts[index];
    const artifactJsonPath = `$.artifacts[${index}].path`;
    if (typeof artifact?.path !== 'string') continue;
    if (schemaIssues.some((entry) => entry.path === artifactJsonPath)) continue;

    const artifactFile = path.resolve(repoRoot, artifact.path);
    if (!isContained(expectedTaskRoot, artifactFile)) {
      issues.push(issue(
        evidenceRelative,
        artifactJsonPath,
        'artifactContainment',
        `artifact must stay under .devshots/alpha/${doc.taskId}/`,
      ));
      continue;
    }

    let metadata;
    try {
      metadata = await lstat(artifactFile);
    } catch (error) {
      if (error?.code === 'ENOENT') {
        issues.push(issue(evidenceRelative, artifactJsonPath, 'artifactExists', `artifact does not exist: ${artifact.path}`));
      } else {
        issues.push(issue(evidenceRelative, artifactJsonPath, 'artifactRead', `artifact could not be inspected: ${error.message}`));
      }
      continue;
    }

    if (!metadata.isFile()) {
      issues.push(issue(evidenceRelative, artifactJsonPath, 'artifactType', 'artifact must be an existing regular file'));
      continue;
    }

    let realArtifactFile;
    try {
      realArtifactFile = nativeRealpath(artifactFile);
    } catch (error) {
      issues.push(issue(evidenceRelative, artifactJsonPath, 'artifactRead', `artifact real path could not be resolved: ${error.message}`));
      continue;
    }
    if (!realTaskRoot || !isContained(realTaskRoot, realArtifactFile)) {
      issues.push(issue(
        evidenceRelative,
        artifactJsonPath,
        'artifactContainment',
        `real artifact must stay under the real .devshots/alpha/${doc.taskId}/ directory`,
      ));
      continue;
    }

    if (!['screenshot', 'video'].includes(artifact.kind)) continue;

    const extension = path.extname(artifact.path).toLowerCase();
    const allowed = artifact.kind === 'screenshot' ? IMAGE_EXTENSIONS : VIDEO_EXTENSIONS;
    if (!allowed.has(extension)) {
      issues.push(issue(
        evidenceRelative,
        artifactJsonPath,
        'mediaExtension',
        `${artifact.kind} must use an allowed ${artifact.kind === 'screenshot' ? 'PNG/JPEG/WebP' : 'MP4/WebM'} extension`,
      ));
      continue;
    }

    let magic;
    try {
      magic = await readMagic(artifactFile);
    } catch (error) {
      issues.push(issue(evidenceRelative, artifactJsonPath, 'artifactRead', `artifact could not be read: ${error.message}`));
      continue;
    }
    if (!hasMediaMagic(extension, magic)) {
      issues.push(issue(
        evidenceRelative,
        artifactJsonPath,
        'mediaMagic',
        `artifact contents do not match the ${extension.slice(1).toUpperCase()} media signature`,
      ));
    }
  }

  return issues;
}

export async function scanEvidenceTree(options = {}) {
  const repoRoot = path.resolve(options.repoRoot || process.cwd());
  const scanRoot = path.resolve(options.scanRoot || path.join(repoRoot, '.devshots', 'alpha'));
  const rootLabel = relativeFile(repoRoot, scanRoot);
  const issues = [];

  let rootMetadata;
  try {
    rootMetadata = await lstat(scanRoot);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      issues.push(issue(rootLabel, '$', 'root', `evidence root does not exist: ${rootLabel}`));
    } else {
      issues.push(issue(rootLabel, '$', 'root', `evidence root could not be inspected: ${error.message}`));
    }
    return {
      ok: false,
      root: rootLabel,
      recordCount: 0,
      issueCount: issues.length,
      files: [],
      issues,
    };
  }

  if (!rootMetadata.isDirectory()) {
    issues.push(issue(rootLabel, '$', 'root', 'evidence root must be a directory'));
    return {
      ok: false,
      root: rootLabel,
      recordCount: 0,
      issueCount: issues.length,
      files: [],
      issues,
    };
  }

  const expectedEvidenceRoot = path.resolve(repoRoot, '.devshots', 'alpha');
  let realEvidenceRoot;
  let realScanRoot;
  try {
    realEvidenceRoot = nativeRealpath(expectedEvidenceRoot);
    realScanRoot = nativeRealpath(scanRoot);
  } catch (error) {
    issues.push(issue(rootLabel, '$', 'root', `evidence root real path could not be resolved: ${error.message}`));
    return {
      ok: false,
      root: rootLabel,
      recordCount: 0,
      issueCount: issues.length,
      files: [],
      issues,
    };
  }
  if (!pathsEqual(realEvidenceRoot, expectedEvidenceRoot) || !isContained(realEvidenceRoot, realScanRoot)) {
    issues.push(issue(rootLabel, '$', 'root', 'real evidence scan root must stay under the physical .devshots/alpha directory'));
    return {
      ok: false,
      root: rootLabel,
      recordCount: 0,
      issueCount: issues.length,
      files: [],
      issues,
    };
  }

  const evidenceFiles = await findEvidenceFiles(scanRoot, repoRoot, issues);
  if (evidenceFiles.length === 0) {
    issues.push(issue(rootLabel, '$', 'records', 'evidence root contains no evidence.json records'));
  }

  const files = [];
  for (const evidenceFile of evidenceFiles) {
    const evidenceRelative = relativeFile(repoRoot, evidenceFile);
    let doc;
    try {
      doc = JSON.parse(await readFile(evidenceFile, 'utf8'));
    } catch (error) {
      const parseIssue = issue(evidenceRelative, '$', 'parse', `invalid JSON: ${error.message}`);
      issues.push(parseIssue);
      files.push({ path: evidenceRelative, ok: false, issueCount: 1 });
      continue;
    }

    const schemaResult = validateEvidenceDocument(doc, { file: evidenceRelative });
    const fileIssues = [...schemaResult.issues];
    if (doc?.schema !== ALPHA_EVIDENCE_SCHEMA && !fileIssues.some((entry) => entry.path === '$.schema')) {
      fileIssues.push(issue(evidenceRelative, '$.schema', 'schema', `evidence scanner requires ${ALPHA_EVIDENCE_SCHEMA}`));
    }
    if (doc?.schema === ALPHA_EVIDENCE_SCHEMA) {
      fileIssues.push(...await validateArtifacts(doc, evidenceFile, repoRoot, realEvidenceRoot, schemaResult.issues));
    }
    issues.push(...fileIssues);
    files.push({
      path: evidenceRelative,
      ok: fileIssues.length === 0,
      issueCount: fileIssues.length,
    });
  }

  return {
    ok: issues.length === 0,
    root: rootLabel,
    recordCount: evidenceFiles.length,
    issueCount: issues.length,
    files,
    issues,
  };
}
