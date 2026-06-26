#!/usr/bin/env node
// Browser frame-delivery control probe for SpaceFace performance work.
//
// This intentionally does not load the game. It answers one question:
// can the same headless browser/runtime deliver steady requestAnimationFrame
// callbacks on this machine right now?
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { loadPlaywright } from './lib/load-playwright.mjs';

const argv = parseArgs(process.argv.slice(2));
const WIDTH = Number(argv.width || 1830);
const HEIGHT = Number(argv.height || 973);
const WARMUP_MS = Number(argv.warmup || 1000);
const DURATION_MS = Number(argv.duration || 5000);
const FRAME_FLOOR_MS = Number(argv.frameFloorMs || argv['frame-floor-ms'] || 34.3);
const STRICT = !!argv.strict;
const OUT = argv.out || '.devshots/perf/raf-control.json';
const USE_BUNDLED = !!argv.bundled;
const ANGLE = argv.angle ? String(argv.angle) : '';
const HEADED = !!(argv.headed || argv.headful || argv.headless === 'false');
const EXTRA_BROWSER_ARGS = [
  ANGLE ? `--use-angle=${ANGLE}` : null,
  argv['disable-gpu-vsync'] ? '--disable-gpu-vsync' : null,
  argv['disable-gpu-compositing'] ? '--disable-gpu-compositing' : null,
].filter(Boolean);
const MODES = String(argv.modes || 'blank,webgl-clear')
  .split(',')
  .map((mode) => mode.trim())
  .filter(Boolean);

const { chromium } = await loadPlaywright();
const browser = await chromium.launch({
  headless: !HEADED,
  executablePath: USE_BUNDLED ? undefined : findChrome(),
  args: [
    '--no-sandbox',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--hide-scrollbars',
    '--ignore-gpu-blocklist',
    '--enable-webgl',
    `--window-size=${WIDTH},${HEIGHT}`,
    ...EXTRA_BROWSER_ARGS,
  ],
});

try {
  const results = [];
  for (const mode of MODES) {
    const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
    await page.setContent(htmlForMode(mode), { waitUntil: 'load' });
    const sample = await page.evaluate(sampleRafControl, {
      mode,
      warmupMs: WARMUP_MS,
      durationMs: DURATION_MS,
    });
    await page.close();
    results.push({
      mode,
      pass: sample.frameMs.p95 <= FRAME_FLOOR_MS,
      frameMs: sample.frameMs,
      viewport: sample.viewport,
      renderer: sample.renderer,
    });
  }

  const report = {
    schema: 'spaceface.rafControl.v1',
    generatedAt: new Date().toISOString(),
    runner: {
      width: WIDTH,
      height: HEIGHT,
      warmupMs: WARMUP_MS,
      durationMs: DURATION_MS,
      frameFloorMs: FRAME_FLOOR_MS,
    strict: STRICT,
    browser: USE_BUNDLED ? 'playwright-bundled' : 'installed-chrome-edge',
    headless: !HEADED,
    angle: ANGLE || null,
    extraBrowserArgs: EXTRA_BROWSER_ARGS,
    modes: MODES,
  },
    pass: results.every((result) => result.pass),
    results,
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  console.log(`[raf-control] report: ${OUT}`);
  console.log(`[raf-control] summary: ${report.pass ? 'PASS' : 'FAIL'}`);
  if (STRICT && !report.pass) process.exitCode = 1;
} finally {
  await browser.close();
}

function htmlForMode(mode) {
  if (mode === 'webgl-clear') {
    return `<!doctype html>
<html><body style="margin:0;background:#05070c;overflow:hidden">
<canvas id="c" width="${WIDTH}" height="${HEIGHT}" style="display:block;width:100vw;height:100vh"></canvas>
</body></html>`;
  }
  return `<!doctype html>
<html><body style="margin:0;background:#05070c;overflow:hidden"></body></html>`;
}

function parseArgs(args) {
  const out = { _: [] };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith('--')) {
      out._.push(arg);
      continue;
    }
    const key = arg.slice(2);
    const next = args[i + 1];
    if (next && !next.startsWith('--')) {
      out[key] = next;
      i++;
    } else {
      out[key] = true;
    }
  }
  return out;
}

