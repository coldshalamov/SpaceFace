#!/usr/bin/env node
// ONEVOICE-CHECK-IMPL — Professional first-hour one-voice contract (fail-closed).
//
// Spec authority: design/spec2/00_MASTER_TASTE.md (pillar 3 + §5 voice) + design/spec2/03_FIRST_HOUR.md.
// Related gates (not re-owned): check-one-voice, check-first-hour, check-first-dock-handoff,
// check-encounter-one-voice.
//
// This check FAILS CLOSED: every named contract below must hold in the live working tree.
// Proof classes are explicit:
//   • SOURCE  — static scan of production files (integration contract)
//   • SYNTH   — headless VoiceQueue / bus fixtures (arbiter math; NOT live play)
//   • ROUTE   — Browser/Electron same-game launch hooks (NOT headed first-hour proof)
//
// Synthetic sections must never be reported as live Browser/Electron first-hour proof.
// Headed live play remains a separate integration ritual outside this script.
//
// Run: npm run check:professional-first-hour-one-voice
//      node scripts/check-professional-first-hour-one-voice.mjs

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createBus } from '../src/core/eventBus.js';
import {
  CHANNEL_PRIORITY,
  VoiceQueue,
  voiceArbiter,
} from '../src/ui/voiceArbiter.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (rel) => {
  const abs = join(ROOT, rel);
  assert.ok(existsSync(abs), `required source missing: ${rel}`);
  return readFileSync(abs, 'utf8');
};

const FAILURES = [];
const PASSES = [];
const PROOF = { SOURCE: 0, SYNTH: 0, ROUTE: 0 };

function check(surface, proofClass, fn) {
  try {
    fn();
    PASSES.push({ surface, proofClass });
    PROOF[proofClass] = (PROOF[proofClass] || 0) + 1;
    console.log(`  ok   [${proofClass}] ${surface}`);
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    FAILURES.push({ surface, proofClass, message });
    console.error(`  FAIL [${proofClass}] ${surface}: ${message}`);
  }
}

// ── Sources under contract ────────────────────────────────────────────────────
const alertsSrc = read('src/ui/alerts.js');
const voiceSrc = read('src/ui/voiceArbiter.js');
const toastsSrc = read('src/ui/toasts.js');
const onboardingSrc = read('src/systems/onboarding.js');
const newGameSrc = read('src/ui/screens/newGame.js');
const stationHubSrc = read('src/ui/screens/stationHub.js');
const controlPromptsSrc = read('src/ui/controlPrompts.js');
const storySrc = read('src/systems/story.js');
const missionsSrc = read('src/systems/missions.js');
const hudSrc = read('src/ui/hud.js');
const radarSrc = read('src/ui/radar.js');
const commsSrc = read('src/ui/comms.js');
const uiRootSrc = read('src/ui/uiRoot.js');
const registrySrc = read('src/core/registry.js');
const mainSrc = read('src/main.js');
const electronMainSrc = read('electron/main.cjs');
const serverSrc = read('server.js');
const gameServerSrc = read('scripts/lib/gameServer.cjs');
const indexHtmlSrc = read('index.html');
const pkg = JSON.parse(read('package.json'));
const attachmentsSrc = read('src/combat/attachments.js');

