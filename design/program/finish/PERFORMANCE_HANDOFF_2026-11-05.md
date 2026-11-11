> **HISTORY — not a source of work.** Superseded on 2026-11-11 by `design/program/fleet/QUEUE.md`
> (work) and `design/game/` (design). Read for background only; do not take tasks from this file.

# SpaceFace performance and whole-game handoff — November 5, 2026

**STOPPED at the owner's explicit request: “write a detailed handoff and stop.”** Recorded at14:23UTC. Do not resume development, launch games/agents, publish or deploy without a new instruction. This is a handoff, not release approval. The game remains unfinished.

## 1. Checkout, ownership and stop state

- Repo: `C:/Users/93rob/Documents/GitHub/SpaceFace`.
- Last observed HEAD: `71384b4fa8c6eb4a922359506868a395b4851bf5`, external “give the belt's dust a wind that says where you are.”
- Root-integrated private performance candidate: **`45b522f9b07f9482f9992871ed8e23865f98c062`**. It includes the earlier performance commits below. The later external wind change was not reviewed by this controller; do not silently substitute HEAD for this candidate.
- Local status: `master...origin/master [ahead 58]`, against the stored tracking ref, not fresh remote proof. No push/deployment during this stop/handoff.
- All native subagents report completed; relevant terminal logs contain completed turns. Some command wrappers did not report process exit. No process was killed to tidy status.
- The previous owned server57656 stopped responding after normal actor `quit`; context close precedes server close in cleanup. No next game launched.
- Preserve Chrome/VLC/ZCode/other agents/AnyDesk/Codex/MCP. Never kill, interrupt, disable or stop unrelated agents, executors, sessions or processes. No executor DB writes.
- Shared checkout: exact staging/ownership only. No reset/restore/clean/stash, broad staging, second checkout/worktree, rebase or force-push. Fetch+merge before eventual publication.

Latest owner priority before stopping: **smoothness first**, with barely noticeable graphical sacrifices allowed for worthwhile medium/big measured gains. Preserve authored identity, critical cues, accessibility and physical authority. Older blanket quality/asset prohibitions are not current policy.

## 2. Outcome and limits of this batch

Source and focused invariants are ahead of the last played build. **No new FPS improvement, overall smoothness target, physical-iPhone fix or visual acceptance of the new quality tradeoffs has been established.** Counts/tests/worker agreement do not establish those claims.

| Commit | Implemented result | Direct check | Still open |
|---|---|---|---|
| `eda021f1214b` | Retain compatible rigid opaque batches while depth consumers are proven off; synchronously restore direct sources before shadow use/warm |65 relevant batch/shadow/lifetime checks passed, including formerly hanging supersession |20 actual ejected instances observed, not512 recoverable fallbacks; sustained duty/time unknown |
| `26c18a24b88e` | NPC fleet plume low tier:2layers/3segments vs4/5 on captured medium setting; player plasma retains selected quality |Focused production fleet/loading/a11y checks passed |Changed picture/time unverified |
| `74c9aa750695` | Exact authored Dart/Rig distance tiers, releases, packages and file mappings |Real source/selector/geometry/socket/collision/encoding checks; original base bytes unchanged |Geometry savings are not draw/FPS savings; multiple tiers increase residency |
| `9dec955de450` | HUD transient changes retain structural plate geometry; per-flush reads survive unrelated fixed-overlay writes; settled caption caps stop toggling |51 HUD/attention/owner checks passed |Ordinary look/browser layout/time unknown |
| `9e2fe6072f41` | Skip repeated drive work and surface scans after engine wash already emitted in400ms slot |6 exact original/current adapter +11 neighbor checks; same emissions/slot book/dash latch/RNG |Elapsed speed gain unknown; removed work established |
| `3ca72fcb063f` | **Private trial:** ordinary ice/gas/live-spent prism reflective alpha instead of screen refraction |6 factory/pool/reversal +12 neighbor checks |Alpha can lose opaque pooling; another glass object can retain full extra pass; close/large-body look unknown |
| `45b522f9b07f` | Initial/live ordinary-ship LOD, hidden prepare, protected promotion, actual tier/retry ownership; scoped pool cleanup and geometry identities |Focused projection/admission/family/pool/lifetime cases passed |No changed-candidate ordinary flight or performance run |

