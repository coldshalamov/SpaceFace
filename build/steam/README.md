# SpaceFace on Steam — owner steps (PQ-033.03)

Everything that can be built without a Steamworks partner account is already here. The steps below
are the ones only the account holder can do. Do them in order.

## What is already built

| Piece | Where | Command |
|---|---|---|
| Achievements (16), one source of truth | `src/data/achievements.js` | — |
| Steamworks paste list (API name, display name, description, hidden, icon files) | `build/steam/achievements/achievements.csv` (+ `.vdf`, `.json`) | `npm run steam:achievements` (`npm run check:steam:achievements` fails on drift) |
| Desktop shell Steam adapter (optional `steamworks.js`) | `electron/steamworks.cjs`, id table `electron/steamAchievements.json` | — |
| Store page art, screenshots and achievement icons (achieved + unachieved) at Steam's exact sizes + a local preview of the page | `build/store/steam/` (icons in `achievements/`), `build/store/preview.html` | `npm run build:store-assets` (`npm run check:store-assets`) |
| Unpacked Windows build for a SteamPipe depot + rendered build scripts | `dist/steam/win-unpacked/`, `build/steam/output/` | `npm run dist:steam` |
| SteamPipe script templates | `build/steam/scripts/app_build_APPID.vdf`, `depot_build_DEPOTID.vdf` | — |

In game, achievements unlock locally in every build (browser and desktop), show a one-line notice
and are listed under **Achievements** on the title screen's fine line and in Pause → Operations. The
desktop shell mirrors each unlock to Steam when the Steam build carries the `steamworks.js` binding
and Steam is running; otherwise it reports `available: false` and does nothing.

## 1. Create the app (partner site)

1. Create the app on partner.steamgames.com. Note the **App ID**.
2. Under SteamPipe → Depots, note the **Windows depot ID** (create one if needed).
3. Paste both into `build/steam/steam.config.json` (`appId`, `depots.windows`).
4. Under Installation → General Installation → Launch Options, add one launch option: Executable
   `SpaceFace.exe`, Operating System Windows. The depot root is the unpacked build folder, so the
   executable sits at the top of it.

## 2. Achievements (partner site → Stats & Achievements)

Steamworks has no bulk importer for achievements. Add one achievement per row of
`build/steam/achievements/achievements.csv`, in order:

- **API Name** = `api_name` (for example `SF_BERTH_ASSIGNED`). Must match exactly; the shell sends
  these names.
- **Display Name** = `display_name`, **Description** = `description`.
- **Hidden?** = `hidden` (1 = hidden).
- **Set By** = Client.
- **Achieved Icon** = the file in `achieved_icon`, **Unachieved Icon** = the file in `unachieved_icon`
  (64×64 JPEGs drawn from the kit glyph each achievement names; run `npm run build:store-assets`
  first, and `build/store/preview.html` shows every pair beside its achievement).

Publish the Stats & Achievements changes when done.

## 3. Steam Cloud (partner site → Steam Cloud)

Saves already live in one folder that the browser and desktop builds share, so Auto-Cloud needs no
code. Enable Steam Cloud, set the quota, then add these **Auto-Cloud root paths**:

| Root | Subdirectory | Pattern | OS | Recursive |
|---|---|---|---|---|
| `WinAppDataRoaming` | `SpaceFace/player-saves` | `sf.save.*.json` | Windows | No |
| `WinAppDataRoaming` | `SpaceFace/player-saves` | `sf.recovery.*.json` | Windows | No |

Only when macOS or Linux depots ship, add **root overrides** for both rows: `MacAppSupport` (macOS)
and `LinuxXdgDataHome` (Linux), same subdirectory. The folders come from
`scripts/lib/playerSaveStore.cjs` (`%APPDATA%\SpaceFace\player-saves` on Windows).

- **Quota:** 64 MB per user and 64 files. Five save slots plus quick/auto/index are about 225 KB each;
  `sf.save.crucible_meta.json` can reach a few MB with ghost tapes; `sf.save.achievements.json` is a
  few KB. 64 files matches the player store's own per-write key cap.
