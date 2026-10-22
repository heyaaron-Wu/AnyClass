# v0.2.2-beta.5 local candidate

Build: `v022-beta5-20261009-164038`. Database schema: 4.

This isolated candidate polishes the existing floating Bookmarklet / Receiver
composition without changing capture, validation or storage semantics.
The outer status layer uses the existing import typography and shell palette.
Entry focus goes to the dialog container, not the Close control; keyboard
focus-visible remains distinct. Ordinary source-page button shadows are reset.

Homogeneous per-period provenance is summarized once, with all effective HH:mm
values retained. Mixed-source rows keep individual labels, including default
fills. The “请核对上课时间” notice and explicit preserve/replace choices remain.
Shared SUCCESS state hides unrelated method cards; starting a new preview or
returning to IDLE restores them. Save, readback and Today behavior are unchanged.

The embedded Receiver intentionally removes the page-shell marker. Its desktop
error heading now resolves the existing foreground token without that marker,
and its validation message uses the established dark-theme error foreground.
Both states have permanent rendered-contrast coverage, not only DOM assertions.

Browser evidence uses synthetic intercepted pages, not real-school clock data
or physical iPhone Safari. The real school has no verified explicit HH:mm.
Physical acceptance must cover period-only capture, default labels, preview
editing/save/readback, popup dismissal/focus/scroll and safe areas.

Previously saved static Bookmarklet URLs must be replaced to receive new shell
styles after an authorized distribution/deployment. Local Beta/Stable generation
does not promote either channel. The complete iOS Shortcut remains v2-c-phase4;
its JavaScript and completion contract are unchanged. No installed Shortcut is
updated automatically.

Frozen beta.2, beta.3 and beta.4 candidates are preserved. Historical ISSUE-031
intermittent failure cause remains unproven; fresh successful cycles do not
explain it. This candidate requires separate Beta deployment authorization.
