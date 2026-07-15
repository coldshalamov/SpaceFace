# assets/portraits/ agent notes

These are live station-bar/contact portraits, not flight-HUD framing.

## Sources of truth

- Registry and keys: `src/data/portraits.js`.
- Loader/fallback: `src/ui/portraitArt.js`.
- Player-facing consumer: `src/ui/screens/bar.js` and related comms/station surfaces.
- Bundle/reachability: bundle configuration plus `check:asset-reachability`.

Do not duplicate the portrait inventory here; inspect the registry and directory together.

## Rules

- Preserve stable canonical/contact-role keys and provide a deliberate fallback.
- New/replaced art needs origin/provenance, appropriate crop/resolution, coherent character identity,
  and an in-context station/comms review.
- Helmet/visor pilot sheets are reference material and must not become flight-HUD framing. This does
  not prohibit portraits on station, bar, codex, or appropriate communication surfaces.
- Register and bundle the asset; a file on disk alone is not wired.

Run asset reachability and the relevant UI screen check, then inspect a representative player route.
