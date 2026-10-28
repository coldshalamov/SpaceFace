# Authored admission: retain causal evidence before timeout

2026-10-20 UTC. Owner: authored-admission evidence lane.

## Observed failure and scope

PR466 run39461102580 browser2 job118760519014 exhausted the90s authored ship admission deadline: flight, tick410,25 ships,2 presented,2 authored-presented, player authored, unknown0. The last CDP request had342ms remaining and no reply. Direct public master a8a9500ab87e1bcff91c407e96f744a52202a134 exhibited the same count signature. Neither establishes why the gate failed.

The gate counts camera-frustum-presented surfaces, not every authored ship. The actual gate evaluated against a Three.js fixture with25 authored ships and only2 in the camera reproduces exactly those counts and fails the unchanged three-presented requirement. A second fixture with23 loading ships reproduces the same original counts. These are diagnostic counterexamples, not live-game acceptance or a production admission fix.

## Delivered observer change

The existing gate snapshot now retains a bounded asset-state histogram, at most32 ship rows (identity, presentation exclusion, entity/root local pose, presentation tier, preparation phase) and at most8 recent cached upgrade jobs with active-job/admission-slot scalars. Strings cap at160 characters; row/state/text truncation is explicit. A generic no-presented-surface exclusion does not assert a frustum cause: parent visibility, layers, bounds and draw state can also exclude a surface.

Only existing cached scene diagnostics are read. They describe started/settled jobs, not scheduler pending/hold state; the output explicitly says pendingAndHoldStateAvailable=false. No new imports, asset loads, queue drains, extra CDP requests, matrix updates or production changes. The original gate predicate,90s deadline, camera and actor inputs stay unchanged. The last successful reply survives terminal error JSON serialization without another page call.

## Checks and remaining work

-18/18 authored-live-probe-contract tests pass, including actual-gate counterexamples, terminal retention and caps.
-Initial shared-tree run:19/19 CDP lifecycle/deadline/critical-order neighbors passed. Independent review subsequently reproduced the same critical-order:314 failure locally; this is not a consistently green check.
-Immutable public proposal:36/37 pass. The unchanged critical-order test:314 staging-count assertion also fails on exact public master a8 in isolation; no production fix is included. All559 module reads (546 unique paths) and4 filesystem reads matched proposed-tree object hashes. The harness does not virtualize spawned child processes or directory enumeration; this is not live runtime acceptance.
-Read-only earlier queue checks:7/8 passed. The separate opening-publication lifecycle fixture fails at test/authored-upgrade-queue-lifecycle.test.mjs:107 (undefined phase rather than awaiting-publication); not repaired or weakened here, and not attributed to this observer.

Next: review and publish this source-only increment on fresh public master, then inspect the next exact CI admission failure's retained evidence before selecting a production fix. Do not infer23 unadmitted ships from presented counts, repeat an unchanged whole-boot capture, relax budgets/gates, or claim this evidence work finishes SF-GAME/SF-ORCHARD/SF-VISUALS. Publication, live integration and user acceptance remain separate states.

## Published observer and coverage-route candidate (17:52 UTC)

The observer above is published in draft PR467, remote commit a87ccf74fdea05ffed428fa2c41655f24fcc09f1. Exact CI run39465285277 browser2 job118774961530 retained the previously missing distinction: 12 authored ships and 13 missing roots, but only two presented authored ships. Cached active jobs and admission slots were zero; pending/held inventory was not available, so this is not proof of an empty queue. Most missing roots were distant R2 records, consistent with intentional demand-limited materialization. No production admission cause or performance repair is established.

The existing seed47 startup actor never moves the camera before requiring three presented ships. Normal144WU framing is not a documented guarantee of three startup actors. This successor candidate preserves the initial default-camera ship-safety observation separately, then requests five deterministic normal outward mouse-wheel notches (144→160→176→192→208→225 requested zoom). It does not inject ships, select hidden actors, change renderer culling, reduce the three-ship/body/readability gates, or widen the original90s admission allowance. Default sampling, screenshot and inputs all consume that original allowance. Hidden pending player readiness may advance through normal frames; exposed unauthored or unknown presentation fails before input. A pending timeout never wheels.

The first default snapshot and ready default snapshot are retained independently. The default screenshot is labeled separately and is not three-ship acceptance. The immediate requestedCoverageView proves observed requested zoom, not camera convergence; cameraConvergenceUnmeasured is explicit. The later ship coverage screenshot/report is labeled expanded-public-wheel-ship-coverage. Existing New Game events and later Helios pose injection remain disclosed as fixture/injected state; this is not an ordinary-public-flight claim. No new station-specific default safety guarantee is asserted.

Candidate local checks: 38/38 contract and CDP lifecycle tests passed, including pending readiness, timeout without input, blocked wheel input, detached default camera evidence, and original Error preservation. Independent review passed and exact immutable public-tree checks also passed38/38. The coordinator authorized a separate stacked successor draft after review; PR467 and its original diagnostic CI remain immutable. Default camera population, live expanded-view success, rendering performance and game acceptance remain unproven. Next: complete independent candidate review and public-tree checks, then request coordinator approval for a separate source-only successor draft and follow its exact CI.

### Coverage delivery checkpoint (17:55 UTC)

Draft PR469: https://github.com/coldshalamov/SpaceFace/pull/469. Verified initial coverage commit006d49fb54ce8bfb6ea5ad2737bd20553429f24e has treeb2acbb0ba6c1cd335a153fe7112142c074c25d9e and sole parentPR467 head a87ccf74fdea05ffed428fa2c41655f24fcc09f1. All33 immutable module/filesystem reads matched that final tree; independent review passed38/38. PR469 was retargeted from the diagnostic branch to master because the existing check workflow only accepts master/main PR bases. Ancestry and PR467 were unchanged; the body explicitly discloses the diagnostic dependency and cumulative diff. No workflow, deployment or merge action was performed.

PR467's original run39465285277 is terminal: feel, sim, static3 and browser4 passed; static1/2 and browser1/2 failed; browser3 was cancelled. Browser2 retained the diagnostic evidence described above, not a successful three-ship admission. The coverage successor's exact live CI result is still pending. Continue from PR469's latest remote head, inspect check-assets-live default/requested/actual gate views and screenshots, and classify any failure without changing the original deadline or acceptance requirements. No user acceptance is inferred from publication or unit tests.
