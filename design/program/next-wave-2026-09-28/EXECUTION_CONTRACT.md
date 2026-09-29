# Execution contract — one result, one owner, no creative substitution

## What is decided

Each BUILD packet specifies the change, mechanism, ordinary route, negative cases, prior ownership and bounds. The implementation agent may adapt a stale technique to the current owner, but must preserve the intended player result. Each INFERENCE packet fixes one narrower behavior. Neither grants permission to substitute a different feature because it is easier or more interesting.

Before mutation, inspect the current file and active caller, existing SF/PQ/PB assignment, recent implementation and exact dirty hunks. Classify the premise as **missing**, **partial**, **already satisfied**, or **not reproducible**. This is a short implementation decision, not a new audit program. An outcome already satisfied needs a source/test/route pointer, not new code. A historical complaint is not a fresh defect reproduction.

## The game being protected

Physical decisions must remain physical: a payload's motion, collision, custody, damage and value must agree. Keep the colorful, forceful picture and the simple actions that produce complicated outcomes. No decorative simulation duplicate, scripted substitute for a physical result, hidden auto-aim correction, global drag added to hide control defects, free resource injection, or stat inflation as the answer to encounter quality.

Use the live V3 propulsion and tactical AI stack. Motion writes go through the current physics-authority seam except already-authorized analytic owners such as drift bombs. Cargo, credits, fittings, law/heat, factions, claims and saves retain their existing owners. Do not add a second inventory, transaction engine, AI stack, audio loop, asset loader, mission framework or mutable task queue.

## Time, state and lifetime

Gameplay runs on the fixed simulation step and existing seeded streams. Render rate, wall clock, UI animation, discarded async work and diagnostic execution cannot alter gameplay randomness. Replay compatibility is versioned; same seed alone is not a guarantee across engine/content versions. Do not rewrite a golden merely to pass.

Async work validates current run/generation and ownership at publication, not just at launch. Save changes preserve old-save behavior and validate before destructive restore. Test repeated requests, cancellation, stale callbacks, destruction and reload at the actual commit boundary. Keep references to stable records rather than recycled entity IDs where the existing owner already provides them.

## Exact scope and concurrency

A source-path list is a candidate write set, not a subsystem lease. Re-read current source immediately before edits and preserve foreign dirty hunks. Parallelize disjoint work; serialize overlapping writes. A parent can coordinate its child changes in one coherent landing. Do not launch four children simultaneously on the same owner.

An INFERENCE change normally touches one production owner and a focused test; one necessary existing consumer is allowed. A new public seam, save schema, multi-owner transaction or game-design tradeoff belongs to a strong packet. Record the specific missing capability and use the existing routing rather than inventing a replacement framework or new defect log.

## Picture, sound and accessibility

Use current ORRERY components for task-needed interface changes. No new skin, font bundle, card system or restoration of superseded UI directions. Preserve the semantics of reduced motion, remapped controls, visible focus and irreversible confirmation. A narrow functional correction is not permission to repaint the screen.

Performance wins must preserve the default authored picture and the working world. Do not lower resolution, remove visible geometry, suppress causal effects or despawn distant actors to manufacture success. Use ownership, locality, bounded queries, batching, lifetime and scheduling improvements at the measured bottleneck. Existing budgets are ceilings unless the packet explicitly negotiates a new cost; any new numeric fixture in a task is an example, not an automatically accepted balance target.

## Evidence without ceremonial overhead

Use the nearest real owner tests, not a copied production implementation or an invented command. Each packet's fallback test filename is proposed, not an assertion that it exists. Add the exact counterexample; verify a neighboring valid case still works. Run shared checks once per coherent landing when that covers the same change, not once per child.

Visual, sound, control and frame-pacing acceptance need the actual default route. Source inspection, unit tests and a lab-only screen are not equivalent. Use the matched before/after route and batch review in REVIEW_AND_PLAYTEST.md. Record `implemented / route-unproven` when appropriate. Do not claim hardware performance from an unsuitable host or someone else's PR report.

## Landing and statuses

Update the canonical board/catalog and current completion log using their existing conventions. Completion identifies the owned commit, actual player result, checks and remaining uncertainty. Covered children close as already true with the same evidence. Open WAITING children only when their capability exists; preserve still-missing dependencies. An implementation can be committed without falsely claiming route acceptance.

Outside-scope findings use the existing `design/program/DEMO_READINESS_2026-09-20.md` §6 ledger. Stop this assignment when its result is complete. The task's end is not an invitation to generate more tasks. Strong planning/review may later replace a stale premise; weaker execution may not.