function findChrome() {
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) throw new Error('Chrome or Edge executable not found for rAF control probe');
  return found;
}

/* global window, document, requestAnimationFrame, performance */
async function sampleRafControl({ mode, warmupMs, durationMs }) {
  const frames = [];
  const viewport = {
    width: window.innerWidth,
    height: window.innerHeight,
    dpr: window.devicePixelRatio || 1,
    userAgent: window.navigator.userAgent,
  };
  let renderer = null;
  let gl = null;

  if (mode === 'webgl-clear') {
    const canvas = document.getElementById('c');
    gl = canvas && (canvas.getContext('webgl2') || canvas.getContext('webgl'));
    if (gl) {
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      renderer = dbg ? {
        vendor: gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL),
        renderer: gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL),
      } : {
        vendor: gl.getParameter(gl.VENDOR),
        renderer: gl.getParameter(gl.RENDERER),
      };
    }
  }

  await new Promise((resolve) => {
    const start = performance.now();
    const sampleStart = start + warmupMs;
    const end = sampleStart + durationMs;
    let last = null;

    function tick(now) {
      if (mode === 'webgl-clear' && gl) {
        const t = now * 0.001;
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
        gl.clearColor(0.02 + Math.sin(t) * 0.01, 0.03, 0.06, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
      }
      if (last != null && now >= sampleStart) frames.push(now - last);
      last = now;
      if (now < end) requestAnimationFrame(tick);
      else resolve();
    }

    requestAnimationFrame(tick);
  });

  const frameStats = (values) => {
    const nums = values.filter((value) => Number.isFinite(value) && value >= 0);
    nums.sort((a, b) => a - b);
    const sum = nums.reduce((total, value) => total + value, 0);
    const percentile = (p) => {
      if (!nums.length) return 0;
      const index = Math.min(nums.length - 1, Math.floor(p * (nums.length - 1)));
      return nums[index];
    };
    const round = (value) => Number.isFinite(value) ? Number(value.toFixed(2)) : value;
    return {
      samples: nums.length,
      avg: round(nums.length ? sum / nums.length : 0),
      min: round(nums[0] || 0),
      max: round(nums[nums.length - 1] || 0),
      p50: round(percentile(0.5)),
      p95: round(percentile(0.95)),
      p99: round(percentile(0.99)),
      over16_7: nums.filter((value) => value > 16.7).length,
      over34_3: nums.filter((value) => value > 34.3).length,
      over50: nums.filter((value) => value > 50).length,
    };
  };

  return {
    mode,
    viewport,
    renderer,
    frameMs: frameStats(frames),
  };
}

function frameStats(values) {
  const nums = values.filter((value) => Number.isFinite(value) && value >= 0);
  nums.sort((a, b) => a - b);
  const sum = nums.reduce((total, value) => total + value, 0);
  return {
    samples: nums.length,
    avg: round(nums.length ? sum / nums.length : 0),
    min: round(nums[0] || 0),
    max: round(nums[nums.length - 1] || 0),
    p50: round(percentile(nums, 0.5)),
    p95: round(percentile(nums, 0.95)),
    p99: round(percentile(nums, 0.99)),
    over16_7: nums.filter((value) => value > 16.7).length,
    over34_3: nums.filter((value) => value > 34.3).length,
    over50: nums.filter((value) => value > 50).length,
  };
}

function percentile(sortedNums, p) {
  if (!sortedNums.length) return 0;
  const index = Math.min(sortedNums.length - 1, Math.floor(p * (sortedNums.length - 1)));
  return sortedNums[index];
}

function round(value) {
  return Number.isFinite(value) ? Number(value.toFixed(2)) : value;
}
