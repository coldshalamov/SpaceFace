// Proof index for authoritative sessions. Video stays unverified until the
// frames are the live view. Dot rasters are not written.

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { SHAPE_IDS } from '../../src/presentation/momentMachine/contract.js';
import { runSessions, SESSION_COUNT } from './sessions.mjs';
import { attemptHeadedPlayback } from './headedCapture.mjs';

export async function writeBatch(outDir, options = {}) {
  const sessions = options.sessions || runSessions(options.count || SESSION_COUNT);
  const headed = options.headed === false ? {
    attempted: false,
    ok: false,
    videoVerified: false,
    error: 'headed capture skipped',
  } : await attemptHeadedPlayback({ cwd: options.cwd, port: options.port });
  await mkdir(outDir, { recursive: true });
  const index = {
    schema: 'spaceface.momentIndex.v1',
    situations: sessions.count,
    selectMs: sessions.elapsedMs,
    evidenceClass: sessions.evidenceClass,
    videoVerified: false,
    tooling: {
      unverified: true,
      reason: 'playback-frames-not-captured',
    },
    headedCapture: {
      attempted: headed.attempted === true,
      ok: false,
      videoVerified: false,
      producedVideo: false,
      error: headed.error || headed.stderr || null,
      chromeCode: headed.chromeCode == null ? null : headed.chromeCode,
      serverUp: headed.serverUp === true,
    },
    selectedShapes: sessions.selectedShapes,
    unselectedShapes: sessions.unselectedShapes || SHAPE_IDS.slice(),
    categoryCount: sessions.selectedShapes.filter((shape) => SHAPE_IDS.includes(shape)).length,
    clipCount: 0,
    sessions: sessions.rows,
  };
  await writeFile(path.join(outDir, 'index.json'), JSON.stringify(index, null, 2));
  const captureError = headed.error || headed.stderr || null;
  if (captureError) {
    await writeFile(path.join(outDir, 'headed-capture-error.txt'), String(captureError));
  }
  return index;
}