These are local commits, not public deployment. Poor quality/cost tradeoffs should be tuned or withdrawn after relevant live checks.

## 3. Asset work and exact ship tiers

Completed pre-change inventory:419release assets/353families, disjoint shards138/144/137assets. Do not redo that census. Four sibling releases were subsequently added;419 is not a current post-addition count.

| Body | Visible LOD0 triangles | LOD1 | LOD2 | Released sibling bytes1/2 |
|---|---:|---:|---:|---:|
| Dart, actual `wasp_swarmer` |24,316|9,735|3,937|475,072/404,784|
| Rig, actual `reaver_pirate` among others |23,857|9,525|3,891|491,300/419,176|

Each sibling has14visible mesh leaves plus collision. They are extracted from their own authored lower tiers, not substituted Wasp hulls. Preserve Dart warning and Rig livery, sockets, motion hooks, texture bytes, selected geometry/transforms and native collision. Whole-scene envelope drift is at most0.002210source units; live fitting is not accepted as bit-identical. Original base source/release bytes remain unchanged.

Committed: four new `ashline_{dart,rig}_lod{1,2}.glb` authored sources and releases; four `ashline-{dart,rig}-lod{1,2}` package directories; scoped parts/release/pilot/runtime manifest rows; exact file mappings in `wholeShipVisualIdentity.js`; reproducible `scripts/extract-ashline-authored-lods.mjs`.

Artifacts under `.devshots/finish/integration-2026-11-04/asset-performance-scout/hot-ship-lods/`: REQUEST.md, INTEGRATED.md, integration-hashes.json, lod-pool-fix-hashes.json. Ignored artifacts are local and will not automatically travel with a clone.

### Policy and lifecycle in45b522

Safe ordinary non-player ships with exact packaged siblings only. Conservative CSS-pixel diameter: initialLOD2<32px,LOD1<96px,otherwiseLOD0. Hysteresis96/128 and32/56;1.5s dwell; two noncritical swaps/10s. Urgent near/protectedLOD0 promotion bypasses delay. Player/hero/boss/interactive/mission protection retained; other body classes retain existing policy.

Recent exact-boundary camera/viewport sample selects initial tier and carries it through preload/composition/priming; publication rechecks safety, identity and context and retriesLOD0 if unsafe. Later exact-sibling preparation is hidden; visible root stays until ready. Desired tier is separate from actual presented tier. Epoch/generation/residency/identity/palette/projection guards reject stale results. Retry is bounded, not a decode per frame.

### Integration defects fixed before commit

1. New siblings initially lost retained batching because the renderer only accepted base URL/hash. Four exact sibling URL/package/content identities now admit the same verified motion bank; wrong hash/bank/URL/stale generation still rejects.33planner/LOD cases and7motion cases passed. Two stale readiness fixtures now use actual ready-flight state, retaining assertions; combined cohort43/43 passed.
2. Independent review found abandoned async siblings retained boundary-owned pool slots/candidates. Each composition now owns a live release-handle set, drained/unregistered on abandonment/retirement/partial failure. Never release the whole boundary, which also owns visible and retained siblings. Actual package tests cover approach/protection cancellation, prepare error, late completion, parked candidate, retry and other-owner survival.
3. LOD geometry could alias: original key used assetId+mesh name, both intentionally preserved across tiers. All four stamp sites now include exact sourceURL+package content hash. Distinct tiers make distinct pools; identical exact source still shares.
4. Three tests falsely required Dart to lack a family. They now assert exact rebinding; a real boss/ineligible case retains uninstall coverage.

Review: `.devshots/finish/integration-2026-11-04/lod-admission-review/REVIEW.md`. Its findings were fixed; it predates the repair and is not a current rejection. Root read the relevant fix/source; no further review quota is required. Focused reports: LOD/family19/19, initialadmission4/4, actual package lifetime cases passed including final6/6 after partial-failure refinement, pool disposal/twin7/7. Per-worker test hashes predate root's line-ending-only normalization of authored-entity-plan-budget; committed bytes are authoritative.

