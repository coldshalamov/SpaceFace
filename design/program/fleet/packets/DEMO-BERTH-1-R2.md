# DEMO-BERTH-1-R2 — correct what the cross-review found in DEMO-BERTH-1

**For:** a builder agent. **Kind:** corrections. Commit your own files.

Another agent built `design/program/fleet/packets/DEMO-BERTH-1.md`. An independent reviewer then
checked its commits and wrote `.devshots/fleet/runs/XR-DEMO-BERTH-1.grok46.2026-11-24T01-50-57/RECEIPT.md`. Read both, then the commits themselves.

## Do
For every row the reviewer marked WRONG, INCOMPLETE or OVERREACH:
1. Check the claim against the code yourself (the reviewer can be wrong too). If it is wrong, say
   why in your receipt and change nothing for it.
2. If it is right, fix it the way the reviewer's "what must change" says, unless you find a
   simpler correct fix. OVERREACH means the builder changed behaviour the packet did not ask for:
   put that behaviour back as it was unless it is clearly a bug fix the player needs.
3. If a commit broke HEAD on its own (an import of a symbol that commit does not export), the
   current tree may already be whole; make sure HEAD now builds (`node --check` the files and run
   their focused tests) and say so.
Then run the focused tests of every file you touched. A test that pins an old rule the packet
deliberately changed gets the new rule in its message; never delete a test to make it pass; never
edit golden/expected files.

## Rules
Edit only the files the original packet allowed. Before editing a file run `git diff -- <file>`;
if it has changes you did not make, use `bash scripts/fleet/own-commit.sh begin <file>` before and
`bash scripts/fleet/own-commit.sh commit "<msg>" <file>` after. Never git add -A, reset, stash,
restore or checkout. Plain-English commit messages saying what the player now gets.

## Receipt
Protocol headings + a table: reviewer row | agree / disagree (why) | fix (commit) | tests.
