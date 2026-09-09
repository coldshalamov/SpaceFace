import { execFile } from 'node:child_process';
import { lstat, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const SAFE_MANIFEST_ID = /^[a-z0-9](?:[a-z0-9-]{0,126}[a-z0-9])?$/;
const TRACKED_REGULAR_MODES = new Set(['100644', '100755']);

function registryError(code, detail = '') {
  const error = new Error(detail ? `${code}: ${detail}` : code);
  error.code = code;
  return error;
}

export function parseTrackedManifestStage(stdout) {
  const line = String(stdout ?? '').split(/\r?\n/).find(Boolean) ?? '';
  const match = /^(\d{6}) ([0-9a-f]{40,64}) (\d)\t/.exec(line);
  if (!match || !TRACKED_REGULAR_MODES.has(match[1]) || Number(match[3]) !== 0) {
    throw registryError('VALIDATION_MANIFEST_NOT_REGULAR_TRACKED_FILE');
  }
  return {
    mode: match[1],
    objectId: match[2],
    stage: Number(match[3]),
  };
}

async function requireTrackedRegularManifest({ root, relativePath }) {
  let result;
  try {
    result = await execFileAsync(
      'git',
      ['ls-files', '--stage', '--error-unmatch', '--', relativePath],
      { cwd: root, windowsHide: true, maxBuffer: 64 * 1024 },
    );
  } catch (_) {
    throw registryError('VALIDATION_MANIFEST_NOT_TRACKED', relativePath);
  }
  return parseTrackedManifestStage(result.stdout);
}

function inside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
}

/**
 * Load exactly one Git-tracked validation manifest after proving path and file ownership.
 * No candidate module code executes before the index-mode, lstat, and realpath checks pass.
 */
export async function loadValidationManifestById({ root, id }) {
  if (typeof id !== 'string' || !SAFE_MANIFEST_ID.test(id)) {
    throw registryError('VALIDATION_MANIFEST_ID_UNSAFE', String(id ?? ''));
  }
  const resolvedRoot = path.resolve(root);
  const relativePath = path.posix.join('scripts', 'validation-manifests', `${id}.mjs`);
  const manifestDir = path.resolve(resolvedRoot, 'scripts', 'validation-manifests');
  const candidate = path.resolve(manifestDir, `${id}.mjs`);
  if (!inside(manifestDir, candidate)) {
    throw registryError('VALIDATION_MANIFEST_PATH_ESCAPE', id);
  }

  const tracked = await requireTrackedRegularManifest({ root: resolvedRoot, relativePath });
  let linkInfo;
  try {
    linkInfo = await lstat(candidate);
  } catch (_) {
    throw registryError('VALIDATION_MANIFEST_TRACKED_FILE_MISSING', relativePath);
  }
  if (linkInfo.isSymbolicLink() || !linkInfo.isFile()) {
    throw registryError('VALIDATION_MANIFEST_NOT_REGULAR_TRACKED_FILE', relativePath);
  }

  const [realManifestDir, realCandidate] = await Promise.all([
    realpath(manifestDir),
    realpath(candidate),
  ]);
  if (!inside(realManifestDir, realCandidate)) {
    throw registryError('VALIDATION_MANIFEST_SYMLINK_ESCAPE', relativePath);
  }
  const fileInfo = await stat(realCandidate);
  if (!fileInfo.isFile()) {
    throw registryError('VALIDATION_MANIFEST_NOT_REGULAR_TRACKED_FILE', relativePath);
  }

  const module = await import(pathToFileURL(realCandidate).href);
  if (!Object.prototype.hasOwnProperty.call(module, 'default')
      || module.default == null
      || typeof module.default !== 'object'
      || Array.isArray(module.default)) {
    throw registryError('VALIDATION_MANIFEST_DEFAULT_EXPORT_REQUIRED', relativePath);
  }
  if (module.default.id !== id) {
    throw registryError(
      'VALIDATION_MANIFEST_ID_MISMATCH',
      `requested ${id}, exported ${String(module.default.id ?? '')}`,
    );
  }
  if (module.default.registryEnabled === false) {
    throw registryError('VALIDATION_MANIFEST_REGISTRY_DISABLED', relativePath);
  }
  return Object.freeze({ ...module.default, __trackedManifest: Object.freeze({ relativePath, ...tracked }) });
}

export { SAFE_MANIFEST_ID };
