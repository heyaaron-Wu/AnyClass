# Contributing to AnyClass

Thanks for your interest in AnyClass.

AnyClass is a local-first timetable tool. Contributions should preserve the product's privacy boundary and avoid requiring students to share school credentials or private timetable data.

## Before contributing

Please check existing issues before opening a new one.

For bugs, include:

- affected page or feature
- browser and device
- reproduction steps
- expected behavior
- actual behavior
- sanitized screenshots when useful

Never include passwords, Cookies, Sessions, authentication tokens, student numbers, or other private data.

## Compatibility contributions

When proposing support for another academic system, please provide only sanitized technical information where possible, such as:

- academic-system family/name
- version if known
- relevant DOM structure or sanitized HTML fixture
- reproducible parsing behavior
- whether you can test the adapter in a real environment

Do not submit real account credentials.

## Pull requests

A pull request should:

- have a focused scope
- explain the user-facing behavior being changed
- include regression tests where appropriate
- preserve local-first behavior unless the change explicitly introduces a reviewed opt-in capability
- avoid unrelated refactors
- avoid adding a compatibility claim without evidence

## Development notes

Detailed local-development instructions will be added with the first complete public source release.
