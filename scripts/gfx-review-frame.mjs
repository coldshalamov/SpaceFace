// Independent modern-parity reviewer.
//
// Hands ONE of our captured gameplay frames plus the matched 2020s-game reference frames for the
// SAME scene type to codex, and gets back a per-axis JSON scorecard. codex is a separate process
// from a different vendor and is given only images + the rubric — it does not inherit the authoring
// session's reasoning, which is the whole point of the gate.
//
// Reviewer surface: `codex exec` (CLI). The identical image set + rubric is also written to a
// review packet under .devshots/gfx/packets/ so the same review can be run by hand in browser Codex.
//
// Run: node scripts/gfx-review-frame.mjs --scene deep-flight --shot .devshots/gfx/base-deep-flight.jpg
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, copyFileSync } from 'node:fs';
import { join, basename } from 'node:path';

const argv = parseArgs(process.argv.slice(2));
const SCENE = argv.scene;
const SHOT = argv.shot;
const PERF = argv.perf || (SHOT ? SHOT.replace(/\.jpe?g$/i, '.json') : null);
const REF_DIR = argv.refs || join('.devshots/gfx/refs', String(SCENE));
const OUT = argv.out || `.devshots/gfx/reviews/${SCENE}.json`;
const PACKET_DIR = argv.packet || `.devshots/gfx/packets/${SCENE}`;
const MODEL = argv.model || null;
const MAX_REFS = Number(argv.maxRefs || 4);
// Measured: a real 2020s AAA reference frame scores 4 on every comparable axis through this harness.
const REFERENCE_AXIS_TARGET = 4;
const PASS_SCORE = Number(argv.passScore || 4);

if (!SCENE || !SHOT) {
  console.error('usage: node scripts/gfx-review-frame.mjs --scene <type> --shot <our-frame.jpg>');
  process.exit(2);
}
if (!existsSync(SHOT)) { console.error(`[review] missing our frame: ${SHOT}`); process.exit(2); }
if (!existsSync(REF_DIR)) { console.error(`[review] missing reference dir: ${REF_DIR}`); process.exit(2); }

const refs = readdirSync(REF_DIR)
  .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
  .slice(0, MAX_REFS)
  .map((f) => join(REF_DIR, f));
if (!refs.length) { console.error(`[review] no reference images in ${REF_DIR}`); process.exit(2); }

// Perf facts travel WITH the review so the reviewer cannot propose something the frame budget
// cannot pay for, and so "looks better but halved the framerate" can never read as a pass.
let perfLine = 'perf: unknown';
let perf = null;
if (PERF && existsSync(PERF)) {
  perf = JSON.parse(readFileSync(PERF, 'utf8'));
  const ft = perf.frameMs || {};
  const r = perf.render || {};
  const v = (perf.capture && perf.capture.settings && perf.capture.settings.video) || {};
  perfLine = `perf: p95=${num(ft.p95)}ms avg=${num(ft.avg)}ms drawCalls=${r.calls} triangles=${r.triangles} `
    + `gpu="${perf.capture && perf.capture.gpu}" viewport=${perf.capture && perf.capture.viewport && `${perf.capture.viewport.width}x${perf.capture.viewport.height}`} `
    + `renderScale=${v.renderScale} shadows=${v.shadows} bloom=${v.bloom}/${v.bloomStrength} particleQuality=${v.particleQuality}`;
}

