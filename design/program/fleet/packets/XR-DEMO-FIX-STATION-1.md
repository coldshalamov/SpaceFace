# XR-DEMO-FIX-STATION-1 — adversarial review of DEMO-FIX-STATION-1 (built by grok46)

**For:** a reviewer agent. **Kind:** READ-ONLY investigation. Change no tracked file; do not commit.
Write your findings to your RECEIPT.md only.

Another agent was given `design/program/fleet/packets/DEMO-FIX-STATION-1.md` and reported in
`.devshots/fleet/runs/DEMO-FIX-STATION-1.grok46.2026-11-23T20-10-16/RECEIPT.md`. Your job is to find what is WRONG
with its work. Assume it made mistakes; a cheap model wrote it.

1. Read the packet and the receipt. List the commits it claims, and also run
   `git log --since="2026-11-23T20:10:16Z" --stat` and pick out the commits that touch the packet's files.
2. For each claimed fix: read the diff (`git show <hash>`) against the packet's instruction and the
   code around it. Is the bug really fixed? Did it fix the cause or a symptom? Does it break another
   caller (grep the changed function's callers)? Did it change behaviour the packet did not ask for?
   Did it commit someone else's uncommitted lines (a hunk unrelated to the packet)? Did it weaken or
   delete a test instead of fixing code? Any player-visible words that are jargon, ids, or wrong?
3. Run the focused tests of the changed files (`node --test <file>`), at most 12 files.
4. For each packet item the receipt calls "rejected" or skipped: was the rejection right?

## Receipt (your RECEIPT.md)
A table: item | verdict (CORRECT / WRONG / INCOMPLETE / OVERREACH / UNVERIFIED) | evidence (file:line,
test output) | what must change. Then a one-paragraph verdict: can these commits stand as-is?
Be concrete; no praise; no restating the diff.