## 4. Fresh actual profile and play

Last actually played source: **bad06a4b250a2cec39268551698989321af71971**. Strict all-runtime plus10committed assets; overlay `4798840bcdd35acb8b51c1849c377126f45e56f87be81114a19f74ae46e189f3`.

Headed installed Chrome, Intel integrated ANGLE/D3D11, software=false,1440×900. Evidence directory:

`.devshots/finish/integration-2026-11-04/swarm-combat-next/captures/2026-11-05T13-29-19-015Z-37440/`

`active-burst.cpuprofile` samples10.556s: ordinary alive3.5sW/fire thenW+D/fire, two screenshots and sampling overhead, ending publicPause. **Not uninstrumentedFPS, GPUtime or matched before/after.** Root summary: parent `swarm-combat-next/main-profile-summary.json`. Inclusive costs overlap:

- scene rendering2639ms/~25%wall samples;
- transmission pass1073ms/~10.17%, rendering opaque scene again;
- UI-root~924ms; rectangle reads252.8msself, actual receipt/objective/stunt owners, not merely screenshot DOM;
- VFX across stacks~760ms; enginewash194ms; force-particle wrapper192ms, nested update153ms and material advance138ms;
- current guard inclusive time includes draws underneath; do not treat old October12.5%unready-guard share as current removable overhead.

Actual Auto/Intel diagnostics show scale1/full content and CASoff. Auto is enabled and needs sustained eligible visible/unpaused flight for a trial; short paused/screenshot-interrupted play does not show if a trial ran or1was earned. No justified adaptive edit. `adaptive-quality-current/RESULT.md`.

### Ordinary player outcomes

- Trusted bounded bursts/publicPause, not unattended damage loops.
- Round1 cleared; actual HUD score331 then520, showing pointer-scoring repair reaches play, not explaining all historical score0 cases.
- Armory opened with1018runcredits, next enemy info, service/loadout/Fortify. Root opened0049-burst-frame.png.
-2credit patch produced “Patched +2 hull.”
- Normal next-round→Pause→EndRun→Retire. Captured UI text: retiredwave2/unranked/240banked/no draft. This is not natural defeat or boss victory.
- **0058-view.png still shows Pause, while following DTO contains debrief text.** Retirement DOM route passed; debrief appearance remains unverified. Future capture waits for actual public target screen. No rerun merely for a screenshot quota.
- Last Wasp hard to acquire among asteroids near/off top edge; real readability concern, not a balance verdict.
- Root opened0010/0011: busy dense combat, large repeated stunt text, rocks/props and red markers/yellow player. White forms were not attributed to a material bug.

One read-only actual Wasp life224/gen161 showed real Dart package, packed-ORM hook/token on armor/metal, compressed albedo+ORM with11mips and identical ORM channel textureUUIDs. Shield source invisible/flash0/base0. Private retained instance color and final pixel contribution unavailable; do not infer them from material color. Preserve earned QA profile.

## 5. Refraction quality trial and unresolved comparison

NPC canopy hypothesis was corrected: authored canopies already become transmission0 during preparation. Ordinary sources include four Foundry diamond fuse cells, ice/gas and generic glass. Actual remaining render-list triggers still need the next census.

3ca72 trial changes four shared ordinary constructor families: icealpha cap.72,gas.70,liveprism.70,spent.88, preserving any lower original alpha. Physical class, tint/maps/specular/roughness/clearcoat/iridescence, live/spent emissions, hooks, geometry and simulation stay. Screen-space volumetric bending is lost. Authored ship/player/station paths stay separate, but large procedural ice/gas also change.

Original parameters are in `userData.spacefaceTransmissionBudget.original`. Scalar restoration **does not restore original opaque instance-pool admission**: alpha ice/prisms add ordinary draws. Another transmission>0material retains the full extra scene pass. Either may defeat the win.

