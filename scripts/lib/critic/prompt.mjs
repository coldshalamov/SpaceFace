// scripts/lib/critic/prompt.mjs — Prompt generation for critic vision review.
//
// Prompt requirements:
// - The ten questions verbatim, result shape, and "answer with result document only".
// - Absolute path of every frame, with index, simTime, and whether near moment.
// - Manifest facts: arena, hull, ruleset, camera measurements, moments with times and kinds,
//   hostilesAlive, and playerSpeed per frame.
// - Hard instruction: "Never answer with content. Do not propose more enemies, ships, weapons,
//   missions, particles, camera shake, or more health. Name a rule that already exists and what
//   it should do instead."
// - NO headless bench bar numbers unless explicitly passed via --metrics, in which case labelled
//   "headless bench (stand-in kernel; provisional)".

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RUBRIC_QUESTIONS } from './rubric.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '../../../');
const DEFAULT_TEMPLATE_PATH = resolve(ROOT, 'tools/agentic/critic/critic-rubric-prompt.txt');

/**
 * Builds the one-per-line list of frames with absolute path, simTime, hostiles, speed, and moment flag.
 *
 * @param {object} manifest
 * @returns {string}
 */
export function buildFrameListText(manifest, shownFrames = null) {
  const frames = Array.isArray(shownFrames) && shownFrames.length > 0 ? shownFrames : (manifest?.frames || []);
  const stripDir = manifest?.stripDir || '';
  if (frames.length === 0) {
    return '(No frames recorded in manifest)';
  }

  return frames
    .map((f) => {
      const absPath = resolve(stripDir, f.file);
      const simTimeStr = typeof f.simTime === 'number' ? `${f.simTime.toFixed(3)}s` : 'unknown';
      const speedStr = f.playerSpeed != null ? String(f.playerSpeed) : 'n/a';
      const nearMarker = f.nearMoment ? ' [NEAR MOMENT]' : '';
      const drawn = f.hullPartsDrawn != null ? ` | shipDrawnThisFrame: ${f.hullPartsDrawn > 0 ? 'yes' : 'NO'}` : '';
      return `frame_${String(f.index).padStart(3, '0')}: path: ${absPath} | index: ${f.index} | tick: ${f.tick} | simTime: ${simTimeStr} | hostilesAlive: ${f.hostilesAlive} | playerSpeed: ${speedStr}${nearMarker}${drawn}`;
    })
    .join('\n');
}

/**
 * Formats manifest facts recorded from the headed run.
 *
 * @param {object} manifest
 * @returns {string}
 */
export function buildManifestFactsText(manifest) {
  const lines = [
    `- Bench: ${manifest?.bench ?? 'unknown'}`,
    `- Scenario ID: ${manifest?.scenarioId ?? 'unknown'}`,
    `- Scenario Label: ${manifest?.scenarioLabel ?? 'none'}`,
    `- Hull / Loadout: ${manifest?.loadoutId ?? 'unknown'}`,
    `- Arena ID: ${manifest?.arenaId ?? 'unknown'}`,
    `- Ruleset: ${manifest?.ruleset ?? 'unknown'}`,
    `- Seed: ${manifest?.seed ?? 0}`,
    `- Run Kind: ${manifest?.runKind ?? 'standard'}`,
    `- Tick Basis: ${manifest?.tickBasis ?? 'run-relative'}`,
    `- Run Start Tick: ${manifest?.runStartTick ?? 0}`,
    `- Sample Rate: ${manifest?.sampleHz ?? 8} Hz (baseline: ${manifest?.baselineFps ?? 4} fps, moments: ${manifest?.momentFps ?? 8} fps)`,
    `- Frames Count: ${manifest?.framesCount ?? manifest?.frames?.length ?? 0}`,
    `- Captured Span: ${manifest?.capturedSpanS ?? 0} seconds (requested: ${manifest?.requestedDurationS ?? 0}s)`,
    `- Run Termination: ${manifest?.stoppedBecause ?? 'normal'}`,
  ];
  return lines.join('\n');
}

/**
 * Formats camera measurements and HUD verification facts.
 *
 * @param {object} manifest
 * @returns {string}
 */
export function buildCameraFactsText(manifest) {
  const cam = manifest?.cameraMeasured;
  const lines = [
    `- Camera Mode: ${manifest?.camera ?? 'shipping_chase'} (controller: ${cam?.controller ?? 'unknown'})`,
    `- Height: ${cam?.heightWU != null ? `${cam.heightWU} WU` : 'unmeasured'}`,
    `- FOV: ${cam?.fovDeg != null ? `${cam.fovDeg} deg` : 'unmeasured'}`,
    `- Aspect Ratio: ${cam?.aspect ?? 'unmeasured'}`,
    `- Visible Depth: ${cam?.visibleDepthWU != null ? `${cam.visibleDepthWU} WU` : 'unmeasured'}`,
    `- HUD Text State: ${manifest?.hudText ?? 'off'} (verified clean: ${manifest?.hudTextVerified ? 'YES' : 'NO'})`,
  ];
  return lines.join('\n');
}