const RUBRIC = `You are an independent rendering reviewer. You are NOT the author of this game and must
not be generous.

WHAT YOU ARE LOOKING AT
- The LAST image is a real gameplay frame from the game under review, captured through its normal
  player camera and route. Its filename is: ${basename(SHOT)}
- The images BEFORE it are reference frames from acclaimed 2020s space games showing the SAME scene
  type: "${SCENE}".

THE GAME'S HARD CONSTRAINTS — a recommendation that violates these is worthless
- Three.js on WebGL2, running in a browser and in Electron. No compute shaders, no bindless, no
  hardware ray tracing, no mesh shaders.
- Must hold 60fps on an Intel integrated GPU. Current measured frame budget for this exact frame:
  ${perfLine}
- Third-person chase camera behind a small player ship. Non-diegetic 2D HUD, deliberately not a
  cockpit/visor. Do not suggest first-person or cockpit framing.
- Authored art direction may legitimately differ from a reference. Some sectors are deliberately
  empty void. Judge whether the frame reads as INTENTIONAL and composed, or as UNFINISHED and
  cheap. Say which, and why, using what is visible.

SCORE THESE AXES, EACH 1-5
  lighting        Key/fill/rim separation, terminator quality, does form read? shadow presence.
  material        Do surfaces read as distinct materials (painted metal, glass, ceramic, rock) or
                  as one plastic/clay response? Roughness variation, specular breakup.
  geometry        Silhouette interest, panel/greeble density at the actual on-screen pixel size,
                  scale cues. Does it read as a manufactured object?
  grade_post      Colour grade, contrast curve, black level, bloom quality/restraint, any AA or
                  sharpening artefacts, banding.
  background      Depth and layering of the space backdrop: nebula/dust/parallax/distant bodies.
                  Does the scene have a BACK, a MIDDLE and a FRONT?
  vfx             Engine plume, weapons, impacts, debris, trails. Card/billboard tells, strobing,
                  generic circular flashes.
  ui_integration  Does the HUD sit in the same world as the render, or float on top like a webpage?
                  Legibility, density, alignment, tonal match.
  composition     Framing, negative space, focal hierarchy, how much of the frame is dead.

SCORING SCALE (be strict; 5 is reserved for genuine parity with the reference)
  1 = crude / obviously unfinished    2 = weak    3 = competent but clearly below the reference
  4 = close to the reference, minor gap    5 = matches or beats the reference

FOR EVERY AXIS give:
  - score
  - gap:      what the reference frame does that ours does not, stated visually and specifically.
  - evidence: where in OUR frame you can see the deficiency (name the region).
  - fix:      ONE concrete change, plus the technique name, plus your estimate of its frame cost
              as "free" | "cheap" | "moderate" | "expensive".

Then give topActions: the 3 changes with the largest visible improvement per unit of frame cost,
most valuable first.

Score each axis 1-5 on its own merits. Do not set the verdict field yourself; it is computed.
Do not praise. Do not hedge. Output only the JSON object described by the schema.`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    sceneType: { type: 'string' },
    verdict: { type: 'string', enum: ['PASS', 'FAIL'] },
    readsAsIntentional: { type: 'boolean' },
    overallSummary: { type: 'string' },
    axes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          axis: { type: 'string', enum: ['lighting', 'material', 'geometry', 'grade_post', 'background', 'vfx', 'ui_integration', 'composition'] },
          score: { type: 'integer', minimum: 1, maximum: 5 },
          gap: { type: 'string' },
          evidence: { type: 'string' },
          fix: { type: 'string' },
          technique: { type: 'string' },
          cost: { type: 'string', enum: ['free', 'cheap', 'moderate', 'expensive'] },
        },
        required: ['axis', 'score', 'gap', 'evidence', 'fix', 'technique', 'cost'],
      },
    },
    topActions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          action: { type: 'string' },
          axis: { type: 'string' },
          expectedVisibleResult: { type: 'string' },
          cost: { type: 'string', enum: ['free', 'cheap', 'moderate', 'expensive'] },
        },
        required: ['action', 'axis', 'expectedVisibleResult', 'cost'],
      },
    },
  },
  required: ['sceneType', 'verdict', 'readsAsIntentional', 'overallSummary', 'axes', 'topActions'],
};

// Write the hand-reviewable packet FIRST, so a browser-Codex review is possible even if the CLI
// review fails or is skipped.
mkdirSync(PACKET_DIR, { recursive: true });
writeFileSync(join(PACKET_DIR, 'RUBRIC.md'), `# Modern-parity review packet — ${SCENE}\n\nPaste the prompt below into browser Codex and attach every image in this folder.\nThe file named \`OURS_*\` is our frame; the rest are references.\n\n---\n\n${RUBRIC}\n`);
copyFileSync(SHOT, join(PACKET_DIR, `OURS_${basename(SHOT)}`));
for (const r of refs) copyFileSync(r, join(PACKET_DIR, `REF_${basename(r)}`));
console.log(`[review] packet for browser Codex: ${PACKET_DIR}`);

const schemaPath = join(PACKET_DIR, 'schema.json');
writeFileSync(schemaPath, JSON.stringify(SCHEMA, null, 2));
const lastMsg = join(PACKET_DIR, 'codex-last-message.json');

// --ignore-user-config: this machine's ~/.codex/config.toml carries keys the installed codex build
// rejects (model_reasoning_effort="max", service_tier="default"), which makes codex exit before
// producing anything. Auth still resolves from CODEX_HOME, so the reviewer stays signed in.
// The prompt goes on STDIN via the `-` positional because `-i/--image <FILE>...` is variadic — a
// trailing prompt argument gets swallowed as another image path and the review silently returns
// nothing.
function runOneReview(outPath) {
  const args = ['exec', '--skip-git-repo-check', '--ignore-user-config', '--sandbox', 'read-only',
    '--output-schema', schemaPath, '-o', outPath];
  if (MODEL) args.push('-m', MODEL);
  for (const r of refs) args.push('-i', r);
  args.push('-i', SHOT);
  args.push('-');
  try {
    execFileSync('codex', args, { input: RUBRIC, stdio: ['pipe', 'inherit', 'inherit'], timeout: Number(argv.timeoutMs || 900000) });
  } catch (e) {
    console.error(`[review] codex exec failed: ${e.message}`);
  }
  if (!existsSync(outPath)) return null;
  const raw = readFileSync(outPath, 'utf8');
  try { return JSON.parse(raw); }
  catch {
    const m = raw.match(/\{[\s\S]*\}/);
    return m ? JSON.parse(m[0]) : null;
  }
}

