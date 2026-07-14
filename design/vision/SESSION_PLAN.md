# PLAYABLE DEMO CHECKPOINT

**Date:** 2026-07-14  
**Status:** The beginning of the game is playable and has one repeatable proof command. The larger Depth Program is paused, not finished.

## What works now

The verified demo starts from the normal title screen and uses normal keyboard and mouse controls. It proves:

- New Game launches with authored ship and station assets.
- Ordinary flight input works.
- The Star Chart can find Helios Station and arm the flight computer.
- The player reaches a real dock prompt and physically docks.
- The live station screen opens and the outfitting preview matches the real equipped module.
- The player can undock, choose the Hunter opening, track its mission target, and enter readable combat.
- A separate normal route crosses a gate, saves with F5, reloads to the title, clicks Continue, and restores the destination.

Run the whole checkpoint with:

```powershell
npm run check:demo-opening
```

Evidence is written to `.devshots/alpha/demo-opening-checkpoint/`.

Checkpoint commits:

- `e24596ab` — first-hour/onboarding checks updated to the current ten-step tutorial.
- `f05997d6` — playable opening checkpoint command and real Chrome route.

## Important limits

- This checkpoint proves that the opening game works. It does not claim that the entire Depth Program is finished.
- The demo route sees the tutorial and its objective tracker, but it does not automate completion of every tutorial step.
- Launch can take tens of seconds; one manual Chrome run measured about 80 seconds. The current Kestrel and Helios startup models total roughly 74 MB and are decoded one after another. Fix this in the asset/render lane after its active lock clears; preserve visual quality and measure each startup stage before and after.
- The stricter M3 recovery test still waits for the player to die after the first hit. On Standard difficulty the player survived, so that separate death/recovery stress test remains open. The demo correctly stops after proving readable natural damage while the player is alive.
- The bundle itself builds, but the current material-sharing budget check reports 53 visible material keys against a ceiling of 49. That belongs to the active asset/render lane; do not reduce graphics quality to silence it.

## Depth Program status

The live ledger currently has 31 chunks: 15 marked IN-PROGRESS, 16 still TODO, and none accepted as DONE. Do not start more chunks until an existing one is completed with its real player-facing proof.

Three especially important unfinished integrations are:

- S4 Authority/Thunderchild: reducer groundwork exists but is deliberately not registered in the game.
- W1 planet states: groundwork exists but is not a finished player-facing system.
- A2 Ship's Ledger: code exists but is not wired into the station while another agent owns that UI.

The full per-chunk record remains in `design/depth-program/PROGRESS_LEDGER.md`.

## How to resume later

1. Read `AGENTS.md` and this file.
2. Run `git status` and preserve every unrelated dirty file.
3. Run `npm run check:demo-opening`. If it is red, restore this checkpoint before adding features.
4. Check the station and asset ownership signals. Do not edit those lanes while their agents or lock files are active.
5. First fix the long Launch delay in the proper asset/render lane, then choose one IN-PROGRESS Depth chunk and finish it completely. Do not open another broad batch.
6. Update this file and `design/depth-program/PROGRESS_LEDGER.md` with the exact command, result, and player-facing evidence.

Copy-paste restart instruction:

> Read AGENTS.md and design/vision/SESSION_PLAN.md. Preserve the dirty tree and active station/asset lanes. Run npm run check:demo-opening first. Keep the playable opening green, then finish one existing IN-PROGRESS Depth chunk to its real player-facing acceptance. Update SESSION_PLAN.md and PROGRESS_LEDGER.md before stopping.