// ═══════════════════════════════════════════════════════════════════════════════
// 1. SINGLE ATTENTION LINE — top-center floor is the only transient voice surface
// ═══════════════════════════════════════════════════════════════════════════════
check('alerts presents exactly one voice floor via voice:surface / voice:clear', 'SOURCE', () => {
  assert.match(alertsSrc, /THE ONE-VOICE FLOOR|one-voice floor/i,
    'alerts.js must document the single attention-line floor');
  assert.match(alertsSrc, /bus\.on\('voice:surface'/, 'alerts must subscribe voice:surface');
  assert.match(alertsSrc, /bus\.on\('voice:clear'/, 'alerts must subscribe voice:clear');
  assert.match(alertsSrc, /sf-alert--floor/, 'floor presentation class must exist');
  assert.match(alertsSrc, /let floorEl = null/, 'exactly one floor element holder');
  assert.match(alertsSrc, /let floorId = null/, 'exactly one floor id holder');
  // Presenter must not allocate a new floorEl on every surface when one exists.
  assert.match(alertsSrc, /if \(!floorEl\) \{[\s\S]*floorEl = document\.createElement/,
    'floor presenter reuses a single element rather than stacking floors');
});

check('arbiter emits one attention line (voice:surface) and clears the prior floor first', 'SOURCE', () => {
  assert.match(voiceSrc, /emit\('voice:surface'/, 'arbiter presents via voice:surface');
  assert.match(voiceSrc, /emit\('voice:clear'/, 'arbiter retracts via voice:clear');
  assert.match(voiceSrc, /prevKey && prevKey !== activeKey[\s\S]*voice:clear/,
    'arbiter must clear the previous floor before surfacing a replacement');
  assert.match(voiceSrc, /attention line|one-voice/i,
    'arbiter comments must name the single attention line contract');
});

check('toasts suppress arbiter _fromVoice mirror (no double-surface)', 'SOURCE', () => {
  assert.match(toastsSrc, /if \(_fromVoice\) return/,
    'toasts must drop arbiter _fromVoice re-emits so top-center stays sole attention line');
});

check('registry installs voice before callers and updates after story/onboarding', 'SOURCE', () => {
  assert.match(registrySrc, /core, voiceArbiter, input/,
    'voiceArbiter must init early so helpers.voice exists for first-hour speakers');
  assert.match(registrySrc, /onboarding, voiceArbiter/,
    'voiceArbiter update must run after onboarding so tutorial lines surface same tick');
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. PRIORITY / INTERRUPT / COALESCE
// ═══════════════════════════════════════════════════════════════════════════════
check('channel priority ladder matches taste law (danger/alert > tutorial > objective > chatter)', 'SOURCE', () => {
  assert.equal(CHANNEL_PRIORITY.story, 100);
  assert.equal(CHANNEL_PRIORITY.alert, 80);
  assert.equal(CHANNEL_PRIORITY.tutorial, 70);
  assert.equal(CHANNEL_PRIORITY.objective, 60);
  assert.equal(CHANNEL_PRIORITY.bark, 50);
  assert.equal(CHANNEL_PRIORITY.news, 30);
  assert.equal(CHANNEL_PRIORITY.info, 10);
  assert.ok(CHANNEL_PRIORITY.alert > CHANNEL_PRIORITY.tutorial);
  assert.ok(CHANNEL_PRIORITY.tutorial > CHANNEL_PRIORITY.objective);
  assert.ok(CHANNEL_PRIORITY.objective > CHANNEL_PRIORITY.bark);
});

check('alerts.announce sets danger priority 110 and stable coalesce ids', 'SOURCE', () => {
  assert.match(alertsSrc, /function announce\(/, 'announce chokepoint must exist');
  assert.match(alertsSrc, /priority = sev === 'danger' \? 110/,
    'life-critical danger must outrank story (priority 110)');
  assert.match(alertsSrc, /id:\s*key \? 'alert:' \+ key/,
    'announce must coalesce repeats via stable alert:<key> id');
});

check('SYNTH: interrupt only by strict higher priority; same-id coalesces; equal priority waits', 'SYNTH', () => {
  const q = new VoiceQueue();
  q.enqueue({ channel: 'info', text: 'low floor', ttl: 10, id: 'a' }, 0);
  assert.equal(q.step(0).text, 'low floor');

  q.enqueue({ channel: 'news', text: 'news waits equal-or-lower?', ttl: 5, id: 'b' }, 100);
  // news (30) > info (10) → preempt
  assert.equal(q.step(100).text, 'news waits equal-or-lower?');

  q.enqueue({ channel: 'news', text: 'equal news', ttl: 5, id: 'c' }, 200);
  assert.equal(q.step(200), null, 'equal priority must not interrupt the held floor');

  q.enqueue({ channel: 'tutorial', text: 'teach cuts in', ttl: 5, id: 'd' }, 300);
  assert.equal(q.step(300).text, 'teach cuts in', 'tutorial must interrupt news');

  // Coalesce: same id replaces the active floor in place (no second 'd' entry).
  const sizeBefore = q.size;
  q.enqueue({ channel: 'tutorial', text: 'teach update', ttl: 5, id: 'd' }, 350);
  assert.equal(q.active.text, 'teach update');
  assert.equal(q.size, sizeBefore, 'same-id coalesce must not grow the queue');
  assert.equal(q.pending.filter((e) => e.id === 'd').length, 0,
    'same-id active replace must not leave a duplicate pending id');

  q.enqueue({ channel: 'alert', text: 'SHIELDS DOWN', ttl: 5, priority: 110, id: 'danger' }, 400);
  assert.equal(q.step(400).text, 'SHIELDS DOWN', 'danger priority 110 must interrupt tutorial');
});

check('SYNTH: system wrapper surfaces at most one floor via voice:surface', 'SYNTH', () => {
  const bus = createBus();
  const state = { simTime: 0 };
  const helpers = {};
  const activeIds = new Set();
  let maxActive = 0;
  bus.on('voice:surface', (p) => {
    activeIds.add(p.id);
    maxActive = Math.max(maxActive, activeIds.size);
  });
  bus.on('voice:clear', (p) => { activeIds.delete(p.id); });

  voiceArbiter.init({ bus, state, helpers });
  voiceArbiter.newGame();
  assert.equal(typeof helpers.voice.say, 'function');

  helpers.voice.say({ channel: 'objective', text: 'o', ttl: 1, id: 'o' });
  helpers.voice.say({ channel: 'tutorial', text: 't', ttl: 1, id: 't' });
  voiceArbiter.update(0, state);
  assert.ok(activeIds.size <= 1, `presenter must show ≤1 floor (got ${activeIds.size})`);

  state.simTime = 0.2;
  helpers.voice.say({ channel: 'alert', text: 'DANGER', ttl: 1, priority: 110, id: 'd' });
  voiceArbiter.update(0.2, state);
  assert.equal(activeIds.size, 1, 'danger interrupt still leaves exactly one floor');
  assert.ok(maxActive <= 1, `max concurrent floors must be 1 (got ${maxActive})`);
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. SPLASH / B0 GATE
// ═══════════════════════════════════════════════════════════════════════════════
check('first-run splash is a single full-screen line then B0 (spec2/03 §3)', 'SOURCE', () => {
  assert.match(newGameSrc, /showFirstRunSplash/, 'NEW GAME must call first-run splash');
  assert.match(newGameSrc,
    /Helios System\. Third shift\. The manifest is wrong\./,
    'first-run splash line must be verbatim');
  assert.match(newGameSrc, /sf-firstrun-splash/, 'splash DOM class must exist');
  assert.match(newGameSrc, /2500/, 'splash hold must be ~2.5s');
  assert.match(newGameSrc, /FIRST_RUN_FLAG|sf\.firstRunIntroSeen/,
    'splash must be first-run only (flagged, not every launch)');
});

check('B0 waits for first-run splash; generic firstFlight waits for the staged rail', 'SOURCE', () => {
  assert.doesNotMatch(onboardingSrc, /_showIntro/, 'intro modal must be gone (B0: no modal)');
  assert.doesNotMatch(onboardingSrc, /sf-ob-intro/, 'intro modal CSS/DOM must be gone');
  assert.match(onboardingSrc, /_firstFlightB0Released/,
    'firstFlight control wall must use the rail release helper');
  assert.match(onboardingSrc, /return !ob \|\| !ob\.active \|\| !!ob\.finished/,
    'firstFlight must wait until B0-B5 onboarding is inactive/finished');
  assert.match(newGameSrc, /ui:firstRunSplash:active/,
    'first-run splash must announce active ownership before New Game boots');
  assert.match(newGameSrc, /ui:firstRunSplash:done/,
    'first-run splash must release ownership after physical removal');
  assert.match(onboardingSrc, /nextIndex === 0 && this\._firstRunSplashPending/,
    'B0 entry must wait while the splash owns the opening line');
  // Timer path must consult the gate before _showHint('firstFlight'
  const ffTimerIdx = onboardingSrc.search(/_firstFlightPending\s*&&\s*state\.mode\s*===\s*['"]flight['"]/);
  assert.ok(ffTimerIdx >= 0, 'firstFlight pending timer must exist in flight mode');
  const ffShowIdx = onboardingSrc.indexOf("_showHint('firstFlight'", ffTimerIdx);
  assert.ok(ffShowIdx > ffTimerIdx, 'firstFlight timer must still call _showHint');
  const gateSpan = onboardingSrc.slice(ffTimerIdx, ffShowIdx);
  assert.match(gateSpan, /_firstFlightB0Released/,
    'firstFlight must not fire on a bare timer while the tutorial rail owns the floor');
});

check('B0 one-verb: single tutorial chokepoint + HUD tracker owns persistent command', 'SOURCE', () => {
  assert.match(onboardingSrc, /_sayTutorial\(text\)/,
    'single tutorial-voice chokepoint required');
  assert.match(onboardingSrc, /channel:\s*'tutorial'/,
    'tutorial lines must route on tutorial channel');
  assert.match(onboardingSrc, /id:\s*'tutorial:beat'/,
    'beat lines must share a stable id so followups coalesce (one attention line)');
  assert.match(hudSrc, /sf-mission-tracker/, 'HUD mission tracker is the B0 command surface');
  assert.match(hudSrc, /const navWaypoint = state\.nav && state\.nav\.waypoint/,
    'HUD must consume the active onboarding navigation waypoint during B0');
  assert.match(hudSrc, /navWaypoint && navWaypoint\.reason/,
    'HUD must surface the onboarding waypoint verb during B0');
});

check('active route has one dominant verb + destination + distance + matching radar glyph', 'SOURCE', () => {
  assert.match(hudSrc, /ACTIVE OBJECTIVE/, 'tracked route must present one dominant objective title');
  assert.match(hudSrc, /mtObjectiveAction\(/, 'objective copy must be normalized to an actionable verb');
  assert.match(hudSrc, /mtWaypointDistance\(/, 'objective surface must show live waypoint distance');
  assert.match(hudSrc, /◆ AMBER DIAMOND/, 'HUD must name the exact radar glyph and color');
  assert.match(missionsSrc, /const destination = station && station\.name \|\| sector && sector\.name \|\| title/,
    'mission waypoint label must resolve to destination, not the mission title');
  assert.match(missionsSrc, /label: destination/, 'radar waypoint must carry the named destination');
  assert.match(radarSrc, /`◆ AMBER DIAMOND · \$\{wpLabel\}`/,
    'radar key must repeat the same unique glyph/color and current destination');
  assert.doesNotMatch(radarSrc, /sf-radar-legend/, 'generic multi-color radar legend must stay removed');
});

check('active objective owns attention without suppressing combat/mining targeting', 'SOURCE', () => {
  assert.match(hudSrc, /routeOwnsAttention/, 'HUD must explicitly arbitrate route vs target attention');
  assert.match(hudSrc, /!combatRelevant && !miningRelevant/,
    'only neutral target cards yield; combat and mining targeting remain available');
  assert.match(hudSrc, /__active-objective-owns-attention__[\s\S]*setDisplay\(objWrap, false\)/,
    'active objective must hide the competing multi-mission list');
  assert.match(hudSrc, /setDisplay\(elNavReadout, !objectiveOwnsAttention\)/,
    'active objective must hide the duplicate nav readout');
  assert.match(hudSrc, /setClass\(elNavReadout, 'sf-nav--lock', false\)/,
    'mission/navigation fixes must not be framed as combat TARGET LOCK cards');
  assert.match(commsSrc, /attentionGateActive\(\)/, 'comms must have an actionable-attention gate');
  assert.match(commsSrc, /state && state\.nav && state\.nav\.waypoint/,
    'active navigation route must hold noncritical chatter');
  assert.match(commsSrc, /!GATE_BYPASS\.test/, 'danger/critical comms must bypass the quiet gate');
  assert.match(onboardingSrc, /_retireTutorialPanel\(\)/,
    'story transition must retire the tutorial/lore panel');
  assert.match(onboardingSrc, /const demoteObjectiveCopy = true/,
    'all B0-B5 tutorial verbs must yield persistent ownership to the HUD tracker');
  assert.doesNotMatch(onboardingSrc, /title\.setAttribute\('aria-live'/,
    'hidden tutorial verb copy must not remain an assistive live region');
  assert.doesNotMatch(onboardingSrc, /_ensureStoryPanel/,
    'onboarding must not rebuild a parallel persistent story-lore surface');
});

check('objective hierarchy remains legible and quiet for assistive technology', 'SOURCE', () => {
  assert.match(radarSrc, /g\.lineWidth = 2\.4/, 'objective diamond must have the strongest radar stroke');
  assert.match(radarSrc, /g\.arc\(x, y, 14/, 'objective marker must have a unique outer acquisition ring');
  assert.doesNotMatch(uiRootSrc, /\.sf-radar-objective-key\s*\{\s*display\s*:\s*none/,
    'matching objective key must not disappear on narrow layouts');
  const trackerSetup = hudSrc.slice(
    hudSrc.indexOf("missionTracker.className = 'sf-mission-tracker'"),
    hudSrc.indexOf('leftContext.appendChild(missionTracker)'),
  );
  assert.match(trackerSetup, /role', 'region'/,
    'changing-distance objective must be a labelled region');
  assert.doesNotMatch(trackerSetup, /aria-live|role', 'status'/,
    'changing distance must not be re-announced on each HUD refresh');
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. B0 → B1 SILENCE
// ═══════════════════════════════════════════════════════════════════════════════
check('inter-beat silence gate is ≥4s and orders wake → derelict', 'SOURCE', () => {
  assert.match(onboardingSrc, /SILENCE_S\s*=\s*4/, 'SILENCE_S must be 4 seconds');
  assert.match(onboardingSrc, /_tryAdvanceBeat/, 'beat advance engine must exist');
  assert.match(onboardingSrc,
    /now - Math\.max\(prevDoneAt, this\._lastTextAtS\) < SILENCE_S/,
    'advance must require DONE + silence since last text');
  // Beat key order: wake then derelict (B0 then B1)
  const beatsBlock = onboardingSrc.match(/const BEATS = \[([\s\S]*?)\n\];/);
  assert.ok(beatsBlock, 'BEATS table must exist');
  const keys = [...beatsBlock[1].matchAll(/key:\s*'([a-z_]+)'/g)].map((m) => m[1]);
  assert.deepEqual(keys.slice(0, 2), ['wake', 'derelict'],
    'B0 wake must precede B1 derelict');
  assert.deepEqual(keys, ['wake', 'derelict', 'seam', 'snare', 'dock', 'choice'],
    'six first-hour beats must stay in spec order');
});

check('story/missions yield the opening channel to the tutorial (no parallel cold-start voice)', 'SOURCE', () => {
  assert.match(storySrc, /_onboardingActive\(\)/, 'story must detect active onboarding');
  assert.match(storySrc, /_tutorialOwnsOpening\(\)/, 'story must defer cold-start to tutorial');
  assert.match(storySrc, /_coldStartDeferred/, 'story must track deferred cold-start');
  assert.match(storySrc, /_recentTutorialLine/,
    'story must suppress ambient comms near a tutorial line');
  assert.match(missionsSrc, /_tutorialOwnsOpening\(\)/,
    'missions must not force story waypoint/toast over the tutorial opening');
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. FIRST-DOCK QUIET
// ═══════════════════════════════════════════════════════════════════════════════
check('first dock keeps the attention channel quiet: one firstHub path, arbiter-routed, one-shot', 'SOURCE', () => {
  // Exactly one dock:docked → firstHub teacher path (not a multi-toast wall).
  const dockedBlocks = onboardingSrc.match(/bus\.on\('dock:docked'/g) || [];
  assert.ok(dockedBlocks.length >= 1, 'onboarding must listen for dock:docked');
  assert.match(onboardingSrc, /_showHint\('firstHub'/,
    'first hub orientation must be a one-shot hint key (firstHub)');
  assert.match(onboardingSrc, /id:\s*'tutorial:hint:' \+ key/,
    'contextual hints must use stable per-key arbiter ids (coalesce, not stack)');
  // firstHub must go through _showHint (player.hints gate) — never a raw multi-emit wall.
  const firstHubIdx = onboardingSrc.indexOf("_showHint('firstHub'");
  assert.ok(firstHubIdx >= 0);
  // No second parallel firstHub toast emit beside _showHint.
  assert.doesNotMatch(onboardingSrc,
    /_showHint\('firstHub'[\s\S]{0,200}bus\.emit\('toast'/,
    'firstHub must not double-emit toast beside the arbiter path in the same block');
  // Hints respect tutorialHints setting and fire once.
  assert.match(onboardingSrc, /if \(st\.player\.hints\[key\]\) return/,
    'hints must be one-shot via player.hints');
});

check('B4 dock beat speaks only through the tutorial chokepoint (no parallel dock modal)', 'SOURCE', () => {
  assert.match(onboardingSrc, /key:\s*'dock'/, 'B4 dock beat must exist');
  assert.match(onboardingSrc, /line:\s*'Helios\. Dock when close\.'/,
    'B4 entry must stay the single dock approach verb');
  assert.doesNotMatch(onboardingSrc, /pushScreen\(\s*['"]missionLog['"]\s*\)/,
    'onboarding must not force-open Mission Log (optional context only)');
  assert.doesNotMatch(onboardingSrc, /_showIntro|sf-ob-intro/,
    'no dock intro modal may reappear');
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. FIRST-HUB HANDOFF OWNERSHIP
// ═══════════════════════════════════════════════════════════════════════════════
check('station hub owns the first-dock handoff rail (sell → job → departure)', 'SOURCE', () => {
  assert.match(stationHubSrc, /export function firstDockHandoffVisible/,
    'handoff visibility must be exported for contract tests');
  assert.match(stationHubSrc, /export function firstDockHandoffSteps/,
    'handoff step planner must be exported');
  assert.ok(stationHubSrc.includes("handoff.className = 'st-handoff'")
    || stationHubSrc.includes('className = \'st-handoff\''),
    'visible st-handoff container required');
  assert.ok(stationHubSrc.includes('First dock — do these three')
    || stationHubSrc.includes('First Dock Handoff'),
    'player-facing handoff title required');
  assert.ok(
    stationHubSrc.includes('Sell what you hauled')
    || stationHubSrc.includes('Open your hold'),
    'handoff must start with truthful sell/hold step');
  assert.ok(
    stationHubSrc.includes('Take one easy job')
    || stationHubSrc.includes('Accept one low-risk job'),
    'handoff must send players to a safe first contract');
  assert.ok(
    stationHubSrc.includes('Safe to undock')
    || stationHubSrc.includes('Fix launch risks'),
    'handoff must end on Departure Check / undock readiness');
  assert.ok(stationHubSrc.includes('data-handoff-tab'),
    'handoff steps must be clickable tab actions');
  assert.ok(stationHubSrc.includes('data-handoff-dismiss')
    || stationHubSrc.includes('st-handoff-dismiss'),
    'handoff must be dismissible (strip, not permanent chrome)');
  assert.match(stationHubSrc, /departureReadinessChips\(state\)/,
    'departure step must read shared departure readiness (no invented launch truth)');
  assert.match(stationHubSrc, /this\._refreshHandoff\(\)/,
    'hub must refresh handoff from lifecycle/event paths');
});

check('onboarding yields first-dock persistence to the station handoff rail', 'SOURCE', () => {
  assert.match(onboardingSrc, /left rail/,
    'firstHub must teach the live left-rail layout, not top tabs');
  assert.match(onboardingSrc, /Use the left rail\. Departure Check owns undock\./,
    'firstHub must be a terse pointer, not a duplicate sell-job-undock checklist');
  assert.match(onboardingSrc, /_tutorialRailOwnsVoice\(\)/,
    'contextual firstHub must be suppressed while B0-B5 owns teaching');
  assert.match(stationHubSrc, /beatDoneAt\.dock/,
    'handoff sell completion must read the live onboarding beat receipt');
  assert.doesNotMatch(stationHubSrc, /ob\.done|done\.sell|done\.next/,
    'handoff must not read the obsolete onboarding.done shape');
  assert.doesNotMatch(onboardingSrc, /tab labels at top/i,
    'must not describe the old top-tab layout');
  assert.doesNotMatch(stationHubSrc, /codex/i,
    'first-dock handoff slice must not own Codex');
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. TRUTHFUL CONTROLS
// ═══════════════════════════════════════════════════════════════════════════════
check('B1 teaches massline + production tether:reel (never G / dead reelMax)', 'SOURCE', () => {
  assert.doesNotMatch(onboardingSrc, /Latch it\. G\./,
    'B1 must not teach Latch it. G. (G is combat computer)');
  assert.doesNotMatch(onboardingSrc, /tether:reelMax/,
    'B1 must not listen for dead tether:reelMax');
  assert.match(onboardingSrc, /Latch it\. Massline\./,
    'B1 entry must teach massline');
  assert.match(onboardingSrc, /on:\s*'tether:reel'/,
    'B1 cut follow-up must use production tether:reel');
  assert.match(onboardingSrc, /_onTetherReel/,
    'B1 must gate reel follow-up on tether:reel payload');
  assert.match(attachmentsSrc, /bus\.emit\('tether:reel'/,
    'attachments.reel is the production tether:reel emitter');
  assert.doesNotMatch(attachmentsSrc, /tether:reelMax/,
    'attachments must not emit tether:reelMax');
});

check('player-facing control prompts bind from BINDINGS / promptLabel (no hard drift)', 'SOURCE', () => {
  assert.match(controlPromptsSrc, /BINDINGS\.dock\.label/,
    'dock prompts must use live BINDINGS.dock.label');
  assert.match(controlPromptsSrc, /BINDINGS\.starmap\.label/,
    'starmap prompts must use live BINDINGS.starmap.label');
  assert.match(alertsSrc, /promptLabel\('dock'\)/,
    'dock status pill must use promptLabel so rebinds stay truthful');
  assert.match(onboardingSrc, /controlPrompt\('firstFlight'/,
    'firstFlight wall must pull from controlPrompt modality table');
  assert.match(onboardingSrc, /controlPrompt\('firstStation'/,
    'firstStation hint must pull from controlPrompt modality table');
});

// ═══════════════════════════════════════════════════════════════════════════════
// 8. ONE ATTENTION ANNOUNCEMENT PER SEMANTIC EVENT
// ═══════════════════════════════════════════════════════════════════════════════
check('each semantic combat/status event maps to one announce key (no parallel pills)', 'SOURCE', () => {
  // Transient one-shots route through announce (arbiter), not raise (status pills).
  assert.match(alertsSrc,
    /brokeShield\) announce\(\{ key: 'shield-down'/,
    'shield-break → single SHIELDS DOWN announce');
  assert.match(alertsSrc,
    /announce\(\{ key: 'incoming'/,
    'incoming damage → single TAKING FIRE announce');
  assert.match(alertsSrc,
    /cargo:full'[\s\S]*announce\(\{ key: 'cargo-full'/,
    'cargo full → single announce');
  assert.match(alertsSrc,
    /fuel:empty'[\s\S]*announce\(\{ key: 'fuel'/,
    'fuel empty → single announce');
  // Missile lock remains a status pill (condition-bound), not a one-shot voice — document that split.
  assert.match(alertsSrc, /combat:lockChanged[\s\S]*raise\(\{ key: 'lock'/,
    'missile lock stays a condition status pill, not a one-shot voice stack');
  // Transient alert bus events with finite ttl must route through announce, not raise.
  assert.match(alertsSrc,
    /if \(rec\.ttl === Infinity \|\| rec\.ttl == null\) raise\(rec\);\s*else announce\(rec\)/,
    'finite-ttl alert events must enter the arbiter; only infinite status pills may raise');
});

check('tutorial semantic events coalesce under stable ids (beat + hint keys)', 'SOURCE', () => {
  assert.match(onboardingSrc, /id:\s*'tutorial:beat'/,
    'beat entry/followup share tutorial:beat id → one attention line per beat window');
  assert.match(onboardingSrc, /id:\s*'tutorial:hint:' \+ key/,
    'each hint key is one semantic announcement id');
});

check('SYNTH: repeated same-id announce coalesces to one floor holder', 'SYNTH', () => {
  const q = new VoiceQueue();
  q.enqueue({ channel: 'alert', text: 'TAKING FIRE', ttl: 2, id: 'alert:incoming', priority: 80 }, 0);
  q.enqueue({ channel: 'alert', text: 'TAKING FIRE', ttl: 2, id: 'alert:incoming', priority: 80 }, 50);
  q.enqueue({ channel: 'alert', text: 'TAKING FIRE', ttl: 2, id: 'alert:incoming', priority: 80 }, 100);
  assert.equal(q.size, 1, 'three same-id announces must coalesce to one queue entry');
  const surfaced = q.step(100);
  assert.equal(surfaced.text, 'TAKING FIRE');
  assert.equal(q.size, 1, 'active floor remains the single holder');
});

// ═══════════════════════════════════════════════════════════════════════════════
// 9. BROWSER / ELECTRON ROUTE CONTRACT HOOKS
//    (same player-facing game route — NOT headed first-hour live proof)
// ═══════════════════════════════════════════════════════════════════════════════
check('ROUTE: Browser + Electron share one game entry (main.js) without query forks', 'ROUTE', () => {
  assert.match(indexHtmlSrc, /src\/main\.js|type="module"/,
    'browser index must boot the module game entry');
  assert.match(mainSrc, /createGameState|createRegistry/,
    'main.js remains the shared player-facing boot');
  assert.doesNotMatch(mainSrc, /prod=1|get\('prod'\)|\?prod/,
    'boot must not fork on prod query flags');
  assert.match(mainSrc, /const runTransitionGuard\s*=\s*createRunTransitionGuard\(\)/,
    'Browser/Electron share one run-transition generation owner');
});

check('ROUTE: launchers use shared gameServer; Electron loads canonical root URL', 'ROUTE', () => {
  assert.match(gameServerSrc, /createGameServer/,
    'shared gameServer module owns serving semantics');
  assert.match(serverSrc, /gameServer\.cjs/,
    'browser server must require shared gameServer');
  assert.match(electronMainSrc, /gameServer\.cjs/,
    'Electron must require shared gameServer');
  const loadUrlLine = electronMainSrc.split(/\r?\n/).find((line) => line.includes('win.loadURL')) || '';
  assert.ok(loadUrlLine.includes('http://127.0.0.1:${port}/`')
    || /loadURL\(`http:\/\/127\.0\.0\.1:\$\{port\}\/`\)/.test(electronMainSrc),
    'Electron must load the canonical root game URL');
  assert.doesNotMatch(loadUrlLine, /\?|prod=1|release=1|debug=/,
    'Electron must not inject mode/query flags into the normal game launch URL');
});

check('ROUTE: this gate is registered and does not claim live headed proof', 'ROUTE', () => {
  assert.equal(
    pkg.scripts['check:professional-first-hour-one-voice'],
    'node scripts/check-professional-first-hour-one-voice.mjs',
    'package.json must expose check:professional-first-hour-one-voice',
  );
  // Explicit anti-claim: this script file must keep the synthetic-vs-live disclaimer.
  const selfSrc = read('scripts/check-professional-first-hour-one-voice.mjs');
  assert.match(selfSrc, /NOT live|not live|NOT headed/i,
    'self-disclaimer: synthetic/route hooks must not be described as live first-hour proof');
  assert.match(selfSrc, /SOURCE|SYNTH|ROUTE/,
    'proof classes must remain labeled in the check source');
});

// ═══════════════════════════════════════════════════════════════════════════════
// Report (fail closed)
// ═══════════════════════════════════════════════════════════════════════════════
console.log('');
console.log('[check-professional-first-hour-one-voice] proof mix '
  + `(SOURCE=${PROOF.SOURCE} SYNTH=${PROOF.SYNTH} ROUTE=${PROOF.ROUTE}) — `
  + 'SYNTH/ROUTE are not headed live first-hour proof.');

if (FAILURES.length) {
  console.error('');
  console.error(`[check-professional-first-hour-one-voice] FAIL — ${FAILURES.length} contract(s) red `
    + `(${PASSES.length} green). Integration evidence:`);
  for (const f of FAILURES) {
    console.error(`  • [${f.proofClass}] ${f.surface}`);
    console.error(`      ${f.message}`);
  }
  console.error('');
  console.error('These failures are integration evidence for the first-hour one-voice lane.');
  console.error('Do not re-record goldens; fix production ownership or complete the missing wiring.');
  process.exit(1);
}

console.log(`[check-professional-first-hour-one-voice] PASS — ${PASSES.length} contracts green `
  + '(fail-closed; synthetic ≠ live headed proof).');
process.exit(0);
