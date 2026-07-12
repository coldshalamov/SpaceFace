#!/usr/bin/env node
import { runReleaseCapture } from './lib/releaseCaptureRunner.mjs';

try {
  const result = await runReleaseCapture({ producerEntrypoint: 'scripts/capture-capsule-shots.mjs' });
  console.log(`[release-capture] PASS six capsule shots + gameplay WebM: ${result.acceptedRoot}`);
} catch (error) {
  console.error(`[release-capture] FAIL: ${error?.stack || error}`);
  process.exitCode = 1;
}