/**
 * Formats recorded bus moments.
 *
 * @param {object} manifest
 * @returns {string}
 */
export function buildMomentsListText(manifest) {
  // Only the moments inside the photographed span. A collision ninety seconds before the first
  // frame is not something the critic can see, and listing it invites a verdict about it.
  const moments = (Array.isArray(manifest?.momentsInSpan) && manifest.momentsInSpan.length > 0)
    ? manifest.momentsInSpan
    : (manifest?.moments || []);
  if (moments.length === 0) {
    return '- No collision or impact moments recorded on the bus during this run.';
  }
  return moments
    .map(
      (m, i) =>
        `- Moment ${i + 1}: type="${m.type}" | tick=${m.tick} | simTime=${m.simTime}s | magnitude=${m.magnitude} | playerInvolved=${m.playerInvolved}`
        + (m.surface ? ` | with=${m.surface}` : '')
    )
    .join('\n');
}

/**
 * What the pilot's hands did, in strip time. The tape is the scenario's own definition — the same
 * kind of fact as the arena and the hull — and it never says what the game did in answer.
 *
 * @param {object} manifest
 * @returns {string}
 */
export function buildInputEventsText(manifest) {
  const events = Array.isArray(manifest?.inputEvents) ? manifest.inputEvents : [];
  if (events.length === 0) {
    return '- Hands off the stick for the whole strip (no pilot input).';
  }
  return events
    .map((e) => `- simTime ${Number(e.simTime).toFixed(2)}s (tick ${e.tick}): ${e.input}`)
    .join('\n');
}

/**
 * Formats the verbatim 10-question rubric.
 *
 * @returns {string}
 */
export function buildRubricQuestionsText() {
  return RUBRIC_QUESTIONS.map((rq) => {
    if (rq.q <= 9) {
      const goodStr = rq.goodAnswer === 'no' ? ' (good answer: NO — this question is inverted)' : ' (good answer: YES)';
      return `${rq.q}. ${rq.question}${goodStr}\n   [Requires frameIndex from the strip proving the answer]`;
    }
    return `${rq.q}. ${rq.question}\n   [Requires frameIndex, rule, file, does, and breaksSentence]`;
  }).join('\n\n');
}

/**
 * Formats provisional metrics if provided.
 *
 * @param {string|object|null} metrics
 * @returns {string}
 */
export function buildProvisionalMetricsText(metrics) {
  if (!metrics) return '';
  const text = typeof metrics === 'string' ? metrics : JSON.stringify(metrics, null, 2);
  return `\n# Headless Bench Numbers (stand-in kernel; provisional)\n${text}\n`;
}

/**
 * Builds the complete prompt for critic evaluation.
 *
 * @param {object} manifest Manifest data
 * @param {object} [options]
 * @param {string} [options.templatePath] Path to custom prompt template
 * @param {string|object} [options.metrics] Provisional metrics
 * @returns {string}
 */
export function buildCriticPrompt(manifest, options = {}) {
  const templatePath = options.templatePath || DEFAULT_TEMPLATE_PATH;
  let template = readFileSync(templatePath, 'utf8');

  const shownFrames = Array.isArray(options.frames) && options.frames.length > 0 ? options.frames : null;
  const manifestFacts = buildManifestFactsText(manifest);
  const cameraFacts = buildCameraFactsText(manifest);
  const momentsList = buildMomentsListText(manifest);
  const inputEvents = buildInputEventsText(manifest);
  const frameList = buildFrameListText(manifest, shownFrames);
  const rubricQuestions = buildRubricQuestionsText();
  const provisionalMetrics = buildProvisionalMetricsText(options.metrics);

  template = template
    .replace('{{MANIFEST_FACTS}}', manifestFacts)
    .replace('{{CAMERA_FACTS}}', cameraFacts)
    .replace('{{MOMENTS_LIST}}', momentsList)
    .replace('{{INPUT_EVENTS}}', inputEvents)
    .replace('{{FRAME_LIST}}', shownFrames
      ? `You are shown ${shownFrames.length} of the ${manifest?.frames?.length ?? 0} frames in this strip`
        + `${options.selectionReason ? ` (${options.selectionReason})` : ''}. `
        + 'Open every one of them before you answer. You may cite ONLY these indices; any other '
        + 'index is refused by the harness.\n'
        + frameList
      : frameList)
    .replace('{{RUBRIC_QUESTIONS}}', rubricQuestions)
    .replace('{{PROVISIONAL_METRICS}}', provisionalMetrics);

  return template;
}
