import assert from 'node:assert/strict';
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  stat,
  symlink,
  unlink,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import * as pq017Route from '../scripts/lib/pq017WorldSitePublicRoute.mjs';
import {
  auditPq017ImpactRestage,
  auditPq017RouteSweep,
  auditSafetyCouplerImpact,
  advancePq017ScopedEscapeContexts,
  choosePq017ClearStagingPoint,
  choosePq017ImpactStagingReference,
  decidePq017WaypointProgressExtension,
  decidePq017BrakeBelow,
  decidePq017BrakePulseProgress,
  decidePq017BrakePulseRecovery,
  derivePq017RingPassThroughProof,
  decidePq017ReceiverTowTarget,
  decidePq017ReleasedPayloadSettlement,
  evaluatePq017RingPassThrough,
  planPq017ManualThrustReceiptRecovery,
  planPq017ImpactStaging,
  planPq017ReceiverOutwardTarget,
  planPq017ReceiverCrossingPull,
  planPq017ReceiverServiceTarget,
  computePq017OutwardStagingPoint,
  createPq017ScopedEscapeContexts,
  decidePq017ImpactControl,
  decidePq017ReverseStagingControl,
  decidePq017SettledArrivalControl,
  evaluatePq017PerformanceComparison,
  evaluatePq017ReleasedDetourBrakeDisplacement,
  evaluateSiteResidencyLifecycle,
  prunePq017EvidenceHistory,
  selectPq017EvidenceHistory,
  summarizeBoundedFrameTimes,
  summarizePq017OperationRouteDiagnostic,
  updatePq017WaypointProgressEpoch,
  PQ017_RELEASED_DETOUR_SETTLED_SPEED,
  PQ017_RELEASED_LAUNCH_READY_SPEED,
} from '../scripts/lib/pq017WorldSitePublicRoute.mjs';
import { worldSiteManifestById } from '../src/data/worldSiteManifests.js';
import { createWorldSiteRecord } from '../src/systems/worldSiteKernel.js';
import {
  PQ017_FAR_SIDE_TIME_BUDGET_CAPTURE,
} from './fixtures/pq017-far-side-time-budget-capture.mjs';

const ROOT = new URL('../', import.meta.url);

async function source(relativePath) {
  return readFile(new URL(relativePath, ROOT), 'utf8');
}

