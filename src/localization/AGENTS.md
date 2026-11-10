# src/localization/

Copy and layout. Not simulated state.

- `catalogs/en-US.generated.js` is the inventory. Do not hand-edit it.
- Placeholders `{name}` must survive translation. `hasPlaceholderParity` is the check.
- Phrase and glossary replacement matches whole tokens, not substrings. `Load` must not rewrite `Loading` or `payload`.
- `glossary/<locale>.js` is the per-locale reviewed term glossary (the AL-SHOW-5 sign-off artifact);
  `pipeline.js` reassembles the four files into the machine pass's whole-token table.
- `firstHourOverlay.js` is the reviewed first-hour overlay (AL-SHOW-5): the row-409 capture
  inventory plus boot plate copy, whole-string lookups only — never substituted mid-string.
- A non-English string is reviewed only from `PHRASES`, barks, `STORE_COPY`, or `FIRST_HOUR_OVERLAY`. Machine fill stays under the preview label until coverage is at least `LOCALE_REVIEWED_GATE`.
- Pseudo-locale `qps-ploc` is for growth tests. It is not a shipped language.
