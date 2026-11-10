# Moment Machine live adapter

The default `installLiveClipDirector(bus, { stateOf, tickOf, seedOf })` now installs capture of the actual presented flight canvas. Pause → Replay shows those frames under the existing tape controls. Pause → Clips combines the existing rated moments with Moment Machine selections and exports the captured pixels.

`src/systems/killReplay.js` owns copied poses: 10 Hz, nearest twelve actors, thirty seconds. The worker mirrors only `replay.latestPoseSample`; the UI retains the bounded metadata history. Native video, renderer, Blob and bitmap objects stay out of GameState. Kill-cam body-ring behavior remains intact.

Capture is bounded to thirty seconds, ten frames per second, 640 px width and 32 MiB compressed JPEGs. Pause and hidden windows stop capture. New game, load, menu and disposal release streams and clear recordings. Replay seeking does not move the live camera or entities.

`exportRecordedClip` produces GIF from genuine pixels or MP4 through the browser codec. A browser lacking MP4 produces explicitly labelled WebM. Missing recorded frames return unavailable; poster art is never exported as footage. `exportLoggedMoment` uses the same action. Existing explicit RGBA export fixtures remain supported.

`tools/moment-machine/headedCapture.mjs` can consume the capture ring from an already-running public flight page for offline encoding. Without that page it reports `live-flight-page-required`; opening a menu or generating a title card never verifies video.

Focused checks: `test/flight-footage.test.mjs`, the existing kill/replay/Clips tests, and `test/moment-machine/moment-machine.test.mjs`. The obsolete unapplied patch was removed.
