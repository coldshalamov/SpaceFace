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
