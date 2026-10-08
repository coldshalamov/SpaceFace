# src/localization/

Copy and layout. Not simulated state.

- `catalogs/en-US.generated.js` is the inventory. Do not hand-edit it.
- Placeholders `{name}` must survive translation. `hasPlaceholderParity` is the check.
- Phrase and glossary replacement matches whole tokens, not substrings. `Load` must not rewrite `Loading` or `payload`.
- A non-English string is reviewed only from `PHRASES`, barks, or `STORE_COPY`. Machine fill stays under the preview label until coverage is at least `LOCALE_REVIEWED_GATE`.
- Pseudo-locale `qps-ploc` is for growth tests. It is not a shipped language.
