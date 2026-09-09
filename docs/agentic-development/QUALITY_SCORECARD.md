<!-- LIFETIME: STABLE -->
# Quality Scorecard and Convergence Floors

This scorecard exists so the Central Brain can compare unlike work without pretending that game quality is one numeric score. It is evidence-oriented, qualitative and time-sensitive.

The queue answers **what work is admitted**. This scorecard answers **which player-visible quality surface is currently weakest and how confidently do we know that?**

## 1. States

Every domain/surface has one state and evidence date/digest:

- `BLOCKED` — the representative route cannot be evaluated because a prerequisite is broken.
- `RED` — severe demonstrated player-facing failure.
- `YELLOW` — functional, but a meaningful quality/clarity/consistency problem is demonstrated.
- `GREEN` — fresh representative evidence meets the named bar.
- `UNKNOWN` — evidence is absent, stale, or not representative.

`UNKNOWN` is not a soft green. It is uncertainty that may justify a cheap characterization run before implementation.

## 2. Evidence freshness

A score is only as good as its evidence. Attach:

```text
scenario / route
candidate digest
platform/profile
capture or telemetry digest
observed date
confidence: high | medium | low
```

Evidence is stale when relevant owners have materially changed since capture, when the route/setup no longer matches live behavior, or when the instrument was shown to be blind to the claimed class.

Do not keep a static committed dashboard of red/yellow/green facts if it will rot. Generate current reports from the live tree and retained evidence. Durable documents should describe the rubric, not pretend to be a live status board.

## 3. Core domains

### INTEGRITY

Question: does the ordinary player route reliably produce a complete coherent game state and picture?

RED examples:
- required entity exists but publishes no visual;
- save/Continue corrupts or diverges;
- simulation continues while presentation is permanently frozen;
- context loss does not recover;
- deterministic replay diverges unexpectedly;
- a primary route hard-fails to boot/navigate.

GREEN requires fresh representative route evidence, not merely import/tests.

### FLIGHT_AND_CAMERA

Question: do player controls, auto-flight and camera behavior read as intentional and useful in combat?

Observe slalom/reversal/brake/path/collision scenarios. Compare response, settle, achieved speed, cross-track error, oscillation and camera jerk.

RED examples:
- controls cannot produce nimble intended maneuvering;
- repeated steering oscillation or path-floor crawling;
- camera motion materially obscures action;
- collision recovery traps control for a noticeable interval.

### COMBAT_AND_AI

Question: do enemies make legible tactical choices and create readable pressure rather than steering noise?

Observe duel, four-ship mixed-role and twelve-body cohort scenarios.

RED examples:
- enemies repeatedly reverse/churn tactics/targets;
- formations collapse into shared-point jitter;
- ships possess fire opportunities but fail to act;
- telegraph/fairness failures create unavoidable damage;
- combat spends long intervals with no useful interaction.

### PERFORMANCE_AND_LIFECYCLE

Question: does the same authored picture remain smooth over first-use, dense combat and longer sessions?

Evidence: p50/p95/p99, hitch events, phase owners, liveness, first-use admission, resource slopes.

RED examples:
- multi-second freeze;
- persistent >16.7 ms target-profile p95 where that profile is the named budget;
- recurrent hitch regression relative to accepted baseline;
- runaway resource growth;
- a supposed optimization achieves its result through quality/content reduction.

### PRESENTATION_AND_VFX

Question: do major actions read immediately, consistently and causally under normal play saturation?

RED examples:
- primary verb lacks timely paired feedback;
- required effect is soft/noisy/placeholder compared with adjacent language;
- high-priority causal events disappear under saturation;
- one route uses generic ring/sprite spam where the established structural grammar should communicate cause.

### VISUAL_ASSET_COHERENCE

Question: are frequently exposed assets complete and within a controlled maturity range?

Use separate maturity:
- L0 absent/fallback/partial/broken;
- L1 complete/readable at shipping camera;
- L2 coherent production quality;
- L3 hero/premium.

A route is RED if it contains an unintentional L0 beside accepted authored assets. It is commonly YELLOW if a frequently seen L1 family is strongly inconsistent with surrounding L2 work.

Do not call a route red merely because a non-hero object is not L3.

### UI_AND_STRATEGIC_LAYER

Question: can the player understand and manipulate the deep simulation through the existing instrument grammar?

Observe reachability, hierarchy, state memory, data states, accessibility modes, localization expansion, responsive bands and visual regression.

RED examples:
- important simulation state is materially inaccessible/misleading;
- screen is unreadable or blocks the playfield on a supported profile;
- core action has no obvious verb/path;
- empty/loading/error state reads as a broken blank surface.

### CONTENT_BREADTH_AND_DEPTH

Question: does content produce distinct decisions and enough encounter/world variety without becoming filler?

Measure coverage by role/doctrine/counterplay/attack grammar/encounter function/visual identity rather than raw row count.