- `sf.settings.profile.v1.json` is deliberately **not** synced: graphics settings belong to the
  machine, not the player.
- Temporary files written during an atomic save are named `*.json.tmp-*` and never match the
  patterns. The `steam_autocloud.vdf` Steam drops in the folder is ignored by the save reader.
- Steam syncs these files when the game launches and exits, so a Steam launch always starts from the
  newest cloud copy.

## 4. Steam build of the desktop shell

The `steamworks.js` native binding is intentionally not a dependency of the normal build. For the
Steam build only:

```sh
npm install steamworks.js
npm run dist:steam
```

`npm run dist:steam`:

1. builds the bundle (`--skip-bundle` reuses `build/web`);
2. packs an unpacked Windows directory build into `dist/steam/win-unpacked/`, stamped
   `spacefaceDistribution: "steam"` in the packaged `package.json` — a Steam build never runs the
   GitHub self-updater (Steam delivers updates) and arms the Steam overlay and achievements at launch;
3. unpacks `steamworks.js` from the asar when it is installed (the `.node` file and the Steam API
   redistributable must sit on disk beside each other);
4. writes `build/steam/output/app_build_<appId>.vdf` and `depot_build_<depotId>.vdf` pointing at that
   folder and prints the upload command.

`npm run dist` (the direct-download installer) is unchanged.

Useful switches while testing a Steam build: `SPACEFACE_STEAM_APP_ID=<appId>` lets the shell start
Steam integration when launched outside the Steam client; `SPACEFACE_STEAM=0` turns Steam off;
`SPACEFACE_STEAM_OVERLAY=0` keeps the overlay's Chromium switches off.

**Check the overlay's cost before uploading.** Steam's overlay (Shift+Tab and its achievement popup)
needs Chromium's `in-process-gpu` and `disable-direct-composition` switches, and steamworks.js also
asks each window to repaint 60 times a second so the overlay keeps drawing over still screens. That
changes how the GPU process runs, and no instrument in this repo can see it: the runtime witness
(`npm run probe:runtime-witness`) launches the development shell as an isolated evidence run, where
Steam stays off. So start the Steam build from the Steam client twice and fly the same stretch: once
as is, once with the launch argument `--no-steam-overlay` (Steam library → SpaceFace → Properties →
Launch Options). If the overlay run is less smooth, put `--no-steam-overlay` in the Arguments of the
launch option from step 1 so every player gets it. Achievements still unlock with the overlay off;
only the overlay itself is lost. Windows launch options carry arguments, not environment variables,
so `SPACEFACE_STEAM_OVERLAY=0` is for local testing only. Direct builds never take these switches.

## 5. Upload with SteamPipe

With the Steamworks SDK's `steamcmd` (log in with a builder account; Steam Guard will ask for a code):

```sh
steamcmd +login <builder_account> +run_app_build <repo>\build\steam\output\app_build_<appId>.vdf +quit
```

Set `"setLiveBranch"` in `steam.config.json` to a beta branch name (for example `internal`) to put
the build live there automatically; Steam never lets a script set the default branch.

## 6. Store page

Run `npm run build:store-assets`, open `build/store/preview.html` to review the page locally, then
upload from `build/store/steam/`:

| Partner site slot | File | Size |
|---|---|---|
| Header capsule | `header_capsule.png` | 920 × 430 |
| Small capsule | `small_capsule.png` | 462 × 174 |
| Main capsule | `main_capsule.png` | 1232 × 706 |
| Vertical capsule | `vertical_capsule.png` | 748 × 896 |
| Page background | `page_background.png` | 1438 × 810 |
| Library capsule | `library_capsule.png` | 600 × 900 |
| Library header | `library_header.png` | 920 × 430 |
| Library hero (no text) | `library_hero.png` | 3840 × 1240 |
| Library logo (transparent) | `library_logo.png` | 1280 × 720 |
| Screenshots (gameplay) | `screenshot_01.png` … | 1920 × 1080 |

Store copy for all five launch languages is in `src/localization/storeCopy.js`.

Then submit the store page and the build for Steam review from the partner site.