// Axis scores are a single LLM sample and carry real variance — the SAME frame has returned
// composition 1 and 2, background 1 and 2, and ui_integration 2 and 3 across runs. At the low end of
// the scale that noise is the same size as a genuine one-band improvement, so a single sample cannot
// tell a real gain from a re-roll. --samples N takes the per-axis MEDIAN of N independent reviews.
// Use it whenever a verdict is going to be acted on; 1 is fine for a quick look.
const SAMPLES = Math.max(1, Number(argv.samples || 1));
console.log(`[review] codex exec — ${refs.length} references + our frame (${SCENE})${SAMPLES > 1 ? `, ${SAMPLES} samples (median)` : ''}`);

const runs = [];
for (let i = 0; i < SAMPLES; i++) {
  const out = SAMPLES === 1 ? lastMsg : lastMsg.replace(/\.json$/, `-${i + 1}.json`);
  const got = runOneReview(out);
  if (got) runs.push(got);
  else console.warn(`[review] sample ${i + 1} produced nothing`);
}
if (!runs.length) { console.error('[review] no usable review samples'); process.exit(1); }

let verdict = runs[0];
if (runs.length > 1) {
  const median = (nums) => {
    const s = [...nums].sort((a, b) => a - b);
    const mid = s.length >> 1;
    return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
  };
  const axisNames = [...new Set(runs.flatMap((r) => (r.axes || []).map((a) => a.axis)))];
  const axes = axisNames.map((axis) => {
    const picks = runs.map((r) => (r.axes || []).find((a) => a.axis === axis)).filter(Boolean);
    const score = median(picks.map((p) => p.score));
    // Keep the prose from whichever sample actually landed on the median score, so the gap/fix text
    // still describes the score being reported rather than an averaged fiction.
    const representative = picks.find((p) => p.score === score) || picks[0];
    return { ...representative, score, sampleScores: picks.map((p) => p.score) };
  });
  verdict = {
    ...runs[0],
    axes,
    // CALIBRATED VERDICT.
    //
    // The original rule was `every axis >= PASS_SCORE`, which turned out to be unreachable: feeding a
    // real 2020s AAA reference frame (EVE Online, refs/deep-flight/df-04) through this exact harness
    // as if it were our game returned lighting/material/geometry/grade_post/background/vfx/composition
    // all at 4 — and verdict FAIL, because a cinematic screenshot has no HUD, so `ui_integration`
    // scored 1. Overall 3.63/5. A gate a genuine reference cannot pass is measuring the rubric, not
    // the game.
    //
    // So parity is defined against what the references actually score on this instrument:
    //   * ui_integration is EXCLUDED — references are cinematic frames with no HUD, so the axis
    //     punishes them and flatters us (we scored 3 there against the reference's 1). It is not a
    //     comparable measurement and must not gate either direction.
    //   * every remaining axis must reach REFERENCE_AXIS_TARGET, which is the level the reference
    //     frame actually achieved rather than a theoretical maximum.
    verdict: axes.filter((a) => a.axis !== 'ui_integration')
      .every((a) => a.score >= REFERENCE_AXIS_TARGET) ? 'PASS' : 'FAIL',
    referenceCalibration: {
      target: REFERENCE_AXIS_TARGET,
      excludedAxes: ['ui_integration'],
      measuredReferenceOverall: 3.63,
      note: 'Target is what a real AAA reference scores on this same harness, not 5/5.',
    },
    readsAsIntentional: runs.filter((r) => r.readsAsIntentional).length > runs.length / 2,
    sampleCount: runs.length,
  };
}

verdict.reviewedAt = new Date().toISOString();
verdict.ourFrame = SHOT;
verdict.references = refs;
verdict.perf = perf ? { p95: perf.frameMs && perf.frameMs.p95, avg: perf.frameMs && perf.frameMs.avg, calls: perf.render && perf.render.calls, triangles: perf.render && perf.render.triangles, gpu: perf.capture && perf.capture.gpu } : null;

mkdirSync('.devshots/gfx/reviews', { recursive: true });
writeFileSync(OUT, JSON.stringify(verdict, null, 2));

const axes = verdict.axes || [];
const sorted = [...axes].sort((a, b) => a.score - b.score);
console.log(`\n[review] ${SCENE} — verdict ${verdict.verdict} (intentional-read: ${verdict.readsAsIntentional})`);
for (const a of sorted) console.log(`  ${String(a.score)}/5  ${a.axis.padEnd(15)} ${a.gap}`);
console.log(`[review] worst axis: ${sorted[0] && sorted[0].axis}`);
console.log(`[review] scorecard: ${OUT}`);
process.exit(verdict.verdict === 'PASS' ? 0 : 1);

function num(v) { return Number.isFinite(v) ? v.toFixed(2) : '?'; }

function parseArgs(args) {
  const out = { _: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith('--')) { out._.push(a); continue; }
    const key = a.slice(2);
    const next = args[i + 1];
    if (next && !next.startsWith('--')) { out[key] = next; i++; } else out[key] = true;
  }
  return out;
}
