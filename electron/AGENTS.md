# electron/

Desktop shell only. It serves the same game route as the browser.

- `main.cjs` must not change gameplay, assets, or reachability. Isolated evidence must not use the player save directory.
- `preload.cjs` is the bridge. Do not expose Node to the page beyond the existing API.
- Player saves go to the shared loopback store both shells read.
- `check:launch-policy` is the contract. Shell concerns stay in this folder.
