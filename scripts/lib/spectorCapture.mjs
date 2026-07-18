import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export function resolveSpectorBundlePath() {
  return require.resolve('spectorjs/dist/spector.bundle.js');
}

export async function captureSpectorFrame(page, { timeoutMs = 45_000 } = {}) {
  await page.addScriptTag({ path: resolveSpectorBundlePath() });
  const captureString = await page.evaluate(({ timeoutMs: timeout }) => new Promise((resolve, reject) => {
    const canvas = window.SF?.state?.render?.renderer?.domElement || document.querySelector('canvas');
    if (!canvas) {
      reject(new Error('Spector capture could not find the live renderer canvas'));
      return;
    }
    const SpectorCtor = globalThis.SPECTOR?.Spector;
    if (typeof SpectorCtor !== 'function') {
      reject(new Error('Spector bundle did not expose SPECTOR.Spector'));
      return;
    }
    const spector = new SpectorCtor();
    const timer = setTimeout(() => reject(new Error(`Spector frame capture timed out after ${timeout}ms`)), timeout);
    spector.onCapture.add((capture) => {
      clearTimeout(timer);
      try { resolve(JSON.stringify(capture)); } catch (error) { reject(error); }
    });
    spector.captureCanvas(canvas);
  }), { timeoutMs });
  return JSON.parse(captureString);
}

export function summarizeSpectorCapture(capture) {
  const commands = Array.isArray(capture?.commands) ? capture.commands : [];
  const names = commands.map((command) => String(
    command?.name || command?.commandName || command?.command?.name || command?.command || 'unknown',
  ));
  const drawNames = names.filter((name) => /draw(?:Arrays|Elements)/i.test(name));
  const textureNames = new Set();
  const shaderNames = new Set();
  for (const command of commands) {
    const text = JSON.stringify(command);
    for (const match of text.matchAll(/(?:texture|sampler)[^"\\]*["\\:\s]+([^"\\,}\]]+)/gi)) textureNames.add(match[1].trim());
    for (const match of text.matchAll(/(?:program|shader)[^"\\]*["\\:\s]+([^"\\,}\]]+)/gi)) shaderNames.add(match[1].trim());
  }
  return {
    schema: 'spaceface.spectorFrameSummary.v1',
    commandCount: commands.length,
    drawCallCount: drawNames.length,
    drawCallsByName: countBy(drawNames),
    context: capture?.context || capture?.contextInformation || null,
    canvas: capture?.canvas || capture?.canvasInformation || null,
    textureIdentities: [...textureNames].slice(0, 128),
    shaderIdentities: [...shaderNames].slice(0, 128),
  };
}

function countBy(values) {
  const counts = {};
  for (const value of values) counts[value] = (counts[value] || 0) + 1;
  return counts;
}
