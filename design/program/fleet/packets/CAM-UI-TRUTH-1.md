# CAM-UI-TRUTH-1 — front-door truth repair

Builder packet. Work in the shared checkout. Do not create a worktree. Do not commit. Edit only:
`src/ui/screens/newGame.js`, `src/ui/screens/help.js`, `src/ui/orrery/newGameLayouts.js`, `src/ui/orrery/helpLayouts.js`, and if truly needed `scripts/check-plain-words.mjs` or a focused test file you create for this packet.

Read the experience audit receipt at `.devshots/fleet/runs/CAM-AUDIT-EXPERIENCE-1.neon2.2026-11-24T22-49-53/RECEIPT.md`, especially task D7. Fix the front-door lies professionally, not by adding explanatory clutter:

- New Game: Standard must not wear Casual's blurb; remove or honestly implement the dead faded UNIVERSE SEED row; make the starter role label consistent with Shipyard; remove orphan/misleading explanatory text; avoid decorative ring noise if it is part of the screen you touch.
- Help: remove banned/meaningless `THE RIG LIGHTS WHAT IT DRIVES`; make mining/scan prompts match live bindings (`G` mine, `C` scan on current defaults) rather than hardcoded old keys; use live prompt helpers where possible; remove duplicate/conflicting steering wording if present.
- Every visible control must either work or be gone. Do not use simplistic text-count or density proxies. Judge what a stranger needs in the first minute.

Verification required:
1. `node --check` every edited JS file.
2. `node scripts/fleet/game-lock.mjs run -- node scripts/ui-bench.mjs --shot=new-game,help --viewports=1280x720,390x844 --walk --out=<your run dir>/bench` and open all PNGs yourself. Fix what you see.
3. `npm run check:plain-words` and focused tests you add/update.
4. Do not boot the full game. Do not commit.

Write the fleet receipt with exact player-facing changes, evidence, and anything unverified.
