# R03 -- UX Review: Bubbles Multiplayer App

**Reviewer**: Senior UX Engineer
**Date**: 2026-03-23
**Scope**: First-time experience, visual feedback, interaction design, stealth mode, mobile, accessibility, fun factor, multi-user UX

---

## 1. First-Time User Experience

### F-01: No onboarding or tutorial (Severity: HIGH)

A new user lands on PlacePage and sees a 3D canvas with a custom cursor and a "Blow" button at the bottom. There is zero explanation of:
- What blowing bubbles does
- That holding the button (or spacebar) creates a continuous stream
- That right-click orbits the camera
- That stealth mode exists and what it is for

**Fix**: Add a dismissible first-visit overlay or coach marks. Minimum viable version: a translucent tooltip anchored to the Blow button that reads "Hold to blow bubbles -- right-click drag to look around" and auto-dismisses after the first blow action. Persist dismissal in localStorage.

### F-02: Lobby subtitle is vague (Severity: LOW)

The subtitle "Pick a place and start blowing bubbles together" is the only guidance. It does not mention stealth mode, keyboard shortcuts, or what happens when you enter a place.

**Fix**: Keep the subtitle simple but add a small "How it works" expandable section or a 3-step illustration strip below the header (Pick a place / Blow bubbles / Blow together).

### F-03: Sort labels lack context (Severity: LOW)

The sort pills "lively", "new", "quiet" are cute but may confuse first-timers. "Quiet" in particular sounds like a feature toggle, not a sort order.

**Fix**: Add subtle helper text or icons. "lively" could show a small flame icon, "new" a clock, "quiet" a moon. Or use labels like "Most active", "Newest", "Least active".

---

## 2. Visual Feedback

### V-01: No loading indicator inside the 3D canvas (Severity: MEDIUM)

`VisualMode` renders `<Suspense fallback={null}>` around the entire scene. While assets load, the user stares at a black `#0a0a14` screen with nothing happening. The outer Suspense in PlacePage shows a spinner, but once VisualMode mounts, its internal Suspense shows nothing.

**Fix**: Replace `fallback={null}` with a centered "Loading scene..." text or a simple CSS spinner overlay inside the canvas container div.

### V-02: No feedback when bubble limit is hit (Severity: MEDIUM)

`BubbleControls.spawnBatch` silently stops spawning when the 80-bubble cap is reached. The user keeps holding the button with no indication that nothing is happening.

**Fix**: Show a subtle "max bubbles" indicator when `remaining <= 0`. Could flash the bubble count text in a different color or briefly show "Full! Wait for some to pop."

### V-03: Connection status dot is tiny and unlabeled (Severity: MEDIUM)

The `connectionStatus` indicator is a 2x2 pixel dot (`h-2 w-2`) next to the place name. Color alone conveys state (green/yellow/red). There is a `title` attribute, but no visible label.

**Fix**: Increase to at least `h-2.5 w-2.5`. Add a visible text label on disconnected/connecting states ("Reconnecting..." in yellow text). The `title` tooltip is invisible on touch devices.

### V-04: Activity log error state is swallowed (Severity: LOW)

`ActivityLog` catches fetch errors but only stops the loading spinner. No error message is shown to the user.

**Fix**: Add an error state: "Could not load activity. Tap to retry."

### V-05: "Calculating..." flash in stealth mode is excellent (Severity: POSITIVE)

The brief "Calculating..." status bar flash when a bubble is blown is a clever touch that reinforces the spreadsheet illusion.

---

## 3. Interaction Design

### I-01: Left-click = blow is not discoverable (Severity: HIGH)

In `VisualMode`, left-click on the canvas is disabled for OrbitControls (`LEFT: -1 as any`) and the blow button sits at the bottom. However, clicking/tapping the canvas itself does nothing -- the only way to blow is via the button or spacebar. This is actually fine architecturally, but the custom wand cursor (`cursor: 'none'` + BubbleWandCursor) strongly implies that clicking on the canvas should blow a bubble. The wand follows the mouse pointer and looks interactive, but clicking does nothing.

**Fix**: Either (a) make left-click on the canvas blow a bubble at the cursor position, which would be the most intuitive interaction, or (b) remove the wand cursor to avoid implying canvas-click interactivity. Option (a) is strongly preferred -- it would make the app dramatically more fun.

