// UIUX-B0-ONE-VERB-STATIC-TEST-GROK-001
// Independent static contract for golden-route B0 one-verb hierarchy.
//
// Evidence (UIUX-NEXT-P1-EVIDENCE-GROK-001) + spec2/03 FIRST_HOUR:
//   1. Exactly one concise actionable verb on one persistent surface.
//   2. Onboarding panel must not duplicate the HUD objective command.
//   3. firstFlight control-hint wall cannot fire while B0 is active.
//   4. Transient voice stays one concise tutorial beat.
//   5. Mission Log / story narrative stay non-primary, on-demand context.
//
// Production exports are preferred; source anchors supplement non-exported seams.
// Does not edit production. Run:
//   node test/b0-one-verb.test.mjs
// Adjacent checks (not modified by this lane):
//   npm run check:onboarding
//   npm run check:first-hour
//   npm run check:one-voice

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { STORY_BEATS } from '../src/data/missions.js';
import { BEAT_CONTENT } from '../src/data/narrative.js';
import { BINDINGS } from '../src/ui/bindings.js';
import { CONTROL_PROMPTS, controlPrompt } from '../src/ui/controlPrompts.js';
import { onboarding } from '../src/systems/onboarding.js';
import { FLIGHT_DRILL_BEATS } from '../src/onboarding/flightDrill.js';
import { missionLogScreen } from '../src/ui/screens/missionLog.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

const ONBOARDING_SRC = read('../src/systems/onboarding.js');
const HUD_SRC = read('../src/ui/hud.js');
const CORE_COPY_SRC = read('../src/ui/localizedCoreCopy.js');
const MISSION_LOG_SRC = read('../src/ui/screens/missionLog.js');
const STORY_SRC = read('../src/systems/story.js');
const MISSIONS_SYS_SRC = read('../src/systems/missions.js');

const B0_VERB_CLASS = /thrust|speed/i;

const failures = [];
const passes = [];

function check(name, fn) {
  try {
    fn();
    passes.push(name);
  } catch (err) {
    failures.push({
      name,
      message: err && err.message ? err.message : String(err),
    });
  }
}

// ── Source helpers ────────────────────────────────────────────────────────────

