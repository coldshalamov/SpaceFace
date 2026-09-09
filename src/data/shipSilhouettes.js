// src/data/shipSilhouettes.js -- top-down hull silhouettes, one per ship in src/data/ships.js.
//
// Pure data, no imports, in the style of the other src/data tables. Extracted from
// src/ui/station/screens/shipworks.js so the FLIGHT HUD can draw the player's actual hull without
// importing a station screen and dragging that screen's whole dependency graph into the game loop.
//
// Coordinates are a 48x28 viewBox, nose to the RIGHT. Two optional classed paths per entry:
//   .sx-shipmark__cut       secondary masses (wings, pods, bays)
//   .sx-shipmark__battery   capital gun batteries
//   .sx-shipmark__sensor    sensor blisters
// Consumers style those classes themselves; the geometry carries the identity.
//
// COVERAGE IS A CONTRACT. shipworks.js falls back to the Kestrel for an unknown id, which means a
// missing entry silently draws every ship as a Kestrel and nothing can see it. Every id in
// src/data/ships.js must appear here -- pinned by test/j07-hud-contract.test.mjs.

export const SHIP_SILHOUETTE_VIEWBOX = '0 0 48 28';

export const SHIP_SILHOUETTES = Object.freeze({
  ship_kestrel: '<path d="M3 14 14 8l17-2 14 8-14 8-17-2Z"/><path d="m17 8 4-5 12 7-12 8-4-6Z" class="sx-shipmark__cut"/>',
  ship_pelican: '<path d="M4 8h9l5 4h18l8 5-8 5H17l-5-4H4l7-5Z"/><path d="M35 12h9v-4l-7 2Z" class="sx-shipmark__cut"/>',
  ship_wasp: '<path d="m3 14 14-4 10-8 18 12-18 12-10-8Z"/><path d="m16 10 7 4-7 4 4-4Z" class="sx-shipmark__cut"/>',
  ship_mule: '<path d="M4 9h11l5-4h12l12 9-12 9H20l-5-4H4Z"/><path d="M7 6h10v6H7Zm0 10h10v6H7Z" class="sx-shipmark__cut"/>',
  ship_drifter: '<path d="m3 14 12-7 14 2 16 5-16 5-14 2Z"/><path d="M10 4h15l5 5-15-2Zm0 20h15l5-5-15 2Z" class="sx-shipmark__cut"/>',
  ship_hornet: '<path d="m2 14 17-3 13-9 14 12-14 12-13-9Z"/><path d="M12 7h18l-7 6Zm0 14h18l-7-6Z" class="sx-shipmark__cut"/>',
  ship_ironback: '<path d="M3 7h15l7-4h14l7 11-7 11H25l-7-4H3Z"/><path d="M4 10h13v8H4Zm20-3h13v14H24Z" class="sx-shipmark__cut"/>',
  ship_bastion: '<path d="M2 8h12l10-6 22 12-22 12-10-6H2l7-6Z"/><path d="M13 6h18l-7 7-11-3Zm0 16h18l-7-7-11 3Z" class="sx-shipmark__cut"/>',
  ship_atlas: '<path d="M2 5h12l6 3h14l12 6-12 6H20l-6 3H2Z"/><path d="M4 2h13v9H4Zm0 15h13v9H4Zm18-7h13v8H22Z" class="sx-shipmark__cut"/>',
  ship_ranger: '<path d="m2 14 18-5L35 3l11 11-11 11-15-6Z"/><path d="M11 5h18l-9 5Zm0 18h18l-9-5Z" class="sx-shipmark__cut"/><circle cx="30" cy="14" r="2" class="sx-shipmark__sensor"/>',
  ship_warden: '<path d="M2 6h15l9-4 20 12-20 12-9-4H2Z"/><path d="M8 3h17l5 7-18-2Zm0 22h17l5-7-18 2Z" class="sx-shipmark__cut"/><path d="M27 7h13v3H27Zm0 11h13v3H27Z" class="sx-shipmark__battery"/>',
  ship_colossus: '<path d="M1 5h15l10-4 21 13-21 13-10-4H1Z"/><path d="M5 2h24l8 7-22-3Zm0 24h24l8-7-22 3Z" class="sx-shipmark__cut"/><path d="M18 8h22v4H18Zm0 8h22v4H18Z" class="sx-shipmark__battery"/>',
  ship_leviathan: '<path d="M1 3h17l10-3 20 14-20 14-10-3H1Z"/><path d="M4 0h26l12 9-25-4Zm0 28h26l12-9-25 4Z" class="sx-shipmark__cut"/><path d="M13 7h29v4H13Zm0 10h29v4H13Z" class="sx-shipmark__battery"/>',
});
