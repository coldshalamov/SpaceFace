# INV-07b — Re-measure the PLAY -> first hostile window after the prewarm hold (READ-ONLY, measured)

You change no tracked file. Re-run exactly your INV-07 probe (`.devshots/fleet/inv07/`) on current HEAD, through the
lock, twice. HEAD now holds hidden-screen prewarms during the loading screen (commit "perf(load): the loading screen
holds hidden-screen prewarms"). Report, for each run and next to your INV-07 numbers: the label timeline (especially
"Preparing the visuals"), total window, Chrome TaskDuration / RecalcStyleDuration / RecalcStyleCount / LayoutCount /
ScriptDuration, busy vs idle, and the cook ledger rows. Then: in the first 30 s of flight after the first hostile,
frame-interval p50/p95/max and how many hidden-screen prewarms ran in that window (the deferred queue now drains in
flight - say whether it causes frames over 50 ms).