### I-02: Right-click orbit is undiscoverable (Severity: HIGH)

There is no indication anywhere in the UI that right-click-drag orbits the camera. The only way to discover this is by accident.

**Fix**: Include this in the onboarding overlay (F-01). Also consider adding a small hint icon in the bottom-right corner with orbit/zoom controls listed.

### I-03: Spacebar shortcut conflict risk (Severity: MEDIUM)

The spacebar handler in `BubbleControls` prevents default, which will block page scrolling. It also checks `!(e.target instanceof HTMLInputElement)` but does not check for `textarea`, `select`, `[contenteditable]`, or elements with `role="textbox"`. If the activity log or any future feature includes editable fields, spacebar will blow bubbles instead of typing.

**Fix**: Broaden the exclusion check: `if (e.target instanceof HTMLElement && (e.target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName))) return;`

### I-04: ModeSwitch keyboard listener leaks (Severity: MEDIUM)

`ModeSwitch` registers a keydown listener in `useEffect` but the dependency array is empty (actually, there is no dependency array at all -- the effect runs on every render). This means a new listener is added on every render and removed on unmount, but stale closures of `toggle` accumulate between renders.

**Fix**: Add `[mode, setMode]` to the dependency array, or better, use `useCallback` for `toggle` and pass it as a dependency.

### I-05: No touch gesture for orbit on mobile (Severity: HIGH)

OrbitControls uses `mouseButtons` config but no `touches` config. Three.js OrbitControls defaults: one-finger rotate, two-finger zoom. But since left-click rotate is disabled (`LEFT: -1`), the equivalent one-finger touch behavior is unclear. Users on mobile may not be able to orbit at all, or may orbit when they intend to tap the blow button.

**Fix**: Explicitly configure `touches` on OrbitControls: `touches={{ ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }}`. Test on actual mobile devices.

---

## 4. Stealth Mode UX

### S-01: Convincing spreadsheet illusion -- well executed (Severity: POSITIVE)

The stealth mode is impressively thorough: green Excel title bar, fake menu bar with realistic menu items, toolbar with clipboard/formatting buttons, formula bar, sheet tabs, status bar with "Rows", "Active", "Sum" stats, and "Calculating..." flash. The column headers (Timestamp, Status, Assignee, Task, Priority, Category, Notes) map bubble data to plausible work terminology. This is genuinely clever.

### S-02: Menu item "Switch to Presentation Mode" breaks the illusion (Severity: MEDIUM)

Under View menu, the label "Switch to Presentation Mode" is passable but slightly unusual for Excel. The real Excel equivalent would be "Normal" / "Page Layout" / "Page Break Preview" -- none of which match.

**Fix**: Rename to "Full Screen View" or "Slide View" which are closer to real spreadsheet vocabulary while still hinting at the visual mode.

### S-03: Blow/Pop buttons are visually distinct from other toolbar buttons (Severity: MEDIUM)

The "Blow Bubble" button has a blue tint (`bg-[#eff6ff]`, `border-[#93c5fd]`) and the "Pop Bubble" button has a red tint (`bg-[#fef2f2]`, `border-[#fca5a5]`). These colored buttons stand out from the otherwise neutral toolbar, which could raise suspicion from a passing observer.

**Fix**: Style them identically to other toolbar buttons (neutral gray background, same border). The bubble emoji can stay since it is small, or replace with a generic icon (e.g., a "+" for Insert Row, a trash can for Delete Row).

### S-04: Browser tab title not disguised (Severity: MEDIUM)

The page title likely still says "Bubbles" or the place name. A coworker glancing at the taskbar would see a non-work title.

**Fix**: When stealth mode is active, set `document.title` to "Task Tracker -- Q1 Operations.xlsx" to match the title bar.

### S-05: Favicon not disguised (Severity: LOW)

The browser favicon probably shows the app's bubble icon. Combined with the tab title, this could blow cover.

**Fix**: When in stealth mode, dynamically swap the favicon to a generic spreadsheet icon (green "X" on white).

### S-06: Sheet tabs include "Users" and "Places" (Severity: LOW)

The SheetTabs component shows tabs that correspond to real app entities. "Users" is fine (could be a team roster), but "Places" is slightly unusual. Both are acceptable but could be more convincing.

**Fix**: Rename to "Team", "Projects", or "Departments" for deeper camouflage.

---

## 5. Mobile UX

