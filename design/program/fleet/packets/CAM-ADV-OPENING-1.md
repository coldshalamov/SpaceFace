# CAM-ADV-OPENING-1 — calm truthful Adventure opening

Builder packet. Work in the shared checkout. Do not create a worktree. Do not commit. Edit only the files needed for this opening-truth repair, expected among: `src/ui/wantedReason.js`, `src/ui/sectorLawPresenter.js`, `src/ui/hud.js`, `src/systems/heat.js`, law/onboarding/opening-quiet files, plus focused tests. Do not touch render batch files, worker transport files, or Swarm teaching/HUD files owned by other lanes.

Read the experience audit receipt at `.devshots/fleet/runs/CAM-AUDIT-EXPERIENCE-1.neon2.2026-11-24T22-49-53/RECEIPT.md`, especially task D5. Repair the opening so a player who does the requested loose-rock throw is not treated as a criminal and the first ten minutes stop lying:

- The authored opening throw/unclaimed rock beat must not trigger cargo-theft WANTED heat or patrol intercepts.
- `wantedClearClause` must never freeze at `clears in 6s`; show actual remaining decay time when decaying, or an honest zone/search-state message when not decaying.
- Law banners must not call the player's Hitch a Hornet; use the actual hull or plain `you` wording.
- Suppress opening-inappropriate `VAEL INSTRUMENT` chatter and giant dock graffiti around Helios/Act I if they are firing on the ordinary opening route.
- Make tracker/chart wording consistent (`M · Chart`, not stale `N Star Map`) only where it is part of this opening surface.
- Do not silence all law response everywhere as a shortcut. Preserve real wanted behavior outside the authored opening beat; add regression coverage proving both cases.

Verification required:
1. Focused unit/simulation tests for the opening exemption and real wanted behavior.
2. A focused test proving the clear wording ticks or reports the true hold cause.
3. If feasible, use the existing first-ten-minutes/probe route through `node scripts/fleet/game-lock.mjs run -- <command>`; otherwise report live-route evidence as unverified. Never run two game/browser measurements at once.
4. `node --check` changed files and relevant plain-words checks.
5. Do not commit.

Write the fleet receipt with exact player-facing changes, evidence, and remaining risks.
