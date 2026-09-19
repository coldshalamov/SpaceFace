# Source context and reproducibility

Input: user-supplied `01-chronicler.zip`, specifically `BRIEF.md`, `CONVENTIONS.md`, the measurement report, and the supplied bus, causality, aftermath, ace, heat, salvage, loot, and narrative source context.

Packet baseline: `coldshalamov/SpaceFace`, `de9f3f1fc`.

Additional interface verification through the connected GitHub repository: `master` at `94f38d342b8730df104777e64a5457a4ffb725f3`, checked on September 19, 2026. Files checked included `src/core/registry.js`, `src/ui/marketNews.js`, and the relevant completion path in `src/systems/mining.js`. In particular, current ticker input is `news:publish`, and native `salvage:completed.loot` is not an inventory acquisition receipt.

The delivered `fixtures/eventBus.js` and `fixtures/killCausality.js` are unmodified copies of the corresponding files in the user-supplied packet. They are harness support only and are not installed over the game's own files. Production code is confined to the seven new modules under `repo/src/`; no asset or font files are included.

Evidence is produced by the delivered scripts and tests. Synthetic names, cargo allocations, law receipts and event tapes are test data, not claims about actual SpaceFace play sessions. The implementation deliberately labels unsupported source chains as incomplete rather than using those test data in live state.

`MANIFEST.json` inventories package files and their SHA-256 hashes. It excludes its own hash to avoid self-reference. The separate repository-relative patch, when included, contains only the same new `repo/` files; it does not modify registry or save wiring.
