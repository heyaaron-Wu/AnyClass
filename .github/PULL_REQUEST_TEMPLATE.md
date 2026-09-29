## Summary

Describe what this pull request changes and why.

## User-facing impact

Describe the behavior visible to users.

## Testing

List the automated tests, browser/runtime checks, fixtures, and any physical-device-only validation performed.

## Release / channel impact

State whether this change affects:

- Production / Stable
- Beta
- import targets
- Shortcut / Bookmark behavior
- release identity or packaging

If none, write “None”.

## Privacy / compatibility checklist

- [ ] No passwords, Cookies, Sessions, authentication tokens, student numbers, private timetable data, or private school-specific integration material are included.
- [ ] Local-first behavior is preserved, or any new data flow is explicitly documented and reviewed.
- [ ] Generic imports do not fabricate school identity merely to satisfy validation.
- [ ] Compatibility claims are supported by evidence.
- [ ] Public generic adapters remain separated from private school-specific integrations.
- [ ] Stable / Production and Beta endpoints are not unintentionally cross-linked.
- [ ] Import changes preserve Unified Preview and the selected timetable as the default target unless an explicit reviewed requirement says otherwise.
- [ ] ICS import has not been reintroduced unintentionally; ICS export behavior is preserved where applicable.
- [ ] Regression tests are included or the reason they are unnecessary is documented.
- [ ] Unrelated refactors are not mixed into this change.
