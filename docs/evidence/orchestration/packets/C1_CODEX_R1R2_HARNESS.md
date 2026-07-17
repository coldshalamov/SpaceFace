# Packet C1 — Codex: R1/R2 natural-route harness foundation

## Wait

Start only after F0 return exists, **unless** orchestrator marks F0 deferred and this packet is pre-approved for pure harness work that doesn't need taste ranking.

## Mission

Build **headless + browser-script** acceptance for unique wreck literacy **without `window.SF` travel/eligibility compression** as primary acceptance.

## Live context (do not re-derive)

- `uniqueWrecks.js` ~1.3k lines exists; R1/R2 focused checks green
- Sweep script: `scripts/check-depth-program-r2-sweep.mjs` uses isolated bus emit of rumors — good for determinism, **not** natural route
- M2: entity positions are **galactic-global**; sector-local authored coords need `sectorLocalToGlobalForSector`
- 12 wrecks in `src/data/uniqueWrecks.js`
- One drop per save; `check:unique-loot` must stay green

## Worktree

Create: `../SpaceFace-orch-codex-r1r2` from branch `orch/codex-r1r2` based on  
`grok/depth-player-route-actualization` (or master if instructed)

## Tasks

1. Audit how bearings appear on map for players (mapAuthority / galaxyMap seams)
2. Design natural route harness: New Game → Helios → rumor surface → map bearing → flight → scan → decision → claim
3. Prefer **production events** over SF; if compression needed, label `primaryAcceptance: false`
4. Multi-seed ≥5 for teaching wreck D10 Choir-Tender first
5. Document REAL vs HARNESS failures

## Acceptance

```
npm run check:unique-loot
npm run check:depth-program:r1
npm run check:depth-program:r2
npm run check:sim:compare   # if sim touched
# plus any new script you add, green
```

## Return

`docs/evidence/orchestration/returns/C1_CODEX_R1R2_RETURN.md`

## Forbid

assets, render thrusters, mining rewrite, station UI redesign, design/program status edits
