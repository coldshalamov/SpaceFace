# Stranger Lab adapters

Stranger Lab does not edit `src/testing/lab/chromiumHost.js` or
`chromiumHostPage.html`.

## Headed viewport

`chromiumHost.js` opens Playwright at 800×600 inside
`runChromiumLabScenarioInternalBody`. Stranger Lab does not call that Node
launcher. `lib/headed.mjs` starts Chrome, sets device metrics to 390×844, loads
`chromiumHostPage.html`, and calls `runBrowserLabScenarioInternal` with the
recorded tape compiled as a focused flight scenario. `deviceTested` stays false.
No frame rate is claimed.

If that call does not step the tape, the headed status is `unverified` and the
error is the browser or compiler message. `host-loaded` is not a success.
