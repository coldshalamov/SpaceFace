# Branch consolidation inventory

Generated: 2026-08-24T07:11:05.625Z
Current master: `d09eaab79d2380687ca4968aa04ae4401bd729d7`
Remote branches audited: **178**
Branches with a non-contained final outcome: **138**
Branches already integrated or exact-final-state contained: **40**

Evidence: commit ancestry plus exact blob/deletion identity for every path changed by each branch.

## Disposition counts

| Disposition | Count |
|---|---:|
| DROP | 40 |
| PRESERVE_REVIEW | 3 |
| REVIEW_ADAPT | 16 |
| REVIEW_PORT | 119 |

## Surviving candidates

| Branch | Ahead | Behind | Files | Collisions | Category | Last commit | Proposed disposition | Tip subject |
|---|---:|---:|---:|---:|---|---|---|---|
| `perf/exact-opening-geometry-residency` | 3 | 2 | 3 | 0 | runtime | 2026-08-24 | REVIEW_PORT | docs(perf): map quality-preserving convergence campaign |
| `codex/tactical-map-second-generation` | 1 | 13 | 8 | 0 | runtime | 2026-08-23 | REVIEW_PORT | refactor(map): replace fuzzy map semantics with native tactical grammar |
| `remove-overheating-systems` | 4 | 112 | 1 | 0 | validation | 2026-08-23 | REVIEW_PORT | chore: export source snapshot for overheating removal |
| `intro-cold-open-redesign` | 1 | 112 | 2 | 0 | runtime | 2026-08-23 | REVIEW_PORT | Redesign boot loading screen: full-bleed signal field, no terminal chrome |
| `feat/arcade-vfx-foundation` | 1 | 241 | 1 | 1 | runtime | 2026-08-21 | REVIEW_PORT | feat(vfx): add pooled structural arcade primitives |
| `codex/pr95-all` | 267 | 481 | 594 | 104 | runtime | 2026-08-17 | REVIEW_PORT | Close Arcade Core Wave 2 Plans 32–35 production delta and measurement. |
| `codex/pr95-wave1-swarmers` | 91 | 490 | 153 | 29 | runtime | 2026-08-16 | REVIEW_PORT | feat(render): give swarmer families distinct tells |
| `codex/pr95-ace` | 101 | 489 | 177 | 36 | runtime | 2026-08-16 | REVIEW_PORT | feat: make named ace escapes physical |
| `codex/pr95-wave1-validation` | 91 | 490 | 154 | 26 | runtime | 2026-08-16 | REVIEW_ADAPT | feat: add real arcade core validation battery |
| `codex/arcade-core-20` | 86 | 649 | 140 | 24 | runtime | 2026-08-16 | REVIEW_PORT | docs(program): close arcade core 20 campaign |
| `codex/ac14-living-chain` | 85 | 649 | 140 | 24 | runtime | 2026-08-15 | REVIEW_PORT | feat(ceres): connect the living ore chain |
| `codex/ac16-mote-pack` | 83 | 649 | 133 | 22 | runtime | 2026-08-15 | REVIEW_PORT | feat(encounters): introduce the Mote swarm pack |
| `codex/ac17-force-legibility` | 83 | 649 | 133 | 22 | runtime | 2026-08-15 | REVIEW_PORT | feat(fields): distinguish hostile anchor snares |
| `codex/ac15-wing-cargo` | 80 | 649 | 123 | 22 | runtime | 2026-08-15 | REVIEW_PORT | feat: make broken wings flee and dump cargo |
| `codex/ac13-planets-reroute` | 80 | 649 | 123 | 22 | runtime | 2026-08-15 | REVIEW_ADAPT | feat: make planetary plunges physical and credited |
| `codex/ac11-starter-envkill` | 80 | 649 | 125 | 22 | runtime | 2026-08-15 | REVIEW_PORT | feat: give the Hitch a starter environment kill |
| `codex/ac09-death-signatures` | 77 | 649 | 111 | 22 | runtime | 2026-08-15 | REVIEW_PORT | feat: give each kill style a readable death |
| `codex/ac18-damage-dressing` | 74 | 649 | 102 | 16 | runtime | 2026-08-15 | REVIEW_PORT | feat: persist physical hull damage dressing |
| `codex/ac10-combat-pacing` | 75 | 649 | 104 | 19 | runtime | 2026-08-15 | REVIEW_PORT | feat: guarantee populated-island combat contact |
| `codex/ac08-kill-causes` | 73 | 649 | 97 | 16 | runtime | 2026-08-15 | REVIEW_PORT | feat: classify and reward physical kill styles |
| `codex/ac12-vacuum-inhale` | 74 | 649 | 101 | 18 | runtime | 2026-08-15 | REVIEW_PORT | feat: stream vacuum pickups into the hull |
| `codex/ac06-physics-arsenal` | 73 | 649 | 96 | 18 | runtime | 2026-08-15 | REVIEW_PORT | fix(fields): honor marked and transient mass response |
| `codex/ac05-juice-discipline` | 72 | 649 | 90 | 15 | runtime | 2026-08-15 | REVIEW_PORT | feat: enforce combat juice discipline |
| `codex/ac04-readable-tumble` | 72 | 649 | 93 | 15 | runtime | 2026-08-15 | REVIEW_PORT | feat: unify readable tumble consequences |
| `codex/ac03-kill-rp` | 69 | 649 | 79 | 11 | runtime | 2026-08-15 | REVIEW_PORT | AC-03: route hostile kills through RP writer |
| `codex/ac02-universal-vacuum` | 69 | 649 | 79 | 11 | runtime | 2026-08-15 | REVIEW_PORT | AC-02: unify pickup attraction policy |
| `codex/ac01-kill-economy` | 65 | 649 | 70 | 8 | runtime | 2026-08-15 | REVIEW_PORT | AC-01: victim-scaled kill bursts and physical credit chips |
| `codex/ac19-market-continuity` | 65 | 649 | 66 | 4 | runtime | 2026-08-15 | REVIEW_PORT | arcade-core: blend market regime transitions |
| `codex/ac07-massline-honesty` | 65 | 649 | 66 | 1 | runtime | 2026-08-15 | REVIEW_PORT | arcade-core: AC-07 honest Massline release (no synthetic impulse) |
| `arcade-core-plans` | 63 | 649 | 62 | 0 | docs | 2026-08-15 | REVIEW_ADAPT | arcade-core: full program index (60 plans, 5 volumes, build waves) |
| `agent/codex-inference-anti-loop` | 2 | 979 | 15 | 15 | runtime | 2026-08-12 | REVIEW_PORT | fix(inference): keep verification proportional to claims |
| `fable/material-keys` | 1 | 1065 | 6 | 6 | runtime | 2026-08-10 | REVIEW_PORT | perf(render): count material keys by program family, not palette tint |
| `fable/presence-repairs` | 1 | 1074 | 8 | 8 | runtime | 2026-08-10 | REVIEW_PORT | Repair player presence in working economy |
| `fable/u13-camera` | 1 | 1078 | 4 | 4 | runtime | 2026-08-10 | REVIEW_PORT | U13 dense-scene camera legibility (WF-15) |
| `fable/u03-salvor` | 1 | 1078 | 2 | 2 | runtime | 2026-08-10 | REVIEW_PORT | U03: general salvors clean up real wrecks and loose cargo |
| `fable/u05-raider` | 1 | 1077 | 12 | 12 | runtime | 2026-08-10 | REVIEW_PORT | Implement tether-control raider specialist |
| `fable/u07-field-anchor` | 1 | 1080 | 10 | 10 | runtime | 2026-08-10 | REVIEW_PORT | feat(combat): add field anchor controller role |
| `fable/u12-fix` | 1 | 1081 | 2 | 2 | runtime | 2026-08-10 | REVIEW_PORT | Fix massline latch truth pins |
| `fable/aquarium-repairs` | 1 | 1082 | 7 | 7 | runtime | 2026-08-10 | REVIEW_PORT | AQUARIUM-REPAIRS: D1 interrupt seeds, D2 civilian cargo body, D3 cue VFX |
| `fable/u11-tuning` | 2 | 1087 | 6 | 6 | runtime | 2026-08-10 | REVIEW_PORT | U11 phase 2: pin tuned TTK artifact sourceCommit to the tuning SHA |
| `fable/u11-baseline` | 1 | 1090 | 3 | 3 | support | 2026-08-10 | REVIEW_PORT | Add U11 displacement TTK baseline |
| `fable/wreck-dressing` | 1 | 1091 | 47 | 47 | runtime | 2026-08-10 | REVIEW_PORT | PQ-045.wreck-dressing: author-down seven wreck assets into two Ceres place slots |
| `fable/u04-seam-depletion` | 1 | 1093 | 3 | 3 | runtime | 2026-08-10 | REVIEW_PORT | Add seam depletion miner relocation |
| `fable/salvage-ledger` | 1 | 1096 | 2 | 2 | runtime | 2026-08-10 | REVIEW_PORT | REC-GROK-KES-SALVAGE ledger phase: hash-audit the corrupt Grok clone (no deletion) |
| `fable/trails` | 3 | 1097 | 7 | 7 | runtime | 2026-08-10 | REVIEW_PORT | chore(render): U01 trails capture harness and ribbon perf probe |
| `fable/pq045-causal-chain` | 3 | 1102 | 5 | 5 | runtime | 2026-08-10 | REVIEW_PORT | Fix Ceres causal chain restore paths |
| `fable/receipts-coverage` | 1 | 1102 | 3 | 3 | validation | 2026-08-10 | REVIEW_PORT | check(graphics): extend asset-receipts coverage to all rocks, hulls, and live player ship |
| `fable/target-motion-audit` | 1 | 1100 | 3 | 3 | runtime | 2026-08-10 | REVIEW_PORT | Repair PQ-045 target ambiguity audit |
| `agent/inference-to-convergence-workflows` | 38 | 1172 | 45 | 36 | runtime | 2026-08-09 | REVIEW_PORT | docs(workflows): add canonical route insertion |
| `agent/professional-reference-sector-program` | 14 | 1172 | 12 | 4 | runtime | 2026-08-09 | REVIEW_PORT | docs(workflows): add SpaceFace team mindset |
| `codex/perf-hitch-20260804` | 1 | 1478 | 5 | 5 | runtime | 2026-08-05 | REVIEW_PORT | perf(render): attribute authored GPU admission stalls |
| `claude/perf00-20260727` | 10 | 1779 | 41 | 25 | runtime | 2026-07-29 | REVIEW_PORT | perf(harness): add deterministic scenario cost table |
| `claude/pq018-rebase-20260725` | 43 | 2060 | 74 | 63 | runtime | 2026-07-25 | REVIEW_PORT | docs(program): record the tier-mismatch lesson from the reverted approach planner |
| `codex/pq018-integration-review-20260725` | 9 | 2070 | 70 | 61 | runtime | 2026-07-25 | REVIEW_ADAPT | fix(pq018): restore bounded selected-object course |
| `codex/pq018-controller-implementation-20260724` | 4 | 2078 | 60 | 52 | runtime | 2026-07-25 | REVIEW_PORT | fix(validation): follow Cathedral POI map action |
| `agent/chatgpt-pq018-implementation-20260724` | 4 | 2078 | 34 | 31 | runtime | 2026-07-24 | REVIEW_PORT | chore(pq018): stage exact-base release transport |
| `codex/delegation-base-pq018-admission-20260724` | 2 | 2078 | 31 | 30 | runtime | 2026-07-24 | PRESERVE_REVIEW | fix(render): admit world site asset bindings |
| `codex/delegation-base-20260724` | 1 | 2078 | 29 | 28 | runtime | 2026-07-24 | PRESERVE_REVIEW | feat(program): install executable packet control plane |
| `agent/canonical-execution-map-20260724` | 5 | 2084 | 25 | 24 | runtime | 2026-07-24 | REVIEW_PORT | fix(program): skip blocked packet lifecycles in dispatch |
| `codex/recovery-worldbuilding-20260723` | 1 | 2119 | 47 | 26 | runtime | 2026-07-23 | REVIEW_PORT | feat(narrative): checkpoint worldbuilding expansion |
| `codex/vp220-propulsion-graphics` | 1 | 2121 | 23 | 23 | runtime | 2026-07-23 | REVIEW_PORT | feat(vfx): checkpoint VP-220 propulsion candidate |
| `agent/chatgpt-async-canary-20260723` | 1 | 2124 | 1 | 0 | docs | 2026-07-23 | PRESERVE_REVIEW | docs: add ChatGPT async delegation canary |
| `agent/gfx-production-remaster-lark` | 16 | 2122 | 71 | 53 | runtime | 2026-07-22 | REVIEW_PORT | fix(art): Helios Lark iter19 smoked glass + stronger AO cavity |
| `agent/visual-asset-production-standard` | 2 | 2124 | 8 | 8 | runtime | 2026-07-21 | REVIEW_ADAPT | docs(graphics): align agent routes with condensed standard |
| `feat/flight-deck-hud` | 4 | 2346 | 4 | 4 | runtime | 2026-07-16 | REVIEW_PORT | HUD 2.0 (Flight Deck): comms cards + backlog chip in the panel language; fix feed overlapping the left instrument stack |
| `fix/intentional-enemy-maneuvers` | 4 | 2686 | 3 | 2 | runtime | 2026-07-08 | REVIEW_PORT | Tune SG-06 maneuver stability regression thresholds |
| `codex/progression-trust-state` | 2 | 2895 | 2 | 2 | runtime | 2026-06-28 | REVIEW_PORT | Extend Codex narrative trust checks |
| `spaceface-codex-discovery-trust-current` | 2 | 2896 | 2 | 2 | runtime | 2026-06-28 | REVIEW_PORT | Guard codex discovery progress contract |
| `codex-progress-summary` | 2 | 2897 | 2 | 2 | runtime | 2026-06-28 | REVIEW_PORT | Cover codex progress summary |
| `spaceface-codex-discovery-trust` | 2 | 2898 | 2 | 2 | runtime | 2026-06-28 | REVIEW_PORT | Guard codex discovery progress contract |
| `chatgpt/services-unavailable-clarity` | 2 | 2934 | 2 | 2 | runtime | 2026-06-28 | REVIEW_PORT | Guard unavailable services clarity |
| `chatgpt/starmap-close-affordance-20260628` | 2 | 2934 | 2 | 1 | runtime | 2026-06-28 | REVIEW_PORT | Guard Local Map close affordance |
| `polish/touch-flight-menus` | 3 | 2939 | 3 | 3 | runtime | 2026-06-28 | REVIEW_PORT | Guard touch menu affordances |
| `codex/pause-map-review-copy` | 2 | 2939 | 2 | 2 | runtime | 2026-06-28 | REVIEW_PORT | Guard Pause map review copy |
| `codex/pause-map-review-affordance` | 2 | 2940 | 2 | 2 | runtime | 2026-06-28 | REVIEW_PORT | Guard Pause map review affordance |
| `polish/keyboard-first-flight-log` | 2 | 2946 | 2 | 2 | runtime | 2026-06-28 | REVIEW_PORT | Guard keyboard first-flight mission log prompt |
| `polish/gamepad-mission-log-hint` | 2 | 2948 | 2 | 2 | runtime | 2026-06-28 | REVIEW_PORT | Guard gamepad mission log hint |
| `advisor/new-game-mining-label-clean` | 2 | 2951 | 2 | 2 | runtime | 2026-06-28 | REVIEW_PORT | Guard New Game mining loadout copy |
| `advisor/new-game-mining-label` | 3 | 2951 | 2 | 2 | runtime | 2026-06-28 | REVIEW_PORT | Guard New Game mining loadout copy |
| `advisor/station-hub-control-prompts` | 2 | 2953 | 2 | 2 | runtime | 2026-06-28 | REVIEW_PORT | Guard station hub control prompts |
| `advisor/confirm-insurance-cancel-5eed39c4` | 2 | 2956 | 2 | 2 | runtime | 2026-06-28 | REVIEW_PORT | Guard services insurance cancel confirmation |
| `non-graphics-ci-lane` | 1 | 2957 | 1 | 1 | validation | 2026-06-28 | REVIEW_PORT | Add non-graphics CI lane |
| `pause-exit-save-context` | 2 | 2959 | 2 | 2 | runtime | 2026-06-28 | REVIEW_PORT | Test pause exit save context |
| `codex/save-load-slot-trust` | 3 | 2963 | 3 | 3 | runtime | 2026-06-28 | REVIEW_PORT | Wire save load slot trust check |
| `chatgpt/pause-flight-brief-current` | 2 | 2972 | 2 | 2 | runtime | 2026-06-28 | REVIEW_PORT | Add pause brief check |
| `chatgpt/pause-flight-brief` | 2 | 2974 | 2 | 2 | runtime | 2026-06-28 | REVIEW_PORT | Add pause brief check |
| `codex/station-interact-undock` | 2 | 2976 | 2 | 2 | runtime | 2026-06-28 | REVIEW_PORT | Add station interact undock check |
| `advisor/station-backdrop-undock` | 1 | 2980 | 2 | 2 | runtime | 2026-06-28 | REVIEW_PORT | Route station backdrop through undock |
| `advisor/ci-playwright-probes` | 1 | 2982 | 1 | 1 | validation | 2026-06-28 | REVIEW_ADAPT | Install Playwright for CI browser probes |
| `advisor/dock-key-case-insensitive` | 4 | 2996 | 2 | 2 | runtime | 2026-06-28 | REVIEW_PORT | Minimize input modality guard diff |
| `advisor/codex-station-reachability` | 2 | 3003 | 2 | 2 | runtime | 2026-06-28 | REVIEW_PORT | Pin Codex keyboard reachability check |
| `advisor/countermeasure-control-clarity` | 7 | 3005 | 6 | 6 | runtime | 2026-06-28 | REVIEW_PORT | Tighten README control table |
| `advisor/continue-loads-displayed-slot` | 2 | 3003 | 2 | 2 | runtime | 2026-06-28 | REVIEW_PORT | Pin save resume confidence to displayed Continue slot |
| `advisor/codex-keyboard-reachability` | 7 | 3006 | 6 | 6 | runtime | 2026-06-28 | REVIEW_PORT | Pin codex keyboard reachability contract |
| `codex/faction-standings-guidance` | 2 | 3003 | 2 | 2 | runtime | 2026-06-28 | REVIEW_PORT | Add faction guidance check |
| `advisor/contract-route-risk-preflight` | 2 | 3009 | 2 | 2 | runtime | 2026-06-28 | REVIEW_PORT | Verify mission route-risk preflight |
| `codex/mission-ship-readiness-preflight` | 2 | 3009 | 2 | 2 | runtime | 2026-06-28 | REVIEW_ADAPT | Test mission ship readiness preflight |
| `codex/mission-risk-reward-preflight-ea6c72c2` | 2 | 3013 | 2 | 2 | runtime | 2026-06-27 | REVIEW_PORT | Assert mission risk reward preflight chip |
| `advisor/mission-cargo-staging-preflight` | 2 | 3021 | 2 | 2 | runtime | 2026-06-27 | REVIEW_PORT | Test mission cargo staging preflight |
| `advisor/outfitting-mission-fit-guidance-7466` | 2 | 3022 | 2 | 2 | runtime | 2026-06-27 | REVIEW_PORT | Cover mission fit outfitting guidance |
| `chatgpt/mission-preflight-route-pacing` | 2 | 3030 | 2 | 2 | runtime | 2026-06-27 | REVIEW_PORT | Test mission preflight route pacing chips |
| `codex/services-departure-recommendation` | 2 | 3038 | 2 | 2 | runtime | 2026-06-27 | REVIEW_PORT | Cover services departure recommendations |
| `advisor/nav-save-resume-continuity-b46932d` | 2 | 3039 | 2 | 1 | runtime | 2026-06-27 | REVIEW_PORT | Install nav persistence during core init |
| `advisor/nav-save-resume-continuity-6040ce` | 3 | 3041 | 3 | 2 | runtime | 2026-06-27 | REVIEW_PORT | Guard saved nav resume continuity |
| `chatgpt/trade-nav-save-continuity` | 5 | 3041 | 5 | 3 | runtime | 2026-06-27 | REVIEW_PORT | Add trade navigation save continuity probe |
| `advisor/nav-save-resume-continuity` | 3 | 3042 | 3 | 2 | runtime | 2026-06-27 | REVIEW_PORT | Guard saved nav resume continuity |
| `codex/mission-cargo-loading-probe-v2-20260627` | 2 | 3046 | 2 | 2 | runtime | 2026-06-27 | REVIEW_ADAPT | Wire mission cargo-loading runtime check |
| `codex/mission-cargo-loop-cues-20260627-v2` | 1 | 3046 | 2 | 2 | runtime | 2026-06-27 | REVIEW_PORT | Clarify cargo mission loop preflight cues |
| `sf-station-pad-tabs` | 3 | 3049 | 3 | 3 | runtime | 2026-06-27 | REVIEW_PORT | Guard station controller tab parity |
| `codex/mission-cargo-loading-probe-20260627` | 2 | 3049 | 2 | 2 | runtime | 2026-06-27 | REVIEW_ADAPT | Wire mission cargo-loading runtime check |
| `codex/mission-cargo-loop-cues-20260627` | 2 | 3049 | 2 | 2 | runtime | 2026-06-27 | REVIEW_PORT | Cover cargo mission loop preflight cues |
| `mission-log-route-runtime` | 2 | 3051 | 2 | 1 | runtime | 2026-06-27 | REVIEW_PORT | Wire mission log route runtime check |
| `codex/mission-market-handoff-runtime-20260627` | 1 | 3050 | 1 | 0 | validation | 2026-06-27 | REVIEW_ADAPT | Add mission-market handoff runtime probe |
| `advisor/title-continue-standalone` | 1 | 3050 | 1 | 1 | validation | 2026-06-27 | REVIEW_PORT | Add standalone title Continue runtime check |
| `codex/mission-market-handoff-probe-20260627` | 2 | 3051 | 0 | 0 | empty | 2026-06-27 | REVIEW_ADAPT | Remove write probe scratch file |
| `advisor/title-continue-trust` | 2 | 3051 | 2 | 2 | runtime | 2026-06-27 | REVIEW_PORT | Wire title Continue runtime check |
| `station-commerce-input-parity` | 3 | 3052 | 3 | 3 | runtime | 2026-06-27 | REVIEW_PORT | Guard station commerce input parity |
| `advisor/title-continue-check` | 2 | 3052 | 2 | 2 | runtime | 2026-06-27 | REVIEW_ADAPT | Wire title Continue runtime check |
| `advisor/title-continue-qa` | 2 | 3055 | 2 | 2 | runtime | 2026-06-27 | REVIEW_PORT | Wire title Continue runtime check |
| `advisor/settings-profile-persistence-v2` | 2 | 3056 | 2 | 0 | runtime | 2026-06-27 | REVIEW_PORT | Add settings profile persistence check |
| `advisor/settings-profile-persistence` | 5 | 3058 | 4 | 2 | runtime | 2026-06-27 | REVIEW_PORT | Wire settings profile check into package scripts |
| `advisor/market-first-loop-runtime` | 2 | 3057 | 1 | 1 | validation | 2026-06-27 | REVIEW_PORT | Fix market runtime seeded station argument |
| `advisor/settings-prefs-trust` | 3 | 3059 | 3 | 1 | runtime | 2026-06-27 | REVIEW_PORT | Check settings preference persistence |
| `advisor/mission-consequence-clarity` | 2 | 3060 | 2 | 2 | runtime | 2026-06-27 | REVIEW_PORT | Check mission consequence clarity |
| `codex/station-egress-runtime-check` | 1 | 3062 | 1 | 1 | validation | 2026-06-27 | REVIEW_ADAPT | Add station egress runtime check |
| `codex/probe-first-session-route-v2` | 1 | 3063 | 1 | 0 | validation | 2026-06-27 | REVIEW_ADAPT | Add first-session route runtime probe |
| `codex/probe-first-session-route` | 2 | 3065 | 1 | 0 | validation | 2026-06-27 | REVIEW_ADAPT | Align first-session probe with current rail copy |
| `codex/newgame-first-run-rail-v2` | 2 | 3069 | 2 | 2 | runtime | 2026-06-27 | REVIEW_PORT | Add check for New Game first-run route |
| `codex/newgame-first-run-rail` | 2 | 3070 | 2 | 2 | runtime | 2026-06-27 | REVIEW_PORT | Add check for New Game first-run route |
| `codex/gamepad-mining-l2` | 4 | 3072 | 4 | 4 | runtime | 2026-06-27 | REVIEW_PORT | Extend input modality check for gamepad mining |
| `codex/save-resume-confidence-current-20260627` | 2 | 3073 | 2 | 2 | runtime | 2026-06-27 | REVIEW_PORT | Add save resume confidence check |
| `codex/save-resume-confidence-20260627` | 3 | 3075 | 3 | 3 | runtime | 2026-06-27 | REVIEW_PORT | Add save resume confidence check script |
| `advisor/launch-asset-parity` | 6 | 3107 | 5 | 5 | runtime | 2026-06-27 | REVIEW_PORT | Restore bundle failure log punctuation |
| `codex/authored-hull-glbs-20260621` | 8 | 3116 | 7 | 0 | runtime | 2026-06-21 | REVIEW_PORT | ci: restage hull generator chunk 4 |
| `sg-02-rapier-dynamic-authority` | 4 | 3198 | 4 | 0 | runtime | 2026-06-21 | REVIEW_PORT | chore: add one-shot SG-02 payload recovery artifact |
| `sg05-scenario-runtime` | 7 | 3198 | 7 | 0 | runtime | 2026-06-21 | REVIEW_PORT | SG-05: add complete Shipment 47-A scenario fixture |
| `feat/authored-asset-pipeline` | 1 | 3205 | 1 | 1 | runtime | 2026-06-20 | REVIEW_PORT | Integrate authored ship-part boundary |
| `art/kestrel-hero-graphics-standard` | 11 | 3241 | 11 | 0 | runtime | 2026-06-19 | REVIEW_ADAPT | chore(art): stage graphics standard payload 10/13 |

