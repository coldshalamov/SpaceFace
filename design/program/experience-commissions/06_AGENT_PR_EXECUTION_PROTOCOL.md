# SpaceFace — Agent PR execution protocol (v2)

**Applies to every EC-S / EC-G / EC-A / EC-Z / EC-C draft commission.** This is an implementation protocol, not a second task queue. Follow current user direction, `AGENTS.md`, current Finish master plan, lanes and `NOW.md`; use the full local EC brief for the creative result. The native code and active owners decide what already exists.

## 1. What the agent owns

You are commissioned to **complete the named player experience** on the **existing draft commission PR head branch**. It currently contains only the authored brief. Add gameplay source, integrated assets, tests and evidence on *that branch*. Do not stop after adding a second report, another plan or a single small correction. **Do not open a duplicate implementation PR** by default. If the canonical owner requests a separate dependent/shared PR, link it and keep the original commission open until integration is verified; never put unrelated work into a convenient branch.

Your EC ID is a document address. It does not give exclusive control of every file mentioned in the spec, create another gameplay state owner, or supersede the live master plan. Claim exact writable paths under the current shared-checkout protocol. The local sector/arena owner writes local composition and story; central camera, physics, world-record, traffic, economy, NPC-contact, save, shader and wave-director owners remain single writers.

## 2. First pass: establish player truth

Before editing: refresh the actual master HEAD, branch head, uncommitted/foreign work, the current `NOW.md`, overlapping open PRs and parent campaign status. Read existing implementations of every promised outcome; classify each as (a) works visibly, (b) works but is poor, (c) source exists but is disconnected from the public route, (d) absent, (e) blocked by a shared owner, or (f) unverified. **A fixture or comment is not proof that the player sees it.**

Launch the ordinary player path whenever the environment permits. Observe the first meaningful 30–60 seconds, a representative longer route, and the consequence/return path. Capture enough actual game frames and transitions to locate defects. If browser/target hardware is unavailable, do independent code/fixture work and record the exact unverified player-route gate. Never call a text simulation a playtest or a headless software-renderer score an integrated-GPU benchmark.

Write down three competing complete solutions for the highest-impact weakness; compare player benefit, complexity, integration/reliability risk, and measured run-time cost. Select and **implement** the best. Prefer a change that makes existing systems interact over one that adds another disconnected manager. Research may refine the commission; it cannot replace production.

## 3. Design every scene as an experience, not a component list

**Notice → understand → act → respond → remember** is the minimum causal chain. The player notices a specific actor or physical condition without a mandatory journal; can understand the local opportunity; performs an actual ship-scale physical/economic/social verb; receives legible feedback driven by authoritative committed state; and sees the changed world on return. Preserve alternate approaches, meaningful interruptions, safe retreat, relevant accessibility equivalents and persistence.

Ask the counterfactual before implementing: *If the player never takes a quest, what still happens here? If they ignore the situation, what is different when they return? Could they tell what happened with the HUD hidden? If this actor/object were removed, would the experience change?* Failure to answer means the scene is still dressing.

For sectors, compose destinations, routes, working crews and reachable recurring people; do not use idle orbiting ships or mission-marker carpets as simulated society. For Swarm, shape readable enemy arrivals, distinctive physical rooms and power-feedback chains; do not add enemies constructing new buildings. For global systems, deliver a real consumer route and provide reusable interfaces without hijacking a local area's composition.

## 4. Make aesthetic quality and frame cost one design problem

Measure **worker simulation**, **snapshot delivery/presentation**, **main-thread render/DOM**, **GPU**, **asset admission** and **memory churn** separately. A moving planet beside a frozen ship is not evidence of acceptable simulation performance. Measure on a reproducible busy Adventure route and a representative dense Swarm route; record hardware, actual renderer, build, seed, screen resolution, p50/p95/p99 where applicable, visible image quality and before/after behavior. Use the *current* E-campaign numerical bars as targets, not an old unverified screenshot.

