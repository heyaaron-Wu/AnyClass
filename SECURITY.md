# Security Policy

## Supported versions

| Surface | Status |
| --- | --- |
| Hosted Production v0.2.2 | Supported |
| GitHub source release v0.2.2 | Current published source release |

The hosted Production app at https://anyclass.heyaaron.asia/ is the current supported product.

The current published GitHub source release is [AnyClass v0.2.2](https://github.com/heyaaron-Wu/AnyClass/releases/tag/v0.2.2), tagged at `63150daa50c4d5399c4c4b4ee75b0bb7162bd6ed`. The `main` branch also includes subsequent documentation-only alignment. Hosted Production runs v0.2.2 / `v022-production-20261016-154638`; hosted Build and GitHub source Tag remain separate identities. For the current status and limitations, see [Current Stable Release](docs/CURRENT_STABLE_RELEASE.md).

## Reporting a security issue

Please do not disclose sensitive vulnerabilities, credentials, Cookies, Sessions, authentication tokens, or private student data in a public issue.

If GitHub private vulnerability reporting is available for this repository, prefer that channel.

If no private reporting channel is available, open a minimal public issue stating only that you have a security report and wait for maintainer instructions before sharing technical details.

## Scope

Security reports are especially relevant when they involve:

- unexpected upload or disclosure of timetable data
- credential, Cookie, Session, or token exposure
- cross-origin validation failures
- import-parser trust-boundary bypasses
- local-data corruption or unintended disclosure
- release-channel confusion that could send import data to an unintended endpoint

## Data-safety guidance

When reporting an issue:

- use sanitized fixtures or synthetic timetable data where possible
- remove student names, IDs, account information, Cookies, Sessions, and authentication tokens
- do not post private timetable screenshots unless sensitive information has been removed
- do not publish school-specific private integration details that are not part of the public project