/** Extract the authored BEATS table (same approach as check-first-hour). */
function extractBeats(src) {
  const beatsBlock = src.match(/const BEATS = \[([\s\S]*?)\n\];/);
  assert.ok(beatsBlock, 'BEATS table must exist in onboarding.js (spec2/03 §2)');
  const body = beatsBlock[1];
  const beats = [];
  const beatRegex = /key:\s*'([a-z_]+)'[\s\S]*?line:\s*'((?:[^'\\]|\\.)*)'/g;
  let m;
  while ((m = beatRegex.exec(body)) !== null) {
    const key = m[1];
    const line = m[2].replace(/\\'/g, "'");
    const followups = [];
    const fuRegex = /\{\s*on:\s*'([^']+)',\s*line:\s*'((?:[^'\\]|\\.)*)'\s*\}/g;
    const segStart = m.index;
    const nextKey = body.indexOf('key:', segStart + 1);
    const seg = body.slice(segStart, nextKey === -1 ? body.length : nextKey);
    let f;
    while ((f = fuRegex.exec(seg)) !== null) {
      followups.push({ on: f[1], line: f[2].replace(/\\'/g, "'") });
    }
    beats.push({ key, line, followups });
  }
  return beats;
}

/** Best-effort method body extractor for contract scans. */
function extractMethodBody(src, methodName) {
  const re = new RegExp(
    `${methodName}\\s*\\([^)]*\\)\\s*\\{`,
  );
  const m = re.exec(src);
  if (!m) return '';
  let i = m.index + m[0].length;
  let depth = 1;
  while (i < src.length && depth > 0) {
    const ch = src[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;
    i += 1;
  }
  return src.slice(m.index + m[0].length, i - 1);
}

function panelDemotesWakeTitle(refreshBody) {
  if (!refreshBody) return false;
  if (/demoteObjectiveCopy\s*=\s*true/.test(refreshBody)
    && /style\.display\s*!==\s*'none'/.test(refreshBody)
    && /aria-hidden/.test(refreshBody)) return true;
  if (/demoteObjectiveCopy\s*=\s*!![\s\S]{0,180}waypoint\.onboarding/.test(refreshBody)
    && /style\.display\s*!==\s*'none'/.test(refreshBody)
    && /aria-hidden/.test(refreshBody)) return true;
  // Preferred: explicit wake demotion around title / line assignment.
  if (
    /key\s*===\s*'wake'[\s\S]{0,240}(line\s*=\s*['"]{2}|textContent\s*=\s*['"]{2}|continue|return|suppress|demote|status)/i
      .test(refreshBody)
  ) {
    return true;
  }
  if (
    /\(beat\.key\s*===\s*'wake'\)\s*\?\s*['"]{2}/.test(refreshBody)
    || /wake[\s\S]{0,120}(hudOwns|panelOwns|statusOnly|demoteB0|primarySurface)/i.test(refreshBody)
  ) {
    return true;
  }
  // Title only assigned when not wake / when panel owns the objective.
  if (
    /key\s*!==\s*'wake'[\s\S]{0,120}beat\.line/.test(refreshBody)
    || /panelOwns|ownsObjective|hudOwnsObjective/.test(refreshBody)
  ) {
    return true;
  }
  // Panel never mirrors beat.line into the title at all (status/progress only).
  const assignsBeatLineToTitle =
    (/beat\.line/.test(refreshBody) || /line\s*=\s*beat\s*\?/.test(refreshBody))
    && /_titleEl\.textContent/.test(refreshBody);
  if (!assignsBeatLineToTitle) return true;
  return false;
}

function firstFlightGatedAgainstB0(block) {
  if (!block) return false;
  // Bare timer-after-flight is the defect: multi-verb wall during B0 teaching.
  const bareTimerOnly =
    /_firstFlightPending\s*&&\s*state\.mode\s*===\s*'flight'[\s\S]{0,220}_firstFlightTimer\s*>\s*3\.0[\s\S]{0,120}_showHint\(\s*'firstFlight'/.test(block)
    && !/wake|beatDoneAt|currentBeat|SILENCE|finished|b0|B0|onboarding/i.test(
      block.replace(/_firstFlightPending|_firstFlightTimer|_showHint\(\s*'firstFlight'[\s\S]*$/, ''),
    );

  if (bareTimerOnly) return false;

  // Accept any explicit deferral seam that references B0/wake completion or silence.
  return /wake|beatDoneAt|currentBeat|SILENCE|_b0|b0Done|b0Complete|afterB0|untilB0|defer.*[Bb]0|[Bb]0.*defer|finished|onboarding/i
    .test(block);
}

// ── Production exports smoke ──────────────────────────────────────────────────

check('production onboarding system export is present', () => {
  assert.equal(onboarding.name, 'onboarding');
  assert.equal(typeof onboarding.init, 'function');
  assert.equal(typeof onboarding.update, 'function');
});

check('production controlPrompt / CONTROL_PROMPTS export firstFlight wall copy', () => {
  assert.equal(typeof controlPrompt, 'function');
  assert.ok(CONTROL_PROMPTS.kbm && CONTROL_PROMPTS.kbm.firstFlight, 'kbm firstFlight catalog entry');
  const wall = controlPrompt('firstFlight', 'kbm');
  assert.ok(wall && wall.length > 20, 'firstFlight resolves to a post-training control reminder');
});

check('production STORY_BEATS[0] provides authored story context', () => {
  assert.ok(Array.isArray(STORY_BEATS) && STORY_BEATS.length > 0);
  const cold = STORY_BEATS[0];
  assert.equal(cold.id, 'cold_start');
  assert.ok(cold.objective && cold.objective.trim(), 'story objective contains authored context');
  assert.doesNotMatch(cold.objective, /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\ufffd]/u,
    'story objective contains no unsafe control/replacement characters');
});

check('production BEAT_CONTENT[0] provides on-demand narrative flavor', () => {
  assert.ok(Array.isArray(BEAT_CONTENT) && BEAT_CONTENT.length > 0);
  const content = BEAT_CONTENT[0];
  assert.equal(content.beat, 0);
  assert.ok(content.hint, 'Captain\'s Log hint exists as on-demand/story flavor');
  assert.doesNotMatch(content.hint, /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\ufffd]/u,
    'narrative hint contains no unsafe control/replacement characters');
});

check('production missionLogScreen is an on-demand screen export', () => {
  assert.ok(missionLogScreen && typeof missionLogScreen === 'object');
  assert.ok(
    typeof missionLogScreen.mount === 'function'
      || typeof missionLogScreen.open === 'function'
      || typeof missionLogScreen.show === 'function'
      || typeof missionLogScreen.render === 'function'
      || missionLogScreen.id === 'missionLog'
      || /missionLog/.test(String(missionLogScreen.name || missionLogScreen.id || '')),
    'mission log must be a screen module (on-demand), not a flight HUD chip',
  );
});

check('Mission Log binding is a discrete on-demand control', () => {
  assert.ok(BINDINGS.missionLog, 'BINDINGS.missionLog exists');
  assert.ok(BINDINGS.missionLog.key || BINDINGS.missionLog.label, 'mission log has a key/label');
});

// ── 1. One concise actionable B0 verb ─────────────────────────────────────────

const BEATS = [...FLIGHT_DRILL_BEATS, ...extractBeats(ONBOARDING_SRC)];
const b0 = BEATS[0];

check('B0 is the thrust beat with one authored entry line', () => {
  assert.ok(b0, 'thrust beat must exist');
  assert.equal(b0.key, 'thrust');
  assert.ok(b0.line && b0.line.trim().length > 0, 'B0 entry line must be authored');
  assert.equal((b0.followups || []).length, 0, 'B0 has no followup wall — one concise tutorial beat only');
});

check('B0 line is an authored actionable thrust-class instruction', () => {
  assert.match(b0.line, B0_VERB_CLASS, `B0 line must teach thrust/beacon class: "${b0.line}"`);
  assert.doesNotMatch(b0.line, /[\r\n\u2028\u2029]/u, 'B0 line must fit the inline tutorial surface');
  assert.doesNotMatch(b0.line, /[\u0000-\u001f\u007f\ufffd]/u,
    'B0 line contains no unsafe control/replacement characters');
});

// ── 2. One persistent surface — HUD owns command; panel does not duplicate ────

check('HUD mission tracker is the persistent Tutorial Objective surface for onboarding waypoints', () => {
  assert.match(HUD_SRC, /sf-mission-tracker/, 'HUD mounts .sf-mission-tracker');
  assert.match(HUD_SRC, /sf-mt-obj/, 'HUD mounts .sf-mt-obj objective line');
  assert.match(
    HUD_SRC,
    /flightDestinationSurface\(state, command\)/,
    'onboarding waypoint path paints one destination line',
  );
  assert.match(CORE_COPY_SRC, /tutorialObjective:\s*\{\s*label:\s*'TUTORIAL OBJECTIVE'\s*\}/,
    'localized core copy keeps the player-facing Tutorial Objective label');
  assert.match(
    HUD_SRC,
    /wp\.reason\s*\|\|\s*wp\.label/,
    'HUD tracker shows the onboarding waypoint reason/label as the actionable line',
  );
});

check('marker lesson forces an onboarding waypoint that feeds the HUD tracker', () => {
  assert.match(
    ONBOARDING_SRC,
    /beat\.key\s*===\s*'marker'[\s\S]{0,160}_setObjectiveWaypoint\(true\)/,
    'marker lesson must stamp the onboarding waypoint',
  );
  assert.match(ONBOARDING_SRC, /onboarding:\s*true/, 'waypoint is marked onboarding for the HUD branch');
});

check('onboarding panel does not duplicate the HUD B0 objective command', () => {
  const refresh = extractMethodBody(ONBOARDING_SRC, '_refreshBeatPanel');
  assert.ok(refresh.length > 40, '_refreshBeatPanel body must be extractable');

  // Forbidden: unconditional beat.line → title for every beat including wake (dual command surfaces).
  const unconditionalMirror =
    /const line = beat \? \(beat\.line \|\| ''\) : '';\s*\n\s*if \(this\._titleEl\.textContent !== line\) this\._titleEl\.textContent = line;/.test(refresh)
    || (
      /line\s*=\s*beat\s*\?\s*\(beat\.line\s*\|\|\s*''\)\s*:\s*''/.test(refresh)
      && /_titleEl\.textContent\s*=\s*line/.test(refresh)
      && !panelDemotesWakeTitle(refresh)
    );

  assert.ok(
    !unconditionalMirror,
    'B0 panel must not unconditionally mirror beat.line into .sf-ob-title while HUD owns the verb',
  );
  assert.match(refresh, /demoteObjectiveCopy\s*=\s*!![\s\S]{0,180}waypoint\.onboarding/,
    'panel must yield exactly when the HUD owns an onboarding waypoint');

  // Progress/status may remain (step dots, kicker, B2 sample bar) — not re-asserted as forbidden.
  assert.match(ONBOARDING_SRC, /sf-ob-steps|sf-ob-progress|sf-ob-count/, 'panel may keep progress/status chrome');
});

// ── 3. firstFlight cannot fire while B0 is active ─────────────────────────────

check('firstFlight control-hint wall is deferred until B0 is complete/silent', () => {
  assert.doesNotMatch(ONBOARDING_SRC, /_showHint\(\s*'firstFlight'/,
    'firstFlight windshield laundry is gone; B0 cannot flash a bind wall');
});

// ── 4. Voice: one concise tutorial beat ───────────────────────────────────────

check('tutorial voice is a single chokepoint with one B0 beat line', () => {
  assert.match(ONBOARDING_SRC, /_sayTutorial\(text,\s*\{\s*visual\s*=\s*true\s*\}\s*=\s*\{\}\)/,
    'single tutorial-voice chokepoint');
  assert.match(
    ONBOARDING_SRC,
    /channel:\s*'tutorial'[\s\S]{0,80}id:\s*'tutorial:beat'/,
    'B0 entry voice uses the tutorial channel with stable beat id (one voice at a time)',
  );
  assert.match(
    ONBOARDING_SRC,
    /_sayTutorial\(beat\.line,\s*\{\s*visual:\s*!persistentObjectiveOwnsLine\s*\}\)/,
    'beat entry emits only the authored line through _sayTutorial and conditionally yields its visual',
  );
  // No parallel B0 splash/modal voice stack.
  assert.doesNotMatch(ONBOARDING_SRC, /sf-ob-intro|_showIntro/, 'no intro modal competing with B0 voice');
});

check('matching persistent objective suppresses only the duplicate visual tutorial line', () => {
  const advance = extractMethodBody(ONBOARDING_SRC, '_tryAdvanceBeat');
  assert.match(
    advance,
    /persistentObjectiveOwnsLine\s*=\s*!!\(waypoint\s*&&\s*waypoint\.onboarding/,
    'beat entry must detect an onboarding waypoint that owns the exact command',
  );
  assert.match(
    advance,
    /_sayTutorial\(beat\.line,\s*\{\s*visual:\s*!persistentObjectiveOwnsLine\s*\}\)/,
    'only the transient visual is suppressed when the persistent objective owns the line',
  );

  const emitted = [];
  const surfaced = [];
  onboarding.state = { simTime: 3, onboarding: {} };
  onboarding.bus = { emit: (type, payload) => emitted.push({ type, payload }) };
  onboarding.helpers = { voice: { say: (payload) => { surfaced.push(payload); return true; } } };
  onboarding._sayTutorial('Thrust until speed passes forty.', { visual: false });

  assert.equal(emitted.filter((event) => event.type === 'tutorial:say').length, 1,
    'tutorial event remains available to audio, audit, and cadence consumers');
  assert.equal(surfaced.length, 0, 'duplicate command does not enter the transient visual floor');
  assert.equal(onboarding.state.onboarding.tutorialLog.length, 1, 'tutorial audit log remains intact');
  assert.match(HUD_SRC, /missionTracker\.setAttribute\('aria-label',\s*'Active objective'\)/,
    'the persistent owner remains named for assistive technology');
});

// ── 5. Mission Log / story context non-primary / on-demand ────────────────────

check('Mission Log RECOMMENDED NEXT is screen-local (on-demand), not a flight HUD surface', () => {
  assert.match(MISSION_LOG_SRC, /RECOMMENDED NEXT/, 'mission log can show recommended rail when open');
  assert.doesNotMatch(
    HUD_SRC,
    /RECOMMENDED NEXT/,
    'HUD must not paint Mission Log RECOMMENDED NEXT as a second always-on teacher',
  );
  // Binding opens the log — it is not auto-flight UI.
  assert.ok(BINDINGS.missionLog, 'player opens Mission Log via binding / pause route');
});

check('story cold-start / longform yield the channel while tutorial B0 owns the opening', () => {
  assert.match(STORY_SRC, /_onboardingActive\(\)/, 'story checks onboarding-active');
  assert.match(STORY_SRC, /_tutorialOwnsOpening\(\)/, 'story defers while tutorial owns opening');
  assert.match(STORY_SRC, /_coldStartDeferred/, 'cold-start is deferred, not a second t=0 command');
  assert.match(STORY_SRC, /tutorial:finished/, 'story releases after tutorial finishes');
  assert.match(
    MISSIONS_SYS_SRC,
    /_tutorialOwnsOpening\(\)/,
    'missions must not force story waypoint/toast over the tutorial opening',
  );
});

check('story objective longform is distinct from the B0 flight verb', () => {
  const storyObj = STORY_BEATS[0].objective;
  assert.notEqual(
    storyObj.trim().toLowerCase(),
    b0.line.trim().toLowerCase(),
    'story objective must not be a second copy of the B0 verb line',
  );
  assert.ok(storyObj.trim(), 'story context remains authored');
});

// ── Report ────────────────────────────────────────────────────────────────────

const total = passes.length + failures.length;
console.log(`B0 one-verb static: ${passes.length}/${total} passed`);
for (const name of passes) console.log(`  PASS  ${name}`);
for (const f of failures) {
  console.log(`  FAIL  ${f.name}`);
  console.log(`        ${f.message}`);
}

if (failures.length) {
  process.exitCode = 1;
  console.error(`\nB0 one-verb static FAILED — ${failures.length} assertion(s).`);
} else {
  console.log('\nB0 one-verb static OK — one verb, one surface, deferred firstFlight, on-demand log/story.');
}
