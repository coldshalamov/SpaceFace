# 08 — Production-System Implementation Backlog

**Status:** DRAFT execution order for Milestone 0

> **Subordinate machinery backlog, not global status.** Current Alpha + Depth completion truth lives
> in [`design/program/`](../program/README.md). This file preserves high-value future controller,
> evidence, capability, and asset-pipeline work. Its packet table may be updated as detailed evidence,
> but only the lead/status integrator promotes cross-program state. Clean-wave requirements in the
> draft build program apply only when the controller explicitly adopts them for a named release run.

This is the first implementation wave beneath `design/vision/ALPHA_PROGRAM.md`. It builds the
machinery that makes later Grok/Claude/OpenCode/Codex campaigns persistent and independently
verifiable. It does not authorize edits across an active asset/render ownership signal.

## Current factory status — 2026-07-12

| Packet | Current truth | Next legal action |
|---|---|---|
| SAFE-001 | FROZEN / controller-waived at 88/88 current destructive fixtures. Remaining independent-review findings are known P2 control-plane debt; this is not `ACCEPTED`. | No further SAFE repair or review in the current campaign. Continue ownership-safe supervised game, evidence, and asset production. |
| PROD-001 | Isolated candidate was captured/submitted, but controller red-team found fail-open parsing, placeholder/reference gaps, unbound verdict/candidate hashes, and pre-integration ACCEPTED. REJECTED and stale after contract changes. | Preserve as future automated-controller work; it does not block current controller-supervised targeted integration. |
| PROD-002 | Read-only audit candidate returned with useful grounded findings. It has not passed the full campaign acceptance state. | Preserve as input evidence; independently verify/hash-bind before marking accepted. |
| PROD-004 | Counter candidate and 21/21 fixture result exist, but accounting is self-reported, corrupt logs reset, blockers are forgeable, and live state is stale. REVISE. | Build the automatic hash-chained supervisor/journal and reconciliation fixtures. |
| CAP-000 | Read-only capability matrix returned; several routes remain unverified or constrained (notably Grok generation and OpenCode balance). Candidate evidence, not final acceptance. | Pin exact binaries/models and finish the missing smokes when available. |
| ASSET-001/002, EVID-001/002 | Grounded packets and partial implementation/evidence exist. | Reconcile by ownership without grandfathering v1 evidence. |
| OBS-001 | Phase A passive in-memory recorder core is committed at `14bfed98`; all four focused checks and 5/5 observer tests pass. Registry/main/filesystem/media integration is intentionally absent. | Complete Phase B browser integration and the matched browser pair; keep media under OBS-002 and do not claim OBS-001 exit yet. |

The dependency columns below describe the future fully automated controller. For the current
campaign, the 2026-07-12 SAFE waiver permits controller-supervised targeted integration and does not
gate read-only, exclusive Blender, or player-feature work. The live dispatch log remains a bootstrap
aid that must be reconciled against actual ownership and processes rather than treated as authority.

## Wave A — trustworthy campaign control

| Packet | Outcome | Default lane | Depends on | Exit evidence |
|---|---|---|---|---|
| SAFE-001 | Write-enforcing transactional runner, isolated live-tree snapshot, lease/heartbeat, write journal, stale-input integration, violation kill | lead/Codex sole code lane; independent destructive-fixture reviewer | none | every `SAFE-001-REPAIR` hostile fixture passes; worker cannot alter live/control/unleased files; valid candidate integrates recoverably; two hash-bound reviews PASS |
| PROD-001 | Compile concrete work packets; persist legal hash-chained candidate state; semantic candidate/evidence/reviewer/integration binding | sole code lane | SAFE-001 for terminal mutation | bogus/cross-hash ACCEPTED and stale/failed integration fixtures rejected; all production packets compile; state resumes after exit/compaction |
| PROD-002 | Read-only audit of manifests, evidence folders, ledgers, hashes, required views, and runtime reachability | Codex subagent/evidence lane | none | reproducible report; no asset mutation |
| PROD-003 | Generate the canonical coverage ledger from Alpha/spec/manifest/runtime/check sources | controller code lane | PROD-001 | unmapped/duplicate/omitted/impossible rows fail; milestone snapshot hash recorded |
| PROD-004 | Automatic campaign supervisor and hash-chained dispatch/action journal (`11_ENFORCEMENT_MACHINERY_SPEC.md` §3) | sole code lane | PROD-001 | derived projection matches actions; corruption/omission/stale process/forged blocker/idle-ready-lane fixtures fail closed |
| PROD-005 | Truth registry generator: single JSON summary of commit/worktree fingerprint, backend selections, check results, asset state, P0/P1 defects, leases (`11_ENFORCEMENT_MACHINERY_SPEC.md` §8) | code lane | PROD-002 | `truth:generate` produces summary; `check:truth-drift` detects stale truth |
| CAP-000 | Read-only version, invocation, session-ID, continuation, vision, and image/video-tool smoke tests | Codex scheduler + all models | packet templates | exact non-mutating command/results matrix |
| QUAL-001 | Compile the first acceptance cards and blind benchmark packets for Slice A and novice mining | Fable 5 + Codex synthesis; independent skeptic | production constitution | concrete hashes/routes/defect classes; no vague quality words |
| AUTH-001 | Reconcile this draft with F9 and affected Grok/campaign skill authority | lead + Fable/Codex spec review | QUAL-001 | explicit conflict table resolved; authoritative docs agree |
| EVID-001 | Hash-bind and revalidate every Alpha evidence artifact and producer receipt | evidence-contract code lane | SAFE-001 | substitution/path/link/candidate mismatch fixtures rejected; current producers emit v2 descriptors |
| EVID-002 | Revalidate/recapture every legacy v1 Alpha evidence record, downgrading unsupported Complete claims | controller browser/Electron evidence lane | EVID-001 | live Alpha scan has zero v1 records; migration accounting exact; every retained claim has v2 proof |

