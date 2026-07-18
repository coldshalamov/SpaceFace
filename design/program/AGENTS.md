# design/program/ agent notes

This is the sole whole-program status and pickup surface. It does not replace detailed source plans.

- Start with `NOW.md` for leases and `roadmap/README.md` for the active packet work order; follow
  `roadmap/00_EXECUTION_PROTOCOL.md` for every autonomous handoff.
- Only mark work verified when current checks or player-facing evidence support the claim.
- `01_VERIFIED_DONE.md` records verified outcomes; `02_REMAINING_WORK.md` records admitted active work;
  `06_RETAINED_FUTURE_BACKLOG.md` preserves unscheduled ideas without claiming commitment.
- Keep stable feature-family IDs. Link to detail instead of copying entire specs.
- A green check does not prove visual quality, usability, reachability, or fun.
- Do not import campaign dispatch state, worker self-scores, transcript claims, or iteration counts as
  completion evidence.
- Update acceptance/integration/resume pages together when a program-level state transition occurs.
- Only the lead/status integrator edits `NOW.md`, global completion rows, the shared Git index, or commits
  from the primary shared worktree. Feature agents return an uncommitted diff and receipt unless they were
  explicitly assigned a verified isolated worktree.
