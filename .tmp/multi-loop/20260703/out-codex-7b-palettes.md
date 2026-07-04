Reading additional input from stdin...
OpenAI Codex v0.130.0-alpha.5
--------
workdir: C:\Users\93rob\Documents\GitHub\SpaceFace
model: gpt-5.5
provider: openai
approval: never
sandbox: danger-full-access
reasoning effort: xhigh
reasoning summaries: none
session id: 019f2abe-c910-7e61-8fd6-717bf9da4f59
--------
user
# TASK: Data-driven sector palettes (SpaceFace WS-E2) — WAVE 2 (graphics lane — check AGENTS.md ownership signals first)

You are Codex in the SpaceFace repo. Read `design/GDD_2_0.md` §9.2 and AGENTS.md "Concurrent Graphics
Work" (if a graphics lock/lane is active, STOP and report). Study `src/render/renderer.js` (lighting rig:
ambient/key/rim/fill + fog), `src/render/starfield.js` (nebula tint param exists), `src/data/sectors.js`.

## Build exactly this
1. In `src/data/sectors.js`: add a `palette` block per sector. Author FOUR palette classes and assign by
   sector flavor: `core` (clean cyan/steel), `belt` (rust/amber haze), `fringe` (sodium-red murk),
   `anomaly` (violet/green wrongness). Shape:
   `palette: { key: 0x______, rim: 0x______, fill: 0x______, ambient: 0x______, fog: 0x______, fogDensity: n, nebulaTint: 0x______, dust: 0x______ }`
   Derive all values from the CURRENT hardcoded rig (renderer.js) as the `core` baseline so core sectors
   look unchanged. Keep ambient luminance within ±20% of baseline across classes (readability floor).
2. In `src/render/renderer.js`: on `jump:arrive` / sector load, lerp the light colors/intensities + fog
   to the sector palette over 1.5 s (no pop). Starfield nebula regenerates with `nebulaTint` only when the
   sector's tint actually differs (it's a canvas rebake — never per-frame).
3. Dust/`dust` color: export the value on `state.render.sectorPalette` for future parallax layers; no
   consumer yet.
4. `scripts/check-sector-palettes.mjs`: validates every sector has a complete palette block, all four
   classes are used at least once, and luminance bounds hold (compute relative luminance of ambient+fill).

## Constraints
- Files: `src/data/sectors.js`, `src/render/renderer.js`, `src/render/starfield.js` (tint plumb only),
  new check script, package.json (one line).
- No new deps. No per-frame allocations (lerp via preallocated Color scratch). Respect existing
  `check:art` and `npm run check:non-graphics`. Screenshots: if you can run the dev server headless
  probes (scripts/probe-*.mjs pattern), capture before/after per class into .devshots/ — optional.

## Verify
```
node scripts/check-sector-palettes.mjs && node scripts/check-data.mjs && npm run check:non-graphics
```
Write the files. 10-line summary max. ADDENDUM FROM LEAD: the release.__lock/release.__building dirs were a stale crashed asset-build lock from 2026-06-26 (owner PID dead) and have been cleared by the lead — the graphics lane is yours. The dirty working tree is the in-progress 2.0 refactor described in design/BUILD_PLAN_2_0.md; do not revert or clean anything, just add your changes.
2026-07-04T01:29:34.795236Z ERROR rmcp::transport::worker: worker quit with fatal: Transport channel closed, when AuthRequired(AuthRequiredError { www_authenticate_header: "Bearer realm=\"OAuth\", resource_metadata=\"https://mcp.notion.com/.well-known/oauth-protected-resource/mcp\", error=\"invalid_token\", error_description=\"Missing or invalid access token\"" })
2026-07-04T01:29:34.973797Z ERROR rmcp::transport::worker: worker quit with fatal: Transport channel closed, when AuthRequired(AuthRequiredError { www_authenticate_header: "Bearer resource_metadata=\"https://mcp.figma.com/.well-known/oauth-protected-resource\",scope=\"mcp:connect\",authorization_uri=\"https://api.figma.com/.well-known/oauth-authorization-server\"" })
2026-07-04T01:29:35.543981Z ERROR codex_memories_write::phase2::job: failed to claim job: error returned from database: (code: 1) no such table: jobs
codex
I’ll first verify the current SpaceFace ownership signals and skim the relevant live docs so the patch lines up with the 2.0 plan instead of guessing from memory. After that I’ll keep the edits tightly inside the requested files.
exec
"C:\\Users\\93rob\\AppData\\Local\\Microsoft\\WindowsApps\\pwsh.exe" -Command "rg -n \"SpaceFace|sector|palette|check:flight:clean|check:non-graphics\" C:\\Users\\93rob\\.codex\\memories\\MEMORY.md" in C:\Users\93rob\Documents\GitHub\SpaceFace
exec
"C:\\Users\\93rob\\AppData\\Local\\Microsoft\\WindowsApps\\pwsh.exe" -Command 'git status --short' in C:\Users\93rob\Documents\GitHub\SpaceFace
exec
"C:\\Users\\93rob\\AppData\\Local\\Microsoft\\WindowsApps\\pwsh.exe" -Command '$paths = @('"'assets/ships/release.__lock','assets/ships/release.__building'); foreach ("'$p in $paths) { if (Test-Path $p) { Write-Output "PRESENT $p"; Get-ChildItem -LiteralPath $p -Force | Select-Object -First 20 FullName,Length,LastWriteTime | Format-List } else { Write-Output "ABSENT $p" } }' in C:\Users\93rob\Documents\GitHub\SpaceFace
 succeeded in 7511ms:
526:# Task Group: SpaceFace mission-intro stabilization, landing pivots, and PR closeout
527:scope: Use for `C:\Users\93rob\Documents\GitHub\SpaceFace` wrap-up or stabilization runs where the user changes from open-ended autonomy to "take it in for a landing", wants the already-started fix finished without breaking the game, and needs branch/PR closeout with honest gate handling.
528:applies_to: cwd=C:\Users\93rob\Documents\GitHub\SpaceFace; reuse_rule=reuse for landing-phase stabilization, mission-intro debugging, and PR closeout in this checkout; re-check current branch state, mission scripts, and whether the graphics/art lane is intentionally locked before reusing the same gates or merge expectations.
534:- rollout_summaries/2026-06-27T08-33-40-k4Ad-spaceface_merged_pr87_story_intro_landing.md (cwd=C:\Users\93rob\Documents\GitHub\SpaceFace, rollout_path=C:\Users\93rob\.codex\sessions\2026\06\27\rollout-2026-06-27T04-33-42-019f0836-8c2b-7e23-9fcd-cfb2515025f5.jsonl, updated_at=2026-06-29T05:32:16+00:00, thread_id=019f0836-8c2b-7e23-9fcd-cfb2515025f5, merged PR #87 after tightening canonical Beat 4 intro gating and refreshing stale cached boards)
538:- SpaceFace, PR #87, Beat 4, story intro, mission standing ladder, missionPreflight, missions.js, check-mission-standing-ladder.mjs, npm run check:non-graphics, gh pr merge, advisor-artifacts
548:- `npm run check:non-graphics` is the right stabilization gate here when the graphics/art lane is intentionally locked. [Task 1]
655:# Task Group: SpaceFace dirty-tree review, perf-probe repair, gate hardening, and review-first boundaries
656:scope: Use for `SpaceFace` review requests where the repo has a dirty tree and the user wants the uncommitted change set inspected rigorously, with findings-first behavior, narrow follow-on fixes when requested, and the right repo gates treated as the confidence surface.
657:applies_to: cwd=C:\Users\93rob\Documents\GitHub\SpaceFace; reuse_rule=reuse for dirty-tree review, focused UI/perf repair, cross-cutting UI/render/gameplay validation, and review-vs-fix boundary decisions in this checkout; re-check the current dirty tree and gate scripts before assuming the same file set or pass surface.
663:- rollout_summaries/2026-06-27T04-45-37-wpld-spaceface_dirty_tree_review_then_perf_probe_fix.md (cwd=C:\Users\93rob\Documents\GitHub\SpaceFace, rollout_path=C:\Users\93rob\.codex\sessions\2026\06\27\rollout-2026-06-27T00-45-42-019f0765-c41c-7b50-9605-e1ec9d3b56a7.jsonl, updated_at=2026-06-27T04:49:01+00:00, thread_id=019f0765-c41c-7b50-9605-e1ec9d3b56a7, narrowed the dirty tree to four unstaged files and surfaced the single actionable perf-probe finding)
664:- rollout_summaries/2026-06-22T07-30-16-qdoa-spaceface_dirty_tree_review_and_gate_hardening.md (cwd=C:\Users\93rob\Documents\GitHub\SpaceFace, rollout_path=C:\Users\93rob\.codex\sessions\2026\06\22\rollout-2026-06-22T03-30-19-019eee3c-b5b6-7a63-9551-f235b6af6b2e.jsonl, updated_at=2026-06-22T08:47:10+00:00, thread_id=019eee3c-b5b6-7a63-9551-f235b6af6b2e, inventoried modified plus untracked files and treated the whole worktree as review scope)
674:- rollout_summaries/2026-06-27T04-45-37-wpld-spaceface_dirty_tree_review_then_perf_probe_fix.md (cwd=C:\Users\93rob\Documents\GitHub\SpaceFace, rollout_path=C:\Users\93rob\.codex\sessions\2026\06\27\rollout-2026-06-27T00-45-42-019f0765-c41c-7b50-9605-e1ec9d3b56a7.jsonl, updated_at=2026-06-27T04:49:01+00:00, thread_id=019f0765-c41c-7b50-9605-e1ec9d3b56a7, restored live Blender/export process hints as an active ownership signal in the perf probe)
684:- rollout_summaries/2026-06-22T07-30-16-qdoa-spaceface_dirty_tree_review_and_gate_hardening.md (cwd=C:\Users\93rob\Documents\GitHub\SpaceFace, rollout_path=C:\Users\93rob\.codex\sessions\2026\06\22\rollout-2026-06-22T03-30-19-019eee3c-b5b6-7a63-9551-f235b6af6b2e.jsonl, updated_at=2026-06-22T08:47:10+00:00, thread_id=019eee3c-b5b6-7a63-9551-f235b6af6b2e, mapped the touched UI/render files to the scripts and runtime contracts that actually exercise them)
694:- rollout_summaries/2026-06-27T04-45-37-wpld-spaceface_dirty_tree_review_then_perf_probe_fix.md (cwd=C:\Users\93rob\Documents\GitHub\SpaceFace, rollout_path=C:\Users\93rob\.codex\sessions\2026\06\27\rollout-2026-06-27T00-45-42-019f0765-c41c-7b50-9605-e1ec9d3b56a7.jsonl, updated_at=2026-06-27T04:49:01+00:00, thread_id=019f0765-c41c-7b50-9605-e1ec9d3b56a7, closed the narrow perf-probe repair with `node --check`, `node scripts/check-ui-frame-sleep.mjs`, and `npm run check:ui:perf`)
695:- rollout_summaries/2026-06-22T07-30-16-qdoa-spaceface_dirty_tree_review_and_gate_hardening.md (cwd=C:\Users\93rob\Documents\GitHub\SpaceFace, rollout_path=C:\Users\93rob\.codex\sessions\2026\06\22\rollout-2026-06-22T03-30-19-019eee3c-b5b6-7a63-9551-f235b6af6b2e.jsonl, updated_at=2026-06-22T08:47:10+00:00, thread_id=019eee3c-b5b6-7a63-9551-f235b6af6b2e, fixed real runtime/asset issues and closed with `npm run check` plus `git diff --check`)
699:- npm run check:ui:perf, node --check, check-ui-frame-sleep.mjs, check:radar:perf, npm run check, git diff --check, check:flight:clean, check-47a-live-cold-open, GPU stall due to ReadPixels
714:- `npm run check` is the durable high-confidence gate for broader cross-cutting `SpaceFace` changes, and `git diff --check` is still worth running at the end even when it only reports CRLF warnings. [Task 4]
840:# Task Group: SpaceFace performance hardening and visual probe verification
841:scope: Use for `C:\Users\93rob\Documents\GitHub\SpaceFace` perf passes where the user wants real optimization without reducing visible quality, parallel subsystem investigation when justified, and proof that browser visual verification still works after render-path changes.
842:applies_to: cwd=C:\Users\93rob\Documents\GitHub\SpaceFace; reuse_rule=reuse for performance optimization, flight visual-proof fixes, and repo-wide post-perf validation in this checkout; re-check current browser probe scripts and perf artifact schema before reusing exact thresholds or file names.
848:- rollout_summaries/2026-06-24T21-50-11-oe73-spaceface_performance_hardening_and_visual_probe_fix.md (cwd=C:\Users\93rob\Documents\GitHub\SpaceFace, rollout_path=C:\Users\93rob\.codex\sessions\2026\06\24\rollout-2026-06-24T17-50-15-019efb9c-b3c8-7ba1-8bd7-ebcf1e4a0d4d.jsonl, updated_at=2026-06-25T06:56:19+00:00, thread_id=019efb9c-b3c8-7ba1-8bd7-ebcf1e4a0d4d, fixed the key perf/proof landmine by moving the visual probe off preserved backbuffer assumptions)
852:- SpaceFace, performance, preserveDrawingBuffer:false, probe-flight-visual.mjs, pngjs, screenshotCanvas, readPixels, GPU stall due to ReadPixels, check:flight:clean, #gl-canvas, no-value-loss
858:- rollout_summaries/2026-06-24T21-50-11-oe73-spaceface_performance_hardening_and_visual_probe_fix.md (cwd=C:\Users\93rob\Documents\GitHub\SpaceFace, rollout_path=C:\Users\93rob\.codex\sessions\2026\06\24\rollout-2026-06-24T17-50-15-019efb9c-b3c8-7ba1-8bd7-ebcf1e4a0d4d.jsonl, updated_at=2026-06-25T06:56:19+00:00, thread_id=019efb9c-b3c8-7ba1-8bd7-ebcf1e4a0d4d, ended with repo-wide checks and careful reporting of required-budget pass versus stretch-target miss)
862:- npm run check, npm run check:art, npm run check:bundle, check-sectorSim.mjs, .devshots/perf/performance-profile.json, summary.pass, raf.frame.p95.floor, raf.frame.p95.target, render.calls.peak, phase.render.p95
874:- `npm run check:flight:clean` is the focused gate for this change family because it exercises both generated flight checks and the desktop/mobile browser proof; `npm run check` is the durable repo-wide closing gate after the narrower probes are green. [Task 1][Task 2]
884:# Task Group: SpaceFace Figma-first UI design workflow and autonomy boundary
885:scope: Use for `C:\Users\93rob\Documents\GitHub\SpaceFace` UI-design workflow questions where the user wants to know whether Figma helps materially, what can be generated there autonomously, and where the boundary sits between visual spec work and repo/browser verification.
886:applies_to: cwd=C:\Users\93rob\Documents\GitHub\SpaceFace; reuse_rule=reuse for SpaceFace design-tooling clarification and UI-spec planning in this checkout; keep runtime/perf/launcher claims anchored to the repo/browser path rather than treating Figma as proof.
888:## Task 1: explain how Figma helps SpaceFace design work, success
892:- rollout_summaries/2026-06-27T04-50-14-W4Sv-spaceface_figma_ui_design_autonomy_clarification.md (cwd=C:\Users\93rob\Documents\GitHub\SpaceFace, rollout_path=C:\Users\93rob\.codex\sessions\2026\06\27\rollout-2026-06-27T00-50-20-019f0769-fd7d-7351-904e-5c588b19d743.jsonl, updated_at=2026-06-27T04:53:01+00:00, thread_id=019f0769-fd7d-7351-904e-5c588b19d743, grounded Figma's value in SpaceFace-specific screens and the repo's proof culture)
896:- SpaceFace, Figma, design planning and comparison surface, HUD, market, shipyard, mission log, pause/settings, browser/Electron proof, npm run check
902:- rollout_summaries/2026-06-27T04-50-14-W4Sv-spaceface_figma_ui_design_autonomy_clarification.md (cwd=C:\Users\93rob\Documents\GitHub\SpaceFace, rollout_path=C:\Users\93rob\.codex\sessions\2026\06\27\rollout-2026-06-27T00-50-20-019f0769-fd7d-7351-904e-5c588b19d743.jsonl, updated_at=2026-06-27T04:53:01+00:00, thread_id=019f0769-fd7d-7351-904e-5c588b19d743, made the design-generation boundary explicit with a capture -> Figma -> code -> verification loop)
915:- For SpaceFace, Figma is best treated as a design planning/comparison surface or visual-spec workbench, not as a runtime/gameplay verification tool. [Task 1]
917:- The plugin can autonomously create Figma-side artifacts such as HUD mockups, menu screens, modal layouts, button/input/table components, visual states, and a reusable SpaceFace UI kit. [Task 2]
922:- symptom: a tooling answer drifts into generic design-tool praise. cause: the answer is not anchored to the repo's actual UI surfaces and verification culture. fix: frame the answer around SpaceFace screens and the existing browser/Electron proof path. [Task 1]
1068:scope: Use for `Vamp` backend-port requests where the user wants the Godot repo, not `SpaceFace`, treated as the active workspace; wants strict frontend/backend separation, deterministic sim rules, and enough verified backend coverage to hand off cleanly to a frontend/UI agent.
1071:## Task 1: correct the workspace and confirm `SpaceFace` was untouched, success
1075:- rollout_summaries/2026-06-22T04-39-02-kxcW-vamp_godot_deterministic_vertical_slice_handoff.md (cwd=C:\Users\93rob\Documents\GitHub\SpaceFace, rollout_path=C:\Users\93rob\.codex\sessions\2026\06\22\rollout-2026-06-22T00-39-07-019eed9f-f042-78e2-a813-93accadc8c66.jsonl, updated_at=2026-06-22T05:11:45+00:00, thread_id=019eed9f-f042-78e2-a813-93accadc8c66, corrected the initial repo mix-up and proved the SpaceFace tree was only pre-existing dirty work)
1079:- Vamp, SpaceFace, wrong repo, proper workspace, git status --branch --short, git diff --stat, project.godot, legacy/js, read-only verification
1085:- rollout_summaries/2026-06-22T04-39-02-kxcW-vamp_godot_deterministic_vertical_slice_handoff.md (cwd=C:\Users\93rob\Documents\GitHub\SpaceFace, rollout_path=C:\Users\93rob\.codex\sessions\2026\06\22\rollout-2026-06-22T00-39-07-019eed9f-f042-78e2-a813-93accadc8c66.jsonl, updated_at=2026-06-22T05:11:45+00:00, thread_id=019eed9f-f042-78e2-a813-93accadc8c66, rebuilt the deterministic sim slice and verified boot/move/feed/fight/heat/escape with GUT)
1105:- rollout_summaries/2026-06-22T04-39-02-kxcW-vamp_godot_deterministic_vertical_slice_handoff.md (cwd=C:\Users\93rob\Documents\GitHub\SpaceFace, rollout_path=C:\Users\93rob\.codex\sessions\2026\06\22\rollout-2026-06-22T00-39-07-019eed9f-f042-78e2-a813-93accadc8c66.jsonl, updated_at=2026-06-22T05:11:45+00:00, thread_id=019eed9f-f042-78e2-a813-93accadc8c66, packaged the verified context into a pasteable handoff with the goal and proper repo path)
1113:- when the user corrects `this wasn't SpaceFace, it was supposed to be the Vamp repo`, treat repo/workspace corrections as hard stops and verify the active project before editing. [Task 1]
1122:- `SpaceFace` had unrelated pre-existing dirty UI/story changes during the first run, but that session did not write there; the substantive work belonged in `C:\Users\93rob\Documents\GitHub\Vamp`. [Task 1]
1138:# Task Group: SpaceFace goal prompt, SG-04 release asset pipeline, and live browser QA
1139:scope: Use for `SpaceFace` work where the user wants a persistent long-running goal framed from `MASTER_MAKEOVER_PLAN.md`, or wants the SG-04 release asset path implemented and proved with both repo gates and live browser evidence.
1140:applies_to: cwd=C:\Users\93rob\Documents\GitHub\SpaceFace; reuse_rule=reuse for spec-driven planning, release-asset pipeline work, and release-mode live QA in this checkout; re-check the current spec, branch state, and local browser/server path before reusing exact commit or asset details.
1146:- rollout_summaries/2026-06-21T03-24-16-qNDg-spaceface_goal_prompt_plus_release_asset_pipeline_live_brows.md (cwd=C:\Users\93rob\Documents\GitHub\SpaceFace, rollout_path=C:\Users\93rob\.codex\sessions\2026\06\20\rollout-2026-06-20T23-24-21-019ee835-1fda-7713-86cb-d0f911fed7b6.jsonl, updated_at=2026-06-22T00:36:36+00:00, thread_id=019ee835-1fda-7713-86cb-d0f911fed7b6, produced the accepted persistent goal prompt and trimmed it below the hard length cap)
1150:- SpaceFace, MASTER_MAKEOVER_PLAN.md, 47-A, resident technical director, integrator, final quality gate, goal prompt, 2500 chars, 2473
1156:- rollout_summaries/2026-06-21T03-24-16-qNDg-spaceface_goal_prompt_plus_release_asset_pipeline_live_brows.md (cwd=C:\Users\93rob\Documents\GitHub\SpaceFace, rollout_path=C:\Users\93rob\.codex\sessions\2026\06\20\rollout-2026-06-20T23-24-21-019ee835-1fda-7713-86cb-d0f911fed7b6.jsonl, updated_at=2026-06-22T00:36:36+00:00, thread_id=019ee835-1fda-7713-86cb-d0f911fed7b6, added the deterministic release asset builder/validator and proved the path with browser interaction plus asset fetch evidence)
1254:- skill dedupe, .codex\skills, .agents\skills, plugin-cache, hatch-pet, find-skills, React Native, TheRxSpot.com, Gloorbot, n8n, SpaceFace, Juiceage, exact duplicates
1277:- `SpaceFace` had a broad 19-skill game shelf that looked generic enough to promote or rewrite globally if the user wants a smaller shared pool, while plugin-cache duplicates were mostly provider/version cache pairs that should be managed by plugin selection rather than hand-deleting cache internals. [Task 1][Task 2]
1287:# Task Group: SpaceFace git/worktree cleanup and merge hygiene
1288:scope: Use for `SpaceFace` branch/worktree cleanup requests where the user suspects an agent-created worktree or merge target exists, wants the repo reconciled onto its real primary branch, and wants remote state plus repo verification checked before closeout.
1289:applies_to: cwd=C:\Users\93rob\Documents\GitHub\SpaceFace; reuse_rule=reuse for worktree audits, merge-state verification, and local-vs-remote push checks in this checkout; re-check current branch topology, `.git/worktrees`, and `npm run check` behavior before assuming the same no-op result still applies.
1295:- rollout_summaries/2026-06-21T00-04-48-kT7v-spaceface_master_noop_worktree_merge_and_push_check.md (cwd=C:\Users\93rob\Documents\GitHub\SpaceFace, rollout_path=C:\Users\93rob\.codex\sessions\2026\06\20\rollout-2026-06-20T20-04-53-019ee77e-8289-7ef1-8f2d-8c2bfdf3090d.jsonl, updated_at=2026-06-21T00:07:55+00:00, thread_id=019ee77e-8289-7ef1-8f2d-8c2bfdf3090d, verified there was no extra registered worktree and the suspected branch was already merged into `master`)
1299:- SpaceFace, git worktree, master, origin/master, feat/offscreen-sector-sim, git worktree list --porcelain, git merge-base --is-ancestor, Already up to date, .git/worktrees
1305:- rollout_summaries/2026-06-21T00-04-48-kT7v-spaceface_master_noop_worktree_merge_and_push_check.md (cwd=C:\Users\93rob\Documents\GitHub\SpaceFace, rollout_path=C:\Users\93rob\.codex\sessions\2026\06\20\rollout-2026-06-20T20-04-53-019ee77e-8289-7ef1-8f2d-8c2bfdf3090d.jsonl, updated_at=2026-06-21T00:07:55+00:00, thread_id=019ee77e-8289-7ef1-8f2d-8c2bfdf3090d, fetched, compared `HEAD` to `"@{u}"`, and confirmed `git push origin master` was a no-op)
1315:- rollout_summaries/2026-06-21T00-04-48-kT7v-spaceface_master_noop_worktree_merge_and_push_check.md (cwd=C:\Users\93rob\Documents\GitHub\SpaceFace, rollout_path=C:\Users\93rob\.codex\sessions\2026\06\20\rollout-2026-06-20T20-04-53-019ee77e-8289-7ef1-8f2d-8c2bfdf3090d.jsonl, updated_at=2026-06-21T00:07:55+00:00, thread_id=019ee77e-8289-7ef1-8f2d-8c2bfdf3090d, used `npm run check` as the final gate after confirming the merge/push work was a no-op)
1319:- npm run check, THREE.WARNING, Multiple instances of Three.js being imported, 58 ok, 0 fail, Offscreen sector-sim checks OK
1330:- The primary branch was `master`, `origin/master` matched it after fetch, and `feat/offscreen-sector-sim` was already an ancestor of `master`, so `git merge feat/offscreen-sector-sim` correctly returned `Already up to date.` [Task 1]
1333:- `npm run check` is still the meaningful verification gate after merge/worktree cleanup in `SpaceFace`, and repeated `THREE.WARNING: Multiple instances of Three.js being imported.` messages did not fail the run in this rollout. [Task 3]
1423:- GH001, large files detected, >100 MiB, Juiceage, git count-objects -vH, .gitignore, downloads/*.exe, node_modules, SpaceFace, nul, Windows reserved filename, a67948e, c05b0c3
1436:- The final verified root projects were `CheapSkater-`, `Chemitree`, `Flowtab.Pro`, `Gloorbot`, `Juiceage`, `Learning AI Landing Page`, `Leisure Lee Landing Page`, `lotus`, `n8n`, `Resume`, `SalesRepPortal-render`, `SpaceFace`, `SuperPaste`, `Telomere`, `TheRxSpot.com`, and `Vamp`. [Task 1]
1440:- `SpaceFace` had an untracked root `nul` path, which is invalid on Windows; ignoring `/nul` was the correct fix, and the cleanup landed in commit `a67948e`. [Task 3]
1583:# Task Group: SpaceFace launcher/menu lifecycle fixes and flight-controls follow-up
1584:scope: Use for `SpaceFace` launcher failures, unexpected returns to the main menu after gameplay starts, or follow-up work on flight-control/banking feel where the user wants conventional handling and less inertia.
1585:applies_to: cwd=C:\Users\93rob\Documents\GitHub\SpaceFace; reuse_rule=reuse for launcher/UI-lifecycle debugging and flight-controls follow-up in this checkout; re-check the current batch launcher, local Electron install state, `src/ui` lifecycle code, and flight-control pipeline before assuming the same exact symptoms.
1587:## Task 1: Fix `SpaceFace-Desktop.bat` crash and stop hidden menu/focus state from reappearing during gameplay, success
1591:- rollout_summaries/2026-06-18T03-46-13-4xo1-spaceface_launcher_menu_focus_fix_and_flight_physics_investi.md (cwd=\\?\C:\Users\93rob\Documents\GitHub\SpaceFace, rollout_path=C:\Users\93rob\.codex\sessions\2026\06\17\rollout-2026-06-17T23-46-18-019ed8d6-2575-7073-a225-aa366b83b8d5.jsonl, updated_at=2026-06-18T03:54:52+00:00, thread_id=019ed8d6-2575-7073-a225-aa366b83b8d5, verified launcher repair plus gameplay-state/focus regression fix with `npm run check` and a Playwright launch flow)
1595:- SpaceFace-Desktop.bat, cmd /c, electron, node_modules\.bin\electron.cmd, pushd "%~dp0", uiRoot, screenManager, cinematic splash, keydown dismiss, main menu, hidden focus, npm run check, Playwright
1601:- rollout_summaries/2026-06-18T03-46-13-4xo1-spaceface_launcher_menu_focus_fix_and_flight_physics_investi.md (cwd=\\?\C:\Users\93rob\Documents\GitHub\SpaceFace, rollout_path=C:\Users\93rob\.codex\sessions\2026\06\17\rollout-2026-06-17T23-46-18-019ed8d6-2575-7073-a225-aa366b83b8d5.jsonl, updated_at=2026-06-18T03:54:52+00:00, thread_id=019ed8d6-2575-7073-a225-aa366b83b8d5, user clarified the desired handling model but the rotation/physics fix was interrupted before code changes)
1605:- SpaceFace, flight physics, banking, turn inertia, overshoot, conventional aircraft-style bank, regular flight physics, angular damping, ship rotation, hard to pilot
1609:- when the user says the desktop launcher "only flashes open a terminal and crashes," reproduce the real launcher entrypoint first (`cmd /c SpaceFace-Desktop.bat`) and capture the actual crash text before editing. [Task 1]
1615:- `SpaceFace-Desktop.bat` needed to `pushd "%~dp0"` and check `node_modules\.bin\electron.cmd`, because the original launcher was sensitive to the caller's working directory and could miss a missing Electron install. [Task 1]
1628:# Task Group: SpaceFace, Vamp, and Chemitree multi-wave bug-fix orchestration
1630:applies_to: cwd=C:\Users\93rob\Documents\GitHub\SpaceFace plus sibling repos Vamp/Chemitree; reuse_rule=reuse for the three-game repair workflow and similar multi-repo game bugfix sweeps; re-check each repo's current dirty tree, probe scripts, and gate outputs before assuming commit handles or wave status still apply.
1632:## Task 1: SpaceFace multi-wave repair across gameplay, UI, save/load, crafting, combat, starmap, and HUD accessibility, partial
1636:- rollout_summaries/2026-06-17T19-50-35-xWKs-spaceface_vamp_chemitree_multiwave_bugfix_orchestration.md (cwd=\\?\C:\Users\93rob\Documents\Codex\2026-06-17\goal-i-have-3-game-folders, rollout_path=C:\Users\93rob\.codex\sessions\2026\06\17\rollout-2026-06-17T15-50-35-019ed722-af56-7dc2-b3f9-63379b7dff20.jsonl, updated_at=2026-06-18T00:45:34+00:00, thread_id=019ed722-af56-7dc2-b3f9-63379b7dff20, repeated-wave SpaceFace repair lane with validated atomic fix commits and stronger regression checks)
1640:- SpaceFace, multi-agent, subagent waves, atomic commits, npm run check, check-gameplay-core, check-ui-screen-imports, check-ui-a11y, crafting queues, starmap, HUD accessibility, 24454c5, 36d8dcd
1681:- In SpaceFace, `npm run check` became the durable regression gate after it was extended with `scripts/check-gameplay-core.mjs`, `scripts/check-ui-screen-imports.mjs`, and `scripts/check-ui-a11y.mjs`; those scripts caught save/load, crafting, combat, starmap/menu, and HUD/modal regressions that broader smoke passes missed. [Task 1]
1682:- The validated SpaceFace commit handles are strong retrieval anchors for later regression work: `24454c5`, `2bce292`, `226a47f`, `6563ee8`, `20d34ad`, and `36d8dcd`. [Task 1]
1696:# Task Group: SpaceFace repo-local skill curation beyond Three.js
1697:scope: Use for SpaceFace or similar game-repo skill-shelf requests where the user wants a small curated set of helpful repo-local skills and will push back if the selection overfocuses on the renderer stack.
1698:applies_to: cwd=C:\Users\93rob\Documents\GitHub\SpaceFace; reuse_rule=reuse for repo-local skill selection, source validation, and manifest/README updates in SpaceFace or similar game repos; re-check current gameplay scope and upstream skill sources before copying the same set wholesale.
1700:## Task 1: Add a first curated set of SpaceFace-relevant skills, partial
1704:- rollout_summaries/2026-06-17T23-35-13-qiTG-spaceface_skill_pack_broadened_beyond_threejs.md (cwd=\\?\C:\Users\93rob\Documents\Codex\2026-06-17\i-m-making-another-game-in, rollout_path=C:\Users\93rob\.codex\sessions\2026\06\17\rollout-2026-06-17T19-35-13-019ed7f0-5a74-71e0-a6d2-72e8e7208954.jsonl, updated_at=2026-06-17T23:44:24+00:00, thread_id=019ed7f0-5a74-71e0-a6d2-72e8e7208954, initial SpaceFace skill install that overfit on Three.js before the user corrected the framing)
1708:- SpaceFace, skills folder, Three.js, threejs-game-skills, skills/README.md, threejs-game-director, threejs-debug-profiler, SKILL.md, package.json, README.md
1710:## Task 2: Broaden the SpaceFace skill shelf beyond renderer-specific tools, success
1728:- SpaceFace is a Three.js/Electron game, but its repo scope is broader than rendering: economy, mining, combat, missions, factions, automation, progression, save/load, UI, audio, and packaging all show up in `README.md` and the repo structure. [Task 1][Task 2]
1731:- The final `SpaceFace/skills` shelf had 19 skill folders total, each with a `SKILL.md`, and `skills/README.md` documented why the repo is not “just Three.js” plus preserved upstream license/readme context. [Task 1][Task 2]

 succeeded in 4833ms:
 M AGENTS.md
 M ARCHITECTURE.md
 D assets/ships/release.__building/kestrel/kestrel_reference.glb
 D assets/ships/release.__building/parts/cockpits/cockpit_dome.glb
 D assets/ships/release.__building/parts/cockpits/cockpit_recessed.glb
 D assets/ships/release.__building/parts/cockpits/cockpit_slab.glb
 D assets/ships/release.__building/parts/engines/engine_industrial.glb
 D assets/ships/release.__building/parts/engines/engine_ion_small.glb
 D assets/ships/release.__building/parts/engines/engine_ion_twin.glb
 D assets/ships/release.__building/parts/engines/engine_resonator.glb
 D assets/ships/release.__building/parts/fins/fin_crystalline.glb
 D assets/ships/release.__building/parts/fins/fin_radiator_grid.glb
 D assets/ships/release.__building/parts/fins/fin_swept_smuggler.glb
 D assets/ships/release.__building/parts/fins/fin_wedge.glb
 D assets/ships/release.__building/parts/greebles/greeble_hatches.glb
 D assets/ships/release.__building/parts/greebles/greeble_vents.glb
 D assets/ships/release.__building/parts/hulls/hull_corvette.glb
 D assets/ships/release.__building/parts/hulls/hull_fighter.glb
 D assets/ships/release.__building/parts/hulls/hull_freighter.glb
 D assets/ships/release.__building/parts/hulls/hull_gunship.glb
 D assets/ships/release.__building/parts/hulls/hull_interceptor.glb
 D assets/ships/release.__building/parts/hulls/hull_miner.glb
 D assets/ships/release.__building/parts/hulls/hull_starter.glb
 D assets/ships/release.__building/parts/weapons/weapon_heavy_cannon.glb
 D assets/ships/release.__building/parts/weapons/weapon_lance.glb
 D assets/ships/release.__building/parts/weapons/weapon_pulse_cannon.glb
 D assets/ships/release.__building/parts/weapons/weapon_turret_dual.glb
 D assets/ships/release.__lock/owner.json
 M index.html
 M package.json
 M scripts/check-claim-base-input.mjs
 M src/combat/attachments.js
 M src/core/eventBus.js
 M src/core/gameState.js
 M src/core/registry.js
 M src/core/simSnapshot.js
 M src/data/combatDefs.js
 M src/data/commodities.js
 M src/data/sectors.js
 M src/main.js
 M src/render/partsLibrary.js
 M src/render/renderer.js
 M src/render/vfx.js
 M src/save/saveSystem.js
 M src/systems/input.js
 M src/systems/onboarding.js
 M src/systems/weapons.js
 M src/systems/world.js
 M src/ui/bindings.js
 M src/ui/comms.js
 M src/ui/confirm.js
 M src/ui/controlPrompts.js
 M src/ui/hud.js
 M src/ui/input.js
 M src/ui/radar.js
 M src/ui/screens/bar.js
 M src/ui/screens/localmap.js
 M src/ui/screens/settings.js
 M src/ui/screens/starmap.js
 M src/ui/uiRoot.js
 M styles/ui.css
?? .tmp/
?? advisor-artifacts/
?? design/BUILD_PLAN_2_0.md
?? design/GDD_2_0.md
?? scripts/check-hitch-budget.mjs
?? scripts/check-tether-gameplay.mjs
?? src/data/impulseCharges.js
?? src/render/precompile.js
?? src/systems/impulseCharges.js
?? src/systems/scanner.js
?? src/systems/tetherGameplay.js

exec
"C:\\Users\\93rob\\AppData\\Local\\Microsoft\\WindowsApps\\pwsh.exe" -Command 'if (Test-Path AGENTS.md) { Get-Content AGENTS.md -Raw }' in C:\Users\93rob\Documents\GitHub\SpaceFace
 succeeded in 3293ms:
ABSENT assets/ships/release.__lock
ABSENT assets/ships/release.__building

 succeeded in 3118ms:
# SpaceFace Agent Policy

## Read First — SPACEFACE 2.0
- `design/GDD_2_0.md` is the AUTHORITATIVE design document (vision, pillars, all system designs).
  Where it conflicts with older design docs (V2_MASTER_PLAN, HUD_REVAMP_DESIGN, IMPROVEMENT_IDEAS),
  the GDD wins. `ARCHITECTURE.md` remains the authoritative technical contract.
- `design/BUILD_PLAN_2_0.md` is the live execution plan: workstream status, file-ownership map for
  parallel agents, the LOCKED input contract (`state.input.actions.*`), and per-item acceptance
  criteria + verification commands. Claim the next unclaimed item there; update its status when done.
- HUD design rule (standing user preference): clean NON-diegetic HUD. No first-person/visor/cockpit
  motifs — no screen-edge arcs, no helmet avatars.

## One Game Path
- Browser play, Electron dev, Chrome probes, and packaged desktop builds must boot the same player-facing game route and entrypoint.
- Launcher differences may cover only shell concerns: window chrome, fixed local port, packaging, GPU process hints, and production debug stripping.
- A launcher must not change gameplay, assets, renderer features, UI availability, settings defaults, scenario defaults, or feature reachability.
- Normal play uses the release-authored runtime assets. Source assets are authoring/build inputs, not an alternate default game.
- Debug probes, screenshots, capture routes, and inspection globals are tooling. They must not be required to see normal game content.

## Wired Feature Policy
- Player-facing features, assets, settings, controls, missions, screens, and systems must be reachable in the default game or intentionally removed.
- Do not leave "sometimes wired" feature work behind. If it is not good enough for default play, improve it, delete it, or keep it only as a clearly named tool/test fixture.
- Browser and desktop manual testing should exercise the same assets and defaults. If a probe needs a special mode, it must prove instrumentation, not a different game.

## Concurrent Graphics Work
- Treat `assets/ships/release.__lock/`, `assets/ships/release.__building/`, running Blender/asset-export processes, and active graphics-agent edits as ownership signals.
- Do not edit, regenerate, delete, clean, format, revert, or stage `assets/**`, ship manifests, release outputs, or `src/render/**` while another graphics/asset lane is active unless the user explicitly redirects ownership.
- Performance work must not "fix" graphics conflicts by rolling assets back. If render or asset structure is the bottleneck during active graphics work, report the evidence and leave the graphics lane untouched.

## Performance Policy
- Do not solve performance by silently lowering visible quality, disabling authored assets, or making browser and desktop diverge.
- Measure before and after in Chrome/Electron-compatible runtime paths, and keep screenshots when render changes are involved.
- Prefer structural fixes: batching, instancing, cache reuse, allocation reduction, frame pacing, and avoiding duplicate system work.
- Authored model exports should merge static bolts, ribs, panels, and repeated detail into a small number of submeshes per material/animated role. Do not ship dozens of one-off primitives that turn into tiny runtime pools or per-ship draw calls.

## Verification
- Run `npm run check:launch-policy` after launcher, asset-mode, packaging, or debug-surface changes.
- Run `npm run check:flight:clean` for flight/render-loop work, then `npm run check:assets:live` and `npm run check:perf` before claiming a smoothness fix.
- Run `npm run check` before broad handoff when the change touches shared systems or launch policy.


codex
The lock directories are absent now, matching the lead addendum; I also see the expected dirty 2.0 refactor, including pre-existing edits in the target files. I’ll check for live asset/export processes too, then read the specific design and render surfaces before patching around the current worktree.
exec
"C:\\Users\\93rob\\AppData\\Local\\Microsoft\\WindowsApps\\pwsh.exe" -Command 'Get-Process | Where-Object { $_.ProcessName -match '"'blender|python|node|asset|export' } | Select-Object ProcessName,Id,Path | Format-Table -AutoSize" in C:\Users\93rob\Documents\GitHub\SpaceFace
exec
"C:\\Users\\93rob\\AppData\\Local\\Microsoft\\WindowsApps\\pwsh.exe" -Command "rg -n \"9\\.2|sector|palette|lighting|nebula|fog|Biome|Map\" design/GDD_2_0.md design/BUILD_PLAN_2_0.md" in C:\Users\93rob\Documents\GitHub\SpaceFace
 succeeded in 6297ms:

ProcessName    Id Path
-----------    -- ----
blender      2672 C:\Program Files\Blender Foundation\Blender 5.1\blender.exe
blender-mcp 33904 C:\Users\93rob\AppData\Roaming\Claude\Claude Extensions\ant.dir.gh.blender.blender-mcp\.venv\Scripts…
node         1100 C:\Program Files\nodejs\node.exe
node        11100 C:\Program Files\nodejs\node.exe
node        12028 C:\Program Files\nodejs\node.exe
node        16360 C:\Program Files\nodejs\node.exe
node        18200 C:\Program Files\nodejs\node.exe
node        18836 C:\Program Files\nodejs\node.exe
node        21792 C:\Program Files\nodejs\node.exe
node        22736 C:\Program Files\nodejs\node.exe
node        27264 C:\Program Files\nodejs\node.exe
node        27296 C:\Program Files\nodejs\node.exe
node        27480 C:\Program Files\nodejs\node.exe
node        28540 C:\Program Files\nodejs\node.exe
node        31836 C:\Program Files\nodejs\node.exe
node        33844 C:\Program Files\nodejs\node.exe
node        34972 C:\Program Files\nodejs\node.exe
node        36692 C:\Users\93rob\AppData\Local\OpenAI\Codex\runtimes\cua_node\1b23c930bdf84ed6\bin\node.exe
node        36996 C:\Program Files\nodejs\node.exe
node        37540 C:\Program Files\nodejs\node.exe
node_repl    2356 C:\Users\93rob\AppData\Local\OpenAI\Codex\runtimes\cua_node\1b23c930bdf84ed6\bin\node_repl.exe
node_repl    8904 C:\Users\93rob\AppData\Local\OpenAI\Codex\runtimes\cua_node\1b23c930bdf84ed6\bin\node_repl.exe
node_repl    9336 C:\Users\93rob\AppData\Local\OpenAI\Codex\runtimes\cua_node\1b23c930bdf84ed6\bin\node_repl.exe
node_repl   15008 C:\Users\93rob\AppData\Local\OpenAI\Codex\runtimes\cua_node\1b23c930bdf84ed6\bin\node_repl.exe
node_repl   18628 C:\Users\93rob\AppData\Local\OpenAI\Codex\runtimes\cua_node\1b23c930bdf84ed6\bin\node_repl.exe
node_repl   18664 C:\Users\93rob\AppData\Local\OpenAI\Codex\runtimes\cua_node\1b23c930bdf84ed6\bin\node_repl.exe
node_repl   22148 C:\Users\93rob\AppData\Local\OpenAI\Codex\runtimes\cua_node\1b23c930bdf84ed6\bin\node_repl.exe
node_repl   23860 C:\Users\93rob\AppData\Local\OpenAI\Codex\runtimes\cua_node\1b23c930bdf84ed6\bin\node_repl.exe
node_repl   26748 C:\Users\93rob\AppData\Local\OpenAI\Codex\runtimes\cua_node\1b23c930bdf84ed6\bin\node_repl.exe
node_repl   28016 C:\Users\93rob\AppData\Local\OpenAI\Codex\runtimes\cua_node\1b23c930bdf84ed6\bin\node_repl.exe
node_repl   30820 C:\Users\93rob\AppData\Local\OpenAI\Codex\runtimes\cua_node\1b23c930bdf84ed6\bin\node_repl.exe
node_repl   33960 C:\Users\93rob\AppData\Local\OpenAI\Codex\runtimes\cua_node\1b23c930bdf84ed6\bin\node_repl.exe
node_repl   37000 C:\Users\93rob\AppData\Local\OpenAI\Codex\runtimes\cua_node\1b23c930bdf84ed6\bin\node_repl.exe
node_repl   37584 C:\Users\93rob\AppData\Local\OpenAI\Codex\runtimes\cua_node\1b23c930bdf84ed6\bin\node_repl.exe
node_repl   37684 C:\Users\93rob\AppData\Local\OpenAI\Codex\runtimes\cua_node\1b23c930bdf84ed6\bin\node_repl.exe
node_repl   38640 C:\Users\93rob\AppData\Local\OpenAI\Codex\runtimes\cua_node\1b23c930bdf84ed6\bin\node_repl.exe
python      22284 C:\Users\93rob\AppData\Roaming\uv\python\cpython-3.13-windows-x86_64-none\python.exe
python      25488 C:\Users\93rob\AppData\Roaming\Claude\Claude Extensions\ant.dir.gh.blender.blender-mcp\.venv\Scripts…


exec
"C:\\Users\\93rob\\AppData\\Local\\Microsoft\\WindowsApps\\pwsh.exe" -Command "Get-Content src\\data\\sectors.js -Raw" in C:\Users\93rob\Documents\GitHub\SpaceFace
 succeeded in 6659ms:
design/GDD_2_0.md:30:| "Map useless (???)" | Galaxy map fogs *charted civilization* behind discovery flags (`starmap.js:521`); "what's around me" is buried on N | §7 |
design/GDD_2_0.md:31:| "No depth in background" | Single skydome nebula; zero parallax layers between camera and backdrop | §9 |
design/GDD_2_0.md:131:1. **Seams.** Every asteroid spawns 1–4 glowing fracture seams (deterministic from sector seed).
design/GDD_2_0.md:190:- **M** = **Local System Map** (what is around me — the thing every space game binds to M).
design/GDD_2_0.md:196:Core + mid-security sectors ship **fully charted** (stations, gates, lanes, hazards visible on both
design/GDD_2_0.md:197:maps from minute zero). The ??? fog applies only to: frontier sectors (edge of the graph), anomaly
design/GDD_2_0.md:199:sectors (new credit sink, existing bar-rumor plumbing). Discovery becomes a *reward for reaching the
design/GDD_2_0.md:219:The existing radar widget stays bottom-right, but: IFF colors from the accessibility palette,
design/GDD_2_0.md:258:1. Skydome nebula (exists) — parallax ~0.
design/GDD_2_0.md:259:2. **Far dust sheets** (2–3 additive planes, factor 0.15–0.3) — huge soft nebula wisps.
design/GDD_2_0.md:265:### 9.2 Sector identity (data-driven palettes)
design/GDD_2_0.md:266:Lighting recon scored palette data-driveness 2/5 — fix: per-sector `palette` block in `sectors.js`
design/GDD_2_0.md:267:(key/rim/fill light colors + nebula tint + fog color + dust hue). Core worlds: clean cyan/steel.
design/GDD_2_0.md:273:  (redundant with IFF glyphs for colorblind safety — palette already built in `accessibility.js`).
design/GDD_2_0.md:287:  red semantic palette stays (it's good and a11y-vetted).
design/GDD_2_0.md:292:tether tension whine, vent-bonus chime, shield-break bass drop, sector-tinted ambient pads (one per
design/GDD_2_0.md:293:palette class). All existing `audioRecipes.js` patterns.
design/GDD_2_0.md:298:1. **Shader/pipeline precompile** at boot & sector-load behind the existing loading veil
design/GDD_2_0.md:302:   mesh-builds/frame); pre-build one pooled mesh per enemy archetype at sector load.
design/GDD_2_0.md:325:regen (fixed sector graph is right for Freelancer-style authored identity). No new ship hulls until
design/BUILD_PLAN_2_0.md:43:  `src/ui/radar.js` (a11y palette only)
design/BUILD_PLAN_2_0.md:61:| B1 | M=local map, N=nav chart swap; charted-by-default discovery (core+mid sectors); ??? only frontier/anomaly; survey-data purchase at bars | **CODEX-3** | **DONE** (all named checks green; Claude moved claimBase C→U for scanner key + made check-claim-base registry-driven) | Fresh save: M shows populated local map; nav chart shows all core sectors named; `check:controls-discoverability`, `check:starmap-objective`, `check:localmap-routes` green |
design/BUILD_PLAN_2_0.md:86:| E2 | Data-driven sector palettes in `sectors.js` (lights/fog/nebula/dust); 4 palette classes authored | CODEX (wave 2) | QUEUED | Jumping sectors visibly changes identity in 1 s |
design/BUILD_PLAN_2_0.md:95:| F3 | Wiring pass: telemetry activate, accessibility.css link + applyAccessibility(), radar a11y palette, settings additions (scheme picker slot, damage numbers, shake slider) | **AGY-1** | **DONE** (all verified by file evidence + checks) | `window.__SF_TELEMETRY__` live; `check:ui-a11y` green; settings render |
design/BUILD_PLAN_2_0.md:104:`.tmp/multi-loop/20260703/brief-codex-{4-mining,5-ai-telegraphs,6-cruise,7-palettes}.md`.
design/BUILD_PLAN_2_0.md:119:- Determinism: any RNG in sim paths uses `state.rng`/sector-seeded hash; check:sim must stay green.

exec
"C:\\Users\\93rob\\AppData\\Local\\Microsoft\\WindowsApps\\pwsh.exe" -Command "Get-Content src\\render\\renderer.js -Raw" in C:\Users\93rob\Documents\GitHub\SpaceFace
 succeeded in 4520ms:
// src/data/sectors.js – 10-sector core->frontier graph.
// Sector IDs use sector_ prefix; station IDs use station_ prefix; faction IDs use faction_ prefix.
// Per ARCHITECTURE §0.8:
//   dangerTier(s) = clamp(round((1 - s.security) * 5), 0, 5)
//   wealthIndex(s) = clamp(0.3 + 0.16*tier + 0.10*(1-security), 0.3, 1.6)
//   dangerIndex(s) = clamp(0.05 + 0.22*tier + 0.25*(1-security), 0, 1.0)
// Pure data + pure math helpers, no imports.

export const STATION_TYPES = ['trade_hub', 'refinery', 'mining', 'fab', 'military', 'blackmarket', 'research'];
export const HAZARD_TYPES  = ['dense_asteroid', 'nebula', 'radiation', 'debris'];
export const POI_TYPES     = ['beacon', 'derelict', 'cache', 'colony', 'anomaly', 'wormhole', 'wreck'];

export const SECTORS = [
  {
    id: 'sector_helios_prime', name: 'Helios Prime', tier: 0, security: 0.98, charted: true,
    factionId: 'faction_scn', position: { x: 0, y: 0 }, worldRadius: 3500,
    // Tutorial home sector: NO hostile spawns (enemyDensity 0). A brand-new pilot must not be
    // hunted before learning the ropes; danger ramps up only in neighbouring sectors.
    trafficPerMin: 18, enemyDensity: 0, enemyLevel: [1, 2],
    neighbors: ['sector_ceres_belt', 'sector_tethys_junction', 'sector_vesta_forge'],
    stations: [
      { id: 'station_helios',     name: 'Helios Station',  type: 'trade_hub', factionId: 'faction_scn', size: 'L', services: ['trade','shipyard','refuel','repair','missions'] },
      { id: 'station_coalition',  name: 'Coalition HQ',    type: 'military',  factionId: 'faction_scn', size: 'M', services: ['missions','repair','refuel'] },
    ],
    // A small safe asteroid claim close to the spawn point so new pilots can learn mining before
    // the wider sector opens up (no hostiles here).
    fields: [ {
      id: 'f_helios_starter', type: 'ast_common_rock', countWeight: 1.0,
      center: { x: 720, z: -260 }, clusterRadius: 240, count: 18,
    } ],
    hazards: [],
    pois: [
      { id: 'poi_tutorial', type: 'beacon', name: 'Tutorial Beacon' },
      { id: 'poi_memorial', type: 'beacon', name: 'Memorial Array' },
    ],
  },
  {
    id: 'sector_ceres_belt', name: 'Ceres Belt', tier: 1, security: 0.72, charted: true,
    factionId: 'faction_dmc', position: { x: -3, y: 2 }, worldRadius: 4200,
    trafficPerMin: 10, enemyDensity: 0.18, enemyLevel: [2, 4],
    neighbors: ['sector_helios_prime', 'sector_tethys_junction', 'sector_pallas_drift'],
    stations: [
      { id: 'station_ceres',   name: 'Ceres Refinery', type: 'refinery', factionId: 'faction_dmc', size: 'M', services: ['trade','refuel','repair','ore_buy','refine'] },
      { id: 'station_beltout', name: 'Belt Outpost',   type: 'mining',   factionId: 'faction_dmc', size: 'S', services: ['trade','missions','ore_buy'] },
    ],
    fields: [
      { id: 'f_ceres_1', type: 'ast_metallic',    countWeight: 1.0 },
      { id: 'f_ceres_2', type: 'ast_common_rock', countWeight: 1.0 },
      { id: 'f_ceres_3', type: 'ast_metallic',    countWeight: 0.8 },
    ],
    hazards: [ { type: 'dense_asteroid', center: { x: 600, z: -400 }, radius: 700, intensity: 0.5 } ],
    pois: [
      { id: 'poi_driller', type: 'derelict', name: 'Abandoned Driller' },
      { id: 'poi_survey',  type: 'cache',    name: 'Survey Cache' },
    ],
  },
  {
    id: 'sector_tethys_junction', name: 'Tethys Junction', tier: 1, security: 0.65, charted: true,
    factionId: 'faction_mts', position: { x: 3, y: 2 }, worldRadius: 4000,
    trafficPerMin: 14, enemyDensity: 0.20, enemyLevel: [2, 4],
    neighbors: ['sector_helios_prime', 'sector_ceres_belt', 'sector_vesta_forge', 'sector_io_reach'],
    stations: [
      { id: 'station_tethys',  name: 'Tethys Trade Hub', type: 'trade_hub', factionId: 'faction_mts', size: 'L', services: ['trade','shipyard','refuel','repair','missions'] },
      { id: 'station_customs', name: 'Customs Gate',      type: 'military',  factionId: 'faction_scn', size: 'S', services: ['toll','scan','refuel'] },
    ],
    fields: [ { id: 'f_tethys_1', type: 'ast_common_rock', countWeight: 1.0 } ],
    hazards: [],
    pois: [
      { id: 'poi_blackmkt', type: 'cache', name: 'Black Market Contact', hidden: true, factionId: 'faction_quiet' },
    ],
  },
  {
    id: 'sector_vesta_forge', name: 'Vesta Forge', tier: 1, security: 0.60, charted: true,
    factionId: 'faction_dmc', position: { x: 0, y: 4 }, worldRadius: 4300,
    trafficPerMin: 9, enemyDensity: 0.25, enemyLevel: [3, 5],
    neighbors: ['sector_helios_prime', 'sector_tethys_junction', 'sector_charon_expanse'],
    stations: [
      { id: 'station_forge',  name: 'Forge Foundry', type: 'fab',    factionId: 'faction_dmc',   size: 'M', services: ['trade','shipyard','repair','refine','module_craft'] },
      { id: 'station_depot3', name: 'Refuel Depot',  type: 'mining', factionId: 'faction_choir', size: 'S', services: ['refuel'] },
    ],
    fields: [
      { id: 'f_vesta_1', type: 'ast_metallic',    countWeight: 1.0 },
      { id: 'f_vesta_2', type: 'ast_metallic',    countWeight: 1.0 },
      { id: 'f_vesta_3', type: 'ast_crystalline', countWeight: 0.6 },
    ],
    hazards: [ { type: 'radiation', center: { x: -800, z: 500 }, radius: 600, intensity: 0.4 } ],
    pois: [ { id: 'poi_freighter', type: 'derelict', name: 'Derelict Freighter' } ],
  },
  {
    id: 'sector_pallas_drift', name: 'Pallas Drift', tier: 2, security: 0.42, charted: true,
    factionId: 'faction_mts', position: { x: -5, y: 5 }, worldRadius: 4500,
    trafficPerMin: 7, enemyDensity: 0.40, enemyLevel: [4, 7],
    neighbors: ['sector_ceres_belt', 'sector_io_reach', 'sector_sker_haven'],
    stations: [
      { id: 'station_drift',    name: 'Drift Market', type: 'trade_hub',   factionId: 'faction_mts',   size: 'M', services: ['trade','refuel','repair','missions'] },
      { id: 'station_smuggler', name: 'Smuggler Den', type: 'blackmarket', factionId: 'faction_quiet', size: 'S', services: ['black_market','missions','refuel'] },
    ],
    fields: [
      { id: 'f_pallas_1', type: 'ast_metallic', countWeight: 1.0 },
      { id: 'f_pallas_2', type: 'ast_icy',       countWeight: 0.9 },
      { id: 'f_pallas_3', type: 'ast_icy',       countWeight: 0.7 },
    ],
    hazards: [ { type: 'nebula', center: { x: 400, z: 600 }, radius: 800, intensity: 0.4 } ],
    pois: [
      { id: 'poi_pwreck', type: 'wreck', name: 'Pirate Wreckage' },
      { id: 'poi_hcache', type: 'cache', name: 'Hidden Cache', hidden: true },
    ],
  },
  {
    id: 'sector_io_reach', name: 'Io Reach', tier: 2, security: 0.35, charted: true,
    factionId: 'faction_free', position: { x: 5, y: 5 }, worldRadius: 4600,
    trafficPerMin: 5, enemyDensity: 0.50, enemyLevel: [5, 8],
    neighbors: ['sector_tethys_junction', 'sector_pallas_drift', 'sector_charon_expanse', 'sector_veil_nebula'],
    stations: [
      { id: 'station_reach', name: 'Reach Station', type: 'trade_hub', factionId: 'faction_free', size: 'M', services: ['trade','repair','refuel','missions'], contested: true },
    ],
    fields: [
      { id: 'f_io_1', type: 'ast_metallic',    countWeight: 1.0 },
      { id: 'f_io_2', type: 'ast_crystalline', countWeight: 0.8 },
    ],
    hazards: [
      { type: 'dense_asteroid', center: { x: -500, z: -300 }, radius: 700, intensity: 0.5 },
      { type: 'nebula',         center: { x: 700,  z: 400  }, radius: 900, intensity: 0.45 },
    ],
    pois: [
      { id: 'poi_merc',    type: 'colony',   name: 'Mercenary Outpost', factionId: 'faction_quiet' },
      { id: 'poi_cruiser', type: 'derelict', name: 'Derelict Cruiser' },
      // V2 §6 / M3: a claimable industrial moon — a body the player can claim and build on.
      { id: 'poi_claim_pallas', type: 'colony', name: 'Pallas Industrial Moon', claimable: true, size: 'M' },
    ],
  },
  {
    id: 'sector_charon_expanse', name: 'Charon Expanse', tier: 2, security: 0.30, charted: true,
    factionId: 'faction_dmc', position: { x: 2, y: 7 }, worldRadius: 4800,
    trafficPerMin: 4, enemyDensity: 0.50, enemyLevel: [5, 9],
    neighbors: ['sector_vesta_forge', 'sector_io_reach', 'sector_ashfall_reach'],
    stations: [
      { id: 'station_expanse', name: 'Expanse Refinery', type: 'refinery', factionId: 'faction_dmc', size: 'M', services: ['ore_buy','refuel','repair','refine'] },
    ],
    fields: [
      { id: 'f_charon_1', type: 'ast_rare_exotic', countWeight: 0.7 },
      { id: 'f_charon_2', type: 'ast_metallic',    countWeight: 1.0 },
      { id: 'f_charon_3', type: 'ast_rare_exotic', countWeight: 0.6 },
    ],
    hazards: [
      { type: 'radiation',      center: { x: 300,  z: -700 }, radius: 700, intensity: 0.5 },
      { type: 'dense_asteroid', center: { x: -600, z: 500  }, radius: 650, intensity: 0.5 },
    ],
    pois: [ { id: 'poi_colony', type: 'colony', name: 'Abandoned Mining Colony', claimable: true, size: 'S' } ],
  },
  {
    id: 'sector_sker_haven', name: 'Sker Haven', tier: 3, security: 0.08, charted: false,
    factionId: 'faction_reach', position: { x: -7, y: 8 }, worldRadius: 5000,
    trafficPerMin: 0, enemyDensity: 0.70, enemyLevel: [7, 11],
    neighbors: ['sector_pallas_drift', 'sector_veil_nebula'],
    stations: [
      { id: 'station_sker', name: 'Sker Bazaar', type: 'blackmarket', factionId: 'faction_reach', size: 'M', services: ['black_market','repair','refuel','missions'], repGated: true },
    ],
    fields: [ { id: 'f_sker_1', type: 'ast_rare_exotic', countWeight: 0.8 } ],
    hazards: [
      { type: 'dense_asteroid', center: { x: 500,  z: 300  }, radius: 800, intensity: 0.6 },
      { type: 'dense_asteroid', center: { x: -500, z: -400 }, radius: 700, intensity: 0.6 },
    ],
    pois: [
      { id: 'poi_bounty', type: 'wreck', name: 'Bounty Wrecks' },
      { id: 'poi_stash',  type: 'cache', name: 'Stash Cache', hidden: true },
    ],
  },
  {
    id: 'sector_veil_nebula', name: 'Veil Nebula', tier: 3, security: 0.12, charted: false,
    factionId: 'faction_free', position: { x: 7, y: 9 }, worldRadius: 5200,
    trafficPerMin: 0, enemyDensity: 0.65, enemyLevel: [8, 12],
    neighbors: ['sector_io_reach', 'sector_sker_haven'],
    wormholeTo: { sectorId: 'sector_ashfall_reach', gatedBy: 'tech:tech_long_range_survey' },
    stations: [
      { id: 'station_veil', name: 'Research Station Veil', type: 'research', factionId: 'faction_free', size: 'M', services: ['scan_tech','missions','repair'] },
    ],
    fields: [ { id: 'f_veil_1', type: 'ast_gas_cloud', countWeight: 1.0 } ],
    hazards: [
      { type: 'nebula',    center: { x: 0,   z: 0    }, radius: 3000, intensity: 0.9 },
      { type: 'radiation', center: { x: 200, z: -200 }, radius: 600,  intensity: 0.6 },
    ],
    pois: [
      { id: 'poi_anomaly',  type: 'anomaly',  name: 'Anomaly Signal' },
      { id: 'poi_wormhole', type: 'wormhole', name: 'Wormhole', gatedBy: 'tech:tech_long_range_survey' },
    ],
  },
  {
    id: 'sector_ashfall_reach', name: 'Ashfall Reach', tier: 4, security: 0.05, charted: false,
    factionId: 'faction_vael', position: { x: 4, y: 11 }, worldRadius: 5500,
    trafficPerMin: 0, enemyDensity: 0.80, enemyLevel: [10, 15],
    neighbors: ['sector_charon_expanse'],
    stations: [
      { id: 'station_ashcache', name: 'Ruined Cache Station', type: 'blackmarket', factionId: 'faction_vael', size: 'S', services: ['repair','refuel'], repGated: true },
    ],
    fields: [
      { id: 'f_ash_1', type: 'ast_rare_exotic', countWeight: 1.0 },
      { id: 'f_ash_2', type: 'ast_rare_exotic', countWeight: 1.0 },
    ],
    hazards: [
      { type: 'radiation', center: { x: 0,   z: 0   }, radius: 2000, intensity: 0.8, moving: true },
      { type: 'debris',    center: { x: 400, z: 300 }, radius: 800,  intensity: 0.5 },
    ],
    pois: [
      { id: 'poi_boss',  type: 'anomaly', name: 'Boss Arena Signal' },
      { id: 'poi_vault', type: 'cache',   name: 'Ancient Vault', hidden: true },
    ],
  },
];

// Security helper functions per ARCHITECTURE §0.8.
const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;

export function dangerTier(sector) {
  return clamp(Math.round((1 - sector.security) * 5), 0, 5);
}

export function wealthIndex(sector) {
  const tier = sector.tier;
  return clamp(0.3 + 0.16 * tier + 0.10 * (1 - sector.security), 0.3, 1.6);
}

export function dangerIndex(sector) {
  const tier = sector.tier;
  return clamp(0.05 + 0.22 * tier + 0.25 * (1 - sector.security), 0, 1.0);
}

export function surveyDataPrice(sector) {
  const tier = Math.max(0, Number(sector && sector.tier) || 0);
  return Math.round(750 + tier * 1250);
}


exec
"C:\\Users\\93rob\\AppData\\Local\\Microsoft\\WindowsApps\\pwsh.exe" -Command "Get-Content src\\render\\starfield.js -Raw" in C:\Users\93rob\Documents\GitHub\SpaceFace
 succeeded in 2918ms:
// Render system: owns the WebGLRenderer, scene, lights, camera, starfield, and the entity→mesh
// lifecycle. Exposes worldToScreen / raycastToPlane via ctx.helpers and a renderFrame() the loop
// calls each animation frame. Sim never touches this; it's all in renderFrame (ARCHITECTURE §1,§2.4).
import * as THREE from 'three';
import { createChaseCamera } from './camera.js';
import { createStarfield } from './starfield.js';
import { createVisualFactory, setEnvMapForShips, invalidateVisualFactoryCaches } from './visualFactory.js';
import { installVisualOverrides } from './visualOverrides.js';
import { createBloom } from './bloom.js';
import { SpaceRenderGraph } from './post/spaceRenderGraph.js';
import { invalidateAuthoredAsset } from './assetLoader.js';
import { getAuthoredInstancePoolDiagnostics, invalidatePartsLibraryCaches, preloadAuthoredPartLibrary, syncAuthoredInstancePools } from './partsLibrary.js';
import { projectedWidthPx } from './lod.js';
import { createCollisionDebug } from './collisionDebug.js';
import { installDiagnostics } from './diagnostics.js';
import { createPlanetFactory } from './planetFactory.js';
import { precompilePipelines } from './precompile.js';

// Map a sector's danger/tier to a nebula backdrop tint so each region of the galaxy has its own
// color signature. Core (safe, low tier) = clean blue; industrial mid-ring = rust/amber; lawless
// frontier = blood-red; alien/endgame tier 4+ = violet. Returns a hex string or null (default).
function sectorNebulaTint(sector) {
  if (!sector) return null;
  const tier = sector.tier || 0;
  const sec = sector.security != null ? sector.security : 1;
  const danger = (1 - sec) + tier * 0.15; // blended danger metric
  if (tier >= 4) return '#5a1e8a';        // violet — alien / lawless endgame (Veil, Ashfall)
  if (danger > 0.7) return '#8a1e1e';     // blood-red — dangerous frontier (Io Reach, Sker)
  if (danger > 0.45) return '#8a4a1e';    // rust/amber — industrial mid-ring (Vesta, Pallas)
  if (danger > 0.2) return '#1e4a8a';     // deep blue — settled belt (Ceres, Tethys)
  return '#1e3a6a';                        // clean blue — safe core (Helios Prime)
}

// ---- contact shadow disc (module-level cache so one texture serves all entities) ----------------
let _shadowTex = null;
let _shadowGeo = null;
let _shadowMat = null;
const CONTACT_SHADOW_INITIAL_CAPACITY = 256;
const CONTACT_SHADOW_POS = new THREE.Vector3();
const CONTACT_SHADOW_SCALE = new THREE.Vector3();
const CONTACT_SHADOW_MATRIX = new THREE.Matrix4();
const CONTACT_SHADOW_QUAT = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
const SOCKET_WORLD_POS = new THREE.Vector3();
const SOCKET_WORLD_QUAT = new THREE.Quaternion();
const SOCKET_WORLD_SCALE = new THREE.Vector3();
const SOCKET_FORWARD = new THREE.Vector3();
const RUNTIME_MESH_BUILD_BUDGET = 2;
function getContactShadowTex() {
  if (_shadowTex) return _shadowTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0.0, 'rgba(0,0,0,0.70)');
  g.addColorStop(0.6, 'rgba(0,0,0,0.35)');
  g.addColorStop(1.0, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  _shadowTex = new THREE.CanvasTexture(c);
  return _shadowTex;
}
function getContactShadowGeo() {
  if (!_shadowGeo) _shadowGeo = new THREE.CircleGeometry(1, 20);
  return _shadowGeo;
}
function getContactShadowMat() {
  if (!_shadowMat) {
    _shadowMat = new THREE.MeshBasicMaterial({
      map: getContactShadowTex(),
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
  }
  return _shadowMat;
}

function attachContactShadow(mesh, entity) {
  if (!mesh || entity._noShadow) return;
  const r = Math.max(16, (entity.radius || 28) * 1.4);
  mesh.userData.contactShadowRadius = r;
  mesh.userData.hasContactShadow = true;
}

function createContactShadowPool(scene) {
  const pool = { scene, capacity: 0, mesh: null };
  ensureContactShadowCapacity(pool, CONTACT_SHADOW_INITIAL_CAPACITY);
  return pool;
}

function ensureContactShadowCapacity(pool, desired) {
  if (!pool || desired <= pool.capacity) return;
  const nextCapacity = Math.max(desired, pool.capacity ? pool.capacity * 2 : CONTACT_SHADOW_INITIAL_CAPACITY);
  const previous = pool.mesh;
  const mesh = new THREE.InstancedMesh(getContactShadowGeo(), getContactShadowMat(), nextCapacity);
  mesh.name = 'ContactShadow_Pool';
  mesh.count = 0;
  mesh.renderOrder = -2;
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.userData.sharedContactShadow = true;
  mesh.userData.contactShadowPool = true;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  pool.mesh = mesh;
  pool.capacity = nextCapacity;
  if (previous && pool.scene) {
    pool.scene.remove(previous);
    if (typeof previous.dispose === 'function') previous.dispose();
  }
  if (pool.scene) pool.scene.add(mesh);
}

function syncContactShadowPool(pool, entities, meshes) {
  if (!pool || !pool.mesh || !Array.isArray(entities)) return;
  let count = 0;
  for (const entity of entities) {
    if (!entity || entity.alive === false || entity._noShadow) continue;
    if (entity.type !== 'ship' && entity.type !== 'station') continue;
    const mesh = meshes && meshes.get(entity.id);
    if (!mesh || !(mesh.userData && mesh.userData.hasContactShadow)) continue;
    ensureContactShadowCapacity(pool, count + 1);
    const radius = Number(mesh.userData.contactShadowRadius) || Math.max(16, (entity.radius || 28) * 1.4);
    CONTACT_SHADOW_POS.set(entity.pos && Number.isFinite(entity.pos.x) ? entity.pos.x : mesh.position.x, -0.5,
      entity.pos && Number.isFinite(entity.pos.z) ? entity.pos.z : mesh.position.z);
    CONTACT_SHADOW_SCALE.set(radius, radius, radius);
    CONTACT_SHADOW_MATRIX.compose(CONTACT_SHADOW_POS, CONTACT_SHADOW_QUAT, CONTACT_SHADOW_SCALE);
    pool.mesh.setMatrixAt(count, CONTACT_SHADOW_MATRIX);
    count++;
  }
  pool.mesh.count = count;
  pool.mesh.visible = count > 0;
  pool.mesh.instanceMatrix.needsUpdate = true;
}

function requestAuthoredUpgrade(mesh, renderer, scene) {
  const request = mesh && mesh.userData && mesh.userData.requestAuthoredUpgrade;
  if (typeof request !== 'function') return;
  try { request(renderer, scene); }
  catch (error) { console.warn('[render] authored asset upgrade request failed', error); }
}

function configureShadowCasters(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    if (!o.visible) { o.castShadow = false; o.receiveShadow = false; return; }
    if (o.userData && o.userData.spacefaceNoShadow) { o.castShadow = false; o.receiveShadow = false; return; }
    if (o.userData && o.userData.sharedContactShadow) { o.castShadow = false; return; }
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const casts = mats.some((m) => m && !m.transparent && m.depthWrite !== false && (m.opacity == null || m.opacity >= 1) && m.blending === THREE.NormalBlending);
    o.castShadow = casts;
    // GR-2: opaque hulls also RECEIVE shadows — a ship resting on a station pad should be shaded by
    // the station's superstructure, and ships in formation should shadow each other. The same opacity
    // test as casting: transparent shields/engine-plumes neither cast nor receive (they'd self-shadow
    // and flicker). This is what gives ships groundedness beyond the fake contact-shadow disc.
    o.receiveShadow = casts;
  });
}

const _plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _ray = new THREE.Raycaster();
const _pt = new THREE.Vector3();
const _v2 = new THREE.Vector2();
const _drawSize = new THREE.Vector2();

export const render = {
  name: 'render',
  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    const state = ctx.state, bus = ctx.bus;

    const canvas = document.getElementById('gl-canvas');
    // preserveDrawingBuffer is needed only by the explicit /__shot ship capture route. Keeping it off
    // during normal dev and perf probes avoids a readback-friendly WebGL path that players never use.
    const query = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
    const devShot = !!(query && query.get('dev') === 'shipshot');
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: devShot });
    renderer.setClearColor(0x060912, 1);
    const drawSize = applyRendererSize(renderer, state);

    const scene = new THREE.Scene();
    // Thin fog for gentle depth cueing only — the old 0.00085 erased the entire backdrop, leaving a
    // black void. This keeps the nebula + far stars visible while still fading the deep distance.
    scene.fog = new THREE.FogExp2(0x0a1430, 0.00026);
    scene.add(new THREE.AmbientLight(0x42506f, 0.85));
    const key = new THREE.DirectionalLight(0xcfe2ff, 1.7); key.position.set(60, 140, 40); scene.add(key);
    const rim = new THREE.DirectionalLight(0x6a5cff, 0.7); rim.position.set(-70, 50, -60); scene.add(rim);
    const fill = new THREE.DirectionalLight(0x39d0ff, 0.35); fill.position.set(20, 30, 120); scene.add(fill);

    // Real shadow maps (graphics spec Workstream G). Gated behind settings.video.shadows (default
    // true). The key light becomes a shadow caster with a tight frustum that follows the player so
    // ships/stations cast real shadows on the play plane — a groundedness the contact-shadow disc
    // only faked. The bloom contract (bloom.js) is untouched: shadows write to the depth buffer
    // during the normal scene render, before bloom samples it.
    const shadowsOn = !(state.settings && state.settings.video && state.settings.video.shadows === false);
    if (shadowsOn) {
      renderer.shadowMap.enabled = false;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      key.castShadow = true;
      key.shadow.mapSize.set(2048, 2048);
      // Orthographic frustum sized to the local play area around the player (updated per frame in
      // renderFrame to follow the player). Tight bounds = crisp shadows at usable resolution.
      const SC = key.shadow.camera;
      SC.near = 10; SC.far = 600;
      SC.left = -700; SC.right = 700; SC.top = 700; SC.bottom = -700;
      SC.updateProjectionMatrix();
      key.shadow.bias = -0.0008;
      key.shadow.normalBias = 0.04;
      key.target = new THREE.Object3D(); scene.add(key.target);
    }

    const cam = createChaseCamera(state);
    const starfield = createStarfield(scene);
    const vf = createVisualFactory();
    // Hero-asset registry (spec §17.3): wraps the factory's build() so the bespoke player Kestrel is
    // intercepted before the procedural visualFactory. Narrow + failure-isolated — any throw falls
    // back to the original procedural builder, so non-Kestrel entities are completely unaffected.
    installVisualOverrides(vf, {
      onAuthoredAssetSwap: () => { this._shadowReceiversDirty = true; },
    });

    // Bake a PMREM environment map from the nebula backdrop (scene.background) so chrome/authority
    // hulls can mirror the actual space around them — real reflections of the nebula + stars rather
    // than a canned gradient. Done once after the starfield sets scene.background; the resulting
    // envMap is exposed on state.render for the visual factory to attach to high-metalness hulls.
    // Factored into a method (_bakeEnv) so WebGL context-loss recovery can re-bake it: a lost GL
    // context invalidates the envMap GPU texture, and without re-baking chrome hulls go matte after
    // a driver/GPU hiccup.
    this._envMap = null;
    try {
      // wait one frame so scene.background (an async-decoded CanvasTexture) is present, then bake
      const bakeEnv = () => this._bakeEnv();
      setTimeout(bakeEnv, 120); // let the starfield's async background decode first
    } catch (_) { /* PMREM unavailable */ }

    // WebGL context-loss recovery. The browser fires webglcontextlost when the GPU driver resets
    // (driver crash, sleep/wake, VRAM exhaustion). THREE's WebGLRenderer only stops rendering on
    // loss — it does NOT restore the env map, re-upload procedural textures, or rebuild GPU state,
    // so without handling this the game silently freezes / goes black with no recovery path.
    // On lost: preventDefault (tells the browser we'll recover), set a flag so renderFrame skips
    // work while the context is gone. On restored: re-bake the PMREM env, force a full mesh
    // reconciliation (re-builds every entity mesh → re-uploads geometries/materials), re-apply
    // renderer config, and re-apply the video settings that drive tone mapping / shadow state.
    this._contextLost = false;
    if (canvas) {
      canvas.addEventListener('webglcontextlost', (ev) => {
        ev.preventDefault();        // allow restoration
        this._contextLost = true;
        if (typeof console !== 'undefined') console.warn('[render] WebGL context lost — awaiting restore');
        bus.emit('toast', { text: 'Graphics context lost — recovering…', kind: 'warn', ttl: 4 });
      }, false);
      canvas.addEventListener('webglcontextrestored', () => {
        if (typeof console !== 'undefined') console.warn('[render] WebGL context restored — rebuilding GPU resources');
        this._contextLost = false;
        try {
          // Re-apply renderer config that the new context defaults lose.
          this.renderer.setClearColor(0x060912, 1);
          if (this._shadowSettingOn && this._keyLight) this.renderer.shadowMap.enabled = false; // re-gated by _syncShadowMapEnabled on next frame
          // Re-bake the PMREM env (the old GPU texture is gone).
          this._bakeEnv();
          // Invalidate authored-asset and factory caches so the next rebuild reloads GLBs and
          // recreates materials against the restored context rather than reusing stale GPU handles.
          invalidateAuthoredAsset(renderer);
          invalidateVisualFactoryCaches();
          invalidatePartsLibraryCaches(renderer);
          // Rebuild the bloom post-process pipeline (its render targets are tied to the lost context).
          if (this.bloom && typeof this.bloom.rebuild === 'function') this.bloom.rebuild();
          // Force every entity mesh to rebuild so geometries/materials re-upload. The cleanest way
          // is to clear + reconcile: dispose the CPU mesh objects, then reconcileMeshes() rebuilds
          // them from the live entityList via the visual factory.
          this.clearAllMeshes(false);
          this._meshReconcileDirty = true;
          // Re-apply bloom + video settings (tone mapping / exposure live on settings:changed).
          bus.emit('settings:changed', { section: 'video' });
          bus.emit('toast', { text: 'Graphics recovered.', kind: 'good', ttl: 3 });
        } catch (err) {
          if (typeof console !== 'undefined') console.error('[render] context-restore rebuild failed', err);
        }
      }, false);
    }

    // Preload the menu background (the only generated .jpg we use — the rest are captioned
    // contact-sheet references and are replaced by procedural materials / inline SVG).
    { const i = new Image(); i.src = 'assets/cinematics/menu_background.jpg'; }

    this.renderer = renderer; this.scene = scene; this.cam = cam; this.starfield = starfield; this.vf = vf;
    this.authoredPartLibraryReady = preloadAuthoredPartLibrary(renderer).catch((error) => {
      console.warn('[render] authored part library preload failed', error);
      return null;
    });
    state.render.authoredPartLibraryReady = this.authoredPartLibraryReady;
    this._keyLight = shadowsOn ? key : null; // referenced by _updateShadowFollow() each frame
    this._shadowSettingOn = shadowsOn;
    this._shadowReceiversDirty = true;
    this._shadowReceiverCount = 0;
    this._contactShadowPool = createContactShadowPool(scene);
    this.planetFactory = createPlanetFactory();
    this._planetBodies = [];
    // LOD projector viewport (CSS px); onResize refreshes it. Initialize from drawSize so the first
    // frame before onResize has sane values.
    { const dpr = renderer.getPixelRatio() || 1; this.viewport = { width: drawSize.x / dpr, height: drawSize.y / dpr }; }
    try { this.bloom = createBloom(renderer, drawSize.x, drawSize.y); }
    catch (err) { console.warn('[render] bloom unavailable, falling back:', err); this.bloom = null; }
    // Collision/socket/landing-contact debug visualization (spec §12.5). OFF by default; toggled via
    // the render system handle (state.render.debug.toggle) — wired to F7 in ui/input.js.
    try { this.collisionDebug = createCollisionDebug(this); }
    catch (err) { console.warn('[render] collision debug unavailable:', err); this.collisionDebug = null; }
    this._meshes = new Map(); // entityId -> Object3D
    this._meshBuildQueue = [];
    this._meshBuildQueuedIds = new Set();
    this._hazardVisuals = []; // hazard zone visual meshes for the current sector
    this._meshReconcileDirty = true;
    this._initialMeshReconcileComplete = false;
    // Renderer diagnostics: window.__THREE_GAME_DIAGNOSTICS__ (draw calls/tris/memory + frame timing).
    try {
      this.diag = installDiagnostics(renderer, {
        entities: () => state.entityList.length,
        particles: () => {
          const sys = ctx.registry && ctx.registry.get('vfx');
          return sys ? sys._liveCount : 0;
        },
        sprites: () => {
          const sys = ctx.registry && ctx.registry.get('vfx');
          return sys ? (sys._liveSpriteCount || 0) : 0;
        },
        lights: () => {
          const sys = ctx.registry && ctx.registry.get('vfx');
          const pool = sys && sys._lights;
          if (!pool) return 0;
          let n = 0;
          for (const slot of pool) if (slot && slot.obj && slot.obj.visible) n++;
          return n;
        },
        perf: () => state.perfRuntime && state.perfRuntime.getReport ? state.perfRuntime.getReport() : {},
        settings: () => ({ video: { ...((state.settings && state.settings.video) || {}) } }),
        scenePools: () => getAuthoredInstancePoolDiagnostics(scene),
        post: () => ({
          activePath: this._lastRenderPath || null,
          bloomSelected: !!(this.bloom && state.settings && state.settings.video && state.settings.video.bloom !== false),
          bloom: this.bloom && typeof this.bloom.diagnostics === 'function' ? this.bloom.diagnostics() : null,
          renderGraph: !!this._renderGraph,
        }),
      });
      state.render.diagnostics = this.diag;
    }
    catch (err) { console.warn('[render] diagnostics unavailable:', err); this.diag = null; }

    state.render.scene = scene;
    state.render.renderer = renderer;
    state.render.camera = cam.obj;
    state.render.cameraCtrl = cam;   // controller (addTrauma/pushZoom) — exposed for feel.js / ui
    state.render.vf = vf;   // exposed for the dev-only ship turntable preview (shipPreview.js)
    state.render.warmPostProcess = () => (this.bloom && state.settings.video.bloom !== false ? this.bloom.render(scene, cam.obj) : renderer.render(scene, cam.obj));
    // Collision/socket/landing debug toggle (spec §12.5), bound to F7 in ui/input.js. Capture the
    // render-system `this` once so the handle closures resolve the live collisionDebug regardless of
    // how they're invoked (method `this` would otherwise bind to the debug handle object itself).
    const renderSys = this;
    state.render.debug = {
      get on() { return renderSys.collisionDebug ? renderSys.collisionDebug.on : false; },
      toggle: () => renderSys.collisionDebug ? renderSys.collisionDebug.toggle() : false,
      set: (v) => { if (renderSys.collisionDebug) renderSys.collisionDebug.setDebug(v); },
    };
    state.camera.obj = cam.obj;

    ctx.helpers.worldToScreen = (v) => this.worldToScreen(v);
    ctx.helpers.raycastToPlane = (ndc) => this.raycastToPlane(ndc);
    ctx.helpers.addTrauma = (a) => cam.addTrauma(a);
    ctx.helpers.socketWorldPose = (id, name) => this.socketWorldPose(id, name);
    ctx.helpers.socketWorldPos = (id, name) => this.socketWorldPos(id, name);

    bus.on('entity:spawned', () => { this._meshReconcileDirty = true; });
    bus.on('entity:destroyed', ({ id }) => {
      const m = this._meshes.get(id);
      if (m) { scene.remove(m); disposeObject(m); this._meshes.delete(id); }
    });
    // Ship hull swap or loadout change (fit/upgrade) — rebuild the mesh so visible hardpoints,
    // engines and tier reflect the current ship. Without this the mesh is frozen at spawn and a
    // shipyard hull switch or fitted weapon never shows. Mirrors the spawn path: dispose old,
    // build new, re-seat from the entity's live transform.
    bus.on('ship:appearanceChanged', ({ id }) => render.rebuildShipMesh(id));
    bus.on('camera:shake', ({ amount }) => cam.addTrauma(amount || 0.3));
    bus.on('camera:zoom', ({ delta, level }) => { if (level != null) cam.setZoom(level); else cam.setZoom(state.camera.zoom + (delta || 0)); });
    bus.on('game:started', () => cam.snapToPlayer && cam.snapToPlayer());
    bus.on('save:loaded', () => cam.snapToPlayer && cam.snapToPlayer());
    bus.on('player:respawn', () => cam.snapToPlayer && cam.snapToPlayer());
    // Live-apply video settings changes. Without this, dragging Bloom strength / FOV / particle
    // quality in the settings screen did nothing (only the initial value was used) — a "slider that
    // doesn't work" sore thumb. We forward the values to the systems that own them.
    bus.on('settings:changed', (p) => {
      if (!p || p.section !== 'video') return;
      const vd = state.settings.video;
      if (this.bloom) this.bloom.setOptions({ bloom: vd.bloom, strength: vd.bloomStrength, threshold: vd.bloomThreshold, exposure: vd.exposure, acesToneMapping: vd.acesToneMapping !== false });
      if (p.key === 'shadows' || p.key == null) {
        this._shadowSettingOn = vd.shadows !== false;
        this._shadowReceiversDirty = true;
      }
      if (p.key === 'renderScale' || p.key === 'pixelRatioCap' || p.key == null) this.onResize();
      // FOV: the feel system (feel.js) adds a transient punch on top of this base. We update the
      // camera's base fov here; feel.frame() re-derives its cached base from settings when no punch
      // is active, so the slider and the punch never fight.
      if (p.key === 'fov' || p.key == null) {
        const camObj = state.render.camera;
        if (camObj && camObj.isPerspectiveCamera && typeof vd.fov === 'number') {
          camObj.fov = vd.fov;
          camObj.updateProjectionMatrix();
        }
      }
    });
    // On sector change, reconcile rather than blindly clearing: the new sector's entities are
    // already spawned by the time this fires (enterSector spawns before its sector:enter resolves),
    // so a blind clearAllMeshes(keepPlayer) used to wipe the station/asteroids and leave the player
    // alone in empty space. reconcileMeshes() removes only meshes for entities that are gone.
    bus.on('sector:enter', ({ sector } = {}) => {
      this._meshReconcileDirty = true;
      if (cam.snapToPlayer) cam.snapToPlayer();
      this._updatePlanetBodies(sector);
      // Tint the nebula backdrop to the sector's mood so each region of the galaxy reads with its
      // own color signature: clean-blue core → rust/amber industrial → blood-red frontier → violet
      // alien/endgame. Drives the whole-frame atmosphere, reinforcing the core-to-frontier gradient.
      if (this.starfield && this.starfield.setSectorTint) {
        this.starfield.setSectorTint(sectorNebulaTint(sector));
      }
      this._updateHazardVisuals(sector);
      precompilePipelines(renderer, scene, cam.obj, { sector }).catch((error) => console.warn('[render] sector pipeline precompile failed', error));
    });
    bus.on('save:loaded', () => { this._meshReconcileDirty = true; });

    window.addEventListener('resize', () => this.onResize());
  },

  clearAllMeshes(keepPlayer) {
    for (const [id, m] of [...this._meshes]) {
      if (keepPlayer && id === this.state.playerId) continue;
      this.scene.remove(m); disposeObject(m); this._meshes.delete(id);
    }
    this._meshBuildQueue.length = 0;
    this._meshBuildQueuedIds.clear();
    // Also clear hazard zone visuals
    for (const obj of this._hazardVisuals) { this.scene.remove(obj); disposeObject(obj); }
    this._hazardVisuals = [];
  },

  // Bake (or re-bake) the PMREM environment map from the current nebula backdrop. Called once at
  // init after the starfield background decodes, AND on WebGL context restore (a lost GL context
  // invalidates the envMap GPU texture — without re-baking, chrome hulls go matte after recovery).
  _bakeEnv() {
    try {
      const renderer = this.renderer, scene = this.scene, state = this.state;
      const pmrem = new THREE.PMREMGenerator(renderer);
      const envMap = scene.background && scene.background.isTexture
        ? pmrem.fromEquirectangular(scene.background).texture
        : pmrem.fromScene(scene, 0, 0.1, 1000).texture;
      pmrem.dispose();
      // Dispose the previous env GPU texture if we're re-baking (context restore path).
      if (this._envMap && this._envMap !== envMap) {
        try { this._envMap.dispose(); } catch (_) {}
      }
      this._envMap = envMap;
      state.render.envMap = envMap;
      setEnvMapForShips(envMap);   // hand it to the visual factory for chrome/authority hulls
      if (scene.environment === null || scene.environment === this._envMap) scene.environment = envMap;
    } catch (_) { /* env-map optional — chrome falls back to high-metalness matte */ }
  },

  // Self-healing entity<->mesh reconciliation. Guarantees every alive, renderable entity has a
  // scene mesh and that meshes for gone entities are disposed — independent of event ordering.
  // This is the safety net that makes the world actually render (entity:spawned alone was being
  // undone by the old sector:enter clear). Cheap: only builds/destroys on a delta.
  reconcileMeshes() {
    const state = this.state;
    const buildBudget = this._initialMeshReconcileComplete ? RUNTIME_MESH_BUILD_BUDGET : Infinity;
    // remove meshes whose entity no longer exists or has died
    for (const [id, m] of this._meshes) {
      const e = state.entities.get(id);
      if (!e || e.alive === false) { this.scene.remove(m); disposeObject(m); this._meshes.delete(id); this._shadowReceiversDirty = true; }
    }
    // Queue alive entities that lack meshes (fx are particle-managed by vfx -> mark + skip).
    for (const e of state.entityList) {
      if (e._noMesh || this._meshes.has(e.id)) continue;
      if (!this._meshBuildQueuedIds.has(e.id)) {
        this._meshBuildQueue.push(e.id);
        this._meshBuildQueuedIds.add(e.id);
      }
    }
    const built = this._drainMeshBuildQueue(buildBudget);
    this._meshReconcileDirty = this._meshBuildQueue.length > 0;
    if (!this._meshReconcileDirty) this._initialMeshReconcileComplete = true;
    return built;
  },

  _drainMeshBuildQueue(buildBudget) {
    let built = 0;
    while (this._meshBuildQueue.length && built < buildBudget) {
      const id = this._meshBuildQueue.shift();
      this._meshBuildQueuedIds.delete(id);
      const e = this.state.entities.get(id);
      if (!e || e.alive === false || e._noMesh || this._meshes.has(id)) continue;
      const m = this.vf.build(e);
      if (!m) { e._noMesh = true; continue; }
      m.position.set(e.pos.x, 0, e.pos.z);
      m.rotation.y = -e.rot;
      if (e.type === 'ship' || e.type === 'station') { attachContactShadow(m, e); configureShadowCasters(m); }
      e.mesh = m; e.view = { root: m };
      this._meshes.set(e.id, m);
      this.scene.add(m);
      requestAuthoredUpgrade(m, this.renderer, this.scene);
      this._shadowReceiversDirty = true;
      built++;
    }
    return built;
  },

  // Rebuild one ship's mesh after a hull swap or loadout change. Disposes the old Object3D, builds a
  // fresh one from the (now-updated) entity, and re-seats it from the entity's live transform so it
  // doesn't snap. Player-only in practice, but safe for any ship id. Textures/geo/materials are
  // cached in the factory (never disposed), so only the per-entity Object3D graph is freed here —
  // exactly the same lifecycle the per-entity disposer in disposeObject() already assumes.
  rebuildShipMesh(id) {
    const e = this.state.entities.get(id);
    if (!e || e.alive === false) return;
    const old = this._meshes.get(id);
    if (old) { this.scene.remove(old); disposeObject(old); this._meshes.delete(id); this._shadowReceiversDirty = true; }
    const m = this.vf.build(e);
    if (!m) return;
    m.position.set(e.pos.x, 0, e.pos.z);
    m.rotation.y = -e.rot;
    // carry the bank pose so the rebuilt hull doesn't momentarily sit level mid-turn
    const hull = m.userData && m.userData.hull;
    if (hull && e.bank != null) hull.rotation.x = e.bank;
    if (e.type === 'ship' || e.type === 'station') { attachContactShadow(m, e); configureShadowCasters(m); }
    e.mesh = m; e.view = { root: m };
    this._meshes.set(id, m);
    this.scene.add(m);
    requestAuthoredUpgrade(m, this.renderer, this.scene);
    this._shadowReceiversDirty = true;
  },


  syncEntityViews(alpha) {
    const now = typeof performance !== 'undefined' ? performance.now() * 0.001 : 0;
    for (const e of this.state.entityList) {
      const m = e.mesh; if (!m) continue;
      if (this.collisionDebug && this.collisionDebug.on) m.userData.__lastEntity = e; // read-only debug overlay
      const hull = m.userData && m.userData.hull;   // bankable inner group (ships only)
      if (e.flags.noInterp) {
        m.position.set(e.pos.x, 0, e.pos.z); m.rotation.y = -e.rot;
        if (hull && e.bank != null) hull.rotation.x = e.bank; // roll around forward axis; +bank banks right
      } else {
        m.position.x = e.prevPos.x + (e.pos.x - e.prevPos.x) * alpha;
        m.position.z = e.prevPos.z + (e.pos.z - e.prevPos.z) * alpha;
        m.position.y = 0;
        let dr = e.rot - e.prevRot;
        dr = ((dr + Math.PI) % (Math.PI * 2)) - Math.PI; if (dr < -Math.PI) dr += Math.PI * 2;
        m.rotation.y = -(e.prevRot + dr * alpha);
        // interpolate bank for a smooth roll (prevBank snapshotted in core.preStep each step)
        if (hull && e.bank != null) {
          const pb = e.prevBank || 0;
          hull.rotation.x = pb + (e.bank - pb) * alpha;
        }
      }
      // Hero-asset damage states (spec §9.11): hero meshes carry an updateDamageState closure that
      // modulates light groups / armor / drive from the live hull fraction so damage reads without the
      // HUD bar. Cheap no-op for non-hero meshes (no closure). Called once per frame per entity.
      if (m.userData.updateDamageState) m.userData.updateDamageState(e, now);

      // GR-5: persistent 3D shield bubble visibility + impact flash. Shown while shields hold; the
      // flash decays each frame and is punched up whenever the entity's shield value drops (impact).
      const sb = m.userData.shieldBubble;
      if (sb) {
        const up = e.shield > 0;
        if (sb.visible !== up) sb.visible = up;
        if (up) {
          const u = sb.material.uniforms;
          // detect shield loss since last frame -> punch the fresnel flash
          const prev = sb.userData._prevShield != null ? sb.userData._prevShield : e.shield;
          if (e.shield < prev - 0.5) u.uFlash.value = Math.min(1, u.uFlash.value + 0.8);
          sb.userData._prevShield = e.shield;
          // frame-rate-independent exponential decay: uFlash *= 0.05^(dt) settles in ~0.4s at any fps.
          const dt = Math.min(0.1, now - (sb.userData._prevFlashT != null ? sb.userData._prevFlashT : now));
          sb.userData._prevFlashT = now;
          u.uFlash.value *= Math.pow(0.05, dt);
        }
      }
      // Projected-screen-size LOD (spec §12.4): resolve each entity's detail level from its projected
      // pixel width with hysteresis, so assets can drop detail at distance. The selector owns no
      // geometry; per-asset hooks read m.userData.lod.level and decide what to show. Cheap for entities
      // without a lod state (no closure attached).
      if (m.userData.lod && m.userData.updateLod) {
        const px = projectedWidthPx(e.pos, e.radius, this.cam.obj, this.viewport);
        const level = m.userData.lod.resolve(px);
        m.userData.updateLod(level);
      }
    }
  },

  _updatePlanetBodies(sector) {
    for (const b of this._planetBodies) { this.scene.remove(b.mesh); }
    this.planetFactory.disposeBodies(this._planetBodies);
    this._planetBodies = this.planetFactory.buildSectorBodies(sector);
    for (const b of this._planetBodies) {
      b.mesh.position.copy(b.basePos);
      this.scene.add(b.mesh);
    }
    this._shadowReceiversDirty = true;
  },

  _updatePlanetParallax() {
    const cam = this.cam.obj.position;
    // GR-4: advance the planet cloud-drift uniform from the background clock (sim-scaled, not wall
    // clock) so hit-stop/pause also stills the clouds. Sun bodies have no uTime uniform; planet
    // surface materials do — the lazy read avoids a per-body branch on suns.
    const t = this._bgTime || 0;
    for (const b of this._planetBodies) {
      b.mesh.position.x = b.basePos.x + cam.x * (1 - b.parallax);
      b.mesh.position.z = b.basePos.z + cam.z * (1 - b.parallax);
      const u = b.mesh.material && b.mesh.material.uniforms && b.mesh.material.uniforms.uTime;
      if (u) u.value = t;
    }
  },

  // --------------- hazard zone visuals ------------------------------------------------
  // Create a radial gradient CanvasTexture: bright center color fading to transparent edge.
  _makeHazardTexture(hexColor, centerAlpha, edgeAlpha) {
    const size = 256;
    const c = document.createElement('canvas'); c.width = c.height = size;
    const ctx = c.getContext('2d');
    const half = size / 2;
    const g = ctx.createRadialGradient(half, half, 0, half, half, half);
    // Parse hex to r,g,b
    const r = parseInt(hexColor.slice(1, 3), 16);
    const gr = parseInt(hexColor.slice(3, 5), 16);
    const b = parseInt(hexColor.slice(5, 7), 16);
    g.addColorStop(0.0, `rgba(${r},${gr},${b},${centerAlpha})`);
    g.addColorStop(0.5, `rgba(${r},${gr},${b},${centerAlpha * 0.6})`);
    g.addColorStop(0.85, `rgba(${r},${gr},${b},${edgeAlpha * 0.5})`);
    g.addColorStop(1.0, `rgba(${r},${gr},${b},${edgeAlpha})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
  },

  _updateHazardVisuals(sector) {
    // Dispose previous hazard visuals
    for (const obj of this._hazardVisuals) {
      this.scene.remove(obj);
      disposeObject(obj);
    }
    this._hazardVisuals = [];

    if (!sector || !sector.hazards || sector.hazards.length === 0) return;

    // Color/opacity config per hazard type
    const hazardStyles = {
      radiation:       { color: '#66ff44', centerAlpha: 0.18, edgeAlpha: 0.04, ring: true,  ringColor: 0x44ff22 },
      nebula:          { color: '#7744ff', centerAlpha: 0.15, edgeAlpha: 0.03, ring: false, ringColor: 0x7744ff },
      dense_asteroid:  { color: '#aa7744', centerAlpha: 0.10, edgeAlpha: 0.02, ring: false, ringColor: 0xaa7744 },
      debris:          { color: '#778899', centerAlpha: 0.12, edgeAlpha: 0.03, ring: false, ringColor: 0x778899 },
    };

    for (const hz of sector.hazards) {
      const style = hazardStyles[hz.type] || hazardStyles.debris;
      const intensityScale = hz.intensity != null ? hz.intensity : 0.5;

      // --- Main disc ---
      const discGeo = new THREE.CircleGeometry(hz.radius, 64);
      const tex = this._makeHazardTexture(style.color, style.centerAlpha * intensityScale, style.edgeAlpha * intensityScale);
      const discMat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const disc = new THREE.Mesh(discGeo, discMat);
      disc.rotation.x = -Math.PI / 2;
      disc.position.set(hz.center.x, -0.5, hz.center.z);
      disc.renderOrder = -3; // below contact shadows
      disc.frustumCulled = false;
      this.scene.add(disc);
      this._hazardVisuals.push(disc);

      // --- Boundary ring (radiation zones get a visible edge ring) ---
      if (style.ring) {
        const ringInner = hz.radius - 4;
        const ringOuter = hz.radius + 4;
        const ringGeo = new THREE.RingGeometry(ringInner, ringOuter, 64);
        const ringMat = new THREE.MeshBasicMaterial({
          color: style.ringColor,
          transparent: true,
          opacity: 0.25 * intensityScale,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(hz.center.x, -0.4, hz.center.z);
        ring.renderOrder = -2;
        ring.frustumCulled = false;
        this.scene.add(ring);
        this._hazardVisuals.push(ring);
      }
    }
  },

  prepareFrame(alpha, frameDt) {
    // While the GL context is lost, the renderer can't draw — skip all per-frame work until
    // webglcontextrestored rebuilds GPU resources. (cam.follow etc. would run against a dead
    // renderer; the context-restore handler re-applies everything that matters when it returns.)
    if (this._contextLost) return false;
    if (this._meshReconcileDirty) this.reconcileMeshes();
    this.syncEntityViews(alpha);
    this.cam.follow(frameDt);
    syncContactShadowPool(this._contactShadowPool, this.state.entityList, this._meshes);
    syncAuthoredInstancePools(this.scene, { camera: this.cam.obj });
    this.starfield.recenter(this.cam.obj.position);
    // Background-clock for distant animation (planet cloud drift, hero-star twinkle). Integrates real
    // frame dt scaled by state.timeScale so the cosmos respects hit-stop/pause — a death freeze
    // momentarily stills the clouds too, keeping the backdrop in the same time model as the action.
    const ts = (this.state.timeScale != null) ? this.state.timeScale : 1;
    this._bgTime = (this._bgTime || 0) + frameDt * ts;
    if (this.starfield.update) this.starfield.update(frameDt, this._bgTime);
    this._updatePlanetParallax();
    this._syncShadowMapEnabled();
    // Shadow follow (graphics spec G): keep the key light's shadow frustum centered on the player
    // so the tight 1400-unit ortho box always covers the local action. DirectionalLight position is
    // an offset from its target; we move both together. No-op if shadows are disabled.
    this._updateShadowFollow();
    // Collision/socket/landing debug overlay (spec §12.5). Repositions pooled markers over the live
    // meshes once per frame; a cheap no-op when off (the group is hidden + nothing iterates).
    if (this.collisionDebug && this.collisionDebug.on) this.collisionDebug.update();
    return true;
  },

  drawPreparedFrame() {
    if (this._contextLost) return false;
    // Render path selection (INTEGRATION_MAP §8.1). The SpaceRenderGraph is a capability-aware HDR
    // pipeline (GTAO-lite ambient occlusion + multiscale bloom + ACES/grade composite) that
    // supersedes the monolithic bloom wrapper. It is opt-in behind settings.video.renderGraph so the
    // proven bloom path stays the default; the render graph module is no longer tree-shaken because
    // it is reachable from this live branch. The energy materials I wired write HDR radiance that the
    // render graph composites with contact-depth AO.
    if (this.state.settings.video.renderGraph && this._ensureRenderGraph()) {
      this._lastRenderPath = 'renderGraph';
      this._renderGraph.render(this.scene, this.cam.obj, { time: this._bgTime || 0 });
    } else if (this.bloom && this.state.settings.video.bloom !== false) {
      this._lastRenderPath = 'bloom';
      this.bloom.render(this.scene, this.cam.obj);
    } else {
      this._lastRenderPath = 'straight';
      this.renderer.render(this.scene, this.cam.obj);
    }
    return true;
  },

  renderFrame(alpha, frameDt) {
    if (!this.prepareFrame(alpha, frameDt)) return;
    this.drawPreparedFrame();
  },

  // Center the key light + its shadow camera on the player each frame. The light direction stays
  // fixed (60,140,40 offset); only the origin translates so shadows track the player across the
  // sector instead of being pinned to world (0,0,0) and clipping at the frustum edge.
  _updateShadowFollow() {
    if (!this._keyLight) return;
    if (!this.renderer.shadowMap || !this.renderer.shadowMap.enabled) return;
    const p = this.state.playerId ? (this.state.entities && this.state.entities.get(this.state.playerId)) : null;
    const px = p ? p.pos.x : 0, pz = p ? p.pos.z : 0;
    this._keyLight.position.set(px + 60, 140, pz + 40);
    this._keyLight.target.position.set(px, 0, pz);
    this._keyLight.target.updateMatrixWorld();
  },

  _syncShadowMapEnabled() {
    if (!this._keyLight || !this.renderer.shadowMap) return;
    if (!this._shadowSettingOn) {
      this.renderer.shadowMap.enabled = false;
      this._keyLight.castShadow = false;
      return;
    }
    if (this._shadowReceiversDirty) {
      let receivers = 0;
      this.scene.traverse((o) => { if (o && o.receiveShadow) receivers++; });
      this._shadowReceiverCount = receivers;
      this._shadowReceiversDirty = false;
    }
    const enabled = this._shadowReceiverCount > 0;
    this.renderer.shadowMap.enabled = enabled;
    this._keyLight.castShadow = enabled;
  },

  worldToScreen(v) {
    _pt.set(v.x, v.y || 0, v.z).project(this.cam.obj);
    return {
      x: (_pt.x * 0.5 + 0.5) * window.innerWidth,
      y: (-_pt.y * 0.5 + 0.5) * window.innerHeight,
      onScreen: _pt.z < 1 && Math.abs(_pt.x) <= 1 && Math.abs(_pt.y) <= 1,
    };
  },

  raycastToPlane(ndc) {
    _v2.set(ndc.x, ndc.y);
    _ray.setFromCamera(_v2, this.cam.obj);
    const hit = _ray.ray.intersectPlane(_plane, _pt);
    return hit ? { x: hit.x, z: hit.z } : { x: 0, z: 0 };
  },

  // World XZ of a named attachment socket on an entity's mesh, or null if the entity has no mesh or no
  // such socket. Used by VFX to originate weapon/mining/engine effects from authored hardware (spec
  // §9.9) instead of the entity center. Failure returns null so callers fall back to the payload origin.
  socketWorldPos(entityId, socketName) {
    const pose = this.socketWorldPose(entityId, socketName);
    return pose ? { x: pose.x, z: pose.z } : null;
  },

  socketWorldPose(entityId, socketName) {
    const m = this._meshes.get(entityId);
    if (!m) return null;
    let cache = m.userData.__socketCache;
    if (!cache) cache = m.userData.__socketCache = new Map();
    let socket = cache.get(socketName);
    if (socket === undefined) {
      socket = null;
      m.traverse((o) => { if (!socket && o.userData && o.userData.spacefaceSocket && o.name === socketName) socket = o; });
      cache.set(socketName, socket);
    }
    if (!socket) return null;
    socket.updateWorldMatrix(true, false);
    socket.matrixWorld.decompose(SOCKET_WORLD_POS, SOCKET_WORLD_QUAT, SOCKET_WORLD_SCALE);
    const authoredForward = socket.userData && socket.userData.forward || [1, 0, 0];
    const authoredForwardX = Array.isArray(authoredForward) ? authoredForward[0] : authoredForward.x;
    const authoredForwardY = Array.isArray(authoredForward) ? authoredForward[1] : authoredForward.y;
    const authoredForwardZ = Array.isArray(authoredForward) ? authoredForward[2] : authoredForward.z;
    SOCKET_FORWARD.set(
      Number.isFinite(authoredForwardX) ? authoredForwardX : 1,
      Number.isFinite(authoredForwardY) ? authoredForwardY : 0,
      Number.isFinite(authoredForwardZ) ? authoredForwardZ : 0,
    );
    if (SOCKET_FORWARD.lengthSq() < 1e-8) SOCKET_FORWARD.set(1, 0, 0);
    SOCKET_FORWARD.normalize().applyQuaternion(SOCKET_WORLD_QUAT).normalize();
    return {
      x: SOCKET_WORLD_POS.x,
      y: SOCKET_WORLD_POS.y,
      z: SOCKET_WORLD_POS.z,
      forwardX: SOCKET_FORWARD.x,
      forwardY: SOCKET_FORWARD.y,
      forwardZ: SOCKET_FORWARD.z,
    };
  },

  onResize() {
    const drawSize = applyRendererSize(this.renderer, this.state);
    if (this.bloom) this.bloom.setSize(drawSize.x, drawSize.y);
    if (this._renderGraph) this._renderGraph.setSize(drawSize.x, drawSize.y, this.renderer.getPixelRatio() || 1);
    this.cam.onResize();
    // Cache the CSS-pixel viewport for the LOD projector (projectedWidthPx expects CSS px, matching
    // the projected-width thresholds in spec §12.4). Drawing-buffer size carries devicePixelRatio.
    const dpr = this.renderer.getPixelRatio() || 1;
    this.viewport = { width: drawSize.x / dpr, height: drawSize.y / dpr };
  },

  // Lazily construct the SpaceRenderGraph only when its setting is on (it allocates GPU render
  // targets). Returns false if construction fails (e.g. a low-capability GPU) so the caller falls
  // back to bloom/straight-render. Options mirror the bloom/quality settings where they overlap.
  _ensureRenderGraph() {
    if (this._renderGraph) return true;
    if (this._renderGraphUnavailable) return false;
    try {
      const v = this.state.settings.video || {};
      const drawSize = this.viewport ? { x: this.viewport.width * (this.renderer.getPixelRatio() || 1), y: this.viewport.height * (this.renderer.getPixelRatio() || 1) } : { x: 1280, y: 720 };
      this._renderGraph = new SpaceRenderGraph(this.renderer, {
        enabled: true,
        ao: v.ao !== false,
        bloom: true,
        renderScale: Math.min(1, Math.max(0.5, v.renderScale || 0.7)),
        bloomStrength: v.bloomStrength != null ? v.bloomStrength : 0.9,
        bloomThreshold: v.bloomThreshold != null ? v.bloomThreshold : 0.65,
      });
      this._renderGraph.setSize(drawSize.x, drawSize.y, this.renderer.getPixelRatio() || 1);
      // Expose for diagnostics + the energy-materials depth binding path.
      this.state.render.renderGraph = this._renderGraph;
      return true;
    } catch (err) {
      console.warn('[render] SpaceRenderGraph unavailable, falling back to bloom:', err);
      this._renderGraphUnavailable = true;
      return false;
    }
  },
};

function applyRendererSize(renderer, state) {
  const vd = (state.settings && state.settings.video) || {};
  const cap = finiteInRange(vd.pixelRatioCap, 0.25, 4, 2);
  const scale = finiteInRange(vd.renderScale, 0.5, 2, 1);
  const base = Math.min(window.devicePixelRatio || 1, cap);
  renderer.setPixelRatio(Math.max(0.25, base * scale));
  renderer.setSize(window.innerWidth, window.innerHeight);
  return renderer.getDrawingBufferSize(_drawSize);
}

function finiteInRange(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function disposeObject(obj) {
  obj.traverse((c) => {
    if (c.isBatchedMesh && typeof c.dispose === 'function') c.dispose();
    else if (c.geometry && !(c.userData && (c.userData.sharedContactShadow || c.userData.sharedShieldGeo))) c.geometry.dispose();
    if (c.material && !(c.userData && c.userData.sharedContactShadow)) { const mm = Array.isArray(c.material) ? c.material : [c.material]; mm.forEach((m) => m.dispose()); }
  });
}


exec
"C:\\Users\\93rob\\AppData\\Local\\Microsoft\\WindowsApps\\pwsh.exe" -Command 'Get-Content package.json -Raw' in C:\Users\93rob\Documents\GitHub\SpaceFace
 succeeded in 2745ms:
// Deep-space backdrop: a parallax starfield of soft ROUND stars (procedural sprite texture, not
// the default square points) layered over a colored nebula backdrop built from the generated
// nebula art. Together they kill the "dead black void" and give real depth + atmosphere.
import * as THREE from 'three';
import { createPlanetFactory } from './planetFactory.js';

// Soft round star sprite (radial gradient -> circular, glowing). Square PointsMaterial points are
// the #1 reason a starfield looks cheap; this fixes it.
function makeStarSprite() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0.0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.32)');
  g.addColorStop(1.0, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Procedural deep-space nebula: a moodier cyberpunk-noir backdrop — deep indigo base + denser
// layered clouds in magenta/cyan/violet (the signature neon palette) + dust lanes + painted distant
// planets for real depth. Sector-tintable via the optional tint so each region of the galaxy reads
// with its own atmosphere (clean-blue core vs rust-red frontier vs violet lawless edge). Wide canvas
// so it wraps the skydome without obvious repetition. Accepts an optional {tint, planets} for variety.
function makeNebulaCanvas(opts = {}) {
  const W = 2048, H = 1024;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const tint = opts.tint || null; // optional hex string to shift the whole palette toward a sector mood
  const rnd = (() => { let s = 0x9e3779b9; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; })();

  // base vertical gradient (slightly lighter toward the "galactic plane" middle). Deep indigo for the
  // noir mood; tintable so a sector can lean rust/violet/teal.
  const base = ctx.createLinearGradient(0, 0, 0, H);
  base.addColorStop(0.0, '#04050c');
  base.addColorStop(0.45, tint ? shade('#0a1028', tint) : '#080d24');
  base.addColorStop(0.6, tint ? shade('#141a40', tint) : '#10183c');
  base.addColorStop(1.0, '#05060e');
  ctx.fillStyle = base; ctx.fillRect(0, 0, W, H);

  // cloud palette — magenta, violet, cyan, teal: the cyberpunk-noir neon signature. Tinted per-sector.
  const rawPalette = ['#5a3ec8', '#7a3aa0', '#2f6fe0', '#1f8f9a', '#c83a8a', '#3a8fc8', '#8a2fa0'];
  const palette = tint ? rawPalette.map((p) => blend(p, tint, 0.35)) : rawPalette;

  // DEEP broad washes first (huge, low-alpha) to establish the moody color field
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 24; i++) {
    const x = rnd() * W, y = H * (0.05 + rnd() * 0.9), r = 600 + rnd() * 700;
    const col = palette[(rnd() * palette.length) | 0];
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.05 + rnd() * 0.06;
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  // mid-size cloud blobs — the main readable structure
  for (let i = 0; i < 110; i++) {
    const x = rnd() * W, y = H * (0.05 + rnd() * 0.9), r = 140 + rnd() * 460;
    const col = palette[(rnd() * palette.length) | 0];
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.085 + rnd() * 0.15;
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  // dust lanes — dark winding streaks (source-over) that break up the clouds and add structure
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = 'rgba(2,3,8,0.4)'; ctx.lineCap = 'round';
  for (let i = 0; i < 14; i++) {
    const x0 = rnd() * W, y0 = rnd() * H;
    ctx.lineWidth = 30 + rnd() * 120;
    ctx.globalAlpha = 0.18 + rnd() * 0.3;
    ctx.beginPath(); ctx.moveTo(x0, y0);
    ctx.bezierCurveTo(x0 + (rnd() - 0.5) * W * 0.4, y0 + rnd() * H * 0.3,
                      x0 + (rnd() - 0.5) * W * 0.4, y0 + rnd() * H * 0.3,
                      x0 + (rnd() - 0.5) * W * 0.5, y0 + (rnd() - 0.5) * H * 0.5);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // bright cores for punch (back to additive)
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 22; i++) {
    const x = rnd() * W, y = H * (0.15 + rnd() * 0.7), r = 40 + rnd() * 130;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(180,210,255,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.2 + rnd() * 0.25; ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;

  // PAINTED DISTANT PLANETS — 2-3 for real backdrop depth (the system's drawPlanet, previously dead
  // code, now wired in). They read as giant far-off worlds, reinforcing the sense of a lived-in galaxy.
  if (opts.planets !== false) {
    const planetSpecs = [
      { cx: W * 0.20, cy: H * 0.30, r: 90,  bands: [[60,40,80],[40,30,70],[80,50,110]], atm: [120,80,200] },
      { cx: W * 0.82, cy: H * 0.66, r: 130, bands: [[30,50,70],[20,40,60],[50,90,110]], atm: [80,160,200] },
      { cx: W * 0.55, cy: H * 0.16, r: 55,  bands: [[90,50,40],[120,70,40],[70,40,30]], atm: [220,140,80] },
    ];
    for (const p of planetSpecs) {
      // place each planet deterministically with a stable light direction (upper-left)
      drawPlanet(ctx, p.cx, p.cy, p.r, p.bands, p.atm, -0.6, -0.5);
    }
  }

  // vignette: darken the edges so gameplay (always centered) stays high-contrast over the nebula
  const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.18, W / 2, H / 2, H * 0.72);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(2,3,9,0.7)');
  ctx.fillStyle = vig; ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1;
  return c;
}

// --- small color helpers for sector tinting (no deps) ---
function hexToRgb(hex) {
  const h = hex.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function rgbToHex(r, g, b) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return '#' + c(r) + c(g) + c(b);
}
// linear blend of two hex colors by t (0=a,1=b)
function blend(a, b, t) {
  const pa = hexToRgb(a), pb = hexToRgb(b);
  return rgbToHex(pa[0] + (pb[0] - pa[0]) * t, pa[1] + (pb[1] - pa[1]) * t, pa[2] + (pb[2] - pa[2]) * t);
}
// shift a base hex toward a tint hue (multiplies channels then normalizes) — used for sector mood
function shade(base, tint, amt = 0.3) { return blend(base, tint, amt); }


// Paint a shaded distant planet onto a 2D context: atmosphere rim, banded body, a lit crescent and
// a dark terminator. lx,ly = direction (in canvas space) toward the light source.
function drawPlanet(ctx, cx, cy, r, bands, atm, lx, ly) {
  ctx.save();
  // atmosphere rim glow (additive)
  ctx.globalCompositeOperation = 'lighter';
  const ag = ctx.createRadialGradient(cx, cy, r * 0.88, cx, cy, r * 1.32);
  ag.addColorStop(0, `rgba(${atm[0]},${atm[1]},${atm[2]},0)`);
  ag.addColorStop(0.55, `rgba(${atm[0]},${atm[1]},${atm[2]},0.16)`);
  ag.addColorStop(1, `rgba(${atm[0]},${atm[1]},${atm[2]},0)`);
  ctx.fillStyle = ag; ctx.beginPath(); ctx.arc(cx, cy, r * 1.32, 0, Math.PI * 2); ctx.fill();
  ctx.globalCompositeOperation = 'source-over';

  // body (clipped to the disc)
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = `rgb(${bands[0][0]},${bands[0][1]},${bands[0][2]})`;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  let y = cy - r;
  while (y < cy + r) {
    const bh = r * (0.04 + Math.random() * 0.16);
    const b = bands[(Math.random() * bands.length) | 0];
    ctx.globalAlpha = 0.5 + Math.random() * 0.4;
    ctx.fillStyle = `rgb(${b[0]},${b[1]},${b[2]})`;
    ctx.fillRect(cx - r, y, r * 2, bh + 1);
    y += bh;
  }
  ctx.globalAlpha = 1;
  // lit crescent: brighten toward the light, darken the far/terminator side
  const lit = ctx.createRadialGradient(cx + lx * r * 0.6, cy + ly * r * 0.6, r * 0.1, cx, cy, r * 1.25);
  lit.addColorStop(0, 'rgba(255,250,235,0.45)');
  lit.addColorStop(0.4, 'rgba(255,250,235,0.0)');
  lit.addColorStop(1, 'rgba(255,250,235,0)');
  ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = lit;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.globalCompositeOperation = 'source-over';
  const dark = ctx.createRadialGradient(cx - lx * r * 0.9, cy - ly * r * 0.9, r * 0.1, cx - lx * r * 0.4, cy - ly * r * 0.4, r * 1.8);
  dark.addColorStop(0, 'rgba(2,3,8,0.92)');
  dark.addColorStop(0.55, 'rgba(2,3,8,0.5)');
  dark.addColorStop(1, 'rgba(2,3,8,0)');
  ctx.fillStyle = dark; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.restore();
}

export function createStarfield(scene, opts = {}) {
  const layers = [];
  const sprite = makeStarSprite();
  let bgTexture = null;
  let currentTint = opts.tint || null;

  // star tints (mostly cool white/blue with a few warm + teal accents)
  const TINTS = [0xffffff, 0xcfe0ff, 0x9fb6e0, 0xfff0d8, 0x8af0d6, 0xbfd2ff];
  const specs = [
    { count: 2200, spread: 5200, yLo: -1600, yHi: -120, size: 5,  par: 0.94, opacity: 0.85 },
    { count: 1300, spread: 4200, yLo: -1200, yHi: -80,  size: 9,  par: 0.86, opacity: 0.95 },
    { count: 520,  spread: 3200, yLo: -900,  yHi: -40,  size: 16, par: 0.74, opacity: 1.0 },
    { count: 90,   spread: 2400, yLo: -700,  yHi: 60,   size: 34, par: 0.60, opacity: 0.9 }, // sparse bright "hero" stars
  ];

  for (const s of specs) {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(s.count * 3);
    const col = new Float32Array(s.count * 3);
    const tmp = new THREE.Color();
    for (let i = 0; i < s.count; i++) {
      pos[i * 3] = (Math.random() * 2 - 1) * s.spread;
      pos[i * 3 + 1] = s.yLo + Math.random() * (s.yHi - s.yLo);
      pos[i * 3 + 2] = (Math.random() * 2 - 1) * s.spread;
      tmp.setHex(TINTS[(Math.random() * TINTS.length) | 0]);
      // vary brightness so the field isn't uniform
      const b = 0.45 + Math.random() * 0.55;
      col[i * 3] = tmp.r * b; col[i * 3 + 1] = tmp.g * b; col[i * 3 + 2] = tmp.b * b;
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.PointsMaterial({
      map: sprite, size: s.size, sizeAttenuation: true, vertexColors: true,
      transparent: true, opacity: s.opacity, depthWrite: false,
      blending: THREE.AdditiveBlending, fog: false,
    });
    const pts = new THREE.Points(g, m);
    pts.frustumCulled = false; pts.renderOrder = -10;
    scene.add(pts);
    // GR-7: tag the hero-star layer (last spec) so update() can shimmer it. The base opacity is kept
    // so the twinkle modulates around the authored brightness rather than replacing it.
    const rec = { pts, par: s.par, baseOpacity: s.opacity };
    if (s === specs[specs.length - 1]) rec.hero = true;
    layers.push(rec);
  }

  // ---- nebula backdrop (with painted distant planets) ------------------------------------------
  // A PROCEDURAL moody nebula (magenta/violet/cyan neon clouds + dust lanes + painted planets on
  // deep indigo) set as scene.background, so it reliably fills the whole frame with no seams. The
  // parallax star layers above sell the motion. Sector-tintable so each region of the galaxy has
  // its own atmosphere (clean-blue core vs rust-red frontier vs violet lawless edge).
  function applyBackground(tint) {
    try {
      const tex = new THREE.CanvasTexture(makeNebulaCanvas({ tint }));
      tex.colorSpace = THREE.SRGBColorSpace;
      if (bgTexture) bgTexture.dispose();
      bgTexture = tex;
      scene.background = tex;
    } catch (_) { /* nebula optional */ }
  }
  applyBackground(currentTint);

  // ---- GR-7: real 3D distant planets -----------------------------------------------------------
  // A few genuine 3D planet meshes (built by the planet factory) placed at huge distance, parallaxing
  // with the starfield. Unlike the 2D painted planets baked into the nebula canvas, these rotate, catch
  // real fresnel atmosphere shells, and shift against the stars as you fly — selling true galactic
  // depth. Kept to 2-3 small worlds so the cost is negligible; fog is off so they survive the distance.
  const distantPlanets = [];
  if (opts.distantPlanets !== false) {
    try {
      const pf = createPlanetFactory();
      const rnd = (() => { let s = 0x1234abcd; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; })();
      const types = ['gas_giant', 'terran', 'ice', 'arid', 'rocky'];
      const n = 2 + (rnd() < 0.5 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const type = types[(rnd() * types.length) | 0];
        const radius = 180 + rnd() * 260;
        const seed = (rnd() * 99999) | 0;
        const mesh = pf.buildPlanetMesh(type, radius, seed);
        const spread = 6000 + rnd() * 3000;
        const ang = rnd() * Math.PI * 2;
        mesh.position.set(
          Math.cos(ang) * spread,
          -(600 + rnd() * 1200),
          Math.sin(ang) * spread
        );
        mesh.frustumCulled = false;
        scene.add(mesh);
        distantPlanets.push({
          mesh,
          basePos: mesh.position.clone(),
          parallax: 0.96,   // nearly fixed -> appears extremely far, just creeping vs the stars
          spin: 0.01 + rnd() * 0.02,
        });
      }
    } catch (_) { /* distant 3D planets are optional polish */ }
  }

  return {
    recenter(camPos) {
      for (const L of layers) {
        L.pts.position.x = camPos.x * (1 - L.par);
        L.pts.position.z = camPos.z * (1 - L.par);
      }
      // GR-7: distant 3D planets parallax with the starfield (very low factor = appear extremely far).
      for (const p of distantPlanets) {
        p.mesh.position.x = p.basePos.x + camPos.x * (1 - p.parallax);
        p.mesh.position.z = p.basePos.z + camPos.z * (1 - p.parallax);
      }
    },
    // GR-7: per-frame twinkle for the hero-star layer. A slow sinusoidal shimmer on the brightest stars
    // so the backdrop feels alive (atmospheric scintillation) instead of a frozen field. Cheap: one
    // material.opacity write per frame.
    update(dt, time) {
      const hero = layers[layers.length - 1];
      if (hero && hero.hero) {
        hero.pts.material.opacity = hero.baseOpacity * (0.8 + 0.2 * Math.sin(time * 1.7));
      }
      // GR-7: slow-rotate the distant 3D planets so they read as real spinning worlds, not billboards.
      for (const p of distantPlanets) p.mesh.rotation.y += dt * p.spin;
    },
    // Swap the nebula mood on sector enter — each region of the galaxy reads with its own color
    // signature (core = clean blue, industrial = rust/amber, frontier = blood-red, alien = violet).
    setSectorTint(tint) {
      if (tint === currentTint) return;
      currentTint = tint || null;
      applyBackground(currentTint);
    },
    setWarp() { /* extended by vfx during jump */ },
  };
}


 succeeded in 2570ms:
{
  "name": "spaceface",
  "version": "0.1.0",
  "description": "SpaceFace — a semi-3D top-down space trading/combat/mining game (Three.js).",
  "type": "module",
  "main": "electron/main.cjs",
  "scripts": {
    "start": "node server.js",
    "serve": "node server.js 8123",
    "electron": "electron .",
    "dist": "npm run build:bundle && electron-builder",
    "sf": "node scripts/sf.mjs",
    "check:contracts": "node scripts/sf.mjs validate test/47a.inputs.json test/47a.telemetry.expected.json src/data/scenarios/47a.scenario.json",
    "check:replay": "node scripts/sf.mjs replay verify test/47a.inputs.json --seed 47 --ticks 720 --expect test/47a.telemetry.expected.json --hash --repeat 20 --reload-at 600",
    "check:sim": "node scripts/sf-sim.mjs run 47a --seed 47 --ticks 720 --inputs test/47a.inputs.json --expect test/47a.telemetry.expected.json --hash --repeat 20 --reload-at 600",
    "check:sim:compare": "node scripts/sf-sim.mjs compare 47a --seed 47 --ticks 720 --inputs test/47a.inputs.json --expect test/47a.telemetry.expected.json --reload-at 600",
    "check:sim:dynamic": "node scripts/sf-sim.mjs compare 47a --seed 47 --ticks 720 --inputs test/47a.inputs.json --expect test/47a.telemetry.expected.json --reload-at 600",
    "check:sim:profile": "node scripts/sf-sim.mjs profile 47a --seed 47 --ticks 720 --inputs test/47a.inputs.json --expect test/47a.telemetry.expected.json",
    "check:sim:long": "node scripts/sf-sim.mjs run 47a --seed 47 --ticks 36120 --inputs test/47a.inputs.json --hash",
    "check:sim:long:compare": "node scripts/sf-sim.mjs compare 47a --seed 47 --ticks 36120 --inputs test/47a.inputs.json --reload-at 12000",
    "check:sim:v3": "node scripts/sf-sim.mjs run 47a --seed 47 --ticks 720 --inputs test/47a.inputs.json --expect test/47a.telemetry.v3.expected.json --hash --repeat 20 --reload-at 600 --flight-system v3",
    "check:sim:v3:compare": "node scripts/sf-sim.mjs compare 47a --seed 47 --ticks 720 --inputs test/47a.inputs.json --expect test/47a.telemetry.v3.expected.json --reload-at 600 --flight-system v3",
    "check:47a:tactics": "node scripts/check-47a-tactics.mjs",
    "check:47a:live-branch": "node scripts/check-47a-live-branch-predicate.mjs",
    "check:47a:live-cold-open": "node scripts/check-47a-live-cold-open.mjs",
    "check:47a:counterplay": "node scripts/check-47a-counter-tether-live.mjs",
    "check:47a:death-retry": "node scripts/check-47a-death-retry.mjs",
    "check:gameover-recovery-copy": "node scripts/check-gameover-recovery-copy.mjs",
    "check:47a:visuals": "node scripts/check-47a-visual-assets.mjs",
    "check:slice-scope": "node scripts/check-slice-scope.mjs",
    "check:balance": "node scripts/balance-sim.mjs",
    "check:presentation": "node scripts/check-presentation-cues.mjs && node scripts/check-sg08-golden-trace.mjs && node scripts/check-sg08-mix-profile.mjs && node scripts/check-sg08-render-vfx.mjs",
    "check:camera": "node scripts/check-camera-composition.mjs",
    "check:sg05": "node scripts/check-sg05-scenario.mjs && node scripts/check-sg05-runtime.mjs && node scripts/check-sg05-branch-policies.mjs && node scripts/check-sg05-ui-lifecycle.mjs",
    "check:sg02:intake": "node scripts/check-sg02-intake.mjs",
    "check:physics-authority": "node scripts/check-physics-authority.mjs",
    "check:sg02:dynamic-lab": "node scripts/check-sg02-dynamic-body-owner.mjs",
    "check:sg02:authority": "node scripts/check-sg02-authority.mjs",
    "check:sg02:production-combat": "node scripts/check-sg02-production-combat-port.mjs",
    "check:sg02:tether": "node scripts/check-sg02-tether.mjs",
    "check:sg02:tether-break": "node scripts/check-sg02-tether-break.mjs",
    "check:sg02:dash-collision": "node scripts/check-sg02-dash-collision.mjs",
    "check:sg02:save-reload": "node scripts/check-sg02-save-reload.mjs",
    "check:sg02": "npm run check:sg02:intake && npm run check:physics-authority && npm run check:sg02:dynamic-lab && node scripts/check-sg02-authority.mjs && node scripts/check-sg02-production-combat-port.mjs && node scripts/check-sg02-tether.mjs && node scripts/check-sg02-tether-break.mjs && node scripts/check-sg02-dash-collision.mjs && node scripts/check-sg02-save-reload.mjs && npm run check:sim:dynamic",
    "check:sg06:intake": "node scripts/check-sg06-intake.mjs",
    "check:sg06:production-ports": "node scripts/check-sg06-production-ports.mjs",
    "check:sg06:encounter-sink": "node scripts/check-sg06-encounter-sink.mjs",
    "check:sg06:encounter-owner": "node scripts/check-sg06-encounter-owner.mjs",
    "check:sg06:live-shadow": "node scripts/check-sg06-live-shadow.mjs",
    "check:sg06:registry-init": "node scripts/check-sg06-registry-init.mjs",
    "check:sg06:live-registry": "node scripts/check-sg06-live-registry.mjs",
    "check:sg06:tether-break": "node scripts/check-sg06-live-tether-break.mjs",
    "check:sg06:formation": "node scripts/check-sg06-rapier-formation-convergence.mjs",
    "check:sg06:ai": "node scripts/check-sg06-ai.mjs --runs=100 --ticks=600",
    "check:ai": "npm run check:sg06:ai",
    "check:sg06": "npm run check:sg06:intake && npm run check:sg06:production-ports && npm run check:sg06:encounter-sink && npm run check:sg06:encounter-owner && npm run check:sg06:live-shadow && npm run check:sg06:registry-init && npm run check:sg06:live-registry && npm run check:sg06:tether-break && npm run check:sg06:formation && npm run check:sg06:ai",
    "check:sg03:save-reload": "node scripts/check-sg03-save-reload.mjs",
    "check:save-resume-confidence": "node scripts/check-save-resume-confidence.mjs",
    "check:title-continue-runtime": "node scripts/check-title-continue-runtime.mjs",
    "check:save-load-slot-trust": "node scripts/check-save-load-slot-trust.mjs",
    "check:settings-profile": "node scripts/check-settings-profile-persistence.mjs",
    "check:controls-discoverability": "node scripts/check-controls-discoverability.mjs",
    "check:cargo-jettison-copy": "node scripts/check-cargo-jettison-copy.mjs",
    "check:player-facing-labels": "node scripts/check-player-facing-labels.mjs",
    "check:new-game-first-run": "node scripts/check-new-game-first-run-rail.mjs",
    "check:pause-brief": "node scripts/check-pause-brief.mjs",
    "check:confirm-dialog": "node scripts/check-confirm-dialog-safety.mjs",
    "check:departure-prompts": "node scripts/check-departure-check-prompts.mjs",
    "check:first-dock-handoff": "node scripts/check-first-dock-handoff.mjs",
    "check:first-15-runtime": "node scripts/check-first-15-runtime.mjs",
    "check:combat": "node scripts/check-combat-grammar.mjs && npm run check:sg03:save-reload",
    "bench:combat": "node scripts/bench-combat.mjs",
    "build:sg04:release-assets": "node scripts/build-sg04-release-assets.mjs",
    "build:bundle": "node scripts/build-bundle.mjs",
    "check:bundle": "node scripts/check-bundle.mjs",
    "check:launch-policy": "node scripts/check-launch-policy.mjs",
    "check:non-graphics": "node scripts/check-non-graphics-ci.mjs",
    "check:assets:live": "node scripts/probe-authored-assets-live.mjs",
    "check:perf:control": "node scripts/probe-raf-control.mjs --headed --strict --width 1830 --height 973 --warmup 1000 --duration 5000",
    "check:perf": "node scripts/probe-performance-profile.mjs --headed --strict --width 1830 --height 973 --warmup 2500 --duration 7000 --diagnostic-variants",
    "check:hitch-budget": "node scripts/check-hitch-budget.mjs",
    "check:radar:perf": "node scripts/check-radar-perf.mjs",
    "check:ui:perf": "node scripts/check-ui-frame-sleep.mjs && npm run check:radar:perf",
    "check:bar:narrative": "node scripts/check-bar-canonical-contacts.mjs",
    "check:bar:mission-readiness": "node scripts/check-bar-mission-readiness-live.mjs",
    "check:station-departure": "node scripts/check-station-departure-readiness.mjs",
    "check:station-egress": "node scripts/check-station-egress-runtime.mjs",
    "check:station-tabs": "node scripts/check-station-tab-navigation-runtime.mjs",
    "check:station-interact-undock": "node scripts/check-station-interact-undock.mjs",
    "check:faction-standings": "node scripts/check-faction-standings-guidance.mjs",
    "check:mission-standing-ladder": "node scripts/check-mission-standing-ladder.mjs",
    "check:manufacture-guidance": "node scripts/check-manufacture-guidance.mjs",
    "check:crafting-guidance": "node scripts/check-crafting-guidance.mjs",
    "check:services-readiness": "node scripts/check-services-readiness.mjs",
    "check:outfitting-buy-fit": "node scripts/check-outfitting-buy-fit.mjs",
    "check:shipyard-guidance": "node scripts/check-shipyard-guidance.mjs",
    "check:ship-purchase-guidance": "node scripts/check-ship-purchase-guidance.mjs",
    "check:mission-board-recommendation": "node scripts/check-mission-board-recommendation.mjs",
    "check:mission-preflight": "node scripts/check-mission-preflight.mjs",
    "check:mission-handoff": "node scripts/check-mission-accept-handoff-runtime.mjs",
    "check:mission-cargo-loading": "node scripts/check-mission-cargo-loading-runtime.mjs",
    "check:mission-navigation": "node scripts/check-mission-navigation.mjs",
    "check:starmap-objective": "node scripts/check-starmap-objective-handoff.mjs",
    "check:mission-log-map": "node scripts/check-mission-log-map-handoff.mjs",
    "check:mission-log-map:runtime": "node scripts/check-mission-log-map-runtime.mjs",
    "check:mission-log-contract-terms": "node scripts/check-mission-log-contract-terms.mjs",
    "check:mission-receipts": "node scripts/check-mission-receipt-ledger.mjs",
    "check:automation-board": "node scripts/check-automation-ops-board.mjs",
    "check:automation-board:runtime": "node scripts/check-automation-board-runtime.mjs",
    "check:recommended-next": "node scripts/check-recommended-next-action.mjs",
    "check:tech-tree-guidance": "node scripts/check-tech-tree-guidance.mjs",
    "check:tech-display-names": "node scripts/check-tech-display-names.mjs",
    "check:market-nav": "node scripts/check-market-navigation.mjs",
    "check:market-first-loop": "node scripts/check-market-first-loop-runtime.mjs",
    "check:localmap-routes": "node scripts/check-localmap-route-metrics.mjs",
    "check:claim-base": "node scripts/check-claim-base-input.mjs",
    "check:base-build-guidance": "node scripts/check-base-build-guidance.mjs",
    "check:claims-guidance": "node scripts/check-claims-guidance.mjs",
    "check:flight:v3": "node test/flightV3.spec.mjs",
    "check:flight": "node test/flightV3.spec.mjs && node scripts/flight-lab-sim.mjs && node scripts/probe-flight-visual.mjs",
    "check:flight:clean": "node test/flightV3.spec.mjs && node scripts/flight-lab-sim.mjs && node scripts/probe-flight-visual.mjs --clean-runs 5 --strict-warnings --no-write",
    "check:art": "node scripts/check-kestrel-asset.mjs && node scripts/check-parts-manifest.mjs && node scripts/check-sg04-release-assets.mjs && node scripts/check-kestrel-hero.mjs && node scripts/check-kestrel-silhouette.mjs && node scripts/check-kestrel-damage.mjs && node scripts/check-kestrel-leak.mjs && node scripts/check-lod.mjs && node scripts/check-collision-debug.mjs && node scripts/check-concord-patrol.mjs && node scripts/check-reaver-pirate.mjs && node scripts/check-faction-ships.mjs && npm run check:47a:visuals",
    "check": "npm run check:launch-policy && node scripts/check-data.mjs && node scripts/check-data-refs.mjs && npm run check:balance && npm run check:sg02 && npm run check:sg05 && npm run check:sg06 && npm run check:combat && npm run check:save-resume-confidence && npm run check:title-continue-runtime && npm run check:save-load-slot-trust && npm run check:settings-profile && npm run check:controls-discoverability && npm run check:cargo-jettison-copy && npm run check:player-facing-labels && npm run check:new-game-first-run && npm run check:pause-brief && npm run check:confirm-dialog && node scripts/check-ui-screen-imports.mjs && node scripts/check-ui-a11y.mjs && npm run check:ui:perf && npm run check:bar:narrative && npm run check:bar:mission-readiness && npm run check:station-departure && npm run check:station-egress && npm run check:station-tabs && npm run check:station-interact-undock && npm run check:faction-standings && npm run check:mission-standing-ladder && npm run check:manufacture-guidance && npm run check:crafting-guidance && npm run check:services-readiness && npm run check:outfitting-buy-fit && npm run check:shipyard-guidance && npm run check:ship-purchase-guidance && node scripts/check-codex-narrative.mjs && node scripts/check-wcag-contrast.mjs && node scripts/check-input-modalities.mjs && node scripts/check-countermeasures.mjs && node scripts/check-onboarding.mjs && npm run check:first-dock-handoff && npm run check:departure-prompts && npm run check:mission-board-recommendation && npm run check:mission-preflight && npm run check:mission-handoff && npm run check:mission-cargo-loading && npm run check:mission-navigation && npm run check:starmap-objective && npm run check:mission-log-map && npm run check:mission-log-contract-terms && npm run check:mission-receipts && npm run check:automation-board && npm run check:recommended-next && npm run check:tech-tree-guidance && npm run check:tech-display-names && npm run check:first-15-runtime && npm run check:market-nav && npm run check:market-first-loop && npm run check:localmap-routes && npm run check:claim-base && npm run check:base-build-guidance && npm run check:claims-guidance && node scripts/check-wingmen.mjs && npm run check:contracts && npm run check:replay && npm run check:presentation && npm run check:camera && node scripts/check-gameplay-core.mjs && npm run check:sim && npm run check:sim:compare && npm run check:sim:profile && npm run check:sim:long && npm run check:sim:long:compare && npm run check:47a:tactics && npm run check:47a:live-branch && npm run check:47a:live-cold-open && npm run check:47a:counterplay && npm run check:47a:death-retry && npm run check:gameover-recovery-copy && npm run check:slice-scope && node scripts/check-phase0-slice-contract.mjs && npm run check:flight:v3 && npm run check:flight:clean && node scripts/check-sectorSim.mjs && npm run check:art && npm run check:bundle",
    "check:ci": "npm run check:launch-policy && node scripts/check-data.mjs && node scripts/check-data-refs.mjs && npm run check:balance && npm run check:sg02 && npm run check:sg05 && npm run check:sg06 && npm run check:combat && npm run check:save-resume-confidence && npm run check:title-continue-runtime && npm run check:save-load-slot-trust && npm run check:settings-profile && npm run check:controls-discoverability && npm run check:cargo-jettison-copy && npm run check:player-facing-labels && npm run check:new-game-first-run && npm run check:pause-brief && npm run check:confirm-dialog && node scripts/check-ui-screen-imports.mjs && node scripts/check-ui-a11y.mjs && npm run check:ui:perf && npm run check:bar:narrative && npm run check:bar:mission-readiness && npm run check:station-departure && npm run check:station-egress && npm run check:station-tabs && npm run check:station-interact-undock && npm run check:faction-standings && npm run check:mission-standing-ladder && npm run check:manufacture-guidance && npm run check:crafting-guidance && npm run check:services-readiness && npm run check:outfitting-buy-fit && npm run check:shipyard-guidance && npm run check:ship-purchase-guidance && node scripts/check-codex-narrative.mjs && node scripts/check-wcag-contrast.mjs && node scripts/check-input-modalities.mjs && node scripts/check-countermeasures.mjs && node scripts/check-onboarding.mjs && npm run check:first-dock-handoff && npm run check:departure-prompts && npm run check:mission-board-recommendation && npm run check:mission-preflight && npm run check:mission-handoff && npm run check:mission-cargo-loading && npm run check:mission-navigation && npm run check:starmap-objective && npm run check:mission-log-map && npm run check:mission-log-contract-terms && npm run check:mission-receipts && npm run check:automation-board && npm run check:recommended-next && npm run check:tech-tree-guidance && npm run check:tech-display-names && npm run check:first-15-runtime && npm run check:market-nav && npm run check:market-first-loop && npm run check:localmap-routes && npm run check:claim-base && npm run check:base-build-guidance && npm run check:claims-guidance && node scripts/check-wingmen.mjs && npm run check:contracts && npm run check:replay && npm run check:presentation && npm run check:camera && node scripts/check-gameplay-core.mjs && npm run check:sim && npm run check:sim:compare && npm run check:sim:profile && npm run check:sim:long && npm run check:sim:long:compare && npm run check:sim:v3 && npm run check:47a:tactics && npm run check:47a:live-branch && npm run check:47a:counterplay && npm run check:47a:death-retry && npm run check:gameover-recovery-copy && npm run check:slice-scope && node scripts/check-phase0-slice-contract.mjs && node scripts/check-sectorSim.mjs && npm run check:art && npm run check:bundle"
  },
  "private": true,
  "devDependencies": {
    "@gltf-transform/core": "^4.4.0",
    "@gltf-transform/extensions": "^4.4.0",
    "@gltf-transform/functions": "^4.4.0",
    "electron": "^31.3.0",
    "electron-builder": "^24.13.3",
    "esbuild": "^0.28.1",
    "ktx2-encoder": "^0.5.3",
    "meshoptimizer": "^1.1.1",
    "playwright": "^1.61.1",
    "pngjs": "^7.0.0"
  },
  "build": {
    "appId": "com.spaceface.game",
    "productName": "SpaceFace",
    "directories": {
      "output": "dist"
    },
    "files": [
      "build/web/**",
      "electron/**",
      "package.json",
      "assets/cinematics/**",
      "assets/ui/**",
      "assets/ships/**"
    ],
    "win": {
      "target": "nsis",
      "artifactName": "SpaceFace-Setup-${version}.${ext}"
    },
    "mac": {
      "target": "dmg"
    },
    "linux": {
      "target": "AppImage"
    }
  },
  "dependencies": {
    "@dimforge/rapier3d-compat": "0.19.3",
    "three": "0.184.0"
  }
}


codex
One thing worth naming: Blender is running on this machine, but the lead’s addendum explicitly redirects the graphics lane to this task. I’m still checking whether that process is tied to SpaceFace asset export; I won’t touch assets either way, and the requested patch stays in data/render wiring plus validation.
exec
"C:\\Users\\93rob\\AppData\\Local\\Microsoft\\WindowsApps\\pwsh.exe" -Command "Get-CimInstance Win32_Process -Filter \"Name = 'blender.exe' OR Name = 'blender-mcp.exe' OR Name = 'python.exe'\" | Select-Object ProcessId,Name,CommandLine,CreationDate | Format-List" in C:\Users\93rob\Documents\GitHub\SpaceFace
exec
"C:\\Users\\93rob\\AppData\\Local\\Microsoft\\WindowsApps\\pwsh.exe" -Command '$lines = Get-Content design'"\\GDD_2_0.md; "'$start=255; $end=276; for ($i=$start; $i -le $end; $i++) { '"'{0}:{1}' -f ("'$i+1), $lines[$i] }' in C:\Users\93rob\Documents\GitHub\SpaceFace
exec
"C:\\Users\\93rob\\AppData\\Local\\Microsoft\\WindowsApps\\pwsh.exe" -Command "rg -n \"jump:arrive|sector load|currentSector|sectorNebulaTint|setSectorTint|fog|AmbientLight|DirectionalLight|state\\.render\" src\\render\\renderer.js" in C:\Users\93rob\Documents\GitHub\SpaceFace
 succeeded in 2905ms:

ProcessId    : 2672
Name         : blender.exe
CommandLine  : "C:\Program Files\Blender Foundation\Blender 5.1\blender.exe" 
CreationDate : 7/3/2026 8:07:06 PM

ProcessId    : 33904
Name         : blender-mcp.exe
CommandLine  : "C:\Users\93rob\AppData\Roaming\Claude\Claude 
               Extensions\ant.dir.gh.blender.blender-mcp\.venv\Scripts\blender-mcp.exe"
CreationDate : 7/3/2026 8:12:04 PM

ProcessId    : 25488
Name         : python.exe
CommandLine  : "C:\Users\93rob\AppData\Roaming\Claude\Claude 
               Extensions\ant.dir.gh.blender.blender-mcp\.venv\Scripts\python.exe" 
               "C:\Users\93rob\AppData\Roaming\Claude\Claude 
               Extensions\ant.dir.gh.blender.blender-mcp\.venv\Scripts\blender-mcp.exe"
CreationDate : 7/3/2026 8:12:04 PM

ProcessId    : 22284
Name         : python.exe
CommandLine  : "C:\Users\93rob\AppData\Roaming\uv\python\cpython-3.13-windows-x86_64-none\python.exe"  
               "C:\Users\93rob\AppData\Roaming\Claude\Claude 
               Extensions\ant.dir.gh.blender.blender-mcp\.venv\Scripts\blender-mcp.exe"
CreationDate : 7/3/2026 8:12:04 PM


 succeeded in 1516ms:
256:### 9.1 Parallax depth stack (the "background has no depth" fix)
257:Between backdrop and play plane, add camera-relative parallax layers (all cheap, all pooled):
258:1. Skydome nebula (exists) — parallax ~0.
259:2. **Far dust sheets** (2–3 additive planes, factor 0.15–0.3) — huge soft nebula wisps.
260:3. **Mid debris field** (instanced micro-rocks/motes, factor 0.5–0.7) — occasional slow tumble.
261:4. **Near dust motes** (factor 1.2–1.5, subtle) — the layer that *sells speed* during boost/cruise.
262:5. Play plane: ships, asteroids, stations (contact shadows already ground them).
263:Boost/cruise stretch near-mote streaks (classic warp-speed read). Motion-reduce halves densities.
264:
265:### 9.2 Sector identity (data-driven palettes)
266:Lighting recon scored palette data-driveness 2/5 — fix: per-sector `palette` block in `sectors.js`
267:(key/rim/fill light colors + nebula tint + fog color + dust hue). Core worlds: clean cyan/steel.
268:Mining belts: rust/amber haze. Pirate fringes: sodium-red murk. Anomaly space: violet/green wrongness.
269:One glance at the screen tells you *where you are* — that's Freelancer's system-identity trick.
270:
271:### 9.3 Readability pass
272:- Ships get faction-hue rim-light + engine glow; hostiles carry warm signatures, friendlies cool
273:  (redundant with IFF glyphs for colorblind safety — palette already built in `accessibility.js`).
274:- The ambiguous giant translucent spheres (planet atmospheres?) get horizon-line treatment + label
275:  on approach; nothing on screen may be unidentifiable for more than one second (pillar 2).
276:- Bloom: selective on emissives only (engines, seams, tether, weapon cores). Current threshold 0.65
277:  is close; audit per-material emissive intensities instead of cranking post.

exec
"C:\\Users\\93rob\\AppData\\Local\\Microsoft\\WindowsApps\\pwsh.exe" -Command "rg -n \"currentSector|sectorId|jump:arrive|jump\" src\\core src\\systems src\\main.js src\\data scripts | Select-Object -First 200" in C:\Users\93rob\Documents\GitHub\SpaceFace
 succeeded in 2603ms:
22:function sectorNebulaTint(sector) {
182:    // Thin fog for gentle depth cueing only — the old 0.00085 erased the entire backdrop, leaving a
184:    scene.fog = new THREE.FogExp2(0x0a1430, 0.00026);
185:    scene.add(new THREE.AmbientLight(0x42506f, 0.85));
186:    const key = new THREE.DirectionalLight(0xcfe2ff, 1.7); key.position.set(60, 140, 40); scene.add(key);
187:    const rim = new THREE.DirectionalLight(0x6a5cff, 0.7); rim.position.set(-70, 50, -60); scene.add(rim);
188:    const fill = new THREE.DirectionalLight(0x39d0ff, 0.35); fill.position.set(20, 30, 120); scene.add(fill);
225:    // envMap is exposed on state.render for the visual factory to attach to high-metalness hulls.
291:    state.render.authoredPartLibraryReady = this.authoredPartLibraryReady;
305:    // the render system handle (state.render.debug.toggle) — wired to F7 in ui/input.js.
344:      state.render.diagnostics = this.diag;
348:    state.render.scene = scene;
349:    state.render.renderer = renderer;
350:    state.render.camera = cam.obj;
351:    state.render.cameraCtrl = cam;   // controller (addTrauma/pushZoom) — exposed for feel.js / ui
352:    state.render.vf = vf;   // exposed for the dev-only ship turntable preview (shipPreview.js)
353:    state.render.warmPostProcess = () => (this.bloom && state.settings.video.bloom !== false ? this.bloom.render(scene, cam.obj) : renderer.render(scene, cam.obj));
358:    state.render.debug = {
402:        const camObj = state.render.camera;
420:      if (this.starfield && this.starfield.setSectorTint) {
421:        this.starfield.setSectorTint(sectorNebulaTint(sector));
459:      state.render.envMap = envMap;
727:    // so the tight 1400-unit ortho box always covers the local action. DirectionalLight position is
882:      this.state.render.renderGraph = this._renderGraph;

exec
"C:\\Users\\93rob\\AppData\\Local\\Microsoft\\WindowsApps\\pwsh.exe" -Command "Get-Content scripts\\check-data.mjs -Raw" in C:\Users\93rob\Documents\GitHub\SpaceFace
exec
"C:\\Users\\93rob\\AppData\\Local\\Microsoft\\WindowsApps\\pwsh.exe" -Command "Get-ChildItem scripts\\check-*.mjs | Select-Object -First 30 Name | Format-Table -AutoSize" in C:\Users\93rob\Documents\GitHub\SpaceFace
 succeeded in 3235ms:
// Verifies every canonical data module imports cleanly in Node (no three/DOM deps) and exposes
// its required named exports. Run: `node scripts/check-data.mjs` (exit 1 on any failure).
const checks = [
  ['../src/data/saveVersion.js', ['CURRENT_VERSION']],
  ['../src/data/ships.js', ['SHIPS']],
  ['../src/data/weapons.js', ['WEAPONS']],
  ['../src/data/modules.js', ['MODULES']],
  ['../src/data/tech.js', ['TECH_NODES']],
  ['../src/data/commodities.js', ['COMMODITIES']],
  ['../src/data/mining.js', ['ORES', 'ASTEROIDS', 'BEAMS', 'RECIPES', 'FIELDS']],
  ['../src/data/sectors.js', ['SECTORS', 'STATION_TYPES', 'HAZARD_TYPES', 'POI_TYPES', 'dangerTier']],
  ['../src/data/factions.js', ['FACTION_META']],
  ['../src/data/missions.js', ['MISSION_TYPES', 'STORY_BEATS', 'OFFER_MIX', 'MISSION_TUNING']],
  ['../src/data/automation.js', ['DRONES', 'TRADERS', 'OUTPOSTS', 'AUTO_BALANCE']],
  ['../src/data/enemies.js', ['ENEMY_TYPES']],
  ['../src/data/audioRecipes.js', ['RECIPES', 'MUSIC_STEMS']],
  ['../src/data/palettes.js', ['FACTION_PALETTES', 'SECTOR_PALETTES', 'SHIP_RECIPES']],
  ['../src/data/newGameDefaults.js', ['NEW_GAME']],
  ['../src/data/combatDefs.js', ['ACTION_DEFS', 'STATUS_DEFS', 'SUBSYSTEM_DEFS', 'ATTACHMENT_DEFS', 'COMBAT_PROFILES']],
];

let ok = 0, fail = 0;
for (const [path, names] of checks) {
  try {
    const m = await import(path);
    const missing = names.filter((e) => !(e in m));
    if (missing.length) { console.log(`FAIL ${path} — missing exports: ${missing.join(', ')}`); fail++; continue; }
    const counts = names.map((e) => {
      const v = m[e];
      const n = Array.isArray(v) ? v.length : (v && typeof v === 'object' ? Object.keys(v).length : typeof v);
      return `${e}:${n}`;
    }).join('  ');
    console.log(`ok   ${path} — ${counts}`); ok++;
  } catch (err) {
    console.log(`ERR  ${path} — ${err.message}`); fail++;
  }
}
console.log(`\n${ok} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);


 succeeded in 5732ms:
src\main.js:355:  state.jump = fresh.jump;
src\systems\claims.js:17:// context exists). The body's sectorId + POI id are stable seeds so the claim re-attaches to the
src\systems\claims.js:46:    // state.claims: { bodies: [{ id, sectorId, poiId, name, size, slots, modules:[modId|null], linkedStationId, x, z }] }
src\systems\claims.js:72:      sectorId: this.state.world && this.state.world.currentSectorId,
src\systems\claims.js:128:  // lane-collapser in action. Returns true if the jump happened.
src\systems\claims.js:135:    // route through the world system's jump-to-station path if available
src\systems\claims.js:137:    this.bus.emit('toast', { text: 'Quantum jump engaged → ' + (this._stationName(body.linkedStationId) || 'station'), kind: 'info', ttl: 3 });
src\data\blueprints.js:52:    desc: 'Stabilize hydrogen into fuel cells for jump drives and stations.',
src\systems\automation.js:44:// stationId -> { sectorId, factionId, type, position } from the SECTORS graph (same resolve
src\systems\automation.js:52:      sectorId: sec.id,
src\systems\automation.js:58:    ALL_STATIONS.push({ id: st.id, name: st.name, type: st.type, sectorId: sec.id, sectorName: sec.name, position: sec.position });
src\systems\automation.js:238:    const curSector = (this.state.world && this.state.world.currentSectorId) || null;
src\systems\automation.js:256:          this._loseAsset('drone', g, this._droneBufferValue(g), g.sectorId);
src\systems\automation.js:269:      const onRock = (g.sectorId === curSector)
src\systems\automation.js:272:      if (g.sectorId !== curSector) this._releaseDroneEntities(g); // out-of-sector: entities unloaded
src\systems\automation.js:276:      if (room > 0 && (onRock || g.sectorId !== curSector)) {
src\systems\automation.js:285:        this._loseAsset('drone', g, this._droneBufferValue(g), g.sectorId);
src\systems\automation.js:301:    if ((!g.entityIds || !g.entityIds.length) && g.sectorId === curSector) this._spawnDroneEntities(g, def);
src\systems\automation.js:316:    if (!beacon || g.sectorId !== curSector || !g.entityIds || !g.entityIds.length) return false;
src\systems\automation.js:591:        entityType: 'pirate', sectorId: this._routeSectorId(t),
src\systems\automation.js:655:    return info ? info.sectorId : (this.state.world && this.state.world.currentSectorId) || 'sector_helios_prime';
src\systems\automation.js:724:      const sec = SECTOR_BY_ID.get(o.sectorId);
src\systems\automation.js:738:        this.bus.emit('automation:outpostRaided', { outpostId: o.id, sectorId: o.sectorId, lossVol: Math.round(lossVol) });
src\systems\automation.js:739:        this.bus.emit('toast', { text: `Outpost raided in ${prettySector(o.sectorId)} (-${Math.round(lossVol)} goods)`, kind: 'warn', ttl: 4 });
src\systems\automation.js:918:      sectorId: (this.state.world && this.state.world.currentSectorId) || 'sector_helios_prime',
src\systems\automation.js:928:    this.toast(`Drone deployed (${prettySector(g.sectorId)})`, 'success');
src\systems\automation.js:1023:      sectorId: (this.state.world && this.state.world.currentSectorId) || 'sector_helios_prime',
src\systems\automation.js:1031:    this.toast(`Outpost established in ${prettySector(o.sectorId)}`, 'success');
src\systems\automation.js:1103:      if (g.durability <= 0) { this._releaseDroneEntities(g); this._loseAsset('drone', g, this._droneBufferValue(g), g.sectorId); a.drones.splice(idx, 1); }
src\systems\automation.js:1113:  _loseAsset(kind, inst, value, sectorId) {
src\systems\automation.js:1115:    this.bus.emit('automation:assetLost', { kind, id: inst.id, value: value || 0, sectorId: sectorId || null });
src\systems\automation.js:1116:    this.bus.emit('toast', { text: `${kind} lost${sectorId ? ' in ' + prettySector(sectorId) : ''}`, kind: 'error', ttl: 4 });
src\systems\automation.js:1212:  // dangerFor   = (sectorId) => effective dangerIndex 0..1, provided by sectorSim
src\systems\automation.js:1225:      const currentId = (this.state.world && this.state.world.currentSectorId) || null;
src\systems\automation.js:1249:        if (o.sectorId === currentId) continue;        // in-view
src\systems\automation.js:1251:        const danger = dangerFor ? (dangerFor(o.sectorId) || 0) : 0;
src\systems\automation.js:1267:            this.bus.emit('automation:outpostRaided', { outpostId: o.id, sectorId: o.sectorId, lossVol });
src\systems\automation.js:1315:    const sid = (this.state.world && this.state.world.currentSectorId) || 'sector_helios_prime';
src\systems\automation.js:1340:    const sid = (this.state.world && this.state.world.currentSectorId) || '';
src\data\audioRecipes.js:215:    id: 'sfx_jump_charge',
src\data\audioRecipes.js:227:    id: 'sfx_jump_arrive',
src\systems\dangerModel.js:112:    if (s.wormholeTo && s.wormholeTo.sectorId) addEdge(s.id, s.wormholeTo.sectorId, 'wormhole');
src\systems\dangerModel.js:228:export function readSectorField(field, sectorId) {
src\systems\dangerModel.js:229:  const n = field && field.nodes && field.nodes[sectorId];
src\systems\dangerModel.js:411:    .filter((x) => x && x.sectorId && nodes[x.sectorId])
src\systems\dangerModel.js:413:    .sort((a, b) => ((a.seq || 0) - (b.seq || 0)) || String(a.kind || '').localeCompare(String(b.kind || '')) || a.sectorId.localeCompare(b.sectorId));
src\systems\dangerModel.js:415:    const n = nodes[impulse.sectorId];
src\systems\dangerModel.js:430:    .filter((x) => x && x.sectorId)
src\systems\dangerModel.js:432:    .sort((a, b) => ((a.seq || 0) - (b.seq || 0)) || String(a.kind || '').localeCompare(String(b.kind || '')) || a.sectorId.localeCompare(b.sectorId));
src\systems\dangerModel.js:433:  for (const impulse of ordered) out[impulse.sectorId] = String(impulse.kind || 'external');
src\systems\factions.js:44:// Contested sectors flippable in war: pairKey → sectorId (spec CONTESTED SECTORS, sector_ ids).
src\systems\factions.js:381:          const sectorId = CONTESTED[key];
src\systems\factions.js:382:          if (sectorId && state.world && state.world.sectors && state.world.sectors[sectorId]) {
src\systems\factions.js:383:            state.world.sectors[sectorId].owner = winner; // §0.6: factions writes sector owner
src\systems\factions.js:384:            if (this.bus) this.bus.emit('conflict:flip', { pairKey: key, sectorId, newOwner: winner });
src\data\claimableBodies.js:39:    id: 'mod_teleporter', name: 'Quantum Teleporter', desc: 'Links this body to a chosen station. Collapses your worst lane to a single jump — classic automation that rewrites the map.',
src\systems\economy.js:75:// station id -> { type, size, factionId, sectorId, neighbors:[sectorId] } from the SECTORS graph.
src\systems\economy.js:83:      sectorId: sec.id, neighbors: sec.neighbors || [], security: sec.security,
src\systems\economy.js:97:                   sectorId: sec.id, neighbors: sec.neighbors || [], security: sec.security };
src\systems\economy.js:254:    // ---- contraband scanning (jump-gate use / patrol proximity) ---------------------------
src\systems\economy.js:255:    bus.on('sim:jumpGate', (p) => this.runScan(p || {}));
src\systems\economy.js:256:    bus.on('jump:start', (p) => this.runScan({ security: this.currentSecurity(), via: p && p.via, source: 'jump' }));
src\systems\economy.js:378:    const sectorId = payload && payload.sectorId;
src\systems\economy.js:380:    if (!stations && sectorId) {
src\systems\economy.js:382:        ? state.content.sectors.find((s) => s.id === sectorId)
src\systems\economy.js:383:        : state.content.sectors[sectorId]))
src\systems\economy.js:384:        || SECTORS.find((s) => s.id === sectorId);
src\systems\economy.js:703:    const sid = state.world && state.world.currentSectorId;
src\systems\economy.js:779:    const sid = state.world && state.world.currentSectorId;
src\systems\economy.js:972:    const home = (state.world && state.world.currentSectorId) || 'sector_helios_prime';
src\systems\intervention.js:29:    // active interventions: { id, kind, sectorId, wreckEntityId, value, t }
src\systems\intervention.js:42:    const sectorId = p.sectorId || (this.state.world && this.state.world.currentSectorId);
src\systems\intervention.js:85:      sectorId,
src\systems\heat.js:131:    const sector = state.world && state.world.currentSectorDef;
src\systems\onboarding.js:123:    // First jump gate approach: teach the player how gates work.
scripts\balance-sim.mjs:121:// Flag non-monotonic price/hull/shield across tiers, and runaway price jumps (>6x tier-over-tier).
scripts\balance-sim.mjs:166:  summary.push({ check: '2 Ship progression', status, note: issues.length ? issues.join('; ') : 'monotonic, no runaway jumps' });
src\systems\flightV3.js:399:  const sector = state.world && state.world.currentSector;
src\systems\scanner.js:84:function ensurePingBucket(state, sectorId) {
src\systems\scanner.js:86:  const list = state.world.scanPings[sectorId];
src\systems\scanner.js:88:  state.world.scanPings[sectorId] = [];
src\systems\scanner.js:89:  return state.world.scanPings[sectorId];
src\systems\scanner.js:92:function upsertUnknownPing(state, sectorId, ping) {
src\systems\scanner.js:93:  const list = ensurePingBucket(state, sectorId);
src\systems\scanner.js:131:    const sectorId = state.world && state.world.currentSectorId || null;
src\systems\scanner.js:157:    if (sectorId) this._pingHiddenPois(state, sectorId, origin);
src\systems\scanner.js:158:    this.bus.emit('scan:completed', { targetId: null, sectorId, found });
src\systems\scanner.js:161:  _pingHiddenPois(state, sectorId, origin) {
src\systems\scanner.js:168:      upsertUnknownPing(state, sectorId, {
src\systems\world.js:5:// the jump state machine (IDLE→CHARGING→JUMPING→COOLDOWN), fuel, hazard membership, POI scan
src\systems\world.js:8:// enterSector(sectorId, {fromJump}) is the entry point main.js calls at boot
src\systems\world.js:11://   state.world.currentSectorId / activeSector / state.bounds, places the player at an
src\systems\world.js:15://   state.world.rng = mulberry32(hash32(meta.seed, sectorId, seq)); never Math.random().
src\systems\world.js:16:// Single-writer (§0.6): world owns world.*/jump/fuel/nav; it emits economy:chargeCredits for
src\systems\world.js:28:const GATE_CHARGE = 3.0;        // s align time for a gate jump
src\systems\world.js:38:  jump_t1: { baseCharge: 8.0, tierFuelMult: 1.0,  driveStealth: 0.0,  hotJump: false },
src\systems\world.js:39:  jump_t2: { baseCharge: 5.5, tierFuelMult: 0.85, driveStealth: 0.15, hotJump: false },
src\systems\world.js:40:  jump_t3: { baseCharge: 3.5, tierFuelMult: 0.70, driveStealth: 0.35, hotJump: true  },
src\systems\world.js:42:const DEFAULT_DRIVE = DRIVE_TIERS.jump_t1;
src\systems\world.js:84:    this._driveTierId = null;     // resolved from equipped jump-drive module (null → T1 default)
src\systems\world.js:111:    const sectorId = d.bossSectorId || this.state.world.currentSectorId;
src\systems\world.js:113:    if (!sectorId || !poiId) return;
src\systems\world.js:114:    const disc = this._discoveryFor(sectorId);
src\systems\world.js:124:    this.bus.emit('boss:defeated', { sectorId, poiId, killerId: p.killerId || null });
src\systems\world.js:133:   * @param {string} sectorId
src\systems\world.js:136:  enterSector(sectorId, opts = {}) {
src\systems\world.js:138:    const sector = state.world.sectors[sectorId] || SECTOR_BY_ID.get(sectorId);
src\systems\world.js:139:    if (!sector) { console.warn('[world] enterSector: unknown sector', sectorId); return null; }
src\systems\world.js:141:    const fromSectorId = opts.fromSectorId || state.world.currentSectorId || null;
src\systems\world.js:143:    if (state.world.currentSectorId) {
src\systems\world.js:144:      this.bus.emit('sector:exit', { sectorId: state.world.currentSectorId });
src\systems\world.js:149:    state.world.rng = this.helpers.mulberry32(this.helpers.hash32(state.meta.seed, sectorId, this._sectorSeq++));
src\systems\world.js:153:    const disc = this._discoveryFor(sectorId);
src\systems\world.js:178:    state.world.currentSectorId = sectorId;
src\systems\world.js:187:    this._flushPendingSpawns(sectorId, sector);
src\systems\world.js:190:      this.bus.emit('sector:discovered', { sectorId });
src\systems\world.js:196:    this.bus.emit('sector:enter', { sectorId, sector, entryPoint, firstVisit });
src\systems\world.js:237:          contested: !!st.contested, repGated: !!st.repGated, sectorId: sector.id,
src\systems\world.js:326:          sectorId: sector.id,
src\systems\world.js:339:          stationId: null, isGate: true, isWormhole: true, gateTo: sector.wormholeTo.sectorId,
src\systems\world.js:341:          factionId: sector.factionId, name: 'Wormhole', sectorId: sector.id,
src\systems\world.js:344:      active.gates.push({ id: ent.id, to: sector.wormholeTo.sectorId, pos, wormhole: true });
src\systems\world.js:363:          scanRange: poi.scanRange || SCAN_RANGE, sectorId: sector.id,
src\systems\world.js:499:  _discoveryFor(sectorId) {
src\systems\world.js:501:    if (!d[sectorId]) d[sectorId] = { discovered: false, visitedCount: 0, pois: {}, fieldsDepleted: {} };
src\systems\world.js:502:    if (!d[sectorId].pois) d[sectorId].pois = {};
src\systems\world.js:503:    if (!d[sectorId].fieldsDepleted) d[sectorId].fieldsDepleted = {};
src\systems\world.js:504:    return d[sectorId];
src\systems\world.js:517:  _onPurchaseSurveyData({ sectorId, stationId }) {
src\systems\world.js:518:    const sector = SECTOR_BY_ID.get(sectorId);
src\systems\world.js:520:    const stationSectorId = STATION_SECTOR_ID.get(stationId) || this.state.world.currentSectorId;
src\systems\world.js:522:    if (!stationSector || !(stationSector.neighbors || []).includes(sectorId)) return false;
src\systems\world.js:524:    const disc = this._discoveryFor(sectorId);
src\systems\world.js:537:    this.bus.emit('economy:chargeCredits', { amount: price, reason: `survey:${sectorId}` });
src\systems\world.js:541:    this.bus.emit('map:sectorCharted', { sectorId, source: 'survey' });
src\systems\world.js:547:  // per-tick update: jump state machine, fuel, hazards, POI scan, cooldown
src\systems\world.js:551:    const jump = state.jump;
src\systems\world.js:553:    if (jump.cooldownT > 0) {
src\systems\world.js:554:      jump.cooldownT = Math.max(0, jump.cooldownT - dt);
src\systems\world.js:555:      if (jump.cooldownT === 0 && jump.state === 'COOLDOWN') jump.state = 'IDLE';
src\systems\world.js:558:    switch (jump.state) {
src\systems\world.js:569:  // --- jump: CHARGING --------------------------------------------------------
src\systems\world.js:571:    const jump = state.jump;
src\systems\world.js:573:    if (jump.via === 'drive' && this._combatLock && !drive.hotJump) {
src\systems\world.js:577:    jump.chargeT += dt;
src\systems\world.js:578:    this.bus.emit('jump:chargeTick', { progress: clamp(jump.chargeT / Math.max(0.01, jump.chargeNeeded), 0, 1) });
src\systems\world.js:579:    if (jump.chargeT >= jump.chargeNeeded) {
src\systems\world.js:581:      this._spendFuel(jump._fuelCost || 0);
src\systems\world.js:582:      jump.state = 'JUMPING';
src\systems\world.js:583:      jump.chargeT = 0;
src\systems\world.js:584:      jump._jumpT = 0;
src\systems\world.js:587:      this.bus.emit('jump:start', { from: state.world.currentSectorId, to: jump.targetSectorId, via: jump.via, fromPos });
src\systems\world.js:591:  // --- jump: JUMPING (brief tunnel) → arrive --------------------------------
src\systems\world.js:593:    const jump = state.jump;
src\systems\world.js:594:    jump._jumpT = (jump._jumpT || 0) + dt;
src\systems\world.js:595:    if (jump._jumpT < JUMPING_DURATION) return;
src\systems\world.js:597:    const target = jump.targetSectorId;
src\systems\world.js:598:    const via = jump.via;
src\systems\world.js:599:    const fromSectorId = state.world.currentSectorId;
src\systems\world.js:621:    this.bus.emit('jump:arrive', { sectorId: target, interdicted, ambushCount, toPos });
src\systems\world.js:623:    jump.state = via === 'gate' ? (GATE_COOLDOWN > 0 ? 'COOLDOWN' : 'IDLE') : 'COOLDOWN';
src\systems\world.js:624:    jump.cooldownT = via === 'gate' ? GATE_COOLDOWN : DRIVE_COOLDOWN;
src\systems\world.js:625:    jump.targetSectorId = null;
src\systems\world.js:626:    jump.via = null;
src\systems\world.js:627:    jump.chargeNeeded = 0;
src\systems\world.js:628:    jump._fuelCost = 0;
src\systems\world.js:651:    this.bus.emit('interdiction:triggered', { sectorId: sector.id, ambushCount: count, spawnPos: { x: px, z: pz } });
src\systems\world.js:657:    const sector = this.state.world.sectors[req.sectorId] || SECTOR_BY_ID.get(req.sectorId);
src\systems\world.js:659:    if (req.sectorId !== this.state.world.currentSectorId || !this.state.world.activeSector) {
src\systems\world.js:671:    const sectorId = p.sectorId || (this.state.world && this.state.world.currentSectorId);
src\systems\world.js:672:    if (!sectorId) return null;
src\systems\world.js:679:      sectorId,
src\systems\world.js:690:    const list = world.pendingSpawns[req.sectorId] || (world.pendingSpawns[req.sectorId] = []);
src\systems\world.js:694:  _flushPendingSpawns(sectorId, sector) {
src\systems\world.js:696:    const list = pending && pending[sectorId];
src\systems\world.js:698:    delete pending[sectorId];
src\systems\world.js:711:  // jump request validation + start (handles world:requestJump)
src\systems\world.js:715:    const jump = state.jump;
src\systems\world.js:716:    const cur = state.world.currentSectorId;
src\systems\world.js:720:    const reject = (reason) => this.bus.emit('jump:chargeAbort', { reason });
src\systems\world.js:723:    if (jump.state !== 'IDLE') return reject('busy');
src\systems\world.js:724:    if (jump.cooldownT > 0) return reject('cooldown');
src\systems\world.js:728:    const isWormhole = !!(sector && sector.wormholeTo && sector.wormholeTo.sectorId === targetSectorId);
src\systems\world.js:736:    // combat lock blocks the start unless a hot-jump drive
src\systems\world.js:751:    jump.state = 'CHARGING';
src\systems\world.js:752:    jump.targetSectorId = targetSectorId;
src\systems\world.js:753:    jump.via = via;
src\systems\world.js:754:    jump.chargeT = 0;
src\systems\world.js:755:    jump.chargeNeeded = chargeNeeded;
src\systems\world.js:756:    jump._fuelCost = fuelCost;
src\systems\world.js:757:    this.bus.emit('jump:chargeStart', { targetSectorId, via, chargeNeeded });
src\systems\world.js:761:    const jump = this.state.jump;
src\systems\world.js:762:    if (jump.state !== 'CHARGING') return;
src\systems\world.js:764:    if (jump.via === 'drive' && jump._fuelCost) {
src\systems\world.js:765:      this._addFuel((jump._fuelCost * FUEL_REFUND_FRAC) | 0);
src\systems\world.js:767:    jump.state = 'IDLE';
src\systems\world.js:768:    jump.targetSectorId = null; jump.via = null;
src\systems\world.js:769:    jump.chargeT = 0; jump.chargeNeeded = 0; jump._fuelCost = 0;
src\systems\world.js:770:    this.bus.emit('jump:chargeAbort', { reason });
src\systems\world.js:782:  _onSetCourse({ sectorId }) {

 succeeded in 4114ms:

Name
----
check-47a-counter-tether-live.mjs
check-47a-death-retry.mjs
check-47a-live-branch-predicate.mjs
check-47a-live-cold-open.mjs
check-47a-tactics.mjs
check-47a-visual-assets.mjs
check-automation-board-runtime.mjs
check-automation-ops-board.mjs
check-bar-canonical-contacts.mjs
check-bar-mission-readiness-live.mjs
check-base-build-guidance.mjs
check-boot-flow.mjs
check-bundle.mjs
check-camera-composition.mjs
check-cargo-jettison-copy.mjs
check-claim-base-input.mjs
check-claims-guidance.mjs
check-codex-narrative.mjs
check-collision-debug.mjs
check-combat-grammar.mjs
check-concord-patrol.mjs
check-confirm-dialog-safety.mjs
check-controls-discoverability.mjs
check-countermeasures.mjs
check-crafting-guidance.mjs
check-data-refs.mjs
check-data.mjs
check-departure-check-prompts.mjs
check-faction-ships.mjs
check-faction-standings-guidance.mjs


codex
I found the GDD’s E2 target: data-owned light/fog/nebula/dust palettes, exactly as the task described. Now I’m locating the existing sector-change hooks so the transition happens once on arrival/load and doesn’t sneak canvas work into the frame loop.
codex
The Blender command line is just the app/MCP, no SpaceFace asset path or exporter command, and the lead explicitly assigned this lane. I’m proceeding inside the requested files, with no asset writes and no cleanup of the existing dirty tree.
exec
"C:\\Users\\93rob\\AppData\\Local\\Microsoft\\WindowsApps\\pwsh.exe" -Command '$lines = Get-Content src'"\\render\\renderer.js; foreach ("'$range in @(@(160,210),@(380,435),@(435,475),@(690,735))) { for ($i=$range[0]; $i -le $range[1]; $i++) { if ($i -lt $lines.Count) { '"'{0}:{1}' -f ("'$i+1), $lines[$i] } } }' in C:\Users\93rob\Documents\GitHub\SpaceFace
exec
"C:\\Users\\93rob\\AppData\\Local\\Microsoft\\WindowsApps\\pwsh.exe" -Command '$lines = Get-Content src'"\\systems\\world.js; for ("'$i=130; $i -le 205; $i++) { '"'{0}:{1}' -f ("'$i+1), $lines[$i] }; for ($i=590; $i -le 625; $i++) { '"'{0}:{1}' -f ("'$i+1), $lines[$i] }' in C:\Users\93rob\Documents\GitHub\SpaceFace
exec
"C:\\Users\\93rob\\AppData\\Local\\Microsoft\\WindowsApps\\pwsh.exe" -Command "rg -n \"currentSectorDef|currentSector\\b|activeSector|SECTOR_BY_ID|state\\.world\" src\\core\\gameState.js src\\main.js src\\systems\\world.js" in C:\Users\93rob\Documents\GitHub\SpaceFace
 succeeded in 6676ms:
161:const _pt = new THREE.Vector3();
162:const _v2 = new THREE.Vector2();
163:const _drawSize = new THREE.Vector2();
164:
165:export const render = {
166:  name: 'render',
167:  init(ctx) {
168:    this.state = ctx.state;
169:    this.bus = ctx.bus;
170:    const state = ctx.state, bus = ctx.bus;
171:
172:    const canvas = document.getElementById('gl-canvas');
173:    // preserveDrawingBuffer is needed only by the explicit /__shot ship capture route. Keeping it off
174:    // during normal dev and perf probes avoids a readback-friendly WebGL path that players never use.
175:    const query = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
176:    const devShot = !!(query && query.get('dev') === 'shipshot');
177:    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: devShot });
178:    renderer.setClearColor(0x060912, 1);
179:    const drawSize = applyRendererSize(renderer, state);
180:
181:    const scene = new THREE.Scene();
182:    // Thin fog for gentle depth cueing only — the old 0.00085 erased the entire backdrop, leaving a
183:    // black void. This keeps the nebula + far stars visible while still fading the deep distance.
184:    scene.fog = new THREE.FogExp2(0x0a1430, 0.00026);
185:    scene.add(new THREE.AmbientLight(0x42506f, 0.85));
186:    const key = new THREE.DirectionalLight(0xcfe2ff, 1.7); key.position.set(60, 140, 40); scene.add(key);
187:    const rim = new THREE.DirectionalLight(0x6a5cff, 0.7); rim.position.set(-70, 50, -60); scene.add(rim);
188:    const fill = new THREE.DirectionalLight(0x39d0ff, 0.35); fill.position.set(20, 30, 120); scene.add(fill);
189:
190:    // Real shadow maps (graphics spec Workstream G). Gated behind settings.video.shadows (default
191:    // true). The key light becomes a shadow caster with a tight frustum that follows the player so
192:    // ships/stations cast real shadows on the play plane — a groundedness the contact-shadow disc
193:    // only faked. The bloom contract (bloom.js) is untouched: shadows write to the depth buffer
194:    // during the normal scene render, before bloom samples it.
195:    const shadowsOn = !(state.settings && state.settings.video && state.settings.video.shadows === false);
196:    if (shadowsOn) {
197:      renderer.shadowMap.enabled = false;
198:      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
199:      key.castShadow = true;
200:      key.shadow.mapSize.set(2048, 2048);
201:      // Orthographic frustum sized to the local play area around the player (updated per frame in
202:      // renderFrame to follow the player). Tight bounds = crisp shadows at usable resolution.
203:      const SC = key.shadow.camera;
204:      SC.near = 10; SC.far = 600;
205:      SC.left = -700; SC.right = 700; SC.top = 700; SC.bottom = -700;
206:      SC.updateProjectionMatrix();
207:      key.shadow.bias = -0.0008;
208:      key.shadow.normalBias = 0.04;
209:      key.target = new THREE.Object3D(); scene.add(key.target);
210:    }
211:
381:    bus.on('camera:shake', ({ amount }) => cam.addTrauma(amount || 0.3));
382:    bus.on('camera:zoom', ({ delta, level }) => { if (level != null) cam.setZoom(level); else cam.setZoom(state.camera.zoom + (delta || 0)); });
383:    bus.on('game:started', () => cam.snapToPlayer && cam.snapToPlayer());
384:    bus.on('save:loaded', () => cam.snapToPlayer && cam.snapToPlayer());
385:    bus.on('player:respawn', () => cam.snapToPlayer && cam.snapToPlayer());
386:    // Live-apply video settings changes. Without this, dragging Bloom strength / FOV / particle
387:    // quality in the settings screen did nothing (only the initial value was used) — a "slider that
388:    // doesn't work" sore thumb. We forward the values to the systems that own them.
389:    bus.on('settings:changed', (p) => {
390:      if (!p || p.section !== 'video') return;
391:      const vd = state.settings.video;
392:      if (this.bloom) this.bloom.setOptions({ bloom: vd.bloom, strength: vd.bloomStrength, threshold: vd.bloomThreshold, exposure: vd.exposure, acesToneMapping: vd.acesToneMapping !== false });
393:      if (p.key === 'shadows' || p.key == null) {
394:        this._shadowSettingOn = vd.shadows !== false;
395:        this._shadowReceiversDirty = true;
396:      }
397:      if (p.key === 'renderScale' || p.key === 'pixelRatioCap' || p.key == null) this.onResize();
398:      // FOV: the feel system (feel.js) adds a transient punch on top of this base. We update the
399:      // camera's base fov here; feel.frame() re-derives its cached base from settings when no punch
400:      // is active, so the slider and the punch never fight.
401:      if (p.key === 'fov' || p.key == null) {
402:        const camObj = state.render.camera;
403:        if (camObj && camObj.isPerspectiveCamera && typeof vd.fov === 'number') {
404:          camObj.fov = vd.fov;
405:          camObj.updateProjectionMatrix();
406:        }
407:      }
408:    });
409:    // On sector change, reconcile rather than blindly clearing: the new sector's entities are
410:    // already spawned by the time this fires (enterSector spawns before its sector:enter resolves),
411:    // so a blind clearAllMeshes(keepPlayer) used to wipe the station/asteroids and leave the player
412:    // alone in empty space. reconcileMeshes() removes only meshes for entities that are gone.
413:    bus.on('sector:enter', ({ sector } = {}) => {
414:      this._meshReconcileDirty = true;
415:      if (cam.snapToPlayer) cam.snapToPlayer();
416:      this._updatePlanetBodies(sector);
417:      // Tint the nebula backdrop to the sector's mood so each region of the galaxy reads with its
418:      // own color signature: clean-blue core → rust/amber industrial → blood-red frontier → violet
419:      // alien/endgame. Drives the whole-frame atmosphere, reinforcing the core-to-frontier gradient.
420:      if (this.starfield && this.starfield.setSectorTint) {
421:        this.starfield.setSectorTint(sectorNebulaTint(sector));
422:      }
423:      this._updateHazardVisuals(sector);
424:      precompilePipelines(renderer, scene, cam.obj, { sector }).catch((error) => console.warn('[render] sector pipeline precompile failed', error));
425:    });
426:    bus.on('save:loaded', () => { this._meshReconcileDirty = true; });
427:
428:    window.addEventListener('resize', () => this.onResize());
429:  },
430:
431:  clearAllMeshes(keepPlayer) {
432:    for (const [id, m] of [...this._meshes]) {
433:      if (keepPlayer && id === this.state.playerId) continue;
434:      this.scene.remove(m); disposeObject(m); this._meshes.delete(id);
435:    }
436:    this._meshBuildQueue.length = 0;
436:    this._meshBuildQueue.length = 0;
437:    this._meshBuildQueuedIds.clear();
438:    // Also clear hazard zone visuals
439:    for (const obj of this._hazardVisuals) { this.scene.remove(obj); disposeObject(obj); }
440:    this._hazardVisuals = [];
441:  },
442:
443:  // Bake (or re-bake) the PMREM environment map from the current nebula backdrop. Called once at
444:  // init after the starfield background decodes, AND on WebGL context restore (a lost GL context
445:  // invalidates the envMap GPU texture — without re-baking, chrome hulls go matte after recovery).
446:  _bakeEnv() {
447:    try {
448:      const renderer = this.renderer, scene = this.scene, state = this.state;
449:      const pmrem = new THREE.PMREMGenerator(renderer);
450:      const envMap = scene.background && scene.background.isTexture
451:        ? pmrem.fromEquirectangular(scene.background).texture
452:        : pmrem.fromScene(scene, 0, 0.1, 1000).texture;
453:      pmrem.dispose();
454:      // Dispose the previous env GPU texture if we're re-baking (context restore path).
455:      if (this._envMap && this._envMap !== envMap) {
456:        try { this._envMap.dispose(); } catch (_) {}
457:      }
458:      this._envMap = envMap;
459:      state.render.envMap = envMap;
460:      setEnvMapForShips(envMap);   // hand it to the visual factory for chrome/authority hulls
461:      if (scene.environment === null || scene.environment === this._envMap) scene.environment = envMap;
462:    } catch (_) { /* env-map optional — chrome falls back to high-metalness matte */ }
463:  },
464:
465:  // Self-healing entity<->mesh reconciliation. Guarantees every alive, renderable entity has a
466:  // scene mesh and that meshes for gone entities are disposed — independent of event ordering.
467:  // This is the safety net that makes the world actually render (entity:spawned alone was being
468:  // undone by the old sector:enter clear). Cheap: only builds/destroys on a delta.
469:  reconcileMeshes() {
470:    const state = this.state;
471:    const buildBudget = this._initialMeshReconcileComplete ? RUNTIME_MESH_BUILD_BUDGET : Infinity;
472:    // remove meshes whose entity no longer exists or has died
473:    for (const [id, m] of this._meshes) {
474:      const e = state.entities.get(id);
475:      if (!e || e.alive === false) { this.scene.remove(m); disposeObject(m); this._meshes.delete(id); this._shadowReceiversDirty = true; }
476:    }
691:          opacity: 0.25 * intensityScale,
692:          blending: THREE.AdditiveBlending,
693:          depthWrite: false,
694:          side: THREE.DoubleSide,
695:        });
696:        const ring = new THREE.Mesh(ringGeo, ringMat);
697:        ring.rotation.x = -Math.PI / 2;
698:        ring.position.set(hz.center.x, -0.4, hz.center.z);
699:        ring.renderOrder = -2;
700:        ring.frustumCulled = false;
701:        this.scene.add(ring);
702:        this._hazardVisuals.push(ring);
703:      }
704:    }
705:  },
706:
707:  prepareFrame(alpha, frameDt) {
708:    // While the GL context is lost, the renderer can't draw — skip all per-frame work until
709:    // webglcontextrestored rebuilds GPU resources. (cam.follow etc. would run against a dead
710:    // renderer; the context-restore handler re-applies everything that matters when it returns.)
711:    if (this._contextLost) return false;
712:    if (this._meshReconcileDirty) this.reconcileMeshes();
713:    this.syncEntityViews(alpha);
714:    this.cam.follow(frameDt);
715:    syncContactShadowPool(this._contactShadowPool, this.state.entityList, this._meshes);
716:    syncAuthoredInstancePools(this.scene, { camera: this.cam.obj });
717:    this.starfield.recenter(this.cam.obj.position);
718:    // Background-clock for distant animation (planet cloud drift, hero-star twinkle). Integrates real
719:    // frame dt scaled by state.timeScale so the cosmos respects hit-stop/pause — a death freeze
720:    // momentarily stills the clouds too, keeping the backdrop in the same time model as the action.
721:    const ts = (this.state.timeScale != null) ? this.state.timeScale : 1;
722:    this._bgTime = (this._bgTime || 0) + frameDt * ts;
723:    if (this.starfield.update) this.starfield.update(frameDt, this._bgTime);
724:    this._updatePlanetParallax();
725:    this._syncShadowMapEnabled();
726:    // Shadow follow (graphics spec G): keep the key light's shadow frustum centered on the player
727:    // so the tight 1400-unit ortho box always covers the local action. DirectionalLight position is
728:    // an offset from its target; we move both together. No-op if shadows are disabled.
729:    this._updateShadowFollow();
730:    // Collision/socket/landing debug overlay (spec §12.5). Repositions pooled markers over the live
731:    // meshes once per frame; a cheap no-op when off (the group is hidden + nothing iterates).
732:    if (this.collisionDebug && this.collisionDebug.on) this.collisionDebug.update();
733:    return true;
734:  },
735:
736:  drawPreparedFrame() {

 succeeded in 4963ms:
131:   * Despawn the previous sector's scoped entities, spawn the target sector from data, set
132:   * world/bounds, place the player at an entry point, and emit sector:enter.
133:   * @param {string} sectorId
134:   * @param {{fromJump?:boolean, via?:string, fromSectorId?:string}} [opts]
135:   */
136:  enterSector(sectorId, opts = {}) {
137:    const state = this.state;
138:    const sector = state.world.sectors[sectorId] || SECTOR_BY_ID.get(sectorId);
139:    if (!sector) { console.warn('[world] enterSector: unknown sector', sectorId); return null; }
140:
141:    const fromSectorId = opts.fromSectorId || state.world.currentSectorId || null;
142:    // Despawn the OLD sector's contents (everything sector-scoped except the player).
143:    if (state.world.currentSectorId) {
144:      this.bus.emit('sector:exit', { sectorId: state.world.currentSectorId });
145:    }
146:    this._despawnSectorEntities();
147:
148:    // Per-sector deterministic RNG stream (§0.5).
149:    state.world.rng = this.helpers.mulberry32(this.helpers.hash32(state.meta.seed, sectorId, this._sectorSeq++));
150:    const rng = state.world.rng;
151:
152:    // Discovery overlay bookkeeping (§3.8) — entering reveals the sector + one hop.
153:    const disc = this._discoveryFor(sectorId);
154:    const firstVisit = !disc.discovered;
155:    disc.discovered = true;
156:    disc.visitedCount = (disc.visitedCount || 0) + 1;
157:
158:    // World radius / bounds.
159:    const worldRadius = sector.worldRadius || DEFAULT_WORLD_RADIUS;
160:    state.bounds = { radius: worldRadius, hardRadius: worldRadius + 500, center: { x: 0, z: 0 } };
161:
162:    // Compute the entry point: come in near the gate to the sector we arrived from.
163:    const entryPoint = this._entryPointFor(sector, fromSectorId, rng);
164:    state.world.entryPoint = entryPoint;
165:
166:    // Build the live activeSector instance (entity-id handles for everything we spawn).
167:    const active = { stations: [], fields: [], hazards: [], pois: [], gates: [], enemies: [] };
168:
169:    this._spawnStations(sector, active, rng);
170:    this._spawnFields(sector, active, disc, rng);
171:    this._spawnGates(sector, active, rng);
172:    this._spawnPOIs(sector, active, disc, rng);
173:    this._spawnHazards(sector, active);
174:    this._spawnEnemies(sector, active, rng);
175:    this._spawnBossIfDue(sector, active, rng);
176:
177:    state.world.activeSector = active;
178:    state.world.currentSectorId = sectorId;
179:    if (!this._hazardSet) this._hazardSet = new Set();
180:    if (!this._hazardNextSet) this._hazardNextSet = new Set();
181:    this._hazardSet.clear();
182:    this._hazardNextSet.clear();
183:
184:    // Place the player ship at the entry point (move existing entity; world never spawns the player).
185:    this._placePlayer(entryPoint);
186:    this._resolveShipModules();
187:    this._flushPendingSpawns(sectorId, sector);
188:
189:    if (firstVisit) {
190:      this.bus.emit('sector:discovered', { sectorId });
191:      this.bus.emit('toast', { text: `New sector discovered: ${sector.name}`, kind: 'info', ttl: 4 });
192:    }
193:    // Reveal direct neighbors on the map ("see one hop ahead") without marking them visited.
194:    for (const nb of (sector.neighbors || [])) this._discoveryFor(nb);
195:
196:    this.bus.emit('sector:enter', { sectorId, sector, entryPoint, firstVisit });
197:    return active;
198:  },
199:
200:  // --- despawn everything sector-scoped (NOT the player) ------------------------------------
201:  _despawnSectorEntities() {
202:    const state = this.state;
203:    const list = state.entityList;
204:    for (let i = list.length - 1; i >= 0; i--) {
205:      const e = list[i];
206:      if (e.id === state.playerId) continue;          // keep the flyable ship
591:  // --- jump: JUMPING (brief tunnel) → arrive --------------------------------
592:  _tickJumping(dt, state) {
593:    const jump = state.jump;
594:    jump._jumpT = (jump._jumpT || 0) + dt;
595:    if (jump._jumpT < JUMPING_DURATION) return;
596:
597:    const target = jump.targetSectorId;
598:    const via = jump.via;
599:    const fromSectorId = state.world.currentSectorId;
600:    const sector = state.world.sectors[target] || SECTOR_BY_ID.get(target);
601:    const drive = this._activeDrive();
602:
603:    // Roll interdiction (drive only) BEFORE we re-seed in enterSector, using the core sim RNG.
604:    let interdicted = false, ambushCount = 0;
605:    if (via === 'drive') {
606:      const chance = this._interdictChance(sector, via, drive);
607:      interdicted = state.rng() < chance;
608:    }
609:
610:    // Load the new sector (re-seeds world.rng, despawns old, spawns new, places player).
611:    this.enterSector(target, { fromJump: true, via, fromSectorId });
612:
613:    if (via === 'drive' && interdicted) {
614:      const tier = sector ? sector.tier : 0;
615:      ambushCount = 1 + Math.floor(state.rng() * (1 + tier));
616:      this._spawnAmbush(sector, ambushCount);
617:    }
618:
619:    const player = state.entities.get(state.playerId);
620:    const toPos = player ? { x: player.pos.x, z: player.pos.z } : { x: 0, z: 0 };
621:    this.bus.emit('jump:arrive', { sectorId: target, interdicted, ambushCount, toPos });
622:
623:    jump.state = via === 'gate' ? (GATE_COOLDOWN > 0 ? 'COOLDOWN' : 'IDLE') : 'COOLDOWN';
624:    jump.cooldownT = via === 'gate' ? GATE_COOLDOWN : DRIVE_COOLDOWN;
625:    jump.targetSectorId = null;
626:    jump.via = null;

exec
"C:\\Users\\93rob\\AppData\\Local\\Microsoft\\WindowsApps\\pwsh.exe" -Command "rg -n \"sectorNebulaTint|setSectorTint|sector:enter|jump:arrive\" src\\render\\renderer.js src\\render\\starfield.js src\\systems" in C:\Users\93rob\Documents\GitHub\SpaceFace
 succeeded in 4623ms:
src\core\gameState.js:114:    world: { sectors: {}, currentSectorId: null, activeSector: { stations: [], fields: [], hazards: [], pois: [], gates: [] }, discovery: {}, scanPings: {}, entryPoint: { x: 0, z: 0, heading: 0 } },
src\main.js:354:  state.world = fresh.world;
src\systems\world.js:11://   state.world.currentSectorId / activeSector / state.bounds, places the player at an
src\systems\world.js:15://   state.world.rng = mulberry32(hash32(meta.seed, sectorId, seq)); never Math.random().
src\systems\world.js:44:const SECTOR_BY_ID = new Map(SECTORS.map((s) => [s.id, s]));
src\systems\world.js:71:    if (!state.world.sectors || Object.keys(state.world.sectors).length === 0) {
src\systems\world.js:72:      state.world.sectors = {};
src\systems\world.js:73:      for (const s of SECTORS) state.world.sectors[s.id] = { ...s, owner: s.factionId };
src\systems\world.js:75:    if (!state.world.discovery) state.world.discovery = {};
src\systems\world.js:76:    if (Object.keys(state.world.discovery).length === 0) this._seedChartedDiscovery();
src\systems\world.js:77:    if (!state.world.scanPings || typeof state.world.scanPings !== 'object') state.world.scanPings = {};
src\systems\world.js:78:    if (!state.world.pendingSpawns || typeof state.world.pendingSpawns !== 'object') state.world.pendingSpawns = {};
src\systems\world.js:111:    const sectorId = d.bossSectorId || this.state.world.currentSectorId;
src\systems\world.js:121:    if (this.state.world.activeSector && this.state.world.activeSector.boss) {
src\systems\world.js:122:      delete this.state.world.activeSector.boss;
src\systems\world.js:138:    const sector = state.world.sectors[sectorId] || SECTOR_BY_ID.get(sectorId);
src\systems\world.js:141:    const fromSectorId = opts.fromSectorId || state.world.currentSectorId || null;
src\systems\world.js:143:    if (state.world.currentSectorId) {
src\systems\world.js:144:      this.bus.emit('sector:exit', { sectorId: state.world.currentSectorId });
src\systems\world.js:149:    state.world.rng = this.helpers.mulberry32(this.helpers.hash32(state.meta.seed, sectorId, this._sectorSeq++));
src\systems\world.js:150:    const rng = state.world.rng;
src\systems\world.js:164:    state.world.entryPoint = entryPoint;
src\systems\world.js:166:    // Build the live activeSector instance (entity-id handles for everything we spawn).
src\systems\world.js:177:    state.world.activeSector = active;
src\systems\world.js:178:    state.world.currentSectorId = sectorId;
src\systems\world.js:372:  // Hazard zones: pure data tags on activeSector (flight/combat/ai read these); no entity needed.
src\systems\world.js:500:    const d = this.state.world.discovery;
src\systems\world.js:518:    const sector = SECTOR_BY_ID.get(sectorId);
src\systems\world.js:520:    const stationSectorId = STATION_SECTOR_ID.get(stationId) || this.state.world.currentSectorId;
src\systems\world.js:521:    const stationSector = stationSectorId && (this.state.world.sectors[stationSectorId] || SECTOR_BY_ID.get(stationSectorId));
src\systems\world.js:587:      this.bus.emit('jump:start', { from: state.world.currentSectorId, to: jump.targetSectorId, via: jump.via, fromPos });
src\systems\world.js:599:    const fromSectorId = state.world.currentSectorId;
src\systems\world.js:600:    const sector = state.world.sectors[target] || SECTOR_BY_ID.get(target);
src\systems\world.js:637:    const rng = this.state.world.rng || this.state.rng;
src\systems\world.js:650:    if (this.state.world.activeSector) this.state.world.activeSector.enemies.push(...placed);
src\systems\world.js:657:    const sector = this.state.world.sectors[req.sectorId] || SECTOR_BY_ID.get(req.sectorId);
src\systems\world.js:659:    if (req.sectorId !== this.state.world.currentSectorId || !this.state.world.activeSector) {
src\systems\world.js:671:    const sectorId = p.sectorId || (this.state.world && this.state.world.currentSectorId);
src\systems\world.js:688:    const world = this.state.world;
src\systems\world.js:695:    const pending = this.state.world.pendingSpawns;
src\systems\world.js:716:    const cur = state.world.currentSectorId;
src\systems\world.js:717:    const sector = state.world.sectors[cur] || SECTOR_BY_ID.get(cur);
src\systems\world.js:718:    const target = state.world.sectors[targetSectorId] || SECTOR_BY_ID.get(targetSectorId);
src\systems\world.js:791:    const start = state.world.currentSectorId;
src\systems\world.js:800:    const sectorOf = (id) => state.world.sectors[id] || SECTOR_BY_ID.get(id);
src\systems\world.js:802:      const d = state.world.discovery[id];
src\systems\world.js:872:    const disc = this._discoveryFor(state.world.currentSectorId);
src\systems\world.js:874:    for (const p of (state.world.activeSector.pois || [])) {
src\systems\world.js:879:    const stationCount = (state.world.activeSector.stations || []).length;
src\systems\world.js:880:    const fieldCount = (state.world.activeSector.fields || []).length;
src\systems\world.js:892:    const disc = this._discoveryFor(state.world.currentSectorId);
src\systems\world.js:894:    for (const p of (state.world.activeSector.pois || [])) {
src\systems\world.js:919:    const zones = state.world.activeSector.hazards || [];
src\systems\world.js:952:    if (f.current <= 0) this.bus.emit('fuel:empty', { sectorId: this.state.world.currentSectorId });
src\systems\world.js:1012:    const disc = this._discoveryFor(this.state.world.currentSectorId);
src\systems\world.js:1045:      currentSectorId: state.world.currentSectorId,
src\systems\world.js:1046:      discovery: state.world.discovery,
src\systems\world.js:1047:      scanPings: state.world.scanPings || {},
src\systems\world.js:1048:      pendingSpawns: state.world.pendingSpawns || {},
src\systems\world.js:1060:    for (const id in this.state.world.sectors) {
src\systems\world.js:1061:      const s = this.state.world.sectors[id];
src\systems\world.js:1070:    if (data.discovery) state.world.discovery = data.discovery;
src\systems\world.js:1071:    state.world.scanPings = (data.scanPings && typeof data.scanPings === 'object') ? data.scanPings : {};
src\systems\world.js:1072:    state.world.pendingSpawns = (data.pendingSpawns && typeof data.pendingSpawns === 'object') ? data.pendingSpawns : {};
src\systems\world.js:1073:    if (data.currentSectorId) state.world.currentSectorId = data.currentSectorId;
src\systems\world.js:1085:        if (state.world.sectors[id]) state.world.sectors[id].owner = data.sectorOwners[id];
src\systems\world.js:1095:    state.world.discovery = {};
src\systems\world.js:1096:    state.world.scanPings = {};
src\systems\world.js:1097:    state.world.pendingSpawns = {};
src\systems\world.js:1108:  return state.world.sectors[id] || SECTOR_BY_ID.get(id) || null;

 succeeded in 3306ms:
src\render\starfield.js:302:    setSectorTint(tint) {
src\render\renderer.js:22:function sectorNebulaTint(sector) {
src\render\renderer.js:410:    // already spawned by the time this fires (enterSector spawns before its sector:enter resolves),
src\render\renderer.js:413:    bus.on('sector:enter', ({ sector } = {}) => {
src\render\renderer.js:420:      if (this.starfield && this.starfield.setSectorTint) {
src\render\renderer.js:421:        this.starfield.setSectorTint(sectorNebulaTint(sector));
src\render\renderer.js:468:  // undone by the old sector:enter clear). Cheap: only builds/destroys on a delta.
src\systems\economy.js:249:    bus.on('sector:enter', (p) => this.populateSector(p));
src\systems\economy.js:375:  /** On sector:enter, build markets for every station present so prices are warm. */
src\systems\mining.js:76:    bus.on('sector:enter', () => { this._lockTargetId = null; this._stopBeam(); });
src\systems\missions.js:223:    bus.on('sector:enter', (p) => this._onSectorEnter(p));
src\systems\story.js:77:    bus.on('sector:enter', (p) => this._onSectorEnter(p || {}));
src\systems\world.js:12://   entry point, and emits sector:enter. It does NOT auto-run on game:started.
src\systems\world.js:132:   * world/bounds, place the player at an entry point, and emit sector:enter.
src\systems\world.js:196:    this.bus.emit('sector:enter', { sectorId, sector, entryPoint, firstVisit });
src\systems\world.js:621:    this.bus.emit('jump:arrive', { sectorId: target, interdicted, ambushCount, toPos });
src\systems\wingmen.js:33:    // Spawn wingmen when the player enters a sector (world emits sector:enter on entry).
src\systems\wingmen.js:34:    this.bus.on('sector:enter', () => this._spawnWingmen());
src\systems\telemetry.js:350:  // NAVIGATION — dock + jump milestones. input.js:29 (dock:docked) / world.js:500 (jump:arrive)
src\systems\telemetry.js:358:  sub('jump:arrive', (p) => {
src\systems\telemetry.js:363:    pushRing('jump:arrive', { sectorId: p.sectorId, interdicted: p.interdicted, ambushCount: p.ambushCount });
src\systems\traffic.js:8://   - Spawns on sector:enter, scaled by sector.trafficPerMin (data exists, was unused) with a sane
src\systems\traffic.js:91:    this.bus.on('sector:enter', (p) => this._onSectorEnter(p));
src\systems\sectorSim.js:74:    this.bus.on('sector:enter', (p) => this._guard('sector:enter', () => this._onSectorEnter(p)));
src\systems\sectorSim.js:91:    this.bus.on('jump:arrive', (p) => this._onJumpArrive(p));

codex
The current renderer already had a derived `sectorNebulaTint()` heuristic and a sector-enter hook. I’m replacing that with explicit sector palette data as the source of truth, then keeping starfield rebakes guarded by actual tint changes.
codex
I’ve got the implementation shape now: keep the four baseline light intensities, put all colors/fog into sector data, transition only tiny numeric/color state per frame, and rebuild the nebula canvas only when a new palette’s `nebulaTint` differs. Next I’m editing the requested files.
exec
"C:\\Users\\93rob\\AppData\\Local\\Microsoft\\WindowsApps\\pwsh.exe" -Command '$lines = Get-Content src'"\\core\\gameState.js; for ("'$i=90; $i -le 125; $i++) { '"'{0}:{1}' -f ("'$i+1), $lines[$i] }' in C:\Users\93rob\Documents\GitHub\SpaceFace
exec
"C:\\Users\\93rob\\AppData\\Local\\Microsoft\\WindowsApps\\pwsh.exe" -Command "rg -n \"render:\\s*\\{\" src\\core\\gameState.js src -g\"*.js\"" in C:\Users\93rob\Documents\GitHub\SpaceFace
 succeeded in 2656ms:
91:
92:    // --- subsystem trees (owners populate) ---
93:    combat: { beams: [], threatTables: new Map() },
94:    economy: { markets: {}, econEvents: [], econClock: { accumulator: 0, lastTickT: 0, ticksElapsed: 0 }, marketIntel: {} },
95:    factions: {},
96:    conflicts: {},
97:    missions: { boards: {}, active: [], completedLog: [], receipts: [], nextId: 1, config: null },
98:    scenario: {
99:      schemaVersion: 1,
100:      active: null,
101:      facts: {},
102:      actorBindings: {},
103:      unresolvedActorIds: [],
104:      enteredBeatIds: [],
105:    },
106:    // story: beatIndex/branch/flags/chainProgress are owned by missions.js; the narrative overlay
107:    // fields (phase/seenComms/ambientQueue/graffiti/endgame) are owned by story.js. Both systems
108:    // co-own state.story; safe empty defaults here so either can read at boot (§3).
109:    story: { beatIndex: 0, branch: null, flags: {}, chainProgress: 0,
110:             phase: 1, seenComms: {}, ambientQueue: [], ambientTimerS: 0, graffitiShown: {},
111:             endgameChoice: null, endgameOffered: false, endgameDeclined: [], persistentCargo: [] },
112:    crafting: { queues: {} },
113:    aiEncounter: { schemaVersion: AI_CONTRACT_VERSION, nextSeq: 1, commands: [] },
114:    world: { sectors: {}, currentSectorId: null, activeSector: { stations: [], fields: [], hazards: [], pois: [], gates: [] }, discovery: {}, scanPings: {}, entryPoint: { x: 0, z: 0, heading: 0 } },
115:    jump: { state: 'IDLE', targetSectorId: null, via: null, chargeT: 0, chargeNeeded: 0, cooldownT: 0 },
116:    fuel: { current: 100, max: 100 },
117:    nav: { route: null, autoTravel: false, waypoint: null },   // waypoint = {stationId,pos:{x,z},label} set by the trade route planner
118:    automation: defaultAutomation(),
119:    // Offscreen statistical simulation (ADR-0002 / V2 §33). Owned solely by systems/sectorSim.js.
120:    // `sectors[id] = { drift:{security,enemyDensity}|null, lastEnterSimT, lastDay }` is the per-sector
121:    // drift overlay + away-clock; `meta` carries the seeded-RNG continuation seed + offline baseline.
122:    sectorSim: { sectors: {}, meta: { rngSeed: 0, lastTickSimT: 0, lastWallT: 0, lossLog: [] } },
123:    interventions: [],
124:    interventionMeta: { rngSeed: 0 },
125:    drill: null,
126:    claims: { bodies: [] },

exec
"C:\\Users\\93rob\\AppData\\Local\\Microsoft\\WindowsApps\\pwsh.exe" -Command 'rg -n "SECTORS|palette" scripts src/data -g"*.mjs" -g"*.js"' in C:\Users\93rob\Documents\GitHub\SpaceFace
 succeeded in 5510ms:
src\core\gameState.js:134:    render: {}, vfx: {}, audioRuntime: {}, perfRuntime: null,
src\core\gameState.js:134:    render: {}, vfx: {}, audioRuntime: {}, perfRuntime: null,
src\render\diagnostics.js:194:      render: { calls: info.calls, triangles: info.triangles, points: info.points, lines: info.lines },

 succeeded in 5164ms:
scripts\check-bar-canonical-contacts.mjs:5:import { SECTORS } from '../src/data/sectors.js';
scripts\check-bar-canonical-contacts.mjs:10:for (const sector of SECTORS) {
src/data\sectors.js:13:export const SECTORS = [
scripts\check-data.mjs:11:  ['../src/data/sectors.js', ['SECTORS', 'STATION_TYPES', 'HAZARD_TYPES', 'POI_TYPES', 'dangerTier']],
scripts\check-data.mjs:17:  ['../src/data/palettes.js', ['FACTION_PALETTES', 'SECTOR_PALETTES', 'SHIP_RECIPES']],
scripts\check-data-refs.mjs:13:import { SECTORS, STATION_TYPES } from '../src/data/sectors.js';
scripts\check-data-refs.mjs:32:  cmdty_: ids(COMMODITIES), beam_: ids(BEAMS), faction_: ids(FACTION_META), sector_: ids(SECTORS),
scripts\check-data-refs.mjs:49:const all = { SHIPS, WEAPONS, MODULES, TECH_NODES, COMMODITIES, ORES, ASTEROIDS, BEAMS, RECIPES, FIELDS, SECTORS, STATION_TYPES, FACTION_META, MISSION_TYPES, STORY_BEATS, DRONES, TRADERS, OUTPOSTS, ENEMY_TYPES, NEW_GAME };
src/data\narrative.js:123:    { id: 'amb_concord_atmo',   sender: 'CONCORD LOGISTICS OVERSIGHT', text: 'SECTOR MAINTENANCE ADVISORY: ATMOSPHERIC RECYCLER SERVICE SCHEDULED. SECTORS NOT MEETING VIABILITY THRESHOLD INELIGIBLE. REVIEW REQUIREMENTS UNDER REF 44-C.',
scripts\check-gameplay-core.mjs:42:import { SECTORS } from '../src/data/sectors.js';
scripts\check-gameplay-core.mjs:4664:    // Seed the live sector graph (world.init copies SECTORS in if empty, but enterSector needs it
scripts\check-gameplay-core.mjs:4666:    for (const s of SECTORS) state.world.sectors[s.id] = { ...s, owner: s.factionId };
src/data\palettes.js:1:// src/data/palettes.js – visual palette definitions and ship mesh recipes.
src/data\palettes.js:2:// FACTION_PALETTES: 8 faction color palettes keyed by faction_ IDs.
src/data\palettes.js:3:// SECTOR_PALETTES: 10 sector environmental palettes keyed by sector_ IDs.
scripts\check-sectorSim.mjs:19:import { SECTORS, dangerIndex, dangerTier } from '../src/data/sectors.js';
scripts\check-sectorSim.mjs:46:  for (const s of SECTORS) {
scripts\check-sectorSim.mjs:268:  const base = SECTORS.find((s) => s.id === sectorId);
scripts\check-sectorSim.mjs:290:  assert.equal(base.security, SECTORS.find((s) => s.id === sectorId).security,
scripts\check-wcag-contrast.mjs:104:// High-contrast mode foregrounds (accessibility.css:88 — the opt-in a11y palette).
scripts\wf-polish.js:20:    `Make the world look MUCH better using ONLY Three primitives + procedural canvas textures (no assets, no addons). Rewrite src/render/visualFactory.js (keep \`export function createVisualFactory()\` returning { build(entity) -> THREE.Object3D }) and enrich src/render/canvasTextures.js (export texture builders: noise/greeble/gradient/hull-panel/star). Consume src/data/palettes.js (FACTION_PALETTES, SECTOR_PALETTES, SHIP_RECIPES) and ships.js for class/role.
scripts\wf-polish.js:21:    - SHIPS: distinct silhouettes per role/class (fighter vs freighter vs miner vs capital) and per faction color (use entity.factionId / entity.team: team 0 = player cyan, team 1 = hostile red, else faction palette), built from layered primitives (hull body, wings/nacelles, cockpit, emissive engine glow + accent strips, panel-lined material via canvas texture). Nose MUST point +X. Scale to entity.radius. Use entity.data.defId / data.shipClass to pick the silhouette.
scripts\wf-wave-a.js:68:    `Implement the \`vfx\` system in src/render/vfx.js (you MAY import * as THREE from 'three'). In init, get the scene via state.render.scene (render inits before vfx). Build a POOLED particle system (THREE.Points and/or sprite pools; additive blending) and subscribe to: combat:fire (muzzle flash at origin along dir), projectile:hit + combat:damage (impact sparks; a shield-ripple when brokeShield), entity:killed + entity:destroyed (explosion = bright flash + expanding shockwave ring + debris; size by entity radius/type), mining:tick (sparks at contact), ship:thrust + ship:boostStart/Stop (engine trail behind ships), jump:start (warp streak). Expose update(frameDt) — it is called every frame inside renderFrame — to integrate/age particles. Emit camera:shake{amount} on large explosions and player hits. Cosmetic Math.random() is allowed. Pool aggressively (no per-event allocation in steady state). Read design/specs/10 for the look/palette.`,
scripts\wf-rest.js:38:    `Implement the \`world\` system (src/systems/world.js) + export an enterSector(sectorId,{fromJump}={}) METHOD on the system (main.js will call registry.get('world').enterSector(startSectorId) at boot — do NOT auto-spawn on game:started). Consume src/data/sectors.js (SECTORS graph, STATION_TYPES, dangerTier/wealthIndex/dangerIndex), src/data/mining.js (ASTEROIDS/FIELDS), and import { makeEnemySpawnSpec } from './combat.js'.
scripts\wf-rest.js:40:    - JUMP state machine (§3.8): handle world:requestJump{targetSectorId,via} (must be a neighbor in the SECTORS graph) → CHARGING (chargeNeeded secs, consume fuel) → emit jump:start → sector:exit (despawn) → enterSector(target,{fromJump:true}) → jump:arrive (chance of interdiction → spawn ambush via makeEnemySpawnSpec) → COOLDOWN. Block jump while combat lock (combat:lockChanged). Fuel: state.fuel{current,max}; emit fuel:changed/fuel:empty.
scripts\wf-rest.js:86:    - Star map: draw the SECTORS graph (src/data/sectors.js, positions from sector.position) with edges, current sector highlighted, security/faction coloring, fog for undiscovered (state.world.discovery). Click a reachable neighbor → "Set Course"/jump → emit world:requestJump{targetSectorId,via:'gate'} (or world:requestRoute for multi-hop). Show fuel + jump range.

codex
I’m also keeping an eye on existing dirty edits in `renderer.js` so this lands as an additive patch, not a accidental rewrite of someone else’s 2.0 work.
exec
"C:\\Users\\93rob\\AppData\\Local\\Microsoft\\WindowsApps\\pwsh.exe" -Command "Get-Content src\\data\\palettes.js -Raw" in C:\Users\93rob\Documents\GitHub\SpaceFace
 succeeded in 2844ms:
// src/data/palettes.js – visual palette definitions and ship mesh recipes.
// FACTION_PALETTES: 8 faction color palettes keyed by faction_ IDs.
// SECTOR_PALETTES: 10 sector environmental palettes keyed by sector_ IDs.
// SHIP_RECIPES: ship class mesh-build parameters keyed by ship_ IDs.
// Pure data, no imports, no three/DOM deps.

export const FACTION_PALETTES = {
  faction_scn: {
    primary:   '#3A78FF',
    secondary: '#1A3A8F',
    accent:    '#A0C4FF',
    hull:      '#C8D8F0',
    emissive:  '#3A78FF',
    thruster:  '#88AAFF',
  },
  faction_mts: {
    primary:   '#F2B233',
    secondary: '#8B6020',
    accent:    '#FFE09A',
    hull:      '#E8D8A0',
    emissive:  '#F2B233',
    thruster:  '#FFCC66',
  },
  faction_dmc: {
    primary:   '#C9772E',
    secondary: '#7A4010',
    accent:    '#E8A060',
    hull:      '#A08050',
    emissive:  '#C9772E',
    thruster:  '#FF8844',
  },
  faction_reach: {
    primary:   '#D8334A',
    secondary: '#7A1020',
    accent:    '#FF6680',
    hull:      '#C06070',
    emissive:  '#D8334A',
    thruster:  '#FF4466',
  },
  faction_quiet: {
    primary:   '#7A5FB0',
    secondary: '#3A2060',
    accent:    '#B090E8',
    hull:      '#706080',
    emissive:  '#9070D0',
    thruster:  '#A080D0',
  },
  faction_vael: {
    primary:   '#2FCFA0',
    secondary: '#0A5040',
    accent:    '#80EED0',
    hull:      '#204840',
    emissive:  '#2FCFA0',
    thruster:  '#40FFB8',
  },
  faction_free: {
    primary:   '#4ECBE0',
    secondary: '#206070',
    accent:    '#A0EEF8',
    hull:      '#808090',
    emissive:  '#4ECBE0',
    thruster:  '#60D8EE',
  },
  faction_choir: {
    primary:   '#E85FD0',
    secondary: '#702060',
    accent:    '#F8A0E8',
    hull:      '#905080',
    emissive:  '#E85FD0',
    thruster:  '#FF80E8',
  },
};

// PAINT_PROFILES — the soul of the art direction. Maps a faction's `personality` to a paint profile
// that the render track reads to decide how grimy/chrome/graffitied a ship looks. This makes the
// "dirty outlaw vs clean authority" contrast DATA-DRIVEN: every NPC inherits its look from its
// faction personality automatically, no per-ship authoring needed.
//
//   grime     0..1 — oil streaks, rust blooms, bolted-on patches, dust. 0 = pristine, 1 = filthy.
//   chrome    0..1 — mirror reflectivity (env-map intensity). Authority ships = high; outlaws = ~0.
//   noseArt   null | 'bomber' | 'punk' | 'insignia' — decal style on the hull flanks/nose.
//   killMarks true  — bomb/kill tallies stenciled near the cockpit (combat veterans only).
//   patches   0..1  — probability of bolted-on repair patches (welded plates over battle damage).
//
// The player's faction_free (independent) profile is the haunted ex-gangster runner: heavy grime,
// bomber+punk hybrid nose-art, kill marks, repair patches — a ship with a dark history nobody else
// would touch. Concord/Meridian authority are pristine chrome. Pirates are the filthiest.
export const PAINT_PROFILES = {
  lawful:      { grime: 0.05, chrome: 0.85, noseArt: 'insignia', killMarks: false, patches: 0.0 },  // Concord Navy — pristine chrome, clean insignia
  corporate:   { grime: 0.10, chrome: 0.70, noseArt: 'insignia', killMarks: false, patches: 0.0 },  // Meridian — clean chrome, corporate logos
  independent: { grime: 0.55, chrome: 0.05, noseArt: 'bomber', killMarks: true, patches: 0.4 },     // Free Frontier (PLAYER) — haunted ex-gangster runner
  blue_collar: { grime: 0.35, chrome: 0.0, noseArt: null, killMarks: false, patches: 0.3 },          // Drift Miners — workhorse, honest grime
  pirate:      { grime: 0.85, chrome: 0.0, noseArt: 'punk', killMarks: true, patches: 0.6 },         // Crimson Reach — filthy, tagged, scarred
  smuggler:    { grime: 0.50, chrome: 0.0, noseArt: 'punk', killMarks: false, patches: 0.35 },       // The Quiet — stealthy grime, tags
  xenophobic:  { grime: 0.15, chrome: 0.30, noseArt: 'insignia', killMarks: true, patches: 0.1 },    // The Vael — alien, austere
  // default fallback for any faction lacking a personality match
  default:     { grime: 0.30, chrome: 0.10, noseArt: null, killMarks: false, patches: 0.2 },
};

// The player ship's canonical nose-art seed text — drives the dark-humor stenciled graffiti on the
// Kestrel. "BORROWED TIME" is the in-fiction nickname: a haunted ex-gangster death-ship the player
// took because nobody else would fly it. Render-facing only; never read by gameplay.
export const PLAYER_NOSE_ART = {
  ship_kestrel: { motto: 'BORROWED TIME', mascot: 'ghost', sharkMouth: true, tally: 13 },
};

// Resolve a paint profile for a faction personality string. Returns a fresh merged object so callers
// can safely tweak per-ship without mutating the shared profile.
export function paintProfileFor(personality) {
  return Object.assign({}, PAINT_PROFILES[personality] || PAINT_PROFILES.default);
}

export const SECTOR_PALETTES = {
  sector_helios_prime: {
    skyColor:     '#010818',
    nebulaColor:  '#081840',
    starDensity:  0.9,
    ambientLight: '#0A1830',
    sunColor:     '#FFF0C8',
    sunIntensity: 1.2,
    fogColor:     '#000810',
    fogDensity:   0.00002,
    asteroidTint: '#888090',
  },
  sector_ceres_belt: {
    skyColor:     '#020A10',
    nebulaColor:  '#102030',
    starDensity:  0.8,
    ambientLight: '#101820',
    sunColor:     '#FFE8C0',
    sunIntensity: 0.9,
    fogColor:     '#040C14',
    fogDensity:   0.00005,
    asteroidTint: '#706060',
  },
  sector_tethys_junction: {
    skyColor:     '#010C18',
    nebulaColor:  '#0C2040',
    starDensity:  0.85,
    ambientLight: '#0C1828',
    sunColor:     '#FFE8C0',
    sunIntensity: 0.85,
    fogColor:     '#020810',
    fogDensity:   0.00003,
    asteroidTint: '#787080',
  },
  sector_vesta_forge: {
    skyColor:     '#080410',
    nebulaColor:  '#200808',
    starDensity:  0.75,
    ambientLight: '#180808',
    sunColor:     '#FFC880',
    sunIntensity: 0.8,
    fogColor:     '#080408',
    fogDensity:   0.00006,
    asteroidTint: '#806040',
  },
  sector_pallas_drift: {
    skyColor:     '#040814',
    nebulaColor:  '#082040',
    starDensity:  0.7,
    ambientLight: '#081420',
    sunColor:     '#FFD890',
    sunIntensity: 0.7,
    fogColor:     '#020408',
    fogDensity:   0.00008,
    asteroidTint: '#686070',
  },
  sector_io_reach: {
    skyColor:     '#020810',
    nebulaColor:  '#182840',
    starDensity:  0.65,
    ambientLight: '#0C1820',
    sunColor:     '#FFD0A0',
    sunIntensity: 0.65,
    fogColor:     '#010408',
    fogDensity:   0.0001,
    asteroidTint: '#604848',
  },
  sector_charon_expanse: {
    skyColor:     '#020408',
    nebulaColor:  '#301810',
    starDensity:  0.6,
    ambientLight: '#140808',
    sunColor:     '#FFC070',
    sunIntensity: 0.6,
    fogColor:     '#010204',
    fogDensity:   0.00012,
    asteroidTint: '#582020',
  },
  sector_sker_haven: {
    skyColor:     '#010204',
    nebulaColor:  '#200408',
    starDensity:  0.5,
    ambientLight: '#100404',
    sunColor:     '#FF9050',
    sunIntensity: 0.4,
    fogColor:     '#010101',
    fogDensity:   0.00015,
    asteroidTint: '#401818',
  },
  sector_veil_nebula: {
    skyColor:     '#040818',
    nebulaColor:  '#101840',
    starDensity:  0.4,
    ambientLight: '#081020',
    sunColor:     '#C0D0FF',
    sunIntensity: 0.3,
    fogColor:     '#020408',
    fogDensity:   0.0003,
    asteroidTint: '#303060',
    nebulaIntensity: 0.9,
  },
  sector_ashfall_reach: {
    skyColor:     '#010101',
    nebulaColor:  '#100404',
    starDensity:  0.3,
    ambientLight: '#0C0404',
    sunColor:     '#FF6030',
    sunIntensity: 0.25,
    fogColor:     '#080202',
    fogDensity:   0.0004,
    asteroidTint: '#301010',
    particleColor: '#FF4010',
    particleDensity: 0.6,
  },
};

// Ship class mesh-build parameters (geometry hints for the procedural mesh factory).
export const SHIP_RECIPES = {
  ship_kestrel: {
    hullProfile: 'wedge_s', lengthM: 28, widthM: 14, heightM: 6,
    wingSpan: 0.8, engineCount: 1, engineSize: 'M',
    detailLevel: 1, panelCount: 8, antennaCount: 1,
  },
  ship_pelican: {
    hullProfile: 'wide_body_s', lengthM: 32, widthM: 18, heightM: 8,
    wingSpan: 0.6, engineCount: 2, engineSize: 'M',
    detailLevel: 1, panelCount: 10, antennaCount: 1,
  },
  ship_wasp: {
    hullProfile: 'dart_s', lengthM: 24, widthM: 16, heightM: 5,
    wingSpan: 1.2, engineCount: 1, engineSize: 'M',
    detailLevel: 2, panelCount: 6, antennaCount: 2,
  },
  ship_mule: {
    hullProfile: 'box_m', lengthM: 40, widthM: 20, heightM: 14,
    wingSpan: 0.4, engineCount: 2, engineSize: 'M',
    detailLevel: 1, panelCount: 14, antennaCount: 1,
  },
  ship_drifter: {
    hullProfile: 'wedge_m', lengthM: 44, widthM: 22, heightM: 10,
    wingSpan: 0.9, engineCount: 2, engineSize: 'M',
    detailLevel: 2, panelCount: 12, antennaCount: 2,
  },
  ship_hornet: {
    hullProfile: 'dart_m', lengthM: 36, widthM: 24, heightM: 8,
    wingSpan: 1.4, engineCount: 1, engineSize: 'L',
    detailLevel: 3, panelCount: 8, antennaCount: 3,
  },
  ship_ironback: {
    hullProfile: 'barge_m', lengthM: 56, widthM: 32, heightM: 18,
    wingSpan: 0.3, engineCount: 2, engineSize: 'M',
    detailLevel: 1, panelCount: 20, antennaCount: 1,
  },
  ship_bastion: {
    hullProfile: 'wedge_l', lengthM: 60, widthM: 28, heightM: 14,
    wingSpan: 0.8, engineCount: 2, engineSize: 'L',
    detailLevel: 3, panelCount: 16, antennaCount: 3,
  },
  ship_atlas: {
    hullProfile: 'barge_l', lengthM: 80, widthM: 40, heightM: 22,
    wingSpan: 0.3, engineCount: 4, engineSize: 'L',
    detailLevel: 2, panelCount: 28, antennaCount: 2,
  },
  ship_ranger: {
    hullProfile: 'elongated_m', lengthM: 52, widthM: 20, heightM: 10,
    wingSpan: 1.1, engineCount: 2, engineSize: 'L',
    detailLevel: 3, panelCount: 14, antennaCount: 4,
  },
  ship_warden: {
    hullProfile: 'wedge_xl', lengthM: 90, widthM: 40, heightM: 20,
    wingSpan: 0.7, engineCount: 3, engineSize: 'L',
    detailLevel: 4, panelCount: 24, antennaCount: 4,
  },
  ship_colossus: {
    hullProfile: 'capital_m', lengthM: 120, widthM: 55, heightM: 28,
    wingSpan: 0.5, engineCount: 4, engineSize: 'L',
    detailLevel: 4, panelCount: 36, antennaCount: 5,
  },
  ship_leviathan: {
    hullProfile: 'capital_xl', lengthM: 200, widthM: 90, heightM: 45,
    wingSpan: 0.4, engineCount: 6, engineSize: 'L',
    detailLevel: 5, panelCount: 60, antennaCount: 8,
  },
};


codex
There’s an older `src/data/palettes.js` sector-palette concept in the repo, but this task wants the live sector graph itself to carry the runtime palette block. I’m leaving that older module alone and making `sectors.js` authoritative for E2.
exec
"C:\\Users\\93rob\\AppData\\Local\\Microsoft\\WindowsApps\\pwsh.exe" -Command "node - <<'NODE'
function lin(c){c/=255; return c<=0.04045?c/12.92:Math.pow((c+0.055)/1.055,2.4)}
function lum(hex){return 0.2126*lin((hex>>16)&255)+0.7152*lin((hex>>8)&255)+0.0722*lin(hex&255)}
const palettes={
core:{ambient:0x42506f,fill:0x39d0ff},
belt:{ambient:0x594a42,fill:0xffb13d},
fringe:{ambient:0x584343,fill:0xff6a2a},
anomaly:{ambient:0x494760,fill:0x5dffb2},
};
for (const [k,p] of Object.entries(palettes)){console.log(k, lum(p.ambient), lum(p.fill), lum(p.ambient)+lum(p.fill), (lum(p.ambient)+lum(p.fill))/(lum(palettes.core.ambient)+lum(palettes.core.fill)))}
NODE" in C:\Users\93rob\Documents\GitHub\SpaceFace
 exited 1 in 1675ms:
ParserError: 
Line |
   2 |  node - <<'NODE'
     |          ~
     | Missing file specification after redirection operator.

codex
Small shell wrinkle: PowerShell didn’t like my Unix-style inline Node heredoc, so I’m switching to `node -e` for quick luminance math. No repo files touched by that.
exec
"C:\\Users\\93rob\\AppData\\Local\\Microsoft\\WindowsApps\\pwsh.exe" -Command 'node -e "function lin(c){c/=255;return c<=0.04045?c/12.92:Math.pow((c+0.055)/1.055,2.4)} function lum(hex){return 0.2126*lin((hex>>16)&255)+0.7152*lin((hex>>8)&255)+0.0722*lin(hex&255)} const palettes={core:{ambient:0x42506f,fill:0x39d0ff},belt:{ambient:0x594a42,fill:0xffb13d},fringe:{ambient:0x584343,fill:0xff6a2a},anomaly:{ambient:0x494760,fill:0x5dffb2}}; const base=lum(palettes.core.ambient)+lum(palettes.core.fill); for (const [k,p] of Object.entries(palettes)){const v=lum(p.ambient)+lum(p.fill); console.log(k, lum(p.ambient).toFixed(4), lum(p.fill).toFixed(4), v.toFixed(4), (v/base).toFixed(3));}"' in C:\Users\93rob\Documents\GitHub\SpaceFace
 succeeded in 4966ms:
core 0.0804 0.5320 0.6124 1.000
belt 0.0741 0.5304 0.6046 0.987
fringe 0.0649 0.3174 0.3823 0.624
anomaly 0.0677 0.7706 0.8383 1.369

exec
"C:\\Users\\93rob\\AppData\\Local\\Microsoft\\WindowsApps\\pwsh.exe" -Command 'node -e "function lin(c){c/=255;return c<=0.04045?c/12.92:Math.pow((c+0.055)/1.055,2.4)} function lum(hex){return 0.2126*lin((hex>>16)&255)+0.7152*lin((hex>>8)&255)+0.0722*lin(hex&255)} const tests={fr1:{ambient:0x584343,fill:0xff9b55},fr2:{ambient:0x584343,fill:0xffaa66},fr3:{ambient:0x5a3f38,fill:0xffb070},an1:{ambient:0x494760,fill:0x4ddc92},an2:{ambient:0x4d4563,fill:0x52cc87},an3:{ambient:0x454a60,fill:0x7cd999},belt:{ambient:0x594a42,fill:0xffb13d},core:{ambient:0x42506f,fill:0x39d0ff}}; const base=lum(tests.core.ambient)+lum(tests.core.fill); for (const [k,p] of Object.entries(tests)){const v=lum(p.ambient)+lum(p.fill); console.log(k, lum(p.ambient).toFixed(4), lum(p.fill).toFixed(4), v.toFixed(4), (v/base).toFixed(3));}"' in C:\Users\93rob\Documents\GitHub\SpaceFace
 succeeded in 3206ms:
fr1 0.0649 0.4536 0.5185 0.847
fr2 0.0649 0.5097 0.5746 0.938
fr3 0.0601 0.5348 0.5949 0.971
an1 0.0677 0.5484 0.6161 1.006
an2 0.0673 0.4673 0.5346 0.873
an3 0.0701 0.5621 0.6322 1.032
belt 0.0741 0.5304 0.6046 0.987
core 0.0804 0.5320 0.6124 1.000

codex
For the palette validator I’m measuring the combined ambient+fill luminance against the hardcoded core baseline. Red-heavy palettes are visually moody but mathematically dark, so I’m tuning them with sodium/amber fill while keeping the ambient color itself near the baseline floor.
codex
I’m about to write the patch now: palette constants plus sector assignments, renderer transition plumbing, tint normalization in `starfield.js`, the validator script, and one package script entry.
apply patch
patch: completed
C:\Users\93rob\Documents\GitHub\SpaceFace\src\data\sectors.js
diff --git a/src/data/sectors.js b/src/data/sectors.js
index 9c63f69479b241fc848258e3fe2161547793fa46..1814c409089f818b6ab4758b3f0cf8f8531f2452
--- a/src/data/sectors.js
+++ b/src/data/sectors.js
@@ -10,10 +10,30 @@
 export const HAZARD_TYPES  = ['dense_asteroid', 'nebula', 'radiation', 'debris'];
 export const POI_TYPES     = ['beacon', 'derelict', 'cache', 'colony', 'anomaly', 'wormhole', 'wreck'];
 
+export const SECTOR_PALETTE_CLASSES = {
+  core: {
+    key: 0xcfe2ff, rim: 0x6a5cff, fill: 0x39d0ff, ambient: 0x42506f,
+    fog: 0x0a1430, fogDensity: 0.00026, nebulaTint: 0x1e3a6a, dust: 0x7ea7c7,
+  },
+  belt: {
+    key: 0xffd59a, rim: 0xb56d2f, fill: 0xffb13d, ambient: 0x594a42,
+    fog: 0x2a160c, fogDensity: 0.00034, nebulaTint: 0x8a4a1e, dust: 0xc0793d,
+  },
+  fringe: {
+    key: 0xffb07a, rim: 0xff3f2d, fill: 0xffaa66, ambient: 0x584343,
+    fog: 0x2a0d0a, fogDensity: 0.00042, nebulaTint: 0x8a1e1e, dust: 0xc15032,
+  },
+  anomaly: {
+    key: 0xc8b6ff, rim: 0x54ffb0, fill: 0x4ddc92, ambient: 0x494760,
+    fog: 0x160d2c, fogDensity: 0.00036, nebulaTint: 0x5a1e8a, dust: 0x79ffc8,
+  },
+};
+
 export const SECTORS = [
   {
     id: 'sector_helios_prime', name: 'Helios Prime', tier: 0, security: 0.98, charted: true,
     factionId: 'faction_scn', position: { x: 0, y: 0 }, worldRadius: 3500,
+    palette: SECTOR_PALETTE_CLASSES.core,
     // Tutorial home sector: NO hostile spawns (enemyDensity 0). A brand-new pilot must not be
     // hunted before learning the ropes; danger ramps up only in neighbouring sectors.
     trafficPerMin: 18, enemyDensity: 0, enemyLevel: [1, 2],
@@ -37,6 +57,7 @@
   {
     id: 'sector_ceres_belt', name: 'Ceres Belt', tier: 1, security: 0.72, charted: true,
     factionId: 'faction_dmc', position: { x: -3, y: 2 }, worldRadius: 4200,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 10, enemyDensity: 0.18, enemyLevel: [2, 4],
     neighbors: ['sector_helios_prime', 'sector_tethys_junction', 'sector_pallas_drift'],
     stations: [
@@ -57,6 +78,7 @@
   {
     id: 'sector_tethys_junction', name: 'Tethys Junction', tier: 1, security: 0.65, charted: true,
     factionId: 'faction_mts', position: { x: 3, y: 2 }, worldRadius: 4000,
+    palette: SECTOR_PALETTE_CLASSES.core,
     trafficPerMin: 14, enemyDensity: 0.20, enemyLevel: [2, 4],
     neighbors: ['sector_helios_prime', 'sector_ceres_belt', 'sector_vesta_forge', 'sector_io_reach'],
     stations: [
@@ -72,6 +94,7 @@
   {
     id: 'sector_vesta_forge', name: 'Vesta Forge', tier: 1, security: 0.60, charted: true,
     factionId: 'faction_dmc', position: { x: 0, y: 4 }, worldRadius: 4300,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 9, enemyDensity: 0.25, enemyLevel: [3, 5],
     neighbors: ['sector_helios_prime', 'sector_tethys_junction', 'sector_charon_expanse'],
     stations: [
@@ -89,6 +112,7 @@
   {
     id: 'sector_pallas_drift', name: 'Pallas Drift', tier: 2, security: 0.42, charted: true,
     factionId: 'faction_mts', position: { x: -5, y: 5 }, worldRadius: 4500,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 7, enemyDensity: 0.40, enemyLevel: [4, 7],
     neighbors: ['sector_ceres_belt', 'sector_io_reach', 'sector_sker_haven'],
     stations: [
@@ -109,6 +133,7 @@
   {
     id: 'sector_io_reach', name: 'Io Reach', tier: 2, security: 0.35, charted: true,
     factionId: 'faction_free', position: { x: 5, y: 5 }, worldRadius: 4600,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 5, enemyDensity: 0.50, enemyLevel: [5, 8],
     neighbors: ['sector_tethys_junction', 'sector_pallas_drift', 'sector_charon_expanse', 'sector_veil_nebula'],
     stations: [
@@ -132,6 +157,7 @@
   {
     id: 'sector_charon_expanse', name: 'Charon Expanse', tier: 2, security: 0.30, charted: true,
     factionId: 'faction_dmc', position: { x: 2, y: 7 }, worldRadius: 4800,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 4, enemyDensity: 0.50, enemyLevel: [5, 9],
     neighbors: ['sector_vesta_forge', 'sector_io_reach', 'sector_ashfall_reach'],
     stations: [
@@ -151,6 +177,7 @@
   {
     id: 'sector_sker_haven', name: 'Sker Haven', tier: 3, security: 0.08, charted: false,
     factionId: 'faction_reach', position: { x: -7, y: 8 }, worldRadius: 5000,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 0, enemyDensity: 0.70, enemyLevel: [7, 11],
     neighbors: ['sector_pallas_drift', 'sector_veil_nebula'],
     stations: [
@@ -169,6 +196,7 @@
   {
     id: 'sector_veil_nebula', name: 'Veil Nebula', tier: 3, security: 0.12, charted: false,
     factionId: 'faction_free', position: { x: 7, y: 9 }, worldRadius: 5200,
+    palette: SECTOR_PALETTE_CLASSES.anomaly,
     trafficPerMin: 0, enemyDensity: 0.65, enemyLevel: [8, 12],
     neighbors: ['sector_io_reach', 'sector_sker_haven'],
     wormholeTo: { sectorId: 'sector_ashfall_reach', gatedBy: 'tech:tech_long_range_survey' },
@@ -188,6 +216,7 @@
   {
     id: 'sector_ashfall_reach', name: 'Ashfall Reach', tier: 4, security: 0.05, charted: false,
     factionId: 'faction_vael', position: { x: 4, y: 11 }, worldRadius: 5500,
+    palette: SECTOR_PALETTE_CLASSES.anomaly,
     trafficPerMin: 0, enemyDensity: 0.80, enemyLevel: [10, 15],
     neighbors: ['sector_charon_expanse'],
     stations: [

diff --git a/src/data/sectors.js b/src/data/sectors.js
index 9c63f69479b241fc848258e3fe2161547793fa46..1814c409089f818b6ab4758b3f0cf8f8531f2452
--- a/src/data/sectors.js
+++ b/src/data/sectors.js
@@ -10,10 +10,30 @@
 export const HAZARD_TYPES  = ['dense_asteroid', 'nebula', 'radiation', 'debris'];
 export const POI_TYPES     = ['beacon', 'derelict', 'cache', 'colony', 'anomaly', 'wormhole', 'wreck'];
 
+export const SECTOR_PALETTE_CLASSES = {
+  core: {
+    key: 0xcfe2ff, rim: 0x6a5cff, fill: 0x39d0ff, ambient: 0x42506f,
+    fog: 0x0a1430, fogDensity: 0.00026, nebulaTint: 0x1e3a6a, dust: 0x7ea7c7,
+  },
+  belt: {
+    key: 0xffd59a, rim: 0xb56d2f, fill: 0xffb13d, ambient: 0x594a42,
+    fog: 0x2a160c, fogDensity: 0.00034, nebulaTint: 0x8a4a1e, dust: 0xc0793d,
+  },
+  fringe: {
+    key: 0xffb07a, rim: 0xff3f2d, fill: 0xffaa66, ambient: 0x584343,
+    fog: 0x2a0d0a, fogDensity: 0.00042, nebulaTint: 0x8a1e1e, dust: 0xc15032,
+  },
+  anomaly: {
+    key: 0xc8b6ff, rim: 0x54ffb0, fill: 0x4ddc92, ambient: 0x494760,
+    fog: 0x160d2c, fogDensity: 0.00036, nebulaTint: 0x5a1e8a, dust: 0x79ffc8,
+  },
+};
+
 export const SECTORS = [
   {
     id: 'sector_helios_prime', name: 'Helios Prime', tier: 0, security: 0.98, charted: true,
     factionId: 'faction_scn', position: { x: 0, y: 0 }, worldRadius: 3500,
+    palette: SECTOR_PALETTE_CLASSES.core,
     // Tutorial home sector: NO hostile spawns (enemyDensity 0). A brand-new pilot must not be
     // hunted before learning the ropes; danger ramps up only in neighbouring sectors.
     trafficPerMin: 18, enemyDensity: 0, enemyLevel: [1, 2],
@@ -37,6 +57,7 @@
   {
     id: 'sector_ceres_belt', name: 'Ceres Belt', tier: 1, security: 0.72, charted: true,
     factionId: 'faction_dmc', position: { x: -3, y: 2 }, worldRadius: 4200,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 10, enemyDensity: 0.18, enemyLevel: [2, 4],
     neighbors: ['sector_helios_prime', 'sector_tethys_junction', 'sector_pallas_drift'],
     stations: [
@@ -57,6 +78,7 @@
   {
     id: 'sector_tethys_junction', name: 'Tethys Junction', tier: 1, security: 0.65, charted: true,
     factionId: 'faction_mts', position: { x: 3, y: 2 }, worldRadius: 4000,
+    palette: SECTOR_PALETTE_CLASSES.core,
     trafficPerMin: 14, enemyDensity: 0.20, enemyLevel: [2, 4],
     neighbors: ['sector_helios_prime', 'sector_ceres_belt', 'sector_vesta_forge', 'sector_io_reach'],
     stations: [
@@ -72,6 +94,7 @@
   {
     id: 'sector_vesta_forge', name: 'Vesta Forge', tier: 1, security: 0.60, charted: true,
     factionId: 'faction_dmc', position: { x: 0, y: 4 }, worldRadius: 4300,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 9, enemyDensity: 0.25, enemyLevel: [3, 5],
     neighbors: ['sector_helios_prime', 'sector_tethys_junction', 'sector_charon_expanse'],
     stations: [
@@ -89,6 +112,7 @@
   {
     id: 'sector_pallas_drift', name: 'Pallas Drift', tier: 2, security: 0.42, charted: true,
     factionId: 'faction_mts', position: { x: -5, y: 5 }, worldRadius: 4500,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 7, enemyDensity: 0.40, enemyLevel: [4, 7],
     neighbors: ['sector_ceres_belt', 'sector_io_reach', 'sector_sker_haven'],
     stations: [
@@ -109,6 +133,7 @@
   {
     id: 'sector_io_reach', name: 'Io Reach', tier: 2, security: 0.35, charted: true,
     factionId: 'faction_free', position: { x: 5, y: 5 }, worldRadius: 4600,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 5, enemyDensity: 0.50, enemyLevel: [5, 8],
     neighbors: ['sector_tethys_junction', 'sector_pallas_drift', 'sector_charon_expanse', 'sector_veil_nebula'],
     stations: [
@@ -132,6 +157,7 @@
   {
     id: 'sector_charon_expanse', name: 'Charon Expanse', tier: 2, security: 0.30, charted: true,
     factionId: 'faction_dmc', position: { x: 2, y: 7 }, worldRadius: 4800,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 4, enemyDensity: 0.50, enemyLevel: [5, 9],
     neighbors: ['sector_vesta_forge', 'sector_io_reach', 'sector_ashfall_reach'],
     stations: [
@@ -151,6 +177,7 @@
   {
     id: 'sector_sker_haven', name: 'Sker Haven', tier: 3, security: 0.08, charted: false,
     factionId: 'faction_reach', position: { x: -7, y: 8 }, worldRadius: 5000,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 0, enemyDensity: 0.70, enemyLevel: [7, 11],
     neighbors: ['sector_pallas_drift', 'sector_veil_nebula'],
     stations: [
@@ -169,6 +196,7 @@
   {
     id: 'sector_veil_nebula', name: 'Veil Nebula', tier: 3, security: 0.12, charted: false,
     factionId: 'faction_free', position: { x: 7, y: 9 }, worldRadius: 5200,
+    palette: SECTOR_PALETTE_CLASSES.anomaly,
     trafficPerMin: 0, enemyDensity: 0.65, enemyLevel: [8, 12],
     neighbors: ['sector_io_reach', 'sector_sker_haven'],
     wormholeTo: { sectorId: 'sector_ashfall_reach', gatedBy: 'tech:tech_long_range_survey' },
@@ -188,6 +216,7 @@
   {
     id: 'sector_ashfall_reach', name: 'Ashfall Reach', tier: 4, security: 0.05, charted: false,
     factionId: 'faction_vael', position: { x: 4, y: 11 }, worldRadius: 5500,
+    palette: SECTOR_PALETTE_CLASSES.anomaly,
     trafficPerMin: 0, enemyDensity: 0.80, enemyLevel: [10, 15],
     neighbors: ['sector_charon_expanse'],
     stations: [

apply patch
patch: completed
C:\Users\93rob\Documents\GitHub\SpaceFace\src\render\starfield.js
diff --git a/src/data/sectors.js b/src/data/sectors.js
index 9c63f69479b241fc848258e3fe2161547793fa46..1814c409089f818b6ab4758b3f0cf8f8531f2452
--- a/src/data/sectors.js
+++ b/src/data/sectors.js
@@ -10,10 +10,30 @@
 export const HAZARD_TYPES  = ['dense_asteroid', 'nebula', 'radiation', 'debris'];
 export const POI_TYPES     = ['beacon', 'derelict', 'cache', 'colony', 'anomaly', 'wormhole', 'wreck'];
 
+export const SECTOR_PALETTE_CLASSES = {
+  core: {
+    key: 0xcfe2ff, rim: 0x6a5cff, fill: 0x39d0ff, ambient: 0x42506f,
+    fog: 0x0a1430, fogDensity: 0.00026, nebulaTint: 0x1e3a6a, dust: 0x7ea7c7,
+  },
+  belt: {
+    key: 0xffd59a, rim: 0xb56d2f, fill: 0xffb13d, ambient: 0x594a42,
+    fog: 0x2a160c, fogDensity: 0.00034, nebulaTint: 0x8a4a1e, dust: 0xc0793d,
+  },
+  fringe: {
+    key: 0xffb07a, rim: 0xff3f2d, fill: 0xffaa66, ambient: 0x584343,
+    fog: 0x2a0d0a, fogDensity: 0.00042, nebulaTint: 0x8a1e1e, dust: 0xc15032,
+  },
+  anomaly: {
+    key: 0xc8b6ff, rim: 0x54ffb0, fill: 0x4ddc92, ambient: 0x494760,
+    fog: 0x160d2c, fogDensity: 0.00036, nebulaTint: 0x5a1e8a, dust: 0x79ffc8,
+  },
+};
+
 export const SECTORS = [
   {
     id: 'sector_helios_prime', name: 'Helios Prime', tier: 0, security: 0.98, charted: true,
     factionId: 'faction_scn', position: { x: 0, y: 0 }, worldRadius: 3500,
+    palette: SECTOR_PALETTE_CLASSES.core,
     // Tutorial home sector: NO hostile spawns (enemyDensity 0). A brand-new pilot must not be
     // hunted before learning the ropes; danger ramps up only in neighbouring sectors.
     trafficPerMin: 18, enemyDensity: 0, enemyLevel: [1, 2],
@@ -37,6 +57,7 @@
   {
     id: 'sector_ceres_belt', name: 'Ceres Belt', tier: 1, security: 0.72, charted: true,
     factionId: 'faction_dmc', position: { x: -3, y: 2 }, worldRadius: 4200,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 10, enemyDensity: 0.18, enemyLevel: [2, 4],
     neighbors: ['sector_helios_prime', 'sector_tethys_junction', 'sector_pallas_drift'],
     stations: [
@@ -57,6 +78,7 @@
   {
     id: 'sector_tethys_junction', name: 'Tethys Junction', tier: 1, security: 0.65, charted: true,
     factionId: 'faction_mts', position: { x: 3, y: 2 }, worldRadius: 4000,
+    palette: SECTOR_PALETTE_CLASSES.core,
     trafficPerMin: 14, enemyDensity: 0.20, enemyLevel: [2, 4],
     neighbors: ['sector_helios_prime', 'sector_ceres_belt', 'sector_vesta_forge', 'sector_io_reach'],
     stations: [
@@ -72,6 +94,7 @@
   {
     id: 'sector_vesta_forge', name: 'Vesta Forge', tier: 1, security: 0.60, charted: true,
     factionId: 'faction_dmc', position: { x: 0, y: 4 }, worldRadius: 4300,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 9, enemyDensity: 0.25, enemyLevel: [3, 5],
     neighbors: ['sector_helios_prime', 'sector_tethys_junction', 'sector_charon_expanse'],
     stations: [
@@ -89,6 +112,7 @@
   {
     id: 'sector_pallas_drift', name: 'Pallas Drift', tier: 2, security: 0.42, charted: true,
     factionId: 'faction_mts', position: { x: -5, y: 5 }, worldRadius: 4500,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 7, enemyDensity: 0.40, enemyLevel: [4, 7],
     neighbors: ['sector_ceres_belt', 'sector_io_reach', 'sector_sker_haven'],
     stations: [
@@ -109,6 +133,7 @@
   {
     id: 'sector_io_reach', name: 'Io Reach', tier: 2, security: 0.35, charted: true,
     factionId: 'faction_free', position: { x: 5, y: 5 }, worldRadius: 4600,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 5, enemyDensity: 0.50, enemyLevel: [5, 8],
     neighbors: ['sector_tethys_junction', 'sector_pallas_drift', 'sector_charon_expanse', 'sector_veil_nebula'],
     stations: [
@@ -132,6 +157,7 @@
   {
     id: 'sector_charon_expanse', name: 'Charon Expanse', tier: 2, security: 0.30, charted: true,
     factionId: 'faction_dmc', position: { x: 2, y: 7 }, worldRadius: 4800,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 4, enemyDensity: 0.50, enemyLevel: [5, 9],
     neighbors: ['sector_vesta_forge', 'sector_io_reach', 'sector_ashfall_reach'],
     stations: [
@@ -151,6 +177,7 @@
   {
     id: 'sector_sker_haven', name: 'Sker Haven', tier: 3, security: 0.08, charted: false,
     factionId: 'faction_reach', position: { x: -7, y: 8 }, worldRadius: 5000,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 0, enemyDensity: 0.70, enemyLevel: [7, 11],
     neighbors: ['sector_pallas_drift', 'sector_veil_nebula'],
     stations: [
@@ -169,6 +196,7 @@
   {
     id: 'sector_veil_nebula', name: 'Veil Nebula', tier: 3, security: 0.12, charted: false,
     factionId: 'faction_free', position: { x: 7, y: 9 }, worldRadius: 5200,
+    palette: SECTOR_PALETTE_CLASSES.anomaly,
     trafficPerMin: 0, enemyDensity: 0.65, enemyLevel: [8, 12],
     neighbors: ['sector_io_reach', 'sector_sker_haven'],
     wormholeTo: { sectorId: 'sector_ashfall_reach', gatedBy: 'tech:tech_long_range_survey' },
@@ -188,6 +216,7 @@
   {
     id: 'sector_ashfall_reach', name: 'Ashfall Reach', tier: 4, security: 0.05, charted: false,
     factionId: 'faction_vael', position: { x: 4, y: 11 }, worldRadius: 5500,
+    palette: SECTOR_PALETTE_CLASSES.anomaly,
     trafficPerMin: 0, enemyDensity: 0.80, enemyLevel: [10, 15],
     neighbors: ['sector_charon_expanse'],
     stations: [
diff --git a/src/render/starfield.js b/src/render/starfield.js
index d76965c563ac0d99166bb382577d2f6eaa4a6d0f..aecb37608592e6ff981ddaf8fd6107d17a0632e6
--- a/src/render/starfield.js
+++ b/src/render/starfield.js
@@ -116,10 +116,18 @@
   return c;
 }
 
-// --- small color helpers for sector tinting (no deps) ---
-function hexToRgb(hex) {
-  const h = hex.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
-}
+// --- small color helpers for sector tinting (no deps) ---
+function normalizeTint(tint) {
+  if (tint == null) return null;
+  if (typeof tint === 'number' && Number.isFinite(tint)) {
+    return '#' + ((tint >>> 0) & 0xffffff).toString(16).padStart(6, '0');
+  }
+  if (typeof tint === 'string') return tint.startsWith('#') ? tint : '#' + tint.replace(/^0x/i, '');
+  return null;
+}
+function hexToRgb(hex) {
+  const h = hex.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
+}
 function rgbToHex(r, g, b) {
   const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
   return '#' + c(r) + c(g) + c(b);
@@ -176,11 +184,11 @@
   ctx.restore();
 }
 
-export function createStarfield(scene, opts = {}) {
-  const layers = [];
-  const sprite = makeStarSprite();
-  let bgTexture = null;
-  let currentTint = opts.tint || null;
+export function createStarfield(scene, opts = {}) {
+  const layers = [];
+  const sprite = makeStarSprite();
+  let bgTexture = null;
+  let currentTint = normalizeTint(opts.tint);
 
   // star tints (mostly cool white/blue with a few warm + teal accents)
   const TINTS = [0xffffff, 0xcfe0ff, 0x9fb6e0, 0xfff0d8, 0x8af0d6, 0xbfd2ff];
@@ -297,13 +305,14 @@
       // GR-7: slow-rotate the distant 3D planets so they read as real spinning worlds, not billboards.
       for (const p of distantPlanets) p.mesh.rotation.y += dt * p.spin;
     },
-    // Swap the nebula mood on sector enter — each region of the galaxy reads with its own color
-    // signature (core = clean blue, industrial = rust/amber, frontier = blood-red, alien = violet).
-    setSectorTint(tint) {
-      if (tint === currentTint) return;
-      currentTint = tint || null;
-      applyBackground(currentTint);
-    },
+    // Swap the nebula mood on sector enter — each region of the galaxy reads with its own color
+    // signature (core = clean blue, industrial = rust/amber, frontier = blood-red, alien = violet).
+    setSectorTint(tint) {
+      const nextTint = normalizeTint(tint);
+      if (nextTint === currentTint) return;
+      currentTint = nextTint;
+      applyBackground(currentTint);
+    },
     setWarp() { /* extended by vfx during jump */ },
   };
 }

diff --git a/src/data/sectors.js b/src/data/sectors.js
index 9c63f69479b241fc848258e3fe2161547793fa46..1814c409089f818b6ab4758b3f0cf8f8531f2452
--- a/src/data/sectors.js
+++ b/src/data/sectors.js
@@ -10,10 +10,30 @@
 export const HAZARD_TYPES  = ['dense_asteroid', 'nebula', 'radiation', 'debris'];
 export const POI_TYPES     = ['beacon', 'derelict', 'cache', 'colony', 'anomaly', 'wormhole', 'wreck'];
 
+export const SECTOR_PALETTE_CLASSES = {
+  core: {
+    key: 0xcfe2ff, rim: 0x6a5cff, fill: 0x39d0ff, ambient: 0x42506f,
+    fog: 0x0a1430, fogDensity: 0.00026, nebulaTint: 0x1e3a6a, dust: 0x7ea7c7,
+  },
+  belt: {
+    key: 0xffd59a, rim: 0xb56d2f, fill: 0xffb13d, ambient: 0x594a42,
+    fog: 0x2a160c, fogDensity: 0.00034, nebulaTint: 0x8a4a1e, dust: 0xc0793d,
+  },
+  fringe: {
+    key: 0xffb07a, rim: 0xff3f2d, fill: 0xffaa66, ambient: 0x584343,
+    fog: 0x2a0d0a, fogDensity: 0.00042, nebulaTint: 0x8a1e1e, dust: 0xc15032,
+  },
+  anomaly: {
+    key: 0xc8b6ff, rim: 0x54ffb0, fill: 0x4ddc92, ambient: 0x494760,
+    fog: 0x160d2c, fogDensity: 0.00036, nebulaTint: 0x5a1e8a, dust: 0x79ffc8,
+  },
+};
+
 export const SECTORS = [
   {
     id: 'sector_helios_prime', name: 'Helios Prime', tier: 0, security: 0.98, charted: true,
     factionId: 'faction_scn', position: { x: 0, y: 0 }, worldRadius: 3500,
+    palette: SECTOR_PALETTE_CLASSES.core,
     // Tutorial home sector: NO hostile spawns (enemyDensity 0). A brand-new pilot must not be
     // hunted before learning the ropes; danger ramps up only in neighbouring sectors.
     trafficPerMin: 18, enemyDensity: 0, enemyLevel: [1, 2],
@@ -37,6 +57,7 @@
   {
     id: 'sector_ceres_belt', name: 'Ceres Belt', tier: 1, security: 0.72, charted: true,
     factionId: 'faction_dmc', position: { x: -3, y: 2 }, worldRadius: 4200,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 10, enemyDensity: 0.18, enemyLevel: [2, 4],
     neighbors: ['sector_helios_prime', 'sector_tethys_junction', 'sector_pallas_drift'],
     stations: [
@@ -57,6 +78,7 @@
   {
     id: 'sector_tethys_junction', name: 'Tethys Junction', tier: 1, security: 0.65, charted: true,
     factionId: 'faction_mts', position: { x: 3, y: 2 }, worldRadius: 4000,
+    palette: SECTOR_PALETTE_CLASSES.core,
     trafficPerMin: 14, enemyDensity: 0.20, enemyLevel: [2, 4],
     neighbors: ['sector_helios_prime', 'sector_ceres_belt', 'sector_vesta_forge', 'sector_io_reach'],
     stations: [
@@ -72,6 +94,7 @@
   {
     id: 'sector_vesta_forge', name: 'Vesta Forge', tier: 1, security: 0.60, charted: true,
     factionId: 'faction_dmc', position: { x: 0, y: 4 }, worldRadius: 4300,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 9, enemyDensity: 0.25, enemyLevel: [3, 5],
     neighbors: ['sector_helios_prime', 'sector_tethys_junction', 'sector_charon_expanse'],
     stations: [
@@ -89,6 +112,7 @@
   {
     id: 'sector_pallas_drift', name: 'Pallas Drift', tier: 2, security: 0.42, charted: true,
     factionId: 'faction_mts', position: { x: -5, y: 5 }, worldRadius: 4500,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 7, enemyDensity: 0.40, enemyLevel: [4, 7],
     neighbors: ['sector_ceres_belt', 'sector_io_reach', 'sector_sker_haven'],
     stations: [
@@ -109,6 +133,7 @@
   {
     id: 'sector_io_reach', name: 'Io Reach', tier: 2, security: 0.35, charted: true,
     factionId: 'faction_free', position: { x: 5, y: 5 }, worldRadius: 4600,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 5, enemyDensity: 0.50, enemyLevel: [5, 8],
     neighbors: ['sector_tethys_junction', 'sector_pallas_drift', 'sector_charon_expanse', 'sector_veil_nebula'],
     stations: [
@@ -132,6 +157,7 @@
   {
     id: 'sector_charon_expanse', name: 'Charon Expanse', tier: 2, security: 0.30, charted: true,
     factionId: 'faction_dmc', position: { x: 2, y: 7 }, worldRadius: 4800,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 4, enemyDensity: 0.50, enemyLevel: [5, 9],
     neighbors: ['sector_vesta_forge', 'sector_io_reach', 'sector_ashfall_reach'],
     stations: [
@@ -151,6 +177,7 @@
   {
     id: 'sector_sker_haven', name: 'Sker Haven', tier: 3, security: 0.08, charted: false,
     factionId: 'faction_reach', position: { x: -7, y: 8 }, worldRadius: 5000,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 0, enemyDensity: 0.70, enemyLevel: [7, 11],
     neighbors: ['sector_pallas_drift', 'sector_veil_nebula'],
     stations: [
@@ -169,6 +196,7 @@
   {
     id: 'sector_veil_nebula', name: 'Veil Nebula', tier: 3, security: 0.12, charted: false,
     factionId: 'faction_free', position: { x: 7, y: 9 }, worldRadius: 5200,
+    palette: SECTOR_PALETTE_CLASSES.anomaly,
     trafficPerMin: 0, enemyDensity: 0.65, enemyLevel: [8, 12],
     neighbors: ['sector_io_reach', 'sector_sker_haven'],
     wormholeTo: { sectorId: 'sector_ashfall_reach', gatedBy: 'tech:tech_long_range_survey' },
@@ -188,6 +216,7 @@
   {
     id: 'sector_ashfall_reach', name: 'Ashfall Reach', tier: 4, security: 0.05, charted: false,
     factionId: 'faction_vael', position: { x: 4, y: 11 }, worldRadius: 5500,
+    palette: SECTOR_PALETTE_CLASSES.anomaly,
     trafficPerMin: 0, enemyDensity: 0.80, enemyLevel: [10, 15],
     neighbors: ['sector_charon_expanse'],
     stations: [
diff --git a/src/render/starfield.js b/src/render/starfield.js
index d76965c563ac0d99166bb382577d2f6eaa4a6d0f..aecb37608592e6ff981ddaf8fd6107d17a0632e6
--- a/src/render/starfield.js
+++ b/src/render/starfield.js
@@ -116,10 +116,18 @@
   return c;
 }
 
-// --- small color helpers for sector tinting (no deps) ---
-function hexToRgb(hex) {
-  const h = hex.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
-}
+// --- small color helpers for sector tinting (no deps) ---
+function normalizeTint(tint) {
+  if (tint == null) return null;
+  if (typeof tint === 'number' && Number.isFinite(tint)) {
+    return '#' + ((tint >>> 0) & 0xffffff).toString(16).padStart(6, '0');
+  }
+  if (typeof tint === 'string') return tint.startsWith('#') ? tint : '#' + tint.replace(/^0x/i, '');
+  return null;
+}
+function hexToRgb(hex) {
+  const h = hex.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
+}
 function rgbToHex(r, g, b) {
   const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
   return '#' + c(r) + c(g) + c(b);
@@ -176,11 +184,11 @@
   ctx.restore();
 }
 
-export function createStarfield(scene, opts = {}) {
-  const layers = [];
-  const sprite = makeStarSprite();
-  let bgTexture = null;
-  let currentTint = opts.tint || null;
+export function createStarfield(scene, opts = {}) {
+  const layers = [];
+  const sprite = makeStarSprite();
+  let bgTexture = null;
+  let currentTint = normalizeTint(opts.tint);
 
   // star tints (mostly cool white/blue with a few warm + teal accents)
   const TINTS = [0xffffff, 0xcfe0ff, 0x9fb6e0, 0xfff0d8, 0x8af0d6, 0xbfd2ff];
@@ -297,13 +305,14 @@
       // GR-7: slow-rotate the distant 3D planets so they read as real spinning worlds, not billboards.
       for (const p of distantPlanets) p.mesh.rotation.y += dt * p.spin;
     },
-    // Swap the nebula mood on sector enter — each region of the galaxy reads with its own color
-    // signature (core = clean blue, industrial = rust/amber, frontier = blood-red, alien = violet).
-    setSectorTint(tint) {
-      if (tint === currentTint) return;
-      currentTint = tint || null;
-      applyBackground(currentTint);
-    },
+    // Swap the nebula mood on sector enter — each region of the galaxy reads with its own color
+    // signature (core = clean blue, industrial = rust/amber, frontier = blood-red, alien = violet).
+    setSectorTint(tint) {
+      const nextTint = normalizeTint(tint);
+      if (nextTint === currentTint) return;
+      currentTint = nextTint;
+      applyBackground(currentTint);
+    },
     setWarp() { /* extended by vfx during jump */ },
   };
 }

codex
The sector data and starfield tint plumbing are in. Now I’m replacing the old renderer-side mood heuristic with a small palette transition rig that lives beside the existing lights/fog.
apply patch
patch: completed
C:\Users\93rob\Documents\GitHub\SpaceFace\src\render\renderer.js
diff --git a/src/data/sectors.js b/src/data/sectors.js
index 9c63f69479b241fc848258e3fe2161547793fa46..1814c409089f818b6ab4758b3f0cf8f8531f2452
--- a/src/data/sectors.js
+++ b/src/data/sectors.js
@@ -10,10 +10,30 @@
 export const HAZARD_TYPES  = ['dense_asteroid', 'nebula', 'radiation', 'debris'];
 export const POI_TYPES     = ['beacon', 'derelict', 'cache', 'colony', 'anomaly', 'wormhole', 'wreck'];
 
+export const SECTOR_PALETTE_CLASSES = {
+  core: {
+    key: 0xcfe2ff, rim: 0x6a5cff, fill: 0x39d0ff, ambient: 0x42506f,
+    fog: 0x0a1430, fogDensity: 0.00026, nebulaTint: 0x1e3a6a, dust: 0x7ea7c7,
+  },
+  belt: {
+    key: 0xffd59a, rim: 0xb56d2f, fill: 0xffb13d, ambient: 0x594a42,
+    fog: 0x2a160c, fogDensity: 0.00034, nebulaTint: 0x8a4a1e, dust: 0xc0793d,
+  },
+  fringe: {
+    key: 0xffb07a, rim: 0xff3f2d, fill: 0xffaa66, ambient: 0x584343,
+    fog: 0x2a0d0a, fogDensity: 0.00042, nebulaTint: 0x8a1e1e, dust: 0xc15032,
+  },
+  anomaly: {
+    key: 0xc8b6ff, rim: 0x54ffb0, fill: 0x4ddc92, ambient: 0x494760,
+    fog: 0x160d2c, fogDensity: 0.00036, nebulaTint: 0x5a1e8a, dust: 0x79ffc8,
+  },
+};
+
 export const SECTORS = [
   {
     id: 'sector_helios_prime', name: 'Helios Prime', tier: 0, security: 0.98, charted: true,
     factionId: 'faction_scn', position: { x: 0, y: 0 }, worldRadius: 3500,
+    palette: SECTOR_PALETTE_CLASSES.core,
     // Tutorial home sector: NO hostile spawns (enemyDensity 0). A brand-new pilot must not be
     // hunted before learning the ropes; danger ramps up only in neighbouring sectors.
     trafficPerMin: 18, enemyDensity: 0, enemyLevel: [1, 2],
@@ -37,6 +57,7 @@
   {
     id: 'sector_ceres_belt', name: 'Ceres Belt', tier: 1, security: 0.72, charted: true,
     factionId: 'faction_dmc', position: { x: -3, y: 2 }, worldRadius: 4200,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 10, enemyDensity: 0.18, enemyLevel: [2, 4],
     neighbors: ['sector_helios_prime', 'sector_tethys_junction', 'sector_pallas_drift'],
     stations: [
@@ -57,6 +78,7 @@
   {
     id: 'sector_tethys_junction', name: 'Tethys Junction', tier: 1, security: 0.65, charted: true,
     factionId: 'faction_mts', position: { x: 3, y: 2 }, worldRadius: 4000,
+    palette: SECTOR_PALETTE_CLASSES.core,
     trafficPerMin: 14, enemyDensity: 0.20, enemyLevel: [2, 4],
     neighbors: ['sector_helios_prime', 'sector_ceres_belt', 'sector_vesta_forge', 'sector_io_reach'],
     stations: [
@@ -72,6 +94,7 @@
   {
     id: 'sector_vesta_forge', name: 'Vesta Forge', tier: 1, security: 0.60, charted: true,
     factionId: 'faction_dmc', position: { x: 0, y: 4 }, worldRadius: 4300,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 9, enemyDensity: 0.25, enemyLevel: [3, 5],
     neighbors: ['sector_helios_prime', 'sector_tethys_junction', 'sector_charon_expanse'],
     stations: [
@@ -89,6 +112,7 @@
   {
     id: 'sector_pallas_drift', name: 'Pallas Drift', tier: 2, security: 0.42, charted: true,
     factionId: 'faction_mts', position: { x: -5, y: 5 }, worldRadius: 4500,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 7, enemyDensity: 0.40, enemyLevel: [4, 7],
     neighbors: ['sector_ceres_belt', 'sector_io_reach', 'sector_sker_haven'],
     stations: [
@@ -109,6 +133,7 @@
   {
     id: 'sector_io_reach', name: 'Io Reach', tier: 2, security: 0.35, charted: true,
     factionId: 'faction_free', position: { x: 5, y: 5 }, worldRadius: 4600,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 5, enemyDensity: 0.50, enemyLevel: [5, 8],
     neighbors: ['sector_tethys_junction', 'sector_pallas_drift', 'sector_charon_expanse', 'sector_veil_nebula'],
     stations: [
@@ -132,6 +157,7 @@
   {
     id: 'sector_charon_expanse', name: 'Charon Expanse', tier: 2, security: 0.30, charted: true,
     factionId: 'faction_dmc', position: { x: 2, y: 7 }, worldRadius: 4800,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 4, enemyDensity: 0.50, enemyLevel: [5, 9],
     neighbors: ['sector_vesta_forge', 'sector_io_reach', 'sector_ashfall_reach'],
     stations: [
@@ -151,6 +177,7 @@
   {
     id: 'sector_sker_haven', name: 'Sker Haven', tier: 3, security: 0.08, charted: false,
     factionId: 'faction_reach', position: { x: -7, y: 8 }, worldRadius: 5000,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 0, enemyDensity: 0.70, enemyLevel: [7, 11],
     neighbors: ['sector_pallas_drift', 'sector_veil_nebula'],
     stations: [
@@ -169,6 +196,7 @@
   {
     id: 'sector_veil_nebula', name: 'Veil Nebula', tier: 3, security: 0.12, charted: false,
     factionId: 'faction_free', position: { x: 7, y: 9 }, worldRadius: 5200,
+    palette: SECTOR_PALETTE_CLASSES.anomaly,
     trafficPerMin: 0, enemyDensity: 0.65, enemyLevel: [8, 12],
     neighbors: ['sector_io_reach', 'sector_sker_haven'],
     wormholeTo: { sectorId: 'sector_ashfall_reach', gatedBy: 'tech:tech_long_range_survey' },
@@ -188,6 +216,7 @@
   {
     id: 'sector_ashfall_reach', name: 'Ashfall Reach', tier: 4, security: 0.05, charted: false,
     factionId: 'faction_vael', position: { x: 4, y: 11 }, worldRadius: 5500,
+    palette: SECTOR_PALETTE_CLASSES.anomaly,
     trafficPerMin: 0, enemyDensity: 0.80, enemyLevel: [10, 15],
     neighbors: ['sector_charon_expanse'],
     stations: [
diff --git a/src/render/renderer.js b/src/render/renderer.js
index def6420ff1bff2ac1c64dcc1add395e7851c4dbc..f2fb01e49838a28d4548139374c516f0dfc5e093
--- a/src/render/renderer.js
+++ b/src/render/renderer.js
@@ -15,21 +15,11 @@
 import { installDiagnostics } from './diagnostics.js';
 import { createPlanetFactory } from './planetFactory.js';
 import { precompilePipelines } from './precompile.js';
-
-// Map a sector's danger/tier to a nebula backdrop tint so each region of the galaxy has its own
-// color signature. Core (safe, low tier) = clean blue; industrial mid-ring = rust/amber; lawless
-// frontier = blood-red; alien/endgame tier 4+ = violet. Returns a hex string or null (default).
-function sectorNebulaTint(sector) {
-  if (!sector) return null;
-  const tier = sector.tier || 0;
-  const sec = sector.security != null ? sector.security : 1;
-  const danger = (1 - sec) + tier * 0.15; // blended danger metric
-  if (tier >= 4) return '#5a1e8a';        // violet — alien / lawless endgame (Veil, Ashfall)
-  if (danger > 0.7) return '#8a1e1e';     // blood-red — dangerous frontier (Io Reach, Sker)
-  if (danger > 0.45) return '#8a4a1e';    // rust/amber — industrial mid-ring (Vesta, Pallas)
-  if (danger > 0.2) return '#1e4a8a';     // deep blue — settled belt (Ceres, Tethys)
-  return '#1e3a6a';                        // clean blue — safe core (Helios Prime)
-}
+import { SECTOR_PALETTE_CLASSES } from '../data/sectors.js';
+
+const SECTOR_PALETTE_LERP_SECONDS = 1.5;
+const SECTOR_LIGHT_INTENSITIES = { ambient: 0.85, key: 1.7, rim: 0.7, fill: 0.35 };
+const SECTOR_PALETTE_COLOR_FIELDS = ['ambient', 'key', 'rim', 'fill', 'fog'];
 
 // ---- contact shadow disc (module-level cache so one texture serves all entities) ----------------
 let _shadowTex = null;
diff --git a/src/render/starfield.js b/src/render/starfield.js
index d76965c563ac0d99166bb382577d2f6eaa4a6d0f..aecb37608592e6ff981ddaf8fd6107d17a0632e6
--- a/src/render/starfield.js
+++ b/src/render/starfield.js
@@ -116,10 +116,18 @@
   return c;
 }
 
-// --- small color helpers for sector tinting (no deps) ---
-function hexToRgb(hex) {
-  const h = hex.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
-}
+// --- small color helpers for sector tinting (no deps) ---
+function normalizeTint(tint) {
+  if (tint == null) return null;
+  if (typeof tint === 'number' && Number.isFinite(tint)) {
+    return '#' + ((tint >>> 0) & 0xffffff).toString(16).padStart(6, '0');
+  }
+  if (typeof tint === 'string') return tint.startsWith('#') ? tint : '#' + tint.replace(/^0x/i, '');
+  return null;
+}
+function hexToRgb(hex) {
+  const h = hex.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
+}
 function rgbToHex(r, g, b) {
   const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
   return '#' + c(r) + c(g) + c(b);
@@ -176,11 +184,11 @@
   ctx.restore();
 }
 
-export function createStarfield(scene, opts = {}) {
-  const layers = [];
-  const sprite = makeStarSprite();
-  let bgTexture = null;
-  let currentTint = opts.tint || null;
+export function createStarfield(scene, opts = {}) {
+  const layers = [];
+  const sprite = makeStarSprite();
+  let bgTexture = null;
+  let currentTint = normalizeTint(opts.tint);
 
   // star tints (mostly cool white/blue with a few warm + teal accents)
   const TINTS = [0xffffff, 0xcfe0ff, 0x9fb6e0, 0xfff0d8, 0x8af0d6, 0xbfd2ff];
@@ -297,13 +305,14 @@
       // GR-7: slow-rotate the distant 3D planets so they read as real spinning worlds, not billboards.
       for (const p of distantPlanets) p.mesh.rotation.y += dt * p.spin;
     },
-    // Swap the nebula mood on sector enter — each region of the galaxy reads with its own color
-    // signature (core = clean blue, industrial = rust/amber, frontier = blood-red, alien = violet).
-    setSectorTint(tint) {
-      if (tint === currentTint) return;
-      currentTint = tint || null;
-      applyBackground(currentTint);
-    },
+    // Swap the nebula mood on sector enter — each region of the galaxy reads with its own color
+    // signature (core = clean blue, industrial = rust/amber, frontier = blood-red, alien = violet).
+    setSectorTint(tint) {
+      const nextTint = normalizeTint(tint);
+      if (nextTint === currentTint) return;
+      currentTint = nextTint;
+      applyBackground(currentTint);
+    },
     setWarp() { /* extended by vfx during jump */ },
   };
 }

diff --git a/src/data/sectors.js b/src/data/sectors.js
index 9c63f69479b241fc848258e3fe2161547793fa46..1814c409089f818b6ab4758b3f0cf8f8531f2452
--- a/src/data/sectors.js
+++ b/src/data/sectors.js
@@ -10,10 +10,30 @@
 export const HAZARD_TYPES  = ['dense_asteroid', 'nebula', 'radiation', 'debris'];
 export const POI_TYPES     = ['beacon', 'derelict', 'cache', 'colony', 'anomaly', 'wormhole', 'wreck'];
 
+export const SECTOR_PALETTE_CLASSES = {
+  core: {
+    key: 0xcfe2ff, rim: 0x6a5cff, fill: 0x39d0ff, ambient: 0x42506f,
+    fog: 0x0a1430, fogDensity: 0.00026, nebulaTint: 0x1e3a6a, dust: 0x7ea7c7,
+  },
+  belt: {
+    key: 0xffd59a, rim: 0xb56d2f, fill: 0xffb13d, ambient: 0x594a42,
+    fog: 0x2a160c, fogDensity: 0.00034, nebulaTint: 0x8a4a1e, dust: 0xc0793d,
+  },
+  fringe: {
+    key: 0xffb07a, rim: 0xff3f2d, fill: 0xffaa66, ambient: 0x584343,
+    fog: 0x2a0d0a, fogDensity: 0.00042, nebulaTint: 0x8a1e1e, dust: 0xc15032,
+  },
+  anomaly: {
+    key: 0xc8b6ff, rim: 0x54ffb0, fill: 0x4ddc92, ambient: 0x494760,
+    fog: 0x160d2c, fogDensity: 0.00036, nebulaTint: 0x5a1e8a, dust: 0x79ffc8,
+  },
+};
+
 export const SECTORS = [
   {
     id: 'sector_helios_prime', name: 'Helios Prime', tier: 0, security: 0.98, charted: true,
     factionId: 'faction_scn', position: { x: 0, y: 0 }, worldRadius: 3500,
+    palette: SECTOR_PALETTE_CLASSES.core,
     // Tutorial home sector: NO hostile spawns (enemyDensity 0). A brand-new pilot must not be
     // hunted before learning the ropes; danger ramps up only in neighbouring sectors.
     trafficPerMin: 18, enemyDensity: 0, enemyLevel: [1, 2],
@@ -37,6 +57,7 @@
   {
     id: 'sector_ceres_belt', name: 'Ceres Belt', tier: 1, security: 0.72, charted: true,
     factionId: 'faction_dmc', position: { x: -3, y: 2 }, worldRadius: 4200,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 10, enemyDensity: 0.18, enemyLevel: [2, 4],
     neighbors: ['sector_helios_prime', 'sector_tethys_junction', 'sector_pallas_drift'],
     stations: [
@@ -57,6 +78,7 @@
   {
     id: 'sector_tethys_junction', name: 'Tethys Junction', tier: 1, security: 0.65, charted: true,
     factionId: 'faction_mts', position: { x: 3, y: 2 }, worldRadius: 4000,
+    palette: SECTOR_PALETTE_CLASSES.core,
     trafficPerMin: 14, enemyDensity: 0.20, enemyLevel: [2, 4],
     neighbors: ['sector_helios_prime', 'sector_ceres_belt', 'sector_vesta_forge', 'sector_io_reach'],
     stations: [
@@ -72,6 +94,7 @@
   {
     id: 'sector_vesta_forge', name: 'Vesta Forge', tier: 1, security: 0.60, charted: true,
     factionId: 'faction_dmc', position: { x: 0, y: 4 }, worldRadius: 4300,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 9, enemyDensity: 0.25, enemyLevel: [3, 5],
     neighbors: ['sector_helios_prime', 'sector_tethys_junction', 'sector_charon_expanse'],
     stations: [
@@ -89,6 +112,7 @@
   {
     id: 'sector_pallas_drift', name: 'Pallas Drift', tier: 2, security: 0.42, charted: true,
     factionId: 'faction_mts', position: { x: -5, y: 5 }, worldRadius: 4500,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 7, enemyDensity: 0.40, enemyLevel: [4, 7],
     neighbors: ['sector_ceres_belt', 'sector_io_reach', 'sector_sker_haven'],
     stations: [
@@ -109,6 +133,7 @@
   {
     id: 'sector_io_reach', name: 'Io Reach', tier: 2, security: 0.35, charted: true,
     factionId: 'faction_free', position: { x: 5, y: 5 }, worldRadius: 4600,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 5, enemyDensity: 0.50, enemyLevel: [5, 8],
     neighbors: ['sector_tethys_junction', 'sector_pallas_drift', 'sector_charon_expanse', 'sector_veil_nebula'],
     stations: [
@@ -132,6 +157,7 @@
   {
     id: 'sector_charon_expanse', name: 'Charon Expanse', tier: 2, security: 0.30, charted: true,
     factionId: 'faction_dmc', position: { x: 2, y: 7 }, worldRadius: 4800,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 4, enemyDensity: 0.50, enemyLevel: [5, 9],
     neighbors: ['sector_vesta_forge', 'sector_io_reach', 'sector_ashfall_reach'],
     stations: [
@@ -151,6 +177,7 @@
   {
     id: 'sector_sker_haven', name: 'Sker Haven', tier: 3, security: 0.08, charted: false,
     factionId: 'faction_reach', position: { x: -7, y: 8 }, worldRadius: 5000,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 0, enemyDensity: 0.70, enemyLevel: [7, 11],
     neighbors: ['sector_pallas_drift', 'sector_veil_nebula'],
     stations: [
@@ -169,6 +196,7 @@
   {
     id: 'sector_veil_nebula', name: 'Veil Nebula', tier: 3, security: 0.12, charted: false,
     factionId: 'faction_free', position: { x: 7, y: 9 }, worldRadius: 5200,
+    palette: SECTOR_PALETTE_CLASSES.anomaly,
     trafficPerMin: 0, enemyDensity: 0.65, enemyLevel: [8, 12],
     neighbors: ['sector_io_reach', 'sector_sker_haven'],
     wormholeTo: { sectorId: 'sector_ashfall_reach', gatedBy: 'tech:tech_long_range_survey' },
@@ -188,6 +216,7 @@
   {
     id: 'sector_ashfall_reach', name: 'Ashfall Reach', tier: 4, security: 0.05, charted: false,
     factionId: 'faction_vael', position: { x: 4, y: 11 }, worldRadius: 5500,
+    palette: SECTOR_PALETTE_CLASSES.anomaly,
     trafficPerMin: 0, enemyDensity: 0.80, enemyLevel: [10, 15],
     neighbors: ['sector_charon_expanse'],
     stations: [
diff --git a/src/render/renderer.js b/src/render/renderer.js
index def6420ff1bff2ac1c64dcc1add395e7851c4dbc..f2fb01e49838a28d4548139374c516f0dfc5e093
--- a/src/render/renderer.js
+++ b/src/render/renderer.js
@@ -15,21 +15,11 @@
 import { installDiagnostics } from './diagnostics.js';
 import { createPlanetFactory } from './planetFactory.js';
 import { precompilePipelines } from './precompile.js';
-
-// Map a sector's danger/tier to a nebula backdrop tint so each region of the galaxy has its own
-// color signature. Core (safe, low tier) = clean blue; industrial mid-ring = rust/amber; lawless
-// frontier = blood-red; alien/endgame tier 4+ = violet. Returns a hex string or null (default).
-function sectorNebulaTint(sector) {
-  if (!sector) return null;
-  const tier = sector.tier || 0;
-  const sec = sector.security != null ? sector.security : 1;
-  const danger = (1 - sec) + tier * 0.15; // blended danger metric
-  if (tier >= 4) return '#5a1e8a';        // violet — alien / lawless endgame (Veil, Ashfall)
-  if (danger > 0.7) return '#8a1e1e';     // blood-red — dangerous frontier (Io Reach, Sker)
-  if (danger > 0.45) return '#8a4a1e';    // rust/amber — industrial mid-ring (Vesta, Pallas)
-  if (danger > 0.2) return '#1e4a8a';     // deep blue — settled belt (Ceres, Tethys)
-  return '#1e3a6a';                        // clean blue — safe core (Helios Prime)
-}
+import { SECTOR_PALETTE_CLASSES } from '../data/sectors.js';
+
+const SECTOR_PALETTE_LERP_SECONDS = 1.5;
+const SECTOR_LIGHT_INTENSITIES = { ambient: 0.85, key: 1.7, rim: 0.7, fill: 0.35 };
+const SECTOR_PALETTE_COLOR_FIELDS = ['ambient', 'key', 'rim', 'fill', 'fog'];
 
 // ---- contact shadow disc (module-level cache so one texture serves all entities) ----------------
 let _shadowTex = null;
diff --git a/src/render/starfield.js b/src/render/starfield.js
index d76965c563ac0d99166bb382577d2f6eaa4a6d0f..aecb37608592e6ff981ddaf8fd6107d17a0632e6
--- a/src/render/starfield.js
+++ b/src/render/starfield.js
@@ -116,10 +116,18 @@
   return c;
 }
 
-// --- small color helpers for sector tinting (no deps) ---
-function hexToRgb(hex) {
-  const h = hex.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
-}
+// --- small color helpers for sector tinting (no deps) ---
+function normalizeTint(tint) {
+  if (tint == null) return null;
+  if (typeof tint === 'number' && Number.isFinite(tint)) {
+    return '#' + ((tint >>> 0) & 0xffffff).toString(16).padStart(6, '0');
+  }
+  if (typeof tint === 'string') return tint.startsWith('#') ? tint : '#' + tint.replace(/^0x/i, '');
+  return null;
+}
+function hexToRgb(hex) {
+  const h = hex.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
+}
 function rgbToHex(r, g, b) {
   const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
   return '#' + c(r) + c(g) + c(b);
@@ -176,11 +184,11 @@
   ctx.restore();
 }
 
-export function createStarfield(scene, opts = {}) {
-  const layers = [];
-  const sprite = makeStarSprite();
-  let bgTexture = null;
-  let currentTint = opts.tint || null;
+export function createStarfield(scene, opts = {}) {
+  const layers = [];
+  const sprite = makeStarSprite();
+  let bgTexture = null;
+  let currentTint = normalizeTint(opts.tint);
 
   // star tints (mostly cool white/blue with a few warm + teal accents)
   const TINTS = [0xffffff, 0xcfe0ff, 0x9fb6e0, 0xfff0d8, 0x8af0d6, 0xbfd2ff];
@@ -297,13 +305,14 @@
       // GR-7: slow-rotate the distant 3D planets so they read as real spinning worlds, not billboards.
       for (const p of distantPlanets) p.mesh.rotation.y += dt * p.spin;
     },
-    // Swap the nebula mood on sector enter — each region of the galaxy reads with its own color
-    // signature (core = clean blue, industrial = rust/amber, frontier = blood-red, alien = violet).
-    setSectorTint(tint) {
-      if (tint === currentTint) return;
-      currentTint = tint || null;
-      applyBackground(currentTint);
-    },
+    // Swap the nebula mood on sector enter — each region of the galaxy reads with its own color
+    // signature (core = clean blue, industrial = rust/amber, frontier = blood-red, alien = violet).
+    setSectorTint(tint) {
+      const nextTint = normalizeTint(tint);
+      if (nextTint === currentTint) return;
+      currentTint = nextTint;
+      applyBackground(currentTint);
+    },
     setWarp() { /* extended by vfx during jump */ },
   };
 }

codex
I’m keeping the core palette exactly on the old hardcoded colors: same fog, ambient, key, rim, and fill values, with the same light intensities. Other classes only move colors/fog/tint, while readability stays inside the luminance band.
apply patch
patch: completed
C:\Users\93rob\Documents\GitHub\SpaceFace\src\render\renderer.js
diff --git a/src/data/sectors.js b/src/data/sectors.js
index 9c63f69479b241fc848258e3fe2161547793fa46..1814c409089f818b6ab4758b3f0cf8f8531f2452
--- a/src/data/sectors.js
+++ b/src/data/sectors.js
@@ -10,10 +10,30 @@
 export const HAZARD_TYPES  = ['dense_asteroid', 'nebula', 'radiation', 'debris'];
 export const POI_TYPES     = ['beacon', 'derelict', 'cache', 'colony', 'anomaly', 'wormhole', 'wreck'];
 
+export const SECTOR_PALETTE_CLASSES = {
+  core: {
+    key: 0xcfe2ff, rim: 0x6a5cff, fill: 0x39d0ff, ambient: 0x42506f,
+    fog: 0x0a1430, fogDensity: 0.00026, nebulaTint: 0x1e3a6a, dust: 0x7ea7c7,
+  },
+  belt: {
+    key: 0xffd59a, rim: 0xb56d2f, fill: 0xffb13d, ambient: 0x594a42,
+    fog: 0x2a160c, fogDensity: 0.00034, nebulaTint: 0x8a4a1e, dust: 0xc0793d,
+  },
+  fringe: {
+    key: 0xffb07a, rim: 0xff3f2d, fill: 0xffaa66, ambient: 0x584343,
+    fog: 0x2a0d0a, fogDensity: 0.00042, nebulaTint: 0x8a1e1e, dust: 0xc15032,
+  },
+  anomaly: {
+    key: 0xc8b6ff, rim: 0x54ffb0, fill: 0x4ddc92, ambient: 0x494760,
+    fog: 0x160d2c, fogDensity: 0.00036, nebulaTint: 0x5a1e8a, dust: 0x79ffc8,
+  },
+};
+
 export const SECTORS = [
   {
     id: 'sector_helios_prime', name: 'Helios Prime', tier: 0, security: 0.98, charted: true,
     factionId: 'faction_scn', position: { x: 0, y: 0 }, worldRadius: 3500,
+    palette: SECTOR_PALETTE_CLASSES.core,
     // Tutorial home sector: NO hostile spawns (enemyDensity 0). A brand-new pilot must not be
     // hunted before learning the ropes; danger ramps up only in neighbouring sectors.
     trafficPerMin: 18, enemyDensity: 0, enemyLevel: [1, 2],
@@ -37,6 +57,7 @@
   {
     id: 'sector_ceres_belt', name: 'Ceres Belt', tier: 1, security: 0.72, charted: true,
     factionId: 'faction_dmc', position: { x: -3, y: 2 }, worldRadius: 4200,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 10, enemyDensity: 0.18, enemyLevel: [2, 4],
     neighbors: ['sector_helios_prime', 'sector_tethys_junction', 'sector_pallas_drift'],
     stations: [
@@ -57,6 +78,7 @@
   {
     id: 'sector_tethys_junction', name: 'Tethys Junction', tier: 1, security: 0.65, charted: true,
     factionId: 'faction_mts', position: { x: 3, y: 2 }, worldRadius: 4000,
+    palette: SECTOR_PALETTE_CLASSES.core,
     trafficPerMin: 14, enemyDensity: 0.20, enemyLevel: [2, 4],
     neighbors: ['sector_helios_prime', 'sector_ceres_belt', 'sector_vesta_forge', 'sector_io_reach'],
     stations: [
@@ -72,6 +94,7 @@
   {
     id: 'sector_vesta_forge', name: 'Vesta Forge', tier: 1, security: 0.60, charted: true,
     factionId: 'faction_dmc', position: { x: 0, y: 4 }, worldRadius: 4300,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 9, enemyDensity: 0.25, enemyLevel: [3, 5],
     neighbors: ['sector_helios_prime', 'sector_tethys_junction', 'sector_charon_expanse'],
     stations: [
@@ -89,6 +112,7 @@
   {
     id: 'sector_pallas_drift', name: 'Pallas Drift', tier: 2, security: 0.42, charted: true,
     factionId: 'faction_mts', position: { x: -5, y: 5 }, worldRadius: 4500,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 7, enemyDensity: 0.40, enemyLevel: [4, 7],
     neighbors: ['sector_ceres_belt', 'sector_io_reach', 'sector_sker_haven'],
     stations: [
@@ -109,6 +133,7 @@
   {
     id: 'sector_io_reach', name: 'Io Reach', tier: 2, security: 0.35, charted: true,
     factionId: 'faction_free', position: { x: 5, y: 5 }, worldRadius: 4600,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 5, enemyDensity: 0.50, enemyLevel: [5, 8],
     neighbors: ['sector_tethys_junction', 'sector_pallas_drift', 'sector_charon_expanse', 'sector_veil_nebula'],
     stations: [
@@ -132,6 +157,7 @@
   {
     id: 'sector_charon_expanse', name: 'Charon Expanse', tier: 2, security: 0.30, charted: true,
     factionId: 'faction_dmc', position: { x: 2, y: 7 }, worldRadius: 4800,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 4, enemyDensity: 0.50, enemyLevel: [5, 9],
     neighbors: ['sector_vesta_forge', 'sector_io_reach', 'sector_ashfall_reach'],
     stations: [
@@ -151,6 +177,7 @@
   {
     id: 'sector_sker_haven', name: 'Sker Haven', tier: 3, security: 0.08, charted: false,
     factionId: 'faction_reach', position: { x: -7, y: 8 }, worldRadius: 5000,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 0, enemyDensity: 0.70, enemyLevel: [7, 11],
     neighbors: ['sector_pallas_drift', 'sector_veil_nebula'],
     stations: [
@@ -169,6 +196,7 @@
   {
     id: 'sector_veil_nebula', name: 'Veil Nebula', tier: 3, security: 0.12, charted: false,
     factionId: 'faction_free', position: { x: 7, y: 9 }, worldRadius: 5200,
+    palette: SECTOR_PALETTE_CLASSES.anomaly,
     trafficPerMin: 0, enemyDensity: 0.65, enemyLevel: [8, 12],
     neighbors: ['sector_io_reach', 'sector_sker_haven'],
     wormholeTo: { sectorId: 'sector_ashfall_reach', gatedBy: 'tech:tech_long_range_survey' },
@@ -188,6 +216,7 @@
   {
     id: 'sector_ashfall_reach', name: 'Ashfall Reach', tier: 4, security: 0.05, charted: false,
     factionId: 'faction_vael', position: { x: 4, y: 11 }, worldRadius: 5500,
+    palette: SECTOR_PALETTE_CLASSES.anomaly,
     trafficPerMin: 0, enemyDensity: 0.80, enemyLevel: [10, 15],
     neighbors: ['sector_charon_expanse'],
     stations: [
diff --git a/src/render/renderer.js b/src/render/renderer.js
index def6420ff1bff2ac1c64dcc1add395e7851c4dbc..3803d0999781970117e1f2a97ac707f87e0f2eea
--- a/src/render/renderer.js
+++ b/src/render/renderer.js
@@ -15,21 +15,11 @@
 import { installDiagnostics } from './diagnostics.js';
 import { createPlanetFactory } from './planetFactory.js';
 import { precompilePipelines } from './precompile.js';
-
-// Map a sector's danger/tier to a nebula backdrop tint so each region of the galaxy has its own
-// color signature. Core (safe, low tier) = clean blue; industrial mid-ring = rust/amber; lawless
-// frontier = blood-red; alien/endgame tier 4+ = violet. Returns a hex string or null (default).
-function sectorNebulaTint(sector) {
-  if (!sector) return null;
-  const tier = sector.tier || 0;
-  const sec = sector.security != null ? sector.security : 1;
-  const danger = (1 - sec) + tier * 0.15; // blended danger metric
-  if (tier >= 4) return '#5a1e8a';        // violet — alien / lawless endgame (Veil, Ashfall)
-  if (danger > 0.7) return '#8a1e1e';     // blood-red — dangerous frontier (Io Reach, Sker)
-  if (danger > 0.45) return '#8a4a1e';    // rust/amber — industrial mid-ring (Vesta, Pallas)
-  if (danger > 0.2) return '#1e4a8a';     // deep blue — settled belt (Ceres, Tethys)
-  return '#1e3a6a';                        // clean blue — safe core (Helios Prime)
-}
+import { SECTOR_PALETTE_CLASSES } from '../data/sectors.js';
+
+const SECTOR_PALETTE_LERP_SECONDS = 1.5;
+const SECTOR_LIGHT_INTENSITIES = { ambient: 0.85, key: 1.7, rim: 0.7, fill: 0.35 };
+const SECTOR_PALETTE_COLOR_FIELDS = ['ambient', 'key', 'rim', 'fill', 'fog'];
 
 // ---- contact shadow disc (module-level cache so one texture serves all entities) ----------------
 let _shadowTex = null;
@@ -178,14 +168,15 @@
     renderer.setClearColor(0x060912, 1);
     const drawSize = applyRendererSize(renderer, state);
 
-    const scene = new THREE.Scene();
-    // Thin fog for gentle depth cueing only — the old 0.00085 erased the entire backdrop, leaving a
-    // black void. This keeps the nebula + far stars visible while still fading the deep distance.
-    scene.fog = new THREE.FogExp2(0x0a1430, 0.00026);
-    scene.add(new THREE.AmbientLight(0x42506f, 0.85));
-    const key = new THREE.DirectionalLight(0xcfe2ff, 1.7); key.position.set(60, 140, 40); scene.add(key);
-    const rim = new THREE.DirectionalLight(0x6a5cff, 0.7); rim.position.set(-70, 50, -60); scene.add(rim);
-    const fill = new THREE.DirectionalLight(0x39d0ff, 0.35); fill.position.set(20, 30, 120); scene.add(fill);
+    const scene = new THREE.Scene();
+    const corePalette = SECTOR_PALETTE_CLASSES.core;
+    // Thin fog for gentle depth cueing only — the old 0.00085 erased the entire backdrop, leaving a
+    // black void. This keeps the nebula + far stars visible while still fading the deep distance.
+    scene.fog = new THREE.FogExp2(corePalette.fog, corePalette.fogDensity);
+    const ambient = new THREE.AmbientLight(corePalette.ambient, SECTOR_LIGHT_INTENSITIES.ambient); scene.add(ambient);
+    const key = new THREE.DirectionalLight(corePalette.key, SECTOR_LIGHT_INTENSITIES.key); key.position.set(60, 140, 40); scene.add(key);
+    const rim = new THREE.DirectionalLight(corePalette.rim, SECTOR_LIGHT_INTENSITIES.rim); rim.position.set(-70, 50, -60); scene.add(rim);
+    const fill = new THREE.DirectionalLight(corePalette.fill, SECTOR_LIGHT_INTENSITIES.fill); fill.position.set(20, 30, 120); scene.add(fill);
 
     // Real shadow maps (graphics spec Workstream G). Gated behind settings.video.shadows (default
     // true). The key light becomes a shadow caster with a tight frustum that follows the player so
@@ -210,7 +201,7 @@
     }
 
     const cam = createChaseCamera(state);
-    const starfield = createStarfield(scene);
+    const starfield = createStarfield(scene, { tint: corePalette.nebulaTint });
     const vf = createVisualFactory();
     // Hero-asset registry (spec §17.3): wraps the factory's build() so the bespoke player Kestrel is
     // intercepted before the procedural visualFactory. Narrow + failure-isolated — any throw falls
diff --git a/src/render/starfield.js b/src/render/starfield.js
index d76965c563ac0d99166bb382577d2f6eaa4a6d0f..aecb37608592e6ff981ddaf8fd6107d17a0632e6
--- a/src/render/starfield.js
+++ b/src/render/starfield.js
@@ -116,10 +116,18 @@
   return c;
 }
 
-// --- small color helpers for sector tinting (no deps) ---
-function hexToRgb(hex) {
-  const h = hex.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
-}
+// --- small color helpers for sector tinting (no deps) ---
+function normalizeTint(tint) {
+  if (tint == null) return null;
+  if (typeof tint === 'number' && Number.isFinite(tint)) {
+    return '#' + ((tint >>> 0) & 0xffffff).toString(16).padStart(6, '0');
+  }
+  if (typeof tint === 'string') return tint.startsWith('#') ? tint : '#' + tint.replace(/^0x/i, '');
+  return null;
+}
+function hexToRgb(hex) {
+  const h = hex.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
+}
 function rgbToHex(r, g, b) {
   const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
   return '#' + c(r) + c(g) + c(b);
@@ -176,11 +184,11 @@
   ctx.restore();
 }
 
-export function createStarfield(scene, opts = {}) {
-  const layers = [];
-  const sprite = makeStarSprite();
-  let bgTexture = null;
-  let currentTint = opts.tint || null;
+export function createStarfield(scene, opts = {}) {
+  const layers = [];
+  const sprite = makeStarSprite();
+  let bgTexture = null;
+  let currentTint = normalizeTint(opts.tint);
 
   // star tints (mostly cool white/blue with a few warm + teal accents)
   const TINTS = [0xffffff, 0xcfe0ff, 0x9fb6e0, 0xfff0d8, 0x8af0d6, 0xbfd2ff];
@@ -297,13 +305,14 @@
       // GR-7: slow-rotate the distant 3D planets so they read as real spinning worlds, not billboards.
       for (const p of distantPlanets) p.mesh.rotation.y += dt * p.spin;
     },
-    // Swap the nebula mood on sector enter — each region of the galaxy reads with its own color
-    // signature (core = clean blue, industrial = rust/amber, frontier = blood-red, alien = violet).
-    setSectorTint(tint) {
-      if (tint === currentTint) return;
-      currentTint = tint || null;
-      applyBackground(currentTint);
-    },
+    // Swap the nebula mood on sector enter — each region of the galaxy reads with its own color
+    // signature (core = clean blue, industrial = rust/amber, frontier = blood-red, alien = violet).
+    setSectorTint(tint) {
+      const nextTint = normalizeTint(tint);
+      if (nextTint === currentTint) return;
+      currentTint = nextTint;
+      applyBackground(currentTint);
+    },
     setWarp() { /* extended by vfx during jump */ },
   };
 }

diff --git a/src/data/sectors.js b/src/data/sectors.js
index 9c63f69479b241fc848258e3fe2161547793fa46..1814c409089f818b6ab4758b3f0cf8f8531f2452
--- a/src/data/sectors.js
+++ b/src/data/sectors.js
@@ -10,10 +10,30 @@
 export const HAZARD_TYPES  = ['dense_asteroid', 'nebula', 'radiation', 'debris'];
 export const POI_TYPES     = ['beacon', 'derelict', 'cache', 'colony', 'anomaly', 'wormhole', 'wreck'];
 
+export const SECTOR_PALETTE_CLASSES = {
+  core: {
+    key: 0xcfe2ff, rim: 0x6a5cff, fill: 0x39d0ff, ambient: 0x42506f,
+    fog: 0x0a1430, fogDensity: 0.00026, nebulaTint: 0x1e3a6a, dust: 0x7ea7c7,
+  },
+  belt: {
+    key: 0xffd59a, rim: 0xb56d2f, fill: 0xffb13d, ambient: 0x594a42,
+    fog: 0x2a160c, fogDensity: 0.00034, nebulaTint: 0x8a4a1e, dust: 0xc0793d,
+  },
+  fringe: {
+    key: 0xffb07a, rim: 0xff3f2d, fill: 0xffaa66, ambient: 0x584343,
+    fog: 0x2a0d0a, fogDensity: 0.00042, nebulaTint: 0x8a1e1e, dust: 0xc15032,
+  },
+  anomaly: {
+    key: 0xc8b6ff, rim: 0x54ffb0, fill: 0x4ddc92, ambient: 0x494760,
+    fog: 0x160d2c, fogDensity: 0.00036, nebulaTint: 0x5a1e8a, dust: 0x79ffc8,
+  },
+};
+
 export const SECTORS = [
   {
     id: 'sector_helios_prime', name: 'Helios Prime', tier: 0, security: 0.98, charted: true,
     factionId: 'faction_scn', position: { x: 0, y: 0 }, worldRadius: 3500,
+    palette: SECTOR_PALETTE_CLASSES.core,
     // Tutorial home sector: NO hostile spawns (enemyDensity 0). A brand-new pilot must not be
     // hunted before learning the ropes; danger ramps up only in neighbouring sectors.
     trafficPerMin: 18, enemyDensity: 0, enemyLevel: [1, 2],
@@ -37,6 +57,7 @@
   {
     id: 'sector_ceres_belt', name: 'Ceres Belt', tier: 1, security: 0.72, charted: true,
     factionId: 'faction_dmc', position: { x: -3, y: 2 }, worldRadius: 4200,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 10, enemyDensity: 0.18, enemyLevel: [2, 4],
     neighbors: ['sector_helios_prime', 'sector_tethys_junction', 'sector_pallas_drift'],
     stations: [
@@ -57,6 +78,7 @@
   {
     id: 'sector_tethys_junction', name: 'Tethys Junction', tier: 1, security: 0.65, charted: true,
     factionId: 'faction_mts', position: { x: 3, y: 2 }, worldRadius: 4000,
+    palette: SECTOR_PALETTE_CLASSES.core,
     trafficPerMin: 14, enemyDensity: 0.20, enemyLevel: [2, 4],
     neighbors: ['sector_helios_prime', 'sector_ceres_belt', 'sector_vesta_forge', 'sector_io_reach'],
     stations: [
@@ -72,6 +94,7 @@
   {
     id: 'sector_vesta_forge', name: 'Vesta Forge', tier: 1, security: 0.60, charted: true,
     factionId: 'faction_dmc', position: { x: 0, y: 4 }, worldRadius: 4300,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 9, enemyDensity: 0.25, enemyLevel: [3, 5],
     neighbors: ['sector_helios_prime', 'sector_tethys_junction', 'sector_charon_expanse'],
     stations: [
@@ -89,6 +112,7 @@
   {
     id: 'sector_pallas_drift', name: 'Pallas Drift', tier: 2, security: 0.42, charted: true,
     factionId: 'faction_mts', position: { x: -5, y: 5 }, worldRadius: 4500,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 7, enemyDensity: 0.40, enemyLevel: [4, 7],
     neighbors: ['sector_ceres_belt', 'sector_io_reach', 'sector_sker_haven'],
     stations: [
@@ -109,6 +133,7 @@
   {
     id: 'sector_io_reach', name: 'Io Reach', tier: 2, security: 0.35, charted: true,
     factionId: 'faction_free', position: { x: 5, y: 5 }, worldRadius: 4600,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 5, enemyDensity: 0.50, enemyLevel: [5, 8],
     neighbors: ['sector_tethys_junction', 'sector_pallas_drift', 'sector_charon_expanse', 'sector_veil_nebula'],
     stations: [
@@ -132,6 +157,7 @@
   {
     id: 'sector_charon_expanse', name: 'Charon Expanse', tier: 2, security: 0.30, charted: true,
     factionId: 'faction_dmc', position: { x: 2, y: 7 }, worldRadius: 4800,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 4, enemyDensity: 0.50, enemyLevel: [5, 9],
     neighbors: ['sector_vesta_forge', 'sector_io_reach', 'sector_ashfall_reach'],
     stations: [
@@ -151,6 +177,7 @@
   {
     id: 'sector_sker_haven', name: 'Sker Haven', tier: 3, security: 0.08, charted: false,
     factionId: 'faction_reach', position: { x: -7, y: 8 }, worldRadius: 5000,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 0, enemyDensity: 0.70, enemyLevel: [7, 11],
     neighbors: ['sector_pallas_drift', 'sector_veil_nebula'],
     stations: [
@@ -169,6 +196,7 @@
   {
     id: 'sector_veil_nebula', name: 'Veil Nebula', tier: 3, security: 0.12, charted: false,
     factionId: 'faction_free', position: { x: 7, y: 9 }, worldRadius: 5200,
+    palette: SECTOR_PALETTE_CLASSES.anomaly,
     trafficPerMin: 0, enemyDensity: 0.65, enemyLevel: [8, 12],
     neighbors: ['sector_io_reach', 'sector_sker_haven'],
     wormholeTo: { sectorId: 'sector_ashfall_reach', gatedBy: 'tech:tech_long_range_survey' },
@@ -188,6 +216,7 @@
   {
     id: 'sector_ashfall_reach', name: 'Ashfall Reach', tier: 4, security: 0.05, charted: false,
     factionId: 'faction_vael', position: { x: 4, y: 11 }, worldRadius: 5500,
+    palette: SECTOR_PALETTE_CLASSES.anomaly,
     trafficPerMin: 0, enemyDensity: 0.80, enemyLevel: [10, 15],
     neighbors: ['sector_charon_expanse'],
     stations: [
diff --git a/src/render/renderer.js b/src/render/renderer.js
index def6420ff1bff2ac1c64dcc1add395e7851c4dbc..3803d0999781970117e1f2a97ac707f87e0f2eea
--- a/src/render/renderer.js
+++ b/src/render/renderer.js
@@ -15,21 +15,11 @@
 import { installDiagnostics } from './diagnostics.js';
 import { createPlanetFactory } from './planetFactory.js';
 import { precompilePipelines } from './precompile.js';
-
-// Map a sector's danger/tier to a nebula backdrop tint so each region of the galaxy has its own
-// color signature. Core (safe, low tier) = clean blue; industrial mid-ring = rust/amber; lawless
-// frontier = blood-red; alien/endgame tier 4+ = violet. Returns a hex string or null (default).
-function sectorNebulaTint(sector) {
-  if (!sector) return null;
-  const tier = sector.tier || 0;
-  const sec = sector.security != null ? sector.security : 1;
-  const danger = (1 - sec) + tier * 0.15; // blended danger metric
-  if (tier >= 4) return '#5a1e8a';        // violet — alien / lawless endgame (Veil, Ashfall)
-  if (danger > 0.7) return '#8a1e1e';     // blood-red — dangerous frontier (Io Reach, Sker)
-  if (danger > 0.45) return '#8a4a1e';    // rust/amber — industrial mid-ring (Vesta, Pallas)
-  if (danger > 0.2) return '#1e4a8a';     // deep blue — settled belt (Ceres, Tethys)
-  return '#1e3a6a';                        // clean blue — safe core (Helios Prime)
-}
+import { SECTOR_PALETTE_CLASSES } from '../data/sectors.js';
+
+const SECTOR_PALETTE_LERP_SECONDS = 1.5;
+const SECTOR_LIGHT_INTENSITIES = { ambient: 0.85, key: 1.7, rim: 0.7, fill: 0.35 };
+const SECTOR_PALETTE_COLOR_FIELDS = ['ambient', 'key', 'rim', 'fill', 'fog'];
 
 // ---- contact shadow disc (module-level cache so one texture serves all entities) ----------------
 let _shadowTex = null;
@@ -178,14 +168,15 @@
     renderer.setClearColor(0x060912, 1);
     const drawSize = applyRendererSize(renderer, state);
 
-    const scene = new THREE.Scene();
-    // Thin fog for gentle depth cueing only — the old 0.00085 erased the entire backdrop, leaving a
-    // black void. This keeps the nebula + far stars visible while still fading the deep distance.
-    scene.fog = new THREE.FogExp2(0x0a1430, 0.00026);
-    scene.add(new THREE.AmbientLight(0x42506f, 0.85));
-    const key = new THREE.DirectionalLight(0xcfe2ff, 1.7); key.position.set(60, 140, 40); scene.add(key);
-    const rim = new THREE.DirectionalLight(0x6a5cff, 0.7); rim.position.set(-70, 50, -60); scene.add(rim);
-    const fill = new THREE.DirectionalLight(0x39d0ff, 0.35); fill.position.set(20, 30, 120); scene.add(fill);
+    const scene = new THREE.Scene();
+    const corePalette = SECTOR_PALETTE_CLASSES.core;
+    // Thin fog for gentle depth cueing only — the old 0.00085 erased the entire backdrop, leaving a
+    // black void. This keeps the nebula + far stars visible while still fading the deep distance.
+    scene.fog = new THREE.FogExp2(corePalette.fog, corePalette.fogDensity);
+    const ambient = new THREE.AmbientLight(corePalette.ambient, SECTOR_LIGHT_INTENSITIES.ambient); scene.add(ambient);
+    const key = new THREE.DirectionalLight(corePalette.key, SECTOR_LIGHT_INTENSITIES.key); key.position.set(60, 140, 40); scene.add(key);
+    const rim = new THREE.DirectionalLight(corePalette.rim, SECTOR_LIGHT_INTENSITIES.rim); rim.position.set(-70, 50, -60); scene.add(rim);
+    const fill = new THREE.DirectionalLight(corePalette.fill, SECTOR_LIGHT_INTENSITIES.fill); fill.position.set(20, 30, 120); scene.add(fill);
 
     // Real shadow maps (graphics spec Workstream G). Gated behind settings.video.shadows (default
     // true). The key light becomes a shadow caster with a tight frustum that follows the player so
@@ -210,7 +201,7 @@
     }
 
     const cam = createChaseCamera(state);
-    const starfield = createStarfield(scene);
+    const starfield = createStarfield(scene, { tint: corePalette.nebulaTint });
     const vf = createVisualFactory();
     // Hero-asset registry (spec §17.3): wraps the factory's build() so the bespoke player Kestrel is
     // intercepted before the procedural visualFactory. Narrow + failure-isolated — any throw falls
diff --git a/src/render/starfield.js b/src/render/starfield.js
index d76965c563ac0d99166bb382577d2f6eaa4a6d0f..aecb37608592e6ff981ddaf8fd6107d17a0632e6
--- a/src/render/starfield.js
+++ b/src/render/starfield.js
@@ -116,10 +116,18 @@
   return c;
 }
 
-// --- small color helpers for sector tinting (no deps) ---
-function hexToRgb(hex) {
-  const h = hex.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
-}
+// --- small color helpers for sector tinting (no deps) ---
+function normalizeTint(tint) {
+  if (tint == null) return null;
+  if (typeof tint === 'number' && Number.isFinite(tint)) {
+    return '#' + ((tint >>> 0) & 0xffffff).toString(16).padStart(6, '0');
+  }
+  if (typeof tint === 'string') return tint.startsWith('#') ? tint : '#' + tint.replace(/^0x/i, '');
+  return null;
+}
+function hexToRgb(hex) {
+  const h = hex.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
+}
 function rgbToHex(r, g, b) {
   const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
   return '#' + c(r) + c(g) + c(b);
@@ -176,11 +184,11 @@
   ctx.restore();
 }
 
-export function createStarfield(scene, opts = {}) {
-  const layers = [];
-  const sprite = makeStarSprite();
-  let bgTexture = null;
-  let currentTint = opts.tint || null;
+export function createStarfield(scene, opts = {}) {
+  const layers = [];
+  const sprite = makeStarSprite();
+  let bgTexture = null;
+  let currentTint = normalizeTint(opts.tint);
 
   // star tints (mostly cool white/blue with a few warm + teal accents)
   const TINTS = [0xffffff, 0xcfe0ff, 0x9fb6e0, 0xfff0d8, 0x8af0d6, 0xbfd2ff];
@@ -297,13 +305,14 @@
       // GR-7: slow-rotate the distant 3D planets so they read as real spinning worlds, not billboards.
       for (const p of distantPlanets) p.mesh.rotation.y += dt * p.spin;
     },
-    // Swap the nebula mood on sector enter — each region of the galaxy reads with its own color
-    // signature (core = clean blue, industrial = rust/amber, frontier = blood-red, alien = violet).
-    setSectorTint(tint) {
-      if (tint === currentTint) return;
-      currentTint = tint || null;
-      applyBackground(currentTint);
-    },
+    // Swap the nebula mood on sector enter — each region of the galaxy reads with its own color
+    // signature (core = clean blue, industrial = rust/amber, frontier = blood-red, alien = violet).
+    setSectorTint(tint) {
+      const nextTint = normalizeTint(tint);
+      if (nextTint === currentTint) return;
+      currentTint = nextTint;
+      applyBackground(currentTint);
+    },
     setWarp() { /* extended by vfx during jump */ },
   };
 }

codex
The renderer now boots with the core palette values directly instead of scattering those numbers through the rig. I’m adding the transition state next so sector changes can fade from the live colors, not snap from constants.
apply patch
patch: completed
C:\Users\93rob\Documents\GitHub\SpaceFace\src\render\renderer.js
diff --git a/src/data/sectors.js b/src/data/sectors.js
index 9c63f69479b241fc848258e3fe2161547793fa46..1814c409089f818b6ab4758b3f0cf8f8531f2452
--- a/src/data/sectors.js
+++ b/src/data/sectors.js
@@ -10,10 +10,30 @@
 export const HAZARD_TYPES  = ['dense_asteroid', 'nebula', 'radiation', 'debris'];
 export const POI_TYPES     = ['beacon', 'derelict', 'cache', 'colony', 'anomaly', 'wormhole', 'wreck'];
 
+export const SECTOR_PALETTE_CLASSES = {
+  core: {
+    key: 0xcfe2ff, rim: 0x6a5cff, fill: 0x39d0ff, ambient: 0x42506f,
+    fog: 0x0a1430, fogDensity: 0.00026, nebulaTint: 0x1e3a6a, dust: 0x7ea7c7,
+  },
+  belt: {
+    key: 0xffd59a, rim: 0xb56d2f, fill: 0xffb13d, ambient: 0x594a42,
+    fog: 0x2a160c, fogDensity: 0.00034, nebulaTint: 0x8a4a1e, dust: 0xc0793d,
+  },
+  fringe: {
+    key: 0xffb07a, rim: 0xff3f2d, fill: 0xffaa66, ambient: 0x584343,
+    fog: 0x2a0d0a, fogDensity: 0.00042, nebulaTint: 0x8a1e1e, dust: 0xc15032,
+  },
+  anomaly: {
+    key: 0xc8b6ff, rim: 0x54ffb0, fill: 0x4ddc92, ambient: 0x494760,
+    fog: 0x160d2c, fogDensity: 0.00036, nebulaTint: 0x5a1e8a, dust: 0x79ffc8,
+  },
+};
+
 export const SECTORS = [
   {
     id: 'sector_helios_prime', name: 'Helios Prime', tier: 0, security: 0.98, charted: true,
     factionId: 'faction_scn', position: { x: 0, y: 0 }, worldRadius: 3500,
+    palette: SECTOR_PALETTE_CLASSES.core,
     // Tutorial home sector: NO hostile spawns (enemyDensity 0). A brand-new pilot must not be
     // hunted before learning the ropes; danger ramps up only in neighbouring sectors.
     trafficPerMin: 18, enemyDensity: 0, enemyLevel: [1, 2],
@@ -37,6 +57,7 @@
   {
     id: 'sector_ceres_belt', name: 'Ceres Belt', tier: 1, security: 0.72, charted: true,
     factionId: 'faction_dmc', position: { x: -3, y: 2 }, worldRadius: 4200,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 10, enemyDensity: 0.18, enemyLevel: [2, 4],
     neighbors: ['sector_helios_prime', 'sector_tethys_junction', 'sector_pallas_drift'],
     stations: [
@@ -57,6 +78,7 @@
   {
     id: 'sector_tethys_junction', name: 'Tethys Junction', tier: 1, security: 0.65, charted: true,
     factionId: 'faction_mts', position: { x: 3, y: 2 }, worldRadius: 4000,
+    palette: SECTOR_PALETTE_CLASSES.core,
     trafficPerMin: 14, enemyDensity: 0.20, enemyLevel: [2, 4],
     neighbors: ['sector_helios_prime', 'sector_ceres_belt', 'sector_vesta_forge', 'sector_io_reach'],
     stations: [
@@ -72,6 +94,7 @@
   {
     id: 'sector_vesta_forge', name: 'Vesta Forge', tier: 1, security: 0.60, charted: true,
     factionId: 'faction_dmc', position: { x: 0, y: 4 }, worldRadius: 4300,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 9, enemyDensity: 0.25, enemyLevel: [3, 5],
     neighbors: ['sector_helios_prime', 'sector_tethys_junction', 'sector_charon_expanse'],
     stations: [
@@ -89,6 +112,7 @@
   {
     id: 'sector_pallas_drift', name: 'Pallas Drift', tier: 2, security: 0.42, charted: true,
     factionId: 'faction_mts', position: { x: -5, y: 5 }, worldRadius: 4500,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 7, enemyDensity: 0.40, enemyLevel: [4, 7],
     neighbors: ['sector_ceres_belt', 'sector_io_reach', 'sector_sker_haven'],
     stations: [
@@ -109,6 +133,7 @@
   {
     id: 'sector_io_reach', name: 'Io Reach', tier: 2, security: 0.35, charted: true,
     factionId: 'faction_free', position: { x: 5, y: 5 }, worldRadius: 4600,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 5, enemyDensity: 0.50, enemyLevel: [5, 8],
     neighbors: ['sector_tethys_junction', 'sector_pallas_drift', 'sector_charon_expanse', 'sector_veil_nebula'],
     stations: [
@@ -132,6 +157,7 @@
   {
     id: 'sector_charon_expanse', name: 'Charon Expanse', tier: 2, security: 0.30, charted: true,
     factionId: 'faction_dmc', position: { x: 2, y: 7 }, worldRadius: 4800,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 4, enemyDensity: 0.50, enemyLevel: [5, 9],
     neighbors: ['sector_vesta_forge', 'sector_io_reach', 'sector_ashfall_reach'],
     stations: [
@@ -151,6 +177,7 @@
   {
     id: 'sector_sker_haven', name: 'Sker Haven', tier: 3, security: 0.08, charted: false,
     factionId: 'faction_reach', position: { x: -7, y: 8 }, worldRadius: 5000,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 0, enemyDensity: 0.70, enemyLevel: [7, 11],
     neighbors: ['sector_pallas_drift', 'sector_veil_nebula'],
     stations: [
@@ -169,6 +196,7 @@
   {
     id: 'sector_veil_nebula', name: 'Veil Nebula', tier: 3, security: 0.12, charted: false,
     factionId: 'faction_free', position: { x: 7, y: 9 }, worldRadius: 5200,
+    palette: SECTOR_PALETTE_CLASSES.anomaly,
     trafficPerMin: 0, enemyDensity: 0.65, enemyLevel: [8, 12],
     neighbors: ['sector_io_reach', 'sector_sker_haven'],
     wormholeTo: { sectorId: 'sector_ashfall_reach', gatedBy: 'tech:tech_long_range_survey' },
@@ -188,6 +216,7 @@
   {
     id: 'sector_ashfall_reach', name: 'Ashfall Reach', tier: 4, security: 0.05, charted: false,
     factionId: 'faction_vael', position: { x: 4, y: 11 }, worldRadius: 5500,
+    palette: SECTOR_PALETTE_CLASSES.anomaly,
     trafficPerMin: 0, enemyDensity: 0.80, enemyLevel: [10, 15],
     neighbors: ['sector_charon_expanse'],
     stations: [
diff --git a/src/render/renderer.js b/src/render/renderer.js
index def6420ff1bff2ac1c64dcc1add395e7851c4dbc..5277aeb0d55d22502e74a4598f59c5a2c9e45d45
--- a/src/render/renderer.js
+++ b/src/render/renderer.js
@@ -15,21 +15,11 @@
 import { installDiagnostics } from './diagnostics.js';
 import { createPlanetFactory } from './planetFactory.js';
 import { precompilePipelines } from './precompile.js';
-
-// Map a sector's danger/tier to a nebula backdrop tint so each region of the galaxy has its own
-// color signature. Core (safe, low tier) = clean blue; industrial mid-ring = rust/amber; lawless
-// frontier = blood-red; alien/endgame tier 4+ = violet. Returns a hex string or null (default).
-function sectorNebulaTint(sector) {
-  if (!sector) return null;
-  const tier = sector.tier || 0;
-  const sec = sector.security != null ? sector.security : 1;
-  const danger = (1 - sec) + tier * 0.15; // blended danger metric
-  if (tier >= 4) return '#5a1e8a';        // violet — alien / lawless endgame (Veil, Ashfall)
-  if (danger > 0.7) return '#8a1e1e';     // blood-red — dangerous frontier (Io Reach, Sker)
-  if (danger > 0.45) return '#8a4a1e';    // rust/amber — industrial mid-ring (Vesta, Pallas)
-  if (danger > 0.2) return '#1e4a8a';     // deep blue — settled belt (Ceres, Tethys)
-  return '#1e3a6a';                        // clean blue — safe core (Helios Prime)
-}
+import { SECTOR_PALETTE_CLASSES } from '../data/sectors.js';
+
+const SECTOR_PALETTE_LERP_SECONDS = 1.5;
+const SECTOR_LIGHT_INTENSITIES = { ambient: 0.85, key: 1.7, rim: 0.7, fill: 0.35 };
+const SECTOR_PALETTE_COLOR_FIELDS = ['ambient', 'key', 'rim', 'fill', 'fog'];
 
 // ---- contact shadow disc (module-level cache so one texture serves all entities) ----------------
 let _shadowTex = null;
@@ -178,14 +168,15 @@
     renderer.setClearColor(0x060912, 1);
     const drawSize = applyRendererSize(renderer, state);
 
-    const scene = new THREE.Scene();
-    // Thin fog for gentle depth cueing only — the old 0.00085 erased the entire backdrop, leaving a
-    // black void. This keeps the nebula + far stars visible while still fading the deep distance.
-    scene.fog = new THREE.FogExp2(0x0a1430, 0.00026);
-    scene.add(new THREE.AmbientLight(0x42506f, 0.85));
-    const key = new THREE.DirectionalLight(0xcfe2ff, 1.7); key.position.set(60, 140, 40); scene.add(key);
-    const rim = new THREE.DirectionalLight(0x6a5cff, 0.7); rim.position.set(-70, 50, -60); scene.add(rim);
-    const fill = new THREE.DirectionalLight(0x39d0ff, 0.35); fill.position.set(20, 30, 120); scene.add(fill);
+    const scene = new THREE.Scene();
+    const corePalette = SECTOR_PALETTE_CLASSES.core;
+    // Thin fog for gentle depth cueing only — the old 0.00085 erased the entire backdrop, leaving a
+    // black void. This keeps the nebula + far stars visible while still fading the deep distance.
+    scene.fog = new THREE.FogExp2(corePalette.fog, corePalette.fogDensity);
+    const ambient = new THREE.AmbientLight(corePalette.ambient, SECTOR_LIGHT_INTENSITIES.ambient); scene.add(ambient);
+    const key = new THREE.DirectionalLight(corePalette.key, SECTOR_LIGHT_INTENSITIES.key); key.position.set(60, 140, 40); scene.add(key);
+    const rim = new THREE.DirectionalLight(corePalette.rim, SECTOR_LIGHT_INTENSITIES.rim); rim.position.set(-70, 50, -60); scene.add(rim);
+    const fill = new THREE.DirectionalLight(corePalette.fill, SECTOR_LIGHT_INTENSITIES.fill); fill.position.set(20, 30, 120); scene.add(fill);
 
     // Real shadow maps (graphics spec Workstream G). Gated behind settings.video.shadows (default
     // true). The key light becomes a shadow caster with a tight frustum that follows the player so
@@ -210,7 +201,7 @@
     }
 
     const cam = createChaseCamera(state);
-    const starfield = createStarfield(scene);
+    const starfield = createStarfield(scene, { tint: corePalette.nebulaTint });
     const vf = createVisualFactory();
     // Hero-asset registry (spec §17.3): wraps the factory's build() so the bespoke player Kestrel is
     // intercepted before the procedural visualFactory. Narrow + failure-isolated — any throw falls
@@ -283,13 +274,16 @@
     // contact-sheet references and are replaced by procedural materials / inline SVG).
     { const i = new Image(); i.src = 'assets/cinematics/menu_background.jpg'; }
 
-    this.renderer = renderer; this.scene = scene; this.cam = cam; this.starfield = starfield; this.vf = vf;
-    this.authoredPartLibraryReady = preloadAuthoredPartLibrary(renderer).catch((error) => {
-      console.warn('[render] authored part library preload failed', error);
-      return null;
-    });
-    state.render.authoredPartLibraryReady = this.authoredPartLibraryReady;
-    this._keyLight = shadowsOn ? key : null; // referenced by _updateShadowFollow() each frame
+    this.renderer = renderer; this.scene = scene; this.cam = cam; this.starfield = starfield; this.vf = vf;
+    this.authoredPartLibraryReady = preloadAuthoredPartLibrary(renderer).catch((error) => {
+      console.warn('[render] authored part library preload failed', error);
+      return null;
+    });
+    state.render.authoredPartLibraryReady = this.authoredPartLibraryReady;
+    this._sectorPaletteRig = createSectorPaletteRig(scene, ambient, key, rim, fill);
+    this._sectorPaletteTarget = corePalette;
+    state.render.sectorPalette = corePalette;
+    this._keyLight = shadowsOn ? key : null; // referenced by _updateShadowFollow() each frame
     this._shadowSettingOn = shadowsOn;
     this._shadowReceiversDirty = true;
     this._shadowReceiverCount = 0;
diff --git a/src/render/starfield.js b/src/render/starfield.js
index d76965c563ac0d99166bb382577d2f6eaa4a6d0f..aecb37608592e6ff981ddaf8fd6107d17a0632e6
--- a/src/render/starfield.js
+++ b/src/render/starfield.js
@@ -116,10 +116,18 @@
   return c;
 }
 
-// --- small color helpers for sector tinting (no deps) ---
-function hexToRgb(hex) {
-  const h = hex.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
-}
+// --- small color helpers for sector tinting (no deps) ---
+function normalizeTint(tint) {
+  if (tint == null) return null;
+  if (typeof tint === 'number' && Number.isFinite(tint)) {
+    return '#' + ((tint >>> 0) & 0xffffff).toString(16).padStart(6, '0');
+  }
+  if (typeof tint === 'string') return tint.startsWith('#') ? tint : '#' + tint.replace(/^0x/i, '');
+  return null;
+}
+function hexToRgb(hex) {
+  const h = hex.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
+}
 function rgbToHex(r, g, b) {
   const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
   return '#' + c(r) + c(g) + c(b);
@@ -176,11 +184,11 @@
   ctx.restore();
 }
 
-export function createStarfield(scene, opts = {}) {
-  const layers = [];
-  const sprite = makeStarSprite();
-  let bgTexture = null;
-  let currentTint = opts.tint || null;
+export function createStarfield(scene, opts = {}) {
+  const layers = [];
+  const sprite = makeStarSprite();
+  let bgTexture = null;
+  let currentTint = normalizeTint(opts.tint);
 
   // star tints (mostly cool white/blue with a few warm + teal accents)
   const TINTS = [0xffffff, 0xcfe0ff, 0x9fb6e0, 0xfff0d8, 0x8af0d6, 0xbfd2ff];
@@ -297,13 +305,14 @@
       // GR-7: slow-rotate the distant 3D planets so they read as real spinning worlds, not billboards.
       for (const p of distantPlanets) p.mesh.rotation.y += dt * p.spin;
     },
-    // Swap the nebula mood on sector enter — each region of the galaxy reads with its own color
-    // signature (core = clean blue, industrial = rust/amber, frontier = blood-red, alien = violet).
-    setSectorTint(tint) {
-      if (tint === currentTint) return;
-      currentTint = tint || null;
-      applyBackground(currentTint);
-    },
+    // Swap the nebula mood on sector enter — each region of the galaxy reads with its own color
+    // signature (core = clean blue, industrial = rust/amber, frontier = blood-red, alien = violet).
+    setSectorTint(tint) {
+      const nextTint = normalizeTint(tint);
+      if (nextTint === currentTint) return;
+      currentTint = nextTint;
+      applyBackground(currentTint);
+    },
     setWarp() { /* extended by vfx during jump */ },
   };
 }

diff --git a/src/data/sectors.js b/src/data/sectors.js
index 9c63f69479b241fc848258e3fe2161547793fa46..1814c409089f818b6ab4758b3f0cf8f8531f2452
--- a/src/data/sectors.js
+++ b/src/data/sectors.js
@@ -10,10 +10,30 @@
 export const HAZARD_TYPES  = ['dense_asteroid', 'nebula', 'radiation', 'debris'];
 export const POI_TYPES     = ['beacon', 'derelict', 'cache', 'colony', 'anomaly', 'wormhole', 'wreck'];
 
+export const SECTOR_PALETTE_CLASSES = {
+  core: {
+    key: 0xcfe2ff, rim: 0x6a5cff, fill: 0x39d0ff, ambient: 0x42506f,
+    fog: 0x0a1430, fogDensity: 0.00026, nebulaTint: 0x1e3a6a, dust: 0x7ea7c7,
+  },
+  belt: {
+    key: 0xffd59a, rim: 0xb56d2f, fill: 0xffb13d, ambient: 0x594a42,
+    fog: 0x2a160c, fogDensity: 0.00034, nebulaTint: 0x8a4a1e, dust: 0xc0793d,
+  },
+  fringe: {
+    key: 0xffb07a, rim: 0xff3f2d, fill: 0xffaa66, ambient: 0x584343,
+    fog: 0x2a0d0a, fogDensity: 0.00042, nebulaTint: 0x8a1e1e, dust: 0xc15032,
+  },
+  anomaly: {
+    key: 0xc8b6ff, rim: 0x54ffb0, fill: 0x4ddc92, ambient: 0x494760,
+    fog: 0x160d2c, fogDensity: 0.00036, nebulaTint: 0x5a1e8a, dust: 0x79ffc8,
+  },
+};
+
 export const SECTORS = [
   {
     id: 'sector_helios_prime', name: 'Helios Prime', tier: 0, security: 0.98, charted: true,
     factionId: 'faction_scn', position: { x: 0, y: 0 }, worldRadius: 3500,
+    palette: SECTOR_PALETTE_CLASSES.core,
     // Tutorial home sector: NO hostile spawns (enemyDensity 0). A brand-new pilot must not be
     // hunted before learning the ropes; danger ramps up only in neighbouring sectors.
     trafficPerMin: 18, enemyDensity: 0, enemyLevel: [1, 2],
@@ -37,6 +57,7 @@
   {
     id: 'sector_ceres_belt', name: 'Ceres Belt', tier: 1, security: 0.72, charted: true,
     factionId: 'faction_dmc', position: { x: -3, y: 2 }, worldRadius: 4200,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 10, enemyDensity: 0.18, enemyLevel: [2, 4],
     neighbors: ['sector_helios_prime', 'sector_tethys_junction', 'sector_pallas_drift'],
     stations: [
@@ -57,6 +78,7 @@
   {
     id: 'sector_tethys_junction', name: 'Tethys Junction', tier: 1, security: 0.65, charted: true,
     factionId: 'faction_mts', position: { x: 3, y: 2 }, worldRadius: 4000,
+    palette: SECTOR_PALETTE_CLASSES.core,
     trafficPerMin: 14, enemyDensity: 0.20, enemyLevel: [2, 4],
     neighbors: ['sector_helios_prime', 'sector_ceres_belt', 'sector_vesta_forge', 'sector_io_reach'],
     stations: [
@@ -72,6 +94,7 @@
   {
     id: 'sector_vesta_forge', name: 'Vesta Forge', tier: 1, security: 0.60, charted: true,
     factionId: 'faction_dmc', position: { x: 0, y: 4 }, worldRadius: 4300,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 9, enemyDensity: 0.25, enemyLevel: [3, 5],
     neighbors: ['sector_helios_prime', 'sector_tethys_junction', 'sector_charon_expanse'],
     stations: [
@@ -89,6 +112,7 @@
   {
     id: 'sector_pallas_drift', name: 'Pallas Drift', tier: 2, security: 0.42, charted: true,
     factionId: 'faction_mts', position: { x: -5, y: 5 }, worldRadius: 4500,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 7, enemyDensity: 0.40, enemyLevel: [4, 7],
     neighbors: ['sector_ceres_belt', 'sector_io_reach', 'sector_sker_haven'],
     stations: [
@@ -109,6 +133,7 @@
   {
     id: 'sector_io_reach', name: 'Io Reach', tier: 2, security: 0.35, charted: true,
     factionId: 'faction_free', position: { x: 5, y: 5 }, worldRadius: 4600,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 5, enemyDensity: 0.50, enemyLevel: [5, 8],
     neighbors: ['sector_tethys_junction', 'sector_pallas_drift', 'sector_charon_expanse', 'sector_veil_nebula'],
     stations: [
@@ -132,6 +157,7 @@
   {
     id: 'sector_charon_expanse', name: 'Charon Expanse', tier: 2, security: 0.30, charted: true,
     factionId: 'faction_dmc', position: { x: 2, y: 7 }, worldRadius: 4800,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 4, enemyDensity: 0.50, enemyLevel: [5, 9],
     neighbors: ['sector_vesta_forge', 'sector_io_reach', 'sector_ashfall_reach'],
     stations: [
@@ -151,6 +177,7 @@
   {
     id: 'sector_sker_haven', name: 'Sker Haven', tier: 3, security: 0.08, charted: false,
     factionId: 'faction_reach', position: { x: -7, y: 8 }, worldRadius: 5000,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 0, enemyDensity: 0.70, enemyLevel: [7, 11],
     neighbors: ['sector_pallas_drift', 'sector_veil_nebula'],
     stations: [
@@ -169,6 +196,7 @@
   {
     id: 'sector_veil_nebula', name: 'Veil Nebula', tier: 3, security: 0.12, charted: false,
     factionId: 'faction_free', position: { x: 7, y: 9 }, worldRadius: 5200,
+    palette: SECTOR_PALETTE_CLASSES.anomaly,
     trafficPerMin: 0, enemyDensity: 0.65, enemyLevel: [8, 12],
     neighbors: ['sector_io_reach', 'sector_sker_haven'],
     wormholeTo: { sectorId: 'sector_ashfall_reach', gatedBy: 'tech:tech_long_range_survey' },
@@ -188,6 +216,7 @@
   {
     id: 'sector_ashfall_reach', name: 'Ashfall Reach', tier: 4, security: 0.05, charted: false,
     factionId: 'faction_vael', position: { x: 4, y: 11 }, worldRadius: 5500,
+    palette: SECTOR_PALETTE_CLASSES.anomaly,
     trafficPerMin: 0, enemyDensity: 0.80, enemyLevel: [10, 15],
     neighbors: ['sector_charon_expanse'],
     stations: [
diff --git a/src/render/renderer.js b/src/render/renderer.js
index def6420ff1bff2ac1c64dcc1add395e7851c4dbc..5277aeb0d55d22502e74a4598f59c5a2c9e45d45
--- a/src/render/renderer.js
+++ b/src/render/renderer.js
@@ -15,21 +15,11 @@
 import { installDiagnostics } from './diagnostics.js';
 import { createPlanetFactory } from './planetFactory.js';
 import { precompilePipelines } from './precompile.js';
-
-// Map a sector's danger/tier to a nebula backdrop tint so each region of the galaxy has its own
-// color signature. Core (safe, low tier) = clean blue; industrial mid-ring = rust/amber; lawless
-// frontier = blood-red; alien/endgame tier 4+ = violet. Returns a hex string or null (default).
-function sectorNebulaTint(sector) {
-  if (!sector) return null;
-  const tier = sector.tier || 0;
-  const sec = sector.security != null ? sector.security : 1;
-  const danger = (1 - sec) + tier * 0.15; // blended danger metric
-  if (tier >= 4) return '#5a1e8a';        // violet — alien / lawless endgame (Veil, Ashfall)
-  if (danger > 0.7) return '#8a1e1e';     // blood-red — dangerous frontier (Io Reach, Sker)
-  if (danger > 0.45) return '#8a4a1e';    // rust/amber — industrial mid-ring (Vesta, Pallas)
-  if (danger > 0.2) return '#1e4a8a';     // deep blue — settled belt (Ceres, Tethys)
-  return '#1e3a6a';                        // clean blue — safe core (Helios Prime)
-}
+import { SECTOR_PALETTE_CLASSES } from '../data/sectors.js';
+
+const SECTOR_PALETTE_LERP_SECONDS = 1.5;
+const SECTOR_LIGHT_INTENSITIES = { ambient: 0.85, key: 1.7, rim: 0.7, fill: 0.35 };
+const SECTOR_PALETTE_COLOR_FIELDS = ['ambient', 'key', 'rim', 'fill', 'fog'];
 
 // ---- contact shadow disc (module-level cache so one texture serves all entities) ----------------
 let _shadowTex = null;
@@ -178,14 +168,15 @@
     renderer.setClearColor(0x060912, 1);
     const drawSize = applyRendererSize(renderer, state);
 
-    const scene = new THREE.Scene();
-    // Thin fog for gentle depth cueing only — the old 0.00085 erased the entire backdrop, leaving a
-    // black void. This keeps the nebula + far stars visible while still fading the deep distance.
-    scene.fog = new THREE.FogExp2(0x0a1430, 0.00026);
-    scene.add(new THREE.AmbientLight(0x42506f, 0.85));
-    const key = new THREE.DirectionalLight(0xcfe2ff, 1.7); key.position.set(60, 140, 40); scene.add(key);
-    const rim = new THREE.DirectionalLight(0x6a5cff, 0.7); rim.position.set(-70, 50, -60); scene.add(rim);
-    const fill = new THREE.DirectionalLight(0x39d0ff, 0.35); fill.position.set(20, 30, 120); scene.add(fill);
+    const scene = new THREE.Scene();
+    const corePalette = SECTOR_PALETTE_CLASSES.core;
+    // Thin fog for gentle depth cueing only — the old 0.00085 erased the entire backdrop, leaving a
+    // black void. This keeps the nebula + far stars visible while still fading the deep distance.
+    scene.fog = new THREE.FogExp2(corePalette.fog, corePalette.fogDensity);
+    const ambient = new THREE.AmbientLight(corePalette.ambient, SECTOR_LIGHT_INTENSITIES.ambient); scene.add(ambient);
+    const key = new THREE.DirectionalLight(corePalette.key, SECTOR_LIGHT_INTENSITIES.key); key.position.set(60, 140, 40); scene.add(key);
+    const rim = new THREE.DirectionalLight(corePalette.rim, SECTOR_LIGHT_INTENSITIES.rim); rim.position.set(-70, 50, -60); scene.add(rim);
+    const fill = new THREE.DirectionalLight(corePalette.fill, SECTOR_LIGHT_INTENSITIES.fill); fill.position.set(20, 30, 120); scene.add(fill);
 
     // Real shadow maps (graphics spec Workstream G). Gated behind settings.video.shadows (default
     // true). The key light becomes a shadow caster with a tight frustum that follows the player so
@@ -210,7 +201,7 @@
     }
 
     const cam = createChaseCamera(state);
-    const starfield = createStarfield(scene);
+    const starfield = createStarfield(scene, { tint: corePalette.nebulaTint });
     const vf = createVisualFactory();
     // Hero-asset registry (spec §17.3): wraps the factory's build() so the bespoke player Kestrel is
     // intercepted before the procedural visualFactory. Narrow + failure-isolated — any throw falls
@@ -283,13 +274,16 @@
     // contact-sheet references and are replaced by procedural materials / inline SVG).
     { const i = new Image(); i.src = 'assets/cinematics/menu_background.jpg'; }
 
-    this.renderer = renderer; this.scene = scene; this.cam = cam; this.starfield = starfield; this.vf = vf;
-    this.authoredPartLibraryReady = preloadAuthoredPartLibrary(renderer).catch((error) => {
-      console.warn('[render] authored part library preload failed', error);
-      return null;
-    });
-    state.render.authoredPartLibraryReady = this.authoredPartLibraryReady;
-    this._keyLight = shadowsOn ? key : null; // referenced by _updateShadowFollow() each frame
+    this.renderer = renderer; this.scene = scene; this.cam = cam; this.starfield = starfield; this.vf = vf;
+    this.authoredPartLibraryReady = preloadAuthoredPartLibrary(renderer).catch((error) => {
+      console.warn('[render] authored part library preload failed', error);
+      return null;
+    });
+    state.render.authoredPartLibraryReady = this.authoredPartLibraryReady;
+    this._sectorPaletteRig = createSectorPaletteRig(scene, ambient, key, rim, fill);
+    this._sectorPaletteTarget = corePalette;
+    state.render.sectorPalette = corePalette;
+    this._keyLight = shadowsOn ? key : null; // referenced by _updateShadowFollow() each frame
     this._shadowSettingOn = shadowsOn;
     this._shadowReceiversDirty = true;
     this._shadowReceiverCount = 0;
diff --git a/src/render/starfield.js b/src/render/starfield.js
index d76965c563ac0d99166bb382577d2f6eaa4a6d0f..aecb37608592e6ff981ddaf8fd6107d17a0632e6
--- a/src/render/starfield.js
+++ b/src/render/starfield.js
@@ -116,10 +116,18 @@
   return c;
 }
 
-// --- small color helpers for sector tinting (no deps) ---
-function hexToRgb(hex) {
-  const h = hex.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
-}
+// --- small color helpers for sector tinting (no deps) ---
+function normalizeTint(tint) {
+  if (tint == null) return null;
+  if (typeof tint === 'number' && Number.isFinite(tint)) {
+    return '#' + ((tint >>> 0) & 0xffffff).toString(16).padStart(6, '0');
+  }
+  if (typeof tint === 'string') return tint.startsWith('#') ? tint : '#' + tint.replace(/^0x/i, '');
+  return null;
+}
+function hexToRgb(hex) {
+  const h = hex.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
+}
 function rgbToHex(r, g, b) {
   const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
   return '#' + c(r) + c(g) + c(b);
@@ -176,11 +184,11 @@
   ctx.restore();
 }
 
-export function createStarfield(scene, opts = {}) {
-  const layers = [];
-  const sprite = makeStarSprite();
-  let bgTexture = null;
-  let currentTint = opts.tint || null;
+export function createStarfield(scene, opts = {}) {
+  const layers = [];
+  const sprite = makeStarSprite();
+  let bgTexture = null;
+  let currentTint = normalizeTint(opts.tint);
 
   // star tints (mostly cool white/blue with a few warm + teal accents)
   const TINTS = [0xffffff, 0xcfe0ff, 0x9fb6e0, 0xfff0d8, 0x8af0d6, 0xbfd2ff];
@@ -297,13 +305,14 @@
       // GR-7: slow-rotate the distant 3D planets so they read as real spinning worlds, not billboards.
       for (const p of distantPlanets) p.mesh.rotation.y += dt * p.spin;
     },
-    // Swap the nebula mood on sector enter — each region of the galaxy reads with its own color
-    // signature (core = clean blue, industrial = rust/amber, frontier = blood-red, alien = violet).
-    setSectorTint(tint) {
-      if (tint === currentTint) return;
-      currentTint = tint || null;
-      applyBackground(currentTint);
-    },
+    // Swap the nebula mood on sector enter — each region of the galaxy reads with its own color
+    // signature (core = clean blue, industrial = rust/amber, frontier = blood-red, alien = violet).
+    setSectorTint(tint) {
+      const nextTint = normalizeTint(tint);
+      if (nextTint === currentTint) return;
+      currentTint = nextTint;
+      applyBackground(currentTint);
+    },
     setWarp() { /* extended by vfx during jump */ },
   };
 }

apply patch
patch: completed
C:\Users\93rob\Documents\GitHub\SpaceFace\src\render\renderer.js
diff --git a/src/data/sectors.js b/src/data/sectors.js
index 9c63f69479b241fc848258e3fe2161547793fa46..1814c409089f818b6ab4758b3f0cf8f8531f2452
--- a/src/data/sectors.js
+++ b/src/data/sectors.js
@@ -10,10 +10,30 @@
 export const HAZARD_TYPES  = ['dense_asteroid', 'nebula', 'radiation', 'debris'];
 export const POI_TYPES     = ['beacon', 'derelict', 'cache', 'colony', 'anomaly', 'wormhole', 'wreck'];
 
+export const SECTOR_PALETTE_CLASSES = {
+  core: {
+    key: 0xcfe2ff, rim: 0x6a5cff, fill: 0x39d0ff, ambient: 0x42506f,
+    fog: 0x0a1430, fogDensity: 0.00026, nebulaTint: 0x1e3a6a, dust: 0x7ea7c7,
+  },
+  belt: {
+    key: 0xffd59a, rim: 0xb56d2f, fill: 0xffb13d, ambient: 0x594a42,
+    fog: 0x2a160c, fogDensity: 0.00034, nebulaTint: 0x8a4a1e, dust: 0xc0793d,
+  },
+  fringe: {
+    key: 0xffb07a, rim: 0xff3f2d, fill: 0xffaa66, ambient: 0x584343,
+    fog: 0x2a0d0a, fogDensity: 0.00042, nebulaTint: 0x8a1e1e, dust: 0xc15032,
+  },
+  anomaly: {
+    key: 0xc8b6ff, rim: 0x54ffb0, fill: 0x4ddc92, ambient: 0x494760,
+    fog: 0x160d2c, fogDensity: 0.00036, nebulaTint: 0x5a1e8a, dust: 0x79ffc8,
+  },
+};
+
 export const SECTORS = [
   {
     id: 'sector_helios_prime', name: 'Helios Prime', tier: 0, security: 0.98, charted: true,
     factionId: 'faction_scn', position: { x: 0, y: 0 }, worldRadius: 3500,
+    palette: SECTOR_PALETTE_CLASSES.core,
     // Tutorial home sector: NO hostile spawns (enemyDensity 0). A brand-new pilot must not be
     // hunted before learning the ropes; danger ramps up only in neighbouring sectors.
     trafficPerMin: 18, enemyDensity: 0, enemyLevel: [1, 2],
@@ -37,6 +57,7 @@
   {
     id: 'sector_ceres_belt', name: 'Ceres Belt', tier: 1, security: 0.72, charted: true,
     factionId: 'faction_dmc', position: { x: -3, y: 2 }, worldRadius: 4200,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 10, enemyDensity: 0.18, enemyLevel: [2, 4],
     neighbors: ['sector_helios_prime', 'sector_tethys_junction', 'sector_pallas_drift'],
     stations: [
@@ -57,6 +78,7 @@
   {
     id: 'sector_tethys_junction', name: 'Tethys Junction', tier: 1, security: 0.65, charted: true,
     factionId: 'faction_mts', position: { x: 3, y: 2 }, worldRadius: 4000,
+    palette: SECTOR_PALETTE_CLASSES.core,
     trafficPerMin: 14, enemyDensity: 0.20, enemyLevel: [2, 4],
     neighbors: ['sector_helios_prime', 'sector_ceres_belt', 'sector_vesta_forge', 'sector_io_reach'],
     stations: [
@@ -72,6 +94,7 @@
   {
     id: 'sector_vesta_forge', name: 'Vesta Forge', tier: 1, security: 0.60, charted: true,
     factionId: 'faction_dmc', position: { x: 0, y: 4 }, worldRadius: 4300,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 9, enemyDensity: 0.25, enemyLevel: [3, 5],
     neighbors: ['sector_helios_prime', 'sector_tethys_junction', 'sector_charon_expanse'],
     stations: [
@@ -89,6 +112,7 @@
   {
     id: 'sector_pallas_drift', name: 'Pallas Drift', tier: 2, security: 0.42, charted: true,
     factionId: 'faction_mts', position: { x: -5, y: 5 }, worldRadius: 4500,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 7, enemyDensity: 0.40, enemyLevel: [4, 7],
     neighbors: ['sector_ceres_belt', 'sector_io_reach', 'sector_sker_haven'],
     stations: [
@@ -109,6 +133,7 @@
   {
     id: 'sector_io_reach', name: 'Io Reach', tier: 2, security: 0.35, charted: true,
     factionId: 'faction_free', position: { x: 5, y: 5 }, worldRadius: 4600,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 5, enemyDensity: 0.50, enemyLevel: [5, 8],
     neighbors: ['sector_tethys_junction', 'sector_pallas_drift', 'sector_charon_expanse', 'sector_veil_nebula'],
     stations: [
@@ -132,6 +157,7 @@
   {
     id: 'sector_charon_expanse', name: 'Charon Expanse', tier: 2, security: 0.30, charted: true,
     factionId: 'faction_dmc', position: { x: 2, y: 7 }, worldRadius: 4800,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 4, enemyDensity: 0.50, enemyLevel: [5, 9],
     neighbors: ['sector_vesta_forge', 'sector_io_reach', 'sector_ashfall_reach'],
     stations: [
@@ -151,6 +177,7 @@
   {
     id: 'sector_sker_haven', name: 'Sker Haven', tier: 3, security: 0.08, charted: false,
     factionId: 'faction_reach', position: { x: -7, y: 8 }, worldRadius: 5000,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 0, enemyDensity: 0.70, enemyLevel: [7, 11],
     neighbors: ['sector_pallas_drift', 'sector_veil_nebula'],
     stations: [
@@ -169,6 +196,7 @@
   {
     id: 'sector_veil_nebula', name: 'Veil Nebula', tier: 3, security: 0.12, charted: false,
     factionId: 'faction_free', position: { x: 7, y: 9 }, worldRadius: 5200,
+    palette: SECTOR_PALETTE_CLASSES.anomaly,
     trafficPerMin: 0, enemyDensity: 0.65, enemyLevel: [8, 12],
     neighbors: ['sector_io_reach', 'sector_sker_haven'],
     wormholeTo: { sectorId: 'sector_ashfall_reach', gatedBy: 'tech:tech_long_range_survey' },
@@ -188,6 +216,7 @@
   {
     id: 'sector_ashfall_reach', name: 'Ashfall Reach', tier: 4, security: 0.05, charted: false,
     factionId: 'faction_vael', position: { x: 4, y: 11 }, worldRadius: 5500,
+    palette: SECTOR_PALETTE_CLASSES.anomaly,
     trafficPerMin: 0, enemyDensity: 0.80, enemyLevel: [10, 15],
     neighbors: ['sector_charon_expanse'],
     stations: [
diff --git a/src/render/renderer.js b/src/render/renderer.js
index def6420ff1bff2ac1c64dcc1add395e7851c4dbc..1db34879278fe1bbb8d27c72c961cb3ffb29bec6
--- a/src/render/renderer.js
+++ b/src/render/renderer.js
@@ -15,21 +15,11 @@
 import { installDiagnostics } from './diagnostics.js';
 import { createPlanetFactory } from './planetFactory.js';
 import { precompilePipelines } from './precompile.js';
-
-// Map a sector's danger/tier to a nebula backdrop tint so each region of the galaxy has its own
-// color signature. Core (safe, low tier) = clean blue; industrial mid-ring = rust/amber; lawless
-// frontier = blood-red; alien/endgame tier 4+ = violet. Returns a hex string or null (default).
-function sectorNebulaTint(sector) {
-  if (!sector) return null;
-  const tier = sector.tier || 0;
-  const sec = sector.security != null ? sector.security : 1;
-  const danger = (1 - sec) + tier * 0.15; // blended danger metric
-  if (tier >= 4) return '#5a1e8a';        // violet — alien / lawless endgame (Veil, Ashfall)
-  if (danger > 0.7) return '#8a1e1e';     // blood-red — dangerous frontier (Io Reach, Sker)
-  if (danger > 0.45) return '#8a4a1e';    // rust/amber — industrial mid-ring (Vesta, Pallas)
-  if (danger > 0.2) return '#1e4a8a';     // deep blue — settled belt (Ceres, Tethys)
-  return '#1e3a6a';                        // clean blue — safe core (Helios Prime)
-}
+import { SECTOR_PALETTE_CLASSES } from '../data/sectors.js';
+
+const SECTOR_PALETTE_LERP_SECONDS = 1.5;
+const SECTOR_LIGHT_INTENSITIES = { ambient: 0.85, key: 1.7, rim: 0.7, fill: 0.35 };
+const SECTOR_PALETTE_COLOR_FIELDS = ['ambient', 'key', 'rim', 'fill', 'fog'];
 
 // ---- contact shadow disc (module-level cache so one texture serves all entities) ----------------
 let _shadowTex = null;
@@ -178,14 +168,15 @@
     renderer.setClearColor(0x060912, 1);
     const drawSize = applyRendererSize(renderer, state);
 
-    const scene = new THREE.Scene();
-    // Thin fog for gentle depth cueing only — the old 0.00085 erased the entire backdrop, leaving a
-    // black void. This keeps the nebula + far stars visible while still fading the deep distance.
-    scene.fog = new THREE.FogExp2(0x0a1430, 0.00026);
-    scene.add(new THREE.AmbientLight(0x42506f, 0.85));
-    const key = new THREE.DirectionalLight(0xcfe2ff, 1.7); key.position.set(60, 140, 40); scene.add(key);
-    const rim = new THREE.DirectionalLight(0x6a5cff, 0.7); rim.position.set(-70, 50, -60); scene.add(rim);
-    const fill = new THREE.DirectionalLight(0x39d0ff, 0.35); fill.position.set(20, 30, 120); scene.add(fill);
+    const scene = new THREE.Scene();
+    const corePalette = SECTOR_PALETTE_CLASSES.core;
+    // Thin fog for gentle depth cueing only — the old 0.00085 erased the entire backdrop, leaving a
+    // black void. This keeps the nebula + far stars visible while still fading the deep distance.
+    scene.fog = new THREE.FogExp2(corePalette.fog, corePalette.fogDensity);
+    const ambient = new THREE.AmbientLight(corePalette.ambient, SECTOR_LIGHT_INTENSITIES.ambient); scene.add(ambient);
+    const key = new THREE.DirectionalLight(corePalette.key, SECTOR_LIGHT_INTENSITIES.key); key.position.set(60, 140, 40); scene.add(key);
+    const rim = new THREE.DirectionalLight(corePalette.rim, SECTOR_LIGHT_INTENSITIES.rim); rim.position.set(-70, 50, -60); scene.add(rim);
+    const fill = new THREE.DirectionalLight(corePalette.fill, SECTOR_LIGHT_INTENSITIES.fill); fill.position.set(20, 30, 120); scene.add(fill);
 
     // Real shadow maps (graphics spec Workstream G). Gated behind settings.video.shadows (default
     // true). The key light becomes a shadow caster with a tight frustum that follows the player so
@@ -210,7 +201,7 @@
     }
 
     const cam = createChaseCamera(state);
-    const starfield = createStarfield(scene);
+    const starfield = createStarfield(scene, { tint: corePalette.nebulaTint });
     const vf = createVisualFactory();
     // Hero-asset registry (spec §17.3): wraps the factory's build() so the bespoke player Kestrel is
     // intercepted before the procedural visualFactory. Narrow + failure-isolated — any throw falls
@@ -283,13 +274,16 @@
     // contact-sheet references and are replaced by procedural materials / inline SVG).
     { const i = new Image(); i.src = 'assets/cinematics/menu_background.jpg'; }
 
-    this.renderer = renderer; this.scene = scene; this.cam = cam; this.starfield = starfield; this.vf = vf;
-    this.authoredPartLibraryReady = preloadAuthoredPartLibrary(renderer).catch((error) => {
-      console.warn('[render] authored part library preload failed', error);
-      return null;
-    });
-    state.render.authoredPartLibraryReady = this.authoredPartLibraryReady;
-    this._keyLight = shadowsOn ? key : null; // referenced by _updateShadowFollow() each frame
+    this.renderer = renderer; this.scene = scene; this.cam = cam; this.starfield = starfield; this.vf = vf;
+    this.authoredPartLibraryReady = preloadAuthoredPartLibrary(renderer).catch((error) => {
+      console.warn('[render] authored part library preload failed', error);
+      return null;
+    });
+    state.render.authoredPartLibraryReady = this.authoredPartLibraryReady;
+    this._sectorPaletteRig = createSectorPaletteRig(scene, ambient, key, rim, fill);
+    this._sectorPaletteTarget = corePalette;
+    state.render.sectorPalette = corePalette;
+    this._keyLight = shadowsOn ? key : null; // referenced by _updateShadowFollow() each frame
     this._shadowSettingOn = shadowsOn;
     this._shadowReceiversDirty = true;
     this._shadowReceiverCount = 0;
@@ -410,20 +404,19 @@
     // already spawned by the time this fires (enterSector spawns before its sector:enter resolves),
     // so a blind clearAllMeshes(keepPlayer) used to wipe the station/asteroids and leave the player
     // alone in empty space. reconcileMeshes() removes only meshes for entities that are gone.
-    bus.on('sector:enter', ({ sector } = {}) => {
-      this._meshReconcileDirty = true;
-      if (cam.snapToPlayer) cam.snapToPlayer();
-      this._updatePlanetBodies(sector);
-      // Tint the nebula backdrop to the sector's mood so each region of the galaxy reads with its
-      // own color signature: clean-blue core → rust/amber industrial → blood-red frontier → violet
-      // alien/endgame. Drives the whole-frame atmosphere, reinforcing the core-to-frontier gradient.
-      if (this.starfield && this.starfield.setSectorTint) {
-        this.starfield.setSectorTint(sectorNebulaTint(sector));
-      }
+    bus.on('sector:enter', ({ sector } = {}) => {
+      this._meshReconcileDirty = true;
+      if (cam.snapToPlayer) cam.snapToPlayer();
+      this._updatePlanetBodies(sector);
+      this._beginSectorPaletteTransition(sector);
       this._updateHazardVisuals(sector);
       precompilePipelines(renderer, scene, cam.obj, { sector }).catch((error) => console.warn('[render] sector pipeline precompile failed', error));
     });
-    bus.on('save:loaded', () => { this._meshReconcileDirty = true; });
+    bus.on('jump:arrive', ({ sectorId } = {}) => {
+      const sector = sectorId && state.world && state.world.sectors ? state.world.sectors[sectorId] : null;
+      this._beginSectorPaletteTransition(sector);
+    });
+    bus.on('save:loaded', () => { this._meshReconcileDirty = true; });
 
     window.addEventListener('resize', () => this.onResize());
   },
diff --git a/src/render/starfield.js b/src/render/starfield.js
index d76965c563ac0d99166bb382577d2f6eaa4a6d0f..aecb37608592e6ff981ddaf8fd6107d17a0632e6
--- a/src/render/starfield.js
+++ b/src/render/starfield.js
@@ -116,10 +116,18 @@
   return c;
 }
 
-// --- small color helpers for sector tinting (no deps) ---
-function hexToRgb(hex) {
-  const h = hex.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
-}
+// --- small color helpers for sector tinting (no deps) ---
+function normalizeTint(tint) {
+  if (tint == null) return null;
+  if (typeof tint === 'number' && Number.isFinite(tint)) {
+    return '#' + ((tint >>> 0) & 0xffffff).toString(16).padStart(6, '0');
+  }
+  if (typeof tint === 'string') return tint.startsWith('#') ? tint : '#' + tint.replace(/^0x/i, '');
+  return null;
+}
+function hexToRgb(hex) {
+  const h = hex.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
+}
 function rgbToHex(r, g, b) {
   const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
   return '#' + c(r) + c(g) + c(b);
@@ -176,11 +184,11 @@
   ctx.restore();
 }
 
-export function createStarfield(scene, opts = {}) {
-  const layers = [];
-  const sprite = makeStarSprite();
-  let bgTexture = null;
-  let currentTint = opts.tint || null;
+export function createStarfield(scene, opts = {}) {
+  const layers = [];
+  const sprite = makeStarSprite();
+  let bgTexture = null;
+  let currentTint = normalizeTint(opts.tint);
 
   // star tints (mostly cool white/blue with a few warm + teal accents)
   const TINTS = [0xffffff, 0xcfe0ff, 0x9fb6e0, 0xfff0d8, 0x8af0d6, 0xbfd2ff];
@@ -297,13 +305,14 @@
       // GR-7: slow-rotate the distant 3D planets so they read as real spinning worlds, not billboards.
       for (const p of distantPlanets) p.mesh.rotation.y += dt * p.spin;
     },
-    // Swap the nebula mood on sector enter — each region of the galaxy reads with its own color
-    // signature (core = clean blue, industrial = rust/amber, frontier = blood-red, alien = violet).
-    setSectorTint(tint) {
-      if (tint === currentTint) return;
-      currentTint = tint || null;
-      applyBackground(currentTint);
-    },
+    // Swap the nebula mood on sector enter — each region of the galaxy reads with its own color
+    // signature (core = clean blue, industrial = rust/amber, frontier = blood-red, alien = violet).
+    setSectorTint(tint) {
+      const nextTint = normalizeTint(tint);
+      if (nextTint === currentTint) return;
+      currentTint = nextTint;
+      applyBackground(currentTint);
+    },
     setWarp() { /* extended by vfx during jump */ },
   };
 }

diff --git a/src/data/sectors.js b/src/data/sectors.js
index 9c63f69479b241fc848258e3fe2161547793fa46..1814c409089f818b6ab4758b3f0cf8f8531f2452
--- a/src/data/sectors.js
+++ b/src/data/sectors.js
@@ -10,10 +10,30 @@
 export const HAZARD_TYPES  = ['dense_asteroid', 'nebula', 'radiation', 'debris'];
 export const POI_TYPES     = ['beacon', 'derelict', 'cache', 'colony', 'anomaly', 'wormhole', 'wreck'];
 
+export const SECTOR_PALETTE_CLASSES = {
+  core: {
+    key: 0xcfe2ff, rim: 0x6a5cff, fill: 0x39d0ff, ambient: 0x42506f,
+    fog: 0x0a1430, fogDensity: 0.00026, nebulaTint: 0x1e3a6a, dust: 0x7ea7c7,
+  },
+  belt: {
+    key: 0xffd59a, rim: 0xb56d2f, fill: 0xffb13d, ambient: 0x594a42,
+    fog: 0x2a160c, fogDensity: 0.00034, nebulaTint: 0x8a4a1e, dust: 0xc0793d,
+  },
+  fringe: {
+    key: 0xffb07a, rim: 0xff3f2d, fill: 0xffaa66, ambient: 0x584343,
+    fog: 0x2a0d0a, fogDensity: 0.00042, nebulaTint: 0x8a1e1e, dust: 0xc15032,
+  },
+  anomaly: {
+    key: 0xc8b6ff, rim: 0x54ffb0, fill: 0x4ddc92, ambient: 0x494760,
+    fog: 0x160d2c, fogDensity: 0.00036, nebulaTint: 0x5a1e8a, dust: 0x79ffc8,
+  },
+};
+
 export const SECTORS = [
   {
     id: 'sector_helios_prime', name: 'Helios Prime', tier: 0, security: 0.98, charted: true,
     factionId: 'faction_scn', position: { x: 0, y: 0 }, worldRadius: 3500,
+    palette: SECTOR_PALETTE_CLASSES.core,
     // Tutorial home sector: NO hostile spawns (enemyDensity 0). A brand-new pilot must not be
     // hunted before learning the ropes; danger ramps up only in neighbouring sectors.
     trafficPerMin: 18, enemyDensity: 0, enemyLevel: [1, 2],
@@ -37,6 +57,7 @@
   {
     id: 'sector_ceres_belt', name: 'Ceres Belt', tier: 1, security: 0.72, charted: true,
     factionId: 'faction_dmc', position: { x: -3, y: 2 }, worldRadius: 4200,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 10, enemyDensity: 0.18, enemyLevel: [2, 4],
     neighbors: ['sector_helios_prime', 'sector_tethys_junction', 'sector_pallas_drift'],
     stations: [
@@ -57,6 +78,7 @@
   {
     id: 'sector_tethys_junction', name: 'Tethys Junction', tier: 1, security: 0.65, charted: true,
     factionId: 'faction_mts', position: { x: 3, y: 2 }, worldRadius: 4000,
+    palette: SECTOR_PALETTE_CLASSES.core,
     trafficPerMin: 14, enemyDensity: 0.20, enemyLevel: [2, 4],
     neighbors: ['sector_helios_prime', 'sector_ceres_belt', 'sector_vesta_forge', 'sector_io_reach'],
     stations: [
@@ -72,6 +94,7 @@
   {
     id: 'sector_vesta_forge', name: 'Vesta Forge', tier: 1, security: 0.60, charted: true,
     factionId: 'faction_dmc', position: { x: 0, y: 4 }, worldRadius: 4300,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 9, enemyDensity: 0.25, enemyLevel: [3, 5],
     neighbors: ['sector_helios_prime', 'sector_tethys_junction', 'sector_charon_expanse'],
     stations: [
@@ -89,6 +112,7 @@
   {
     id: 'sector_pallas_drift', name: 'Pallas Drift', tier: 2, security: 0.42, charted: true,
     factionId: 'faction_mts', position: { x: -5, y: 5 }, worldRadius: 4500,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 7, enemyDensity: 0.40, enemyLevel: [4, 7],
     neighbors: ['sector_ceres_belt', 'sector_io_reach', 'sector_sker_haven'],
     stations: [
@@ -109,6 +133,7 @@
   {
     id: 'sector_io_reach', name: 'Io Reach', tier: 2, security: 0.35, charted: true,
     factionId: 'faction_free', position: { x: 5, y: 5 }, worldRadius: 4600,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 5, enemyDensity: 0.50, enemyLevel: [5, 8],
     neighbors: ['sector_tethys_junction', 'sector_pallas_drift', 'sector_charon_expanse', 'sector_veil_nebula'],
     stations: [
@@ -132,6 +157,7 @@
   {
     id: 'sector_charon_expanse', name: 'Charon Expanse', tier: 2, security: 0.30, charted: true,
     factionId: 'faction_dmc', position: { x: 2, y: 7 }, worldRadius: 4800,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 4, enemyDensity: 0.50, enemyLevel: [5, 9],
     neighbors: ['sector_vesta_forge', 'sector_io_reach', 'sector_ashfall_reach'],
     stations: [
@@ -151,6 +177,7 @@
   {
     id: 'sector_sker_haven', name: 'Sker Haven', tier: 3, security: 0.08, charted: false,
     factionId: 'faction_reach', position: { x: -7, y: 8 }, worldRadius: 5000,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 0, enemyDensity: 0.70, enemyLevel: [7, 11],
     neighbors: ['sector_pallas_drift', 'sector_veil_nebula'],
     stations: [
@@ -169,6 +196,7 @@
   {
     id: 'sector_veil_nebula', name: 'Veil Nebula', tier: 3, security: 0.12, charted: false,
     factionId: 'faction_free', position: { x: 7, y: 9 }, worldRadius: 5200,
+    palette: SECTOR_PALETTE_CLASSES.anomaly,
     trafficPerMin: 0, enemyDensity: 0.65, enemyLevel: [8, 12],
     neighbors: ['sector_io_reach', 'sector_sker_haven'],
     wormholeTo: { sectorId: 'sector_ashfall_reach', gatedBy: 'tech:tech_long_range_survey' },
@@ -188,6 +216,7 @@
   {
     id: 'sector_ashfall_reach', name: 'Ashfall Reach', tier: 4, security: 0.05, charted: false,
     factionId: 'faction_vael', position: { x: 4, y: 11 }, worldRadius: 5500,
+    palette: SECTOR_PALETTE_CLASSES.anomaly,
     trafficPerMin: 0, enemyDensity: 0.80, enemyLevel: [10, 15],
     neighbors: ['sector_charon_expanse'],
     stations: [
diff --git a/src/render/renderer.js b/src/render/renderer.js
index def6420ff1bff2ac1c64dcc1add395e7851c4dbc..1db34879278fe1bbb8d27c72c961cb3ffb29bec6
--- a/src/render/renderer.js
+++ b/src/render/renderer.js
@@ -15,21 +15,11 @@
 import { installDiagnostics } from './diagnostics.js';
 import { createPlanetFactory } from './planetFactory.js';
 import { precompilePipelines } from './precompile.js';
-
-// Map a sector's danger/tier to a nebula backdrop tint so each region of the galaxy has its own
-// color signature. Core (safe, low tier) = clean blue; industrial mid-ring = rust/amber; lawless
-// frontier = blood-red; alien/endgame tier 4+ = violet. Returns a hex string or null (default).
-function sectorNebulaTint(sector) {
-  if (!sector) return null;
-  const tier = sector.tier || 0;
-  const sec = sector.security != null ? sector.security : 1;
-  const danger = (1 - sec) + tier * 0.15; // blended danger metric
-  if (tier >= 4) return '#5a1e8a';        // violet — alien / lawless endgame (Veil, Ashfall)
-  if (danger > 0.7) return '#8a1e1e';     // blood-red — dangerous frontier (Io Reach, Sker)
-  if (danger > 0.45) return '#8a4a1e';    // rust/amber — industrial mid-ring (Vesta, Pallas)
-  if (danger > 0.2) return '#1e4a8a';     // deep blue — settled belt (Ceres, Tethys)
-  return '#1e3a6a';                        // clean blue — safe core (Helios Prime)
-}
+import { SECTOR_PALETTE_CLASSES } from '../data/sectors.js';
+
+const SECTOR_PALETTE_LERP_SECONDS = 1.5;
+const SECTOR_LIGHT_INTENSITIES = { ambient: 0.85, key: 1.7, rim: 0.7, fill: 0.35 };
+const SECTOR_PALETTE_COLOR_FIELDS = ['ambient', 'key', 'rim', 'fill', 'fog'];
 
 // ---- contact shadow disc (module-level cache so one texture serves all entities) ----------------
 let _shadowTex = null;
@@ -178,14 +168,15 @@
     renderer.setClearColor(0x060912, 1);
     const drawSize = applyRendererSize(renderer, state);
 
-    const scene = new THREE.Scene();
-    // Thin fog for gentle depth cueing only — the old 0.00085 erased the entire backdrop, leaving a
-    // black void. This keeps the nebula + far stars visible while still fading the deep distance.
-    scene.fog = new THREE.FogExp2(0x0a1430, 0.00026);
-    scene.add(new THREE.AmbientLight(0x42506f, 0.85));
-    const key = new THREE.DirectionalLight(0xcfe2ff, 1.7); key.position.set(60, 140, 40); scene.add(key);
-    const rim = new THREE.DirectionalLight(0x6a5cff, 0.7); rim.position.set(-70, 50, -60); scene.add(rim);
-    const fill = new THREE.DirectionalLight(0x39d0ff, 0.35); fill.position.set(20, 30, 120); scene.add(fill);
+    const scene = new THREE.Scene();
+    const corePalette = SECTOR_PALETTE_CLASSES.core;
+    // Thin fog for gentle depth cueing only — the old 0.00085 erased the entire backdrop, leaving a
+    // black void. This keeps the nebula + far stars visible while still fading the deep distance.
+    scene.fog = new THREE.FogExp2(corePalette.fog, corePalette.fogDensity);
+    const ambient = new THREE.AmbientLight(corePalette.ambient, SECTOR_LIGHT_INTENSITIES.ambient); scene.add(ambient);
+    const key = new THREE.DirectionalLight(corePalette.key, SECTOR_LIGHT_INTENSITIES.key); key.position.set(60, 140, 40); scene.add(key);
+    const rim = new THREE.DirectionalLight(corePalette.rim, SECTOR_LIGHT_INTENSITIES.rim); rim.position.set(-70, 50, -60); scene.add(rim);
+    const fill = new THREE.DirectionalLight(corePalette.fill, SECTOR_LIGHT_INTENSITIES.fill); fill.position.set(20, 30, 120); scene.add(fill);
 
     // Real shadow maps (graphics spec Workstream G). Gated behind settings.video.shadows (default
     // true). The key light becomes a shadow caster with a tight frustum that follows the player so
@@ -210,7 +201,7 @@
     }
 
     const cam = createChaseCamera(state);
-    const starfield = createStarfield(scene);
+    const starfield = createStarfield(scene, { tint: corePalette.nebulaTint });
     const vf = createVisualFactory();
     // Hero-asset registry (spec §17.3): wraps the factory's build() so the bespoke player Kestrel is
     // intercepted before the procedural visualFactory. Narrow + failure-isolated — any throw falls
@@ -283,13 +274,16 @@
     // contact-sheet references and are replaced by procedural materials / inline SVG).
     { const i = new Image(); i.src = 'assets/cinematics/menu_background.jpg'; }
 
-    this.renderer = renderer; this.scene = scene; this.cam = cam; this.starfield = starfield; this.vf = vf;
-    this.authoredPartLibraryReady = preloadAuthoredPartLibrary(renderer).catch((error) => {
-      console.warn('[render] authored part library preload failed', error);
-      return null;
-    });
-    state.render.authoredPartLibraryReady = this.authoredPartLibraryReady;
-    this._keyLight = shadowsOn ? key : null; // referenced by _updateShadowFollow() each frame
+    this.renderer = renderer; this.scene = scene; this.cam = cam; this.starfield = starfield; this.vf = vf;
+    this.authoredPartLibraryReady = preloadAuthoredPartLibrary(renderer).catch((error) => {
+      console.warn('[render] authored part library preload failed', error);
+      return null;
+    });
+    state.render.authoredPartLibraryReady = this.authoredPartLibraryReady;
+    this._sectorPaletteRig = createSectorPaletteRig(scene, ambient, key, rim, fill);
+    this._sectorPaletteTarget = corePalette;
+    state.render.sectorPalette = corePalette;
+    this._keyLight = shadowsOn ? key : null; // referenced by _updateShadowFollow() each frame
     this._shadowSettingOn = shadowsOn;
     this._shadowReceiversDirty = true;
     this._shadowReceiverCount = 0;
@@ -410,20 +404,19 @@
     // already spawned by the time this fires (enterSector spawns before its sector:enter resolves),
     // so a blind clearAllMeshes(keepPlayer) used to wipe the station/asteroids and leave the player
     // alone in empty space. reconcileMeshes() removes only meshes for entities that are gone.
-    bus.on('sector:enter', ({ sector } = {}) => {
-      this._meshReconcileDirty = true;
-      if (cam.snapToPlayer) cam.snapToPlayer();
-      this._updatePlanetBodies(sector);
-      // Tint the nebula backdrop to the sector's mood so each region of the galaxy reads with its
-      // own color signature: clean-blue core → rust/amber industrial → blood-red frontier → violet
-      // alien/endgame. Drives the whole-frame atmosphere, reinforcing the core-to-frontier gradient.
-      if (this.starfield && this.starfield.setSectorTint) {
-        this.starfield.setSectorTint(sectorNebulaTint(sector));
-      }
+    bus.on('sector:enter', ({ sector } = {}) => {
+      this._meshReconcileDirty = true;
+      if (cam.snapToPlayer) cam.snapToPlayer();
+      this._updatePlanetBodies(sector);
+      this._beginSectorPaletteTransition(sector);
       this._updateHazardVisuals(sector);
       precompilePipelines(renderer, scene, cam.obj, { sector }).catch((error) => console.warn('[render] sector pipeline precompile failed', error));
     });
-    bus.on('save:loaded', () => { this._meshReconcileDirty = true; });
+    bus.on('jump:arrive', ({ sectorId } = {}) => {
+      const sector = sectorId && state.world && state.world.sectors ? state.world.sectors[sectorId] : null;
+      this._beginSectorPaletteTransition(sector);
+    });
+    bus.on('save:loaded', () => { this._meshReconcileDirty = true; });
 
     window.addEventListener('resize', () => this.onResize());
   },
diff --git a/src/render/starfield.js b/src/render/starfield.js
index d76965c563ac0d99166bb382577d2f6eaa4a6d0f..aecb37608592e6ff981ddaf8fd6107d17a0632e6
--- a/src/render/starfield.js
+++ b/src/render/starfield.js
@@ -116,10 +116,18 @@
   return c;
 }
 
-// --- small color helpers for sector tinting (no deps) ---
-function hexToRgb(hex) {
-  const h = hex.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
-}
+// --- small color helpers for sector tinting (no deps) ---
+function normalizeTint(tint) {
+  if (tint == null) return null;
+  if (typeof tint === 'number' && Number.isFinite(tint)) {
+    return '#' + ((tint >>> 0) & 0xffffff).toString(16).padStart(6, '0');
+  }
+  if (typeof tint === 'string') return tint.startsWith('#') ? tint : '#' + tint.replace(/^0x/i, '');
+  return null;
+}
+function hexToRgb(hex) {
+  const h = hex.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
+}
 function rgbToHex(r, g, b) {
   const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
   return '#' + c(r) + c(g) + c(b);
@@ -176,11 +184,11 @@
   ctx.restore();
 }
 
-export function createStarfield(scene, opts = {}) {
-  const layers = [];
-  const sprite = makeStarSprite();
-  let bgTexture = null;
-  let currentTint = opts.tint || null;
+export function createStarfield(scene, opts = {}) {
+  const layers = [];
+  const sprite = makeStarSprite();
+  let bgTexture = null;
+  let currentTint = normalizeTint(opts.tint);
 
   // star tints (mostly cool white/blue with a few warm + teal accents)
   const TINTS = [0xffffff, 0xcfe0ff, 0x9fb6e0, 0xfff0d8, 0x8af0d6, 0xbfd2ff];
@@ -297,13 +305,14 @@
       // GR-7: slow-rotate the distant 3D planets so they read as real spinning worlds, not billboards.
       for (const p of distantPlanets) p.mesh.rotation.y += dt * p.spin;
     },
-    // Swap the nebula mood on sector enter — each region of the galaxy reads with its own color
-    // signature (core = clean blue, industrial = rust/amber, frontier = blood-red, alien = violet).
-    setSectorTint(tint) {
-      if (tint === currentTint) return;
-      currentTint = tint || null;
-      applyBackground(currentTint);
-    },
+    // Swap the nebula mood on sector enter — each region of the galaxy reads with its own color
+    // signature (core = clean blue, industrial = rust/amber, frontier = blood-red, alien = violet).
+    setSectorTint(tint) {
+      const nextTint = normalizeTint(tint);
+      if (nextTint === currentTint) return;
+      currentTint = nextTint;
+      applyBackground(currentTint);
+    },
     setWarp() { /* extended by vfx during jump */ },
   };
 }

codex
The transition loop will only do work while a 1.5s palette fade is active. When idle, it’s one branch and returns; when active, it reuses preallocated `THREE.Color` frames for start/target colors.
apply patch
patch: completed
C:\Users\93rob\Documents\GitHub\SpaceFace\src\render\renderer.js
diff --git a/src/data/sectors.js b/src/data/sectors.js
index 9c63f69479b241fc848258e3fe2161547793fa46..1814c409089f818b6ab4758b3f0cf8f8531f2452
--- a/src/data/sectors.js
+++ b/src/data/sectors.js
@@ -10,10 +10,30 @@
 export const HAZARD_TYPES  = ['dense_asteroid', 'nebula', 'radiation', 'debris'];
 export const POI_TYPES     = ['beacon', 'derelict', 'cache', 'colony', 'anomaly', 'wormhole', 'wreck'];
 
+export const SECTOR_PALETTE_CLASSES = {
+  core: {
+    key: 0xcfe2ff, rim: 0x6a5cff, fill: 0x39d0ff, ambient: 0x42506f,
+    fog: 0x0a1430, fogDensity: 0.00026, nebulaTint: 0x1e3a6a, dust: 0x7ea7c7,
+  },
+  belt: {
+    key: 0xffd59a, rim: 0xb56d2f, fill: 0xffb13d, ambient: 0x594a42,
+    fog: 0x2a160c, fogDensity: 0.00034, nebulaTint: 0x8a4a1e, dust: 0xc0793d,
+  },
+  fringe: {
+    key: 0xffb07a, rim: 0xff3f2d, fill: 0xffaa66, ambient: 0x584343,
+    fog: 0x2a0d0a, fogDensity: 0.00042, nebulaTint: 0x8a1e1e, dust: 0xc15032,
+  },
+  anomaly: {
+    key: 0xc8b6ff, rim: 0x54ffb0, fill: 0x4ddc92, ambient: 0x494760,
+    fog: 0x160d2c, fogDensity: 0.00036, nebulaTint: 0x5a1e8a, dust: 0x79ffc8,
+  },
+};
+
 export const SECTORS = [
   {
     id: 'sector_helios_prime', name: 'Helios Prime', tier: 0, security: 0.98, charted: true,
     factionId: 'faction_scn', position: { x: 0, y: 0 }, worldRadius: 3500,
+    palette: SECTOR_PALETTE_CLASSES.core,
     // Tutorial home sector: NO hostile spawns (enemyDensity 0). A brand-new pilot must not be
     // hunted before learning the ropes; danger ramps up only in neighbouring sectors.
     trafficPerMin: 18, enemyDensity: 0, enemyLevel: [1, 2],
@@ -37,6 +57,7 @@
   {
     id: 'sector_ceres_belt', name: 'Ceres Belt', tier: 1, security: 0.72, charted: true,
     factionId: 'faction_dmc', position: { x: -3, y: 2 }, worldRadius: 4200,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 10, enemyDensity: 0.18, enemyLevel: [2, 4],
     neighbors: ['sector_helios_prime', 'sector_tethys_junction', 'sector_pallas_drift'],
     stations: [
@@ -57,6 +78,7 @@
   {
     id: 'sector_tethys_junction', name: 'Tethys Junction', tier: 1, security: 0.65, charted: true,
     factionId: 'faction_mts', position: { x: 3, y: 2 }, worldRadius: 4000,
+    palette: SECTOR_PALETTE_CLASSES.core,
     trafficPerMin: 14, enemyDensity: 0.20, enemyLevel: [2, 4],
     neighbors: ['sector_helios_prime', 'sector_ceres_belt', 'sector_vesta_forge', 'sector_io_reach'],
     stations: [
@@ -72,6 +94,7 @@
   {
     id: 'sector_vesta_forge', name: 'Vesta Forge', tier: 1, security: 0.60, charted: true,
     factionId: 'faction_dmc', position: { x: 0, y: 4 }, worldRadius: 4300,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 9, enemyDensity: 0.25, enemyLevel: [3, 5],
     neighbors: ['sector_helios_prime', 'sector_tethys_junction', 'sector_charon_expanse'],
     stations: [
@@ -89,6 +112,7 @@
   {
     id: 'sector_pallas_drift', name: 'Pallas Drift', tier: 2, security: 0.42, charted: true,
     factionId: 'faction_mts', position: { x: -5, y: 5 }, worldRadius: 4500,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 7, enemyDensity: 0.40, enemyLevel: [4, 7],
     neighbors: ['sector_ceres_belt', 'sector_io_reach', 'sector_sker_haven'],
     stations: [
@@ -109,6 +133,7 @@
   {
     id: 'sector_io_reach', name: 'Io Reach', tier: 2, security: 0.35, charted: true,
     factionId: 'faction_free', position: { x: 5, y: 5 }, worldRadius: 4600,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 5, enemyDensity: 0.50, enemyLevel: [5, 8],
     neighbors: ['sector_tethys_junction', 'sector_pallas_drift', 'sector_charon_expanse', 'sector_veil_nebula'],
     stations: [
@@ -132,6 +157,7 @@
   {
     id: 'sector_charon_expanse', name: 'Charon Expanse', tier: 2, security: 0.30, charted: true,
     factionId: 'faction_dmc', position: { x: 2, y: 7 }, worldRadius: 4800,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 4, enemyDensity: 0.50, enemyLevel: [5, 9],
     neighbors: ['sector_vesta_forge', 'sector_io_reach', 'sector_ashfall_reach'],
     stations: [
@@ -151,6 +177,7 @@
   {
     id: 'sector_sker_haven', name: 'Sker Haven', tier: 3, security: 0.08, charted: false,
     factionId: 'faction_reach', position: { x: -7, y: 8 }, worldRadius: 5000,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 0, enemyDensity: 0.70, enemyLevel: [7, 11],
     neighbors: ['sector_pallas_drift', 'sector_veil_nebula'],
     stations: [
@@ -169,6 +196,7 @@
   {
     id: 'sector_veil_nebula', name: 'Veil Nebula', tier: 3, security: 0.12, charted: false,
     factionId: 'faction_free', position: { x: 7, y: 9 }, worldRadius: 5200,
+    palette: SECTOR_PALETTE_CLASSES.anomaly,
     trafficPerMin: 0, enemyDensity: 0.65, enemyLevel: [8, 12],
     neighbors: ['sector_io_reach', 'sector_sker_haven'],
     wormholeTo: { sectorId: 'sector_ashfall_reach', gatedBy: 'tech:tech_long_range_survey' },
@@ -188,6 +216,7 @@
   {
     id: 'sector_ashfall_reach', name: 'Ashfall Reach', tier: 4, security: 0.05, charted: false,
     factionId: 'faction_vael', position: { x: 4, y: 11 }, worldRadius: 5500,
+    palette: SECTOR_PALETTE_CLASSES.anomaly,
     trafficPerMin: 0, enemyDensity: 0.80, enemyLevel: [10, 15],
     neighbors: ['sector_charon_expanse'],
     stations: [
diff --git a/src/render/renderer.js b/src/render/renderer.js
index def6420ff1bff2ac1c64dcc1add395e7851c4dbc..c184e67c4af8d9208a381c0553ed8dc2dbf13d98
--- a/src/render/renderer.js
+++ b/src/render/renderer.js
@@ -15,21 +15,11 @@
 import { installDiagnostics } from './diagnostics.js';
 import { createPlanetFactory } from './planetFactory.js';
 import { precompilePipelines } from './precompile.js';
-
-// Map a sector's danger/tier to a nebula backdrop tint so each region of the galaxy has its own
-// color signature. Core (safe, low tier) = clean blue; industrial mid-ring = rust/amber; lawless
-// frontier = blood-red; alien/endgame tier 4+ = violet. Returns a hex string or null (default).
-function sectorNebulaTint(sector) {
-  if (!sector) return null;
-  const tier = sector.tier || 0;
-  const sec = sector.security != null ? sector.security : 1;
-  const danger = (1 - sec) + tier * 0.15; // blended danger metric
-  if (tier >= 4) return '#5a1e8a';        // violet — alien / lawless endgame (Veil, Ashfall)
-  if (danger > 0.7) return '#8a1e1e';     // blood-red — dangerous frontier (Io Reach, Sker)
-  if (danger > 0.45) return '#8a4a1e';    // rust/amber — industrial mid-ring (Vesta, Pallas)
-  if (danger > 0.2) return '#1e4a8a';     // deep blue — settled belt (Ceres, Tethys)
-  return '#1e3a6a';                        // clean blue — safe core (Helios Prime)
-}
+import { SECTOR_PALETTE_CLASSES } from '../data/sectors.js';
+
+const SECTOR_PALETTE_LERP_SECONDS = 1.5;
+const SECTOR_LIGHT_INTENSITIES = { ambient: 0.85, key: 1.7, rim: 0.7, fill: 0.35 };
+const SECTOR_PALETTE_COLOR_FIELDS = ['ambient', 'key', 'rim', 'fill', 'fog'];
 
 // ---- contact shadow disc (module-level cache so one texture serves all entities) ----------------
 let _shadowTex = null;
@@ -178,14 +168,15 @@
     renderer.setClearColor(0x060912, 1);
     const drawSize = applyRendererSize(renderer, state);
 
-    const scene = new THREE.Scene();
-    // Thin fog for gentle depth cueing only — the old 0.00085 erased the entire backdrop, leaving a
-    // black void. This keeps the nebula + far stars visible while still fading the deep distance.
-    scene.fog = new THREE.FogExp2(0x0a1430, 0.00026);
-    scene.add(new THREE.AmbientLight(0x42506f, 0.85));
-    const key = new THREE.DirectionalLight(0xcfe2ff, 1.7); key.position.set(60, 140, 40); scene.add(key);
-    const rim = new THREE.DirectionalLight(0x6a5cff, 0.7); rim.position.set(-70, 50, -60); scene.add(rim);
-    const fill = new THREE.DirectionalLight(0x39d0ff, 0.35); fill.position.set(20, 30, 120); scene.add(fill);
+    const scene = new THREE.Scene();
+    const corePalette = SECTOR_PALETTE_CLASSES.core;
+    // Thin fog for gentle depth cueing only — the old 0.00085 erased the entire backdrop, leaving a
+    // black void. This keeps the nebula + far stars visible while still fading the deep distance.
+    scene.fog = new THREE.FogExp2(corePalette.fog, corePalette.fogDensity);
+    const ambient = new THREE.AmbientLight(corePalette.ambient, SECTOR_LIGHT_INTENSITIES.ambient); scene.add(ambient);
+    const key = new THREE.DirectionalLight(corePalette.key, SECTOR_LIGHT_INTENSITIES.key); key.position.set(60, 140, 40); scene.add(key);
+    const rim = new THREE.DirectionalLight(corePalette.rim, SECTOR_LIGHT_INTENSITIES.rim); rim.position.set(-70, 50, -60); scene.add(rim);
+    const fill = new THREE.DirectionalLight(corePalette.fill, SECTOR_LIGHT_INTENSITIES.fill); fill.position.set(20, 30, 120); scene.add(fill);
 
     // Real shadow maps (graphics spec Workstream G). Gated behind settings.video.shadows (default
     // true). The key light becomes a shadow caster with a tight frustum that follows the player so
@@ -210,7 +201,7 @@
     }
 
     const cam = createChaseCamera(state);
-    const starfield = createStarfield(scene);
+    const starfield = createStarfield(scene, { tint: corePalette.nebulaTint });
     const vf = createVisualFactory();
     // Hero-asset registry (spec §17.3): wraps the factory's build() so the bespoke player Kestrel is
     // intercepted before the procedural visualFactory. Narrow + failure-isolated — any throw falls
@@ -283,13 +274,16 @@
     // contact-sheet references and are replaced by procedural materials / inline SVG).
     { const i = new Image(); i.src = 'assets/cinematics/menu_background.jpg'; }
 
-    this.renderer = renderer; this.scene = scene; this.cam = cam; this.starfield = starfield; this.vf = vf;
-    this.authoredPartLibraryReady = preloadAuthoredPartLibrary(renderer).catch((error) => {
-      console.warn('[render] authored part library preload failed', error);
-      return null;
-    });
-    state.render.authoredPartLibraryReady = this.authoredPartLibraryReady;
-    this._keyLight = shadowsOn ? key : null; // referenced by _updateShadowFollow() each frame
+    this.renderer = renderer; this.scene = scene; this.cam = cam; this.starfield = starfield; this.vf = vf;
+    this.authoredPartLibraryReady = preloadAuthoredPartLibrary(renderer).catch((error) => {
+      console.warn('[render] authored part library preload failed', error);
+      return null;
+    });
+    state.render.authoredPartLibraryReady = this.authoredPartLibraryReady;
+    this._sectorPaletteRig = createSectorPaletteRig(scene, ambient, key, rim, fill);
+    this._sectorPaletteTarget = corePalette;
+    state.render.sectorPalette = corePalette;
+    this._keyLight = shadowsOn ? key : null; // referenced by _updateShadowFollow() each frame
     this._shadowSettingOn = shadowsOn;
     this._shadowReceiversDirty = true;
     this._shadowReceiverCount = 0;
@@ -410,20 +404,19 @@
     // already spawned by the time this fires (enterSector spawns before its sector:enter resolves),
     // so a blind clearAllMeshes(keepPlayer) used to wipe the station/asteroids and leave the player
     // alone in empty space. reconcileMeshes() removes only meshes for entities that are gone.
-    bus.on('sector:enter', ({ sector } = {}) => {
-      this._meshReconcileDirty = true;
-      if (cam.snapToPlayer) cam.snapToPlayer();
-      this._updatePlanetBodies(sector);
-      // Tint the nebula backdrop to the sector's mood so each region of the galaxy reads with its
-      // own color signature: clean-blue core → rust/amber industrial → blood-red frontier → violet
-      // alien/endgame. Drives the whole-frame atmosphere, reinforcing the core-to-frontier gradient.
-      if (this.starfield && this.starfield.setSectorTint) {
-        this.starfield.setSectorTint(sectorNebulaTint(sector));
-      }
+    bus.on('sector:enter', ({ sector } = {}) => {
+      this._meshReconcileDirty = true;
+      if (cam.snapToPlayer) cam.snapToPlayer();
+      this._updatePlanetBodies(sector);
+      this._beginSectorPaletteTransition(sector);
       this._updateHazardVisuals(sector);
       precompilePipelines(renderer, scene, cam.obj, { sector }).catch((error) => console.warn('[render] sector pipeline precompile failed', error));
     });
-    bus.on('save:loaded', () => { this._meshReconcileDirty = true; });
+    bus.on('jump:arrive', ({ sectorId } = {}) => {
+      const sector = sectorId && state.world && state.world.sectors ? state.world.sectors[sectorId] : null;
+      this._beginSectorPaletteTransition(sector);
+    });
+    bus.on('save:loaded', () => { this._meshReconcileDirty = true; });
 
     window.addEventListener('resize', () => this.onResize());
   },
@@ -640,7 +633,7 @@
     return tex;
   },
 
-  _updateHazardVisuals(sector) {
+  _updateHazardVisuals(sector) {
     // Dispose previous hazard visuals
     for (const obj of this._hazardVisuals) {
       this.scene.remove(obj);
@@ -701,10 +694,42 @@
         this.scene.add(ring);
         this._hazardVisuals.push(ring);
       }
-    }
-  },
-
-  prepareFrame(alpha, frameDt) {
+    }
+  },
+
+  _beginSectorPaletteTransition(sector) {
+    const rig = this._sectorPaletteRig;
+    if (!rig) return;
+    const palette = sector && sector.palette ? sector.palette : SECTOR_PALETTE_CLASSES.core;
+    this.state.render.sectorPalette = palette;
+    if (palette === this._sectorPaletteTarget) return;
+
+    this._sectorPaletteTarget = palette;
+    writeRigToSectorPaletteFrame(rig.start, rig);
+    writePaletteToSectorPaletteFrame(rig.target, palette);
+    rig.elapsed = 0;
+    rig.active = true;
+
+    if (this.starfield && this.starfield.setSectorTint) {
+      this.starfield.setSectorTint(palette.nebulaTint);
+    }
+  },
+
+  _updateSectorPaletteTransition(frameDt) {
+    const rig = this._sectorPaletteRig;
+    if (!rig || !rig.active) return;
+    const dt = Number.isFinite(frameDt) ? Math.max(0, frameDt) : 0;
+    rig.elapsed = Math.min(SECTOR_PALETTE_LERP_SECONDS, rig.elapsed + dt);
+    const rawT = SECTOR_PALETTE_LERP_SECONDS > 0 ? rig.elapsed / SECTOR_PALETTE_LERP_SECONDS : 1;
+    const t = rawT * rawT * (3 - 2 * rawT);
+    lerpSectorPaletteFrame(rig, rig.start, rig.target, t);
+    if (rawT >= 1) {
+      rig.active = false;
+      applySectorPaletteFrame(rig, rig.target);
+    }
+  },
+
+  prepareFrame(alpha, frameDt) {
     // While the GL context is lost, the renderer can't draw — skip all per-frame work until
     // webglcontextrestored rebuilds GPU resources. (cam.follow etc. would run against a dead
     // renderer; the context-restore handler re-applies everything that matters when it returns.)
@@ -716,9 +741,10 @@
     syncAuthoredInstancePools(this.scene, { camera: this.cam.obj });
     this.starfield.recenter(this.cam.obj.position);
     // Background-clock for distant animation (planet cloud drift, hero-star twinkle). Integrates real
-    // frame dt scaled by state.timeScale so the cosmos respects hit-stop/pause — a death freeze
-    // momentarily stills the clouds too, keeping the backdrop in the same time model as the action.
-    const ts = (this.state.timeScale != null) ? this.state.timeScale : 1;
+    // frame dt scaled by state.timeScale so the cosmos respects hit-stop/pause — a death freeze
+    // momentarily stills the clouds too, keeping the backdrop in the same time model as the action.
+    this._updateSectorPaletteTransition(frameDt);
+    const ts = (this.state.timeScale != null) ? this.state.timeScale : 1;
     this._bgTime = (this._bgTime || 0) + frameDt * ts;
     if (this.starfield.update) this.starfield.update(frameDt, this._bgTime);
     this._updatePlanetParallax();
diff --git a/src/render/starfield.js b/src/render/starfield.js
index d76965c563ac0d99166bb382577d2f6eaa4a6d0f..aecb37608592e6ff981ddaf8fd6107d17a0632e6
--- a/src/render/starfield.js
+++ b/src/render/starfield.js
@@ -116,10 +116,18 @@
   return c;
 }
 
-// --- small color helpers for sector tinting (no deps) ---
-function hexToRgb(hex) {
-  const h = hex.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
-}
+// --- small color helpers for sector tinting (no deps) ---
+function normalizeTint(tint) {
+  if (tint == null) return null;
+  if (typeof tint === 'number' && Number.isFinite(tint)) {
+    return '#' + ((tint >>> 0) & 0xffffff).toString(16).padStart(6, '0');
+  }
+  if (typeof tint === 'string') return tint.startsWith('#') ? tint : '#' + tint.replace(/^0x/i, '');
+  return null;
+}
+function hexToRgb(hex) {
+  const h = hex.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
+}
 function rgbToHex(r, g, b) {
   const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
   return '#' + c(r) + c(g) + c(b);
@@ -176,11 +184,11 @@
   ctx.restore();
 }
 
-export function createStarfield(scene, opts = {}) {
-  const layers = [];
-  const sprite = makeStarSprite();
-  let bgTexture = null;
-  let currentTint = opts.tint || null;
+export function createStarfield(scene, opts = {}) {
+  const layers = [];
+  const sprite = makeStarSprite();
+  let bgTexture = null;
+  let currentTint = normalizeTint(opts.tint);
 
   // star tints (mostly cool white/blue with a few warm + teal accents)
   const TINTS = [0xffffff, 0xcfe0ff, 0x9fb6e0, 0xfff0d8, 0x8af0d6, 0xbfd2ff];
@@ -297,13 +305,14 @@
       // GR-7: slow-rotate the distant 3D planets so they read as real spinning worlds, not billboards.
       for (const p of distantPlanets) p.mesh.rotation.y += dt * p.spin;
     },
-    // Swap the nebula mood on sector enter — each region of the galaxy reads with its own color
-    // signature (core = clean blue, industrial = rust/amber, frontier = blood-red, alien = violet).
-    setSectorTint(tint) {
-      if (tint === currentTint) return;
-      currentTint = tint || null;
-      applyBackground(currentTint);
-    },
+    // Swap the nebula mood on sector enter — each region of the galaxy reads with its own color
+    // signature (core = clean blue, industrial = rust/amber, frontier = blood-red, alien = violet).
+    setSectorTint(tint) {
+      const nextTint = normalizeTint(tint);
+      if (nextTint === currentTint) return;
+      currentTint = nextTint;
+      applyBackground(currentTint);
+    },
     setWarp() { /* extended by vfx during jump */ },
   };
 }

diff --git a/src/data/sectors.js b/src/data/sectors.js
index 9c63f69479b241fc848258e3fe2161547793fa46..1814c409089f818b6ab4758b3f0cf8f8531f2452
--- a/src/data/sectors.js
+++ b/src/data/sectors.js
@@ -10,10 +10,30 @@
 export const HAZARD_TYPES  = ['dense_asteroid', 'nebula', 'radiation', 'debris'];
 export const POI_TYPES     = ['beacon', 'derelict', 'cache', 'colony', 'anomaly', 'wormhole', 'wreck'];
 
+export const SECTOR_PALETTE_CLASSES = {
+  core: {
+    key: 0xcfe2ff, rim: 0x6a5cff, fill: 0x39d0ff, ambient: 0x42506f,
+    fog: 0x0a1430, fogDensity: 0.00026, nebulaTint: 0x1e3a6a, dust: 0x7ea7c7,
+  },
+  belt: {
+    key: 0xffd59a, rim: 0xb56d2f, fill: 0xffb13d, ambient: 0x594a42,
+    fog: 0x2a160c, fogDensity: 0.00034, nebulaTint: 0x8a4a1e, dust: 0xc0793d,
+  },
+  fringe: {
+    key: 0xffb07a, rim: 0xff3f2d, fill: 0xffaa66, ambient: 0x584343,
+    fog: 0x2a0d0a, fogDensity: 0.00042, nebulaTint: 0x8a1e1e, dust: 0xc15032,
+  },
+  anomaly: {
+    key: 0xc8b6ff, rim: 0x54ffb0, fill: 0x4ddc92, ambient: 0x494760,
+    fog: 0x160d2c, fogDensity: 0.00036, nebulaTint: 0x5a1e8a, dust: 0x79ffc8,
+  },
+};
+
 export const SECTORS = [
   {
     id: 'sector_helios_prime', name: 'Helios Prime', tier: 0, security: 0.98, charted: true,
     factionId: 'faction_scn', position: { x: 0, y: 0 }, worldRadius: 3500,
+    palette: SECTOR_PALETTE_CLASSES.core,
     // Tutorial home sector: NO hostile spawns (enemyDensity 0). A brand-new pilot must not be
     // hunted before learning the ropes; danger ramps up only in neighbouring sectors.
     trafficPerMin: 18, enemyDensity: 0, enemyLevel: [1, 2],
@@ -37,6 +57,7 @@
   {
     id: 'sector_ceres_belt', name: 'Ceres Belt', tier: 1, security: 0.72, charted: true,
     factionId: 'faction_dmc', position: { x: -3, y: 2 }, worldRadius: 4200,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 10, enemyDensity: 0.18, enemyLevel: [2, 4],
     neighbors: ['sector_helios_prime', 'sector_tethys_junction', 'sector_pallas_drift'],
     stations: [
@@ -57,6 +78,7 @@
   {
     id: 'sector_tethys_junction', name: 'Tethys Junction', tier: 1, security: 0.65, charted: true,
     factionId: 'faction_mts', position: { x: 3, y: 2 }, worldRadius: 4000,
+    palette: SECTOR_PALETTE_CLASSES.core,
     trafficPerMin: 14, enemyDensity: 0.20, enemyLevel: [2, 4],
     neighbors: ['sector_helios_prime', 'sector_ceres_belt', 'sector_vesta_forge', 'sector_io_reach'],
     stations: [
@@ -72,6 +94,7 @@
   {
     id: 'sector_vesta_forge', name: 'Vesta Forge', tier: 1, security: 0.60, charted: true,
     factionId: 'faction_dmc', position: { x: 0, y: 4 }, worldRadius: 4300,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 9, enemyDensity: 0.25, enemyLevel: [3, 5],
     neighbors: ['sector_helios_prime', 'sector_tethys_junction', 'sector_charon_expanse'],
     stations: [
@@ -89,6 +112,7 @@
   {
     id: 'sector_pallas_drift', name: 'Pallas Drift', tier: 2, security: 0.42, charted: true,
     factionId: 'faction_mts', position: { x: -5, y: 5 }, worldRadius: 4500,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 7, enemyDensity: 0.40, enemyLevel: [4, 7],
     neighbors: ['sector_ceres_belt', 'sector_io_reach', 'sector_sker_haven'],
     stations: [
@@ -109,6 +133,7 @@
   {
     id: 'sector_io_reach', name: 'Io Reach', tier: 2, security: 0.35, charted: true,
     factionId: 'faction_free', position: { x: 5, y: 5 }, worldRadius: 4600,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 5, enemyDensity: 0.50, enemyLevel: [5, 8],
     neighbors: ['sector_tethys_junction', 'sector_pallas_drift', 'sector_charon_expanse', 'sector_veil_nebula'],
     stations: [
@@ -132,6 +157,7 @@
   {
     id: 'sector_charon_expanse', name: 'Charon Expanse', tier: 2, security: 0.30, charted: true,
     factionId: 'faction_dmc', position: { x: 2, y: 7 }, worldRadius: 4800,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 4, enemyDensity: 0.50, enemyLevel: [5, 9],
     neighbors: ['sector_vesta_forge', 'sector_io_reach', 'sector_ashfall_reach'],
     stations: [
@@ -151,6 +177,7 @@
   {
     id: 'sector_sker_haven', name: 'Sker Haven', tier: 3, security: 0.08, charted: false,
     factionId: 'faction_reach', position: { x: -7, y: 8 }, worldRadius: 5000,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 0, enemyDensity: 0.70, enemyLevel: [7, 11],
     neighbors: ['sector_pallas_drift', 'sector_veil_nebula'],
     stations: [
@@ -169,6 +196,7 @@
   {
     id: 'sector_veil_nebula', name: 'Veil Nebula', tier: 3, security: 0.12, charted: false,
     factionId: 'faction_free', position: { x: 7, y: 9 }, worldRadius: 5200,
+    palette: SECTOR_PALETTE_CLASSES.anomaly,
     trafficPerMin: 0, enemyDensity: 0.65, enemyLevel: [8, 12],
     neighbors: ['sector_io_reach', 'sector_sker_haven'],
     wormholeTo: { sectorId: 'sector_ashfall_reach', gatedBy: 'tech:tech_long_range_survey' },
@@ -188,6 +216,7 @@
   {
     id: 'sector_ashfall_reach', name: 'Ashfall Reach', tier: 4, security: 0.05, charted: false,
     factionId: 'faction_vael', position: { x: 4, y: 11 }, worldRadius: 5500,
+    palette: SECTOR_PALETTE_CLASSES.anomaly,
     trafficPerMin: 0, enemyDensity: 0.80, enemyLevel: [10, 15],
     neighbors: ['sector_charon_expanse'],
     stations: [
diff --git a/src/render/renderer.js b/src/render/renderer.js
index def6420ff1bff2ac1c64dcc1add395e7851c4dbc..c184e67c4af8d9208a381c0553ed8dc2dbf13d98
--- a/src/render/renderer.js
+++ b/src/render/renderer.js
@@ -15,21 +15,11 @@
 import { installDiagnostics } from './diagnostics.js';
 import { createPlanetFactory } from './planetFactory.js';
 import { precompilePipelines } from './precompile.js';
-
-// Map a sector's danger/tier to a nebula backdrop tint so each region of the galaxy has its own
-// color signature. Core (safe, low tier) = clean blue; industrial mid-ring = rust/amber; lawless
-// frontier = blood-red; alien/endgame tier 4+ = violet. Returns a hex string or null (default).
-function sectorNebulaTint(sector) {
-  if (!sector) return null;
-  const tier = sector.tier || 0;
-  const sec = sector.security != null ? sector.security : 1;
-  const danger = (1 - sec) + tier * 0.15; // blended danger metric
-  if (tier >= 4) return '#5a1e8a';        // violet — alien / lawless endgame (Veil, Ashfall)
-  if (danger > 0.7) return '#8a1e1e';     // blood-red — dangerous frontier (Io Reach, Sker)
-  if (danger > 0.45) return '#8a4a1e';    // rust/amber — industrial mid-ring (Vesta, Pallas)
-  if (danger > 0.2) return '#1e4a8a';     // deep blue — settled belt (Ceres, Tethys)
-  return '#1e3a6a';                        // clean blue — safe core (Helios Prime)
-}
+import { SECTOR_PALETTE_CLASSES } from '../data/sectors.js';
+
+const SECTOR_PALETTE_LERP_SECONDS = 1.5;
+const SECTOR_LIGHT_INTENSITIES = { ambient: 0.85, key: 1.7, rim: 0.7, fill: 0.35 };
+const SECTOR_PALETTE_COLOR_FIELDS = ['ambient', 'key', 'rim', 'fill', 'fog'];
 
 // ---- contact shadow disc (module-level cache so one texture serves all entities) ----------------
 let _shadowTex = null;
@@ -178,14 +168,15 @@
     renderer.setClearColor(0x060912, 1);
     const drawSize = applyRendererSize(renderer, state);
 
-    const scene = new THREE.Scene();
-    // Thin fog for gentle depth cueing only — the old 0.00085 erased the entire backdrop, leaving a
-    // black void. This keeps the nebula + far stars visible while still fading the deep distance.
-    scene.fog = new THREE.FogExp2(0x0a1430, 0.00026);
-    scene.add(new THREE.AmbientLight(0x42506f, 0.85));
-    const key = new THREE.DirectionalLight(0xcfe2ff, 1.7); key.position.set(60, 140, 40); scene.add(key);
-    const rim = new THREE.DirectionalLight(0x6a5cff, 0.7); rim.position.set(-70, 50, -60); scene.add(rim);
-    const fill = new THREE.DirectionalLight(0x39d0ff, 0.35); fill.position.set(20, 30, 120); scene.add(fill);
+    const scene = new THREE.Scene();
+    const corePalette = SECTOR_PALETTE_CLASSES.core;
+    // Thin fog for gentle depth cueing only — the old 0.00085 erased the entire backdrop, leaving a
+    // black void. This keeps the nebula + far stars visible while still fading the deep distance.
+    scene.fog = new THREE.FogExp2(corePalette.fog, corePalette.fogDensity);
+    const ambient = new THREE.AmbientLight(corePalette.ambient, SECTOR_LIGHT_INTENSITIES.ambient); scene.add(ambient);
+    const key = new THREE.DirectionalLight(corePalette.key, SECTOR_LIGHT_INTENSITIES.key); key.position.set(60, 140, 40); scene.add(key);
+    const rim = new THREE.DirectionalLight(corePalette.rim, SECTOR_LIGHT_INTENSITIES.rim); rim.position.set(-70, 50, -60); scene.add(rim);
+    const fill = new THREE.DirectionalLight(corePalette.fill, SECTOR_LIGHT_INTENSITIES.fill); fill.position.set(20, 30, 120); scene.add(fill);
 
     // Real shadow maps (graphics spec Workstream G). Gated behind settings.video.shadows (default
     // true). The key light becomes a shadow caster with a tight frustum that follows the player so
@@ -210,7 +201,7 @@
     }
 
     const cam = createChaseCamera(state);
-    const starfield = createStarfield(scene);
+    const starfield = createStarfield(scene, { tint: corePalette.nebulaTint });
     const vf = createVisualFactory();
     // Hero-asset registry (spec §17.3): wraps the factory's build() so the bespoke player Kestrel is
     // intercepted before the procedural visualFactory. Narrow + failure-isolated — any throw falls
@@ -283,13 +274,16 @@
     // contact-sheet references and are replaced by procedural materials / inline SVG).
     { const i = new Image(); i.src = 'assets/cinematics/menu_background.jpg'; }
 
-    this.renderer = renderer; this.scene = scene; this.cam = cam; this.starfield = starfield; this.vf = vf;
-    this.authoredPartLibraryReady = preloadAuthoredPartLibrary(renderer).catch((error) => {
-      console.warn('[render] authored part library preload failed', error);
-      return null;
-    });
-    state.render.authoredPartLibraryReady = this.authoredPartLibraryReady;
-    this._keyLight = shadowsOn ? key : null; // referenced by _updateShadowFollow() each frame
+    this.renderer = renderer; this.scene = scene; this.cam = cam; this.starfield = starfield; this.vf = vf;
+    this.authoredPartLibraryReady = preloadAuthoredPartLibrary(renderer).catch((error) => {
+      console.warn('[render] authored part library preload failed', error);
+      return null;
+    });
+    state.render.authoredPartLibraryReady = this.authoredPartLibraryReady;
+    this._sectorPaletteRig = createSectorPaletteRig(scene, ambient, key, rim, fill);
+    this._sectorPaletteTarget = corePalette;
+    state.render.sectorPalette = corePalette;
+    this._keyLight = shadowsOn ? key : null; // referenced by _updateShadowFollow() each frame
     this._shadowSettingOn = shadowsOn;
     this._shadowReceiversDirty = true;
     this._shadowReceiverCount = 0;
@@ -410,20 +404,19 @@
     // already spawned by the time this fires (enterSector spawns before its sector:enter resolves),
     // so a blind clearAllMeshes(keepPlayer) used to wipe the station/asteroids and leave the player
     // alone in empty space. reconcileMeshes() removes only meshes for entities that are gone.
-    bus.on('sector:enter', ({ sector } = {}) => {
-      this._meshReconcileDirty = true;
-      if (cam.snapToPlayer) cam.snapToPlayer();
-      this._updatePlanetBodies(sector);
-      // Tint the nebula backdrop to the sector's mood so each region of the galaxy reads with its
-      // own color signature: clean-blue core → rust/amber industrial → blood-red frontier → violet
-      // alien/endgame. Drives the whole-frame atmosphere, reinforcing the core-to-frontier gradient.
-      if (this.starfield && this.starfield.setSectorTint) {
-        this.starfield.setSectorTint(sectorNebulaTint(sector));
-      }
+    bus.on('sector:enter', ({ sector } = {}) => {
+      this._meshReconcileDirty = true;
+      if (cam.snapToPlayer) cam.snapToPlayer();
+      this._updatePlanetBodies(sector);
+      this._beginSectorPaletteTransition(sector);
       this._updateHazardVisuals(sector);
       precompilePipelines(renderer, scene, cam.obj, { sector }).catch((error) => console.warn('[render] sector pipeline precompile failed', error));
     });
-    bus.on('save:loaded', () => { this._meshReconcileDirty = true; });
+    bus.on('jump:arrive', ({ sectorId } = {}) => {
+      const sector = sectorId && state.world && state.world.sectors ? state.world.sectors[sectorId] : null;
+      this._beginSectorPaletteTransition(sector);
+    });
+    bus.on('save:loaded', () => { this._meshReconcileDirty = true; });
 
     window.addEventListener('resize', () => this.onResize());
   },
@@ -640,7 +633,7 @@
     return tex;
   },
 
-  _updateHazardVisuals(sector) {
+  _updateHazardVisuals(sector) {
     // Dispose previous hazard visuals
     for (const obj of this._hazardVisuals) {
       this.scene.remove(obj);
@@ -701,10 +694,42 @@
         this.scene.add(ring);
         this._hazardVisuals.push(ring);
       }
-    }
-  },
-
-  prepareFrame(alpha, frameDt) {
+    }
+  },
+
+  _beginSectorPaletteTransition(sector) {
+    const rig = this._sectorPaletteRig;
+    if (!rig) return;
+    const palette = sector && sector.palette ? sector.palette : SECTOR_PALETTE_CLASSES.core;
+    this.state.render.sectorPalette = palette;
+    if (palette === this._sectorPaletteTarget) return;
+
+    this._sectorPaletteTarget = palette;
+    writeRigToSectorPaletteFrame(rig.start, rig);
+    writePaletteToSectorPaletteFrame(rig.target, palette);
+    rig.elapsed = 0;
+    rig.active = true;
+
+    if (this.starfield && this.starfield.setSectorTint) {
+      this.starfield.setSectorTint(palette.nebulaTint);
+    }
+  },
+
+  _updateSectorPaletteTransition(frameDt) {
+    const rig = this._sectorPaletteRig;
+    if (!rig || !rig.active) return;
+    const dt = Number.isFinite(frameDt) ? Math.max(0, frameDt) : 0;
+    rig.elapsed = Math.min(SECTOR_PALETTE_LERP_SECONDS, rig.elapsed + dt);
+    const rawT = SECTOR_PALETTE_LERP_SECONDS > 0 ? rig.elapsed / SECTOR_PALETTE_LERP_SECONDS : 1;
+    const t = rawT * rawT * (3 - 2 * rawT);
+    lerpSectorPaletteFrame(rig, rig.start, rig.target, t);
+    if (rawT >= 1) {
+      rig.active = false;
+      applySectorPaletteFrame(rig, rig.target);
+    }
+  },
+
+  prepareFrame(alpha, frameDt) {
     // While the GL context is lost, the renderer can't draw — skip all per-frame work until
     // webglcontextrestored rebuilds GPU resources. (cam.follow etc. would run against a dead
     // renderer; the context-restore handler re-applies everything that matters when it returns.)
@@ -716,9 +741,10 @@
     syncAuthoredInstancePools(this.scene, { camera: this.cam.obj });
     this.starfield.recenter(this.cam.obj.position);
     // Background-clock for distant animation (planet cloud drift, hero-star twinkle). Integrates real
-    // frame dt scaled by state.timeScale so the cosmos respects hit-stop/pause — a death freeze
-    // momentarily stills the clouds too, keeping the backdrop in the same time model as the action.
-    const ts = (this.state.timeScale != null) ? this.state.timeScale : 1;
+    // frame dt scaled by state.timeScale so the cosmos respects hit-stop/pause — a death freeze
+    // momentarily stills the clouds too, keeping the backdrop in the same time model as the action.
+    this._updateSectorPaletteTransition(frameDt);
+    const ts = (this.state.timeScale != null) ? this.state.timeScale : 1;
     this._bgTime = (this._bgTime || 0) + frameDt * ts;
     if (this.starfield.update) this.starfield.update(frameDt, this._bgTime);
     this._updatePlanetParallax();
diff --git a/src/render/starfield.js b/src/render/starfield.js
index d76965c563ac0d99166bb382577d2f6eaa4a6d0f..aecb37608592e6ff981ddaf8fd6107d17a0632e6
--- a/src/render/starfield.js
+++ b/src/render/starfield.js
@@ -116,10 +116,18 @@
   return c;
 }
 
-// --- small color helpers for sector tinting (no deps) ---
-function hexToRgb(hex) {
-  const h = hex.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
-}
+// --- small color helpers for sector tinting (no deps) ---
+function normalizeTint(tint) {
+  if (tint == null) return null;
+  if (typeof tint === 'number' && Number.isFinite(tint)) {
+    return '#' + ((tint >>> 0) & 0xffffff).toString(16).padStart(6, '0');
+  }
+  if (typeof tint === 'string') return tint.startsWith('#') ? tint : '#' + tint.replace(/^0x/i, '');
+  return null;
+}
+function hexToRgb(hex) {
+  const h = hex.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
+}
 function rgbToHex(r, g, b) {
   const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
   return '#' + c(r) + c(g) + c(b);
@@ -176,11 +184,11 @@
   ctx.restore();
 }
 
-export function createStarfield(scene, opts = {}) {
-  const layers = [];
-  const sprite = makeStarSprite();
-  let bgTexture = null;
-  let currentTint = opts.tint || null;
+export function createStarfield(scene, opts = {}) {
+  const layers = [];
+  const sprite = makeStarSprite();
+  let bgTexture = null;
+  let currentTint = normalizeTint(opts.tint);
 
   // star tints (mostly cool white/blue with a few warm + teal accents)
   const TINTS = [0xffffff, 0xcfe0ff, 0x9fb6e0, 0xfff0d8, 0x8af0d6, 0xbfd2ff];
@@ -297,13 +305,14 @@
       // GR-7: slow-rotate the distant 3D planets so they read as real spinning worlds, not billboards.
       for (const p of distantPlanets) p.mesh.rotation.y += dt * p.spin;
     },
-    // Swap the nebula mood on sector enter — each region of the galaxy reads with its own color
-    // signature (core = clean blue, industrial = rust/amber, frontier = blood-red, alien = violet).
-    setSectorTint(tint) {
-      if (tint === currentTint) return;
-      currentTint = tint || null;
-      applyBackground(currentTint);
-    },
+    // Swap the nebula mood on sector enter — each region of the galaxy reads with its own color
+    // signature (core = clean blue, industrial = rust/amber, frontier = blood-red, alien = violet).
+    setSectorTint(tint) {
+      const nextTint = normalizeTint(tint);
+      if (nextTint === currentTint) return;
+      currentTint = nextTint;
+      applyBackground(currentTint);
+    },
     setWarp() { /* extended by vfx during jump */ },
   };
 }

codex
The runtime hook is in place. I’m adding the small helper block at the bottom now, then I’ll wire the validation script and run the requested checks.
apply patch
patch: completed
C:\Users\93rob\Documents\GitHub\SpaceFace\src\render\renderer.js
diff --git a/src/data/sectors.js b/src/data/sectors.js
index 9c63f69479b241fc848258e3fe2161547793fa46..1814c409089f818b6ab4758b3f0cf8f8531f2452
--- a/src/data/sectors.js
+++ b/src/data/sectors.js
@@ -10,10 +10,30 @@
 export const HAZARD_TYPES  = ['dense_asteroid', 'nebula', 'radiation', 'debris'];
 export const POI_TYPES     = ['beacon', 'derelict', 'cache', 'colony', 'anomaly', 'wormhole', 'wreck'];
 
+export const SECTOR_PALETTE_CLASSES = {
+  core: {
+    key: 0xcfe2ff, rim: 0x6a5cff, fill: 0x39d0ff, ambient: 0x42506f,
+    fog: 0x0a1430, fogDensity: 0.00026, nebulaTint: 0x1e3a6a, dust: 0x7ea7c7,
+  },
+  belt: {
+    key: 0xffd59a, rim: 0xb56d2f, fill: 0xffb13d, ambient: 0x594a42,
+    fog: 0x2a160c, fogDensity: 0.00034, nebulaTint: 0x8a4a1e, dust: 0xc0793d,
+  },
+  fringe: {
+    key: 0xffb07a, rim: 0xff3f2d, fill: 0xffaa66, ambient: 0x584343,
+    fog: 0x2a0d0a, fogDensity: 0.00042, nebulaTint: 0x8a1e1e, dust: 0xc15032,
+  },
+  anomaly: {
+    key: 0xc8b6ff, rim: 0x54ffb0, fill: 0x4ddc92, ambient: 0x494760,
+    fog: 0x160d2c, fogDensity: 0.00036, nebulaTint: 0x5a1e8a, dust: 0x79ffc8,
+  },
+};
+
 export const SECTORS = [
   {
     id: 'sector_helios_prime', name: 'Helios Prime', tier: 0, security: 0.98, charted: true,
     factionId: 'faction_scn', position: { x: 0, y: 0 }, worldRadius: 3500,
+    palette: SECTOR_PALETTE_CLASSES.core,
     // Tutorial home sector: NO hostile spawns (enemyDensity 0). A brand-new pilot must not be
     // hunted before learning the ropes; danger ramps up only in neighbouring sectors.
     trafficPerMin: 18, enemyDensity: 0, enemyLevel: [1, 2],
@@ -37,6 +57,7 @@
   {
     id: 'sector_ceres_belt', name: 'Ceres Belt', tier: 1, security: 0.72, charted: true,
     factionId: 'faction_dmc', position: { x: -3, y: 2 }, worldRadius: 4200,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 10, enemyDensity: 0.18, enemyLevel: [2, 4],
     neighbors: ['sector_helios_prime', 'sector_tethys_junction', 'sector_pallas_drift'],
     stations: [
@@ -57,6 +78,7 @@
   {
     id: 'sector_tethys_junction', name: 'Tethys Junction', tier: 1, security: 0.65, charted: true,
     factionId: 'faction_mts', position: { x: 3, y: 2 }, worldRadius: 4000,
+    palette: SECTOR_PALETTE_CLASSES.core,
     trafficPerMin: 14, enemyDensity: 0.20, enemyLevel: [2, 4],
     neighbors: ['sector_helios_prime', 'sector_ceres_belt', 'sector_vesta_forge', 'sector_io_reach'],
     stations: [
@@ -72,6 +94,7 @@
   {
     id: 'sector_vesta_forge', name: 'Vesta Forge', tier: 1, security: 0.60, charted: true,
     factionId: 'faction_dmc', position: { x: 0, y: 4 }, worldRadius: 4300,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 9, enemyDensity: 0.25, enemyLevel: [3, 5],
     neighbors: ['sector_helios_prime', 'sector_tethys_junction', 'sector_charon_expanse'],
     stations: [
@@ -89,6 +112,7 @@
   {
     id: 'sector_pallas_drift', name: 'Pallas Drift', tier: 2, security: 0.42, charted: true,
     factionId: 'faction_mts', position: { x: -5, y: 5 }, worldRadius: 4500,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 7, enemyDensity: 0.40, enemyLevel: [4, 7],
     neighbors: ['sector_ceres_belt', 'sector_io_reach', 'sector_sker_haven'],
     stations: [
@@ -109,6 +133,7 @@
   {
     id: 'sector_io_reach', name: 'Io Reach', tier: 2, security: 0.35, charted: true,
     factionId: 'faction_free', position: { x: 5, y: 5 }, worldRadius: 4600,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 5, enemyDensity: 0.50, enemyLevel: [5, 8],
     neighbors: ['sector_tethys_junction', 'sector_pallas_drift', 'sector_charon_expanse', 'sector_veil_nebula'],
     stations: [
@@ -132,6 +157,7 @@
   {
     id: 'sector_charon_expanse', name: 'Charon Expanse', tier: 2, security: 0.30, charted: true,
     factionId: 'faction_dmc', position: { x: 2, y: 7 }, worldRadius: 4800,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 4, enemyDensity: 0.50, enemyLevel: [5, 9],
     neighbors: ['sector_vesta_forge', 'sector_io_reach', 'sector_ashfall_reach'],
     stations: [
@@ -151,6 +177,7 @@
   {
     id: 'sector_sker_haven', name: 'Sker Haven', tier: 3, security: 0.08, charted: false,
     factionId: 'faction_reach', position: { x: -7, y: 8 }, worldRadius: 5000,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 0, enemyDensity: 0.70, enemyLevel: [7, 11],
     neighbors: ['sector_pallas_drift', 'sector_veil_nebula'],
     stations: [
@@ -169,6 +196,7 @@
   {
     id: 'sector_veil_nebula', name: 'Veil Nebula', tier: 3, security: 0.12, charted: false,
     factionId: 'faction_free', position: { x: 7, y: 9 }, worldRadius: 5200,
+    palette: SECTOR_PALETTE_CLASSES.anomaly,
     trafficPerMin: 0, enemyDensity: 0.65, enemyLevel: [8, 12],
     neighbors: ['sector_io_reach', 'sector_sker_haven'],
     wormholeTo: { sectorId: 'sector_ashfall_reach', gatedBy: 'tech:tech_long_range_survey' },
@@ -188,6 +216,7 @@
   {
     id: 'sector_ashfall_reach', name: 'Ashfall Reach', tier: 4, security: 0.05, charted: false,
     factionId: 'faction_vael', position: { x: 4, y: 11 }, worldRadius: 5500,
+    palette: SECTOR_PALETTE_CLASSES.anomaly,
     trafficPerMin: 0, enemyDensity: 0.80, enemyLevel: [10, 15],
     neighbors: ['sector_charon_expanse'],
     stations: [
diff --git a/src/render/renderer.js b/src/render/renderer.js
index def6420ff1bff2ac1c64dcc1add395e7851c4dbc..b8dd6ec63f224fbdab8fc20077f3cbf2d75c3ba2
--- a/src/render/renderer.js
+++ b/src/render/renderer.js
@@ -15,21 +15,11 @@
 import { installDiagnostics } from './diagnostics.js';
 import { createPlanetFactory } from './planetFactory.js';
 import { precompilePipelines } from './precompile.js';
-
-// Map a sector's danger/tier to a nebula backdrop tint so each region of the galaxy has its own
-// color signature. Core (safe, low tier) = clean blue; industrial mid-ring = rust/amber; lawless
-// frontier = blood-red; alien/endgame tier 4+ = violet. Returns a hex string or null (default).
-function sectorNebulaTint(sector) {
-  if (!sector) return null;
-  const tier = sector.tier || 0;
-  const sec = sector.security != null ? sector.security : 1;
-  const danger = (1 - sec) + tier * 0.15; // blended danger metric
-  if (tier >= 4) return '#5a1e8a';        // violet — alien / lawless endgame (Veil, Ashfall)
-  if (danger > 0.7) return '#8a1e1e';     // blood-red — dangerous frontier (Io Reach, Sker)
-  if (danger > 0.45) return '#8a4a1e';    // rust/amber — industrial mid-ring (Vesta, Pallas)
-  if (danger > 0.2) return '#1e4a8a';     // deep blue — settled belt (Ceres, Tethys)
-  return '#1e3a6a';                        // clean blue — safe core (Helios Prime)
-}
+import { SECTOR_PALETTE_CLASSES } from '../data/sectors.js';
+
+const SECTOR_PALETTE_LERP_SECONDS = 1.5;
+const SECTOR_LIGHT_INTENSITIES = { ambient: 0.85, key: 1.7, rim: 0.7, fill: 0.35 };
+const SECTOR_PALETTE_COLOR_FIELDS = ['ambient', 'key', 'rim', 'fill', 'fog'];
 
 // ---- contact shadow disc (module-level cache so one texture serves all entities) ----------------
 let _shadowTex = null;
@@ -178,14 +168,15 @@
     renderer.setClearColor(0x060912, 1);
     const drawSize = applyRendererSize(renderer, state);
 
-    const scene = new THREE.Scene();
-    // Thin fog for gentle depth cueing only — the old 0.00085 erased the entire backdrop, leaving a
-    // black void. This keeps the nebula + far stars visible while still fading the deep distance.
-    scene.fog = new THREE.FogExp2(0x0a1430, 0.00026);
-    scene.add(new THREE.AmbientLight(0x42506f, 0.85));
-    const key = new THREE.DirectionalLight(0xcfe2ff, 1.7); key.position.set(60, 140, 40); scene.add(key);
-    const rim = new THREE.DirectionalLight(0x6a5cff, 0.7); rim.position.set(-70, 50, -60); scene.add(rim);
-    const fill = new THREE.DirectionalLight(0x39d0ff, 0.35); fill.position.set(20, 30, 120); scene.add(fill);
+    const scene = new THREE.Scene();
+    const corePalette = SECTOR_PALETTE_CLASSES.core;
+    // Thin fog for gentle depth cueing only — the old 0.00085 erased the entire backdrop, leaving a
+    // black void. This keeps the nebula + far stars visible while still fading the deep distance.
+    scene.fog = new THREE.FogExp2(corePalette.fog, corePalette.fogDensity);
+    const ambient = new THREE.AmbientLight(corePalette.ambient, SECTOR_LIGHT_INTENSITIES.ambient); scene.add(ambient);
+    const key = new THREE.DirectionalLight(corePalette.key, SECTOR_LIGHT_INTENSITIES.key); key.position.set(60, 140, 40); scene.add(key);
+    const rim = new THREE.DirectionalLight(corePalette.rim, SECTOR_LIGHT_INTENSITIES.rim); rim.position.set(-70, 50, -60); scene.add(rim);
+    const fill = new THREE.DirectionalLight(corePalette.fill, SECTOR_LIGHT_INTENSITIES.fill); fill.position.set(20, 30, 120); scene.add(fill);
 
     // Real shadow maps (graphics spec Workstream G). Gated behind settings.video.shadows (default
     // true). The key light becomes a shadow caster with a tight frustum that follows the player so
@@ -210,7 +201,7 @@
     }
 
     const cam = createChaseCamera(state);
-    const starfield = createStarfield(scene);
+    const starfield = createStarfield(scene, { tint: corePalette.nebulaTint });
     const vf = createVisualFactory();
     // Hero-asset registry (spec §17.3): wraps the factory's build() so the bespoke player Kestrel is
     // intercepted before the procedural visualFactory. Narrow + failure-isolated — any throw falls
@@ -283,13 +274,16 @@
     // contact-sheet references and are replaced by procedural materials / inline SVG).
     { const i = new Image(); i.src = 'assets/cinematics/menu_background.jpg'; }
 
-    this.renderer = renderer; this.scene = scene; this.cam = cam; this.starfield = starfield; this.vf = vf;
-    this.authoredPartLibraryReady = preloadAuthoredPartLibrary(renderer).catch((error) => {
-      console.warn('[render] authored part library preload failed', error);
-      return null;
-    });
-    state.render.authoredPartLibraryReady = this.authoredPartLibraryReady;
-    this._keyLight = shadowsOn ? key : null; // referenced by _updateShadowFollow() each frame
+    this.renderer = renderer; this.scene = scene; this.cam = cam; this.starfield = starfield; this.vf = vf;
+    this.authoredPartLibraryReady = preloadAuthoredPartLibrary(renderer).catch((error) => {
+      console.warn('[render] authored part library preload failed', error);
+      return null;
+    });
+    state.render.authoredPartLibraryReady = this.authoredPartLibraryReady;
+    this._sectorPaletteRig = createSectorPaletteRig(scene, ambient, key, rim, fill);
+    this._sectorPaletteTarget = corePalette;
+    state.render.sectorPalette = corePalette;
+    this._keyLight = shadowsOn ? key : null; // referenced by _updateShadowFollow() each frame
     this._shadowSettingOn = shadowsOn;
     this._shadowReceiversDirty = true;
     this._shadowReceiverCount = 0;
@@ -410,20 +404,19 @@
     // already spawned by the time this fires (enterSector spawns before its sector:enter resolves),
     // so a blind clearAllMeshes(keepPlayer) used to wipe the station/asteroids and leave the player
     // alone in empty space. reconcileMeshes() removes only meshes for entities that are gone.
-    bus.on('sector:enter', ({ sector } = {}) => {
-      this._meshReconcileDirty = true;
-      if (cam.snapToPlayer) cam.snapToPlayer();
-      this._updatePlanetBodies(sector);
-      // Tint the nebula backdrop to the sector's mood so each region of the galaxy reads with its
-      // own color signature: clean-blue core → rust/amber industrial → blood-red frontier → violet
-      // alien/endgame. Drives the whole-frame atmosphere, reinforcing the core-to-frontier gradient.
-      if (this.starfield && this.starfield.setSectorTint) {
-        this.starfield.setSectorTint(sectorNebulaTint(sector));
-      }
+    bus.on('sector:enter', ({ sector } = {}) => {
+      this._meshReconcileDirty = true;
+      if (cam.snapToPlayer) cam.snapToPlayer();
+      this._updatePlanetBodies(sector);
+      this._beginSectorPaletteTransition(sector);
       this._updateHazardVisuals(sector);
       precompilePipelines(renderer, scene, cam.obj, { sector }).catch((error) => console.warn('[render] sector pipeline precompile failed', error));
     });
-    bus.on('save:loaded', () => { this._meshReconcileDirty = true; });
+    bus.on('jump:arrive', ({ sectorId } = {}) => {
+      const sector = sectorId && state.world && state.world.sectors ? state.world.sectors[sectorId] : null;
+      this._beginSectorPaletteTransition(sector);
+    });
+    bus.on('save:loaded', () => { this._meshReconcileDirty = true; });
 
     window.addEventListener('resize', () => this.onResize());
   },
@@ -640,7 +633,7 @@
     return tex;
   },
 
-  _updateHazardVisuals(sector) {
+  _updateHazardVisuals(sector) {
     // Dispose previous hazard visuals
     for (const obj of this._hazardVisuals) {
       this.scene.remove(obj);
@@ -701,10 +694,42 @@
         this.scene.add(ring);
         this._hazardVisuals.push(ring);
       }
-    }
-  },
-
-  prepareFrame(alpha, frameDt) {
+    }
+  },
+
+  _beginSectorPaletteTransition(sector) {
+    const rig = this._sectorPaletteRig;
+    if (!rig) return;
+    const palette = sector && sector.palette ? sector.palette : SECTOR_PALETTE_CLASSES.core;
+    this.state.render.sectorPalette = palette;
+    if (palette === this._sectorPaletteTarget) return;
+
+    this._sectorPaletteTarget = palette;
+    writeRigToSectorPaletteFrame(rig.start, rig);
+    writePaletteToSectorPaletteFrame(rig.target, palette);
+    rig.elapsed = 0;
+    rig.active = true;
+
+    if (this.starfield && this.starfield.setSectorTint) {
+      this.starfield.setSectorTint(palette.nebulaTint);
+    }
+  },
+
+  _updateSectorPaletteTransition(frameDt) {
+    const rig = this._sectorPaletteRig;
+    if (!rig || !rig.active) return;
+    const dt = Number.isFinite(frameDt) ? Math.max(0, frameDt) : 0;
+    rig.elapsed = Math.min(SECTOR_PALETTE_LERP_SECONDS, rig.elapsed + dt);
+    const rawT = SECTOR_PALETTE_LERP_SECONDS > 0 ? rig.elapsed / SECTOR_PALETTE_LERP_SECONDS : 1;
+    const t = rawT * rawT * (3 - 2 * rawT);
+    lerpSectorPaletteFrame(rig, rig.start, rig.target, t);
+    if (rawT >= 1) {
+      rig.active = false;
+      applySectorPaletteFrame(rig, rig.target);
+    }
+  },
+
+  prepareFrame(alpha, frameDt) {
     // While the GL context is lost, the renderer can't draw — skip all per-frame work until
     // webglcontextrestored rebuilds GPU resources. (cam.follow etc. would run against a dead
     // renderer; the context-restore handler re-applies everything that matters when it returns.)
@@ -716,9 +741,10 @@
     syncAuthoredInstancePools(this.scene, { camera: this.cam.obj });
     this.starfield.recenter(this.cam.obj.position);
     // Background-clock for distant animation (planet cloud drift, hero-star twinkle). Integrates real
-    // frame dt scaled by state.timeScale so the cosmos respects hit-stop/pause — a death freeze
-    // momentarily stills the clouds too, keeping the backdrop in the same time model as the action.
-    const ts = (this.state.timeScale != null) ? this.state.timeScale : 1;
+    // frame dt scaled by state.timeScale so the cosmos respects hit-stop/pause — a death freeze
+    // momentarily stills the clouds too, keeping the backdrop in the same time model as the action.
+    this._updateSectorPaletteTransition(frameDt);
+    const ts = (this.state.timeScale != null) ? this.state.timeScale : 1;
     this._bgTime = (this._bgTime || 0) + frameDt * ts;
     if (this.starfield.update) this.starfield.update(frameDt, this._bgTime);
     this._updatePlanetParallax();
@@ -899,13 +925,97 @@
   return renderer.getDrawingBufferSize(_drawSize);
 }
 
-function finiteInRange(value, min, max, fallback) {
-  const n = Number(value);
-  if (!Number.isFinite(n)) return fallback;
-  return Math.max(min, Math.min(max, n));
-}
-
-function disposeObject(obj) {
+function finiteInRange(value, min, max, fallback) {
+  const n = Number(value);
+  if (!Number.isFinite(n)) return fallback;
+  return Math.max(min, Math.min(max, n));
+}
+
+function createSectorPaletteRig(scene, ambientLight, keyLight, rimLight, fillLight) {
+  const rig = {
+    scene,
+    lights: { ambient: ambientLight, key: keyLight, rim: rimLight, fill: fillLight },
+    start: createSectorPaletteFrame(),
+    target: createSectorPaletteFrame(),
+    elapsed: 0,
+    active: false,
+  };
+  writeRigToSectorPaletteFrame(rig.start, rig);
+  writeRigToSectorPaletteFrame(rig.target, rig);
+  return rig;
+}
+
+function createSectorPaletteFrame() {
+  return {
+    colors: {
+      ambient: new THREE.Color(),
+      key: new THREE.Color(),
+      rim: new THREE.Color(),
+      fill: new THREE.Color(),
+      fog: new THREE.Color(),
+    },
+    intensities: { ambient: 0, key: 0, rim: 0, fill: 0 },
+    fogDensity: 0,
+  };
+}
+
+function writeRigToSectorPaletteFrame(frame, rig) {
+  frame.colors.ambient.copy(rig.lights.ambient.color);
+  frame.colors.key.copy(rig.lights.key.color);
+  frame.colors.rim.copy(rig.lights.rim.color);
+  frame.colors.fill.copy(rig.lights.fill.color);
+  frame.colors.fog.copy(rig.scene.fog.color);
+  frame.intensities.ambient = rig.lights.ambient.intensity;
+  frame.intensities.key = rig.lights.key.intensity;
+  frame.intensities.rim = rig.lights.rim.intensity;
+  frame.intensities.fill = rig.lights.fill.intensity;
+  frame.fogDensity = rig.scene.fog.density;
+}
+
+function writePaletteToSectorPaletteFrame(frame, palette) {
+  frame.colors.ambient.setHex(palette.ambient);
+  frame.colors.key.setHex(palette.key);
+  frame.colors.rim.setHex(palette.rim);
+  frame.colors.fill.setHex(palette.fill);
+  frame.colors.fog.setHex(palette.fog);
+  frame.intensities.ambient = SECTOR_LIGHT_INTENSITIES.ambient;
+  frame.intensities.key = SECTOR_LIGHT_INTENSITIES.key;
+  frame.intensities.rim = SECTOR_LIGHT_INTENSITIES.rim;
+  frame.intensities.fill = SECTOR_LIGHT_INTENSITIES.fill;
+  frame.fogDensity = palette.fogDensity;
+}
+
+function applySectorPaletteFrame(rig, frame) {
+  rig.lights.ambient.color.copy(frame.colors.ambient);
+  rig.lights.key.color.copy(frame.colors.key);
+  rig.lights.rim.color.copy(frame.colors.rim);
+  rig.lights.fill.color.copy(frame.colors.fill);
+  rig.scene.fog.color.copy(frame.colors.fog);
+  rig.lights.ambient.intensity = frame.intensities.ambient;
+  rig.lights.key.intensity = frame.intensities.key;
+  rig.lights.rim.intensity = frame.intensities.rim;
+  rig.lights.fill.intensity = frame.intensities.fill;
+  rig.scene.fog.density = frame.fogDensity;
+}
+
+function lerpSectorPaletteFrame(rig, start, target, t) {
+  rig.lights.ambient.color.lerpColors(start.colors.ambient, target.colors.ambient, t);
+  rig.lights.key.color.lerpColors(start.colors.key, target.colors.key, t);
+  rig.lights.rim.color.lerpColors(start.colors.rim, target.colors.rim, t);
+  rig.lights.fill.color.lerpColors(start.colors.fill, target.colors.fill, t);
+  rig.scene.fog.color.lerpColors(start.colors.fog, target.colors.fog, t);
+  rig.lights.ambient.intensity = lerp(start.intensities.ambient, target.intensities.ambient, t);
+  rig.lights.key.intensity = lerp(start.intensities.key, target.intensities.key, t);
+  rig.lights.rim.intensity = lerp(start.intensities.rim, target.intensities.rim, t);
+  rig.lights.fill.intensity = lerp(start.intensities.fill, target.intensities.fill, t);
+  rig.scene.fog.density = lerp(start.fogDensity, target.fogDensity, t);
+}
+
+function lerp(a, b, t) {
+  return a + (b - a) * t;
+}
+
+function disposeObject(obj) {
   obj.traverse((c) => {
     if (c.isBatchedMesh && typeof c.dispose === 'function') c.dispose();
     else if (c.geometry && !(c.userData && (c.userData.sharedContactShadow || c.userData.sharedShieldGeo))) c.geometry.dispose();
diff --git a/src/render/starfield.js b/src/render/starfield.js
index d76965c563ac0d99166bb382577d2f6eaa4a6d0f..aecb37608592e6ff981ddaf8fd6107d17a0632e6
--- a/src/render/starfield.js
+++ b/src/render/starfield.js
@@ -116,10 +116,18 @@
   return c;
 }
 
-// --- small color helpers for sector tinting (no deps) ---
-function hexToRgb(hex) {
-  const h = hex.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
-}
+// --- small color helpers for sector tinting (no deps) ---
+function normalizeTint(tint) {
+  if (tint == null) return null;
+  if (typeof tint === 'number' && Number.isFinite(tint)) {
+    return '#' + ((tint >>> 0) & 0xffffff).toString(16).padStart(6, '0');
+  }
+  if (typeof tint === 'string') return tint.startsWith('#') ? tint : '#' + tint.replace(/^0x/i, '');
+  return null;
+}
+function hexToRgb(hex) {
+  const h = hex.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
+}
 function rgbToHex(r, g, b) {
   const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
   return '#' + c(r) + c(g) + c(b);
@@ -176,11 +184,11 @@
   ctx.restore();
 }
 
-export function createStarfield(scene, opts = {}) {
-  const layers = [];
-  const sprite = makeStarSprite();
-  let bgTexture = null;
-  let currentTint = opts.tint || null;
+export function createStarfield(scene, opts = {}) {
+  const layers = [];
+  const sprite = makeStarSprite();
+  let bgTexture = null;
+  let currentTint = normalizeTint(opts.tint);
 
   // star tints (mostly cool white/blue with a few warm + teal accents)
   const TINTS = [0xffffff, 0xcfe0ff, 0x9fb6e0, 0xfff0d8, 0x8af0d6, 0xbfd2ff];
@@ -297,13 +305,14 @@
       // GR-7: slow-rotate the distant 3D planets so they read as real spinning worlds, not billboards.
       for (const p of distantPlanets) p.mesh.rotation.y += dt * p.spin;
     },
-    // Swap the nebula mood on sector enter — each region of the galaxy reads with its own color
-    // signature (core = clean blue, industrial = rust/amber, frontier = blood-red, alien = violet).
-    setSectorTint(tint) {
-      if (tint === currentTint) return;
-      currentTint = tint || null;
-      applyBackground(currentTint);
-    },
+    // Swap the nebula mood on sector enter — each region of the galaxy reads with its own color
+    // signature (core = clean blue, industrial = rust/amber, frontier = blood-red, alien = violet).
+    setSectorTint(tint) {
+      const nextTint = normalizeTint(tint);
+      if (nextTint === currentTint) return;
+      currentTint = nextTint;
+      applyBackground(currentTint);
+    },
     setWarp() { /* extended by vfx during jump */ },
   };
 }

diff --git a/src/data/sectors.js b/src/data/sectors.js
index 9c63f69479b241fc848258e3fe2161547793fa46..1814c409089f818b6ab4758b3f0cf8f8531f2452
--- a/src/data/sectors.js
+++ b/src/data/sectors.js
@@ -10,10 +10,30 @@
 export const HAZARD_TYPES  = ['dense_asteroid', 'nebula', 'radiation', 'debris'];
 export const POI_TYPES     = ['beacon', 'derelict', 'cache', 'colony', 'anomaly', 'wormhole', 'wreck'];
 
+export const SECTOR_PALETTE_CLASSES = {
+  core: {
+    key: 0xcfe2ff, rim: 0x6a5cff, fill: 0x39d0ff, ambient: 0x42506f,
+    fog: 0x0a1430, fogDensity: 0.00026, nebulaTint: 0x1e3a6a, dust: 0x7ea7c7,
+  },
+  belt: {
+    key: 0xffd59a, rim: 0xb56d2f, fill: 0xffb13d, ambient: 0x594a42,
+    fog: 0x2a160c, fogDensity: 0.00034, nebulaTint: 0x8a4a1e, dust: 0xc0793d,
+  },
+  fringe: {
+    key: 0xffb07a, rim: 0xff3f2d, fill: 0xffaa66, ambient: 0x584343,
+    fog: 0x2a0d0a, fogDensity: 0.00042, nebulaTint: 0x8a1e1e, dust: 0xc15032,
+  },
+  anomaly: {
+    key: 0xc8b6ff, rim: 0x54ffb0, fill: 0x4ddc92, ambient: 0x494760,
+    fog: 0x160d2c, fogDensity: 0.00036, nebulaTint: 0x5a1e8a, dust: 0x79ffc8,
+  },
+};
+
 export const SECTORS = [
   {
     id: 'sector_helios_prime', name: 'Helios Prime', tier: 0, security: 0.98, charted: true,
     factionId: 'faction_scn', position: { x: 0, y: 0 }, worldRadius: 3500,
+    palette: SECTOR_PALETTE_CLASSES.core,
     // Tutorial home sector: NO hostile spawns (enemyDensity 0). A brand-new pilot must not be
     // hunted before learning the ropes; danger ramps up only in neighbouring sectors.
     trafficPerMin: 18, enemyDensity: 0, enemyLevel: [1, 2],
@@ -37,6 +57,7 @@
   {
     id: 'sector_ceres_belt', name: 'Ceres Belt', tier: 1, security: 0.72, charted: true,
     factionId: 'faction_dmc', position: { x: -3, y: 2 }, worldRadius: 4200,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 10, enemyDensity: 0.18, enemyLevel: [2, 4],
     neighbors: ['sector_helios_prime', 'sector_tethys_junction', 'sector_pallas_drift'],
     stations: [
@@ -57,6 +78,7 @@
   {
     id: 'sector_tethys_junction', name: 'Tethys Junction', tier: 1, security: 0.65, charted: true,
     factionId: 'faction_mts', position: { x: 3, y: 2 }, worldRadius: 4000,
+    palette: SECTOR_PALETTE_CLASSES.core,
     trafficPerMin: 14, enemyDensity: 0.20, enemyLevel: [2, 4],
     neighbors: ['sector_helios_prime', 'sector_ceres_belt', 'sector_vesta_forge', 'sector_io_reach'],
     stations: [
@@ -72,6 +94,7 @@
   {
     id: 'sector_vesta_forge', name: 'Vesta Forge', tier: 1, security: 0.60, charted: true,
     factionId: 'faction_dmc', position: { x: 0, y: 4 }, worldRadius: 4300,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 9, enemyDensity: 0.25, enemyLevel: [3, 5],
     neighbors: ['sector_helios_prime', 'sector_tethys_junction', 'sector_charon_expanse'],
     stations: [
@@ -89,6 +112,7 @@
   {
     id: 'sector_pallas_drift', name: 'Pallas Drift', tier: 2, security: 0.42, charted: true,
     factionId: 'faction_mts', position: { x: -5, y: 5 }, worldRadius: 4500,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 7, enemyDensity: 0.40, enemyLevel: [4, 7],
     neighbors: ['sector_ceres_belt', 'sector_io_reach', 'sector_sker_haven'],
     stations: [
@@ -109,6 +133,7 @@
   {
     id: 'sector_io_reach', name: 'Io Reach', tier: 2, security: 0.35, charted: true,
     factionId: 'faction_free', position: { x: 5, y: 5 }, worldRadius: 4600,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 5, enemyDensity: 0.50, enemyLevel: [5, 8],
     neighbors: ['sector_tethys_junction', 'sector_pallas_drift', 'sector_charon_expanse', 'sector_veil_nebula'],
     stations: [
@@ -132,6 +157,7 @@
   {
     id: 'sector_charon_expanse', name: 'Charon Expanse', tier: 2, security: 0.30, charted: true,
     factionId: 'faction_dmc', position: { x: 2, y: 7 }, worldRadius: 4800,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 4, enemyDensity: 0.50, enemyLevel: [5, 9],
     neighbors: ['sector_vesta_forge', 'sector_io_reach', 'sector_ashfall_reach'],
     stations: [
@@ -151,6 +177,7 @@
   {
     id: 'sector_sker_haven', name: 'Sker Haven', tier: 3, security: 0.08, charted: false,
     factionId: 'faction_reach', position: { x: -7, y: 8 }, worldRadius: 5000,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 0, enemyDensity: 0.70, enemyLevel: [7, 11],
     neighbors: ['sector_pallas_drift', 'sector_veil_nebula'],
     stations: [
@@ -169,6 +196,7 @@
   {
     id: 'sector_veil_nebula', name: 'Veil Nebula', tier: 3, security: 0.12, charted: false,
     factionId: 'faction_free', position: { x: 7, y: 9 }, worldRadius: 5200,
+    palette: SECTOR_PALETTE_CLASSES.anomaly,
     trafficPerMin: 0, enemyDensity: 0.65, enemyLevel: [8, 12],
     neighbors: ['sector_io_reach', 'sector_sker_haven'],
     wormholeTo: { sectorId: 'sector_ashfall_reach', gatedBy: 'tech:tech_long_range_survey' },
@@ -188,6 +216,7 @@
   {
     id: 'sector_ashfall_reach', name: 'Ashfall Reach', tier: 4, security: 0.05, charted: false,
     factionId: 'faction_vael', position: { x: 4, y: 11 }, worldRadius: 5500,
+    palette: SECTOR_PALETTE_CLASSES.anomaly,
     trafficPerMin: 0, enemyDensity: 0.80, enemyLevel: [10, 15],
     neighbors: ['sector_charon_expanse'],
     stations: [
diff --git a/src/render/renderer.js b/src/render/renderer.js
index def6420ff1bff2ac1c64dcc1add395e7851c4dbc..b8dd6ec63f224fbdab8fc20077f3cbf2d75c3ba2
--- a/src/render/renderer.js
+++ b/src/render/renderer.js
@@ -15,21 +15,11 @@
 import { installDiagnostics } from './diagnostics.js';
 import { createPlanetFactory } from './planetFactory.js';
 import { precompilePipelines } from './precompile.js';
-
-// Map a sector's danger/tier to a nebula backdrop tint so each region of the galaxy has its own
-// color signature. Core (safe, low tier) = clean blue; industrial mid-ring = rust/amber; lawless
-// frontier = blood-red; alien/endgame tier 4+ = violet. Returns a hex string or null (default).
-function sectorNebulaTint(sector) {
-  if (!sector) return null;
-  const tier = sector.tier || 0;
-  const sec = sector.security != null ? sector.security : 1;
-  const danger = (1 - sec) + tier * 0.15; // blended danger metric
-  if (tier >= 4) return '#5a1e8a';        // violet — alien / lawless endgame (Veil, Ashfall)
-  if (danger > 0.7) return '#8a1e1e';     // blood-red — dangerous frontier (Io Reach, Sker)
-  if (danger > 0.45) return '#8a4a1e';    // rust/amber — industrial mid-ring (Vesta, Pallas)
-  if (danger > 0.2) return '#1e4a8a';     // deep blue — settled belt (Ceres, Tethys)
-  return '#1e3a6a';                        // clean blue — safe core (Helios Prime)
-}
+import { SECTOR_PALETTE_CLASSES } from '../data/sectors.js';
+
+const SECTOR_PALETTE_LERP_SECONDS = 1.5;
+const SECTOR_LIGHT_INTENSITIES = { ambient: 0.85, key: 1.7, rim: 0.7, fill: 0.35 };
+const SECTOR_PALETTE_COLOR_FIELDS = ['ambient', 'key', 'rim', 'fill', 'fog'];
 
 // ---- contact shadow disc (module-level cache so one texture serves all entities) ----------------
 let _shadowTex = null;
@@ -178,14 +168,15 @@
     renderer.setClearColor(0x060912, 1);
     const drawSize = applyRendererSize(renderer, state);
 
-    const scene = new THREE.Scene();
-    // Thin fog for gentle depth cueing only — the old 0.00085 erased the entire backdrop, leaving a
-    // black void. This keeps the nebula + far stars visible while still fading the deep distance.
-    scene.fog = new THREE.FogExp2(0x0a1430, 0.00026);
-    scene.add(new THREE.AmbientLight(0x42506f, 0.85));
-    const key = new THREE.DirectionalLight(0xcfe2ff, 1.7); key.position.set(60, 140, 40); scene.add(key);
-    const rim = new THREE.DirectionalLight(0x6a5cff, 0.7); rim.position.set(-70, 50, -60); scene.add(rim);
-    const fill = new THREE.DirectionalLight(0x39d0ff, 0.35); fill.position.set(20, 30, 120); scene.add(fill);
+    const scene = new THREE.Scene();
+    const corePalette = SECTOR_PALETTE_CLASSES.core;
+    // Thin fog for gentle depth cueing only — the old 0.00085 erased the entire backdrop, leaving a
+    // black void. This keeps the nebula + far stars visible while still fading the deep distance.
+    scene.fog = new THREE.FogExp2(corePalette.fog, corePalette.fogDensity);
+    const ambient = new THREE.AmbientLight(corePalette.ambient, SECTOR_LIGHT_INTENSITIES.ambient); scene.add(ambient);
+    const key = new THREE.DirectionalLight(corePalette.key, SECTOR_LIGHT_INTENSITIES.key); key.position.set(60, 140, 40); scene.add(key);
+    const rim = new THREE.DirectionalLight(corePalette.rim, SECTOR_LIGHT_INTENSITIES.rim); rim.position.set(-70, 50, -60); scene.add(rim);
+    const fill = new THREE.DirectionalLight(corePalette.fill, SECTOR_LIGHT_INTENSITIES.fill); fill.position.set(20, 30, 120); scene.add(fill);
 
     // Real shadow maps (graphics spec Workstream G). Gated behind settings.video.shadows (default
     // true). The key light becomes a shadow caster with a tight frustum that follows the player so
@@ -210,7 +201,7 @@
     }
 
     const cam = createChaseCamera(state);
-    const starfield = createStarfield(scene);
+    const starfield = createStarfield(scene, { tint: corePalette.nebulaTint });
     const vf = createVisualFactory();
     // Hero-asset registry (spec §17.3): wraps the factory's build() so the bespoke player Kestrel is
     // intercepted before the procedural visualFactory. Narrow + failure-isolated — any throw falls
@@ -283,13 +274,16 @@
     // contact-sheet references and are replaced by procedural materials / inline SVG).
     { const i = new Image(); i.src = 'assets/cinematics/menu_background.jpg'; }
 
-    this.renderer = renderer; this.scene = scene; this.cam = cam; this.starfield = starfield; this.vf = vf;
-    this.authoredPartLibraryReady = preloadAuthoredPartLibrary(renderer).catch((error) => {
-      console.warn('[render] authored part library preload failed', error);
-      return null;
-    });
-    state.render.authoredPartLibraryReady = this.authoredPartLibraryReady;
-    this._keyLight = shadowsOn ? key : null; // referenced by _updateShadowFollow() each frame
+    this.renderer = renderer; this.scene = scene; this.cam = cam; this.starfield = starfield; this.vf = vf;
+    this.authoredPartLibraryReady = preloadAuthoredPartLibrary(renderer).catch((error) => {
+      console.warn('[render] authored part library preload failed', error);
+      return null;
+    });
+    state.render.authoredPartLibraryReady = this.authoredPartLibraryReady;
+    this._sectorPaletteRig = createSectorPaletteRig(scene, ambient, key, rim, fill);
+    this._sectorPaletteTarget = corePalette;
+    state.render.sectorPalette = corePalette;
+    this._keyLight = shadowsOn ? key : null; // referenced by _updateShadowFollow() each frame
     this._shadowSettingOn = shadowsOn;
     this._shadowReceiversDirty = true;
     this._shadowReceiverCount = 0;
@@ -410,20 +404,19 @@
     // already spawned by the time this fires (enterSector spawns before its sector:enter resolves),
     // so a blind clearAllMeshes(keepPlayer) used to wipe the station/asteroids and leave the player
     // alone in empty space. reconcileMeshes() removes only meshes for entities that are gone.
-    bus.on('sector:enter', ({ sector } = {}) => {
-      this._meshReconcileDirty = true;
-      if (cam.snapToPlayer) cam.snapToPlayer();
-      this._updatePlanetBodies(sector);
-      // Tint the nebula backdrop to the sector's mood so each region of the galaxy reads with its
-      // own color signature: clean-blue core → rust/amber industrial → blood-red frontier → violet
-      // alien/endgame. Drives the whole-frame atmosphere, reinforcing the core-to-frontier gradient.
-      if (this.starfield && this.starfield.setSectorTint) {
-        this.starfield.setSectorTint(sectorNebulaTint(sector));
-      }
+    bus.on('sector:enter', ({ sector } = {}) => {
+      this._meshReconcileDirty = true;
+      if (cam.snapToPlayer) cam.snapToPlayer();
+      this._updatePlanetBodies(sector);
+      this._beginSectorPaletteTransition(sector);
       this._updateHazardVisuals(sector);
       precompilePipelines(renderer, scene, cam.obj, { sector }).catch((error) => console.warn('[render] sector pipeline precompile failed', error));
     });
-    bus.on('save:loaded', () => { this._meshReconcileDirty = true; });
+    bus.on('jump:arrive', ({ sectorId } = {}) => {
+      const sector = sectorId && state.world && state.world.sectors ? state.world.sectors[sectorId] : null;
+      this._beginSectorPaletteTransition(sector);
+    });
+    bus.on('save:loaded', () => { this._meshReconcileDirty = true; });
 
     window.addEventListener('resize', () => this.onResize());
   },
@@ -640,7 +633,7 @@
     return tex;
   },
 
-  _updateHazardVisuals(sector) {
+  _updateHazardVisuals(sector) {
     // Dispose previous hazard visuals
     for (const obj of this._hazardVisuals) {
       this.scene.remove(obj);
@@ -701,10 +694,42 @@
         this.scene.add(ring);
         this._hazardVisuals.push(ring);
       }
-    }
-  },
-
-  prepareFrame(alpha, frameDt) {
+    }
+  },
+
+  _beginSectorPaletteTransition(sector) {
+    const rig = this._sectorPaletteRig;
+    if (!rig) return;
+    const palette = sector && sector.palette ? sector.palette : SECTOR_PALETTE_CLASSES.core;
+    this.state.render.sectorPalette = palette;
+    if (palette === this._sectorPaletteTarget) return;
+
+    this._sectorPaletteTarget = palette;
+    writeRigToSectorPaletteFrame(rig.start, rig);
+    writePaletteToSectorPaletteFrame(rig.target, palette);
+    rig.elapsed = 0;
+    rig.active = true;
+
+    if (this.starfield && this.starfield.setSectorTint) {
+      this.starfield.setSectorTint(palette.nebulaTint);
+    }
+  },
+
+  _updateSectorPaletteTransition(frameDt) {
+    const rig = this._sectorPaletteRig;
+    if (!rig || !rig.active) return;
+    const dt = Number.isFinite(frameDt) ? Math.max(0, frameDt) : 0;
+    rig.elapsed = Math.min(SECTOR_PALETTE_LERP_SECONDS, rig.elapsed + dt);
+    const rawT = SECTOR_PALETTE_LERP_SECONDS > 0 ? rig.elapsed / SECTOR_PALETTE_LERP_SECONDS : 1;
+    const t = rawT * rawT * (3 - 2 * rawT);
+    lerpSectorPaletteFrame(rig, rig.start, rig.target, t);
+    if (rawT >= 1) {
+      rig.active = false;
+      applySectorPaletteFrame(rig, rig.target);
+    }
+  },
+
+  prepareFrame(alpha, frameDt) {
     // While the GL context is lost, the renderer can't draw — skip all per-frame work until
     // webglcontextrestored rebuilds GPU resources. (cam.follow etc. would run against a dead
     // renderer; the context-restore handler re-applies everything that matters when it returns.)
@@ -716,9 +741,10 @@
     syncAuthoredInstancePools(this.scene, { camera: this.cam.obj });
     this.starfield.recenter(this.cam.obj.position);
     // Background-clock for distant animation (planet cloud drift, hero-star twinkle). Integrates real
-    // frame dt scaled by state.timeScale so the cosmos respects hit-stop/pause — a death freeze
-    // momentarily stills the clouds too, keeping the backdrop in the same time model as the action.
-    const ts = (this.state.timeScale != null) ? this.state.timeScale : 1;
+    // frame dt scaled by state.timeScale so the cosmos respects hit-stop/pause — a death freeze
+    // momentarily stills the clouds too, keeping the backdrop in the same time model as the action.
+    this._updateSectorPaletteTransition(frameDt);
+    const ts = (this.state.timeScale != null) ? this.state.timeScale : 1;
     this._bgTime = (this._bgTime || 0) + frameDt * ts;
     if (this.starfield.update) this.starfield.update(frameDt, this._bgTime);
     this._updatePlanetParallax();
@@ -899,13 +925,97 @@
   return renderer.getDrawingBufferSize(_drawSize);
 }
 
-function finiteInRange(value, min, max, fallback) {
-  const n = Number(value);
-  if (!Number.isFinite(n)) return fallback;
-  return Math.max(min, Math.min(max, n));
-}
-
-function disposeObject(obj) {
+function finiteInRange(value, min, max, fallback) {
+  const n = Number(value);
+  if (!Number.isFinite(n)) return fallback;
+  return Math.max(min, Math.min(max, n));
+}
+
+function createSectorPaletteRig(scene, ambientLight, keyLight, rimLight, fillLight) {
+  const rig = {
+    scene,
+    lights: { ambient: ambientLight, key: keyLight, rim: rimLight, fill: fillLight },
+    start: createSectorPaletteFrame(),
+    target: createSectorPaletteFrame(),
+    elapsed: 0,
+    active: false,
+  };
+  writeRigToSectorPaletteFrame(rig.start, rig);
+  writeRigToSectorPaletteFrame(rig.target, rig);
+  return rig;
+}
+
+function createSectorPaletteFrame() {
+  return {
+    colors: {
+      ambient: new THREE.Color(),
+      key: new THREE.Color(),
+      rim: new THREE.Color(),
+      fill: new THREE.Color(),
+      fog: new THREE.Color(),
+    },
+    intensities: { ambient: 0, key: 0, rim: 0, fill: 0 },
+    fogDensity: 0,
+  };
+}
+
+function writeRigToSectorPaletteFrame(frame, rig) {
+  frame.colors.ambient.copy(rig.lights.ambient.color);
+  frame.colors.key.copy(rig.lights.key.color);
+  frame.colors.rim.copy(rig.lights.rim.color);
+  frame.colors.fill.copy(rig.lights.fill.color);
+  frame.colors.fog.copy(rig.scene.fog.color);
+  frame.intensities.ambient = rig.lights.ambient.intensity;
+  frame.intensities.key = rig.lights.key.intensity;
+  frame.intensities.rim = rig.lights.rim.intensity;
+  frame.intensities.fill = rig.lights.fill.intensity;
+  frame.fogDensity = rig.scene.fog.density;
+}
+
+function writePaletteToSectorPaletteFrame(frame, palette) {
+  frame.colors.ambient.setHex(palette.ambient);
+  frame.colors.key.setHex(palette.key);
+  frame.colors.rim.setHex(palette.rim);
+  frame.colors.fill.setHex(palette.fill);
+  frame.colors.fog.setHex(palette.fog);
+  frame.intensities.ambient = SECTOR_LIGHT_INTENSITIES.ambient;
+  frame.intensities.key = SECTOR_LIGHT_INTENSITIES.key;
+  frame.intensities.rim = SECTOR_LIGHT_INTENSITIES.rim;
+  frame.intensities.fill = SECTOR_LIGHT_INTENSITIES.fill;
+  frame.fogDensity = palette.fogDensity;
+}
+
+function applySectorPaletteFrame(rig, frame) {
+  rig.lights.ambient.color.copy(frame.colors.ambient);
+  rig.lights.key.color.copy(frame.colors.key);
+  rig.lights.rim.color.copy(frame.colors.rim);
+  rig.lights.fill.color.copy(frame.colors.fill);
+  rig.scene.fog.color.copy(frame.colors.fog);
+  rig.lights.ambient.intensity = frame.intensities.ambient;
+  rig.lights.key.intensity = frame.intensities.key;
+  rig.lights.rim.intensity = frame.intensities.rim;
+  rig.lights.fill.intensity = frame.intensities.fill;
+  rig.scene.fog.density = frame.fogDensity;
+}
+
+function lerpSectorPaletteFrame(rig, start, target, t) {
+  rig.lights.ambient.color.lerpColors(start.colors.ambient, target.colors.ambient, t);
+  rig.lights.key.color.lerpColors(start.colors.key, target.colors.key, t);
+  rig.lights.rim.color.lerpColors(start.colors.rim, target.colors.rim, t);
+  rig.lights.fill.color.lerpColors(start.colors.fill, target.colors.fill, t);
+  rig.scene.fog.color.lerpColors(start.colors.fog, target.colors.fog, t);
+  rig.lights.ambient.intensity = lerp(start.intensities.ambient, target.intensities.ambient, t);
+  rig.lights.key.intensity = lerp(start.intensities.key, target.intensities.key, t);
+  rig.lights.rim.intensity = lerp(start.intensities.rim, target.intensities.rim, t);
+  rig.lights.fill.intensity = lerp(start.intensities.fill, target.intensities.fill, t);
+  rig.scene.fog.density = lerp(start.fogDensity, target.fogDensity, t);
+}
+
+function lerp(a, b, t) {
+  return a + (b - a) * t;
+}
+
+function disposeObject(obj) {
   obj.traverse((c) => {
     if (c.isBatchedMesh && typeof c.dispose === 'function') c.dispose();
     else if (c.geometry && !(c.userData && (c.userData.sharedContactShadow || c.userData.sharedShieldGeo))) c.geometry.dispose();
diff --git a/src/render/starfield.js b/src/render/starfield.js
index d76965c563ac0d99166bb382577d2f6eaa4a6d0f..aecb37608592e6ff981ddaf8fd6107d17a0632e6
--- a/src/render/starfield.js
+++ b/src/render/starfield.js
@@ -116,10 +116,18 @@
   return c;
 }
 
-// --- small color helpers for sector tinting (no deps) ---
-function hexToRgb(hex) {
-  const h = hex.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
-}
+// --- small color helpers for sector tinting (no deps) ---
+function normalizeTint(tint) {
+  if (tint == null) return null;
+  if (typeof tint === 'number' && Number.isFinite(tint)) {
+    return '#' + ((tint >>> 0) & 0xffffff).toString(16).padStart(6, '0');
+  }
+  if (typeof tint === 'string') return tint.startsWith('#') ? tint : '#' + tint.replace(/^0x/i, '');
+  return null;
+}
+function hexToRgb(hex) {
+  const h = hex.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
+}
 function rgbToHex(r, g, b) {
   const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
   return '#' + c(r) + c(g) + c(b);
@@ -176,11 +184,11 @@
   ctx.restore();
 }
 
-export function createStarfield(scene, opts = {}) {
-  const layers = [];
-  const sprite = makeStarSprite();
-  let bgTexture = null;
-  let currentTint = opts.tint || null;
+export function createStarfield(scene, opts = {}) {
+  const layers = [];
+  const sprite = makeStarSprite();
+  let bgTexture = null;
+  let currentTint = normalizeTint(opts.tint);
 
   // star tints (mostly cool white/blue with a few warm + teal accents)
   const TINTS = [0xffffff, 0xcfe0ff, 0x9fb6e0, 0xfff0d8, 0x8af0d6, 0xbfd2ff];
@@ -297,13 +305,14 @@
       // GR-7: slow-rotate the distant 3D planets so they read as real spinning worlds, not billboards.
       for (const p of distantPlanets) p.mesh.rotation.y += dt * p.spin;
     },
-    // Swap the nebula mood on sector enter — each region of the galaxy reads with its own color
-    // signature (core = clean blue, industrial = rust/amber, frontier = blood-red, alien = violet).
-    setSectorTint(tint) {
-      if (tint === currentTint) return;
-      currentTint = tint || null;
-      applyBackground(currentTint);
-    },
+    // Swap the nebula mood on sector enter — each region of the galaxy reads with its own color
+    // signature (core = clean blue, industrial = rust/amber, frontier = blood-red, alien = violet).
+    setSectorTint(tint) {
+      const nextTint = normalizeTint(tint);
+      if (nextTint === currentTint) return;
+      currentTint = nextTint;
+      applyBackground(currentTint);
+    },
     setWarp() { /* extended by vfx during jump */ },
   };
 }

codex
Renderer helper block is written. Next is the checker: it will import the sector data directly, confirm every palette has the required numeric fields, map each sector back to one of the four authored classes, and enforce the ambient+fill luminance window.
apply patch
patch: completed
C:\Users\93rob\Documents\GitHub\SpaceFace\scripts\check-sector-palettes.mjs
diff --git a/scripts/check-sector-palettes.mjs b/scripts/check-sector-palettes.mjs
new file mode 100644
index 0000000000000000000000000000000000000000..04318569a6d4a787b3cf451b3de0e457574fa6f1
--- /dev/null
+++ b/scripts/check-sector-palettes.mjs
@@ -0,0 +1,81 @@
+import { SECTORS, SECTOR_PALETTE_CLASSES } from '../src/data/sectors.js';
+
+const REQUIRED_FIELDS = ['key', 'rim', 'fill', 'ambient', 'fog', 'fogDensity', 'nebulaTint', 'dust'];
+const COLOR_FIELDS = ['key', 'rim', 'fill', 'ambient', 'fog', 'nebulaTint', 'dust'];
+const CLASS_ENTRIES = Object.entries(SECTOR_PALETTE_CLASSES);
+const CORE_LUMINANCE = combinedLightLuminance(SECTOR_PALETTE_CLASSES.core);
+const MIN_LUMINANCE = CORE_LUMINANCE * 0.8;
+const MAX_LUMINANCE = CORE_LUMINANCE * 1.2;
+
+const issues = [];
+const usedClasses = new Set();
+
+for (const sector of SECTORS) {
+  const palette = sector.palette;
+  if (!palette || typeof palette !== 'object') {
+    issues.push(`${sector.id}: missing palette block`);
+    continue;
+  }
+
+  for (const field of REQUIRED_FIELDS) {
+    if (!(field in palette)) issues.push(`${sector.id}: palette missing ${field}`);
+  }
+  for (const field of COLOR_FIELDS) {
+    if (!isColorHex(palette[field])) issues.push(`${sector.id}: palette.${field} must be a 0x000000-0xffffff number`);
+  }
+  if (!Number.isFinite(palette.fogDensity) || palette.fogDensity <= 0) {
+    issues.push(`${sector.id}: palette.fogDensity must be a positive finite number`);
+  }
+
+  const className = classNameForPalette(palette);
+  if (!className) issues.push(`${sector.id}: palette does not match an authored class`);
+  else usedClasses.add(className);
+
+  const luminance = combinedLightLuminance(palette);
+  if (luminance < MIN_LUMINANCE || luminance > MAX_LUMINANCE) {
+    issues.push(`${sector.id}: ambient+fill luminance ${luminance.toFixed(4)} outside ${MIN_LUMINANCE.toFixed(4)}-${MAX_LUMINANCE.toFixed(4)}`);
+  }
+}
+
+for (const [className] of CLASS_ENTRIES) {
+  if (!usedClasses.has(className)) issues.push(`palette class unused: ${className}`);
+}
+
+if (issues.length) {
+  console.error(`Sector palette check failed (${issues.length} issue${issues.length === 1 ? '' : 's'}):`);
+  for (const issue of issues) console.error(`- ${issue}`);
+  process.exit(1);
+}
+
+console.log(`Sector palettes OK: ${SECTORS.length} sectors, classes used: ${[...usedClasses].sort().join(', ')}`);
+
+function classNameForPalette(palette) {
+  for (const [className, classPalette] of CLASS_ENTRIES) {
+    if (samePalette(palette, classPalette)) return className;
+  }
+  return null;
+}
+
+function samePalette(a, b) {
+  return REQUIRED_FIELDS.every((field) => a[field] === b[field]);
+}
+
+function isColorHex(value) {
+  return Number.isInteger(value) && value >= 0x000000 && value <= 0xffffff;
+}
+
+function combinedLightLuminance(palette) {
+  return relativeLuminance(palette.ambient) + relativeLuminance(palette.fill);
+}
+
+function relativeLuminance(hex) {
+  const r = linearRgb((hex >> 16) & 0xff);
+  const g = linearRgb((hex >> 8) & 0xff);
+  const b = linearRgb(hex & 0xff);
+  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
+}
+
+function linearRgb(channel) {
+  const c = channel / 255;
+  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
+}
diff --git a/src/data/sectors.js b/src/data/sectors.js
index 9c63f69479b241fc848258e3fe2161547793fa46..1814c409089f818b6ab4758b3f0cf8f8531f2452
--- a/src/data/sectors.js
+++ b/src/data/sectors.js
@@ -10,10 +10,30 @@
 export const HAZARD_TYPES  = ['dense_asteroid', 'nebula', 'radiation', 'debris'];
 export const POI_TYPES     = ['beacon', 'derelict', 'cache', 'colony', 'anomaly', 'wormhole', 'wreck'];
 
+export const SECTOR_PALETTE_CLASSES = {
+  core: {
+    key: 0xcfe2ff, rim: 0x6a5cff, fill: 0x39d0ff, ambient: 0x42506f,
+    fog: 0x0a1430, fogDensity: 0.00026, nebulaTint: 0x1e3a6a, dust: 0x7ea7c7,
+  },
+  belt: {
+    key: 0xffd59a, rim: 0xb56d2f, fill: 0xffb13d, ambient: 0x594a42,
+    fog: 0x2a160c, fogDensity: 0.00034, nebulaTint: 0x8a4a1e, dust: 0xc0793d,
+  },
+  fringe: {
+    key: 0xffb07a, rim: 0xff3f2d, fill: 0xffaa66, ambient: 0x584343,
+    fog: 0x2a0d0a, fogDensity: 0.00042, nebulaTint: 0x8a1e1e, dust: 0xc15032,
+  },
+  anomaly: {
+    key: 0xc8b6ff, rim: 0x54ffb0, fill: 0x4ddc92, ambient: 0x494760,
+    fog: 0x160d2c, fogDensity: 0.00036, nebulaTint: 0x5a1e8a, dust: 0x79ffc8,
+  },
+};
+
 export const SECTORS = [
   {
     id: 'sector_helios_prime', name: 'Helios Prime', tier: 0, security: 0.98, charted: true,
     factionId: 'faction_scn', position: { x: 0, y: 0 }, worldRadius: 3500,
+    palette: SECTOR_PALETTE_CLASSES.core,
     // Tutorial home sector: NO hostile spawns (enemyDensity 0). A brand-new pilot must not be
     // hunted before learning the ropes; danger ramps up only in neighbouring sectors.
     trafficPerMin: 18, enemyDensity: 0, enemyLevel: [1, 2],
@@ -37,6 +57,7 @@
   {
     id: 'sector_ceres_belt', name: 'Ceres Belt', tier: 1, security: 0.72, charted: true,
     factionId: 'faction_dmc', position: { x: -3, y: 2 }, worldRadius: 4200,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 10, enemyDensity: 0.18, enemyLevel: [2, 4],
     neighbors: ['sector_helios_prime', 'sector_tethys_junction', 'sector_pallas_drift'],
     stations: [
@@ -57,6 +78,7 @@
   {
     id: 'sector_tethys_junction', name: 'Tethys Junction', tier: 1, security: 0.65, charted: true,
     factionId: 'faction_mts', position: { x: 3, y: 2 }, worldRadius: 4000,
+    palette: SECTOR_PALETTE_CLASSES.core,
     trafficPerMin: 14, enemyDensity: 0.20, enemyLevel: [2, 4],
     neighbors: ['sector_helios_prime', 'sector_ceres_belt', 'sector_vesta_forge', 'sector_io_reach'],
     stations: [
@@ -72,6 +94,7 @@
   {
     id: 'sector_vesta_forge', name: 'Vesta Forge', tier: 1, security: 0.60, charted: true,
     factionId: 'faction_dmc', position: { x: 0, y: 4 }, worldRadius: 4300,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 9, enemyDensity: 0.25, enemyLevel: [3, 5],
     neighbors: ['sector_helios_prime', 'sector_tethys_junction', 'sector_charon_expanse'],
     stations: [
@@ -89,6 +112,7 @@
   {
     id: 'sector_pallas_drift', name: 'Pallas Drift', tier: 2, security: 0.42, charted: true,
     factionId: 'faction_mts', position: { x: -5, y: 5 }, worldRadius: 4500,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 7, enemyDensity: 0.40, enemyLevel: [4, 7],
     neighbors: ['sector_ceres_belt', 'sector_io_reach', 'sector_sker_haven'],
     stations: [
@@ -109,6 +133,7 @@
   {
     id: 'sector_io_reach', name: 'Io Reach', tier: 2, security: 0.35, charted: true,
     factionId: 'faction_free', position: { x: 5, y: 5 }, worldRadius: 4600,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 5, enemyDensity: 0.50, enemyLevel: [5, 8],
     neighbors: ['sector_tethys_junction', 'sector_pallas_drift', 'sector_charon_expanse', 'sector_veil_nebula'],
     stations: [
@@ -132,6 +157,7 @@
   {
     id: 'sector_charon_expanse', name: 'Charon Expanse', tier: 2, security: 0.30, charted: true,
     factionId: 'faction_dmc', position: { x: 2, y: 7 }, worldRadius: 4800,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 4, enemyDensity: 0.50, enemyLevel: [5, 9],
     neighbors: ['sector_vesta_forge', 'sector_io_reach', 'sector_ashfall_reach'],
     stations: [
@@ -151,6 +177,7 @@
   {
     id: 'sector_sker_haven', name: 'Sker Haven', tier: 3, security: 0.08, charted: false,
     factionId: 'faction_reach', position: { x: -7, y: 8 }, worldRadius: 5000,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 0, enemyDensity: 0.70, enemyLevel: [7, 11],
     neighbors: ['sector_pallas_drift', 'sector_veil_nebula'],
     stations: [
@@ -169,6 +196,7 @@
   {
     id: 'sector_veil_nebula', name: 'Veil Nebula', tier: 3, security: 0.12, charted: false,
     factionId: 'faction_free', position: { x: 7, y: 9 }, worldRadius: 5200,
+    palette: SECTOR_PALETTE_CLASSES.anomaly,
     trafficPerMin: 0, enemyDensity: 0.65, enemyLevel: [8, 12],
     neighbors: ['sector_io_reach', 'sector_sker_haven'],
     wormholeTo: { sectorId: 'sector_ashfall_reach', gatedBy: 'tech:tech_long_range_survey' },
@@ -188,6 +216,7 @@
   {
     id: 'sector_ashfall_reach', name: 'Ashfall Reach', tier: 4, security: 0.05, charted: false,
     factionId: 'faction_vael', position: { x: 4, y: 11 }, worldRadius: 5500,
+    palette: SECTOR_PALETTE_CLASSES.anomaly,
     trafficPerMin: 0, enemyDensity: 0.80, enemyLevel: [10, 15],
     neighbors: ['sector_charon_expanse'],
     stations: [
diff --git a/src/render/renderer.js b/src/render/renderer.js
index def6420ff1bff2ac1c64dcc1add395e7851c4dbc..b8dd6ec63f224fbdab8fc20077f3cbf2d75c3ba2
--- a/src/render/renderer.js
+++ b/src/render/renderer.js
@@ -15,21 +15,11 @@
 import { installDiagnostics } from './diagnostics.js';
 import { createPlanetFactory } from './planetFactory.js';
 import { precompilePipelines } from './precompile.js';
-
-// Map a sector's danger/tier to a nebula backdrop tint so each region of the galaxy has its own
-// color signature. Core (safe, low tier) = clean blue; industrial mid-ring = rust/amber; lawless
-// frontier = blood-red; alien/endgame tier 4+ = violet. Returns a hex string or null (default).
-function sectorNebulaTint(sector) {
-  if (!sector) return null;
-  const tier = sector.tier || 0;
-  const sec = sector.security != null ? sector.security : 1;
-  const danger = (1 - sec) + tier * 0.15; // blended danger metric
-  if (tier >= 4) return '#5a1e8a';        // violet — alien / lawless endgame (Veil, Ashfall)
-  if (danger > 0.7) return '#8a1e1e';     // blood-red — dangerous frontier (Io Reach, Sker)
-  if (danger > 0.45) return '#8a4a1e';    // rust/amber — industrial mid-ring (Vesta, Pallas)
-  if (danger > 0.2) return '#1e4a8a';     // deep blue — settled belt (Ceres, Tethys)
-  return '#1e3a6a';                        // clean blue — safe core (Helios Prime)
-}
+import { SECTOR_PALETTE_CLASSES } from '../data/sectors.js';
+
+const SECTOR_PALETTE_LERP_SECONDS = 1.5;
+const SECTOR_LIGHT_INTENSITIES = { ambient: 0.85, key: 1.7, rim: 0.7, fill: 0.35 };
+const SECTOR_PALETTE_COLOR_FIELDS = ['ambient', 'key', 'rim', 'fill', 'fog'];
 
 // ---- contact shadow disc (module-level cache so one texture serves all entities) ----------------
 let _shadowTex = null;
@@ -178,14 +168,15 @@
     renderer.setClearColor(0x060912, 1);
     const drawSize = applyRendererSize(renderer, state);
 
-    const scene = new THREE.Scene();
-    // Thin fog for gentle depth cueing only — the old 0.00085 erased the entire backdrop, leaving a
-    // black void. This keeps the nebula + far stars visible while still fading the deep distance.
-    scene.fog = new THREE.FogExp2(0x0a1430, 0.00026);
-    scene.add(new THREE.AmbientLight(0x42506f, 0.85));
-    const key = new THREE.DirectionalLight(0xcfe2ff, 1.7); key.position.set(60, 140, 40); scene.add(key);
-    const rim = new THREE.DirectionalLight(0x6a5cff, 0.7); rim.position.set(-70, 50, -60); scene.add(rim);
-    const fill = new THREE.DirectionalLight(0x39d0ff, 0.35); fill.position.set(20, 30, 120); scene.add(fill);
+    const scene = new THREE.Scene();
+    const corePalette = SECTOR_PALETTE_CLASSES.core;
+    // Thin fog for gentle depth cueing only — the old 0.00085 erased the entire backdrop, leaving a
+    // black void. This keeps the nebula + far stars visible while still fading the deep distance.
+    scene.fog = new THREE.FogExp2(corePalette.fog, corePalette.fogDensity);
+    const ambient = new THREE.AmbientLight(corePalette.ambient, SECTOR_LIGHT_INTENSITIES.ambient); scene.add(ambient);
+    const key = new THREE.DirectionalLight(corePalette.key, SECTOR_LIGHT_INTENSITIES.key); key.position.set(60, 140, 40); scene.add(key);
+    const rim = new THREE.DirectionalLight(corePalette.rim, SECTOR_LIGHT_INTENSITIES.rim); rim.position.set(-70, 50, -60); scene.add(rim);
+    const fill = new THREE.DirectionalLight(corePalette.fill, SECTOR_LIGHT_INTENSITIES.fill); fill.position.set(20, 30, 120); scene.add(fill);
 
     // Real shadow maps (graphics spec Workstream G). Gated behind settings.video.shadows (default
     // true). The key light becomes a shadow caster with a tight frustum that follows the player so
@@ -210,7 +201,7 @@
     }
 
     const cam = createChaseCamera(state);
-    const starfield = createStarfield(scene);
+    const starfield = createStarfield(scene, { tint: corePalette.nebulaTint });
     const vf = createVisualFactory();
     // Hero-asset registry (spec §17.3): wraps the factory's build() so the bespoke player Kestrel is
     // intercepted before the procedural visualFactory. Narrow + failure-isolated — any throw falls
@@ -283,13 +274,16 @@
     // contact-sheet references and are replaced by procedural materials / inline SVG).
     { const i = new Image(); i.src = 'assets/cinematics/menu_background.jpg'; }
 
-    this.renderer = renderer; this.scene = scene; this.cam = cam; this.starfield = starfield; this.vf = vf;
-    this.authoredPartLibraryReady = preloadAuthoredPartLibrary(renderer).catch((error) => {
-      console.warn('[render] authored part library preload failed', error);
-      return null;
-    });
-    state.render.authoredPartLibraryReady = this.authoredPartLibraryReady;
-    this._keyLight = shadowsOn ? key : null; // referenced by _updateShadowFollow() each frame
+    this.renderer = renderer; this.scene = scene; this.cam = cam; this.starfield = starfield; this.vf = vf;
+    this.authoredPartLibraryReady = preloadAuthoredPartLibrary(renderer).catch((error) => {
+      console.warn('[render] authored part library preload failed', error);
+      return null;
+    });
+    state.render.authoredPartLibraryReady = this.authoredPartLibraryReady;
+    this._sectorPaletteRig = createSectorPaletteRig(scene, ambient, key, rim, fill);
+    this._sectorPaletteTarget = corePalette;
+    state.render.sectorPalette = corePalette;
+    this._keyLight = shadowsOn ? key : null; // referenced by _updateShadowFollow() each frame
     this._shadowSettingOn = shadowsOn;
     this._shadowReceiversDirty = true;
     this._shadowReceiverCount = 0;
@@ -410,20 +404,19 @@
     // already spawned by the time this fires (enterSector spawns before its sector:enter resolves),
     // so a blind clearAllMeshes(keepPlayer) used to wipe the station/asteroids and leave the player
     // alone in empty space. reconcileMeshes() removes only meshes for entities that are gone.
-    bus.on('sector:enter', ({ sector } = {}) => {
-      this._meshReconcileDirty = true;
-      if (cam.snapToPlayer) cam.snapToPlayer();
-      this._updatePlanetBodies(sector);
-      // Tint the nebula backdrop to the sector's mood so each region of the galaxy reads with its
-      // own color signature: clean-blue core → rust/amber industrial → blood-red frontier → violet
-      // alien/endgame. Drives the whole-frame atmosphere, reinforcing the core-to-frontier gradient.
-      if (this.starfield && this.starfield.setSectorTint) {
-        this.starfield.setSectorTint(sectorNebulaTint(sector));
-      }
+    bus.on('sector:enter', ({ sector } = {}) => {
+      this._meshReconcileDirty = true;
+      if (cam.snapToPlayer) cam.snapToPlayer();
+      this._updatePlanetBodies(sector);
+      this._beginSectorPaletteTransition(sector);
       this._updateHazardVisuals(sector);
       precompilePipelines(renderer, scene, cam.obj, { sector }).catch((error) => console.warn('[render] sector pipeline precompile failed', error));
     });
-    bus.on('save:loaded', () => { this._meshReconcileDirty = true; });
+    bus.on('jump:arrive', ({ sectorId } = {}) => {
+      const sector = sectorId && state.world && state.world.sectors ? state.world.sectors[sectorId] : null;
+      this._beginSectorPaletteTransition(sector);
+    });
+    bus.on('save:loaded', () => { this._meshReconcileDirty = true; });
 
     window.addEventListener('resize', () => this.onResize());
   },
@@ -640,7 +633,7 @@
     return tex;
   },
 
-  _updateHazardVisuals(sector) {
+  _updateHazardVisuals(sector) {
     // Dispose previous hazard visuals
     for (const obj of this._hazardVisuals) {
       this.scene.remove(obj);
@@ -701,10 +694,42 @@
         this.scene.add(ring);
         this._hazardVisuals.push(ring);
       }
-    }
-  },
-
-  prepareFrame(alpha, frameDt) {
+    }
+  },
+
+  _beginSectorPaletteTransition(sector) {
+    const rig = this._sectorPaletteRig;
+    if (!rig) return;
+    const palette = sector && sector.palette ? sector.palette : SECTOR_PALETTE_CLASSES.core;
+    this.state.render.sectorPalette = palette;
+    if (palette === this._sectorPaletteTarget) return;
+
+    this._sectorPaletteTarget = palette;
+    writeRigToSectorPaletteFrame(rig.start, rig);
+    writePaletteToSectorPaletteFrame(rig.target, palette);
+    rig.elapsed = 0;
+    rig.active = true;
+
+    if (this.starfield && this.starfield.setSectorTint) {
+      this.starfield.setSectorTint(palette.nebulaTint);
+    }
+  },
+
+  _updateSectorPaletteTransition(frameDt) {
+    const rig = this._sectorPaletteRig;
+    if (!rig || !rig.active) return;
+    const dt = Number.isFinite(frameDt) ? Math.max(0, frameDt) : 0;
+    rig.elapsed = Math.min(SECTOR_PALETTE_LERP_SECONDS, rig.elapsed + dt);
+    const rawT = SECTOR_PALETTE_LERP_SECONDS > 0 ? rig.elapsed / SECTOR_PALETTE_LERP_SECONDS : 1;
+    const t = rawT * rawT * (3 - 2 * rawT);
+    lerpSectorPaletteFrame(rig, rig.start, rig.target, t);
+    if (rawT >= 1) {
+      rig.active = false;
+      applySectorPaletteFrame(rig, rig.target);
+    }
+  },
+
+  prepareFrame(alpha, frameDt) {
     // While the GL context is lost, the renderer can't draw — skip all per-frame work until
     // webglcontextrestored rebuilds GPU resources. (cam.follow etc. would run against a dead
     // renderer; the context-restore handler re-applies everything that matters when it returns.)
@@ -716,9 +741,10 @@
     syncAuthoredInstancePools(this.scene, { camera: this.cam.obj });
     this.starfield.recenter(this.cam.obj.position);
     // Background-clock for distant animation (planet cloud drift, hero-star twinkle). Integrates real
-    // frame dt scaled by state.timeScale so the cosmos respects hit-stop/pause — a death freeze
-    // momentarily stills the clouds too, keeping the backdrop in the same time model as the action.
-    const ts = (this.state.timeScale != null) ? this.state.timeScale : 1;
+    // frame dt scaled by state.timeScale so the cosmos respects hit-stop/pause — a death freeze
+    // momentarily stills the clouds too, keeping the backdrop in the same time model as the action.
+    this._updateSectorPaletteTransition(frameDt);
+    const ts = (this.state.timeScale != null) ? this.state.timeScale : 1;
     this._bgTime = (this._bgTime || 0) + frameDt * ts;
     if (this.starfield.update) this.starfield.update(frameDt, this._bgTime);
     this._updatePlanetParallax();
@@ -899,13 +925,97 @@
   return renderer.getDrawingBufferSize(_drawSize);
 }
 
-function finiteInRange(value, min, max, fallback) {
-  const n = Number(value);
-  if (!Number.isFinite(n)) return fallback;
-  return Math.max(min, Math.min(max, n));
-}
-
-function disposeObject(obj) {
+function finiteInRange(value, min, max, fallback) {
+  const n = Number(value);
+  if (!Number.isFinite(n)) return fallback;
+  return Math.max(min, Math.min(max, n));
+}
+
+function createSectorPaletteRig(scene, ambientLight, keyLight, rimLight, fillLight) {
+  const rig = {
+    scene,
+    lights: { ambient: ambientLight, key: keyLight, rim: rimLight, fill: fillLight },
+    start: createSectorPaletteFrame(),
+    target: createSectorPaletteFrame(),
+    elapsed: 0,
+    active: false,
+  };
+  writeRigToSectorPaletteFrame(rig.start, rig);
+  writeRigToSectorPaletteFrame(rig.target, rig);
+  return rig;
+}
+
+function createSectorPaletteFrame() {
+  return {
+    colors: {
+      ambient: new THREE.Color(),
+      key: new THREE.Color(),
+      rim: new THREE.Color(),
+      fill: new THREE.Color(),
+      fog: new THREE.Color(),
+    },
+    intensities: { ambient: 0, key: 0, rim: 0, fill: 0 },
+    fogDensity: 0,
+  };
+}
+
+function writeRigToSectorPaletteFrame(frame, rig) {
+  frame.colors.ambient.copy(rig.lights.ambient.color);
+  frame.colors.key.copy(rig.lights.key.color);
+  frame.colors.rim.copy(rig.lights.rim.color);
+  frame.colors.fill.copy(rig.lights.fill.color);
+  frame.colors.fog.copy(rig.scene.fog.color);
+  frame.intensities.ambient = rig.lights.ambient.intensity;
+  frame.intensities.key = rig.lights.key.intensity;
+  frame.intensities.rim = rig.lights.rim.intensity;
+  frame.intensities.fill = rig.lights.fill.intensity;
+  frame.fogDensity = rig.scene.fog.density;
+}
+
+function writePaletteToSectorPaletteFrame(frame, palette) {
+  frame.colors.ambient.setHex(palette.ambient);
+  frame.colors.key.setHex(palette.key);
+  frame.colors.rim.setHex(palette.rim);
+  frame.colors.fill.setHex(palette.fill);
+  frame.colors.fog.setHex(palette.fog);
+  frame.intensities.ambient = SECTOR_LIGHT_INTENSITIES.ambient;
+  frame.intensities.key = SECTOR_LIGHT_INTENSITIES.key;
+  frame.intensities.rim = SECTOR_LIGHT_INTENSITIES.rim;
+  frame.intensities.fill = SECTOR_LIGHT_INTENSITIES.fill;
+  frame.fogDensity = palette.fogDensity;
+}
+
+function applySectorPaletteFrame(rig, frame) {
+  rig.lights.ambient.color.copy(frame.colors.ambient);
+  rig.lights.key.color.copy(frame.colors.key);
+  rig.lights.rim.color.copy(frame.colors.rim);
+  rig.lights.fill.color.copy(frame.colors.fill);
+  rig.scene.fog.color.copy(frame.colors.fog);
+  rig.lights.ambient.intensity = frame.intensities.ambient;
+  rig.lights.key.intensity = frame.intensities.key;
+  rig.lights.rim.intensity = frame.intensities.rim;
+  rig.lights.fill.intensity = frame.intensities.fill;
+  rig.scene.fog.density = frame.fogDensity;
+}
+
+function lerpSectorPaletteFrame(rig, start, target, t) {
+  rig.lights.ambient.color.lerpColors(start.colors.ambient, target.colors.ambient, t);
+  rig.lights.key.color.lerpColors(start.colors.key, target.colors.key, t);
+  rig.lights.rim.color.lerpColors(start.colors.rim, target.colors.rim, t);
+  rig.lights.fill.color.lerpColors(start.colors.fill, target.colors.fill, t);
+  rig.scene.fog.color.lerpColors(start.colors.fog, target.colors.fog, t);
+  rig.lights.ambient.intensity = lerp(start.intensities.ambient, target.intensities.ambient, t);
+  rig.lights.key.intensity = lerp(start.intensities.key, target.intensities.key, t);
+  rig.lights.rim.intensity = lerp(start.intensities.rim, target.intensities.rim, t);
+  rig.lights.fill.intensity = lerp(start.intensities.fill, target.intensities.fill, t);
+  rig.scene.fog.density = lerp(start.fogDensity, target.fogDensity, t);
+}
+
+function lerp(a, b, t) {
+  return a + (b - a) * t;
+}
+
+function disposeObject(obj) {
   obj.traverse((c) => {
     if (c.isBatchedMesh && typeof c.dispose === 'function') c.dispose();
     else if (c.geometry && !(c.userData && (c.userData.sharedContactShadow || c.userData.sharedShieldGeo))) c.geometry.dispose();
diff --git a/src/render/starfield.js b/src/render/starfield.js
index d76965c563ac0d99166bb382577d2f6eaa4a6d0f..aecb37608592e6ff981ddaf8fd6107d17a0632e6
--- a/src/render/starfield.js
+++ b/src/render/starfield.js
@@ -116,10 +116,18 @@
   return c;
 }
 
-// --- small color helpers for sector tinting (no deps) ---
-function hexToRgb(hex) {
-  const h = hex.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
-}
+// --- small color helpers for sector tinting (no deps) ---
+function normalizeTint(tint) {
+  if (tint == null) return null;
+  if (typeof tint === 'number' && Number.isFinite(tint)) {
+    return '#' + ((tint >>> 0) & 0xffffff).toString(16).padStart(6, '0');
+  }
+  if (typeof tint === 'string') return tint.startsWith('#') ? tint : '#' + tint.replace(/^0x/i, '');
+  return null;
+}
+function hexToRgb(hex) {
+  const h = hex.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
+}
 function rgbToHex(r, g, b) {
   const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
   return '#' + c(r) + c(g) + c(b);
@@ -176,11 +184,11 @@
   ctx.restore();
 }
 
-export function createStarfield(scene, opts = {}) {
-  const layers = [];
-  const sprite = makeStarSprite();
-  let bgTexture = null;
-  let currentTint = opts.tint || null;
+export function createStarfield(scene, opts = {}) {
+  const layers = [];
+  const sprite = makeStarSprite();
+  let bgTexture = null;
+  let currentTint = normalizeTint(opts.tint);
 
   // star tints (mostly cool white/blue with a few warm + teal accents)
   const TINTS = [0xffffff, 0xcfe0ff, 0x9fb6e0, 0xfff0d8, 0x8af0d6, 0xbfd2ff];
@@ -297,13 +305,14 @@
       // GR-7: slow-rotate the distant 3D planets so they read as real spinning worlds, not billboards.
       for (const p of distantPlanets) p.mesh.rotation.y += dt * p.spin;
     },
-    // Swap the nebula mood on sector enter — each region of the galaxy reads with its own color
-    // signature (core = clean blue, industrial = rust/amber, frontier = blood-red, alien = violet).
-    setSectorTint(tint) {
-      if (tint === currentTint) return;
-      currentTint = tint || null;
-      applyBackground(currentTint);
-    },
+    // Swap the nebula mood on sector enter — each region of the galaxy reads with its own color
+    // signature (core = clean blue, industrial = rust/amber, frontier = blood-red, alien = violet).
+    setSectorTint(tint) {
+      const nextTint = normalizeTint(tint);
+      if (nextTint === currentTint) return;
+      currentTint = nextTint;
+      applyBackground(currentTint);
+    },
     setWarp() { /* extended by vfx during jump */ },
   };
 }

diff --git a/scripts/check-sector-palettes.mjs b/scripts/check-sector-palettes.mjs
new file mode 100644
index 0000000000000000000000000000000000000000..04318569a6d4a787b3cf451b3de0e457574fa6f1
--- /dev/null
+++ b/scripts/check-sector-palettes.mjs
@@ -0,0 +1,81 @@
+import { SECTORS, SECTOR_PALETTE_CLASSES } from '../src/data/sectors.js';
+
+const REQUIRED_FIELDS = ['key', 'rim', 'fill', 'ambient', 'fog', 'fogDensity', 'nebulaTint', 'dust'];
+const COLOR_FIELDS = ['key', 'rim', 'fill', 'ambient', 'fog', 'nebulaTint', 'dust'];
+const CLASS_ENTRIES = Object.entries(SECTOR_PALETTE_CLASSES);
+const CORE_LUMINANCE = combinedLightLuminance(SECTOR_PALETTE_CLASSES.core);
+const MIN_LUMINANCE = CORE_LUMINANCE * 0.8;
+const MAX_LUMINANCE = CORE_LUMINANCE * 1.2;
+
+const issues = [];
+const usedClasses = new Set();
+
+for (const sector of SECTORS) {
+  const palette = sector.palette;
+  if (!palette || typeof palette !== 'object') {
+    issues.push(`${sector.id}: missing palette block`);
+    continue;
+  }
+
+  for (const field of REQUIRED_FIELDS) {
+    if (!(field in palette)) issues.push(`${sector.id}: palette missing ${field}`);
+  }
+  for (const field of COLOR_FIELDS) {
+    if (!isColorHex(palette[field])) issues.push(`${sector.id}: palette.${field} must be a 0x000000-0xffffff number`);
+  }
+  if (!Number.isFinite(palette.fogDensity) || palette.fogDensity <= 0) {
+    issues.push(`${sector.id}: palette.fogDensity must be a positive finite number`);
+  }
+
+  const className = classNameForPalette(palette);
+  if (!className) issues.push(`${sector.id}: palette does not match an authored class`);
+  else usedClasses.add(className);
+
+  const luminance = combinedLightLuminance(palette);
+  if (luminance < MIN_LUMINANCE || luminance > MAX_LUMINANCE) {
+    issues.push(`${sector.id}: ambient+fill luminance ${luminance.toFixed(4)} outside ${MIN_LUMINANCE.toFixed(4)}-${MAX_LUMINANCE.toFixed(4)}`);
+  }
+}
+
+for (const [className] of CLASS_ENTRIES) {
+  if (!usedClasses.has(className)) issues.push(`palette class unused: ${className}`);
+}
+
+if (issues.length) {
+  console.error(`Sector palette check failed (${issues.length} issue${issues.length === 1 ? '' : 's'}):`);
+  for (const issue of issues) console.error(`- ${issue}`);
+  process.exit(1);
+}
+
+console.log(`Sector palettes OK: ${SECTORS.length} sectors, classes used: ${[...usedClasses].sort().join(', ')}`);
+
+function classNameForPalette(palette) {
+  for (const [className, classPalette] of CLASS_ENTRIES) {
+    if (samePalette(palette, classPalette)) return className;
+  }
+  return null;
+}
+
+function samePalette(a, b) {
+  return REQUIRED_FIELDS.every((field) => a[field] === b[field]);
+}
+
+function isColorHex(value) {
+  return Number.isInteger(value) && value >= 0x000000 && value <= 0xffffff;
+}
+
+function combinedLightLuminance(palette) {
+  return relativeLuminance(palette.ambient) + relativeLuminance(palette.fill);
+}
+
+function relativeLuminance(hex) {
+  const r = linearRgb((hex >> 16) & 0xff);
+  const g = linearRgb((hex >> 8) & 0xff);
+  const b = linearRgb(hex & 0xff);
+  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
+}
+
+function linearRgb(channel) {
+  const c = channel / 255;
+  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
+}
diff --git a/src/data/sectors.js b/src/data/sectors.js
index 9c63f69479b241fc848258e3fe2161547793fa46..1814c409089f818b6ab4758b3f0cf8f8531f2452
--- a/src/data/sectors.js
+++ b/src/data/sectors.js
@@ -10,10 +10,30 @@
 export const HAZARD_TYPES  = ['dense_asteroid', 'nebula', 'radiation', 'debris'];
 export const POI_TYPES     = ['beacon', 'derelict', 'cache', 'colony', 'anomaly', 'wormhole', 'wreck'];
 
+export const SECTOR_PALETTE_CLASSES = {
+  core: {
+    key: 0xcfe2ff, rim: 0x6a5cff, fill: 0x39d0ff, ambient: 0x42506f,
+    fog: 0x0a1430, fogDensity: 0.00026, nebulaTint: 0x1e3a6a, dust: 0x7ea7c7,
+  },
+  belt: {
+    key: 0xffd59a, rim: 0xb56d2f, fill: 0xffb13d, ambient: 0x594a42,
+    fog: 0x2a160c, fogDensity: 0.00034, nebulaTint: 0x8a4a1e, dust: 0xc0793d,
+  },
+  fringe: {
+    key: 0xffb07a, rim: 0xff3f2d, fill: 0xffaa66, ambient: 0x584343,
+    fog: 0x2a0d0a, fogDensity: 0.00042, nebulaTint: 0x8a1e1e, dust: 0xc15032,
+  },
+  anomaly: {
+    key: 0xc8b6ff, rim: 0x54ffb0, fill: 0x4ddc92, ambient: 0x494760,
+    fog: 0x160d2c, fogDensity: 0.00036, nebulaTint: 0x5a1e8a, dust: 0x79ffc8,
+  },
+};
+
 export const SECTORS = [
   {
     id: 'sector_helios_prime', name: 'Helios Prime', tier: 0, security: 0.98, charted: true,
     factionId: 'faction_scn', position: { x: 0, y: 0 }, worldRadius: 3500,
+    palette: SECTOR_PALETTE_CLASSES.core,
     // Tutorial home sector: NO hostile spawns (enemyDensity 0). A brand-new pilot must not be
     // hunted before learning the ropes; danger ramps up only in neighbouring sectors.
     trafficPerMin: 18, enemyDensity: 0, enemyLevel: [1, 2],
@@ -37,6 +57,7 @@
   {
     id: 'sector_ceres_belt', name: 'Ceres Belt', tier: 1, security: 0.72, charted: true,
     factionId: 'faction_dmc', position: { x: -3, y: 2 }, worldRadius: 4200,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 10, enemyDensity: 0.18, enemyLevel: [2, 4],
     neighbors: ['sector_helios_prime', 'sector_tethys_junction', 'sector_pallas_drift'],
     stations: [
@@ -57,6 +78,7 @@
   {
     id: 'sector_tethys_junction', name: 'Tethys Junction', tier: 1, security: 0.65, charted: true,
     factionId: 'faction_mts', position: { x: 3, y: 2 }, worldRadius: 4000,
+    palette: SECTOR_PALETTE_CLASSES.core,
     trafficPerMin: 14, enemyDensity: 0.20, enemyLevel: [2, 4],
     neighbors: ['sector_helios_prime', 'sector_ceres_belt', 'sector_vesta_forge', 'sector_io_reach'],
     stations: [
@@ -72,6 +94,7 @@
   {
     id: 'sector_vesta_forge', name: 'Vesta Forge', tier: 1, security: 0.60, charted: true,
     factionId: 'faction_dmc', position: { x: 0, y: 4 }, worldRadius: 4300,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 9, enemyDensity: 0.25, enemyLevel: [3, 5],
     neighbors: ['sector_helios_prime', 'sector_tethys_junction', 'sector_charon_expanse'],
     stations: [
@@ -89,6 +112,7 @@
   {
     id: 'sector_pallas_drift', name: 'Pallas Drift', tier: 2, security: 0.42, charted: true,
     factionId: 'faction_mts', position: { x: -5, y: 5 }, worldRadius: 4500,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 7, enemyDensity: 0.40, enemyLevel: [4, 7],
     neighbors: ['sector_ceres_belt', 'sector_io_reach', 'sector_sker_haven'],
     stations: [
@@ -109,6 +133,7 @@
   {
     id: 'sector_io_reach', name: 'Io Reach', tier: 2, security: 0.35, charted: true,
     factionId: 'faction_free', position: { x: 5, y: 5 }, worldRadius: 4600,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 5, enemyDensity: 0.50, enemyLevel: [5, 8],
     neighbors: ['sector_tethys_junction', 'sector_pallas_drift', 'sector_charon_expanse', 'sector_veil_nebula'],
     stations: [
@@ -132,6 +157,7 @@
   {
     id: 'sector_charon_expanse', name: 'Charon Expanse', tier: 2, security: 0.30, charted: true,
     factionId: 'faction_dmc', position: { x: 2, y: 7 }, worldRadius: 4800,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 4, enemyDensity: 0.50, enemyLevel: [5, 9],
     neighbors: ['sector_vesta_forge', 'sector_io_reach', 'sector_ashfall_reach'],
     stations: [
@@ -151,6 +177,7 @@
   {
     id: 'sector_sker_haven', name: 'Sker Haven', tier: 3, security: 0.08, charted: false,
     factionId: 'faction_reach', position: { x: -7, y: 8 }, worldRadius: 5000,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 0, enemyDensity: 0.70, enemyLevel: [7, 11],
     neighbors: ['sector_pallas_drift', 'sector_veil_nebula'],
     stations: [
@@ -169,6 +196,7 @@
   {
     id: 'sector_veil_nebula', name: 'Veil Nebula', tier: 3, security: 0.12, charted: false,
     factionId: 'faction_free', position: { x: 7, y: 9 }, worldRadius: 5200,
+    palette: SECTOR_PALETTE_CLASSES.anomaly,
     trafficPerMin: 0, enemyDensity: 0.65, enemyLevel: [8, 12],
     neighbors: ['sector_io_reach', 'sector_sker_haven'],
     wormholeTo: { sectorId: 'sector_ashfall_reach', gatedBy: 'tech:tech_long_range_survey' },
@@ -188,6 +216,7 @@
   {
     id: 'sector_ashfall_reach', name: 'Ashfall Reach', tier: 4, security: 0.05, charted: false,
     factionId: 'faction_vael', position: { x: 4, y: 11 }, worldRadius: 5500,
+    palette: SECTOR_PALETTE_CLASSES.anomaly,
     trafficPerMin: 0, enemyDensity: 0.80, enemyLevel: [10, 15],
     neighbors: ['sector_charon_expanse'],
     stations: [
diff --git a/src/render/renderer.js b/src/render/renderer.js
index def6420ff1bff2ac1c64dcc1add395e7851c4dbc..b8dd6ec63f224fbdab8fc20077f3cbf2d75c3ba2
--- a/src/render/renderer.js
+++ b/src/render/renderer.js
@@ -15,21 +15,11 @@
 import { installDiagnostics } from './diagnostics.js';
 import { createPlanetFactory } from './planetFactory.js';
 import { precompilePipelines } from './precompile.js';
-
-// Map a sector's danger/tier to a nebula backdrop tint so each region of the galaxy has its own
-// color signature. Core (safe, low tier) = clean blue; industrial mid-ring = rust/amber; lawless
-// frontier = blood-red; alien/endgame tier 4+ = violet. Returns a hex string or null (default).
-function sectorNebulaTint(sector) {
-  if (!sector) return null;
-  const tier = sector.tier || 0;
-  const sec = sector.security != null ? sector.security : 1;
-  const danger = (1 - sec) + tier * 0.15; // blended danger metric
-  if (tier >= 4) return '#5a1e8a';        // violet — alien / lawless endgame (Veil, Ashfall)
-  if (danger > 0.7) return '#8a1e1e';     // blood-red — dangerous frontier (Io Reach, Sker)
-  if (danger > 0.45) return '#8a4a1e';    // rust/amber — industrial mid-ring (Vesta, Pallas)
-  if (danger > 0.2) return '#1e4a8a';     // deep blue — settled belt (Ceres, Tethys)
-  return '#1e3a6a';                        // clean blue — safe core (Helios Prime)
-}
+import { SECTOR_PALETTE_CLASSES } from '../data/sectors.js';
+
+const SECTOR_PALETTE_LERP_SECONDS = 1.5;
+const SECTOR_LIGHT_INTENSITIES = { ambient: 0.85, key: 1.7, rim: 0.7, fill: 0.35 };
+const SECTOR_PALETTE_COLOR_FIELDS = ['ambient', 'key', 'rim', 'fill', 'fog'];
 
 // ---- contact shadow disc (module-level cache so one texture serves all entities) ----------------
 let _shadowTex = null;
@@ -178,14 +168,15 @@
     renderer.setClearColor(0x060912, 1);
     const drawSize = applyRendererSize(renderer, state);
 
-    const scene = new THREE.Scene();
-    // Thin fog for gentle depth cueing only — the old 0.00085 erased the entire backdrop, leaving a
-    // black void. This keeps the nebula + far stars visible while still fading the deep distance.
-    scene.fog = new THREE.FogExp2(0x0a1430, 0.00026);
-    scene.add(new THREE.AmbientLight(0x42506f, 0.85));
-    const key = new THREE.DirectionalLight(0xcfe2ff, 1.7); key.position.set(60, 140, 40); scene.add(key);
-    const rim = new THREE.DirectionalLight(0x6a5cff, 0.7); rim.position.set(-70, 50, -60); scene.add(rim);
-    const fill = new THREE.DirectionalLight(0x39d0ff, 0.35); fill.position.set(20, 30, 120); scene.add(fill);
+    const scene = new THREE.Scene();
+    const corePalette = SECTOR_PALETTE_CLASSES.core;
+    // Thin fog for gentle depth cueing only — the old 0.00085 erased the entire backdrop, leaving a
+    // black void. This keeps the nebula + far stars visible while still fading the deep distance.
+    scene.fog = new THREE.FogExp2(corePalette.fog, corePalette.fogDensity);
+    const ambient = new THREE.AmbientLight(corePalette.ambient, SECTOR_LIGHT_INTENSITIES.ambient); scene.add(ambient);
+    const key = new THREE.DirectionalLight(corePalette.key, SECTOR_LIGHT_INTENSITIES.key); key.position.set(60, 140, 40); scene.add(key);
+    const rim = new THREE.DirectionalLight(corePalette.rim, SECTOR_LIGHT_INTENSITIES.rim); rim.position.set(-70, 50, -60); scene.add(rim);
+    const fill = new THREE.DirectionalLight(corePalette.fill, SECTOR_LIGHT_INTENSITIES.fill); fill.position.set(20, 30, 120); scene.add(fill);
 
     // Real shadow maps (graphics spec Workstream G). Gated behind settings.video.shadows (default
     // true). The key light becomes a shadow caster with a tight frustum that follows the player so
@@ -210,7 +201,7 @@
     }
 
     const cam = createChaseCamera(state);
-    const starfield = createStarfield(scene);
+    const starfield = createStarfield(scene, { tint: corePalette.nebulaTint });
     const vf = createVisualFactory();
     // Hero-asset registry (spec §17.3): wraps the factory's build() so the bespoke player Kestrel is
     // intercepted before the procedural visualFactory. Narrow + failure-isolated — any throw falls
@@ -283,13 +274,16 @@
     // contact-sheet references and are replaced by procedural materials / inline SVG).
     { const i = new Image(); i.src = 'assets/cinematics/menu_background.jpg'; }
 
-    this.renderer = renderer; this.scene = scene; this.cam = cam; this.starfield = starfield; this.vf = vf;
-    this.authoredPartLibraryReady = preloadAuthoredPartLibrary(renderer).catch((error) => {
-      console.warn('[render] authored part library preload failed', error);
-      return null;
-    });
-    state.render.authoredPartLibraryReady = this.authoredPartLibraryReady;
-    this._keyLight = shadowsOn ? key : null; // referenced by _updateShadowFollow() each frame
+    this.renderer = renderer; this.scene = scene; this.cam = cam; this.starfield = starfield; this.vf = vf;
+    this.authoredPartLibraryReady = preloadAuthoredPartLibrary(renderer).catch((error) => {
+      console.warn('[render] authored part library preload failed', error);
+      return null;
+    });
+    state.render.authoredPartLibraryReady = this.authoredPartLibraryReady;
+    this._sectorPaletteRig = createSectorPaletteRig(scene, ambient, key, rim, fill);
+    this._sectorPaletteTarget = corePalette;
+    state.render.sectorPalette = corePalette;
+    this._keyLight = shadowsOn ? key : null; // referenced by _updateShadowFollow() each frame
     this._shadowSettingOn = shadowsOn;
     this._shadowReceiversDirty = true;
     this._shadowReceiverCount = 0;
@@ -410,20 +404,19 @@
     // already spawned by the time this fires (enterSector spawns before its sector:enter resolves),
     // so a blind clearAllMeshes(keepPlayer) used to wipe the station/asteroids and leave the player
     // alone in empty space. reconcileMeshes() removes only meshes for entities that are gone.
-    bus.on('sector:enter', ({ sector } = {}) => {
-      this._meshReconcileDirty = true;
-      if (cam.snapToPlayer) cam.snapToPlayer();
-      this._updatePlanetBodies(sector);
-      // Tint the nebula backdrop to the sector's mood so each region of the galaxy reads with its
-      // own color signature: clean-blue core → rust/amber industrial → blood-red frontier → violet
-      // alien/endgame. Drives the whole-frame atmosphere, reinforcing the core-to-frontier gradient.
-      if (this.starfield && this.starfield.setSectorTint) {
-        this.starfield.setSectorTint(sectorNebulaTint(sector));
-      }
+    bus.on('sector:enter', ({ sector } = {}) => {
+      this._meshReconcileDirty = true;
+      if (cam.snapToPlayer) cam.snapToPlayer();
+      this._updatePlanetBodies(sector);
+      this._beginSectorPaletteTransition(sector);
       this._updateHazardVisuals(sector);
       precompilePipelines(renderer, scene, cam.obj, { sector }).catch((error) => console.warn('[render] sector pipeline precompile failed', error));
     });
-    bus.on('save:loaded', () => { this._meshReconcileDirty = true; });
+    bus.on('jump:arrive', ({ sectorId } = {}) => {
+      const sector = sectorId && state.world && state.world.sectors ? state.world.sectors[sectorId] : null;
+      this._beginSectorPaletteTransition(sector);
+    });
+    bus.on('save:loaded', () => { this._meshReconcileDirty = true; });
 
     window.addEventListener('resize', () => this.onResize());
   },
@@ -640,7 +633,7 @@
     return tex;
   },
 
-  _updateHazardVisuals(sector) {
+  _updateHazardVisuals(sector) {
     // Dispose previous hazard visuals
     for (const obj of this._hazardVisuals) {
       this.scene.remove(obj);
@@ -701,10 +694,42 @@
         this.scene.add(ring);
         this._hazardVisuals.push(ring);
       }
-    }
-  },
-
-  prepareFrame(alpha, frameDt) {
+    }
+  },
+
+  _beginSectorPaletteTransition(sector) {
+    const rig = this._sectorPaletteRig;
+    if (!rig) return;
+    const palette = sector && sector.palette ? sector.palette : SECTOR_PALETTE_CLASSES.core;
+    this.state.render.sectorPalette = palette;
+    if (palette === this._sectorPaletteTarget) return;
+
+    this._sectorPaletteTarget = palette;
+    writeRigToSectorPaletteFrame(rig.start, rig);
+    writePaletteToSectorPaletteFrame(rig.target, palette);
+    rig.elapsed = 0;
+    rig.active = true;
+
+    if (this.starfield && this.starfield.setSectorTint) {
+      this.starfield.setSectorTint(palette.nebulaTint);
+    }
+  },
+
+  _updateSectorPaletteTransition(frameDt) {
+    const rig = this._sectorPaletteRig;
+    if (!rig || !rig.active) return;
+    const dt = Number.isFinite(frameDt) ? Math.max(0, frameDt) : 0;
+    rig.elapsed = Math.min(SECTOR_PALETTE_LERP_SECONDS, rig.elapsed + dt);
+    const rawT = SECTOR_PALETTE_LERP_SECONDS > 0 ? rig.elapsed / SECTOR_PALETTE_LERP_SECONDS : 1;
+    const t = rawT * rawT * (3 - 2 * rawT);
+    lerpSectorPaletteFrame(rig, rig.start, rig.target, t);
+    if (rawT >= 1) {
+      rig.active = false;
+      applySectorPaletteFrame(rig, rig.target);
+    }
+  },
+
+  prepareFrame(alpha, frameDt) {
     // While the GL context is lost, the renderer can't draw — skip all per-frame work until
     // webglcontextrestored rebuilds GPU resources. (cam.follow etc. would run against a dead
     // renderer; the context-restore handler re-applies everything that matters when it returns.)
@@ -716,9 +741,10 @@
     syncAuthoredInstancePools(this.scene, { camera: this.cam.obj });
     this.starfield.recenter(this.cam.obj.position);
     // Background-clock for distant animation (planet cloud drift, hero-star twinkle). Integrates real
-    // frame dt scaled by state.timeScale so the cosmos respects hit-stop/pause — a death freeze
-    // momentarily stills the clouds too, keeping the backdrop in the same time model as the action.
-    const ts = (this.state.timeScale != null) ? this.state.timeScale : 1;
+    // frame dt scaled by state.timeScale so the cosmos respects hit-stop/pause — a death freeze
+    // momentarily stills the clouds too, keeping the backdrop in the same time model as the action.
+    this._updateSectorPaletteTransition(frameDt);
+    const ts = (this.state.timeScale != null) ? this.state.timeScale : 1;
     this._bgTime = (this._bgTime || 0) + frameDt * ts;
     if (this.starfield.update) this.starfield.update(frameDt, this._bgTime);
     this._updatePlanetParallax();
@@ -899,13 +925,97 @@
   return renderer.getDrawingBufferSize(_drawSize);
 }
 
-function finiteInRange(value, min, max, fallback) {
-  const n = Number(value);
-  if (!Number.isFinite(n)) return fallback;
-  return Math.max(min, Math.min(max, n));
-}
-
-function disposeObject(obj) {
+function finiteInRange(value, min, max, fallback) {
+  const n = Number(value);
+  if (!Number.isFinite(n)) return fallback;
+  return Math.max(min, Math.min(max, n));
+}
+
+function createSectorPaletteRig(scene, ambientLight, keyLight, rimLight, fillLight) {
+  const rig = {
+    scene,
+    lights: { ambient: ambientLight, key: keyLight, rim: rimLight, fill: fillLight },
+    start: createSectorPaletteFrame(),
+    target: createSectorPaletteFrame(),
+    elapsed: 0,
+    active: false,
+  };
+  writeRigToSectorPaletteFrame(rig.start, rig);
+  writeRigToSectorPaletteFrame(rig.target, rig);
+  return rig;
+}
+
+function createSectorPaletteFrame() {
+  return {
+    colors: {
+      ambient: new THREE.Color(),
+      key: new THREE.Color(),
+      rim: new THREE.Color(),
+      fill: new THREE.Color(),
+      fog: new THREE.Color(),
+    },
+    intensities: { ambient: 0, key: 0, rim: 0, fill: 0 },
+    fogDensity: 0,
+  };
+}
+
+function writeRigToSectorPaletteFrame(frame, rig) {
+  frame.colors.ambient.copy(rig.lights.ambient.color);
+  frame.colors.key.copy(rig.lights.key.color);
+  frame.colors.rim.copy(rig.lights.rim.color);
+  frame.colors.fill.copy(rig.lights.fill.color);
+  frame.colors.fog.copy(rig.scene.fog.color);
+  frame.intensities.ambient = rig.lights.ambient.intensity;
+  frame.intensities.key = rig.lights.key.intensity;
+  frame.intensities.rim = rig.lights.rim.intensity;
+  frame.intensities.fill = rig.lights.fill.intensity;
+  frame.fogDensity = rig.scene.fog.density;
+}
+
+function writePaletteToSectorPaletteFrame(frame, palette) {
+  frame.colors.ambient.setHex(palette.ambient);
+  frame.colors.key.setHex(palette.key);
+  frame.colors.rim.setHex(palette.rim);
+  frame.colors.fill.setHex(palette.fill);
+  frame.colors.fog.setHex(palette.fog);
+  frame.intensities.ambient = SECTOR_LIGHT_INTENSITIES.ambient;
+  frame.intensities.key = SECTOR_LIGHT_INTENSITIES.key;
+  frame.intensities.rim = SECTOR_LIGHT_INTENSITIES.rim;
+  frame.intensities.fill = SECTOR_LIGHT_INTENSITIES.fill;
+  frame.fogDensity = palette.fogDensity;
+}
+
+function applySectorPaletteFrame(rig, frame) {
+  rig.lights.ambient.color.copy(frame.colors.ambient);
+  rig.lights.key.color.copy(frame.colors.key);
+  rig.lights.rim.color.copy(frame.colors.rim);
+  rig.lights.fill.color.copy(frame.colors.fill);
+  rig.scene.fog.color.copy(frame.colors.fog);
+  rig.lights.ambient.intensity = frame.intensities.ambient;
+  rig.lights.key.intensity = frame.intensities.key;
+  rig.lights.rim.intensity = frame.intensities.rim;
+  rig.lights.fill.intensity = frame.intensities.fill;
+  rig.scene.fog.density = frame.fogDensity;
+}
+
+function lerpSectorPaletteFrame(rig, start, target, t) {
+  rig.lights.ambient.color.lerpColors(start.colors.ambient, target.colors.ambient, t);
+  rig.lights.key.color.lerpColors(start.colors.key, target.colors.key, t);
+  rig.lights.rim.color.lerpColors(start.colors.rim, target.colors.rim, t);
+  rig.lights.fill.color.lerpColors(start.colors.fill, target.colors.fill, t);
+  rig.scene.fog.color.lerpColors(start.colors.fog, target.colors.fog, t);
+  rig.lights.ambient.intensity = lerp(start.intensities.ambient, target.intensities.ambient, t);
+  rig.lights.key.intensity = lerp(start.intensities.key, target.intensities.key, t);
+  rig.lights.rim.intensity = lerp(start.intensities.rim, target.intensities.rim, t);
+  rig.lights.fill.intensity = lerp(start.intensities.fill, target.intensities.fill, t);
+  rig.scene.fog.density = lerp(start.fogDensity, target.fogDensity, t);
+}
+
+function lerp(a, b, t) {
+  return a + (b - a) * t;
+}
+
+function disposeObject(obj) {
   obj.traverse((c) => {
     if (c.isBatchedMesh && typeof c.dispose === 'function') c.dispose();
     else if (c.geometry && !(c.userData && (c.userData.sharedContactShadow || c.userData.sharedShieldGeo))) c.geometry.dispose();
diff --git a/src/render/starfield.js b/src/render/starfield.js
index d76965c563ac0d99166bb382577d2f6eaa4a6d0f..aecb37608592e6ff981ddaf8fd6107d17a0632e6
--- a/src/render/starfield.js
+++ b/src/render/starfield.js
@@ -116,10 +116,18 @@
   return c;
 }
 
-// --- small color helpers for sector tinting (no deps) ---
-function hexToRgb(hex) {
-  const h = hex.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
-}
+// --- small color helpers for sector tinting (no deps) ---
+function normalizeTint(tint) {
+  if (tint == null) return null;
+  if (typeof tint === 'number' && Number.isFinite(tint)) {
+    return '#' + ((tint >>> 0) & 0xffffff).toString(16).padStart(6, '0');
+  }
+  if (typeof tint === 'string') return tint.startsWith('#') ? tint : '#' + tint.replace(/^0x/i, '');
+  return null;
+}
+function hexToRgb(hex) {
+  const h = hex.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
+}
 function rgbToHex(r, g, b) {
   const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
   return '#' + c(r) + c(g) + c(b);
@@ -176,11 +184,11 @@
   ctx.restore();
 }
 
-export function createStarfield(scene, opts = {}) {
-  const layers = [];
-  const sprite = makeStarSprite();
-  let bgTexture = null;
-  let currentTint = opts.tint || null;
+export function createStarfield(scene, opts = {}) {
+  const layers = [];
+  const sprite = makeStarSprite();
+  let bgTexture = null;
+  let currentTint = normalizeTint(opts.tint);
 
   // star tints (mostly cool white/blue with a few warm + teal accents)
   const TINTS = [0xffffff, 0xcfe0ff, 0x9fb6e0, 0xfff0d8, 0x8af0d6, 0xbfd2ff];
@@ -297,13 +305,14 @@
       // GR-7: slow-rotate the distant 3D planets so they read as real spinning worlds, not billboards.
       for (const p of distantPlanets) p.mesh.rotation.y += dt * p.spin;
     },
-    // Swap the nebula mood on sector enter — each region of the galaxy reads with its own color
-    // signature (core = clean blue, industrial = rust/amber, frontier = blood-red, alien = violet).
-    setSectorTint(tint) {
-      if (tint === currentTint) return;
-      currentTint = tint || null;
-      applyBackground(currentTint);
-    },
+    // Swap the nebula mood on sector enter — each region of the galaxy reads with its own color
+    // signature (core = clean blue, industrial = rust/amber, frontier = blood-red, alien = violet).
+    setSectorTint(tint) {
+      const nextTint = normalizeTint(tint);
+      if (nextTint === currentTint) return;
+      currentTint = nextTint;
+      applyBackground(currentTint);
+    },
     setWarp() { /* extended by vfx during jump */ },
   };
 }

codex
The checker is in. I’m adding the package script alias now, then I’ll run syntax/data checks before the heavier requested gate.
apply patch
patch: completed
C:\Users\93rob\Documents\GitHub\SpaceFace\package.json
diff --git a/package.json b/package.json
index 0897813b9c443f97ae9d2e8ae253e77f386705d9..a869414ec6dbceebe45b9b78abd72013201579da
--- a/package.json
+++ b/package.json
@@ -74,9 +74,10 @@
     "build:sg04:release-assets": "node scripts/build-sg04-release-assets.mjs",
     "build:bundle": "node scripts/build-bundle.mjs",
     "check:bundle": "node scripts/check-bundle.mjs",
-    "check:launch-policy": "node scripts/check-launch-policy.mjs",
-    "check:non-graphics": "node scripts/check-non-graphics-ci.mjs",
-    "check:assets:live": "node scripts/probe-authored-assets-live.mjs",
+    "check:launch-policy": "node scripts/check-launch-policy.mjs",
+    "check:non-graphics": "node scripts/check-non-graphics-ci.mjs",
+    "check:sector-palettes": "node scripts/check-sector-palettes.mjs",
+    "check:assets:live": "node scripts/probe-authored-assets-live.mjs",
     "check:perf:control": "node scripts/probe-raf-control.mjs --headed --strict --width 1830 --height 973 --warmup 1000 --duration 5000",
     "check:perf": "node scripts/probe-performance-profile.mjs --headed --strict --width 1830 --height 973 --warmup 2500 --duration 7000 --diagnostic-variants",
     "check:hitch-budget": "node scripts/check-hitch-budget.mjs",
diff --git a/scripts/check-sector-palettes.mjs b/scripts/check-sector-palettes.mjs
new file mode 100644
index 0000000000000000000000000000000000000000..04318569a6d4a787b3cf451b3de0e457574fa6f1
--- /dev/null
+++ b/scripts/check-sector-palettes.mjs
@@ -0,0 +1,81 @@
+import { SECTORS, SECTOR_PALETTE_CLASSES } from '../src/data/sectors.js';
+
+const REQUIRED_FIELDS = ['key', 'rim', 'fill', 'ambient', 'fog', 'fogDensity', 'nebulaTint', 'dust'];
+const COLOR_FIELDS = ['key', 'rim', 'fill', 'ambient', 'fog', 'nebulaTint', 'dust'];
+const CLASS_ENTRIES = Object.entries(SECTOR_PALETTE_CLASSES);
+const CORE_LUMINANCE = combinedLightLuminance(SECTOR_PALETTE_CLASSES.core);
+const MIN_LUMINANCE = CORE_LUMINANCE * 0.8;
+const MAX_LUMINANCE = CORE_LUMINANCE * 1.2;
+
+const issues = [];
+const usedClasses = new Set();
+
+for (const sector of SECTORS) {
+  const palette = sector.palette;
+  if (!palette || typeof palette !== 'object') {
+    issues.push(`${sector.id}: missing palette block`);
+    continue;
+  }
+
+  for (const field of REQUIRED_FIELDS) {
+    if (!(field in palette)) issues.push(`${sector.id}: palette missing ${field}`);
+  }
+  for (const field of COLOR_FIELDS) {
+    if (!isColorHex(palette[field])) issues.push(`${sector.id}: palette.${field} must be a 0x000000-0xffffff number`);
+  }
+  if (!Number.isFinite(palette.fogDensity) || palette.fogDensity <= 0) {
+    issues.push(`${sector.id}: palette.fogDensity must be a positive finite number`);
+  }
+
+  const className = classNameForPalette(palette);
+  if (!className) issues.push(`${sector.id}: palette does not match an authored class`);
+  else usedClasses.add(className);
+
+  const luminance = combinedLightLuminance(palette);
+  if (luminance < MIN_LUMINANCE || luminance > MAX_LUMINANCE) {
+    issues.push(`${sector.id}: ambient+fill luminance ${luminance.toFixed(4)} outside ${MIN_LUMINANCE.toFixed(4)}-${MAX_LUMINANCE.toFixed(4)}`);
+  }
+}
+
+for (const [className] of CLASS_ENTRIES) {
+  if (!usedClasses.has(className)) issues.push(`palette class unused: ${className}`);
+}
+
+if (issues.length) {
+  console.error(`Sector palette check failed (${issues.length} issue${issues.length === 1 ? '' : 's'}):`);
+  for (const issue of issues) console.error(`- ${issue}`);
+  process.exit(1);
+}
+
+console.log(`Sector palettes OK: ${SECTORS.length} sectors, classes used: ${[...usedClasses].sort().join(', ')}`);
+
+function classNameForPalette(palette) {
+  for (const [className, classPalette] of CLASS_ENTRIES) {
+    if (samePalette(palette, classPalette)) return className;
+  }
+  return null;
+}
+
+function samePalette(a, b) {
+  return REQUIRED_FIELDS.every((field) => a[field] === b[field]);
+}
+
+function isColorHex(value) {
+  return Number.isInteger(value) && value >= 0x000000 && value <= 0xffffff;
+}
+
+function combinedLightLuminance(palette) {
+  return relativeLuminance(palette.ambient) + relativeLuminance(palette.fill);
+}
+
+function relativeLuminance(hex) {
+  const r = linearRgb((hex >> 16) & 0xff);
+  const g = linearRgb((hex >> 8) & 0xff);
+  const b = linearRgb(hex & 0xff);
+  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
+}
+
+function linearRgb(channel) {
+  const c = channel / 255;
+  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
+}
diff --git a/src/data/sectors.js b/src/data/sectors.js
index 9c63f69479b241fc848258e3fe2161547793fa46..1814c409089f818b6ab4758b3f0cf8f8531f2452
--- a/src/data/sectors.js
+++ b/src/data/sectors.js
@@ -10,10 +10,30 @@
 export const HAZARD_TYPES  = ['dense_asteroid', 'nebula', 'radiation', 'debris'];
 export const POI_TYPES     = ['beacon', 'derelict', 'cache', 'colony', 'anomaly', 'wormhole', 'wreck'];
 
+export const SECTOR_PALETTE_CLASSES = {
+  core: {
+    key: 0xcfe2ff, rim: 0x6a5cff, fill: 0x39d0ff, ambient: 0x42506f,
+    fog: 0x0a1430, fogDensity: 0.00026, nebulaTint: 0x1e3a6a, dust: 0x7ea7c7,
+  },
+  belt: {
+    key: 0xffd59a, rim: 0xb56d2f, fill: 0xffb13d, ambient: 0x594a42,
+    fog: 0x2a160c, fogDensity: 0.00034, nebulaTint: 0x8a4a1e, dust: 0xc0793d,
+  },
+  fringe: {
+    key: 0xffb07a, rim: 0xff3f2d, fill: 0xffaa66, ambient: 0x584343,
+    fog: 0x2a0d0a, fogDensity: 0.00042, nebulaTint: 0x8a1e1e, dust: 0xc15032,
+  },
+  anomaly: {
+    key: 0xc8b6ff, rim: 0x54ffb0, fill: 0x4ddc92, ambient: 0x494760,
+    fog: 0x160d2c, fogDensity: 0.00036, nebulaTint: 0x5a1e8a, dust: 0x79ffc8,
+  },
+};
+
 export const SECTORS = [
   {
     id: 'sector_helios_prime', name: 'Helios Prime', tier: 0, security: 0.98, charted: true,
     factionId: 'faction_scn', position: { x: 0, y: 0 }, worldRadius: 3500,
+    palette: SECTOR_PALETTE_CLASSES.core,
     // Tutorial home sector: NO hostile spawns (enemyDensity 0). A brand-new pilot must not be
     // hunted before learning the ropes; danger ramps up only in neighbouring sectors.
     trafficPerMin: 18, enemyDensity: 0, enemyLevel: [1, 2],
@@ -37,6 +57,7 @@
   {
     id: 'sector_ceres_belt', name: 'Ceres Belt', tier: 1, security: 0.72, charted: true,
     factionId: 'faction_dmc', position: { x: -3, y: 2 }, worldRadius: 4200,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 10, enemyDensity: 0.18, enemyLevel: [2, 4],
     neighbors: ['sector_helios_prime', 'sector_tethys_junction', 'sector_pallas_drift'],
     stations: [
@@ -57,6 +78,7 @@
   {
     id: 'sector_tethys_junction', name: 'Tethys Junction', tier: 1, security: 0.65, charted: true,
     factionId: 'faction_mts', position: { x: 3, y: 2 }, worldRadius: 4000,
+    palette: SECTOR_PALETTE_CLASSES.core,
     trafficPerMin: 14, enemyDensity: 0.20, enemyLevel: [2, 4],
     neighbors: ['sector_helios_prime', 'sector_ceres_belt', 'sector_vesta_forge', 'sector_io_reach'],
     stations: [
@@ -72,6 +94,7 @@
   {
     id: 'sector_vesta_forge', name: 'Vesta Forge', tier: 1, security: 0.60, charted: true,
     factionId: 'faction_dmc', position: { x: 0, y: 4 }, worldRadius: 4300,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 9, enemyDensity: 0.25, enemyLevel: [3, 5],
     neighbors: ['sector_helios_prime', 'sector_tethys_junction', 'sector_charon_expanse'],
     stations: [
@@ -89,6 +112,7 @@
   {
     id: 'sector_pallas_drift', name: 'Pallas Drift', tier: 2, security: 0.42, charted: true,
     factionId: 'faction_mts', position: { x: -5, y: 5 }, worldRadius: 4500,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 7, enemyDensity: 0.40, enemyLevel: [4, 7],
     neighbors: ['sector_ceres_belt', 'sector_io_reach', 'sector_sker_haven'],
     stations: [
@@ -109,6 +133,7 @@
   {
     id: 'sector_io_reach', name: 'Io Reach', tier: 2, security: 0.35, charted: true,
     factionId: 'faction_free', position: { x: 5, y: 5 }, worldRadius: 4600,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 5, enemyDensity: 0.50, enemyLevel: [5, 8],
     neighbors: ['sector_tethys_junction', 'sector_pallas_drift', 'sector_charon_expanse', 'sector_veil_nebula'],
     stations: [
@@ -132,6 +157,7 @@
   {
     id: 'sector_charon_expanse', name: 'Charon Expanse', tier: 2, security: 0.30, charted: true,
     factionId: 'faction_dmc', position: { x: 2, y: 7 }, worldRadius: 4800,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 4, enemyDensity: 0.50, enemyLevel: [5, 9],
     neighbors: ['sector_vesta_forge', 'sector_io_reach', 'sector_ashfall_reach'],
     stations: [
@@ -151,6 +177,7 @@
   {
     id: 'sector_sker_haven', name: 'Sker Haven', tier: 3, security: 0.08, charted: false,
     factionId: 'faction_reach', position: { x: -7, y: 8 }, worldRadius: 5000,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 0, enemyDensity: 0.70, enemyLevel: [7, 11],
     neighbors: ['sector_pallas_drift', 'sector_veil_nebula'],
     stations: [
@@ -169,6 +196,7 @@
   {
     id: 'sector_veil_nebula', name: 'Veil Nebula', tier: 3, security: 0.12, charted: false,
     factionId: 'faction_free', position: { x: 7, y: 9 }, worldRadius: 5200,
+    palette: SECTOR_PALETTE_CLASSES.anomaly,
     trafficPerMin: 0, enemyDensity: 0.65, enemyLevel: [8, 12],
     neighbors: ['sector_io_reach', 'sector_sker_haven'],
     wormholeTo: { sectorId: 'sector_ashfall_reach', gatedBy: 'tech:tech_long_range_survey' },
@@ -188,6 +216,7 @@
   {
     id: 'sector_ashfall_reach', name: 'Ashfall Reach', tier: 4, security: 0.05, charted: false,
     factionId: 'faction_vael', position: { x: 4, y: 11 }, worldRadius: 5500,
+    palette: SECTOR_PALETTE_CLASSES.anomaly,
     trafficPerMin: 0, enemyDensity: 0.80, enemyLevel: [10, 15],
     neighbors: ['sector_charon_expanse'],
     stations: [
diff --git a/src/render/renderer.js b/src/render/renderer.js
index def6420ff1bff2ac1c64dcc1add395e7851c4dbc..b8dd6ec63f224fbdab8fc20077f3cbf2d75c3ba2
--- a/src/render/renderer.js
+++ b/src/render/renderer.js
@@ -15,21 +15,11 @@
 import { installDiagnostics } from './diagnostics.js';
 import { createPlanetFactory } from './planetFactory.js';
 import { precompilePipelines } from './precompile.js';
-
-// Map a sector's danger/tier to a nebula backdrop tint so each region of the galaxy has its own
-// color signature. Core (safe, low tier) = clean blue; industrial mid-ring = rust/amber; lawless
-// frontier = blood-red; alien/endgame tier 4+ = violet. Returns a hex string or null (default).
-function sectorNebulaTint(sector) {
-  if (!sector) return null;
-  const tier = sector.tier || 0;
-  const sec = sector.security != null ? sector.security : 1;
-  const danger = (1 - sec) + tier * 0.15; // blended danger metric
-  if (tier >= 4) return '#5a1e8a';        // violet — alien / lawless endgame (Veil, Ashfall)
-  if (danger > 0.7) return '#8a1e1e';     // blood-red — dangerous frontier (Io Reach, Sker)
-  if (danger > 0.45) return '#8a4a1e';    // rust/amber — industrial mid-ring (Vesta, Pallas)
-  if (danger > 0.2) return '#1e4a8a';     // deep blue — settled belt (Ceres, Tethys)
-  return '#1e3a6a';                        // clean blue — safe core (Helios Prime)
-}
+import { SECTOR_PALETTE_CLASSES } from '../data/sectors.js';
+
+const SECTOR_PALETTE_LERP_SECONDS = 1.5;
+const SECTOR_LIGHT_INTENSITIES = { ambient: 0.85, key: 1.7, rim: 0.7, fill: 0.35 };
+const SECTOR_PALETTE_COLOR_FIELDS = ['ambient', 'key', 'rim', 'fill', 'fog'];
 
 // ---- contact shadow disc (module-level cache so one texture serves all entities) ----------------
 let _shadowTex = null;
@@ -178,14 +168,15 @@
     renderer.setClearColor(0x060912, 1);
     const drawSize = applyRendererSize(renderer, state);
 
-    const scene = new THREE.Scene();
-    // Thin fog for gentle depth cueing only — the old 0.00085 erased the entire backdrop, leaving a
-    // black void. This keeps the nebula + far stars visible while still fading the deep distance.
-    scene.fog = new THREE.FogExp2(0x0a1430, 0.00026);
-    scene.add(new THREE.AmbientLight(0x42506f, 0.85));
-    const key = new THREE.DirectionalLight(0xcfe2ff, 1.7); key.position.set(60, 140, 40); scene.add(key);
-    const rim = new THREE.DirectionalLight(0x6a5cff, 0.7); rim.position.set(-70, 50, -60); scene.add(rim);
-    const fill = new THREE.DirectionalLight(0x39d0ff, 0.35); fill.position.set(20, 30, 120); scene.add(fill);
+    const scene = new THREE.Scene();
+    const corePalette = SECTOR_PALETTE_CLASSES.core;
+    // Thin fog for gentle depth cueing only — the old 0.00085 erased the entire backdrop, leaving a
+    // black void. This keeps the nebula + far stars visible while still fading the deep distance.
+    scene.fog = new THREE.FogExp2(corePalette.fog, corePalette.fogDensity);
+    const ambient = new THREE.AmbientLight(corePalette.ambient, SECTOR_LIGHT_INTENSITIES.ambient); scene.add(ambient);
+    const key = new THREE.DirectionalLight(corePalette.key, SECTOR_LIGHT_INTENSITIES.key); key.position.set(60, 140, 40); scene.add(key);
+    const rim = new THREE.DirectionalLight(corePalette.rim, SECTOR_LIGHT_INTENSITIES.rim); rim.position.set(-70, 50, -60); scene.add(rim);
+    const fill = new THREE.DirectionalLight(corePalette.fill, SECTOR_LIGHT_INTENSITIES.fill); fill.position.set(20, 30, 120); scene.add(fill);
 
     // Real shadow maps (graphics spec Workstream G). Gated behind settings.video.shadows (default
     // true). The key light becomes a shadow caster with a tight frustum that follows the player so
@@ -210,7 +201,7 @@
     }
 
     const cam = createChaseCamera(state);
-    const starfield = createStarfield(scene);
+    const starfield = createStarfield(scene, { tint: corePalette.nebulaTint });
     const vf = createVisualFactory();
     // Hero-asset registry (spec §17.3): wraps the factory's build() so the bespoke player Kestrel is
     // intercepted before the procedural visualFactory. Narrow + failure-isolated — any throw falls
@@ -283,13 +274,16 @@
     // contact-sheet references and are replaced by procedural materials / inline SVG).
     { const i = new Image(); i.src = 'assets/cinematics/menu_background.jpg'; }
 
-    this.renderer = renderer; this.scene = scene; this.cam = cam; this.starfield = starfield; this.vf = vf;
-    this.authoredPartLibraryReady = preloadAuthoredPartLibrary(renderer).catch((error) => {
-      console.warn('[render] authored part library preload failed', error);
-      return null;
-    });
-    state.render.authoredPartLibraryReady = this.authoredPartLibraryReady;
-    this._keyLight = shadowsOn ? key : null; // referenced by _updateShadowFollow() each frame
+    this.renderer = renderer; this.scene = scene; this.cam = cam; this.starfield = starfield; this.vf = vf;
+    this.authoredPartLibraryReady = preloadAuthoredPartLibrary(renderer).catch((error) => {
+      console.warn('[render] authored part library preload failed', error);
+      return null;
+    });
+    state.render.authoredPartLibraryReady = this.authoredPartLibraryReady;
+    this._sectorPaletteRig = createSectorPaletteRig(scene, ambient, key, rim, fill);
+    this._sectorPaletteTarget = corePalette;
+    state.render.sectorPalette = corePalette;
+    this._keyLight = shadowsOn ? key : null; // referenced by _updateShadowFollow() each frame
     this._shadowSettingOn = shadowsOn;
     this._shadowReceiversDirty = true;
     this._shadowReceiverCount = 0;
@@ -410,20 +404,19 @@
     // already spawned by the time this fires (enterSector spawns before its sector:enter resolves),
     // so a blind clearAllMeshes(keepPlayer) used to wipe the station/asteroids and leave the player
     // alone in empty space. reconcileMeshes() removes only meshes for entities that are gone.
-    bus.on('sector:enter', ({ sector } = {}) => {
-      this._meshReconcileDirty = true;
-      if (cam.snapToPlayer) cam.snapToPlayer();
-      this._updatePlanetBodies(sector);
-      // Tint the nebula backdrop to the sector's mood so each region of the galaxy reads with its
-      // own color signature: clean-blue core → rust/amber industrial → blood-red frontier → violet
-      // alien/endgame. Drives the whole-frame atmosphere, reinforcing the core-to-frontier gradient.
-      if (this.starfield && this.starfield.setSectorTint) {
-        this.starfield.setSectorTint(sectorNebulaTint(sector));
-      }
+    bus.on('sector:enter', ({ sector } = {}) => {
+      this._meshReconcileDirty = true;
+      if (cam.snapToPlayer) cam.snapToPlayer();
+      this._updatePlanetBodies(sector);
+      this._beginSectorPaletteTransition(sector);
       this._updateHazardVisuals(sector);
       precompilePipelines(renderer, scene, cam.obj, { sector }).catch((error) => console.warn('[render] sector pipeline precompile failed', error));
     });
-    bus.on('save:loaded', () => { this._meshReconcileDirty = true; });
+    bus.on('jump:arrive', ({ sectorId } = {}) => {
+      const sector = sectorId && state.world && state.world.sectors ? state.world.sectors[sectorId] : null;
+      this._beginSectorPaletteTransition(sector);
+    });
+    bus.on('save:loaded', () => { this._meshReconcileDirty = true; });
 
     window.addEventListener('resize', () => this.onResize());
   },
@@ -640,7 +633,7 @@
     return tex;
   },
 
-  _updateHazardVisuals(sector) {
+  _updateHazardVisuals(sector) {
     // Dispose previous hazard visuals
     for (const obj of this._hazardVisuals) {
       this.scene.remove(obj);
@@ -701,10 +694,42 @@
         this.scene.add(ring);
         this._hazardVisuals.push(ring);
       }
-    }
-  },
-
-  prepareFrame(alpha, frameDt) {
+    }
+  },
+
+  _beginSectorPaletteTransition(sector) {
+    const rig = this._sectorPaletteRig;
+    if (!rig) return;
+    const palette = sector && sector.palette ? sector.palette : SECTOR_PALETTE_CLASSES.core;
+    this.state.render.sectorPalette = palette;
+    if (palette === this._sectorPaletteTarget) return;
+
+    this._sectorPaletteTarget = palette;
+    writeRigToSectorPaletteFrame(rig.start, rig);
+    writePaletteToSectorPaletteFrame(rig.target, palette);
+    rig.elapsed = 0;
+    rig.active = true;
+
+    if (this.starfield && this.starfield.setSectorTint) {
+      this.starfield.setSectorTint(palette.nebulaTint);
+    }
+  },
+
+  _updateSectorPaletteTransition(frameDt) {
+    const rig = this._sectorPaletteRig;
+    if (!rig || !rig.active) return;
+    const dt = Number.isFinite(frameDt) ? Math.max(0, frameDt) : 0;
+    rig.elapsed = Math.min(SECTOR_PALETTE_LERP_SECONDS, rig.elapsed + dt);
+    const rawT = SECTOR_PALETTE_LERP_SECONDS > 0 ? rig.elapsed / SECTOR_PALETTE_LERP_SECONDS : 1;
+    const t = rawT * rawT * (3 - 2 * rawT);
+    lerpSectorPaletteFrame(rig, rig.start, rig.target, t);
+    if (rawT >= 1) {
+      rig.active = false;
+      applySectorPaletteFrame(rig, rig.target);
+    }
+  },
+
+  prepareFrame(alpha, frameDt) {
     // While the GL context is lost, the renderer can't draw — skip all per-frame work until
     // webglcontextrestored rebuilds GPU resources. (cam.follow etc. would run against a dead
     // renderer; the context-restore handler re-applies everything that matters when it returns.)
@@ -716,9 +741,10 @@
     syncAuthoredInstancePools(this.scene, { camera: this.cam.obj });
     this.starfield.recenter(this.cam.obj.position);
     // Background-clock for distant animation (planet cloud drift, hero-star twinkle). Integrates real
-    // frame dt scaled by state.timeScale so the cosmos respects hit-stop/pause — a death freeze
-    // momentarily stills the clouds too, keeping the backdrop in the same time model as the action.
-    const ts = (this.state.timeScale != null) ? this.state.timeScale : 1;
+    // frame dt scaled by state.timeScale so the cosmos respects hit-stop/pause — a death freeze
+    // momentarily stills the clouds too, keeping the backdrop in the same time model as the action.
+    this._updateSectorPaletteTransition(frameDt);
+    const ts = (this.state.timeScale != null) ? this.state.timeScale : 1;
     this._bgTime = (this._bgTime || 0) + frameDt * ts;
     if (this.starfield.update) this.starfield.update(frameDt, this._bgTime);
     this._updatePlanetParallax();
@@ -899,13 +925,97 @@
   return renderer.getDrawingBufferSize(_drawSize);
 }
 
-function finiteInRange(value, min, max, fallback) {
-  const n = Number(value);
-  if (!Number.isFinite(n)) return fallback;
-  return Math.max(min, Math.min(max, n));
-}
-
-function disposeObject(obj) {
+function finiteInRange(value, min, max, fallback) {
+  const n = Number(value);
+  if (!Number.isFinite(n)) return fallback;
+  return Math.max(min, Math.min(max, n));
+}
+
+function createSectorPaletteRig(scene, ambientLight, keyLight, rimLight, fillLight) {
+  const rig = {
+    scene,
+    lights: { ambient: ambientLight, key: keyLight, rim: rimLight, fill: fillLight },
+    start: createSectorPaletteFrame(),
+    target: createSectorPaletteFrame(),
+    elapsed: 0,
+    active: false,
+  };
+  writeRigToSectorPaletteFrame(rig.start, rig);
+  writeRigToSectorPaletteFrame(rig.target, rig);
+  return rig;
+}
+
+function createSectorPaletteFrame() {
+  return {
+    colors: {
+      ambient: new THREE.Color(),
+      key: new THREE.Color(),
+      rim: new THREE.Color(),
+      fill: new THREE.Color(),
+      fog: new THREE.Color(),
+    },
+    intensities: { ambient: 0, key: 0, rim: 0, fill: 0 },
+    fogDensity: 0,
+  };
+}
+
+function writeRigToSectorPaletteFrame(frame, rig) {
+  frame.colors.ambient.copy(rig.lights.ambient.color);
+  frame.colors.key.copy(rig.lights.key.color);
+  frame.colors.rim.copy(rig.lights.rim.color);
+  frame.colors.fill.copy(rig.lights.fill.color);
+  frame.colors.fog.copy(rig.scene.fog.color);
+  frame.intensities.ambient = rig.lights.ambient.intensity;
+  frame.intensities.key = rig.lights.key.intensity;
+  frame.intensities.rim = rig.lights.rim.intensity;
+  frame.intensities.fill = rig.lights.fill.intensity;
+  frame.fogDensity = rig.scene.fog.density;
+}
+
+function writePaletteToSectorPaletteFrame(frame, palette) {
+  frame.colors.ambient.setHex(palette.ambient);
+  frame.colors.key.setHex(palette.key);
+  frame.colors.rim.setHex(palette.rim);
+  frame.colors.fill.setHex(palette.fill);
+  frame.colors.fog.setHex(palette.fog);
+  frame.intensities.ambient = SECTOR_LIGHT_INTENSITIES.ambient;
+  frame.intensities.key = SECTOR_LIGHT_INTENSITIES.key;
+  frame.intensities.rim = SECTOR_LIGHT_INTENSITIES.rim;
+  frame.intensities.fill = SECTOR_LIGHT_INTENSITIES.fill;
+  frame.fogDensity = palette.fogDensity;
+}
+
+function applySectorPaletteFrame(rig, frame) {
+  rig.lights.ambient.color.copy(frame.colors.ambient);
+  rig.lights.key.color.copy(frame.colors.key);
+  rig.lights.rim.color.copy(frame.colors.rim);
+  rig.lights.fill.color.copy(frame.colors.fill);
+  rig.scene.fog.color.copy(frame.colors.fog);
+  rig.lights.ambient.intensity = frame.intensities.ambient;
+  rig.lights.key.intensity = frame.intensities.key;
+  rig.lights.rim.intensity = frame.intensities.rim;
+  rig.lights.fill.intensity = frame.intensities.fill;
+  rig.scene.fog.density = frame.fogDensity;
+}
+
+function lerpSectorPaletteFrame(rig, start, target, t) {
+  rig.lights.ambient.color.lerpColors(start.colors.ambient, target.colors.ambient, t);
+  rig.lights.key.color.lerpColors(start.colors.key, target.colors.key, t);
+  rig.lights.rim.color.lerpColors(start.colors.rim, target.colors.rim, t);
+  rig.lights.fill.color.lerpColors(start.colors.fill, target.colors.fill, t);
+  rig.scene.fog.color.lerpColors(start.colors.fog, target.colors.fog, t);
+  rig.lights.ambient.intensity = lerp(start.intensities.ambient, target.intensities.ambient, t);
+  rig.lights.key.intensity = lerp(start.intensities.key, target.intensities.key, t);
+  rig.lights.rim.intensity = lerp(start.intensities.rim, target.intensities.rim, t);
+  rig.lights.fill.intensity = lerp(start.intensities.fill, target.intensities.fill, t);
+  rig.scene.fog.density = lerp(start.fogDensity, target.fogDensity, t);
+}
+
+function lerp(a, b, t) {
+  return a + (b - a) * t;
+}
+
+function disposeObject(obj) {
   obj.traverse((c) => {
     if (c.isBatchedMesh && typeof c.dispose === 'function') c.dispose();
     else if (c.geometry && !(c.userData && (c.userData.sharedContactShadow || c.userData.sharedShieldGeo))) c.geometry.dispose();
diff --git a/src/render/starfield.js b/src/render/starfield.js
index d76965c563ac0d99166bb382577d2f6eaa4a6d0f..aecb37608592e6ff981ddaf8fd6107d17a0632e6
--- a/src/render/starfield.js
+++ b/src/render/starfield.js
@@ -116,10 +116,18 @@
   return c;
 }
 
-// --- small color helpers for sector tinting (no deps) ---
-function hexToRgb(hex) {
-  const h = hex.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
-}
+// --- small color helpers for sector tinting (no deps) ---
+function normalizeTint(tint) {
+  if (tint == null) return null;
+  if (typeof tint === 'number' && Number.isFinite(tint)) {
+    return '#' + ((tint >>> 0) & 0xffffff).toString(16).padStart(6, '0');
+  }
+  if (typeof tint === 'string') return tint.startsWith('#') ? tint : '#' + tint.replace(/^0x/i, '');
+  return null;
+}
+function hexToRgb(hex) {
+  const h = hex.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
+}
 function rgbToHex(r, g, b) {
   const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
   return '#' + c(r) + c(g) + c(b);
@@ -176,11 +184,11 @@
   ctx.restore();
 }
 
-export function createStarfield(scene, opts = {}) {
-  const layers = [];
-  const sprite = makeStarSprite();
-  let bgTexture = null;
-  let currentTint = opts.tint || null;
+export function createStarfield(scene, opts = {}) {
+  const layers = [];
+  const sprite = makeStarSprite();
+  let bgTexture = null;
+  let currentTint = normalizeTint(opts.tint);
 
   // star tints (mostly cool white/blue with a few warm + teal accents)
   const TINTS = [0xffffff, 0xcfe0ff, 0x9fb6e0, 0xfff0d8, 0x8af0d6, 0xbfd2ff];
@@ -297,13 +305,14 @@
       // GR-7: slow-rotate the distant 3D planets so they read as real spinning worlds, not billboards.
       for (const p of distantPlanets) p.mesh.rotation.y += dt * p.spin;
     },
-    // Swap the nebula mood on sector enter — each region of the galaxy reads with its own color
-    // signature (core = clean blue, industrial = rust/amber, frontier = blood-red, alien = violet).
-    setSectorTint(tint) {
-      if (tint === currentTint) return;
-      currentTint = tint || null;
-      applyBackground(currentTint);
-    },
+    // Swap the nebula mood on sector enter — each region of the galaxy reads with its own color
+    // signature (core = clean blue, industrial = rust/amber, frontier = blood-red, alien = violet).
+    setSectorTint(tint) {
+      const nextTint = normalizeTint(tint);
+      if (nextTint === currentTint) return;
+      currentTint = nextTint;
+      applyBackground(currentTint);
+    },
     setWarp() { /* extended by vfx during jump */ },
   };
 }

diff --git a/package.json b/package.json
index 0897813b9c443f97ae9d2e8ae253e77f386705d9..a869414ec6dbceebe45b9b78abd72013201579da
--- a/package.json
+++ b/package.json
@@ -74,9 +74,10 @@
     "build:sg04:release-assets": "node scripts/build-sg04-release-assets.mjs",
     "build:bundle": "node scripts/build-bundle.mjs",
     "check:bundle": "node scripts/check-bundle.mjs",
-    "check:launch-policy": "node scripts/check-launch-policy.mjs",
-    "check:non-graphics": "node scripts/check-non-graphics-ci.mjs",
-    "check:assets:live": "node scripts/probe-authored-assets-live.mjs",
+    "check:launch-policy": "node scripts/check-launch-policy.mjs",
+    "check:non-graphics": "node scripts/check-non-graphics-ci.mjs",
+    "check:sector-palettes": "node scripts/check-sector-palettes.mjs",
+    "check:assets:live": "node scripts/probe-authored-assets-live.mjs",
     "check:perf:control": "node scripts/probe-raf-control.mjs --headed --strict --width 1830 --height 973 --warmup 1000 --duration 5000",
     "check:perf": "node scripts/probe-performance-profile.mjs --headed --strict --width 1830 --height 973 --warmup 2500 --duration 7000 --diagnostic-variants",
     "check:hitch-budget": "node scripts/check-hitch-budget.mjs",
diff --git a/scripts/check-sector-palettes.mjs b/scripts/check-sector-palettes.mjs
new file mode 100644
index 0000000000000000000000000000000000000000..04318569a6d4a787b3cf451b3de0e457574fa6f1
--- /dev/null
+++ b/scripts/check-sector-palettes.mjs
@@ -0,0 +1,81 @@
+import { SECTORS, SECTOR_PALETTE_CLASSES } from '../src/data/sectors.js';
+
+const REQUIRED_FIELDS = ['key', 'rim', 'fill', 'ambient', 'fog', 'fogDensity', 'nebulaTint', 'dust'];
+const COLOR_FIELDS = ['key', 'rim', 'fill', 'ambient', 'fog', 'nebulaTint', 'dust'];
+const CLASS_ENTRIES = Object.entries(SECTOR_PALETTE_CLASSES);
+const CORE_LUMINANCE = combinedLightLuminance(SECTOR_PALETTE_CLASSES.core);
+const MIN_LUMINANCE = CORE_LUMINANCE * 0.8;
+const MAX_LUMINANCE = CORE_LUMINANCE * 1.2;
+
+const issues = [];
+const usedClasses = new Set();
+
+for (const sector of SECTORS) {
+  const palette = sector.palette;
+  if (!palette || typeof palette !== 'object') {
+    issues.push(`${sector.id}: missing palette block`);
+    continue;
+  }
+
+  for (const field of REQUIRED_FIELDS) {
+    if (!(field in palette)) issues.push(`${sector.id}: palette missing ${field}`);
+  }
+  for (const field of COLOR_FIELDS) {
+    if (!isColorHex(palette[field])) issues.push(`${sector.id}: palette.${field} must be a 0x000000-0xffffff number`);
+  }
+  if (!Number.isFinite(palette.fogDensity) || palette.fogDensity <= 0) {
+    issues.push(`${sector.id}: palette.fogDensity must be a positive finite number`);
+  }
+
+  const className = classNameForPalette(palette);
+  if (!className) issues.push(`${sector.id}: palette does not match an authored class`);
+  else usedClasses.add(className);
+
+  const luminance = combinedLightLuminance(palette);
+  if (luminance < MIN_LUMINANCE || luminance > MAX_LUMINANCE) {
+    issues.push(`${sector.id}: ambient+fill luminance ${luminance.toFixed(4)} outside ${MIN_LUMINANCE.toFixed(4)}-${MAX_LUMINANCE.toFixed(4)}`);
+  }
+}
+
+for (const [className] of CLASS_ENTRIES) {
+  if (!usedClasses.has(className)) issues.push(`palette class unused: ${className}`);
+}
+
+if (issues.length) {
+  console.error(`Sector palette check failed (${issues.length} issue${issues.length === 1 ? '' : 's'}):`);
+  for (const issue of issues) console.error(`- ${issue}`);
+  process.exit(1);
+}
+
+console.log(`Sector palettes OK: ${SECTORS.length} sectors, classes used: ${[...usedClasses].sort().join(', ')}`);
+
+function classNameForPalette(palette) {
+  for (const [className, classPalette] of CLASS_ENTRIES) {
+    if (samePalette(palette, classPalette)) return className;
+  }
+  return null;
+}
+
+function samePalette(a, b) {
+  return REQUIRED_FIELDS.every((field) => a[field] === b[field]);
+}
+
+function isColorHex(value) {
+  return Number.isInteger(value) && value >= 0x000000 && value <= 0xffffff;
+}
+
+function combinedLightLuminance(palette) {
+  return relativeLuminance(palette.ambient) + relativeLuminance(palette.fill);
+}
+
+function relativeLuminance(hex) {
+  const r = linearRgb((hex >> 16) & 0xff);
+  const g = linearRgb((hex >> 8) & 0xff);
+  const b = linearRgb(hex & 0xff);
+  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
+}
+
+function linearRgb(channel) {
+  const c = channel / 255;
+  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
+}
diff --git a/src/data/sectors.js b/src/data/sectors.js
index 9c63f69479b241fc848258e3fe2161547793fa46..1814c409089f818b6ab4758b3f0cf8f8531f2452
--- a/src/data/sectors.js
+++ b/src/data/sectors.js
@@ -10,10 +10,30 @@
 export const HAZARD_TYPES  = ['dense_asteroid', 'nebula', 'radiation', 'debris'];
 export const POI_TYPES     = ['beacon', 'derelict', 'cache', 'colony', 'anomaly', 'wormhole', 'wreck'];
 
+export const SECTOR_PALETTE_CLASSES = {
+  core: {
+    key: 0xcfe2ff, rim: 0x6a5cff, fill: 0x39d0ff, ambient: 0x42506f,
+    fog: 0x0a1430, fogDensity: 0.00026, nebulaTint: 0x1e3a6a, dust: 0x7ea7c7,
+  },
+  belt: {
+    key: 0xffd59a, rim: 0xb56d2f, fill: 0xffb13d, ambient: 0x594a42,
+    fog: 0x2a160c, fogDensity: 0.00034, nebulaTint: 0x8a4a1e, dust: 0xc0793d,
+  },
+  fringe: {
+    key: 0xffb07a, rim: 0xff3f2d, fill: 0xffaa66, ambient: 0x584343,
+    fog: 0x2a0d0a, fogDensity: 0.00042, nebulaTint: 0x8a1e1e, dust: 0xc15032,
+  },
+  anomaly: {
+    key: 0xc8b6ff, rim: 0x54ffb0, fill: 0x4ddc92, ambient: 0x494760,
+    fog: 0x160d2c, fogDensity: 0.00036, nebulaTint: 0x5a1e8a, dust: 0x79ffc8,
+  },
+};
+
 export const SECTORS = [
   {
     id: 'sector_helios_prime', name: 'Helios Prime', tier: 0, security: 0.98, charted: true,
     factionId: 'faction_scn', position: { x: 0, y: 0 }, worldRadius: 3500,
+    palette: SECTOR_PALETTE_CLASSES.core,
     // Tutorial home sector: NO hostile spawns (enemyDensity 0). A brand-new pilot must not be
     // hunted before learning the ropes; danger ramps up only in neighbouring sectors.
     trafficPerMin: 18, enemyDensity: 0, enemyLevel: [1, 2],
@@ -37,6 +57,7 @@
   {
     id: 'sector_ceres_belt', name: 'Ceres Belt', tier: 1, security: 0.72, charted: true,
     factionId: 'faction_dmc', position: { x: -3, y: 2 }, worldRadius: 4200,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 10, enemyDensity: 0.18, enemyLevel: [2, 4],
     neighbors: ['sector_helios_prime', 'sector_tethys_junction', 'sector_pallas_drift'],
     stations: [
@@ -57,6 +78,7 @@
   {
     id: 'sector_tethys_junction', name: 'Tethys Junction', tier: 1, security: 0.65, charted: true,
     factionId: 'faction_mts', position: { x: 3, y: 2 }, worldRadius: 4000,
+    palette: SECTOR_PALETTE_CLASSES.core,
     trafficPerMin: 14, enemyDensity: 0.20, enemyLevel: [2, 4],
     neighbors: ['sector_helios_prime', 'sector_ceres_belt', 'sector_vesta_forge', 'sector_io_reach'],
     stations: [
@@ -72,6 +94,7 @@
   {
     id: 'sector_vesta_forge', name: 'Vesta Forge', tier: 1, security: 0.60, charted: true,
     factionId: 'faction_dmc', position: { x: 0, y: 4 }, worldRadius: 4300,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 9, enemyDensity: 0.25, enemyLevel: [3, 5],
     neighbors: ['sector_helios_prime', 'sector_tethys_junction', 'sector_charon_expanse'],
     stations: [
@@ -89,6 +112,7 @@
   {
     id: 'sector_pallas_drift', name: 'Pallas Drift', tier: 2, security: 0.42, charted: true,
     factionId: 'faction_mts', position: { x: -5, y: 5 }, worldRadius: 4500,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 7, enemyDensity: 0.40, enemyLevel: [4, 7],
     neighbors: ['sector_ceres_belt', 'sector_io_reach', 'sector_sker_haven'],
     stations: [
@@ -109,6 +133,7 @@
   {
     id: 'sector_io_reach', name: 'Io Reach', tier: 2, security: 0.35, charted: true,
     factionId: 'faction_free', position: { x: 5, y: 5 }, worldRadius: 4600,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 5, enemyDensity: 0.50, enemyLevel: [5, 8],
     neighbors: ['sector_tethys_junction', 'sector_pallas_drift', 'sector_charon_expanse', 'sector_veil_nebula'],
     stations: [
@@ -132,6 +157,7 @@
   {
     id: 'sector_charon_expanse', name: 'Charon Expanse', tier: 2, security: 0.30, charted: true,
     factionId: 'faction_dmc', position: { x: 2, y: 7 }, worldRadius: 4800,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 4, enemyDensity: 0.50, enemyLevel: [5, 9],
     neighbors: ['sector_vesta_forge', 'sector_io_reach', 'sector_ashfall_reach'],
     stations: [
@@ -151,6 +177,7 @@
   {
     id: 'sector_sker_haven', name: 'Sker Haven', tier: 3, security: 0.08, charted: false,
     factionId: 'faction_reach', position: { x: -7, y: 8 }, worldRadius: 5000,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 0, enemyDensity: 0.70, enemyLevel: [7, 11],
     neighbors: ['sector_pallas_drift', 'sector_veil_nebula'],
     stations: [
@@ -169,6 +196,7 @@
   {
     id: 'sector_veil_nebula', name: 'Veil Nebula', tier: 3, security: 0.12, charted: false,
     factionId: 'faction_free', position: { x: 7, y: 9 }, worldRadius: 5200,
+    palette: SECTOR_PALETTE_CLASSES.anomaly,
     trafficPerMin: 0, enemyDensity: 0.65, enemyLevel: [8, 12],
     neighbors: ['sector_io_reach', 'sector_sker_haven'],
     wormholeTo: { sectorId: 'sector_ashfall_reach', gatedBy: 'tech:tech_long_range_survey' },
@@ -188,6 +216,7 @@
   {
     id: 'sector_ashfall_reach', name: 'Ashfall Reach', tier: 4, security: 0.05, charted: false,
     factionId: 'faction_vael', position: { x: 4, y: 11 }, worldRadius: 5500,
+    palette: SECTOR_PALETTE_CLASSES.anomaly,
     trafficPerMin: 0, enemyDensity: 0.80, enemyLevel: [10, 15],
     neighbors: ['sector_charon_expanse'],
     stations: [
diff --git a/src/render/renderer.js b/src/render/renderer.js
index def6420ff1bff2ac1c64dcc1add395e7851c4dbc..b8dd6ec63f224fbdab8fc20077f3cbf2d75c3ba2
--- a/src/render/renderer.js
+++ b/src/render/renderer.js
@@ -15,21 +15,11 @@
 import { installDiagnostics } from './diagnostics.js';
 import { createPlanetFactory } from './planetFactory.js';
 import { precompilePipelines } from './precompile.js';
-
-// Map a sector's danger/tier to a nebula backdrop tint so each region of the galaxy has its own
-// color signature. Core (safe, low tier) = clean blue; industrial mid-ring = rust/amber; lawless
-// frontier = blood-red; alien/endgame tier 4+ = violet. Returns a hex string or null (default).
-function sectorNebulaTint(sector) {
-  if (!sector) return null;
-  const tier = sector.tier || 0;
-  const sec = sector.security != null ? sector.security : 1;
-  const danger = (1 - sec) + tier * 0.15; // blended danger metric
-  if (tier >= 4) return '#5a1e8a';        // violet — alien / lawless endgame (Veil, Ashfall)
-  if (danger > 0.7) return '#8a1e1e';     // blood-red — dangerous frontier (Io Reach, Sker)
-  if (danger > 0.45) return '#8a4a1e';    // rust/amber — industrial mid-ring (Vesta, Pallas)
-  if (danger > 0.2) return '#1e4a8a';     // deep blue — settled belt (Ceres, Tethys)
-  return '#1e3a6a';                        // clean blue — safe core (Helios Prime)
-}
+import { SECTOR_PALETTE_CLASSES } from '../data/sectors.js';
+
+const SECTOR_PALETTE_LERP_SECONDS = 1.5;
+const SECTOR_LIGHT_INTENSITIES = { ambient: 0.85, key: 1.7, rim: 0.7, fill: 0.35 };
+const SECTOR_PALETTE_COLOR_FIELDS = ['ambient', 'key', 'rim', 'fill', 'fog'];
 
 // ---- contact shadow disc (module-level cache so one texture serves all entities) ----------------
 let _shadowTex = null;
@@ -178,14 +168,15 @@
     renderer.setClearColor(0x060912, 1);
     const drawSize = applyRendererSize(renderer, state);
 
-    const scene = new THREE.Scene();
-    // Thin fog for gentle depth cueing only — the old 0.00085 erased the entire backdrop, leaving a
-    // black void. This keeps the nebula + far stars visible while still fading the deep distance.
-    scene.fog = new THREE.FogExp2(0x0a1430, 0.00026);
-    scene.add(new THREE.AmbientLight(0x42506f, 0.85));
-    const key = new THREE.DirectionalLight(0xcfe2ff, 1.7); key.position.set(60, 140, 40); scene.add(key);
-    const rim = new THREE.DirectionalLight(0x6a5cff, 0.7); rim.position.set(-70, 50, -60); scene.add(rim);
-    const fill = new THREE.DirectionalLight(0x39d0ff, 0.35); fill.position.set(20, 30, 120); scene.add(fill);
+    const scene = new THREE.Scene();
+    const corePalette = SECTOR_PALETTE_CLASSES.core;
+    // Thin fog for gentle depth cueing only — the old 0.00085 erased the entire backdrop, leaving a
+    // black void. This keeps the nebula + far stars visible while still fading the deep distance.
+    scene.fog = new THREE.FogExp2(corePalette.fog, corePalette.fogDensity);
+    const ambient = new THREE.AmbientLight(corePalette.ambient, SECTOR_LIGHT_INTENSITIES.ambient); scene.add(ambient);
+    const key = new THREE.DirectionalLight(corePalette.key, SECTOR_LIGHT_INTENSITIES.key); key.position.set(60, 140, 40); scene.add(key);
+    const rim = new THREE.DirectionalLight(corePalette.rim, SECTOR_LIGHT_INTENSITIES.rim); rim.position.set(-70, 50, -60); scene.add(rim);
+    const fill = new THREE.DirectionalLight(corePalette.fill, SECTOR_LIGHT_INTENSITIES.fill); fill.position.set(20, 30, 120); scene.add(fill);
 
     // Real shadow maps (graphics spec Workstream G). Gated behind settings.video.shadows (default
     // true). The key light becomes a shadow caster with a tight frustum that follows the player so
@@ -210,7 +201,7 @@
     }
 
     const cam = createChaseCamera(state);
-    const starfield = createStarfield(scene);
+    const starfield = createStarfield(scene, { tint: corePalette.nebulaTint });
     const vf = createVisualFactory();
     // Hero-asset registry (spec §17.3): wraps the factory's build() so the bespoke player Kestrel is
     // intercepted before the procedural visualFactory. Narrow + failure-isolated — any throw falls
@@ -283,13 +274,16 @@
     // contact-sheet references and are replaced by procedural materials / inline SVG).
     { const i = new Image(); i.src = 'assets/cinematics/menu_background.jpg'; }
 
-    this.renderer = renderer; this.scene = scene; this.cam = cam; this.starfield = starfield; this.vf = vf;
-    this.authoredPartLibraryReady = preloadAuthoredPartLibrary(renderer).catch((error) => {
-      console.warn('[render] authored part library preload failed', error);
-      return null;
-    });
-    state.render.authoredPartLibraryReady = this.authoredPartLibraryReady;
-    this._keyLight = shadowsOn ? key : null; // referenced by _updateShadowFollow() each frame
+    this.renderer = renderer; this.scene = scene; this.cam = cam; this.starfield = starfield; this.vf = vf;
+    this.authoredPartLibraryReady = preloadAuthoredPartLibrary(renderer).catch((error) => {
+      console.warn('[render] authored part library preload failed', error);
+      return null;
+    });
+    state.render.authoredPartLibraryReady = this.authoredPartLibraryReady;
+    this._sectorPaletteRig = createSectorPaletteRig(scene, ambient, key, rim, fill);
+    this._sectorPaletteTarget = corePalette;
+    state.render.sectorPalette = corePalette;
+    this._keyLight = shadowsOn ? key : null; // referenced by _updateShadowFollow() each frame
     this._shadowSettingOn = shadowsOn;
     this._shadowReceiversDirty = true;
     this._shadowReceiverCount = 0;
@@ -410,20 +404,19 @@
     // already spawned by the time this fires (enterSector spawns before its sector:enter resolves),
     // so a blind clearAllMeshes(keepPlayer) used to wipe the station/asteroids and leave the player
     // alone in empty space. reconcileMeshes() removes only meshes for entities that are gone.
-    bus.on('sector:enter', ({ sector } = {}) => {
-      this._meshReconcileDirty = true;
-      if (cam.snapToPlayer) cam.snapToPlayer();
-      this._updatePlanetBodies(sector);
-      // Tint the nebula backdrop to the sector's mood so each region of the galaxy reads with its
-      // own color signature: clean-blue core → rust/amber industrial → blood-red frontier → violet
-      // alien/endgame. Drives the whole-frame atmosphere, reinforcing the core-to-frontier gradient.
-      if (this.starfield && this.starfield.setSectorTint) {
-        this.starfield.setSectorTint(sectorNebulaTint(sector));
-      }
+    bus.on('sector:enter', ({ sector } = {}) => {
+      this._meshReconcileDirty = true;
+      if (cam.snapToPlayer) cam.snapToPlayer();
+      this._updatePlanetBodies(sector);
+      this._beginSectorPaletteTransition(sector);
       this._updateHazardVisuals(sector);
       precompilePipelines(renderer, scene, cam.obj, { sector }).catch((error) => console.warn('[render] sector pipeline precompile failed', error));
     });
-    bus.on('save:loaded', () => { this._meshReconcileDirty = true; });
+    bus.on('jump:arrive', ({ sectorId } = {}) => {
+      const sector = sectorId && state.world && state.world.sectors ? state.world.sectors[sectorId] : null;
+      this._beginSectorPaletteTransition(sector);
+    });
+    bus.on('save:loaded', () => { this._meshReconcileDirty = true; });
 
     window.addEventListener('resize', () => this.onResize());
   },
@@ -640,7 +633,7 @@
     return tex;
   },
 
-  _updateHazardVisuals(sector) {
+  _updateHazardVisuals(sector) {
     // Dispose previous hazard visuals
     for (const obj of this._hazardVisuals) {
       this.scene.remove(obj);
@@ -701,10 +694,42 @@
         this.scene.add(ring);
         this._hazardVisuals.push(ring);
       }
-    }
-  },
-
-  prepareFrame(alpha, frameDt) {
+    }
+  },
+
+  _beginSectorPaletteTransition(sector) {
+    const rig = this._sectorPaletteRig;
+    if (!rig) return;
+    const palette = sector && sector.palette ? sector.palette : SECTOR_PALETTE_CLASSES.core;
+    this.state.render.sectorPalette = palette;
+    if (palette === this._sectorPaletteTarget) return;
+
+    this._sectorPaletteTarget = palette;
+    writeRigToSectorPaletteFrame(rig.start, rig);
+    writePaletteToSectorPaletteFrame(rig.target, palette);
+    rig.elapsed = 0;
+    rig.active = true;
+
+    if (this.starfield && this.starfield.setSectorTint) {
+      this.starfield.setSectorTint(palette.nebulaTint);
+    }
+  },
+
+  _updateSectorPaletteTransition(frameDt) {
+    const rig = this._sectorPaletteRig;
+    if (!rig || !rig.active) return;
+    const dt = Number.isFinite(frameDt) ? Math.max(0, frameDt) : 0;
+    rig.elapsed = Math.min(SECTOR_PALETTE_LERP_SECONDS, rig.elapsed + dt);
+    const rawT = SECTOR_PALETTE_LERP_SECONDS > 0 ? rig.elapsed / SECTOR_PALETTE_LERP_SECONDS : 1;
+    const t = rawT * rawT * (3 - 2 * rawT);
+    lerpSectorPaletteFrame(rig, rig.start, rig.target, t);
+    if (rawT >= 1) {
+      rig.active = false;
+      applySectorPaletteFrame(rig, rig.target);
+    }
+  },
+
+  prepareFrame(alpha, frameDt) {
     // While the GL context is lost, the renderer can't draw — skip all per-frame work until
     // webglcontextrestored rebuilds GPU resources. (cam.follow etc. would run against a dead
     // renderer; the context-restore handler re-applies everything that matters when it returns.)
@@ -716,9 +741,10 @@
     syncAuthoredInstancePools(this.scene, { camera: this.cam.obj });
     this.starfield.recenter(this.cam.obj.position);
     // Background-clock for distant animation (planet cloud drift, hero-star twinkle). Integrates real
-    // frame dt scaled by state.timeScale so the cosmos respects hit-stop/pause — a death freeze
-    // momentarily stills the clouds too, keeping the backdrop in the same time model as the action.
-    const ts = (this.state.timeScale != null) ? this.state.timeScale : 1;
+    // frame dt scaled by state.timeScale so the cosmos respects hit-stop/pause — a death freeze
+    // momentarily stills the clouds too, keeping the backdrop in the same time model as the action.
+    this._updateSectorPaletteTransition(frameDt);
+    const ts = (this.state.timeScale != null) ? this.state.timeScale : 1;
     this._bgTime = (this._bgTime || 0) + frameDt * ts;
     if (this.starfield.update) this.starfield.update(frameDt, this._bgTime);
     this._updatePlanetParallax();
@@ -899,13 +925,97 @@
   return renderer.getDrawingBufferSize(_drawSize);
 }
 
-function finiteInRange(value, min, max, fallback) {
-  const n = Number(value);
-  if (!Number.isFinite(n)) return fallback;
-  return Math.max(min, Math.min(max, n));
-}
-
-function disposeObject(obj) {
+function finiteInRange(value, min, max, fallback) {
+  const n = Number(value);
+  if (!Number.isFinite(n)) return fallback;
+  return Math.max(min, Math.min(max, n));
+}
+
+function createSectorPaletteRig(scene, ambientLight, keyLight, rimLight, fillLight) {
+  const rig = {
+    scene,
+    lights: { ambient: ambientLight, key: keyLight, rim: rimLight, fill: fillLight },
+    start: createSectorPaletteFrame(),
+    target: createSectorPaletteFrame(),
+    elapsed: 0,
+    active: false,
+  };
+  writeRigToSectorPaletteFrame(rig.start, rig);
+  writeRigToSectorPaletteFrame(rig.target, rig);
+  return rig;
+}
+
+function createSectorPaletteFrame() {
+  return {
+    colors: {
+      ambient: new THREE.Color(),
+      key: new THREE.Color(),
+      rim: new THREE.Color(),
+      fill: new THREE.Color(),
+      fog: new THREE.Color(),
+    },
+    intensities: { ambient: 0, key: 0, rim: 0, fill: 0 },
+    fogDensity: 0,
+  };
+}
+
+function writeRigToSectorPaletteFrame(frame, rig) {
+  frame.colors.ambient.copy(rig.lights.ambient.color);
+  frame.colors.key.copy(rig.lights.key.color);
+  frame.colors.rim.copy(rig.lights.rim.color);
+  frame.colors.fill.copy(rig.lights.fill.color);
+  frame.colors.fog.copy(rig.scene.fog.color);
+  frame.intensities.ambient = rig.lights.ambient.intensity;
+  frame.intensities.key = rig.lights.key.intensity;
+  frame.intensities.rim = rig.lights.rim.intensity;
+  frame.intensities.fill = rig.lights.fill.intensity;
+  frame.fogDensity = rig.scene.fog.density;
+}
+
+function writePaletteToSectorPaletteFrame(frame, palette) {
+  frame.colors.ambient.setHex(palette.ambient);
+  frame.colors.key.setHex(palette.key);
+  frame.colors.rim.setHex(palette.rim);
+  frame.colors.fill.setHex(palette.fill);
+  frame.colors.fog.setHex(palette.fog);
+  frame.intensities.ambient = SECTOR_LIGHT_INTENSITIES.ambient;
+  frame.intensities.key = SECTOR_LIGHT_INTENSITIES.key;
+  frame.intensities.rim = SECTOR_LIGHT_INTENSITIES.rim;
+  frame.intensities.fill = SECTOR_LIGHT_INTENSITIES.fill;
+  frame.fogDensity = palette.fogDensity;
+}
+
+function applySectorPaletteFrame(rig, frame) {
+  rig.lights.ambient.color.copy(frame.colors.ambient);
+  rig.lights.key.color.copy(frame.colors.key);
+  rig.lights.rim.color.copy(frame.colors.rim);
+  rig.lights.fill.color.copy(frame.colors.fill);
+  rig.scene.fog.color.copy(frame.colors.fog);
+  rig.lights.ambient.intensity = frame.intensities.ambient;
+  rig.lights.key.intensity = frame.intensities.key;
+  rig.lights.rim.intensity = frame.intensities.rim;
+  rig.lights.fill.intensity = frame.intensities.fill;
+  rig.scene.fog.density = frame.fogDensity;
+}
+
+function lerpSectorPaletteFrame(rig, start, target, t) {
+  rig.lights.ambient.color.lerpColors(start.colors.ambient, target.colors.ambient, t);
+  rig.lights.key.color.lerpColors(start.colors.key, target.colors.key, t);
+  rig.lights.rim.color.lerpColors(start.colors.rim, target.colors.rim, t);
+  rig.lights.fill.color.lerpColors(start.colors.fill, target.colors.fill, t);
+  rig.scene.fog.color.lerpColors(start.colors.fog, target.colors.fog, t);
+  rig.lights.ambient.intensity = lerp(start.intensities.ambient, target.intensities.ambient, t);
+  rig.lights.key.intensity = lerp(start.intensities.key, target.intensities.key, t);
+  rig.lights.rim.intensity = lerp(start.intensities.rim, target.intensities.rim, t);
+  rig.lights.fill.intensity = lerp(start.intensities.fill, target.intensities.fill, t);
+  rig.scene.fog.density = lerp(start.fogDensity, target.fogDensity, t);
+}
+
+function lerp(a, b, t) {
+  return a + (b - a) * t;
+}
+
+function disposeObject(obj) {
   obj.traverse((c) => {
     if (c.isBatchedMesh && typeof c.dispose === 'function') c.dispose();
     else if (c.geometry && !(c.userData && (c.userData.sharedContactShadow || c.userData.sharedShieldGeo))) c.geometry.dispose();
diff --git a/src/render/starfield.js b/src/render/starfield.js
index d76965c563ac0d99166bb382577d2f6eaa4a6d0f..aecb37608592e6ff981ddaf8fd6107d17a0632e6
--- a/src/render/starfield.js
+++ b/src/render/starfield.js
@@ -116,10 +116,18 @@
   return c;
 }
 
-// --- small color helpers for sector tinting (no deps) ---
-function hexToRgb(hex) {
-  const h = hex.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
-}
+// --- small color helpers for sector tinting (no deps) ---
+function normalizeTint(tint) {
+  if (tint == null) return null;
+  if (typeof tint === 'number' && Number.isFinite(tint)) {
+    return '#' + ((tint >>> 0) & 0xffffff).toString(16).padStart(6, '0');
+  }
+  if (typeof tint === 'string') return tint.startsWith('#') ? tint : '#' + tint.replace(/^0x/i, '');
+  return null;
+}
+function hexToRgb(hex) {
+  const h = hex.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
+}
 function rgbToHex(r, g, b) {
   const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
   return '#' + c(r) + c(g) + c(b);
@@ -176,11 +184,11 @@
   ctx.restore();
 }
 
-export function createStarfield(scene, opts = {}) {
-  const layers = [];
-  const sprite = makeStarSprite();
-  let bgTexture = null;
-  let currentTint = opts.tint || null;
+export function createStarfield(scene, opts = {}) {
+  const layers = [];
+  const sprite = makeStarSprite();
+  let bgTexture = null;
+  let currentTint = normalizeTint(opts.tint);
 
   // star tints (mostly cool white/blue with a few warm + teal accents)
   const TINTS = [0xffffff, 0xcfe0ff, 0x9fb6e0, 0xfff0d8, 0x8af0d6, 0xbfd2ff];
@@ -297,13 +305,14 @@
       // GR-7: slow-rotate the distant 3D planets so they read as real spinning worlds, not billboards.
       for (const p of distantPlanets) p.mesh.rotation.y += dt * p.spin;
     },
-    // Swap the nebula mood on sector enter — each region of the galaxy reads with its own color
-    // signature (core = clean blue, industrial = rust/amber, frontier = blood-red, alien = violet).
-    setSectorTint(tint) {
-      if (tint === currentTint) return;
-      currentTint = tint || null;
-      applyBackground(currentTint);
-    },
+    // Swap the nebula mood on sector enter — each region of the galaxy reads with its own color
+    // signature (core = clean blue, industrial = rust/amber, frontier = blood-red, alien = violet).
+    setSectorTint(tint) {
+      const nextTint = normalizeTint(tint);
+      if (nextTint === currentTint) return;
+      currentTint = nextTint;
+      applyBackground(currentTint);
+    },
     setWarp() { /* extended by vfx during jump */ },
   };
 }

codex
Files are patched. I’m doing a quick syntax pass first because `check-data` won’t parse the render modules, then I’ll run the exact requested verification chain.
exec
"C:\\Users\\93rob\\AppData\\Local\\Microsoft\\WindowsApps\\pwsh.exe" -Command "node --check src\\render\\renderer.js" in C:\Users\93rob\Documents\GitHub\SpaceFace
exec
"C:\\Users\\93rob\\AppData\\Local\\Microsoft\\WindowsApps\\pwsh.exe" -Command "node --check src\\render\\starfield.js" in C:\Users\93rob\Documents\GitHub\SpaceFace
exec
"C:\\Users\\93rob\\AppData\\Local\\Microsoft\\WindowsApps\\pwsh.exe" -Command "node --check scripts\\check-sector-palettes.mjs" in C:\Users\93rob\Documents\GitHub\SpaceFace
 succeeded in 3736ms:
 succeeded in 3305ms:
exec
"C:\\Users\\93rob\\AppData\\Local\\Microsoft\\WindowsApps\\pwsh.exe" -Command "git diff -- src\\data\\sectors.js src\\render\\renderer.js src\\render\\starfield.js scripts\\check-sector-palettes.mjs package.json" in C:\Users\93rob\Documents\GitHub\SpaceFace
diff --git a/package.json b/package.json
index 0897813b9c443f97ae9d2e8ae253e77f386705d9..a869414ec6dbceebe45b9b78abd72013201579da
--- a/package.json
+++ b/package.json
@@ -74,9 +74,10 @@
     "build:sg04:release-assets": "node scripts/build-sg04-release-assets.mjs",
     "build:bundle": "node scripts/build-bundle.mjs",
     "check:bundle": "node scripts/check-bundle.mjs",
-    "check:launch-policy": "node scripts/check-launch-policy.mjs",
-    "check:non-graphics": "node scripts/check-non-graphics-ci.mjs",
-    "check:assets:live": "node scripts/probe-authored-assets-live.mjs",
+    "check:launch-policy": "node scripts/check-launch-policy.mjs",
+    "check:non-graphics": "node scripts/check-non-graphics-ci.mjs",
+    "check:sector-palettes": "node scripts/check-sector-palettes.mjs",
+    "check:assets:live": "node scripts/probe-authored-assets-live.mjs",
     "check:perf:control": "node scripts/probe-raf-control.mjs --headed --strict --width 1830 --height 973 --warmup 1000 --duration 5000",
     "check:perf": "node scripts/probe-performance-profile.mjs --headed --strict --width 1830 --height 973 --warmup 2500 --duration 7000 --diagnostic-variants",
     "check:hitch-budget": "node scripts/check-hitch-budget.mjs",
diff --git a/scripts/check-sector-palettes.mjs b/scripts/check-sector-palettes.mjs
new file mode 100644
index 0000000000000000000000000000000000000000..04318569a6d4a787b3cf451b3de0e457574fa6f1
--- /dev/null
+++ b/scripts/check-sector-palettes.mjs
@@ -0,0 +1,81 @@
+import { SECTORS, SECTOR_PALETTE_CLASSES } from '../src/data/sectors.js';
+
+const REQUIRED_FIELDS = ['key', 'rim', 'fill', 'ambient', 'fog', 'fogDensity', 'nebulaTint', 'dust'];
+const COLOR_FIELDS = ['key', 'rim', 'fill', 'ambient', 'fog', 'nebulaTint', 'dust'];
+const CLASS_ENTRIES = Object.entries(SECTOR_PALETTE_CLASSES);
+const CORE_LUMINANCE = combinedLightLuminance(SECTOR_PALETTE_CLASSES.core);
+const MIN_LUMINANCE = CORE_LUMINANCE * 0.8;
+const MAX_LUMINANCE = CORE_LUMINANCE * 1.2;
+
+const issues = [];
+const usedClasses = new Set();
+
+for (const sector of SECTORS) {
+  const palette = sector.palette;
+  if (!palette || typeof palette !== 'object') {
+    issues.push(`${sector.id}: missing palette block`);
+    continue;
+  }
+
+  for (const field of REQUIRED_FIELDS) {
+    if (!(field in palette)) issues.push(`${sector.id}: palette missing ${field}`);
+  }
+  for (const field of COLOR_FIELDS) {
+    if (!isColorHex(palette[field])) issues.push(`${sector.id}: palette.${field} must be a 0x000000-0xffffff number`);
+  }
+  if (!Number.isFinite(palette.fogDensity) || palette.fogDensity <= 0) {
+    issues.push(`${sector.id}: palette.fogDensity must be a positive finite number`);
+  }
+
+  const className = classNameForPalette(palette);
+  if (!className) issues.push(`${sector.id}: palette does not match an authored class`);
+  else usedClasses.add(className);
+
+  const luminance = combinedLightLuminance(palette);
+  if (luminance < MIN_LUMINANCE || luminance > MAX_LUMINANCE) {
+    issues.push(`${sector.id}: ambient+fill luminance ${luminance.toFixed(4)} outside ${MIN_LUMINANCE.toFixed(4)}-${MAX_LUMINANCE.toFixed(4)}`);
+  }
+}
+
+for (const [className] of CLASS_ENTRIES) {
+  if (!usedClasses.has(className)) issues.push(`palette class unused: ${className}`);
+}
+
+if (issues.length) {
+  console.error(`Sector palette check failed (${issues.length} issue${issues.length === 1 ? '' : 's'}):`);
+  for (const issue of issues) console.error(`- ${issue}`);
+  process.exit(1);
+}
+
+console.log(`Sector palettes OK: ${SECTORS.length} sectors, classes used: ${[...usedClasses].sort().join(', ')}`);
+
+function classNameForPalette(palette) {
+  for (const [className, classPalette] of CLASS_ENTRIES) {
+    if (samePalette(palette, classPalette)) return className;
+  }
+  return null;
+}
+
+function samePalette(a, b) {
+  return REQUIRED_FIELDS.every((field) => a[field] === b[field]);
+}
+
+function isColorHex(value) {
+  return Number.isInteger(value) && value >= 0x000000 && value <= 0xffffff;
+}
+
+function combinedLightLuminance(palette) {
+  return relativeLuminance(palette.ambient) + relativeLuminance(palette.fill);
+}
+
+function relativeLuminance(hex) {
+  const r = linearRgb((hex >> 16) & 0xff);
+  const g = linearRgb((hex >> 8) & 0xff);
+  const b = linearRgb(hex & 0xff);
+  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
+}
+
+function linearRgb(channel) {
+  const c = channel / 255;
+  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
+}
diff --git a/src/data/sectors.js b/src/data/sectors.js
index 9c63f69479b241fc848258e3fe2161547793fa46..1814c409089f818b6ab4758b3f0cf8f8531f2452
--- a/src/data/sectors.js
+++ b/src/data/sectors.js
@@ -10,10 +10,30 @@
 export const HAZARD_TYPES  = ['dense_asteroid', 'nebula', 'radiation', 'debris'];
 export const POI_TYPES     = ['beacon', 'derelict', 'cache', 'colony', 'anomaly', 'wormhole', 'wreck'];
 
+export const SECTOR_PALETTE_CLASSES = {
+  core: {
+    key: 0xcfe2ff, rim: 0x6a5cff, fill: 0x39d0ff, ambient: 0x42506f,
+    fog: 0x0a1430, fogDensity: 0.00026, nebulaTint: 0x1e3a6a, dust: 0x7ea7c7,
+  },
+  belt: {
+    key: 0xffd59a, rim: 0xb56d2f, fill: 0xffb13d, ambient: 0x594a42,
+    fog: 0x2a160c, fogDensity: 0.00034, nebulaTint: 0x8a4a1e, dust: 0xc0793d,
+  },
+  fringe: {
+    key: 0xffb07a, rim: 0xff3f2d, fill: 0xffaa66, ambient: 0x584343,
+    fog: 0x2a0d0a, fogDensity: 0.00042, nebulaTint: 0x8a1e1e, dust: 0xc15032,
+  },
+  anomaly: {
+    key: 0xc8b6ff, rim: 0x54ffb0, fill: 0x4ddc92, ambient: 0x494760,
+    fog: 0x160d2c, fogDensity: 0.00036, nebulaTint: 0x5a1e8a, dust: 0x79ffc8,
+  },
+};
+
 export const SECTORS = [
   {
     id: 'sector_helios_prime', name: 'Helios Prime', tier: 0, security: 0.98, charted: true,
     factionId: 'faction_scn', position: { x: 0, y: 0 }, worldRadius: 3500,
+    palette: SECTOR_PALETTE_CLASSES.core,
     // Tutorial home sector: NO hostile spawns (enemyDensity 0). A brand-new pilot must not be
     // hunted before learning the ropes; danger ramps up only in neighbouring sectors.
     trafficPerMin: 18, enemyDensity: 0, enemyLevel: [1, 2],
@@ -37,6 +57,7 @@
   {
     id: 'sector_ceres_belt', name: 'Ceres Belt', tier: 1, security: 0.72, charted: true,
     factionId: 'faction_dmc', position: { x: -3, y: 2 }, worldRadius: 4200,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 10, enemyDensity: 0.18, enemyLevel: [2, 4],
     neighbors: ['sector_helios_prime', 'sector_tethys_junction', 'sector_pallas_drift'],
     stations: [
@@ -57,6 +78,7 @@
   {
     id: 'sector_tethys_junction', name: 'Tethys Junction', tier: 1, security: 0.65, charted: true,
     factionId: 'faction_mts', position: { x: 3, y: 2 }, worldRadius: 4000,
+    palette: SECTOR_PALETTE_CLASSES.core,
     trafficPerMin: 14, enemyDensity: 0.20, enemyLevel: [2, 4],
     neighbors: ['sector_helios_prime', 'sector_ceres_belt', 'sector_vesta_forge', 'sector_io_reach'],
     stations: [
@@ -72,6 +94,7 @@
   {
     id: 'sector_vesta_forge', name: 'Vesta Forge', tier: 1, security: 0.60, charted: true,
     factionId: 'faction_dmc', position: { x: 0, y: 4 }, worldRadius: 4300,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 9, enemyDensity: 0.25, enemyLevel: [3, 5],
     neighbors: ['sector_helios_prime', 'sector_tethys_junction', 'sector_charon_expanse'],
     stations: [
@@ -89,6 +112,7 @@
   {
     id: 'sector_pallas_drift', name: 'Pallas Drift', tier: 2, security: 0.42, charted: true,
     factionId: 'faction_mts', position: { x: -5, y: 5 }, worldRadius: 4500,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 7, enemyDensity: 0.40, enemyLevel: [4, 7],
     neighbors: ['sector_ceres_belt', 'sector_io_reach', 'sector_sker_haven'],
     stations: [
@@ -109,6 +133,7 @@
   {
     id: 'sector_io_reach', name: 'Io Reach', tier: 2, security: 0.35, charted: true,
     factionId: 'faction_free', position: { x: 5, y: 5 }, worldRadius: 4600,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 5, enemyDensity: 0.50, enemyLevel: [5, 8],
     neighbors: ['sector_tethys_junction', 'sector_pallas_drift', 'sector_charon_expanse', 'sector_veil_nebula'],
     stations: [
@@ -132,6 +157,7 @@
   {
     id: 'sector_charon_expanse', name: 'Charon Expanse', tier: 2, security: 0.30, charted: true,
     factionId: 'faction_dmc', position: { x: 2, y: 7 }, worldRadius: 4800,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 4, enemyDensity: 0.50, enemyLevel: [5, 9],
     neighbors: ['sector_vesta_forge', 'sector_io_reach', 'sector_ashfall_reach'],
     stations: [
@@ -151,6 +177,7 @@
   {
     id: 'sector_sker_haven', name: 'Sker Haven', tier: 3, security: 0.08, charted: false,
     factionId: 'faction_reach', position: { x: -7, y: 8 }, worldRadius: 5000,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 0, enemyDensity: 0.70, enemyLevel: [7, 11],
     neighbors: ['sector_pallas_drift', 'sector_veil_nebula'],
     stations: [
@@ -169,6 +196,7 @@
   {
     id: 'sector_veil_nebula', name: 'Veil Nebula', tier: 3, security: 0.12, charted: false,
     factionId: 'faction_free', position: { x: 7, y: 9 }, worldRadius: 5200,
+    palette: SECTOR_PALETTE_CLASSES.anomaly,
     trafficPerMin: 0, enemyDensity: 0.65, enemyLevel: [8, 12],
     neighbors: ['sector_io_reach', 'sector_sker_haven'],
     wormholeTo: { sectorId: 'sector_ashfall_reach', gatedBy: 'tech:tech_long_range_survey' },
@@ -188,6 +216,7 @@
   {
     id: 'sector_ashfall_reach', name: 'Ashfall Reach', tier: 4, security: 0.05, charted: false,
     factionId: 'faction_vael', position: { x: 4, y: 11 }, worldRadius: 5500,
+    palette: SECTOR_PALETTE_CLASSES.anomaly,
     trafficPerMin: 0, enemyDensity: 0.80, enemyLevel: [10, 15],
     neighbors: ['sector_charon_expanse'],
     stations: [
diff --git a/src/render/renderer.js b/src/render/renderer.js
index def6420ff1bff2ac1c64dcc1add395e7851c4dbc..b8dd6ec63f224fbdab8fc20077f3cbf2d75c3ba2
--- a/src/render/renderer.js
+++ b/src/render/renderer.js
@@ -15,21 +15,11 @@
 import { installDiagnostics } from './diagnostics.js';
 import { createPlanetFactory } from './planetFactory.js';
 import { precompilePipelines } from './precompile.js';
-
-// Map a sector's danger/tier to a nebula backdrop tint so each region of the galaxy has its own
-// color signature. Core (safe, low tier) = clean blue; industrial mid-ring = rust/amber; lawless
-// frontier = blood-red; alien/endgame tier 4+ = violet. Returns a hex string or null (default).
-function sectorNebulaTint(sector) {
-  if (!sector) return null;
-  const tier = sector.tier || 0;
-  const sec = sector.security != null ? sector.security : 1;
-  const danger = (1 - sec) + tier * 0.15; // blended danger metric
-  if (tier >= 4) return '#5a1e8a';        // violet — alien / lawless endgame (Veil, Ashfall)
-  if (danger > 0.7) return '#8a1e1e';     // blood-red — dangerous frontier (Io Reach, Sker)
-  if (danger > 0.45) return '#8a4a1e';    // rust/amber — industrial mid-ring (Vesta, Pallas)
-  if (danger > 0.2) return '#1e4a8a';     // deep blue — settled belt (Ceres, Tethys)
-  return '#1e3a6a';                        // clean blue — safe core (Helios Prime)
-}
+import { SECTOR_PALETTE_CLASSES } from '../data/sectors.js';
+
+const SECTOR_PALETTE_LERP_SECONDS = 1.5;
+const SECTOR_LIGHT_INTENSITIES = { ambient: 0.85, key: 1.7, rim: 0.7, fill: 0.35 };
+const SECTOR_PALETTE_COLOR_FIELDS = ['ambient', 'key', 'rim', 'fill', 'fog'];
 
 // ---- contact shadow disc (module-level cache so one texture serves all entities) ----------------
 let _shadowTex = null;
@@ -178,14 +168,15 @@
     renderer.setClearColor(0x060912, 1);
     const drawSize = applyRendererSize(renderer, state);
 
-    const scene = new THREE.Scene();
-    // Thin fog for gentle depth cueing only — the old 0.00085 erased the entire backdrop, leaving a
-    // black void. This keeps the nebula + far stars visible while still fading the deep distance.
-    scene.fog = new THREE.FogExp2(0x0a1430, 0.00026);
-    scene.add(new THREE.AmbientLight(0x42506f, 0.85));
-    const key = new THREE.DirectionalLight(0xcfe2ff, 1.7); key.position.set(60, 140, 40); scene.add(key);
-    const rim = new THREE.DirectionalLight(0x6a5cff, 0.7); rim.position.set(-70, 50, -60); scene.add(rim);
-    const fill = new THREE.DirectionalLight(0x39d0ff, 0.35); fill.position.set(20, 30, 120); scene.add(fill);
+    const scene = new THREE.Scene();
+    const corePalette = SECTOR_PALETTE_CLASSES.core;
+    // Thin fog for gentle depth cueing only — the old 0.00085 erased the entire backdrop, leaving a
+    // black void. This keeps the nebula + far stars visible while still fading the deep distance.
+    scene.fog = new THREE.FogExp2(corePalette.fog, corePalette.fogDensity);
+    const ambient = new THREE.AmbientLight(corePalette.ambient, SECTOR_LIGHT_INTENSITIES.ambient); scene.add(ambient);
+    const key = new THREE.DirectionalLight(corePalette.key, SECTOR_LIGHT_INTENSITIES.key); key.position.set(60, 140, 40); scene.add(key);
+    const rim = new THREE.DirectionalLight(corePalette.rim, SECTOR_LIGHT_INTENSITIES.rim); rim.position.set(-70, 50, -60); scene.add(rim);
+    const fill = new THREE.DirectionalLight(corePalette.fill, SECTOR_LIGHT_INTENSITIES.fill); fill.position.set(20, 30, 120); scene.add(fill);
 
     // Real shadow maps (graphics spec Workstream G). Gated behind settings.video.shadows (default
     // true). The key light becomes a shadow caster with a tight frustum that follows the player so
@@ -210,7 +201,7 @@
     }
 
     const cam = createChaseCamera(state);
-    const starfield = createStarfield(scene);
+    const starfield = createStarfield(scene, { tint: corePalette.nebulaTint });
     const vf = createVisualFactory();
     // Hero-asset registry (spec §17.3): wraps the factory's build() so the bespoke player Kestrel is
     // intercepted before the procedural visualFactory. Narrow + failure-isolated — any throw falls
@@ -283,13 +274,16 @@
     // contact-sheet references and are replaced by procedural materials / inline SVG).
     { const i = new Image(); i.src = 'assets/cinematics/menu_background.jpg'; }
 
-    this.renderer = renderer; this.scene = scene; this.cam = cam; this.starfield = starfield; this.vf = vf;
-    this.authoredPartLibraryReady = preloadAuthoredPartLibrary(renderer).catch((error) => {
-      console.warn('[render] authored part library preload failed', error);
-      return null;
-    });
-    state.render.authoredPartLibraryReady = this.authoredPartLibraryReady;
-    this._keyLight = shadowsOn ? key : null; // referenced by _updateShadowFollow() each frame
+    this.renderer = renderer; this.scene = scene; this.cam = cam; this.starfield = starfield; this.vf = vf;
+    this.authoredPartLibraryReady = preloadAuthoredPartLibrary(renderer).catch((error) => {
+      console.warn('[render] authored part library preload failed', error);
+      return null;
+    });
+    state.render.authoredPartLibraryReady = this.authoredPartLibraryReady;
+    this._sectorPaletteRig = createSectorPaletteRig(scene, ambient, key, rim, fill);
+    this._sectorPaletteTarget = corePalette;
+    state.render.sectorPalette = corePalette;
+    this._keyLight = shadowsOn ? key : null; // referenced by _updateShadowFollow() each frame
     this._shadowSettingOn = shadowsOn;
     this._shadowReceiversDirty = true;
     this._shadowReceiverCount = 0;
@@ -410,20 +404,19 @@
     // already spawned by the time this fires (enterSector spawns before its sector:enter resolves),
     // so a blind clearAllMeshes(keepPlayer) used to wipe the station/asteroids and leave the player
     // alone in empty space. reconcileMeshes() removes only meshes for entities that are gone.
-    bus.on('sector:enter', ({ sector } = {}) => {
-      this._meshReconcileDirty = true;
-      if (cam.snapToPlayer) cam.snapToPlayer();
-      this._updatePlanetBodies(sector);
-      // Tint the nebula backdrop to the sector's mood so each region of the galaxy reads with its
-      // own color signature: clean-blue core → rust/amber industrial → blood-red frontier → violet
-      // alien/endgame. Drives the whole-frame atmosphere, reinforcing the core-to-frontier gradient.
-      if (this.starfield && this.starfield.setSectorTint) {
-        this.starfield.setSectorTint(sectorNebulaTint(sector));
-      }
+    bus.on('sector:enter', ({ sector } = {}) => {
+      this._meshReconcileDirty = true;
+      if (cam.snapToPlayer) cam.snapToPlayer();
+      this._updatePlanetBodies(sector);
+      this._beginSectorPaletteTransition(sector);
       this._updateHazardVisuals(sector);
       precompilePipelines(renderer, scene, cam.obj, { sector }).catch((error) => console.warn('[render] sector pipeline precompile failed', error));
     });
-    bus.on('save:loaded', () => { this._meshReconcileDirty = true; });
+    bus.on('jump:arrive', ({ sectorId } = {}) => {
+      const sector = sectorId && state.world && state.world.sectors ? state.world.sectors[sectorId] : null;
+      this._beginSectorPaletteTransition(sector);
+    });
+    bus.on('save:loaded', () => { this._meshReconcileDirty = true; });
 
     window.addEventListener('resize', () => this.onResize());
   },
@@ -640,7 +633,7 @@
     return tex;
   },
 
-  _updateHazardVisuals(sector) {
+  _updateHazardVisuals(sector) {
     // Dispose previous hazard visuals
     for (const obj of this._hazardVisuals) {
       this.scene.remove(obj);
@@ -701,10 +694,42 @@
         this.scene.add(ring);
         this._hazardVisuals.push(ring);
       }
-    }
-  },
-
-  prepareFrame(alpha, frameDt) {
+    }
+  },
+
+  _beginSectorPaletteTransition(sector) {
+    const rig = this._sectorPaletteRig;
+    if (!rig) return;
+    const palette = sector && sector.palette ? sector.palette : SECTOR_PALETTE_CLASSES.core;
+    this.state.render.sectorPalette = palette;
+    if (palette === this._sectorPaletteTarget) return;
+
+    this._sectorPaletteTarget = palette;
+    writeRigToSectorPaletteFrame(rig.start, rig);
+    writePaletteToSectorPaletteFrame(rig.target, palette);
+    rig.elapsed = 0;
+    rig.active = true;
+
+    if (this.starfield && this.starfield.setSectorTint) {
+      this.starfield.setSectorTint(palette.nebulaTint);
+    }
+  },
+
+  _updateSectorPaletteTransition(frameDt) {
+    const rig = this._sectorPaletteRig;
+    if (!rig || !rig.active) return;
+    const dt = Number.isFinite(frameDt) ? Math.max(0, frameDt) : 0;
+    rig.elapsed = Math.min(SECTOR_PALETTE_LERP_SECONDS, rig.elapsed + dt);
+    const rawT = SECTOR_PALETTE_LERP_SECONDS > 0 ? rig.elapsed / SECTOR_PALETTE_LERP_SECONDS : 1;
+    const t = rawT * rawT * (3 - 2 * rawT);
+    lerpSectorPaletteFrame(rig, rig.start, rig.target, t);
+    if (rawT >= 1) {
+      rig.active = false;
+      applySectorPaletteFrame(rig, rig.target);
+    }
+  },
+
+  prepareFrame(alpha, frameDt) {
     // While the GL context is lost, the renderer can't draw — skip all per-frame work until
     // webglcontextrestored rebuilds GPU resources. (cam.follow etc. would run against a dead
     // renderer; the context-restore handler re-applies everything that matters when it returns.)
@@ -716,9 +741,10 @@
     syncAuthoredInstancePools(this.scene, { camera: this.cam.obj });
     this.starfield.recenter(this.cam.obj.position);
     // Background-clock for distant animation (planet cloud drift, hero-star twinkle). Integrates real
-    // frame dt scaled by state.timeScale so the cosmos respects hit-stop/pause — a death freeze
-    // momentarily stills the clouds too, keeping the backdrop in the same time model as the action.
-    const ts = (this.state.timeScale != null) ? this.state.timeScale : 1;
+    // frame dt scaled by state.timeScale so the cosmos respects hit-stop/pause — a death freeze
+    // momentarily stills the clouds too, keeping the backdrop in the same time model as the action.
+    this._updateSectorPaletteTransition(frameDt);
+    const ts = (this.state.timeScale != null) ? this.state.timeScale : 1;
     this._bgTime = (this._bgTime || 0) + frameDt * ts;
     if (this.starfield.update) this.starfield.update(frameDt, this._bgTime);
     this._updatePlanetParallax();
@@ -899,13 +925,97 @@
   return renderer.getDrawingBufferSize(_drawSize);
 }
 
-function finiteInRange(value, min, max, fallback) {
-  const n = Number(value);
-  if (!Number.isFinite(n)) return fallback;
-  return Math.max(min, Math.min(max, n));
-}
-
-function disposeObject(obj) {
+function finiteInRange(value, min, max, fallback) {
+  const n = Number(value);
+  if (!Number.isFinite(n)) return fallback;
+  return Math.max(min, Math.min(max, n));
+}
+
+function createSectorPaletteRig(scene, ambientLight, keyLight, rimLight, fillLight) {
+  const rig = {
+    scene,
+    lights: { ambient: ambientLight, key: keyLight, rim: rimLight, fill: fillLight },
+    start: createSectorPaletteFrame(),
+    target: createSectorPaletteFrame(),
+    elapsed: 0,
+    active: false,
+  };
+  writeRigToSectorPaletteFrame(rig.start, rig);
+  writeRigToSectorPaletteFrame(rig.target, rig);
+  return rig;
+}
+
+function createSectorPaletteFrame() {
+  return {
+    colors: {
+      ambient: new THREE.Color(),
+      key: new THREE.Color(),
+      rim: new THREE.Color(),
+      fill: new THREE.Color(),
+      fog: new THREE.Color(),
+    },
+    intensities: { ambient: 0, key: 0, rim: 0, fill: 0 },
+    fogDensity: 0,
+  };
+}
+
+function writeRigToSectorPaletteFrame(frame, rig) {
+  frame.colors.ambient.copy(rig.lights.ambient.color);
+  frame.colors.key.copy(rig.lights.key.color);
+  frame.colors.rim.copy(rig.lights.rim.color);
+  frame.colors.fill.copy(rig.lights.fill.color);
+  frame.colors.fog.copy(rig.scene.fog.color);
+  frame.intensities.ambient = rig.lights.ambient.intensity;
+  frame.intensities.key = rig.lights.key.intensity;
+  frame.intensities.rim = rig.lights.rim.intensity;
+  frame.intensities.fill = rig.lights.fill.intensity;
+  frame.fogDensity = rig.scene.fog.density;
+}
+
+function writePaletteToSectorPaletteFrame(frame, palette) {
+  frame.colors.ambient.setHex(palette.ambient);
+  frame.colors.key.setHex(palette.key);
+  frame.colors.rim.setHex(palette.rim);
+  frame.colors.fill.setHex(palette.fill);
+  frame.colors.fog.setHex(palette.fog);
+  frame.intensities.ambient = SECTOR_LIGHT_INTENSITIES.ambient;
+  frame.intensities.key = SECTOR_LIGHT_INTENSITIES.key;
+  frame.intensities.rim = SECTOR_LIGHT_INTENSITIES.rim;
+  frame.intensities.fill = SECTOR_LIGHT_INTENSITIES.fill;
+  frame.fogDensity = palette.fogDensity;
+}
+
+function applySectorPaletteFrame(rig, frame) {
+  rig.lights.ambient.color.copy(frame.colors.ambient);
+  rig.lights.key.color.copy(frame.colors.key);
+  rig.lights.rim.color.copy(frame.colors.rim);
+  rig.lights.fill.color.copy(frame.colors.fill);
+  rig.scene.fog.color.copy(frame.colors.fog);
+  rig.lights.ambient.intensity = frame.intensities.ambient;
+  rig.lights.key.intensity = frame.intensities.key;
+  rig.lights.rim.intensity = frame.intensities.rim;
+  rig.lights.fill.intensity = frame.intensities.fill;
+  rig.scene.fog.density = frame.fogDensity;
+}
+
+function lerpSectorPaletteFrame(rig, start, target, t) {
+  rig.lights.ambient.color.lerpColors(start.colors.ambient, target.colors.ambient, t);
+  rig.lights.key.color.lerpColors(start.colors.key, target.colors.key, t);
+  rig.lights.rim.color.lerpColors(start.colors.rim, target.colors.rim, t);
+  rig.lights.fill.color.lerpColors(start.colors.fill, target.colors.fill, t);
+  rig.scene.fog.color.lerpColors(start.colors.fog, target.colors.fog, t);
+  rig.lights.ambient.intensity = lerp(start.intensities.ambient, target.intensities.ambient, t);
+  rig.lights.key.intensity = lerp(start.intensities.key, target.intensities.key, t);
+  rig.lights.rim.intensity = lerp(start.intensities.rim, target.intensities.rim, t);
+  rig.lights.fill.intensity = lerp(start.intensities.fill, target.intensities.fill, t);
+  rig.scene.fog.density = lerp(start.fogDensity, target.fogDensity, t);
+}
+
+function lerp(a, b, t) {
+  return a + (b - a) * t;
+}
+
+function disposeObject(obj) {
   obj.traverse((c) => {
     if (c.isBatchedMesh && typeof c.dispose === 'function') c.dispose();
     else if (c.geometry && !(c.userData && (c.userData.sharedContactShadow || c.userData.sharedShieldGeo))) c.geometry.dispose();
diff --git a/src/render/starfield.js b/src/render/starfield.js
index d76965c563ac0d99166bb382577d2f6eaa4a6d0f..aecb37608592e6ff981ddaf8fd6107d17a0632e6
--- a/src/render/starfield.js
+++ b/src/render/starfield.js
@@ -116,10 +116,18 @@
   return c;
 }
 
-// --- small color helpers for sector tinting (no deps) ---
-function hexToRgb(hex) {
-  const h = hex.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
-}
+// --- small color helpers for sector tinting (no deps) ---
+function normalizeTint(tint) {
+  if (tint == null) return null;
+  if (typeof tint === 'number' && Number.isFinite(tint)) {
+    return '#' + ((tint >>> 0) & 0xffffff).toString(16).padStart(6, '0');
+  }
+  if (typeof tint === 'string') return tint.startsWith('#') ? tint : '#' + tint.replace(/^0x/i, '');
+  return null;
+}
+function hexToRgb(hex) {
+  const h = hex.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
+}
 function rgbToHex(r, g, b) {
   const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
   return '#' + c(r) + c(g) + c(b);
@@ -176,11 +184,11 @@
   ctx.restore();
 }
 
-export function createStarfield(scene, opts = {}) {
-  const layers = [];
-  const sprite = makeStarSprite();
-  let bgTexture = null;
-  let currentTint = opts.tint || null;
+export function createStarfield(scene, opts = {}) {
+  const layers = [];
+  const sprite = makeStarSprite();
+  let bgTexture = null;
+  let currentTint = normalizeTint(opts.tint);
 
   // star tints (mostly cool white/blue with a few warm + teal accents)
   const TINTS = [0xffffff, 0xcfe0ff, 0x9fb6e0, 0xfff0d8, 0x8af0d6, 0xbfd2ff];
@@ -297,13 +305,14 @@
       // GR-7: slow-rotate the distant 3D planets so they read as real spinning worlds, not billboards.
       for (const p of distantPlanets) p.mesh.rotation.y += dt * p.spin;
     },
-    // Swap the nebula mood on sector enter — each region of the galaxy reads with its own color
-    // signature (core = clean blue, industrial = rust/amber, frontier = blood-red, alien = violet).
-    setSectorTint(tint) {
-      if (tint === currentTint) return;
-      currentTint = tint || null;
-      applyBackground(currentTint);
-    },
+    // Swap the nebula mood on sector enter — each region of the galaxy reads with its own color
+    // signature (core = clean blue, industrial = rust/amber, frontier = blood-red, alien = violet).
+    setSectorTint(tint) {
+      const nextTint = normalizeTint(tint);
+      if (nextTint === currentTint) return;
+      currentTint = nextTint;
+      applyBackground(currentTint);
+    },
     setWarp() { /* extended by vfx during jump */ },
   };
 }

 succeeded in 4067ms:
 succeeded in 3931ms:
warning: in the working copy of 'package.json', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'src/data/sectors.js', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'src/render/renderer.js', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'src/render/starfield.js', LF will be replaced by CRLF the next time Git touches it
diff --git a/package.json b/package.json
index 8c295e58..8ea367c5 100644
--- a/package.json
+++ b/package.json
@@ -29,6 +29,7 @@
     "check:47a:visuals": "node scripts/check-47a-visual-assets.mjs",
     "check:slice-scope": "node scripts/check-slice-scope.mjs",
     "check:balance": "node scripts/balance-sim.mjs",
+    "check:mining:2": "node scripts/check-mining-2.mjs",
     "check:presentation": "node scripts/check-presentation-cues.mjs && node scripts/check-sg08-golden-trace.mjs && node scripts/check-sg08-mix-profile.mjs && node scripts/check-sg08-render-vfx.mjs",
     "check:camera": "node scripts/check-camera-composition.mjs",
     "check:sg05": "node scripts/check-sg05-scenario.mjs && node scripts/check-sg05-runtime.mjs && node scripts/check-sg05-branch-policies.mjs && node scripts/check-sg05-ui-lifecycle.mjs",
@@ -75,9 +76,11 @@
     "check:bundle": "node scripts/check-bundle.mjs",
     "check:launch-policy": "node scripts/check-launch-policy.mjs",
     "check:non-graphics": "node scripts/check-non-graphics-ci.mjs",
+    "check:sector-palettes": "node scripts/check-sector-palettes.mjs",
     "check:assets:live": "node scripts/probe-authored-assets-live.mjs",
     "check:perf:control": "node scripts/probe-raf-control.mjs --headed --strict --width 1830 --height 973 --warmup 1000 --duration 5000",
     "check:perf": "node scripts/probe-performance-profile.mjs --headed --strict --width 1830 --height 973 --warmup 2500 --duration 7000 --diagnostic-variants",
+    "check:hitch-budget": "node scripts/check-hitch-budget.mjs",
     "check:radar:perf": "node scripts/check-radar-perf.mjs",
     "check:ui:perf": "node scripts/check-ui-frame-sleep.mjs && npm run check:radar:perf",
     "check:bar:narrative": "node scripts/check-bar-canonical-contacts.mjs",
diff --git a/src/data/sectors.js b/src/data/sectors.js
index 05868be4..1814c409 100644
--- a/src/data/sectors.js
+++ b/src/data/sectors.js
@@ -10,10 +10,30 @@ export const STATION_TYPES = ['trade_hub', 'refinery', 'mining', 'fab', 'militar
 export const HAZARD_TYPES  = ['dense_asteroid', 'nebula', 'radiation', 'debris'];
 export const POI_TYPES     = ['beacon', 'derelict', 'cache', 'colony', 'anomaly', 'wormhole', 'wreck'];
 
+export const SECTOR_PALETTE_CLASSES = {
+  core: {
+    key: 0xcfe2ff, rim: 0x6a5cff, fill: 0x39d0ff, ambient: 0x42506f,
+    fog: 0x0a1430, fogDensity: 0.00026, nebulaTint: 0x1e3a6a, dust: 0x7ea7c7,
+  },
+  belt: {
+    key: 0xffd59a, rim: 0xb56d2f, fill: 0xffb13d, ambient: 0x594a42,
+    fog: 0x2a160c, fogDensity: 0.00034, nebulaTint: 0x8a4a1e, dust: 0xc0793d,
+  },
+  fringe: {
+    key: 0xffb07a, rim: 0xff3f2d, fill: 0xffaa66, ambient: 0x584343,
+    fog: 0x2a0d0a, fogDensity: 0.00042, nebulaTint: 0x8a1e1e, dust: 0xc15032,
+  },
+  anomaly: {
+    key: 0xc8b6ff, rim: 0x54ffb0, fill: 0x4ddc92, ambient: 0x494760,
+    fog: 0x160d2c, fogDensity: 0.00036, nebulaTint: 0x5a1e8a, dust: 0x79ffc8,
+  },
+};
+
 export const SECTORS = [
   {
-    id: 'sector_helios_prime', name: 'Helios Prime', tier: 0, security: 0.98,
+    id: 'sector_helios_prime', name: 'Helios Prime', tier: 0, security: 0.98, charted: true,
     factionId: 'faction_scn', position: { x: 0, y: 0 }, worldRadius: 3500,
+    palette: SECTOR_PALETTE_CLASSES.core,
     // Tutorial home sector: NO hostile spawns (enemyDensity 0). A brand-new pilot must not be
     // hunted before learning the ropes; danger ramps up only in neighbouring sectors.
     trafficPerMin: 18, enemyDensity: 0, enemyLevel: [1, 2],
@@ -35,8 +55,9 @@ export const SECTORS = [
     ],
   },
   {
-    id: 'sector_ceres_belt', name: 'Ceres Belt', tier: 1, security: 0.72,
+    id: 'sector_ceres_belt', name: 'Ceres Belt', tier: 1, security: 0.72, charted: true,
     factionId: 'faction_dmc', position: { x: -3, y: 2 }, worldRadius: 4200,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 10, enemyDensity: 0.18, enemyLevel: [2, 4],
     neighbors: ['sector_helios_prime', 'sector_tethys_junction', 'sector_pallas_drift'],
     stations: [
@@ -55,8 +76,9 @@ export const SECTORS = [
     ],
   },
   {
-    id: 'sector_tethys_junction', name: 'Tethys Junction', tier: 1, security: 0.65,
+    id: 'sector_tethys_junction', name: 'Tethys Junction', tier: 1, security: 0.65, charted: true,
     factionId: 'faction_mts', position: { x: 3, y: 2 }, worldRadius: 4000,
+    palette: SECTOR_PALETTE_CLASSES.core,
     trafficPerMin: 14, enemyDensity: 0.20, enemyLevel: [2, 4],
     neighbors: ['sector_helios_prime', 'sector_ceres_belt', 'sector_vesta_forge', 'sector_io_reach'],
     stations: [
@@ -70,8 +92,9 @@ export const SECTORS = [
     ],
   },
   {
-    id: 'sector_vesta_forge', name: 'Vesta Forge', tier: 1, security: 0.60,
+    id: 'sector_vesta_forge', name: 'Vesta Forge', tier: 1, security: 0.60, charted: true,
     factionId: 'faction_dmc', position: { x: 0, y: 4 }, worldRadius: 4300,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 9, enemyDensity: 0.25, enemyLevel: [3, 5],
     neighbors: ['sector_helios_prime', 'sector_tethys_junction', 'sector_charon_expanse'],
     stations: [
@@ -87,8 +110,9 @@ export const SECTORS = [
     pois: [ { id: 'poi_freighter', type: 'derelict', name: 'Derelict Freighter' } ],
   },
   {
-    id: 'sector_pallas_drift', name: 'Pallas Drift', tier: 2, security: 0.42,
+    id: 'sector_pallas_drift', name: 'Pallas Drift', tier: 2, security: 0.42, charted: true,
     factionId: 'faction_mts', position: { x: -5, y: 5 }, worldRadius: 4500,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 7, enemyDensity: 0.40, enemyLevel: [4, 7],
     neighbors: ['sector_ceres_belt', 'sector_io_reach', 'sector_sker_haven'],
     stations: [
@@ -107,8 +131,9 @@ export const SECTORS = [
     ],
   },
   {
-    id: 'sector_io_reach', name: 'Io Reach', tier: 2, security: 0.35,
+    id: 'sector_io_reach', name: 'Io Reach', tier: 2, security: 0.35, charted: true,
     factionId: 'faction_free', position: { x: 5, y: 5 }, worldRadius: 4600,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 5, enemyDensity: 0.50, enemyLevel: [5, 8],
     neighbors: ['sector_tethys_junction', 'sector_pallas_drift', 'sector_charon_expanse', 'sector_veil_nebula'],
     stations: [
@@ -130,8 +155,9 @@ export const SECTORS = [
     ],
   },
   {
-    id: 'sector_charon_expanse', name: 'Charon Expanse', tier: 2, security: 0.30,
+    id: 'sector_charon_expanse', name: 'Charon Expanse', tier: 2, security: 0.30, charted: true,
     factionId: 'faction_dmc', position: { x: 2, y: 7 }, worldRadius: 4800,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 4, enemyDensity: 0.50, enemyLevel: [5, 9],
     neighbors: ['sector_vesta_forge', 'sector_io_reach', 'sector_ashfall_reach'],
     stations: [
@@ -149,8 +175,9 @@ export const SECTORS = [
     pois: [ { id: 'poi_colony', type: 'colony', name: 'Abandoned Mining Colony', claimable: true, size: 'S' } ],
   },
   {
-    id: 'sector_sker_haven', name: 'Sker Haven', tier: 3, security: 0.08,
+    id: 'sector_sker_haven', name: 'Sker Haven', tier: 3, security: 0.08, charted: false,
     factionId: 'faction_reach', position: { x: -7, y: 8 }, worldRadius: 5000,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 0, enemyDensity: 0.70, enemyLevel: [7, 11],
     neighbors: ['sector_pallas_drift', 'sector_veil_nebula'],
     stations: [
@@ -167,8 +194,9 @@ export const SECTORS = [
     ],
   },
   {
-    id: 'sector_veil_nebula', name: 'Veil Nebula', tier: 3, security: 0.12,
+    id: 'sector_veil_nebula', name: 'Veil Nebula', tier: 3, security: 0.12, charted: false,
     factionId: 'faction_free', position: { x: 7, y: 9 }, worldRadius: 5200,
+    palette: SECTOR_PALETTE_CLASSES.anomaly,
     trafficPerMin: 0, enemyDensity: 0.65, enemyLevel: [8, 12],
     neighbors: ['sector_io_reach', 'sector_sker_haven'],
     wormholeTo: { sectorId: 'sector_ashfall_reach', gatedBy: 'tech:tech_long_range_survey' },
@@ -186,8 +214,9 @@ export const SECTORS = [
     ],
   },
   {
-    id: 'sector_ashfall_reach', name: 'Ashfall Reach', tier: 4, security: 0.05,
+    id: 'sector_ashfall_reach', name: 'Ashfall Reach', tier: 4, security: 0.05, charted: false,
     factionId: 'faction_vael', position: { x: 4, y: 11 }, worldRadius: 5500,
+    palette: SECTOR_PALETTE_CLASSES.anomaly,
     trafficPerMin: 0, enemyDensity: 0.80, enemyLevel: [10, 15],
     neighbors: ['sector_charon_expanse'],
     stations: [
@@ -224,3 +253,8 @@ export function dangerIndex(sector) {
   const tier = sector.tier;
   return clamp(0.05 + 0.22 * tier + 0.25 * (1 - sector.security), 0, 1.0);
 }
+
+export function surveyDataPrice(sector) {
+  const tier = Math.max(0, Number(sector && sector.tier) || 0);
+  return Math.round(750 + tier * 1250);
+}
diff --git a/src/render/renderer.js b/src/render/renderer.js
index 0fefd0e2..789fd21a 100644
--- a/src/render/renderer.js
+++ b/src/render/renderer.js
@@ -14,21 +14,12 @@ import { projectedWidthPx } from './lod.js';
 import { createCollisionDebug } from './collisionDebug.js';
 import { installDiagnostics } from './diagnostics.js';
 import { createPlanetFactory } from './planetFactory.js';
+import { precompilePipelines } from './precompile.js';
+import { SECTOR_PALETTE_CLASSES } from '../data/sectors.js';
 
-// Map a sector's danger/tier to a nebula backdrop tint so each region of the galaxy has its own
-// color signature. Core (safe, low tier) = clean blue; industrial mid-ring = rust/amber; lawless
-// frontier = blood-red; alien/endgame tier 4+ = violet. Returns a hex string or null (default).
-function sectorNebulaTint(sector) {
-  if (!sector) return null;
-  const tier = sector.tier || 0;
-  const sec = sector.security != null ? sector.security : 1;
-  const danger = (1 - sec) + tier * 0.15; // blended danger metric
-  if (tier >= 4) return '#5a1e8a';        // violet — alien / lawless endgame (Veil, Ashfall)
-  if (danger > 0.7) return '#8a1e1e';     // blood-red — dangerous frontier (Io Reach, Sker)
-  if (danger > 0.45) return '#8a4a1e';    // rust/amber — industrial mid-ring (Vesta, Pallas)
-  if (danger > 0.2) return '#1e4a8a';     // deep blue — settled belt (Ceres, Tethys)
-  return '#1e3a6a';                        // clean blue — safe core (Helios Prime)
-}
+const SECTOR_PALETTE_LERP_SECONDS = 1.5;
+const SECTOR_LIGHT_INTENSITIES = { ambient: 0.85, key: 1.7, rim: 0.7, fill: 0.35 };
+const SECTOR_PALETTE_COLOR_FIELDS = ['ambient', 'key', 'rim', 'fill', 'fog'];
 
 // ---- contact shadow disc (module-level cache so one texture serves all entities) ----------------
 let _shadowTex = null;
@@ -43,7 +34,7 @@ const SOCKET_WORLD_POS = new THREE.Vector3();
 const SOCKET_WORLD_QUAT = new THREE.Quaternion();
 const SOCKET_WORLD_SCALE = new THREE.Vector3();
 const SOCKET_FORWARD = new THREE.Vector3();
-const RUNTIME_MESH_BUILD_BUDGET = 1;
+const RUNTIME_MESH_BUILD_BUDGET = 2;
 function getContactShadowTex() {
   if (_shadowTex) return _shadowTex;
   const c = document.createElement('canvas'); c.width = c.height = 64;
@@ -178,13 +169,14 @@ export const render = {
     const drawSize = applyRendererSize(renderer, state);
 
     const scene = new THREE.Scene();
+    const corePalette = SECTOR_PALETTE_CLASSES.core;
     // Thin fog for gentle depth cueing only — the old 0.00085 erased the entire backdrop, leaving a
     // black void. This keeps the nebula + far stars visible while still fading the deep distance.
-    scene.fog = new THREE.FogExp2(0x0a1430, 0.00026);
-    scene.add(new THREE.AmbientLight(0x42506f, 0.85));
-    const key = new THREE.DirectionalLight(0xcfe2ff, 1.7); key.position.set(60, 140, 40); scene.add(key);
-    const rim = new THREE.DirectionalLight(0x6a5cff, 0.7); rim.position.set(-70, 50, -60); scene.add(rim);
-    const fill = new THREE.DirectionalLight(0x39d0ff, 0.35); fill.position.set(20, 30, 120); scene.add(fill);
+    scene.fog = new THREE.FogExp2(corePalette.fog, corePalette.fogDensity);
+    const ambient = new THREE.AmbientLight(corePalette.ambient, SECTOR_LIGHT_INTENSITIES.ambient); scene.add(ambient);
+    const key = new THREE.DirectionalLight(corePalette.key, SECTOR_LIGHT_INTENSITIES.key); key.position.set(60, 140, 40); scene.add(key);
+    const rim = new THREE.DirectionalLight(corePalette.rim, SECTOR_LIGHT_INTENSITIES.rim); rim.position.set(-70, 50, -60); scene.add(rim);
+    const fill = new THREE.DirectionalLight(corePalette.fill, SECTOR_LIGHT_INTENSITIES.fill); fill.position.set(20, 30, 120); scene.add(fill);
 
     // Real shadow maps (graphics spec Workstream G). Gated behind settings.video.shadows (default
     // true). The key light becomes a shadow caster with a tight frustum that follows the player so
@@ -209,7 +201,7 @@ export const render = {
     }
 
     const cam = createChaseCamera(state);
-    const starfield = createStarfield(scene);
+    const starfield = createStarfield(scene, { tint: corePalette.nebulaTint });
     const vf = createVisualFactory();
     // Hero-asset registry (spec §17.3): wraps the factory's build() so the bespoke player Kestrel is
     // intercepted before the procedural visualFactory. Narrow + failure-isolated — any throw falls
@@ -288,6 +280,9 @@ export const render = {
       return null;
     });
     state.render.authoredPartLibraryReady = this.authoredPartLibraryReady;
+    this._sectorPaletteRig = createSectorPaletteRig(scene, ambient, key, rim, fill);
+    this._sectorPaletteTarget = corePalette;
+    state.render.sectorPalette = corePalette;
     this._keyLight = shadowsOn ? key : null; // referenced by _updateShadowFollow() each frame
     this._shadowSettingOn = shadowsOn;
     this._shadowReceiversDirty = true;
@@ -305,6 +300,8 @@ export const render = {
     try { this.collisionDebug = createCollisionDebug(this); }
     catch (err) { console.warn('[render] collision debug unavailable:', err); this.collisionDebug = null; }
     this._meshes = new Map(); // entityId -> Object3D
+    this._meshBuildQueue = [];
+    this._meshBuildQueuedIds = new Set();
     this._hazardVisuals = []; // hazard zone visual meshes for the current sector
     this._meshReconcileDirty = true;
     this._initialMeshReconcileComplete = false;
@@ -347,6 +344,7 @@ export const render = {
     state.render.camera = cam.obj;
     state.render.cameraCtrl = cam;   // controller (addTrauma/pushZoom) — exposed for feel.js / ui
     state.render.vf = vf;   // exposed for the dev-only ship turntable preview (shipPreview.js)
+    state.render.warmPostProcess = () => (this.bloom && state.settings.video.bloom !== false ? this.bloom.render(scene, cam.obj) : renderer.render(scene, cam.obj));
     // Collision/socket/landing debug toggle (spec §12.5), bound to F7 in ui/input.js. Capture the
     // render-system `this` once so the handle closures resolve the live collisionDebug regardless of
     // how they're invoked (method `this` would otherwise bind to the debug handle object itself).
@@ -410,13 +408,13 @@ export const render = {
       this._meshReconcileDirty = true;
       if (cam.snapToPlayer) cam.snapToPlayer();
       this._updatePlanetBodies(sector);
-      // Tint the nebula backdrop to the sector's mood so each region of the galaxy reads with its
-      // own color signature: clean-blue core → rust/amber industrial → blood-red frontier → violet
-      // alien/endgame. Drives the whole-frame atmosphere, reinforcing the core-to-frontier gradient.
-      if (this.starfield && this.starfield.setSectorTint) {
-        this.starfield.setSectorTint(sectorNebulaTint(sector));
-      }
+      this._beginSectorPaletteTransition(sector);
       this._updateHazardVisuals(sector);
+      precompilePipelines(renderer, scene, cam.obj, { sector }).catch((error) => console.warn('[render] sector pipeline precompile failed', error));
+    });
+    bus.on('jump:arrive', ({ sectorId } = {}) => {
+      const sector = sectorId && state.world && state.world.sectors ? state.world.sectors[sectorId] : null;
+      this._beginSectorPaletteTransition(sector);
     });
     bus.on('save:loaded', () => { this._meshReconcileDirty = true; });
 
@@ -428,6 +426,8 @@ export const render = {
       if (keepPlayer && id === this.state.playerId) continue;
       this.scene.remove(m); disposeObject(m); this._meshes.delete(id);
     }
+    this._meshBuildQueue.length = 0;
+    this._meshBuildQueuedIds.clear();
     // Also clear hazard zone visuals
     for (const obj of this._hazardVisuals) { this.scene.remove(obj); disposeObject(obj); }
     this._hazardVisuals = [];
@@ -462,20 +462,32 @@ export const render = {
   reconcileMeshes() {
     const state = this.state;
     const buildBudget = this._initialMeshReconcileComplete ? RUNTIME_MESH_BUILD_BUDGET : Infinity;
-    let built = 0;
-    let pendingBuilds = false;
     // remove meshes whose entity no longer exists or has died
     for (const [id, m] of this._meshes) {
       const e = state.entities.get(id);
       if (!e || e.alive === false) { this.scene.remove(m); disposeObject(m); this._meshes.delete(id); this._shadowReceiversDirty = true; }
     }
-    // build meshes for alive entities that lack one (fx are particle-managed by vfx -> mark + skip)
+    // Queue alive entities that lack meshes (fx are particle-managed by vfx -> mark + skip).
     for (const e of state.entityList) {
       if (e._noMesh || this._meshes.has(e.id)) continue;
-      if (built >= buildBudget) {
-        pendingBuilds = true;
-        continue;
+      if (!this._meshBuildQueuedIds.has(e.id)) {
+        this._meshBuildQueue.push(e.id);
+        this._meshBuildQueuedIds.add(e.id);
       }
+    }
+    const built = this._drainMeshBuildQueue(buildBudget);
+    this._meshReconcileDirty = this._meshBuildQueue.length > 0;
+    if (!this._meshReconcileDirty) this._initialMeshReconcileComplete = true;
+    return built;
+  },
+
+  _drainMeshBuildQueue(buildBudget) {
+    let built = 0;
+    while (this._meshBuildQueue.length && built < buildBudget) {
+      const id = this._meshBuildQueue.shift();
+      this._meshBuildQueuedIds.delete(id);
+      const e = this.state.entities.get(id);
+      if (!e || e.alive === false || e._noMesh || this._meshes.has(id)) continue;
       const m = this.vf.build(e);
       if (!m) { e._noMesh = true; continue; }
       m.position.set(e.pos.x, 0, e.pos.z);
@@ -488,8 +500,7 @@ export const render = {
       this._shadowReceiversDirty = true;
       built++;
     }
-    this._meshReconcileDirty = pendingBuilds;
-    if (!pendingBuilds) this._initialMeshReconcileComplete = true;
+    return built;
   },
 
   // Rebuild one ship's mesh after a hull swap or loadout change. Disposes the old Object3D, builds a
@@ -686,6 +697,38 @@ export const render = {
     }
   },
 
+  _beginSectorPaletteTransition(sector) {
+    const rig = this._sectorPaletteRig;
+    if (!rig) return;
+    const palette = sector && sector.palette ? sector.palette : SECTOR_PALETTE_CLASSES.core;
+    this.state.render.sectorPalette = palette;
+    if (palette === this._sectorPaletteTarget) return;
+
+    this._sectorPaletteTarget = palette;
+    writeRigToSectorPaletteFrame(rig.start, rig);
+    writePaletteToSectorPaletteFrame(rig.target, palette);
+    rig.elapsed = 0;
+    rig.active = true;
+
+    if (this.starfield && this.starfield.setSectorTint) {
+      this.starfield.setSectorTint(palette.nebulaTint);
+    }
+  },
+
+  _updateSectorPaletteTransition(frameDt) {
+    const rig = this._sectorPaletteRig;
+    if (!rig || !rig.active) return;
+    const dt = Number.isFinite(frameDt) ? Math.max(0, frameDt) : 0;
+    rig.elapsed = Math.min(SECTOR_PALETTE_LERP_SECONDS, rig.elapsed + dt);
+    const rawT = SECTOR_PALETTE_LERP_SECONDS > 0 ? rig.elapsed / SECTOR_PALETTE_LERP_SECONDS : 1;
+    const t = rawT * rawT * (3 - 2 * rawT);
+    lerpSectorPaletteFrame(rig, rig.start, rig.target, t);
+    if (rawT >= 1) {
+      rig.active = false;
+      applySectorPaletteFrame(rig, rig.target);
+    }
+  },
+
   prepareFrame(alpha, frameDt) {
     // While the GL context is lost, the renderer can't draw — skip all per-frame work until
     // webglcontextrestored rebuilds GPU resources. (cam.follow etc. would run against a dead
@@ -700,6 +743,7 @@ export const render = {
     // Background-clock for distant animation (planet cloud drift, hero-star twinkle). Integrates real
     // frame dt scaled by state.timeScale so the cosmos respects hit-stop/pause — a death freeze
     // momentarily stills the clouds too, keeping the backdrop in the same time model as the action.
+    this._updateSectorPaletteTransition(frameDt);
     const ts = (this.state.timeScale != null) ? this.state.timeScale : 1;
     this._bgTime = (this._bgTime || 0) + frameDt * ts;
     if (this.starfield.update) this.starfield.update(frameDt, this._bgTime);
@@ -887,6 +931,90 @@ function finiteInRange(value, min, max, fallback) {
   return Math.max(min, Math.min(max, n));
 }
 
+function createSectorPaletteRig(scene, ambientLight, keyLight, rimLight, fillLight) {
+  const rig = {
+    scene,
+    lights: { ambient: ambientLight, key: keyLight, rim: rimLight, fill: fillLight },
+    start: createSectorPaletteFrame(),
+    target: createSectorPaletteFrame(),
+    elapsed: 0,
+    active: false,
+  };
+  writeRigToSectorPaletteFrame(rig.start, rig);
+  writeRigToSectorPaletteFrame(rig.target, rig);
+  return rig;
+}
+
+function createSectorPaletteFrame() {
+  return {
+    colors: {
+      ambient: new THREE.Color(),
+      key: new THREE.Color(),
+      rim: new THREE.Color(),
+      fill: new THREE.Color(),
+      fog: new THREE.Color(),
+    },
+    intensities: { ambient: 0, key: 0, rim: 0, fill: 0 },
+    fogDensity: 0,
+  };
+}
+
+function writeRigToSectorPaletteFrame(frame, rig) {
+  frame.colors.ambient.copy(rig.lights.ambient.color);
+  frame.colors.key.copy(rig.lights.key.color);
+  frame.colors.rim.copy(rig.lights.rim.color);
+  frame.colors.fill.copy(rig.lights.fill.color);
+  frame.colors.fog.copy(rig.scene.fog.color);
+  frame.intensities.ambient = rig.lights.ambient.intensity;
+  frame.intensities.key = rig.lights.key.intensity;
+  frame.intensities.rim = rig.lights.rim.intensity;
+  frame.intensities.fill = rig.lights.fill.intensity;
+  frame.fogDensity = rig.scene.fog.density;
+}
+
+function writePaletteToSectorPaletteFrame(frame, palette) {
+  frame.colors.ambient.setHex(palette.ambient);
+  frame.colors.key.setHex(palette.key);
+  frame.colors.rim.setHex(palette.rim);
+  frame.colors.fill.setHex(palette.fill);
+  frame.colors.fog.setHex(palette.fog);
+  frame.intensities.ambient = SECTOR_LIGHT_INTENSITIES.ambient;
+  frame.intensities.key = SECTOR_LIGHT_INTENSITIES.key;
+  frame.intensities.rim = SECTOR_LIGHT_INTENSITIES.rim;
+  frame.intensities.fill = SECTOR_LIGHT_INTENSITIES.fill;
+  frame.fogDensity = palette.fogDensity;
+}
+
+function applySectorPaletteFrame(rig, frame) {
+  rig.lights.ambient.color.copy(frame.colors.ambient);
+  rig.lights.key.color.copy(frame.colors.key);
+  rig.lights.rim.color.copy(frame.colors.rim);
+  rig.lights.fill.color.copy(frame.colors.fill);
+  rig.scene.fog.color.copy(frame.colors.fog);
+  rig.lights.ambient.intensity = frame.intensities.ambient;
+  rig.lights.key.intensity = frame.intensities.key;
+  rig.lights.rim.intensity = frame.intensities.rim;
+  rig.lights.fill.intensity = frame.intensities.fill;
+  rig.scene.fog.density = frame.fogDensity;
+}
+
+function lerpSectorPaletteFrame(rig, start, target, t) {
+  rig.lights.ambient.color.lerpColors(start.colors.ambient, target.colors.ambient, t);
+  rig.lights.key.color.lerpColors(start.colors.key, target.colors.key, t);
+  rig.lights.rim.color.lerpColors(start.colors.rim, target.colors.rim, t);
+  rig.lights.fill.color.lerpColors(start.colors.fill, target.colors.fill, t);
+  rig.scene.fog.color.lerpColors(start.colors.fog, target.colors.fog, t);
+  rig.lights.ambient.intensity = lerp(start.intensities.ambient, target.intensities.ambient, t);
+  rig.lights.key.intensity = lerp(start.intensities.key, target.intensities.key, t);
+  rig.lights.rim.intensity = lerp(start.intensities.rim, target.intensities.rim, t);
+  rig.lights.fill.intensity = lerp(start.intensities.fill, target.intensities.fill, t);
+  rig.scene.fog.density = lerp(start.fogDensity, target.fogDensity, t);
+}
+
+function lerp(a, b, t) {
+  return a + (b - a) * t;
+}
+
 function disposeObject(obj) {
   obj.traverse((c) => {
     if (c.isBatchedMesh && typeof c.dispose === 'function') c.dispose();
diff --git a/src/render/starfield.js b/src/render/starfield.js
index 160586c9..ab4f3920 100644
--- a/src/render/starfield.js
+++ b/src/render/starfield.js
@@ -117,6 +117,14 @@ function makeNebulaCanvas(opts = {}) {
 }
 
 // --- small color helpers for sector tinting (no deps) ---
+function normalizeTint(tint) {
+  if (tint == null) return null;
+  if (typeof tint === 'number' && Number.isFinite(tint)) {
+    return '#' + ((tint >>> 0) & 0xffffff).toString(16).padStart(6, '0');
+  }
+  if (typeof tint === 'string') return tint.startsWith('#') ? tint : '#' + tint.replace(/^0x/i, '');
+  return null;
+}
 function hexToRgb(hex) {
   const h = hex.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
 }
@@ -180,7 +188,7 @@ export function createStarfield(scene, opts = {}) {
   const layers = [];
   const sprite = makeStarSprite();
   let bgTexture = null;
-  let currentTint = opts.tint || null;
+  let currentTint = normalizeTint(opts.tint);
 
   // star tints (mostly cool white/blue with a few warm + teal accents)
   const TINTS = [0xffffff, 0xcfe0ff, 0x9fb6e0, 0xfff0d8, 0x8af0d6, 0xbfd2ff];
@@ -300,8 +308,9 @@ export function createStarfield(scene, opts = {}) {
     // Swap the nebula mood on sector enter — each region of the galaxy reads with its own color
     // signature (core = clean blue, industrial = rust/amber, frontier = blood-red, alien = violet).
     setSectorTint(tint) {
-      if (tint === currentTint) return;
-      currentTint = tint || null;
+      const nextTint = normalizeTint(tint);
+      if (nextTint === currentTint) return;
+      currentTint = nextTint;
       applyBackground(currentTint);
     },
     setWarp() { /* extended by vfx during jump */ },

codex
Syntax checks are running; after that I’ll review the diff for any accidental broad churn before starting the full gate.
diff --git a/package.json b/package.json
index 0897813b9c443f97ae9d2e8ae253e77f386705d9..a869414ec6dbceebe45b9b78abd72013201579da
--- a/package.json
+++ b/package.json
@@ -74,9 +74,10 @@
     "build:sg04:release-assets": "node scripts/build-sg04-release-assets.mjs",
     "build:bundle": "node scripts/build-bundle.mjs",
     "check:bundle": "node scripts/check-bundle.mjs",
-    "check:launch-policy": "node scripts/check-launch-policy.mjs",
-    "check:non-graphics": "node scripts/check-non-graphics-ci.mjs",
-    "check:assets:live": "node scripts/probe-authored-assets-live.mjs",
+    "check:launch-policy": "node scripts/check-launch-policy.mjs",
+    "check:non-graphics": "node scripts/check-non-graphics-ci.mjs",
+    "check:sector-palettes": "node scripts/check-sector-palettes.mjs",
+    "check:assets:live": "node scripts/probe-authored-assets-live.mjs",
     "check:perf:control": "node scripts/probe-raf-control.mjs --headed --strict --width 1830 --height 973 --warmup 1000 --duration 5000",
     "check:perf": "node scripts/probe-performance-profile.mjs --headed --strict --width 1830 --height 973 --warmup 2500 --duration 7000 --diagnostic-variants",
     "check:hitch-budget": "node scripts/check-hitch-budget.mjs",
diff --git a/scripts/check-sector-palettes.mjs b/scripts/check-sector-palettes.mjs
new file mode 100644
index 0000000000000000000000000000000000000000..04318569a6d4a787b3cf451b3de0e457574fa6f1
--- /dev/null
+++ b/scripts/check-sector-palettes.mjs
@@ -0,0 +1,81 @@
+import { SECTORS, SECTOR_PALETTE_CLASSES } from '../src/data/sectors.js';
+
+const REQUIRED_FIELDS = ['key', 'rim', 'fill', 'ambient', 'fog', 'fogDensity', 'nebulaTint', 'dust'];
+const COLOR_FIELDS = ['key', 'rim', 'fill', 'ambient', 'fog', 'nebulaTint', 'dust'];
+const CLASS_ENTRIES = Object.entries(SECTOR_PALETTE_CLASSES);
+const CORE_LUMINANCE = combinedLightLuminance(SECTOR_PALETTE_CLASSES.core);
+const MIN_LUMINANCE = CORE_LUMINANCE * 0.8;
+const MAX_LUMINANCE = CORE_LUMINANCE * 1.2;
+
+const issues = [];
+const usedClasses = new Set();
+
+for (const sector of SECTORS) {
+  const palette = sector.palette;
+  if (!palette || typeof palette !== 'object') {
+    issues.push(`${sector.id}: missing palette block`);
+    continue;
+  }
+
+  for (const field of REQUIRED_FIELDS) {
+    if (!(field in palette)) issues.push(`${sector.id}: palette missing ${field}`);
+  }
+  for (const field of COLOR_FIELDS) {
+    if (!isColorHex(palette[field])) issues.push(`${sector.id}: palette.${field} must be a 0x000000-0xffffff number`);
+  }
+  if (!Number.isFinite(palette.fogDensity) || palette.fogDensity <= 0) {
+    issues.push(`${sector.id}: palette.fogDensity must be a positive finite number`);
+  }
+
+  const className = classNameForPalette(palette);
+  if (!className) issues.push(`${sector.id}: palette does not match an authored class`);
+  else usedClasses.add(className);
+
+  const luminance = combinedLightLuminance(palette);
+  if (luminance < MIN_LUMINANCE || luminance > MAX_LUMINANCE) {
+    issues.push(`${sector.id}: ambient+fill luminance ${luminance.toFixed(4)} outside ${MIN_LUMINANCE.toFixed(4)}-${MAX_LUMINANCE.toFixed(4)}`);
+  }
+}
+
+for (const [className] of CLASS_ENTRIES) {
+  if (!usedClasses.has(className)) issues.push(`palette class unused: ${className}`);
+}
+
+if (issues.length) {
+  console.error(`Sector palette check failed (${issues.length} issue${issues.length === 1 ? '' : 's'}):`);
+  for (const issue of issues) console.error(`- ${issue}`);
+  process.exit(1);
+}
+
+console.log(`Sector palettes OK: ${SECTORS.length} sectors, classes used: ${[...usedClasses].sort().join(', ')}`);
+
+function classNameForPalette(palette) {
+  for (const [className, classPalette] of CLASS_ENTRIES) {
+    if (samePalette(palette, classPalette)) return className;
+  }
+  return null;
+}
+
+function samePalette(a, b) {
+  return REQUIRED_FIELDS.every((field) => a[field] === b[field]);
+}
+
+function isColorHex(value) {
+  return Number.isInteger(value) && value >= 0x000000 && value <= 0xffffff;
+}
+
+function combinedLightLuminance(palette) {
+  return relativeLuminance(palette.ambient) + relativeLuminance(palette.fill);
+}
+
+function relativeLuminance(hex) {
+  const r = linearRgb((hex >> 16) & 0xff);
+  const g = linearRgb((hex >> 8) & 0xff);
+  const b = linearRgb(hex & 0xff);
+  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
+}
+
+function linearRgb(channel) {
+  const c = channel / 255;
+  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
+}
diff --git a/src/data/sectors.js b/src/data/sectors.js
index 9c63f69479b241fc848258e3fe2161547793fa46..1814c409089f818b6ab4758b3f0cf8f8531f2452
--- a/src/data/sectors.js
+++ b/src/data/sectors.js
@@ -10,10 +10,30 @@
 export const HAZARD_TYPES  = ['dense_asteroid', 'nebula', 'radiation', 'debris'];
 export const POI_TYPES     = ['beacon', 'derelict', 'cache', 'colony', 'anomaly', 'wormhole', 'wreck'];
 
+export const SECTOR_PALETTE_CLASSES = {
+  core: {
+    key: 0xcfe2ff, rim: 0x6a5cff, fill: 0x39d0ff, ambient: 0x42506f,
+    fog: 0x0a1430, fogDensity: 0.00026, nebulaTint: 0x1e3a6a, dust: 0x7ea7c7,
+  },
+  belt: {
+    key: 0xffd59a, rim: 0xb56d2f, fill: 0xffb13d, ambient: 0x594a42,
+    fog: 0x2a160c, fogDensity: 0.00034, nebulaTint: 0x8a4a1e, dust: 0xc0793d,
+  },
+  fringe: {
+    key: 0xffb07a, rim: 0xff3f2d, fill: 0xffaa66, ambient: 0x584343,
+    fog: 0x2a0d0a, fogDensity: 0.00042, nebulaTint: 0x8a1e1e, dust: 0xc15032,
+  },
+  anomaly: {
+    key: 0xc8b6ff, rim: 0x54ffb0, fill: 0x4ddc92, ambient: 0x494760,
+    fog: 0x160d2c, fogDensity: 0.00036, nebulaTint: 0x5a1e8a, dust: 0x79ffc8,
+  },
+};
+
 export const SECTORS = [
   {
     id: 'sector_helios_prime', name: 'Helios Prime', tier: 0, security: 0.98, charted: true,
     factionId: 'faction_scn', position: { x: 0, y: 0 }, worldRadius: 3500,
+    palette: SECTOR_PALETTE_CLASSES.core,
     // Tutorial home sector: NO hostile spawns (enemyDensity 0). A brand-new pilot must not be
     // hunted before learning the ropes; danger ramps up only in neighbouring sectors.
     trafficPerMin: 18, enemyDensity: 0, enemyLevel: [1, 2],
@@ -37,6 +57,7 @@
   {
     id: 'sector_ceres_belt', name: 'Ceres Belt', tier: 1, security: 0.72, charted: true,
     factionId: 'faction_dmc', position: { x: -3, y: 2 }, worldRadius: 4200,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 10, enemyDensity: 0.18, enemyLevel: [2, 4],
     neighbors: ['sector_helios_prime', 'sector_tethys_junction', 'sector_pallas_drift'],
     stations: [
@@ -57,6 +78,7 @@
   {
     id: 'sector_tethys_junction', name: 'Tethys Junction', tier: 1, security: 0.65, charted: true,
     factionId: 'faction_mts', position: { x: 3, y: 2 }, worldRadius: 4000,
+    palette: SECTOR_PALETTE_CLASSES.core,
     trafficPerMin: 14, enemyDensity: 0.20, enemyLevel: [2, 4],
     neighbors: ['sector_helios_prime', 'sector_ceres_belt', 'sector_vesta_forge', 'sector_io_reach'],
     stations: [
@@ -72,6 +94,7 @@
   {
     id: 'sector_vesta_forge', name: 'Vesta Forge', tier: 1, security: 0.60, charted: true,
     factionId: 'faction_dmc', position: { x: 0, y: 4 }, worldRadius: 4300,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 9, enemyDensity: 0.25, enemyLevel: [3, 5],
     neighbors: ['sector_helios_prime', 'sector_tethys_junction', 'sector_charon_expanse'],
     stations: [
@@ -89,6 +112,7 @@
   {
     id: 'sector_pallas_drift', name: 'Pallas Drift', tier: 2, security: 0.42, charted: true,
     factionId: 'faction_mts', position: { x: -5, y: 5 }, worldRadius: 4500,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 7, enemyDensity: 0.40, enemyLevel: [4, 7],
     neighbors: ['sector_ceres_belt', 'sector_io_reach', 'sector_sker_haven'],
     stations: [
@@ -109,6 +133,7 @@
   {
     id: 'sector_io_reach', name: 'Io Reach', tier: 2, security: 0.35, charted: true,
     factionId: 'faction_free', position: { x: 5, y: 5 }, worldRadius: 4600,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 5, enemyDensity: 0.50, enemyLevel: [5, 8],
     neighbors: ['sector_tethys_junction', 'sector_pallas_drift', 'sector_charon_expanse', 'sector_veil_nebula'],
     stations: [
@@ -132,6 +157,7 @@
   {
     id: 'sector_charon_expanse', name: 'Charon Expanse', tier: 2, security: 0.30, charted: true,
     factionId: 'faction_dmc', position: { x: 2, y: 7 }, worldRadius: 4800,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 4, enemyDensity: 0.50, enemyLevel: [5, 9],
     neighbors: ['sector_vesta_forge', 'sector_io_reach', 'sector_ashfall_reach'],
     stations: [
@@ -151,6 +177,7 @@
   {
     id: 'sector_sker_haven', name: 'Sker Haven', tier: 3, security: 0.08, charted: false,
     factionId: 'faction_reach', position: { x: -7, y: 8 }, worldRadius: 5000,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 0, enemyDensity: 0.70, enemyLevel: [7, 11],
     neighbors: ['sector_pallas_drift', 'sector_veil_nebula'],
     stations: [
@@ -169,6 +196,7 @@
   {
     id: 'sector_veil_nebula', name: 'Veil Nebula', tier: 3, security: 0.12, charted: false,
     factionId: 'faction_free', position: { x: 7, y: 9 }, worldRadius: 5200,
+    palette: SECTOR_PALETTE_CLASSES.anomaly,
     trafficPerMin: 0, enemyDensity: 0.65, enemyLevel: [8, 12],
     neighbors: ['sector_io_reach', 'sector_sker_haven'],
     wormholeTo: { sectorId: 'sector_ashfall_reach', gatedBy: 'tech:tech_long_range_survey' },
@@ -188,6 +216,7 @@
   {
     id: 'sector_ashfall_reach', name: 'Ashfall Reach', tier: 4, security: 0.05, charted: false,
     factionId: 'faction_vael', position: { x: 4, y: 11 }, worldRadius: 5500,
+    palette: SECTOR_PALETTE_CLASSES.anomaly,
     trafficPerMin: 0, enemyDensity: 0.80, enemyLevel: [10, 15],
     neighbors: ['sector_charon_expanse'],
     stations: [
diff --git a/src/render/renderer.js b/src/render/renderer.js
index def6420ff1bff2ac1c64dcc1add395e7851c4dbc..b8dd6ec63f224fbdab8fc20077f3cbf2d75c3ba2
--- a/src/render/renderer.js
+++ b/src/render/renderer.js
@@ -15,21 +15,11 @@
 import { installDiagnostics } from './diagnostics.js';
 import { createPlanetFactory } from './planetFactory.js';
 import { precompilePipelines } from './precompile.js';
-
-// Map a sector's danger/tier to a nebula backdrop tint so each region of the galaxy has its own
-// color signature. Core (safe, low tier) = clean blue; industrial mid-ring = rust/amber; lawless
-// frontier = blood-red; alien/endgame tier 4+ = violet. Returns a hex string or null (default).
-function sectorNebulaTint(sector) {
-  if (!sector) return null;
-  const tier = sector.tier || 0;
-  const sec = sector.security != null ? sector.security : 1;
-  const danger = (1 - sec) + tier * 0.15; // blended danger metric
-  if (tier >= 4) return '#5a1e8a';        // violet — alien / lawless endgame (Veil, Ashfall)
-  if (danger > 0.7) return '#8a1e1e';     // blood-red — dangerous frontier (Io Reach, Sker)
-  if (danger > 0.45) return '#8a4a1e';    // rust/amber — industrial mid-ring (Vesta, Pallas)
-  if (danger > 0.2) return '#1e4a8a';     // deep blue — settled belt (Ceres, Tethys)
-  return '#1e3a6a';                        // clean blue — safe core (Helios Prime)
-}
+import { SECTOR_PALETTE_CLASSES } from '../data/sectors.js';
+
+const SECTOR_PALETTE_LERP_SECONDS = 1.5;
+const SECTOR_LIGHT_INTENSITIES = { ambient: 0.85, key: 1.7, rim: 0.7, fill: 0.35 };
+const SECTOR_PALETTE_COLOR_FIELDS = ['ambient', 'key', 'rim', 'fill', 'fog'];
 
 // ---- contact shadow disc (module-level cache so one texture serves all entities) ----------------
 let _shadowTex = null;
@@ -178,14 +168,15 @@
     renderer.setClearColor(0x060912, 1);
     const drawSize = applyRendererSize(renderer, state);
 
-    const scene = new THREE.Scene();
-    // Thin fog for gentle depth cueing only — the old 0.00085 erased the entire backdrop, leaving a
-    // black void. This keeps the nebula + far stars visible while still fading the deep distance.
-    scene.fog = new THREE.FogExp2(0x0a1430, 0.00026);
-    scene.add(new THREE.AmbientLight(0x42506f, 0.85));
-    const key = new THREE.DirectionalLight(0xcfe2ff, 1.7); key.position.set(60, 140, 40); scene.add(key);
-    const rim = new THREE.DirectionalLight(0x6a5cff, 0.7); rim.position.set(-70, 50, -60); scene.add(rim);
-    const fill = new THREE.DirectionalLight(0x39d0ff, 0.35); fill.position.set(20, 30, 120); scene.add(fill);
+    const scene = new THREE.Scene();
+    const corePalette = SECTOR_PALETTE_CLASSES.core;
+    // Thin fog for gentle depth cueing only — the old 0.00085 erased the entire backdrop, leaving a
+    // black void. This keeps the nebula + far stars visible while still fading the deep distance.
+    scene.fog = new THREE.FogExp2(corePalette.fog, corePalette.fogDensity);
+    const ambient = new THREE.AmbientLight(corePalette.ambient, SECTOR_LIGHT_INTENSITIES.ambient); scene.add(ambient);
+    const key = new THREE.DirectionalLight(corePalette.key, SECTOR_LIGHT_INTENSITIES.key); key.position.set(60, 140, 40); scene.add(key);
+    const rim = new THREE.DirectionalLight(corePalette.rim, SECTOR_LIGHT_INTENSITIES.rim); rim.position.set(-70, 50, -60); scene.add(rim);
+    const fill = new THREE.DirectionalLight(corePalette.fill, SECTOR_LIGHT_INTENSITIES.fill); fill.position.set(20, 30, 120); scene.add(fill);
 
     // Real shadow maps (graphics spec Workstream G). Gated behind settings.video.shadows (default
     // true). The key light becomes a shadow caster with a tight frustum that follows the player so
@@ -210,7 +201,7 @@
     }
 
     const cam = createChaseCamera(state);
-    const starfield = createStarfield(scene);
+    const starfield = createStarfield(scene, { tint: corePalette.nebulaTint });
     const vf = createVisualFactory();
     // Hero-asset registry (spec §17.3): wraps the factory's build() so the bespoke player Kestrel is
     // intercepted before the procedural visualFactory. Narrow + failure-isolated — any throw falls
@@ -283,13 +274,16 @@
     // contact-sheet references and are replaced by procedural materials / inline SVG).
     { const i = new Image(); i.src = 'assets/cinematics/menu_background.jpg'; }
 
-    this.renderer = renderer; this.scene = scene; this.cam = cam; this.starfield = starfield; this.vf = vf;
-    this.authoredPartLibraryReady = preloadAuthoredPartLibrary(renderer).catch((error) => {
-      console.warn('[render] authored part library preload failed', error);
-      return null;
-    });
-    state.render.authoredPartLibraryReady = this.authoredPartLibraryReady;
-    this._keyLight = shadowsOn ? key : null; // referenced by _updateShadowFollow() each frame
+    this.renderer = renderer; this.scene = scene; this.cam = cam; this.starfield = starfield; this.vf = vf;
+    this.authoredPartLibraryReady = preloadAuthoredPartLibrary(renderer).catch((error) => {
+      console.warn('[render] authored part library preload failed', error);
+      return null;
+    });
+    state.render.authoredPartLibraryReady = this.authoredPartLibraryReady;
+    this._sectorPaletteRig = createSectorPaletteRig(scene, ambient, key, rim, fill);
+    this._sectorPaletteTarget = corePalette;
+    state.render.sectorPalette = corePalette;
+    this._keyLight = shadowsOn ? key : null; // referenced by _updateShadowFollow() each frame
     this._shadowSettingOn = shadowsOn;
     this._shadowReceiversDirty = true;
     this._shadowReceiverCount = 0;
@@ -410,20 +404,19 @@
     // already spawned by the time this fires (enterSector spawns before its sector:enter resolves),
     // so a blind clearAllMeshes(keepPlayer) used to wipe the station/asteroids and leave the player
     // alone in empty space. reconcileMeshes() removes only meshes for entities that are gone.
-    bus.on('sector:enter', ({ sector } = {}) => {
-      this._meshReconcileDirty = true;
-      if (cam.snapToPlayer) cam.snapToPlayer();
-      this._updatePlanetBodies(sector);
-      // Tint the nebula backdrop to the sector's mood so each region of the galaxy reads with its
-      // own color signature: clean-blue core → rust/amber industrial → blood-red frontier → violet
-      // alien/endgame. Drives the whole-frame atmosphere, reinforcing the core-to-frontier gradient.
-      if (this.starfield && this.starfield.setSectorTint) {
-        this.starfield.setSectorTint(sectorNebulaTint(sector));
-      }
+    bus.on('sector:enter', ({ sector } = {}) => {
+      this._meshReconcileDirty = true;
+      if (cam.snapToPlayer) cam.snapToPlayer();
+      this._updatePlanetBodies(sector);
+      this._beginSectorPaletteTransition(sector);
       this._updateHazardVisuals(sector);
       precompilePipelines(renderer, scene, cam.obj, { sector }).catch((error) => console.warn('[render] sector pipeline precompile failed', error));
     });
-    bus.on('save:loaded', () => { this._meshReconcileDirty = true; });
+    bus.on('jump:arrive', ({ sectorId } = {}) => {
+      const sector = sectorId && state.world && state.world.sectors ? state.world.sectors[sectorId] : null;
+      this._beginSectorPaletteTransition(sector);
+    });
+    bus.on('save:loaded', () => { this._meshReconcileDirty = true; });
 
     window.addEventListener('resize', () => this.onResize());
   },
@@ -640,7 +633,7 @@
     return tex;
   },
 
-  _updateHazardVisuals(sector) {
+  _updateHazardVisuals(sector) {
     // Dispose previous hazard visuals
     for (const obj of this._hazardVisuals) {
       this.scene.remove(obj);
@@ -701,10 +694,42 @@
         this.scene.add(ring);
         this._hazardVisuals.push(ring);
       }
-    }
-  },
-
-  prepareFrame(alpha, frameDt) {
+    }
+  },
+
+  _beginSectorPaletteTransition(sector) {
+    const rig = this._sectorPaletteRig;
+    if (!rig) return;
+    const palette = sector && sector.palette ? sector.palette : SECTOR_PALETTE_CLASSES.core;
+    this.state.render.sectorPalette = palette;
+    if (palette === this._sectorPaletteTarget) return;
+
+    this._sectorPaletteTarget = palette;
+    writeRigToSectorPaletteFrame(rig.start, rig);
+    writePaletteToSectorPaletteFrame(rig.target, palette);
+    rig.elapsed = 0;
+    rig.active = true;
+
+    if (this.starfield && this.starfield.setSectorTint) {
+      this.starfield.setSectorTint(palette.nebulaTint);
+    }
+  },
+
+  _updateSectorPaletteTransition(frameDt) {
+    const rig = this._sectorPaletteRig;
+    if (!rig || !rig.active) return;
+    const dt = Number.isFinite(frameDt) ? Math.max(0, frameDt) : 0;
+    rig.elapsed = Math.min(SECTOR_PALETTE_LERP_SECONDS, rig.elapsed + dt);
+    const rawT = SECTOR_PALETTE_LERP_SECONDS > 0 ? rig.elapsed / SECTOR_PALETTE_LERP_SECONDS : 1;
+    const t = rawT * rawT * (3 - 2 * rawT);
+    lerpSectorPaletteFrame(rig, rig.start, rig.target, t);
+    if (rawT >= 1) {
+      rig.active = false;
+      applySectorPaletteFrame(rig, rig.target);
+    }
+  },
+
+  prepareFrame(alpha, frameDt) {
     // While the GL context is lost, the renderer can't draw — skip all per-frame work until
     // webglcontextrestored rebuilds GPU resources. (cam.follow etc. would run against a dead
     // renderer; the context-restore handler re-applies everything that matters when it returns.)
@@ -716,9 +741,10 @@
     syncAuthoredInstancePools(this.scene, { camera: this.cam.obj });
     this.starfield.recenter(this.cam.obj.position);
     // Background-clock for distant animation (planet cloud drift, hero-star twinkle). Integrates real
-    // frame dt scaled by state.timeScale so the cosmos respects hit-stop/pause — a death freeze
-    // momentarily stills the clouds too, keeping the backdrop in the same time model as the action.
-    const ts = (this.state.timeScale != null) ? this.state.timeScale : 1;
+    // frame dt scaled by state.timeScale so the cosmos respects hit-stop/pause — a death freeze
+    // momentarily stills the clouds too, keeping the backdrop in the same time model as the action.
+    this._updateSectorPaletteTransition(frameDt);
+    const ts = (this.state.timeScale != null) ? this.state.timeScale : 1;
     this._bgTime = (this._bgTime || 0) + frameDt * ts;
     if (this.starfield.update) this.starfield.update(frameDt, this._bgTime);
     this._updatePlanetParallax();
@@ -899,13 +925,97 @@
   return renderer.getDrawingBufferSize(_drawSize);
 }
 
-function finiteInRange(value, min, max, fallback) {
-  const n = Number(value);
-  if (!Number.isFinite(n)) return fallback;
-  return Math.max(min, Math.min(max, n));
-}
-
-function disposeObject(obj) {
+function finiteInRange(value, min, max, fallback) {
+  const n = Number(value);
+  if (!Number.isFinite(n)) return fallback;
+  return Math.max(min, Math.min(max, n));
+}
+
+function createSectorPaletteRig(scene, ambientLight, keyLight, rimLight, fillLight) {
+  const rig = {
+    scene,
+    lights: { ambient: ambientLight, key: keyLight, rim: rimLight, fill: fillLight },
+    start: createSectorPaletteFrame(),
+    target: createSectorPaletteFrame(),
+    elapsed: 0,
+    active: false,
+  };
+  writeRigToSectorPaletteFrame(rig.start, rig);
+  writeRigToSectorPaletteFrame(rig.target, rig);
+  return rig;
+}
+
+function createSectorPaletteFrame() {
+  return {
+    colors: {
+      ambient: new THREE.Color(),
+      key: new THREE.Color(),
+      rim: new THREE.Color(),
+      fill: new THREE.Color(),
+      fog: new THREE.Color(),
+    },
+    intensities: { ambient: 0, key: 0, rim: 0, fill: 0 },
+    fogDensity: 0,
+  };
+}
+
+function writeRigToSectorPaletteFrame(frame, rig) {
+  frame.colors.ambient.copy(rig.lights.ambient.color);
+  frame.colors.key.copy(rig.lights.key.color);
+  frame.colors.rim.copy(rig.lights.rim.color);
+  frame.colors.fill.copy(rig.lights.fill.color);
+  frame.colors.fog.copy(rig.scene.fog.color);
+  frame.intensities.ambient = rig.lights.ambient.intensity;
+  frame.intensities.key = rig.lights.key.intensity;
+  frame.intensities.rim = rig.lights.rim.intensity;
+  frame.intensities.fill = rig.lights.fill.intensity;
+  frame.fogDensity = rig.scene.fog.density;
+}
+
+function writePaletteToSectorPaletteFrame(frame, palette) {
+  frame.colors.ambient.setHex(palette.ambient);
+  frame.colors.key.setHex(palette.key);
+  frame.colors.rim.setHex(palette.rim);
+  frame.colors.fill.setHex(palette.fill);
+  frame.colors.fog.setHex(palette.fog);
+  frame.intensities.ambient = SECTOR_LIGHT_INTENSITIES.ambient;
+  frame.intensities.key = SECTOR_LIGHT_INTENSITIES.key;
+  frame.intensities.rim = SECTOR_LIGHT_INTENSITIES.rim;
+  frame.intensities.fill = SECTOR_LIGHT_INTENSITIES.fill;
+  frame.fogDensity = palette.fogDensity;
+}
+
+function applySectorPaletteFrame(rig, frame) {
+  rig.lights.ambient.color.copy(frame.colors.ambient);
+  rig.lights.key.color.copy(frame.colors.key);
+  rig.lights.rim.color.copy(frame.colors.rim);
+  rig.lights.fill.color.copy(frame.colors.fill);
+  rig.scene.fog.color.copy(frame.colors.fog);
+  rig.lights.ambient.intensity = frame.intensities.ambient;
+  rig.lights.key.intensity = frame.intensities.key;
+  rig.lights.rim.intensity = frame.intensities.rim;
+  rig.lights.fill.intensity = frame.intensities.fill;
+  rig.scene.fog.density = frame.fogDensity;
+}
+
+function lerpSectorPaletteFrame(rig, start, target, t) {
+  rig.lights.ambient.color.lerpColors(start.colors.ambient, target.colors.ambient, t);
+  rig.lights.key.color.lerpColors(start.colors.key, target.colors.key, t);
+  rig.lights.rim.color.lerpColors(start.colors.rim, target.colors.rim, t);
+  rig.lights.fill.color.lerpColors(start.colors.fill, target.colors.fill, t);
+  rig.scene.fog.color.lerpColors(start.colors.fog, target.colors.fog, t);
+  rig.lights.ambient.intensity = lerp(start.intensities.ambient, target.intensities.ambient, t);
+  rig.lights.key.intensity = lerp(start.intensities.key, target.intensities.key, t);
+  rig.lights.rim.intensity = lerp(start.intensities.rim, target.intensities.rim, t);
+  rig.lights.fill.intensity = lerp(start.intensities.fill, target.intensities.fill, t);
+  rig.scene.fog.density = lerp(start.fogDensity, target.fogDensity, t);
+}
+
+function lerp(a, b, t) {
+  return a + (b - a) * t;
+}
+
+function disposeObject(obj) {
   obj.traverse((c) => {
     if (c.isBatchedMesh && typeof c.dispose === 'function') c.dispose();
     else if (c.geometry && !(c.userData && (c.userData.sharedContactShadow || c.userData.sharedShieldGeo))) c.geometry.dispose();
diff --git a/src/render/starfield.js b/src/render/starfield.js
index d76965c563ac0d99166bb382577d2f6eaa4a6d0f..aecb37608592e6ff981ddaf8fd6107d17a0632e6
--- a/src/render/starfield.js
+++ b/src/render/starfield.js
@@ -116,10 +116,18 @@
   return c;
 }
 
-// --- small color helpers for sector tinting (no deps) ---
-function hexToRgb(hex) {
-  const h = hex.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
-}
+// --- small color helpers for sector tinting (no deps) ---
+function normalizeTint(tint) {
+  if (tint == null) return null;
+  if (typeof tint === 'number' && Number.isFinite(tint)) {
+    return '#' + ((tint >>> 0) & 0xffffff).toString(16).padStart(6, '0');
+  }
+  if (typeof tint === 'string') return tint.startsWith('#') ? tint : '#' + tint.replace(/^0x/i, '');
+  return null;
+}
+function hexToRgb(hex) {
+  const h = hex.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
+}
 function rgbToHex(r, g, b) {
   const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
   return '#' + c(r) + c(g) + c(b);
@@ -176,11 +184,11 @@
   ctx.restore();
 }
 
-export function createStarfield(scene, opts = {}) {
-  const layers = [];
-  const sprite = makeStarSprite();
-  let bgTexture = null;
-  let currentTint = opts.tint || null;
+export function createStarfield(scene, opts = {}) {
+  const layers = [];
+  const sprite = makeStarSprite();
+  let bgTexture = null;
+  let currentTint = normalizeTint(opts.tint);
 
   // star tints (mostly cool white/blue with a few warm + teal accents)
   const TINTS = [0xffffff, 0xcfe0ff, 0x9fb6e0, 0xfff0d8, 0x8af0d6, 0xbfd2ff];
@@ -297,13 +305,14 @@
       // GR-7: slow-rotate the distant 3D planets so they read as real spinning worlds, not billboards.
       for (const p of distantPlanets) p.mesh.rotation.y += dt * p.spin;
     },
-    // Swap the nebula mood on sector enter — each region of the galaxy reads with its own color
-    // signature (core = clean blue, industrial = rust/amber, frontier = blood-red, alien = violet).
-    setSectorTint(tint) {
-      if (tint === currentTint) return;
-      currentTint = tint || null;
-      applyBackground(currentTint);
-    },
+    // Swap the nebula mood on sector enter — each region of the galaxy reads with its own color
+    // signature (core = clean blue, industrial = rust/amber, frontier = blood-red, alien = violet).
+    setSectorTint(tint) {
+      const nextTint = normalizeTint(tint);
+      if (nextTint === currentTint) return;
+      currentTint = nextTint;
+      applyBackground(currentTint);
+    },
     setWarp() { /* extended by vfx during jump */ },
   };
 }

codex
The diff includes earlier dirty-tree lines like `check:mining:2`, `check:hitch-budget`, charting flags, and mesh-build queue work; I’m leaving those intact. I spotted one unused constant from my patch and am removing it before the full run.
apply patch
patch: completed
C:\Users\93rob\Documents\GitHub\SpaceFace\src\render\renderer.js
diff --git a/package.json b/package.json
index 0897813b9c443f97ae9d2e8ae253e77f386705d9..a869414ec6dbceebe45b9b78abd72013201579da
--- a/package.json
+++ b/package.json
@@ -74,9 +74,10 @@
     "build:sg04:release-assets": "node scripts/build-sg04-release-assets.mjs",
     "build:bundle": "node scripts/build-bundle.mjs",
     "check:bundle": "node scripts/check-bundle.mjs",
-    "check:launch-policy": "node scripts/check-launch-policy.mjs",
-    "check:non-graphics": "node scripts/check-non-graphics-ci.mjs",
-    "check:assets:live": "node scripts/probe-authored-assets-live.mjs",
+    "check:launch-policy": "node scripts/check-launch-policy.mjs",
+    "check:non-graphics": "node scripts/check-non-graphics-ci.mjs",
+    "check:sector-palettes": "node scripts/check-sector-palettes.mjs",
+    "check:assets:live": "node scripts/probe-authored-assets-live.mjs",
     "check:perf:control": "node scripts/probe-raf-control.mjs --headed --strict --width 1830 --height 973 --warmup 1000 --duration 5000",
     "check:perf": "node scripts/probe-performance-profile.mjs --headed --strict --width 1830 --height 973 --warmup 2500 --duration 7000 --diagnostic-variants",
     "check:hitch-budget": "node scripts/check-hitch-budget.mjs",
diff --git a/scripts/check-sector-palettes.mjs b/scripts/check-sector-palettes.mjs
new file mode 100644
index 0000000000000000000000000000000000000000..04318569a6d4a787b3cf451b3de0e457574fa6f1
--- /dev/null
+++ b/scripts/check-sector-palettes.mjs
@@ -0,0 +1,81 @@
+import { SECTORS, SECTOR_PALETTE_CLASSES } from '../src/data/sectors.js';
+
+const REQUIRED_FIELDS = ['key', 'rim', 'fill', 'ambient', 'fog', 'fogDensity', 'nebulaTint', 'dust'];
+const COLOR_FIELDS = ['key', 'rim', 'fill', 'ambient', 'fog', 'nebulaTint', 'dust'];
+const CLASS_ENTRIES = Object.entries(SECTOR_PALETTE_CLASSES);
+const CORE_LUMINANCE = combinedLightLuminance(SECTOR_PALETTE_CLASSES.core);
+const MIN_LUMINANCE = CORE_LUMINANCE * 0.8;
+const MAX_LUMINANCE = CORE_LUMINANCE * 1.2;
+
+const issues = [];
+const usedClasses = new Set();
+
+for (const sector of SECTORS) {
+  const palette = sector.palette;
+  if (!palette || typeof palette !== 'object') {
+    issues.push(`${sector.id}: missing palette block`);
+    continue;
+  }
+
+  for (const field of REQUIRED_FIELDS) {
+    if (!(field in palette)) issues.push(`${sector.id}: palette missing ${field}`);
+  }
+  for (const field of COLOR_FIELDS) {
+    if (!isColorHex(palette[field])) issues.push(`${sector.id}: palette.${field} must be a 0x000000-0xffffff number`);
+  }
+  if (!Number.isFinite(palette.fogDensity) || palette.fogDensity <= 0) {
+    issues.push(`${sector.id}: palette.fogDensity must be a positive finite number`);
+  }
+
+  const className = classNameForPalette(palette);
+  if (!className) issues.push(`${sector.id}: palette does not match an authored class`);
+  else usedClasses.add(className);
+
+  const luminance = combinedLightLuminance(palette);
+  if (luminance < MIN_LUMINANCE || luminance > MAX_LUMINANCE) {
+    issues.push(`${sector.id}: ambient+fill luminance ${luminance.toFixed(4)} outside ${MIN_LUMINANCE.toFixed(4)}-${MAX_LUMINANCE.toFixed(4)}`);
+  }
+}
+
+for (const [className] of CLASS_ENTRIES) {
+  if (!usedClasses.has(className)) issues.push(`palette class unused: ${className}`);
+}
+
+if (issues.length) {
+  console.error(`Sector palette check failed (${issues.length} issue${issues.length === 1 ? '' : 's'}):`);
+  for (const issue of issues) console.error(`- ${issue}`);
+  process.exit(1);
+}
+
+console.log(`Sector palettes OK: ${SECTORS.length} sectors, classes used: ${[...usedClasses].sort().join(', ')}`);
+
+function classNameForPalette(palette) {
+  for (const [className, classPalette] of CLASS_ENTRIES) {
+    if (samePalette(palette, classPalette)) return className;
+  }
+  return null;
+}
+
+function samePalette(a, b) {
+  return REQUIRED_FIELDS.every((field) => a[field] === b[field]);
+}
+
+function isColorHex(value) {
+  return Number.isInteger(value) && value >= 0x000000 && value <= 0xffffff;
+}
+
+function combinedLightLuminance(palette) {
+  return relativeLuminance(palette.ambient) + relativeLuminance(palette.fill);
+}
+
+function relativeLuminance(hex) {
+  const r = linearRgb((hex >> 16) & 0xff);
+  const g = linearRgb((hex >> 8) & 0xff);
+  const b = linearRgb(hex & 0xff);
+  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
+}
+
+function linearRgb(channel) {
+  const c = channel / 255;
+  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
+}
diff --git a/src/data/sectors.js b/src/data/sectors.js
index 9c63f69479b241fc848258e3fe2161547793fa46..1814c409089f818b6ab4758b3f0cf8f8531f2452
--- a/src/data/sectors.js
+++ b/src/data/sectors.js
@@ -10,10 +10,30 @@
 export const HAZARD_TYPES  = ['dense_asteroid', 'nebula', 'radiation', 'debris'];
 export const POI_TYPES     = ['beacon', 'derelict', 'cache', 'colony', 'anomaly', 'wormhole', 'wreck'];
 
+export const SECTOR_PALETTE_CLASSES = {
+  core: {
+    key: 0xcfe2ff, rim: 0x6a5cff, fill: 0x39d0ff, ambient: 0x42506f,
+    fog: 0x0a1430, fogDensity: 0.00026, nebulaTint: 0x1e3a6a, dust: 0x7ea7c7,
+  },
+  belt: {
+    key: 0xffd59a, rim: 0xb56d2f, fill: 0xffb13d, ambient: 0x594a42,
+    fog: 0x2a160c, fogDensity: 0.00034, nebulaTint: 0x8a4a1e, dust: 0xc0793d,
+  },
+  fringe: {
+    key: 0xffb07a, rim: 0xff3f2d, fill: 0xffaa66, ambient: 0x584343,
+    fog: 0x2a0d0a, fogDensity: 0.00042, nebulaTint: 0x8a1e1e, dust: 0xc15032,
+  },
+  anomaly: {
+    key: 0xc8b6ff, rim: 0x54ffb0, fill: 0x4ddc92, ambient: 0x494760,
+    fog: 0x160d2c, fogDensity: 0.00036, nebulaTint: 0x5a1e8a, dust: 0x79ffc8,
+  },
+};
+
 export const SECTORS = [
   {
     id: 'sector_helios_prime', name: 'Helios Prime', tier: 0, security: 0.98, charted: true,
     factionId: 'faction_scn', position: { x: 0, y: 0 }, worldRadius: 3500,
+    palette: SECTOR_PALETTE_CLASSES.core,
     // Tutorial home sector: NO hostile spawns (enemyDensity 0). A brand-new pilot must not be
     // hunted before learning the ropes; danger ramps up only in neighbouring sectors.
     trafficPerMin: 18, enemyDensity: 0, enemyLevel: [1, 2],
@@ -37,6 +57,7 @@
   {
     id: 'sector_ceres_belt', name: 'Ceres Belt', tier: 1, security: 0.72, charted: true,
     factionId: 'faction_dmc', position: { x: -3, y: 2 }, worldRadius: 4200,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 10, enemyDensity: 0.18, enemyLevel: [2, 4],
     neighbors: ['sector_helios_prime', 'sector_tethys_junction', 'sector_pallas_drift'],
     stations: [
@@ -57,6 +78,7 @@
   {
     id: 'sector_tethys_junction', name: 'Tethys Junction', tier: 1, security: 0.65, charted: true,
     factionId: 'faction_mts', position: { x: 3, y: 2 }, worldRadius: 4000,
+    palette: SECTOR_PALETTE_CLASSES.core,
     trafficPerMin: 14, enemyDensity: 0.20, enemyLevel: [2, 4],
     neighbors: ['sector_helios_prime', 'sector_ceres_belt', 'sector_vesta_forge', 'sector_io_reach'],
     stations: [
@@ -72,6 +94,7 @@
   {
     id: 'sector_vesta_forge', name: 'Vesta Forge', tier: 1, security: 0.60, charted: true,
     factionId: 'faction_dmc', position: { x: 0, y: 4 }, worldRadius: 4300,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 9, enemyDensity: 0.25, enemyLevel: [3, 5],
     neighbors: ['sector_helios_prime', 'sector_tethys_junction', 'sector_charon_expanse'],
     stations: [
@@ -89,6 +112,7 @@
   {
     id: 'sector_pallas_drift', name: 'Pallas Drift', tier: 2, security: 0.42, charted: true,
     factionId: 'faction_mts', position: { x: -5, y: 5 }, worldRadius: 4500,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 7, enemyDensity: 0.40, enemyLevel: [4, 7],
     neighbors: ['sector_ceres_belt', 'sector_io_reach', 'sector_sker_haven'],
     stations: [
@@ -109,6 +133,7 @@
   {
     id: 'sector_io_reach', name: 'Io Reach', tier: 2, security: 0.35, charted: true,
     factionId: 'faction_free', position: { x: 5, y: 5 }, worldRadius: 4600,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 5, enemyDensity: 0.50, enemyLevel: [5, 8],
     neighbors: ['sector_tethys_junction', 'sector_pallas_drift', 'sector_charon_expanse', 'sector_veil_nebula'],
     stations: [
@@ -132,6 +157,7 @@
   {
     id: 'sector_charon_expanse', name: 'Charon Expanse', tier: 2, security: 0.30, charted: true,
     factionId: 'faction_dmc', position: { x: 2, y: 7 }, worldRadius: 4800,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 4, enemyDensity: 0.50, enemyLevel: [5, 9],
     neighbors: ['sector_vesta_forge', 'sector_io_reach', 'sector_ashfall_reach'],
     stations: [
@@ -151,6 +177,7 @@
   {
     id: 'sector_sker_haven', name: 'Sker Haven', tier: 3, security: 0.08, charted: false,
     factionId: 'faction_reach', position: { x: -7, y: 8 }, worldRadius: 5000,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 0, enemyDensity: 0.70, enemyLevel: [7, 11],
     neighbors: ['sector_pallas_drift', 'sector_veil_nebula'],
     stations: [
@@ -169,6 +196,7 @@
   {
     id: 'sector_veil_nebula', name: 'Veil Nebula', tier: 3, security: 0.12, charted: false,
     factionId: 'faction_free', position: { x: 7, y: 9 }, worldRadius: 5200,
+    palette: SECTOR_PALETTE_CLASSES.anomaly,
     trafficPerMin: 0, enemyDensity: 0.65, enemyLevel: [8, 12],
     neighbors: ['sector_io_reach', 'sector_sker_haven'],
     wormholeTo: { sectorId: 'sector_ashfall_reach', gatedBy: 'tech:tech_long_range_survey' },
@@ -188,6 +216,7 @@
   {
     id: 'sector_ashfall_reach', name: 'Ashfall Reach', tier: 4, security: 0.05, charted: false,
     factionId: 'faction_vael', position: { x: 4, y: 11 }, worldRadius: 5500,
+    palette: SECTOR_PALETTE_CLASSES.anomaly,
     trafficPerMin: 0, enemyDensity: 0.80, enemyLevel: [10, 15],
     neighbors: ['sector_charon_expanse'],
     stations: [
diff --git a/src/render/renderer.js b/src/render/renderer.js
index def6420ff1bff2ac1c64dcc1add395e7851c4dbc..7b83534145db2cec91608a3a2a42dfe1ec083a9d
--- a/src/render/renderer.js
+++ b/src/render/renderer.js
@@ -15,21 +15,10 @@
 import { installDiagnostics } from './diagnostics.js';
 import { createPlanetFactory } from './planetFactory.js';
 import { precompilePipelines } from './precompile.js';
-
-// Map a sector's danger/tier to a nebula backdrop tint so each region of the galaxy has its own
-// color signature. Core (safe, low tier) = clean blue; industrial mid-ring = rust/amber; lawless
-// frontier = blood-red; alien/endgame tier 4+ = violet. Returns a hex string or null (default).
-function sectorNebulaTint(sector) {
-  if (!sector) return null;
-  const tier = sector.tier || 0;
-  const sec = sector.security != null ? sector.security : 1;
-  const danger = (1 - sec) + tier * 0.15; // blended danger metric
-  if (tier >= 4) return '#5a1e8a';        // violet — alien / lawless endgame (Veil, Ashfall)
-  if (danger > 0.7) return '#8a1e1e';     // blood-red — dangerous frontier (Io Reach, Sker)
-  if (danger > 0.45) return '#8a4a1e';    // rust/amber — industrial mid-ring (Vesta, Pallas)
-  if (danger > 0.2) return '#1e4a8a';     // deep blue — settled belt (Ceres, Tethys)
-  return '#1e3a6a';                        // clean blue — safe core (Helios Prime)
-}
+import { SECTOR_PALETTE_CLASSES } from '../data/sectors.js';
+
+const SECTOR_PALETTE_LERP_SECONDS = 1.5;
+const SECTOR_LIGHT_INTENSITIES = { ambient: 0.85, key: 1.7, rim: 0.7, fill: 0.35 };
 
 // ---- contact shadow disc (module-level cache so one texture serves all entities) ----------------
 let _shadowTex = null;
@@ -178,14 +167,15 @@
     renderer.setClearColor(0x060912, 1);
     const drawSize = applyRendererSize(renderer, state);
 
-    const scene = new THREE.Scene();
-    // Thin fog for gentle depth cueing only — the old 0.00085 erased the entire backdrop, leaving a
-    // black void. This keeps the nebula + far stars visible while still fading the deep distance.
-    scene.fog = new THREE.FogExp2(0x0a1430, 0.00026);
-    scene.add(new THREE.AmbientLight(0x42506f, 0.85));
-    const key = new THREE.DirectionalLight(0xcfe2ff, 1.7); key.position.set(60, 140, 40); scene.add(key);
-    const rim = new THREE.DirectionalLight(0x6a5cff, 0.7); rim.position.set(-70, 50, -60); scene.add(rim);
-    const fill = new THREE.DirectionalLight(0x39d0ff, 0.35); fill.position.set(20, 30, 120); scene.add(fill);
+    const scene = new THREE.Scene();
+    const corePalette = SECTOR_PALETTE_CLASSES.core;
+    // Thin fog for gentle depth cueing only — the old 0.00085 erased the entire backdrop, leaving a
+    // black void. This keeps the nebula + far stars visible while still fading the deep distance.
+    scene.fog = new THREE.FogExp2(corePalette.fog, corePalette.fogDensity);
+    const ambient = new THREE.AmbientLight(corePalette.ambient, SECTOR_LIGHT_INTENSITIES.ambient); scene.add(ambient);
+    const key = new THREE.DirectionalLight(corePalette.key, SECTOR_LIGHT_INTENSITIES.key); key.position.set(60, 140, 40); scene.add(key);
+    const rim = new THREE.DirectionalLight(corePalette.rim, SECTOR_LIGHT_INTENSITIES.rim); rim.position.set(-70, 50, -60); scene.add(rim);
+    const fill = new THREE.DirectionalLight(corePalette.fill, SECTOR_LIGHT_INTENSITIES.fill); fill.position.set(20, 30, 120); scene.add(fill);
 
     // Real shadow maps (graphics spec Workstream G). Gated behind settings.video.shadows (default
     // true). The key light becomes a shadow caster with a tight frustum that follows the player so
@@ -210,7 +200,7 @@
     }
 
     const cam = createChaseCamera(state);
-    const starfield = createStarfield(scene);
+    const starfield = createStarfield(scene, { tint: corePalette.nebulaTint });
     const vf = createVisualFactory();
     // Hero-asset registry (spec §17.3): wraps the factory's build() so the bespoke player Kestrel is
     // intercepted before the procedural visualFactory. Narrow + failure-isolated — any throw falls
@@ -283,13 +273,16 @@
     // contact-sheet references and are replaced by procedural materials / inline SVG).
     { const i = new Image(); i.src = 'assets/cinematics/menu_background.jpg'; }
 
-    this.renderer = renderer; this.scene = scene; this.cam = cam; this.starfield = starfield; this.vf = vf;
-    this.authoredPartLibraryReady = preloadAuthoredPartLibrary(renderer).catch((error) => {
-      console.warn('[render] authored part library preload failed', error);
-      return null;
-    });
-    state.render.authoredPartLibraryReady = this.authoredPartLibraryReady;
-    this._keyLight = shadowsOn ? key : null; // referenced by _updateShadowFollow() each frame
+    this.renderer = renderer; this.scene = scene; this.cam = cam; this.starfield = starfield; this.vf = vf;
+    this.authoredPartLibraryReady = preloadAuthoredPartLibrary(renderer).catch((error) => {
+      console.warn('[render] authored part library preload failed', error);
+      return null;
+    });
+    state.render.authoredPartLibraryReady = this.authoredPartLibraryReady;
+    this._sectorPaletteRig = createSectorPaletteRig(scene, ambient, key, rim, fill);
+    this._sectorPaletteTarget = corePalette;
+    state.render.sectorPalette = corePalette;
+    this._keyLight = shadowsOn ? key : null; // referenced by _updateShadowFollow() each frame
     this._shadowSettingOn = shadowsOn;
     this._shadowReceiversDirty = true;
     this._shadowReceiverCount = 0;
@@ -410,20 +403,19 @@
     // already spawned by the time this fires (enterSector spawns before its sector:enter resolves),
     // so a blind clearAllMeshes(keepPlayer) used to wipe the station/asteroids and leave the player
     // alone in empty space. reconcileMeshes() removes only meshes for entities that are gone.
-    bus.on('sector:enter', ({ sector } = {}) => {
-      this._meshReconcileDirty = true;
-      if (cam.snapToPlayer) cam.snapToPlayer();
-      this._updatePlanetBodies(sector);
-      // Tint the nebula backdrop to the sector's mood so each region of the galaxy reads with its
-      // own color signature: clean-blue core → rust/amber industrial → blood-red frontier → violet
-      // alien/endgame. Drives the whole-frame atmosphere, reinforcing the core-to-frontier gradient.
-      if (this.starfield && this.starfield.setSectorTint) {
-        this.starfield.setSectorTint(sectorNebulaTint(sector));
-      }
+    bus.on('sector:enter', ({ sector } = {}) => {
+      this._meshReconcileDirty = true;
+      if (cam.snapToPlayer) cam.snapToPlayer();
+      this._updatePlanetBodies(sector);
+      this._beginSectorPaletteTransition(sector);
       this._updateHazardVisuals(sector);
       precompilePipelines(renderer, scene, cam.obj, { sector }).catch((error) => console.warn('[render] sector pipeline precompile failed', error));
     });
-    bus.on('save:loaded', () => { this._meshReconcileDirty = true; });
+    bus.on('jump:arrive', ({ sectorId } = {}) => {
+      const sector = sectorId && state.world && state.world.sectors ? state.world.sectors[sectorId] : null;
+      this._beginSectorPaletteTransition(sector);
+    });
+    bus.on('save:loaded', () => { this._meshReconcileDirty = true; });
 
     window.addEventListener('resize', () => this.onResize());
   },
@@ -640,7 +632,7 @@
     return tex;
   },
 
-  _updateHazardVisuals(sector) {
+  _updateHazardVisuals(sector) {
     // Dispose previous hazard visuals
     for (const obj of this._hazardVisuals) {
       this.scene.remove(obj);
@@ -701,10 +693,42 @@
         this.scene.add(ring);
         this._hazardVisuals.push(ring);
       }
-    }
-  },
-
-  prepareFrame(alpha, frameDt) {
+    }
+  },
+
+  _beginSectorPaletteTransition(sector) {
+    const rig = this._sectorPaletteRig;
+    if (!rig) return;
+    const palette = sector && sector.palette ? sector.palette : SECTOR_PALETTE_CLASSES.core;
+    this.state.render.sectorPalette = palette;
+    if (palette === this._sectorPaletteTarget) return;
+
+    this._sectorPaletteTarget = palette;
+    writeRigToSectorPaletteFrame(rig.start, rig);
+    writePaletteToSectorPaletteFrame(rig.target, palette);
+    rig.elapsed = 0;
+    rig.active = true;
+
+    if (this.starfield && this.starfield.setSectorTint) {
+      this.starfield.setSectorTint(palette.nebulaTint);
+    }
+  },
+
+  _updateSectorPaletteTransition(frameDt) {
+    const rig = this._sectorPaletteRig;
+    if (!rig || !rig.active) return;
+    const dt = Number.isFinite(frameDt) ? Math.max(0, frameDt) : 0;
+    rig.elapsed = Math.min(SECTOR_PALETTE_LERP_SECONDS, rig.elapsed + dt);
+    const rawT = SECTOR_PALETTE_LERP_SECONDS > 0 ? rig.elapsed / SECTOR_PALETTE_LERP_SECONDS : 1;
+    const t = rawT * rawT * (3 - 2 * rawT);
+    lerpSectorPaletteFrame(rig, rig.start, rig.target, t);
+    if (rawT >= 1) {
+      rig.active = false;
+      applySectorPaletteFrame(rig, rig.target);
+    }
+  },
+
+  prepareFrame(alpha, frameDt) {
     // While the GL context is lost, the renderer can't draw — skip all per-frame work until
     // webglcontextrestored rebuilds GPU resources. (cam.follow etc. would run against a dead
     // renderer; the context-restore handler re-applies everything that matters when it returns.)
@@ -716,9 +740,10 @@
     syncAuthoredInstancePools(this.scene, { camera: this.cam.obj });
     this.starfield.recenter(this.cam.obj.position);
     // Background-clock for distant animation (planet cloud drift, hero-star twinkle). Integrates real
-    // frame dt scaled by state.timeScale so the cosmos respects hit-stop/pause — a death freeze
-    // momentarily stills the clouds too, keeping the backdrop in the same time model as the action.
-    const ts = (this.state.timeScale != null) ? this.state.timeScale : 1;
+    // frame dt scaled by state.timeScale so the cosmos respects hit-stop/pause — a death freeze
+    // momentarily stills the clouds too, keeping the backdrop in the same time model as the action.
+    this._updateSectorPaletteTransition(frameDt);
+    const ts = (this.state.timeScale != null) ? this.state.timeScale : 1;
     this._bgTime = (this._bgTime || 0) + frameDt * ts;
     if (this.starfield.update) this.starfield.update(frameDt, this._bgTime);
     this._updatePlanetParallax();
@@ -899,13 +924,97 @@
   return renderer.getDrawingBufferSize(_drawSize);
 }
 
-function finiteInRange(value, min, max, fallback) {
-  const n = Number(value);
-  if (!Number.isFinite(n)) return fallback;
-  return Math.max(min, Math.min(max, n));
-}
-
-function disposeObject(obj) {
+function finiteInRange(value, min, max, fallback) {
+  const n = Number(value);
+  if (!Number.isFinite(n)) return fallback;
+  return Math.max(min, Math.min(max, n));
+}
+
+function createSectorPaletteRig(scene, ambientLight, keyLight, rimLight, fillLight) {
+  const rig = {
+    scene,
+    lights: { ambient: ambientLight, key: keyLight, rim: rimLight, fill: fillLight },
+    start: createSectorPaletteFrame(),
+    target: createSectorPaletteFrame(),
+    elapsed: 0,
+    active: false,
+  };
+  writeRigToSectorPaletteFrame(rig.start, rig);
+  writeRigToSectorPaletteFrame(rig.target, rig);
+  return rig;
+}
+
+function createSectorPaletteFrame() {
+  return {
+    colors: {
+      ambient: new THREE.Color(),
+      key: new THREE.Color(),
+      rim: new THREE.Color(),
+      fill: new THREE.Color(),
+      fog: new THREE.Color(),
+    },
+    intensities: { ambient: 0, key: 0, rim: 0, fill: 0 },
+    fogDensity: 0,
+  };
+}
+
+function writeRigToSectorPaletteFrame(frame, rig) {
+  frame.colors.ambient.copy(rig.lights.ambient.color);
+  frame.colors.key.copy(rig.lights.key.color);
+  frame.colors.rim.copy(rig.lights.rim.color);
+  frame.colors.fill.copy(rig.lights.fill.color);
+  frame.colors.fog.copy(rig.scene.fog.color);
+  frame.intensities.ambient = rig.lights.ambient.intensity;
+  frame.intensities.key = rig.lights.key.intensity;
+  frame.intensities.rim = rig.lights.rim.intensity;
+  frame.intensities.fill = rig.lights.fill.intensity;
+  frame.fogDensity = rig.scene.fog.density;
+}
+
+function writePaletteToSectorPaletteFrame(frame, palette) {
+  frame.colors.ambient.setHex(palette.ambient);
+  frame.colors.key.setHex(palette.key);
+  frame.colors.rim.setHex(palette.rim);
+  frame.colors.fill.setHex(palette.fill);
+  frame.colors.fog.setHex(palette.fog);
+  frame.intensities.ambient = SECTOR_LIGHT_INTENSITIES.ambient;
+  frame.intensities.key = SECTOR_LIGHT_INTENSITIES.key;
+  frame.intensities.rim = SECTOR_LIGHT_INTENSITIES.rim;
+  frame.intensities.fill = SECTOR_LIGHT_INTENSITIES.fill;
+  frame.fogDensity = palette.fogDensity;
+}
+
+function applySectorPaletteFrame(rig, frame) {
+  rig.lights.ambient.color.copy(frame.colors.ambient);
+  rig.lights.key.color.copy(frame.colors.key);
+  rig.lights.rim.color.copy(frame.colors.rim);
+  rig.lights.fill.color.copy(frame.colors.fill);
+  rig.scene.fog.color.copy(frame.colors.fog);
+  rig.lights.ambient.intensity = frame.intensities.ambient;
+  rig.lights.key.intensity = frame.intensities.key;
+  rig.lights.rim.intensity = frame.intensities.rim;
+  rig.lights.fill.intensity = frame.intensities.fill;
+  rig.scene.fog.density = frame.fogDensity;
+}
+
+function lerpSectorPaletteFrame(rig, start, target, t) {
+  rig.lights.ambient.color.lerpColors(start.colors.ambient, target.colors.ambient, t);
+  rig.lights.key.color.lerpColors(start.colors.key, target.colors.key, t);
+  rig.lights.rim.color.lerpColors(start.colors.rim, target.colors.rim, t);
+  rig.lights.fill.color.lerpColors(start.colors.fill, target.colors.fill, t);
+  rig.scene.fog.color.lerpColors(start.colors.fog, target.colors.fog, t);
+  rig.lights.ambient.intensity = lerp(start.intensities.ambient, target.intensities.ambient, t);
+  rig.lights.key.intensity = lerp(start.intensities.key, target.intensities.key, t);
+  rig.lights.rim.intensity = lerp(start.intensities.rim, target.intensities.rim, t);
+  rig.lights.fill.intensity = lerp(start.intensities.fill, target.intensities.fill, t);
+  rig.scene.fog.density = lerp(start.fogDensity, target.fogDensity, t);
+}
+
+function lerp(a, b, t) {
+  return a + (b - a) * t;
+}
+
+function disposeObject(obj) {
   obj.traverse((c) => {
     if (c.isBatchedMesh && typeof c.dispose === 'function') c.dispose();
     else if (c.geometry && !(c.userData && (c.userData.sharedContactShadow || c.userData.sharedShieldGeo))) c.geometry.dispose();
diff --git a/src/render/starfield.js b/src/render/starfield.js
index d76965c563ac0d99166bb382577d2f6eaa4a6d0f..aecb37608592e6ff981ddaf8fd6107d17a0632e6
--- a/src/render/starfield.js
+++ b/src/render/starfield.js
@@ -116,10 +116,18 @@
   return c;
 }
 
-// --- small color helpers for sector tinting (no deps) ---
-function hexToRgb(hex) {
-  const h = hex.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
-}
+// --- small color helpers for sector tinting (no deps) ---
+function normalizeTint(tint) {
+  if (tint == null) return null;
+  if (typeof tint === 'number' && Number.isFinite(tint)) {
+    return '#' + ((tint >>> 0) & 0xffffff).toString(16).padStart(6, '0');
+  }
+  if (typeof tint === 'string') return tint.startsWith('#') ? tint : '#' + tint.replace(/^0x/i, '');
+  return null;
+}
+function hexToRgb(hex) {
+  const h = hex.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
+}
 function rgbToHex(r, g, b) {
   const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
   return '#' + c(r) + c(g) + c(b);
@@ -176,11 +184,11 @@
   ctx.restore();
 }
 
-export function createStarfield(scene, opts = {}) {
-  const layers = [];
-  const sprite = makeStarSprite();
-  let bgTexture = null;
-  let currentTint = opts.tint || null;
+export function createStarfield(scene, opts = {}) {
+  const layers = [];
+  const sprite = makeStarSprite();
+  let bgTexture = null;
+  let currentTint = normalizeTint(opts.tint);
 
   // star tints (mostly cool white/blue with a few warm + teal accents)
   const TINTS = [0xffffff, 0xcfe0ff, 0x9fb6e0, 0xfff0d8, 0x8af0d6, 0xbfd2ff];
@@ -297,13 +305,14 @@
       // GR-7: slow-rotate the distant 3D planets so they read as real spinning worlds, not billboards.
       for (const p of distantPlanets) p.mesh.rotation.y += dt * p.spin;
     },
-    // Swap the nebula mood on sector enter — each region of the galaxy reads with its own color
-    // signature (core = clean blue, industrial = rust/amber, frontier = blood-red, alien = violet).
-    setSectorTint(tint) {
-      if (tint === currentTint) return;
-      currentTint = tint || null;
-      applyBackground(currentTint);
-    },
+    // Swap the nebula mood on sector enter — each region of the galaxy reads with its own color
+    // signature (core = clean blue, industrial = rust/amber, frontier = blood-red, alien = violet).
+    setSectorTint(tint) {
+      const nextTint = normalizeTint(tint);
+      if (nextTint === currentTint) return;
+      currentTint = nextTint;
+      applyBackground(currentTint);
+    },
     setWarp() { /* extended by vfx during jump */ },
   };
 }

diff --git a/package.json b/package.json
index 0897813b9c443f97ae9d2e8ae253e77f386705d9..a869414ec6dbceebe45b9b78abd72013201579da
--- a/package.json
+++ b/package.json
@@ -74,9 +74,10 @@
     "build:sg04:release-assets": "node scripts/build-sg04-release-assets.mjs",
     "build:bundle": "node scripts/build-bundle.mjs",
     "check:bundle": "node scripts/check-bundle.mjs",
-    "check:launch-policy": "node scripts/check-launch-policy.mjs",
-    "check:non-graphics": "node scripts/check-non-graphics-ci.mjs",
-    "check:assets:live": "node scripts/probe-authored-assets-live.mjs",
+    "check:launch-policy": "node scripts/check-launch-policy.mjs",
+    "check:non-graphics": "node scripts/check-non-graphics-ci.mjs",
+    "check:sector-palettes": "node scripts/check-sector-palettes.mjs",
+    "check:assets:live": "node scripts/probe-authored-assets-live.mjs",
     "check:perf:control": "node scripts/probe-raf-control.mjs --headed --strict --width 1830 --height 973 --warmup 1000 --duration 5000",
     "check:perf": "node scripts/probe-performance-profile.mjs --headed --strict --width 1830 --height 973 --warmup 2500 --duration 7000 --diagnostic-variants",
     "check:hitch-budget": "node scripts/check-hitch-budget.mjs",
diff --git a/scripts/check-sector-palettes.mjs b/scripts/check-sector-palettes.mjs
new file mode 100644
index 0000000000000000000000000000000000000000..04318569a6d4a787b3cf451b3de0e457574fa6f1
--- /dev/null
+++ b/scripts/check-sector-palettes.mjs
@@ -0,0 +1,81 @@
+import { SECTORS, SECTOR_PALETTE_CLASSES } from '../src/data/sectors.js';
+
+const REQUIRED_FIELDS = ['key', 'rim', 'fill', 'ambient', 'fog', 'fogDensity', 'nebulaTint', 'dust'];
+const COLOR_FIELDS = ['key', 'rim', 'fill', 'ambient', 'fog', 'nebulaTint', 'dust'];
+const CLASS_ENTRIES = Object.entries(SECTOR_PALETTE_CLASSES);
+const CORE_LUMINANCE = combinedLightLuminance(SECTOR_PALETTE_CLASSES.core);
+const MIN_LUMINANCE = CORE_LUMINANCE * 0.8;
+const MAX_LUMINANCE = CORE_LUMINANCE * 1.2;
+
+const issues = [];
+const usedClasses = new Set();
+
+for (const sector of SECTORS) {
+  const palette = sector.palette;
+  if (!palette || typeof palette !== 'object') {
+    issues.push(`${sector.id}: missing palette block`);
+    continue;
+  }
+
+  for (const field of REQUIRED_FIELDS) {
+    if (!(field in palette)) issues.push(`${sector.id}: palette missing ${field}`);
+  }
+  for (const field of COLOR_FIELDS) {
+    if (!isColorHex(palette[field])) issues.push(`${sector.id}: palette.${field} must be a 0x000000-0xffffff number`);
+  }
+  if (!Number.isFinite(palette.fogDensity) || palette.fogDensity <= 0) {
+    issues.push(`${sector.id}: palette.fogDensity must be a positive finite number`);
+  }
+
+  const className = classNameForPalette(palette);
+  if (!className) issues.push(`${sector.id}: palette does not match an authored class`);
+  else usedClasses.add(className);
+
+  const luminance = combinedLightLuminance(palette);
+  if (luminance < MIN_LUMINANCE || luminance > MAX_LUMINANCE) {
+    issues.push(`${sector.id}: ambient+fill luminance ${luminance.toFixed(4)} outside ${MIN_LUMINANCE.toFixed(4)}-${MAX_LUMINANCE.toFixed(4)}`);
+  }
+}
+
+for (const [className] of CLASS_ENTRIES) {
+  if (!usedClasses.has(className)) issues.push(`palette class unused: ${className}`);
+}
+
+if (issues.length) {
+  console.error(`Sector palette check failed (${issues.length} issue${issues.length === 1 ? '' : 's'}):`);
+  for (const issue of issues) console.error(`- ${issue}`);
+  process.exit(1);
+}
+
+console.log(`Sector palettes OK: ${SECTORS.length} sectors, classes used: ${[...usedClasses].sort().join(', ')}`);
+
+function classNameForPalette(palette) {
+  for (const [className, classPalette] of CLASS_ENTRIES) {
+    if (samePalette(palette, classPalette)) return className;
+  }
+  return null;
+}
+
+function samePalette(a, b) {
+  return REQUIRED_FIELDS.every((field) => a[field] === b[field]);
+}
+
+function isColorHex(value) {
+  return Number.isInteger(value) && value >= 0x000000 && value <= 0xffffff;
+}
+
+function combinedLightLuminance(palette) {
+  return relativeLuminance(palette.ambient) + relativeLuminance(palette.fill);
+}
+
+function relativeLuminance(hex) {
+  const r = linearRgb((hex >> 16) & 0xff);
+  const g = linearRgb((hex >> 8) & 0xff);
+  const b = linearRgb(hex & 0xff);
+  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
+}
+
+function linearRgb(channel) {
+  const c = channel / 255;
+  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
+}
diff --git a/src/data/sectors.js b/src/data/sectors.js
index 9c63f69479b241fc848258e3fe2161547793fa46..1814c409089f818b6ab4758b3f0cf8f8531f2452
--- a/src/data/sectors.js
+++ b/src/data/sectors.js
@@ -10,10 +10,30 @@
 export const HAZARD_TYPES  = ['dense_asteroid', 'nebula', 'radiation', 'debris'];
 export const POI_TYPES     = ['beacon', 'derelict', 'cache', 'colony', 'anomaly', 'wormhole', 'wreck'];
 
+export const SECTOR_PALETTE_CLASSES = {
+  core: {
+    key: 0xcfe2ff, rim: 0x6a5cff, fill: 0x39d0ff, ambient: 0x42506f,
+    fog: 0x0a1430, fogDensity: 0.00026, nebulaTint: 0x1e3a6a, dust: 0x7ea7c7,
+  },
+  belt: {
+    key: 0xffd59a, rim: 0xb56d2f, fill: 0xffb13d, ambient: 0x594a42,
+    fog: 0x2a160c, fogDensity: 0.00034, nebulaTint: 0x8a4a1e, dust: 0xc0793d,
+  },
+  fringe: {
+    key: 0xffb07a, rim: 0xff3f2d, fill: 0xffaa66, ambient: 0x584343,
+    fog: 0x2a0d0a, fogDensity: 0.00042, nebulaTint: 0x8a1e1e, dust: 0xc15032,
+  },
+  anomaly: {
+    key: 0xc8b6ff, rim: 0x54ffb0, fill: 0x4ddc92, ambient: 0x494760,
+    fog: 0x160d2c, fogDensity: 0.00036, nebulaTint: 0x5a1e8a, dust: 0x79ffc8,
+  },
+};
+
 export const SECTORS = [
   {
     id: 'sector_helios_prime', name: 'Helios Prime', tier: 0, security: 0.98, charted: true,
     factionId: 'faction_scn', position: { x: 0, y: 0 }, worldRadius: 3500,
+    palette: SECTOR_PALETTE_CLASSES.core,
     // Tutorial home sector: NO hostile spawns (enemyDensity 0). A brand-new pilot must not be
     // hunted before learning the ropes; danger ramps up only in neighbouring sectors.
     trafficPerMin: 18, enemyDensity: 0, enemyLevel: [1, 2],
@@ -37,6 +57,7 @@
   {
     id: 'sector_ceres_belt', name: 'Ceres Belt', tier: 1, security: 0.72, charted: true,
     factionId: 'faction_dmc', position: { x: -3, y: 2 }, worldRadius: 4200,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 10, enemyDensity: 0.18, enemyLevel: [2, 4],
     neighbors: ['sector_helios_prime', 'sector_tethys_junction', 'sector_pallas_drift'],
     stations: [
@@ -57,6 +78,7 @@
   {
     id: 'sector_tethys_junction', name: 'Tethys Junction', tier: 1, security: 0.65, charted: true,
     factionId: 'faction_mts', position: { x: 3, y: 2 }, worldRadius: 4000,
+    palette: SECTOR_PALETTE_CLASSES.core,
     trafficPerMin: 14, enemyDensity: 0.20, enemyLevel: [2, 4],
     neighbors: ['sector_helios_prime', 'sector_ceres_belt', 'sector_vesta_forge', 'sector_io_reach'],
     stations: [
@@ -72,6 +94,7 @@
   {
     id: 'sector_vesta_forge', name: 'Vesta Forge', tier: 1, security: 0.60, charted: true,
     factionId: 'faction_dmc', position: { x: 0, y: 4 }, worldRadius: 4300,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 9, enemyDensity: 0.25, enemyLevel: [3, 5],
     neighbors: ['sector_helios_prime', 'sector_tethys_junction', 'sector_charon_expanse'],
     stations: [
@@ -89,6 +112,7 @@
   {
     id: 'sector_pallas_drift', name: 'Pallas Drift', tier: 2, security: 0.42, charted: true,
     factionId: 'faction_mts', position: { x: -5, y: 5 }, worldRadius: 4500,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 7, enemyDensity: 0.40, enemyLevel: [4, 7],
     neighbors: ['sector_ceres_belt', 'sector_io_reach', 'sector_sker_haven'],
     stations: [
@@ -109,6 +133,7 @@
   {
     id: 'sector_io_reach', name: 'Io Reach', tier: 2, security: 0.35, charted: true,
     factionId: 'faction_free', position: { x: 5, y: 5 }, worldRadius: 4600,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 5, enemyDensity: 0.50, enemyLevel: [5, 8],
     neighbors: ['sector_tethys_junction', 'sector_pallas_drift', 'sector_charon_expanse', 'sector_veil_nebula'],
     stations: [
@@ -132,6 +157,7 @@
   {
     id: 'sector_charon_expanse', name: 'Charon Expanse', tier: 2, security: 0.30, charted: true,
     factionId: 'faction_dmc', position: { x: 2, y: 7 }, worldRadius: 4800,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 4, enemyDensity: 0.50, enemyLevel: [5, 9],
     neighbors: ['sector_vesta_forge', 'sector_io_reach', 'sector_ashfall_reach'],
     stations: [
@@ -151,6 +177,7 @@
   {
     id: 'sector_sker_haven', name: 'Sker Haven', tier: 3, security: 0.08, charted: false,
     factionId: 'faction_reach', position: { x: -7, y: 8 }, worldRadius: 5000,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 0, enemyDensity: 0.70, enemyLevel: [7, 11],
     neighbors: ['sector_pallas_drift', 'sector_veil_nebula'],
     stations: [
@@ -169,6 +196,7 @@
   {
     id: 'sector_veil_nebula', name: 'Veil Nebula', tier: 3, security: 0.12, charted: false,
     factionId: 'faction_free', position: { x: 7, y: 9 }, worldRadius: 5200,
+    palette: SECTOR_PALETTE_CLASSES.anomaly,
     trafficPerMin: 0, enemyDensity: 0.65, enemyLevel: [8, 12],
     neighbors: ['sector_io_reach', 'sector_sker_haven'],
     wormholeTo: { sectorId: 'sector_ashfall_reach', gatedBy: 'tech:tech_long_range_survey' },
@@ -188,6 +216,7 @@
   {
     id: 'sector_ashfall_reach', name: 'Ashfall Reach', tier: 4, security: 0.05, charted: false,
     factionId: 'faction_vael', position: { x: 4, y: 11 }, worldRadius: 5500,
+    palette: SECTOR_PALETTE_CLASSES.anomaly,
     trafficPerMin: 0, enemyDensity: 0.80, enemyLevel: [10, 15],
     neighbors: ['sector_charon_expanse'],
     stations: [
diff --git a/src/render/renderer.js b/src/render/renderer.js
index def6420ff1bff2ac1c64dcc1add395e7851c4dbc..7b83534145db2cec91608a3a2a42dfe1ec083a9d
--- a/src/render/renderer.js
+++ b/src/render/renderer.js
@@ -15,21 +15,10 @@
 import { installDiagnostics } from './diagnostics.js';
 import { createPlanetFactory } from './planetFactory.js';
 import { precompilePipelines } from './precompile.js';
-
-// Map a sector's danger/tier to a nebula backdrop tint so each region of the galaxy has its own
-// color signature. Core (safe, low tier) = clean blue; industrial mid-ring = rust/amber; lawless
-// frontier = blood-red; alien/endgame tier 4+ = violet. Returns a hex string or null (default).
-function sectorNebulaTint(sector) {
-  if (!sector) return null;
-  const tier = sector.tier || 0;
-  const sec = sector.security != null ? sector.security : 1;
-  const danger = (1 - sec) + tier * 0.15; // blended danger metric
-  if (tier >= 4) return '#5a1e8a';        // violet — alien / lawless endgame (Veil, Ashfall)
-  if (danger > 0.7) return '#8a1e1e';     // blood-red — dangerous frontier (Io Reach, Sker)
-  if (danger > 0.45) return '#8a4a1e';    // rust/amber — industrial mid-ring (Vesta, Pallas)
-  if (danger > 0.2) return '#1e4a8a';     // deep blue — settled belt (Ceres, Tethys)
-  return '#1e3a6a';                        // clean blue — safe core (Helios Prime)
-}
+import { SECTOR_PALETTE_CLASSES } from '../data/sectors.js';
+
+const SECTOR_PALETTE_LERP_SECONDS = 1.5;
+const SECTOR_LIGHT_INTENSITIES = { ambient: 0.85, key: 1.7, rim: 0.7, fill: 0.35 };
 
 // ---- contact shadow disc (module-level cache so one texture serves all entities) ----------------
 let _shadowTex = null;
@@ -178,14 +167,15 @@
     renderer.setClearColor(0x060912, 1);
     const drawSize = applyRendererSize(renderer, state);
 
-    const scene = new THREE.Scene();
-    // Thin fog for gentle depth cueing only — the old 0.00085 erased the entire backdrop, leaving a
-    // black void. This keeps the nebula + far stars visible while still fading the deep distance.
-    scene.fog = new THREE.FogExp2(0x0a1430, 0.00026);
-    scene.add(new THREE.AmbientLight(0x42506f, 0.85));
-    const key = new THREE.DirectionalLight(0xcfe2ff, 1.7); key.position.set(60, 140, 40); scene.add(key);
-    const rim = new THREE.DirectionalLight(0x6a5cff, 0.7); rim.position.set(-70, 50, -60); scene.add(rim);
-    const fill = new THREE.DirectionalLight(0x39d0ff, 0.35); fill.position.set(20, 30, 120); scene.add(fill);
+    const scene = new THREE.Scene();
+    const corePalette = SECTOR_PALETTE_CLASSES.core;
+    // Thin fog for gentle depth cueing only — the old 0.00085 erased the entire backdrop, leaving a
+    // black void. This keeps the nebula + far stars visible while still fading the deep distance.
+    scene.fog = new THREE.FogExp2(corePalette.fog, corePalette.fogDensity);
+    const ambient = new THREE.AmbientLight(corePalette.ambient, SECTOR_LIGHT_INTENSITIES.ambient); scene.add(ambient);
+    const key = new THREE.DirectionalLight(corePalette.key, SECTOR_LIGHT_INTENSITIES.key); key.position.set(60, 140, 40); scene.add(key);
+    const rim = new THREE.DirectionalLight(corePalette.rim, SECTOR_LIGHT_INTENSITIES.rim); rim.position.set(-70, 50, -60); scene.add(rim);
+    const fill = new THREE.DirectionalLight(corePalette.fill, SECTOR_LIGHT_INTENSITIES.fill); fill.position.set(20, 30, 120); scene.add(fill);
 
     // Real shadow maps (graphics spec Workstream G). Gated behind settings.video.shadows (default
     // true). The key light becomes a shadow caster with a tight frustum that follows the player so
@@ -210,7 +200,7 @@
     }
 
     const cam = createChaseCamera(state);
-    const starfield = createStarfield(scene);
+    const starfield = createStarfield(scene, { tint: corePalette.nebulaTint });
     const vf = createVisualFactory();
     // Hero-asset registry (spec §17.3): wraps the factory's build() so the bespoke player Kestrel is
     // intercepted before the procedural visualFactory. Narrow + failure-isolated — any throw falls
@@ -283,13 +273,16 @@
     // contact-sheet references and are replaced by procedural materials / inline SVG).
     { const i = new Image(); i.src = 'assets/cinematics/menu_background.jpg'; }
 
-    this.renderer = renderer; this.scene = scene; this.cam = cam; this.starfield = starfield; this.vf = vf;
-    this.authoredPartLibraryReady = preloadAuthoredPartLibrary(renderer).catch((error) => {
-      console.warn('[render] authored part library preload failed', error);
-      return null;
-    });
-    state.render.authoredPartLibraryReady = this.authoredPartLibraryReady;
-    this._keyLight = shadowsOn ? key : null; // referenced by _updateShadowFollow() each frame
+    this.renderer = renderer; this.scene = scene; this.cam = cam; this.starfield = starfield; this.vf = vf;
+    this.authoredPartLibraryReady = preloadAuthoredPartLibrary(renderer).catch((error) => {
+      console.warn('[render] authored part library preload failed', error);
+      return null;
+    });
+    state.render.authoredPartLibraryReady = this.authoredPartLibraryReady;
+    this._sectorPaletteRig = createSectorPaletteRig(scene, ambient, key, rim, fill);
+    this._sectorPaletteTarget = corePalette;
+    state.render.sectorPalette = corePalette;
+    this._keyLight = shadowsOn ? key : null; // referenced by _updateShadowFollow() each frame
     this._shadowSettingOn = shadowsOn;
     this._shadowReceiversDirty = true;
     this._shadowReceiverCount = 0;
@@ -410,20 +403,19 @@
     // already spawned by the time this fires (enterSector spawns before its sector:enter resolves),
     // so a blind clearAllMeshes(keepPlayer) used to wipe the station/asteroids and leave the player
     // alone in empty space. reconcileMeshes() removes only meshes for entities that are gone.
-    bus.on('sector:enter', ({ sector } = {}) => {
-      this._meshReconcileDirty = true;
-      if (cam.snapToPlayer) cam.snapToPlayer();
-      this._updatePlanetBodies(sector);
-      // Tint the nebula backdrop to the sector's mood so each region of the galaxy reads with its
-      // own color signature: clean-blue core → rust/amber industrial → blood-red frontier → violet
-      // alien/endgame. Drives the whole-frame atmosphere, reinforcing the core-to-frontier gradient.
-      if (this.starfield && this.starfield.setSectorTint) {
-        this.starfield.setSectorTint(sectorNebulaTint(sector));
-      }
+    bus.on('sector:enter', ({ sector } = {}) => {
+      this._meshReconcileDirty = true;
+      if (cam.snapToPlayer) cam.snapToPlayer();
+      this._updatePlanetBodies(sector);
+      this._beginSectorPaletteTransition(sector);
       this._updateHazardVisuals(sector);
       precompilePipelines(renderer, scene, cam.obj, { sector }).catch((error) => console.warn('[render] sector pipeline precompile failed', error));
     });
-    bus.on('save:loaded', () => { this._meshReconcileDirty = true; });
+    bus.on('jump:arrive', ({ sectorId } = {}) => {
+      const sector = sectorId && state.world && state.world.sectors ? state.world.sectors[sectorId] : null;
+      this._beginSectorPaletteTransition(sector);
+    });
+    bus.on('save:loaded', () => { this._meshReconcileDirty = true; });
 
     window.addEventListener('resize', () => this.onResize());
   },
@@ -640,7 +632,7 @@
     return tex;
   },
 
-  _updateHazardVisuals(sector) {
+  _updateHazardVisuals(sector) {
     // Dispose previous hazard visuals
     for (const obj of this._hazardVisuals) {
       this.scene.remove(obj);
@@ -701,10 +693,42 @@
         this.scene.add(ring);
         this._hazardVisuals.push(ring);
       }
-    }
-  },
-
-  prepareFrame(alpha, frameDt) {
+    }
+  },
+
+  _beginSectorPaletteTransition(sector) {
+    const rig = this._sectorPaletteRig;
+    if (!rig) return;
+    const palette = sector && sector.palette ? sector.palette : SECTOR_PALETTE_CLASSES.core;
+    this.state.render.sectorPalette = palette;
+    if (palette === this._sectorPaletteTarget) return;
+
+    this._sectorPaletteTarget = palette;
+    writeRigToSectorPaletteFrame(rig.start, rig);
+    writePaletteToSectorPaletteFrame(rig.target, palette);
+    rig.elapsed = 0;
+    rig.active = true;
+
+    if (this.starfield && this.starfield.setSectorTint) {
+      this.starfield.setSectorTint(palette.nebulaTint);
+    }
+  },
+
+  _updateSectorPaletteTransition(frameDt) {
+    const rig = this._sectorPaletteRig;
+    if (!rig || !rig.active) return;
+    const dt = Number.isFinite(frameDt) ? Math.max(0, frameDt) : 0;
+    rig.elapsed = Math.min(SECTOR_PALETTE_LERP_SECONDS, rig.elapsed + dt);
+    const rawT = SECTOR_PALETTE_LERP_SECONDS > 0 ? rig.elapsed / SECTOR_PALETTE_LERP_SECONDS : 1;
+    const t = rawT * rawT * (3 - 2 * rawT);
+    lerpSectorPaletteFrame(rig, rig.start, rig.target, t);
+    if (rawT >= 1) {
+      rig.active = false;
+      applySectorPaletteFrame(rig, rig.target);
+    }
+  },
+
+  prepareFrame(alpha, frameDt) {
     // While the GL context is lost, the renderer can't draw — skip all per-frame work until
     // webglcontextrestored rebuilds GPU resources. (cam.follow etc. would run against a dead
     // renderer; the context-restore handler re-applies everything that matters when it returns.)
@@ -716,9 +740,10 @@
     syncAuthoredInstancePools(this.scene, { camera: this.cam.obj });
     this.starfield.recenter(this.cam.obj.position);
     // Background-clock for distant animation (planet cloud drift, hero-star twinkle). Integrates real
-    // frame dt scaled by state.timeScale so the cosmos respects hit-stop/pause — a death freeze
-    // momentarily stills the clouds too, keeping the backdrop in the same time model as the action.
-    const ts = (this.state.timeScale != null) ? this.state.timeScale : 1;
+    // frame dt scaled by state.timeScale so the cosmos respects hit-stop/pause — a death freeze
+    // momentarily stills the clouds too, keeping the backdrop in the same time model as the action.
+    this._updateSectorPaletteTransition(frameDt);
+    const ts = (this.state.timeScale != null) ? this.state.timeScale : 1;
     this._bgTime = (this._bgTime || 0) + frameDt * ts;
     if (this.starfield.update) this.starfield.update(frameDt, this._bgTime);
     this._updatePlanetParallax();
@@ -899,13 +924,97 @@
   return renderer.getDrawingBufferSize(_drawSize);
 }
 
-function finiteInRange(value, min, max, fallback) {
-  const n = Number(value);
-  if (!Number.isFinite(n)) return fallback;
-  return Math.max(min, Math.min(max, n));
-}
-
-function disposeObject(obj) {
+function finiteInRange(value, min, max, fallback) {
+  const n = Number(value);
+  if (!Number.isFinite(n)) return fallback;
+  return Math.max(min, Math.min(max, n));
+}
+
+function createSectorPaletteRig(scene, ambientLight, keyLight, rimLight, fillLight) {
+  const rig = {
+    scene,
+    lights: { ambient: ambientLight, key: keyLight, rim: rimLight, fill: fillLight },
+    start: createSectorPaletteFrame(),
+    target: createSectorPaletteFrame(),
+    elapsed: 0,
+    active: false,
+  };
+  writeRigToSectorPaletteFrame(rig.start, rig);
+  writeRigToSectorPaletteFrame(rig.target, rig);
+  return rig;
+}
+
+function createSectorPaletteFrame() {
+  return {
+    colors: {
+      ambient: new THREE.Color(),
+      key: new THREE.Color(),
+      rim: new THREE.Color(),
+      fill: new THREE.Color(),
+      fog: new THREE.Color(),
+    },
+    intensities: { ambient: 0, key: 0, rim: 0, fill: 0 },
+    fogDensity: 0,
+  };
+}
+
+function writeRigToSectorPaletteFrame(frame, rig) {
+  frame.colors.ambient.copy(rig.lights.ambient.color);
+  frame.colors.key.copy(rig.lights.key.color);
+  frame.colors.rim.copy(rig.lights.rim.color);
+  frame.colors.fill.copy(rig.lights.fill.color);
+  frame.colors.fog.copy(rig.scene.fog.color);
+  frame.intensities.ambient = rig.lights.ambient.intensity;
+  frame.intensities.key = rig.lights.key.intensity;
+  frame.intensities.rim = rig.lights.rim.intensity;
+  frame.intensities.fill = rig.lights.fill.intensity;
+  frame.fogDensity = rig.scene.fog.density;
+}
+
+function writePaletteToSectorPaletteFrame(frame, palette) {
+  frame.colors.ambient.setHex(palette.ambient);
+  frame.colors.key.setHex(palette.key);
+  frame.colors.rim.setHex(palette.rim);
+  frame.colors.fill.setHex(palette.fill);
+  frame.colors.fog.setHex(palette.fog);
+  frame.intensities.ambient = SECTOR_LIGHT_INTENSITIES.ambient;
+  frame.intensities.key = SECTOR_LIGHT_INTENSITIES.key;
+  frame.intensities.rim = SECTOR_LIGHT_INTENSITIES.rim;
+  frame.intensities.fill = SECTOR_LIGHT_INTENSITIES.fill;
+  frame.fogDensity = palette.fogDensity;
+}
+
+function applySectorPaletteFrame(rig, frame) {
+  rig.lights.ambient.color.copy(frame.colors.ambient);
+  rig.lights.key.color.copy(frame.colors.key);
+  rig.lights.rim.color.copy(frame.colors.rim);
+  rig.lights.fill.color.copy(frame.colors.fill);
+  rig.scene.fog.color.copy(frame.colors.fog);
+  rig.lights.ambient.intensity = frame.intensities.ambient;
+  rig.lights.key.intensity = frame.intensities.key;
+  rig.lights.rim.intensity = frame.intensities.rim;
+  rig.lights.fill.intensity = frame.intensities.fill;
+  rig.scene.fog.density = frame.fogDensity;
+}
+
+function lerpSectorPaletteFrame(rig, start, target, t) {
+  rig.lights.ambient.color.lerpColors(start.colors.ambient, target.colors.ambient, t);
+  rig.lights.key.color.lerpColors(start.colors.key, target.colors.key, t);
+  rig.lights.rim.color.lerpColors(start.colors.rim, target.colors.rim, t);
+  rig.lights.fill.color.lerpColors(start.colors.fill, target.colors.fill, t);
+  rig.scene.fog.color.lerpColors(start.colors.fog, target.colors.fog, t);
+  rig.lights.ambient.intensity = lerp(start.intensities.ambient, target.intensities.ambient, t);
+  rig.lights.key.intensity = lerp(start.intensities.key, target.intensities.key, t);
+  rig.lights.rim.intensity = lerp(start.intensities.rim, target.intensities.rim, t);
+  rig.lights.fill.intensity = lerp(start.intensities.fill, target.intensities.fill, t);
+  rig.scene.fog.density = lerp(start.fogDensity, target.fogDensity, t);
+}
+
+function lerp(a, b, t) {
+  return a + (b - a) * t;
+}
+
+function disposeObject(obj) {
   obj.traverse((c) => {
     if (c.isBatchedMesh && typeof c.dispose === 'function') c.dispose();
     else if (c.geometry && !(c.userData && (c.userData.sharedContactShadow || c.userData.sharedShieldGeo))) c.geometry.dispose();
diff --git a/src/render/starfield.js b/src/render/starfield.js
index d76965c563ac0d99166bb382577d2f6eaa4a6d0f..aecb37608592e6ff981ddaf8fd6107d17a0632e6
--- a/src/render/starfield.js
+++ b/src/render/starfield.js
@@ -116,10 +116,18 @@
   return c;
 }
 
-// --- small color helpers for sector tinting (no deps) ---
-function hexToRgb(hex) {
-  const h = hex.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
-}
+// --- small color helpers for sector tinting (no deps) ---
+function normalizeTint(tint) {
+  if (tint == null) return null;
+  if (typeof tint === 'number' && Number.isFinite(tint)) {
+    return '#' + ((tint >>> 0) & 0xffffff).toString(16).padStart(6, '0');
+  }
+  if (typeof tint === 'string') return tint.startsWith('#') ? tint : '#' + tint.replace(/^0x/i, '');
+  return null;
+}
+function hexToRgb(hex) {
+  const h = hex.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
+}
 function rgbToHex(r, g, b) {
   const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
   return '#' + c(r) + c(g) + c(b);
@@ -176,11 +184,11 @@
   ctx.restore();
 }
 
-export function createStarfield(scene, opts = {}) {
-  const layers = [];
-  const sprite = makeStarSprite();
-  let bgTexture = null;
-  let currentTint = opts.tint || null;
+export function createStarfield(scene, opts = {}) {
+  const layers = [];
+  const sprite = makeStarSprite();
+  let bgTexture = null;
+  let currentTint = normalizeTint(opts.tint);
 
   // star tints (mostly cool white/blue with a few warm + teal accents)
   const TINTS = [0xffffff, 0xcfe0ff, 0x9fb6e0, 0xfff0d8, 0x8af0d6, 0xbfd2ff];
@@ -297,13 +305,14 @@
       // GR-7: slow-rotate the distant 3D planets so they read as real spinning worlds, not billboards.
       for (const p of distantPlanets) p.mesh.rotation.y += dt * p.spin;
     },
-    // Swap the nebula mood on sector enter — each region of the galaxy reads with its own color
-    // signature (core = clean blue, industrial = rust/amber, frontier = blood-red, alien = violet).
-    setSectorTint(tint) {
-      if (tint === currentTint) return;
-      currentTint = tint || null;
-      applyBackground(currentTint);
-    },
+    // Swap the nebula mood on sector enter — each region of the galaxy reads with its own color
+    // signature (core = clean blue, industrial = rust/amber, frontier = blood-red, alien = violet).
+    setSectorTint(tint) {
+      const nextTint = normalizeTint(tint);
+      if (nextTint === currentTint) return;
+      currentTint = nextTint;
+      applyBackground(currentTint);
+    },
     setWarp() { /* extended by vfx during jump */ },
   };
 }

codex
Syntax checks are clean. I’m starting the requested verification chain now; `check:non-graphics` may take a bit, so I’ll report any failing script output if it trips.
exec
"C:\\Users\\93rob\\AppData\\Local\\Microsoft\\WindowsApps\\pwsh.exe" -Command 'node scripts/check-sector-palettes.mjs && node scripts/check-data.mjs && npm run check:non-graphics' in C:\Users\93rob\Documents\GitHub\SpaceFace
diff --git a/package.json b/package.json
index 0897813b9c443f97ae9d2e8ae253e77f386705d9..a869414ec6dbceebe45b9b78abd72013201579da
--- a/package.json
+++ b/package.json
@@ -74,9 +74,10 @@
     "build:sg04:release-assets": "node scripts/build-sg04-release-assets.mjs",
     "build:bundle": "node scripts/build-bundle.mjs",
     "check:bundle": "node scripts/check-bundle.mjs",
-    "check:launch-policy": "node scripts/check-launch-policy.mjs",
-    "check:non-graphics": "node scripts/check-non-graphics-ci.mjs",
-    "check:assets:live": "node scripts/probe-authored-assets-live.mjs",
+    "check:launch-policy": "node scripts/check-launch-policy.mjs",
+    "check:non-graphics": "node scripts/check-non-graphics-ci.mjs",
+    "check:sector-palettes": "node scripts/check-sector-palettes.mjs",
+    "check:assets:live": "node scripts/probe-authored-assets-live.mjs",
     "check:perf:control": "node scripts/probe-raf-control.mjs --headed --strict --width 1830 --height 973 --warmup 1000 --duration 5000",
     "check:perf": "node scripts/probe-performance-profile.mjs --headed --strict --width 1830 --height 973 --warmup 2500 --duration 7000 --diagnostic-variants",
     "check:hitch-budget": "node scripts/check-hitch-budget.mjs",
diff --git a/scripts/check-sector-palettes.mjs b/scripts/check-sector-palettes.mjs
new file mode 100644
index 0000000000000000000000000000000000000000..04318569a6d4a787b3cf451b3de0e457574fa6f1
--- /dev/null
+++ b/scripts/check-sector-palettes.mjs
@@ -0,0 +1,81 @@
+import { SECTORS, SECTOR_PALETTE_CLASSES } from '../src/data/sectors.js';
+
+const REQUIRED_FIELDS = ['key', 'rim', 'fill', 'ambient', 'fog', 'fogDensity', 'nebulaTint', 'dust'];
+const COLOR_FIELDS = ['key', 'rim', 'fill', 'ambient', 'fog', 'nebulaTint', 'dust'];
+const CLASS_ENTRIES = Object.entries(SECTOR_PALETTE_CLASSES);
+const CORE_LUMINANCE = combinedLightLuminance(SECTOR_PALETTE_CLASSES.core);
+const MIN_LUMINANCE = CORE_LUMINANCE * 0.8;
+const MAX_LUMINANCE = CORE_LUMINANCE * 1.2;
+
+const issues = [];
+const usedClasses = new Set();
+
+for (const sector of SECTORS) {
+  const palette = sector.palette;
+  if (!palette || typeof palette !== 'object') {
+    issues.push(`${sector.id}: missing palette block`);
+    continue;
+  }
+
+  for (const field of REQUIRED_FIELDS) {
+    if (!(field in palette)) issues.push(`${sector.id}: palette missing ${field}`);
+  }
+  for (const field of COLOR_FIELDS) {
+    if (!isColorHex(palette[field])) issues.push(`${sector.id}: palette.${field} must be a 0x000000-0xffffff number`);
+  }
+  if (!Number.isFinite(palette.fogDensity) || palette.fogDensity <= 0) {
+    issues.push(`${sector.id}: palette.fogDensity must be a positive finite number`);
+  }
+
+  const className = classNameForPalette(palette);
+  if (!className) issues.push(`${sector.id}: palette does not match an authored class`);
+  else usedClasses.add(className);
+
+  const luminance = combinedLightLuminance(palette);
+  if (luminance < MIN_LUMINANCE || luminance > MAX_LUMINANCE) {
+    issues.push(`${sector.id}: ambient+fill luminance ${luminance.toFixed(4)} outside ${MIN_LUMINANCE.toFixed(4)}-${MAX_LUMINANCE.toFixed(4)}`);
+  }
+}
+
+for (const [className] of CLASS_ENTRIES) {
+  if (!usedClasses.has(className)) issues.push(`palette class unused: ${className}`);
+}
+
+if (issues.length) {
+  console.error(`Sector palette check failed (${issues.length} issue${issues.length === 1 ? '' : 's'}):`);
+  for (const issue of issues) console.error(`- ${issue}`);
+  process.exit(1);
+}
+
+console.log(`Sector palettes OK: ${SECTORS.length} sectors, classes used: ${[...usedClasses].sort().join(', ')}`);
+
+function classNameForPalette(palette) {
+  for (const [className, classPalette] of CLASS_ENTRIES) {
+    if (samePalette(palette, classPalette)) return className;
+  }
+  return null;
+}
+
+function samePalette(a, b) {
+  return REQUIRED_FIELDS.every((field) => a[field] === b[field]);
+}
+
+function isColorHex(value) {
+  return Number.isInteger(value) && value >= 0x000000 && value <= 0xffffff;
+}
+
+function combinedLightLuminance(palette) {
+  return relativeLuminance(palette.ambient) + relativeLuminance(palette.fill);
+}
+
+function relativeLuminance(hex) {
+  const r = linearRgb((hex >> 16) & 0xff);
+  const g = linearRgb((hex >> 8) & 0xff);
+  const b = linearRgb(hex & 0xff);
+  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
+}
+
+function linearRgb(channel) {
+  const c = channel / 255;
+  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
+}
diff --git a/src/data/sectors.js b/src/data/sectors.js
index 9c63f69479b241fc848258e3fe2161547793fa46..1814c409089f818b6ab4758b3f0cf8f8531f2452
--- a/src/data/sectors.js
+++ b/src/data/sectors.js
@@ -10,10 +10,30 @@
 export const HAZARD_TYPES  = ['dense_asteroid', 'nebula', 'radiation', 'debris'];
 export const POI_TYPES     = ['beacon', 'derelict', 'cache', 'colony', 'anomaly', 'wormhole', 'wreck'];
 
+export const SECTOR_PALETTE_CLASSES = {
+  core: {
+    key: 0xcfe2ff, rim: 0x6a5cff, fill: 0x39d0ff, ambient: 0x42506f,
+    fog: 0x0a1430, fogDensity: 0.00026, nebulaTint: 0x1e3a6a, dust: 0x7ea7c7,
+  },
+  belt: {
+    key: 0xffd59a, rim: 0xb56d2f, fill: 0xffb13d, ambient: 0x594a42,
+    fog: 0x2a160c, fogDensity: 0.00034, nebulaTint: 0x8a4a1e, dust: 0xc0793d,
+  },
+  fringe: {
+    key: 0xffb07a, rim: 0xff3f2d, fill: 0xffaa66, ambient: 0x584343,
+    fog: 0x2a0d0a, fogDensity: 0.00042, nebulaTint: 0x8a1e1e, dust: 0xc15032,
+  },
+  anomaly: {
+    key: 0xc8b6ff, rim: 0x54ffb0, fill: 0x4ddc92, ambient: 0x494760,
+    fog: 0x160d2c, fogDensity: 0.00036, nebulaTint: 0x5a1e8a, dust: 0x79ffc8,
+  },
+};
+
 export const SECTORS = [
   {
     id: 'sector_helios_prime', name: 'Helios Prime', tier: 0, security: 0.98, charted: true,
     factionId: 'faction_scn', position: { x: 0, y: 0 }, worldRadius: 3500,
+    palette: SECTOR_PALETTE_CLASSES.core,
     // Tutorial home sector: NO hostile spawns (enemyDensity 0). A brand-new pilot must not be
     // hunted before learning the ropes; danger ramps up only in neighbouring sectors.
     trafficPerMin: 18, enemyDensity: 0, enemyLevel: [1, 2],
@@ -37,6 +57,7 @@
   {
     id: 'sector_ceres_belt', name: 'Ceres Belt', tier: 1, security: 0.72, charted: true,
     factionId: 'faction_dmc', position: { x: -3, y: 2 }, worldRadius: 4200,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 10, enemyDensity: 0.18, enemyLevel: [2, 4],
     neighbors: ['sector_helios_prime', 'sector_tethys_junction', 'sector_pallas_drift'],
     stations: [
@@ -57,6 +78,7 @@
   {
     id: 'sector_tethys_junction', name: 'Tethys Junction', tier: 1, security: 0.65, charted: true,
     factionId: 'faction_mts', position: { x: 3, y: 2 }, worldRadius: 4000,
+    palette: SECTOR_PALETTE_CLASSES.core,
     trafficPerMin: 14, enemyDensity: 0.20, enemyLevel: [2, 4],
     neighbors: ['sector_helios_prime', 'sector_ceres_belt', 'sector_vesta_forge', 'sector_io_reach'],
     stations: [
@@ -72,6 +94,7 @@
   {
     id: 'sector_vesta_forge', name: 'Vesta Forge', tier: 1, security: 0.60, charted: true,
     factionId: 'faction_dmc', position: { x: 0, y: 4 }, worldRadius: 4300,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 9, enemyDensity: 0.25, enemyLevel: [3, 5],
     neighbors: ['sector_helios_prime', 'sector_tethys_junction', 'sector_charon_expanse'],
     stations: [
@@ -89,6 +112,7 @@
   {
     id: 'sector_pallas_drift', name: 'Pallas Drift', tier: 2, security: 0.42, charted: true,
     factionId: 'faction_mts', position: { x: -5, y: 5 }, worldRadius: 4500,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 7, enemyDensity: 0.40, enemyLevel: [4, 7],
     neighbors: ['sector_ceres_belt', 'sector_io_reach', 'sector_sker_haven'],
     stations: [
@@ -109,6 +133,7 @@
   {
     id: 'sector_io_reach', name: 'Io Reach', tier: 2, security: 0.35, charted: true,
     factionId: 'faction_free', position: { x: 5, y: 5 }, worldRadius: 4600,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 5, enemyDensity: 0.50, enemyLevel: [5, 8],
     neighbors: ['sector_tethys_junction', 'sector_pallas_drift', 'sector_charon_expanse', 'sector_veil_nebula'],
     stations: [
@@ -132,6 +157,7 @@
   {
     id: 'sector_charon_expanse', name: 'Charon Expanse', tier: 2, security: 0.30, charted: true,
     factionId: 'faction_dmc', position: { x: 2, y: 7 }, worldRadius: 4800,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 4, enemyDensity: 0.50, enemyLevel: [5, 9],
     neighbors: ['sector_vesta_forge', 'sector_io_reach', 'sector_ashfall_reach'],
     stations: [
@@ -151,6 +177,7 @@
   {
     id: 'sector_sker_haven', name: 'Sker Haven', tier: 3, security: 0.08, charted: false,
     factionId: 'faction_reach', position: { x: -7, y: 8 }, worldRadius: 5000,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 0, enemyDensity: 0.70, enemyLevel: [7, 11],
     neighbors: ['sector_pallas_drift', 'sector_veil_nebula'],
     stations: [
@@ -169,6 +196,7 @@
   {
     id: 'sector_veil_nebula', name: 'Veil Nebula', tier: 3, security: 0.12, charted: false,
     factionId: 'faction_free', position: { x: 7, y: 9 }, worldRadius: 5200,
+    palette: SECTOR_PALETTE_CLASSES.anomaly,
     trafficPerMin: 0, enemyDensity: 0.65, enemyLevel: [8, 12],
     neighbors: ['sector_io_reach', 'sector_sker_haven'],
     wormholeTo: { sectorId: 'sector_ashfall_reach', gatedBy: 'tech:tech_long_range_survey' },
@@ -188,6 +216,7 @@
   {
     id: 'sector_ashfall_reach', name: 'Ashfall Reach', tier: 4, security: 0.05, charted: false,
     factionId: 'faction_vael', position: { x: 4, y: 11 }, worldRadius: 5500,
+    palette: SECTOR_PALETTE_CLASSES.anomaly,
     trafficPerMin: 0, enemyDensity: 0.80, enemyLevel: [10, 15],
     neighbors: ['sector_charon_expanse'],
     stations: [
diff --git a/src/render/renderer.js b/src/render/renderer.js
index def6420ff1bff2ac1c64dcc1add395e7851c4dbc..7b83534145db2cec91608a3a2a42dfe1ec083a9d
--- a/src/render/renderer.js
+++ b/src/render/renderer.js
@@ -15,21 +15,10 @@
 import { installDiagnostics } from './diagnostics.js';
 import { createPlanetFactory } from './planetFactory.js';
 import { precompilePipelines } from './precompile.js';
-
-// Map a sector's danger/tier to a nebula backdrop tint so each region of the galaxy has its own
-// color signature. Core (safe, low tier) = clean blue; industrial mid-ring = rust/amber; lawless
-// frontier = blood-red; alien/endgame tier 4+ = violet. Returns a hex string or null (default).
-function sectorNebulaTint(sector) {
-  if (!sector) return null;
-  const tier = sector.tier || 0;
-  const sec = sector.security != null ? sector.security : 1;
-  const danger = (1 - sec) + tier * 0.15; // blended danger metric
-  if (tier >= 4) return '#5a1e8a';        // violet — alien / lawless endgame (Veil, Ashfall)
-  if (danger > 0.7) return '#8a1e1e';     // blood-red — dangerous frontier (Io Reach, Sker)
-  if (danger > 0.45) return '#8a4a1e';    // rust/amber — industrial mid-ring (Vesta, Pallas)
-  if (danger > 0.2) return '#1e4a8a';     // deep blue — settled belt (Ceres, Tethys)
-  return '#1e3a6a';                        // clean blue — safe core (Helios Prime)
-}
+import { SECTOR_PALETTE_CLASSES } from '../data/sectors.js';
+
+const SECTOR_PALETTE_LERP_SECONDS = 1.5;
+const SECTOR_LIGHT_INTENSITIES = { ambient: 0.85, key: 1.7, rim: 0.7, fill: 0.35 };
 
 // ---- contact shadow disc (module-level cache so one texture serves all entities) ----------------
 let _shadowTex = null;
@@ -178,14 +167,15 @@
     renderer.setClearColor(0x060912, 1);
     const drawSize = applyRendererSize(renderer, state);
 
-    const scene = new THREE.Scene();
-    // Thin fog for gentle depth cueing only — the old 0.00085 erased the entire backdrop, leaving a
-    // black void. This keeps the nebula + far stars visible while still fading the deep distance.
-    scene.fog = new THREE.FogExp2(0x0a1430, 0.00026);
-    scene.add(new THREE.AmbientLight(0x42506f, 0.85));
-    const key = new THREE.DirectionalLight(0xcfe2ff, 1.7); key.position.set(60, 140, 40); scene.add(key);
-    const rim = new THREE.DirectionalLight(0x6a5cff, 0.7); rim.position.set(-70, 50, -60); scene.add(rim);
-    const fill = new THREE.DirectionalLight(0x39d0ff, 0.35); fill.position.set(20, 30, 120); scene.add(fill);
+    const scene = new THREE.Scene();
+    const corePalette = SECTOR_PALETTE_CLASSES.core;
+    // Thin fog for gentle depth cueing only — the old 0.00085 erased the entire backdrop, leaving a
+    // black void. This keeps the nebula + far stars visible while still fading the deep distance.
+    scene.fog = new THREE.FogExp2(corePalette.fog, corePalette.fogDensity);
+    const ambient = new THREE.AmbientLight(corePalette.ambient, SECTOR_LIGHT_INTENSITIES.ambient); scene.add(ambient);
+    const key = new THREE.DirectionalLight(corePalette.key, SECTOR_LIGHT_INTENSITIES.key); key.position.set(60, 140, 40); scene.add(key);
+    const rim = new THREE.DirectionalLight(corePalette.rim, SECTOR_LIGHT_INTENSITIES.rim); rim.position.set(-70, 50, -60); scene.add(rim);
+    const fill = new THREE.DirectionalLight(corePalette.fill, SECTOR_LIGHT_INTENSITIES.fill); fill.position.set(20, 30, 120); scene.add(fill);
 
     // Real shadow maps (graphics spec Workstream G). Gated behind settings.video.shadows (default
     // true). The key light becomes a shadow caster with a tight frustum that follows the player so
@@ -210,7 +200,7 @@
     }
 
     const cam = createChaseCamera(state);
-    const starfield = createStarfield(scene);
+    const starfield = createStarfield(scene, { tint: corePalette.nebulaTint });
     const vf = createVisualFactory();
     // Hero-asset registry (spec §17.3): wraps the factory's build() so the bespoke player Kestrel is
     // intercepted before the procedural visualFactory. Narrow + failure-isolated — any throw falls
@@ -283,13 +273,16 @@
     // contact-sheet references and are replaced by procedural materials / inline SVG).
     { const i = new Image(); i.src = 'assets/cinematics/menu_background.jpg'; }
 
-    this.renderer = renderer; this.scene = scene; this.cam = cam; this.starfield = starfield; this.vf = vf;
-    this.authoredPartLibraryReady = preloadAuthoredPartLibrary(renderer).catch((error) => {
-      console.warn('[render] authored part library preload failed', error);
-      return null;
-    });
-    state.render.authoredPartLibraryReady = this.authoredPartLibraryReady;
-    this._keyLight = shadowsOn ? key : null; // referenced by _updateShadowFollow() each frame
+    this.renderer = renderer; this.scene = scene; this.cam = cam; this.starfield = starfield; this.vf = vf;
+    this.authoredPartLibraryReady = preloadAuthoredPartLibrary(renderer).catch((error) => {
+      console.warn('[render] authored part library preload failed', error);
+      return null;
+    });
+    state.render.authoredPartLibraryReady = this.authoredPartLibraryReady;
+    this._sectorPaletteRig = createSectorPaletteRig(scene, ambient, key, rim, fill);
+    this._sectorPaletteTarget = corePalette;
+    state.render.sectorPalette = corePalette;
+    this._keyLight = shadowsOn ? key : null; // referenced by _updateShadowFollow() each frame
     this._shadowSettingOn = shadowsOn;
     this._shadowReceiversDirty = true;
     this._shadowReceiverCount = 0;
@@ -410,20 +403,19 @@
     // already spawned by the time this fires (enterSector spawns before its sector:enter resolves),
     // so a blind clearAllMeshes(keepPlayer) used to wipe the station/asteroids and leave the player
     // alone in empty space. reconcileMeshes() removes only meshes for entities that are gone.
-    bus.on('sector:enter', ({ sector } = {}) => {
-      this._meshReconcileDirty = true;
-      if (cam.snapToPlayer) cam.snapToPlayer();
-      this._updatePlanetBodies(sector);
-      // Tint the nebula backdrop to the sector's mood so each region of the galaxy reads with its
-      // own color signature: clean-blue core → rust/amber industrial → blood-red frontier → violet
-      // alien/endgame. Drives the whole-frame atmosphere, reinforcing the core-to-frontier gradient.
-      if (this.starfield && this.starfield.setSectorTint) {
-        this.starfield.setSectorTint(sectorNebulaTint(sector));
-      }
+    bus.on('sector:enter', ({ sector } = {}) => {
+      this._meshReconcileDirty = true;
+      if (cam.snapToPlayer) cam.snapToPlayer();
+      this._updatePlanetBodies(sector);
+      this._beginSectorPaletteTransition(sector);
       this._updateHazardVisuals(sector);
       precompilePipelines(renderer, scene, cam.obj, { sector }).catch((error) => console.warn('[render] sector pipeline precompile failed', error));
     });
-    bus.on('save:loaded', () => { this._meshReconcileDirty = true; });
+    bus.on('jump:arrive', ({ sectorId } = {}) => {
+      const sector = sectorId && state.world && state.world.sectors ? state.world.sectors[sectorId] : null;
+      this._beginSectorPaletteTransition(sector);
+    });
+    bus.on('save:loaded', () => { this._meshReconcileDirty = true; });
 
     window.addEventListener('resize', () => this.onResize());
   },
@@ -640,7 +632,7 @@
     return tex;
   },
 
-  _updateHazardVisuals(sector) {
+  _updateHazardVisuals(sector) {
     // Dispose previous hazard visuals
     for (const obj of this._hazardVisuals) {
       this.scene.remove(obj);
@@ -701,10 +693,42 @@
         this.scene.add(ring);
         this._hazardVisuals.push(ring);
       }
-    }
-  },
-
-  prepareFrame(alpha, frameDt) {
+    }
+  },
+
+  _beginSectorPaletteTransition(sector) {
+    const rig = this._sectorPaletteRig;
+    if (!rig) return;
+    const palette = sector && sector.palette ? sector.palette : SECTOR_PALETTE_CLASSES.core;
+    this.state.render.sectorPalette = palette;
+    if (palette === this._sectorPaletteTarget) return;
+
+    this._sectorPaletteTarget = palette;
+    writeRigToSectorPaletteFrame(rig.start, rig);
+    writePaletteToSectorPaletteFrame(rig.target, palette);
+    rig.elapsed = 0;
+    rig.active = true;
+
+    if (this.starfield && this.starfield.setSectorTint) {
+      this.starfield.setSectorTint(palette.nebulaTint);
+    }
+  },
+
+  _updateSectorPaletteTransition(frameDt) {
+    const rig = this._sectorPaletteRig;
+    if (!rig || !rig.active) return;
+    const dt = Number.isFinite(frameDt) ? Math.max(0, frameDt) : 0;
+    rig.elapsed = Math.min(SECTOR_PALETTE_LERP_SECONDS, rig.elapsed + dt);
+    const rawT = SECTOR_PALETTE_LERP_SECONDS > 0 ? rig.elapsed / SECTOR_PALETTE_LERP_SECONDS : 1;
+    const t = rawT * rawT * (3 - 2 * rawT);
+    lerpSectorPaletteFrame(rig, rig.start, rig.target, t);
+    if (rawT >= 1) {
+      rig.active = false;
+      applySectorPaletteFrame(rig, rig.target);
+    }
+  },
+
+  prepareFrame(alpha, frameDt) {
     // While the GL context is lost, the renderer can't draw — skip all per-frame work until
     // webglcontextrestored rebuilds GPU resources. (cam.follow etc. would run against a dead
     // renderer; the context-restore handler re-applies everything that matters when it returns.)
@@ -716,9 +740,10 @@
     syncAuthoredInstancePools(this.scene, { camera: this.cam.obj });
     this.starfield.recenter(this.cam.obj.position);
     // Background-clock for distant animation (planet cloud drift, hero-star twinkle). Integrates real
-    // frame dt scaled by state.timeScale so the cosmos respects hit-stop/pause — a death freeze
-    // momentarily stills the clouds too, keeping the backdrop in the same time model as the action.
-    const ts = (this.state.timeScale != null) ? this.state.timeScale : 1;
+    // frame dt scaled by state.timeScale so the cosmos respects hit-stop/pause — a death freeze
+    // momentarily stills the clouds too, keeping the backdrop in the same time model as the action.
+    this._updateSectorPaletteTransition(frameDt);
+    const ts = (this.state.timeScale != null) ? this.state.timeScale : 1;
     this._bgTime = (this._bgTime || 0) + frameDt * ts;
     if (this.starfield.update) this.starfield.update(frameDt, this._bgTime);
     this._updatePlanetParallax();
@@ -899,13 +924,97 @@
   return renderer.getDrawingBufferSize(_drawSize);
 }
 
-function finiteInRange(value, min, max, fallback) {
-  const n = Number(value);
-  if (!Number.isFinite(n)) return fallback;
-  return Math.max(min, Math.min(max, n));
-}
-
-function disposeObject(obj) {
+function finiteInRange(value, min, max, fallback) {
+  const n = Number(value);
+  if (!Number.isFinite(n)) return fallback;
+  return Math.max(min, Math.min(max, n));
+}
+
+function createSectorPaletteRig(scene, ambientLight, keyLight, rimLight, fillLight) {
+  const rig = {
+    scene,
+    lights: { ambient: ambientLight, key: keyLight, rim: rimLight, fill: fillLight },
+    start: createSectorPaletteFrame(),
+    target: createSectorPaletteFrame(),
+    elapsed: 0,
+    active: false,
+  };
+  writeRigToSectorPaletteFrame(rig.start, rig);
+  writeRigToSectorPaletteFrame(rig.target, rig);
+  return rig;
+}
+
+function createSectorPaletteFrame() {
+  return {
+    colors: {
+      ambient: new THREE.Color(),
+      key: new THREE.Color(),
+      rim: new THREE.Color(),
+      fill: new THREE.Color(),
+      fog: new THREE.Color(),
+    },
+    intensities: { ambient: 0, key: 0, rim: 0, fill: 0 },
+    fogDensity: 0,
+  };
+}
+
+function writeRigToSectorPaletteFrame(frame, rig) {
+  frame.colors.ambient.copy(rig.lights.ambient.color);
+  frame.colors.key.copy(rig.lights.key.color);
+  frame.colors.rim.copy(rig.lights.rim.color);
+  frame.colors.fill.copy(rig.lights.fill.color);
+  frame.colors.fog.copy(rig.scene.fog.color);
+  frame.intensities.ambient = rig.lights.ambient.intensity;
+  frame.intensities.key = rig.lights.key.intensity;
+  frame.intensities.rim = rig.lights.rim.intensity;
+  frame.intensities.fill = rig.lights.fill.intensity;
+  frame.fogDensity = rig.scene.fog.density;
+}
+
+function writePaletteToSectorPaletteFrame(frame, palette) {
+  frame.colors.ambient.setHex(palette.ambient);
+  frame.colors.key.setHex(palette.key);
+  frame.colors.rim.setHex(palette.rim);
+  frame.colors.fill.setHex(palette.fill);
+  frame.colors.fog.setHex(palette.fog);
+  frame.intensities.ambient = SECTOR_LIGHT_INTENSITIES.ambient;
+  frame.intensities.key = SECTOR_LIGHT_INTENSITIES.key;
+  frame.intensities.rim = SECTOR_LIGHT_INTENSITIES.rim;
+  frame.intensities.fill = SECTOR_LIGHT_INTENSITIES.fill;
+  frame.fogDensity = palette.fogDensity;
+}
+
+function applySectorPaletteFrame(rig, frame) {
+  rig.lights.ambient.color.copy(frame.colors.ambient);
+  rig.lights.key.color.copy(frame.colors.key);
+  rig.lights.rim.color.copy(frame.colors.rim);
+  rig.lights.fill.color.copy(frame.colors.fill);
+  rig.scene.fog.color.copy(frame.colors.fog);
+  rig.lights.ambient.intensity = frame.intensities.ambient;
+  rig.lights.key.intensity = frame.intensities.key;
+  rig.lights.rim.intensity = frame.intensities.rim;
+  rig.lights.fill.intensity = frame.intensities.fill;
+  rig.scene.fog.density = frame.fogDensity;
+}
+
+function lerpSectorPaletteFrame(rig, start, target, t) {
+  rig.lights.ambient.color.lerpColors(start.colors.ambient, target.colors.ambient, t);
+  rig.lights.key.color.lerpColors(start.colors.key, target.colors.key, t);
+  rig.lights.rim.color.lerpColors(start.colors.rim, target.colors.rim, t);
+  rig.lights.fill.color.lerpColors(start.colors.fill, target.colors.fill, t);
+  rig.scene.fog.color.lerpColors(start.colors.fog, target.colors.fog, t);
+  rig.lights.ambient.intensity = lerp(start.intensities.ambient, target.intensities.ambient, t);
+  rig.lights.key.intensity = lerp(start.intensities.key, target.intensities.key, t);
+  rig.lights.rim.intensity = lerp(start.intensities.rim, target.intensities.rim, t);
+  rig.lights.fill.intensity = lerp(start.intensities.fill, target.intensities.fill, t);
+  rig.scene.fog.density = lerp(start.fogDensity, target.fogDensity, t);
+}
+
+function lerp(a, b, t) {
+  return a + (b - a) * t;
+}
+
+function disposeObject(obj) {
   obj.traverse((c) => {
     if (c.isBatchedMesh && typeof c.dispose === 'function') c.dispose();
     else if (c.geometry && !(c.userData && (c.userData.sharedContactShadow || c.userData.sharedShieldGeo))) c.geometry.dispose();
diff --git a/src/render/starfield.js b/src/render/starfield.js
index d76965c563ac0d99166bb382577d2f6eaa4a6d0f..aecb37608592e6ff981ddaf8fd6107d17a0632e6
--- a/src/render/starfield.js
+++ b/src/render/starfield.js
@@ -116,10 +116,18 @@
   return c;
 }
 
-// --- small color helpers for sector tinting (no deps) ---
-function hexToRgb(hex) {
-  const h = hex.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
-}
+// --- small color helpers for sector tinting (no deps) ---
+function normalizeTint(tint) {
+  if (tint == null) return null;
+  if (typeof tint === 'number' && Number.isFinite(tint)) {
+    return '#' + ((tint >>> 0) & 0xffffff).toString(16).padStart(6, '0');
+  }
+  if (typeof tint === 'string') return tint.startsWith('#') ? tint : '#' + tint.replace(/^0x/i, '');
+  return null;
+}
+function hexToRgb(hex) {
+  const h = hex.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
+}
 function rgbToHex(r, g, b) {
   const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
   return '#' + c(r) + c(g) + c(b);
@@ -176,11 +184,11 @@
   ctx.restore();
 }
 
-export function createStarfield(scene, opts = {}) {
-  const layers = [];
-  const sprite = makeStarSprite();
-  let bgTexture = null;
-  let currentTint = opts.tint || null;
+export function createStarfield(scene, opts = {}) {
+  const layers = [];
+  const sprite = makeStarSprite();
+  let bgTexture = null;
+  let currentTint = normalizeTint(opts.tint);
 
   // star tints (mostly cool white/blue with a few warm + teal accents)
   const TINTS = [0xffffff, 0xcfe0ff, 0x9fb6e0, 0xfff0d8, 0x8af0d6, 0xbfd2ff];
@@ -297,13 +305,14 @@
       // GR-7: slow-rotate the distant 3D planets so they read as real spinning worlds, not billboards.
       for (const p of distantPlanets) p.mesh.rotation.y += dt * p.spin;
     },
-    // Swap the nebula mood on sector enter — each region of the galaxy reads with its own color
-    // signature (core = clean blue, industrial = rust/amber, frontier = blood-red, alien = violet).
-    setSectorTint(tint) {
-      if (tint === currentTint) return;
-      currentTint = tint || null;
-      applyBackground(currentTint);
-    },
+    // Swap the nebula mood on sector enter — each region of the galaxy reads with its own color
+    // signature (core = clean blue, industrial = rust/amber, frontier = blood-red, alien = violet).
+    setSectorTint(tint) {
+      const nextTint = normalizeTint(tint);
+      if (nextTint === currentTint) return;
+      currentTint = nextTint;
+      applyBackground(currentTint);
+    },
     setWarp() { /* extended by vfx during jump */ },
   };
 }

codex
The verification command is running. While it runs, I’m watching for whether failures are from this palette patch or from the broader dirty 2.0 tree.
diff --git a/package.json b/package.json
index 0897813b9c443f97ae9d2e8ae253e77f386705d9..a869414ec6dbceebe45b9b78abd72013201579da
--- a/package.json
+++ b/package.json
@@ -74,9 +74,10 @@
     "build:sg04:release-assets": "node scripts/build-sg04-release-assets.mjs",
     "build:bundle": "node scripts/build-bundle.mjs",
     "check:bundle": "node scripts/check-bundle.mjs",
-    "check:launch-policy": "node scripts/check-launch-policy.mjs",
-    "check:non-graphics": "node scripts/check-non-graphics-ci.mjs",
-    "check:assets:live": "node scripts/probe-authored-assets-live.mjs",
+    "check:launch-policy": "node scripts/check-launch-policy.mjs",
+    "check:non-graphics": "node scripts/check-non-graphics-ci.mjs",
+    "check:sector-palettes": "node scripts/check-sector-palettes.mjs",
+    "check:assets:live": "node scripts/probe-authored-assets-live.mjs",
     "check:perf:control": "node scripts/probe-raf-control.mjs --headed --strict --width 1830 --height 973 --warmup 1000 --duration 5000",
     "check:perf": "node scripts/probe-performance-profile.mjs --headed --strict --width 1830 --height 973 --warmup 2500 --duration 7000 --diagnostic-variants",
     "check:hitch-budget": "node scripts/check-hitch-budget.mjs",
diff --git a/scripts/check-sector-palettes.mjs b/scripts/check-sector-palettes.mjs
new file mode 100644
index 0000000000000000000000000000000000000000..04318569a6d4a787b3cf451b3de0e457574fa6f1
--- /dev/null
+++ b/scripts/check-sector-palettes.mjs
@@ -0,0 +1,81 @@
+import { SECTORS, SECTOR_PALETTE_CLASSES } from '../src/data/sectors.js';
+
+const REQUIRED_FIELDS = ['key', 'rim', 'fill', 'ambient', 'fog', 'fogDensity', 'nebulaTint', 'dust'];
+const COLOR_FIELDS = ['key', 'rim', 'fill', 'ambient', 'fog', 'nebulaTint', 'dust'];
+const CLASS_ENTRIES = Object.entries(SECTOR_PALETTE_CLASSES);
+const CORE_LUMINANCE = combinedLightLuminance(SECTOR_PALETTE_CLASSES.core);
+const MIN_LUMINANCE = CORE_LUMINANCE * 0.8;
+const MAX_LUMINANCE = CORE_LUMINANCE * 1.2;
+
+const issues = [];
+const usedClasses = new Set();
+
+for (const sector of SECTORS) {
+  const palette = sector.palette;
+  if (!palette || typeof palette !== 'object') {
+    issues.push(`${sector.id}: missing palette block`);
+    continue;
+  }
+
+  for (const field of REQUIRED_FIELDS) {
+    if (!(field in palette)) issues.push(`${sector.id}: palette missing ${field}`);
+  }
+  for (const field of COLOR_FIELDS) {
+    if (!isColorHex(palette[field])) issues.push(`${sector.id}: palette.${field} must be a 0x000000-0xffffff number`);
+  }
+  if (!Number.isFinite(palette.fogDensity) || palette.fogDensity <= 0) {
+    issues.push(`${sector.id}: palette.fogDensity must be a positive finite number`);
+  }
+
+  const className = classNameForPalette(palette);
+  if (!className) issues.push(`${sector.id}: palette does not match an authored class`);
+  else usedClasses.add(className);
+
+  const luminance = combinedLightLuminance(palette);
+  if (luminance < MIN_LUMINANCE || luminance > MAX_LUMINANCE) {
+    issues.push(`${sector.id}: ambient+fill luminance ${luminance.toFixed(4)} outside ${MIN_LUMINANCE.toFixed(4)}-${MAX_LUMINANCE.toFixed(4)}`);
+  }
+}
+
+for (const [className] of CLASS_ENTRIES) {
+  if (!usedClasses.has(className)) issues.push(`palette class unused: ${className}`);
+}
+
+if (issues.length) {
+  console.error(`Sector palette check failed (${issues.length} issue${issues.length === 1 ? '' : 's'}):`);
+  for (const issue of issues) console.error(`- ${issue}`);
+  process.exit(1);
+}
+
+console.log(`Sector palettes OK: ${SECTORS.length} sectors, classes used: ${[...usedClasses].sort().join(', ')}`);
+
+function classNameForPalette(palette) {
+  for (const [className, classPalette] of CLASS_ENTRIES) {
+    if (samePalette(palette, classPalette)) return className;
+  }
+  return null;
+}
+
+function samePalette(a, b) {
+  return REQUIRED_FIELDS.every((field) => a[field] === b[field]);
+}
+
+function isColorHex(value) {
+  return Number.isInteger(value) && value >= 0x000000 && value <= 0xffffff;
+}
+
+function combinedLightLuminance(palette) {
+  return relativeLuminance(palette.ambient) + relativeLuminance(palette.fill);
+}
+
+function relativeLuminance(hex) {
+  const r = linearRgb((hex >> 16) & 0xff);
+  const g = linearRgb((hex >> 8) & 0xff);
+  const b = linearRgb(hex & 0xff);
+  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
+}
+
+function linearRgb(channel) {
+  const c = channel / 255;
+  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
+}
diff --git a/src/data/sectors.js b/src/data/sectors.js
index 9c63f69479b241fc848258e3fe2161547793fa46..1814c409089f818b6ab4758b3f0cf8f8531f2452
--- a/src/data/sectors.js
+++ b/src/data/sectors.js
@@ -10,10 +10,30 @@
 export const HAZARD_TYPES  = ['dense_asteroid', 'nebula', 'radiation', 'debris'];
 export const POI_TYPES     = ['beacon', 'derelict', 'cache', 'colony', 'anomaly', 'wormhole', 'wreck'];
 
+export const SECTOR_PALETTE_CLASSES = {
+  core: {
+    key: 0xcfe2ff, rim: 0x6a5cff, fill: 0x39d0ff, ambient: 0x42506f,
+    fog: 0x0a1430, fogDensity: 0.00026, nebulaTint: 0x1e3a6a, dust: 0x7ea7c7,
+  },
+  belt: {
+    key: 0xffd59a, rim: 0xb56d2f, fill: 0xffb13d, ambient: 0x594a42,
+    fog: 0x2a160c, fogDensity: 0.00034, nebulaTint: 0x8a4a1e, dust: 0xc0793d,
+  },
+  fringe: {
+    key: 0xffb07a, rim: 0xff3f2d, fill: 0xffaa66, ambient: 0x584343,
+    fog: 0x2a0d0a, fogDensity: 0.00042, nebulaTint: 0x8a1e1e, dust: 0xc15032,
+  },
+  anomaly: {
+    key: 0xc8b6ff, rim: 0x54ffb0, fill: 0x4ddc92, ambient: 0x494760,
+    fog: 0x160d2c, fogDensity: 0.00036, nebulaTint: 0x5a1e8a, dust: 0x79ffc8,
+  },
+};
+
 export const SECTORS = [
   {
     id: 'sector_helios_prime', name: 'Helios Prime', tier: 0, security: 0.98, charted: true,
     factionId: 'faction_scn', position: { x: 0, y: 0 }, worldRadius: 3500,
+    palette: SECTOR_PALETTE_CLASSES.core,
     // Tutorial home sector: NO hostile spawns (enemyDensity 0). A brand-new pilot must not be
     // hunted before learning the ropes; danger ramps up only in neighbouring sectors.
     trafficPerMin: 18, enemyDensity: 0, enemyLevel: [1, 2],
@@ -37,6 +57,7 @@
   {
     id: 'sector_ceres_belt', name: 'Ceres Belt', tier: 1, security: 0.72, charted: true,
     factionId: 'faction_dmc', position: { x: -3, y: 2 }, worldRadius: 4200,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 10, enemyDensity: 0.18, enemyLevel: [2, 4],
     neighbors: ['sector_helios_prime', 'sector_tethys_junction', 'sector_pallas_drift'],
     stations: [
@@ -57,6 +78,7 @@
   {
     id: 'sector_tethys_junction', name: 'Tethys Junction', tier: 1, security: 0.65, charted: true,
     factionId: 'faction_mts', position: { x: 3, y: 2 }, worldRadius: 4000,
+    palette: SECTOR_PALETTE_CLASSES.core,
     trafficPerMin: 14, enemyDensity: 0.20, enemyLevel: [2, 4],
     neighbors: ['sector_helios_prime', 'sector_ceres_belt', 'sector_vesta_forge', 'sector_io_reach'],
     stations: [
@@ -72,6 +94,7 @@
   {
     id: 'sector_vesta_forge', name: 'Vesta Forge', tier: 1, security: 0.60, charted: true,
     factionId: 'faction_dmc', position: { x: 0, y: 4 }, worldRadius: 4300,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 9, enemyDensity: 0.25, enemyLevel: [3, 5],
     neighbors: ['sector_helios_prime', 'sector_tethys_junction', 'sector_charon_expanse'],
     stations: [
@@ -89,6 +112,7 @@
   {
     id: 'sector_pallas_drift', name: 'Pallas Drift', tier: 2, security: 0.42, charted: true,
     factionId: 'faction_mts', position: { x: -5, y: 5 }, worldRadius: 4500,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 7, enemyDensity: 0.40, enemyLevel: [4, 7],
     neighbors: ['sector_ceres_belt', 'sector_io_reach', 'sector_sker_haven'],
     stations: [
@@ -109,6 +133,7 @@
   {
     id: 'sector_io_reach', name: 'Io Reach', tier: 2, security: 0.35, charted: true,
     factionId: 'faction_free', position: { x: 5, y: 5 }, worldRadius: 4600,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 5, enemyDensity: 0.50, enemyLevel: [5, 8],
     neighbors: ['sector_tethys_junction', 'sector_pallas_drift', 'sector_charon_expanse', 'sector_veil_nebula'],
     stations: [
@@ -132,6 +157,7 @@
   {
     id: 'sector_charon_expanse', name: 'Charon Expanse', tier: 2, security: 0.30, charted: true,
     factionId: 'faction_dmc', position: { x: 2, y: 7 }, worldRadius: 4800,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 4, enemyDensity: 0.50, enemyLevel: [5, 9],
     neighbors: ['sector_vesta_forge', 'sector_io_reach', 'sector_ashfall_reach'],
     stations: [
@@ -151,6 +177,7 @@
   {
     id: 'sector_sker_haven', name: 'Sker Haven', tier: 3, security: 0.08, charted: false,
     factionId: 'faction_reach', position: { x: -7, y: 8 }, worldRadius: 5000,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 0, enemyDensity: 0.70, enemyLevel: [7, 11],
     neighbors: ['sector_pallas_drift', 'sector_veil_nebula'],
     stations: [
@@ -169,6 +196,7 @@
   {
     id: 'sector_veil_nebula', name: 'Veil Nebula', tier: 3, security: 0.12, charted: false,
     factionId: 'faction_free', position: { x: 7, y: 9 }, worldRadius: 5200,
+    palette: SECTOR_PALETTE_CLASSES.anomaly,
     trafficPerMin: 0, enemyDensity: 0.65, enemyLevel: [8, 12],
     neighbors: ['sector_io_reach', 'sector_sker_haven'],
     wormholeTo: { sectorId: 'sector_ashfall_reach', gatedBy: 'tech:tech_long_range_survey' },
@@ -188,6 +216,7 @@
   {
     id: 'sector_ashfall_reach', name: 'Ashfall Reach', tier: 4, security: 0.05, charted: false,
     factionId: 'faction_vael', position: { x: 4, y: 11 }, worldRadius: 5500,
+    palette: SECTOR_PALETTE_CLASSES.anomaly,
     trafficPerMin: 0, enemyDensity: 0.80, enemyLevel: [10, 15],
     neighbors: ['sector_charon_expanse'],
     stations: [
diff --git a/src/render/renderer.js b/src/render/renderer.js
index def6420ff1bff2ac1c64dcc1add395e7851c4dbc..7b83534145db2cec91608a3a2a42dfe1ec083a9d
--- a/src/render/renderer.js
+++ b/src/render/renderer.js
@@ -15,21 +15,10 @@
 import { installDiagnostics } from './diagnostics.js';
 import { createPlanetFactory } from './planetFactory.js';
 import { precompilePipelines } from './precompile.js';
-
-// Map a sector's danger/tier to a nebula backdrop tint so each region of the galaxy has its own
-// color signature. Core (safe, low tier) = clean blue; industrial mid-ring = rust/amber; lawless
-// frontier = blood-red; alien/endgame tier 4+ = violet. Returns a hex string or null (default).
-function sectorNebulaTint(sector) {
-  if (!sector) return null;
-  const tier = sector.tier || 0;
-  const sec = sector.security != null ? sector.security : 1;
-  const danger = (1 - sec) + tier * 0.15; // blended danger metric
-  if (tier >= 4) return '#5a1e8a';        // violet — alien / lawless endgame (Veil, Ashfall)
-  if (danger > 0.7) return '#8a1e1e';     // blood-red — dangerous frontier (Io Reach, Sker)
-  if (danger > 0.45) return '#8a4a1e';    // rust/amber — industrial mid-ring (Vesta, Pallas)
-  if (danger > 0.2) return '#1e4a8a';     // deep blue — settled belt (Ceres, Tethys)
-  return '#1e3a6a';                        // clean blue — safe core (Helios Prime)
-}
+import { SECTOR_PALETTE_CLASSES } from '../data/sectors.js';
+
+const SECTOR_PALETTE_LERP_SECONDS = 1.5;
+const SECTOR_LIGHT_INTENSITIES = { ambient: 0.85, key: 1.7, rim: 0.7, fill: 0.35 };
 
 // ---- contact shadow disc (module-level cache so one texture serves all entities) ----------------
 let _shadowTex = null;
@@ -178,14 +167,15 @@
     renderer.setClearColor(0x060912, 1);
     const drawSize = applyRendererSize(renderer, state);
 
-    const scene = new THREE.Scene();
-    // Thin fog for gentle depth cueing only — the old 0.00085 erased the entire backdrop, leaving a
-    // black void. This keeps the nebula + far stars visible while still fading the deep distance.
-    scene.fog = new THREE.FogExp2(0x0a1430, 0.00026);
-    scene.add(new THREE.AmbientLight(0x42506f, 0.85));
-    const key = new THREE.DirectionalLight(0xcfe2ff, 1.7); key.position.set(60, 140, 40); scene.add(key);
-    const rim = new THREE.DirectionalLight(0x6a5cff, 0.7); rim.position.set(-70, 50, -60); scene.add(rim);
-    const fill = new THREE.DirectionalLight(0x39d0ff, 0.35); fill.position.set(20, 30, 120); scene.add(fill);
+    const scene = new THREE.Scene();
+    const corePalette = SECTOR_PALETTE_CLASSES.core;
+    // Thin fog for gentle depth cueing only — the old 0.00085 erased the entire backdrop, leaving a
+    // black void. This keeps the nebula + far stars visible while still fading the deep distance.
+    scene.fog = new THREE.FogExp2(corePalette.fog, corePalette.fogDensity);
+    const ambient = new THREE.AmbientLight(corePalette.ambient, SECTOR_LIGHT_INTENSITIES.ambient); scene.add(ambient);
+    const key = new THREE.DirectionalLight(corePalette.key, SECTOR_LIGHT_INTENSITIES.key); key.position.set(60, 140, 40); scene.add(key);
+    const rim = new THREE.DirectionalLight(corePalette.rim, SECTOR_LIGHT_INTENSITIES.rim); rim.position.set(-70, 50, -60); scene.add(rim);
+    const fill = new THREE.DirectionalLight(corePalette.fill, SECTOR_LIGHT_INTENSITIES.fill); fill.position.set(20, 30, 120); scene.add(fill);
 
     // Real shadow maps (graphics spec Workstream G). Gated behind settings.video.shadows (default
     // true). The key light becomes a shadow caster with a tight frustum that follows the player so
@@ -210,7 +200,7 @@
     }
 
     const cam = createChaseCamera(state);
-    const starfield = createStarfield(scene);
+    const starfield = createStarfield(scene, { tint: corePalette.nebulaTint });
     const vf = createVisualFactory();
     // Hero-asset registry (spec §17.3): wraps the factory's build() so the bespoke player Kestrel is
     // intercepted before the procedural visualFactory. Narrow + failure-isolated — any throw falls
@@ -283,13 +273,16 @@
     // contact-sheet references and are replaced by procedural materials / inline SVG).
     { const i = new Image(); i.src = 'assets/cinematics/menu_background.jpg'; }
 
-    this.renderer = renderer; this.scene = scene; this.cam = cam; this.starfield = starfield; this.vf = vf;
-    this.authoredPartLibraryReady = preloadAuthoredPartLibrary(renderer).catch((error) => {
-      console.warn('[render] authored part library preload failed', error);
-      return null;
-    });
-    state.render.authoredPartLibraryReady = this.authoredPartLibraryReady;
-    this._keyLight = shadowsOn ? key : null; // referenced by _updateShadowFollow() each frame
+    this.renderer = renderer; this.scene = scene; this.cam = cam; this.starfield = starfield; this.vf = vf;
+    this.authoredPartLibraryReady = preloadAuthoredPartLibrary(renderer).catch((error) => {
+      console.warn('[render] authored part library preload failed', error);
+      return null;
+    });
+    state.render.authoredPartLibraryReady = this.authoredPartLibraryReady;
+    this._sectorPaletteRig = createSectorPaletteRig(scene, ambient, key, rim, fill);
+    this._sectorPaletteTarget = corePalette;
+    state.render.sectorPalette = corePalette;
+    this._keyLight = shadowsOn ? key : null; // referenced by _updateShadowFollow() each frame
     this._shadowSettingOn = shadowsOn;
     this._shadowReceiversDirty = true;
     this._shadowReceiverCount = 0;
@@ -410,20 +403,19 @@
     // already spawned by the time this fires (enterSector spawns before its sector:enter resolves),
     // so a blind clearAllMeshes(keepPlayer) used to wipe the station/asteroids and leave the player
     // alone in empty space. reconcileMeshes() removes only meshes for entities that are gone.
-    bus.on('sector:enter', ({ sector } = {}) => {
-      this._meshReconcileDirty = true;
-      if (cam.snapToPlayer) cam.snapToPlayer();
-      this._updatePlanetBodies(sector);
-      // Tint the nebula backdrop to the sector's mood so each region of the galaxy reads with its
-      // own color signature: clean-blue core → rust/amber industrial → blood-red frontier → violet
-      // alien/endgame. Drives the whole-frame atmosphere, reinforcing the core-to-frontier gradient.
-      if (this.starfield && this.starfield.setSectorTint) {
-        this.starfield.setSectorTint(sectorNebulaTint(sector));
-      }
+    bus.on('sector:enter', ({ sector } = {}) => {
+      this._meshReconcileDirty = true;
+      if (cam.snapToPlayer) cam.snapToPlayer();
+      this._updatePlanetBodies(sector);
+      this._beginSectorPaletteTransition(sector);
       this._updateHazardVisuals(sector);
       precompilePipelines(renderer, scene, cam.obj, { sector }).catch((error) => console.warn('[render] sector pipeline precompile failed', error));
     });
-    bus.on('save:loaded', () => { this._meshReconcileDirty = true; });
+    bus.on('jump:arrive', ({ sectorId } = {}) => {
+      const sector = sectorId && state.world && state.world.sectors ? state.world.sectors[sectorId] : null;
+      this._beginSectorPaletteTransition(sector);
+    });
+    bus.on('save:loaded', () => { this._meshReconcileDirty = true; });
 
     window.addEventListener('resize', () => this.onResize());
   },
@@ -640,7 +632,7 @@
     return tex;
   },
 
-  _updateHazardVisuals(sector) {
+  _updateHazardVisuals(sector) {
     // Dispose previous hazard visuals
     for (const obj of this._hazardVisuals) {
       this.scene.remove(obj);
@@ -701,10 +693,42 @@
         this.scene.add(ring);
         this._hazardVisuals.push(ring);
       }
-    }
-  },
-
-  prepareFrame(alpha, frameDt) {
+    }
+  },
+
+  _beginSectorPaletteTransition(sector) {
+    const rig = this._sectorPaletteRig;
+    if (!rig) return;
+    const palette = sector && sector.palette ? sector.palette : SECTOR_PALETTE_CLASSES.core;
+    this.state.render.sectorPalette = palette;
+    if (palette === this._sectorPaletteTarget) return;
+
+    this._sectorPaletteTarget = palette;
+    writeRigToSectorPaletteFrame(rig.start, rig);
+    writePaletteToSectorPaletteFrame(rig.target, palette);
+    rig.elapsed = 0;
+    rig.active = true;
+
+    if (this.starfield && this.starfield.setSectorTint) {
+      this.starfield.setSectorTint(palette.nebulaTint);
+    }
+  },
+
+  _updateSectorPaletteTransition(frameDt) {
+    const rig = this._sectorPaletteRig;
+    if (!rig || !rig.active) return;
+    const dt = Number.isFinite(frameDt) ? Math.max(0, frameDt) : 0;
+    rig.elapsed = Math.min(SECTOR_PALETTE_LERP_SECONDS, rig.elapsed + dt);
+    const rawT = SECTOR_PALETTE_LERP_SECONDS > 0 ? rig.elapsed / SECTOR_PALETTE_LERP_SECONDS : 1;
+    const t = rawT * rawT * (3 - 2 * rawT);
+    lerpSectorPaletteFrame(rig, rig.start, rig.target, t);
+    if (rawT >= 1) {
+      rig.active = false;
+      applySectorPaletteFrame(rig, rig.target);
+    }
+  },
+
+  prepareFrame(alpha, frameDt) {
     // While the GL context is lost, the renderer can't draw — skip all per-frame work until
     // webglcontextrestored rebuilds GPU resources. (cam.follow etc. would run against a dead
     // renderer; the context-restore handler re-applies everything that matters when it returns.)
@@ -716,9 +740,10 @@
     syncAuthoredInstancePools(this.scene, { camera: this.cam.obj });
     this.starfield.recenter(this.cam.obj.position);
     // Background-clock for distant animation (planet cloud drift, hero-star twinkle). Integrates real
-    // frame dt scaled by state.timeScale so the cosmos respects hit-stop/pause — a death freeze
-    // momentarily stills the clouds too, keeping the backdrop in the same time model as the action.
-    const ts = (this.state.timeScale != null) ? this.state.timeScale : 1;
+    // frame dt scaled by state.timeScale so the cosmos respects hit-stop/pause — a death freeze
+    // momentarily stills the clouds too, keeping the backdrop in the same time model as the action.
+    this._updateSectorPaletteTransition(frameDt);
+    const ts = (this.state.timeScale != null) ? this.state.timeScale : 1;
     this._bgTime = (this._bgTime || 0) + frameDt * ts;
     if (this.starfield.update) this.starfield.update(frameDt, this._bgTime);
     this._updatePlanetParallax();
@@ -899,13 +924,97 @@
   return renderer.getDrawingBufferSize(_drawSize);
 }
 
-function finiteInRange(value, min, max, fallback) {
-  const n = Number(value);
-  if (!Number.isFinite(n)) return fallback;
-  return Math.max(min, Math.min(max, n));
-}
-
-function disposeObject(obj) {
+function finiteInRange(value, min, max, fallback) {
+  const n = Number(value);
+  if (!Number.isFinite(n)) return fallback;
+  return Math.max(min, Math.min(max, n));
+}
+
+function createSectorPaletteRig(scene, ambientLight, keyLight, rimLight, fillLight) {
+  const rig = {
+    scene,
+    lights: { ambient: ambientLight, key: keyLight, rim: rimLight, fill: fillLight },
+    start: createSectorPaletteFrame(),
+    target: createSectorPaletteFrame(),
+    elapsed: 0,
+    active: false,
+  };
+  writeRigToSectorPaletteFrame(rig.start, rig);
+  writeRigToSectorPaletteFrame(rig.target, rig);
+  return rig;
+}
+
+function createSectorPaletteFrame() {
+  return {
+    colors: {
+      ambient: new THREE.Color(),
+      key: new THREE.Color(),
+      rim: new THREE.Color(),
+      fill: new THREE.Color(),
+      fog: new THREE.Color(),
+    },
+    intensities: { ambient: 0, key: 0, rim: 0, fill: 0 },
+    fogDensity: 0,
+  };
+}
+
+function writeRigToSectorPaletteFrame(frame, rig) {
+  frame.colors.ambient.copy(rig.lights.ambient.color);
+  frame.colors.key.copy(rig.lights.key.color);
+  frame.colors.rim.copy(rig.lights.rim.color);
+  frame.colors.fill.copy(rig.lights.fill.color);
+  frame.colors.fog.copy(rig.scene.fog.color);
+  frame.intensities.ambient = rig.lights.ambient.intensity;
+  frame.intensities.key = rig.lights.key.intensity;
+  frame.intensities.rim = rig.lights.rim.intensity;
+  frame.intensities.fill = rig.lights.fill.intensity;
+  frame.fogDensity = rig.scene.fog.density;
+}
+
+function writePaletteToSectorPaletteFrame(frame, palette) {
+  frame.colors.ambient.setHex(palette.ambient);
+  frame.colors.key.setHex(palette.key);
+  frame.colors.rim.setHex(palette.rim);
+  frame.colors.fill.setHex(palette.fill);
+  frame.colors.fog.setHex(palette.fog);
+  frame.intensities.ambient = SECTOR_LIGHT_INTENSITIES.ambient;
+  frame.intensities.key = SECTOR_LIGHT_INTENSITIES.key;
+  frame.intensities.rim = SECTOR_LIGHT_INTENSITIES.rim;
+  frame.intensities.fill = SECTOR_LIGHT_INTENSITIES.fill;
+  frame.fogDensity = palette.fogDensity;
+}
+
+function applySectorPaletteFrame(rig, frame) {
+  rig.lights.ambient.color.copy(frame.colors.ambient);
+  rig.lights.key.color.copy(frame.colors.key);
+  rig.lights.rim.color.copy(frame.colors.rim);
+  rig.lights.fill.color.copy(frame.colors.fill);
+  rig.scene.fog.color.copy(frame.colors.fog);
+  rig.lights.ambient.intensity = frame.intensities.ambient;
+  rig.lights.key.intensity = frame.intensities.key;
+  rig.lights.rim.intensity = frame.intensities.rim;
+  rig.lights.fill.intensity = frame.intensities.fill;
+  rig.scene.fog.density = frame.fogDensity;
+}
+
+function lerpSectorPaletteFrame(rig, start, target, t) {
+  rig.lights.ambient.color.lerpColors(start.colors.ambient, target.colors.ambient, t);
+  rig.lights.key.color.lerpColors(start.colors.key, target.colors.key, t);
+  rig.lights.rim.color.lerpColors(start.colors.rim, target.colors.rim, t);
+  rig.lights.fill.color.lerpColors(start.colors.fill, target.colors.fill, t);
+  rig.scene.fog.color.lerpColors(start.colors.fog, target.colors.fog, t);
+  rig.lights.ambient.intensity = lerp(start.intensities.ambient, target.intensities.ambient, t);
+  rig.lights.key.intensity = lerp(start.intensities.key, target.intensities.key, t);
+  rig.lights.rim.intensity = lerp(start.intensities.rim, target.intensities.rim, t);
+  rig.lights.fill.intensity = lerp(start.intensities.fill, target.intensities.fill, t);
+  rig.scene.fog.density = lerp(start.fogDensity, target.fogDensity, t);
+}
+
+function lerp(a, b, t) {
+  return a + (b - a) * t;
+}
+
+function disposeObject(obj) {
   obj.traverse((c) => {
     if (c.isBatchedMesh && typeof c.dispose === 'function') c.dispose();
     else if (c.geometry && !(c.userData && (c.userData.sharedContactShadow || c.userData.sharedShieldGeo))) c.geometry.dispose();
diff --git a/src/render/starfield.js b/src/render/starfield.js
index d76965c563ac0d99166bb382577d2f6eaa4a6d0f..aecb37608592e6ff981ddaf8fd6107d17a0632e6
--- a/src/render/starfield.js
+++ b/src/render/starfield.js
@@ -116,10 +116,18 @@
   return c;
 }
 
-// --- small color helpers for sector tinting (no deps) ---
-function hexToRgb(hex) {
-  const h = hex.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
-}
+// --- small color helpers for sector tinting (no deps) ---
+function normalizeTint(tint) {
+  if (tint == null) return null;
+  if (typeof tint === 'number' && Number.isFinite(tint)) {
+    return '#' + ((tint >>> 0) & 0xffffff).toString(16).padStart(6, '0');
+  }
+  if (typeof tint === 'string') return tint.startsWith('#') ? tint : '#' + tint.replace(/^0x/i, '');
+  return null;
+}
+function hexToRgb(hex) {
+  const h = hex.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
+}
 function rgbToHex(r, g, b) {
   const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
   return '#' + c(r) + c(g) + c(b);
@@ -176,11 +184,11 @@
   ctx.restore();
 }
 
-export function createStarfield(scene, opts = {}) {
-  const layers = [];
-  const sprite = makeStarSprite();
-  let bgTexture = null;
-  let currentTint = opts.tint || null;
+export function createStarfield(scene, opts = {}) {
+  const layers = [];
+  const sprite = makeStarSprite();
+  let bgTexture = null;
+  let currentTint = normalizeTint(opts.tint);
 
   // star tints (mostly cool white/blue with a few warm + teal accents)
   const TINTS = [0xffffff, 0xcfe0ff, 0x9fb6e0, 0xfff0d8, 0x8af0d6, 0xbfd2ff];
@@ -297,13 +305,14 @@
       // GR-7: slow-rotate the distant 3D planets so they read as real spinning worlds, not billboards.
       for (const p of distantPlanets) p.mesh.rotation.y += dt * p.spin;
     },
-    // Swap the nebula mood on sector enter — each region of the galaxy reads with its own color
-    // signature (core = clean blue, industrial = rust/amber, frontier = blood-red, alien = violet).
-    setSectorTint(tint) {
-      if (tint === currentTint) return;
-      currentTint = tint || null;
-      applyBackground(currentTint);
-    },
+    // Swap the nebula mood on sector enter — each region of the galaxy reads with its own color
+    // signature (core = clean blue, industrial = rust/amber, frontier = blood-red, alien = violet).
+    setSectorTint(tint) {
+      const nextTint = normalizeTint(tint);
+      if (nextTint === currentTint) return;
+      currentTint = nextTint;
+      applyBackground(currentTint);
+    },
     setWarp() { /* extended by vfx during jump */ },
   };
 }

 exited 1 in 26954ms:
Sector palettes OK: 10 sectors, classes used: anomaly, belt, core, fringe
ok   ../src/data/saveVersion.js — CURRENT_VERSION:number
ok   ../src/data/ships.js — SHIPS:13
ok   ../src/data/weapons.js — WEAPONS:13
ok   ../src/data/modules.js — MODULES:25
ok   ../src/data/tech.js — TECH_NODES:28
ok   ../src/data/commodities.js — COMMODITIES:34
ok   ../src/data/mining.js — ORES:18  ASTEROIDS:6  BEAMS:4  RECIPES:4  FIELDS:4
ok   ../src/data/sectors.js — SECTORS:10  STATION_TYPES:7  HAZARD_TYPES:4  POI_TYPES:7  dangerTier:function
ok   ../src/data/factions.js — FACTION_META:8
ok   ../src/data/missions.js — MISSION_TYPES:10  STORY_BEATS:8  OFFER_MIX:7  MISSION_TUNING:12
ok   ../src/data/automation.js — DRONES:4  TRADERS:3  OUTPOSTS:3  AUTO_BALANCE:7
ok   ../src/data/enemies.js — ENEMY_TYPES:8
ok   ../src/data/audioRecipes.js — RECIPES:28  MUSIC_STEMS:4
ok   ../src/data/palettes.js — FACTION_PALETTES:8  SECTOR_PALETTES:10  SHIP_RECIPES:13
ok   ../src/data/newGameDefaults.js — NEW_GAME:15
ok   ../src/data/combatDefs.js — ACTION_DEFS:6  STATUS_DEFS:4  SUBSYSTEM_DEFS:5  ATTACHMENT_DEFS:2  COMBAT_PROFILES:4

16 ok, 0 fail

> spaceface@0.1.0 check:non-graphics
> node scripts/check-non-graphics-ci.mjs

Running non-graphics lane from package script: check:ci
Skipping locked graphics segment(s): npm run check:art

> spaceface@0.1.0 check:launch-policy
> node scripts/check-launch-policy.mjs

Launch policy OK: one player URL, stable Electron save origin, release-authored default assets, packaged static-server parity, canonical runtime backends, no prod query fork.
ok   ../src/data/saveVersion.js — CURRENT_VERSION:number
ok   ../src/data/ships.js — SHIPS:13
ok   ../src/data/weapons.js — WEAPONS:13
ok   ../src/data/modules.js — MODULES:25
ok   ../src/data/tech.js — TECH_NODES:28
ok   ../src/data/commodities.js — COMMODITIES:34
ok   ../src/data/mining.js — ORES:18  ASTEROIDS:6  BEAMS:4  RECIPES:4  FIELDS:4
ok   ../src/data/sectors.js — SECTORS:10  STATION_TYPES:7  HAZARD_TYPES:4  POI_TYPES:7  dangerTier:function
ok   ../src/data/factions.js — FACTION_META:8
ok   ../src/data/missions.js — MISSION_TYPES:10  STORY_BEATS:8  OFFER_MIX:7  MISSION_TUNING:12
ok   ../src/data/automation.js — DRONES:4  TRADERS:3  OUTPOSTS:3  AUTO_BALANCE:7
ok   ../src/data/enemies.js — ENEMY_TYPES:8
ok   ../src/data/audioRecipes.js — RECIPES:28  MUSIC_STEMS:4
ok   ../src/data/palettes.js — FACTION_PALETTES:8  SECTOR_PALETTES:10  SHIP_RECIPES:13
ok   ../src/data/newGameDefaults.js — NEW_GAME:15
ok   ../src/data/combatDefs.js — ACTION_DEFS:6  STATUS_DEFS:4  SUBSYSTEM_DEFS:5  ATTACHMENT_DEFS:2  COMBAT_PROFILES:4

16 ok, 0 fail
Registries: ship_13  wpn_13  mod_25  tech_28  cmdty_34  beam_4  faction_8  sector_10

Cross-reference integrity OK — all namespaced IDs resolve.

> spaceface@0.1.0 check:balance
> node scripts/balance-sim.mjs


==============================================================================
  SpaceFace — Balance Audit (deterministic, data-grounded)
==============================================================================
------------------------------------------------------------------------------
CHECK 1 — Weapon DPS spread by slot size (dominant >1.2x median, dead <0.8x median)
------------------------------------------------------------------------------

  [S] n=3  median DPS=32  (dominant>38.4, dead<25.6)
    weapon                  dps    xMed  dmg*rof  flag
    Pulse Laser S            32      1x       32  
    Flak/PD Turret S         32      1x       32  
    Autocannon S             31   0.97x     30.8  

  [M] n=7  median DPS=68  (dominant>81.6, dead<54.4)
    weapon                  dps    xMed  dmg*rof  flag
    Plasma Cannon M         102    1.5x      102  DOMINANT
    Pulse Laser M            72   1.06x       72  
    Heavy Autocannon M       72   1.06x       72  
    EMP Disruptor M          68      1x     67.5  
    Beam Laser M             60   0.88x       60  
    Missile Rack M           56   0.82x       56  
    Railgun M                48   0.71x       48  dead-pick

  [L] n=3  median DPS=160  (dominant>192, dead<128)
    weapon                  dps    xMed  dmg*rof  flag
    Siege Lance L           210   1.31x      210  DOMINANT
    Heavy Beam L            160      1x      160  
    Torpedo L                80    0.5x       80  dead-pick

  SYNTHESIS CHECK (M slot): claim spread ~3.3x (Plasma ~102 vs Railgun ~48)
    real: Plasma=102  Railgun=48  Plasma/Railgun=2.13x
    real: max/min spread = 102/48 = 2.13x  (median 68)
    => the 3.3x figure is OVERSTATED; true within-slot spread is ~2.13x.
    NOTE: missile/torpedo splashDmg is excluded from dps, so AoE "dead-pick" flags understate them.

------------------------------------------------------------------------------
CHECK 2 — Ship progression (per-tier medians; monotonic + S-curve sanity)
------------------------------------------------------------------------------
    tier    n   med price  med hull med shield  med EHP  price x   EHP x
    T0      1           0       120         40      160        -       -
    T1      3      28,000       180         70      260        -    1.6x
    T2      3     110,000       320        180      500     3.9x    1.9x
    T3      3     320,000       640        380    1,020     2.9x      2x
    T4      2   1,175,000     1,350        960    2,310     3.7x    2.3x
    T5      1   4,500,000     3,200      2,600    5,800     3.8x    2.5x

  price / EHP point by tier (cost-efficiency curve):
    T0: n/a (free starter)
    T1: 107.7 cr/EHP
    T2: 220 cr/EHP
    T3: 313.7 cr/EHP
    T4: 508.7 cr/EHP
    T5: 775.9 cr/EHP

  no monotonicity or runaway violations

------------------------------------------------------------------------------
CHECK 3 — Earn-rate parity (cr/min vs A(T)=activeRefByTier; ±25% cross-path flag)
------------------------------------------------------------------------------
  A(T) anchor = activeRefByTier [250, 600, 1400, 3200, 7000] (sustained active cr/min by tier)
  ASSUMPTIONS: riskTier=1 (RISK_MULT=1.3), f_faction=1, f_time=1, distance=3000wu, cargoValue=4000cr

  MINING (beam_mk2, dps=30 ore-HP/s):
    avg HP/unit=29.8  avg value/unit=56.8cr  units/min=60.4
    => 3,427 cr/min (sell at commodity basePrice)

  TRADING (best legal margin = Xenium; hull trader_freighter_m, T2):
    buy=227.3  sell=547.2  margin=319.9cr/u  tradeEff=0.92
    hold=200u  cycle=240s  profit/cycle=58,869
    => 14,717 cr/min

  MISSIONS (mean over 10 types; BASE * dist * risk * value, reward/time):
    top: smuggling_run        reward=1,219 time=91s -> 804 cr/min
    top: cargo_delivery       reward=878 time=91s -> 579 cr/min
    top: passenger_transport  reward=780 time=91s -> 514 cr/min
    => mean 415 cr/min across all types

  DATA CHECK: all 10 rewardFormula strings agree with MISSION_TUNING.BASE (authoritative). OK.

  vs A(T) at each path's characteristic tier  (1x = the game's active-play anchor):
    mining        3,427 cr/min   A(T2)=  600      5.7x A(T)  <-- idealized peak (generous)
    trading      14,717 cr/min   A(T2)=  600     24.5x A(T)  <-- idealized peak (generous)
    missions        415 cr/min   A(T1)=  250      1.7x A(T)

  CROSS-PATH ±25% (median 3,427 cr/min; band [2,570, 4,284]):
    mining        3,427 cr/min  +0%
    trading      14,717 cr/min  +329%  <-- out of band
    missions        415 cr/min  -88%  <-- out of band

  CAVEAT: mining/trading are best-case first-cycle PEAKS, not steady-state. The economy's
    price-impact integral (avgMid over the traded qty) and stock drift +
    trader hotness collapse sustained rates well below these. Missions (~A(T)) is the
    calibrated path; mining/trading peaks read high precisely because no decay is modeled.

------------------------------------------------------------------------------
CHECK 4 — Passive-income cap (assert full stack is bounded by the live cap)
------------------------------------------------------------------------------
  AUTO_BALANCE: passiveCapFrac=0.45  overflowEff=0.25  activeRefByTier=[250, 600, 1400, 3200, 7000]
  VERIFY: synthesis cites passiveCapFrac 0.45 / overflowEff 0.25 — passiveCapFrac matches; but
          overflowEff is NOT used in the live cap path (creditPassive hard-clamps; the spec's
          overflow-credit clause was rejected). Effective ceiling = passiveCapPerMinForTier().

  FULL STACK (raw, uncapped cr/min — one of every asset):
    drone   drone_mk1           mineRate=0.8/s ->    1,344 cr/min
    drone   drone_mk2           mineRate=1.6/s ->    2,688 cr/min
    drone   drone_mk3           mineRate=3/s ->    5,040 cr/min
    drone   drone_mk4           mineRate=5.5/s ->    9,240 cr/min
    trader  trader_hauler_l     cargo=80 cyc=180s ->    7,679 cr/min
    trader  trader_freighter_m  cargo=200 cyc=240s ->   14,717 cr/min
    trader  trader_bulk_h       cargo=480 cyc=320s ->   27,067 cr/min
    outpost outpost_refinery    outRate=0.5/s ->    3,360 cr/min
    outpost outpost_fuelsynth   outRate=0.7/s ->    3,192 cr/min
    outpost outpost_habhub      outRate=12/s ->      720 cr/min
    TOTAL RAW                     75,046 cr/min

  LIVE CAP per tier  (passiveCapFrac * activeRefByTier[T]):
    T1: A=   250 cr/min  cap=   113 cr/min  (45% of active)  [cap BINDS the raw stack]
    T2: A=   600 cr/min  cap=   270 cr/min  (45% of active)  [cap BINDS the raw stack]
    T3: A= 1,400 cr/min  cap=   630 cr/min  (45% of active)  [cap BINDS the raw stack]
    T4: A= 3,200 cr/min  cap= 1,440 cr/min  (45% of active)  [cap BINDS the raw stack]
    T5: A= 7,000 cr/min  cap= 3,150 cr/min  (45% of active)  [cap BINDS the raw stack]

  ASSERTIONS:
    raw stack (75,046) > T5 cap (3,150)          -> PASS (cap engages)
    T5 cap (3,150) < T5 active (7,000)  -> PASS (passive < active)

  EFFECTIVE CEILING: passive income is hard-bounded at 3,150 cr/min at T5 (45% of active), regardless of how many assets are stacked.

==============================================================================
  SUMMARY
==============================================================================
    check                     status  note
    ------------------------------------------------------------------------
    1 Weapon DPS spread       WARN    2 dominant, 2 dead-pick; M-slot spread 2.13x (synthesis said 3.3x)
    2 Ship progression        PASS    monotonic, no runaway jumps
    3 Earn-rate parity        WARN    trading 24.5x A(T) & mining 5.7x are first-cycle peaks; missions ~1.7x A(T) is calibrated (cross-path band fails on the peaks)
    4 Passive-income cap      PASS    cap 3,150/min binds raw 75,046/min at T5; overflowEff unused in live path
    ------------------------------------------------------------------------
    2 PASS   2 WARN   0 FAIL


> spaceface@0.1.0 check:sg02
> npm run check:sg02:intake && npm run check:physics-authority && npm run check:sg02:dynamic-lab && node scripts/check-sg02-authority.mjs && node scripts/check-sg02-production-combat-port.mjs && node scripts/check-sg02-tether.mjs && node scripts/check-sg02-tether-break.mjs && node scripts/check-sg02-dash-collision.mjs && node scripts/check-sg02-save-reload.mjs && npm run check:sim:dynamic


> spaceface@0.1.0 check:sg02:intake
> node scripts/check-sg02-intake.mjs

SG-02 intake checks OK

> spaceface@0.1.0 check:physics-authority
> node scripts/check-physics-authority.mjs

Physics authority membrane checks OK

> spaceface@0.1.0 check:sg02:dynamic-lab
> node scripts/check-sg02-dynamic-body-owner.mjs

SG-02 dynamic body owner checks OK
SG-02 production authority checks OK
SG-02 production combat-port checks OK
SG-02 tether acceptance checks OK
node:internal/modules/run_main:107
    triggerUncaughtException(
    ^

AssertionError [ERR_ASSERTION]: overloaded Massline should break through SG-03 semantic state; maxTension=39.978294372558594 maxImpulse=0.6663049062093099

'active' !== 'broken'

    at file:///C:/Users/93rob/Documents/GitHub/SpaceFace/scripts/check-sg02-tether-break.mjs:60:10 {
  generatedMessage: false,
  code: 'ERR_ASSERTION',
  actual: 'active',
  expected: 'broken',
  operator: 'strictEqual',
  diff: 'simple'
}

Node.js v24.15.0
Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file src\win\async.c, line 76

codex
The requested chain got through the new palette checker and `check-data`, then failed inside `npm run check:non-graphics` at `scripts/check-sg02-tether-break.mjs`: expected SG-03 semantic state `broken`, got `active`. That’s outside this patch surface, so I’m checking whether it’s a repeatable dirty-tree failure before I decide how to summarize it.
exec
"C:\\Users\\93rob\\AppData\\Local\\Microsoft\\WindowsApps\\pwsh.exe" -Command "node --check src\\render\\renderer.js" in C:\Users\93rob\Documents\GitHub\SpaceFace
exec
"C:\\Users\\93rob\\AppData\\Local\\Microsoft\\WindowsApps\\pwsh.exe" -Command "node scripts\\check-sg02-tether-break.mjs" in C:\Users\93rob\Documents\GitHub\SpaceFace
 succeeded in 1207ms:
exec
"C:\\Users\\93rob\\AppData\\Local\\Microsoft\\WindowsApps\\pwsh.exe" -Command 'git diff --name-only' in C:\Users\93rob\Documents\GitHub\SpaceFace
exec
"C:\\Users\\93rob\\AppData\\Local\\Microsoft\\WindowsApps\\pwsh.exe" -Command "git diff -- scripts\\check-sg02-tether-break.mjs src\\systems\\tetherGameplay.js src\\systems\\world.js src\\systems\\flightV3.js src\\core\\gameState.js" in C:\Users\93rob\Documents\GitHub\SpaceFace
diff --git a/package.json b/package.json
index 0897813b9c443f97ae9d2e8ae253e77f386705d9..a869414ec6dbceebe45b9b78abd72013201579da
--- a/package.json
+++ b/package.json
@@ -74,9 +74,10 @@
     "build:sg04:release-assets": "node scripts/build-sg04-release-assets.mjs",
     "build:bundle": "node scripts/build-bundle.mjs",
     "check:bundle": "node scripts/check-bundle.mjs",
-    "check:launch-policy": "node scripts/check-launch-policy.mjs",
-    "check:non-graphics": "node scripts/check-non-graphics-ci.mjs",
-    "check:assets:live": "node scripts/probe-authored-assets-live.mjs",
+    "check:launch-policy": "node scripts/check-launch-policy.mjs",
+    "check:non-graphics": "node scripts/check-non-graphics-ci.mjs",
+    "check:sector-palettes": "node scripts/check-sector-palettes.mjs",
+    "check:assets:live": "node scripts/probe-authored-assets-live.mjs",
     "check:perf:control": "node scripts/probe-raf-control.mjs --headed --strict --width 1830 --height 973 --warmup 1000 --duration 5000",
     "check:perf": "node scripts/probe-performance-profile.mjs --headed --strict --width 1830 --height 973 --warmup 2500 --duration 7000 --diagnostic-variants",
     "check:hitch-budget": "node scripts/check-hitch-budget.mjs",
diff --git a/scripts/check-sector-palettes.mjs b/scripts/check-sector-palettes.mjs
new file mode 100644
index 0000000000000000000000000000000000000000..04318569a6d4a787b3cf451b3de0e457574fa6f1
--- /dev/null
+++ b/scripts/check-sector-palettes.mjs
@@ -0,0 +1,81 @@
+import { SECTORS, SECTOR_PALETTE_CLASSES } from '../src/data/sectors.js';
+
+const REQUIRED_FIELDS = ['key', 'rim', 'fill', 'ambient', 'fog', 'fogDensity', 'nebulaTint', 'dust'];
+const COLOR_FIELDS = ['key', 'rim', 'fill', 'ambient', 'fog', 'nebulaTint', 'dust'];
+const CLASS_ENTRIES = Object.entries(SECTOR_PALETTE_CLASSES);
+const CORE_LUMINANCE = combinedLightLuminance(SECTOR_PALETTE_CLASSES.core);
+const MIN_LUMINANCE = CORE_LUMINANCE * 0.8;
+const MAX_LUMINANCE = CORE_LUMINANCE * 1.2;
+
+const issues = [];
+const usedClasses = new Set();
+
+for (const sector of SECTORS) {
+  const palette = sector.palette;
+  if (!palette || typeof palette !== 'object') {
+    issues.push(`${sector.id}: missing palette block`);
+    continue;
+  }
+
+  for (const field of REQUIRED_FIELDS) {
+    if (!(field in palette)) issues.push(`${sector.id}: palette missing ${field}`);
+  }
+  for (const field of COLOR_FIELDS) {
+    if (!isColorHex(palette[field])) issues.push(`${sector.id}: palette.${field} must be a 0x000000-0xffffff number`);
+  }
+  if (!Number.isFinite(palette.fogDensity) || palette.fogDensity <= 0) {
+    issues.push(`${sector.id}: palette.fogDensity must be a positive finite number`);
+  }
+
+  const className = classNameForPalette(palette);
+  if (!className) issues.push(`${sector.id}: palette does not match an authored class`);
+  else usedClasses.add(className);
+
+  const luminance = combinedLightLuminance(palette);
+  if (luminance < MIN_LUMINANCE || luminance > MAX_LUMINANCE) {
+    issues.push(`${sector.id}: ambient+fill luminance ${luminance.toFixed(4)} outside ${MIN_LUMINANCE.toFixed(4)}-${MAX_LUMINANCE.toFixed(4)}`);
+  }
+}
+
+for (const [className] of CLASS_ENTRIES) {
+  if (!usedClasses.has(className)) issues.push(`palette class unused: ${className}`);
+}
+
+if (issues.length) {
+  console.error(`Sector palette check failed (${issues.length} issue${issues.length === 1 ? '' : 's'}):`);
+  for (const issue of issues) console.error(`- ${issue}`);
+  process.exit(1);
+}
+
+console.log(`Sector palettes OK: ${SECTORS.length} sectors, classes used: ${[...usedClasses].sort().join(', ')}`);
+
+function classNameForPalette(palette) {
+  for (const [className, classPalette] of CLASS_ENTRIES) {
+    if (samePalette(palette, classPalette)) return className;
+  }
+  return null;
+}
+
+function samePalette(a, b) {
+  return REQUIRED_FIELDS.every((field) => a[field] === b[field]);
+}
+
+function isColorHex(value) {
+  return Number.isInteger(value) && value >= 0x000000 && value <= 0xffffff;
+}
+
+function combinedLightLuminance(palette) {
+  return relativeLuminance(palette.ambient) + relativeLuminance(palette.fill);
+}
+
+function relativeLuminance(hex) {
+  const r = linearRgb((hex >> 16) & 0xff);
+  const g = linearRgb((hex >> 8) & 0xff);
+  const b = linearRgb(hex & 0xff);
+  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
+}
+
+function linearRgb(channel) {
+  const c = channel / 255;
+  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
+}
diff --git a/src/data/sectors.js b/src/data/sectors.js
index 9c63f69479b241fc848258e3fe2161547793fa46..1814c409089f818b6ab4758b3f0cf8f8531f2452
--- a/src/data/sectors.js
+++ b/src/data/sectors.js
@@ -10,10 +10,30 @@
 export const HAZARD_TYPES  = ['dense_asteroid', 'nebula', 'radiation', 'debris'];
 export const POI_TYPES     = ['beacon', 'derelict', 'cache', 'colony', 'anomaly', 'wormhole', 'wreck'];
 
+export const SECTOR_PALETTE_CLASSES = {
+  core: {
+    key: 0xcfe2ff, rim: 0x6a5cff, fill: 0x39d0ff, ambient: 0x42506f,
+    fog: 0x0a1430, fogDensity: 0.00026, nebulaTint: 0x1e3a6a, dust: 0x7ea7c7,
+  },
+  belt: {
+    key: 0xffd59a, rim: 0xb56d2f, fill: 0xffb13d, ambient: 0x594a42,
+    fog: 0x2a160c, fogDensity: 0.00034, nebulaTint: 0x8a4a1e, dust: 0xc0793d,
+  },
+  fringe: {
+    key: 0xffb07a, rim: 0xff3f2d, fill: 0xffaa66, ambient: 0x584343,
+    fog: 0x2a0d0a, fogDensity: 0.00042, nebulaTint: 0x8a1e1e, dust: 0xc15032,
+  },
+  anomaly: {
+    key: 0xc8b6ff, rim: 0x54ffb0, fill: 0x4ddc92, ambient: 0x494760,
+    fog: 0x160d2c, fogDensity: 0.00036, nebulaTint: 0x5a1e8a, dust: 0x79ffc8,
+  },
+};
+
 export const SECTORS = [
   {
     id: 'sector_helios_prime', name: 'Helios Prime', tier: 0, security: 0.98, charted: true,
     factionId: 'faction_scn', position: { x: 0, y: 0 }, worldRadius: 3500,
+    palette: SECTOR_PALETTE_CLASSES.core,
     // Tutorial home sector: NO hostile spawns (enemyDensity 0). A brand-new pilot must not be
     // hunted before learning the ropes; danger ramps up only in neighbouring sectors.
     trafficPerMin: 18, enemyDensity: 0, enemyLevel: [1, 2],
@@ -37,6 +57,7 @@
   {
     id: 'sector_ceres_belt', name: 'Ceres Belt', tier: 1, security: 0.72, charted: true,
     factionId: 'faction_dmc', position: { x: -3, y: 2 }, worldRadius: 4200,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 10, enemyDensity: 0.18, enemyLevel: [2, 4],
     neighbors: ['sector_helios_prime', 'sector_tethys_junction', 'sector_pallas_drift'],
     stations: [
@@ -57,6 +78,7 @@
   {
     id: 'sector_tethys_junction', name: 'Tethys Junction', tier: 1, security: 0.65, charted: true,
     factionId: 'faction_mts', position: { x: 3, y: 2 }, worldRadius: 4000,
+    palette: SECTOR_PALETTE_CLASSES.core,
     trafficPerMin: 14, enemyDensity: 0.20, enemyLevel: [2, 4],
     neighbors: ['sector_helios_prime', 'sector_ceres_belt', 'sector_vesta_forge', 'sector_io_reach'],
     stations: [
@@ -72,6 +94,7 @@
   {
     id: 'sector_vesta_forge', name: 'Vesta Forge', tier: 1, security: 0.60, charted: true,
     factionId: 'faction_dmc', position: { x: 0, y: 4 }, worldRadius: 4300,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 9, enemyDensity: 0.25, enemyLevel: [3, 5],
     neighbors: ['sector_helios_prime', 'sector_tethys_junction', 'sector_charon_expanse'],
     stations: [
@@ -89,6 +112,7 @@
   {
     id: 'sector_pallas_drift', name: 'Pallas Drift', tier: 2, security: 0.42, charted: true,
     factionId: 'faction_mts', position: { x: -5, y: 5 }, worldRadius: 4500,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 7, enemyDensity: 0.40, enemyLevel: [4, 7],
     neighbors: ['sector_ceres_belt', 'sector_io_reach', 'sector_sker_haven'],
     stations: [
@@ -109,6 +133,7 @@
   {
     id: 'sector_io_reach', name: 'Io Reach', tier: 2, security: 0.35, charted: true,
     factionId: 'faction_free', position: { x: 5, y: 5 }, worldRadius: 4600,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 5, enemyDensity: 0.50, enemyLevel: [5, 8],
     neighbors: ['sector_tethys_junction', 'sector_pallas_drift', 'sector_charon_expanse', 'sector_veil_nebula'],
     stations: [
@@ -132,6 +157,7 @@
   {
     id: 'sector_charon_expanse', name: 'Charon Expanse', tier: 2, security: 0.30, charted: true,
     factionId: 'faction_dmc', position: { x: 2, y: 7 }, worldRadius: 4800,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 4, enemyDensity: 0.50, enemyLevel: [5, 9],
     neighbors: ['sector_vesta_forge', 'sector_io_reach', 'sector_ashfall_reach'],
     stations: [
@@ -151,6 +177,7 @@
   {
     id: 'sector_sker_haven', name: 'Sker Haven', tier: 3, security: 0.08, charted: false,
     factionId: 'faction_reach', position: { x: -7, y: 8 }, worldRadius: 5000,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 0, enemyDensity: 0.70, enemyLevel: [7, 11],
     neighbors: ['sector_pallas_drift', 'sector_veil_nebula'],
     stations: [
@@ -169,6 +196,7 @@
   {
     id: 'sector_veil_nebula', name: 'Veil Nebula', tier: 3, security: 0.12, charted: false,
     factionId: 'faction_free', position: { x: 7, y: 9 }, worldRadius: 5200,
+    palette: SECTOR_PALETTE_CLASSES.anomaly,
     trafficPerMin: 0, enemyDensity: 0.65, enemyLevel: [8, 12],
     neighbors: ['sector_io_reach', 'sector_sker_haven'],
     wormholeTo: { sectorId: 'sector_ashfall_reach', gatedBy: 'tech:tech_long_range_survey' },
@@ -188,6 +216,7 @@
   {
     id: 'sector_ashfall_reach', name: 'Ashfall Reach', tier: 4, security: 0.05, charted: false,
     factionId: 'faction_vael', position: { x: 4, y: 11 }, worldRadius: 5500,
+    palette: SECTOR_PALETTE_CLASSES.anomaly,
     trafficPerMin: 0, enemyDensity: 0.80, enemyLevel: [10, 15],
     neighbors: ['sector_charon_expanse'],
     stations: [
diff --git a/src/render/renderer.js b/src/render/renderer.js
index def6420ff1bff2ac1c64dcc1add395e7851c4dbc..7b83534145db2cec91608a3a2a42dfe1ec083a9d
--- a/src/render/renderer.js
+++ b/src/render/renderer.js
@@ -15,21 +15,10 @@
 import { installDiagnostics } from './diagnostics.js';
 import { createPlanetFactory } from './planetFactory.js';
 import { precompilePipelines } from './precompile.js';
-
-// Map a sector's danger/tier to a nebula backdrop tint so each region of the galaxy has its own
-// color signature. Core (safe, low tier) = clean blue; industrial mid-ring = rust/amber; lawless
-// frontier = blood-red; alien/endgame tier 4+ = violet. Returns a hex string or null (default).
-function sectorNebulaTint(sector) {
-  if (!sector) return null;
-  const tier = sector.tier || 0;
-  const sec = sector.security != null ? sector.security : 1;
-  const danger = (1 - sec) + tier * 0.15; // blended danger metric
-  if (tier >= 4) return '#5a1e8a';        // violet — alien / lawless endgame (Veil, Ashfall)
-  if (danger > 0.7) return '#8a1e1e';     // blood-red — dangerous frontier (Io Reach, Sker)
-  if (danger > 0.45) return '#8a4a1e';    // rust/amber — industrial mid-ring (Vesta, Pallas)
-  if (danger > 0.2) return '#1e4a8a';     // deep blue — settled belt (Ceres, Tethys)
-  return '#1e3a6a';                        // clean blue — safe core (Helios Prime)
-}
+import { SECTOR_PALETTE_CLASSES } from '../data/sectors.js';
+
+const SECTOR_PALETTE_LERP_SECONDS = 1.5;
+const SECTOR_LIGHT_INTENSITIES = { ambient: 0.85, key: 1.7, rim: 0.7, fill: 0.35 };
 
 // ---- contact shadow disc (module-level cache so one texture serves all entities) ----------------
 let _shadowTex = null;
@@ -178,14 +167,15 @@
     renderer.setClearColor(0x060912, 1);
     const drawSize = applyRendererSize(renderer, state);
 
-    const scene = new THREE.Scene();
-    // Thin fog for gentle depth cueing only — the old 0.00085 erased the entire backdrop, leaving a
-    // black void. This keeps the nebula + far stars visible while still fading the deep distance.
-    scene.fog = new THREE.FogExp2(0x0a1430, 0.00026);
-    scene.add(new THREE.AmbientLight(0x42506f, 0.85));
-    const key = new THREE.DirectionalLight(0xcfe2ff, 1.7); key.position.set(60, 140, 40); scene.add(key);
-    const rim = new THREE.DirectionalLight(0x6a5cff, 0.7); rim.position.set(-70, 50, -60); scene.add(rim);
-    const fill = new THREE.DirectionalLight(0x39d0ff, 0.35); fill.position.set(20, 30, 120); scene.add(fill);
+    const scene = new THREE.Scene();
+    const corePalette = SECTOR_PALETTE_CLASSES.core;
+    // Thin fog for gentle depth cueing only — the old 0.00085 erased the entire backdrop, leaving a
+    // black void. This keeps the nebula + far stars visible while still fading the deep distance.
+    scene.fog = new THREE.FogExp2(corePalette.fog, corePalette.fogDensity);
+    const ambient = new THREE.AmbientLight(corePalette.ambient, SECTOR_LIGHT_INTENSITIES.ambient); scene.add(ambient);
+    const key = new THREE.DirectionalLight(corePalette.key, SECTOR_LIGHT_INTENSITIES.key); key.position.set(60, 140, 40); scene.add(key);
+    const rim = new THREE.DirectionalLight(corePalette.rim, SECTOR_LIGHT_INTENSITIES.rim); rim.position.set(-70, 50, -60); scene.add(rim);
+    const fill = new THREE.DirectionalLight(corePalette.fill, SECTOR_LIGHT_INTENSITIES.fill); fill.position.set(20, 30, 120); scene.add(fill);
 
     // Real shadow maps (graphics spec Workstream G). Gated behind settings.video.shadows (default
     // true). The key light becomes a shadow caster with a tight frustum that follows the player so
@@ -210,7 +200,7 @@
     }
 
     const cam = createChaseCamera(state);
-    const starfield = createStarfield(scene);
+    const starfield = createStarfield(scene, { tint: corePalette.nebulaTint });
     const vf = createVisualFactory();
     // Hero-asset registry (spec §17.3): wraps the factory's build() so the bespoke player Kestrel is
     // intercepted before the procedural visualFactory. Narrow + failure-isolated — any throw falls
@@ -283,13 +273,16 @@
     // contact-sheet references and are replaced by procedural materials / inline SVG).
     { const i = new Image(); i.src = 'assets/cinematics/menu_background.jpg'; }
 
-    this.renderer = renderer; this.scene = scene; this.cam = cam; this.starfield = starfield; this.vf = vf;
-    this.authoredPartLibraryReady = preloadAuthoredPartLibrary(renderer).catch((error) => {
-      console.warn('[render] authored part library preload failed', error);
-      return null;
-    });
-    state.render.authoredPartLibraryReady = this.authoredPartLibraryReady;
-    this._keyLight = shadowsOn ? key : null; // referenced by _updateShadowFollow() each frame
+    this.renderer = renderer; this.scene = scene; this.cam = cam; this.starfield = starfield; this.vf = vf;
+    this.authoredPartLibraryReady = preloadAuthoredPartLibrary(renderer).catch((error) => {
+      console.warn('[render] authored part library preload failed', error);
+      return null;
+    });
+    state.render.authoredPartLibraryReady = this.authoredPartLibraryReady;
+    this._sectorPaletteRig = createSectorPaletteRig(scene, ambient, key, rim, fill);
+    this._sectorPaletteTarget = corePalette;
+    state.render.sectorPalette = corePalette;
+    this._keyLight = shadowsOn ? key : null; // referenced by _updateShadowFollow() each frame
     this._shadowSettingOn = shadowsOn;
     this._shadowReceiversDirty = true;
     this._shadowReceiverCount = 0;
@@ -410,20 +403,19 @@
     // already spawned by the time this fires (enterSector spawns before its sector:enter resolves),
     // so a blind clearAllMeshes(keepPlayer) used to wipe the station/asteroids and leave the player
     // alone in empty space. reconcileMeshes() removes only meshes for entities that are gone.
-    bus.on('sector:enter', ({ sector } = {}) => {
-      this._meshReconcileDirty = true;
-      if (cam.snapToPlayer) cam.snapToPlayer();
-      this._updatePlanetBodies(sector);
-      // Tint the nebula backdrop to the sector's mood so each region of the galaxy reads with its
-      // own color signature: clean-blue core → rust/amber industrial → blood-red frontier → violet
-      // alien/endgame. Drives the whole-frame atmosphere, reinforcing the core-to-frontier gradient.
-      if (this.starfield && this.starfield.setSectorTint) {
-        this.starfield.setSectorTint(sectorNebulaTint(sector));
-      }
+    bus.on('sector:enter', ({ sector } = {}) => {
+      this._meshReconcileDirty = true;
+      if (cam.snapToPlayer) cam.snapToPlayer();
+      this._updatePlanetBodies(sector);
+      this._beginSectorPaletteTransition(sector);
       this._updateHazardVisuals(sector);
       precompilePipelines(renderer, scene, cam.obj, { sector }).catch((error) => console.warn('[render] sector pipeline precompile failed', error));
     });
-    bus.on('save:loaded', () => { this._meshReconcileDirty = true; });
+    bus.on('jump:arrive', ({ sectorId } = {}) => {
+      const sector = sectorId && state.world && state.world.sectors ? state.world.sectors[sectorId] : null;
+      this._beginSectorPaletteTransition(sector);
+    });
+    bus.on('save:loaded', () => { this._meshReconcileDirty = true; });
 
     window.addEventListener('resize', () => this.onResize());
   },
@@ -640,7 +632,7 @@
     return tex;
   },
 
-  _updateHazardVisuals(sector) {
+  _updateHazardVisuals(sector) {
     // Dispose previous hazard visuals
     for (const obj of this._hazardVisuals) {
       this.scene.remove(obj);
@@ -701,10 +693,42 @@
         this.scene.add(ring);
         this._hazardVisuals.push(ring);
       }
-    }
-  },
-
-  prepareFrame(alpha, frameDt) {
+    }
+  },
+
+  _beginSectorPaletteTransition(sector) {
+    const rig = this._sectorPaletteRig;
+    if (!rig) return;
+    const palette = sector && sector.palette ? sector.palette : SECTOR_PALETTE_CLASSES.core;
+    this.state.render.sectorPalette = palette;
+    if (palette === this._sectorPaletteTarget) return;
+
+    this._sectorPaletteTarget = palette;
+    writeRigToSectorPaletteFrame(rig.start, rig);
+    writePaletteToSectorPaletteFrame(rig.target, palette);
+    rig.elapsed = 0;
+    rig.active = true;
+
+    if (this.starfield && this.starfield.setSectorTint) {
+      this.starfield.setSectorTint(palette.nebulaTint);
+    }
+  },
+
+  _updateSectorPaletteTransition(frameDt) {
+    const rig = this._sectorPaletteRig;
+    if (!rig || !rig.active) return;
+    const dt = Number.isFinite(frameDt) ? Math.max(0, frameDt) : 0;
+    rig.elapsed = Math.min(SECTOR_PALETTE_LERP_SECONDS, rig.elapsed + dt);
+    const rawT = SECTOR_PALETTE_LERP_SECONDS > 0 ? rig.elapsed / SECTOR_PALETTE_LERP_SECONDS : 1;
+    const t = rawT * rawT * (3 - 2 * rawT);
+    lerpSectorPaletteFrame(rig, rig.start, rig.target, t);
+    if (rawT >= 1) {
+      rig.active = false;
+      applySectorPaletteFrame(rig, rig.target);
+    }
+  },
+
+  prepareFrame(alpha, frameDt) {
     // While the GL context is lost, the renderer can't draw — skip all per-frame work until
     // webglcontextrestored rebuilds GPU resources. (cam.follow etc. would run against a dead
     // renderer; the context-restore handler re-applies everything that matters when it returns.)
@@ -716,9 +740,10 @@
     syncAuthoredInstancePools(this.scene, { camera: this.cam.obj });
     this.starfield.recenter(this.cam.obj.position);
     // Background-clock for distant animation (planet cloud drift, hero-star twinkle). Integrates real
-    // frame dt scaled by state.timeScale so the cosmos respects hit-stop/pause — a death freeze
-    // momentarily stills the clouds too, keeping the backdrop in the same time model as the action.
-    const ts = (this.state.timeScale != null) ? this.state.timeScale : 1;
+    // frame dt scaled by state.timeScale so the cosmos respects hit-stop/pause — a death freeze
+    // momentarily stills the clouds too, keeping the backdrop in the same time model as the action.
+    this._updateSectorPaletteTransition(frameDt);
+    const ts = (this.state.timeScale != null) ? this.state.timeScale : 1;
     this._bgTime = (this._bgTime || 0) + frameDt * ts;
     if (this.starfield.update) this.starfield.update(frameDt, this._bgTime);
     this._updatePlanetParallax();
@@ -899,13 +924,97 @@
   return renderer.getDrawingBufferSize(_drawSize);
 }
 
-function finiteInRange(value, min, max, fallback) {
-  const n = Number(value);
-  if (!Number.isFinite(n)) return fallback;
-  return Math.max(min, Math.min(max, n));
-}
-
-function disposeObject(obj) {
+function finiteInRange(value, min, max, fallback) {
+  const n = Number(value);
+  if (!Number.isFinite(n)) return fallback;
+  return Math.max(min, Math.min(max, n));
+}
+
+function createSectorPaletteRig(scene, ambientLight, keyLight, rimLight, fillLight) {
+  const rig = {
+    scene,
+    lights: { ambient: ambientLight, key: keyLight, rim: rimLight, fill: fillLight },
+    start: createSectorPaletteFrame(),
+    target: createSectorPaletteFrame(),
+    elapsed: 0,
+    active: false,
+  };
+  writeRigToSectorPaletteFrame(rig.start, rig);
+  writeRigToSectorPaletteFrame(rig.target, rig);
+  return rig;
+}
+
+function createSectorPaletteFrame() {
+  return {
+    colors: {
+      ambient: new THREE.Color(),
+      key: new THREE.Color(),
+      rim: new THREE.Color(),
+      fill: new THREE.Color(),
+      fog: new THREE.Color(),
+    },
+    intensities: { ambient: 0, key: 0, rim: 0, fill: 0 },
+    fogDensity: 0,
+  };
+}
+
+function writeRigToSectorPaletteFrame(frame, rig) {
+  frame.colors.ambient.copy(rig.lights.ambient.color);
+  frame.colors.key.copy(rig.lights.key.color);
+  frame.colors.rim.copy(rig.lights.rim.color);
+  frame.colors.fill.copy(rig.lights.fill.color);
+  frame.colors.fog.copy(rig.scene.fog.color);
+  frame.intensities.ambient = rig.lights.ambient.intensity;
+  frame.intensities.key = rig.lights.key.intensity;
+  frame.intensities.rim = rig.lights.rim.intensity;
+  frame.intensities.fill = rig.lights.fill.intensity;
+  frame.fogDensity = rig.scene.fog.density;
+}
+
+function writePaletteToSectorPaletteFrame(frame, palette) {
+  frame.colors.ambient.setHex(palette.ambient);
+  frame.colors.key.setHex(palette.key);
+  frame.colors.rim.setHex(palette.rim);
+  frame.colors.fill.setHex(palette.fill);
+  frame.colors.fog.setHex(palette.fog);
+  frame.intensities.ambient = SECTOR_LIGHT_INTENSITIES.ambient;
+  frame.intensities.key = SECTOR_LIGHT_INTENSITIES.key;
+  frame.intensities.rim = SECTOR_LIGHT_INTENSITIES.rim;
+  frame.intensities.fill = SECTOR_LIGHT_INTENSITIES.fill;
+  frame.fogDensity = palette.fogDensity;
+}
+
+function applySectorPaletteFrame(rig, frame) {
+  rig.lights.ambient.color.copy(frame.colors.ambient);
+  rig.lights.key.color.copy(frame.colors.key);
+  rig.lights.rim.color.copy(frame.colors.rim);
+  rig.lights.fill.color.copy(frame.colors.fill);
+  rig.scene.fog.color.copy(frame.colors.fog);
+  rig.lights.ambient.intensity = frame.intensities.ambient;
+  rig.lights.key.intensity = frame.intensities.key;
+  rig.lights.rim.intensity = frame.intensities.rim;
+  rig.lights.fill.intensity = frame.intensities.fill;
+  rig.scene.fog.density = frame.fogDensity;
+}
+
+function lerpSectorPaletteFrame(rig, start, target, t) {
+  rig.lights.ambient.color.lerpColors(start.colors.ambient, target.colors.ambient, t);
+  rig.lights.key.color.lerpColors(start.colors.key, target.colors.key, t);
+  rig.lights.rim.color.lerpColors(start.colors.rim, target.colors.rim, t);
+  rig.lights.fill.color.lerpColors(start.colors.fill, target.colors.fill, t);
+  rig.scene.fog.color.lerpColors(start.colors.fog, target.colors.fog, t);
+  rig.lights.ambient.intensity = lerp(start.intensities.ambient, target.intensities.ambient, t);
+  rig.lights.key.intensity = lerp(start.intensities.key, target.intensities.key, t);
+  rig.lights.rim.intensity = lerp(start.intensities.rim, target.intensities.rim, t);
+  rig.lights.fill.intensity = lerp(start.intensities.fill, target.intensities.fill, t);
+  rig.scene.fog.density = lerp(start.fogDensity, target.fogDensity, t);
+}
+
+function lerp(a, b, t) {
+  return a + (b - a) * t;
+}
+
+function disposeObject(obj) {
   obj.traverse((c) => {
     if (c.isBatchedMesh && typeof c.dispose === 'function') c.dispose();
     else if (c.geometry && !(c.userData && (c.userData.sharedContactShadow || c.userData.sharedShieldGeo))) c.geometry.dispose();
diff --git a/src/render/starfield.js b/src/render/starfield.js
index d76965c563ac0d99166bb382577d2f6eaa4a6d0f..aecb37608592e6ff981ddaf8fd6107d17a0632e6
--- a/src/render/starfield.js
+++ b/src/render/starfield.js
@@ -116,10 +116,18 @@
   return c;
 }
 
-// --- small color helpers for sector tinting (no deps) ---
-function hexToRgb(hex) {
-  const h = hex.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
-}
+// --- small color helpers for sector tinting (no deps) ---
+function normalizeTint(tint) {
+  if (tint == null) return null;
+  if (typeof tint === 'number' && Number.isFinite(tint)) {
+    return '#' + ((tint >>> 0) & 0xffffff).toString(16).padStart(6, '0');
+  }
+  if (typeof tint === 'string') return tint.startsWith('#') ? tint : '#' + tint.replace(/^0x/i, '');
+  return null;
+}
+function hexToRgb(hex) {
+  const h = hex.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
+}
 function rgbToHex(r, g, b) {
   const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
   return '#' + c(r) + c(g) + c(b);
@@ -176,11 +184,11 @@
   ctx.restore();
 }
 
-export function createStarfield(scene, opts = {}) {
-  const layers = [];
-  const sprite = makeStarSprite();
-  let bgTexture = null;
-  let currentTint = opts.tint || null;
+export function createStarfield(scene, opts = {}) {
+  const layers = [];
+  const sprite = makeStarSprite();
+  let bgTexture = null;
+  let currentTint = normalizeTint(opts.tint);
 
   // star tints (mostly cool white/blue with a few warm + teal accents)
   const TINTS = [0xffffff, 0xcfe0ff, 0x9fb6e0, 0xfff0d8, 0x8af0d6, 0xbfd2ff];
@@ -297,13 +305,14 @@
       // GR-7: slow-rotate the distant 3D planets so they read as real spinning worlds, not billboards.
       for (const p of distantPlanets) p.mesh.rotation.y += dt * p.spin;
     },
-    // Swap the nebula mood on sector enter — each region of the galaxy reads with its own color
-    // signature (core = clean blue, industrial = rust/amber, frontier = blood-red, alien = violet).
-    setSectorTint(tint) {
-      if (tint === currentTint) return;
-      currentTint = tint || null;
-      applyBackground(currentTint);
-    },
+    // Swap the nebula mood on sector enter — each region of the galaxy reads with its own color
+    // signature (core = clean blue, industrial = rust/amber, frontier = blood-red, alien = violet).
+    setSectorTint(tint) {
+      const nextTint = normalizeTint(tint);
+      if (nextTint === currentTint) return;
+      currentTint = nextTint;
+      applyBackground(currentTint);
+    },
     setWarp() { /* extended by vfx during jump */ },
   };
 }

 exited 1 in 2791ms:
node:internal/modules/run_main:107
    triggerUncaughtException(
    ^

AssertionError [ERR_ASSERTION]: overloaded Massline should break through SG-03 semantic state; maxTension=39.978294372558594 maxImpulse=0.6663049062093099

'active' !== 'broken'

    at file:///C:/Users/93rob/Documents/GitHub/SpaceFace/scripts/check-sg02-tether-break.mjs:60:10 {
  generatedMessage: false,
  code: 'ERR_ASSERTION',
  actual: 'active',
  expected: 'broken',
  operator: 'strictEqual',
  diff: 'simple'
}

Node.js v24.15.0
Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file src\win\async.c, line 76

 succeeded in 1862ms:
warning: in the working copy of 'AGENTS.md', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'ARCHITECTURE.md', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'index.html', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'package.json', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'scripts/check-claim-base-input.mjs', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'scripts/check-input-modalities.mjs', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'scripts/check-mission-accept-handoff-runtime.mjs', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'src/core/eventBus.js', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'src/core/gameState.js', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'src/core/simSnapshot.js', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'src/data/commodities.js', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'src/data/mining.js', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'src/data/sectors.js', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'src/main.js', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'src/render/partsLibrary.js', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'src/render/renderer.js', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'src/render/starfield.js', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'src/save/saveSystem.js', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'src/systems/ai.js', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'src/systems/input.js', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'src/systems/mining.js', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'src/systems/weapons.js', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'src/systems/world.js', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'src/ui/bindings.js', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'src/ui/input.js', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'src/ui/radar.js', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'src/ui/screens/bar.js', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'src/ui/screens/localmap.js', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'src/ui/screens/starmap.js', LF will be replaced by CRLF the next time Git touches it
AGENTS.md
ARCHITECTURE.md
assets/ships/release.__building/kestrel/kestrel_reference.glb
assets/ships/release.__building/parts/cockpits/cockpit_dome.glb
assets/ships/release.__building/parts/cockpits/cockpit_recessed.glb
assets/ships/release.__building/parts/cockpits/cockpit_slab.glb
assets/ships/release.__building/parts/engines/engine_industrial.glb
assets/ships/release.__building/parts/engines/engine_ion_small.glb
assets/ships/release.__building/parts/engines/engine_ion_twin.glb
assets/ships/release.__building/parts/engines/engine_resonator.glb
assets/ships/release.__building/parts/fins/fin_crystalline.glb
assets/ships/release.__building/parts/fins/fin_radiator_grid.glb
assets/ships/release.__building/parts/fins/fin_swept_smuggler.glb
assets/ships/release.__building/parts/fins/fin_wedge.glb
assets/ships/release.__building/parts/greebles/greeble_hatches.glb
assets/ships/release.__building/parts/greebles/greeble_vents.glb
assets/ships/release.__building/parts/hulls/hull_corvette.glb
assets/ships/release.__building/parts/hulls/hull_fighter.glb
assets/ships/release.__building/parts/hulls/hull_freighter.glb
assets/ships/release.__building/parts/hulls/hull_gunship.glb
assets/ships/release.__building/parts/hulls/hull_interceptor.glb
assets/ships/release.__building/parts/hulls/hull_miner.glb
assets/ships/release.__building/parts/hulls/hull_starter.glb
assets/ships/release.__building/parts/weapons/weapon_heavy_cannon.glb
assets/ships/release.__building/parts/weapons/weapon_lance.glb
assets/ships/release.__building/parts/weapons/weapon_pulse_cannon.glb
assets/ships/release.__building/parts/weapons/weapon_turret_dual.glb
assets/ships/release.__lock/owner.json
index.html
package.json
scripts/check-claim-base-input.mjs
scripts/check-input-modalities.mjs
scripts/check-mission-accept-handoff-runtime.mjs
src/combat/attachments.js
src/core/eventBus.js
src/core/gameState.js
src/core/registry.js
src/core/simSnapshot.js
src/data/combatDefs.js
src/data/commodities.js
src/data/mining.js
src/data/sectors.js
src/main.js
src/render/partsLibrary.js
src/render/renderer.js
src/render/starfield.js
src/render/vfx.js
src/save/saveSystem.js
src/systems/ai.js
src/systems/input.js
src/systems/mining.js
src/systems/onboarding.js
src/systems/weapons.js
src/systems/world.js
src/ui/bindings.js
src/ui/comms.js
src/ui/confirm.js
src/ui/controlPrompts.js
src/ui/hud.js
src/ui/input.js
src/ui/radar.js
src/ui/screens/bar.js
src/ui/screens/localmap.js
src/ui/screens/settings.js
src/ui/screens/starmap.js
src/ui/uiRoot.js
styles/ui.css

 succeeded in 1738ms:
warning: in the working copy of 'src/core/gameState.js', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'src/systems/world.js', LF will be replaced by CRLF the next time Git touches it
diff --git a/src/core/gameState.js b/src/core/gameState.js
index eda93e75..f907415c 100644
--- a/src/core/gameState.js
+++ b/src/core/gameState.js
@@ -111,7 +111,7 @@ export function createGameState(seed) {
              endgameChoice: null, endgameOffered: false, endgameDeclined: [], persistentCargo: [] },
     crafting: { queues: {} },
     aiEncounter: { schemaVersion: AI_CONTRACT_VERSION, nextSeq: 1, commands: [] },
-    world: { sectors: {}, currentSectorId: null, activeSector: { stations: [], fields: [], hazards: [], pois: [], gates: [] }, discovery: {}, entryPoint: { x: 0, z: 0, heading: 0 } },
+    world: { sectors: {}, currentSectorId: null, activeSector: { stations: [], fields: [], hazards: [], pois: [], gates: [] }, discovery: {}, scanPings: {}, entryPoint: { x: 0, z: 0, heading: 0 } },
     jump: { state: 'IDLE', targetSectorId: null, via: null, chargeT: 0, chargeNeeded: 0, cooldownT: 0 },
     fuel: { current: 100, max: 100 },
     nav: { route: null, autoTravel: false, waypoint: null },   // waypoint = {stationId,pos:{x,z},label} set by the trade route planner
diff --git a/src/systems/world.js b/src/systems/world.js
index d252f32a..0602af8e 100644
--- a/src/systems/world.js
+++ b/src/systems/world.js
@@ -16,9 +16,9 @@
 // Single-writer (§0.6): world owns world.*/jump/fuel/nav; it emits economy:chargeCredits for
 //   gate tolls and never writes credits/cargo/rep directly. (Radiation hull drain is an
 //   environmental effect applied to the entity hull, which has no separate combat owner.)
-import { SECTORS, dangerIndex } from '../data/sectors.js';
+import { SECTORS, dangerIndex, surveyDataPrice } from '../data/sectors.js';
 import { effectiveSectorFor } from './sectorSim.js';   // V2 §33 — live (drifted) hazard for spawn sizing
-import { ASTEROIDS, FIELDS } from '../data/mining.js';
+import { ASTEROIDS, FIELDS, deriveAsteroidSeams } from '../data/mining.js';
 import { makeEnemySpawnSpec } from './combat.js';
 
 // ---- global tuning constants (design 05 "GLOBAL TUNING CONSTANTS" + "Formulas") -------------
@@ -43,6 +43,10 @@ const DEFAULT_DRIVE = DRIVE_TIERS.jump_t1;
 
 const SECTOR_BY_ID = new Map(SECTORS.map((s) => [s.id, s]));
 const AST_BY_ID = new Map(ASTEROIDS.map((a) => [a.id, a]));
+const STATION_SECTOR_ID = new Map();
+for (const sector of SECTORS) {
+  for (const station of sector.stations || []) STATION_SECTOR_ID.set(station.id, sector.id);
+}
 
 const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
 
@@ -69,6 +73,8 @@ export const world = {
       for (const s of SECTORS) state.world.sectors[s.id] = { ...s, owner: s.factionId };
     }
     if (!state.world.discovery) state.world.discovery = {};
+    if (Object.keys(state.world.discovery).length === 0) this._seedChartedDiscovery();
+    if (!state.world.scanPings || typeof state.world.scanPings !== 'object') state.world.scanPings = {};
     if (!state.world.pendingSpawns || typeof state.world.pendingSpawns !== 'object') state.world.pendingSpawns = {};
 
     // Runtime-only flags (not serialized).
@@ -91,6 +97,7 @@ export const world = {
     bus.on('ship:statsChanged', () => this._resolveShipModules());
     bus.on('field:depletedChanged', (p) => this._onFieldDepleted(p || {}));
     bus.on('spawn:request', (p) => this._onSpawnRequest(p || {}));
+    bus.on('ui:purchaseSurveyData', (p) => this._onPurchaseSurveyData(p || {}));
     // Mark the boss POI defeated when the dreadnought dies, so it does not respawn on sector
     // re-entry or save reload. (The entity carries data.isBoss + data.bossSectorId/bossPoiId.)
     bus.on('entity:killed', (p) => this._onBossKilled(p || {}));
@@ -284,7 +291,7 @@ export const world = {
     const yieldU = Math.max(1, Math.round(yLo + (yHi - yLo) * t));
     const tierCap = Math.min(def.tierCap, params.tierCap != null ? params.tierCap : def.tierCap);
 
-    return this.helpers.spawnEntity({
+    const ent = this.helpers.spawnEntity({
       type: 'asteroid', pos,
       radius: size, mass: 200 + size * 40, angVel: (rng() - 0.5) * 0.35,
       hull: oreHP, hullMax: oreHP, collides: true,
@@ -295,6 +302,11 @@ export const world = {
         fieldId: fdef.id,
       },
     });
+    ent.data.seams = deriveAsteroidSeams(this.state.meta.seed, ent.id, ent.radius, {
+      hash32: this.helpers.hash32,
+      mulberry32: this.helpers.mulberry32,
+    });
+    return ent;
   },
 
   // Jump GATES: one per outbound edge, placed on the disc rim toward the neighbor's map position.
@@ -492,6 +504,45 @@ export const world = {
     return d[sectorId];
   },
 
+  _seedChartedDiscovery() {
+    for (const sector of SECTORS) {
+      const rec = this._discoveryFor(sector.id);
+      if (sector.charted === true) {
+        rec.discovered = true;
+        if (!rec.source) rec.source = 'charted';
+      }
+    }
+  },
+
+  _onPurchaseSurveyData({ sectorId, stationId }) {
+    const sector = SECTOR_BY_ID.get(sectorId);
+    if (!sector || sector.charted === true) return false;
+    const stationSectorId = STATION_SECTOR_ID.get(stationId) || this.state.world.currentSectorId;
+    const stationSector = stationSectorId && (this.state.world.sectors[stationSectorId] || SECTOR_BY_ID.get(stationSectorId));
+    if (!stationSector || !(stationSector.neighbors || []).includes(sectorId)) return false;
+
+    const disc = this._discoveryFor(sectorId);
+    if (disc.discovered) {
+      this.bus.emit('toast', { text: `${sector.name} is already charted`, kind: 'info', ttl: 3 });
+      return true;
+    }
+
+    const price = surveyDataPrice(sector);
+    const credits = (this.state.player && this.state.player.credits) | 0;
+    if (credits < price) {
+      this.bus.emit('toast', { text: `Survey data costs ${price.toLocaleString('en-US')} CR`, kind: 'warn', ttl: 3 });
+      return false;
+    }
+
+    this.bus.emit('economy:chargeCredits', { amount: price, reason: `survey:${sectorId}` });
+    disc.discovered = true;
+    disc.source = 'survey';
+    disc.surveyedAt = this.state.simTime || 0;
+    this.bus.emit('map:sectorCharted', { sectorId, source: 'survey' });
+    this.bus.emit('toast', { text: `Survey data added: ${sector.name}`, kind: 'info', ttl: 3.5 });
+    return true;
+  },
+
   // =========================================================================================
   // per-tick update: jump state machine, fuel, hazards, POI scan, cooldown
   // =========================================================================================
@@ -993,6 +1044,7 @@ export const world = {
     return {
       currentSectorId: state.world.currentSectorId,
       discovery: state.world.discovery,
+      scanPings: state.world.scanPings || {},
       pendingSpawns: state.world.pendingSpawns || {},
       sectorOwners: this._ownerOverlay(),
       jump: {
@@ -1016,6 +1068,7 @@ export const world = {
     if (!data) return;
     const state = this.state;
     if (data.discovery) state.world.discovery = data.discovery;
+    state.world.scanPings = (data.scanPings && typeof data.scanPings === 'object') ? data.scanPings : {};
     state.world.pendingSpawns = (data.pendingSpawns && typeof data.pendingSpawns === 'object') ? data.pendingSpawns : {};
     if (data.currentSectorId) state.world.currentSectorId = data.currentSectorId;
     if (data.jump) {
@@ -1040,7 +1093,9 @@ export const world = {
     const state = this.state;
     // reset overlay + jump/fuel to defaults; the home sector is entered by main.js post-boot.
     state.world.discovery = {};
+    state.world.scanPings = {};
     state.world.pendingSpawns = {};
+    this._seedChartedDiscovery();
     state.jump.state = 'IDLE'; state.jump.targetSectorId = null; state.jump.via = null;
     state.jump.chargeT = 0; state.jump.chargeNeeded = 0; state.jump.cooldownT = 0;
     state.fuel = { current: 100, max: 100 };

codex
I’m also checking the dirty diff around the failing tether path. I won’t change it unless it turns out the palette patch somehow touched that behavior, which would be surprising.
diff --git a/package.json b/package.json
index 0897813b9c443f97ae9d2e8ae253e77f386705d9..a869414ec6dbceebe45b9b78abd72013201579da
--- a/package.json
+++ b/package.json
@@ -74,9 +74,10 @@
     "build:sg04:release-assets": "node scripts/build-sg04-release-assets.mjs",
     "build:bundle": "node scripts/build-bundle.mjs",
     "check:bundle": "node scripts/check-bundle.mjs",
-    "check:launch-policy": "node scripts/check-launch-policy.mjs",
-    "check:non-graphics": "node scripts/check-non-graphics-ci.mjs",
-    "check:assets:live": "node scripts/probe-authored-assets-live.mjs",
+    "check:launch-policy": "node scripts/check-launch-policy.mjs",
+    "check:non-graphics": "node scripts/check-non-graphics-ci.mjs",
+    "check:sector-palettes": "node scripts/check-sector-palettes.mjs",
+    "check:assets:live": "node scripts/probe-authored-assets-live.mjs",
     "check:perf:control": "node scripts/probe-raf-control.mjs --headed --strict --width 1830 --height 973 --warmup 1000 --duration 5000",
     "check:perf": "node scripts/probe-performance-profile.mjs --headed --strict --width 1830 --height 973 --warmup 2500 --duration 7000 --diagnostic-variants",
     "check:hitch-budget": "node scripts/check-hitch-budget.mjs",
diff --git a/scripts/check-sector-palettes.mjs b/scripts/check-sector-palettes.mjs
new file mode 100644
index 0000000000000000000000000000000000000000..04318569a6d4a787b3cf451b3de0e457574fa6f1
--- /dev/null
+++ b/scripts/check-sector-palettes.mjs
@@ -0,0 +1,81 @@
+import { SECTORS, SECTOR_PALETTE_CLASSES } from '../src/data/sectors.js';
+
+const REQUIRED_FIELDS = ['key', 'rim', 'fill', 'ambient', 'fog', 'fogDensity', 'nebulaTint', 'dust'];
+const COLOR_FIELDS = ['key', 'rim', 'fill', 'ambient', 'fog', 'nebulaTint', 'dust'];
+const CLASS_ENTRIES = Object.entries(SECTOR_PALETTE_CLASSES);
+const CORE_LUMINANCE = combinedLightLuminance(SECTOR_PALETTE_CLASSES.core);
+const MIN_LUMINANCE = CORE_LUMINANCE * 0.8;
+const MAX_LUMINANCE = CORE_LUMINANCE * 1.2;
+
+const issues = [];
+const usedClasses = new Set();
+
+for (const sector of SECTORS) {
+  const palette = sector.palette;
+  if (!palette || typeof palette !== 'object') {
+    issues.push(`${sector.id}: missing palette block`);
+    continue;
+  }
+
+  for (const field of REQUIRED_FIELDS) {
+    if (!(field in palette)) issues.push(`${sector.id}: palette missing ${field}`);
+  }
+  for (const field of COLOR_FIELDS) {
+    if (!isColorHex(palette[field])) issues.push(`${sector.id}: palette.${field} must be a 0x000000-0xffffff number`);
+  }
+  if (!Number.isFinite(palette.fogDensity) || palette.fogDensity <= 0) {
+    issues.push(`${sector.id}: palette.fogDensity must be a positive finite number`);
+  }
+
+  const className = classNameForPalette(palette);
+  if (!className) issues.push(`${sector.id}: palette does not match an authored class`);
+  else usedClasses.add(className);
+
+  const luminance = combinedLightLuminance(palette);
+  if (luminance < MIN_LUMINANCE || luminance > MAX_LUMINANCE) {
+    issues.push(`${sector.id}: ambient+fill luminance ${luminance.toFixed(4)} outside ${MIN_LUMINANCE.toFixed(4)}-${MAX_LUMINANCE.toFixed(4)}`);
+  }
+}
+
+for (const [className] of CLASS_ENTRIES) {
+  if (!usedClasses.has(className)) issues.push(`palette class unused: ${className}`);
+}
+
+if (issues.length) {
+  console.error(`Sector palette check failed (${issues.length} issue${issues.length === 1 ? '' : 's'}):`);
+  for (const issue of issues) console.error(`- ${issue}`);
+  process.exit(1);
+}
+
+console.log(`Sector palettes OK: ${SECTORS.length} sectors, classes used: ${[...usedClasses].sort().join(', ')}`);
+
+function classNameForPalette(palette) {
+  for (const [className, classPalette] of CLASS_ENTRIES) {
+    if (samePalette(palette, classPalette)) return className;
+  }
+  return null;
+}
+
+function samePalette(a, b) {
+  return REQUIRED_FIELDS.every((field) => a[field] === b[field]);
+}
+
+function isColorHex(value) {
+  return Number.isInteger(value) && value >= 0x000000 && value <= 0xffffff;
+}
+
+function combinedLightLuminance(palette) {
+  return relativeLuminance(palette.ambient) + relativeLuminance(palette.fill);
+}
+
+function relativeLuminance(hex) {
+  const r = linearRgb((hex >> 16) & 0xff);
+  const g = linearRgb((hex >> 8) & 0xff);
+  const b = linearRgb(hex & 0xff);
+  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
+}
+
+function linearRgb(channel) {
+  const c = channel / 255;
+  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
+}
diff --git a/src/data/sectors.js b/src/data/sectors.js
index 9c63f69479b241fc848258e3fe2161547793fa46..1814c409089f818b6ab4758b3f0cf8f8531f2452
--- a/src/data/sectors.js
+++ b/src/data/sectors.js
@@ -10,10 +10,30 @@
 export const HAZARD_TYPES  = ['dense_asteroid', 'nebula', 'radiation', 'debris'];
 export const POI_TYPES     = ['beacon', 'derelict', 'cache', 'colony', 'anomaly', 'wormhole', 'wreck'];
 
+export const SECTOR_PALETTE_CLASSES = {
+  core: {
+    key: 0xcfe2ff, rim: 0x6a5cff, fill: 0x39d0ff, ambient: 0x42506f,
+    fog: 0x0a1430, fogDensity: 0.00026, nebulaTint: 0x1e3a6a, dust: 0x7ea7c7,
+  },
+  belt: {
+    key: 0xffd59a, rim: 0xb56d2f, fill: 0xffb13d, ambient: 0x594a42,
+    fog: 0x2a160c, fogDensity: 0.00034, nebulaTint: 0x8a4a1e, dust: 0xc0793d,
+  },
+  fringe: {
+    key: 0xffb07a, rim: 0xff3f2d, fill: 0xffaa66, ambient: 0x584343,
+    fog: 0x2a0d0a, fogDensity: 0.00042, nebulaTint: 0x8a1e1e, dust: 0xc15032,
+  },
+  anomaly: {
+    key: 0xc8b6ff, rim: 0x54ffb0, fill: 0x4ddc92, ambient: 0x494760,
+    fog: 0x160d2c, fogDensity: 0.00036, nebulaTint: 0x5a1e8a, dust: 0x79ffc8,
+  },
+};
+
 export const SECTORS = [
   {
     id: 'sector_helios_prime', name: 'Helios Prime', tier: 0, security: 0.98, charted: true,
     factionId: 'faction_scn', position: { x: 0, y: 0 }, worldRadius: 3500,
+    palette: SECTOR_PALETTE_CLASSES.core,
     // Tutorial home sector: NO hostile spawns (enemyDensity 0). A brand-new pilot must not be
     // hunted before learning the ropes; danger ramps up only in neighbouring sectors.
     trafficPerMin: 18, enemyDensity: 0, enemyLevel: [1, 2],
@@ -37,6 +57,7 @@
   {
     id: 'sector_ceres_belt', name: 'Ceres Belt', tier: 1, security: 0.72, charted: true,
     factionId: 'faction_dmc', position: { x: -3, y: 2 }, worldRadius: 4200,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 10, enemyDensity: 0.18, enemyLevel: [2, 4],
     neighbors: ['sector_helios_prime', 'sector_tethys_junction', 'sector_pallas_drift'],
     stations: [
@@ -57,6 +78,7 @@
   {
     id: 'sector_tethys_junction', name: 'Tethys Junction', tier: 1, security: 0.65, charted: true,
     factionId: 'faction_mts', position: { x: 3, y: 2 }, worldRadius: 4000,
+    palette: SECTOR_PALETTE_CLASSES.core,
     trafficPerMin: 14, enemyDensity: 0.20, enemyLevel: [2, 4],
     neighbors: ['sector_helios_prime', 'sector_ceres_belt', 'sector_vesta_forge', 'sector_io_reach'],
     stations: [
@@ -72,6 +94,7 @@
   {
     id: 'sector_vesta_forge', name: 'Vesta Forge', tier: 1, security: 0.60, charted: true,
     factionId: 'faction_dmc', position: { x: 0, y: 4 }, worldRadius: 4300,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 9, enemyDensity: 0.25, enemyLevel: [3, 5],
     neighbors: ['sector_helios_prime', 'sector_tethys_junction', 'sector_charon_expanse'],
     stations: [
@@ -89,6 +112,7 @@
   {
     id: 'sector_pallas_drift', name: 'Pallas Drift', tier: 2, security: 0.42, charted: true,
     factionId: 'faction_mts', position: { x: -5, y: 5 }, worldRadius: 4500,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 7, enemyDensity: 0.40, enemyLevel: [4, 7],
     neighbors: ['sector_ceres_belt', 'sector_io_reach', 'sector_sker_haven'],
     stations: [
@@ -109,6 +133,7 @@
   {
     id: 'sector_io_reach', name: 'Io Reach', tier: 2, security: 0.35, charted: true,
     factionId: 'faction_free', position: { x: 5, y: 5 }, worldRadius: 4600,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 5, enemyDensity: 0.50, enemyLevel: [5, 8],
     neighbors: ['sector_tethys_junction', 'sector_pallas_drift', 'sector_charon_expanse', 'sector_veil_nebula'],
     stations: [
@@ -132,6 +157,7 @@
   {
     id: 'sector_charon_expanse', name: 'Charon Expanse', tier: 2, security: 0.30, charted: true,
     factionId: 'faction_dmc', position: { x: 2, y: 7 }, worldRadius: 4800,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 4, enemyDensity: 0.50, enemyLevel: [5, 9],
     neighbors: ['sector_vesta_forge', 'sector_io_reach', 'sector_ashfall_reach'],
     stations: [
@@ -151,6 +177,7 @@
   {
     id: 'sector_sker_haven', name: 'Sker Haven', tier: 3, security: 0.08, charted: false,
     factionId: 'faction_reach', position: { x: -7, y: 8 }, worldRadius: 5000,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 0, enemyDensity: 0.70, enemyLevel: [7, 11],
     neighbors: ['sector_pallas_drift', 'sector_veil_nebula'],
     stations: [
@@ -169,6 +196,7 @@
   {
     id: 'sector_veil_nebula', name: 'Veil Nebula', tier: 3, security: 0.12, charted: false,
     factionId: 'faction_free', position: { x: 7, y: 9 }, worldRadius: 5200,
+    palette: SECTOR_PALETTE_CLASSES.anomaly,
     trafficPerMin: 0, enemyDensity: 0.65, enemyLevel: [8, 12],
     neighbors: ['sector_io_reach', 'sector_sker_haven'],
     wormholeTo: { sectorId: 'sector_ashfall_reach', gatedBy: 'tech:tech_long_range_survey' },
@@ -188,6 +216,7 @@
   {
     id: 'sector_ashfall_reach', name: 'Ashfall Reach', tier: 4, security: 0.05, charted: false,
     factionId: 'faction_vael', position: { x: 4, y: 11 }, worldRadius: 5500,
+    palette: SECTOR_PALETTE_CLASSES.anomaly,
     trafficPerMin: 0, enemyDensity: 0.80, enemyLevel: [10, 15],
     neighbors: ['sector_charon_expanse'],
     stations: [
diff --git a/src/render/renderer.js b/src/render/renderer.js
index def6420ff1bff2ac1c64dcc1add395e7851c4dbc..7b83534145db2cec91608a3a2a42dfe1ec083a9d
--- a/src/render/renderer.js
+++ b/src/render/renderer.js
@@ -15,21 +15,10 @@
 import { installDiagnostics } from './diagnostics.js';
 import { createPlanetFactory } from './planetFactory.js';
 import { precompilePipelines } from './precompile.js';
-
-// Map a sector's danger/tier to a nebula backdrop tint so each region of the galaxy has its own
-// color signature. Core (safe, low tier) = clean blue; industrial mid-ring = rust/amber; lawless
-// frontier = blood-red; alien/endgame tier 4+ = violet. Returns a hex string or null (default).
-function sectorNebulaTint(sector) {
-  if (!sector) return null;
-  const tier = sector.tier || 0;
-  const sec = sector.security != null ? sector.security : 1;
-  const danger = (1 - sec) + tier * 0.15; // blended danger metric
-  if (tier >= 4) return '#5a1e8a';        // violet — alien / lawless endgame (Veil, Ashfall)
-  if (danger > 0.7) return '#8a1e1e';     // blood-red — dangerous frontier (Io Reach, Sker)
-  if (danger > 0.45) return '#8a4a1e';    // rust/amber — industrial mid-ring (Vesta, Pallas)
-  if (danger > 0.2) return '#1e4a8a';     // deep blue — settled belt (Ceres, Tethys)
-  return '#1e3a6a';                        // clean blue — safe core (Helios Prime)
-}
+import { SECTOR_PALETTE_CLASSES } from '../data/sectors.js';
+
+const SECTOR_PALETTE_LERP_SECONDS = 1.5;
+const SECTOR_LIGHT_INTENSITIES = { ambient: 0.85, key: 1.7, rim: 0.7, fill: 0.35 };
 
 // ---- contact shadow disc (module-level cache so one texture serves all entities) ----------------
 let _shadowTex = null;
@@ -178,14 +167,15 @@
     renderer.setClearColor(0x060912, 1);
     const drawSize = applyRendererSize(renderer, state);
 
-    const scene = new THREE.Scene();
-    // Thin fog for gentle depth cueing only — the old 0.00085 erased the entire backdrop, leaving a
-    // black void. This keeps the nebula + far stars visible while still fading the deep distance.
-    scene.fog = new THREE.FogExp2(0x0a1430, 0.00026);
-    scene.add(new THREE.AmbientLight(0x42506f, 0.85));
-    const key = new THREE.DirectionalLight(0xcfe2ff, 1.7); key.position.set(60, 140, 40); scene.add(key);
-    const rim = new THREE.DirectionalLight(0x6a5cff, 0.7); rim.position.set(-70, 50, -60); scene.add(rim);
-    const fill = new THREE.DirectionalLight(0x39d0ff, 0.35); fill.position.set(20, 30, 120); scene.add(fill);
+    const scene = new THREE.Scene();
+    const corePalette = SECTOR_PALETTE_CLASSES.core;
+    // Thin fog for gentle depth cueing only — the old 0.00085 erased the entire backdrop, leaving a
+    // black void. This keeps the nebula + far stars visible while still fading the deep distance.
+    scene.fog = new THREE.FogExp2(corePalette.fog, corePalette.fogDensity);
+    const ambient = new THREE.AmbientLight(corePalette.ambient, SECTOR_LIGHT_INTENSITIES.ambient); scene.add(ambient);
+    const key = new THREE.DirectionalLight(corePalette.key, SECTOR_LIGHT_INTENSITIES.key); key.position.set(60, 140, 40); scene.add(key);
+    const rim = new THREE.DirectionalLight(corePalette.rim, SECTOR_LIGHT_INTENSITIES.rim); rim.position.set(-70, 50, -60); scene.add(rim);
+    const fill = new THREE.DirectionalLight(corePalette.fill, SECTOR_LIGHT_INTENSITIES.fill); fill.position.set(20, 30, 120); scene.add(fill);
 
     // Real shadow maps (graphics spec Workstream G). Gated behind settings.video.shadows (default
     // true). The key light becomes a shadow caster with a tight frustum that follows the player so
@@ -210,7 +200,7 @@
     }
 
     const cam = createChaseCamera(state);
-    const starfield = createStarfield(scene);
+    const starfield = createStarfield(scene, { tint: corePalette.nebulaTint });
     const vf = createVisualFactory();
     // Hero-asset registry (spec §17.3): wraps the factory's build() so the bespoke player Kestrel is
     // intercepted before the procedural visualFactory. Narrow + failure-isolated — any throw falls
@@ -283,13 +273,16 @@
     // contact-sheet references and are replaced by procedural materials / inline SVG).
     { const i = new Image(); i.src = 'assets/cinematics/menu_background.jpg'; }
 
-    this.renderer = renderer; this.scene = scene; this.cam = cam; this.starfield = starfield; this.vf = vf;
-    this.authoredPartLibraryReady = preloadAuthoredPartLibrary(renderer).catch((error) => {
-      console.warn('[render] authored part library preload failed', error);
-      return null;
-    });
-    state.render.authoredPartLibraryReady = this.authoredPartLibraryReady;
-    this._keyLight = shadowsOn ? key : null; // referenced by _updateShadowFollow() each frame
+    this.renderer = renderer; this.scene = scene; this.cam = cam; this.starfield = starfield; this.vf = vf;
+    this.authoredPartLibraryReady = preloadAuthoredPartLibrary(renderer).catch((error) => {
+      console.warn('[render] authored part library preload failed', error);
+      return null;
+    });
+    state.render.authoredPartLibraryReady = this.authoredPartLibraryReady;
+    this._sectorPaletteRig = createSectorPaletteRig(scene, ambient, key, rim, fill);
+    this._sectorPaletteTarget = corePalette;
+    state.render.sectorPalette = corePalette;
+    this._keyLight = shadowsOn ? key : null; // referenced by _updateShadowFollow() each frame
     this._shadowSettingOn = shadowsOn;
     this._shadowReceiversDirty = true;
     this._shadowReceiverCount = 0;
@@ -410,20 +403,19 @@
     // already spawned by the time this fires (enterSector spawns before its sector:enter resolves),
     // so a blind clearAllMeshes(keepPlayer) used to wipe the station/asteroids and leave the player
     // alone in empty space. reconcileMeshes() removes only meshes for entities that are gone.
-    bus.on('sector:enter', ({ sector } = {}) => {
-      this._meshReconcileDirty = true;
-      if (cam.snapToPlayer) cam.snapToPlayer();
-      this._updatePlanetBodies(sector);
-      // Tint the nebula backdrop to the sector's mood so each region of the galaxy reads with its
-      // own color signature: clean-blue core → rust/amber industrial → blood-red frontier → violet
-      // alien/endgame. Drives the whole-frame atmosphere, reinforcing the core-to-frontier gradient.
-      if (this.starfield && this.starfield.setSectorTint) {
-        this.starfield.setSectorTint(sectorNebulaTint(sector));
-      }
+    bus.on('sector:enter', ({ sector } = {}) => {
+      this._meshReconcileDirty = true;
+      if (cam.snapToPlayer) cam.snapToPlayer();
+      this._updatePlanetBodies(sector);
+      this._beginSectorPaletteTransition(sector);
       this._updateHazardVisuals(sector);
       precompilePipelines(renderer, scene, cam.obj, { sector }).catch((error) => console.warn('[render] sector pipeline precompile failed', error));
     });
-    bus.on('save:loaded', () => { this._meshReconcileDirty = true; });
+    bus.on('jump:arrive', ({ sectorId } = {}) => {
+      const sector = sectorId && state.world && state.world.sectors ? state.world.sectors[sectorId] : null;
+      this._beginSectorPaletteTransition(sector);
+    });
+    bus.on('save:loaded', () => { this._meshReconcileDirty = true; });
 
     window.addEventListener('resize', () => this.onResize());
   },
@@ -640,7 +632,7 @@
     return tex;
   },
 
-  _updateHazardVisuals(sector) {
+  _updateHazardVisuals(sector) {
     // Dispose previous hazard visuals
     for (const obj of this._hazardVisuals) {
       this.scene.remove(obj);
@@ -701,10 +693,42 @@
         this.scene.add(ring);
         this._hazardVisuals.push(ring);
       }
-    }
-  },
-
-  prepareFrame(alpha, frameDt) {
+    }
+  },
+
+  _beginSectorPaletteTransition(sector) {
+    const rig = this._sectorPaletteRig;
+    if (!rig) return;
+    const palette = sector && sector.palette ? sector.palette : SECTOR_PALETTE_CLASSES.core;
+    this.state.render.sectorPalette = palette;
+    if (palette === this._sectorPaletteTarget) return;
+
+    this._sectorPaletteTarget = palette;
+    writeRigToSectorPaletteFrame(rig.start, rig);
+    writePaletteToSectorPaletteFrame(rig.target, palette);
+    rig.elapsed = 0;
+    rig.active = true;
+
+    if (this.starfield && this.starfield.setSectorTint) {
+      this.starfield.setSectorTint(palette.nebulaTint);
+    }
+  },
+
+  _updateSectorPaletteTransition(frameDt) {
+    const rig = this._sectorPaletteRig;
+    if (!rig || !rig.active) return;
+    const dt = Number.isFinite(frameDt) ? Math.max(0, frameDt) : 0;
+    rig.elapsed = Math.min(SECTOR_PALETTE_LERP_SECONDS, rig.elapsed + dt);
+    const rawT = SECTOR_PALETTE_LERP_SECONDS > 0 ? rig.elapsed / SECTOR_PALETTE_LERP_SECONDS : 1;
+    const t = rawT * rawT * (3 - 2 * rawT);
+    lerpSectorPaletteFrame(rig, rig.start, rig.target, t);
+    if (rawT >= 1) {
+      rig.active = false;
+      applySectorPaletteFrame(rig, rig.target);
+    }
+  },
+
+  prepareFrame(alpha, frameDt) {
     // While the GL context is lost, the renderer can't draw — skip all per-frame work until
     // webglcontextrestored rebuilds GPU resources. (cam.follow etc. would run against a dead
     // renderer; the context-restore handler re-applies everything that matters when it returns.)
@@ -716,9 +740,10 @@
     syncAuthoredInstancePools(this.scene, { camera: this.cam.obj });
     this.starfield.recenter(this.cam.obj.position);
     // Background-clock for distant animation (planet cloud drift, hero-star twinkle). Integrates real
-    // frame dt scaled by state.timeScale so the cosmos respects hit-stop/pause — a death freeze
-    // momentarily stills the clouds too, keeping the backdrop in the same time model as the action.
-    const ts = (this.state.timeScale != null) ? this.state.timeScale : 1;
+    // frame dt scaled by state.timeScale so the cosmos respects hit-stop/pause — a death freeze
+    // momentarily stills the clouds too, keeping the backdrop in the same time model as the action.
+    this._updateSectorPaletteTransition(frameDt);
+    const ts = (this.state.timeScale != null) ? this.state.timeScale : 1;
     this._bgTime = (this._bgTime || 0) + frameDt * ts;
     if (this.starfield.update) this.starfield.update(frameDt, this._bgTime);
     this._updatePlanetParallax();
@@ -899,13 +924,97 @@
   return renderer.getDrawingBufferSize(_drawSize);
 }
 
-function finiteInRange(value, min, max, fallback) {
-  const n = Number(value);
-  if (!Number.isFinite(n)) return fallback;
-  return Math.max(min, Math.min(max, n));
-}
-
-function disposeObject(obj) {
+function finiteInRange(value, min, max, fallback) {
+  const n = Number(value);
+  if (!Number.isFinite(n)) return fallback;
+  return Math.max(min, Math.min(max, n));
+}
+
+function createSectorPaletteRig(scene, ambientLight, keyLight, rimLight, fillLight) {
+  const rig = {
+    scene,
+    lights: { ambient: ambientLight, key: keyLight, rim: rimLight, fill: fillLight },
+    start: createSectorPaletteFrame(),
+    target: createSectorPaletteFrame(),
+    elapsed: 0,
+    active: false,
+  };
+  writeRigToSectorPaletteFrame(rig.start, rig);
+  writeRigToSectorPaletteFrame(rig.target, rig);
+  return rig;
+}
+
+function createSectorPaletteFrame() {
+  return {
+    colors: {
+      ambient: new THREE.Color(),
+      key: new THREE.Color(),
+      rim: new THREE.Color(),
+      fill: new THREE.Color(),
+      fog: new THREE.Color(),
+    },
+    intensities: { ambient: 0, key: 0, rim: 0, fill: 0 },
+    fogDensity: 0,
+  };
+}
+
+function writeRigToSectorPaletteFrame(frame, rig) {
+  frame.colors.ambient.copy(rig.lights.ambient.color);
+  frame.colors.key.copy(rig.lights.key.color);
+  frame.colors.rim.copy(rig.lights.rim.color);
+  frame.colors.fill.copy(rig.lights.fill.color);
+  frame.colors.fog.copy(rig.scene.fog.color);
+  frame.intensities.ambient = rig.lights.ambient.intensity;
+  frame.intensities.key = rig.lights.key.intensity;
+  frame.intensities.rim = rig.lights.rim.intensity;
+  frame.intensities.fill = rig.lights.fill.intensity;
+  frame.fogDensity = rig.scene.fog.density;
+}
+
+function writePaletteToSectorPaletteFrame(frame, palette) {
+  frame.colors.ambient.setHex(palette.ambient);
+  frame.colors.key.setHex(palette.key);
+  frame.colors.rim.setHex(palette.rim);
+  frame.colors.fill.setHex(palette.fill);
+  frame.colors.fog.setHex(palette.fog);
+  frame.intensities.ambient = SECTOR_LIGHT_INTENSITIES.ambient;
+  frame.intensities.key = SECTOR_LIGHT_INTENSITIES.key;
+  frame.intensities.rim = SECTOR_LIGHT_INTENSITIES.rim;
+  frame.intensities.fill = SECTOR_LIGHT_INTENSITIES.fill;
+  frame.fogDensity = palette.fogDensity;
+}
+
+function applySectorPaletteFrame(rig, frame) {
+  rig.lights.ambient.color.copy(frame.colors.ambient);
+  rig.lights.key.color.copy(frame.colors.key);
+  rig.lights.rim.color.copy(frame.colors.rim);
+  rig.lights.fill.color.copy(frame.colors.fill);
+  rig.scene.fog.color.copy(frame.colors.fog);
+  rig.lights.ambient.intensity = frame.intensities.ambient;
+  rig.lights.key.intensity = frame.intensities.key;
+  rig.lights.rim.intensity = frame.intensities.rim;
+  rig.lights.fill.intensity = frame.intensities.fill;
+  rig.scene.fog.density = frame.fogDensity;
+}
+
+function lerpSectorPaletteFrame(rig, start, target, t) {
+  rig.lights.ambient.color.lerpColors(start.colors.ambient, target.colors.ambient, t);
+  rig.lights.key.color.lerpColors(start.colors.key, target.colors.key, t);
+  rig.lights.rim.color.lerpColors(start.colors.rim, target.colors.rim, t);
+  rig.lights.fill.color.lerpColors(start.colors.fill, target.colors.fill, t);
+  rig.scene.fog.color.lerpColors(start.colors.fog, target.colors.fog, t);
+  rig.lights.ambient.intensity = lerp(start.intensities.ambient, target.intensities.ambient, t);
+  rig.lights.key.intensity = lerp(start.intensities.key, target.intensities.key, t);
+  rig.lights.rim.intensity = lerp(start.intensities.rim, target.intensities.rim, t);
+  rig.lights.fill.intensity = lerp(start.intensities.fill, target.intensities.fill, t);
+  rig.scene.fog.density = lerp(start.fogDensity, target.fogDensity, t);
+}
+
+function lerp(a, b, t) {
+  return a + (b - a) * t;
+}
+
+function disposeObject(obj) {
   obj.traverse((c) => {
     if (c.isBatchedMesh && typeof c.dispose === 'function') c.dispose();
     else if (c.geometry && !(c.userData && (c.userData.sharedContactShadow || c.userData.sharedShieldGeo))) c.geometry.dispose();
diff --git a/src/render/starfield.js b/src/render/starfield.js
index d76965c563ac0d99166bb382577d2f6eaa4a6d0f..aecb37608592e6ff981ddaf8fd6107d17a0632e6
--- a/src/render/starfield.js
+++ b/src/render/starfield.js
@@ -116,10 +116,18 @@
   return c;
 }
 
-// --- small color helpers for sector tinting (no deps) ---
-function hexToRgb(hex) {
-  const h = hex.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
-}
+// --- small color helpers for sector tinting (no deps) ---
+function normalizeTint(tint) {
+  if (tint == null) return null;
+  if (typeof tint === 'number' && Number.isFinite(tint)) {
+    return '#' + ((tint >>> 0) & 0xffffff).toString(16).padStart(6, '0');
+  }
+  if (typeof tint === 'string') return tint.startsWith('#') ? tint : '#' + tint.replace(/^0x/i, '');
+  return null;
+}
+function hexToRgb(hex) {
+  const h = hex.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
+}
 function rgbToHex(r, g, b) {
   const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
   return '#' + c(r) + c(g) + c(b);
@@ -176,11 +184,11 @@
   ctx.restore();
 }
 
-export function createStarfield(scene, opts = {}) {
-  const layers = [];
-  const sprite = makeStarSprite();
-  let bgTexture = null;
-  let currentTint = opts.tint || null;
+export function createStarfield(scene, opts = {}) {
+  const layers = [];
+  const sprite = makeStarSprite();
+  let bgTexture = null;
+  let currentTint = normalizeTint(opts.tint);
 
   // star tints (mostly cool white/blue with a few warm + teal accents)
   const TINTS = [0xffffff, 0xcfe0ff, 0x9fb6e0, 0xfff0d8, 0x8af0d6, 0xbfd2ff];
@@ -297,13 +305,14 @@
       // GR-7: slow-rotate the distant 3D planets so they read as real spinning worlds, not billboards.
       for (const p of distantPlanets) p.mesh.rotation.y += dt * p.spin;
     },
-    // Swap the nebula mood on sector enter — each region of the galaxy reads with its own color
-    // signature (core = clean blue, industrial = rust/amber, frontier = blood-red, alien = violet).
-    setSectorTint(tint) {
-      if (tint === currentTint) return;
-      currentTint = tint || null;
-      applyBackground(currentTint);
-    },
+    // Swap the nebula mood on sector enter — each region of the galaxy reads with its own color
+    // signature (core = clean blue, industrial = rust/amber, frontier = blood-red, alien = violet).
+    setSectorTint(tint) {
+      const nextTint = normalizeTint(tint);
+      if (nextTint === currentTint) return;
+      currentTint = nextTint;
+      applyBackground(currentTint);
+    },
     setWarp() { /* extended by vfx during jump */ },
   };
 }

codex
The SG-02 failure is repeatable on the standalone tether-break check and the nearby dirty diff is in unrelated world/save/discovery work, not this palette patch. I’m doing one last scoped whitespace/targeted validation pass on the files I changed.
exec
"C:\\Users\\93rob\\AppData\\Local\\Microsoft\\WindowsApps\\pwsh.exe" -Command 'npm run check:sector-palettes' in C:\Users\93rob\Documents\GitHub\SpaceFace
exec
"C:\\Users\\93rob\\AppData\\Local\\Microsoft\\WindowsApps\\pwsh.exe" -Command "node scripts\\check-data.mjs" in C:\Users\93rob\Documents\GitHub\SpaceFace
exec
"C:\\Users\\93rob\\AppData\\Local\\Microsoft\\WindowsApps\\pwsh.exe" -Command "git diff --check -- src\\data\\sectors.js src\\render\\renderer.js src\\render\\starfield.js scripts\\check-sector-palettes.mjs package.json" in C:\Users\93rob\Documents\GitHub\SpaceFace
 succeeded in 1820ms:
ok   ../src/data/saveVersion.js — CURRENT_VERSION:number
ok   ../src/data/ships.js — SHIPS:13
ok   ../src/data/weapons.js — WEAPONS:13
ok   ../src/data/modules.js — MODULES:25
ok   ../src/data/tech.js — TECH_NODES:28
ok   ../src/data/commodities.js — COMMODITIES:34
ok   ../src/data/mining.js — ORES:18  ASTEROIDS:6  BEAMS:4  RECIPES:4  FIELDS:4
ok   ../src/data/sectors.js — SECTORS:10  STATION_TYPES:7  HAZARD_TYPES:4  POI_TYPES:7  dangerTier:function
ok   ../src/data/factions.js — FACTION_META:8
ok   ../src/data/missions.js — MISSION_TYPES:10  STORY_BEATS:8  OFFER_MIX:7  MISSION_TUNING:12
ok   ../src/data/automation.js — DRONES:4  TRADERS:3  OUTPOSTS:3  AUTO_BALANCE:7
ok   ../src/data/enemies.js — ENEMY_TYPES:8
ok   ../src/data/audioRecipes.js — RECIPES:28  MUSIC_STEMS:4
ok   ../src/data/palettes.js — FACTION_PALETTES:8  SECTOR_PALETTES:10  SHIP_RECIPES:13
ok   ../src/data/newGameDefaults.js — NEW_GAME:15
ok   ../src/data/combatDefs.js — ACTION_DEFS:6  STATUS_DEFS:4  SUBSYSTEM_DEFS:5  ATTACHMENT_DEFS:2  COMBAT_PROFILES:4

16 ok, 0 fail

 succeeded in 4187ms:

> spaceface@0.1.0 check:sector-palettes
> node scripts/check-sector-palettes.mjs

Sector palettes OK: 10 sectors, classes used: anomaly, belt, core, fringe

exec
"C:\\Users\\93rob\\AppData\\Local\\Microsoft\\WindowsApps\\pwsh.exe" -Command "git status --short -- src\\data\\sectors.js src\\render\\renderer.js src\\render\\starfield.js scripts\\check-sector-palettes.mjs package.json" in C:\Users\93rob\Documents\GitHub\SpaceFace
 succeeded in 1561ms:
warning: in the working copy of 'package.json', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'src/data/sectors.js', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'src/render/renderer.js', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'src/render/starfield.js', LF will be replaced by CRLF the next time Git touches it

diff --git a/package.json b/package.json
index 0897813b9c443f97ae9d2e8ae253e77f386705d9..a869414ec6dbceebe45b9b78abd72013201579da
--- a/package.json
+++ b/package.json
@@ -74,9 +74,10 @@
     "build:sg04:release-assets": "node scripts/build-sg04-release-assets.mjs",
     "build:bundle": "node scripts/build-bundle.mjs",
     "check:bundle": "node scripts/check-bundle.mjs",
-    "check:launch-policy": "node scripts/check-launch-policy.mjs",
-    "check:non-graphics": "node scripts/check-non-graphics-ci.mjs",
-    "check:assets:live": "node scripts/probe-authored-assets-live.mjs",
+    "check:launch-policy": "node scripts/check-launch-policy.mjs",
+    "check:non-graphics": "node scripts/check-non-graphics-ci.mjs",
+    "check:sector-palettes": "node scripts/check-sector-palettes.mjs",
+    "check:assets:live": "node scripts/probe-authored-assets-live.mjs",
     "check:perf:control": "node scripts/probe-raf-control.mjs --headed --strict --width 1830 --height 973 --warmup 1000 --duration 5000",
     "check:perf": "node scripts/probe-performance-profile.mjs --headed --strict --width 1830 --height 973 --warmup 2500 --duration 7000 --diagnostic-variants",
     "check:hitch-budget": "node scripts/check-hitch-budget.mjs",
diff --git a/scripts/check-sector-palettes.mjs b/scripts/check-sector-palettes.mjs
new file mode 100644
index 0000000000000000000000000000000000000000..04318569a6d4a787b3cf451b3de0e457574fa6f1
--- /dev/null
+++ b/scripts/check-sector-palettes.mjs
@@ -0,0 +1,81 @@
+import { SECTORS, SECTOR_PALETTE_CLASSES } from '../src/data/sectors.js';
+
+const REQUIRED_FIELDS = ['key', 'rim', 'fill', 'ambient', 'fog', 'fogDensity', 'nebulaTint', 'dust'];
+const COLOR_FIELDS = ['key', 'rim', 'fill', 'ambient', 'fog', 'nebulaTint', 'dust'];
+const CLASS_ENTRIES = Object.entries(SECTOR_PALETTE_CLASSES);
+const CORE_LUMINANCE = combinedLightLuminance(SECTOR_PALETTE_CLASSES.core);
+const MIN_LUMINANCE = CORE_LUMINANCE * 0.8;
+const MAX_LUMINANCE = CORE_LUMINANCE * 1.2;
+
+const issues = [];
+const usedClasses = new Set();
+
+for (const sector of SECTORS) {
+  const palette = sector.palette;
+  if (!palette || typeof palette !== 'object') {
+    issues.push(`${sector.id}: missing palette block`);
+    continue;
+  }
+
+  for (const field of REQUIRED_FIELDS) {
+    if (!(field in palette)) issues.push(`${sector.id}: palette missing ${field}`);
+  }
+  for (const field of COLOR_FIELDS) {
+    if (!isColorHex(palette[field])) issues.push(`${sector.id}: palette.${field} must be a 0x000000-0xffffff number`);
+  }
+  if (!Number.isFinite(palette.fogDensity) || palette.fogDensity <= 0) {
+    issues.push(`${sector.id}: palette.fogDensity must be a positive finite number`);
+  }
+
+  const className = classNameForPalette(palette);
+  if (!className) issues.push(`${sector.id}: palette does not match an authored class`);
+  else usedClasses.add(className);
+
+  const luminance = combinedLightLuminance(palette);
+  if (luminance < MIN_LUMINANCE || luminance > MAX_LUMINANCE) {
+    issues.push(`${sector.id}: ambient+fill luminance ${luminance.toFixed(4)} outside ${MIN_LUMINANCE.toFixed(4)}-${MAX_LUMINANCE.toFixed(4)}`);
+  }
+}
+
+for (const [className] of CLASS_ENTRIES) {
+  if (!usedClasses.has(className)) issues.push(`palette class unused: ${className}`);
+}
+
+if (issues.length) {
+  console.error(`Sector palette check failed (${issues.length} issue${issues.length === 1 ? '' : 's'}):`);
+  for (const issue of issues) console.error(`- ${issue}`);
+  process.exit(1);
+}
+
+console.log(`Sector palettes OK: ${SECTORS.length} sectors, classes used: ${[...usedClasses].sort().join(', ')}`);
+
+function classNameForPalette(palette) {
+  for (const [className, classPalette] of CLASS_ENTRIES) {
+    if (samePalette(palette, classPalette)) return className;
+  }
+  return null;
+}
+
+function samePalette(a, b) {
+  return REQUIRED_FIELDS.every((field) => a[field] === b[field]);
+}
+
+function isColorHex(value) {
+  return Number.isInteger(value) && value >= 0x000000 && value <= 0xffffff;
+}
+
+function combinedLightLuminance(palette) {
+  return relativeLuminance(palette.ambient) + relativeLuminance(palette.fill);
+}
+
+function relativeLuminance(hex) {
+  const r = linearRgb((hex >> 16) & 0xff);
+  const g = linearRgb((hex >> 8) & 0xff);
+  const b = linearRgb(hex & 0xff);
+  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
+}
+
+function linearRgb(channel) {
+  const c = channel / 255;
+  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
+}
diff --git a/src/data/sectors.js b/src/data/sectors.js
index 9c63f69479b241fc848258e3fe2161547793fa46..1814c409089f818b6ab4758b3f0cf8f8531f2452
--- a/src/data/sectors.js
+++ b/src/data/sectors.js
@@ -10,10 +10,30 @@
 export const HAZARD_TYPES  = ['dense_asteroid', 'nebula', 'radiation', 'debris'];
 export const POI_TYPES     = ['beacon', 'derelict', 'cache', 'colony', 'anomaly', 'wormhole', 'wreck'];
 
+export const SECTOR_PALETTE_CLASSES = {
+  core: {
+    key: 0xcfe2ff, rim: 0x6a5cff, fill: 0x39d0ff, ambient: 0x42506f,
+    fog: 0x0a1430, fogDensity: 0.00026, nebulaTint: 0x1e3a6a, dust: 0x7ea7c7,
+  },
+  belt: {
+    key: 0xffd59a, rim: 0xb56d2f, fill: 0xffb13d, ambient: 0x594a42,
+    fog: 0x2a160c, fogDensity: 0.00034, nebulaTint: 0x8a4a1e, dust: 0xc0793d,
+  },
+  fringe: {
+    key: 0xffb07a, rim: 0xff3f2d, fill: 0xffaa66, ambient: 0x584343,
+    fog: 0x2a0d0a, fogDensity: 0.00042, nebulaTint: 0x8a1e1e, dust: 0xc15032,
+  },
+  anomaly: {
+    key: 0xc8b6ff, rim: 0x54ffb0, fill: 0x4ddc92, ambient: 0x494760,
+    fog: 0x160d2c, fogDensity: 0.00036, nebulaTint: 0x5a1e8a, dust: 0x79ffc8,
+  },
+};
+
 export const SECTORS = [
   {
     id: 'sector_helios_prime', name: 'Helios Prime', tier: 0, security: 0.98, charted: true,
     factionId: 'faction_scn', position: { x: 0, y: 0 }, worldRadius: 3500,
+    palette: SECTOR_PALETTE_CLASSES.core,
     // Tutorial home sector: NO hostile spawns (enemyDensity 0). A brand-new pilot must not be
     // hunted before learning the ropes; danger ramps up only in neighbouring sectors.
     trafficPerMin: 18, enemyDensity: 0, enemyLevel: [1, 2],
@@ -37,6 +57,7 @@
   {
     id: 'sector_ceres_belt', name: 'Ceres Belt', tier: 1, security: 0.72, charted: true,
     factionId: 'faction_dmc', position: { x: -3, y: 2 }, worldRadius: 4200,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 10, enemyDensity: 0.18, enemyLevel: [2, 4],
     neighbors: ['sector_helios_prime', 'sector_tethys_junction', 'sector_pallas_drift'],
     stations: [
@@ -57,6 +78,7 @@
   {
     id: 'sector_tethys_junction', name: 'Tethys Junction', tier: 1, security: 0.65, charted: true,
     factionId: 'faction_mts', position: { x: 3, y: 2 }, worldRadius: 4000,
+    palette: SECTOR_PALETTE_CLASSES.core,
     trafficPerMin: 14, enemyDensity: 0.20, enemyLevel: [2, 4],
     neighbors: ['sector_helios_prime', 'sector_ceres_belt', 'sector_vesta_forge', 'sector_io_reach'],
     stations: [
@@ -72,6 +94,7 @@
   {
     id: 'sector_vesta_forge', name: 'Vesta Forge', tier: 1, security: 0.60, charted: true,
     factionId: 'faction_dmc', position: { x: 0, y: 4 }, worldRadius: 4300,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 9, enemyDensity: 0.25, enemyLevel: [3, 5],
     neighbors: ['sector_helios_prime', 'sector_tethys_junction', 'sector_charon_expanse'],
     stations: [
@@ -89,6 +112,7 @@
   {
     id: 'sector_pallas_drift', name: 'Pallas Drift', tier: 2, security: 0.42, charted: true,
     factionId: 'faction_mts', position: { x: -5, y: 5 }, worldRadius: 4500,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 7, enemyDensity: 0.40, enemyLevel: [4, 7],
     neighbors: ['sector_ceres_belt', 'sector_io_reach', 'sector_sker_haven'],
     stations: [
@@ -109,6 +133,7 @@
   {
     id: 'sector_io_reach', name: 'Io Reach', tier: 2, security: 0.35, charted: true,
     factionId: 'faction_free', position: { x: 5, y: 5 }, worldRadius: 4600,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 5, enemyDensity: 0.50, enemyLevel: [5, 8],
     neighbors: ['sector_tethys_junction', 'sector_pallas_drift', 'sector_charon_expanse', 'sector_veil_nebula'],
     stations: [
@@ -132,6 +157,7 @@
   {
     id: 'sector_charon_expanse', name: 'Charon Expanse', tier: 2, security: 0.30, charted: true,
     factionId: 'faction_dmc', position: { x: 2, y: 7 }, worldRadius: 4800,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 4, enemyDensity: 0.50, enemyLevel: [5, 9],
     neighbors: ['sector_vesta_forge', 'sector_io_reach', 'sector_ashfall_reach'],
     stations: [
@@ -151,6 +177,7 @@
   {
     id: 'sector_sker_haven', name: 'Sker Haven', tier: 3, security: 0.08, charted: false,
     factionId: 'faction_reach', position: { x: -7, y: 8 }, worldRadius: 5000,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 0, enemyDensity: 0.70, enemyLevel: [7, 11],
     neighbors: ['sector_pallas_drift', 'sector_veil_nebula'],
     stations: [
@@ -169,6 +196,7 @@
   {
     id: 'sector_veil_nebula', name: 'Veil Nebula', tier: 3, security: 0.12, charted: false,
     factionId: 'faction_free', position: { x: 7, y: 9 }, worldRadius: 5200,
+    palette: SECTOR_PALETTE_CLASSES.anomaly,
     trafficPerMin: 0, enemyDensity: 0.65, enemyLevel: [8, 12],
     neighbors: ['sector_io_reach', 'sector_sker_haven'],
     wormholeTo: { sectorId: 'sector_ashfall_reach', gatedBy: 'tech:tech_long_range_survey' },
@@ -188,6 +216,7 @@
   {
     id: 'sector_ashfall_reach', name: 'Ashfall Reach', tier: 4, security: 0.05, charted: false,
     factionId: 'faction_vael', position: { x: 4, y: 11 }, worldRadius: 5500,
+    palette: SECTOR_PALETTE_CLASSES.anomaly,
     trafficPerMin: 0, enemyDensity: 0.80, enemyLevel: [10, 15],
     neighbors: ['sector_charon_expanse'],
     stations: [
diff --git a/src/render/renderer.js b/src/render/renderer.js
index def6420ff1bff2ac1c64dcc1add395e7851c4dbc..7b83534145db2cec91608a3a2a42dfe1ec083a9d
--- a/src/render/renderer.js
+++ b/src/render/renderer.js
@@ -15,21 +15,10 @@
 import { installDiagnostics } from './diagnostics.js';
 import { createPlanetFactory } from './planetFactory.js';
 import { precompilePipelines } from './precompile.js';
-
-// Map a sector's danger/tier to a nebula backdrop tint so each region of the galaxy has its own
-// color signature. Core (safe, low tier) = clean blue; industrial mid-ring = rust/amber; lawless
-// frontier = blood-red; alien/endgame tier 4+ = violet. Returns a hex string or null (default).
-function sectorNebulaTint(sector) {
-  if (!sector) return null;
-  const tier = sector.tier || 0;
-  const sec = sector.security != null ? sector.security : 1;
-  const danger = (1 - sec) + tier * 0.15; // blended danger metric
-  if (tier >= 4) return '#5a1e8a';        // violet — alien / lawless endgame (Veil, Ashfall)
-  if (danger > 0.7) return '#8a1e1e';     // blood-red — dangerous frontier (Io Reach, Sker)
-  if (danger > 0.45) return '#8a4a1e';    // rust/amber — industrial mid-ring (Vesta, Pallas)
-  if (danger > 0.2) return '#1e4a8a';     // deep blue — settled belt (Ceres, Tethys)
-  return '#1e3a6a';                        // clean blue — safe core (Helios Prime)
-}
+import { SECTOR_PALETTE_CLASSES } from '../data/sectors.js';
+
+const SECTOR_PALETTE_LERP_SECONDS = 1.5;
+const SECTOR_LIGHT_INTENSITIES = { ambient: 0.85, key: 1.7, rim: 0.7, fill: 0.35 };
 
 // ---- contact shadow disc (module-level cache so one texture serves all entities) ----------------
 let _shadowTex = null;
@@ -178,14 +167,15 @@
     renderer.setClearColor(0x060912, 1);
     const drawSize = applyRendererSize(renderer, state);
 
-    const scene = new THREE.Scene();
-    // Thin fog for gentle depth cueing only — the old 0.00085 erased the entire backdrop, leaving a
-    // black void. This keeps the nebula + far stars visible while still fading the deep distance.
-    scene.fog = new THREE.FogExp2(0x0a1430, 0.00026);
-    scene.add(new THREE.AmbientLight(0x42506f, 0.85));
-    const key = new THREE.DirectionalLight(0xcfe2ff, 1.7); key.position.set(60, 140, 40); scene.add(key);
-    const rim = new THREE.DirectionalLight(0x6a5cff, 0.7); rim.position.set(-70, 50, -60); scene.add(rim);
-    const fill = new THREE.DirectionalLight(0x39d0ff, 0.35); fill.position.set(20, 30, 120); scene.add(fill);
+    const scene = new THREE.Scene();
+    const corePalette = SECTOR_PALETTE_CLASSES.core;
+    // Thin fog for gentle depth cueing only — the old 0.00085 erased the entire backdrop, leaving a
+    // black void. This keeps the nebula + far stars visible while still fading the deep distance.
+    scene.fog = new THREE.FogExp2(corePalette.fog, corePalette.fogDensity);
+    const ambient = new THREE.AmbientLight(corePalette.ambient, SECTOR_LIGHT_INTENSITIES.ambient); scene.add(ambient);
+    const key = new THREE.DirectionalLight(corePalette.key, SECTOR_LIGHT_INTENSITIES.key); key.position.set(60, 140, 40); scene.add(key);
+    const rim = new THREE.DirectionalLight(corePalette.rim, SECTOR_LIGHT_INTENSITIES.rim); rim.position.set(-70, 50, -60); scene.add(rim);
+    const fill = new THREE.DirectionalLight(corePalette.fill, SECTOR_LIGHT_INTENSITIES.fill); fill.position.set(20, 30, 120); scene.add(fill);
 
     // Real shadow maps (graphics spec Workstream G). Gated behind settings.video.shadows (default
     // true). The key light becomes a shadow caster with a tight frustum that follows the player so
@@ -210,7 +200,7 @@
     }
 
     const cam = createChaseCamera(state);
-    const starfield = createStarfield(scene);
+    const starfield = createStarfield(scene, { tint: corePalette.nebulaTint });
     const vf = createVisualFactory();
     // Hero-asset registry (spec §17.3): wraps the factory's build() so the bespoke player Kestrel is
     // intercepted before the procedural visualFactory. Narrow + failure-isolated — any throw falls
@@ -283,13 +273,16 @@
     // contact-sheet references and are replaced by procedural materials / inline SVG).
     { const i = new Image(); i.src = 'assets/cinematics/menu_background.jpg'; }
 
-    this.renderer = renderer; this.scene = scene; this.cam = cam; this.starfield = starfield; this.vf = vf;
-    this.authoredPartLibraryReady = preloadAuthoredPartLibrary(renderer).catch((error) => {
-      console.warn('[render] authored part library preload failed', error);
-      return null;
-    });
-    state.render.authoredPartLibraryReady = this.authoredPartLibraryReady;
-    this._keyLight = shadowsOn ? key : null; // referenced by _updateShadowFollow() each frame
+    this.renderer = renderer; this.scene = scene; this.cam = cam; this.starfield = starfield; this.vf = vf;
+    this.authoredPartLibraryReady = preloadAuthoredPartLibrary(renderer).catch((error) => {
+      console.warn('[render] authored part library preload failed', error);
+      return null;
+    });
+    state.render.authoredPartLibraryReady = this.authoredPartLibraryReady;
+    this._sectorPaletteRig = createSectorPaletteRig(scene, ambient, key, rim, fill);
+    this._sectorPaletteTarget = corePalette;
+    state.render.sectorPalette = corePalette;
+    this._keyLight = shadowsOn ? key : null; // referenced by _updateShadowFollow() each frame
     this._shadowSettingOn = shadowsOn;
     this._shadowReceiversDirty = true;
     this._shadowReceiverCount = 0;
@@ -410,20 +403,19 @@
     // already spawned by the time this fires (enterSector spawns before its sector:enter resolves),
     // so a blind clearAllMeshes(keepPlayer) used to wipe the station/asteroids and leave the player
     // alone in empty space. reconcileMeshes() removes only meshes for entities that are gone.
-    bus.on('sector:enter', ({ sector } = {}) => {
-      this._meshReconcileDirty = true;
-      if (cam.snapToPlayer) cam.snapToPlayer();
-      this._updatePlanetBodies(sector);
-      // Tint the nebula backdrop to the sector's mood so each region of the galaxy reads with its
-      // own color signature: clean-blue core → rust/amber industrial → blood-red frontier → violet
-      // alien/endgame. Drives the whole-frame atmosphere, reinforcing the core-to-frontier gradient.
-      if (this.starfield && this.starfield.setSectorTint) {
-        this.starfield.setSectorTint(sectorNebulaTint(sector));
-      }
+    bus.on('sector:enter', ({ sector } = {}) => {
+      this._meshReconcileDirty = true;
+      if (cam.snapToPlayer) cam.snapToPlayer();
+      this._updatePlanetBodies(sector);
+      this._beginSectorPaletteTransition(sector);
       this._updateHazardVisuals(sector);
       precompilePipelines(renderer, scene, cam.obj, { sector }).catch((error) => console.warn('[render] sector pipeline precompile failed', error));
     });
-    bus.on('save:loaded', () => { this._meshReconcileDirty = true; });
+    bus.on('jump:arrive', ({ sectorId } = {}) => {
+      const sector = sectorId && state.world && state.world.sectors ? state.world.sectors[sectorId] : null;
+      this._beginSectorPaletteTransition(sector);
+    });
+    bus.on('save:loaded', () => { this._meshReconcileDirty = true; });
 
     window.addEventListener('resize', () => this.onResize());
   },
@@ -640,7 +632,7 @@
     return tex;
   },
 
-  _updateHazardVisuals(sector) {
+  _updateHazardVisuals(sector) {
     // Dispose previous hazard visuals
     for (const obj of this._hazardVisuals) {
       this.scene.remove(obj);
@@ -701,10 +693,42 @@
         this.scene.add(ring);
         this._hazardVisuals.push(ring);
       }
-    }
-  },
-
-  prepareFrame(alpha, frameDt) {
+    }
+  },
+
+  _beginSectorPaletteTransition(sector) {
+    const rig = this._sectorPaletteRig;
+    if (!rig) return;
+    const palette = sector && sector.palette ? sector.palette : SECTOR_PALETTE_CLASSES.core;
+    this.state.render.sectorPalette = palette;
+    if (palette === this._sectorPaletteTarget) return;
+
+    this._sectorPaletteTarget = palette;
+    writeRigToSectorPaletteFrame(rig.start, rig);
+    writePaletteToSectorPaletteFrame(rig.target, palette);
+    rig.elapsed = 0;
+    rig.active = true;
+
+    if (this.starfield && this.starfield.setSectorTint) {
+      this.starfield.setSectorTint(palette.nebulaTint);
+    }
+  },
+
+  _updateSectorPaletteTransition(frameDt) {
+    const rig = this._sectorPaletteRig;
+    if (!rig || !rig.active) return;
+    const dt = Number.isFinite(frameDt) ? Math.max(0, frameDt) : 0;
+    rig.elapsed = Math.min(SECTOR_PALETTE_LERP_SECONDS, rig.elapsed + dt);
+    const rawT = SECTOR_PALETTE_LERP_SECONDS > 0 ? rig.elapsed / SECTOR_PALETTE_LERP_SECONDS : 1;
+    const t = rawT * rawT * (3 - 2 * rawT);
+    lerpSectorPaletteFrame(rig, rig.start, rig.target, t);
+    if (rawT >= 1) {
+      rig.active = false;
+      applySectorPaletteFrame(rig, rig.target);
+    }
+  },
+
+  prepareFrame(alpha, frameDt) {
     // While the GL context is lost, the renderer can't draw — skip all per-frame work until
     // webglcontextrestored rebuilds GPU resources. (cam.follow etc. would run against a dead
     // renderer; the context-restore handler re-applies everything that matters when it returns.)
@@ -716,9 +740,10 @@
     syncAuthoredInstancePools(this.scene, { camera: this.cam.obj });
     this.starfield.recenter(this.cam.obj.position);
     // Background-clock for distant animation (planet cloud drift, hero-star twinkle). Integrates real
-    // frame dt scaled by state.timeScale so the cosmos respects hit-stop/pause — a death freeze
-    // momentarily stills the clouds too, keeping the backdrop in the same time model as the action.
-    const ts = (this.state.timeScale != null) ? this.state.timeScale : 1;
+    // frame dt scaled by state.timeScale so the cosmos respects hit-stop/pause — a death freeze
+    // momentarily stills the clouds too, keeping the backdrop in the same time model as the action.
+    this._updateSectorPaletteTransition(frameDt);
+    const ts = (this.state.timeScale != null) ? this.state.timeScale : 1;
     this._bgTime = (this._bgTime || 0) + frameDt * ts;
     if (this.starfield.update) this.starfield.update(frameDt, this._bgTime);
     this._updatePlanetParallax();
@@ -899,13 +924,97 @@
   return renderer.getDrawingBufferSize(_drawSize);
 }
 
-function finiteInRange(value, min, max, fallback) {
-  const n = Number(value);
-  if (!Number.isFinite(n)) return fallback;
-  return Math.max(min, Math.min(max, n));
-}
-
-function disposeObject(obj) {
+function finiteInRange(value, min, max, fallback) {
+  const n = Number(value);
+  if (!Number.isFinite(n)) return fallback;
+  return Math.max(min, Math.min(max, n));
+}
+
+function createSectorPaletteRig(scene, ambientLight, keyLight, rimLight, fillLight) {
+  const rig = {
+    scene,
+    lights: { ambient: ambientLight, key: keyLight, rim: rimLight, fill: fillLight },
+    start: createSectorPaletteFrame(),
+    target: createSectorPaletteFrame(),
+    elapsed: 0,
+    active: false,
+  };
+  writeRigToSectorPaletteFrame(rig.start, rig);
+  writeRigToSectorPaletteFrame(rig.target, rig);
+  return rig;
+}
+
+function createSectorPaletteFrame() {
+  return {
+    colors: {
+      ambient: new THREE.Color(),
+      key: new THREE.Color(),
+      rim: new THREE.Color(),
+      fill: new THREE.Color(),
+      fog: new THREE.Color(),
+    },
+    intensities: { ambient: 0, key: 0, rim: 0, fill: 0 },
+    fogDensity: 0,
+  };
+}
+
+function writeRigToSectorPaletteFrame(frame, rig) {
+  frame.colors.ambient.copy(rig.lights.ambient.color);
+  frame.colors.key.copy(rig.lights.key.color);
+  frame.colors.rim.copy(rig.lights.rim.color);
+  frame.colors.fill.copy(rig.lights.fill.color);
+  frame.colors.fog.copy(rig.scene.fog.color);
+  frame.intensities.ambient = rig.lights.ambient.intensity;
+  frame.intensities.key = rig.lights.key.intensity;
+  frame.intensities.rim = rig.lights.rim.intensity;
+  frame.intensities.fill = rig.lights.fill.intensity;
+  frame.fogDensity = rig.scene.fog.density;
+}
+
+function writePaletteToSectorPaletteFrame(frame, palette) {
+  frame.colors.ambient.setHex(palette.ambient);
+  frame.colors.key.setHex(palette.key);
+  frame.colors.rim.setHex(palette.rim);
+  frame.colors.fill.setHex(palette.fill);
+  frame.colors.fog.setHex(palette.fog);
+  frame.intensities.ambient = SECTOR_LIGHT_INTENSITIES.ambient;
+  frame.intensities.key = SECTOR_LIGHT_INTENSITIES.key;
+  frame.intensities.rim = SECTOR_LIGHT_INTENSITIES.rim;
+  frame.intensities.fill = SECTOR_LIGHT_INTENSITIES.fill;
+  frame.fogDensity = palette.fogDensity;
+}
+
+function applySectorPaletteFrame(rig, frame) {
+  rig.lights.ambient.color.copy(frame.colors.ambient);
+  rig.lights.key.color.copy(frame.colors.key);
+  rig.lights.rim.color.copy(frame.colors.rim);
+  rig.lights.fill.color.copy(frame.colors.fill);
+  rig.scene.fog.color.copy(frame.colors.fog);
+  rig.lights.ambient.intensity = frame.intensities.ambient;
+  rig.lights.key.intensity = frame.intensities.key;
+  rig.lights.rim.intensity = frame.intensities.rim;
+  rig.lights.fill.intensity = frame.intensities.fill;
+  rig.scene.fog.density = frame.fogDensity;
+}
+
+function lerpSectorPaletteFrame(rig, start, target, t) {
+  rig.lights.ambient.color.lerpColors(start.colors.ambient, target.colors.ambient, t);
+  rig.lights.key.color.lerpColors(start.colors.key, target.colors.key, t);
+  rig.lights.rim.color.lerpColors(start.colors.rim, target.colors.rim, t);
+  rig.lights.fill.color.lerpColors(start.colors.fill, target.colors.fill, t);
+  rig.scene.fog.color.lerpColors(start.colors.fog, target.colors.fog, t);
+  rig.lights.ambient.intensity = lerp(start.intensities.ambient, target.intensities.ambient, t);
+  rig.lights.key.intensity = lerp(start.intensities.key, target.intensities.key, t);
+  rig.lights.rim.intensity = lerp(start.intensities.rim, target.intensities.rim, t);
+  rig.lights.fill.intensity = lerp(start.intensities.fill, target.intensities.fill, t);
+  rig.scene.fog.density = lerp(start.fogDensity, target.fogDensity, t);
+}
+
+function lerp(a, b, t) {
+  return a + (b - a) * t;
+}
+
+function disposeObject(obj) {
   obj.traverse((c) => {
     if (c.isBatchedMesh && typeof c.dispose === 'function') c.dispose();
     else if (c.geometry && !(c.userData && (c.userData.sharedContactShadow || c.userData.sharedShieldGeo))) c.geometry.dispose();
diff --git a/src/render/starfield.js b/src/render/starfield.js
index d76965c563ac0d99166bb382577d2f6eaa4a6d0f..aecb37608592e6ff981ddaf8fd6107d17a0632e6
--- a/src/render/starfield.js
+++ b/src/render/starfield.js
@@ -116,10 +116,18 @@
   return c;
 }
 
-// --- small color helpers for sector tinting (no deps) ---
-function hexToRgb(hex) {
-  const h = hex.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
-}
+// --- small color helpers for sector tinting (no deps) ---
+function normalizeTint(tint) {
+  if (tint == null) return null;
+  if (typeof tint === 'number' && Number.isFinite(tint)) {
+    return '#' + ((tint >>> 0) & 0xffffff).toString(16).padStart(6, '0');
+  }
+  if (typeof tint === 'string') return tint.startsWith('#') ? tint : '#' + tint.replace(/^0x/i, '');
+  return null;
+}
+function hexToRgb(hex) {
+  const h = hex.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
+}
 function rgbToHex(r, g, b) {
   const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
   return '#' + c(r) + c(g) + c(b);
@@ -176,11 +184,11 @@
   ctx.restore();
 }
 
-export function createStarfield(scene, opts = {}) {
-  const layers = [];
-  const sprite = makeStarSprite();
-  let bgTexture = null;
-  let currentTint = opts.tint || null;
+export function createStarfield(scene, opts = {}) {
+  const layers = [];
+  const sprite = makeStarSprite();
+  let bgTexture = null;
+  let currentTint = normalizeTint(opts.tint);
 
   // star tints (mostly cool white/blue with a few warm + teal accents)
   const TINTS = [0xffffff, 0xcfe0ff, 0x9fb6e0, 0xfff0d8, 0x8af0d6, 0xbfd2ff];
@@ -297,13 +305,14 @@
       // GR-7: slow-rotate the distant 3D planets so they read as real spinning worlds, not billboards.
       for (const p of distantPlanets) p.mesh.rotation.y += dt * p.spin;
     },
-    // Swap the nebula mood on sector enter — each region of the galaxy reads with its own color
-    // signature (core = clean blue, industrial = rust/amber, frontier = blood-red, alien = violet).
-    setSectorTint(tint) {
-      if (tint === currentTint) return;
-      currentTint = tint || null;
-      applyBackground(currentTint);
-    },
+    // Swap the nebula mood on sector enter — each region of the galaxy reads with its own color
+    // signature (core = clean blue, industrial = rust/amber, frontier = blood-red, alien = violet).
+    setSectorTint(tint) {
+      const nextTint = normalizeTint(tint);
+      if (nextTint === currentTint) return;
+      currentTint = nextTint;
+      applyBackground(currentTint);
+    },
     setWarp() { /* extended by vfx during jump */ },
   };
 }

 succeeded in 1716ms:
 M package.json
 M src/data/sectors.js
 M src/render/renderer.js
 M src/render/starfield.js
?? scripts/check-sector-palettes.mjs

codex
The targeted palette/data checks are green so far; I’m waiting on the remaining scoped diff/status output before I wrap this up cleanly.
diff --git a/package.json b/package.json
index 0897813b9c443f97ae9d2e8ae253e77f386705d9..a869414ec6dbceebe45b9b78abd72013201579da
--- a/package.json
+++ b/package.json
@@ -74,9 +74,10 @@
     "build:sg04:release-assets": "node scripts/build-sg04-release-assets.mjs",
     "build:bundle": "node scripts/build-bundle.mjs",
     "check:bundle": "node scripts/check-bundle.mjs",
-    "check:launch-policy": "node scripts/check-launch-policy.mjs",
-    "check:non-graphics": "node scripts/check-non-graphics-ci.mjs",
-    "check:assets:live": "node scripts/probe-authored-assets-live.mjs",
+    "check:launch-policy": "node scripts/check-launch-policy.mjs",
+    "check:non-graphics": "node scripts/check-non-graphics-ci.mjs",
+    "check:sector-palettes": "node scripts/check-sector-palettes.mjs",
+    "check:assets:live": "node scripts/probe-authored-assets-live.mjs",
     "check:perf:control": "node scripts/probe-raf-control.mjs --headed --strict --width 1830 --height 973 --warmup 1000 --duration 5000",
     "check:perf": "node scripts/probe-performance-profile.mjs --headed --strict --width 1830 --height 973 --warmup 2500 --duration 7000 --diagnostic-variants",
     "check:hitch-budget": "node scripts/check-hitch-budget.mjs",
diff --git a/scripts/check-sector-palettes.mjs b/scripts/check-sector-palettes.mjs
new file mode 100644
index 0000000000000000000000000000000000000000..04318569a6d4a787b3cf451b3de0e457574fa6f1
--- /dev/null
+++ b/scripts/check-sector-palettes.mjs
@@ -0,0 +1,81 @@
+import { SECTORS, SECTOR_PALETTE_CLASSES } from '../src/data/sectors.js';
+
+const REQUIRED_FIELDS = ['key', 'rim', 'fill', 'ambient', 'fog', 'fogDensity', 'nebulaTint', 'dust'];
+const COLOR_FIELDS = ['key', 'rim', 'fill', 'ambient', 'fog', 'nebulaTint', 'dust'];
+const CLASS_ENTRIES = Object.entries(SECTOR_PALETTE_CLASSES);
+const CORE_LUMINANCE = combinedLightLuminance(SECTOR_PALETTE_CLASSES.core);
+const MIN_LUMINANCE = CORE_LUMINANCE * 0.8;
+const MAX_LUMINANCE = CORE_LUMINANCE * 1.2;
+
+const issues = [];
+const usedClasses = new Set();
+
+for (const sector of SECTORS) {
+  const palette = sector.palette;
+  if (!palette || typeof palette !== 'object') {
+    issues.push(`${sector.id}: missing palette block`);
+    continue;
+  }
+
+  for (const field of REQUIRED_FIELDS) {
+    if (!(field in palette)) issues.push(`${sector.id}: palette missing ${field}`);
+  }
+  for (const field of COLOR_FIELDS) {
+    if (!isColorHex(palette[field])) issues.push(`${sector.id}: palette.${field} must be a 0x000000-0xffffff number`);
+  }
+  if (!Number.isFinite(palette.fogDensity) || palette.fogDensity <= 0) {
+    issues.push(`${sector.id}: palette.fogDensity must be a positive finite number`);
+  }
+
+  const className = classNameForPalette(palette);
+  if (!className) issues.push(`${sector.id}: palette does not match an authored class`);
+  else usedClasses.add(className);
+
+  const luminance = combinedLightLuminance(palette);
+  if (luminance < MIN_LUMINANCE || luminance > MAX_LUMINANCE) {
+    issues.push(`${sector.id}: ambient+fill luminance ${luminance.toFixed(4)} outside ${MIN_LUMINANCE.toFixed(4)}-${MAX_LUMINANCE.toFixed(4)}`);
+  }
+}
+
+for (const [className] of CLASS_ENTRIES) {
+  if (!usedClasses.has(className)) issues.push(`palette class unused: ${className}`);
+}
+
+if (issues.length) {
+  console.error(`Sector palette check failed (${issues.length} issue${issues.length === 1 ? '' : 's'}):`);
+  for (const issue of issues) console.error(`- ${issue}`);
+  process.exit(1);
+}
+
+console.log(`Sector palettes OK: ${SECTORS.length} sectors, classes used: ${[...usedClasses].sort().join(', ')}`);
+
+function classNameForPalette(palette) {
+  for (const [className, classPalette] of CLASS_ENTRIES) {
+    if (samePalette(palette, classPalette)) return className;
+  }
+  return null;
+}
+
+function samePalette(a, b) {
+  return REQUIRED_FIELDS.every((field) => a[field] === b[field]);
+}
+
+function isColorHex(value) {
+  return Number.isInteger(value) && value >= 0x000000 && value <= 0xffffff;
+}
+
+function combinedLightLuminance(palette) {
+  return relativeLuminance(palette.ambient) + relativeLuminance(palette.fill);
+}
+
+function relativeLuminance(hex) {
+  const r = linearRgb((hex >> 16) & 0xff);
+  const g = linearRgb((hex >> 8) & 0xff);
+  const b = linearRgb(hex & 0xff);
+  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
+}
+
+function linearRgb(channel) {
+  const c = channel / 255;
+  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
+}
diff --git a/src/data/sectors.js b/src/data/sectors.js
index 9c63f69479b241fc848258e3fe2161547793fa46..1814c409089f818b6ab4758b3f0cf8f8531f2452
--- a/src/data/sectors.js
+++ b/src/data/sectors.js
@@ -10,10 +10,30 @@
 export const HAZARD_TYPES  = ['dense_asteroid', 'nebula', 'radiation', 'debris'];
 export const POI_TYPES     = ['beacon', 'derelict', 'cache', 'colony', 'anomaly', 'wormhole', 'wreck'];
 
+export const SECTOR_PALETTE_CLASSES = {
+  core: {
+    key: 0xcfe2ff, rim: 0x6a5cff, fill: 0x39d0ff, ambient: 0x42506f,
+    fog: 0x0a1430, fogDensity: 0.00026, nebulaTint: 0x1e3a6a, dust: 0x7ea7c7,
+  },
+  belt: {
+    key: 0xffd59a, rim: 0xb56d2f, fill: 0xffb13d, ambient: 0x594a42,
+    fog: 0x2a160c, fogDensity: 0.00034, nebulaTint: 0x8a4a1e, dust: 0xc0793d,
+  },
+  fringe: {
+    key: 0xffb07a, rim: 0xff3f2d, fill: 0xffaa66, ambient: 0x584343,
+    fog: 0x2a0d0a, fogDensity: 0.00042, nebulaTint: 0x8a1e1e, dust: 0xc15032,
+  },
+  anomaly: {
+    key: 0xc8b6ff, rim: 0x54ffb0, fill: 0x4ddc92, ambient: 0x494760,
+    fog: 0x160d2c, fogDensity: 0.00036, nebulaTint: 0x5a1e8a, dust: 0x79ffc8,
+  },
+};
+
 export const SECTORS = [
   {
     id: 'sector_helios_prime', name: 'Helios Prime', tier: 0, security: 0.98, charted: true,
     factionId: 'faction_scn', position: { x: 0, y: 0 }, worldRadius: 3500,
+    palette: SECTOR_PALETTE_CLASSES.core,
     // Tutorial home sector: NO hostile spawns (enemyDensity 0). A brand-new pilot must not be
     // hunted before learning the ropes; danger ramps up only in neighbouring sectors.
     trafficPerMin: 18, enemyDensity: 0, enemyLevel: [1, 2],
@@ -37,6 +57,7 @@
   {
     id: 'sector_ceres_belt', name: 'Ceres Belt', tier: 1, security: 0.72, charted: true,
     factionId: 'faction_dmc', position: { x: -3, y: 2 }, worldRadius: 4200,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 10, enemyDensity: 0.18, enemyLevel: [2, 4],
     neighbors: ['sector_helios_prime', 'sector_tethys_junction', 'sector_pallas_drift'],
     stations: [
@@ -57,6 +78,7 @@
   {
     id: 'sector_tethys_junction', name: 'Tethys Junction', tier: 1, security: 0.65, charted: true,
     factionId: 'faction_mts', position: { x: 3, y: 2 }, worldRadius: 4000,
+    palette: SECTOR_PALETTE_CLASSES.core,
     trafficPerMin: 14, enemyDensity: 0.20, enemyLevel: [2, 4],
     neighbors: ['sector_helios_prime', 'sector_ceres_belt', 'sector_vesta_forge', 'sector_io_reach'],
     stations: [
@@ -72,6 +94,7 @@
   {
     id: 'sector_vesta_forge', name: 'Vesta Forge', tier: 1, security: 0.60, charted: true,
     factionId: 'faction_dmc', position: { x: 0, y: 4 }, worldRadius: 4300,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 9, enemyDensity: 0.25, enemyLevel: [3, 5],
     neighbors: ['sector_helios_prime', 'sector_tethys_junction', 'sector_charon_expanse'],
     stations: [
@@ -89,6 +112,7 @@
   {
     id: 'sector_pallas_drift', name: 'Pallas Drift', tier: 2, security: 0.42, charted: true,
     factionId: 'faction_mts', position: { x: -5, y: 5 }, worldRadius: 4500,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 7, enemyDensity: 0.40, enemyLevel: [4, 7],
     neighbors: ['sector_ceres_belt', 'sector_io_reach', 'sector_sker_haven'],
     stations: [
@@ -109,6 +133,7 @@
   {
     id: 'sector_io_reach', name: 'Io Reach', tier: 2, security: 0.35, charted: true,
     factionId: 'faction_free', position: { x: 5, y: 5 }, worldRadius: 4600,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 5, enemyDensity: 0.50, enemyLevel: [5, 8],
     neighbors: ['sector_tethys_junction', 'sector_pallas_drift', 'sector_charon_expanse', 'sector_veil_nebula'],
     stations: [
@@ -132,6 +157,7 @@
   {
     id: 'sector_charon_expanse', name: 'Charon Expanse', tier: 2, security: 0.30, charted: true,
     factionId: 'faction_dmc', position: { x: 2, y: 7 }, worldRadius: 4800,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 4, enemyDensity: 0.50, enemyLevel: [5, 9],
     neighbors: ['sector_vesta_forge', 'sector_io_reach', 'sector_ashfall_reach'],
     stations: [
@@ -151,6 +177,7 @@
   {
     id: 'sector_sker_haven', name: 'Sker Haven', tier: 3, security: 0.08, charted: false,
     factionId: 'faction_reach', position: { x: -7, y: 8 }, worldRadius: 5000,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 0, enemyDensity: 0.70, enemyLevel: [7, 11],
     neighbors: ['sector_pallas_drift', 'sector_veil_nebula'],
     stations: [
@@ -169,6 +196,7 @@
   {
     id: 'sector_veil_nebula', name: 'Veil Nebula', tier: 3, security: 0.12, charted: false,
     factionId: 'faction_free', position: { x: 7, y: 9 }, worldRadius: 5200,
+    palette: SECTOR_PALETTE_CLASSES.anomaly,
     trafficPerMin: 0, enemyDensity: 0.65, enemyLevel: [8, 12],
     neighbors: ['sector_io_reach', 'sector_sker_haven'],
     wormholeTo: { sectorId: 'sector_ashfall_reach', gatedBy: 'tech:tech_long_range_survey' },
@@ -188,6 +216,7 @@
   {
     id: 'sector_ashfall_reach', name: 'Ashfall Reach', tier: 4, security: 0.05, charted: false,
     factionId: 'faction_vael', position: { x: 4, y: 11 }, worldRadius: 5500,
+    palette: SECTOR_PALETTE_CLASSES.anomaly,
     trafficPerMin: 0, enemyDensity: 0.80, enemyLevel: [10, 15],
     neighbors: ['sector_charon_expanse'],
     stations: [
diff --git a/src/render/renderer.js b/src/render/renderer.js
index def6420ff1bff2ac1c64dcc1add395e7851c4dbc..7b83534145db2cec91608a3a2a42dfe1ec083a9d
--- a/src/render/renderer.js
+++ b/src/render/renderer.js
@@ -15,21 +15,10 @@
 import { installDiagnostics } from './diagnostics.js';
 import { createPlanetFactory } from './planetFactory.js';
 import { precompilePipelines } from './precompile.js';
-
-// Map a sector's danger/tier to a nebula backdrop tint so each region of the galaxy has its own
-// color signature. Core (safe, low tier) = clean blue; industrial mid-ring = rust/amber; lawless
-// frontier = blood-red; alien/endgame tier 4+ = violet. Returns a hex string or null (default).
-function sectorNebulaTint(sector) {
-  if (!sector) return null;
-  const tier = sector.tier || 0;
-  const sec = sector.security != null ? sector.security : 1;
-  const danger = (1 - sec) + tier * 0.15; // blended danger metric
-  if (tier >= 4) return '#5a1e8a';        // violet — alien / lawless endgame (Veil, Ashfall)
-  if (danger > 0.7) return '#8a1e1e';     // blood-red — dangerous frontier (Io Reach, Sker)
-  if (danger > 0.45) return '#8a4a1e';    // rust/amber — industrial mid-ring (Vesta, Pallas)
-  if (danger > 0.2) return '#1e4a8a';     // deep blue — settled belt (Ceres, Tethys)
-  return '#1e3a6a';                        // clean blue — safe core (Helios Prime)
-}
+import { SECTOR_PALETTE_CLASSES } from '../data/sectors.js';
+
+const SECTOR_PALETTE_LERP_SECONDS = 1.5;
+const SECTOR_LIGHT_INTENSITIES = { ambient: 0.85, key: 1.7, rim: 0.7, fill: 0.35 };
 
 // ---- contact shadow disc (module-level cache so one texture serves all entities) ----------------
 let _shadowTex = null;
@@ -178,14 +167,15 @@
     renderer.setClearColor(0x060912, 1);
     const drawSize = applyRendererSize(renderer, state);
 
-    const scene = new THREE.Scene();
-    // Thin fog for gentle depth cueing only — the old 0.00085 erased the entire backdrop, leaving a
-    // black void. This keeps the nebula + far stars visible while still fading the deep distance.
-    scene.fog = new THREE.FogExp2(0x0a1430, 0.00026);
-    scene.add(new THREE.AmbientLight(0x42506f, 0.85));
-    const key = new THREE.DirectionalLight(0xcfe2ff, 1.7); key.position.set(60, 140, 40); scene.add(key);
-    const rim = new THREE.DirectionalLight(0x6a5cff, 0.7); rim.position.set(-70, 50, -60); scene.add(rim);
-    const fill = new THREE.DirectionalLight(0x39d0ff, 0.35); fill.position.set(20, 30, 120); scene.add(fill);
+    const scene = new THREE.Scene();
+    const corePalette = SECTOR_PALETTE_CLASSES.core;
+    // Thin fog for gentle depth cueing only — the old 0.00085 erased the entire backdrop, leaving a
+    // black void. This keeps the nebula + far stars visible while still fading the deep distance.
+    scene.fog = new THREE.FogExp2(corePalette.fog, corePalette.fogDensity);
+    const ambient = new THREE.AmbientLight(corePalette.ambient, SECTOR_LIGHT_INTENSITIES.ambient); scene.add(ambient);
+    const key = new THREE.DirectionalLight(corePalette.key, SECTOR_LIGHT_INTENSITIES.key); key.position.set(60, 140, 40); scene.add(key);
+    const rim = new THREE.DirectionalLight(corePalette.rim, SECTOR_LIGHT_INTENSITIES.rim); rim.position.set(-70, 50, -60); scene.add(rim);
+    const fill = new THREE.DirectionalLight(corePalette.fill, SECTOR_LIGHT_INTENSITIES.fill); fill.position.set(20, 30, 120); scene.add(fill);
 
     // Real shadow maps (graphics spec Workstream G). Gated behind settings.video.shadows (default
     // true). The key light becomes a shadow caster with a tight frustum that follows the player so
@@ -210,7 +200,7 @@
     }
 
     const cam = createChaseCamera(state);
-    const starfield = createStarfield(scene);
+    const starfield = createStarfield(scene, { tint: corePalette.nebulaTint });
     const vf = createVisualFactory();
     // Hero-asset registry (spec §17.3): wraps the factory's build() so the bespoke player Kestrel is
     // intercepted before the procedural visualFactory. Narrow + failure-isolated — any throw falls
@@ -283,13 +273,16 @@
     // contact-sheet references and are replaced by procedural materials / inline SVG).
     { const i = new Image(); i.src = 'assets/cinematics/menu_background.jpg'; }
 
-    this.renderer = renderer; this.scene = scene; this.cam = cam; this.starfield = starfield; this.vf = vf;
-    this.authoredPartLibraryReady = preloadAuthoredPartLibrary(renderer).catch((error) => {
-      console.warn('[render] authored part library preload failed', error);
-      return null;
-    });
-    state.render.authoredPartLibraryReady = this.authoredPartLibraryReady;
-    this._keyLight = shadowsOn ? key : null; // referenced by _updateShadowFollow() each frame
+    this.renderer = renderer; this.scene = scene; this.cam = cam; this.starfield = starfield; this.vf = vf;
+    this.authoredPartLibraryReady = preloadAuthoredPartLibrary(renderer).catch((error) => {
+      console.warn('[render] authored part library preload failed', error);
+      return null;
+    });
+    state.render.authoredPartLibraryReady = this.authoredPartLibraryReady;
+    this._sectorPaletteRig = createSectorPaletteRig(scene, ambient, key, rim, fill);
+    this._sectorPaletteTarget = corePalette;
+    state.render.sectorPalette = corePalette;
+    this._keyLight = shadowsOn ? key : null; // referenced by _updateShadowFollow() each frame
     this._shadowSettingOn = shadowsOn;
     this._shadowReceiversDirty = true;
     this._shadowReceiverCount = 0;
@@ -410,20 +403,19 @@
     // already spawned by the time this fires (enterSector spawns before its sector:enter resolves),
     // so a blind clearAllMeshes(keepPlayer) used to wipe the station/asteroids and leave the player
     // alone in empty space. reconcileMeshes() removes only meshes for entities that are gone.
-    bus.on('sector:enter', ({ sector } = {}) => {
-      this._meshReconcileDirty = true;
-      if (cam.snapToPlayer) cam.snapToPlayer();
-      this._updatePlanetBodies(sector);
-      // Tint the nebula backdrop to the sector's mood so each region of the galaxy reads with its
-      // own color signature: clean-blue core → rust/amber industrial → blood-red frontier → violet
-      // alien/endgame. Drives the whole-frame atmosphere, reinforcing the core-to-frontier gradient.
-      if (this.starfield && this.starfield.setSectorTint) {
-        this.starfield.setSectorTint(sectorNebulaTint(sector));
-      }
+    bus.on('sector:enter', ({ sector } = {}) => {
+      this._meshReconcileDirty = true;
+      if (cam.snapToPlayer) cam.snapToPlayer();
+      this._updatePlanetBodies(sector);
+      this._beginSectorPaletteTransition(sector);
       this._updateHazardVisuals(sector);
       precompilePipelines(renderer, scene, cam.obj, { sector }).catch((error) => console.warn('[render] sector pipeline precompile failed', error));
     });
-    bus.on('save:loaded', () => { this._meshReconcileDirty = true; });
+    bus.on('jump:arrive', ({ sectorId } = {}) => {
+      const sector = sectorId && state.world && state.world.sectors ? state.world.sectors[sectorId] : null;
+      this._beginSectorPaletteTransition(sector);
+    });
+    bus.on('save:loaded', () => { this._meshReconcileDirty = true; });
 
     window.addEventListener('resize', () => this.onResize());
   },
@@ -640,7 +632,7 @@
     return tex;
   },
 
-  _updateHazardVisuals(sector) {
+  _updateHazardVisuals(sector) {
     // Dispose previous hazard visuals
     for (const obj of this._hazardVisuals) {
       this.scene.remove(obj);
@@ -701,10 +693,42 @@
         this.scene.add(ring);
         this._hazardVisuals.push(ring);
       }
-    }
-  },
-
-  prepareFrame(alpha, frameDt) {
+    }
+  },
+
+  _beginSectorPaletteTransition(sector) {
+    const rig = this._sectorPaletteRig;
+    if (!rig) return;
+    const palette = sector && sector.palette ? sector.palette : SECTOR_PALETTE_CLASSES.core;
+    this.state.render.sectorPalette = palette;
+    if (palette === this._sectorPaletteTarget) return;
+
+    this._sectorPaletteTarget = palette;
+    writeRigToSectorPaletteFrame(rig.start, rig);
+    writePaletteToSectorPaletteFrame(rig.target, palette);
+    rig.elapsed = 0;
+    rig.active = true;
+
+    if (this.starfield && this.starfield.setSectorTint) {
+      this.starfield.setSectorTint(palette.nebulaTint);
+    }
+  },
+
+  _updateSectorPaletteTransition(frameDt) {
+    const rig = this._sectorPaletteRig;
+    if (!rig || !rig.active) return;
+    const dt = Number.isFinite(frameDt) ? Math.max(0, frameDt) : 0;
+    rig.elapsed = Math.min(SECTOR_PALETTE_LERP_SECONDS, rig.elapsed + dt);
+    const rawT = SECTOR_PALETTE_LERP_SECONDS > 0 ? rig.elapsed / SECTOR_PALETTE_LERP_SECONDS : 1;
+    const t = rawT * rawT * (3 - 2 * rawT);
+    lerpSectorPaletteFrame(rig, rig.start, rig.target, t);
+    if (rawT >= 1) {
+      rig.active = false;
+      applySectorPaletteFrame(rig, rig.target);
+    }
+  },
+
+  prepareFrame(alpha, frameDt) {
     // While the GL context is lost, the renderer can't draw — skip all per-frame work until
     // webglcontextrestored rebuilds GPU resources. (cam.follow etc. would run against a dead
     // renderer; the context-restore handler re-applies everything that matters when it returns.)
@@ -716,9 +740,10 @@
     syncAuthoredInstancePools(this.scene, { camera: this.cam.obj });
     this.starfield.recenter(this.cam.obj.position);
     // Background-clock for distant animation (planet cloud drift, hero-star twinkle). Integrates real
-    // frame dt scaled by state.timeScale so the cosmos respects hit-stop/pause — a death freeze
-    // momentarily stills the clouds too, keeping the backdrop in the same time model as the action.
-    const ts = (this.state.timeScale != null) ? this.state.timeScale : 1;
+    // frame dt scaled by state.timeScale so the cosmos respects hit-stop/pause — a death freeze
+    // momentarily stills the clouds too, keeping the backdrop in the same time model as the action.
+    this._updateSectorPaletteTransition(frameDt);
+    const ts = (this.state.timeScale != null) ? this.state.timeScale : 1;
     this._bgTime = (this._bgTime || 0) + frameDt * ts;
     if (this.starfield.update) this.starfield.update(frameDt, this._bgTime);
     this._updatePlanetParallax();
@@ -899,13 +924,97 @@
   return renderer.getDrawingBufferSize(_drawSize);
 }
 
-function finiteInRange(value, min, max, fallback) {
-  const n = Number(value);
-  if (!Number.isFinite(n)) return fallback;
-  return Math.max(min, Math.min(max, n));
-}
-
-function disposeObject(obj) {
+function finiteInRange(value, min, max, fallback) {
+  const n = Number(value);
+  if (!Number.isFinite(n)) return fallback;
+  return Math.max(min, Math.min(max, n));
+}
+
+function createSectorPaletteRig(scene, ambientLight, keyLight, rimLight, fillLight) {
+  const rig = {
+    scene,
+    lights: { ambient: ambientLight, key: keyLight, rim: rimLight, fill: fillLight },
+    start: createSectorPaletteFrame(),
+    target: createSectorPaletteFrame(),
+    elapsed: 0,
+    active: false,
+  };
+  writeRigToSectorPaletteFrame(rig.start, rig);
+  writeRigToSectorPaletteFrame(rig.target, rig);
+  return rig;
+}
+
+function createSectorPaletteFrame() {
+  return {
+    colors: {
+      ambient: new THREE.Color(),
+      key: new THREE.Color(),
+      rim: new THREE.Color(),
+      fill: new THREE.Color(),
+      fog: new THREE.Color(),
+    },
+    intensities: { ambient: 0, key: 0, rim: 0, fill: 0 },
+    fogDensity: 0,
+  };
+}
+
+function writeRigToSectorPaletteFrame(frame, rig) {
+  frame.colors.ambient.copy(rig.lights.ambient.color);
+  frame.colors.key.copy(rig.lights.key.color);
+  frame.colors.rim.copy(rig.lights.rim.color);
+  frame.colors.fill.copy(rig.lights.fill.color);
+  frame.colors.fog.copy(rig.scene.fog.color);
+  frame.intensities.ambient = rig.lights.ambient.intensity;
+  frame.intensities.key = rig.lights.key.intensity;
+  frame.intensities.rim = rig.lights.rim.intensity;
+  frame.intensities.fill = rig.lights.fill.intensity;
+  frame.fogDensity = rig.scene.fog.density;
+}
+
+function writePaletteToSectorPaletteFrame(frame, palette) {
+  frame.colors.ambient.setHex(palette.ambient);
+  frame.colors.key.setHex(palette.key);
+  frame.colors.rim.setHex(palette.rim);
+  frame.colors.fill.setHex(palette.fill);
+  frame.colors.fog.setHex(palette.fog);
+  frame.intensities.ambient = SECTOR_LIGHT_INTENSITIES.ambient;
+  frame.intensities.key = SECTOR_LIGHT_INTENSITIES.key;
+  frame.intensities.rim = SECTOR_LIGHT_INTENSITIES.rim;
+  frame.intensities.fill = SECTOR_LIGHT_INTENSITIES.fill;
+  frame.fogDensity = palette.fogDensity;
+}
+
+function applySectorPaletteFrame(rig, frame) {
+  rig.lights.ambient.color.copy(frame.colors.ambient);
+  rig.lights.key.color.copy(frame.colors.key);
+  rig.lights.rim.color.copy(frame.colors.rim);
+  rig.lights.fill.color.copy(frame.colors.fill);
+  rig.scene.fog.color.copy(frame.colors.fog);
+  rig.lights.ambient.intensity = frame.intensities.ambient;
+  rig.lights.key.intensity = frame.intensities.key;
+  rig.lights.rim.intensity = frame.intensities.rim;
+  rig.lights.fill.intensity = frame.intensities.fill;
+  rig.scene.fog.density = frame.fogDensity;
+}
+
+function lerpSectorPaletteFrame(rig, start, target, t) {
+  rig.lights.ambient.color.lerpColors(start.colors.ambient, target.colors.ambient, t);
+  rig.lights.key.color.lerpColors(start.colors.key, target.colors.key, t);
+  rig.lights.rim.color.lerpColors(start.colors.rim, target.colors.rim, t);
+  rig.lights.fill.color.lerpColors(start.colors.fill, target.colors.fill, t);
+  rig.scene.fog.color.lerpColors(start.colors.fog, target.colors.fog, t);
+  rig.lights.ambient.intensity = lerp(start.intensities.ambient, target.intensities.ambient, t);
+  rig.lights.key.intensity = lerp(start.intensities.key, target.intensities.key, t);
+  rig.lights.rim.intensity = lerp(start.intensities.rim, target.intensities.rim, t);
+  rig.lights.fill.intensity = lerp(start.intensities.fill, target.intensities.fill, t);
+  rig.scene.fog.density = lerp(start.fogDensity, target.fogDensity, t);
+}
+
+function lerp(a, b, t) {
+  return a + (b - a) * t;
+}
+
+function disposeObject(obj) {
   obj.traverse((c) => {
     if (c.isBatchedMesh && typeof c.dispose === 'function') c.dispose();
     else if (c.geometry && !(c.userData && (c.userData.sharedContactShadow || c.userData.sharedShieldGeo))) c.geometry.dispose();
diff --git a/src/render/starfield.js b/src/render/starfield.js
index d76965c563ac0d99166bb382577d2f6eaa4a6d0f..aecb37608592e6ff981ddaf8fd6107d17a0632e6
--- a/src/render/starfield.js
+++ b/src/render/starfield.js
@@ -116,10 +116,18 @@
   return c;
 }
 
-// --- small color helpers for sector tinting (no deps) ---
-function hexToRgb(hex) {
-  const h = hex.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
-}
+// --- small color helpers for sector tinting (no deps) ---
+function normalizeTint(tint) {
+  if (tint == null) return null;
+  if (typeof tint === 'number' && Number.isFinite(tint)) {
+    return '#' + ((tint >>> 0) & 0xffffff).toString(16).padStart(6, '0');
+  }
+  if (typeof tint === 'string') return tint.startsWith('#') ? tint : '#' + tint.replace(/^0x/i, '');
+  return null;
+}
+function hexToRgb(hex) {
+  const h = hex.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
+}
 function rgbToHex(r, g, b) {
   const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
   return '#' + c(r) + c(g) + c(b);
@@ -176,11 +184,11 @@
   ctx.restore();
 }
 
-export function createStarfield(scene, opts = {}) {
-  const layers = [];
-  const sprite = makeStarSprite();
-  let bgTexture = null;
-  let currentTint = opts.tint || null;
+export function createStarfield(scene, opts = {}) {
+  const layers = [];
+  const sprite = makeStarSprite();
+  let bgTexture = null;
+  let currentTint = normalizeTint(opts.tint);
 
   // star tints (mostly cool white/blue with a few warm + teal accents)
   const TINTS = [0xffffff, 0xcfe0ff, 0x9fb6e0, 0xfff0d8, 0x8af0d6, 0xbfd2ff];
@@ -297,13 +305,14 @@
       // GR-7: slow-rotate the distant 3D planets so they read as real spinning worlds, not billboards.
       for (const p of distantPlanets) p.mesh.rotation.y += dt * p.spin;
     },
-    // Swap the nebula mood on sector enter — each region of the galaxy reads with its own color
-    // signature (core = clean blue, industrial = rust/amber, frontier = blood-red, alien = violet).
-    setSectorTint(tint) {
-      if (tint === currentTint) return;
-      currentTint = tint || null;
-      applyBackground(currentTint);
-    },
+    // Swap the nebula mood on sector enter — each region of the galaxy reads with its own color
+    // signature (core = clean blue, industrial = rust/amber, frontier = blood-red, alien = violet).
+    setSectorTint(tint) {
+      const nextTint = normalizeTint(tint);
+      if (nextTint === currentTint) return;
+      currentTint = nextTint;
+      applyBackground(currentTint);
+    },
     setWarp() { /* extended by vfx during jump */ },
   };
 }

codex
Implemented WS-E2 in the requested files: sector palette classes/assignments, 1.5s renderer light/fog transitions, guarded nebula tint rebake, `state.render.sectorPalette`, and `check:sector-palettes`.

Verified: `npm run check:sector-palettes`, `node scripts/check-data.mjs`, and scoped `git diff --check` pass. The full requested chain reaches `npm run check:non-graphics` but fails repeatably in unrelated `scripts/check-sg02-tether-break.mjs` (`active` vs expected `broken`).


diff --git a/package.json b/package.json
index 0897813b9c443f97ae9d2e8ae253e77f386705d9..a869414ec6dbceebe45b9b78abd72013201579da
--- a/package.json
+++ b/package.json
@@ -74,9 +74,10 @@
     "build:sg04:release-assets": "node scripts/build-sg04-release-assets.mjs",
     "build:bundle": "node scripts/build-bundle.mjs",
     "check:bundle": "node scripts/check-bundle.mjs",
-    "check:launch-policy": "node scripts/check-launch-policy.mjs",
-    "check:non-graphics": "node scripts/check-non-graphics-ci.mjs",
-    "check:assets:live": "node scripts/probe-authored-assets-live.mjs",
+    "check:launch-policy": "node scripts/check-launch-policy.mjs",
+    "check:non-graphics": "node scripts/check-non-graphics-ci.mjs",
+    "check:sector-palettes": "node scripts/check-sector-palettes.mjs",
+    "check:assets:live": "node scripts/probe-authored-assets-live.mjs",
     "check:perf:control": "node scripts/probe-raf-control.mjs --headed --strict --width 1830 --height 973 --warmup 1000 --duration 5000",
     "check:perf": "node scripts/probe-performance-profile.mjs --headed --strict --width 1830 --height 973 --warmup 2500 --duration 7000 --diagnostic-variants",
     "check:hitch-budget": "node scripts/check-hitch-budget.mjs",
diff --git a/scripts/check-sector-palettes.mjs b/scripts/check-sector-palettes.mjs
new file mode 100644
index 0000000000000000000000000000000000000000..04318569a6d4a787b3cf451b3de0e457574fa6f1
--- /dev/null
+++ b/scripts/check-sector-palettes.mjs
@@ -0,0 +1,81 @@
+import { SECTORS, SECTOR_PALETTE_CLASSES } from '../src/data/sectors.js';
+
+const REQUIRED_FIELDS = ['key', 'rim', 'fill', 'ambient', 'fog', 'fogDensity', 'nebulaTint', 'dust'];
+const COLOR_FIELDS = ['key', 'rim', 'fill', 'ambient', 'fog', 'nebulaTint', 'dust'];
+const CLASS_ENTRIES = Object.entries(SECTOR_PALETTE_CLASSES);
+const CORE_LUMINANCE = combinedLightLuminance(SECTOR_PALETTE_CLASSES.core);
+const MIN_LUMINANCE = CORE_LUMINANCE * 0.8;
+const MAX_LUMINANCE = CORE_LUMINANCE * 1.2;
+
+const issues = [];
+const usedClasses = new Set();
+
+for (const sector of SECTORS) {
+  const palette = sector.palette;
+  if (!palette || typeof palette !== 'object') {
+    issues.push(`${sector.id}: missing palette block`);
+    continue;
+  }
+
+  for (const field of REQUIRED_FIELDS) {
+    if (!(field in palette)) issues.push(`${sector.id}: palette missing ${field}`);
+  }
+  for (const field of COLOR_FIELDS) {
+    if (!isColorHex(palette[field])) issues.push(`${sector.id}: palette.${field} must be a 0x000000-0xffffff number`);
+  }
+  if (!Number.isFinite(palette.fogDensity) || palette.fogDensity <= 0) {
+    issues.push(`${sector.id}: palette.fogDensity must be a positive finite number`);
+  }
+
+  const className = classNameForPalette(palette);
+  if (!className) issues.push(`${sector.id}: palette does not match an authored class`);
+  else usedClasses.add(className);
+
+  const luminance = combinedLightLuminance(palette);
+  if (luminance < MIN_LUMINANCE || luminance > MAX_LUMINANCE) {
+    issues.push(`${sector.id}: ambient+fill luminance ${luminance.toFixed(4)} outside ${MIN_LUMINANCE.toFixed(4)}-${MAX_LUMINANCE.toFixed(4)}`);
+  }
+}
+
+for (const [className] of CLASS_ENTRIES) {
+  if (!usedClasses.has(className)) issues.push(`palette class unused: ${className}`);
+}
+
+if (issues.length) {
+  console.error(`Sector palette check failed (${issues.length} issue${issues.length === 1 ? '' : 's'}):`);
+  for (const issue of issues) console.error(`- ${issue}`);
+  process.exit(1);
+}
+
+console.log(`Sector palettes OK: ${SECTORS.length} sectors, classes used: ${[...usedClasses].sort().join(', ')}`);
+
+function classNameForPalette(palette) {
+  for (const [className, classPalette] of CLASS_ENTRIES) {
+    if (samePalette(palette, classPalette)) return className;
+  }
+  return null;
+}
+
+function samePalette(a, b) {
+  return REQUIRED_FIELDS.every((field) => a[field] === b[field]);
+}
+
+function isColorHex(value) {
+  return Number.isInteger(value) && value >= 0x000000 && value <= 0xffffff;
+}
+
+function combinedLightLuminance(palette) {
+  return relativeLuminance(palette.ambient) + relativeLuminance(palette.fill);
+}
+
+function relativeLuminance(hex) {
+  const r = linearRgb((hex >> 16) & 0xff);
+  const g = linearRgb((hex >> 8) & 0xff);
+  const b = linearRgb(hex & 0xff);
+  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
+}
+
+function linearRgb(channel) {
+  const c = channel / 255;
+  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
+}
diff --git a/src/data/sectors.js b/src/data/sectors.js
index 9c63f69479b241fc848258e3fe2161547793fa46..1814c409089f818b6ab4758b3f0cf8f8531f2452
--- a/src/data/sectors.js
+++ b/src/data/sectors.js
@@ -10,10 +10,30 @@
 export const HAZARD_TYPES  = ['dense_asteroid', 'nebula', 'radiation', 'debris'];
 export const POI_TYPES     = ['beacon', 'derelict', 'cache', 'colony', 'anomaly', 'wormhole', 'wreck'];
 
+export const SECTOR_PALETTE_CLASSES = {
+  core: {
+    key: 0xcfe2ff, rim: 0x6a5cff, fill: 0x39d0ff, ambient: 0x42506f,
+    fog: 0x0a1430, fogDensity: 0.00026, nebulaTint: 0x1e3a6a, dust: 0x7ea7c7,
+  },
+  belt: {
+    key: 0xffd59a, rim: 0xb56d2f, fill: 0xffb13d, ambient: 0x594a42,
+    fog: 0x2a160c, fogDensity: 0.00034, nebulaTint: 0x8a4a1e, dust: 0xc0793d,
+  },
+  fringe: {
+    key: 0xffb07a, rim: 0xff3f2d, fill: 0xffaa66, ambient: 0x584343,
+    fog: 0x2a0d0a, fogDensity: 0.00042, nebulaTint: 0x8a1e1e, dust: 0xc15032,
+  },
+  anomaly: {
+    key: 0xc8b6ff, rim: 0x54ffb0, fill: 0x4ddc92, ambient: 0x494760,
+    fog: 0x160d2c, fogDensity: 0.00036, nebulaTint: 0x5a1e8a, dust: 0x79ffc8,
+  },
+};
+
 export const SECTORS = [
   {
     id: 'sector_helios_prime', name: 'Helios Prime', tier: 0, security: 0.98, charted: true,
     factionId: 'faction_scn', position: { x: 0, y: 0 }, worldRadius: 3500,
+    palette: SECTOR_PALETTE_CLASSES.core,
     // Tutorial home sector: NO hostile spawns (enemyDensity 0). A brand-new pilot must not be
     // hunted before learning the ropes; danger ramps up only in neighbouring sectors.
     trafficPerMin: 18, enemyDensity: 0, enemyLevel: [1, 2],
@@ -37,6 +57,7 @@
   {
     id: 'sector_ceres_belt', name: 'Ceres Belt', tier: 1, security: 0.72, charted: true,
     factionId: 'faction_dmc', position: { x: -3, y: 2 }, worldRadius: 4200,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 10, enemyDensity: 0.18, enemyLevel: [2, 4],
     neighbors: ['sector_helios_prime', 'sector_tethys_junction', 'sector_pallas_drift'],
     stations: [
@@ -57,6 +78,7 @@
   {
     id: 'sector_tethys_junction', name: 'Tethys Junction', tier: 1, security: 0.65, charted: true,
     factionId: 'faction_mts', position: { x: 3, y: 2 }, worldRadius: 4000,
+    palette: SECTOR_PALETTE_CLASSES.core,
     trafficPerMin: 14, enemyDensity: 0.20, enemyLevel: [2, 4],
     neighbors: ['sector_helios_prime', 'sector_ceres_belt', 'sector_vesta_forge', 'sector_io_reach'],
     stations: [
@@ -72,6 +94,7 @@
   {
     id: 'sector_vesta_forge', name: 'Vesta Forge', tier: 1, security: 0.60, charted: true,
     factionId: 'faction_dmc', position: { x: 0, y: 4 }, worldRadius: 4300,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 9, enemyDensity: 0.25, enemyLevel: [3, 5],
     neighbors: ['sector_helios_prime', 'sector_tethys_junction', 'sector_charon_expanse'],
     stations: [
@@ -89,6 +112,7 @@
   {
     id: 'sector_pallas_drift', name: 'Pallas Drift', tier: 2, security: 0.42, charted: true,
     factionId: 'faction_mts', position: { x: -5, y: 5 }, worldRadius: 4500,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 7, enemyDensity: 0.40, enemyLevel: [4, 7],
     neighbors: ['sector_ceres_belt', 'sector_io_reach', 'sector_sker_haven'],
     stations: [
@@ -109,6 +133,7 @@
   {
     id: 'sector_io_reach', name: 'Io Reach', tier: 2, security: 0.35, charted: true,
     factionId: 'faction_free', position: { x: 5, y: 5 }, worldRadius: 4600,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 5, enemyDensity: 0.50, enemyLevel: [5, 8],
     neighbors: ['sector_tethys_junction', 'sector_pallas_drift', 'sector_charon_expanse', 'sector_veil_nebula'],
     stations: [
@@ -132,6 +157,7 @@
   {
     id: 'sector_charon_expanse', name: 'Charon Expanse', tier: 2, security: 0.30, charted: true,
     factionId: 'faction_dmc', position: { x: 2, y: 7 }, worldRadius: 4800,
+    palette: SECTOR_PALETTE_CLASSES.belt,
     trafficPerMin: 4, enemyDensity: 0.50, enemyLevel: [5, 9],
     neighbors: ['sector_vesta_forge', 'sector_io_reach', 'sector_ashfall_reach'],
     stations: [
@@ -151,6 +177,7 @@
   {
     id: 'sector_sker_haven', name: 'Sker Haven', tier: 3, security: 0.08, charted: false,
     factionId: 'faction_reach', position: { x: -7, y: 8 }, worldRadius: 5000,
+    palette: SECTOR_PALETTE_CLASSES.fringe,
     trafficPerMin: 0, enemyDensity: 0.70, enemyLevel: [7, 11],
     neighbors: ['sector_pallas_drift', 'sector_veil_nebula'],
     stations: [
@@ -169,6 +196,7 @@
   {
     id: 'sector_veil_nebula', name: 'Veil Nebula', tier: 3, security: 0.12, charted: false,
     factionId: 'faction_free', position: { x: 7, y: 9 }, worldRadius: 5200,
+    palette: SECTOR_PALETTE_CLASSES.anomaly,
     trafficPerMin: 0, enemyDensity: 0.65, enemyLevel: [8, 12],
     neighbors: ['sector_io_reach', 'sector_sker_haven'],
     wormholeTo: { sectorId: 'sector_ashfall_reach', gatedBy: 'tech:tech_long_range_survey' },
@@ -188,6 +216,7 @@
   {
     id: 'sector_ashfall_reach', name: 'Ashfall Reach', tier: 4, security: 0.05, charted: false,
     factionId: 'faction_vael', position: { x: 4, y: 11 }, worldRadius: 5500,
+    palette: SECTOR_PALETTE_CLASSES.anomaly,
     trafficPerMin: 0, enemyDensity: 0.80, enemyLevel: [10, 15],
     neighbors: ['sector_charon_expanse'],
     stations: [
diff --git a/src/render/renderer.js b/src/render/renderer.js
index def6420ff1bff2ac1c64dcc1add395e7851c4dbc..7b83534145db2cec91608a3a2a42dfe1ec083a9d
--- a/src/render/renderer.js
+++ b/src/render/renderer.js
@@ -15,21 +15,10 @@
 import { installDiagnostics } from './diagnostics.js';
 import { createPlanetFactory } from './planetFactory.js';
 import { precompilePipelines } from './precompile.js';
-
-// Map a sector's danger/tier to a nebula backdrop tint so each region of the galaxy has its own
-// color signature. Core (safe, low tier) = clean blue; industrial mid-ring = rust/amber; lawless
-// frontier = blood-red; alien/endgame tier 4+ = violet. Returns a hex string or null (default).
-function sectorNebulaTint(sector) {
-  if (!sector) return null;
-  const tier = sector.tier || 0;
-  const sec = sector.security != null ? sector.security : 1;
-  const danger = (1 - sec) + tier * 0.15; // blended danger metric
-  if (tier >= 4) return '#5a1e8a';        // violet — alien / lawless endgame (Veil, Ashfall)
-  if (danger > 0.7) return '#8a1e1e';     // blood-red — dangerous frontier (Io Reach, Sker)
-  if (danger > 0.45) return '#8a4a1e';    // rust/amber — industrial mid-ring (Vesta, Pallas)
-  if (danger > 0.2) return '#1e4a8a';     // deep blue — settled belt (Ceres, Tethys)
-  return '#1e3a6a';                        // clean blue — safe core (Helios Prime)
-}
+import { SECTOR_PALETTE_CLASSES } from '../data/sectors.js';
+
+const SECTOR_PALETTE_LERP_SECONDS = 1.5;
+const SECTOR_LIGHT_INTENSITIES = { ambient: 0.85, key: 1.7, rim: 0.7, fill: 0.35 };
 
 // ---- contact shadow disc (module-level cache so one texture serves all entities) ----------------
 let _shadowTex = null;
@@ -178,14 +167,15 @@
     renderer.setClearColor(0x060912, 1);
     const drawSize = applyRendererSize(renderer, state);
 
-    const scene = new THREE.Scene();
-    // Thin fog for gentle depth cueing only — the old 0.00085 erased the entire backdrop, leaving a
-    // black void. This keeps the nebula + far stars visible while still fading the deep distance.
-    scene.fog = new THREE.FogExp2(0x0a1430, 0.00026);
-    scene.add(new THREE.AmbientLight(0x42506f, 0.85));
-    const key = new THREE.DirectionalLight(0xcfe2ff, 1.7); key.position.set(60, 140, 40); scene.add(key);
-    const rim = new THREE.DirectionalLight(0x6a5cff, 0.7); rim.position.set(-70, 50, -60); scene.add(rim);
-    const fill = new THREE.DirectionalLight(0x39d0ff, 0.35); fill.position.set(20, 30, 120); scene.add(fill);
+    const scene = new THREE.Scene();
+    const corePalette = SECTOR_PALETTE_CLASSES.core;
+    // Thin fog for gentle depth cueing only — the old 0.00085 erased the entire backdrop, leaving a
+    // black void. This keeps the nebula + far stars visible while still fading the deep distance.
+    scene.fog = new THREE.FogExp2(corePalette.fog, corePalette.fogDensity);
+    const ambient = new THREE.AmbientLight(corePalette.ambient, SECTOR_LIGHT_INTENSITIES.ambient); scene.add(ambient);
+    const key = new THREE.DirectionalLight(corePalette.key, SECTOR_LIGHT_INTENSITIES.key); key.position.set(60, 140, 40); scene.add(key);
+    const rim = new THREE.DirectionalLight(corePalette.rim, SECTOR_LIGHT_INTENSITIES.rim); rim.position.set(-70, 50, -60); scene.add(rim);
+    const fill = new THREE.DirectionalLight(corePalette.fill, SECTOR_LIGHT_INTENSITIES.fill); fill.position.set(20, 30, 120); scene.add(fill);
 
     // Real shadow maps (graphics spec Workstream G). Gated behind settings.video.shadows (default
     // true). The key light becomes a shadow caster with a tight frustum that follows the player so
@@ -210,7 +200,7 @@
     }
 
     const cam = createChaseCamera(state);
-    const starfield = createStarfield(scene);
+    const starfield = createStarfield(scene, { tint: corePalette.nebulaTint });
     const vf = createVisualFactory();
     // Hero-asset registry (spec §17.3): wraps the factory's build() so the bespoke player Kestrel is
     // intercepted before the procedural visualFactory. Narrow + failure-isolated — any throw falls
@@ -283,13 +273,16 @@
     // contact-sheet references and are replaced by procedural materials / inline SVG).
     { const i = new Image(); i.src = 'assets/cinematics/menu_background.jpg'; }
 
-    this.renderer = renderer; this.scene = scene; this.cam = cam; this.starfield = starfield; this.vf = vf;
-    this.authoredPartLibraryReady = preloadAuthoredPartLibrary(renderer).catch((error) => {
-      console.warn('[render] authored part library preload failed', error);
-      return null;
-    });
-    state.render.authoredPartLibraryReady = this.authoredPartLibraryReady;
-    this._keyLight = shadowsOn ? key : null; // referenced by _updateShadowFollow() each frame
+    this.renderer = renderer; this.scene = scene; this.cam = cam; this.starfield = starfield; this.vf = vf;
+    this.authoredPartLibraryReady = preloadAuthoredPartLibrary(renderer).catch((error) => {
+      console.warn('[render] authored part library preload failed', error);
+      return null;
+    });
+    state.render.authoredPartLibraryReady = this.authoredPartLibraryReady;
+    this._sectorPaletteRig = createSectorPaletteRig(scene, ambient, key, rim, fill);
+    this._sectorPaletteTarget = corePalette;
+    state.render.sectorPalette = corePalette;
+    this._keyLight = shadowsOn ? key : null; // referenced by _updateShadowFollow() each frame
     this._shadowSettingOn = shadowsOn;
     this._shadowReceiversDirty = true;
     this._shadowReceiverCount = 0;
@@ -410,20 +403,19 @@
     // already spawned by the time this fires (enterSector spawns before its sector:enter resolves),
     // so a blind clearAllMeshes(keepPlayer) used to wipe the station/asteroids and leave the player
     // alone in empty space. reconcileMeshes() removes only meshes for entities that are gone.
-    bus.on('sector:enter', ({ sector } = {}) => {
-      this._meshReconcileDirty = true;
-      if (cam.snapToPlayer) cam.snapToPlayer();
-      this._updatePlanetBodies(sector);
-      // Tint the nebula backdrop to the sector's mood so each region of the galaxy reads with its
-      // own color signature: clean-blue core → rust/amber industrial → blood-red frontier → violet
-      // alien/endgame. Drives the whole-frame atmosphere, reinforcing the core-to-frontier gradient.
-      if (this.starfield && this.starfield.setSectorTint) {
-        this.starfield.setSectorTint(sectorNebulaTint(sector));
-      }
+    bus.on('sector:enter', ({ sector } = {}) => {
+      this._meshReconcileDirty = true;
+      if (cam.snapToPlayer) cam.snapToPlayer();
+      this._updatePlanetBodies(sector);
+      this._beginSectorPaletteTransition(sector);
       this._updateHazardVisuals(sector);
       precompilePipelines(renderer, scene, cam.obj, { sector }).catch((error) => console.warn('[render] sector pipeline precompile failed', error));
     });
-    bus.on('save:loaded', () => { this._meshReconcileDirty = true; });
+    bus.on('jump:arrive', ({ sectorId } = {}) => {
+      const sector = sectorId && state.world && state.world.sectors ? state.world.sectors[sectorId] : null;
+      this._beginSectorPaletteTransition(sector);
+    });
+    bus.on('save:loaded', () => { this._meshReconcileDirty = true; });
 
     window.addEventListener('resize', () => this.onResize());
   },
@@ -640,7 +632,7 @@
     return tex;
   },
 
-  _updateHazardVisuals(sector) {
+  _updateHazardVisuals(sector) {
     // Dispose previous hazard visuals
     for (const obj of this._hazardVisuals) {
       this.scene.remove(obj);
@@ -701,10 +693,42 @@
         this.scene.add(ring);
         this._hazardVisuals.push(ring);
       }
-    }
-  },
-
-  prepareFrame(alpha, frameDt) {
+    }
+  },
+
+  _beginSectorPaletteTransition(sector) {
+    const rig = this._sectorPaletteRig;
+    if (!rig) return;
+    const palette = sector && sector.palette ? sector.palette : SECTOR_PALETTE_CLASSES.core;
+    this.state.render.sectorPalette = palette;
+    if (palette === this._sectorPaletteTarget) return;
+
+    this._sectorPaletteTarget = palette;
+    writeRigToSectorPaletteFrame(rig.start, rig);
+    writePaletteToSectorPaletteFrame(rig.target, palette);
+    rig.elapsed = 0;
+    rig.active = true;
+
+    if (this.starfield && this.starfield.setSectorTint) {
+      this.starfield.setSectorTint(palette.nebulaTint);
+    }
+  },
+
+  _updateSectorPaletteTransition(frameDt) {
+    const rig = this._sectorPaletteRig;
+    if (!rig || !rig.active) return;
+    const dt = Number.isFinite(frameDt) ? Math.max(0, frameDt) : 0;
+    rig.elapsed = Math.min(SECTOR_PALETTE_LERP_SECONDS, rig.elapsed + dt);
+    const rawT = SECTOR_PALETTE_LERP_SECONDS > 0 ? rig.elapsed / SECTOR_PALETTE_LERP_SECONDS : 1;
+    const t = rawT * rawT * (3 - 2 * rawT);
+    lerpSectorPaletteFrame(rig, rig.start, rig.target, t);
+    if (rawT >= 1) {
+      rig.active = false;
+      applySectorPaletteFrame(rig, rig.target);
+    }
+  },
+
+  prepareFrame(alpha, frameDt) {
     // While the GL context is lost, the renderer can't draw — skip all per-frame work until
     // webglcontextrestored rebuilds GPU resources. (cam.follow etc. would run against a dead
     // renderer; the context-restore handler re-applies everything that matters when it returns.)
@@ -716,9 +740,10 @@
     syncAuthoredInstancePools(this.scene, { camera: this.cam.obj });
     this.starfield.recenter(this.cam.obj.position);
     // Background-clock for distant animation (planet cloud drift, hero-star twinkle). Integrates real
-    // frame dt scaled by state.timeScale so the cosmos respects hit-stop/pause — a death freeze
-    // momentarily stills the clouds too, keeping the backdrop in the same time model as the action.
-    const ts = (this.state.timeScale != null) ? this.state.timeScale : 1;
+    // frame dt scaled by state.timeScale so the cosmos respects hit-stop/pause — a death freeze
+    // momentarily stills the clouds too, keeping the backdrop in the same time model as the action.
+    this._updateSectorPaletteTransition(frameDt);
+    const ts = (this.state.timeScale != null) ? this.state.timeScale : 1;
     this._bgTime = (this._bgTime || 0) + frameDt * ts;
     if (this.starfield.update) this.starfield.update(frameDt, this._bgTime);
     this._updatePlanetParallax();
@@ -899,13 +924,97 @@
   return renderer.getDrawingBufferSize(_drawSize);
 }
 
-function finiteInRange(value, min, max, fallback) {
-  const n = Number(value);
-  if (!Number.isFinite(n)) return fallback;
-  return Math.max(min, Math.min(max, n));
-}
-
-function disposeObject(obj) {
+function finiteInRange(value, min, max, fallback) {
+  const n = Number(value);
+  if (!Number.isFinite(n)) return fallback;
+  return Math.max(min, Math.min(max, n));
+}
+
+function createSectorPaletteRig(scene, ambientLight, keyLight, rimLight, fillLight) {
+  const rig = {
+    scene,
+    lights: { ambient: ambientLight, key: keyLight, rim: rimLight, fill: fillLight },
+    start: createSectorPaletteFrame(),
+    target: createSectorPaletteFrame(),
+    elapsed: 0,
+    active: false,
+  };
+  writeRigToSectorPaletteFrame(rig.start, rig);
+  writeRigToSectorPaletteFrame(rig.target, rig);
+  return rig;
+}
+
+function createSectorPaletteFrame() {
+  return {
+    colors: {
+      ambient: new THREE.Color(),
+      key: new THREE.Color(),
+      rim: new THREE.Color(),
+      fill: new THREE.Color(),
+      fog: new THREE.Color(),
+    },
+    intensities: { ambient: 0, key: 0, rim: 0, fill: 0 },
+    fogDensity: 0,
+  };
+}
+
+function writeRigToSectorPaletteFrame(frame, rig) {
+  frame.colors.ambient.copy(rig.lights.ambient.color);
+  frame.colors.key.copy(rig.lights.key.color);
+  frame.colors.rim.copy(rig.lights.rim.color);
+  frame.colors.fill.copy(rig.lights.fill.color);
+  frame.colors.fog.copy(rig.scene.fog.color);
+  frame.intensities.ambient = rig.lights.ambient.intensity;
+  frame.intensities.key = rig.lights.key.intensity;
+  frame.intensities.rim = rig.lights.rim.intensity;
+  frame.intensities.fill = rig.lights.fill.intensity;
+  frame.fogDensity = rig.scene.fog.density;
+}
+
+function writePaletteToSectorPaletteFrame(frame, palette) {
+  frame.colors.ambient.setHex(palette.ambient);
+  frame.colors.key.setHex(palette.key);
+  frame.colors.rim.setHex(palette.rim);
+  frame.colors.fill.setHex(palette.fill);
+  frame.colors.fog.setHex(palette.fog);
+  frame.intensities.ambient = SECTOR_LIGHT_INTENSITIES.ambient;
+  frame.intensities.key = SECTOR_LIGHT_INTENSITIES.key;
+  frame.intensities.rim = SECTOR_LIGHT_INTENSITIES.rim;
+  frame.intensities.fill = SECTOR_LIGHT_INTENSITIES.fill;
+  frame.fogDensity = palette.fogDensity;
+}
+
+function applySectorPaletteFrame(rig, frame) {
+  rig.lights.ambient.color.copy(frame.colors.ambient);
+  rig.lights.key.color.copy(frame.colors.key);
+  rig.lights.rim.color.copy(frame.colors.rim);
+  rig.lights.fill.color.copy(frame.colors.fill);
+  rig.scene.fog.color.copy(frame.colors.fog);
+  rig.lights.ambient.intensity = frame.intensities.ambient;
+  rig.lights.key.intensity = frame.intensities.key;
+  rig.lights.rim.intensity = frame.intensities.rim;
+  rig.lights.fill.intensity = frame.intensities.fill;
+  rig.scene.fog.density = frame.fogDensity;
+}
+
+function lerpSectorPaletteFrame(rig, start, target, t) {
+  rig.lights.ambient.color.lerpColors(start.colors.ambient, target.colors.ambient, t);
+  rig.lights.key.color.lerpColors(start.colors.key, target.colors.key, t);
+  rig.lights.rim.color.lerpColors(start.colors.rim, target.colors.rim, t);
+  rig.lights.fill.color.lerpColors(start.colors.fill, target.colors.fill, t);
+  rig.scene.fog.color.lerpColors(start.colors.fog, target.colors.fog, t);
+  rig.lights.ambient.intensity = lerp(start.intensities.ambient, target.intensities.ambient, t);
+  rig.lights.key.intensity = lerp(start.intensities.key, target.intensities.key, t);
+  rig.lights.rim.intensity = lerp(start.intensities.rim, target.intensities.rim, t);
+  rig.lights.fill.intensity = lerp(start.intensities.fill, target.intensities.fill, t);
+  rig.scene.fog.density = lerp(start.fogDensity, target.fogDensity, t);
+}
+
+function lerp(a, b, t) {
+  return a + (b - a) * t;
+}
+
+function disposeObject(obj) {
   obj.traverse((c) => {
     if (c.isBatchedMesh && typeof c.dispose === 'function') c.dispose();
     else if (c.geometry && !(c.userData && (c.userData.sharedContactShadow || c.userData.sharedShieldGeo))) c.geometry.dispose();
diff --git a/src/render/starfield.js b/src/render/starfield.js
index d76965c563ac0d99166bb382577d2f6eaa4a6d0f..aecb37608592e6ff981ddaf8fd6107d17a0632e6
--- a/src/render/starfield.js
+++ b/src/render/starfield.js
@@ -116,10 +116,18 @@
   return c;
 }
 
-// --- small color helpers for sector tinting (no deps) ---
-function hexToRgb(hex) {
-  const h = hex.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
-}
+// --- small color helpers for sector tinting (no deps) ---
+function normalizeTint(tint) {
+  if (tint == null) return null;
+  if (typeof tint === 'number' && Number.isFinite(tint)) {
+    return '#' + ((tint >>> 0) & 0xffffff).toString(16).padStart(6, '0');
+  }
+  if (typeof tint === 'string') return tint.startsWith('#') ? tint : '#' + tint.replace(/^0x/i, '');
+  return null;
+}
+function hexToRgb(hex) {
+  const h = hex.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
+}
 function rgbToHex(r, g, b) {
   const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
   return '#' + c(r) + c(g) + c(b);
@@ -176,11 +184,11 @@
   ctx.restore();
 }
 
-export function createStarfield(scene, opts = {}) {
-  const layers = [];
-  const sprite = makeStarSprite();
-  let bgTexture = null;
-  let currentTint = opts.tint || null;
+export function createStarfield(scene, opts = {}) {
+  const layers = [];
+  const sprite = makeStarSprite();
+  let bgTexture = null;
+  let currentTint = normalizeTint(opts.tint);
 
   // star tints (mostly cool white/blue with a few warm + teal accents)
   const TINTS = [0xffffff, 0xcfe0ff, 0x9fb6e0, 0xfff0d8, 0x8af0d6, 0xbfd2ff];
@@ -297,13 +305,14 @@
       // GR-7: slow-rotate the distant 3D planets so they read as real spinning worlds, not billboards.
       for (const p of distantPlanets) p.mesh.rotation.y += dt * p.spin;
     },
-    // Swap the nebula mood on sector enter — each region of the galaxy reads with its own color
-    // signature (core = clean blue, industrial = rust/amber, frontier = blood-red, alien = violet).
-    setSectorTint(tint) {
-      if (tint === currentTint) return;
-      currentTint = tint || null;
-      applyBackground(currentTint);
-    },
+    // Swap the nebula mood on sector enter — each region of the galaxy reads with its own color
+    // signature (core = clean blue, industrial = rust/amber, frontier = blood-red, alien = violet).
+    setSectorTint(tint) {
+      const nextTint = normalizeTint(tint);
+      if (nextTint === currentTint) return;
+      currentTint = nextTint;
+      applyBackground(currentTint);
+    },
     setWarp() { /* extended by vfx during jump */ },
   };
 }

SUCCESS: The process with PID 18200 (child process of PID 28784) has been terminated.
SUCCESS: The process with PID 37684 (child process of PID 28784) has been terminated.
tokens used
152,444
Implemented WS-E2 in the requested files: sector palette classes/assignments, 1.5s renderer light/fog transitions, guarded nebula tint rebake, `state.render.sectorPalette`, and `check:sector-palettes`.

Verified: `npm run check:sector-palettes`, `node scripts/check-data.mjs`, and scoped `git diff --check` pass. The full requested chain reaches `npm run check:non-graphics` but fails repeatably in unrelated `scripts/check-sg02-tether-break.mjs` (`active` vs expected `broken`).


