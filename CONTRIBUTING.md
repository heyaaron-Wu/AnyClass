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

Compatibility claims should be evidence-based. Public compatibility documentation should describe the academic-system family and validation status without exposing private school-specific integration details.

## Pull requests

A pull request should:

- have a focused scope
- explain the user-facing behavior being changed
- include regression tests where appropriate
- preserve local-first behavior unless the change explicitly introduces a reviewed opt-in capability
- avoid unrelated refactors
- avoid adding a compatibility claim without evidence
- preserve the separation between public generic adapters and private school-specific integrations
- avoid introducing Beta / Stable channel cross-links or unintended endpoint changes

## Import and data-model changes

Changes to import behavior should preserve the current product contracts unless the change is explicitly reviewed:

- the selected timetable is the default import target
- generic imports must not fabricate a school ID
- imported data should pass through Unified Preview before save
- AI-assisted import produces AnyClass Course data only
- ICS import is not part of the current product; ICS export remains supported
- duplicate and conflict handling should operate on logical Course semantics rather than treating every Meeting as a separate course

## Development notes

The repository `main` branch currently contains the verified AnyClass v0.2.1 public source baseline. The current GitHub source release and Hosted Production are both on v0.2.1, while Hosted Production keeps its own deployment Build identity.

When working on current code, keep public documentation, tests, release-channel configuration, and privacy boundaries aligned with the actual target environment. Historical releases remain available through GitHub Releases and the changelog rather than being treated as the current development target.
