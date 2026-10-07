# Public/private extension boundary

AnyClass public source contains the generic timetable core, Schema 3, EffectiveOccurrence runtime, generic import contracts, and generic adapters. Deployments provide a `SchoolProfile` at runtime; the public core never imports a concrete production profile.

`AnyClassSchoolProfile.create()` validates the generic profile contract. `AnyClassSchoolProfileRegistry` registers profiles, selects the active profile, and matches a captured origin. The public demonstration profile uses `school-demo`, `Example University`, `https://jw.example.edu`, and synthetic course, teacher, campus, and room values.

The generic ZhengFang V9 adapter detects and parses the supported document family. Origin authorization and profile selection remain at the import boundary. Private deployments inject a profile containing their approved origins, semester mapping, period definitions, aliases, and normalization hooks from outside the public Git tree.

Public timetable adapters implement `TimetableAdapter` interface version 1. A new public system is added through one adapter module, registry registration, sanitized conformance fixtures, stable diagnostics, and the existing normalized-import handoff. Detection is structural and ranked deterministically; origin authorization remains a separate receiver concern. Unsupported, ambiguous, invalid, or failing adapters stop before parsing or persistence. Adapters never write storage, select a timetable, or create their own preview/save path.

Generic runtime profiles are created through `AnyClassPublicProfileFactory`. Unknown school identity remains null in the normalized draft and must be confirmed in Unified Preview. Private or deployment-specific profiles remain external and must not be copied into the public adapter registry or fixture corpus.

The public bookmarklet identifies the generic ZhengFang timetable structure and reports its actual page origin; it does not contain a school origin. The receiver matches that origin against injected profiles and requires exactly one authorized profile before parsing. Unsupported or ambiguous sources fail closed. Both bookmarklet and file imports pass through `AnyClassNormalizedImport`, which whitelists the shared dataset envelope before storage.

Before any public publication, run `npm run privacy:gate` with `ANYCLASS_PUBLIC_PRIVACY_DENYLIST` pointing to an external JSON file:

```json
{"version":1,"terms":["private-school-marker","private-origin-marker"]}
```

The denylist file must stay outside the repository. The gate scans the current tree, commit history, and configured retained refs without printing the protected terms.
