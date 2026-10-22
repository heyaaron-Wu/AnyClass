# AnyClass v0.2.2 — Current Stable Release

This page records the **current published source and Hosted Production status**. Earlier candidate notes and immutable release artifacts retain the facts recorded when they were generated; they are not live publication indicators.

## Published source / 已发布源码

- Official source release: [AnyClass v0.2.2](https://github.com/heyaaron-Wu/AnyClass/releases/tag/v0.2.2)
- Source tag: `v0.2.2`
- Immutable tag target: `63150daa50c4d5399c4c4b4ee75b0bb7162bd6ed`
- Published: 2026-10-22 10:05:02 UTC (18:05:02 China Standard Time)
- Type: published official GitHub source Release; neither draft nor pre-release.
- `main`: contains the reviewed v0.2.2 public source, later documentation updates and a reviewed cleanup of Beta-only candidate artifacts. All 98 application blobs remain identical to the frozen v0.2.2 source tag. Always use the tag for the exact original released source identity.

## Hosted Production / 正式网站

- Product version: `0.2.2`
- Hosted Build: `v022-production-20261016-154638`
- Database schema: `4`
- Technical acceptance: accepted, according to the authoritative project Ledger.
- Formal Drive archival: 22/22 verified; owner-reported iPhone/iPad acceptance completed.
- Hosted Build and GitHub source tag are separate immutable identities. Publishing documentation or the GitHub source Release did not redeploy the site or modify user timetable data.

## Evidence versus current state / 历史凭证与当前状态

- [`release/v022-stable-source-contract.json`](../release/v022-stable-source-contract.json) contains `"published": false` and `"githubReleaseState": "NOT_PUBLISHED"`. **These are the pre-publication candidate contract's recorded fields, not the current GitHub status.** Do not edit or reinterpret the frozen contract to claim a different past state.
- [`release/v022-hosted-app-manifest.json`](../release/v022-hosted-app-manifest.json) preserves the original predeployment `"published": false` / `"deployed": false` evidence. It is not a live indicator of the now-accepted Hosted Production.
- The official distribution record for **AnyClass·课程导入 1.0.0 / Build 1** is separately accepted. Its update manifest remains disabled because no newer Build is offered. Initial distribution and automatic update are different states.
- Older candidate write-ups reflect the specific preparation or test moment, not the current source Release or Hosted Production status.

## Historical privacy and closeout / 历史隐私与结项

- GitHub Support reported PR #1 removal, cache clearance and garbage collection. Public GitHub API readback confirmed PR #1 and its PR-only references are no longer available.
- An independent, fresh mirror audit checked 32 public refs, 126 commits and 1,592 reachable objects. `git fsck --full`, the original approved privacy scanner with the real denylist, and 13/13 independent review gates passed; the 13 previously affected commits were not present in the fresh public reachable graph. **`PUBLIC_REACHABLE_HISTORY=PASS`.**
- Complete deletion of GitHub-provider-internal unreachable objects, hidden caches or hypothetical orphaned data cannot be independently proven. **`PROVIDER_INTERNAL_ERASURE=NOT_PROVEN`**, and the original strict total-erasure privacy gate remains **`BLOCKED / NOT_PROVEN`**, not `PASS`.
- The owner explicitly accepted this *specific, documented, provider-unverifiable residual risk* for the administrative closeout of ISSUE-001 and AnyClass v0.2.2. **`ISSUE001=CLOSED_WITH_DOCUMENTED_RESIDUAL_RISK`** and **`RELEASE_CLOSED=true` under the approved limited exception**. This does not certify absolute erasure, rewrite historical findings, or waive privacy gates for future versions.
- DEC-060 stays independently **`PAUSED / UNVERIFIED`**; any future build, website deployment, Shortcut update or separate engineering phase needs its own approval and validation.

This document describes the current public Stable release only; it does not authorize any build, deployment, privacy cleanup or data mutation.
