# v0.2.2 website and universal Shortcut distribution

The website is deployed at v0.2.2 / `v022-production-20261016-154638`; technical acceptance, 22-artifact archival and owner-reported iPhone/iPad acceptance are complete. This local source/documentation alignment does not redeploy it. GitHub source publication and final coordinated Shortcut closeout remain separately gated.

## Locked Shortcut evidence

- Public name: `AnyClass·课程导入`
- Version / Build: `1.0.0 / 1`
- Official iCloud record: `https://www.icloud.com/shortcuts/89145db4f66e409fbaa5fd3e5257b124`
- Approved signed artifact SHA-256: `6b635a6eef4afe8f53188c25849657bf778a44585ee5027c8e855e33f47c9cd2`
- Apple shared payload SHA-256: `d241139d2631515a203955710caa7c53e55381393e49f43f42b4ec41de81eb85`
- Apple signing status: `APPROVED`
- Actions / semantic differences: `43 / 0`

The installation page is static and JavaScript-free. It contains exactly one audited outbound link and requires a user click. The update Manifest remains disabled (`enabled=false`, `reviewed=false`, `updateUrl=null`, `publishedAt=null`); Build 1 is current and is not advertised as an update to itself.

## Historical coordinated deployment plan

The following sequence records the earlier candidate plan. It is not a current instruction or authorization to redeploy, repeat completed tests or alter Nginx. Current status and remaining gates are in [the navigation release record](v022-navigation-hotfix-candidate.md).

Separate owner authorization is mandatory.

1. Verify the immutable candidate package, manifest and source commit.
2. Confirm the active Production pointer and retained rollback release.
3. Stage the package in a new server release directory; do not overwrite a prior release.
4. Verify every extracted application file against the manifest before activation.
5. Apply only the reviewed exact `/shortcuts/install`, `/shortcuts/preflight` and `/shortcuts/manifest.json` route/header configuration.
6. Atomically activate the new release.
7. Independently verify the nine existing routes, release identity, 98-file server/HTTPS equivalence, MIME/cache/noindex behavior, and runtime smoke.
8. Verify the installation page has no script, redirect, tracker or third-party subresource; confirm its sole outbound URL after an explicit click.
9. Verify preflight transmits only Shortcut ID, integer Build and nonce, omits credentials/referrer, and returns the disabled Build 1 Manifest without an update prompt.
10. Re-run the complete history-inclusive privacy gate and confirm Stable/Beta channel isolation.

## Rollback

If any integrity, identity, route, header, privacy, channel or runtime check fails, immediately restore the prior Production pointer and the previous route configuration. Confirm the previous release is publicly active and the failed candidate is no longer served. Preserve both release directories and evidence; do not delete user data or change database schema 4.
