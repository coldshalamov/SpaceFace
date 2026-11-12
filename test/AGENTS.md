# test/ agent notes

Tests cover deterministic simulation, focused contracts, save compatibility, launch/UI behavior, and
regression fixtures.

- Choose the proof layer through `docs/VALIDATION_WORKFLOW.md`; lab implementation tests also follow
  `src/testing/lab/AGENTS.md`.
- Run the narrow test file first with `node --test <file>`; broaden only after it passes.
- Never edit `*.expected.json` merely to make a changed simulation pass. A deliberate re-record needs
  an explicit gameplay reason and review of the semantic delta.
- Use seeded state/RNG and simulation time. Avoid wall-clock sleeps and nondeterministic ordering.
- Test public behavior and ownership seams rather than incidental formatting or file-size/count facts.
- Keep adversarial coverage for duplicate events, stale saves, missing assets, unordered payloads,
  pause/resume, and repeated initialization when relevant.
- Preserve foreign fixture changes in the shared working tree. Leave new files untracked until
  exact-path staging; intent-to-add entries can prevent a concurrent merge from preserving its state.
- UI/render claims still need a representative runtime probe or screenshot when feasible; DOM/source
  assertions alone are not visual acceptance.
- Follow the active Finish Program's claim-specific direct verification rule for gameplay changes.
  Use the ordinary player route for player-facing claims; the player-truth harness is available
  when it answers that claim. Record failed or unverified outcomes honestly and fix material failures.
