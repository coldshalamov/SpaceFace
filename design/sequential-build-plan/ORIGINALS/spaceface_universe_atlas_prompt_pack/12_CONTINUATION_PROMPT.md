# Prompt — Continuation Session for Any Workstream

Use this for every subsequent agent session. Prepend `00_COMMON_CONTEXT.md` and the specific workstream prompt.

<session_start>
1. Run `pwd` and confirm you are in the intended repository and worktree.
2. Read repository instructions and the authoritative Universe Atlas program artifacts.
3. Read the current feature ledger, progress log, interface decisions, recent git history, and `git status`.
4. Confirm your owned files and check that no other agent has taken ownership.
5. Start the application using the documented command or script.
6. Run a fundamental smoke test before changing code so you do not build on an undocumented broken state.
7. Review failing features in your scope and choose one highest-priority unblocked vertical slice.
</session_start>

<working_loop>
- Gather evidence and inspect the actual implementation.
- State the narrow hypothesis or contract you are changing.
- Make the minimum coherent change for the selected slice.
- Run focused tests.
- Verify the player-visible result end-to-end with public input where applicable.
- Update only the status and evidence fields you are authorized to update.
- Repeat only if the branch remains clean and the next step is still within the same coherent slice.
</working_loop>

<scope_control>
- Do not start a second major feature while the first is half-implemented.
- Do not edit another workstream's files to bypass an interface problem; report the contract mismatch.
- Do not delete or weaken tests.
- Do not hard-code fixture values.
- Do not create speculative abstractions or unrelated cleanup.
- Do not stop merely because the task is large or the context is long; leave durable state and continue through the harness's next context when supported.
</scope_control>

<session_end>
Before ending:

1. Run all focused tests plus the relevant smoke or end-to-end test.
2. Inspect the diff for accidental changes, temporary files, debugging output, and scope creep.
3. Update the progress log with:
   - feature worked on
   - verified behavior
   - exact files changed
   - tests and captures
   - unresolved defects
   - interface changes
   - recommended next step
4. Update the feature ledger only when evidence justifies the status.
5. Commit the coherent progress with a descriptive message if repository policy permits. Do not push or alter shared systems without authorization.
6. Leave the branch in a state another engineer can understand and continue.
</session_end>

<task>
Resume your assigned Universe Atlas workstream from repository state. Complete one highest-priority unblocked vertical slice, verify it end-to-end, and leave precise durable state for the next session.
</task>
