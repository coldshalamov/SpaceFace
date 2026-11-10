# Task BM18-20 — three filed small defects in one bounded batch

Read first: `_constraints-codex.md`. Three small player-facing defects from the demo defect
ledger (read each row in `design/program/DEMO_READINESS_2026-09-20.md` §6). One focused test or
fixture check per fix; delete the ledger row in your final message listing (the orchestrator
deletes it in the fixing commit).

1. **D206** — pad player has no Back on B in the swarm between-round shop
   (`src/ui/screens/crucibleDraft.js`). Cheapest correct fix per the row: route pad cancel
   through the same first-press guard Esc uses, then the second press launches. Preserve the
   keyboard Esc behavior exactly.
2. **D212** — Photo mode: Exposure and FOV labels overlap their sliders, bottom-left, detached.
   Fix the layout so each label sits with its own slider; keep the compact instrument look; no
   redesign. Check with a ui-bench shot of photo mode if the bench covers it, else say so.
3. **Market screen overlap** — station-market "Ledger" overprints "Comms" (seen in the D202
   typography pass at phone/desktop widths; pre-existing). Find the actual overlap in the market
   screen header/tab rendering and fix the layout collision minimally (z-order or spacing), at
   both 1920x1080 and 844x390.

## Done when

- Each defect: fix + a pinned check (a focused test where the file has them; for pure layout, a
  ui-bench shot or a computed-style assertion in an existing fixture — name what you used).
- Report exact files + what you verified per fix.