### M-01: Blow button may overlap safe area on notched devices (Severity: MEDIUM)

`BubbleControls` uses `position: fixed; bottom: 24px`. On iPhones with home indicators, 24px is not enough to clear the safe area. The button could sit partially behind the home bar.

**Fix**: Use `env(safe-area-inset-bottom)` in the bottom offset: `bottom: calc(24px + env(safe-area-inset-bottom))`. Or use Tailwind's `pb-safe` if configured.

### M-02: Stealth mode is not usable on small screens (Severity: HIGH)

The spreadsheet layout with 7 columns (A-G), a toolbar, menu bar, formula bar, and status bar is designed for desktop. On a phone screen (~375px wide), columns will be crushed to unreadable widths, toolbar buttons will overflow, and the illusion will break entirely.

**Fix**: Either (a) disable stealth mode on screens < 768px and show a message like "Stealth mode works best on desktop", or (b) create a simplified mobile stealth view (e.g., a fake email or messaging app instead of a spreadsheet).

### M-03: PlacePage header is crowded on mobile (Severity: MEDIUM)

The header packs: back button, place name, connection dot, user dots (up to 8), activity log button, and mode switch toggle. On a 375px screen, user dots will consume significant space and the layout will likely wrap or overflow.

**Fix**: On mobile, collapse user dots into a single avatar with a count badge. Move the mode switch into a hamburger or settings drawer.

### M-04: Activity log mobile drawer needs swipe-to-dismiss (Severity: LOW)

The `ActivityLog` component shows as a bottom sheet on mobile (`fixed bottom-0 left-0 right-0 max-h-[60vh]`). It can only be closed by tapping the X button or the backdrop. No drag-to-dismiss gesture.

**Fix**: Add a drag handle at the top of the sheet and implement swipe-down-to-close. This is expected mobile behavior.

### M-05: Custom cursor is pointless on touch devices (Severity: LOW)

`VisualMode` sets `cursor: 'none'` and renders a 3D wand cursor. On touch devices there is no persistent cursor, making the wand invisible. This is harmless but the `cursor: 'none'` style is unnecessary on touch.

**Fix**: Only apply `cursor: 'none'` when `matchMedia('(pointer: fine)')` is true.

---

## 6. Accessibility

### A-01: No focus indicators on critical interactive elements (Severity: HIGH)

The blow button in `BubbleControls` uses inline styles with no `:focus-visible` outline. Sort pills in LobbyPage use Tailwind classes but no explicit focus ring. The mode switch toggle and activity log button rely on browser defaults which may be suppressed.

**Fix**: Add `focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2` to all interactive elements, or ensure the global styles do not suppress native focus rings.

### A-02: 3D canvas is a keyboard trap (Severity: HIGH)

Once focus enters the Canvas area, there is no way to Tab out to the blow button or header controls. The Canvas element itself is not focusable, so keyboard-only users may get stuck or be unable to reach controls.

**Fix**: Ensure the blow button and header controls are in the natural tab order and reachable. Add `tabIndex={0}` to the blow button (it is a `<button>` so it should be focusable, but verify the Canvas does not steal focus). Consider adding a skip link.

### A-03: Bubble count and status changes have no screen reader announcements (Severity: MEDIUM)

When bubbles are blown, the count text updates silently. Screen reader users have no feedback that their action worked.

**Fix**: Add `aria-live="polite"` to the bubble count display. Also add a visually hidden announcement div with `role="status"` for events like "Bubble blown" and "Bubble popped".

### A-04: Color-only differentiation for connection status (Severity: MEDIUM)

The connection status dot uses color alone (green/yellow/red) to communicate state. No shape, icon, or text alternative beyond a `title` attribute (which is inaccessible to screen readers and invisible on mobile).

**Fix**: Add `aria-label` to the status dot. Consider adding a small text label for non-connected states.

### A-05: PlaceCard uses only color dots for user count visualization (Severity: LOW)

The colored dots showing users in `PlaceCard` are decorative and accompanied by text ("3 users"), so this is acceptable. But the dots themselves have no alt text.

**Fix**: Add `aria-hidden="true"` to the dot container since the text already conveys the information.

### A-06: Stealth mode has no reduced motion support (Severity: LOW)

The "Calculating..." flash and spreadsheet row highlight animations do not respect `prefers-reduced-motion`. The visual mode float animations in CSS also lack this check.