## Already contained refs

- `advisor/gamepad-active-modal-focus` — branch tip is an ancestor of current master
- `advisor/new-game-mining-label-current` — branch tip is an ancestor of current master
- `advisor/outfitting-mission-fit-guidance` — branch tip is an ancestor of current master
- `advisor/save-load-latest-playtime` — branch tip is an ancestor of current master
- `advisor/services-cost-trust` — branch tip is an ancestor of current master
- `advisor/station-gamepad-tabs-f3f2459` — branch tip is an ancestor of current master
- `agent/chatgpt-gold-corridor-missions-20260723` — every path changed by the branch already has the same final blob/deletion in current master
- `agent/chatgpt-performance-attribution-20260723` — every path changed by the branch already has the same final blob/deletion in current master
- `agent/chatgpt-pq018-readiness-20260723` — every path changed by the branch already has the same final blob/deletion in current master
- `agent/chatgpt-pq019-architecture-20260723` — every path changed by the branch already has the same final blob/deletion in current master
- `agent/chatgpt-pq020-topology-20260723` — every path changed by the branch already has the same final blob/deletion in current master
- `agent/chatgpt-pq021-ledger-20260723` — every path changed by the branch already has the same final blob/deletion in current master
- `agent/chatgpt-pq024-asteroid-ops-20260723` — every path changed by the branch already has the same final blob/deletion in current master
- `agent/chatgpt-pq025-acceptance-20260723` — every path changed by the branch already has the same final blob/deletion in current master
- `agent/player-ship-2x-quality-program` — branch tip is an ancestor of current master
- `backup/local-master-premerge-20260818` — branch tip is an ancestor of current master
- `claude/frontend-direction-20260814` — branch tip is an ancestor of current master
- `claude/inference-director-20260811` — branch tip is an ancestor of current master
- `claude/perf-admission-20260726` — branch tip is an ancestor of current master
- `claude/reconcile-all-20260727` — branch tip is an ancestor of current master
- `claude/session-20260725` — branch tip is an ancestor of current master
- `codex/delegation-base-20260723` — branch tip is an ancestor of current master
- `codex/newgame-first-run-rail-v3` — branch tip is an ancestor of current master
- `codex/perf-01a-background-lifecycle` — branch tip is an ancestor of current master
- `codex/station-ui-overhaul-v3-20260812` — branch tip is an ancestor of current master
- `commission/headless-sim-core` — branch tip is an ancestor of current master
- `commission/sg-08-presentation-orchestration` — every path changed by the branch already has the same final blob/deletion in current master
- `fable/redock-dedupe` — every path changed by the branch already has the same final blob/deletion in current master
- `fable/u09-survivor` — every path changed by the branch already has the same final blob/deletion in current master
- `feat/arcade-vfx-vertical-slice` — branch tip is an ancestor of current master
- `feat/deterministic-sector-field` — branch tip is an ancestor of current master
- `feat/leftover-work-fleet` — branch tip is an ancestor of current master
- `feature/flight-v3-professionalization-package` — branch tip is an ancestor of current master
- `land/stale-shared-tree` — branch tip is an ancestor of current master
- `manufacturing-next-step-current` — branch tip is an ancestor of current master
- `perf/smoothness-2x4x` — branch tip is an ancestor of current master
- `polish/main-menu-escape-guard` — branch tip is an ancestor of current master
- `sg-06-complete` — branch tip is an ancestor of current master
- `sg-06-layered-tactical-ai` — branch tip is an ancestor of current master
- `ship-parts-library-integration` — branch tip is an ancestor of current master

## Duplicate branch deltas

- `e364cdafae0f`: `chatgpt/pause-flight-brief-current`, `chatgpt/pause-flight-brief`
- `cf255605bf8d`: `advisor/nav-save-resume-continuity-6040ce`, `advisor/nav-save-resume-continuity`
- `6137ebfaefc7`: `codex/mission-cargo-loop-cues-20260627-v2`, `codex/mission-cargo-loop-cues-20260627`
- `a5df10a78a0a`: `codex/probe-first-session-route-v2`, `codex/probe-first-session-route`
- `28f8ba9bbfd6`: `codex/newgame-first-run-rail-v2`, `codex/newgame-first-run-rail`

Machine-readable path/blob evidence and bounded commit manifests are in `inventory.json` and `candidates.json`.