Next read-only observer: `transmission-budget/observe-transmission.mjs`, SHA256 `82c4402ade2bc7580acd73e6bc9078024adf98701933e638acec01f39ee9136a` (under this dated integration directory). Reads actual scene/depth0 list, visible/camera layers and budget families/optic identity; no draw/movement/quality/state mutation. Earlierdc44hash superseded.

**A runnable comparison helper was NOT produced.** `quality-render-compare` worker could not establish bounded safe warm-both-variants/cleanup through async compileObjectPipelines. Changing fleet options while paused also does not update plume presentation without VFX update. No USAGE/helper exists to assume. No unwarmed A/B or alternate hidden render-path substitute was used. First actual trigger/duty and picture; tune/withdraw poor tradeoffs. Timing claims need matched relevant-layer measurement, not a new profile alone.

## 6. Next actor prepared, NOT launched

`.devshots/finish/integration-2026-11-04/swarm-combat-coherent-next/` contains actor.mjs, asset-paths.txt, make-pin.cjs, PREP.md. Fresh isolated profile; no generic evaluator.22required assets=old10+fournewLODsourceGLBs+eightpackagefiles. Strict builder verifies committed bytes, package/source/content bindings and runtime isolation. Syntax checks passed; all22paths existed; **no pin captured/validated and no next game launched**.

ActorSHA `f959f1b4fb1aa9272a529783c5d7c9b69114cf70c79a18abf8ddb44b2ce658bd`; builderSHA `3545b3e38412e1e76d734db7be587893fce1de3a1ecfbb40849d132ad1cec71d`.

Future commands ONLY after a new resume instruction and exact reviewedSHA:

```powershell
node scripts/create-source-baseline.mjs --commit=<FULL_SHA> --all-runtime --out=.devshots/finish/integration-2026-11-04/swarm-combat-coherent-next/runtime.json
node scripts/create-source-baseline.mjs --commit=<FULL_SHA> --paths-file=.devshots/finish/integration-2026-11-04/swarm-combat-coherent-next/asset-paths.txt --out=.devshots/finish/integration-2026-11-04/swarm-combat-coherent-next/assets.json
node .devshots/finish/integration-2026-11-04/swarm-combat-coherent-next/make-pin.cjs <FULL_SHA>
$env:SWARM_APPROVED_COMMIT='<FULL_SHA>'
node .devshots/finish/integration-2026-11-04/swarm-combat-coherent-next/actor.mjs --pin=.devshots/finish/integration-2026-11-04/swarm-combat-coherent-next/pin.json
```

OneGPU/inputowner. Do not let sibling requests escape frozen assets or working-tree code leak into a committed pin. A read-only gitshow wrapper had not returned; no process killed.45b522 is root-integrated; HEAD additionally includes unreviewed external work.

## 7. Closed or negative investigations — do not repeat unchanged

- **AI NAV sharing:** real465frame sharing and full300tick canonical/native/AI/RNG/event parity, but no useful time gain. AI6.866→9.958ms/frame29.908→39.822ms with host33.47→52.13%busy establishes neither a win nor isolated causal regression. Seven original files restored byte-identically; owned helper/test removed under hash guard. `ai-cadence-finish/NAV_DISPOSITION.md` is final.
- **Contact dropping/coalescing:** native compound positive-force pairs already merged. Zero/low closing is not a safe deletion rule; micro-motion and chain need contributions. Audio/sparks already reject repeat low contacts early. No substantial lossless-transport gain established. `contact-dispatch-cost/REQUEST.md`.
- **Same-motion/material Dart/Rig merge:** current source has one mesh per material per LOD, no eligible pairs. Ignored27.3%LOD0triangle-only simplification is unaccepted, not production. Do not overwrite new exact authored tiers or alter their pins for this prototype.
- **Rare static barge:** ignored196→18primitive/142→1mesh candidate, triangles unchanged, WreckCourt-only; normal composition already batches. Not a normal-fight win.
- **Tiny Wasp/Corsair simplification:** small triangle-only savings/no draw gain/files grew. Not separately qualified.
- **Force-particle interpolation:** withdrawn because fractional offsets differ. Sharing quintic interpolation terms changes the curl field. No source/test changes.120Hz cosmetic integration also owns contact/history/reconstruction; halving it is a separate explicitly qualified motion tradeoff, not invariant optimization. `force-particle-budget/HANDOFF.md`.
- **Auto scale1:** no missed application demonstrated. Do not force lower quality merely to produce an edit.

