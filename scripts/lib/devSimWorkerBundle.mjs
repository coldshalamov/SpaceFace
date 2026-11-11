import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import esbuild from 'esbuild';
import { createSourceModuleUrlRewritePlugin } from './sourceModuleUrlRewrite.mjs';

function containedPath(root, candidate) {
  const absRoot = resolve(root);
  const absolute = resolve(candidate);
  const rel = relative(absRoot, absolute);
  if (!rel || isAbsolute(rel) || rel === '..' || rel.startsWith(`..${sep}`)) {
    throw new Error(`Dev worker bundle input is outside the project root: ${candidate}`);
  }
  return absolute;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function fileFingerprint(filePath) {
  const [metadata, bytes] = await Promise.all([stat(filePath), readFile(filePath)]);
  return `${metadata.size}:${sha256(bytes)}`;
}

// STAB-04: a dev checkout is never quiet — editors and agents rewrite source files
// while a build runs. An input that loses the fingerprint race is almost always a
// write still finishing, so the build retries briefly, and once retries are spent
// the last verified bundle may serve instead of failing the worker request.
const MAX_BUILD_ATTEMPTS = 5;
const BUILD_RETRY_DELAY_MS = 150;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function oneLine(value) {
  return String(value == null ? '' : value).split('\n').map((line) => line.trim()).filter(Boolean).join(' ');
}

// Marks "the tree moved under the build" — retried, and once retries are spent the
// last verified bundle may serve instead of failing. `file` is project-relative.
function inputChangedDuringBuild(message, file) {
  const error = new Error(message);
  error.devWorkerInputChanged = true;
  error.file = file;
  return error;
}

// Mid-write files can also surface inside esbuild as a failed read/resolve rather
// than a fingerprint mismatch; those retry like any other moving input.
function isTransientBuildRead(error) {
  const first = error && Array.isArray(error.errors) ? error.errors.find(Boolean) : null;
  return !!first && /Could not (read|resolve)|ENOENT/i.test(String(first.text || ''));
}

function firstBuildError(error) {
  const list = error && Array.isArray(error.errors) ? error.errors : null;
  return list ? list.find(Boolean) || null : null;
}

function failureFile(error) {
  if (error && typeof error.file === 'string' && error.file) return error.file.replace(/\\/g, '/');
  const location = firstBuildError(error) && firstBuildError(error).location;
  return location && location.file ? String(location.file).replace(/\\/g, '/') : null;
}

function failureSummary(error, attempts) {
  if (error && error.devWorkerInputChanged === true) {
    return `${oneLine(error.message)}${attempts > 1 ? ` (${attempts} attempts)` : ''}`;
  }
  const file = failureFile(error);
  const first = firstBuildError(error);
  const line = first && first.location && first.location.line;
  const where = file ? `${file}${line != null ? `:${line}` : ''}` : null;
  const detail = oneLine((first && first.text) || (error && error.message) || error);
  return where ? `${where}: ${detail}` : detail;
}

// The server's 503 log and the launchers' prewarm log print `error.stack ||
// error.message`; keeping the stack identical to the one-line message keeps that
// log a single plain sentence instead of a trace. The original error stays on
// `cause` for debugging.
function plainFailure(error, attempts) {
  const message = `Dev sim worker bundle could not be built: ${failureSummary(error, attempts)}`;
  const failure = new Error(message);
  failure.stack = message;
  failure.cause = error;
  return failure;
}

function parseImportMap(html, root, importMapPath) {
  const open = '<script type="importmap">';
  const start = html.indexOf(open);
  if (start < 0) throw new Error(`No canonical import map found in ${importMapPath}`);
  const bodyStart = start + open.length;
  const close = html.indexOf('</script>', bodyStart);
  if (close < 0) throw new Error(`Unclosed canonical import map in ${importMapPath}`);
  const parsed = JSON.parse(html.slice(bodyStart, close));
  if (parsed.scopes && Object.keys(parsed.scopes).length) {
    throw new Error('Dev worker bundling does not support scoped import-map entries');
  }
  const imports = parsed.imports || {};
  const entries = Object.entries(imports).map(([specifier, target]) => {
    if (typeof target !== 'string' || !(target.startsWith('./') || target.startsWith('../') || target.startsWith('/'))) {
      throw new Error(`Dev worker import-map target must be a local path: ${specifier}`);
    }
    const isPrefix = specifier.endsWith('/');
    if (isPrefix !== target.endsWith('/')) {
      throw new Error(`Dev worker import-map prefix key and target must both end with '/': ${specifier}`);
    }
    const targetPath = target.startsWith('/') ? target.slice(1) : target;
    return {
      specifier,
      targetRoot: containedPath(root, join(root, targetPath)),
      isPrefix,
    };
  });
  return entries;
}

function importMapPlugin(entries) {
  return {
    name: 'spaceface-source-import-map',
    setup(build) {
      build.onResolve({ filter: /.*/ }, (args) => {
        if (args.path.startsWith('.') || args.path.startsWith('/') || isAbsolute(args.path)) return null;
        if (args.path.startsWith('node:')) {
          if (args.kind !== 'dynamic-import') {
            throw new Error(`Only guarded dynamic node builtins are preserved as external worker imports: ${args.path}`);
          }
          return { path: args.path, external: true };
        }
        const exact = entries.find((entry) => !entry.isPrefix && entry.specifier === args.path);
        if (exact) return { path: exact.targetRoot };
        const prefix = entries
          .filter((entry) => entry.isPrefix && args.path.startsWith(entry.specifier))
          .sort((a, b) => b.specifier.length - a.specifier.length)[0];
        if (!prefix) throw new Error(`No source import-map entry for bare worker import '${args.path}'`);
        const suffix = args.path.slice(prefix.specifier.length);
        return { path: containedPath(dirname(prefix.targetRoot), join(prefix.targetRoot, suffix)) };
      });
    },
  };
}

/**
 * Builds a fresh, debug-preserving in-memory ESM bundle for the source sim worker.
 * A verified artifact is returned only after every current graph input matches its
 * build fingerprint. In a live checkout a mid-build change is usually a write still
 * finishing, so the build retries a few times; when retries are spent and a
 * previously verified bundle exists, that last good bundle is served with a
 * warning instead of failing the boot. Other build failures surface as one plain
 * sentence naming the file.
 */
export function createDevSimWorkerBundleProvider({
  root,
  entryPoint = 'src/core/wholeSimBrowserWorker.js',
  importMapPath = 'index.html',
  buildApi = esbuild,
  maxAttempts = MAX_BUILD_ATTEMPTS,
  retryDelayMs = BUILD_RETRY_DELAY_MS,
} = {}) {
  if (!root) throw new TypeError('dev sim worker bundle provider requires the project root');
  const projectRoot = resolve(root);
  const entry = containedPath(projectRoot, join(projectRoot, entryPoint));
  const importMapFile = containedPath(projectRoot, join(projectRoot, importMapPath));
  const attempts = Number.isFinite(maxAttempts) && maxAttempts >= 1 ? Math.floor(maxAttempts) : MAX_BUILD_ATTEMPTS;
  const retryDelay = Number.isFinite(retryDelayMs) && retryDelayMs >= 0 ? retryDelayMs : BUILD_RETRY_DELAY_MS;
  let readyArtifact = null;
  let inFlight = null;

  async function buildFresh() {
    const importMapBytes = await readFileOrChanged(importMapFile);
    const importMapHash = sha256(importMapBytes);
    const html = importMapBytes.toString('utf8');
    const importMapEntries = parseImportMap(html, projectRoot, importMapPath);
    const capturedJs = new Map();
    const capturedInputs = new Map();
    const result = await buildApi.build({
      absWorkingDir: projectRoot,
      entryPoints: [entry],
      outfile: join(projectRoot, '.dev-sim-worker-output.js'),
      bundle: true,
      splitting: false,
      format: 'esm',
      platform: 'browser',
      target: ['es2022'],
      treeShaking: true,
      minify: false,
      sourcemap: false,
      write: false,
      metafile: true,
      logLevel: 'silent',
      conditions: ['browser', 'default'],
      mainFields: ['browser', 'module', 'main'],
      plugins: [
        importMapPlugin(importMapEntries),
        createSourceModuleUrlRewritePlugin({
          root: projectRoot,
          onLoadSource(filePath, sourceText) {
            capturedJs.set(resolve(projectRoot, filePath), sha256(sourceText));
          },
          onLoadInput(filePath, sourceBytes) {
            capturedInputs.set(resolve(projectRoot, filePath), sha256(sourceBytes));
          },
        }),
      ],
    });
    const outputs = result.outputFiles || [];
    const output = outputs.find((file) => file.path.endsWith('.js'));
    if (outputs.length !== 1 || !output || !output.text) {
      throw new Error('Dev sim worker build must emit exactly one standalone JavaScript bundle');
    }
    const inputPaths = Object.keys(result.metafile?.inputs || {}).map((input) => {
      const absolute = isAbsolute(input) ? input : resolve(projectRoot, input);
      return containedPath(projectRoot, absolute);
    });
    const fingerprints = new Map();
    for (const filePath of inputPaths) {
      const buildHash = capturedInputs.get(filePath);
      if (!buildHash) throw new Error(`Dev sim worker input was not captured during build: ${relative(projectRoot, filePath)}`);
      const rel = relative(projectRoot, filePath);
      const now = await readFileOrChanged(filePath);
      if (sha256(now) !== buildHash) throw inputChangedDuringBuild(`Dev sim worker input changed during build: ${rel}`, rel);
      fingerprints.set(filePath, `${now.length}:${buildHash}`);
    }
    for (const [filePath, buildHash] of capturedJs) {
      const rel = relative(projectRoot, filePath);
      const now = await readFileOrChanged(filePath, 'utf8');
      if (sha256(now) !== buildHash) throw inputChangedDuringBuild(`Dev sim worker source changed during build: ${rel}`, rel);
    }
    const currentImportMapBytes = await readFileOrChanged(importMapFile);
    if (sha256(currentImportMapBytes) !== importMapHash) {
      const rel = relative(projectRoot, importMapFile);
      throw inputChangedDuringBuild(`Dev sim worker import map changed during build: ${rel}`, rel);
    }
    const importMapFingerprint = `${currentImportMapBytes.length}:${importMapHash}`;
    const digest = sha256(JSON.stringify({
      code: output.text,
      importMap: importMapFingerprint,
      inputs: [...fingerprints].sort(([a], [b]) => a.localeCompare(b)),
    }));
    return {
      code: output.text,
      bytes: Buffer.from(output.contents),
      digest,
      inputs: [...fingerprints.keys()],
      fingerprints,
      importMapFingerprint,
    };
  }

  // A file that cannot be re-read in the verification phase is treated as one more
  // input that moved mid-build — a write is usually still finishing (rename/save).
  async function readFileOrChanged(filePath, encoding) {
    try {
      return await readFile(filePath, encoding);
    } catch {
      const rel = relative(projectRoot, filePath);
      throw inputChangedDuringBuild(`Dev sim worker input changed during build: ${rel}`, rel);
    }
  }

  async function fingerprintOrChanged(filePath) {
    try {
      return await fileFingerprint(filePath);
    } catch {
      const rel = relative(projectRoot, filePath);
      throw inputChangedDuringBuild(`Dev sim worker input changed during build: ${rel}`, rel);
    }
  }

  // Returns the project-relative path of the first input whose on-disk bytes no
  // longer match the artifact's verified fingerprints, or null when it is fresh.
  async function staleInput(artifact) {
    if (await fingerprintOrChanged(importMapFile) !== artifact.importMapFingerprint) {
      return relative(projectRoot, importMapFile);
    }
    for (const [filePath, fingerprint] of artifact.fingerprints) {
      if (await fingerprintOrChanged(filePath) !== fingerprint) return relative(projectRoot, filePath);
    }
    return null;
  }

  async function isCurrent(artifact) {
    if (!artifact) return false;
    try {
      return !(await staleInput(artifact));
    } catch {
      return false;
    }
  }

  // One build plus a serve-time freshness check is a single attempt. Mid-build or
  // mid-check movement retries — a write is usually still finishing — while real
  // build failures (syntax errors, genuinely missing files) fail immediately.
  async function buildWithRetries() {
    let lastError = null;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const artifact = await buildFresh();
        const stale = await staleInput(artifact);
        if (!stale) return artifact;
        lastError = inputChangedDuringBuild(
          `Dev sim worker input changed before the bundle could be served: ${stale}`, stale);
      } catch (error) {
        if (error && error.devWorkerInputChanged === true) lastError = error;
        else if (isTransientBuildRead(error)) {
          lastError = inputChangedDuringBuild(
            oneLine(error && error.message) || 'a build input became unreadable', failureFile(error));
        } else {
          throw error;
        }
      }
      if (attempt < attempts) await delay(retryDelay);
    }
    throw lastError;
  }

  async function buildOnce() {
    if (inFlight) return inFlight;
    inFlight = buildWithRetries().then((artifact) => {
      readyArtifact = artifact;
      return artifact;
    }).finally(() => {
      inFlight = null;
    });
    return inFlight;
  }

  function lastGoodBundle() {
    return {
      code: readyArtifact.code,
      bytes: Buffer.from(readyArtifact.bytes),
      digest: readyArtifact.digest,
      inputCount: readyArtifact.inputs.length,
      stale: true,
    };
  }

  function warnFallback(error) {
    const file = failureFile(error) || 'a worker input';
    console.warn(`[dev-sim-worker] could not build a fresh sim worker bundle — ${file} kept changing; serving the last good bundle`);
  }

  return Object.freeze({
    async prewarm() {
      try {
        const artifact = await buildOnce();
        return { digest: artifact.digest };
      } catch (error) {
        if (error && error.devWorkerInputChanged === true && readyArtifact) {
          warnFallback(error);
          return { digest: readyArtifact.digest };
        }
        throw plainFailure(error, attempts);
      }
    },
    async getBundle() {
      if (await isCurrent(readyArtifact)) {
        return {
          code: readyArtifact.code,
          bytes: Buffer.from(readyArtifact.bytes),
          digest: readyArtifact.digest,
          inputCount: readyArtifact.inputs.length,
        };
      }
      let artifact;
      try {
        artifact = await buildOnce();
      } catch (error) {
        if (error && error.devWorkerInputChanged === true && readyArtifact) {
          warnFallback(error);
          return lastGoodBundle();
        }
        throw plainFailure(error, attempts);
      }
      return { code: artifact.code, bytes: Buffer.from(artifact.bytes), digest: artifact.digest, inputCount: artifact.inputs.length };
    },
  });
}
