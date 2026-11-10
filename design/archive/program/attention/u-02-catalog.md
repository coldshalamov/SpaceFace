# U-02 catalog — session (pause/settings/saveLoad/saveNotices)
pause.js, settings.js, saveLoad.js are foreign-dirty. `saveNotices.js` is clean and owns the
confirm/notice micro-copy surface for the save family.
Landed: REASON_WORD +6 notice clauses (shared with the E-02 persistence additions — one bank,
two ledgers: continuity reasons and confirm flavor are the same rows).
