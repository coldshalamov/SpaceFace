# test/ agent notes

Tests cover deterministic simulation, focused contracts, save compatibility, launch/UI behavior, and
regression fixtures.

- Run the narrow test file first with `node --test <file>`; broaden only after it passes.
- Never edit `*.expected.json` merely to make a changed simulation pass. A deliberate re-record needs
  an explicit gameplay reason and review of the semantic delta.
- Use seeded state/RNG and simulation time. Avoid wall-clock sleeps and nondeterministic ordering.
- Test public behavior and ownership seams rather than incidental formatting or file-size/count facts.
- Keep adversarial coverage for duplicate events, stale saves, missing assets, unordered payloads,
  pause/resume, and repeated initialization when relevant.
- Preserve foreign fixture changes in the shared working tree. Add new files with `git add -N`.
- UI/render claims still need a representative runtime probe or screenshot when feasible; DOM/source
  assertions alone are not visual acceptance.
