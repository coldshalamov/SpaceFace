# Hinge Works: rehearse before releasing the real emergency hold

## Interaction
The first held incident now offers an optional **Practice first** choice. Previously,
the existing physical drill could be entered only after completing an incident.
The new entry snapshots the current held original scene and uses the same drill
machinery. Practice requires a separate **Begin practice** action to release its
hold. It is clearly labeled unpaid and gives no incident completion credit.

The practice preview and active practice both expose an explicit end option. Ending
restores the saved original scene (initially still in emergency hold). Live active
incidents retain their existing unobstructed-flight presentation; they cannot be
reset into a first rehearsal. Completed-incident practice remains available.

The UI states that ship damage and supplies are real. This is not an invulnerable
sandbox or a rollback of the player/world. Only the feature's saved scene is
restored. Real spending during practice remains spent. No new actors/assets,
reward rate, physics, save schema, tool, or global outcome writer was added.

## Exact scope
- `src/features/industrialDisasters/runtime.js`: permit current-preview scenario
  through the existing drill owner, with live Adventure flight/nondocked entry.
- `src/features/industrialDisasters/presentation.js`: initial choice, explicit
  practice labels and active-practice end action.
- `test/industrial-first-rehearsal.test.mjs`: five new tests.
- `test/pro-experiences-industrialDisasters.test.mjs`: only initial menu expectation
  gains the new drill option.
- this note.

The existing snapshot/returnCrisis owner, payout suppression, native suspension
check, and serializer remain authoritative. A real player line prevents scene
replacement; the pilot must cut it first. A different uncompleted scenario cannot
be requested from the first preview. A nested drill cannot replace the preserved
original. Existing completed-drill and live response behavior is retained.

## Verification
Independent final focused review: **5/5**. Final combined: **33/33**:

```
node --test test/industrial-first-rehearsal.test.mjs test/pro-experiences-industrialDisasters.test.mjs
```

Log `/tmp/industrial-rehearsal-final.log`. New evidence:
- Ordinary first decision maps through the existing command to physical practice.
  Actual Rapier motion resolves the rehearsal without credit, reputation or completed
  incident history; ending restores the original preview. Resolving the real
  incident afterwards produces exactly one existing payment.
- Active practice offers an end action; a live active incident cannot be erased.
- Fresh owner/native restoration retains both rehearsal and held original;
  ending the restored rehearsal returns the original cycle in preview.
- Actual tether input prevents replacement until actual cut input; menu/docking
  cannot start a rehearsal.
- Existing worker status encode→JSON→decode preserves the practice flag and correct
  decision, and an actual economy debit during practice is not refunded by ending.

## Limits
Tests start at the local incident fixture and use native impulses for interventions,
plus actual tether inputs for the suspension guard. They do not demonstrate a new
pilot-thrust approach, full rescue-controls run, rendered UI, or collision-free
route. Fresh restoration uses the actual feature capture/restore and native owner,
not disk/UI Continue. The spending test verifies a real debit remains spent; it is
not a new full consumable-tools run. No browser or asset-production work performed.

Before snapshots `/tmp/industrial-{runtime,presentation}.before-rehearsal.js` and
`/tmp/industrial-pro-test.before-rehearsal.mjs`. Master inspected before work:
`f95de0eb1ba7560839209936afba48c7b96fe41a`. No publication performed.
