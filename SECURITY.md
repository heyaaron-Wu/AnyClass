# Security Policy

## Supported versions

| Surface | Status |
| --- | --- |
| Hosted Production v0.2.1 | Supported |
| GitHub source release v0.2.1 | Current published source release |

The hosted Production app at https://anyclass.heyaaron.asia/ is the current supported product.

The public repository `main` branch and the current GitHub source release correspond to the verified v0.2.1 public source baseline. Hosted Production uses a separate deployment Build identity, so its deployment identifier may differ from the GitHub source-release identifier.

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