Suggested new tooling surface for PROD-001 is `tools/production/` plus checks under `scripts/`;
the implementation contracts for all tools are in `11_ENFORCEMENT_MACHINERY_SPEC.md`. The
implementation must follow the live module map and may choose a better location after grounding.
Add `check:safe-agent-runner`, `check:production-packets`, `check:campaign-state`,
`check:coverage-ledger`, `check:dispatch-discipline`, and `check:truth-drift` as new gates
rather than overloading unrelated checks.

## Wave A2 — controlled capability bake-offs

| Packet | Outcome | Default lane | Depends on | Exit evidence |
|---|---|---|---|---|
| CAP-001 | Representative code/frontend/gameplay benchmark with isolated candidate integration | one model at a time in sole code lease | SAFE-001, CAP-000 | blind quality, defect discovery, honesty, continuation, cleanup data |
| CAP-002 | Representative Blender source→GLB→runtime benchmark | one Grok Blender author, then cross-model critics | SAFE-001, CAP-000, AUTH-001 | full candidate and independent technical/visual/runtime verdict |
| CAP-003 | Image/video generation concept, mask/decal, icon/portrait, and motion-reference benchmark | isolated generation lanes | CAP-000, generated-media schema | provenance-complete outputs and downstream-usefulness verdict |

## Wave B — repair the asset truth surface

| Packet | Outcome | Default lane | Depends on | Exit evidence |
|---|---|---|---|---|
| ASSET-001 | Contract tests that reproduce iteration-derived scores, excluded required views, false chamfer stamps, and neutral-map passes | sole code lane; independent evidence review | SAFE-001, PROD-002, AUTH-001 | red fixtures for every known loophole |
| ASSET-002 | Repair validators/finalizers/campaign evaluation without touching accepted source art | Grok/Claude/Codex code lane by bake-off | ASSET-001; no active asset lock | all red fixtures green; no weakened contract |
| ASSET-003 | Add profile-specific LOD, pivot, collision, socket, map-information, framing, and delta checks | asset-pipeline code lane | ASSET-002 | representative good/bad fixtures discriminate correctly |
| ASSET-004 | Reclassify existing evidence with the stable classification schema; never delete or grandfather | read-only critic quorum + orchestrator | ASSET-003 | hash-bound classification report with defects |
| ASSET-005 | Rebuild one rejected Slice-A exemplar through the complete Grok asset goal | Grok Blender author; cross-model critics | ASSET-004, CAP-002 | source→GLB→runtime→clip candidate independently accepted |

ASSET-005 is the proof that the pipeline creates quality rather than merely detecting bad work.
Only after it passes should the same cell scale across a family.

## Wave C — Gameplay Observatory v1

| Packet | Outcome | Default lane | Depends on | Exit evidence |
|---|---|---|---|---|
| OBS-001 | Passive session/event/input/perf/asset/presentation records with deterministic IDs and no gameplay authority; media explicitly pending | sole code lane | SAFE-001, PROD-001 | observer-on/control/off periodic and final sim hashes/receipts match; exact rates; zero drops/faults |
| OBS-002 | Full-session video plus event-selected 4–8 fps incident extraction and contact sheets | media/tooling lane | OBS-001 | reproducible incident bundle; valid pre/post roll |
| OBS-003 | Versioned first detectors plus calibration/held-out benchmark | one code writer; parallel read-only fixture/review lanes | OBS-001 | ≥20 positive/negative cases each, ≥90% P0/P1 sensitivity, ≤10% false positives or advisory-only label |
| OBS-004 | Natural twenty-minute Helios novice-miner route, followed by identical no-capture replay | browser/playtest lane | OBS-002, OBS-003 | native-rate video+audio, full/random review, timeline, incidents, matching sim hashes, authoritative perf |

The observatory reports evidence; it never modifies balance or drives AI. Each finding becomes a
separate implementation packet with a held-out replay, preventing an agent from tuning to one clip.

## Wave D — milestone restart on trusted evidence

1. Complete EVID-002, then reconcile the M0 findings and any downgraded legacy claims into the Alpha
   ledger.
2. Reject, repair, or explicitly defer every P0/P1 with an owner and evidence requirement.
3. Run the Slice-A signature route and novice-miner route through the new gates.
4. Continue the active M1 production families under controller-supervised ownership while the
   future automated machinery matures independently.
5. Dispatch independent ready packets whenever file leases and safe concurrency permit.

## Next orchestration batch

1. Reconcile and commit completed dirty work in logical ownership-safe chunks; never bulk-stage the
   tree or absorb active writer lanes.
2. Protect the active tether/targeting/massline, the isolated Ashline HOLD/unwired candidate, and Helios lanes while finishing M1 public-
   route acceptance and continuing independent M3–M6 families in parallel.
3. Run EVID-001/EVID-002 and complete OBS-001 Phase B/browser integration opportunistically without
   serializing the game behind it; keep OBS-002 media and OBS-004 headed route acceptance open.
4. Keep worker output external until the controller reviews and integrates exact targeted paths.
5. Do not schedule another SAFE repair or review cycle in this campaign.
