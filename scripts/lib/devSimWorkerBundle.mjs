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
 * The artifact is only returned after every current graph input matches its build
 * fingerprint; failed or stale builds are never served as a fallback.
 */
export function createDevSimWorkerBundleProvider({
  root,
  entryPoint = 'src/core/wholeSimBrowserWorker.js',
  importMapPath = 'index.html',
  buildApi = esbuild,
} = {}) {
  if (!root) throw new TypeError('dev sim worker bundle provider requires the project root');
  const projectRoot = resolve(root);
  const entry = containedPath(projectRoot, join(projectRoot, entryPoint));
  const importMapFile = containedPath(projectRoot, join(projectRoot, importMapPath));
  let readyArtifact = null;
  let inFlight = null;

  async function buildFresh() {
    const importMapBytes = await readFile(importMapFile);
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
      const now = await readFile(filePath);
      if (sha256(now) !== buildHash) throw new Error(`Dev sim worker input changed during build: ${relative(projectRoot, filePath)}`);
      fingerprints.set(filePath, `${now.length}:${buildHash}`);
    }
    for (const [filePath, buildHash] of capturedJs) {
      const now = await readFile(filePath, 'utf8');
      if (sha256(now) !== buildHash) throw new Error(`Dev sim worker source changed during build: ${relative(projectRoot, filePath)}`);
    }
    const currentImportMapBytes = await readFile(importMapFile);
    if (sha256(currentImportMapBytes) !== importMapHash) {
      throw new Error(`Dev sim worker import map changed during build: ${relative(projectRoot, importMapFile)}`);
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

  async function buildOnce() {
    if (inFlight) return inFlight;
    inFlight = buildFresh().then((artifact) => {
      readyArtifact = artifact;
      return artifact;
    }).finally(() => {
      inFlight = null;
    });
    return inFlight;
  }

  async function isCurrent(artifact) {
    if (!artifact) return false;
    if (await fileFingerprint(importMapFile) !== artifact.importMapFingerprint) return false;
    for (const [filePath, fingerprint] of artifact.fingerprints) {
      if (await fileFingerprint(filePath) !== fingerprint) return false;
    }
    return true;
  }

  return Object.freeze({
    async prewarm() {
      const artifact = await buildOnce();
      return { digest: artifact.digest };
    },
    async getBundle() {
      if (readyArtifact && await isCurrent(readyArtifact)) {
      return {
        code: readyArtifact.code,
        bytes: Buffer.from(readyArtifact.bytes),
        digest: readyArtifact.digest,
        inputCount: readyArtifact.inputs.length,
      };
      }
      const artifact = await buildOnce();
      if (!await isCurrent(artifact)) {
        readyArtifact = null;
        throw new Error('Dev sim worker inputs changed before the bundle could be served');
      }
      return { code: artifact.code, bytes: Buffer.from(artifact.bytes), digest: artifact.digest, inputCount: artifact.inputs.length };
    },
  });
}