RED is reserved for severe repetition that damages primary play. YELLOW is appropriate when systems work but obvious coverage holes/repetition remain.

### CROSS_SYSTEM_PARITY

Question: where is the largest maturity/quality discontinuity across representative routes?

Examples:
- flight VFX L2, mining feedback L0/L1;
- most hulls authored while one common enemy is invisible or fallback;
- core strategic screens polished while one common modal uses unstyled/browser-default presentation;
- player flight deliberate while one enemy family still jitters.

This domain turns unevenness into bounded follow-up work rather than a vague "polish everything" campaign.

## 4. Core quality floors

For unnamed broad development, these normally block prestige-only work when RED:

1. Integrity.
2. Primary flight/control.
3. Primary combat/AI legibility.
4. Severe frame liveness/hitches.

The floor is not "everything must be green before art." Presentation is part of the game and should proceed in parallel. The rule is narrower: do not let optional L3 micro-detail monopolize the portfolio while a frequently exposed core RED remains actionable.

An explicit user request for art overrides the portfolio rule.

## 5. Severity rubric

Use coarse severity:

- S4 — blocks play, corrupts truth, invisible required content, crash/freeze.
- S3 — primary control/combat/strategic failure materially harms ordinary play.
- S2 — obvious recurring quality/clarity/repetition defect.
- S1 — polish opportunity visible but non-disruptive.
- S0 — speculative/no demonstrated player impact.

Severity is not a permanent property of a file. It belongs to a finding on a route.

## 6. Exposure rubric

Use ordinary-player exposure rather than developer interest:

- E4 — essentially every session / primary route.
- E3 — frequent major loop.
- E2 — regular but situational.
- E1 — uncommon/optional.
- E0 — debug, hidden or not currently reachable.

A tiny but E4 defect may outrank a spectacular E1 improvement.

## 7. Recurrence and leverage

Recurrence asks whether the symptom is isolated or systematic. Leverage asks how many future outcomes inherit the fix.

Examples of high leverage:
- correct asset publication contract used by all ship families;
- Motion Lab regression metric used by player and AI tuning;
- VFX causal grammar used by many weapons/actions;
- responsive UI primitive used by every screen;
- content schema/validator that lets many agents author legal variants;
- one performance admission seam that fixes first-use across many assets.

A high-leverage support task is still support. It should unlock production, not replace it indefinitely.

## 8. Confidence

Confidence comes from evidence quality:

- HIGH — deterministic reproduction or multiple matched normal-route captures with instrument health green.
- MEDIUM — reproducible live symptom but incomplete causal owner; or strong source+single route evidence.
- LOW — stale prose, unverified screenshot, speculative grep, agent intuition.

The manager should prefer a cheap characterization when a potentially severe item is LOW confidence.

## 9. Ranking without fake precision

The manager may compute an inspectable ranking for automation, but the report should expose its factors.

Recommended conceptual model:

```text
impact = exposure × severity × recurrence
priority ≈ impact × confidence × leverage / coarse_cost
```

Do not treat the resulting number as a quality score. Two items close in score should be decided by dependencies, current write conflicts, available evidence/tooling, campaign balance and user direction.

## 10. Objective versus subjective gates

Mechanically block only properties with reliable detectors/invariants: determinism, missing required visual, route liveness, hash mismatch, calibrated performance limits, etc.

Subjective appearance/feel can use blind/cold review, but should still be grounded in a named shipping-camera scenario. Do not automate taste by inventing brittle palette/geometry/source-string rules.

A proposed telemetry detector (AI churn, dead air, feedback delay, visual dominance) begins advisory. Promote to hard gate only after the benchmark/calibration process defined by the observatory architecture.

## 11. Representative quality matrix

A generated convergence report should cover representative cells rather than every possible combination:

| Surface | Representative evidence |
|---|---|
| Boot/Continue | liveness + first-use admission |
| Free flight | acceleration/brake/slalom/reversal/camera |
| Auto/path flight | cross-track + achieved speed + settle |
| Duel | combat intent/fire/telegraph/cue lineage |
| Mixed four-ship | role/choreography/target churn |
| Twelve-body cohort | flow/collision/perf/readability |
| VFX saturation | causal family admission/readability |
| Mining/Asteroid Works | control/readability/hitch/feedback |
| Chart/HUD | capture matrix + data state + memory |
| Sector transition | origin/asset continuity/liveness |
| Bounded soak | hitch/resource/encounter repetition |

The manager should report the weakest fresh cells and the cells that are UNKNOWN due to missing instrumentation.

## 12. Acceptance and debt are separate

A PQ can be integrated/accepted for its declared outcome and the quality plane can still discover follow-up debt later. Do not rewrite history or reopen a finished packet merely because a later cross-system review discovers a new mismatch.

Create/route the smallest next outcome through the normal program system.

This distinction prevents the quality layer from becoming an infinite acceptance bureaucracy.