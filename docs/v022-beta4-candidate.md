# v0.2.2-beta.4 local candidate

Build: `v022-beta4-20261009-144828`. Database schema: 4.

This local candidate integrates AC-REQ-026 client clock capture and the existing
Bookmarklet floating Receiver window with Unified Import Preview. It has not
been deployed or promoted to Stable.

Only explicit, valid single-period clock ranges on the authorized source page
define per-period times. Period numbers alone never imply clock times. Missing
times use AnyClass defaults and the preview displays “请核对上课时间” before save.
User edits take precedence; replacing an existing customized timetable's times
requires an explicit choice. Invalid supplied times fail visibly.

The popup provides Close, Escape, retry, live status, theme and safe-area support.
Closing or rerunning with unsaved preview data requires confirmation. A transport
ACK is not a save. Successful-save status follows the shared save/readback path.
Cancel returns to the source page. The popup does not implement its own storage.

Previously saved static Bookmarklet URLs must be replaced to receive the new
popup behavior. Beta and Stable generation remain separate; Stable assets in a
local release set are review artifacts, not a promotion. The manual iOS Shortcut
script preserves `completion()` and is delivered as a complete UTF-8 file. Its
target URL remains configured in the Shortcut's separate URL action.

Physical Safari acceptance remains required for the real school's period-only
capture, default labeling, time verification/editing, save/readback, popup focus,
scrolling, dismissal and safe areas. Synthetic clock fixtures do not establish
real-school HH:mm availability. Historical ISSUE-031 intermittent failure cause
remains unproven. Frozen beta.2 and beta.3 evidence must remain unchanged.
