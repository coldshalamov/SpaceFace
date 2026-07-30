# assets/portraits/ agent notes

These are live station-bar/contact portraits, not flight-HUD framing.

## Sources of truth

- Registry and keys: `src/data/portraits.js`.
- Loader/fallback: `src/ui/portraitArt.js`.
- Player-facing consumer: `src/ui/screens/bar.js` and related comms/station surfaces.
- Bundle/reachability: bundle configuration plus `check:asset-reachability`.
- Character-first direction: `assets/concept/people/CANONICAL_PORTRAIT_DIRECTION.md`.
- Recurring/depth-contact direction: `assets/concept/people/DEPTH_CONTACT_PORTRAIT_DIRECTION.md`.
- Cross-graphics craft router and imagegen handoff: `docs/visual-assets/README.md` and
  `docs/visual-assets/AGENT_PROMPTS.md` § F.

Do not duplicate the portrait inventory here; inspect the registry and directory together.

## Rules

- Preserve stable canonical/contact-role keys and provide a deliberate fallback.
- New/replaced art needs origin/provenance, appropriate crop/resolution, coherent character identity,
  and an in-context station/comms review.
- Treat every recurring portrait as a specific biography recorded by a plausible specific capture
  device. Criminal styling, tattoos, scars, implants, polish, compression damage, and framing appear
  only when that person's life and source camera justify them; never cast a reusable genre face.
- Review the full-size source and the real 64px/38px presentation together. Identity, role, age,
  expression, and capture-source contrast must survive without relying on a label.
- When generation is selected and the assigned worker lacks image generation, use the bounded Codex
  terminal handoff in `docs/visual-assets/AGENT_PROMPTS.md` § F. Do not substitute a text-only brief
  or silently reuse a role singleton.
- Helmet/visor pilot sheets are reference material and must not become flight-HUD framing. This does
  not prohibit portraits on station, bar, codex, or appropriate communication surfaces.
- Register and bundle the asset; a file on disk alone is not wired.

Run asset reachability and the relevant UI screen check, then inspect a representative player route.
