# AnyClass v0.2.2 — deployed navigation hotfix and source alignment

Product Version remains **0.2.2**. Build: `v022-production-20261016-154638`.
Mode/channel/schema: production/stable/4. This Build is deployed and technically
accepted. This independent LOCAL branch prepares public-source/documentation
alignment; it does not rebuild or redeploy the application.

Source base: `4a1839e56ae32f4c7c94f60a19989d08503a5e5f`.
Explicit future rollback: `v022-production-20261015-223822`, never stale previous.
Deployed source commit: `270d1e021165087e0a9a639c18ab712303d87432`.
Package SHA-256: `a64d5afb66f96d67337e8305551f6dcf76310352bb45d2df83ff80a73f922775`.
Manifest SHA-256: `a6d150de8ec854d07e5ba07221cd8f73282f8985d221f95ce13e16201dfef441`.
The historical packaging contracts remain preserved. The current source-release
contract separately identifies the deployed baseline and unpublished GitHub state.

About's canonical installer link is same-tab. Installer Back remains
`/about/#aboutShortcutTitle`; Import remains `/import/?method=mobile`;
both are explicitly same-tab. Official iCloud CTA bytes remain unchanged.
No new handlers, CSS, animation, data/schema, CSP/cache, Beta or Shortcut changes.
Universal Shortcut remains 1.0.0 / Build 1 with its disabled update Manifest.

The historical first post-resize mobile Chrome click cause remains unproven under
the narrow accepted residual-risk decision; later qualified Chrome navigation and
owner-reported final iPhone/iPad acceptance are complete. They do not rewrite the
historical failures or manufacture new device logs.

Website deployment, technical acceptance, formal 22-artifact Drive archival and
owner-reported iPhone/iPad acceptance are complete. Nothing is deployed or pushed
by this source-alignment task. Remaining gates:
1. Review this complete source alignment against GitHub main v0.2.1, including
   the existing PR #12. Preserve that PR, branches, tags and older Releases.
2. Separately authorize push/PR/merge; none is implied by local preparation.
3. Applicable full-history privacy/public Release gates. ISSUE-001 remains OPEN;
   a current-source scan cannot waive its blocked historical reachability gate.
4. Separately approve the v0.2.2 source tag/Release and coordinated Shortcut
   closeout only after their applicable gates pass. Keep RELEASE_CLOSED=false.

## Source-to-hosted equivalence

The reviewed source has 98 application files. 97 match the deployed Manifest
byte-for-byte. `assets/timetable/import-client-channels.js` intentionally retains
both source channels; the existing `tools/package-final-ui.cjs` stable transform
removes the Beta block and cross-channel guard. Applying that exact in-memory
transform makes all 98 files match the original deployed Manifest. No package is
rebuilt, and neither channel's runtime storage behavior is changed.

The original hash-locked 98-file Manifest is included verbatim as
`release/v022-hosted-app-manifest.json` (SHA-256 above). Its predeployment
`published=false` / `deployed=false` fields are preserved as historical artifact
metadata, not rewritten to claim current service state. The older
`release/production-app-manifest.json` remains the historical v0.2.0 record,
not the authority for v0.2.2. The original application package is external
immutable release evidence, not duplicated into this public source tree.
Deployment/archive completion and physical acceptance are taken from the
Project Ledger and owner report, not independently re-executed by this branch.

## Independent release boundaries

Official universal Shortcut: 1.0.0 / Build 1, 43 actions, approved iCloud record
`89145db4f66e409fbaa5fd3e5257b124`. The signed payload audits and owner-reported
final device checks are accepted. The existing initial distribution needs only
its separate owner release/closeout approval; no new share link or signing is
needed. There is no Build 2. Manifest remains disabled, not an unmet reason to
advertise Build 1 as an update to itself. A future newer-Build update publication
requires its own approval and evidence.

ISSUE-001 retains the prior SCHOOL_CONFIG_ONLY forensic classification. PR #1's
reference still blocks the unchanged strict history gate; it is not proof of real
timetable-data leakage. Support impact confirmation and separately authorized
cleanup followed by a fresh mirror, or a separately approved privacy-policy
disposition, remain alternatives. No ref is deleted by this candidate.
DEC-060 genuine midstream interruption stays PAUSED / UNVERIFIED.

No live mutation, public release, Nginx change, certificate or timetable operation
is authorized by this local candidate.
