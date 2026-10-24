# Authored station contact professions

## Change
The station Bar contact rail and conversation heading now prefer each contact's trimmed, nonempty authored profession label. Missing, blank, and nonstring labels retain the existing runtime-role formatter. Both surfaces retain HTML escaping; the rail retains its recognition suffix.

Only three production hunks in src/ui/station/screens/bar.js change. Runtime role dispatch, portraits, factions, choices, memory, rewards, state mutation, CSS, imports, missions, Save, and physics remain unchanged. The separate choice-shortcut work in PR #544 is not included.

## Source provenance
Public parent: 0ebaf5d32603707ba765498e6c8c7b5c8eea2eb1.
Original Bar renderer blob: 4522268dd1eee17687abb573c28c359e6ee7e2cf.
Read-only contact producer blob: 58150974985a21faadce3965b96b4357d3aedcb1.
Read-only escapeHtml owner blob: 1236dc2d2a6ed3e094d3ef9453e3a865629d99aa.
Public master and these renderer/producer identities were rechecked on 2026-10-24 before publication.

## Focused paired evidence
- Identical tests on the exact original renderer: 1 passed, 14 failed (exit 1).
- Candidate renderer: 15 passed, 0 failed (exit 0), independently rerun.
- Renderer syntax check passed.
- Run: npm run check:bar-authored-role-labels.
- The alias is appended once to the existing default check chain, preserving prior scripts and CRLF formatting.

Tests execute the complete production renderRail and renderStage source functions with lightweight innerHTML sinks and stubbed surrounding dependencies. Pinned producer excerpts cover 11 canonical professions (Quinn at both stations) and Settlement Courier. Cases also cover whitespace, harmless markup characters, absent/blank/nonstring labels, enum fallback, retained dispatch arguments, portrait object, choices, memory text, offer markup, repeated renders, contact switching, and empty screens.

## Limits
These are semantic HTML-string and source-function boundary checks, not DOM parsing or browser/layout acceptance. Fixtures snapshot the cited producer excerpts rather than loading its entire dependency graph. Full generateContacts, getChoices, portrait art, reward/economy handlers, chrome, and animations are not exercised. No aggregate, Anvil, live UI, browser, active-script/security, or whole-game acceptance is claimed. Hosted CI is tracked separately for the published commit.