**Fix**: Wrap animations in `@media (prefers-reduced-motion: no-preference)` or add Tailwind's `motion-safe:` prefix.

---

## 7. Fun Factor

### FUN-01: Blowing feels disconnected from the visual result (Severity: HIGH)

The blow button at the bottom of the screen spawns bubbles at random positions in the 3D scene. There is no spatial relationship between where you click/point and where bubbles appear. The wand cursor follows your mouse but bubbles spawn at `Math.random()` coordinates. This breaks the core interaction metaphor.

**Fix**: Spawn bubbles at or near the wand cursor position. Use raycasting to determine the 3D position under the cursor and spawn bubbles there. This single change would dramatically increase the satisfaction of the interaction.

### FUN-02: No sound effects (Severity: MEDIUM)

Blowing and popping bubbles are entirely silent. Sound is a huge component of satisfaction in bubble interactions -- the gentle "pop" and the airy "whoosh" of blowing.

**Fix**: Add optional sound effects (off by default to avoid startling users in stealth mode). Suggested: a soft blow/whoosh sound, a satisfying pop, and a subtle ambient hum. Use Web Audio API for low-latency playback. Mute automatically when stealth mode is active.

### FUN-03: All bubbles use the same color (Severity: MEDIUM)

`BubbleControls.startBlowing` hardcodes `BUBBLE_COLORS[1]` for all locally-blown bubbles. Users cannot choose their color in visual mode -- the color picker only exists in stealth mode's toolbar.

**Fix**: Add a small color palette near the blow button, or let the user's assigned color (from their profile/session) determine bubble color. The `tint()` function adds slight variation which is good, but the base color should be user-selectable.

### FUN-04: Pop interaction is satisfying (Severity: POSITIVE)

The `PopEffect` with custom shaders, particle physics (gravity, variable velocity, color variation), and additive blending is well-crafted. The particles feel physical and the effect is appropriately brief (0.6s).

### FUN-05: No combo/streak rewards (Severity: LOW)

Blowing many bubbles in succession has no escalating reward. There is no streak counter, no visual escalation, no "bubble chain" effect.

**Fix**: Add a simple streak counter that appears after 10+ continuous bubbles. Could show progressively larger/more colorful bubbles, or a brief "Nice!" / "Bubble frenzy!" floating text.

### FUN-06: Wand cursor is a lovely detail (Severity: POSITIVE)

The 3D wand with torus ring, cylindrical handle, and subtle glow is charming and on-theme. The lerp smoothing (`0.2`) gives it a pleasant floaty feel.

---

## 8. Multi-User UX

### MU-01: Cannot tell who blew which bubble (Severity: HIGH)

In visual mode, bubbles spawn with color tinting but there is no label, glow ring, or other indicator showing which user blew each bubble. The `blownBy` field is stored in `BubbleInfo` but not rendered in `BubbleMesh` (not reviewed here but implied by the data flow).

**Fix**: Add a subtle name label or colored ring at the base of each bubble showing the blower's display name. The label could appear on hover/tap to avoid clutter.

### MU-02: User presence dots are too subtle (Severity: MEDIUM)

Online users are shown as 2.5px colored dots in the header. In the 3D view, `UserPresence` renders floating glowing spheres with name labels, which is good. But the header dots are easy to miss.

**Fix**: Replace header dots with small avatar circles (initials or a generated pattern) at 20-24px size. Show display names on hover.

### MU-03: No indication when another user blows a bubble (Severity: MEDIUM)

When a remote user blows a bubble, it appears silently in the scene. There is no toast, sound, or visual flourish to indicate "Alex just blew 3 bubbles."

**Fix**: Add a subtle floating notification near the bubble origin or a brief entry in a live feed ticker. In stealth mode, new rows from other users already appear with highlighting, which is good.

### MU-04: User join/leave is only visible in stealth mode (Severity: MEDIUM)

`StealthMode` tracks join/leave events and shows them as spreadsheet rows. In visual mode, the `UserPresence` component adds/removes dots, but there is no toast or animation to highlight a new arrival or departure.

**Fix**: Add a brief toast or floating notification: "Alex joined" / "Alex left". Keep it subtle to avoid disrupting the meditative bubble experience.

### MU-05: No user identity setup (Severity: MEDIUM)

