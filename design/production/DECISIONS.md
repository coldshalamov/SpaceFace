# Production Decisions and Evidence Log

Append entries; do not silently rewrite history. Superseded decisions receive a new entry.

## 2026-07-10 — Keep the existing Alpha roadmap

**Decision:** `design/vision/ALPHA_PROGRAM.md` remains the sole roadmap. This folder strengthens its
execution and acceptance rather than creating a competing roadmap.

**Reason:** the existing milestone order is broadly correct; the missing layer is production
integrity, temporal evidence, coverage accounting, and actual orchestration.

## 2026-07-10 — Remove completion authority from workers

**Decision:** all worker outputs are candidates. Only the orchestrator may accept after independent gates.

**Reason:** better wording and `/goal` persistence do not prevent the same agent from interpreting,
building, scoring, and accepting the weakest technically compliant result.

## 2026-07-10 — Invalidate self-score as acceptance

**Evidence:** current graphics campaign scripts derive score increases from iteration/pass progress;
some exclude failed required views. Existing ledgers can claim high export scores alongside false
render analysis. Visual inspection found allegedly late iterations still cropped/basic.

**Decision:** self-scores and iteration counts are process notes only. Existing assets require
independent candidate reclassification.

## 2026-07-10 — Preserve meaningful iteration, remove iteration theater

**Decision:** hero/cast assets keep a substantial review-cycle budget, including the successful
full-view screenshot loop, but each cycle must prove a substantive source/candidate change and may
not grant acceptance. Continue beyond the nominal floor when rejected.

## 2026-07-10 — Use profile-selected techniques

**Decision:** replace universal “use most Blender techniques” rules with asset-profile applicability
matrices and outcome evidence.

**Reason:** professional work chooses techniques to solve the asset's problem. Mandatory armatures,
shape keys, sculpting, geometry nodes, or layered shaders for every asset creates checkbox work and
may not survive GLB/runtime.

## 2026-07-10 — Temporal gameplay evidence

**Decision:** retain screenshots, but extract them at 4–8 fps from event-selected incident windows
aligned to intent/execution/presentation data. Use a separate no-capture performance replay.

## 2026-07-10 — Grok model and local capability

**Observed locally:** Grok CLI 0.2.93 reports `grok-4.5` as default and configured Blender MCP. It
supports continuation, checks, structured JSON output, inline agent definitions, and best-of-N.

**Decision:** specify `--model grok-4.5` explicitly for production campaigns and use fresh sessions
for blind review. Do not use best-of-N for concurrent writers in the shared SpaceFace/Blender lane.

## 2026-07-10 — Persist the planning system in-repo

**Decision:** `design/production/` is the durable working suite for build, orchestration, asset,
observability, capability, research, and decision specifications. Update it during planning rather
than trusting chat history or compaction summaries.

## 2026-07-10 — Verified terminal capability surfaces

**Observed locally:** Claude Code supports `claude-fable-5` and `--effort max`; OpenCode lists
`opencode-go/kimi-k2.7-code`; agy lists Gemini 3.5/3.1 Pro, Claude Sonnet/Opus 4.6 Thinking, and
GPT-OSS 120B. Exact qualitative routing remains subject to the bake-off.

## 2026-07-10 — Reject unresolved goal placeholders

**Evidence:** a prior Top-50 goal was launched with unresolved slice/asset/thread placeholders; the
worker selected its own scope and combined lanes, then claimed completion with residual gates.

**Decision:** all terminal briefs are compiled and linted before launch. Unresolved placeholders or
missing concrete coverage IDs are hard dispatch errors.

## 2026-07-10 — Define quality through evidence and weakest-link gates

**Decision:** “professional $30 Steam game quality” remains the ambition, but no worker may satisfy
it through a single score or its own interpretation. Each player surface uses a hash-bound
acceptance card, held-out routes, reference comparisons, hard defect classes, and independent
cross-model review. Any unresolved credible critical or major defect blocks acceptance.

## 2026-07-10 — Keep work moving without collapsing roles

**Decision:** a free safe concurrency slot plus a ready independent packet creates a dispatch
obligation. Codex may implement a packet itself, but then becomes that packet's author and must
assign review and acceptance evidence to fresh agents.

## 2026-07-10 — Independent red-team rejected the first draft

**Evidence:** a fresh read-only reviewer demonstrated that the initial campaign schema accepted a
bogus `ACCEPTED` record with no reviewers, pending gates, empty hashes/evidence, and an open P0. It
also identified direct auto-approved mutation of the dirty live tree as unsafe.

**Decision:** the first draft was not complete. Add SAFE-001 containment, conditional acceptance
schema rules, legal transition validation, typed continuation/blocker evidence, exact topology,
stable classification/coverage schemas, and destructive negative fixtures before execution.

## 2026-07-10 — Isolate all auto-approved mutation

**Decision:** no auto-approved terminal agent writes directly to live SpaceFace. Mutating agents run
in an exact isolated working-tree snapshot or equivalently proven OS boundary. Only a separate
integrator promotes allowlisted hashes after stale-input validation. Prompt rules and post-hoc diffs
are insufficient because unrelated dirty work cannot safely be reset.

## 2026-07-10 — Resolve review quorum and clean-wave floors

**Decision:** acceptance requires two fresh critics from different model families; a split or
concrete P0/P1 goes to a third adjudicator. Milestone floors are now M0=3, M1=3, M2=3, M3=3, M4=3,
M5=3, and M6=5 consecutive clean waves using the matrices in `01_BUILD_PROGRAM.md`.

## 2026-07-10 — Preserve the 24-region M2 scope

**Decision:** Helios→Ceres→Tethys is M2a architecture proof, not M2 completion. M2b expands and
accepts the same architecture across all 24 persistent regions required by the Alpha roadmap.

## 2026-07-10 — Generated media is a provenance-bound candidate lane

**Decision:** image/video generation receives its own packet, manifest, comparative bake-off, and
downstream ingestion gate. F9 wins until amended; generated 3D PBR data is production input, never a
direct final-map shortcut.

## Open questions

- Which exact foundation-release coverage counts are enough before story/content expansion?
- How should accepted visual references be licensed and versioned?
- Which Claude/OpenCode/agy tasks win the first controlled capability bake-off?
- Which SAFE-001 containment implementation proves the best Blender throughput without weakening isolation?
