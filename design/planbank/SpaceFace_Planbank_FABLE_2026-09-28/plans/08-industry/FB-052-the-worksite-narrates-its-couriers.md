# FB-052 — An asteroid site's courier deliveries, losses and lane spills are heard outside its own screen

**Kind:** wire · **Lane:** THE LONG GAME · **Routing:** open
**Seam tags:** seam: asteroidSites.js, seam: marketNews.js, seam: worldSiteMapLayer.js
**Write-set:** `src/systems/asteroidSites.js`, `src/ui/marketNews.js`, `src/ui/worldSiteMapLayer.js`, `test/fb-worksite-narrates.test.mjs`

## The gap
Ten `site:*` events (`site:courierDelivered`, `site:courierLost`, `site:laneSpilled`, `site:podBuilt`,
`site:machineMode`, `site:anchored`, `site:created`, and more) have no listener; the worksite narrates nothing
outside its own screen. A lost courier pod is a physical event in the world that the player should be able to
go and find.

## Why this direction
A site log screen was rejected. News lines for the economic events and a map marker for a lost courier (its
last position, from the payload) are the two consumers.

## Mechanism
- Subscribe `marketNews.js` to delivered/lost/spilled/podBuilt with cited lines naming the site.
- Add a lost-courier marker to `worldSiteMapLayer.js` from the `site:courierLost` payload position, cleared on
  recovery or after one day.
- Pin one line per event and the marker's lifecycle on seed 4242.

## Done when
`test/fb-worksite-narrates.test.mjs`: four lines and one marker that clears on recovery;
`asteroid-sites.test.mjs` and `pq-145-01-durable-site-loop.test.mjs` stay green.

## Do not
Do not narrate every machine mode change. Do not add a site panel. Do not change pod loss odds.

## Focus test starting points
- `test/asteroid-sites.test.mjs`
- `test/pq-145-01-durable-site-loop.test.mjs`
