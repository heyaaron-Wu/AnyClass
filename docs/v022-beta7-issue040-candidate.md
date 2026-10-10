# v0.2.2-beta.7 local ISSUE-040 candidate

Version: `0.2.2-beta.7`. Build: `v022-beta7-20261009-225018`. Database schema: 4 (unchanged).

This candidate fixes the embedded Bookmark Receiver success countdown so Today is never loaded inside the Receiver iframe. It attempts a standalone first-party Beta page and retains a clear manual “立即前往” fallback when the browser blocks automatic opening. The existing origin, sender and nonce checks remain authoritative for Receiver-to-Bookmark lifecycle messages.

The Beta-only iOS Shortcut distribution link is updated to `https://www.icloud.com/shortcuts/e5464e9969ef4749bfef3882d12134e9`. Stable/Production distribution remains unchanged. Public reachability of the iCloud share page is verified separately; its internal Shortcut payload is not claimed audited by that URL check.

The immutable beta.6 package and its original six candidate-side handoff files are not modified. Their predeployment wording is preserved as audit history; postdeployment proof remains in the separate beta.6 deployment report and Drive readback evidence.

No deployment, GitHub push, PR merge, Stable-client change, installed-Shortcut change, database migration, or user-data operation is part of candidate preparation.
