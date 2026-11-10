# Rescue Hail status

Baseline: 7dc248acec452df4afcd0a5b71ad0507cd6c17ec, 2026-11-07. PRs #857 and #858 are merged; #868 supplies durable custody. This isolated checkout started clean and contains no other candidate edits. NOW has no claim on contactHail.js.

A lifter can physically board a survivor yet answer STATUS with its generic work phase. The canonical owner already records in-transit custody with a durable hull ID, live entity ID and generation. The Hail reader currently consumes none of those fields. This is a missing read, not a reason to replace rescue ownership or navigation.

Add a pure Hail status read for the exact live carrier and unambiguous pending receipt. Show SURVIVOR ABOARD and the live traffic destination when available; never claim rescue completion, invent identity from a recycled slot, or change route, rewards, custody or saves. Existing Ward-specific Hail remains first. Keep the response to one requested line, with no new toast.

Focused verification covers normal status and stale/ambiguous custody, terminal outcomes, destination loss, owner reconciliation after Continue, and repeated reads without mutation. Ordinary rendered rescue → Hail → station handoff remains a separate acceptance check; fixture success is not that claim.

## Candidate result

The baseline also excluded unstamped rescue hulls from Hail altogether. Verified pending custody now admits that hull to the existing worker channel, then STATUS reads the same receipt. Existing Ward-special handling is unchanged. Missing destination evidence reads BERTH UNCONFIRMED, not an invented waiting behavior.

Validation: original Hail baseline 21/21; candidate Hail + rescue-status suite 36/36; survivor causal/lifecycle/rescue-commit/destination suites 20/20; git diff --check passes. Rescue tests include scanner request/choice dispatch and delivery or carrier recycling between offer and choice. Independent read-only review found no blocking custody or mutation defect; its requested fallback wording and scanner test are included. No rendered route or full save/Continue playthrough was run. Candidate remains local and unpublished.
