# Orchard target facts follow the finite socket

Selecting the real tick1319 Orchard socket0, cycle2, exposes two hydrogen units in the existing
descriptor. The production target panel instead printed `Holds Scrap Metal ×4 · Hold RMB · work
site`, inherited from the frame's generic wreck envelope. Opening work and held-input guidance
were also absent from that facts line.

`targetPanel.js` now reads the already-normalized socket descriptors for canonical Orchard
frames. It shows current hydrogen quantity, the configured beam key, opening/closing percentage,
phase refusal, and released/collected/lost state. The mounted target card refreshes quantity and
progress without reselecting the socket. A collected or lost pod cannot make an open socket
claim it is closed. Missing/invalid custody, wrong sector, stale handles and noncanonical frame
geometry show an unavailable state. Ordinary wreck facts and station services keep their existing
branches. This is presentation only; it changes no custody, input binding, native operation,
save, work rate, geometry, range, damage law or admission threshold.

Base is public CI merge `60c35396d501199dc9134228f1fe58e7111710b1`, whose complete tree equals
the previously accepted `a4ba56e30fc89e6c6d92f1c637e627fb7db5f2c7` composition. The original
production-checkpoint failure and eight actual pre-fix UI failures are preserved in the recovery
packet, along with two initial test-setup mistakes and the intermediate edge-case failures.
The saved-state observer also preserves its initial vector-class comparison failure; the corrected
observer compares the same coordinate values consistently with the cloned baseline.

Final `node --test test/anvil-orchard-target-readout.test.mjs` passes 11/11, including the mounted
production target-card renderer with a parsed DOM port, live updates, rebinding, paused work,
terminal states, invalid inputs and ordinary-wreck preservation. The five-file neighboring UI/
descriptor/thermal selection passes 40/41. Its one unchanged existing assertion expects
`Mass 5000` for an unidentified station; the station-service implementation and that test are
unchanged from the base. Reachability and player-facing-label checks pass. Separately, the
exact eight-file serial Orchard command passed 34/34 in 34.526 seconds on one attempt; its 6,882
pre/post production-source fingerprints are byte-identical. The selected target-panel and
focused-test bytes match the command packet; the delivery workflow appends only the already-
executed focused test filename. This is bounded local evidence, not hosted CI or whole-game
acceptance. Original logs and exact source/test hashes are retained; the neighbor group is not
reported fully green.

A separate full-production save/restore readout probe loads the exact original tick1319 save,
renders the target card, observes `Hydrogen Gas · 2 units · hold B to release`, and confirms the
finite row, actor pose, saved bytes and tick are unchanged by presentation. This is headless
readout integration, not new input/flight, browser layout or hit-testing acceptance. The earlier
cycle2 pickup and refill/residency routes were not replayed.

The three UI source paths form the target-readout change. The four-path delivery selection
separately appends only `test/anvil-orchard-target-readout.test.mjs` to the existing serial
Orchard CI step; its guard, concurrency and budgets are unchanged, with no other workflow
behavior change. No hosted CI pass is inferred from local results; verify the eventual public
commit and its exact-head CI separately. No merge, deployment, credentials or security setting
is claimed.

Startup remains a separate open investigation. PR444/445 own the current renderer/cook paths;
PR447 owns its startup/Continue paths. Their files were preserved. The observed loading/tick0
diagnostic does not establish a cause, and this target-facts correction is not a startup fix.

The original and improved inspection images are exported authoring-GLB previews. They use the
uncompressed model exports, not the compiled meshopt/KTX2 runtime package or live game lighting.
The original image is unchanged; additional fill/rim lighting and an oblique construction view
make trusses/platform edges easier to inspect without changing asset materials. Asset quality,
compiled rendering, live socket motion, browser hit-testing and broader acceptance remain open.
