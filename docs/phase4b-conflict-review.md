# Phase 4B: reimport review

This page is a UI client of the Phase 4A transactional merge. It never writes
course records itself. Choices remain in memory until the final confirmation.

## Product pattern review

- [GitHub merge conflicts](https://docs.github.com/en/pull-requests/reference/merge-conflicts): safe changes merge automatically; unresolved competing changes block final merge. The web conflict editor requires every conflict to be resolved before the final action. We adopt the explicit completion gate, but not code markers, line diffs, or Git terminology.
- [GitHub conflict editor](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/resolving-a-merge-conflict-on-github): conflicts are visited individually, marked resolved, and committed together. We adopt per-field decisions and one final save, not arbitrary manual merged text (unsupported by Phase 4A).
- [Microsoft OneDrive version history](https://support.microsoft.com/en-us/onedrive/restore-a-previous-version-of-a-file-stored-in-onedrive): understandable earlier/newer versions can be inspected before restoration. We adopt readable values and reversibility before commit, not file duplication or a separate versioned-file store.

## Contract and safety

- Both file and Bookmarklet save paths call `AnyClassReimportReview.start`.
- Ordinary safe updates commit and show a short result without opening review.
- A required field conflict aborts the first transaction. The UI stages exactly
  `KEEP_MINE` or `ADOPT_SOURCE` for each field, then retries via Phase 4A.
- A complete import with source-missing courses is held before archive via
  `requireSourceMissingReview`. Each source-missing course must be acknowledged;
  `sourceMissingApproved` is sent only on final confirmation. Manual courses are
  not in the source-missing set. Archival remains Phase 4A's responsibility.
- An unmappable single-occurrence edit, invalid grouping, or ambiguous source
  identity is blocking. The UI does not invent a resolution mode.
- Cancel discards staged choices. The live timetable is unchanged because the
  review-producing transaction aborted. A failed final commit preserves choices
  for retry and reports failure.
- A compact review signature is recomputed inside the final Phase 4A
  transaction. If another tab changes the reviewed course state, the stale
  review cannot commit; the student is asked to restart the import.
- Refresh/close discards the in-memory review session. Users restart using the
  same file or source page. No raw pending import is persisted by the UI.

The browser UI must not expose internal course/grouping/occurrence identifiers.
Synthetic public fixtures are used for all local tests and screenshots.