test('PQ-017 browser and Electron wrappers share one fail-closed public player route', async () => {
  const [route, browser, electron, pkgText] = await Promise.all([
    source('scripts/lib/pq017WorldSitePublicRoute.mjs'),
    source('scripts/probe-pq017-world-site.mjs'),
    source('scripts/probe-pq017-world-site-electron.mjs'),
    source('package.json'),
  ]);
  const pkg = JSON.parse(pkgText);

  assert.match(route, /export async function runPq017WorldSitePublicRoute/);
  assert.match(route, /bootToAuthoredFlight/);
  assert.match(route, /NORMAL_ROUTE_BLOCKED/);
  assert.match(route, /getByRole\('button', \{ name: 'Continue'/);
  assert.match(route, /keyboard\.press\('F5'\)/);
  assert.match(route, /keyboard\.press\('KeyN'\)/);
  assert.match(route, /History/);
  assert.match(route, /ControlLeft/);
  assert.match(route, /button:\s*'middle'/,
    'long site approaches must use the shipped selected-target autopilot control');
  assert.match(route, /recoveryPlan\.action === 'reverse-restage'[\s\S]*keyboard\.down\('KeyS'\)[\s\S]*waitForFixedTicks\(page,\s*30\)/,
    'route must physically back out of a bounded zero-speed obstacle-avoidance deadlock');
  assert.match(route, /recoveryPlan\.action === 'manual-recovery'[\s\S]*autopilotEnabled = false/,
    'sustained moving-away avoidance must release MMB to the sampled Pilot controller');
  assert.match(route, /expectedTargetEntityId:\s*autopilot\.entityId/,
    'arrival recovery must validate the live lease against the originally engaged component');
  assert.match(route, /tick:\s*Number\(state\?\.tick\)/,
    'arrival recovery samples must use distinct fixed-step simulation ticks');
  assert.match(route, /worldSitePresentation/);
  assert.match(route, /socketWorldPose/);
  assert.match(route, /Set Course & Jump/);
  assert.match(route, /sector:exit/);
  assert.match(route, /sector:enter/);
  assert.match(route, /site-absent-away/);
  assert.match(route, /site-rematerialized-on-return/);
  assert.match(route, /performance\.memory/);
  assert.match(route, /renderer\?\.info/);
  assert.match(route, /presentationFixtureCount/);
  assert.match(route, /timeBudgetScale/,
    'shared route must separate wall-clock safety headroom from behavioral acceptance');
  assert.match(route, /__SPACEFACE_PERF__\?\.reset/,
    'each representative window must reset its own runtime timing rings');
  assert.match(route, /Math\.max\(1, Math\.min\(4/,
    'runtime wall-clock headroom must remain bounded');
  assert.doesNotMatch(route, /flyToWorldRecord\(page, PQ017_ROOT_WORLD_ID/,
    'root arrival must use the same bounded-speed controller as component arrival');
  assert.doesNotMatch(route, /flyToWorldRecord\(page, componentWorldRecordId/,
    'smart settled arrival must not inherit speed from a raw full-thrust component flyby');
  assert.match(route, /settleAtWorldRecord\(page, componentWorldRecordId/,
    'component arrival must brake and reacquire until both position and speed are settled');
  assert.match(route, /approachTimeoutMs, \{ useAutopilot: false \}\)/,
    'short component transfers must use direct ordinary controls after the long-range MMB route is proven');
  assert.match(route, /settleAtWorldRecord\(page, PQ017_ROOT_WORLD_ID/,
    'the first arrival frame must be settled before component traversal starts');
  assert.match(route, /autopilotWorldRecordId:\s*PQ017_RELAY_CORE_WORLD_ID/,
    'root arrival must name the admitted component used by every MMB engagement');
  assert.match(route, /engageWorldRecordAutopilot[\s\S]*cycleToWorldRecord\(page, worldRecordId, \{ stableTicks: 2 \}\)/,
    'initial and recovery MMB passes must reseat a fixed-step-stable public component target');
  const autopilotPress = route.match(
    /async function pressSelectedTargetAutopilot[\s\S]*?\n}\r?\n\r?\nasync function engageSelectedTargetAutopilot/,
  )?.[0] || '';
  assert.match(
    autopilotPress,
    /bringToFront\(\)[\s\S]*mouse\.move\([\s\S]*mouse\.down\(\{ button: 'middle' \}\)/,
    'every physical MMB attempt must focus the flight route and use the unobstructed reticle',
  );
  assert.match(
    autopilotPress,
    /targetEntityId === targetId[\s\S]*autopilot\.active === true \|\| autopilot\.status === 'arrived'/,
    'MMB must remain held for an exact active-or-arrived autopilot receipt, not a stale target id',
  );
  assert.doesNotMatch(
    autopilotPress,
    /startTick|maximumHoldTicks|tick\s*\+\s*\d+/,
    'batched simulation ticks must never release MMB before its bounded wall timeout',
  );
  assert.match(
    autopilotPress,
    /finally\s*\{[\s\S]*mouse\.up\(\{ button: 'middle' \}\)/,
    'every physical MMB attempt must release the button even on timeout or route failure',
  );
  const worldRecordAutopilot = route.match(
    /async function engageWorldRecordAutopilot[\s\S]*?\n}\r?\n\r?\nasync function flyToPoint/,
  )?.[0] || '';
  assert.match(
    worldRecordAutopilot,
    /for \(let attempt = 1; attempt <= PQ017_AUTOPILOT_ENGAGEMENT_ATTEMPT_LIMIT; attempt \+= 1\)[\s\S]*cycleToWorldRecord\(page, worldRecordId, \{ stableTicks: 2 \}\)/,
    'every bounded MMB attempt must begin from a fixed-step-stable public target selection',
  );
  assert.match(
    worldRecordAutopilot,
    /waitForFixedTicks\(page, 1\)[\s\S]*planPq017AutopilotEngagementReceipt/,
    'a missed MMB request must publish a distinct neutral fixed tick before retrying',
  );
  assert.doesNotMatch(
    `${autopilotPress}\n${worldRecordAutopilot}`,
    /(?:state|autopilot|player)\.[A-Za-z0-9_.]+\s*=(?!=)/,
    'autopilot engagement may observe live state but must not directly mutate it',
  );
  assert.match(worldRecordAutopilot, /trace\.push\(\{[\s\S]*attempt[\s\S]*pressTick[\s\S]*releaseTick[\s\S]*neutralTick/,
    'bounded failure evidence must retain attempt, press, release, and neutral receipt ticks');
  assert.match(route, /autopilotRecoveries <= 2[\s\S]*autopilot = await engageAutopilot\(\)/,
    'avoidance recovery must not reuse a target selection that another gameplay lease replaced');
  assert.match(route, /SITE_ROOT_SETTLE_TIMEOUT_MS\s*=\s*120_000/,
    'cold root transit must not share the shorter component-settle budget');
  assert.match(route, /SITE_ARRIVAL_YAW_RELEASE_DEADBAND\s*=\s*0\.12/);
  assert.match(route, /SITE_ARRIVAL_THRUST_HEADING_WINDOW\s*=\s*0\.4/,
    'Pilot thrust permission must not be coupled to a narrow sampled yaw deadband');
  assert.match(route, /SITE_ARRIVAL_SAMPLE_MS\s*=\s*50/);
  assert.match(route, /PQ017_RECEIVER_SHORT_CROSSING_MAX_ROUTE\s*=\s*96/,
    'the attached receiver phase must stay inside a short direct-pull envelope');
  assert.match(route, /PQ017_RELEASED_PAYLOAD_MAX_DRIFT\s*=\s*12/,
    'released-payload drift must remain inside the collision planner margin');
  assert.match(route, /decidePq017SettledArrivalControl/);
  assert.match(route, /closingSpeed/);
  assert.match(route, /velocityHeadingError/,
    'moving-away lateral capture must align nose-relative reverse thrust to live velocity');
  assert.match(
    route,
    /async function flyToPoint[\s\S]*brakeRecoveryLatched[\s\S]*signed-brake-recovery[\s\S]*decidePq017BrakePulseRecovery/,
    'untethered waypoint flight must retain signed pulse recovery instead of repeating wrong-axis KeyS',
  );
  assert.match(
    route,
    /propulsionNeutral:[\s\S]*Number\.isFinite\(moveX\)[\s\S]*Number\.isFinite\(moveZ\)[\s\S]*brake === false[\s\S]*boost === false[\s\S]*autopilot\?\.active !== true/,
    'initial overlap wobble must require observed neutral translation and no autopilot lease',
  );
  assert.match(route, /Math\.atan2\(player\.vel\.z, player\.vel\.x\) - player\.rot/);
  assert.match(route, /stoppingDistance/);
  assert.match(route, /closingSpeed > settledSpeed && stoppingDistance \+ brakeBuffer >= remainingDistance/,
    'the stop buffer must not pin a low-closing-speed ship outside a tight waypoint');
  assert.match(route, /directStoppingDistance/);
  assert.match(route, /approachSpeedCap/);
  assert.match(route, /brakePulseMs/);
  assert.match(route, /pulsePq017Brake/);
  assert.match(route, /tickDelta\s*>=\s*12/,
    'brake input must span observed fixed-step progress under a loaded headed renderer');
  assert.match(route, /settledArrivalDiagnostic/,
    'navigation failure must retain the final live guidance observation');
  assert.match(route, /autopilotEnabled && nav\.autopilot\?\.active === true/,
    'long-range arrival must preserve shipped obstacle avoidance until arrival or bounded recovery');
  assert.match(route, /input:\s*\{\s*moveZ: Number\(state\?\.input\?\.moveZ\) \|\| 0/,
    'manual fallback must observe the fixed-step input receipt instead of trusting a browser key hold');
  assert.match(route, /reedgePq017ManualThrust/);
  assert.match(route,
    /keyboard\.up\('KeyW'\)[\s\S]*neutral\.tick <= startTick[\s\S]*keyboard\.down\('KeyW'\)/,
    'a lost held key must publish a neutral tick before a fresh W edge');
  assert.match(route, /moveZ > 0\.08 && speed > baselineSpeed \+ 0\.1/,
    're-edge acceptance must prove both sampled input and actual acceleration');
  assert.match(route, /maxReedges:\s*2/,
    'manual thrust edge recovery must remain bounded');
  assert.match(route,
    /receiptPlan\.action === 'blocked' \|\| receiptPlan\.action === 'refuse'\) break[\s\S]*?\['request', 'wait', 'received'\]\.includes\(receiptPlan\.action\)\) break/,
    'foreign leases and unknown receipt actions must fail closed before the ordinary W mutation');
  assert.match(route, /routeFailureSnapshot/,
    'route errors must retain the current durable site record and observed receipts');
  assert.match(route, /assertNoUnexpectedWorldSiteFailure/,
    'ordinary pre-impact operations must fail at the causal operation if any failure receipt appears');
  assert.match(route, /physics:impact/,
    'the failure observer must retain site-scoped impact evidence');
  assert.match(route, /keyboard\.down\('KeyS'\)/, 'settled arrival must use the shipped brake control');
  const releaseFlightKeys = route.match(
    /async function releaseFlightKeys[\s\S]*?\n}\r?\n\r?\nasync function/,
  )?.[0] || '';
  for (const code of ['KeyW', 'KeyA', 'KeyD', 'KeyS']) {
    assert.match(releaseFlightKeys, new RegExp(`'${code}'`),
      `route cleanup must release ${code}`);
  }
  assert.match(releaseFlightKeys, /PQ017_PRECISION_BRAKE_KEY/,
    'route cleanup must release the dedicated rebindable brake event');
  assert.match(route, /SITE_OPERATION_SETTLED_SAMPLES/,
    'a single transient low-speed sample is not a settled arrival');
  assert.match(route, /summarizePq017OperationRouteDiagnostic/);
  assert.match(route, /readyOperationId/);
  assert.match(route, /allowedDistance/);
  assert.match(route, /safety_coupler_impact/);
  const impactStage = route.match(
    /async function stageImpactRun[\s\S]*?\r?\n}\r?\n\r?\nasync function stageAwayFromWorldRecord/,
  )?.[0] || '';
  assert.match(impactStage, /cycleToComponent\(page, componentId\)/,
    'impact staging must select the public component target');
  assert.match(impactStage, /positionPq017ImpactRunup/,
    'impact staging must establish its root-outward run-up through ordinary flight');
  assert.match(impactStage, /flyToPoint/,
    'impact staging must traverse the planned outer-ring waypoints through shipped controls');
  assert.match(impactStage, /waypoint\.phase === 'launch' \? 45_000 : 15_000/,
    'the exact final impact radial needs its own bounded budget after outer-ring traversal');
  assert.match(impactStage, /brakePlayerBelow/,
    'impact staging must settle before the deliberate collision run');
  assert.doesNotMatch(impactStage, /engageSelectedTargetAutopilot/,
    'impact staging must not ask obstacle avoidance to enter a collision island before backing out');
  const impactPosition = route.match(
    /async function positionPq017ImpactRunup[\s\S]*?\r?\n}\r?\n\r?\nasync function stageAwayFromWorldRecord/,
  )?.[0] || '';
  assert.match(
    impactPosition,
    /role === 'world_site_collision'[\s\S]*entity\?\.collides !== false/,
    'impact staging must route around the same World Site collision envelope',
  );
  assert.doesNotMatch(impactPosition, /passThrough:/,
    'high-speed impact staging must settle every ring waypoint without a tow-only inertial proof');
  assert.match(impactPosition,
    /maxSettledSpeed: waypoint\.phase === 'launch' \? 6 : 10/,
    'the exact final impact launch point must settle within 6 WU at no more than 6 WU\/s');
  assert.match(route, /const beforeImpact = await snapshot\(page\);\s*await ramWorldRecord/,
    'impact audit baseline must be captured immediately before the deliberate physical ram');
  assert.match(route, /ordinary impact staging must not damage the recovered World Site/);
  const impactRun = route.match(
    /async function ramWorldRecord[\s\S]*?\r?\n}\r?\n\r?\nasync function stageImpactRun/,
  )?.[0] || '';
  assert.match(impactRun, /keyboard\.up\('ShiftLeft'\)/,
    'the impact loop must explicitly exclude the discrete dash impulse');
  assert.doesNotMatch(impactRun, /control\.boost\s*\?\s*'down'/,
    'the capped impact route must never conditionally engage boost');
  assert.match(impactRun,
    /impactCaptureSamples > PQ017_IMPACT_CAPTURE_SAMPLE_LIMIT/,
    'lateral velocity capture must remain bounded inside each physical impact attempt');
  assert.match(impactRun,
    /captureActive: impactCaptureActive[\s\S]*?control\.action === 'capture-complete'\) break/,
    'once lateral capture begins it must stay latched until a low-speed reset, then restage');
  assert.match(impactRun,
    /control\.action === 'velocity-align' \|\| control\.action === 'velocity-cancel' \? 1 : 2/,
    'capture controls must be sampled every fixed tick before the nearby relay collider can intervene');
  assert.match(route, /maxApproachSpeed = 12/,
    'the physical receiver tow must remain below destructive service speed');
  const receiverDelivery = route.match(
    /async function deliverPayloadToSelectedReceiver[\s\S]*?\n}\r?\n\r?\nasync function waitForFixedTicks/,
  )?.[0] || '';
  const farSideRelatchAudit = route.match(
    /export function evaluatePq017FarSideRelatch[\s\S]*?\n}\r?\n\r?\nexport function decidePq017PreReleaseStandoff/,
  )?.[0] || '';
  const initialMasslineDelivery = route.match(
    /phase = 'massline-delivery';[\s\S]*?await assertNoUnexpectedWorldSiteFailure\(page, 'settle_field_coil'\)/,
  )?.[0] || '';
  assert.doesNotMatch(receiverDelivery, /await stagePq017ReceiverTowSide/,
    'the payload must not remain tethered through the long collision detour');
  assert.doesNotMatch(initialMasslineDelivery,
    /latchWorldRecord\(page,\s*PQ017_PAYLOAD_WORLD_ID\)/,
    'the already-free payload must not be latched beside the World Site before the safe detour');
  assert.match(initialMasslineDelivery,
    /deliverPayloadToSelectedReceiver[\s\S]*onPayloadLatched:[\s\S]*massline-payload-latched/,
    'the progress marker must be emitted only by the actual far-side latch receipt');
  assert(
    receiverDelivery.indexOf('preparePq017ReleasedReceiverCrossing')
        < receiverDelivery.indexOf('latchWorldRecord')
      && receiverDelivery.indexOf('latchWorldRecord')
        < receiverDelivery.indexOf("cycleToComponent(page, 'receiver_collar')")
      && receiverDelivery.indexOf("cycleToComponent(page, 'receiver_collar')")
        < receiverDelivery.indexOf("keyboard.down('KeyB')"),
    'delivery must establish safe slack, release, detour, relatch, reselect the receiver, and only then hold B',
  );
  const invalidRelatchRetry = receiverDelivery.match(
    /if \(attempt >= PQ017_RECEIVER_RELATCH_ATTEMPT_LIMIT\)[\s\S]*?preparePq017SafeReleaseStandoff[\s\S]*?releaseMasslineWorldRecord/,
  )?.[0] || '';
  assert.match(invalidRelatchRetry, /preparePq017SafeReleaseStandoff/,
    'safe attached release must remain available only to recover an invalid far-side relatch');
  assert.match(receiverDelivery,
    /latchReceipt[\s\S]*waitForFixedTicks\(page,\s*1\)[\s\S]*evaluatePq017FarSideRelatch/,
    'relatch validation must use a distinct post-latch geometry receipt and explicit predicate audit');
  assert(
    receiverDelivery.indexOf('const valid =')
      < receiverDelivery.indexOf('preparePq017SafeReleaseStandoff'),
    'the first unlatched detour and relatch must precede any attached release/retry path',
  );
  assert.match(route,
    /PQ017_RECEIVER_UNTETHERED_DETOUR_LIMIT\s*=\s*2/,
    'live far-side correction must allow at most two untethered detours');
  assert.match(route,
    /planningCycle <= PQ017_RECEIVER_UNTETHERED_DETOUR_LIMIT \+ 1/,
    'two corrective detours must be followed by one final live verification cycle');
  assert.match(route,
    /includePayloadAsShipObstacle:\s*true/,
    'the released payload must constrain the untethered ship route');
  assert.match(route, /rootCollides:\s*geometry\.rootCollides === true/,
    'payload ordering must consume the root entity live collision authority');
  assert.match(route, /payloadCollides:\s*geometry\.payloadCollides === true/,
    'payload chord blocking must consume the payload entity live contact authority');
  const manualRelease = route.match(
    /async function releaseMasslineWorldRecord[\s\S]*?\n}\r?\n\r?\nasync function waitForPq017ReleasedPayloadSettlement/,
  )?.[0] || '';
  const safeReleaseStandoff = route.match(
    /async function preparePq017SafeReleaseStandoff[\s\S]*?\n}\r?\n\r?\nasync function releaseMasslineWorldRecord/,
  )?.[0] || '';
  const alreadyFarReleaseSettlement = route.match(
    /async function waitForPq017AlreadyFarReleaseSettlement[\s\S]*?\n}\r?\n\r?\nasync function preparePq017SafeReleaseStandoff/,
  )?.[0] || '';
  const neutralStandoffSettlement = route.match(
    /async function waitForPq017StandoffNeutralSettlement[\s\S]*?\n}\r?\n\r?\nasync function waitForPq017StandoffYawAlignment/,
  )?.[0] || '';
  const yawStandoffAlignment = route.match(
    /async function waitForPq017StandoffYawAlignment[\s\S]*?\n}\r?\n\r?\nasync function waitForPq017StandoffTrafficClear/,
  )?.[0] || '';
  const trafficStandoffWait = route.match(
    /async function waitForPq017StandoffTrafficClear[\s\S]*?\n}\r?\n\r?\nasync function preparePq017AlignedStandoffPlan/,
  )?.[0] || '';
  const realSolidFilter = route.match(
    /function pq017StandoffRealSolidObstacles[\s\S]*?\n}\r?\n\r?\nfunction pq017StandoffObservation/,
  )?.[0] || '';
  const alignedStandoffPlan = route.match(
    /async function preparePq017AlignedStandoffPlan[\s\S]*?\n}\r?\n\r?\nasync function pulsePq017AttachedRadialBrake/,
  )?.[0] || '';
  assert.match(safeReleaseStandoff,
    /keyboard\.down\('Space'\)[\s\S]*lineControl === true[\s\S]*keyboard\.down\('KeyS'\)/,
    'Space must cross the live hold grammar before S can become pay-out instead of reverse thrust');
  assert.match(safeReleaseStandoff,
    /keyboard\.up\('KeyS'\);\s*await page\.keyboard\.up\('Space'\);/,
    'line cleanup must lift S then Space without exposing an ordinary reverse-thrust tick');
  assert.doesNotMatch(safeReleaseStandoff,
    /keyboard\.up\('KeyS'\);[\s\S]*waitForFixedTicks[\s\S]*keyboard\.up\('Space'\);/,
    'remembered pay-out intent must not receive another fixed tick between line-control key releases');
  assert.match(safeReleaseStandoff, /flyPq017AttachedStandoffRadial/,
    'the attached ship must use the dedicated straight-radial public controller');
  assert.doesNotMatch(safeReleaseStandoff, /flyToPoint|brakePlayerBelow/,
    'generic orbit/brake guidance must not own the tight attached standoff');
  assert.match(safeReleaseStandoff,
    /decision\.action === 'settle'[\s\S]*waitForPq017AlreadyFarReleaseSettlement/,
    'an already-far invalid relatch must settle at its proven radius instead of entering radial staging');
  assert.match(alreadyFarReleaseSettlement,
    /brakePlayerBelow\([\s\S]*PQ017_RELEASED_DETOUR_SETTLED_SPEED/,
    'already-far retry settlement must brake to the released-detour low-energy bound');
  assert.match(alreadyFarReleaseSettlement, /auditPq017RouteSweep/,
    'already-far retry settlement must retain a fresh live swept-clearance proof');
  assert.match(alreadyFarReleaseSettlement, /releaseAuthorized === true/,
    'already-far retry settlement must require a fresh release authorization');
  assert.doesNotMatch(alreadyFarReleaseSettlement,
    /minimumRetainedSlack|waitForPq017StandoffNeutralSettlement/,
    'already-far retry settlement must not inherit the tight radial-stage slack floor');
  assert(
    safeReleaseStandoff.indexOf('waitForPq017StandoffNeutralSettlement')
      < safeReleaseStandoff.indexOf('preparePq017AlignedStandoffPlan'),
    'all flight keys must settle neutral before the aligned radial-plan preparation',
  );
  assert.match(neutralStandoffSettlement,
    /releaseFlightKeys\(page\)[\s\S]*decidePq017StandoffNeutralSettlement[\s\S]*maxDistinctTicks:\s*120/,
    'neutral settlement must release every flight key and cap itself at 120 distinct ticks');
  assert.match(neutralStandoffSettlement,
    /auditPq017RouteSweep\(\s*previousGeometry\.player,\s*geometry\.player,\s*realSolidObstacles/,
    'each neutral-drift segment must be collision audited against fresh live solids');
  assert.match(neutralStandoffSettlement,
    /initialAnchorLineDistance[\s\S]*minimumAnchorLineDistance[\s\S]*-\s*0\.25/,
    'neutral coast may preserve its exact attached start but may not retreat over 0.25 WU');
  assert.doesNotMatch(neutralStandoffSettlement, /keyboard\.down/,
    'neutral settlement must never manufacture braking or translation input');
  assert.match(yawStandoffAlignment,
    /decidePq017StandoffYawAlignment[\s\S]*releaseFlightKeys\(page\)[\s\S]*tapPq017PublicYaw\(page, alignment\.turnDirection\)/,
    'pre-plan yaw alignment must release W/S and delegate only bounded measured-sign A/D taps');
  assert.match(yawStandoffAlignment,
    /auditPq017RouteSweep[\s\S]*createPq017AttachedStandoffPlan[\s\S]*evaluatePq017StandoffPreflight/,
    'every yaw sample must audit actual drift and the prospective full outward corridor');
  assert.match(yawStandoffAlignment,
    /targetDistance:\s*decision\.targetDistance[\s\S]*corridorHalfWidth:[\s\S]*usableCorridor:\s*0\.75/,
    'production yaw alignment must consume the live remaining-distance corridor budget');
  assert.match(yawStandoffAlignment,
    /yawReanchors[\s\S]*decidePq017PrePlanYawReanchor[\s\S]*maxPlayerDrift \* 0\.75[\s\S]*releaseFlightKeys\(page\)[\s\S]*reanchorRequired:\s*true/,
    'safe pre-plan drift must request one full-cycle re-anchor instead of widening the hard gate');
  assert.equal(yawStandoffAlignment.match(/\balignment\s*=\s*\{\}/g)?.length, 1,
    'the yaw driver may initialize alignment once but must not reset its origin locally');
  assert.doesNotMatch(yawStandoffAlignment, /keyboard\.down\('KeyW'\)|keyboard\.down\('KeyS'\)/,
    'pre-plan yaw alignment must never thrust or reverse');
  assert.match(trafficStandoffWait,
    /createPq017AttachedStandoffPlan[\s\S]*evaluatePq017StandoffPreflight[\s\S]*decidePq017StandoffTrafficWait/,
    'traffic waiting must replan and fully re-audit the fixed-anchor corridor');
  assert.match(trafficStandoffWait,
    /maxTrafficTicks:\s*360[\s\S]*requiredClearSamples:\s*3[\s\S]*waitForFixedTicks\(page,\s*6\)/,
    'moving traffic may receive at most six neutral seconds and needs three clear six-tick samples');
  assert.doesNotMatch(trafficStandoffWait, /keyboard\.down/,
    'the traffic wait must remain neutral while a ship clears the chord');
  assert.doesNotMatch(trafficStandoffWait,
    /const settled = await waitForPq017StandoffNeutralSettlement/,
    'the initial traffic proof must not silently reseed a second neutral origin');
  assert.match(realSolidFilter,
    /worldRecordId !== PQ017_PAYLOAD_WORLD_ID/,
    'only the attached noncolliding payload may be excluded from the real-solid flight audit');
  assert.match(alignedStandoffPlan,
    /evaluatePq017StandoffPreflight/,
    'the complete live outward radial must be split-audited against static solids and moving traffic');
  const standoffPreflight = route.match(
    /export function evaluatePq017StandoffPreflight[\s\S]*?\n}\r?\n\r?\nexport function decidePq017StandoffTrafficWait/,
  )?.[0] || '';
  assert.match(
    standoffPreflight,
    /staticPhysicalSweep\s*=\s*auditPq017RouteSweep\([\s\S]*requiredClearance:\s*0[\s\S]*staticSweep\s*=\s*auditPq017RouteSweep\([\s\S]*allowAdvisoryMarginEgress:\s*true/,
    'static advisory egress must sit behind a strict physical full-sweep proof',
  );
  const trafficPreflightCall = standoffPreflight.match(
    /const trafficSweep\s*=\s*auditPq017RouteSweep\([\s\S]*?\n\s*\);/,
  )?.[0] || '';
  assert.doesNotMatch(
    trafficPreflightCall,
    /allowAdvisoryMarginEgress/,
    'moving traffic must retain the full planner margin without an egress bypass',
  );
  assert(
    safeReleaseStandoff.indexOf('preparePq017AlignedStandoffPlan')
      < safeReleaseStandoff.indexOf('await flyPq017AttachedStandoffRadial'),
    'the full-segment sweep must fail closed before sampled flight can move the ship',
  );
  assert.match(safeReleaseStandoff,
    /releaseAuthorized !== true[\s\S]*pre-release standoff did not authorize manual release/,
    'the fresh Space tap must remain unreachable until distance, slack, speed, drift, and break gates pass');
  assert.doesNotMatch(safeReleaseStandoff,
    /(?:state|tether)\.(?:player|entities|active|targetId|restLength|lineControl|lineLengthRate|reeling|payingOut)\s*=/,
    'the pre-release maneuver may observe state but never write simulation or Massline internals');
  const radialController = route.match(
    /async function flyPq017AttachedStandoffRadial[\s\S]*?\n}\r?\n\r?\nasync function waitForPq017AlreadyFarReleaseSettlement/,
  )?.[0] || '';
  assert.match(radialController,
    /decidePq017AttachedStandoffRadialControl[\s\S]*auditPq017RouteSweep/,
    'every distinct radial-control tick must retain pure guidance plus a live swept collision gate');
  const prePlanYawDriver = route.match(
    /async function waitForPq017StandoffYawAlignment[\s\S]*?\n}\r?\n\r?\nasync function waitForPq017StandoffTrafficClear/,
  )?.[0] || '';
  const publicYawTap = route.match(
    /async function tapPq017PublicYaw[\s\S]*?\n}\r?\n/,
  )?.[0] || '';
  assert.match(publicYawTap,
    /releaseFlightKeys\(page\)[\s\S]*keyboard\.down\(turnKey\)[\s\S]*try[\s\S]*waitForFixedTicks\(page, 1\)[\s\S]*finally[\s\S]*keyboard\.up\('KeyA'\)[\s\S]*keyboard\.up\('KeyD'\)[\s\S]*waitForFixedTicks\(page, 1\)/,
    'the shared public yaw grammar must bound A/D to one fixed tick and prove a later neutral tick');
  assert.match(prePlanYawDriver, /tapPq017PublicYaw/,
    'pre-plan yaw alignment must use the same bounded public A/D tap as attached control');
  assert.match(radialController, /tapPq017PublicYaw/,
    'attached yaw alignment must use the shared bounded public A/D tap');
  assert.match(route,
    /function decidePq017AttachedStandoffRadialControl[\s\S]*derivePq017StandoffHeadingTolerance\([\s\S]*crossTrack[\s\S]*projectedLateralBurn > corridorHalfWidth \* 0\.75/,
    'fixed-plan pulses must recompute the remaining lateral budget after live cross-track consumption');
  assert.match(
    route,
    /function decidePq017AttachedStandoffRadialControl[\s\S]*yawDelta[\s\S]*Math\.PI \* 2[\s\S]*sampledYawRate[\s\S]*stableYawSamples/,
    'W permission must measure normalized yaw change on distinct fixed ticks and retain confirmation state',
  );
  assert.match(
    route,
    /player:\s*\{[\s\S]*angVel:\s*Number\(player\.angVel\) \|\| 0/,
    'the live public-route geometry must expose finite player yaw velocity',
  );
  assert.match(radialController,
    /geometry\.obstacles[\s\S]*evaluatePq017StandoffPreflight[\s\S]*control\.action === 'pulse-outward'/,
    'the controller must refresh live obstacles and the remaining full corridor before every W pulse');
  assert.match(radialController,
    /preflight\.action === 'wait-traffic'[\s\S]*releaseFlightKeys\(page\)[\s\S]*preparePq017AlignedStandoffPlan/,
    'dynamic reentry must release W/A/D and return to the bounded neutral wait/replan');
  assert.match(radialController,
    /control\.action === 'pulse-outward'[\s\S]*keyboard\.up\('KeyA'\)[\s\S]*keyboard\.up\('KeyD'\)[\s\S]*keyboard\.up\('KeyS'\)[\s\S]*keyboard\.down\('KeyW'\)/,
    'the only translation pulse must be W with turning and reverse controls released');
  const radialAlignDriver = radialController.match(
    /if \(control\.action === 'align'\) \{[\s\S]*?\n      \}/,
  )?.[0] || '';
  assert.match(radialAlignDriver,
    /tapPq017PublicYaw/,
    'A/D alignment must be a bounded fixed-tick tap followed by neutral observation');
  assert.match(radialController,
    /radialReplans[\s\S]*maximumRadialRetreat \* 0\.75[\s\S]*preparePq017AlignedStandoffPlan/,
    'pre-W neutral drift must trigger only a bounded full replan before the hard retreat gate');
  assert.doesNotMatch(radialController, /flyToPoint|brakePlayerBelow|pulsePq017Brake/,
    'the attached radial controller must never delegate its signed corridor brake to generic guidance');
  assert.match(radialController,
    /control\.action === 'brake-outward'[\s\S]*pulsePq017AttachedRadialBrake/,
    'the only attached reverse-thrust path must be the specialized signed-radial brake');
  const radialBrake = route.match(
    /async function pulsePq017AttachedRadialBrake[\s\S]*?\n}\r?\n\r?\nasync function flyPq017AttachedStandoffRadial/,
  )?.[0] || '';
  assert.match(radialBrake,
    /releaseFlightKeys\(page\)[\s\S]*keyboard\.down\('KeyS'\)[\s\S]*try[\s\S]*waitForFunction[\s\S]*radialSpeed <= targetRadialSpeed[\s\S]*radialSpeed <= 0[\s\S]*tickDelta >= 12[\s\S]*finally[\s\S]*keyboard\.up\('KeyS'\)/,
    'the signed radial brake must release at settled speed, reversal, or twelve observed ticks');
  assert.equal(radialBrake.match(/keyboard\.down\('KeyS'\)/g)?.length, 1,
    'the attached standoff may expose exactly one guarded public KeyS-down branch');
  for (const receiptGate of [
    /automaticBreakAllowed/,
    /breakEvents/,
    /impactEvents/,
    /targetMatches/,
  ]) {
    assert.match(radialBrake, receiptGate,
      'the immediate brake receipt must prove the Massline and impact gates remained intact');
  }
  assert.match(radialController,
    /impactEvents[\s\S]*baselineImpactEvents/,
    'the standoff must reject any player-to-World-Site impact receipt, not just sampled overlap');
  assert.match(radialController,
    /controlTrace[\s\S]*tick:\s*geometry\.tick[\s\S]*rot:\s*geometry\.player\.rot[\s\S]*angVel:\s*geometry\.player\.angVel[\s\S]*sampledYawRate:\s*control\.sampledYawRate[\s\S]*stableYawSamples:\s*control\.stableYawSamples[\s\S]*yawNeutralArmed:\s*control\.yawNeutralArmed[\s\S]*radialDistance:\s*control\.radialDistance[\s\S]*radialSpeed:\s*control\.radialSpeed[\s\S]*headingError:\s*control\.headingError/,
    'failure diagnostics must retain measured yaw stability and the actual radial-control trace');
  assert.match(manualRelease,
    /automaticBreakAllowed[\s\S]*keyboard\.down\('Space'\)[\s\S]*waitForFixedTicks\(page, 1\)[\s\S]*keyboard\.up\('Space'\)/,
    'release must be an observed public Space input edge on a nonbreaking Massline');
  assert.match(manualRelease, /payloadAlive/,
    'manual release must retain the physical payload');
  assert.match(manualRelease,
    /releaseEvents !== 1 \|\| after\.releaseRatedEvents !== 1[\s\S]*after\.breakEvents !== 0/,
    'manual release must prove one release receipt and no break receipt');
  assert.equal(manualRelease.match(/keyboard\.down\('Space'\)/g)?.length, 1,
    'the authorized manual release must make exactly one fresh Space tap');
  const releasedDetour = route.match(
    /async function flyPq017ReleasedReceiverDetour[\s\S]*?\n}\r?\n\r?\nasync function flyPq017ReleasedLaunchGateConvergence/,
  )?.[0] || '';
  const releasedSettlement = route.match(
    /async function waitForPq017ReleasedPayloadSettlement[\s\S]*?\n}\r?\n\r?\nasync function flyPq017ReleasedReceiverDetour/,
  )?.[0] || '';
  const releasedPreparation = route.match(
    /async function preparePq017ReleasedReceiverCrossing[\s\S]*?\n}\r?\n\r?\nasync function deliverPayloadToSelectedReceiver/,
  )?.[0] || '';
  assert.match(releasedDetour, /requireTether:\s*false/,
    'every long-route waypoint must prove the Massline remains inactive');
  assert.match(releasedSettlement,
    /auditPq017ReleasedRouteImpactReceipt[\s\S]*baselineImpactEvents/,
    'free-payload settlement must reject any new player-to-site impact before planning');
  assert.match(releasedDetour,
    /auditPq017ReleasedRouteImpactReceipt[\s\S]*baselineImpactEvents/,
    'every unlatched detour leg must retain the scoped player-to-site impact gate');
  assert.match(releasedPreparation,
    /baselineImpactEvents[\s\S]*waitForPq017ReleasedPayloadSettlement[\s\S]*flyPq017ReleasedReceiverDetour/,
    'one preparation-scoped impact baseline must span settlement, planning, and detour');
  const releasedLocalRunner = route.match(
    /async function flyPq017ReleasedLaunchGateConvergence[\s\S]*?\n}\r?\n\r?\nasync function preparePq017ReleasedReceiverCrossing/,
  )?.[0] || '';
  assert.match(releasedLocalRunner,
    /await releaseFlightKeys\(page,\s*\{ preserveSiteAction: true \}\);\s*await waitForFixedTicks\(page,\s*1\);\s*for \(let correction/,
    'local correction must become neutral before the observation used for its first plan');
  assert.match(releasedLocalRunner,
    /planPq017ReleasedLaunchGateCorrection[\s\S]*inputAuthorized[\s\S]*pq017PublicKeysForDecision[\s\S]*waitForFixedTicks\(page,\s*1\)[\s\S]*evaluatePq017ReleasedLaunchAppliedBatch[\s\S]*precisionBrakeStop[\s\S]*precisionBrakeCorridor[\s\S]*precisionBrakeHold/,
    'the route-only controller must validate ordinary batches and sustained Digit0 against their owning proofs');
  assert.doesNotMatch(releasedLocalRunner, /tickDelta > 4/,
    'a sustained precision-brake level must not be misclassified as a callback-bounded pulse');
  const releasedAuthorizedTransition = releasedLocalRunner.match(
    /const keys = pq017PublicKeysForDecision[\s\S]*?if \(requestedCode\) await page\.keyboard\.down\(requestedCode\);/,
  )?.[0] || '';
  assert.doesNotMatch(releasedAuthorizedTransition, /releaseFlightKeys/,
    'no multi-event neutralization may occur after observation and before the authorized action');
  assert.match(releasedAuthorizedTransition,
    /requestedCodes\.length > 1[\s\S]*const requestedCode = requestedCodes\[0\] \|\| null;[\s\S]*if \(requestedCode\) await page\.keyboard\.down\(requestedCode\)/,
    'the post-plan public transition must be exactly zero or one key-down event');
  assert.doesNotMatch(releasedLocalRunner,
    /flyToPoint|brakePq017ReleasedLaunchGateSafely|pulsePq017Brake/,
    'released terminal convergence must not re-enter legacy waypoint or pulse controllers');
  assert.match(releasedPreparation,
    /flyPq017ReleasedLaunchGateConvergence[\s\S]*finalPlayerSpeed <= PQ017_RELEASED_LAUNCH_READY_SPEED[\s\S]*return diagnostic/,
    'the far-side plan must be recomputed from a low-energy actual position before latch');
  assert.match(releasedDetour,
    /brakePlayerBelow\(\s*page,\s*PQ017_RELEASED_DETOUR_SETTLED_SPEED,\s*120,\s*\)/,
    'the unlatched detour must enter its route from the ordinary 0.5-WU/s settled bound');
  assert.doesNotMatch(releasedDetour, /PQ017_RELEASED_LAUNCH_READY_SPEED/,
    'the detour must hand its actual terminal state to the local launch controller');
  assert.doesNotMatch(releasedDetour, /keyboard\.down\('KeyB'\)/,
    'contextual receiver work must remain off during untethered staging');
  assert.match(releasedDetour,
    /payloadAnchor[\s\S]*PQ017_ROUTE_PLANNER_MARGIN - PQ017_ROUTE_MINIMUM_PHYSICAL_MARGIN[\s\S]*released-payload-left-route-proof/,
    'the entire detour must retain a payload-drift anchor inside the route proof margin');
  assert.match(releasedDetour,
    /Math\.min\(\s*crossingPlan\.maximumTowTimeoutMs,\s*Math\.max\(timeoutMs, crossingPlan\.executionTowTimeoutMs\)/,
    'the released route deadline must be clamped inside its measured finite timeout contract');
  assert.match(receiverDelivery,
    /maximumRouteLength:\s*PQ017_RECEIVER_SHORT_CROSSING_MAX_ROUTE/,
    'the attached route must be a bounded short crossing, never another ring detour');
  assert.match(farSideRelatchAudit,
    /selectedComponentId !== 'receiver_collar'[\s\S]*targetMatches !== true[\s\S]*automaticBreakAllowed === true[\s\S]*payloadDrift[\s\S]*payloadSpeed/,
    'the relatch must prove selection, target ownership, nonbreaking authority, and stable live geometry');
  assert.match(farSideRelatchAudit,
    /restLengthDelta[\s\S]*rest-length-match/,
    'the new rest length must match the physical line observed at relatch');
  assert.match(farSideRelatchAudit,
    /shipRoute\?\.direct !== true[\s\S]*waypoints\?\.length !== 1[\s\S]*playerCrossTrack[\s\S]*predictedMiss[\s\S]*strictDeliveryRadius/,
    'the attached phase must be one tightly aligned direct pull with a valid absolute equilibrium');
  assert.match(receiverDelivery,
    /evaluatePq017FarSideRelatch\(\{[\s\S]*serviceGeometry[\s\S]*crossingPlan[\s\S]*latchTick: latchReceipt\?\.tick/,
    'delivery must feed the distinct live receipt into the centralized relatch audit');
  assert.match(receiverDelivery,
    /towToPointUntilOperation\(\s*page,\s*crossingPlan\.target[\s\S]*?settledRadius: crossingPlan\.arrivalRadius[\s\S]*?maxSettledSpeed: 4[\s\S]*?maxApproachSpeed: crossingPlan\.maxServiceSpeed/,
    'physical delivery must traverse only the freshly recomputed short pull');
  assert.match(receiverDelivery,
    /Math\.min\(\s*crossingPlan\.maximumTowTimeoutMs,\s*Math\.max\(timeoutMs, crossingPlan\.executionTowTimeoutMs\)/,
    'the physical route must receive its bounded length-derived execution budget');
  assert.match(route, /maxServiceSpeed:\s*6/,
    'service towing must preserve stopping room inside the live collision-delivery interval');
  assert.match(receiverDelivery, /crossingPlan,/,
    'receiver delivery must pass the collision-planned payload crossing route');
  assert.match(route, /decidePq017ReceiverTowTarget/);
  assert.doesNotMatch(receiverDelivery,
    /tether\.(?:restLength|lineControl|lineLengthRate|reeling|payingOut)\s*=/,
    'adaptive slack take-up must use flight controls without mutating Massline state');
  const receiverTowRoute = route.match(
    /async function towToPointUntilOperation[\s\S]*?\n}\r?\n\r?\nasync function brakePlayerBelow/,
  )?.[0] || '';
  assert.equal(
    receiverTowRoute.match(
      /releaseFlightKeys\(page,\s*\{\s*preserveSiteAction:\s*true\s*\}\)/g,
    )?.length,
    3,
    'every tow waypoint advance, settlement, and cleanup path must preserve the held receiver action',
  );
  assert.doesNotMatch(receiverTowRoute, /releaseFlightKeys\(page\);/,
    'the receiver tow must never use cleanup that releases B');
  assert.match(route, /preserveSiteAction\s*=\s*false[\s\S]*key === 'KeyB'/,
    'ordinary cleanup must still release B unless the physical tow explicitly preserves it');
  assert.match(route,
    /crossing-pull-tether-target-mismatch/,
    'far-side commitment must fail if the live Massline no longer owns the payload');
  assert.match(route,
    /crossing-pull-requires-nonbreaking-massline/,
    'far-side commitment must require the payload line to remain nonbreaking');
  assert.match(route,
    /crossing-pull-left-audited-payload-corridor/,
    'the live payload must remain inside the freshly audited crossing chord');
  assert.match(route,
    /adaptiveTarget\.target\?\.phase !== 'launch'[\s\S]*crossingPlan\.ringApproachSpeed/,
    'collision-proven crossing rings may use 16 while the exact final pull remains at service speed');
  assert.match(route, /payloadWorldRecordId:\s*PQ017_PAYLOAD_WORLD_ID/,
    'the tow target must update from live payload-to-receiver geometry');
  assert.match(route,
    /payloadDistance: payload\?\.pos && receiver\?\.pos[\s\S]*?Math\.hypot\(receiver\.pos\.x - payload\.pos\.x/,
    'live payload distance must remain an observed physical-delivery diagnostic');
  assert.match(route,
    /lineDistance: payload\?\.pos[\s\S]*?Math\.hypot\(player\.pos\.x - payload\.pos\.x/,
    'slack control must separately observe the actual player-to-payload line distance');
  assert.match(route, /assertNoUnexpectedWorldSiteFailure\(page, 'settle_field_coil'\)/,
    'payload delivery must reject any collateral World Site rollback immediately');
  assert.match(route, /attempt < 2/,
    'a missed physical approach may restage only within a hard attempt cap');
  assert.match(
    route,
    /return ramWorldRecord\(page, worldRecordId, timeoutMs, \{[\s\S]*?attempt: attempt \+ 1,[\s\S]*?siteId,[\s\S]*?componentId,[\s\S]*?rootWorldRecordId,[\s\S]*?standOff,[\s\S]*?expectedPreImpactStatus,[\s\S]*?\}\)/,
    'bounded impact retry must preserve the generalized site/component/root identity and status gate',
  );
  assert.match(route, /planPq017ImpactStaging/,
    'impact staging must deterministically plan the root-outward collision radial');
  assert.match(route, /keyboard\[control\.reverse \? 'down' : 'up'\]\('KeyS'\)/);
  assert.match(route, /samples:\s*new Array\(sampleLimit\)/);
  assert.doesNotMatch(route, /frameWindow\.samples\.push/,
    'performance instrumentation must not grow or splice an array every frame');
  assert.doesNotMatch(route, /leftDistance|1_050|reveal radius/,
    'distance-only flight is not a World Site lifecycle proof');

  assert.match(browser, /runPq017WorldSitePublicRoute/);
  assert.match(browser, /acquireVisualProbeServer/);
  assert.match(browser, /createCanonicalUrlTracker/);
  assert.match(browser, /closeOwnedResources/);
  assert.match(browser, /headless:\s*false/);
  for (const flag of [
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
  ]) {
    assert.match(browser, new RegExp(flag));
    assert.match(electron, new RegExp(flag));
  }
  assert.match(browser, /performance:\s*routeResult\.performance/);
  assert.match(browser, /lifecycle:\s*routeResult\.lifecycle/);
  assert.match(browser, /performance:\s*primaryError\?\.routePerformance/);
  assert.match(browser, /failureSnapshot:\s*primaryError\?\.routeFailureSnapshot/);
  assert.match(browser, /prunePq017EvidenceHistory/);

  assert.match(electron, /runPq017WorldSitePublicRoute/);
  assert.match(electron, /createIsolatedElectronLaunch/);
  assert.match(electron, /createElectronCanonicalUrlTracker/);
  assert.match(electron, /closeOwnedElectronRuntime/);
  assert.match(electron, /isolatedLaunch\.cleanup\(\{ runtimeClosed: true \}\)/);
  assert.match(electron, /performance:\s*routeResult\.performance/);
  assert.match(electron, /lifecycle:\s*routeResult\.lifecycle/);
  assert.match(electron, /performance:\s*primaryError\?\.routePerformance/);
  assert.match(electron, /failureSnapshot:\s*primaryError\?\.routeFailureSnapshot/);
  assert.match(electron, /prunePq017EvidenceHistory/);
  assert.match(electron, /timeBudgetScale:\s*3/,
    'cold Electron receives bounded wall-clock headroom without weaker gameplay criteria');
  assert.match(electron, /SPACEFACE_PQ017_SYSTEM_TIMING/,
    'Electron route must expose opt-in per-system attribution without taxing release acceptance');

  const stripped = [route, browser, electron].join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[\n\r])\s*\/\/.*$/gm, '$1');
  const forbidden = [
    /bus\.emit\(\s*['"]game:new/,
    /bus\.emit\(\s*['"]worldSite:/,
    /\.state\.[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\s*=(?!=)/,
    /server\.js/,
    /createServer\s*\(/,
    /freePort\s*\(/,
    /headless:\s*true/,
    /keyboard\.press\(['"]F9['"]\)/,
  ];
  for (const pattern of forbidden) assert.doesNotMatch(stripped, pattern);

  assert.equal(pkg.scripts['check:pq017:world-site:fast'],
    'node scripts/check-pq017-world-site-fast.mjs');
  assert.equal(pkg.scripts['check:pq017:world-site:browser'],
    'npm run check:pq017:world-site:fast && node scripts/probe-pq017-world-site.mjs --acceptance');
  assert.equal(pkg.scripts['check:pq017:world-site:electron'],
    'npm run check:pq017:world-site:fast && node scripts/probe-pq017-world-site-electron.mjs --acceptance');
  assert.equal(pkg.scripts['check:pq017:world-site:public-route'],
    'npm run check:pq017:world-site:browser && npm run check:pq017:world-site:electron');
});

test('PQ-017 powered evidence capture cannot contaminate the active gameplay performance window', async () => {
  const route = await source('scripts/lib/pq017WorldSitePublicRoute.mjs');
  const activeWindow = route.match(
    /await startPerformanceWindow\(page, 'active-site-operations', 'operation:repair_relay_core'\);([\s\S]*?)phase = 'massline-delivery';/,
  )?.[1] || '';
  assert(activeWindow, 'active site-operation performance window must remain identifiable');
  assert.equal(
    (activeWindow.match(/startPerformanceWindow\(page, 'active-site-operations'/g) || []).length,
    0,
    'the active gameplay interval must not restart after its one opening boundary',
  );
  assert.equal(
    (activeWindow.match(/finishPerformanceWindow\(page\)/g) || []).length,
    1,
    'the four operations must share exactly one closing boundary',
  );

  const orderedSeams = [
    'for (const [componentId, operationId] of OPERATIONS)',
    'await setPerformanceWindowPhase(page, `operation:${operationId}`)',
    'await completeWorldSiteOperation(page, componentId, operationId,',
    'await setPerformanceWindowPhase(page, `wait:${operationId}`)',
    'await page.waitForTimeout(80)',
    'await assertNoUnexpectedWorldSiteFailure(page, operationId)',
    "await setPerformanceWindowPhase(page, 'finalization:opened')",
    "await waitForSite(page, 'opened')",
    'performance.activeOperation = await finishPerformanceWindow(page)',
    'auditPerformanceWindow(performance, performance.activeOperation)',
    "await capture('powered')",
    "await capture('opened')",
  ];
  let priorIndex = -1;
  for (const seam of orderedSeams) {
    const index = activeWindow.indexOf(seam);
    assert(index > priorIndex, `${seam} must retain its active-window order`);
    priorIndex = index;
  }

  const operations = route.match(/const OPERATIONS = Object\.freeze\(\[([\s\S]*?)\]\);/)?.[1] || '';
  assert.deepEqual(
    [...operations.matchAll(/\['([^']+)', '([^']+)'\]/g)]
      .map((match) => [match[1], match[2]]),
    [
      ['relay_core', 'repair_relay_core'],
      ['safety_coupler', 'recover_safety_coupler'],
      ['cargo_brace', 'cut_cargo_brace'],
      ['payload_cradle', 'unseal_payload_cradle'],
    ],
    'the one active performance loop must retain all four canonical player operations',
  );
  assert.match(route, /frameWindow\.phaseTags\[frameWindow\.head\]\s*=\s*frameWindow\.currentPhase/,
    'each bounded rAF sample must retain its current canonical phase tag');
  assert.match(route, /phaseAttribution:\s*summarizeBoundedFramePhases\(raw\.samples,\s*raw\.phaseTags\)/,
    'evidence must expose bounded per-phase summaries rather than a raw phase trace');
});

test('PQ-017 released receiver detour uses a low-energy exact arrival without slowing clear rings', async () => {
  const route = await source('scripts/lib/pq017WorldSitePublicRoute.mjs');
  const receiverStage = route.match(
    /async function flyPq017ReleasedReceiverDetour[\s\S]*?\n}\r?\n\r?\nasync function preparePq017ReleasedReceiverCrossing/,
  )?.[0] || '';

  assert.match(receiverStage,
    /maxApproachSpeed:\s*waypoint\.phase === 'launch'\s*\?\s*crossingPlan\.maxServiceSpeed\s*:\s*16/,
    'the exact launch leg must execute the collision plan service-speed contract');
  assert.match(receiverStage,
    /maxSettledSpeed:\s*waypoint\.phase === 'launch'\s*\?\s*crossingPlan\.maxServiceSpeed\s*:\s*6/,
    'arrival settlement and approach must share the geometry-derived service-speed contract');
  assert.match(receiverStage,
    /Math\.max\(30_000, deadline - Date\.now\(\)\)/,
    'every untethered collision leg must retain a bounded base budget');
  assert.match(receiverStage,
    /passThrough:\s*waypoint\.passThrough\?\.safe === true/,
    'intermediate tow ring gates must retain their collision-proven pass-through route');

  const exactLaunch = decidePq017SettledArrivalControl({
    distance: 144,
    speed: 9,
    closingSpeed: 9,
    headingError: 0,
    velocityHeadingError: 0,
    directStoppingDistance: 3.375,
  }, {
    settledRadius: 6,
    maxSettledSpeed: 6,
    brakeAccel: 12,
    maxApproachSpeed: 6,
  });
  assert.equal(exactLaunch.approachSpeedCap, 6);
  assert.equal(exactLaunch.action, 'brake',
    'the exact launch leg must shed speed before a tethered nine-unit approach can build energy');
  assert.equal(exactLaunch.reason, 'dynamic-speed-cap');

  const clearRing = decidePq017SettledArrivalControl({
    distance: 144,
    speed: 9,
    closingSpeed: 9,
    headingError: 0,
    velocityHeadingError: 0,
    directStoppingDistance: 3.375,
  }, {
    settledRadius: 16,
    maxSettledSpeed: 6,
    brakeAccel: 12,
    maxApproachSpeed: 16,
  });
  assert.equal(clearRing.action, 'approach',
    'the collision-proven outer ring must retain its higher traversal envelope');
  assert.equal(clearRing.thrust, true);

  const twelfthLaunch = {
    tick: 7960,
    distance: 19.009796460306564,
    speed: 9.074307133338792,
    closingSpeed: 4.663630627189943,
    headingError: -0.011880929722802636,
    velocityHeadingError: -1.0429081596599388,
    directStoppingDistance: 1.4002954249131772,
  };
  const twelfthDecision = decidePq017SettledArrivalControl(twelfthLaunch, {
    settledRadius: 6,
    maxSettledSpeed: 6,
    brakeAccel: 12,
    maxApproachSpeed: 8,
  });
  assert.equal(twelfthDecision.reason, 'dynamic-speed-cap');
  assert.deepEqual(decidePq017WaypointProgressExtension(
    twelfthLaunch,
    twelfthDecision,
    {
      extensions: 0,
      epochStartDistance: 154.8367126767493,
      epochBestDistance: 19.009796460306564,
      lastProgressAt: 29_900,
      now: 30_000,
    },
    { extensionMs: 15_000, maxExtensions: 2, staleAfterMs: 5_000 },
  ), {
    extend: false,
    reason: 'trajectory-not-progressing',
    extensionMs: 0,
  }, 'a healthy low-energy brake must use its base budget, not weaken extension predicates');
});

test('PQ-017 impact staging chooses an exact outward radial point', () => {
  const point = computePq017OutwardStagingPoint({ x: 3, z: 4 }, { x: 0, z: 0 }, 190);
  assert.deepEqual(point, { x: 114, z: 152 });
  assert.equal(Math.hypot(point.x, point.z), 190);

  assert.deepEqual(
    computePq017OutwardStagingPoint({ x: 10, z: -5 }, { x: 10, z: -5 }, 190),
    { x: 200, z: -5 },
    'coincident positions must use a deterministic positive-X fallback',
  );
  assert.equal(computePq017OutwardStagingPoint({ x: 0, z: 0 }, { x: 0, z: 0 }, -1), null);
  assert.equal(computePq017OutwardStagingPoint(null, { x: 0, z: 0 }, 190), null);

  const clear = choosePq017ClearStagingPoint(
    { x: 100, z: 0 }, { x: 0, z: 0 }, 190,
    [{ x: 145, z: 0, radius: 35 }], 10,
  );
  assert.notEqual(clear.angleOffset, 0,
    'a blocking asteroid must move staging to another deterministic radial');
  assert(Math.abs(Math.hypot(clear.point.x, clear.point.z) - 190) < 1e-9,
    'clear staging must preserve the exact requested run-up distance');
  assert(clear.clearance > -63,
    'the chosen radial must improve on the directly blocked path');
});

test('PQ-017 receiver tow target is exactly 80 WU down the receiver-root outward radial', () => {
  const receiver = { x: 765.9113066059158, z: -617.9404571383049 };
  const root = { x: 760, z: -620 };
  const target = planPq017ReceiverOutwardTarget(receiver, root, 80);

  assert(target);
  const receiverRadialX = receiver.x - root.x;
  const receiverRadialZ = receiver.z - root.z;
  const targetRadialX = target.x - receiver.x;
  const targetRadialZ = target.z - receiver.z;
  assert(Math.abs(Math.hypot(targetRadialX, targetRadialZ) - 80) < 1e-9,
    'the tow target must preserve the exact 80-WU receiver stand-off');
  assert(Math.abs(receiverRadialX * targetRadialZ - receiverRadialZ * targetRadialX) < 1e-9,
    'the tow target must stay collinear with the receiver-root radial');
  assert(receiverRadialX * targetRadialX + receiverRadialZ * targetRadialZ > 0,
    'the tow target must extend away from the root, not back through the site');
  assert.equal(target.lead, 80);
  assert.equal(planPq017ReceiverOutwardTarget(receiver, receiver, 80), null);
  assert.equal(planPq017ReceiverOutwardTarget(receiver, root, 0), null);
});

test('PQ-017 receiver service lead intersects live collision and physical-delivery geometry', () => {
  const player = { x: 839.065673828125, z: -592.365234375 };
  const receiver = { x: 767.4486542780224, z: -617.4125661199455 };
  const root = { x: 760, z: -620 };
  const obstacles = [
    { entityId: 326, worldRecordId: 'world_site_helios_relay/root',
      x: 760, z: -620, radius: 18 },
    { entityId: 293, worldRecordId: 'world_site_helios_relay/component/relay_core',
      x: 759.2914604576528, z: -620.2829997068661, radius: 2.16 },
    { entityId: 321, worldRecordId: 'world_site_helios_relay/component/safety_coupler',
      x: 762.367099561415, z: -619.2483770203719, radius: 1.08 },
  ];
  const plan = planPq017ReceiverServiceTarget({
    playerPosition: player,
    receiverPosition: receiver,
    rootPosition: root,
    stageLead: 80,
    tetherRestLength: 21.395658630932278,
    payloadRadius: 6,
    receiverRadius: 1.8,
    playerRadius: 14,
    obstacles,
    maxServiceSpeed: 6,
    brakeAccel: 12,
    clearanceMargin: 1,
    overlapMargin: 0.5,
  });

  assert.equal(plan.safe, true);
  assert.equal(plan.maxServiceSpeed, 6);
  assert.equal(plan.stoppingDistance, 1.5);
  assert.equal(plan.closestConstraint.worldRecordId, 'world_site_helios_relay/root');
  assert.equal(plan.serviceChord.safe, true);
  assert.equal(plan.takeUpChord.safe, true);
  assert(plan.target.lead < 80 && plan.target.lead > 0,
    'service towing must move inward from the collision-safe staging lead');
  assert(plan.takeUpTarget.lead > plan.target.lead
    && plan.takeUpTarget.lead < plan.corridorLeadMax,
  'slack take-up must use a distinct outer target strictly inside the proven corridor');
  assert(plan.takeUpTarget.lead - plan.takeUpArrivalRadius > plan.corridorLeadMin
    && plan.takeUpTarget.lead + plan.takeUpArrivalRadius < plan.corridorLeadMax,
  'the complete take-up acceptance envelope must remain strictly inside the proven interval');
  assert(Math.abs(plan.target.lead - 21.395658630932278) <= 6 + 1.8 - 0.5,
    'the target lead must put a taut physical payload inside the receiver overlap radius');
  for (const lead of [
    plan.target.lead - plan.arrivalRadius,
    plan.target.lead + plan.arrivalRadius,
  ]) {
    const payloadDistance = Math.abs(lead - 21.395658630932278);
    assert(payloadDistance >= 0 && payloadDistance < plan.deliveryRadius,
      'both ends of the accepted service corridor must guarantee physical payload overlap');
  }
  assert(plan.target.lead - plan.arrivalRadius - plan.stoppingDistance
    > plan.closestConstraint.exitLead,
  'the whole accepted service corridor plus worst-case braking must clear the root/component hull');
  assert(plan.target.lead - plan.arrivalRadius > plan.deliveryLeadMin,
    'the service corridor must remain above the lower tether-overlap lead');
  assert(plan.target.lead + plan.arrivalRadius < plan.deliveryLeadMax,
    'the whole accepted service corridor must remain inside physical delivery overlap');

  const receiverOnly = planPq017ReceiverServiceTarget({
    playerPosition: player,
    receiverPosition: receiver,
    rootPosition: root,
    stageLead: 80,
    tetherRestLength: 21.395658630932278,
    payloadRadius: 6,
    receiverRadius: 1.8,
    playerRadius: 14,
    obstacles: [],
    maxServiceSpeed: 6,
    brakeAccel: 12,
    clearanceMargin: 1,
    overlapMargin: 0.5,
  });
  assert.equal(receiverOnly.safe, true);
  assert.equal(receiverOnly.closestConstraint.type, 'receiver');
  assert(receiverOnly.target.lead - receiverOnly.arrivalRadius
    - receiverOnly.stoppingDistance > 14 + 1.8 + 1,
  'receiver clearance must be proven even though the target is excluded from obstacle bodies');

  const radialLength = Math.hypot(receiver.x - root.x, receiver.z - root.z);
  const farObstaclePlan = planPq017ReceiverServiceTarget({
    playerPosition: player,
    receiverPosition: receiver,
    rootPosition: root,
    stageLead: 80,
    tetherRestLength: 21.395658630932278,
    payloadRadius: 6,
    receiverRadius: 1.8,
    playerRadius: 14,
    obstacles: [...obstacles, {
      entityId: 999,
      worldRecordId: 'unrelated-outward-obstacle',
      x: receiver.x + (receiver.x - root.x) / radialLength * 200,
      z: receiver.z + (receiver.z - root.z) / radialLength * 200,
      radius: 10,
    }],
    maxServiceSpeed: 6,
    brakeAccel: 12,
    clearanceMargin: 1,
    overlapMargin: 0.5,
  });
  assert.equal(farObstaclePlan.safe, true,
    'an obstacle wholly beyond the staging point must not empty the traversed service interval');
  assert.equal(farObstaclePlan.target.lead, plan.target.lead);

  const impossible = planPq017ReceiverServiceTarget({
    playerPosition: player,
    receiverPosition: receiver,
    rootPosition: root,
    stageLead: 80,
    tetherRestLength: 21.395658630932278,
    payloadRadius: 6,
    receiverRadius: 1.8,
    playerRadius: 20,
    obstacles,
    maxServiceSpeed: 6,
    brakeAccel: 12,
    clearanceMargin: 1,
    overlapMargin: 0.5,
  });
  assert.equal(impossible.safe, false,
    'the planner must fail closed when collision clearance and physical overlap do not intersect');

  const offRayBlocked = planPq017ReceiverServiceTarget({
    playerPosition: { x: 80, z: 6 },
    receiverPosition: { x: 0, z: 0 },
    rootPosition: { x: -10, z: 0 },
    stageLead: 80,
    tetherRestLength: 20,
    payloadRadius: 10,
    receiverRadius: 2,
    playerRadius: 1,
    obstacles: [{
      entityId: 77,
      worldRecordId: 'off-ray-chord-blocker',
      x: 50,
      z: 3,
      radius: 1,
    }],
    maxServiceSpeed: 4,
    brakeAccel: 12,
    clearanceMargin: 1,
    overlapMargin: 0.5,
  });
  assert.equal(offRayBlocked.safe, false,
    'a clear ideal radial must not authorize an obstructed live post-stage chord');
  assert.equal(offRayBlocked.reason, 'actual-service-segment-blocked');
  assert.equal(offRayBlocked.blockingConstraint.worldRecordId, 'off-ray-chord-blocker');
});

test('PQ-017 receiver service derives a bounded live stage lead without inventing tow room', () => {
  const receiver = { x: 767.4486542780224, z: -617.4125661199455 };
  const root = { x: 760, z: -620 };
  const capturedPlayer = { x: 845.5245971679688, z: -590.2329711914062 };
  const common = {
    receiverPosition: receiver,
    rootPosition: root,
    stageLead: 80,
    stageArrivalRadius: 6,
    tetherRestLength: 87.3688869957437,
    payloadRadius: 6,
    receiverRadius: 1.8,
    playerRadius: 14,
    obstacles: [{
      entityId: 326,
      worldRecordId: 'world_site_helios_relay/root',
      type: 'wreck',
      x: 760,
      z: -620,
      radius: 18,
    }],
    maxServiceSpeed: 6,
    brakeAccel: 12,
    clearanceMargin: 1,
    overlapMargin: 0.5,
  };
  const captured = planPq017ReceiverServiceTarget({
    ...common,
    playerPosition: capturedPlayer,
  });

  assert.equal(captured.safe, true,
    'the eleventh Browser stage must use its collision-audited live outward projection');
  assert(captured.liveStageLead > 80 && captured.liveStageLead < 86);
  assert(captured.liveStageLateralOffset < 0.1);
  assert(captured.liveStageError < 6);
  assert.equal(captured.nominalStageLead, 80,
    'live feasibility must not move the exact nominal staging target');
  assert.equal(captured.deliveryLeadMin, 80.0688869957437);
  assert.equal(captured.deliveryLeadMax, captured.liveStageLead);
  assert(captured.target.lead > 80 && captured.target.lead < captured.liveStageLead);
  assert.equal(captured.serviceChord.safe, true,
    'the live projection still requires the actual start-to-service collision proof');
  assert.equal(captured.takeUpChord.safe, true);

  const inward = planPq017ReceiverServiceTarget({
    ...common,
    receiverPosition: { x: 0, z: 0 },
    rootPosition: { x: -10, z: 0 },
    playerPosition: { x: 79, z: 0 },
    obstacles: [],
  });
  assert.equal(inward.safe, false,
    'an inward live stage must not borrow the nominal 80-WU target to fabricate tow room');
  assert.equal(inward.reason, 'collision-delivery-interval-empty');
  assert.equal(inward.liveStageLead, 79);
  assert.equal(inward.deliveryLeadMax, 79);

  for (const playerPosition of [
    { x: 86.01, z: 0 },
    { x: 80, z: 6.01 },
    { x: -1, z: 0 },
  ]) {
    const invalid = planPq017ReceiverServiceTarget({
      ...common,
      receiverPosition: { x: 0, z: 0 },
      rootPosition: { x: -10, z: 0 },
      playerPosition,
      obstacles: [],
    });
    assert.equal(invalid.safe, false);
    assert.equal(invalid.reason, 'live-stage-envelope-invalid',
      'unbounded, off-ray, or inside-receiver positions must fail before service authorization');
    assert.equal(invalid.target, null);
  }
});

test('PQ-017 receiver tow adaptively takes up slack before service convergence', () => {
  const servicePlan = planPq017ReceiverServiceTarget({
    playerPosition: { x: 839.065673828125, z: -592.365234375 },
    receiverPosition: { x: 767.4486542780224, z: -617.4125661199455 },
    rootPosition: { x: 760, z: -620 },
    stageLead: 80,
    tetherRestLength: 20.641028529246686,
    payloadRadius: 6,
    receiverRadius: 1.8,
    playerRadius: 14,
    obstacles: [
      { entityId: 326, worldRecordId: 'world_site_helios_relay/root',
        x: 760, z: -620, radius: 18 },
    ],
    maxServiceSpeed: 6,
    brakeAccel: 12,
    clearanceMargin: 1,
    overlapMargin: 0.5,
  });
  assert.equal(servicePlan.safe, true);
  const exactSlack = {
    tick: 100,
    payloadDistance: 22.409401380290266,
    lineDistance: 20,
    playerSpeed: 4.279706801976459,
    takeUpDistance: 4.22560390683723,
    tetherTargetMatches: true,
    tether: {
      active: true,
      restLength: 20.641028529246686,
      phase: 'slack',
      strain: 0,
      load: 0,
      lineControl: false,
      automaticBreakAllowed: false,
    },
  };
  const takeUp = decidePq017ReceiverTowTarget(
    exactSlack,
    servicePlan,
    {},
    { maxTakeUpCycles: 6, settledSlackSamples: 2 },
  );
  assert.equal(takeUp.safe, true);
  assert.equal(takeUp.reason, 'tether-slack-take-up');
  assert.equal(takeUp.takeUpActive, true);
  assert.equal(takeUp.takeUpCycles, 1);
  assert.deepEqual(takeUp.target, servicePlan.takeUpTarget,
    'the ninth exact slack state must move to the proven outer endpoint');
  assert.equal(takeUp.arrivalRadius, servicePlan.takeUpArrivalRadius);

  const duplicate = decidePq017ReceiverTowTarget(
    exactSlack,
    servicePlan,
    takeUp,
    { maxTakeUpCycles: 6, settledSlackSamples: 2 },
  );
  assert.equal(duplicate.reason, 'duplicate-simulation-tick');
  assert.equal(duplicate.takeUpCycles, 1);
  assert.equal(duplicate.takeUpActive, true,
    'wall polling cannot fabricate another take-up entry or toggle its target');

  const taut = decidePq017ReceiverTowTarget({
    ...exactSlack,
    tick: 101,
    lineDistance: 21.5,
    tether: {
      ...exactSlack.tether,
      phase: 'tension',
      strain: 0.04,
      load: 0.2,
    },
  }, servicePlan, takeUp, { maxTakeUpCycles: 6, settledSlackSamples: 2 });
  assert.equal(taut.safe, true);
  assert.equal(taut.reason, 'tether-taut-service-convergence');
  assert.equal(taut.takeUpActive, false);
  assert.deepEqual(taut.target, servicePlan.target);

  const accepted = decidePq017ReceiverTowTarget({
    ...exactSlack,
    tick: 102,
    payloadDistance: servicePlan.deliveryRadius - 0.1,
  }, servicePlan, takeUp, { maxTakeUpCycles: 6, settledSlackSamples: 2 });
  assert.equal(accepted.safe, true);
  assert.equal(accepted.reason, 'payload-within-delivery-acceptance');
  assert.deepEqual(accepted.target, servicePlan.target,
    'physical overlap only changes the hold target; operation completion still needs its real receipt');

  const firstSlackSettle = decidePq017ReceiverTowTarget({
    ...exactSlack,
    tick: 103,
    takeUpDistance: servicePlan.takeUpArrivalRadius * 0.5,
    playerSpeed: 0.5,
  }, servicePlan, takeUp, { maxTakeUpCycles: 6, settledSlackSamples: 2 });
  assert.equal(firstSlackSettle.safe, true);
  assert.equal(firstSlackSettle.settledSlackSamples, 1);
  const failedSlackSettle = decidePq017ReceiverTowTarget({
    ...exactSlack,
    tick: 104,
    takeUpDistance: servicePlan.takeUpArrivalRadius * 0.5,
    playerSpeed: 0.5,
  }, servicePlan, firstSlackSettle, { maxTakeUpCycles: 6, settledSlackSamples: 2 });
  assert.equal(failedSlackSettle.safe, false);
  assert.equal(failedSlackSettle.reason, 'adaptive-tow-take-up-envelope-still-slack',
    'reaching the outer envelope without tension must fail instead of orbiting indefinitely');

  const exhausted = decidePq017ReceiverTowTarget({
    ...exactSlack,
    tick: 105,
  }, servicePlan, {
    ...taut,
    lastTick: 104,
    takeUpCycles: 6,
    takeUpActive: false,
  }, { maxTakeUpCycles: 6, settledSlackSamples: 2 });
  assert.equal(exhausted.safe, false);
  assert.equal(exhausted.reason, 'adaptive-tow-cycle-budget-exhausted');
});

test('PQ-017 receiver crossing pull routes the ship beyond solids and the payload through acceptance', () => {
  const player = { x: 792.9019165039062, z: -612.5327758789062 };
  const payload = { x: 775.1580810546875, z: -605.5093994140625 };
  const receiver = { x: 767.4486542780224, z: -617.4125661199455 };
  const root = { x: 760, z: -620 };
  const obstacles = [
    { entityId: 327, worldRecordId: 'world_site_helios_relay/root',
      type: 'world_site_root', x: 760, z: -620, radius: 18, collides: false },
    { entityId: 294, worldRecordId: 'world_site_helios_relay/component/relay_core',
      type: 'wreck', x: 759.2914604576528, z: -620.2829997068661,
      radius: 2.16, collides: true },
    { entityId: 288, worldRecordId: 'world_site_helios_relay/component/cargo_brace',
      type: 'wreck', x: 756.3493527228792, z: -621.6519416621679,
      radius: 1.62, collides: false },
    { entityId: 320, worldRecordId: 'world_site_helios_relay/component/payload_cradle',
      type: 'wreck', x: 755.6139485007698, z: -621.7518447657416,
      radius: 1.44, collides: false },
    { entityId: 322, worldRecordId: 'world_site_helios_relay/component/safety_coupler',
      type: 'wreck', x: 762.367099561415, z: -619.2483770203719,
      radius: 1.08, collides: true },
  ];
  const plan = planPq017ReceiverCrossingPull({
    playerPosition: player,
    payloadPosition: payload,
    receiverPosition: receiver,
    rootPosition: root,
    tetherRestLength: 19.374595117280112,
    maxTetherLength: 390,
    payloadRadius: 6,
    receiverRadius: 1.8,
    playerRadius: 14,
    obstacles,
    shipObstacles: [{
      entityId: 'released-payload',
      type: 'world_site_payload',
      x: payload.x,
      z: payload.z,
      radius: 6,
      allowEscapeFromOverlap: true,
    }],
    maxServiceSpeed: 6,
    brakeAccel: 12,
    clearanceMargin: 1,
    overlapMargin: 0.5,
    releasedDetour: true,
  });

  assert.equal(plan.safe, true);
  assert(plan.pullLead > 42.3 && plan.pullLead < 42.4,
    'the far-side target must clear every solid component without inflation from sensor bodies');
  assert.deepEqual(
    plan.routeSafety.obstacles.map((obstacle) => obstacle.entityId),
    [294, 322, 'released-payload'],
    'route authority must contain the two live solids plus the explicit payload escape body',
  );
  for (const obstacle of obstacles.filter((candidate) => candidate.collides !== false)) {
    assert(
      Math.hypot(plan.target.x - obstacle.x, plan.target.z - obstacle.z)
        > 14 + obstacle.radius + 18 + ((6 * 6) / (2 * 12)),
      `the far-side target must preserve planner and stopping clearance from ${obstacle.worldRecordId}`,
    );
  }
  assert(plan.target.x < receiver.x && plan.target.z < receiver.z);
  const payloadToReceiver = {
    x: receiver.x - payload.x,
    z: receiver.z - payload.z,
  };
  const receiverToTarget = {
    x: plan.target.x - receiver.x,
    z: plan.target.z - receiver.z,
  };
  assert(Math.abs(payloadToReceiver.x * receiverToTarget.z
    - payloadToReceiver.z * receiverToTarget.x) < 1e-6,
  'the final pull must stay on the live payload-through-receiver line');
  assert(payloadToReceiver.x * receiverToTarget.x
    + payloadToReceiver.z * receiverToTarget.z > 0,
  'the ship must finish beyond the receiver, not on the payload side');
  assert(plan.targetLineLength > plan.tetherRestLength);
  assert(plan.targetLineLength <= plan.maxTetherLength);
  assert(plan.maxRouteTetherDistance <= plan.maxTetherLength,
    'every attached route endpoint must remain inside the live Massline limit');
  assert.equal(plan.routeTetherDistances.length, plan.shipRoute.waypoints.length + 1);
  assert.equal(plan.payloadChord.safe, true);
  assert(plan.payloadChord.receiverMissDistance < plan.deliveryRadius);
  assert.equal(plan.shipRoute.blockedSegments, 0);
  assert(Math.hypot(
    plan.shipRoute.waypoints.at(-1).x - plan.target.x,
    plan.shipRoute.waypoints.at(-1).z - plan.target.z,
  ) < 1e-9);
  assert.equal(plan.shipRoute.waypoints.at(-1).phase, 'launch');
  assert(Math.abs(plan.routeLength - 373.37695835945703) < 0.01);
  assert(Math.abs(plan.idealTravelSeconds - 38.49468428314263) < 0.01);
  assert.equal(plan.minimumTowTimeoutMs, 106_990);
  assert(plan.minimumTowTimeoutMs > 100_000 && plan.minimumTowTimeoutMs < 110_000,
    'the shortest clear 373-WU route must be executable under measured loaded wall/sim throughput');
  assert.equal(plan.maximumRouteLength, null);
  assert.equal(plan.executionTowTimeoutMs, 120_000);
  assert.equal(plan.maximumTowTimeoutMs, 210_000);
  assert(plan.routeSegments.slice(0, -1).every((segment) => segment.speedCap === 16));
  assert.equal(plan.routeSegments.at(-1).phase, 'launch');
  assert.equal(plan.routeSegments.at(-1).speedCap, 6,
    'the exact far-side pull must keep the low destructive-service speed');

  assert.equal(typeof pq017Route.derivePq017TowTimeoutContract, 'function');
  const run32Timeout = pq017Route.derivePq017TowTimeoutContract({
    idealTravelSeconds: 77.64234036745013,
  });
  assert.equal(run32Timeout.pass, true);
  assert.equal(run32Timeout.minimumTowTimeoutMs, 185_285);
  assert.equal(run32Timeout.executionTowTimeoutMs, 195_000);
  assert.equal(run32Timeout.maximumTowTimeoutMs, 210_000);
  const exactBoundary = pq017Route.derivePq017TowTimeoutContract({
    idealTravelSeconds: 90,
  });
  assert.equal(exactBoundary.pass, true);
  assert.equal(exactBoundary.minimumTowTimeoutMs, 210_000);
  assert.equal(exactBoundary.executionTowTimeoutMs, 210_000);
  const overCap = pq017Route.derivePq017TowTimeoutContract({
    idealTravelSeconds: 90.0005,
  });
  assert.equal(overCap.pass, false);
  assert.equal(overCap.minimumTowTimeoutMs, 210_001);
  assert.equal(overCap.reason, 'far-side-route-time-budget-exceeded');

  const common = {
    playerPosition: player,
    receiverPosition: receiver,
    rootPosition: root,
    tetherRestLength: 19.374595117280112,
    maxTetherLength: 390,
    payloadRadius: 6,
    receiverRadius: 1.8,
    playerRadius: 14,
    obstacles,
    releasedDetour: true,
  };
  const relatchRestLength = plan.targetLineLength;
  const shortPull = planPq017ReceiverCrossingPull({
    ...common,
    playerPosition: plan.target,
    payloadPosition: payload,
    tetherRestLength: relatchRestLength,
    maximumRouteLength: 96,
    releasedDetour: false,
  });
  assert.equal(shortPull.safe, true);
  assert.equal(shortPull.shipRoute.direct, true,
    'a settled far-side ship must use one direct crossing instead of another outer ring');
  assert.equal(shortPull.shipRoute.waypoints.length, 1);
  assert(shortPull.routeLength > 7 && shortPull.routeLength < 9,
    'the exact relatch needs only the payload-to-acceptance distance plus a one-unit inset');
  assert(Math.abs(shortPull.predictedReceiverMissAtRest) < shortPull.strictDeliveryRadius,
    'the taut post-pull equilibrium must land strictly inside receiver acceptance');
  assert(Math.abs(
    shortPull.pullLead - (relatchRestLength - shortPull.strictDeliveryRadius + 1),
  ) < 1e-9);

  const equilibriumOvershoot = planPq017ReceiverCrossingPull({
    ...common,
    playerPosition: plan.target,
    payloadPosition: payload,
    tetherRestLength: relatchRestLength,
    playerRadius: 70,
    maximumRouteLength: 96,
    releasedDetour: false,
  });
  assert.equal(equilibriumOvershoot.reason, 'far-side-equilibrium-misses-receiver');
  assert(Math.abs(equilibriumOvershoot.predictedReceiverMissAtRest)
    >= equilibriumOvershoot.strictDeliveryRadius,
  'an obstacle/clearance lead that equilibrates beyond the receiver must fail closed');

  const directLegObstacle = {
    entityId: 1001,
    type: 'asteroid',
    x: (plan.target.x + shortPull.target.x) * 0.5,
    z: (plan.target.z + shortPull.target.z) * 0.5,
    radius: 1,
  };
  const blockedDirect = planPq017ReceiverCrossingPull({
    ...common,
    playerPosition: plan.target,
    payloadPosition: payload,
    tetherRestLength: relatchRestLength,
    shipObstacles: [directLegObstacle],
    maximumRouteLength: 96,
    releasedDetour: false,
  });
  assert.equal(blockedDirect.reason, 'far-side-direct-pull-unavailable',
    'a blocked direct leg must never fall through to an attached ring route');

  const longAttachedRoute = planPq017ReceiverCrossingPull({
    ...common,
    payloadPosition: payload,
    tetherRestLength: relatchRestLength,
    maximumRouteLength: 96,
    releasedDetour: false,
  });
  assert.equal(longAttachedRoute.reason, 'far-side-direct-pull-unavailable',
    'an attached wrong-side ship must never traverse the collision ring');

  const driftedPayload = { x: payload.x + 2, z: payload.z - 1 };
  const driftReplan = planPq017ReceiverCrossingPull({
    ...common,
    playerPosition: plan.target,
    payloadPosition: driftedPayload,
    tetherRestLength: Math.hypot(
      plan.target.x - driftedPayload.x,
      plan.target.z - driftedPayload.z,
    ),
    maximumRouteLength: 96,
    releasedDetour: false,
  });
  assert.equal(driftReplan.safe, false);
  assert.equal(driftReplan.reason, 'far-side-direct-pull-unavailable');
  assert(
    Math.hypot(
      driftReplan.target.x - shortPull.target.x,
      driftReplan.target.z - shortPull.target.z,
    ) > 1,
    'payload drift must produce a new live far-side target instead of reusing the stale chord',
  );

  assert.equal(planPq017ReceiverCrossingPull({
    ...common,
    payloadPosition: receiver,
  }).reason, 'payload-receiver-vector-invalid');
  assert.equal(planPq017ReceiverCrossingPull({
    ...common,
    payloadPosition: { x: receiver.x + 3, z: receiver.z },
  }).reason, 'payload-already-within-delivery');
  assert.equal(planPq017ReceiverCrossingPull({
    ...common,
    payloadPosition: payload,
    maxTetherLength: 50,
  }).reason, 'far-side-target-exceeds-tether');
  const ringExceedsTether = planPq017ReceiverCrossingPull({
    ...common,
    payloadPosition: payload,
    maxTetherLength: 100,
  });
  assert.equal(ringExceedsTether.reason, 'far-side-route-exceeds-tether');
  assert(ringExceedsTether.targetLineLength < ringExceedsTether.maxTetherLength,
    'the adversarial final target itself remains valid');
  assert(ringExceedsTether.routeTetherDistances[0].distance < ringExceedsTether.maxTetherLength,
    'the adversarial initial line itself remains valid');
  assert(ringExceedsTether.maxRouteTetherDistance > ringExceedsTether.maxTetherLength,
    'an outer collision-ring waypoint, not the start or final target, must trigger refusal');
  assert.equal(planPq017ReceiverCrossingPull({
    ...common,
    payloadPosition: payload,
    obstacles: [...obstacles, {
      entityId: 999,
      type: 'asteroid',
      x: (payload.x + receiver.x) * 0.5,
      z: (payload.z + receiver.z) * 0.5,
      radius: 2,
      collides: true,
    }],
  }).reason, 'payload-acceptance-chord-blocked');
  assert.equal(planPq017ReceiverCrossingPull({
    ...common,
    payloadPosition: payload,
    rootPosition: {
      x: (payload.x + receiver.x) * 0.5,
      z: (payload.z + receiver.z) * 0.5,
    },
    rootCollides: true,
  }).reason, 'payload-receiver-order-blocked',
  'a receiver hidden behind a colliding root on the pull ray must fail closed');

  const fifteenthBase = {
    playerPosition: { x: 742.9163818359375, z: -629.6524047851562 },
    payloadPosition: { x: 757.0526123046875, z: -620.4880981445312 },
    payloadCollides: false,
    receiverPosition: receiver,
    rootPosition: root,
    rootCollides: false,
    tetherRestLength: 16.846884817942435,
    maxTetherLength: 390,
    payloadRadius: 6,
    receiverRadius: 1.8,
    playerRadius: 14,
    releasedDetour: true,
    shipObstacles: [{
      entityId: 'released-payload',
      type: 'world_site_payload',
      x: 757.0526123046875,
      z: -620.4880981445312,
      radius: 6,
      allowEscapeFromOverlap: true,
    }],
  };
  const fifteenthObstacles = [
    {
      entityId: 327,
      type: 'world_site_root',
      x: root.x,
      z: root.z,
      radius: 18,
      collides: false,
    },
    {
      entityId: 292,
      type: 'wreck',
      x: 759.2914604576528,
      z: -620.2829997068661,
      radius: 2.16,
      collides: true,
    },
    {
      entityId: 286,
      type: 'wreck',
      x: 756.3493527228792,
      z: -621.6519416621679,
      radius: 1.62,
      collides: true,
    },
    {
      entityId: 318,
      type: 'wreck',
      x: 755.6139485007698,
      z: -621.7518447657416,
      radius: 1.44,
      collides: false,
    },
    {
      entityId: 320,
      type: 'wreck',
      x: 762.367099561415,
      z: -619.2483770203719,
      radius: 1.08,
      collides: true,
    },
  ];
  const visualRootPlan = planPq017ReceiverCrossingPull({
    ...fifteenthBase,
    obstacles: fifteenthObstacles,
  });
  assert.equal(visualRootPlan.safe, true,
    'the exact noncontact payload must not be rejected by visual root or solid assembly bodies');
  assert.equal(visualRootPlan.payloadChord.sweep.closestConstraint, null,
    'a no-contact payload must produce no false solid chord constraint');
  assert.equal(visualRootPlan.shipRoute.blockedSegments, 0);
  assert(fifteenthObstacles.filter((obstacle) => obstacle.collides === true).every((obstacle) => (
    visualRootPlan.routeSafety.obstacles.some((body) => body.entityId === obstacle.entityId)
  )), 'every solid assembly body must remain in the ship collision route');
  assert.equal(visualRootPlan.routeSafety.obstacles.some((body) => body.entityId === 327), false,
    'the noncolliding visual root must not create a ship-radius phantom obstacle');
  assert.equal(visualRootPlan.routeSafety.obstacles.some((body) => body.entityId === 318), false,
    'sensor component proxies must not create ship-radius phantom obstacles');
  assert(visualRootPlan.rootAlongPull > 0
    && visualRootPlan.rootAlongPull < visualRootPlan.payloadDistance,
  'the exact root is geometrically between payload and receiver, exercising collision authority');

  const solidComponentPlan = planPq017ReceiverCrossingPull({
    ...fifteenthBase,
    payloadCollides: true,
    rootCollides: false,
    obstacles: fifteenthObstacles,
  });
  assert.equal(solidComponentPlan.reason, 'payload-acceptance-chord-blocked',
    'a contact-authoritative payload must still be blocked by the exact solid relay chord');

  const noncontactPayloadCollidingRoot = planPq017ReceiverCrossingPull({
    ...fifteenthBase,
    rootCollides: true,
    obstacles: fifteenthObstacles,
  });
  assert.notEqual(noncontactPayloadCollidingRoot.reason, 'payload-receiver-order-blocked',
    'a noncontact payload cannot be hard-blocked by even a contact-authoritative root');

  const distantObstacle = {
    entityId: 1000,
    type: 'asteroid',
    x: receiver.x + plan.direction.x * 300,
    z: receiver.z + plan.direction.z * 300,
    radius: 20,
    collides: true,
  };
  const distantPlan = planPq017ReceiverCrossingPull({
    ...common,
    payloadPosition: payload,
    obstacles: [...obstacles, distantObstacle],
  });
  assert.equal(distantPlan.safe, true);
  assert.equal(distantPlan.pullLead, plan.pullLead,
    'a disjoint far-ray asteroid must not erase the first safe pull target');
});

test('PQ-017 exact captured traffic geometry chooses an executable collision-clear far-side route', () => {
  const capture = PQ017_FAR_SIDE_TIME_BUDGET_CAPTURE;
  const plan = planPq017ReceiverCrossingPull({
    playerPosition: capture.player,
    payloadPosition: capture.payload,
    payloadCollides: false,
    receiverPosition: capture.receiver,
    rootPosition: capture.root,
    rootCollides: false,
    tetherRestLength: capture.tetherRestLength,
    maxTetherLength: 390,
    payloadRadius: capture.payloadRadius,
    receiverRadius: capture.receiverRadius,
    playerRadius: capture.playerRadius,
    obstacles: capture.obstacles,
    shipObstacles: [{
      entityId: 'released-payload',
      type: 'world_site_payload',
      x: capture.payload.x,
      z: capture.payload.z,
      radius: capture.payloadRadius,
      allowEscapeFromOverlap: true,
    }],
    maxServiceSpeed: 6,
    brakeAccel: 12,
    clearanceMargin: 1,
    overlapMargin: 0.5,
    releasedDetour: true,
  });

  assert.equal(plan.safe, true,
    'a shorter safe route in the captured candidate set must outrank a time-budget failure');
  assert.equal(plan.shipRoute.blockedSegments, 0);
  assert(plan.routeSafety.obstacles.some((obstacle) => obstacle.entityId === 299),
    'the captured traffic ship must remain collision-authoritative');
  assert(plan.shipRoute.segmentClearances.every((clearance) => (
    clearance == null || clearance > 0
  )), 'every finite route segment clearance must retain the planner safety margin');
  assert(plan.shipRoute.obstacleClearance > 7.61);
  assert(plan.routeLength < 914);
  assert(plan.routeLength < 1288.9087474679127,
    'the executable route must be shorter than the clear route rejected by the Browser time cap');
  assert(plan.idealTravelSeconds < 81);
  assert.equal(plan.minimumTowTimeoutMs, 191_880);
  assert.equal(plan.executionTowTimeoutMs, 195_000);
  assert.equal(plan.maximumTowTimeoutMs, 210_000);
});

test('PQ-017 released payload settlement requires distinct stable ticks and bounded drift', () => {
  let settlement = decidePq017ReleasedPayloadSettlement({
    tick: 100,
    payloadAlive: true,
    tetherActive: false,
    payload: { x: 775, z: -605, vx: 6, vz: 0 },
  });
  assert.equal(settlement.action, 'wait');
  assert.equal(settlement.stableSamples, 0);

  const duplicate = decidePq017ReleasedPayloadSettlement({
    tick: 100,
    payloadAlive: true,
    tetherActive: false,
    payload: { x: 776, z: -605, vx: 0.5, vz: 0 },
  }, settlement);
  assert.equal(duplicate.reason, 'duplicate-simulation-tick');
  assert.equal(duplicate.position.x, 775,
    'wall polls in one simulation tick must not invent settlement progress');

  for (let sample = 1; sample <= 4; sample += 1) {
    settlement = decidePq017ReleasedPayloadSettlement({
      tick: 100 + sample,
      payloadAlive: true,
      tetherActive: false,
      payload: { x: 775 + sample * 0.02, z: -605, vx: 0.5, vz: 0 },
    }, settlement);
  }
  assert.equal(settlement.action, 'settled');
  assert.equal(settlement.stableSamples, 4);

  const stillAttached = decidePq017ReleasedPayloadSettlement({
    tick: 110,
    payloadAlive: true,
    tetherActive: true,
    payload: { x: 775, z: -605, vx: 0, vz: 0 },
  });
  assert.equal(stillAttached.safe, false);
  assert.equal(stillAttached.reason, 'released-payload-observation-invalid');

  const drifted = decidePq017ReleasedPayloadSettlement({
    tick: 111,
    payloadAlive: true,
    tetherActive: false,
    payload: { x: 830, z: -605, vx: 0, vz: 0 },
  }, {
    origin: { x: 775, z: -605 },
    position: { x: 775, z: -605 },
    lastTick: 110,
  });
  assert.equal(drifted.safe, false);
  assert.equal(drifted.reason, 'released-payload-drift-budget-exceeded');
});

test('PQ-017 pre-release standoff derives dynamic slack geometry and withholds release until every gate', () => {
  assert.equal(typeof pq017Route.decidePq017PreReleaseStandoff, 'function',
    'the public route needs a pure pre-release standoff contract');
  const decide = pq017Route.decidePq017PreReleaseStandoff;
  const common = {
    tick: 200,
    player: { x: 19.8024567, z: 0, vx: 0, vz: 0 },
    playerRadius: 14,
    payload: { x: 0, z: 0, vx: 0, vz: 0 },
    payloadAlive: true,
    payloadRadius: 6,
    tether: {
      active: true,
      targetMatches: true,
      automaticBreakAllowed: false,
      restLength: 19.8024567,
    },
    breakEvents: 0,
    impactEvents: 0,
  };

  const payout = decide(common, {});
  assert.equal(payout.safe, true);
  assert.equal(payout.action, 'pay-out');
  assert.equal(payout.releaseAuthorized, false);
  assert.equal(payout.physicalExclusion, 20);
  assert.equal(payout.minimumReleaseDistance, 22);
  assert.equal(payout.targetDistance, 24);
  assert.equal(payout.payoutRestLength, 26);
  assert.deepEqual(payout.target, { x: 24, z: 0 });

  const staged = decide({
    ...common,
    tick: 201,
    tether: { ...common.tether, restLength: 26 },
  }, payout);
  assert.equal(staged.action, 'stage-outward');
  assert.equal(staged.releaseAuthorized, false,
    'a paid-out line cannot authorize release while the ship remains inside the minimum stand-off');

  const moving = decide({
    ...common,
    tick: 202,
    player: { x: 24, z: 0, vx: 0.51, vz: 0 },
    tether: { ...common.tether, restLength: 26 },
  }, staged);
  assert.equal(moving.action, 'settle');
  assert.equal(moving.releaseAuthorized, false,
    'distance and slack cannot authorize release above the exact low-energy speed gate');

  const ready = decide({
    ...common,
    tick: 203,
    player: { x: 24, z: 0, vx: 0.5, vz: 0 },
    payload: { x: 0.1, z: 0, vx: 0, vz: 0 },
    tether: { ...common.tether, restLength: 26 },
  }, staged);
  assert.equal(ready.action, 'ready-release');
  assert.equal(ready.releaseAuthorized, true);
  assert(ready.lineDistance >= ready.minimumReleaseDistance);
  assert(ready.retainedSlack > 0);
  assert(ready.payloadDrift <= 1);
  const tautButClear = decide({
    ...common,
    tick: 204,
    player: { x: 25.5, z: 0, vx: 0, vz: 0 },
    tether: { ...common.tether, restLength: 26 },
  }, staged);
  assert.equal(tautButClear.action, 'ready-release');
  assert.equal(tautButClear.releaseAuthorized, true);
  assert.equal(tautButClear.retainedSlack, 0.5);

  const run24TautRelease = decide({
    ...common,
    tick: 205,
    player: { x: 30.144241, z: 0, vx: 0.2165, vz: 0 },
    payload: { x: 0, z: 0, vx: 0.0168, vz: 0 },
    tether: { ...common.tether, restLength: 30.126076 },
  }, staged);
  assert.equal(run24TautRelease.action, 'ready-release');
  assert.equal(run24TautRelease.releaseAuthorized, true);
  assert(run24TautRelease.retainedSlack < 0);
  assert(Math.abs(run24TautRelease.retainedSlack - (-0.018165)) < 1e-9);
  const postReleaseContexts = createPq017ScopedEscapeContexts(
    ready.target,
    { x: 80, z: 0 },
    [{
      entityId: 'released-payload',
      type: 'world_site_payload',
      x: ready.payloadAnchor.x,
      z: ready.payloadAnchor.z,
      radius: common.payloadRadius,
      allowEscapeFromOverlap: true,
    }],
    common.playerRadius,
  );
  assert.deepEqual(postReleaseContexts, {},
    'the exact route must release beyond physical exclusion without creating a fallback escape');
});

test('PQ-017 pre-release standoff fails closed on invalid geometry, ownership, or line reach', () => {
  const decide = pq017Route.decidePq017PreReleaseStandoff;
  const common = {
    tick: 300,
    player: { x: 20, z: 0, vx: 0, vz: 0 },
    playerRadius: 14,
    payload: { x: 0, z: 0, vx: 0, vz: 0 },
    payloadAlive: true,
    payloadRadius: 6,
    tether: {
      active: true,
      targetMatches: true,
      automaticBreakAllowed: false,
      restLength: 26,
    },
    breakEvents: 0,
    impactEvents: 0,
  };
  const expectBlocked = (observation, reason, options) => {
    const decision = decide(observation, {}, options);
    assert.equal(decision.safe, false);
    assert.equal(decision.releaseAuthorized, false);
    assert.equal(decision.reason, reason);
  };

  expectBlocked(
    { ...common, playerRadius: Number.NaN },
    'pre-release-standoff-observation-invalid',
  );
  expectBlocked(
    { ...common, player: { x: 0, z: 0, vx: 0, vz: 0 } },
    'pre-release-standoff-radial-invalid',
  );
  expectBlocked(
    { ...common, tether: { ...common.tether, restLength: 25.5 } },
    'pre-release-standoff-exceeds-massline-length',
    { maxTetherLength: 25.999 },
  );
  expectBlocked(
    { ...common, tether: { ...common.tether, restLength: 27 } },
    'pre-release-standoff-rest-length-invalid',
    { maxTetherLength: 26 },
  );
  expectBlocked(
    { ...common, tether: { ...common.tether, targetMatches: false } },
    'pre-release-standoff-tether-mismatch',
  );
  expectBlocked(
    { ...common, tether: { ...common.tether, automaticBreakAllowed: true } },
    'pre-release-standoff-requires-nonbreaking-massline',
  );
  expectBlocked(
    { ...common, breakEvents: 1 },
    'pre-release-standoff-observed-break',
  );
  expectBlocked(
    { ...common, impactEvents: 1 },
    'pre-release-standoff-observed-world-site-impact',
  );
});

test('PQ-017 attached standoff controller blocks the exact Electron turning-arc collision', () => {
  assert.equal(typeof pq017Route.decidePq017AttachedStandoffRadialControl, 'function');
  const decide = pq017Route.decidePq017AttachedStandoffRadialControl;
  const previous = { x: 744.23828125, z: -633.4369506835938 };
  const current = { x: 744.7021484375, z: -632.0325317382812 };
  const target = { x: 748.5823811057276, z: -642.9437251327978 };
  const payloadAnchor = { x: 757.0526123046875, z: -620.4880981445312 };
  const wreck = {
    entityId: 286,
    worldRecordId: 'world_site_helios_relay/component/cargo_brace',
    type: 'wreck',
    x: 756.3493527228792,
    z: -621.6519416621679,
    radius: 1.62,
    collides: true,
  };
  const failedSweep = auditPq017RouteSweep(previous, current, [wreck], 14);
  assert.equal(failedSweep.safe, false);
  assert(Math.abs(failedSweep.closestConstraint.clearance - (-0.018268750114371457))
    < 1e-9);

  const segmentX = target.x - payloadAnchor.x;
  const segmentZ = target.z - payloadAnchor.z;
  const segmentLength = Math.hypot(segmentX, segmentZ);
  const direction = { x: segmentX / segmentLength, z: segmentZ / segmentLength };
  assert(Math.abs(segmentLength - 24) < 1e-9);
  const origin = {
    x: payloadAnchor.x + direction.x * 19.8024567,
    z: payloadAnchor.z + direction.z * 19.8024567,
  };
  assert(Math.abs(origin.x - 750.0638) < 0.001);
  assert(Math.abs(origin.z - (-639.0163)) < 0.001);
  const plan = {
    payloadAnchor,
    direction,
    target,
    targetDistance: 24,
    minimumReleaseDistance: 22,
    payoutRestLength: 26,
    corridorHalfWidth: 1,
    initialRadialDistance: 19.8024567,
    maximumRadialRetreat: 0.25,
    minimumRetainedSlack: 1,
    maximumRadialDistance: 25,
  };
  const observation = {
    tick: 8922,
    player: {
      ...current,
      vx: 0,
      vz: 0,
      rot: Math.atan2(direction.z, direction.x),
      angVel: 0,
    },
    playerRadius: 14,
    payload: { ...payloadAnchor, vx: 0, vz: 0 },
    payloadAlive: true,
    payloadRadius: 6,
    tether: {
      active: true,
      targetMatches: true,
      automaticBreakAllowed: false,
      restLength: 26,
    },
    breakEvents: 0,
    impactEvents: 0,
  };
  const blocked = decide(observation, plan);
  assert.equal(blocked.safe, false);
  assert.equal(blocked.reason, 'attached-standoff-left-radial-corridor');
  assert(Math.abs(blocked.crossTrack - 7.481391172230173) < 1e-9);
  assert(Math.abs((blocked.radialDistance - 19.8024567) - (-4.642090910769056))
    < 1e-9);
  const deepOnChordRetreat = decide({
    ...observation,
    tick: 8923,
    player: {
      x: payloadAnchor.x + direction.x * (19.8024567 - 4.642090910769056),
      z: payloadAnchor.z + direction.z * (19.8024567 - 4.642090910769056),
      vx: 0,
      vz: 0,
      rot: Math.atan2(direction.z, direction.x),
      angVel: 0,
    },
  }, plan);
  assert.equal(deepOnChordRetreat.safe, false);
  assert.equal(deepOnChordRetreat.reason, 'attached-standoff-retreated-inside-corridor-origin');

  const impacted = decide({ ...observation, impactEvents: 1 }, plan);
  assert.equal(impacted.safe, false);
  assert.equal(impacted.reason, 'attached-standoff-observed-world-site-impact');
});

test('PQ-017 attached standoff aligns live yaw before freezing the run26 radial origin', () => {
  assert.equal(typeof pq017Route.decidePq017StandoffYawAlignment, 'function');
  assert.equal(typeof pq017Route.derivePq017StandoffHeadingTolerance, 'function');
  const decide = pq017Route.decidePq017StandoffYawAlignment;
  const payloadAnchor = { x: 757.0526123046875, z: -620.4880981445312 };
  const direction = { x: -0.697569097689272, z: 0.7165175182429071 };
  const targetHeading = Math.atan2(direction.z, direction.x);
  const observation = (tick, radialDistance = 19.597300449074194, {
    rot = targetHeading,
    angVel = 0,
  } = {}) => ({
    tick,
    player: {
      x: payloadAnchor.x + direction.x * radialDistance,
      z: payloadAnchor.z + direction.z * radialDistance,
      vx: 0.13693243265151978,
      vz: -0.11631275713443756,
      rot,
      angVel,
    },
    playerRadius: 14,
    payload: { ...payloadAnchor, vx: 0, vz: 0 },
    payloadAlive: true,
    payloadRadius: 6,
    tether: {
      active: true,
      targetMatches: true,
      automaticBreakAllowed: false,
      restLength: 28.004896950431593,
    },
    breakEvents: 0,
    impactEvents: 0,
  });

  const run26Align = decide(observation(3578, 19.597300449074194, {
    rot: 3.1110616788346817,
  }), {}, { payloadAnchor });
  assert.equal(run26Align.action, 'align');
  assert.equal(run26Align.turnDirection, -1);
  assert(Math.abs(run26Align.headingError - (-0.7682661462287403)) < 1e-9);
  const improving = decide(observation(3579, 19.55, {
    rot: targetHeading + 0.4,
  }), run26Align, { payloadAnchor });
  assert.equal(improving.action, 'align');
  assert.equal(improving.stagnantTicks, 0);
  const liveSpin = decide(observation(3580, 19.53, {
    rot: targetHeading + 0.3,
    angVel: -1.2,
  }), improving, { payloadAnchor });
  assert.equal(liveSpin.action, 'settle-yaw');
  assert.equal(liveSpin.reason, 'standoff-yaw-neutral-brake');
  assert.equal(liveSpin.turnDirection, 0);
  const aligned = decide(observation(3580, 19.50, {
    rot: targetHeading + 0.03,
  }), improving, { payloadAnchor });
  assert.equal(aligned.action, 'aligned');
  assert.equal(aligned.turnDirection, 0);

  const run27DesiredHeading = -2.706703485118542;
  const run27Direction = {
    x: Math.cos(run27DesiredHeading),
    z: Math.sin(run27DesiredHeading),
  };
  const run27Observation = (rot) => ({
    ...observation(3111),
    player: {
      x: payloadAnchor.x + run27Direction.x * 18.854393614156994,
      z: payloadAnchor.z + run27Direction.z * 18.854393614156994,
      vx: 0.13693243265151978,
      vz: -0.11631275713443756,
      rot,
      angVel: 0,
    },
  });
  const run27Runtime = {
    ...run26Align,
    lastTick: 3103,
    bestAbsoluteHeadingError: 0.5901275637746948,
    distinctTicks: 26,
    stagnantTicks: 0,
    playerOrigin: {
      x: payloadAnchor.x + run27Direction.x * 19.47976498425474,
      z: payloadAnchor.z + run27Direction.z * 19.47976498425474,
    },
  };
  const batchedTickCapture = decide(run27Observation(-2.568114871138841), run27Runtime, {
    payloadAnchor,
    targetDistance: 24,
    corridorHalfWidth: 1,
    usableCorridor: 0.75,
  });
  assert.equal(batchedTickCapture.action, 'aligned');
  assert(Math.abs(batchedTickCapture.headingError - (-0.1385886139797008)) < 1e-9);
  assert(batchedTickCapture.headingTolerance > batchedTickCapture.absoluteHeadingError);
  assert(batchedTickCapture.projectedLateralBurn <= 0.75 + 1e-9);

  const unsafeLargerAngle = decide(
    run27Observation(run27DesiredHeading + 0.18),
    {
    ...run27Runtime,
    bestAbsoluteHeadingError: 0.19,
    },
    {
    payloadAnchor,
    targetDistance: 24,
    corridorHalfWidth: 1,
    usableCorridor: 0.75,
    },
  );
  assert.equal(unsafeLargerAngle.action, 'align');
  assert(unsafeLargerAngle.projectedLateralBurn > 0.75);

  const radialPlan = {
    payloadAnchor,
    direction: run27Direction,
    target: {
      x: payloadAnchor.x + run27Direction.x * 24,
      z: payloadAnchor.z + run27Direction.z * 24,
    },
    targetDistance: 24,
    minimumReleaseDistance: 22,
    payoutRestLength: 26,
    corridorHalfWidth: 1,
    initialRadialDistance: 18.854393614156994,
    maximumRadialRetreat: 0.25,
    minimumRetainedSlack: 1,
    maximumRadialDistance: 25,
  };
  const radialObservation = (headingError, crossTrack = 0) => {
    const normal = { x: -run27Direction.z, z: run27Direction.x };
    return {
      tick: 4_000,
      player: {
        x: payloadAnchor.x + run27Direction.x * 18.854393614156994
          + normal.x * crossTrack,
        z: payloadAnchor.z + run27Direction.z * 18.854393614156994
          + normal.z * crossTrack,
      vx: 0,
      vz: 0,
      rot: run27DesiredHeading - headingError,
      angVel: 0,
      },
      playerRadius: 14,
      payload: { ...payloadAnchor, vx: 0, vz: 0 },
      payloadAlive: true,
      payloadRadius: 6,
      tether: {
        active: true,
        targetMatches: true,
        automaticBreakAllowed: false,
        restLength: 32.86914781500745,
      },
      breakEvents: 0,
      impactEvents: 0,
    };
  };
  const radialAccepted = pq017Route.decidePq017AttachedStandoffRadialControl(
    radialObservation(-0.1385886139797008),
    radialPlan,
    {
      lastTick: 3_999,
      lastPlayerRot: radialObservation(-0.1385886139797008).player.rot,
      yawNeutralArmed: true,
      stableYawSamples: 1,
    },
  );
  assert.equal(radialAccepted.action, 'pulse-outward');
  assert(radialAccepted.headingTolerance > radialAccepted.headingError * -1);
  assert(radialAccepted.projectedLateralBurn <= 0.75 + 1e-9);
  const radialAngleUnsafe = pq017Route.decidePq017AttachedStandoffRadialControl(
    radialObservation(-0.18),
    radialPlan,
  );
  assert.equal(radialAngleUnsafe.action, 'align');
  const crossTrackConsumesBudget = pq017Route.decidePq017AttachedStandoffRadialControl(
    radialObservation(-0.1, 0.4),
    radialPlan,
  );
  assert.equal(crossTrackConsumesBudget.action, 'align');
  assert(crossTrackConsumesBudget.projectedLateralBurn > 0.75);
  const nearReserveRejectsBaseTolerance = pq017Route
    .decidePq017AttachedStandoffRadialControl(
      radialObservation(-0.03, 0.7),
      radialPlan,
    );
  assert.equal(nearReserveRejectsBaseTolerance.action, 'align');
  assert(nearReserveRejectsBaseTolerance.absoluteHeadingError < 0.04);
  assert(nearReserveRejectsBaseTolerance.projectedLateralBurn > 0.75);

  let stagnant = run26Align;
  for (let tick = 3579; tick <= 3599; tick += 1) {
    stagnant = decide(observation(tick, 19.597300449074194, {
      rot: 3.1110616788346817,
    }), stagnant, { payloadAnchor, maxStagnantTicks: 20 });
  }
  assert.equal(stagnant.safe, false);
  assert.equal(stagnant.reason, 'standoff-yaw-alignment-stagnated');
});

test('PQ-017 attached standoff uses neutral coast, yaw-only alignment, and bounded W pulses', () => {
  const decide = pq017Route.decidePq017AttachedStandoffRadialControl;
  const plan = {
    payloadAnchor: { x: 0, z: 0 },
    direction: { x: 1, z: 0 },
    target: { x: 24, z: 0 },
    targetDistance: 24,
    minimumReleaseDistance: 22,
    payoutRestLength: 26,
    corridorHalfWidth: 1,
    initialRadialDistance: 19.8024567,
    maximumRadialRetreat: 0.25,
    minimumRetainedSlack: 1,
    maximumRadialDistance: 25,
  };
  const sample = (overrides = {}) => {
    const base = {
    tick: 400,
    player: { x: 19.8024567, z: 0, vx: 0, vz: 0, rot: 0, angVel: 0 },
    playerRadius: 14,
    payload: { x: 0, z: 0, vx: 0, vz: 0 },
    payloadAlive: true,
    payloadRadius: 6,
    tether: {
      active: true,
      targetMatches: true,
      automaticBreakAllowed: false,
      restLength: 26,
    },
    breakEvents: 0,
    impactEvents: 0,
    };
    return {
      ...base,
      ...overrides,
      player: { ...base.player, ...overrides.player },
      payload: { ...base.payload, ...overrides.payload },
      tether: { ...base.tether, ...overrides.tether },
    };
  };

  const coasting = decide(
    sample({ player: { x: 19.8024567, z: 0, vx: 0.51, vz: 0, rot: 0 } }),
    plan,
  );
  assert.equal(coasting.action, 'coast');
  assert.equal(coasting.forward, false);
  assert.equal(coasting.reverse, false);

  const aligning = decide(
    sample({ tick: 401, player: { x: 19.8024567, z: 0, vx: 0, vz: 0, rot: 0.19 } }),
    plan,
    coasting,
  );
  assert.equal(aligning.action, 'align');
  assert.equal(aligning.forward, false);
  assert.equal(aligning.reverse, false);
  assert.equal(aligning.turnDirection, -1);

  const yawHistorySettling = decide(sample({ tick: 402 }), plan, aligning);
  assert.equal(yawHistorySettling.action, 'settle-yaw');
  assert.equal(yawHistorySettling.reason, 'attached-standoff-yaw-history-settle');
  assert.equal(yawHistorySettling.turnDirection, 0);
  const armed = decide(sample({ tick: 403 }), plan, yawHistorySettling);
  assert.equal(armed.action, 'settle-yaw');
  assert.equal(armed.reason, 'attached-standoff-yaw-neutral-arming');
  const stable = decide(sample({ tick: 404 }), plan, armed);
  assert.equal(stable.action, 'settle-yaw');
  assert.equal(stable.reason, 'attached-standoff-yaw-stability-confirming');
  const pulse = decide(sample({ tick: 405 }), plan, stable);
  assert.equal(pulse.action, 'pulse-outward');
  assert.equal(pulse.forward, true);
  assert.equal(pulse.reverse, false);
  assert.equal(pulse.turnDirection, 0,
    'W is allowed only after tight radial alignment with A/D released');
  assert.equal(pulse.waitFixedTicks, 1);
  assert.equal(pulse.awaitingOutwardProgress, true);
  const noOutwardResponse = decide(sample({
    tick: 406,
    player: { x: 19.8, z: 0, vx: -0.01, vz: 0, rot: 0 },
  }), plan, pulse);
  assert.equal(noOutwardResponse.safe, false);
  assert.equal(noOutwardResponse.reason, 'attached-standoff-outward-pulse-made-no-progress');

  const speedCapped = decide(sample({
    tick: 406,
    player: { x: 21, z: 0, vx: 1.01, vz: 0, rot: 0 },
  }), plan, pulse);
  assert.equal(speedCapped.action, 'brake-outward');
  assert.equal(speedCapped.forward, false);
  assert.equal(speedCapped.reverse, true);

  const retreated = decide(sample({
    tick: 407,
    player: { x: 19.4, z: 0, vx: -0.1, vz: 0, rot: 0 },
  }), plan, speedCapped);
  assert.equal(retreated.safe, false);
  assert.equal(retreated.reason, 'attached-standoff-retreated-inside-corridor-origin');

  const ready = decide(sample({
    tick: 408,
    player: { x: 24, z: 0, vx: 0.3, vz: 0, rot: 0 },
  }), plan, speedCapped);
  assert.equal(ready.action, 'ready-release');
  assert.equal(ready.releaseAuthorized, true);
  assert.equal(ready.reverse, false);

  const taut = decide(sample({
    tick: 409,
    player: { x: 25, z: 0, vx: 0, vz: 0, rot: 0 },
    payload: { x: -0.2, z: 0, vx: 0, vz: 0 },
  }), plan, ready);
  assert.equal(taut.safe, false);
  assert.equal(taut.reason, 'attached-standoff-slack-lost');

  const drifted = decide(sample({
    tick: 410,
    player: { x: 24, z: 0, vx: 0, vz: 0, rot: 0 },
    payload: { x: 1.01, z: 0, vx: 0, vz: 0 },
  }), plan, ready);
  assert.equal(drifted.safe, false);
  assert.equal(drifted.reason, 'attached-standoff-payload-drifted');

  const overshot = decide(sample({
    tick: 411,
    player: { x: 25.01, z: 0, vx: 0, vz: 0, rot: 0 },
  }), plan, ready);
  assert.equal(overshot.safe, false);
  assert.equal(overshot.reason, 'attached-standoff-left-proven-radial-endpoint');

  const exhausted = decide(sample({ tick: 412 }), plan, {
    ...pulse,
    lastTick: 411,
    outwardPulses: 120,
    awaitingOutwardProgress: false,
    outwardProgressObserved: true,
  });
  assert.equal(exhausted.safe, false);
  assert.equal(exhausted.reason, 'attached-standoff-pulse-budget-exhausted');
});

test('PQ-017 run34 applies one signed public brake after the exact batched W receipt', () => {
  const decide = pq017Route.decidePq017AttachedStandoffRadialControl;
  const decideBrake = pq017Route.decidePq017AttachedRadialBrakeProgress;
  assert.equal(typeof decideBrake, 'function');
  const payloadAnchor = { x: 757.0526123046875, z: -620.4880981445312 };
  const direction = { x: -0.9815792901310363, z: 0.19105522025281382 };
  const plan = {
    start: { x: 740.1497802734375, z: -617.1981201171875 },
    payloadAnchor,
    direction,
    target: { x: 733.4947093415426, z: -615.9027728584637 },
    targetDistance: 24,
    minimumReleaseDistance: 22,
    payoutRestLength: 26,
    initialRadialDistance: 17.22003734307959,
    corridorHalfWidth: 1,
    headingTolerance: 0.11017215046648574,
    maximumRadialRetreat: 0.25,
    minimumRetainedSlack: 1,
    maximumRadialDistance: 25,
  };
  const observation = ({
    tick = 3763,
    radialDistance = 17.26403024787351,
    radialSpeed = 2.9970602290263333,
    rot = 2.8614005848303004,
    angVel = 0,
    tether = {},
    breakEvents = 0,
    impactEvents = 0,
  } = {}) => ({
    tick,
    player: {
      x: payloadAnchor.x + direction.x * radialDistance,
      z: payloadAnchor.z + direction.z * radialDistance,
      vx: direction.x * radialSpeed,
      vz: direction.z * radialSpeed,
      rot,
      angVel,
    },
    playerRadius: 14,
    payload: { ...payloadAnchor, vx: 0, vz: 0 },
    payloadAlive: true,
    payloadRadius: 6,
    tether: {
      active: true,
      targetMatches: true,
      automaticBreakAllowed: false,
      restLength: 29.684428269160087,
      ...tether,
    },
    breakEvents,
    impactEvents,
  });
  const provedPulse = {
    lastTick: 3754,
    lastPlayerRot: 2.8614005848303004,
    yawNeutralArmed: true,
    stableYawSamples: 2,
    outwardPulses: 1,
    lastPulseRadialDistance: 17.12502904681336,
    awaitingOutwardProgress: true,
    outwardProgressObserved: false,
    farthestRadialDistance: 17.22003734307959,
    attachedRadialBrakePulses: 0,
    attachedRadialBrakeNeutralLatched: false,
  };

  const brake = decide(observation(), plan, provedPulse);
  assert.equal(brake.action, 'brake-outward');
  assert.equal(brake.reason, 'attached-standoff-batched-outward-speed-brake');
  assert.equal(brake.forward, false);
  assert.equal(brake.reverse, true);
  assert.equal(brake.outwardProgressObserved, true);
  assert(Math.abs(brake.radialSpeed - 2.9970602290263333) < 1e-12);

  for (const forbidden of [
    decide(observation(), plan, { ...provedPulse, outwardPulses: 0 }),
    decide(observation({ rot: 2.4 }), plan, provedPulse),
    decide(observation({ angVel: 0.2 }), plan, provedPulse),
    decide(observation(), plan, {
      ...provedPulse,
      attachedRadialBrakePulses: 1,
      attachedRadialBrakeNeutralLatched: true,
    }),
  ]) {
    assert.notEqual(forbidden.action, 'brake-outward');
    assert.equal(forbidden.reverse, false);
  }
  for (const [unsafeObservation, reason] of [
    [observation({ tether: { automaticBreakAllowed: true } }),
      'attached-standoff-requires-nonbreaking-massline'],
    [observation({ breakEvents: 1 }), 'attached-standoff-observed-break'],
    [observation({ impactEvents: 1 }),
      'attached-standoff-observed-world-site-impact'],
  ]) {
    const blocked = decide(unsafeObservation, plan, provedPulse);
    assert.equal(blocked.safe, false);
    assert.equal(blocked.reason, reason);
    assert.equal(blocked.reverse, false);
  }

  const exactEndpointFailure = decide(observation({
    tick: 3997,
    radialDistance: 25.12330063891171,
    radialSpeed: 1.2767001691516737,
  }), plan, provedPulse);
  assert.equal(exactEndpointFailure.safe, false);
  assert.equal(
    exactEndpointFailure.reason,
    'attached-standoff-left-proven-radial-endpoint',
  );
  assert.equal(exactEndpointFailure.reverse, false);

  const progressing = decideBrake({
    startTick: 3763,
    currentTick: 3770,
    startRadialSpeed: 2.9970602290263333,
    currentRadialSpeed: 1.4,
    targetRadialSpeed: 0.3,
    maxTicks: 12,
  });
  assert.equal(progressing.release, false);
  assert.equal(progressing.reason, 'attached-radial-brake-progressing');
  assert.equal(progressing.signedProgress, true);
  const reversed = decideBrake({
    startTick: 3763,
    currentTick: 3772,
    startRadialSpeed: 2.9970602290263333,
    currentRadialSpeed: -0.05,
    targetRadialSpeed: 0.3,
    maxTicks: 12,
  });
  assert.equal(reversed.release, true);
  assert.equal(reversed.reversed, true);
  assert.equal(reversed.neutralLatch, true);
  assert.equal(reversed.reason, 'attached-radial-brake-reversed');
  const cappedWithoutProgress = decideBrake({
    startTick: 3763,
    currentTick: 3775,
    startRadialSpeed: 2.9970602290263333,
    currentRadialSpeed: 2.9970602290263333,
    targetRadialSpeed: 0.3,
    maxTicks: 12,
  });
  assert.equal(cappedWithoutProgress.release, true);
  assert.equal(cappedWithoutProgress.signedProgress, false);
  assert.equal(cappedWithoutProgress.neutralLatch, true);
  assert.equal(cappedWithoutProgress.reason, 'attached-radial-brake-no-progress');
});

test('PQ-017 run35 keeps the exact cargo-brace impact hard instead of filtering it', () => {
  assert.equal(typeof pq017Route.auditPq017ReleasedRouteImpactReceipt, 'function');
  const player = { x: 742.111328125, z: -630.7600708007812 };
  const cargoBrace = {
    x: 756.3493527228792,
    z: -621.6519416621679,
    radius: 1.6199999999999999,
  };
  const centerDistance = Math.hypot(
    cargoBrace.x - player.x,
    cargoBrace.z - player.z,
  );
  assert(Math.abs(centerDistance - 16.902051971742067) < 1e-9);
  assert(Math.abs(centerDistance - (14 + cargoBrace.radius) - 1.2820519717420673)
    < 1e-9,
  'the last sampled center clearance was already smaller than the authored safety margin');

  const blocked = pq017Route.decidePq017StandoffYawAlignment({
    tick: 3886,
    player: {
      ...player,
      vx: 0.12249022722244263,
      vz: -0.131303608417511,
      rot: -2.1022608075345515,
      angVel: 0,
    },
    payload: { x: 757.0526123046875, z: -620.4880981445312, vx: 0, vz: 0 },
    payloadAlive: true,
    tether: {
      active: true,
      targetMatches: true,
      automaticBreakAllowed: false,
      restLength: 29.942090337529002,
    },
    breakEvents: 0,
    impactEvents: 1,
  }, {
    playerOrigin: player,
    payloadAnchor: { x: 757.0526123046875, z: -620.4880981445312 },
    lastTick: 3885,
    bestAbsoluteHeadingError: 0.4323519492378698,
    distinctTicks: 17,
    stagnantTicks: 0,
  }, {
    payloadAnchor: { x: 757.0526123046875, z: -620.4880981445312 },
    targetDistance: 24,
    corridorHalfWidth: 1,
    usableCorridor: 0.75,
  });
  assert.equal(blocked.safe, false);
  assert.equal(blocked.reason, 'standoff-yaw-observed-world-site-impact');
  assert.equal(blocked.turnDirection, 0);

  const cleanReleasedRoute = pq017Route.auditPq017ReleasedRouteImpactReceipt(
    { impactEvents: 7 },
    7,
  );
  assert.equal(cleanReleasedRoute.safe, true);
  assert.equal(cleanReleasedRoute.impactEvents, 0);
  const exactReleasedRouteImpact = pq017Route.auditPq017ReleasedRouteImpactReceipt(
    { impactEvents: 8 },
    7,
  );
  assert.equal(exactReleasedRouteImpact.safe, false);
  assert.equal(
    exactReleasedRouteImpact.reason,
    'released-route-observed-world-site-impact',
  );
  assert.equal(exactReleasedRouteImpact.impactEvents, 1);
});

test('PQ-017 run36 rejects the exact far-side cross-track drift and accepts low energy', () => {
  assert.equal(typeof pq017Route.evaluatePq017FarSideRelatch, 'function');
  const serviceGeometry = {
    tick: 8828,
    selectedComponentId: 'receiver_collar',
    player: { x: 798.6232299804688, z: -605.62158203125 },
    payload: {
      x: 757.0526123046875,
      z: -620.4880981445312,
      vx: 0,
      vz: 0,
    },
    tether: {
      active: true,
      targetMatches: true,
      automaticBreakAllowed: false,
      restLength: 44.96171371828106,
    },
    lineDistance: 44.1717844474429,
  };
  const crossingPlan = {
    safe: true,
    reason: null,
    shipRoute: { direct: true, waypoints: [{}] },
    launchGate: { maxPlayerCrossTrack: 1 },
    playerCrossTrack: 2.462881895518324,
    predictedReceiverMissAtRest: 1.089689735219082,
    strictDeliveryRadius: 7.05,
  };
  const drifted = pq017Route.evaluatePq017FarSideRelatch({
    serviceGeometry,
    settlementPosition: { x: 757.0526123046875, z: -620.4880981445312 },
    crossingPlan,
    latchTick: 8827,
  });
  assert.equal(drifted.safe, false);
  assert.deepEqual(drifted.failures, ['player-cross-track']);
  assert.equal(drifted.playerCrossTrack, 2.462881895518324);

  const lowEnergy = pq017Route.evaluatePq017FarSideRelatch({
    serviceGeometry: { ...serviceGeometry, tick: 8829 },
    settlementPosition: { x: 757.0526123046875, z: -620.4880981445312 },
    crossingPlan: { ...crossingPlan, playerCrossTrack: 0.25 },
    latchTick: 8828,
  });
  assert.equal(lowEnergy.safe, true);
  assert.deepEqual(lowEnergy.failures, []);

  const tightenedGate = pq017Route.evaluatePq017FarSideRelatch({
    serviceGeometry: { ...serviceGeometry, tick: 8830 },
    settlementPosition: { x: 757.0526123046875, z: -620.4880981445312 },
    crossingPlan: {
      ...crossingPlan,
      launchGate: { maxPlayerCrossTrack: 0.2 },
      playerCrossTrack: 0.25,
    },
    latchTick: 8829,
  });
  assert.equal(tightenedGate.safe, false,
    'relatch must consume the crossing plan gate instead of a duplicate default');
  assert.deepEqual(tightenedGate.failures, ['player-cross-track']);
});

test('PQ-017 attached standoff requires two distinct low-yaw aligned samples before W', () => {
  const decide = pq017Route.decidePq017AttachedStandoffRadialControl;
  const plan = {
    payloadAnchor: { x: 0, z: 0 },
    direction: { x: 1, z: 0 },
    target: { x: 24, z: 0 },
    targetDistance: 24,
    minimumReleaseDistance: 22,
    payoutRestLength: 26,
    corridorHalfWidth: 1,
    initialRadialDistance: 19.8,
    maximumRadialRetreat: 0.25,
    minimumRetainedSlack: 1,
    maximumRadialDistance: 25,
  };
  const sample = ({
    tick,
    rot = 0,
    angVel = 0,
    radialDistance = 19.8,
  }) => ({
    tick,
    player: { x: radialDistance, z: 0, vx: 0, vz: 0, rot, angVel },
    playerRadius: 14,
    payload: { x: 0, z: 0, vx: 0, vz: 0 },
    payloadAlive: true,
    payloadRadius: 6,
    tether: {
      active: true,
      targetMatches: true,
      automaticBreakAllowed: false,
      restLength: 26,
    },
    breakEvents: 0,
    impactEvents: 0,
  });

  const highYaw = decide(sample({ tick: 100, angVel: 1.2 }), plan);
  assert.equal(highYaw.action, 'settle-yaw');
  assert.equal(highYaw.reason, 'attached-standoff-yaw-rate-settle');
  assert.equal(highYaw.turnDirection, 0);
  assert.equal(highYaw.stableYawSamples, 0);
  assert.equal(highYaw.forward, false);

  const zeroCrossingOnly = decide(sample({ tick: 101, rot: 0, angVel: 0 }), plan, {
    lastTick: 100,
    lastPlayerRot: -0.2,
    stableYawSamples: 1,
  });
  assert.equal(zeroCrossingOnly.action, 'settle-yaw');
  assert.equal(zeroCrossingOnly.reason, 'attached-standoff-yaw-history-settle');
  assert.equal(zeroCrossingOnly.turnDirection, 0,
    'a stale batched yaw average may reset proof but must not inject a fresh opposite turn');
  assert.equal(zeroCrossingOnly.stableYawSamples, 0,
    'one instant of zero live angVel cannot hide a large normalized inter-sample yaw delta');
  assert(Math.abs(zeroCrossingOnly.sampledYawRate - 12) < 1e-9);

  const armed = decide(sample({ tick: 200 }), plan);
  assert.equal(armed.action, 'settle-yaw');
  assert.equal(armed.reason, 'attached-standoff-yaw-neutral-arming');
  assert.equal(armed.stableYawSamples, 0);
  assert.equal(armed.yawNeutralArmed, true);
  const stable1 = decide(sample({ tick: 201 }), plan, armed);
  assert.equal(stable1.action, 'settle-yaw');
  assert.equal(stable1.reason, 'attached-standoff-yaw-stability-confirming');
  assert.equal(stable1.stableYawSamples, 1);
  const unstableSecond = decide(sample({ tick: 202, rot: 0.01 }), plan, stable1);
  assert.equal(unstableSecond.action, 'settle-yaw');
  assert.equal(unstableSecond.reason, 'attached-standoff-yaw-history-settle');
  assert.equal(unstableSecond.turnDirection, 0);
  assert.equal(unstableSecond.stableYawSamples, 0);
  assert(Math.abs(unstableSecond.sampledYawRate - 0.6) < 1e-9);

  const stable2 = decide(sample({ tick: 202 }), plan, stable1);
  assert.equal(stable2.action, 'pulse-outward');
  assert.equal(stable2.stableYawSamples, 2);
  assert.equal(stable2.forward, true);
});

test('PQ-017 run30 residual yaw inertia cannot launch the first attached W pulse', () => {
  const decide = pq017Route.decidePq017AttachedStandoffRadialControl;
  const payloadAnchor = { x: 757.0526123046875, z: -620.4880981445312 };
  const direction = { x: -0.6735730154328047, z: -0.7391206889816837 };
  const desiredHeading = Math.atan2(direction.z, direction.x);
  const radialDistance = 17.604659561509457;
  const priorRot = -2.5054034911047975;
  const currentRot = -2.2798120982694865;
  const measuredAngVel = (currentRot - priorRot) * 60 / (2938 - 2933);
  const plan = {
    start: { x: 745.1414184570312, z: -633.5584106445312 },
    payloadAnchor,
    direction,
    target: {
      x: payloadAnchor.x + direction.x * 24,
      z: payloadAnchor.z + direction.z * 24,
    },
    targetDistance: 24,
    minimumReleaseDistance: 22,
    payoutRestLength: 26,
    initialRadialDistance: 17.683597137576403,
    corridorHalfWidth: 1,
    maximumRadialRetreat: 0.25,
    minimumRetainedSlack: 1,
    maximumRadialDistance: 25,
  };
  const observation = {
    tick: 2938,
    player: {
      x: payloadAnchor.x + direction.x * radialDistance,
      z: payloadAnchor.z + direction.z * radialDistance,
      vx: direction.x * -0.17886664928019547,
      vz: direction.z * -0.17886664928019547,
      rot: currentRot,
      angVel: measuredAngVel,
    },
    playerRadius: 14,
    payload: { ...payloadAnchor, vx: 0, vz: 0 },
    payloadAlive: true,
    payloadRadius: 6,
    tether: {
      active: true,
      targetMatches: true,
      automaticBreakAllowed: false,
      restLength: 29.090030288743588,
    },
    breakEvents: 0,
    impactEvents: 0,
  };
  const result = decide(observation, plan, {
    lastTick: 2933,
    lastPlayerRot: priorRot,
    stableYawSamples: 0,
    outwardPulses: 0,
  });
  assert(Math.abs(result.headingError - (-0.03001657646559064)) < 1e-9);
  assert(Math.abs(result.sampledYawRate - measuredAngVel) < 1e-9);
  assert.equal(result.action, 'settle-yaw');
  assert.equal(result.reason, 'attached-standoff-yaw-rate-settle');
  assert.equal(result.turnDirection, 0);
  assert.equal(result.forward, false);
  assert.equal(result.outwardPulses, 0);
  assert.equal(result.stableYawSamples, 0);
  assert(Math.abs(desiredHeading - currentRot - result.headingError) < 1e-9);
});

test('PQ-017 run31 yaw controller brakes the exact batched oscillation before zero-cross', () => {
  const decide = pq017Route.decidePq017AttachedStandoffRadialControl;
  const payloadAnchor = { x: 757.0526123046875, z: -620.4880981445312 };
  const direction = { x: 0.30528172611300314, z: -0.9522620793150726 };
  const plan = {
    start: { x: 763.313232421875, z: -640.0167846679688 },
    payloadAnchor,
    direction,
    target: {
      x: payloadAnchor.x + direction.x * 24,
      z: payloadAnchor.z + direction.z * 24,
    },
    targetDistance: 24,
    minimumReleaseDistance: 22,
    payoutRestLength: 26,
    initialRadialDistance: 20.507680551013618,
    corridorHalfWidth: 1,
    maximumRadialRetreat: 0.25,
    minimumRetainedSlack: 1,
    maximumRadialDistance: 25,
  };
  const trace = [
    {
      tick: 3094,
      rot: -0.7793111510413127,
      angVel: 2.802596928649634e-45,
      radialDistance: 20.440085996987214,
      expectedTurnDirection: -1,
    },
    {
      tick: 3109,
      rot: -0.8793394387167259,
      angVel: -1.6360822916030884,
      radialDistance: 20.396002592187386,
      expectedTurnDirection: 0,
    },
    {
      tick: 3123,
      rot: -1.5905242255941434,
      angVel: -3.695364475250244,
      radialDistance: 20.354858081040877,
      expectedTurnDirection: 0,
    },
    {
      tick: 3137,
      rot: -2.2762316705894463,
      angVel: -1.3911316394805908,
      radialDistance: 20.313713569894368,
      expectedTurnDirection: 0,
    },
    {
      tick: 3149,
      rot: -2.2579965689050154,
      angVel: 1.474470615386963,
      radialDistance: 20.278446846054507,
      expectedTurnDirection: 0,
    },
  ];
  let runtime = {};
  for (const sample of trace) {
    const result = decide({
      tick: sample.tick,
      player: {
        x: payloadAnchor.x + direction.x * sample.radialDistance,
        z: payloadAnchor.z + direction.z * sample.radialDistance,
        vx: direction.x * -0.17809235766278902,
        vz: direction.z * -0.17809235766278902,
        rot: sample.rot,
        angVel: sample.angVel,
      },
      playerRadius: 14,
      payload: { ...payloadAnchor, vx: 0, vz: 0 },
      payloadAlive: true,
      payloadRadius: 6,
      tether: {
        active: true,
        targetMatches: true,
        automaticBreakAllowed: false,
        restLength: 27.02800208784427,
      },
      breakEvents: 0,
      impactEvents: 0,
    }, plan, runtime);
    assert.equal(result.safe, true, `run31 tick ${sample.tick} must remain inside every hard gate`);
    assert.equal(result.action, sample.tick === 3094 ? 'align' : 'settle-yaw');
    assert.equal(result.turnDirection, sample.expectedTurnDirection,
      `run31 tick ${sample.tick} must brake fresh live yaw before another heading tap`);
    assert.equal(result.forward, false);
    assert.equal(result.outwardPulses, 0);
    runtime = result;
  }

  assert.equal(typeof pq017Route.decidePq017AttachedStandoffReplan, 'function');
  const replan = pq017Route.decidePq017AttachedStandoffReplan({
    safe: true,
    action: 'settle-yaw',
    lastTick: 3123,
    radialDistance: 20.354858081040877,
    farthestRadialDistance: plan.initialRadialDistance,
    radialSpeed: -0.17809235766278902,
    outwardPulses: 0,
  }, plan, {
    lastTick: 3109,
    radialReplans: 0,
  });
  assert.equal(replan.action, 'replan');
  assert(replan.projectedRadialRetreat >= plan.maximumRadialRetreat * 0.75);

  const crossedHardGate = pq017Route.decidePq017AttachedStandoffReplan({
    ...replan,
    safe: false,
    action: 'blocked',
    radialDistance: plan.initialRadialDistance - plan.maximumRadialRetreat - 0.008623,
  }, plan, {
    lastTick: 3149,
    radialReplans: 0,
  });
  assert.equal(crossedHardGate.action, 'defer-to-hard-gate',
    'replanning must never erase an already-crossed hard retreat gate');

  const exhausted = pq017Route.decidePq017AttachedStandoffReplan({
    safe: true,
    action: 'settle-yaw',
    lastTick: 3123,
    radialDistance: 20.354858081040877,
    farthestRadialDistance: plan.initialRadialDistance,
    radialSpeed: -0.17809235766278902,
    outwardPulses: 0,
  }, plan, {
    lastTick: 3109,
    radialReplans: 3,
  });
  assert.equal(exhausted.action, 'blocked');
  assert.equal(exhausted.reason, 'attached-standoff-replan-budget-exhausted');
});

test('PQ-017 run33 pre-plan yaw re-anchors before drift and preserves the exact crossed gate', () => {
  assert.equal(typeof pq017Route.decidePq017PrePlanYawReanchor, 'function');
  const preflight = { safe: true, action: 'clear', reason: 'standoff-route-clear' };
  const candidate = pq017Route.decidePq017PrePlanYawReanchor({
    safe: true,
    action: 'align',
    lastTick: 3955,
    playerDrift: 1.91,
    playerSpeed: 0.1795675175204711,
    maxPlayerDrift: 2,
  }, preflight, {
    lastTick: 3929,
    yawReanchors: 0,
  }, {
    reanchorThreshold: 2 * 0.75,
  });
  assert.equal(candidate.action, 'reanchor');
  assert.equal(candidate.nextYawReanchors, 1);
  assert.equal(candidate.turnDirection, 0);
  assert(candidate.projectedPlayerDrift > candidate.reanchorThreshold);

  const alreadyAligned = pq017Route.decidePq017PrePlanYawReanchor({
    safe: true,
    action: 'aligned',
    lastTick: 3955,
    playerDrift: 1.91,
    playerSpeed: 0.1795675175204711,
    maxPlayerDrift: 2,
  }, preflight, {
    lastTick: 3929,
    yawReanchors: 0,
  }, {
    reanchorThreshold: 1.5,
  });
  assert.equal(alreadyAligned.action, 'proceed');

  const payloadAnchor = { x: 757.0526123046875, z: -620.4880981445312 };
  const crossed = pq017Route.decidePq017StandoffYawAlignment({
    tick: 3980,
    player: {
      x: 746.7205200195312,
      z: -606.4915161132812,
      vx: 0.12249022722244263,
      vz: -0.131303608417511,
      rot: 2.1688160836207855,
      angVel: -2.206720900629173e-27,
    },
    payload: { ...payloadAnchor, vx: 0, vz: 0 },
    payloadAlive: true,
    tether: {
      active: true,
      targetMatches: true,
      automaticBreakAllowed: false,
      restLength: 35.76381535152392,
    },
    breakEvents: 0,
    impactEvents: 0,
  }, {
    playerOrigin: { x: 745.3650512695312, z: -604.9666137695312 },
    payloadAnchor,
    lastTick: 3955,
    bestAbsoluteHeadingError: 0.15509035750175615,
    distinctTicks: 33,
    stagnantTicks: 0,
  }, {
    payloadAnchor,
    targetDistance: 24,
    corridorHalfWidth: 1,
    usableCorridor: 0.75,
  });
  assert.equal(crossed.safe, false);
  assert.equal(crossed.reason, 'standoff-yaw-player-drift-exceeded');
  assert(Math.abs(crossed.playerDrift - 2.040250643965296) < 1e-9);
  const crossedDecision = pq017Route.decidePq017PrePlanYawReanchor(
    crossed,
    preflight,
    { lastTick: 3955, yawReanchors: 0 },
    { reanchorThreshold: 1.5 },
  );
  assert.equal(crossedDecision.action, 'defer-to-hard-gate');

  const exhausted = pq017Route.decidePq017PrePlanYawReanchor({
    safe: true,
    action: 'align',
    lastTick: 3955,
    playerDrift: 1.91,
    playerSpeed: 0.1795675175204711,
    maxPlayerDrift: 2,
  }, preflight, {
    lastTick: 3929,
    yawReanchors: 1,
  }, {
    reanchorThreshold: 1.5,
  });
  assert.equal(exhausted.action, 'blocked');
  assert.equal(exhausted.reason, 'standoff-yaw-reanchor-budget-exhausted');
});

test('PQ-017 run30 terminal cross-track sample remains a hard rejection', () => {
  const decide = pq017Route.decidePq017AttachedStandoffRadialControl;
  const payloadAnchor = { x: 757.0526123046875, z: -620.4880981445312 };
  const plan = {
    start: { x: 745.1414184570312, z: -633.5584106445312 },
    payloadAnchor,
    direction: { x: -0.6735730154328047, z: -0.7391206889816837 },
    target: { x: 740.8868599343002, z: -638.2269946800917 },
    targetDistance: 24,
    minimumReleaseDistance: 22,
    payoutRestLength: 26,
    initialRadialDistance: 17.683597137576403,
    corridorHalfWidth: 1,
    maximumRadialRetreat: 0.25,
    minimumRetainedSlack: 1,
    maximumRadialDistance: 25,
  };
  const result = decide({
    tick: 3238,
    player: {
      x: 743.0857543945312,
      z: -637.3115234375,
      vx: -0.3081745505332947,
      vz: -0.4092811346054077,
      rot: -1.858001755070938,
      angVel: 0,
    },
    playerRadius: 14,
    payload: { ...payloadAnchor, vx: 0, vz: 0 },
    payloadAlive: true,
    payloadRadius: 6,
    tether: {
      active: true,
      targetMatches: true,
      automaticBreakAllowed: false,
      restLength: 29.090030288743588,
    },
    breakEvents: 0,
    impactEvents: 0,
  }, plan, {
    lastTick: 3222,
    lastPlayerRot: -1.858001755070938,
    outwardPulses: 1,
    lastPulseRadialDistance: 17.604659561509457,
    outwardProgressObserved: true,
    farthestRadialDistance: 21.70329774739045,
    stableYawSamples: 0,
  });
  assert.equal(result.safe, false);
  assert.equal(result.reason, 'attached-standoff-left-radial-corridor');
  assert(Math.abs(result.crossTrack - 1.0086116630295106) < 1e-9);
});

test('PQ-017 standoff preflight waits only for moving traffic and times out fail-closed', () => {
  assert.equal(typeof pq017Route.evaluatePq017StandoffPreflight, 'function');
  assert.equal(typeof pq017Route.decidePq017StandoffTrafficWait, 'function');
  const evaluate = pq017Route.evaluatePq017StandoffPreflight;
  const decideWait = pq017Route.decidePq017StandoffTrafficWait;
  const payloadAnchor = { x: 757.0526123046875, z: -620.4880981445312 };
  const target = { x: 771.6090232437803, z: -639.5697883362376 };
  const direction = {
    x: (target.x - payloadAnchor.x) / 24,
    z: (target.z - payloadAnchor.z) / 24,
  };
  const start = {
    x: payloadAnchor.x + direction.x * 21.86868666841795,
    z: payloadAnchor.z + direction.z * 21.86868666841795,
  };
  const proofEndpoint = {
    x: payloadAnchor.x + direction.x * 25,
    z: payloadAnchor.z + direction.z * 25,
  };
  const midpoint = {
    x: (start.x + proofEndpoint.x) * 0.5,
    z: (start.z + proofEndpoint.z) * 0.5,
  };
  const normal = { x: -direction.z, z: direction.x };
  const blockedOffset = 30 - 0.4862151335853966;
  const traffic = {
    entityId: 297,
    type: 'ship',
    role: 'patrol',
    x: midpoint.x + normal.x * blockedOffset,
    z: midpoint.z + normal.z * blockedOffset,
    vx: normal.x * 10,
    vz: normal.z * 10,
    radius: 14,
    collides: true,
  };
  const plan = { start, proofEndpoint };
  const blocked = evaluate(plan, [traffic], 14);
  assert.equal(blocked.safe, false);
  assert.equal(blocked.action, 'wait-traffic');
  assert.equal(blocked.closestConstraint.entityId, 297);
  assert(Math.abs(blocked.closestConstraint.clearance - (-0.4862151335853966))
    < 1e-9);

  const movedTraffic = {
    ...traffic,
    x: traffic.x + traffic.vx,
    z: traffic.z + traffic.vz,
  };
  const cleared = evaluate(plan, [movedTraffic], 14);
  assert.equal(cleared.safe, true);
  assert.equal(cleared.action, 'clear');

  const staticSiteSolid = {
    ...traffic,
    entityId: 319,
    type: 'wreck',
    worldSiteId: 'world_site_helios_relay',
    worldRecordId: 'world_site_helios_relay/component/cargo_brace',
    vx: 0,
    vz: 0,
  };
  const staticBlocked = evaluate(plan, [staticSiteSolid], 14);
  assert.equal(staticBlocked.safe, false);
  assert.equal(staticBlocked.action, 'blocked-static');

  const firstWait = decideWait(blocked, {}, {
    currentTick: 1_000,
    maxTrafficTicks: 12,
  });
  assert.equal(firstWait.action, 'wait');
  assert.equal(firstWait.startedTick, 1_000);
  const secondWait = decideWait(blocked, firstWait, {
    currentTick: 1_006,
    maxTrafficTicks: 12,
  });
  assert.equal(secondWait.action, 'wait');
  assert.equal(secondWait.elapsedTicks, 6);
  const timedOut = decideWait(blocked, secondWait, {
    currentTick: 1_012,
    maxTrafficTicks: 12,
  });
  assert.equal(timedOut.safe, false);
  assert.equal(timedOut.reason, 'standoff-traffic-clearance-timeout');
  const clear1 = decideWait(cleared, {}, { currentTick: 2_000 });
  assert.equal(clear1.action, 'confirm-clear');
  const clear2 = decideWait(cleared, clear1, { currentTick: 2_006 });
  assert.equal(clear2.action, 'confirm-clear');
  const clear3 = decideWait(cleared, clear2, { currentTick: 2_012 });
  assert.equal(clear3.action, 'proceed');
  const boundaryClear = decideWait(cleared, clear2, {
    currentTick: 2_360,
    maxTrafficTicks: 360,
  });
  assert.equal(boundaryClear.action, 'proceed');
  const lateClear = decideWait(cleared, clear2, {
    currentTick: 2_366,
    maxTrafficTicks: 360,
  });
  assert.equal(lateClear.safe, false);
  assert.equal(lateClear.reason, 'standoff-traffic-clearance-timeout');
  const interrupted = decideWait(blocked, clear2, { currentTick: 2_018 });
  assert.equal(interrupted.clearSamples, 0);
  assert.equal(decideWait(staticBlocked, {}, { currentTick: 3_000 }).reason,
    'standoff-static-route-blocked');
});

test('PQ-017 run29 static preflight permits only the exact physical-clear outward margin egress', () => {
  const plan = {
    start: { x: 747.40673828125, z: -636.8251342773438 },
    proofEndpoint: { x: 741.6448816487567, z: -646.583882916234 },
  };
  const cargoBrace = {
    entityId: 286,
    worldRecordId: 'world_site_helios_relay/component/cargo_brace',
    type: 'wreck',
    x: 756.3493527228792,
    z: -621.6519416621679,
    radius: 1.6199999999999999,
    collides: true,
  };
  const physical = auditPq017RouteSweep(
    plan.start,
    plan.proofEndpoint,
    [cargoBrace],
    14,
    { requiredClearance: 0 },
  );
  assert.equal(physical.safe, true);
  assert(Math.abs(physical.closestConstraint.clearance - 1.992385618900725) < 1e-9);
  const advisory = auditPq017RouteSweep(
    plan.start,
    plan.proofEndpoint,
    [cargoBrace],
    14,
    { requiredClearance: 2 },
  );
  assert.equal(advisory.safe, false);
  assert(Math.abs(advisory.closestConstraint.clearance - (-0.00761438109927326)) < 1e-9);

  const accepted = pq017Route.evaluatePq017StandoffPreflight(plan, [cargoBrace], 14);
  assert.equal(accepted.safe, true);
  assert.equal(accepted.action, 'clear');
  assert.equal(accepted.staticPhysicalSweep.safe, true);
  assert.equal(accepted.staticSweep.safe, true);
  assert.equal(accepted.staticSweep.advisoryEgresses.length, 1);
  assert.equal(accepted.staticSweep.advisoryEgresses[0].entityId, 286);
  assert(accepted.staticSweep.advisoryEgresses[0].outwardProgress > 11.33);
});

test('PQ-017 static margin egress never permits physical overlap or incomplete outward clearance', () => {
  const obstacle = {
    entityId: 286,
    type: 'wreck',
    x: 0,
    z: 0,
    radius: 1,
    collides: true,
  };
  const evaluate = (start, proofEndpoint) => pq017Route.evaluatePq017StandoffPreflight(
    { start, proofEndpoint },
    [obstacle],
    9,
    { requiredClearance: 2 },
  );

  const physicalContact = evaluate({ x: 10, z: 0 }, { x: 20, z: 0 });
  assert.equal(physicalContact.safe, false);
  assert.equal(physicalContact.action, 'blocked-static');
  assert.equal(physicalContact.staticPhysicalSweep.safe, false);

  const endpointInsideMargin = evaluate({ x: 11, z: 0 }, { x: 11.5, z: 0 });
  assert.equal(endpointInsideMargin.safe, false);
  assert.equal(endpointInsideMargin.action, 'blocked-static');
  assert.equal(endpointInsideMargin.staticPhysicalSweep.safe, true);
  assert.equal(endpointInsideMargin.staticSweep.safe, false);
});

test('PQ-017 static margin egress rejects inward, tangent, later-reentry, and traffic paths', () => {
  const staticObstacle = {
    entityId: 286,
    type: 'wreck',
    x: 0,
    z: 0,
    radius: 1,
    collides: true,
  };
  const evaluateStatic = (start, proofEndpoint) => pq017Route.evaluatePq017StandoffPreflight(
    { start, proofEndpoint },
    [staticObstacle],
    9,
    { requiredClearance: 2 },
  );

  const inward = evaluateStatic({ x: 11, z: 0 }, { x: 10.5, z: 0 });
  assert.equal(inward.action, 'blocked-static');
  assert.equal(inward.staticPhysicalSweep.safe, true);

  const tangent = evaluateStatic({ x: 11, z: 0 }, { x: 11, z: 10 });
  assert.equal(tangent.action, 'blocked-static');
  assert.equal(tangent.staticPhysicalSweep.safe, true);

  const laterReentry = evaluateStatic({ x: 13, z: 0 }, { x: -13, z: 0 });
  assert.equal(laterReentry.action, 'blocked-static');
  assert.equal(laterReentry.staticPhysicalSweep.safe, false);

  const traffic = pq017Route.evaluatePq017StandoffPreflight(
    { start: { x: 11, z: 0 }, proofEndpoint: { x: 20, z: 0 } },
    [{ ...staticObstacle, type: 'ship' }],
    9,
    { requiredClearance: 2 },
  );
  assert.equal(traffic.safe, false);
  assert.equal(traffic.action, 'wait-traffic');
  assert.equal(traffic.trafficSweep.advisoryEgresses, undefined);
});

test('PQ-017 neutral standoff settlement is fixed-anchor, distinct-tick, and tightly bounded', () => {
  assert.equal(typeof pq017Route.decidePq017StandoffNeutralSettlement, 'function');
  const decide = pq017Route.decidePq017StandoffNeutralSettlement;
  const sample = ({
    tick = 400,
    player = { x: 10, z: 20, vx: 0.78, vz: 0 },
    payload = { x: 0, z: 0, vx: 0, vz: 0 },
    restLength = 31,
    breakEvents = 0,
    impactEvents = 0,
  } = {}) => ({
    tick,
    player,
    payload,
    payloadAlive: true,
    tether: {
      active: true,
      targetMatches: true,
      automaticBreakAllowed: false,
      restLength,
    },
    breakEvents,
    impactEvents,
  });
  const seeded = decide(sample(), {}, {
    payloadAnchor: { x: 0, z: 0 },
  });
  assert.equal(seeded.action, 'wait');
  assert.equal(seeded.distinctTicks, 0);
  const duplicate = decide(sample(), seeded, {
    payloadAnchor: { x: 0, z: 0 },
  });
  assert.equal(duplicate.distinctTicks, 0);
  const stable1 = decide(sample({
    tick: 401,
    player: { x: 10.01, z: 20, vx: 0.3, vz: 0 },
  }), duplicate, { payloadAnchor: { x: 0, z: 0 } });
  assert.equal(stable1.action, 'wait');
  assert.equal(stable1.stableSamples, 1);
  const stable2 = decide(sample({
    tick: 402,
    player: { x: 10.02, z: 20, vx: 0.2, vz: 0 },
  }), stable1, { payloadAnchor: { x: 0, z: 0 } });
  assert.equal(stable2.action, 'settled');
  assert.equal(stable2.stableSamples, 2);

  const driftedPlayer = decide(sample({
    tick: 403,
    player: { x: 12.01, z: 20, vx: 0, vz: 0 },
  }), stable2, { payloadAnchor: { x: 0, z: 0 } });
  assert.equal(driftedPlayer.safe, false);
  assert.equal(driftedPlayer.reason, 'standoff-neutral-player-drift-exceeded');
  const driftedPayload = decide(sample({
    tick: 403,
    payload: { x: 1.01, z: 0, vx: 0, vz: 0 },
  }), stable2, { payloadAnchor: { x: 0, z: 0 } });
  assert.equal(driftedPayload.safe, false);
  assert.equal(driftedPayload.reason, 'standoff-neutral-payload-drift-exceeded');
  const slackLost = decide(sample({ tick: 403, restLength: 21.5 }), stable2, {
    payloadAnchor: { x: 0, z: 0 },
  });
  assert.equal(slackLost.safe, false);
  assert.equal(slackLost.reason, 'standoff-neutral-slack-lost');
  const run25NearPayload = decide(sample({
    tick: 500,
    player: { x: 19.9787, z: 0, vx: 0.1795, vz: 0 },
    restLength: 30.181,
  }), {}, {
    payloadAnchor: { x: 0, z: 0 },
    minimumAnchorLineDistance: 19.7287,
  });
  assert.equal(run25NearPayload.safe, true);
  assert.equal(run25NearPayload.action, 'wait');
  assert.equal(run25NearPayload.anchorLineDistance, 19.9787);
  const excessiveRetreat = decide(sample({
    tick: 501,
    player: { x: 19.72, z: 0, vx: 0, vz: 0 },
    restLength: 30.181,
  }), run25NearPayload, {
    payloadAnchor: { x: 0, z: 0 },
    minimumAnchorLineDistance: 19.7287,
  });
  assert.equal(excessiveRetreat.safe, false);
  assert.equal(excessiveRetreat.reason, 'standoff-neutral-anchor-retreat-exceeded');
  const broken = decide(sample({ tick: 403, breakEvents: 1 }), stable2, {
    payloadAnchor: { x: 0, z: 0 },
  });
  assert.equal(broken.reason, 'standoff-neutral-observed-break');

  let exhausted = decide(sample(), {}, {
    payloadAnchor: { x: 0, z: 0 },
    maxDistinctTicks: 2,
  });
  exhausted = decide(sample({ tick: 401 }), exhausted, {
    payloadAnchor: { x: 0, z: 0 },
    maxDistinctTicks: 2,
  });
  exhausted = decide(sample({ tick: 402 }), exhausted, {
    payloadAnchor: { x: 0, z: 0 },
    maxDistinctTicks: 2,
  });
  assert.equal(exhausted.safe, false);
  assert.equal(exhausted.reason, 'standoff-neutral-settlement-timeout');
});

test('PQ-017 waypoint timeout extends only for recent material safe progress', () => {
  const capturedNavigation = {
    distance: 81.36262127036532,
    speed: 13.943045941369421,
    closingSpeed: 13.890320518522518,
    headingError: 0.2504177522050973,
  };
  const capturedDecision = { action: 'approach', thrust: true };
  const progress = {
    startDistance: 150,
    bestDistance: capturedNavigation.distance,
    lastProgressAt: 99_000,
    now: 100_000,
    extensions: 0,
  };
  const options = { extensionMs: 15_000, maxExtensions: 2, staleAfterMs: 5_000 };
  assert.deepEqual(
    decidePq017WaypointProgressExtension(
      capturedNavigation, capturedDecision, progress, options,
    ),
    { extend: true, reason: 'healthy-material-progress', extensionMs: 15_000 },
    'the exact Browser cutoff was healthy convergence eligible for a bounded extension',
  );
  const strictDecision = { action: 'approach', thrust: true };
  let epochProgress = updatePq017WaypointProgressEpoch({
    tick: 1,
    distance: 162.45,
    speed: 14,
    closingSpeed: 13.9,
    headingError: -0.2,
  }, strictDecision, { extensions: 0 }, { now: 1_000 });
  epochProgress = updatePq017WaypointProgressEpoch({
    tick: 2,
    distance: 28.204,
    speed: 8,
    closingSpeed: 7,
    headingError: 0.1,
  }, strictDecision, epochProgress, { now: 2_000 });
  const retreatNavigation = {
    tick: 3,
    distance: 100,
    speed: 15,
    closingSpeed: -8,
    headingError: 1,
  };
  const retreatDecision = { action: 'velocity-align', thrust: false };
  epochProgress = updatePq017WaypointProgressEpoch(
    retreatNavigation,
    retreatDecision,
    epochProgress,
    { now: 3_000 },
  );
  assert.equal(epochProgress.freshEpochPending, true,
    'a material overshoot must invalidate the old local approach epoch');
  assert.equal(decidePq017WaypointProgressExtension(
    retreatNavigation,
    retreatDecision,
    { ...epochProgress, now: 3_000 },
    { extensionMs: 15_000, maxExtensions: 2 },
  ).extend, false, 'the retreat sample itself cannot earn an extension');

  epochProgress = updatePq017WaypointProgressEpoch({
    tick: 4,
    distance: 80,
    speed: 14.8,
    closingSpeed: 14.7,
    headingError: -0.25,
  }, strictDecision, epochProgress, { now: 4_000 });
  assert.equal(epochProgress.epochStartDistance, 80,
    'the first strict reacquire sample starts, but does not progress, a fresh epoch');
  const duplicateEpoch = updatePq017WaypointProgressEpoch({
    tick: 4,
    distance: 70,
    speed: 14.8,
    closingSpeed: 14.7,
    headingError: -0.25,
  }, strictDecision, epochProgress, { now: 4_100 });
  assert.equal(duplicateEpoch.epochBestDistance, 80,
    'repeated wall polls in one simulation tick cannot fabricate local progress');

  const exactReacquireNavigation = {
    tick: 5,
    distance: 57.936,
    speed: 14.919,
    closingSpeed: 14.909,
    headingError: -0.247,
  };
  epochProgress = updatePq017WaypointProgressEpoch(
    exactReacquireNavigation,
    strictDecision,
    epochProgress,
    { now: 5_000 },
  );
  assert.equal(epochProgress.bestDistance, 28.204,
    'global diagnostic best remains truthful across the overshoot');
  assert.equal(epochProgress.epochBestDistance, 57.936,
    'extension eligibility must use the fresh local approach best');
  assert.deepEqual(decidePq017WaypointProgressExtension(
    exactReacquireNavigation,
    strictDecision,
    { ...epochProgress, now: 5_000 },
    { extensionMs: 15_000, maxExtensions: 2, staleAfterMs: 5_000 },
  ), {
    extend: true,
    reason: 'healthy-material-progress',
    extensionMs: 15_000,
  }, 'the eighth exact healthy reacquire must qualify on fresh local progress');
  for (const [label, navigation, decision, progressOverride] of [
    ['brake', exactReacquireNavigation, { action: 'brake', thrust: false }, {}],
    ['velocity align', exactReacquireNavigation,
      { action: 'velocity-align', thrust: false }, {}],
    ['zero closure', { ...exactReacquireNavigation, closingSpeed: 0 },
      strictDecision, {}],
    ['stale local progress', exactReacquireNavigation,
      strictDecision, { lastProgressAt: 0 }],
    ['epoch hard cap', exactReacquireNavigation,
      strictDecision, { extensions: 2 }],
  ]) {
    assert.equal(decidePq017WaypointProgressExtension(
      navigation,
      decision,
      { ...epochProgress, ...progressOverride, now: 10_000 },
      { extensionMs: 15_000, maxExtensions: 2, staleAfterMs: 5_000 },
    ).extend, false, `${label} must not extend a local progress epoch`);
  }
  const healthyRingNavigation = {
    distance: 101.104,
    speed: 15.243,
    closingSpeed: 15.216,
    headingError: -0.19,
    velocityHeadingError: 0,
  };
  const healthyRingDecision = decidePq017SettledArrivalControl(healthyRingNavigation, {
    settledRadius: 16,
    maxSettledSpeed: 6,
    brakeAccel: 12,
    maxApproachSpeed: 16,
  });
  assert.equal(healthyRingDecision.action, 'approach');
  assert.equal(healthyRingDecision.thrust, true);
  assert.deepEqual(decidePq017WaypointProgressExtension(
    healthyRingNavigation,
    healthyRingDecision,
    {
      startDistance: 198.175,
      bestDistance: 101.104,
      lastProgressAt: 99_000,
      now: 100_000,
      extensions: 0,
    },
    { extensionMs: 15_000, maxExtensions: 1, staleAfterMs: 5_000 },
  ), {
    extend: true,
    reason: 'healthy-material-progress',
    extensionMs: 15_000,
  }, 'the fifth exact Browser ring cutoff needs one bounded extension to reach its proven 48-WU gate');

  const brakeOscillationNavigation = {
    distance: 32.242719516132816,
    speed: 10.31912875523474,
    closingSpeed: 8.942121557504587,
    headingError: 0.006243779437543395,
    directStoppingDistance: 1.3287315298175124,
  };
  const brakeOscillationDecision = decidePq017SettledArrivalControl(
    brakeOscillationNavigation,
    {
      settledRadius: 16,
      maxSettledSpeed: 6,
      brakeAccel: 12,
      maxApproachSpeed: 16,
    },
  );
  assert.equal(brakeOscillationDecision.action, 'brake');
  assert.equal(decidePq017WaypointProgressExtension(
    brakeOscillationNavigation,
    brakeOscillationDecision,
    {
      startDistance: 140,
      bestDistance: brakeOscillationNavigation.distance,
      lastProgressAt: 99_000,
      now: 100_000,
      extensions: 0,
    },
    { extensionMs: 15_000, maxExtensions: 1, staleAfterMs: 5_000 },
  ).extend, false, 'the prior exact brake oscillation must not purchase more wall-clock time');

  const priorRetreatNavigation = {
    distance: 44.303882386960785,
    speed: 15.771759576591626,
    closingSpeed: -7.381694779241763,
    headingError: 0.13162602666972845,
    velocityHeadingError: -2.096,
    directStoppingDistance: 5.044172355750919,
  };
  const priorRetreatDecision = decidePq017SettledArrivalControl(priorRetreatNavigation, {
    settledRadius: 16,
    maxSettledSpeed: 6,
    brakeAccel: 12,
    maxApproachSpeed: 16,
  });
  assert.equal(priorRetreatDecision.action, 'velocity-align');
  assert.equal(decidePq017WaypointProgressExtension(
    priorRetreatNavigation,
    priorRetreatDecision,
    {
      startDistance: 140,
      bestDistance: priorRetreatNavigation.distance,
      lastProgressAt: 99_000,
      now: 100_000,
      extensions: 0,
    },
    { extensionMs: 15_000, maxExtensions: 1, staleAfterMs: 5_000 },
  ).extend, false, 'a retreating velocity-align state must remain ineligible for extension');

  for (const [label, navigation, decision, overrides] of [
    ['zero closure', { ...capturedNavigation, closingSpeed: 0 }, capturedDecision, {}],
    ['retreat', { ...capturedNavigation, closingSpeed: -4 }, capturedDecision, {}],
    ['unsafe control', capturedNavigation, { action: 'brake', thrust: false }, {}],
    ['stale progress', capturedNavigation, capturedDecision, { lastProgressAt: 90_000 }],
    ['no material progress', capturedNavigation, capturedDecision, { startDistance: 83 }],
    ['hard extension cap', capturedNavigation, capturedDecision, { extensions: 2 }],
  ]) {
    const result = decidePq017WaypointProgressExtension(
      navigation, decision, { ...progress, ...overrides }, options,
    );
    assert.equal(result.extend, false, `${label} must remain fail-closed`);
  }
});

test('PQ-017 impact staging uses the component radial from the site root', () => {
  assert.deepEqual(
    choosePq017ImpactStagingReference(
      { x: -20, z: 0 }, { x: 10, z: 0 }, { x: 0, z: 0 },
    ),
    { x: 11, z: 0, source: 'site-outward-radial' },
    'an approach from the inboard side must still stage away from the structure',
  );
  assert.deepEqual(
    choosePq017ImpactStagingReference(
      { x: 4, z: 5 }, { x: 0, z: 0 }, { x: 0, z: 0 },
    ),
    { x: 4, z: 5, source: 'player-radial' },
    'a root-coincident component must use the deterministic player radial fallback',
  );
});

test('PQ-017 ring pass-through gates derive from outgoing clearance and fail closed', () => {
  const capturedProof = derivePq017RingPassThroughProof(37.885);
  assert.equal(capturedProof.safe, true);
  assert(capturedProof.radius > 32.447,
    'the captured 32.447-WU best approach must cross its dynamically proven live-route gate');
  assert(capturedProof.residualPhysicalClearance
    >= capturedProof.requiredDynamicClearance,
  'the positional gate must reserve physical margin, stopping distance, and one sampled step');
  const waypoint = { x: 0, z: 0, phase: 'ring' };
  const outgoingEnd = { x: 100, z: 0, phase: 'ring' };
  assert.equal(evaluatePq017RingPassThrough(
    { x: 32.447, z: 0 },
    waypoint,
    { ...capturedProof, outgoingEnd },
    { obstacles: [], playerRadius: 14 },
  ).advance, true);

  const narrowerProof = derivePq017RingPassThroughProof(16);
  assert(narrowerProof.radius < 32.447);
  assert(narrowerProof.residualPhysicalClearance
    >= narrowerProof.requiredDynamicClearance);
  assert.equal(evaluatePq017RingPassThrough(
    { x: 32.447, z: 0 },
    waypoint,
    { ...narrowerProof, outgoingEnd },
    { obstacles: [], playerRadius: 14 },
  ).advance, false,
  'the same sample must not advance when its proven gate is only 32 WU');

  for (const clearance of [0, -0.001, -20]) {
    const refused = derivePq017RingPassThroughProof(clearance);
    assert.equal(refused.safe, false);
    assert.equal(refused.reason, 'outgoing-segment-not-clear',
      'a tangent or blocked planner segment cannot create a pass-through gate');
    assert.equal(refused.radius, 0);
  }
  const capped = derivePq017RingPassThroughProof(100);
  assert.equal(capped.radius, 48, 'large clearances must retain a bounded transition radius');
  assert(capped.residualPhysicalClearance >= 2);

  const inconsistentProof = derivePq017RingPassThroughProof(20);
  const blockedConnector = evaluatePq017RingPassThrough(
    { x: 10, z: 0 },
    waypoint,
    { ...inconsistentProof, outgoingEnd },
    {
      obstacles: [{ entityId: 99, x: 50, z: 0, radius: 20 }],
      playerRadius: 14,
    },
  );
  assert.equal(blockedConnector.advance, false);
  assert.equal(blockedConnector.reason, 'outgoing-connector-blocked',
    'live geometry must veto a stale or inconsistent planner proof');
});

test('PQ-017 released payload overlap permits only fixed-origin outward escape', () => {
  const payload = {
    entityId: 'released-payload',
    type: 'world_site_payload',
    x: 757.0526123046875,
    z: -620.4880981445312,
    radius: 6,
    allowEscapeFromOverlap: true,
  };
  const origin = { x: 742.9163818359375, z: -629.6524047851562 };
  const ringEntry = { x: 626, z: -704 };
  const contexts = createPq017ScopedEscapeContexts(origin, ringEntry, [payload], 14);
  assert.equal(contexts['entity:released-payload'].active, true);
  assert.equal(auditPq017RouteSweep(origin, ringEntry, [payload], 14).safe, false,
    'payload metadata alone must not authorize an instantaneous or repeat escape');
  assert.equal(auditPq017RouteSweep(
    origin,
    ringEntry,
    [payload],
    14,
    { escapeContexts: contexts },
  ).safe, true,
  'the same outward segment is authorized only by its fixed-origin active context');

  const previous = { x: 743.630, z: -632.121 };
  const exactInwardWobble = { x: 743.645, z: -632.111 };
  contexts['entity:released-payload'].farthestDistance = Math.hypot(
    previous.x - payload.x,
    previous.z - payload.z,
  );
  const exactSweep = auditPq017RouteSweep(
    previous,
    exactInwardWobble,
    [payload],
    14,
    { escapeContexts: contexts },
  );
  assert.equal(exactSweep.safe, false,
    'once beyond the neutral-turn pocket, a locally inward sample may not reuse legacy wobble');

  const originDx = origin.x - payload.x;
  const originDz = origin.z - payload.z;
  const originDistance = Math.hypot(originDx, originDz);
  const inward = {
    x: payload.x + originDx / originDistance * (originDistance - 1),
    z: payload.z + originDz / originDistance * (originDistance - 1),
  };
  assert.equal(auditPq017RouteSweep(
    origin,
    inward,
    [payload],
    14,
    { escapeContexts: contexts },
  ).safe, false,
  'motion closer than the fixed escape origin must remain blocked');

  const tangent = {
    x: origin.x - originDz / originDistance,
    z: origin.z + originDx / originDistance,
  };
  assert.equal(auditPq017RouteSweep(
    origin,
    tangent,
    [payload],
    14,
    { escapeContexts: contexts },
  ).safe, false,
  'purely tangent motion must not consume an outward escape exception');

  const station = {
    ...payload,
    entityId: 2,
    type: 'station',
    allowEscapeFromOverlap: false,
  };
  assert.equal(auditPq017RouteSweep(
    origin,
    ringEntry,
    [station],
    14,
    { escapeContexts: contexts },
  ).safe, false,
  'root, station, and component bodies must not inherit the payload escape exception');

  const outside = {
    x: payload.x + originDx / originDistance * 21,
    z: payload.z + originDz / originDistance * 21,
  };
  const exitContexts = createPq017ScopedEscapeContexts(origin, outside, [payload], 14);
  assert.equal(auditPq017RouteSweep(
    origin,
    outside,
    [payload],
    14,
    { escapeContexts: exitContexts },
  ).safe, true);
  advancePq017ScopedEscapeContexts(exitContexts, outside, [payload]);
  assert.equal(exitContexts['entity:released-payload'].active, false);
  const reentry = {
    x: payload.x + originDx / originDistance * 19,
    z: payload.z + originDz / originDistance * 19,
  };
  assert.equal(auditPq017RouteSweep(
    outside,
    reentry,
    [payload],
    14,
    { escapeContexts: exitContexts },
  ).safe, false,
  'once the ship exits payload exclusion, re-entry must be a normal collision');

  const corridorContexts = createPq017ScopedEscapeContexts(
    origin,
    ringEntry,
    [payload],
    14,
  );
  const corridorDirection = {
    x: originDx / originDistance,
    z: originDz / originDistance,
  };
  const plannerClear = {
    x: payload.x + corridorDirection.x * 39,
    z: payload.z + corridorDirection.z * 39,
  };
  advancePq017ScopedEscapeContexts(corridorContexts, plannerClear, [payload]);
  assert.equal(corridorContexts['entity:released-payload'].active, false);
  assert.equal(corridorContexts['entity:released-payload'].corridorArmed, true,
    'the post-escape corridor arms only after clearing physical exclusion plus planner margin');
  const marginReentry = {
    x: payload.x + corridorDirection.x * 37,
    z: payload.z + corridorDirection.z * 37,
  };
  assert.equal(auditPq017RouteSweep(
    plannerClear,
    marginReentry,
    [payload],
    14,
    { escapeContexts: corridorContexts },
  ).safe, false,
  'after corridor arming, the controller may not dip back into the released-payload planner margin');
  const corridorTangent = {
    x: plannerClear.x - corridorDirection.z,
    z: plannerClear.z + corridorDirection.x,
  };
  assert.equal(auditPq017RouteSweep(
    plannerClear,
    corridorTangent,
    [payload],
    14,
    { escapeContexts: corridorContexts },
  ).safe, true,
  'a tangent segment outside the armed corridor remains collision-safe');

  const run20Previous = { x: 742.45849609375, z: -630.2581176757812 };
  const run20Current = { x: 742.4638671875, z: -630.2551879882812 };
  const run20RingEntry = { x: 620.4351723304519, z: -692.9845591176912 };
  const run20Contexts = createPq017ScopedEscapeContexts(
    run20Previous,
    run20RingEntry,
    [payload],
    14,
  );
  const run20OriginDistance = Math.hypot(
    run20Previous.x - payload.x,
    run20Previous.z - payload.z,
  );
  const run20CurrentDistance = Math.hypot(
    run20Current.x - payload.x,
    run20Current.z - payload.z,
  );
  assert(Math.abs((run20OriginDistance - run20CurrentDistance) - 0.006093056190175527)
    < 1e-12);
  assert(Math.abs(Math.hypot(
    run20Current.x - run20Previous.x,
    run20Current.z - run20Previous.z,
  ) - 0.006118146526436361) < 1e-12);
  assert.equal(auditPq017RouteSweep(
    run20Previous,
    run20Current,
    [payload],
    14,
    { escapeContexts: run20Contexts, escapePropulsionNeutral: true },
  ).safe, true,
  'the exact first Electron sample may consume its tiny fixed-origin neutral wobble budget');
  assert.equal(auditPq017RouteSweep(
    run20Previous,
    run20Current,
    [payload],
    14,
    { escapeContexts: run20Contexts, escapePropulsionNeutral: false },
  ).safe, false,
  'active W/S/boost propulsion must not inherit the neutral residual-drift exception');
  const run20Direction = {
    x: (run20Previous.x - payload.x) / run20OriginDistance,
    z: (run20Previous.z - payload.z) / run20OriginDistance,
  };
  const run20Pocket = run20Contexts['entity:released-payload'].neutralTurnPocketRadius;
  const overWobbleBudget = {
    x: payload.x + run20Direction.x * (run20OriginDistance - run20Pocket - 0.001),
    z: payload.z + run20Direction.z * (run20OriginDistance - run20Pocket - 0.001),
  };
  assert.equal(auditPq017RouteSweep(
    run20Previous,
    overWobbleBudget,
    [payload],
    14,
    { escapeContexts: run20Contexts, escapePropulsionNeutral: true },
  ).safe, false,
  'neutral inward drift beyond the cumulative fixed-origin budget must fail closed');
  const overTangentBudget = {
    x: run20Previous.x - run20Direction.z * (run20Pocket + 0.001),
    z: run20Previous.z + run20Direction.x * (run20Pocket + 0.001),
  };
  assert.equal(auditPq017RouteSweep(
    run20Previous,
    overTangentBudget,
    [payload],
    14,
    { escapeContexts: run20Contexts, escapePropulsionNeutral: true },
  ).safe, false,
  'neutral tangent samples cannot ratchet around the payload outside the fixed-origin disk');
  const outwardWobble = {
    x: run20Previous.x + run20Direction.x * 0.09,
    z: run20Previous.z + run20Direction.z * 0.09,
  };
  const inwardWobble = {
    x: run20Previous.x - run20Direction.x * 0.09,
    z: run20Previous.z - run20Direction.z * 0.09,
  };
  const accumulatedWobbleContexts = createPq017ScopedEscapeContexts(
    run20Previous,
    run20RingEntry,
    [payload],
    14,
  );
  advancePq017ScopedEscapeContexts(accumulatedWobbleContexts, outwardWobble, [payload]);
  assert.equal(auditPq017RouteSweep(
    outwardWobble,
    inwardWobble,
    [payload],
    14,
    { escapeContexts: accumulatedWobbleContexts, escapePropulsionNeutral: true },
  ).safe, true,
  'neutral yaw may move within one fixed convex pocket without ratcheting its origin');

  const inactiveRun20Contexts = createPq017ScopedEscapeContexts(
    run20Previous,
    run20RingEntry,
    [payload],
    14,
  );
  inactiveRun20Contexts['entity:released-payload'].active = false;
  assert.equal(auditPq017RouteSweep(
    run20Previous,
    run20Current,
    [payload],
    14,
    { escapeContexts: inactiveRun20Contexts, escapePropulsionNeutral: true },
  ).safe, false,
  'an inactive escape context must not authorize the neutral wobble exception');

  const unmarkedPayload = { ...payload, allowEscapeFromOverlap: false };
  assert.equal(auditPq017RouteSweep(
    run20Previous,
    run20Current,
    [unmarkedPayload],
    14,
    { escapeContexts: run20Contexts, escapePropulsionNeutral: true },
  ).safe, false,
  'an unmarked solid must not inherit the released-payload neutral wobble exception');

  const postBrakeContexts = createPq017ScopedEscapeContexts(
    origin,
    ringEntry,
    [payload],
    14,
  );
  advancePq017ScopedEscapeContexts(postBrakeContexts, outside, [payload]);
  assert.equal(postBrakeContexts['entity:released-payload'].active, false,
    'an actual post-brake start outside exclusion must revoke a stale planned-origin escape');
  assert.equal(auditPq017RouteSweep(
    outside,
    reentry,
    [payload],
    14,
    { escapeContexts: postBrakeContexts },
  ).safe, false,
  'the first live sample must not re-enter after braking already completed the escape');
});

test('PQ-017 run37 grants one live-origin neutral turn before monotonic payload escape', async () => {
  const payload = {
    entityId: 'released-payload',
    type: 'world_site_payload',
    x: 757.0526123046875,
    z: -620.4880981445312,
    radius: 6,
    collides: false,
    allowEscapeFromOverlap: true,
  };
  const relayCore = {
    entityId: 292,
    type: 'wreck',
    x: 759.2914604576528,
    z: -620.2829997068661,
    radius: 2.16,
    collides: true,
  };
  const detachedBrace = {
    entityId: 287,
    type: 'wreck',
    x: 756.3493527228792,
    z: -621.6519416621679,
    radius: 1.62,
    collides: false,
  };
  const obstacles = [payload, relayCore, detachedBrace];
  const liveOrigin = { x: 740.1168823242188, z: -622.1328735351562 };
  const exactFirstSample = { x: 740.1315307617188, z: -622.1316528320312 };
  const ringEntry = { x: 604.5514216640652, z: -645.4942613450261 };
  const contexts = createPq017ScopedEscapeContexts(
    liveOrigin,
    ringEntry,
    obstacles,
    14,
  );
  const context = contexts['entity:released-payload'];
  assert.equal(context.phase, 'neutral-turn');
  assert(context.neutralTurnPocketRadius > 1.9
    && context.neutralTurnPocketRadius <= 2,
  'the nearest real solid derives a bounded turn pocket with over 1.1 WU physical reserve');
  const firstSweep = auditPq017RouteSweep(
    liveOrigin,
    exactFirstSample,
    obstacles,
    14,
    { escapeContexts: contexts, escapePropulsionNeutral: true },
  );
  assert.equal(firstSweep.safe, true,
    'the exact 0.0147-WU inward Electron yaw sample fits the one live-origin turn pocket');
  let previous = exactFirstSample;
  advancePq017ScopedEscapeContexts(contexts, previous, obstacles, {
    escapeProgress: firstSweep.escapeProgress,
  });
  const inwardDistance = Math.hypot(payload.x - liveOrigin.x, payload.z - liveOrigin.z);
  const inward = {
    x: (payload.x - liveOrigin.x) / inwardDistance,
    z: (payload.z - liveOrigin.z) / inwardDistance,
  };
  for (let sample = 2; sample <= 12; sample += 1) {
    const current = {
      x: liveOrigin.x + inward.x * (0.0147 * sample),
      z: liveOrigin.z + inward.z * (0.0147 * sample),
    };
    const sweep = auditPq017RouteSweep(previous, current, obstacles, 14, {
      escapeContexts: contexts,
      escapePropulsionNeutral: true,
    });
    assert.equal(sweep.safe, true);
    advancePq017ScopedEscapeContexts(contexts, current, obstacles, {
      escapeProgress: sweep.escapeProgress,
    });
    previous = current;
  }
  const overPocket = {
    x: liveOrigin.x + inward.x * (context.neutralTurnPocketRadius + 0.001),
    z: liveOrigin.z + inward.z * (context.neutralTurnPocketRadius + 0.001),
  };
  assert.equal(auditPq017RouteSweep(previous, overPocket, obstacles, 14, {
    escapeContexts: contexts,
    escapePropulsionNeutral: true,
  }).safe, false);

  const outward = {
    x: previous.x - inward.x * 0.05,
    z: previous.z - inward.z * 0.05,
  };
  const transition = auditPq017RouteSweep(previous, outward, obstacles, 14, {
    escapeContexts: contexts,
    escapePropulsionNeutral: false,
  });
  assert.equal(transition.safe, true);
  advancePq017ScopedEscapeContexts(contexts, outward, obstacles, {
    escapeProgress: transition.escapeProgress,
  });
  assert.equal(context.phase, 'outward-recovery');
  assert.equal(auditPq017RouteSweep(outward, {
    x: outward.x + inward.x * 0.01,
    z: outward.z + inward.z * 0.01,
  }, obstacles, 14, {
    escapeContexts: contexts,
    escapePropulsionNeutral: true,
  }).safe, false,
  'the first nonneutral outward step permanently consumes the neutral-turn pocket');

  const outwardUnit = { x: -inward.x, z: -inward.z };
  const outside = {
    x: payload.x + outwardUnit.x * 20.1,
    z: payload.z + outwardUnit.z * 20.1,
  };
  const exit = auditPq017RouteSweep(outward, outside, obstacles, 14, {
    escapeContexts: contexts,
    escapePropulsionNeutral: true,
  });
  assert.equal(exit.safe, true);
  advancePq017ScopedEscapeContexts(contexts, outside, obstacles, {
    escapeProgress: exit.escapeProgress,
  });
  assert.equal(context.phase, 'escaped');
  assert.equal(context.active, false);
  assert.equal(auditPq017RouteSweep(outside, {
    x: payload.x + outwardUnit.x * 19.9,
    z: payload.z + outwardUnit.z * 19.9,
  }, obstacles, 14, {
    escapeContexts: contexts,
    escapePropulsionNeutral: true,
  }).safe, false,
  'physical exit permanently revokes the payload escape context');

  const route = await source('scripts/lib/pq017WorldSitePublicRoute.mjs');
  const detour = route.match(
    /async function flyPq017ReleasedReceiverDetour[\s\S]*?\n}\r?\n\r?\nasync function preparePq017ReleasedReceiverCrossing/,
  )?.[0] || '';
  assert.match(detour,
    /createPq017ScopedEscapeContexts\(\s*initial\.player[\s\S]*initialLegPreflight\s*=\s*auditPq017RouteSweep\(\s*initial\.player[\s\S]*requiredClearance:\s*PQ017_ROUTE_PLANNER_MARGIN/,
    'released flight must rebase and preflight from its live post-brake origin');
  assert.match(detour,
    /if \(!initialLegPreflight\.safe\)[\s\S]*replanRequired:\s*true/,
    'an unsafe live first leg must return to the bounded replanner');
});

test('PQ-017 released neutral-turn pocket preserves clearance from a nearby solid', () => {
  const payload = {
    entityId: 'released-payload',
    x: 0,
    z: 0,
    radius: 6,
    collides: false,
    allowEscapeFromOverlap: true,
  };
  const origin = { x: 10, z: 0 };
  const solidRadius = 2;
  const physicalClearance = 0.5;
  const nearbySolid = {
    entityId: 'nearby-solid',
    x: origin.x,
    z: origin.z + 14 + solidRadius + physicalClearance,
    radius: solidRadius,
    collides: true,
  };
  const contexts = createPq017ScopedEscapeContexts(
    origin,
    { x: 30, z: 0 },
    [payload, nearbySolid],
    14,
  );
  const context = contexts['entity:released-payload'];

  assert(context.neutralTurnPocketRadius > 0);
  assert(context.neutralTurnPocketRadius + 0.1 <= physicalClearance + 1e-9,
    'the fixed live-origin pocket must retain an explicit physical reserve from solids');
});

test('PQ-017 launch readiness accepts exact low-energy motion without reverse thrust', () => {
  assert.equal(PQ017_RELEASED_LAUNCH_READY_SPEED, 0.3);
  assert.equal(
    PQ017_RELEASED_LAUNCH_READY_SPEED * (50 / 1_000),
    0.015,
    'the complete 50 ms sample drift must fit inside the derived live-origin neutral-turn pocket',
  );

  const exactRun17 = decidePq017BrakeBelow(
    0.18700586451072562,
    PQ017_RELEASED_LAUNCH_READY_SPEED,
  );
  assert.deepEqual(exactRun17, {
    action: 'settled',
    speed: 0.18700586451072562,
    maxSpeed: 0.3,
    pressKeyS: false,
    waitFixedTicks: 0,
  }, 'the exact healthy release must not receive a reverse-thrust pulse');

  for (const speed of [0.31, 0.5]) {
    assert.deepEqual(decidePq017BrakeBelow(
      speed,
      PQ017_RELEASED_LAUNCH_READY_SPEED,
    ), {
      action: 'coast',
      speed,
      maxSpeed: 0.3,
      pressKeyS: false,
      waitFixedTicks: 1,
    }, 'the low-speed control deadband must coast through distinct ticks without KeyS');
  }
  assert.deepEqual(decidePq017BrakeBelow(
    0.51,
    PQ017_RELEASED_LAUNCH_READY_SPEED,
  ), {
    action: 'brake',
    speed: 0.51,
    maxSpeed: 0.3,
    pressKeyS: true,
    waitFixedTicks: 0,
  }, 'motion above the low-speed control deadband must retain ordinary-control braking');
  assert.deepEqual(decidePq017BrakeBelow(
    0.31,
    PQ017_RELEASED_LAUNCH_READY_SPEED,
    { attempt: 120, maxAttempts: 120 },
  ), {
    action: 'failed',
    reason: 'attempt-budget-exhausted',
    speed: 0.31,
    maxSpeed: 0.3,
    pressKeyS: false,
    waitFixedTicks: 0,
  }, 'stagnant coasting must exhaust a bounded budget without escalating to reverse thrust');
  assert.deepEqual(decidePq017BrakeBelow(
    0.299,
    PQ017_RELEASED_LAUNCH_READY_SPEED,
    { attempt: 120, maxAttempts: 120 },
  ), {
    action: 'settled',
    speed: 0.299,
    maxSpeed: 0.3,
    pressKeyS: false,
    waitFixedTicks: 0,
  }, 'the terminal observation must accept settlement caused by the final allowed action');
});

test('PQ-017 reverse pulse releases on signed reversal and cannot snowball', () => {
  const sample = (currentVx, currentTick) => decidePq017BrakePulseProgress({
    startVelocity: { x: 0.6, z: 0 },
    currentVelocity: { x: currentVx, z: 0 },
    startTick: 100,
    currentTick,
    targetProjection: 0.5,
    maxTicks: 12,
  });
  assert.deepEqual(sample(0.55, 101), {
    release: false,
    reason: 'braking-progress',
    projection: 0.55,
    reversed: false,
    tickDelta: 1,
  });
  assert.deepEqual(sample(0.49, 102), {
    release: true,
    reason: 'signed-reduction-reached',
    projection: 0.49,
    reversed: false,
    tickDelta: 2,
  });
  for (const skippedTicks of [3, 8, 12]) {
    assert.deepEqual(sample(-0.1, 100 + skippedTicks), {
      release: true,
      reason: 'signed-reversal',
      projection: -0.1,
      reversed: true,
      tickDelta: skippedTicks,
    }, 'a slow Electron frame must recognize that KeyS crossed zero despite rising magnitude');
  }
  assert.deepEqual(sample(0.55, 112), {
    release: true,
    reason: 'fixed-tick-cap',
    projection: 0.55,
    reversed: false,
    tickDelta: 12,
  });

  assert.deepEqual(decidePq017BrakeBelow(
    1.8,
    PQ017_RELEASED_LAUNCH_READY_SPEED,
    { forceCoast: true },
  ), {
    action: 'coast',
    speed: 1.8,
    maxSpeed: 0.3,
    pressKeyS: false,
    waitFixedTicks: 12,
  }, 'after any observed reversal, neutral coast must replace every later reverse pulse');
  assert.deepEqual(decidePq017BrakeBelow(
    67.77861905295485,
    PQ017_RELEASED_LAUNCH_READY_SPEED,
    { forceCoast: true },
  ), {
    action: 'coast',
    speed: 67.77861905295485,
    maxSpeed: 0.3,
    pressKeyS: false,
    waitFixedTicks: 12,
  }, 'the exact run19 overshoot must never receive another reverse pulse after recovery latches');
  assert(12 * 120 >= 1_140,
    'the bounded coast budget must cover assisted neutral decay even from a 20-WU/s wrong-axis pulse');

  assert.deepEqual(decidePq017BrakePulseRecovery({
    startSpeed: 0.6,
    endSpeed: Math.hypot(0.6, 1),
    progress: sample(0.6, 112),
  }), {
    forceCoast: true,
    reason: 'no-signed-progress',
  }, 'wrong-axis speed growth must latch neutral recovery instead of repeating KeyS');
  assert.deepEqual(decidePq017BrakePulseRecovery({
    startSpeed: 0.6,
    endSpeed: 0.49,
    progress: sample(0.49, 102),
  }), {
    forceCoast: false,
    reason: 'signed-braking-progress',
  });

  assert.deepEqual(evaluatePq017ReleasedDetourBrakeDisplacement(
    { x: 10, z: 20 },
    { x: 12, z: 20 },
  ), {
    safe: true,
    replanRequired: false,
    reason: null,
    displacement: 2,
    maximumDisplacement: 2,
  });
  assert.deepEqual(evaluatePq017ReleasedDetourBrakeDisplacement(
    { x: 10, z: 20 },
    { x: 12.001, z: 20 },
  ), {
    safe: false,
    replanRequired: true,
    reason: 'braking-left-route-origin',
    displacement: 2.0009999999999994,
    maximumDisplacement: 2,
  }, 'material brake displacement must invalidate the stale collision-plan origin');
});

test('PQ-017 impact staging reaches the root-outward launch radial through a clear outer ring', () => {
  const retry = planPq017ImpactStaging(
    { x: -600, z: 0 }, { x: 10, z: 0 }, { x: 0, z: 0 }, 190,
  );
  assert.equal(retry.reference.source, 'site-outward-radial');
  assert.equal(retry.standOff, 190);
  assert.equal(retry.outerRadius, 674,
    'outer-ring entry must move at least 64 WU outward from the current 610-WU radius');
  assert.deepEqual(retry.waypoints.at(-1), { x: 200, z: 0, phase: 'launch' },
    'the final launch point must be exactly 190 WU down the root-to-component outward radial');
  assert.equal(Object.hasOwn(retry.waypoints.at(-1), 'passThrough'), false,
    'the exact launch point must retain position-and-speed settlement');
  assert(retry.waypoints.length >= 3,
    'an opposite-side retry must traverse the shortest bounded outer-ring arc before approaching');
  for (const point of retry.waypoints.slice(0, -1)) {
    assert(Math.abs(Math.hypot(point.x - 10, point.z) - retry.outerRadius) < 1e-9,
      'every ring waypoint must preserve the planned collision clearance');
  }
  for (let index = 1; index < retry.waypoints.length - 1; index += 1) {
    const previous = retry.waypoints[index - 1];
    const point = retry.waypoints[index];
    let delta = Math.atan2(point.z, point.x - 10)
      - Math.atan2(previous.z, previous.x - 10);
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    const step = Math.abs(delta);
    assert(step <= Math.PI / 4 + 1e-9,
      'outer-ring chord steps must remain bounded to 45 degrees');
  }

  const player = { x: -340, z: 0 };
  const obstacle = {
    entityId: 412, type: 'asteroid', fieldId: 'f_test_blocker',
    x: -404, z: 0, radius: 30,
  };
  const avoiding = planPq017ImpactStaging(
    player, { x: 10, z: 0 }, { x: 0, z: 0 }, 190, [obstacle], 8,
  );
  const routePoints = [player, ...avoiding.waypoints];
  assert.ok(avoiding.closestObstacle,
    'planner diagnostics must retain the identity of the closest collision body');
  assert.deepEqual(avoiding.closestObstacle, {
    entityId: 412,
    type: 'asteroid',
    fieldId: 'f_test_blocker',
    clearance: avoiding.closestObstacle.clearance,
  });
  assert(Number.isFinite(avoiding.closestObstacle.clearance));
  const exclusion = obstacle.radius + 8 + 18;
  for (let index = 1; index < routePoints.length; index += 1) {
    const a = routePoints[index - 1];
    const b = routePoints[index];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const lengthSquared = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1,
      ((obstacle.x - a.x) * dx + (obstacle.z - a.z) * dz) / lengthSquared));
    const clearance = Math.hypot(
      obstacle.x - (a.x + dx * t),
      obstacle.z - (a.z + dz * t),
    );
    assert(clearance > exclusion,
      `obstacle-aware impact staging segment ${index} must clear the occupied radial`);
  }
  for (let index = 0; index < avoiding.waypoints.length - 1; index += 1) {
    const waypoint = avoiding.waypoints[index];
    const next = avoiding.waypoints[index + 1];
    assert.equal(waypoint.passThrough?.safe, true,
      `intermediate waypoint ${index} needs a positive outgoing clearance proof`);
    const obstacleDx = obstacle.x - waypoint.x;
    const obstacleDz = obstacle.z - waypoint.z;
    const obstacleDistance = Math.hypot(obstacleDx, obstacleDz);
    const gatePoint = {
      x: waypoint.x + (obstacleDx / obstacleDistance) * waypoint.passThrough.radius,
      z: waypoint.z + (obstacleDz / obstacleDistance) * waypoint.passThrough.radius,
    };
    const connector = auditPq017RouteSweep(
      gatePoint,
      next,
      [obstacle],
      8,
      { requiredClearance: waypoint.passThrough.requiredDynamicClearance },
    );
    assert.equal(connector.safe, true,
      `gate ${index} must preserve the full physical and inertial clearance reserve`);
  }
  assert.equal(Object.hasOwn(avoiding.waypoints.at(-1), 'passThrough'), false,
    'the final launch leg must never inherit an intermediate pass-through gate');
});

test('PQ-017 impact staging separates advisory-margin egress from physical overlap escape', () => {
  const player = { x: -600, z: 0 };
  const target = { x: 10, z: 0 };
  const root = { x: 0, z: 0 };
  const playerRadius = 8;
  const obstacleRadius = 2;
  const physicalExclusion = playerRadius + obstacleRadius;
  const obstacleAtDistance = (distance, marked = false) => ({
    entityId: marked ? 'released-payload' : 'ordinary-body',
    type: marked ? 'world_site_payload' : 'wreck',
    x: player.x + distance,
    z: player.z,
    radius: obstacleRadius,
    allowEscapeFromOverlap: marked,
  });

  const marginEgress = planPq017ImpactStaging(
    player, target, root, 190,
    [obstacleAtDistance(physicalExclusion + 0.001)],
    playerRadius,
  );
  assert.equal(marginEgress.blockedSegments, 0,
    'an already-physical-clear start may move outward through only the advisory planner margin');

  const unmarkedPhysicalContact = planPq017ImpactStaging(
    player, target, root, 190,
    [obstacleAtDistance(physicalExclusion)],
    playerRadius,
  );
  assert(unmarkedPhysicalContact.blockedSegments > 0,
    'an unmarked root/component body at physical contact must not inherit margin egress');

  const releasedPayloadOverlap = planPq017ImpactStaging(
    player, target, root, 190,
    [obstacleAtDistance(physicalExclusion, true)],
    playerRadius,
  );
  assert.equal(releasedPayloadOverlap.blockedSegments, 0,
    'only the marked released payload may authorize first-leg physical-overlap escape');

  const laterPayloadEntry = planPq017ImpactStaging(
    player, target, root, 190,
    [{
      ...obstacleAtDistance(0, true),
      x: 200,
      z: 0,
    }],
    playerRadius,
  );
  assert(laterPayloadEntry.blockedSegments > 0,
    'released-payload metadata must not authorize a later route segment to enter collision');
});

test('PQ-017 route sweeps use effective collision radii without losing route evidence', () => {
  const playerRadius = 14;
  const stationarySweep = (distance, obstacle) => auditPq017RouteSweep(
    { x: distance, z: 0 },
    { x: distance, z: 0 },
    [obstacle],
    playerRadius,
  );
  const noncollidingRoot = {
    entityId: 327,
    type: 'world_site_root',
    x: 0,
    z: 0,
    radius: 18,
    collides: false,
  };
  assert.equal(stationarySweep(0.001, noncollidingRoot).safe, true,
    'a noncolliding visual or sensor body must contribute no phantom player-radius exclusion');

  const solidComponent = {
    entityId: 292,
    type: 'wreck',
    x: 0,
    z: 0,
    radius: 2,
    collides: true,
  };
  assert.equal(stationarySweep(15.999, solidComponent).safe, false,
    'a colliding component retains its authored radius');
  assert.equal(stationarySweep(16.001, solidComponent).safe, true);

  const releasedPayload = {
    entityId: 'released-payload',
    type: 'world_site_payload',
    x: 0,
    z: 0,
    radius: 6,
    collides: false,
    allowEscapeFromOverlap: true,
  };
  assert.equal(stationarySweep(19.999, releasedPayload).safe, false,
    'the scoped released-payload marker retains payload radius despite noncontact semantics');
  assert.equal(stationarySweep(20.001, releasedPayload).safe, true);
});

test('PQ-017 impact staging enters the exact launch radial around the Helios station obstacle', () => {
  const player = { x: 815.3564453125, z: -23.496103286743164 };
  const target = { x: 762.844429397084, z: -618.665484783525 };
  const root = { x: 760, z: -620 };
  const station = {
    entityId: 2, type: 'station', fieldId: null,
    x: 1280, z: -420, radius: 42,
  };
  const plan = planPq017ImpactStaging(
    player, target, root, 190, [station], 14,
  );

  assert.equal(plan.blockedSegments, 0,
    'the bounded route search must enter the launch point laterally when the station occupies the outer radial');
  assert(plan.obstacleClearance > 0,
    'every ordinary-control staging segment must preserve the full station clearance envelope');
  assert.deepEqual(plan.waypoints.at(-1), {
    x: 934.8539862384494,
    z: -537.9641071296267,
    phase: 'launch',
  }, 'collision avoidance must not move the exact 190-WU root-outward launch point');
  assert(plan.waypoints.slice(0, -1).every((waypoint) => (
    waypoint.passThrough?.safe === true && waypoint.passThrough.radius > 32.447
  )), 'the exact Helios route must expose intermediate gates wider than the captured 32.447-WU approach');
  assert.equal(Object.hasOwn(plan.waypoints.at(-1), 'passThrough'), false,
    'the exact Helios launch waypoint must not inherit ring pass-through metadata');

  const route = [player, ...plan.waypoints];
  const exclusion = station.radius + 14 + 18;
  for (let index = 1; index < route.length; index += 1) {
    const a = route[index - 1];
    const b = route[index];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const lengthSquared = dx * dx + dz * dz;
    const t = lengthSquared > 0
      ? Math.max(0, Math.min(1,
        ((station.x - a.x) * dx + (station.z - a.z) * dz) / lengthSquared))
      : 0;
    const clearance = Math.hypot(
      station.x - (a.x + dx * t),
      station.z - (a.z + dz * t),
    );
    assert(clearance > exclusion,
      `station-aware impact staging segment ${index} must remain collision-clear`);
  }
});

test('PQ-017 impact control caps the physical run without a dash impulse', () => {
  assert.deepEqual(decidePq017ImpactControl({ error: 0.02, speed: 202, closingSpeed: 180 }), {
    action: 'coast', thrust: false, boost: false, turnDirection: 0,
  });
  assert.deepEqual(decidePq017ImpactControl({ error: -0.02, speed: 95, closingSpeed: 94 }), {
    action: 'coast', thrust: false, boost: false, turnDirection: 0,
  });
  assert.deepEqual(decidePq017ImpactControl({ error: -2.9, speed: 217, closingSpeed: -215 }), {
    action: 'missed', thrust: false, boost: false, turnDirection: 0,
  });
  assert.deepEqual(decidePq017ImpactControl({ error: 0.2, speed: 40, closingSpeed: -30 }), {
    action: 'missed', thrust: false, boost: false, turnDirection: 0,
  });
  assert.deepEqual(decidePq017ImpactControl({ error: -0.5, speed: 20, closingSpeed: -12 }), {
    action: 'missed', thrust: false, boost: false, turnDirection: 0,
  });
  assert.deepEqual(decidePq017ImpactControl({ error: 0.05, speed: 35, closingSpeed: 20 }), {
    action: 'thrust', thrust: true, boost: false, turnDirection: 0,
  });
  assert.deepEqual(decidePq017ImpactControl({ error: 0.18, speed: 1.7, closingSpeed: -0.77 }), {
    action: 'turn', thrust: false, boost: false, turnDirection: 1,
  });
  assert.deepEqual(decidePq017ImpactControl({
    error: 1.1, speed: 54.62, closingSpeed: 4.05,
    lateralSpeed: 54.47, velocityCancelError: -0.6,
  }), {
    action: 'velocity-align', thrust: false, boost: false, turnDirection: -1,
  });
  assert.deepEqual(decidePq017ImpactControl({
    error: 1.1, speed: 54.62, closingSpeed: 4.05,
    lateralSpeed: 54.47, velocityCancelError: 0.1,
  }), {
    action: 'velocity-cancel', thrust: true, boost: false, turnDirection: 0,
  });
  assert.deepEqual(decidePq017ImpactControl({
    error: 0.9196,
    distance: 16.2069,
    speed: 26.777,
    closingSpeed: 6.053,
    lateralSpeed: 26.084,
    velocityCancelError: 2.718,
  }), {
    action: 'velocity-align', thrust: false, boost: false, turnDirection: 1,
  }, 'the seventh exact glancing state must physically align against lateral velocity, not abort');
  assert.deepEqual(decidePq017ImpactControl({
    error: 0.9196,
    distance: 16.2069,
    speed: 26.777,
    closingSpeed: 6.053,
    lateralSpeed: 26.084,
    velocityCancelError: 0.05,
  }), {
    action: 'velocity-cancel', thrust: true, boost: false, turnDirection: 0,
  }, 'once aligned opposite velocity, ordinary W must cancel the glancing momentum');
  assert.deepEqual(decidePq017ImpactControl({
    captureActive: true,
    error: 0.5,
    distance: 35,
    speed: 20,
    closingSpeed: 4,
    lateralSpeed: 19.596,
    velocityCancelError: 0.05,
  }), {
    action: 'velocity-cancel', thrust: true, boost: false, turnDirection: 0,
  }, 'capture hysteresis must keep cancelling below the old 25-WU/s entry threshold');
  assert.deepEqual(decidePq017ImpactControl({
    captureActive: true,
    error: 0.5,
    distance: 35,
    speed: 4.9,
    closingSpeed: 3.9,
    lateralSpeed: 2.8,
    velocityCancelError: 0.05,
  }), {
    action: 'capture-complete', thrust: false, boost: false, turnDirection: 0,
  }, 'a genuinely low-speed/lateral reset must release keys and enter collision-safe restaging');
  assert.deepEqual(decidePq017ImpactControl({
    error: 0.9196,
    distance: 16.2069,
    speed: 26.777,
    closingSpeed: 6.053,
    lateralSpeed: 26.084,
  }), {
    action: 'missed', thrust: false, boost: false, turnDirection: 0,
  }, 'a missing live velocity direction must still fail closed into bounded restaging');
  assert.deepEqual(decidePq017ImpactControl({
    error: 0.4,
    distance: 30,
    speed: 4.9,
    closingSpeed: -1,
    lateralSpeed: 4.8,
    velocityCancelError: 0,
  }), {
    action: 'turn', thrust: false, boost: false, turnDirection: 1,
  }, 'after momentum is bounded, the controller must re-aim at the physical collider');
  assert.deepEqual(decidePq017ImpactControl({
    error: 0.02,
    distance: 30,
    speed: 5,
    closingSpeed: 4.9,
    lateralSpeed: 1,
    velocityCancelError: 0,
  }), {
    action: 'thrust', thrust: true, boost: false, turnDirection: 0,
  }, 'the recovered low-lateral path must resume the capped impact run');
});

test('PQ-017 impact control keeps bounded thrust through a near-contact alignment error', () => {
  assert.deepEqual(decidePq017ImpactControl({
    distance: 22.4105,
    error: 0.206,
    speed: 6.7405,
    closingSpeed: 6.456,
    lateralSpeed: 1.938,
  }), {
    action: 'thrust', thrust: true, boost: false, turnDirection: 0,
  });
  assert.deepEqual(decidePq017ImpactControl({
    distance: 40.01,
    error: 0.206,
    speed: 6.7405,
    closingSpeed: 6.456,
    lateralSpeed: 1.938,
  }), {
    action: 'turn', thrust: false, boost: false, turnDirection: 1,
  });
  assert.deepEqual(decidePq017ImpactControl({
    distance: 22.4105,
    error: 0.301,
    speed: 6.7405,
    closingSpeed: 6.456,
    lateralSpeed: 1.938,
  }), {
    action: 'turn', thrust: false, boost: false, turnDirection: 1,
  });
  assert.deepEqual(decidePq017ImpactControl({
    distance: 22.4105,
    error: 0.206,
    speed: 95,
    closingSpeed: 94,
    lateralSpeed: 1.938,
  }), {
    action: 'coast', thrust: false, boost: false, turnDirection: 0,
  });
});

test('PQ-017 impact retry refuses damage or failure receipts caused while restaging', () => {
  assert.deepEqual(auditPq017ImpactRestage({ stageId: 'recovered', failureCount: 0 }), {
    pass: true,
    failures: [],
  });
  assert.deepEqual(auditPq017ImpactRestage({ stageId: 'damaged', failureCount: 1 }), {
    pass: false,
    failures: ['stage:damaged', 'failure_receipts:1'],
  });
});

test('PQ-017 reverse staging backs out on the exact component radial and counter-thrusts to rest', () => {
  assert.deepEqual(decidePq017ReverseStagingControl({
    distance: 120, speed: 0, closingSpeed: 0, error: 0,
  }, 190), { action: 'depart', forward: false, reverse: true, turnDirection: 0 });
  assert.deepEqual(decidePq017ReverseStagingControl({
    distance: 120, speed: 0, closingSpeed: 0, error: -0.4,
  }, 190), { action: 'turn', forward: false, reverse: false, turnDirection: -1 });
  assert.deepEqual(decidePq017ReverseStagingControl({
    distance: 198, speed: 12, closingSpeed: -11.5, error: 0.01,
  }, 190), { action: 'counter', forward: true, reverse: false, turnDirection: 0 });
  assert.deepEqual(decidePq017ReverseStagingControl({
    distance: 198, speed: 1.5, closingSpeed: -1.4, error: 0.01,
  }, 190), { action: 'settled', forward: false, reverse: false, turnDirection: 0 });
});

test('PQ-017 settled-arrival controller brakes early and converges on ordinary controls', () => {
  const options = { settledRadius: 100, maxSettledSpeed: 4, brakeAccel: 12 };

  const fastClose = decidePq017SettledArrivalControl({
    distance: 400, speed: 100, closingSpeed: 100, headingError: 0,
  }, options);
  assert.equal(fastClose.action, 'brake');
  assert.equal(fastClose.reason, 'stopping-envelope');
  assert.equal(fastClose.stoppingDistance, 416.667);
  assert.equal(fastClose.stoppingDistanceSource, 'conservative-fallback');
  assert.equal(fastClose.brakePulseMs, 60);

  const slowFar = decidePq017SettledArrivalControl({
    distance: 700, speed: 5, closingSpeed: 5, headingError: 0.02,
  }, options);
  assert.equal(slowFar.action, 'approach');
  assert.equal(slowFar.thrust, true);
  assert(slowFar.approachSpeedCap > slowFar.speed);

  const turning = decidePq017SettledArrivalControl({
    distance: 700, speed: 5, closingSpeed: 5, headingError: 0.2,
  }, options);
  assert.equal(turning.action, 'approach');
  assert.notEqual(turning.turnDirection, 0);
  assert.equal(turning.thrust, true,
    'Pilot can make forward progress through the wider thrust window');
  assert.equal(turning.appliedTurnDirection, 0,
    'Pilot must release A/D while W is held so the route cannot accumulate strafe velocity');

  const gentleCarve = decidePq017SettledArrivalControl({
    distance: 700, speed: 5, closingSpeed: 5, headingError: 0.119,
  }, options);
  assert.equal(gentleCarve.turnDirection, 0);
  assert.equal(gentleCarve.thrust, true,
    'inside 0.12 radians, Pilot releases yaw and applies W');

  const turnFirstBoundary = decidePq017SettledArrivalControl({
    distance: 700, speed: 5, closingSpeed: 5, headingError: 0.121,
  }, options);
  assert.notEqual(turnFirstBoundary.turnDirection, 0);
  assert.equal(turnFirstBoundary.thrust, true,
    'above the yaw-release boundary, Pilot can still make useful forward progress');
  assert.equal(turnFirstBoundary.appliedTurnDirection, 0);

  const turnOnly = decidePq017SettledArrivalControl({
    distance: 700, speed: 5, closingSpeed: 5, headingError: 0.401,
  }, options);
  assert.notEqual(turnOnly.turnDirection, 0);
  assert.equal(turnOnly.thrust, false,
    'outside the 0.4-radian thrust window, Pilot turns before applying W');
  assert.notEqual(turnOnly.appliedTurnDirection, 0);

  const lateralDrift = decidePq017SettledArrivalControl({
    distance: 714, speed: 33, closingSpeed: 18, headingError: 0.03,
  }, options);
  assert.equal(lateralDrift.action, 'brake');
  assert.equal(lateralDrift.reason, 'lateral-velocity-capture');

  const insideMoving = decidePq017SettledArrivalControl({
    distance: 80, speed: 20, closingSpeed: 12, headingError: 0,
  }, options);
  assert.equal(insideMoving.action, 'brake');
  assert.equal(insideMoving.reason, 'inside-moving');
  assert.equal(insideMoving.brakePulseMs, 35);

  const insideSettled = decidePq017SettledArrivalControl({
    distance: 80, speed: 3, closingSpeed: 0.5, headingError: 0,
  }, options);
  assert.equal(insideSettled.action, 'settled');
  assert.equal(insideSettled.reason, 'position-and-speed-settled');

  const movingAway = decidePq017SettledArrivalControl({
    distance: 300, speed: 30, closingSpeed: -30, headingError: 0.2,
  }, options);
  assert.equal(movingAway.action, 'approach');
  assert.equal(movingAway.reason, 'moving-away-reacquire');
  assert.equal(movingAway.thrust, true,
    'forward thrust toward the target must cancel a retreat; reverse thrust would reinforce it');
  assert.equal(movingAway.appliedTurnDirection, 0);

  const movingAwayMisaligned = decidePq017SettledArrivalControl({
    distance: 300, speed: 30, closingSpeed: -30, headingError: 0.8,
  }, options);
  assert.equal(movingAwayMisaligned.action, 'approach');
  assert.equal(movingAwayMisaligned.reason, 'moving-away-reacquire');
  assert.equal(movingAwayMisaligned.thrust, false);
  assert.equal(movingAwayMisaligned.appliedTurnDirection, 1,
    'a retreating ship must turn toward the target before applying forward thrust');

  const directStop = decidePq017SettledArrivalControl({
    distance: 300,
    speed: 30,
    closingSpeed: 30,
    headingError: 0,
    directStoppingDistance: 200,
  }, options);
  assert.equal(directStop.action, 'brake');
  assert.equal(directStop.reason, 'stopping-envelope');
  assert.equal(directStop.stoppingDistance, 200);
  assert.equal(directStop.stoppingDistanceSource, 'flight-telemetry-direct');

  const lowSpeedPulse = decidePq017SettledArrivalControl({
    distance: 80, speed: 8, closingSpeed: 6, headingError: 0,
  }, options);
  assert.equal(lowSpeedPulse.action, 'brake');
  assert.equal(lowSpeedPulse.brakePulseMs, 20);

  const towCapture = decidePq017SettledArrivalControl({
    distance: 28.18530425307614,
    speed: 6.071447061395118,
    closingSpeed: 2.584014634442724,
    headingError: -0.004647632432644433,
    directStoppingDistance: 0.7154516844879659,
  }, {
    settledRadius: 6,
    maxSettledSpeed: 6,
    brakeAccel: 12,
    maxApproachSpeed: 16,
  });
  assert.equal(towCapture.action, 'approach',
    'low radial closing speed must keep capturing the exact tow waypoint despite lateral drift');
  assert.equal(towCapture.thrust, true);

  const unsafeTowClose = decidePq017SettledArrivalControl({
    distance: 28.18530425307614,
    speed: 22,
    closingSpeed: 22,
    headingError: 0.01,
    directStoppingDistance: 20.167,
  }, {
    settledRadius: 6,
    maxSettledSpeed: 6,
    brakeAccel: 12,
    maxApproachSpeed: 16,
  });
  assert.equal(unsafeTowClose.action, 'brake',
    'the same tight approach must still brake excessive radial closing speed');
  assert.equal(unsafeTowClose.reason, 'stopping-envelope');

  const ringCapture = decidePq017SettledArrivalControl({
    distance: 32.242719516132816,
    speed: 10.31912875523474,
    closingSpeed: 8.942121557504587,
    headingError: 0.006243779437543395,
    directStoppingDistance: 1.3287315298175124,
  }, {
    settledRadius: 16,
    maxSettledSpeed: 6,
    brakeAccel: 12,
    maxApproachSpeed: 16,
  });
  assert.equal(ringCapture.reason, 'dynamic-speed-cap',
    'the exact Browser ring state needs one bounded speed correction, not a 24-WU stop zone');
  assert(ringCapture.brakeBuffer < ringCapture.remainingDistance - ringCapture.stoppingDistance);

  const ringCaptureReduced = decidePq017SettledArrivalControl({
    distance: 32.242719516132816,
    speed: 8,
    closingSpeed: 7,
    headingError: 0.006,
    directStoppingDistance: 0.8,
  }, {
    settledRadius: 16,
    maxSettledSpeed: 6,
    brakeAccel: 12,
    maxApproachSpeed: 16,
  });
  assert.equal(ringCaptureReduced.action, 'approach',
    'after the bounded correction, the same ring geometry must resume ordinary capture');
  assert.equal(ringCaptureReduced.thrust, true);

  const ringOvershoot = decidePq017SettledArrivalControl({
    distance: 44.303882386960785,
    speed: 15.771759576591626,
    closingSpeed: -7.381694779241763,
    headingError: 0.13162602666972845,
    velocityHeadingError: -2.096,
    directStoppingDistance: 5.044172355750919,
  }, {
    settledRadius: 16,
    maxSettledSpeed: 6,
    brakeAccel: 12,
    maxApproachSpeed: 16,
  });
  assert.equal(ringOvershoot.action, 'velocity-align',
    'the exact Browser overshoot must align retros with velocity before pressing reverse');
  assert.equal(ringOvershoot.reason, 'lateral-velocity-align');
  assert.equal(ringOvershoot.thrust, false);
  assert.equal(ringOvershoot.appliedTurnDirection, -1);
  assert.equal(ringOvershoot.brakePulseMs, 0);

  const ringOvershootAligned = decidePq017SettledArrivalControl({
    distance: 44.303882386960785,
    speed: 15.771759576591626,
    closingSpeed: -7.381694779241763,
    headingError: 2.2,
    velocityHeadingError: 0.05,
    directStoppingDistance: 5.044172355750919,
  }, {
    settledRadius: 16,
    maxSettledSpeed: 6,
    brakeAccel: 12,
    maxApproachSpeed: 16,
  });
  assert.equal(ringOvershootAligned.action, 'brake',
    'KeyS is safe only after the nose aligns with the current velocity vector');
  assert.equal(ringOvershootAligned.reason, 'lateral-velocity-capture');

  const radialRetreatAfterCapture = decidePq017SettledArrivalControl({
    distance: 44,
    speed: 7,
    closingSpeed: -6.8,
    headingError: 0.1,
    directStoppingDistance: 1.9,
  }, {
    settledRadius: 16,
    maxSettledSpeed: 6,
    brakeAccel: 12,
    maxApproachSpeed: 16,
  });
  assert.equal(radialRetreatAfterCapture.reason, 'moving-away-reacquire');
  assert.equal(radialRetreatAfterCapture.thrust, true,
    'once lateral momentum is bounded, ordinary forward thrust may reacquire the waypoint');
});

test('PQ-017 run39 captures an inside-radius flyby before moving-away reacquisition', () => {
  const exactFlyby = decidePq017SettledArrivalControl({
    distance: 2.2007104107648607,
    speed: 4.567797998321677,
    closingSpeed: -4.4472409089507865,
    headingError: 2.335511963652996,
    velocityHeadingError: -0.5758210750711121,
    directStoppingDistance: 0.30503064919749345,
  }, {
    settledRadius: 0.75,
    maxSettledSpeed: 2,
    brakeAccel: 12,
    maxApproachSpeed: 8,
  });
  assert.equal(exactFlyby.action, 'velocity-align',
    'the exact post-flyby sample must remain in bounded capture while its retros align');
  assert.equal(exactFlyby.reason, 'near-target-overshoot-align');
  assert.equal(exactFlyby.thrust, false);

  const alignedFlyby = decidePq017SettledArrivalControl({
    distance: 2.2007104107648607,
    speed: 4.567797998321677,
    closingSpeed: -4.4472409089507865,
    headingError: 2.335511963652996,
    velocityHeadingError: -0.05,
    directStoppingDistance: 0.30503064919749345,
  }, {
    settledRadius: 0.75,
    maxSettledSpeed: 2,
    brakeAccel: 12,
    maxApproachSpeed: 8,
  });
  assert.equal(alignedFlyby.action, 'brake');
  assert.equal(alignedFlyby.reason, 'near-target-overshoot-capture',
    'once aligned inside the bounded capture pocket, KeyS must remove speed instead of reacquiring');

  const slowInsideFlyby = decidePq017SettledArrivalControl({
    distance: 0.174589187445598,
    speed: 1.5,
    closingSpeed: -1.4,
    headingError: 2.335511963652996,
    velocityHeadingError: -0.1,
    directStoppingDistance: 0.03,
  }, {
    settledRadius: 0.75,
    maxSettledSpeed: 2,
    brakeAccel: 12,
    maxApproachSpeed: 8,
  });
  assert.equal(slowInsideFlyby.action, 'settled',
    'an already-slow inside-radius sample must finish instead of accelerating into another pass');
});

test('PQ-017 tight-waypoint braking uses the shipped Pilot brake without a yaw detour', () => {
  const options = {
    settledRadius: 0.75,
    maxSettledSpeed: 2,
    brakeAccel: 12,
    maxApproachSpeed: 8,
  };
  const exactVector = {
    distance: 0.4238436923300451,
    speed: 3.741453951323158,
    closingSpeed: 2.523369702257654,
    headingError: -0.07765505680949958,
    velocityHeadingError: -0.9082513864259145,
    directStoppingDistance: 0.1980465575364896,
  };
  const misaligned = decidePq017SettledArrivalControl(exactVector, options);
  assert.equal(misaligned.action, 'brake',
    'Pilot KeyS owns velocity-opposing assisted braking, so yawing first only adds drift');
  assert.equal(misaligned.reason, 'tight-waypoint-speed-capture');
  assert.equal(misaligned.thrust, false);
  assert.equal(misaligned.appliedTurnDirection, 0);

  const aligned = decidePq017SettledArrivalControl({
    ...exactVector,
    velocityHeadingError: -0.05,
  }, options);
  assert.equal(aligned.action, 'brake');
  assert.equal(aligned.reason, 'tight-waypoint-speed-capture');

  const outsidePocket = decidePq017SettledArrivalControl({
    ...exactVector,
    distance: 12,
  }, options);
  assert.equal(outsidePocket.action, 'approach',
    'tight vector capture must not replace ordinary travel outside its bounded stop envelope');
  assert.equal(outsidePocket.reason, 'within-speed-envelope');
});

test('PQ-017 run41 preflights every public control before a pulse can cross payload exclusion', async () => {
  assert.equal(typeof pq017Route.planPq017RouteSafeBrakePulse, 'function');
  const payload = {
    entityId: 'released-payload',
    type: 'world_site_payload',
    x: 757.0526123046875,
    z: -620.4880981445312,
    radius: 6,
    collides: false,
    allowEscapeFromOverlap: true,
  };
  const previous = { x: 776.7615966796875, z: -625.4204711914062 };
  const current = { x: 776.1893310546875, z: -625.8453369140625 };
  const launch = { x: 801.298461041391, z: -607.3985468428217 };
  const launchDistance = Math.hypot(launch.x - previous.x, launch.z - previous.z);
  const outwardVelocity = {
    x: (launch.x - previous.x) / launchDistance * 1.57,
    z: (launch.z - previous.z) / launchDistance * 1.57,
  };

  const exactSweep = auditPq017RouteSweep(
    previous,
    current,
    [payload],
    14,
  );
  assert.equal(exactSweep.safe, false);
  assert.equal(exactSweep.closestConstraint.exclusionRadius, 20,
    'the explicit payload must retain its full payload-plus-ship exclusion');
  assert(Math.abs(exactSweep.closestConstraint.clearance - (-0.12755647258319058)) < 1e-12);

  const blockedBrake = pq017Route.planPq017RouteSafeBrakePulse(
    previous,
    outwardVelocity,
    [payload],
    14,
  );
  assert.equal(blockedBrake.action, 'coast');
  assert.equal(blockedBrake.reason, 'reverse-pulse-route-blocked');
  assert.equal(blockedBrake.reverseDistance, 2);
  assert.equal(blockedBrake.sweep.safe, false,
    'a possible two-WU batched reversal must be preflighted before pressing KeyS');

  const clearStart = {
    x: payload.x + (previous.x - payload.x) / 20.316800165565766 * 23,
    z: payload.z + (previous.z - payload.z) / 20.316800165565766 * 23,
  };
  const clearBrake = pq017Route.planPq017RouteSafeBrakePulse(
    clearStart,
    outwardVelocity,
    [payload],
    14,
  );
  assert.equal(clearBrake.action, 'brake',
    'the same aligned KeyS pulse remains available once its reverse envelope is clear');

  const route = await source('scripts/lib/pq017WorldSitePublicRoute.mjs');
  const flyToPoint = route.match(
    /async function flyToPoint[\s\S]*?\n}\r?\n\r?\nasync function towToPointUntilOperation/,
  )?.[0] || '';
  assert.match(flyToPoint,
    /planPq017RouteSafeDisplacement[\s\S]*controlPlan && !controlPlan\.safe[\s\S]*releaseFlightKeys[\s\S]*decision\.action === 'brake'[\s\S]*pulsePq017Brake/,
    'all Pilot decisions must pass the structural fixed-tick displacement planner before KeyS or any other public control is applied');
});

test('PQ-017 sustained avoidance retreat releases autopilot to bounded manual recovery', async () => {
  const routeModule = await import('../scripts/lib/pq017WorldSitePublicRoute.mjs');
  assert.equal(typeof routeModule.planPq017AutopilotAvoidanceRecovery, 'function');

  const navigation = {
    tick: 100,
    autopilot: { active: true, status: 'avoiding', targetEntityId: 320 },
    distance: 900,
    speed: 224,
    closingSpeed: 30,
  };
  let recovery = {
    stallSamples: 0,
    divergenceSamples: 0,
    recoveries: 0,
  };
  const options = {
    within: 100,
    maxSettledSpeed: 4,
    expectedTargetEntityId: 320,
  };
  recovery = routeModule.planPq017AutopilotAvoidanceRecovery(navigation, recovery, options);
  assert.equal(recovery.action, 'wait');
  assert.equal(recovery.lastTick, 100);
  assert.equal(recovery.lastDistance, 900);
  assert.equal(recovery.bestDistance, 900);

  const duplicateTick = routeModule.planPq017AutopilotAvoidanceRecovery({
    ...navigation,
    distance: 905,
    closingSpeed: -111,
  }, recovery, options);
  assert.equal(duplicateTick.action, 'wait');
  assert.equal(duplicateTick.reason, 'duplicate-simulation-tick');
  assert.equal(duplicateTick.divergenceSamples, 0);
  assert.equal(duplicateTick.lastDistance, 900,
    'wall-clock polls within one fixed tick must not advance measured retreat');
  recovery = duplicateTick;

  for (let sample = 1; sample < 20; sample += 1) {
    recovery = routeModule.planPq017AutopilotAvoidanceRecovery({
      ...navigation,
      tick: 100 + sample,
      distance: 900 + sample * 5,
      closingSpeed: -111,
    }, recovery, options);
    assert.equal(recovery.action, 'wait',
      '19 distinct retreat samples remain below the bounded recovery threshold');
    assert.equal(recovery.divergenceSamples, sample);
  }

  recovery = routeModule.planPq017AutopilotAvoidanceRecovery({
    ...navigation,
    tick: 120,
    distance: 1000,
    closingSpeed: -111,
  }, recovery, options);
  assert.deepEqual({
    action: recovery.action,
    reason: recovery.reason,
    divergenceSamples: recovery.divergenceSamples,
    recoveries: recovery.recoveries,
  }, {
    action: 'manual-recovery',
    reason: 'sustained-moving-away-divergence',
    divergenceSamples: 20,
    recoveries: 0,
  });

  let transient = routeModule.planPq017AutopilotAvoidanceRecovery(navigation, {}, options);
  for (let sample = 1; sample <= 6; sample += 1) {
    transient = routeModule.planPq017AutopilotAvoidanceRecovery({
      ...navigation,
      tick: 100 + sample,
      distance: 900 + sample * 5,
      closingSpeed: -111,
    }, transient, options);
  }
  const converging = routeModule.planPq017AutopilotAvoidanceRecovery({
    ...navigation,
    tick: 107,
    distance: 928,
    closingSpeed: 30,
  }, transient, options);
  assert.equal(converging.action, 'wait');
  assert.equal(converging.divergenceSamples, 0,
    'one converging sample must clear a prior transient retreat streak');
  assert.equal(converging.divergenceAnchorDistance, null);
  assert.equal(converging.bestDistance, 928);
  assert.equal(converging.lastDistance, 928);

  const wrongTarget = routeModule.planPq017AutopilotAvoidanceRecovery({
    ...navigation,
    tick: 108,
    autopilot: { active: true, status: 'avoiding', targetEntityId: 999 },
  }, converging, options);
  assert.equal(wrongTarget.action, 'manual-recovery');
  assert.equal(wrongTarget.reason, 'unrelated-autopilot-lease');

  let stalled = {};
  for (let sample = 1; sample < 20; sample += 1) {
    stalled = routeModule.planPq017AutopilotAvoidanceRecovery({
      ...navigation,
      tick: 200 + sample,
      distance: 925,
      speed: 0,
      closingSpeed: 0,
    }, stalled, options);
    assert.equal(stalled.action, 'wait');
    assert.equal(stalled.stallSamples, sample);
  }
  stalled = routeModule.planPq017AutopilotAvoidanceRecovery({
    ...navigation,
    tick: 220,
    distance: 925,
    speed: 0,
    closingSpeed: 0,
  }, stalled, options);
  assert.equal(stalled.action, 'reverse-restage');
  assert.equal(stalled.reason, 'zero-speed-avoidance-deadlock');

  const exhausted = routeModule.planPq017AutopilotAvoidanceRecovery({
    ...navigation,
    tick: 221,
    distance: 925,
    speed: 0,
    closingSpeed: 0,
  }, {
    ...stalled,
    stallSamples: 19,
    recoveries: 2,
  }, options);
  assert.equal(exhausted.action, 'manual-recovery');
  assert.equal(exhausted.reason, 'avoidance-recovery-budget-exhausted');
});

test('PQ-017 missed first MMB receipt schedules one retry only after a neutral distinct tick', () => {
  assert.equal(typeof pq017Route.planPq017AutopilotEngagementReceipt, 'function');
  const options = {
    expectedTargetEntityId: 320,
    expectedWorldRecordId: 'world_site_helios_relay/component/relay_core',
    maxAttempts: 3,
    requestExpired: true,
  };
  const selected = {
    entityId: 320,
    worldRecordId: options.expectedWorldRecordId,
    targetable: true,
    presentationAdmitted: true,
  };
  const expired = pq017Route.planPq017AutopilotEngagementReceipt({
    tick: 112,
    selected,
    autopilot: { active: false, status: 'manual', targetEntityId: null },
  }, {
    attempts: 1,
    requestTick: 100,
    lastTick: 100,
  }, options);
  assert.equal(expired.action, 'retry');
  assert.equal(expired.reason, 'autopilot-receipt-window-expired');
  assert.equal(expired.attempts, 1);
  assert.equal(expired.requestTick, null);

  const sameTick = pq017Route.planPq017AutopilotEngagementReceipt({
    tick: 112,
    selected,
    autopilot: { active: false, status: 'manual', targetEntityId: null },
  }, expired, options);
  assert.equal(sameTick.action, 'wait');
  assert.equal(sameTick.reason, 'awaiting-neutral-distinct-tick');

  const retry = pq017Route.planPq017AutopilotEngagementReceipt({
    tick: 113,
    selected,
    autopilot: { active: false, status: 'manual', targetEntityId: null },
  }, expired, options);
  assert.equal(retry.action, 'request');
  assert.equal(retry.attempts, 2);
  assert.equal(retry.requestTick, 113);
});

test('PQ-017 batched fixed ticks accept only the exact active MMB receipt', () => {
  const expectedWorldRecordId = 'world_site_helios_relay/component/relay_core';
  const receipt = pq017Route.planPq017AutopilotEngagementReceipt({
    tick: 207,
    selected: {
      entityId: 320,
      worldRecordId: expectedWorldRecordId,
      targetable: true,
      presentationAdmitted: true,
    },
    autopilot: { active: true, status: 'cruising', targetEntityId: 320 },
  }, {
    attempts: 1,
    requestTick: 200,
    lastTick: 200,
  }, {
    expectedTargetEntityId: 320,
    expectedWorldRecordId,
    maxAttempts: 3,
    requestExpired: false,
  });
  assert.equal(receipt.action, 'received',
    'a 7-tick render batch must not make the held MMB edge expire at the old 4-tick boundary');
  assert.equal(receipt.reason, 'exact-autopilot-receipt');
});

test('PQ-017 MMB retry refuses a foreign active autopilot lease', () => {
  const expectedWorldRecordId = 'world_site_helios_relay/component/relay_core';
  const result = pq017Route.planPq017AutopilotEngagementReceipt({
    tick: 204,
    selected: {
      entityId: 320,
      worldRecordId: expectedWorldRecordId,
      targetable: true,
      presentationAdmitted: true,
    },
    autopilot: { active: true, status: 'cruising', targetEntityId: 999 },
  }, {
    attempts: 1,
    requestTick: 200,
    lastTick: 200,
  }, {
    expectedTargetEntityId: 320,
    expectedWorldRecordId,
    maxAttempts: 3,
    requestExpired: false,
  });
  assert.equal(result.action, 'refuse');
  assert.equal(result.reason, 'foreign-active-autopilot-lease');
});

test('PQ-017 MMB retry fails closed when its bounded request budget is exhausted', () => {
  const expectedWorldRecordId = 'world_site_helios_relay/component/relay_core';
  const result = pq017Route.planPq017AutopilotEngagementReceipt({
    tick: 312,
    selected: {
      entityId: 320,
      worldRecordId: expectedWorldRecordId,
      targetable: true,
      presentationAdmitted: true,
    },
    autopilot: { active: false, status: 'manual', targetEntityId: null },
  }, {
    attempts: 3,
    requestTick: 300,
    lastTick: 300,
  }, {
    expectedTargetEntityId: 320,
    expectedWorldRecordId,
    maxAttempts: 3,
    requestExpired: true,
  });
  assert.equal(result.action, 'blocked');
  assert.equal(result.reason, 'autopilot-engagement-budget-exhausted');
});

test('PQ-017 active MMB request releases immediately when Flyby Focus steals selection', () => {
  const expectedWorldRecordId = 'world_site_helios_relay/component/relay_core';
  const result = pq017Route.planPq017AutopilotEngagementReceipt({
    tick: 401,
    selected: {
      entityId: 291,
      worldRecordId: null,
      targetable: false,
      presentationAdmitted: false,
    },
    autopilot: { active: false, status: 'manual', targetEntityId: null },
  }, {
    attempts: 1,
    requestTick: 400,
    lastTick: 400,
  }, {
    expectedTargetEntityId: 320,
    expectedWorldRecordId,
    maxAttempts: 3,
    requestExpired: false,
  });
  assert.equal(result.action, 'retry');
  assert.equal(result.reason, 'autopilot-selection-lost-during-request');
  assert.equal(result.requestTick, null);
});

test('PQ-017 manual thrust recovery re-edges only an expected expired lease on distinct ticks', () => {
  const exactNavigation = {
    tick: 7047,
    target: { entityId: 286 },
    autopilot: { active: false, status: 'manual', targetEntityId: 320 },
    input: { moveZ: 0 },
    distance: 638.6887356611178,
    speed: 0.00063374800943752,
  };
  const exactRecovery = {
    attempts: 0,
    neutralSamples: 1,
    requestedTick: 7045,
    lastTick: 7046,
  };
  const options = {
    expectedTargetEntityId: 320,
    settledRadius: 100,
    maxReedges: 2,
    minimumNeutralSamples: 2,
  };
  const exact = planPq017ManualThrustReceiptRecovery(
    exactNavigation,
    exactRecovery,
    options,
  );
  assert.equal(exact.action, 'reedge');
  assert.equal(exact.attempts, 1,
    'the intentional root286 guidance / relay320 MMB split must permit bounded re-edge recovery');

  const duplicateTick = planPq017ManualThrustReceiptRecovery(
    { ...exactNavigation, tick: 7046, input: { moveZ: 1 } },
    exactRecovery,
    options,
  );
  assert.equal(duplicateTick.action, 'wait');
  assert.equal(duplicateTick.reason, 'duplicate-simulation-tick',
    'input state from the request tick is not a later fixed-step receipt');

  const received = planPq017ManualThrustReceiptRecovery(
    { ...exactNavigation, tick: 7048, input: { moveZ: 1 } },
    {
      ...exactRecovery,
      lastDistance: exactNavigation.distance + 0.2,
      lastSpeed: exactNavigation.speed,
    },
    options,
  );
  assert.equal(received.action, 'received');
  assert.equal(received.reason, 'manual-thrust-received');

  const foreignActive = planPq017ManualThrustReceiptRecovery(
    {
      ...exactNavigation,
      autopilot: { active: true, status: 'cruising', targetEntityId: 999 },
    },
    exactRecovery,
    options,
  );
  assert.equal(foreignActive.action, 'refuse');
  assert.equal(foreignActive.reason, 'foreign-active-autopilot-lease',
    'edge recovery must not interfere with another live autopilot owner');

  const exhausted = planPq017ManualThrustReceiptRecovery(
    exactNavigation,
    { ...exactRecovery, attempts: 2 },
    options,
  );
  assert.equal(exhausted.action, 'blocked');
  assert.equal(exhausted.reason, 'manual-thrust-reedge-budget-exhausted');
});

test('PQ-017 run38 re-edges a received W hold that produces no flight progress', () => {
  const options = {
    expectedTargetEntityId: 320,
    settledRadius: 100,
    maxReedges: 2,
    minimumStalledInputSamples: 2,
  };
  const staleHold = {
    tick: 21812,
    target: { entityId: 286 },
    autopilot: { active: false, status: 'manual', targetEntityId: 320 },
    input: { moveZ: 1 },
    distance: 224.1125,
    speed: 0.0006,
  };
  let recovery = {
    action: 'received',
    reason: 'manual-thrust-received',
    attempts: 0,
    neutralSamples: 0,
    stalledInputSamples: 0,
    requestedTick: 2446,
    lastTick: 21811,
    lastDistance: 224.1126,
    lastSpeed: 0.0007,
  };

  recovery = planPq017ManualThrustReceiptRecovery(staleHold, recovery, options);
  assert.equal(recovery.action, 'wait');
  assert.equal(recovery.reason, 'manual-thrust-input-without-progress');
  assert.equal(recovery.stalledInputSamples, 1);

  recovery = planPq017ManualThrustReceiptRecovery({
    ...staleHold,
    tick: 21813,
    distance: 224.1124442044206,
    speed: 0.0005668487841055615,
  }, recovery, options);
  assert.equal(recovery.action, 'reedge');
  assert.equal(recovery.reason, 'manual-thrust-held-state-desynchronized');
  assert.equal(recovery.attempts, 1,
    'two distinct zero-progress W receipts must consume one bounded physical re-edge');

  const healthy = planPq017ManualThrustReceiptRecovery({
    ...staleHold,
    tick: 21813,
    distance: 223.9,
    speed: 0.25,
  }, {
    ...recovery,
    attempts: 0,
    stalledInputSamples: 1,
    lastTick: 21812,
    lastDistance: staleHold.distance,
    lastSpeed: staleHold.speed,
  }, options);
  assert.equal(healthy.action, 'received');
  assert.equal(healthy.reason, 'manual-thrust-received');
  assert.equal(healthy.stalledInputSamples, 0,
    'measured acceleration or closing progress must not trigger a spurious re-edge');
});

test('PQ-017 operation route diagnostics fail closed on an out-of-range selected component', () => {
  const manifest = worldSiteManifestById('world_site_helios_relay');
  const record = createWorldSiteRecord(manifest, { tick: 10 });
  const observation = {
    record,
    player: { x: 0, z: 0, vx: 0, vz: 0 },
    selected: {
      entityId: 42,
      componentId: 'safety_coupler',
      worldRecordId: 'world_site_helios_relay/component/safety_coupler',
      x: 717,
      z: 0,
      radius: 6,
      targetable: true,
      presentationAdmitted: true,
    },
    beam: { tierId: 'beam_mk1', range: 220 },
    input: { moveX: 0, moveZ: 0, turnIntent: 0, brake: false, siteBeam: false },
    mining: { beaming: false, lockedTargetId: null, activeVerb: null },
  };

  const far = summarizePq017OperationRouteDiagnostic(observation, {
    componentId: 'safety_coupler',
    operationId: 'recover_safety_coupler',
  });
  assert.equal(far.selected.componentMatches, true);
  assert.equal(far.range.distance, 717);
  assert.equal(far.range.allowedDistance, 226);
  assert.equal(far.range.inRange, false);
  assert.equal(far.readiness.readyOperationId, 'recover_safety_coupler');
  assert.equal(far.readiness.expectedOperationReady, true);
  assert.equal(far.routeReady, false);

  const near = summarizePq017OperationRouteDiagnostic({
    ...observation,
    selected: { ...observation.selected, x: 100 },
  }, {
    componentId: 'safety_coupler',
    operationId: 'recover_safety_coupler',
  });
  assert.equal(near.range.distance, 100);
  assert.equal(near.range.inRange, true);
  assert.equal(near.motion.speed, 0);
  assert.equal(near.motion.settled, true);
  assert.equal(near.routeReady, true);

  record.components.safety_coupler.progress.recover_safety_coupler = 12;
  const moving = summarizePq017OperationRouteDiagnostic({
    ...observation,
    player: { x: 0, z: 0, vx: 18, vz: 0 },
    selected: { ...observation.selected, x: 100 },
    input: { moveX: 0, moveZ: -1, turnIntent: 0, brake: true, siteBeam: true },
    mining: { beaming: true, lockedTargetId: 42, activeVerb: 'repair' },
  }, {
    componentId: 'safety_coupler',
    operationId: 'recover_safety_coupler',
  });
  assert.equal(moving.range.inRange, true);
  assert.equal(moving.motion.speed, 18);
  assert.equal(moving.motion.maxSettledSpeed, 4);
  assert.equal(moving.motion.settled, false);
  assert.equal(moving.input.brake, true);
  assert.equal(moving.input.siteBeam, true);
  assert.equal(moving.mining.lockedTargetId, 42);
  assert.equal(moving.mining.lockedToSelected, true);
  assert.equal(moving.operation.progress, 12);
  assert.equal(moving.operation.threshold, 24);
  assert.equal(moving.routeReady, false);
});

test('PQ-017 accepted evidence history selection is bounded, ordered, and runtime-isolated', () => {
  const names = [
    'browser-history-200',
    'electron-history-999',
    'browser-history-050',
    'browser',
    '.tmp-browser-10-20-deadbeef',
    'browser-history-not-a-timestamp',
    'browser-history-300',
    'electron-history-100',
    'browser-history-100',
  ];
  const browser = selectPq017EvidenceHistory(names, { runtimeKind: 'browser', retain: 2 });
  assert.deepEqual(browser.matching, [
    'browser-history-300',
    'browser-history-200',
    'browser-history-100',
    'browser-history-050',
  ]);
  assert.deepEqual(browser.keep, ['browser-history-300', 'browser-history-200']);
  assert.deepEqual(browser.prune, ['browser-history-050', 'browser-history-100']);
  assert(!browser.prune.some((name) => name.startsWith('electron-')));
  assert(!browser.prune.includes('browser'));
  assert(!browser.prune.some((name) => name.startsWith('.tmp-')));

  const electron = selectPq017EvidenceHistory(names, { runtimeKind: 'electron', retain: 1 });
  assert.deepEqual(electron.matching, ['electron-history-999', 'electron-history-100']);
  assert.deepEqual(electron.keep, ['electron-history-999']);
  assert.deepEqual(electron.prune, ['electron-history-100']);
  assert(!electron.prune.some((name) => name.startsWith('browser-')));
});

test('PQ-017 history pruning refuses accepted-directory aliases and prunes only real owned history', async (t) => {
  const canonicalTempParent = await realpath(tmpdir());
  const temporaryRoot = await mkdtemp(path.join(canonicalTempParent, 'spaceface-pq017-history-'));
  const cleanupTarget = path.resolve(temporaryRoot);
  const comparePath = (value) => process.platform === 'win32' ? value.toLowerCase() : value;
  assert.equal(comparePath(path.dirname(cleanupTarget)), comparePath(path.resolve(canonicalTempParent)));
  t.after(async () => {
    assert.equal(comparePath(path.dirname(cleanupTarget)), comparePath(path.resolve(canonicalTempParent)));
    await rm(cleanupTarget, { recursive: true, force: true });
  });

  const accepted = path.join(temporaryRoot, 'browser');
  const oldest = path.join(temporaryRoot, 'browser-history-100');
  const newest = path.join(temporaryRoot, 'browser-history-200');
  const otherRuntime = path.join(temporaryRoot, 'electron-history-999');
  await Promise.all([
    mkdir(accepted),
    mkdir(oldest),
    mkdir(newest),
    mkdir(otherRuntime),
  ]);

  const alias = path.join(temporaryRoot, 'browser-history-050');
  let aliasSupported = true;
  try {
    await symlink(accepted, alias, process.platform === 'win32' ? 'junction' : 'dir');
  } catch (error) {
    if (!['EACCES', 'EINVAL', 'ENOSYS', 'ENOTSUP', 'EPERM'].includes(error?.code)) throw error;
    aliasSupported = false;
    t.diagnostic(`directory alias unavailable on this host: ${error.code}`);
  }

  if (aliasSupported) {
    await assert.rejects(
      prunePq017EvidenceHistory({ outputRoot: temporaryRoot, runtimeKind: 'browser', retain: 1 }),
      /refusing unsafe PQ-017 history prune target/,
    );
    assert.equal((await stat(accepted)).isDirectory(), true, 'accepted browser evidence must survive alias refusal');
    assert.equal((await stat(oldest)).isDirectory(), true, 'refusal must occur before another history deletion');
    await unlink(alias);
  }

  const result = await prunePq017EvidenceHistory({
    outputRoot: temporaryRoot,
    runtimeKind: 'browser',
    retain: 1,
  });
  assert.deepEqual(result.kept, ['browser-history-200']);
  assert.deepEqual(result.pruned, ['browser-history-100']);
  await assert.rejects(stat(oldest), { code: 'ENOENT' });
  assert.equal((await stat(newest)).isDirectory(), true);
  assert.equal((await stat(accepted)).isDirectory(), true);
  assert.equal((await stat(otherRuntime)).isDirectory(), true);
});

test('PQ-017 telemetry summarizes a bounded distribution and explicit hitch count', () => {
  const samples = Array.from({ length: 12 }, (_, index) => index + 1);
  const result = summarizeBoundedFrameTimes(samples, {
    sampleLimit: 10,
    hitchThresholdMs: 8,
    floorP95BudgetMs: 12,
  });

  assert.equal(result.samples, 10);
  assert.deepEqual(result.distributionMs, {
    min: 3,
    p50: 7,
    p95: 11,
    p99: 11,
    max: 12,
    avg: 7.5,
  });
  assert.equal(result.hitchesOverThreshold, 4);
  assert.equal(result.sampleLimit, 10);
  assert.equal(result.floorP95BudgetMet, true);
});

test('PQ-017 telemetry keeps bounded per-phase attribution without weakening the whole-window gate', () => {
  assert.equal(typeof pq017Route.summarizeBoundedFramePhases, 'function');
  const samples = [10, 40, 20, 50, 30, 60];
  const phases = [
    'operation:repair_relay_core',
    'operation:repair_relay_core',
    'wait:repair_relay_core',
    'finalization:opened',
    'wait:repair_relay_core',
    'finalization:opened',
  ];
  const attribution = pq017Route.summarizeBoundedFramePhases(samples, phases, {
    sampleLimit: 6,
    phaseLimit: 2,
    hitchThresholdMs: 32,
  });

  assert.deepEqual(attribution, {
    taggedSamples: 6,
    sampleLimit: 6,
    phaseLimit: 2,
    hitchThresholdMs: 32,
    phases: [
      {
        phase: 'operation:repair_relay_core',
        samples: 2,
        p95Ms: 10,
        hitchesOverThreshold: 1,
      },
      {
        phase: 'other',
        samples: 4,
        p95Ms: 50,
        hitchesOverThreshold: 2,
      },
    ],
  });

  const wholeWindow = summarizeBoundedFrameTimes(samples, {
    sampleLimit: 6,
    hitchThresholdMs: 32,
    floorP95BudgetMs: 34,
  });
  assert.equal(wholeWindow.samples, attribution.taggedSamples,
    'phase attribution must account for every sample retained by the primary gate');
  assert.equal(wholeWindow.distributionMs.p95, 50,
    'per-phase summaries must not replace or recalculate the whole-window primary p95');
  assert.equal(wholeWindow.floorP95BudgetMet, false,
    'phase attribution must not turn a failing whole-window gate into a pass');
});

test('PQ-017 primary performance acceptance requires uninstrumented representative windows', () => {
  assert.equal(
    typeof pq017Route.evaluatePq017PrimaryPerformanceInstrumentation,
    'function',
    'the primary gate must expose a behavioral instrumentation-integrity evaluator',
  );
  const window = (systemTimingEnabled) => ({
    diagnostics: { perf: { systemTimingEnabled } },
  });
  const uninstrumented = pq017Route.evaluatePq017PrimaryPerformanceInstrumentation({
    activeOperation: window(false),
    travel: {
      outbound: window(false),
      inbound: window(false),
    },
  });
  assert.equal(uninstrumented.pass, true);
  assert.deepEqual(uninstrumented.failures, []);

  const instrumented = pq017Route.evaluatePq017PrimaryPerformanceInstrumentation({
    activeOperation: window(true),
    travel: {
      outbound: window(false),
      inbound: window(false),
    },
  });
  assert.equal(instrumented.pass, false);
  assert.deepEqual(instrumented.failures, [
    'active-site-operations-system-timing-enabled',
  ]);

  const incomplete = pq017Route.evaluatePq017PrimaryPerformanceInstrumentation({
    activeOperation: window(false),
    travel: { outbound: window(false) },
  });
  assert.equal(incomplete.pass, false);
  assert.deepEqual(incomplete.failures, [
    'ordinary-inbound-gate-and-site-approach-system-timing-state-missing',
  ]);
});

test('PQ-017 timing attribution mode is diagnostic and cannot promote accepted evidence', async () => {
  assert.equal(
    typeof pq017Route.classifyPq017PerformanceRun,
    'function',
    'the wrapper must derive promotion authority from one tested run-mode contract',
  );
  assert.deepEqual(
    pq017Route.classifyPq017PerformanceRun({ captureSystemTiming: false }),
    {
      artifactKind: 'primary',
      captureSystemTiming: false,
      primaryAcceptance: true,
      promoteAcceptedArtifact: true,
    },
  );
  assert.deepEqual(
    pq017Route.classifyPq017PerformanceRun({ captureSystemTiming: true }),
    {
      artifactKind: 'diagnostic',
      captureSystemTiming: true,
      primaryAcceptance: false,
      promoteAcceptedArtifact: false,
    },
  );

  const electron = await source('scripts/probe-pq017-world-site-electron.mjs');
  assert.match(electron, /classifyPq017PerformanceRun/);
  assert.match(electron, /primaryAcceptance:\s*runMode\.primaryAcceptance/);
  assert.match(electron, /captureSystemTiming:\s*runMode\.captureSystemTiming/);
  assert.match(
    electron,
    /if\s*\(runMode\.promoteAcceptedArtifact\)\s*\{[\s\S]*?rename\(STAGING,\s*ACCEPTED\)/,
    'only the tested primary run mode may replace accepted Electron evidence',
  );
});

test('PQ-017 performance comparison supplements the absolute floor and rejects feature-local regression', () => {
  const window = (frameP95, workP95) => ({
    frameTimes: { distributionMs: { p95: frameP95 } },
    diagnostics: { perf: { frameCallback: { p95: workP95 } } },
  });
  const loadedHost = evaluatePq017PerformanceComparison({
    activeOperation: window(50, 39.6),
    travel: { inbound: window(83.4, 49.4) },
  });
  assert.equal(loadedHost.pass, true);
  assert.deepEqual(loadedHost.failures, []);

  const featureRegression = evaluatePq017PerformanceComparison({
    activeOperation: window(60, 58),
    travel: { inbound: window(20, 18) },
  });
  assert.equal(featureRegression.pass, false);
  assert(featureRegression.failures.includes('active-site-frame-p95-regressed'));
  assert(featureRegression.failures.includes('active-site-work-p95-regressed'));
});

test('PQ-017 lifecycle audit requires site-scoped cleanup and exact return to baseline', () => {
  const before = {
    siteEntityCount: 7,
    siteRenderRootCount: 7,
    presentationFixtureCount: 3,
    presentationFixtureIds: ['beacon-glow', 'coupler-bar', 'relay-core'],
    siteRenderObjectCount: 42,
    trackedRenderRootCount: 7,
  };
  const away = {
    siteEntityCount: 0,
    siteRenderRootCount: 0,
    presentationFixtureCount: 0,
    presentationFixtureIds: [],
    siteRenderObjectCount: 0,
    trackedRenderRootCount: 0,
  };
  const after = { ...before };
  const pass = evaluateSiteResidencyLifecycle({ before, away, after });
  assert.equal(pass.pass, true);
  assert.deepEqual(pass.failures, []);

  const leaked = evaluateSiteResidencyLifecycle({
    before,
    away: { ...away, trackedRenderRootCount: 1 },
    after: { ...after, presentationFixtureCount: 4 },
  });
  assert.equal(leaked.pass, false);
  assert(leaked.failures.includes('away-tracked-render-roots-not-clean'));
  assert(leaked.failures.includes('return-presentation-fixtures-not-baseline'));

  const zeroFixture = evaluateSiteResidencyLifecycle({
    before: { ...before, presentationFixtureCount: 0, presentationFixtureIds: [] },
    away,
    after: { ...after, presentationFixtureCount: 0, presentationFixtureIds: [] },
  });
  assert.equal(zeroFixture.pass, false);
  assert(zeroFixture.failures.includes('before-presentation-fixtures-missing'));

  const wrongFixtureIdentity = evaluateSiteResidencyLifecycle({
    before,
    away,
    after: {
      ...after,
      presentationFixtureIds: ['beacon-glow', 'coupler-bar', 'wrong-fixture'],
    },
  });
  assert.equal(wrongFixtureIdentity.pass, false);
  assert(wrongFixtureIdentity.failures.includes('return-presentation-fixture-identities-not-baseline'));
});

test('PQ-017 impact audit pins one safety-coupler rollback and matching durable receipt', () => {
  const before = impactSnapshot({ cycle: 0, status: 'operational', completed: true });
  const after = impactSnapshot({ cycle: 1, status: 'failed', completed: false, failed: true });
  const audit = auditSafetyCouplerImpact(before, after);
  assert.equal(audit.pass, true);
  assert.equal(audit.receiptId, 'world_site_helios_relay/failure/safety_coupler/1');

  after.events.push(structuredClone(after.events[0]));
  const duplicate = auditSafetyCouplerImpact(before, after);
  assert.equal(duplicate.pass, false);
  assert(duplicate.failures.includes('failure-event-count:2'));

  const collateral = impactSnapshot({ cycle: 1, status: 'failed', completed: false, failed: true });
  delete collateral.record.completedOperations.repair_relay_core;
  collateral.record.components.relay_core.status = 'failed';
  const collateralAudit = auditSafetyCouplerImpact(before, collateral);
  assert.equal(collateralAudit.pass, false);
  assert(collateralAudit.failures.includes('completed-operation-removals:recover_safety_coupler,repair_relay_core'));
  assert(collateralAudit.failures.includes('component-collateral:relay_core'));

  const missingEmbeddedReceipt = impactSnapshot({
    cycle: 1,
    status: 'failed',
    completed: false,
    failed: true,
  });
  delete missingEmbeddedReceipt.events[0].payload.receipt;
  const missingReceiptAudit = auditSafetyCouplerImpact(before, missingEmbeddedReceipt);
  assert.equal(missingReceiptAudit.pass, false);
  assert(missingReceiptAudit.failures.includes('failure-event-receipt-missing'));
});

function impactSnapshot({ cycle, status, completed, failed = false }) {
  const receiptId = `world_site_helios_relay/failure/safety_coupler/${cycle}`;
  const failure = {
    failureId: 'safety_coupler_impact',
    componentId: 'safety_coupler',
    cycle,
    receiptId,
    kind: 'failure',
    complete: true,
    tick: 500,
  };
  return {
    record: {
      stageId: failed ? 'damaged' : 'recovered',
      components: {
        safety_coupler: { cycle, status },
        relay_core: { cycle: 0, status: 'operational', progress: {} },
        cargo_brace: { cycle: 0, status: 'detached', progress: {} },
      },
      completedOperations: {
        repair_relay_core: { cycle: 0, receiptId: 'operation/repair_relay_core/0' },
        cut_cargo_brace: { cycle: 0, receiptId: 'operation/cut_cargo_brace/0' },
        ...(completed ? { recover_safety_coupler: { cycle } } : {}),
      },
      failures: failed ? [failure] : [],
      receipts: failed ? [failure] : [],
    },
    events: failed ? [{
      name: 'worldSite:failureReceipt',
      payload: {
        siteId: 'world_site_helios_relay',
        componentId: 'safety_coupler',
        triggerId: 'safety_coupler_impact',
        stageId: 'damaged',
        receipt: failure,
      },
    }] : [],
  };
}
