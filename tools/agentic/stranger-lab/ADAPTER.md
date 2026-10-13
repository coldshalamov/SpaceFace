# Stranger Lab adapters

These are not applied. The campaign does not edit the shared files.

## Headed viewport

`src/testing/lab/chromiumHost.js` opens Playwright at 800×600 inside
`runChromiumLabScenarioInternalBody`. Stranger Lab's touch surface is 390×844.
A one-line change would thread the viewport through the internal options object:

```js
const page = await browser.newPage({
  viewport: options.viewport || { width: 800, height: 600 },
  deviceScaleFactor: 1,
});
```

`runChromiumLabScenario` (the public certifying entry) rejects a second argument,
so the call site would stay on `runChromiumLabScenarioInternal`. Stranger Lab does
not apply this edit. `lib/headed.mjs` launches Chrome itself at 390×844 against
`chromiumHostPage.html` and records the result. `deviceTested` stays false.

## Browser scenario host

`src/testing/lab/browserScenarioHost.js` is read, not edited. The simulated touch
path uses `createLaneTouchReducer` from `src/systems/mobile/laneTouchReducer.js`,
which is the worker-lane phone deck and does not need a host registration.
