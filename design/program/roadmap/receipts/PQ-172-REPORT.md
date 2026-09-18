DONE  PQ-172.00 + PQ-172.01 — JSON content packs load through the existing data validators
into the live registries, a sample pack proves all four kinds end to end, Settings lists
installed and rejected packs, and the Steam Workshop bridge mirrors subscribed items into
the same loader path and can publish a local pack. No script mods; JSON only.

WHAT I FOUND     Every data consumer snapshots the definition tables into Maps at module
evaluation (`ships.js`, `encounters.js`, `sectorZones.js`, combat/loadout readers), so a
runtime `fetch()` after `main.js` imports would always be too late — content had to exist
synchronously before the module graph evaluated. The only honest channel is server-side
injection: the shared game server scans the content directory, serializes the validated
records, and injects a classic inline script assigning `globalThis.__SF_USER_MODS__` ahead
of the module scripts in `index.html`. Browser and Electron share that server, so one seam
covers both hosts. On Workshop: `steamworks.js` already exposes the full UGC surface
(createItem/updateItem/subscribe/getSubscribedItems/installInfo/download) and the repo's
adapter pattern (lazy optional binding, fail-closed absent) was the right shell for it.

WHAT I CHANGED
- `scripts/lib/userContentStore.cjs` (new): deterministic scanner — sorted mod dirs, sorted
  filenames, explicit-order encounter merge; per-record and total-payload size ceilings,
  per-kind file-count bounds; parse errors recorded per mod, never thrown.
- `scripts/lib/gameServer.cjs` + `server.js` + `electron/main.cjs` (shared-change, additive):
  `userContentDir` option resolved per host (repo `user-content/` in dev, userData dir under
  Electron); `index.html` responses get the payload injected inline and bypass weak-etag
  304s so mounted content can never serve stale.
- `src/data/userContent.js` (new): normalizes the injected payload, claims ids, tracks
  accepted/rejected records per mod, exposes `listUserMods()` for Settings and
  `window.SF.userMods`.
- `src/data/weapons.js`, `modules.js`, `encounters.js`, `sectorZones.js`: each registry owns
  validation of its own vocabulary (fields, enums, cross-refs); zero candidates returns the
  shipped tables untouched — identical identity, identical determinism. Encounter `script`
  ids are restricted to ids the shipped catalog already declares; barks get a frozen overlay.
- `src/data/sample-content/helios-surplus/` (new): sample pack "Helios Surplus" — one
  weapon, one module, one encounter, one place — exercising all four kinds.
- `src/ui/screens/settings.js`: Gameplay tab gains a Mods section — content dir, per-mod
  status (loaded / rejected with reasons / parse errors), content counts, and the Workshop
  row (sync + publish words) that only renders under the Electron shell bridge.
- `electron/workshopMods.cjs` (new) + `steamworks.cjs` `workshop()` accessor +
  `main.cjs` IPC + `preload.cjs` bridge: publish validates the local pack (manifest, kind
  dirs, refusal of Workshop mirrors and unsafe paths), createItem+updateItem round-trip;
  sync lists subscribed items, downloads pending ones, mirrors payloads into
  `workshop-<id>` dirs under the content root with `workshopItemId` provenance, and prunes
  mirrors for items no longer subscribed. Reentrant sync joins the in-flight call.
- `scripts/check-data.mjs` + `scripts/check-data-refs.mjs`: `--user-content-dir[=]<dir>`
  installs the scanned payload before module eval so merged content is held to the same
  export and cross-reference contract as shipped data.
- `package.json` + `scripts/check-ci-report.mjs`: `check:pq172` (data check with the sample
  pack mounted + the Workshop round-trip test), appended to the main `check` chain.
- `build/steam/README.md` §7: owner-side steps for the real Steam round-trip (app id,
  binding install, legal agreement).

EVIDENCE
- `npm run check:pq172` — green: 17/17 data modules OK with the sample mounted
  (WEAPONS 25→26, MODULES 83→84, ENCOUNTERS 55→56, sector place merged), all 7 Workshop
  tests pass (publish validation, traversal refusal, mirror+prune, adapter presence,
  non-Steam no-op, loader integration of a mirrored pack).
- `node scripts/check-data-refs.mjs --user-content-dir=src/data/sample-content` — merged
  cross-reference integrity OK (wpn_26 mod_90).
- Determinism: `check:release-soak` full mode, seeds 47/109 — hashes identical to the
  pre-change baseline (`6428a581cb34…`, `e3a52e6bf91d…`); no-payload merges return the
  shipped tables by identity.
- Live browser: `SF.userMods.list()` reports helios-surplus `loaded` with 1 weapon /
  1 module / 1 encounter / 1 place; Settings → Gameplay renders the Mods section in kit
  style, Workshop row correctly absent without the shell bridge; with the bridge stubbed,
  sync/publish words appear and sync toasts "mirrored 1 pack(s) — restart to load".
- Save-compat: unknown mod ids resolve to null defs through the existing `defById` paths;
  removing a pack degrades to shipped behavior, never corrupts a save.

LIMITS
- The real Steam round-trip needs the packaged partner build and a signed Workshop
  agreement — owner-side per `build/steam/README.md` §7. The bridge is proven against a
  faithful fake of the steamworks.js UGC surface; absent the binding it reports
  `available:false` and touches nothing.
- Script mods remain out of scope by design: JSON records pass through the owning
  validators only; encounter scripts can only reference shipped script ids.
