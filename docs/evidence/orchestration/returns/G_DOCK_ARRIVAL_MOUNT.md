# G_DOCK_ARRIVAL_MOUNT — berth arrival strip on live Orbital Command shell

**Owning check:** `npm run check:dock-arrival-mount`  
**Presenter unit:** `node --test test/dock-arrival-presenter.test.mjs`

## Change

- Mount pure `buildDockArrival` into `stationApp` under `.sx-dockzone` (`.sx-arrival`)
- Compact CSS for identity / lines / next action — not a station shell redesign
- Next action navigates Missions/Market or triggers undock path

## Steam bar why

Named berth beat + next action on dock (Freelancer/Rebel Galaxy class place-ness). Presenter existed but was invisible until this mount.

## Evidence

- `{SCRATCH}/dock-arrival-mount.log`
- `{SCRATCH}/dock-arrival-presenter.log`
