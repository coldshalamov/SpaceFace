<!-- LIFETIME: STABLE -->
# SpaceFace agent instructions

## Enter the repository

Start at [`CANONICAL_BUILD_MAP.md`](./CANONICAL_BUILD_MAP.md). Inspect the current branch, `git status --short`, and `git worktree list` before reading plans or touching files. Read [`design/program/NOW.md`](./design/program/NOW.md) for live leases, the selected queue row, and exactly one active packet. Use [`docs/MODULE_MAP.md`](./docs/MODULE_MAP.md) to locate owners; do not sweep the repository.

Nested `AGENTS.md` files apply only at genuine ownership, technology, or risk boundaries. Historical handoffs, screenshots, transcripts, generated builds, scratch directories, and archived plans are not instructions.

## Non-negotiable engine contracts

- Simulation truth advances on the fixed-step path. Use seeded RNG and simulation time; never let wall time, DOM order, callback order, or `Math.random()` decide gameplay state.
- Preserve single-writer ownership. Economy, cargo, factions, heat, missions, physics, save, world, and other authorities mutate their own state through owner APIs/events.
- Browser, Electron, tests, and probes use the same game route and the same owners. A harness may observe; it may not manufacture a gameplay transition to prove itself.
- Save/Continue is part of every durable feature. Stable IDs and receipts survive reload; transient entity/DOM/render handles do not become save truth.
- Renderer and UI consume gameplay truth. They do not own simulation state, hidden alternate ledgers, or special acceptance-only state.
- Visible authored entities use resolve → prepare → admit. Do not publish a misleading placeholder that can target, collide, attack, or offer verbs before the requested identity is ready.
- Keyboard is a baseline, not the whole accessibility story. Preserve focus, semantic names, non-color/non-audio critical cues, reduced-motion/flash behavior, text scaling, and existing applicable controller routes.
- Performance work preserves authored quality. Remove invisible work, allocations, duplicate resources, over-frequency, and unbounded queries before reducing visible content.

Read the relevant sections of [`ARCHITECTURE.md`](./ARCHITECTURE.md) for exact owner and loop contracts. Descriptive counts or tuning notes in prose must still be checked against current code.

## Implementation behavior

Characterize the current seam before editing it. Prefer a pure contract and a narrow owner-side adapter over a new registered system. Reuse existing events, IDs, input routes, panels, projectors, asset loaders, save owners, and probes when they already express the required behavior.

Do not turn a local design opinion into an automatic guardrail. A repository-wide rule or check must protect a demonstrated invariant: determinism, ownership, save, security, accessibility, provenance, measured performance, or player behavior. Aesthetic direction belongs in the selected packet and is judged in game—not frozen through palette lists, CSS bans, technique quotas, arbitrary triangle ceilings, exact module counts, or source-string policing.

When a necessary edit leaves the packet's write budget or crosses an occupied mutex, stop and return a shared-change request. Do not quietly widen the feature.

## Verification

Follow [`design/program/roadmap/00_EXECUTION_PROTOCOL.md`](./design/program/roadmap/00_EXECUTION_PROTOCOL.md).

Use the smallest relevant ladder:

1. syntax/static/data validation;
2. seconds-scale focused tests at the owner seam;
3. determinism, ownership, save, and adjacent integration checks;
4. one broker-authorized Browser/Electron route when player-visible evidence is required;
5. matched performance evidence for changed cost centers.

Never rerun an unchanged expensive failure. Reproduce it in a deterministic focused regression, observe fail → fix → pass, then obtain a new broker claim. One independent discovery review plus one causal re-review is the normal closure; unrelated findings become follow-ups.

Do not weaken a correct check or rewrite a golden to accommodate a regression. Remove obsolete rules only when the intended behavior is covered directly.

## Documentation and handoff

Update the active packet checklist and return an exact-revision receipt with changed paths, checks, route evidence, performance evidence, and honest residuals. The integrator owns global queue/status transitions and generated indexes.

After control-document changes run:

```bash
node scripts/check-program-docs.mjs
```

After event or registry changes run `npm run build:indexes` and inspect the generated diff. Preserve unrelated dirty work.
