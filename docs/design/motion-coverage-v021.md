# AnyClass v0.2.1 Motion Coverage Matrix

This matrix records the ISSUE-030 audit. Classification is semantic: **A** is intentionally immediate, **B** is direct feedback only, **C** uses a localized transition, and **D** was an abrupt or discontinuous defect repaired by ISSUE-030. Native controls and small text/value changes remain immediate unless continuity would otherwise be lost.

| Surface | State change | Class | Current contract |
| --- | --- | --- | --- |
| Welcome | First open | C | Shared dialog entry; reduced motion opens immediately. |
| Welcome | Touch/mouse CTA activation | B | Press feedback only; pointer focus is cleared, so no persistent touch outline remains. |
| Welcome | Keyboard focus/activation | B | A distinct `:focus-visible` ring remains for Tab, Shift+Tab and keyboard activation. |
| Welcome | CTA attention | C | 1900 ms ease-in-out, three finite surface/shadow cycles; stable text, opacity, geometry and hit target. |
| Welcome | Close/cancel/outside click | D→C | Uses the shared dialog exit lifecycle instead of native instant close. |
| Navigation | Route change and Dock destination | C | Progressive View Transition plus scoped progress feedback; native navigation remains authoritative. |
| Dock | Tap, selected state and drag scrub | B/C | Direct press feedback and pointer-linked indicator; drag cancellation restores the active item. |
| Today | Loading/empty/populated | C | One authoritative content reveal after data is ready. |
| Today | Timetable switch | C | One content refresh after the active workspace resolves. Accepted selector-to-holiday spacing is unchanged. |
| Today | Course/status/countdown text updates | A/B | Small values update immediately; refresh/status feedback is localized. |
| Timetable | Initial load and empty/populated switch | C | Page/content reveal after storage resolution. |
| Timetable | Previous/next/current week | D→C | The authoritative grid/list is replaced first, then one container-level reveal runs. Rows are not staggered. |
| Timetable | Card selection | B | Press feedback followed by the course sheet. |
| Course sheet | Open/close | C | Shared 260 ms enter / 190 ms exit lifecycle. |
| Course sheet | Drag, reverse, snap-back and dismiss | C | Gesture-progress-linked transform/scrim; ISSUE-023–026 architecture unchanged. |
| Course sheet | Detail↔course edit | D→C | Hidden-state swap followed by one localized content reveal; focus remains semantic. |
| Course sheet | Detail↔occurrence edit | D→C | Hidden-state swap followed by one localized content reveal; validation remains immediate. |
| Course sheet | Save/cancel/delete/group completion | D→C | Shared content reveal or canonical dialog exit; database completion never waits on animation. |
| Manual course | Create form↔conflict review | D→C | One localized reveal after the target section exists. |
| Conflict dialogs | Open/close and course selection | D→C | Shared dialog exit replaces direct native close. Conflict values and counters remain immediate. |
| Timetable management | Create/delete dialogs | D→C | Shared dialog exit; touch/keyboard focus contracts remain distinct. |
| Timetable management | Switch/status/badge | B | 160 ms transient feedback; the actual selection is immediate. |
| Import | Method switch | D→C | Selected panel becomes authoritative, then one panel-level reveal and targeted scroll run. |
| Import | File selected→preview | C | Existing scoped navigation plus one preview reveal after validation/render. |
| Import | Preview→save result/countdown | C/A | Existing scoped navigation; countdown changes only its stable value node. |
| Import | Exact duplicate/name/conflict review appears | D→C | One reveal only when each review section first becomes visible. |
| Import | Pending editor open/return/apply | D→C | Editor entry gets one reveal; semantic navigation/revalidation remains authoritative. |
| Import | Conflict skip/removal | C | 160 ms semantic exit token, then deterministic semantic destination. |
| Re-import | Review appears | D→C | One content reveal after review data is committed. |
| Settings | Option, checkbox, radio and period value changes | A/B | Native/direct feedback; no delay or decorative animation. |
| Local Data | Metadata editor disclosure | C | Existing bounded disclosure transition with inert collapsed state. |
| Local Data | Small data/status value changes | A/B | Immediate value update with localized status feedback. |
| About / Compatibility | Disclosure and route changes | A/C | Compact native disclosure; route transition is shared. |
| Runtime status | Offline, error, success and warning | B/C | Localized status entry; subsequent stable numeric/text updates do not restart the parent. |
| List changes | Large inserted/removed review content | C | Container-level reveal or semantic exit; no per-row choreography. |
| Native controls | Select/date/checkbox/radio value | A/B | Platform-native immediate behavior and direct press/focus feedback. |

## Consistency and interruption rules

- Feedback uses `--motion-feedback`/`--motion-press`; content replacement uses `--motion-transition`; dialogs use the shared enter/exit lifecycle.
- `AnyClassMotion.reveal()` restarts at most one animation on the authoritative target. Rapid A→B→A changes therefore replace the prior reveal rather than queue animations.
- Dialog close is idempotent, has an animation timeout, and cancels stale close state when reopened.
- `prefers-reduced-motion: reduce` removes nonessential travel and repeated emphasis while preserving final layout, visibility, focus, and all mutations.
- Direct-manipulation sheet motion, ISSUE-027 import scrolling/countdown stability, ISSUE-028 layout repairs, and ISSUE-029 Today spacing are deliberately unchanged.