## 8. Earlier work already integrated

Do not lose or re-investigate these without a new material failure:

| Commit | Result and important boundary |
|---|---|
| `6943d5268c97` | Encounter authored offer/wait context, exact target-life names, stale-click correlation, hidden unresolved refresh |
| `d79f80309801` | NEW explicitly versioned save-v23 references/selectors; oldgoldens byte-identical; old/new difference exactly metadata22→23, gameplay/events/metrics unchanged; both focused5repeat/reload commands pass |
| `4aa334d84edf` | Distinct entry-buoy/Mouth addresses, original tub chart/target/Line readers |
| `df437c69ac0f` | PR82562ad canonical hull/fit/ticket first-work preview |
| `152650c99974` | Finite24t original tub: tow intact or dismantle→25IronOre/20t, tombstone original; refusal/reentrant/cargo/market/lifecycle/cold cases pass. Loose ore ordinary90sTTL, not saved possession before collection |
| `95464db416fe` | Fracture birth: reproduced19.742u penetration/unearned260.584impulse→0/0/0; count/mass/spin/yield/sixRNGdraws unchanged. Not explanation of all crowd velocities/FPS |
| `59233ffcdd2c` | Debrief separates prior damage/recorded tell/unknown cause; purse/defeat-bank wording clarified, no payout change |
| `58b4da6e1440` | CPU texture leases end before texture-free geometry;63focused lifetime/error cases pass; actual RAM/boot/phone benefit unknown |
| `6a5397f2b7c7` | Fresh actual combat-stick pointer edge admits first worker scoring action; real host/ring/mirror check and current nonzero live score; old complete9kill/score0 cause only partially explained |
| `8d45097fc4e1` | Journal from Scale4 to posted Tethys Furnace Detail, correct active/completed retirement |
| `bad06a4b250a` | Common packed-ORM admission + actual Line/Kilnback clone-hook preservation; focused checks and live KTX2/hook observation, no measured GPU gain |

Persistence and finite-load slices are landed and out of the critical path. **No more Save/Continue or ore-tub loop.** Only reopen for an actual material player failure. Historical goldens must not be re-recorded to pass.

## 9. Remaining whole-game work and earned state

Still open: ordinary Ward arrival/work; Book4 and Weir/Breakwater/LastShift/Compost journeys; all seven Pallas courses/PBs/medals; later Swarm boss completion/feel; audio audition; performance targets; actual signed Electron old→new update; physical iPhone. Earlier six cleared Swarm rounds/Fortify/BankShot/livingKraken7 observation preceded a clock-freeze fix, not boss acceptance. EndRun/Cancel/Resume/Retry already passed earlier; no repeat to accumulate evidence.

Preserve exact earned exports (paths under existing dated integration evidence; locate exact file before use):

- Original wanted Ring: `continuation-next/ring-post-incident-public-export.json`, SHA256 `f21f262f7875061a8261a7095c1f79dbd63fd2d8151cfe95354548635a2306fb`,24scars/Edda,62.1583%hull/7.68%shield. Alleged pre-control damage was already input health, not a lifecycle defect. Never rewind to17-scar680dmarker.
- Separate beginner QA: `ring-ordinary-play/hardware-qualified-next/intel-beginner-paused-export.json`, SHA256 `4531c4ab45a61d60713f0bb935e826e2f0a9a624833591fec14dcc3a510961e3`,14scars/Rill. Not the original pilot.
- Pallas: `counterweight-ordinary/overlay-profile-c29b/pallas-public-export.json`, SHA256 `0469e80cfb7c440d9b183e57b2b68a626d9555c4395cc524f1df7781c4f16c4b`. `counterweight-next-route/retry.mjs` needs --save/hashguard; old actor using55c9input is wrong.
- Cinderglass actual final5809cr/onecomposite/cg47:1closed450once. No remint/regrant.

