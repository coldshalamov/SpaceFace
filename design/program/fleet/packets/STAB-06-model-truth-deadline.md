# STAB-06 — Bound the model truth census download

The normal main thread and simulation worker bootstrap both await the model truth census. The
browser loader can remain pending forever while awaiting headers or body bytes, leaving the menu
unreachable and bypassing the boot error boundary. Use a 15 s browser deadline covering both
headers and body, as with the scenario contract. Identify the model truth census in the timeout.
Preserve the shared in-flight promise, Node loading, and the existing retry after a failed fetch.

Owned files: `src/data/modelTruth.js` and `test/model-truth-json-loader.test.mjs`.
Use the loader in a browser-like test realm to verify timeout and retry without launching a browser.
Run `node --test test/model-truth-json-loader.test.mjs`.
