# A departure that faces the household asking for help

## Physical experience decision
The existing aid job names the receiving household but previously selected its pickup angle from a seeded random direction. That could put a new marker on the far side of the creditor, requiring the carrier to work around its solid hull before going toward the recipient. The new staging preference faces the actual debtor. Obstructed candidates try nearby angles on alternating sides before reaching the back, preserving bounded clearance search and arrival-volume exclusion.

This changes the arrangement of an existing playable activity, not its reward or controls. In the unobstructed two-household fixture the marker waits320WU toward the recipient; the pilot can approach its recipient-facing side, catch it, and pull toward the visible receiving ring. Existing scanner labels, household contacts and owner settlement remain intact. No new asset/model or unrelated system is added.

Fresh remote remains `f95de0eb1ba7560839209936afba48c7b96fe41a`. Lane B's opening reservation remains respected; this is disjoint later-route physical work, not a claim that opening Adventure is now complete. No held/foreign source, publishing, worktrees, workflow or credential changes.

## Four-path ownership
- `src/missions/frontierAidPickup.js`: compute debtor-facing heading and alternating angular preference.
- `src/systems/faction_frontier.js`: remove the obsolete seeded random-angle argument at `_postDebt` only.
- New `test/frontier-aid-heading.test.mjs`.
- This evidence note.

Exact before snapshots: `/tmp/faction_frontier.before-aid-heading.js` SHA256 `9fdafbbf9ce51297e9e6f3c49893d0a95b0a0f3ae19524c8ada1bb1b26054fba`; `/tmp/frontierAidPickup.before-heading.js` SHA256 `a5f3417fb930560590fb1b36092b15bd62a67f7bbb014656b0507ca35f2212f4`. Earlier Barn/provision/pickup/receiving helpers remain required dependencies. No previously staged or restored marker is moved: this helper is invoked only when posting a new debt. Marker identity, mass12, persistence, expiry, receiving radius and payments are unchanged.

The search still checks320/420/520WU radii, solid entity envelopes and procedural asteroid query, and excludes debtor arrival plus90WU. It is an endpoint search, not a full trajectory planner. If the face-toward-debtor pocket is obstructed, the actual returned pocket may be off-axis or behind the creditor. No dialogue promises otherwise.

## Verification and actual player path
Command:
`node --test test/frontier-aid-heading.test.mjs test/frontier-aid-pickup.test.mjs test/frontier-aid-receiving.test.mjs test/faction-frontier-expansion.test.mjs`

Author and independent read-only reviewer: **47/47 pass**. Three new checks cover all four recipient-direction quadrants, obstructed-heading fallback and nearby debtor no auto-delivery, and a native Rapier carry using real flight inputs/cursor catch/line progression/arrival owner. Existing moved-marker fresh restoration, identity guard, covered-debt and loss tests remain green. CRLF-aware owner diff check passes.

New direct native fixture: player starts at(1400,700), creditor(1500,0), debtor(0,0), fresh marker(1180,0). Pilot approaches(1080,0), catches the actual12t body and flies toward(220,0), with ordinary winch available. No player/marker teleport after boot. The production receiving guide exists with nonphysical body and radius320; real arrival removes it and pays320 once. Result **120.23 simulated seconds; two player–load contacts and zero contacts with other bodies; player survives**. This is not contact-free and not a full campaign journey: both stationary homesteads and the debt are fixture-established through existing owner seams.

The first direct controller used8WU/s and produced two player/load contacts.14WU/s also produces two; the test records the contacts rather than tuning the production laws to erase them. The final assertion checks that every recorded relevant impact is only between pilot and its carried marker, not the solid households or scenery. It does not suppress or relabel impacts.

The old indirect native route remains in the regression suite unchanged. With the new staging it completes in408.30s with38 contacts, compared with its earlier383.95s/31. The new120.23s/two-contact route uses a different controller path, so these are **not matched A/B performance or safety improvement measurements**. What is established is a viable direct carry with recipient-facing fresh placement, not a general collision reduction guarantee.

## Remaining acceptance work
Rendered pickup/receiving readability, ordinary campaign discovery and UI/disk Continue are still unverified. Fresh entity restore tests establish saved positions remain, not a full user Continue flow. Two direct-route pilot/load contacts remain to inspect, and the older indirect path is still rough. Next acceptance is to play this actual departure in the rendered world with surrounding traffic and obstacles, not to infer corridor safety from an unobstructed native fixture. SF-GAME, SF-LIVING-WORLD and SF-SECTOR-COHERENCE remain open. No screenshots, published commits, integration or user acceptance claimed.