Some older files live in adjacent dated integration directories; do not substitute a similarly named export if a path is absent. The exact hashes are the identity.

Earlier Intel reverse/full-stop and matched paused CAS picture checks passed scoped observations, not full berth/tow journey orFPS. SourceU001–U072 coverage already complete; no whole-source re-census. Supplied171page PDF was already extracted/reconciled in Renaissance gap work; no wholesale reread as substitute for implementation.

### New external SWARM plans

While this performance batch ran, external authors landed `design/program/finish/swarm/README.md`, `AUDIT.md`, `PLANS.md`, baseline images and related Finish README amendments, culminating in `a3d3d087970a`. S1–S16 diagnose physics-demolition horde feel/configuration and broader experience. This controller did not implement/accept that entire new program. Reconcile its current requirements after resuming; preserve external ownership and current performance priority.

External later commits `c48c5c7e77eb` dock approach-speed guidance and `71384b4fa8c6` belt wind were not reviewed here. Do not silently attribute them to root's checked batch. Whole-game source coverage and exhausted older plan rows do not mean these product outcomes are finished.

## 10. Baseline, generated metadata and public/iPhone status

Last known public alias: `https://spaceface-play-demo.vercel.app/`, exactc4 production `dpl_F3Nths6P1qh8Rewqnmhp61AA8aTV`. Last verified receiptSHA256 `38bbef3dec4e2d8c5cf227d2bbdfc728cd482e91e6cb5c741f3c5a466105e67b`; output `9ad04a041375df289bbd14222a2762fcc5f8457b90e4cae57908ed87c9f2e204`. Not refreshed during stop; local new commits are NOT claimed deployed.

Desktop Windows WebKit flight28.800s and staged Powers/Pause/Resume24.593s passed on that older deployment. Stock probe maxTouchPoints0 fails. **Physical iPhone14 remains UNKNOWN. The owner's menu→no-game problem is not signed off.** Desktop emulation is not phone proof.

Generated metadata last recorded17efe matches6fb source, not new performance candidate. Its broad baseline15/17 took157.110s against90s. Two sim failures were exact22→23 reference issue fixed byd79f; separate wall-budget failure unresolved. No broad baseline for45b522. No repeated unchanged baseline was used to chase confidence.

After explicit resume/candidate decision: one coherent official catalog/preload/code-index/schema freshness generation and relevant baseline, then fetch+merge remote before eventual publication. Private immutable qualification can precede metadata generation; public release freshness cannot. Do not invent per-packet metadata/review/capture quotas.

## 11. PRs and extra Pro jobs

Last verified PR heads:825 `62adf5d93259` preview porteddf437;837 `e28e4ce2a496` merged501d/relevant task already current;840 `e4363226c1c9` Ward ported8398. Not a fresh census. Obsolete PR825 handoff claiming four campaign suites still fail is superseded by current HANDOFF and `finish/PR_INTEGRATION.md`.

Five extra ChatGPT Pro commissions remain **0/5 sent**: TuningForkArray, GlassreefGarden, WayfarerHouse, IonaVey, NacreSluice. Last actual regular ChatGPT Browser check07:40UTC Nov5: reachable/signed in, Chat selected, intended Pro selected, **usage locked**.5of5 denotes effort, not quota. No prompt/upload/billing change/substitute. Never Work/Thinking/Sol/another app. Read delegate-to-chatgpt skill/use actual regular browser only if later resuming. No busy retry of known locked account.

## 12. Exact dirty ownership at stop

Root-owned uncommitted documentation:

- `design/program/ASSET_PERFORMANCE_PROGRAM.md`
- `design/program/NOW.md`
- `design/program/finish/INTEGRATION_COVERAGE.md`
- `design/program/finish/PR_INTEGRATION.md`
- This new handoff.

Foreign dirty/untracked work observed before this write; preserve:

- `design/program/dominion/TICKETS.md`
- `design/program/inference-memory.json`
- `design/program/special-500/BUILD_LEDGER.json`
- `src/ui/orrery/flightCluster.js`
- `src/ui/orrery/hudAdapter.js`
- `src/ui/orrery/power-railLayouts.js`
- `design/program/velocity/` (untracked)
- `test/power-activation-hud.test.mjs` (untracked)

