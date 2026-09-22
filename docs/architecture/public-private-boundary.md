# Public/private extension boundary

AnyClass public source contains the generic timetable core, Schema 3, EffectiveOccurrence runtime, generic import contracts, and generic adapters. Deployments provide a `SchoolProfile` at runtime; the public core never imports a concrete production profile.

`AnyClassSchoolProfile.create()` validates the generic profile contract. `AnyClassSchoolProfileRegistry` registers profiles, selects the active profile, and matches a captured origin. The public demonstration profile uses `school-demo`, `Example University`, `https://jw.example.edu`, and synthetic course, teacher, campus, and room values.

The generic ZhengFang V9 adapter detects and parses the supported document family. Origin authorization and profile selection remain at the import boundary. Private deployments inject a profile containing their approved origins, semester mapping, period definitions, aliases, and normalization hooks from outside the public Git tree.

Before any public publication, run `npm run privacy:gate` with `ANYCLASS_PUBLIC_PRIVACY_DENYLIST` pointing to an external JSON file:

```json
{"version":1,"terms":["private-school-marker","private-origin-marker"]}
```

The external list must be non-empty. Missing, unreadable, empty, malformed, ambiguous, archive, or sensitive matches block publication. Use `--history` when validating rewritten refs for publication.

Legacy public APIs remain aliases during one migration window. New code uses `AnyClassShell`, `AnyClassTimetableFile`, `AnyClassTimetableFileStorage`, `anyclass:timetable-updated`, and `anyclass.timetable.displayName`. Incoming legacy timetable events are bridged once to the canonical event; first-party consumers listen only to the canonical event.
