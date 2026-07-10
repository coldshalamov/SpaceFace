# 08 — Production-System Implementation Backlog

**Status:** DRAFT execution order for Milestone 0

This is the first implementation wave beneath `design/vision/ALPHA_PROGRAM.md`. It builds the
machinery that makes later Grok/Claude/OpenCode/Codex campaigns persistent and independently
verifiable. It does not authorize edits across an active asset/render ownership signal.

## Wave A — trustworthy campaign control

| Packet | Outcome | Default lane | Depends on | Exit evidence |
|---|---|---|---|---|
| SAFE-001 | Write-enforcing transactional runner, isolated live-tree snapshot, lease/heartbeat, write journal, stale-input integration, violation kill | lead/Codex sole code lane; independent destructive-fixture reviewer | none | malicious fixture cannot alter live/unleased/control files; valid allowlisted candidate integrates transactionally |
| PROD-001 | Compile concrete work packets, reject placeholders/role conflicts, persist legal hash-chained candidate state and session IDs | sole code lane | SAFE-001 for terminal mutation | false ACCEPTED/blocker/transition fixtures rejected; state resumes after process exit |
| PROD-002 | Read-only audit of manifests, evidence folders, ledgers, hashes, required views, and runtime reachability | Codex subagent/evidence lane | none | reproducible report; no asset mutation |
| PROD-003 | Generate the canonical coverage ledger from Alpha/spec/manifest/runtime/check sources | controller code lane | PROD-001 | unmapped/duplicate/omitted/impossible rows fail; milestone snapshot hash recorded |
| PROD-004 | Dispatch discipline tracker: mechanically detect orchestrator collapse to solo work (`11_ENFORCEMENT_MACHINERY_SPEC.md` §3) | sole code lane | PROD-001 | dispatch log validates; `turnsSinceLastDispatch > budget` fires violation; `check:dispatch-discipline` passes |
| PROD-005 | Truth registry generator: single JSON summary of commit/worktree fingerprint, backend selections, check results, asset state, P0/P1 defects, leases (`11_ENFORCEMENT_MACHINERY_SPEC.md` §8) | code lane | PROD-002 | `truth:generate` produces summary; `check:truth-drift` detects stale truth |
| CAP-000 | Read-only version, invocation, session-ID, continuation, vision, and image/video-tool smoke tests | Codex scheduler + all models | packet templates | exact non-mutating command/results matrix |
| QUAL-001 | Compile the first acceptance cards and blind benchmark packets for Slice A and novice mining | Fable 5 + Codex synthesis; independent skeptic | production constitution | concrete hashes/routes/defect classes; no vague quality words |
| AUTH-001 | Reconcile this draft with F9 and affected Grok/campaign skill authority | lead + Fable/Codex spec review | QUAL-001 | explicit conflict table resolved; authoritative docs agree |

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
| OBS-001 | Passive session/event/input/perf/asset/audio schema with deterministic IDs and no gameplay authority | sole code lane | PROD-001 | capture/no-capture periodic and final sim hashes match |
| OBS-002 | Full-session video plus event-selected 4–8 fps incident extraction and contact sheets | media/tooling lane | OBS-001 | reproducible incident bundle; valid pre/post roll |
| OBS-003 | Versioned first detectors plus calibration/held-out benchmark | one code writer; parallel read-only fixture/review lanes | OBS-001 | ≥20 positive/negative cases each, ≥90% P0/P1 sensitivity, ≤10% false positives or advisory-only label |
| OBS-004 | Natural twenty-minute Helios novice-miner route, followed by identical no-capture replay | browser/playtest lane | OBS-002, OBS-003 | native-rate video+audio, full/random review, timeline, incidents, matching sim hashes, authoritative perf |

The observatory reports evidence; it never modifies balance or drives AI. Each finding becomes a
separate implementation packet with a held-out replay, preventing an agent from tuning to one clip.

## Wave D — milestone restart on trusted evidence

1. Reconcile the M0 findings into the Alpha ledger.
2. Reject, repair, or explicitly defer every P0/P1 with an owner and evidence requirement.
3. Run the Slice-A signature route and novice-miner route through the new gates.
4. Start M1 production families only after the first exemplar and the production machinery pass.
5. Dispatch independent ready packets whenever file leases and safe concurrency permit.

## First orchestration batch

The first safe batch is one supervised mutating lane on SAFE-001 plus read-only PROD-002, CAP-000,
and QUAL-001. PROD-001 follows the containment proof. No auto-approved mutating terminal worker runs
before SAFE-001. ASSET-001 waits for AUTH-001; ASSET-002 waits for red tests and a fresh ownership
preflight. This prevents more Grok volume from entering compromised acceptance machinery or the
deeply dirty live tree.