60 Hz presentation provides **16.67 ms total frame time** before work is apportioned across CPU/GPU; it is not a license for each subsystem to use 16.67 ms. Treat actor counts, dynamic bodies, active lights and procedural dressing as **shared budgets**, not quotas per sector. Favor persistent authored geometry, instancing/batching where visual identity permits, spatial indexing, event-driven/coarse-tick work, shader/material reuse, deliberate residency and simple deterministic interaction contracts. Physics lives on demand where possible; distant ordinary life can use canonical far-state models. Avoid per-entity per-frame JS scans, allocation storms, more always-awake joints, multiple independent light/shadow passes and shader-first effects for ambient detail.

**No quality ransom:** do not cure a worker stall by reducing rendering resolution; do not make the scene empty to hit FPS; do not sacrifice readable ship identity, material/light response, true collision, controls, or gameplay causality. A measured alternative may be simpler and cheaper while looking *better* at the gameplay camera: better silhouettes and practical light often beat a blanket expensive effect. Profile, compare at equal quality, then tune. Respect existing approval gates, especially X1 art direction.

## 5. Work in successive bounded passes

**A — Make it playable.** Reach the content through normal menus/sector navigation; execute a real verb with correct owner identity; settle/fail/recover truthfully; preserve state after save/Continue. No debug-only solution.

**B — Make it understandable.** Visual hierarchy, navigation, target markers, object scale, camera response, controls, lighting, audio-muted equivalents and meaningful actor motion; correct wrong or competing attention. Use before/after captures at the gameplay camera.

**C — Make it compelling.** Add the distinct local character, surprising-but-causal interactions, strategic decisions, hard-won options and useful reasons to revisit. Do not replace substance with longer text, 50 inert props, effects that obscure causes or procedural mission padding.

**D — Make it robust.** Test denied, failed, duplicate, destroyed, interrupted, relocated, loaded and alternate routes; use existing focused and public-route checks; compare performance on representative density; fix regressions without weakening baselines.

Repeat these passes for **every named obligation**, not just the most cinematic example. Preserve existing good behavior and finite authored coverage.

## 6. Integration and review rules

A subagent gets a *real deliverable*, disjoint exact paths and a consumer/interface contract; the area lead integrates it. Reviewers are read-only. Where the current active program requires **three independent reviewers**, honor that; do not silently substitute self-approval or create needless reviewer quotas outside that gate. A reviewer must enter through the real route without reading the spec and report concrete defects: where the route is empty, misleading, awkward, ugly, slow, unstable, or unconvincing, and why. A negative verdict must lead to a source correction or a precise unresolved blocker—not a renamed acceptance criterion.

Current old branches start from an authored specification baseline. Compare with the latest remote and integrate the current permitted way (**merge, never prohibited rebase/reset/force-push**); preserve other agents' edits. Do not overwrite newer canonical fixes, change golden results to pass, fabricate economy/mission receipts, or claim target-device performance from a different machine.

## 7. Finite PR stopping and checkpoint truth

**READY FOR REVIEW** only when the full named scene/coverage is implemented, reachable in ordinary play, and has relevant focused/integration/visual/feel/performance evidence; independent material defects are resolved or explicitly accepted by the canonical owner. Tests passing, docs authored, a demonstration fixture, an asset delivered, or one mission working are **not** section completion.

Record on the PR: base and implementation commits; production paths; exact entry route, seed and setup; what was already true; what changed and why; completed named obligations; reproduced alternative/failure/return; evidence and hardware; open defects; conflicts/owner coordination; next action. Keep `UNVERIFIED` distinct from `PASS`.

A useful partial implementation may be checkpointed or reviewed while this commission remains **DRAFT / AREA INCOMPLETE**. If runtime/context/tool limits stop the session, commit allowed independent work, record the next exact step and do not change the meaning of completion. When all committed scope is genuinely satisfied, stop adding speculative optional work; ship a coherent result instead of a never-ending enhancement loop.

## 8. Failure modes to reject

- Rewriting an old plan as a newer plan, or generating more agent prompts instead of source.
- Converting every sector's source references into claims on shared world/mission/camera files.
- A facade that declares jobs done through fabricated events, invisible flags or economic numbers disconnected from physical objects.
- More monsters, glow, UI cards or lore where what is missing is navigation, interaction, reliable motion or player agency.
- An aesthetically empty scene that performs well because nothing is simulated.
- A crowded scene declared professional on the basis of screenshots while native flight, camera or physics stutter.
- Prematurely closing a commission by shrinking its promises, or refusing to close one because there are always optional ideas.
