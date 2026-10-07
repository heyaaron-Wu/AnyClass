# Phase 4A reimport merge contract

Same-term imports use `AnyClassStorageV2.putLegacyAndMigrate(dataset, config, factory, hooks)`.
The source dataset may declare `completeness: "COMPLETE"` only when the capture covers the whole intended source scope. Missing rows from an unknown or partial capture require review and are never interpreted as deletions. The public Bookmarklet's complete grid capture declares this explicitly; a generic file import does not assume it.

The engine compares prior immutable source Courses, sparse Course/Occurrence overrides, and newly built source Courses inside one IndexedDB transaction. A successful call returns `mergeResult` with counts and review categories. The same summary is retained with the new import snapshot. Prior snapshots remain available.

Unresolved field conflicts, unsafe source-identity rebinding, orphaned occurrence overrides, and invalid groupings throw `REIMPORT_MERGE_REVIEW_REQUIRED` with a structured `error.mergeResult`; the transaction aborts. Phase 4B can present that record without parsing error prose. It can retry with `hooks.mergeResolutions`, keyed by `${courseId}:${field}`, using `KEEP_MINE` or `ADOPT_SOURCE`. Resolution choices are not copied into the source dataset.

An absent course in a complete capture is retained as `sourceMissing: true, suppressed: true`; its source record, snapshot, and user intent remain recoverable. Manual courses are outside source reconciliation. Stable source identity is preferred; title, teacher, and location are not used to guess an unsafe match. Legacy imports without trustworthy identity can therefore require review after a source change.

`uidIdentitySeed` freezes the initial imported UID basis for retained courses. Source metadata edits can update visible data without changing UIDs of retained occurrences. New/removed occurrence weeks still change the event set. Identical source payloads take a `NO_CHANGE` path without rewriting Courses.
