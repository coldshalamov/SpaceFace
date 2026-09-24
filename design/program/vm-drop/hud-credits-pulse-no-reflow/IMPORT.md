# IMPORT — hud-credits-pulse-no-reflow

## What it is

Quiet settled main-thread profile on master tip attributed **~104 ms self** to a
**single** early-flight `refreshCredits` that restarted the one-shot gain/spend CSS
animation via `void chip.offsetWidth` (forced sync layout).

`restartCreditsChipPulse` removes pulse classes this frame and adds the next class on
the following animation frame. Superseded pulses bump `_sfCredPulseToken` so a stale
rAF cannot land the wrong class. Picture / pulse intent unchanged; no dummy prewarm.

## How to apply

```bash
git fetch origin
git checkout -B import/hud-credits-pulse-no-reflow origin/master
git am design/program/vm-drop/hud-credits-pulse-no-reflow/patches/*.patch
node --test test/hud-credits-pulse-no-reflow.test.mjs
```

Clean on bare master **`568d1358e`**.

## Evidence

- Primary KPI: sync layout reads on pulse restart **8000 → 0** (portable A/B).
- Profile cite: settled-45s on tip — `refreshCredits` **103.9 ms** self, **1** invocation (~872–975 ms into held-thrust window).
- Soft-GPU fps not claimed. Node wall of the fake layout getter is noise; the player win is the hitch.
- Focused tests: **4/4**.

## What this does not wire

- Other HUD `offsetWidth` animation restarts (lock ring, death banner, captions, cargo slots).
- No picture / bloom / shadow cuts.
- Does not merge to master (importer decides).
