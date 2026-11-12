# STAB-05 — Continue restores the latest stable primary

Read the normal Continue path and the existing recovery-race tests. When the primary changes from
A to B during decode and from B to C during the retry, the current path restores B even though
durable storage contains C. That can resume older progress and overwrite C on a later autosave.

Verify the primary generation after the second decode. Use the existing bounded stable-pair retry
path when the generation changes again. Preserve ordinary and recovery loads and keep persistent
churn bounded. Follow the existing failure contract when no stable save can be read.

Owned files: `src/save/saveSystem.js` and `test/save-shared-continuation.test.mjs`.
Add a regression through the real shell fixture for two valid replacements during decode and run
`node --test test/save-shared-continuation.test.mjs`. No browser run by the worker.
