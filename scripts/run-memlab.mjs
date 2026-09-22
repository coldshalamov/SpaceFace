#!/usr/bin/env node
// Automated MemLab runner for SpaceFace.
// Detects detached DOM elements, retained Three.js objects, dangling event listeners, and memory leaks.

import { createServer, get as httpRequestGet } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import * as memlab from '@memlab/api';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT_DIR = path.join(ROOT, '.devshots', 'memlab');
const SCENARIO_DIR = path.join(ROOT, 'tools', 'perf', 'memlab', 'scenarios');
const PORT = Number(process.env.SPACEFACE_PORT || 8123);

const SCENARIO_ARG = process.argv.find((a) => a.startsWith('--scenario='))?.split('=')[1] || 'ship-preview';

async function isServerRunning(port) {
  return new Promise((resolve) => {
    const req = httpGet(`http://127.0.0.1:${port}/`, (res) => {
      resolve(res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1000, () => { req.destroy(); resolve(false); });
  });
}

function httpGet(url, cb) {
  return httpRequestGet(url, cb);
}

async function ensureLocalServer() {
  const running = await isServerRunning(PORT);
  if (running) {
    console.log(`[perf:memlab] Using existing server on port ${PORT}`);
    return null;
  }
  console.log(`[perf:memlab] Starting local server on port ${PORT}...`);
  const srv = spawn('node', ['server.js', String(PORT)], {
    cwd: ROOT,
    stdio: 'ignore',
    detached: false,
  });
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (await isServerRunning(PORT)) {
      console.log('[perf:memlab] Server is up.');
      return srv;
    }
  }
  throw new Error(`Server failed to start on port ${PORT}`);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const serverProcess = await ensureLocalServer();

  try {
    const scenarioFile = SCENARIO_ARG.endsWith('.mjs') || SCENARIO_ARG.endsWith('.js')
      ? SCENARIO_ARG
      : `${SCENARIO_ARG}.scenario.mjs`;
    const scenarioPath = path.isAbsolute(scenarioFile) ? scenarioFile : path.join(SCENARIO_DIR, scenarioFile);

    console.log(`[perf:memlab] Loading scenario: ${scenarioPath}...`);
    const scenarioModule = await import(path.isAbsolute(scenarioPath) ? `file://${scenarioPath}` : `file://${path.resolve(scenarioPath)}`);

    const scenario = {
      url: scenarioModule.url,
      action: scenarioModule.action,
      back: scenarioModule.back,
      repeat: scenarioModule.repeat || (() => 1),
    };

    console.log('[perf:memlab] Running MemLab test...');
    const resultReader = await memlab.run({
      scenario,
      workDir: path.join(OUT_DIR, 'snapshots'),
    });

    console.log('[perf:memlab] MemLab run complete. Processing heap analysis...');

    // Extract leak summaries
    let reportData = {
      scenario: path.basename(scenarioPath),
      date: new Date().toISOString(),
      leaks: [],
    };

    const leaks = typeof resultReader?.getLeaks === 'function' ? resultReader.getLeaks() : [];
    console.log(`[perf:memlab] Detected ${leaks.length} leak cluster(s).`);

    const reportMd = [
      '# MemLab Memory Leak Analysis Report',
      '',
      `- **Date**: ${reportData.date}`,
      `- **Scenario**: \`${reportData.scenario}\``,
      `- **Leak Clusters Detected**: **${leaks.length}**`,
      '',
      leaks.length === 0
        ? '✅ **PASS**: No memory leaks or detached elements detected in this scenario.'
        : '⚠️ **LEAKS DETECTED**: Retained objects found after baseline reset.',
      '',
      '## Leak Cluster Details',
      '',
      ...leaks.map((cluster, i) => {
        return [
          `### Cluster ${i + 1}: ${cluster.name || 'Anonymous Object'}`,
          `- Retained Size: ${cluster.retainedSize ? (cluster.retainedSize / 1024).toFixed(1) + ' KB' : 'unknown'}`,
          `- Retainer Count: ${cluster.count || 1}`,
          '',
        ].join('\n');
      }),
      '',
      '## MemLab Commands for In-Depth Exploration',
      '',
      '```bash',
      '# Interactive heap explorer for the last run:',
      'npx memlab view-heap',
      '',
      '# Find retainer traces for a specific leaked node:',
      'npx memlab trace --node-id=<NODE_ID>',
      '```',
      '',
    ].join('\n');

    const reportPath = path.join(OUT_DIR, 'report.md');
    await writeFile(reportPath, reportMd, 'utf8');
    console.log(`[perf:memlab] Report saved to ${reportPath}`);

  } finally {
    if (serverProcess) serverProcess.kill();
  }
}

main().catch((err) => {
  console.error('[perf:memlab] Run failed:', err);
  process.exit(1);
});
