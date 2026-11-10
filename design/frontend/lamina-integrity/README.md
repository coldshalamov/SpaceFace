# Lamina — flight hull integrity

Implemented against `ded324e70729a9e6dadde195755a58c47ad08020` in `coldshalamov/SpaceFace`.
The default `createHud()` route mounts this instrument; this is not a concept-only replacement.

## Reading the instrument

The selected ship's canonical 48 × 28 silhouette is projected nose-up by an explicit SVG matrix.
Sixteen split laminae, a central spar, clipped damage hatching and facet lighting retain the hull's
identity at every health value. The laminae each encode an interval of **global** hull integrity:
this is not a diagram of damage to specific physical subsystems. No subsystem simulation is invented.
The shield is a separate, symmetrical split envelope. Each half measures the same global shield
value; neither claims a damage direction or a separate hemispherical shield pool.

A large vector percentage is always present, unlike the retired low-health-only numeric header.
The custom figures reuse the Velocity Rail's authored path alphabet, not a downloaded font or a
seven-segment digit. The carrier is a produced SVG kit asset, with smoked-glass facets and local edge
light. It uses no SVG filter, blur, backdrop-filter, raster readout, or extra WebGL pass.

Health reads immediately from the entity. Only a separate damage echo eases, holding for 100 ms and
settling within 780 ms. Repair has a bounded spar highlight; actual hull never lags or overshoots.
Shield gain indicates recharging, and depletion indicates offline. Critical remains visible during
repair. A missing player or invalid telemetry says NO DATA; zero shield capacity says NOT FITTED.
Zero hull means DESTROYED. Rounded interior values stay between 1 and 99, so 0 and 100 cannot falsely
claim destruction or full integrity.

## Ownership and integration

`src/ui/views/hullIntegrity.js` owns presentation state and authored live SVG. `hullIntegrityStyles.js`
is a once-per-document, component-scoped stylesheet following the current Velocity Rail convention.
`flightInstruments.js` exports the factory and updater. `hud.js` passes the existing authoritative
player entity, its existing frame delta and the game's accessibility flags. There are no new bus
listeners, timers, frame loops, synchronous layout reads or simulation writes.

The old health hit handler's `offsetWidth` flush and timeout are removed. The old shield spring is
removed only from this health instrument; other vitals retain their original settle controllers.
The old low-health-only header is superseded by the instrument's two labelled accessible meters.
The existing orbital presentation fixture is migrated rather than left referencing a missing ring.
The global HUD and the new speed instrument are not redesigned by this change.

The visual contract is a 272 × 174 artboard inside the existing left stack. It scales to that stack's
narrower width while HTML labels remain at least 12 CSS pixels. The carrier contains its own backing,
so it does not require the environment to be dark. Reduced-motion/flash flags, OS reduced motion,
high contrast and forced colours have distinct handling. There is no idle animation to suspend.

## Reproducible checks

```
node --test test/hull-integrity.test.mjs test/velocity-rail.test.mjs test/orbital-presentation.test.mjs test/hud-flight-attention.test.mjs test/j07-hud-contract.test.mjs test/hud-contact-roster-keyed-rows.test.mjs
```

The packet includes the actual test output, browser captures and any additional validation notes.
`test/fixtures/hull-integrity.html` is an interactive fixture using real production modules, synthetic
telemetry and an explicitly finite demo clock. It is never imported by the game. The standalone
`PREVIEW.html` in the delivery packet embeds those same modules, the custom figures and SVG carrier;
it opens offline and does not need a server or font files.

Review full-game performance on the actual target PC after integration. The supplied code packet
omits heavyweight game assets, so a component/DOM-HUD capture is not evidence of full 3D gameplay.
