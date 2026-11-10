#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runPerformanceLifecycleProbe } from './lib/performanceLifecycleProbe.mjs';
import browserManifest from './validation-manifests/performance-lifecycle-browser.mjs';
import electronManifest from './validation-manifests/performance-lifecycle-electron.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const args = new Set(process.argv.slice(2));
const runtimeArg = [...args].find((arg) => arg.startsWith('--runtime='));
const runtimeKind = runtimeArg?.slice('--runtime='.length) || null;
const diagnostic = args.has('--diagnostic');
const acceptance = args.has('--acceptance');

if (!['browser', 'electron'].includes(runtimeKind) || diagnostic === acceptance) {
  console.error('usage: node scripts/check-performance-lifecycle.mjs --runtime=browser|electron --acceptance|--diagnostic');
  process.exitCode = 2;
} else {
  const manifest = runtimeKind === 'browser' ? browserManifest : electronManifest;
  try {
    const result = await runPerformanceLifecycleProbe({
      root: ROOT,
      runtimeKind,
      manifest,
      mode: diagnostic ? 'diagnostic' : 'acceptance',
      brokerClaimToken: process.env.SF_BROKER_CLAIM ?? null,
      outputRoot: path.resolve(ROOT, manifest.artifactRoot),
      log: (message) => console.log(message),
    });
    console.log(`[performance-lifecycle] PASS runtime=${runtimeKind}`);
    console.log(`[performance-lifecycle] evidence=${result.evidencePath}`);
    console.log(`[performance-lifecycle] transitions=${result.evidence.transitions.length} hiddenGpuSubmissions=${result.evidence.transitions.reduce((sum, entry) => sum + entry.hiddenDelta.gpuSubmissions, 0)}`);
  } catch (error) {
    console.error(`[performance-lifecycle] FAIL runtime=${runtimeKind}: ${error?.stack || error}`);
    if (error?.evidencePath) console.error(`[performance-lifecycle] evidence=${error.evidencePath}`);
    process.exitCode = 1;
  }
}