All root performance runtime source was committed at that snapshot. Other authors can change/commit after this report; inspect live exact diffs. No global lane lock. The root-owned older boards contain some pre-final-batch wording; this handoff and its stop notice supersede those stale active assignments. No docs were broadly staged or committed as part of stopping.

## 13. Suggested next integration order — only AFTER explicit resume

1. Read latest owner direction/stop state, inspect live Git/ownership, preserve other agents and earned profiles. Reconcile relevant external SWARM plans.
2. Qualify exact coherent source through prepared22asset ordinary route: actual transmission membership/cheap-family duty, actually presented LOD/package/motion/pool state and gameplay picture. Short controlled play/publicPause, not observer counts as acceptance.
3. Judge alpha skins/NPC plume tradeoffs. Tune/withdraw poor choices, identify remaining refraction triggers before claiming extra-pass removal. Use matched relevant-layer costs for speed claims; label paused render-only/instrumented profiles honestly.
4. Measure actual smoothness with existing diagnostics. Keep engine-wash/HUD removed work separate from FPS. No unchanged AI/contact/tiny-asset reruns.
5. One coherent metadata/baseline/publication batch, exact ownership/fetch+merge. Then verify existing public alias and pursue real physical-iPhone evidence; no desktop-only success claim.
6. Finish concrete broader player journeys/combat/feel/content/PR integration. Actual game quality is objective, not paperwork or agent count.
7. End only: finish buildmap, requested last300commit review and three successive independent genuine release-readiness assessments. Current approvals **0/3, NOT STARTED**. Fix material shortcomings before restarting sequence; agreement alone cannot prove perfection/A-list competitiveness.

None of these steps authorizes resuming now. The owner explicitly requested handoff and stop.

## 14. Tooling and pitfalls

- `$env:CODEX_APP_RUNTIME_CLI_PATH`0.166alpha supports requested models; barecodex0.130did not. Fresh exec supports-C/-s; execresume supports neither: use cwd and `-c sandbox_mode="danger-full-access"`. Never resume activeUUID.
- CLI-o must differ from worker-authored detailed report. One self-link final overwrote nominal report; detailedREQUEST/source/committed outcome are authority.
- Shutdown MCP/token/session errors after completed turns do not prove source/tool access failed.
- UTF-8 explicitly on Windows. Preserve LF; root normalized one full CRLF-converted test back beforecommit. No foreign file normalization or persistent Git whitespace change.
- `.devshots` evidence is ignored/local; preserve it. No memory files were written.
- Current Finish program/user instructions supersede old routing/provider/review rituals. Use smallest sufficient claim-relevant verification, no repeated confidence-only audits or ghost conventions.

---

## 2026-11-06 — Hitch/pop-in campaign: diagnosis landed, first fixes in

### Root-cause map (three parallel investigators + direct probing)

**Worker authoritative cost is the 1fps driver.** `workerLastReplyWork` p50 ~8ms, p95 58ms,
p99 105ms, max 458ms. packMs ~0.02ms — the cost is the sim step itself, not transport.
UI stays smooth because DOM animates independently while worker replies arrive at 2-10Hz.

Per-step cost drivers (ranked):
1. Rapier `world.step` — joints, contact storms, pinned-awake islands (towed bodies).
2. `_captureContactImpacts`: `world.contactPair` manifold query PER contact event, then
   ~35 `physics:impact` subscribers fan out per receipt.
3. Catch-up multiplication: one heavy step -> 4-step reply (MAX_CATCHUP_STEPS) -> 400ms+.
4. Per-tick SG-02 passes + `quantizedSnapshot` sort/alloc + `writePhysicsTelemetry` frozen
   alloc per awake body — both default ON in the worker (physics.js:2027/2036).
5. `tetherGameplay` acquisition rebuild every ~5 ticks incl. LINEAR dormant `field.rocks`
   scan (asteroidField.js:390-438) — dormant rows never enter a spatial index.
