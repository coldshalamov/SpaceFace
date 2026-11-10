#!/usr/bin/env node
import { runReleaseCapture } from './lib/releaseCaptureRunner.mjs';

try {
  const result = await runReleaseCapture({ producerEntrypoint: 'scripts/capture-gameplay-60s.mjs' });
  console.log(`[release-capture] PASS gameplay WebM + six capsule shots: ${result.acceptedRoot}`);
} catch (error) {
  console.error(`[release-capture] FAIL: ${error?.stack || error}`);
  process.exitCode = 1;
}