The system uses `sessionId: 'local'` and `displayName: 'You'` for the current user (in `BubbleControls`). There is no flow for choosing a display name before entering a place.

**Fix**: Prompt for a display name on first visit (or generate a fun random one like "Bubbly Otter"). Store in localStorage. Allow editing from the header.

### MU-06: 8-user dot limit is arbitrary but reasonable (Severity: LOW)

The header shows up to 8 user dots with a "+N" overflow indicator. This is a reasonable design choice for a compact header. No change needed, but consider a popover on click to show the full user list.

---

## Summary by Severity

### HIGH (action required)
| ID | Area | Issue |
|---|---|---|
| F-01 | Onboarding | No tutorial or first-use guidance |
| I-01 | Interaction | Wand cursor implies click-to-blow but clicking does nothing |
| I-02 | Interaction | Right-click orbit is undiscoverable |
| I-05 | Mobile | Touch orbit behavior undefined |
| M-02 | Mobile | Stealth mode unusable on small screens |
| A-01 | Accessibility | No focus indicators on key controls |
| A-02 | Accessibility | Canvas may be a keyboard trap |
| FUN-01 | Fun | Bubbles spawn at random positions, not cursor position |
| MU-01 | Multi-user | Cannot identify who blew which bubble |

### MEDIUM (should fix)
| ID | Area | Issue |
|---|---|---|
| V-01 | Feedback | No loading state inside 3D canvas |
| V-02 | Feedback | No feedback at 80-bubble cap |
| V-03 | Feedback | Connection status dot is tiny/unlabeled |
| I-03 | Interaction | Spacebar shortcut conflict risk |
| I-04 | Interaction | ModeSwitch effect has no dependency array |
| S-02 | Stealth | "Presentation Mode" label is slightly off |
| S-03 | Stealth | Blow/Pop buttons visually stand out |
| S-04 | Stealth | Browser tab title not disguised |
| M-01 | Mobile | Blow button may overlap safe area |
| M-03 | Mobile | Header crowded on mobile |
| A-03 | Accessibility | No screen reader announcements for actions |
| A-04 | Accessibility | Color-only connection status |
| FUN-02 | Fun | No sound effects |
| FUN-03 | Fun | Bubble color is hardcoded |
| MU-02 | Multi-user | User dots too subtle in header |
| MU-03 | Multi-user | No notification for remote user bubbles |
| MU-04 | Multi-user | User join/leave not announced in visual mode |
| MU-05 | Multi-user | No display name setup flow |

### LOW (nice to have)
| ID | Area | Issue |
|---|---|---|
| F-02 | Onboarding | Lobby subtitle is vague |
| F-03 | Onboarding | Sort labels lack context |
| V-04 | Feedback | Activity log swallows errors |
| S-05 | Stealth | Favicon not disguised |
| S-06 | Stealth | Sheet tab names slightly off |
| M-04 | Mobile | Activity log needs swipe-to-dismiss |
| M-05 | Mobile | Custom cursor pointless on touch |
| A-05 | Accessibility | User dots missing aria-hidden |
| A-06 | Accessibility | No reduced-motion support |
| FUN-05 | Fun | No combo/streak rewards |
| MU-06 | Multi-user | 8-dot limit is fine |

### POSITIVE (keep doing this)
| ID | Area | What works |
|---|---|---|
| V-05 | Stealth | "Calculating..." flash is clever |
| S-01 | Stealth | Spreadsheet illusion is thorough and convincing |
| FUN-04 | Fun | Pop particle effect is satisfying |
| FUN-06 | Fun | Wand cursor is charming |

---

## Top 3 Impact Recommendations

1. **Make bubbles spawn at cursor position** (FUN-01 + I-01): This single change transforms the app from "press button, stuff happens somewhere" to "I am blowing bubbles exactly where I point." Combined with making left-click on the canvas actually blow, this would be the biggest UX improvement possible.

2. **Add first-visit onboarding** (F-01 + I-02): A simple dismissible overlay explaining the three core interactions (click/hold to blow, right-drag to orbit, Ctrl+Shift+M for stealth) would eliminate the majority of first-use confusion.

3. **Show who blew what** (MU-01 + MU-03): Adding per-bubble attribution (name label on hover) and arrival notifications would transform this from a single-player-feeling experience into a genuinely social one. The data is already there in `blownBy` -- it just needs to be surfaced in the visual layer.