6. `npcJobsRuntime` threat scans O(jobs x entities): `_legContestedBy`/`_stopContestedBy`/
   resumeJob all iterated `entities.values()` per call.
7. Isolated single-tick spikes: economy 5s burst (~36ms), npcJobs (~30ms), traffic (~14ms),
   barkDirector (~10ms), `_stepAnchoredRecoil` all-records scan.

**Pop-in pipeline (independent failure).**
- Visibility granted at `_bindPresentationMesh`, NOT at readiness — meshes appear before
  authored upgrade + GPU residency, or brick the frame doing the upload (188-289ms).
- `shouldStartHeavyAdmissionEventually` forces a heavy admission after 8 skipped frames
  (admissionSliceBudget.js:58-72) — recurring 100-300ms bricks on slow machines.
- VFX/tether/prop roots bypass the residency stamp entirely — confirmed source of
  `unstampedVisible` GPU bricks (the user's tether trigger correlation!).
- `openingPending` counted `_noMesh` (intentionally meshless + permanently failed) rows
  forever — they can never receive a hook/promise.
- ~50% world submissions = REFUSED frames (opening gate holds, freeze gates) -> entities
  ready during the hold all appear at once -> visible pop.

**Churn.** ~65MB/s allocated during flight: `getParameters`/`getProgramCacheKey` per
material per draw per pass; pick-raycast triangle walks + `signatureDirty` O(nodes);
HUD per-frame writes + `getBoundingClientRect` forced layouts; Set/Map mints in
classifyWorld.

### Fixes landed (this session)

1. `scripts/lib/simWorkerHost.mjs` + `src/core/wholeSimBrowserWorker.js`: worker reply
   work budget. Local-clock catch-up batches now carry `workBudgetMs` (24ms); the host
   stops early on measured wall cost and un-executed steps count as shed debt
   (slow-motion beats a stalled picture). Explicit-step directives (tape/replay/verify)
   carry NO budget and run exactly. `stepsRequested`/`stepsExecuted`/`budgetShedSteps`
   now reported. Test: `test/worker-reply-work-budget.test.mjs`.
2. `src/systems/npcJobsRuntime.js`: `_threatCandidates()` — per-tick, index-version-keyed
   ship pool replaces `entities.values()` scans in `_legContestedBy`, `_stopContestedBy`,
   `resumeJob`. Same threat semantics (sf-082 tests green).
3. `src/render/partsLibrary.js`: `_noMesh` entities excluded from `openingPending`/
   `openingPipelinePending` (they can never settle); still visible in `openingAssets`.
4. `src/ui/lineStrainReadout.js`: dirty-gated all DOM writes (text/aria/dataset/transforms).

### Still open (ranked follow-ups)

- Contact-impact manifold-query dedupe per pair before WASM call + physics:impact batch.
- Dormant-rock spatial re-bucket (pad by drift) for massline obstruction queries.
- `_bindPresentationMesh` bind-hidden-until-ready + VFX residency stamping at creation.
- `publishSg02Telemetry`/`publishSg02Snapshot` lazy/off in worker (verify consumers).
- `shouldStartHeavyAdmissionEventually` force-window review; mid-flight compile chunking.
- getProgramCacheKey memo (vendored three.js patch) — largest steady-state allocator.
- Pick-path: mutation epoch vs signatureDirty O(nodes) + pick-proxy raycast.
- HUD: narrow #alerts MutationObserver (drop characterData); updateTargetArcs skip.
- Main-lane `simulationRunner.js` work-budget equivalent (secondary path, hitch-cap 2).
- `_stepAnchoredRecoil` all-records scan -> maintain active list.
- economy/npcJobs/traffic single-tick spike slicing.
- masslineHud out of sim update order (main-lane cost only; ~0 in worker).

### Verification

- New test `test/worker-reply-work-budget.test.mjs` green; sim-worker-local-clock 29/29;
  sf-082 route-threat + npc-jobs kernel + rescue tests 59/59; authored admission 32/32;
  line-strain 8/8.
- Post-fix probe: `.devshots/runtime-witness/vx-work-budget-check/` (matched route:
  tether-boost-stress, no sample shots).
