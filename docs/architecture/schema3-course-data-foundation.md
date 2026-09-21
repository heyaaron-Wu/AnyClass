# Schema 3 course-data foundation

## v0.1.1 data path

`course-app` Schema 2 retains the imported dataset in `timetables`. The storage adapter converts that dataset into `v2Timetables`, `terms`, and `baseMeetings`; `phaseb-engine.js` expands base meetings into logical occurrences and then final occurrences. Today and Timetable still receive the legacy dataset plus a non-enumerable `__phaseBGraph`. ICS export reconstructs the legacy meeting grouping from final occurrences so the historical UID algorithm remains unchanged.

## Additive Schema 3 stores

Schema 3 keeps every Schema 2 store and adds:

- `importSnapshots` (`snapshotId`; `sourceKey` index)
- `courses` (`courseId`; `sourceKey` and `sourceSnapshotId` indexes)
- `courseOverrides` (`courseId`)
- `occurrenceOverrides` (`occurrenceId`; `courseId` index)
- `scheduleOverrides` (`scheduleOverrideId`)
- `schema3Migrations` (`migrationId`)

Migration is additive and retryable. The legacy imported dataset and Schema 2 graph remain the compatibility boundary for the current UI. Schema 3 rows are written in the same transaction as refreshed Schema 2 rows and are independently read back before migration is accepted.

## Stable identity

Each migrated course represents one existing base meeting. Its ID is a deterministic encoding of `[sourceKey, baseMeetingId]`. `baseMeetingId` already prefers a trusted teaching-class ID and otherwise uses the existing structural identity plus duplicate ordinal. This preserves two similar-looking records without treating mutable teacher or location text as permanent identity.

An import snapshot ID is a deterministic encoding of source key, legacy fingerprint, and imported timestamp. Reopening the same dataset therefore neither creates new course IDs nor duplicates its snapshot.

## Source and override separation

`courses` retain normalized baseline fields and a lossless `sourceRaw` copy. No override rows are created during migration. `course-resolver.js` centralizes precedence:

`OccurrenceOverride > CourseOverride > source course`

Schedule overrides are persisted only as future scaffolding in Phase 1. They do not move or mutate courses.

## Compatibility invariant

Phase 1 does not switch Today, Timetable, or ICS to a new visible behavior. Existing Schema 2 data is retained, existing consumers keep their compatibility graph, and the legacy ICS UID namespace and derivation remain untouched.
