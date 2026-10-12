# Economy player-trust verification

Audited base: `d748312d1f28a1c954b6bbc508749191bee82457` on `coldshalamov/SpaceFace`.

Read `design/economy-player-experience/ECONOMY_RESEARCH.md` for the global economy audit, design rationale, implemented changes, and separately identified remaining campaign. `VERIFICATION.md` records what was actually run.

## Commands

From the repository root, with Node 22:

```sh
node tools/economy-player-trust/verify.mjs
node tools/economy-player-trust/probe.mjs
node tools/economy-player-trust/verify.mjs --wide
```

The default verifier runs 237 passing targeted tests against the production economy at this patch. It explicitly excludes five files with independently reproduced baseline problems; it does not skip individual assertions or replace dependencies with stubs. The `--wide` run includes those files and produced 243 passes plus five baseline failures in the engineering-packet environment. A normal dependency-installed checkout should rerun it rather than assuming the local limitations apply.

`probe.mjs` emits JSON showing real quote/execute results for a fixed local market, standing levels and affordable route plans. It does not tick the world between the round-trip trades. Its two stations and starting funds are explicit test setup, not new-game gameplay changes.

## Browser fixture and full-game acceptance

Serve the repository root and visit `/tools/economy-player-trust/fixture.html`. This imports the production market screen, station frame/styles, and economy simulation. It intentionally omits the 3D background, normal boot, and unrelated systems. It is not shipped gameplay and is not a substitute for the flight-to-station test.

Required manual/browser checks:

1. Expand Route intelligence, record wallet/cargo/stock, choose Review load, and verify no wallet/cargo/stock/course change. The selected lot and quantity should match `window.economyFixture.planned()`.
2. Inspect Quote breakdown and its credits-after value. Buy once; verify the stated batch total and accepted quantity. Repeated clicks cannot reuse a settled transaction.
3. Review another lot, change the source quote before confirming, and verify a price increase requires renewed consent. The haul shortcut must not navigate on failure.
4. Switch to Sell; distinguish proceeds from profit, preserve sealed cargo, and check an unavailable quote renders as unknown rather than free.
5. Use Set course separately; verify that navigation does not purchase cargo. Repeat with keyboard and touch input.
6. Review desktop, narrow landscape and portrait layouts; focus, long names, high balances, 200% zoom, reduced motion, and touch target sizes. Test the real dock/undock route after the fixture.

The fixture exposes `window.economyFixture` only on this test page to support inspection; production boot does not import the page or test tools. The local browser navigation was administratively blocked, so these checks remain unexecuted here.

Full game acceptance, after installing normal dependencies and assets:

```sh
SPACEFACE_PLAYER_STORE_DIR='' npm run player-truth -- --mode=adventure
```

Do not treat the Node route microbenchmark as mobile frame-time evidence. Do not treat a full hold sold over many simulated market-recovery intervals as one immediate profitable voyage.
