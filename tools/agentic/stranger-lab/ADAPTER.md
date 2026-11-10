# Stranger Lab adapters

Stranger Lab does not edit `src/testing/lab/chromiumHost.js`,
`chromiumHostPage.html`, or `browserScenarioHost.js`.

## Headed viewport

`chromiumHost.js` opens Playwright at 800×600 inside
`runChromiumLabScenarioInternalBody`. Stranger Lab does not call that Node
launcher. `lib/headed.mjs` starts Chrome, sets device metrics to 390×844, and
loads `public/journeyHostPage.html`. That page calls `replayJourneyTape`, which
builds the journey with `systemsForBrowserJourney` and steps the recorded tape
through the same world setup as the headless session. `deviceTested` stays
false. No frame rate is claimed.

`browserScenarioHost.js` remains the focused flight bundle. A tape stepped
there is not a combat, docking, launch, tether, mining, buy, scan, mission,
crucible, or save replay. Headed rows whose journey world was not actually
stepped are `unverified`, with `browserStatus` unset or `unverified`. They are
not `pass`, and they are not called replayed.

## Ready-to-apply flight-host hook

`runBrowserLabScenarioInternal` already accepts `options.systems`, then rejects
the scenario in `assertChromiumParitySupported` unless the fixture is flight or
empty-flight and the system list is the exact focused flight bundle. To let
that host run a stranger journey without changing its default parity path,
gate the parity assert on an explicit caller flag and pass the journey systems:

```javascript
// src/testing/lab/browserScenarioHost.js
// inside runBrowserLabScenarioInternal, before assertChromiumParitySupported
if (options.journeySystems === true) {
  if (!Array.isArray(options.systems) || options.systems.length === 0) {
    return { ok: false, status: 'unsupported', error: 'journeySystems requires options.systems' };
  }
} else {
  const support = assertChromiumParitySupported(canonical);
  if (!support.ok) {
    return { ok: false, status: support.status, error: support.reason, chromiumSupport: support };
  }
}
const systems = options.systems || [...BROWSER_FOCUSED_FLIGHT_SYSTEMS];
```

The journey caller would pass `systemsForBrowserJourney(journey)` and skip the
empty-flight canonical. That edit is not applied. The stranger page is the host
that steps the journey. `scripts/lib/masslineControlLab.mjs` imports
`node:crypto`, so the no-op massline lab controller is not loaded in the page.
Tether journeys step `tetherGameplay` and `masslineTelemetry`.

If the page does not step the tape, the headed status is `unverified` and the
error is the browser message. `host-loaded` is not a success.
