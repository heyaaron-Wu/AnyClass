# AnyClass Motion System v1

Motion in AnyClass explains interaction, confirms state change, and preserves spatial context. It must be fast, interruptible, input-appropriate, and never the only carrier of meaning. Data-heavy surfaces stay still unless their authoritative content is replaced.

## Reference record

| Reference | Transferable principle | AnyClass application | Rejected or not applicable |
| --- | --- | --- | --- |
| [Apple HIG: Motion](https://developer.apple.com/design/human-interface-guidelines/motion) and [Gestures](https://developer.apple.com/design/human-interface-guidelines/gestures) | Motion is brief, precise, predictable, and never delays access; standard gestures respond immediately and keep an explicit alternative. | Immediate press feedback; direct sheet drag plus a close button; text, focus, color, and ARIA remain authoritative. | visionOS spatial/peripheral-motion guidance and continuous decorative movement. |
| [Microsoft Fluent 2: Motion](https://fluent2.microsoft.design/motion) | Functional, natural, consistent motion uses velocity and weight; avoid surprise and preserve nonvisual feedback. | Semantic tokens, local status reveal, restrained modal/content transitions. | No Fluent brand choreography or inferred numeric tokens. |
| [Atlassian: Motion](https://atlassian.design/foundations/motion) and [Applying motion](https://atlassian.design/foundations/motion/applying-motion) | Interaction commonly fits 50–150ms; transitions 150–400ms; exits are generally faster than entrances. | 100/150ms press/release, 260/190ms sheet enter/exit, 240ms content replacement. | Token names and branded easing are not copied. |
| [IBM Carbon: Motion](https://v10.carbondesignsystem.com/guidelines/motion/overview/) | Separate productive from expressive motion; enter decelerates, exit leaves efficiently; avoid bounce and sudden stops. | Most AnyClass motion is productive; onboarding is finite emphasis. | Decorative expressive motion on schedules and lists. |
| [Material Design 3](https://m3.material.io/) | Tokenize adaptive motion and use physical continuity. | Supports the semantic-token approach only. | Expressive shape morphing and component choreography without a product need. |
| [MDN: View Transition API](https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API) | Progressive enhancement requires a correct nonanimated fallback and careful old/new DOM overlap. | Cross-page transitions remain optional; latest-request guards remain authoritative. | View Transitions never gate navigation or storage state. |
| [MDN: Pointer events](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events) and [touch-action](https://developer.mozilla.org/en-US/docs/Web/CSS/touch-action) | One pointer model, capture during direct manipulation, handle cancellation, and restrict touch ownership narrowly. | The course-sheet handle alone owns its drag; the page and sheet content retain normal scrolling. | Global `touch-action:none` for ordinary content. |
| [MDN: prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion) | Remove or replace nonessential repeated/spatial movement without disabling interaction. | Direct manipulation still follows the pointer; settling becomes immediate; breathing and spatial reveals stop. | Treating reduced motion as disabled interaction. |

## Principles

1. **Interaction truth:** a grabber, chevron, pressed state, selection, or elevation must correspond to real behavior.
2. **Directness:** feedback begins on press; direct manipulation stays attached to the pointer.
3. **Authoritative state first:** animation never exposes stale timetable data or delays errors.
4. **Asymmetric lifecycle:** entrances settle; exits leave more quickly.
5. **Finite emphasis:** attention cues end and return to a stable resting state.
6. **Progressive enhancement:** navigation, dialogs, focus, and persistence work without animation.

## Semantic tokens

| Category | Normal | Reduced |
| --- | --- | --- |
| Direct press/release | 100ms / 150ms; button scale 0.97, icon control scale 0.94 | minimal color/filter state; no required spatial travel |
| Small UI/status | 160–240ms; 4–8px where spatial context helps | immediate or minimal fade |
| Container enter/exit | 260ms / 190ms; 24px in, 20px out | immediate/nonspatial; focus lifecycle unchanged |
| Content replacement | 240ms; 8–10px | immediate replacement |
| Emphasis | onboarding 2.6s × exactly 3 cycles, scale peak 1.018 | static emphasis |
| Direct manipulation | pointer-linked distance; 220ms settle; dismiss at 23% height or 0.65px/ms downward velocity | pointer tracking remains; settle/dismiss animation minimized |

Shared easing roles:

- `--ease-standard`: ordinary state interpolation.
- `--ease-enter`: deceleration into rest.
- `--ease-exit`: efficient departure.
- `--ease-settle`: direct-manipulation completion.
- `--ease-snap-back`: restrained snap-back, without decorative bounce.
- Breathing uses smooth `ease-in-out` because it returns to its starting state.
- Linear easing is reserved for continuous rate-based activity such as a loading spinner.

## Component contracts

- **Buttons:** only actionable controls compress; disabled controls never advertise a press.
- **Dock/tabs:** touch-down feedback is immediate, selection is explicit, and repeated taps do not start persistent animation.
- **Dialogs/sheets:** retain a named close control. On mobile, only the course-detail sheet shows a drag handle because only it supports drag dismissal.
- **Course sheet drag:** begin only from its handle while scroll position is at the top; downward vertical intent wins, horizontal/upward motion does not dismiss; 23% height or 0.65px/ms dismisses; otherwise snap back; close uses the canonical dialog lifecycle.
- **Content:** Today/workspace replacement animates only after authoritative data is ready; refresh revisions cancel stale completion.
- **Status:** motion reinforces text and ARIA status; error and warning text appears immediately.
- **View Transitions:** optional continuity only; the ordinary route remains the fallback.

## Reduced-motion matrix

- Breathing: static primary emphasis.
- Press: immediate nonessential transform may be minimized; activation remains unchanged.
- Sheet open/close: no spatial animation; focus restore and modal containment remain.
- Drag: continues to track the finger because it is direct manipulation; snap-back/settle is immediate.
- Content/page transition: immediate replacement or minimal fade.
- Semantic scrolling: immediate positioning.
- Status: immediate visible text with no required movement.

## Affordance audit

The v1 audit inventories 47 representative affordances across onboarding, Today, Timetable, course detail/editing, occurrence editing, management, Import/Unified Preview/conflicts, Bookmark Receiver, Settings, About, Compatibility, Dock, dialogs, disclosures, form controls, status surfaces, and empty states.

| Class | Count | Meaning |
| --- | ---: | --- |
| A | 40 | Affordance and behavior match. |
| B | 2 | Supported behavior required consistency/accessibility repair. |
| C | 1 | False affordance: generic mobile dialog grabber without drag behavior. |
| D | 4 | Behavior existed but feedback/discoverability was too weak. |
| E | 0 | No unresolved platform-specific mismatch. |

Resolved v1 findings:

- The generic grabber was removed; a real handle is shown only on the draggable course-detail sheet.
- The course-detail handle implements downward pointer-linked dismissal, velocity/displacement decisions, scroll arbitration, snap-back, cancellation cleanup, and no background leakage.
- Icon-only close controls share a circular 44px target, centered glyph, named semantics, focus visibility, Light/Dark styling, and press response.
- Course dialogs explicitly expose modal semantics.
- Finite CTA, press, Dock, content, sheet, and status feedback use the semantic system above.

## Anti-patterns and when not to animate

- No infinite attention loop, bounce, fake vibration, or decorative schedule movement.
- No scaling on a container that is not wholly actionable.
- No per-row animation for large imports, conflict lists, timetable grids, or management lists.
- No motion-only success, warning, error, disabled, selected, or focus state.
- No stale old/new timetable content crossfade.
- No custom gesture without a visible conventional control that performs the same action.
